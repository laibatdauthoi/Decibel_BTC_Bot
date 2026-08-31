import { describe, expect, it } from 'vitest';

import {
  DecibelSDKCapabilityReportV1,
  decibel_authenticated_dry_run_execution_adapter_v1,
  evaluateDecibelAuthenticatedDryRunCancelV1,
  evaluateDecibelLiveExecutionAuthorizationV1,
  loadDecibelExecutionModeV1,
  type decibel_actual_order_request_v1,
  type decibel_live_execution_gate_input_v1,
} from '../src/decibel_authenticated_execution_boundary_v1.js';
import {
  applyDecibelActualFillTruthV1,
  createDecibelActualFillLedgerV1,
  type decibel_actual_fill_truth_v1,
} from '../src/decibel_actual_fill_truth_v1.js';

const Market = '0xmarket';
const Request: decibel_actual_order_request_v1 = {
  localIntentId: 'intent-1',
  localExecutionRequestId: 'request-1',
  marketAddress: Market,
  side: 'BUY',
  price: 99,
  quantity: 0.001,
  orderType: 'LIMIT',
  timeInForce: 'POST_ONLY',
  postOnly: true,
};
const Gate: decibel_live_execution_gate_input_v1 = {
  executionMode: 'AUTHENTICATED_DRY_RUN',
  explicitLiveAuthorization: false,
  configuredNetwork: 'mainnet',
  requiredNetwork: 'mainnet',
  allowedMarketAddresses: [Market],
  riskControllerPermits: true,
  strategyActionPermitted: true,
  selfTradePreventionPassed: true,
  controlledExecutionAccountCount: 1,
  currentBestBid: 99,
  currentBestAsk: 101,
  bookFresh: true,
  tickSize: 0.1,
  lotSize: 0.001,
  minimumSize: 0.001,
  maximumOrderSize: 0.01,
  inventoryAfterFillAbs: 0.001,
  maximumInventoryAbs: 0.01,
  sessionLossWithinCap: true,
  sessionVolumeAndCostWithinCap: true,
  executionState: 'HEALTHY',
  reconciliationComplete: true,
  request: Request,
};

const Order = {
  venueOrderId: 'venue-order-1',
  localIntentId: 'intent-1',
  localExecutionRequestId: 'request-1',
  marketAddress: Market,
  side: 'BUY' as const,
  requestedQuantity: 0.001,
};

function fill(
  venueFillId: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  makerOrTaker: 'MAKER' | 'TAKER' = 'MAKER',
  venueOrderId = side === 'BUY' ? 'venue-order-1' : 'venue-order-2',
  localExecutionRequestId = side === 'BUY' ? 'request-1' : 'request-2',
): decibel_actual_fill_truth_v1 {
  const price = side === 'BUY' ? 100 : 101;
  return Object.freeze({
    venueFillId,
    venueOrderId,
    localExecutionRequestId,
    marketAddress: Market,
    side,
    executedPrice: price,
    executedBaseQuantity: quantity,
    executedUsdNotional: price * quantity,
    makerOrTaker,
    receivedAt: new Date(1_000 + Number(venueFillId.replace(/\D/g, '') || 0)),
    venueTimestamp: null,
    fee: Object.freeze({ availability: 'AVAILABLE', amount: 0.01, currency: 'USD' }),
    rebate: Object.freeze({ availability: 'UNAVAILABLE', amount: null, currency: null }),
    executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM',
  });
}

describe('Decibel Authenticated Execution Truth Boundary V1', () => {
  it('defaults to PAPER and never silently selects LIVE', () => {
    expect(loadDecibelExecutionModeV1({})).toBe('PAPER');
    expect(loadDecibelExecutionModeV1({ DECIBEL_EXECUTION_MODE: 'AUTHENTICATED_DRY_RUN' })).toBe(
      'AUTHENTICATED_DRY_RUN',
    );
  });

  it('dry-run reports WOULD_PLACE but cannot submit or cancel', async () => {
    const Adapter = new decibel_authenticated_dry_run_execution_adapter_v1(Gate);
    expect(Adapter.validatePlace(Request)).toMatchObject({
      status: 'WOULD_PLACE',
      liveExecutionEnabled: false,
      liveSubmissionBlocked: true,
    });
    await expect(Adapter.placePostOnlyOrder(Request)).rejects.toThrow(
      'AUTHENTICATED_DRY_RUN_SUBMISSION_BLOCKED',
    );
    await expect(Adapter.cancelOrder('venue-order-1')).rejects.toThrow(
      'AUTHENTICATED_DRY_RUN_CANCELLATION_BLOCKED',
    );
    expect(
      evaluateDecibelAuthenticatedDryRunCancelV1('venue-order-1', ['venue-order-1']),
    ).toMatchObject({ status: 'WOULD_CANCEL', liveCancellationBlocked: true });
  });

  it.each([
    [
      { executionMode: 'LIVE', explicitLiveAuthorization: false },
      'EXPLICIT_LIVE_AUTHORIZATION_REQUIRED',
    ],
    [{ configuredNetwork: 'testnet' }, 'NETWORK_NOT_ALLOWED'],
    [{ allowedMarketAddresses: ['other'] }, 'MARKET_NOT_ALLOWED'],
    [{ request: { ...Request, timeInForce: 'IOC' } }, 'POST_ONLY_LIMIT_REQUEST_INVALID'],
    [{ request: { ...Request, price: 101 } }, 'ORDER_WOULD_CROSS'],
    [{ request: { ...Request, side: 'SELL', price: 99 } }, 'ORDER_WOULD_CROSS'],
    [{ request: { ...Request, quantity: 0.0005 } }, 'PRICE_OR_SIZE_INVALID'],
    [{ inventoryAfterFillAbs: 0.02 }, 'INVENTORY_CAP_EXCEEDED'],
    [{ selfTradePreventionPassed: false }, 'SELF_TRADE_PREVENTION_REJECTED'],
    [{ executionState: 'EXECUTION_STATE_UNKNOWN' }, 'EXECUTION_RECONCILIATION_REQUIRED'],
  ] as const)('fails closed for %j', (override, reason) => {
    expect(evaluateDecibelLiveExecutionAuthorizationV1({ ...Gate, ...override }).reasons).toContain(
      reason,
    );
  });

  it('keeps installed SDK capabilities honest', () => {
    expect(DecibelSDKCapabilityReportV1).toMatchObject({
      placeOrder: { status: 'AVAILABLE' },
      cancelOrder: { status: 'AVAILABLE' },
      ownFills: { status: 'PARTIAL' },
      feeAndMakerRoleEvidence: { status: 'UNAVAILABLE' },
      liveSubmissionBlocked: true,
      privateKeyLoaded: false,
    });
    expect(JSON.stringify(DecibelSDKCapabilityReportV1)).not.toContain('test-secret-material');
  });

  it('keeps venue and local order identities distinct', () => {
    expect(Order.venueOrderId).not.toBe(Order.localIntentId);
    expect(Order.venueOrderId).not.toBe(Order.localExecutionRequestId);
  });

  it('applies unique partial maker fills exactly once and completes an actual cycle', () => {
    const sellOrder = {
      ...Order,
      venueOrderId: 'venue-order-2',
      localIntentId: 'intent-2',
      localExecutionRequestId: 'request-2',
      side: 'SELL' as const,
    };
    let ledger = createDecibelActualFillLedgerV1([Order, sellOrder]);
    const first = fill('fill-1', 'BUY', 0.0002);
    ledger = applyDecibelActualFillTruthV1(ledger, first);
    const duplicate = applyDecibelActualFillTruthV1(ledger, first);
    expect(duplicate).toBe(ledger);
    ledger = applyDecibelActualFillTruthV1(ledger, fill('fill-2', 'BUY', 0.0003));
    ledger = applyDecibelActualFillTruthV1(ledger, fill('fill-3', 'BUY', 0.0005));
    expect(ledger.inventoryBase).toBeCloseTo(0.001);
    expect(ledger.fills).toHaveLength(3);
    expect(ledger.actualExternalMakerVolumeUsd).toBeCloseTo(0.1);
    expect(ledger.fills[0]?.fee).toEqual({
      availability: 'AVAILABLE',
      amount: 0.01,
      currency: 'USD',
    });
    ledger = applyDecibelActualFillTruthV1(ledger, fill('fill-4', 'SELL', 0.001));
    expect(ledger.inventoryBase).toBeCloseTo(0);
    expect(ledger.cycles[0]).toMatchObject({
      status: 'COMPLETED',
      provenance: 'ACTUAL_EXECUTION',
      actualFillIds: ['fill-1', 'fill-2', 'fill-3', 'fill-4'],
    });
  });

  it('does not count authenticated taker, public, or paper evidence as actual maker volume', () => {
    let ledger = createDecibelActualFillLedgerV1([Order]);
    ledger = applyDecibelActualFillTruthV1(ledger, fill('fill-5', 'BUY', 0.001, 'TAKER'));
    expect(ledger.actualExternalMakerVolumeUsd).toBe(0);
    expect(ledger.actualTakerVolumeUsd).toBe(0.1);
    expect(ledger.cycles).toHaveLength(0);
    expect(ledger.fills[0]?.fee.availability).toBe('AVAILABLE');
  });

  it('retains unavailable fee truth as unavailable rather than zero', () => {
    const unavailable = {
      ...fill('fill-9', 'BUY', 0.001),
      fee: Object.freeze({
        availability: 'UNAVAILABLE' as const,
        amount: null,
        currency: null,
      }),
    };
    const ledger = applyDecibelActualFillTruthV1(
      createDecibelActualFillLedgerV1([Order]),
      unavailable,
    );
    expect(ledger.fills[0]?.fee).toEqual({
      availability: 'UNAVAILABLE',
      amount: null,
      currency: null,
    });
  });

  it('rejects conflicting duplicate identity, overfills, and wrong lineage', () => {
    const first = fill('fill-6', 'BUY', 0.0008);
    const ledger = applyDecibelActualFillTruthV1(createDecibelActualFillLedgerV1([Order]), first);
    expect(() =>
      applyDecibelActualFillTruthV1(ledger, {
        ...first,
        executedPrice: 102,
        executedUsdNotional: 102 * first.executedBaseQuantity,
      }),
    ).toThrow('DECIBEL_ACTUAL_FILL_ID_CONFLICT');
    expect(() => applyDecibelActualFillTruthV1(ledger, fill('fill-7', 'BUY', 0.0003))).toThrow(
      'DECIBEL_ACTUAL_FILL_OVERFILLS_ORDER',
    );
    expect(() =>
      applyDecibelActualFillTruthV1(
        createDecibelActualFillLedgerV1([Order]),
        fill('fill-8', 'SELL', 0.001),
      ),
    ).toThrow('DECIBEL_ACTUAL_FILL_ORDER_LINEAGE_INVALID');
  });

  it('recognizes RECONCILED only when the independent completion flag is true', () => {
    expect(
      evaluateDecibelLiveExecutionAuthorizationV1({
        ...Gate,
        executionState: 'RECONCILED',
      }).reasons,
    ).not.toContain('EXECUTION_RECONCILIATION_REQUIRED');
    expect(
      evaluateDecibelLiveExecutionAuthorizationV1({
        ...Gate,
        executionState: 'RECONCILED',
        reconciliationComplete: false,
      }).reasons,
    ).toContain('EXECUTION_RECONCILIATION_REQUIRED');
  });
});
