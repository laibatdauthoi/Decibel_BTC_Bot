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
