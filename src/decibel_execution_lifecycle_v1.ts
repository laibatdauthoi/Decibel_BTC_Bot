import type {
  cancel_intent_v1,
  execution_intent_v1,
  place_intent_v1,
} from './decibel_execution_intent_v1.js';
import { validateDecibelPlaceIntentV1 } from './decibel_execution_intent_v1.js';
import type { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';

export type execution_result_v1 = Readonly<{
  outcome:
    | 'PLACE_ACCEPTED'
    | 'PLACE_REJECTED'
    | 'PLACE_TIMEOUT_UNKNOWN'
    | 'CANCEL_CONFIRMED'
    | 'CANCEL_REJECTED'
    | 'CANCEL_TIMEOUT_UNKNOWN';
  venueOrderId?: string;
}>;
export type reconciliation_state_v1 =
  'ORDER_OPEN' | 'PARTIAL_FILL' | 'FULL_FILL' | 'ORDER_CANCELLED' | 'ORDER_NOT_FOUND';
export interface DecibelExecutionExecutorV1 {
  placePostOnlyLimit(intent: place_intent_v1): Promise<execution_result_v1>;
  cancelExactOrder(intent: cancel_intent_v1): Promise<execution_result_v1>;
}
export type execution_mutation_budget_v1 = Readonly<{
  maxPlaceAttemptsPerMinute: number;
  maxCancelAttemptsPerMinute: number;
  maxTotalMutationAttemptsPerMinute: number;
  maxConsecutiveUnknownOutcomes: number;
}>;

export class decibel_execution_lifecycle_v1 {
  private consecutiveUnknownOutcomes = 0;
  constructor(
    private readonly Journal: decibel_execution_lifecycle_journal_v1,
    private readonly Executor: DecibelExecutionExecutorV1,
    private readonly Budget: execution_mutation_budget_v1,
  ) {}
  async submit(
    intent: execution_intent_v1,
    input: { now: number; preflight?: Parameters<typeof validateDecibelPlaceIntentV1>[1] },
  ) {
    const prepared = this.Journal.prepare(intent);
    if (prepared.duplicate)
      return { status: 'DUPLICATE_SUPPRESSED' as const, intentId: intent.intentId };
    if (intent.action === 'PLACE') {
      if (this.Journal.hasOtherKnownLiveOrder(intent.intentId)) {
        this.Journal.recordBlocker(
          intent.intentId,
          'EXECUTION_SINGLE_LIVE_ORDER_BLOCKED',
          input.now,
        );
        this.Journal.transition(intent.intentId, 'REJECTED', input.now);
        throw new Error('EXECUTION_SINGLE_LIVE_ORDER_BLOCKED');
      }
      if (input.preflight === undefined) throw new Error('EXECUTION_PREFLIGHT_REJECTED');
      try {
        validateDecibelPlaceIntentV1(intent, input.preflight);
      } catch (error) {
        this.Journal.recordBlocker(intent.intentId, 'EXECUTION_PREFLIGHT_REJECTED', input.now);
        this.Journal.transition(intent.intentId, 'REJECTED', input.now);
        throw error;
      }
    }
    this.assertBudget(intent.action, input.now);
    this.Journal.transition(intent.intentId, 'SUBMITTING', input.now);
    this.Journal.attempt(intent.intentId, input.now);
    const result =
      intent.action === 'PLACE'
        ? await this.Executor.placePostOnlyLimit(intent)
        : await this.Executor.cancelExactOrder(intent);
    this.Journal.recordOutcome(intent.intentId, result, input.now);
    if (result.outcome.endsWith('TIMEOUT_UNKNOWN')) {
      this.consecutiveUnknownOutcomes += 1;
      this.Journal.transition(intent.intentId, 'SUBMIT_UNKNOWN', input.now);
      return { status: 'RECONCILIATION_REQUIRED' as const, intentId: intent.intentId };
    }
    this.consecutiveUnknownOutcomes = 0;
    if (result.outcome.endsWith('REJECTED')) {
      this.Journal.transition(intent.intentId, 'REJECTED', input.now);
      return { status: 'REJECTED' as const, intentId: intent.intentId };
    }
    this.Journal.transition(intent.intentId, 'ACKNOWLEDGED', input.now, result.venueOrderId);
    return { status: 'ACKNOWLEDGED' as const, intentId: intent.intentId };
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
    if (state === 'ORDER_OPEN') {
      this.Journal.transition(intentId, 'ACKNOWLEDGED', at);
      return { nextAction: 'HOLD' };
    }
    this.Journal.transition(intentId, 'APPLIED', at);
    return {
      nextAction:
        state === 'PARTIAL_FILL' || state === 'FULL_FILL'
          ? 'INVENTORY_RECALCULATION'
          : 'PLACE_ALLOWED',
    };
  }
  recover(): readonly { intentId: string; action: 'RECONCILE_ONLY' }[] {
    return this.Journal.nonTerminal().map((intent) => ({
      intentId: intent.intentId,
      action: 'RECONCILE_ONLY' as const,
    }));
  }
  private assertBudget(action: 'PLACE' | 'CANCEL', now: number): void {
    const since = now - 60_000;
    const actionLimit =
      action === 'PLACE'
        ? this.Budget.maxPlaceAttemptsPerMinute
        : this.Budget.maxCancelAttemptsPerMinute;
    if (
      this.Journal.mutationAttemptsSince(since, action) >= actionLimit ||
      this.Journal.mutationAttemptsSince(since) >= this.Budget.maxTotalMutationAttemptsPerMinute ||
      this.consecutiveUnknownOutcomes >= this.Budget.maxConsecutiveUnknownOutcomes
    ) {
      this.Journal.recordBlocker(null, 'EXECUTION_MUTATION_BUDGET_BLOCKED', now);
      throw new Error('EXECUTION_MUTATION_BUDGET_BLOCKED');
    }
  }
}
