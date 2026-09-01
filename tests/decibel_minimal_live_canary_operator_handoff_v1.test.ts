import { describe, expect, it } from 'vitest';

import { buildDecibelMinimalLiveCanaryOperatorHandoffV1 } from '../src/decibel_minimal_live_canary_operator_handoff_v1.js';
import type { DecibelMinimalLiveCanaryExecutionPackageV1 } from '../src/decibel_minimal_live_canary_execution_package_v1.js';

function fixture() {
  const pkg = {
    canaryId: 'c',
    executionSessionId: 's',
    network: 'mainnet',
    subaccount: '0x1',
    market: '0x2',
    symbol: 'BTC/USD',
    selectedSide: 'BUY',
    price: 100,
    quantity: 0.01,
    notionalUsd: 1,
    venueMinimumNotionalUsd: 1,
    targetNotionalUsd: 1,
    maximumNotionalUsd: 100,
    orderType: 'LIMIT',
    timeInForce: 'PostOnly',
    postOnly: true,
    bbo: { bestBid: 100, bestAsk: 101 },
    marketObservedAt: 10,
    clientOrderId: 'id',
    configHash: 'cfg',
    packageIdentity: 'package',
    transactionIntentMatch: true,
    transaction: {
      entryFunction: '0x3::m::f',
      payload: { functionArguments: ['0x1', '0x2', 100, 0.01, true, 1, false, 'id'] },
      semanticSummary: { subaccount: '0x1' },
    },
  } as unknown as DecibelMinimalLiveCanaryExecutionPackageV1;
  const snapshot = {
    accountMatch: true,
    network: 'mainnet',
    marketAddress: '0x2',
    positionFlat: true,
    openOrderCount: 0,
    activeTwapCount: 0,
    activeTpSlCount: 0,
    activeBulkExposure: 0,
    unknownVenueOrders: 0,
    journalHealthy: true,
    unresolvedExecutionPlans: 0,
    marketMode: 'Open',
    bestBid: 100,
    bestAsk: 101,
    observedAt: 10,
    receiptAt: 11,
    tickSize: 1,
    lotSize: 0.01,
    minimumSize: 0.01,
    bboFresh: true,
  } as const;
  return { pkg, snapshot };
}

describe('operator handoff', () => {
  it('emits an immutable ready non-mutating handoff', () => {
    const { pkg, snapshot } = fixture();
    const result = buildDecibelMinimalLiveCanaryOperatorHandoffV1({
      executionPackage: pkg,
      initial: snapshot,
      final: snapshot,
      createdAt: 12,
    });
    expect(result.operatorHandoffReady).toBe(true);
    expect(result.handoffPackageFresh).toBe(true);
    expect(result.price).toBe(snapshot.bestBid);
    expect(result.quantity).toBe(pkg.quantity);
    expect(result.notionalUsd).toBe(pkg.notionalUsd);
    expect(result.mutationCounters.venueMutations).toBe(0);
  });

  it.each([
    ['positionFlat', false, 'PREFLIGHT_POSITION_NOT_FLAT'],
    ['openOrderCount', 1, 'PREFLIGHT_OPEN_ORDER_PRESENT'],
    ['activeTwapCount', 1, 'PREFLIGHT_TWAP_PRESENT'],
    ['activeTpSlCount', 1, 'PREFLIGHT_TP_SL_PRESENT'],
    ['activeBulkExposure', 1, 'PREFLIGHT_BULK_EXPOSURE_PRESENT'],
    ['unknownVenueOrders', 1, 'PREFLIGHT_UNKNOWN_ORDER_PRESENT'],
    ['marketMode', 'Halted', 'PREFLIGHT_MARKET_NOT_OPEN'],
    ['bboFresh', false, 'PREFLIGHT_BBO_STALE'],
  ] as const)('blocks unsafe %s', (field, value, reason) => {
    const { pkg, snapshot } = fixture();
    const changed = { ...snapshot, [field]: value };
    const result = buildDecibelMinimalLiveCanaryOperatorHandoffV1({
      executionPackage: pkg,
      initial: changed,
      final: changed,
      createdAt: 12,
    });
    expect(result.operatorHandoffReady).toBe(false);
    expect(result.blockers).toContain(reason);
  });

  it('rejects a changed final BBO as stale without regenerating', () => {
    const { pkg, snapshot } = fixture();
    const result = buildDecibelMinimalLiveCanaryOperatorHandoffV1({
      executionPackage: pkg,
      initial: snapshot,
      final: { ...snapshot, bestBid: 99 },
      createdAt: 12,
    });
    expect(result.handoffPackageFresh).toBe(false);
    expect(result.blockers).toContain('HANDOFF_PACKAGE_STALE');
  });

  it('does not require construction and final observation timestamps to be identical', () => {
    const { pkg, snapshot } = fixture();
    const result = buildDecibelMinimalLiveCanaryOperatorHandoffV1({
      executionPackage: pkg,
      initial: snapshot,
      final: { ...snapshot, observedAt: snapshot.observedAt + 1 },
      createdAt: 12,
    });
    expect(result.handoffPackageFresh).toBe(true);
    expect(result.operatorHandoffReady).toBe(true);
  });
});
