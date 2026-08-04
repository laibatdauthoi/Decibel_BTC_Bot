import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('defaults to testnet and BTC/USD without requiring credentials', () => {
    expect(loadConfig({})).toEqual({ network: 'testnet', marketSymbol: 'BTC/USD' });
  });

  it('loads mainnet and an optional node API key', () => {
    expect(
      loadConfig({
        DECIBEL_NETWORK: 'mainnet',
        DECIBEL_NODE_API_KEY: 'example-not-a-real-key',
        MARKET_SYMBOL: 'BTC/USD',
      }),
    ).toEqual({
      network: 'mainnet',
      nodeApiKey: 'example-not-a-real-key',
      marketSymbol: 'BTC/USD',
    });
  });

  it('rejects unsupported networks and markets without exposing values', () => {
    expect(() => loadConfig({ DECIBEL_NETWORK: 'production' })).toThrow(
      'Invalid environment configuration: DECIBEL_NETWORK',
    );
    expect(() => loadConfig({ MARKET_SYMBOL: 'ETH/USD' })).toThrow(
      'Invalid environment configuration: MARKET_SYMBOL',
    );
  });
});
