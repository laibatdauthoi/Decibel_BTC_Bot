/**
 * The single source of every strategy parameter (2026-11-14 consolidation).
 *
 * Each value carries the reason it has this value. Modules keep their exported constant
 * names (DECIBEL_*_V1) as aliases of these fields, so behaviour and call sites are unchanged.
 * Volatility-scaled values are clamp(factor x 5-minute range, min, max) in bps.
 * The full strategy is described in docs/decibel_strategy_v1.md.
 */
export const DECIBEL_STRATEGY_POLICY_V1 = Object.freeze({
  market: Object.freeze({
    /** 5-minute midpoint range window and minimum history coverage. */
    rangeWindowMs: 300_000,
    rangeMinimumCoverage: 0.8,
    /** Clock-aligned candle used by every candle rule. */
    candleMs: 300_000,
    /** Venue 1-minute candles: request history, refresh interval and staleness limit. */
    venueCandleMs: 60_000,
    venueCandleLookbackMs: 30 * 60_000,
    venueCandleRefreshMs: 30_000,
    venueCandleMaxAgeMs: 150_000,
  }),
  entry: Object.freeze({
    /** Preferred entry = target x 3/20 (raised from 1/20 on 2026-11-13). */
    sizeTargetNumerator: 3,
    sizeTargetDenominator: 20,
    /** After a TP fill the next entry rests at least this far from the exit (anti-chase). */
    reentryDistance: Object.freeze({ factor: 0.5, minBps: 5, maxBps: 25 }),
    /** The re-entry distance only applies this long after the exit fill. 2026-11-14: an
     * unexpiring anchor kept a BUY 15 bps under the market for two hours; in the 05-14/11
     * backtest 5 minutes beat no expiry (and 10-60 minutes) in both halves. */
    reentryExpiryMs: 5 * 60_000,
    /** A resting entry is repriced only when the market moved more than this. */
    replacementBand: Object.freeze({ factor: 0.3, minBps: 3, maxBps: 15 }),
    /** No new entry or DCA while the 5-minute range is wider than this (bps). */
    volatilityPauseBps: 40,
  }),
  tp: Object.freeze({
    /** A new TP aims for this net profit after fees. */
    targetNet: Object.freeze({ factor: 0.25, minBps: 1.5, maxBps: 10 }),
    /** Any TP smaller than the position is replaced at the same price (2026-11-14). */
    coverageReplaceFraction: 1,
  }),
  adverse: Object.freeze({
    /** How far the price may run against the entry before adverse steps are considered;
     * max 40 -> 25 on 2026-11-14 (a break-even TP sat for an hour inside a 40 bps band). */
    safeBand: Object.freeze({ factor: 1.2, minBps: 10, maxBps: 25 }),
    /** Closed 5-minute candles outside the band (no return inside) before a step.
     * 2 -> 3 on 2026-11-14: better in both halves of the 05-14/11 backtest. */
    candleCloses: 3,
    /** A TP already at break-even may take the rescue step after this many closes. */
    breakEvenStaleCloses: 3,
    /** "Break-even" accepts this net loss (bps of notional): a recovery missed by ~1 bps. */
    breakEvenToleranceBps: 1,
    /** The rescue TP rests this far from the maker price. */
    rescueOffset: Object.freeze({ factor: 0.5, minBps: 5, maxBps: 20 }),
  }),
  dca: Object.freeze({
    /** Each addition needs the price this far against the current average entry (bps).
     * 25 -> 40 on 2026-11-14: better in both halves of the 05-14/11 backtest. */
    triggerBps: 40,
    maximumAdditions: 2,
    /** The smallest addition, as a fraction of the position (keeps TP replacement exact). */
    minimumAdditionFraction: 1 / 3,
  }),
  catastropheStop: Object.freeze({
    /** Trigger at 1.2 x Max Loss of the notional, clamped to 2-10% from the entry. */
    minimumDistance: 0.02,
    maximumDistance: 0.1,
    maxLossFactor: 1.2,
    /** Stop Limit's limit beyond the trigger, so a gap can still fill. */
    limitSlippage: 0.03,
    /** The trigger stays at least this far from the market. */
    marketBuffer: 0.01,
    /** A full-size SL closer than this to the entry is not the bot's. */
    ownedMinimumDistance: 0.01,
    retryIntervalMs: 30_000,
  }),
  gas: Object.freeze({
    /** New entries pause below this gas wallet balance (room for about five submissions). */
    entryReserveApt: 0.1,
    balanceRefreshMs: 60_000,
  }),
});
