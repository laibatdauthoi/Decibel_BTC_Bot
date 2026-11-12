import { z } from 'zod';
import type { decibel_market_regime_result_v1 } from './decibel_market_regime_v1.js';
import type { decibel_entry_priority_depth_v1 } from './decibel_smart_ladder_v1.js';

export const DecibelEntryOpportunitySchemaV1 = z
  .object({
    opportunityId: z.string().min(1),
    marketMidpoint: z.number().finite().positive(),
    observedAt: z.number().int().nonnegative(),
    sourceStateHash: z.string().min(1),
    regime: z.enum(['QUIET', 'NORMAL', 'FAST', 'ONE_SIDED', 'THIN']),
    spreadBps: z.number().finite().positive(),
    realizedVolatilityBps: z.number().finite().nonnegative(),
    volatilitySpreadMultiplier: z.number().finite().positive(),
    referencePrice: z.number().finite().positive(),
    plannedNotionalUsd: z.number().finite().positive(),
    depthObservedAt: z.number().int().nonnegative(),
    bidDepthBase: z.number().finite().nonnegative(),
    askDepthBase: z.number().finite().nonnegative(),
    significanceBps: z.number().finite().positive(),
  })
  .strict();
export type decibel_entry_opportunity_v1 = z.infer<typeof DecibelEntryOpportunitySchemaV1>;
export type decibel_entry_cycle_fill_v1 = Readonly<{
  fillId: string;
  intentId: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  timestamp: number;
  opportunity?: decibel_entry_opportunity_v1;
}>;

/** Event-sourced cycle state: intent evidence and authenticated fills are durable. */
export function deriveDecibelDCACycleV1(
  fills: readonly decibel_entry_cycle_fill_v1[],
  positionBase: number,
) {
  let inventory = 0;
  let groups = new Map<
    string,
    {
      quantity: number;
      notional: number;
      timestamp: number;
      opportunity: decibel_entry_opportunity_v1 | undefined;
    }
  >();
  const seen = new Set<string>();
  let lastKey: string | null = null;
  let blocker: string | null = null;
  const timestampSides = new Map<number, 'BUY' | 'SELL'>();
  let ambiguousSequence = false;
  for (const fill of fills) {
    if (seen.has(fill.fillId)) continue;
    seen.add(fill.fillId);
    if (
      ![fill.quantity, fill.price].every((v) => Number.isFinite(v) && v > 0) ||
      !Number.isSafeInteger(fill.timestamp) ||
      !fill.intentId
    ) {
      blocker = 'DCA_FILL_EVIDENCE_INVALID';
      break;
    }
    const previousSide = timestampSides.get(fill.timestamp);
    if (previousSide && previousSide !== fill.side) ambiguousSequence = true;
    timestampSides.set(fill.timestamp, fill.side);
    const delta = fill.side === 'BUY' ? fill.quantity : -fill.quantity;
    if (inventory === 0 || Math.sign(inventory) === Math.sign(delta)) {
      const key = fill.opportunity?.opportunityId ?? fill.intentId;
      const group = groups.get(key) ?? {
        quantity: 0,
        notional: 0,
        timestamp: 0,
        opportunity: fill.opportunity,
      };
      group.quantity += fill.quantity;
      group.notional += fill.quantity * fill.price;
      group.timestamp = Math.max(group.timestamp, fill.timestamp);
      groups.set(key, group);
      lastKey = key;
    }
    const previous = inventory;
    inventory = Number((inventory + delta).toFixed(8));
    if (inventory === 0) {
      groups = new Map();
      lastKey = null;
    } else if (previous !== 0 && Math.sign(previous) !== Math.sign(inventory)) {
      blocker = 'DCA_DIRECTION_REVERSAL_RECONCILIATION_REQUIRED';
      break;
    }
  }
  const reference = lastKey === null ? null : (groups.get(lastKey) ?? null);
  if (!Number.isFinite(positionBase) || Math.abs(inventory - positionBase) > 1e-8)
    blocker ??= 'DCA_FILL_HISTORY_RECONCILIATION_REQUIRED';
  if (ambiguousSequence && inventory !== 0) blocker ??= 'DCA_FILL_SEQUENCE_EVIDENCE_REQUIRED';
  if (groups.size >= 4) blocker ??= 'DCA_THREE_ADDITIONS_REACHED';
  return {
    increases: groups.size,
    additions: Math.max(0, groups.size - 1),
    reference,
    referencePrice: reference ? reference.notional / reference.quantity : null,
    blocker,
  };
}

/** Significance is the existing regime-adjusted volatility band or spread, whichever is larger.
 * Both executable sides must have verified depth for this exact order quantity.
 */
export function assessDecibelDCAOpportunityV1(
  input: Readonly<{
    positionBase: number;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    now: number;
    maximumAgeMs: number;
    bestBid: number;
    bestAsk: number;
    observedAt: number;
    sourceStateHash: string;
    depth?: decibel_entry_priority_depth_v1;
    regime?: decibel_market_regime_result_v1;
    distinctObservationCount: number;
    cycle: ReturnType<typeof deriveDecibelDCACycleV1>;
    persistedEvidence?: decibel_entry_opportunity_v1;
  }>,
) {
  const fail = (blocker: string) => ({ blocker, opportunity: null });
  if (
    ![input.quantity, input.price, input.maximumAgeMs].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    !Number.isFinite(input.positionBase) ||
    !Number.isSafeInteger(input.now)
  )
    return fail('DCA_ORDER_EVIDENCE_INVALID');
  // The initial ENTRY never depends on a DCA trigger.
  const initial = input.positionBase === 0;
  if (!initial && input.cycle.blocker && input.cycle.blocker !== 'DCA_THREE_ADDITIONS_REACHED')
    return fail(input.cycle.blocker);
  if (!initial && (input.cycle.increases === 0 || input.cycle.referencePrice === null))
    return fail('DCA_AUTHENTICATED_INITIAL_FILL_REQUIRED');
  if (!initial && (input.positionBase > 0 ? input.side !== 'BUY' : input.side !== 'SELL'))
    return fail('DCA_SAME_DIRECTION_REQUIRED');
  const midpoint = (input.bestBid + input.bestAsk) / 2;
  const fresh = (at: number) =>
    Number.isSafeInteger(at) && at <= input.now && input.now - at <= input.maximumAgeMs;
  const evidence = input.persistedEvidence;
  const continuation =
    !initial &&
    evidence &&
    input.cycle.reference?.opportunity?.opportunityId === evidence.opportunityId &&
    input.cycle.reference.notional + input.quantity * input.price <=
      evidence.plannedNotionalUsd + 1e-9;
  const regime = input.regime;
  const volatility = regime?.inputs.realizedVolatilityBps ?? evidence?.realizedVolatilityBps;
  const multiplier =
    regime?.policy.volatilitySpreadMultiplier ?? evidence?.volatilitySpreadMultiplier;
  const regimeName = regime?.regime ?? evidence?.regime;
  if (!fresh(input.observedAt) || !(input.bestAsk > input.bestBid && input.bestBid > 0))
    return fail('DCA_FRESH_MARKET_FRAME_REQUIRED');
  if (
    !regimeName ||
    volatility === undefined ||
    multiplier === undefined ||
    !Number.isFinite(volatility) ||
    volatility < 0 ||
    !Number.isFinite(multiplier) ||
    multiplier <= 0 ||
    (input.distinctObservationCount < 2 && !evidence) ||
    (evidence && !continuation && !fresh(evidence.observedAt))
  )
    return fail('DCA_VERIFIED_VOLATILITY_REGIME_REQUIRED');
  const depth = input.depth;
  if (
    !depth ||
    !fresh(depth.observedAt) ||
    depth.observedAt < input.observedAt ||
    depth.bids[0]?.price !== input.bestBid ||
    depth.asks[0]?.price !== input.bestAsk ||
    depth.bids.some((level, index) => index > 0 && level.price >= depth.bids[index - 1]!.price) ||
    depth.asks.some((level, index) => index > 0 && level.price <= depth.asks[index - 1]!.price) ||
    [...depth.bids, ...depth.asks].some(
      (level) =>
        !Number.isFinite(level.price) ||
        level.price <= 0 ||
        !Number.isFinite(level.size) ||
        level.size < 0,
    )
  )
    return fail('DCA_VERIFIED_CURRENT_DEPTH_REQUIRED');
  const spreadBps = ((input.bestAsk - input.bestBid) / midpoint) * 10000;
  const previousEvidence = input.cycle.reference?.opportunity;
  const bandBps = Math.max(
    spreadBps,
    volatility * multiplier,
    previousEvidence?.spreadBps ?? 0,
    previousEvidence
      ? previousEvidence.realizedVolatilityBps * previousEvidence.volatilitySpreadMultiplier
      : 0,
  );
  const depthWithinBand = (levels: decibel_entry_priority_depth_v1['bids']) =>
    levels
      .filter((level) => (Math.abs(level.price - midpoint) / midpoint) * 10000 <= bandBps)
      .reduce((sum, level) => sum + level.size, 0);
  if (Math.min(depthWithinBand(depth.bids), depthWithinBand(depth.asks)) + 1e-12 < input.quantity)
    return fail('DCA_VERIFIED_LIQUIDITY_INSUFFICIENT');
  const reference = input.cycle.referencePrice ?? input.price;
  if (continuation) return { blocker: null, opportunity: evidence };
  if (!initial && input.cycle.increases >= 4) return fail('DCA_THREE_ADDITIONS_REACHED');
  if (!initial) {
    const previous = input.cycle.reference!;
    if (input.observedAt <= Math.max(previous.timestamp, previous.opportunity?.observedAt ?? 0))
      return fail('DCA_NEW_MARKET_FRAME_REQUIRED');
    const anchor =
      input.positionBase > 0
        ? Math.min(reference, previous.opportunity?.marketMidpoint ?? reference)
        : Math.max(reference, previous.opportunity?.marketMidpoint ?? reference);
    const adverseBps =
      ((input.positionBase > 0 ? anchor - midpoint : midpoint - anchor) / anchor) * 10000;
    if (!(
      adverseBps >= bandBps &&
      (input.positionBase > 0 ? input.price < reference : input.price > reference)
    ))
      return fail('DCA_NEW_ADVERSE_OPPORTUNITY_REQUIRED');
  }
  const opportunity: decibel_entry_opportunity_v1 = {
    opportunityId: `${input.sourceStateHash}:${input.cycle.increases}:${input.side}:${midpoint}`,
    marketMidpoint: midpoint,
    observedAt: input.observedAt,
    sourceStateHash: input.sourceStateHash,
    regime: regimeName,
    spreadBps,
    realizedVolatilityBps: volatility,
    volatilitySpreadMultiplier: multiplier,
    referencePrice: reference,
    plannedNotionalUsd: input.quantity * input.price,
    depthObservedAt: depth.observedAt,
    bidDepthBase: depthWithinBand(depth.bids),
    askDepthBase: depthWithinBand(depth.asks),
    significanceBps: bandBps,
  };
  return { blocker: null, opportunity };
}
