import {
  decibel_production_live_state_source_v1,
  type DecibelProductionLiveAuthenticatedReaderV1,
} from '../src/decibel_production_live_state_source_v1.js';
import { deriveDecibelPositionSafetyStatusV1 } from '../src/decibel_position_safety_status_v1.js';
import { mergeDecibelVenueReconciliationSnapshotV1 } from '../src/decibel_venue_reconciliation_snapshot_v1.js';
import {
  reconcileBeforeDecibelAuthenticatedPublicationV1,
  convergeDecibelStartupRecoveryV1,
} from '../src/run_decibel_production_web_v1.js';
import { decibel_production_session_controller_v1 } from '../src/decibel_production_session_controller_v1.js';
import { decibel_production_session_store_v1 } from '../src/decibel_production_session_v1.js';
import {
  decibel_operator_settings_store_v1,
  deriveDecibelSessionTradingLimitsV1,
  validateDecibelCapitalAllocationV1,
} from '../src/decibel_operator_settings_v1.js';
import { finalizeDecibelVerifiedSessionV1 } from '../src/run_decibel_production_web_v1.js';
import { formatSessionStartResponseV1 } from '../web_dashboard/src/presentation.js';
import { wrapDecibelProductionLiveStateSourceV1 } from '../src/decibel_production_live_state_source_adapter_v1.js';
import {
  projectDecibelNextSessionPositionLimitV1,
  estimateDecibelNextSessionPositionLimitV1,
} from '../src/run_decibel_production_web_v1.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import { createDecibelActualFillLedgerV1 } from '../src/decibel_actual_fill_truth_v1.js';
import { evaluateTradingDecision } from '../src/decibel_trading_decision_v1.js';
import { buildDecibelExecutionIntentV1 } from '../src/decibel_execution_intent_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import {
  assertDecibelWebTelemetrySanitizedV1,
  calculateDecibelBotScopedPnlV1,
  DECIBEL_TELEMETRY_ACTOR_DECISION_MAX_AGE_MS_V1,
  mapDecibelProductionWebTelemetryV1,
  projectDecibelTelemetryTradingDecisionV1,
  reconcileAllDecibelAcknowledgedOrdersV1,
  reconcileDecibelActiveIdentityConflictV1,
  reconcileDecibelAcknowledgedTerminalOrdersV1,
  readDecibelProductionWebHistoryV1,
  requireDecibelFillTransactionVersionV1,
} from '../src/decibel_production_web_telemetry_v1.js';
import {
  decibel_production_live_orchestrator_v1,
  parseDecibelProductionLiveConfigurationV1,
  type decibel_production_live_snapshot_v1,
} from '../src/decibel_production_live_orchestrator_v1.js';
import { DECIBEL_BTC_USD_MARKET_ADDRESS_V1 } from '../src/decibel_btc_market_v1.js';
import {
  decibel_runtime_supervisor_v1,
  ensureDecibelAuthenticatedStateReadyForStartV1,
  readDecibelSupervisorAuthenticatedSnapshotV1,
} from '../src/decibel_runtime_supervisor_v1.js';
import {
  deriveDashboardPresentationV1,
  deriveSessionStartGateV1,
  selectHighestPriorityOperatorAlertV1,
  buildOperatorAlertsV1,
} from '../web_dashboard/src/presentation.js';

const configuration = parseDecibelProductionLiveConfigurationV1({
  DECIBEL_EXECUTION_MODE: 'production',
  DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
  DECIBEL_EXECUTOR_ENABLED: 'false',
  DECIBEL_EXECUTOR_DRY_RUN: 'true',
});

const setEconomicReady = (Supervisor: decibel_runtime_supervisor_v1): void =>
  Supervisor.setEconomicSnapshot({
    observedAt: 1,
    makerFeeBps: 1.5,
    makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
    estimatedGasCostUsd: 0.002,
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

describe('Decibel runtime supervisor V1', () => {
  it('projects owned-session total/maker/taker progress against the total volume target', () => {
    {
      const Base = makeSnapshot();
      const history = readDecibelProductionWebHistoryV1(
        'missing-volume-journal.sqlite',
        10,
        10_100,
      );
      const telemetry = mapDecibelProductionWebTelemetryV1({
        overviewTotalSessionsExecuted: 125,
        snapshot: {
          ...Base,
          input: { ...Base.input, targetExternalMakerVolumeUsd: 50 },
          sessionConfiguration: {
            revision: 2,
            capitalToUseUsd: 8,
            maxLossUsd: 2,
            targetMakerVolumeUsd: 50,
            maxPositionUsd: 50,
            marginUsedUsd: 0,
            makerVolumeUsd: 25,
            takerVolumeUsd: 25,
            totalExecutedVolumeUsd: 50,
            pnlUsd: 0,
            riskBlocker: null,
          },
        },
        history: {
          ...history,
          accountingFills: [
            {
              fillId: 'maker',
              sessionId: Base.input.sessionId,
              side: 'BUY',
              quantity: 0.00025,
              price: 100_000,
              maker: true,
              observedAt: 10_000,
            },
            {
              fillId: 'taker',
              sessionId: Base.input.sessionId,
              side: 'SELL',
              quantity: 0.00025,
              price: 100_000,
              maker: false,
              observedAt: 10_001,
            },
            {
              fillId: 'other',
              sessionId: 'other-session',
              side: 'BUY',
              quantity: 1,
              price: 100_000,
              maker: true,
              observedAt: 10_001,
            },
          ],
        },
        configuration,
        startedAt: 1_000,
        generatedAt: 10_100,
        lastSuccessfulCycleAt: 10_000,
        connectionError: null,
      });
      expect(telemetry.overviewHistory).toEqual({
        totalSessionsExecuted: 125,
        utcDayStart: 0,
        volumeSinceUTCStartUsd: null,
        // No session store read model in this fixture: lifetime totals are unverified.
        lifetimeVolumeUsd: null,
        allTimeNetPnlUsd: null,
        allTimeIncompletePnlCount: null,
      });
      expect(telemetry.overviewEvidence).toEqual({
        sessionId: Base.input.sessionId,
        capitalUsd: 8,
        maxLossUsd: 2,
        sessionPnlUsd: 0,
        makerVolumeUsd: 25,
        takerVolumeUsd: 25,
        totalExecutedVolumeUsd: 50,
      });
      expect(telemetry.volume).toMatchObject({
        sessionMakerVolumeUsd: 25,
        sessionTakerVolumeUsd: 25,
        totalExecutedVolumeUsd: 50,
        remainingToTargetUsd: 0,
      });
    }
  });

  it('projects process, account, market, economic, and execution readiness independently', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    expect(Supervisor.getSnapshot(1).readiness).toMatchObject({
      processReady: true,
      accountReady: false,
      marketReady: false,
      economicReady: false,
      executionSafe: false,
      blockingComponent: 'ACCOUNT',
    });

    Supervisor.setAuthenticatedSnapshot(1, 5_000, { position: 0, openOrders: [] });
    expect(Supervisor.getSnapshot(1).readiness).toMatchObject({
      accountReady: true,
      marketReady: false,
      blockingComponent: 'MARKET',
    });
    Supervisor.setMarketDataSnapshot({ observedAt: 1, bestBid: 100, bestAsk: 101 }, 1, 5_000);
    expect(Supervisor.getSnapshot(1).readiness).toMatchObject({
      marketReady: true,
      economicReady: false,
      blockingComponent: 'ECONOMIC',
    });
  });

  it('cannot publish economic READY without one complete immutable snapshot', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('economic', 'READY');
    expect(Supervisor.getSnapshot().runtimeState.domains.EconomicEvidenceState).toBe('BLOCKED');
    expect(Supervisor.getSnapshot().runtimeState.domainBlockers.EconomicEvidenceState).toBe(
      'PRODUCTION_ECONOMIC_SNAPSHOT_REQUIRED',
    );

    setEconomicReady(Supervisor);
    const published = Supervisor.getEconomicSnapshot();
    expect(published).not.toBeNull();
    expect(Object.isFrozen(published)).toBe(true);
    expect(published).toMatchObject({
      makerFeeBps: 1.5,
      estimatedGasCostUsd: 0.002,
      aptUsd: 4,
      adverseSelectionBufferBps: 3,
      lifecycleCostBudgetBps: 11.25,
      lifecycleCostEntryBps: 11.035,
    });
    expect(Supervisor.getSnapshot().runtimeState.domains.EconomicEvidenceState).toBe('READY');
  });

  it('allows session ownership while economics warm but keeps execution readiness blocked', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('economic', 'BLOCKED');
    Supervisor.setDependency('recovery', 'READY');
    Supervisor.setDependency('authenticatedState', 'READY');
    expect(() => Supervisor.assertSessionStartReady()).not.toThrow();
    expect(() => Supervisor.assertReady()).toThrow('PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED');
    setEconomicReady(Supervisor);
    Supervisor.setMarketDataSnapshot({ observedAt: 1, bestBid: 1, bestAsk: 2 });
    Supervisor.setExecutionSnapshot({ complete: true });
    expect(() => Supervisor.assertReady()).not.toThrow();
  });

  it('does not let economic warming bypass ownership, auth, or reconciliation safety', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('economic', 'BLOCKED');
    Supervisor.setDependency('recovery', 'BLOCKED');
    Supervisor.setDependency('authenticatedState', 'READY');
    expect(() => Supervisor.assertSessionStartReady()).toThrow(
      'PRODUCTION_RECOVERY_INITIALIZATION_REQUIRED',
    );
    Supervisor.setDependency('recovery', 'READY');
    Supervisor.setDependency('authenticatedState', 'BLOCKED');
    expect(() => Supervisor.assertSessionStartReady()).toThrow(
      'PRODUCTION_AUTHENTICATED_STATE_INITIALIZATION_REQUIRED',
    );
    Supervisor.setDependency('authenticatedState', 'READY');
    Supervisor.setReconciliationRequired(true, 'RECONCILIATION_REQUIRED');
    expect(() => Supervisor.assertSessionStartReady()).toThrow('RECONCILIATION_REQUIRED');
  });

  it('uses one authenticated freshness result for telemetry and the session start gate', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('economic', 'BLOCKED');
    Supervisor.setDependency('recovery', 'READY');
    Supervisor.setAuthenticatedSnapshot(10_000, 5_000);

    expect(Supervisor.getSnapshot(14_999).dependencies.authenticatedState).toBe('READY');
    expect(() => Supervisor.assertSessionStartReady(14_999)).not.toThrow();
    expect(Supervisor.getSnapshot(15_001).dependencies.authenticatedState).toBe('BLOCKED');
    expect(() => Supervisor.assertSessionStartReady(15_001)).toThrow(
      'PRODUCTION_AUTHENTICATED_STATE_STALE',
    );

    Supervisor.setAuthenticatedSnapshot(15_001, 5_000);
    expect(Supervisor.getSnapshot(15_001).dependencies.authenticatedState).toBe('READY');
    expect(() => Supervisor.assertSessionStartReady(15_001)).not.toThrow();
  });

  it('singleflight-refreshes stale authenticated state on demand before session start', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('economic', 'BLOCKED');
    Supervisor.setDependency('recovery', 'READY');
    Supervisor.setAuthenticatedSnapshot(1_000, 5_000);
    let refreshes = 0;
    await ensureDecibelAuthenticatedStateReadyForStartV1(
      Supervisor,
      () => {
        refreshes += 1;
        Supervisor.setAuthenticatedSnapshot(7_000, 5_000);
        return Promise.resolve();
      },
      () => 7_000,
    );
    expect(refreshes).toBe(1);
    expect(Supervisor.getSnapshot(7_000).dependencies.authenticatedState).toBe('READY');
  });

  it('owns the pre-expiry authenticated refresh deadline and singleflights readers', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setAuthenticatedSnapshot(10_000, 5_000);
    expect(Supervisor.getAuthenticatedRefreshDeadline(2_000)).toBe(13_000);

    let resolveRefresh: ((value: string) => void) | null = null;
    const refresh = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const First = Supervisor.runAuthenticatedRefresh(refresh);
    const Second = Supervisor.runAuthenticatedRefresh(refresh);
    expect(First).toBe(Second);
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledOnce();
    expect(Supervisor.isAuthenticatedRefreshInFlight()).toBe(true);
    resolveRefresh?.('READY');
    await expect(First).resolves.toBe('READY');
    expect(Supervisor.isAuthenticatedRefreshInFlight()).toBe(false);
  });

  it('keeps session start fail-closed when on-demand authenticated refresh fails', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('economic', 'BLOCKED');
    Supervisor.setDependency('recovery', 'READY');
    Supervisor.setAuthenticatedSnapshot(1_000, 5_000);
    await expect(
      ensureDecibelAuthenticatedStateReadyForStartV1(
        Supervisor,
        () => Promise.reject(new Error('AUTH_READ_FAILED')),
        () => 7_000,
      ),
    ).rejects.toThrow('AUTH_READ_FAILED');
    expect(Supervisor.getSnapshot(7_000).dependencies.authenticatedState).toBe('BLOCKED');
  });

  it('serves execution from the authoritative supervisor snapshot without a direct read', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    const authoritative = Object.freeze({ observedAt: 10_000, positionBase: 0.25 });
    Supervisor.setAuthenticatedSnapshot(10_000, 5_000, authoritative);
    const refresh = vi.fn(() => Promise.resolve());

    await expect(
      readDecibelSupervisorAuthenticatedSnapshotV1<typeof authoritative>(
        Supervisor,
        refresh,
        () => 12_000,
      ),
    ).resolves.toBe(authoritative);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('waits for the shared singleflight refresh and auto-resumes execution after auth is ready', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setAuthenticatedSnapshot(1_000, 5_000, Object.freeze({ observedAt: 1_000 }));
    const authoritative = Object.freeze({ observedAt: 7_000, positionBase: -0.25 });
    let refreshInvocations = 0;
    const refresh = () =>
      Supervisor.runAuthenticatedRefresh(async () => {
        refreshInvocations += 1;
        await Promise.resolve();
        Supervisor.setAuthenticatedSnapshot(7_000, 5_000, authoritative);
      });

    const [first, second] = await Promise.all([
      readDecibelSupervisorAuthenticatedSnapshotV1<typeof authoritative>(
        Supervisor,
        refresh,
        () => 7_000,
      ),
      readDecibelSupervisorAuthenticatedSnapshotV1<typeof authoritative>(
        Supervisor,
        refresh,
        () => 7_000,
      ),
    ]);
    expect(first).toBe(authoritative);
    expect(second).toBe(authoritative);
    expect(refreshInvocations).toBe(1);
    expect(Supervisor.getSnapshot(7_000).dependencies.authenticatedState).toBe('READY');
  });

  it('keeps execution fail-closed in WAIT_AUTH when the shared refresh fails', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setAuthenticatedSnapshot(1_000, 5_000, Object.freeze({ observedAt: 1_000 }));
    await expect(
      readDecibelSupervisorAuthenticatedSnapshotV1(
        Supervisor,
        () => Promise.reject(new Error('ACCOUNT_OVERVIEW_UNAVAILABLE')),
        () => 7_000,
      ),
    ).rejects.toThrow('PRODUCTION_AUTHENTICATED_READ_TRANSIENT');
  });

  it('singleflights authoritative recovery so duplicate startup schedulers cannot race', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    let resolveRecovery: ((value: number) => void) | null = null;
    const recovery = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveRecovery = resolve;
        }),
    );
    const First = Supervisor.runRecovery(recovery);
    const Second = Supervisor.runRecovery(recovery);
    expect(First).toBe(Second);
    expect(Supervisor.isRecoveryInFlight()).toBe(true);
    expect(recovery).toHaveBeenCalledOnce();
    resolveRecovery?.(1);
    await expect(First).resolves.toBe(1);
    expect(Supervisor.isRecoveryInFlight()).toBe(false);
  });

  it('recovers through hours of injected transient failures without a permanent latch', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    setEconomicReady(Supervisor);
    Supervisor.setDependency('recovery', 'READY');
    Supervisor.setDependency('authenticatedState', 'READY');
    Supervisor.setMarketDataSnapshot({ observedAt: 1, bestBid: 1, bestAsk: 2 });
    Supervisor.setExecutionSnapshot(makeSnapshot());
    const cycleDurationMs = 2_000;
    const snapshots = [];
    for (let cycle = 0; cycle < 7_200; cycle += 1) {
      const now = cycle * cycleDurationMs + 1;
      if (cycle === 100) Supervisor.setReconciliationRequired(true, 'RECONCILIATION_REQUIRED');
      if (cycle === 105) Supervisor.setReconciliationRequired(false);
      if (cycle === 500) {
        Supervisor.setDependency('authenticatedState', 'BLOCKED');
        Supervisor.setFiniteCooldown(
          'PRODUCTION_LIVE_SOURCE_BOOK_STALE',
          now + 10_000,
          'FRESH_AUTHORITATIVE_BOOK',
        );
      }
      if (cycle === 506) Supervisor.setDependency('authenticatedState', 'READY');
      if (cycle === 1_000) Supervisor.setDependency('economic', 'BLOCKED');
      if (cycle === 1_010) setEconomicReady(Supervisor);
      if (cycle === 2_000) Supervisor.setReconciliationRequired(true, 'RECONCILIATION_REQUIRED');
      if (cycle === 2_004) Supervisor.setReconciliationRequired(false);
      if (cycle === 3_000)
        Supervisor.setFiniteCooldown(
          'EXECUTION_MUTATION_BUDGET_COOLDOWN',
          now + 60_000,
          'MUTATION_WINDOW_REPLENISHED',
        );
      const snapshot = Supervisor.getSnapshot(now);
      expect(snapshot.cooldownDeadline === null || Number.isFinite(snapshot.cooldownDeadline)).toBe(
        true,
      );
      if (!snapshot.ready) {
        expect(snapshot.blocker).not.toBeNull();
        expect(snapshot.recoveryCondition).not.toBeNull();
      }
      snapshots.push(snapshot);
    }
    expect(snapshots.at(-1)?.ready).toBe(true);
    expect(snapshots.at(-1)?.blocker).toBeNull();
  });

  it('rejects null-equivalent and infinite cooldown deadlines', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    expect(() => Supervisor.setFiniteCooldown('BLOCKED', Number.POSITIVE_INFINITY, 'TIME')).toThrow(
      'RUNTIME_SUPERVISOR_COOLDOWN_DEADLINE_INVALID',
    );
    expect(() => Supervisor.setFiniteCooldown('BLOCKED', 0, 'TIME')).toThrow(
      'RUNTIME_SUPERVISOR_COOLDOWN_DEADLINE_INVALID',
    );
  });
});

function makeSnapshot(): decibel_production_live_snapshot_v1 {
  return {
    sourceStateHash: 'source',
    minimumNotionalUsd: 10,
    maximumNotionalUsd: 100,
    availableMarginUsd: 100,
    maximumEffectiveLeverage: 2,
    economicInputs: {
      makerFeeBps: 0,
      makerFeeSource: 'CONFIG',
      estimatedGasCostUsd: 0,
      estimatedGasCostSource: 'CONFIG',
      adverseSelectionBufferBps: 0,
      adverseSelectionSource: 'CONFIG',
      safetyMarginBps: 0,
    },
    halfSpreadBps: 5,
    maximumAbsPositionBase: 0.01,
    accountMetrics: {
      collateralUsd: 50,
      totalMarginUsd: 0,
      unrealizedPnlUsd: 1.25,
      masterAptGas: null,
    },
    authenticatedPositions: [
      { market: 'BTC/USD', size: 0.0012, source: 'UNKNOWN' },
      { market: 'ETH/USD', size: -0.08, source: 'EXTERNAL' },
    ],
    input: {
      sessionId: 'session',
      strategyConfigId: 'DECIBEL_MARKET_MAKER_V1_PASSIVE_VOLUME_RECYCLING_V1',
      configuredSubaccount: 'subaccount',
      authenticatedSubaccount: 'subaccount',
      configuredNetwork: 'mainnet',
      observedNetwork: 'mainnet',
      now: 10_000,
      market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      metadata: {
        marketAddress: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        symbol: 'BTC/USD',
        tickSize: 0.1,
        lotSize: 0.00001,
        minimumSize: 0.00001,
        mode: 'Open',
        observedAt: 10_000,
      },
      book: { bestBid: 79_999.9, bestAsk: 80_000.1, observedAt: 10_000 },
      maxBboAgeMs: 5_000,
      actualInventoryBase: 0,
      inventoryDirectionProven: true,
      openOrders: [],
      activeTwapCount: 0,
      activeTpSlCount: 0,
      activeBulkOrderCount: 0,
      manualOrDelegatedActivityCount: 0,
      unresolvedExecutionPlanCount: 0,
      persistenceAvailable: true,
      targetExternalMakerVolumeUsd: 1_000,
      actualFillLedger: createDecibelActualFillLedgerV1([]),
    },
  };
}

describe('Decibel authoritative runtime state machine V1', () => {
  it('drives startup, auth recovery, economic warming, and activation deterministically', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    expect(Supervisor.getSnapshot(1).runtimeState.phase).toBe('BOOTSTRAP');

    Supervisor.setDependency('recovery', 'BLOCKED');
    expect(Supervisor.getSnapshot(2).runtimeState.phase).toBe('WAIT_AUTH');
    Supervisor.setAuthenticatedSnapshot(3, 5_000, { position: 0 });
    expect(Supervisor.getSnapshot(3).runtimeState.phase).toBe('RECOVERING');
    Supervisor.setDependency('recovery', 'READY');
    expect(Supervisor.getSnapshot(3).runtimeState.phase).toBe('WAIT_ECONOMIC');
    setEconomicReady(Supervisor);
    expect(Supervisor.getSnapshot(3).runtimeState.phase).toBe('DEGRADED');
    Supervisor.setMarketDataSnapshot({ bestBid: 1, bestAsk: 2, observedAt: 3 });
    expect(Supervisor.getSnapshot(3).runtimeState.domains.ExecutionState).toBe('BLOCKED');
    expect(Supervisor.getSnapshot(3).blocker).toBe(
      'PRODUCTION_EXECUTION_SNAPSHOT_MARKET_GENERATION_REQUIRED',
    );
    Supervisor.setExecutionSnapshot({ complete: true });
    expect(Supervisor.getSnapshot(3).runtimeState.phase).toBe('READY');
    expect(Supervisor.getSnapshot(3).runtimeState.domains.ExecutionState).toBe('READY');
    expect(Supervisor.getSnapshot(3).schedulerOwner).toBe('RuntimeSupervisor');
  });

  it('uses one keyed scheduler and never duplicates domain jobs', async () => {
    vi.useFakeTimers();
    try {
      const Supervisor = new decibel_runtime_supervisor_v1();
      const calls: string[] = [];
      Supervisor.scheduleRecurring('auth-refresh', 1_000, () => calls.push('old'));
      Supervisor.scheduleRecurring('auth-refresh', 1_000, () => calls.push('new'));
      Supervisor.scheduleRecurring('economic-collector', 500, () => calls.push('economic'));
      expect(Supervisor.getSnapshot().scheduledJobs).toEqual([
        'auth-refresh',
        'economic-collector',
      ]);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(calls).toEqual(['economic', 'new', 'economic']);
      Supervisor.stopScheduler();
      expect(Supervisor.getSnapshot().scheduledJobs).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the live BBO refresh supervised independently of adverse collection', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.scheduleRecurring('economic-adverse-collector', 90_000, () => undefined);
    Supervisor.scheduleRecurring('market-data-refresh', 1_000, () => undefined);

    Supervisor.cancelScheduled('economic-adverse-collector');
    expect(Supervisor.hasScheduled('economic-adverse-collector')).toBe(false);
    expect(Supervisor.hasScheduled('market-data-refresh')).toBe(true);
    Supervisor.stopScheduler();
  });

  it('keeps unrelated domains ready across auth timeout and WS degradation', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    setEconomicReady(Supervisor);
    Supervisor.setDependency('recovery', 'READY');
    Supervisor.setAuthenticatedSnapshot(1_000, 5_000, {});
    Supervisor.setMarketDataSnapshot({ bestBid: 1, bestAsk: 2, observedAt: 3_000 }, 3_000, 5_000);
    Supervisor.setAuthenticatedReadBlocked();
    expect(Supervisor.getSnapshot(7_000).runtimeState.domains).toMatchObject({
      AuthState: 'BLOCKED',
      MarketDataState: 'READY',
      EconomicEvidenceState: 'READY',
      SessionState: 'READY',
      ExecutionState: 'BLOCKED',
    });
    Supervisor.setAuthenticatedSnapshot(7_001, 5_000, {});
    Supervisor.setMarketDataBlocked('PRODUCTION_LIVE_SOURCE_BOOK_STALE');
    expect(Supervisor.getSnapshot(7_001).runtimeState.domains.AuthState).toBe('READY');
    expect(Supervisor.getSnapshot(7_001).runtimeState.domains.MarketDataState).toBe('BLOCKED');
    expect(Supervisor.getSnapshot(7_001).runtimeState.domains.ExecutionState).toBe('BLOCKED');
    expect(Supervisor.getSnapshot(7_001).runtimeState.domainBlockers.ExecutionState).toBe(
      'PRODUCTION_LIVE_SOURCE_BOOK_STALE',
    );
  });

  it('retains a last-good authenticated snapshot only until its freshness deadline', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    setEconomicReady(Supervisor);
    Supervisor.setAuthenticatedSnapshot(1_000, 5_000, { position: 0 });

    Supervisor.setAuthenticatedReadBlocked(5_999);
    expect(Supervisor.getSnapshot(5_999).runtimeState.domains.AuthState).toBe('READY');
    expect(Supervisor.getAuthenticatedSnapshot()).toEqual({ position: 0 });

    Supervisor.setAuthenticatedReadBlocked(6_001);
    expect(Supervisor.getSnapshot(6_001).runtimeState.domains.AuthState).toBe('BLOCKED');
    expect(Supervisor.getSnapshot(6_001).runtimeState.domains.ExecutionState).toBe('BLOCKED');
  });

  it('restores readiness atomically when a retry succeeds after snapshot expiry', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    setEconomicReady(Supervisor);
    Supervisor.setAuthenticatedSnapshot(1_000, 5_000, { generation: 1 });
    Supervisor.setAuthenticatedReadBlocked(6_001);
    expect(Supervisor.getSnapshot(6_001).dependencies.authenticatedState).toBe('BLOCKED');

    Supervisor.setAuthenticatedSnapshot(6_100, 5_000, { generation: 2 });
    expect(Supervisor.getSnapshot(6_100).dependencies.authenticatedState).toBe('READY');
    expect(Supervisor.getAuthenticatedSnapshot()).toEqual({ generation: 2 });
  });

  it('clears an auth-owned historical blocker and derives execution from current domains', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    setEconomicReady(Supervisor);
    Supervisor.setMarketDataSnapshot({ bestBid: 1, bestAsk: 2, observedAt: 1 });
    Supervisor.setFiniteCooldown(
      'PRODUCTION_AUTHENTICATED_READ_TRANSIENT_STALE_EXECUTION_PROJECTION',
      10_000,
      'AUTH_REFRESH',
    );
    Supervisor.setAuthenticatedSnapshot(1_000, 5_000, {});
    Supervisor.setExecutionSnapshot({ complete: true });

    const current = Supervisor.getSnapshot(1_001);
    expect(current.blocker).toBeNull();
    expect(current.runtimeState.domains.ExecutionState).toBe('READY');
    expect(current.runtimeState.domainBlockers.ExecutionState).toBeNull();
  });

  it('demotes market data and execution when the authoritative BBO exceeds its TTL', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    setEconomicReady(Supervisor);
    Supervisor.setAuthenticatedSnapshot(10_000, 5_000, { position: 0 });
    Supervisor.setMarketDataSnapshot(
      { bestBid: 80_000, bestAsk: 80_001, observedAt: 10_000 },
      10_000,
      5_000,
    );
    Supervisor.setExecutionSnapshot({ complete: true });

    expect(Supervisor.getSnapshot(15_000).runtimeState.domains.MarketDataState).toBe('READY');
    const stale = Supervisor.getSnapshot(15_001);
    expect(stale.runtimeState.domains.MarketDataState).toBe('BLOCKED');
    expect(stale.runtimeState.domainBlockers.MarketDataState).toBe(
      'PRODUCTION_LIVE_SOURCE_BOOK_STALE',
    );
    expect(stale.runtimeState.domains.ExecutionState).toBe('BLOCKED');
  });

  it('cannot project market READY without a current authoritative BBO snapshot', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDomainState('MarketDataState', 'READY');

    const state = Supervisor.getSnapshot(10_000);
    expect(state.runtimeState.domains.MarketDataState).toBe('BLOCKED');
    expect(state.runtimeState.domainBlockers.MarketDataState).toBe(
      'PRODUCTION_MARKET_DATA_SNAPSHOT_REQUIRED',
    );
    expect(state.runtimeState.domains.ExecutionState).toBe('BLOCKED');
  });

  it('rejects connected-but-stalled and disconnected market subscriptions', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    const common = { bestBid: 80_000, bestAsk: 80_001, observedAt: 10_000 };
    Supervisor.setMarketDataSnapshot(
      {
        ...common,
        wsConnectionState: 'CONNECTED',
        wsSubscriptionState: 'SUBSCRIBED',
        lastValidBboAgeMs: 5_001,
      },
      10_000,
      5_000,
    );
    expect(Supervisor.getSnapshot(10_000).runtimeState.domains.MarketDataState).toBe('BLOCKED');
    Supervisor.setMarketDataSnapshot(
      {
        ...common,
        wsConnectionState: 'DISCONNECTED',
        wsSubscriptionState: 'SUBSCRIBED',
        lastValidBboAgeMs: 1,
      },
      10_000,
      5_000,
    );
    expect(Supervisor.getSnapshot(10_000).runtimeState.domains.MarketDataState).toBe('BLOCKED');
  });

  it('promotes a healthy subscription only with a fresh authoritative BBO', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setMarketDataSnapshot(
      {
        bestBid: 80_000,
        bestAsk: 80_001,
        observedAt: 10_000,
        wsConnectionState: 'CONNECTED',
        wsSubscriptionState: 'SUBSCRIBED',
        lastValidBboAgeMs: 1,
      },
      10_000,
      5_000,
    );
    expect(Supervisor.getSnapshot(10_001).runtimeState.domains.MarketDataState).toBe('READY');
  });

  it('publishes one market generation to Supervisor and execution', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    setEconomicReady(Supervisor);
    Supervisor.setAuthenticatedSnapshot(10_000, 5_000, { position: 0 });
    const generation = Supervisor.setMarketDataSnapshot(
      { bestBid: 80_000, bestAsk: 80_001, observedAt: 10_000 },
      10_000,
      5_000,
    );
    Supervisor.setExecutionSnapshot({ complete: true }, generation);

    const projection = Supervisor.getSnapshot(10_001);
    expect(projection.marketData).toEqual({
      generation,
      bboTimestamp: 10_000,
      blockerSource: null,
    });
    expect(projection.executionSnapshot.generation).toBe(generation);
  });

  it('does not let an older stale result overwrite a newer READY generation', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    const oldGeneration = Supervisor.getMarketDataProjection().generation;
    const generation = Supervisor.setMarketDataSnapshot(
      { bestBid: 80_010, bestAsk: 80_011, observedAt: 20_000 },
      20_000,
      5_000,
    );
    Supervisor.setMarketDataBlocked(
      'PRODUCTION_LIVE_SOURCE_BOOK_STALE',
      { observedAt: 10_000 },
      oldGeneration,
    );

    const projection = Supervisor.getSnapshot(20_001);
    expect(projection.runtimeState.domains.MarketDataState).toBe('READY');
    expect(projection.marketData.generation).toBe(generation);
    expect(projection.marketData.blockerSource).toBeNull();
  });

  it('rejects an execution snapshot built from an older market generation', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    const first = Supervisor.setMarketDataSnapshot(
      { bestBid: 80_000, bestAsk: 80_001, observedAt: 10_000 },
      10_000,
      5_000,
    );
    Supervisor.setMarketDataSnapshot(
      { bestBid: 80_010, bestAsk: 80_011, observedAt: 11_000 },
      11_000,
      5_000,
    );
    Supervisor.setExecutionSnapshot({ complete: true }, first);
    expect(Supervisor.getExecutionSnapshot()).toBeNull();
  });

  it('clears the execution projection when BBO expires and requires a fresh rebuild', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    setEconomicReady(Supervisor);
    Supervisor.setAuthenticatedSnapshot(10_000, 10_000, { position: 0 });
    Supervisor.setMarketDataSnapshot(
      { bestBid: 80_000, bestAsk: 80_001, observedAt: 10_000 },
      10_000,
      5_000,
    );
    Supervisor.setExecutionSnapshot({ complete: true });

    expect(Supervisor.getSnapshot(15_001).runtimeState.domains.ExecutionState).toBe('BLOCKED');
    expect(Supervisor.getExecutionSnapshot()).toBeNull();
    Supervisor.setMarketDataSnapshot(
      { bestBid: 80_002, bestAsk: 80_003, observedAt: 15_002 },
      15_002,
      5_000,
    );
    expect(Supervisor.getSnapshot(15_002).runtimeState.domains.MarketDataState).toBe('READY');
    expect(Supervisor.getSnapshot(15_002).runtimeState.domains.ExecutionState).toBe('BLOCKED');
    Supervisor.setExecutionSnapshot({ complete: true });
    expect(Supervisor.getSnapshot(15_002).runtimeState.domains.ExecutionState).toBe('READY');
  });

  it('keeps execution blocked until authoritative ACK reconciliation clears', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    setEconomicReady(Supervisor);
    Supervisor.setAuthenticatedSnapshot(10_000, 5_000, { position: 0 });
    Supervisor.setMarketDataSnapshot(
      { bestBid: 80_000, bestAsk: 80_001, observedAt: 10_000 },
      10_000,
      5_000,
    );
    Supervisor.setExecutionSnapshot({ complete: true });
    Supervisor.setReconciliationRequired(true, 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');

    const blocked = Supervisor.getSnapshot(10_001);
    expect(blocked.runtimeState.domains.ExecutionState).toBe('BLOCKED');
    expect(blocked.runtimeState.domainBlockers.ExecutionState).toBe(
      'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
    );
    Supervisor.setReconciliationRequired(false);
    expect(Supervisor.getSnapshot(10_002).runtimeState.domains.ExecutionState).toBe('READY');
  });

  it('surfaces stale market data with resting orders as reconciliation required', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    setEconomicReady(Supervisor);
    Supervisor.setAuthenticatedSnapshot(10_000, 5_000, { position: 0 });
    Supervisor.setMarketDataSnapshot(
      { bestBid: 80_000, bestAsk: 80_001, observedAt: 10_000 },
      10_000,
      5_000,
    );
    Supervisor.setExecutionSnapshot({
      economicInputs: {},
      input: {
        now: 10_000,
        actualInventoryBase: 0,
        openOrders: [{ venueOrderId: 'order-1' }],
        book: { bestBid: 80_000, bestAsk: 80_001, observedAt: 10_000 },
      },
    });

    const stale = Supervisor.getSnapshot(15_001);
    expect(stale.runtimeState.domainBlockers.MarketDataState).toBe(
      'PRODUCTION_LIVE_SOURCE_BOOK_STALE_RESTING_ORDER_RECONCILIATION_REQUIRED',
    );
    expect(stale.runtimeState.domains.ExecutionState).toBe('BLOCKED');
  });

  it('recovers the session but blocks execution for authenticated untradeable dust', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setDependency('recovery', 'READY');
    setEconomicReady(Supervisor);
    Supervisor.setAuthenticatedSnapshot(10_000, 5_000, { position: -0.00001 });
    Supervisor.setMarketDataSnapshot(
      { bestBid: 80_000, bestAsk: 80_001, observedAt: 10_000 },
      10_000,
      5_000,
    );
    const dust = makeSnapshot();
    dust.input.actualInventoryBase = -0.00001;
    dust.input.metadata.minimumSize = 0.00002;
    Supervisor.setExecutionSnapshot(dust);

    const blocked = Supervisor.getSnapshot(10_001);
    expect(blocked.runtimeState.domains.SessionState).toBe('READY');
    expect(blocked.runtimeState.domains.ExecutionState).toBe('BLOCKED');
    expect(blocked.runtimeState.domainBlockers.ExecutionState).toBe('UNTRADEABLE_DUST');
    expect(blocked.inventory).toEqual({
      state: 'UNTRADEABLE_DUST',
      exactPositionBase: -0.00001,
      marketMinimumSize: 0.00002,
    });

    dust.input.actualInventoryBase = 0;
    Supervisor.setExecutionSnapshot(dust);
    const flat = Supervisor.getSnapshot(10_002);
    expect(flat.inventory.state).toBe('FLAT');
    expect(flat.runtimeState.domains.ExecutionState).toBe('READY');
  });

  it('projects authenticated dust before a complete execution snapshot exists', () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setAuthenticatedSnapshot(10_000, 5_000, {
      actualInventoryBase: -0.00001,
    });
    Supervisor.setAuthenticatedInventory(-0.00001, 0.00002);

    const state = Supervisor.getSnapshot(10_001);
    expect(state.runtimeState.domains.AuthState).toBe('READY');
    expect(state.inventory).toEqual({
      state: 'UNTRADEABLE_DUST',
      exactPositionBase: -0.00001,
      marketMinimumSize: 0.00002,
    });
    expect(state.runtimeState.domains.ExecutionState).toBe('BLOCKED');
    expect(state.runtimeState.domainBlockers.ExecutionState).toBe('UNTRADEABLE_DUST');
  });
});

describe('Decibel production web telemetry V1', () => {
  it('persists exact terminal cancellation evidence without clearing unresolved intents', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'web-terminal-reconcile-')), 'journal.sqlite');
    const Journal = new decibel_execution_lifecycle_journal_v1(path);
    const makeIntent = (cycleSequence: number, clientOrderId: string) =>
      buildDecibelExecutionIntentV1({
        sessionId: 'session',
        cycleSequence,
        action: 'PLACE',
        market: 'BTC/USD',
        side: 'BUY',
        price: 80_000,
        quantity: 0.00014,
        tickSize: 0.1,
        lotSize: 0.00001,
        clientOrderId,
        knownVenueOrderId: null,
        sourceStateHash: `source-${cycleSequence}`,
        strategyDecisionHash: `decision-${cycleSequence}`,
        createdAt: cycleSequence,
      });
    const cancelled = makeIntent(1, 'cancelled');
    const unresolved = makeIntent(2, 'unresolved');
    const submitUnknown = makeIntent(3, 'unknown');
    for (const intent of [cancelled, unresolved, submitUnknown]) Journal.prepare(intent);
    Journal.transition(cancelled.intentId, 'ACKNOWLEDGED', 4, 'venue-cancelled');
    Journal.transition(unresolved.intentId, 'ACKNOWLEDGED', 4, 'venue-unresolved');
    Journal.transition(submitUnknown.intentId, 'SUBMIT_UNKNOWN', 4);
    const base = makeSnapshot();
    const snapshot = {
      ...base,
      input: { ...base.input, now: 10_000 },
      terminalOrderEvidence: [
        {
          venueOrderId: 'venue-cancelled',
          state: 'CANCELLED' as const,
          originalQuantity: 0.00014,
          remainingQuantity: 0,
        },
      ],
    };

    expect(reconcileDecibelAcknowledgedTerminalOrdersV1(Journal, snapshot)).toEqual([
      cancelled.intentId,
    ]);
    expect(Journal.get(cancelled.intentId)?.status).toBe('CANCELLED_EXTERNALLY');
    expect(Journal.nonTerminal().map((intent) => intent.intentId)).toEqual([
      unresolved.intentId,
      submitUnknown.intentId,
    ]);
    Journal.close();

    const RestartedJournal = new decibel_execution_lifecycle_journal_v1(path);
    expect(RestartedJournal.get(cancelled.intentId)?.status).toBe('CANCELLED_EXTERNALLY');
    expect(RestartedJournal.nonTerminal().map((intent) => intent.intentId)).toEqual([
      unresolved.intentId,
      submitUnknown.intentId,
    ]);
    RestartedJournal.close();
  });

  it('atomically terminalizes an acknowledged cancel and its original place', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'web-cancel-lineage-')), 'journal.sqlite');
    const Journal = new decibel_execution_lifecycle_journal_v1(path);
    const makeIntent = (action: 'PLACE' | 'CANCEL', cycleSequence: number) =>
      buildDecibelExecutionIntentV1({
        sessionId: 'session',
        cycleSequence,
        action,
        market: 'BTC/USD',
        side: 'SELL',
        price: 80_000,
        quantity: 0.00014,
        tickSize: 0.1,
        lotSize: 0.00001,
        clientOrderId: `lineage-${cycleSequence}`,
        knownVenueOrderId: action === 'CANCEL' ? 'venue-lineage' : null,
        cancelReason: action === 'CANCEL' ? 'REPRICE' : undefined,
        sourceStateHash: `source-${cycleSequence}`,
        strategyDecisionHash: `decision-${cycleSequence}`,
        createdAt: cycleSequence,
      });
    const place = makeIntent('PLACE', 1);
    const cancel = makeIntent('CANCEL', 2);
    Journal.prepare(place);
    Journal.transition(place.intentId, 'ACKNOWLEDGED', 3, 'venue-lineage');
    Journal.applyAuthoritativeReconciliation({
      intentId: place.intentId,
      reconciliationState: 'ORDER_OPEN',
      terminalStatus: 'ACKNOWLEDGED',
      source: 'AUTHENTICATED_OPEN_ORDERS',
      matchedIdentifier: 'venueOrderId:venue-lineage',
      venueStatus: 'OPEN',
      remainingQuantity: 0.00014,
      transactionHash: null,
      venueOrderId: 'venue-lineage',
      clientOrderId: place.clientOrderId,
      observedAt: 3,
    });
    Journal.prepare(cancel);
    Journal.transition(cancel.intentId, 'ACKNOWLEDGED', 4, 'venue-lineage');
    const snapshot = {
      ...makeSnapshot(),
      terminalOrderEvidence: [
        {
          venueOrderId: 'venue-lineage',
          state: 'CANCELLED' as const,
          originalQuantity: 0.00014,
          remainingQuantity: 0,
        },
      ],
    };
    expect(
      Journal.getOrderLineageByVenueOrderIds(['venue-lineage', 'absent', 'venue-lineage']),
    ).toEqual(Journal.getOrderLineageByVenueOrderId('venue-lineage'));
    const individual = vi.spyOn(Journal, 'getOrderLineageByVenueOrderId');
    const batch = vi.spyOn(Journal, 'getOrderLineageByVenueOrderIds');
    const largeHistorySnapshot = {
      ...snapshot,
      terminalOrderEvidence: [
        ...snapshot.terminalOrderEvidence,
        ...Array.from({ length: 159 }, (_, index) => ({
          venueOrderId: `old-${index}`,
          state: 'CANCELLED' as const,
          originalQuantity: 0.00014,
          remainingQuantity: 0,
        })),
      ],
    };
    expect(reconcileDecibelAcknowledgedTerminalOrdersV1(Journal, largeHistorySnapshot)).toEqual([
      place.intentId,
      cancel.intentId,
    ]);
    expect(batch).toHaveBeenCalledOnce();
    expect(individual).not.toHaveBeenCalled();
    for (const intent of [place, cancel]) {
      expect(Journal.get(intent.intentId)?.status).toBe('CANCELLED_EXTERNALLY');
      expect(Journal.getLatestReconciliationProvenance(intent.intentId)?.venueStatus).toBe(
        'CANCELLED',
      );
    }
    Journal.close();
    const RestartedJournal = new decibel_execution_lifecycle_journal_v1(path);
    expect(reconcileDecibelAcknowledgedTerminalOrdersV1(RestartedJournal, snapshot)).toEqual([]);
    expect(RestartedJournal.nonTerminal()).toEqual([]);
    RestartedJournal.close();
  });

  it('repairs stale OPEN provenance only with terminal venue evidence', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'web-stale-open-')), 'journal.sqlite');
    const Journal = new decibel_execution_lifecycle_journal_v1(path);
    const place = buildDecibelExecutionIntentV1({
      sessionId: 'session',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 80_000,
      quantity: 0.00014,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'stale-open-place',
      knownVenueOrderId: null,
      sourceStateHash: 'source',
      strategyDecisionHash: 'decision',
      createdAt: 1,
    });
    Journal.prepare(place);
    Journal.transition(place.intentId, 'ACKNOWLEDGED', 2, 'venue-stale');
    Journal.applyAuthoritativeReconciliation({
      intentId: place.intentId,
      reconciliationState: 'ORDER_OPEN',
      terminalStatus: 'ACKNOWLEDGED',
      source: 'AUTHENTICATED_OPEN_ORDERS',
      matchedIdentifier: 'venueOrderId:venue-stale',
      venueStatus: 'OPEN',
      remainingQuantity: 0.00014,
      transactionHash: null,
      venueOrderId: 'venue-stale',
      clientOrderId: place.clientOrderId,
      observedAt: 3,
    });
    Journal.transition(place.intentId, 'CANCELLED_EXTERNALLY', 4);
    const snapshot = {
      ...makeSnapshot(),
      terminalOrderEvidence: [
        {
          venueOrderId: 'venue-stale',
          state: 'CANCELLED' as const,
          originalQuantity: 0.00014,
          remainingQuantity: 0,
        },
      ],
    };
    expect(Journal.getLatestReconciliationProvenance(place.intentId)?.venueStatus).toBe('OPEN');
    expect(reconcileDecibelAcknowledgedTerminalOrdersV1(Journal, snapshot)).toEqual([
      place.intentId,
    ]);
    expect(Journal.getLatestReconciliationProvenance(place.intentId)?.venueStatus).toBe(
      'CANCELLED',
    );
    expect(reconcileDecibelAcknowledgedTerminalOrdersV1(Journal, snapshot)).toEqual([]);
    Journal.close();
  });

  it('applies authenticated FILLED terminal evidence for an acknowledged order', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'web-filled-reconcile-')), 'journal.sqlite');
    const Journal = new decibel_execution_lifecycle_journal_v1(path);
    const intent = buildDecibelExecutionIntentV1({
      sessionId: 'session',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'SELL',
      price: 80_000,
      quantity: 0.00014,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'filled',
      knownVenueOrderId: null,
      sourceStateHash: 'source',
      strategyDecisionHash: 'decision',
      createdAt: 1,
    });
    Journal.prepare(intent);
    Journal.transition(intent.intentId, 'ACKNOWLEDGED', 2, 'venue-filled');
    const snapshot = {
      ...makeSnapshot(),
      terminalOrderEvidence: [
        {
          venueOrderId: 'venue-filled',
          state: 'FILLED' as const,
          originalQuantity: 0.00014,
          remainingQuantity: 0,
        },
      ],
    };
    expect(reconcileDecibelAcknowledgedTerminalOrdersV1(Journal, snapshot)).toEqual([
      intent.intentId,
    ]);
    expect(Journal.get(intent.intentId)?.status).toBe('APPLIED');
    Journal.close();
  });

  it.each(['OPEN', 'FULL_FILL'])(
    'atomically repairs APPLIED/FULL_FILL with stale %s provenance and survives restart',
    async (legacyStatus) => {
      const path = join(mkdtempSync(join(tmpdir(), 'web-filled-conflict-')), 'journal.sqlite');
      const Journal = new decibel_execution_lifecycle_journal_v1(path);
      const intent = buildDecibelExecutionIntentV1({
        sessionId: 'session',
        cycleSequence: 1,
        action: 'PLACE',
        market: 'BTC/USD',
        side: 'BUY',
        price: 80_734,
        quantity: 0.0003,
        tickSize: 0.1,
        lotSize: 0.00001,
        clientOrderId: 'd1b1ccecc90f252eddb35811e2b8d6a7',
        knownVenueOrderId: null,
        sourceStateHash: 'source',
        strategyDecisionHash: 'decision',
        createdAt: 1,
      });
      Journal.prepare(intent);
      Journal.transition(
        intent.intentId,
        'ACKNOWLEDGED',
        2,
        '170141599249866108014454746285554532352',
      );
      Journal.applyAuthoritativeReconciliation({
        intentId: intent.intentId,
        reconciliationState: 'ORDER_OPEN',
        terminalStatus: 'ACKNOWLEDGED',
        source: 'AUTHENTICATED_OPEN_ORDERS',
        matchedIdentifier: 'venueOrderId:170141599249866108014454746285554532352',
        venueStatus: 'OPEN',
        remainingQuantity: 0.0003,
        transactionHash: '0xfilled-conflict',
        venueOrderId: '170141599249866108014454746285554532352',
        clientOrderId: intent.clientOrderId,
        observedAt: 3,
      });
      Journal.transition(intent.intentId, 'RECONCILING', 4);
      Journal.recordReconciliation(
        intent.intentId,
        'FULL_FILL',
        '170141599249866108014454746285554532352',
        4,
      );
      Journal.transition(intent.intentId, 'APPLIED', 4);
      Journal.recordIdentityConflict(intent.intentId, 5);
      if (legacyStatus === 'FULL_FILL') {
        const Raw = new Database(path);
        Raw.prepare('UPDATE reconciliation_provenance SET venue_status=? WHERE intent_id=?').run(
          legacyStatus,
          intent.intentId,
        );
        Raw.close();
      }
      const base = makeSnapshot();
      const snapshot = {
        ...base,
        input: {
          ...base.input,
          now: 6,
          openOrders: [
            {
              venueOrderId: '170141599249866108014454746285554532352',
              clientOrderId: intent.clientOrderId,
              strategyConfigId: base.input.strategyConfigId,
              market: base.input.market,
              side: 'SELL' as const,
              price: 80_734,
              quantity: 0.0003,
              orderType: 'LIMIT' as const,
              timeInForce: 'PostOnly' as const,
              postOnly: true as const,
            },
          ],
        },
        terminalOrderEvidence: [
          {
            venueOrderId: '170141599249866108014454746285554532352',
            clientOrderId: intent.clientOrderId,
            state: 'FILLED' as const,
            originalQuantity: 0.0003,
            remainingQuantity: 0,
          },
        ],
      };
      expect(reconcileDecibelAcknowledgedTerminalOrdersV1(Journal, snapshot)).toEqual([]);
      const evidence = {
        observedAt: 6,
        openOrders: [],
        terminalOrders: snapshot.terminalOrderEvidence.map((order) => ({
          ...order,
          side: 'BUY',
        })),
        fills: [
          {
            venueFillId: '129191344404948879964071339950083',
            quantity: 0.0003,
            price: 80_734,
            transactionTimestamp: 4,
            transactionVersion: '7121429716',
          },
        ],
        transactionState: 'COMMITTED' as const,
      };
      const Source = {
        readAuthenticatedSnapshot: () => Promise.resolve(snapshot),
        reconcileIntent: () => Promise.resolve('FULL_FILL' as const),
        readOrderIdentityEvidence: vi.fn(() => Promise.resolve(evidence)),
      };
      const Reader = new Database(path);
      // A conflicting persisted fill must roll the entire repair back.
      Reader.prepare('INSERT INTO reconciliation_fill_provenance VALUES(?,?,?,?,?,?,?,?)').run(
        '129191344404948879964071339950083',
        intent.intentId,
        '170141599249866108014454746285554532352',
        intent.clientOrderId,
        0.0002,
        80_734,
        '4',
        4,
      );
      await expect(reconcileDecibelActiveIdentityConflictV1(Journal, Source)).rejects.toThrow(
        'EXECUTION_AUTHORITATIVE_FILL_IDENTITY_CONFLICT',
      );
      expect(Journal.getActiveIdentityConflict()?.intentId).toBe(intent.intentId);
      expect(Journal.getLatestReconciliationProvenance(intent.intentId)?.venueStatus).toBe(
        legacyStatus,
      );
      Reader.prepare('DELETE FROM reconciliation_fill_provenance').run();
      for (const invalid of [
        {
          ...evidence,
          terminalOrders: [{ ...evidence.terminalOrders[0]!, clientOrderId: 'wrong-client' }],
        },
        {
          ...evidence,
          terminalOrders: [{ ...evidence.terminalOrders[0]!, originalQuantity: 0.0004 }],
        },
        {
          ...evidence,
          terminalOrders: [{ ...evidence.terminalOrders[0]!, side: 'SELL' as const }],
        },
        { ...evidence, terminalOrders: [], fills: [] },
        { ...evidence, terminalOrders: [] },
        { ...evidence, transactionState: 'NOT_FOUND' as const },
      ]) {
        Source.readOrderIdentityEvidence.mockResolvedValueOnce(invalid);
        await expect(
          reconcileDecibelActiveIdentityConflictV1(Journal, Source),
        ).resolves.toMatchObject({
          reconciled: null,
          blocker: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
        });
      }
      Source.readOrderIdentityEvidence.mockResolvedValueOnce({
        ...evidence,
        fills: [{ ...evidence.fills[0]!, quantity: 0.0002 }],
      });
      await expect(reconcileDecibelActiveIdentityConflictV1(Journal, Source)).rejects.toThrow(
        'EXECUTION_AUTHORITATIVE_FILL_QUANTITY_CONFLICT',
      );
      Reader.exec(`CREATE TRIGGER fail_fill_persist BEFORE INSERT ON reconciliation_fill_provenance
      BEGIN SELECT RAISE(ABORT, 'SIMULATED_FILL_PERSIST_FAILURE'); END`);
      await expect(reconcileDecibelActiveIdentityConflictV1(Journal, Source)).rejects.toThrow(
        'SIMULATED_FILL_PERSIST_FAILURE',
      );
      expect(Journal.getActiveIdentityConflict()?.intentId).toBe(intent.intentId);
      expect(Journal.getLatestReconciliationProvenance(intent.intentId)?.venueStatus).toBe(
        legacyStatus,
      );
      expect(Journal.get(intent.intentId)?.status).toBe('APPLIED');
      Reader.exec('DROP TRIGGER fail_fill_persist');
      const Executor = {
        placePostOnlyLimit: vi.fn(() => Promise.reject(new Error('MUTATION_FORBIDDEN'))),
        cancelExactOrder: vi.fn(() => Promise.reject(new Error('MUTATION_FORBIDDEN'))),
      };
      const Live = new decibel_production_live_orchestrator_v1(
        Journal,
        wrapDecibelProductionLiveStateSourceV1(Source, () => {}),
        Executor,
        configuration,
        {
          maxPlaceAttemptsPerMinute: 10,
          maxCancelAttemptsPerMinute: 10,
          maxTotalMutationAttemptsPerMinute: 10,
          maxConsecutiveUnknownOutcomes: 2,
        },
      );
      await expect(Live.evaluateOnce()).resolves.toMatchObject({
        action: 'RECONCILE_ONLY',
        intentId: intent.intentId,
        blocker: null,
        mutationInvocations: 0,
      });
      expect(Executor.placePostOnlyLimit).not.toHaveBeenCalled();
      expect(Executor.cancelExactOrder).not.toHaveBeenCalled();
      expect(Source.readOrderIdentityEvidence).toHaveBeenCalledWith({
        venueOrderId: '170141599249866108014454746285554532352',
        clientOrderId: intent.clientOrderId,
        createdAt: 1,
        transactionHash: '0xfilled-conflict',
      });
      expect(Journal.getLatestReconciliationProvenance(intent.intentId)).toMatchObject({
        source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
        venueStatus: 'FILLED',
        remainingQuantity: 0,
      });
      Journal.close();
      const RestartedJournal = new decibel_execution_lifecycle_journal_v1(path);
      expect(RestartedJournal.getActiveIdentityConflict()).toBeNull();
      expect(RestartedJournal.get(intent.intentId)?.status).toBe('APPLIED');
      expect(
        Reader.prepare('SELECT COUNT(*) count FROM reconciliation_fill_provenance').get(),
      ).toEqual({ count: 1 });
      const before = Reader.prepare('SELECT COUNT(*) count FROM reconciliation_provenance').get();
      await expect(
        reconcileDecibelActiveIdentityConflictV1(RestartedJournal, Source),
      ).resolves.toEqual({ reconciled: null, blocker: null });
      expect(Reader.prepare('SELECT COUNT(*) count FROM reconciliation_provenance').get()).toEqual(
        before,
      );
      RestartedJournal.recordIdentityConflict(intent.intentId, 7);
      await expect(
        reconcileDecibelActiveIdentityConflictV1(RestartedJournal, Source),
      ).resolves.toEqual({
        reconciled: intent.intentId,
        blocker: null,
      });
      expect(Reader.prepare('SELECT COUNT(*) count FROM reconciliation_provenance').get()).toEqual(
        before,
      );
      expect(
        Reader.prepare('SELECT COUNT(*) count FROM reconciliation_fill_provenance').get(),
      ).toEqual({ count: 1 });
      RestartedJournal.close();
      Reader.close();
    },
  );

  it('reconciles every startup acknowledgement and persists evidence atomically', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'web-all-ack-reconcile-')), 'journal.sqlite');
    const Journal = new decibel_execution_lifecycle_journal_v1(path);
    const makeIntent = (cycleSequence: number, clientOrderId: string) =>
      buildDecibelExecutionIntentV1({
        sessionId: 'session',
        cycleSequence,
        action: 'PLACE',
        market: 'BTC/USD',
        side: cycleSequence === 1 ? 'BUY' : 'SELL',
        price: 80_000,
        quantity: 0.00014,
        tickSize: 0.1,
        lotSize: 0.00001,
        clientOrderId,
        knownVenueOrderId: null,
        sourceStateHash: `source-${cycleSequence}`,
        strategyDecisionHash: `decision-${cycleSequence}`,
        createdAt: cycleSequence,
      });
    const terminal = makeIntent(1, 'terminal-client');
    const ambiguous = makeIntent(2, 'ambiguous-client');
    Journal.prepare(terminal);
    Journal.prepare(ambiguous);
    Journal.transition(terminal.intentId, 'ACKNOWLEDGED', 3, 'terminal-order');
    Journal.transition(ambiguous.intentId, 'ACKNOWLEDGED', 3, 'ambiguous-order');
    const base = makeSnapshot();
    const snapshot = {
      ...base,
      input: { ...base.input, now: 10_000 },
      terminalOrderEvidence: [
        {
          venueOrderId: 'terminal-order',
          clientOrderId: 'terminal-client',
          state: 'CANCELLED' as const,
          originalQuantity: 0.00014,
          remainingQuantity: 0,
        },
      ],
    };
    const Source = {
      readAuthenticatedSnapshot: () => Promise.resolve(snapshot),
      reconcileIntent: (intentId: string) =>
        intentId === terminal.intentId
          ? Promise.resolve('CANCELLED_EXTERNALLY' as const)
          : Promise.reject(new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK')),
    };

    await expect(
      reconcileAllDecibelAcknowledgedOrdersV1(Journal, Source, snapshot),
    ).resolves.toEqual({
      reconciled: [terminal.intentId],
      unresolvable: [ambiguous.intentId],
    });
    expect(Journal.get(terminal.intentId)?.status).toBe('CANCELLED_EXTERNALLY');
    expect(Journal.get(ambiguous.intentId)?.status).toBe('UNRESOLVABLE_ACK');
    expect(Journal.getLatestReconciliationProvenance(terminal.intentId)).toMatchObject({
      source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
      matchedIdentifier: 'venueOrderId:terminal-order',
      venueStatus: 'CANCELLED',
      remainingQuantity: 0,
      venueOrderId: 'terminal-order',
      clientOrderId: 'terminal-client',
    });
    Journal.close();

    const RestartedJournal = new decibel_execution_lifecycle_journal_v1(path);
    expect(RestartedJournal.get(terminal.intentId)?.status).toBe('CANCELLED_EXTERNALLY');
    expect(RestartedJournal.get(ambiguous.intentId)?.status).toBe('UNRESOLVABLE_ACK');
    expect(RestartedJournal.nonTerminal().map((row) => row.status)).toEqual(['UNRESOLVABLE_ACK']);

    const retrySnapshot = {
      ...snapshot,
      input: { ...snapshot.input, now: 10_100 },
      terminalOrderEvidence: [
        ...snapshot.terminalOrderEvidence,
        {
          venueOrderId: 'ambiguous-order',
          clientOrderId: 'ambiguous-client',
          state: 'CANCELLED' as const,
          originalQuantity: 0.00014,
          remainingQuantity: 0,
        },
      ],
    };
    const RecoveredSource = {
      readAuthenticatedSnapshot: () => Promise.resolve(retrySnapshot),
      readOrderIdentityEvidence: () =>
        Promise.resolve({
          observedAt: 10_100,
          openOrders: [],
          terminalOrders: [
            {
              venueOrderId: 'ambiguous-order',
              clientOrderId: 'ambiguous-client',
              state: 'FILLED' as const,
              originalQuantity: 0.00014,
              remainingQuantity: 0,
            },
          ],
          fills: [
            {
              venueFillId: 'incident-fill',
              quantity: 0.00014,
              price: 80_000,
              transactionTimestamp: 10_050,
              transactionVersion: '7121446942',
            },
          ],
          transactionState: 'COMMITTED' as const,
        }),
      reconcileIntent: () => Promise.resolve('FULL_FILL' as const),
    };
    await expect(
      reconcileAllDecibelAcknowledgedOrdersV1(RestartedJournal, RecoveredSource, retrySnapshot),
    ).resolves.toEqual({ reconciled: [ambiguous.intentId], unresolvable: [] });
    expect(RestartedJournal.get(ambiguous.intentId)?.status).toBe('APPLIED');
    const ReadonlyDb = new Database(path, { readonly: true });
    expect(
      ReadonlyDb.prepare(
        'SELECT transaction_version FROM reconciliation_fill_provenance WHERE fill_id=?',
      ).get('incident-fill'),
    ).toEqual({ transaction_version: '7121446942' });
    ReadonlyDb.close();
    expect(RestartedJournal.nonTerminal()).toEqual([]);
    expect(RestartedJournal.getLatestReconciliationProvenance(ambiguous.intentId)).toMatchObject({
      source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
      venueStatus: 'FILLED',
      remainingQuantity: 0,
    });
    const history = readDecibelProductionWebHistoryV1(path);
    const telemetry = mapDecibelProductionWebTelemetryV1({
      snapshot,
      history,
      configuration,
      startedAt: 1,
      generatedAt: 10_001,
      lastSuccessfulCycleAt: 10_000,
      connectionError: null,
      authenticatedStateAgeMs: 250,
      build: {
        buildId: 'build-abc',
        processStart: 9_000,
        sourceBuildTimestamp: 10_000,
        restartRequired: true,
      },
    });
    expect(telemetry.runtime).toMatchObject({
      buildId: 'build-abc',
      processStart: 9_000,
      sourceBuildTimestamp: 10_000,
      restartRequired: true,
      authenticatedStateAgeMs: 250,
    });
    const presentation = deriveDashboardPresentationV1({
      connected: true,
      degraded: telemetry.degraded,
      runtimeState: telemetry.runtime.state,
      dryRun: telemetry.runtime.dryRun,
      blockers: telemetry.blockers,
      intents: telemetry.intents,
      events: telemetry.events,
    });
    const startGate = deriveSessionStartGateV1({
      runtimeBlocked: presentation.abnormal,
      runtimeBlockCode: telemetry.runtime.lifecycleBlocker,
      runtimeBlockMessage: telemetry.runtime.whyNoAction,
      capitalToUseUsd: 10,
      authenticatedAccountEquityUsd: 50,
    });
    expect(startGate).toMatchObject({ blocked: false, code: null });
    RestartedJournal.close();
  });

  it('accounts for proven fees, unrealized PnL, and gas without fabricating components', () => {
    const fills = [
      {
        fillId: 'buy',
        sessionId: 'session',
        side: 'BUY' as const,
        quantity: 1,
        price: 100,
        observedAt: 1,
      },
      {
        fillId: 'sell',
        sessionId: 'session',
        side: 'SELL' as const,
        quantity: 1,
        price: 110,
        observedAt: 2,
      },
    ];
    expect(
      calculateDecibelBotScopedPnlV1(
        fills,
        new Map([
          ['buy', 0.2],
          ['sell', 0.3],
        ]),
        'BOT_SESSION',
        { unrealizedUsd: 2, gasUsd: 1 },
      ),
    ).toEqual({
      valueUsd: 10.5,
      realizedUsd: 10,
      unrealizedUsd: 2,
      feesUsd: 0.5,
      gasUsd: 1,
      complete: true,
      scope: 'BOT_SESSION',
    });
    expect(calculateDecibelBotScopedPnlV1(fills, new Map(), 'BOT_SESSION')).toMatchObject({
      valueUsd: 10,
      feesUsd: null,
      unrealizedUsd: null,
      gasUsd: null,
      complete: false,
    });
  });
  it('rejects secret-bearing telemetry fields', () => {
    expect(() => assertDecibelWebTelemetrySanitizedV1({ privateKey: 'test-secret' })).toThrow(
      'WEB_TELEMETRY_SECRET_FIELD_REJECTED',
    );
    expect(() => assertDecibelWebTelemetrySanitizedV1({ market: 'BTC/USD' })).not.toThrow();
  });

  it('shows the actor decision while its cycle is fresh, even on a rebuilt snapshot', () => {
    const history = readDecibelProductionWebHistoryV1('missing-journal.sqlite', 10, 10_100);
    const snapshot = makeSnapshot();
    const sessionId = snapshot.input.sessionId;
    const actor = evaluateTradingDecision(snapshot, {
      now: 10_000,
      sessionId,
      state: 'RUNNING',
    });
    // The actor decided on an earlier frame: its hash no longer matches the published one.
    const stored = {
      ...actor,
      primaryReason: 'ACTOR_DECISION_MARKER',
      evidence: { ...actor.evidence, sessionId, sourceStateHash: 'older-frame' },
    };
    const map = (generatedAt: number) =>
      mapDecibelProductionWebTelemetryV1({
        snapshot,
        history,
        configuration,
        startedAt: 1_000,
        generatedAt,
        lastSuccessfulCycleAt: 10_000,
        connectionError: null,
        execution: {
          running: true,
          sessionId,
          cycles: 3,
          lastAction: 'HOLD',
          blocker: null,
          tradingDecision: stored,
        },
      }).runtime.tradingDecision;
    expect(map(10_000 + DECIBEL_TELEMETRY_ACTOR_DECISION_MAX_AGE_MS_V1).primaryReason).toBe(
      'ACTOR_DECISION_MARKER',
    );
    // A stale cycle falls back to the presentation's own projection.
    expect(map(10_001 + DECIBEL_TELEMETRY_ACTOR_DECISION_MAX_AGE_MS_V1).primaryReason).not.toBe(
      'ACTOR_DECISION_MARKER',
    );
  });

  it('maps runtime, ladder, risk, and degraded state without execution controls', () => {
    const history = readDecibelProductionWebHistoryV1('missing-journal.sqlite', 10, 10_100);
    const telemetry = mapDecibelProductionWebTelemetryV1({
      snapshot: makeSnapshot(),
      history,
      configuration,
      startedAt: 1_000,
      generatedAt: 10_100,
      lastSuccessfulCycleAt: 10_000,
      connectionError: null,
      execution: {
        running: true,
        sessionId: 'session-active',
        cycles: 3,
        lastAction: 'HOLD',
        blocker: 'EXECUTION_MUTATION_BUDGET_BLOCKED',
      },
    });
    expect(telemetry.runtime).toMatchObject({
      state: 'RUNNING',
      connected: true,
      market: 'BTC/USD',
      executionLoopRunning: true,
      executionSessionId: 'session-active',
      executionCycles: 3,
      lastExecutionAction: 'HOLD',
      executionBlocker: 'EXECUTION_MUTATION_BUDGET_BLOCKED',
    });
    expect(telemetry.blockers).toContainEqual(
      expect.objectContaining({ code: 'EXECUTION_MUTATION_BUDGET_BLOCKED' }),
    );
    expect(telemetry.ladder.length).toBeGreaterThan(0);
    expect(telemetry.ladder.every((level) => level.desiredPrice > 0)).toBe(true);
    expect(telemetry.risk).toMatchObject({
      placeRemaining: 15,
      cancelRemaining: 15,
      totalRemaining: 30,
    });
    expect(telemetry.account).toMatchObject({
      collateralUsd: 50,
      availableMarginUsd: 100,
      availableMarginReason: null,
      marginUsedUsd: null,
      marginUsedReason: 'ACTIVE_SESSION_CONFIG_UNAVAILABLE',
    });
    expect(telemetry.positions).toEqual([
      {
        market: 'BTC/USD',
        side: 'LONG',
        size: 0.0012,
        entryPrice: null,
        markPrice: 80_000,
        unrealizedPnlUsd: null,
        source: 'UNKNOWN',
      },
      {
        market: 'ETH/USD',
        side: 'SHORT',
        size: 0.08,
        entryPrice: null,
        markPrice: null,
        unrealizedPnlUsd: null,
        source: 'EXTERNAL',
      },
    ]);
    expect(JSON.stringify(telemetry)).not.toMatch(/private.?key|authorization|signer/i);

    const degraded = mapDecibelProductionWebTelemetryV1({
      snapshot: null,
      history,
      configuration,
      startedAt: 1_000,
      generatedAt: 10_100,
      lastSuccessfulCycleAt: null,
      connectionError: 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    });
    expect(degraded).toMatchObject({
      degraded: true,
      runtime: { state: 'READ_FAILURE', connected: false },
    });

    const authenticatedFlat = mapDecibelProductionWebTelemetryV1({
      snapshot: null,
      history,
      configuration,
      startedAt: 1_000,
      generatedAt: 10_100,
      lastSuccessfulCycleAt: 10_000,
      connectionError: null,
      supervisorInventory: {
        state: 'FLAT',
        exactPositionBase: 0,
        marketMinimumSize: 0.00002,
      },
    });
    expect(authenticatedFlat.inventory).toMatchObject({
      positionBase: 0,
      exactPositionBase: 0,
      direction: 'FLAT',
      state: 'FLAT',
    });
  });
  it('exposes Decibel HTTP rate limiting as the concrete degraded read blocker', () => {
    const telemetry = mapDecibelProductionWebTelemetryV1({
      snapshot: makeSnapshot(),
      history: readDecibelProductionWebHistoryV1('missing-journal.sqlite', 10, 10_100),
      configuration,
      startedAt: 1_000,
      generatedAt: 10_100,
      lastSuccessfulCycleAt: 10_000,
      connectionError: 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
    });
    expect(telemetry.degraded).toBe(true);
    expect(telemetry.blockers).toContainEqual(
      expect.objectContaining({
        code: 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
        meaning:
          'Decibel HTTP API rate limit reached. Authenticated reads are paused for bounded backoff.',
      }),
    );
  });

  it('loads bounded read-only lifecycle history and blocker rendering data', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'web-history-')), 'journal.sqlite');
    const Writer = new Database(path);
    Writer.exec(`
      CREATE TABLE execution_intents(intent_id TEXT PRIMARY KEY,mutation_key TEXT,body_json TEXT,status TEXT,venue_order_id TEXT,created_at INTEGER,updated_at INTEGER);
      CREATE TABLE executor_outcomes(id INTEGER PRIMARY KEY,intent_id TEXT,outcome_json TEXT,observed_at INTEGER);
      CREATE TABLE reconciliation_observations(id INTEGER PRIMARY KEY,intent_id TEXT,state TEXT,venue_order_id TEXT,observed_at INTEGER);
      CREATE TABLE lifecycle_blockers(id INTEGER PRIMARY KEY,intent_id TEXT,blocker TEXT,observed_at INTEGER);
      CREATE TABLE authenticated_fills(fill_id TEXT PRIMARY KEY,intent_id TEXT,side TEXT,quantity REAL,price REAL,strategy_lineage INTEGER,maker_proven INTEGER,external_counterparty INTEGER,observed_at INTEGER);
      CREATE TABLE mutation_attempts(id INTEGER PRIMARY KEY,intent_id TEXT,attempted_at INTEGER,outcome TEXT);
    `);
    for (let index = 0; index < 5; index += 1) {
      Writer.prepare('INSERT INTO execution_intents VALUES(?,?,?,?,?,?,?)').run(
        `intent-${index}`,
        `mutation-${index}`,
        JSON.stringify({ action: 'PLACE', side: 'BUY', price: 100, quantity: 0.1 }),
        index === 4 ? 'SUBMIT_UNKNOWN' : 'APPLIED',
        null,
        index,
        index,
      );
    }
    Writer.prepare('INSERT INTO lifecycle_blockers VALUES(?,?,?,?)').run(
      1,
      'intent-4',
      'EXECUTION_MUTATION_BUDGET_BLOCKED',
      4,
    );
    Writer.close();

    const history = readDecibelProductionWebHistoryV1(path, 2, 10);
    expect(history.intents).toHaveLength(2);
    expect(history.intents[0]).toMatchObject({ intentId: 'intent-4', status: 'SUBMIT_UNKNOWN' });
    expect(history.blockers[0]).toMatchObject({
      code: 'EXECUTION_MUTATION_BUDGET_BLOCKED',
      meaning: 'Rolling mutation capacity is depleted.',
    });
  });

  it('rejects unbounded journal history requests', () => {
    expect(() => readDecibelProductionWebHistoryV1('missing.sqlite', 101)).toThrow(
      'WEB_TELEMETRY_HISTORY_LIMIT_INVALID',
    );
  });

  it('attributes session and all-time PnL only through proven strategy lineage', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'web-pnl-')), 'journal.sqlite');
    const Writer = new Database(path);
    Writer.exec(`
      CREATE TABLE execution_intents(intent_id TEXT PRIMARY KEY,mutation_key TEXT,body_json TEXT,status TEXT,venue_order_id TEXT,created_at INTEGER,updated_at INTEGER);
      CREATE TABLE executor_outcomes(id INTEGER PRIMARY KEY,intent_id TEXT,outcome_json TEXT,observed_at INTEGER);
      CREATE TABLE reconciliation_observations(id INTEGER PRIMARY KEY,intent_id TEXT,state TEXT,venue_order_id TEXT,observed_at INTEGER);
      CREATE TABLE lifecycle_blockers(id INTEGER PRIMARY KEY,intent_id TEXT,blocker TEXT,observed_at INTEGER);
      CREATE TABLE authenticated_fills(fill_id TEXT PRIMARY KEY,intent_id TEXT,side TEXT,quantity REAL,price REAL,strategy_lineage INTEGER,maker_proven INTEGER,external_counterparty INTEGER,observed_at INTEGER);
      CREATE TABLE mutation_attempts(id INTEGER PRIMARY KEY,intent_id TEXT,attempted_at INTEGER,outcome TEXT);
    `);
    const addIntent = (id: string, sessionId: string, at: number) =>
      Writer.prepare('INSERT INTO execution_intents VALUES(?,?,?,?,?,?,?)').run(
        id,
        `mutation-${id}`,
        JSON.stringify({ action: 'PLACE', side: 'BUY', price: 100, quantity: 1, sessionId }),
        'APPLIED',
        `order-${id}`,
        at,
        at,
      );
    addIntent('session-buy', 'session', 1);
    addIntent('session-sell', 'session', 2);
    addIntent('historical', 'older-session', 3);
    Writer.prepare('INSERT INTO authenticated_fills VALUES(?,?,?,?,?,?,?,?,?)').run(
      'bot-buy',
      'session-buy',
      'BUY',
      1,
      100,
      1,
      1,
      1,
      1,
    );
    Writer.prepare('INSERT INTO authenticated_fills VALUES(?,?,?,?,?,?,?,?,?)').run(
      'bot-sell',
      'session-sell',
      'SELL',
      1,
      110,
      1,
      1,
      1,
      2,
    );
    Writer.prepare('INSERT INTO authenticated_fills VALUES(?,?,?,?,?,?,?,?,?)').run(
      'manual-fill',
      'historical',
      'SELL',
      20,
      1_000,
      0,
      1,
      1,
      3,
    );
    Writer.close();

    const history = readDecibelProductionWebHistoryV1(path, 100, 10_100);
    expect(history.accountingFills.map((fill) => fill.fillId)).toEqual(['bot-buy', 'bot-sell']);
    const telemetry = mapDecibelProductionWebTelemetryV1({
      snapshot: makeSnapshot(),
      history,
      configuration,
      startedAt: 0,
      generatedAt: 10_100,
      lastSuccessfulCycleAt: 10_000,
      connectionError: null,
    });
    expect(telemetry.pnl.sessionPnl).toMatchObject({
      scope: 'BOT_SESSION',
      realizedUsd: 10,
      valueUsd: 10,
      complete: false,
      gasUsd: null,
    });
    expect(telemetry.pnl.allTimePnl).toMatchObject({
      scope: 'BOT_ONLY',
      realizedUsd: 10,
      valueUsd: 10,
      complete: false,
    });
  });

  it('reports the exact acknowledged intent that requires reconciliation', () => {
    const emptyHistory = readDecibelProductionWebHistoryV1('missing-journal.sqlite', 10, 10_100);
    const telemetry = mapDecibelProductionWebTelemetryV1({
      snapshot: makeSnapshot(),
      history: {
        ...emptyHistory,
        journalAvailable: true,
        intents: [
          {
            timestamp: 10_000,
            intentId: 'intent-pending',
            action: 'PLACE',
            side: 'BUY',
            price: 80_000,
            quantity: 0.00014,
            status: 'ACKNOWLEDGED',
            venueOrderId: 'order-pending',
            transactionHash: '0xtest',
            blocker: null,
            reconciliationResult: null,
          },
          {
            timestamp: 10_001,
            intentId: 'intent-submit-unknown',
            action: 'CANCEL',
            side: 'BUY',
            price: 80_000,
            quantity: 0.00014,
            status: 'SUBMIT_UNKNOWN',
            venueOrderId: 'order-submit-unknown',
            transactionHash: null,
            blocker: null,
            reconciliationResult: null,
          },
        ],
      },
      configuration,
      startedAt: 1_000,
      generatedAt: 10_100,
      lastSuccessfulCycleAt: 10_000,
      connectionError: null,
    });
    expect(telemetry.runtime.state).toBe('RECONCILE_ONLY');
    expect(telemetry.blockers).toContainEqual(
      expect.objectContaining({
        code: 'PRODUCTION_RECONCILIATION_CONFIRMATION_PENDING',
        intentId: 'intent-submit-unknown',
      }),
    );
  });

  it('does not report a reconciliation blocker for an acknowledged order proven open', () => {
    const emptyHistory = readDecibelProductionWebHistoryV1('missing-journal.sqlite', 10, 10_100);
    const snapshot = makeSnapshot();
    const telemetry = mapDecibelProductionWebTelemetryV1({
      snapshot: {
        ...snapshot,
        input: {
          ...snapshot.input,
          openOrders: [
            {
              venueOrderId: 'order-open',
              clientOrderId: 'client-open',
              strategyConfigId: snapshot.input.strategyConfigId,
              market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
              side: 'SELL',
              price: 80_010,
              quantity: 0.00014,
              orderType: 'LIMIT',
              timeInForce: 'PostOnly',
              postOnly: true,
            },
          ],
        },
      },
      history: {
        ...emptyHistory,
        journalAvailable: true,
        intents: [
          {
            timestamp: 10_000,
            intentId: 'intent-open',
            action: 'PLACE',
            side: 'SELL',
            price: 80_010,
            quantity: 0.00014,
            status: 'ACKNOWLEDGED',
            venueOrderId: 'order-open',
            transactionHash: '0xtest',
            blocker: null,
            reconciliationResult: 'ORDER_OPEN',
          },
        ],
      },
      configuration,
      startedAt: 1_000,
      generatedAt: 10_100,
      lastSuccessfulCycleAt: 10_000,
      connectionError: null,
    });
    expect(telemetry.runtime.lifecycleBlocker).toBeNull();
    expect(telemetry.runtime.state).not.toBe('RECONCILE_ONLY');
    expect(telemetry.blockers).not.toContainEqual(
      expect.objectContaining({ code: 'PRODUCTION_RECONCILIATION_PENDING_ACKNOWLEDGED_ORDER' }),
    );
  });

  it('restores an acknowledged live order across runtime restart without a stale dashboard blocker', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'web-runtime-ack-restart-')), 'journal.sqlite');
    const venueOrderId = '170141604320468508878496938572346556416';
    const clientOrderId = 'd1bf9dbd234f853b35c637190f38ba93';
    const Journal = new decibel_execution_lifecycle_journal_v1(path);
    const intent = Object.freeze({
      ...buildDecibelExecutionIntentV1({
        sessionId: 'session-1789263726856-6999e9be-9f29-4b0d-8653-fae52fade195',
        cycleSequence: 10_098,
        action: 'PLACE',
        market: 'BTC/USD',
        side: 'BUY',
        price: 77_211.3,
        quantity: 0.00014,
        tickSize: 0.1,
        lotSize: 0.00001,
        clientOrderId,
        knownVenueOrderId: null,
        sourceStateHash: 'restart-source',
        strategyDecisionHash: 'restart-decision',
        createdAt: 10_000,
      }),
      intentId: 'intent-f9dbd234f853b35c637190f3',
    });
    Journal.prepare(intent);
    Journal.transition(intent.intentId, 'SUBMITTING', 10_001);
    Journal.transition(intent.intentId, 'ACKNOWLEDGED', 10_002, venueOrderId);
    Journal.close();

    const RestartedJournal = new decibel_execution_lifecycle_journal_v1(path);
    expect(RestartedJournal.findNonTerminalPlaceBySide('BUY')?.intentId).toBe(intent.intentId);
    RestartedJournal.close();
    const base = makeSnapshot();
    const snapshot: decibel_production_live_snapshot_v1 = {
      ...base,
      input: {
        ...base.input,
        openOrders: [
          {
            venueOrderId,
            clientOrderId,
            strategyConfigId: base.input.strategyConfigId,
            market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: 'BUY',
            price: 77_211.3,
            quantity: 0.00014,
            orderType: 'LIMIT',
            timeInForce: 'PostOnly',
            postOnly: true,
          },
        ],
      },
    };
    const telemetry = mapDecibelProductionWebTelemetryV1({
      snapshot,
      history: readDecibelProductionWebHistoryV1(path, 100, 10_100),
      configuration,
      startedAt: 1_000,
      generatedAt: 10_100,
      lastSuccessfulCycleAt: 10_100,
      connectionError: null,
    });
    expect(telemetry.runtime.lifecycleBlocker).toBeNull();
    expect(telemetry.blockers).not.toContainEqual(
      expect.objectContaining({ code: 'PRODUCTION_RECONCILIATION_PENDING_ACKNOWLEDGED_ORDER' }),
    );
    expect(
      deriveDashboardPresentationV1({
        connected: true,
        degraded: telemetry.degraded,
        runtimeState: telemetry.runtime.state,
        dryRun: telemetry.runtime.dryRun,
        blockers: telemetry.blockers,
        intents: telemetry.intents,
        events: telemetry.events,
      }),
    ).toMatchObject({ abnormal: false, botState: 'DRY RUN' });
  });

  it('suppresses stale unresolvable-ACK projection after persisted authoritative OPEN provenance', () => {
    const path = join(
      mkdtempSync(join(tmpdir(), 'web-open-provenance-restart-')),
      'journal.sqlite',
    );
    const venueOrderId = '170141594179263706035330382241277673472';
    const clientOrderId = 'd1secfabcf8f05488a07fc17b6514302';
    const Journal = new decibel_execution_lifecycle_journal_v1(path);
    const intent = Object.freeze({
      ...buildDecibelExecutionIntentV1({
        sessionId: 'session',
        cycleSequence: 12_397,
        action: 'PLACE',
        market: 'BTC/USD',
        side: 'SELL',
        price: 77_365.2,
        quantity: 0.00032,
        tickSize: 0.1,
        lotSize: 0.00001,
        clientOrderId,
        knownVenueOrderId: null,
        sourceStateHash: 'source-open',
        strategyDecisionHash: 'decision-open',
        createdAt: 10_000,
      }),
      intentId: 'intent-ecfabcf8f05488a07fc17b65',
    });
    Journal.prepare(intent);
    Journal.transition(intent.intentId, 'ACKNOWLEDGED', 10_001, venueOrderId);
    Journal.recordBlocker(intent.intentId, 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK', 10_002);
    Journal.applyAuthoritativeReconciliation({
      intentId: intent.intentId,
      reconciliationState: 'ORDER_OPEN',
      terminalStatus: 'ACKNOWLEDGED',
      source: 'AUTHENTICATED_OPEN_ORDERS',
      matchedIdentifier: `venueOrderId:${venueOrderId}`,
      venueStatus: 'OPEN',
      remainingQuantity: 0.00032,
      transactionHash: '0xtest',
      venueOrderId,
      clientOrderId,
      observedAt: 10_003,
    });
    Journal.close();

    const history = readDecibelProductionWebHistoryV1(path, 100, 10_100);
    expect(history.intents[0]).toMatchObject({
      intentId: intent.intentId,
      status: 'ACKNOWLEDGED',
      blocker: null,
      reconciliationResult: 'ORDER_OPEN',
    });
    const RestartedJournal = new decibel_execution_lifecycle_journal_v1(path);
    expect(RestartedJournal.findNonTerminalPlaceBySide('SELL')).toMatchObject({
      intentId: intent.intentId,
      status: 'ACKNOWLEDGED',
      venueOrderId,
    });
    expect(RestartedJournal.getLatestReconciliationProvenance(intent.intentId)).toMatchObject({
      source: 'AUTHENTICATED_OPEN_ORDERS',
      venueStatus: 'OPEN',
      venueOrderId,
      clientOrderId,
    });
    RestartedJournal.close();
  });

  it('atomically persists an unknown IOC fill and remains idempotent after restart', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'web-ioc-fill-')), 'journal.sqlite');
    const Journal = new decibel_execution_lifecycle_journal_v1(path);
    const intent = buildDecibelExecutionIntentV1({
      sessionId: 'stopping-session',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'SELL',
      price: 81_432,
      quantity: 0.00003,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'd1s8e1aee48bc00ae80448ee9c93a81f',
      knownVenueOrderId: null,
      sourceStateHash: 'source-ioc',
      strategyDecisionHash: 'decision-ioc',
      createdAt: 10_000,
    });
    Journal.prepare(intent);
    Journal.transition(intent.intentId, 'SUBMIT_UNKNOWN', 10_001);
    const proof = {
      intentId: intent.intentId,
      reconciliationState: 'FULL_FILL',
      terminalStatus: 'APPLIED' as const,
      source: 'APTOS_FULLNODE_TX_AND_AUTHENTICATED_FILL',
      matchedIdentifier: `clientOrderId:${intent.clientOrderId}`,
      venueStatus: 'FILLED',
      remainingQuantity: 0,
      transactionHash: '0xproven',
      venueOrderId: 'venue-ioc',
      clientOrderId: intent.clientOrderId,
      observedAt: 10_002,
      fill: { fillId: 'fill-ioc', quantity: 0.00003, price: 81_458.9, transactionVersion: '123' },
    };
    Journal.applyAuthoritativeReconciliation(proof);
    Journal.close();
    const Restarted = new decibel_execution_lifecycle_journal_v1(path);
    Restarted.applyAuthoritativeReconciliation(proof);
    expect(Restarted.get(intent.intentId)).toMatchObject({
      status: 'APPLIED',
      venueOrderId: 'venue-ioc',
    });
    expect(Restarted.nonTerminal()).toHaveLength(0);
    const DatabaseReader = new Database(path, { readonly: true });
    expect(
      DatabaseReader.prepare(
        'SELECT COUNT(*) count FROM reconciliation_fill_provenance WHERE intent_id=?',
      ).get(intent.intentId),
    ).toMatchObject({ count: 1 });
    expect(
      DatabaseReader.prepare(
        'SELECT COUNT(*) count FROM reconciliation_provenance WHERE intent_id=?',
      ).get(intent.intentId),
    ).toMatchObject({ count: 1 });
    DatabaseReader.close();
    Restarted.close();
  });

  it('surfaces persisted unresolvable acknowledgement recovery at the production start gate', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'web-start-unresolvable-')), 'journal.sqlite');
    const Journal = new decibel_execution_lifecycle_journal_v1(path);
    const intent = Object.freeze({
      ...buildDecibelExecutionIntentV1({
        sessionId: 'crashed-session',
        cycleSequence: 1,
        action: 'PLACE',
        market: 'BTC/USD',
        side: 'BUY',
        price: 77_211.3,
        quantity: 0.00014,
        tickSize: 0.1,
        lotSize: 0.00001,
        clientOrderId: 'd1bf9dbd234f853b35c637190f38ba93',
        knownVenueOrderId: null,
        sourceStateHash: 'crash-source',
        strategyDecisionHash: 'crash-decision',
        createdAt: 10_000,
      }),
      intentId: 'intent-f9dbd234f853b35c637190f3',
    });
    Journal.prepare(intent);
    Journal.transition(intent.intentId, 'ACKNOWLEDGED', 10_001, 'venue-disappeared');
    Journal.markUnresolvableAcknowledgement(intent.intentId, 10_100);
    Journal.close();

    const history = readDecibelProductionWebHistoryV1(path, 100, 10_200);
    const telemetry = mapDecibelProductionWebTelemetryV1({
      snapshot: makeSnapshot(),
      history,
      configuration,
      startedAt: 1_000,
      generatedAt: 10_200,
      lastSuccessfulCycleAt: 10_200,
      connectionError: null,
    });
    const presentation = deriveDashboardPresentationV1({
      connected: true,
      degraded: telemetry.degraded,
      runtimeState: telemetry.runtime.state,
      dryRun: telemetry.runtime.dryRun,
      blockers: telemetry.blockers,
      intents: telemetry.intents,
      events: telemetry.events,
    });
    const alerts = buildOperatorAlertsV1({
      now: telemetry.generatedAt,
      connected: true,
      degraded: telemetry.degraded,
      runtimeState: telemetry.runtime.state,
      blockers: telemetry.blockers,
      events: telemetry.events,
      sessionState: 'IDLE',
      sessionStopReason: null,
      lossUtilization: null,
    });
    const alert = selectHighestPriorityOperatorAlertV1(alerts.active);
    const startGate = deriveSessionStartGateV1({
      runtimeBlocked: presentation.abnormal,
      runtimeBlockCode: alert?.code ?? null,
      runtimeBlockMessage: alert?.message ?? null,
      capitalToUseUsd: 10,
      authenticatedAccountEquityUsd: 50,
    });

    expect(history.intents[0]?.status).toBe('UNRESOLVABLE_ACK');
    expect(telemetry.runtime.lifecycleBlocker).toBe('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
    expect(startGate).toMatchObject({
      blocked: true,
      code: 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
    });
    expect(startGate.message).toContain('Automatic reconciliation will retry');
  });
});

it('never substitutes a timestamp when authenticated ledger version is missing', () => {
  expect(requireDecibelFillTransactionVersionV1('7121446942')).toBe('7121446942');
  expect(() => requireDecibelFillTransactionVersionV1(undefined)).toThrow(
    'FILL_TRANSACTION_VERSION_REQUIRED',
  );
  expect(() => requireDecibelFillTransactionVersionV1('0')).toThrow();
});

describe('Read-only estimated NEXT SESSION capacity', () => {
  const settings = {
    capitalToUseUsd: 8,
    maxLossUsd: 2,
    targetMakerVolumeUsd: 50,
    orderNotionalUsd: 10,
    maxPositionUsd: 50,
  };
  const snapshot = makeSnapshot();
  const base = {
    settings,
    ready: true,
    now: 10000,
    safetyCeilingUsd: 1000,
    collateralFraction: 0.5,
    snapshot: {
      ...snapshot,
      maximumEffectiveLeverage: 40,
      availableMarginUsd: 10.22,
      input: {
        ...snapshot.input,
        actualInventoryBase: 0,
        openOrders: [],
        book: { bestBid: 79999, bestAsk: 80001, observedAt: 10000 },
        metadata: { ...snapshot.input.metadata, lotSize: 0.00001 },
      },
    },
    observations: {
      accountObservedAt: 10000,
      marketObservedAt: 10000,
      maximumAgeMs: 5000,
      actualLeverage: 40,
      venueMaximumLeverage: 40,
      equityUsd: 10.22,
      maintenanceMarginUsd: 0,
      marginDeficitUsd: 0,
      liquidationPrice: null,
      bids: [{ price: 79999, size: 1 }],
      asks: [{ price: 80001, size: 1 }],
      recentMidpoints: [80000],
    },
  };
  it.each([50, 100, 200, 1000, 5000])(
    'labels target %s preview as estimated without publishing executable capacity',
    (target) => {
      const before = JSON.stringify(base);
      const estimate = estimateDecibelNextSessionPositionLimitV1({
        ...base,
        settings: { ...settings, targetMakerVolumeUsd: target },
      });
      expect(estimate).toMatchObject({
        classification: 'ESTIMATED',
        estimatedPositionLimitUsd: expect.closeTo(121.6, 6) as number,
        blocker: null,
      });
      expect(estimate.assumptions.modeledExitHorizonMs).toBe(30000);
      expect(
        projectDecibelNextSessionPositionLimitV1({
          settings,
          snapshot: base.snapshot,
          accountReady: true,
          marketReady: true,
          venueMaximumNotionalUsd: 1000,
          maximumAggregateCollateralFraction: 0.5,
        }),
      ).toBeNull();
      expect(JSON.stringify(base)).toBe(before);
    },
  );
  // Max Loss bounds the risk capacity (DCA, unwind), not the position limit.
  it.each([
    [1, 121.6],
    [2, 121.6],
    [3, 121.6],
    [5, 121.6],
  ])('keeps the position limit independent of Max Loss %s and target', (maxLossUsd, expected) => {
    for (const targetMakerVolumeUsd of [50, 100, 200, 1000, 5000]) {
      const result = estimateDecibelNextSessionPositionLimitV1({
        ...base,
        settings: { ...settings, maxLossUsd, targetMakerVolumeUsd },
      });
      expect(result.estimatedPositionLimitUsd).toBeCloseTo(expected);
      expect(result.blocker).toBeNull();
      expect(settings.maxLossUsd).toBe(2);
    }
  });
  it('reacts to draft capital/loss without mutating saved or active snapshots', () => {
    for (const draft of [{ ...settings, capitalToUseUsd: 4 }]) {
      expect(
        estimateDecibelNextSessionPositionLimitV1({ ...base, settings: draft })
          .estimatedPositionLimitUsd,
      ).toBeLessThan(121.6);
    }
    expect(settings.capitalToUseUsd).toBe(8);
    expect(settings.maxLossUsd).toBe(2);
  });
  it('preserves UNKNOWN when freshness, authenticated leverage or account evidence is missing', () => {
    for (const change of [
      { ready: false },
      { now: 20000 },
      { observations: null },
      { observations: { ...base.observations, actualLeverage: null } },
      { observations: { ...base.observations, maintenanceMarginUsd: null } },
      { snapshot: { ...base.snapshot, availableMarginUsd: Number.NaN } },
    ]) {
      expect(
        estimateDecibelNextSessionPositionLimitV1({ ...base, ...change }).estimatedPositionLimitUsd,
      ).toBeNull();
    }
  });
});

describe('Next session projection uses the execution cap calculator without changing active state', () => {
  const settings = {
    capitalToUseUsd: 8,
    maxLossUsd: 2,
    targetMakerVolumeUsd: 50,
    orderNotionalUsd: 10,
    maxPositionUsd: 50,
  };
  const practicalSnapshot = () => {
    const base = makeSnapshot();
    const now = Date.now();
    return {
      ...base,
      maximumEffectiveLeverage: 40,
      availableMarginUsd: 10.22,
      accountMetrics: { ...base.accountMetrics, collateralUsd: 10.22 },
      input: {
        ...base.input,
        now,
        actualInventoryBase: 0,
        openOrders: [],
        metadata: { ...base.input.metadata, lotSize: 0.00001 },
        book: { ...base.input.book, bestBid: 79999, bestAsk: 80001 },
      },
      practicalCapacityInputs: {
        accountObservedAt: now,
        marketObservedAt: now,
        maximumAgeMs: 5000,
        actualLeverage: 40,
        venueMaximumLeverage: 40,
        maintenanceMarginUsd: 0,
        marginDeficitUsd: 0,
        equityUsd: 10.22,
        liquidationPrice: null,
        bids: [{ price: 79999, size: 1 }],
        asks: [{ price: 80001, size: 1 }],
        recentMidpoints: [80000],
        venueMarginRules: {
          observedAt: now,
          ledgerVersion: '123',
          maximumLeverage: 40,
          maintenanceMultiplier: 1,
          maintenanceDivisor: 2,
          markPrice: 80000,
          markObservedAt: now,
          remainingOpenInterestBase: 100,
          sizeModel: 'FIXED_LEVERAGE_V1' as const,
        },
      },
    };
  };
  const project = (target = 50, capital = 8, loss = 2, ready = true, margin = 10.22) => {
    const snapshot = practicalSnapshot();
    return projectDecibelNextSessionPositionLimitV1({
      settings: {
        ...settings,
        targetMakerVolumeUsd: target,
        capitalToUseUsd: capital,
        maxLossUsd: loss,
      },
      snapshot: { ...snapshot, maximumEffectiveLeverage: 40, availableMarginUsd: margin },
      accountReady: ready,
      marketReady: ready,
      venueMaximumNotionalUsd: 100,
      maximumAggregateCollateralFraction: 0.5,
    });
  };
  it.each([
    [50, 121.6],
    [200, 121.6],
    [1000, 121.6],
  ])('projects target %s from fresh evidence', (target, expected) => {
    expect(project(target)).toBeCloseTo(expected);
  });
  it('reacts to draft capital/loss and fails closed on unavailable evidence', () => {
    expect(project(200, 1, 1)).toBeCloseTo(15.2);
    // Max Loss does not change the position limit.
    expect(project(200, 8, 0.1)).toBeCloseTo(project(200)!);
    expect(project(50, 8, 2, false)).toBe(null);
    expect(project(50, 8, 2, true, Number.NaN)).toBe(null);
    const snapshot = practicalSnapshot();
    expect(
      projectDecibelNextSessionPositionLimitV1({
        settings,
        snapshot: { ...snapshot, maximumEffectiveLeverage: Number.NaN },
        accountReady: true,
        marketReady: true,
        venueMaximumNotionalUsd: 100,
        maximumAggregateCollateralFraction: 0.5,
      }),
    ).toBe(null);
    expect(settings.targetMakerVolumeUsd).toBe(50);
  });
  it('starts V2 projection at zero executed volume and does not reuse the active cap', () => {
    const base = practicalSnapshot();
    const snapshot = {
      ...base,
      maximumEffectiveLeverage: 40,
      sessionConfiguration: {
        revision: 2,
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        targetMakerVolumeUsd: 50,
        maxPositionUsd: 50,
        marginUsedUsd: 0,
        makerVolumeUsd: 49.78,
        totalExecutedVolumeUsd: 49.78,
        pnlUsd: 0,
        riskBlocker: null,
        exposureLimits: {
          configuredMaximumPositionUsd: 50,
          effectivePositionLimitUsd: 0,
          currentExposureUsd: 0,
          pendingExposureUsd: 0,
          availableHeadroomUsd: 0,
        },
      },
    };
    expect(
      projectDecibelNextSessionPositionLimitV1({
        settings,
        snapshot,
        accountReady: true,
        marketReady: true,
        venueMaximumNotionalUsd: 100,
        maximumAggregateCollateralFraction: 0.5,
      }),
    ).toBeCloseTo(121.6);
    expect(snapshot.sessionConfiguration.exposureLimits.effectivePositionLimitUsd).toBe(0);
  });
});

describe('Authenticated refresh forward progress', () => {
  it('releases ownership after synchronous and asynchronous failures', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    for (const read of [
      () => {
        throw new Error('SYNC');
      },
      () => Promise.reject(new Error('TRANSIENT')),
    ]) {
      await expect(Supervisor.runAuthenticatedRefresh(read)).rejects.toThrow();
      expect(Supervisor.isAuthenticatedRefreshInFlight()).toBe(false);
    }
    await expect(
      Supervisor.runAuthenticatedRefresh(() => Promise.resolve('RECOVERED')),
    ).resolves.toBe('RECOVERED');
  });
  it('times out, retries on the recurring scheduler, and fences late publication with both sides resting', async () => {
    vi.useFakeTimers();
    const Supervisor = new decibel_runtime_supervisor_v1();
    try {
      let release!: () => void;
      let attempts = 0;
      let completed = 0;
      const resting = { positionBase: 0.001, openOrders: ['BUY_RESTING', 'SELL_RESTING'] };
      const read = (signal: AbortSignal) => {
        attempts++;
        return (
          attempts === 1
            ? new Promise<void>((resolve) => {
                release = resolve;
              })
            : Promise.resolve()
        ).then(() => {
          signal.throwIfAborted();
          Supervisor.setAuthenticatedSnapshot(Date.now(), 5000, resting);
          completed++;
        });
      };
      Supervisor.scheduleRecurring(
        'test-control-cycle',
        20,
        () => Supervisor.runAuthenticatedRefresh(read, 10).catch(() => undefined),
        0,
      );
      await vi.advanceTimersByTimeAsync(1);
      const shared = Supervisor.runAuthenticatedRefresh(read, 10);
      const timedOut = expect(shared).rejects.toThrow('PRODUCTION_AUTHENTICATED_READ_TIMEOUT');
      expect(attempts).toBe(1);
      await vi.advanceTimersByTimeAsync(10);
      await timedOut;
      expect(Supervisor.isAuthenticatedRefreshInFlight()).toBe(false);
      await vi.advanceTimersByTimeAsync(10);
      expect(completed).toBe(1);
      expect(attempts).toBe(2);
      expect(Supervisor.getAuthenticatedSnapshot()).toEqual(resting);
      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(completed).toBe(1);
      expect(Supervisor.getAuthenticatedSnapshot()).toEqual(resting);
    } finally {
      Supervisor.stopScheduler();
      vi.useRealTimers();
    }
  });
  it('aborts a pending refresh on shutdown and releases the in-flight owner', async () => {
    const Supervisor = new decibel_runtime_supervisor_v1();
    let signal: AbortSignal | undefined;
    const pending = Supervisor.runAuthenticatedRefresh((s) => {
      signal = s;
      return new Promise(() => undefined);
    });
    await Promise.resolve();
    Supervisor.stopScheduler();
    await expect(pending).rejects.toThrow('PRODUCTION_AUTHENTICATED_READ_SHUTDOWN');
    expect(signal?.aborted).toBe(true);
    expect(Supervisor.isAuthenticatedRefreshInFlight()).toBe(false);
  });
});

it('degrades instead of throwing when the reduction capacity is from another read batch', () => {
  // Live 2026-11-13 20:30: an exit capacity observed in a different read than the account
  // made evaluateTradingDecision throw REDUCTION_CAPACITY_BATCH_MISMATCH inside telemetry,
  // which terminated the process.
  const base = makeSnapshot();
  const snapshot: decibel_production_live_snapshot_v1 = {
    ...base,
    authenticatedPositions: [
      { market: 'BTC/USD', size: 0.0012, source: 'BOT', entryPrice: 79_000 },
    ],
    reductionCapacity: {
      maximumQuantityBtc: 0.0012,
      venueMaximumOrderNotionalUsd: null,
      observedAt: 1,
    },
    input: { ...base.input, actualInventoryBase: 0.0012 },
  };
  const context = {
    now: 10_001,
    sessionId: 'session',
    state: 'RUNNING' as const,
    candidate: { side: 'SELL' as const, price: 80_100, quantity: 0.0012, reduceOnly: true },
  };
  expect(() => evaluateTradingDecision(snapshot, context)).toThrow(
    'REDUCTION_CAPACITY_BATCH_MISMATCH',
  );
  const projected = projectDecibelTelemetryTradingDecisionV1(snapshot, context);
  expect(projected.state).not.toBe('TRADE');
  expect(projected.bidEligible || projected.askEligible).toBe(false);
});

it('reports an overdue control loop unhealthy even while its scheduler is running', () => {
  const input = {
    snapshot: null,
    history: readDecibelProductionWebHistoryV1('missing-health-journal.sqlite'),
    configuration,
    startedAt: 1,
    generatedAt: 38 * 60 * 1000,
    lastSuccessfulCycleAt: 1000,
    connectionError: 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    execution: {
      running: true,
      sessionId: 'session',
      cycles: 1,
      lastAction: 'HOLD',
      blocker: 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    },
  };
  expect(mapDecibelProductionWebTelemetryV1(input).runtime).toMatchObject({
    executionLoopRunning: true,
    executionLoopHealthy: false,
  });
  expect(
    mapDecibelProductionWebTelemetryV1({ ...input, lastSuccessfulCycleAt: input.generatedAt })
      .runtime.executionLoopHealthy,
  ).toBe(true);
});

describe('Automatic late ACK session finalization', () => {
  it.each(['FILLED', 'CANCELLED'] as const)(
    'retries late %s evidence and starts session B in the same process',
    async (state) => {
      vi.useFakeTimers();
      vi.setSystemTime(10_000);
      const root = mkdtempSync(join(tmpdir(), 'automatic-session-handoff-'));
      const Journal = new decibel_execution_lifecycle_journal_v1(join(root, 'journal.sqlite'));
      const Sessions = new decibel_production_session_store_v1(join(root, 'sessions.sqlite'));
      const Settings = new decibel_operator_settings_store_v1(join(root, 'settings.json'), {
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        targetMakerVolumeUsd: -1,
        orderNotionalUsd: 10,
        maxPositionUsd: 50,
      });
      const Supervisor = new decibel_runtime_supervisor_v1();
      const Controller = new decibel_production_session_controller_v1(
        Sessions,
        Settings,
        () =>
          Promise.resolve({
            activate: () => undefined,
            stop: () => Promise.resolve({ safeToEnd: false, blocker: 'WAITING_TERMINAL' }),
          }),
        Date.now,
        () => {
          if (Journal.nonTerminal().length)
            throw new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
        },
      );
      try {
        const A = await Controller.start(0);
        const intent = buildDecibelExecutionIntentV1({
          sessionId: A.sessionId,
          cycleSequence: 1,
          action: 'PLACE',
          market: 'BTC/USD',
          side: 'BUY',
          price: 80000,
          quantity: 0.00014,
          tickSize: 0.1,
          lotSize: 0.00001,
          clientOrderId: 'late-session-client',
          knownVenueOrderId: null,
          sourceStateHash: 'late-session',
          strategyDecisionHash: 'late-session',
          createdAt: 10000,
        });
        Journal.prepare(intent);
        Journal.transition(intent.intentId, 'ACKNOWLEDGED', 10001, 'late-session-order');
        Controller.requestUnwind(A.sessionId, 'TARGET_REACHED');
        const snapshot = makeSnapshot();
        let stage: 'TRANSIENT' | 'MISSING' | 'OPEN' | 'TERMINAL' = 'TRANSIENT';
        const legacyLookup = vi.fn(() =>
          stage === 'OPEN'
            ? Promise.resolve('ORDER_OPEN' as const)
            : Promise.reject(new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK')),
        );
        const Source = {
          readAuthenticatedSnapshot: () => Promise.resolve(snapshot),
          reconcileIntent: legacyLookup,
          readOrderIdentityEvidence: () =>
            stage === 'TRANSIENT'
              ? Promise.reject(new Error('PRODUCTION_AUTHENTICATED_READ_TRANSIENT'))
              : Promise.resolve({
                  observedAt: Date.now(),
                  openOrders: [],
                  terminalOrders:
                    stage === 'TERMINAL'
                      ? [
                          {
                            venueOrderId: 'late-session-order',
                            clientOrderId: intent.clientOrderId,
                            state,
                            side: 'BUY' as const,
                            originalQuantity: intent.quantity,
                            remainingQuantity: 0,
                          },
                        ]
                      : [],
                  fills: [],
                  transactionState: 'COMMITTED' as const,
                }),
        };
        let errors = 0;
        Supervisor.scheduleRecurring(
          'canonical-finalization',
          100,
          async () => {
            if (Sessions.getActive() === null) return;
            try {
              await reconcileAllDecibelAcknowledgedOrdersV1(Journal, Source, snapshot);
              finalizeDecibelVerifiedSessionV1(snapshot, Journal.nonTerminal().length, () => {
                Controller.completeUnwind(
                  A.sessionId,
                  { finalPositionBase: 0, unresolvedExecutionCount: 0, finalBotState: 'ENDED' },
                  'TARGET_REACHED',
                );
              });
            } catch {
              errors++;
            }
          },
          0,
        );
        await vi.advanceTimersByTimeAsync(1);
        expect(errors).toBe(1);
        expect(Sessions.get(A.sessionId)?.status).toBe('STOPPING');
        stage = 'MISSING';
        await vi.advanceTimersByTimeAsync(100);
        expect(Journal.get(intent.intentId)?.status).toBe('UNRESOLVABLE_ACK');
        expect(Sessions.getActive()?.sessionId).toBe(A.sessionId);
        stage = 'OPEN';
        await vi.advanceTimersByTimeAsync(100);
        expect(Journal.get(intent.intentId)?.status).toBe('ACKNOWLEDGED');
        expect(Sessions.get(A.sessionId)?.status).toBe('STOPPING');
        stage = 'TERMINAL';
        await vi.advanceTimersByTimeAsync(100);
        expect(Sessions.get(A.sessionId)?.status).toBe('ENDED');
        expect(Sessions.getActive()).toBeNull();
        expect(Journal.nonTerminal()).toEqual([]);
        expect(Journal.getLatestReconciliationProvenance(intent.intentId)?.venueStatus).toBe(state);
        // Fresh exact terminal proof succeeds although the older history lookup still fails.
        expect(legacyLookup).toHaveBeenCalledTimes(2);
        const B = await Controller.start(0);
        expect(B.sessionId).not.toBe(A.sessionId);
        expect(B.status).toBe('RUNNING');
        expect(B.makerVolumeUsd).toBeNull();
        expect(Journal.getSessionFills(B.sessionId)).toEqual([]);
        const limits = deriveDecibelSessionTradingLimitsV1({
          settings: B.configSnapshot,
          venueAvailableMarginUsd: 6,
          positionBase: 0,
          openOrders: [],
          midpoint: 80000,
          maximumEffectiveLeverage: 40,
          venueMaximumNotionalUsd: 100,
          maximumAggregateCollateralFraction: 0.5,
        });
        expect(limits.marginUsedUsd).toBe(0);
        expect(limits.availableMarginUsd).toBe(6);
        expect(limits.strategyAllocationRemainingUsd).toBeGreaterThan(0);
        expect(Journal.get(intent.intentId)?.status).toBe(
          state === 'FILLED' ? 'APPLIED' : 'CANCELLED_EXTERNALLY',
        );
      } finally {
        Supervisor.stopScheduler();
        Journal.close();
        Sessions.close();
        vi.useRealTimers();
      }
    },
  );
  it('does not tear down completion ownership when persistence rejects, or finalize non-flat/open state', () => {
    const snapshot = makeSnapshot();
    const complete = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('PERSISTENCE_TRANSIENT');
      })
      .mockReturnValue(undefined);
    expect(() => finalizeDecibelVerifiedSessionV1(snapshot, 0, complete)).toThrow(
      'PERSISTENCE_TRANSIENT',
    );
    expect(finalizeDecibelVerifiedSessionV1(snapshot, 0, complete)).toBe(true);
    expect(finalizeDecibelVerifiedSessionV1(snapshot, 1, complete)).toBe(false);
    expect(
      finalizeDecibelVerifiedSessionV1(
        { ...snapshot, input: { ...snapshot.input, actualInventoryBase: 0.00001 } },
        0,
        complete,
      ),
    ).toBe(false);
    const open = {
      venueOrderId: 'still-open',
      clientOrderId: 'still-open',
      strategyConfigId: snapshot.input.strategyConfigId,
      market: snapshot.input.market,
      side: 'BUY' as const,
      price: 80000,
      quantity: 0.00014,
      reduceOnly: false,
      postOnly: true,
      timeInForce: 'PostOnly' as const,
      orderType: 'LIMIT' as const,
    };
    expect(
      finalizeDecibelVerifiedSessionV1(
        { ...snapshot, input: { ...snapshot.input, openOrders: [open] } },
        0,
        complete,
      ),
    ).toBe(false);
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it('treats prior quote headroom separately from new-session capital admission and reports exact rejection', () => {
    const input = {
      runtimeBlocked: true,
      runtimeBlockCode: 'NO_NEW_QUOTE_HEADROOM',
      runtimeBlockMessage: 'old quote gate',
      capitalToUseUsd: 8,
      authenticatedAccountEquityUsd: 10.22,
    };
    expect(deriveSessionStartGateV1(input).blocked).toBe(false);
    expect(deriveSessionStartGateV1({ ...input, authenticatedAccountEquityUsd: 5 }).blocked).toBe(
      false,
    );
    expect(() => validateDecibelCapitalAllocationV1(8, 5)).toThrow(
      'CAPITAL_TO_USE_EXCEEDS_AUTHENTICATED_ACCOUNT_EQUITY',
    );
    expect(
      deriveSessionStartGateV1({
        ...input,
        runtimeBlockCode: 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
      }).blocked,
    ).toBe(true);
    expect(
      formatSessionStartResponseV1(false, { error: 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK' }),
    ).toBe('SESSION START REJECTED: PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
    expect(
      formatSessionStartResponseV1(true, {
        status: 'ENDED',
        stopReason: 'TARGET_UNREACHABLE_MINIMUM_ORDER',
      }),
    ).toBe('SESSION ENDED: TARGET_UNREACHABLE_MINIMUM_ORDER');
  });
});

it('preserves partially filled acknowledged ownership until actual terminal evidence', async () => {
  const Journal = new decibel_execution_lifecycle_journal_v1(
    join(mkdtempSync(join(tmpdir(), 'partial-ack-owner-')), 'journal.sqlite'),
  );
  try {
    const intent = buildDecibelExecutionIntentV1({
      sessionId: 'partial-session',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 80000,
      quantity: 0.00014,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'partial-client',
      knownVenueOrderId: null,
      sourceStateHash: 'partial',
      strategyDecisionHash: 'partial',
      createdAt: 1,
    });
    Journal.prepare(intent);
    Journal.transition(intent.intentId, 'ACKNOWLEDGED', 2, 'partial-order');
    const snapshot = makeSnapshot();
    const Source = {
      readAuthenticatedSnapshot: () => Promise.resolve(snapshot),
      reconcileIntent: () => Promise.resolve('PARTIAL_FILL' as const),
    };
    await reconcileAllDecibelAcknowledgedOrdersV1(Journal, Source, snapshot);
    expect(Journal.get(intent.intentId)?.status).toBe('ACKNOWLEDGED');
    expect(Journal.nonTerminal()).toHaveLength(1);
    expect(
      finalizeDecibelVerifiedSessionV1(snapshot, Journal.nonTerminal().length, () => {
        throw new Error('MUST_NOT_FINALIZE');
      }),
    ).toBe(false);
  } finally {
    Journal.close();
  }
});

describe('Independent position safety status', () => {
  it.each([0, 0.00003, 0.0001])(
    'separates verified protective availability from historical entry readiness (%s)',
    (covered) => {
      const snapshot = makeSnapshot();
      const status = deriveDecibelPositionSafetyStatusV1({
        snapshot: {
          ...snapshot,
          input: {
            ...snapshot.input,
            actualInventoryBase: 0.0001,
            openOrders:
              covered === 0
                ? []
                : [
                    {
                      venueOrderId: 'tp',
                      clientOrderId: 'tp-client',
                      strategyConfigId: snapshot.input.strategyConfigId,
                      market: snapshot.input.market,
                      side: 'SELL',
                      price: 81000,
                      quantity: covered,
                      reduceOnly: true,
                    },
                  ],
          },
        },
        now: 10000,
        executionOperational: true,
        entryReady: true,
        recoveryBlocker: 'HISTORICAL_FINALITY_UNAVAILABLE',
        executionBlocker: null,
        independentRecoveryVerified: true,
      });
      expect(status.newEntryReady).toBe(false);
      expect(status.protectiveAction).toBe(
        covered === 0.0001
          ? 'MONITOR_CONFIRMED_TP'
          : covered > 0
            ? 'REPAIR_CAPABILITY_UNVERIFIED_EXISTING_TP_PRESERVED'
            : 'REQUIRES_INDEPENDENT_ACTION_VALIDATION',
      );
      expect(status.recoveryBlocker).toBe('HISTORICAL_FINALITY_UNAVAILABLE');
      expect(status.actionBlocker).toBeNull();
    },
  );

  it('retains the specific historical recovery failure beside independently authenticated position status', () => {
    const telemetry = mapDecibelProductionWebTelemetryV1({
      snapshot: makeSnapshot(),
      history: readDecibelProductionWebHistoryV1('missing-recovery-status-journal.sqlite'),
      configuration,
      startedAt: 1,
      generatedAt: 10000,
      lastSuccessfulCycleAt: null,
      connectionError: 'PRODUCTION_RECOVERY_INITIALIZATION_REQUIRED',
      recoveryBlocker: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
      dependencies: { recovery: 'BLOCKED', authenticatedState: 'READY', economic: 'READY' },
    });
    expect(telemetry.runtime.positionSafety).toMatchObject({
      positionStatus: 'FLAT',
      confirmedExitQuantity: 0,
      uncoveredQuantity: 0,
      recoveryBlocker: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
      newEntryReady: false,
    });
  });
  it.each([0, 0.00003, 0.0001])(
    'reports confirmed and uncovered inventory during recovery (%s)',
    (covered) => {
      const snapshot = makeSnapshot();
      const status = deriveDecibelPositionSafetyStatusV1({
        snapshot: {
          ...snapshot,
          input: {
            ...snapshot.input,
            actualInventoryBase: 0.0001,
            openOrders:
              covered === 0
                ? []
                : [
                    {
                      venueOrderId: 'tp',
                      clientOrderId: 'tp-client',
                      strategyConfigId: snapshot.input.strategyConfigId,
                      market: snapshot.input.market,
                      side: 'SELL',
                      price: 81000,
                      quantity: covered,
                      reduceOnly: true,
                    },
                  ],
          },
        },
        now: 10000,
        executionOperational: false,
        entryReady: true,
        recoveryBlocker: 'HISTORICAL_JOURNAL_RECONCILIATION',
        executionBlocker: null,
      });
      expect(status).toMatchObject({
        positionStatus: 'LONG',
        confirmedExitQuantity: covered,
        uncoveredQuantity: Number((0.0001 - covered).toFixed(8)),
        newEntryReady: false,
        protection: covered === 0.0001 ? 'CONFIRMED_COVERED' : 'UNPROTECTED',
        protectiveAction: 'BLOCKED_RECOVERY',
      });
    },
  );
  it.each(['STALE', 'WRONG_ACCOUNT', 'OUTAGE'] as const)(
    'does not claim protection with %s evidence',
    (condition) => {
      const snapshot = makeSnapshot();
      const status = deriveDecibelPositionSafetyStatusV1({
        snapshot:
          condition === 'OUTAGE'
            ? null
            : {
                ...snapshot,
                input: {
                  ...snapshot.input,
                  authenticatedSubaccount:
                    condition === 'WRONG_ACCOUNT'
                      ? 'wrong'
                      : snapshot.input.authenticatedSubaccount,
                },
              },
        now: condition === 'STALE' ? 100000 : 10000,
        executionOperational: true,
        entryReady: true,
        recoveryBlocker: null,
        executionBlocker: null,
      });
      expect(status).toMatchObject({
        positionStatus: 'UNKNOWN',
        confirmedExitQuantity: null,
        uncoveredQuantity: null,
        protection: 'UNKNOWN',
        protectiveAction: 'BLOCKED_EVIDENCE',
        newEntryReady: false,
      });
    },
  );
});

describe('Historical partial-fill CANCEL startup recovery', () => {
  it.each([
    'CANCELLED',
    'LATE_FILL',
    'NONFINAL_CANCEL',
    'UNKNOWN',
    'MISMATCH',
    'WRONG_ORDER',
    'OUTAGE',
  ] as const)('uses PLACE lineage and preserves finality gates: %s', async (scenario) => {
    const copy = process.env.DECIBEL_RECOVERY_REPLAY_JOURNAL_COPY;
    if (copy && resolve(copy) === resolve('data/decibel_execution_v1.sqlite'))
      throw new Error('REPLAY_REQUIRES_ISOLATED_COPY');
    const journalPath =
      copy ?? join(mkdtempSync(join(tmpdir(), 'cancel-startup-')), 'journal.sqlite');
    const Journal = new decibel_execution_lifecycle_journal_v1(journalPath);
    try {
      if (!copy) {
        const common = {
          sessionId: 'historical',
          market: 'BTC/USD' as const,
          side: 'BUY' as const,
          price: 80473.5,
          tickSize: 0.1,
          lotSize: 0.00001,
          clientOrderId: 'historical-client',
          sourceStateHash: 'source',
          strategyDecisionHash: 'decision',
        };
        const place = buildDecibelExecutionIntentV1({
          ...common,
          action: 'PLACE',
          cycleSequence: 1,
          quantity: 0.00013,
          createdAt: 1000,
          knownVenueOrderId: null,
        });
        Journal.prepare(place);
        Journal.transition(place.intentId, 'ACKNOWLEDGED', 1001, 'historical-order');
        Journal.transition(place.intentId, 'CANCELLED_EXTERNALLY', 2002, 'historical-order');
        const cancel = buildDecibelExecutionIntentV1({
          ...common,
          action: 'CANCEL',
          cycleSequence: 2,
          quantity: 0.0001,
          createdAt: 2000,
          knownVenueOrderId: 'historical-order',
          cancelReason: 'INVENTORY_INVALID:INVENTORY_EXIT_COVERAGE_REQUIRED',
        });
        Journal.prepare(cancel);
        Journal.transition(cancel.intentId, 'ACKNOWLEDGED', 2001, 'historical-order');
      }
      const pending = Journal.nonTerminal().find(
        (row) => Journal.getIntent(row.intentId)?.action === 'CANCEL',
      );
      expect(pending).toBeDefined();
      const cancel = Journal.getIntent(pending!.intentId)!;
      const place = Journal.getOrderLineageByVenueOrderId(pending!.venueOrderId!)
        .map((row) => Journal.getIntent(row.intentId))
        .find((body) => body?.action === 'PLACE')!;
      expect(place.quantity).toBe(0.00013);
      expect(cancel.quantity).toBe(0.0001);
      const snapshot = makeSnapshot();
      const Audit = new Database(journalPath, { readonly: true, fileMustExist: true });
      const countMutations = () =>
        Audit.prepare('SELECT COUNT(*) count FROM mutation_attempts').get();
      const countIntents = () =>
        Audit.prepare('SELECT COUNT(*) count FROM execution_intents').get();
      const mutationsBefore = countMutations();
      const intentsBefore = countIntents();
      Audit.close();
      const recoverSession = vi.fn(() => {
        if (Journal.nonTerminal().length) throw new Error('UNRESOLVED_JOURNAL');
        return Promise.resolve(1);
      });
      const Source = {
        readAuthenticatedSnapshot: () => Promise.resolve(snapshot),
        reconcileIntent: vi.fn(() =>
          Promise.reject(new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK')),
        ),
        readOrderIdentityEvidence: vi.fn((query: { createdAt: number }) => {
          expect(query.createdAt).toBe(place.createdAt);
          expect(query.createdAt).toBeLessThan(cancel.createdAt);
          if (scenario === 'OUTAGE') throw new Error('VENUE_UNAVAILABLE');
          return Promise.resolve({
            observedAt: cancel.createdAt + 10000,
            openOrders: [],
            transactionState: null,
            terminalOrders:
              scenario === 'UNKNOWN'
                ? []
                : [
                    {
                      venueOrderId:
                        scenario === 'WRONG_ORDER' ? 'wrong-order' : pending!.venueOrderId!,
                      clientOrderId: cancel.clientOrderId,
                      side: 'BUY' as const,
                      state: 'CANCELLED' as const,
                      originalQuantity: scenario === 'MISMATCH' ? 0.00014 : 0.00013,
                      remainingQuantity: scenario === 'NONFINAL_CANCEL' ? 0.0001 : 0,
                    },
                  ],
            fills: [
              {
                venueFillId: copy ? '129260825583338352264272522248193' : 'replay-partial-fill',
                quantity: scenario === 'LATE_FILL' ? 0.00012 : 0.00003,
                price: 80473.5,
                transactionTimestamp: copy ? 1793854309308 : cancel.createdAt - 1,
                transactionVersion: '7909291813',
              },
            ],
          });
        }),
      };
      const result = await convergeDecibelStartupRecoveryV1({
        ensureAuthenticated: () => Promise.resolve(),
        readAuthenticatedSnapshot: () => Promise.resolve(snapshot),
        reconcileJournal: async () => {
          reconcileDecibelAcknowledgedTerminalOrdersV1(Journal, snapshot);
          await reconcileAllDecibelAcknowledgedOrdersV1(Journal, Source, snapshot);
        },
        recoverSession,
      });
      if (scenario === 'CANCELLED' || scenario === 'LATE_FILL') {
        expect(result).toEqual({ result: 'RECOVERED', blocker: null });
        expect(Journal.get(pending!.intentId)?.status).toBe('CANCELLED_EXTERNALLY');
        expect(Journal.nonTerminal()).toHaveLength(0);
        expect(Source.reconcileIntent).not.toHaveBeenCalled();
        await reconcileAllDecibelAcknowledgedOrdersV1(Journal, Source, snapshot);
        expect(Source.readOrderIdentityEvidence).toHaveBeenCalledTimes(1);
        const After = new Database(journalPath, { readonly: true, fileMustExist: true });
        try {
          expect(After.prepare('SELECT COUNT(*) count FROM mutation_attempts').get()).toEqual(
            mutationsBefore,
          );
          expect(After.prepare('SELECT COUNT(*) count FROM execution_intents').get()).toEqual(
            intentsBefore,
          );
          expect(
            After.prepare(
              'SELECT intent_id FROM reconciliation_fill_provenance WHERE fill_id=?',
            ).get(copy ? '129260825583338352264272522248193' : 'replay-partial-fill'),
          ).toEqual({ intent_id: place.intentId });
        } finally {
          After.close();
        }
      } else {
        expect(result.result).toBe('BLOCKED');
        expect(Journal.nonTerminal().map((row) => row.intentId)).toContain(pending!.intentId);
        if (scenario === 'MISMATCH' || scenario === 'WRONG_ORDER')
          expect(result.blocker).toBe('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT');
      }
    } finally {
      Journal.close();
    }
  });
});

describe('PID 38288 exact terminal provenance startup replay', () => {
  const createIncident = () => {
    const root = mkdtempSync(join(tmpdir(), 'terminal-provenance-'));
    const Journal = new decibel_execution_lifecycle_journal_v1(join(root, 'journal.sqlite'));
    const order = '170141590376311906128769130109975134208';
    const client = 'd1sbfa7a98d86f6580c10d715c67745e';
    const intent = buildDecibelExecutionIntentV1({
      sessionId: 'session',
      cycleSequence: 350372,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'SELL',
      price: 78826.9,
      quantity: 0.00068,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: client,
      knownVenueOrderId: null,
      sourceStateHash: 'source',
      strategyDecisionHash: 'decision',
      createdAt: 1793306627110,
    });
    Journal.prepare(intent);
    Journal.transition(intent.intentId, 'ACKNOWLEDGED', 1793306633867, order);
    const prior = {
      intentId: intent.intentId,
      reconciliationState: 'CANCELLED_EXTERNALLY',
      terminalStatus: 'CANCELLED_EXTERNALLY' as const,
      source: 'AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION',
      matchedIdentifier: `venueOrderId:${order}`,
      venueStatus: 'CANCELLED_EXTERNALLY',
      remainingQuantity: null,
      transactionHash: '0xdeca4c615d026e80177cc38028ab1e61ce8f7d6c8e7d43d6ae6684cb103962e0',
      venueOrderId: order,
      clientOrderId: client,
      observedAt: 1793306634892,
    };
    Journal.recordOutcome(
      intent.intentId,
      {
        outcome: 'PLACE_ACKNOWLEDGED',
        venueOrderId: order,
        transactionHash: prior.transactionHash,
        expirationTimestampMs: 1793306727110,
      },
      1793306633867,
    );
    Journal.applyAuthoritativeReconciliation(prior);
    const snapshot = {
      ...makeSnapshot(),
      input: { ...makeSnapshot().input, actualInventoryBase: 0, openOrders: [] },
      terminalOrderEvidence: [
        {
          venueOrderId: order,
          clientOrderId: client,
          state: 'CANCELLED' as const,
          originalQuantity: 0.00068,
          remainingQuantity: 0,
        },
      ],
    };
    snapshot.input = { ...snapshot.input, now: 1793321315013 };
    const confirmation = {
      ...prior,
      source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
      venueStatus: 'CANCELLED',
      remainingQuantity: 0,
      observedAt: snapshot.input.now,
    };
    return { root, Journal, intent, order, client, snapshot, prior, confirmation };
  };

  it('strengthens the exact cancellation idempotently while JOURNAL_CLEAR remains true', () => {
    const f = createIncident();
    try {
      expect(f.Journal.nonTerminal()).toHaveLength(0);
      expect(reconcileDecibelAcknowledgedTerminalOrdersV1(f.Journal, f.snapshot)).toEqual([
        f.intent.intentId,
      ]);
      expect(f.Journal.getLatestReconciliationProvenance(f.intent.intentId)).toMatchObject({
        source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
        venueStatus: 'CANCELLED',
        remainingQuantity: 0,
        venueOrderId: f.order,
        clientOrderId: f.client,
        transactionHash: f.prior.transactionHash,
      });
      expect(reconcileDecibelAcknowledgedTerminalOrdersV1(f.Journal, f.snapshot)).toEqual([]);
      expect(f.Journal.nonTerminal()).toHaveLength(0);
    } finally {
      f.Journal.close();
    }
  });

  it.each([
    { field: 'clientOrderId', value: 'different-client' },
    { field: 'venueOrderId', value: 'different-order' },
    { field: 'transactionHash', value: 'different-transaction' },
    { field: 'remainingQuantity', value: 0.00001 },
    { field: 'source', value: 'UNTRUSTED_SOURCE' },
    { field: 'observedAt', value: 1793306634891 },
    { field: 'venueStatus', value: 'FILLED' },
  ])(
    'preserves the conflict guard for $field and exposes the exact identity',
    ({ field, value }) => {
      const f = createIncident();
      try {
        expect(() =>
          f.Journal.applyAuthoritativeReconciliation({ ...f.confirmation, [field]: value }),
        ).toThrow(`EXECUTION_AUTHORITATIVE_RECONCILIATION_CONFLICT:INVARIANT=`);
        expect(f.Journal.getLatestReconciliationProvenance(f.intent.intentId)?.venueStatus).toBe(
          'CANCELLED_EXTERNALLY',
        );
        expect(() =>
          f.Journal.applyAuthoritativeReconciliation({
            ...f.confirmation,
            clientOrderId: 'different-client',
          }),
        ).toThrow(`INTENT=${f.intent.intentId}`);
      } finally {
        f.Journal.close();
      }
    },
  );

  it('does not normalize a cancellation over contradictory filled quantity', () => {
    const f = createIncident();
    try {
      expect(() =>
        f.Journal.applyAuthoritativeReconciliation({
          ...f.confirmation,
          fills: [
            {
              fillId: 'unexpected-fill',
              quantity: 0.0001,
              price: 78826.9,
              transactionVersion: '1234',
            },
          ],
        }),
      ).toThrow('EXECUTION_AUTHORITATIVE_RECONCILIATION_CONFLICT');
      expect(f.Journal.getLatestReconciliationProvenance(f.intent.intentId)?.venueStatus).toBe(
        'CANCELLED_EXTERNALLY',
      );
    } finally {
      f.Journal.close();
    }
  });

  it('publishes only after reconciliation and recovers to IDLE without starting a session', async () => {
    const f = createIncident();
    const Supervisor = new decibel_runtime_supervisor_v1();
    const Sessions = new decibel_production_session_store_v1(join(f.root, 'sessions.sqlite'));
    const Settings = new decibel_operator_settings_store_v1(join(f.root, 'settings.json'), {
      capitalToUseUsd: 8,
      maxLossUsd: 3,
      targetMakerVolumeUsd: 500,
      orderNotionalUsd: 10,
      maxPositionUsd: 50,
    });
    const startRuntime = vi.fn(() =>
      Promise.resolve({ stop: () => Promise.resolve({ safeToEnd: true, blocker: null }) }),
    );
    const Controller = new decibel_production_session_controller_v1(
      Sessions,
      Settings,
      startRuntime,
    );
    const publish = vi.fn(() =>
      Supervisor.setAuthenticatedSnapshot(f.snapshot.input.now, 5000, f.snapshot),
    );
    try {
      const result = await convergeDecibelStartupRecoveryV1({
        ensureAuthenticated: () => {
          reconcileBeforeDecibelAuthenticatedPublicationV1(f.Journal, f.snapshot, publish);
          return Promise.resolve();
        },
        readAuthenticatedSnapshot: () => Promise.resolve(f.snapshot),
        reconcileJournal: () => {
          reconcileDecibelAcknowledgedTerminalOrdersV1(f.Journal, f.snapshot);
          return Promise.resolve();
        },
        recoverSession: () => Controller.recoverStartup(),
      });
      expect(result).toMatchObject({ result: 'NOT_REQUIRED', blocker: null });
      expect(Controller.getState()).toMatchObject({ state: 'IDLE', activeSession: null });
      expect(Supervisor.getAuthenticatedSnapshot()).toBe(f.snapshot);
      expect(startRuntime).not.toHaveBeenCalled();
      expect(Sessions.list()).toHaveLength(0);
    } finally {
      Sessions.close();
      f.Journal.close();
    }
  });

  it('does not clear an unrelated unknown submission while confirming the historical cancellation', () => {
    const f = createIncident();
    const pending = buildDecibelExecutionIntentV1({
      sessionId: 'session',
      cycleSequence: 350373,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 78000,
      quantity: 0.00013,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'unresolved-client',
      knownVenueOrderId: null,
      sourceStateHash: 'source',
      strategyDecisionHash: 'decision',
      createdAt: 1793321315000,
    });
    try {
      f.Journal.prepare(pending);
      f.Journal.transition(pending.intentId, 'SUBMIT_UNKNOWN', 1793321315001, 'unknown-venue');
      reconcileDecibelAcknowledgedTerminalOrdersV1(f.Journal, f.snapshot);
      expect(f.Journal.nonTerminal()).toMatchObject([
        { intentId: pending.intentId, status: 'SUBMIT_UNKNOWN' },
      ]);
      const Supervisor = new decibel_runtime_supervisor_v1();
      Supervisor.setDependency('recovery', 'READY');
      Supervisor.setAuthenticatedSnapshot(f.snapshot.input.now, 5000, f.snapshot);
      Supervisor.setReconciliationRequired(true, f.Journal.getExecutionReconciliationBlocker()!);
      expect(() => Supervisor.assertSessionStartReady(f.snapshot.input.now)).toThrow(
        'RECONCILIATION_REQUIRED',
      );
    } finally {
      f.Journal.close();
    }
  });

  it('leaves the prior published snapshot intact when terminal reconciliation fails', () => {
    const f = createIncident();
    const prior = { observedAt: 1000 };
    const Supervisor = new decibel_runtime_supervisor_v1();
    Supervisor.setAuthenticatedSnapshot(1000, 5000, prior);
    const snapshot = {
      ...f.snapshot,
      terminalOrderEvidence: [
        { ...f.snapshot.terminalOrderEvidence[0]!, clientOrderId: 'contradictory-client' },
      ],
    };
    const publish = vi.fn(() =>
      Supervisor.setAuthenticatedSnapshot(snapshot.input.now, 5000, snapshot),
    );
    try {
      expect(() =>
        reconcileBeforeDecibelAuthenticatedPublicationV1(f.Journal, snapshot, publish),
      ).toThrow('EXECUTION_AUTHORITATIVE_RECONCILIATION_CONFLICT');
      expect(publish).not.toHaveBeenCalled();
      expect(Supervisor.getAuthenticatedSnapshot()).toBe(prior);
      expect(f.Journal.nonTerminal()).toHaveLength(0);
    } finally {
      f.Journal.close();
    }
  });
});

describe('startup authenticated input boundaries', () => {
  const makeReader = (activeBTC: boolean, failOrders = false) =>
    ({
      readMarketMetadata: () =>
        Promise.resolve({
          ...makeSnapshot().input.metadata,
          symbol: 'BTC/USD',
          exchangeSymbol: 'BTC/USD',
          sizeDecimals: 8,
          priceDecimals: 2,
          maximumLeverage: 40,
          maximumOpenInterest: 100,
        }),
      readAccountOverview: () =>
        Promise.resolve({
          perp_equity_balance: 8,
          total_margin: 8,
          cross_available_to_trade: 1.4,
          unrealized_pnl: 0,
        }),
      readPositions: () =>
        Promise.resolve([
          {
            market: '0x96c3c2e77041264d082d03365e9c346fbc6be9c9428a401be8e70dcb60dc60c6',
            user: 'test-subaccount',
            size: -0.0229,
            entry_price: 2247.7,
          },
          ...(activeBTC
            ? [
                {
                  market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
                  user: 'test-subaccount',
                  size: 0.00128,
                  entry_price: 80493.810938,
                },
              ]
            : []),
        ]),
      readOpenOrders: () =>
        failOrders
          ? Promise.reject(new Error('HTTP Error 500: OPEN_ORDERS'))
          : Promise.resolve([
              {
                market: '0x96c3c2e77041264d082d03365e9c346fbc6be9c9428a401be8e70dcb60dc60c6',
                order_id: 'foreign-order',
                client_order_id: '',
                orig_size: 0.0229,
                remaining_size: 0.0229,
                price: 2247.7,
                is_buy: true,
              },
              ...(activeBTC
                ? [
                    {
                      market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
                      order_id: 'covered-btc',
                      client_order_id: `d1s${'a'.repeat(29)}`,
                      orig_size: 0.00128,
                      remaining_size: 0.00128,
                      price: 80900,
                      is_buy: false,
                      is_reduce_only: true,
                    },
                  ]
                : []),
            ]),
    }) as unknown as DecibelProductionLiveAuthenticatedReaderV1;

  it.each([false, true])(
    'keeps unrelated markets out of BTC publication (active BTC=%s)',
    async (activeBTC) => {
      const Source = new decibel_production_live_state_source_v1(
        makeReader(activeBTC),
        { DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount' },
        () => 20000,
      );
      try {
        const account = await Source.readAuthenticatedAccountState();
        expect(account.actualInventoryBase).toBe(activeBTC ? 0.00128 : 0);
        expect(account.openOrders).toHaveLength(activeBTC ? 1 : 0);
        expect(account.authenticatedPositions.filter((p) => p.market === 'BTC/USD')).toHaveLength(
          activeBTC ? 1 : 0,
        );
        expect(account.authenticatedPositions.some((p) => p.market.startsWith('0x96c3'))).toBe(
          true,
        );
        if (activeBTC)
          expect(account.openOrders[0]).toMatchObject({
            venueOrderId: 'covered-btc',
            side: 'SELL',
            reduceOnly: true,
            quantity: 0.00128,
          });
        const base = makeSnapshot();
        const candidate = mergeDecibelVenueReconciliationSnapshotV1(base, account, null);
        expect(candidate?.input.actualInventoryBase).toBe(activeBTC ? 0.00128 : 0);
        expect(candidate?.input.openOrders.some((o) => o.venueOrderId === 'foreign-order')).toBe(
          false,
        );
      } finally {
        await Source.close();
      }
    },
  );

  it('never publishes a partial account read after an authenticated order-stage failure', async () => {
    const Source = new decibel_production_live_state_source_v1(
      makeReader(false, true),
      { DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount' },
      () => 20000,
    );
    const Supervisor = new decibel_runtime_supervisor_v1();
    const previous = { observedAt: 19000 };
    Supervisor.setAuthenticatedSnapshot(19000, 5000, previous);
    const publish = vi.fn((account) => Supervisor.setAuthenticatedSnapshot(20000, 5000, account));
    try {
      await expect(Source.readAuthenticatedAccountState().then(publish)).rejects.toThrow(
        'PRODUCTION_AUTHENTICATED_READ_REQUIRED',
      );
      expect(publish).not.toHaveBeenCalled();
      expect(Supervisor.getAuthenticatedSnapshot()).toBe(previous);
      expect(Source.readAuthenticatedEvidenceDiagnostics()).toMatchObject({
        stages: { OPEN_ORDERS: { outcome: 'HTTP_500' } },
      });
    } finally {
      await Source.close();
    }
  });

  it('rejects disjoint account/history windows before they can publish', () => {
    const initial = makeSnapshot();
    const base = { ...initial, input: { ...initial.input, now: 1000 } };
    const account = {
      observedAt: 1200,
      readWindow: { startedAt: 1100, completedAt: 1200 },
      actualInventoryBase: 0,
      openOrders: [],
      authenticatedPositions: [],
      availableMarginUsd: 8,
      accountMetrics: {
        collateralUsd: 8,
        totalMarginUsd: 8,
        unrealizedPnlUsd: 0,
        masterAptGas: null,
      },
    };
    const history = {
      observedAt: 1300,
      readWindow: { startedAt: 1300, completedAt: 1400 },
      ledger: createDecibelActualFillLedgerV1([]),
      terminalOrderEvidence: [],
    };
    expect(() => mergeDecibelVenueReconciliationSnapshotV1(base, account, history)).toThrow(
      'PRODUCTION_AUTHENTICATED_BATCH_INCONSISTENT',
    );
  });
});
