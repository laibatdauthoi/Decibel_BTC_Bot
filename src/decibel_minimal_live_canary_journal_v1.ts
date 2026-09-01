import Database from 'better-sqlite3';

import type {
  DecibelMinimalLiveCanaryConfigurationV1,
  DecibelMinimalLiveCanaryReportV1,
  decibel_minimal_live_canary_plan_v1,
  decibel_minimal_live_canary_state_v1,
} from './decibel_minimal_live_canary_v1.js';
import { assertDecibelDeterministicCanarySideIdentityV1 } from './decibel_minimal_live_canary_v1.js';
import type { DecibelMinimalLiveCanaryExecutionPackageV1 } from './decibel_minimal_live_canary_execution_package_v1.js';
import type { decibel_minimal_live_canary_operator_handoff_v1 } from './decibel_minimal_live_canary_operator_handoff_v1.js';

export type decibel_minimal_live_canary_handoff_state_v1 =
  | 'HANDOFF_PREPARED'
  | 'HANDOFF_READY_FOR_OPERATOR'
  | 'OPERATOR_TRANSACTION_OBSERVED'
  | 'TRANSACTION_FINALIZED'
  | 'CANARY_RECONCILED'
  | 'CANARY_UNRESOLVED';

export type decibel_minimal_live_canary_journal_record_v1 = Readonly<{
  canaryId: string;
  executionSessionId: string;
  canaryConfigHash: string;
  configuration: DecibelMinimalLiveCanaryConfigurationV1;
  plan: decibel_minimal_live_canary_plan_v1 | null;
  state: decibel_minimal_live_canary_state_v1;
  placeTransactionHash: string | null;
  cancelTransactionHash: string | null;
  report: DecibelMinimalLiveCanaryReportV1 | null;
  createdAt: number;
  updatedAt: number;
  liveExecutionEnabled: false;
}>;

type journal_row = Readonly<{
  canaryId: string;
  executionSessionId: string;
  canaryConfigHash: string;
  configurationJson: string;
  planJson: string | null;
  state: decibel_minimal_live_canary_state_v1;
  placeTransactionHash: string | null;
  cancelTransactionHash: string | null;
  reportJson: string | null;
  createdAt: number;
  updatedAt: number;
}>;

export class decibel_minimal_live_canary_journal_v1 {
  private readonly database: Database.Database;

  public constructor(databasePath: string) {
    if (!databasePath) throw new Error('CANARY_JOURNAL_PATH_REQUIRED');
    this.database = new Database(databasePath);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('synchronous = FULL');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS decibel_minimal_live_canary_journal_v1 (
        canary_id TEXT PRIMARY KEY,
        execution_session_id TEXT NOT NULL UNIQUE,
        canary_config_hash TEXT NOT NULL,
        configuration_json TEXT NOT NULL,
        plan_json TEXT,
        state TEXT NOT NULL,
        place_transaction_hash TEXT,
        cancel_transaction_hash TEXT,
        report_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        live_execution_enabled INTEGER NOT NULL CHECK(live_execution_enabled = 0)
      );
      CREATE TABLE IF NOT EXISTS decibel_minimal_live_canary_execution_packages_v1 (
        package_identity TEXT PRIMARY KEY,
        canary_id TEXT NOT NULL UNIQUE,
        canary_config_hash TEXT NOT NULL,
        package_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        live_execution_enabled INTEGER NOT NULL CHECK(live_execution_enabled = 0),
        FOREIGN KEY(canary_id) REFERENCES decibel_minimal_live_canary_journal_v1(canary_id)
      );
      CREATE TABLE IF NOT EXISTS decibel_minimal_live_canary_handoffs_v1 (
        handoff_package_hash TEXT PRIMARY KEY,
        canary_id TEXT NOT NULL,
        handoff_json TEXT NOT NULL,
        state TEXT NOT NULL,
        operator_transaction_hash TEXT,
        reconciliation_json TEXT,
        updated_at INTEGER NOT NULL,
        live_execution_enabled INTEGER NOT NULL CHECK(live_execution_enabled = 0)
      );
    `);
  }

  public recordOperatorHandoff(value: decibel_minimal_live_canary_operator_handoff_v1): void {
    this.requireIdentity(value.canaryId, value.configHash);
    const existing = this.getOperatorHandoff(value.handoffPackageHash);
    if (existing !== null) {
      if (JSON.stringify(existing.handoff) !== JSON.stringify(value))
        throw new Error('CANARY_HANDOFF_IDENTITY_CONFLICT');
      return;
    }
    this.database
      .prepare(`INSERT INTO decibel_minimal_live_canary_handoffs_v1 VALUES (?,?,?,?,NULL,NULL,?,0)`)
      .run(
        value.handoffPackageHash,
        value.canaryId,
        JSON.stringify(value),
        value.journalStatus,
        value.createdAt,
      );
  }

  public getOperatorHandoff(handoffPackageHash: string): Readonly<{
    handoff: decibel_minimal_live_canary_operator_handoff_v1;
    state: decibel_minimal_live_canary_handoff_state_v1;
    operatorTransactionHash: string | null;
  }> | null {
    const row = this.database
      .prepare(
        `SELECT handoff_json AS handoffJson, state, operator_transaction_hash AS operatorTransactionHash FROM decibel_minimal_live_canary_handoffs_v1 WHERE handoff_package_hash = ?`,
      )
      .get(handoffPackageHash) as
      | {
          handoffJson: string;
          state: decibel_minimal_live_canary_handoff_state_v1;
          operatorTransactionHash: string | null;
        }
      | undefined;
    return row === undefined
      ? null
      : Object.freeze({
          handoff: JSON.parse(row.handoffJson) as decibel_minimal_live_canary_operator_handoff_v1,
          state: row.state,
          operatorTransactionHash: row.operatorTransactionHash,
        });
  }

  public recordHandoffState(input: {
    handoffPackageHash: string;
    state: decibel_minimal_live_canary_handoff_state_v1;
    transactionHash?: string;
    reconciliation?: unknown;
    recordedAt: number;
  }): void {
    const prior = this.getOperatorHandoff(input.handoffPackageHash);
    if (prior === null) throw new Error('CANARY_HANDOFF_NOT_FOUND');
    if (input.transactionHash !== undefined && !/^0x[0-9a-f]{64}$/i.test(input.transactionHash))
      throw new Error('CANARY_TRANSACTION_HASH_INVALID');
    if (
      prior.operatorTransactionHash !== null &&
      input.transactionHash !== undefined &&
      prior.operatorTransactionHash !== input.transactionHash
    )
      throw new Error('CANARY_TRANSACTION_HASH_CONFLICT');
    this.database
      .prepare(
        `UPDATE decibel_minimal_live_canary_handoffs_v1 SET state=?, operator_transaction_hash=COALESCE(operator_transaction_hash,?), reconciliation_json=COALESCE(?,reconciliation_json), updated_at=? WHERE handoff_package_hash=?`,
      )
      .run(
        input.state,
        input.transactionHash ?? null,
        input.reconciliation === undefined ? null : JSON.stringify(input.reconciliation),
        input.recordedAt,
        input.handoffPackageHash,
      );
  }

  public recordExecutionPackage(value: DecibelMinimalLiveCanaryExecutionPackageV1): void {
    this.requireIdentity(value.canaryId, value.configHash);
    const existing = this.getExecutionPackage(value.canaryId);
    if (existing !== null) {
      if (JSON.stringify(existing) !== JSON.stringify(value))
        throw new Error('CANARY_EXECUTION_PACKAGE_IDENTITY_CONFLICT');
      return;
    }
    this.database
      .prepare(`INSERT INTO decibel_minimal_live_canary_execution_packages_v1 VALUES (?,?,?,?,?,0)`)
      .run(
        value.packageIdentity,
        value.canaryId,
        value.configHash,
        JSON.stringify(value),
        value.timestamp,
      );
  }

  public getExecutionPackage(canaryId: string): DecibelMinimalLiveCanaryExecutionPackageV1 | null {
    const row = this.database
      .prepare(
        `SELECT package_json AS packageJson
         FROM decibel_minimal_live_canary_execution_packages_v1 WHERE canary_id = ?`,
      )
      .get(canaryId) as { packageJson: string } | undefined;
    if (row === undefined) return null;
    const value = JSON.parse(row.packageJson) as DecibelMinimalLiveCanaryExecutionPackageV1;
    const args = [...value.transaction.payload.functionArguments];
    for (let index = 8; index < args.length; index += 1)
      if (args[index] === null) args[index] = undefined;
    return {
      ...value,
      transaction: {
        ...value.transaction,
        payload: { ...value.transaction.payload, functionArguments: args },
      },
    } as unknown as DecibelMinimalLiveCanaryExecutionPackageV1;
  }

  public prepare(input: {
    configuration: DecibelMinimalLiveCanaryConfigurationV1;
    plan: decibel_minimal_live_canary_plan_v1;
    preparedAt: number;
  }): void {
    assertDecibelDeterministicCanarySideIdentityV1(input.configuration);
    if (
      input.configuration.configHash !== input.plan.canaryConfigHash ||
      input.configuration.canaryId !== input.plan.canaryId ||
      input.configuration.executionSessionId !== input.plan.executionSessionId ||
      !Number.isSafeInteger(input.preparedAt)
    )
      throw new Error('CANARY_CONFIG_IDENTITY_CONFLICT');
    const existing = this.get(input.configuration.canaryId);
    if (existing !== null) {
      if (
        existing.canaryConfigHash !== input.configuration.configHash ||
        JSON.stringify(existing.configuration) !== JSON.stringify(input.configuration) ||
        JSON.stringify(existing.plan) !== JSON.stringify(input.plan)
      )
        throw new Error('CANARY_CONFIG_IDENTITY_CONFLICT');
      return;
    }
    const unresolved = this.database
      .prepare(
        `SELECT COUNT(*) AS count FROM decibel_minimal_live_canary_journal_v1 WHERE state <> 'COMPLETE'`,
      )
      .get() as { count: number };
    if (unresolved.count !== 0) throw new Error('CANARY_UNRESOLVED_JOURNAL_EXISTS');
    this.database
      .prepare(
        `INSERT INTO decibel_minimal_live_canary_journal_v1 VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
      )
      .run(
        input.configuration.canaryId,
        input.configuration.executionSessionId,
        input.configuration.configHash,
        JSON.stringify(input.configuration),
        JSON.stringify(input.plan),
        'PREPARED',
        null,
        null,
        null,
        input.preparedAt,
        input.preparedAt,
      );
  }

  public recordTransactionIdentity(input: {
    canaryId: string;
    canaryConfigHash: string;
    purpose: 'PLACE_CANARY_ORDER' | 'UNKNOWN_ORDER_EMERGENCY_CANCEL';
    transactionHash: string;
    recordedAt: number;
  }): void {
    if (!/^0x[0-9a-f]{64}$/i.test(input.transactionHash))
      throw new Error('CANARY_TRANSACTION_HASH_INVALID');
    const record = this.requireIdentity(input.canaryId, input.canaryConfigHash);
    const field =
      input.purpose === 'PLACE_CANARY_ORDER' ? 'place_transaction_hash' : 'cancel_transaction_hash';
    const prior =
      input.purpose === 'PLACE_CANARY_ORDER'
        ? record.placeTransactionHash
        : record.cancelTransactionHash;
    if (prior !== null && prior !== input.transactionHash)
      throw new Error('CANARY_TRANSACTION_HASH_CONFLICT');
    this.database
      .prepare(
        `UPDATE decibel_minimal_live_canary_journal_v1 SET ${field} = ?, updated_at = ? WHERE canary_id = ?`,
      )
      .run(input.transactionHash, input.recordedAt, input.canaryId);
  }

  public recordState(input: {
    canaryId: string;
    canaryConfigHash: string;
    state: decibel_minimal_live_canary_state_v1;
    recordedAt: number;
  }): void {
    this.requireIdentity(input.canaryId, input.canaryConfigHash);
    this.database
      .prepare(
        `UPDATE decibel_minimal_live_canary_journal_v1 SET state = ?, updated_at = ? WHERE canary_id = ?`,
      )
      .run(input.state, input.recordedAt, input.canaryId);
  }

  public recordReport(input: {
    canaryId: string;
    canaryConfigHash: string;
    report: DecibelMinimalLiveCanaryReportV1;
    recordedAt: number;
  }): void {
    this.requireIdentity(input.canaryId, input.canaryConfigHash);
    if (input.report.identity.canaryConfigHash !== input.canaryConfigHash)
      throw new Error('CANARY_CONFIG_IDENTITY_CONFLICT');
    this.database
      .prepare(
        `UPDATE decibel_minimal_live_canary_journal_v1 SET report_json = ?, updated_at = ? WHERE canary_id = ?`,
      )
      .run(JSON.stringify(input.report), input.recordedAt, input.canaryId);
  }

  public get(canaryId: string): decibel_minimal_live_canary_journal_record_v1 | null {
    const row = this.database
      .prepare(
        `SELECT canary_id AS canaryId, execution_session_id AS executionSessionId,
        canary_config_hash AS canaryConfigHash, configuration_json AS configurationJson,
        plan_json AS planJson, state, place_transaction_hash AS placeTransactionHash,
        cancel_transaction_hash AS cancelTransactionHash, report_json AS reportJson,
        created_at AS createdAt, updated_at AS updatedAt
        FROM decibel_minimal_live_canary_journal_v1 WHERE canary_id = ?`,
      )
      .get(canaryId) as journal_row | undefined;
    return row === undefined
      ? null
      : Object.freeze({
          canaryId: row.canaryId,
          executionSessionId: row.executionSessionId,
          canaryConfigHash: row.canaryConfigHash,
          configuration: JSON.parse(
            row.configurationJson,
          ) as DecibelMinimalLiveCanaryConfigurationV1,
          plan:
            row.planJson === null
              ? null
              : (JSON.parse(row.planJson) as decibel_minimal_live_canary_plan_v1),
          state: row.state,
          placeTransactionHash: row.placeTransactionHash,
          cancelTransactionHash: row.cancelTransactionHash,
          report:
            row.reportJson === null
              ? null
              : (JSON.parse(row.reportJson) as DecibelMinimalLiveCanaryReportV1),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          liveExecutionEnabled: false,
        });
  }

  public inspect(): Readonly<{
    healthy: true;
    unresolvedEntryCount: number;
    canaryCount: number;
    liveExecutionEnabled: false;
  }> {
    const counts = this.database
      .prepare(
        `SELECT COUNT(*) AS canaryCount,
          SUM(CASE WHEN state <> 'COMPLETE' THEN 1 ELSE 0 END) AS unresolvedEntryCount
         FROM decibel_minimal_live_canary_journal_v1`,
      )
      .get() as { canaryCount: number; unresolvedEntryCount: number | null };
    return Object.freeze({
      healthy: true,
      unresolvedEntryCount: counts.unresolvedEntryCount ?? 0,
      canaryCount: counts.canaryCount,
      liveExecutionEnabled: false,
    });
  }

  public retireUnsubmittedPrepared(input: { recordedAt: number }): number {
    if (!Number.isSafeInteger(input.recordedAt)) throw new Error('CANARY_RECORDED_AT_INVALID');
    const result = this.database
      .prepare(
        `UPDATE decibel_minimal_live_canary_journal_v1
         SET state = 'COMPLETE', updated_at = ?
         WHERE state = 'PREPARED' AND place_transaction_hash IS NULL`,
      )
      .run(input.recordedAt);
    return result.changes;
  }

  public listReconciliationEligibleHandoffs(): readonly Readonly<{
    handoff: decibel_minimal_live_canary_operator_handoff_v1;
    state: decibel_minimal_live_canary_handoff_state_v1;
    operatorTransactionHash: string | null;
  }>[] {
    const rows = this.database
      .prepare(
        `SELECT handoff_json AS handoffJson, state,
          operator_transaction_hash AS operatorTransactionHash
         FROM decibel_minimal_live_canary_handoffs_v1
         WHERE state IN ('HANDOFF_READY_FOR_OPERATOR','OPERATOR_TRANSACTION_OBSERVED')
         ORDER BY updated_at, handoff_package_hash`,
      )
      .all() as readonly {
      handoffJson: string;
      state: decibel_minimal_live_canary_handoff_state_v1;
      operatorTransactionHash: string | null;
    }[];
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          handoff: JSON.parse(row.handoffJson) as decibel_minimal_live_canary_operator_handoff_v1,
          state: row.state,
          operatorTransactionHash: row.operatorTransactionHash,
        }),
      ),
    );
  }

  private requireIdentity(canaryId: string, canaryConfigHash: string) {
    const record = this.get(canaryId);
    if (record === null) throw new Error('CANARY_JOURNAL_NOT_FOUND');
    if (record.canaryConfigHash !== canaryConfigHash)
      throw new Error('CANARY_CONFIG_IDENTITY_CONFLICT');
    return record;
  }

  public close(): void {
    this.database.close();
  }
}
