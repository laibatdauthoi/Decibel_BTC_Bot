import { describe, expect, it } from 'vitest';
import {
  buildDecibelMarketStructureV1,
  createDecibelMarketStructureV1,
} from '../src/decibel_market_structure_v1.js';

const minute = 60_000;
const now = 1_800_000_000_000 + 30_000;
const lastClosed = Math.floor(now / minute) * minute - minute;
// 20 closed 1-minute candles stepping down: the last 5-minute candle makes a new low.
const candles = (end: number) =>
  Array.from({ length: 20 }, (_, i) => {
    const start = end - (19 - i) * minute;
    const price = 80_000 - i * 2;
    return { start, open: price + 1, high: price + 2, low: price - 1, close: price };
  });

describe('decibel market structure v1', () => {
  it('reads fresh venue candles, with the two closed 5-minute candles computed once', () => {
    const structure = buildDecibelMarketStructureV1({
      exchangeCandles: candles(lastClosed),
      bboSamples: [],
      now,
    });
    expect(structure.source).toBe('EXCHANGE');
    expect(structure.computedAt).toBe(now);
    expect(structure.closedCandles).toHaveLength(2);
    const [previous, last] = structure.closedCandles!;
    expect(last!.low).toBeLessThan(previous!.low);
    expect(Object.isFrozen(structure)).toBe(true);
  });

  it('falls back to the BBO history when the venue candles are stale', () => {
    const bbo = [{ at: now - 1000, midpoint: 80_000 }];
    const structure = buildDecibelMarketStructureV1({
      exchangeCandles: candles(lastClosed - 10 * minute),
      bboSamples: bbo,
      now,
    });
    expect(structure.source).toBe('BBO_FALLBACK');
    expect(structure.samples).toEqual(bbo);
    expect(structure.closedCandles).toBeNull();
  });

  it('builds the same candles from explicit samples', () => {
    const samples = Array.from({ length: 41 }, (_, i) => ({
      at: now - (40 - i) * 30_000,
      midpoint: 100 - i * 0.01,
    }));
    const structure = createDecibelMarketStructureV1('BBO_FALLBACK', samples, now);
    expect(structure.closedCandles).toHaveLength(2);
    expect(structure.samples).toHaveLength(41);
  });
});
