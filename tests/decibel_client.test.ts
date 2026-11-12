import type { DecibelConfig } from '@decibeltrade/sdk';
import { describe, expect, it, vi } from 'vitest';

import {
  decibel_client,
  type decibel_market_reader,
  type HTTP_fetch,
  type reader_factory,
} from '../src/decibel_client.js';

const { MAINNET_CONFIG, TESTNET_CONFIG } = vi.hoisted(() => ({
  MAINNET_CONFIG: {
    network: 'mainnet-sdk-config',
    tradingHttpUrl: 'https://mainnet.example',
  } as unknown as DecibelConfig,
  TESTNET_CONFIG: {
    network: 'testnet-sdk-config',
    tradingHttpUrl: 'https://testnet.example',
  } as unknown as DecibelConfig,
}));

vi.mock('@decibeltrade/sdk', () => ({
  DecibelReadDex: class {},
  MAINNET_CONFIG,
  TESTNET_CONFIG,
}));

const market = {
  market_addr: '0xbtc',
  market_name: 'BTC-USD',
  sz_decimals: 4,
  px_decimals: 2,
  max_leverage: 20,
  tick_size: 50,
  min_size: 1,
  lot_size: 5,
  max_open_interest: 1_000,
  mode: 'Open',
};

function makeReader(): decibel_market_reader {
  return {
    markets: { getAll: vi.fn().mockResolvedValue([market]) },
    marketPrices: {
      getByName: vi.fn().mockResolvedValue([
        {
          market: 'BTC-USD',
          mark_px: 65_001.25,
          mid_px: 65_000.5,
          oracle_px: 65_002,
          transaction_unix_ms: 1_700_000_000_000,
        },
      ]),
      subscribeByName: vi.fn(() => vi.fn()),
    },
    marketDepth: { subscribeByName: vi.fn(() => vi.fn()) },
    marketTrades: { subscribeByName: vi.fn(() => vi.fn()) },
    candlesticks: {
      getByName: vi.fn().mockResolvedValue([]),
      subscribeByName: vi.fn(() => vi.fn()),
    },
  };
}

describe('decibel_client', () => {
  it.each([50, 0])(
    'measures the identical replay with a %i ms publication timer policy',
    async (delay) => {
      vi.useFakeTimers();
      try {
        const { Client, callbacks, makeBook, FetchHTTP } = createDepthReplay();
        const initial = Client.getBTCStreamingBook('0xbtc');
        await vi.advanceTimersByTimeAsync(0);
        // Controlled baseline: inject the original 50 ms scheduling policy into
        // the same adapter. This measures timer delay, not live network latency.
        const schedule = globalThis.setTimeout;
        const Timer = vi
          .spyOn(globalThis, 'setTimeout')
          .mockImplementation((callback: () => void) => schedule(callback, delay));
        const start = Date.now();
        for (let index = 0; index < 1000; index++) callbacks[0]!(makeBook(100 + index));
        Timer.mockRestore();
        await vi.advanceTimersByTimeAsync(delay);
        await expect(initial).resolves.toMatchObject({ best_bid: 1099 });
        const diagnostics = Client.getBTCMarketDataDiagnostics();
        expect(diagnostics.lastReceiveToVerifiedMs).toBe(delay);
        expect(diagnostics.wsStatesVerified).toBe(1);
        expect(diagnostics.wsMessagesCoalesced).toBe(999);
        expect(FetchHTTP).not.toHaveBeenCalled();
        console.info(
          JSON.stringify({
            replay: '1000 complete states in one event-loop turn',
            timerPolicyMs: delay,
            receiveToVerifiedMs: Date.now() - start,
            statesVerified: diagnostics.wsStatesVerified,
            coalesced: diagnostics.wsMessagesCoalesced,
            httpBookRequests: FetchHTTP.mock.calls.length,
          }),
        );
        Client.closeWebSocket();
      } finally {
        vi.restoreAllMocks();
        vi.useRealTimers();
      }
    },
  );

  function createDepthReplay() {
    const Reader = makeReader();
    const ReadMetadata = vi.fn().mockResolvedValue([market]);
    Reader.markets.getAll = ReadMetadata;
    const callbacks: Array<(message: unknown) => void> = [];
    const unsubscribes: ReturnType<typeof vi.fn>[] = [];
    let emitError = () => {};
    Reader.marketDepth.subscribeByName = vi.fn(
      (_name: string, _aggregation: number, callback: (message: unknown) => void) => {
        callbacks.push(callback);
        const unsubscribe = vi.fn();
        unsubscribes.push(unsubscribe);
        return unsubscribe;
      },
    );
    const FetchHTTP = vi.fn<HTTP_fetch>();
    const Client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      (_configuration, options) => {
        emitError = () => options.onWsError?.(new Error('REPLAY_SOCKET_ERROR'));
        return Reader;
      },
      FetchHTTP,
    );
    const makeBook = (bid = 100, timestamp = Date.now()) => ({
      market: '0xbtc',
      bids: [{ price: bid, size: 2 }],
      asks: [{ price: bid + 1, size: 3 }],
      best_bid: bid,
      best_ask: bid + 1,
      unix_ms: timestamp,
    });
    return {
      Reader,
      ReadMetadata,
      Client,
      callbacks,
      unsubscribes,
      FetchHTTP,
      makeBook,
      emitError: () => emitError(),
    };
  }

  it('replays 1000 superseding states once, yields to critical events, and performs no REST reads', async () => {
    vi.useFakeTimers();
    try {
      const { Reader, ReadMetadata, Client, callbacks, FetchHTTP, makeBook } = createDepthReplay();
      const pending = Client.getBTCStreamingBook('0xbtc');
      await vi.advanceTimersByTimeAsync(0);
      const criticalEvents: string[] = [];
      queueMicrotask(() => criticalEvents.push('PARTIAL_FILL', 'ACK', 'FINALITY'));
      for (let index = 0; index < 1000; index++) callbacks[0]!(makeBook(100 + index));
      expect(Client.getBTCMarketDataDiagnostics().wsStatesVerified).toBe(0);
      await vi.advanceTimersByTimeAsync(0);
      await expect(pending).resolves.toMatchObject({ best_bid: 1099, best_ask: 1100 });
      expect(criticalEvents).toEqual(['PARTIAL_FILL', 'ACK', 'FINALITY']);
      expect(Client.getBTCMarketDataDiagnostics()).toMatchObject({
        wsMessagesReceived: 1000,
        wsMessagesCoalesced: 999,
        wsStatesVerified: 1,
        lastReceiveToVerifiedMs: 0,
      });
      await Promise.all(Array.from({ length: 100 }, () => Client.getBTCStreamingBook('0xbtc')));
      expect(Reader.marketDepth.subscribeByName).toHaveBeenCalledOnce();
      expect(ReadMetadata).toHaveBeenCalledOnce();
      expect(FetchHTTP).not.toHaveBeenCalled();
      Client.closeWebSocket();
    } finally {
      vi.useRealTimers();
    }
  });

  it('discards queued and late old-generation frames after a socket error', async () => {
    vi.useFakeTimers();
    try {
      const { Client, callbacks, unsubscribes, makeBook, emitError } = createDepthReplay();
      const initial = Client.getBTCStreamingBook('0xbtc');
      await vi.advanceTimersByTimeAsync(0);
      callbacks[0]!(makeBook());
      emitError();
      await vi.advanceTimersByTimeAsync(0);
      expect(Client.getBTCMarketDataDiagnostics()).toMatchObject({
        wsConnectionState: 'DISCONNECTED',
        wsStatesVerified: 0,
      });
      const recovered = Client.getBTCStreamingBook('0xbtc');
      await vi.advanceTimersByTimeAsync(0);
      callbacks[1]!(makeBook(200));
      callbacks[0]!(makeBook(900));
      await vi.advanceTimersByTimeAsync(0);
      await expect(Promise.all([initial, recovered])).resolves.toEqual([
        expect.objectContaining({ best_bid: 200 }),
        expect.objectContaining({ best_bid: 200 }),
      ]);
      expect(unsubscribes[0]).toHaveBeenCalledOnce();
      Client.closeWebSocket();
    } finally {
      vi.useRealTimers();
    }
  });

  it('replaces complete depth states without retaining removed levels or old liquidity', async () => {
    vi.useFakeTimers();
    try {
      const { Client, callbacks, makeBook } = createDepthReplay();
      const initial = Client.getBTCStreamingBook('0xbtc');
      await vi.advanceTimersByTimeAsync(0);
      callbacks[0]!({
        ...makeBook(),
        bids: [
          { price: 99, size: 5 },
          { price: 100, size: 2 },
        ],
        asks: [
          { price: 102, size: 7 },
          { price: 101, size: 3 },
        ],
      });
      await vi.advanceTimersByTimeAsync(0);
      await expect(initial).resolves.toMatchObject({ best_bid: 100, best_ask: 101 });
      callbacks[0]!({
        ...makeBook(99),
        bids: [
          { price: 98, size: 4 },
          { price: 99, size: 6 },
        ],
        asks: [
          { price: 102, size: 8 },
          { price: 100, size: 2 },
        ],
      });
      await vi.advanceTimersByTimeAsync(50);
      await expect(Client.getBTCStreamingBook('0xbtc')).resolves.toMatchObject({
        bids: [
          { price: 99, size: 6 },
          { price: 98, size: 4 },
        ],
        asks: [
          { price: 100, size: 2 },
          { price: 102, size: 8 },
        ],
        best_bid: 99,
        best_ask: 100,
        best_bid_size: 6,
        best_ask_size: 2,
        microprice: 99.75,
        top_book_imbalance: 0,
      });
      Client.closeWebSocket();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not open a subscription after close invalidates pending metadata initialization', async () => {
    const Reader = makeReader();
    let resolveMetadata: (value: unknown) => void = () => {};
    Reader.markets.getAll = () =>
      new Promise((resolve) => {
        resolveMetadata = resolve;
      });
    const Client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      () => Reader,
    );
    const pending = expect(Client.getBTCStreamingBook('0xbtc')).rejects.toThrow(
      'invalidated during initialization',
    );
    Client.closeWebSocket();
    resolveMetadata([market]);
    await pending;
    expect(Reader.marketDepth.subscribeByName).not.toHaveBeenCalled();
  });

  it('retains background coalescing under a sustained 1 ms stream', async () => {
    vi.useFakeTimers();
    try {
      const { Client, callbacks, makeBook } = createDepthReplay();
      const initial = Client.getBTCStreamingBook('0xbtc');
      await vi.advanceTimersByTimeAsync(0);
      callbacks[0]!(makeBook());
      await vi.advanceTimersByTimeAsync(0);
      await initial;
      for (let index = 0; index < 1000; index++) {
        callbacks[0]!(makeBook(100 + index));
        await vi.advanceTimersByTimeAsync(1);
      }
      expect(Client.getBTCMarketDataDiagnostics()).toMatchObject({
        wsMessagesReceived: 1001,
        wsStatesVerified: 21,
        wsMessagesCoalesced: 980,
      });
      await expect(Client.getBTCStreamingBook('0xbtc')).resolves.toMatchObject({ best_bid: 1099 });
      Client.closeWebSocket();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects regressing timestamps without claiming sequence or duplicate verification', async () => {
    vi.useFakeTimers();
    try {
      const { Client, callbacks, makeBook } = createDepthReplay();
      const timestamp = Date.now();
      const initial = Client.getBTCStreamingBook('0xbtc');
      await vi.advanceTimersByTimeAsync(0);
      callbacks[0]!(makeBook(100, timestamp));
      await vi.advanceTimersByTimeAsync(0);
      await initial;
      callbacks[0]!(makeBook(90, timestamp - 1));
      await vi.advanceTimersByTimeAsync(50);
      await expect(Client.getBTCStreamingBook('0xbtc')).resolves.toMatchObject({ best_bid: 100 });
      // Same timestamp may contain a different complete state; it is not a sequence ID.
      callbacks[0]!(makeBook(110, timestamp));
      await vi.advanceTimersByTimeAsync(50);
      await expect(Client.getBTCStreamingBook('0xbtc')).resolves.toMatchObject({ best_bid: 110 });
      expect(Client.getBTCMarketDataDiagnostics().wsMessagesRejected).toBe(1);
      Client.closeWebSocket();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['crossed', 'malformed', 'wrong market'])(
    'blocks access after %s depth until a new complete state is verified',
    async (kind) => {
      vi.useFakeTimers();
      try {
        const { Client, callbacks, makeBook } = createDepthReplay();
        const initial = Client.getBTCStreamingBook('0xbtc');
        await vi.advanceTimersByTimeAsync(0);
        callbacks[0]!(makeBook());
        await vi.advanceTimersByTimeAsync(0);
        await initial;
        callbacks[0]!(
          kind === 'malformed'
            ? {}
            : kind === 'wrong market'
              ? { ...makeBook(), market: '0xother' }
              : { ...makeBook(), asks: [{ price: 99, size: 1 }], best_ask: 99 },
        );
        await vi.advanceTimersByTimeAsync(50);
        expect(Client.getBTCMarketDataDiagnostics().wsConnectionState).toBe('STALLED');
        const blocked = expect(Client.getBTCStreamingBook('0xbtc', 10)).rejects.toThrow(
          'CURRENT_BOOK_WS_BBO_STALE',
        );
        await vi.advanceTimersByTimeAsync(10);
        await blocked;
        callbacks.at(-1)!(makeBook(200));
        await vi.advanceTimersByTimeAsync(0);
        await expect(Client.getBTCStreamingBook('0xbtc')).resolves.toMatchObject({ best_bid: 200 });
        Client.closeWebSocket();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('aborts a bounded market-rules read and fetches fresh mode on the next attempt', async () => {
    const Reader = makeReader();
    Reader.markets.getAll = (input) =>
      new Promise((_resolve, reject) => {
        const signal = input?.fetchOptions.signal;
        signal?.addEventListener(
          'abort',
          () =>
            reject(signal.reason instanceof Error ? signal.reason : new Error('METADATA_ABORTED')),
          { once: true },
        );
      });
    const Client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      () => Reader,
    );
    const Controller = new AbortController();
    const pending = expect(Client.getBTCMarketMetadata(Controller.signal)).rejects.toThrow(
      'METADATA_CANCELLED',
    );
    Controller.abort(new Error('METADATA_CANCELLED'));
    await pending;
    Reader.markets.getAll = vi.fn().mockResolvedValue([{ ...market, mode: 'Halt' }]);
    await expect(Client.getBTCMarketMetadata()).resolves.toMatchObject({ mode: 'Halt' });
  });

  it('resubscribes the single authoritative depth feed after a valid-BBO stall', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    try {
      const Reader = makeReader();
      const callbacks: Array<(message: unknown) => void> = [];
      const unsubscribes: ReturnType<typeof vi.fn>[] = [];
      Reader.marketDepth.subscribeByName = vi.fn(
        (_name: string, _aggregation: number, onData: (message: unknown) => void) => {
          callbacks.push(onData);
          const unsubscribe = vi.fn();
          unsubscribes.push(unsubscribe);
          return unsubscribe;
        },
      );
      const Client = new decibel_client(
        { network: 'testnet', marketSymbol: 'BTC/USD' },
        () => Reader,
      );
      const makeBook = (timestamp: number) => ({
        market: '0xbtc',
        bids: [{ price: 100, size: 1 }],
        asks: [{ price: 101, size: 1 }],
        best_bid: 100,
        best_ask: 101,
        unix_ms: timestamp,
      });

      const first = Client.getBTCStreamingBook('0xbtc');
      await vi.advanceTimersByTimeAsync(0);
      callbacks[0]!(makeBook(Date.now()));
      await vi.advanceTimersByTimeAsync(50);
      await expect(first).resolves.toMatchObject({ best_bid: 100, best_ask: 101 });
      expect(Client.getBTCMarketDataDiagnostics()).toMatchObject({
        wsConnectionState: 'CONNECTED',
        wsSubscriptionState: 'SUBSCRIBED',
        wsReconnectCount: 0,
      });

      await vi.advanceTimersByTimeAsync(5_001);
      const recovered = Client.getBTCStreamingBook('0xbtc');
      await vi.advanceTimersByTimeAsync(0);
      expect(unsubscribes[0]).toHaveBeenCalledOnce();
      expect(callbacks).toHaveLength(2);
      callbacks[1]!(makeBook(Date.now()));
      await vi.advanceTimersByTimeAsync(50);
      await expect(recovered).resolves.toMatchObject({ best_bid: 100, best_ask: 101 });
      expect(Client.getBTCMarketDataDiagnostics()).toMatchObject({
        wsConnectionState: 'CONNECTED',
        wsSubscriptionState: 'SUBSCRIBED',
        wsReconnectCount: 1,
      });
      expect(Reader.marketDepth.subscribeByName).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('singleflights concurrent requests onto one depth subscription', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    try {
      const Reader = makeReader();
      let callback: ((message: unknown) => void) | null = null;
      Reader.marketDepth.subscribeByName = vi.fn(
        (_name: string, _aggregation: number, onData: (message: unknown) => void) => {
          callback = onData;
          return vi.fn();
        },
      );
      const Client = new decibel_client(
        { network: 'testnet', marketSymbol: 'BTC/USD' },
        () => Reader,
      );

      const first = Client.getBTCStreamingBook('0xbtc');
      const second = Client.getBTCStreamingBook('0xbtc');
      await vi.advanceTimersByTimeAsync(0);
      expect(Reader.marketDepth.subscribeByName).toHaveBeenCalledOnce();
      expect(callback).not.toBeNull();
      (callback as (message: unknown) => void)({
        market: '0xbtc',
        bids: [{ price: 100, size: 1 }],
        asks: [{ price: 101, size: 1 }],
        best_bid: 100,
        best_ask: 101,
        best_bid_size: 1,
        best_ask_size: 1,
        unix_ms: Date.now(),
      });
      await vi.advanceTimersByTimeAsync(50);
      await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses fresh authoritative WebSocket depth without waiting for REST', async () => {
    const Reader = makeReader();
    Reader.marketDepth.subscribeByName = vi.fn(
      (_name: string, _aggregation: number, onData: (message: unknown) => void) => {
        queueMicrotask(() =>
          onData({
            market: '0xbtc',
            bids: [{ price: 100, size: 1 }],
            asks: [{ price: 101, size: 1 }],
            best_bid: 100,
            best_ask: 101,
            unix_ms: 1_700_000_000_000,
          }),
        );
        return vi.fn();
      },
    );
    const fetchHTTP = vi.fn<HTTP_fetch>();
    const Client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      () => Reader,
      fetchHTTP,
    );

    await expect(Client.getBTCStreamingBook('0xbtc')).resolves.toEqual({
      market: '0xbtc',
      bids: [{ price: 100, size: 1 }],
      asks: [{ price: 101, size: 1 }],
      best_bid: 100,
      best_ask: 101,
      best_bid_size: 1,
      best_ask_size: 1,
      microprice: 100.5,
      top_book_imbalance: 0,
      unix_ms: 1_700_000_000_000,
    });
    expect(fetchHTTP).not.toHaveBeenCalled();
  });

  it('fetches only the current BTC book snapshot by concrete market address', async () => {
    const fetchHTTP = vi.fn<HTTP_fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          asks: [['101', '1']],
          bids: [['100', '1']],
          ticker_id: '0xbtc',
          timestamp: '1700000000000',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const Client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      () => makeReader(),
      fetchHTTP,
    );

    await expect(Client.getBTCCurrentBook('0xbtc')).resolves.toEqual({
      market: '0xbtc',
      asks: [{ price: 101, size: 1 }],
      bids: [{ price: 100, size: 1 }],
      best_ask: 101,
      best_bid: 100,
      best_ask_size: 1,
      best_bid_size: 1,
      microprice: 100.5,
      top_book_imbalance: 0,
      unix_ms: 1_700_000_000_000,
    });
    expect(fetchHTTP).toHaveBeenCalledWith(
      'https://testnet.example/api/v1/orderbook?market=0xbtc',
      { headers: new Headers() },
    );
  });

  it('fetches bounded REST trade pages by concrete market address without exposing the key', async () => {
    const fetchHTTP = vi.fn<HTTP_fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total_count: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const Client = new decibel_client(
      { network: 'mainnet', nodeApiKey: 'example-not-a-real-key', marketSymbol: 'BTC/USD' },
      () => makeReader(),
      fetchHTTP,
    );
    await Client.getBTCRecentTradesPage('0xbtc', 200, 400);
    const [requestURL, requestInit] = fetchHTTP.mock.calls[0] ?? [];
    expect(requestURL).toBe(
      'https://mainnet.example/api/v1/trades?market=0xbtc&limit=200&offset=400',
    );
    expect((requestInit as RequestInit).headers).toEqual(
      new Headers({ Authorization: 'Bearer example-not-a-real-key' }),
    );
    await expect(Client.getBTCRecentTradesPage('0xbtc', 201, 0)).rejects.toThrow(
      'between 1 and 200',
    );
  });

  it('subscribes to read-only BTC depth, trades, and market-price SDK readers', () => {
    const reader = makeReader();
    const Client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      () => reader,
    );
    const handler = vi.fn();
    Client.subscribeBTCDepth('BTC-USD', handler);
    Client.subscribeBTCTrades('BTC-USD', handler);
    Client.subscribeBTCMarketPrice('BTC-USD', handler);
    expect(reader.marketDepth.subscribeByName).toHaveBeenCalledWith('BTC-USD', 1, handler);
    expect(reader.marketTrades.subscribeByName).toHaveBeenCalledWith('BTC-USD', handler);
    expect(reader.marketPrices.subscribeByName).toHaveBeenCalledWith('BTC-USD', handler);
  });

  it.each([
    ['testnet' as const, TESTNET_CONFIG],
    ['mainnet' as const, MAINNET_CONFIG],
  ])('selects the %s SDK configuration', (network, expectedConfig) => {
    const factory = vi.fn<reader_factory>(() => makeReader());
    new decibel_client({ network, marketSymbol: 'BTC/USD' }, factory);
    expect(factory.mock.calls[0]?.[0]).toBe(expectedConfig);
    expect(typeof factory.mock.calls[0]?.[1].onWsError).toBe('function');
  });

  it('passes the API key only to the SDK factory', () => {
    const factory = vi.fn<reader_factory>(() => makeReader());
    new decibel_client(
      { network: 'testnet', nodeApiKey: 'example-not-a-real-key', marketSymbol: 'BTC/USD' },
      factory,
    );
    expect(factory.mock.calls[0]?.[0]).toBe(TESTNET_CONFIG);
    expect(factory.mock.calls[0]?.[1].nodeApiKey).toBe('example-not-a-real-key');
  });

  it('normalizes BTC/USD perpetual metadata and current prices', async () => {
    const client = new decibel_client({ network: 'testnet', marketSymbol: 'BTC/USD' }, () =>
      makeReader(),
    );

    await expect(client.getBTCMarketMetadata()).resolves.toEqual({
      symbol: 'BTC/USD',
      exchangeSymbol: 'BTC-USD',
      marketAddress: '0xbtc',
      sizeDecimals: 4,
      priceDecimals: 2,
      tickSize: 0.5,
      minimumSize: 0.0001,
      lotSize: 0.0005,
      maximumLeverage: 20,
      maximumOpenInterest: 1_000,
      mode: 'Open',
    });
    await expect(client.getBTCPrice()).resolves.toEqual({
      symbol: 'BTC/USD',
      exchangeSymbol: 'BTC-USD',
      markPrice: 65_001.25,
      midPrice: 65_000.5,
      oraclePrice: 65_002,
      observedAt: new Date(1_700_000_000_000),
    });
  });

  it('ignores unrelated spot rows before applying perpetual leverage validation', async () => {
    const reader = makeReader();
    reader.markets.getAll = vi.fn().mockResolvedValue([
      {
        ...market,
        market_addr: '0xspot',
        market_name: 'APT/USD',
        asset_type: 'spot',
        max_leverage: 0,
      },
      { ...market, asset_type: 'perp' },
    ]);
    const client = new decibel_client(
      { network: 'mainnet', marketSymbol: 'BTC/USD' },
      () => reader,
    );

    await expect(client.getBTCMarketMetadata()).resolves.toMatchObject({
      marketAddress: '0xbtc',
      exchangeSymbol: 'BTC-USD',
      maximumLeverage: 20,
    });
  });

  it('normalizes price and size chain units with their respective decimal scales', async () => {
    const reader = makeReader();
    reader.markets.getAll = vi.fn().mockResolvedValue([
      {
        ...market,
        px_decimals: 6,
        sz_decimals: 8,
        tick_size: 25_000,
        min_size: 100_000,
        lot_size: 1,
      },
    ]);
    const client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      () => reader,
    );

    const metadata = await client.getBTCMarketMetadata();

    expect(metadata.tickSize).toBe(0.025);
    expect(metadata.minimumSize).toBe(0.001);
    expect(metadata.lotSize).toBe(0.00000001);
  });

  it('rejects missing markets and malformed external prices', async () => {
    const missing = makeReader();
    missing.markets.getAll = vi.fn().mockResolvedValue([]);
    await expect(
      new decibel_client(
        { network: 'testnet', marketSymbol: 'BTC/USD' },
        () => missing,
      ).getBTCMarketMetadata(),
    ).rejects.toThrow('BTC/USD perpetual market was not found');

    const malformed = makeReader();
    malformed.marketPrices.getByName = vi.fn().mockResolvedValue([{ mark_px: -1 }]);
    const client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      () => malformed,
    );
    await client.getBTCMarketMetadata();
    await expect(client.getBTCPrice()).rejects.toThrow();
  });

  it('normalizes and chronologically orders hourly candles for the concrete BTC market', async () => {
    const reader = makeReader();
    const getCandles = vi.fn().mockResolvedValue([
      {
        t: 7_200_000,
        T: 10_799_999,
        i: '1h',
        o: 62_000,
        h: 63_000,
        l: 61_500,
        c: 62_500,
        v: 12.5,
      },
      {
        t: 3_600_000,
        T: 7_199_999,
        i: '1h',
        o: 60_000,
        h: 62_000,
        l: 59_500,
        c: 61_900,
        v: 10.25,
      },
    ]);
    reader.candlesticks.getByName = getCandles;
    const client = new decibel_client(
      { network: 'mainnet', marketSymbol: 'BTC/USD' },
      () => reader,
    );

    await expect(
      client.getBTCHourlyCandlesticks(
        new Date(3_600_000),
        new Date(10_800_000),
        new Date(20_000_000),
      ),
    ).resolves.toEqual({
      symbol: 'BTC/USD',
      exchangeSymbol: 'BTC-USD',
      marketAddress: '0xbtc',
      interval: '1h',
      candles: [
        {
          timestamp: new Date(3_600_000),
          open: 60_000,
          high: 62_000,
          low: 59_500,
          close: 61_900,
          volume: 10.25,
        },
        {
          timestamp: new Date(7_200_000),
          open: 62_000,
          high: 63_000,
          low: 61_500,
          close: 62_500,
          volume: 12.5,
        },
      ],
    });
    expect(getCandles).toHaveBeenCalledWith({
      marketName: 'BTC-USD',
      interval: '1h',
      startTime: 3_600_000,
      endTime: 10_800_000,
    });
  });

  it('excludes the currently unfinished hourly candle', async () => {
    const reader = makeReader();
    reader.candlesticks.getByName = vi.fn().mockResolvedValue([
      { t: 0, T: 3_599_999, i: '1h', o: 1, h: 2, l: 1, c: 2, v: 3 },
      { t: 3_600_000, T: 7_199_999, i: '1h', o: 2, h: 3, l: 2, c: 3, v: 4 },
    ]);
    const client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      () => reader,
    );

    const history = await client.getBTCHourlyCandlesticks(
      new Date(0),
      new Date(7_200_000),
      new Date(5_000_000),
    );

    expect(history.candles.map((candle) => candle.timestamp)).toEqual([new Date(0)]);
  });

  it('keeps completed 5-minute candles on exact UTC boundaries and excludes the open candle', async () => {
    const reader = makeReader();
    reader.candlesticks.getByName = vi.fn().mockResolvedValue([
      { t: 0, T: 299_999, i: '5m', o: 1, h: 2, l: 1, c: 2, v: 3 },
      { t: 300_000, T: 599_999, i: '5m', o: 2, h: 3, l: 2, c: 3, v: 4 },
    ]);
    const client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      () => reader,
    );

    const history = await client.getBTCCandlesticks(
      '5m',
      new Date(0),
      new Date(600_000),
      new Date(450_000),
    );

    expect(history.interval).toBe('5m');
    expect(history.candles.map((candle) => candle.timestamp.getTime())).toEqual([0]);
  });

  it('rejects a misaligned 5-minute candle timestamp', async () => {
    const reader = makeReader();
    reader.candlesticks.getByName = vi
      .fn()
      .mockResolvedValue([{ t: 1, T: 300_000, i: '5m', o: 1, h: 2, l: 1, c: 2, v: 3 }]);
    const client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      () => reader,
    );

    await expect(
      client.getBTCCandlesticks('5m', new Date(0), new Date(600_000), new Date(1_000_000)),
    ).rejects.toThrow('misaligned 5m candle');
  });

  it('rejects duplicate timestamps', async () => {
    const reader = makeReader();
    reader.candlesticks.getByName = vi.fn().mockResolvedValue([
      { t: 0, T: 3_599_999, i: '1h', o: 1, h: 2, l: 1, c: 2, v: 3 },
      { t: 0, T: 3_599_999, i: '1h', o: 2, h: 3, l: 2, c: 3, v: 4 },
    ]);
    const client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      () => reader,
    );

    await expect(
      client.getBTCHourlyCandlesticks(new Date(0), new Date(7_200_000), new Date(10_000_000)),
    ).rejects.toThrow('duplicate BTC candle timestamp: 0');
  });

  it('rejects malformed candle values and intervals', async () => {
    const reader = makeReader();
    reader.candlesticks.getByName = vi
      .fn()
      .mockResolvedValue([{ t: 0, T: 3_599_999, i: '5m', o: 2, h: 1, l: 3, c: 2, v: -1 }]);
    const client = new decibel_client(
      { network: 'testnet', marketSymbol: 'BTC/USD' },
      () => reader,
    );

    await expect(
      client.getBTCHourlyCandlesticks(new Date(0), new Date(7_200_000), new Date(10_000_000)),
    ).rejects.toThrow();
  });
});
