import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { readDecibelActivityHistoryV1 } from '../src/decibel_activity_history_v1.js';

describe('Read-only Activity history identity mapping', () => {
  it('preserves partial fills and repeated timestamps, isolates session IDs and reads beyond telemetry limits', () => {
    const root = mkdtempSync(join(tmpdir(), 'activity-history-'));
    const path = join(root, 'fixture.sqlite');
    const Writer = new Database(path);
    try {
      Writer.exec(
        'CREATE TABLE execution_intents(intent_id TEXT PRIMARY KEY,body_json TEXT); CREATE TABLE authenticated_fills(fill_id TEXT PRIMARY KEY,intent_id TEXT,side TEXT,quantity REAL,price REAL,observed_at INTEGER); CREATE TABLE lifecycle_blockers(id INTEGER PRIMARY KEY,intent_id TEXT,blocker TEXT,observed_at INTEGER)',
      );
      const insertIntent = Writer.prepare('INSERT INTO execution_intents VALUES(?,?)');
      insertIntent.run('selected-intent', JSON.stringify({ sessionId: 'selected' }));
      insertIntent.run('other-intent', JSON.stringify({ sessionId: 'other' }));
      insertIntent.run('no-session', '{}');
      const insertFill = Writer.prepare('INSERT INTO authenticated_fills VALUES(?,?,?,?,?,?)');
      for (let index = 0; index < 130; index++)
        insertFill.run(`partial-${index}`, 'selected-intent', 'BUY', 0.001, 100, 1500);
      insertFill.run('other-fill', 'other-intent', 'SELL', 1, 100, 1500);
      insertFill.run('unowned-fill', 'no-session', 'BUY', 1, 100, 1500);
      const insertError = Writer.prepare('INSERT INTO lifecycle_blockers VALUES(?,?,?,?)');
      insertError.run(
        1,
        'selected-intent',
        'PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING',
        1500,
      );
      insertError.run(2, 'other-intent', 'OTHER_ERROR', 1500);
      insertError.run(3, 'selected-intent', 'REPEATED_ERROR', 1500);
      const history = readDecibelActivityHistoryV1(path, 'selected');
      expect(history.fills).toHaveLength(130);
      expect(new Set(history.fills.map((fill) => fill.fillId)).size).toBe(130);
      expect(history.errors.map((error) => error.type)).toEqual(['REPEATED_ERROR']);
      expect(history.errorsComplete).toBe(false);
      expect(readDecibelActivityHistoryV1(path, 'other').fills.map((fill) => fill.fillId)).toEqual([
        'other-fill',
      ]);
      expect(readDecibelActivityHistoryV1(path, "' OR 1=1 --").fills).toEqual([]);
      expect(Writer.prepare('SELECT COUNT(*) count FROM authenticated_fills').get()).toEqual({
        count: 132,
      });
    } finally {
      Writer.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('reports an unavailable journal without claiming complete history', () => {
    const root = mkdtempSync(join(tmpdir(), 'activity-missing-'));
    try {
      expect(readDecibelActivityHistoryV1(join(root, 'missing.sqlite'), 'session')).toEqual({
        sessionId: 'session',
        journalAvailable: false,
        errorsComplete: false,
        fills: [],
        errors: [],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

it('reads persisted failures from each source, excludes WAIT/RECON and unverified fills, and preserves 14 separate fragments', () => {
  const root = mkdtempSync(join(tmpdir(), 'activity-errors-'));
  const path = join(root, 'fixture.sqlite');
  const Writer = new Database(path);
  try {
    Writer.exec(`CREATE TABLE execution_intents(intent_id TEXT PRIMARY KEY,body_json TEXT);
      CREATE TABLE authenticated_fills(fill_id TEXT PRIMARY KEY,intent_id TEXT,side TEXT,quantity REAL,price REAL,observed_at INTEGER,strategy_lineage INTEGER,external_counterparty INTEGER);
      CREATE TABLE lifecycle_blockers(id INTEGER PRIMARY KEY,intent_id TEXT,blocker TEXT,observed_at INTEGER);
      CREATE TABLE executor_outcomes(id INTEGER PRIMARY KEY,intent_id TEXT,outcome_json TEXT,observed_at INTEGER);
      CREATE TABLE lifecycle_transitions(id INTEGER PRIMARY KEY,intent_id TEXT,from_state TEXT,to_state TEXT,observed_at INTEGER);`);
    Writer.prepare('INSERT INTO execution_intents VALUES(?,?)').run(
      'chosen',
      JSON.stringify({ sessionId: 'chosen-session' }),
    );
    Writer.prepare('INSERT INTO execution_intents VALUES(?,?)').run(
      'other',
      JSON.stringify({ sessionId: 'other-session' }),
    );
    const insert = Writer.prepare('INSERT INTO authenticated_fills VALUES(?,?,?,?,?,?,?,?)');
    for (let i = 0; i < 14; i++)
      insert.run(`fragment-${i}`, 'chosen', 'BUY', 0.001, 100, 1000, 1, 1);
    insert.run('not-verified', 'chosen', 'BUY', 1, 100, 1000, 0, 1);
    Writer.prepare('INSERT INTO lifecycle_blockers VALUES(?,?,?,?)').run(
      1,
      'chosen',
      'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
      1001,
    );
    Writer.prepare('INSERT INTO lifecycle_blockers VALUES(?,?,?,?)').run(
      2,
      'chosen',
      'WAIT_RECON_PENDING',
      1002,
    );
    Writer.prepare('INSERT INTO executor_outcomes VALUES(?,?,?,?)').run(
      1,
      'chosen',
      JSON.stringify({ outcome: 'PLACE_REJECTED' }),
      1003,
    );
    Writer.prepare('INSERT INTO executor_outcomes VALUES(?,?,?,?)').run(
      2,
      'other',
      JSON.stringify({ outcome: 'CANCEL_REJECTED' }),
      1003,
    );
    Writer.prepare('INSERT INTO lifecycle_transitions VALUES(?,?,?,?,?)').run(
      1,
      'chosen',
      'OPEN',
      'FAILED_TIMEOUT',
      1004,
    );
    Writer.prepare('INSERT INTO lifecycle_transitions VALUES(?,?,?,?,?)').run(
      2,
      'chosen',
      'OPEN',
      'RECONCILED',
      1005,
    );
    const history = readDecibelActivityHistoryV1(path, 'chosen-session');
    expect(history.fills).toHaveLength(14);
    expect(history.errors.map((error) => error.type)).toEqual([
      'FAILED_TIMEOUT',
      'PLACE_REJECTED',
      'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
    ]);
    expect(history.errorsComplete).toBe(false);
  } finally {
    Writer.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// Synthetic authenticated evidence verifies identity projection, never production journal mutation.
describe('Activity authenticated fill fee and position evidence', () => {
  const intent = { clientOrderId: 'request-1', market: 'BTC-USD', venueOrderId: 'order-1' };
  const fill: import('../src/decibel_actual_fill_truth_v1.js').decibel_actual_fill_truth_v1 = {
    venueOrderId: 'order-1',
    venueFillId: 'fill-1',
    localExecutionRequestId: 'request-1',
    marketAddress: 'BTC-USD',
    side: 'BUY',
    executedPrice: 100,
    executedBaseQuantity: 0.05,
    executedUsdNotional: 5,
    makerOrTaker: 'MAKER',
    receivedAt: new Date(1000),
    venueTimestamp: new Date(900),
    fee: { availability: 'AVAILABLE', amount: 0.005, currency: 'USD' },
    rebate: { availability: 'UNAVAILABLE', amount: null, currency: null },
    executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM',
    executionFragments: [
      { fragmentId: 'a', quantity: 0.02, price: 100, feeUsd: 0.002 },
      { fragmentId: 'b', quantity: 0.03, price: 100, feeUsd: 0.003 },
    ],
  };
  const application: import('../src/decibel_actual_fill_truth_v1.js').decibel_actual_fill_application_v1 =
    {
      applicationId: 'application-1',
      venueOrderId: 'order-1',
      venueFillId: 'fill-1',
      side: 'BUY',
      appliedAt: new Date(1000),
      fillPrice: 100,
      fillQuantity: 0.05,
      inventoryBefore: 0,
      inventoryAfter: 0.05,
      provenance: 'ACTUAL_EXECUTION',
    };
  const row = {
    fillId: JSON.stringify(['order-1', 'fill-1', 'a']),
    timestamp: 900,
    side: 'BUY' as const,
    quantity: 0.02,
    price: 100,
  };
  it('uses actual fragment fees without allocating or repeating the aggregate fee; verified opening PnL is N/A', async () => {
    const { enrichDecibelActivityFillV1 } =
      await import('../src/decibel_activity_fill_evidence_v1.js');
    const first = enrichDecibelActivityFillV1(row, intent, {
      fills: [fill],
      applications: [application],
    });
    const second = enrichDecibelActivityFillV1(
      { ...row, fillId: JSON.stringify(['order-1', 'fill-1', 'b']), quantity: 0.03 },
      intent,
      { fills: [fill], applications: [application] },
    );
    expect(first.feeUsd).toBe(0.002);
    expect(second.feeUsd).toBe(0.003);
    expect(first.feeUsd! + second.feeUsd!).toBeCloseTo(0.005);
    expect(first.direction).toBe('Open Long');
    expect(first.closePnlAvailability).toBe('N/A');
  });
  it('binds the BTC/USD intent symbol through the authenticated venue order instead of comparing it to a market address', async () => {
    const { enrichDecibelActivityFillV1 } =
      await import('../src/decibel_activity_fill_evidence_v1.js');
    const order = {
      venueOrderId: 'order-1',
      localIntentId: 'intent',
      localExecutionRequestId: 'request-1',
      marketAddress: fill.marketAddress,
      side: 'BUY' as const,
      requestedQuantity: 0.05,
    };
    expect(
      enrichDecibelActivityFillV1(
        row,
        { ...intent, market: 'BTC/USD' },
        { fills: [fill], applications: [application], orders: [order] },
      ).feeUsd,
    ).toBe(0.002);
    expect(
      enrichDecibelActivityFillV1(
        row,
        { ...intent, market: 'BTC/USD' },
        { fills: [fill], applications: [application] },
      ).feeUsd,
    ).toBeNull();
  });
  it('refuses mismatched identity, quantities, currency and duplicated evidence', async () => {
    const { enrichDecibelActivityFillV1 } =
      await import('../src/decibel_activity_fill_evidence_v1.js');
    expect(
      enrichDecibelActivityFillV1(
        row,
        { ...intent, clientOrderId: 'other' },
        { fills: [fill], applications: [] },
      ).feeUsd,
    ).toBeNull();
    expect(
      enrichDecibelActivityFillV1({ ...row, quantity: 0.01 }, intent, {
        fills: [fill],
        applications: [],
      }).feeUsd,
    ).toBeNull();
    expect(
      enrichDecibelActivityFillV1(row, intent, { fills: [fill, fill], applications: [] }).feeUsd,
    ).toBeNull();
    expect(
      enrichDecibelActivityFillV1(
        { ...row, fillId: JSON.stringify(['order-1', 'fill-1']), quantity: 0.05 },
        intent,
        {
          fills: [
            {
              ...fill,
              executionFragments: undefined,
              fee: { availability: 'AVAILABLE', amount: 1, currency: 'BTC' },
            },
          ],
          applications: [],
        },
      ).feeUsd,
    ).toBeNull();
  });
  it('distinguishes proven closing fills from unknown position context without inventing realized PnL', async () => {
    const { enrichDecibelActivityFillV1 } =
      await import('../src/decibel_activity_fill_evidence_v1.js');
    const closed = enrichDecibelActivityFillV1(
      { ...row, side: 'SELL' },
      { ...intent, reduceOnly: true },
    );
    expect(closed.direction).toBe('Close Long');
    expect(closed.closePnlAvailability).toBe('UNKNOWN');
    expect(closed.pnlAtCloseUsd).toBeNull();
    const unknown = enrichDecibelActivityFillV1(row, intent, { fills: [fill], applications: [] });
    expect(unknown.direction).toBeNull();
    expect(unknown.closePnlAvailability).toBe('UNKNOWN');
  });
  it('shows the venue realized PnL of a proven closing fill and fragment, never on openings', async () => {
    const { enrichDecibelActivityFillV1 } =
      await import('../src/decibel_activity_fill_evidence_v1.js');
    const closing = {
      ...fill,
      side: 'SELL' as const,
      venueRealizedPnlUsd: 0.044175,
      executionFragments: [
        { fragmentId: 'a', quantity: 0.02, price: 100, feeUsd: 0.002, realizedPnlUsd: 0.01767 },
        { fragmentId: 'b', quantity: 0.03, price: 100, feeUsd: 0.003, realizedPnlUsd: 0.026505 },
      ],
    };
    const closeApplication = {
      ...application,
      side: 'SELL' as const,
      inventoryBefore: 0.05,
      inventoryAfter: 0,
    };
    const fragment = enrichDecibelActivityFillV1({ ...row, side: 'SELL' }, intent, {
      fills: [closing],
      applications: [closeApplication],
    });
    expect(fragment).toMatchObject({
      direction: 'Close Long',
      closePnlAvailability: 'VERIFIED',
      pnlAtCloseUsd: 0.01767,
    });
    const whole = enrichDecibelActivityFillV1(
      { ...row, fillId: JSON.stringify(['order-1', 'fill-1']), side: 'SELL', quantity: 0.05 },
      intent,
      { fills: [closing], applications: [closeApplication] },
    );
    expect(whole).toMatchObject({ closePnlAvailability: 'VERIFIED', pnlAtCloseUsd: 0.044175 });
    // An opening fill keeps N/A even if a value were reported.
    const opening = enrichDecibelActivityFillV1(row, intent, {
      fills: [{ ...fill, venueRealizedPnlUsd: 0 }],
      applications: [application],
    });
    expect(opening).toMatchObject({ closePnlAvailability: 'N/A', pnlAtCloseUsd: null });
  });
  it('preserves authenticated fees through the local reader and response schema', () => {
    const root = mkdtempSync(join(tmpdir(), 'activity-fee-'));
    const path = join(root, 'fixture.sqlite');
    const Writer = new Database(path);
    try {
      Writer.exec(
        'CREATE TABLE execution_intents(intent_id TEXT PRIMARY KEY,body_json TEXT); CREATE TABLE authenticated_fills(fill_id TEXT PRIMARY KEY,intent_id TEXT,side TEXT,quantity REAL,price REAL,observed_at INTEGER); CREATE TABLE lifecycle_blockers(id INTEGER PRIMARY KEY,intent_id TEXT,blocker TEXT,observed_at INTEGER)',
      );
      Writer.prepare('INSERT INTO execution_intents VALUES(?,?)').run(
        'intent',
        JSON.stringify({ ...intent, sessionId: 'chosen' }),
      );
      Writer.prepare('INSERT INTO authenticated_fills VALUES(?,?,?,?,?,?)').run(
        row.fillId,
        'intent',
        'BUY',
        0.02,
        100,
        900,
      );
      const result = readDecibelActivityHistoryV1(path, 'chosen', {
        fills: [fill],
        applications: [application],
      });
      const wire = JSON.parse(JSON.stringify(result)) as typeof result;
      expect(wire.fills[0]?.feeUsd).toBe(0.002);
      expect(wire.fills[0]?.closePnlAvailability).toBe('N/A');
    } finally {
      Writer.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
