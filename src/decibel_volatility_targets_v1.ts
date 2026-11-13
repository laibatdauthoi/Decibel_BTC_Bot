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
export const DECIBEL_PRICE_RANGE_WINDOW_MS_V1 = 300_000;
export const DECIBEL_PRICE_RANGE_MIN_COVERAGE_V1 = 0.8;
export const DECIBEL_TP_TARGET_NET_FACTOR_V1 = 0.25;
export const DECIBEL_TP_TARGET_NET_MIN_BPS_V1 = 1.5;
export const DECIBEL_TP_TARGET_NET_MAX_BPS_V1 = 10;
export const DECIBEL_REENTRY_DISTANCE_FACTOR_V1 = 0.5;
export const DECIBEL_REENTRY_DISTANCE_MIN_BPS_V1 = 5;
export const DECIBEL_REENTRY_DISTANCE_MAX_BPS_V1 = 25;

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
export const DECIBEL_ENTRY_REPLACEMENT_BAND_FACTOR_V1 = 0.3;
export const DECIBEL_ENTRY_REPLACEMENT_BAND_MIN_BPS_V1 = 3;
export const DECIBEL_ENTRY_REPLACEMENT_BAND_MAX_BPS_V1 = 15;

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
 * Rescue TP: once the maker price is at least the trigger (bps) adverse to the entry basis,
 * an adverse-exit TP rests only the offset (bps) away from the maker price instead of a whole
 * recovery corridor away, trading some PnL for a reachable exit. The Max Loss budget check
 * still applies. Trigger clamp(1.5 x range, 15, 50); offset clamp(0.5 x range, 5, 20).
 * After a rescue step the TP waits at least the cooldown before following again.
 *
 * Live 2026-11-13 (first version: trigger 1.0 x range >= 10, offset 0.25 x range >= 2, no
 * cooldown): in a fast 35 bps drop the TP followed the maker 3 times in 30 s and sold at the
 * low for -33 bps. The wider trigger/offset and the cooldown leave room for a bounce.
 */
export const DECIBEL_TP_RESCUE_TRIGGER_FACTOR_V1 = 1.5;
export const DECIBEL_TP_RESCUE_TRIGGER_MIN_BPS_V1 = 15;
export const DECIBEL_TP_RESCUE_TRIGGER_MAX_BPS_V1 = 50;
export const DECIBEL_TP_RESCUE_OFFSET_FACTOR_V1 = 0.5;
export const DECIBEL_TP_RESCUE_OFFSET_MIN_BPS_V1 = 5;
export const DECIBEL_TP_RESCUE_OFFSET_MAX_BPS_V1 = 20;
export const DECIBEL_TP_RESCUE_COOLDOWN_MS_V1 = 60_000;

export function getDecibelTPRescueTriggerBpsV1(rangeBps: number | null | undefined): number {
  if (rangeBps === null || rangeBps === undefined || !Number.isFinite(rangeBps) || rangeBps < 0)
    return DECIBEL_TP_RESCUE_TRIGGER_MIN_BPS_V1;
  return clamp(
    DECIBEL_TP_RESCUE_TRIGGER_FACTOR_V1 * rangeBps,
    DECIBEL_TP_RESCUE_TRIGGER_MIN_BPS_V1,
    DECIBEL_TP_RESCUE_TRIGGER_MAX_BPS_V1,
  );
}

export function getDecibelTPRescueOffsetBpsV1(rangeBps: number | null | undefined): number {
  if (rangeBps === null || rangeBps === undefined || !Number.isFinite(rangeBps) || rangeBps < 0)
    return DECIBEL_TP_RESCUE_OFFSET_MIN_BPS_V1;
  return clamp(
    DECIBEL_TP_RESCUE_OFFSET_FACTOR_V1 * rangeBps,
    DECIBEL_TP_RESCUE_OFFSET_MIN_BPS_V1,
    DECIBEL_TP_RESCUE_OFFSET_MAX_BPS_V1,
  );
}
