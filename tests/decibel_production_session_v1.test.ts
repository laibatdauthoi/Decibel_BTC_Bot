import { runDecibelAuthenticatedStartAdmissionV1 } from '../src/decibel_start_admission_v1.js';
import {
  decibel_production_live_state_source_v1,
  type DecibelProductionLiveAuthenticatedReaderV1,
} from '../src/decibel_production_live_state_source_v1.js';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

import { decibel_operator_settings_store_v1 } from '../src/decibel_operator_settings_v1.js';
import { decibel_production_session_controller_v1 } from '../src/decibel_production_session_controller_v1.js';
import { decibel_production_session_store_v1 } from '../src/decibel_production_session_v1.js';
import {
  formatDecibelProductionWebProcessLifecycleV1,
  convergeDecibelStartupRecoveryV1,
  ensureDecibelRecoveryAuthenticatedStateV1,
  isDecibelExecutionCompositeReadyV1,
  listenDecibelProductionWebBeforeExternalInitV1,
  recoverDecibelProductionSessionBeforeListenV1,
  resolveDecibelStartupRecoveryBlockerV1,
  runDecibelProductionWebBoundedDependencyV1,
  selectDecibelLastCompletedExecutionActionV1,
  startDecibelAuthenticatedBootstrapBeforeRecoveryV1,
} from '../src/run_decibel_production_web_v1.js';
import {
  decibel_runtime_supervisor_v1,
  ensureDecibelAuthenticatedStateReadyForStartV1,
} from '../src/decibel_runtime_supervisor_v1.js';
import {
  session_start_request_v1,
  getSessionStartButtonLabelV1,
} from '../web_dashboard/src/session_start_request_v1.js';
import {
  deriveDecibelSessionControlDiagnosticsV1,
  type decibel_session_start_attempt_v1,
} from '../src/decibel_session_control_diagnostics_v1.js';
import { handleDecibelProductionSessionRequestV1 } from '../src/run_decibel_production_web_v1.js';

const values = Object.freeze({
  capitalToUseUsd: 500,
  maxLossUsd: 50,
  targetMakerVolumeUsd: -1,
  orderNotionalUsd: 20,
  maxPositionUsd: 100,
});

describe('production web authenticated bootstrap ordering', () => {
  it('reconciles the journal between fresh Auth publication and orphaned-session recovery', async () => {
    const order: string[] = [];
    let journalClear = false;
    const result = await convergeDecibelStartupRecoveryV1({
      ensureAuthenticated: () => {
        order.push('AUTH_READY');
        return Promise.resolve();
      },
      readAuthenticatedSnapshot: () => {
        order.push('READ_AUTHENTICATED_SNAPSHOT');
        return Promise.resolve({ terminalState: 'CANCELLED', remainingQuantity: 0 });
      },
      reconcileJournal: (snapshot) => {
        order.push(`PERSIST_${snapshot.terminalState}`);
        journalClear = true;
        return Promise.resolve();
      },
      recoverSession: () => {
        order.push('RECOVER_SESSION');
        if (!journalClear) throw new Error('SESSION_ORPHANED_EXECUTION_RECONCILIATION_REQUIRED');
        return Promise.resolve(1);
      },
    });

    expect(result).toEqual({ result: 'RECOVERED', blocker: null });
    expect(order).toEqual([
      'AUTH_READY',
      'READ_AUTHENTICATED_SNAPSHOT',
      'PERSIST_CANCELLED',
      'AUTH_READY',
      'RECOVER_SESSION',
    ]);
  });

  it.each([
    ['fresh Auth timeout', 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT', 'ensureAuthenticated'],
    ['contradictory identity', 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT', 'reconcile'],
    ['journal transaction failure', 'SQLITE_BUSY', 'reconcile'],
  ] as const)('keeps startup fail-closed on %s', async (_label, blocker, failureStage) => {
    const recoverSession = vi.fn(() => Promise.resolve(1));
    const readAuthenticatedSnapshot = vi.fn(() => Promise.resolve({ terminal: 'CANCELLED' }));
    const result = await convergeDecibelStartupRecoveryV1({
      ensureAuthenticated: () =>
        failureStage === 'ensureAuthenticated'
          ? Promise.reject(new Error(blocker))
          : Promise.resolve(),
      readAuthenticatedSnapshot,
      reconcileJournal: () =>
        failureStage === 'reconcile' ? Promise.reject(new Error(blocker)) : Promise.resolve(),
      recoverSession,
    });

    expect(result).toEqual({ result: 'BLOCKED', blocker });
    expect(recoverSession).not.toHaveBeenCalled();
    if (failureStage === 'ensureAuthenticated')
      expect(readAuthenticatedSnapshot).not.toHaveBeenCalled();
  });

  it('starts from the authoritative composite without requiring session recovery work', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    Supervisor.setAuthenticatedSnapshot(10_000, 5_000, {
      actualInventoryBase: 0,
      openOrders: [],
    });
    Supervisor.setAuthenticatedInventory(0, 0.00002);
    const generation = Supervisor.setMarketDataSnapshot(
      { observedAt: 10_000, bestBid: 80_000, bestAsk: 80_001 },
      10_000,
      5_000,
    );
    Supervisor.setEconomicSnapshot({
      observedAt: 10_000,
      makerFeeBps: 1,
      makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
      estimatedGasCostUsd: 0.001,
      estimatedGasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
      aptUsd: 4,
      aptUsdSource: 'DECIBEL_REST_APT_USD_MARKET_PRICE',
      adverseSelectionBufferBps: 3,
      adverseSelectionSource: 'GLOBAL_FALLBACK',
      safetyMarginBps: 1,
      lifecycleCostBudgetBps: 11.25,
      lifecycleCostEntryBps: 11.035,
      candidateAdverseSelection: [],
    });
    Supervisor.setExecutionSnapshot({ complete: true }, generation);

    const state = Supervisor.getSnapshot(10_001);
    expect(state.inventory).toMatchObject({ state: 'FLAT', exactPositionBase: 0 });
    expect(state.runtimeState.domains).toMatchObject({
      AuthState: 'READY',
      MarketDataState: 'READY',
      EconomicEvidenceState: 'READY',
      SessionState: 'READY',
      ExecutionState: 'READY',
    });
    expect(state.blocker).toBeNull();
    expect(isDecibelExecutionCompositeReadyV1(Supervisor, 'RUNNING', 10_001)).toBe(true);
  });

  it('keeps failures out of LAST_ACTION and replaces them after a completed cycle', () => {
    const beforeFailure = 'STARTUP_RECOVERY_COMPLETE';
    expect(selectDecibelLastCompletedExecutionActionV1(beforeFailure, null)).toBe(beforeFailure);
    expect(selectDecibelLastCompletedExecutionActionV1(beforeFailure, 'HOLD')).toBe('HOLD');
    expect(selectDecibelLastCompletedExecutionActionV1('HOLD', 'DRY_RUN_PREPARED')).toBe(
      'DRY_RUN_PREPARED',
    );
  });

  it('preserves the exact authenticated stage in the projected recovery blocker', () => {
    expect(
      resolveDecibelStartupRecoveryBlockerV1(
        'PRODUCTION_AUTHENTICATED_READ_REQUIRED',
        'PRODUCTION_AUTHENTICATED_READ_STAGE:OPEN_ORDERS:HTTP_503',
      ),
    ).toBe('PRODUCTION_AUTHENTICATED_READ_STAGE:OPEN_ORDERS:HTTP_503');
    expect(
      resolveDecibelStartupRecoveryBlockerV1(
        'PRODUCTION_RECONCILIATION_REQUIRED',
        'PRODUCTION_AUTHENTICATED_READ_STAGE:OPEN_ORDERS:HTTP_503',
      ),
    ).toBe('PRODUCTION_RECONCILIATION_REQUIRED');
  });
  it('starts auth scheduling before recovery and automatically resumes after a bounded retry', async () => {
    const order: string[] = [];
    let authenticatedReady = false;
    let refreshAttempts = 0;
    let recoveryAttempts = 0;
    let retry: (() => void) | null = null;
    const attemptRecovery = () => {
      recoveryAttempts += 1;
      order.push(authenticatedReady ? 'recovery-ready' : 'recovery-waiting-auth');
    };
    const refresh = () => {
      refreshAttempts += 1;
      order.push(`auth-refresh-${refreshAttempts}`);
      if (refreshAttempts === 1) {
        retry = () => void refresh();
        return Promise.resolve();
      }
      authenticatedReady = true;
      attemptRecovery();
      return Promise.resolve();
    };

    startDecibelAuthenticatedBootstrapBeforeRecoveryV1(() => void refresh(), attemptRecovery);
    await Promise.resolve();
    expect(order).toEqual(['auth-refresh-1', 'recovery-waiting-auth']);
    expect(retry).not.toBeNull();
    retry?.();
    await Promise.resolve();

    expect(refreshAttempts).toBe(2);
    expect(recoveryAttempts).toBe(2);
    expect(order.at(-1)).toBe('recovery-ready');
  });

  it('refreshes through the shared auth singleflight when freshness expires during recovery', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    let now = 1_000;
    let refreshes = 0;
    Supervisor.setAuthenticatedSnapshot(now, 5_000);
    now = 6_001;

    await ensureDecibelRecoveryAuthenticatedStateV1(
      Supervisor,
      () =>
        Supervisor.runAuthenticatedRefresh(() => {
          refreshes += 1;
          Supervisor.setAuthenticatedSnapshot(now, 5_000);
          return Promise.resolve();
        }),
      () => now,
    );

    expect(refreshes).toBe(1);
    expect(Supervisor.isAuthenticatedStateReady(now)).toBe(true);
    expect(Supervisor.getAuthenticatedRefreshDeadline(2_000)).toBe(9_001);
  });
});

function createFixture(now = 1_000) {
  const root = mkdtempSync(join(tmpdir(), 'production-session-'));
  const sessionPath = join(root, 'sessions.sqlite');
  const Settings = new decibel_operator_settings_store_v1(join(root, 'settings.json'), values);
  const Sessions = new decibel_production_session_store_v1(sessionPath);
  let clock = now;
  const stop = vi.fn(() => Promise.resolve({ safeToEnd: true, blocker: null }));
  const start = vi.fn(() => Promise.resolve({ stop }));
  const Controller = new decibel_production_session_controller_v1(
    Sessions,
    Settings,
    start,
    () => clock,
  );
  return {
    sessionPath,
    Settings,
    Sessions,
    Controller,
    start,
    stop,
    setNow: (value: number) => (clock = value),
  };
}

describe('Decibel production session V1', () => {
  it('promotes a reconciled abandoned STARTING session before activating its recovered loop', async () => {
    const Fixture = createFixture();
    const starting = Fixture.Sessions.create(Fixture.Settings.read(), 1000);
    const activate = vi.fn(() => {
      expect(Fixture.Sessions.get(starting.sessionId)?.status).toBe('RUNNING');
    });
    const Controller = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      () => Promise.resolve({ stop: Fixture.stop, activate }),
      () => 100_000,
    );
    try {
      await expect(Controller.recoverStartup()).resolves.toBe(1);
      expect(activate).toHaveBeenCalledOnce();
      await expect(Controller.recoverStartup()).resolves.toBe(0);
      expect(activate).toHaveBeenCalledOnce();
      expect(Fixture.Sessions.list()).toHaveLength(1);
    } finally {
      Fixture.Sessions.close();
    }
  });

  it('reconciles a delayed failed HTTP response with authoritative ACTIVE state', async () => {
    const Fixture = createFixture();
    try {
      await Fixture.Controller.start(0);
      const Request = new session_start_request_v1(
        {
          sendStart: () =>
            Promise.resolve({ ok: false, body: { error: 'SESSION_TRANSITION_CONFLICT' } }),
          readSession: () => Promise.resolve(Fixture.Controller.getState()),
        },
        () => undefined,
      );
      await Request.start(0);
      expect(Request.getState()).toMatchObject({ phase: 'SESSION_ACTIVE', error: null });
    } finally {
      Fixture.Sessions.close();
    }
  });

  it('keeps committed admission authoritative when activation throws after RUNNING', async () => {
    const Fixture = createFixture();
    const activate = vi.fn(() => {
      throw new Error('PRODUCTION_AUTHENTICATED_READ_TRANSIENT');
    });
    const Controller = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      () => Promise.resolve({ stop: Fixture.stop, activate }),
      () => 1000,
    );
    try {
      const result = await Controller.requestStart(0);
      expect(result).toMatchObject({
        status: 'RUNNING',
        startDisposition: 'ACCEPTED_STARTING',
        readinessBlocker: 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
      });
      expect(result.transitionId).toBe(Controller.getState().lastStartAttempt?.transitionId);
      expect(Controller.getState().lastStartAttempt).toMatchObject({
        outcome: 'ADMITTED',
        blocker: null,
      });
      expect(Fixture.Sessions.get(result.sessionId)?.status).toBe('RUNNING');
      activate.mockImplementation(() => undefined);
      Controller.activateRuntime();
      expect(await Controller.requestStart(0)).toMatchObject({
        startDisposition: 'ALREADY_ACTIVE',
        readinessBlocker: null,
      });
      expect(Fixture.Sessions.list()).toHaveLength(1);
    } finally {
      Fixture.Sessions.close();
    }
  });

  it('shares a transition ID and runtime across concurrent HTTP START requests', async () => {
    const Fixture = createFixture();
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const activate = vi.fn();
    const prepare = vi.fn(async () => {
      await ready;
      return { stop: Fixture.stop, activate };
    });
    const Controller = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      prepare,
      () => 1000,
    );
    try {
      const first = Controller.requestStart(0);
      await Promise.resolve();
      const duplicate = Controller.requestStart(0);
      release();
      const [accepted, joined] = await Promise.all([first, duplicate]);
      expect(accepted.startDisposition).toBe('ACCEPTED_STARTING');
      expect(joined.startDisposition).toBe('ALREADY_STARTING');
      expect(joined.transitionId).toBe(accepted.transitionId);
      expect(joined.sessionId).toBe(accepted.sessionId);
      expect(prepare).toHaveBeenCalledOnce();
      expect(activate).toHaveBeenCalledOnce();
    } finally {
      Fixture.Sessions.close();
    }
  });

  it('rejects a settings revision changed while start admission is pending', async () => {
    const Fixture = createFixture();
    const Controller = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      Fixture.start,
      () => 1000,
      () => {
        Fixture.Settings.update({
          expectedRevision: 0,
          values: { ...values, capitalToUseUsd: 400 },
        });
        return Promise.resolve();
      },
    );
    await expect(Controller.start(0)).rejects.toThrow('SETTINGS_REVISION_CONFLICT');
    expect(Fixture.start).not.toHaveBeenCalled();
    expect(Fixture.Sessions.getActive()).toBeNull();
    Fixture.Sessions.close();
  });

  it('refreshes an ENDED account expired just before click, prevents double-clicks and confirms one activation', async () => {
    const fixture = createFixture(10000);
    await fixture.Controller.start(0);
    await fixture.Controller.end();
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    Supervisor.setAuthenticatedSnapshot(10000, 5000, { actualInventoryBase: 0, openOrders: [] });
    let now = 15001;
    let releaseRefresh!: () => void;
    const fresh = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let releaseRuntime!: (runtime: { stop: typeof fixture.stop; activate: () => void }) => void;
    const prepared = new Promise<{ stop: typeof fixture.stop; activate: () => void }>((resolve) => {
      releaseRuntime = resolve;
    });
    const activate = vi.fn();
    let reads = 0;
    const controller = new decibel_production_session_controller_v1(
      fixture.Sessions,
      fixture.Settings,
      () => prepared,
      () => now,
      () =>
        ensureDecibelAuthenticatedStateReadyForStartV1(
          Supervisor,
          async () => {
            reads++;
            await fresh;
            Supervisor.setAuthenticatedSnapshot(now, 5000, {
              actualInventoryBase: 0,
              openOrders: [],
            });
          },
          () => now,
        ),
    );
    let posts = 0;
    const Request = new session_start_request_v1(
      {
        sendStart: async (revision) => {
          posts++;
          const response = await handleDecibelProductionSessionRequestV1(
            'POST',
            '/api/session/start',
            { expectedSettingsRevision: revision },
            controller,
          );
          return { ok: response?.status === 200, body: response?.body };
        },
        readSession: () => Promise.resolve(controller.getState()),
      },
      () => undefined,
    );
    Request.observeSession(controller.getState());
    const first = Request.start(0);
    expect(Request.start(0)).toBe(first);
    expect(getSessionStartButtonLabelV1(Request.getState().phase)).toBe('CHECKING ACCOUNT…');
    await vi.waitFor(() => expect(reads).toBe(1));
    expect(controller.getState().activeSession).toBeNull();
    expect(activate).not.toHaveBeenCalled();
    now += 1;
    releaseRefresh();
    await vi.waitFor(() => expect(controller.getState().activeSession?.status).toBe('STARTING'));
    Request.observeSession(controller.getState());
    expect(getSessionStartButtonLabelV1(Request.getState().phase)).toBe('STARTING SESSION…');
    expect(activate).not.toHaveBeenCalled();
    releaseRuntime({ stop: fixture.stop, activate });
    await first;
    expect(controller.getState()).toMatchObject({ state: 'RUNNING', ownerState: 'OWNED' });
    expect(getSessionStartButtonLabelV1(Request.getState().phase)).toBe('SESSION ACTIVE');
    expect(posts).toBe(1);
    expect(activate).toHaveBeenCalledOnce();
    expect(Supervisor.isAuthenticatedStateReady(now)).toBe(true);
    expect(fixture.Sessions.list()).toHaveLength(2);
    fixture.Sessions.close();
  });

  it.each([
    'HTTP Error 500: Service temporarily unavailable',
    'AUTHENTICATED_HTTP_WORKER_REQUEST_TIMEOUT',
  ])(
    'shows admission failure and permits an explicit successful retry after %s',
    async (failure) => {
      const fixture = createFixture();
      const Supervisor = new decibel_runtime_supervisor_v1();
      Supervisor.setDependency('recovery', 'READY');
      const activate = vi.fn();
      let error: string | null = failure;
      const controller = new decibel_production_session_controller_v1(
        fixture.Sessions,
        fixture.Settings,
        () => Promise.resolve({ stop: fixture.stop, activate }),
        () => 10000,
        () =>
          ensureDecibelAuthenticatedStateReadyForStartV1(
            Supervisor,
            () => {
              if (error) return Promise.reject(new Error(error));
              Supervisor.setAuthenticatedSnapshot(10000, 5000, {
                actualInventoryBase: 0,
                openOrders: [],
              });
              return Promise.resolve();
            },
            () => 10000,
          ),
      );
      let posts = 0;
      const Request = new session_start_request_v1(
        {
          sendStart: async (revision) => {
            posts++;
            const response = await handleDecibelProductionSessionRequestV1(
              'POST',
              '/api/session/start',
              { expectedSettingsRevision: revision },
              controller,
            );
            return { ok: response?.status === 200, body: response?.body };
          },
          readSession: () => Promise.resolve(controller.getState()),
        },
        () => undefined,
      );
      await Request.start(0);
      expect(Request.getState().phase).toBe('FAILED');
      expect(Request.getState().error).toContain(failure);
      expect(getSessionStartButtonLabelV1(Request.getState().phase)).toBe('START SESSION');
      expect(fixture.Sessions.list()).toEqual([]);
      expect(activate).not.toHaveBeenCalled();
      Request.observeSession(controller.getState());
      expect(posts).toBe(1);
      error = null;
      await Request.start(0);
      expect(Request.getState()).toMatchObject({ phase: 'SESSION_ACTIVE', error: null });
      expect(posts).toBe(2);
      expect(activate).toHaveBeenCalledOnce();
      fixture.Sessions.close();
    },
  );

  it('keeps a genuine existing owner authoritative even if the frontend request gate is bypassed', async () => {
    const fixture = createFixture();
    const original = await fixture.Controller.start(0);
    const activate = vi.fn();
    const other = new decibel_production_session_controller_v1(
      fixture.Sessions,
      fixture.Settings,
      () => Promise.resolve({ stop: fixture.stop, activate }),
      () => 2000,
      () => undefined,
      () => undefined,
      { pid: 5678, instanceId: 'offline-other-owner' },
      () => false,
    );
    const Request = new session_start_request_v1(
      {
        sendStart: async (revision) => {
          const response = await handleDecibelProductionSessionRequestV1(
            'POST',
            '/api/session/start',
            { expectedSettingsRevision: revision },
            other,
          );
          return { ok: response?.status === 200, body: response?.body };
        },
        readSession: () => Promise.resolve(other.getState()),
      },
      () => undefined,
    );
    await Request.start(0);
    expect(Request.getState().phase).toBe('FAILED');
    expect(Request.getState().error).toContain('SESSION_ALREADY_ACTIVE');
    expect(other.getState().ownerState).toBe('UNCLAIMED_OR_STALE');
    expect(fixture.Sessions.getActive()?.sessionId).toBe(original.sessionId);
    expect(activate).not.toHaveBeenCalled();
    fixture.Sessions.close();
  });
  it('does not change successful admission if diagnostic storage fails', async () => {
    const fixture = createFixture();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const controller = new decibel_production_session_controller_v1(
      fixture.Sessions,
      fixture.Settings,
      fixture.start,
      () => 2000,
      () => undefined,
      () => undefined,
      { pid: 123, instanceId: 'offline-audit-failure' },
      () => true,
      null,
      () => {
        throw new Error('OFFLINE_AUDIT_STORAGE_UNAVAILABLE');
      },
    );
    try {
      await expect(controller.start(0)).resolves.toMatchObject({ status: 'RUNNING' });
      expect(controller.getState().lastStartAttempt?.outcome).toBe('ADMITTED');
      expect(error).toHaveBeenCalledWith('SESSION_START_AUDIT=FAILED');
      expect(fixture.start).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
      fixture.Sessions.close();
    }
  });
  it('does not create or schedule another session after ENDED across PID 29632/33120 recovery replay', async () => {
    const fixture = createFixture();
    await fixture.Controller.start(0);
    await fixture.Controller.end();
    const start = vi.fn();
    for (const pid of [29632, 33120]) {
      const controller = new decibel_production_session_controller_v1(
        fixture.Sessions,
        fixture.Settings,
        start,
        () => 2000,
        () => undefined,
        () => undefined,
        { pid, instanceId: `offline-replay-${pid}` },
      );
      expect(
        await recoverDecibelProductionSessionBeforeListenV1(() => controller.recoverStartup()),
      ).toEqual({ result: 'NOT_REQUIRED', blocker: null });
      const state = controller.getState();
      expect(state).toMatchObject({
        state: 'IDLE',
        ownerState: 'NONE',
        activeSession: null,
        lastStartAttempt: null,
      });
      expect(
        deriveDecibelSessionControlDiagnosticsV1({
          sessionState: state.state,
          latestSessionStatus: controller.getHistory()[0]!.status,
          lastStartAttempt: state.lastStartAttempt,
          executionLoopRunning: false,
          executionCycles: 0,
          executionBlocker: null,
        }),
      ).toMatchObject({ state: 'ENDED', loop: 'NOT_SCHEDULED', blocker: null });
    }
    expect(start).not.toHaveBeenCalled();
    expect(fixture.Sessions.list()).toHaveLength(1);
    fixture.Sessions.close();
  });

  it('audits rejected Start before creation, then admits one explicitly requested session after fresh venue admission', async () => {
    const fixture = createFixture();
    let fresh = false;
    const audit: decibel_session_start_attempt_v1[] = [];
    const sequence: string[] = [];
    const activate = vi.fn(() => {
      sequence.push('ACTIVATE_LOOP');
    });
    const start = vi.fn(() => {
      sequence.push('PREPARE_RUNTIME');
      return Promise.resolve({ stop: fixture.stop, activate });
    });
    const controller = new decibel_production_session_controller_v1(
      fixture.Sessions,
      fixture.Settings,
      start,
      () => 2000,
      () => {
        sequence.push('AUTHENTICATED_VENUE_ADMISSION');
        if (!fresh) throw new Error('PRODUCTION_AUTHENTICATED_STATE_STALE');
      },
      () => undefined,
      { pid: 12345, instanceId: 'offline-start-replay' },
      () => true,
      null,
      (attempt) => audit.push(attempt),
    );
    const rejected = await handleDecibelProductionSessionRequestV1(
      'POST',
      '/api/session/start',
      { expectedSettingsRevision: 0 },
      controller,
    );
    expect(rejected).toMatchObject({
      status: 400,
      body: { error: 'PRODUCTION_AUTHENTICATED_STATE_STALE' },
    });
    expect(audit.map((row) => row.outcome)).toEqual(['REQUESTED', 'REJECTED']);
    expect(controller.getState().lastStartAttempt).toMatchObject({
      outcome: 'REJECTED',
      blocker: 'PRODUCTION_AUTHENTICATED_STATE_STALE',
    });
    expect(fixture.Sessions.list()).toEqual([]);
    expect(start).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    fresh = true;
    sequence.length = 0;
    const admitted = await handleDecibelProductionSessionRequestV1(
      'POST',
      '/api/session/start',
      { expectedSettingsRevision: 0 },
      controller,
    );
    expect(admitted).toMatchObject({ status: 200, body: { status: 'RUNNING' } });
    expect(sequence).toEqual(['AUTHENTICATED_VENUE_ADMISSION', 'PREPARE_RUNTIME', 'ACTIVATE_LOOP']);
    expect(audit.map((row) => row.outcome)).toEqual([
      'REQUESTED',
      'REJECTED',
      'REQUESTED',
      'ADMITTED',
    ]);
    expect(activate).toHaveBeenCalledOnce();
    await handleDecibelProductionSessionRequestV1(
      'POST',
      '/api/session/start',
      { expectedSettingsRevision: 0 },
      controller,
    );
    expect(controller.getState().lastStartAttempt).toMatchObject({
      outcome: 'ADMITTED',
      blocker: null,
    });
    expect(activate).toHaveBeenCalledOnce();
    expect(fixture.Sessions.list()).toHaveLength(1);
    fixture.Sessions.close();
  });

  it('retains the precise runtime preparation failure without silently retrying a rejected start', async () => {
    const fixture = createFixture();
    fixture.start.mockRejectedValueOnce(new Error('PRODUCTION_EXECUTOR_MODULE_REQUIRED'));
    await expect(fixture.Controller.start(0)).rejects.toThrow(
      'PRODUCTION_EXECUTOR_MODULE_REQUIRED',
    );
    expect(fixture.Controller.getState().lastStartAttempt).toMatchObject({
      outcome: 'REJECTED',
      blocker: 'PRODUCTION_EXECUTOR_MODULE_REQUIRED',
    });
    const blocked = fixture.Sessions.list()[0]!;
    expect(blocked.status).toBe('BLOCKED');
    const restarted = new decibel_production_session_controller_v1(
      fixture.Sessions,
      fixture.Settings,
      fixture.start,
    );
    expect(await restarted.recoverStartup()).toBe(0);
    expect(
      deriveDecibelSessionControlDiagnosticsV1({
        sessionState: restarted.getState().state,
        latestSessionStatus: blocked.status,
        latestSessionBlocker: blocked.stopReason,
        lastStartAttempt: null,
        executionLoopRunning: false,
        executionCycles: 0,
        executionBlocker: null,
      }),
    ).toMatchObject({ state: 'START_BLOCKED', blocker: 'PRODUCTION_EXECUTOR_MODULE_REQUIRED' });
    expect(fixture.start).toHaveBeenCalledOnce();
    fixture.Sessions.close();
  });
  it('includes stable PID and instance identity in process lifecycle telemetry', () => {
    const first = formatDecibelProductionWebProcessLifecycleV1('EXIT', 101, '101-first', 0);
    const second = formatDecibelProductionWebProcessLifecycleV1('EXIT', 101, '101-second', 0);
    expect(first).toBe(
      'DECIBEL_PRODUCTION_WEB_PROCESS=EXIT PROCESS_ID=101 INSTANCE_ID=101-first EXIT_CODE=0',
    );
    expect(second).toBe(
      'DECIBEL_PRODUCTION_WEB_PROCESS=EXIT PROCESS_ID=101 INSTANCE_ID=101-second EXIT_CODE=0',
    );
    expect(first).not.toBe(second);
  });

  it('reaches HTTP READY before a forever-hung economic bootstrap', async () => {
    const Server = createServer((_request, response) => response.end('READY'));
    let externalInitializationStarted = false;
    await listenDecibelProductionWebBeforeExternalInitV1(Server, '127.0.0.1', 0, () => {
      externalInitializationStarted = true;
      void runDecibelProductionWebBoundedDependencyV1(
        () => new Promise<never>(() => undefined),
        10,
        'PRODUCTION_ECONOMIC_BOOTSTRAP_TIMEOUT',
      );
    });
    const address = Server.address();
    expect(address).not.toBeNull();
    expect(externalInitializationStarted).toBe(true);
    const response = await fetch(
      `http://127.0.0.1:${typeof address === 'object' ? address?.port : 0}`,
    );
    await expect(response.text()).resolves.toBe('READY');
    await new Promise<void>((resolveClose) => Server.close(() => resolveClose()));
  });

  it('bounds a forever-hung economic bootstrap with an explicit blocker', async () => {
    await expect(
      runDecibelProductionWebBoundedDependencyV1(
        () => new Promise<never>(() => undefined),
        10,
        'PRODUCTION_ECONOMIC_BOOTSTRAP_TIMEOUT',
      ),
    ).resolves.toEqual({ value: null, blocker: 'PRODUCTION_ECONOMIC_BOOTSTRAP_TIMEOUT' });
  });

  it('keeps pre-listen startup alive with an explicit recovery blocker', async () => {
    await expect(
      recoverDecibelProductionSessionBeforeListenV1(() =>
        Promise.reject(new Error('PRODUCTION_RECONCILIATION_PENDING_ACKNOWLEDGED_ORDER')),
      ),
    ).resolves.toEqual({
      result: 'BLOCKED',
      blocker: 'PRODUCTION_RECONCILIATION_PENDING_ACKNOWLEDGED_ORDER',
    });
  });

  it('starts IDLE and never creates a session on startup or browser-style reads', async () => {
    const Fixture = createFixture();
    await expect(Fixture.Controller.recoverStartup()).resolves.toBe(0);
    expect(Fixture.Controller.getState()).toMatchObject({ state: 'IDLE', activeSession: null });
    expect(Fixture.Controller.getHistory()).toEqual([]);
    expect(Fixture.start).not.toHaveBeenCalled();
    Fixture.Sessions.close();
  });

  it('allows only the persisted owner to heartbeat, request unwind, or complete a session', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const NonOwner = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      Fixture.start,
      () => 2_000,
      () => undefined,
      () => undefined,
      { pid: process.pid + 1, instanceId: 'non-owner' },
      () => false,
    );

    NonOwner.heartbeat();
    expect(Fixture.Sessions.get(running.sessionId)?.lastHeartbeatAt).toBe(1_000);
    NonOwner.setRecoveryBlocker('PRODUCTION_AUTHENTICATED_READ_TRANSIENT');
    expect(NonOwner.getState()).toMatchObject({
      state: 'RECOVERY_BLOCKED',
      persistedState: 'RUNNING',
      ownerState: 'UNCLAIMED_OR_STALE',
      recoveryBlocker: 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    });
    await expect(NonOwner.end()).rejects.toThrow(
      'SESSION_END_RECOVERY_BLOCKED:PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    );
    expect(() => NonOwner.requestUnwind(running.sessionId, 'INVALID')).toThrow(
      'SESSION_UNWIND_OWNERSHIP_CONFLICT',
    );
    expect(() => NonOwner.completeUnwind(running.sessionId, {}, 'INVALID')).toThrow(
      'SESSION_COMPLETION_OWNERSHIP_CONFLICT',
    );
    expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
      status: 'RUNNING',
      unwindRequested: false,
    });
    Fixture.Sessions.close();
  });

  it('does not recover a protective runtime while the prior owner is still present', async () => {
    const Fixture = createFixture();
    const active = await Fixture.Controller.start(0);
    const startRecovered = vi.fn(() =>
      Promise.resolve({
        stop: () => Promise.resolve({ safeToEnd: false, blocker: 'NO_MUTATION' }),
      }),
    );
    const Controller = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      startRecovered,
      () => 40000,
      () => undefined,
      () => undefined,
      { pid: process.pid, instanceId: 'independent-protection' },
      () => false,
    );
    try {
      await expect(
        Controller.recoverProtectiveStartup('HISTORICAL_FINALITY_UNAVAILABLE'),
      ).rejects.toThrow('SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT');
      expect(startRecovered).not.toHaveBeenCalled();
      expect(Fixture.Sessions.get(active.sessionId)?.ownerInstanceId).not.toBe(
        'independent-protection',
      );
    } finally {
      Fixture.Sessions.close();
    }
  });

  it('refuses a recovered runtime that cannot enforce protective-only admission', async () => {
    const Fixture = createFixture();
    await Fixture.Controller.start(0);
    const activate = vi.fn();
    const Controller = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      () =>
        Promise.resolve({
          activate,
          stop: () => Promise.resolve({ safeToEnd: false, blocker: 'NO_MUTATION' }),
        }),
      () => 40000,
      () => undefined,
      () => undefined,
      { pid: process.pid, instanceId: 'independent-protection' },
      () => true,
    );
    try {
      await expect(
        Controller.recoverProtectiveStartup('HISTORICAL_FINALITY_UNAVAILABLE'),
      ).rejects.toThrow('PROTECTIVE_RUNTIME_CONTRACT_REQUIRED');
      expect(activate).not.toHaveBeenCalled();
      expect(Controller.ownsActiveRuntime()).toBe(false);
    } finally {
      Fixture.Sessions.close();
    }
  });

  it('reclaims a dead-owner RUNNING session only after execution safety is checked', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const events: string[] = [];
    const activate = vi.fn(() => events.push('activate'));
    const wake = vi.fn(() => events.push('wake'));
    const startRecovered = vi.fn(() => {
      events.push('start-runtime');
      expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
        ownerPid: null,
        ownerInstanceId: null,
        ownerState: 'UNCLAIMED',
        recoveryPid: process.pid,
        recoveryInstanceId: 'recovered-one',
      });
      return Promise.resolve({
        activate,
        wake,
        stop: () => Promise.resolve({ safeToEnd: true, blocker: null }),
      });
    });
    const RecoveredController = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      startRecovered,
      () => 40_000,
      () => undefined,
      () => events.push('reconcile'),
      { pid: process.pid, instanceId: 'recovered-one' },
      () => {
        events.push('prove-absent');
        return true;
      },
    );
    await expect(RecoveredController.recoverStartup()).resolves.toBe(1);
    expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
      status: 'RUNNING',
      ownerPid: process.pid,
      ownerInstanceId: 'recovered-one',
      takeoverPaused: false,
    });
    expect(events).toEqual(['reconcile', 'prove-absent', 'start-runtime', 'activate']);
    expect(RecoveredController.getState()).toMatchObject({
      state: 'RUNNING',
      persistedState: 'RUNNING',
      ownerState: 'OWNED',
      recoveryBlocker: null,
    });
    RecoveredController.wakeRuntime();
    expect(wake).toHaveBeenCalledOnce();
    expect(RecoveredController.ownsActiveRuntime()).toBe(true);
    Fixture.Sessions.close();
  });

  it('does not persist a replacement owner or permit activity before recovery completes', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const activate = vi.fn();
    const stop = vi.fn(() => Promise.resolve({ safeToEnd: true, blocker: null }));
    const Recovering = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      () => {
        const duringRecovery = Fixture.Sessions.get(running.sessionId)!;
        expect(duringRecovery).toMatchObject({
          ownerPid: null,
          ownerInstanceId: null,
          ownerState: 'UNCLAIMED',
          recoveryPid: process.pid,
          recoveryInstanceId: 'partial-recovery',
        });
        return Promise.reject(new Error('INJECTED_RECOVERY_FAILURE'));
      },
      () => 40_000,
      () => undefined,
      () => undefined,
      { pid: process.pid, instanceId: 'partial-recovery' },
      () => true,
    );

    await expect(Recovering.recoverStartup()).rejects.toThrow('INJECTED_RECOVERY_FAILURE');
    expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
      ownerPid: null,
      ownerInstanceId: null,
      ownerState: 'UNCLAIMED',
      recoveryPid: null,
      recoveryInstanceId: null,
    });
    Recovering.heartbeat();
    await expect(Recovering.end()).rejects.toThrow('SESSION_END_RECOVERY_BLOCKED');
    expect(activate).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    Fixture.Sessions.close();
  });

  it('self-repairs a legacy partial owner row before the final atomic promotion', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const Connection = new Database(Fixture.sessionPath);
    Connection.prepare(
      `UPDATE production_sessions_v1
       SET owner_pid=?,owner_instance_id=?,owner_state='UNCLAIMED'
       WHERE session_id=?`,
    ).run(process.pid, 'partial-owner', running.sessionId);
    Connection.close();
    const activate = vi.fn();
    const Recovered = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      () =>
        Promise.resolve({
          activate,
          stop: () => Promise.resolve({ safeToEnd: true, blocker: null }),
        }),
      () => 40_000,
      () => undefined,
      () => undefined,
      { pid: process.pid, instanceId: 'partial-owner' },
      () => true,
    );

    await expect(Recovered.recoverStartup()).resolves.toBe(1);
    expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
      ownerPid: process.pid,
      ownerInstanceId: 'partial-owner',
      ownerState: 'OWNED',
      recoveryPid: null,
      recoveryInstanceId: null,
    });
    expect(activate).toHaveBeenCalledOnce();
    expect(Recovered.ownsActiveRuntime()).toBe(true);
    Fixture.Sessions.close();
  });

  it('recovers an expired recovery lease without treating it as a durable owner', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const Connection = new Database(Fixture.sessionPath);
    Connection.prepare(
      `UPDATE production_sessions_v1
       SET owner_pid=NULL,owner_instance_id=NULL,owner_state='UNCLAIMED',
           recovery_pid=999,recovery_instance_id='dead-recovery',recovery_lease_expires_at=1500
       WHERE session_id=?`,
    ).run(running.sessionId);
    Connection.close();
    const Recovered = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      () => Promise.resolve({ stop: () => Promise.resolve({ safeToEnd: true, blocker: null }) }),
      () => 40_000,
      () => undefined,
      () => undefined,
      { pid: process.pid, instanceId: 'after-dead-recovery' },
      () => true,
    );

    await expect(Recovered.recoverStartup()).resolves.toBe(1);
    expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
      ownerPid: process.pid,
      ownerInstanceId: 'after-dead-recovery',
      ownerState: 'OWNED',
      recoveryPid: null,
      recoveryInstanceId: null,
    });
    Fixture.Sessions.close();
  });

  it('preserves an orphaned RUNNING session when unresolved execution needs reconciliation', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const RecoveredController = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      Fixture.start,
      () => 40_000,
      () => undefined,
      () => {
        throw new Error('SESSION_ORPHANED_EXECUTION_RECONCILIATION_REQUIRED');
      },
      { pid: process.pid, instanceId: 'recovered-two' },
      () => true,
    );
    await expect(RecoveredController.recoverStartup()).rejects.toThrow(
      'SESSION_ORPHANED_EXECUTION_RECONCILIATION_REQUIRED',
    );
    expect(Fixture.Sessions.get(running.sessionId)?.status).toBe('RUNNING');
    Fixture.Sessions.close();
  });

  it('does not interrupt a session whose runtime heartbeat is still fresh', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const RecoveredController = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      Fixture.start,
      () => 2_000,
    );
    await expect(RecoveredController.recoverStartup()).rejects.toThrow(
      'SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT',
    );
    expect(Fixture.Sessions.get(running.sessionId)?.status).toBe('RUNNING');
    Fixture.Sessions.close();
  });

  it('never lets a recovery-blocked non-owner refresh the session heartbeat', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const originalHeartbeat = Fixture.Sessions.get(running.sessionId)!.lastHeartbeatAt;
    const NewController = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      Fixture.start,
      () => 2_000,
      () => undefined,
      () => undefined,
      { pid: process.pid, instanceId: 'non-owner' },
    );
    await expect(NewController.recoverStartup()).rejects.toThrow(
      'SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT',
    );
    NewController.heartbeat();
    expect(
      Fixture.Sessions.heartbeat(
        running.sessionId,
        {
          pid: process.pid,
          instanceId: 'non-owner',
        },
        2_000,
      ),
    ).toBe(false);
    expect(() =>
      Fixture.Sessions.claimOwner(
        running.sessionId,
        {
          pid: process.pid,
          instanceId: 'non-owner',
        },
        2_000,
      ),
    ).toThrow('SESSION_DIRECT_OWNER_CLAIM_FORBIDDEN');
    expect(Fixture.Sessions.get(running.sessionId)?.lastHeartbeatAt).toBe(originalHeartbeat);
    expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
      ownerPid: process.pid,
      ownerInstanceId: running.ownerInstanceId,
    });
    Fixture.Sessions.close();
  });

  it('keeps non-owner shutdown local and preserves owner-initiated unwind', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const NonOwner = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      Fixture.start,
      () => 2_000,
      () => undefined,
      () => undefined,
      { pid: process.pid, instanceId: 'shutdown-non-owner' },
    );
    expect(NonOwner.ownsActiveRuntime()).toBe(false);
    await expect(NonOwner.end('PROCESS_SHUTDOWN')).rejects.toThrow(
      'SESSION_END_RECOVERY_BLOCKED:SESSION_RUNTIME_OWNER_NOT_RECLAIMED',
    );
    expect(Fixture.stop).not.toHaveBeenCalled();
    expect(Fixture.Sessions.get(running.sessionId)?.unwindRequested).toBe(false);

    expect(Fixture.Controller.ownsActiveRuntime()).toBe(true);
    await expect(Fixture.Controller.end('PROCESS_SHUTDOWN')).resolves.toMatchObject({
      status: 'ENDED',
    });
    expect(Fixture.stop).toHaveBeenCalledOnce();
    Fixture.Sessions.close();
  });

  it('does not unwind an ownerless session even if a local runtime object remains', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const DatabaseConnection = new Database(Fixture.sessionPath);
    DatabaseConnection.prepare(
      'UPDATE production_sessions_v1 SET owner_pid=NULL,owner_instance_id=NULL WHERE session_id=?',
    ).run(running.sessionId);
    DatabaseConnection.close();
    expect(Fixture.Controller.ownsActiveRuntime()).toBe(false);
    await expect(Fixture.Controller.end('PROCESS_SHUTDOWN')).rejects.toThrow(
      'SESSION_END_RECOVERY_BLOCKED:SESSION_RUNTIME_OWNER_NOT_RECLAIMED',
    );
    expect(Fixture.stop).not.toHaveBeenCalled();
    expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
      status: 'RUNNING',
      unwindRequested: false,
    });
    Fixture.Sessions.close();
  });

  it('does not reclaim a stale lease while the recorded owner process still exists', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const NewController = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      Fixture.start,
      () => 40_000,
      () => undefined,
      () => undefined,
      { pid: process.pid, instanceId: 'still-owned' },
      () => false,
    );
    await expect(NewController.recoverStartup()).rejects.toThrow(
      'SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT',
    );
    expect(Fixture.Sessions.get(running.sessionId)?.status).toBe('RUNNING');
    Fixture.Sessions.close();
  });

  it('takes over a legacy ownerless non-flat RUNNING row only after the armed PID exits', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const DatabaseConnection = new Database(Fixture.sessionPath);
    DatabaseConnection.prepare(
      'UPDATE production_sessions_v1 SET owner_pid=NULL,owner_instance_id=NULL WHERE session_id=?',
    ).run(running.sessionId);
    DatabaseConnection.close();
    let now = 2_000;
    let oldProcessExists = true;
    const validate = vi.fn(() => undefined);
    const NewController = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      Fixture.start,
      () => now,
      () => undefined,
      validate,
      { pid: process.pid, instanceId: 'legacy-recovery' },
      () => !oldProcessExists,
      27_624,
    );
    await expect(NewController.recoverStartup()).rejects.toThrow(
      'SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT',
    );
    expect(NewController.getState().takeover).toMatchObject({
      state: 'WAITING_FOR_LEGACY_PID',
      waitingForLegacyPid: 27_624,
    });
    NewController.heartbeat();
    expect(Fixture.Sessions.get(running.sessionId)?.lastHeartbeatAt).toBe(1_000);
    now = 40_000;
    await expect(NewController.recoverStartup()).rejects.toThrow(
      'SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT',
    );
    expect(validate).not.toHaveBeenCalled();
    oldProcessExists = false;
    await expect(NewController.recoverStartup()).resolves.toBe(1);
    expect(validate).toHaveBeenCalledOnce();
    expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
      status: 'RUNNING',
      ownerPid: process.pid,
      ownerInstanceId: 'legacy-recovery',
    });
    await expect(NewController.recoverStartup()).resolves.toBe(0);
    Fixture.Sessions.close();
  });

  it('rejects a legacy takeover if the ownerless heartbeat changes during fresh checks', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const DatabaseConnection = new Database(Fixture.sessionPath);
    DatabaseConnection.prepare(
      'UPDATE production_sessions_v1 SET owner_pid=NULL,owner_instance_id=NULL WHERE session_id=?',
    ).run(running.sessionId);
    DatabaseConnection.close();
    const NewController = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      Fixture.start,
      () => 2_000,
      () => undefined,
      () => {
        const Connection = new Database(Fixture.sessionPath);
        Connection.prepare(
          'UPDATE production_sessions_v1 SET last_heartbeat_at=? WHERE session_id=?',
        ).run(1_500, running.sessionId);
        Connection.close();
      },
      { pid: process.pid, instanceId: 'legacy-race' },
      () => true,
      27_624,
    );
    await expect(NewController.recoverStartup()).rejects.toThrow(
      'SESSION_RUNTIME_OWNER_RELEASE_CONFLICT',
    );
    expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
      status: 'RUNNING',
      ownerPid: null,
    });
    Fixture.Sessions.close();
  });

  it('activates a takeover runtime only after the persisted owner claim', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const Connection = new Database(Fixture.sessionPath);
    Connection.prepare(
      'UPDATE production_sessions_v1 SET owner_pid=NULL,owner_instance_id=NULL WHERE session_id=?',
    ).run(running.sessionId);
    Connection.close();
    const activate = vi.fn(() => {
      expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
        ownerPid: process.pid,
        ownerInstanceId: 'claimed-owner',
      });
    });
    const start = vi.fn(() =>
      Promise.resolve({
        activate,
        stop: () => Promise.resolve({ safeToEnd: true, blocker: null }),
      }),
    );
    const NewController = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      start,
      () => 2_000,
      () => undefined,
      () => undefined,
      { pid: process.pid, instanceId: 'claimed-owner' },
      () => true,
      27_624,
    );
    await expect(NewController.recoverStartup()).resolves.toBe(1);
    expect(activate).not.toHaveBeenCalled();
    expect(NewController.getState().takeover.state).toBe('PAUSED');
    await expect(NewController.recoverStartup()).resolves.toBe(0);
    expect(activate).not.toHaveBeenCalled();
    await expect(NewController.resumeTakeover()).resolves.toMatchObject({ takeoverPaused: false });
    expect(activate).toHaveBeenCalledOnce();
    Fixture.Sessions.close();
  });

  it('restarts a claimed takeover in PAUSED state without activating execution', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    const Connection = new Database(Fixture.sessionPath);
    Connection.prepare(
      'UPDATE production_sessions_v1 SET owner_pid=NULL,owner_instance_id=NULL WHERE session_id=?',
    ).run(running.sessionId);
    Connection.close();
    const firstActivate = vi.fn();
    const First = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      () => Promise.resolve({ activate: firstActivate, stop: Fixture.stop }),
      () => 2_000,
      () => undefined,
      () => undefined,
      { pid: 101, instanceId: 'first-takeover' },
      () => true,
      27_624,
    );
    await First.recoverStartup();
    expect(firstActivate).not.toHaveBeenCalled();
    expect(Fixture.Sessions.get(running.sessionId)?.takeoverPaused).toBe(true);
    Fixture.Sessions.close();
    const Reopened = new decibel_production_session_store_v1(Fixture.sessionPath);
    const nextActivate = vi.fn();
    const Restarted = new decibel_production_session_controller_v1(
      Reopened,
      Fixture.Settings,
      () => Promise.resolve({ activate: nextActivate, stop: Fixture.stop }),
      () => 3_000,
      () => undefined,
      () => undefined,
      { pid: 102, instanceId: 'restart-takeover' },
      () => true,
    );
    await expect(Restarted.recoverStartup()).resolves.toBe(1);
    expect(nextActivate).not.toHaveBeenCalled();
    expect(Restarted.getState()).toMatchObject({
      state: 'RUNNING',
      activeSession: { ownerPid: 102, takeoverPaused: true },
      takeover: { state: 'PAUSED' },
    });
    await Restarted.end('PROCESS_SHUTDOWN');
    expect(Fixture.stop).not.toHaveBeenCalled();
    Reopened.close();
  });

  it('starts exactly one session and freezes its immutable config snapshot', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    expect(running).toMatchObject({ status: 'RUNNING', configRevision: 0, configSnapshot: values });
    expect(Fixture.start).toHaveBeenCalledOnce();
    await expect(Fixture.Controller.start(0)).resolves.toEqual(running);
    expect(Fixture.Controller.getHistory()).toHaveLength(1);
    expect(Fixture.Controller.getHistory()[0]?.configSnapshot).toEqual({
      ...values,
    });
    Fixture.Sessions.close();
  });

  it('serializes concurrent starts so double click cannot create two sessions', async () => {
    const Fixture = createFixture();
    const results = await Promise.allSettled([
      Fixture.Controller.start(0),
      Fixture.Controller.start(0),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(0);
    expect(Fixture.start).toHaveBeenCalledOnce();
    expect(Fixture.Controller.getHistory()).toHaveLength(1);
    Fixture.Sessions.close();
  });

  it('ends cleanly and persists history across store restart', async () => {
    const Fixture = createFixture();
    await Fixture.Controller.start(0);
    Fixture.setNow(2_000);
    const ended = await Fixture.Controller.end('OPERATOR_END');
    expect(Fixture.stop).toHaveBeenCalledWith('OPERATOR_END');
    expect(ended).toMatchObject({ status: 'ENDED', endedAt: 2_000, stopReason: 'OPERATOR_END' });
    expect(Fixture.Controller.getState().state).toBe('IDLE');
    expect(Fixture.Controller.getHistory()).toHaveLength(1);
    Fixture.Sessions.close();
    const Reopened = new decibel_production_session_store_v1(Fixture.sessionPath);
    expect(Reopened.list()).toHaveLength(1);
    expect(Reopened.list()[0]).toMatchObject({ status: 'ENDED', stopReason: 'OPERATOR_END' });
    Reopened.close();
  });

  it('keeps STOPPING while execution reconciliation is unresolved', async () => {
    const Fixture = createFixture();
    Fixture.start.mockResolvedValueOnce({
      stop: () =>
        Promise.resolve({
          safeToEnd: false,
          blocker: 'WAITING_FOR_EXECUTION_RECONCILIATION',
        }),
    });
    await Fixture.Controller.start(0);
    expect(await Fixture.Controller.end()).toMatchObject({ status: 'STOPPING' });
    expect(Fixture.Controller.getState().state).toBe('STOPPING');
    Fixture.Sessions.close();
  });

  it('restores a persisted session unwind runtime after process restart', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    Fixture.Sessions.markUnwindRequested(running.sessionId, 'TARGET_VOLUME_REACHED', 1_100);
    Fixture.Sessions.close();

    const Reopened = new decibel_production_session_store_v1(Fixture.sessionPath);
    const start = vi.fn(() =>
      Promise.resolve({ stop: () => Promise.resolve({ safeToEnd: false, blocker: null }) }),
    );
    const RecoveredController = new decibel_production_session_controller_v1(
      Reopened,
      Fixture.Settings,
      start,
      () => 40_000,
      () => undefined,
      () => undefined,
      { pid: process.pid, instanceId: 'unwind-recovered' },
      () => true,
    );

    await expect(RecoveredController.recoverStartup()).resolves.toBe(1);
    expect(start).toHaveBeenCalledOnce();
    expect(start.mock.calls[0]?.[0]).toMatchObject({
      sessionId: running.sessionId,
      status: 'STOPPING',
      unwindRequested: true,
      unwindReason: 'TARGET_VOLUME_REACHED',
    });
    expect(RecoveredController.getState()).toMatchObject({
      state: 'STOPPING',
      activeSession: { sessionId: running.sessionId, unwindRequested: true },
    });
    Reopened.close();
  });

  it('completes restart recovery exactly once after an old resting order reconciles to flat', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    Fixture.Sessions.markUnwindRequested(running.sessionId, 'TARGET_VOLUME_REACHED', 1_100);
    Fixture.Sessions.close();

    const venueState = {
      oldRestingOrder: true,
      authenticatedPositionBase: 0.001,
      mutationInvocations: 0,
    };
    const Reopened = new decibel_production_session_store_v1(Fixture.sessionPath);
    const RecoveredController = new decibel_production_session_controller_v1(
      Reopened,
      Fixture.Settings,
      () =>
        Promise.resolve({
          stop: () => Promise.resolve({ safeToEnd: false, blocker: 'NOT_FLAT' }),
        }),
      () => 40_000,
      () => undefined,
      () => undefined,
      { pid: process.pid, instanceId: 'unwind-complete' },
      () => true,
    );
    await RecoveredController.recoverStartup();
    expect(RecoveredController.getState().state).toBe('STOPPING');

    venueState.oldRestingOrder = false;
    venueState.authenticatedPositionBase = 0;
    expect(venueState.oldRestingOrder).toBe(false);
    expect(venueState.authenticatedPositionBase).toBe(0);
    const completed = RecoveredController.completeUnwind(
      running.sessionId,
      { finalBotState: 'ENDED', finalPositionBase: 0, unresolvedExecutionCount: 0 },
      'SESSION_UNWIND_COMPLETE',
    );

    expect(completed).toMatchObject({
      status: 'ENDED',
      finalPositionBase: 0,
      unwindRequested: false,
      unwindReason: null,
    });
    expect(RecoveredController.getState()).toMatchObject({ state: 'IDLE', activeSession: null });
    const next = await RecoveredController.start(0);
    expect(next.status).toBe('RUNNING');
    expect(
      RecoveredController.completeUnwind(running.sessionId, {}, 'SESSION_UNWIND_COMPLETE'),
    ).toEqual(completed);
    expect(RecoveredController.getState().activeSession?.sessionId).toBe(next.sessionId);
    expect(venueState.mutationInvocations).toBe(0);
    Reopened.close();
  });

  it('checks unresolved lifecycle state before creating a new session', async () => {
    const Fixture = createFixture();
    const Controller = new decibel_production_session_controller_v1(
      Fixture.Sessions,
      Fixture.Settings,
      Fixture.start,
      () => 1_000,
      () => {
        throw new Error('PRODUCTION_RECONCILIATION_REQUIRED');
      },
    );

    await expect(Controller.start(0)).rejects.toThrow('PRODUCTION_RECONCILIATION_REQUIRED');
    expect(Fixture.Sessions.list()).toEqual([]);
    expect(Fixture.start).not.toHaveBeenCalled();
    Fixture.Sessions.close();
  });

  it('migrates only legacy ended-flat unwind markers with no unresolved execution', async () => {
    const Fixture = createFixture();
    const running = await Fixture.Controller.start(0);
    Fixture.Sessions.markUnwindRequested(running.sessionId, 'TARGET_VOLUME_REACHED', 1_100);
    Fixture.Sessions.finalizeAccounting(running.sessionId, {
      finalPositionBase: 0,
      unresolvedExecutionCount: 0,
    });
    Fixture.Sessions.transition(running.sessionId, ['STOPPING'], 'ENDED', 1_200);

    expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
      status: 'ENDED',
      unwindRequested: true,
    });
    expect(Fixture.Sessions.migrateLegacyCompletedUnwindMarkers()).toBe(1);
    expect(Fixture.Sessions.get(running.sessionId)).toMatchObject({
      status: 'ENDED',
      unwindRequested: false,
      unwindReason: null,
    });
    expect(Fixture.Sessions.migrateLegacyCompletedUnwindMarkers()).toBe(0);
    Fixture.Sessions.close();
  });

  it('marks stale running sessions INTERRUPTED and never auto-resumes them', async () => {
    const Fixture = createFixture();
    await Fixture.Controller.start(0);
    Fixture.Sessions.close();
    const Reopened = new decibel_production_session_store_v1(Fixture.sessionPath);
    expect(Reopened.recoverInterrupted(32_001, 30_000)).toBe(1);
    expect(Reopened.getActive()).toBeNull();
    expect(Reopened.list()[0]).toMatchObject({
      status: 'INTERRUPTED',
      endedAt: 32_001,
      stopReason: 'PROCESS_INTERRUPTED',
    });
    Reopened.close();
  });
});

describe('Start authenticated refresh ownership', () => {
  it('joins a slow successful refresh after the five second TTL expires', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    let now = 10000;
    Supervisor.setAuthenticatedSnapshot(now, 5000, { actualInventoryBase: 0, openOrders: [] });
    now = 15001;
    let complete!: () => void;
    const read = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const refresh = () =>
      Supervisor.runAuthenticatedRefresh(async () => {
        await read();
        Supervisor.setAuthenticatedSnapshot(now, 5000, { actualInventoryBase: 0, openOrders: [] });
      });
    const background = refresh();
    const start = ensureDecibelAuthenticatedStateReadyForStartV1(Supervisor, refresh, () => now);
    await Promise.resolve();
    now += 4000;
    complete();
    await Promise.all([background, start]);
    expect(read).toHaveBeenCalledOnce();
    expect(Supervisor.isAuthenticatedStateReady(now)).toBe(true);
  });
});

describe('authenticated initialization rejection recovery replay', () => {
  it('distinguishes never initialized, expired and unpublished refreshed evidence', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    expect(() => Supervisor.assertSessionStartReady(10000)).toThrow(
      'PRODUCTION_AUTHENTICATED_STATE_INITIALIZATION_REQUIRED',
    );
    Supervisor.setAuthenticatedSnapshot(10000, 5000, { position: 0 });
    await expect(
      ensureDecibelAuthenticatedStateReadyForStartV1(
        Supervisor,
        () => Promise.resolve(),
        () => 15001,
      ),
    ).rejects.toThrow('PRODUCTION_AUTHENTICATED_STATE_STALE');
    expect(Supervisor.getAuthenticatedEvidenceDiagnostics(15001)).toMatchObject({
      observedAt: 10000,
      maximumAgeMs: 5000,
      ageMs: 5001,
      snapshotPublished: true,
      ready: false,
    });
  });

  it.each(['HTTP_500', 'TIMEOUT', 'PARTIAL_READ'] as const)(
    'keeps %s fail-closed, publishes complete recovery and requires another explicit Start',
    async (failure) => {
      vi.useFakeTimers();
      const fixture = createFixture(10000);
      const Supervisor = new decibel_runtime_supervisor_v1();
      Supervisor.setDependency('recovery', 'READY');
      let now = 10000;
      Supervisor.setAuthenticatedSnapshot(now, 5000, { observedAt: now });
      now = 15001;
      let failing = true;
      const Reader = {
        readMarketMetadata: () =>
          Promise.resolve({
            symbol: 'BTC/USD',
            exchangeSymbol: 'BTC/USD',
            marketAddress: 'test-btc-market',
            sizeDecimals: 8,
            priceDecimals: 2,
            tickSize: 0.1,
            minimumSize: 0.00002,
            lotSize: 0.00001,
            maximumLeverage: 40,
            maximumOpenInterest: 100,
            mode: 'Open',
          }),
        readAccountOverview: () =>
          Promise.resolve({
            perp_equity_balance: 25,
            total_margin: 0,
            cross_available_to_trade: 25,
            unrealized_pnl: 0,
          }),
        readPositions: () => Promise.resolve([]),
        readOpenOrders: () =>
          failing
            ? failure === 'TIMEOUT'
              ? new Promise<never>(() => undefined)
              : Promise.reject(
                  new Error(
                    failure === 'HTTP_500'
                      ? 'HTTP Error 500: unavailable'
                      : 'INVALID_OPEN_ORDERS_RESPONSE',
                  ),
                )
            : Promise.resolve([]),
      } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
      const Source = new decibel_production_live_state_source_v1(
        Reader,
        {
          DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount',
          DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS: '2000',
        },
        () => now,
      );
      const activate = vi.fn();
      const refresh = () =>
        Supervisor.runAuthenticatedRefresh(async (signal) => {
          const account = await Source.readAuthenticatedAccountState(signal);
          Supervisor.setAuthenticatedSnapshot(account.observedAt, 5000, account);
        }, 3000);
      const Controller = new decibel_production_session_controller_v1(
        fixture.Sessions,
        fixture.Settings,
        () => Promise.resolve({ stop: fixture.stop, activate }),
        () => now,
        () => ensureDecibelAuthenticatedStateReadyForStartV1(Supervisor, refresh, () => now),
      );
      try {
        const rejected = expect(Controller.start(0)).rejects.toThrow(
          'PRODUCTION_AUTHENTICATED_READ_REQUIRED',
        );
        await vi.advanceTimersByTimeAsync(1001);
        await rejected;
        expect(fixture.Sessions.list()).toHaveLength(0);
        expect(activate).not.toHaveBeenCalled();
        expect(Supervisor.getAuthenticatedEvidenceDiagnostics(now).observedAt).toBe(10000);
        expect(Source.readAuthenticatedEvidenceDiagnostics()).toMatchObject({
          stages: {
            ACCOUNT_OVERVIEW: { startedAt: 15001, outcome: 'SUCCEEDED' },
            POSITIONS: { outcome: 'SUCCEEDED' },
            OPEN_ORDERS: {
              startedAt: 15001,
              completedAt: 15001,
              outcome: failure === 'PARTIAL_READ' ? 'FAILED' : failure,
            },
          },
        });
        failing = false;
        now = 20000;
        await refresh();
        expect(Supervisor.isAuthenticatedStateReady(now)).toBe(true);
        expect(fixture.Sessions.list()).toHaveLength(0);
        expect(Controller.getState().lastStartAttempt?.outcome).toBe('REJECTED');
        await expect(Controller.start(0)).resolves.toMatchObject({ status: 'RUNNING' });
        expect(activate).toHaveBeenCalledOnce();
        expect(Controller.getState().lastStartAttempt?.outcome).toBe('ADMITTED');
      } finally {
        Supervisor.stopScheduler();
        await Source.close();
        fixture.Sessions.close();
        vi.useRealTimers();
      }
    },
  );
});

describe('bounded coherent Start admission', () => {
  it('replays PID 24500 publication aging, then admits the original request with new evidence', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    let now = 1793298606909;
    Supervisor.setAuthenticatedSnapshot(1793298601878, 5000, { generation: 0 });
    const events = ['ENDED', 'PRODUCTION_AUTHENTICATED_STATE_STALE', 'REQUESTED', 'STARTING'];
    const legacyRefresh = async () => {
      await Promise.resolve();
      now = 1793298613656;
      Supervisor.setAuthenticatedSnapshot(now, 5000, { generation: 1 });
      now = 1793298618814; // Successful read aged 5158ms during local publication.
    };
    await expect(
      ensureDecibelAuthenticatedStateReadyForStartV1(Supervisor, legacyRefresh, () => now),
    ).rejects.toThrow('PRODUCTION_AUTHENTICATED_STATE_STALE');
    events.push('REJECTED');
    Supervisor.setAuthenticatedSnapshot(now, 5000, { generation: 2 });
    events.push('WAITING_FOR_USER_START', 'NONE');
    expect(events).toEqual([
      'ENDED',
      'PRODUCTION_AUTHENTICATED_STATE_STALE',
      'REQUESTED',
      'STARTING',
      'REJECTED',
      'WAITING_FOR_USER_START',
      'NONE',
    ]);

    // The original request now owns its read/validate workflow until a terminal result.
    const fixture = createFixture(1793298606909);
    now = 1793298606909;
    const FreshSupervisor = new decibel_runtime_supervisor_v1();
    FreshSupervisor.setDependency('recovery', 'READY');
    FreshSupervisor.setAuthenticatedSnapshot(1793298601878, 5000, { generation: 0 });
    let reads = 0;
    const validated: number[] = [];
    const activate = vi.fn();
    const Controller = new decibel_production_session_controller_v1(
      fixture.Sessions,
      fixture.Settings,
      () => Promise.resolve({ stop: fixture.stop, activate }),
      () => now,
      () =>
        runDecibelAuthenticatedStartAdmissionV1({
          Supervisor: FreshSupervisor,
          timeoutMs: 10000,
          getNow: () => now,
          refresh: () =>
            FreshSupervisor.runAuthenticatedRefresh(async () => {
              await Promise.resolve();
              reads++;
              // Fast batch publication keeps original observation clocks unchanged.
              now += 700;
              const evidence = { generation: reads, observedAt: now };
              FreshSupervisor.setAuthenticatedSnapshot(now, 5000, evidence);
              now += 118;
              return evidence;
            }),
          validate: async (evidence) => {
            await Promise.resolve();
            validated.push(evidence.generation);
          },
        }),
    );
    try {
      await expect(Controller.start(0)).resolves.toMatchObject({ status: 'RUNNING' });
      expect(reads).toBe(1);
      expect(validated).toEqual([1]);
      expect(activate).toHaveBeenCalledOnce();
      expect(Controller.getState().lastStartAttempt?.outcome).toBe('ADMITTED');
    } finally {
      fixture.Sessions.close();
    }
  });

  it.each(['BEFORE_TTL', 'STALE', 'JOIN_REFRESH'] as const)(
    'awaits publication and validates the joined coherent result for %s',
    async (scenario) => {
      const Supervisor = new decibel_runtime_supervisor_v1();
      Supervisor.setDependency('recovery', 'READY');
      let now = scenario === 'BEFORE_TTL' ? 14999 : 15001;
      Supervisor.setAuthenticatedSnapshot(10000, 5000, { generation: 0 });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const read = vi.fn(async () => {
        await gate;
        now += 100;
        const evidence = { generation: 1, observedAt: now };
        Supervisor.setAuthenticatedSnapshot(now, 5000, evidence);
        return evidence;
      });
      const refresh = () => Supervisor.runAuthenticatedRefresh(read);
      const background = scenario === 'JOIN_REFRESH' ? refresh() : null;
      const validate = vi.fn(async (evidence: { generation: number }) => {
        await Promise.resolve();
        expect(evidence.generation).toBe(1);
        expect(Supervisor.isAuthenticatedStateReady(now)).toBe(true);
      });
      const pending = runDecibelAuthenticatedStartAdmissionV1({
        Supervisor,
        refresh,
        validate,
        timeoutMs: 10000,
        getNow: () => now,
      });
      await Promise.resolve();
      expect(validate).not.toHaveBeenCalled();
      release();
      await pending;
      await background;
      expect(read).toHaveBeenCalledOnce();
      expect(validate).toHaveBeenCalledOnce();
    },
  );

  it('repeats the full dependency validation with new evidence if local validation crosses TTL', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    let now = 15001;
    let generation = 0;
    const validate = vi.fn(async (evidence: { generation: number }) => {
      await Promise.resolve();
      if (evidence.generation === 1) {
        now += 5001;
        // A newer background publication must not make the old validation fresh.
        Supervisor.setAuthenticatedSnapshot(now, 5000, { generation: 99 });
      }
    });
    await runDecibelAuthenticatedStartAdmissionV1({
      Supervisor,
      timeoutMs: 10000,
      getNow: () => now,
      refresh: async () => {
        await Promise.resolve();
        const evidence = { generation: ++generation };
        Supervisor.setAuthenticatedSnapshot(now, 5000, evidence);
        return evidence;
      },
      validate,
    });
    expect(validate.mock.calls.map(([evidence]) => evidence.generation)).toEqual([1, 2]);
  });

  it.each([
    'HTTP Error 500: ACCOUNT_OVERVIEW',
    'PRODUCTION_AUTHENTICATED_READ_STAGE:OPEN_ORDERS:TIMEOUT',
  ])(
    'does not retry or admit after terminal source failure %s; permits a later explicit request',
    async (failure) => {
      const Supervisor = new decibel_runtime_supervisor_v1();
      Supervisor.setDependency('recovery', 'READY');
      const fixture = createFixture();
      let failing = true;
      const refresh = vi.fn(async () => {
        await Promise.resolve();
        if (failing) throw new Error(failure);
        Supervisor.setAuthenticatedSnapshot(10000, 5000, { generation: 1 });
        return { generation: 1 };
      });
      const activate = vi.fn();
      const Controller = new decibel_production_session_controller_v1(
        fixture.Sessions,
        fixture.Settings,
        () => Promise.resolve({ stop: fixture.stop, activate }),
        () => 10000,
        () =>
          runDecibelAuthenticatedStartAdmissionV1({
            Supervisor,
            refresh,
            validate: () => Promise.resolve(),
            timeoutMs: 10000,
            getNow: () => 10000,
          }),
      );
      try {
        await expect(Controller.start(0)).rejects.toThrow(failure);
        expect(refresh).toHaveBeenCalledOnce();
        failing = false;
        await refresh();
        expect(fixture.Sessions.getActive()).toBeNull();
        expect(activate).not.toHaveBeenCalled();
        await expect(Controller.start(0)).resolves.toMatchObject({ status: 'RUNNING' });
        expect(activate).toHaveBeenCalledOnce();
      } finally {
        fixture.Sessions.close();
      }
    },
  );

  it('never validates or creates a session after the request deadline, even if the shared read later publishes', async () => {
    vi.useFakeTimers();
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const validate = vi.fn(() => Promise.resolve());
    try {
      const result = runDecibelAuthenticatedStartAdmissionV1({
        Supervisor,
        timeoutMs: 1000,
        refresh: () =>
          Supervisor.runAuthenticatedRefresh(async () => {
            await gate;
            Supervisor.setAuthenticatedSnapshot(Date.now(), 5000, { generation: 1 });
            return { generation: 1 };
          }),
        validate,
      });
      const rejected = expect(result).rejects.toThrow('SESSION_START_ADMISSION_TIMEOUT');
      await vi.advanceTimersByTimeAsync(1001);
      await rejected;
      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(Supervisor.isAuthenticatedStateReady()).toBe(true);
      expect(validate).not.toHaveBeenCalled();
    } finally {
      Supervisor.stopScheduler();
      vi.useRealTimers();
    }
  });

  it('rechecks lost ownership after an in-flight read instead of admitting cached readiness', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    const fixture = createFixture();
    const activate = vi.fn();
    const Controller = new decibel_production_session_controller_v1(
      fixture.Sessions,
      fixture.Settings,
      () => Promise.resolve({ stop: fixture.stop, activate }),
      () => 10000,
      () =>
        runDecibelAuthenticatedStartAdmissionV1({
          Supervisor,
          timeoutMs: 10000,
          getNow: () => 10000,
          refresh: async () => {
            await Promise.resolve();
            Supervisor.setAuthenticatedSnapshot(10000, 5000, { generation: 1 });
            Supervisor.setReconciliationRequired(true, 'SESSION_RUNTIME_OWNER_NOT_EXCLUSIVE');
            return { generation: 1 };
          },
          validate: () => Promise.resolve(),
        }),
    );
    try {
      await expect(Controller.start(0)).rejects.toThrow('SESSION_RUNTIME_OWNER_NOT_EXCLUSIVE');
      expect(fixture.Sessions.getActive()).toBeNull();
      expect(activate).not.toHaveBeenCalled();
    } finally {
      fixture.Sessions.close();
    }
  });
});

it('keeps duplicate clicks and an unknown HTTP outcome on one bounded Start workflow', async () => {
  const fixture = createFixture(10000);
  const Supervisor = new decibel_runtime_supervisor_v1();
  Supervisor.setDependency('recovery', 'READY');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const refresh = vi.fn(() =>
    Supervisor.runAuthenticatedRefresh(async () => {
      await gate;
      Supervisor.setAuthenticatedSnapshot(10000, 5000, { generation: 1 });
      return { generation: 1 };
    }),
  );
  const activate = vi.fn();
  const Controller = new decibel_production_session_controller_v1(
    fixture.Sessions,
    fixture.Settings,
    () => Promise.resolve({ stop: fixture.stop, activate }),
    () => 10000,
    () =>
      runDecibelAuthenticatedStartAdmissionV1({
        Supervisor,
        refresh,
        timeoutMs: 10000,
        getNow: () => 10000,
        validate: () => Promise.resolve(),
      }),
  );
  const sendStart = vi.fn(async () => {
    await Controller.start(0);
    throw new Error('HTTP_RESPONSE_LOST');
  });
  const Request = new session_start_request_v1(
    { sendStart, readSession: () => Promise.reject(new Error('SESSION_READ_UNAVAILABLE')) },
    () => undefined,
  );
  try {
    const pending = Request.start(0);
    expect(Request.start(0)).toBe(pending);
    release();
    await pending;
    expect(Request.getState().phase).toBe('CONFIRMING');
    await Request.start(0);
    expect(sendStart).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(fixture.Sessions.list()).toHaveLength(1);
    expect(activate).toHaveBeenCalledOnce();
    Request.observeSession(Controller.getState());
    expect(Request.getState().phase).toBe('SESSION_ACTIVE');
    Request.observeSession({
      ...Controller.getState(),
      ownerState: 'UNCLAIMED_OR_STALE',
      recoveryBlocker: 'SESSION_RUNTIME_OWNER_NOT_EXCLUSIVE',
    });
    expect(Request.getState()).toMatchObject({
      phase: 'FAILED',
      error: 'SESSION_RUNTIME_OWNER_NOT_EXCLUSIVE',
    });
    expect(sendStart).toHaveBeenCalledOnce();
  } finally {
    fixture.Sessions.close();
  }
});

describe('Activity complete session history', () => {
  it('returns sessions older than the default 100-row store window without changing their records', async () => {
    const Fixture = createFixture();
    try {
      const ids: string[] = [];
      for (let index = 0; index < 125; index++) {
        const session = Fixture.Sessions.create(Fixture.Settings.read(), 1000 + index * 10);
        Fixture.Sessions.transition(
          session.sessionId,
          ['STARTING'],
          'BLOCKED',
          1001 + index * 10,
          'FIXTURE_ONLY',
        );
        ids.push(session.sessionId);
      }
      expect(Fixture.Sessions.list()).toHaveLength(100);
      const response = await handleDecibelProductionSessionRequestV1(
        'GET',
        '/api/session-history',
        null,
        Fixture.Controller,
      );
      expect(response?.status).toBe(200);
      const history = Fixture.Controller.getHistory();
      expect(response?.body).toEqual(history);
      expect(history).toHaveLength(125);
      expect(history[0]?.sessionId).toBe(ids[124]);
      expect(history[124]?.sessionId).toBe(ids[0]);
      expect(history[124]?.stopReason).toBe('FIXTURE_ONLY');
      expect(() => Fixture.Sessions.list(101)).toThrow('SESSION_HISTORY_LIMIT_INVALID');
    } finally {
      Fixture.Sessions.close();
    }
  });
});
