import { describe, expect, it } from 'vitest';
import {
  DECIBEL_DCA_TRIGGER_BPS_V1,
  assessDecibelDCAV1,
  countDecibelOpeningOrdersV1,
  isDecibelDCAPriceAdmittedV1,
} from '../src/decibel_dca_v1.js';
import {
  applyDecibelActualFillTruthV1,
  createDecibelActualFillLedgerV1,
} from '../src/decibel_actual_fill_truth_v1.js';
import type { decibel_production_live_snapshot_v1 } from '../src/decibel_production_live_orchestrator_v1.js';

describe('single DCA addition', () => {
  const long = {
    positionBase: 0.0004,
    entryBasis: 75000,
    markPrice: 74800,
    preferredEntrySizeUsd: 30,
    riskCapacityUsd: 60,
    openingOrderCount: 1,
  };

  it('admits one addition capped by the preferred size and the remaining risk capacity', () => {
    const admitted = assessDecibelDCAV1(long);
    expect(admitted).toMatchObject({ allowed: true, reason: 'DCA_ADMITTED', side: 'BUY' });
    // Preferred 30 USD; capacity left 60 - 0.0004 * 74800 = 30.08 USD.
    expect(admitted.maximumNotionalUsd).toBeCloseTo(30, 9);
    expect(admitted.priceLimit).toBeCloseTo(75000 * (1 - DECIBEL_DCA_TRIGGER_BPS_V1 / 10_000), 9);
    const tighter = assessDecibelDCAV1({ ...long, riskCapacityUsd: 50 });
    expect(tighter.maximumNotionalUsd).toBeCloseTo(50 - 0.0004 * 74800, 9);
  });

  it('mirrors the limit for a short and admits only prices far enough adverse', () => {
    const short = assessDecibelDCAV1({ ...long, positionBase: -0.0004, markPrice: 75200 });
    expect(short).toMatchObject({ allowed: true, side: 'SELL' });
    expect(short.priceLimit).toBeCloseTo(75000 * 1.0025, 9);
    expect(isDecibelDCAPriceAdmittedV1(short, 'SELL', 75190)).toBe(true);
    expect(isDecibelDCAPriceAdmittedV1(short, 'SELL', 75180)).toBe(false);
    expect(isDecibelDCAPriceAdmittedV1(short, 'BUY', 75190)).toBe(false);
    const buy = assessDecibelDCAV1(long);
    expect(isDecibelDCAPriceAdmittedV1(buy, 'BUY', 74812.5)).toBe(true);
    expect(isDecibelDCAPriceAdmittedV1(buy, 'BUY', 74820)).toBe(false);
  });

  it('allows two additions, then refuses; refuses missing evidence and exhausted capacity', () => {
    expect(assessDecibelDCAV1({ ...long, positionBase: 0 }).reason).toBe('DCA_POSITION_REQUIRED');
    expect(assessDecibelDCAV1({ ...long, entryBasis: null }).reason).toBe(
      'DCA_ENTRY_BASIS_REQUIRED',
    );
    expect(assessDecibelDCAV1({ ...long, preferredEntrySizeUsd: undefined }).reason).toBe(
      'DCA_ENTRY_SIZE_REQUIRED',
    );
    expect(assessDecibelDCAV1({ ...long, riskCapacityUsd: undefined }).reason).toBe(
      'DCA_RISK_CAPACITY_REQUIRED',
    );
    // Entry + one addition: a second addition is still allowed; entry + two is the limit.
    expect(assessDecibelDCAV1({ ...long, openingOrderCount: 2 }).allowed).toBe(true);
    expect(assessDecibelDCAV1({ ...long, openingOrderCount: 3 }).reason).toBe('DCA_ADDITIONS_USED');
    expect(assessDecibelDCAV1({ ...long, openingOrderCount: null }).reason).toBe(
      'DCA_FILL_HISTORY_REQUIRED',
    );
    // Capacity left 39 - 29.92 = 9.08 USD < a third of the position (9.97 USD).
    expect(assessDecibelDCAV1({ ...long, riskCapacityUsd: 39 })).toMatchObject({
      allowed: false,
      reason: 'DCA_RISK_CAPACITY_EXHAUSTED',
      maximumNotionalUsd: 0,
    });
  });

  it('counts filled opening orders in the current position epoch only', () => {
    const market = '0xmarket';
    const order = (id: string, side: 'BUY' | 'SELL', quantity: number) => ({
      venueOrderId: id,
      localIntentId: id,
      localExecutionRequestId: id,
      marketAddress: market,
      side,
      requestedQuantity: quantity,
    });
    const orders = [
      order('old-entry', 'BUY', 0.0002),
      order('old-tp', 'SELL', 0.0002),
      order('entry', 'BUY', 0.0004),
      order('dca', 'BUY', 0.0002),
      order('tp-partial', 'SELL', 0.0001),
    ];
    const fill = (
      id: string,
      orderId: string,
      side: 'BUY' | 'SELL',
      quantity: number,
      at: number,
    ) => ({
      venueFillId: id,
      venueOrderId: orderId,
      localExecutionRequestId: orderId,
      marketAddress: market,
      side,
      executedPrice: 75000,
      executedBaseQuantity: quantity,
      executedUsdNotional: quantity * 75000,
      makerOrTaker: 'MAKER' as const,
      receivedAt: new Date(at),
      venueTimestamp: new Date(at),
      fee: { availability: 'AVAILABLE' as const, amount: 0.001, currency: 'USD' },
      rebate: { availability: 'UNAVAILABLE' as const, amount: null, currency: null },
      executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM' as const,
    });
    let ledger = createDecibelActualFillLedgerV1(orders);
    const steps: Array<[string, string, 'BUY' | 'SELL', number]> = [
      ['f1', 'old-entry', 'BUY', 0.0002],
      ['f2', 'old-tp', 'SELL', 0.0002], // flat: a new epoch starts
      ['f3', 'entry', 'BUY', 0.0001],
      ['f4', 'entry', 'BUY', 0.0003], // same order, partial fills
    ];
    const count = () =>
      countDecibelOpeningOrdersV1({
        input: { actualFillLedger: ledger, actualInventoryBase: ledger.inventoryBase },
      } as unknown as decibel_production_live_snapshot_v1);
    steps.forEach(([id, orderId, side, quantity], i) => {
      ledger = applyDecibelActualFillTruthV1(ledger, fill(id, orderId, side, quantity, 1000 + i));
    });
    expect(count()).toBe(1);
    ledger = applyDecibelActualFillTruthV1(ledger, fill('f5', 'dca', 'BUY', 0.0002, 2000));
    expect(count()).toBe(2);
    // A partial reduction does not consume or reset the additions.
    ledger = applyDecibelActualFillTruthV1(ledger, fill('f6', 'tp-partial', 'SELL', 0.0001, 3000));
    expect(count()).toBe(2);
  });
});
