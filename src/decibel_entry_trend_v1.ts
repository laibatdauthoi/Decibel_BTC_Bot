/**
 * Entry trend filter (2026-11-24, operator approved after a backtest).
 *
 * Mean-reverting entries lose most on days when BTC runs one way for hours: each long bought
 * into a long decline is a large loss. No new entry is opened against a move larger than
 * `entry.trendFilter.maxMoveBps` over the last `entry.trendFilter.lookbackMs` (no BUY after a
 * drop, no SELL after a rise); the other side and every exit continue. Without enough candle
 * history the filter does not block (it is a loss filter, not a safety control).
 */
import { DECIBEL_STRATEGY_POLICY_V1 } from './decibel_strategy_policy_v1.js';
import type { decibel_exchange_candle_v1 } from './decibel_exchange_candles_v1.js';

export type decibel_entry_side_blockers_v1 = Readonly<{ BUY: string | null; SELL: string | null }>;

/**
 * Move in bps from the open of the oldest candle inside the lookback to `midpoint`, or null
 * when the candles do not reach far enough back (80 % of the lookback, as in the backtest).
 */
export function getDecibelTrendMoveBpsV1(
  candles: readonly decibel_exchange_candle_v1[],
  midpoint: number,
  now: number,
  lookbackMs: number = DECIBEL_STRATEGY_POLICY_V1.entry.trendFilter.lookbackMs,
): number | null {
  if (!(midpoint > 0) || !(lookbackMs > 0)) return null;
  const reference = candles.find((candle) => candle.start >= now - lookbackMs);
  if (reference === undefined || reference.start > now - lookbackMs * 0.8) return null;
  if (!(reference.open > 0)) return null;
  return ((midpoint - reference.open) / reference.open) * 10_000;
}

/** Per-side blocker for a flat entry against the recent trend. */
export function getDecibelEntryTrendBlockersV1(
  moveBps: number | null,
  maxMoveBps: number = DECIBEL_STRATEGY_POLICY_V1.entry.trendFilter.maxMoveBps,
): decibel_entry_side_blockers_v1 {
  if (moveBps === null || !Number.isFinite(moveBps))
    return Object.freeze({ BUY: null, SELL: null });
  return Object.freeze({
    BUY: -moveBps > maxMoveBps ? 'ENTRY_AGAINST_TREND' : null,
    SELL: moveBps > maxMoveBps ? 'ENTRY_AGAINST_TREND' : null,
  });
}

/** The first blocker per side; null when neither set blocks it (or both are absent). */
export function mergeDecibelEntrySideBlockersV1(
  first: decibel_entry_side_blockers_v1 | null | undefined,
  second: decibel_entry_side_blockers_v1 | null | undefined,
): decibel_entry_side_blockers_v1 | null {
  if (!first && !second) return null;
  return Object.freeze({
    BUY: first?.BUY ?? second?.BUY ?? null,
    SELL: first?.SELL ?? second?.SELL ?? null,
  });
}
