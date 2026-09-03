import Database from 'better-sqlite3';

import type {
  execution_intent_status_v1,
  execution_intent_v1,
} from './decibel_execution_intent_v1.js';

export class decibel_execution_lifecycle_journal_v1 {
  private readonly Database: Database.Database;
  constructor(path: string) {
    this.Database = new Database(path);
    this.Database.pragma('journal_mode = WAL');
    this.Database.pragma('synchronous = FULL');
    this.Database.exec(`
      CREATE TABLE IF NOT EXISTS execution_intents(intent_id TEXT PRIMARY KEY, mutation_key TEXT UNIQUE NOT NULL, body_json TEXT NOT NULL, status TEXT NOT NULL, venue_order_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS mutation_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT NOT NULL, attempted_at INTEGER NOT NULL, outcome TEXT);
      CREATE TABLE IF NOT EXISTS executor_outcomes(id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT NOT NULL, outcome_json TEXT NOT NULL, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reconciliation_observations(id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT NOT NULL, state TEXT NOT NULL, venue_order_id TEXT, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS authenticated_fills(fill_id TEXT PRIMARY KEY, intent_id TEXT, side TEXT NOT NULL, quantity REAL NOT NULL, price REAL NOT NULL, strategy_lineage INTEGER NOT NULL, maker_proven INTEGER NOT NULL, external_counterparty INTEGER NOT NULL, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS lifecycle_transitions(id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT NOT NULL, from_state TEXT, to_state TEXT NOT NULL, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS lifecycle_blockers(id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT, blocker TEXT NOT NULL, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS lifecycle_state(key TEXT PRIMARY KEY, value REAL NOT NULL);
      INSERT OR IGNORE INTO lifecycle_state(key,value) VALUES('inventory',0),('strategy_maker_volume',0),('completed_cycles',0);
    `);
  }
  prepare(intent: execution_intent_v1): { duplicate: boolean } {
    const prior = this.Database.prepare(
      'SELECT body_json FROM execution_intents WHERE mutation_key=?',
    ).get(intent.mutationKey) as { body_json: string } | undefined;
    const body = JSON.stringify(intent);
    if (prior !== undefined) {
      if (prior.body_json !== body) throw new Error('EXECUTION_INTENT_IDENTITY_CONFLICT');
      return { duplicate: true };
    }
    this.Database.prepare('INSERT INTO execution_intents VALUES(?,?,?,?,?,?,?)').run(
      intent.intentId,
      intent.mutationKey,
      body,
      intent.status,
      intent.expectedPreviousVenueOrderId,
      intent.createdAt,
      intent.createdAt,
    );
    return { duplicate: false };
  }
  transition(
    intentId: string,
    status: execution_intent_status_v1,
    at: number,
    venueOrderId?: string,
  ): void {
    const prior = this.get(intentId);
    if (prior === null) throw new Error('EXECUTION_INTENT_NOT_FOUND');
    this.Database.prepare(
      'UPDATE execution_intents SET status=?,venue_order_id=COALESCE(?,venue_order_id),updated_at=? WHERE intent_id=?',
    ).run(status, venueOrderId ?? null, at, intentId);
    this.Database.prepare(
      'INSERT INTO lifecycle_transitions(intent_id,from_state,to_state,observed_at) VALUES(?,?,?,?)',
    ).run(intentId, prior.status, status, at);
  }
  attempt(intentId: string, at: number, outcome?: string): void {
    this.Database.prepare(
      'INSERT INTO mutation_attempts(intent_id,attempted_at,outcome) VALUES(?,?,?)',
    ).run(intentId, at, outcome ?? null);
  }
  recordOutcome(intentId: string, outcome: unknown, at: number): void {
    this.Database.prepare(
      'INSERT INTO executor_outcomes(intent_id,outcome_json,observed_at) VALUES(?,?,?)',
    ).run(intentId, JSON.stringify(outcome), at);
  }
  recordReconciliation(
    intentId: string,
    state: string,
    venueOrderId: string | null,
    at: number,
  ): void {
    this.Database.prepare(
      'INSERT INTO reconciliation_observations(intent_id,state,venue_order_id,observed_at) VALUES(?,?,?,?)',
    ).run(intentId, state, venueOrderId, at);
  }
  recordBlocker(intentId: string | null, blocker: string, at: number): void {
    this.Database.prepare(
      'INSERT INTO lifecycle_blockers(intent_id,blocker,observed_at) VALUES(?,?,?)',
    ).run(intentId, blocker, at);
  }
  get(intentId: string) {
    const row = this.Database.prepare('SELECT * FROM execution_intents WHERE intent_id=?').get(
      intentId,
    ) as Record<string, unknown> | undefined;
    return row === undefined
      ? null
      : {
          intentId: row.intent_id as string,
          status: row.status as execution_intent_status_v1,
          venueOrderId: row.venue_order_id as string | null,
        };
  }
  nonTerminal() {
    return this.Database.prepare(
      "SELECT intent_id intentId,status,venue_order_id venueOrderId FROM execution_intents WHERE status NOT IN ('APPLIED','REJECTED','SUPERSEDED') ORDER BY created_at,intent_id",
    ).all() as Array<{
      intentId: string;
      status: execution_intent_status_v1;
      venueOrderId: string | null;
    }>;
  }
  hasOtherKnownLiveOrder(intentId: string): boolean {
    const row = this.Database.prepare(
      "SELECT 1 FROM execution_intents WHERE intent_id<>? AND venue_order_id IS NOT NULL AND status IN ('ACKNOWLEDGED','RECONCILING') LIMIT 1",
    ).get(intentId);
    return row !== undefined;
  }
  mutationAttemptsSince(since: number, action?: 'PLACE' | 'CANCEL'): number {
    const rows = this.Database.prepare(
      'SELECT i.body_json FROM mutation_attempts a JOIN execution_intents i ON i.intent_id=a.intent_id WHERE a.attempted_at>=?',
    ).all(since) as Array<{ body_json: string }>;
    return action === undefined
      ? rows.length
      : rows.filter((row) => (JSON.parse(row.body_json) as { action: string }).action === action)
          .length;
  }
  applyFill(input: {
    fillId: string;
    intentId: string | null;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    strategyLineage: boolean;
    makerProven: boolean;
    externalCounterparty: boolean;
    observedAt: number;
  }): { duplicate: boolean; inventory: number; strategyMakerVolume: number } {
    const transaction = this.Database.transaction(() => {
      const exists = this.Database.prepare('SELECT 1 FROM authenticated_fills WHERE fill_id=?').get(
        input.fillId,
      );
      if (exists !== undefined) return true;
      this.Database.prepare('INSERT INTO authenticated_fills VALUES(?,?,?,?,?,?,?,?,?)').run(
        input.fillId,
        input.intentId,
        input.side,
        input.quantity,
        input.price,
        Number(input.strategyLineage),
        Number(input.makerProven),
        Number(input.externalCounterparty),
        input.observedAt,
      );
      const signed = input.side === 'BUY' ? input.quantity : -input.quantity;
      this.Database.prepare("UPDATE lifecycle_state SET value=value+? WHERE key='inventory'").run(
        signed,
      );
      if (input.strategyLineage && input.makerProven && input.externalCounterparty)
        this.Database.prepare(
          "UPDATE lifecycle_state SET value=value+? WHERE key='strategy_maker_volume'",
        ).run(input.price * input.quantity);
      return false;
    });
    const duplicate = transaction();
    return { duplicate, ...this.ledger() };
  }
  ledger() {
    const rows = this.Database.prepare('SELECT key,value FROM lifecycle_state').all() as Array<{
      key: string;
      value: number;
    }>;
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      inventory: values.inventory ?? 0,
      strategyMakerVolume: values.strategy_maker_volume ?? 0,
      completedCycles: values.completed_cycles ?? 0,
    };
  }
  incrementCycles(): void {
    this.Database.prepare(
      "UPDATE lifecycle_state SET value=value+1 WHERE key='completed_cycles'",
    ).run();
  }
  close(): void {
    this.Database.close();
  }
}
