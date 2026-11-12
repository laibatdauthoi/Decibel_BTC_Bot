import { deriveDecibelSessionTradingLimitsV1 } from '../src/decibel_operator_settings_v1.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  execution_preflight_rejection_v1,
  buildDecibelExecutionIntentV1,
  validateDecibelPlaceIntentV1,
  type cancel_intent_v1,
  type place_intent_v1,
} from '../src/decibel_execution_intent_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import {
  decibel_execution_lifecycle_v1,
  type DecibelExecutionExecutorV1,
  type execution_result_v1,
} from '../src/decibel_execution_lifecycle_v1.js';

class decibel_mainnet_mutation_blocked_executor_v1 implements DecibelExecutionExecutorV1 {
  readonly mcpMutationCalls = 0;
  readonly venueMutations = 0;
  placePostOnlyLimit(): Promise<execution_result_v1> {
    return Promise.reject(new Error('MAINNET_MUTATION_NOT_ENABLED'));
  }
  cancelExactOrder(): Promise<execution_result_v1> {
    return Promise.reject(new Error('MAINNET_MUTATION_NOT_ENABLED'));
  }
}

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

const dbPath = () => join(mkdtempSync(join(tmpdir(), 'lifecycle-')), 'journal.sqlite');
const place = (cycleSequence = 1) =>
  buildDecibelExecutionIntentV1({
    sessionId: 's',
    cycleSequence,
    action: 'PLACE',
    market: 'BTC/USD',
    side: 'BUY',
    price: 100,
    quantity: 0.1,
    tickSize: 0.1,
    lotSize: 0.01,
    clientOrderId: `c${cycleSequence}`,
    knownVenueOrderId: null,
    sourceStateHash: 'state',
    strategyDecisionHash: 'decision',
    createdAt: 1_000,
  }) as place_intent_v1;
const cancel = (cycleSequence = 1) =>
  buildDecibelExecutionIntentV1({
    sessionId: 's',
    cycleSequence,
    action: 'CANCEL',
    market: 'BTC/USD',
    side: 'BUY',
    price: 100,
    quantity: 0.1,
    tickSize: 0.1,
    lotSize: 0.01,
    clientOrderId: `cancel-${cycleSequence}`,
    knownVenueOrderId: 'venue-order-1',
    sourceStateHash: 'state',
    strategyDecisionHash: 'decision',
    cancelReason: 'REPRICE:TEST',
    createdAt: 1_000,
  }) as cancel_intent_v1;
const sell = (cycleSequence = 1) =>
  buildDecibelExecutionIntentV1({
    sessionId: 's',
    cycleSequence,
    action: 'PLACE',
    market: 'BTC/USD',
    side: 'SELL',
    price: 100.2,
    quantity: 0.1,
    tickSize: 0.1,
    lotSize: 0.01,
    clientOrderId: `sell-${cycleSequence}`,
    knownVenueOrderId: null,
    sourceStateHash: 'state',
    strategyDecisionHash: 'decision',
    createdAt: 1_000,
  }) as place_intent_v1;
const limits = {
  tickSize: 0.1,
  lotSize: 0.01,
  minimumNotionalUsd: 5,
  maximumNotionalUsd: 20,
  permittedSide: 'BUY' as const,
};
const budget = {
  maxPlaceAttemptsPerMinute: 2,
  maxCancelAttemptsPerMinute: 2,
  maxTotalMutationAttemptsPerMinute: 3,
  maxConsecutiveUnknownOutcomes: 1,
};

describe('Decibel execution lifecycle boundary V1', () => {
  it.each(['BUY', 'SELL'] as const)(
    'uses reconciled residual exit evidence and refuses a fresh partial-fill overrun (%s)',
    async (side) => {
      const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
      const executor = new decibel_mock_lifecycle_executor_v1([
        { outcome: 'PLACE_ACCEPTED', venueOrderId: 'fresh-exit' },
      ]);
      const base = side === 'BUY' ? place() : sell();
      const intent = {
        ...base,
        reduceOnly: true,
        executionRole: 'INVENTORY_REDUCING_MAKER' as const,
      };
      const fresh = {
        ...limits,
        permittedSide: side,
        minimumSize: 0.01,
        maximumReductionQuantity: 0.1,
        currentPositionBase: side === 'SELL' ? 0.1 : -0.1,
        openOrders: [],
      };
      const stale = { ...fresh, openOrders: [{ side, quantity: 0.1 }] };
      expect(() => validateDecibelPlaceIntentV1(intent, stale)).toThrow(
        execution_preflight_rejection_v1,
      );
      const lifecycle = new decibel_execution_lifecycle_v1(
        journal,
        executor,
        budget,
        () => 1000,
        () => ({ preflight: fresh }),
      );
      try {
        expect(await lifecycle.submit(intent, { now: 1000, preflight: stale })).toMatchObject({
          status: 'ACKNOWLEDGED',
        });
        const partialJournal = new decibel_execution_lifecycle_journal_v1(dbPath());
        const changed = new decibel_execution_lifecycle_v1(
          partialJournal,
          executor,
          budget,
          () => 1000,
          () => ({
            preflight: {
              ...fresh,
              maximumReductionQuantity: 0.09,
              currentPositionBase: side === 'SELL' ? 0.09 : -0.09,
            },
          }),
        );
        try {
          await expect(
            changed.submit(
              {
                ...intent,
                intentId: `${intent.intentId}-partial`,
                mutationKey: `${intent.mutationKey}-partial`,
                clientOrderId: `${intent.clientOrderId}-partial`,
              },
              { now: 1001, preflight: fresh },
            ),
          ).rejects.toMatchObject({
            rejectionCode: 'EXECUTION_PREFLIGHT_REDUCTION_WOULD_CROSS_FLAT',
          });
          expect(executor.mockMutationAttempts).toBe(1);
        } finally {
          partialJournal.close();
        }
      } finally {
        journal.close();
      }
    },
  );
  it.each(['BUY', 'SELL'] as const)(
    'uses the fresh final read set rather than a contradictory planning cap (%s)',
    async (side) => {
      const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
      const executor = new decibel_mock_lifecycle_executor_v1([
        { outcome: 'PLACE_ACCEPTED', venueOrderId: 'fresh-order' },
      ]);
      const intent = side === 'BUY' ? place() : sell();
      const fresh = { ...limits, permittedSide: side, maximumNotionalUsd: 20 };
      const stale = { ...fresh, maximumNotionalUsd: 5 };
      // This is the old composition: fresh Source validation passed, then the
      // lifecycle rejected the same intent against the planning-time read set.
      expect(() => validateDecibelPlaceIntentV1(intent, fresh)).not.toThrow();
      expect(() => validateDecibelPlaceIntentV1(intent, stale)).toThrow(
        execution_preflight_rejection_v1,
      );
      const lifecycle = new decibel_execution_lifecycle_v1(
        journal,
        executor,
        budget,
        () => 1000,
        () => Promise.resolve({ preflight: fresh }),
      );
      try {
        expect(await lifecycle.submit(intent, { now: 1000, preflight: stale })).toMatchObject({
          status: 'ACKNOWLEDGED',
        });
        expect(executor.mockMutationAttempts).toBe(1);
        expect(await lifecycle.submit(intent, { now: 1001, preflight: stale })).toMatchObject({
          status: 'DUPLICATE_SUPPRESSED',
        });
        expect(executor.mockMutationAttempts).toBe(1);
      } finally {
        journal.close();
      }
    },
  );

  it.each(['BUY', 'SELL'] as const)(
    'retains the fresh final cap even when the planning cap would admit (%s)',
    async (side) => {
      const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
      const executor = new decibel_mock_lifecycle_executor_v1([]);
      const intent = side === 'BUY' ? place() : sell();
      const lifecycle = new decibel_execution_lifecycle_v1(
        journal,
        executor,
        budget,
        () => 1000,
        () => ({ preflight: { ...limits, permittedSide: side, maximumNotionalUsd: 5 } }),
      );
      try {
        await expect(
          lifecycle.submit(intent, { now: 1000, preflight: { ...limits, permittedSide: side } }),
        ).rejects.toMatchObject({ rejectionCode: 'EXECUTION_PREFLIGHT_NOTIONAL_ABOVE_MAXIMUM' });
        expect(journal.get(intent.intentId)?.status).toBe('REJECTED');
        expect(executor.mockMutationAttempts).toBe(0);
      } finally {
        journal.close();
      }
    },
  );
  it('revalidates durable identity safety at the final mutation boundary', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mock_lifecycle_executor_v1([
      { outcome: 'CANCEL_CONFIRMED', venueOrderId: 'venue-order-1' },
    ]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget);
    journal.recordIdentityConflict('ambiguous-identity', 900);

    await expect(
      lifecycle.submit(place(), { now: 1_000, preflight: limits }),
    ).rejects.toMatchObject({ rejectionCode: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT' });
    await expect(lifecycle.submit(cancel(), { now: 1_001 })).rejects.toMatchObject({
      rejectionCode: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
    });
    expect(executor.mockMutationAttempts).toBe(0);

    const safetyCancel = { ...cancel(2), cancelReason: 'UNSAFE:SELF_TRADE_RISK' };
    await expect(lifecycle.submit(safetyCancel, { now: 1_002 })).resolves.toMatchObject({
      status: 'ACKNOWLEDGED',
    });
    expect(executor.mockMutationAttempts).toBe(1);
    journal.close();
  });

  it('persists distinct stage timing across awaited submission and reconciliation', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    let now = 1_010;
    const executor: DecibelExecutionExecutorV1 = {
      placePostOnlyLimit: () => {
        now = 1_025;
        return Promise.resolve({ outcome: 'PLACE_ACCEPTED', venueOrderId: 'timed-order' });
      },
      cancelExactOrder: () => Promise.resolve({ outcome: 'CANCEL_CONFIRMED' }),
    };
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget, () => now);
    const intent = place();

    await lifecycle.submit(intent, { now: 1_000, preflight: limits });
    now = 1_040;
    lifecycle.reconcile(intent.intentId, 'FULL_FILL', now);

    expect(journal.getExecutionStageTimings(intent.intentId)).toEqual([
      { stage: 'STRATEGY_ADMISSION_COMPLETE', observedAt: 1_000, elapsedMs: 0 },
      { stage: 'PREFLIGHT_COMPLETE', observedAt: 1_010, elapsedMs: 10 },
      { stage: 'JOURNAL_PERSISTENCE_COMPLETE', observedAt: 1_010, elapsedMs: 10 },
      { stage: 'EXECUTOR_SUBMISSION_STARTED', observedAt: 1_010, elapsedMs: 10 },
      { stage: 'EXECUTOR_OUTCOME_RECEIVED', observedAt: 1_025, elapsedMs: 25 },
      { stage: 'VENUE_ACK_RECEIVED', observedAt: 1_025, elapsedMs: 25 },
      {
        stage: 'AUTHORITATIVE_RECONCILIATION_COMPLETE',
        observedAt: 1_040,
        elapsedMs: 40,
      },
    ]);
    journal.close();
  });
  it('requires and persists an explicit reason for every cancel intent', () => {
    const explained = cancel();
    expect(explained.cancelReason).toBe('REPRICE:TEST');
    expect(() =>
      buildDecibelExecutionIntentV1({
        ...explained,
        cycleSequence: 2,
        cancelReason: undefined,
      }),
    ).toThrow('CANCEL_REASON_REQUIRED');
  });

  it('never strands an executor exception in SUBMITTING state', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mainnet_mutation_blocked_executor_v1();
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget);
    const intent = place();
    await expect(lifecycle.submit(intent, { now: 1_000, preflight: limits })).rejects.toThrow(
      'MAINNET_MUTATION_NOT_ENABLED',
    );
    expect(journal.get(intent.intentId)).toMatchObject({ status: 'SUBMIT_UNKNOWN' });
    expect(lifecycle.recover()).toEqual([{ intentId: intent.intentId, action: 'RECONCILE_ONLY' }]);
    journal.close();
  });
  it('moves a hung submission to SUBMIT_UNKNOWN after the bounded watchdog', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    let placeCalls = 0;
    const executor: DecibelExecutionExecutorV1 = {
      placePostOnlyLimit: () => {
        placeCalls += 1;
        return new Promise<execution_result_v1>(() => undefined);
      },
      cancelExactOrder: () => Promise.resolve({ outcome: 'CANCEL_CONFIRMED' }),
    };
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, {
      ...budget,
      submissionTimeoutMs: 5,
    });
    const intent = place();

    await expect(lifecycle.submit(intent, { now: 1_000, preflight: limits })).resolves.toEqual({
      status: 'RECONCILIATION_REQUIRED',
      intentId: intent.intentId,
      blocker: 'EXECUTION_SUBMISSION_WATCHDOG_TIMEOUT',
    });
    expect(journal.get(intent.intentId)).toMatchObject({ status: 'SUBMIT_UNKNOWN' });
    expect(journal.getSubmissionTelemetry(intent.intentId)).toBeNull();
    expect(lifecycle.recover()).toEqual([{ intentId: intent.intentId, action: 'RECONCILE_ONLY' }]);
    expect(placeCalls).toBe(1);
    journal.close();
  });
  it('mainnet executor fails closed with zero mutations', async () => {
    const executor = new decibel_mainnet_mutation_blocked_executor_v1();
    await expect(executor.placePostOnlyLimit(place())).rejects.toThrow(
      'MAINNET_MUTATION_NOT_ENABLED',
    );
    expect([executor.mcpMutationCalls, executor.venueMutations]).toEqual([0, 0]);
  });
  it('invalid preflight rejects before executor invocation', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mock_lifecycle_executor_v1([
      { outcome: 'PLACE_ACCEPTED', venueOrderId: 'o' },
    ]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget);
    await expect(
      lifecycle.submit(place(), { now: 1_000, preflight: { ...limits, permittedSide: 'SELL' } }),
    ).rejects.toThrow('EXECUTION_PREFLIGHT_REJECTED');
    expect(executor.mockMutationAttempts).toBe(0);
    journal.close();
  });
  it('suppresses duplicate place and cancel mutation keys', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mock_lifecycle_executor_v1([
      { outcome: 'PLACE_ACCEPTED', venueOrderId: 'o' },
    ]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget);
    const intent = place();
    await lifecycle.submit(intent, { now: 1_000, preflight: limits });
    expect(await lifecycle.submit(intent, { now: 1_001, preflight: limits })).toMatchObject({
      status: 'DUPLICATE_SUPPRESSED',
    });
    expect(executor.mockMutationAttempts).toBe(1);
    journal.close();
  });
  it('rejects a reused place client order identity before a second executor call', async () => {
    const journalPath = dbPath();
    const journal = new decibel_execution_lifecycle_journal_v1(journalPath);
    const executor = new decibel_mock_lifecycle_executor_v1([
      { outcome: 'PLACE_ACCEPTED', venueOrderId: 'o' },
    ]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget);
    const first = place(1);
    const second = { ...place(2), clientOrderId: first.clientOrderId };
    await lifecycle.submit(first, { now: 1_000, preflight: limits });
    await expect(lifecycle.submit(second, { now: 1_001, preflight: limits })).rejects.toThrow(
      'EXECUTION_CLIENT_ORDER_ID_ALREADY_USED',
    );
    expect(executor.mockMutationAttempts).toBe(1);
    journal.close();

    const restarted = new decibel_execution_lifecycle_journal_v1(journalPath);
    const restartedExecutor = new decibel_mock_lifecycle_executor_v1([]);
    const restartedLifecycle = new decibel_execution_lifecycle_v1(
      restarted,
      restartedExecutor,
      budget,
    );
    await expect(
      restartedLifecycle.submit(second, { now: 1_002, preflight: limits }),
    ).rejects.toThrow('EXECUTION_CLIENT_ORDER_ID_ALREADY_USED');
    expect(restartedExecutor.mockMutationAttempts).toBe(0);
    restarted.close();
  });

  it('suppresses a new mutation while another intent remains non-terminal', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mock_lifecycle_executor_v1([
      { outcome: 'PLACE_ACCEPTED', venueOrderId: 'o' },
    ]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget);
    const first = place(1);
    await lifecycle.submit(first, { now: 1_000, preflight: limits });
    await expect(lifecycle.submit(place(2), { now: 1_001, preflight: limits })).resolves.toEqual({
      status: 'DUPLICATE_SUPPRESSED',
      intentId: first.intentId,
    });
    expect(executor.mockMutationAttempts).toBe(1);
    journal.close();
  });

  it('allows one independent bid and one independent ask intent', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mock_lifecycle_executor_v1([
      { outcome: 'PLACE_ACCEPTED', venueOrderId: 'bid-order' },
      { outcome: 'PLACE_ACCEPTED', venueOrderId: 'ask-order' },
    ]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, {
      ...budget,
      maxKnownLiveOrders: 2,
    });
    const bid = place(1);
    const ask = sell(2);
    await expect(lifecycle.submit(bid, { now: 1_000, preflight: limits })).resolves.toMatchObject({
      status: 'ACKNOWLEDGED',
    });
    await expect(
      lifecycle.submit(ask, {
        now: 1_001,
        preflight: { ...limits, permittedSide: 'SELL' },
      }),
    ).resolves.toMatchObject({ status: 'ACKNOWLEDGED' });
    expect(executor.mockMutationAttempts).toBe(2);
    expect(journal.nonTerminal()).toHaveLength(2);
    journal.close();
  });
  it('unknown place outcome requires reconciliation and budget blocks blind retry', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mock_lifecycle_executor_v1([{ outcome: 'PLACE_TIMEOUT_UNKNOWN' }]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget);
    expect(await lifecycle.submit(place(), { now: 1_000, preflight: limits })).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
    });
    await expect(lifecycle.submit(place(2), { now: 1_001, preflight: limits })).rejects.toThrow(
      'EXECUTION_MUTATION_BUDGET_BLOCKED',
    );
    expect(lifecycle.recover()[0]).toMatchObject({ action: 'RECONCILE_ONLY' });
    expect(journal.countIntents()).toBe(1);
    journal.close();
  });
  it('releases the unknown-outcome budget after authoritative open-order reconciliation', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mock_lifecycle_executor_v1([{ outcome: 'PLACE_TIMEOUT_UNKNOWN' }]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget);
    const first = place();
    expect(await lifecycle.submit(first, { now: 1_000, preflight: limits })).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
    });
    expect(lifecycle.getMutationBudgetState('PLACE', 1_001)).toMatchObject({
      available: false,
      nextAvailableAt: null,
      reason: 'UNKNOWN_OUTCOME_LIMIT',
    });
    lifecycle.reconcile(first.intentId, 'ORDER_OPEN', 1_002);
    expect(lifecycle.getMutationBudgetState('PLACE', 1_003)).toEqual({
      available: true,
      nextAvailableAt: null,
      reason: null,
    });
    journal.close();
  });
  it('replenishes the rolling mutation budget without leaving a blocked prepared intent', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mock_lifecycle_executor_v1([
      { outcome: 'CANCEL_CONFIRMED' },
      { outcome: 'CANCEL_CONFIRMED' },
    ]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, {
      ...budget,
      maxCancelAttemptsPerMinute: 1,
      maxTotalMutationAttemptsPerMinute: 1,
    });
    await lifecycle.submit(cancel(1), { now: 1_000 });
    await expect(lifecycle.submit(cancel(2), { now: 1_001 })).rejects.toThrow(
      'EXECUTION_MUTATION_BUDGET_BLOCKED',
    );
    expect(lifecycle.getMutationBudgetState('CANCEL', 1_001)).toEqual({
      available: false,
      nextAvailableAt: 61_001,
      reason: 'ACTION_LIMIT',
    });
    expect(journal.countIntents()).toBe(1);
    expect(lifecycle.getMutationBudgetState('CANCEL', 61_001)).toEqual({
      available: true,
      nextAvailableAt: null,
      reason: null,
    });
    lifecycle.reconcile(cancel(1).intentId, 'ORDER_CANCELLED', 61_001);
    await expect(lifecycle.submit(cancel(2), { now: 61_002 })).resolves.toMatchObject({
      status: 'ACKNOWLEDGED',
    });
    expect(executor.mockMutationAttempts).toBe(2);
    journal.close();
  });
  it('suppresses duplicate cancel and invokes the mock executor once', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mock_lifecycle_executor_v1([{ outcome: 'CANCEL_CONFIRMED' }]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget);
    const intent = cancel();
    await lifecycle.submit(intent, { now: 1_000 });
    expect(await lifecycle.submit(intent, { now: 1_001 })).toMatchObject({
      status: 'DUPLICATE_SUPPRESSED',
    });
    expect(executor.mockMutationAttempts).toBe(1);
    journal.close();
  });
  it('unknown cancel outcome requires reconciliation before replacement', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mock_lifecycle_executor_v1([
      { outcome: 'CANCEL_TIMEOUT_UNKNOWN' },
    ]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget);
    const intent = cancel();
    expect(await lifecycle.submit(intent, { now: 1_000 })).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
    });
    expect(lifecycle.getMutationBudgetState('CANCEL', 1_001)).toMatchObject({
      available: false,
      reason: 'UNKNOWN_OUTCOME_LIMIT',
    });
    expect(lifecycle.reconcile(intent.intentId, 'ORDER_CANCELLED', 1_001)).toEqual({
      nextAction: 'PLACE_ALLOWED',
    });
    expect(lifecycle.getMutationBudgetState('CANCEL', 1_001)).toEqual({
      available: true,
      nextAvailableAt: null,
      reason: null,
    });
    expect(executor.mockMutationAttempts).toBe(1);
    journal.close();
  });
  it('keeps a legacy residual until exact closing fills are replayed atomically and idempotently across restart', () => {
    const path = dbPath();
    let Journal = new decibel_execution_lifecycle_journal_v1(path);
    const open = {
      fillId: 'historical-open',
      intentId: null,
      side: 'BUY' as const,
      quantity: 0.00014,
      price: 79320.8,
      strategyLineage: true,
      makerProven: true,
      externalCounterparty: true,
      observedAt: 1000,
    };
    Journal.applyFill(open);
    expect(Journal.ledger().inventory).toBe(0.00014);
    Journal.close();
    Journal = new decibel_execution_lifecycle_journal_v1(path);
    // Venue FLAT alone is not inserted as a fill or a scalar reset.
    expect(Journal.ledger().inventory).toBe(0.00014);
    const close = {
      ...open,
      fillId: 'exact-authenticated-close',
      side: 'SELL' as const,
      price: 79291.8,
      observedAt: 2000,
    };
    Journal.applyFill(close);
    expect(Journal.ledger().inventory).toBe(0);
    expect(Journal.applyFill(close).duplicate).toBe(true);
    expect(() => Journal.applyFill({ ...close, quantity: 0.00013 })).toThrow(
      'EXECUTION_AUTHENTICATED_FILL_IDENTITY_CONFLICT',
    );
    Journal.close();
    Journal = new decibel_execution_lifecycle_journal_v1(path);
    expect(Journal.ledger().inventory).toBe(0);
    expect(Journal.applyFill(open).duplicate).toBe(true);
    expect(Journal.ledger().inventory).toBe(0);
    Journal.close();
  });
  it('authenticated fills update account inventory and only proven lineage updates strategy volume', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const first = journal.applyFill({
      fillId: 'f1',
      intentId: null,
      side: 'BUY',
      quantity: 0.1,
      price: 100,
      strategyLineage: true,
      makerProven: true,
      externalCounterparty: true,
      observedAt: 1,
    });
    expect(first).toMatchObject({ inventory: 0.1, strategyMakerVolume: 10 });
    const partial = journal.applyFill({
      fillId: 'f2',
      intentId: null,
      side: 'SELL',
      quantity: 0.04,
      price: 101,
      strategyLineage: true,
      makerProven: true,
      externalCounterparty: true,
      observedAt: 2,
    });
    expect(partial.inventory).toBeCloseTo(0.06);
    const out = journal.applyFill({
      fillId: 'f3',
      intentId: null,
      side: 'SELL',
      quantity: 0.06,
      price: 101,
      strategyLineage: false,
      makerProven: true,
      externalCounterparty: true,
      observedAt: 3,
    });
    expect(out.inventory).toBeCloseTo(0);
    expect(out.strategyMakerVolume).toBeCloseTo(14.04);
    expect(
      journal.applyFill({
        fillId: 'f3',
        intentId: null,
        side: 'SELL',
        quantity: 0.06,
        price: 101,
        strategyLineage: false,
        makerProven: true,
        externalCounterparty: true,
        observedAt: 3,
      }).duplicate,
    ).toBe(true);
    journal.close();
  });
  it('enforces post-only, tick, lot, notional, external counterparty and no self trade', () => {
    expect(() => validateDecibelPlaceIntentV1(place(), limits)).not.toThrow();
    expect(place()).toMatchObject({
      type: 'LIMIT',
      postOnly: true,
      selfTradePermitted: false,
      externalCounterpartyRequired: true,
    });
  });
  it('revalidates authenticated position plus pending same-side exposure at PLACE boundary', () => {
    expect(() =>
      validateDecibelPlaceIntentV1(place(), {
        ...limits,
        currentPositionBase: 0.2,
        maximumAbsPositionBase: 0.35,
        openOrders: [{ side: 'BUY', quantity: 0.1 }],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<execution_preflight_rejection_v1>>({
        rejectionCode: 'EXECUTION_PREFLIGHT_POSITION_LIMIT_EXCEEDED',
      }),
    );
    expect(() =>
      validateDecibelPlaceIntentV1(place(), {
        ...limits,
        currentPositionBase: 0.1,
        maximumAbsPositionBase: 0.35,
        openOrders: [{ side: 'BUY', quantity: 0.1 }],
      }),
    ).not.toThrow();
  });
  it('rejects a PostOnly maker intent that would cross the current book', () => {
    expect(() =>
      validateDecibelPlaceIntentV1(place(), {
        ...limits,
        bestBid: 99.9,
        bestAsk: 100,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<execution_preflight_rejection_v1>>({
        rejectionCode: 'EXECUTION_PREFLIGHT_POST_ONLY_WOULD_CROSS',
      }),
    );
  });
  it('accepts a canonically aligned decimal price and exposes the exact notional rejection', () => {
    const intent = buildDecibelExecutionIntentV1({
      sessionId: 'production-live',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 81_163.4,
      quantity: 0.00002,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'd1b-preflight-diagnostic',
      knownVenueOrderId: null,
      sourceStateHash: 'state',
      strategyDecisionHash: 'decision',
      createdAt: 1_000,
    }) as place_intent_v1;
    expect(() =>
      validateDecibelPlaceIntentV1(intent, {
        tickSize: 0.1,
        lotSize: 0.00001,
        minimumNotionalUsd: 10,
        maximumNotionalUsd: 50,
        permittedSide: 'BUY',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<execution_preflight_rejection_v1>>({
        message: 'EXECUTION_PREFLIGHT_REJECTED',
        rejectionCode: 'EXECUTION_PREFLIGHT_NOTIONAL_BELOW_MINIMUM',
      }),
    );
  });
  it('bypasses local notional minimum only for exact reduce-only IOC session unwind', () => {
    const intent = buildDecibelExecutionIntentV1({
      sessionId: 'production-live',
      cycleSequence: 2,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 80_000,
      quantity: 0.00003,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'd1b-unwind-preflight',
      knownVenueOrderId: null,
      sourceStateHash: 'state',
      strategyDecisionHash: 'decision',
      createdAt: 1_000,
      executionRole: 'SESSION_UNWIND_IOC',
      reduceOnly: true,
      timeInForce: 'ImmediateOrCancel',
    }) as place_intent_v1;
    expect(() =>
      validateDecibelPlaceIntentV1(intent, {
        tickSize: 0.1,
        lotSize: 0.00001,
        minimumSize: 0.00001,
        minimumNotionalUsd: 10,
        maximumNotionalUsd: 1,
        maximumReductionQuantity: 0.00003,
        permittedSide: 'BUY',
        bestBid: 79_999.9,
        bestAsk: 80_000,
      }),
    ).not.toThrow();
    expect(() =>
      validateDecibelPlaceIntentV1(intent, {
        tickSize: 0.1,
        lotSize: 0.00001,
        minimumSize: 0.00001,
        minimumNotionalUsd: 10,
        maximumNotionalUsd: 1,
        maximumReductionQuantity: 0.00002,
        permittedSide: 'BUY',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<execution_preflight_rejection_v1>>({
        rejectionCode: 'EXECUTION_PREFLIGHT_REDUCTION_WOULD_CROSS_FLAT',
      }),
    );
  });
  it('bypasses the local notional minimum for an exact reduce-only risk-reduction maker', () => {
    const intent = buildDecibelExecutionIntentV1({
      sessionId: 'production-live',
      cycleSequence: 3,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 78_500,
      quantity: 0.0001,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'd1b-risk-reduction-preflight',
      knownVenueOrderId: null,
      sourceStateHash: 'state',
      strategyDecisionHash: 'decision',
      createdAt: 1_000,
      executionRole: 'INVENTORY_REDUCING_MAKER',
      reduceOnly: true,
      timeInForce: 'PostOnly',
    }) as place_intent_v1;
    expect(() =>
      validateDecibelPlaceIntentV1(intent, {
        tickSize: 0.1,
        lotSize: 0.00001,
        minimumSize: 0.00001,
        minimumNotionalUsd: 10,
        maximumNotionalUsd: 50,
        maximumReductionQuantity: 0.0001,
        permittedSide: 'BUY',
        bestBid: 78_500,
        bestAsk: 78_500.1,
      }),
    ).not.toThrow();
    expect(() =>
      validateDecibelPlaceIntentV1(intent, {
        tickSize: 0.1,
        lotSize: 0.00001,
        minimumSize: 0.00001,
        minimumNotionalUsd: 10,
        maximumNotionalUsd: 50,
        maximumReductionQuantity: 0.00009,
        permittedSide: 'BUY',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<execution_preflight_rejection_v1>>({
        rejectionCode: 'EXECUTION_PREFLIGHT_REDUCTION_WOULD_CROSS_FLAT',
      }),
    );
  });
  it('suppresses a second place while a known live strategy order is unresolved', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mock_lifecycle_executor_v1([
      { outcome: 'PLACE_ACCEPTED', venueOrderId: 'venue-order-1' },
    ]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget);
    await lifecycle.submit(place(), { now: 1_000, preflight: limits });
    await expect(lifecycle.submit(place(2), { now: 1_001, preflight: limits })).resolves.toEqual({
      status: 'DUPLICATE_SUPPRESSED',
      intentId: place().intentId,
    });
    expect(executor.mockMutationAttempts).toBe(1);
    journal.close();
  });
  it('routes a fill during cancellation to inventory recalculation', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const lifecycle = new decibel_execution_lifecycle_v1(
      journal,
      new decibel_mock_lifecycle_executor_v1([]),
      budget,
    );
    const intent = cancel();
    journal.prepare(intent);
    journal.transition(intent.intentId, 'SUBMIT_UNKNOWN', 1_001);
    expect(lifecycle.reconcile(intent.intentId, 'FULL_FILL', 1_002)).toEqual({
      nextAction: 'INVENTORY_RECALCULATION',
    });
    journal.close();
  });
});

it('recomputes V2 effective limits at preflight and leaves reduce-only unwind admissible', async () => {
  const Journal = new decibel_execution_lifecycle_journal_v1(dbPath());
  const Executor = new decibel_mock_lifecycle_executor_v1([]);
  const derive = () =>
    deriveDecibelSessionTradingLimitsV1({
      settings: {
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        targetMakerVolumeUsd: 50,
        orderNotionalUsd: 10,
        maxPositionUsd: 50,
      },
      venueAvailableMarginUsd: 0.05,
      positionBase: 0,
      openOrders: [],
      midpoint: 100,
      maximumEffectiveLeverage: 40,
      venueMaximumNotionalUsd: 100,
      maximumAggregateCollateralFraction: 0.5,
      targetSemanticsVersion: 2,
      totalExecutedVolumeUsd: 0,
      pnlUsd: 0,
      lotSize: 0.01,
    });
  const limits = () => ({
    tickSize: 0.1,
    lotSize: 0.01,
    minimumSize: 0.01,
    minimumNotionalUsd: 1,
    maximumNotionalUsd: 50,
    maximumAbsPositionBase: derive().effectivePositionLimitUsd / 100,
    currentPositionBase: 0,
    openOrders: [],
    permittedSide: 'BUY' as const,
    bestBid: 100.1,
    bestAsk: 100.2,
  });
  const Lifecycle = new decibel_execution_lifecycle_v1(
    Journal,
    Executor,
    {
      maxPlaceAttemptsPerMinute: 10,
      maxCancelAttemptsPerMinute: 10,
      maxTotalMutationAttemptsPerMinute: 20,
      maxConsecutiveUnknownOutcomes: 1,
    },
    () => 1000,
    (intent) => {
      if (intent.action === 'PLACE') validateDecibelPlaceIntentV1(intent, limits());
    },
  );
  await expect(Lifecycle.submit(place(), { now: 1000 })).rejects.toMatchObject({
    rejectionCode: 'EXECUTION_PREFLIGHT_POSITION_LIMIT_REQUIRED',
  });
  expect(Executor.mockMutationAttempts).toBe(0);
  const unwind = buildDecibelExecutionIntentV1({
    ...place(2),
    side: 'SELL',
    reduceOnly: true,
    executionRole: 'SESSION_UNWIND_IOC',
    timeInForce: 'ImmediateOrCancel',
  });
  expect(() =>
    validateDecibelPlaceIntentV1(unwind as place_intent_v1, {
      ...limits(),
      maximumAbsPositionBase: 0,
      currentPositionBase: 0.1,
      maximumReductionQuantity: 0.1,
      permittedSide: 'SELL',
    }),
  ).not.toThrow();
  Journal.close();
});
