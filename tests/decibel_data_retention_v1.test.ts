import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  applyDecibelRetentionPlanV1,
  planDecibelDataRetentionV1,
  readDecibelRetentionInputsV1,
  runDecibelStartupRetentionV1,
  type decibel_retention_session_v1,
} from '../src/decibel_data_retention_v1.js';

const ended = (index: number): decibel_retention_session_v1 => ({
  sessionId: `ended-${index}`,
  status: 'ENDED',
  startedAt: 1_000 + index,
  createdAt: 1_000 + index,
});

describe('data retention plan', () => {
  it('keeps the newest N terminal sessions and cuts snapshots at the oldest kept one', () => {
    const sessions = Array.from({ length: 35 }, (_, index) => ended(index));
    const plan = planDecibelDataRetentionV1({
      sessions,
      sessionsWithIntents: new Set(),
      sessionsWithOpenIntents: new Set(),
      keep: 30,
    });
    expect(plan.keepSessionIds).toHaveLength(30);
    expect(plan.deleteSessionIds).toEqual(['ended-4', 'ended-3', 'ended-2', 'ended-1', 'ended-0']);
    expect(plan.snapshotCutoffMs).toBe(1_005);
  });

  it('never deletes active sessions or sessions with open intents', () => {
    const plan = planDecibelDataRetentionV1({
      sessions: [
        ended(1),
        ended(2),
        { sessionId: 'running', status: 'RUNNING', startedAt: 5, createdAt: 5 },
        ended(0),
      ],
      sessionsWithIntents: new Set(['ended-0']),
      sessionsWithOpenIntents: new Set(['ended-0']),
      keep: 1,
    });
    expect(plan.keepSessionIds).toEqual(expect.arrayContaining(['running', 'ended-0', 'ended-2']));
    expect(plan.deleteSessionIds).toEqual(['ended-1']);
    expect(plan.snapshotCutoffMs).toBe(5);
  });

  it('deletes BLOCKED sessions only when they never started and never placed intents', () => {
    const blocked = (id: string, startedAt: number | null) => ({
      sessionId: id,
      status: 'BLOCKED',
      startedAt,
      createdAt: 10,
    });
    const plan = planDecibelDataRetentionV1({
      sessions: [blocked('never', null), blocked('traded', null), blocked('started', 11)],
      sessionsWithIntents: new Set(['traded']),
      sessionsWithOpenIntents: new Set(),
    });
    expect(plan.deleteSessionIds).toEqual(['never']);
    expect(plan.keepSessionIds).toEqual(expect.arrayContaining(['traded', 'started']));
  });

  it('deletes nothing from snapshots when no session is kept', () => {
    expect(
      planDecibelDataRetentionV1({
        sessions: [],
        sessionsWithIntents: new Set(),
        sessionsWithOpenIntents: new Set(),
      }).snapshotCutoffMs,
    ).toBeNull();
  });
});

describe('data retention against SQLite', () => {
  const setup = () => {
    const directory = mkdtempSync(join(tmpdir(), 'retention-'));
    const sessionDb = new Database(join(directory, 'sessions.sqlite'));
    const journalDb = new Database(join(directory, 'journal.sqlite'));
    sessionDb.exec(
      'CREATE TABLE production_sessions_v1(session_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, started_at INTEGER, status TEXT NOT NULL)',
    );
    journalDb.exec(
      'CREATE TABLE execution_intents(intent_id TEXT PRIMARY KEY, body_json TEXT NOT NULL, status TEXT NOT NULL); CREATE TABLE strategy_decision_snapshots(cycle_sequence INTEGER PRIMARY KEY, snapshot_json TEXT NOT NULL, observed_at INTEGER NOT NULL)',
    );
    const insert = sessionDb.prepare('INSERT INTO production_sessions_v1 VALUES(?,?,?,?)');
    for (let index = 0; index < 33; index += 1)
      insert.run(`s-${index}`, 100 + index, 100 + index, 'ENDED');
    insert.run('blocked', 1, null, 'BLOCKED');
    journalDb
      .prepare('INSERT INTO execution_intents VALUES(?,?,?)')
      .run('i-1', JSON.stringify({ sessionId: 's-0' }), 'APPLIED');
    const snapshot = journalDb.prepare('INSERT INTO strategy_decision_snapshots VALUES(?,?,?)');
    for (let index = 0; index < 10; index += 1) snapshot.run(index, '{}', 98 + index);
    return { directory, sessionDb, journalDb };
  };

  it('applies the plan: keeps 30 sessions, removes old snapshots, keeps intents', () => {
    const { sessionDb, journalDb } = setup();
    const plan = planDecibelDataRetentionV1(readDecibelRetentionInputsV1(sessionDb, journalDb));
    const result = applyDecibelRetentionPlanV1(sessionDb, journalDb, plan);
    expect(result.deletedSessions).toBe(4); // s-0, s-1, s-2 and the never-started BLOCKED session
    expect(plan.snapshotCutoffMs).toBe(103);
    expect(result.deletedSnapshots).toBe(5); // observed_at 98..102
    expect(
      (sessionDb.prepare('SELECT COUNT(*) n FROM production_sessions_v1').get() as { n: number }).n,
    ).toBe(30);
    expect(
      (journalDb.prepare('SELECT COUNT(*) n FROM execution_intents').get() as { n: number }).n,
    ).toBe(1);
    sessionDb.close();
    journalDb.close();
  });

  it('startup retention logs and never throws on missing tables', () => {
    const directory = mkdtempSync(join(tmpdir(), 'retention-empty-'));
    const lines: string[] = [];
    runDecibelStartupRetentionV1(
      () => ({
        sessionDb: new Database(join(directory, 'sessions.sqlite')),
        journalDb: new Database(join(directory, 'journal.sqlite')),
      }),
      (line) => lines.push(line),
    );
    expect(lines).toEqual([
      'DECIBEL_DATA_RETENTION=APPLIED KEPT_SESSIONS=0 DELETED_SESSIONS=0 DELETED_SNAPSHOTS=0',
    ]);
    runDecibelStartupRetentionV1(
      () => {
        throw new Error('OPEN_FAILED');
      },
      (line) => lines.push(line),
    );
    expect(lines.at(-1)).toBe('DECIBEL_DATA_RETENTION=SKIPPED DETAIL=OPEN_FAILED');
  });
});
