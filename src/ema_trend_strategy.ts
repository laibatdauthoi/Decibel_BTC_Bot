import { z } from 'zod';

import type { backtest_signal, backtest_strategy, strategy_context } from './backtesting_engine.js';

const FIVE_MINUTES_MS = 300_000;
const MINIMUM_WARM_UP_CANDLES = 50;

const EMATrendStrategyConfigSchema = z
  .object({
    fastPeriod: z.number().int().positive(),
    slowPeriod: z.number().int().positive(),
    trendPeriod: z.number().int().positive(),
    maximumHoldingBars: z.number().int().positive(),
  })
  .superRefine((config, context) => {
    if (config.fastPeriod >= config.slowPeriod || config.slowPeriod >= config.trendPeriod) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'EMA periods must satisfy fastPeriod < slowPeriod < trendPeriod',
      });
    }
  });

const EMATrendEnvironmentSchema = z.object({
  EMA_FAST_PERIOD: z.coerce.number().int().positive().default(9),
  EMA_SLOW_PERIOD: z.coerce.number().int().positive().default(21),
  EMA_TREND_PERIOD: z.coerce.number().int().positive().default(50),
  EMA_MAXIMUM_HOLDING_BARS: z.coerce.number().int().positive().default(48),
  BACKTEST_VERBOSE: z.enum(['true', 'false']).default('false'),
});

export type EMA_trend_strategy_config = z.infer<typeof EMATrendStrategyConfigSchema>;

export type backtest_command_config = EMA_trend_strategy_config & {
  verbose: boolean;
};

export function loadBacktestCommandConfig(
  environment: Record<string, string | undefined> = process.env,
): backtest_command_config {
  const parsed = EMATrendEnvironmentSchema.parse(environment);
  return {
    ...EMATrendStrategyConfigSchema.parse({
      fastPeriod: parsed.EMA_FAST_PERIOD,
      slowPeriod: parsed.EMA_SLOW_PERIOD,
      trendPeriod: parsed.EMA_TREND_PERIOD,
      maximumHoldingBars: parsed.EMA_MAXIMUM_HOLDING_BARS,
    }),
    verbose: parsed.BACKTEST_VERBOSE === 'true',
  };
}

function calculateLatestEMA(closes: readonly number[], period: number): [number, number] {
  const multiplier = 2 / (period + 1);
  let previous = closes[0];
  if (previous === undefined) throw new Error('EMA requires at least one close');
  let current = previous;
  for (let index = 1; index < closes.length; index += 1) {
    const close = closes[index];
    if (close === undefined) continue;
    previous = current;
    current = close * multiplier + current * (1 - multiplier);
  }
  return [previous, current];
}

export class ema_trend_strategy implements backtest_strategy {
  readonly config: EMA_trend_strategy_config;

  constructor(config: EMA_trend_strategy_config) {
    this.config = EMATrendStrategyConfigSchema.parse(config);
  }

  evaluate(context: strategy_context): backtest_signal {
    const warmUpCandles = Math.max(MINIMUM_WARM_UP_CANDLES, this.config.trendPeriod);
    if (context.candles.length < warmUpCandles) return 'HOLD';

    const closes = context.candles.map((candle) => candle.close);
    const [previousFast, currentFast] = calculateLatestEMA(closes, this.config.fastPeriod);
    const [previousSlow, currentSlow] = calculateLatestEMA(closes, this.config.slowPeriod);
    const [, currentTrend] = calculateLatestEMA(closes, this.config.trendPeriod);
    const crossedAbove = previousFast <= previousSlow && currentFast > currentSlow;
    const crossedBelow = previousFast >= previousSlow && currentFast < currentSlow;
    const latestCandle = context.candles.at(-1);
    if (latestCandle === undefined) return 'HOLD';

    if (context.position !== null) {
      const barsHeld =
        (latestCandle.timestamp.getTime() - context.position.entryTime.getTime()) /
          FIVE_MINUTES_MS +
        1;
      if (barsHeld >= this.config.maximumHoldingBars) return 'EXIT';
      if (context.position.side === 'LONG' && crossedBelow) return 'EXIT';
      if (context.position.side === 'SHORT' && crossedAbove) return 'EXIT';
      return 'HOLD';
    }

    if (crossedAbove && latestCandle.close > currentTrend) return 'LONG';
    if (crossedBelow && latestCandle.close < currentTrend) return 'SHORT';
    return 'HOLD';
  }
}
