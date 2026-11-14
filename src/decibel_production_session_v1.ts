import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { z } from 'zod';

import type { decibel_operator_settings_v1 } from './decibel_operator_settings_v1.js';

export const DECIBEL_PRODUCTION_SESSION_V1 = 'DECIBEL_PRODUCTION_SESSION_V1' as const;
export const DECIBEL_PRODUCTION_SESSION_HEARTBEAT_STALE_MS_V1 = 30_000;

export type decibel_production_session_status_v1 =
  'STARTING' | 'RUNNING' | 'STOPPING' | 'ENDED' | 'INTERRUPTED' | 'BLOCKED';
export type decibel_production_session_owner_state_v1 = 'UNCLAIMED' | 'OWNED';

export type decibel_production_session_record_v1 = Readonly<{
  sessionId: string;
  ownerPid: number | null;
  ownerInstanceId: string | null;
  ownerState: decibel_production_session_owner_state_v1;
  recoveryPid: number | null;
  recoveryInstanceId: string | null;
  recoveryLeaseExpiresAt: number | null;
  takeoverPaused: boolean;
  takeoverObservedExitAt: number | null;
  takeoverClaimLatencyMs: number | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  lastHeartbeatAt: number;
  status: decibel_production_session_status_v1;
  stopReason: string | null;
  unwindRequested: boolean;
  unwindReason: string | null;
  configRevision: number;
  configSnapshot: decibel_operator_settings_v1['values'];
  sessionPnlUsd: number | null;
  pnlComplete: boolean;
  makerVolumeUsd: number | null;
  takerVolumeUsd: number | null;
  totalExecutedVolumeUsd: number | null;
  fillCount: number | null;
  feesUsd: number | null;
  gasUsd: number | null;
  placeCount: number | null;
  cancelCount: number | null;
  reconciliationCount: number | null;
  blockerCount: number | null;
  finalBotState: string | null;
  finalPositionBase: number | null;
  unresolvedExecutionCount: number | null;
}>;

const ConfigSnapshotSchema = z
  .object({
    capitalToUseUsd: z.number().finite().positive(),
    maxLossUsd: z.number().finite().positive(),
    targetMakerVolumeUsd: z
      .number()
      .finite()
      .refine((value) => value !== 0),
    // Written by sessions created before 2026-11-14: retired settings and policy versions.
    orderNotionalUsd: z.number().finite().positive().optional(),
    maxPositionUsd: z.number().finite().positive().optional(),
    capacityPolicyVersion: z.literal(1).optional(),
    sizingPolicyVersion: z.literal(1).optional(),
  })
  .strict()
  .transform((value) => ({
    capitalToUseUsd: value.capitalToUseUsd,
    maxLossUsd: value.maxLossUsd,
    targetMakerVolumeUsd: value.targetMakerVolumeUsd,
  }));

const activeStatuses = ['STARTING', 'RUNNING', 'STOPPING'] as const;

function mapRow(row: Record<string, unknown>): decibel_production_session_record_v1 {
  if (row.target_semantics_version !== 1 && row.target_semantics_version !== 2)
    throw new Error('SESSION_TARGET_SEMANTICS_UNSUPPORTED');
  return Object.freeze({
    sessionId: String(row.session_id),
    ownerPid: typeof row.owner_pid === 'number' ? row.owner_pid : null,
    ownerInstanceId: typeof row.owner_instance_id === 'string' ? row.owner_instance_id : null,
    ownerState: row.owner_state === 'OWNED' ? 'OWNED' : 'UNCLAIMED',
    recoveryPid: typeof row.recovery_pid === 'number' ? row.recovery_pid : null,
    recoveryInstanceId:
      typeof row.recovery_instance_id === 'string' ? row.recovery_instance_id : null,
    recoveryLeaseExpiresAt:
      row.recovery_lease_expires_at === null ? null : Number(row.recovery_lease_expires_at),
    takeoverPaused: Number(row.takeover_paused) === 1,
    takeoverObservedExitAt:
      row.takeover_observed_exit_at === null ? null : Number(row.takeover_observed_exit_at),
    takeoverClaimLatencyMs:
      row.takeover_claim_latency_ms === null ? null : Number(row.takeover_claim_latency_ms),
    createdAt: Number(row.created_at),
    startedAt: row.started_at === null ? null : Number(row.started_at),
    endedAt: row.ended_at === null ? null : Number(row.ended_at),
    lastHeartbeatAt: Number(row.last_heartbeat_at),
    status: String(row.status) as decibel_production_session_status_v1,
    stopReason: typeof row.stop_reason === 'string' ? row.stop_reason : null,
    unwindRequested: Number(row.unwind_requested) === 1,
    unwindReason: typeof row.unwind_reason === 'string' ? row.unwind_reason : null,
    configRevision: Number(row.config_revision),
    configSnapshot: Object.freeze(ConfigSnapshotSchema.parse(JSON.parse(String(row.config_json)))),
    sessionPnlUsd: row.session_pnl_usd === null ? null : Number(row.session_pnl_usd),
    pnlComplete: Number(row.pnl_complete) === 1,
    makerVolumeUsd: row.maker_volume_usd === null ? null : Number(row.maker_volume_usd),
    takerVolumeUsd: row.taker_volume_usd == null ? null : Number(row.taker_volume_usd),
    totalExecutedVolumeUsd:
      row.total_executed_volume_usd == null ? null : Number(row.total_executed_volume_usd),
    fillCount: row.fill_count === null ? null : Number(row.fill_count),
    feesUsd: row.fees_usd === null ? null : Number(row.fees_usd),
    gasUsd: row.gas_usd === null ? null : Number(row.gas_usd),
    placeCount: row.place_count === null ? null : Number(row.place_count),
    cancelCount: row.cancel_count === null ? null : Number(row.cancel_count),
    reconciliationCount:
      row.reconciliation_count === null ? null : Number(row.reconciliation_count),
    blockerCount: row.blocker_count === null ? null : Number(row.blocker_count),
    finalBotState: typeof row.final_bot_state === 'string' ? row.final_bot_state : null,
    finalPositionBase: row.final_position_base === null ? null : Number(row.final_position_base),
    unresolvedExecutionCount:
      row.unresolved_execution_count === null ? null : Number(row.unresolved_execution_count),
  });
}

export class decibel_production_session_store_v1 {
  private readonly Database: Database.Database;

  public constructor(path: string) {
    const resolved = resolve(path);
    mkdirSync(dirname(resolved), { recursive: true });
    this.Database = new Database(resolved);
    this.Database.pragma('journal_mode = WAL');
    this.Database.exec(`
      CREATE TABLE IF NOT EXISTS production_sessions_v1(
        session_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,started_at INTEGER,ended_at INTEGER,
        last_heartbeat_at INTEGER NOT NULL,status TEXT NOT NULL,stop_reason TEXT,
        owner_pid INTEGER,owner_instance_id TEXT,owner_state TEXT NOT NULL DEFAULT 'UNCLAIMED',
        recovery_pid INTEGER,recovery_instance_id TEXT,recovery_lease_expires_at INTEGER,
        takeover_paused INTEGER NOT NULL DEFAULT 0,
        takeover_observed_exit_at INTEGER,takeover_claim_latency_ms INTEGER,
        unwind_requested INTEGER NOT NULL DEFAULT 0,unwind_reason TEXT,
        config_revision INTEGER NOT NULL,config_json TEXT NOT NULL,
        session_pnl_usd REAL,pnl_complete INTEGER NOT NULL DEFAULT 0,maker_volume_usd REAL,
        fill_count INTEGER,fees_usd REAL,gas_usd REAL,place_count INTEGER,cancel_count INTEGER,
        reconciliation_count INTEGER,blocker_count INTEGER,final_bot_state TEXT,
        final_position_base REAL,unresolved_execution_count INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS production_sessions_v1_one_active
      ON production_sessions_v1((1)) WHERE status IN ('STARTING','RUNNING','STOPPING');
      CREATE TABLE IF NOT EXISTS production_session_migrations_v1(
        migration_id TEXT PRIMARY KEY,applied_at INTEGER NOT NULL
      );
    `);
    const columns = this.Database.pragma('table_info(production_sessions_v1)') as Array<{
      name: string;
    }>;
    // Legacy rows keep maker-only semantics. Only create() opts new sessions into V2.
    if (!columns.some((column) => column.name === 'target_semantics_version'))
      this.Database.exec(
        'ALTER TABLE production_sessions_v1 ADD COLUMN target_semantics_version INTEGER NOT NULL DEFAULT 1 CHECK(target_semantics_version IN (1,2))',
      );
    if (!columns.some((column) => column.name === 'taker_volume_usd'))
      this.Database.exec('ALTER TABLE production_sessions_v1 ADD COLUMN taker_volume_usd REAL');
    if (!columns.some((column) => column.name === 'total_executed_volume_usd'))
      this.Database.exec(
        'ALTER TABLE production_sessions_v1 ADD COLUMN total_executed_volume_usd REAL',
      );
    if (!columns.some((column) => column.name === 'unwind_requested'))
      this.Database.exec(
        'ALTER TABLE production_sessions_v1 ADD COLUMN unwind_requested INTEGER NOT NULL DEFAULT 0',
      );
    if (!columns.some((column) => column.name === 'unwind_reason'))
      this.Database.exec('ALTER TABLE production_sessions_v1 ADD COLUMN unwind_reason TEXT');
    if (!columns.some((column) => column.name === 'owner_pid'))
      this.Database.exec('ALTER TABLE production_sessions_v1 ADD COLUMN owner_pid INTEGER');
    if (!columns.some((column) => column.name === 'owner_instance_id'))
      this.Database.exec('ALTER TABLE production_sessions_v1 ADD COLUMN owner_instance_id TEXT');
    if (!columns.some((column) => column.name === 'owner_state'))
      this.Database.exec(
        "ALTER TABLE production_sessions_v1 ADD COLUMN owner_state TEXT NOT NULL DEFAULT 'UNCLAIMED'",
      );
    if (!columns.some((column) => column.name === 'recovery_pid'))
      this.Database.exec('ALTER TABLE production_sessions_v1 ADD COLUMN recovery_pid INTEGER');
    if (!columns.some((column) => column.name === 'recovery_instance_id'))
      this.Database.exec('ALTER TABLE production_sessions_v1 ADD COLUMN recovery_instance_id TEXT');
    if (!columns.some((column) => column.name === 'recovery_lease_expires_at'))
      this.Database.exec(
        'ALTER TABLE production_sessions_v1 ADD COLUMN recovery_lease_expires_at INTEGER',
      );
    if (!columns.some((column) => column.name === 'takeover_paused'))
      this.Database.exec(
        'ALTER TABLE production_sessions_v1 ADD COLUMN takeover_paused INTEGER NOT NULL DEFAULT 0',
      );
    if (!columns.some((column) => column.name === 'takeover_observed_exit_at'))
      this.Database.exec(
        'ALTER TABLE production_sessions_v1 ADD COLUMN takeover_observed_exit_at INTEGER',
      );
    if (!columns.some((column) => column.name === 'takeover_claim_latency_ms'))
      this.Database.exec(
        'ALTER TABLE production_sessions_v1 ADD COLUMN takeover_claim_latency_ms INTEGER',
      );
  }

  public recoverInterrupted(
    now: number,
    staleMs = DECIBEL_PRODUCTION_SESSION_HEARTBEAT_STALE_MS_V1,
  ): number {
    return this.Database.prepare(
      `UPDATE production_sessions_v1 SET status='INTERRUPTED',ended_at=?,stop_reason='PROCESS_INTERRUPTED'
       WHERE status IN ('STARTING','RUNNING','STOPPING') AND unwind_requested=0 AND last_heartbeat_at<?`,
    ).run(now, now - staleMs).changes;
  }

  public recoverOrphanedActiveSession(now: number): number {
    return this.Database.prepare(
      `UPDATE production_sessions_v1 SET status='INTERRUPTED',ended_at=?,stop_reason='PROCESS_INTERRUPTED'
       WHERE status IN ('STARTING','RUNNING','STOPPING') AND unwind_requested=0 AND last_heartbeat_at<?`,
    ).run(now, now - DECIBEL_PRODUCTION_SESSION_HEARTBEAT_STALE_MS_V1).changes;
  }

  public create(
    settings: decibel_operator_settings_v1,
    now: number,
    sessionId = `session-${now}-${randomUUID()}`,
  ): decibel_production_session_record_v1 {
    if (!/^session-\d+-[0-9a-f-]{36}$/u.test(sessionId)) throw new Error('SESSION_ID_INVALID');
    try {
      this.Database.prepare(
        `INSERT INTO production_sessions_v1(
          session_id,created_at,started_at,ended_at,last_heartbeat_at,status,stop_reason,
          config_revision,config_json,pnl_complete,target_semantics_version
        ) VALUES(?,?,NULL,NULL,?,'STARTING',NULL,?,?,0,2)`,
      ).run(sessionId, now, now, settings.revision, JSON.stringify(settings.values));
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message))
        throw new Error('SESSION_ALREADY_ACTIVE', { cause: error });
      throw error;
    }
    return this.get(sessionId)!;
  }

  public get(sessionId: string): decibel_production_session_record_v1 | null {
    const row = this.Database.prepare(
      'SELECT * FROM production_sessions_v1 WHERE session_id=?',
    ).get(sessionId) as Record<string, unknown> | undefined;
    return row === undefined ? null : mapRow(row);
  }

  public getActive(): decibel_production_session_record_v1 | null {
    const placeholders = activeStatuses.map(() => '?').join(',');
    const row = this.Database.prepare(
      `SELECT * FROM production_sessions_v1 WHERE status IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`,
    ).get(...activeStatuses) as Record<string, unknown> | undefined;
    return row === undefined ? null : mapRow(row);
  }

  public list(limit: number | null = 100): readonly decibel_production_session_record_v1[] {
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100))
      throw new Error('SESSION_HISTORY_LIMIT_INVALID');
    return Object.freeze(
      (
        this.Database.prepare(
          'SELECT * FROM production_sessions_v1 ORDER BY created_at DESC LIMIT ?',
        ).all(limit ?? -1) as Record<string, unknown>[]
      ).map(mapRow),
    );
  }

  public transition(
    sessionId: string,
    expected: readonly decibel_production_session_status_v1[],
    status: decibel_production_session_status_v1,
    now: number,
    stopReason: string | null = null,
  ): decibel_production_session_record_v1 {
    const result = this.Database.prepare(
      `UPDATE production_sessions_v1 SET status=?,started_at=CASE WHEN ?='RUNNING' THEN COALESCE(started_at,?) ELSE started_at END,
       ended_at=CASE WHEN ? IN ('ENDED','INTERRUPTED','BLOCKED') THEN ? ELSE ended_at END,
       last_heartbeat_at=?,stop_reason=COALESCE(?,stop_reason)
       WHERE session_id=? AND status IN (${expected.map(() => '?').join(',')})`,
    ).run(status, status, now, status, now, now, stopReason, sessionId, ...expected);
    if (result.changes !== 1) throw new Error('SESSION_TRANSITION_CONFLICT');
    return this.get(sessionId)!;
  }

  public claimOwner(
    sessionId: string,
    owner: Readonly<{ pid: number; instanceId: string }>,
    now: number,
  ): decibel_production_session_record_v1 {
    void sessionId;
    void owner;
    void now;
    throw new Error('SESSION_DIRECT_OWNER_CLAIM_FORBIDDEN');
  }

  public acquireRecoveryLease(
    sessionId: string,
    expected: Readonly<{
      ownerPid: number | null;
      ownerInstanceId: string | null;
      ownerState: decibel_production_session_owner_state_v1;
      heartbeatAt: number;
    }>,
    claimant: Readonly<{ pid: number; instanceId: string }>,
    now: number,
    leaseMs = 30_000,
  ): decibel_production_session_record_v1 {
    if (
      !Number.isSafeInteger(claimant.pid) ||
      claimant.pid <= 0 ||
      claimant.instanceId.length === 0
    )
      throw new Error('SESSION_RUNTIME_OWNER_IDENTITY_INVALID');
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0)
      throw new Error('SESSION_RECOVERY_LEASE_DURATION_INVALID');
    const result = this.Database.prepare(
      `UPDATE production_sessions_v1
       SET recovery_pid=?,recovery_instance_id=?,recovery_lease_expires_at=?
       WHERE session_id=? AND status IN ('STARTING','RUNNING','STOPPING')
         AND owner_pid IS ? AND owner_instance_id IS ? AND owner_state=? AND last_heartbeat_at=?
         AND (recovery_pid IS NULL OR recovery_lease_expires_at<=?
              OR (recovery_pid=? AND recovery_instance_id=?))`,
    ).run(
      claimant.pid,
      claimant.instanceId,
      now + leaseMs,
      sessionId,
      expected.ownerPid,
      expected.ownerInstanceId,
      expected.ownerState,
      expected.heartbeatAt,
      now,
      claimant.pid,
      claimant.instanceId,
    );
    if (result.changes !== 1) throw new Error('SESSION_RUNTIME_OWNER_CLAIM_CONFLICT');
    return this.get(sessionId)!;
  }

  public releaseRecoveryLease(
    sessionId: string,
    claimant: Readonly<{ pid: number; instanceId: string }>,
  ): void {
    this.Database.prepare(
      `UPDATE production_sessions_v1
       SET recovery_pid=NULL,recovery_instance_id=NULL,recovery_lease_expires_at=NULL
       WHERE session_id=? AND recovery_pid=? AND recovery_instance_id=?`,
    ).run(sessionId, claimant.pid, claimant.instanceId);
  }

  public repairAbandonedRecoveryLease(
    sessionId: string,
    claimant: Readonly<{ pid: number; instanceId: string }>,
    now: number,
  ): boolean {
    return (
      this.Database.prepare(
        `UPDATE production_sessions_v1
         SET recovery_pid=NULL,recovery_instance_id=NULL,recovery_lease_expires_at=NULL
         WHERE session_id=? AND owner_state='UNCLAIMED' AND owner_pid IS NULL
           AND recovery_pid IS NOT NULL
           AND (recovery_lease_expires_at<=?
                OR (recovery_pid=? AND recovery_instance_id=?))`,
      ).run(sessionId, now, claimant.pid, claimant.instanceId).changes === 1
    );
  }

  public promoteRecoveryLeaseToOwner(
    sessionId: string,
    expected: Readonly<{
      ownerPid: number | null;
      ownerInstanceId: string | null;
      ownerState: decibel_production_session_owner_state_v1;
      heartbeatAt: number;
    }>,
    claimant: Readonly<{ pid: number; instanceId: string }>,
    now: number,
    takeoverPaused: boolean,
    observedExitAt: number | null = null,
  ): decibel_production_session_record_v1 {
    const result = this.Database.prepare(
      `UPDATE production_sessions_v1
       SET owner_pid=?,owner_instance_id=?,owner_state='OWNED',last_heartbeat_at=?,
           recovery_pid=NULL,recovery_instance_id=NULL,recovery_lease_expires_at=NULL,
           takeover_paused=?,takeover_observed_exit_at=COALESCE(?,takeover_observed_exit_at),
           takeover_claim_latency_ms=CASE WHEN ? IS NULL THEN takeover_claim_latency_ms ELSE ?-? END
       WHERE session_id=? AND status IN ('STARTING','RUNNING','STOPPING')
         AND owner_pid IS ? AND owner_instance_id IS ? AND owner_state=? AND last_heartbeat_at=?
         AND recovery_pid=? AND recovery_instance_id=? AND recovery_lease_expires_at>=?`,
    ).run(
      claimant.pid,
      claimant.instanceId,
      now,
      takeoverPaused ? 1 : 0,
      observedExitAt,
      observedExitAt,
      now,
      observedExitAt,
      sessionId,
      expected.ownerPid,
      expected.ownerInstanceId,
      expected.ownerState,
      expected.heartbeatAt,
      claimant.pid,
      claimant.instanceId,
      now,
    );
    if (result.changes !== 1) throw new Error('SESSION_RUNTIME_OWNER_PROMOTION_CONFLICT');
    return this.get(sessionId)!;
  }

  public repairPartialOwner(
    sessionId: string,
    expected: Readonly<{ pid: number; instanceId: string; heartbeatAt: number }>,
  ): boolean {
    return (
      this.Database.prepare(
        `UPDATE production_sessions_v1
         SET owner_pid=NULL,owner_instance_id=NULL,
             recovery_pid=NULL,recovery_instance_id=NULL,recovery_lease_expires_at=NULL
         WHERE session_id=? AND owner_state='UNCLAIMED'
           AND owner_pid=? AND owner_instance_id=? AND last_heartbeat_at=?`,
      ).run(sessionId, expected.pid, expected.instanceId, expected.heartbeatAt).changes === 1
    );
  }

  public releaseProvenAbsentOwner(
    sessionId: string,
    expected: Readonly<{
      pid: number | null;
      instanceId: string | null;
      heartbeatAt: number;
    }>,
  ): decibel_production_session_record_v1 {
    const result = this.Database.prepare(
      `UPDATE production_sessions_v1
       SET owner_pid=NULL,owner_instance_id=NULL,owner_state='UNCLAIMED'
       WHERE session_id=? AND owner_state='OWNED'
         AND owner_pid IS ? AND owner_instance_id IS ? AND last_heartbeat_at=?`,
    ).run(sessionId, expected.pid, expected.instanceId, expected.heartbeatAt);
    if (result.changes !== 1) throw new Error('SESSION_RUNTIME_OWNER_RELEASE_CONFLICT');
    return this.get(sessionId)!;
  }

  public claimLegacyOwnerAfterExit(
    sessionId: string,
    owner: Readonly<{ pid: number; instanceId: string }>,
    now: number,
    expectedHeartbeatAt: number,
    observedExitAt: number,
  ): decibel_production_session_record_v1 {
    void sessionId;
    void owner;
    void now;
    void expectedHeartbeatAt;
    void observedExitAt;
    throw new Error('SESSION_DIRECT_OWNER_CLAIM_FORBIDDEN');
  }

  public claimPausedOwnerAfterExit(
    sessionId: string,
    expected: Readonly<{ pid: number; instanceId: string; heartbeatAt: number }>,
    owner: Readonly<{ pid: number; instanceId: string }>,
    now: number,
  ): decibel_production_session_record_v1 {
    void sessionId;
    void expected;
    void owner;
    void now;
    throw new Error('SESSION_DIRECT_OWNER_CLAIM_FORBIDDEN');
  }

  public resumePausedTakeover(
    sessionId: string,
    owner: Readonly<{ pid: number; instanceId: string }>,
  ): boolean {
    return (
      this.Database.prepare(
        `UPDATE production_sessions_v1 SET takeover_paused=0
       WHERE session_id=? AND status='RUNNING' AND takeover_paused=1
         AND owner_pid=? AND owner_instance_id=?`,
      ).run(sessionId, owner.pid, owner.instanceId).changes === 1
    );
  }

  public heartbeat(
    sessionId: string,
    owner: Readonly<{ pid: number; instanceId: string }>,
    now: number,
  ): boolean {
    return (
      this.Database.prepare(
        `UPDATE production_sessions_v1 SET last_heartbeat_at=?
       WHERE session_id=? AND owner_pid=? AND owner_instance_id=?
         AND owner_state='OWNED' AND status IN ('RUNNING','STOPPING')`,
      ).run(now, sessionId, owner.pid, owner.instanceId).changes === 1
    );
  }

  public markUnwindRequested(sessionId: string, reason: string, now: number): void {
    const result = this.Database.prepare(
      `UPDATE production_sessions_v1
       SET unwind_requested=1,unwind_reason=?,status='STOPPING',stop_reason=COALESCE(stop_reason,?),last_heartbeat_at=?
       WHERE session_id=? AND status IN ('STARTING','RUNNING','STOPPING')`,
    ).run(reason, reason, now, sessionId);
    if (result.changes !== 1) throw new Error('SESSION_UNWIND_PERSISTENCE_CONFLICT');
  }

  public markUnwindRequestedIfOwner(
    sessionId: string,
    owner: Readonly<{ pid: number; instanceId: string }>,
    reason: string,
    now: number,
  ): boolean {
    return (
      this.Database.prepare(
        `UPDATE production_sessions_v1
       SET unwind_requested=1,unwind_reason=?,status='STOPPING',
           stop_reason=COALESCE(stop_reason,?),last_heartbeat_at=?
       WHERE session_id=? AND status IN ('RUNNING','STOPPING')
         AND owner_pid=? AND owner_instance_id=? AND owner_state='OWNED'`,
      ).run(reason, reason, now, sessionId, owner.pid, owner.instanceId).changes === 1
    );
  }

  public updateActiveAccounting(
    sessionId: string,
    makerVolumeUsd: number,
    fillCount: number,
    takerVolumeUsd = 0,
    totalExecutedVolumeUsd = makerVolumeUsd + takerVolumeUsd,
  ): void {
    if (
      !Number.isFinite(makerVolumeUsd) ||
      makerVolumeUsd < 0 ||
      !Number.isFinite(takerVolumeUsd) ||
      takerVolumeUsd < 0 ||
      !Number.isFinite(totalExecutedVolumeUsd) ||
      Math.abs(totalExecutedVolumeUsd - makerVolumeUsd - takerVolumeUsd) > 1e-9 ||
      !Number.isSafeInteger(fillCount) ||
      fillCount < 0
    )
      throw new Error('SESSION_ACCOUNTING_INVALID');
    this.Database.prepare(
      `UPDATE production_sessions_v1
      SET maker_volume_usd=?,fill_count=?,taker_volume_usd=?,total_executed_volume_usd=? WHERE session_id=? AND status IN ('STARTING','RUNNING','STOPPING')
    `,
    ).run(makerVolumeUsd, fillCount, takerVolumeUsd, totalExecutedVolumeUsd, sessionId);
  }

  public finalizeAccounting(
    sessionId: string,
    values: Partial<
      Pick<
        decibel_production_session_record_v1,
        | 'sessionPnlUsd'
        | 'pnlComplete'
        | 'makerVolumeUsd'
        | 'takerVolumeUsd'
        | 'totalExecutedVolumeUsd'
        | 'fillCount'
        | 'feesUsd'
        | 'gasUsd'
        | 'placeCount'
        | 'cancelCount'
        | 'reconciliationCount'
        | 'blockerCount'
        | 'finalBotState'
        | 'finalPositionBase'
        | 'unresolvedExecutionCount'
      >
    >,
  ): void {
    this.Database.prepare(
      `UPDATE production_sessions_v1 SET session_pnl_usd=?,pnl_complete=?,maker_volume_usd=?,taker_volume_usd=?,total_executed_volume_usd=?,fill_count=?,
       fees_usd=?,gas_usd=?,place_count=?,cancel_count=?,reconciliation_count=?,blocker_count=?,
       final_bot_state=?,final_position_base=?,unresolved_execution_count=? WHERE session_id=?`,
    ).run(
      values.sessionPnlUsd ?? null,
      values.pnlComplete ? 1 : 0,
      values.makerVolumeUsd ?? null,
      values.takerVolumeUsd ?? null,
      values.totalExecutedVolumeUsd ?? null,
      values.fillCount ?? null,
      values.feesUsd ?? null,
      values.gasUsd ?? null,
      values.placeCount ?? null,
      values.cancelCount ?? null,
      values.reconciliationCount ?? null,
      values.blockerCount ?? null,
      values.finalBotState ?? null,
      values.finalPositionBase ?? null,
      values.unresolvedExecutionCount ?? null,
      sessionId,
    );
  }

  public completeUnwind(
    sessionId: string,
    values: Parameters<decibel_production_session_store_v1['finalizeAccounting']>[1],
    now: number,
    reason: string,
  ): decibel_production_session_record_v1 {
    return this.Database.transaction(() => {
      const current = this.get(sessionId);
      if (current === null) throw new Error('SESSION_UNWIND_COMPLETION_CONFLICT');
      if (current.status === 'ENDED' && !current.unwindRequested) return current;
      if (current.status !== 'STOPPING' || !current.unwindRequested)
        throw new Error('SESSION_UNWIND_COMPLETION_CONFLICT');
      this.finalizeAccounting(sessionId, values);
      const result = this.Database.prepare(
        `UPDATE production_sessions_v1
         SET status='ENDED',ended_at=?,last_heartbeat_at=?,stop_reason=COALESCE(stop_reason,?),
             unwind_requested=0,unwind_reason=NULL
         WHERE session_id=? AND status='STOPPING' AND unwind_requested=1`,
      ).run(now, now, reason, sessionId);
      if (result.changes !== 1) throw new Error('SESSION_UNWIND_COMPLETION_CONFLICT');
      return this.get(sessionId)!;
    })();
  }

  public migrateLegacyCompletedUnwindMarkers(): number {
    return this.Database.transaction(() => {
      const migrationId = 'legacy_completed_flat_unwind_v1';
      const existing = this.Database.prepare(
        'SELECT 1 FROM production_session_migrations_v1 WHERE migration_id=?',
      ).get(migrationId);
      if (existing !== undefined) return 0;
      const changes = this.Database.prepare(
        `UPDATE production_sessions_v1
         SET unwind_requested=0,unwind_reason=NULL
         WHERE status='ENDED' AND unwind_requested=1 AND final_position_base=0
           AND unresolved_execution_count=0`,
      ).run().changes;
      this.Database.prepare(
        'INSERT INTO production_session_migrations_v1(migration_id,applied_at) VALUES(?,?)',
      ).run(migrationId, Date.now());
      return changes;
    })();
  }

  public close(): void {
    this.Database.close();
  }
}
