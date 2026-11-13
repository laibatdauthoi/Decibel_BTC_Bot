/**
 * Wide venue-side catastrophe stop (approved in AGENTS.md; venue behaviour verified by the
 * Stage D probe on 2026-11-13, docs/decibel_venue_capability_probe_plan_v1.md).
 *
 * Purpose: protect an open position while the bot is offline. It is NOT a per-position
 * stop-loss: the trigger sits beyond the session Max Loss, so while the bot runs the canonical
 * Max Loss unwind always acts first.
 *
 * Venue facts relied on (Stage D): a full-size position SL (`place_tp_sl_order_for_position`
 * without a size) rests next to a full-size reduce-only TP, follows the position size, appears
 * on the position as `sl_order_id` / `sl_trigger_price`, and is removed by the venue when the
 * position closes. At most one full-size SL exists per position, so a repeated placement
 * cannot duplicate it. It executes as a "Stop Limit"; the limit sits well beyond the trigger
 * so a gap through the trigger can still fill.
 */
export const DECIBEL_CATASTROPHE_STOP_MINIMUM_DISTANCE_V1 = 0.02;
export const DECIBEL_CATASTROPHE_STOP_MAXIMUM_DISTANCE_V1 = 0.1;
/** The trigger loss is this multiple of the session Max Loss. */
export const DECIBEL_CATASTROPHE_STOP_MAX_LOSS_FACTOR_V1 = 1.2;
/** Limit price beyond the trigger, as a fraction of the trigger. */
export const DECIBEL_CATASTROPHE_STOP_LIMIT_SLIPPAGE_V1 = 0.03;
/** The trigger must stay at least this far from the market on the adverse side. */
export const DECIBEL_CATASTROPHE_STOP_MARKET_BUFFER_V1 = 0.01;
/** A stop closer than this to the entry is not the bot's (no tight stop-losses). */
export const DECIBEL_CATASTROPHE_STOP_OWNED_MINIMUM_DISTANCE_V1 = 0.01;
/** Minimum time between two stop submissions; state is re-read from the venue in between. */
export const DECIBEL_CATASTROPHE_STOP_RETRY_INTERVAL_MS_V1 = 30_000;

export type decibel_catastrophe_stop_state_v1 = Readonly<{
  /** The position's full-size SL, from the authenticated position row. */
  venueOrderId: string;
  triggerPrice: number;
  limitPrice: number | null;
}>;

export type decibel_catastrophe_stop_plan_v1 = Readonly<{
  action: 'NONE' | 'PLACE';
  reason: string;
  /** Closing side of the stop: SELL for a long, BUY for a short. */
  side: 'BUY' | 'SELL' | null;
  triggerPrice: number | null;
  limitPrice: number | null;
}>;

const finitePositive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Whether a full-size SL has the catastrophe-stop shape for this position. */
export function isDecibelOwnedCatastropheStopV1(
  stop: Readonly<{ triggerPrice: number | null | undefined }>,
  positionBase: number,
  entryBasis: number | null | undefined,
): boolean {
  if (positionBase === 0 || !finitePositive(entryBasis) || !finitePositive(stop.triggerPrice))
    return false;
  const adverse =
    positionBase > 0
      ? (entryBasis - stop.triggerPrice) / entryBasis
      : (stop.triggerPrice - entryBasis) / entryBasis;
  return adverse >= DECIBEL_CATASTROPHE_STOP_OWNED_MINIMUM_DISTANCE_V1 - 1e-12;
}

export function planDecibelCatastropheStopV1(
  input: Readonly<{
    positionBase: number;
    entryBasis: number | null | undefined;
    markPrice: number;
    maxLossUsd: number | null | undefined;
    tickSize: number;
    existing: decibel_catastrophe_stop_state_v1 | null;
    /** Position TP/SL orders that are not the bot's full-size stop. */
    foreignTpSlCount: number;
  }>,
): decibel_catastrophe_stop_plan_v1 {
  const { positionBase, entryBasis, markPrice, tickSize } = input;
  const side = positionBase > 0 ? 'SELL' : positionBase < 0 ? 'BUY' : null;
  const none = (reason: string): decibel_catastrophe_stop_plan_v1 =>
    Object.freeze({ action: 'NONE', reason, side, triggerPrice: null, limitPrice: null });
  // Flat: the venue removes the stop with the position (Stage D, Q10).
  if (side === null) return none('CATASTROPHE_STOP_FLAT');
  if (input.foreignTpSlCount > 0) return none('CATASTROPHE_STOP_FOREIGN_TP_SL_PRESENT');
  if (input.existing !== null)
    return none(
      isDecibelOwnedCatastropheStopV1(input.existing, positionBase, entryBasis)
        ? 'CATASTROPHE_STOP_PRESENT'
        : 'CATASTROPHE_STOP_FOREIGN_TP_SL_PRESENT',
    );
  if (!finitePositive(entryBasis)) return none('CATASTROPHE_STOP_ENTRY_BASIS_REQUIRED');
  if (!finitePositive(markPrice)) return none('CATASTROPHE_STOP_MARK_PRICE_REQUIRED');
  if (!finitePositive(input.maxLossUsd)) return none('CATASTROPHE_STOP_MAX_LOSS_REQUIRED');
  if (!finitePositive(tickSize)) return none('CATASTROPHE_STOP_TICK_SIZE_REQUIRED');
  const notional = Math.abs(positionBase) * entryBasis;
  const distance = Math.min(
    DECIBEL_CATASTROPHE_STOP_MAXIMUM_DISTANCE_V1,
    Math.max(
      DECIBEL_CATASTROPHE_STOP_MINIMUM_DISTANCE_V1,
      (DECIBEL_CATASTROPHE_STOP_MAX_LOSS_FACTOR_V1 * input.maxLossUsd) / notional,
    ),
  );
  const buffer = DECIBEL_CATASTROPHE_STOP_MARKET_BUFFER_V1;
  // From the entry, but never closer than the buffer to the current market (a position
  // already deep in loss still gets a valid trigger on the adverse side of the mark).
  const rawTrigger =
    side === 'SELL'
      ? Math.min(entryBasis * (1 - distance), markPrice * (1 - buffer))
      : Math.max(entryBasis * (1 + distance), markPrice * (1 + buffer));
  const rawLimit =
    side === 'SELL'
      ? rawTrigger * (1 - DECIBEL_CATASTROPHE_STOP_LIMIT_SLIPPAGE_V1)
      : rawTrigger * (1 + DECIBEL_CATASTROPHE_STOP_LIMIT_SLIPPAGE_V1);
  const round = (price: number) =>
    Number(
      (
        (side === 'SELL'
          ? Math.floor(price / tickSize + 1e-9)
          : Math.ceil(price / tickSize - 1e-9)) * tickSize
      ).toPrecision(15),
    );
  const triggerPrice = round(rawTrigger);
  const limitPrice = round(rawLimit);
  if (!finitePositive(triggerPrice) || !finitePositive(limitPrice))
    return none('CATASTROPHE_STOP_PRICE_INVALID');
  return Object.freeze({
    action: 'PLACE',
    reason: 'CATASTROPHE_STOP_MISSING',
    side,
    triggerPrice,
    limitPrice,
  });
}

/**
 * Risk gate for a stop submission (the stop never opens or grows a position): the closing
 * side of an open position, a trigger on the adverse side of the market beyond the buffer,
 * and a limit beyond the trigger. Returns a blocker or null.
 */
export function validateDecibelCatastropheStopV1(
  plan: decibel_catastrophe_stop_plan_v1,
  positionBase: number,
  markPrice: number,
): string | null {
  if (plan.action !== 'PLACE' || plan.side === null) return 'CATASTROPHE_STOP_NOTHING_TO_PLACE';
  if (positionBase === 0 || positionBase > 0 !== (plan.side === 'SELL'))
    return 'CATASTROPHE_STOP_SIDE_MUST_CLOSE_POSITION';
  const { triggerPrice, limitPrice } = plan;
  if (!finitePositive(triggerPrice) || !finitePositive(limitPrice) || !finitePositive(markPrice))
    return 'CATASTROPHE_STOP_PRICE_INVALID';
  const buffer = DECIBEL_CATASTROPHE_STOP_MARKET_BUFFER_V1 - 1e-6;
  const valid =
    plan.side === 'SELL'
      ? triggerPrice <= markPrice * (1 - buffer) && limitPrice < triggerPrice
      : triggerPrice >= markPrice * (1 + buffer) && limitPrice > triggerPrice;
  return valid ? null : 'CATASTROPHE_STOP_TOO_CLOSE_OR_LIMIT_INVALID';
}
