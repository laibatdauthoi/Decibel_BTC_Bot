import { describe, expect, it } from 'vitest';

import {
  backtesting_engine,
  type backtest_config,
  type backtest_signal,
  type backtest_strategy,
  type strategy_context,
} from '../src/backtesting_engine.js';
import type { BTC_candlestick } from '../src/decibel_client.js';

const baseConfig: backtest_config = {
  startingEquity: 1_000,
  makerFeeRate: 0,
  takerFeeRate: 0,
  slippageRate: 0,
  leverage: 1,
  positionRisk: 0.1,
  stopLossRate: 0.1,
  takeProfitRate: 1,
};

function makeCandle(
  index: number,
  open: number,
  high = open,
  low = open,
  close = open,
): BTC_candlestick {
  return {
    timestamp: new Date(index * 300_000),
    open,
    high,
    low,
    close,
    volume: 1,
  };
}

class sequence_strategy implements backtest_strategy {
  constructor(private readonly signals: backtest_signal[]) {}

  evaluate(context: strategy_context): backtest_signal {
    return this.signals[context.candles.length - 1] ?? 'HOLD';
  }
}

describe('backtesting_engine', () => {
  it('fills a signal at the next candle open without exposing future candles', () => {
    const observedLengths: number[] = [];
    const strategy: backtest_strategy = {
      evaluate(context) {
        observedLengths.push(context.candles.length);
        return context.candles.length === 1
          ? 'LONG'
          : context.candles.length === 2
            ? 'EXIT'
            : 'HOLD';
      },
    };
    const Engine = new backtesting_engine(baseConfig);

    const result = Engine.run(
      [makeCandle(0, 100), makeCandle(1, 110), makeCandle(2, 120)],
      strategy,
    );

    expect(observedLengths).toEqual([1, 2, 3]);
    expect(result.trades[0]).toMatchObject({
      entryTime: new Date(300_000),
      entryPrice: 110,
      exitTime: new Date(600_000),
      exitPrice: 120,
      exitReason: 'SIGNAL',
    });
  });

  it('models taker fees and long realized PnL', () => {
    const Engine = new backtesting_engine({ ...baseConfig, takerFeeRate: 0.01 });

    const result = Engine.run(
      [makeCandle(0, 100), makeCandle(1, 100), makeCandle(2, 100)],
      new sequence_strategy(['LONG', 'EXIT']),
    );

    expect(result.trades[0]).toMatchObject({ grossPnL: 0, fees: 20, realizedPnL: -20 });
    expect(result.tradingFeeCost).toBe(20);
    expect(result.endingEquity).toBe(980);
    expect(result.averageWin).toBe(0);
    expect(result.averageLoss).toBe(-20);
    expect(result.expectancyPerTrade).toBe(-20);
  });

  it('models short fills, adverse slippage, and PnL', () => {
    const Engine = new backtesting_engine({ ...baseConfig, slippageRate: 0.01 });

    const result = Engine.run(
      [makeCandle(0, 100), makeCandle(1, 100), makeCandle(2, 90)],
      new sequence_strategy(['SHORT', 'EXIT']),
    );
    const trade = result.trades[0];

    expect(trade?.side).toBe('SHORT');
    expect(trade?.entryPrice).toBe(99);
    expect(trade?.exitPrice).toBe(90.9);
    expect(trade?.grossPnL).toBeCloseTo(81.8181818);
  });

  it('separates gross return, trading fees, and slippage cost exactly', () => {
    const Engine = new backtesting_engine({
      ...baseConfig,
      takerFeeRate: 0.01,
      slippageRate: 0.01,
    });

    const result = Engine.run(
      [makeCandle(0, 100), makeCandle(1, 100), makeCandle(2, 110)],
      new sequence_strategy(['LONG', 'EXIT']),
    );
    const trade = result.trades[0];

    expect(trade?.entryReferencePrice).toBe(100);
    expect(trade?.exitReferencePrice).toBe(110);
    expect(trade?.grossPnLBeforeCosts).toBeCloseTo(99.00990099);
    expect(trade?.slippageCost).toBeCloseTo(20.79207921);
    expect(trade?.fees).toBeCloseTo(20.78217822);
    expect(trade?.realizedPnL).toBeCloseTo(
      (trade?.grossPnLBeforeCosts ?? 0) - (trade?.slippageCost ?? 0) - (trade?.fees ?? 0),
    );
    expect(result.grossReturnBeforeCosts).toBeCloseTo(0.09900990099);
    expect(result.tradingFeeCost).toBeCloseTo(trade?.fees ?? 0);
    expect(result.slippageCost).toBeCloseTo(trade?.slippageCost ?? 0);
  });

  it('uses a conservative stop-loss fill and taker fees', () => {
    const Engine = new backtesting_engine(baseConfig);

    const result = Engine.run(
      [makeCandle(0, 100), makeCandle(1, 100, 105, 80, 90), makeCandle(2, 90)],
      new sequence_strategy(['LONG']),
    );

    expect(result.trades[0]).toMatchObject({
      exitTime: new Date(300_000),
      exitPrice: 90,
      exitReason: 'STOP_LOSS',
      grossPnL: -100,
      realizedPnL: -100,
    });
  });

  it('uses maker fees for take-profit fills', () => {
    const Engine = new backtesting_engine({
      ...baseConfig,
      makerFeeRate: 0.01,
      takerFeeRate: 0.02,
      takeProfitRate: 0.1,
    });

    const result = Engine.run(
      [makeCandle(0, 100), makeCandle(1, 100, 111, 100, 110), makeCandle(2, 110)],
      new sequence_strategy(['LONG']),
    );

    expect(result.trades[0]?.exitReason).toBe('TAKE_PROFIT');
    expect(result.trades[0]?.exitPrice).toBeCloseTo(110);
    expect(result.trades[0]?.grossPnL).toBeCloseTo(100);
    expect(result.trades[0]?.fees).toBeCloseTo(31);
    expect(result.trades[0]?.realizedPnL).toBeCloseTo(69);
  });

  it('force-closes one remaining position at the final candle', () => {
    const Engine = new backtesting_engine(baseConfig);

    const result = Engine.run(
      [makeCandle(0, 100), makeCandle(1, 100), makeCandle(2, 110)],
      new sequence_strategy(['LONG', 'LONG', 'LONG']),
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]?.exitReason).toBe('FINAL_CANDLE');
    expect(result.endingEquity).toBe(1_100);
  });

  it('marks open positions to market for maximum drawdown', () => {
    const Engine = new backtesting_engine({
      ...baseConfig,
      positionRisk: 0.5,
      stopLossRate: 0.5,
    });

    const result = Engine.run(
      [makeCandle(0, 100), makeCandle(1, 100), makeCandle(2, 100, 100, 80, 80), makeCandle(3, 100)],
      new sequence_strategy(['LONG']),
    );

    expect(result.maximumDrawdown).toBeCloseTo(0.2);
  });

  it('summarizes direction, exit reason, holding duration, and expectancy', () => {
    const Engine = new backtesting_engine(baseConfig);
    const result = Engine.run(
      [
        makeCandle(0, 100),
        makeCandle(1, 100),
        makeCandle(2, 110),
        makeCandle(3, 110),
        makeCandle(4, 100),
      ],
      new sequence_strategy(['LONG', 'EXIT', 'SHORT', 'EXIT']),
    );

    expect(result.longPerformance.tradeCount).toBe(1);
    expect(result.shortPerformance.tradeCount).toBe(1);
    expect(result.exitReasonPerformance.SIGNAL.tradeCount).toBe(2);
    expect(result.exitReasonPerformance.STOP_LOSS.tradeCount).toBe(0);
    expect(result.averageHoldingMinutes).toBe(5);
    expect(result.medianHoldingMinutes).toBe(5);
    expect(result.averageWin).toBeCloseTo(
      result.trades.reduce((sum, trade) => sum + trade.realizedPnL, 0) / 2,
    );
    expect(result.averageLoss).toBe(0);
    expect(result.expectancyPerTrade).toBeCloseTo(
      result.trades.reduce((sum, trade) => sum + trade.realizedPnL, 0) / 2,
    );
  });

  it('reports UTC monthly results and a same-period buy-and-hold benchmark', () => {
    const candles: BTC_candlestick[] = [
      {
        timestamp: new Date('2026-01-31T23:55:00.000Z'),
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1,
      },
      {
        timestamp: new Date('2026-02-01T00:00:00.000Z'),
        open: 100,
        high: 100,
        low: 80,
        close: 80,
        volume: 1,
      },
    ];

    const result = new backtesting_engine(baseConfig).run(candles, new sequence_strategy([]));

    expect(result.monthlyPerformance).toEqual([
      { month: '2026-01', netReturn: 0, maximumDrawdown: 0, endingEquity: 1_000 },
      { month: '2026-02', netReturn: 0, maximumDrawdown: 0, endingEquity: 1_000 },
    ]);
    expect(result.buyAndHoldBenchmark).toEqual({
      return: -0.19999999999999996,
      maximumDrawdown: 0.2,
      startingPrice: 100,
      endingPrice: 80,
    });
  });

  it('supports zero, configured, and doubled execution-cost scenarios', () => {
    const candles = [makeCandle(0, 100), makeCandle(1, 100), makeCandle(2, 110)];
    const run = (costMultiplier: number) =>
      new backtesting_engine({
        ...baseConfig,
        makerFeeRate: 0.005 * costMultiplier,
        takerFeeRate: 0.005 * costMultiplier,
        slippageRate: 0.005 * costMultiplier,
      }).run(candles, new sequence_strategy(['LONG', 'EXIT']));

    const zero = run(0);
    const configured = run(1);
    const doubled = run(2);

    expect(zero.tradingFeeCost).toBe(0);
    expect(zero.slippageCost).toBe(0);
    expect(configured.tradingFeeCost).toBeGreaterThan(0);
    expect(configured.slippageCost).toBeGreaterThan(0);
    expect(doubled.tradingFeeCost).toBeGreaterThan(configured.tradingFeeCost);
    expect(doubled.slippageCost).toBeGreaterThan(configured.slippageCost);
    expect(zero.netReturn).toBeGreaterThan(configured.netReturn);
    expect(configured.netReturn).toBeGreaterThan(doubled.netReturn);
  });

  it('rejects missing, duplicated, and unordered candles', () => {
    const Engine = new backtesting_engine(baseConfig);
    const Strategy = new sequence_strategy([]);

    expect(() => Engine.run([makeCandle(0, 100), makeCandle(2, 100)], Strategy)).toThrow(
      'missing interval',
    );
    expect(() => Engine.run([makeCandle(0, 100), makeCandle(0, 100)], Strategy)).toThrow(
      'duplicate timestamps',
    );
    expect(() => Engine.run([makeCandle(1, 100), makeCandle(0, 100)], Strategy)).toThrow(
      'unordered',
    );
  });
});
