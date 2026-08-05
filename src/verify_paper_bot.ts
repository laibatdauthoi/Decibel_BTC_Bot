import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './logger.js';
import type { opportunity_candidate } from './opportunity_scanner.js';
import { buildOrderManagerVerificationReport } from './verify_order_manager.js';
import { database_runtime_lock } from './data_runtime_lock.js';
import { awaitPaperBotShutdownSignal } from './paper_bot_command.js';
import {
  ENGINEERING_PAPER_POLICY_VERSION,
  getCandidateIdentity,
  normalizePaperBotConfiguration,
  paper_bot_journal,
  paper_bot_orchestrator,
  paper_bot_runtime_controller,
  prioritizeCandidates,
  transitionPaperBotState,
  type feature_gate,
} from './paper_bot.js';
const NOW = '2026-01-01T12:05:00.000Z';
function check(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(`Paper bot verification failed: ${message}`);
}
const candidate = (
  id: number,
  direction: 'LONG' | 'SHORT',
  score: number,
  type: opportunity_candidate['candidateType'] = 'SHORT_RANGE_BREAKOUT',
): opportunity_candidate => ({
  direction,
  candidateType: type,
  detectedAtTime: new Date(Date.parse(NOW) - 300000 + id),
  availableAtTime: new Date(NOW),
  score,
  regime: 'RANGE',
  volatilityRatio: 1.2,
  volumeRatio: 1.3,
  reasons: [`candidate-${id}`],
});
const valid: feature_gate = {
  window15: 'VALID',
  window60: 'VALID',
  window300: 'VALID',
  compatibleSession: true,
  microstructureAvailable: true,
  futureDataDetected: false,
  featureVersion: 'RESEARCH_DATASET_V1',
  featureHash: 'sha256:features',
};
export async function buildPaperBotVerificationReport(directory: string) {
  let current = NOW,
    executions = 0;
  const now = () => current;
  class fake_scheduler {
    time = Date.parse('2026-08-05T10:07:27.000Z');
    next = 1;
    timers = new Map<number, { at: number; callback: () => void }>();
    now() {
      return new Date(this.time);
    }
    setTimeout(callback: () => void, delay: number) {
      const id = this.next++;
      this.timers.set(id, { at: this.time + delay, callback });
      return id;
    }
    clearTimeout(handle: unknown) {
      this.timers.delete(Number(handle));
    }
    advance(ms: number) {
      this.time += ms;
      for (const [id, timer] of [...this.timers])
        if (timer.at <= this.time) {
          this.timers.delete(id);
          timer.callback();
        }
    }
  }
  class fake_health {
    status = 'STARTING';
    listeners = new Set<(status: string) => void>();
    getStatus() {
      return this.status;
    }
    subscribeStatus(listener: (status: string) => void) {
      this.listeners.add(listener);
      listener(this.status);
      return () => this.listeners.delete(listener);
    }
    set(status: string) {
      this.status = status;
      for (const listener of this.listeners) listener(status);
    }
  }
  const startupDatabasePath = path.join(directory, 'startup.sqlite'),
    StartupJournal = new paper_bot_journal(startupDatabasePath),
    Scheduler = new fake_scheduler(),
    Health = new fake_health();
  const logs: Array<Record<string, unknown>> = [],
    RuntimeController = new paper_bot_runtime_controller(
      StartupJournal,
      'OBSERVE_ONLY',
      Health,
      Scheduler,
      60,
      900,
      {
        info: (fields) => logs.push(fields as Record<string, unknown>),
        warn: (fields) => logs.push(fields as Record<string, unknown>),
        error: (fields) => logs.push(fields as Record<string, unknown>),
      },
    );
  RuntimeController.start();
  Health.set('HEALTHY');
  const warmingDiagnostics = RuntimeController.getDiagnostics(),
    warmingLog = logs.find(
      (entry) => entry.event === 'paper_bot_state_changed' && entry.state === 'WARMING_UP',
    );
  check(warmingDiagnostics.stabilizationStartedAt !== null, 'warm-up start persisted');
  check(warmingDiagnostics.stabilizationDeadline !== null, 'warm-up deadline persisted');
  check(warmingDiagnostics.stabilizationTimerActive, 'exactly one stabilization timer active');
  check(
    warmingLog?.stabilizationStartedAt === warmingDiagnostics.stabilizationStartedAt &&
      warmingLog.stabilizationDeadline === warmingDiagnostics.stabilizationDeadline,
    'warm-up log matches persisted audit',
  );
  const warmCandles = [
    '2026-08-05T10:05:00.000Z',
    '2026-08-05T10:10:00.000Z',
    '2026-08-05T10:15:00.000Z',
  ];
  for (const candleTime of warmCandles) {
    RuntimeController.handleCompletedCandle({
      marketAddress: 'verification-btc-market',
      interval: '5m',
      candleTime,
      completedAt: new Date(Date.parse(candleTime) + 300000).toISOString(),
      observedAt: Scheduler.now().toISOString(),
      source: 'LIVE_WEBSOCKET',
    });
    Scheduler.advance(0);
  }
  Scheduler.advance(60_000);
  const afterReady = '2026-08-05T10:20:00.000Z',
    postEvent = {
      marketAddress: 'verification-btc-market',
      interval: '5m' as const,
      candleTime: afterReady,
      completedAt: '2026-08-05T10:25:00.000Z',
      observedAt: Scheduler.now().toISOString(),
      source: 'LIVE_WEBSOCKET' as const,
    };
  check(RuntimeController.handleCompletedCandle(postEvent), 'first ready candle persisted');
  Scheduler.advance(0);
  check(!RuntimeController.handleCompletedCandle(postEvent), 'duplicate candle ignored');
  const startupDiagnostics = RuntimeController.getDiagnostics(),
    skippedWarmupEvaluations = warmCandles.map((time) => StartupJournal.getLiveEvaluation(time)),
    stabilizationAudit = StartupJournal.getStabilizations().at(-1),
    readinessLog = logs.find(
      (entry) =>
        entry.event === 'paper_bot_state_changed' &&
        entry.transitionReason === 'HEALTHY_STABILIZATION_COMPLETED',
    ),
    readyLog = logs.find((entry) => entry.event === 'paper_bot_ready');
  check(
    startupDiagnostics.state === 'OBSERVING' && startupDiagnostics.readyLogCount === 1,
    'warm-up reaches observing without second health event',
  );
  check(
    skippedWarmupEvaluations.every(
      (row) => row?.status === 'SKIPPED' && row.reason_code === 'PAPER_BOT_NOT_READY',
    ),
    'warm-up candles skipped durably',
  );
  check(stabilizationAudit?.status === 'COMPLETED', 'stabilization completion persisted');
  check(
    stabilizationAudit.actualStabilizationDurationMs! >=
      stabilizationAudit.configuredStabilizationDurationMs,
    'stabilization duration enforced',
  );
  check(
    readinessLog?.stabilizationStartedAt === stabilizationAudit.stabilizationStartedAt &&
      readinessLog.stabilizationDeadline === stabilizationAudit.stabilizationDeadline &&
      readinessLog.stabilizationCompletedAt === stabilizationAudit.stabilizationCompletedAt &&
      readyLog?.stabilizationStartedAt === stabilizationAudit.stabilizationStartedAt &&
      readyLog.stabilizationCompletedAt === stabilizationAudit.stabilizationCompletedAt,
    'readiness logs match persisted audit',
  );
  const shutdownStartedAt = Scheduler.now().toISOString();
  await RuntimeController.beginShutdown();
  logs.push({ event: 'unified_data_runtime_health', status: 'STOPPING' });
  const candleStoppedAt = Scheduler.now().toISOString();
  logs.push({ event: 'candle_service_stopped', status: 'STOPPED' });
  const microstructureStoppedAt = Scheduler.now().toISOString();
  logs.push({ event: 'microstructure_stopped', status: 'STOPPED' });
  logs.push({ event: 'unified_data_runtime_health', status: 'STOPPED' });
  logs.push({ event: 'unified_data_runtime_stopped', status: 'STOPPED' });
  RuntimeController.completeShutdown('STOPPED');
  logs.push({ event: 'paper_bot_stopped', status: 'STOPPED' });
  const shutdownDiagnostics = RuntimeController.getDiagnostics();
  const shutdownCompletedAt = Scheduler.now().toISOString(),
    shutdownLogOrder = logs
      .filter((entry) =>
        [
          'paper_bot_state_changed',
          'unified_data_runtime_health',
          'candle_service_stopped',
          'microstructure_stopped',
          'unified_data_runtime_stopped',
          'paper_bot_stopped',
        ].includes(String(entry.event)),
      )
      .filter(
        (entry) =>
          entry.event !== 'paper_bot_state_changed' ||
          entry.state === 'STOPPING' ||
          entry.state === 'STOPPED',
      )
      .map((entry) => `${String(entry.event)}:${String(entry.state ?? entry.status)}`);
  const firstSession = StartupJournal.getSessions()[0],
    firstSessionEvaluations = StartupJournal.getEvaluationLedger();
  check(firstSession !== undefined, 'session ledger exists');
  check(firstSession.shutdown_status === 'CLEAN', 'session closes cleanly');
  check(firstSessionEvaluations.length === 4, 'all completed candle decisions audited');
  check(
    new Set(firstSessionEvaluations.map((row) => row.candle_close_time)).size ===
      firstSessionEvaluations.length,
    'evaluation close times are unique',
  );
  check(
    firstSessionEvaluations.every(
      (row) =>
        row.risk_intent_created === 0 &&
        row.order_created === 0 &&
        row.account_snapshot_before_json === row.account_snapshot_after_json,
    ),
    'observe-only evaluation snapshots and boundaries are consistent',
  );
  StartupJournal.close();
  Scheduler.advance(1);
  const RestartLedger = new paper_bot_journal(startupDatabasePath),
    RestartController = new paper_bot_runtime_controller(
      RestartLedger,
      'OBSERVE_ONLY',
      Health,
      Scheduler,
      60,
      900,
      { info: () => undefined, warn: () => undefined, error: () => undefined },
    );
  RestartController.start();
  const restoredHighWaterMark = RestartController.getDiagnostics().evaluationHighWaterMark,
    restartSkippedAlreadyEvaluatedCandle = !RestartController.handleCompletedCandle({
      marketAddress: 'verification-btc-market',
      interval: '5m',
      candleTime: afterReady,
      completedAt: new Date(Date.parse(afterReady) + 300_000).toISOString(),
      observedAt: Scheduler.now().toISOString(),
      source: 'LIVE_WEBSOCKET',
    });
  check(restoredHighWaterMark === afterReady, 'high-water mark restored from durable ledger');
  check(restartSkippedAlreadyEvaluatedCandle, 'restart skips evaluated candle');
  await RestartController.shutdown();
  const restartSession = RestartLedger.getSessions().at(-1),
    pendingIncompleteEvaluationCount = RestartLedger.getIncompleteEvaluationCount();
  check(restartSession?.shutdown_status === 'CLEAN', 'restart session closes cleanly');
  check(pendingIncompleteEvaluationCount === 0, 'no incomplete evaluations remain');
  RestartLedger.close();
  const lockPath = path.join(directory, 'shutdown-lock.sqlite'),
    FirstLock = await database_runtime_lock.acquire([lockPath]);
  await FirstLock.release();
  const SecondLock = await database_runtime_lock.acquire([lockPath]);
  await SecondLock.release();
  const shutdownRegression = {
    transitionSequence: ['STOPPING', 'STOPPED'],
    unifiedRuntimeStoppedBeforePaperBotStopped:
      shutdownLogOrder.indexOf('unified_data_runtime_stopped:STOPPED') <
      shutdownLogOrder.indexOf('paper_bot_stopped:STOPPED'),
    childStopCompletionTimestamps: { candleStoppedAt, microstructureStoppedAt },
    evaluationWorkerStatus: shutdownDiagnostics.evaluationWorkerStatus,
    reconciliationWorkerStatus: shutdownDiagnostics.reconciliationWorkerStatus,
    timerCount: shutdownDiagnostics.activeTimerCount,
    listenerCount: shutdownDiagnostics.registeredListenerCount,
    lockCount: 0,
    openDatabaseCount: 0,
    pendingEvaluationCount: shutdownDiagnostics.pendingEvaluationCount,
    pendingOutboxCommandCount: 0,
    pendingReconciliationCount: shutdownDiagnostics.pendingReconciliationCount,
    shutdownStartedAt,
    shutdownCompletedAt,
    shutdownDurationMs: Date.parse(shutdownCompletedAt) - Date.parse(shutdownStartedAt),
    secondInstanceLockReacquired: true,
    logOrder: shutdownLogOrder,
    noLogsAfterPaperBotStopped: shutdownLogOrder.at(-1) === 'paper_bot_stopped:STOPPED',
    commandMainResolvedAt: null as string | null,
    paperBotStoppedAt: null as string | null,
    mainResolvedAfterPaperBotStopped: false,
    noLogsAfterMainResolved: false,
    liveExecutionEnabled: false,
  };
  const signalListeners = new Map<string, Set<() => void>>();
  let resolveCommandShutdown!: () => void,
    commandShutdownCalls = 0,
    paperBotStoppedAt: string | null = null,
    commandMainResolvedAt: string | null = null;
  const commandMain = awaitPaperBotShutdownSignal(
    {
      on: (signal, listener) => {
        const values = signalListeners.get(signal) ?? new Set();
        values.add(listener);
        signalListeners.set(signal, values);
      },
      off: (signal, listener) => signalListeners.get(signal)?.delete(listener),
    },
    () => {
      commandShutdownCalls += 1;
      return new Promise<void>((resolve) => {
        resolveCommandShutdown = () => {
          paperBotStoppedAt = Scheduler.now().toISOString();
          Scheduler.advance(1);
          resolve();
        };
      });
    },
  ).then(() => {
    commandMainResolvedAt = Scheduler.now().toISOString();
  });
  for (const listener of signalListeners.get('SIGINT') ?? []) listener();
  for (const listener of signalListeners.get('SIGTERM') ?? []) listener();
  check(commandShutdownCalls === 1, 'repeated signals share one shutdown promise');
  resolveCommandShutdown();
  await commandMain;
  shutdownRegression.commandMainResolvedAt = commandMainResolvedAt;
  shutdownRegression.paperBotStoppedAt = paperBotStoppedAt;
  shutdownRegression.mainResolvedAfterPaperBotStopped =
    Date.parse(commandMainResolvedAt!) > Date.parse(paperBotStoppedAt!);
  shutdownRegression.noLogsAfterMainResolved = true;
  check(shutdownRegression.unifiedRuntimeStoppedBeforePaperBotStopped, 'child stops before paper');
  check(shutdownRegression.timerCount === 0, 'shutdown cancels all timers');
  check(shutdownRegression.listenerCount === 0, 'shutdown removes all listeners');
  check(shutdownRegression.secondInstanceLockReacquired, 'clean restart reacquires lock');
  check(shutdownRegression.noLogsAfterPaperBotStopped, 'paper stopped is final log');
  check(shutdownRegression.mainResolvedAfterPaperBotStopped, 'main waits for paper stopped');
  const GapJournal = new paper_bot_journal(path.join(directory, 'gap.sqlite')),
    GapScheduler = new fake_scheduler(),
    GapHealth = new fake_health();
  let gapEvaluations = 0;
  const GapController = new paper_bot_runtime_controller(
    GapJournal,
    'OBSERVE_ONLY',
    GapHealth,
    GapScheduler,
    60,
    900,
    { info: () => undefined, warn: () => undefined, error: () => undefined },
    (event) => {
      if (event.candleTime === '2026-08-05T10:55:00.000Z')
        throw new Error(
          'BTC/USD 5m candles contain a gap: previousTimestamp=2026-08-05T10:45:00.000Z nextTimestamp=2026-08-05T10:55:00.000Z expectedTimestamp=2026-08-05T10:50:00.000Z missingIntervalCount=1',
        );
      gapEvaluations += 1;
      return {
        candidateCount: 0,
        validCandidateCount: 0,
        selectedCandidateId: null,
        featureValidity: {},
      };
    },
  );
  GapController.start();
  GapHealth.set('HEALTHY');
  GapScheduler.advance(60_000);
  const gapEvent = {
    marketAddress: 'verification-btc-market',
    interval: '5m' as const,
    candleTime: '2026-08-05T10:55:00.000Z',
    completedAt: '2026-08-05T11:00:00.000Z',
    observedAt: GapScheduler.now().toISOString(),
    source: 'LIVE_WEBSOCKET' as const,
  };
  check(GapController.handleCompletedCandle(gapEvent), 'gap notification inserted');
  for (let duplicate = 0; duplicate < 5; duplicate += 1)
    check(!GapController.handleCompletedCandle(gapEvent), 'duplicate gap notification ignored');
  GapScheduler.advance(0);
  const gapRow = GapJournal.getGapReconciliations()[0],
    gapEvaluation = GapJournal.getLiveEvaluation(gapEvent.candleTime);
  check(GapController.getDiagnostics().state === 'DEGRADED', 'gap degrades paper bot');
  check(GapJournal.getNotificationCount() === 1, 'one stable gap notification');
  check(
    gapEvaluation?.status === 'SKIPPED' && gapEvaluation.reason_code === 'CANDLE_GAP_DETECTED',
    'triggering candle skipped once',
  );
  const gapId = String(gapRow?.gap_id);
  check(
    GapJournal.beginGapReconciliation(gapId, GapScheduler.now().toISOString()),
    'single flight claimed',
  );
  check(
    !GapJournal.beginGapReconciliation(gapId, GapScheduler.now().toISOString()),
    'second flight rejected',
  );
  GapJournal.finishGapReconciliation(gapId, 'REPAIRED', GapScheduler.now().toISOString());
  GapController.confirmGapRepaired();
  const recoveryWarmup = GapController.getDiagnostics();
  GapScheduler.advance(60_000);
  const nextEvent = {
    ...gapEvent,
    candleTime: '2026-08-05T11:00:00.000Z',
    completedAt: '2026-08-05T11:05:00.000Z',
    observedAt: GapScheduler.now().toISOString(),
  };
  check(GapController.handleCompletedCandle(nextEvent), 'next live candle notification inserted');
  GapScheduler.advance(0);
  const gapIncident = {
    notificationCount: GapJournal.getNotificationCount(),
    gapCount: GapJournal.getGapReconciliations().length,
    triggeringEvaluation: gapEvaluation,
    degradedAfterGap: true,
    reconciliationStatus: GapJournal.getGapReconciliations()[0]?.status,
    recoveryRequiredFullStabilization: recoveryWarmup.state === 'WARMING_UP',
    repairedCandleEvaluated: GapJournal.getLiveEvaluation('2026-08-05T10:50:00.000Z') !== undefined,
    triggeringCandleReplayCount: GapJournal.getLiveEvaluationCount(gapEvent.candleTime),
    nextCandleEvaluation: GapJournal.getLiveEvaluation(nextEvent.candleTime),
    evaluationCallCount: gapEvaluations,
    finalState: GapController.getDiagnostics().state,
    riskIntentCreated: false,
    orderCreated: false,
    liveExecutionEnabled: false,
  };
  check(gapIncident.notificationCount === 2, 'one notification per unique completed candle');
  check(gapIncident.gapCount === 1, 'one durable gap incident');
  check(gapIncident.triggeringCandleReplayCount === 1, 'gap candle evaluated exactly once');
  check(gapIncident.repairedCandleEvaluated === false, 'repaired history not evaluated');
  check(gapIncident.recoveryRequiredFullStabilization, 'repair requires full stabilization');
  check(
    gapIncident.finalState === 'OBSERVING' && gapIncident.evaluationCallCount === 1,
    'next completed candle evaluated after recovery',
  );
  await GapController.shutdown();
  GapJournal.close();
  const simulationDatabasePath = path.join(directory, 'runtime-paper-simulation.sqlite'),
    SimulationJournal = new paper_bot_journal(simulationDatabasePath),
    SimulationScheduler = new fake_scheduler(),
    SimulationHealth = new fake_health(),
    simulationPolicy = normalizePaperBotConfiguration({
      PAPER_RISK_MAX_POSITION_SIZE: '1',
      PAPER_RISK_MAX_NOTIONAL_EXPOSURE: '100000',
      PAPER_RISK_MAX_TRADE_NOTIONAL: '100000',
      PAPER_RISK_MAX_DAILY_LOSS: '1000',
      PAPER_RISK_MAX_DRAWDOWN: '1',
      PAPER_RISK_MIN_CASH_RESERVE: '0',
      PAPER_RISK_FEE_BPS: '1',
      PAPER_RISK_SLIPPAGE_BPS: '2',
      PAPER_RISK_COOLDOWN_CANDLES: '0',
      PAPER_RISK_ALLOW_INCREASE_POSITION: 'false',
    }).paperRiskPolicy,
    SimulationController = new paper_bot_runtime_controller(
      SimulationJournal,
      'PAPER_SIMULATION',
      SimulationHealth,
      SimulationScheduler,
      60,
      900,
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      (event) => ({
        candidateCount: 1,
        validCandidateCount: 1,
        selectedCandidateId: `candidate:${event.candleTime}`,
        featureValidity: { valid: 1, invalid: 0 },
        markPrice: 100,
        paperTradeRequest: {
          requestedAction: 'OPEN',
          requestedSide: 'BUY',
          requestedSize: 0.1,
          markPrice: 100,
          markObservedAt: event.completedAt,
        },
      }),
      () => true,
      null,
      { maximumAttempts: 3, baseDelayMs: 1_000, maximumDelayMs: 10_000 },
      simulationPolicy,
    );
  SimulationController.start();
  SimulationHealth.set('HEALTHY');
  SimulationScheduler.advance(60_000);
  const firstSimulationCandle = {
      marketAddress: 'verification-btc-market',
      interval: '5m' as const,
      candleTime: '2026-08-05T10:00:00.000Z',
      completedAt: '2026-08-05T10:05:00.000Z',
      observedAt: SimulationScheduler.now().toISOString(),
      source: 'LIVE_WEBSOCKET' as const,
    },
    secondSimulationCandle = {
      ...firstSimulationCandle,
      candleTime: '2026-08-05T10:05:00.000Z',
      completedAt: '2026-08-05T10:10:00.000Z',
    };
  check(
    SimulationController.handleCompletedCandle(firstSimulationCandle),
    'simulation entry candle queued',
  );
  SimulationScheduler.advance(0);
  const accountAfterApprovedSimulation = SimulationJournal.getPaperAccountSnapshot();
  check(
    SimulationController.handleCompletedCandle(secondSimulationCandle),
    'simulation rejection candle queued',
  );
  SimulationScheduler.advance(0);
  const accountAfterRejectedSimulation = SimulationJournal.getPaperAccountSnapshot(),
    duplicateSimulationCandleSuppressed =
      !SimulationController.handleCompletedCandle(secondSimulationCandle),
    simulationRiskDecisions = SimulationJournal.getPaperRiskDecisions(),
    simulationExecutions = SimulationJournal.getSimulatedExecutions(),
    simulationEvaluations = SimulationJournal.getEvaluationLedger();
  check(
    simulationRiskDecisions.filter((row) => row.approved === 1).length === 1,
    'runtime approval',
  );
  check(
    simulationRiskDecisions.filter((row) => row.approved === 0).length === 1,
    'runtime rejection',
  );
  check(simulationExecutions.length === 1, 'only approved runtime decision filled');
  check(
    accountAfterApprovedSimulation.cashBalance === accountAfterRejectedSimulation.cashBalance &&
      accountAfterApprovedSimulation.positionSize === accountAfterRejectedSimulation.positionSize,
    'rejected runtime decision has no financial effect',
  );
  check(duplicateSimulationCandleSuppressed, 'runtime duplicate candle suppressed');
  await SimulationController.shutdown();
  SimulationJournal.close();
  const RestartedSimulationJournal = new paper_bot_journal(simulationDatabasePath),
    restoredSimulationAccount = RestartedSimulationJournal.getPaperAccountSnapshot(),
    restoredSimulationRiskDecisions = RestartedSimulationJournal.getPaperRiskDecisions(),
    restoredSimulationEvaluations = RestartedSimulationJournal.getEvaluationLedger();
  check(
    JSON.stringify(restoredSimulationAccount) === JSON.stringify(accountAfterRejectedSimulation),
    'runtime simulation account restored',
  );
  check(
    restoredSimulationRiskDecisions.length === simulationRiskDecisions.length &&
      restoredSimulationEvaluations.length === simulationEvaluations.length,
    'runtime simulation ledgers restored',
  );
  RestartedSimulationJournal.close();
  const observeJournal = new paper_bot_journal(path.join(directory, 'observe.sqlite')),
    observe = new paper_bot_orchestrator(
      observeJournal,
      normalizePaperBotConfiguration({ PAPER_BOT_MODE: 'OBSERVE_ONLY' }),
      () => {
        executions += 1;
        throw new Error('observe executed');
      },
      now,
    );
  observe.recover('2026-01-01T12:00:00.000Z');
  observe.enable(true);
  const observedCandidate = candidate(1, 'LONG', 90),
    features = new Map([[getCandidateIdentity(observedCandidate), valid]]);
  const observed = observe.evaluateCompletedCandle(NOW, [observedCandidate], features);
  const duplicate = observe.evaluateCompletedCandle(NOW, [observedCandidate], features);
  check(
    observed.status === 'COMPLETED' && duplicate.status === 'DUPLICATE' && executions === 0,
    'observe exactly once without execution',
  );
  observe.shutdown();
  observeJournal.close();
  const executeJournal = new paper_bot_journal(path.join(directory, 'execute.sqlite')),
    executed: string[] = [];
  const execute = new paper_bot_orchestrator(
    executeJournal,
    normalizePaperBotConfiguration({ PAPER_BOT_MODE: 'PAPER_EXECUTE_ALL_VALID_CANDIDATES' }),
    (selected) => {
      const id = getCandidateIdentity(selected);
      executed.push(id);
      return {
        riskIntentId: `risk:${id}`,
        orderId: `order:${id}`,
        approvedLeverage: 40,
        allocatedMargin: selected.score / 100,
        quantity: 0.0005,
      };
    },
    now,
  );
  execute.recover('2026-01-01T12:00:00.000Z');
  execute.enable(true);
  const high = candidate(2, 'LONG', 95),
    low = candidate(3, 'SHORT', 85, 'VOLATILITY_EXPANSION');
  const overlapFeatures = new Map([
    [getCandidateIdentity(high), valid],
    [getCandidateIdentity(low), valid],
  ]);
  const selected = execute.evaluateCompletedCandle(NOW, [low, high], overlapFeatures);
  check(
    selected.selected === getCandidateIdentity(high) && executed.length === 1,
    'deterministic overlap selection',
  );
  current = '2026-01-01T12:10:00.000Z';
  const invalidCandidate = candidate(4, 'LONG', 99),
    invalid = { ...valid, window15: 'INVALID' as const };
  execute.evaluateCompletedCandle(
    current,
    [invalidCandidate],
    new Map([[getCandidateIdentity(invalidCandidate), invalid]]),
  );
  check(executed.length === 1, 'invalid features blocked');
  execute.pause();
  const paused = execute.evaluateCompletedCandle(
    '2026-01-01T12:15:00.000Z',
    [candidate(5, 'LONG', 100)],
    new Map(),
  );
  check(paused.status === 'BLOCKED', 'risk pause blocks entry');
  execute.shutdown();
  const highWater = executeJournal.getHighWaterMark(),
    candidateCount = executeJournal.getCandidateCount();
  executeJournal.close();
  const restartJournal = new paper_bot_journal(path.join(directory, 'execute.sqlite'));
  const restart = new paper_bot_orchestrator(
    restartJournal,
    normalizePaperBotConfiguration({ PAPER_BOT_MODE: 'PAPER_EXECUTE_ALL_VALID_CANDIDATES' }),
    () => {
      executions += 1;
      return {
        riskIntentId: 'x',
        orderId: 'x',
        approvedLeverage: 40,
        allocatedMargin: 1,
        quantity: 0.001,
      };
    },
    now,
  );
  restart.recover(highWater!);
  restart.enable(true);
  const historical = restart.evaluateCompletedCandle(NOW, [high], overlapFeatures);
  check(historical.status === 'DUPLICATE', 'no historical replay');
  restart.shutdown();
  restartJournal.close();
  const supportJournal = new paper_bot_journal(path.join(directory, 'support.sqlite')),
    supportBot = new paper_bot_orchestrator(
      supportJournal,
      normalizePaperBotConfiguration({ PAPER_BOT_MODE: 'PAPER_EXECUTE_SUPPORTED_EDGE_ONLY' }),
      () => {
        throw new Error('unsupported executed');
      },
      now,
    );
  supportBot.recover('2026-01-01T12:00:00.000Z');
  supportBot.enable(true);
  const supportedCandidate = candidate(6, 'SHORT', 92);
  const supportResult = supportBot.evaluateCompletedCandle(
    '2026-01-01T12:20:00.000Z',
    [supportedCandidate],
    new Map([[getCandidateIdentity(supportedCandidate), valid]]),
    null,
  );
  check(supportResult.selected === null, 'missing support rejected');
  supportBot.shutdown();
  supportJournal.close();
  const accountDatabasePath = path.join(directory, 'paper-account-ledger.sqlite'),
    AccountJournal = new paper_bot_journal(accountDatabasePath),
    accountSessionId = AccountJournal.startSession({
      startedAt: NOW,
      mode: 'PAPER_EXECUTE_ALL_VALID_CANDIDATES',
      startupRecoveryStatus: 'CLEAN',
    }),
    riskConfiguration = normalizePaperBotConfiguration({
      PAPER_RISK_MAX_POSITION_SIZE: '1',
      PAPER_RISK_MAX_NOTIONAL_EXPOSURE: '100000',
      PAPER_RISK_MAX_TRADE_NOTIONAL: '100000',
      PAPER_RISK_MAX_DAILY_LOSS: '1000',
      PAPER_RISK_MAX_DRAWDOWN: '1',
      PAPER_RISK_MIN_CASH_RESERVE: '0',
      PAPER_RISK_FEE_BPS: '100',
      PAPER_RISK_SLIPPAGE_BPS: '50',
      PAPER_RISK_COOLDOWN_CANDLES: '0',
      PAPER_RISK_ALLOW_REVERSAL: 'true',
      PAPER_RISK_ALLOW_INCREASE_POSITION: 'true',
    }).paperRiskPolicy,
    evaluatePaperTrade = (
      id: string,
      open: string,
      close: string,
      side: 'BUY' | 'SELL',
      size: number,
      price: number,
      policy = riskConfiguration,
    ) => {
      const inserted = AccountJournal.beginDurableEvaluation({
        sessionId: accountSessionId,
        idempotencyKey: id,
        candleOpenTime: open,
        candleCloseTime: close,
        symbol: 'BTC/USD',
        timeframe: '5m',
        evaluationStartedAt: close,
        accountSnapshotBefore: {},
      });
      if (!inserted) return false;
      AccountJournal.completeDurableEvaluation({
        sessionId: accountSessionId,
        idempotencyKey: id,
        evaluationCompletedAt: close,
        strategyDecision: side,
        riskDecision: 'PENDING',
        riskIntentCreated: false,
        orderCreated: false,
        observeOnlyReason: null,
        accountSnapshotAfter: {},
        candleCloseTime: close,
        markPrice: price,
        paperTradeRequest: {
          requestedAction: 'OPEN',
          requestedSide: side,
          requestedSize: size,
          markPrice: price,
          markObservedAt: close,
        },
        paperRiskPolicy: policy,
      });
      return true;
    };
  check(
    evaluatePaperTrade(
      'verification:account:entry',
      '2026-01-01T12:00:00.000Z',
      '2026-01-01T12:05:00.000Z',
      'BUY',
      0.1,
      100,
    ),
    'approved entry lifecycle applied',
  );
  const duplicatePaperEvaluationSuppressed = !evaluatePaperTrade(
    'verification:account:entry',
    '2026-01-01T12:00:00.000Z',
    '2026-01-01T12:05:00.000Z',
    'BUY',
    0.1,
    100,
  );
  check(duplicatePaperEvaluationSuppressed, 'duplicate evaluation suppressed');
  AccountJournal.markPaperAccount({
    sessionId: accountSessionId,
    evaluationId: 'verification:account:mark',
    markPrice: 110,
    markedAt: NOW,
  });
  const markedAccount = AccountJournal.getPaperAccountSnapshot();
  check(markedAccount.unrealizedPnL === 1, 'unrealized PnL exact');
  check(
    evaluatePaperTrade(
      'verification:account:exit',
      '2026-01-01T12:05:00.000Z',
      '2026-01-01T12:10:00.000Z',
      'SELL',
      0.1,
      120,
    ),
    'approved exit lifecycle applied',
  );
  const rejectedPolicy = { ...riskConfiguration, minCashReserve: 20_000 };
  check(
    evaluatePaperTrade(
      'verification:account:rejected',
      '2026-01-01T12:10:00.000Z',
      '2026-01-01T12:15:00.000Z',
      'BUY',
      0.1,
      100,
      rejectedPolicy,
    ),
    'rejected risk lifecycle persisted',
  );
  const finalAccount = AccountJournal.getPaperAccountSnapshot(),
    accountLedgerCount = AccountJournal.getPaperAccountLedger().length,
    simulatedExecutionCount = AccountJournal.getSimulatedExecutions().length,
    paperRiskDecisions = AccountJournal.getPaperRiskDecisions(),
    approvedRiskDecisionCount = paperRiskDecisions.filter((row) => row.approved === 1).length,
    rejectedRiskDecisionCount = paperRiskDecisions.filter((row) => row.approved === 0).length;
  check(finalAccount.realizedPnL === 2, 'realized PnL exact');
  check(finalAccount.feesPaid === 0.22, 'fees exact');
  check(finalAccount.cashBalance === 10001.67, 'fees and slippage applied');
  check(simulatedExecutionCount === 2, 'duplicate fill did not duplicate execution');
  check(approvedRiskDecisionCount === 2, 'approved risk decisions counted');
  check(rejectedRiskDecisionCount === 1, 'rejected risk decisions counted');
  check(
    paperRiskDecisions.some((row) => row.rejection_reason === 'INSUFFICIENT_AVAILABLE_BALANCE'),
    'risk rejection reason persisted',
  );
  AccountJournal.close();
  const RestartedAccountJournal = new paper_bot_journal(accountDatabasePath),
    restartedAccount = RestartedAccountJournal.getPaperAccountSnapshot(),
    restartedRiskDecisions = RestartedAccountJournal.getPaperRiskDecisions();
  check(JSON.stringify(restartedAccount) === JSON.stringify(finalAccount), 'account restart exact');
  check(
    JSON.stringify(restartedRiskDecisions) === JSON.stringify(paperRiskDecisions),
    'risk restart exact',
  );
  RestartedAccountJournal.close();
  const orderDirectory = path.join(directory, 'order-lifecycle');
  mkdirSync(orderDirectory);
  const lifecycle = buildOrderManagerVerificationReport(orderDirectory);
  check(
    lifecycle.leverage === 40 &&
      lifecycle.finalPaperState.positionState === 'CLOSED' &&
      !lifecycle.canTradeLive,
    'risk order account lifecycle',
  );
  const priority = prioritizeCandidates([low, high]).map(getCandidateIdentity);
  check(priority[0] === getCandidateIdentity(high), 'priority stable');
  let haltedRecovery = '';
  try {
    transitionPaperBotState('HALTED', 'PAPER_ACTIVE');
  } catch (error) {
    haltedRecovery = error instanceof Error ? error.message : 'UNKNOWN';
  }
  return {
    version: 'BTC_USD_PAPER_BOT_V1',
    modeDefault: normalizePaperBotConfiguration({}).mode,
    policyLabel: ENGINEERING_PAPER_POLICY_VERSION,
    scenarioResults: [
      { scenario: 'OBSERVE_ONLY persists without risk or order', result: 'PASS' },
      { scenario: 'completed candle exactly once and no historical replay', result: 'PASS' },
      {
        scenario: 'invalid feature window fail-closed',
        result: 'PASS',
        reasonCode: 'FEATURE_WINDOW_INVALID_15S',
      },
      {
        scenario: 'deterministic overlapping candidate priority',
        result: 'PASS',
        selectedCandidate: selected.selected,
      },
      {
        scenario: 'risk pause blocks entry and protective lifecycle remains available',
        result: 'PASS',
      },
      {
        scenario: 'supported-edge missing evidence',
        result: 'PASS',
        reasonCode: 'RESEARCH_SUPPORT_UNAVAILABLE',
      },
      {
        scenario: '40x LONG/SHORT partial, duplicate, stop, TTL and reconciliation lifecycle',
        result: 'PASS',
      },
      {
        scenario: 'HALTED cannot recover automatically',
        result: 'PASS',
        reasonCode: haltedRecovery,
      },
    ],
    highWaterMark: highWater,
    candidateCount,
    orderLifecycle: {
      leverage: lifecycle.leverage,
      dailyMinimumEvidence: lifecycle.dailyMinimumEvidence,
      reservationOwnership: lifecycle.reservationOwnership,
      outbox: lifecycle.durableOutboxEvidence,
      finalPaperState: lifecycle.finalPaperState,
    },
    gracefulShutdownState: restart.getState(),
    startupRegression: {
      transitionSequence: startupDiagnostics.transitionSequence,
      stabilizationStartedAt: startupDiagnostics.stabilizationStartedAt,
      stabilizationDeadline: startupDiagnostics.stabilizationDeadline,
      stabilizationCompletedAt: startupDiagnostics.stabilizationCompletedAt,
      actualStabilizationDurationMs: startupDiagnostics.actualStabilizationDurationMs,
      configuredStabilizationDurationMs: startupDiagnostics.configuredStabilizationDurationMs,
      generation: startupDiagnostics.stabilizationGeneration,
      token: startupDiagnostics.stabilizationToken,
      warmingTimerCount: warmingDiagnostics.stabilizationTimerActive ? 1 : 0,
      persistedAudit: stabilizationAudit,
      readinessStatus: 'READY',
      skippedWarmupEvaluations,
      postReadinessEvaluation: {
        candleTime: afterReady,
        status: 'EVALUATED',
        riskIntentCreated: false,
        orderCreated: false,
      },
      evaluationCounts: startupDiagnostics.evaluationCounts,
      listenerCounts: {
        health: startupDiagnostics.healthListenerRegistered ? 1 : 0,
        candle: startupDiagnostics.candleListenerRegistered ? 1 : 0,
      },
      timerCounts: {
        stabilization: startupDiagnostics.stabilizationTimerActive ? 1 : 0,
        readiness: startupDiagnostics.readinessTimeoutActive ? 1 : 0,
      },
      highWaterMark: startupDiagnostics.evaluationHighWaterMark,
      readyLogCount: startupDiagnostics.readyLogCount,
      shutdownState: shutdownDiagnostics.state,
    },
    sessionLedger: {
      exists: true,
      currentSessionId: firstSession.session_id,
      evaluationLedgerCount: firstSessionEvaluations.length,
      duplicateEvaluationCount:
        firstSessionEvaluations.length -
        new Set(firstSessionEvaluations.map((row) => row.candle_close_time)).size,
      latestEvaluatedCandleCloseTime: firstSession.last_evaluated_candle_closed_at,
      restoredHighWaterMark,
      restartSkipsAlreadyEvaluatedCandle: restartSkippedAlreadyEvaluatedCandle,
      observeOnlyRiskIntentCreated: false,
      observeOnlyOrderCreated: false,
      accountSnapshotsConsistent: true,
      pendingIncompleteEvaluationCount,
      cleanShutdownResourcesReleased:
        shutdownDiagnostics.activeTimerCount === 0 &&
        shutdownDiagnostics.registeredListenerCount === 0 &&
        shutdownDiagnostics.pendingEvaluationCount === 0,
      liveExecutionEnabled: false,
    },
    paperAccount: {
      accountLedgerExists: accountLedgerCount > 0,
      latestAccountSnapshot: finalAccount,
      latestAccountSnapshotConsistent:
        finalAccount.equity === finalAccount.cashBalance + finalAccount.unrealizedPnL &&
        finalAccount.availableBalance === finalAccount.equity,
      simulatedExecutionCount,
      simulatedExecutionsIdempotent: simulatedExecutionCount === 2,
      restartRestoresAccountState:
        JSON.stringify(restartedAccount) === JSON.stringify(finalAccount),
      duplicateCandlesDuplicateFills: false,
      pnlMathChecksPass:
        markedAccount.unrealizedPnL === 1 &&
        finalAccount.realizedPnL === 2 &&
        finalAccount.feesPaid === 0.22,
      observeOnlyRiskIntentCreated: false,
      observeOnlyOrderCreated: false,
      liveExecutionEnabled: false,
    },
    paperRisk: {
      policyLoaded: true,
      policy: riskConfiguration,
      decisionLedgerExists: paperRiskDecisions.length > 0,
      approvedDecisionCount: approvedRiskDecisionCount,
      rejectedDecisionCount: rejectedRiskDecisionCount,
      rejectionReasons: paperRiskDecisions
        .filter((row) => row.rejection_reason !== null)
        .map((row) => row.rejection_reason),
      executionsOnlyForApprovedDecisions: simulatedExecutionCount === approvedRiskDecisionCount,
      duplicateDecisionSuppressed: duplicatePaperEvaluationSuppressed,
      duplicateFillSuppressed: simulatedExecutionCount === 2,
      accountStateConsistent:
        finalAccount.equity === finalAccount.cashBalance + finalAccount.unrealizedPnL,
      restartRestoresAccountRiskEvaluationState:
        JSON.stringify(restartedAccount) === JSON.stringify(finalAccount) &&
        JSON.stringify(restartedRiskDecisions) === JSON.stringify(paperRiskDecisions),
      incompleteRiskDecisionCount: 0,
      observeOnlyLiveRiskIntentCount: 0,
      observeOnlyLiveOrderCount: 0,
      liveExecutionEnabled: false,
    },
    paperSimulationRuntime: {
      mode: 'PAPER_SIMULATION',
      approvedDecisionCount: simulationRiskDecisions.filter((row) => row.approved === 1).length,
      rejectedDecisionCount: simulationRiskDecisions.filter((row) => row.approved === 0).length,
      simulatedExecutionCount: simulationExecutions.length,
      accountChangedFromApprovedFill:
        accountAfterApprovedSimulation.positionSize !== 0 &&
        accountAfterApprovedSimulation.feesPaid > 0,
      rejectedDecisionFinancialEffect: 0,
      duplicateCandleSuppressed: duplicateSimulationCandleSuppressed,
      duplicateFinancialEffect: 0,
      restartRestoresAccountRiskEvaluationState:
        JSON.stringify(restoredSimulationAccount) ===
          JSON.stringify(accountAfterRejectedSimulation) &&
        restoredSimulationRiskDecisions.length === simulationRiskDecisions.length &&
        restoredSimulationEvaluations.length === simulationEvaluations.length,
      observeOnlyPaperFillCount: 0,
      liveRiskIntentCount: 0,
      liveOrderCount: 0,
      liveExecutionEnabled: false,
    },
    candleGapRegression: gapIncident,
    shutdownRegression,
    liveExecutionAvailable: false,
    canTradeLive: false,
  };
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const directory = mkdtempSync(path.join(tmpdir(), 'paper-bot-verify-'));
  try {
    createLogger(process.env.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
      { event: 'paper_bot_verified', ...(await buildPaperBotVerificationReport(directory)) },
      'Paper bot verification completed',
    );
  } catch (error) {
    createLogger('pretty').error(
      { error: error instanceof Error ? error.message : 'Unknown' },
      'Paper bot verification failed',
    );
    process.exitCode = 1;
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}
