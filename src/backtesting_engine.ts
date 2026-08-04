import { z } from 'zod';

import type { BTC_candlestick } from './decibel_client.js';

export const BacktestSignalSchema = z.enum(['LONG', 'SHORT', 'EXIT', 'HOLD']);
export type backtest_signal = z.infer<typeof BacktestSignalSchema>;
export type position_side = 'LONG' | 'SHORT';

const BacktestConfigSchema = z.object({
  startingEquity: z.number().positive().finite(),
  makerFeeRate: z.number().min(0).max(0.1).finite(),
  takerFeeRate: z.number().min(0).max(0.1).finite(),
  slippageRate: z.number().min(0).max(0.1).finite(),
  leverage: z.number().min(1).max(100).finite(),
  positionRisk: z.number().positive().max(1).finite(),
  stopLossRate: z.number().positive().max(0.99).finite(),
  takeProfitRate: z.number().positive().finite(),
});

export type backtest_config = z.infer<typeof BacktestConfigSchema>;

export type strategy_position = {
  side: position_side;
  entryTime: Date;
  entryPrice: number;
  quantity: number;
  stopLossPrice: number;
  takeProfitPrice: number;
};

export type strategy_context = {
  candles: readonly BTC_candlestick[];
  equity: number;
  position: strategy_position | null;
};

export interface backtest_strategy {
  evaluate(context: strategy_context): backtest_signal;
}

export type backtest_trade = {
  side: position_side;
  entryTime: Date;
  exitTime: Date;
  entryPrice: number;
  exitPrice: number;
  entryReferencePrice: number;
  exitReferencePrice: number;
  quantity: number;
  exitReason: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'FINAL_CANDLE';
  grossPnL: number;
  grossPnLBeforeCosts: number;
  fees: number;
  slippageCost: number;
  realizedPnL: number;
  holdingMinutes: number;
};

export type trade_performance_summary = {
  tradeCount: number;
  winRate: number;
  grossPnLBeforeCosts: number;
  tradingFeeCost: number;
  slippageCost: number;
  netPnL: number;
};

export type monthly_performance_summary = {
  month: string;
  netReturn: number;
  maximumDrawdown: number;
  endingEquity: number;
};

export type backtest_result = {
  trades: backtest_trade[];
  grossReturnBeforeCosts: number;
  netReturn: number;
  tradingFeeCost: number;
  slippageCost: number;
  winRate: number;
  profitFactor: number | null;
  maximumDrawdown: number;
  endingEquity: number;
  longPerformance: trade_performance_summary;
  shortPerformance: trade_performance_summary;
  exitReasonPerformance: Record<backtest_trade['exitReason'], trade_performance_summary>;
  averageHoldingMinutes: number;
  medianHoldingMinutes: number;
  averageWin: number;
  averageLoss: number;
  expectancyPerTrade: number;
  monthlyPerformance: monthly_performance_summary[];
  buyAndHoldBenchmark: {
    return: number;
    maximumDrawdown: number;
    startingPrice: number;
    endingPrice: number;
  };
};

type open_position = strategy_position & {
  entryReferencePrice: number;
  entryFee: number;
};

type equity_point = { timestamp: Date; equity: number };

const FIVE_MINUTES_MS = 300_000;

function validateCandles(candles: readonly BTC_candlestick[]): void {
  if (candles.length === 0) throw new Error('Backtest requires completed candles');
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    if (candle === undefined) continue;
    const timestamp = candle.timestamp.getTime();
    if (!Number.isSafeInteger(timestamp) || timestamp % FIVE_MINUTES_MS !== 0) {
      throw new Error('Backtest candle timestamp is invalid or misaligned');
    }
    if (
      ![candle.open, candle.high, candle.low, candle.close].every(
        (price) => Number.isFinite(price) && price > 0,
      ) ||
      !Number.isFinite(candle.volume) ||
      candle.volume < 0 ||
      candle.high < Math.max(candle.open, candle.close, candle.low) ||
      candle.low > Math.min(candle.open, candle.close, candle.high)
    ) {
      throw new Error('Backtest candle contains malformed OHLCV data');
    }
    const previous = candles[index - 1];
    if (previous === undefined) continue;
    const difference = timestamp - previous.timestamp.getTime();
    if (difference === 0) throw new Error('Backtest candles contain duplicate timestamps');
    if (difference < 0) throw new Error('Backtest candles are unordered');
    if (difference !== FIVE_MINUTES_MS)
      throw new Error('Backtest candles contain a missing interval');
  }
}

function applySlippage(price: number, isBuy: boolean, rate: number): number {
  return price * (isBuy ? 1 + rate : 1 - rate);
}

function summarizeTrades(trades: readonly backtest_trade[]): trade_performance_summary {
  const wins = trades.filter((trade) => trade.realizedPnL > 0).length;
  return {
    tradeCount: trades.length,
    winRate: trades.length === 0 ? 0 : wins / trades.length,
    grossPnLBeforeCosts: trades.reduce((sum, trade) => sum + trade.grossPnLBeforeCosts, 0),
    tradingFeeCost: trades.reduce((sum, trade) => sum + trade.fees, 0),
    slippageCost: trades.reduce((sum, trade) => sum + trade.slippageCost, 0),
    netPnL: trades.reduce((sum, trade) => sum + trade.realizedPnL, 0),
  };
}

function calculateMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  if (right === undefined) return 0;
  if (sorted.length % 2 === 1) return right;
  return ((sorted[middle - 1] ?? right) + right) / 2;
}

function getUTCMonth(timestamp: Date): string {
  return timestamp.toISOString().slice(0, 7);
}

function summarizeMonthlyPerformance(
  points: readonly equity_point[],
  startingEquity: number,
): monthly_performance_summary[] {
  const grouped = new Map<string, equity_point[]>();
  for (const point of points) {
    const month = getUTCMonth(point.timestamp);
    grouped.set(month, [...(grouped.get(month) ?? []), point]);
  }
  const summaries: monthly_performance_summary[] = [];
  let openingEquity = startingEquity;
  for (const [month, monthPoints] of grouped) {
    let peak = openingEquity;
    let maximumDrawdown = 0;
    for (const point of monthPoints) {
      peak = Math.max(peak, point.equity);
      maximumDrawdown = Math.max(maximumDrawdown, (peak - point.equity) / peak);
    }
    const endingEquity = monthPoints.at(-1)?.equity ?? openingEquity;
    summaries.push({
      month,
      netReturn: (endingEquity - openingEquity) / openingEquity,
      maximumDrawdown,
      endingEquity,
    });
    openingEquity = endingEquity;
  }
  return summaries;
}

function calculateBuyAndHoldBenchmark(
  candles: readonly BTC_candlestick[],
): backtest_result['buyAndHoldBenchmark'] {
  const first = candles[0];
  const last = candles.at(-1);
  if (first === undefined || last === undefined) throw new Error('Benchmark requires candles');
  let peak = first.open;
  let maximumDrawdown = 0;
  for (const candle of candles) {
    peak = Math.max(peak, candle.close);
    maximumDrawdown = Math.max(maximumDrawdown, (peak - candle.close) / peak);
  }
  return {
    return: last.close / first.open - 1,
    maximumDrawdown,
    startingPrice: first.open,
    endingPrice: last.close,
  };
}

export class backtesting_engine {
  private readonly config: backtest_config;

  constructor(config: backtest_config) {
    this.config = BacktestConfigSchema.parse(config);
  }

  run(candles: readonly BTC_candlestick[], strategy: backtest_strategy): backtest_result {
    validateCandles(candles);
    let equity = this.config.startingEquity;
    let peakEquity = equity;
    let maximumDrawdown = 0;
    let totalFees = 0;
    let position: open_position | null = null;
    let pendingSignal: backtest_signal = 'HOLD';
    const trades: backtest_trade[] = [];
    const equityPoints: equity_point[] = [];
    const getOpenPosition = (): open_position | null => position;

    const updateDrawdown = (markedEquity: number): void => {
      peakEquity = Math.max(peakEquity, markedEquity);
      maximumDrawdown = Math.max(maximumDrawdown, (peakEquity - markedEquity) / peakEquity);
    };

    const closePosition = (
      candle: BTC_candlestick,
      basePrice: number,
      reason: backtest_trade['exitReason'],
      maker: boolean,
    ): void => {
      if (position === null) return;
      const exitPrice = maker
        ? basePrice
        : applySlippage(basePrice, position.side === 'SHORT', this.config.slippageRate);
      const direction = position.side === 'LONG' ? 1 : -1;
      const grossPnL = (exitPrice - position.entryPrice) * position.quantity * direction;
      const grossPnLBeforeCosts =
        (basePrice - position.entryReferencePrice) * position.quantity * direction;
      const slippageCost = grossPnLBeforeCosts - grossPnL;
      const exitFee =
        exitPrice *
        position.quantity *
        (maker ? this.config.makerFeeRate : this.config.takerFeeRate);
      const fees = position.entryFee + exitFee;
      const realizedPnL = grossPnL - fees;
      equity += grossPnL - exitFee;
      totalFees += exitFee;
      trades.push({
        side: position.side,
        entryTime: position.entryTime,
        exitTime: candle.timestamp,
        entryPrice: position.entryPrice,
        exitPrice,
        entryReferencePrice: position.entryReferencePrice,
        exitReferencePrice: basePrice,
        quantity: position.quantity,
        exitReason: reason,
        grossPnL,
        grossPnLBeforeCosts,
        fees,
        slippageCost,
        realizedPnL,
        holdingMinutes: (candle.timestamp.getTime() - position.entryTime.getTime()) / 60_000,
      });
      position = null;
      updateDrawdown(equity);
    };

    const openPosition = (candle: BTC_candlestick, side: position_side): void => {
      if (position !== null) return;
      const entryPrice = applySlippage(candle.open, side === 'LONG', this.config.slippageRate);
      const stopLossPrice =
        side === 'LONG'
          ? entryPrice * (1 - this.config.stopLossRate)
          : entryPrice * (1 + this.config.stopLossRate);
      const takeProfitPrice =
        side === 'LONG'
          ? entryPrice * (1 + this.config.takeProfitRate)
          : entryPrice * (1 - this.config.takeProfitRate);
      const riskQuantity =
        (equity * this.config.positionRisk) / Math.abs(entryPrice - stopLossPrice);
      const leverageQuantity = (equity * this.config.leverage) / entryPrice;
      const quantity = Math.min(riskQuantity, leverageQuantity);
      const entryFee = entryPrice * quantity * this.config.takerFeeRate;
      equity -= entryFee;
      totalFees += entryFee;
      position = {
        side,
        entryTime: candle.timestamp,
        entryReferencePrice: candle.open,
        entryPrice,
        quantity,
        stopLossPrice,
        takeProfitPrice,
        entryFee,
      };
    };

    for (let index = 0; index < candles.length; index += 1) {
      const candle = candles[index];
      if (candle === undefined) continue;
      if (pendingSignal === 'EXIT') closePosition(candle, candle.open, 'SIGNAL', false);
      if (pendingSignal === 'LONG') openPosition(candle, 'LONG');
      if (pendingSignal === 'SHORT') openPosition(candle, 'SHORT');

      const activePosition = getOpenPosition();
      if (activePosition !== null) {
        const stopHit =
          activePosition.side === 'LONG'
            ? candle.low <= activePosition.stopLossPrice
            : candle.high >= activePosition.stopLossPrice;
        const takeProfitHit =
          activePosition.side === 'LONG'
            ? candle.high >= activePosition.takeProfitPrice
            : candle.low <= activePosition.takeProfitPrice;
        if (stopHit) {
          const stopPrice =
            activePosition.side === 'LONG'
              ? Math.min(candle.open, activePosition.stopLossPrice)
              : Math.max(candle.open, activePosition.stopLossPrice);
          closePosition(candle, stopPrice, 'STOP_LOSS', false);
        } else if (takeProfitHit) {
          closePosition(candle, activePosition.takeProfitPrice, 'TAKE_PROFIT', true);
        }
      }

      const markedPosition = getOpenPosition();
      if (markedPosition !== null) {
        const direction = markedPosition.side === 'LONG' ? 1 : -1;
        const unrealizedPnL =
          (candle.close - markedPosition.entryPrice) * markedPosition.quantity * direction;
        const markedEquity = equity + unrealizedPnL;
        updateDrawdown(markedEquity);
        equityPoints.push({ timestamp: candle.timestamp, equity: markedEquity });
      } else {
        updateDrawdown(equity);
        equityPoints.push({ timestamp: candle.timestamp, equity });
      }

      pendingSignal = BacktestSignalSchema.parse(
        strategy.evaluate({
          candles: candles.slice(0, index + 1),
          equity,
          position: getOpenPosition(),
        }),
      );
    }

    const finalCandle = candles.at(-1);
    if (finalCandle !== undefined && getOpenPosition() !== null) {
      closePosition(finalCandle, finalCandle.close, 'FINAL_CANDLE', false);
      const finalPoint = equityPoints.at(-1);
      if (finalPoint !== undefined) finalPoint.equity = equity;
    }

    const wins = trades.filter((trade) => trade.realizedPnL > 0);
    const grossProfit = wins.reduce((sum, trade) => sum + trade.realizedPnL, 0);
    const grossLoss = Math.abs(
      trades
        .filter((trade) => trade.realizedPnL < 0)
        .reduce((sum, trade) => sum + trade.realizedPnL, 0),
    );
    const losses = trades.filter((trade) => trade.realizedPnL < 0);
    const totalGrossPnLBeforeCosts = trades.reduce(
      (sum, trade) => sum + trade.grossPnLBeforeCosts,
      0,
    );
    const totalSlippageCost = trades.reduce((sum, trade) => sum + trade.slippageCost, 0);
    const holdingMinutes = trades.map((trade) => trade.holdingMinutes);
    const exitReasons = ['SIGNAL', 'STOP_LOSS', 'TAKE_PROFIT', 'FINAL_CANDLE'] as const;
    return {
      trades,
      grossReturnBeforeCosts: totalGrossPnLBeforeCosts / this.config.startingEquity,
      netReturn: (equity - this.config.startingEquity) / this.config.startingEquity,
      tradingFeeCost: totalFees,
      slippageCost: totalSlippageCost,
      winRate: trades.length === 0 ? 0 : wins.length / trades.length,
      profitFactor: grossLoss === 0 ? null : grossProfit / grossLoss,
      maximumDrawdown,
      endingEquity: equity,
      longPerformance: summarizeTrades(trades.filter((trade) => trade.side === 'LONG')),
      shortPerformance: summarizeTrades(trades.filter((trade) => trade.side === 'SHORT')),
      exitReasonPerformance: Object.fromEntries(
        exitReasons.map((reason) => [
          reason,
          summarizeTrades(trades.filter((trade) => trade.exitReason === reason)),
        ]),
      ) as backtest_result['exitReasonPerformance'],
      averageHoldingMinutes:
        holdingMinutes.length === 0
          ? 0
          : holdingMinutes.reduce((sum, duration) => sum + duration, 0) / holdingMinutes.length,
      medianHoldingMinutes: calculateMedian(holdingMinutes),
      averageWin:
        wins.length === 0
          ? 0
          : wins.reduce((sum, trade) => sum + trade.realizedPnL, 0) / wins.length,
      averageLoss:
        losses.length === 0
          ? 0
          : losses.reduce((sum, trade) => sum + trade.realizedPnL, 0) / losses.length,
      expectancyPerTrade:
        trades.length === 0
          ? 0
          : trades.reduce((sum, trade) => sum + trade.realizedPnL, 0) / trades.length,
      monthlyPerformance: summarizeMonthlyPerformance(equityPoints, this.config.startingEquity),
      buyAndHoldBenchmark: calculateBuyAndHoldBenchmark(candles),
    };
  }
}
