import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { decibel_minimal_live_canary_journal_v1 } from '../src/decibel_minimal_live_canary_journal_v1.js';
import {
  DECIBEL_MINIMAL_LIVE_CANARY_OPERATOR_HANDOFF_V1,
  type decibel_minimal_live_canary_operator_handoff_v1,
} from '../src/decibel_minimal_live_canary_operator_handoff_v1.js';
import {
  DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  createDecibelMinimalLiveCanaryConfigurationV1,
  planDecibelMinimalLiveCanaryV1,
} from '../src/decibel_minimal_live_canary_v1.js';

function fixture() {
  const configuration = createDecibelMinimalLiveCanaryConfigurationV1({
    canaryId: 'canary-journal-1',
    executionSessionId: 'session-journal-1',
    account: '0xcanary',
    subaccount: '0xcanary',
    network: 'mainnet',
    market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    side: 'BUY',
    observationTimeoutMs: 60_000,
    executionRecoveryTimeoutMs: 120_000,
    strategyConfigId: 'strategy-1',
  });
  const plan = planDecibelMinimalLiveCanaryV1({
    configuration,
    persistedConfigHash: null,
    placementTransactionCount: 0,
    venueOrderCount: 0,
    preflight: {
      authenticatedAccount: '0xcanary',
      configuredNetwork: 'mainnet',
      observedNetwork: 'mainnet',
      market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      metadataFresh: true,
      marketOperational: true,
      tickSize: 0.5,
      lotSize: 0.001,
      minimumOrderSize: 0.001,
      minimumMetadataValidQuantity: 0.001,
      bestBid: 100,
      bestAsk: 100.5,
      exactMarketIdentity: true,
      authoritativeNoOpenPosition: true,
      dedicatedSubaccount: true,
      unresolvedExecutionJournalCount: 0,
      unexpectedOpenStrategyActivityCount: 0,
      activeTpSlCount: 0,
      activeTwapCount: 0,
      activeBulkOrderCount: 0,
      expectedDelegatedOrManualActivity: false,
      journalHealthy: true,
    },
  });
  return { configuration, plan };
}

describe('Decibel Minimal Live Canary durable journal V1', () => {
  it('restores the same canary and hash after reopen and prevents a second unresolved canary', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-canary-')), 'journal.sqlite');
    const value = fixture();
    const first = new decibel_minimal_live_canary_journal_v1(path);
    first.prepare({ ...value, preparedAt: 1 });
    first.recordTransactionIdentity({
      canaryId: value.configuration.canaryId,
      canaryConfigHash: value.configuration.configHash,
      purpose: 'PLACE_CANARY_ORDER',
      transactionHash: `0x${'a'.repeat(64)}`,
      recordedAt: 2,
    });
    first.close();
    const reopened = new decibel_minimal_live_canary_journal_v1(path);
    expect(reopened.get(value.configuration.canaryId)).toMatchObject({
      canaryConfigHash: value.configuration.configHash,
      state: 'PREPARED',
      placeTransactionHash: `0x${'a'.repeat(64)}`,
      liveExecutionEnabled: false,
    });
    const other = fixture();
    expect(() =>
      reopened.prepare({
        configuration: { ...other.configuration, canaryId: 'other', executionSessionId: 'other' },
        plan: { ...other.plan, canaryId: 'other', executionSessionId: 'other' },
        preparedAt: 3,
      }),
    ).toThrow('CANARY_UNRESOLVED_JOURNAL_EXISTS');
    reopened.close();
  });

  it('rejects config and transaction identity conflicts deterministically', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-canary-')), 'journal.sqlite');
    const value = fixture();
    const journal = new decibel_minimal_live_canary_journal_v1(path);
    journal.prepare({ ...value, preparedAt: 1 });
    expect(() =>
      journal.recordState({
        canaryId: value.configuration.canaryId,
        canaryConfigHash: 'wrong',
        state: 'PREFLIGHT',
        recordedAt: 2,
      }),
    ).toThrow('CANARY_CONFIG_IDENTITY_CONFLICT');
    journal.recordTransactionIdentity({
      canaryId: value.configuration.canaryId,
      canaryConfigHash: value.configuration.configHash,
      purpose: 'PLACE_CANARY_ORDER',
      transactionHash: `0x${'a'.repeat(64)}`,
      recordedAt: 2,
    });
    expect(() =>
      journal.recordTransactionIdentity({
        canaryId: value.configuration.canaryId,
        canaryConfigHash: value.configuration.configHash,
        purpose: 'PLACE_CANARY_ORDER',
        transactionHash: `0x${'b'.repeat(64)}`,
        recordedAt: 3,
      }),
    ).toThrow('CANARY_TRANSACTION_HASH_CONFLICT');
    journal.close();
  });

  it('keeps UI_ORDER_CAPTURE_WAITING resumable with the same handoff identity', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-canary-')), 'journal.sqlite');
    const value = fixture();
    const journal = new decibel_minimal_live_canary_journal_v1(path);
    journal.prepare({ ...value, preparedAt: 1 });
    const handoff: decibel_minimal_live_canary_operator_handoff_v1 = {
      schemaVersion: DECIBEL_MINIMAL_LIVE_CANARY_OPERATOR_HANDOFF_V1,
      strategyIdentity: 'DECIBEL_MARKET_MAKER_V1',
      handoffPackageHash: 'same-handoff-package',
      canaryId: value.configuration.canaryId,
      executionSessionId: value.configuration.executionSessionId,
      configHash: value.configuration.configHash,
      journalStatus: 'HANDOFF_READY_FOR_OPERATOR',
      createdAt: 2,
      network: 'mainnet',
      subaccount: '0xcanary',
      market: 'BTC/USD',
      marketAddress: '0xmarket',
      side: 'BUY',
      price: 100,
      quantity: 0.001,
      notionalUsd: 0.1,
      venueMinimumNotionalUsd: 0.1,
      targetNotionalUsd: 0.1,
      maximumNotionalUsd: 100,
      orderType: 'LIMIT',
      postOnly: true,
      bestBid: 100,
      bestAsk: 100.5,
      tickSize: 0.5,
      lotSize: 0.001,
      minimumSize: 0.001,
      marketObservedAt: 1,
      marketReceiptAt: 1,
      clientOrderId: 'same-client-order',
      executionPackageHash: 'same-execution-package',
      entryFunction: '0x1::orders::place',
      entryArguments: [],
      precommittedTransactionHash: null,
      positionState: 'FLAT',
      openOrderCount: 0,
      activeTwapCount: 0,
      activeTpSlCount: 0,
      activeBulkExposure: 0,
      unknownVenueOrders: 0,
      unresolvedExecutionPlans: 0,
      transactionIntentMatch: true,
      handoffPackageFresh: true,
      liveExecutionEnabled: false,
      venueMutationEnabled: false,
      signerEnabled: false,
      transactionSubmissionEnabled: false,
      operatorHandoffReady: true,
      blockers: [],
      mutationCounters: {
        signedTransactions: 0,
        submittedTransactions: 0,
        placedOrders: 0,
        cancelledOrders: 0,
        replacedOrders: 0,
        venueMutations: 0,
      },
    };
    journal.recordOperatorHandoff(handoff);
    journal.recordHandoffState({
      handoffPackageHash: handoff.handoffPackageHash,
      state: 'UI_ORDER_CAPTURE_WAITING',
      recordedAt: 3,
    });
    expect(journal.listUiCaptureEligibleHandoffs()).toEqual([handoff]);
    expect(journal.getOperatorHandoff(handoff.handoffPackageHash)).toMatchObject({
      handoff,
      state: 'UI_ORDER_CAPTURE_WAITING',
    });
    journal.recordUiOrderCapture({
      handoff,
      venueOrderId: 'venue-order',
      venueClientOrderId: 'venue-client-order',
      transactionVersion: 7,
      transactionHash: `0x${'c'.repeat(64)}`,
      capturedAt: 4,
      captureEvidenceHash: 'capture-evidence',
    });
    expect(journal.getUiOrderCaptureByHandoffPackageHash(handoff.handoffPackageHash)).toEqual({
      handoffPackageHash: handoff.handoffPackageHash,
      canaryId: handoff.canaryId,
      executionSessionId: handoff.executionSessionId,
      executionPackageHash: handoff.executionPackageHash,
      plannedClientOrderId: handoff.clientOrderId,
      venueOrderId: 'venue-order',
      venueClientOrderId: 'venue-client-order',
      transactionVersion: 7,
      transactionHash: `0x${'c'.repeat(64)}`,
      capturedAt: 4,
      captureEvidenceHash: 'capture-evidence',
    });
    expect(journal.getUiOrderCaptureByHandoffPackageHash('missing')).toBeNull();
    journal.close();
  });

  it('does not auto-select a failed capture but permits an explicit same-handoff retry', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-canary-')), 'journal.sqlite');
    const value = fixture();
    const journal = new decibel_minimal_live_canary_journal_v1(path);
    journal.prepare({ ...value, preparedAt: 1 });
    const handoff = {
      schemaVersion: DECIBEL_MINIMAL_LIVE_CANARY_OPERATOR_HANDOFF_V1,
      strategyIdentity: 'DECIBEL_MARKET_MAKER_V1',
      handoffPackageHash: 'failed-handoff-package',
      canaryId: value.configuration.canaryId,
      executionSessionId: value.configuration.executionSessionId,
      configHash: value.configuration.configHash,
      journalStatus: 'HANDOFF_READY_FOR_OPERATOR',
      createdAt: 2,
      liveExecutionEnabled: false,
    } as decibel_minimal_live_canary_operator_handoff_v1;
    journal.recordOperatorHandoff(handoff);
    journal.recordHandoffState({
      handoffPackageHash: handoff.handoffPackageHash,
      state: 'UI_ORDER_CAPTURE_FAILED',
      recordedAt: 3,
    });
    expect(journal.listUiCaptureEligibleHandoffs()).toEqual([]);
    expect(journal.getOperatorHandoff(handoff.handoffPackageHash)?.state).toBe(
      'UI_ORDER_CAPTURE_FAILED',
    );
    journal.recordHandoffState({
      handoffPackageHash: handoff.handoffPackageHash,
      state: 'UI_ORDER_CAPTURE_WAITING',
      recordedAt: 4,
    });
    expect(journal.listUiCaptureEligibleHandoffs()).toEqual([handoff]);
    journal.close();
  });
});
