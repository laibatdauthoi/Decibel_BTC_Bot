import { describe, expect, it } from 'vitest';

import {
  DecibelAuthenticatedOwnFillTruthAcquisitionReportV1,
  assessDecibelCumulativeExecutionDeltaSafetyV1,
  assessDecibelUserTradeForActualFillTruthV1,
} from '../src/decibel_authenticated_own_fill_truth_acquisition_v1.js';

const OwnTrade = {
  source: 'OrderFill',
  tradeId: 'venue-trade-1',
  orderId: 'venue-order-1',
  size: 0.0002,
  price: 80_000,
  transactionVersion: 123,
  isRebate: true,
  feeAmount: 0.01,
};

describe('Decibel Authenticated Own-Fill Truth Acquisition V1', () => {
  it('recognizes authoritative execution identity, quantity, price and fee without inventing maker status', () => {
    expect(assessDecibelUserTradeForActualFillTruthV1(OwnTrade)).toEqual({
      authoritativeExecution: true,
      uniqueExecutionIdentityAvailable: true,
      quantityAvailable: true,
      priceAvailable: true,
      feeAmountAvailable: true,
      makerStatusAvailable: false,
      actualFillTruthConstructible: false,
      blockingReason: 'AUTHENTICATED_POST_ONLY_ORDER_LINEAGE_REQUIRED',
    });
  });

  it('does not treat rebate or an own trade without post-only lineage as maker proof', () => {
    expect(
      assessDecibelUserTradeForActualFillTruthV1({ ...OwnTrade, isRebate: false }),
    ).toMatchObject({ makerStatusAvailable: false, actualFillTruthConstructible: false });
    expect(DecibelAuthenticatedOwnFillTruthAcquisitionReportV1.postOnlyAcceptedImpliesMaker).toBe(
      'PROVEN',
    );
  });

  it.each(['MarginCall', 'BackStopLiquidation', 'ADL', 'MarketDelisted', 'PUBLIC_TRADE'])(
    'does not admit %s as our order-fill truth',
    (source) => {
      expect(assessDecibelUserTradeForActualFillTruthV1({ ...OwnTrade, source })).toMatchObject({
        authoritativeExecution: false,
        actualFillTruthConstructible: false,
      });
    },
  );

  it('keeps open-order disappearance and cancellation separate from fills', () => {
    expect(
      DecibelAuthenticatedOwnFillTruthAcquisitionReportV1.sources.openOrders
        .disappearanceProvesFill,
    ).toBe(false);
    expect(
      DecibelAuthenticatedOwnFillTruthAcquisitionReportV1.sources.userNotifications
        .notificationTypes,
    ).toContain('OrderCancelled');
  });

  it('rejects cumulative deltas without every authoritative safety fact', () => {
    const base = {
      sameVenueOrder: true,
      monotonicCumulativeQuantity: true,
      orderedAndVersioned: true,
      duplicateDetectable: true,
      cumulativeNotionalAvailable: true,
      terminalStatusConfirmed: true,
      makerStatusIndependentlyProven: true,
    };
    expect(assessDecibelCumulativeExecutionDeltaSafetyV1(base).safe).toBe(true);
    expect(
      assessDecibelCumulativeExecutionDeltaSafetyV1({
        ...base,
        makerStatusIndependentlyProven: false,
      }),
    ).toEqual({ safe: false, classification: 'CUMULATIVE_DELTA_FILL_TRUTH_UNSAFE' });
  });

  it('classifies the joined authenticated contract as complete while keeping live disabled', () => {
    expect(DecibelAuthenticatedOwnFillTruthAcquisitionReportV1).toMatchObject({
      authoritativeFillIdAvailable: true,
      authoritativeExecutedQuantityAvailable: true,
      authoritativeExecutedPriceAvailable: true,
      authoritativeMakerStatusAvailable: true,
      authoritativeExecutionFeeAvailable: true,
      ownFillTruthContract: 'COMPLETE',
      actualFillTruthAvailable: true,
      smallestRemainingBlocker: null,
      liveExecutionEnabled: false,
      signerInitialized: false,
    });
  });
});
