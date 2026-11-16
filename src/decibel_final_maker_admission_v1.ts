import { getDecibelReductionOrderLimitV1 } from './decibel_order_action_v1.js';
import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_types_v1.js';
import {
  evaluateTradingDecision,
  type trading_session_context_v1,
} from './decibel_trading_decision_v1.js';
import { calculateDecibelDynamicQuoteSizeV1 } from './decibel_dynamic_quote_size_v1.js';
import {
  execution_preflight_rejection_v1,
  type place_intent_v1,
  type validateDecibelPlaceIntentV1,
} from './decibel_execution_intent_v1.js';

/** Final maker gate shared by production dispatch and executor-path replays. */
export function validateDecibelFinalMakerAdmissionV1(
  fresh: decibel_production_live_snapshot_v1,
  intent: place_intent_v1,
  context: trading_session_context_v1,
  target: number,
): Parameters<typeof validateDecibelPlaceIntentV1>[1] {
  const decision = evaluateTradingDecision(fresh, { ...context, candidate: intent });
  if (
    decision.state !== 'TRADE' ||
    !(intent.side === 'BUY' ? decision.bidEligible : decision.askEligible)
  )
    throw new execution_preflight_rejection_v1(decision.primaryReason);
  // Shared directional sizing accounts for same-side pending exposure once.
  const size = calculateDecibelDynamicQuoteSizeV1({
    side: intent.side,
    price: intent.price,
    proposedSizeBtc: intent.quantity,
    reduceOnly: intent.reduceOnly,
    inventoryBase: fresh.input.actualInventoryBase,
    maximumAbsPositionBase:
      fresh.sessionConfiguration?.exposureLimits !== undefined
        ? fresh.sessionConfiguration.exposureLimits.effectivePositionLimitUsd /
          ((fresh.input.book.bestBid + fresh.input.book.bestAsk) / 2)
        : (fresh.maximumAbsPositionBase ??
          fresh.maximumNotionalUsd / ((fresh.input.book.bestBid + fresh.input.book.bestAsk) / 2)),
    availableMarginUsd: intent.reduceOnly
      ? (fresh.authenticatedAvailableMarginUsd ?? fresh.availableMarginUsd)
      : fresh.availableMarginUsd,
    maximumEffectiveLeverage: fresh.maximumEffectiveLeverage,
    maximumNotionalUsd: intent.reduceOnly
      ? getDecibelReductionOrderLimitV1(fresh, intent.price)
      : fresh.maximumNotionalUsd,
    minimumNotionalUsd: intent.reduceOnly ? 0 : fresh.minimumNotionalUsd,
    ...(intent.reduceOnly && fresh.reductionCapacity
      ? { venueMaximumOrderNotionalUsd: fresh.reductionCapacity.venueMaximumOrderNotionalUsd }
      : {}),
    minimumSize: fresh.input.metadata.minimumSize,
    lotSize: fresh.input.metadata.lotSize,
    openOrders: fresh.input.openOrders,
    remainingTargetUsd:
      target > 0 ? Math.max(0, target - (fresh.sessionConfiguration?.targetVolumeUsd ?? 0)) : null,
    // The planner sizes the last entry at the preferred size even when it exceeds the
    // remaining target; the final check must use the same rule. Live 2026-11-14 09:10-10:24:
    // without it every normal entry was rejected once the remainder fell below $16.50.
    ...(intent.reduceOnly || fresh.sessionConfiguration?.preferredEntrySizeUsd === undefined
      ? {}
      : { preferredEntrySizeUsd: fresh.sessionConfiguration.preferredEntrySizeUsd }),
  });
  if (size.finalSizeBtc + 1e-12 < intent.quantity)
    throw new execution_preflight_rejection_v1(
      `DYNAMIC_QUOTE_SIZE_CHANGED:${size.roundingReason}:${size.bindingConstraint}`,
    );
  const preflight: Parameters<typeof validateDecibelPlaceIntentV1>[1] = {
    tickSize: fresh.input.metadata.tickSize,
    lotSize: fresh.input.metadata.lotSize,
    minimumSize: fresh.input.metadata.minimumSize,
    minimumNotionalUsd: fresh.minimumNotionalUsd,
    maximumNotionalUsd: fresh.maximumNotionalUsd,
    maximumReductionQuantity: Math.abs(fresh.input.actualInventoryBase),
    currentPositionBase: fresh.input.actualInventoryBase,
    openOrders: fresh.input.openOrders,
    ...(fresh.maximumAbsPositionBase === undefined
      ? {}
      : {
          maximumAbsPositionBase:
            fresh.sessionConfiguration?.exposureLimits === undefined
              ? fresh.maximumAbsPositionBase
              : fresh.sessionConfiguration.exposureLimits.effectivePositionLimitUsd /
                ((fresh.input.book.bestBid + fresh.input.book.bestAsk) / 2),
        }),
    permittedSide: intent.side,
    bestBid: fresh.input.book.bestBid,
    bestAsk: fresh.input.book.bestAsk,
  };

  return preflight;
}
