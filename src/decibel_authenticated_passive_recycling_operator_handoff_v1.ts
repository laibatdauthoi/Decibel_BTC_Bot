import { createHash } from 'node:crypto';

import { canonicalizeDecibelAuthenticatedLiveCanarySuccessV1 } from './decibel_authenticated_live_canary_success_freeze_v1.js';
import type { deriveDecibelAuthenticatedPassiveRecyclingLiveStateV1 } from './decibel_authenticated_passive_recycling_live_state_v1.js';

export const DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_OPERATOR_HANDOFF_V1 =
  'DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_OPERATOR_HANDOFF_V1' as const;
type live_state = ReturnType<typeof deriveDecibelAuthenticatedPassiveRecyclingLiveStateV1>;

function hash(value: unknown): string {
  return createHash('sha256')
    .update(canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(value))
    .digest('hex');
}

function sameAccountState(left: live_state, right: live_state): boolean {
  return (
    left.ready === right.ready &&
    left.inventoryState === right.inventoryState &&
    left.authenticatedPositionBase === right.authenticatedPositionBase &&
    JSON.stringify(left.authenticatedFillIds) === JSON.stringify(right.authenticatedFillIds) &&
    left.openOrderSafetyPassed === right.openOrderSafetyPassed &&
    JSON.stringify(left.blockers) === JSON.stringify(right.blockers)
  );
}

export function buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1(input: {
  initialState: live_state;
  finalState: live_state;
  executionSessionId: string;
  sourceManifestBodyHash: string;
  subaccount: string;
  market: 'BTC/USD';
  marketAddress: string;
  handoffCreatedAt: number;
}) {
  if (!sameAccountState(input.initialState, input.finalState))
    throw new Error('RECYCLING_HANDOFF_STATE_CHANGED');
  const state = input.finalState;
  if (!state.ready || state.blockers.length > 0)
    throw new Error(state.blockers[0] ?? 'AUTHENTICATED_RECYCLING_STATE_NOT_READY');
  if (state.inventoryState === 'FLAT') throw new Error('NO_ACTIVE_RECYCLE_INVENTORY');
  if (state.intent === null) throw new Error('RECYCLING_HANDOFF_INTENT_REQUIRED');
  if (
    state.intent.type !== 'LIMIT' ||
    !state.intent.postOnly ||
    state.selfTradePermitted ||
    !state.externalCounterpartyRequired
  )
    throw new Error('RECYCLING_HANDOFF_SAFETY_CONTRACT_FAILED');
  const expectedPrice = state.intent.side === 'SELL' ? state.book.bestAsk : state.book.bestBid;
  if (state.intent.price !== expectedPrice) throw new Error('RECYCLING_HANDOFF_BBO_PRICE_MISMATCH');
  const seed = [
    input.executionSessionId,
    input.sourceManifestBodyHash,
    state.authenticatedFillIds,
    state.authenticatedPositionBase,
    state.inventoryState,
    input.marketAddress,
    state.intent,
    state.book.observedAt,
    input.handoffCreatedAt,
  ] as const;
  const recyclingHandoffId = `recycling-handoff-${hash(seed).slice(0, 32)}`;
  const plannedClientOrderId = `dpvr1-${state.intent.side === 'BUY' ? 'b' : 's'}-${hash([
    recyclingHandoffId,
    'planned-provenance-only',
  ]).slice(0, 32)}`;
  const body = Object.freeze({
    schemaVersion: DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_OPERATOR_HANDOFF_V1,
    recyclingHandoffId,
    executionSessionId: input.executionSessionId,
    strategyIdentity: 'DECIBEL_MARKET_MAKER_V1' as const,
    sourceManifestBodyHash: input.sourceManifestBodyHash,
    sourceAuthenticatedFillIds: Object.freeze([...state.authenticatedFillIds]),
    sourcePositionBase: state.authenticatedPositionBase,
    inventoryState: state.inventoryState,
    plannedClientOrderId,
    market: input.market,
    marketAddress: input.marketAddress,
    subaccount: input.subaccount,
    side: state.intent.side,
    price: state.intent.price,
    quantity: state.intent.quantity,
    notionalUsd: state.intent.notionalUsd,
    type: 'LIMIT' as const,
    postOnly: true as const,
    freshBbo: Object.freeze({ ...state.book }),
    freshBboObservedAt: state.book.observedAt,
    handoffCreatedAt: input.handoffCreatedAt,
    operatorActionRequired: true as const,
    liveExecutionEnabled: false as const,
    venueMutationEnabled: false as const,
    externalCounterpartyRequired: true as const,
    selfTradePermitted: false as const,
    mutationCounters: Object.freeze({
      signedTransactions: 0 as const,
      submittedTransactions: 0 as const,
      placedOrders: 0 as const,
      cancelledOrders: 0 as const,
      replacedOrders: 0 as const,
      venueMutations: 0 as const,
    }),
  });
  return Object.freeze({ ...body, handoffPackageHash: hash(body) });
}
