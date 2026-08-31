import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  classifyDecibelPrecommittedTransactionRecoveryV1,
  decibel_precommitted_transaction_journal_v1,
  proveFullExecutionRemainderZeroV1,
} from '../src/decibel_precommitted_transaction_finality_recovery_v1.js';

const hash = `0x${'1'.repeat(64)}`;
const identity = {
  transactionPurpose: 'PLACE_CANARY_ORDER' as const,
  transactionHash: hash,
  replayProtectionNonce: '123',
  expirationTimestamp: 200,
  chainId: 1,
  sender: 'sender',
  entryFunction: '0xpackage::dex_accounts_entry::place_order_to_subaccount',
  clientOrderId: 'client-1',
  market: 'btc',
  subaccount: 'sub',
  signedAt: 100,
  hashDurableAt: 101,
};

function journal() {
  return new decibel_precommitted_transaction_journal_v1(
    join(mkdtempSync(join(tmpdir(), 'decibel-precommit-')), 'journal.sqlite'),
  );
}

function classify(
  overrides: Partial<Parameters<typeof classifyDecibelPrecommittedTransactionRecoveryV1>[0]> = {},
) {
  return classifyDecibelPrecommittedTransactionRecoveryV1({
    transaction: identity,
    lookupAttempts: 1,
    lookupStatus: 'NOT_FOUND',
    ledgerTimestamp: 150,
    successfulCancelNeutralizationSemanticsProven: false,
    ...overrides,
  });
}

describe('Decibel Precommitted Transaction Finality Recovery V1', () => {
  it('requires the exact transaction hash to be durable before submission authorization', () => {
    const store = journal();
    expect(() => store.authorizeExactSubmission(hash)).toThrow(
      'DECIBEL_TRANSACTION_HASH_NOT_DURABLE_BEFORE_SUBMIT',
    );
    store.commitSignedIdentity(identity);
    expect(store.authorizeExactSubmission(hash)).toMatchObject({
      transactionHash: hash,
      finalClassification: 'SIGNED_AND_DURABLE',
      liveExecutionEnabled: false,
    });
    store.close();
  });

  it('fails closed when the submission response hash conflicts', () => {
    const store = journal();
    store.commitSignedIdentity(identity);
    expect(() =>
      store.recordSubmitted({
        expectedTransactionHash: hash,
        submittedTransactionHash: `0x${'2'.repeat(64)}`,
        submittedAt: 102,
      }),
    ).toThrow('DECIBEL_TRANSACTION_HASH_IDENTITY_CONFLICT');
    expect(classify({ submittedResponseHash: `0x${'2'.repeat(64)}` }).finalClassification).toBe(
      'TRANSACTION_IDENTITY_CONFLICT',
    );
    store.close();
  });

  it('is idempotent for the same durable identity and rejects conflicting identity', () => {
    const store = journal();
    store.commitSignedIdentity(identity);
    store.commitSignedIdentity(identity);
    expect(() => store.commitSignedIdentity({ ...identity, market: 'eth' })).toThrow(
      'DECIBEL_PRECOMMITTED_TRANSACTION_IDENTITY_CONFLICT',
    );
    store.close();
  });

  it('keeps not-found before expiry ambiguous and never resubmits', () => {
    expect(classify()).toMatchObject({
      finalClassification: 'NOT_FOUND_BEFORE_EXPIRY',
      exposureNeutralized: false,
      automaticResubmissionPermitted: false,
    });
  });

  it('proves an expired, uncommitted exact transaction can no longer mutate state', () => {
    expect(classify({ ledgerTimestamp: 201 })).toMatchObject({
      finalClassification: 'TRANSACTION_STATE_UNKNOWN',
    });
    expect(classify({ ledgerTimestamp: 201, absenceObservedThroughExpiry: true })).toMatchObject({
      finalClassification: 'EXPIRED_UNCOMMITTED',
      automaticResubmissionPermitted: false,
    });
  });

  it('records committed place success and atomic abort classifications', () => {
    expect(
      classify({ lookupStatus: 'COMMITTED', success: true, committedVersion: 10 }),
    ).toMatchObject({ finalClassification: 'COMMITTED_SUCCESS', committedVersion: 10 });
    expect(
      classify({ lookupStatus: 'COMMITTED', success: false, vmStatus: 'Move abort' }),
    ).toMatchObject({
      finalClassification: 'COMMITTED_ABORT_AUTHORITATIVE_NO_MUTATION',
      exposureNeutralized: false,
    });
  });

  it('neutralizes cancel only with proven success semantics or authoritative no-market abort', () => {
    const cancel = { ...identity, transactionPurpose: 'UNKNOWN_ORDER_EMERGENCY_CANCEL' as const };
    expect(
      classify({ transaction: cancel, lookupStatus: 'COMMITTED', success: true }),
    ).toMatchObject({ finalClassification: 'COMMITTED_SUCCESS', exposureNeutralized: false });
    expect(
      classify({
        transaction: cancel,
        lookupStatus: 'COMMITTED',
        success: true,
        successfulCancelNeutralizationSemanticsProven: true,
      }).exposureNeutralized,
    ).toBe(true);
    expect(
      classify({
        transaction: cancel,
        lookupStatus: 'COMMITTED',
        success: false,
        decodedAbort: 'E_MARKET_NOT_FOUND',
      }).exposureNeutralized,
    ).toBe(true);
  });

  it('keeps an ambiguous cancel abort unresolved', () => {
    expect(
      classify({
        transaction: { ...identity, transactionPurpose: 'UNKNOWN_ORDER_EMERGENCY_CANCEL' },
        lookupStatus: 'COMMITTED',
        success: false,
        vmStatus: 'EMARKET_HALTED',
      }),
    ).toMatchObject({
      finalClassification: 'COMMITTED_ABORT_EXPOSURE_AMBIGUOUS',
      exposureNeutralized: false,
    });
  });

  it('persists a committed result exactly once and rejects contradictory replay', () => {
    const store = journal();
    store.commitSignedIdentity(identity);
    const result = classify({ lookupStatus: 'COMMITTED', success: true, committedVersion: 10 });
    store.recordResolution(result, 300);
    store.recordResolution(result, 300);
    expect(() =>
      store.recordResolution(
        classify({ lookupStatus: 'COMMITTED', success: false, committedVersion: 10 }),
        300,
      ),
    ).toThrow('DECIBEL_TRANSACTION_COMMITTED_RESULT_CONFLICT');
    store.close();
  });

  it('proves full execution leaves no remainder only with conserved exact quantity', () => {
    expect(
      proveFullExecutionRemainderZeroV1({
        requestedQuantity: '0.1',
        authenticatedFillQuantity: '0.1',
        quantityConservationProven: true,
      }),
    ).toBe(true);
    expect(
      proveFullExecutionRemainderZeroV1({
        requestedQuantity: '0.1',
        authenticatedFillQuantity: '0.09',
        quantityConservationProven: true,
      }),
    ).toBe(false);
  });
});
