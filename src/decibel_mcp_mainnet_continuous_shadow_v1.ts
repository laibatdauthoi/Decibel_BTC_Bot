import { createHash } from 'node:crypto';

import { selectDecibelAuthenticatedFlatEntrySideV1 } from './decibel_authenticated_passive_recycling_flat_entry_v1.js';
import type { decibel_mcp_shadow_snapshot_v1 } from './decibel_mcp_mainnet_shadow_state_v1.js';
import { assertDecibelMcpShadowStateUnchangedV1 } from './decibel_mcp_mainnet_shadow_state_v1.js';
import {
  buildDecibelMcpMainnetShadowOrderV1,
  type decibel_mcp_shadow_order_payload_v1,
} from './decibel_mcp_mainnet_shadow_order_v1.js';

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
  schema: Parameters<typeof buildDecibelMcpMainnetShadowOrderV1>[0]['schema'];
}>;

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
  if (blockers.length > 0) {
    action = 'BLOCKED';
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
  } else if (sameSemanticQuote(input.previousOrder, payload)) {
    action = 'HOLD';
    semanticNoOp = true;
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
    durationMs: input.endedAt - input.startedAt,
    evaluations: values.length,
    readyEvaluations: values.length - blocked.length,
    blockedEvaluations: blocked.length,
    wouldPlaceCount: values.filter((item) => item.action === 'WOULD_PLACE').length,
    wouldCancelCount:
      values.filter((item) => item.action === 'WOULD_CANCEL').length +
      values.filter((item) => item.action === 'WOULD_REPLACE').length,
    wouldReplaceCount: values.filter((item) => item.action === 'WOULD_REPLACE').length,
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
    readFailureCount: input.readFailureCount,
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
