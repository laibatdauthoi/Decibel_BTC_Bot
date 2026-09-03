import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  evaluateDecibelAuthenticatedPassiveRecyclingV1,
  type DecibelAuthenticatedPassiveRecyclingEvaluationV1,
  type decibel_authenticated_passive_recycling_input_v1,
  type decibel_recycling_action_v1,
} from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import {
  buildDecibelExecutionIntentV1,
  type execution_intent_v1,
} from './decibel_execution_intent_v1.js';
import {
  decibel_execution_lifecycle_v1,
  type execution_mutation_budget_v1,
  type reconciliation_state_v1,
} from './decibel_execution_lifecycle_v1.js';
import type { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import {
  decibel_production_executor_gate_v1,
  type DecibelProductionExecutionExecutorV1,
} from './decibel_production_executor_handoff_v1.js';
import {
  parseDecibelProductionExecutionConfigV1,
  type decibel_production_release_stage_v1,
} from './decibel_production_execution_v1.js';

export const DECIBEL_PRODUCTION_LIVE_ORCHESTRATOR_V1 =
  'DECIBEL_PRODUCTION_LIVE_ORCHESTRATOR_V1' as const;
export const DECIBEL_PRODUCTION_REPRICE_POLICY_V1 = 'BEHIND_5_TICKS' as const;

const positiveInteger = z.coerce.number().int().positive();
const ProductionLiveEnvironmentSchema = z.object({
  DECIBEL_EXECUTION_MODE: z.literal('production'),
  DECIBEL_EXECUTION_RELEASE_STAGE: z.enum(['DISABLED', 'CANARY', 'AUTONOMOUS']).default('DISABLED'),
  DECIBEL_EXECUTOR_ENABLED: z.enum(['true', 'false']).default('false'),
  DECIBEL_EXECUTOR_DRY_RUN: z.enum(['true', 'false']).default('false'),
  DECIBEL_PRODUCTION_EXECUTOR_MODULE: z.string().min(1).optional(),
  DECIBEL_PRODUCTION_LIVE_SOURCE_MODULE: z.string().min(1).optional(),
  DECIBEL_EXECUTION_JOURNAL_PATH: z.string().min(1).default('data/decibel_execution_v1.sqlite'),
  DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH: z.string().min(1).optional(),
  DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH: z.string().min(1).optional(),
  DECIBEL_PRODUCTION_LIVE_POLL_INTERVAL_MS: positiveInteger.default(5_000),
  DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS: positiveInteger.default(10_000),
  DECIBEL_PRODUCTION_LIVE_MAX_CONSECUTIVE_READ_FAILURES: positiveInteger.default(3),
  DECIBEL_PRODUCTION_LIVE_SHUTDOWN_TIMEOUT_MS: positiveInteger.default(15_000),
  DECIBEL_PRODUCTION_LIVE_MAX_CYCLES: positiveInteger.optional(),
});

export type decibel_production_live_configuration_v1 = Readonly<{
  releaseStage: decibel_production_release_stage_v1;
  executorEnabled: boolean;
  dryRun: boolean;
  executorModulePath: string | null;
  sourceModulePath: string | null;
  journalPath: string;
  reconciledCanaryEvidenceHash?: string;
  requiredCanaryEvidenceHash?: string;
  pollIntervalMs: number;
  readTimeoutMs: number;
  maxConsecutiveReadFailures: number;
  shutdownTimeoutMs: number;
  maxCycles: number | null;
}>;

export type decibel_production_live_snapshot_v1 = Readonly<{
  input: decibel_authenticated_passive_recycling_input_v1;
  sourceStateHash: string;
  minimumNotionalUsd: number;
  maximumNotionalUsd: number;
}>;

export interface DecibelProductionLiveStateSourceV1 {
  readAuthenticatedSnapshot(): Promise<decibel_production_live_snapshot_v1>;
  reconcileIntent(
    intentId: string,
    snapshot: decibel_production_live_snapshot_v1,
  ): Promise<reconciliation_state_v1>;
  close?(): Promise<void> | void;
}

export type decibel_production_live_cycle_result_v1 = Readonly<{
  version: typeof DECIBEL_PRODUCTION_LIVE_ORCHESTRATOR_V1;
  action:
    | 'RECONCILE_ONLY'
    | 'HOLD'
    | 'BLOCKED'
    | 'DRY_RUN_PREPARED'
    | 'DUPLICATE_SUPPRESSED'
    | 'RECONCILIATION_REQUIRED'
    | 'ACKNOWLEDGED'
    | 'REJECTED';
  intentId: string | null;
  blocker: string | null;
  evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1 | null;
  mutationInvocations: number;
}>;

export function parseDecibelProductionLiveConfigurationV1(
  environment: NodeJS.ProcessEnv,
): decibel_production_live_configuration_v1 {
  const parsed = ProductionLiveEnvironmentSchema.parse(environment);
  const execution = parseDecibelProductionExecutionConfigV1(environment);
  return Object.freeze({
    releaseStage: execution.releaseStage,
    executorEnabled: execution.executorEnabled,
    dryRun: execution.dryRun,
    executorModulePath: execution.modulePath,
    sourceModulePath: parsed.DECIBEL_PRODUCTION_LIVE_SOURCE_MODULE ?? null,
    journalPath: parsed.DECIBEL_EXECUTION_JOURNAL_PATH,
    ...(execution.canaryEvidenceHash
      ? { reconciledCanaryEvidenceHash: execution.canaryEvidenceHash }
      : {}),
    ...(execution.requiredCanaryEvidenceHash
      ? { requiredCanaryEvidenceHash: execution.requiredCanaryEvidenceHash }
      : {}),
    pollIntervalMs: parsed.DECIBEL_PRODUCTION_LIVE_POLL_INTERVAL_MS,
    readTimeoutMs: parsed.DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS,
    maxConsecutiveReadFailures: parsed.DECIBEL_PRODUCTION_LIVE_MAX_CONSECUTIVE_READ_FAILURES,
    shutdownTimeoutMs: parsed.DECIBEL_PRODUCTION_LIVE_SHUTDOWN_TIMEOUT_MS,
    maxCycles: parsed.DECIBEL_PRODUCTION_LIVE_MAX_CYCLES ?? null,
  });
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isAligned(value: number, increment: number): boolean {
  const units = value / increment;
  return Number.isFinite(units) && Math.abs(units - Math.round(units)) <= 1e-8;
}

function shouldReplaceBehindFiveTicks(
  action: decibel_recycling_action_v1,
  snapshot: decibel_production_live_snapshot_v1,
): boolean {
  if (action.action !== 'WOULD_REPLACE' || action.current === null || action.desired === null)
    return false;
  const tickSize = snapshot.input.metadata.tickSize;
  if (!isAligned(action.current.price, tickSize) || !isAligned(action.desired.price, tickSize))
    throw new Error('PRODUCTION_REPRICE_PRICE_NOT_TICK_ALIGNED');
  const currentTicks = Math.round(action.current.price / tickSize);
  const desiredTicks = Math.round(action.desired.price / tickSize);
  const bestBidTicks = Math.round(snapshot.input.book.bestBid / tickSize);
  const bestAskTicks = Math.round(snapshot.input.book.bestAsk / tickSize);
  const unsafe =
    action.side === 'BUY'
      ? currentTicks > bestBidTicks
      : action.side === 'SELL'
        ? currentTicks < bestAskTicks
        : true;
  return unsafe || Math.abs(desiredTicks - currentTicks) >= 5;
}

function selectMutation(
  evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1,
  snapshot: decibel_production_live_snapshot_v1,
): decibel_recycling_action_v1 | null {
  const actions = evaluation.actions.filter((action) => action.action !== 'NO_OP');
  if (actions.some((action) => action.action === 'BLOCKED')) return null;
  const cancel = actions.find((action) => action.action === 'WOULD_CANCEL');
  if (cancel !== undefined) return cancel;
  const replacement = actions.find(
    (action) => action.action === 'WOULD_REPLACE' && shouldReplaceBehindFiveTicks(action, snapshot),
  );
  if (replacement !== undefined) return replacement;
  if (snapshot.input.openOrders.length > 0) return null;
  return actions.find((action) => action.action === 'WOULD_PLACE') ?? null;
}

function buildIntent(
  action: decibel_recycling_action_v1,
  evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1,
  snapshot: decibel_production_live_snapshot_v1,
  cycleSequence: number,
): execution_intent_v1 {
  const cancel = action.action === 'WOULD_CANCEL' || action.action === 'WOULD_REPLACE';
  const order = cancel ? action.current : action.desired;
  if (order === null || action.side === null)
    throw new Error('PRODUCTION_EXECUTION_ACTION_INVALID');
  return buildDecibelExecutionIntentV1({
    sessionId: snapshot.input.sessionId,
    cycleSequence,
    action: cancel ? 'CANCEL' : 'PLACE',
    market: 'BTC/USD',
    side: action.side,
    price: order.price,
    quantity: order.quantity,
    tickSize: snapshot.input.metadata.tickSize,
    lotSize: snapshot.input.metadata.lotSize,
    clientOrderId: order.clientOrderId,
    knownVenueOrderId: cancel && action.current !== null ? action.current.venueOrderId : null,
    sourceStateHash: snapshot.sourceStateHash,
    strategyDecisionHash: hash({ evaluation, action }),
    createdAt: snapshot.input.now,
  });
}

export class decibel_production_live_orchestrator_v1 {
  private readonly Lifecycle: decibel_execution_lifecycle_v1;
  private cycleSequence = 0;

  public constructor(
    private readonly Journal: decibel_execution_lifecycle_journal_v1,
    private readonly Source: DecibelProductionLiveStateSourceV1,
    executor: DecibelProductionExecutionExecutorV1,
    private readonly Config: decibel_production_live_configuration_v1,
    budget: execution_mutation_budget_v1,
  ) {
    if (Config.releaseStage === 'DISABLED' || !Config.executorEnabled) {
      // The constructor remains non-mutating; evaluateOnce records the blocker.
    }
    const Gate = new decibel_production_executor_gate_v1(executor, {
      executorEnabled: Config.executorEnabled,
      releaseStage: Config.releaseStage === 'AUTONOMOUS' ? 'AUTONOMOUS' : 'CANARY',
      ...(Config.reconciledCanaryEvidenceHash
        ? { reconciledCanaryEvidenceHash: Config.reconciledCanaryEvidenceHash }
        : {}),
      ...(Config.requiredCanaryEvidenceHash
        ? { requiredCanaryEvidenceHash: Config.requiredCanaryEvidenceHash }
        : {}),
    });
    this.Lifecycle = new decibel_execution_lifecycle_v1(Journal, Gate, budget);
  }

  public async evaluateOnce(): Promise<decibel_production_live_cycle_result_v1> {
    this.cycleSequence += 1;
    if (this.Config.dryRun) this.Journal.supersedeDryRunOnlyPrepared(Date.now());
    const recovery = this.Lifecycle.recover()[0];
    if (recovery !== undefined) {
      const snapshot = await this.readSnapshot();
      const reconciliation = await this.Source.reconcileIntent(recovery.intentId, snapshot);
      this.Lifecycle.reconcile(recovery.intentId, reconciliation, snapshot.input.now);
      return this.result('RECONCILE_ONLY', recovery.intentId, null, null, 0);
    }
    const snapshot = await this.readSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input);
    if (evaluation.status === 'FAIL_CLOSED') {
      const blocker = evaluation.blockers[0] ?? 'PRODUCTION_AUTHENTICATED_READ_REQUIRED';
      this.Journal.recordBlocker(null, blocker, snapshot.input.now);
      return this.result('BLOCKED', null, blocker, evaluation, 0);
    }
    const action = selectMutation(evaluation, snapshot);
    if (action === null) return this.result('HOLD', null, null, evaluation, 0);
    if (this.Config.releaseStage === 'DISABLED' || !this.Config.executorEnabled) {
      this.Journal.recordBlocker(null, 'EXECUTION_KILL_SWITCH_ACTIVE', snapshot.input.now);
      return this.result('BLOCKED', null, 'EXECUTION_KILL_SWITCH_ACTIVE', evaluation, 0);
    }
    const current = await this.readSnapshot();
    if (current.sourceStateHash !== snapshot.sourceStateHash) {
      this.Journal.recordBlocker(null, 'EXECUTION_STATE_CHANGED_BEFORE_INTENT', current.input.now);
      return this.result('BLOCKED', null, 'EXECUTION_STATE_CHANGED_BEFORE_INTENT', evaluation, 0);
    }
    const intent = buildIntent(action, evaluation, snapshot, this.cycleSequence);
    if (this.Config.dryRun) {
      const prepared = this.Journal.prepare(intent);
      if (!prepared.duplicate) {
        this.Journal.recordBlocker(
          intent.intentId,
          'PRODUCTION_DRY_RUN_MUTATION_BLOCKED',
          snapshot.input.now,
        );
        this.Journal.transition(intent.intentId, 'SUPERSEDED', snapshot.input.now);
      }
      return this.result(
        prepared.duplicate ? 'DUPLICATE_SUPPRESSED' : 'DRY_RUN_PREPARED',
        intent.intentId,
        null,
        evaluation,
        0,
      );
    }
    const outcome = await this.Lifecycle.submit(intent, {
      now: snapshot.input.now,
      ...(intent.action === 'PLACE'
        ? {
            preflight: {
              tickSize: snapshot.input.metadata.tickSize,
              lotSize: snapshot.input.metadata.lotSize,
              minimumNotionalUsd: snapshot.minimumNotionalUsd,
              maximumNotionalUsd: snapshot.maximumNotionalUsd,
              permittedSide: intent.side,
            },
          }
        : {}),
    });
    return this.result(
      outcome.status,
      intent.intentId,
      null,
      evaluation,
      outcome.status === 'DUPLICATE_SUPPRESSED' ? 0 : 1,
    );
  }

  public async close(): Promise<void> {
    await this.Source.close?.();
    this.Journal.close();
  }

  private async readSnapshot(): Promise<decibel_production_live_snapshot_v1> {
    try {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const expiry = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('PRODUCTION_AUTHENTICATED_READ_TIMEOUT')),
          this.Config.readTimeoutMs,
        );
      });
      try {
        return await Promise.race([this.Source.readAuthenticatedSnapshot(), expiry]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    } catch (error) {
      const now = Date.now();
      this.Journal.recordBlocker(null, 'PRODUCTION_AUTHENTICATED_READ_REQUIRED', now);
      throw new Error('PRODUCTION_AUTHENTICATED_READ_REQUIRED', { cause: error });
    }
  }

  private result(
    action: decibel_production_live_cycle_result_v1['action'],
    intentId: string | null,
    blocker: string | null,
    evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1 | null,
    mutationInvocations: number,
  ): decibel_production_live_cycle_result_v1 {
    return Object.freeze({
      version: DECIBEL_PRODUCTION_LIVE_ORCHESTRATOR_V1,
      action,
      intentId,
      blocker,
      evaluation,
      mutationInvocations,
    });
  }
}

export async function runDecibelProductionLiveLoopV1(input: {
  orchestrator: Pick<decibel_production_live_orchestrator_v1, 'evaluateOnce' | 'close'>;
  configuration: decibel_production_live_configuration_v1;
  signal: AbortSignal;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  onCycle?: (result: decibel_production_live_cycle_result_v1) => void;
}): Promise<Readonly<{ cycles: number; mutationInvocations: number; stopped: true }>> {
  const sleep =
    input.sleep ??
    ((milliseconds: number, signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        const timeout = setTimeout(resolve, milliseconds);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
      }));
  let cycles = 0;
  let mutationInvocations = 0;
  let consecutiveReadFailures = 0;
  try {
    while (!input.signal.aborted && (input.configuration.maxCycles ?? Infinity) > cycles) {
      try {
        const result = await input.orchestrator.evaluateOnce();
        cycles += 1;
        mutationInvocations += result.mutationInvocations;
        consecutiveReadFailures = 0;
        input.onCycle?.(result);
      } catch (error) {
        consecutiveReadFailures += 1;
        if (
          consecutiveReadFailures >= input.configuration.maxConsecutiveReadFailures ||
          !(error instanceof Error) ||
          error.message !== 'PRODUCTION_AUTHENTICATED_READ_REQUIRED'
        )
          throw error;
      }
      if (!input.signal.aborted && (input.configuration.maxCycles ?? Infinity) > cycles)
        await sleep(input.configuration.pollIntervalMs, input.signal);
    }
    return Object.freeze({ cycles, mutationInvocations, stopped: true as const });
  } finally {
    await input.orchestrator.close();
  }
}
