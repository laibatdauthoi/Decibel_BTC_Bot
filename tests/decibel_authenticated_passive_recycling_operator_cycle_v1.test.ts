import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  deriveDecibelAuthenticatedPassiveRecyclingLiveStateV1,
  FROZEN_CANARY_MANIFEST_SHA256,
} from '../src/decibel_authenticated_passive_recycling_live_state_v1.js';
import { buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1 } from '../src/decibel_authenticated_passive_recycling_operator_handoff_v1.js';
import {
  captureDecibelAuthenticatedPassiveRecyclingUiOrderV1,
  verifyDecibelAuthenticatedRecyclingPlacementV1,
} from '../src/decibel_authenticated_passive_recycling_ui_order_capture_v1.js';
import { reconcileDecibelAuthenticatedPassiveRecyclingV1 } from '../src/decibel_authenticated_passive_recycling_reconciliation_v1.js';
import { decibel_authenticated_passive_recycling_journal_v1 } from '../src/decibel_authenticated_passive_recycling_journal_v1.js';

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
const manifest = JSON.parse(
  readFileSync(
    resolve('research/decibel_authenticated_live_canary_success_v1_manifest.json'),
    'utf8',
  ),
) as Record<string, unknown>;
const now = 1_800_000_000_000;
const canaryFill = {
  tradeId: '128861549622277478047068807757829',
  orderId: '170141599249866108485528702512416161792',
  clientOrderId: '64585957f9134b3e8d6ee952e9122535',
  side: 'BUY' as const,
  size: 0.00027,
  price: 76_916.9,
  transactionVersion: 7_036_650_897,
  source: 'OrderFill' as const,
  makerStatus: 'PROVEN' as const,
};
function state(changes: Record<string, unknown> = {}) {
  return deriveDecibelAuthenticatedPassiveRecyclingLiveStateV1({
    manifest,
    manifestFileSha256: FROZEN_CANARY_MANIFEST_SHA256,
    now,
    accountObservedAt: now,
    maxStateAgeMs: 5_000,
    currentPositionBase: 0.00027,
    fills: [canaryFill],
    openOrders: [],
    activeTwapCount: 0,
    activeTpSlCount: 0,
    activeBulkOrderCount: 0,
    book: { bestBid: 79_999.9, bestAsk: 80_000, observedAt: now },
    metadata: {
      marketAddress: '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861',
      tickSize: 0.1,
      lotSize: 0.00001,
      minimumSize: 0.00002,
      minimumNotionalUsd: 10,
      maximumConfiguredNotionalUsd: 100,
      mode: 'Open',
    },
    hardInventoryLimitBase: 0.001,
    ...changes,
  });
}
function handoff(initial = state(), final = state()) {
  return buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1({
    initialState: initial,
    finalState: final,
    executionSessionId: 'session-1',
    sourceManifestBodyHash: String(manifest.manifestBodyHashSha256),
    subaccount: '0xabc',
    market: 'BTC/USD',
    marketAddress: '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861',
    handoffCreatedAt: now + 1,
  });
}
function order(h = handoff()) {
  return {
    parent: 'diagnostic-not-subaccount',
    market: h.marketAddress,
    clientOrderId: 'ui-client-id',
    orderId: 'venue-order-id',
    orderType: 'LIMIT',
    isBuy: false,
    price: h.price,
    origSize: h.quantity,
    transactionVersion: 8,
    unixMs: h.handoffCreatedAt + 1,
  };
}
function transaction(h = handoff()) {
  return {
    hash: `0x${'a'.repeat(64)}`,
    version: 8,
    success: true,
    entryFunction: '0x1::dex_accounts_entry::place_order_to_subaccount',
    arguments: [
      { inner: h.subaccount },
      { inner: h.marketAddress },
      String(h.price * 1_000_000),
      String(h.quantity * 100_000_000),
      false,
      1,
      false,
      { vec: ['ui-client-id'] },
    ],
  };
}
function capture(h = handoff()) {
  const o = order(h),
    tx = transaction(h);
  return captureDecibelAuthenticatedPassiveRecyclingUiOrderV1({
    handoff: h,
    baselineOrderIds: new Set(),
    orders: [o],
    transactionsByVersion: new Map([[8, tx]]),
    authenticatedQuerySubaccount: h.subaccount,
    capturedAt: now + 2,
  });
}

describe('authenticated passive recycling operator cycle', () => {
  it('freezes SELL-only exact fresh-ask handoff for remaining authenticated inventory', () => {
    const h = handoff();
    expect(h).toMatchObject({
      inventoryState: 'LONG_RECYCLE',
      side: 'SELL',
      price: 80_000,
      quantity: 0.00027,
      type: 'LIMIT',
      postOnly: true,
      operatorActionRequired: true,
      liveExecutionEnabled: false,
      venueMutationEnabled: false,
    });
  });
  it('blocks stale/unexplained/TWAP/TP-SL/bulk state through the live bridge', () => {
    for (const changed of [
      { book: { bestBid: 79_999.9, bestAsk: 80_000, observedAt: now - 5_001 } },
      {
        openOrders: [
          { orderId: 'x', clientOrderId: 'x', side: 'SELL', knownRecyclingOrder: false },
        ],
      },
      { activeTwapCount: 1 },
      { activeTpSlCount: 1 },
      { activeBulkOrderCount: 1 },
    ])
      expect(() => handoff(state(changed), state(changed))).toThrow();
  });
  it('blocks account-state changes during construction but accepts final fresh BBO atomically', () => {
    expect(() => handoff(state(), state({ currentPositionBase: 0 }))).toThrow(
      'RECYCLING_HANDOFF_STATE_CHANGED',
    );
    expect(
      handoff(state(), state({ book: { bestBid: 80_099.9, bestAsk: 80_100, observedAt: now } }))
        .price,
    ).toBe(80_100);
  });
  it('keeps planned and UI venue identities separate and ignores order.parent for scope proof', () => {
    const h = handoff(),
      captured = capture(h);
    expect(captured.plannedClientOrderId).not.toBe(captured.venueClientOrderId);
    expect(captured).toMatchObject({
      venueOrderId: 'venue-order-id',
      venueClientOrderId: 'ui-client-id',
      transactionVersion: 8,
      transactionIntentMatch: true,
    });
    expect(captured.venueOrderParentDiagnostic).toBe('diagnostic-not-subaccount');
  });
  it('reuses wrapped Move address and optional-vector semantics and blocks semantic mismatch', () => {
    const h = handoff(),
      o = order(h),
      tx = transaction(h);
    expect(
      verifyDecibelAuthenticatedRecyclingPlacementV1({
        handoff: h,
        order: o,
        transaction: tx,
        authenticatedQuerySubaccount: h.subaccount,
      }),
    ).toBe(true);
    expect(
      verifyDecibelAuthenticatedRecyclingPlacementV1({
        handoff: h,
        order: o,
        transaction: {
          ...tx,
          arguments: tx.arguments.map((value, index) => (index === 2 ? '1' : value)),
        },
        authenticatedQuerySubaccount: h.subaccount,
      }),
    ).toBe(false);
  });
  it('classifies open, partial, and exact full fill using venue identity only', () => {
    const h = handoff(),
      c = capture(h);
    const base = {
      handoff: h,
      capture: c,
      providedTransactionHash: c.transactionHash,
      transactionFinality: 'FINALIZED_SUCCESS' as const,
      currentAuthenticatedPositionBase: 0.00027,
      unknownOrders: 0,
      unknownFills: 0,
      unrelatedActivity: false,
    };
    expect(
      reconcileDecibelAuthenticatedPassiveRecyclingV1({
        ...base,
        openOrderState: 'OPEN_UNFILLED',
        fills: [],
      }).classification,
    ).toBe('RECYCLING_ORDER_OPEN_UNFILLED');
    const partial = {
      source: 'OrderFill' as const,
      tradeId: 'fill-1',
      orderId: c.venueOrderId,
      clientOrderId: c.venueClientOrderId,
      side: 'SELL' as const,
      size: 0.0001,
      price: h.price,
      transactionVersion: 9,
    };
    expect(
      reconcileDecibelAuthenticatedPassiveRecyclingV1({
        ...base,
        currentAuthenticatedPositionBase: 0.00017,
        openOrderState: 'OPEN_PARTIALLY_FILLED',
        fills: [partial],
      }),
    ).toMatchObject({
      classification: 'RECYCLING_ORDER_PARTIALLY_FILLED',
      currentCycleInventoryBase: 0.00017,
      completedRecycleCycles: 0,
    });
    const full = { ...partial, size: 0.00027 };
    expect(
      reconcileDecibelAuthenticatedPassiveRecyclingV1({
        ...base,
        currentAuthenticatedPositionBase: 0,
        openOrderState: 'ABSENT',
        fills: [full],
      }),
    ).toMatchObject({
      classification: 'RECYCLING_CYCLE_FULLY_RECONCILED',
      completedRecycleCycles: 1,
      currentCycleInventoryBase: 0,
      authenticatedMakerVolumeUsd: 42.367563,
    });
  });
  it('deduplicates fills, rejects conflicting identities, and counts no placement volume', () => {
    const h = handoff(),
      c = capture(h),
      fill = {
        source: 'OrderFill' as const,
        tradeId: 'fill-1',
        orderId: c.venueOrderId,
        clientOrderId: c.venueClientOrderId,
        side: 'SELL' as const,
        size: 0.0001,
        price: h.price,
        transactionVersion: 9,
      };
    const base = {
      handoff: h,
      capture: c,
      providedTransactionHash: c.transactionHash,
      transactionFinality: 'FINALIZED_SUCCESS' as const,
      openOrderState: 'OPEN_PARTIALLY_FILLED' as const,
      currentAuthenticatedPositionBase: 0.00017,
      unknownOrders: 0,
      unknownFills: 0,
      unrelatedActivity: false,
    };
    expect(
      reconcileDecibelAuthenticatedPassiveRecyclingV1({ ...base, fills: [fill, { ...fill }] })
        .authenticatedRecycleFilledBase,
    ).toBe(0.0001);
    expect(() =>
      reconcileDecibelAuthenticatedPassiveRecyclingV1({
        ...base,
        fills: [fill, { ...fill, price: 80_001 }],
      }),
    ).toThrow('AUTHENTICATED_RECYCLING_FILL_ID_CONFLICT');
    expect(
      reconcileDecibelAuthenticatedPassiveRecyclingV1({ ...base, fills: [] })
        .authenticatedMakerVolumeUsd,
    ).toBe(20.767563);
  });
  it('journal is WAL-backed, resumable, and rejects capture identity rewrites', () => {
    const directory = mkdtempSync(join(tmpdir(), 'recycling-journal-'));
    temporary.push(directory);
    const journal = new decibel_authenticated_passive_recycling_journal_v1(
      join(directory, 'journal.sqlite'),
    );
    const h = handoff(),
      c = capture(h);
    journal.recordHandoff(h, now);
    journal.recordState({
      recyclingHandoffId: h.recyclingHandoffId,
      state: 'UI_CAPTURE_WAITING',
      at: now,
    });
    journal.recordState({
      recyclingHandoffId: h.recyclingHandoffId,
      state: 'UI_ORDER_CAPTURED',
      capture: c,
      at: now + 1,
    });
    expect(journal.get(h.recyclingHandoffId)?.state).toBe('UI_ORDER_CAPTURED');
    expect(() =>
      journal.recordState({
        recyclingHandoffId: h.recyclingHandoffId,
        state: 'UI_ORDER_CAPTURED',
        capture: { ...c, venueOrderId: 'changed' },
        at: now + 2,
      }),
    ).toThrow('RECYCLING_JOURNAL_CAPTURE_IDENTITY_CONFLICT');
    journal.close();
  });
  it('preserves external-counterparty and zero-mutation invariants', () => {
    const h = handoff();
    expect(h).toMatchObject({
      externalCounterpartyRequired: true,
      selfTradePermitted: false,
      mutationCounters: {
        signedTransactions: 0,
        submittedTransactions: 0,
        placedOrders: 0,
        cancelledOrders: 0,
        replacedOrders: 0,
        venueMutations: 0,
      },
    });
  });
});
