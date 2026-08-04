import { describe, expect, it } from 'vitest';

import { backtesting_engine, type strategy_position } from '../src/backtesting_engine.js';
import type { BTC_candlestick } from '../src/decibel_client.js';
import {
  ema_trend_strategy,
  loadBacktestCommandConfig,
  type EMA_trend_strategy_config,
} from '../src/ema_trend_strategy.js';

const strategyConfig: EMA_trend_strategy_config = {
  fastPeriod: 9,
  slowPeriod: 21,
  trendPeriod: 50,
  maximumHoldingBars: 48,
};

function makeCandles(closes: readonly number[]): BTC_candlestick[] {
  return closes.map((close, index) => ({
    timestamp: new Date(index * 300_000),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
}

function makePosition(side: 'LONG' | 'SHORT', entryIndex = 49): strategy_position {
  return {
    side,
    entryTime: new Date(entryIndex * 300_000),
    entryPrice: 100,
    quantity: 1,
    stopLossPrice: side === 'LONG' ? 90 : 110,
    takeProfitPrice: side === 'LONG' ? 120 : 80,
  };
}

function evaluate(closes: readonly number[], position: strategy_position | null = null) {
  const Strategy = new ema_trend_strategy(strategyConfig);
  return Strategy.evaluate({ candles: makeCandles(closes), equity: 1_000, position });
}

describe('ema_trend_strategy', () => {
  it('requires 50 completed warm-up candles', () => {
    expect(evaluate([...Array<number>(48).fill(100), 120])).toBe('HOLD');
    expect(evaluate([...Array<number>(49).fill(100), 120])).toBe('LONG');
  });

  it('returns LONG only for an upward fast/slow cross above the trend EMA', () => {
    expect(evaluate([...Array<number>(49).fill(100), 120])).toBe('LONG');
    expect(evaluate([...Array<number>(49).fill(100), 99])).not.toBe('LONG');
  });

  it('returns SHORT only for a downward fast/slow cross below the trend EMA', () => {
    expect(evaluate([...Array<number>(49).fill(100), 80])).toBe('SHORT');
    expect(evaluate([...Array<number>(49).fill(100), 101])).not.toBe('SHORT');
  });

  it('exits a long on a downward cross and a short on an upward cross', () => {
    expect(evaluate([...Array<number>(49).fill(100), 80], makePosition('LONG'))).toBe('EXIT');
    expect(evaluate([...Array<number>(49).fill(100), 120], makePosition('SHORT'))).toBe('EXIT');
  });

  it('exits after the configured maximum holding period', () => {
    const Strategy = new ema_trend_strategy({ ...strategyConfig, maximumHoldingBars: 3 });
    const candles = makeCandles(Array<number>(50).fill(100));

    expect(Strategy.evaluate({ candles, equity: 1_000, position: makePosition('LONG', 47) })).toBe(
      'EXIT',
    );
    expect(Strategy.evaluate({ candles, equity: 1_000, position: makePosition('LONG', 48) })).toBe(
      'HOLD',
    );
  });

  it('uses no future candle and fills the cross signal at the next open', () => {
    const candles = makeCandles([...Array<number>(49).fill(100), 120, 130]);
    const Engine = new backtesting_engine({
      startingEquity: 1_000,
      makerFeeRate: 0,
      takerFeeRate: 0,
      slippageRate: 0,
      leverage: 1,
      positionRisk: 0.1,
      stopLossRate: 0.1,
      takeProfitRate: 1,
    });

    const result = Engine.run(candles, new ema_trend_strategy(strategyConfig));

    expect(result.trades[0]).toMatchObject({
      entryTime: candles[50]?.timestamp,
      entryPrice: 130,
      exitReason: 'FINAL_CANDLE',
    });
  });

  it('validates configurable periods, holding bars, and verbose mode', () => {
    expect(loadBacktestCommandConfig({})).toEqual({ ...strategyConfig, verbose: false });
    expect(loadBacktestCommandConfig({ BACKTEST_VERBOSE: 'true' }).verbose).toBe(true);
    expect(() => new ema_trend_strategy({ ...strategyConfig, fastPeriod: 21 })).toThrow(
      'fastPeriod < slowPeriod < trendPeriod',
    );
    expect(() => new ema_trend_strategy({ ...strategyConfig, slowPeriod: 50 })).toThrow(
      'fastPeriod < slowPeriod < trendPeriod',
    );
    expect(() => new ema_trend_strategy({ ...strategyConfig, maximumHoldingBars: 0 })).toThrow();
    expect(() => loadBacktestCommandConfig({ BACKTEST_VERBOSE: 'yes' })).toThrow();
  });
});
