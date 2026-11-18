import { getDecibelQuantityUnitsV1 } from './decibel_chain_units_v1.js';
import { createHash } from 'node:crypto';

export const DECIBEL_ACTUAL_FILL_TRUTH_V1 = 'DECIBEL_ACTUAL_FILL_TRUTH_V1' as const;

export type decibel_actual_fill_truth_v1 = Readonly<{
  venueFillId: string;
  venueOrderId: string;
  localExecutionRequestId: string;
  marketAddress: string;
  side: 'BUY' | 'SELL';
  executedPrice: number;
  executedBaseQuantity: number;
  executedUsdNotional: number;
  makerOrTaker: 'MAKER' | 'TAKER';
  receivedAt: Date;
  venueTimestamp: Date | null;
  transactionVersion?: string;
  fee: Readonly<{
    availability: 'AVAILABLE' | 'UNAVAILABLE';
    amount: number | null;
    currency: string | null;
  }>;
  rebate: Readonly<{
    availability: 'AVAILABLE' | 'UNAVAILABLE';
    amount: number | null;
    currency: string | null;
  }>;
  /** Venue realized PnL (price PnL plus funding, before fees); null when not reported. */
  venueRealizedPnlUsd?: number | null;
  executionFragments?: readonly Readonly<{
    fragmentId: string;
    quantity: number;
    price: number;
    feeUsd: number | null;
    realizedPnlUsd?: number | null;
  }>[];
  executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM';
}>;

export type decibel_actual_order_truth_v1 = Readonly<{
  venueOrderId: string;
  localIntentId: string;
  localExecutionRequestId: string;
  marketAddress: string;
  side: 'BUY' | 'SELL';
  requestedQuantity: number;
}>;

export type decibel_actual_fill_application_v1 = Readonly<{
  applicationId: string;
  venueFillId: string;
  venueOrderId: string;
  side: 'BUY' | 'SELL';
  appliedAt: Date;
  fillPrice: number;
  fillQuantity: number;
  inventoryBefore: number;
  inventoryAfter: number;
  provenance: 'ACTUAL_EXECUTION';
}>;

export type decibel_actual_volume_cycle_v1 = Readonly<{
  cycleId: string;
  status: 'OPEN' | 'COMPLETED';
  startedAt: Date;
  completedAt: Date | null;
  actualFillIds: readonly string[];
  openingSide: 'BUY' | 'SELL';
  actualExternalMakerVolumeUsd: number;
  peakInventoryAbsBase: number;
  endingInventoryBase: number;
  provenance: 'ACTUAL_EXECUTION';
}>;

export type decibel_actual_fill_ledger_v1 = Readonly<{
  orders: readonly decibel_actual_order_truth_v1[];
  fills: readonly decibel_actual_fill_truth_v1[];
  applications: readonly decibel_actual_fill_application_v1[];
  cycles: readonly decibel_actual_volume_cycle_v1[];
  inventoryBase: number;
  averageEntryPrice: number | null;
  realizedPnlUsd: number;
  actualExternalMakerVolumeUsd: number;
  actualTakerVolumeUsd: number;
}>;

function hash(prefix: string, fields: readonly unknown[]): string {
  return `${prefix}_${createHash('sha256').update(JSON.stringify(fields)).digest('hex')}`;
}

export function createDecibelActualFillLedgerV1(
  orders: readonly decibel_actual_order_truth_v1[],
): decibel_actual_fill_ledger_v1 {
  return Object.freeze({
    orders: Object.freeze([...orders]),
    fills: Object.freeze([]),
    applications: Object.freeze([]),
    cycles: Object.freeze([]),
    inventoryBase: 0,
    averageEntryPrice: null,
    realizedPnlUsd: 0,
    actualExternalMakerVolumeUsd: 0,
    actualTakerVolumeUsd: 0,
  });
}

function sameFill(
  left: decibel_actual_fill_truth_v1,
  right: decibel_actual_fill_truth_v1,
): boolean {
  return (
    left.venueFillId === right.venueFillId &&
    left.venueOrderId === right.venueOrderId &&
    left.localExecutionRequestId === right.localExecutionRequestId &&
    left.marketAddress === right.marketAddress &&
    left.side === right.side &&
    left.executedPrice === right.executedPrice &&
    left.executedBaseQuantity === right.executedBaseQuantity &&
    left.executedUsdNotional === right.executedUsdNotional &&
    left.makerOrTaker === right.makerOrTaker &&
    left.venueTimestamp?.getTime() === right.venueTimestamp?.getTime()
  );
}

export function applyDecibelActualFillTruthV1(
  previous: decibel_actual_fill_ledger_v1,
  fill: decibel_actual_fill_truth_v1,
): decibel_actual_fill_ledger_v1 {
  if (
    !fill.venueFillId ||
    !(fill.executedPrice > 0) ||
    !(fill.executedBaseQuantity > 0) ||
    fill.executedUsdNotional !== fill.executedPrice * fill.executedBaseQuantity
  )
    throw new Error('DECIBEL_ACTUAL_FILL_INVALID');
  const duplicate = previous.fills.find(
    (value) => value.venueFillId === fill.venueFillId && value.venueOrderId === fill.venueOrderId,
  );
  if (duplicate !== undefined) {
    if (!sameFill(duplicate, fill)) throw new Error('DECIBEL_ACTUAL_FILL_ID_CONFLICT');
    return previous;
  }
  const order = previous.orders.find((value) => value.venueOrderId === fill.venueOrderId);
  if (
    order === undefined ||
    order.localExecutionRequestId !== fill.localExecutionRequestId ||
    order.marketAddress !== fill.marketAddress ||
    order.side !== fill.side
  )
    throw new Error('DECIBEL_ACTUAL_FILL_ORDER_LINEAGE_INVALID');
  const alreadyFilled = previous.fills
    .filter((value) => value.venueOrderId === fill.venueOrderId)
    .reduce((sum, value) => sum + getDecibelQuantityUnitsV1(value.executedBaseQuantity), 0n);
  if (
    alreadyFilled + getDecibelQuantityUnitsV1(fill.executedBaseQuantity) >
    getDecibelQuantityUnitsV1(order.requestedQuantity)
  )
    throw new Error('DECIBEL_ACTUAL_FILL_OVERFILLS_ORDER');

  const signedQuantity =
    fill.side === 'BUY' ? fill.executedBaseQuantity : -fill.executedBaseQuantity;
  const before = previous.inventoryBase;
  const beforeUnits = getDecibelQuantityUnitsV1(Math.abs(before)) * (before < 0 ? -1n : 1n);
  const signedUnits =
    getDecibelQuantityUnitsV1(fill.executedBaseQuantity) * (fill.side === 'BUY' ? 1n : -1n);
  const after = Number(beforeUnits + signedUnits) / 1e8;
  let averageEntryPrice = previous.averageEntryPrice;
  let realizedPnlUsd = previous.realizedPnlUsd;
  if (before === 0 || Math.sign(before) === Math.sign(signedQuantity)) {
    averageEntryPrice =
      (Math.abs(before) * (averageEntryPrice ?? fill.executedPrice) +
        fill.executedBaseQuantity * fill.executedPrice) /
      Math.abs(after);
  } else {
    const closed = Math.min(Math.abs(before), fill.executedBaseQuantity);
    realizedPnlUsd +=
      closed * (fill.executedPrice - (averageEntryPrice ?? fill.executedPrice)) * Math.sign(before);
    if (after === 0) averageEntryPrice = null;
    else if (Math.sign(after) !== Math.sign(before)) averageEntryPrice = fill.executedPrice;
  }
  const application = Object.freeze({
    applicationId: hash('decibel_actual_fill_application', [fill.venueOrderId, fill.venueFillId]),
    venueFillId: fill.venueFillId,
    venueOrderId: fill.venueOrderId,
    side: fill.side,
    appliedAt: new Date(fill.receivedAt),
    fillPrice: fill.executedPrice,
    fillQuantity: fill.executedBaseQuantity,
    inventoryBefore: before,
    inventoryAfter: after,
    provenance: 'ACTUAL_EXECUTION' as const,
  });
  const cycles = previous.cycles.map((cycle) => ({
    ...cycle,
    startedAt: new Date(cycle.startedAt),
    completedAt: cycle.completedAt === null ? null : new Date(cycle.completedAt),
    actualFillIds: [...cycle.actualFillIds],
  }));
  if (fill.makerOrTaker === 'MAKER') {
    let open: (typeof cycles)[number] | undefined;
    for (let index = cycles.length - 1; index >= 0; index -= 1) {
      if (cycles[index]?.status === 'OPEN') {
        open = cycles[index];
        break;
      }
    }
    if (open === undefined || before === 0) {
      open = {
        cycleId: hash('decibel_actual_volume_cycle', [fill.venueFillId]),
        status: after === 0 ? 'COMPLETED' : 'OPEN',
        startedAt: new Date(fill.receivedAt),
        completedAt: after === 0 ? new Date(fill.receivedAt) : null,
        actualFillIds: [fill.venueFillId],
        openingSide: fill.side,
        actualExternalMakerVolumeUsd: fill.executedUsdNotional,
        peakInventoryAbsBase: Math.max(Math.abs(before), Math.abs(after)),
        endingInventoryBase: after,
        provenance: 'ACTUAL_EXECUTION',
      };
      cycles.push(open);
    } else {
      open.actualFillIds.push(fill.venueFillId);
      open.actualExternalMakerVolumeUsd += fill.executedUsdNotional;
      open.peakInventoryAbsBase = Math.max(open.peakInventoryAbsBase, Math.abs(after));
      open.endingInventoryBase = after;
      if (after === 0) {
        open.status = 'COMPLETED';
        open.completedAt = new Date(fill.receivedAt);
      }
    }
  }
  return Object.freeze({
    orders: previous.orders,
    fills: Object.freeze([...previous.fills, Object.freeze(fill)]),
    applications: Object.freeze([...previous.applications, application]),
    cycles: Object.freeze(
      cycles.map((cycle) =>
        Object.freeze({ ...cycle, actualFillIds: Object.freeze(cycle.actualFillIds) }),
      ),
    ),
    inventoryBase: after,
    averageEntryPrice,
    realizedPnlUsd,
    actualExternalMakerVolumeUsd:
      previous.actualExternalMakerVolumeUsd +
      (fill.makerOrTaker === 'MAKER' ? fill.executedUsdNotional : 0),
    actualTakerVolumeUsd:
      previous.actualTakerVolumeUsd +
      (fill.makerOrTaker === 'TAKER' ? fill.executedUsdNotional : 0),
  });
}
