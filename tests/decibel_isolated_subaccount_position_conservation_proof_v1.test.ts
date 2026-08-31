import { describe, expect, it } from 'vitest';
import {
  DecibelIsolatedSubaccountPositionConservationAuditV1,
  proveDecibelIsolatedSubaccountPositionConservationV1,
  type decibel_canary_exclusivity_evidence_v1,
  type decibel_isolated_position_fill_v1,
  type decibel_position_snapshot_v1,
} from '../src/decibel_isolated_subaccount_position_conservation_proof_v1.js';

const exclusive: decibel_canary_exclusivity_evidence_v1 = {
  dedicatedSubaccountSelected: true,
  exclusiveStrategyControlProven: true,
  activeMarketCount: 1,
  concurrentVenueOrderCount: 1,
  unexpectedOrderCount: 0,
  activeTwapCount: 0,
  activeBulkOrderCount: 0,
  activeTpSlCount: 0,
  delegatedExternalTraderCount: 0,
  liquidationOrSystemMutationObserved: false,
};

function position(size: string, version: number): decibel_position_snapshot_v1 {
  return {
    subaccount: 'sub',
    market: 'btc',
    size,
    transactionVersion: version,
    observedAt: version,
    isDeleted: size === '0',
  };
}

function fill(side: 'BUY' | 'SELL', size = '0.3', id = 't1'): decibel_isolated_position_fill_v1 {
  return {
    source: 'OrderFill',
    tradeId: id,
    orderId: 'o1',
    market: 'btc',
    side,
    size,
    price: '100',
    transactionVersion: 9,
    authenticated: true,
  };
}

function prove(
  overrides: Partial<
    Parameters<typeof proveDecibelIsolatedSubaccountPositionConservationV1>[0]
  > = {},
) {
  return proveDecibelIsolatedSubaccountPositionConservationV1({
    dedicatedCanarySubaccountAddress: 'sub',
    market: 'btc',
    orderId: 'o1',
    orderSide: 'BUY',
    orderStatus: 'CANCELLED',
    initialPositionAnchor: position('0', 1),
    positionSnapshotBeforeHistory: position('0.3', 10),
    positionSnapshotAfterHistory: position('0.3', 10),
    fills: [fill('BUY')],
    strategyRebuiltInventory: '0.3',
    makerProofValid: true,
    positionSizeAndSignSemanticsProven: true,
    zeroPositionAnchorProven: true,
    singleOrderAttributionProven: true,
    exclusivity: exclusive,
    ...overrides,
  });
}

describe('Decibel Isolated-Subaccount Position Conservation Proof V1', () => {
  it('reconciles partial/full BUY and SELL position deltas', () => {
    expect(prove().classification).toBe('COMPLETE_BY_ISOLATED_POSITION_CONSERVATION');
    expect(
      prove({
        positionSnapshotBeforeHistory: position('1', 10),
        positionSnapshotAfterHistory: position('1', 10),
        fills: [fill('BUY', '1')],
        strategyRebuiltInventory: '1',
        orderStatus: 'FILLED',
      }).volumeCompleteness,
    ).toBe(true);
    expect(
      prove({
        orderSide: 'SELL',
        positionSnapshotBeforeHistory: position('-0.3', 10),
        positionSnapshotAfterHistory: position('-0.3', 10),
        fills: [fill('SELL')],
        strategyRebuiltInventory: '-0.3',
      }).classification,
    ).toBe('COMPLETE_BY_ISOLATED_POSITION_CONSERVATION');
  });

  it('reconciles a no-fill cancellation without inventing a fill', () => {
    const result = prove({
      positionSnapshotBeforeHistory: position('0', 10),
      positionSnapshotAfterHistory: position('0', 10),
      fills: [],
      strategyRebuiltInventory: '0',
    });
    expect(result.classification).toBe('NO_EXECUTION');
    expect(result.retrievedFillIds).toEqual([]);
    expect(result.actualExternalMakerVolumeUsd).toBe('0');
  });

  it('classifies missing and excess authenticated fill quantities', () => {
    expect(
      prove({ fills: [fill('BUY', '0.2')], strategyRebuiltInventory: '0.3' }).classification,
    ).toBe('MISSING_FILL_QUANTITY');
    expect(
      prove({ fills: [fill('BUY', '0.4')], strategyRebuiltInventory: '0.3' }).classification,
    ).toBe('TRADE_HISTORY_OVERCOUNT');
  });

  it('rejects wrong side, missing maker proof, and unstable snapshots', () => {
    expect(() => prove({ fills: [fill('SELL')] })).toThrow('FILL_SIDE');
    expect(() => prove({ makerProofValid: false })).toThrow('MAKER_PROOF_REQUIRED');
    expect(() => prove({ positionSnapshotAfterHistory: position('0.4', 11) })).toThrow(
      'SNAPSHOT_UNSTABLE',
    );
  });

  it('invalidates other orders, markets, TP/SL, TWAP, bulk, delegation, and liquidation', () => {
    for (const changed of [
      { concurrentVenueOrderCount: 2 },
      { activeMarketCount: 2 },
      { activeTpSlCount: 1 },
      { activeTwapCount: 1 },
      { activeBulkOrderCount: 1 },
      { delegatedExternalTraderCount: 1 },
    ])
      expect(() => prove({ exclusivity: { ...exclusive, ...changed } })).toThrow('NOT_EXCLUSIVE');
    expect(() =>
      prove({ exclusivity: { ...exclusive, liquidationOrSystemMutationObserved: true } }),
    ).toThrow('UNEXPECTED_POSITION_MUTATION');
  });

  it('deduplicates identical trade IDs and preserves authenticated execution price', () => {
    const result = prove({ fills: [fill('BUY'), fill('BUY')] });
    expect(result.retrievedFillIds).toEqual(['t1']);
    expect(result.actualExternalMakerVolumeUsd).toBe('30');
  });

  it('rejects public/paper/out-of-lineage fills and impossible future versions', () => {
    expect(() =>
      prove({
        fills: [{ ...fill('BUY'), authenticated: false } as decibel_isolated_position_fill_v1],
      }),
    ).toThrow('OUT_OF_SCOPE');
    expect(() => prove({ fills: [{ ...fill('BUY'), transactionVersion: 11 }] })).toThrow(
      'FUTURE_VERSION',
    );
  });

  it('requires proven position semantics, zero anchor, attribution, and inventory equality', () => {
    expect(() => prove({ positionSizeAndSignSemanticsProven: false })).toThrow(
      'POSITION_SEMANTICS_UNPROVEN',
    );
    expect(() => prove({ zeroPositionAnchorProven: false })).toThrow(
      'ZERO_POSITION_ANCHOR_UNPROVEN',
    );
    expect(() => prove({ singleOrderAttributionProven: false })).toThrow(
      'SINGLE_ORDER_ATTRIBUTION_UNPROVEN',
    );
    expect(() => prove({ strategyRebuiltInventory: '0.2' })).toThrow(
      'INVENTORY_RECONCILIATION_FAILED',
    );
  });

  it('keeps current readiness and crash lineage fail-closed', () => {
    const audit = DecibelIsolatedSubaccountPositionConservationAuditV1;
    expect(audit.authenticatedPositionSizeAvailable).toBe(true);
    expect(audit.positionSizeSignSemantics).toBe('UNPROVEN');
    expect(audit.canaryExecutedQuantityTruth).toBe('UNPROVEN');
    expect(audit.canaryOrderLineageDurability).toBe('PARTIAL');
    expect(audit.minimalLiveCanaryReconciliationReady).toBe(false);
    expect(audit.liveExecutionEnabled).toBe(false);
  });
});
