import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  decibel_authenticated_passive_recycling_journal_v1,
  type decibel_recycling_retirement_evidence_v1,
} from '../src/decibel_authenticated_passive_recycling_journal_v1.js';
import { proveDecibelRecyclingHandoffUnsubmittedV1 } from '../src/decibel_authenticated_passive_recycling_retirement_v1.js';
import type { buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1 } from '../src/decibel_authenticated_passive_recycling_operator_handoff_v1.js';

type handoff = ReturnType<typeof buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1>;
const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
const h = {
  recyclingHandoffId: 'handoff-1',
  handoffPackageHash: 'hash-1',
  handoffCreatedAt: 100,
  subaccount: '0xabc',
  marketAddress: '0xdef',
  side: 'SELL',
  price: 80_000,
  quantity: 0.00027,
} as handoff;
const order = {
  parent: 'diagnostic',
  market: '0xdef',
  clientOrderId: 'venue-generated',
  orderId: 'order-1',
  orderType: 'LIMIT',
  isBuy: false,
  price: 80_000,
  origSize: 0.00027,
  transactionVersion: 8,
  unixMs: 101,
};
const tx = {
  hash: `0x${'a'.repeat(64)}`,
  version: 8,
  success: true,
  entryFunction: '0x1::dex_accounts_entry::place_order_to_subaccount',
  arguments: [
    { inner: '0xabc' },
    { inner: '0xdef' },
    '80000000000',
    '27000',
    false,
    1,
    false,
    { vec: ['venue-generated'] },
  ],
};
function proof(
  changes: Partial<Parameters<typeof proveDecibelRecyclingHandoffUnsubmittedV1>[0]> = {},
) {
  return proveDecibelRecyclingHandoffUnsubmittedV1({
    handoff: h,
    authenticatedQuerySubaccount: '0xabc',
    checkedThrough: 200,
    orderHistory: [],
    transactionsByVersion: new Map(),
    openOrders: [],
    fills: [],
    ...changes,
  });
}
function journal() {
  const directory = mkdtempSync(join(tmpdir(), 'retirement-'));
  temporary.push(directory);
  return new decibel_authenticated_passive_recycling_journal_v1(join(directory, 'journal.sqlite'));
}

describe('recycling stale unsubmitted handoff retirement', () => {
  it('proves no submission despite clearly unrelated activity', () => {
    expect(proof({ orderHistory: [{ ...order, price: 79_000 }] })).toMatchObject({
      noSubmissionProven: true,
      placementLineageProven: true,
      matchingVenuePlacementFound: false,
    });
  });
  it('blocks matching proven placement without depending on planned client ID', () => {
    expect(() =>
      proof({ orderHistory: [order], transactionsByVersion: new Map([[8, tx]]) }),
    ).toThrow('RECYCLING_HANDOFF_RETIREMENT_SUBMISSION_NOT_EXCLUDED');
  });
  it('blocks matching open order, fill lineage, and unproven placement lineage', () => {
    expect(() => proof({ openOrders: [order] })).toThrow(
      'RECYCLING_HANDOFF_RETIREMENT_SUBMISSION_NOT_EXCLUDED',
    );
    expect(() =>
      proof({ orderHistory: [order], fills: [{ tradeId: 'fill', orderId: 'order-1' }] }),
    ).toThrow('RECYCLING_HANDOFF_RETIREMENT_LINEAGE_UNPROVEN');
    expect(() => proof({ orderHistory: [order] })).toThrow(
      'RECYCLING_HANDOFF_RETIREMENT_LINEAGE_UNPROVEN',
    );
  });
  it('supports wrapped Move addresses and optional-vector venue client ID', () => {
    expect(() =>
      proof({ orderHistory: [order], transactionsByVersion: new Map([[8, tx]]) }),
    ).toThrow('RECYCLING_HANDOFF_RETIREMENT_SUBMISSION_NOT_EXCLUDED');
  });
  it.each(['HANDOFF_READY', 'UI_CAPTURE_WAITING'] as const)(
    'retires eligible %s state and removes it from unresolved count',
    (state) => {
      const db = journal();
      db.recordHandoff(h, 1);
      if (state === 'UI_CAPTURE_WAITING')
        db.recordState({ recyclingHandoffId: h.recyclingHandoffId, state, at: 2 });
      const evidence = proof();
      const result = db.retireUnsubmittedHandoff({
        recyclingHandoffId: h.recyclingHandoffId,
        retirementEvidence: evidence,
        at: 3,
      });
      expect(result.newState).toBe('RETIRED_UNSUBMITTED');
      expect(db.get(h.recyclingHandoffId)).toMatchObject({
        state: 'RETIRED_UNSUBMITTED',
        captureJson: null,
        reconciliationJson: null,
      });
      expect(db.unresolvedCount()).toBe(0);
      db.close();
    },
  );
  it('is idempotent for identical evidence and blocks all later transitions', () => {
    const db = journal();
    db.recordHandoff(h, 1);
    const evidence = proof();
    db.retireUnsubmittedHandoff({
      recyclingHandoffId: h.recyclingHandoffId,
      retirementEvidence: evidence,
      at: 2,
    });
    expect(
      db.retireUnsubmittedHandoff({
        recyclingHandoffId: h.recyclingHandoffId,
        retirementEvidence: evidence,
        at: 3,
      }).idempotent,
    ).toBe(true);
    expect(() =>
      db.recordState({
        recyclingHandoffId: h.recyclingHandoffId,
        state: 'UI_ORDER_CAPTURED',
        capture: {},
        at: 4,
      }),
    ).toThrow('RECYCLING_HANDOFF_RETIRED');
    db.close();
  });
  it('blocks retirement after capture or reconciliation', () => {
    for (const mode of ['capture', 'reconciliation'] as const) {
      const db = journal();
      db.recordHandoff(h, 1);
      db.recordState({
        recyclingHandoffId: h.recyclingHandoffId,
        state: mode === 'capture' ? 'UI_ORDER_CAPTURED' : 'BLOCKED',
        ...(mode === 'capture'
          ? { capture: { venueOrderId: 'x' } }
          : { reconciliation: { classification: 'x' } }),
        at: 2,
      });
      expect(() =>
        db.retireUnsubmittedHandoff({
          recyclingHandoffId: h.recyclingHandoffId,
          retirementEvidence: proof(),
          at: 3,
        }),
      ).toThrow();
      db.close();
    }
  });
  it('requires exact immutable retirement evidence and preserves zero mutation boundary', () => {
    const evidence = proof();
    expect(evidence).toMatchObject({ liveExecutionEnabled: false, venueMutationEnabled: false });
    const db = journal();
    db.recordHandoff(h, 1);
    expect(() =>
      db.retireUnsubmittedHandoff({
        recyclingHandoffId: h.recyclingHandoffId,
        retirementEvidence: {
          ...evidence,
          noSubmissionProven: false,
        } as unknown as decibel_recycling_retirement_evidence_v1,
        at: 2,
      }),
    ).toThrow('RECYCLING_HANDOFF_RETIREMENT_PROOF_INVALID');
    db.close();
  });
});
