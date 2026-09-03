import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';

import {
  calculateDecibelPassiveVolumeQuotesV1,
  type decibel_passive_volume_quote_policy_result_v1,
} from './decibel_passive_volume_recycling_v1.js';
import { calculateDecibelFairPriceV1 } from './decibel_fair_price_engine_v1.js';
import { calculateDecibelInventoryConstraintsV1 } from './decibel_inventory_controller_v1.js';
import { buildDecibelMarketStateV1 } from './decibel_market_state_v1.js';
import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from './decibel_minimal_live_canary_v1.js';
import type { decibel_actual_fill_ledger_v1 } from './decibel_actual_fill_truth_v1.js';

export const DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_ORCHESTRATOR_V1 =
  'DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_ORCHESTRATOR_V1' as const;
export const LIVE_EXECUTION_ENABLED = false as const;
export const VENUE_MUTATION_ENABLED = false as const;

export type decibel_authenticated_strategy_order_v1 = Readonly<{
  venueOrderId: string;
  clientOrderId: string;
  strategyConfigId: string | null;
  market: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  orderType: 'LIMIT';
  timeInForce: 'PostOnly';
  postOnly: true;
}>;

export type decibel_desired_recycling_order_v1 = Readonly<{
  side: 'BUY' | 'SELL';
  market: string;
  price: number;
  quantity: number;
  orderType: 'LIMIT';
  timeInForce: 'PostOnly';
  postOnly: true;
  clientOrderId: string;
  strategyConfigId: string;
  generation: number;
}>;

export type decibel_recycling_action_v1 = Readonly<{
  action: 'WOULD_PLACE' | 'WOULD_CANCEL' | 'WOULD_REPLACE' | 'NO_OP' | 'BLOCKED';
  side: 'BUY' | 'SELL' | null;
  current: decibel_authenticated_strategy_order_v1 | null;
  desired: decibel_desired_recycling_order_v1 | null;
  reason: string;
}>;

export type decibel_authenticated_passive_recycling_input_v1 = Readonly<{
  sessionId: string;
  strategyConfigId: string;
  configuredSubaccount: string;
  authenticatedSubaccount: string;
  configuredNetwork: 'mainnet';
  observedNetwork: string;
  now: number;
  market: string;
  metadata: Readonly<{
    marketAddress: string;
    symbol: string;
    tickSize: number;
    lotSize: number;
    minimumSize: number;
    mode: string;
    observedAt: number;
  }>;
  book: Readonly<{ bestBid: number; bestAsk: number; observedAt: number }>;
  maxBboAgeMs: number;
  actualInventoryBase: number;
  inventoryDirectionProven: boolean;
  openOrders: readonly decibel_authenticated_strategy_order_v1[];
  activeTwapCount: number;
  activeTpSlCount: number;
  activeBulkOrderCount: number;
  manualOrDelegatedActivityCount: number;
  unresolvedExecutionPlanCount: number;
  persistenceAvailable: boolean;
  targetExternalMakerVolumeUsd: number | null;
  actualFillLedger: decibel_actual_fill_ledger_v1;
  generationBySide?: Readonly<{ BUY: number; SELL: number }>;
}>;

export type DecibelAuthenticatedPassiveRecyclingEvaluationV1 = Readonly<{
  version: typeof DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_ORCHESTRATOR_V1;
  sessionId: string;
  mode: 'AUTHENTICATED_DRY_RUN';
  status: 'READY' | 'FAIL_CLOSED' | 'STOPPING' | 'SESSION_COMPLETE';
  strategyState: decibel_passive_volume_quote_policy_result_v1['state'] | 'BLOCKED' | 'STOPPING';
  actualInventoryBase: number;
  desiredBid: decibel_desired_recycling_order_v1 | null;
  desiredAsk: decibel_desired_recycling_order_v1 | null;
  actions: readonly decibel_recycling_action_v1[];
  blockers: readonly string[];
  actualMakerFillCount: number;
  actualExternalMakerVolumeUsd: number;
  volumeCycles: decibel_actual_fill_ledger_v1['cycles'];
  trace: readonly Readonly<{ type: string; at: number; detail: string }>[];
  selfTradePermitted: false;
  externalCounterpartyRequired: true;
  liveExecutionEnabled: false;
  venueMutationEnabled: false;
}>;

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function semanticallyEqual(
  current: decibel_authenticated_strategy_order_v1,
  desired: decibel_desired_recycling_order_v1,
): boolean {
  return (
    current.market === desired.market &&
    current.side === desired.side &&
    current.price === desired.price &&
    current.quantity === desired.quantity &&
    current.orderType === desired.orderType &&
    current.timeInForce === desired.timeInForce &&
    current.postOnly &&
    current.strategyConfigId === desired.strategyConfigId
  );
}

function desiredOrder(input: {
  sessionId: string;
  strategyConfigId: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  generation: number;
}): decibel_desired_recycling_order_v1 {
  const identity = hash([
    input.sessionId,
    input.strategyConfigId,
    input.side,
    input.generation,
    DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    input.price,
    input.quantity,
  ]).slice(0, 32);
  return Object.freeze({
    side: input.side,
    market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    price: input.price,
    quantity: input.quantity,
    orderType: 'LIMIT',
    timeInForce: 'PostOnly',
    postOnly: true,
    clientOrderId: `dpvr1-${input.side === 'BUY' ? 'b' : 's'}-${input.generation}-${identity}`,
    strategyConfigId: input.strategyConfigId,
    generation: input.generation,
  });
}

function diffSide(
  side: 'BUY' | 'SELL',
  desired: decibel_desired_recycling_order_v1 | null,
  current: decibel_authenticated_strategy_order_v1 | null,
): decibel_recycling_action_v1 {
  if (desired === null && current === null)
    return Object.freeze({ action: 'NO_OP', side, current, desired, reason: 'SIDE_ABSENT' });
  if (desired === null)
    return Object.freeze({
      action: 'WOULD_CANCEL',
      side,
      current,
      desired,
      reason: 'SIDE_SUPPRESSED',
    });
  if (current === null)
    return Object.freeze({
      action: 'WOULD_PLACE',
      side,
      current,
      desired,
      reason: 'DESIRED_ORDER_ABSENT',
    });
  if (semanticallyEqual(current, desired))
    return Object.freeze({ action: 'NO_OP', side, current, desired, reason: 'SEMANTIC_MATCH' });
  return Object.freeze({
    action: 'WOULD_REPLACE',
    side,
    current,
    desired,
    reason: 'SEMANTIC_ORDER_CHANGED_CANCEL_THEN_PLACE',
  });
}

export function evaluateDecibelAuthenticatedPassiveRecyclingV1(
  input: decibel_authenticated_passive_recycling_input_v1,
): DecibelAuthenticatedPassiveRecyclingEvaluationV1 {
  const blockers: string[] = [];
  if (!input.sessionId || !input.strategyConfigId || !input.configuredSubaccount)
    blockers.push('ACCOUNT_SCOPE_INVALID');
  if (input.configuredSubaccount !== input.authenticatedSubaccount)
    blockers.push('AUTHENTICATED_ACCOUNT_MISMATCH');
  if (input.configuredNetwork !== 'mainnet' || input.observedNetwork !== 'mainnet')
    blockers.push('NETWORK_MISMATCH');
  if (
    input.market !== DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 ||
    input.metadata.marketAddress !== DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1
  )
    blockers.push('MARKET_MISMATCH');
  if (
    !(input.metadata.tickSize > 0) ||
    !(input.metadata.lotSize > 0) ||
    !(input.metadata.minimumSize > 0)
  )
    blockers.push('METADATA_INVALID');
  if (input.metadata.mode !== 'Open') blockers.push('MARKET_HALTED');
  if (!(input.book.bestBid > 0) || !(input.book.bestAsk > input.book.bestBid))
    blockers.push('BBO_CROSSED_OR_INVALID');
  if (
    input.now - input.book.observedAt < 0 ||
    input.now - input.book.observedAt > input.maxBboAgeMs
  )
    blockers.push('MARKET_DATA_STALE');
  if (!Number.isFinite(input.actualInventoryBase)) blockers.push('POSITION_MISMATCH');
  if (input.actualInventoryBase !== 0 && !input.inventoryDirectionProven)
    blockers.push('INVENTORY_DIRECTION_UNPROVEN');
  if (!input.persistenceAvailable) blockers.push('PERSISTENCE_UNAVAILABLE');
  if (input.unresolvedExecutionPlanCount !== 0) blockers.push('UNRESOLVED_EXECUTION_PLAN');
  if (
    input.activeTwapCount !== 0 ||
    input.activeTpSlCount !== 0 ||
    input.activeBulkOrderCount !== 0 ||
    input.manualOrDelegatedActivityCount !== 0
  )
    blockers.push('STRATEGY_ACTIVITY_EXCLUSIVITY_LOST');
  const knownPrefix = /^dpvr1-[bs]-\d+-[0-9a-f]{32}$/;
  if (
    input.openOrders.some(
      (order) =>
        !knownPrefix.test(order.clientOrderId) ||
        order.strategyConfigId !== input.strategyConfigId ||
        order.market !== input.market,
    )
  )
    blockers.push('UNRESOLVED_EXTERNAL_ORDER_ACTIVITY');
  if (Math.abs(input.actualInventoryBase) > input.metadata.minimumSize + Number.EPSILON)
    blockers.push('INVENTORY_CAP_EXCEEDED');

  const trace = [
    { type: 'SESSION_START', at: input.now, detail: input.sessionId },
    { type: 'AUTH_RECONCILIATION', at: input.now, detail: blockers.join(',') || 'CLEAR' },
    { type: 'MARKET_STATE', at: input.now, detail: `${input.book.bestBid}/${input.book.bestAsk}` },
    { type: 'INVENTORY_STATE', at: input.now, detail: String(input.actualInventoryBase) },
  ];
  const targetReached =
    input.targetExternalMakerVolumeUsd !== null &&
    input.actualFillLedger.actualExternalMakerVolumeUsd >= input.targetExternalMakerVolumeUsd;
  if (blockers.length > 0) {
    trace.push({ type: 'BLOCKED', at: input.now, detail: blockers[0] ?? 'FAIL_CLOSED' });
    return Object.freeze({
      version: DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_ORCHESTRATOR_V1,
      sessionId: input.sessionId,
      mode: 'AUTHENTICATED_DRY_RUN',
      status: 'FAIL_CLOSED',
      strategyState: 'BLOCKED',
      actualInventoryBase: input.actualInventoryBase,
      desiredBid: null,
      desiredAsk: null,
      actions: Object.freeze([
        Object.freeze({
          action: 'BLOCKED',
          side: null,
          current: null,
          desired: null,
          reason: blockers[0] ?? 'FAIL_CLOSED',
        }),
      ]),
      blockers: Object.freeze(blockers),
      actualMakerFillCount: input.actualFillLedger.fills.length,
      actualExternalMakerVolumeUsd: input.actualFillLedger.actualExternalMakerVolumeUsd,
      volumeCycles: input.actualFillLedger.cycles,
      trace: Object.freeze(trace),
      selfTradePermitted: false,
      externalCounterpartyRequired: true,
      liveExecutionEnabled: false,
      venueMutationEnabled: false,
    });
  }

  const midpoint = (input.book.bestBid + input.book.bestAsk) / 2;
  const at = new Date(input.now);
  const observed = new Date(input.book.observedAt);
  const marketState = buildDecibelMarketStateV1({
    constructedAt: at,
    metadata: {
      marketAddress: input.market,
      exchangeSymbol: input.metadata.symbol,
      tickSize: input.metadata.tickSize,
      lotSize: input.metadata.lotSize,
      minimumSize: input.metadata.minimumSize,
      priceDecimals: 8,
      sizeDecimals: 8,
      mode: 'Open',
      observedAt: new Date(input.metadata.observedAt),
    },
    book: {
      marketAddress: input.market,
      exchangeTimestamp: observed,
      receivedAt: observed,
      bestBid: input.book.bestBid,
      bestAsk: input.book.bestAsk,
      spread: input.book.bestAsk - input.book.bestBid,
      midPrice: midpoint,
      microprice: midpoint,
      bestBidSize: 1,
      bestAskSize: 1,
      top5DepthImbalance: 0,
    },
    prices: {
      marketAddress: input.market,
      exchangeTimestamp: observed,
      receivedAt: observed,
      markPrice: midpoint,
      midPrice: midpoint,
      oraclePrice: midpoint,
      fundingRate: 0,
      openInterest: 0,
    },
    sequence: {
      connectionEpoch: null,
      sequenceNumber: null,
      previousSequenceNumber: null,
      status: 'SEQUENCE_UNAVAILABLE',
    },
    connectionHealthy: true,
    persistenceAvailable: true,
    configuration: {
      maximumBookAgeMs: input.maxBboAgeMs,
      maximumPriceAgeMs: input.maxBboAgeMs,
      maximumTradeAgeMs: input.maxBboAgeMs,
      maximumClockSkewMs: 1_000,
      tradesRequired: false,
    },
  });
  const fair = calculateDecibelFairPriceV1(marketState, {
    micropriceWeight: 0,
    maximumMicropriceAdjustmentBps: 0,
    maximumFairToMarkDeviationBps: 1,
    maximumFairToOracleDeviationBps: 1,
    maximumMarkToOracleDeviationBps: 1,
  });
  const quantity =
    Math.ceil(input.metadata.minimumSize / input.metadata.lotSize) * input.metadata.lotSize;
  const inventory = calculateDecibelInventoryConstraintsV1(
    { signedBaseInventory: input.actualInventoryBase, neutralTargetBase: 0 },
    {
      softInventoryLimitBase: quantity / 2,
      hardInventoryLimitBase: quantity,
      maximumPriceSkewBps: 0,
      minimumInventoryIncreasingSizeMultiplier: 0,
    },
  );
  const policy = calculateDecibelPassiveVolumeQuotesV1(marketState, fair, inventory);
  const generation = input.generationBySide ?? { BUY: 0, SELL: 0 };
  let desiredBid =
    policy.desiredBidPrice === null
      ? null
      : desiredOrder({
          sessionId: input.sessionId,
          strategyConfigId: input.strategyConfigId,
          side: 'BUY',
          price: policy.desiredBidPrice,
          quantity,
          generation: generation.BUY,
        });
  let desiredAsk =
    policy.desiredAskPrice === null
      ? null
      : desiredOrder({
          sessionId: input.sessionId,
          strategyConfigId: input.strategyConfigId,
          side: 'SELL',
          price: policy.desiredAskPrice,
          quantity,
          generation: generation.SELL,
        });
  let status: DecibelAuthenticatedPassiveRecyclingEvaluationV1['status'] = 'READY';
  let strategyState: DecibelAuthenticatedPassiveRecyclingEvaluationV1['strategyState'] =
    policy.state;
  if (targetReached && input.actualInventoryBase === 0) {
    desiredBid = null;
    desiredAsk = null;
    status = 'SESSION_COMPLETE';
    strategyState = 'STOPPING';
  } else if (targetReached) {
    status = 'STOPPING';
    strategyState = 'STOPPING';
  }
  const currentBid = input.openOrders.find((order) => order.side === 'BUY') ?? null;
  const currentAsk = input.openOrders.find((order) => order.side === 'SELL') ?? null;
  const actions = Object.freeze([
    diffSide('BUY', desiredBid, currentBid),
    diffSide('SELL', desiredAsk, currentAsk),
  ]);
  trace.push(
    { type: 'STRATEGY_EVALUATION', at: input.now, detail: policy.state },
    {
      type: 'DESIRED_ORDER_STATE',
      at: input.now,
      detail: `${desiredBid !== null}/${desiredAsk !== null}`,
    },
    { type: 'VENUE_ORDER_STATE', at: input.now, detail: String(input.openOrders.length) },
    {
      type: 'EXECUTION_DIFF',
      at: input.now,
      detail: actions.map((action) => action.action).join(','),
    },
  );
  if (status === 'SESSION_COMPLETE')
    trace.push({ type: 'SESSION_COMPLETE', at: input.now, detail: 'TARGET_REACHED_FLAT' });
  return Object.freeze({
    version: DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_ORCHESTRATOR_V1,
    sessionId: input.sessionId,
    mode: 'AUTHENTICATED_DRY_RUN',
    status,
    strategyState,
    actualInventoryBase: input.actualInventoryBase,
    desiredBid,
    desiredAsk,
    actions,
    blockers: Object.freeze([]),
    actualMakerFillCount: input.actualFillLedger.fills.length,
    actualExternalMakerVolumeUsd: input.actualFillLedger.actualExternalMakerVolumeUsd,
    volumeCycles: input.actualFillLedger.cycles,
    trace: Object.freeze(trace),
    selfTradePermitted: false,
    externalCounterpartyRequired: true,
    liveExecutionEnabled: false,
    venueMutationEnabled: false,
  });
}

export class decibel_authenticated_passive_recycling_journal_v1 {
  private readonly database: Database.Database;

  public constructor(path: string) {
    this.database = new Database(path);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('synchronous = FULL');
    this.database.exec(`CREATE TABLE IF NOT EXISTS decibel_authenticated_passive_recycling_v1 (
      session_id TEXT PRIMARY KEY,
      strategy_config_id TEXT NOT NULL,
      evaluation_json TEXT NOT NULL,
      known_fill_ids_json TEXT NOT NULL,
      volume_cycles_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      live_execution_enabled INTEGER NOT NULL CHECK(live_execution_enabled = 0),
      venue_mutation_enabled INTEGER NOT NULL CHECK(venue_mutation_enabled = 0)
    )`);
  }

  public persist(input: {
    evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1;
    strategyConfigId: string;
    knownFillIds: readonly string[];
  }): void {
    const existing = this.restore(input.evaluation.sessionId);
    if (existing !== null && existing.strategyConfigId !== input.strategyConfigId)
      throw new Error('PASSIVE_RECYCLING_JOURNAL_CONFLICT');
    this.database
      .prepare(
        `INSERT INTO decibel_authenticated_passive_recycling_v1 VALUES (?,?,?,?,?,?,0,0)
        ON CONFLICT(session_id) DO UPDATE SET evaluation_json=excluded.evaluation_json,
        known_fill_ids_json=excluded.known_fill_ids_json,
        volume_cycles_json=excluded.volume_cycles_json,updated_at=excluded.updated_at`,
      )
      .run(
        input.evaluation.sessionId,
        input.strategyConfigId,
        JSON.stringify(input.evaluation),
        JSON.stringify([...new Set(input.knownFillIds)].sort()),
        JSON.stringify(input.evaluation.volumeCycles),
        input.evaluation.trace.at(-1)?.at ?? Date.now(),
      );
  }

  public restore(sessionId: string): Readonly<{
    strategyConfigId: string;
    evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1;
    knownFillIds: readonly string[];
    volumeCycles: decibel_actual_fill_ledger_v1['cycles'];
  }> | null {
    const row = this.database
      .prepare(
        `SELECT strategy_config_id AS strategyConfigId,evaluation_json AS evaluationJson,
        known_fill_ids_json AS knownFillIdsJson,volume_cycles_json AS volumeCyclesJson
        FROM decibel_authenticated_passive_recycling_v1 WHERE session_id=?`,
      )
      .get(sessionId) as
      | {
          strategyConfigId: string;
          evaluationJson: string;
          knownFillIdsJson: string;
          volumeCyclesJson: string;
        }
      | undefined;
    return row === undefined
      ? null
      : Object.freeze({
          strategyConfigId: row.strategyConfigId,
          evaluation: JSON.parse(
            row.evaluationJson,
          ) as DecibelAuthenticatedPassiveRecyclingEvaluationV1,
          knownFillIds: Object.freeze(JSON.parse(row.knownFillIdsJson) as string[]),
          volumeCycles: Object.freeze(
            JSON.parse(row.volumeCyclesJson) as decibel_actual_fill_ledger_v1['cycles'],
          ),
        });
  }

  public close(): void {
    this.database.close();
  }
}

export function assertPassiveRecyclingVenueMutationUnavailableV1(): never {
  throw new Error('PASSIVE_RECYCLING_VENUE_MUTATION_DISABLED');
}
