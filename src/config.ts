import { z } from 'zod';

import { CandleIntervalSchema, type candle_interval } from './candle_interval.js';
import type { log_format } from './logger.js';

const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const booleanEnvironmentValue = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const EnvironmentSchema = z
  .object({
    DECIBEL_NETWORK: z.enum(['mainnet', 'testnet']).default('testnet'),
    DECIBEL_NODE_API_KEY: optionalSecret,
    MARKET_SYMBOL: z.literal('BTC/USD').default('BTC/USD'),
    CANDLE_INTERVAL: CandleIntervalSchema.default('5m'),
    CANDLE_HISTORY_DAYS: z.coerce.number().int().min(1).max(365).default(90),
    LIVE_TRADING_ENABLED: booleanEnvironmentValue,
    LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
    MICROSTRUCTURE_SAMPLE_INTERVAL_MS: z.coerce.number().int().min(50).max(5_000).default(250),
    MICROSTRUCTURE_STARTUP_GRACE_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(15_000),
    MICROSTRUCTURE_DEPTH_STALE_AFTER_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(10_000),
    MICROSTRUCTURE_TRADES_STALE_AFTER_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(900_000)
      .default(120_000),
    MICROSTRUCTURE_MARKET_PRICE_STALE_AFTER_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(30_000),
    MICROSTRUCTURE_BATCH_SIZE: z.coerce.number().int().min(1).max(5_000).default(500),
    MICROSTRUCTURE_BOOTSTRAP_TRADE_LIMIT: z.coerce
      .number()
      .int()
      .min(0)
      .max(10_000)
      .default(10_000),
    MICROSTRUCTURE_MAX_BOOK_AGE_MS: z.coerce.number().int().min(0).max(60_000).default(2_000),
    MICROSTRUCTURE_MAX_PRICE_AGE_MS: z.coerce.number().int().min(0).max(60_000).default(5_000),
    DATA_RUNTIME_SHUTDOWN_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(10_000),
  })
  .superRefine((environment, context) => {
    if (
      environment.MICROSTRUCTURE_TRADES_STALE_AFTER_MS <=
      environment.MICROSTRUCTURE_DEPTH_STALE_AFTER_MS
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MICROSTRUCTURE_TRADES_STALE_AFTER_MS'],
        message: 'Trade staleness must exceed depth staleness',
      });
  });

export type application_config = {
  network: 'mainnet' | 'testnet';
  nodeApiKey?: string;
  marketSymbol: 'BTC/USD';
  candleInterval: candle_interval;
  candleHistoryDays: number;
  liveTradingEnabled: boolean;
  logFormat: log_format;
  microstructureSampleIntervalMs: number;
  microstructureStartupGraceMs: number;
  microstructureDepthStaleAfterMs: number;
  microstructureTradesStaleAfterMs: number;
  microstructureMarketPriceStaleAfterMs: number;
  microstructureBatchSize: number;
  microstructureBootstrapTradeLimit: number;
  microstructureMaximumBookAgeMs: number;
  microstructureMaximumPriceAgeMs: number;
  dataRuntimeShutdownTimeoutMs: number;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): application_config {
  const parsed = EnvironmentSchema.safeParse(environment);

  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }

  return {
    network: parsed.data.DECIBEL_NETWORK,
    ...(parsed.data.DECIBEL_NODE_API_KEY === undefined
      ? {}
      : { nodeApiKey: parsed.data.DECIBEL_NODE_API_KEY }),
    marketSymbol: parsed.data.MARKET_SYMBOL,
    candleInterval: parsed.data.CANDLE_INTERVAL,
    candleHistoryDays: parsed.data.CANDLE_HISTORY_DAYS,
    liveTradingEnabled: parsed.data.LIVE_TRADING_ENABLED,
    logFormat: parsed.data.LOG_FORMAT,
    microstructureSampleIntervalMs: parsed.data.MICROSTRUCTURE_SAMPLE_INTERVAL_MS,
    microstructureStartupGraceMs: parsed.data.MICROSTRUCTURE_STARTUP_GRACE_MS,
    microstructureDepthStaleAfterMs: parsed.data.MICROSTRUCTURE_DEPTH_STALE_AFTER_MS,
    microstructureTradesStaleAfterMs: parsed.data.MICROSTRUCTURE_TRADES_STALE_AFTER_MS,
    microstructureMarketPriceStaleAfterMs: parsed.data.MICROSTRUCTURE_MARKET_PRICE_STALE_AFTER_MS,
    microstructureBatchSize: parsed.data.MICROSTRUCTURE_BATCH_SIZE,
    microstructureBootstrapTradeLimit: parsed.data.MICROSTRUCTURE_BOOTSTRAP_TRADE_LIMIT,
    microstructureMaximumBookAgeMs: parsed.data.MICROSTRUCTURE_MAX_BOOK_AGE_MS,
    microstructureMaximumPriceAgeMs: parsed.data.MICROSTRUCTURE_MAX_PRICE_AGE_MS,
    dataRuntimeShutdownTimeoutMs: parsed.data.DATA_RUNTIME_SHUTDOWN_TIMEOUT_MS,
  };
}
