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
      microstructureSampleIntervalMs: 250,
      microstructureStartupGraceMs: 15_000,
      microstructureDepthStaleAfterMs: 10_000,
      microstructureTradesStaleAfterMs: 120_000,
      microstructureMarketPriceStaleAfterMs: 30_000,
      microstructureBatchSize: 500,
      microstructureBootstrapTradeLimit: 10_000,
      microstructureMaximumBookAgeMs: 2_000,
      microstructureMaximumPriceAgeMs: 5_000,
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
      microstructureSampleIntervalMs: 250,
      microstructureStartupGraceMs: 15_000,
      microstructureDepthStaleAfterMs: 10_000,
      microstructureTradesStaleAfterMs: 120_000,
      microstructureMarketPriceStaleAfterMs: 30_000,
      microstructureBatchSize: 500,
      microstructureBootstrapTradeLimit: 10_000,
      microstructureMaximumBookAgeMs: 2_000,
      microstructureMaximumPriceAgeMs: 5_000,
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

  it('validates microstructure sampling, staleness, and batch bounds', () => {
    expect(
      loadConfig({
        MICROSTRUCTURE_SAMPLE_INTERVAL_MS: '500',
        MICROSTRUCTURE_STARTUP_GRACE_MS: '30000',
        MICROSTRUCTURE_DEPTH_STALE_AFTER_MS: '20000',
        MICROSTRUCTURE_TRADES_STALE_AFTER_MS: '180000',
        MICROSTRUCTURE_MARKET_PRICE_STALE_AFTER_MS: '45000',
        MICROSTRUCTURE_BATCH_SIZE: '1000',
        MICROSTRUCTURE_BOOTSTRAP_TRADE_LIMIT: '2500',
        MICROSTRUCTURE_MAX_BOOK_AGE_MS: '1500',
        MICROSTRUCTURE_MAX_PRICE_AGE_MS: '4000',
      }),
    ).toMatchObject({
      microstructureSampleIntervalMs: 500,
      microstructureStartupGraceMs: 30_000,
      microstructureDepthStaleAfterMs: 20_000,
      microstructureTradesStaleAfterMs: 180_000,
      microstructureMarketPriceStaleAfterMs: 45_000,
      microstructureBatchSize: 1_000,
      microstructureBootstrapTradeLimit: 2_500,
      microstructureMaximumBookAgeMs: 1_500,
      microstructureMaximumPriceAgeMs: 4_000,
    });
    expect(() => loadConfig({ MICROSTRUCTURE_SAMPLE_INTERVAL_MS: '10' })).toThrow(
      'MICROSTRUCTURE_SAMPLE_INTERVAL_MS',
    );
    expect(() => loadConfig({ MICROSTRUCTURE_TRADES_STALE_AFTER_MS: '9999' })).toThrow(
      'MICROSTRUCTURE_TRADES_STALE_AFTER_MS',
    );
    expect(() =>
      loadConfig({
        MICROSTRUCTURE_DEPTH_STALE_AFTER_MS: '20000',
        MICROSTRUCTURE_TRADES_STALE_AFTER_MS: '20000',
      }),
    ).toThrow('MICROSTRUCTURE_TRADES_STALE_AFTER_MS');
    expect(() => loadConfig({ MICROSTRUCTURE_BATCH_SIZE: '0' })).toThrow(
      'MICROSTRUCTURE_BATCH_SIZE',
    );
    expect(() => loadConfig({ MICROSTRUCTURE_BOOTSTRAP_TRADE_LIMIT: '10001' })).toThrow(
      'MICROSTRUCTURE_BOOTSTRAP_TRADE_LIMIT',
    );
    expect(() => loadConfig({ MICROSTRUCTURE_MAX_BOOK_AGE_MS: '-1' })).toThrow(
      'MICROSTRUCTURE_MAX_BOOK_AGE_MS',
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
