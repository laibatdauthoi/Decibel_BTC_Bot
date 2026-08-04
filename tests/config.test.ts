import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('defaults to testnet and BTC/USD without requiring credentials', () => {
    expect(loadConfig({})).toEqual({
      network: 'testnet',
      marketSymbol: 'BTC/USD',
      candleInterval: '5m',
      candleHistoryDays: 90,
      liveTradingEnabled: false,
      logFormat: 'pretty',
    });
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
      candleInterval: '5m',
      candleHistoryDays: 90,
      liveTradingEnabled: false,
      logFormat: 'pretty',
    });
  });

  it('defaults to pretty logs and validates JSON logging', () => {
    expect(loadConfig({}).logFormat).toBe('pretty');
    expect(loadConfig({ LOG_FORMAT: 'json' }).logFormat).toBe('json');
    expect(() => loadConfig({ LOG_FORMAT: 'text' })).toThrow(
      'Invalid environment configuration: LOG_FORMAT',
    );
  });

  it('keeps live trading disabled by default and validates explicit boolean values', () => {
    expect(loadConfig({}).liveTradingEnabled).toBe(false);
    expect(loadConfig({ LIVE_TRADING_ENABLED: 'true' }).liveTradingEnabled).toBe(true);
    expect(() => loadConfig({ LIVE_TRADING_ENABLED: 'yes' })).toThrow(
      'Invalid environment configuration: LIVE_TRADING_ENABLED',
    );
  });

  it('validates the historical backfill day range', () => {
    expect(loadConfig({ CANDLE_HISTORY_DAYS: '365' }).candleHistoryDays).toBe(365);
    expect(() => loadConfig({ CANDLE_HISTORY_DAYS: '0' })).toThrow(
      'Invalid environment configuration: CANDLE_HISTORY_DAYS',
    );
    expect(() => loadConfig({ CANDLE_HISTORY_DAYS: '366' })).toThrow(
      'Invalid environment configuration: CANDLE_HISTORY_DAYS',
    );
  });

  it('accepts Decibel intervals and rejects unsupported values', () => {
    expect(loadConfig({ CANDLE_INTERVAL: '15m' }).candleInterval).toBe('15m');
    expect(() => loadConfig({ CANDLE_INTERVAL: '10m' })).toThrow(
      'Invalid environment configuration: CANDLE_INTERVAL',
    );
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
