import {
  applyDecibelActualFillTruthV1,
  createDecibelActualFillLedgerV1,
  type decibel_actual_fill_ledger_v1,
  type decibel_actual_order_truth_v1,
} from './decibel_actual_fill_truth_v1.js';
import {
  normalizeDecibelActualMakerFillTruthV1,
  type decibel_authenticated_post_only_order_lineage_v1,
  type decibel_authenticated_user_trade_v1,
} from './decibel_post_only_maker_status_proof_v1.js';

export const DECIBEL_AUTHENTICATED_EXECUTION_RECONCILIATION_V1 =
  'DECIBEL_AUTHENTICATED_EXECUTION_RECONCILIATION_V1' as const;

export type decibel_execution_reconciliation_state_v1 =
  | 'HEALTHY'
  | 'EXECUTION_STATE_UNKNOWN'
  | 'RECONCILIATION_REQUIRED'
  | 'RECONCILING'
  | 'RECONCILED'
  | 'RECONCILIATION_FAILED';

export type decibel_reconciliation_event_v1 =
  | 'AUTHENTICATED_STREAM_DISCONNECTED'
  | 'AUTHENTICATED_STREAM_RECONNECTED'
  | 'RECONCILIATION_STARTED'
  | 'RECONCILIATION_SUCCEEDED'
  | 'RECONCILIATION_FAILED';

export function transitionDecibelExecutionReconciliationStateV1(
  state: decibel_execution_reconciliation_state_v1,
  event: decibel_reconciliation_event_v1,
): decibel_execution_reconciliation_state_v1 {
  const transitions: Readonly<
    Partial<
      Record<
        decibel_execution_reconciliation_state_v1,
        Partial<Record<decibel_reconciliation_event_v1, decibel_execution_reconciliation_state_v1>>
      >
    >
  > = {
    HEALTHY: { AUTHENTICATED_STREAM_DISCONNECTED: 'EXECUTION_STATE_UNKNOWN' },
    EXECUTION_STATE_UNKNOWN: {
      AUTHENTICATED_STREAM_RECONNECTED: 'RECONCILIATION_REQUIRED',
    },
    RECONCILIATION_REQUIRED: { RECONCILIATION_STARTED: 'RECONCILING' },
    RECONCILING: {
      RECONCILIATION_SUCCEEDED: 'RECONCILED',
      RECONCILIATION_FAILED: 'RECONCILIATION_FAILED',
      AUTHENTICATED_STREAM_DISCONNECTED: 'RECONCILIATION_FAILED',
    },
    RECONCILED: { AUTHENTICATED_STREAM_DISCONNECTED: 'EXECUTION_STATE_UNKNOWN' },
    RECONCILIATION_FAILED: {
      AUTHENTICATED_STREAM_RECONNECTED: 'RECONCILIATION_REQUIRED',
    },
  };
  const next = transitions[state]?.[event];
  if (next === undefined) throw new Error('DECIBEL_RECONCILIATION_STATE_TRANSITION_INVALID');
  return next;
}

export const DecibelUserTradeHistoryPaginationAuditV1 = Object.freeze({
  sdkVersion: '0.7.0',
  endpoint: 'GET /api/v1/trade_history',
  model: 'OFFSET',
  defaultLimit: 10,
  maximumLimit: 200,
  minimumOffset: 0,
  maximumOffset: 10_000,
  startTimestampBoundary: 'INCLUSIVE',
  endTimestampBoundary: 'INCLUSIVE',
  ordering: 'timestamp ASC or DESC; DESC default',
  totalCount: 'OPTIONAL',
  stableContinuationToken: false,
  overlapGuarantee: 'UNPROVEN',
  retentionWindow: 'UNDOCUMENTED',
  terminalProofSupported: 'STABLE_TOTAL_COUNT_ONLY',
  classification: 'PARTIAL',
} as const);

export type decibel_authenticated_trade_history_row_v1 = Readonly<{
  account: string;
  market: string;
  action: 'CloseLong' | 'CloseShort' | 'OpenLong' | 'OpenShort' | 'Net';
  source: 'OrderFill' | 'MarginCall' | 'BackStopLiquidation' | 'ADL' | 'MarketDelisted';
  trade_id: string;
  size: number;
  price: number;
  is_rebate: boolean;
  fee_amount: number;
  order_id: string;
  client_order_id?: string;
  transaction_unix_ms: number;
  transaction_version: number;
}>;

export type decibel_trade_history_page_v1 = Readonly<{
  items: readonly decibel_authenticated_trade_history_row_v1[];
  total_count?: number;
}>;

export type decibel_trade_history_page_request_v1 = Readonly<{
  account: string;
  startTimestamp: number;
  endTimestamp: number;
  sortDir: 'ASC';
  limit: number;
  offset: number;
}>;

export type decibel_trade_history_walk_v1 = Readonly<{
  pages: readonly decibel_trade_history_page_v1[];
  rows: readonly decibel_authenticated_trade_history_row_v1[];
  pageCount: number;
  rawRowCount: number;
  uniqueTradeIdCount: number;
  duplicateRowCount: number;
  terminalPaginationProof: 'STABLE_TOTAL_COUNT';
  totalCount: number;
}>;

function sameHistoryRow(
  left: decibel_authenticated_trade_history_row_v1,
  right: decibel_authenticated_trade_history_row_v1,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function walkDecibelUserTradeHistoryV1(input: {
  account: string;
  startTimestamp: number;
  endTimestamp: number;
  pageSize?: number;
  fetchPage: (
    request: decibel_trade_history_page_request_v1,
  ) => Promise<decibel_trade_history_page_v1>;
}): Promise<decibel_trade_history_walk_v1> {
  const pageSize = input.pageSize ?? 200;
  if (
    !input.account ||
    !Number.isSafeInteger(input.startTimestamp) ||
    !Number.isSafeInteger(input.endTimestamp) ||
    input.startTimestamp > input.endTimestamp ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 200
  )
    throw new Error('DECIBEL_RECONCILIATION_HISTORY_REQUEST_INVALID');
  const pages: decibel_trade_history_page_v1[] = [];
  const rows = new Map<string, decibel_authenticated_trade_history_row_v1>();
  const pageFingerprints = new Set<string>();
  let duplicateRowCount = 0;
  let expectedTotal: number | null = null;
  let offset = 0;
  let fetchedRowCount = 0;
  while (true) {
    if (offset > 10_000) throw new Error('DECIBEL_TRADE_HISTORY_OFFSET_LIMIT_EXCEEDED');
    let page: decibel_trade_history_page_v1;
    try {
      page = await input.fetchPage({
        account: input.account,
        startTimestamp: input.startTimestamp,
        endTimestamp: input.endTimestamp,
        sortDir: 'ASC',
        limit: pageSize,
        offset,
      });
    } catch {
      throw new Error('DECIBEL_TRADE_HISTORY_PAGE_FETCH_FAILED');
    }
    if (
      page.total_count === undefined ||
      !Number.isSafeInteger(page.total_count) ||
      page.total_count < 0
    )
      throw new Error('DECIBEL_TRADE_HISTORY_TOTAL_COUNT_REQUIRED');
    if (expectedTotal === null) expectedTotal = page.total_count;
    else if (page.total_count !== expectedTotal)
      throw new Error('DECIBEL_TRADE_HISTORY_TOTAL_COUNT_CHANGED');
    const fingerprint = JSON.stringify(page.items);
    if (page.items.length > 0 && pageFingerprints.has(fingerprint))
      throw new Error('DECIBEL_TRADE_HISTORY_REPEATED_PAGE');
    pageFingerprints.add(fingerprint);
    pages.push(
      Object.freeze({ items: Object.freeze([...page.items]), total_count: page.total_count }),
    );
    fetchedRowCount += page.items.length;
    for (const row of page.items) {
      if (!row.trade_id) throw new Error('DECIBEL_TRADE_HISTORY_FILL_ID_MISSING');
      const previous = rows.get(row.trade_id);
      if (previous !== undefined) {
        if (!sameHistoryRow(previous, row))
          throw new Error('DECIBEL_TRADE_HISTORY_FILL_ID_CONFLICT');
        duplicateRowCount += 1;
      } else rows.set(row.trade_id, Object.freeze({ ...row }));
    }
    if (fetchedRowCount === expectedTotal) break;
    if (fetchedRowCount > expectedTotal || page.items.length === 0)
      throw new Error('DECIBEL_TRADE_HISTORY_TERMINAL_COUNT_MISMATCH');
    offset += page.items.length;
  }
  return Object.freeze({
    pages: Object.freeze(pages),
    rows: Object.freeze([...rows.values()]),
    pageCount: pages.length,
    rawRowCount: pages.reduce((sum, page) => sum + page.items.length, 0),
    uniqueTradeIdCount: rows.size,
    duplicateRowCount,
    terminalPaginationProof: 'STABLE_TOTAL_COUNT',
    totalCount: expectedTotal ?? 0,
  });
}

export type decibel_reconciled_order_v1 = decibel_authenticated_post_only_order_lineage_v1 &
  Readonly<{
    origin: 'LOCALLY_SUBMITTED' | 'IMPORTED_AUTHENTICATED';
    requestedPrice: number;
    clientOrderId: string | null;
    acknowledgedAt: Date;
    terminalStatus: 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'UNKNOWN';
  }>;

export type decibel_execution_reconciliation_result_v1 = Readonly<{
  identity: Readonly<{
    executionSessionId: string;
    account: string;
    market: string;
    startedAt: Date;
    reconciliationStartedAt: Date;
    reconciliationCompletedAt: Date;
  }>;
  historyCoverage: Readonly<{
    requestedLowerBound: number;
    requestedUpperBound: number;
    pageCount: number;
    rawHistoryRows: number;
    uniqueTradeIds: number;
    duplicateRows: number;
    orderFillRows: number;
    terminalPaginationProof: 'STABLE_TOTAL_COUNT';
  }>;
  orderReconciliation: Readonly<{
    knownOrders: number;
    openOrders: number;
    partiallyFilledOpen: number;
    terminalFilled: number;
    terminalCancelled: number;
    rejected: number;
    unresolved: number;
  }>;
  fillTruth: Readonly<{
    actualMakerFills: number;
    totalExecutedBase: number;
    actualMakerVolumeUsd: number;
    buyMakerVolumeUsd: number;
    sellMakerVolumeUsd: number;
    unresolvedOrderLineageTradeIds: readonly string[];
    outsideSessionTradeIds: readonly string[];
  }>;
  state: Readonly<{
    initialStrategyInventory: number;
    rebuiltStrategyInventory: number;
    venueAccountPosition: number | null;
    venueAccountPositionReconciled: boolean;
    completedVolumeCycles: number;
    openVolumeCycles: number;
  }>;
  economics: Readonly<{
    feeAmountObserved: number;
    rebateAmountObserved: number;
    feeCurrency: 'UNAVAILABLE';
    rebateCurrency: 'UNAVAILABLE';
    fullyLoadedCostUsd: null;
  }>;
  checkpoint: Readonly<{
    lastReconciledTradeId: string | null;
    lastReconciledTransactionVersion: number | null;
    lastReconciledAt: Date;
    paginationCheckpoint: null;
  }>;
  integrity: Readonly<{
    paginationComplete: boolean;
    fillIdentityComplete: boolean;
    orderLineageComplete: boolean;
    inventoryRebuildComplete: boolean;
    openOrderStateReconciled: boolean;
    cycleRebuildComplete: boolean;
    reconciliationStatus: 'RECONCILED' | 'RECONCILIATION_FAILED';
  }>;
  ledger: decibel_actual_fill_ledger_v1;
  liveExecutionEnabled: false;
}>;

function tradeSide(action: decibel_authenticated_trade_history_row_v1['action']): 'BUY' | 'SELL' {
  if (action === 'OpenLong' || action === 'CloseShort') return 'BUY';
  if (action === 'CloseLong' || action === 'OpenShort') return 'SELL';
  throw new Error('DECIBEL_ORDER_FILL_SIDE_UNRESOLVED');
}

function orderTruth(order: decibel_reconciled_order_v1): decibel_actual_order_truth_v1 {
  return Object.freeze({
    venueOrderId: order.venueOrderId,
    localIntentId: order.localIntentId,
    localExecutionRequestId: order.localExecutionRequestId,
    marketAddress: order.marketAddress,
    side: order.side,
    requestedQuantity: order.requestedQuantity,
  });
}

export function reconcileDecibelAuthenticatedExecutionV1(input: {
  executionMode: 'AUTHENTICATED_DRY_RUN';
  executionSessionId: string;
  account: string;
  market: string;
  startedAt: Date;
  reconciliationStartedAt: Date;
  reconciliationCompletedAt: Date;
  initialStrategyInventory: number;
  initialStrategyInventoryProven: boolean;
  venueAccountPosition: number | null;
  history: decibel_trade_history_walk_v1;
  orders: readonly decibel_reconciled_order_v1[];
  openVenueOrderIds: readonly string[];
}): decibel_execution_reconciliation_result_v1 {
  if (
    input.executionMode !== 'AUTHENTICATED_DRY_RUN' ||
    !input.executionSessionId ||
    !input.account ||
    !input.market ||
    !input.initialStrategyInventoryProven ||
    input.initialStrategyInventory !== 0 ||
    input.history.terminalPaginationProof !== 'STABLE_TOTAL_COUNT'
  )
    throw new Error('DECIBEL_RECONCILIATION_SESSION_BOUNDARY_UNPROVEN');
  const sessionStart = input.startedAt.getTime();
  const sessionEnd = input.reconciliationStartedAt.getTime();
  const orderById = new Map(input.orders.map((order) => [order.venueOrderId, order]));
  const outsideSessionTradeIds: string[] = [];
  const unresolvedOrderLineageTradeIds: string[] = [];
  const accepted: {
    trade: decibel_authenticated_trade_history_row_v1;
    order: decibel_reconciled_order_v1;
  }[] = [];
  for (const trade of input.history.rows) {
    if (
      trade.account !== input.account ||
      trade.market !== input.market ||
      trade.transaction_unix_ms < sessionStart ||
      trade.transaction_unix_ms > sessionEnd
    ) {
      outsideSessionTradeIds.push(trade.trade_id);
      continue;
    }
    if (trade.source !== 'OrderFill') continue;
    const order = orderById.get(trade.order_id);
    if (
      order === undefined ||
      order.source !== 'AUTHENTICATED_ORDER_DETAILS' ||
      !order.acceptedByVenue ||
      order.acceptedTimeInForce !== 1 ||
      order.marketAddress !== trade.market ||
      order.side !== tradeSide(trade.action)
    ) {
      unresolvedOrderLineageTradeIds.push(trade.trade_id);
      continue;
    }
    accepted.push({ trade, order });
  }
  accepted.sort(
    (left, right) =>
      left.trade.transaction_version - right.trade.transaction_version ||
      left.trade.trade_id.localeCompare(right.trade.trade_id),
  );
  let ledger = createDecibelActualFillLedgerV1(input.orders.map(orderTruth));
  for (const { trade, order } of accepted) {
    const normalizedTrade: decibel_authenticated_user_trade_v1 = {
      source: 'OrderFill',
      tradeId: trade.trade_id,
      orderId: trade.order_id,
      marketAddress: trade.market,
      side: tradeSide(trade.action),
      size: trade.size,
      price: trade.price,
      feeAmount: trade.fee_amount,
      isRebate: trade.is_rebate,
      transactionVersion: trade.transaction_version,
      transactionUnixMs: trade.transaction_unix_ms,
      receivedAt: new Date(trade.transaction_unix_ms),
    };
    ledger = applyDecibelActualFillTruthV1(
      ledger,
      normalizeDecibelActualMakerFillTruthV1({ trade: normalizedTrade, order }),
    );
  }
  const openSet = new Set(input.openVenueOrderIds);
  const filledByOrder = new Map<string, number>();
  for (const fill of ledger.fills)
    filledByOrder.set(
      fill.venueOrderId,
      (filledByOrder.get(fill.venueOrderId) ?? 0) + fill.executedBaseQuantity,
    );
  let partiallyFilledOpen = 0;
  let terminalFilled = 0;
  for (const order of input.orders) {
    const filled = filledByOrder.get(order.venueOrderId) ?? 0;
    if (openSet.has(order.venueOrderId) && filled > 0) partiallyFilledOpen += 1;
    if (order.terminalStatus === 'FILLED' && filled >= order.requestedQuantity) terminalFilled += 1;
  }
  const buyMakerVolumeUsd = ledger.fills
    .filter((fill) => fill.side === 'BUY')
    .reduce((sum, fill) => sum + fill.executedUsdNotional, 0);
  const sellMakerVolumeUsd = ledger.fills
    .filter((fill) => fill.side === 'SELL')
    .reduce((sum, fill) => sum + fill.executedUsdNotional, 0);
  const feeAmountObserved = ledger.fills.reduce((sum, fill) => sum + (fill.fee.amount ?? 0), 0);
  const rebateAmountObserved = ledger.fills.reduce(
    (sum, fill) => sum + (fill.rebate.amount ?? 0),
    0,
  );
  const last = accepted.at(-1)?.trade ?? null;
  const allKnownOrderLineageProven = input.orders.every(
    (order) =>
      order.source === 'AUTHENTICATED_ORDER_DETAILS' &&
      order.acceptedByVenue &&
      order.acceptedTimeInForce === 1 &&
      order.marketAddress === input.market,
  );
  const orderLineageComplete =
    unresolvedOrderLineageTradeIds.length === 0 && allKnownOrderLineageProven;
  const openOrderStateReconciled = input.orders.every((order) => {
    const isOpen = openSet.has(order.venueOrderId);
    const filled = filledByOrder.get(order.venueOrderId) ?? 0;
    if (order.terminalStatus === 'UNKNOWN') return false;
    if (order.terminalStatus === 'OPEN') return isOpen && filled < order.requestedQuantity;
    if (isOpen) return false;
    if (order.terminalStatus === 'FILLED')
      return Math.abs(filled - order.requestedQuantity) <= Number.EPSILON;
    return true;
  });
  const reconciled = orderLineageComplete && openOrderStateReconciled;
  return Object.freeze({
    identity: Object.freeze({
      executionSessionId: input.executionSessionId,
      account: input.account,
      market: input.market,
      startedAt: new Date(input.startedAt),
      reconciliationStartedAt: new Date(input.reconciliationStartedAt),
      reconciliationCompletedAt: new Date(input.reconciliationCompletedAt),
    }),
    historyCoverage: Object.freeze({
      requestedLowerBound: sessionStart,
      requestedUpperBound: sessionEnd,
      pageCount: input.history.pageCount,
      rawHistoryRows: input.history.rawRowCount,
      uniqueTradeIds: input.history.uniqueTradeIdCount,
      duplicateRows: input.history.duplicateRowCount,
      orderFillRows: input.history.rows.filter((trade) => trade.source === 'OrderFill').length,
      terminalPaginationProof: input.history.terminalPaginationProof,
    }),
    orderReconciliation: Object.freeze({
      knownOrders: input.orders.length,
      openOrders: input.orders.filter((order) => openSet.has(order.venueOrderId)).length,
      partiallyFilledOpen,
      terminalFilled,
      terminalCancelled: input.orders.filter((order) => order.terminalStatus === 'CANCELLED')
        .length,
      rejected: input.orders.filter((order) => order.terminalStatus === 'REJECTED').length,
      unresolved:
        unresolvedOrderLineageTradeIds.length +
        input.orders.filter((order) => order.terminalStatus === 'UNKNOWN').length,
    }),
    fillTruth: Object.freeze({
      actualMakerFills: ledger.fills.length,
      totalExecutedBase: ledger.fills.reduce((sum, fill) => sum + fill.executedBaseQuantity, 0),
      actualMakerVolumeUsd: ledger.actualExternalMakerVolumeUsd,
      buyMakerVolumeUsd,
      sellMakerVolumeUsd,
      unresolvedOrderLineageTradeIds: Object.freeze(unresolvedOrderLineageTradeIds),
      outsideSessionTradeIds: Object.freeze(outsideSessionTradeIds),
    }),
    state: Object.freeze({
      initialStrategyInventory: input.initialStrategyInventory,
      rebuiltStrategyInventory: ledger.inventoryBase,
      venueAccountPosition: input.venueAccountPosition,
      venueAccountPositionReconciled:
        input.venueAccountPosition !== null && input.venueAccountPosition === ledger.inventoryBase,
      completedVolumeCycles: ledger.cycles.filter((cycle) => cycle.status === 'COMPLETED').length,
      openVolumeCycles: ledger.cycles.filter((cycle) => cycle.status === 'OPEN').length,
    }),
    economics: Object.freeze({
      feeAmountObserved,
      rebateAmountObserved,
      feeCurrency: 'UNAVAILABLE',
      rebateCurrency: 'UNAVAILABLE',
      fullyLoadedCostUsd: null,
    }),
    checkpoint: Object.freeze({
      lastReconciledTradeId: last?.trade_id ?? null,
      lastReconciledTransactionVersion: last?.transaction_version ?? null,
      lastReconciledAt: new Date(input.reconciliationCompletedAt),
      paginationCheckpoint: null,
    }),
    integrity: Object.freeze({
      paginationComplete: true,
      fillIdentityComplete: true,
      orderLineageComplete,
      inventoryRebuildComplete: true,
      openOrderStateReconciled,
      cycleRebuildComplete: true,
      reconciliationStatus: reconciled ? 'RECONCILED' : 'RECONCILIATION_FAILED',
    }),
    ledger,
    liveExecutionEnabled: false,
  });
}

export const DecibelAuthenticatedExecutionReconciliationCapabilityV1 = Object.freeze({
  userTradeHistoryPagination: 'PARTIAL',
  orderLineageReconciliation: 'COMPLETE',
  actualInventoryRebuild: 'READY',
  actualVolumeCycleRebuild: 'READY',
  disconnectFillRecovery: 'PARTIAL',
  authenticatedReconciliationReady: false,
  incrementalReconciliation: 'NOT_IMPLEMENTED_PAGINATION_COMPLETENESS_UNPROVEN',
  smallestRemainingBlocker:
    'USER_TRADE_HISTORY_TOTAL_COUNT_OPTIONAL_AND_OFFSET_CAPPED_WITHOUT_STABLE_CURSOR',
  liveExecutionEnabled: false,
  signerInitialized: false,
} as const);
