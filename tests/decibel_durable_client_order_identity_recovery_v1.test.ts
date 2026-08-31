import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  DecibelDurableClientOrderIdentityRecoveryAuditV1,
  decibel_execution_submission_journal_v1,
  generateDecibelCanaryClientOrderIdV1,
  recoverDecibelOrderIdentityByClientOrderIdV1,
  type decibel_submission_prepared_record_v1,
} from '../src/decibel_durable_client_order_identity_recovery_v1.js';

function prepared(): decibel_submission_prepared_record_v1 {
  return {
    executionSessionId: 's1',
    localExecutionRequestId: 'r1',
    clientOrderId: 'dcv1-b-1-abc',
    account: 'account',
    market: 'market',
    side: 'BUY',
    price: '100',
    quantity: '0.001',
    timeInForce: 'PostOnly',
    strategyConfigId: 'cfg',
    createdAt: 1,
    journalSequence: 1,
  };
}
function journal() {
  return new decibel_execution_submission_journal_v1(
    join(mkdtempSync(join(tmpdir(), 'decibel-journal-')), 'journal.sqlite'),
  );
}

describe('Decibel Durable Client-Order Identity Recovery V1', () => {
  it('generates deterministic distinct conservative client IDs', () => {
    const input = {
      executionSessionId: 'session',
      localOrderSequence: 1,
      marketIdentity: 'btc',
      strategyConfigId: 'cfg',
      side: 'BUY' as const,
    };
    const first = generateDecibelCanaryClientOrderIdV1(input);
    expect(generateDecibelCanaryClientOrderIdV1(input)).toBe(first);
    expect(generateDecibelCanaryClientOrderIdV1({ ...input, localOrderSequence: 2 })).not.toBe(
      first,
    );
    expect(generateDecibelCanaryClientOrderIdV1({ ...input, side: 'SELL' })).not.toBe(first);
    expect(first).toMatch(/^[a-z0-9-]+$/);
    expect(first.length).toBeLessThanOrEqual(48);
  });

  it('durably commits PREPARED before submission is eligible and survives reopen', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-journal-')), 'journal.sqlite');
    const first = new decibel_execution_submission_journal_v1(path);
    expect(first.canInvokeSubmission('r1')).toBe(false);
    first.prepare(prepared());
    expect(first.canInvokeSubmission('r1')).toBe(true);
    first.close();
    const reopened = new decibel_execution_submission_journal_v1(path);
    expect(reopened.latest('r1')?.state).toBe('PREPARED');
    reopened.close();
  });

  it('blocks submission when PREPARED persistence fails', () => {
    const repository = journal();
    repository.prepare(prepared());
    expect(() =>
      repository.prepare({ ...prepared(), localExecutionRequestId: 'r2', journalSequence: 2 }),
    ).toThrow('PERSIST_FAILED');
    expect(repository.canInvokeSubmission('r2')).toBe(false);
    repository.close();
  });

  it('moves transport uncertainty to recovery and never permits resubmission', () => {
    const repository = journal();
    repository.prepare(prepared());
    repository.append({
      eventId: 'e2',
      executionSessionId: 's1',
      localExecutionRequestId: 'r1',
      clientOrderId: prepared().clientOrderId,
      journalSequence: 2,
      state: 'SUBMISSION_STARTED',
      recordedAt: 2,
      venueOrderId: null,
      transactionHash: null,
      recoverySource: null,
    });
    repository.append({
      eventId: 'e3',
      executionSessionId: 's1',
      localExecutionRequestId: 'r1',
      clientOrderId: prepared().clientOrderId,
      journalSequence: 3,
      state: 'RECOVERY_REQUIRED',
      recordedAt: 3,
      venueOrderId: null,
      transactionHash: null,
      recoverySource: null,
    });
    expect(repository.canInvokeSubmission('r1')).toBe(false);
    expect(repository.canPlaceAnyNewOrder()).toBe(false);
    repository.close();
  });

  it.each(['Open', 'Filled', 'Cancelled'] as const)(
    'recovers exact %s order by client ID',
    async (status) => {
      const result = await recoverDecibelOrderIdentityByClientOrderIdV1({
        prepared: prepared(),
        journalState: 'RECOVERY_REQUIRED',
        maximumLookupAttempts: 2,
        lookup: (query) => {
          expect(query).toEqual({
            account: 'account',
            market: 'market',
            client_order_id: prepared().clientOrderId,
            asset_type: 'perp',
          });
          return Promise.resolve({
            account: 'account',
            market: 'market',
            assetType: 'perp',
            clientOrderId: prepared().clientOrderId,
            venueOrderId: 'venue-1',
            side: 'BUY',
            price: '100',
            quantity: '0.001',
            timeInForce: 1,
            status,
          });
        },
      });
      expect(result.recoveredVenueOrderId).toBe('venue-1');
      expect(result.recoveryClassification).toBe(
        status === 'Open' ? 'RECOVERED_ACCEPTED_ORDER' : 'RECOVERED_TERMINAL_ORDER',
      );
      expect(result.readyForExistingFillAndPositionReconciliation).toBe(true);
      expect(result.automaticResubmissionPermitted).toBe(false);
    },
  );

  it.each([
    { account: 'wrong' },
    { market: 'wrong' },
    { clientOrderId: 'wrong' },
    { timeInForce: 0 as 1 },
  ])('rejects recovery conflict %#', async (changed) => {
    const result = await recoverDecibelOrderIdentityByClientOrderIdV1({
      prepared: prepared(),
      journalState: 'RECOVERY_REQUIRED',
      maximumLookupAttempts: 1,
      lookup: () =>
        Promise.resolve({
          account: 'account',
          market: 'market',
          assetType: 'perp',
          clientOrderId: prepared().clientOrderId,
          venueOrderId: 'venue-1',
          side: 'BUY',
          price: '100',
          quantity: '0.001',
          timeInForce: 1,
          status: 'Open',
          ...changed,
        }),
    });
    expect(result.recoveryClassification).toBe('CLIENT_ORDER_RECOVERY_CONFLICT');
    expect(result.readyForExistingFillAndPositionReconciliation).toBe(false);
  });

  it('treats temporary and exhausted misses as ambiguous, never not-submitted', async () => {
    let attempts = 0;
    const result = await recoverDecibelOrderIdentityByClientOrderIdV1({
      prepared: prepared(),
      journalState: 'RECOVERY_REQUIRED',
      maximumLookupAttempts: 2,
      lookup: () => {
        attempts += 1;
        return Promise.resolve(null);
      },
    });
    expect(attempts).toBe(2);
    expect(result.recoveryClassification).toBe('AMBIGUOUS_ORDER_SUBMISSION_STATE');
    expect(result.automaticResubmissionPermitted).toBe(false);
  });

  it('rejects conflicting venue mappings append-only', () => {
    const repository = journal();
    repository.prepare(prepared());
    repository.append({
      eventId: 'e2',
      executionSessionId: 's1',
      localExecutionRequestId: 'r1',
      clientOrderId: prepared().clientOrderId,
      journalSequence: 2,
      state: 'SUBMISSION_STARTED',
      recordedAt: 2,
      venueOrderId: null,
      transactionHash: null,
      recoverySource: null,
    });
    repository.append({
      eventId: 'e3',
      executionSessionId: 's1',
      localExecutionRequestId: 'r1',
      clientOrderId: prepared().clientOrderId,
      journalSequence: 3,
      state: 'ACKNOWLEDGED',
      recordedAt: 3,
      venueOrderId: 'venue-1',
      transactionHash: 'tx',
      recoverySource: null,
    });
    expect(() =>
      repository.append({
        eventId: 'e4',
        executionSessionId: 's1',
        localExecutionRequestId: 'r1',
        clientOrderId: prepared().clientOrderId,
        journalSequence: 4,
        state: 'TERMINAL',
        recordedAt: 4,
        venueOrderId: 'venue-2',
        transactionHash: 'tx',
        recoverySource: null,
      }),
    ).toThrow('MULTIPLE_VENUE_ORDER_CONFLICT');
    repository.close();
  });

  it('keeps current readiness partial because terminal retention/visibility are unproven', () => {
    const audit = DecibelDurableClientOrderIdentityRecoveryAuditV1;
    expect(audit.preSubmissionDurability).toBe('PROVEN');
    expect(audit.clientOrderIdRecovery).toBe('PARTIAL');
    expect(audit.canaryOrderLineageDurability).toBe('PARTIAL');
    expect(audit.minimalLiveCanaryReconciliationReady).toBe(false);
    expect(audit.generalAuthenticatedReconciliationReady).toBe(false);
    expect(audit.liveExecutionEnabled).toBe(false);
    expect(audit.signerInitialized).toBe(false);
  });
});
