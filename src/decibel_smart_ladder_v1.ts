export const DECIBEL_SMART_LADDER_V1 = 'DECIBEL_SMART_LADDER_V1' as const;
export const DECIBEL_PRODUCTION_NEUTRAL_INVENTORY_BAND_USD_V1 = 2.5 as const;
// Quote-admission filter, not a hard loss limit or an OPEN cancellation threshold.
export const DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1 = 11.25 as const;
export const DECIBEL_PRODUCTION_LIFECYCLE_COST_HYSTERESIS_BPS_V1 = 0.215 as const;
export const DECIBEL_PRODUCTION_LIFECYCLE_COST_ENTRY_BPS_V1 =
  DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1 -
  DECIBEL_PRODUCTION_LIFECYCLE_COST_HYSTERESIS_BPS_V1;
export const DECIBEL_PRODUCTION_CANDIDATE_DISTANCE_BPS_V1 = Object.freeze([5, 6, 7, 8, 9, 10, 12]);

export type decibel_lifecycle_cost_admission_reason_v1 =
  | 'ECONOMIC_INPUT_UNKNOWN'
  | 'LIFECYCLE_COST_BUDGET_EXCEEDED'
  | 'LIFECYCLE_COST_ENTRY_THRESHOLD_NOT_MET'
  | 'VOLUME_COST_BUDGET_ELIGIBLE';

export function evaluateDecibelLifecycleCostAdmissionV1(
  lifecycleCostBps: number | null,
  hasRestingOrder: boolean,
): decibel_lifecycle_cost_admission_reason_v1 {
  if (lifecycleCostBps === null || !Number.isFinite(lifecycleCostBps))
    return 'ECONOMIC_INPUT_UNKNOWN';
  if (lifecycleCostBps > DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1)
    return 'LIFECYCLE_COST_BUDGET_EXCEEDED';
  const threshold = hasRestingOrder
    ? DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1
    : DECIBEL_PRODUCTION_LIFECYCLE_COST_ENTRY_BPS_V1;
  return lifecycleCostBps > threshold
    ? 'LIFECYCLE_COST_ENTRY_THRESHOLD_NOT_MET'
    : 'VOLUME_COST_BUDGET_ELIGIBLE';
}

export type decibel_smart_ladder_level_v1 = Readonly<{
  levelId: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  notionalUsd: number;
  rawBudgetUsd: number;
  skewStatus: 'NEUTRAL' | 'INVENTORY_INCREASING_SIDE_REDUCED' | 'INVENTORY_REDUCING_SIDE';
}>;

export type decibel_smart_ladder_configuration_v1 = Readonly<{
  maximumLevelsPerSide: number;
  maximumAggregateCollateralFraction: number;
  levelAllocations: readonly number[];
  baseHalfSpreadBps: number;
  bidHalfSpreadBps?: number;
  askHalfSpreadBps?: number;
  volatilitySpreadMultiplier: number;
  maximumVolatilitySpreadMultiplier: number;
  minimumTierOneNotionalUsd?: number;
}>;

function roundDown(value: number, increment: number): number {
  return Number((Math.floor((value + Number.EPSILON) / increment) * increment).toFixed(12));
}

function roundUp(value: number, increment: number): number {
  return Number((Math.ceil((value - Number.EPSILON) / increment) * increment).toFixed(12));
}

/** Price construction is independent of the budget that funds an order. */
export function calculateDecibelLadderPriceV1(
  input: Readonly<{
    side: 'BUY' | 'SELL';
    bestBid: number;
    bestAsk: number;
    tickSize: number;
    fairPrice: number;
    pressure: number;
    maximumInventoryPriceSkewBps: number;
    halfSpreadBps: number;
    spreadMultiplier: number;
    level: number;
  }>,
): number {
  const increasingPressure =
    input.side === 'BUY' ? Math.max(0, input.pressure) : Math.max(0, -input.pressure);
  const offsetBps =
    input.halfSpreadBps * input.spreadMultiplier * input.level * (1 + increasingPressure);
  const reservationPrice =
    input.fairPrice * (1 - (input.pressure * input.maximumInventoryPriceSkewBps) / 10_000);
  const rawPrice = reservationPrice * (1 + ((input.side === 'BUY' ? -1 : 1) * offsetBps) / 10_000);
  return input.side === 'BUY'
    ? roundDown(Math.min(rawPrice, input.bestBid), input.tickSize)
    : roundUp(Math.max(rawPrice, input.bestAsk), input.tickSize);
}

export function buildDecibelSmartLadderV1(
  input: Readonly<{
    bestBid: number;
    bestAsk: number;
    tickSize: number;
    lotSize: number;
    minimumSize: number;
    inventoryBase: number;
    maximumAbsPositionBase: number;
    availableCollateralUsd: number;
    maximumEffectiveLeverage: number;
    maximumNotionalUsd: number;
    /** Authenticated dynamic entry budget; absent retains legacy admission semantics. */
    entryHeadroomUsd?: number;
    fairPrice?: number;
    maximumInventoryPriceSkewBps?: number;
    configuration: decibel_smart_ladder_configuration_v1;
  }>,
): Readonly<{
  levels: readonly decibel_smart_ladder_level_v1[];
  aggregateNotionalUsd: number;
  maximumAggregateNotionalUsd: number;
}> {
  const config = input.configuration;
  if (
    !(input.bestBid > 0) ||
    !(input.bestAsk > input.bestBid) ||
    !(input.tickSize > 0) ||
    !(input.lotSize > 0) ||
    !(input.minimumSize > 0) ||
    !(input.maximumAbsPositionBase > 0) ||
    (input.entryHeadroomUsd !== undefined &&
      (!Number.isFinite(input.entryHeadroomUsd) || input.entryHeadroomUsd < 0)) ||
    !(input.availableCollateralUsd >= 0) ||
    !(input.maximumEffectiveLeverage >= 1) ||
    !Number.isSafeInteger(config.maximumLevelsPerSide) ||
    config.maximumLevelsPerSide < 1 ||
    config.maximumLevelsPerSide > 3 ||
    config.levelAllocations.length < config.maximumLevelsPerSide ||
    config.levelAllocations.some((allocation) => !Number.isFinite(allocation) || allocation <= 0) ||
    config.maximumAggregateCollateralFraction <= 0 ||
    config.maximumAggregateCollateralFraction > 0.5 ||
    (config.minimumTierOneNotionalUsd !== undefined &&
      (!Number.isFinite(config.minimumTierOneNotionalUsd) || config.minimumTierOneNotionalUsd <= 0))
  )
    throw new Error('DECIBEL_SMART_LADDER_CONFIGURATION_INVALID');
  const midpoint = (input.bestBid + input.bestAsk) / 2;
  const fairPrice = input.fairPrice ?? midpoint;
  const positionNotionalLimit = input.maximumAbsPositionBase * midpoint;
  const maximumAggregateNotionalUsd = Math.max(
    0,
    Math.min(
      input.maximumNotionalUsd,
      positionNotionalLimit,
      input.entryHeadroomUsd !== undefined
        ? positionNotionalLimit // The verified dynamic limit already applies the collateral allocation.
        : input.availableCollateralUsd *
            input.maximumEffectiveLeverage *
            config.maximumAggregateCollateralFraction,
    ),
  );
  const allocations = config.levelAllocations.slice(0, config.maximumLevelsPerSide);
  const allocationTotal = allocations.reduce((sum, allocation) => sum + allocation, 0);
  const pressure = Math.max(-1, Math.min(1, input.inventoryBase / input.maximumAbsPositionBase));
  const spreadMultiplier = Math.max(
    1,
    Math.min(config.maximumVolatilitySpreadMultiplier, config.volatilitySpreadMultiplier),
  );
  const levels: decibel_smart_ladder_level_v1[] = [];
  const getSideBudget = (side: 'BUY' | 'SELL'): number => {
    const reducing = side === 'BUY' ? pressure < 0 : pressure > 0;
    const unconstrainedSideBudget =
      (maximumAggregateNotionalUsd * (side === 'BUY' ? 1 - pressure : 1 + pressure)) / 2;
    const exposureIncreasing =
      (side === 'BUY' && input.inventoryBase > 0) || (side === 'SELL' && input.inventoryBase < 0);
    const inventoryOutsideNeutralBand =
      Math.abs(input.inventoryBase) * midpoint + Number.EPSILON >=
      DECIBEL_PRODUCTION_NEUTRAL_INVENTORY_BAND_USD_V1;
    const remainingAdmissionNotional = Math.max(
      0,
      DECIBEL_PRODUCTION_NEUTRAL_INVENTORY_BAND_USD_V1 - Math.abs(input.inventoryBase) * midpoint,
    );
    const minimumAdmissibleNotional =
      (config.minimumTierOneNotionalUsd ?? 0) +
      (config.minimumTierOneNotionalUsd === undefined
        ? 0
        : input.lotSize * Math.max(input.bestAsk, fairPrice));
    const minimumNormalQuoteNotional = config.minimumTierOneNotionalUsd ?? 0;
    const reducingInsideNeutralBand =
      reducing && !inventoryOutsideNeutralBand && Math.abs(input.inventoryBase) > Number.EPSILON;
    return exposureIncreasing && input.entryHeadroomUsd !== undefined
      ? Math.min(
          Math.max(unconstrainedSideBudget, minimumAdmissibleNotional),
          Math.max(0, input.entryHeadroomUsd),
        )
      : exposureIncreasing
        ? inventoryOutsideNeutralBand
          ? 0
          : Math.min(
              unconstrainedSideBudget,
              Math.max(remainingAdmissionNotional, minimumAdmissibleNotional),
            )
        : reducingInsideNeutralBand &&
            minimumNormalQuoteNotional >= DECIBEL_PRODUCTION_NEUTRAL_INVENTORY_BAND_USD_V1
          ? Math.min(unconstrainedSideBudget, minimumAdmissibleNotional)
          : unconstrainedSideBudget;
  };
  for (const side of ['BUY', 'SELL'] as const) {
    const reducing = side === 'BUY' ? pressure < 0 : pressure > 0;
    const increasingPressure = side === 'BUY' ? Math.max(0, pressure) : Math.max(0, -pressure);
    const exposureIncreasing =
      (side === 'BUY' && input.inventoryBase > 0) || (side === 'SELL' && input.inventoryBase < 0);
    // The tier-one minimum cannot borrow the reducing side's reservation.
    // Honor the existing aggregate cap before rounding/generating levels.
    const sideBudget = exposureIncreasing
      ? Math.min(
          getSideBudget(side),
          Math.max(0, maximumAggregateNotionalUsd - getSideBudget(side === 'BUY' ? 'SELL' : 'BUY')),
        )
      : getSideBudget(side);
    const sizeMultiplier = 1 - increasingPressure;
    let committedSideNotionalUsd = 0;
    for (let index = 0; index < config.maximumLevelsPerSide; index += 1) {
      const allocation = allocations[index]! / allocationTotal;
      const allocatedNotional = sideBudget * allocation * sizeMultiplier;
      const rawNotional =
        index === 0
          ? Math.max(allocatedNotional, config.minimumTierOneNotionalUsd ?? 0)
          : allocatedNotional;
      if (committedSideNotionalUsd + rawNotional > sideBudget + Number.EPSILON) {
        if (index === 0) break;
        continue;
      }
      const sideHalfSpreadBps =
        side === 'BUY'
          ? (config.bidHalfSpreadBps ?? config.baseHalfSpreadBps)
          : (config.askHalfSpreadBps ?? config.baseHalfSpreadBps);
      const price = calculateDecibelLadderPriceV1({
        side,
        bestBid: input.bestBid,
        bestAsk: input.bestAsk,
        tickSize: input.tickSize,
        fairPrice,
        pressure,
        maximumInventoryPriceSkewBps: input.maximumInventoryPriceSkewBps ?? 2,
        halfSpreadBps: sideHalfSpreadBps,
        spreadMultiplier,
        level: index + 1,
      });
      const roundedDownQuantity = roundDown(rawNotional / price, input.lotSize);
      const quantity =
        index === 0 &&
        config.minimumTierOneNotionalUsd !== undefined &&
        roundedDownQuantity * price + Number.EPSILON < config.minimumTierOneNotionalUsd
          ? roundUp(config.minimumTierOneNotionalUsd / price, input.lotSize)
          : roundedDownQuantity;
      if (quantity + Number.EPSILON < input.minimumSize) continue;
      const notionalUsd = price * quantity;
      if (committedSideNotionalUsd + notionalUsd > sideBudget + Number.EPSILON) {
        if (index === 0) break;
        continue;
      }
      if (index === 0 && notionalUsd + Number.EPSILON < (config.minimumTierOneNotionalUsd ?? 0))
        break;
      committedSideNotionalUsd += notionalUsd;
      levels.push(
        Object.freeze({
          levelId: `${side}-${index + 1}`,
          side,
          price,
          quantity,
          notionalUsd,
          rawBudgetUsd: rawNotional,
          skewStatus:
            increasingPressure > 0
              ? 'INVENTORY_INCREASING_SIDE_REDUCED'
              : reducing
                ? 'INVENTORY_REDUCING_SIDE'
                : 'NEUTRAL',
        }),
      );
    }
  }
  const aggregateNotionalUsd = levels.reduce((sum, level) => sum + level.notionalUsd, 0);
  if (aggregateNotionalUsd > maximumAggregateNotionalUsd + input.tickSize * input.minimumSize)
    throw new Error('DECIBEL_SMART_LADDER_COMMITMENT_EXCEEDED');
  return Object.freeze({
    levels: Object.freeze(levels),
    aggregateNotionalUsd,
    maximumAggregateNotionalUsd,
  });
}

/** Candidate admission cost in bps: one maker fee plus two transaction reserves.
 * Gas is USD per transaction; this is not the session Max Loss USD budget. */
export function calculateDecibelLifecycleCostBpsV1(
  input: Readonly<{
    notionalUsd: number;
    makerFeeBps: number | null;
    gasCostUsd: number | null;
    adverseSelectionBps: number | null;
    safetyMarginBps: number;
  }>,
): number | null {
  if (
    !(input.notionalUsd > 0) ||
    !Number.isFinite(input.notionalUsd) ||
    input.makerFeeBps === null ||
    input.gasCostUsd === null ||
    input.adverseSelectionBps === null ||
    ![input.makerFeeBps, input.gasCostUsd, input.adverseSelectionBps, input.safetyMarginBps].every(
      Number.isFinite,
    )
  )
    return null;
  return (
    input.makerFeeBps +
    (2 * input.gasCostUsd * 10000) / input.notionalUsd +
    input.adverseSelectionBps +
    input.safetyMarginBps
  );
}

/** One quote, one market observation and explicit transaction phase. This is
 * conditional-on-fill economics, never an estimate of time-based expected value. */
export function assessDecibelEntryPhaseEconomicsV1(
  input: Readonly<{
    phase: 'PLACE' | 'RESTING';
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    midpoint: number;
    makerFeeBps: number | null;
    gasCostUsd: number | null;
    safetyMarginBps: number;
  }>,
) {
  const notionalUsd = input.price * input.quantity;
  const reserveCount = input.phase === 'PLACE' ? 2 : 1;
  const costBps = calculateDecibelLifecycleCostBpsV1({
    notionalUsd,
    makerFeeBps: input.makerFeeBps,
    gasCostUsd: input.gasCostUsd === null ? null : (input.gasCostUsd * reserveCount) / 2,
    adverseSelectionBps: 0,
    safetyMarginBps: input.safetyMarginBps,
  });
  const known =
    costBps !== null && Number.isFinite(input.midpoint) && input.midpoint > 0 && input.quantity > 0;
  const grossEdgeUsd =
    input.quantity *
    (input.side === 'BUY' ? input.midpoint - input.price : input.price - input.midpoint);
  const costUsd = known ? (notionalUsd * costBps) / 10000 : null;
  const conditionalNetUsd = known ? grossEdgeUsd - costUsd! : null;
  return Object.freeze({
    notionalUsd,
    costBps,
    costUsd,
    requiredEdgeBps: known ? (costUsd! / (input.quantity * input.midpoint)) * 10000 : null,
    conditionalNetUsd,
    admissionReason:
      input.phase !== 'PLACE'
        ? null
        : !known
          ? 'ENTRY_ADMISSION_EVIDENCE_REQUIRED'
          : conditionalNetUsd! < 0
            ? 'ENTRY_ADMISSION_EXECUTION_COST_NOT_COVERED'
            : 'ENTRY_ADMISSION_EXECUTION_COST_COVERED',
    transactionReserveCount: reserveCount,
    fillProbability: null,
    expectedValueUsd: null,
    // Execution-cost surplus is not calibrated expected profit after adverse selection.
    adverseSelectionApplied: false,
  });
}

/** Conditional economics of the authenticated residual, not of a replacement.
 * Placement gas is sunk; the maker fee and one transaction reserve remain avoidable.
 * No calibrated fill probability is available: no queue/fill-rate credit is used. */
export function assessDecibelRestingEntryEconomicsV1(
  input: Readonly<{
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    midpoint: number;
    makerFeeBps: number | null;
    gasCostUsd: number | null;
    safetyMarginBps: number;
  }>,
) {
  // The admission safety margin is a quote-selection buffer, not an avoidable
  // fee. Midpoint payoff is a diagnostic, not a realized loss or a forecast of
  // the eventual TP. Its sign alone does not authorize canceling an OPEN maker.
  const phase = assessDecibelEntryPhaseEconomicsV1({
    ...input,
    phase: 'RESTING',
    safetyMarginBps: 0,
  });
  const { notionalUsd } = phase;
  const remainingCostBps = phase.costBps;
  const edgeBps =
    ((input.side === 'BUY' ? input.midpoint - input.price : input.price - input.midpoint) /
      input.midpoint) *
    10000;
  const known = remainingCostBps !== null && Number.isFinite(edgeBps) && input.midpoint > 0;
  const conditionalNetUsd = phase.conditionalNetUsd;
  const reason = !known
    ? 'RESTING_ENTRY_ECONOMIC_EVIDENCE_REQUIRED'
    : conditionalNetUsd! < 0
      ? 'RESTING_ENTRY_MARK_EDGE_NEGATIVE_NO_INDEPENDENT_INVALIDATION'
      : 'RESTING_ENTRY_FUTURE_ECONOMICS_VALID';
  return Object.freeze({
    decision: !known ? ('RECONCILE' as const) : ('KEEP' as const),
    reason,
    notionalUsd,
    remainingCostBps,
    adverseSelectionApplied: false,
    expectedValueUsd: null,
    edgeBps,
    placementGasSunkUsd: input.gasCostUsd,
    remainingTransactionGasReserveUsd: input.gasCostUsd,
    cancelGasEstimateUsd: input.gasCostUsd,
    fillProbability: null,
    conditionalNetUsd,
  });
}

/** Closest maker price satisfying the existing execution-cost admission equation.
 * This is algebra over observed costs, not a fill/return model. */
export function calculateDecibelClosestEntryPriceV1(
  input: Readonly<{
    side: 'BUY' | 'SELL';
    quantity: number;
    midpoint: number;
    bestBid: number;
    bestAsk: number;
    tickSize: number;
    makerFeeBps: number | null;
    gasCostUsd: number | null;
    safetyMarginBps: number;
  }>,
): number | null {
  if (
    ![input.quantity, input.midpoint, input.bestBid, input.bestAsk, input.tickSize].every(
      (v) => Number.isFinite(v) && v > 0,
    ) ||
    input.bestAsk <= input.bestBid ||
    ![input.makerFeeBps, input.gasCostUsd, input.safetyMarginBps].every(
      (v) => v !== null && Number.isFinite(v) && v >= 0,
    )
  )
    return null;
  const rate = (input.makerFeeBps! + input.safetyMarginBps) / 10000;
  if (rate >= 1) return null;
  const gasPerBTC = (2 * input.gasCostUsd!) / input.quantity;
  const boundary =
    input.side === 'BUY'
      ? Math.min(input.bestBid, (input.midpoint - gasPerBTC) / (1 + rate))
      : Math.max(input.bestAsk, (input.midpoint + gasPerBTC) / (1 - rate));
  const price =
    input.side === 'BUY' ? roundDown(boundary, input.tickSize) : roundUp(boundary, input.tickSize);
  return price > 0 && Number.isFinite(price) ? price : null;
}

export type decibel_entry_priority_depth_v1 = Readonly<{
  observedAt: number;
  bids: readonly Readonly<{ price: number; size: number }>[];
  asks: readonly Readonly<{ price: number; size: number }>[];
}>;

/** Compare observable maker price priority on the common residual. Admission
 * remains separate; price priority is never reported as expected PnL. Cancel
 * authorization still requires fresh account evidence and the live risk gate. */
export function assessDecibelEntryReplacementEconomicsV1(
  input: Readonly<{
    side: 'BUY' | 'SELL';
    restingPrice: number;
    candidatePrice: number;
    restingQuantity: number;
    candidateQuantity: number;
    midpoint: number;
    makerFeeBps: number | null;
    gasCostUsd: number | null;
    safetyMarginBps: number;
    bestBid?: number;
    bestAsk?: number;
    tickSize?: number;
    depth?: decibel_entry_priority_depth_v1;
    bookObservedAt?: number;
    now?: number;
    maximumBookAgeMs?: number;
    observedPriceMovementBps?: number;
    /** Volatility floor of the stability band (bps): no repricing for smaller moves. */
    minimumStabilityBps?: number;
  }>,
) {
  const comparable = [
    input.restingPrice,
    input.candidatePrice,
    input.restingQuantity,
    input.candidateQuantity,
    input.midpoint,
  ].every((v) => Number.isFinite(v) && v > 0);
  const executableQuantity = comparable
    ? Math.min(input.restingQuantity, input.candidateQuantity)
    : null;
  const resting = assessDecibelEntryPhaseEconomicsV1({
    ...input,
    phase: 'RESTING',
    price: input.restingPrice,
    quantity: executableQuantity ?? 0,
  });
  const candidate = assessDecibelEntryPhaseEconomicsV1({
    ...input,
    phase: 'RESTING',
    price: input.candidatePrice,
    quantity: executableQuantity ?? 0,
  });
  const replacementCostUsd =
    input.gasCostUsd !== null && Number.isFinite(input.gasCostUsd) && input.gasCostUsd >= 0
      ? 2 * input.gasCostUsd
      : null;
  const conditionalNetImprovementUsd =
    comparable &&
    candidate.conditionalNetUsd !== null &&
    resting.conditionalNetUsd !== null &&
    replacementCostUsd !== null
      ? candidate.conditionalNetUsd - resting.conditionalNetUsd - replacementCostUsd
      : null;
  const bookKnown =
    [input.bestBid, input.bestAsk, input.tickSize].every(
      (v) => v !== undefined && Number.isFinite(v) && v > 0,
    ) && input.bestAsk! > input.bestBid!;
  const bookFresh =
    input.now === undefined &&
    input.bookObservedAt === undefined &&
    input.maximumBookAgeMs === undefined
      ? true // Pure price comparison callers; mutation callers supply all clocks.
      : input.now !== undefined &&
        input.bookObservedAt !== undefined &&
        input.maximumBookAgeMs !== undefined &&
        [input.now, input.bookObservedAt, input.maximumBookAgeMs].every(Number.isFinite) &&
        input.maximumBookAgeMs >= 0 &&
        input.now >= input.bookObservedAt &&
        input.now - input.bookObservedAt <= input.maximumBookAgeMs;
  const passive =
    bookKnown &&
    (input.side === 'BUY'
      ? input.candidatePrice < input.bestAsk!
      : input.candidatePrice > input.bestBid!);
  const priceImprovement =
    input.side === 'BUY'
      ? input.candidatePrice - input.restingPrice
      : input.restingPrice - input.candidatePrice;
  // Observable price priority, not expected PnL or a fabricated fill probability.
  const executionImprovementUsd = comparable ? priceImprovement * executableQuantity! : null;
  // The admission boundary is a cost constraint, not evidence of execution
  // priority. Its tick rounding may oscillate while the book position is unchanged.
  const bestMakerPrice = bookKnown
    ? input.side === 'BUY'
      ? input.bestBid!
      : input.bestAsk!
    : null;
  const closestAdmissiblePrice = bookKnown
    ? calculateDecibelClosestEntryPriceV1({
        ...input,
        quantity: input.candidateQuantity,
        bestBid: input.bestBid!,
        bestAsk: input.bestAsk!,
        tickSize: input.tickSize!,
      })
    : null;
  const candidateAdmission = assessDecibelEntryPhaseEconomicsV1({
    ...input,
    phase: 'PLACE',
    price: input.candidatePrice,
    quantity: input.candidateQuantity,
  });
  const admitted =
    candidateAdmission.conditionalNetUsd !== null && candidateAdmission.conditionalNetUsd >= 0;
  const restingTicks = bookKnown ? Math.round(input.restingPrice / input.tickSize!) : null;
  const candidateTicks = bookKnown ? Math.round(input.candidatePrice / input.tickSize!) : null;
  const bestMakerTicks =
    bestMakerPrice === null ? null : Math.round(bestMakerPrice / input.tickSize!);
  const reachesBestMaker =
    bestMakerTicks !== null &&
    candidateTicks !== null &&
    (input.side === 'BUY' ? candidateTicks >= bestMakerTicks : candidateTicks <= bestMakerTicks);
  const depth = input.depth;
  const sameFreshFrame =
    depth !== undefined &&
    Number.isFinite(depth.observedAt) &&
    bookFresh &&
    depth.observedAt === input.bookObservedAt;
  const validateLevels = (
    levels: decibel_entry_priority_depth_v1['bids'],
    side: 'BUY' | 'SELL',
    best: number | undefined,
  ) =>
    levels.length > 0 &&
    best !== undefined &&
    input.tickSize !== undefined &&
    Math.round(levels[0]!.price / input.tickSize) === Math.round(best / input.tickSize) &&
    levels.every(
      (level, index) =>
        Number.isFinite(level.price) &&
        level.price > 0 &&
        Number.isFinite(level.size) &&
        level.size > 0 &&
        input.tickSize !== undefined &&
        Math.abs(level.price / input.tickSize - Math.round(level.price / input.tickSize)) < 1e-7 &&
        (index === 0 ||
          (side === 'BUY'
            ? levels[index - 1]!.price > level.price
            : levels[index - 1]!.price < level.price)),
    );
  const depthKnown =
    bookKnown &&
    sameFreshFrame &&
    validateLevels(depth.bids, 'BUY', input.bestBid) &&
    validateLevels(depth.asks, 'SELL', input.bestAsk);
  // Strictly passed levels exclude both the resting level (our own order can
  // be present there) and the candidate level (joining it does not bypass it).
  // This is displayed price priority only, not an estimate of queue position.
  const crossedVisibleLevels = depthKnown
    ? (input.side === 'BUY' ? depth.bids : depth.asks).filter((level) =>
        input.side === 'BUY'
          ? Math.round(level.price / input.tickSize!) > restingTicks! &&
            Math.round(level.price / input.tickSize!) < candidateTicks!
          : Math.round(level.price / input.tickSize!) < restingTicks! &&
            Math.round(level.price / input.tickSize!) > candidateTicks!,
      )
    : [];
  const crossedVisibleBaseQuantity = crossedVisibleLevels.reduce(
    (sum, level) => sum + level.size,
    0,
  );
  // An executable-size block is measured in the order's own residual, not an
  // arbitrary liquidity threshold. Small levels accumulate into a block; an
  // isolated dust level cannot create a new competitive price region.
  const liquidityPrices: number[] = [];
  if (depthKnown && executableQuantity !== null) {
    let displayedBase = 0;
    for (const level of input.side === 'BUY' ? depth.bids : depth.asks) {
      if (Math.round(level.price / input.tickSize!) === restingTicks) continue;
      displayedBase += level.size;
      if (displayedBase >= executableQuantity) {
        liquidityPrices.push(level.price);
        displayedBase = 0;
      }
    }
  }
  let betterLiquidityPrice: number | null = null;
  let worseLiquidityPrice: number | null = null;
  for (const price of liquidityPrices) {
    const ticks = Math.round(price / input.tickSize!);
    if (input.side === 'BUY' ? ticks > candidateTicks! : ticks < candidateTicks!)
      betterLiquidityPrice = price;
    else if (input.side === 'BUY' ? ticks < candidateTicks! : ticks > candidateTicks!) {
      worseLiquidityPrice = price;
      break;
    }
  }
  // A truncated frame without both observed boundaries does not prove a cell.
  const liquidityCellTicks =
    betterLiquidityPrice === null || worseLiquidityPrice === null
      ? null
      : Math.abs(
          Math.round(betterLiquidityPrice / input.tickSize!) -
            Math.round(worseLiquidityPrice / input.tickSize!),
        );
  const observedMovementPrice =
    input.observedPriceMovementBps !== undefined &&
    Number.isFinite(input.observedPriceMovementBps) &&
    input.observedPriceMovementBps >= 0
      ? (input.midpoint * input.observedPriceMovementBps) / 10000
      : null;
  const spreadTicks = bookKnown
    ? Math.round(input.bestAsk! / input.tickSize!) - Math.round(input.bestBid! / input.tickSize!)
    : null;
  const stabilityTicks = bookKnown
    ? Math.max(
        1,
        spreadTicks!,
        liquidityCellTicks ?? 0,
        observedMovementPrice === null ? 0 : Math.ceil(observedMovementPrice / input.tickSize!),
        input.minimumStabilityBps === undefined ||
          !Number.isFinite(input.minimumStabilityBps) ||
          input.minimumStabilityBps <= 0
          ? 0
          : Math.ceil((input.restingPrice * input.minimumStabilityBps) / 10_000 / input.tickSize!),
      )
    : null;
  const improvementTicks =
    restingTicks === null || candidateTicks === null
      ? null
      : input.side === 'BUY'
        ? candidateTicks - restingTicks
        : restingTicks - candidateTicks;
  const restingDistanceTicks =
    bestMakerTicks === null || restingTicks === null
      ? null
      : input.side === 'BUY'
        ? bestMakerTicks - restingTicks
        : restingTicks - bestMakerTicks;
  const candidateDistanceTicks =
    bestMakerTicks === null || candidateTicks === null
      ? null
      : input.side === 'BUY'
        ? bestMakerTicks - candidateTicks
        : candidateTicks - bestMakerTicks;
  const outsideStabilityBand =
    stabilityTicks !== null &&
    improvementTicks !== null &&
    restingDistanceTicks !== null &&
    improvementTicks > stabilityTicks &&
    restingDistanceTicks > stabilityTicks;
  const materialDisplayedPriority =
    liquidityCellTicks !== null &&
    executableQuantity !== null &&
    crossedVisibleBaseQuantity >= executableQuantity;
  // Passing a large displayed level alone can still leave almost the entire
  // distance to the maker untouched. Preserve OPEN time priority unless the
  // move closes a meaningful gap or removes a majority of the observed depth
  // ahead. These fractions are policy tradeoffs, not fill estimates.
  const displayedBaseAhead = depthKnown
    ? (input.side === 'BUY' ? depth.bids : depth.asks)
        .filter((level) =>
          input.side === 'BUY'
            ? Math.round(level.price / input.tickSize!) > restingTicks!
            : Math.round(level.price / input.tickSize!) < restingTicks!,
        )
        .reduce((sum, level) => sum + level.size, 0)
    : 0;
  const displayedPriorityFraction =
    displayedBaseAhead > 0 ? crossedVisibleBaseQuantity / displayedBaseAhead : null;
  const relativeDistanceImprovement =
    restingDistanceTicks !== null && restingDistanceTicks > 0 && improvementTicks !== null
      ? improvementTicks / restingDistanceTicks
      : null;
  const meaningfulCompetitiveProgress =
    reachesBestMaker ||
    (candidateDistanceTicks !== null &&
      stabilityTicks !== null &&
      candidateDistanceTicks <= stabilityTicks) ||
    (relativeDistanceImprovement !== null && relativeDistanceImprovement >= 1 / 3) ||
    (displayedPriorityFraction !== null && displayedPriorityFraction >= 1 / 2);
  // A directly observed arrival at best maker can outweigh a wide depth or
  // movement band. Still exclude spread-sized noise and one-tick readmission.
  const stableCompetitiveProgress =
    outsideStabilityBand ||
    (reachesBestMaker &&
      improvementTicks !== null &&
      spreadTicks !== null &&
      improvementTicks > Math.max(1, spreadTicks) &&
      relativeDistanceImprovement !== null &&
      relativeDistanceImprovement >= 1 / 3);
  const priorityEvidence = reachesBestMaker
    ? 'BEST_MAKER_PRICE_LEVEL'
    : materialDisplayedPriority
      ? 'VISIBLE_PRICE_LEVELS_PASSED'
      : 'NO_VERIFIED_PRICE_LEVEL_IMPROVEMENT';
  const restingCompetitive =
    bestMakerTicks !== null &&
    restingTicks !== null &&
    (input.side === 'BUY' ? restingTicks >= bestMakerTicks : restingTicks <= bestMakerTicks);
  const replace =
    comparable &&
    bookFresh &&
    passive &&
    Math.abs(
      input.candidatePrice / input.tickSize! - Math.round(input.candidatePrice / input.tickSize!),
    ) < 1e-7 &&
    Math.abs(input.restingPrice / input.tickSize! - restingTicks!) < 1e-7 &&
    (input.side === 'BUY' ? candidateTicks! > restingTicks! : candidateTicks! < restingTicks!) &&
    !restingCompetitive &&
    admitted &&
    stableCompetitiveProgress &&
    meaningfulCompetitiveProgress &&
    (reachesBestMaker || materialDisplayedPriority);
  return Object.freeze({
    decision: replace ? ('REPLACE' as const) : ('KEEP' as const),
    reason: !comparable
      ? 'ENTRY_REPLACEMENT_COMPARABLE_EVIDENCE_REQUIRED'
      : !bookKnown
        ? 'ENTRY_REPLACEMENT_BOOK_EVIDENCE_REQUIRED'
        : !bookFresh
          ? 'ENTRY_REPLACEMENT_FRESH_BOOK_REQUIRED'
          : !passive
            ? 'ENTRY_REPLACEMENT_MAKER_REQUIRED'
            : !admitted
              ? 'ENTRY_REPLACEMENT_ADMISSION_NOT_PROVEN'
              : improvementTicks !== null &&
                  improvementTicks > 0 &&
                  !restingCompetitive &&
                  !stableCompetitiveProgress
                ? 'ENTRY_REPLACEMENT_WITHIN_PRICE_STABILITY_BAND'
                : replace
                  ? 'ENTRY_REPLACEMENT_MAKER_PRIORITY_IMPROVED'
                  : 'ENTRY_REPLACEMENT_PRIORITY_NOT_IMPROVED',
    bestMakerPrice,
    closestAdmissiblePrice,
    priorityEvidence,
    depthEvidenceValid: depthKnown,
    crossedVisibleLevelCount: crossedVisibleLevels.length,
    crossedVisibleBaseQuantity,
    priceStability: Object.freeze({
      bandPrice: stabilityTicks === null ? null : stabilityTicks * input.tickSize!,
      spreadPrice: spreadTicks === null ? null : spreadTicks * input.tickSize!,
      observedMovementPrice,
      betterLiquidityPrice,
      worseLiquidityPrice,
      liquidityCellPrice: liquidityCellTicks === null ? null : liquidityCellTicks * input.tickSize!,
      liquidityUnitBase: executableQuantity,
      restingDistanceToBest:
        restingDistanceTicks === null ? null : restingDistanceTicks * input.tickSize!,
      candidateDistanceToBest:
        candidateDistanceTicks === null ? null : candidateDistanceTicks * input.tickSize!,
      outsideBand: outsideStabilityBand,
      materialDisplayedPriority,
      relativeDistanceImprovement,
      displayedBaseAhead,
      displayedPriorityFraction,
      meaningfulCompetitiveProgress,
      stableCompetitiveProgress,
    }),
    workingPrice: replace ? input.candidatePrice : input.restingPrice,
    candidateAdmission,
    executionImprovementUsd,
    conditionalNetImprovementUsd,
    executableQuantity,
    replacementCostUsd,
    cancelGasReserveUsd: comparable ? input.gasCostUsd : null,
    placementGasReserveUsd: comparable ? input.gasCostUsd : null,
    fillProbability: null,
    expectedValueUsd: null,
  });
}

export function resolveDecibelCandidateAdverseSelectionV1(
  input: Readonly<{
    side: 'BUY' | 'SELL';
    price: number;
    fairPrice: number | null;
    midpoint: number;
    tickSize: number;
    now: number;
    fallback: number | null;
    observations?:
      | readonly Readonly<{
          side: 'BUY' | 'SELL';
          distanceBps: number;
          p95AdverseSelectionBps: number;
          sampleCount: number;
          observedAt: number;
        }>[]
      | undefined;
  }>,
): Readonly<{
  distanceBps: number;
  adverseSelectionBps: number | null;
  source: 'CANDIDATE_P95' | 'GLOBAL_FALLBACK';
}> {
  const distanceBps =
    input.fairPrice === null
      ? 0
      : Math.abs(((input.price - input.fairPrice) / input.fairPrice) * 10000);
  const tolerance = (input.tickSize / input.midpoint) * 10000 * 0.51;
  const evidence = input.observations
    ?.filter(
      (row) =>
        row.side === input.side &&
        row.sampleCount >= 30 &&
        row.observedAt <= input.now &&
        input.now - row.observedAt <= 3600000 &&
        Math.abs(row.distanceBps - distanceBps) <= tolerance,
    )
    .sort(
      (a, b) => Math.abs(a.distanceBps - distanceBps) - Math.abs(b.distanceBps - distanceBps),
    )[0];
  const useEvidence = evidence !== undefined;
  return Object.freeze({
    distanceBps,
    adverseSelectionBps: useEvidence ? evidence.p95AdverseSelectionBps : input.fallback,
    source: useEvidence ? 'CANDIDATE_P95' : 'GLOBAL_FALLBACK',
  });
}
