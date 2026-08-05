import Database from 'better-sqlite3';

import {
  RISK_POLICY_VERSION,
  calculateDailyVolume,
  getFinancialDecimal,
  getFinancialUnits,
  type fill_record,
  type proposed_trade_intent,
  type risk_decision,
  type risk_state,
  type risk_state_event,
} from './risk_engine.js';

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE risk_decisions (
        intent_id TEXT PRIMARY KEY, intent_json TEXT NOT NULL, decision_json TEXT NOT NULL,
        policy_version TEXT NOT NULL, configuration_hash TEXT NOT NULL,
        input_snapshot_hash TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE risk_state_transitions (
        transition_id TEXT PRIMARY KEY, previous_state TEXT NOT NULL, next_state TEXT NOT NULL,
        event TEXT NOT NULL, occurred_at TEXT NOT NULL, operator_action_id TEXT
      );
      CREATE TABLE operator_actions (
        action_id TEXT PRIMARY KEY, action TEXT NOT NULL, occurred_at TEXT NOT NULL, note TEXT NOT NULL
      );
      CREATE TABLE risk_fills (
        fill_id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, utc_day TEXT NOT NULL,
        price REAL NOT NULL, quantity REAL NOT NULL, role TEXT NOT NULL, volume REAL NOT NULL
      );
      CREATE TABLE daily_risk_state (
        utc_day TEXT PRIMARY KEY, filled_volume REAL NOT NULL DEFAULT 0,
        start_of_day_equity REAL, realized_pnl REAL, peak_equity REAL,
        drawdown REAL, consecutive_losses INTEGER, cooldown_until TEXT
      );
      CREATE TABLE durable_risk_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), state TEXT NOT NULL,
        updated_at TEXT NOT NULL, policy_version TEXT NOT NULL
      );
      INSERT INTO durable_risk_state(singleton, state, updated_at, policy_version)
      VALUES (1, 'ACTIVE', '1970-01-01T00:00:00.000Z', '${RISK_POLICY_VERSION}');
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE risk_fills ADD COLUMN price_units TEXT NOT NULL DEFAULT '0';
      ALTER TABLE risk_fills ADD COLUMN quantity_units TEXT NOT NULL DEFAULT '0';
      ALTER TABLE risk_fills ADD COLUMN volume_units TEXT NOT NULL DEFAULT '0';
      ALTER TABLE daily_risk_state ADD COLUMN filled_volume_units TEXT NOT NULL DEFAULT '0';
      UPDATE risk_fills SET
        price_units = CAST(CAST(ROUND(price * 100000000.0) AS INTEGER) AS TEXT),
        quantity_units = CAST(CAST(ROUND(quantity * 100000000.0) AS INTEGER) AS TEXT),
        volume_units = CAST(CAST(ROUND(volume * 100000000.0) AS INTEGER) AS TEXT);
      UPDATE daily_risk_state SET
        filled_volume_units = CAST(CAST(ROUND(filled_volume * 100000000.0) AS INTEGER) AS TEXT);
    `,
  },
] as const;

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be finite and positive`);
}

export class risk_repository {
  private readonly database: Database.Database;

  constructor(databasePath: string) {
    this.database = new Database(databasePath, { timeout: 5_000 });
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('busy_timeout = 5000');
    this.migrate();
  }

  private migrate(): void {
    const current = this.database.pragma('user_version', { simple: true }) as number;
    const latest = MIGRATIONS.at(-1)?.version ?? 0;
    if (current > latest)
      throw new Error(
        `Unsafe risk database schema version ${current}; supported version is ${latest}`,
      );
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue;
      this.database.transaction(() => {
        this.database.exec(migration.sql);
        this.database.pragma(`user_version = ${migration.version}`);
      })();
    }
  }

  saveDecision(intent: proposed_trade_intent, decision: risk_decision): 'INSERTED' | 'UNCHANGED' {
    if (intent.intentId !== decision.intentId)
      throw new Error('Risk persistence inconsistent intent ID');
    const intentJSON = JSON.stringify(intent);
    const decisionJSON = JSON.stringify(decision);
    const existing = this.database
      .prepare('SELECT intent_json, decision_json FROM risk_decisions WHERE intent_id = ?')
      .get(intent.intentId) as { intent_json: string; decision_json: string } | undefined;
    if (existing !== undefined) {
      if (existing.intent_json !== intentJSON || existing.decision_json !== decisionJSON)
        throw new Error(`Risk persistence inconsistent duplicate intent: ${intent.intentId}`);
      return 'UNCHANGED';
    }
    this.database
      .prepare(`INSERT INTO risk_decisions VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        intent.intentId,
        intentJSON,
        decisionJSON,
        decision.policyVersion,
        decision.configurationHash,
        decision.inputSnapshotHash,
        decision.decisionTimestamp,
      );
    return 'INSERTED';
  }

  hasIntent(intentId: string): boolean {
    return (
      this.database.prepare('SELECT 1 FROM risk_decisions WHERE intent_id = ?').get(intentId) !==
      undefined
    );
  }

  recordFill(fill: fill_record): 'INSERTED' | 'DUPLICATE' {
    assertFinitePositive(fill.price, 'Fill price');
    assertFinitePositive(fill.quantity, 'Fill quantity');
    const timestamp = new Date(fill.timestamp);
    if (!Number.isFinite(timestamp.getTime())) throw new Error('Invalid fill timestamp');
    const day = timestamp.toISOString().slice(0, 10);
    const priceUnits = getFinancialUnits(fill.price);
    const quantityUnits = getFinancialUnits(fill.quantity);
    const volumeUnits = (priceUnits * quantityUnits) / 100_000_000n;
    const normalizedPrice = getFinancialDecimal(priceUnits);
    const normalizedQuantity = getFinancialDecimal(quantityUnits);
    const volume = getFinancialDecimal(volumeUnits);
    return this.database.transaction(() => {
      const existing = this.database
        .prepare('SELECT * FROM risk_fills WHERE fill_id = ?')
        .get(fill.fillId) as
        | { timestamp: string; price_units: string; quantity_units: string; role: string }
        | undefined;
      if (existing !== undefined) {
        if (
          existing.timestamp !== fill.timestamp ||
          existing.price_units !== priceUnits.toString() ||
          existing.quantity_units !== quantityUnits.toString() ||
          existing.role !== fill.role
        )
          throw new Error(`Inconsistent duplicate fill: ${fill.fillId}`);
        return 'DUPLICATE' as const;
      }
      this.database
        .prepare(
          `INSERT INTO risk_fills(
          fill_id, timestamp, utc_day, price, quantity, role, volume,
          price_units, quantity_units, volume_units
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          fill.fillId,
          fill.timestamp,
          day,
          normalizedPrice,
          normalizedQuantity,
          fill.role,
          volume,
          priceUnits.toString(),
          quantityUnits.toString(),
          volumeUnits.toString(),
        );
      const existingDay = this.database
        .prepare('SELECT filled_volume_units FROM daily_risk_state WHERE utc_day = ?')
        .get(day) as { filled_volume_units: string } | undefined;
      const accumulatedUnits = BigInt(existingDay?.filled_volume_units ?? '0') + volumeUnits;
      this.database
        .prepare(
          `INSERT INTO daily_risk_state(utc_day, filled_volume, filled_volume_units) VALUES (?, ?, ?)
        ON CONFLICT(utc_day) DO UPDATE SET
          filled_volume = excluded.filled_volume,
          filled_volume_units = excluded.filled_volume_units`,
        )
        .run(day, getFinancialDecimal(accumulatedUnits), accumulatedUnits.toString());
      return 'INSERTED' as const;
    })();
  }

  getDailyVolume(utcDay: string): number {
    const row = this.database
      .prepare('SELECT filled_volume_units FROM daily_risk_state WHERE utc_day = ?')
      .get(utcDay) as { filled_volume_units: string } | undefined;
    return row === undefined ? 0 : getFinancialDecimal(BigInt(row.filled_volume_units));
  }

  getDailyVolumeStatus(targetUSD: number, now: string) {
    const fills = this.database
      .prepare(
        'SELECT fill_id AS fillId, timestamp, price, quantity, role FROM risk_fills WHERE utc_day = ?',
      )
      .all(now.slice(0, 10)) as fill_record[];
    return calculateDailyVolume(fills, targetUSD, now);
  }

  saveTransition(input: {
    transitionId: string;
    previousState: risk_state;
    nextState: risk_state;
    event: risk_state_event;
    occurredAt: string;
    operatorActionId?: string;
  }): 'INSERTED' | 'UNCHANGED' {
    return this.database.transaction(() => {
      const existing = this.database
        .prepare('SELECT * FROM risk_state_transitions WHERE transition_id = ?')
        .get(input.transitionId) as Record<string, unknown> | undefined;
      if (existing !== undefined) return 'UNCHANGED' as const;
      const durableState = this.getRiskState();
      if (durableState !== input.previousState)
        throw new Error(
          `Risk state transition is inconsistent: durable=${durableState}, expected=${input.previousState}`,
        );
      if (input.operatorActionId !== undefined) {
        const action = this.database
          .prepare('SELECT 1 FROM operator_actions WHERE action_id = ?')
          .get(input.operatorActionId);
        if (action === undefined) throw new Error('Audited operator action is unavailable');
      }
      this.database
        .prepare('INSERT INTO risk_state_transitions VALUES (?, ?, ?, ?, ?, ?)')
        .run(
          input.transitionId,
          input.previousState,
          input.nextState,
          input.event,
          input.occurredAt,
          input.operatorActionId ?? null,
        );
      this.database
        .prepare(
          `UPDATE durable_risk_state SET state = ?, updated_at = ?,
        policy_version = ? WHERE singleton = 1`,
        )
        .run(input.nextState, input.occurredAt, RISK_POLICY_VERSION);
      return 'INSERTED' as const;
    })();
  }

  saveOperatorAction(actionId: string, action: string, occurredAt: string, note: string): void {
    this.database
      .prepare('INSERT OR IGNORE INTO operator_actions VALUES (?, ?, ?, ?)')
      .run(actionId, action, occurredAt, note);
  }

  getRiskState(): risk_state {
    return (
      this.database.prepare('SELECT state FROM durable_risk_state WHERE singleton = 1').get() as {
        state: risk_state;
      }
    ).state;
  }

  getSchemaVersion(): number {
    return this.database.pragma('user_version', { simple: true }) as number;
  }
  getJournalMode(): string {
    return this.database.pragma('journal_mode', { simple: true }) as string;
  }
  close(): void {
    this.database.close();
  }
}
