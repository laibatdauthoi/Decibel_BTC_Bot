import { describe, expect, it } from 'vitest';
import {
  isDecibelExchangeCandleSetFreshV1,
  mergeDecibelExchangeCandleSamplesV1,
  normalizeDecibelExchangeCandlesV1,
} from '../src/decibel_exchange_candles_v1.js';

const minute = 60_000;
const now = 1_800_000_000_000 + 30_000; // 30 s into a minute

describe('venue candles for the candle rules', () => {
  it('keeps closed, aligned, well-formed candles in order without duplicates', () => {
    const start = now - 30_000 - 2 * minute;
    const rows = [
      { t: start + minute, o: 100, h: 102, l: 99, c: 101 },
      { t: start, o: 100, h: 101, l: 98, c: 99 },
      { t: start, o: 100, h: 101, l: 98, c: 99 }, // duplicate
      { t: start + 2 * minute, o: 101, h: 103, l: 100, c: 102 }, // still forming
      { t: start + 7, o: 100, h: 101, l: 99, c: 100 }, // misaligned
      { t: start - minute, o: 100, h: 99, l: 98, c: 99 }, // high below open
      { t: start - 2 * minute, o: Number.NaN, h: 1, l: 1, c: 1 },
    ];
    const candles = normalizeDecibelExchangeCandlesV1(rows, now);
    expect(candles.map((c) => c.start)).toEqual([start, start + minute]);
    expect(isDecibelExchangeCandleSetFreshV1(candles, now)).toBe(true);
    expect(isDecibelExchangeCandleSetFreshV1(candles, now + 3 * minute)).toBe(false);
    expect(isDecibelExchangeCandleSetFreshV1([], now)).toBe(false);
  });

  it('turns candles into samples and continues with live BBO samples after them', () => {
    const start = now - 30_000 - minute;
    const candles = normalizeDecibelExchangeCandlesV1(
      [{ t: start, o: 100, h: 103, l: 97, c: 99 }],
      now,
    );
    const samples = mergeDecibelExchangeCandleSamplesV1(candles, [
      { at: start + 10_000, midpoint: 50 }, // inside the candle: dropped
      { at: now - 5_000, midpoint: 98.5 },
    ]);
    // A red candle reaches its high first, then its low.
    expect(samples.map((s) => s.midpoint)).toEqual([100, 103, 97, 99, 98.5]);
    expect(samples.at(-1)!.at).toBe(now - 5_000);
  });
});
