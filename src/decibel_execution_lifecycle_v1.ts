import type {
  cancel_intent_v1,
  execution_intent_v1,
  place_intent_v1,
} from './decibel_execution_intent_v1.js';
import {
  execution_preflight_rejection_v1,
  validateDecibelPlaceIntentV1,
} from './decibel_execution_intent_v1.js';
import type { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';

/** Fresh final-admission limits replace the planning-time preflight as a unit. */
export type execution_submission_validation_v1 = Readonly<{
  preflight: Parameters<typeof validateDecibelPlaceIntentV1>[1];
  observedAt?: number;
  independentProtectiveRecoveryIntentIds?: readonly string[];
  verifiedEntryCancelOwnerIntentIds?: readonly string[];
  assertSubmissionStillAuthorized?: () => void;
}>;

export type execution_result_v1 = Readonly<{
  outcome:
    | 'PLACE_ACCEPTED'
    | 'PLACE_REJECTED'
    | 'PLACE_TIMEOUT_UNKNOWN'
    | 'CANCEL_CONFIRMED'
    | 'CANCEL_REJECTED'
    | 'CANCEL_TIMEOUT_UNKNOWN';
  venueOrderId?: string;
  transactionHash?: string;
  expirationTimestampMs?: number;
  diagnosticCode?: 'EXECUTION_SUBMISSION_WATCHDOG_TIMEOUT';
}>;
export type reconciliation_state_v1 =
  | 'ORDER_OPEN'
  | 'PARTIAL_FILL'
  | 'FULL_FILL'
  | 'ORDER_CANCELLED'
  | 'ORDER_NOT_FOUND'
  | 'CANCELLED_EXTERNALLY'
  | 'EXTERNALLY_NEUTRALIZED'
  | 'INTENT_FAILED_TIMEOUT'
  | 'DROPPED_EXPIRED'
  | 'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED';
export interface DecibelExecutionExecutorV1 {
  placePostOnlyLimit(intent: place_intent_v1): Promise<execution_result_v1>;
  placeReduceOnlyImmediateOrCancel?(intent: place_intent_v1): Promise<execution_result_v1>;
  cancelExactOrder(intent: cancel_intent_v1): Promise<execution_result_v1>;
}
export type execution_mutation_budget_v1 = Readonly<{
  maxPlaceAttemptsPerMinute: number;
  maxCancelAttemptsPerMinute: number;
  maxTotalMutationAttemptsPerMinute: number;
  maxConsecutiveUnknownOutcomes: number;
  maxKnownLiveOrders?: number;
  submissionTimeoutMs?: number;
}>;
export type execution_mutation_budget_state_v1 = Readonly<{
  available: boolean;
  nextAvailableAt: number | null;
  reason: 'ACTION_LIMIT' | 'TOTAL_LIMIT' | 'UNKNOWN_OUTCOME_LIMIT' | null;
}>;

export class decibel_execution_lifecycle_v1 {
  private consecutiveUnknownOutcomes = 0;
  constructor(
    private readonly Journal: decibel_execution_lifecycle_journal_v1,
    private readonly Executor: DecibelExecutionExecutorV1,
    private readonly Budget: execution_mutation_budget_v1,
    private readonly getNow: () => number = Date.now,
    private readonly validateSubmission?: (
      intent: execution_intent_v1,
    ) =>
      | Promise<void | execution_submission_validation_v1>
      | void
      | execution_submission_validation_v1,
  ) {
    if (
      Budget.submissionTimeoutMs !== undefined &&
      (!Number.isSafeInteger(Budget.submissionTimeoutMs) || Budget.submissionTimeoutMs <= 0)
    )
      throw new Error('EXECUTION_SUBMISSION_TIMEOUT_INVALID');
  }
  async submit(
    intent: execution_intent_v1,
    input: { now: number; preflight?: Parameters<typeof validateDecibelPlaceIntentV1>[1] },
  ) {
    const pendingValidation = this.validateSubmission?.(intent);
    const validation = pendingValidation === undefined ? undefined : await pendingValidation;
    validation?.assertSubmissionStillAuthorized?.();
    const preflight = validation?.preflight ?? input.preflight;
    const admissionAt = input.now;
    const identityConflict =
      this.Journal.getActiveIdentityConflicts().find(
        (conflict) =>
          !(
            intent.action === 'PLACE' &&
            intent.reduceOnly &&
            intent.timeInForce === 'PostOnly' &&
            validation?.independentProtectiveRecoveryIntentIds?.includes(conflict.intentId)
          ),
      ) ?? null;
    const strategicMutation =
      intent.action === 'PLACE' ||
      (intent.action === 'CANCEL' && intent.cancelReason.startsWith('REPRICE:'));
    if (identityConflict !== null && strategicMutation)
      throw new execution_preflight_rejection_v1(identityConflict.blocker);
    this.assertBudget(intent.action, input.now);
    const prepared = this.Journal.claimForSubmission(
      intent,
      validation?.independentProtectiveRecoveryIntentIds,
      validation?.verifiedEntryCancelOwnerIntentIds,
    );
    if (prepared.duplicate)
      return { status: 'DUPLICATE_SUPPRESSED' as const, intentId: prepared.intentId };
    this.recordStageAt(intent.intentId, 'STRATEGY_ADMISSION_COMPLETE', admissionAt, admissionAt);
    if (intent.action === 'PLACE') {
      if (
        this.Journal.countKnownLiveOrders(
          intent.intentId,
          validation?.independentProtectiveRecoveryIntentIds,
        ) >= (this.Budget.maxKnownLiveOrders ?? 1)
      ) {
        this.Journal.recordBlocker(
          intent.intentId,
          'EXECUTION_SINGLE_LIVE_ORDER_BLOCKED',
          input.now,
        );
        this.Journal.transition(intent.intentId, 'REJECTED', input.now);
        throw new Error('EXECUTION_SINGLE_LIVE_ORDER_BLOCKED');
      }
      if (preflight === undefined) throw new Error('EXECUTION_PREFLIGHT_REJECTED');
      try {
        validation?.assertSubmissionStillAuthorized?.();
        validateDecibelPlaceIntentV1(intent, preflight);
        this.recordStage(intent.intentId, 'PREFLIGHT_COMPLETE', admissionAt);
      } catch (error) {
        this.Journal.recordBlocker(intent.intentId, 'EXECUTION_PREFLIGHT_REJECTED', input.now);
        this.Journal.transition(intent.intentId, 'REJECTED', input.now);
        throw error;
      }
    }
    this.Journal.transition(intent.intentId, 'SUBMITTING', input.now);
    this.Journal.attempt(intent.intentId, input.now);
    this.recordStage(intent.intentId, 'JOURNAL_PERSISTENCE_COMPLETE', admissionAt);
    let result: execution_result_v1;
    try {
      this.recordStage(intent.intentId, 'EXECUTOR_SUBMISSION_STARTED', admissionAt);
      const submission =
        intent.action === 'PLACE'
          ? intent.timeInForce === 'ImmediateOrCancel'
            ? (this.Executor.placeReduceOnlyImmediateOrCancel?.(intent) ??
              Promise.reject(new Error('EXECUTION_SESSION_UNWIND_IOC_UNSUPPORTED')))
            : this.Executor.placePostOnlyLimit(intent)
          : this.Executor.cancelExactOrder(intent);
      result = await this.waitForSubmissionOutcome(intent.action, submission);
    } catch (error) {
      const failedAt = this.getNow();
      this.recordStageAt(intent.intentId, 'EXECUTOR_SUBMISSION_FAILED', admissionAt, failedAt);
      this.consecutiveUnknownOutcomes += 1;
      this.Journal.recordBlocker(
        intent.intentId,
        'EXECUTION_SUBMISSION_EXCEPTION_OUTCOME_UNKNOWN',
        failedAt,
      );
      this.Journal.transition(intent.intentId, 'SUBMIT_UNKNOWN', failedAt);
      throw error;
    }
    const outcomeAt = this.getNow();
    this.recordStageAt(intent.intentId, 'EXECUTOR_OUTCOME_RECEIVED', admissionAt, outcomeAt);
    this.Journal.recordOutcome(intent.intentId, result, outcomeAt);
    if (result.outcome.endsWith('TIMEOUT_UNKNOWN')) {
      if (result.diagnosticCode !== undefined)
        this.Journal.recordBlocker(intent.intentId, result.diagnosticCode, outcomeAt);
      this.consecutiveUnknownOutcomes += 1;
      this.Journal.transition(intent.intentId, 'SUBMIT_UNKNOWN', outcomeAt);
      return {
        status: 'RECONCILIATION_REQUIRED' as const,
        intentId: intent.intentId,
        blocker: result.diagnosticCode ?? null,
      };
    }
    this.consecutiveUnknownOutcomes = 0;
    if (result.outcome.endsWith('REJECTED')) {
      this.Journal.transition(intent.intentId, 'REJECTED', outcomeAt);
      return { status: 'REJECTED' as const, intentId: intent.intentId, blocker: result.outcome };
    }
    this.recordStageAt(intent.intentId, 'VENUE_ACK_RECEIVED', admissionAt, outcomeAt);
    this.Journal.transition(intent.intentId, 'ACKNOWLEDGED', outcomeAt, result.venueOrderId);
    return { status: 'ACKNOWLEDGED' as const, intentId: intent.intentId };
  }

  private async waitForSubmissionOutcome(
    action: 'PLACE' | 'CANCEL',
    submission: Promise<execution_result_v1>,
  ): Promise<execution_result_v1> {
    const timeoutMs = this.Budget.submissionTimeoutMs ?? 30_000;
    let Timeout: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<execution_result_v1>((resolve) => {
      Timeout = setTimeout(
        () =>
          resolve({
            outcome: action === 'PLACE' ? 'PLACE_TIMEOUT_UNKNOWN' : 'CANCEL_TIMEOUT_UNKNOWN',
            diagnosticCode: 'EXECUTION_SUBMISSION_WATCHDOG_TIMEOUT',
          }),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([submission, timeout]);
    } finally {
      if (Timeout !== undefined) clearTimeout(Timeout);
    }
  }
  reconcile(
    intentId: string,
    state: reconciliation_state_v1,
    at: number,
  ): { nextAction: 'HOLD' | 'PLACE_ALLOWED' | 'INVENTORY_RECALCULATION' } {
    const intent = this.Journal.get(intentId);
    if (intent === null) throw new Error('EXECUTION_INTENT_NOT_FOUND');
    this.Journal.transition(intentId, 'RECONCILING', at);
    this.Journal.recordReconciliation(intentId, state, intent.venueOrderId, at);
    this.Journal.recordExecutionStage(
      intentId,
      'AUTHORITATIVE_RECONCILIATION_COMPLETE',
      at,
      Math.max(0, at - intent.createdAt),
    );
    // Authoritative venue evidence resolves the uncertainty that consumed the
    // unknown-outcome budget. Unresolved observations never reach this method.
    this.consecutiveUnknownOutcomes = 0;
    if (state === 'ORDER_OPEN') {
      this.Journal.transition(intentId, 'ACKNOWLEDGED', at);
      return { nextAction: 'HOLD' };
    }
    this.Journal.transition(
      intentId,
      state === 'CANCELLED_EXTERNALLY'
        ? 'CANCELLED_EXTERNALLY'
        : state === 'INTENT_FAILED_TIMEOUT'
          ? 'FAILED_TIMEOUT'
          : state === 'DROPPED_EXPIRED'
            ? 'FAILED_DROPPED'
            : state === 'EXTERNALLY_NEUTRALIZED' ||
                state === 'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED'
              ? 'EXTERNALLY_NEUTRALIZED'
              : 'APPLIED',
      at,
    );
    return {
      nextAction:
        state === 'PARTIAL_FILL' || state === 'FULL_FILL'
          ? 'INVENTORY_RECALCULATION'
          : 'PLACE_ALLOWED',
    };
  }
  acknowledgeAuthoritativeReconciliation(): void {
    this.consecutiveUnknownOutcomes = 0;
  }
  recover(): readonly { intentId: string; action: 'RECONCILE_ONLY' }[] {
    return this.Journal.nonTerminal().map((intent) => ({
      intentId: intent.intentId,
      action: 'RECONCILE_ONLY' as const,
    }));
  }
  getMutationBudgetState(
    action: 'PLACE' | 'CANCEL',
    now: number,
  ): execution_mutation_budget_state_v1 {
    const since = now - 60_000;
    if (this.consecutiveUnknownOutcomes >= this.Budget.maxConsecutiveUnknownOutcomes)
      return Object.freeze({
        available: false,
        nextAvailableAt: null,
        reason: 'UNKNOWN_OUTCOME_LIMIT',
      });
    const actionLimit =
      action === 'PLACE'
        ? this.Budget.maxPlaceAttemptsPerMinute
        : this.Budget.maxCancelAttemptsPerMinute;
    const actionBlocked = this.Journal.mutationAttemptsSince(since, action) >= actionLimit;
    const totalBlocked =
      this.Journal.mutationAttemptsSince(since) >= this.Budget.maxTotalMutationAttemptsPerMinute;
    if (!actionBlocked && !totalBlocked)
      return Object.freeze({ available: true, nextAvailableAt: null, reason: null });
    const actionAvailableAt = actionBlocked
      ? (this.Journal.oldestMutationAttemptAtSince(since, action) ?? now) + 60_001
      : now;
    const totalAvailableAt = totalBlocked
      ? (this.Journal.oldestMutationAttemptAtSince(since) ?? now) + 60_001
      : now;
    return Object.freeze({
      available: false,
      nextAvailableAt: Math.max(actionAvailableAt, totalAvailableAt),
      reason: actionBlocked ? 'ACTION_LIMIT' : 'TOTAL_LIMIT',
    });
  }
  private assertBudget(action: 'PLACE' | 'CANCEL', now: number): void {
    if (!this.getMutationBudgetState(action, now).available) {
      this.Journal.recordBlocker(null, 'EXECUTION_MUTATION_BUDGET_BLOCKED', now);
      throw new Error('EXECUTION_MUTATION_BUDGET_BLOCKED');
    }
  }
  private recordStage(intentId: string, stage: string, admissionAt: number): void {
    this.recordStageAt(intentId, stage, admissionAt, this.getNow());
  }
  private recordStageAt(
    intentId: string,
    stage: string,
    admissionAt: number,
    observedAt: number,
  ): void {
    this.Journal.recordExecutionStage(
      intentId,
      stage,
      observedAt,
      Math.max(0, observedAt - admissionAt),
    );
  }
}
