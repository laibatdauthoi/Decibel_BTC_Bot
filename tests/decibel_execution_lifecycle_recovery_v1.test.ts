import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDecibelExecutionIntentV1 } from '../src/decibel_execution_intent_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import {
  decibel_execution_lifecycle_v1,
  type DecibelExecutionExecutorV1,
  type execution_result_v1,
} from '../src/decibel_execution_lifecycle_v1.js';

class decibel_mock_lifecycle_executor_v1 implements DecibelExecutionExecutorV1 {
  readonly mcpMutationCalls = 0;
  readonly venueMutations = 0;
  mockMutationAttempts = 0;
  constructor(private readonly Script: execution_result_v1[]) {}
  private next(): execution_result_v1 {
    this.mockMutationAttempts += 1;
    const result = this.Script.shift();
    if (result === undefined) throw new Error('MOCK_LIFECYCLE_SCRIPT_EXHAUSTED');
    return result;
  }
  placePostOnlyLimit(): Promise<execution_result_v1> {
    return Promise.resolve(this.next());
  }
  cancelExactOrder(): Promise<execution_result_v1> {
    return Promise.resolve(this.next());
  }
}

const intent = () =>
  buildDecibelExecutionIntentV1({
    sessionId: 's',
    cycleSequence: 1,
    action: 'PLACE',
    market: 'BTC/USD',
    side: 'BUY',
    price: 100,
    quantity: 0.1,
    tickSize: 0.1,
    lotSize: 0.01,
    clientOrderId: 'c',
    knownVenueOrderId: null,
    sourceStateHash: 'state',
    strategyDecisionHash: 'decision',
    createdAt: 1,
  });
describe('Decibel lifecycle crash recovery V1', () => {
  it.each(['PREPARED', 'SUBMITTING', 'ACKNOWLEDGED'] as const)(
    'recovers %s as reconciliation-only without mutation',
    (status) => {
      const path = join(mkdtempSync(join(tmpdir(), 'recover-')), 'j.sqlite');
      let journal = new decibel_execution_lifecycle_journal_v1(path);
      const value = intent();
      journal.prepare(value);
      if (status !== 'PREPARED')
        journal.transition(
          value.intentId,
          status,
          2,
          status === 'ACKNOWLEDGED' ? 'order' : undefined,
        );
      journal.close();
      journal = new decibel_execution_lifecycle_journal_v1(path);
      const executor = new decibel_mock_lifecycle_executor_v1([]);
      const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, {
        maxPlaceAttemptsPerMinute: 1,
        maxCancelAttemptsPerMinute: 1,
        maxTotalMutationAttemptsPerMinute: 1,
        maxConsecutiveUnknownOutcomes: 1,
      });
      expect(lifecycle.recover()).toEqual([{ intentId: value.intentId, action: 'RECONCILE_ONLY' }]);
      expect(executor.mockMutationAttempts).toBe(0);
      journal.close();
    },
  );
  it.each(['PREPARED', 'SUBMITTING', 'SUBMIT_UNKNOWN'] as const)(
    'does not supersede real %s recovery state without the dry-run marker',
    (status) => {
      const journal = new decibel_execution_lifecycle_journal_v1(
        join(mkdtempSync(join(tmpdir(), 'recover-real-')), 'j.sqlite'),
      );
      const value = intent();
      journal.prepare(value);
      if (status !== 'PREPARED') journal.transition(value.intentId, status, 2);
      expect(journal.supersedeDryRunOnlyPrepared(3)).toBe(0);
      expect(journal.nonTerminal()).toEqual([
        { intentId: value.intentId, status, venueOrderId: null },
      ]);
      journal.close();
    },
  );
  it('closes a confirmed pre-submission ABI failure without deleting journal history', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'recover-abi-')), 'j.sqlite'),
    );
    const value = intent();
    journal.prepare(value);
    journal.transition(value.intentId, 'SUBMITTING', 2);
    journal.attempt(value.intentId, 2);
    journal.recordOutcome(value.intentId, { outcome: 'PLACE_TIMEOUT_UNKNOWN' }, 2);
    journal.transition(value.intentId, 'SUBMIT_UNKNOWN', 2);

    expect(
      journal.resolvePreSubmissionAbiFailure({
        intentId: value.intentId,
        at: 3,
        confirmation: 'APTOS_REMOTE_ABI_NON_INTEGER_CONFIRMED',
      }),
    ).toEqual({ duplicate: false });
    expect(journal.get(value.intentId)?.status).toBe('REJECTED');
    expect(journal.nonTerminal()).toEqual([]);
    expect(
      journal.resolvePreSubmissionAbiFailure({
        intentId: value.intentId,
        at: 4,
        confirmation: 'APTOS_REMOTE_ABI_NON_INTEGER_CONFIRMED',
      }),
    ).toEqual({ duplicate: true });
    expect(journal.mutationAttemptsSince(0)).toBe(1);
    journal.close();
  });
  it('refuses to close an unknown intent after reconciliation evidence exists', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'recover-abi-refuse-')), 'j.sqlite'),
    );
    const value = intent();
    journal.prepare(value);
    journal.transition(value.intentId, 'SUBMITTING', 2);
    journal.attempt(value.intentId, 2);
    journal.recordOutcome(value.intentId, { outcome: 'PLACE_TIMEOUT_UNKNOWN' }, 2);
    journal.transition(value.intentId, 'SUBMIT_UNKNOWN', 2);
    journal.recordReconciliation(value.intentId, 'ORDER_NOT_FOUND', null, 3);
    expect(() =>
      journal.resolvePreSubmissionAbiFailure({
        intentId: value.intentId,
        at: 4,
        confirmation: 'APTOS_REMOTE_ABI_NON_INTEGER_CONFIRMED',
      }),
    ).toThrow('EXECUTION_PRE_SUBMISSION_FAILURE_RESOLUTION_REJECTED');
    expect(journal.get(value.intentId)?.status).toBe('SUBMIT_UNKNOWN');
    journal.close();
  });
  it('full BUY then SELL authenticated maker fills conserve inventory and complete one cycle', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'cycle-')), 'j.sqlite'),
    );
    journal.applyFill({
      fillId: 'buy',
      intentId: null,
      side: 'BUY',
      quantity: 0.1,
      price: 100,
      strategyLineage: true,
      makerProven: true,
      externalCounterparty: true,
      observedAt: 1,
    });
    const result = journal.applyFill({
      fillId: 'sell',
      intentId: null,
      side: 'SELL',
      quantity: 0.1,
      price: 101,
      strategyLineage: true,
      makerProven: true,
      externalCounterparty: true,
      observedAt: 2,
    });
    if (Math.abs(result.inventory) < 1e-12) journal.incrementCycles();
    expect(journal.ledger()).toMatchObject({
      inventory: 0,
      completedCycles: 1,
      strategyMakerVolume: 20.1,
    });
    journal.close();
  });
});
