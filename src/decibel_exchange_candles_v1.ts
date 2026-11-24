import { DECIBEL_STRATEGY_POLICY_V1 } from './decibel_strategy_policy_v1.js';
/**
 * Exchange candles for the candle-based rules (2026-11-14, operator decision): the entry
 * filter, the DCA momentum gate, the adverse-TP candle rule and the 5-minute range read
 * the venue's 1-minute candles (REST `/api/v1/candlesticks`, outlier wicks filtered), so they
 * work right after a restart and match the Decibel chart. Orders keep using the live BBO.
 *
 * Fallback: when the venue candles are missing or stale, the rules use the bot's own
 * BBO midpoint history as before.
 */
export const DECIBEL_EXCHANGE_CANDLE_MS_V1 = DECIBEL_STRATEGY_POLICY_V1.market.venueCandleMs;
/** History requested on each refresh. */
export const DECIBEL_EXCHANGE_CANDLE_LOOKBACK_MS_V1 =
  DECIBEL_STRATEGY_POLICY_V1.market.venueCandleLookbackMs;
/** Minimum time between two candle reads. */
export const DECIBEL_EXCHANGE_CANDLE_REFRESH_MS_V1 =
  DECIBEL_STRATEGY_POLICY_V1.market.venueCandleRefreshMs;
/** Candles are stale when the last closed one ended longer ago than this. */
export const DECIBEL_EXCHANGE_CANDLE_MAX_AGE_MS_V1 =
  DECIBEL_STRATEGY_POLICY_V1.market.venueCandleMaxAgeMs;

export type decibel_exchange_candle_v1 = Readonly<{
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
}>;

/**
 * Closed, well-formed, minute-aligned candles in time order (one per minute). Malformed rows
 * are dropped; the candle still forming at `now` is excluded.
 */
export function normalizeDecibelExchangeCandlesV1(
  rows: readonly Readonly<{ t: number; o: number; h: number; l: number; c: number }>[],
  now: number,
  intervalMs: number = DECIBEL_EXCHANGE_CANDLE_MS_V1,
): readonly decibel_exchange_candle_v1[] {
  const minute = intervalMs;
  const byStart = new Map<number, decibel_exchange_candle_v1>();
  for (const row of rows) {
    const values = [row.t, row.o, row.h, row.l, row.c];
    if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) continue;
    if (row.t % minute !== 0 || row.t + minute > now) continue;
    if (!(row.l > 0) || row.h < Math.max(row.o, row.c) || row.l > Math.min(row.o, row.c)) continue;
    byStart.set(
      row.t,
      Object.freeze({ start: row.t, open: row.o, high: row.h, low: row.l, close: row.c }),
    );
  }
  return Object.freeze([...byStart.values()].sort((a, b) => a.start - b.start));
}

/** True when the last closed candle ended recently enough to drive the candle rules. */
export function isDecibelExchangeCandleSetFreshV1(
  candles: readonly decibel_exchange_candle_v1[],
  now: number,
): boolean {
  const last = candles.at(-1);
  return (
    last !== undefined &&
    now - (last.start + DECIBEL_EXCHANGE_CANDLE_MS_V1) <= DECIBEL_EXCHANGE_CANDLE_MAX_AGE_MS_V1
  );
}

/**
 * Midpoint-like samples for the existing candle rules: four points per candle (open, the
 * two extremes, close) spread inside its minute, the extreme reached first guessed from the
 * candle colour. After the last closed candle, the live BBO samples continue the series.
 */
export function mergeDecibelExchangeCandleSamplesV1(
  candles: readonly decibel_exchange_candle_v1[],
  bboSamples: readonly Readonly<{ at: number; midpoint: number }>[],
): readonly Readonly<{ at: number; midpoint: number }>[] {
  const samples: Array<Readonly<{ at: number; midpoint: number }>> = [];
  for (const candle of candles) {
    const [first, second] =
      candle.close >= candle.open ? [candle.low, candle.high] : [candle.high, candle.low];
    samples.push(
      { at: candle.start, midpoint: candle.open },
      { at: candle.start + 15_000, midpoint: first },
      { at: candle.start + 30_000, midpoint: second },
      { at: candle.start + 45_000, midpoint: candle.close },
    );
  }
  const end = (candles.at(-1)?.start ?? Number.NEGATIVE_INFINITY) + DECIBEL_EXCHANGE_CANDLE_MS_V1;
  for (const sample of bboSamples)
    if (sample.at >= end) samples.push({ at: sample.at, midpoint: sample.midpoint });
  return Object.freeze(samples);
}
