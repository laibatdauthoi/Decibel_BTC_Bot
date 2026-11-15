import { DECIBEL_STRATEGY_POLICY_V1 } from './decibel_strategy_policy_v1.js';
/**
 * Volatility-scaled distances for take-profit and re-entry.
 *
 * Measure: midpoint range (max - min) over the last 5 minutes, in bps. On 2026-11-05..12
 * BTC/USD data the 5-minute range had p25 4.1, p50 10.0, p75 18.6 and p90 28.8 bps,
 * which matches the typical few-minute holding time of a position.
 *
 * - TP: extra net profit target above fees and reserves. Fast markets get a wider TP,
 *   quiet markets a tighter one, never below the floor.
 * - Re-entry: after a TP fills at price A, the next entry rests at A - x (BUY) or
 *   A + x (SELL). Journal data: re-entries within 5 bps of the TP exit averaged
 *   -1.2 to -4.8 bps net, re-entries 5+ bps away averaged +2.7 to +8 bps.
 * Without enough history the floors apply. Pure; no timers.
 */
export const DECIBEL_PRICE_RANGE_WINDOW_MS_V1 = DECIBEL_STRATEGY_POLICY_V1.market.rangeWindowMs;
export const DECIBEL_PRICE_RANGE_MIN_COVERAGE_V1 =
  DECIBEL_STRATEGY_POLICY_V1.market.rangeMinimumCoverage;
export const DECIBEL_TP_TARGET_NET_FACTOR_V1 = DECIBEL_STRATEGY_POLICY_V1.tp.targetNet.factor;
export const DECIBEL_TP_TARGET_NET_MIN_BPS_V1 = DECIBEL_STRATEGY_POLICY_V1.tp.targetNet.minBps;
export const DECIBEL_TP_TARGET_NET_MAX_BPS_V1 = DECIBEL_STRATEGY_POLICY_V1.tp.targetNet.maxBps;
export const DECIBEL_REENTRY_DISTANCE_FACTOR_V1 =
  DECIBEL_STRATEGY_POLICY_V1.entry.reentryDistance.factor;
export const DECIBEL_REENTRY_DISTANCE_MIN_BPS_V1 =
  DECIBEL_STRATEGY_POLICY_V1.entry.reentryDistance.minBps;
export const DECIBEL_REENTRY_DISTANCE_MAX_BPS_V1 =
  DECIBEL_STRATEGY_POLICY_V1.entry.reentryDistance.maxBps;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/** Midpoint range over the window, or null when history does not cover enough of it. */
export function calculateDecibelMidpointRangeBpsV1(
  history: readonly Readonly<{ at: number; midpoint: number }>[],
  now: number,
  windowMs = DECIBEL_PRICE_RANGE_WINDOW_MS_V1,
): number | null {
  const window = history.filter(
    (point) =>
      Number.isFinite(point.at) &&
      point.at <= now &&
      point.at >= now - windowMs &&
      Number.isFinite(point.midpoint) &&
      point.midpoint > 0,
  );
  if (window.length < 2) return null;
  const first = Math.min(...window.map((point) => point.at));
  if (now - first < windowMs * DECIBEL_PRICE_RANGE_MIN_COVERAGE_V1) return null;
  const high = Math.max(...window.map((point) => point.midpoint));
  const low = Math.min(...window.map((point) => point.midpoint));
  const last = window.reduce((latest, point) => (point.at >= latest.at ? point : latest));
  return ((high - low) / last.midpoint) * 10_000;
}

export function getDecibelTPTargetNetBpsV1(rangeBps: number | null | undefined): number {
  if (rangeBps === null || rangeBps === undefined || !Number.isFinite(rangeBps) || rangeBps < 0)
    return DECIBEL_TP_TARGET_NET_MIN_BPS_V1;
  return clamp(
    DECIBEL_TP_TARGET_NET_FACTOR_V1 * rangeBps,
    DECIBEL_TP_TARGET_NET_MIN_BPS_V1,
    DECIBEL_TP_TARGET_NET_MAX_BPS_V1,
  );
}

export function getDecibelReentryDistanceBpsV1(rangeBps: number | null | undefined): number {
  if (rangeBps === null || rangeBps === undefined || !Number.isFinite(rangeBps) || rangeBps < 0)
    return DECIBEL_REENTRY_DISTANCE_MIN_BPS_V1;
  return clamp(
    DECIBEL_REENTRY_DISTANCE_FACTOR_V1 * rangeBps,
    DECIBEL_REENTRY_DISTANCE_MIN_BPS_V1,
    DECIBEL_REENTRY_DISTANCE_MAX_BPS_V1,
  );
}

/**
 * Re-entry price limit after a TP fill at `exitPrice`: a BUY may rest at most at
 * exitPrice * (1 - x), a SELL at least at exitPrice * (1 + x), on the tick grid away
 * from the exit.
 */
export function getDecibelReentryPriceLimitV1(
  side: 'BUY' | 'SELL',
  exitPrice: number,
  distanceBps: number,
  tickSize: number,
): number {
  const raw = exitPrice * (1 + ((side === 'BUY' ? -1 : 1) * distanceBps) / 10_000);
  const ticks =
    side === 'BUY' ? Math.floor(raw / tickSize + 1e-9) : Math.ceil(raw / tickSize - 1e-9);
  return Number((ticks * tickSize).toPrecision(15));
}

/**
 * Entry replacement band: a resting entry is repriced toward the market only after the
 * price has moved more than this (bps), so entries stop chasing every small tick.
 * clamp(0.3 x 5-minute range, 3, 15) bps: about 3 bps in a typical market, ~9 bps when fast.
 */
export const DECIBEL_ENTRY_REPLACEMENT_BAND_FACTOR_V1 =
  DECIBEL_STRATEGY_POLICY_V1.entry.replacementBand.factor;
export const DECIBEL_ENTRY_REPLACEMENT_BAND_MIN_BPS_V1 =
  DECIBEL_STRATEGY_POLICY_V1.entry.replacementBand.minBps;
export const DECIBEL_ENTRY_REPLACEMENT_BAND_MAX_BPS_V1 =
  DECIBEL_STRATEGY_POLICY_V1.entry.replacementBand.maxBps;

export function getDecibelEntryReplacementBandBpsV1(rangeBps: number | null | undefined): number {
  if (rangeBps === null || rangeBps === undefined || !Number.isFinite(rangeBps) || rangeBps < 0)
    return DECIBEL_ENTRY_REPLACEMENT_BAND_MIN_BPS_V1;
  return clamp(
    DECIBEL_ENTRY_REPLACEMENT_BAND_FACTOR_V1 * rangeBps,
    DECIBEL_ENTRY_REPLACEMENT_BAND_MIN_BPS_V1,
    DECIBEL_ENTRY_REPLACEMENT_BAND_MAX_BPS_V1,
  );
}

/**
 * Rescue TP: after the break-even step, a later adverse step rests the TP only this offset
 * (bps) from the maker price, trading some PnL for a reachable exit: clamp(0.5 x range, 5, 20).
 * The Max Loss budget check still applies.
 */
export const DECIBEL_TP_RESCUE_OFFSET_FACTOR_V1 =
  DECIBEL_STRATEGY_POLICY_V1.adverse.rescueOffset.factor;
export const DECIBEL_TP_RESCUE_OFFSET_MIN_BPS_V1 =
  DECIBEL_STRATEGY_POLICY_V1.adverse.rescueOffset.minBps;
export const DECIBEL_TP_RESCUE_OFFSET_MAX_BPS_V1 =
  DECIBEL_STRATEGY_POLICY_V1.adverse.rescueOffset.maxBps;

export function getDecibelTPRescueOffsetBpsV1(rangeBps: number | null | undefined): number {
  if (rangeBps === null || rangeBps === undefined || !Number.isFinite(rangeBps) || rangeBps < 0)
    return DECIBEL_TP_RESCUE_OFFSET_MIN_BPS_V1;
  return clamp(
    DECIBEL_TP_RESCUE_OFFSET_FACTOR_V1 * rangeBps,
    DECIBEL_TP_RESCUE_OFFSET_MIN_BPS_V1,
    DECIBEL_TP_RESCUE_OFFSET_MAX_BPS_V1,
  );
}

/**
 * Candle rule for adverse TP steps (2026-11-13, operator request). The safe band is how far
 * the price may run against the entry before an adverse TP step is considered:
 * clamp(1.2 x 5-minute range, 10, 25) bps (narrower than the earlier rescue trigger). Once the
 * price is outside the band, a step needs two 5-minute candles (clock-aligned) to close with
 * the price never back inside the band since it left (or since the previous step). Any return
 * inside the band restarts the count.
 */
export const DECIBEL_TP_SAFE_BAND_FACTOR_V1 = DECIBEL_STRATEGY_POLICY_V1.adverse.safeBand.factor;
/** No new entry or DCA while the 5-minute midpoint range is wider than this (bps). */
export const DECIBEL_ENTRY_VOLATILITY_PAUSE_BPS_V1 =
  DECIBEL_STRATEGY_POLICY_V1.entry.volatilityPauseBps;

export function getDecibelEntryVolatilityPauseReasonV1(
  rangeBps: number | null | undefined,
): string | null {
  return typeof rangeBps === 'number' &&
    Number.isFinite(rangeBps) &&
    rangeBps > DECIBEL_ENTRY_VOLATILITY_PAUSE_BPS_V1
    ? 'ENTRY_VOLATILITY_PAUSE'
    : null;
}
export const DECIBEL_TP_SAFE_BAND_MIN_BPS_V1 = DECIBEL_STRATEGY_POLICY_V1.adverse.safeBand.minBps;
// 40 -> 25 (2026-11-14): with a 35 bps range the band hit 40 bps and a break-even TP sat
// for over an hour while the price chopped 20-40 bps against the entry.
export const DECIBEL_TP_SAFE_BAND_MAX_BPS_V1 = DECIBEL_STRATEGY_POLICY_V1.adverse.safeBand.maxBps;
export const DECIBEL_TP_ADVERSE_CANDLE_MS_V1 = DECIBEL_STRATEGY_POLICY_V1.market.candleMs;
export const DECIBEL_TP_ADVERSE_CANDLE_CLOSES_V1 = DECIBEL_STRATEGY_POLICY_V1.adverse.candleCloses;
/** A TP already at (or past) break-even may take the rescue step after this many closes
 * since the previous step, even if the price came back inside the band in between. */
// 6 -> 3 closes (about 15 minutes), operator decision 2026-11-14.
export const DECIBEL_TP_BREAK_EVEN_STALE_CLOSES_V1 =
  DECIBEL_STRATEGY_POLICY_V1.adverse.breakEvenStaleCloses;
/** "Break-even" accepts a net loss up to this many bps of the position notional, so a
 * near-miss recovery still fills (live 2026-11-14 00:20 missed by about 1 bps). */
export const DECIBEL_TP_BREAK_EVEN_TOLERANCE_BPS_V1 =
  DECIBEL_STRATEGY_POLICY_V1.adverse.breakEvenToleranceBps;

export function getDecibelTPSafeBandBpsV1(rangeBps: number | null | undefined): number {
  if (rangeBps === null || rangeBps === undefined || !Number.isFinite(rangeBps) || rangeBps < 0)
    return DECIBEL_TP_SAFE_BAND_MIN_BPS_V1;
  return clamp(
    DECIBEL_TP_SAFE_BAND_FACTOR_V1 * rangeBps,
    DECIBEL_TP_SAFE_BAND_MIN_BPS_V1,
    DECIBEL_TP_SAFE_BAND_MAX_BPS_V1,
  );
}

/**
 * Closed 5-minute candles since the price left the safe band without coming back (and since
 * `since`, the previous step). Samples are midpoints in time order; 0 when the latest sample
 * is inside the band or there are no samples.
 */
export function countDecibelAdverseCandleClosesV1(
  samples: readonly Readonly<{ at: number; midpoint: number }>[],
  now: number,
  isOutside: (midpoint: number) => boolean,
  since: number | null,
): number {
  let outsideSince: number | null = null;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index]!;
    if (sample.at > now) continue;
    if (!Number.isFinite(sample.midpoint) || !isOutside(sample.midpoint)) break;
    outsideSince = sample.at;
  }
  if (outsideSince === null) return 0;
  const reference = since === null ? outsideSince : Math.max(outsideSince, since);
  const candle = DECIBEL_TP_ADVERSE_CANDLE_MS_V1;
  return Math.max(0, Math.floor(now / candle) - Math.floor(reference / candle));
}

/**
 * The last `count` closed clock-aligned 5-minute candles from midpoint samples, oldest
 * first, or null when the history does not cover them (each needs two samples and the
 * history must start within a minute of the oldest candle's open).
 */
export function getDecibelClosedCandlesV1(
  samples: readonly Readonly<{ at: number; midpoint: number }>[],
  now: number,
  count: number,
): readonly Readonly<{ start: number; low: number; high: number }>[] | null {
  const candle = DECIBEL_TP_ADVERSE_CANDLE_MS_V1;
  const currentStart = Math.floor(now / candle) * candle;
  const first = samples[0];
  if (first === undefined || first.at > currentStart - count * candle + 60_000) return null;
  const candles: Array<Readonly<{ start: number; low: number; high: number }>> = [];
  for (let k = count; k >= 1; k -= 1) {
    const start = currentStart - k * candle;
    const prices = samples
      .filter((sample) => sample.at >= start && sample.at < start + candle)
      .map((sample) => sample.midpoint)
      .filter((midpoint) => Number.isFinite(midpoint) && midpoint > 0);
    if (prices.length < 2) return null;
    candles.push(
      Object.freeze({
        start,
        low: prices.reduce((a, b) => Math.min(a, b)),
        high: prices.reduce((a, b) => Math.max(a, b)),
      }),
    );
  }
  return Object.freeze(candles);
}

/**
 * Entry candle filter (2026-11-14, from 55 live trips: entries that faded the last closed
 * 5-minute candle averaged +0.2 bps, the others -8.2 bps with the three worst losses).
 * A new entry from flat must fade the last closed candle: a long only after it made a lower
 * low than the candle before, a short only after it made a higher high. Returns the reason
 * the side is refused, or null when it may enter.
 */
export function getDecibelEntryCandleBlockerV1(
  side: 'BUY' | 'SELL',
  candles: readonly Readonly<{ low: number; high: number }>[] | null,
): string | null {
  if (candles === null || candles.length < 2) return 'ENTRY_CANDLE_EVIDENCE_REQUIRED';
  const [previous, last] = [candles[0]!, candles[1]!];
  if (side === 'BUY') return last.low < previous.low ? null : 'ENTRY_REQUIRES_NEW_LOW';
  return last.high > previous.high ? null : 'ENTRY_REQUIRES_NEW_HIGH';
}

/**
 * Entry quote offset (2026-11-15): a flat entry rests at least clamp(factor x 5-minute range,
 * min, max) bps behind the touch, a volatility-scaled half-spread. Returns the BUY maximum and
 * SELL minimum price on the tick grid, or null when the offset is zero (quote at the touch).
 */
export function getDecibelEntryQuoteLimitsV1(
  bestBid: number,
  bestAsk: number,
  rangeBps: number | null | undefined,
  tickSize: number,
): Readonly<{ BUY: number; SELL: number }> | null {
  const scale = DECIBEL_STRATEGY_POLICY_V1.entry.quoteOffset;
  const offsetBps =
    rangeBps === null || rangeBps === undefined || !Number.isFinite(rangeBps) || rangeBps < 0
      ? scale.minBps
      : clamp(scale.factor * rangeBps, scale.minBps, scale.maxBps);
  if (!(offsetBps > 0) || !(bestBid > 0) || !(bestAsk > bestBid) || !(tickSize > 0)) return null;
  const buy = Math.floor((bestBid * (1 - offsetBps / 10_000)) / tickSize + 1e-9);
  const sell = Math.ceil((bestAsk * (1 + offsetBps / 10_000)) / tickSize - 1e-9);
  return Object.freeze({
    BUY: Number((buy * tickSize).toPrecision(15)),
    SELL: Number((sell * tickSize).toPrecision(15)),
  });
}
