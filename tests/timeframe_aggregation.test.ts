import { describe, expect, it } from 'vitest';

import type { BTC_candlestick } from '../src/decibel_client.js';
import { aggregateCompletedCandles, buildBTCTimeframes } from '../src/timeframe_aggregation.js';

const FIVE_MINUTES_MS = 300_000;

function makeCandle(index: number, overrides: Partial<BTC_candlestick> = {}): BTC_candlestick {
  const open = 100 + index;
  return {
    timestamp: new Date(index * FIVE_MINUTES_MS),
    open,
    high: open + 2,
    low: open - 2,
    close: open + 1,
    volume: index + 1,
    ...overrides,
  };
}

describe('timeframe aggregation', () => {
  it('aggregates exact UTC-aligned 15m OHLCV boundaries', () => {
    const candles = [
      makeCandle(0, { open: 100, high: 105, low: 99, close: 102, volume: 0.1 }),
      makeCandle(1, { open: 102, high: 108, low: 101, close: 107, volume: 0.2 }),
      makeCandle(2, { open: 107, high: 109, low: 98, close: 103, volume: 0.3 }),
    ];

    expect(aggregateCompletedCandles(candles, '15m')).toEqual([
      {
        timestamp: new Date(0),
        open: 100,
        high: 109,
        low: 98,
        close: 103,
        volume: 0.6,
      },
    ]);
  });

  it('aggregates 12 five-minute candles into one UTC-aligned hour', () => {
    const candles = Array.from({ length: 12 }, (_, index) => makeCandle(index));

    expect(aggregateCompletedCandles(candles, '1h')).toEqual([
      {
        timestamp: new Date(0),
        open: 100,
        high: 113,
        low: 98,
        close: 112,
        volume: 78,
      },
    ]);
  });

  it('rejects gaps, duplicates, unordered timestamps, and misalignment', () => {
    expect(() => buildBTCTimeframes([makeCandle(0), makeCandle(2)], new Date(1_000_000))).toThrow(
      'gap',
    );
    expect(() => buildBTCTimeframes([makeCandle(0), makeCandle(0)], new Date(1_000_000))).toThrow(
      'duplicate',
    );
    expect(() => buildBTCTimeframes([makeCandle(1), makeCandle(0)], new Date(1_000_000))).toThrow(
      'unordered',
    );
    expect(() =>
      buildBTCTimeframes([makeCandle(0, { timestamp: new Date(1) })], new Date(1_000_000)),
    ).toThrow('misaligned');
  });

  it('reports exact internal gap diagnostics', () => {
    expect(() => buildBTCTimeframes([makeCandle(0), makeCandle(2)], new Date(900_000))).toThrow(
      'previousTimestamp=1970-01-01T00:00:00.000Z, nextTimestamp=1970-01-01T00:10:00.000Z, expectedTimestamp=1970-01-01T00:05:00.000Z, missingIntervalCount=1',
    );
  });

  it('rejects incomplete and non-aligned aggregate groups', () => {
    expect(() => aggregateCompletedCandles([makeCandle(0), makeCandle(1)], '15m')).toThrow(
      'Incomplete 15m',
    );
    expect(() =>
      aggregateCompletedCandles([makeCandle(1), makeCandle(2), makeCandle(3)], '15m'),
    ).toThrow('UTC-aligned');
  });

  it('returns every timeframe chronologically and omits boundary fragments', () => {
    const candles = Array.from({ length: 14 }, (_, index) => makeCandle(index + 1));
    const timeframes = buildBTCTimeframes(candles, new Date(15 * FIVE_MINUTES_MS));

    expect(timeframes['5m']).toHaveLength(14);
    expect(timeframes['15m'].map((candle) => candle.timestamp)).toEqual([
      new Date(3 * FIVE_MINUTES_MS),
      new Date(6 * FIVE_MINUTES_MS),
      new Date(9 * FIVE_MINUTES_MS),
      new Date(12 * FIVE_MINUTES_MS),
    ]);
    expect(timeframes['1h']).toEqual([]);
  });

  it('never uses an unfinished 5m candle or exposes unfinished higher timeframes', () => {
    const completed = Array.from({ length: 12 }, (_, index) => makeCandle(index));
    const unfinished = makeCandle(12, {
      open: 1_000_000,
      high: 1_000_001,
      low: 999_999,
      close: 1_000_000,
      volume: 1_000_000,
    });
    const timeframes = buildBTCTimeframes(
      [...completed, unfinished],
      new Date(12 * FIVE_MINUTES_MS + 1),
    );

    expect(timeframes['5m']).toEqual(completed);
    expect(timeframes['15m']).toHaveLength(4);
    expect(timeframes['1h']).toHaveLength(1);
    expect(timeframes['1h'][0]?.high).toBe(113);
    expect(timeframes['1h'][0]?.volume).toBe(78);
  });
});
