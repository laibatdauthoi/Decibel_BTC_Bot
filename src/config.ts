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

const EnvironmentSchema = z.object({
  DECIBEL_NETWORK: z.enum(['mainnet', 'testnet']).default('testnet'),
  DECIBEL_NODE_API_KEY: optionalSecret,
  MARKET_SYMBOL: z.literal('BTC/USD').default('BTC/USD'),
  CANDLE_INTERVAL: CandleIntervalSchema.default('5m'),
  CANDLE_HISTORY_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  LIVE_TRADING_ENABLED: booleanEnvironmentValue,
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
});

export type application_config = {
  network: 'mainnet' | 'testnet';
  nodeApiKey?: string;
  marketSymbol: 'BTC/USD';
  candleInterval: candle_interval;
  candleHistoryDays: number;
  liveTradingEnabled: boolean;
  logFormat: log_format;
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
  };
}
