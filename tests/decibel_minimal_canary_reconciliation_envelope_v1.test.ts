import { describe, expect, it } from 'vitest';

import {
  DecibelMinimalCanaryReconciliationAuditV1,
  buildDecibelCanaryOrderTradeHistoryQueryV1,
  buildDecibelCanaryReconciliationEnvelopeV1,
  evaluateDecibelFutureCanaryPlacementCapV1,
  reconcileDecibelCanaryOrderV1,
  recoverDecibelAcceptedCanaryOrderByClientIdV1,
} from '../src/decibel_minimal_canary_reconciliation_envelope_v1.js';
import type { decibel_authenticated_trade_history_row_v1 } from '../src/decibel_authenticated_execution_reconciliation_v1.js';

const Query = buildDecibelCanaryOrderTradeHistoryQueryV1({
  account: 'account-1',
  market: 'btc-market',
  venueOrderId: 'order-1',
  startTimestamp: 100,
  endTimestamp: 200,
});

const ProvenEnvelope = buildDecibelCanaryReconciliationEnvelopeV1({
  market: 'btc-market',
  minimumOrderSize: 0.001,
  orderLotSize: 0.001,
  orderQuantity: 0.001,
  minimumExecutableFillIncrementProof: {
    source: 'AUTHORITATIVE_MINIMUM_EXECUTABLE_FILL_INCREMENT',
    increment: 0.001,
  },
  durableVenueOrderIdPersistenceAvailable: true,
  deterministicClientOrderIdPersistedBeforeSubmission: true,
  authenticatedClientOrderIdLookupAvailable: true,
});

function row(
  tradeId: string,
  size = 0.001,
  overrides: Partial<decibel_authenticated_trade_history_row_v1> = {},
): decibel_authenticated_trade_history_row_v1 {
  return {
    account: 'account-1',
    market: 'btc-market',
    action: 'OpenLong',
    source: 'OrderFill',
    trade_id: tradeId,
    size,
    price: 60_000,
    is_rebate: false,
    fee_amount: 0.01,
    order_id: 'order-1',
    transaction_unix_ms: 150,
    transaction_version: 1,
    ...overrides,
  };
}

function order(status: 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED', remainingSize: number) {
  return {
    account: 'account-1',
    market: 'btc-market',
    venueOrderId: 'order-1',
    clientOrderId: 'canary-session-request-1',
    timeInForce: 1 as const,
    origSize: 0.001,
    remainingSize,
    status,
  };
}

describe('Decibel Minimal Canary Reconciliation Envelope V1', () => {
  it('constructs the exact order-specific single-page REST query', () => {
    expect(Query).toEqual({
      account: 'account-1',
      market: 'btc-market',
      order_id: 'order-1',
      limit: 200,
      offset: 0,
      sort_dir: 'ASC',
      start_timestamp: 100,
      end_timestamp: 200,
    });
  });

  it('blocks readiness when executable fill increment is not authoritative', () => {
    const envelope = buildDecibelCanaryReconciliationEnvelopeV1({
      market: 'btc-market',
      minimumOrderSize: 0.001,
      orderLotSize: 0.001,
      orderQuantity: 0.001,
      minimumExecutableFillIncrementProof: null,
      durableVenueOrderIdPersistenceAvailable: true,
      deterministicClientOrderIdPersistedBeforeSubmission: true,
      authenticatedClientOrderIdLookupAvailable: true,
    });
    expect(envelope).toMatchObject({
      minimumExecutableFillIncrementProven: false,
      canaryPerOrderHistoryCompleteness: 'UNPROVEN',
      minimalLiveCanaryReconciliationReady: false,
      smallestRemainingBlocker: 'MINIMUM_EXECUTABLE_FILL_INCREMENT_UNPROVEN',
    });
  });

  it('requires a strong fragment margin and rejects bounds reaching the page limit', () => {
    const envelope = buildDecibelCanaryReconciliationEnvelopeV1({
      market: 'btc-market',
      minimumOrderSize: 200,
      orderLotSize: 1,
      orderQuantity: 200,
      minimumExecutableFillIncrementProof: {
        source: 'AUTHORITATIVE_MINIMUM_EXECUTABLE_FILL_INCREMENT',
        increment: 1,
      },
      durableVenueOrderIdPersistenceAvailable: true,
      deterministicClientOrderIdPersistedBeforeSubmission: true,
      authenticatedClientOrderIdLookupAvailable: true,
    });
    expect(envelope).toMatchObject({
      maximumPossibleFillFragmentsPerOrder: 200,
      canaryPerOrderHistoryCompleteness: 'UNPROVEN',
      smallestRemainingBlocker: 'MAXIMUM_POSSIBLE_FILL_FRAGMENTS_REACHES_API_PAGE_LIMIT',
    });
  });

  it('reconciles no-fill cancel, full fill, and partial-fill cancel', () => {
    expect(
      reconcileDecibelCanaryOrderV1({
        envelope: ProvenEnvelope,
        query: Query,
        order: order('CANCELLED', 0.001),
        rows: [],
      }).state,
    ).toBe('TERMINAL_CANCELLED');
    expect(
      reconcileDecibelCanaryOrderV1({
        envelope: ProvenEnvelope,
        query: Query,
        order: order('FILLED', 0),
        rows: [row('fill-1')],
      }).state,
    ).toBe('TERMINAL_FILLED');
    const partialEnvelope = buildDecibelCanaryReconciliationEnvelopeV1({
      market: 'btc-market',
      minimumOrderSize: 0.001,
      orderLotSize: 0.001,
      orderQuantity: 0.002,
      minimumExecutableFillIncrementProof: {
        source: 'AUTHORITATIVE_MINIMUM_EXECUTABLE_FILL_INCREMENT',
        increment: 0.001,
      },
      durableVenueOrderIdPersistenceAvailable: true,
      deterministicClientOrderIdPersistedBeforeSubmission: true,
      authenticatedClientOrderIdLookupAvailable: true,
    });
    expect(
      reconcileDecibelCanaryOrderV1({
        envelope: partialEnvelope,
        query: Query,
        order: { ...order('CANCELLED', 0.001), origSize: 0.002 },
        rows: [row('partial')],
      }).state,
    ).toBe('TERMINAL_CANCELLED');
  });

  it('deduplicates matching fill IDs but fails on conflict, wrong order, and sum mismatch', () => {
    expect(
      reconcileDecibelCanaryOrderV1({
        envelope: ProvenEnvelope,
        query: Query,
        order: order('FILLED', 0),
        rows: [row('fill-1'), row('fill-1')],
      }).uniqueFillCount,
    ).toBe(1);
    expect(() =>
      reconcileDecibelCanaryOrderV1({
        envelope: ProvenEnvelope,
        query: Query,
        order: order('FILLED', 0),
        rows: [row('fill-1'), row('fill-1', 0.001, { price: 60_001 })],
      }),
    ).toThrow('DECIBEL_CANARY_TRADE_ID_CONFLICT');
    expect(() =>
      reconcileDecibelCanaryOrderV1({
        envelope: ProvenEnvelope,
        query: Query,
        order: order('FILLED', 0),
        rows: [row('wrong', 0.001, { order_id: 'other-order' })],
      }),
    ).toThrow('DECIBEL_CANARY_ORDER_HISTORY_ROW_OUT_OF_SCOPE');
    expect(() =>
      reconcileDecibelCanaryOrderV1({
        envelope: ProvenEnvelope,
        query: Query,
        order: order('FILLED', 0),
        rows: [],
      }),
    ).toThrow('DECIBEL_CANARY_FILL_SUM_ORDER_STATUS_MISMATCH');
  });

  it('does not require optional total_count when the mathematical envelope is proven', () => {
    expect(
      reconcileDecibelCanaryOrderV1({
        envelope: ProvenEnvelope,
        query: Query,
        order: order('FILLED', 0),
        rows: [row('fill-1')],
      }),
    ).toMatchObject({ singlePageComplete: true, reconciliationStatus: 'CANARY_RECONCILED' });
  });

  it('recovers exact authenticated client-order lineage but not an unpersisted identity', () => {
    expect(
      recoverDecibelAcceptedCanaryOrderByClientIdV1({
        expectedAccount: 'account-1',
        expectedMarket: 'btc-market',
        durableClientOrderId: 'canary-session-request-1',
        authenticatedOrder: {
          account: 'account-1',
          market: 'btc-market',
          clientOrderId: 'canary-session-request-1',
          venueOrderId: 'order-1',
          timeInForce: 1,
        },
      }),
    ).toEqual({ recovered: true, venueOrderId: 'order-1', reason: null });
    expect(
      recoverDecibelAcceptedCanaryOrderByClientIdV1({
        expectedAccount: 'account-1',
        expectedMarket: 'btc-market',
        durableClientOrderId: null,
        authenticatedOrder: null,
      }),
    ).toMatchObject({ recovered: false, reason: 'DURABLE_CLIENT_ORDER_ID_UNAVAILABLE' });
  });

  it('does not admit public or non-OrderFill evidence into canary fill truth', () => {
    expect(() =>
      reconcileDecibelCanaryOrderV1({
        envelope: ProvenEnvelope,
        query: Query,
        order: order('FILLED', 0),
        rows: [row('public', 0.001, { source: 'MarginCall' })],
      }),
    ).toThrow('DECIBEL_CANARY_ORDER_HISTORY_ROW_OUT_OF_SCOPE');
  });

  it('fails closed on venue-order durability and fixed session caps', () => {
    expect(
      evaluateDecibelFutureCanaryPlacementCapV1({
        knownDurableVenueOrderCount: 10,
        requestedNotionalUsdSoFar: 90,
        nextRequestedNotionalUsd: 11,
        venueOrderIdDurabilityCertain: false,
      }),
    ).toMatchObject({
      permittedForFutureDesignOnly: false,
      reasons: [
        'VENUE_ORDER_ID_DURABILITY_UNCERTAIN',
        'CANARY_VENUE_ORDER_COUNT_CAP_REACHED',
        'CANARY_REQUESTED_NOTIONAL_CAP_REACHED',
      ],
      liveExecutionEnabled: false,
    });
  });

  it('keeps the current audit fail-closed and general readiness unchanged', () => {
    expect(DecibelMinimalCanaryReconciliationAuditV1).toMatchObject({
      generalAuthenticatedReconciliationReady: false,
      minimumExecutableFillIncrementProven: false,
      tradeHistoryFeeAsset: 'AVAILABLE_VIA_REST_ONLY',
      acceptedOrderRecoveryAfterPrePersistCrash: 'PARTIAL',
      canaryPerOrderHistoryCompleteness: 'UNPROVEN',
      canaryOrderLineageDurability: 'PARTIAL',
      minimalLiveCanaryReconciliationReady: false,
      liveExecutionEnabled: false,
      signerInitialized: false,
    });
  });
});
