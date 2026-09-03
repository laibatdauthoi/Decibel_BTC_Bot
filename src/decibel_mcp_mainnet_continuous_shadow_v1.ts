import { createHash } from 'node:crypto';

import { selectDecibelAuthenticatedFlatEntrySideV1 } from './decibel_authenticated_passive_recycling_flat_entry_v1.js';
import type { decibel_mcp_shadow_snapshot_v1 } from './decibel_mcp_mainnet_shadow_state_v1.js';
import { assertDecibelMcpShadowStateUnchangedV1 } from './decibel_mcp_mainnet_shadow_state_v1.js';
import {
  buildDecibelMcpMainnetShadowOrderV1,
  type decibel_mcp_shadow_order_payload_v1,
} from './decibel_mcp_mainnet_shadow_order_v1.js';
import type { decibel_mcp_transport_diagnostics_v1 } from './decibel_mcp_execution_transport_v1.js';

export type decibel_mcp_shadow_read_failure_class_v1 =
  | 'MCP_TOOL_TIMEOUT'
  | 'MCP_PROCESS_EXIT'
  | 'MCP_JSON_RPC_ERROR'
  | 'MCP_PROTOCOL_ERROR'
  | 'MCP_MALFORMED_RESPONSE'
  | 'MCP_READ_SCHEMA_ERROR'
  | 'MCP_ACCOUNT_STATE_ERROR'
  | 'UNKNOWN_READ_FAILURE';

export type decibel_mcp_shadow_read_failure_v1 = Readonly<{
  timestamp: number;
  evaluationAttempt: number;
  failureClass: decibel_mcp_shadow_read_failure_class_v1;
  message: string;
  elapsedMs: number;
  transportState?: Readonly<{
    processRunning: boolean;
    stderrObserved: boolean;
    stderrTailSanitized?: string;
  }>;
  mutationCounters: Readonly<{ mcpMutationCalls: 0; venueMutations: 0 }>;
}>;

export function classifyDecibelMcpShadowReadFailureV1(
  message: string,
): decibel_mcp_shadow_read_failure_class_v1 {
  if (message.includes('MCP_TOOL_TIMEOUT')) return 'MCP_TOOL_TIMEOUT';
  if (message.includes('MCP_PROCESS_EXIT') || message.includes('MCP_PROCESS_NOT_RUNNING'))
    return 'MCP_PROCESS_EXIT';
  if (message.includes('MCP_JSON_RPC') || message.includes('JSON-RPC')) return 'MCP_JSON_RPC_ERROR';
  if (message.includes('MCP_PROTOCOL')) return 'MCP_PROTOCOL_ERROR';
  if (message.includes('MCP_MALFORMED')) return 'MCP_MALFORMED_RESPONSE';
  if (message.includes('SCHEMA') || message.includes('PARSE')) return 'MCP_READ_SCHEMA_ERROR';
  if (message.includes('ACCOUNT_STATE') || message.includes('SHADOW_STATE'))
    return 'MCP_ACCOUNT_STATE_ERROR';
  return 'UNKNOWN_READ_FAILURE';
}

export function sanitizeDecibelMcpShadowFailureMessageV1(
  message: string,
  environment: NodeJS.ProcessEnv,
): string {
  let sanitized = message.replace(
    /DECIBEL_(?:NODE_API_KEY|PRIVATE_KEY)\s*[=:]\s*[^\s,;]+/giu,
    '[REDACTED]',
  );
  for (const key of ['DECIBEL_NODE_API_KEY', 'DECIBEL_PRIVATE_KEY']) {
    const secret = environment[key];
    if (secret) sanitized = sanitized.split(secret).join('[REDACTED]');
  }
  return sanitized.replace(/[\r\n]+/gu, ' ').slice(0, 2_000);
}

export function buildDecibelMcpShadowReadFailureV1(input: {
  error: unknown;
  environment: NodeJS.ProcessEnv;
  timestamp: number;
  evaluationAttempt: number;
  elapsedMs: number;
  diagnostics?: decibel_mcp_transport_diagnostics_v1;
}): decibel_mcp_shadow_read_failure_v1 {
  const message = sanitizeDecibelMcpShadowFailureMessageV1(
    input.error instanceof Error ? input.error.message : String(input.error),
    input.environment,
  );
  const stderr = input.diagnostics?.stderrTailSanitized;
  return Object.freeze({
    timestamp: input.timestamp,
    evaluationAttempt: input.evaluationAttempt,
    failureClass: classifyDecibelMcpShadowReadFailureV1(message),
    message,
    elapsedMs: input.elapsedMs,
    ...(input.diagnostics === undefined
      ? {}
      : {
          transportState: Object.freeze({
            processRunning: input.diagnostics.processRunning,
            stderrObserved: input.diagnostics.stderrObserved,
            ...(stderr && stderr.length > 0
              ? {
                  stderrTailSanitized: sanitizeDecibelMcpShadowFailureMessageV1(
                    stderr,
                    input.environment,
                  ),
                }
              : {}),
          }),
        }),
    mutationCounters: Object.freeze({ mcpMutationCalls: 0, venueMutations: 0 }),
  });
}

export type shadow_order_status_v1 =
  'WOULD_BE_OPEN' | 'WOULD_BE_CANCELLED' | 'WOULD_BE_REPLACED' | 'WOULD_BE_FILLED' | 'EXPIRED';

export type decibel_continuous_shadow_order_v1 = Readonly<{
  shadowOrderId: string;
  clientOrderId: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  createdAt: number;
  lastObservedAt: number;
  sourceStateHash: string;
  status: shadow_order_status_v1;
}>;

export type decibel_continuous_shadow_evaluation_v1 = Readonly<{
  timestamp: number;
  btcPositionBase: number;
  inventoryState: 'FLAT' | 'LONG_RECYCLE' | 'SHORT_RECYCLE';
  bestBid: number;
  bestAsk: number;
  desiredSide: 'buy' | 'sell' | null;
  desiredPrice: number | null;
  desiredQuantity: number | null;
  desiredNotional: number | null;
  restingPrice: number | null;
  distanceTicks: number | null;
  quoteRelation: 'CROSSING' | 'INSIDE_SPREAD' | 'AT_BEST' | 'BEHIND_BEST' | null;
  repriceReason:
    | 'SAFETY_CROSSING'
    | 'SAFETY_INSIDE_SPREAD'
    | 'CHASE_BEHIND_5_TICKS'
    | 'BASELINE_BBO_CHANGE'
    | 'NONE';
  shadowOrderBefore: decibel_continuous_shadow_order_v1 | null;
  action: 'WOULD_PLACE' | 'WOULD_CANCEL' | 'WOULD_REPLACE' | 'HOLD' | 'BLOCKED';
  shadowOrderAfter: decibel_continuous_shadow_order_v1 | null;
  blockers: readonly string[];
  mcpPayload: decibel_mcp_shadow_order_payload_v1 | null;
  mcpPayloadHash: string | null;
  semanticNoOp: boolean;
  shadowFillCount: 0;
  shadowMakerVolumeUsd: 0;
  externalCounterpartyRequired: true;
  selfTradePermitted: false;
  mutationCounters: Readonly<{ mcpMutationCalls: 0; venueMutations: 0 }>;
}>;

export type decibel_continuous_shadow_config_v1 = Readonly<{
  subaccount: string;
  marketAddress: string;
  checkpointHash: string;
  cycleSequence: number;
  tickSize: number;
  lotSize: number;
  minimumSize: number;
  minimumNotionalUsd: number;
  targetNotionalUsd: number;
  maximumNotionalUsd: number;
  repricePolicy?: 'BASELINE_IMMEDIATE' | 'BEHIND_5_TICKS';
  schema: Parameters<typeof buildDecibelMcpMainnetShadowOrderV1>[0]['schema'];
}>;

export function decideDecibelShadowRepriceV1(input: {
  policy: 'BASELINE_IMMEDIATE' | 'BEHIND_5_TICKS';
  side: 'buy' | 'sell';
  restingPrice: number;
  desiredPrice: number;
  bestBid: number;
  bestAsk: number;
  tickSize: number;
}) {
  const normalize = (price: number) => {
    const ticks = Math.round(price / input.tickSize);
    if (Math.abs(ticks * input.tickSize - price) > input.tickSize * 1e-6)
      throw new Error('SHADOW_REPRICE_PRICE_NOT_TICK_ALIGNED');
    return ticks;
  };
  const resting = normalize(input.restingPrice);
  const desired = normalize(input.desiredPrice);
  const bid = normalize(input.bestBid);
  const ask = normalize(input.bestAsk);
  const quoteRelation =
    input.side === 'buy'
      ? resting >= ask
        ? ('CROSSING' as const)
        : resting > bid
          ? ('INSIDE_SPREAD' as const)
          : resting === bid
            ? ('AT_BEST' as const)
            : ('BEHIND_BEST' as const)
      : resting <= bid
        ? ('CROSSING' as const)
        : resting < ask
          ? ('INSIDE_SPREAD' as const)
          : resting === ask
            ? ('AT_BEST' as const)
            : ('BEHIND_BEST' as const);
  const distanceTicks = Math.abs(desired - resting);
  const repriceReason =
    quoteRelation === 'CROSSING'
      ? ('SAFETY_CROSSING' as const)
      : quoteRelation === 'INSIDE_SPREAD'
        ? ('SAFETY_INSIDE_SPREAD' as const)
        : input.policy === 'BASELINE_IMMEDIATE' && distanceTicks >= 1
          ? ('BASELINE_BBO_CHANGE' as const)
          : quoteRelation === 'BEHIND_BEST' && distanceTicks >= 5
            ? ('CHASE_BEHIND_5_TICKS' as const)
            : ('NONE' as const);
  return Object.freeze({
    restingPrice: input.restingPrice,
    desiredPrice: input.desiredPrice,
    distanceTicks,
    quoteRelation,
    repriceReason,
    shouldReplace: repriceReason !== 'NONE',
  });
}

const canonicalHash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(value, Object.keys(value as object).sort()))
    .digest('hex');

function sameSemanticQuote(
  order: decibel_continuous_shadow_order_v1,
  payload: decibel_mcp_shadow_order_payload_v1,
): boolean {
  return (
    order.side === payload.side && order.price === payload.price && order.quantity === payload.size
  );
}

export function evaluateDecibelMcpContinuousShadowV1(input: {
  initial: decibel_mcp_shadow_snapshot_v1;
  final: decibel_mcp_shadow_snapshot_v1;
  previousOrder: decibel_continuous_shadow_order_v1 | null;
  config: decibel_continuous_shadow_config_v1;
  timestamp: number;
}): decibel_continuous_shadow_evaluation_v1 {
  const blockers: string[] = [];
  try {
    assertDecibelMcpShadowStateUnchangedV1(input.initial, input.final);
  } catch {
    blockers.push('MCP_SHADOW_STATE_CHANGED');
  }
  if (input.final.btcOrders.length > 0) blockers.push('REAL_BTC_ORDER_PRESENT');
  if (input.final.foreignOrders.length > 0) blockers.push('FOREIGN_MARKET_ORDER_PRESENT');
  const inventoryState =
    input.final.btcPositionBase > 0
      ? ('LONG_RECYCLE' as const)
      : input.final.btcPositionBase < 0
        ? ('SHORT_RECYCLE' as const)
        : ('FLAT' as const);
  const selection = selectDecibelAuthenticatedFlatEntrySideV1({
    subaccount: input.config.subaccount,
    marketAddress: input.config.marketAddress,
    resyncCheckpointBodyHash: input.config.checkpointHash,
    cycleSequence: input.config.cycleSequence,
  });
  const side =
    inventoryState === 'LONG_RECYCLE'
      ? ('SELL' as const)
      : inventoryState === 'SHORT_RECYCLE'
        ? ('BUY' as const)
        : selection.selectedSide;
  const price = side === 'BUY' ? input.final.book.bestBid : input.final.book.bestAsk;
  let built: ReturnType<typeof buildDecibelMcpMainnetShadowOrderV1> | null = null;
  if (blockers.length === 0) {
    try {
      built = buildDecibelMcpMainnetShadowOrderV1({
        side,
        price,
        lotSize: input.config.lotSize,
        minimumSize: input.config.minimumSize,
        minimumNotionalUsd: input.config.minimumNotionalUsd,
        targetNotionalUsd: input.config.targetNotionalUsd,
        maximumNotionalUsd: input.config.maximumNotionalUsd,
        cycleSequence: input.config.cycleSequence,
        seedHash: selection.sideSelectionSeedHash,
        schema: input.config.schema,
      });
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : 'MCP_SHADOW_PAYLOAD_INVALID');
    }
  }
  const payload = built?.payload ?? null;
  const payloadHash = payload === null ? null : canonicalHash(payload);
  let action: decibel_continuous_shadow_evaluation_v1['action'];
  let after = input.previousOrder;
  let semanticNoOp = false;
  let decision: ReturnType<typeof decideDecibelShadowRepriceV1> | null = null;
  if (blockers.length > 0) {
    action = 'BLOCKED';
    if (blockers.includes('REAL_BTC_ORDER_PRESENT')) after = null;
  } else if (payload === null || payloadHash === null) {
    action = 'BLOCKED';
    blockers.push('MCP_SHADOW_PAYLOAD_UNAVAILABLE');
  } else if (input.previousOrder === null) {
    action = 'WOULD_PLACE';
    after = Object.freeze({
      shadowOrderId: `shadow-${payloadHash.slice(0, 24)}`,
      clientOrderId: payload.clientOrderId,
      side: payload.side,
      price: payload.price,
      quantity: payload.size,
      createdAt: input.timestamp,
      lastObservedAt: input.timestamp,
      sourceStateHash: payloadHash,
      status: 'WOULD_BE_OPEN' as const,
    });
  } else {
    decision = decideDecibelShadowRepriceV1({
      policy: input.config.repricePolicy ?? 'BASELINE_IMMEDIATE',
      side: input.previousOrder.side,
      restingPrice: input.previousOrder.price,
      desiredPrice: payload.price,
      bestBid: input.final.book.bestBid,
      bestAsk: input.final.book.bestAsk,
      tickSize: input.config.tickSize,
    });
    const semanticsChanged =
      input.previousOrder.side !== payload.side || input.previousOrder.quantity !== payload.size;
    if (!decision.shouldReplace && !semanticsChanged) {
      action = 'HOLD';
      semanticNoOp = sameSemanticQuote(input.previousOrder, payload);
      after = Object.freeze({ ...input.previousOrder, lastObservedAt: input.timestamp });
    } else {
      action = 'WOULD_REPLACE';
      after = Object.freeze({
        shadowOrderId: `shadow-${payloadHash.slice(0, 24)}`,
        clientOrderId: payload.clientOrderId,
        side: payload.side,
        price: payload.price,
        quantity: payload.size,
        createdAt: input.timestamp,
        lastObservedAt: input.timestamp,
        sourceStateHash: payloadHash,
        status: 'WOULD_BE_OPEN' as const,
      });
    }
  }
  return Object.freeze({
    timestamp: input.timestamp,
    btcPositionBase: input.final.btcPositionBase,
    inventoryState,
    bestBid: input.final.book.bestBid,
    bestAsk: input.final.book.bestAsk,
    desiredSide: payload?.side ?? null,
    desiredPrice: payload?.price ?? null,
    desiredQuantity: payload?.size ?? null,
    desiredNotional: payload === null ? null : payload.price * payload.size,
    restingPrice: input.previousOrder?.price ?? null,
    distanceTicks: decision?.distanceTicks ?? null,
    quoteRelation: decision?.quoteRelation ?? null,
    repriceReason:
      decision?.repriceReason ?? (action === 'WOULD_REPLACE' ? 'BASELINE_BBO_CHANGE' : 'NONE'),
    shadowOrderBefore: input.previousOrder,
    action,
    shadowOrderAfter: after,
    blockers: Object.freeze(blockers),
    mcpPayload: payload,
    mcpPayloadHash: payloadHash,
    semanticNoOp,
    shadowFillCount: 0,
    shadowMakerVolumeUsd: 0,
    externalCounterpartyRequired: true,
    selfTradePermitted: false,
    mutationCounters: Object.freeze({ mcpMutationCalls: 0, venueMutations: 0 }),
  });
}

export function summarizeDecibelMcpContinuousShadowV1(input: {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  evaluations: readonly decibel_continuous_shadow_evaluation_v1[];
  readFailureCount: number;
  unhandledExceptionCount: number;
  readFailures?: readonly decibel_mcp_shadow_read_failure_v1[];
  evaluationAttempts?: number;
  maxConsecutiveReadFailures?: number;
  failureEvidencePath?: string;
}) {
  const values = input.evaluations;
  const lifetimes = values
    .filter((item) => item.action === 'WOULD_REPLACE' && item.shadowOrderBefore !== null)
    .map((item) => item.timestamp - item.shadowOrderBefore!.createdAt)
    .sort((left, right) => left - right);
  const average =
    lifetimes.length === 0 ? 0 : lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length;
  const median = lifetimes.length === 0 ? 0 : lifetimes[Math.floor(lifetimes.length / 2)]!;
  const blocked = values.filter((item) => item.action === 'BLOCKED');
  const deviations = values.map((item) => {
    if (item.shadowOrderAfter === null || item.desiredPrice === null) return 0;
    return Math.abs(
      Math.round(item.shadowOrderAfter.price * 10) - Math.round(item.desiredPrice * 10),
    );
  });
  const sortedDeviations = [...deviations].sort((left, right) => left - right);
  const durationMs = input.endedAt - input.startedAt;
  const replaceCount = values.filter((item) => item.action === 'WOULD_REPLACE').length;
  const placeCount = values.filter((item) => item.action === 'WOULD_PLACE').length;
  const ready =
    input.readFailureCount === 0 &&
    input.unhandledExceptionCount === 0 &&
    values.every(
      (item) =>
        item.mutationCounters.mcpMutationCalls === 0 &&
        item.mutationCounters.venueMutations === 0 &&
        (item.mcpPayload === null ||
          (item.mcpPayload.symbol === 'BTC/USD' && item.mcpPayload.timeInForce === 'post-only')),
    );
  return Object.freeze({
    identity: 'DECIBEL_MCP_MAINNET_CONTINUOUS_SHADOW_MARKET_MAKER_V1',
    sessionId: input.sessionId,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs,
    evaluations: values.length,
    evaluationAttempts: input.evaluationAttempts ?? values.length + input.readFailureCount,
    successfulEvaluations: values.length,
    readyEvaluations: values.length - blocked.length,
    blockedEvaluations: blocked.length,
    wouldPlaceCount: placeCount,
    wouldCancelCount:
      values.filter((item) => item.action === 'WOULD_CANCEL').length +
      values.filter((item) => item.action === 'WOULD_REPLACE').length,
    wouldReplaceCount: replaceCount,
    holdCount: values.filter((item) => item.action === 'HOLD').length,
    semanticNoOpCount: values.filter((item) => item.semanticNoOp).length,
    stateChangeBlockCount: values.filter((item) =>
      item.blockers.includes('MCP_SHADOW_STATE_CHANGED'),
    ).length,
    realOrderBlockCount: values.filter((item) =>
      item.blockers.some((reason) => reason.includes('ORDER_PRESENT')),
    ).length,
    uniqueDesiredPrices: [...new Set(values.flatMap((item) => item.desiredPrice ?? []))],
    averageShadowLifetimeMs: average,
    medianShadowLifetimeMs: median,
    safetyCrossingReplaceCount: values.filter((item) => item.repriceReason === 'SAFETY_CROSSING')
      .length,
    safetyInsideSpreadReplaceCount: values.filter(
      (item) => item.repriceReason === 'SAFETY_INSIDE_SPREAD',
    ).length,
    behindFiveTickReplaceCount: values.filter(
      (item) => item.repriceReason === 'CHASE_BEHIND_5_TICKS',
    ).length,
    replacementsPerMinute: durationMs === 0 ? 0 : (replaceCount * 60_000) / durationMs,
    mutationCallsPerMinute:
      durationMs === 0 ? 0 : ((placeCount + replaceCount * 2) * 60_000) / durationMs,
    exactBestCoveragePct:
      deviations.length === 0
        ? 0
        : (deviations.filter((value) => value === 0).length / deviations.length) * 100,
    p95DeviationTicks:
      sortedDeviations.length === 0
        ? 0
        : sortedDeviations[Math.max(0, Math.ceil(sortedDeviations.length * 0.95) - 1)]!,
    maxDeviationTicks: deviations.length === 0 ? 0 : Math.max(...deviations),
    readFailureCount: input.readFailureCount,
    readFailureClasses: Object.freeze(
      (input.readFailures ?? []).reduce<Record<string, number>>((counts, failure) => {
        counts[failure.failureClass] = (counts[failure.failureClass] ?? 0) + 1;
        return counts;
      }, {}),
    ),
    firstReadFailureAt: input.readFailures?.[0]?.timestamp ?? null,
    lastReadFailureAt: input.readFailures?.at(-1)?.timestamp ?? null,
    maxConsecutiveReadFailures: input.maxConsecutiveReadFailures ?? input.readFailureCount,
    failureEvidencePath: input.failureEvidencePath ?? null,
    payloadSchemaFailureCount: values.filter((item) =>
      item.blockers.some((reason) => reason.includes('PAYLOAD')),
    ).length,
    finalBtcPositionBase: values.at(-1)?.btcPositionBase ?? null,
    finalInventoryState: values.at(-1)?.inventoryState ?? null,
    shadowFillCount: 0,
    shadowMakerVolumeUsd: 0,
    mcpMutationCalls: 0,
    venueMutations: 0,
    mainnetShadowRuntimeReady: ready,
  });
}
