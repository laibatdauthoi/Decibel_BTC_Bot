import { describe, expect, it } from 'vitest';
import {
  DECIBEL_DCA_TRIGGER_BPS_V1,
  assessDecibelDCAV1,
  isDecibelDCAPriceAdmittedV1,
} from '../src/decibel_dca_v1.js';

describe('single DCA addition', () => {
  const long = {
    positionBase: 0.0004,
    entryBasis: 75000,
    markPrice: 74800,
    preferredEntrySizeUsd: 30,
    riskCapacityUsd: 60,
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

  it('refuses a second addition, missing evidence and exhausted capacity', () => {
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
    // 0.0007 BTC at 75000 = 52.5 USD >= 1.5 x 30 USD: the addition is already used.
    expect(assessDecibelDCAV1({ ...long, positionBase: 0.0007 }).reason).toBe(
      'DCA_ADDITION_ALREADY_USED',
    );
    // Capacity left 39 - 29.92 = 9.08 USD < a third of the position (9.97 USD).
    expect(assessDecibelDCAV1({ ...long, riskCapacityUsd: 39 })).toMatchObject({
      allowed: false,
      reason: 'DCA_RISK_CAPACITY_EXHAUSTED',
      maximumNotionalUsd: 0,
    });
  });
});
