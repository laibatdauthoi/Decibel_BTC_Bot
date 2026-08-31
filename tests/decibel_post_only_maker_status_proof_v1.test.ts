import { describe, expect, it } from 'vitest';

import {
  applyDecibelActualFillTruthV1,
  createDecibelActualFillLedgerV1,
} from '../src/decibel_actual_fill_truth_v1.js';
import {
  DecibelActualFillTruthContractV1,
  DecibelPostOnlyMakerStatusAuditV1,
  ingestDecibelAuthenticatedOwnFillsDryRunV1,
  normalizeDecibelActualMakerFillTruthV1,
  proveDecibelAuthenticatedMakerStatusV1,
  type decibel_authenticated_post_only_order_lineage_v1,
  type decibel_authenticated_user_trade_v1,
} from '../src/decibel_post_only_maker_status_proof_v1.js';

const Order: decibel_authenticated_post_only_order_lineage_v1 = {
  source: 'AUTHENTICATED_ORDER_DETAILS',
  venueOrderId: 'venue-order-1',
  localIntentId: 'intent-1',
  localExecutionRequestId: 'request-1',
  marketAddress: 'btc-market',
  side: 'BUY',
  requestedQuantity: 0.003,
  acceptedTimeInForce: 1,
  acceptedByVenue: true,
};

const Trade: decibel_authenticated_user_trade_v1 = {
  source: 'OrderFill',
  tradeId: 'trade-1',
  orderId: Order.venueOrderId,
  marketAddress: Order.marketAddress,
  side: Order.side,
  size: 0.001,
  price: 60_000,
  feeAmount: 0.0066,
  isRebate: false,
  transactionVersion: 123,
  transactionUnixMs: 1_700_000_000_000,
  receivedAt: new Date('2026-08-30T00:00:00.000Z'),
};

describe('Decibel Post-Only Maker Status Proof V1', () => {
  it('records the exact contract and proven readiness without enabling live execution', () => {
    expect(DecibelPostOnlyMakerStatusAuditV1.installedContract).toMatchObject({
      representation: 'TimeInForce.PostOnly',
      wireValue: 1,
    });
    expect(DecibelPostOnlyMakerStatusAuditV1.classification).toBe(
      'POST_ONLY_MAKER_CONTRACT_PROVEN',
    );
    expect(DecibelPostOnlyMakerStatusAuditV1.authoritativeMakerStatusAvailable).toBe(true);
    expect(DecibelActualFillTruthContractV1.actualFillTruthAvailable).toBe(true);
    expect(DecibelActualFillTruthContractV1.liveExecutionEnabled).toBe(false);
  });

  it('requires authenticated accepted PostOnly lineage and an exact venue-order match', () => {
    expect(
      proveDecibelAuthenticatedMakerStatusV1({
        order: Order,
        venueFillId: Trade.tradeId,
        fillVenueOrderId: Trade.orderId,
      }),
    ).toMatchObject({
      makerStatus: 'MAKER',
      proofSource: 'ACCEPTED_POST_ONLY_ORDER_CONTRACT',
    });
    expect(() =>
      proveDecibelAuthenticatedMakerStatusV1({
        order: { ...Order, acceptedByVenue: false },
        venueFillId: Trade.tradeId,
        fillVenueOrderId: Trade.orderId,
      }),
    ).toThrow('DECIBEL_ACCEPTED_POST_ONLY_LINEAGE_REQUIRED');
    expect(() =>
      proveDecibelAuthenticatedMakerStatusV1({
        order: { ...Order, acceptedTimeInForce: 0 },
        venueFillId: Trade.tradeId,
        fillVenueOrderId: Trade.orderId,
      }),
    ).toThrow('DECIBEL_ACCEPTED_POST_ONLY_LINEAGE_REQUIRED');
    expect(() =>
      proveDecibelAuthenticatedMakerStatusV1({
        order: Order,
        venueFillId: Trade.tradeId,
        fillVenueOrderId: 'replacement-order',
      }),
    ).toThrow('DECIBEL_POST_ONLY_ORDER_FILL_LINEAGE_MISMATCH');
  });

  it('normalizes separate partial fills and applies each trade_id exactly once', () => {
    const first = normalizeDecibelActualMakerFillTruthV1({ trade: Trade, order: Order });
    const second = normalizeDecibelActualMakerFillTruthV1({
      order: Order,
      trade: { ...Trade, tradeId: 'trade-2', size: 0.002, feeAmount: 0.0132 },
    });
    expect(first).toMatchObject({
      makerOrTaker: 'MAKER',
      executedUsdNotional: 60,
      fee: { availability: 'AVAILABLE', amount: 0.0066, currency: null },
    });
    let ledger = createDecibelActualFillLedgerV1([
      {
        venueOrderId: Order.venueOrderId,
        localIntentId: Order.localIntentId,
        localExecutionRequestId: Order.localExecutionRequestId,
        marketAddress: Order.marketAddress,
        side: Order.side,
        requestedQuantity: Order.requestedQuantity,
      },
    ]);
    ledger = applyDecibelActualFillTruthV1(ledger, first);
    expect(applyDecibelActualFillTruthV1(ledger, first)).toBe(ledger);
    ledger = applyDecibelActualFillTruthV1(ledger, second);
    expect(ledger.fills.map((fill) => fill.venueFillId)).toEqual(['trade-1', 'trade-2']);
    expect(ledger.actualExternalMakerVolumeUsd).toBe(180);
    expect(ledger.inventoryBase).toBe(0.003);
  });

  it('fails closed on conflicting fill identity and non-authenticated fill sources', () => {
    const fill = normalizeDecibelActualMakerFillTruthV1({ trade: Trade, order: Order });
    let ledger = createDecibelActualFillLedgerV1([
      {
        venueOrderId: Order.venueOrderId,
        localIntentId: Order.localIntentId,
        localExecutionRequestId: Order.localExecutionRequestId,
        marketAddress: Order.marketAddress,
        side: Order.side,
        requestedQuantity: Order.requestedQuantity,
      },
    ]);
    ledger = applyDecibelActualFillTruthV1(ledger, fill);
    expect(() =>
      applyDecibelActualFillTruthV1(ledger, {
        ...fill,
        executedPrice: 60_001,
        executedUsdNotional: 60_001 * fill.executedBaseQuantity,
      }),
    ).toThrow('DECIBEL_ACTUAL_FILL_ID_CONFLICT');
    expect(() =>
      normalizeDecibelActualMakerFillTruthV1({
        order: Order,
        trade: { ...Trade, source: 'PublicMarketTrade' } as never,
      }),
    ).toThrow('DECIBEL_AUTHENTICATED_USER_TRADE_INVALID');
  });

  it('ingests authenticated fills only in dry-run mode and never submits an order', () => {
    const ledger = createDecibelActualFillLedgerV1([
      {
        venueOrderId: Order.venueOrderId,
        localIntentId: Order.localIntentId,
        localExecutionRequestId: Order.localExecutionRequestId,
        marketAddress: Order.marketAddress,
        side: Order.side,
        requestedQuantity: Order.requestedQuantity,
      },
    ]);
    expect(
      ingestDecibelAuthenticatedOwnFillsDryRunV1({
        executionMode: 'AUTHENTICATED_DRY_RUN',
        ledger,
        orders: [Order],
        trades: [Trade],
      }).fills,
    ).toHaveLength(1);
    expect(() =>
      ingestDecibelAuthenticatedOwnFillsDryRunV1({
        executionMode: 'LIVE',
        ledger,
        orders: [Order],
        trades: [Trade],
      }),
    ).toThrow('DECIBEL_ACTUAL_FILL_INGESTION_DRY_RUN_ONLY');
  });
});
