import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertDecibelCanaryBroadcastUnavailableV1,
  buildDecibelCanaryPlaceOrderPayloadV1,
  buildDecibelMinimalLiveCanaryExecutionPackageV1,
  classifyDecibelExecutionPackageFreshnessV1,
  verifyDecibelCanaryTransactionIntentV1,
} from '../src/decibel_minimal_live_canary_execution_package_v1.js';
import { decibel_minimal_live_canary_journal_v1 } from '../src/decibel_minimal_live_canary_journal_v1.js';
import {
  DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  createDecibelAutoMinimalLiveCanaryConfigurationV1,
  planDecibelMinimalLiveCanaryV1,
} from '../src/decibel_minimal_live_canary_v1.js';

const packageAddress = `0x${'a'.repeat(64)}`;

function fixture(sideAddress = '0x1') {
  const configuration = createDecibelAutoMinimalLiveCanaryConfigurationV1({
    canaryId: 'canary-package-1',
    executionSessionId: 'session-package-1',
    account: sideAddress,
    subaccount: sideAddress,
    network: 'mainnet',
    market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    observationTimeoutMs: 60_000,
    executionRecoveryTimeoutMs: 120_000,
    strategyConfigId: 'strategy-package-1',
  });
  const bestBid = 100;
  const bestAsk = 100.5;
  const preflight = {
    authenticatedAccount: sideAddress,
    configuredNetwork: 'mainnet',
    observedNetwork: 'mainnet',
    market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    metadataFresh: true,
    marketOperational: true,
    tickSize: 0.5,
    lotSize: 0.001,
    minimumOrderSize: 0.001,
    minimumMetadataValidQuantity: 0.001,
    bestBid,
    bestAsk,
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
  } as const;
  const plan = planDecibelMinimalLiveCanaryV1({
    configuration,
    persistedConfigHash: null,
    preflight,
    placementTransactionCount: 0,
    venueOrderCount: 0,
  });
  const path = join(mkdtempSync(join(tmpdir(), 'canary-package-')), 'journal.sqlite');
  return { configuration, plan, preflight, path, bestBid, bestAsk };
}

function build(overrides: Record<string, unknown> = {}) {
  const value = fixture();
  const journal = new decibel_minimal_live_canary_journal_v1(value.path);
  const result = buildDecibelMinimalLiveCanaryExecutionPackageV1({
    configuration: value.configuration,
    plan: value.plan,
    packageAddress,
    marketObservedAt: 1000,
    bestBid: value.bestBid,
    bestAsk: value.bestAsk,
    tickSize: 0.5,
    lotSize: 0.001,
    minimumQuantity: 0.001,
    notionalCapUsd: 100,
    finalPreflightReady: true,
    journal,
    timestamp: 1001,
    ...overrides,
  });
  return { result, journal, value };
}

describe('Decibel Minimal Live Canary Execution Package V1', () => {
  it('durably prepares before constructing an exact inspected PostOnly payload', () => {
    const { result, journal, value } = build();
    expect(journal.get(value.configuration.canaryId)?.state).toBe('PREPARED');
    expect(result.transaction).toMatchObject({
      entryFunction: `${packageAddress}::dex_accounts_entry::place_order_to_subaccount`,
      transactionIntentMatch: true,
      signerInitialized: false,
      signedTransactionBytes: null,
    });
    expect(result.transaction.payload.functionArguments).toEqual([
      value.plan.account,
      value.plan.market,
      value.plan.price,
      value.plan.quantity,
      value.plan.side === 'BUY',
      1,
      false,
      value.plan.clientOrderId,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(result).toMatchObject({
      canaryBroadcastAuthorized: false,
      finalPreflightReady: true,
      executionPackageReady: true,
      submitWithoutDurableHash: 'IMPOSSIBLE',
      liveExecutionEnabled: false,
      safetyCounters: {
        signedTransactions: 0,
        submittedTransactions: 0,
        placedOrders: 0,
        cancelledOrders: 0,
        venueMutations: 0,
      },
    });
    journal.close();
  });

  it('fails closed for preflight, side, quantity, price, PostOnly, crossing and risk mismatches', () => {
    const value = fixture();
    const makeJournal = () =>
      new decibel_minimal_live_canary_journal_v1(
        join(mkdtempSync(join(tmpdir(), 'canary-package-bad-')), 'journal.sqlite'),
      );
    const base = {
      configuration: value.configuration,
      plan: value.plan,
      packageAddress,
      marketObservedAt: 1,
      bestBid: value.bestBid,
      bestAsk: value.bestAsk,
      tickSize: 0.5,
      lotSize: 0.001,
      minimumQuantity: 0.001,
      notionalCapUsd: 100,
      finalPreflightReady: true,
      timestamp: 2,
    };
    expect(() =>
      buildDecibelMinimalLiveCanaryExecutionPackageV1({
        ...base,
        finalPreflightReady: false,
        journal: makeJournal(),
      }),
    ).toThrow('CANARY_FINAL_PREFLIGHT_NOT_READY');
    expect(() =>
      buildDecibelMinimalLiveCanaryExecutionPackageV1({
        ...base,
        minimumQuantity: 0.3,
        journal: makeJournal(),
      }),
    ).toThrow('CANARY_FINAL_ORDER_PLAN_INVALID');
    expect(() =>
      buildDecibelMinimalLiveCanaryExecutionPackageV1({
        ...base,
        plan: { ...value.plan, postOnly: false } as typeof value.plan,
        journal: makeJournal(),
      }),
    ).toThrow('CANARY_FINAL_ORDER_PLAN_INVALID');
    expect(() =>
      buildDecibelMinimalLiveCanaryExecutionPackageV1({
        ...base,
        bestAsk: value.plan.side === 'BUY' ? value.plan.price : value.bestAsk,
        bestBid: value.plan.side === 'SELL' ? value.plan.price : value.bestBid,
        journal: makeJournal(),
      }),
    ).toThrow('CANARY_FINAL_ORDER_PLAN_INVALID');
  });

  it('detects semantic payload tampering independently', () => {
    const value = fixture();
    const payload = buildDecibelCanaryPlaceOrderPayloadV1({ packageAddress, plan: value.plan });
    const tampered = {
      ...payload,
      functionArguments: [
        ...payload.functionArguments.slice(0, 2),
        value.plan.price + 1,
        ...payload.functionArguments.slice(3),
      ],
    } as unknown as typeof payload;
    expect(
      verifyDecibelCanaryTransactionIntentV1({ payload, packageAddress, plan: value.plan }),
    ).toBe(true);
    expect(
      verifyDecibelCanaryTransactionIntentV1({
        payload: tampered,
        packageAddress,
        plan: value.plan,
      }),
    ).toBe(false);
  });

  it('restores identical identity and marks any later market observation stale', () => {
    const { result, journal, value } = build();
    const restored = journal.get(value.configuration.canaryId);
    expect(restored).toMatchObject({
      canaryId: result.canaryId,
      canaryConfigHash: result.configHash,
      configuration: {
        sideSeedHash: result.sideSeedHash,
        side: result.selectedSide,
      },
      plan: {
        clientOrderId: result.clientOrderId,
        price: result.price,
        quantity: result.quantity,
      },
    });
    journal.close();
    const reopened = new decibel_minimal_live_canary_journal_v1(value.path);
    expect(reopened.getExecutionPackage(value.configuration.canaryId)).toEqual(result);
    expect(
      classifyDecibelExecutionPackageFreshnessV1({
        marketObservedAt: result.marketObservedAt,
        currentObservedAt: result.marketObservedAt + 1,
        frozenBestBid: result.bbo.bestBid,
        frozenBestAsk: result.bbo.bestAsk,
        currentBestBid: result.bbo.bestBid,
        currentBestAsk: result.bbo.bestAsk,
      }),
    ).toBe('EXECUTION_PACKAGE_STALE');
    reopened.close();
  });

  it('has no broadcast path regardless of environment or LIVE-like flags', () => {
    process.env.LIVE_TRADING_ENABLED = 'true';
    process.env.CANARY_BROADCAST_AUTHORIZED = 'true';
    expect(assertDecibelCanaryBroadcastUnavailableV1).toThrow('CANARY_BROADCAST_NOT_AUTHORIZED');
    delete process.env.LIVE_TRADING_ENABLED;
    delete process.env.CANARY_BROADCAST_AUTHORIZED;
  });
});
