import { z } from 'zod';

import { alignTimestamp, getIntervalMilliseconds } from './candle_interval.js';
import type { BTC_candlestick } from './decibel_client.js';

const ONE_HOUR_MS = getIntervalMilliseconds('1h');

const MarketStructureConfigSchema = z.object({
  leftBars: z.number().int().positive().max(100),
  rightBars: z.number().int().positive().max(100),
});

const MarketStructureEnvironmentSchema = z.object({
  SWING_LEFT_BARS: z.coerce.number().int().positive().max(100).default(2),
  SWING_RIGHT_BARS: z.coerce.number().int().positive().max(100).default(2),
});

const HourlyCandleSchema = z
  .object({
    timestamp: z.date(),
    open: z.number().positive().finite(),
    high: z.number().positive().finite(),
    low: z.number().positive().finite(),
    close: z.number().positive().finite(),
    volume: z.number().nonnegative().finite(),
  })
  .superRefine((candle, context) => {
    if (candle.high < Math.max(candle.open, candle.close, candle.low)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'High price is inconsistent' });
    }
    if (candle.low > Math.min(candle.open, candle.close, candle.high)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Low price is inconsistent' });
    }
  });

export type market_structure_config = z.infer<typeof MarketStructureConfigSchema>;
export type market_regime = 'TREND_UP' | 'TREND_DOWN' | 'RANGE' | 'UNKNOWN';
export type confirmed_swing = {
  type: 'SWING_HIGH' | 'SWING_LOW';
  price: number;
  pivotTime: Date;
  confirmedAtTime: Date;
};

export type market_structure_result = {
  regime: market_regime;
  swingHighs: confirmed_swing[];
  swingLows: confirmed_swing[];
};

export function loadMarketStructureConfig(
  environment: Record<string, string | undefined> = process.env,
): market_structure_config {
  const parsed = MarketStructureEnvironmentSchema.parse(environment);
  return MarketStructureConfigSchema.parse({
    leftBars: parsed.SWING_LEFT_BARS,
    rightBars: parsed.SWING_RIGHT_BARS,
  });
}

function validateHourlyCandles(candles: readonly BTC_candlestick[]): void {
  for (let index = 0; index < candles.length; index += 1) {
    const candle = HourlyCandleSchema.parse(candles[index]);
    const timestamp = candle.timestamp.getTime();
    if (!Number.isSafeInteger(timestamp) || alignTimestamp(timestamp, '1h') !== timestamp) {
      throw new Error('BTC/USD 1h candle timestamp is misaligned');
    }
    const previous = candles[index - 1];
    if (previous === undefined) continue;
    const difference = timestamp - previous.timestamp.getTime();
    if (difference === 0) throw new Error('BTC/USD 1h candles contain duplicate timestamps');
    if (difference < 0) throw new Error('BTC/USD 1h candles are unordered');
    if (difference !== ONE_HOUR_MS) throw new Error('BTC/USD 1h candles contain a gap');
  }
}

function classifyRegime(
  swingHighs: readonly confirmed_swing[],
  swingLows: readonly confirmed_swing[],
): market_regime {
  const previousHigh = swingHighs.at(-2);
  const latestHigh = swingHighs.at(-1);
  const previousLow = swingLows.at(-2);
  const latestLow = swingLows.at(-1);
  if (
    previousHigh === undefined ||
    latestHigh === undefined ||
    previousLow === undefined ||
    latestLow === undefined
  ) {
    return 'UNKNOWN';
  }
  if (latestHigh.price > previousHigh.price && latestLow.price > previousLow.price) {
    return 'TREND_UP';
  }
  if (latestHigh.price < previousHigh.price && latestLow.price < previousLow.price) {
    return 'TREND_DOWN';
  }
  return 'RANGE';
}

export function detectMarketStructure(
  sourceCandles: readonly BTC_candlestick[],
  config: market_structure_config,
  now: Date = new Date(),
): market_structure_result {
  const validatedConfig = MarketStructureConfigSchema.parse(config);
  const nowTimestamp = now.getTime();
  if (!Number.isSafeInteger(nowTimestamp)) throw new Error('Market structure cutoff is invalid');
  const candles = sourceCandles.filter(
    (candle) => candle.timestamp.getTime() + ONE_HOUR_MS <= nowTimestamp,
  );
  validateHourlyCandles(candles);

  const swingHighs: confirmed_swing[] = [];
  const swingLows: confirmed_swing[] = [];
  for (
    let pivotIndex = validatedConfig.leftBars;
    pivotIndex + validatedConfig.rightBars < candles.length;
    pivotIndex += 1
  ) {
    const pivot = candles[pivotIndex];
    const confirmation = candles[pivotIndex + validatedConfig.rightBars];
    if (pivot === undefined || confirmation === undefined) continue;
    const neighbours = candles.slice(
      pivotIndex - validatedConfig.leftBars,
      pivotIndex + validatedConfig.rightBars + 1,
    );
    const otherCandles = neighbours.filter((candle) => candle !== pivot);
    const confirmedAtTime = new Date(confirmation.timestamp.getTime() + ONE_HOUR_MS);
    if (otherCandles.every((candle) => pivot.high > candle.high)) {
      swingHighs.push({
        type: 'SWING_HIGH',
        price: pivot.high,
        pivotTime: pivot.timestamp,
        confirmedAtTime,
      });
    }
    if (otherCandles.every((candle) => pivot.low < candle.low)) {
      swingLows.push({
        type: 'SWING_LOW',
        price: pivot.low,
        pivotTime: pivot.timestamp,
        confirmedAtTime,
      });
    }
  }
  return { regime: classifyRegime(swingHighs, swingLows), swingHighs, swingLows };
}
