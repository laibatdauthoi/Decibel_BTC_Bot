import { z } from 'zod';

import { CandleIntervalSchema, type candle_interval } from './candle_interval.js';

const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const EnvironmentSchema = z.object({
  DECIBEL_NETWORK: z.enum(['mainnet', 'testnet']).default('testnet'),
  DECIBEL_NODE_API_KEY: optionalSecret,
  MARKET_SYMBOL: z.literal('BTC/USD').default('BTC/USD'),
  CANDLE_INTERVAL: CandleIntervalSchema.default('5m'),
});

export type application_config = {
  network: 'mainnet' | 'testnet';
  nodeApiKey?: string;
  marketSymbol: 'BTC/USD';
  candleInterval: candle_interval;
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
  };
}
