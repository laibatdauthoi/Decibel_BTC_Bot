import { DECIBEL_STRATEGY_POLICY_V1 } from './decibel_strategy_policy_v1.js';
import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_orchestrator_v1.js';

/**
 * DCA additions (re-added 2026-11-13 at the user's request).
 *
 * While a position is open, up to `DECIBEL_DCA_MAXIMUM_ADDITIONS_V1` maker (PostOnly) additions
 * on the growth side are allowed, each when the price is at least `DECIBEL_DCA_TRIGGER_BPS_V1`
 * adverse to the current authenticated (average) entry basis. Additions are counted as filled
 * opening orders after the first one in the current position epoch.
 * The addition never raises a limit: it is capped by the preferred entry size and by the
 * session risk capacity left after the current position, and the risk engine still checks the
 * projected position. An addition smaller than a third of the position is refused, so after
 * a fill the existing TP covers at most 75% and is replaced at full size.
 */
export const DECIBEL_DCA_TRIGGER_BPS_V1 = DECIBEL_STRATEGY_POLICY_V1.dca.triggerBps;
export const DECIBEL_DCA_MAXIMUM_ADDITIONS_V1 = DECIBEL_STRATEGY_POLICY_V1.dca.maximumAdditions;
/** Smallest addition, as a fraction of the current position notional. */
export const DECIBEL_DCA_MINIMUM_ADDITION_FRACTION_V1 =
  DECIBEL_STRATEGY_POLICY_V1.dca.minimumAdditionFraction;

export type decibel_dca_assessment_v1 = Readonly<{
  allowed: boolean;
  reason: string;
  /** Growth side: BUY adds to a long, SELL to a short. Null when no position. */
  side: 'BUY' | 'SELL' | null;
  /** The addition rests at or beyond this price (BUY at or below, SELL at or above). */
  priceLimit: number | null;
  /** Largest addition notional (USD) the session may take. */
  maximumNotionalUsd: number;
}>;

const finitePositive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function assessDecibelDCAV1(
  input: Readonly<{
    positionBase: number;
    entryBasis: number | null | undefined;
    markPrice: number;
    preferredEntrySizeUsd: number | null | undefined;
    riskCapacityUsd: number | null | undefined;
    /** Distinct filled opening orders in the current position epoch; null if unproven. */
    openingOrderCount: number | null;
  }>,
): decibel_dca_assessment_v1 {
  const { positionBase, entryBasis, markPrice } = input;
  const side = positionBase > 0 ? 'BUY' : positionBase < 0 ? 'SELL' : null;
  const result = (
    reason: string,
    priceLimit: number | null = null,
    maximumNotionalUsd = 0,
  ): decibel_dca_assessment_v1 =>
    Object.freeze({
      allowed: reason === 'DCA_ADMITTED',
      reason,
      side,
      priceLimit,
      maximumNotionalUsd,
    });
  if (side === null || !Number.isFinite(positionBase)) return result('DCA_POSITION_REQUIRED');
  if (!finitePositive(entryBasis)) return result('DCA_ENTRY_BASIS_REQUIRED');
  if (!finitePositive(markPrice)) return result('DCA_MARK_PRICE_REQUIRED');
  const priceLimit =
    entryBasis * (1 + ((side === 'BUY' ? -1 : 1) * DECIBEL_DCA_TRIGGER_BPS_V1) / 10_000);
  const preferred = input.preferredEntrySizeUsd;
  if (!finitePositive(preferred)) return result('DCA_ENTRY_SIZE_REQUIRED', priceLimit);
  const openings = input.openingOrderCount;
  if (openings === null || !Number.isSafeInteger(openings) || openings < 1)
    return result('DCA_FILL_HISTORY_REQUIRED', priceLimit);
  if (openings - 1 >= DECIBEL_DCA_MAXIMUM_ADDITIONS_V1)
    return result('DCA_ADDITIONS_USED', priceLimit);
  const capacity = input.riskCapacityUsd;
  if (typeof capacity !== 'number' || !Number.isFinite(capacity) || capacity < 0)
    return result('DCA_RISK_CAPACITY_REQUIRED', priceLimit);
  const maximumNotionalUsd = Math.min(preferred, capacity - Math.abs(positionBase) * markPrice);
  if (
    maximumNotionalUsd <
    Math.abs(positionBase) * markPrice * DECIBEL_DCA_MINIMUM_ADDITION_FRACTION_V1
  )
    return result('DCA_RISK_CAPACITY_EXHAUSTED', priceLimit);
  return result('DCA_ADMITTED', priceLimit, maximumNotionalUsd);
}

/** Whether a growth-side price is far enough adverse for the admitted addition. */
export function isDecibelDCAPriceAdmittedV1(
  assessment: decibel_dca_assessment_v1,
  side: 'BUY' | 'SELL',
  price: number,
): boolean {
  return (
    assessment.allowed &&
    assessment.side === side &&
    assessment.priceLimit !== null &&
    Number.isFinite(price) &&
    (side === 'BUY' ? price <= assessment.priceLimit : price >= assessment.priceLimit)
  );
}

/**
 * Distinct venue orders whose fills opened or grew the current position epoch (reset at flat
 * or a flip). Null when the authenticated fill ledger does not reconcile with the position.
 */
export function countDecibelOpeningOrdersV1(
  snapshot: decibel_production_live_snapshot_v1,
): number | null {
  const ledger = snapshot.input.actualFillLedger;
  const position = snapshot.input.actualInventoryBase;
  if (position === 0 || ledger.inventoryBase !== position) return null;
  let inventory = 0;
  let orders = new Set<string>();
  for (const app of ledger.applications) {
    if (app.inventoryBefore !== inventory) return null;
    const after = app.inventoryAfter;
    const flipped = inventory !== 0 && after !== 0 && Math.sign(after) !== Math.sign(inventory);
    if (after === 0 || flipped || inventory === 0) orders = new Set();
    if (after !== 0 && (inventory === 0 || flipped || Math.abs(after) > Math.abs(inventory)))
      orders.add(app.venueOrderId);
    inventory = after;
  }
  return inventory === position && orders.size > 0 ? orders.size : null;
}

/**
 * Momentum gate (operator request 2026-11-14): an addition waits until the last closed
 * 5-minute candle no longer extends the move against the position. Adding to a long needs
 * its low at or above the previous candle's low; adding to a short needs its high at or
 * below the previous candle's high. Null without enough candle history.
 */
export function isDecibelDCAMomentumSettledV1(
  side: 'BUY' | 'SELL',
  candles: readonly Readonly<{ low: number; high: number }>[] | null,
): boolean | null {
  if (candles === null || candles.length < 2) return null;
  const previous = candles[candles.length - 2]!;
  const last = candles[candles.length - 1]!;
  return side === 'BUY' ? last.low >= previous.low : last.high <= previous.high;
}

/** The DCA assessment for a production snapshot (authenticated basis, fresh book, session). */
export function assessDecibelSnapshotDCAV1(
  snapshot: decibel_production_live_snapshot_v1,
): decibel_dca_assessment_v1 {
  const position = snapshot.input.actualInventoryBase;
  const positions =
    snapshot.authenticatedPositions?.filter((p) => p.market === 'BTC/USD' && p.size === position) ??
    [];
  const book = snapshot.input.book;
  const base = assessDecibelDCAV1({
    positionBase: position,
    entryBasis: positions.length === 1 ? positions[0]!.entryPrice : null,
    markPrice: (book.bestBid + book.bestAsk) / 2,
    preferredEntrySizeUsd: snapshot.sessionConfiguration?.preferredEntrySizeUsd,
    riskCapacityUsd: snapshot.sessionConfiguration?.exposureLimits?.riskCapacityUsd,
    openingOrderCount: countDecibelOpeningOrdersV1(snapshot),
  });
  if (!base.allowed || base.side === null) return base;
  const settled = isDecibelDCAMomentumSettledV1(
    base.side,
    snapshot.marketStructure?.closedCandles ?? null,
  );
  if (settled === true) return base;
  return Object.freeze({
    ...base,
    allowed: false,
    reason:
      settled === null
        ? 'DCA_CANDLE_EVIDENCE_REQUIRED'
        : base.side === 'BUY'
          ? 'DCA_PRICE_STILL_MAKING_NEW_LOWS'
          : 'DCA_PRICE_STILL_MAKING_NEW_HIGHS',
    maximumNotionalUsd: 0,
  });
}
