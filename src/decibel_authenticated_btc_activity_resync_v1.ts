import { createHash } from 'node:crypto';

import { canonicalizeDecibelAuthenticatedLiveCanarySuccessV1 } from './decibel_authenticated_live_canary_success_freeze_v1.js';

export const DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V1 =
  'DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V1' as const;
export const DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V2 =
  'DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V2' as const;

export type decibel_authenticated_btc_resync_checkpoint_v1 = Readonly<{
  schemaVersion: typeof DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V1;
  priorFrozenManifestBodyHash: string;
  allAccountFillIds: readonly string[];
  strategyFillIds: readonly string[];
  outOfBandFillIds: readonly string[];
  currentPositionBase: 0;
  cycleDisposition: 'CYCLE_INTERRUPTED_BY_OUT_OF_BAND_ACTIVITY' | 'CYCLE_NOT_INTERRUPTED';
  completedRecycleCycles: 0;
  strategyMakerVolumeUsd: number;
  resyncTimestamp: number;
  sourceHashes: Readonly<Record<string, string>>;
  liveExecutionEnabled: false;
  venueMutationEnabled: false;
  checkpointBodyHashSha256: string;
}>;

export type decibel_authenticated_btc_resync_checkpoint_v2 = Readonly<{
  schemaVersion: typeof DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V2;
  checkpointSequence: number;
  previousCheckpointBodyHashSha256: string;
  newlyAttributedFillIds: readonly string[];
  priorFrozenManifestBodyHash: string;
  allAccountFillIds: readonly string[];
  strategyFillIds: readonly string[];
  outOfBandFillIds: readonly string[];
  currentPositionBase: 0;
  cycleDisposition: 'CYCLE_INTERRUPTED_BY_OUT_OF_BAND_ACTIVITY';
  completedRecycleCycles: 0;
  strategyMakerVolumeUsd: number;
  resyncTimestamp: number;
  sourceHashes: Readonly<Record<string, string>>;
  liveExecutionEnabled: false;
  venueMutationEnabled: false;
  checkpointBodyHashSha256: string;
}>;

export type decibel_authenticated_btc_resync_checkpoint =
  decibel_authenticated_btc_resync_checkpoint_v1 | decibel_authenticated_btc_resync_checkpoint_v2;

export type decibel_btc_activity_class_v1 =
  | 'FROZEN_CANARY_STRATEGY_FILL'
  | 'CAPTURED_RECYCLING_STRATEGY_FILL'
  | 'AUTHENTICATED_OUT_OF_BAND_ACCOUNT_FILL'
  | 'UNPROVEN';

export type decibel_btc_attributed_fill_v1 = Readonly<{
  tradeId: string;
  orderId: string;
  clientOrderId: string | null;
  marketAddress: string;
  side: 'BUY' | 'SELL' | null;
  size: number;
  price: number;
  transactionVersion: number;
  transactionHash: string | null;
  entryFunction: string | null;
  transactionLineage: 'PROVEN_OPERATOR_PLACEMENT' | 'PROVEN_NON_PLACEMENT' | 'UNPROVEN';
  orderType: string | null;
  timeInForce: number | null;
  postOnly: boolean | null;
  fee: number;
  rebate: number;
  makerStatus: 'PROVEN' | 'UNPROVEN';
  activityClass: decibel_btc_activity_class_v1;
}>;

export function validateDecibelAuthenticatedBtcResyncCheckpointV1(
  value: unknown,
): decibel_authenticated_btc_resync_checkpoint_v1 {
  if (value === null || typeof value !== 'object') throw new Error('BTC_RESYNC_CHECKPOINT_INVALID');
  const checkpoint = value as Record<string, unknown>;
  if (
    checkpoint.schemaVersion !== DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V1 ||
    typeof checkpoint.checkpointBodyHashSha256 !== 'string' ||
    !Array.isArray(checkpoint.allAccountFillIds) ||
    !Array.isArray(checkpoint.outOfBandFillIds) ||
    checkpoint.currentPositionBase !== 0 ||
    checkpoint.cycleDisposition !== 'CYCLE_INTERRUPTED_BY_OUT_OF_BAND_ACTIVITY' ||
    checkpoint.liveExecutionEnabled !== false ||
    checkpoint.venueMutationEnabled !== false
  )
    throw new Error('BTC_RESYNC_CHECKPOINT_INVALID');
  const { checkpointBodyHashSha256, ...body } = checkpoint;
  const expected = createHash('sha256')
    .update(canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(body))
    .digest('hex');
  if (expected !== checkpointBodyHashSha256) throw new Error('BTC_RESYNC_CHECKPOINT_HASH_MISMATCH');
  return checkpoint as unknown as decibel_authenticated_btc_resync_checkpoint_v1;
}

function validateCheckpointCommon(checkpoint: Record<string, unknown>): void {
  if (
    typeof checkpoint.checkpointBodyHashSha256 !== 'string' ||
    typeof checkpoint.priorFrozenManifestBodyHash !== 'string' ||
    !Array.isArray(checkpoint.allAccountFillIds) ||
    checkpoint.allAccountFillIds.some((fillId) => typeof fillId !== 'string') ||
    !Array.isArray(checkpoint.strategyFillIds) ||
    !Array.isArray(checkpoint.outOfBandFillIds) ||
    checkpoint.currentPositionBase !== 0 ||
    checkpoint.cycleDisposition !== 'CYCLE_INTERRUPTED_BY_OUT_OF_BAND_ACTIVITY' ||
    checkpoint.completedRecycleCycles !== 0 ||
    checkpoint.liveExecutionEnabled !== false ||
    checkpoint.venueMutationEnabled !== false
  )
    throw new Error('BTC_RESYNC_CHECKPOINT_INVALID');
  const { checkpointBodyHashSha256, ...body } = checkpoint;
  const expected = createHash('sha256')
    .update(canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(body))
    .digest('hex');
  if (expected !== checkpointBodyHashSha256) throw new Error('BTC_RESYNC_CHECKPOINT_HASH_MISMATCH');
}

export function validateDecibelAuthenticatedBtcResyncCheckpointV2(
  value: unknown,
  previous: decibel_authenticated_btc_resync_checkpoint,
): decibel_authenticated_btc_resync_checkpoint_v2 {
  if (value === null || typeof value !== 'object') throw new Error('BTC_RESYNC_CHECKPOINT_INVALID');
  const checkpoint = value as Record<string, unknown>;
  validateCheckpointCommon(checkpoint);
  const previousSequence =
    previous.schemaVersion === DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V1
      ? 1
      : previous.checkpointSequence;
  if (
    checkpoint.schemaVersion !== DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V2 ||
    !Number.isSafeInteger(checkpoint.checkpointSequence) ||
    checkpoint.checkpointSequence !== previousSequence + 1 ||
    checkpoint.previousCheckpointBodyHashSha256 !== previous.checkpointBodyHashSha256 ||
    checkpoint.priorFrozenManifestBodyHash !== previous.priorFrozenManifestBodyHash ||
    !Array.isArray(checkpoint.newlyAttributedFillIds) ||
    checkpoint.newlyAttributedFillIds.some((fillId) => typeof fillId !== 'string')
  )
    throw new Error('BTC_RESYNC_CHECKPOINT_CHAIN_INVALID');
  const previousIds = new Set(previous.allAccountFillIds);
  const currentIds = checkpoint.allAccountFillIds as string[];
  if (previous.allAccountFillIds.some((fillId) => !currentIds.includes(fillId)))
    throw new Error('BTC_RESYNC_CHECKPOINT_CHAIN_REMOVED_FILL');
  const added = currentIds.filter((fillId) => !previousIds.has(fillId));
  if (
    added.length === 0 ||
    JSON.stringify(added) !== JSON.stringify(checkpoint.newlyAttributedFillIds)
  )
    throw new Error('BTC_RESYNC_CHECKPOINT_CHAIN_NEW_FILL_MISMATCH');
  return checkpoint as unknown as decibel_authenticated_btc_resync_checkpoint_v2;
}

export function createDecibelAuthenticatedBtcResyncCheckpointRolloverV2(input: {
  previous: decibel_authenticated_btc_resync_checkpoint;
  next: decibel_authenticated_btc_resync_checkpoint_v1;
  checkpointSequence: number;
}): decibel_authenticated_btc_resync_checkpoint_v2 {
  const previousIds = new Set(input.previous.allAccountFillIds);
  if (
    input.next.priorFrozenManifestBodyHash !== input.previous.priorFrozenManifestBodyHash ||
    input.next.cycleDisposition !== 'CYCLE_INTERRUPTED_BY_OUT_OF_BAND_ACTIVITY' ||
    input.previous.allAccountFillIds.some(
      (fillId) => !input.next.allAccountFillIds.includes(fillId),
    )
  )
    throw new Error('BTC_RESYNC_CHECKPOINT_IDENTITY_CONFLICT');
  const newlyAttributedFillIds = input.next.allAccountFillIds.filter(
    (fillId) => !previousIds.has(fillId),
  );
  if (newlyAttributedFillIds.length === 0) throw new Error('BTC_RESYNC_CHECKPOINT_ROLLOVER_EMPTY');
  const nextBody = { ...input.next } as Record<string, unknown>;
  delete nextBody.checkpointBodyHashSha256;
  delete nextBody.schemaVersion;
  const body = Object.freeze({
    schemaVersion: DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V2,
    checkpointSequence: input.checkpointSequence,
    previousCheckpointBodyHashSha256: input.previous.checkpointBodyHashSha256,
    newlyAttributedFillIds: Object.freeze(newlyAttributedFillIds),
    ...nextBody,
  });
  const checkpointBodyHashSha256 = createHash('sha256')
    .update(canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(body))
    .digest('hex');
  return validateDecibelAuthenticatedBtcResyncCheckpointV2(
    Object.freeze({ ...body, checkpointBodyHashSha256 }),
    input.previous,
  );
}

const canonicalLot = (value: number, lotSize: number) =>
  Number((Math.round(value / lotSize) * lotSize).toFixed(12));

function getExactLotUnits(value: number, lotSize: number): number | null {
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(lotSize) || lotSize <= 0)
    return null;
  const units = Math.round(value / lotSize);
  const tolerance = Math.max(1e-12, lotSize * 1e-9);
  return Math.abs(value - units * lotSize) <= tolerance ? units : null;
}

function isAuthenticatedConservingPairV1(input: {
  fill: decibel_btc_attributed_fill_v1;
  ordered: readonly decibel_btc_attributed_fill_v1[];
  lotSize: number;
}): decibel_btc_attributed_fill_v1 | null {
  const fill = input.fill;
  const fillLots = getExactLotUnits(fill.size, input.lotSize);
  if (
    fill.transactionLineage !== 'UNPROVEN' ||
    fill.side === null ||
    fillLots === null ||
    fillLots === 0 ||
    fill.transactionHash === null ||
    !Number.isSafeInteger(fill.transactionVersion) ||
    !Number.isFinite(fill.price) ||
    fill.price <= 0
  )
    return null;
  const fillIndex = input.ordered.indexOf(fill);
  if (fillIndex < 0) return null;
  const matches = input.ordered.filter((candidate) => {
    if (
      input.ordered.indexOf(candidate) !== fillIndex + 1 ||
      candidate.tradeId === fill.tradeId ||
      candidate.side === null ||
      candidate.side === fill.side ||
      candidate.transactionLineage === 'UNPROVEN' ||
      candidate.transactionVersion <= fill.transactionVersion ||
      candidate.transactionHash === null ||
      candidate.marketAddress.toLowerCase() !== fill.marketAddress.toLowerCase()
    )
      return false;
    return getExactLotUnits(candidate.size, input.lotSize) === fillLots;
  });
  return matches.length === 1 ? matches[0]! : null;
}

export function deriveDecibelAuthenticatedBtcActivityResyncV1(input: {
  priorFrozenManifestBodyHash: string;
  frozenFillIds: readonly string[];
  capturedRecyclingOrderIds: readonly string[];
  fills: readonly decibel_btc_attributed_fill_v1[];
  currentPositionBase: number;
  lotSize: number;
  btcOpenOrderCount: number;
  activeBtcTwapCount: number;
  activeBtcTpSlCount: number;
  activeBtcBulkOrderCount: number;
  resyncTimestamp: number;
  sourceHashes: Readonly<Record<string, string>>;
}) {
  const frozenFillIds = new Set(input.frozenFillIds);
  const capturedOrderIds = new Set(input.capturedRecyclingOrderIds);
  const ordered = [...input.fills].sort(
    (left, right) =>
      left.transactionVersion - right.transactionVersion ||
      left.tradeId.localeCompare(right.tradeId),
  );
  const blockers: string[] = [];
  let accountInventoryLotUnits = 0;
  let strategyMakerVolumeUsd = 0;
  const strategyFillIds: string[] = [];
  const outOfBandFillIds: string[] = [];
  const normalized = ordered.map((fill) => {
    let activityClass: decibel_btc_activity_class_v1;
    const conservingPair = isAuthenticatedConservingPairV1({
      fill,
      ordered,
      lotSize: input.lotSize,
    });
    if (frozenFillIds.has(fill.tradeId)) activityClass = 'FROZEN_CANARY_STRATEGY_FILL';
    else if (capturedOrderIds.has(fill.orderId)) activityClass = 'CAPTURED_RECYCLING_STRATEGY_FILL';
    else if (fill.transactionLineage !== 'UNPROVEN' && fill.side !== null)
      activityClass = 'AUTHENTICATED_OUT_OF_BAND_ACCOUNT_FILL';
    else if (conservingPair !== null) activityClass = 'AUTHENTICATED_OUT_OF_BAND_ACCOUNT_FILL';
    else activityClass = 'UNPROVEN';
    const fillLotUnits = getExactLotUnits(fill.size, input.lotSize);
    if (fill.side === null || activityClass === 'UNPROVEN')
      blockers.push('BTC_FILL_ATTRIBUTION_INCOMPLETE');
    else if (fillLotUnits === null) blockers.push('BTC_FILL_LOT_ALIGNMENT_INVALID');
    else accountInventoryLotUnits += fill.side === 'BUY' ? fillLotUnits : -fillLotUnits;
    if (
      (activityClass === 'FROZEN_CANARY_STRATEGY_FILL' ||
        activityClass === 'CAPTURED_RECYCLING_STRATEGY_FILL') &&
      fill.makerStatus === 'PROVEN'
    ) {
      strategyFillIds.push(fill.tradeId);
      strategyMakerVolumeUsd += fill.size * fill.price;
    } else if (activityClass === 'AUTHENTICATED_OUT_OF_BAND_ACCOUNT_FILL') {
      outOfBandFillIds.push(fill.tradeId);
    }
    return Object.freeze({
      ...fill,
      activityClass,
      attributionBasis:
        conservingPair === null
          ? ('DIRECT_LINEAGE' as const)
          : ('AUTHENTICATED_CONSERVING_OPPOSITE_FILL_PAIR' as const),
      pairedFillTradeId: conservingPair?.tradeId ?? null,
    });
  });
  const currentPositionLotUnits = getExactLotUnits(
    Math.abs(input.currentPositionBase),
    input.lotSize,
  );
  if (currentPositionLotUnits === null) blockers.push('BTC_POSITION_LOT_ALIGNMENT_INVALID');
  const signedCurrentPositionLotUnits =
    currentPositionLotUnits === null
      ? null
      : input.currentPositionBase < 0
        ? -currentPositionLotUnits
        : currentPositionLotUnits;
  const normalizedAccountInventory = canonicalLot(
    accountInventoryLotUnits * input.lotSize,
    input.lotSize,
  );
  const normalizedCurrentPosition = canonicalLot(input.currentPositionBase, input.lotSize);
  const positionConservationPassed =
    signedCurrentPositionLotUnits !== null &&
    accountInventoryLotUnits === signedCurrentPositionLotUnits;
  if (!positionConservationPassed) blockers.push('BTC_ACCOUNT_POSITION_CONSERVATION_FAILED');
  if (normalizedCurrentPosition !== 0) blockers.push('BTC_RESYNC_POSITION_NOT_ZERO');
  if (input.btcOpenOrderCount !== 0) blockers.push('BTC_RESYNC_OPEN_ORDER_PRESENT');
  if (input.activeBtcTwapCount !== 0) blockers.push('BTC_RESYNC_ACTIVE_TWAP');
  if (input.activeBtcTpSlCount !== 0) blockers.push('BTC_RESYNC_ACTIVE_TP_SL');
  if (input.activeBtcBulkOrderCount !== 0) blockers.push('BTC_RESYNC_ACTIVE_BULK_ORDER');
  const cycleDisposition =
    outOfBandFillIds.length > 0
      ? ('CYCLE_INTERRUPTED_BY_OUT_OF_BAND_ACTIVITY' as const)
      : ('CYCLE_NOT_INTERRUPTED' as const);
  const ready = blockers.length === 0;
  const checkpointBody = Object.freeze({
    schemaVersion: DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V1,
    priorFrozenManifestBodyHash: input.priorFrozenManifestBodyHash,
    allAccountFillIds: Object.freeze(normalized.map((fill) => fill.tradeId)),
    strategyFillIds: Object.freeze(strategyFillIds),
    outOfBandFillIds: Object.freeze(outOfBandFillIds),
    currentPositionBase: normalizedCurrentPosition,
    cycleDisposition,
    completedRecycleCycles: 0 as const,
    strategyMakerVolumeUsd: Number(strategyMakerVolumeUsd.toFixed(12)),
    resyncTimestamp: input.resyncTimestamp,
    sourceHashes: Object.freeze({ ...input.sourceHashes }),
    liveExecutionEnabled: false as const,
    venueMutationEnabled: false as const,
  });
  const checkpointBodyHashSha256 = createHash('sha256')
    .update(canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(checkpointBody))
    .digest('hex');
  return Object.freeze({
    ready,
    fills: Object.freeze(normalized),
    accountInventoryBase: normalizedAccountInventory,
    currentPositionBase: normalizedCurrentPosition,
    positionConservationPassed,
    strategyMakerVolumeUsd: checkpointBody.strategyMakerVolumeUsd,
    strategyFillIds: checkpointBody.strategyFillIds,
    outOfBandFillIds: checkpointBody.outOfBandFillIds,
    cycleDisposition,
    blockers: Object.freeze([...new Set(blockers)]),
    checkpoint: ready
      ? (Object.freeze({
          ...checkpointBody,
          checkpointBodyHashSha256,
        }) as decibel_authenticated_btc_resync_checkpoint_v1)
      : null,
    mutationCounters: Object.freeze({
      signedTransactions: 0 as const,
      submittedTransactions: 0 as const,
      placedOrders: 0 as const,
      cancelledOrders: 0 as const,
      replacedOrders: 0 as const,
      venueMutations: 0 as const,
    }),
  });
}
