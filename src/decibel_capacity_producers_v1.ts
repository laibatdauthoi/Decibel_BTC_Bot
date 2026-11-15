import { z } from 'zod';
import { isDecibelPositionReductionV1 } from './decibel_order_action_v1.js';
import type { decibel_capacity_evidence_v1 } from './decibel_risk_capacity_v1.js';
export const CapacityDepthSchema = z.object({
  market: z.string().min(1),
  unix_ms: z.number().int().nonnegative(),
  raw_exchange_unix_ms: z.number().int().nonnegative().optional(),
  received_at_ms: z.number().int().nonnegative().optional(),
  bids: z
    .array(
      z.object({ price: z.number().finite().positive(), size: z.number().finite().positive() }),
    )
    .min(1),
  asks: z
    .array(
      z.object({ price: z.number().finite().positive(), size: z.number().finite().positive() }),
    )
    .min(1),
});
export type capacity_depth_v1 = z.infer<typeof CapacityDepthSchema>;
export type capacity_policy_v1 = Readonly<{
  source: string;
  maximumAgeMs: number;
  minimumWindows: number;
  minimumExitObservations: number;
  maximumGapMs: number;
  exitHorizonMultiplier: number;
  collateralReserveUsd: number;
  liquidationReserveUsd: number;
}>;
export type capacity_receipt_v1 = Readonly<{
  hash: string;
  version: string;
  gasUnits: string;
  gasUnitPrice: string;
  success: boolean;
  observedAt: number;
  source: 'APTOS_COMMITTED_USER_TRANSACTION';
}>;
export function parseDecibelCapacityReceiptV1(
  raw: unknown,
  hash: string,
  now: number,
): capacity_receipt_v1 | null {
  const r = z
    .object({
      type: z.literal('user_transaction'),
      hash: z.string(),
      version: z.string().regex(/^\d+$/),
      gas_used: z.string().regex(/^\d+$/),
      gas_unit_price: z.string().regex(/^\d+$/),
      success: z.boolean(),
    })
    .safeParse(raw);
  if (!r.success || r.data.hash !== hash) return null;
  return Object.freeze({
    hash,
    version: r.data.version,
    gasUnits: r.data.gas_used,
    gasUnitPrice: r.data.gas_unit_price,
    success: r.data.success,
    observedAt: now,
    source: 'APTOS_COMMITTED_USER_TRANSACTION',
  });
}
export function produceDecibelDepthV1(
  raw: unknown,
  market: string,
  now: number,
  maxAgeMs: number,
  quantity: number,
) {
  const parsed = CapacityDepthSchema.safeParse(raw);
  if (!parsed.success) return { blocker: 'CAPACITY_L2_DEPTH_MISSING', observation: null };
  const b = parsed.data;
  if (b.market !== market || b.unix_ms > now || now - b.unix_ms > maxAgeMs)
    return { blocker: 'CAPACITY_L2_DEPTH_STALE_OR_MARKET_MISMATCH', observation: null };
  const bids = [...b.bids].sort((a, c) => c.price - a.price),
    asks = [...b.asks].sort((a, c) => a.price - c.price);
  if (
    bids[0]!.price >= asks[0]!.price ||
    new Set(bids.map((v) => v.price)).size !== bids.length ||
    new Set(asks.map((v) => v.price)).size !== asks.length
  )
    return { blocker: 'CAPACITY_L2_DEPTH_CONFLICT', observation: null };
  const sweep = (levels: typeof bids) => {
    let remaining = quantity,
      value = 0;
    for (const level of levels) {
      const used = Math.min(remaining, level.size);
      value += used * level.price;
      remaining -= used;
      if (remaining <= 1e-12) break;
    }
    return remaining > 1e-12 || !(quantity > 0) ? null : value / quantity;
  };
  const buy = sweep(asks),
    sell = sweep(bids),
    mid = (bids[0]!.price + asks[0]!.price) / 2;
  const common = {
    source: 'DECIBEL_L2_DEPTH' as const,
    observedAt: b.unix_ms,
    quantity,
    mid,
    bidQuantity: bids.reduce((s, v) => s + v.size, 0),
    askQuantity: asks.reduce((s, v) => s + v.size, 0),
  };
  return {
    blocker: buy === null || sell === null ? 'CAPACITY_EXIT_DEPTH_INSUFFICIENT' : null,
    observation: {
      ...common,
      buyVwap: buy,
      sellVwap: sell,
      slippageBps:
        buy === null || sell === null
          ? null
          : Math.max(0, (buy / mid - 1) * 10000, (1 - sell / mid) * 10000),
    },
  };
}
export type capacity_exit_observation_v1 = Readonly<{
  startedAt: number;
  completedAt: number;
  transactionHash: string;
  source: 'AUTHENTICATED_IOC_FILL_AND_TX';
}>;
export function produceDecibelExitStressV1(
  books: readonly capacity_depth_v1[],
  exits: readonly capacity_exit_observation_v1[],
  market: string,
  now: number,
  quantity: number,
  policy: capacity_policy_v1 | null,
) {
  if (
    !policy ||
    !policy.source ||
    ![
      policy.maximumAgeMs,
      policy.minimumWindows,
      policy.minimumExitObservations,
      policy.maximumGapMs,
    ].every((v) => Number.isSafeInteger(v) && v > 0) ||
    ![policy.collateralReserveUsd, policy.liquidationReserveUsd].every(
      (v) => Number.isFinite(v) && v >= 0,
    ) ||
    !Number.isFinite(policy.exitHorizonMultiplier) ||
    policy.exitHorizonMultiplier < 1
  )
    return { blocker: 'CAPACITY_EXIT_STRESS_POLICY_MISSING', observation: null };
  if (
    books.some((b, i) =>
      books
        .slice(i + 1)
        .some((c) => b.unix_ms === c.unix_ms && JSON.stringify(b) !== JSON.stringify(c)),
    )
  )
    return { blocker: 'CAPACITY_EXIT_STRESS_DEPTH_CONFLICT', observation: null };
  if (
    exits.some((b, i) =>
      exits
        .slice(i + 1)
        .some(
          (c) => b.transactionHash === c.transactionHash && JSON.stringify(b) !== JSON.stringify(c),
        ),
    )
  )
    return { blocker: 'CAPACITY_EXIT_HORIZON_CONFLICT', observation: null };
  const uniqueExits = [...new Map(exits.map((e) => [e.transactionHash, e])).values()];
  if (
    uniqueExits.length < policy.minimumExitObservations ||
    uniqueExits.some(
      (e) =>
        e.source !== 'AUTHENTICATED_IOC_FILL_AND_TX' ||
        !e.transactionHash ||
        e.completedAt <= e.startedAt ||
        e.completedAt > now ||
        now - e.completedAt > policy.maximumAgeMs,
    )
  )
    return { blocker: 'CAPACITY_MEASURED_EXIT_HORIZON_COVERAGE_MISSING', observation: null };
  const horizonMs = Math.ceil(
    Math.max(...uniqueExits.map((e) => e.completedAt - e.startedAt)) * policy.exitHorizonMultiplier,
  );
  const rows = [...new Map(books.map((b) => [b.unix_ms, b])).values()].sort(
    (a, b) => a.unix_ms - b.unix_ms,
  );
  if (
    !rows.length ||
    now - rows.at(-1)!.unix_ms > policy.maximumAgeMs ||
    rows.some(
      (r, i) =>
        r.unix_ms > now || (i > 0 && r.unix_ms - rows[i - 1]!.unix_ms > policy.maximumGapMs),
    )
  )
    return { blocker: 'CAPACITY_EXIT_STRESS_MARKET_COVERAGE_MISSING', observation: null };
  let next = 0,
    windows = 0,
    adverseMoveBps = 0;
  for (const row of rows) {
    if (row.unix_ms < next) continue;
    const future = rows.find(
      (r) =>
        r.unix_ms >= row.unix_ms + horizonMs &&
        r.unix_ms <= row.unix_ms + horizonMs + policy.maximumGapMs,
    );
    if (!future) continue;
    const start = produceDecibelDepthV1(row, market, now, policy.maximumAgeMs, quantity),
      end = produceDecibelDepthV1(future, market, now, policy.maximumAgeMs, quantity);
    if (start.blocker || end.blocker)
      return { blocker: 'CAPACITY_EXIT_STRESS_DEPTH_COVERAGE_MISSING', observation: null };
    const a = start.observation!,
      b = end.observation!;
    adverseMoveBps = Math.max(
      adverseMoveBps,
      (1 - b.sellVwap! / a.sellVwap!) * 10000,
      (b.buyVwap! / a.buyVwap! - 1) * 10000,
    );
    windows++;
    next = future.unix_ms;
  }
  if (windows < policy.minimumWindows || adverseMoveBps <= 0)
    return { blocker: 'CAPACITY_EXIT_STRESS_SAMPLE_COVERAGE_MISSING', observation: null };
  return {
    blocker: null,
    observation: {
      source: 'EMPIRICAL_L2_EXIT_WINDOW_MAX' as const,
      horizonMs,
      windows,
      adverseMoveBps,
      policySource: policy.source,
      observedAt: rows.at(-1)!.unix_ms,
    },
  };
}
export function produceDecibelLifecycleGasV1(
  manifest: readonly { hash: string | null }[] | null,
  receipts: readonly capacity_receipt_v1[],
  prices: readonly { hash: string; aptUsd: number; source: string }[],
) {
  if (!manifest || manifest.some((m) => !m.hash))
    return { blocker: 'CAPACITY_TRANSACTION_MANIFEST_INCOMPLETE', gasApt: null, gasUsd: null };
  let octas = 0n,
    gasUsd = 0,
    missingFx = false;
  for (const hash of new Set(manifest.map((m) => m.hash!))) {
    const matches = receipts.filter((r) => r.hash === hash);
    if (!matches.length)
      return { blocker: 'CAPACITY_TRANSACTION_RECEIPT_MISSING', gasApt: null, gasUsd: null };
    if (
      matches.some(
        (r) =>
          r.version !== matches[0]!.version ||
          r.gasUnits !== matches[0]!.gasUnits ||
          r.gasUnitPrice !== matches[0]!.gasUnitPrice,
      )
    )
      return { blocker: 'CAPACITY_TRANSACTION_RECEIPT_CONFLICT', gasApt: null, gasUsd: null };
    const r = matches[0]!;
    if (
      r.source !== 'APTOS_COMMITTED_USER_TRANSACTION' ||
      !/^\d+$/.test(r.gasUnits) ||
      !/^\d+$/.test(r.gasUnitPrice)
    )
      return { blocker: 'CAPACITY_TRANSACTION_RECEIPT_INVALID', gasApt: null, gasUsd: null };
    const amount = BigInt(r.gasUnits) * BigInt(r.gasUnitPrice);
    if (amount > BigInt(Number.MAX_SAFE_INTEGER))
      return { blocker: 'CAPACITY_GAS_PRECISION_UNSAFE', gasApt: null, gasUsd: null };
    octas += amount;
    if (octas > BigInt(Number.MAX_SAFE_INTEGER))
      return { blocker: 'CAPACITY_GAS_PRECISION_UNSAFE', gasApt: null, gasUsd: null };
    const matchesFx = prices.filter((p) => p.hash === hash);
    const p = matchesFx[0];
    if (matchesFx.some((v) => v.aptUsd !== p?.aptUsd))
      return { blocker: 'CAPACITY_TRANSACTION_FX_CONFLICT', gasApt: null, gasUsd: null };
    if (!p || !p.source || !Number.isFinite(p.aptUsd) || p.aptUsd <= 0) missingFx = true;
    else gasUsd += (Number(amount) / 1e8) * p.aptUsd;
  }
  return {
    blocker: missingFx ? 'CAPACITY_TRANSACTION_FX_COVERAGE_MISSING' : null,
    gasApt: Number(octas) / 1e8,
    gasUsd: missingFx ? null : gasUsd,
  };
}
export type capacity_verified_margin_v1 = Readonly<{
  source: 'AUTHENTICATED_POST_ORDER_MARGIN_TIER';
  observedAt: number;
  validUntil: number;
  maximumNotionalUsd: number;
  initialMarginRate: number;
  reservedCollateralUsd: number;
  liquidationDistanceBps: number;
  maintenanceMarginUsd: number;
  tierBoundaryNotionalUsd?: number;
  coverageKind?: 'FIXED_RULES_WITH_OPEN_INTEREST_BOUND';
}>;
export function produceDecibelMarginTierV1(
  margin: capacity_verified_margin_v1 | null,
  now: number,
  notional: number,
) {
  if (!margin) return { blocker: 'CAPACITY_POST_ORDER_MARGIN_TIER_UNVERIFIED', observation: null };
  if (
    margin.source !== 'AUTHENTICATED_POST_ORDER_MARGIN_TIER' ||
    ![now, margin.observedAt, margin.validUntil].every(Number.isSafeInteger) ||
    margin.validUntil < margin.observedAt ||
    margin.observedAt > now ||
    margin.validUntil < now ||
    ![
      margin.maximumNotionalUsd,
      margin.initialMarginRate,
      margin.reservedCollateralUsd,
      margin.liquidationDistanceBps,
      margin.maintenanceMarginUsd,
      margin.tierBoundaryNotionalUsd ??
        (margin.coverageKind === 'FIXED_RULES_WITH_OPEN_INTEREST_BOUND'
          ? margin.maximumNotionalUsd
          : Number.NaN),
    ].every((v) => Number.isFinite(v) && v >= 0) ||
    margin.initialMarginRate <= 0
  )
    return { blocker: 'CAPACITY_MARGIN_TIER_STALE_OR_INVALID', observation: null };
  if (
    notional >
    Math.min(margin.maximumNotionalUsd, margin.tierBoundaryNotionalUsd ?? margin.maximumNotionalUsd)
  )
    return { blocker: 'CAPACITY_MARGIN_TIER_BOUNDARY_UNVERIFIED', observation: null };
  return { blocker: null, observation: margin };
}
export function assembleDecibelCapacityCertificateV1(
  input: Readonly<{
    now: number;
    maximumBookAgeMs: number;
    market: string;
    quantity: number;
    books: readonly capacity_depth_v1[];
    exits: readonly capacity_exit_observation_v1[];
    policy: capacity_policy_v1 | null;
    margin: capacity_verified_margin_v1 | null;
    manifest: readonly { hash: string | null }[] | null;
    receipts: readonly capacity_receipt_v1[];
    prices: readonly { hash: string; aptUsd: number; source: string }[];
    fees: {
      observedAt: number;
      validUntil: number;
      source: 'AUTHENTICATED_USER_FEE_RATES';
      makerBps: number;
      takerBps: number;
    } | null;
    futureGas: { source: string; observedAt: number; validUntil: number; costUsd: number } | null;
    adverseSelectionBps: number | null;
  }>,
) {
  const latest = [...input.books].sort((a, b) => a.unix_ms - b.unix_ms).at(-1);
  const depth = produceDecibelDepthV1(
    latest,
    input.market,
    input.now,
    input.maximumBookAgeMs,
    input.quantity,
  );
  const stress = produceDecibelExitStressV1(
    input.books,
    input.exits,
    input.market,
    input.now,
    input.quantity,
    input.policy,
  );
  const gas = produceDecibelLifecycleGasV1(input.manifest, input.receipts, input.prices);
  const margin = produceDecibelMarginTierV1(
    input.margin,
    input.now,
    (depth.observation?.mid ?? Infinity) * input.quantity,
  );
  const blockers = [depth.blocker, stress.blocker, gas.blocker, margin.blocker];
  const f = input.fees,
    g = input.futureGas;
  if (
    !f ||
    f.source !== 'AUTHENTICATED_USER_FEE_RATES' ||
    f.observedAt > input.now ||
    f.validUntil < input.now ||
    ![f.makerBps, f.takerBps].every((v) => Number.isFinite(v) && v >= 0)
  )
    blockers.push('CAPACITY_AUTHENTICATED_EXIT_FEES_MISSING');
  if (
    !g ||
    !g.source ||
    g.observedAt > input.now ||
    g.validUntil < input.now ||
    !Number.isFinite(g.costUsd) ||
    g.costUsd < 0
  )
    blockers.push('CAPACITY_FUTURE_EXIT_GAS_UNVERIFIED');
  if (
    input.adverseSelectionBps === null ||
    !Number.isFinite(input.adverseSelectionBps) ||
    input.adverseSelectionBps < 0
  )
    blockers.push('CAPACITY_ADVERSE_SELECTION_UNAVAILABLE');
  const missing = blockers.filter((v): v is string => v !== null);
  let certificate: decibel_capacity_evidence_v1 | undefined;
  if (!missing.length) {
    const d = depth.observation!,
      s = stress.observation!,
      m = margin.observation!,
      p = input.policy!;
    certificate = {
      source: 'AUTHENTICATED_DEPTH_AND_EMPIRICAL_EXIT_STRESS_V1',
      observedAt: Math.max(d.observedAt, s.observedAt, m.observedAt, f!.observedAt, g!.observedAt),
      validUntil: Math.min(
        d.observedAt + input.maximumBookAgeMs,
        s.observedAt + p.maximumAgeMs,
        m.validUntil,
        f!.validUntil,
        g!.validUntil,
      ),
      exitHorizonMs: s.horizonMs,
      horizonSource: s.policySource + ':MEASURED_IOC',
      stressSource: s.source,
      adverseMoveBps: s.adverseMoveBps,
      entryFeeBps: f!.makerBps,
      exitFeeBps: f!.takerBps,
      exitSlippageBps: d.slippageBps!,
      adverseSelectionBps: input.adverseSelectionBps!,
      fixedExitCostUsd: g!.costUsd,
      collateralReserveUsd: p.collateralReserveUsd,
      liquidationReserveUsd: p.liquidationReserveUsd,
      liquidationDistanceBps: m.liquidationDistanceBps,
      initialMarginRate: m.initialMarginRate,
      reservedCollateralUsd: m.reservedCollateralUsd,
      maximumExecutableExitNotionalUsd: input.quantity * d.mid,
      exchangeMaximumPositionNotionalUsd: Math.min(
        m.maximumNotionalUsd,
        m.tierBoundaryNotionalUsd ?? m.maximumNotionalUsd,
      ),
      sessionGasPaidUsd: gas.gasUsd!,
    };
    if (
      certificate.validUntil < input.now ||
      certificate.validUntil - certificate.observedAt < certificate.exitHorizonMs
    ) {
      missing.push('CAPACITY_CERTIFICATE_VALIDITY_INSUFFICIENT');
      certificate = undefined;
    }
  }
  return Object.freeze({
    observedAt: input.now,
    blockers: missing,
    depth,
    stress,
    gas,
    margin,
    ...(certificate ? { certificate } : {}),
  });
}
/** Fixed-rule venue inputs read at one ledger version; unsupported schema changes fail closed. */
export type capacity_venue_margin_rules_v1 = Readonly<{
  observedAt: number;
  ledgerVersion: string;
  maximumLeverage: number;
  maintenanceMultiplier: number;
  maintenanceDivisor: number;
  markPrice: number;
  markObservedAt: number;
  rawMarkObservedAt?: number;
  markClockSkewMs?: number;
  remainingOpenInterestBase: number;
  sizeModel: 'FIXED_LEVERAGE_V1';
}>;
export function parseDecibelVenueMarginRulesV1(
  input: Readonly<{
    global: unknown;
    expectedPrimaryAssetType: string;
    market: unknown;
    interest: unknown;
    prices: unknown;
    observedAt: number;
    ledgerVersion: string;
  }>,
): capacity_venue_margin_rules_v1 {
  const global = z
    .object({
      liquidation_config: z
        .object({
          __variant__: z.literal('V1'),
          maintenance_margin_leverage_multiplier: z.literal('1'),
          maintenance_margin_leverage_divisor: z.literal('2'),
        })
        .passthrough(),
      collateral: z
        .object({
          primary_asset_type: z.object({ inner: z.literal(input.expectedPrimaryAssetType) }),
          primary_store: z
            .object({ asset_precision: z.object({ decimals: z.literal(6) }) })
            .passthrough(),
        })
        .passthrough(),
    })
    .passthrough()
    .parse(input.global);
  const market = z
    .object({
      __variant__: z.literal('V1'),
      risk: z
        .object({
          __variant__: z.literal('V1'),
          max_leverage: z.number().int().positive(),
          is_isolated_only: z.literal(false),
          liquidation_details: z.unknown(),
        })
        .strict(),
      precision: z
        .object({ sz_precision: z.object({ multiplier: z.string().regex(/^\d+$/) }) })
        .passthrough(),
      state: z.object({ mode: z.object({ __variant__: z.literal('Open') }) }).passthrough(),
    })
    .passthrough()
    .parse(input.market);
  const interest = z
    .object({
      __variant__: z.literal('V1'),
      current_open_interest: z.string().regex(/^\d+$/),
      max_open_interest: z.string().regex(/^\d+$/),
      max_notional_open_interest: z.string().regex(/^\d+$/),
      lot_size: z.string().regex(/^\d+$/),
    })
    .strict()
    .parse(input.interest);
  const prices = z
    .object({
      price_config: z
        .object({
          max_leverage: z.literal(market.risk.max_leverage),
          unrealized_pnl_haircut_bps: z.literal('0'),
        })
        .passthrough(),
      price_history: z
        .object({
          committed_snapshot: z.object({ mark_px: z.string().regex(/^\d+$/) }).passthrough(),
          last_oracle_update_us: z.string().regex(/^\d+$/),
          oracle_price_details: z.object({ is_oracle_healthy: z.literal(true) }).passthrough(),
        })
        .passthrough(),
    })
    .passthrough()
    .parse(input.prices);
  const markPrice = Number(prices.price_history.committed_snapshot.mark_px) / 1e6;
  const remaining = BigInt(interest.max_open_interest) - BigInt(interest.current_open_interest);
  if (
    remaining < 0n ||
    !Number.isFinite(markPrice) ||
    markPrice <= 0 ||
    !/^\d+$/.test(input.ledgerVersion)
  )
    throw new Error('VENUE_MARGIN_RULES_INVALID');
  return Object.freeze({
    observedAt: input.observedAt,
    ledgerVersion: input.ledgerVersion,
    maximumLeverage: market.risk.max_leverage,
    maintenanceMultiplier: Number(global.liquidation_config.maintenance_margin_leverage_multiplier),
    maintenanceDivisor: Number(global.liquidation_config.maintenance_margin_leverage_divisor),
    markPrice,
    markObservedAt: Math.floor(Number(prices.price_history.last_oracle_update_us) / 1000),
    remainingOpenInterestBase: Math.min(
      Number(remaining) / Number(market.precision.sz_precision.multiplier),
      Number(interest.max_notional_open_interest) / 1e6 / markPrice,
    ),
    sizeModel: 'FIXED_LEVERAGE_V1',
  });
}
export function produceDecibelPostFillMarginV1(
  input: Readonly<{
    rules: capacity_venue_margin_rules_v1;
    now: number;
    maximumAgeMs: number;
    equityUsd: number;
    availableMarginUsd: number;
    leverage: number;
    capitalUsd: number;
    collateralFraction: number;
    maxLossUsd: number;
    transactionReserveUsd?: number;
    midpoint: number;
    positionBase: number;
    candidateHeadroomUsd: number;
    candidatePositionLimitUsd: number;
    orders: readonly Readonly<{
      side?: 'BUY' | 'SELL';
      quantity: number;
      price: number;
      reduceOnly?: boolean;
    }>[];
    feeAndExitCostBps: number;
    collateralReserveFraction: number;
  }>,
) {
  const r = input.rules;
  if (
    ![input.now, r.observedAt, r.markObservedAt, input.maximumAgeMs].every(Number.isSafeInteger) ||
    input.maximumAgeMs <= 0 ||
    r.observedAt > input.now ||
    r.markObservedAt > input.now ||
    input.now - Math.min(r.observedAt, r.markObservedAt) > input.maximumAgeMs
  )
    return { blocker: 'CAPACITY_VENUE_MARGIN_RULES_STALE', observation: null };
  if (
    ![
      input.equityUsd,
      input.availableMarginUsd,
      input.leverage,
      input.capitalUsd,
      input.collateralFraction,
      input.maxLossUsd,
      input.midpoint,
      input.candidatePositionLimitUsd,
      input.candidateHeadroomUsd,
      input.feeAndExitCostBps,
      r.markPrice,
      r.remainingOpenInterestBase,
      r.maximumLeverage,
      input.collateralReserveFraction,
    ].every((v) => Number.isFinite(v) && v >= 0) ||
    !Number.isFinite(input.positionBase) ||
    r.markPrice <= 0 ||
    r.maximumLeverage < 1 ||
    r.maintenanceMultiplier !== 1 ||
    r.maintenanceDivisor !== 2 ||
    r.sizeModel !== 'FIXED_LEVERAGE_V1' ||
    input.collateralFraction <= 0 ||
    input.collateralFraction > 0.5 ||
    input.collateralReserveFraction > 1 ||
    input.capitalUsd <= 0 ||
    input.maxLossUsd <= 0 ||
    input.leverage < 1 ||
    input.leverage > r.maximumLeverage ||
    input.midpoint <= 0 ||
    input.orders.some(
      (o) =>
        !o.side ||
        !Number.isFinite(o.quantity) ||
        o.quantity < 0 ||
        !Number.isFinite(o.price) ||
        o.price <= 0,
    )
  )
    return { blocker: 'CAPACITY_POST_FILL_INPUT_INVALID', observation: null };
  const openingOrders = input.orders.filter(
    (order) => !isDecibelPositionReductionV1(input.positionBase, order),
  );
  const buys = openingOrders.filter((o) => o.side === 'BUY').reduce((s, o) => s + o.quantity, 0);
  const sells = openingOrders.filter((o) => o.side === 'SELL').reduce((s, o) => s + o.quantity, 0);
  const quantity = input.candidateHeadroomUsd / input.midpoint;
  const positions = [input.positionBase + buys + quantity, input.positionBase - sells - quantity];
  // Venue available margin is free margin: it already excludes the initial margin the venue
  // reserves for resting opening orders. Those orders are counted again in the scenario
  // positions below, so add their reservation back once (as the risk capacity does) instead of
  // charging it twice. Reduce-only orders reserve nothing and are not added back.
  const reservedOrderMarginUsd =
    openingOrders.reduce((sum, order) => sum + order.price * order.quantity, 0) / input.leverage;
  const allocated = Math.min(
    input.capitalUsd * input.collateralFraction,
    input.availableMarginUsd + reservedOrderMarginUsd,
  );
  const fixed = allocated * input.collateralReserveFraction + (input.transactionReserveUsd ?? 0);
  // Each scenario models the fills that build that position: its own side's opening orders,
  // every reduce-only order and the candidate. The opposite flat entry is an alternative that
  // cannot build the same position, so its fee and mark costs are not charged to it.
  const scenarioOrders = (side: 'BUY' | 'SELL') =>
    input.orders.filter((order) => !openingOrders.includes(order) || order.side === side);
  const scenarioCosts = (side: 'BUY' | 'SELL') => {
    const orders = scenarioOrders(side);
    const costs =
      ((orders.reduce((s, o) => s + o.price * o.quantity, 0) + input.candidateHeadroomUsd) *
        input.feeAndExitCostBps) /
      10000;
    const markToExecutionLoss =
      orders.reduce(
        (sum, order) =>
          sum +
          Math.max(
            0,
            order.quantity *
              (order.side === 'BUY' ? order.price - r.markPrice : r.markPrice - order.price),
          ),
        0,
      ) +
      quantity * Math.abs(input.midpoint - r.markPrice);
    return { costs, markToExecutionLoss };
  };
  const mmr = r.maintenanceMultiplier / (r.maximumLeverage * r.maintenanceDivisor);
  const scenarios = positions.map((position, index) => {
    const { costs, markToExecutionLoss } = scenarioCosts(index === 0 ? 'BUY' : 'SELL');
    const notional = Math.abs(position) * Math.max(r.markPrice, input.midpoint);
    const initialMarginUsd = notional / input.leverage;
    const maintenanceMarginUsd = notional * mmr;
    const equityAfterCosts = input.equityUsd - fixed - costs - markToExecutionLoss;
    const marginBuffer = equityAfterCosts - maintenanceMarginUsd;
    const factor = position >= 0 ? 1 - mmr : 1 + mmr;
    const priceBuffer =
      position === 0
        ? 0
        : Math.floor((Math.max(0, marginBuffer) / (Math.abs(position) * factor)) * 1e6) / 1e6;
    const liquidationPrice =
      position === 0 ? 0 : Math.max(0, r.markPrice + (position > 0 ? -priceBuffer : priceBuffer));
    const distanceBps =
      position === 0
        ? Number.MAX_SAFE_INTEGER
        : (Math.abs(r.markPrice - liquidationPrice) / r.markPrice) * 10000;
    return {
      positionBase: position,
      notionalUsd: notional,
      initialMarginUsd,
      maintenanceMarginUsd,
      availableStrategyCollateralUsd:
        allocated - fixed - costs - markToExecutionLoss - initialMarginUsd,
      equityAfterCostsUsd: equityAfterCosts,
      liquidationPrice,
      liquidationDistanceBps: marginBuffer > 0 ? distanceBps : 0,
    };
  });
  if (scenarios.some((s) => Math.abs(s.positionBase) > r.remainingOpenInterestBase + 1e-12))
    return { blocker: 'CAPACITY_VENUE_OPEN_INTEREST_LIMIT', observation: null, scenarios };
  if (
    scenarios.some((s) => s.availableStrategyCollateralUsd < -1e-9 || s.liquidationDistanceBps <= 0)
  )
    return { blocker: 'CAPACITY_POST_FILL_MARGIN_UNSAFE', observation: null, scenarios };
  return {
    blocker: null,
    scenarios,
    observation: {
      source: 'AUTHENTICATED_POST_ORDER_MARGIN_TIER' as const,
      calculationSource: 'SDK_COMPATIBLE_FIXED_RULES' as const,
      ruleLedgerVersion: r.ledgerVersion,
      coverageKind: 'FIXED_RULES_WITH_OPEN_INTEREST_BOUND' as const,
      observedAt: r.observedAt,
      validUntil: Math.min(r.observedAt, r.markObservedAt) + input.maximumAgeMs,
      maximumNotionalUsd: r.remainingOpenInterestBase * input.midpoint,
      initialMarginRate: 1 / input.leverage,
      reservedCollateralUsd: 0,
      liquidationDistanceBps: Math.min(...scenarios.map((s) => s.liquidationDistanceBps)),
      maintenanceMarginUsd: Math.max(...scenarios.map((s) => s.maintenanceMarginUsd)),
    },
  };
}
