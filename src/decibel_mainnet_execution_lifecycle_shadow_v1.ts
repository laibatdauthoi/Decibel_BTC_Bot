import { createHash } from 'node:crypto';

import { buildDecibelExecutionIntentV1 } from './decibel_execution_intent_v1.js';
import type { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import type {
  decibel_continuous_shadow_config_v1,
  decibel_continuous_shadow_evaluation_v1,
} from './decibel_mcp_mainnet_continuous_shadow_v1.js';
import type { decibel_mcp_shadow_snapshot_v1 } from './decibel_mcp_mainnet_shadow_state_v1.js';

export const DECIBEL_MAINNET_EXECUTION_LIFECYCLE_SHADOW_V1 =
  'DECIBEL_MAINNET_EXECUTION_LIFECYCLE_SHADOW_V1' as const;

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const inventoryState = (position: number) =>
  position > 0
    ? ('LONG_RECYCLE' as const)
    : position < 0
      ? ('SHORT_RECYCLE' as const)
      : ('FLAT' as const);

export type decibel_mainnet_lifecycle_shadow_result_v1 = Readonly<{
  classification:
    | 'MUTATION_BLOCKED_MAINNET_SHADOW'
    | 'IDEMPOTENT_HOLD'
    | 'WOULD_CANCEL'
    | 'WOULD_REPLACE'
    | 'BLOCKED';
  blocker: string | null;
  intentId: string | null;
  intentCreated: boolean;
  executorInvoked: false;
  liveExecutionEnabled: false;
}>;

export function integrateDecibelMainnetExecutionLifecycleShadowV1(input: {
  mode: string;
  journal: decibel_execution_lifecycle_journal_v1;
  evaluation: decibel_continuous_shadow_evaluation_v1;
  initial: decibel_mcp_shadow_snapshot_v1;
  final: decibel_mcp_shadow_snapshot_v1;
  config: decibel_continuous_shadow_config_v1;
  sessionId: string;
  cycleSequence: number;
}): decibel_mainnet_lifecycle_shadow_result_v1 {
  if (input.mode !== 'mainnet-integration-shadow')
    throw new Error('DECIBEL_EXECUTION_MODE_MAINNET_INTEGRATION_SHADOW_REQUIRED');
  const foreignOpenOrderIds = input.final.foreignOrders
    .map((row) => row.order_id ?? row.orderId)
    .filter((value): value is string => typeof value === 'string');
  const stateHash = hash({
    observedAt: input.final.observedAt,
    marketAddress: input.final.btcMarketAddress,
    btcPositionBase: input.final.btcPositionBase,
    btcOpenOrderIds: input.final.btcOpenOrderIds,
    btcFillIds: input.final.btcFillIds,
    foreignOpenOrderIds,
  });
  input.journal.recordMainnetReconciliation({
    timestamp: input.final.observedAt,
    marketAddress: input.final.btcMarketAddress,
    btcPositionBase: input.final.btcPositionBase,
    btcOpenOrderIds: input.final.btcOpenOrderIds,
    btcAuthenticatedFillIds: input.final.btcFillIds,
    foreignOpenOrderIds,
    inventoryState: inventoryState(input.final.btcPositionBase),
    sourceSnapshotHash: stateHash,
  });
  const blocker = input.evaluation.blockers.includes('MCP_SHADOW_STATE_CHANGED')
    ? 'EXECUTION_STATE_CHANGED_BEFORE_INTENT'
    : (input.evaluation.blockers[0] ?? null);
  if (blocker !== null) {
    input.journal.recordBlocker(null, blocker, input.evaluation.timestamp);
    return Object.freeze({
      classification: 'BLOCKED',
      blocker,
      intentId: null,
      intentCreated: false,
      executorInvoked: false,
      liveExecutionEnabled: false,
    });
  }
  if (input.evaluation.action === 'HOLD')
    return Object.freeze({
      classification: 'IDEMPOTENT_HOLD',
      blocker: null,
      intentId: null,
      intentCreated: false,
      executorInvoked: false,
      liveExecutionEnabled: false,
    });
  if (input.evaluation.action === 'WOULD_CANCEL' || input.evaluation.action === 'WOULD_REPLACE')
    return Object.freeze({
      classification: input.evaluation.action,
      blocker: null,
      intentId: null,
      intentCreated: false,
      executorInvoked: false,
      liveExecutionEnabled: false,
    });
  if (input.evaluation.action !== 'WOULD_PLACE' || input.evaluation.mcpPayload === null)
    return Object.freeze({
      classification: 'BLOCKED',
      blocker: 'NO_EXECUTABLE_PLACE',
      intentId: null,
      intentCreated: false,
      executorInvoked: false,
      liveExecutionEnabled: false,
    });
  const payload = input.evaluation.mcpPayload;
  const intent = buildDecibelExecutionIntentV1({
    sessionId: input.sessionId,
    cycleSequence: input.cycleSequence,
    action: 'PLACE',
    market: 'BTC/USD',
    side: payload.side.toUpperCase() as 'BUY' | 'SELL',
    price: payload.price,
    quantity: payload.size,
    tickSize: input.config.tickSize,
    lotSize: input.config.lotSize,
    clientOrderId: payload.clientOrderId,
    knownVenueOrderId: null,
    sourceStateHash: stateHash,
    strategyDecisionHash: input.evaluation.mcpPayloadHash!,
    createdAt: input.evaluation.timestamp,
  });
  const prepared = input.journal.prepare(intent);
  if (!prepared.duplicate)
    input.journal.recordBlocker(
      intent.intentId,
      'MUTATION_BLOCKED_MAINNET_SHADOW',
      input.evaluation.timestamp,
    );
  return Object.freeze({
    classification: prepared.duplicate ? 'IDEMPOTENT_HOLD' : 'MUTATION_BLOCKED_MAINNET_SHADOW',
    blocker: prepared.duplicate ? null : 'MUTATION_BLOCKED_MAINNET_SHADOW',
    intentId: intent.intentId,
    intentCreated: !prepared.duplicate,
    executorInvoked: false,
    liveExecutionEnabled: false,
  });
}
