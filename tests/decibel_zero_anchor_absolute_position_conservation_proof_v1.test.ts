import { describe, expect, it } from 'vitest';
import {
  DecibelZeroAnchorAbsolutePositionConservationAuditV1,
  createDecibelCanaryZeroPositionAnchorV1,
  proveDecibelZeroAnchorAbsolutePositionConservationV1,
  type decibel_absolute_position_observation_v1,
  type decibel_zero_anchor_authenticated_fill_v1,
} from '../src/decibel_zero_anchor_absolute_position_conservation_proof_v1.js';
import type { decibel_canary_exclusivity_evidence_v1 } from '../src/decibel_isolated_subaccount_position_conservation_proof_v1.js';

const anchor = createDecibelCanaryZeroPositionAnchorV1({
  account: 'sub',
  market: 'btc',
  observedAt: 1,
  responseSuccessful: true,
  authenticatedAccount: 'sub',
  requestedMarketAddress: 'btc',
  includeDeleted: false,
  returnedRows: [],
  exactMarketOpenPositionQuerySemanticsProven: true,
});
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
function observation(rawSize: string): decibel_absolute_position_observation_v1 {
  return {
    kind: 'OPEN_POSITION',
    account: 'sub',
    market: 'btc',
    observedAt: 10,
    rawSize,
    transactionVersion: 10,
    isDeleted: false,
  };
}
const noPosition: decibel_absolute_position_observation_v1 = {
  kind: 'NO_OPEN_POSITION',
  account: 'sub',
  market: 'btc',
  observedAt: 10,
};
function fill(
  action: 'OpenLong' | 'OpenShort',
  size = '0.3',
  id = 't1',
): decibel_zero_anchor_authenticated_fill_v1 {
  return {
    source: 'OrderFill',
    authenticated: true,
    tradeId: id,
    orderId: 'o1',
    market: 'btc',
    action,
    size,
    price: '100',
    transactionVersion: 9,
  };
}
function prove(
  overrides: Partial<
    Parameters<typeof proveDecibelZeroAnchorAbsolutePositionConservationV1>[0]
  > = {},
) {
  return proveDecibelZeroAnchorAbsolutePositionConservationV1({
    zeroAnchor: anchor,
    positionBeforeHistory: observation('0.3'),
    positionAfterHistory: observation('0.3'),
    venueOrderId: 'o1',
    orderSide: 'BUY',
    authenticatedOrderIsBuy: true,
    fills: [fill('OpenLong')],
    makerProofValid: true,
    exclusivity: exclusive,
    ...overrides,
  });
}

describe('Decibel Zero-Anchor Absolute Position Conservation Proof V1', () => {
  it('creates a flat anchor only from a qualified successful exact-market empty response', () => {
    expect(anchor.anchorKind).toBe('NO_OPEN_POSITION');
    expect(anchor.transactionVersion).toBeNull();
    expect(() =>
      createDecibelCanaryZeroPositionAnchorV1({
        account: 'sub',
        market: 'btc',
        observedAt: 1,
        responseSuccessful: true,
        authenticatedAccount: 'sub',
        requestedMarketAddress: 'btc',
        includeDeleted: false,
        returnedRows: [],
        exactMarketOpenPositionQuerySemanticsProven: false,
      }),
    ).toThrow('ZERO_ANCHOR_UNPROVEN');
  });

  it('reconciles BUY and SELL using magnitude regardless of raw sign', () => {
    expect(
      prove({ positionBeforeHistory: observation('0.3'), positionAfterHistory: observation('0.3') })
        .absolutePositionMagnitude,
    ).toBe('0.3');
    expect(
      prove({
        positionBeforeHistory: observation('-0.3'),
        positionAfterHistory: observation('-0.3'),
      }).absolutePositionMagnitude,
    ).toBe('0.3');
    expect(
      prove({
        orderSide: 'SELL',
        authenticatedOrderIsBuy: false,
        fills: [fill('OpenShort')],
        positionBeforeHistory: observation('-0.3'),
        positionAfterHistory: observation('-0.3'),
      }).finalClassification,
    ).toBe('COMPLETE_BY_ZERO_ANCHOR_POSITION_MAGNITUDE_CONSERVATION');
  });

  it('reconciles no fill, partial fills, and full fills', () => {
    expect(
      prove({ positionBeforeHistory: noPosition, positionAfterHistory: noPosition, fills: [] })
        .finalClassification,
    ).toBe('NO_EXECUTION_RECONCILED');
    expect(
      prove({ fills: [fill('OpenLong', '0.2', 'a'), fill('OpenLong', '0.1', 'b')] }).fillQuantity,
    ).toBe('0.3');
    expect(
      prove({
        positionBeforeHistory: observation('1'),
        positionAfterHistory: observation('1'),
        fills: [fill('OpenLong', '1')],
      }).finalClassification,
    ).toBe('COMPLETE_BY_ZERO_ANCHOR_POSITION_MAGNITUDE_CONSERVATION');
    expect(
      prove({
        orderSide: 'SELL',
        authenticatedOrderIsBuy: false,
        positionBeforeHistory: observation('-1'),
        positionAfterHistory: observation('-1'),
        fills: [fill('OpenShort', '1')],
      }).quantityMatch,
    ).toBe(true);
  });

  it('classifies missing and excess fill quantity without creating synthetic fills', () => {
    expect(prove({ fills: [fill('OpenLong', '0.2')] }).finalClassification).toBe(
      'MISSING_FILL_QUANTITY',
    );
    expect(prove({ fills: [fill('OpenLong', '0.4')] }).finalClassification).toBe(
      'TRADE_HISTORY_OVERCOUNT',
    );
    expect(
      prove({
        positionBeforeHistory: observation('0.3'),
        positionAfterHistory: observation('0.3'),
        fills: [],
      }).uniqueTradeIds,
    ).toEqual([]);
  });

  it('rejects wrong lineage, direction contradiction, unstable position, and missing maker proof', () => {
    expect(() => prove({ fills: [{ ...fill('OpenLong'), orderId: 'other' }] })).toThrow(
      'OUT_OF_SCOPE',
    );
    expect(() => prove({ fills: [fill('OpenShort')] })).toThrow('DIRECTION_CONTRADICTION');
    expect(() => prove({ authenticatedOrderIsBuy: false })).toThrow('DIRECTION_CONTRADICTION');
    expect(() => prove({ positionAfterHistory: observation('0.4') })).toThrow('SNAPSHOT_UNSTABLE');
    expect(() => prove({ makerProofValid: false })).toThrow('MAKER_PROOF_REQUIRED');
  });

  it('rejects extra activity, a second order, and system mutation', () => {
    expect(() => prove({ exclusivity: { ...exclusive, unexpectedOrderCount: 1 } })).toThrow(
      'NOT_EXCLUSIVE',
    );
    expect(() => prove({ exclusivity: { ...exclusive, concurrentVenueOrderCount: 2 } })).toThrow(
      'NOT_EXCLUSIVE',
    );
    expect(() =>
      prove({ exclusivity: { ...exclusive, liquidationOrSystemMutationObserved: true } }),
    ).toThrow('UNEXPECTED_POSITION_MUTATION');
  });

  it('deduplicates authenticated trade IDs and preserves price-derived maker volume', () => {
    const result = prove({ fills: [fill('OpenLong'), fill('OpenLong')] });
    expect(result.uniqueTradeIds).toEqual(['t1']);
    expect(result.makerVolumeUsd).toBe('30');
    expect(result.costRecordCompleteness).toBe(false);
  });

  it('keeps sign semantics informational and crash durability independently blocking', () => {
    const audit = DecibelZeroAnchorAbsolutePositionConservationAuditV1;
    expect(audit.zeroPositionAnchorProvable).toBe(true);
    expect(audit.positionSizeSignSemantics).toBe('UNPROVEN');
    expect(audit.canaryExecutedQuantityTruth).toBe('PROVEN_BY_ZERO_ANCHOR_POSITION_MAGNITUDE');
    expect(audit.canaryPerOrderHistoryCompleteness).toBe(
      'PROVEN_BY_ZERO_ANCHOR_POSITION_MAGNITUDE',
    );
    expect(audit.canaryOrderLineageDurability).toBe('PARTIAL');
    expect(audit.minimalLiveCanaryReconciliationReady).toBe(false);
    expect(audit.smallestRemainingBlocker).toBe('ACCEPTED_ORDER_IDENTITY_CRASH_WINDOW');
    expect(audit.liveExecutionEnabled).toBe(false);
  });
});
