import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  syncBTCCandlesticks,
  type candlestick_history_client,
} from '../src/candlestick_pipeline.js';
import { candlestick_repository } from '../src/candlestick_repository.js';
import type { BTC_candlestick_history, BTC_market_metadata } from '../src/decibel_client.js';

const market = {
  symbol: 'BTC/USD',
  exchangeSymbol: 'BTC-USD',
  marketAddress: '0xbtc',
  sizeDecimals: 4,
  priceDecimals: 2,
  tickSize: 0.5,
  minimumSize: 0.0001,
  lotSize: 0.0001,
  maximumLeverage: 20,
  maximumOpenInterest: 1_000,
  mode: 'Open',
} satisfies BTC_market_metadata;

function makeCandle(timestamp: number) {
  return {
    timestamp: new Date(timestamp),
    open: 60_000,
    high: 60_100,
    low: 59_900,
    close: 60_050,
    volume: 1,
  };
}

function makeHistory(timestamps: number[]): BTC_candlestick_history {
  return {
    symbol: 'BTC/USD',
    exchangeSymbol: 'BTC-USD',
    marketAddress: '0xbtc',
    interval: '5m',
    candles: timestamps.map(makeCandle),
  };
}

function makeClient(missingTimestamp?: number) {
  const getBTCCandlesticks = vi.fn<candlestick_history_client['getBTCCandlesticks']>(
    (_interval, startTime, endTime) => {
      const timestamps: number[] = [];
      for (
        let timestamp = startTime.getTime();
        timestamp < endTime.getTime();
        timestamp += 300_000
      ) {
        if (timestamp !== missingTimestamp) {
          timestamps.push(timestamp);
        }
      }
      return Promise.resolve(makeHistory(timestamps));
    },
  );
  return {
    client: {
      getBTCMarketMetadata: vi.fn().mockResolvedValue(market),
      getBTCCandlesticks,
    } satisfies candlestick_history_client,
    getBTCCandlesticks,
  };
}

describe('syncBTCCandlesticks', () => {
  let CandlestickRepository: candlestick_repository;

  beforeEach(() => {
    CandlestickRepository = new candlestick_repository(':memory:');
  });

  afterEach(() => {
    CandlestickRepository.close();
  });

  it('backfills aligned 5-minute ranges in non-overlapping pages', async () => {
    const { client, getBTCCandlesticks } = makeClient();

    const result = await syncBTCCandlesticks(
      client,
      CandlestickRepository,
      '5m',
      new Date(1_200_000),
      1_200_000,
      2,
    );

    expect(result).toMatchObject({
      inserted: 4,
      updated: 0,
      unchanged: 0,
      total: 4,
      missingIntervalCount: 0,
    });
    expect(getBTCCandlesticks).toHaveBeenNthCalledWith(
      1,
      '5m',
      new Date(0),
      new Date(600_000),
      new Date(1_200_000),
    );
    expect(getBTCCandlesticks).toHaveBeenNthCalledWith(
      2,
      '5m',
      new Date(600_000),
      new Date(1_200_000),
      new Date(1_200_000),
    );
  });

  it('detects and reports a missing 5-minute interval', async () => {
    const { client } = makeClient(600_000);

    const result = await syncBTCCandlesticks(
      client,
      CandlestickRepository,
      '5m',
      new Date(1_200_000),
      1_200_000,
    );

    expect(result.missingIntervalCount).toBe(1);
    expect(result.firstMissingCandleTime).toEqual(new Date(600_000));
    expect(result.lastMissingCandleTime).toEqual(new Date(600_000));
  });

  it('resumes exactly after the latest persisted candle', async () => {
    CandlestickRepository.saveCandlesticks(makeHistory([0, 300_000]));
    const { client, getBTCCandlesticks } = makeClient();

    const result = await syncBTCCandlesticks(
      client,
      CandlestickRepository,
      '5m',
      new Date(1_200_000),
      1_200_000,
    );

    expect(getBTCCandlesticks).toHaveBeenCalledWith(
      '5m',
      new Date(600_000),
      new Date(1_200_000),
      new Date(1_200_000),
    );
    expect(result).toMatchObject({ inserted: 2, updated: 0, unchanged: 0, total: 4 });
  });

  it('extends backward when recent candles already exist', async () => {
    CandlestickRepository.saveCandlesticks(makeHistory([600_000, 900_000]));
    const { client, getBTCCandlesticks } = makeClient();

    const result = await syncBTCCandlesticks(
      client,
      CandlestickRepository,
      '5m',
      new Date(1_200_000),
      1_200_000,
    );

    expect(getBTCCandlesticks).toHaveBeenCalledWith(
      '5m',
      new Date(0),
      new Date(1_200_000),
      new Date(1_200_000),
    );
    expect(result).toMatchObject({
      inserted: 2,
      updated: 0,
      unchanged: 2,
      total: 4,
      missingIntervalCount: 0,
    });
  });

  it('fills an earlier gap and accurately counts refetched unchanged candles', async () => {
    CandlestickRepository.saveCandlesticks(makeHistory([0, 600_000]));
    const { client, getBTCCandlesticks } = makeClient();

    const result = await syncBTCCandlesticks(
      client,
      CandlestickRepository,
      '5m',
      new Date(1_200_000),
      1_200_000,
    );

    expect(getBTCCandlesticks).toHaveBeenCalledWith(
      '5m',
      new Date(300_000),
      new Date(1_200_000),
      new Date(1_200_000),
    );
    expect(result).toMatchObject({
      inserted: 2,
      updated: 0,
      unchanged: 1,
      total: 4,
      missingIntervalCount: 0,
    });
  });

  it('does not persist an unfinished candle returned by the transport', async () => {
    const { client } = makeClient();
    client.getBTCCandlesticks = vi.fn().mockResolvedValue(makeHistory([0, 300_000, 600_000]));

    const result = await syncBTCCandlesticks(
      client,
      CandlestickRepository,
      '5m',
      new Date(750_000),
      600_000,
    );

    expect(result.total).toBe(2);
    expect(CandlestickRepository.getLatestTimestamp('0xbtc', '5m')).toEqual(new Date(300_000));
  });

  it('is idempotent after the latest completed candle is stored', async () => {
    const firstClient = makeClient().client;
    await syncBTCCandlesticks(
      firstClient,
      CandlestickRepository,
      '5m',
      new Date(1_200_000),
      1_200_000,
    );
    const second = makeClient();

    const result = await syncBTCCandlesticks(
      second.client,
      CandlestickRepository,
      '5m',
      new Date(1_200_000),
      1_200_000,
    );

    expect(second.getBTCCandlesticks).not.toHaveBeenCalled();
    expect(result).toMatchObject({ inserted: 0, updated: 0, unchanged: 0, total: 4 });
  });

  it.each([429, 503])('retries retryable HTTP status %i with bounded backoff', async (status) => {
    const { client } = makeClient();
    const getCandles = vi
      .fn<candlestick_history_client['getBTCCandlesticks']>()
      .mockRejectedValueOnce({ status })
      .mockRejectedValueOnce({ response: { status } })
      .mockResolvedValue(makeHistory([0]));
    client.getBTCCandlesticks = getCandles;
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
    const onRetry = vi.fn();

    const result = await syncBTCCandlesticks(
      client,
      CandlestickRepository,
      '5m',
      new Date(300_000),
      300_000,
      500,
      { maxRetries: 2, retryDelayMs: 10, sleep, onRetry },
    );

    expect(result.inserted).toBe(1);
    expect(getCandles).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 10);
    expect(sleep).toHaveBeenNthCalledWith(2, 20);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['authentication', { status: 401 }],
    ['authorization', { response: { status: 403 } }],
    ['HTTP validation', { status: 400 }],
    ['validation', new z.ZodError([])],
  ])('does not retry %s errors', async (_label, failure) => {
    const { client } = makeClient();
    const getCandles = vi
      .fn<candlestick_history_client['getBTCCandlesticks']>()
      .mockRejectedValue(failure);
    client.getBTCCandlesticks = getCandles;
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      syncBTCCandlesticks(client, CandlestickRepository, '5m', new Date(300_000), 300_000, 500, {
        maxRetries: 3,
        retryDelayMs: 10,
        sleep,
      }),
    ).rejects.toBe(failure);
    expect(getCandles).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('stops retrying after the configured retry bound', async () => {
    const { client } = makeClient();
    const failure = { status: 503 };
    const getCandles = vi
      .fn<candlestick_history_client['getBTCCandlesticks']>()
      .mockRejectedValue(failure);
    client.getBTCCandlesticks = getCandles;
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      syncBTCCandlesticks(client, CandlestickRepository, '5m', new Date(300_000), 300_000, 500, {
        maxRetries: 2,
        retryDelayMs: 10,
        sleep,
      }),
    ).rejects.toBe(failure);
    expect(getCandles).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
