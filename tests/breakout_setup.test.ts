import { describe, expect, it } from 'vitest';

import {
  detectBreakoutSetups,
  loadBreakoutSetupConfig,
  type breakout_setup_config,
} from '../src/breakout_setup.js';
import type { BTC_candlestick } from '../src/decibel_client.js';

const FIFTEEN_MINUTES_MS = 900_000;
const config: breakout_setup_config = {
  rangeWindow: 3,
  shortATRWindow: 2,
  longATRWindow: 4,
  compressionRatio: 0.5,
  volumeMultiple: 2,
};

function makeCandle(
  index: number,
  high: number,
  low: number,
  close = 100,
  volume = 10,
): BTC_candlestick {
  return {
    timestamp: new Date(index * FIFTEEN_MINUTES_MS),
    open: 100,
    high,
    low,
    close,
    volume,
  };
}

function makeCompressedHistory(breakout: BTC_candlestick): BTC_candlestick[] {
  return [
    makeCandle(0, 101, 99),
    makeCandle(1, 105, 95),
    makeCandle(2, 105, 95),
    makeCandle(3, 101, 99),
    makeCandle(4, 101, 99),
    breakout,
  ];
}

describe('breakout setup detector', () => {
  it('detects an exact bullish breakout from prior-only range, ATR, and volume data', () => {
    const setups = detectBreakoutSetups(
      makeCompressedHistory(makeCandle(5, 107, 99, 106, 21)),
      config,
      new Date(6 * FIFTEEN_MINUTES_MS),
    );

    expect(setups).toHaveLength(1);
    expect(setups[0]).toMatchObject({
      direction: 'BULLISH',
      breakoutLevel: 105,
      breakoutCandleTime: new Date(5 * FIFTEEN_MINUTES_MS),
      confirmedAtTime: new Date(6 * FIFTEEN_MINUTES_MS),
      volatilityRatio: 1 / 3,
      volumeRatio: 2.1,
    });
  });

  it('detects an exact bearish breakout', () => {
    const setups = detectBreakoutSetups(
      makeCompressedHistory(makeCandle(5, 101, 93, 94, 21)),
      config,
      new Date(6 * FIFTEEN_MINUTES_MS),
    );

    expect(setups[0]).toMatchObject({
      direction: 'BEARISH',
      breakoutLevel: 95,
      breakoutCandleTime: new Date(5 * FIFTEEN_MINUTES_MS),
      confirmedAtTime: new Date(6 * FIFTEEN_MINUTES_MS),
      volatilityRatio: 1 / 3,
      volumeRatio: 2.1,
    });
  });

  it('rejects false breakouts at the exact range boundaries', () => {
    const bullishBoundary = makeCompressedHistory(makeCandle(5, 107, 99, 105, 21));
    const bearishBoundary = makeCompressedHistory(makeCandle(5, 101, 93, 95, 21));

    expect(detectBreakoutSetups(bullishBoundary, config, new Date(6 * FIFTEEN_MINUTES_MS))).toEqual(
      [],
    );
    expect(detectBreakoutSetups(bearishBoundary, config, new Date(6 * FIFTEEN_MINUTES_MS))).toEqual(
      [],
    );
  });

  it('requires prior ATR compression', () => {
    const candles = makeCompressedHistory(makeCandle(5, 107, 99, 106, 21));
    candles[3] = makeCandle(3, 105, 95);
    candles[4] = makeCandle(4, 105, 95);

    expect(detectBreakoutSetups(candles, config, new Date(6 * FIFTEEN_MINUTES_MS))).toEqual([]);
  });

  it('requires volume to strictly exceed the configured median multiple', () => {
    const atBoundary = makeCompressedHistory(makeCandle(5, 107, 99, 106, 20));
    const belowBoundary = makeCompressedHistory(makeCandle(5, 107, 99, 106, 19));

    expect(detectBreakoutSetups(atBoundary, config, new Date(6 * FIFTEEN_MINUTES_MS))).toEqual([]);
    expect(detectBreakoutSetups(belowBoundary, config, new Date(6 * FIFTEEN_MINUTES_MS))).toEqual(
      [],
    );
  });

  it('returns no setup for insufficient or gapped data', () => {
    const complete = makeCompressedHistory(makeCandle(5, 107, 99, 106, 21));

    expect(detectBreakoutSetups(complete.slice(0, 5), config, new Date(10_000_000))).toEqual([]);
    expect(
      detectBreakoutSetups(
        complete.filter((_, index) => index !== 3),
        config,
        new Date(10_000_000),
      ),
    ).toEqual([]);
  });

  it('does not expose a setup during its still-open breakout candle or inspect later candles', () => {
    const breakout = makeCandle(5, 107, 99, 106, 21);
    const future = makeCandle(6, 1_001, 1, 1_000, 1_000);
    const candles = [...makeCompressedHistory(breakout), future];

    expect(detectBreakoutSetups(candles, config, breakout.timestamp)).toEqual([]);
    expect(
      detectBreakoutSetups(
        candles,
        config,
        new Date(breakout.timestamp.getTime() + FIFTEEN_MINUTES_MS / 2),
      ),
    ).toEqual([]);
    expect(detectBreakoutSetups(candles, config, new Date(6 * FIFTEEN_MINUTES_MS - 1))).toEqual([]);
    const confirmed = detectBreakoutSetups(candles, config, new Date(6 * FIFTEEN_MINUTES_MS));
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]?.breakoutCandleTime).toEqual(breakout.timestamp);
    expect(confirmed[0]?.confirmedAtTime).toEqual(
      new Date(breakout.timestamp.getTime() + FIFTEEN_MINUTES_MS),
    );
  });

  it('loads defaults and validates ATR window ordering', () => {
    expect(loadBreakoutSetupConfig({})).toEqual({
      rangeWindow: 20,
      shortATRWindow: 5,
      longATRWindow: 14,
      compressionRatio: 0.75,
      volumeMultiple: 1.5,
    });
    expect(() =>
      loadBreakoutSetupConfig({
        BREAKOUT_SHORT_ATR_WINDOW: '14',
        BREAKOUT_LONG_ATR_WINDOW: '14',
      }),
    ).toThrow('shortATRWindow must be less than longATRWindow');
  });
});
