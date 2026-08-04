import type { DecibelConfig } from '@decibeltrade/sdk';
import { describe, expect, it, vi } from 'vitest';

import { decibel_client, type decibel_market_reader } from '../src/decibel_client.js';

const { MAINNET_CONFIG, TESTNET_CONFIG } = vi.hoisted(() => ({
  MAINNET_CONFIG: { network: 'mainnet-sdk-config' } as unknown as DecibelConfig,
  TESTNET_CONFIG: { network: 'testnet-sdk-config' } as unknown as DecibelConfig,
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
    },
    candlesticks: { getByName: vi.fn().mockResolvedValue([]) },
  };
}

describe('decibel_client', () => {
  it.each([
    ['testnet' as const, TESTNET_CONFIG],
    ['mainnet' as const, MAINNET_CONFIG],
  ])('selects the %s SDK configuration', (network, expectedConfig) => {
    const factory = vi.fn(() => makeReader());
    new decibel_client({ network, marketSymbol: 'BTC/USD' }, factory);
    expect(factory).toHaveBeenCalledWith(expectedConfig, {});
  });

  it('passes the API key only to the SDK factory', () => {
    const factory = vi.fn(() => makeReader());
    new decibel_client(
      { network: 'testnet', nodeApiKey: 'example-not-a-real-key', marketSymbol: 'BTC/USD' },
      factory,
    );
    expect(factory).toHaveBeenCalledWith(TESTNET_CONFIG, {
      nodeApiKey: 'example-not-a-real-key',
    });
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
