import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_orchestrator_v1.js';

/**
 * Single DCA addition (re-added 2026-11-13 at the user's request).
 *
 * While a position is open, one maker (PostOnly) addition on the growth side is allowed when
 * the price is at least `DECIBEL_DCA_TRIGGER_BPS_V1` adverse to the authenticated entry basis.
 * The addition never raises a limit: it is capped by the preferred entry size and by the
 * session risk capacity left after the current position, and the risk engine still checks the
 * projected position. An addition smaller than a third of the position is refused, so after
 * a fill the existing TP covers at most 75% and is replaced at full size.
 */
export const DECIBEL_DCA_TRIGGER_BPS_V1 = 25;
/** A position worth less than this many preferred entries has not used its addition yet. */
export const DECIBEL_DCA_SINGLE_ENTRY_FACTOR_V1 = 1.5;
/** Smallest addition, as a fraction of the current position notional. */
export const DECIBEL_DCA_MINIMUM_ADDITION_FRACTION_V1 = 1 / 3;

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
  const positionNotionalUsd = Math.abs(positionBase) * entryBasis;
  if (positionNotionalUsd >= preferred * DECIBEL_DCA_SINGLE_ENTRY_FACTOR_V1)
    return result('DCA_ADDITION_ALREADY_USED', priceLimit);
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

/** The DCA assessment for a production snapshot (authenticated basis, fresh book, session). */
export function assessDecibelSnapshotDCAV1(
  snapshot: decibel_production_live_snapshot_v1,
): decibel_dca_assessment_v1 {
  const position = snapshot.input.actualInventoryBase;
  const positions =
    snapshot.authenticatedPositions?.filter((p) => p.market === 'BTC/USD' && p.size === position) ??
    [];
  const book = snapshot.input.book;
  return assessDecibelDCAV1({
    positionBase: position,
    entryBasis: positions.length === 1 ? positions[0]!.entryPrice : null,
    markPrice: (book.bestBid + book.bestAsk) / 2,
    preferredEntrySizeUsd: snapshot.sessionConfiguration?.preferredEntrySizeUsd,
    riskCapacityUsd: snapshot.sessionConfiguration?.exposureLimits?.riskCapacityUsd,
  });
}
