import { describe, expect, it } from 'vitest';
import {
  DECIBEL_REENTRY_DISTANCE_MAX_BPS_V1,
  DECIBEL_REENTRY_DISTANCE_MIN_BPS_V1,
  DECIBEL_TP_TARGET_NET_MAX_BPS_V1,
  DECIBEL_TP_TARGET_NET_MIN_BPS_V1,
  DECIBEL_ENTRY_REPLACEMENT_BAND_MAX_BPS_V1,
  DECIBEL_ENTRY_REPLACEMENT_BAND_MIN_BPS_V1,
  calculateDecibelMidpointRangeBpsV1,
  countDecibelAdverseCandleClosesV1,
  getDecibelClosedCandlesV1,
  getDecibelEntryCandleBlockerV1,
  getDecibelEntryReplacementBandBpsV1,
  getDecibelEntryQuoteLimitsV1,
  getDecibelReentryDistanceBpsV1,
  getDecibelReentryPriceLimitV1,
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

  it('counts closed 5-minute candles since the price left the band without returning', () => {
    const minute = 60_000;
    const now = 1_800_000_000_000 + 2 * minute; // 2 minutes into a candle
    const series = (outsideFromMinutesAgo: number, insideAtMinutesAgo: number | null = null) =>
      Array.from({ length: 16 }, (_, i) => {
        const minutesAgo = 15 - i;
        const outside =
          minutesAgo <= outsideFromMinutesAgo &&
          (insideAtMinutesAgo === null || minutesAgo !== insideAtMinutesAgo);
        return { at: now - minutesAgo * minute, midpoint: outside ? 99 : 101 };
      });
    const isOutside = (midpoint: number) => midpoint <= 100;
    // Left 4 minutes ago: one boundary (2 minutes ago) has passed.
    expect(countDecibelAdverseCandleClosesV1(series(4), now, isOutside, null)).toBe(1);
    // Left 9 minutes ago: boundaries 7 and 2 minutes ago.
    expect(countDecibelAdverseCandleClosesV1(series(9), now, isOutside, null)).toBe(2);
    // A return inside the band 1 minute ago restarts the count from the latest sample.
    expect(countDecibelAdverseCandleClosesV1(series(12, 1), now, isOutside, null)).toBe(0);
    // A previous step 3 minutes ago counts from there.
    expect(countDecibelAdverseCandleClosesV1(series(12), now, isOutside, now - 3 * minute)).toBe(1);
    // Inside now: nothing to count.
    expect(countDecibelAdverseCandleClosesV1(series(12, 0), now, isOutside, null)).toBe(0);
  });

  it('lets an entry open only when it fades the last closed 5-minute candle', () => {
    const minute = 60_000;
    const now = 1_800_000_000_000 + 2 * minute;
    // Closed candles 12-7 and 7-2 minutes ago; one extreme sample in each.
    const samples = (previous: number, last: number) =>
      Array.from({ length: 15 }, (_, i) => {
        const minutesAgo = 14 - i;
        return {
          at: now - minutesAgo * minute,
          midpoint: minutesAgo === 9 ? previous : minutesAgo === 4 ? last : 100,
        };
      });
    // New low: a long may open, a short may not (no new high).
    expect(
      getDecibelEntryCandleBlockerV1('BUY', getDecibelClosedCandlesV1(samples(95, 94), now, 2)),
    ).toBeNull();
    expect(
      getDecibelEntryCandleBlockerV1('SELL', getDecibelClosedCandlesV1(samples(95, 94), now, 2)),
    ).toBe('ENTRY_REQUIRES_NEW_HIGH');
    // New high: the reverse.
    expect(
      getDecibelEntryCandleBlockerV1('SELL', getDecibelClosedCandlesV1(samples(105, 106), now, 2)),
    ).toBeNull();
    expect(
      getDecibelEntryCandleBlockerV1('BUY', getDecibelClosedCandlesV1(samples(105, 106), now, 2)),
    ).toBe('ENTRY_REQUIRES_NEW_LOW');
    expect(getDecibelEntryCandleBlockerV1('BUY', getDecibelClosedCandlesV1([], now, 2))).toBe(
      'ENTRY_CANDLE_EVIDENCE_REQUIRED',
    );
  });

  it('rests flat entries a volatility-scaled offset behind the touch', () => {
    // 0.3 x 20 bps = 6 bps: 70_000 x 0.9994 = 69_958 (BUY), 70_001 x 1.0006 = 70_043.0006 -> 70_043.1.
    expect(getDecibelEntryQuoteLimitsV1(70_000, 70_001, 20, 0.1)).toEqual({
      BUY: 69_958,
      SELL: 70_043.1,
    });
    // Capped at 20 bps.
    expect(getDecibelEntryQuoteLimitsV1(70_000, 70_001, 1_000, 0.1)!.BUY).toBe(69_860);
    // No range (minimum 0 bps) or an invalid book: quote at the touch.
    expect(getDecibelEntryQuoteLimitsV1(70_000, 70_001, null, 0.1)).toBeNull();
    expect(getDecibelEntryQuoteLimitsV1(70_001, 70_000, 20, 0.1)).toBeNull();
  });
});
