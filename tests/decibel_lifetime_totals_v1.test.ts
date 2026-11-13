import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  applyDecibelRetentionPlanV1,
  planDecibelDataRetentionV1,
  readDecibelRetentionInputsV1,
} from '../src/decibel_data_retention_v1.js';
import {
  combineDecibelLifetimeTotalsV1,
  readDecibelOverviewLifetimeTotalsV1,
} from '../src/decibel_lifetime_totals_v1.js';
import { readDecibelOverviewSessionCountV1 } from '../src/decibel_overview_metrics_v1.js';

const expectSameTotals = (
  actual: ReturnType<typeof readDecibelOverviewLifetimeTotalsV1>,
  expected: NonNullable<ReturnType<typeof readDecibelOverviewLifetimeTotalsV1>>,
) => {
  expect(actual!.sessionCount).toBe(expected.sessionCount);
  expect(actual!.liveSessionIds).toEqual(expected.liveSessionIds);
  expect(actual!.closed.sessionCount).toBe(expected.closed.sessionCount);
  expect(actual!.closed.incompletePnlCount).toBe(expected.closed.incompletePnlCount);
  for (const key of ['volumeUsd', 'netPnlUsd', 'feesUsd'] as const)
    expect(actual!.closed[key]).toBeCloseTo(expected.closed[key], 9);
};

const setup = () => {
  const directory = mkdtempSync(join(tmpdir(), 'lifetime-'));
  const sessionPath = join(directory, 'sessions.sqlite');
  const sessionDb = new Database(sessionPath);
  const journalDb = new Database(join(directory, 'journal.sqlite'));
  sessionDb.exec(`CREATE TABLE production_sessions_v1(session_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL, started_at INTEGER, status TEXT NOT NULL,
    session_pnl_usd REAL, pnl_complete INTEGER NOT NULL DEFAULT 0, maker_volume_usd REAL,
    taker_volume_usd REAL, total_executed_volume_usd REAL, fees_usd REAL)`);
  const insert = sessionDb.prepare(
    'INSERT INTO production_sessions_v1 VALUES(?,?,?,?,?,?,?,?,?,?)',
  );
  // 33 closed sessions: $100 volume, -$0.01 net, $0.02 fees each.
  for (let index = 0; index < 33; index += 1)
    insert.run(`s-${index}`, 100 + index, 100 + index, 'ENDED', -0.01, 1, 100, 0, 100, 0.02);
  // A legacy V1 row without total volume and without final PnL.
  insert.run('legacy', 99, 99, 'INTERRUPTED', null, 0, 40, 10, null, null);
  insert.run('never-started', 1, null, 'BLOCKED', null, 0, null, null, null, null);
  // Live session: its persisted PnL is not final; real time comes from telemetry.
  insert.run('live', 500, 500, 'RUNNING', null, 0, 150, 0, 150, null);
  return { directory, sessionPath, sessionDb, journalDb };
};

describe('lifetime totals', () => {
  it('keeps lifetime volume, PnL and session count across retention', () => {
    const { directory, sessionPath, sessionDb, journalDb } = setup();
    try {
      const before = readDecibelOverviewLifetimeTotalsV1(sessionPath)!;
      expect(before.sessionCount).toBe(35);
      expect(before.closed.volumeUsd).toBeCloseTo(33 * 100 + 50, 9);
      expect(before.closed.netPnlUsd).toBeCloseTo(-0.33, 9);
      expect(before.closed.feesUsd).toBeCloseTo(0.66, 9);
      expect(before.closed.incompletePnlCount).toBe(1);
      expect(before.liveSessionIds).toEqual(['live']);

      const plan = planDecibelDataRetentionV1(readDecibelRetentionInputsV1(sessionDb, journalDb));
      expect(
        applyDecibelRetentionPlanV1(sessionDb, journalDb, plan).deletedSessions,
      ).toBeGreaterThan(3);
      expectSameTotals(readDecibelOverviewLifetimeTotalsV1(sessionPath), before);
      expect(readDecibelOverviewSessionCountV1(sessionPath)).toBe(35);
      // A second pass with nothing to delete does not double count.
      applyDecibelRetentionPlanV1(
        sessionDb,
        journalDb,
        planDecibelDataRetentionV1(readDecibelRetentionInputsV1(sessionDb, journalDb)),
      );
      expectSameTotals(readDecibelOverviewLifetimeTotalsV1(sessionPath), before);
    } finally {
      sessionDb.close();
      journalDb.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('adds the live session in real time only while the store lists it as live', () => {
    const { directory, sessionPath, sessionDb, journalDb } = setup();
    try {
      const totals = readDecibelOverviewLifetimeTotalsV1(sessionPath)!;
      const live = { sessionId: 'live', volumeUsd: 194.45, netPnlUsd: 0.0166, feesUsd: 0.0299 };
      const combined = combineDecibelLifetimeTotalsV1(totals, live);
      expect(combined.volumeUsd).toBeCloseTo(3350 + 194.45, 9);
      expect(combined.netPnlUsd).toBeCloseTo(-0.33 + 0.0166, 9);
      expect(combined.grossPnlUsd).toBeCloseTo(-0.33 + 0.66 + 0.0166 + 0.0299, 9);
      // An ended session is already in the closed totals: never counted twice.
      expect(combineDecibelLifetimeTotalsV1(totals, { ...live, sessionId: 's-1' }).volumeUsd).toBe(
        totals.closed.volumeUsd,
      );
      // Unknown live PnL is not a verified all-time total.
      expect(
        combineDecibelLifetimeTotalsV1(totals, { ...live, netPnlUsd: null }).netPnlUsd,
      ).toBeNull();
      expect(combineDecibelLifetimeTotalsV1(null, live).volumeUsd).toBeNull();
      expect(readDecibelOverviewLifetimeTotalsV1(join(directory, 'missing.sqlite'))).toBeNull();
    } finally {
      sessionDb.close();
      journalDb.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
