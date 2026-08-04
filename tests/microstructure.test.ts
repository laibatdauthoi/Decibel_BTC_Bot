import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BTC_market_metadata } from '../src/decibel_client.js';
import {
  estimateWebSocketTradeAggressors,
  normalizeDepthPayload,
  normalizeMarketPricePayload,
  normalizeTradePayload,
} from '../src/microstructure.js';
import {
  microstructure_collector,
  type microstructure_client,
  type microstructure_collector_options,
} from '../src/microstructure_collector.js';
import { microstructure_repository } from '../src/microstructure_repository.js';

const marketAddress = '0xbtc';
const metadata: BTC_market_metadata = {
  symbol: 'BTC/USD',
  exchangeSymbol: 'BTC-USD',
  marketAddress,
  sizeDecimals: 4,
  priceDecimals: 2,
  tickSize: 0.5,
  minimumSize: 0.0001,
  lotSize: 0.0005,
  maximumLeverage: 20,
  maximumOpenInterest: 1_000,
  mode: 'Open',
};

function depth(timestamp = 9_000): unknown {
  return {
    market: marketAddress,
    bids: [
      { price: 100, size: 2 },
      { price: 99, size: 3 },
    ],
    asks: [
      { price: 101, size: 1 },
      { price: 102, size: 4 },
    ],
    best_bid: 100,
    best_ask: 101,
    unix_ms: timestamp,
  };
}

function trades(timestamp = 9_100): unknown {
  return {
    trades: [
      {
        trade_id: 'trade-7',
        account: 'public-account-id',
        order_id: 'order-7',
        market: marketAddress,
        action: 'Buy',
        size: 2,
        price: 100,
        transaction_unix_ms: timestamp,
        transaction_version: 7,
        is_taker: true,
      },
      {
        trade_id: 'trade-8',
        account: 'public-account-id',
        order_id: 'order-8',
        market: marketAddress,
        action: 'Sell',
        size: 1,
        price: 101,
        transaction_unix_ms: timestamp,
        transaction_version: 8,
        is_taker: true,
      },
    ],
  };
}

function price(timestamp = 9_200): unknown {
  return {
    price: {
      market: marketAddress,
      mark_px: 100.5,
      mid_px: 100.6,
      oracle_px: 100.4,
      funding_rate_bps: 1.5,
      is_funding_positive: true,
      open_interest: 50,
      transaction_unix_ms: timestamp,
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('microstructure normalization', () => {
  it('calculates exact top-of-book metrics and top-five imbalance', () => {
    const book = normalizeDepthPayload(depth(), marketAddress, new Date(10_000));
    expect(book).toMatchObject({
      bestBid: 100,
      bestAsk: 101,
      spread: 1,
      midPrice: 100.5,
      microprice: 100 + 2 / 3,
      bestBidSize: 2,
      bestAskSize: 1,
      top5DepthImbalance: 0,
    });
    expect(book.exchangeTimestamp).toEqual(new Date(9_000));
    expect(book.receivedAt).toEqual(new Date(10_000));
  });

  it('rejects crossed, mismatched, and malformed depth', () => {
    expect(() =>
      normalizeDepthPayload(
        { ...(depth() as object), asks: [{ price: 99, size: 1 }], best_ask: 99 },
        marketAddress,
      ),
    ).toThrow('Crossed');
    expect(() =>
      normalizeDepthPayload({ ...(depth() as object), market: '0xother' }, marketAddress),
    ).toThrow('does not match');
    expect(() => normalizeDepthPayload({ bids: [] }, marketAddress)).toThrow();
  });

  it('normalizes trades and market prices with exchange and receipt timestamps', () => {
    const normalizedTrades = normalizeTradePayload(trades(), marketAddress, new Date(10_000));
    const normalizedPrice = normalizeMarketPricePayload(price(), marketAddress, new Date(10_000));
    expect(normalizedTrades.map((trade) => trade.side)).toEqual(['BUY', 'SELL']);
    expect(normalizedTrades.map((trade) => trade.classificationReason)).toEqual([
      'EXPLICIT_IS_TAKER',
      'EXPLICIT_IS_TAKER',
    ]);
    expect(normalizedTrades.map((trade) => trade.ingestionSource)).toEqual([
      'WEBSOCKET',
      'WEBSOCKET',
    ]);
    expect(normalizedTrades[0]?.exchangeTimestamp).toEqual(new Date(9_100));
    expect(normalizedPrice).toMatchObject({ fundingRate: 0.00015, openInterest: 50 });
    expect(normalizedPrice.receivedAt).toEqual(new Date(10_000));
  });

  it('keeps participant action separate when aggressor direction has no deterministic basis', () => {
    const payload = {
      trades: [
        {
          trade_id: 'direction-unknown',
          account: 'participant',
          order_id: 'order',
          market: marketAddress,
          action: 'Buy',
          size: 1,
          price: 100,
          transaction_unix_ms: 9_100,
          transaction_version: 99,
        },
      ],
    };
    expect(normalizeTradePayload(payload, marketAddress)[0]).toMatchObject({
      side: 'UNKNOWN',
      classificationReason: 'NO_EXPLICIT_AGGRESSOR_SEMANTICS',
    });
  });
});

describe('WebSocket quote-test aggressor estimation', () => {
  function unknownTrade(priceValue: number, receivedAt = 10_000) {
    return normalizeTradePayload(
      {
        trades: [
          {
            trade_id: `quote-${priceValue}`,
            account: 'participant',
            market: marketAddress,
            action: 'Trade',
            size: 1,
            price: priceValue,
            transaction_unix_ms: 9_900,
            transaction_version: 42,
          },
        ],
      },
      marketAddress,
      new Date(receivedAt),
    );
  }

  const validBook = normalizeDepthPayload(depth(9_900), marketAddress, new Date(9_950));

  it.each([
    [101, 'BUY', 'QUOTE_TEST_AT_ASK'],
    [100, 'SELL', 'QUOTE_TEST_AT_BID'],
    [100.75, 'BUY', 'QUOTE_TEST_ABOVE_MID'],
    [100.25, 'SELL', 'QUOTE_TEST_BELOW_MID'],
    [100.5, 'UNKNOWN', 'QUOTE_TEST_EXACT_MID'],
  ] as const)('classifies price %s as %s using %s', (tradePrice, side, reason) => {
    expect(
      estimateWebSocketTradeAggressors(unknownTrade(tradePrice), validBook, 2_000)[0],
    ).toMatchObject({
      side,
      classificationReason: reason,
      classificationSource: side === 'UNKNOWN' ? 'UNKNOWN' : 'ESTIMATED_QUOTE_TEST',
      matchedBookAgeMs: 50,
    });
  });

  it('rejects future, stale, crossed, and conflicting book matches', () => {
    const future = { ...validBook, receivedAt: new Date(10_001) };
    expect(
      estimateWebSocketTradeAggressors(unknownTrade(101), future, 2_000)[0]?.classificationReason,
    ).toBe('QUOTE_TEST_NO_PRIOR_BOOK');
    expect(
      estimateWebSocketTradeAggressors(unknownTrade(101, 20_000), validBook, 2_000)[0]
        ?.classificationReason,
    ).toBe('QUOTE_TEST_STALE_BOOK');
    const crossed = { ...validBook, bestBid: 102, bestAsk: 101 };
    expect(
      estimateWebSocketTradeAggressors(unknownTrade(101), crossed, 2_000)[0]?.classificationReason,
    ).toBe('QUOTE_TEST_INVALID_BOOK');
    const rows = unknownTrade(101);
    const conflict = [
      { ...rows[0]!, economicTradeId: 'same' },
      { ...rows[0]!, economicTradeId: 'same', price: 102, eventId: 'other' },
    ];
    expect(
      estimateWebSocketTradeAggressors(conflict, validBook, 2_000).map(
        (row) => row.classificationReason,
      ),
    ).toEqual(['AMBIGUOUS_ECONOMIC_FIELDS', 'AMBIGUOUS_ECONOMIC_FIELDS']);
  });
});

describe('microstructure persistence', () => {
  it('uses WAL, migrations, bounded transactions, and replay-safe keys', () => {
    const Repository = new microstructure_repository(':memory:');
    const normalizedTrades = normalizeTradePayload(trades(), marketAddress, new Date(10_000));
    const normalizedBook = normalizeDepthPayload(depth(), marketAddress, new Date(10_000));
    const normalizedPrice = normalizeMarketPricePayload(price(), marketAddress, new Date(10_000));
    const first = Repository.saveBatch(
      normalizedTrades,
      [normalizedBook],
      [normalizedPrice],
      [],
      4,
    );
    const replay = Repository.saveBatch(
      normalizedTrades,
      [normalizedBook],
      [normalizedPrice],
      [],
      4,
    );
    expect(Repository.getJournalMode()).toBe('memory');
    expect(first).toMatchObject({ trades: 2, duplicateTrades: 0, books: 1, prices: 1 });
    expect(replay).toMatchObject({ trades: 0, duplicateTrades: 2, books: 0, prices: 0 });
    expect(Repository.getCounts()).toEqual({ trades: 2, books: 1, prices: 1, aggregates: 0 });
    expect(() => Repository.saveBatch(normalizedTrades, [], [], [], 1)).toThrow('exceeds');
    Repository.close();
  });

  it('marks conflicting economic rows ambiguous and exposes one unknown-volume trade', () => {
    const Repository = new microstructure_repository(':memory:');
    const base = {
      trade_id: 'conflict',
      account: 'participant-a',
      order_id: 'order-a',
      market: marketAddress,
      action: 'Buy',
      size: 1,
      price: 100,
      transaction_unix_ms: 9_100,
      transaction_version: 100,
      is_taker: true,
    };
    const rows = normalizeTradePayload(
      { trades: [base, { ...base, account: 'participant-b', order_id: 'order-b', price: 101 }] },
      marketAddress,
    );
    const result = Repository.saveBatch(rows, [], [], [], 10);
    expect(result).toMatchObject({ economicTrades: 1, participantRows: 2, ambiguousTrades: 1 });
    expect(result.aggregateTrades).toHaveLength(1);
    expect(result.aggregateTrades[0]).toMatchObject({
      side: 'UNKNOWN',
      classificationReason: 'AMBIGUOUS_ECONOMIC_FIELDS',
    });
    Repository.close();
  });

  it('upserts an aggregate replay idempotently', () => {
    const Repository = new microstructure_repository(':memory:');
    const aggregate = {
      marketAddress,
      secondTimestamp: new Date(10_000),
      buyVolume: 0,
      sellVolume: 0,
      unknownVolume: 0,
      tradeCount: 0,
      vwap: null,
      spread: null,
      depthImbalance: null,
      orderFlowImbalance: 0,
      bookAgeMs: null,
      marketPriceAgeMs: null,
      markPrice: null,
      midPrice: null,
      oraclePrice: null,
      fundingRate: null,
      openInterest: null,
    };
    Repository.saveBatch([], [], [], [aggregate], 10);
    Repository.saveBatch([], [], [], [aggregate], 10);
    expect(Repository.getCounts().aggregates).toBe(1);
    Repository.close();
  });
});

describe('microstructure collector', () => {
  function makeCollector(
    bootstrapTradeLimit = 0,
    healthOptions: Partial<microstructure_collector_options> = {},
  ) {
    const handlers: Partial<Record<'depth' | 'trades' | 'price', (data: unknown) => void>> = {};
    let errorHandler: (() => void) | undefined;
    const unsubscribe = vi.fn();
    const subscribeBTCDepth = vi.fn<microstructure_client['subscribeBTCDepth']>(
      (_symbol, handler) => {
        handlers.depth = handler;
        return unsubscribe;
      },
    );
    const subscribeBTCTrades = vi.fn<microstructure_client['subscribeBTCTrades']>(
      (_symbol, handler) => {
        handlers.trades = handler;
        return unsubscribe;
      },
    );
    const subscribeBTCMarketPrice = vi.fn<microstructure_client['subscribeBTCMarketPrice']>(
      (_symbol, handler) => {
        handlers.price = handler;
        return unsubscribe;
      },
    );
    const onWebSocketError = vi.fn<microstructure_client['onWebSocketError']>((handler) => {
      errorHandler = handler;
      return vi.fn();
    });
    const closeWebSocket = vi.fn();
    const getBTCRecentTradesPage = vi
      .fn<microstructure_client['getBTCRecentTradesPage']>()
      .mockResolvedValue({ items: [], total_count: 0 });
    const client: microstructure_client = {
      getBTCMarketMetadata: vi.fn().mockResolvedValue(metadata),
      getBTCRecentTradesPage,
      subscribeBTCDepth,
      subscribeBTCTrades,
      subscribeBTCMarketPrice,
      onWebSocketError,
      closeWebSocket,
    };
    const Repository = new microstructure_repository(':memory:');
    const Collector = new microstructure_collector(client, Repository, {
      sampleIntervalMs: 250,
      startupGraceMs: 3_000,
      depthStaleAfterMs: 2_000,
      tradesStaleAfterMs: 10_000,
      marketPriceStaleAfterMs: 4_000,
      maximumBatchSize: 10,
      maximumBookAgeMs: 2_000,
      maximumPriceAgeMs: 5_000,
      heartbeatIntervalMs: 1_000,
      reconnectBaseDelayMs: 100,
      reconnectMaximumDelayMs: 400,
      bootstrapTradeLimit,
      ...healthOptions,
    });
    return {
      Collector,
      Repository,
      handlers,
      unsubscribe,
      subscribeBTCDepth,
      closeWebSocket,
      getBTCRecentTradesPage,
      getError: () => errorHandler,
    };
  }

  it('keeps silent streams waiting throughout startup grace without reconnecting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fake = makeCollector();
    await fake.Collector.start();
    expect(fake.Collector.getHealth()).toEqual({
      depth: 'waiting',
      trades: 'waiting',
      marketPrice: 'waiting',
    });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(fake.Collector.getHealth()).toEqual({
      depth: 'waiting',
      trades: 'waiting',
      marketPrice: 'waiting',
    });
    expect(fake.subscribeBTCDepth).toHaveBeenCalledOnce();
    fake.Collector.stop();
    fake.Repository.close();
  });

  it('tolerates a quiet trade stream while other WebSocket traffic proves liveness', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fake = makeCollector(0, {
      startupGraceMs: 1_000,
      depthStaleAfterMs: 2_000,
      tradesStaleAfterMs: 4_000,
      marketPriceStaleAfterMs: 2_000,
    });
    await fake.Collector.start();
    for (let index = 0; index < 6; index += 1) {
      fake.handlers.depth?.(depth(9_000 + index));
      fake.handlers.price?.(price(9_200 + index));
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(fake.Collector.getHealth().trades).toBe('waiting');
    expect(fake.subscribeBTCDepth).toHaveBeenCalledOnce();
    fake.Collector.stop();
    fake.Repository.close();
  });

  it('reconnects for genuinely stale depth after grace', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fake = makeCollector(0, {
      startupGraceMs: 1_000,
      depthStaleAfterMs: 1_500,
      tradesStaleAfterMs: 10_000,
      marketPriceStaleAfterMs: 5_000,
    });
    await fake.Collector.start();
    fake.handlers.price?.(price());
    await vi.advanceTimersByTimeAsync(2_001);
    expect(Object.values(fake.Collector.getHealth())).toContain('reconnecting');
    expect(fake.subscribeBTCDepth).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(100);
    expect(fake.subscribeBTCDepth).toHaveBeenCalledTimes(2);
    fake.Collector.stop();
    fake.Repository.close();
  });

  it('reconnects on WebSocket heartbeat failure and recovers through waiting to healthy', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fake = makeCollector();
    await fake.Collector.start();
    fake.getError()?.();
    expect(Object.values(fake.Collector.getHealth())).toEqual([
      'reconnecting',
      'reconnecting',
      'reconnecting',
    ]);
    await vi.advanceTimersByTimeAsync(100);
    expect(fake.Collector.getHealth()).toEqual({
      depth: 'waiting',
      trades: 'waiting',
      marketPrice: 'waiting',
    });
    fake.handlers.depth?.(depth());
    expect(fake.Collector.getHealth().depth).toBe('healthy');
    fake.Collector.stop();
    fake.Repository.close();
  });

  it('completes REST bootstrap before opening realtime subscriptions', async () => {
    const fake = makeCollector(1);
    await fake.Collector.start();
    expect(fake.getBTCRecentTradesPage).toHaveBeenCalledWith(marketAddress, 1, 0);
    expect(fake.getBTCRecentTradesPage.mock.invocationCallOrder[0]).toBeLessThan(
      fake.subscribeBTCDepth.mock.invocationCallOrder[0] ?? Infinity,
    );
    fake.Collector.stop();
    fake.Repository.close();
  });

  it('samples changed books, deduplicates replays, and creates exact one-second aggregates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fake = makeCollector();
    await fake.Collector.start();
    fake.handlers.depth?.(depth());
    fake.handlers.trades?.(trades());
    fake.handlers.trades?.(trades());
    fake.handlers.price?.(price());
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fake.Repository.getCounts()).toEqual({ trades: 2, books: 1, prices: 1, aggregates: 1 });
    expect(fake.Repository.getAggregates()).toEqual([
      {
        marketAddress,
        secondTimestamp: new Date(10_000),
        buyVolume: 2,
        sellVolume: 1,
        unknownVolume: 0,
        tradeCount: 2,
        vwap: 301 / 3,
        spread: 1,
        depthImbalance: 0,
        orderFlowImbalance: 1 / 3,
        bookAgeMs: 1_000,
        marketPriceAgeMs: 1_000,
        markPrice: 100.5,
        midPrice: 100.6,
        oraclePrice: 100.4,
        fundingRate: 0.00015,
        openInterest: 50,
      },
    ]);
    expect(fake.Collector.getCounters()).toMatchObject({
      trades: 2,
      duplicateTrades: 2,
      books: 1,
      prices: 1,
      aggregates: 1,
    });
    expect(fake.Collector.getHealth()).toEqual({
      depth: 'healthy',
      trades: 'healthy',
      marketPrice: 'healthy',
    });
    fake.Collector.stop();
    fake.Repository.close();
  });

  it('persists every completed active second including empty seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fake = makeCollector();
    await fake.Collector.start();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fake.Repository.getAggregates().map((aggregate) => aggregate.secondTimestamp)).toEqual([
      new Date(10_000),
      new Date(11_000),
      new Date(12_000),
    ]);
    expect(fake.Repository.getAggregates()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tradeCount: 0,
          buyVolume: 0,
          sellVolume: 0,
          unknownVolume: 0,
          vwap: null,
        }),
      ]),
    );
    fake.Collector.stop();
    fake.Repository.close();
  });

  it('flushes all completed seconds during graceful shutdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fake = makeCollector();
    await fake.Collector.start();
    vi.setSystemTime(12_500);
    fake.Collector.stop();
    expect(fake.Repository.getAggregates().map((aggregate) => aggregate.secondTimestamp)).toEqual([
      new Date(10_000),
      new Date(11_000),
    ]);
    fake.Repository.close();
  });

  it('marks stale carried features unavailable without losing their ages', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fake = makeCollector();
    await fake.Collector.start();
    fake.handlers.depth?.(depth());
    await vi.advanceTimersByTimeAsync(3_000);
    expect(
      fake.Repository.getAggregates().map((aggregate) => ({
        second: aggregate.secondTimestamp.getTime(),
        bookAgeMs: aggregate.bookAgeMs,
        spread: aggregate.spread,
      })),
    ).toEqual([
      { second: 10_000, bookAgeMs: 1_000, spread: 1 },
      { second: 11_000, bookAgeMs: 2_000, spread: 1 },
      { second: 12_000, bookAgeMs: 3_000, spread: null },
    ]);
    fake.Collector.stop();
    fake.Repository.close();
  });

  it('does not create aggregates for a reconnect gap', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fake = makeCollector();
    await fake.Collector.start();
    await vi.advanceTimersByTimeAsync(1_500);
    fake.getError()?.();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fake.Repository.getAggregates().map((aggregate) => aggregate.secondTimestamp)).toEqual([
      new Date(10_000),
      new Date(12_000),
    ]);
    fake.Collector.stop();
    fake.Repository.close();
  });

  it('counts two participant rows for one realtime fill only once', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fake = makeCollector();
    await fake.Collector.start();
    fake.handlers.depth?.(depth());
    const economic = {
      trade_id: 'shared-fill',
      market: marketAddress,
      size: 2,
      price: 100,
      transaction_unix_ms: 9_100,
      transaction_version: 77,
    };
    fake.handlers.trades?.({
      trades: [
        {
          ...economic,
          account: 'maker-participant',
          order_id: 'maker-order',
          action: 'Sell',
          is_taker: false,
        },
        {
          ...economic,
          account: 'taker-participant',
          order_id: 'taker-order',
          action: 'Buy',
          is_taker: true,
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fake.Repository.getAggregates()).toEqual([
      {
        marketAddress,
        secondTimestamp: new Date(10_000),
        buyVolume: 2,
        sellVolume: 0,
        unknownVolume: 0,
        tradeCount: 1,
        vwap: 100,
        spread: 1,
        depthImbalance: 0,
        orderFlowImbalance: 1,
        bookAgeMs: 1_000,
        marketPriceAgeMs: null,
        markPrice: null,
        midPrice: null,
        oraclePrice: null,
        fundingRate: null,
        openInterest: null,
      },
    ]);
    fake.Collector.stop();
    fake.Repository.close();
  });

  it('counts one ambiguous economic fill once as unknown volume', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fake = makeCollector();
    await fake.Collector.start();
    const common = {
      trade_id: 'ambiguous-fill',
      market: marketAddress,
      action: 'Trade',
      size: 1,
      transaction_unix_ms: 9_900,
      transaction_version: 88,
    };
    fake.handlers.trades?.({
      trades: [
        { ...common, account: 'a', price: 100 },
        { ...common, account: 'b', price: 101 },
      ],
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fake.Repository.getAggregates()[0]).toMatchObject({
      tradeCount: 1,
      buyVolume: 0,
      sellVolume: 0,
      unknownVolume: 1,
      orderFlowImbalance: 0,
    });
    fake.Collector.stop();
    fake.Repository.close();
  });

  it('detects regressions and stale streams, reconnects with backoff, and stops cleanly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fake = makeCollector();
    await fake.Collector.start();
    fake.handlers.depth?.(depth(9_000));
    fake.handlers.depth?.(depth(8_000));
    expect(fake.Collector.getCounters()).toMatchObject({ malformed: 1, regressions: 1 });
    await vi.advanceTimersByTimeAsync(4_001);
    expect(Object.values(fake.Collector.getHealth())).toContain('reconnecting');
    await vi.advanceTimersByTimeAsync(100);
    expect(fake.subscribeBTCDepth).toHaveBeenCalledTimes(2);
    fake.getError()?.();
    fake.Collector.stop();
    expect(fake.unsubscribe).toHaveBeenCalled();
    expect(fake.closeWebSocket).toHaveBeenCalledOnce();
    expect(Object.values(fake.Collector.getHealth())).toEqual(['stopped', 'stopped', 'stopped']);
    fake.Repository.close();
  });
});
