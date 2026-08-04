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
});
