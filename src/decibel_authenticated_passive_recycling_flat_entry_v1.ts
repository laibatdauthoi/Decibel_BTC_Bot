import { createHash } from 'node:crypto';

import { canonicalizeDecibelAuthenticatedLiveCanarySuccessV1 } from './decibel_authenticated_live_canary_success_freeze_v1.js';
import { calculateDecibelMinimalLiveCanaryBufferedQuantityV1 } from './decibel_minimal_live_canary_v1.js';

export const DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_FLAT_ENTRY_V1 =
  'DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_FLAT_ENTRY_V1' as const;

const hash = (value: unknown) =>
  createHash('sha256')
    .update(canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(value))
    .digest('hex');
const normalizedAddress = (value: string) => value.toLowerCase();

export function selectDecibelAuthenticatedFlatEntrySideV1(input: {
  subaccount: string;
  marketAddress: string;
  resyncCheckpointBodyHash: string;
  cycleSequence: number;
}) {
  if (!Number.isSafeInteger(input.cycleSequence) || input.cycleSequence < 1)
    throw new Error('RECYCLING_FLAT_ENTRY_CYCLE_SEQUENCE_INVALID');
  const seed = [
    'DECIBEL_MARKET_MAKER_V1',
    'AUTHENTICATED_PASSIVE_RECYCLING_FLAT_ENTRY_V1',
    normalizedAddress(input.subaccount),
    normalizedAddress(input.marketAddress),
    input.resyncCheckpointBodyHash.toLowerCase(),
    input.cycleSequence,
  ].join('|');
  const digest = createHash('sha256').update(seed).digest();
  return Object.freeze({
    sideSelectionSeedHash: digest.toString('hex'),
    selectedSide: (digest[31]! & 1) === 0 ? ('BUY' as const) : ('SELL' as const),
  });
}

export function buildDecibelAuthenticatedPassiveRecyclingFlatEntryV1(input: {
  checkpoint: Readonly<{
    checkpointBodyHashSha256: string;
    allAccountFillIds: readonly string[];
    strategyFillIds: readonly string[];
    currentPositionBase: 0;
    strategyMakerVolumeUsd: number;
    cycleDisposition: 'CYCLE_INTERRUPTED_BY_OUT_OF_BAND_ACTIVITY';
  }>;
  state: Readonly<{
    ready: boolean;
    inventoryState: string;
    authenticatedPositionBase: number;
    currentCycleInventoryBase: number;
    positionConservationPassed: boolean;
    blockers: readonly string[];
    btcOpenOrderIds: readonly string[];
    foreignMarketOpenOrderIds: readonly string[];
    resyncCheckpointBodyHash: string | null;
    book: Readonly<{ bestBid: number; bestAsk: number; observedAt: number }>;
  }>;
  unresolvedHandoffCount: number;
  completedCycleCount: number;
  subaccount: string;
  marketAddress: string;
  tickSize: number;
  lotSize: number;
  minimumSize: number;
  authoritativeVenueMinimumNotionalUsd: number;
  configuredMinimumNotionalUsd: number;
  configuredTargetNotionalUsd: number;
  configuredMaximumNotionalUsd: number;
  executionSessionId: string;
  handoffCreatedAt: number;
  maxBookAgeMs: number;
}) {
  const { checkpoint, state } = input;
  if (!state.ready || state.blockers.length > 0)
    throw new Error(state.blockers[0] ?? 'RECYCLING_FLAT_ENTRY_STATE_NOT_READY');
  if (
    checkpoint.currentPositionBase !== 0 ||
    state.authenticatedPositionBase !== 0 ||
    state.currentCycleInventoryBase !== 0 ||
    state.inventoryState !== 'FLAT'
  )
    throw new Error('RECYCLING_FLAT_ENTRY_ZERO_POSITION_REQUIRED');
  if (!state.positionConservationPassed)
    throw new Error('RECYCLING_FLAT_ENTRY_POSITION_CONSERVATION_REQUIRED');
  if (state.resyncCheckpointBodyHash !== checkpoint.checkpointBodyHashSha256)
    throw new Error('RECYCLING_FLAT_ENTRY_RESYNC_CHECKPOINT_MISMATCH');
  if (state.btcOpenOrderIds.length > 0 || state.foreignMarketOpenOrderIds.length > 0)
    throw new Error('RECYCLING_FLAT_ENTRY_OPEN_ORDER_PRESENT');
  if (input.unresolvedHandoffCount !== 0)
    throw new Error('RECYCLING_FLAT_ENTRY_UNRESOLVED_HANDOFF');
  if (
    input.handoffCreatedAt < state.book.observedAt ||
    input.handoffCreatedAt - state.book.observedAt > input.maxBookAgeMs ||
    !(state.book.bestBid > 0) ||
    !(state.book.bestAsk > state.book.bestBid)
  )
    throw new Error('RECYCLING_FLAT_ENTRY_BBO_INVALID_OR_STALE');
  const cycleSequence = input.completedCycleCount + 1;
  const selection = selectDecibelAuthenticatedFlatEntrySideV1({
    subaccount: input.subaccount,
    marketAddress: input.marketAddress,
    resyncCheckpointBodyHash: checkpoint.checkpointBodyHashSha256,
    cycleSequence,
  });
  const price = selection.selectedSide === 'BUY' ? state.book.bestBid : state.book.bestAsk;
  const priceSteps = price / input.tickSize;
  if (
    !(input.tickSize > 0) ||
    !Number.isFinite(priceSteps) ||
    Math.abs(priceSteps - Math.round(priceSteps)) >= 1e-8
  )
    throw new Error('RECYCLING_FLAT_ENTRY_PRICE_NOT_TICK_ALIGNED');
  const sizing = calculateDecibelMinimalLiveCanaryBufferedQuantityV1({
    frozenOrderPrice: price,
    lotSize: input.lotSize,
    metadataMinimumQuantity: input.minimumSize,
    authoritativeVenueMinimumNotionalUsd: input.authoritativeVenueMinimumNotionalUsd,
    configuredMinimumNotionalUsd: input.configuredMinimumNotionalUsd,
    configuredTargetNotionalUsd: input.configuredTargetNotionalUsd,
    configuredMaximumNotionalUsd: input.configuredMaximumNotionalUsd,
  });
  const identitySeed = {
    executionSessionId: input.executionSessionId,
    cycleSequence,
    sideSelectionSeedHash: selection.sideSelectionSeedHash,
    selectedSide: selection.selectedSide,
    resyncCheckpointBodyHash: checkpoint.checkpointBodyHashSha256,
    price,
    quantity: sizing.selectedCanaryQuantity,
    handoffCreatedAt: input.handoffCreatedAt,
  };
  const entryHandoffId = `recycling-flat-entry-${hash(identitySeed).slice(0, 32)}`;
  const plannedClientOrderId = `dpvr1-entry-${selection.selectedSide === 'BUY' ? 'b' : 's'}-${hash([
    entryHandoffId,
    'planned-provenance-only',
  ]).slice(0, 24)}`;
  const body = Object.freeze({
    schemaVersion: DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_FLAT_ENTRY_V1,
    entryHandoffId,
    recyclingHandoffId: entryHandoffId,
    executionState: 'AUTHENTICATED_FLAT_ENTRY' as const,
    executionSessionId: input.executionSessionId,
    strategyIdentity: 'DECIBEL_MARKET_MAKER_V1' as const,
    cycleSequence,
    sideSelectionSeedHash: selection.sideSelectionSeedHash,
    selectedSide: selection.selectedSide,
    side: selection.selectedSide,
    resyncCheckpointBodyHash: checkpoint.checkpointBodyHashSha256,
    sourceAccountFillIds: Object.freeze([...checkpoint.allAccountFillIds]),
    sourceStrategyFillIds: Object.freeze([...checkpoint.strategyFillIds]),
    sourcePositionBase: 0 as const,
    sourceAuthenticatedMakerVolumeUsd: checkpoint.strategyMakerVolumeUsd,
    subaccount: input.subaccount,
    market: 'BTC/USD' as const,
    marketAddress: input.marketAddress,
    freshBestBid: state.book.bestBid,
    freshBestAsk: state.book.bestAsk,
    freshBboObservedAt: state.book.observedAt,
    price,
    quantity: sizing.selectedCanaryQuantity,
    notionalUsd: Number(sizing.selectedCanaryNotionalUsd.toFixed(12)),
    effectiveMinimumNotionalUsd: sizing.effectiveMinimumNotionalUsd,
    effectiveTargetNotionalUsd: sizing.effectiveTargetNotionalUsd,
    maximumNotionalUsd: sizing.maximumNotionalUsd,
    type: 'LIMIT' as const,
    postOnly: true as const,
    plannedClientOrderId,
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
