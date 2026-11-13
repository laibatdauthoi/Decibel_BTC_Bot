import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

/**
 * Lifetime (all-time) session totals that survive session retention.
 *
 * Retention keeps only the newest sessions. Before it deletes a session row, the row's
 * volume, net PnL and fees are added to a one-row archive in the same transaction, so the
 * lifetime numbers never shrink. Lifetime = archive + closed session rows + the live
 * session's real-time figures (the live row's persisted PnL is not final yet).
 */
export const DECIBEL_LIFETIME_ARCHIVE_TABLE_V1 = 'production_lifetime_archive_v1';
const LIVE_STATUSES = new Set(['STARTING', 'RUNNING', 'STOPPING']);

type session_row_v1 = Readonly<Record<string, unknown>>;

export type decibel_lifetime_session_totals_v1 = Readonly<{
  sessionCount: number;
  volumeUsd: number;
  netPnlUsd: number;
  feesUsd: number;
  incompletePnlCount: number;
}>;

export type decibel_overview_lifetime_totals_v1 = Readonly<{
  /** Archived + persisted started sessions, live session included. */
  sessionCount: number;
  /** Archived + closed sessions only; the live session is added from real-time telemetry. */
  closed: decibel_lifetime_session_totals_v1;
  liveSessionIds: readonly string[];
}>;

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function summarizeSessionRowsV1(
  rows: readonly session_row_v1[],
): decibel_lifetime_session_totals_v1 {
  let volumeUsd = 0;
  let netPnlUsd = 0;
  let feesUsd = 0;
  let incompletePnlCount = 0;
  let sessionCount = 0;
  for (const row of rows) {
    if (finite(row.started_at) === null) continue;
    sessionCount += 1;
    volumeUsd +=
      finite(row.total_executed_volume_usd) ??
      (finite(row.maker_volume_usd) ?? 0) + (finite(row.taker_volume_usd) ?? 0);
    const pnl = finite(row.session_pnl_usd);
    if (row.pnl_complete === 1 && pnl !== null) {
      netPnlUsd += pnl;
      feesUsd += finite(row.fees_usd) ?? 0;
    } else incompletePnlCount += 1;
  }
  return Object.freeze({ sessionCount, volumeUsd, netPnlUsd, feesUsd, incompletePnlCount });
}

const tableExists = (db: Database.Database, name: string) =>
  db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name) !== undefined;

function readArchiveV1(db: Database.Database): decibel_lifetime_session_totals_v1 {
  const empty = { sessionCount: 0, volumeUsd: 0, netPnlUsd: 0, feesUsd: 0, incompletePnlCount: 0 };
  if (!tableExists(db, DECIBEL_LIFETIME_ARCHIVE_TABLE_V1)) return Object.freeze(empty);
  const row = db
    .prepare(
      `SELECT session_count sessionCount, volume_usd volumeUsd, net_pnl_usd netPnlUsd,
        fees_usd feesUsd, incomplete_pnl_count incompletePnlCount
       FROM ${DECIBEL_LIFETIME_ARCHIVE_TABLE_V1} WHERE id=1`,
    )
    .get() as decibel_lifetime_session_totals_v1 | undefined;
  return Object.freeze(row ?? empty);
}

/**
 * Adds the given session rows to the archive. Call inside the transaction that deletes
 * them. Rows that never started add nothing.
 */
export function archiveDecibelSessionRowsV1(
  db: Database.Database,
  sessionIds: readonly string[],
  now: number,
): decibel_lifetime_session_totals_v1 {
  db.exec(`CREATE TABLE IF NOT EXISTS ${DECIBEL_LIFETIME_ARCHIVE_TABLE_V1}(
    id INTEGER PRIMARY KEY CHECK(id=1), session_count INTEGER NOT NULL, volume_usd REAL NOT NULL,
    net_pnl_usd REAL NOT NULL, fees_usd REAL NOT NULL, incomplete_pnl_count INTEGER NOT NULL,
    updated_at INTEGER NOT NULL)`);
  const select = db.prepare('SELECT * FROM production_sessions_v1 WHERE session_id=?');
  const rows = sessionIds
    .map((id) => select.get(id) as session_row_v1 | undefined)
    .filter((row): row is session_row_v1 => row !== undefined);
  const added = summarizeSessionRowsV1(rows);
  db.prepare(
    `INSERT INTO ${DECIBEL_LIFETIME_ARCHIVE_TABLE_V1}
       (id,session_count,volume_usd,net_pnl_usd,fees_usd,incomplete_pnl_count,updated_at)
     VALUES(1,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET session_count=session_count+excluded.session_count,
       volume_usd=volume_usd+excluded.volume_usd, net_pnl_usd=net_pnl_usd+excluded.net_pnl_usd,
       fees_usd=fees_usd+excluded.fees_usd,
       incomplete_pnl_count=incomplete_pnl_count+excluded.incomplete_pnl_count,
       updated_at=excluded.updated_at`,
  ).run(
    added.sessionCount,
    added.volumeUsd,
    added.netPnlUsd,
    added.feesUsd,
    added.incompletePnlCount,
    now,
  );
  return added;
}

/** UI-only read model; opens the session store read-only and never creates it. */
export function readDecibelOverviewLifetimeTotalsV1(
  path: string,
): decibel_overview_lifetime_totals_v1 | null {
  if (!existsSync(path)) return null;
  try {
    const Reader = new Database(path, { readonly: true, fileMustExist: true });
    try {
      if (!tableExists(Reader, 'production_sessions_v1')) return null;
      const rows = Reader.prepare('SELECT * FROM production_sessions_v1').all() as session_row_v1[];
      const live = rows.filter(
        (row) => typeof row.status === 'string' && LIVE_STATUSES.has(row.status),
      );
      const closedRows = rows.filter((row) => !live.includes(row));
      const archive = readArchiveV1(Reader);
      const closed = summarizeSessionRowsV1(closedRows);
      const liveStarted = live.filter((row) => finite(row.started_at) !== null).length;
      return Object.freeze({
        sessionCount: archive.sessionCount + closed.sessionCount + liveStarted,
        closed: Object.freeze({
          sessionCount: archive.sessionCount + closed.sessionCount,
          volumeUsd: archive.volumeUsd + closed.volumeUsd,
          netPnlUsd: archive.netPnlUsd + closed.netPnlUsd,
          feesUsd: archive.feesUsd + closed.feesUsd,
          incompletePnlCount: archive.incompletePnlCount + closed.incompletePnlCount,
        }),
        liveSessionIds: Object.freeze(
          live.map((row) => row.session_id).filter((id): id is string => typeof id === 'string'),
        ),
      });
    } finally {
      Reader.close();
    }
  } catch {
    return null;
  }
}

/**
 * Lifetime figures in real time: closed totals plus the live session, counted only when the
 * session store still lists it as live (an ended session is already in the closed totals).
 */
export function combineDecibelLifetimeTotalsV1(
  totals: decibel_overview_lifetime_totals_v1 | null,
  live: Readonly<{
    sessionId: string | null;
    volumeUsd: number | null;
    netPnlUsd: number | null;
    feesUsd: number | null;
  }>,
): Readonly<{
  volumeUsd: number | null;
  netPnlUsd: number | null;
  grossPnlUsd: number | null;
  incompletePnlCount: number | null;
}> {
  if (totals === null)
    return { volumeUsd: null, netPnlUsd: null, grossPnlUsd: null, incompletePnlCount: null };
  const counted = live.sessionId !== null && totals.liveSessionIds.includes(live.sessionId);
  const closed = totals.closed;
  if (!counted)
    return {
      volumeUsd: closed.volumeUsd,
      netPnlUsd: closed.netPnlUsd,
      grossPnlUsd: closed.netPnlUsd + closed.feesUsd,
      incompletePnlCount: closed.incompletePnlCount,
    };
  const pnlKnown = finite(live.netPnlUsd) !== null && finite(live.feesUsd) !== null;
  return {
    volumeUsd: finite(live.volumeUsd) === null ? null : closed.volumeUsd + live.volumeUsd!,
    netPnlUsd: pnlKnown ? closed.netPnlUsd + live.netPnlUsd! : null,
    grossPnlUsd: pnlKnown
      ? closed.netPnlUsd + closed.feesUsd + live.netPnlUsd! + live.feesUsd!
      : null,
    incompletePnlCount: closed.incompletePnlCount,
  };
}
