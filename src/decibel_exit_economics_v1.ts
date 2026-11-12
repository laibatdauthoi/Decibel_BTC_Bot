import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_orchestrator_v1.js';
import type { tp_adverse_progress_v1 } from './decibel_execution_intent_v1.js';
import { DECIBEL_CAPACITY_POLICY_V1 } from './decibel_risk_capacity_v1.js';
import { createHash } from 'node:crypto';
import {
  floorDecibelQuantityToLotV1,
  getDecibelQuantityUnitsV1,
} from './decibel_chain_units_v1.js';

/** An authenticated opening fill identifies the inventory epoch. Reductions
 * retain it; flat/flip and subsequent opening fills cannot inherit it. */
export function getDecibelTPPositionKeyV1(
  snapshot: decibel_production_live_snapshot_v1,
): string | null {
  const input = snapshot.input;
  const ledger = input.actualFillLedger;
  if (!input.actualInventoryBase || ledger.inventoryBase !== input.actualInventoryBase) return null;
  const Fills = new Map(
    ledger.fills.map((fill) => [JSON.stringify([fill.venueFillId, fill.venueOrderId]), fill]),
  );
  if (Fills.size !== ledger.fills.length) return null;
  let opening: string | null = null;
  let inventory = 0;
  for (const app of ledger.applications) {
    const fill = Fills.get(JSON.stringify([app.venueFillId, app.venueOrderId]));
    if (
      app.inventoryBefore !== inventory ||
      !fill ||
      fill.executionProvenance !== 'AUTHENTICATED_OWN_FILL_STREAM' ||
      fill.marketAddress !== input.market
    )
      return null;
    if (inventory === 0 || Math.sign(inventory) !== Math.sign(app.inventoryAfter))
      opening = app.applicationId;
    inventory = app.inventoryAfter;
    if (inventory === 0) opening = null;
  }
  if (!opening || inventory !== input.actualInventoryBase) return null;
  return createHash('sha256')
    .update(
      JSON.stringify([input.configuredNetwork, input.configuredSubaccount, input.market, opening]),
    )
    .digest('hex');
}

export function planDecibelPatientTPV1(
  snapshot: decibel_production_live_snapshot_v1,
  side: 'BUY' | 'SELL',
) {
  const { input } = snapshot;
  const tick = input.metadata.tickSize;
  const direction = side === 'BUY' ? 1 : -1;
  const maker = side === 'BUY' ? input.book.bestBid : input.book.bestAsk;
  const positionKey = getDecibelTPPositionKeyV1(snapshot);
  const raw = snapshot.tpAdverseProgress;
  const progress =
    raw &&
    raw.positionKey === positionKey &&
    Number.isFinite(raw.recoveryDistancePrice) &&
    raw.recoveryDistancePrice >= 0 &&
    [raw.anchorPrice, raw.targetPrice, raw.previousPrice, raw.quantity, raw.triggerBandPrice].every(
      (v) => Number.isFinite(v) && v > 0,
    ) &&
    raw.observedAt <= input.now
      ? raw
      : null;
  const orders = input.openOrders.filter(
    (o) =>
      o.reduceOnly === true &&
      o.side === side &&
      o.postOnly &&
      o.timeInForce === 'PostOnly' &&
      o.market === input.market &&
      o.strategyConfigId === input.strategyConfigId,
  );
  const resting = orders.length === 1 ? orders[0]! : null;
  const result = (
    targetPrice: number | null,
    reason: string,
    band: number | null = null,
    authorization: tp_adverse_progress_v1 | null = null,
    adjustmentReady = false,
    minimumStepTicks = 0,
  ) => ({
    targetPrice,
    reason,
    movementBandUsd: band,
    authorization,
    adjustmentReady,
    minimumStepTicks,
  });
  if (!positionKey) return result(null, 'TP_ADVERSE_AUTHENTICATED_POSITION_EPOCH_REQUIRED');
  if (
    !Number.isFinite(tick) ||
    tick <= 0 ||
    !Number.isFinite(maker) ||
    maker <= 0 ||
    !Number.isFinite(input.book.bestBid) ||
    !Number.isFinite(input.book.bestAsk) ||
    input.book.bestBid <= 0 ||
    input.book.bestAsk <= input.book.bestBid
  )
    return result(null, 'TP_ADVERSE_FRESH_MAKER_EVIDENCE_REQUIRED');
  // A prepared cancellation carries the exact approved replacement through
  // unknown ACK, terminal finality and restart. It is not a new adverse step.
  if (
    progress &&
    progress.quantity >= Math.abs(input.actualInventoryBase) &&
    (!resting || Math.round(resting.price / tick) === Math.round(progress.previousPrice / tick))
  )
    return result(
      progress.targetPrice,
      'TP_ADVERSE_COMMITTED_PARTIAL_STEP',
      progress.triggerBandPrice,
      progress,
      !!resting,
    );
  if (!resting) return result(null, 'TP_ADVERSE_RESTING_COVERAGE_REQUIRED');
  const basis = snapshot.authenticatedPositions?.filter(
    (p) => p.market === 'BTC/USD' && p.size === input.actualInventoryBase,
  );
  const entryBasis = basis?.[0]?.entryPrice;
  if (
    basis?.length !== 1 ||
    typeof entryBasis !== 'number' ||
    !Number.isFinite(entryBasis) ||
    entryBasis <= 0
  )
    return result(null, 'TP_ADVERSE_AUTHENTICATED_ENTRY_BASIS_REQUIRED');
  // The original TP-to-basis recovery corridor expresses this position's
  // existing recovery objective. Preserve it across steps and partial fills;
  // a temporarily quiet tape alone must not authorize chasing a few ticks.
  const recoveryDistancePrice =
    progress?.recoveryDistancePrice ?? Math.abs(entryBasis - resting.price);
  const history = snapshot.practicalCapacityInputs?.tpRegimePrices ?? [];
  // A recovered continuous suffix is sufficient. An older read gap must not
  // poison a newer full regime; never bridge a gap or reorder conflicting data.
  const preceding = history.filter(
    (p) => p.observedAt < input.book.observedAt && p.observedAt >= input.now - 60_000,
  );
  let start = 0;
  for (let i = 1; i < preceding.length; i++) {
    const previous = preceding[i - 1]!;
    const current = preceding[i]!;
    if (
      current.observedAt > previous.observedAt &&
      current.observedAt - previous.observedAt > input.maxBboAgeMs
    )
      start = i;
  }
  const prices = preceding.slice(start);
  const horizon = DECIBEL_CAPACITY_POLICY_V1.modeledExitHorizonMs;
  const valid =
    prices.length >= 2 &&
    prices.every(
      (p, i) =>
        Number.isFinite(p.midpoint) &&
        p.midpoint > 0 &&
        Number.isFinite(p.observedAt) &&
        p.observedAt <= input.now &&
        input.now - p.observedAt <= 60_000 &&
        (i === 0 ||
          (p.observedAt > prices[i - 1]!.observedAt &&
            p.observedAt - prices[i - 1]!.observedAt <= input.maxBboAgeMs)),
    ) &&
    prices.at(-1)!.observedAt - prices[0]!.observedAt >= horizon &&
    input.now - prices.at(-1)!.observedAt <= input.maxBboAgeMs;
  if (!valid) return result(null, 'TP_ADVERSE_REPRESENTATIVE_REGIME_REQUIRED');
  const range =
    Math.max(...prices.map((p) => p.midpoint)) - Math.min(...prices.map((p) => p.midpoint));
  const spreadTicks = Math.round(input.book.bestAsk / tick) - Math.round(input.book.bestBid / tick);
  // Original recovery corridor + full observed normal excursion + spread. No RMS,
  // percentile/fallback floor, Max Loss fraction or fitted volatility multiplier.
  const bandTicks = Math.max(
    1,
    Math.ceil(range / tick) + spreadTicks + Math.round(recoveryDistancePrice / tick),
  );
  const band = bandTicks * tick;
  const adverseTicks = Math.floor((direction * (maker - entryBasis)) / tick + 1e-7);
  const newAdverseTicks = Math.floor(
    (direction * (maker - (progress?.anchorPrice ?? entryBasis))) / tick + 1e-7,
  );
  const distanceTicks = Math.round((direction * (maker - resting.price)) / tick);
  // Move only the NEW adverse excess outside the normal excursion. Retain a
  // whole normal excursion between TP and maker for a recovery fill.
  const stepTicks = Math.min(newAdverseTicks - bandTicks, distanceTicks - bandTicks);
  // A change smaller than both the observed normal excursion and the original
  // recovery corridor cannot justify surrendering the existing queue priority.
  const minimumStepTicks = Math.ceil(
    (recoveryDistancePrice > 0 ? Math.min(range, recoveryDistancePrice) : range) / tick,
  );
  if (
    range <= 0 ||
    adverseTicks <= bandTicks ||
    stepTicks <= Math.max(1, spreadTicks) ||
    stepTicks < minimumStepTicks
  )
    return result(null, 'TP_ADVERSE_NEW_SIGNIFICANT_PROGRESS_REQUIRED', band);
  const targetPrice = Number(
    ((Math.round(resting.price / tick) + direction * stepTicks) * tick).toPrecision(15),
  );
  return result(
    targetPrice,
    'REPRICE:TP_ADVERSE_EXIT_REPRICE',
    band,
    {
      positionKey,
      anchorPrice: maker,
      targetPrice,
      previousPrice: resting.price,
      quantity: Math.abs(input.actualInventoryBase),
      observedAt: input.now,
      triggerBandPrice: band,
      recoveryDistancePrice,
    },
    true,
    Math.max(minimumStepTicks, Math.max(1, spreadTicks) + 1),
  );
}

/** A market-sized adverse displacement starts maker repricing independently of
 * Max Loss. Budget the WHOLE remaining position, even for a partial exit. Session
 * realized PnL already includes paid entry fees; marked losses are replaced by
 * the projected closing payoff rather than charged a second time. */
export function assessDecibelAdaptiveTPV1(
  snapshot: decibel_production_live_snapshot_v1,
  side: 'BUY' | 'SELL',
  price: number,
): Readonly<{
  mode: 'NORMAL_TP' | 'ADVERSE_EXIT_REPRICE';
  allowed: boolean;
  reason: string;
  movementBandUsd: number | null;
  projectedSessionPnlUsd: number | null;
  adjustmentReady: boolean;
  authorization: tp_adverse_progress_v1 | null;
}> {
  const { input, sessionConfiguration: config } = snapshot;
  const position = input.actualInventoryBase;
  const book = input.book;
  const tick = input.metadata.tickSize;
  const plan = planDecibelPatientTPV1(snapshot, side);
  const band = plan.movementBandUsd;
  const maker = side === 'BUY' ? book.bestBid : book.bestAsk;
  const economics = assessDecibelExitEconomicsV1(snapshot, side, Math.abs(position), price);
  const best = assessDecibelExitEconomicsV1(snapshot, side, Math.abs(position), maker);
  const basis = economics.basis;
  const triggered = plan.targetPrice !== null;
  const direction = side === 'BUY' ? 1 : -1;
  const stepTicks = plan.authorization
    ? direction * (Math.round(price / tick) - Math.round(plan.authorization.previousPrice / tick))
    : 0;
  const maximumStepTicks = plan.authorization
    ? direction *
      (Math.round(plan.authorization.targetPrice / tick) -
        Math.round(plan.authorization.previousPrice / tick))
    : 0;
  const permittedPrice =
    triggered &&
    (Math.round(price / tick) === Math.round(plan.targetPrice! / tick) ||
      (plan.reason === 'REPRICE:TP_ADVERSE_EXIT_REPRICE' &&
        stepTicks >= plan.minimumStepTicks &&
        stepTicks <= maximumStepTicks));
  const result = (allowed: boolean, reason: string, projected: number | null = null) =>
    Object.freeze({
      mode: triggered ? ('ADVERSE_EXIT_REPRICE' as const) : ('NORMAL_TP' as const),
      allowed,
      reason,
      movementBandUsd: band,
      projectedSessionPnlUsd: projected,
      adjustmentReady: plan.adjustmentReady,
      authorization:
        permittedPrice && plan.authorization ? { ...plan.authorization, targetPrice: price } : null,
    });
  if (!triggered) return result(false, plan.reason);
  if (!permittedPrice) return result(false, 'TP_ADVERSE_PARTIAL_STEP_PRICE_REQUIRED');
  if (
    economics.blockers.length ||
    best.blockers.length ||
    !economics.breakdown ||
    !Number.isFinite(band) ||
    band === null ||
    band <= 0 ||
    !Number.isFinite(price) ||
    price <= 0 ||
    Math.abs(price / tick - Math.round(price / tick)) > 1e-7 ||
    (side === 'BUY' ? price >= book.bestAsk : price <= book.bestBid)
  )
    return result(false, 'TP_ADVERSE_FRESH_MAKER_EVIDENCE_REQUIRED');
  const accounting = config?.exitAccounting;
  if (
    !config ||
    !accounting ||
    !Number.isFinite(config.maxLossUsd) ||
    config.maxLossUsd <= 0 ||
    config.pnlUsd === null ||
    !Number.isFinite(config.pnlUsd) ||
    !Number.isFinite(accounting.inventoryBase) ||
    Math.sign(accounting.inventoryBase) !== Math.sign(position) ||
    getDecibelQuantityUnitsV1(Math.abs(accounting.inventoryBase)) !==
      getDecibelQuantityUnitsV1(Math.abs(position)) ||
    basis === null ||
    !Number.isFinite(accounting.entryBasis) ||
    Math.round(accounting.entryBasis / tick) !== Math.round(basis / tick) ||
    !Number.isFinite(accounting.realizedPnlAfterFeesUsd)
  )
    return result(false, 'TP_ADVERSE_SESSION_COST_BASIS_RECONCILIATION_REQUIRED');
  const costs = economics.breakdown;
  const conservativeBasis =
    side === 'BUY'
      ? Math.min(accounting.entryBasis, basis)
      : Math.max(accounting.entryBasis, basis);
  const projectedGross =
    Math.abs(position) * (side === 'BUY' ? conservativeBasis - price : price - conservativeBasis);
  const projected =
    accounting.realizedPnlAfterFeesUsd +
    projectedGross -
    costs.exitFeeReserveUsd -
    costs.transactionGasReserveUsd -
    costs.safetyReserveUsd;
  if (config.pnlUsd <= -config.maxLossUsd || projected < -config.maxLossUsd)
    return result(false, 'TP_ADVERSE_REMAINING_LOSS_BUDGET_EXCEEDED', projected);
  const venueLimit = snapshot.reductionCapacity?.venueMaximumOrderNotionalUsd;
  if (
    venueLimit !== undefined &&
    venueLimit !== null &&
    (!Number.isFinite(venueLimit) || Math.abs(position) * price > venueLimit)
  )
    return result(false, 'TP_ADVERSE_VENUE_ORDER_LIMIT', projected);
  return result(true, 'REPRICE:TP_ADVERSE_EXIT_REPRICE', projected);
}

/** Keep a resting recovery quote by default. A committed partial step is also
 * the repair price after cancel finality, not permission to chase a newer BBO. */
export function constructDecibelAdaptiveTPPriceV1(
  snapshot: decibel_production_live_snapshot_v1,
  side: 'BUY' | 'SELL',
  quantity: number,
  proposedPrice: number,
): Readonly<{ price: number | null; blocker: string | null }> {
  const tick = snapshot.input.metadata.tickSize;
  const book = snapshot.input.book;
  if (
    !Number.isFinite(tick) ||
    tick <= 0 ||
    !Number.isFinite(book.bestBid) ||
    !Number.isFinite(book.bestAsk) ||
    book.bestBid <= 0 ||
    book.bestAsk <= book.bestBid
  )
    return { price: null, blocker: 'TP_FRESH_MAKER_BOOK_REQUIRED' };
  const plan = planDecibelPatientTPV1(snapshot, side);
  const resting = snapshot.input.openOrders.filter((o) => o.reduceOnly === true && o.side === side);
  if (plan.targetPrice !== null) {
    const policy = assessDecibelAdaptiveTPV1(snapshot, side, plan.targetPrice);
    if (policy.allowed) return { price: plan.targetPrice, blocker: null };
    // Closing payoff is monotonic over this bounded partial-step interval.
    // Clip to the current loss budget, preserving the same meaningful-step
    // test. A committed cancellation keeps its exact approved target instead.
    if (
      policy.reason === 'TP_ADVERSE_REMAINING_LOSS_BUDGET_EXCEEDED' &&
      plan.reason === 'REPRICE:TP_ADVERSE_EXIT_REPRICE' &&
      resting.length === 1
    ) {
      const direction = side === 'BUY' ? 1 : -1;
      const start = Math.round(resting[0]!.price / tick);
      let low = plan.minimumStepTicks;
      let high = direction * (Math.round(plan.targetPrice / tick) - start);
      let approved: number | null = null;
      while (Number.isSafeInteger(high) && low <= high) {
        const step = Math.floor((low + high) / 2);
        const candidate = Number(((start + direction * step) * tick).toPrecision(15));
        const checked = assessDecibelAdaptiveTPV1(snapshot, side, candidate);
        if (checked.allowed) {
          approved = candidate;
          low = step + 1;
        } else high = step - 1;
      }
      if (approved !== null) return { price: approved, blocker: null };
    }
  }
  // Preserve a valid confirmed TP in normal conditions instead of repricing
  // back to the breakeven boundary after an adverse exit has been authorized.
  if (resting.length === 1) return { price: resting[0]!.price, blocker: null };
  return constructDecibelProfitableTPPriceV1(snapshot, side, quantity, proposedPrice);
}

/** Construct a missing maker TP at the net >= 0 boundary.
 * This is not authority to reprice an existing or unresolved exit. */
export function constructDecibelProfitableTPPriceV1(
  snapshot: decibel_production_live_snapshot_v1,
  side: 'BUY' | 'SELL',
  quantity: number,
  proposedPrice: number,
): Readonly<{ price: number | null; blocker: string | null }> {
  const initial = assessDecibelExitEconomicsV1(snapshot, side, quantity, proposedPrice);
  if (initial.blockers.length || initial.netPnlUsd === null)
    return { price: null, blocker: `TP_EVIDENCE_REQUIRED:${initial.blockers.join(',')}` };
  const tick = snapshot.input.metadata.tickSize;
  if (!Number.isFinite(tick) || tick <= 0) return { price: null, blocker: 'TP_PRICE_TICK_INVALID' };
  const fees = snapshot.practicalCapacityInputs!.costObservations!.filter(
    (o) =>
      o.kind === 'MAKER_FEE' &&
      o.source.includes('AUTHENTICATED') &&
      o.unit === 'BPS' &&
      o.observedAt <= snapshot.input.now &&
      o.validUntil >= snapshot.input.now &&
      Number.isFinite(o.value) &&
      o.value >= 0,
  );
  const exitRate =
    (Math.max(...fees.map((o) => o.value)) + snapshot.economicInputs!.safetyMarginBps) / 10000;
  const slope = quantity * ((side === 'SELL' ? 1 : -1) - exitRate);
  if (!Number.isFinite(slope) || (side === 'SELL' && slope <= 0))
    return { price: null, blocker: 'TP_PROFITABLE_PRICE_IMPOSSIBLE:COST_RATE_NOT_BELOW_ONE' };
  const boundary = proposedPrice + (initial.requiredNetProfitUsd - initial.netPnlUsd) / slope;
  const book = snapshot.input.book;
  let ticks =
    side === 'SELL'
      ? Math.max(Math.ceil(boundary / tick), Math.floor(book.bestBid / tick) + 1)
      : Math.min(Math.floor(boundary / tick), Math.ceil(book.bestAsk / tick) - 1);
  for (let attempt = 0; attempt < 3; attempt++) {
    const price = Number((ticks * tick).toPrecision(15));
    if (!Number.isFinite(price) || price <= 0) break;
    const checked = assessDecibelExitEconomicsV1(snapshot, side, quantity, price);
    if (
      !checked.blockers.length &&
      checked.netPnlUsd !== null &&
      checked.netPnlUsd >= checked.requiredNetProfitUsd &&
      (side === 'SELL' ? price > book.bestBid : price < book.bestAsk)
    ) {
      const venueLimit = snapshot.reductionCapacity?.venueMaximumOrderNotionalUsd;
      if (
        venueLimit !== undefined &&
        venueLimit !== null &&
        (!Number.isFinite(venueLimit) || venueLimit < 0 || price * quantity > venueLimit + 1e-12)
      )
        return { price: null, blocker: 'TP_PROFITABLE_PRICE_EXCEEDS_VENUE_ORDER_LIMIT' };
      return { price, blocker: null };
    }
    ticks += side === 'SELL' ? 1 : -1;
  }
  return { price: null, blocker: 'TP_PROFITABLE_PRICE_IMPOSSIBLE:NO_POSITIVE_TICK_ALIGNED_PRICE' };
}

/** Recover only fees attributable to the authenticated remaining average-cost
 * inventory. Incomplete/mismatched history cannot replace the conservative fee
 * reserve. Reductions release fees pro rata; a flip starts a new cost basis. */
function calculateEntryFeeUsd(
  snapshot: decibel_production_live_snapshot_v1,
  basis: number,
  quantity: number,
): number | null {
  const ledger = snapshot.input.actualFillLedger;
  const position = snapshot.input.actualInventoryBase;
  if (
    ledger.inventoryBase !== position ||
    ledger.averageEntryPrice === null ||
    Math.abs(ledger.averageEntryPrice - basis) > Number.EPSILON * Math.max(1, basis) * 8
  )
    return null;
  let inventory = 0;
  let fee: number | null = 0;
  for (const app of ledger.applications) {
    if (app.inventoryBefore !== inventory) return null;
    const fill = ledger.fills.find(
      (f) => f.venueFillId === app.venueFillId && f.venueOrderId === app.venueOrderId,
    );
    if (
      !fill ||
      fill.executionProvenance !== 'AUTHENTICATED_OWN_FILL_STREAM' ||
      fill.marketAddress !== snapshot.input.market ||
      fill.side !== app.side ||
      !Number.isFinite(fill.receivedAt.getTime()) ||
      fill.receivedAt.getTime() > snapshot.input.now ||
      fill.executedBaseQuantity !== app.fillQuantity ||
      fill.executedPrice !== app.fillPrice
    )
      return null;
    let charge =
      fill.fee.availability === 'AVAILABLE' &&
      fill.fee.currency === 'USD' &&
      fill.fee.amount !== null &&
      Number.isFinite(fill.fee.amount) &&
      fill.fee.amount >= 0
        ? fill.fee.amount
        : null;
    const fragments = fill.executionFragments;
    if (
      charge === null &&
      fragments?.length &&
      fragments.every(
        (f) =>
          Number.isFinite(f.quantity) &&
          f.quantity > 0 &&
          f.feeUsd !== null &&
          Number.isFinite(f.feeUsd) &&
          f.feeUsd >= 0,
      ) &&
      fragments.reduce((sum, f) => sum + getDecibelQuantityUnitsV1(f.quantity), 0n) ===
        getDecibelQuantityUnitsV1(fill.executedBaseQuantity)
    )
      charge = fragments.reduce((sum, f) => sum + f.feeUsd!, 0);
    const after = app.inventoryAfter;
    if (after === 0) fee = 0;
    else if (inventory === 0 || Math.sign(after) !== Math.sign(inventory))
      fee = charge === null ? null : (charge * Math.abs(after)) / app.fillQuantity;
    else if (Math.abs(after) < Math.abs(inventory))
      fee = fee === null ? null : (fee * Math.abs(after)) / Math.abs(inventory);
    else fee = fee === null || charge === null ? null : fee + charge;
    inventory = after;
  }
  return inventory === position && fee !== null ? (fee * quantity) / Math.abs(position) : null;
}

export function assessDecibelExitEconomicsV1(
  snapshot: decibel_production_live_snapshot_v1,
  side: 'BUY' | 'SELL',
  quantity: number,
  price: number,
  liquidity: 'MAKER' | 'TAKER' = 'MAKER',
): Readonly<{
  basis: number | null;
  netPnlUsd: number | null;
  requiredNetProfitUsd: number;
  breakdown: Readonly<{
    grossPnlUsd: number;
    entryFeeReserveUsd: number;
    exitFeeReserveUsd: number;
    transactionGasReserveUsd: number;
    adverseReserveUsd: number;
    safetyReserveUsd: number;
    fundingUsd: null;
    entryFeeKind:
      'AUTHENTICATED_RESIDUAL_FILL_FEE' | 'CONSERVATIVE_RATE_ESTIMATE_NOT_ACTUAL_FILL_FEE';
  }> | null;
  blockers: readonly string[];
}> {
  const input = snapshot.input,
    position = input.actualInventoryBase,
    now = input.now;
  const practical = snapshot.practicalCapacityInputs;
  const blockers: string[] = [];
  const positions =
    snapshot.authenticatedPositions?.filter((p) => p.market === 'BTC/USD' && p.size === position) ??
    [];
  const basis = positions.length === 1 ? positions[0]!.entryPrice : null;
  if (!basis || !Number.isFinite(basis) || basis <= 0)
    blockers.push('AUTHENTICATED_ENTRY_BASIS_REQUIRED');
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    quantity > Math.abs(position) ||
    quantity !== floorDecibelQuantityToLotV1(quantity, input.metadata.lotSize) ||
    !((position > 0 && side === 'SELL') || (position < 0 && side === 'BUY'))
  )
    blockers.push('EXACT_REDUCIBLE_QUANTITY_REQUIRED');
  if (!Number.isFinite(price) || price <= 0) blockers.push('EXECUTABLE_EXIT_PRICE_REQUIRED');
  if (
    !practical ||
    practical.accountObservedAt > now ||
    now - practical.accountObservedAt > practical.maximumAgeMs
  )
    blockers.push('FRESH_AUTHENTICATED_ACCOUNT_REQUIRED');
  if (input.book.observedAt > now || now - input.book.observedAt > input.maxBboAgeMs)
    blockers.push('FRESH_EXECUTABLE_MARKET_REQUIRED');
  const economics = snapshot.economicInputs;
  const fees =
    practical?.costObservations?.filter(
      (o) =>
        (o.kind === 'MAKER_FEE' || o.kind === 'TAKER_FEE') &&
        o.source.includes('AUTHENTICATED') &&
        o.unit === 'BPS' &&
        o.observedAt <= now &&
        o.validUntil >= now &&
        o.value >= 0 &&
        Number.isFinite(o.value),
    ) ?? [];
  if (!fees.some((f) => f.kind === 'MAKER_FEE')) blockers.push('FRESH_MAKER_FEE_REQUIRED');
  if (!fees.some((f) => f.kind === 'TAKER_FEE')) blockers.push('FRESH_TAKER_FEE_REQUIRED');
  if (
    !economics ||
    [economics.estimatedGasCostUsd, economics.safetyMarginBps].some(
      (v) => v === null || !Number.isFinite(v) || v < 0,
    )
  )
    blockers.push('EXIT_COST_RESERVES_REQUIRED');
  const result = (
    netPnlUsd: number | null,
    breakdown: ReturnType<typeof assessDecibelExitEconomicsV1>['breakdown'] = null,
  ) =>
    Object.freeze({
      basis: basis && Number.isFinite(basis) ? basis : null,
      netPnlUsd,
      requiredNetProfitUsd: 0,
      breakdown,
      blockers: Object.freeze(blockers),
    });
  if (blockers.length || !economics || !basis) return result(null);
  const entryFee = Math.max(...fees.map((f) => f.value));
  const exitFee = Math.max(
    ...fees
      .filter((f) => f.kind === (liquidity === 'MAKER' ? 'MAKER_FEE' : 'TAKER_FEE'))
      .map((f) => f.value),
  );
  // Quantity is exact chain/lot-aligned; USD arithmetic is an explicit estimate.
  const exactQuantity = Number(getDecibelQuantityUnitsV1(quantity)) / 1e8;
  const actualEntryFeeUsd = calculateEntryFeeUsd(snapshot, basis, exactQuantity);
  const breakdown = Object.freeze({
    grossPnlUsd: exactQuantity * (price - basis) * (position > 0 ? 1 : -1),
    entryFeeReserveUsd: actualEntryFeeUsd ?? (exactQuantity * basis * entryFee) / 10000,
    exitFeeReserveUsd: (exactQuantity * price * exitFee) / 10000,
    transactionGasReserveUsd: 2 * economics.estimatedGasCostUsd!,
    adverseReserveUsd: 0,
    safetyReserveUsd: (exactQuantity * price * economics.safetyMarginBps) / 10000,
    fundingUsd: null,
    entryFeeKind:
      actualEntryFeeUsd === null
        ? ('CONSERVATIVE_RATE_ESTIMATE_NOT_ACTUAL_FILL_FEE' as const)
        : ('AUTHENTICATED_RESIDUAL_FILL_FEE' as const),
  });
  return result(
    breakdown.grossPnlUsd -
      breakdown.entryFeeReserveUsd -
      breakdown.exitFeeReserveUsd -
      breakdown.transactionGasReserveUsd -
      breakdown.adverseReserveUsd -
      breakdown.safetyReserveUsd,
    breakdown,
  );
}
