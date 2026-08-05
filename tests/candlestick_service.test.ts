import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { candlestick_service, type live_candlestick_client } from '../src/candlestick_service.js';
import { candlestick_repository } from '../src/candlestick_repository.js';
import type { BTC_candlestick, BTC_market_metadata } from '../src/decibel_client.js';

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

const catchUpResult = {
  inserted: 0,
  updated: 0,
  unchanged: 0,
  total: 0,
  requestedStartTime: new Date(0),
  completedThroughTime: new Date(0),
  missingIntervalCount: 0,
  firstMissingCandleTime: null,
  lastMissingCandleTime: null,
};

function makeCandle(timestamp: number, close = 60_050): BTC_candlestick {
  return {
    timestamp: new Date(timestamp),
    open: 60_000,
    high: Math.max(60_100, close),
    low: 59_900,
    close,
    volume: 1,
  };
}

function makeClient() {
  let candleHandler: ((candle: BTC_candlestick) => void) | undefined;
  let errorHandler: (() => void) | undefined;
  const unsubscribe = vi.fn();
  const subscribeBTCCandlesticks = vi.fn(
    (_exchangeSymbol: string, _interval: '5m', handler: (candle: BTC_candlestick) => void) => {
      candleHandler = handler;
      return unsubscribe;
    },
  );
  const client = {
    getBTCMarketMetadata: vi.fn().mockResolvedValue(market),
    getBTCCandlesticks: vi.fn().mockRejectedValue(new Error('REST should be injected')),
    subscribeBTCCandlesticks,
    onWebSocketError: vi.fn((handler: () => void) => {
      errorHandler = handler;
      return vi.fn();
    }),
    closeWebSocket: vi.fn(),
  } satisfies live_candlestick_client;
  return {
    client,
    subscribeBTCCandlesticks,
    unsubscribe,
    emitCandle: (candle: BTC_candlestick) => candleHandler?.(candle),
    emitError: () => errorHandler?.(),
  };
}

describe('candlestick_service', () => {
  let CandlestickRepository: candlestick_repository;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    CandlestickRepository = new candlestick_repository(':memory:');
  });

  afterEach(() => {
    if (CandlestickRepository.getJournalMode() === 'memory') CandlestickRepository.close();
    vi.useRealTimers();
  });

  it('performs REST catch-up once before subscribing to the concrete BTC 5m stream', async () => {
    const fake = makeClient();
    const synchronize = vi.fn().mockResolvedValue(catchUpResult);
    const Service = new candlestick_service(fake.client, CandlestickRepository, { synchronize });

    await Service.start();

    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(fake.subscribeBTCCandlesticks.mock.calls[0]?.[0]).toBe('BTC-USD');
    expect(fake.subscribeBTCCandlesticks.mock.calls[0]?.[1]).toBe('5m');
    expect(typeof fake.subscribeBTCCandlesticks.mock.calls[0]?.[2]).toBe('function');
    expect(Service.isStrategyEvaluationAllowed()).toBe(true);
    await Service.stop();
  });

  it('keeps the current candle in memory and persists it only when a newer interval begins', async () => {
    const fake = makeClient();
    const Service = new candlestick_service(fake.client, CandlestickRepository, {
      synchronize: vi.fn().mockResolvedValue(catchUpResult),
    });
    await Service.start();

    fake.emitCandle(makeCandle(0));
    fake.emitCandle(makeCandle(0, 60_075));
    expect(CandlestickRepository.getTotalCandlesticks('0xbtc', '5m')).toBe(0);

    fake.emitCandle(makeCandle(300_000));
    expect(CandlestickRepository.getCandlesticks('0xbtc', '5m')).toEqual([makeCandle(0, 60_075)]);
    await Service.stop();
  });

  it('reconnects with backoff, disables strategy, and does not duplicate candles', async () => {
    const fake = makeClient();
    const synchronize = vi.fn().mockResolvedValue(catchUpResult);
    const Service = new candlestick_service(fake.client, CandlestickRepository, {
      synchronize,
      reconnectBaseDelayMs: 1_000,
      reconnectMaxDelayMs: 4_000,
    });
    await Service.start();
    fake.emitCandle(makeCandle(0));
    fake.emitCandle(makeCandle(300_000));

    fake.emitError();
    expect(Service.getHealth()).toBe('reconnecting');
    expect(Service.isStrategyEvaluationAllowed()).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fake.subscribeBTCCandlesticks).toHaveBeenCalledTimes(2);

    fake.emitCandle(makeCandle(300_000));
    fake.emitCandle(makeCandle(600_000));
    expect(CandlestickRepository.getTotalCandlesticks('0xbtc', '5m')).toBe(2);
    await Service.stop();
  });

  it('publishes a completed notification only for an inserted candle, not an unchanged replay', async () => {
    const fake = makeClient(),
      onCompletedCandle = vi.fn(),
      Service = new candlestick_service(fake.client, CandlestickRepository, {
        synchronize: vi.fn().mockResolvedValue(catchUpResult),
        onCompletedCandle,
      });
    await Service.start();
    fake.emitCandle(makeCandle(0));
    fake.emitCandle(makeCandle(300_000));
    expect(onCompletedCandle).toHaveBeenCalledOnce();

    fake.emitError();
    await vi.advanceTimersByTimeAsync(1_000);
    fake.emitCandle(makeCandle(0));
    fake.emitCandle(makeCandle(300_000));
    expect(onCompletedCandle).toHaveBeenCalledOnce();
    await Service.stop();
  });

  it('caps exponential reconnect delays', async () => {
    const fake = makeClient();
    const Service = new candlestick_service(fake.client, CandlestickRepository, {
      synchronize: vi.fn().mockResolvedValue(catchUpResult),
      reconnectBaseDelayMs: 1_000,
      reconnectMaxDelayMs: 4_000,
    });
    await Service.start();
    fake.subscribeBTCCandlesticks
      .mockImplementationOnce(() => {
        throw new Error('temporary socket failure');
      })
      .mockImplementationOnce(() => {
        throw new Error('temporary socket failure');
      })
      .mockImplementationOnce(() => {
        throw new Error('temporary socket failure');
      });

    fake.emitError();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fake.subscribeBTCCandlesticks).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fake.subscribeBTCCandlesticks).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fake.subscribeBTCCandlesticks).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(fake.subscribeBTCCandlesticks).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.subscribeBTCCandlesticks).toHaveBeenCalledTimes(5);
    await Service.stop();
  });

  it('runs REST reconciliation every 15 minutes', async () => {
    const fake = makeClient();
    const synchronize = vi.fn().mockResolvedValue(catchUpResult);
    const Service = new candlestick_service(fake.client, CandlestickRepository, {
      synchronize,
      staleAfterMs: 60 * 60 * 1_000,
    });
    await Service.start();

    await vi.advanceTimersByTimeAsync(15 * 60 * 1_000);

    expect(synchronize).toHaveBeenCalledTimes(2);
    await Service.stop();
  });

  it('detects stale data and stops strategy execution while reconnecting', async () => {
    const fake = makeClient();
    const Service = new candlestick_service(fake.client, CandlestickRepository, {
      synchronize: vi.fn().mockResolvedValue(catchUpResult),
      heartbeatIntervalMs: 60_000,
      staleAfterMs: 300_000,
      reconnectBaseDelayMs: 60_000,
    });
    await Service.start();

    await vi.advanceTimersByTimeAsync(360_000);

    expect(Service.getHealth()).toBe('reconnecting');
    expect(Service.isStrategyEvaluationAllowed()).toBe(false);
    await Service.stop();
  });

  it('gracefully stops timers, subscription, and WebSocket activity', async () => {
    const fake = makeClient();
    const synchronize = vi.fn().mockResolvedValue(catchUpResult);
    const Service = new candlestick_service(fake.client, CandlestickRepository, { synchronize });
    await Service.start();

    await Service.stop();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1_000);

    expect(Service.getHealth()).toBe('stopped');
    expect(fake.unsubscribe).toHaveBeenCalledOnce();
    expect(fake.client.closeWebSocket).toHaveBeenCalledOnce();
    expect(synchronize).toHaveBeenCalledOnce();
  });
});
