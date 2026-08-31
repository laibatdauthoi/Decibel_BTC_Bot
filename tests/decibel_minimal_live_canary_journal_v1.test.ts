import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { decibel_minimal_live_canary_journal_v1 } from '../src/decibel_minimal_live_canary_journal_v1.js';
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
});
