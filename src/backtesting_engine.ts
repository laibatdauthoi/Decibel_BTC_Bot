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
  quantity: number;
  exitReason: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'FINAL_CANDLE';
  grossPnL: number;
  fees: number;
  realizedPnL: number;
};

export type backtest_result = {
  trades: backtest_trade[];
  netReturn: number;
  totalFees: number;
  winRate: number;
  profitFactor: number | null;
  maximumDrawdown: number;
  endingEquity: number;
};

type open_position = strategy_position & {
  entryFee: number;
};

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
        quantity: position.quantity,
        exitReason: reason,
        grossPnL,
        fees,
        realizedPnL,
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
        updateDrawdown(equity + unrealizedPnL);
      } else {
        updateDrawdown(equity);
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
    }

    const wins = trades.filter((trade) => trade.realizedPnL > 0);
    const grossProfit = wins.reduce((sum, trade) => sum + trade.realizedPnL, 0);
    const grossLoss = Math.abs(
      trades
        .filter((trade) => trade.realizedPnL < 0)
        .reduce((sum, trade) => sum + trade.realizedPnL, 0),
    );
    return {
      trades,
      netReturn: (equity - this.config.startingEquity) / this.config.startingEquity,
      totalFees,
      winRate: trades.length === 0 ? 0 : wins.length / trades.length,
      profitFactor: grossLoss === 0 ? null : grossProfit / grossLoss,
      maximumDrawdown,
      endingEquity: equity,
    };
  }
}
