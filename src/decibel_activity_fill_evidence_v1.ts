import type { decibel_actual_fill_ledger_v1 } from './decibel_actual_fill_truth_v1.js';
import type { activity_history_v1 } from './decibel_activity_history_schema_v1.js';

export type activity_intent_evidence_v1 = Readonly<{
  clientOrderId?: string;
  market?: string;
  venueOrderId?: string;
  reduceOnly?: boolean;
}>;
export type activity_ledger_evidence_v1 = Pick<
  decibel_actual_fill_ledger_v1,
  'fills' | 'applications'
> &
  Partial<Pick<decibel_actual_fill_ledger_v1, 'orders'>>;

/** Only project authenticated amounts and position transitions; never allocate session totals. */
export function enrichDecibelActivityFillV1(
  row: activity_history_v1['fills'][number],
  intent: activity_intent_evidence_v1,
  ledger?: activity_ledger_evidence_v1,
): activity_history_v1['fills'][number] {
  const result = {
    ...row,
    feeUsd: null as number | null,
    pnlAtCloseUsd: null as number | null,
    closePnlAvailability: 'UNKNOWN' as 'UNKNOWN' | 'N/A' | 'VERIFIED',
    direction: null as 'Open Long' | 'Open Short' | 'Close Long' | 'Close Short' | null,
  };
  if (intent.reduceOnly === true && row.side !== 'UNKNOWN')
    result.direction = row.side === 'SELL' ? 'Close Long' : 'Close Short';
  if (!ledger || !intent.clientOrderId || !intent.market) return result;
  let key: unknown;
  try {
    key = JSON.parse(row.fillId);
  } catch {
    key = null;
  }
  const identity =
    Array.isArray(key) &&
    (key.length === 2 || key.length === 3) &&
    key.every((value: unknown) => typeof value === 'string')
      ? key
      : null;
  const orderId = identity?.[0] ?? intent.venueOrderId;
  const fillId = identity?.[1] ?? row.fillId;
  if (!orderId) return result;
  const candidates = ledger.fills.filter(
    (fill) =>
      fill.executionProvenance === 'AUTHENTICATED_OWN_FILL_STREAM' &&
      fill.venueOrderId === orderId &&
      fill.venueFillId === fillId &&
      fill.localExecutionRequestId === intent.clientOrderId &&
      (fill.marketAddress === intent.market ||
        (intent.market === 'BTC/USD' &&
          ledger.orders?.some(
            (order) =>
              order.venueOrderId === fill.venueOrderId &&
              order.localExecutionRequestId === intent.clientOrderId &&
              order.marketAddress === fill.marketAddress &&
              order.side === fill.side,
          ))) &&
      fill.side === row.side,
  );
  if (candidates.length !== 1) return result;
  const fill = candidates[0]!;
  const fragments =
    identity?.length === 3
      ? fill.executionFragments?.filter((fragment) => fragment.fragmentId === identity[2])
      : undefined;
  const fragment = fragments?.length === 1 ? fragments[0] : undefined;
  if (identity?.length === 3 && !fragment) return result;
  const quantity = fragment?.quantity ?? fill.executedBaseQuantity;
  const price = fragment?.price ?? fill.executedPrice;
  if (Math.abs(quantity - row.quantity) > 1e-12 || Math.abs(price - row.price) > 1e-8)
    return result;
  const fee = fragment
    ? fragment.feeUsd
    : fill.fee.availability === 'AVAILABLE' && fill.fee.currency === 'USD'
      ? fill.fee.amount
      : null;
  if (fee !== null && Number.isFinite(fee)) result.feeUsd = fee;
  const applications = ledger.applications.filter(
    (application) =>
      application.provenance === 'ACTUAL_EXECUTION' &&
      application.venueOrderId === orderId &&
      application.venueFillId === fillId &&
      application.side === row.side &&
      Math.abs(application.fillQuantity - fill.executedBaseQuantity) <= 1e-12 &&
      Math.abs(application.fillPrice - fill.executedPrice) <= 1e-8,
  );
  if (applications.length !== 1) return result;
  const application = applications[0]!;
  const before = application.inventoryBefore;
  const after = application.inventoryAfter;
  const signed = fill.executedBaseQuantity * (row.side === 'BUY' ? 1 : -1);
  if (
    !Number.isFinite(before) ||
    !Number.isFinite(after) ||
    Math.abs(after - before - signed) > 1e-12
  )
    return result;
  if (before === 0 || Math.sign(before) === Math.sign(signed)) {
    result.direction = row.side === 'BUY' ? 'Open Long' : 'Open Short';
    result.closePnlAvailability = 'N/A';
  } else if (fill.executedBaseQuantity <= Math.abs(before) + 1e-12) {
    result.direction = row.side === 'BUY' ? 'Close Short' : 'Close Long';
    // The venue's realized PnL of this exact fill (or fragment): price PnL plus funding,
    // before fees. Never derived or allocated from session totals.
    const realized = identity?.length === 3 ? fragment?.realizedPnlUsd : fill.venueRealizedPnlUsd;
    if (typeof realized === 'number' && Number.isFinite(realized)) {
      result.pnlAtCloseUsd = realized;
      result.closePnlAvailability = 'VERIFIED';
    }
  }
  return result;
}
