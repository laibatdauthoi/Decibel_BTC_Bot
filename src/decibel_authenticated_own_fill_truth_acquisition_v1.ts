export const DECIBEL_AUTHENTICATED_OWN_FILL_TRUTH_ACQUISITION_V1 =
  'DECIBEL_AUTHENTICATED_OWN_FILL_TRUTH_ACQUISITION_V1' as const;

export type decibel_own_fill_capability_status_v1 = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';

export const DecibelAuthenticatedOwnFillTruthAcquisitionReportV1 = Object.freeze({
  auditVersion: DECIBEL_AUTHENTICATED_OWN_FILL_TRUTH_ACQUISITION_V1,
  sources: Object.freeze({
    userTradeHistory: Object.freeze({
      contracts: Object.freeze([
        'DecibelReadDex.userTradeHistory.getByAddr',
        'DecibelReadDex.userTradeHistory.subscribeByAddr',
      ]),
      fields: Object.freeze([
        'account',
        'market',
        'action',
        'source',
        'trade_id',
        'size',
        'price',
        'is_profit',
        'realized_pnl_amount',
        'realized_funding_amount',
        'is_rebate',
        'fee_amount',
        'order_id',
        'client_order_id?',
        'transaction_unix_ms',
        'transaction_version',
      ]),
    }),
    userOrderHistory: Object.freeze({
      contracts: Object.freeze([
        'DecibelReadDex.userOrderHistory.getByAddr',
        'DecibelReadDex.userOrderHistory.subscribeByAddr',
      ]),
      fields: Object.freeze([
        'parent',
        'market',
        'client_order_id',
        'order_id',
        'status',
        'order_type',
        'trigger_condition',
        'order_direction',
        'orig_size',
        'remaining_size',
        'size_delta',
        'price',
        'is_buy',
        'is_reduce_only',
        'details',
        'cancellation_reason',
        'transaction_version',
        'unix_ms',
      ]),
    }),
    userNotifications: Object.freeze({
      notificationTypes: Object.freeze([
        'LimitOrderPlaced',
        'OrderPartiallyFilled',
        'OrderFilled',
        'OrderSizeReduced',
        'OrderCancelled',
        'OrderRejected',
        'OrderErrored',
      ]),
      identityFields: Object.freeze(['order.order_id', 'order.transaction_version']),
      orderFields: Object.freeze([
        'parent',
        'market',
        'client_order_id',
        'order_id',
        'status',
        'order_type',
        'trigger_condition',
        'order_direction',
        'orig_size',
        'remaining_size',
        'size_delta',
        'price',
        'is_buy',
        'is_reduce_only',
        'details',
        'cancellation_reason',
        'transaction_version',
        'unix_ms',
      ]),
      metadataFields: Object.freeze(['trigger_price?', 'reason?', 'amount?', 'filled_size?']),
      unavailableFields: Object.freeze([
        'notification_id',
        'fill_id',
        'event_index',
        'transaction_hash',
        'maker_or_taker',
        'fee',
        'rebate',
        'average_fill_price',
      ]),
    }),
    orderStatus: Object.freeze({
      contract: 'OrderStatusClient.getOrderStatus(orderId, marketAddress, userAddress)',
      fields: Object.freeze([
        'parent',
        'market',
        'order_id',
        'status',
        'orig_size',
        'remaining_size',
        'size_delta',
        'price',
        'is_buy',
        'details',
        'transaction_version',
        'unix_ms',
      ]),
      unavailableFields: Object.freeze([
        'fill_id',
        'per_fill_quantity',
        'per_fill_price',
        'average_fill_price',
        'maker_or_taker',
        'fee',
        'rebate',
        'transaction_hash',
        'event_index',
      ]),
    }),
    openOrders: Object.freeze({
      contracts: Object.freeze([
        'DecibelReadDex.userOpenOrders.getByAddr',
        'DecibelReadDex.userOpenOrders.subscribeByAddr',
      ]),
      disappearanceProvesFill: false,
      authoritativeCumulativeFillQuantityAlone: false,
    }),
    placementResult: Object.freeze({
      fields: Object.freeze(['success', 'orderId?', 'transactionHash']),
      fillEvidence: false,
    }),
    authenticatedOrderDetails: Object.freeze({
      contract: 'GET /api/v1/orders',
      requiredQuery: Object.freeze(['market', 'account', 'order_id']),
      lineageFields: Object.freeze([
        'order.order_id',
        'order.client_order_id',
        'order.time_in_force',
      ]),
    }),
  }),
  joins: Object.freeze([
    Object.freeze({
      sourceA: 'userTradeHistory',
      joinKey: 'order_id',
      sourceB: 'userOrderHistory/orderStatus',
      resultingFacts: Object.freeze([
        'venue order lineage',
        'client order lineage when present',
        'order side',
        'order status',
      ]),
      resultingMakerStatus: false,
    }),
  ]),
  capabilityMatrix: Object.freeze({
    venueOrderId: Object.freeze({ source: 'userTradeHistory.order_id', status: 'AVAILABLE' }),
    fillIdentity: Object.freeze({ source: 'userTradeHistory.trade_id', status: 'AVAILABLE' }),
    cumulativeFillQuantity: Object.freeze({
      source: 'sum unique userTradeHistory.size by order_id',
      status: 'AVAILABLE',
    }),
    perFillQuantity: Object.freeze({ source: 'userTradeHistory.size', status: 'AVAILABLE' }),
    executionPrice: Object.freeze({ source: 'userTradeHistory.price', status: 'AVAILABLE' }),
    makerStatus: Object.freeze({
      source: 'authenticated order.time_in_force=PostOnly + Decibel post-only contract',
      status: 'AVAILABLE',
    }),
    fee: Object.freeze({ source: 'userTradeHistory.fee_amount', status: 'AVAILABLE' }),
    feeCurrency: Object.freeze({ source: 'none', status: 'UNAVAILABLE' }),
    rebate: Object.freeze({
      source: 'userTradeHistory.is_rebate + fee_amount',
      status: 'AVAILABLE',
    }),
    rebateCurrency: Object.freeze({ source: 'none', status: 'UNAVAILABLE' }),
    transactionEventIdentity: Object.freeze({
      source: 'trade_id strongest; transaction_version additionally present',
      status: 'AVAILABLE',
    }),
    disconnectRecovery: Object.freeze({
      source: 'userTradeHistory REST + order history/status/open orders',
      status: 'PARTIAL',
    }),
  }),
  authoritativeCumulativeFillQuantity: true,
  authoritativeFillIdAvailable: true,
  perFillQuantityAvailable: true,
  cumulativeFillQuantityAvailable: true,
  authoritativeExecutedQuantityAvailable: true,
  perFillExecutionPriceAvailable: true,
  cumulativeAveragePriceAvailable: false,
  authoritativeExecutedPriceAvailable: true,
  postOnlyAcceptedImpliesMaker: 'PROVEN',
  authoritativeMakerStatusAvailable: true,
  authoritativeExecutionFeeAvailable: true,
  authoritativeRebateAvailable: true,
  cumulativeDeltaDecision: 'CUMULATIVE_DELTA_FILL_TRUTH_UNSAFE',
  cumulativeDeltaReason:
    'open-order/order-status deltas lack per-fill price, unique fill identity, and maker proof; direct user trade records should be used instead',
  disconnectFillRecovery: 'PARTIAL',
  ownFillTruthContract: 'COMPLETE',
  actualFillTruthAvailable: true,
  smallestRemainingBlocker: null,
  liveExecutionEnabled: false,
  signerInitialized: false,
});

export type decibel_user_trade_fact_v1 = Readonly<{
  source: string;
  tradeId: string;
  orderId: string;
  size: number;
  price: number;
  transactionVersion: number;
  isRebate: boolean;
  feeAmount: number;
}>;

export function assessDecibelUserTradeForActualFillTruthV1(trade: decibel_user_trade_fact_v1) {
  const authoritativeExecution =
    trade.source === 'OrderFill' &&
    trade.tradeId.length > 0 &&
    trade.orderId.length > 0 &&
    trade.size > 0 &&
    trade.price > 0 &&
    Number.isSafeInteger(trade.transactionVersion);
  return Object.freeze({
    authoritativeExecution,
    uniqueExecutionIdentityAvailable: authoritativeExecution,
    quantityAvailable: authoritativeExecution,
    priceAvailable: authoritativeExecution,
    feeAmountAvailable: authoritativeExecution && Number.isFinite(trade.feeAmount),
    makerStatusAvailable: false,
    actualFillTruthConstructible: false,
    blockingReason: authoritativeExecution
      ? 'AUTHENTICATED_POST_ONLY_ORDER_LINEAGE_REQUIRED'
      : 'AUTHORITATIVE_ORDER_FILL_RECORD_INVALID',
  });
}

export function assessDecibelCumulativeExecutionDeltaSafetyV1(
  input: Readonly<{
    sameVenueOrder: boolean;
    monotonicCumulativeQuantity: boolean;
    orderedAndVersioned: boolean;
    duplicateDetectable: boolean;
    cumulativeNotionalAvailable: boolean;
    terminalStatusConfirmed: boolean;
    makerStatusIndependentlyProven: boolean;
  }>,
) {
  const safe = Object.values(input).every(Boolean);
  return Object.freeze({
    safe,
    classification: safe
      ? ('CUMULATIVE_DELTA_FILL_TRUTH_COMPOSABLE' as const)
      : ('CUMULATIVE_DELTA_FILL_TRUTH_UNSAFE' as const),
  });
}
