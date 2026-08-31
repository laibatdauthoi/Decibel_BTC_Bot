import { describe, expect, it } from 'vitest';

import {
  DecibelAuthenticatedExecutionReconciliationCapabilityV1,
  DecibelUserTradeHistoryPaginationAuditV1,
  reconcileDecibelAuthenticatedExecutionV1,
  transitionDecibelExecutionReconciliationStateV1,
  walkDecibelUserTradeHistoryV1,
  type decibel_authenticated_trade_history_row_v1,
  type decibel_reconciled_order_v1,
  type decibel_trade_history_walk_v1,
} from '../src/decibel_authenticated_execution_reconciliation_v1.js';

const StartedAt = new Date('2026-08-31T00:00:00.000Z');
const ReconciliationStartedAt = new Date('2026-08-31T01:00:00.000Z');
const ReconciliationCompletedAt = new Date('2026-08-31T01:00:01.000Z');

function order(
  id: string,
  side: 'BUY' | 'SELL',
  status: decibel_reconciled_order_v1['terminalStatus'] = 'FILLED',
): decibel_reconciled_order_v1 {
  return {
    source: 'AUTHENTICATED_ORDER_DETAILS',
    venueOrderId: id,
    localIntentId: `intent-${id}`,
    localExecutionRequestId: `request-${id}`,
    marketAddress: 'btc-market',
    side,
    requestedQuantity: 0.001,
    acceptedTimeInForce: 1,
    acceptedByVenue: true,
    origin: 'LOCALLY_SUBMITTED',
    requestedPrice: side === 'BUY' ? 60_000 : 61_000,
    clientOrderId: `client-${id}`,
    acknowledgedAt: new Date(StartedAt.getTime() + 1_000),
    terminalStatus: status,
  };
}

function trade(
  id: string,
  orderId: string,
  action: decibel_authenticated_trade_history_row_v1['action'],
  version: number,
  overrides: Partial<decibel_authenticated_trade_history_row_v1> = {},
): decibel_authenticated_trade_history_row_v1 {
  return {
    account: 'account-1',
    market: 'btc-market',
    action,
    source: 'OrderFill',
    trade_id: id,
    size: 0.001,
    price: action === 'OpenLong' || action === 'CloseShort' ? 60_000 : 61_000,
    is_rebate: false,
    fee_amount: 0.01,
    order_id: orderId,
    transaction_unix_ms: StartedAt.getTime() + version * 1_000,
    transaction_version: version,
    ...overrides,
  };
}

function walk(
  rows: readonly decibel_authenticated_trade_history_row_v1[],
): decibel_trade_history_walk_v1 {
  const unique = new Set(rows.map((row) => row.trade_id)).size;
  return {
    pages: [{ items: rows, total_count: rows.length }],
    rows,
    pageCount: 1,
    rawRowCount: rows.length,
    uniqueTradeIdCount: unique,
    duplicateRowCount: rows.length - unique,
    terminalPaginationProof: 'STABLE_TOTAL_COUNT',
    totalCount: rows.length,
  };
}

function reconcile(
  rows: readonly decibel_authenticated_trade_history_row_v1[],
  orders: readonly decibel_reconciled_order_v1[],
  openVenueOrderIds: readonly string[] = [],
) {
  return reconcileDecibelAuthenticatedExecutionV1({
    executionMode: 'AUTHENTICATED_DRY_RUN',
    executionSessionId: 'session-1',
    account: 'account-1',
    market: 'btc-market',
    startedAt: StartedAt,
    reconciliationStartedAt: ReconciliationStartedAt,
    reconciliationCompletedAt: ReconciliationCompletedAt,
    initialStrategyInventory: 0,
    initialStrategyInventoryProven: true,
    venueAccountPosition: 0,
    history: walk(rows),
    orders,
    openVenueOrderIds,
  });
}

describe('Decibel Authenticated Execution Reconciliation V1', () => {
  it('uses explicit disconnect/reconnect reconciliation states', () => {
    const unknown = transitionDecibelExecutionReconciliationStateV1(
      'HEALTHY',
      'AUTHENTICATED_STREAM_DISCONNECTED',
    );
    const required = transitionDecibelExecutionReconciliationStateV1(
      unknown,
      'AUTHENTICATED_STREAM_RECONNECTED',
    );
    const reconciling = transitionDecibelExecutionReconciliationStateV1(
      required,
      'RECONCILIATION_STARTED',
    );
    expect(
      transitionDecibelExecutionReconciliationStateV1(reconciling, 'RECONCILIATION_SUCCEEDED'),
    ).toBe('RECONCILED');
    expect(
      transitionDecibelExecutionReconciliationStateV1(
        reconciling,
        'AUTHENTICATED_STREAM_DISCONNECTED',
      ),
    ).toBe('RECONCILIATION_FAILED');
  });

  it('walks all bounded pages only with stable total_count proof', async () => {
    const rows = [trade('t1', 'o1', 'OpenLong', 1), trade('t2', 'o2', 'CloseLong', 2)];
    const requests: number[] = [];
    const result = await walkDecibelUserTradeHistoryV1({
      account: 'account-1',
      startTimestamp: StartedAt.getTime(),
      endTimestamp: ReconciliationStartedAt.getTime(),
      pageSize: 1,
      fetchPage: ({ offset }) => {
        requests.push(offset);
        return Promise.resolve({ items: rows.slice(offset, offset + 1), total_count: 2 });
      },
    });
    expect(requests).toEqual([0, 1]);
    expect(result).toMatchObject({ pageCount: 2, rawRowCount: 2, uniqueTradeIdCount: 2 });
    expect(DecibelUserTradeHistoryPaginationAuditV1.classification).toBe('PARTIAL');
  });

  it('fails on absent count, repeated pages, conflicting IDs, and interrupted retrieval', async () => {
    const row = trade('t1', 'o1', 'OpenLong', 1);
    await expect(
      walkDecibelUserTradeHistoryV1({
        account: 'account-1',
        startTimestamp: 1,
        endTimestamp: 2,
        fetchPage: () => Promise.resolve({ items: [] }),
      }),
    ).rejects.toThrow('DECIBEL_TRADE_HISTORY_TOTAL_COUNT_REQUIRED');
    await expect(
      walkDecibelUserTradeHistoryV1({
        account: 'account-1',
        startTimestamp: 1,
        endTimestamp: 2,
        pageSize: 1,
        fetchPage: () => Promise.resolve({ items: [row], total_count: 2 }),
      }),
    ).rejects.toThrow('DECIBEL_TRADE_HISTORY_REPEATED_PAGE');
    await expect(
      walkDecibelUserTradeHistoryV1({
        account: 'account-1',
        startTimestamp: 1,
        endTimestamp: 2,
        pageSize: 2,
        fetchPage: () => Promise.resolve({ items: [row, { ...row, price: 1 }], total_count: 2 }),
      }),
    ).rejects.toThrow('DECIBEL_TRADE_HISTORY_FILL_ID_CONFLICT');
    await expect(
      walkDecibelUserTradeHistoryV1({
        account: 'account-1',
        startTimestamp: 1,
        endTimestamp: 2,
        fetchPage: () => Promise.reject(new Error('disconnect')),
      }),
    ).rejects.toThrow('DECIBEL_TRADE_HISTORY_PAGE_FETCH_FAILED');
  });

  it('deduplicates an identical authenticated row by trade_id', async () => {
    const row = trade('t1', 'o1', 'OpenLong', 1);
    const history = await walkDecibelUserTradeHistoryV1({
      account: 'account-1',
      startTimestamp: 1,
      endTimestamp: 2,
      fetchPage: () => Promise.resolve({ items: [row, row], total_count: 2 }),
    });
    expect(history).toMatchObject({ rawRowCount: 2, uniqueTradeIdCount: 1, duplicateRowCount: 1 });
  });

  it('rebuilds partial fills, maker volume, inventory, cycles, and unloaded costs', () => {
    const buy = { ...order('buy', 'BUY'), requestedQuantity: 0.002 };
    const sell = { ...order('sell', 'SELL'), requestedQuantity: 0.002 };
    const result = reconcile(
      [
        trade('b2', 'buy', 'OpenLong', 2),
        trade('s1', 'sell', 'CloseLong', 3, { size: 0.002 }),
        trade('b1', 'buy', 'OpenLong', 1),
      ],
      [buy, sell],
    );
    expect(result.fillTruth).toMatchObject({
      actualMakerFills: 3,
      totalExecutedBase: 0.004,
      actualMakerVolumeUsd: 242,
      buyMakerVolumeUsd: 120,
      sellMakerVolumeUsd: 122,
    });
    expect(result.state).toMatchObject({
      rebuiltStrategyInventory: 0,
      completedVolumeCycles: 1,
      openVolumeCycles: 0,
    });
    expect(result.economics).toMatchObject({
      feeAmountObserved: 0.03,
      feeCurrency: 'UNAVAILABLE',
      fullyLoadedCostUsd: null,
    });
    expect(result.integrity.reconciliationStatus).toBe('RECONCILED');
  });

  it('is independent of API page order and idempotent on rerun', () => {
    const orders = [order('buy', 'BUY'), order('sell', 'SELL')];
    const rows = [trade('s1', 'sell', 'CloseLong', 2), trade('b1', 'buy', 'OpenLong', 1)];
    const first = reconcile(rows, orders);
    expect(reconcile([...rows].reverse(), orders).ledger).toEqual(first.ledger);
    expect(reconcile(rows, orders)).toEqual(first);
  });

  it('does not turn cancellation or open-order disappearance into a fill', () => {
    const result = reconcile([], [order('cancelled', 'BUY', 'CANCELLED')]);
    expect(result.fillTruth.actualMakerFills).toBe(0);
    expect(result.orderReconciliation.terminalCancelled).toBe(1);
    expect(result.integrity.reconciliationStatus).toBe('RECONCILED');
  });

  it('classifies a partially filled open order and keeps its cycle open', () => {
    const open = { ...order('open', 'BUY', 'OPEN'), requestedQuantity: 0.002 };
    const result = reconcile([trade('partial', 'open', 'OpenLong', 1)], [open], ['open']);
    expect(result.orderReconciliation).toMatchObject({ openOrders: 1, partiallyFilledOpen: 1 });
    expect(result.state).toMatchObject({ rebuiltStrategyInventory: 0.001, openVolumeCycles: 1 });
  });

  it('retains unresolved lineage and blocks reconciliation', () => {
    const result = reconcile([trade('unknown', 'not-known', 'OpenLong', 1)], []);
    expect(result.fillTruth).toMatchObject({
      actualMakerFills: 0,
      unresolvedOrderLineageTradeIds: ['unknown'],
    });
    expect(result.integrity).toMatchObject({
      orderLineageComplete: false,
      reconciliationStatus: 'RECONCILIATION_FAILED',
    });
  });

  it('keeps outside-session and non-OrderFill rows outside strategy volume', () => {
    const known = order('known', 'BUY');
    const result = reconcile(
      [
        trade('old', 'known', 'OpenLong', 1, {
          transaction_unix_ms: StartedAt.getTime() - 1,
        }),
        trade('other', 'known', 'OpenLong', 2, { source: 'MarginCall' }),
      ],
      [known],
    );
    expect(result.fillTruth).toMatchObject({
      actualMakerFills: 0,
      outsideSessionTradeIds: ['old'],
    });
  });

  it('reports partial recovery and keeps signer/live disabled', () => {
    expect(DecibelAuthenticatedExecutionReconciliationCapabilityV1).toMatchObject({
      userTradeHistoryPagination: 'PARTIAL',
      orderLineageReconciliation: 'COMPLETE',
      actualInventoryRebuild: 'READY',
      actualVolumeCycleRebuild: 'READY',
      disconnectFillRecovery: 'PARTIAL',
      authenticatedReconciliationReady: false,
      smallestRemainingBlocker:
        'USER_TRADE_HISTORY_TOTAL_COUNT_OPTIONAL_AND_OFFSET_CAPPED_WITHOUT_STABLE_CURSOR',
      liveExecutionEnabled: false,
      signerInitialized: false,
    });
  });
});
