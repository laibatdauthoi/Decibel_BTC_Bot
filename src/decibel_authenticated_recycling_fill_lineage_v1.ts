import type { decibel_authenticated_recycling_fill_v1 } from './decibel_authenticated_passive_recycling_live_state_v1.js';

export type recycling_order_lineage_v1 = Readonly<{
  orderId: string;
  clientOrderId: string;
  side: 'BUY' | 'SELL';
  marketAddress: string;
}>;

export function resolveDecibelAuthenticatedRecyclingFillLineageV1(input: {
  btcMarketAddress: string;
  frozen: Readonly<{
    fillIds: readonly string[];
    venueOrderId: string;
    venueClientOrderId: string;
    side: 'BUY' | 'SELL';
    marketAddress: string;
  }>;
  knownRecyclingOrders: readonly recycling_order_lineage_v1[];
  attributedAccountFillIds?: readonly string[];
  orderHistory: readonly Readonly<{ orderId: string; marketAddress: string }>[];
  tradeHistory: readonly Readonly<{
    tradeId: string;
    orderId: string;
    clientOrderId: string | null;
    size: number;
    price: number;
    transactionVersion: number;
    source: string;
  }>[];
}) {
  const btcMarketAddress = input.btcMarketAddress.toLowerCase();
  const frozenFillIds = new Set(input.frozen.fillIds);
  const attributedAccountFillIds = new Set(input.attributedAccountFillIds ?? []);
  const knownByOrderId = new Map(input.knownRecyclingOrders.map((order) => [order.orderId, order]));
  const marketByOrderId = new Map(
    input.orderHistory.map((order) => [order.orderId, order.marketAddress]),
  );
  const fills: decibel_authenticated_recycling_fill_v1[] = [];
  const foreignMarketFillIds: string[] = [];
  const unexplainedBtcFillIds: string[] = [];
  const unprovenFillIds: string[] = [];
  const lineageBlockers: string[] = [];
  for (const row of input.tradeHistory) {
    if (row.source !== 'OrderFill') continue;
    if (attributedAccountFillIds.has(row.tradeId)) continue;
    const knownOrder = knownByOrderId.get(row.orderId);
    const isExactFrozenIdentity =
      frozenFillIds.has(row.tradeId) &&
      row.orderId === input.frozen.venueOrderId &&
      row.clientOrderId === input.frozen.venueClientOrderId;
    const resolvedMarket = isExactFrozenIdentity
      ? input.frozen.marketAddress
      : (knownOrder?.marketAddress ?? marketByOrderId.get(row.orderId));
    if (resolvedMarket !== undefined && resolvedMarket.toLowerCase() !== btcMarketAddress) {
      foreignMarketFillIds.push(row.tradeId);
      continue;
    }
    const isExactFrozenBTCFill =
      isExactFrozenIdentity && input.frozen.marketAddress.toLowerCase() === btcMarketAddress;
    const isKnownRecyclingBTCFill =
      knownOrder !== undefined && knownOrder.marketAddress.toLowerCase() === btcMarketAddress;
    if (!isExactFrozenBTCFill && !isKnownRecyclingBTCFill) {
      if (resolvedMarket?.toLowerCase() === btcMarketAddress) {
        unexplainedBtcFillIds.push(row.tradeId);
        lineageBlockers.push('AUTHENTICATED_RECYCLING_UNEXPLAINED_BTC_FILL');
      } else {
        unprovenFillIds.push(row.tradeId);
        lineageBlockers.push('AUTHENTICATED_RECYCLING_FILL_LINEAGE_UNPROVEN');
      }
      continue;
    }
    fills.push({
      tradeId: row.tradeId,
      orderId: row.orderId,
      clientOrderId: isExactFrozenBTCFill
        ? input.frozen.venueClientOrderId
        : knownOrder!.clientOrderId,
      side: isExactFrozenBTCFill ? input.frozen.side : knownOrder!.side,
      size: row.size,
      price: row.price,
      transactionVersion: row.transactionVersion,
      source: 'OrderFill',
      makerStatus: 'PROVEN',
    });
  }
  return Object.freeze({
    fills: Object.freeze(fills),
    foreignMarketFillIds: Object.freeze(foreignMarketFillIds),
    unexplainedBtcFillIds: Object.freeze(unexplainedBtcFillIds),
    unprovenFillIds: Object.freeze(unprovenFillIds),
    lineageBlockers: Object.freeze([...new Set(lineageBlockers)]),
  });
}
