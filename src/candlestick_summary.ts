import type { BTC_candlestick_history, BTC_hourly_candlestick } from './decibel_client.js';

export type BTC_candlestick_summary = {
  candleCount: number;
  firstCandleTime: Date | null;
  lastCandleTime: Date | null;
  latestThreeCompletedCandles: BTC_hourly_candlestick[];
};

export function createBTCCandlestickSummary(
  history: BTC_candlestick_history,
): BTC_candlestick_summary {
  return {
    candleCount: history.candles.length,
    firstCandleTime: history.candles.at(0)?.timestamp ?? null,
    lastCandleTime: history.candles.at(-1)?.timestamp ?? null,
    latestThreeCompletedCandles: history.candles.slice(-3),
  };
}
