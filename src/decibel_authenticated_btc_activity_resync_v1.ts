import { createHash } from 'node:crypto';

import { canonicalizeDecibelAuthenticatedLiveCanarySuccessV1 } from './decibel_authenticated_live_canary_success_freeze_v1.js';

export const DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V1 =
  'DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V1' as const;

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

export function validateDecibelAuthenticatedBtcResyncCheckpointV1(value: unknown) {
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
  return checkpoint;
}

const canonicalLot = (value: number, lotSize: number) =>
  Number((Math.round(value / lotSize) * lotSize).toFixed(12));

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
  let accountInventoryBase = 0;
  let strategyMakerVolumeUsd = 0;
  const strategyFillIds: string[] = [];
  const outOfBandFillIds: string[] = [];
  const normalized = ordered.map((fill) => {
    let activityClass: decibel_btc_activity_class_v1;
    if (frozenFillIds.has(fill.tradeId)) activityClass = 'FROZEN_CANARY_STRATEGY_FILL';
    else if (capturedOrderIds.has(fill.orderId)) activityClass = 'CAPTURED_RECYCLING_STRATEGY_FILL';
    else if (fill.transactionLineage !== 'UNPROVEN' && fill.side !== null)
      activityClass = 'AUTHENTICATED_OUT_OF_BAND_ACCOUNT_FILL';
    else activityClass = 'UNPROVEN';
    if (
      fill.side === null ||
      fill.transactionLineage === 'UNPROVEN' ||
      activityClass === 'UNPROVEN'
    )
      blockers.push('BTC_FILL_ATTRIBUTION_INCOMPLETE');
    else accountInventoryBase += fill.side === 'BUY' ? fill.size : -fill.size;
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
    return Object.freeze({ ...fill, activityClass });
  });
  const normalizedAccountInventory = canonicalLot(accountInventoryBase, input.lotSize);
  const normalizedCurrentPosition = canonicalLot(input.currentPositionBase, input.lotSize);
  const positionConservationPassed = normalizedAccountInventory === normalizedCurrentPosition;
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
    checkpoint: ready ? Object.freeze({ ...checkpointBody, checkpointBodyHashSha256 }) : null,
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
