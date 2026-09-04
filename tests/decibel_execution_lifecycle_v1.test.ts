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
    createdAt: 1_000,
  }) as cancel_intent_v1;
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
    expect(lifecycle.reconcile(intent.intentId, 'ORDER_CANCELLED', 1_001)).toEqual({
      nextAction: 'PLACE_ALLOWED',
    });
    expect(executor.mockMutationAttempts).toBe(1);
    journal.close();
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
  it('blocks a second known live strategy order', async () => {
    const journal = new decibel_execution_lifecycle_journal_v1(dbPath());
    const executor = new decibel_mock_lifecycle_executor_v1([
      { outcome: 'PLACE_ACCEPTED', venueOrderId: 'venue-order-1' },
    ]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, budget);
    await lifecycle.submit(place(), { now: 1_000, preflight: limits });
    await expect(lifecycle.submit(place(2), { now: 1_001, preflight: limits })).rejects.toThrow(
      'EXECUTION_SINGLE_LIVE_ORDER_BLOCKED',
    );
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
