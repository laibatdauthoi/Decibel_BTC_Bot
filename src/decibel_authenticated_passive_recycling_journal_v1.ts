import Database from 'better-sqlite3';

export type decibel_recycling_journal_state_v1 =
  | 'HANDOFF_READY'
  | 'UI_CAPTURE_WAITING'
  | 'UI_ORDER_CAPTURED'
  | 'ORDER_OPEN'
  | 'PARTIAL_FILL'
  | 'FULL_FILL_RECONCILED'
  | 'CYCLE_COMPLETED'
  | 'BLOCKED';

export class decibel_authenticated_passive_recycling_journal_v1 {
  private readonly database: Database.Database;
  constructor(path: string) {
    this.database = new Database(path);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('synchronous = FULL');
    this.database.exec(`CREATE TABLE IF NOT EXISTS recycling_operator_cycle_v1(
      recycling_handoff_id TEXT PRIMARY KEY,
      handoff_package_hash TEXT NOT NULL,
      state TEXT NOT NULL,
      handoff_json TEXT NOT NULL,
      capture_json TEXT,
      reconciliation_json TEXT,
      updated_at INTEGER NOT NULL
    )`);
  }
  recordHandoff(handoff: { recyclingHandoffId: string; handoffPackageHash: string }, at: number) {
    const json = JSON.stringify(handoff);
    const prior = this.get(handoff.recyclingHandoffId);
    if (prior !== null) {
      if (prior.handoffJson !== json || prior.handoffPackageHash !== handoff.handoffPackageHash)
        throw new Error('RECYCLING_JOURNAL_HANDOFF_IDENTITY_CONFLICT');
      return;
    }
    this.database
      .prepare('INSERT INTO recycling_operator_cycle_v1 VALUES(?,?,?,?,?,?,?)')
      .run(
        handoff.recyclingHandoffId,
        handoff.handoffPackageHash,
        'HANDOFF_READY',
        json,
        null,
        null,
        at,
      );
  }
  recordState(input: {
    recyclingHandoffId: string;
    state: decibel_recycling_journal_state_v1;
    capture?: unknown;
    reconciliation?: unknown;
    at: number;
  }) {
    const prior = this.get(input.recyclingHandoffId);
    if (prior === null) throw new Error('RECYCLING_JOURNAL_HANDOFF_NOT_FOUND');
    const captureJson =
      input.capture === undefined ? prior.captureJson : JSON.stringify(input.capture);
    const reconciliationJson =
      input.reconciliation === undefined
        ? prior.reconciliationJson
        : JSON.stringify(input.reconciliation);
    if (
      prior.captureJson !== null &&
      input.capture !== undefined &&
      prior.captureJson !== captureJson
    )
      throw new Error('RECYCLING_JOURNAL_CAPTURE_IDENTITY_CONFLICT');
    this.database
      .prepare(
        'UPDATE recycling_operator_cycle_v1 SET state=?,capture_json=?,reconciliation_json=?,updated_at=? WHERE recycling_handoff_id=?',
      )
      .run(input.state, captureJson, reconciliationJson, input.at, input.recyclingHandoffId);
  }
  get(recyclingHandoffId: string) {
    const row = this.database
      .prepare('SELECT * FROM recycling_operator_cycle_v1 WHERE recycling_handoff_id=?')
      .get(recyclingHandoffId) as
      | {
          recycling_handoff_id: string;
          handoff_package_hash: string;
          state: decibel_recycling_journal_state_v1;
          handoff_json: string;
          capture_json: string | null;
          reconciliation_json: string | null;
          updated_at: number;
        }
      | undefined;
    return row === undefined
      ? null
      : Object.freeze({
          recyclingHandoffId: row.recycling_handoff_id,
          handoffPackageHash: row.handoff_package_hash,
          state: row.state,
          handoffJson: row.handoff_json,
          captureJson: row.capture_json,
          reconciliationJson: row.reconciliation_json,
          updatedAt: row.updated_at,
        });
  }
  unresolvedCount(): number {
    const row = this.database
      .prepare(
        "SELECT COUNT(*) count FROM recycling_operator_cycle_v1 WHERE state NOT IN ('CYCLE_COMPLETED','FULL_FILL_RECONCILED','BLOCKED')",
      )
      .get() as { count: number };
    return row.count;
  }
  list() {
    const rows = this.database
      .prepare('SELECT * FROM recycling_operator_cycle_v1 ORDER BY updated_at,recycling_handoff_id')
      .all() as Array<{
      recycling_handoff_id: string;
      handoff_package_hash: string;
      state: decibel_recycling_journal_state_v1;
      handoff_json: string;
      capture_json: string | null;
      reconciliation_json: string | null;
      updated_at: number;
    }>;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          recyclingHandoffId: row.recycling_handoff_id,
          handoffPackageHash: row.handoff_package_hash,
          state: row.state,
          handoffJson: row.handoff_json,
          captureJson: row.capture_json,
          reconciliationJson: row.reconciliation_json,
          updatedAt: row.updated_at,
        }),
      ),
    );
  }
  close() {
    this.database.close();
  }
}
