import type Database from 'better-sqlite3';

/**
 * Keep-N retention for the session store and the execution journal's decision snapshots.
 *
 * strategy_decision_snapshots held 88% of the 2.35 GB journal (2026-11-12) and is only read
 * for recent windows. Order intents, reconciliation and fills are never deleted here: they
 * back duplicate-submission protection and reconciliation.
 */
export const DECIBEL_SESSION_RETENTION_COUNT_V1 = 30;
const ACTIVE_STATUSES = new Set(['STARTING', 'RUNNING', 'STOPPING']);
const TERMINAL_STATUSES = new Set(['ENDED', 'INTERRUPTED']);
const TERMINAL_INTENT_STATUSES =
  "('APPLIED','EXTERNALLY_NEUTRALIZED','CANCELLED_EXTERNALLY','FAILED_TIMEOUT','FAILED_DROPPED','FAILED_DROPPED_LEGACY','REJECTED','SUPERSEDED')";

export type decibel_retention_session_v1 = Readonly<{
  sessionId: string;
  status: string;
  startedAt: number | null;
  createdAt: number;
}>;

export type decibel_retention_plan_v1 = Readonly<{
  keepSessionIds: readonly string[];
  deleteSessionIds: readonly string[];
  /** Decision snapshots observed before this time are deleted; null deletes none. */
  snapshotCutoffMs: number | null;
}>;

/** Pure: which sessions to keep and where decision snapshots may be cut. */
export function planDecibelDataRetentionV1(
  input: Readonly<{
    sessions: readonly decibel_retention_session_v1[];
    sessionsWithIntents: ReadonlySet<string>;
    sessionsWithOpenIntents: ReadonlySet<string>;
    keep?: number;
  }>,
): decibel_retention_plan_v1 {
  const keep = input.keep ?? DECIBEL_SESSION_RETENTION_COUNT_V1;
  if (!Number.isSafeInteger(keep) || keep < 1) throw new Error('RETENTION_KEEP_COUNT_INVALID');
  const at = (session: decibel_retention_session_v1) => session.startedAt ?? session.createdAt;
  const kept = new Set<string>();
  const deleted = new Set<string>();
  const terminal = input.sessions
    .filter((session) => TERMINAL_STATUSES.has(session.status))
    .sort((a, b) => at(b) - at(a));
  for (const session of input.sessions) {
    if (ACTIVE_STATUSES.has(session.status) || input.sessionsWithOpenIntents.has(session.sessionId))
      kept.add(session.sessionId);
  }
  for (const [index, session] of terminal.entries()) {
    if (kept.has(session.sessionId)) continue;
    (index < keep ? kept : deleted).add(session.sessionId);
  }
  for (const session of input.sessions) {
    if (kept.has(session.sessionId) || deleted.has(session.sessionId)) continue;
    // BLOCKED or unknown statuses are removed only when they provably never traded.
    if (session.startedAt === null && !input.sessionsWithIntents.has(session.sessionId))
      deleted.add(session.sessionId);
    else kept.add(session.sessionId);
  }
  const keptTimes = input.sessions.filter((s) => kept.has(s.sessionId)).map(at);
  return Object.freeze({
    keepSessionIds: Object.freeze([...kept]),
    deleteSessionIds: Object.freeze([...deleted]),
    snapshotCutoffMs: keptTimes.length === 0 ? null : Math.min(...keptTimes),
  });
}

const tableExists = (db: Database.Database, name: string) =>
  db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name) !== undefined;

export function readDecibelRetentionInputsV1(
  sessionDb: Database.Database,
  journalDb: Database.Database,
): Readonly<{
  sessions: readonly decibel_retention_session_v1[];
  sessionsWithIntents: ReadonlySet<string>;
  sessionsWithOpenIntents: ReadonlySet<string>;
}> {
  const sessions = tableExists(sessionDb, 'production_sessions_v1')
    ? (sessionDb
        .prepare(
          'SELECT session_id sessionId, status, started_at startedAt, created_at createdAt FROM production_sessions_v1',
        )
        .all() as decibel_retention_session_v1[])
    : [];
  const ids = (sql: string) =>
    new Set(
      (journalDb.prepare(sql).all() as { sessionId: string | null }[])
        .map((row) => row.sessionId)
        .filter((id): id is string => typeof id === 'string'),
    );
  const hasIntents = tableExists(journalDb, 'execution_intents');
  return Object.freeze({
    sessions,
    sessionsWithIntents: hasIntents
      ? ids(
          "SELECT DISTINCT json_extract(body_json,'$.sessionId') sessionId FROM execution_intents",
        )
      : new Set<string>(),
    sessionsWithOpenIntents: hasIntents
      ? ids(
          `SELECT DISTINCT json_extract(body_json,'$.sessionId') sessionId FROM execution_intents WHERE status NOT IN ${TERMINAL_INTENT_STATUSES}`,
        )
      : new Set<string>(),
  });
}

export function applyDecibelRetentionPlanV1(
  sessionDb: Database.Database,
  journalDb: Database.Database,
  plan: decibel_retention_plan_v1,
): Readonly<{ deletedSessions: number; deletedSnapshots: number }> {
  let deletedSessions = 0;
  if (plan.deleteSessionIds.length > 0 && tableExists(sessionDb, 'production_sessions_v1')) {
    const remove = sessionDb.prepare('DELETE FROM production_sessions_v1 WHERE session_id=?');
    sessionDb.transaction(() => {
      for (const id of plan.deleteSessionIds) deletedSessions += remove.run(id).changes;
    })();
  }
  let deletedSnapshots = 0;
  if (plan.snapshotCutoffMs !== null && tableExists(journalDb, 'strategy_decision_snapshots'))
    deletedSnapshots = journalDb
      .prepare('DELETE FROM strategy_decision_snapshots WHERE observed_at < ?')
      .run(plan.snapshotCutoffMs).changes;
  return Object.freeze({ deletedSessions, deletedSnapshots });
}

/** Startup housekeeping: plan + apply without VACUUM. Never throws. */
export function runDecibelStartupRetentionV1(
  open: () => Readonly<{ sessionDb: Database.Database; journalDb: Database.Database }>,
  log: (line: string) => void,
): void {
  let handles: Readonly<{ sessionDb: Database.Database; journalDb: Database.Database }> | null =
    null;
  try {
    handles = open();
    const plan = planDecibelDataRetentionV1(
      readDecibelRetentionInputsV1(handles.sessionDb, handles.journalDb),
    );
    const result = applyDecibelRetentionPlanV1(handles.sessionDb, handles.journalDb, plan);
    log(
      `DECIBEL_DATA_RETENTION=APPLIED KEPT_SESSIONS=${plan.keepSessionIds.length} DELETED_SESSIONS=${result.deletedSessions} DELETED_SNAPSHOTS=${result.deletedSnapshots}`,
    );
  } catch (error) {
    log(
      `DECIBEL_DATA_RETENTION=SKIPPED DETAIL=${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    handles?.sessionDb.close();
    handles?.journalDb.close();
  }
}
