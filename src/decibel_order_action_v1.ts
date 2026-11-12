import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_orchestrator_v1.js';
import {
  assessDecibelExitEconomicsV1,
  assessDecibelAdaptiveTPV1,
} from './decibel_exit_economics_v1.js';
export type decibel_order_action_class_v1 =
  | 'ENTRY'
  | 'DCA'
  | 'TP_COVERAGE_REPAIR'
  | 'TP_PRICE_REPRICE'
  | 'DEFENSIVE_RISK_REDUCTION'
  | 'CANCEL'
  | 'RECONCILIATION';

/** Only explicit, correctly directed and position-bounded reduce-only orders
 * avoid incremental opening collateral. Missing metadata stays conservative. */
export function isDecibelPositionReductionV1(
  position: number,
  order: Readonly<{ side?: 'BUY' | 'SELL'; quantity: number; reduceOnly?: boolean }>,
): boolean {
  return (
    order.reduceOnly === true &&
    Number.isFinite(position) &&
    Number.isFinite(order.quantity) &&
    order.quantity > 0 &&
    order.quantity <= Math.abs(position) + 1e-12 &&
    ((position > 0 && order.side === 'SELL') || (position < 0 && order.side === 'BUY'))
  );
}
/** An already authorized TP price; never permission to change its price or increase exposure. */
export type decibel_coverage_price_authorization_v1 = Readonly<{
  sessionId: string;
  side: 'BUY' | 'SELL';
  price: number;
  venueOrderId: string;
  clientOrderId: string;
}>;
export function getDecibelRestingCoveragePriceV1(
  snapshot: decibel_production_live_snapshot_v1,
  side: 'BUY' | 'SELL',
): decibel_coverage_price_authorization_v1 | null {
  const orders = snapshot.input.openOrders.filter(
    (order) =>
      order.side === side &&
      order.market === snapshot.input.market &&
      order.strategyConfigId === snapshot.input.strategyConfigId &&
      order.venueOrderId.length > 0 &&
      order.clientOrderId.length > 0 &&
      Number.isFinite(order.price) &&
      order.price > 0 &&
      order.reduceOnly === true &&
      order.quantity > 0 &&
      order.quantity < Math.abs(snapshot.input.actualInventoryBase) &&
      ((side === 'SELL' && snapshot.input.actualInventoryBase > 0) ||
        (side === 'BUY' && snapshot.input.actualInventoryBase < 0)),
  );
  if (orders.length !== 1) return null;
  const order = orders[0]!;
  return Object.freeze({
    sessionId: snapshot.input.sessionId,
    side,
    price: order.price,
    venueOrderId: order.venueOrderId,
    clientOrderId: order.clientOrderId,
  });
}
export function classifyDecibelOrderActionV1(
  input: Readonly<{
    action: string;
    position: number;
    side: 'BUY' | 'SELL';
    quantity: number;
    reduceOnly: boolean;
    defensive?: boolean;
    reason?: string;
  }>,
): decibel_order_action_class_v1 {
  if (input.action === 'CANCEL' || input.action === 'WOULD_CANCEL') return 'CANCEL';
  if (input.action === 'NO_OP' || input.action === 'BLOCKED') return 'RECONCILIATION';
  const reducing =
    input.reduceOnly &&
    input.quantity > 0 &&
    input.quantity <= Math.abs(input.position) + 1e-12 &&
    ((input.position > 0 && input.side === 'SELL') || (input.position < 0 && input.side === 'BUY'));
  if (reducing)
    return input.defensive
      ? 'DEFENSIVE_RISK_REDUCTION'
      : /TP_PRICE|REPRICE:TP/.test(input.reason ?? '')
        ? 'TP_PRICE_REPRICE'
        : 'TP_COVERAGE_REPAIR';
  return input.position === 0 ? 'ENTRY' : 'DCA';
}
export function getDecibelReductionOrderLimitV1(
  snapshot: decibel_production_live_snapshot_v1,
  price: number,
): number {
  const capacity = snapshot.reductionCapacity;
  if (!capacity) return snapshot.maximumReductionNotionalUsd ?? snapshot.maximumNotionalUsd;
  const accountAt =
    snapshot.venueReadWindow?.account.startedAt ??
    snapshot.practicalCapacityInputs?.accountObservedAt ??
    snapshot.input.now;
  if (capacity.observedAt !== accountAt) throw new Error('REDUCTION_CAPACITY_BATCH_MISMATCH');
  if (
    capacity.venueMaximumOrderNotionalUsd !== null &&
    (!Number.isFinite(capacity.venueMaximumOrderNotionalUsd) ||
      capacity.venueMaximumOrderNotionalUsd < 0)
  )
    throw new Error('REDUCTION_VENUE_LIMIT_UNVERIFIED');
  if (
    capacity.maximumQuantityBtc !== Math.abs(snapshot.input.actualInventoryBase) ||
    !Number.isFinite(price) ||
    price <= 0
  )
    throw new Error('REDUCTION_CAPACITY_POSITION_MISMATCH');
  return Math.min(
    capacity.maximumQuantityBtc * price,
    capacity.venueMaximumOrderNotionalUsd ?? capacity.maximumQuantityBtc * price,
  );
}
export function assessDecibelTPActionV1(
  snapshot: decibel_production_live_snapshot_v1,
  side: 'BUY' | 'SELL',
  quantity: number,
  price: number,
  coveragePrice?: decibel_coverage_price_authorization_v1 | null,
): string | null {
  const economics = assessDecibelExitEconomicsV1(snapshot, side, quantity, price);
  if (economics.blockers.length) return `TP_EVIDENCE_REQUIRED:${economics.blockers.join(',')}`;
  // Existing policy permits quantity-only repair at the authenticated resting TP
  // price. Preserve that authorization across cancellation/restart, while still
  // requiring the same fresh position, fees, basis and quantity evidence above.
  if (
    coveragePrice?.sessionId === snapshot.input.sessionId &&
    coveragePrice.side === side &&
    coveragePrice.venueOrderId.length > 0 &&
    coveragePrice.clientOrderId.length > 0 &&
    Math.round(coveragePrice.price / snapshot.input.metadata.tickSize) ===
      Math.round(price / snapshot.input.metadata.tickSize)
  )
    return null;
  if (economics.netPnlUsd !== null && economics.netPnlUsd < economics.requiredNetProfitUsd) {
    const adaptive = assessDecibelAdaptiveTPV1(snapshot, side, price);
    if (adaptive.allowed) return null;
    if (adaptive.mode === 'ADVERSE_EXIT_REPRICE') return adaptive.reason;
  }
  if (economics.netPnlUsd === null || economics.netPnlUsd < economics.requiredNetProfitUsd)
    return `TP_NET_PROFIT_NOT_POSITIVE:NET=${economics.netPnlUsd}:REQUIRED=${economics.requiredNetProfitUsd}:BASIS=${economics.basis}:PRICE=${price}:QTY=${quantity}`;
  return null;
}
