import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPaperBotVerificationReport } from '../src/verify_paper_bot.js';
import {
  getFeatureReasonCodes,
  normalizePaperBotConfiguration,
  paper_bot_journal,
  paper_bot_runtime_controller,
  parseCandleGap,
  classifyCandleReconciliationError,
  prioritizeCandidates,
  transitionPaperBotState,
  validateResearchSupport,
} from '../src/paper_bot.js';
import type { opportunity_candidate } from '../src/opportunity_scanner.js';
import { awaitPaperBotShutdownSignal } from '../src/paper_bot_command.js';
const Directories: string[] = [];
afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
});
const candidate = (
  score: number,
  type: opportunity_candidate['candidateType'],
): opportunity_candidate => ({
  direction: 'LONG',
  candidateType: type,
  detectedAtTime: new Date('2026-01-01T00:00:00Z'),
  availableAtTime: new Date('2026-01-01T00:05:00Z'),
  score,
  regime: 'RANGE',
  volatilityRatio: 1,
  volumeRatio: 1,
  reasons: [],
});
describe('paper bot orchestrator', () => {
  it('keeps the command main promise pending through paper_bot_stopped', async () => {
    const listeners = new Map<string, Set<() => void>>(),
      source = {
        on: (signal: 'SIGINT' | 'SIGTERM', listener: () => void) => {
          const values = listeners.get(signal) ?? new Set();
          values.add(listener);
          listeners.set(signal, values);
        },
        off: (signal: 'SIGINT' | 'SIGTERM', listener: () => void) =>
          listeners.get(signal)?.delete(listener),
      };
    let completeShutdown!: () => void,
      shutdownCalls = 0,
      mainResolved = false;
    const events: string[] = [],
      shutdown = () => {
        shutdownCalls += 1;
        events.push('paper_bot_state_changed:STOPPING');
        return new Promise<void>((resolve) => {
          completeShutdown = () => {
            events.push('unified_data_runtime_stopped');
            events.push('paper_bot_state_changed:STOPPED');
            events.push('paper_bot_stopped');
            resolve();
          };
        });
      },
      main = awaitPaperBotShutdownSignal(source, shutdown).then(() => {
        mainResolved = true;
        events.push('main_resolved');
      });
    for (const listener of listeners.get('SIGINT') ?? []) listener();
    for (const listener of listeners.get('SIGTERM') ?? []) listener();
    await Promise.resolve();
    expect(mainResolved).toBe(false);
    expect(shutdownCalls).toBe(1);
    completeShutdown();
    await main;
    expect(events).toEqual([
      'paper_bot_state_changed:STOPPING',
      'unified_data_runtime_stopped',
      'paper_bot_state_changed:STOPPED',
      'paper_bot_stopped',
      'main_resolved',
    ]);
    expect(listeners.get('SIGINT')?.size).toBe(0);
    expect(listeners.get('SIGTERM')?.size).toBe(0);
  });
  it('retries only transient reconciliation failures', () => {
    expect(classifyCandleReconciliationError(new Error('HTTP 429'))).toMatchObject({
      retryable: true,
    });
    expect(classifyCandleReconciliationError(new Error('HTTP 503'))).toMatchObject({
      retryable: true,
    });
    expect(classifyCandleReconciliationError(new Error('HTTP 401 authentication'))).toMatchObject({
      retryable: false,
    });
    expect(classifyCandleReconciliationError(new Error('market mismatch'))).toMatchObject({
      retryable: false,
    });
  });
  it('persists stable gap identity and never advances continuity for NOT_FOUND', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'paper-gap-not-found-'));
    Directories.push(directory);
    const Journal = new paper_bot_journal(path.join(directory, 'gap.sqlite')),
      gap = parseCandleGap(
        new Error(
          'gap previousTimestamp=2026-08-05T10:45:00.000Z nextTimestamp=2026-08-05T10:55:00.000Z expectedTimestamp=2026-08-05T10:50:00.000Z missingIntervalCount=1',
        ),
        'market',
      )!;
    Journal.detectGap(gap, '2026-08-05T11:00:00.000Z');
    Journal.detectGap(gap, '2026-08-05T11:00:01.000Z');
    expect(Journal.getGapReconciliations()).toHaveLength(1);
    expect(Journal.beginGapReconciliation(gap.gapId, '2026-08-05T11:00:02.000Z')).toBe(true);
    expect(Journal.beginGapReconciliation(gap.gapId, '2026-08-05T11:00:03.000Z')).toBe(false);
    Journal.finishGapReconciliation(gap.gapId, 'NOT_FOUND', '2026-08-05T11:00:04.000Z');
    expect(Journal.getGapReconciliations()[0]).toMatchObject({
      status: 'NOT_FOUND',
      reason_code: 'CANDLE_GAP_NOT_FOUND',
    });
    expect(Journal.getContinuityHighWaterMark()).toBeNull();
    Journal.close();
  });
  it('audits stabilization atomically, cancels degradation, and ignores stale callbacks', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'paper-stabilization-'));
    Directories.push(directory);
    class scheduler {
      time = Date.parse('2026-01-01T00:00:00.000Z');
      next = 1;
      timers = new Map<number, { at: number; callback: () => void }>();
      now = () => new Date(this.time);
      setTimeout = (callback: () => void, delay: number) => {
        const id = this.next++;
        this.timers.set(id, { at: this.time + delay, callback });
        return id;
      };
      clearTimeout = (handle: unknown) => this.timers.delete(Number(handle));
      advance(ms: number) {
        this.time += ms;
        for (const [id, timer] of [...this.timers])
          if (timer.at <= this.time) {
            this.timers.delete(id);
            timer.callback();
          }
      }
    }
    class health {
      status = 'STARTING';
      listeners = new Set<(status: string) => void>();
      getStatus = () => this.status;
      subscribeStatus = (listener: (status: string) => void) => {
        this.listeners.add(listener);
        listener(this.status);
        return () => this.listeners.delete(listener);
      };
      set(status: string) {
        this.status = status;
        for (const listener of this.listeners) listener(status);
      }
    }
    const Journal = new paper_bot_journal(path.join(directory, 'audit.sqlite')),
      Scheduler = new scheduler(),
      Health = new health(),
      logs: Record<string, unknown>[] = [],
      Controller = new paper_bot_runtime_controller(
        Journal,
        'OBSERVE_ONLY',
        Health,
        Scheduler,
        60,
        900,
        {
          info: (fields) => logs.push(fields as Record<string, unknown>),
          warn: () => undefined,
          error: () => undefined,
        },
      );
    Controller.start();
    Health.set('HEALTHY');
    const first = Controller.getDiagnostics(),
      staleCallback = [...Scheduler.timers.values()].find(
        (timer) => timer.at === Date.parse(first.stabilizationDeadline!),
      )!.callback;
    expect(first.stabilizationStartedAt).not.toBeNull();
    expect(first.stabilizationDeadline).not.toBeNull();
    expect(
      [...Scheduler.timers.values()].filter(
        (timer) => timer.at === Date.parse(first.stabilizationDeadline!),
      ),
    ).toHaveLength(1);
    expect(logs.find((log) => log.state === 'WARMING_UP')).toMatchObject({
      stabilizationStartedAt: first.stabilizationStartedAt,
      stabilizationDeadline: first.stabilizationDeadline,
    });
    Scheduler.advance(10_000);
    Health.set('DEGRADED');
    const cancelled = Journal.getStabilizations()[0]!;
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'DATA_RUNTIME_NOT_HEALTHY',
    });
    expect(cancelled.cancelledAt).not.toBeNull();
    Health.set('HEALTHY');
    const second = Controller.getDiagnostics();
    expect(second.stabilizationGeneration).toBe(2);
    expect(second.stabilizationToken).not.toBe(first.stabilizationToken);
    staleCallback();
    expect(Controller.getDiagnostics().state).toBe('WARMING_UP');
    Scheduler.advance(59_999);
    expect(Controller.getDiagnostics().state).toBe('WARMING_UP');
    Scheduler.advance(1);
    const ready = Controller.getDiagnostics(),
      completed = Journal.getStabilizations()[1]!;
    expect(ready.state).toBe('OBSERVING');
    expect(completed.actualStabilizationDurationMs).toBeGreaterThanOrEqual(60_000);
    expect(ready.stabilizationTimerActive).toBe(false);
    await Controller.shutdown();
    Journal.close();
  });

  it('does not schedule stabilization when atomic persistence fails', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'paper-stabilization-failure-'));
    Directories.push(directory);
    class failing_journal extends paper_bot_journal {
      override beginStabilization(): never {
        throw new Error('PERSISTENCE_FAILED');
      }
    }
    const Journal = new failing_journal(path.join(directory, 'failure.sqlite')),
      timers: unknown[] = [],
      listeners = new Set<(status: string) => void>(),
      Controller = new paper_bot_runtime_controller(
        Journal,
        'OBSERVE_ONLY',
        {
          getStatus: () => 'HEALTHY',
          subscribeStatus: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
        {
          now: () => new Date('2026-01-01T00:00:00.000Z'),
          setTimeout: (_callback, delay) => {
            timers.push(delay);
            return delay;
          },
          clearTimeout: () => undefined,
        },
        60,
        900,
        { info: () => undefined, warn: () => undefined, error: () => undefined },
      );
    Controller.start();
    expect(() => [...listeners][0]!('HEALTHY')).toThrow('PERSISTENCE_FAILED');
    expect(timers).toEqual([900_000]);
    expect(Controller.getDiagnostics().state).toBe('RECOVERING');
    Journal.close();
  });

  it('restarts with a fresh full stabilization attempt when continuity is unproven', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'paper-stabilization-restart-'));
    Directories.push(directory);
    const databasePath = path.join(directory, 'restart.sqlite'),
      original = new paper_bot_journal(databasePath);
    original.beginStabilization({
      previousState: 'RECOVERING',
      startedAt: '2026-01-01T00:00:00.000Z',
      deadline: '2026-01-01T00:01:00.000Z',
      configuredDurationMs: 60_000,
      runtimeStatus: 'HEALTHY',
      transitionReason: 'UNIFIED_RUNTIME_HEALTHY',
    });
    original.close();
    const restarted = new paper_bot_journal(databasePath),
      now = Date.parse('2026-01-01T00:00:30.000Z'),
      timers: number[] = [],
      Controller = new paper_bot_runtime_controller(
        restarted,
        'OBSERVE_ONLY',
        {
          getStatus: () => 'HEALTHY',
          subscribeStatus: (listener) => (listener('HEALTHY'), () => undefined),
        },
        {
          now: () => new Date(now),
          setTimeout: (_callback, delay) => (timers.push(delay), timers.length),
          clearTimeout: () => undefined,
        },
        60,
        900,
        { info: () => undefined, warn: () => undefined, error: () => undefined },
      );
    Controller.start();
    const attempts = restarted.getStabilizations();
    expect(attempts[0]).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'PROCESS_RESTART_CONTINUITY_UNPROVEN',
    });
    expect(attempts[1]).toMatchObject({
      generation: 2,
      stabilizationStartedAt: '2026-01-01T00:00:30.000Z',
      stabilizationDeadline: '2026-01-01T00:01:30.000Z',
      status: 'ACTIVE',
    });
    expect(timers).toContain(60_000);
    await Controller.shutdown();
    restarted.close();
  });
  it('defaults fail-safe to observe only and enforces state transitions', () => {
    expect(normalizePaperBotConfiguration({})).toMatchObject({
      mode: 'OBSERVE_ONLY',
      shutdownTimeoutMs: 15_000,
    });
    expect(transitionPaperBotState('STARTING', 'RECOVERING')).toBe('RECOVERING');
    expect(() => transitionPaperBotState('HALTED', 'PAPER_ACTIVE')).toThrow();
  });
  it('uses deterministic candidate priority and exact feature reason codes', () => {
    const high = candidate(95, 'VOLATILITY_EXPANSION'),
      low = candidate(90, 'SHORT_RANGE_BREAKOUT');
    expect(prioritizeCandidates([low, high])[0]).toBe(high);
    expect(
      getFeatureReasonCodes({
        window15: 'INVALID',
        window60: 'VALID',
        window300: 'INVALID',
        compatibleSession: false,
        microstructureAvailable: false,
        futureDataDetected: true,
        featureVersion: 'v',
        featureHash: 'h',
      }),
    ).toEqual([
      'FEATURE_WINDOW_INVALID_15S',
      'FEATURE_WINDOW_INVALID_300S',
      'INCOMPATIBLE_COLLECTOR_SESSION',
      'MICROSTRUCTURE_NOT_AVAILABLE',
      'FUTURE_DATA_REJECTED',
    ]);
  });
  it('validates supported-edge evidence without accepting stale or mismatched reports', () => {
    const report = {
        status: 'SUPPORTED',
        eligibleSamples: 100,
        confidencePassed: true,
        fdrPassed: true,
        datasetVersion: 'v',
        featureVersion: 'f',
        analyzerVersion: 'a',
        candidatePolicyVersion: 'p',
        makerSimulatorVersion: 'm',
        cutoff: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        reportHash: 'h',
      },
      expected = {
        featureVersion: 'f',
        candidatePolicyVersion: 'p',
        makerSimulatorVersion: 'm',
        minimumSamples: 100,
        maximumAgeHours: 24,
        now: '2026-01-01T12:00:00Z',
      };
    expect(validateResearchSupport(report, expected)).toBe(true);
    expect(validateResearchSupport({ ...report, featureVersion: 'wrong' }, expected)).toBe(false);
    expect(validateResearchSupport(null, expected)).toBe(false);
  });
  it('reports exactly-once evaluation, no replay, clean accounting, volume crossing, and shutdown', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'paper-bot-report-'));
    Directories.push(directory);
    const report = await buildPaperBotVerificationReport(directory);
    expect(report.modeDefault).toBe('OBSERVE_ONLY');
    expect(report.scenarioResults.every((scenario) => scenario.result === 'PASS')).toBe(true);
    expect(report.orderLifecycle.leverage).toBe(40);
    expect(report.orderLifecycle.dailyMinimumEvidence).toMatchObject({
      minimumStatus: 'MINIMUM_MET',
      tradingContinuedAfterMinimum: true,
      duplicateFillVolumeAdded: 0,
    });
    expect(report.orderLifecycle.reservationOwnership).toMatchObject({
      nonTerminalOrders: [],
      reservationEqualityAsserted: true,
    });
    expect(report.gracefulShutdownState).toBe('STOPPED');
    expect(report.startupRegression).toMatchObject({
      transitionSequence: ['STARTING', 'RECOVERING', 'WARMING_UP', 'OBSERVING'],
      readinessStatus: 'READY',
      readyLogCount: 1,
      warmingTimerCount: 1,
      highWaterMark: '2026-08-05T10:20:00.000Z',
      shutdownState: 'STOPPED',
      listenerCounts: { health: 1, candle: 1 },
      timerCounts: { stabilization: 0, readiness: 0 },
    });
    expect(report.startupRegression.stabilizationStartedAt).not.toBeNull();
    expect(report.startupRegression.stabilizationDeadline).not.toBeNull();
    expect(report.startupRegression.stabilizationCompletedAt).not.toBeNull();
    expect(report.startupRegression.actualStabilizationDurationMs).toBeGreaterThanOrEqual(
      report.startupRegression.configuredStabilizationDurationMs,
    );
    expect(report.startupRegression.persistedAudit).toMatchObject({
      status: 'COMPLETED',
      stabilizationStartedAt: report.startupRegression.stabilizationStartedAt,
      stabilizationDeadline: report.startupRegression.stabilizationDeadline,
      stabilizationCompletedAt: report.startupRegression.stabilizationCompletedAt,
    });
    expect(report.startupRegression.skippedWarmupEvaluations).toHaveLength(3);
    expect(
      report.startupRegression.skippedWarmupEvaluations.every(
        (row) => row?.status === 'SKIPPED' && row.reason_code === 'PAPER_BOT_NOT_READY',
      ),
    ).toBe(true);
    expect(report.startupRegression.evaluationCounts).toEqual([
      { status: 'EVALUATED', count: 1 },
      { status: 'SKIPPED', count: 3 },
    ]);
    expect(report.liveExecutionAvailable).toBe(false);
    expect(report.canTradeLive).toBe(false);
    expect(report.candleGapRegression).toMatchObject({
      notificationCount: 2,
      gapCount: 1,
      degradedAfterGap: true,
      reconciliationStatus: 'REPAIRED',
      recoveryRequiredFullStabilization: true,
      repairedCandleEvaluated: false,
      triggeringCandleReplayCount: 1,
      evaluationCallCount: 1,
      finalState: 'OBSERVING',
      riskIntentCreated: false,
      orderCreated: false,
      liveExecutionEnabled: false,
    });
    expect(report.candleGapRegression.triggeringEvaluation).toMatchObject({
      status: 'SKIPPED',
      reason_code: 'CANDLE_GAP_DETECTED',
      risk_intent_created: 0,
      order_created: 0,
    });
    expect(report.candleGapRegression.nextCandleEvaluation).toMatchObject({
      status: 'EVALUATED',
      risk_intent_created: 0,
      order_created: 0,
    });
    expect(report.shutdownRegression).toMatchObject({
      transitionSequence: ['STOPPING', 'STOPPED'],
      unifiedRuntimeStoppedBeforePaperBotStopped: true,
      evaluationWorkerStatus: 'STOPPED',
      reconciliationWorkerStatus: 'STOPPED',
      timerCount: 0,
      listenerCount: 0,
      lockCount: 0,
      openDatabaseCount: 0,
      pendingEvaluationCount: 0,
      pendingOutboxCommandCount: 0,
      pendingReconciliationCount: 0,
      secondInstanceLockReacquired: true,
      noLogsAfterPaperBotStopped: true,
      mainResolvedAfterPaperBotStopped: true,
      noLogsAfterMainResolved: true,
      liveExecutionEnabled: false,
    });
    expect(report.shutdownRegression.logOrder).toEqual([
      'paper_bot_state_changed:STOPPING',
      'unified_data_runtime_health:STOPPING',
      'candle_service_stopped:STOPPED',
      'microstructure_stopped:STOPPED',
      'unified_data_runtime_health:STOPPED',
      'unified_data_runtime_stopped:STOPPED',
      'paper_bot_state_changed:STOPPED',
      'paper_bot_stopped:STOPPED',
    ]);
  }, 15_000);
});
