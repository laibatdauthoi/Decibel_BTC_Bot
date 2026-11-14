import {
  floorDecibelQuantityToLotV1,
  getDecibelQuantityUnitsV1,
  subtractDecibelQuantitiesV1,
  scaleDecimalToChainUnitsV1,
} from './decibel_chain_units_v1.js';
export type decibel_quote_size_input_v1 = Readonly<{
  side: 'BUY' | 'SELL';
  reduceOnly?: boolean;
  venueMaximumOrderNotionalUsd?: number | null;
  price: number;
  proposedSizeBtc: number;
  preferredEntrySizeUsd?: number;
  inventoryBase: number;
  maximumAbsPositionBase: number;
  availableMarginUsd: number;
  maximumEffectiveLeverage: number;
  maximumNotionalUsd: number;
  minimumNotionalUsd: number;
  minimumSize: number;
  lotSize: number;
  openOrders: readonly Readonly<{
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    venueOrderId?: string;
    reduceOnly?: boolean;
  }>[];
  remainingTargetUsd: number | null;
  replacingVenueOrderId?: string | undefined;
}>;

/** Directional endpoint bound; opposite-side orders are never netted against it. */
export function calculateDecibelSidePositionBudgetBtcV1(
  input: Readonly<{
    side: 'BUY' | 'SELL';
    inventoryBase: number;
    maximumAbsPositionBase: number;
    openOrders: readonly Readonly<{
      side: 'BUY' | 'SELL';
      quantity: number;
      venueOrderId?: string;
    }>[];
    replacingVenueOrderId?: string | undefined;
  }>,
) {
  const pendingUnits = input.openOrders
    .filter(
      (order) =>
        order.side === input.side &&
        (input.replacingVenueOrderId === undefined ||
          order.venueOrderId !== input.replacingVenueOrderId),
    )
    .reduce((sum, order) => sum + getDecibelQuantityUnitsV1(order.quantity) * 10000n, 0n);
  const inventoryUnits =
    getDecibelQuantityUnitsV1(Math.abs(input.inventoryBase)) *
    10000n *
    (input.inventoryBase < 0 ? -1n : 1n);
  const remaining =
    scaleDecimalToChainUnitsV1(input.maximumAbsPositionBase, 12) +
    (input.side === 'BUY' ? -inventoryUnits : inventoryUnits) -
    pendingUnits;
  return Number(remaining > 0n ? remaining : 0n) / 1e12;
}

export function calculateDecibelDynamicQuoteSizeV1(input: decibel_quote_size_input_v1) {
  if (
    ![input.price, input.lotSize, input.minimumSize, input.maximumEffectiveLeverage].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    ![
      input.maximumAbsPositionBase,
      input.proposedSizeBtc,
      input.availableMarginUsd,
      input.maximumNotionalUsd,
      input.minimumNotionalUsd,
    ].every((value) => Number.isFinite(value) && value >= 0) ||
    (input.venueMaximumOrderNotionalUsd != null &&
      (!Number.isFinite(input.venueMaximumOrderNotionalUsd) ||
        input.venueMaximumOrderNotionalUsd < 0)) ||
    !Number.isFinite(input.inventoryBase) ||
    (input.remainingTargetUsd !== null &&
      (!Number.isFinite(input.remainingTargetUsd) || input.remainingTargetUsd < 0)) ||
    input.openOrders.some(
      (order) =>
        !Number.isFinite(order.price) ||
        order.price <= 0 ||
        !Number.isFinite(order.quantity) ||
        order.quantity < 0,
    )
  )
    throw new Error('DYNAMIC_QUOTE_SIZE_INPUT_INVALID');
  const replacing = input.openOrders.find(
    (order) =>
      input.replacingVenueOrderId !== undefined &&
      order.venueOrderId === input.replacingVenueOrderId,
  );
  const pendingOrders = input.openOrders.filter((order) => order !== replacing);
  const pendingExposureBtc =
    Number(
      pendingOrders
        .filter((order) => order.side === input.side)
        .reduce((sum, order) => sum + getDecibelQuantityUnitsV1(order.quantity), 0n),
    ) / 1e8;
  // Only same-side opening orders consume the remaining target: an opposite-side entry is the
  // alternative (whichever fills first, the other is cancelled) and a reduce-only exit never
  // counts (2026-11-14: summing both sides halved the last entries).
  const pendingVolumeUsd = pendingOrders
    .filter((order) => order.side === input.side && order.reduceOnly !== true)
    .reduce((sum, order) => sum + order.price * order.quantity, 0);
  const reducing =
    input.reduceOnly === true &&
    ((input.inventoryBase < 0 && input.side === 'BUY') ||
      (input.inventoryBase > 0 && input.side === 'SELL'));
  const reductionBudgetBtc = subtractDecibelQuantitiesV1(Math.abs(input.inventoryBase), [
    pendingExposureBtc,
  ]);
  const positionBudgetBtc =
    input.reduceOnly === true
      ? reducing
        ? reductionBudgetBtc
        : 0
      : calculateDecibelSidePositionBudgetBtcV1(input);
  const marginBudgetUsd =
    input.availableMarginUsd * input.maximumEffectiveLeverage +
    (replacing === undefined ? 0 : replacing.price * replacing.quantity);
  const volumeBudgetUsd =
    input.remainingTargetUsd === null
      ? null
      : Math.max(0, input.remainingTargetUsd - pendingVolumeUsd);
  const minimumExecutableSizeBtc = Number(
    (
      Math.ceil(
        (Math.max(input.minimumSize, input.minimumNotionalUsd / input.price) - 1e-14) /
          input.lotSize,
      ) * input.lotSize
    ).toFixed(12),
  );
  const caps = [
    { reason: 'STRATEGY_ALLOCATION', quantity: input.proposedSizeBtc },
    { reason: 'POSITION_HEADROOM', quantity: positionBudgetBtc },
    // A proven reduce-only order consumes existing inventory, not entry margin.
    ...(reducing ? [] : [{ reason: 'AVAILABLE_MARGIN', quantity: marginBudgetUsd / input.price }]),
    ...(reducing && input.venueMaximumOrderNotionalUsd === null
      ? []
      : [
          {
            reason: 'MAX_ORDER_NOTIONAL',
            quantity:
              (input.venueMaximumOrderNotionalUsd ?? input.maximumNotionalUsd) / input.price,
          },
        ]),
    // While any target volume is still missing, the last entry keeps its normal size
    // (the preferred entry size, or the venue minimum without one) instead of shrinking
    // to the remainder: a small overshoot beats an unfinished session of tiny orders.
    // Nothing opens once pending orders already cover the remainder.
    ...(reducing || volumeBudgetUsd === null
      ? []
      : [
          {
            reason: 'REMAINING_TRADING_VOLUME',
            quantity:
              volumeBudgetUsd > 1e-9
                ? Math.max(
                    volumeBudgetUsd / input.price,
                    (input.preferredEntrySizeUsd ?? 0) / input.price,
                    minimumExecutableSizeBtc,
                  )
                : 0,
          },
        ]),
  ];
  const binding = caps.reduce((best, cap) => (cap.quantity < best.quantity ? cap : best));
  const cappedSizeBtc = Math.max(0, binding.quantity);
  let roundedSizeBtc = floorDecibelQuantityToLotV1(cappedSizeBtc, input.lotSize);
  if (roundedSizeBtc > cappedSizeBtc + 1e-12)
    roundedSizeBtc = Math.max(0, Number((roundedSizeBtc - input.lotSize).toFixed(12)));
  const residual = subtractDecibelQuantitiesV1(reductionBudgetBtc, [roundedSizeBtc]);
  const dustResidual = reducing && residual > 0 && residual < input.minimumSize;
  const belowMinimum = roundedSizeBtc + 1e-12 < minimumExecutableSizeBtc;
  const finalSizeBtc = belowMinimum || dustResidual ? 0 : roundedSizeBtc;
  return Object.freeze({
    ...(input.preferredEntrySizeUsd === undefined
      ? {}
      : { preferredEntrySizeUsd: input.preferredEntrySizeUsd }),
    side: input.side,
    price: input.price,
    proposedSizeBtc: input.proposedSizeBtc,
    proposedNotionalUsd: input.proposedSizeBtc * input.price,
    finalSizeBtc,
    finalNotionalUsd: finalSizeBtc * input.price,
    bindingConstraint: dustResidual ? 'EXIT_WOULD_LEAVE_UNEXECUTABLE_RESIDUAL' : binding.reason,
    positionBudgetBtc,
    positionBudgetUsd: positionBudgetBtc * input.price,
    marginBudgetUsd,
    volumeBudgetUsd,
    pendingExposureBtc,
    reductionBudgetBtc,
    reduceOnly: input.reduceOnly === true,
    pendingVolumeUsd,
    remainingTargetUsd: input.remainingTargetUsd,
    minimumExecutableSizeBtc,
    lotSize: input.lotSize,
    roundingReason: dustResidual
      ? 'EXIT_WOULD_LEAVE_UNEXECUTABLE_RESIDUAL'
      : belowMinimum
        ? `${binding.reason}_BELOW_MINIMUM_EXECUTABLE`
        : roundedSizeBtc < cappedSizeBtc - 1e-12
          ? 'ROUNDED_DOWN_TO_LOT'
          : 'LOT_ALIGNED',
  });
}
export type decibel_quote_size_assessment_v1 = ReturnType<
  typeof calculateDecibelDynamicQuoteSizeV1
>;

/** Share a combined reservation budget; this does not net opposite-side exposure. */
export function allocateDecibelTwoSidedQuoteBudgetV1(
  input: Readonly<{
    bid: Readonly<{ price: number; quantity: number }>;
    ask: Readonly<{ price: number; quantity: number }>;
    lotSize: number;
    minimumSize: number;
    minimumNotionalUsd: number;
    combinedBudgetUsd: number;
    preferredSide: 'BUY' | 'SELL';
    reservedBid?: Readonly<{ quantity: number; notionalUsd: number }>;
    reservedAsk?: Readonly<{ quantity: number; notionalUsd: number }>;
  }>,
) {
  if (
    ![input.lotSize, input.minimumSize, input.bid.price, input.ask.price].every(
      (v) => Number.isFinite(v) && v > 0,
    ) ||
    ![
      input.bid.quantity,
      input.ask.quantity,
      input.minimumNotionalUsd,
      input.combinedBudgetUsd,
    ].every((v) => Number.isFinite(v) && v >= 0)
  )
    throw new Error('DYNAMIC_PAIR_BUDGET_INVALID');
  const floor = (q: number) => floorDecibelQuantityToLotV1(q, input.lotSize);
  const minimum = (price: number) =>
    Number(
      (
        Math.ceil(
          (Math.max(input.minimumSize, input.minimumNotionalUsd / price) - 1e-14) / input.lotSize,
        ) * input.lotSize
      ).toFixed(12),
    );
  const reservedBid = input.reservedBid ?? { quantity: 0, notionalUsd: 0 };
  const reservedAsk = input.reservedAsk ?? { quantity: 0, notionalUsd: 0 };
  if (
    ![
      reservedBid.quantity,
      reservedBid.notionalUsd,
      reservedAsk.quantity,
      reservedAsk.notionalUsd,
    ].every((v) => Number.isFinite(v) && v >= 0)
  )
    throw new Error('DYNAMIC_PAIR_PENDING_INVALID');
  const baseBid = Math.min(input.bid.quantity, reservedBid.quantity),
    baseAsk = Math.min(input.ask.quantity, reservedAsk.quantity);
  // A proposed shrink does not release collateral/volume before its CANCEL ACK.
  const held =
    Math.max(reservedBid.notionalUsd, baseBid * input.bid.price) +
    Math.max(reservedAsk.notionalUsd, baseAsk * input.ask.price);
  const free = Math.max(0, input.combinedBudgetUsd - held);
  const addBid = Math.max(0, input.bid.quantity - baseBid),
    addAsk = Math.max(0, input.ask.quantity - baseAsk);
  if (addBid * input.bid.price + addAsk * input.ask.price <= free + 1e-9)
    return Object.freeze({
      BUY: input.bid.quantity,
      SELL: input.ask.quantity,
      reason: 'COMBINED_BUDGET_VALID',
    });
  const minBid = minimum(input.bid.price),
    minAsk = minimum(input.ask.price);
  const needBid = Math.max(0, minBid - baseBid),
    needAsk = Math.max(0, minAsk - baseAsk);
  const minCost = needBid * input.bid.price + needAsk * input.ask.price;
  if (
    minCost <= free + 1e-9 &&
    minBid <= input.bid.quantity + 1e-12 &&
    minAsk <= input.ask.quantity + 1e-12
  ) {
    const extra = Math.max(0, free - minCost);
    const bidExtra = Math.max(0, addBid - needBid) * input.bid.price,
      askExtra = Math.max(0, addAsk - needAsk) * input.ask.price;
    const share = Math.min(1, extra / Math.max(1e-12, bidExtra + askExtra));
    return Object.freeze({
      BUY: floor(baseBid + needBid + (bidExtra * share) / input.bid.price),
      SELL: floor(baseAsk + needAsk + (askExtra * share) / input.ask.price),
      reason: 'COMBINED_BUDGET_SHARED',
    });
  }
  for (const side of [
    input.preferredSide,
    input.preferredSide === 'BUY' ? 'SELL' : 'BUY',
  ] as const) {
    const order = side === 'BUY' ? input.bid : input.ask,
      base = side === 'BUY' ? baseBid : baseAsk;
    const size = floor(Math.min(order.quantity, base + free / order.price));
    if (size + 1e-12 < minimum(order.price)) continue;
    return Object.freeze({
      BUY: side === 'BUY' ? size : floor(baseBid),
      SELL: side === 'SELL' ? size : floor(baseAsk),
      reason: 'COMBINED_BUDGET_BELOW_TWO_SIDE_MINIMUM',
    });
  }
  return Object.freeze({
    BUY: floor(baseBid),
    SELL: floor(baseAsk),
    reason: 'COMBINED_BUDGET_BELOW_TWO_SIDE_MINIMUM',
  });
}
