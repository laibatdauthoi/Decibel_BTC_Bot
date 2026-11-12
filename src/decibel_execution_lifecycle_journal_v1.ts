import type { decibel_entry_cycle_fill_v1 } from './decibel_entry_cycle_v1.js';
import { getDecibelQuantityUnitsV1 } from './decibel_chain_units_v1.js';
import { createHash } from 'node:crypto';
import { planDecibelHistoricalFillRecoveryV1 } from './decibel_authenticated_btc_activity_resync_v1.js';
import Database from 'better-sqlite3';

import type {
  execution_intent_status_v1,
  execution_intent_v1,
} from './decibel_execution_intent_v1.js';

type false_flat_checkpoint_open_recovery_input_v1 = Readonly<{
  recoveryId: string;
  intentId: string;
  venueOrderId: string;
  clientOrderId: string;
  now: number;
  maximumEvidenceAgeMs: number;
  evidence: Readonly<{
    observedAt: number;
    remainingQuantity: number;
    transactionHash: string | null;
  }>;
  authorization: Readonly<{
    scope: 'FALSE_FLAT_CHECKPOINT_OPEN_RECOVERY';
    authorizationId: string;
    operatorId: string;
    authorizedAt: number;
    reason: string;
  }>;
}>;

export type false_flat_checkpoint_cancelled_recovery_input_v1 = Readonly<{
  recoveryId: string;
  intentId: string;
  venueOrderId: string;
  clientOrderId: string;
  side: 'BUY' | 'SELL';
  market: string;
  quantity: number;
  now: number;
  maximumEvidenceAgeMs: number;
  evidence: Readonly<{
    source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY';
    observedAt: number;
    terminalState: 'CANCELLED';
    remainingQuantity: 0;
    matchingFillCount: 0;
    transactionHash: string;
    transactionState: 'COMMITTED';
  }>;
  authorization: Readonly<{
    scope: 'FALSE_FLAT_CHECKPOINT_CANCELLED_RECOVERY';
    authorizationId: string;
    operatorId: string;
    authorizedAt: number;
    reason: string;
  }>;
}>;

export type terminal_identity_conflict_full_fill_recovery_input_v1 = Readonly<{
  recoveryId: string;
  intentId: string;
  venueOrderId: string;
  clientOrderId: string;
  side: 'BUY' | 'SELL';
  market: string;
  quantity: number;
  price: number;
  now: number;
  maximumEvidenceAgeMs: number;
  evidence: Readonly<{
    source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY';
    observedAt: number;
    terminalState: 'FILLED';
    remainingQuantity: 0;
    transactionHash: string;
    transactionState: 'COMMITTED';
    fillId: string;
    fillQuantity: number;
    fillPrice: number;
    fillTransactionTimestamp: number;
  }>;
  authorization: Readonly<{
    scope: 'TERMINAL_IDENTITY_CONFLICT_FULL_FILL_RECOVERY';
    authorizationId: string;
    operatorId: string;
    authorizedAt: number;
    reason: string;
  }>;
}>;

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
      CREATE TABLE IF NOT EXISTS execution_stage_timings(id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT NOT NULL, stage TEXT NOT NULL, observed_at INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reconciliation_observations(id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT NOT NULL, state TEXT NOT NULL, venue_order_id TEXT, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reconciliation_provenance(id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT NOT NULL, source TEXT NOT NULL, matched_identifier TEXT NOT NULL, venue_status TEXT NOT NULL, remaining_quantity REAL, transaction_hash TEXT, venue_order_id TEXT, client_order_id TEXT, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reconciliation_fill_provenance(fill_id TEXT PRIMARY KEY, intent_id TEXT NOT NULL, venue_order_id TEXT NOT NULL, client_order_id TEXT NOT NULL, quantity REAL NOT NULL, price REAL NOT NULL, transaction_version TEXT NOT NULL, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS historical_duplicate_recoveries(recovery_id TEXT PRIMARY KEY, original_intent_id TEXT NOT NULL, duplicate_intent_id TEXT NOT NULL, venue_order_id TEXT NOT NULL, client_order_id TEXT NOT NULL, evidence_source TEXT NOT NULL, evidence_observed_at INTEGER NOT NULL, operator_id TEXT NOT NULL, authorization_id TEXT NOT NULL, authorized_at INTEGER NOT NULL, reason TEXT NOT NULL, recovered_at INTEGER NOT NULL, outcome TEXT NOT NULL, UNIQUE(original_intent_id,duplicate_intent_id));
      CREATE TABLE IF NOT EXISTS false_flat_checkpoint_recoveries(recovery_id TEXT PRIMARY KEY, intent_id TEXT NOT NULL UNIQUE, venue_order_id TEXT NOT NULL, client_order_id TEXT NOT NULL, evidence_observed_at INTEGER NOT NULL, remaining_quantity REAL NOT NULL, transaction_hash TEXT, operator_id TEXT NOT NULL, authorization_id TEXT NOT NULL, authorized_at INTEGER NOT NULL, reason TEXT NOT NULL, recovered_at INTEGER NOT NULL, outcome TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS terminal_identity_conflict_recoveries(recovery_id TEXT PRIMARY KEY, intent_id TEXT NOT NULL UNIQUE, venue_order_id TEXT NOT NULL, client_order_id TEXT NOT NULL, evidence_observed_at INTEGER NOT NULL, transaction_hash TEXT NOT NULL, fill_id TEXT NOT NULL, fill_quantity REAL NOT NULL, fill_price REAL NOT NULL, fill_transaction_timestamp INTEGER NOT NULL, operator_id TEXT NOT NULL, authorization_id TEXT NOT NULL, authorized_at INTEGER NOT NULL, reason TEXT NOT NULL, recovered_at INTEGER NOT NULL, outcome TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reconciliation_identity_conflicts(intent_id TEXT PRIMARY KEY, blocker TEXT NOT NULL, first_observed_at INTEGER NOT NULL, last_observed_at INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('ACTIVE','RESOLVED')), resolved_at INTEGER, resolution TEXT);
      CREATE TABLE IF NOT EXISTS reconciliation_decisions(id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT NOT NULL, venue_order_id TEXT, reason TEXT NOT NULL, evidence_source TEXT NOT NULL, evidence_age_ms INTEGER, next_action TEXT NOT NULL, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS mainnet_reconciliation_observations(id INTEGER PRIMARY KEY AUTOINCREMENT, observed_at INTEGER NOT NULL, market_address TEXT NOT NULL, btc_position_base REAL NOT NULL, btc_open_order_ids_json TEXT NOT NULL, btc_authenticated_fill_ids_json TEXT NOT NULL, foreign_open_order_ids_json TEXT NOT NULL, inventory_state TEXT NOT NULL, source_snapshot_hash TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS authenticated_fill_aliases(alias_fill_id TEXT PRIMARY KEY,fill_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS historical_fill_recovery_evidence(execution_id TEXT PRIMARY KEY, plan_hash TEXT NOT NULL, evidence_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS authenticated_fills(fill_id TEXT PRIMARY KEY, intent_id TEXT, side TEXT NOT NULL, quantity REAL NOT NULL, price REAL NOT NULL, strategy_lineage INTEGER NOT NULL, maker_proven INTEGER NOT NULL, external_counterparty INTEGER NOT NULL, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS lifecycle_transitions(id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT NOT NULL, from_state TEXT, to_state TEXT NOT NULL, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS lifecycle_blockers(id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT, blocker TEXT NOT NULL, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS strategy_decision_snapshots(cycle_sequence INTEGER PRIMARY KEY, snapshot_json TEXT NOT NULL, observed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS lifecycle_state(key TEXT PRIMARY KEY, value REAL NOT NULL);
      CREATE INDEX IF NOT EXISTS executor_outcomes_intent_id_id ON executor_outcomes(intent_id,id DESC);
      CREATE INDEX IF NOT EXISTS execution_stage_timings_intent_id_id ON execution_stage_timings(intent_id,id);
      CREATE INDEX IF NOT EXISTS reconciliation_observations_intent_id_id ON reconciliation_observations(intent_id,id DESC);
      CREATE INDEX IF NOT EXISTS reconciliation_provenance_intent_id_observed_at ON reconciliation_provenance(intent_id,observed_at DESC);
      CREATE INDEX IF NOT EXISTS lifecycle_blockers_intent_id_id ON lifecycle_blockers(intent_id,id DESC);
      -- execution_intents grows without bound; without these indexes the per-cycle lookups
      -- below were full scans (35-67 ms each, ~0.8 s of synchronous work per cycle at 37k
      -- intents). Each index matches the exact expression used by the queries. The
      -- terminal-status list must stay identical to the NOT IN lists in the queries.
      CREATE INDEX IF NOT EXISTS execution_intents_nonterminal_created ON execution_intents(created_at,intent_id) WHERE status NOT IN ('APPLIED','EXTERNALLY_NEUTRALIZED','CANCELLED_EXTERNALLY','FAILED_TIMEOUT','FAILED_DROPPED','FAILED_DROPPED_LEGACY','REJECTED','SUPERSEDED');
      CREATE INDEX IF NOT EXISTS execution_intents_venue_order ON execution_intents(venue_order_id);
      CREATE INDEX IF NOT EXISTS execution_intents_status ON execution_intents(status);
      CREATE INDEX IF NOT EXISTS execution_intents_session ON execution_intents(json_extract(body_json,'$.sessionId'));
      CREATE INDEX IF NOT EXISTS execution_intents_cancel_reason ON execution_intents(json_extract(body_json,'$.cancelReason'));
      INSERT OR IGNORE INTO reconciliation_identity_conflicts(intent_id,blocker,first_observed_at,last_observed_at,status,resolved_at,resolution)
      SELECT b.intent_id,b.blocker,MIN(b.observed_at),MAX(b.observed_at),'ACTIVE',NULL,NULL
      FROM lifecycle_blockers b
      WHERE b.intent_id IS NOT NULL
        AND b.blocker='PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT'
      GROUP BY b.intent_id;
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

  claimForSubmission(
    intent: execution_intent_v1,
    independentProtectiveRecoveryIntentIds?: readonly string[],
    verifiedEntryCancelOwnerIntentIds?: readonly string[],
  ): Readonly<{
    duplicate: boolean;
    intentId: string;
  }> {
    const independentIds = independentProtectiveRecoveryIntentIds ?? [];
    const claim = this.Database.transaction(() => {
      const body = JSON.stringify(intent);
      const priorMutation = this.Database.prepare(
        'SELECT intent_id intentId,body_json bodyJson FROM execution_intents WHERE mutation_key=?',
      ).get(intent.mutationKey) as { intentId: string; bodyJson: string } | undefined;
      if (priorMutation !== undefined) {
        if (priorMutation.bodyJson !== body) throw new Error('EXECUTION_INTENT_IDENTITY_CONFLICT');
        return { duplicate: true, intentId: priorMutation.intentId };
      }
      if (intent.action === 'PLACE') {
        const priorClientOrderIdentity = this.Database.prepare(
          "SELECT intent_id intentId FROM execution_intents WHERE json_extract(body_json,'$.action')='PLACE' AND json_extract(body_json,'$.clientOrderId')=? LIMIT 1",
        ).get(intent.clientOrderId) as { intentId: string } | undefined;
        if (priorClientOrderIdentity !== undefined)
          throw new Error('EXECUTION_CLIENT_ORDER_ID_ALREADY_USED');
      }
      if (
        independentProtectiveRecoveryIntentIds !== undefined &&
        this.getActiveIdentityConflicts().some(
          (conflict) => !independentIds.includes(conflict.intentId),
        )
      )
        throw new Error('PROTECTIVE_IDENTITY_CONFLICT_CHANGED');
      const activeRows = this.Database.prepare(
        "SELECT intent_id intentId,status,venue_order_id venueOrderId,body_json bodyJson FROM execution_intents WHERE status NOT IN ('APPLIED','EXTERNALLY_NEUTRALIZED','CANCELLED_EXTERNALLY','FAILED_TIMEOUT','FAILED_DROPPED','FAILED_DROPPED_LEGACY','REJECTED','SUPERSEDED') ORDER BY created_at,intent_id",
      ).all() as Array<{
        intentId: string;
        status: execution_intent_status_v1;
        venueOrderId: string | null;
        bodyJson: string;
      }>;
      if (verifiedEntryCancelOwnerIntentIds !== undefined) {
        const target = activeRows.find(
          (row) =>
            row.venueOrderId ===
              (intent.action === 'CANCEL' ? intent.expectedPreviousVenueOrderId : null) &&
            verifiedEntryCancelOwnerIntentIds.includes(row.intentId),
        );
        const original = target && (JSON.parse(target.bodyJson) as execution_intent_v1 | undefined);
        if (
          intent.action !== 'CANCEL' ||
          !target ||
          !original ||
          original.action !== 'PLACE' ||
          original.reduceOnly ||
          !['ACKNOWLEDGED', 'RECONCILING'].includes(target.status) ||
          original.clientOrderId !== intent.clientOrderId ||
          original.side !== intent.side ||
          original.sessionId !== intent.sessionId ||
          original.market !== intent.market ||
          original.priceTicks !== intent.priceTicks ||
          intent.quantity > original.quantity + 1e-12
        )
          throw new Error('RECOVERY_ENTRY_CANCEL_OWNERSHIP_CHANGED');
      }
      if (
        independentProtectiveRecoveryIntentIds !== undefined &&
        activeRows.some((active) => {
          if (independentIds.includes(active.intentId)) return false;
          const body = JSON.parse(active.bodyJson) as execution_intent_v1;
          return !(
            intent.action === 'CANCEL' &&
            verifiedEntryCancelOwnerIntentIds?.includes(active.intentId) &&
            body.action === 'PLACE' &&
            ['ACKNOWLEDGED', 'RECONCILING'].includes(active.status) &&
            body.sessionId === intent.sessionId &&
            body.market === intent.market &&
            (active.venueOrderId !== intent.expectedPreviousVenueOrderId ||
              (body.clientOrderId === intent.clientOrderId &&
                body.side === intent.side &&
                body.priceTicks === intent.priceTicks &&
                intent.quantity <= body.quantity + 1e-12))
          );
        })
      )
        throw new Error('PROTECTIVE_OUTSTANDING_SUBMISSION_CHANGED');
      const conflict = activeRows.find((active) => {
        const activeIntent = JSON.parse(active.bodyJson) as execution_intent_v1;
        if (independentIds.includes(active.intentId)) {
          if (
            !(
              (intent.action === 'PLACE' &&
                intent.reduceOnly &&
                intent.timeInForce === 'PostOnly') ||
              (intent.action === 'CANCEL' && verifiedEntryCancelOwnerIntentIds !== undefined)
            ) ||
            activeIntent.action !== 'CANCEL' ||
            !['ACKNOWLEDGED', 'RECONCILING', 'UNRESOLVABLE_ACK'].includes(active.status)
          )
            throw new Error('PROTECTIVE_RECOVERY_CLAIM_SCOPE_INVALID');
          return false;
        }
        if (
          intent.action === 'CANCEL' &&
          verifiedEntryCancelOwnerIntentIds?.includes(active.intentId)
        )
          return false;
        if (activeIntent.side !== intent.side) return false;
        if (intent.action === 'PLACE') return true;
        if (activeIntent.action === 'CANCEL') return true;
        const isExactCancelOfAcknowledgedPlace =
          (active.status === 'ACKNOWLEDGED' || active.status === 'RECONCILING') &&
          active.venueOrderId === intent.expectedPreviousVenueOrderId;
        return !isExactCancelOfAcknowledgedPlace;
      });
      if (conflict !== undefined) return { duplicate: true, intentId: conflict.intentId };
      this.Database.prepare('INSERT INTO execution_intents VALUES(?,?,?,?,?,?,?)').run(
        intent.intentId,
        intent.mutationKey,
        body,
        intent.status,
        intent.expectedPreviousVenueOrderId,
        intent.createdAt,
        intent.createdAt,
      );
      return { duplicate: false, intentId: intent.intentId };
    });
    return Object.freeze(claim.immediate());
  }

  adoptAuthoritativeOpenOrder(
    input: Readonly<{
      intent: execution_intent_v1;
      venueOrderId: string;
      observedAt: number;
      remainingQuantity: number;
    }>,
  ):
    | Readonly<{ outcome: 'ALREADY_OWNED'; intentId: string }>
    | Readonly<{ outcome: 'STALE_OPEN_IGNORED'; intentId: string }>
    | Readonly<{ outcome: 'UNOWNED' }>
    | Readonly<{
        outcome: 'IDENTITY_CONFLICT';
        intentId: string;
        status: execution_intent_status_v1;
      }> {
    if (input.intent.action !== 'PLACE') throw new Error('EXECUTION_ADOPTION_REQUIRES_PLACE');
    if (input.venueOrderId.length === 0 || input.intent.clientOrderId.length === 0)
      throw new Error('EXECUTION_ADOPTION_IDENTITY_REQUIRED');
    const adopt = this.Database.transaction(() => {
      const rows = this.Database.prepare(
        `SELECT intent_id intentId,status,venue_order_id venueOrderId,body_json bodyJson
         FROM execution_intents
         WHERE json_extract(body_json,'$.action')='PLACE'
           AND (venue_order_id=? OR json_extract(body_json,'$.clientOrderId')=?)
         ORDER BY created_at,intent_id`,
      ).all(input.venueOrderId, input.intent.clientOrderId) as Array<{
        intentId: string;
        status: execution_intent_status_v1;
        venueOrderId: string | null;
        bodyJson: string;
      }>;
      if (rows.length > 0) {
        const exact = rows.find((row) => {
          const prior = JSON.parse(row.bodyJson) as execution_intent_v1;
          return (
            prior.action === 'PLACE' &&
            prior.clientOrderId === input.intent.clientOrderId &&
            row.venueOrderId === input.venueOrderId
          );
        });
        const owner = exact ?? rows[0]!;
        const terminal = [
          'APPLIED',
          'EXTERNALLY_NEUTRALIZED',
          'CANCELLED_EXTERNALLY',
          'FAILED_TIMEOUT',
          'FAILED_DROPPED',
          'FAILED_DROPPED_LEGACY',
          'REJECTED',
          'SUPERSEDED',
        ].includes(owner.status);
        if (rows.length === 1 && exact !== undefined && !terminal)
          return { outcome: 'ALREADY_OWNED' as const, intentId: owner.intentId };
        if (rows.length === 1 && exact !== undefined && terminal) {
          const provenance = this.getLatestReconciliationProvenance(owner.intentId);
          if (
            provenance !== null &&
            provenance.venueOrderId === input.venueOrderId &&
            provenance.clientOrderId === input.intent.clientOrderId &&
            (provenance.venueStatus === 'FILLED' ||
              provenance.venueStatus === 'CANCELLED' ||
              provenance.venueStatus === 'EXPIRED' ||
              provenance.venueStatus === 'REJECTED')
          )
            return { outcome: 'STALE_OPEN_IGNORED' as const, intentId: owner.intentId };
        }
        return {
          outcome: 'IDENTITY_CONFLICT' as const,
          intentId: owner.intentId,
          status: owner.status,
        };
      }

      // An authenticated order proves existence, not that this process placed
      // it. Never manufacture a PLACE owner from a strategy-shaped client ID.
      return { outcome: 'UNOWNED' as const };
    });
    return Object.freeze(adopt.immediate());
  }

  findPlaceByExactIdentity(
    venueOrderId: string,
    clientOrderId: string,
  ): Readonly<{
    intentId: string;
    status: execution_intent_status_v1;
    venueOrderId: string;
  }> | null {
    const row = this.Database.prepare(
      `SELECT intent_id intentId,status,venue_order_id venueOrderId
       FROM execution_intents
       WHERE json_extract(body_json,'$.action')='PLACE'
         AND venue_order_id=?
         AND json_extract(body_json,'$.clientOrderId')=?
       ORDER BY created_at,intent_id
       LIMIT 1`,
    ).get(venueOrderId, clientOrderId) as
      { intentId: string; status: execution_intent_status_v1; venueOrderId: string } | undefined;
    return row === undefined ? null : Object.freeze(row);
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
  recordExecutionStage(intentId: string, stage: string, at: number, elapsedMs: number): void {
    if (
      stage.trim().length === 0 ||
      !Number.isSafeInteger(at) ||
      !Number.isSafeInteger(elapsedMs) ||
      elapsedMs < 0
    )
      throw new Error('EXECUTION_STAGE_TIMING_INVALID');
    this.Database.prepare(
      'INSERT INTO execution_stage_timings(intent_id,stage,observed_at,elapsed_ms) VALUES(?,?,?,?)',
    ).run(intentId, stage, at, elapsedMs);
  }
  getExecutionStageTimings(intentId: string): readonly Readonly<{
    stage: string;
    observedAt: number;
    elapsedMs: number;
  }>[] {
    return Object.freeze(
      this.Database.prepare(
        'SELECT stage,observed_at observedAt,elapsed_ms elapsedMs FROM execution_stage_timings WHERE intent_id=? ORDER BY id',
      ).all(intentId) as Array<{ stage: string; observedAt: number; elapsedMs: number }>,
    );
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

  recordReconciliationDecision(
    input: Readonly<{
      intentId: string;
      venueOrderId: string | null;
      reason: string;
      evidenceSource: string;
      evidenceAgeMs: number | null;
      nextAction: 'APPLY' | 'PRESERVE' | 'REFRESH' | 'BLOCK';
      observedAt: number;
    }>,
  ): void {
    if (
      input.reason.trim().length === 0 ||
      input.evidenceSource.trim().length === 0 ||
      !Number.isSafeInteger(input.observedAt) ||
      (input.evidenceAgeMs !== null &&
        (!Number.isSafeInteger(input.evidenceAgeMs) || input.evidenceAgeMs < 0))
    )
      throw new Error('EXECUTION_RECONCILIATION_DECISION_INVALID');
    this.Database.prepare(
      `INSERT INTO reconciliation_decisions(
        intent_id,venue_order_id,reason,evidence_source,evidence_age_ms,next_action,observed_at
      ) VALUES(?,?,?,?,?,?,?)`,
    ).run(
      input.intentId,
      input.venueOrderId,
      input.reason,
      input.evidenceSource,
      input.evidenceAgeMs,
      input.nextAction,
      input.observedAt,
    );
  }

  recordIdentityConflict(intentId: string, at: number): void {
    const blocker = 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT';
    const persist = this.Database.transaction(() => {
      this.recordBlocker(intentId, blocker, at);
      this.Database.prepare(
        `INSERT INTO reconciliation_identity_conflicts(
          intent_id,blocker,first_observed_at,last_observed_at,status,resolved_at,resolution
        ) VALUES(?,?,?,?, 'ACTIVE',NULL,NULL)
        ON CONFLICT(intent_id) DO UPDATE SET
          blocker=excluded.blocker,last_observed_at=excluded.last_observed_at,
          status='ACTIVE',resolved_at=NULL,resolution=NULL`,
      ).run(intentId, blocker, at, at);
    });
    persist.immediate();
  }

  getActiveIdentityConflict(): Readonly<{
    intentId: string;
    blocker: string;
    firstObservedAt: number;
    lastObservedAt: number;
  }> | null {
    const row = this.Database.prepare(
      `SELECT intent_id intentId,blocker,first_observed_at firstObservedAt,
       last_observed_at lastObservedAt
       FROM reconciliation_identity_conflicts WHERE status='ACTIVE'
       ORDER BY first_observed_at,intent_id LIMIT 1`,
    ).get() as
      | { intentId: string; blocker: string; firstObservedAt: number; lastObservedAt: number }
      | undefined;
    return row === undefined ? null : Object.freeze(row);
  }

  getActiveIdentityConflicts(): readonly Readonly<{ intentId: string; blocker: string }>[] {
    return this.Database.prepare(
      "SELECT intent_id intentId,blocker FROM reconciliation_identity_conflicts WHERE status='ACTIVE' ORDER BY first_observed_at,intent_id",
    ).all() as Readonly<{ intentId: string; blocker: string }>[];
  }

  getExecutionReconciliationBlocker(): string | null {
    const identityConflict = this.getActiveIdentityConflict();
    if (identityConflict !== null) return identityConflict.blocker;
    const unresolved = this.nonTerminal().find(
      (intent) =>
        intent.status === 'SUBMIT_UNKNOWN' ||
        intent.status === 'RECONCILING' ||
        intent.status === 'UNRESOLVABLE_ACK',
    );
    if (unresolved === undefined) return null;
    return unresolved.status === 'UNRESOLVABLE_ACK'
      ? 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK'
      : 'RECONCILIATION_REQUIRED';
  }

  private resolveIdentityConflict(intentId: string, at: number, resolution: string): void {
    this.Database.prepare(
      `UPDATE reconciliation_identity_conflicts
       SET status='RESOLVED',resolved_at=?,resolution=?
       WHERE intent_id=? AND status='ACTIVE'`,
    ).run(at, resolution, intentId);
  }

  applyAuthoritativeReconciliation(
    input: Readonly<{
      intentId: string;
      reconciliationState: string;
      terminalStatus: execution_intent_status_v1;
      source: string;
      matchedIdentifier: string;
      venueStatus: string;
      remainingQuantity: number | null;
      transactionHash: string | null;
      venueOrderId: string | null;
      clientOrderId: string | null;
      observedAt: number;
      fill?: Readonly<{
        fillId: string;
        quantity: number;
        price: number;
        transactionVersion: string;
        transactionTimestamp?: number;
      }>;
      fills?: readonly Readonly<{
        fillId: string;
        quantity: number;
        price: number;
        transactionVersion: string;
        transactionTimestamp?: number;
      }>[];
      decision?: Readonly<{
        reason: string;
        evidenceAgeMs: number | null;
        nextAction: 'APPLY' | 'PRESERVE' | 'REFRESH' | 'BLOCK';
      }>;
    }>,
  ): void {
    const persist = this.Database.transaction(() => {
      const intent = this.get(input.intentId);
      if (intent === null) throw new Error('EXECUTION_INTENT_NOT_FOUND');
      const fills = [...(input.fills ?? []), ...(input.fill === undefined ? [] : [input.fill])];
      const uniqueFills = new Map(fills.map((fill) => [fill.fillId, fill]));
      if (uniqueFills.size !== fills.length)
        for (const fill of fills) {
          const canonical = uniqueFills.get(fill.fillId)!;
          if (
            canonical.quantity !== fill.quantity ||
            canonical.price !== fill.price ||
            canonical.transactionVersion !== fill.transactionVersion
          )
            throw new Error('EXECUTION_AUTHORITATIVE_FILL_IDENTITY_CONFLICT');
        }
      const bodyForQuantity = this.getIntent(input.intentId);
      if (bodyForQuantity === null) throw new Error('EXECUTION_INTENT_NOT_FOUND');
      const known = this.Database.prepare(
        'SELECT fill_id fillId,quantity FROM reconciliation_fill_provenance WHERE intent_id=?',
      ).all(input.intentId) as Array<{ fillId: string; quantity: number }>;
      const mergedQuantity =
        [...uniqueFills.values()].reduce((sum, fill) => sum + fill.quantity, 0) +
        known
          .filter((fill) => !uniqueFills.has(fill.fillId))
          .reduce((sum, fill) => sum + fill.quantity, 0);
      if (!Number.isFinite(mergedQuantity) || mergedQuantity > bodyForQuantity.quantity + 1e-12)
        throw new Error('EXECUTION_AUTHORITATIVE_FILL_QUANTITY_CONFLICT');
      for (const fill of uniqueFills.values()) {
        if (
          (input.terminalStatus !== 'APPLIED' &&
            !(
              input.terminalStatus === 'ACKNOWLEDGED' &&
              input.reconciliationState === 'PARTIAL_FILL'
            ) &&
            !(
              input.terminalStatus === 'CANCELLED_EXTERNALLY' &&
              (input.reconciliationState === 'CANCELLED_EXTERNALLY' ||
                input.reconciliationState === 'ORDER_CANCELLED')
            )) ||
          input.venueOrderId === null ||
          input.clientOrderId === null ||
          !Number.isFinite(fill.quantity) ||
          fill.quantity <= 0 ||
          !Number.isFinite(fill.price) ||
          fill.price <= 0 ||
          fill.transactionVersion.length === 0
        )
          throw new Error('EXECUTION_AUTHORITATIVE_FILL_PROVENANCE_INVALID');
        const prior = this.Database.prepare(
          'SELECT intent_id intentId,venue_order_id venueOrderId,client_order_id clientOrderId,quantity,price,transaction_version transactionVersion FROM reconciliation_fill_provenance WHERE fill_id=?',
        ).get(fill.fillId) as Record<string, unknown> | undefined;
        if (
          prior !== undefined &&
          (prior.intentId !== input.intentId ||
            prior.venueOrderId !== input.venueOrderId ||
            prior.clientOrderId !== input.clientOrderId ||
            prior.quantity !== fill.quantity ||
            prior.price !== fill.price)
        )
          throw new Error('EXECUTION_AUTHORITATIVE_FILL_IDENTITY_CONFLICT');
        if (prior !== undefined && prior.transactionVersion !== fill.transactionVersion) {
          const body = this.getIntent(input.intentId);
          const exactLegacyTimestamp =
            Number.isSafeInteger(fill.transactionTimestamp) &&
            (fill.transactionTimestamp ?? 0) > 0 &&
            prior.transactionVersion === String(fill.transactionTimestamp);
          const exactTerminal =
            intent.status === 'APPLIED' &&
            input.terminalStatus === 'APPLIED' &&
            input.source === 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' &&
            input.venueStatus === 'FILLED' &&
            input.remainingQuantity === 0 &&
            body !== null &&
            body.clientOrderId === input.clientOrderId &&
            intent.venueOrderId === input.venueOrderId &&
            /^[1-9][0-9]*$/.test(fill.transactionVersion) &&
            Math.abs(
              [...uniqueFills.values()].reduce((sum, row) => sum + row.quantity, 0) - body.quantity,
            ) <= 1e-12;
          if (!exactLegacyTimestamp || !exactTerminal)
            throw new Error('EXECUTION_AUTHORITATIVE_FILL_IDENTITY_CONFLICT');
          this.Database.prepare(
            'UPDATE reconciliation_fill_provenance SET transaction_version=? WHERE fill_id=? AND transaction_version=?',
          ).run(fill.transactionVersion, fill.fillId, prior.transactionVersion);
          this.recordReconciliationDecision({
            intentId: input.intentId,
            venueOrderId: input.venueOrderId,
            reason: `LEGACY_TIMESTAMP_VERSION_CORRECTED:${fill.fillId}:${String(prior.transactionVersion)}->${fill.transactionVersion}`,
            evidenceSource: input.source,
            evidenceAgeMs: null,
            nextAction: 'APPLY',
            observedAt: input.observedAt,
          });
        }
      }
      if (input.decision !== undefined)
        this.recordReconciliationDecision({
          intentId: input.intentId,
          venueOrderId: input.venueOrderId,
          reason: input.decision.reason,
          evidenceSource: input.source,
          evidenceAgeMs: input.decision.evidenceAgeMs,
          nextAction: input.decision.nextAction,
          observedAt: input.observedAt,
        });
      const rejectTerminalConflict = (invariant: string): never => {
        const prior = this.getLatestReconciliationProvenance(input.intentId);
        const body = this.getIntent(input.intentId);
        const formatDiagnosticValue = (value: string | number | null | undefined) =>
          String(value ?? 'NONE')
            .replace(/[^A-Za-z0-9_.-]/g, '_')
            .slice(0, 128);
        throw new Error(
          `EXECUTION_AUTHORITATIVE_RECONCILIATION_CONFLICT:INVARIANT=${formatDiagnosticValue(invariant)}:INTENT=${formatDiagnosticValue(input.intentId)}:LOCAL_ORDER=${formatDiagnosticValue(intent.venueOrderId)}:OBSERVED_ORDER=${formatDiagnosticValue(input.venueOrderId)}:LOCAL_CLIENT=${formatDiagnosticValue(body?.clientOrderId)}:OBSERVED_CLIENT=${formatDiagnosticValue(input.clientOrderId)}:LOCAL_STATUS=${formatDiagnosticValue(intent.status)}:PRIOR_SOURCE=${formatDiagnosticValue(prior?.source)}:PRIOR_STATE=${formatDiagnosticValue(prior?.venueStatus)}:OBSERVED_STATE=${formatDiagnosticValue(input.venueStatus)}:PRIOR_REMAINING=${formatDiagnosticValue(prior?.remainingQuantity)}:OBSERVED_REMAINING=${formatDiagnosticValue(input.remainingQuantity)}:PRIOR_AT=${formatDiagnosticValue(prior?.observedAt)}:OBSERVED_AT=${formatDiagnosticValue(input.observedAt)}`,
        );
      };
      if (intent.status === input.terminalStatus && input.terminalStatus !== 'ACKNOWLEDGED') {
        const prior = this.getLatestReconciliationProvenance(input.intentId);
        const body = this.getIntent(input.intentId);
        if (body === null) throw new Error('EXECUTION_INTENT_NOT_FOUND');
        if (
          input.venueOrderId !== intent.venueOrderId ||
          input.clientOrderId !== body.clientOrderId
        )
          rejectTerminalConflict('ORDER_IDENTITY_MISMATCH');
        const persistedFills = this.Database.prepare(
          'SELECT fill_id fillId,quantity FROM reconciliation_fill_provenance WHERE intent_id=?',
        ).all(input.intentId) as Array<{ fillId: string; quantity: number }>;
        const totalFilledQuantity = [...uniqueFills.values()].reduce(
          (sum, fill) => sum + fill.quantity,
          persistedFills
            .filter((fill) => !uniqueFills.has(fill.fillId))
            .reduce((sum, fill) => sum + fill.quantity, 0),
        );
        if (!Number.isFinite(totalFilledQuantity) || totalFilledQuantity > body.quantity + 1e-12)
          throw new Error('EXECUTION_AUTHORITATIVE_FILL_QUANTITY_CONFLICT');
        const matchingFill = [...uniqueFills.values()].every(
          (fill) =>
            this.Database.prepare(
              'SELECT 1 FROM reconciliation_fill_provenance WHERE fill_id=? AND intent_id=? AND venue_order_id=? AND client_order_id=? AND quantity=? AND price=? AND transaction_version=?',
            ).get(
              fill.fillId,
              input.intentId,
              input.venueOrderId,
              input.clientOrderId,
              fill.quantity,
              fill.price,
              fill.transactionVersion,
            ) !== undefined,
        );
        if (
          prior?.transactionHash === input.transactionHash &&
          prior.venueOrderId === input.venueOrderId &&
          prior.clientOrderId === input.clientOrderId &&
          prior.venueStatus === input.venueStatus &&
          matchingFill
        ) {
          this.resolveIdentityConflict(
            input.intentId,
            input.observedAt,
            `AUTHORITATIVE_RECONCILIATION:${input.venueStatus}`,
          );
          return;
        }
        // Terminal order history can report FILLED/CANCELLED before the fill evidence
        // arrives. A later observation of the same terminal outcome that only adds fills
        // is not a contradiction (2026-11-12 live: FILLED with no fills, then FILLED with
        // the exact fill 0.5 s later stopped the session). Identity, status, zero
        // remaining and transaction must agree; total fills stay within the order.
        const sameTerminalAddsFills =
          prior !== null &&
          prior.source === 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' &&
          input.source === 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' &&
          prior.venueStatus === input.venueStatus &&
          (input.venueStatus === 'FILLED' || input.venueStatus === 'CANCELLED') &&
          prior.remainingQuantity === 0 &&
          input.remainingQuantity === 0 &&
          prior.venueOrderId === input.venueOrderId &&
          prior.clientOrderId === input.clientOrderId &&
          (prior.transactionHash === null ||
            input.transactionHash === null ||
            prior.transactionHash === input.transactionHash) &&
          totalFilledQuantity <= body.quantity + 1e-12 &&
          [...uniqueFills.values()].every((fill) => {
            // Only additions: an existing fill must match exactly (repairs of persisted
            // fills keep going through their dedicated paths below).
            const persisted = this.Database.prepare(
              'SELECT intent_id intentId,quantity,price,transaction_version transactionVersion FROM reconciliation_fill_provenance WHERE fill_id=?',
            ).get(fill.fillId) as
              | { intentId: string; quantity: number; price: number; transactionVersion: string }
              | undefined;
            return (
              persisted === undefined ||
              (persisted.intentId === input.intentId &&
                persisted.quantity === fill.quantity &&
                persisted.price === fill.price &&
                persisted.transactionVersion === fill.transactionVersion)
            );
          });
        if (sameTerminalAddsFills) {
          for (const fill of uniqueFills.values())
            this.Database.prepare(
              'INSERT OR IGNORE INTO reconciliation_fill_provenance(fill_id,intent_id,venue_order_id,client_order_id,quantity,price,transaction_version,observed_at) VALUES(?,?,?,?,?,?,?,?)',
            ).run(
              fill.fillId,
              input.intentId,
              input.venueOrderId,
              input.clientOrderId,
              fill.quantity,
              fill.price,
              fill.transactionVersion,
              input.observedAt,
            );
          this.resolveIdentityConflict(
            input.intentId,
            input.observedAt,
            `AUTHORITATIVE_TERMINAL_FILLS_ADDED:${input.venueStatus}`,
          );
          return;
        }
        // Older direct order/fill reconciliation stored the lifecycle label as
        // venueStatus. Exact terminal history can strengthen that cancellation
        // to CANCELLED/zero; it cannot change identity, transaction or fills.
        const confirmingLegacyCancellation =
          prior?.source === 'AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION' &&
          prior.venueStatus === 'CANCELLED_EXTERNALLY' &&
          prior.remainingQuantity === null &&
          prior.transactionHash === input.transactionHash &&
          input.observedAt >= prior.observedAt &&
          input.venueStatus === 'CANCELLED' &&
          intent.status === 'CANCELLED_EXTERNALLY' &&
          input.reconciliationState === 'CANCELLED_EXTERNALLY' &&
          totalFilledQuantity === 0 &&
          uniqueFills.size === 0;
        if (
          input.source === 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' &&
          input.remainingQuantity === 0 &&
          (input.venueStatus === 'CANCELLED' || input.venueStatus === 'FILLED') &&
          (prior === null ||
            ((prior.venueStatus === 'OPEN' ||
              confirmingLegacyCancellation ||
              (prior.venueStatus === 'FULL_FILL' &&
                input.venueStatus === 'FILLED' &&
                intent.status === 'APPLIED' &&
                input.reconciliationState === 'FULL_FILL' &&
                prior.remainingQuantity !== null &&
                prior.remainingQuantity >= 0 &&
                prior.remainingQuantity <= body.quantity + 1e-12)) &&
              prior.venueOrderId === input.venueOrderId &&
              prior.clientOrderId === input.clientOrderId &&
              (prior.transactionHash === null ||
                prior.transactionHash === input.transactionHash))) &&
          input.venueOrderId === intent.venueOrderId &&
          input.clientOrderId === body.clientOrderId &&
          ((input.venueStatus === 'FILLED' && input.terminalStatus === 'APPLIED') ||
            (input.venueStatus === 'CANCELLED' && input.terminalStatus === 'CANCELLED_EXTERNALLY'))
        ) {
          const filledQuantity = [...uniqueFills.values()].reduce(
            (sum, fill) => sum + fill.quantity,
            0,
          );
          if (input.venueStatus === 'FILLED' && Math.abs(filledQuantity - body.quantity) > 1e-12)
            throw new Error('EXECUTION_AUTHORITATIVE_FILL_QUANTITY_CONFLICT');
          this.Database.prepare(
            `INSERT INTO reconciliation_provenance(
              intent_id,source,matched_identifier,venue_status,remaining_quantity,
              transaction_hash,venue_order_id,client_order_id,observed_at
            ) VALUES(?,?,?,?,?,?,?,?,?)`,
          ).run(
            input.intentId,
            input.source,
            input.matchedIdentifier,
            input.venueStatus,
            input.remainingQuantity,
            input.transactionHash,
            input.venueOrderId,
            input.clientOrderId,
            input.observedAt,
          );
          for (const fill of uniqueFills.values())
            this.Database.prepare(
              'INSERT OR IGNORE INTO reconciliation_fill_provenance(fill_id,intent_id,venue_order_id,client_order_id,quantity,price,transaction_version,observed_at) VALUES(?,?,?,?,?,?,?,?)',
            ).run(
              fill.fillId,
              input.intentId,
              input.venueOrderId,
              input.clientOrderId,
              fill.quantity,
              fill.price,
              fill.transactionVersion,
              input.observedAt,
            );
          this.resolveIdentityConflict(
            input.intentId,
            input.observedAt,
            `AUTHORITATIVE_TERMINAL:${input.venueStatus}`,
          );
          return;
        }
        rejectTerminalConflict('TERMINAL_PROVENANCE_CONTRADICTION');
      }
      this.transition(
        input.intentId,
        'RECONCILING',
        input.observedAt,
        input.venueOrderId ?? undefined,
      );
      this.resolveIdentityConflict(
        input.intentId,
        input.observedAt,
        `AUTHORITATIVE_RECONCILIATION:${input.venueStatus}`,
      );
      this.recordReconciliation(
        input.intentId,
        input.reconciliationState,
        input.venueOrderId,
        input.observedAt,
      );
      this.Database.prepare(
        `INSERT INTO reconciliation_provenance(
          intent_id,source,matched_identifier,venue_status,remaining_quantity,
          transaction_hash,venue_order_id,client_order_id,observed_at
        ) VALUES(?,?,?,?,?,?,?,?,?)`,
      ).run(
        input.intentId,
        input.source,
        input.matchedIdentifier,
        input.venueStatus,
        input.remainingQuantity,
        input.transactionHash,
        input.venueOrderId,
        input.clientOrderId,
        input.observedAt,
      );
      for (const fill of uniqueFills.values())
        this.Database.prepare(
          'INSERT OR IGNORE INTO reconciliation_fill_provenance(fill_id,intent_id,venue_order_id,client_order_id,quantity,price,transaction_version,observed_at) VALUES(?,?,?,?,?,?,?,?)',
        ).run(
          fill.fillId,
          input.intentId,
          input.venueOrderId,
          input.clientOrderId,
          fill.quantity,
          fill.price,
          fill.transactionVersion,
          input.observedAt,
        );
      this.transition(
        input.intentId,
        input.terminalStatus,
        input.observedAt,
        input.venueOrderId ?? undefined,
      );
    });
    persist.immediate();
  }

  applyAuthoritativeReconciliationBatch(
    inputs: readonly Parameters<
      decibel_execution_lifecycle_journal_v1['applyAuthoritativeReconciliation']
    >[0][],
  ): void {
    const persist = this.Database.transaction(() => {
      for (const input of inputs) this.applyAuthoritativeReconciliation(input);
    });
    persist.immediate();
  }

  getLatestReconciliationProvenance(intentId: string): Readonly<{
    source: string;
    matchedIdentifier: string;
    venueStatus: string;
    remainingQuantity: number | null;
    transactionHash: string | null;
    venueOrderId: string | null;
    clientOrderId: string | null;
    observedAt: number;
  }> | null {
    const row = this.Database.prepare(
      `SELECT source,matched_identifier matchedIdentifier,venue_status venueStatus,
       remaining_quantity remainingQuantity,transaction_hash transactionHash,
       venue_order_id venueOrderId,client_order_id clientOrderId,observed_at observedAt
       FROM reconciliation_provenance WHERE intent_id=? ORDER BY id DESC LIMIT 1`,
    ).get(intentId) as Record<string, unknown> | undefined;
    return row === undefined
      ? null
      : Object.freeze({
          source: String(row.source),
          matchedIdentifier: String(row.matchedIdentifier),
          venueStatus: String(row.venueStatus),
          remainingQuantity:
            typeof row.remainingQuantity === 'number' ? row.remainingQuantity : null,
          transactionHash: typeof row.transactionHash === 'string' ? row.transactionHash : null,
          venueOrderId: typeof row.venueOrderId === 'string' ? row.venueOrderId : null,
          clientOrderId: typeof row.clientOrderId === 'string' ? row.clientOrderId : null,
          observedAt: Number(row.observedAt),
        });
  }
  recordBlocker(intentId: string | null, blocker: string, at: number): void {
    this.Database.prepare(
      'INSERT INTO lifecycle_blockers(intent_id,blocker,observed_at) VALUES(?,?,?)',
    ).run(intentId, blocker, at);
  }

  markUnresolvableAcknowledgement(intentId: string, at: number): void {
    const persist = this.Database.transaction(() => {
      const intent = this.get(intentId);
      if (intent === null) throw new Error('EXECUTION_INTENT_NOT_FOUND');
      if (intent.status !== 'UNRESOLVABLE_ACK') this.transition(intentId, 'UNRESOLVABLE_ACK', at);
      this.recordBlocker(intentId, 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK', at);
    });
    persist.immediate();
  }

  assessFalseFlatCheckpointOpenRecovery(
    input: false_flat_checkpoint_open_recovery_input_v1,
  ):
    | Readonly<{ eligible: true; outcome: 'READY' | 'ALREADY_APPLIED' }>
    | Readonly<{ eligible: false; blocker: string }> {
    return this.validateFalseFlatCheckpointOpenRecovery(input);
  }

  recoverFalseFlatCheckpointOpenIntent(
    input: false_flat_checkpoint_open_recovery_input_v1,
  ):
    | Readonly<{ outcome: 'APPLIED' | 'ALREADY_APPLIED'; intentId: string }>
    | Readonly<{ outcome: 'REJECTED'; blocker: string }> {
    const recover = this.Database.transaction(() => {
      const validation = this.validateFalseFlatCheckpointOpenRecovery(input);
      if (!validation.eligible)
        return { outcome: 'REJECTED' as const, blocker: validation.blocker };
      if (validation.outcome === 'ALREADY_APPLIED')
        return { outcome: 'ALREADY_APPLIED' as const, intentId: input.intentId };

      this.Database.prepare(
        `UPDATE execution_intents SET status='ACKNOWLEDGED',updated_at=?
         WHERE intent_id=? AND status='EXTERNALLY_NEUTRALIZED' AND venue_order_id=?`,
      ).run(input.now, input.intentId, input.venueOrderId);
      this.Database.prepare(
        'INSERT INTO lifecycle_transitions(intent_id,from_state,to_state,observed_at) VALUES(?,?,?,?)',
      ).run(input.intentId, 'EXTERNALLY_NEUTRALIZED', 'ACKNOWLEDGED', input.now);
      this.Database.prepare(
        'INSERT INTO reconciliation_observations(intent_id,state,venue_order_id,observed_at) VALUES(?,?,?,?)',
      ).run(input.intentId, 'ORDER_OPEN', input.venueOrderId, input.evidence.observedAt);
      this.Database.prepare(
        `INSERT INTO reconciliation_provenance(
          intent_id,source,matched_identifier,venue_status,remaining_quantity,
          transaction_hash,venue_order_id,client_order_id,observed_at
        ) VALUES(?,?,?,?,?,?,?,?,?)`,
      ).run(
        input.intentId,
        'OPERATOR_AUTHORIZED_FALSE_FLAT_CHECKPOINT_RECOVERY',
        `venueOrderId:${input.venueOrderId}`,
        'OPEN',
        input.evidence.remainingQuantity,
        input.evidence.transactionHash,
        input.venueOrderId,
        input.clientOrderId,
        input.evidence.observedAt,
      );
      this.Database.prepare(
        `INSERT INTO false_flat_checkpoint_recoveries(
          recovery_id,intent_id,venue_order_id,client_order_id,evidence_observed_at,
          remaining_quantity,transaction_hash,operator_id,authorization_id,authorized_at,
          reason,recovered_at,outcome
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        input.recoveryId,
        input.intentId,
        input.venueOrderId,
        input.clientOrderId,
        input.evidence.observedAt,
        input.evidence.remainingQuantity,
        input.evidence.transactionHash,
        input.authorization.operatorId,
        input.authorization.authorizationId,
        input.authorization.authorizedAt,
        input.authorization.reason,
        input.now,
        'RESTORED_ACKNOWLEDGED_OPEN',
      );
      this.resolveIdentityConflict(
        input.intentId,
        input.now,
        `AUDITED_RECOVERY:${input.recoveryId}`,
      );
      return { outcome: 'APPLIED' as const, intentId: input.intentId };
    });
    return Object.freeze(recover.immediate());
  }

  assessFalseFlatCheckpointCancelledRecovery(
    input: false_flat_checkpoint_cancelled_recovery_input_v1,
  ):
    | Readonly<{ eligible: true; outcome: 'READY' | 'ALREADY_APPLIED' }>
    | Readonly<{ eligible: false; blocker: string }> {
    return this.validateFalseFlatCheckpointCancelledRecovery(input);
  }

  recoverFalseFlatCheckpointCancelledIntent(
    input: false_flat_checkpoint_cancelled_recovery_input_v1,
  ):
    | Readonly<{ outcome: 'APPLIED' | 'ALREADY_APPLIED'; intentId: string }>
    | Readonly<{ outcome: 'REJECTED'; blocker: string }> {
    const recover = this.Database.transaction(() => {
      const validation = this.validateFalseFlatCheckpointCancelledRecovery(input);
      if (!validation.eligible)
        return { outcome: 'REJECTED' as const, blocker: validation.blocker };
      if (validation.outcome === 'ALREADY_APPLIED')
        return { outcome: 'ALREADY_APPLIED' as const, intentId: input.intentId };

      this.recordReconciliation(
        input.intentId,
        'ORDER_CANCELLED',
        input.venueOrderId,
        input.evidence.observedAt,
      );
      this.Database.prepare(
        `INSERT INTO reconciliation_provenance(
          intent_id,source,matched_identifier,venue_status,remaining_quantity,
          transaction_hash,venue_order_id,client_order_id,observed_at
        ) VALUES(?,?,?,?,?,?,?,?,?)`,
      ).run(
        input.intentId,
        'OPERATOR_AUTHORIZED_FALSE_FLAT_CHECKPOINT_CANCELLED_RECOVERY',
        `venueOrderId:${input.venueOrderId}|clientOrderId:${input.clientOrderId}`,
        'CANCELLED',
        0,
        input.evidence.transactionHash,
        input.venueOrderId,
        input.clientOrderId,
        input.evidence.observedAt,
      );
      this.Database.prepare(
        `INSERT INTO false_flat_checkpoint_recoveries(
          recovery_id,intent_id,venue_order_id,client_order_id,evidence_observed_at,
          remaining_quantity,transaction_hash,operator_id,authorization_id,authorized_at,
          reason,recovered_at,outcome
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        input.recoveryId,
        input.intentId,
        input.venueOrderId,
        input.clientOrderId,
        input.evidence.observedAt,
        0,
        input.evidence.transactionHash,
        input.authorization.operatorId,
        input.authorization.authorizationId,
        input.authorization.authorizedAt,
        input.authorization.reason,
        input.now,
        'CORRECTED_AUTHORITATIVE_CANCELLED',
      );
      this.resolveIdentityConflict(
        input.intentId,
        input.now,
        `AUDITED_CANCELLED_RECOVERY:${input.recoveryId}`,
      );
      return { outcome: 'APPLIED' as const, intentId: input.intentId };
    });
    return Object.freeze(recover.immediate());
  }

  assessTerminalIdentityConflictFullFillRecovery(
    input: terminal_identity_conflict_full_fill_recovery_input_v1,
  ):
    | Readonly<{ eligible: true; outcome: 'READY' | 'ALREADY_APPLIED' }>
    | Readonly<{ eligible: false; blocker: string }> {
    return this.validateTerminalIdentityConflictFullFillRecovery(input);
  }

  recoverTerminalIdentityConflictFullFill(
    input: terminal_identity_conflict_full_fill_recovery_input_v1,
  ):
    | Readonly<{ outcome: 'APPLIED' | 'ALREADY_APPLIED'; intentId: string }>
    | Readonly<{ outcome: 'REJECTED'; blocker: string }> {
    const recover = this.Database.transaction(() => {
      const validation = this.validateTerminalIdentityConflictFullFillRecovery(input);
      if (!validation.eligible)
        return { outcome: 'REJECTED' as const, blocker: validation.blocker };
      if (validation.outcome === 'ALREADY_APPLIED')
        return { outcome: 'ALREADY_APPLIED' as const, intentId: input.intentId };
      this.recordReconciliation(
        input.intentId,
        'FULL_FILL',
        input.venueOrderId,
        input.evidence.observedAt,
      );
      this.Database.prepare(
        `INSERT INTO reconciliation_provenance(
          intent_id,source,matched_identifier,venue_status,remaining_quantity,
          transaction_hash,venue_order_id,client_order_id,observed_at
        ) VALUES(?,?,?,?,?,?,?,?,?)`,
      ).run(
        input.intentId,
        'OPERATOR_AUTHORIZED_TERMINAL_IDENTITY_CONFLICT_RECOVERY',
        `venueOrderId:${input.venueOrderId}|clientOrderId:${input.clientOrderId}`,
        'FILLED',
        0,
        input.evidence.transactionHash,
        input.venueOrderId,
        input.clientOrderId,
        input.evidence.observedAt,
      );
      this.Database.prepare(
        `INSERT INTO terminal_identity_conflict_recoveries(
          recovery_id,intent_id,venue_order_id,client_order_id,evidence_observed_at,
          transaction_hash,fill_id,fill_quantity,fill_price,fill_transaction_timestamp,
          operator_id,authorization_id,authorized_at,reason,recovered_at,outcome
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        input.recoveryId,
        input.intentId,
        input.venueOrderId,
        input.clientOrderId,
        input.evidence.observedAt,
        input.evidence.transactionHash,
        input.evidence.fillId,
        input.evidence.fillQuantity,
        input.evidence.fillPrice,
        input.evidence.fillTransactionTimestamp,
        input.authorization.operatorId,
        input.authorization.authorizationId,
        input.authorization.authorizedAt,
        input.authorization.reason,
        input.now,
        'CORRECTED_AUTHORITATIVE_FULL_FILL',
      );
      this.resolveIdentityConflict(
        input.intentId,
        input.now,
        `AUDITED_FULL_FILL_RECOVERY:${input.recoveryId}`,
      );
      return { outcome: 'APPLIED' as const, intentId: input.intentId };
    });
    return Object.freeze(recover.immediate());
  }

  private validateTerminalIdentityConflictFullFillRecovery(
    input: terminal_identity_conflict_full_fill_recovery_input_v1,
  ):
    | Readonly<{ eligible: true; outcome: 'READY' | 'ALREADY_APPLIED' }>
    | Readonly<{ eligible: false; blocker: string }> {
    const reject = (blocker: string) => Object.freeze({ eligible: false as const, blocker });
    const prior = this.Database.prepare(
      'SELECT * FROM terminal_identity_conflict_recoveries WHERE recovery_id=? OR intent_id=?',
    ).get(input.recoveryId, input.intentId) as Record<string, unknown> | undefined;
    if (prior !== undefined) {
      const identical =
        prior.recovery_id === input.recoveryId &&
        prior.intent_id === input.intentId &&
        prior.venue_order_id === input.venueOrderId &&
        prior.client_order_id === input.clientOrderId &&
        prior.transaction_hash === input.evidence.transactionHash &&
        prior.fill_id === input.evidence.fillId &&
        prior.fill_quantity === input.evidence.fillQuantity &&
        prior.fill_price === input.evidence.fillPrice &&
        prior.fill_transaction_timestamp === input.evidence.fillTransactionTimestamp &&
        prior.operator_id === input.authorization.operatorId &&
        prior.authorization_id === input.authorization.authorizationId &&
        prior.reason === input.authorization.reason &&
        prior.outcome === 'CORRECTED_AUTHORITATIVE_FULL_FILL';
      return identical
        ? Object.freeze({ eligible: true as const, outcome: 'ALREADY_APPLIED' as const })
        : reject('TERMINAL_IDENTITY_CONFLICT_RECOVERY_AUDIT_CONFLICT');
    }
    if (
      input.recoveryId.trim().length === 0 ||
      input.intentId.trim().length === 0 ||
      input.venueOrderId.trim().length === 0 ||
      input.clientOrderId.trim().length === 0 ||
      input.market.trim().length === 0 ||
      !Number.isFinite(input.quantity) ||
      input.quantity <= 0 ||
      !Number.isFinite(input.price) ||
      input.price <= 0 ||
      !Number.isSafeInteger(input.now) ||
      !Number.isSafeInteger(input.maximumEvidenceAgeMs) ||
      input.maximumEvidenceAgeMs <= 0 ||
      input.maximumEvidenceAgeMs > 300_000 ||
      !Number.isSafeInteger(input.evidence.observedAt) ||
      input.evidence.observedAt > input.now ||
      input.now - input.evidence.observedAt > input.maximumEvidenceAgeMs ||
      input.evidence.source !== 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' ||
      input.evidence.terminalState !== 'FILLED' ||
      input.evidence.remainingQuantity !== 0 ||
      input.evidence.transactionHash.trim().length === 0 ||
      input.evidence.transactionState !== 'COMMITTED' ||
      input.evidence.fillId.trim().length === 0 ||
      !Number.isSafeInteger(input.evidence.fillTransactionTimestamp) ||
      input.evidence.fillTransactionTimestamp <= 0 ||
      input.evidence.fillQuantity !== input.quantity ||
      !Number.isFinite(input.evidence.fillPrice) ||
      input.evidence.fillPrice <= 0
    )
      return reject('TERMINAL_IDENTITY_CONFLICT_RECOVERY_EVIDENCE_INVALID');
    if (
      input.authorization.scope !== 'TERMINAL_IDENTITY_CONFLICT_FULL_FILL_RECOVERY' ||
      input.authorization.authorizationId.trim().length === 0 ||
      input.authorization.operatorId.trim().length === 0 ||
      input.authorization.reason.trim().length === 0 ||
      !Number.isSafeInteger(input.authorization.authorizedAt) ||
      input.authorization.authorizedAt > input.now
    )
      return reject('TERMINAL_IDENTITY_CONFLICT_RECOVERY_AUTHORIZATION_INVALID');
    const row = this.Database.prepare(
      `SELECT status,venue_order_id venueOrderId,body_json bodyJson,
       (SELECT state FROM reconciliation_observations r WHERE r.intent_id=execution_intents.intent_id ORDER BY id DESC LIMIT 1) latestReconciliation,
       (SELECT observed_at FROM reconciliation_observations r WHERE r.intent_id=execution_intents.intent_id ORDER BY id DESC LIMIT 1) latestReconciliationAt,
       (SELECT outcome_json FROM executor_outcomes o WHERE o.intent_id=execution_intents.intent_id ORDER BY id DESC LIMIT 1) outcomeJson
       FROM execution_intents WHERE intent_id=?`,
    ).get(input.intentId) as
      | {
          status: execution_intent_status_v1;
          venueOrderId: string | null;
          bodyJson: string;
          latestReconciliation: string | null;
          latestReconciliationAt: number | null;
          outcomeJson: string | null;
        }
      | undefined;
    if (row === undefined) return reject('TERMINAL_IDENTITY_CONFLICT_RECOVERY_INTENT_NOT_FOUND');
    const body = JSON.parse(row.bodyJson) as execution_intent_v1;
    const outcome =
      row.outcomeJson === null ? null : (JSON.parse(row.outcomeJson) as Record<string, unknown>);
    if (
      body.action !== 'PLACE' ||
      body.clientOrderId !== input.clientOrderId ||
      body.side !== input.side ||
      body.market !== input.market ||
      body.quantity !== input.quantity ||
      Math.abs(body.price - input.price) > 1e-8 ||
      row.venueOrderId !== input.venueOrderId ||
      outcome?.transactionHash !== input.evidence.transactionHash
    )
      return reject('TERMINAL_IDENTITY_CONFLICT_RECOVERY_IDENTITY_MISMATCH');
    const conflict = this.Database.prepare(
      "SELECT first_observed_at firstObservedAt FROM reconciliation_identity_conflicts WHERE intent_id=? AND status='ACTIVE'",
    ).get(input.intentId) as { firstObservedAt: number } | undefined;
    const latestProvenance = this.getLatestReconciliationProvenance(input.intentId);
    if (
      row.status !== 'APPLIED' ||
      row.latestReconciliation !== 'FULL_FILL' ||
      row.latestReconciliationAt === null ||
      conflict === undefined ||
      row.latestReconciliationAt > conflict.firstObservedAt ||
      latestProvenance?.venueStatus !== 'OPEN' ||
      latestProvenance.venueOrderId !== input.venueOrderId ||
      latestProvenance.clientOrderId !== input.clientOrderId
    )
      return reject('TERMINAL_IDENTITY_CONFLICT_RECOVERY_ORIGIN_INVALID');
    const identityOwnerCount = (
      this.Database.prepare(
        `SELECT COUNT(*) count FROM execution_intents
         WHERE json_extract(body_json,'$.action')='PLACE'
           AND (venue_order_id=? OR json_extract(body_json,'$.clientOrderId')=?)`,
      ).get(input.venueOrderId, input.clientOrderId) as { count: number }
    ).count;
    return identityOwnerCount === 1
      ? Object.freeze({ eligible: true as const, outcome: 'READY' as const })
      : reject('TERMINAL_IDENTITY_CONFLICT_RECOVERY_IDENTITY_CONFLICT');
  }

  private validateFalseFlatCheckpointCancelledRecovery(
    input: false_flat_checkpoint_cancelled_recovery_input_v1,
  ):
    | Readonly<{ eligible: true; outcome: 'READY' | 'ALREADY_APPLIED' }>
    | Readonly<{ eligible: false; blocker: string }> {
    const reject = (blocker: string) => Object.freeze({ eligible: false as const, blocker });
    if (
      input.recoveryId.trim().length === 0 ||
      input.intentId.trim().length === 0 ||
      input.venueOrderId.trim().length === 0 ||
      input.clientOrderId.trim().length === 0 ||
      input.market.trim().length === 0 ||
      !Number.isFinite(input.quantity) ||
      input.quantity <= 0
    )
      return reject('FALSE_FLAT_CANCELLED_RECOVERY_IDENTITY_INVALID');
    const prior = this.Database.prepare(
      'SELECT * FROM false_flat_checkpoint_recoveries WHERE recovery_id=? OR intent_id=?',
    ).get(input.recoveryId, input.intentId) as Record<string, unknown> | undefined;
    if (prior !== undefined) {
      const identical =
        prior.recovery_id === input.recoveryId &&
        prior.intent_id === input.intentId &&
        prior.venue_order_id === input.venueOrderId &&
        prior.client_order_id === input.clientOrderId &&
        prior.remaining_quantity === 0 &&
        prior.transaction_hash === input.evidence.transactionHash &&
        prior.operator_id === input.authorization.operatorId &&
        prior.authorization_id === input.authorization.authorizationId &&
        prior.reason === input.authorization.reason &&
        prior.outcome === 'CORRECTED_AUTHORITATIVE_CANCELLED';
      return identical
        ? Object.freeze({ eligible: true as const, outcome: 'ALREADY_APPLIED' as const })
        : reject('FALSE_FLAT_CANCELLED_RECOVERY_AUDIT_CONFLICT');
    }
    if (
      !Number.isSafeInteger(input.now) ||
      !Number.isSafeInteger(input.maximumEvidenceAgeMs) ||
      input.maximumEvidenceAgeMs <= 0 ||
      input.maximumEvidenceAgeMs > 300_000 ||
      !Number.isSafeInteger(input.evidence.observedAt) ||
      input.evidence.observedAt > input.now ||
      input.now - input.evidence.observedAt > input.maximumEvidenceAgeMs ||
      input.evidence.source !== 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' ||
      input.evidence.terminalState !== 'CANCELLED' ||
      input.evidence.remainingQuantity !== 0 ||
      input.evidence.matchingFillCount !== 0 ||
      input.evidence.transactionHash.trim().length === 0 ||
      input.evidence.transactionState !== 'COMMITTED'
    )
      return reject('FALSE_FLAT_CANCELLED_RECOVERY_EVIDENCE_INVALID');
    if (
      input.authorization.scope !== 'FALSE_FLAT_CHECKPOINT_CANCELLED_RECOVERY' ||
      input.authorization.authorizationId.trim().length === 0 ||
      input.authorization.operatorId.trim().length === 0 ||
      input.authorization.reason.trim().length === 0 ||
      !Number.isSafeInteger(input.authorization.authorizedAt) ||
      input.authorization.authorizedAt > input.now
    )
      return reject('FALSE_FLAT_CANCELLED_RECOVERY_AUTHORIZATION_INVALID');
    const row = this.Database.prepare(
      `SELECT status,venue_order_id venueOrderId,body_json bodyJson,
       (SELECT COUNT(*) FROM lifecycle_transitions t WHERE t.intent_id=execution_intents.intent_id AND t.to_state='ACKNOWLEDGED') acknowledgedCount,
       (SELECT state FROM reconciliation_observations r WHERE r.intent_id=execution_intents.intent_id ORDER BY id DESC LIMIT 1) latestReconciliation,
       (SELECT outcome_json FROM executor_outcomes o WHERE o.intent_id=execution_intents.intent_id ORDER BY id DESC LIMIT 1) outcomeJson
       FROM execution_intents WHERE intent_id=?`,
    ).get(input.intentId) as
      | {
          status: execution_intent_status_v1;
          venueOrderId: string | null;
          bodyJson: string;
          acknowledgedCount: number;
          latestReconciliation: string | null;
          outcomeJson: string | null;
        }
      | undefined;
    if (row === undefined) return reject('FALSE_FLAT_CANCELLED_RECOVERY_INTENT_NOT_FOUND');
    const body = JSON.parse(row.bodyJson) as execution_intent_v1;
    const outcome =
      row.outcomeJson === null ? null : (JSON.parse(row.outcomeJson) as Record<string, unknown>);
    if (
      body.action !== 'PLACE' ||
      body.clientOrderId !== input.clientOrderId ||
      body.side !== input.side ||
      body.market !== input.market ||
      body.quantity !== input.quantity ||
      row.venueOrderId !== input.venueOrderId ||
      outcome?.transactionHash !== input.evidence.transactionHash
    )
      return reject('FALSE_FLAT_CANCELLED_RECOVERY_IDENTITY_MISMATCH');
    if (
      row.status !== 'EXTERNALLY_NEUTRALIZED' ||
      row.acknowledgedCount < 1 ||
      row.latestReconciliation !== 'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED'
    )
      return reject('FALSE_FLAT_CANCELLED_RECOVERY_ORIGIN_INVALID');
    const identityOwnerCount = (
      this.Database.prepare(
        `SELECT COUNT(*) count FROM execution_intents
         WHERE json_extract(body_json,'$.action')='PLACE'
           AND (venue_order_id=? OR json_extract(body_json,'$.clientOrderId')=?)`,
      ).get(input.venueOrderId, input.clientOrderId) as { count: number }
    ).count;
    return identityOwnerCount === 1
      ? Object.freeze({ eligible: true as const, outcome: 'READY' as const })
      : reject('FALSE_FLAT_CANCELLED_RECOVERY_IDENTITY_CONFLICT');
  }

  private validateFalseFlatCheckpointOpenRecovery(
    input: false_flat_checkpoint_open_recovery_input_v1,
  ):
    | Readonly<{ eligible: true; outcome: 'READY' | 'ALREADY_APPLIED' }>
    | Readonly<{ eligible: false; blocker: string }> {
    const reject = (blocker: string) => Object.freeze({ eligible: false as const, blocker });
    if (
      input.recoveryId.trim().length === 0 ||
      input.intentId.trim().length === 0 ||
      input.venueOrderId.trim().length === 0 ||
      input.clientOrderId.trim().length === 0
    )
      return reject('FALSE_FLAT_RECOVERY_IDENTITY_INVALID');
    const prior = this.Database.prepare(
      'SELECT * FROM false_flat_checkpoint_recoveries WHERE recovery_id=? OR intent_id=?',
    ).get(input.recoveryId, input.intentId) as Record<string, unknown> | undefined;
    if (prior !== undefined) {
      const identical =
        prior.recovery_id === input.recoveryId &&
        prior.intent_id === input.intentId &&
        prior.venue_order_id === input.venueOrderId &&
        prior.client_order_id === input.clientOrderId &&
        prior.evidence_observed_at === input.evidence.observedAt &&
        prior.remaining_quantity === input.evidence.remainingQuantity &&
        prior.transaction_hash === input.evidence.transactionHash &&
        prior.operator_id === input.authorization.operatorId &&
        prior.authorization_id === input.authorization.authorizationId &&
        prior.authorized_at === input.authorization.authorizedAt &&
        prior.reason === input.authorization.reason;
      return identical
        ? Object.freeze({ eligible: true as const, outcome: 'ALREADY_APPLIED' as const })
        : reject('FALSE_FLAT_RECOVERY_AUDIT_CONFLICT');
    }
    if (
      !Number.isSafeInteger(input.now) ||
      !Number.isSafeInteger(input.maximumEvidenceAgeMs) ||
      input.maximumEvidenceAgeMs <= 0 ||
      input.maximumEvidenceAgeMs > 300_000 ||
      !Number.isSafeInteger(input.evidence.observedAt) ||
      input.evidence.observedAt > input.now ||
      input.now - input.evidence.observedAt > input.maximumEvidenceAgeMs ||
      !Number.isFinite(input.evidence.remainingQuantity) ||
      input.evidence.remainingQuantity <= 0
    )
      return reject('FALSE_FLAT_RECOVERY_OPEN_EVIDENCE_INVALID');
    if (
      input.authorization.scope !== 'FALSE_FLAT_CHECKPOINT_OPEN_RECOVERY' ||
      input.authorization.authorizationId.trim().length === 0 ||
      input.authorization.operatorId.trim().length === 0 ||
      input.authorization.reason.trim().length === 0 ||
      !Number.isSafeInteger(input.authorization.authorizedAt) ||
      input.authorization.authorizedAt > input.now
    )
      return reject('FALSE_FLAT_RECOVERY_AUTHORIZATION_INVALID');
    const row = this.Database.prepare(
      `SELECT status,venue_order_id venueOrderId,body_json bodyJson,
       (SELECT COUNT(*) FROM lifecycle_transitions t WHERE t.intent_id=execution_intents.intent_id AND t.to_state='ACKNOWLEDGED') acknowledgedCount,
       (SELECT state FROM reconciliation_observations r WHERE r.intent_id=execution_intents.intent_id ORDER BY id DESC LIMIT 1) latestReconciliation
       FROM execution_intents WHERE intent_id=?`,
    ).get(input.intentId) as
      | {
          status: execution_intent_status_v1;
          venueOrderId: string | null;
          bodyJson: string;
          acknowledgedCount: number;
          latestReconciliation: string | null;
        }
      | undefined;
    if (row === undefined) return reject('FALSE_FLAT_RECOVERY_INTENT_NOT_FOUND');
    const body = JSON.parse(row.bodyJson) as execution_intent_v1;
    if (
      body.action !== 'PLACE' ||
      body.clientOrderId !== input.clientOrderId ||
      row.venueOrderId !== input.venueOrderId
    )
      return reject('FALSE_FLAT_RECOVERY_IDENTITY_MISMATCH');
    if (
      row.status !== 'EXTERNALLY_NEUTRALIZED' ||
      row.acknowledgedCount < 1 ||
      row.latestReconciliation !== 'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED'
    )
      return reject('FALSE_FLAT_RECOVERY_ORIGIN_INVALID');
    const identityOwnerCount = (
      this.Database.prepare(
        `SELECT COUNT(*) count FROM execution_intents
         WHERE json_extract(body_json,'$.action')='PLACE'
           AND (venue_order_id=? OR json_extract(body_json,'$.clientOrderId')=?)`,
      ).get(input.venueOrderId, input.clientOrderId) as { count: number }
    ).count;
    if (identityOwnerCount !== 1) return reject('FALSE_FLAT_RECOVERY_IDENTITY_CONFLICT');
    return Object.freeze({ eligible: true as const, outcome: 'READY' as const });
  }

  assessHistoricalDuplicateRecovery(
    input: Readonly<{
      recoveryId: string;
      originalIntentId: string;
      duplicateIntentId: string;
      venueOrderId: string;
      clientOrderId: string;
      now: number;
      maximumEvidenceAgeMs: number;
      evidence: Readonly<{
        source:
          'AUTHENTICATED_TERMINAL_ORDER_HISTORY' | 'AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION';
        observedAt: number;
        reconciliationState: 'FULL_FILL';
        venueStatus: 'FILLED';
        remainingQuantity: 0;
        matchedIdentifier: string;
        transactionHash: string | null;
      }>;
      authorization: Readonly<{
        scope: 'HISTORICAL_DUPLICATE_INTENT_RECOVERY';
        authorizationId: string;
        operatorId: string;
        authorizedAt: number;
        reason: string;
      }>;
    }>,
  ):
    | Readonly<{ eligible: true; outcome: 'READY' | 'ALREADY_APPLIED' }>
    | Readonly<{ eligible: false; blocker: string }> {
    return this.validateHistoricalDuplicateRecovery(input);
  }

  recoverHistoricalDuplicateIntent(
    input: Parameters<
      decibel_execution_lifecycle_journal_v1['assessHistoricalDuplicateRecovery']
    >[0],
  ):
    | Readonly<{ outcome: 'APPLIED' | 'ALREADY_APPLIED'; duplicateIntentId: string }>
    | Readonly<{ outcome: 'REJECTED'; blocker: string }> {
    const recover = this.Database.transaction(() => {
      const validation = this.validateHistoricalDuplicateRecovery(input);
      if (!validation.eligible)
        return { outcome: 'REJECTED' as const, blocker: validation.blocker };
      if (validation.outcome === 'ALREADY_APPLIED')
        return {
          outcome: 'ALREADY_APPLIED' as const,
          duplicateIntentId: input.duplicateIntentId,
        };

      const originalProvenance = this.getLatestReconciliationProvenance(input.originalIntentId);
      if (
        originalProvenance?.venueStatus !== 'FILLED' ||
        originalProvenance.remainingQuantity !== 0 ||
        originalProvenance.venueOrderId !== input.venueOrderId ||
        originalProvenance.clientOrderId !== input.clientOrderId
      )
        this.Database.prepare(
          `INSERT INTO reconciliation_provenance(
            intent_id,source,matched_identifier,venue_status,remaining_quantity,
            transaction_hash,venue_order_id,client_order_id,observed_at
          ) VALUES(?,?,?,?,?,?,?,?,?)`,
        ).run(
          input.originalIntentId,
          input.evidence.source,
          input.evidence.matchedIdentifier,
          input.evidence.venueStatus,
          input.evidence.remainingQuantity,
          input.evidence.transactionHash,
          input.venueOrderId,
          input.clientOrderId,
          input.evidence.observedAt,
        );
      this.recordReconciliation(
        input.duplicateIntentId,
        'HISTORICAL_DUPLICATE_SUPERSEDED',
        input.venueOrderId,
        input.now,
      );
      this.Database.prepare(
        `INSERT INTO reconciliation_provenance(
          intent_id,source,matched_identifier,venue_status,remaining_quantity,
          transaction_hash,venue_order_id,client_order_id,observed_at
        ) VALUES(?,?,?,?,?,?,?,?,?)`,
      ).run(
        input.duplicateIntentId,
        'OPERATOR_AUTHORIZED_HISTORICAL_DUPLICATE_RECOVERY',
        `originalIntentId:${input.originalIntentId}`,
        input.evidence.venueStatus,
        input.evidence.remainingQuantity,
        input.evidence.transactionHash,
        input.venueOrderId,
        input.clientOrderId,
        input.now,
      );
      this.recordBlocker(
        input.duplicateIntentId,
        `HISTORICAL_DUPLICATE_SUPERSEDED:${input.recoveryId}`,
        input.now,
      );
      this.transition(input.duplicateIntentId, 'SUPERSEDED', input.now, input.venueOrderId);
      this.Database.prepare(
        `INSERT INTO historical_duplicate_recoveries(
          recovery_id,original_intent_id,duplicate_intent_id,venue_order_id,client_order_id,
          evidence_source,evidence_observed_at,operator_id,authorization_id,authorized_at,
          reason,recovered_at,outcome
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        input.recoveryId,
        input.originalIntentId,
        input.duplicateIntentId,
        input.venueOrderId,
        input.clientOrderId,
        input.evidence.source,
        input.evidence.observedAt,
        input.authorization.operatorId,
        input.authorization.authorizationId,
        input.authorization.authorizedAt,
        input.authorization.reason,
        input.now,
        'SUPERSEDED_DUPLICATE_ADOPTION',
      );
      return { outcome: 'APPLIED' as const, duplicateIntentId: input.duplicateIntentId };
    });
    return Object.freeze(recover.immediate());
  }

  getHistoricalDuplicateRecovery(recoveryId: string): Readonly<Record<string, unknown>> | null {
    const row = this.Database.prepare(
      `SELECT recovery_id recoveryId,original_intent_id originalIntentId,
       duplicate_intent_id duplicateIntentId,venue_order_id venueOrderId,
       client_order_id clientOrderId,evidence_source evidenceSource,
       evidence_observed_at evidenceObservedAt,operator_id operatorId,
       authorization_id authorizationId,authorized_at authorizedAt,reason,
       recovered_at recoveredAt,outcome
       FROM historical_duplicate_recoveries WHERE recovery_id=?`,
    ).get(recoveryId) as Record<string, unknown> | undefined;
    return row === undefined ? null : Object.freeze(row);
  }

  private validateHistoricalDuplicateRecovery(
    input: Parameters<
      decibel_execution_lifecycle_journal_v1['assessHistoricalDuplicateRecovery']
    >[0],
  ):
    | Readonly<{ eligible: true; outcome: 'READY' | 'ALREADY_APPLIED' }>
    | Readonly<{ eligible: false; blocker: string }> {
    const reject = (blocker: string) => Object.freeze({ eligible: false as const, blocker });
    if (
      input.recoveryId.trim().length === 0 ||
      input.originalIntentId === input.duplicateIntentId ||
      input.venueOrderId.trim().length === 0 ||
      input.clientOrderId.trim().length === 0
    )
      return reject('HISTORICAL_DUPLICATE_RECOVERY_IDENTITY_INVALID');
    const priorById = this.Database.prepare(
      'SELECT * FROM historical_duplicate_recoveries WHERE recovery_id=?',
    ).get(input.recoveryId) as Record<string, unknown> | undefined;
    const priorByPair = this.Database.prepare(
      'SELECT * FROM historical_duplicate_recoveries WHERE original_intent_id=? OR duplicate_intent_id=?',
    ).get(input.originalIntentId, input.duplicateIntentId) as Record<string, unknown> | undefined;
    const prior = priorById ?? priorByPair;
    if (prior !== undefined) {
      const identical =
        prior.recovery_id === input.recoveryId &&
        prior.original_intent_id === input.originalIntentId &&
        prior.duplicate_intent_id === input.duplicateIntentId &&
        prior.venue_order_id === input.venueOrderId &&
        prior.client_order_id === input.clientOrderId &&
        prior.evidence_source === input.evidence.source &&
        prior.evidence_observed_at === input.evidence.observedAt &&
        prior.operator_id === input.authorization.operatorId &&
        prior.authorization_id === input.authorization.authorizationId &&
        prior.authorized_at === input.authorization.authorizedAt &&
        prior.reason === input.authorization.reason;
      return identical
        ? Object.freeze({ eligible: true as const, outcome: 'ALREADY_APPLIED' as const })
        : reject('HISTORICAL_DUPLICATE_RECOVERY_AUDIT_CONFLICT');
    }
    if (
      !Number.isSafeInteger(input.now) ||
      !Number.isSafeInteger(input.maximumEvidenceAgeMs) ||
      input.maximumEvidenceAgeMs <= 0 ||
      input.maximumEvidenceAgeMs > 300_000 ||
      !Number.isSafeInteger(input.evidence.observedAt) ||
      input.evidence.observedAt > input.now ||
      input.now - input.evidence.observedAt > input.maximumEvidenceAgeMs
    )
      return reject('HISTORICAL_DUPLICATE_RECOVERY_EVIDENCE_STALE');
    if (
      input.authorization.scope !== 'HISTORICAL_DUPLICATE_INTENT_RECOVERY' ||
      input.authorization.authorizationId.trim().length === 0 ||
      input.authorization.operatorId.trim().length === 0 ||
      input.authorization.reason.trim().length === 0 ||
      !Number.isSafeInteger(input.authorization.authorizedAt) ||
      input.authorization.authorizedAt > input.now
    )
      return reject('HISTORICAL_DUPLICATE_RECOVERY_AUTHORIZATION_INVALID');
    if (
      input.evidence.reconciliationState !== 'FULL_FILL' ||
      input.evidence.venueStatus !== 'FILLED' ||
      input.evidence.remainingQuantity !== 0 ||
      (input.evidence.matchedIdentifier !== `venueOrderId:${input.venueOrderId}` &&
        input.evidence.matchedIdentifier !== `clientOrderId:${input.clientOrderId}`)
    )
      return reject('HISTORICAL_DUPLICATE_RECOVERY_TERMINAL_EVIDENCE_INVALID');

    const rows = this.Database.prepare(
      `SELECT intent_id intentId,status,venue_order_id venueOrderId,body_json bodyJson,
       created_at createdAt,
       (SELECT COUNT(*) FROM mutation_attempts a WHERE a.intent_id=execution_intents.intent_id) attemptCount,
       (SELECT COUNT(*) FROM executor_outcomes o WHERE o.intent_id=execution_intents.intent_id) outcomeCount
       FROM execution_intents WHERE intent_id IN (?,?)`,
    ).all(input.originalIntentId, input.duplicateIntentId) as Array<{
      intentId: string;
      status: execution_intent_status_v1;
      venueOrderId: string | null;
      bodyJson: string;
      createdAt: number;
      attemptCount: number;
      outcomeCount: number;
    }>;
    if (rows.length !== 2) return reject('HISTORICAL_DUPLICATE_RECOVERY_INTENT_NOT_FOUND');
    const original = rows.find((row) => row.intentId === input.originalIntentId)!;
    const duplicate = rows.find((row) => row.intentId === input.duplicateIntentId)!;
    const originalBody = JSON.parse(original.bodyJson) as execution_intent_v1;
    const duplicateBody = JSON.parse(duplicate.bodyJson) as execution_intent_v1;
    if (
      originalBody.action !== 'PLACE' ||
      duplicateBody.action !== 'PLACE' ||
      original.venueOrderId !== input.venueOrderId ||
      duplicate.venueOrderId !== input.venueOrderId ||
      originalBody.clientOrderId !== input.clientOrderId ||
      duplicateBody.clientOrderId !== input.clientOrderId ||
      originalBody.market !== duplicateBody.market ||
      originalBody.side !== duplicateBody.side ||
      originalBody.priceTicks !== duplicateBody.priceTicks ||
      originalBody.quantityLots !== duplicateBody.quantityLots
    )
      return reject('HISTORICAL_DUPLICATE_RECOVERY_IDENTITY_MISMATCH');
    if (original.status !== 'APPLIED')
      return reject('HISTORICAL_DUPLICATE_RECOVERY_ORIGINAL_NOT_TERMINAL');
    if (duplicate.status !== 'UNRESOLVABLE_ACK')
      return reject('HISTORICAL_DUPLICATE_RECOVERY_DUPLICATE_STATE_INVALID');
    if (duplicate.attemptCount !== 0)
      return reject('HISTORICAL_DUPLICATE_RECOVERY_DUPLICATE_ATTEMPTED');
    if (duplicate.outcomeCount !== 0)
      return reject('HISTORICAL_DUPLICATE_RECOVERY_DUPLICATE_HAS_OUTCOME');
    const terminalTransition = this.Database.prepare(
      "SELECT MAX(observed_at) terminalAt FROM lifecycle_transitions WHERE intent_id=? AND to_state='APPLIED'",
    ).get(input.originalIntentId) as { terminalAt: number | null };
    if (
      terminalTransition.terminalAt === null ||
      duplicate.createdAt <= terminalTransition.terminalAt
    )
      return reject('HISTORICAL_DUPLICATE_RECOVERY_ORDERING_INVALID');
    const duplicateContradiction = this.Database.prepare(
      "SELECT 1 FROM reconciliation_observations WHERE intent_id=? AND state<>'ORDER_OPEN' LIMIT 1",
    ).get(input.duplicateIntentId);
    if (duplicateContradiction !== undefined)
      return reject('HISTORICAL_DUPLICATE_RECOVERY_DUPLICATE_EVIDENCE_CONFLICT');
    const otherOwner = this.Database.prepare(
      `SELECT intent_id FROM execution_intents
       WHERE intent_id NOT IN (?,?) AND json_extract(body_json,'$.action')='PLACE'
         AND (venue_order_id=? OR json_extract(body_json,'$.clientOrderId')=?) LIMIT 1`,
    ).get(input.originalIntentId, input.duplicateIntentId, input.venueOrderId, input.clientOrderId);
    if (otherOwner !== undefined)
      return reject('HISTORICAL_DUPLICATE_RECOVERY_ADDITIONAL_IDENTITY_OWNER');
    const priorProvenance = this.getLatestReconciliationProvenance(input.originalIntentId);
    if (
      priorProvenance !== null &&
      priorProvenance.venueStatus !== 'OPEN' &&
      (priorProvenance.venueStatus !== 'FILLED' || priorProvenance.remainingQuantity !== 0)
    )
      return reject('HISTORICAL_DUPLICATE_RECOVERY_ORIGINAL_EVIDENCE_CONFLICT');
    return Object.freeze({ eligible: true as const, outcome: 'READY' as const });
  }
  recordDecisionSnapshot(cycleSequence: number, snapshot: unknown, at: number): void {
    this.Database.prepare(
      'INSERT OR REPLACE INTO strategy_decision_snapshots(cycle_sequence,snapshot_json,observed_at) VALUES(?,?,?)',
    ).run(cycleSequence, JSON.stringify(snapshot), at);
  }
  getDecisionSnapshots(): readonly Readonly<{
    cycleSequence: number;
    snapshot: unknown;
    observedAt: number;
  }>[] {
    const rows = this.Database.prepare(
      'SELECT cycle_sequence cycleSequence,snapshot_json snapshotJson,observed_at observedAt FROM strategy_decision_snapshots ORDER BY cycle_sequence',
    ).all() as Array<{ cycleSequence: number; snapshotJson: string; observedAt: number }>;
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          cycleSequence: row.cycleSequence,
          snapshot: JSON.parse(row.snapshotJson) as unknown,
          observedAt: row.observedAt,
        }),
      ),
    );
  }
  recordMainnetReconciliation(input: {
    timestamp: number;
    marketAddress: string;
    btcPositionBase: number;
    btcOpenOrderIds: readonly string[];
    btcAuthenticatedFillIds: readonly string[];
    foreignOpenOrderIds: readonly string[];
    inventoryState: 'FLAT' | 'LONG_RECYCLE' | 'SHORT_RECYCLE';
    sourceSnapshotHash: string;
  }): { duplicate: boolean } {
    const result = this.Database.prepare(
      'INSERT OR IGNORE INTO mainnet_reconciliation_observations VALUES(NULL,?,?,?,?,?,?,?,?)',
    ).run(
      input.timestamp,
      input.marketAddress,
      input.btcPositionBase,
      JSON.stringify(input.btcOpenOrderIds),
      JSON.stringify(input.btcAuthenticatedFillIds),
      JSON.stringify(input.foreignOpenOrderIds),
      input.inventoryState,
      input.sourceSnapshotHash,
    );
    return { duplicate: result.changes === 0 };
  }
  countIntents(): number {
    return (
      this.Database.prepare('SELECT COUNT(*) count FROM execution_intents').get() as {
        count: number;
      }
    ).count;
  }
  maximumCycleSequence(): number {
    const rows = this.Database.prepare(
      'SELECT body_json bodyJson FROM execution_intents',
    ).all() as Array<{
      bodyJson: string;
    }>;
    const intentMaximum = rows.reduce((maximum, row) => {
      const body = JSON.parse(row.bodyJson) as { cycleSequence?: unknown };
      return typeof body.cycleSequence === 'number' && Number.isSafeInteger(body.cycleSequence)
        ? Math.max(maximum, body.cycleSequence)
        : maximum;
    }, 0);
    const decisionMaximum = (
      this.Database.prepare(
        'SELECT COALESCE(MAX(cycle_sequence),0) maximum FROM strategy_decision_snapshots',
      ).get() as { maximum: number }
    ).maximum;
    return Math.max(intentMaximum, decisionMaximum);
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
          createdAt: row.created_at as number,
        };
  }
  hasTPRepriceCancellation(sessionId: string, side: 'BUY' | 'SELL'): boolean {
    // Reuse durable intent provenance so replacement profitability protection
    // survives restart without another recovery state or journal schema.
    return (
      this.Database.prepare(
        `SELECT 1 FROM execution_intents
      WHERE json_extract(body_json,'$.sessionId')=? AND json_extract(body_json,'$.side')=?
      AND json_extract(body_json,'$.action')='CANCEL'
      AND (substr(json_extract(body_json,'$.cancelReason'),1,11)='REPRICE:TP_'
        OR json_extract(body_json,'$.cancelReason')='EXIT_COVERAGE_UPSIZE')
      AND status NOT IN ('REJECTED','SUPERSEDED') LIMIT 1`,
      ).get(sessionId, side) !== undefined
    );
  }
  getTPAdverseProgress(
    positionKey: string,
  ): import('./decibel_execution_intent_v1.js').tp_adverse_progress_v1 | null {
    // The intent body is durably written before submission. Unknown outcomes
    // retain the witness; proven rejection/drop cannot consume adverse progress.
    const row = this.Database.prepare(
      `SELECT intent_id intentId FROM execution_intents
      WHERE json_extract(body_json,'$.action')='CANCEL'
        AND json_extract(body_json,'$.cancelReason')='REPRICE:TP_ADVERSE_EXIT_REPRICE'
        AND json_extract(body_json,'$.tpAdverseProgress.positionKey')=?
        AND status IN ('PREPARED','SUBMITTING','SUBMIT_UNKNOWN','ACKNOWLEDGED','UNRESOLVABLE_ACK','RECONCILING','APPLIED','CANCELLED_EXTERNALLY')
      ORDER BY created_at DESC,rowid DESC LIMIT 1`,
    ).get(positionKey) as { intentId: string } | undefined;
    const intent = row ? this.getIntent(row.intentId) : null;
    return intent?.action === 'CANCEL' ? (intent.tpAdverseProgress ?? null) : null;
  }

  getCommittedCoveragePrice(
    sessionId: string,
    side: 'BUY' | 'SELL',
    terminalOrders: readonly Readonly<{
      venueOrderId: string;
      clientOrderId?: string | null;
      state: string;
      remainingQuantity: number | null;
    }>[],
  ): import('./decibel_order_action_v1.js').decibel_coverage_price_authorization_v1 | null {
    // Only the latest committed cancellation can confer a quantity-only price
    // witness. An older upsize must never authorize a later price replacement.
    const row = this.Database.prepare(
      `SELECT intent_id intentId FROM execution_intents
       WHERE json_extract(body_json,'$.sessionId')=?
         AND json_extract(body_json,'$.side')=?
         AND json_extract(body_json,'$.action')='CANCEL'
       ORDER BY created_at DESC,rowid DESC LIMIT 1`,
    ).get(sessionId, side) as { intentId: string } | undefined;
    if (!row) return null;
    const cancel = this.getIntent(row.intentId);
    if (
      cancel?.action !== 'CANCEL' ||
      cancel.cancelReason !== 'EXIT_COVERAGE_UPSIZE' ||
      !['APPLIED', 'CANCELLED_EXTERNALLY'].includes(this.get(row.intentId)?.status ?? '')
    )
      return null;
    // Retire the obligation when a replacement was authoritatively live/filled.
    // An old upsize cannot authorize prices for a subsequent inventory lifecycle.
    const fulfilled = this.Database.prepare(
      `SELECT 1 FROM execution_intents i JOIN reconciliation_provenance p
         ON p.intent_id=i.intent_id
       WHERE json_extract(i.body_json,'$.sessionId')=?
         AND json_extract(i.body_json,'$.side')=?
         AND json_extract(i.body_json,'$.action')='PLACE'
         AND i.created_at>=? AND p.venue_status IN ('OPEN','PARTIAL_FILL','FILLED') LIMIT 1`,
    ).get(sessionId, side, cancel.createdAt);
    if (fulfilled) return null;
    const owners = this.getOrderLineageByVenueOrderId(cancel.expectedPreviousVenueOrderId).filter(
      (row) => this.getIntent(row.intentId)?.action === 'PLACE',
    );
    const owned = owners.length === 1 ? owners[0] : null;
    const place = owned && this.getIntent(owned.intentId);
    if (
      !owned ||
      place?.action !== 'PLACE' ||
      !place.reduceOnly ||
      place.sessionId !== sessionId ||
      place.side !== side ||
      owned.status !== 'CANCELLED_EXTERNALLY'
    )
      return null;
    const provenance = this.getLatestReconciliationProvenance(owned.intentId);
    const cancelled = terminalOrders.some(
      (order) =>
        order.venueOrderId === cancel.expectedPreviousVenueOrderId &&
        order.clientOrderId === place.clientOrderId &&
        order.state === 'CANCELLED' &&
        order.remainingQuantity === 0,
    );
    if (
      !cancelled &&
      !(
        provenance?.venueOrderId === cancel.expectedPreviousVenueOrderId &&
        provenance.clientOrderId === place.clientOrderId &&
        provenance.venueStatus === 'CANCELLED' &&
        provenance.remainingQuantity === 0
      )
    )
      return null;
    return Object.freeze({
      sessionId,
      side,
      price: place.price,
      venueOrderId: cancel.expectedPreviousVenueOrderId,
      clientOrderId: place.clientOrderId,
    });
  }
  getIntent(intentId: string): execution_intent_v1 | null {
    const row = this.Database.prepare(
      'SELECT body_json FROM execution_intents WHERE intent_id=?',
    ).get(intentId) as { body_json: string } | undefined;
    return row === undefined ? null : (JSON.parse(row.body_json) as execution_intent_v1);
  }
  getSubmissionTelemetry(intentId: string): Readonly<{
    transactionHash: string;
    expirationTimestampMs: number;
  }> | null {
    const row = this.Database.prepare(
      'SELECT outcome_json FROM executor_outcomes WHERE intent_id=? ORDER BY id DESC LIMIT 1',
    ).get(intentId) as { outcome_json: string } | undefined;
    if (row === undefined) return null;
    const outcome = JSON.parse(row.outcome_json) as Record<string, unknown>;
    return typeof outcome.transactionHash === 'string' &&
      typeof outcome.expirationTimestampMs === 'number'
      ? {
          transactionHash: outcome.transactionHash,
          expirationTimestampMs: outcome.expirationTimestampMs,
        }
      : null;
  }
  nonTerminal() {
    return this.Database.prepare(
      "SELECT intent_id intentId,status,venue_order_id venueOrderId FROM execution_intents WHERE status NOT IN ('APPLIED','EXTERNALLY_NEUTRALIZED','CANCELLED_EXTERNALLY','FAILED_TIMEOUT','FAILED_DROPPED','FAILED_DROPPED_LEGACY','REJECTED','SUPERSEDED') ORDER BY created_at,intent_id",
    ).all() as Array<{
      intentId: string;
      status: execution_intent_status_v1;
      venueOrderId: string | null;
    }>;
  }
  getOrderLineageByVenueOrderIds(venueOrderIds: readonly string[]): readonly Readonly<{
    intentId: string;
    status: execution_intent_status_v1;
    venueOrderId: string;
  }>[] {
    if (venueOrderIds.length === 0) return [];
    // One read-only scan for the evidence batch. Per-order full scans can
    // consume the account TTL before authenticated publication settles.
    return this.Database.prepare(
      `SELECT intent_id intentId,status,venue_order_id venueOrderId
       FROM execution_intents
       WHERE venue_order_id IN (SELECT value FROM json_each(?))
         AND json_extract(body_json,'$.action') IN ('PLACE','CANCEL')
       ORDER BY created_at,intent_id`,
    ).all(JSON.stringify([...new Set(venueOrderIds)])) as Array<{
      intentId: string;
      status: execution_intent_status_v1;
      venueOrderId: string;
    }>;
  }
  getOrderLineageByVenueOrderId(venueOrderId: string): readonly Readonly<{
    intentId: string;
    status: execution_intent_status_v1;
    venueOrderId: string;
  }>[] {
    return this.Database.prepare(
      `SELECT intent_id intentId,status,venue_order_id venueOrderId
       FROM execution_intents
       WHERE venue_order_id=? AND json_extract(body_json,'$.action') IN ('PLACE','CANCEL')
       ORDER BY created_at,intent_id`,
    ).all(venueOrderId) as Array<{
      intentId: string;
      status: execution_intent_status_v1;
      venueOrderId: string;
    }>;
  }
  findNonTerminalPlaceBySide(side: 'BUY' | 'SELL'): Readonly<{
    intentId: string;
    status: execution_intent_status_v1;
    venueOrderId: string | null;
  }> | null {
    const row = this.Database.prepare(
      `SELECT intent_id intentId,status,venue_order_id venueOrderId
       FROM execution_intents
       WHERE json_extract(body_json,'$.action')='PLACE'
         AND json_extract(body_json,'$.side')=?
         AND status NOT IN ('APPLIED','EXTERNALLY_NEUTRALIZED','CANCELLED_EXTERNALLY','FAILED_TIMEOUT','FAILED_DROPPED','FAILED_DROPPED_LEGACY','REJECTED','SUPERSEDED')
       ORDER BY created_at,intent_id LIMIT 1`,
    ).get(side) as
      | { intentId: string; status: execution_intent_status_v1; venueOrderId: string | null }
      | undefined;
    return row === undefined ? null : Object.freeze(row);
  }
  findNonTerminalByVenueOrderId(venueOrderId: string): Readonly<{
    intentId: string;
    status: execution_intent_status_v1;
    venueOrderId: string;
  }> | null {
    const row = this.Database.prepare(
      "SELECT intent_id intentId,status,venue_order_id venueOrderId FROM execution_intents WHERE venue_order_id=? AND status NOT IN ('APPLIED','EXTERNALLY_NEUTRALIZED','CANCELLED_EXTERNALLY','FAILED_TIMEOUT','FAILED_DROPPED','FAILED_DROPPED_LEGACY','REJECTED','SUPERSEDED') ORDER BY created_at DESC LIMIT 1",
    ).get(venueOrderId) as
      { intentId: string; status: execution_intent_status_v1; venueOrderId: string } | undefined;
    return row === undefined ? null : Object.freeze(row);
  }
  terminalizeLegacyUnsubmittedIntents(at: number): readonly string[] {
    const rows = this.Database.prepare(
      `SELECT i.intent_id intentId
       FROM execution_intents i
       WHERE i.status='PREPARED'
         AND NOT EXISTS (
           SELECT 1 FROM mutation_attempts a WHERE a.intent_id=i.intent_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM executor_outcomes o WHERE o.intent_id=i.intent_id
         )
       ORDER BY i.created_at,i.intent_id`,
    ).all() as Array<{ intentId: string }>;
    for (const row of rows) this.transition(row.intentId, 'FAILED_DROPPED_LEGACY', at);
    return Object.freeze(rows.map((row) => row.intentId));
  }
  supersedeDryRunOnlyPrepared(at: number): number {
    const rows = this.Database.prepare(
      `SELECT i.intent_id intentId
       FROM execution_intents i
       WHERE i.status='PREPARED'
         AND EXISTS (
           SELECT 1 FROM lifecycle_blockers b
           WHERE b.intent_id=i.intent_id AND b.blocker='PRODUCTION_DRY_RUN_MUTATION_BLOCKED'
         )
         AND NOT EXISTS (
           SELECT 1 FROM mutation_attempts a WHERE a.intent_id=i.intent_id
         )
       ORDER BY i.created_at,i.intent_id`,
    ).all() as Array<{ intentId: string }>;
    for (const row of rows) this.transition(row.intentId, 'SUPERSEDED', at);
    return rows.length;
  }
  resolvePreSubmissionAbiFailure(input: {
    intentId: string;
    at: number;
    confirmation: 'APTOS_REMOTE_ABI_NON_INTEGER_CONFIRMED';
  }): { duplicate: boolean } {
    const resolve = this.Database.transaction(() => {
      const intent = this.Database.prepare(
        'SELECT body_json,status,venue_order_id FROM execution_intents WHERE intent_id=?',
      ).get(input.intentId) as
        | { body_json: string; status: execution_intent_status_v1; venue_order_id: string | null }
        | undefined;
      if (intent === undefined) throw new Error('EXECUTION_INTENT_NOT_FOUND');
      const blocker = 'PRE_SUBMISSION_APTOS_REMOTE_ABI_NON_INTEGER';
      if (intent.status === 'REJECTED') {
        const prior = this.Database.prepare(
          'SELECT 1 FROM lifecycle_blockers WHERE intent_id=? AND blocker=? LIMIT 1',
        ).get(input.intentId, blocker);
        if (prior !== undefined) return true;
      }
      const body = JSON.parse(intent.body_json) as { action?: unknown };
      const attemptCount = (
        this.Database.prepare('SELECT COUNT(*) count FROM mutation_attempts WHERE intent_id=?').get(
          input.intentId,
        ) as { count: number }
      ).count;
      const outcomes = this.Database.prepare(
        'SELECT outcome_json FROM executor_outcomes WHERE intent_id=? ORDER BY id',
      ).all(input.intentId) as Array<{ outcome_json: string }>;
      const reconciliationCount = (
        this.Database.prepare(
          'SELECT COUNT(*) count FROM reconciliation_observations WHERE intent_id=?',
        ).get(input.intentId) as { count: number }
      ).count;
      if (
        input.confirmation !== 'APTOS_REMOTE_ABI_NON_INTEGER_CONFIRMED' ||
        intent.status !== 'SUBMIT_UNKNOWN' ||
        intent.venue_order_id !== null ||
        body.action !== 'PLACE' ||
        attemptCount !== 1 ||
        outcomes.length !== 1 ||
        outcomes[0]?.outcome_json !== JSON.stringify({ outcome: 'PLACE_TIMEOUT_UNKNOWN' }) ||
        reconciliationCount !== 0
      )
        throw new Error('EXECUTION_PRE_SUBMISSION_FAILURE_RESOLUTION_REJECTED');
      this.recordBlocker(input.intentId, blocker, input.at);
      this.transition(input.intentId, 'REJECTED', input.at);
      return false;
    });
    return { duplicate: resolve() };
  }
  resolveConfirmedPreSubmissionFailures(input: {
    intentId?: string;
    clientOrderId?: string;
    preExecutorProof?: 'CANARY_HALT_FOR_RECONCILIATION';
    at: number;
    confirmed: true;
  }): Readonly<{
    resolvedIntentIds: readonly string[];
    alreadyTerminalIntentIds: readonly string[];
  }> {
    const resolve = this.Database.transaction(() => {
      const rows = this.Database.prepare(
        `SELECT i.intent_id intentId,i.body_json bodyJson,i.status,i.venue_order_id venueOrderId,
          (SELECT COUNT(*) FROM mutation_attempts a WHERE a.intent_id=i.intent_id) attemptCount,
          (SELECT COUNT(*) FROM executor_outcomes o WHERE o.intent_id=i.intent_id) outcomeCount,
          (SELECT outcome_json FROM executor_outcomes o WHERE o.intent_id=i.intent_id ORDER BY o.id LIMIT 1) outcomeJson,
          (SELECT COUNT(*) FROM reconciliation_observations r WHERE r.intent_id=i.intent_id) reconciliationCount
         FROM execution_intents i
         WHERE (? IS NULL OR i.intent_id=?)
         ORDER BY i.created_at,i.intent_id`,
      ).all(input.intentId ?? null, input.intentId ?? null) as Array<{
        intentId: string;
        bodyJson: string;
        status: execution_intent_status_v1;
        venueOrderId: string | null;
        attemptCount: number;
        outcomeCount: number;
        outcomeJson: string | null;
        reconciliationCount: number;
      }>;
      if (input.intentId !== undefined && rows.length === 0)
        throw new Error('EXECUTION_INTENT_NOT_FOUND');
      const resolvedIntentIds: string[] = [];
      const alreadyTerminalIntentIds: string[] = [];
      for (const row of rows) {
        if (
          [
            'APPLIED',
            'EXTERNALLY_NEUTRALIZED',
            'CANCELLED_EXTERNALLY',
            'REJECTED',
            'SUPERSEDED',
          ].includes(row.status)
        ) {
          alreadyTerminalIntentIds.push(row.intentId);
          continue;
        }
        const body = JSON.parse(row.bodyJson) as {
          action?: unknown;
          clientOrderId?: unknown;
        };
        const provenNeverSubmitted =
          (row.status === 'PREPARED' || row.status === 'SUBMITTING') &&
          row.venueOrderId === null &&
          row.attemptCount === 0 &&
          row.outcomeCount === 0 &&
          row.reconciliationCount === 0;
        const provenAbiPreSubmissionFailure =
          row.status === 'SUBMIT_UNKNOWN' &&
          row.venueOrderId === null &&
          row.attemptCount === 1 &&
          row.outcomeCount === 1 &&
          row.outcomeJson === JSON.stringify({ outcome: 'PLACE_TIMEOUT_UNKNOWN' }) &&
          row.reconciliationCount === 0;
        const provenCanaryPreExecutorRejection =
          input.intentId === row.intentId &&
          input.clientOrderId === body.clientOrderId &&
          input.preExecutorProof === 'CANARY_HALT_FOR_RECONCILIATION' &&
          row.status === 'SUBMITTING' &&
          row.venueOrderId === null &&
          row.attemptCount === 1 &&
          row.outcomeCount === 0 &&
          row.reconciliationCount === 0;
        if (
          body.action !== 'PLACE' ||
          (!provenNeverSubmitted &&
            !provenAbiPreSubmissionFailure &&
            !provenCanaryPreExecutorRejection)
        )
          continue;
        this.recordBlocker(
          row.intentId,
          provenCanaryPreExecutorRejection
            ? 'PRE_SUBMISSION_CANARY_HALT_FOR_RECONCILIATION'
            : provenAbiPreSubmissionFailure
              ? 'PRE_SUBMISSION_APTOS_REMOTE_ABI_NON_INTEGER'
              : 'CONFIRMED_PRE_SUBMISSION_NOT_SUBMITTED',
          input.at,
        );
        this.transition(row.intentId, 'REJECTED', input.at);
        resolvedIntentIds.push(row.intentId);
      }
      return { resolvedIntentIds, alreadyTerminalIntentIds };
    });
    return resolve();
  }
  hasOtherKnownLiveOrder(intentId: string): boolean {
    return this.countKnownLiveOrders(intentId) > 0;
  }
  countKnownLiveOrders(
    intentId: string,
    independentProtectiveRecoveryIntentIds: readonly string[] = [],
  ): number {
    const row = this.Database.prepare(
      "SELECT COUNT(*) count FROM execution_intents WHERE intent_id<>? AND venue_order_id IS NOT NULL AND status IN ('ACKNOWLEDGED','RECONCILING') AND intent_id NOT IN (SELECT value FROM json_each(?))",
    ).get(intentId, JSON.stringify(independentProtectiveRecoveryIntentIds)) as { count: number };
    return row.count;
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
  oldestMutationAttemptAtSince(since: number, action?: 'PLACE' | 'CANCEL'): number | null {
    const rows = this.Database.prepare(
      'SELECT a.attempted_at attemptedAt,i.body_json bodyJson FROM mutation_attempts a JOIN execution_intents i ON i.intent_id=a.intent_id WHERE a.attempted_at>=? ORDER BY a.attempted_at',
    ).all(since) as Array<{ attemptedAt: number; bodyJson: string }>;
    const matching =
      action === undefined
        ? rows
        : rows.filter((row) => (JSON.parse(row.bodyJson) as { action: string }).action === action);
    return matching[0]?.attemptedAt ?? null;
  }
  getSessionCapacityTransactionManifest(sessionId: string): readonly { hash: string | null }[] {
    const rows = this.Database.prepare(
      `SELECT DISTINCT i.intent_id intentId FROM execution_intents i
      JOIN mutation_attempts m ON m.intent_id=i.intent_id WHERE json_extract(i.body_json,'$.sessionId')=?`,
    ).all(sessionId) as { intentId: string }[];
    return rows.map((row) => ({
      hash: this.getSubmissionTelemetry(row.intentId)?.transactionHash ?? null,
    }));
  }
  getSessionFills(sessionId: string): readonly Readonly<{
    fillId: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    maker: boolean;
    timestamp: number;
  }>[] {
    return this.Database.prepare(
      `
      SELECT f.fill_id fillId,f.side,f.quantity,f.price,f.maker_proven maker,f.observed_at timestamp
      FROM authenticated_fills f JOIN execution_intents i ON i.intent_id=f.intent_id
      WHERE json_extract(i.body_json,'$.sessionId')=? AND f.strategy_lineage=1
        AND f.external_counterparty=1 ORDER BY f.observed_at,f.fill_id
    `,
    ).all(sessionId) as Array<{
      fillId: string;
      side: 'BUY' | 'SELL';
      quantity: number;
      price: number;
      maker: boolean;
      timestamp: number;
    }>;
  }

  /** Authenticated strategy fills for one session, used to reconcile fill history with the position. */
  getSessionEntryCycleFills(sessionId: string): readonly decibel_entry_cycle_fill_v1[] {
    return this.Database.prepare(
      `
      SELECT f.fill_id fillId,f.intent_id intentId,f.side,f.quantity,f.price,f.observed_at timestamp
      FROM authenticated_fills f JOIN execution_intents i ON i.intent_id=f.intent_id
      WHERE json_extract(i.body_json,'$.sessionId')=? AND f.strategy_lineage=1
        AND f.external_counterparty=1 ORDER BY f.observed_at,f.fill_id
    `,
    ).all(sessionId) as decibel_entry_cycle_fill_v1[];
  }

  /** Reviewed inventory-only history append. Ownership uncertainty stays in durable
   * evidence and never becomes invented current-session PnL/volume or terminal ACK.
   * No automatic production call site: caller must supply the reviewed plan hash.
   */
  applyHistoricalInventoryRecovery(
    input: Readonly<{
      recovery: Parameters<typeof planDecibelHistoricalFillRecoveryV1>[0];
      expectedPlanHash: string;
      sessionBoundary: number;
      existingFillIds: Readonly<Record<string, string>>;
      venueInventoryBase: number;
      observedAt: number;
      now: number;
      maximumAgeMs: number;
    }>,
  ) {
    const plan = planDecibelHistoricalFillRecoveryV1(input.recovery);
    const planHash = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
    if (
      planHash !== input.expectedPlanHash ||
      !Number.isFinite(input.venueInventoryBase) ||
      Math.abs(plan.inventory - input.venueInventoryBase) > 1e-12 ||
      ![input.now, input.observedAt, input.maximumAgeMs].every(Number.isSafeInteger) ||
      input.maximumAgeMs <= 0 ||
      input.observedAt > input.now ||
      input.now - input.observedAt > input.maximumAgeMs
    )
      throw new Error('HISTORICAL_RECOVERY_REVIEW_OR_VENUE_EVIDENCE_INVALID');
    if (
      !Number.isSafeInteger(input.sessionBoundary) ||
      input.sessionBoundary <= 0 ||
      input.sessionBoundary > input.now ||
      plan.records.some((record) => record.timestamp >= input.sessionBoundary)
    )
      throw new Error('HISTORICAL_RECOVERY_CURRENT_SESSION_BOUNDARY');
    if (plan.records.some((record) => record.canonicalFillId === undefined))
      throw new Error('HISTORICAL_RECOVERY_CANONICAL_EXECUTION_ID_REQUIRED');
    return this.Database.transaction(() => {
      if (this.nonTerminal().length > 0)
        throw new Error('HISTORICAL_RECOVERY_CURRENT_EXECUTION_UNRESOLVED');
      const prior = this.Database.prepare('SELECT * FROM authenticated_fills').all() as Array<{
        fill_id: string;
        side: string;
        quantity: number;
        price: number;
      }>;
      const ids = plan.records.map(
        (r) =>
          input.existingFillIds[r.executionId] ??
          r.canonicalFillId ??
          JSON.stringify([r.orderId, r.fillId, r.executionId]),
      );
      if (new Set(ids).size !== ids.length || prior.some((fill) => !ids.includes(fill.fill_id)))
        throw new Error('HISTORICAL_RECOVERY_EXISTING_FILL_COVERAGE_MISSING');
      const signed = prior.reduce(
        (sum, fill) => sum + (fill.side === 'BUY' ? fill.quantity : -fill.quantity),
        0,
      );
      if (Math.abs(signed - this.ledger().inventory) > 1e-12)
        throw new Error('HISTORICAL_RECOVERY_PRIOR_LEDGER_INCONSISTENT');
      let inserted = 0;
      for (let index = 0; index < plan.records.length; index++) {
        const r = plan.records[index]!;
        const fillId = ids[index]!;
        const stored = prior.find((fill) => fill.fill_id === fillId);
        if (
          stored &&
          (stored.side !== r.side || stored.quantity !== r.quantity || stored.price !== r.price)
        )
          throw new Error('HISTORICAL_RECOVERY_EXISTING_FILL_IDENTITY_CONFLICT');
        if (r.canonicalFillId && r.canonicalFillId !== fillId) {
          const alias = this.Database.prepare(
            'SELECT fill_id FROM authenticated_fill_aliases WHERE alias_fill_id=?',
          ).get(r.canonicalFillId) as { fill_id: string } | undefined;
          if (
            (alias && alias.fill_id !== fillId) ||
            prior.some((fill) => fill.fill_id === r.canonicalFillId)
          )
            throw new Error('HISTORICAL_RECOVERY_FILL_ALIAS_CONFLICT');
          this.Database.prepare('INSERT OR IGNORE INTO authenticated_fill_aliases VALUES(?,?)').run(
            r.canonicalFillId,
            fillId,
          );
        }
        const encoded = JSON.stringify(r);
        const old = this.Database.prepare(
          'SELECT evidence_json evidence FROM historical_fill_recovery_evidence WHERE execution_id=?',
        ).get(r.executionId) as { evidence: string } | undefined;
        if (old && old.evidence !== encoded)
          throw new Error('HISTORICAL_RECOVERY_PROVENANCE_CONFLICT');
        this.Database.prepare(
          'INSERT OR IGNORE INTO historical_fill_recovery_evidence VALUES(?,?,?)',
        ).run(r.executionId, planHash, encoded);
        if (!stored) {
          this.applyFill({
            fillId,
            intentId: null,
            side: r.side,
            quantity: r.quantity,
            price: r.price,
            strategyLineage: false,
            makerProven: false,
            externalCounterparty: false,
            observedAt: r.timestamp,
          });
          inserted++;
        }
      }
      if (Math.abs(this.ledger().inventory - input.venueInventoryBase) > 1e-12)
        throw new Error('HISTORICAL_RECOVERY_POST_REPLAY_INVENTORY_CONFLICT');
      return Object.freeze({
        planHash,
        inserted,
        duplicates: plan.records.length - inserted,
        inventory: this.ledger().inventory,
        historicalDiscrepancies: plan.records.filter((r) => r.blockers.length).length,
      });
    })();
  }

  /** One existing journal boundary for an exact authenticated history batch.
   * The caller must verify coverage, baseline and execution identities first.
   * This never resets inventory from venue FLAT or changes intent terminal state.
   */
  applyAuthenticatedFillBatch(
    fills: readonly Parameters<decibel_execution_lifecycle_journal_v1['applyFill']>[0][],
  ): Readonly<{ inserted: number; duplicates: number; inventory: number }> {
    return this.Database.transaction(() => {
      let inserted = 0;
      let duplicates = 0;
      for (const fill of fills) {
        if (this.applyFill(fill).duplicate) duplicates += 1;
        else inserted += 1;
      }
      return Object.freeze({ inserted, duplicates, inventory: this.ledger().inventory });
    })();
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
    const alias = this.Database.prepare(
      'SELECT fill_id FROM authenticated_fill_aliases WHERE alias_fill_id=?',
    ).get(input.fillId) as { fill_id: string } | undefined;
    const canonicalStoredId = alias?.fill_id ?? input.fillId;
    const transaction = this.Database.transaction(() => {
      const exists = this.Database.prepare('SELECT * FROM authenticated_fills WHERE fill_id=?').get(
        canonicalStoredId,
      ) as Record<string, unknown> | undefined;
      if (exists !== undefined) {
        if (
          exists.intent_id !== input.intentId ||
          exists.side !== input.side ||
          exists.quantity !== input.quantity ||
          exists.price !== input.price ||
          exists.strategy_lineage !== Number(input.strategyLineage) ||
          exists.maker_proven !== Number(input.makerProven) ||
          exists.external_counterparty !== Number(input.externalCounterparty)
        )
          throw new Error('EXECUTION_AUTHENTICATED_FILL_IDENTITY_CONFLICT');
        return true;
      }
      if (
        !Number.isFinite(input.quantity) ||
        input.quantity <= 0 ||
        !Number.isFinite(input.price) ||
        input.price <= 0
      )
        throw new Error('EXECUTION_AUTHENTICATED_FILL_INVALID');
      this.Database.prepare('INSERT INTO authenticated_fills VALUES(?,?,?,?,?,?,?,?,?)').run(
        canonicalStoredId,
        input.intentId,
        input.side,
        input.quantity,
        input.price,
        Number(input.strategyLineage),
        Number(input.makerProven),
        Number(input.externalCounterparty),
        input.observedAt,
      );
      const currentInventory = this.ledger().inventory;
      const currentUnits =
        getDecibelQuantityUnitsV1(Math.abs(currentInventory)) * (currentInventory < 0 ? -1n : 1n);
      const signedUnits =
        getDecibelQuantityUnitsV1(input.quantity) * (input.side === 'BUY' ? 1n : -1n);
      const nextInventory = Number(currentUnits + signedUnits) / 1e8;
      this.Database.prepare("UPDATE lifecycle_state SET value=? WHERE key='inventory'").run(
        nextInventory,
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
  /** Net of fills ingested by this journal, not an authenticated current position.
   * Historical/foreign fills may be outside its coverage. Never reset it from FLAT
   * or use it in place of the live source's authenticated inventory.
   */
  ledger() {
    const rows = this.Database.prepare(
      "SELECT key,value FROM lifecycle_state WHERE key IN ('inventory','strategy_maker_volume','completed_cycles')",
    ).all() as Array<{
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
