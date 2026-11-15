import { randomUUID } from 'node:crypto';
import type { decibel_session_start_attempt_v1 } from './decibel_session_control_diagnostics_v1.js';

import type { decibel_operator_settings_store_v1 } from './decibel_operator_settings_v1.js';
import {
  DECIBEL_PRODUCTION_SESSION_HEARTBEAT_STALE_MS_V1,
  decibel_production_session_store_v1,
  type decibel_production_session_record_v1,
} from './decibel_production_session_v1.js';

export type decibel_production_session_runtime_v1 = Readonly<{
  setHistoricalRecoveryBlocker?(blocker: string | null): void;
  activate?(): void;
  wake?(): void;
  closePaused?(): Promise<void>;
  /** Stop the control loop for a process shutdown without ending the session. */
  pauseForShutdown?(): Promise<Readonly<{ settled: boolean }>>;
  stop(reason: string): Promise<
    Readonly<{
      safeToEnd: boolean;
      blocker: string | null;
      accounting?: Parameters<decibel_production_session_store_v1['finalizeAccounting']>[1];
    }>
  >;
}>;

function isOwnerProcessAbsent(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH';
  }
}

export class decibel_production_session_controller_v1 {
  private Runtime: decibel_production_session_runtime_v1 | null = null;
  private transition: Promise<unknown> = Promise.resolve();
  private observedLegacyExitAt: number | null = null;
  private RecoveryBlocker: string | null = null;
  private ProtectiveRecoveryBlocker: string | null = null;
  private StartAttempt: decibel_session_start_attempt_v1 | null = null;
  private PendingStart: Promise<decibel_production_session_record_v1> | null = null;

  public async requestStart(expectedSettingsRevision: number) {
    const disposition =
      this.PendingStart !== null
        ? 'ALREADY_STARTING'
        : this.ownsActiveRuntime() && this.Sessions.getActive()?.status === 'RUNNING'
          ? 'ALREADY_ACTIVE'
          : 'ACCEPTED_STARTING';
    const session = await this.start(expectedSettingsRevision);
    return Object.freeze({
      ...session,
      startDisposition: disposition,
      transitionId: session.sessionId,
      readinessBlocker: this.RecoveryBlocker,
    });
  }

  public constructor(
    private readonly Sessions: decibel_production_session_store_v1,
    private readonly Settings: decibel_operator_settings_store_v1,
    private readonly startRuntime: (
      session: decibel_production_session_record_v1,
      protectiveRecoveryBlocker?: string | null,
    ) => Promise<decibel_production_session_runtime_v1>,
    private readonly getNow: () => number = Date.now,
    private readonly validateStart: () => Promise<void> | void = () => undefined,
    private readonly validateOrphanRecovery: (
      protectiveOnly?: boolean,
    ) => Promise<void> | void = () => undefined,
    private readonly Owner: Readonly<{ pid: number; instanceId: string }> = Object.freeze({
      pid: process.pid,
      instanceId: `${process.pid}-${randomUUID()}`,
    }),
    private readonly proveOwnerProcessAbsent: (pid: number) => boolean = isOwnerProcessAbsent,
    private readonly legacyOwnerPid: number | null = null,
    private readonly observeStartAttempt: (
      attempt: decibel_session_start_attempt_v1,
    ) => void = () => undefined,
  ) {}

  public async recoverStartup(): Promise<number> {
    return this.exclusive(() => this.recoverStartupInternal());
  }

  public restrictRuntimeToProtection(blocker: string): void {
    if (!this.ownsActiveRuntime() || !this.Runtime?.setHistoricalRecoveryBlocker || !blocker)
      throw new Error('PROTECTIVE_RUNTIME_OWNERSHIP_REQUIRED');
    this.Runtime.setHistoricalRecoveryBlocker(blocker);
    this.ProtectiveRecoveryBlocker = blocker;
    this.RecoveryBlocker = blocker;
  }

  public async recoverProtectiveStartup(blocker: string): Promise<number> {
    if (!blocker) throw new Error('PROTECTIVE_RECOVERY_BLOCKER_REQUIRED');
    return this.exclusive(() => this.recoverStartupInternal(blocker));
  }

  private async recoverStartupInternal(
    protectiveRecoveryBlocker: string | null = null,
  ): Promise<number> {
    let active = this.Sessions.getActive();
    if (
      active !== null &&
      this.Runtime !== null &&
      active.ownerState === 'OWNED' &&
      active.ownerPid === this.Owner.pid &&
      active.ownerInstanceId === this.Owner.instanceId
    ) {
      if (protectiveRecoveryBlocker === null && this.ProtectiveRecoveryBlocker !== null)
        await this.validateOrphanRecovery(false);
      if (protectiveRecoveryBlocker !== null && !this.Runtime.setHistoricalRecoveryBlocker)
        throw new Error('PROTECTIVE_RUNTIME_CONTRACT_REQUIRED');
      this.ProtectiveRecoveryBlocker = protectiveRecoveryBlocker;
      this.Runtime.setHistoricalRecoveryBlocker?.(protectiveRecoveryBlocker);
      return 0;
    }

    let repairedPartialOwner = false;
    if (active?.ownerState === 'UNCLAIMED' && active.ownerPid !== null) {
      const isThisIncompleteClaim =
        active.ownerPid === this.Owner.pid && active.ownerInstanceId === this.Owner.instanceId;
      if (!isThisIncompleteClaim && !this.proveOwnerProcessAbsent(active.ownerPid))
        throw new Error('SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT');
      repairedPartialOwner = this.Sessions.repairPartialOwner(active.sessionId, {
        pid: active.ownerPid,
        instanceId: active.ownerInstanceId ?? '',
        heartbeatAt: active.lastHeartbeatAt,
      });
      active = this.Sessions.getActive();
      if (!repairedPartialOwner || active === null)
        throw new Error('SESSION_PARTIAL_OWNER_REPAIR_CONFLICT');
    }
    let repairedAbandonedRecovery = false;
    if (
      active?.ownerState === 'UNCLAIMED' &&
      active.ownerPid === null &&
      active.recoveryPid !== null
    ) {
      repairedAbandonedRecovery = this.Sessions.repairAbandonedRecoveryLease(
        active.sessionId,
        this.Owner,
        this.getNow(),
      );
      if (!repairedAbandonedRecovery) throw new Error('SESSION_RECOVERY_LEASE_ACTIVE');
      active = this.Sessions.getActive();
      if (active === null) throw new Error('SESSION_RECOVERY_STATE_MISSING');
    }

    const resumingOwnedRuntime =
      active !== null &&
      active.ownerState === 'OWNED' &&
      active.ownerPid === this.Owner.pid &&
      active.ownerInstanceId === this.Owner.instanceId;

    if (active !== null) {
      if (
        active.status === 'RUNNING' &&
        active.ownerPid === null &&
        this.legacyOwnerPid === null &&
        !repairedPartialOwner &&
        !repairedAbandonedRecovery
      )
        throw new Error('SESSION_LEGACY_OWNER_PID_REQUIRED_FOR_TAKEOVER');
      if (
        active.status === 'RUNNING' &&
        active.ownerPid === null &&
        this.legacyOwnerPid !== null &&
        !repairedPartialOwner &&
        !repairedAbandonedRecovery
      ) {
        if (!this.proveOwnerProcessAbsent(this.legacyOwnerPid))
          throw new Error('SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT');
        this.observedLegacyExitAt ??= this.getNow();
      }
      await this.validateOrphanRecovery(protectiveRecoveryBlocker !== null);
      if (resumingOwnedRuntime) {
        const Runtime = await this.startRuntime(active, protectiveRecoveryBlocker);
        this.Runtime = Runtime;
        this.ProtectiveRecoveryBlocker = protectiveRecoveryBlocker;
        if (!this.Sessions.getActive()?.takeoverPaused) Runtime.activate?.();
        return 1;
      }
      if (!repairedPartialOwner) {
        this.assertPriorOwnerAbsent(active);
        if (active.ownerState === 'OWNED')
          active = this.Sessions.releaseProvenAbsentOwner(active.sessionId, {
            pid: active.ownerPid,
            instanceId: active.ownerInstanceId,
            heartbeatAt: active.lastHeartbeatAt,
          });
      }
      const takeoverPaused =
        active.takeoverPaused ||
        (active.status === 'RUNNING' &&
          active.ownerPid === null &&
          this.legacyOwnerPid !== null &&
          !repairedPartialOwner &&
          !repairedAbandonedRecovery);
      await this.prepareAndPromote(
        active,
        takeoverPaused,
        this.observedLegacyExitAt,
        true,
        protectiveRecoveryBlocker,
      );
      this.ProtectiveRecoveryBlocker = protectiveRecoveryBlocker;
      return 1;
    }
    return 0;
  }

  public getState(): Readonly<{
    lastStartAttempt: decibel_session_start_attempt_v1 | null;
    state: 'IDLE' | 'RECOVERY_BLOCKED' | decibel_production_session_record_v1['status'];
    persistedState: 'IDLE' | decibel_production_session_record_v1['status'];
    ownerState: 'NONE' | 'OWNED' | 'UNCLAIMED_OR_STALE';
    recoveryBlocker: string | null;
    runtimeReadinessBlocker: string | null;
    protectiveOnly: boolean;
    activeSession: decibel_production_session_record_v1 | null;
    takeover: Readonly<{
      state: 'NONE' | 'WAITING_FOR_LEGACY_PID' | 'PAUSED';
      waitingForLegacyPid: number | null;
      claimLatencyMs: number | null;
    }>;
  }> {
    const activeSession = this.Sessions.getActive();
    const owned = this.ownsActiveRuntime();
    const recoveryBlocked =
      activeSession !== null && (!owned || this.ProtectiveRecoveryBlocker !== null);
    const waitingForLegacyPid =
      activeSession?.status === 'RUNNING' &&
      activeSession.ownerPid === null &&
      !activeSession.takeoverPaused
        ? this.legacyOwnerPid
        : null;
    return Object.freeze({
      lastStartAttempt: this.StartAttempt,
      runtimeReadinessBlocker: this.RecoveryBlocker,
      state: recoveryBlocked ? 'RECOVERY_BLOCKED' : (activeSession?.status ?? 'IDLE'),
      persistedState: activeSession?.status ?? 'IDLE',
      ownerState: activeSession === null ? 'NONE' : owned ? 'OWNED' : 'UNCLAIMED_OR_STALE',
      recoveryBlocker: recoveryBlocked
        ? (this.ProtectiveRecoveryBlocker ??
          this.RecoveryBlocker ??
          'SESSION_STARTUP_RECOVERY_PENDING')
        : null,
      protectiveOnly: owned && this.ProtectiveRecoveryBlocker !== null,
      activeSession,
      takeover: Object.freeze({
        state: activeSession?.takeoverPaused
          ? 'PAUSED'
          : waitingForLegacyPid !== null
            ? 'WAITING_FOR_LEGACY_PID'
            : 'NONE',
        waitingForLegacyPid,
        claimLatencyMs: activeSession?.takeoverClaimLatencyMs ?? null,
      }),
    });
  }

  public setRecoveryBlocker(blocker: string | null): void {
    this.RecoveryBlocker = blocker;
  }

  public resumeTakeover(): Promise<decibel_production_session_record_v1> {
    return this.exclusive(async () => {
      const active = this.Sessions.getActive();
      if (active === null || !active.takeoverPaused || !this.ownsActiveRuntime())
        throw new Error('SESSION_TAKEOVER_NOT_OWNED_OR_PAUSED');
      await this.validateOrphanRecovery();
      if (!this.Sessions.resumePausedTakeover(active.sessionId, this.Owner))
        throw new Error('SESSION_TAKEOVER_RESUME_CONFLICT');
      this.Runtime?.activate?.();
      return this.Sessions.get(active.sessionId)!;
    });
  }

  public async closePausedRuntime(): Promise<void> {
    if (!this.isTakeoverPaused()) return;
    await this.Runtime?.closePaused?.();
    this.Runtime = null;
  }

  public isTakeoverPaused(): boolean {
    return this.ownsActiveRuntime() && this.Sessions.getActive()?.takeoverPaused === true;
  }

  public getHistory(): readonly decibel_production_session_record_v1[] {
    return this.Sessions.list(null);
  }

  public start(expectedSettingsRevision: number): Promise<decibel_production_session_record_v1> {
    if (this.PendingStart !== null) return this.PendingStart;
    const active = this.Sessions.getActive();
    if (active?.status === 'RUNNING' && this.ownsActiveRuntime()) return Promise.resolve(active);
    const pending = this.performStart(expectedSettingsRevision);
    this.PendingStart = pending;
    void pending
      .finally(() => {
        if (this.PendingStart === pending) this.PendingStart = null;
      })
      .catch(() => undefined);
    return pending;
  }

  private performStart(
    expectedSettingsRevision: number,
  ): Promise<decibel_production_session_record_v1> {
    const requestedAt = this.getNow();
    const transitionId = `session-${requestedAt}-${randomUUID()}`;
    const record = (
      outcome: decibel_session_start_attempt_v1['outcome'],
      sessionId: string | null,
      blocker: string | null,
    ) => {
      this.StartAttempt = Object.freeze({
        transitionId,
        outcome,
        requestedAt,
        completedAt: outcome === 'REQUESTED' ? null : this.getNow(),
        expectedSettingsRevision,
        sessionId,
        blocker,
      });
      try {
        this.observeStartAttempt(this.StartAttempt);
      } catch {
        // Diagnostic storage must not change the outcome of trading admission.
        console.error('SESSION_START_AUDIT=FAILED');
      }
    };
    record('REQUESTED', null, null);
    return this.exclusive(async () => {
      if (this.Sessions.getActive() !== null) throw new Error('SESSION_ALREADY_ACTIVE');
      const settings = this.Settings.read();
      if (settings.revision !== expectedSettingsRevision)
        throw new Error('SETTINGS_REVISION_CONFLICT');
      await this.validateStart();
      if (this.Settings.read().revision !== settings.revision)
        throw new Error('SETTINGS_REVISION_CONFLICT');
      const starting = this.Sessions.create(settings, this.getNow(), transitionId);
      try {
        await this.prepareAndPromote(starting, false, null, false);
        const started = this.Sessions.get(starting.sessionId);
        if (started === null) throw new Error('SESSION_START_STATE_MISSING');
        if (started.status === 'ENDED') {
          this.Runtime = null;
          return started;
        }
        if (started?.status === 'STOPPING' && started.unwindRequested) return started;
        const running = this.Sessions.transition(
          starting.sessionId,
          ['STARTING'],
          'RUNNING',
          this.getNow(),
        );
        this.Runtime?.activate?.();
        return running;
      } catch (error) {
        const current = this.Sessions.get(starting.sessionId);
        // Admission already committed. A scheduling/readiness failure cannot
        // roll RUNNING back through STARTING or turn acceptance into rejection.
        if (current?.status === 'RUNNING' && this.ownsActiveRuntime()) {
          this.RecoveryBlocker =
            error instanceof Error ? error.message : 'SESSION_RUNTIME_ACTIVATION_FAILED';
          return current;
        }
        if (current?.status === 'STARTING')
          this.Sessions.transition(
            starting.sessionId,
            ['STARTING'],
            'BLOCKED',
            this.getNow(),
            error instanceof Error ? error.message : 'SESSION_START_FAILED',
          );
        throw error;
      }
    }).then(
      (session) => {
        record('ADMITTED', session.sessionId, null);
        return session;
      },
      (error: unknown) => {
        record('REJECTED', null, error instanceof Error ? error.message : 'SESSION_START_FAILED');
        throw error;
      },
    );
  }

  public end(reason = 'OPERATOR_END'): Promise<decibel_production_session_record_v1 | null> {
    return this.exclusive(async () => {
      const active = this.Sessions.getActive();
      if (active === null) return null;
      if (!this.ownsActiveRuntime())
        throw new Error(
          `SESSION_END_RECOVERY_BLOCKED:${this.RecoveryBlocker ?? 'SESSION_RUNTIME_OWNER_NOT_RECLAIMED'}`,
        );
      if (active.takeoverPaused) return active;
      const Runtime = this.Runtime;
      if (Runtime === null) throw new Error('SESSION_END_RUNTIME_NOT_AVAILABLE');
      if (
        !this.Sessions.markUnwindRequestedIfOwner(
          active.sessionId,
          this.Owner,
          reason,
          this.getNow(),
        )
      )
        return this.Sessions.getActive();
      const result = await Runtime.stop(reason);
      if (!result.safeToEnd) return this.Sessions.get(active.sessionId);
      return this.completeUnwind(active.sessionId, result.accounting ?? {}, reason);
    });
  }

  /**
   * Process shutdown (Ctrl+C) while a session runs: keep the session RUNNING, cancel resting
   * opening orders, keep the reduce-only TP and the venue catastrophe stop, and release the
   * runtime. The heartbeat stops, so the next process proves this owner absent and resumes the
   * session through the normal crash recovery. A session that is already stopping is not paused.
   */
  public pauseForShutdown(): Promise<Readonly<{ paused: boolean; settled: boolean }>> {
    return this.exclusive(async () => {
      const active = this.Sessions.getActive();
      const Runtime = this.Runtime;
      if (
        active === null ||
        Runtime === null ||
        !this.ownsActiveRuntime() ||
        active.status !== 'RUNNING' ||
        active.unwindRequested ||
        active.takeoverPaused ||
        !Runtime.pauseForShutdown
      )
        return Object.freeze({ paused: false, settled: false });
      const result = await Runtime.pauseForShutdown();
      this.Runtime = null;
      return Object.freeze({ paused: true, settled: result.settled });
    });
  }

  public ownsActiveRuntime(): boolean {
    const active = this.Sessions.getActive();
    return (
      this.Runtime !== null &&
      active !== null &&
      active.ownerState === 'OWNED' &&
      active.ownerPid === this.Owner.pid &&
      active.ownerInstanceId === this.Owner.instanceId
    );
  }

  public heartbeat(): void {
    const active = this.Sessions.getActive();
    if (
      this.Runtime !== null &&
      active !== null &&
      active.ownerState === 'OWNED' &&
      active.ownerPid === this.Owner.pid &&
      active.ownerInstanceId === this.Owner.instanceId
    )
      this.Sessions.heartbeat(active.sessionId, this.Owner, this.getNow());
  }

  public wakeRuntime(): void {
    if (this.ownsActiveRuntime()) this.Runtime?.wake?.();
  }

  public activateRuntime(): void {
    if (this.ownsActiveRuntime() && !this.isTakeoverPaused()) {
      this.Runtime?.activate?.();
      this.RecoveryBlocker = null;
    }
  }

  private assertPriorOwnerAbsent(active: decibel_production_session_record_v1): void {
    if (active.takeoverPaused && active.ownerPid !== null) {
      if (!this.proveOwnerProcessAbsent(active.ownerPid))
        throw new Error('SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT');
      return;
    }
    if (active.ownerPid === null && this.legacyOwnerPid !== null) {
      if (!this.proveOwnerProcessAbsent(this.legacyOwnerPid))
        throw new Error('SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT');
      return;
    }
    const now = this.getNow();
    if (
      active.lastHeartbeatAt > now ||
      now - active.lastHeartbeatAt <= DECIBEL_PRODUCTION_SESSION_HEARTBEAT_STALE_MS_V1
    )
      throw new Error('SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT');
    if (active.ownerPid === null) return;
    if (!this.proveOwnerProcessAbsent(active.ownerPid))
      throw new Error('SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT');
  }

  public requestUnwind(sessionId: string, reason: string): void {
    const active = this.Sessions.getActive();
    if (active?.sessionId !== sessionId) throw new Error('SESSION_UNWIND_OWNERSHIP_CONFLICT');
    if (active.takeoverPaused) throw new Error('SESSION_TAKEOVER_PAUSED');
    if (!this.ownsActiveRuntime()) throw new Error('SESSION_UNWIND_OWNERSHIP_CONFLICT');
    if (!this.Sessions.markUnwindRequestedIfOwner(sessionId, this.Owner, reason, this.getNow()))
      throw new Error('SESSION_UNWIND_OWNERSHIP_CONFLICT');
  }

  public completeUnwind(
    sessionId: string,
    accounting: Parameters<decibel_production_session_store_v1['finalizeAccounting']>[1],
    reason: string,
  ): decibel_production_session_record_v1 {
    const activeBefore = this.Sessions.getActive();
    if (
      activeBefore?.sessionId === sessionId &&
      (activeBefore.ownerPid !== this.Owner.pid ||
        activeBefore.ownerInstanceId !== this.Owner.instanceId ||
        activeBefore.ownerState !== 'OWNED' ||
        this.Runtime === null)
    )
      throw new Error('SESSION_COMPLETION_OWNERSHIP_CONFLICT');
    const completed = this.Sessions.completeUnwind(sessionId, accounting, this.getNow(), reason);
    if (activeBefore?.sessionId === sessionId) this.Runtime = null;
    return completed;
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.transition.then(operation, operation);
    this.transition = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async prepareAndPromote(
    active: decibel_production_session_record_v1,
    takeoverPaused: boolean,
    observedExitAt: number | null,
    activate = true,
    protectiveRecoveryBlocker: string | null = null,
  ): Promise<void> {
    const expected = Object.freeze({
      ownerPid: active.ownerPid,
      ownerInstanceId: active.ownerInstanceId,
      ownerState: active.ownerState,
      heartbeatAt: active.lastHeartbeatAt,
    });
    this.Sessions.acquireRecoveryLease(active.sessionId, expected, this.Owner, this.getNow());
    let Runtime: decibel_production_session_runtime_v1 | null = null;
    try {
      Runtime = await this.startRuntime(
        Object.freeze({
          ...active,
          ownerPid: this.Owner.pid,
          ownerInstanceId: this.Owner.instanceId,
        }),
        protectiveRecoveryBlocker,
      );
      if (protectiveRecoveryBlocker !== null && !Runtime.setHistoricalRecoveryBlocker)
        throw new Error('PROTECTIVE_RUNTIME_CONTRACT_REQUIRED');
      this.Runtime = Runtime;
      this.Sessions.promoteRecoveryLeaseToOwner(
        active.sessionId,
        expected,
        this.Owner,
        this.getNow(),
        takeoverPaused,
        observedExitAt,
      );
      this.ProtectiveRecoveryBlocker = protectiveRecoveryBlocker;
      if (activate && !takeoverPaused) {
        if (this.Sessions.get(active.sessionId)?.status === 'STARTING')
          this.Sessions.transition(active.sessionId, ['STARTING'], 'RUNNING', this.getNow());
        Runtime.activate?.();
      }
    } catch (error) {
      this.Runtime = null;
      await Runtime?.closePaused?.();
      this.Sessions.releaseRecoveryLease(active.sessionId, this.Owner);
      throw error;
    }
  }
}
