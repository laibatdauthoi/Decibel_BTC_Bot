import { describe, expect, it } from 'vitest';

import { createBTCCandlestickSummary } from '../src/candlestick_summary.js';
import type { BTC_candlestick_history } from '../src/decibel_client.js';

function makeHistory(candleCount: number): BTC_candlestick_history {
  return {
    symbol: 'BTC/USD',
    exchangeSymbol: 'BTC-USD',
    marketAddress: '0xbtc',
    interval: '1h',
    candles: Array.from({ length: candleCount }, (_, index) => ({
      timestamp: new Date(index * 3_600_000),
      open: 60_000 + index,
      high: 60_100 + index,
      low: 59_900 + index,
      close: 60_050 + index,
      volume: index + 1,
    })),
  };
}

describe('createBTCCandlestickSummary', () => {
  it('reports bounds and includes only the latest three completed candles', () => {
    const history = makeHistory(5);

    expect(createBTCCandlestickSummary(history)).toEqual({
      candleCount: 5,
      firstCandleTime: new Date(0),
      lastCandleTime: new Date(14_400_000),
      latestThreeCompletedCandles: history.candles.slice(2),
    });
  });

  it('uses null bounds for an empty completed history', () => {
    expect(createBTCCandlestickSummary(makeHistory(0))).toEqual({
      candleCount: 0,
      firstCandleTime: null,
      lastCandleTime: null,
      latestThreeCompletedCandles: [],
    });
  });
});
