import { describe, expect, it } from 'vitest';

import type { BTC_candlestick } from '../src/decibel_client.js';
import {
  detectMarketStructure,
  loadMarketStructureConfig,
  type market_structure_config,
} from '../src/market_structure.js';

const ONE_HOUR_MS = 3_600_000;
const oneBarConfig: market_structure_config = { leftBars: 1, rightBars: 1 };

function makeCandles(highs: readonly number[], lows: readonly number[]): BTC_candlestick[] {
  return highs.map((high, index) => {
    const low = lows[index];
    if (low === undefined) throw new Error('Test low is missing');
    const midpoint = (high + low) / 2;
    return {
      timestamp: new Date(index * ONE_HOUR_MS),
      open: midpoint,
      high,
      low,
      close: midpoint,
      volume: 1,
    };
  });
}

describe('market structure', () => {
  it('confirms a swing only after every right-side bar closes', () => {
    const candles = makeCandles([5, 6, 10, 7, 6], [4, 3, 2, 3, 4]);
    const config = { leftBars: 2, rightBars: 2 };

    expect(
      detectMarketStructure(candles, config, new Date(5 * ONE_HOUR_MS - 1)).swingHighs,
    ).toEqual([]);
    expect(detectMarketStructure(candles, config, new Date(5 * ONE_HOUR_MS)).swingHighs).toEqual([
      {
        type: 'SWING_HIGH',
        price: 10,
        pivotTime: new Date(2 * ONE_HOUR_MS),
        confirmedAtTime: new Date(5 * ONE_HOUR_MS),
      },
    ]);
  });

  it('does not classify equal highs or equal lows as swings', () => {
    const candles = makeCandles([5, 10, 10, 5], [4, 1, 1, 4]);
    const result = detectMarketStructure(candles, oneBarConfig, new Date(4 * ONE_HOUR_MS));

    expect(result.swingHighs).toEqual([]);
    expect(result.swingLows).toEqual([]);
    expect(result.regime).toBe('UNKNOWN');
  });

  it('classifies rising confirmed highs and lows as TREND_UP', () => {
    const result = detectMarketStructure(
      makeCandles([5, 10, 6, 12, 7], [4, 1, 5, 2, 6]),
      oneBarConfig,
      new Date(5 * ONE_HOUR_MS),
    );

    expect(result.regime).toBe('TREND_UP');
    expect(result.swingHighs.map((swing) => swing.price)).toEqual([10, 12]);
    expect(result.swingLows.map((swing) => swing.price)).toEqual([1, 2]);
  });

  it('classifies falling confirmed highs and lows as TREND_DOWN', () => {
    const result = detectMarketStructure(
      makeCandles([7, 12, 6, 10, 5], [6, 2, 5, 1, 4]),
      oneBarConfig,
      new Date(5 * ONE_HOUR_MS),
    );

    expect(result.regime).toBe('TREND_DOWN');
  });

  it('classifies mixed confirmed structure as RANGE', () => {
    const result = detectMarketStructure(
      makeCandles([5, 10, 6, 12, 7], [4, 2, 5, 1, 6]),
      oneBarConfig,
      new Date(5 * ONE_HOUR_MS),
    );

    expect(result.regime).toBe('RANGE');
  });

  it('returns UNKNOWN until two confirmed highs and lows exist', () => {
    const result = detectMarketStructure(
      makeCandles([5, 10, 6], [4, 1, 5]),
      oneBarConfig,
      new Date(3 * ONE_HOUR_MS),
    );

    expect(result.swingHighs).toHaveLength(1);
    expect(result.swingLows).toHaveLength(1);
    expect(result.regime).toBe('UNKNOWN');
  });

  it('ignores future candles and exposes the pivot exactly at confirmation time', () => {
    const candles = makeCandles([5, 10, 6, 100], [4, 1, 5, 0.5]);

    expect(
      detectMarketStructure(candles, oneBarConfig, new Date(3 * ONE_HOUR_MS - 1)).swingHighs,
    ).toEqual([]);
    const confirmed = detectMarketStructure(candles, oneBarConfig, new Date(3 * ONE_HOUR_MS));
    expect(confirmed.swingHighs).toHaveLength(1);
    expect(confirmed.swingHighs[0]?.pivotTime).toEqual(new Date(ONE_HOUR_MS));
    expect(confirmed.swingHighs[0]?.confirmedAtTime).toEqual(new Date(3 * ONE_HOUR_MS));
  });

  it('loads and validates configurable left/right bars', () => {
    expect(loadMarketStructureConfig({})).toEqual({ leftBars: 2, rightBars: 2 });
    expect(loadMarketStructureConfig({ SWING_LEFT_BARS: '3', SWING_RIGHT_BARS: '4' })).toEqual({
      leftBars: 3,
      rightBars: 4,
    });
    expect(() => loadMarketStructureConfig({ SWING_LEFT_BARS: '0' })).toThrow();
  });
});
