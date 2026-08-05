import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { z } from 'zod';
import type { opportunity_candidate, opportunity_candidate_type } from './opportunity_scanner.js';
export const PAPER_BOT_VERSION = 'BTC_USD_PAPER_BOT_V1',
  ENGINEERING_PAPER_POLICY_VERSION = 'ENGINEERING_PAPER_POLICY_V1';
export type paper_bot_mode =
  'OBSERVE_ONLY' | 'PAPER_EXECUTE_ALL_VALID_CANDIDATES' | 'PAPER_EXECUTE_SUPPORTED_EDGE_ONLY';
export type paper_bot_state =
  | 'STARTING'
  | 'RECOVERING'
  | 'WARMING_UP'
  | 'OBSERVING'
  | 'PAPER_ACTIVE'
  | 'DEGRADED'
  | 'PAUSED'
  | 'HALTED'
  | 'STOPPING'
  | 'STOPPED';
const Schema = z.object({
  PAPER_BOT_MODE: z
    .enum([
      'OBSERVE_ONLY',
      'PAPER_EXECUTE_ALL_VALID_CANDIDATES',
      'PAPER_EXECUTE_SUPPORTED_EDGE_ONLY',
    ])
    .default('OBSERVE_ONLY'),
  PAPER_STOP_ATR_PERIOD: z.coerce.number().int().positive().default(14),
  PAPER_STOP_ATR_MULTIPLE: z.coerce.number().positive().default(1),
  PAPER_TAKE_PROFIT_R_MULTIPLE: z.coerce.number().positive().default(1.5),
  PAPER_MAX_HOLDING_BARS: z.coerce.number().int().positive().default(12),
  PAPER_ENTRY_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  PAPER_RESEARCH_MINIMUM_SAMPLES: z.coerce.number().int().min(100).default(100),
  PAPER_RESEARCH_MAX_AGE_HOURS: z.coerce.number().positive().default(168),
  HEALTHY_STABILIZATION_SECONDS: z.coerce.number().int().nonnegative().default(60),
  PAPER_BOT_READINESS_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(900),
  PAPER_BOT_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
});
export function normalizePaperBotConfiguration(environment: Record<string, string | undefined>) {
  const value = Schema.parse(environment);
  return {
    mode: value.PAPER_BOT_MODE,
    stopATRPeriod: value.PAPER_STOP_ATR_PERIOD,
    stopATRMultiple: value.PAPER_STOP_ATR_MULTIPLE,
    takeProfitRMultiple: value.PAPER_TAKE_PROFIT_R_MULTIPLE,
    maximumHoldingBars: value.PAPER_MAX_HOLDING_BARS,
    entryTtlSeconds: value.PAPER_ENTRY_TTL_SECONDS,
    researchMinimumSamples: value.PAPER_RESEARCH_MINIMUM_SAMPLES,
    researchMaximumAgeHours: value.PAPER_RESEARCH_MAX_AGE_HOURS,
    healthyStabilizationSeconds: value.HEALTHY_STABILIZATION_SECONDS,
    readinessTimeoutSeconds: value.PAPER_BOT_READINESS_TIMEOUT_SECONDS,
    shutdownTimeoutMs: value.PAPER_BOT_SHUTDOWN_TIMEOUT_MS,
  };
}

export interface paper_bot_scheduler {
  now(): Date;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}
export interface paper_bot_health_source {
  getStatus(): string;
  subscribeStatus(listener: (status: string) => void): () => void;
  setCandleContinuity?(continuity: {
    health: 'healthy' | 'gap';
    firstMissingCandleTime: string | null;
    lastMissingCandleTime: string | null;
    missingIntervalCount: number;
    reconciliationStatus: string;
  }): void;
}
export type live_completed_candle = {
  marketAddress: string;
  interval: '5m';
  candleTime: string;
  completedAt: string;
  observedAt: string;
  source: 'LIVE_WEBSOCKET';
};
export type candle_gap = {
  gapId: string;
  marketAddress: string;
  interval: '5m';
  previousTimestamp: string;
  expectedTimestamp: string;
  nextTimestamp: string;
  missingIntervalCount: number;
};
export function getCompletedCandleNotificationId(event: live_completed_candle) {
  return `completed:${event.marketAddress}:${event.interval}:${event.candleTime}`;
}
export function parseCandleGap(error: unknown, marketAddress: string): candle_gap | null {
  const message = error instanceof Error ? error.message : '';
  const previous = /previousTimestamp=([^\s,]+)/.exec(message)?.[1],
    next = /nextTimestamp=([^\s,]+)/.exec(message)?.[1],
    expected = /expectedTimestamp=([^\s,]+)/.exec(message)?.[1],
    count = Number(/missingIntervalCount=(\d+)/.exec(message)?.[1]);
  if (
    previous === undefined ||
    next === undefined ||
    expected === undefined ||
    !Number.isInteger(count) ||
    count < 1
  )
    return null;
  return {
    gapId: `gap:${marketAddress}:5m:${expected}:${new Date(Date.parse(next) - 300_000).toISOString()}`,
    marketAddress,
    interval: '5m',
    previousTimestamp: previous,
    expectedTimestamp: expected,
    nextTimestamp: next,
    missingIntervalCount: count,
  };
}
export function classifyCandleReconciliationError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/(401|403|authentication|authorization|malformed|mismatch|contradictory)/i.test(message))
    return { retryable: false, reasonCode: 'CANDLE_RESPONSE_MALFORMED' } as const;
  if (/(429|5\d\d|network|fetch|SQLITE_BUSY|database remained busy)/i.test(message))
    return { retryable: true, reasonCode: 'CANDLE_GAP_RECONCILIATION_PENDING' } as const;
  return { retryable: false, reasonCode: 'CANDLE_GAP_RECONCILIATION_FAILED' } as const;
}
export type stabilization_attempt = {
  generation: number;
  token: string;
  previousState: paper_bot_state;
  stabilizationStartedAt: string;
  stabilizationDeadline: string;
  stabilizationCompletedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  configuredStabilizationDurationMs: number;
  actualStabilizationDurationMs: number | null;
  unifiedDataRuntimeStatus: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
};
export class paper_bot_runtime_controller {
  private state: paper_bot_state = 'STARTING';
  private unsubscribeHealth: (() => void) | undefined;
  private stabilizationTimer: unknown;
  private readinessTimer: unknown;
  private evaluationTimer: unknown;
  private stabilizationStartedAt: string | null = null;
  private stabilizationCompletedAt: string | null = null;
  private stabilizationDeadline: string | null = null;
  private stabilizationToken: string | null = null;
  private stabilizationGeneration: number | null = null;
  private actualStabilizationDurationMs: number | null = null;
  private readinessDeadline: string | null = null;
  private latestObservedCompletedCandle: string | null = null;
  private latestPersistedEvaluation: string | null = null;
  private readyLogged = false;
  private candleListenerRegistered = true;
  private shuttingDown = false;
  private evaluationWorkerRunning = false;
  private evaluationWorkerPromise: Promise<void> | undefined;
  private shutdownPreparationPromise: Promise<void> | undefined;
  private continuityBlocked = false;
  private readonly transitions: paper_bot_state[] = ['STARTING'];
  constructor(
    private readonly Journal: paper_bot_journal,
    private readonly mode: paper_bot_mode,
    private readonly Health: paper_bot_health_source,
    private readonly Scheduler: paper_bot_scheduler,
    private readonly healthySeconds: number,
    private readonly readinessSeconds: number,
    private readonly Logger: {
      info(fields: object, message: string): void;
      warn(fields: object, message: string): void;
      error(fields: object, message: string): void;
    },
    private readonly evaluate: (event: live_completed_candle) => {
      candidateCount: number;
      validCandidateCount: number;
      selectedCandidateId: string | null;
      featureValidity: unknown;
    } = () => ({
      candidateCount: 0,
      validCandidateCount: 0,
      selectedCandidateId: null,
      featureValidity: {},
    }),
    private readonly validateComponents: () => boolean = () => true,
    private readonly reconcileGap:
      ((gap: candle_gap) => Promise<'REPAIRED' | 'NOT_FOUND'>) | null = null,
    private readonly reconciliationPolicy = {
      maximumAttempts: 3,
      baseDelayMs: 1_000,
      maximumDelayMs: 10_000,
    },
  ) {}
  start() {
    if (this.state !== 'STARTING') return;
    this.Journal.cancelOpenStabilizations(
      this.Scheduler.now().toISOString(),
      'PROCESS_RESTART_CONTINUITY_UNPROVEN',
    );
    this.changeState('RECOVERING', 'STARTUP_RECOVERY');
    this.Journal.prepareGapRecovery();
    this.continuityBlocked = this.Journal.getPendingGap() !== null;
    this.unsubscribeHealth = this.Health.subscribeStatus((status) => this.handleHealth(status));
    this.readinessDeadline = new Date(
      this.Scheduler.now().getTime() + this.readinessSeconds * 1000,
    ).toISOString();
    this.readinessTimer = this.Scheduler.setTimeout(
      () => this.handleReadinessTimeout(),
      this.readinessSeconds * 1000,
    );
    if (this.continuityBlocked) {
      this.changeState('DEGRADED', 'CANDLE_GAP_RECONCILIATION_PENDING');
      this.scheduleEvaluationWorker();
    } else if (this.Journal.getNextCompletedCandleNotification() !== null)
      this.scheduleEvaluationWorker();
  }
  private handleHealth(status: string) {
    if (this.shuttingDown) return;
    if (status === 'HEALTHY') {
      if (!this.continuityBlocked && ['RECOVERING', 'DEGRADED'].includes(this.state))
        this.startStabilization();
      return;
    }
    if (this.state === 'WARMING_UP') this.cancelStabilization('DATA_RUNTIME_NOT_HEALTHY');
    else if (['OBSERVING', 'PAPER_ACTIVE'].includes(this.state))
      this.changeState('DEGRADED', 'DATA_RUNTIME_NOT_HEALTHY');
  }
  private startStabilization() {
    if (this.stabilizationTimer !== undefined) return;
    const previous = this.state,
      startedAt = this.Scheduler.now().toISOString(),
      deadline = new Date(Date.parse(startedAt) + this.healthySeconds * 1000).toISOString(),
      attempt = this.Journal.beginStabilization({
        previousState: previous,
        startedAt,
        deadline,
        configuredDurationMs: this.healthySeconds * 1000,
        runtimeStatus: this.Health.getStatus(),
        transitionReason: 'UNIFIED_RUNTIME_HEALTHY',
      });
    this.state = 'WARMING_UP';
    this.transitions.push('WARMING_UP');
    this.stabilizationStartedAt = attempt.stabilizationStartedAt;
    this.stabilizationDeadline = attempt.stabilizationDeadline;
    this.stabilizationToken = attempt.token;
    this.stabilizationGeneration = attempt.generation;
    this.logStateChange(previous, 'WARMING_UP', 'UNIFIED_RUNTIME_HEALTHY', startedAt);
    const delay = Date.parse(attempt.stabilizationDeadline) - this.Scheduler.now().getTime();
    this.stabilizationTimer = this.Scheduler.setTimeout(
      () => this.completeStabilization(attempt.token),
      Math.max(0, delay),
    );
  }
  private completeStabilization(token: string) {
    if (this.shuttingDown || this.state !== 'WARMING_UP' || token !== this.stabilizationToken)
      return;
    const persisted = this.Journal.getStabilization(token),
      now = this.Scheduler.now();
    if (
      persisted?.status !== 'ACTIVE' ||
      persisted.generation !== this.stabilizationGeneration ||
      now.getTime() < Date.parse(persisted.stabilizationDeadline)
    )
      return;
    this.stabilizationTimer = undefined;
    if (this.Health.getStatus() !== 'HEALTHY' || !this.validateComponents()) {
      this.cancelStabilization('STABILIZATION_VALIDATION_FAILED');
      return;
    }
    const completedAt = now.toISOString(),
      next = this.mode === 'OBSERVE_ONLY' ? 'OBSERVING' : 'PAPER_ACTIVE',
      completed = this.Journal.completeStabilization(
        token,
        next,
        completedAt,
        this.Health.getStatus(),
      ),
      previous = this.state;
    this.stabilizationCompletedAt = completed.stabilizationCompletedAt;
    this.actualStabilizationDurationMs = completed.actualStabilizationDurationMs;
    this.state = next;
    this.transitions.push(next);
    this.logStateChange(previous, next, 'HEALTHY_STABILIZATION_COMPLETED', completedAt);
    if (this.readinessTimer !== undefined) {
      this.Scheduler.clearTimeout(this.readinessTimer);
      this.readinessTimer = undefined;
    }
    if (!this.readyLogged) {
      this.readyLogged = true;
      this.Logger.info(
        {
          event: 'paper_bot_ready',
          state: this.state,
          mode: this.mode,
          evaluationHighWaterMark: this.Journal.getHighWaterMark(),
          unifiedDataRuntimeStatus: this.Health.getStatus(),
          healthyStabilizationSeconds: this.healthySeconds,
          stabilizationStartedAt: this.stabilizationStartedAt,
          stabilizationCompletedAt: this.stabilizationCompletedAt,
          liveExecutionEnabled: false,
        },
        'Paper bot ready',
      );
    }
  }
  private cancelStabilization(reason: string) {
    if (this.stabilizationTimer !== undefined) this.Scheduler.clearTimeout(this.stabilizationTimer);
    this.stabilizationTimer = undefined;
    const token = this.stabilizationToken;
    if (token === null) return;
    const cancelledAt = this.Scheduler.now().toISOString(),
      previous = this.state;
    this.Journal.cancelStabilization(token, 'DEGRADED', cancelledAt, reason);
    this.state = 'DEGRADED';
    this.transitions.push('DEGRADED');
    this.logStateChange(previous, 'DEGRADED', reason, cancelledAt);
    this.stabilizationToken = null;
    this.stabilizationGeneration = null;
  }
  private handleReadinessTimeout() {
    this.readinessTimer = undefined;
    if (this.shuttingDown || ['OBSERVING', 'PAPER_ACTIVE'].includes(this.state)) return;
    this.changeState('HALTED', 'PAPER_BOT_READINESS_TIMEOUT');
    this.Logger.error(
      {
        event: 'paper_bot_readiness_failed',
        reasonCode: 'PAPER_BOT_READINESS_TIMEOUT',
        state: this.state,
        mode: this.mode,
        unifiedDataRuntimeStatus: this.Health.getStatus(),
        liveExecutionEnabled: false,
      },
      'Paper bot readiness timed out',
    );
  }
  handleCompletedCandle(event: live_completed_candle) {
    if (this.shuttingDown || event.interval !== '5m') return false;
    const highWater = this.Journal.getHighWaterMark();
    if (highWater !== null && event.candleTime <= highWater) return false;
    this.latestObservedCompletedCandle = event.candleTime;
    const inserted = this.Journal.enqueueCompletedCandle(event);
    if (inserted) this.scheduleEvaluationWorker();
    return inserted;
  }
  private scheduleEvaluationWorker() {
    if (this.evaluationTimer !== undefined) return;
    this.evaluationTimer = this.Scheduler.setTimeout(() => {
      this.evaluationTimer = undefined;
      this.evaluationWorkerPromise = this.drainEvaluationQueue().finally(() => {
        this.evaluationWorkerPromise = undefined;
      });
    }, 0);
  }
  private async drainEvaluationQueue() {
    if (this.evaluationWorkerRunning || this.shuttingDown) return;
    this.evaluationWorkerRunning = true;
    try {
      const recoveredGap = this.Journal.getPendingGap();
      if (recoveredGap !== null && this.state === 'DEGRADED' && this.reconcileGap !== null)
        await this.runGapReconciliation(recoveredGap);
      for (;;) {
        const event = this.Journal.getNextCompletedCandleNotification();
        if (event === null || this.shuttingDown) break;
        this.processCompletedCandle(event);
        if (this.state === 'DEGRADED') {
          const gap = this.Journal.getPendingGap();
          if (gap !== null && this.reconcileGap !== null) await this.runGapReconciliation(gap);
        }
      }
    } catch (error) {
      this.Logger.error(
        {
          event: 'paper_bot_evaluation_worker_failed',
          reasonCode: 'EVALUATION_INTERNAL_ERROR',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Paper bot evaluation worker failed safely',
      );
    } finally {
      this.evaluationWorkerRunning = false;
    }
  }
  private processCompletedCandle(event: live_completed_candle) {
    const ready = ['OBSERVING', 'PAPER_ACTIVE'].includes(this.state);
    let result: ReturnType<typeof this.evaluate> | null;
    try {
      result = ready ? this.evaluate(event) : null;
    } catch (error) {
      const gap = parseCandleGap(error, event.marketAddress);
      if (gap !== null) {
        this.Journal.detectGap(gap, event.observedAt);
        this.continuityBlocked = true;
        this.Health.setCandleContinuity?.({
          health: 'gap',
          firstMissingCandleTime: gap.expectedTimestamp,
          lastMissingCandleTime: new Date(Date.parse(gap.nextTimestamp) - 300_000).toISOString(),
          missingIntervalCount: gap.missingIntervalCount,
          reconciliationStatus: 'DETECTED',
        });
        this.persistEvaluation(event, null, 'CANDLE_GAP_DETECTED');
        if (['OBSERVING', 'PAPER_ACTIVE'].includes(this.state))
          this.changeState('DEGRADED', 'CANDLE_CONTINUITY_GAP');
        return;
      }
      this.persistEvaluation(event, null, 'EVALUATION_INTERNAL_ERROR');
      if (['OBSERVING', 'PAPER_ACTIVE'].includes(this.state))
        this.changeState('DEGRADED', 'EVALUATION_INTERNAL_ERROR');
      return;
    }
    this.persistEvaluation(event, result, ready ? null : 'PAPER_BOT_NOT_READY');
  }
  private persistEvaluation(
    event: live_completed_candle,
    result: ReturnType<typeof this.evaluate> | null,
    reasonCode: string | null,
  ) {
    const ready = reasonCode === null;
    const inserted = this.Journal.recordQueuedEvaluation({
      evaluationId: `evaluation:${event.marketAddress}:5m:${event.candleTime}`,
      notificationId: getCompletedCandleNotificationId(event),
      marketAddress: event.marketAddress,
      interval: '5m',
      candleTime: event.candleTime,
      completedAt: event.completedAt,
      observedAt: event.observedAt,
      paperBotState: this.state,
      mode: this.mode,
      status: ready ? 'EVALUATED' : 'SKIPPED',
      reasonCode,
      candidateCount: result?.candidateCount ?? 0,
      selectedCandidateId: result?.selectedCandidateId ?? null,
      riskIntentCreated: false,
      orderCreated: false,
      source: 'LIVE_WEBSOCKET',
    });
    if (inserted) {
      this.latestPersistedEvaluation = event.candleTime;
      if (ready)
        this.Logger.info(
          {
            event: 'paper_bot_candle_evaluated',
            evaluationId: `evaluation:${event.marketAddress}:5m:${event.candleTime}`,
            candleTime: event.candleTime,
            mode: this.mode,
            candidateCount: result!.candidateCount,
            validCandidateCount: result!.validCandidateCount,
            selectedCandidateId: result!.selectedCandidateId,
            featureValidity: result!.featureValidity,
            gateDecision: this.mode === 'OBSERVE_ONLY' ? 'OBSERVE_ONLY' : 'PAPER_POLICY',
            riskIntentCreated: false,
            orderCreated: false,
            evaluationHighWaterMark: this.Journal.getHighWaterMark(),
          },
          'Paper bot candle evaluated',
        );
    }
    return inserted;
  }
  private async runGapReconciliation(gap: candle_gap) {
    for (let attempt = 1; attempt <= this.reconciliationPolicy.maximumAttempts; attempt += 1) {
      if (!this.Journal.beginGapReconciliation(gap.gapId, this.Scheduler.now().toISOString()))
        return;
      try {
        const outcome = await this.reconcileGap!(gap);
        this.Journal.finishGapReconciliation(
          gap.gapId,
          outcome,
          this.Scheduler.now().toISOString(),
        );
        if (outcome === 'REPAIRED') this.confirmGapRepaired();
        return;
      } catch (error) {
        const classification = classifyCandleReconciliationError(error);
        if (!classification.retryable || attempt === this.reconciliationPolicy.maximumAttempts) {
          this.Journal.failGapReconciliation(
            gap.gapId,
            classification.reasonCode,
            error instanceof Error ? error.message : 'Unknown error',
          );
          return;
        }
        const delay = Math.min(
          this.reconciliationPolicy.baseDelayMs * 2 ** (attempt - 1),
          this.reconciliationPolicy.maximumDelayMs,
        );
        this.Journal.markGapRetryWait(gap.gapId, delay);
        await new Promise<void>((resolve) => this.Scheduler.setTimeout(resolve, delay));
        if (this.shuttingDown) return;
      }
    }
  }
  confirmGapRepaired() {
    this.continuityBlocked = false;
    this.Health.setCandleContinuity?.({
      health: 'healthy',
      firstMissingCandleTime: null,
      lastMissingCandleTime: null,
      missingIntervalCount: 0,
      reconciliationStatus: 'REPAIRED',
    });
    if (this.Health.getStatus() === 'HEALTHY' && this.state === 'DEGRADED')
      this.startStabilization();
  }
  beginShutdown(): Promise<void> {
    if (this.shutdownPreparationPromise !== undefined) return this.shutdownPreparationPromise;
    this.shutdownPreparationPromise = this.prepareShutdown();
    return this.shutdownPreparationPromise;
  }
  private async prepareShutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.changeState('STOPPING', this.state === 'HALTED' ? 'HALTED_SHUTDOWN' : 'SHUTDOWN');
    if (this.stabilizationTimer !== undefined) this.Scheduler.clearTimeout(this.stabilizationTimer);
    if (this.readinessTimer !== undefined) this.Scheduler.clearTimeout(this.readinessTimer);
    if (this.evaluationTimer !== undefined) this.Scheduler.clearTimeout(this.evaluationTimer);
    this.stabilizationTimer = undefined;
    this.readinessTimer = undefined;
    this.evaluationTimer = undefined;
    this.unsubscribeHealth?.();
    this.unsubscribeHealth = undefined;
    this.candleListenerRegistered = false;
    await this.evaluationWorkerPromise;
    this.Journal.checkpoint();
  }
  completeShutdown(unifiedRuntimeStatus: string) {
    if (this.state !== 'STOPPING') throw new Error('PAPER_BOT_SHUTDOWN_NOT_PREPARED');
    if (unifiedRuntimeStatus !== 'STOPPED')
      throw new Error(`UNIFIED_RUNTIME_NOT_STOPPED:${unifiedRuntimeStatus}`);
    this.changeState('STOPPED', 'SHUTDOWN_COMPLETE');
  }
  async shutdown() {
    await this.beginShutdown();
    this.completeShutdown('STOPPED');
  }
  getDiagnostics() {
    return {
      state: this.state,
      mode: this.mode,
      unifiedRuntimeStatus: this.Health.getStatus(),
      healthListenerRegistered: this.unsubscribeHealth !== undefined,
      candleListenerRegistered: this.candleListenerRegistered,
      stabilizationTimerActive: this.stabilizationTimer !== undefined,
      stabilizationStartedAt: this.stabilizationStartedAt,
      stabilizationCompletedAt: this.stabilizationCompletedAt,
      stabilizationDeadline: this.stabilizationDeadline,
      stabilizationToken: this.stabilizationToken,
      stabilizationGeneration: this.stabilizationGeneration,
      actualStabilizationDurationMs: this.actualStabilizationDurationMs,
      configuredStabilizationDurationMs: this.healthySeconds * 1000,
      readinessTimeoutActive: this.readinessTimer !== undefined,
      readinessDeadline: this.readinessDeadline,
      evaluationHighWaterMark: this.Journal.getHighWaterMark(),
      latestObservedCompletedCandle: this.latestObservedCompletedCandle,
      latestPersistedEvaluation: this.latestPersistedEvaluation,
      evaluationCounts: this.Journal.getLiveEvaluationCounts(),
      liveExecutionEnabled: false,
      readyLogCount: this.readyLogged ? 1 : 0,
      transitionSequence: [...this.transitions],
      evaluationWorkerStatus: this.evaluationWorkerRunning ? 'RUNNING' : 'STOPPED',
      reconciliationWorkerStatus:
        this.Journal.getPendingGap() === null ? 'STOPPED' : 'CHECKPOINTED',
      pendingEvaluationCount: this.Journal.getPendingNotificationCount(),
      pendingReconciliationCount: this.Journal.getPendingReconciliationCount(),
      activeTimerCount: [this.stabilizationTimer, this.readinessTimer, this.evaluationTimer].filter(
        (timer) => timer !== undefined,
      ).length,
      registeredListenerCount:
        Number(this.unsubscribeHealth !== undefined) + Number(this.candleListenerRegistered),
    };
  }
  private changeState(next: paper_bot_state, reason: string) {
    if (this.state === next) return;
    const previous = this.state;
    this.state = transitionPaperBotState(previous, next);
    const at = this.Scheduler.now().toISOString();
    this.Journal.transition(`runtime:${previous}:${next}:${at}`, previous, next, at);
    this.transitions.push(next);
    this.logStateChange(previous, next, reason, at);
  }
  private logStateChange(
    previous: paper_bot_state,
    next: paper_bot_state,
    reason: string,
    at: string,
  ) {
    this.Logger.info(
      {
        event: 'paper_bot_state_changed',
        previousState: previous,
        state: next,
        mode: this.mode,
        transitionReason: reason,
        occurredAt: at,
        stabilizationStartedAt: this.stabilizationStartedAt,
        stabilizationDeadline: this.stabilizationDeadline,
        stabilizationCompletedAt: this.stabilizationCompletedAt,
        actualStabilizationDurationMs: this.actualStabilizationDurationMs,
        configuredStabilizationDurationMs: this.healthySeconds * 1000,
        unifiedDataRuntimeStatus: this.Health.getStatus(),
        liveExecutionEnabled: false,
      },
      'Paper bot state changed',
    );
  }
}
export class real_paper_bot_scheduler implements paper_bot_scheduler {
  now() {
    return new Date();
  }
  setTimeout(callback: () => void, delayMs: number) {
    return setTimeout(callback, delayMs);
  }
  clearTimeout(handle: unknown) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
}
const ORDER: Record<opportunity_candidate_type, number> = {
  SHORT_RANGE_BREAKOUT: 0,
  TREND_PULLBACK_CONTINUATION: 1,
  SWING_LEVEL_RETEST_REJECTION: 2,
  VOLATILITY_EXPANSION: 3,
};
export function getCandidateIdentity(candidate: opportunity_candidate) {
  return createHash('sha256')
    .update(
      [
        candidate.availableAtTime.toISOString(),
        candidate.detectedAtTime.toISOString(),
        candidate.direction,
        candidate.candidateType,
        candidate.score,
      ].join('|'),
    )
    .digest('hex');
}
export function prioritizeCandidates(
  candidates: readonly opportunity_candidate[],
  supportedIds: ReadonlySet<string> = new Set(),
) {
  return [...candidates].sort(
    (a, b) =>
      b.score - a.score - 0 ||
      Number(supportedIds.has(getCandidateIdentity(b))) -
        Number(supportedIds.has(getCandidateIdentity(a))) ||
      ORDER[a.candidateType] - ORDER[b.candidateType] ||
      getCandidateIdentity(a).localeCompare(getCandidateIdentity(b)),
  );
}
export type feature_gate = {
  window15: 'VALID' | 'INVALID';
  window60: 'VALID' | 'INVALID';
  window300: 'VALID' | 'INVALID';
  compatibleSession: boolean;
  microstructureAvailable: boolean;
  futureDataDetected: boolean;
  featureVersion: string;
  featureHash: string;
};
export function getFeatureReasonCodes(features: feature_gate): string[] {
  const reasons: string[] = [];
  if (features.window15 === 'INVALID') reasons.push('FEATURE_WINDOW_INVALID_15S');
  if (features.window60 === 'INVALID') reasons.push('FEATURE_WINDOW_INVALID_60S');
  if (features.window300 === 'INVALID') reasons.push('FEATURE_WINDOW_INVALID_300S');
  if (!features.compatibleSession) reasons.push('INCOMPATIBLE_COLLECTOR_SESSION');
  if (!features.microstructureAvailable) reasons.push('MICROSTRUCTURE_NOT_AVAILABLE');
  if (features.futureDataDetected) reasons.push('FUTURE_DATA_REJECTED');
  return reasons;
}
export type research_support = {
  status: string;
  eligibleSamples: number;
  confidencePassed: boolean;
  fdrPassed: boolean;
  datasetVersion: string;
  featureVersion: string;
  analyzerVersion: string;
  candidatePolicyVersion: string;
  makerSimulatorVersion: string;
  cutoff: string;
  createdAt: string;
  reportHash: string;
};
export function validateResearchSupport(
  report: research_support | null,
  expected: {
    featureVersion: string;
    candidatePolicyVersion: string;
    makerSimulatorVersion: string;
    minimumSamples: number;
    maximumAgeHours: number;
    now: string;
  },
): boolean {
  return (
    report !== null &&
    report.status === 'SUPPORTED' &&
    report.eligibleSamples >= expected.minimumSamples &&
    report.confidencePassed &&
    report.fdrPassed &&
    report.featureVersion === expected.featureVersion &&
    report.candidatePolicyVersion === expected.candidatePolicyVersion &&
    report.makerSimulatorVersion === expected.makerSimulatorVersion &&
    Date.parse(report.cutoff) <= Date.parse(expected.now) &&
    Date.parse(expected.now) - Date.parse(report.createdAt) <= expected.maximumAgeHours * 3600000
  );
}
const TRANSITIONS: Record<paper_bot_state, readonly paper_bot_state[]> = {
  STARTING: ['RECOVERING', 'HALTED'],
  RECOVERING: ['WARMING_UP', 'DEGRADED', 'PAUSED', 'STOPPING', 'HALTED'],
  WARMING_UP: ['OBSERVING', 'PAPER_ACTIVE', 'DEGRADED', 'STOPPING', 'HALTED'],
  OBSERVING: ['DEGRADED', 'PAUSED', 'STOPPING', 'HALTED'],
  PAPER_ACTIVE: ['DEGRADED', 'PAUSED', 'STOPPING', 'HALTED'],
  DEGRADED: ['WARMING_UP', 'PAUSED', 'STOPPING', 'HALTED'],
  PAUSED: ['WARMING_UP', 'RECOVERING', 'STOPPING', 'HALTED'],
  HALTED: ['STOPPING'],
  STOPPING: ['STOPPED'],
  STOPPED: [],
};
export function transitionPaperBotState(from: paper_bot_state, to: paper_bot_state) {
  if (!TRANSITIONS[from].includes(to))
    throw new Error(`INVALID_PAPER_BOT_TRANSITION:${from}->${to}`);
  return to;
}
const MIGRATIONS = [
  {
    version: 1,
    sql: `CREATE TABLE paper_bot_sessions(session_id TEXT PRIMARY KEY,started_at TEXT NOT NULL,ended_at TEXT,mode TEXT NOT NULL,version TEXT NOT NULL);
  CREATE TABLE paper_bot_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),state TEXT NOT NULL,state_hash TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE paper_bot_transitions(transition_id TEXT PRIMARY KEY,previous_state TEXT NOT NULL,next_state TEXT NOT NULL,occurred_at TEXT NOT NULL);
  CREATE TABLE candle_evaluations(evaluation_id TEXT PRIMARY KEY,candle_time TEXT NOT NULL UNIQUE,evaluated_at TEXT NOT NULL,status TEXT NOT NULL);
  CREATE TABLE candidate_decisions(candidate_id TEXT PRIMARY KEY,evaluation_id TEXT NOT NULL,direction TEXT NOT NULL,candidate_type TEXT NOT NULL,
    score INTEGER NOT NULL,decision TEXT NOT NULL,reason_codes_json TEXT NOT NULL,feature_version TEXT NOT NULL,feature_hash TEXT NOT NULL,
    risk_intent_id TEXT,order_id TEXT,research_report_hash TEXT);
  CREATE TABLE paper_bot_high_water(singleton INTEGER PRIMARY KEY CHECK(singleton=1),candle_time TEXT NOT NULL);
  CREATE TABLE paper_bot_outbox(action_id TEXT PRIMARY KEY,action_type TEXT NOT NULL,payload_json TEXT NOT NULL,completed_at TEXT);`,
  },
  {
    version: 2,
    sql: `CREATE TABLE live_candle_evaluations(evaluation_id TEXT PRIMARY KEY,market_address TEXT NOT NULL,
    interval TEXT NOT NULL,candle_time TEXT NOT NULL UNIQUE,completed_at TEXT NOT NULL,observed_at TEXT NOT NULL,
    paper_bot_state TEXT NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,reason_code TEXT,candidate_count INTEGER NOT NULL,
    selected_candidate_id TEXT,risk_intent_created INTEGER NOT NULL,order_created INTEGER NOT NULL,source TEXT NOT NULL);`,
  },
  {
    version: 3,
    sql: `CREATE TABLE paper_bot_stabilizations(
      token TEXT PRIMARY KEY,generation INTEGER NOT NULL UNIQUE,previous_state TEXT NOT NULL,
      stabilization_started_at TEXT NOT NULL,stabilization_deadline TEXT NOT NULL,
      stabilization_completed_at TEXT,cancelled_at TEXT,cancellation_reason TEXT,
      configured_duration_ms INTEGER NOT NULL,actual_duration_ms INTEGER,
      unified_runtime_status TEXT NOT NULL,transition_reason TEXT NOT NULL,status TEXT NOT NULL);`,
  },
  {
    version: 4,
    sql: `CREATE TABLE completed_candle_notifications(
      notification_id TEXT PRIMARY KEY,market_address TEXT NOT NULL,interval TEXT NOT NULL,
      candle_time TEXT NOT NULL,completed_at TEXT NOT NULL,observed_at TEXT NOT NULL,source TEXT NOT NULL,
      status TEXT NOT NULL,created_at TEXT NOT NULL,processed_at TEXT);
    CREATE INDEX completed_candle_notifications_pending ON completed_candle_notifications(status,candle_time);
    CREATE TABLE candle_gap_reconciliations(
      gap_id TEXT PRIMARY KEY,market_address TEXT NOT NULL,interval TEXT NOT NULL,previous_timestamp TEXT NOT NULL,
      expected_timestamp TEXT NOT NULL,next_timestamp TEXT NOT NULL,missing_interval_count INTEGER NOT NULL,
      detected_at TEXT NOT NULL,attempt_count INTEGER NOT NULL DEFAULT 0,last_attempt_at TEXT,repaired_at TEXT,
      status TEXT NOT NULL,reason_code TEXT,response_row_count INTEGER NOT NULL DEFAULT 0,
      inserted_count INTEGER NOT NULL DEFAULT 0,updated_count INTEGER NOT NULL DEFAULT 0,
      unchanged_count INTEGER NOT NULL DEFAULT 0,error_classification TEXT);
    CREATE TABLE candle_continuity_high_water(singleton INTEGER PRIMARY KEY CHECK(singleton=1),candle_time TEXT NOT NULL);`,
  },
];
export class paper_bot_journal {
  private readonly db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path, { timeout: 5000 });
    this.db.pragma('journal_mode = WAL');
    const version = this.db.pragma('user_version', { simple: true }) as number;
    const latest = MIGRATIONS.at(-1)?.version ?? 0;
    if (version > latest) throw new Error('UNSAFE_PAPER_BOT_MIGRATION');
    for (const migration of MIGRATIONS) {
      if (migration.version <= version) continue;
      this.db.transaction(() => {
        this.db.exec(migration.sql);
        this.db.pragma(`user_version = ${migration.version}`);
      })();
    }
  }
  beginEvaluation(id: string, candleTime: string, at: string) {
    return (
      this.db
        .prepare('INSERT OR IGNORE INTO candle_evaluations VALUES(?,?,?,?)')
        .run(id, candleTime, at, 'STARTED').changes === 1
    );
  }
  completeEvaluation(id: string, candleTime: string) {
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE candle_evaluations SET status='COMPLETED' WHERE evaluation_id=?")
        .run(id);
      this.db
        .prepare(
          `INSERT INTO paper_bot_high_water VALUES(1,?)
      ON CONFLICT(singleton)DO UPDATE SET candle_time=excluded.candle_time`,
        )
        .run(candleTime);
    })();
  }
  saveCandidate(input: {
    candidateId: string;
    evaluationId: string;
    candidate: opportunity_candidate;
    decision: string;
    reasons: string[];
    features: feature_gate;
    riskIntentId?: string;
    orderId?: string;
    researchHash?: string;
  }) {
    this.db
      .prepare('INSERT OR IGNORE INTO candidate_decisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        input.candidateId,
        input.evaluationId,
        input.candidate.direction,
        input.candidate.candidateType,
        input.candidate.score,
        input.decision,
        JSON.stringify(input.reasons),
        input.features.featureVersion,
        input.features.featureHash,
        input.riskIntentId ?? null,
        input.orderId ?? null,
        input.researchHash ?? null,
      );
  }
  getHighWaterMark() {
    const row = this.db
      .prepare('SELECT candle_time FROM paper_bot_high_water WHERE singleton=1')
      .get() as { candle_time: string } | undefined;
    return row?.candle_time ?? null;
  }
  setHighWaterMark(candleTime: string) {
    this.db
      .prepare(
        `INSERT INTO paper_bot_high_water VALUES(1,?) ON CONFLICT(singleton)
    DO UPDATE SET candle_time=CASE WHEN excluded.candle_time>candle_time THEN excluded.candle_time ELSE candle_time END`,
      )
      .run(candleTime);
  }
  getCandidateCount() {
    return (
      this.db.prepare('SELECT COUNT(*) AS count FROM candidate_decisions').get() as {
        count: number;
      }
    ).count;
  }
  recordLiveEvaluation(input: {
    evaluationId: string;
    marketAddress: string;
    interval: '5m';
    candleTime: string;
    completedAt: string;
    observedAt: string;
    paperBotState: paper_bot_state;
    mode: paper_bot_mode;
    status: 'SKIPPED' | 'EVALUATED';
    reasonCode: string | null;
    candidateCount: number;
    selectedCandidateId: string | null;
    riskIntentCreated: boolean;
    orderCreated: boolean;
    source: 'LIVE_WEBSOCKET' | 'RECONCILED_DUPLICATE';
  }) {
    return this.db.transaction(() => {
      const inserted =
        this.db
          .prepare(
            'INSERT OR IGNORE INTO live_candle_evaluations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .run(
            input.evaluationId,
            input.marketAddress,
            input.interval,
            input.candleTime,
            input.completedAt,
            input.observedAt,
            input.paperBotState,
            input.mode,
            input.status,
            input.reasonCode,
            input.candidateCount,
            input.selectedCandidateId,
            input.riskIntentCreated ? 1 : 0,
            input.orderCreated ? 1 : 0,
            input.source,
          ).changes === 1;
      if (inserted)
        this.db
          .prepare(
            `INSERT INTO paper_bot_high_water VALUES(1,?) ON CONFLICT(singleton)
        DO UPDATE SET candle_time=excluded.candle_time`,
          )
          .run(input.candleTime);
      return inserted;
    })();
  }
  enqueueCompletedCandle(event: live_completed_candle) {
    return (
      this.db
        .prepare(
          `INSERT OR IGNORE INTO completed_candle_notifications VALUES(?,?,?,?,?,?,?,?,?,NULL)`,
        )
        .run(
          getCompletedCandleNotificationId(event),
          event.marketAddress,
          event.interval,
          event.candleTime,
          event.completedAt,
          event.observedAt,
          event.source,
          'PENDING',
          event.observedAt,
        ).changes === 1
    );
  }
  getNextCompletedCandleNotification(): live_completed_candle | null {
    const row = this.db
      .prepare(
        `SELECT * FROM completed_candle_notifications WHERE status='PENDING' ORDER BY candle_time LIMIT 1`,
      )
      .get() as
      | {
          market_address: string;
          interval: '5m';
          candle_time: string;
          completed_at: string;
          observed_at: string;
          source: 'LIVE_WEBSOCKET';
        }
      | undefined;
    return row === undefined
      ? null
      : {
          marketAddress: row.market_address,
          interval: row.interval,
          candleTime: row.candle_time,
          completedAt: row.completed_at,
          observedAt: row.observed_at,
          source: row.source,
        };
  }
  recordQueuedEvaluation(
    input: Parameters<paper_bot_journal['recordLiveEvaluation']>[0] & { notificationId: string },
  ) {
    return this.db.transaction(() => {
      const inserted = this.recordLiveEvaluation(input);
      this.db
        .prepare(
          `UPDATE completed_candle_notifications SET status='COMPLETED',processed_at=? WHERE notification_id=?`,
        )
        .run(input.observedAt, input.notificationId);
      return inserted;
    })();
  }
  getNotificationCount() {
    return (
      this.db.prepare('SELECT COUNT(*) AS count FROM completed_candle_notifications').get() as {
        count: number;
      }
    ).count;
  }
  getPendingNotificationCount() {
    return (
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM completed_candle_notifications WHERE status='PENDING'",
        )
        .get() as { count: number }
    ).count;
  }
  getPendingReconciliationCount() {
    return (
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM candle_gap_reconciliations WHERE status IN ('DETECTED','FETCHING','RETRY_WAIT')",
        )
        .get() as { count: number }
    ).count;
  }
  getPendingOutboxCount() {
    return (
      this.db
        .prepare('SELECT COUNT(*) AS count FROM paper_bot_outbox WHERE completed_at IS NULL')
        .get() as { count: number }
    ).count;
  }
  checkpoint() {
    this.db.pragma('wal_checkpoint(PASSIVE)');
  }
  detectGap(gap: candle_gap, detectedAt: string) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO candle_gap_reconciliations(
          gap_id,market_address,interval,previous_timestamp,expected_timestamp,next_timestamp,
          missing_interval_count,detected_at,status,reason_code) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        gap.gapId,
        gap.marketAddress,
        gap.interval,
        gap.previousTimestamp,
        gap.expectedTimestamp,
        gap.nextTimestamp,
        gap.missingIntervalCount,
        detectedAt,
        'DETECTED',
        'CANDLE_GAP_DETECTED',
      );
  }
  getPendingGap(): candle_gap | null {
    const row = this.db
      .prepare(
        `SELECT * FROM candle_gap_reconciliations WHERE status IN ('DETECTED','RETRY_WAIT','FETCHING') ORDER BY detected_at LIMIT 1`,
      )
      .get() as Record<string, unknown> | undefined;
    return row === undefined ? null : mapCandleGap(row);
  }
  prepareGapRecovery() {
    this.db
      .prepare(
        `UPDATE candle_gap_reconciliations SET status='RETRY_WAIT',reason_code='CANDLE_GAP_RECONCILIATION_PENDING'
         WHERE status='FETCHING'`,
      )
      .run();
  }
  beginGapReconciliation(gapId: string, at: string) {
    return (
      this.db
        .prepare(
          `UPDATE candle_gap_reconciliations SET status='FETCHING',attempt_count=attempt_count+1,last_attempt_at=?
           WHERE gap_id=? AND status IN ('DETECTED','RETRY_WAIT')`,
        )
        .run(at, gapId).changes === 1
    );
  }
  finishGapReconciliation(gapId: string, outcome: 'REPAIRED' | 'NOT_FOUND', at: string) {
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE candle_gap_reconciliations SET status=?,reason_code=?,repaired_at=CASE WHEN ?='REPAIRED' THEN ? ELSE NULL END WHERE gap_id=?`,
        )
        .run(
          outcome,
          outcome === 'REPAIRED' ? 'CANDLE_GAP_REPAIRED' : 'CANDLE_GAP_NOT_FOUND',
          outcome,
          at,
          gapId,
        );
      if (outcome === 'REPAIRED') {
        const row = this.db
          .prepare('SELECT next_timestamp FROM candle_gap_reconciliations WHERE gap_id=?')
          .get(gapId) as { next_timestamp: string } | undefined;
        if (row !== undefined)
          this.db
            .prepare(
              `INSERT INTO candle_continuity_high_water VALUES(1,?) ON CONFLICT(singleton)
               DO UPDATE SET candle_time=CASE WHEN excluded.candle_time>candle_time THEN excluded.candle_time ELSE candle_time END`,
            )
            .run(row.next_timestamp);
      }
    })();
  }
  getContinuityHighWaterMark() {
    const row = this.db
      .prepare('SELECT candle_time FROM candle_continuity_high_water WHERE singleton=1')
      .get() as { candle_time: string } | undefined;
    return row?.candle_time ?? null;
  }
  failGapReconciliation(gapId: string, reasonCode: string, classification: string) {
    this.db
      .prepare(
        `UPDATE candle_gap_reconciliations SET status='FAILED',reason_code=?,error_classification=? WHERE gap_id=?`,
      )
      .run(reasonCode, classification.slice(0, 500), gapId);
  }
  markGapRetryWait(gapId: string, delayMs: number) {
    this.db
      .prepare(
        `UPDATE candle_gap_reconciliations SET status='RETRY_WAIT',reason_code='CANDLE_GAP_RECONCILIATION_PENDING',
         error_classification=? WHERE gap_id=? AND status='FETCHING'`,
      )
      .run(`RETRYABLE_BACKOFF_${delayMs}MS`, gapId);
  }
  getGapReconciliations() {
    return this.db
      .prepare('SELECT * FROM candle_gap_reconciliations ORDER BY detected_at')
      .all() as Record<string, unknown>[];
  }
  getLiveEvaluation(candleTime: string) {
    return this.db
      .prepare('SELECT * FROM live_candle_evaluations WHERE candle_time=?')
      .get(candleTime) as Record<string, unknown> | undefined;
  }
  getLiveEvaluationCounts() {
    return this.db
      .prepare('SELECT status,COUNT(*) AS count FROM live_candle_evaluations GROUP BY status')
      .all() as Array<{ status: string; count: number }>;
  }
  getLiveEvaluationCount(candleTime: string) {
    return (
      this.db
        .prepare('SELECT COUNT(*) AS count FROM live_candle_evaluations WHERE candle_time=?')
        .get(candleTime) as { count: number }
    ).count;
  }
  beginStabilization(input: {
    previousState: paper_bot_state;
    startedAt: string;
    deadline: string;
    configuredDurationMs: number;
    runtimeStatus: string;
    transitionReason: string;
  }): stabilization_attempt {
    transitionPaperBotState(input.previousState, 'WARMING_UP');
    return this.db.transaction(() => {
      const generation = (
          this.db
            .prepare('SELECT COALESCE(MAX(generation),0)+1 AS value FROM paper_bot_stabilizations')
            .get() as {
            value: number;
          }
        ).value,
        token = `stabilization:${generation}:${input.startedAt}`,
        transitionId = `runtime:${input.previousState}:WARMING_UP:${input.startedAt}`;
      this.db
        .prepare('INSERT INTO paper_bot_transitions VALUES(?,?,?,?)')
        .run(transitionId, input.previousState, 'WARMING_UP', input.startedAt);
      this.writeState('WARMING_UP', input.startedAt);
      this.db
        .prepare(`INSERT INTO paper_bot_stabilizations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          token,
          generation,
          input.previousState,
          input.startedAt,
          input.deadline,
          null,
          null,
          null,
          input.configuredDurationMs,
          null,
          input.runtimeStatus,
          input.transitionReason,
          'ACTIVE',
        );
      return this.getStabilization(token)!;
    })();
  }
  getStabilization(token: string): stabilization_attempt | null {
    const row = this.db
      .prepare('SELECT * FROM paper_bot_stabilizations WHERE token=?')
      .get(token) as Record<string, unknown> | undefined;
    return row === undefined ? null : mapStabilization(row);
  }
  getStabilizations() {
    return (
      this.db.prepare('SELECT * FROM paper_bot_stabilizations ORDER BY generation').all() as Record<
        string,
        unknown
      >[]
    ).map(mapStabilization);
  }
  completeStabilization(
    token: string,
    next: 'OBSERVING' | 'PAPER_ACTIVE',
    completedAt: string,
    runtimeStatus: string,
  ) {
    return this.db.transaction(() => {
      const attempt = this.getStabilization(token);
      if (attempt?.status !== 'ACTIVE') throw new Error('STABILIZATION_ATTEMPT_NOT_ACTIVE');
      const duration = Date.parse(completedAt) - Date.parse(attempt.stabilizationStartedAt);
      if (duration < attempt.configuredStabilizationDurationMs)
        throw new Error('STABILIZATION_DURATION_TOO_SHORT');
      transitionPaperBotState('WARMING_UP', next);
      this.db
        .prepare(
          `UPDATE paper_bot_stabilizations SET stabilization_completed_at=?,actual_duration_ms=?,
           unified_runtime_status=?,transition_reason='HEALTHY_STABILIZATION_COMPLETED',status='COMPLETED'
           WHERE token=? AND status='ACTIVE'`,
        )
        .run(completedAt, duration, runtimeStatus, token);
      this.db
        .prepare('INSERT INTO paper_bot_transitions VALUES(?,?,?,?)')
        .run(`runtime:WARMING_UP:${next}:${completedAt}`, 'WARMING_UP', next, completedAt);
      this.writeState(next, completedAt);
      return this.getStabilization(token)!;
    })();
  }
  cancelStabilization(token: string, next: 'DEGRADED', cancelledAt: string, reason: string) {
    return this.db.transaction(() => {
      const attempt = this.getStabilization(token);
      if (attempt?.status !== 'ACTIVE') return attempt;
      transitionPaperBotState('WARMING_UP', next);
      this.db
        .prepare(
          `UPDATE paper_bot_stabilizations SET cancelled_at=?,cancellation_reason=?,status='CANCELLED'
           WHERE token=? AND status='ACTIVE'`,
        )
        .run(cancelledAt, reason, token);
      this.db
        .prepare('INSERT INTO paper_bot_transitions VALUES(?,?,?,?)')
        .run(`runtime:WARMING_UP:${next}:${cancelledAt}`, 'WARMING_UP', next, cancelledAt);
      this.writeState(next, cancelledAt);
      return this.getStabilization(token);
    })();
  }
  cancelOpenStabilizations(at: string, reason: string) {
    this.db
      .prepare(
        `UPDATE paper_bot_stabilizations SET cancelled_at=?,cancellation_reason=?,status='CANCELLED'
         WHERE status='ACTIVE'`,
      )
      .run(at, reason);
  }
  transition(id: string, from: paper_bot_state, to: paper_bot_state, at: string) {
    transitionPaperBotState(from, to);
    this.db.transaction(() => {
      this.db
        .prepare('INSERT OR IGNORE INTO paper_bot_transitions VALUES(?,?,?,?)')
        .run(id, from, to, at);
      this.writeState(to, at);
    })();
  }
  private writeState(state: paper_bot_state, at: string) {
    const stateHash = createHash('sha256').update(`${state}|${at}`).digest('hex');
    this.db
      .prepare(
        `INSERT INTO paper_bot_state VALUES(1,?,?,?)ON CONFLICT(singleton)DO UPDATE SET state=excluded.state,state_hash=excluded.state_hash,
      updated_at=excluded.updated_at`,
      )
      .run(state, stateHash, at);
  }
  getSchemaVersion() {
    return this.db.pragma('user_version', { simple: true }) as number;
  }
  close() {
    this.db.close();
  }
}
function mapStabilization(row: Record<string, unknown>): stabilization_attempt {
  const value = row as {
    token: string;
    generation: number;
    previous_state: string;
    stabilization_started_at: string;
    stabilization_deadline: string;
    stabilization_completed_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    configured_duration_ms: number;
    actual_duration_ms: number | null;
    unified_runtime_status: string;
    status: string;
  };
  return {
    token: value.token,
    generation: value.generation,
    previousState: value.previous_state as paper_bot_state,
    stabilizationStartedAt: value.stabilization_started_at,
    stabilizationDeadline: value.stabilization_deadline,
    stabilizationCompletedAt: value.stabilization_completed_at,
    cancelledAt: value.cancelled_at,
    cancellationReason: value.cancellation_reason,
    configuredStabilizationDurationMs: value.configured_duration_ms,
    actualStabilizationDurationMs: value.actual_duration_ms,
    unifiedDataRuntimeStatus: value.unified_runtime_status,
    status: value.status as stabilization_attempt['status'],
  };
}
function mapCandleGap(row: Record<string, unknown>): candle_gap {
  return {
    gapId: String(row.gap_id),
    marketAddress: String(row.market_address),
    interval: '5m',
    previousTimestamp: String(row.previous_timestamp),
    expectedTimestamp: String(row.expected_timestamp),
    nextTimestamp: String(row.next_timestamp),
    missingIntervalCount: Number(row.missing_interval_count),
  };
}
export type execution_result = {
  riskIntentId: string;
  orderId: string;
  approvedLeverage: 40;
  allocatedMargin: number;
  quantity: number;
};
export class paper_bot_orchestrator {
  private state: paper_bot_state = 'STARTING';
  private accepting = false;
  constructor(
    private readonly Journal: paper_bot_journal,
    private readonly config: ReturnType<typeof normalizePaperBotConfiguration>,
    private readonly execute: (candidate: opportunity_candidate) => execution_result,
    private readonly now: () => string,
  ) {}
  recover(highWater: string) {
    this.setState('RECOVERING');
    this.Journal.completeEvaluation(`recovery:${highWater}`, highWater);
    this.setState('WARMING_UP');
  }
  enable(healthy: boolean) {
    if (!healthy) {
      this.setState('DEGRADED');
      return;
    }
    this.setState(this.config.mode === 'OBSERVE_ONLY' ? 'OBSERVING' : 'PAPER_ACTIVE');
    this.accepting = true;
  }
  evaluateCompletedCandle(
    candleTime: string,
    candidates: readonly opportunity_candidate[],
    features: Map<string, feature_gate>,
    support: research_support | null = null,
  ) {
    if (!this.accepting || !['OBSERVING', 'PAPER_ACTIVE'].includes(this.state))
      return { status: 'BLOCKED', selected: null };
    const evaluationId = `evaluation:${candleTime}`;
    if (!this.Journal.beginEvaluation(evaluationId, candleTime, this.now()))
      return { status: 'DUPLICATE', selected: null };
    const ordered = prioritizeCandidates(candidates);
    let selected: string | null = null;
    for (const candidate of ordered) {
      const id = getCandidateIdentity(candidate),
        feature = features.get(id);
      let reasons =
        feature === undefined ? ['MICROSTRUCTURE_NOT_AVAILABLE'] : getFeatureReasonCodes(feature);
      let decision = 'REJECTED';
      if (this.config.mode === 'OBSERVE_ONLY') {
        decision = 'OBSERVED';
        reasons = ['OBSERVE_ONLY'];
      } else if (reasons.length === 0) {
        if (
          this.config.mode === 'PAPER_EXECUTE_SUPPORTED_EDGE_ONLY' &&
          !validateResearchSupport(support, {
            featureVersion: feature!.featureVersion,
            candidatePolicyVersion: ENGINEERING_PAPER_POLICY_VERSION,
            makerSimulatorVersion: 'POST_ONLY_MAKER_V1',
            minimumSamples: this.config.researchMinimumSamples,
            maximumAgeHours: this.config.researchMaximumAgeHours,
            now: this.now(),
          })
        )
          reasons = ['RESEARCH_SUPPORT_UNAVAILABLE'];
        else if (selected === null) {
          const result = this.execute(candidate);
          selected = id;
          decision = 'PAPER_EXECUTION_SELECTED';
          this.Journal.saveCandidate({
            candidateId: id,
            evaluationId,
            candidate,
            decision,
            reasons,
            features: feature!,
            riskIntentId: result.riskIntentId,
            orderId: result.orderId,
            ...(support === null ? {} : { researchHash: support.reportHash }),
          });
          continue;
        } else reasons = ['LOWER_PRIORITY_OVERLAP'];
      }
      this.Journal.saveCandidate({
        candidateId: id,
        evaluationId,
        candidate,
        decision,
        reasons,
        features: feature ?? {
          window15: 'INVALID',
          window60: 'INVALID',
          window300: 'INVALID',
          compatibleSession: false,
          microstructureAvailable: false,
          futureDataDetected: false,
          featureVersion: 'UNAVAILABLE',
          featureHash: 'UNAVAILABLE',
        },
      });
    }
    this.Journal.completeEvaluation(evaluationId, candleTime);
    return { status: 'COMPLETED', selected };
  }
  pause() {
    this.accepting = false;
    this.setState('PAUSED');
  }
  degrade() {
    this.accepting = false;
    this.setState('DEGRADED');
  }
  shutdown() {
    if (this.state !== 'STOPPING') this.setState('STOPPING');
    this.accepting = false;
    this.setState('STOPPED');
  }
  getState() {
    return this.state;
  }
  private setState(next: paper_bot_state) {
    const previous = this.state;
    this.state = transitionPaperBotState(previous, next);
    this.Journal.transition(
      `transition:${previous}:${next}:${this.now()}`,
      previous,
      next,
      this.now(),
    );
  }
}
