import { describe, expect, it } from 'vitest';
import {
  getDecibelEntryTrendBlockersV1,
  getDecibelTrendMoveBpsV1,
  mergeDecibelEntrySideBlockersV1,
} from '../src/decibel_entry_trend_v1.js';
import { DECIBEL_STRATEGY_POLICY_V1 } from '../src/decibel_strategy_policy_v1.js';
import {
  classifyDecibelRuntimeConditionV1,
  describeDecibelRuntimeConditionV1,
  isDecibelEntryOnlyReasonV1,
} from '../src/decibel_runtime_condition_v1.js';

const FIVE_MINUTES = 5 * 60_000;
const now = 1_800_000_000_000;
// 4 h of 5-minute candles, the oldest opening at 100,000.
const candles = Array.from({ length: 48 }, (_, i) => ({
  start: now - (48 - i) * FIVE_MINUTES,
  open: 100_000 - i * 10,
  high: 100_000 - i * 10 + 5,
  low: 100_000 - i * 10 - 5,
  close: 100_000 - (i + 1) * 10,
}));

describe('Entry trend filter', () => {
  it('uses a 4 hour lookback and a 150 bps move', () => {
    expect(DECIBEL_STRATEGY_POLICY_V1.entry.trendFilter).toEqual({
      lookbackMs: 4 * 60 * 60_000,
      maxMoveBps: 150,
    });
  });

  it('measures the move from the oldest candle inside the lookback to the midpoint', () => {
    expect(getDecibelTrendMoveBpsV1(candles, 98_000, now)).toBeCloseTo(-200, 6);
    expect(getDecibelTrendMoveBpsV1(candles, 101_000, now)).toBeCloseTo(100, 6);
    // Without history reaching back 80 % of the lookback, there is no trend reading.
    expect(getDecibelTrendMoveBpsV1(candles.slice(-30), 98_000, now)).toBeNull();
    expect(getDecibelTrendMoveBpsV1([], 98_000, now)).toBeNull();
  });

  it('blocks only the side against a move above the threshold', () => {
    expect(getDecibelEntryTrendBlockersV1(-200)).toEqual({
      BUY: 'ENTRY_AGAINST_TREND',
      SELL: null,
    });
    expect(getDecibelEntryTrendBlockersV1(200)).toEqual({ BUY: null, SELL: 'ENTRY_AGAINST_TREND' });
    expect(getDecibelEntryTrendBlockersV1(-150)).toEqual({ BUY: null, SELL: null });
    expect(getDecibelEntryTrendBlockersV1(null)).toEqual({ BUY: null, SELL: null });
  });

  it('keeps the trend blocker first and the candle filter for the other side', () => {
    expect(
      mergeDecibelEntrySideBlockersV1(
        { BUY: 'ENTRY_AGAINST_TREND', SELL: null },
        { BUY: 'ENTRY_REQUIRES_NEW_LOW', SELL: 'ENTRY_REQUIRES_NEW_HIGH' },
      ),
    ).toEqual({ BUY: 'ENTRY_AGAINST_TREND', SELL: 'ENTRY_REQUIRES_NEW_HIGH' });
    expect(mergeDecibelEntrySideBlockersV1({ BUY: null, SELL: null }, null)).toEqual({
      BUY: null,
      SELL: null,
    });
    expect(mergeDecibelEntrySideBlockersV1(null, undefined)).toBeNull();
  });

  it('is a normal entry wait for the dashboard, not a fault', () => {
    expect(classifyDecibelRuntimeConditionV1('ENTRY_AGAINST_TREND')).toBe('WAITING');
    expect(isDecibelEntryOnlyReasonV1('ENTRY_AGAINST_TREND')).toBe(true);
    expect(describeDecibelRuntimeConditionV1('ENTRY_AGAINST_TREND')).toMatch(
      /150 bps in the last 4 hours/,
    );
  });
});
