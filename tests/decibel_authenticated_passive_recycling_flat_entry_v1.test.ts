import { describe, expect, it } from 'vitest';

import {
  buildDecibelAuthenticatedPassiveRecyclingFlatEntryV1,
  selectDecibelAuthenticatedFlatEntrySideV1,
} from '../src/decibel_authenticated_passive_recycling_flat_entry_v1.js';
import { decibel_authenticated_passive_recycling_journal_v1 } from '../src/decibel_authenticated_passive_recycling_journal_v1.js';
import { reconcileDecibelAuthenticatedPassiveRecyclingV1 } from '../src/decibel_authenticated_passive_recycling_reconciliation_v1.js';
import { proveDecibelRecyclingHandoffUnsubmittedV1 } from '../src/decibel_authenticated_passive_recycling_retirement_v1.js';
import { captureDecibelAuthenticatedPassiveRecyclingUiOrderV1 } from '../src/decibel_authenticated_passive_recycling_ui_order_capture_v1.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const now = 1_800_000_000_000;
const checkpoint = {
  checkpointBodyHashSha256: 'a'.repeat(64),
  allAccountFillIds: ['frozen', 'external-1', 'external-2'],
  strategyFillIds: ['frozen'],
  currentPositionBase: 0 as const,
  strategyMakerVolumeUsd: 20.767563,
  cycleDisposition: 'CYCLE_INTERRUPTED_BY_OUT_OF_BAND_ACTIVITY' as const,
};
const state = {
  ready: true,
  inventoryState: 'FLAT',
  authenticatedPositionBase: 0,
  currentCycleInventoryBase: 0,
  positionConservationPassed: true,
  blockers: [] as string[],
  btcOpenOrderIds: [] as string[],
  foreignMarketOpenOrderIds: [] as string[],
  resyncCheckpointBodyHash: checkpoint.checkpointBodyHashSha256,
  book: { bestBid: 79_999.9, bestAsk: 80_000, observedAt: now },
};

function build(changes: Record<string, unknown> = {}) {
  return buildDecibelAuthenticatedPassiveRecyclingFlatEntryV1({
    checkpoint,
    state,
    unresolvedHandoffCount: 0,
    completedCycleCount: 0,
    subaccount: '0xabc',
    marketAddress: '0xdef',
    tickSize: 0.1,
    lotSize: 0.00001,
    minimumSize: 0.00002,
    authoritativeVenueMinimumNotionalUsd: 10,
    configuredMinimumNotionalUsd: 10,
    configuredTargetNotionalUsd: 20,
    configuredMaximumNotionalUsd: 100,
    executionSessionId: 'session-1',
    handoffCreatedAt: now,
    maxBookAgeMs: 5_000,
    ...changes,
  });
}

function hashForSide(side: 'BUY' | 'SELL') {
  for (let index = 0; index < 1_000; index += 1) {
    const candidate = index.toString(16).padStart(64, '0');
    if (
      selectDecibelAuthenticatedFlatEntrySideV1({
        subaccount: '0xabc',
        marketAddress: '0xdef',
        resyncCheckpointBodyHash: candidate,
        cycleSequence: 1,
      }).selectedSide === side
    )
      return candidate;
  }
  throw new Error('TEST_SIDE_HASH_NOT_FOUND');
}

describe('DECIBEL AUTHENTICATED PASSIVE RECYCLING FLAT ENTRY OPERATOR V1', () => {
  it('builds one deterministic non-mutating PostOnly entry from a validated flat checkpoint', () => {
    const handoff = build();
    expect(handoff).toMatchObject({
      executionState: 'AUTHENTICATED_FLAT_ENTRY',
      cycleSequence: 1,
      sourcePositionBase: 0,
      type: 'LIMIT',
      postOnly: true,
      operatorActionRequired: true,
      liveExecutionEnabled: false,
      venueMutationEnabled: false,
      externalCounterpartyRequired: true,
      selfTradePermitted: false,
    });
    expect(handoff.price).toBe(handoff.side === 'BUY' ? state.book.bestBid : state.book.bestAsk);
    expect(handoff.notionalUsd).toBeGreaterThanOrEqual(20);
    expect(handoff.notionalUsd).toBeLessThanOrEqual(100);
    expect(handoff.quantity / 0.00001).toBeCloseTo(Math.round(handoff.quantity / 0.00001), 8);
  });

  it('is reproducible and changes its seed hash with cycle sequence without randomness', () => {
    expect(build()).toEqual(build());
    expect(build({ completedCycleCount: 1 }).sideSelectionSeedHash).not.toBe(
      build().sideSelectionSeedHash,
    );
    expect(selectDecibelAuthenticatedFlatEntrySideV1.toString()).not.toContain('Math.random');
  });

  it('selects exact best bid for BUY and exact best ask for SELL', () => {
    const buyCheckpoint = { ...checkpoint, checkpointBodyHashSha256: hashForSide('BUY') };
    const sellCheckpoint = { ...checkpoint, checkpointBodyHashSha256: hashForSide('SELL') };
    expect(
      build({
        checkpoint: buyCheckpoint,
        state: { ...state, resyncCheckpointBodyHash: buyCheckpoint.checkpointBodyHashSha256 },
      }).price,
    ).toBe(state.book.bestBid);
    expect(
      build({
        checkpoint: sellCheckpoint,
        state: { ...state, resyncCheckpointBodyHash: sellCheckpoint.checkpointBodyHashSha256 },
      }).price,
    ).toBe(state.book.bestAsk);
  });

  it('fails closed for nonzero inventory, unexplained activity, open orders, and unresolved handoffs', () => {
    expect(() => build({ state: { ...state, authenticatedPositionBase: 0.00001 } })).toThrow(
      'RECYCLING_FLAT_ENTRY_ZERO_POSITION_REQUIRED',
    );
    expect(() =>
      build({ state: { ...state, ready: false, blockers: ['UNEXPLAINED_BTC_FILL'] } }),
    ).toThrow('UNEXPLAINED_BTC_FILL');
    expect(() => build({ state: { ...state, btcOpenOrderIds: ['open'] } })).toThrow(
      'RECYCLING_FLAT_ENTRY_OPEN_ORDER_PRESENT',
    );
    expect(() => build({ unresolvedHandoffCount: 1 })).toThrow(
      'RECYCLING_FLAT_ENTRY_UNRESOLVED_HANDOFF',
    );
  });

  it('uses venue order ID as primary capture identity even when UI client ID differs', () => {
    const handoff = build();
    const order = {
      parent: 'diagnostic-parent',
      market: handoff.marketAddress,
      clientOrderId: 'ui-generated-client-id',
      orderId: 'venue-order-id',
      orderType: 'Limit',
      isBuy: handoff.side === 'BUY',
      price: handoff.price,
      origSize: handoff.quantity,
      transactionVersion: 10,
      unixMs: handoff.handoffCreatedAt,
    };
    const transaction = {
      hash: '0xhash',
      version: 10,
      success: true,
      entryFunction: '0x1::dex_accounts_entry::place_order_to_subaccount',
      arguments: [
        handoff.subaccount,
        handoff.marketAddress,
        handoff.price,
        handoff.quantity,
        handoff.side === 'BUY',
        1,
        false,
        { vec: ['ui-generated-client-id'] },
      ],
    };
    const capture = captureDecibelAuthenticatedPassiveRecyclingUiOrderV1({
      handoff,
      baselineOrderIds: new Set(),
      orders: [order],
      transactionsByVersion: new Map([[10, transaction]]),
      authenticatedQuerySubaccount: handoff.subaccount,
      capturedAt: now + 1,
    });
    expect(capture).toMatchObject({
      plannedClientOrderId: handoff.plannedClientOrderId,
      venueClientOrderId: 'ui-generated-client-id',
      venueOrderId: 'venue-order-id',
    });
    expect(capture.venueClientOrderId).not.toBe(capture.plannedClientOrderId);
  });

  it.each(['BUY', 'SELL'] as const)(
    '%s authenticated entry fill starts signed inventory',
    (side) => {
      const handoff = { ...build(), side, selectedSide: side };
      const capture = {
        recyclingHandoffId: handoff.recyclingHandoffId,
        handoffPackageHash: handoff.handoffPackageHash,
        plannedClientOrderId: handoff.plannedClientOrderId,
        venueOrderId: 'venue',
        venueClientOrderId: 'client',
        transactionVersion: 10,
        transactionHash: '0xhash',
        transactionIntentMatch: true as const,
        authenticatedQuerySubaccount: handoff.subaccount,
        venueOrderParentDiagnostic: 'parent',
        capturedAt: now,
        classification: 'RECYCLING_UI_ORDER_CAPTURED' as const,
        liveExecutionEnabled: false as const,
        venueMutationEnabled: false as const,
      };
      const position = side === 'BUY' ? handoff.quantity : -handoff.quantity;
      const result = reconcileDecibelAuthenticatedPassiveRecyclingV1({
        handoff,
        capture,
        providedTransactionHash: capture.transactionHash,
        transactionFinality: 'FINALIZED_SUCCESS',
        openOrderState: 'ABSENT',
        fills: [
          {
            source: 'OrderFill',
            tradeId: 'fill',
            orderId: 'venue',
            clientOrderId: 'client',
            side,
            size: handoff.quantity,
            price: handoff.price,
            transactionVersion: 11,
          },
        ],
        currentAuthenticatedPositionBase: position,
        unknownOrders: 0,
        unknownFills: 0,
        unrelatedActivity: false,
      });
      expect(result.classification).toBe('RECYCLING_ENTRY_FULLY_FILLED');
      expect(result.currentCycleInventoryBase).toBe(position);
      expect(result.completedRecycleCycles).toBe(0);
    },
  );

  it('classifies partial entry distinctly while its original order remains open', () => {
    const handoff = build();
    const filled = handoff.quantity / 2;
    const capture = {
      recyclingHandoffId: handoff.recyclingHandoffId,
      handoffPackageHash: handoff.handoffPackageHash,
      plannedClientOrderId: handoff.plannedClientOrderId,
      venueOrderId: 'venue',
      venueClientOrderId: 'client',
      transactionVersion: 10,
      transactionHash: '0xhash',
      transactionIntentMatch: true as const,
      authenticatedQuerySubaccount: handoff.subaccount,
      venueOrderParentDiagnostic: 'parent',
      capturedAt: now,
      classification: 'RECYCLING_UI_ORDER_CAPTURED' as const,
      liveExecutionEnabled: false as const,
      venueMutationEnabled: false as const,
    };
    const result = reconcileDecibelAuthenticatedPassiveRecyclingV1({
      handoff,
      capture,
      providedTransactionHash: '0xhash',
      transactionFinality: 'FINALIZED_SUCCESS',
      openOrderState: 'OPEN_PARTIALLY_FILLED',
      fills: [
        {
          source: 'OrderFill',
          tradeId: 'partial',
          orderId: 'venue',
          clientOrderId: 'client',
          side: handoff.side,
          size: filled,
          price: handoff.price,
          transactionVersion: 11,
        },
      ],
      currentAuthenticatedPositionBase: handoff.side === 'BUY' ? filled : -filled,
      unknownOrders: 0,
      unknownFills: 0,
      unrelatedActivity: false,
    });
    expect(result.classification).toBe('RECYCLING_ENTRY_PARTIALLY_FILLED');
    expect(result.remainingBase).toBeCloseTo(handoff.quantity - filled, 12);
  });

  it('retires unsubmitted entry without advancing durable cycle sequence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flat-entry-journal-'));
    try {
      const journal = new decibel_authenticated_passive_recycling_journal_v1(
        join(directory, 'journal.sqlite'),
      );
      const handoff = build();
      journal.recordHandoff(handoff, now);
      const proof = proveDecibelRecyclingHandoffUnsubmittedV1({
        handoff,
        authenticatedQuerySubaccount: handoff.subaccount,
        checkedThrough: now + 1,
        orderHistory: [],
        transactionsByVersion: new Map(),
        openOrders: [],
        fills: [],
      });
      journal.retireUnsubmittedHandoff({
        recyclingHandoffId: handoff.recyclingHandoffId,
        retirementEvidence: proof,
        at: now + 1,
      });
      expect(journal.completedCycleCount()).toBe(0);
      expect(build({ completedCycleCount: journal.completedCycleCount() }).cycleSequence).toBe(1);
      journal.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
