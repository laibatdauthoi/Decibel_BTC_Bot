import { describe, expect, it } from 'vitest';
import {
  DECIBEL_REENTRY_DISTANCE_MAX_BPS_V1,
  DECIBEL_REENTRY_DISTANCE_MIN_BPS_V1,
  DECIBEL_TP_TARGET_NET_MAX_BPS_V1,
  DECIBEL_TP_TARGET_NET_MIN_BPS_V1,
  DECIBEL_ENTRY_REPLACEMENT_BAND_MAX_BPS_V1,
  DECIBEL_ENTRY_REPLACEMENT_BAND_MIN_BPS_V1,
  calculateDecibelMidpointRangeBpsV1,
  getDecibelEntryReplacementBandBpsV1,
  getDecibelReentryDistanceBpsV1,
  getDecibelReentryPriceLimitV1,
  getDecibelTPRescueOffsetBpsV1,
  getDecibelTPRescueTriggerBpsV1,
  getDecibelTPTargetNetBpsV1,
} from '../src/decibel_volatility_targets_v1.js';

describe('volatility targets', () => {
  it('measures the 5-minute midpoint range and refuses thin history', () => {
    const now = 1_000_000;
    const history = [
      { at: now - 290_000, midpoint: 80_000 },
      { at: now - 150_000, midpoint: 80_080 },
      { at: now - 10_000, midpoint: 80_040 },
      { at: now - 400_000, midpoint: 70_000 }, // outside the window
    ];
    expect(calculateDecibelMidpointRangeBpsV1(history, now)).toBeCloseTo((80 / 80_040) * 10_000, 9);
    // Less than 80% of the window covered: no measure.
    expect(
      calculateDecibelMidpointRangeBpsV1(
        [
          { at: now - 100_000, midpoint: 80_000 },
          { at: now, midpoint: 80_100 },
        ],
        now,
      ),
    ).toBeNull();
    expect(calculateDecibelMidpointRangeBpsV1([], now)).toBeNull();
  });

  it('scales the TP target with the range inside its floor and cap', () => {
    expect(getDecibelTPTargetNetBpsV1(null)).toBe(DECIBEL_TP_TARGET_NET_MIN_BPS_V1);
    expect(getDecibelTPTargetNetBpsV1(4)).toBe(DECIBEL_TP_TARGET_NET_MIN_BPS_V1); // quiet
    expect(getDecibelTPTargetNetBpsV1(10)).toBeCloseTo(2.5, 12); // typical
    expect(getDecibelTPTargetNetBpsV1(28.8)).toBeCloseTo(7.2, 12); // fast
    expect(getDecibelTPTargetNetBpsV1(400)).toBe(DECIBEL_TP_TARGET_NET_MAX_BPS_V1);
    expect(getDecibelTPTargetNetBpsV1(Number.NaN)).toBe(DECIBEL_TP_TARGET_NET_MIN_BPS_V1);
  });

  it('scales the re-entry distance with the range inside its floor and cap', () => {
    expect(getDecibelReentryDistanceBpsV1(undefined)).toBe(DECIBEL_REENTRY_DISTANCE_MIN_BPS_V1);
    expect(getDecibelReentryDistanceBpsV1(4)).toBe(DECIBEL_REENTRY_DISTANCE_MIN_BPS_V1);
    expect(getDecibelReentryDistanceBpsV1(18.6)).toBeCloseTo(9.3, 12);
    expect(getDecibelReentryDistanceBpsV1(100)).toBe(DECIBEL_REENTRY_DISTANCE_MAX_BPS_V1);
  });

  it('rounds re-entry limits away from the TP exit on the tick grid', () => {
    // 5 bps around 80,000 = 40 USD.
    expect(getDecibelReentryPriceLimitV1('BUY', 80_000, 5, 0.1)).toBe(79_960);
    expect(getDecibelReentryPriceLimitV1('SELL', 80_000, 5, 0.1)).toBe(80_040);
    expect(getDecibelReentryPriceLimitV1('BUY', 80_000.05, 5, 0.1)).toBe(79_960);
    expect(getDecibelReentryPriceLimitV1('SELL', 80_000.05, 5, 0.1)).toBe(80_040.1);
  });

  it('scales the entry replacement band with the range inside its floor and cap', () => {
    expect(getDecibelEntryReplacementBandBpsV1(null)).toBe(
      DECIBEL_ENTRY_REPLACEMENT_BAND_MIN_BPS_V1,
    );
    expect(getDecibelEntryReplacementBandBpsV1(4)).toBe(DECIBEL_ENTRY_REPLACEMENT_BAND_MIN_BPS_V1);
    expect(getDecibelEntryReplacementBandBpsV1(28.8)).toBeCloseTo(8.64, 12);
    expect(getDecibelEntryReplacementBandBpsV1(100)).toBe(
      DECIBEL_ENTRY_REPLACEMENT_BAND_MAX_BPS_V1,
    );
    expect(getDecibelEntryReplacementBandBpsV1(-1)).toBe(DECIBEL_ENTRY_REPLACEMENT_BAND_MIN_BPS_V1);
  });

  it('scales the rescue TP trigger and offset with the range', () => {
    expect(getDecibelTPRescueTriggerBpsV1(null)).toBe(10);
    expect(getDecibelTPRescueTriggerBpsV1(18.6)).toBeCloseTo(18.6, 12);
    expect(getDecibelTPRescueTriggerBpsV1(100)).toBe(30);
    expect(getDecibelTPRescueOffsetBpsV1(undefined)).toBe(2);
    expect(getDecibelTPRescueOffsetBpsV1(10)).toBeCloseTo(2.5, 12);
    expect(getDecibelTPRescueOffsetBpsV1(100)).toBe(8);
  });
});
