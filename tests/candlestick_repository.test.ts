import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { candlestick_repository } from '../src/candlestick_repository.js';
import type { BTC_candlestick_history } from '../src/decibel_client.js';

function makeHistory(candles: BTC_candlestick_history['candles']): BTC_candlestick_history {
  return {
    symbol: 'BTC/USD',
    exchangeSymbol: 'BTC-USD',
    marketAddress: '0xbtc',
    interval: '1h',
    candles,
  };
}

function makeCandle(timestamp: number, close = 60_050) {
  return {
    timestamp: new Date(timestamp),
    open: 60_000,
    high: Math.max(60_100, close),
    low: 59_900,
    close,
    volume: 1.25,
  };
}

describe('candlestick_repository', () => {
  let CandlestickRepository: candlestick_repository;

  beforeEach(() => {
    CandlestickRepository = new candlestick_repository(':memory:');
  });

  afterEach(() => {
    CandlestickRepository.close();
  });

  it('creates and versions the schema automatically', () => {
    expect(CandlestickRepository.getSchemaVersion()).toBe(1);
    // SQLite memory databases cannot retain WAL files, but the pragma is still applied.
    expect(CandlestickRepository.getJournalMode()).toBe('memory');
  });

  it('inserts normalized candles and returns them chronologically', () => {
    const result = CandlestickRepository.saveCandlesticks(
      makeHistory([makeCandle(7_200_000), makeCandle(0), makeCandle(3_600_000)]),
    );

    expect(result).toEqual({ inserted: 3, updated: 0, unchanged: 0, total: 3 });
    expect(
      CandlestickRepository.getCandlesticks('0xbtc', '1h').map((candle) =>
        candle.timestamp.getTime(),
      ),
    ).toEqual([0, 3_600_000, 7_200_000]);
  });

  it('updates an existing candle without creating a duplicate', () => {
    CandlestickRepository.saveCandlesticks(makeHistory([makeCandle(0)]));

    const result = CandlestickRepository.saveCandlesticks(makeHistory([makeCandle(0, 60_075)]));

    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 0, total: 1 });
    expect(CandlestickRepository.getCandlesticks('0xbtc', '1h')).toEqual([makeCandle(0, 60_075)]);
  });

  it('coalesces duplicate keys within one transactional batch', () => {
    const result = CandlestickRepository.saveCandlesticks(
      makeHistory([makeCandle(0), makeCandle(0, 60_075)]),
    );

    expect(result).toEqual({ inserted: 1, updated: 0, unchanged: 0, total: 1 });
    expect(CandlestickRepository.getCandlesticks('0xbtc', '1h')).toEqual([makeCandle(0, 60_075)]);
  });

  it('reports unchanged candles accurately on an idempotent write', () => {
    CandlestickRepository.saveCandlesticks(makeHistory([makeCandle(0)]));

    const result = CandlestickRepository.saveCandlesticks(makeHistory([makeCandle(0)]));

    expect(result).toEqual({ inserted: 0, updated: 0, unchanged: 1, total: 1 });
  });

  it('rejects a persisted 5-minute candle that is off its UTC boundary', () => {
    expect(() =>
      CandlestickRepository.saveCandlesticks({
        ...makeHistory([makeCandle(1)]),
        interval: '5m',
      }),
    ).toThrow('not aligned to 5m');
  });

  it('keeps identical timestamps separate across market addresses', () => {
    CandlestickRepository.saveCandlesticks(makeHistory([makeCandle(0)]));
    CandlestickRepository.saveCandlesticks({
      ...makeHistory([makeCandle(0)]),
      marketAddress: '0xother',
    });

    expect(CandlestickRepository.getCandlesticks('0xbtc', '1h')).toHaveLength(1);
    expect(CandlestickRepository.getCandlesticks('0xother', '1h')).toHaveLength(1);
  });
});
