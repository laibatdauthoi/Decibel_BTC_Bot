import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDecibelExecutionIntentV1,
  type cancel_intent_v1,
  type place_intent_v1,
} from '../src/decibel_execution_intent_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import { decibel_execution_lifecycle_v1 } from '../src/decibel_execution_lifecycle_v1.js';
import {
  decibel_production_executor_gate_v1,
  validateDecibelProductionReleaseStageV1,
  type DecibelProductionExecutionExecutorV1,
  type production_execution_result_v1,
} from '../src/decibel_production_executor_handoff_v1.js';
const build = (action: 'PLACE' | 'CANCEL' = 'PLACE', cycle = 1) =>
  buildDecibelExecutionIntentV1({
    sessionId: 's',
    cycleSequence: cycle,
    action,
    market: 'BTC/USD',
    side: 'BUY',
    price: 100,
    quantity: 0.1,
    tickSize: 0.1,
    lotSize: 0.01,
    clientOrderId: `c${cycle}`,
    knownVenueOrderId: action === 'CANCEL' ? 'venue-1' : null,
    sourceStateHash: 'state',
    strategyDecisionHash: 'decision',
    createdAt: 1,
  });
class fake_executor implements DecibelProductionExecutionExecutorV1 {
  placeCalls = 0;
  cancelCalls = 0;
  constructor(private readonly Results: production_execution_result_v1[]) {}
  private next() {
    const result = this.Results.shift();
    if (!result) throw new Error('FAKE_EXHAUSTED');
    return result;
  }
  placePostOnlyLimit() {
    this.placeCalls += 1;
    return Promise.resolve(this.next());
  }
  cancelExactOrder() {
    this.cancelCalls += 1;
    return Promise.resolve(this.next());
  }
}
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
const setup = (results: production_execution_result_v1[], enabled = true) => {
  const fake = new fake_executor(results);
  const gate = new decibel_production_executor_gate_v1(fake, {
    executorEnabled: enabled,
    releaseStage: 'CANARY',
  });
  const journal = new decibel_execution_lifecycle_journal_v1(
    join(mkdtempSync(join(tmpdir(), 'handoff-')), 'j.sqlite'),
  );
  return {
    fake,
    gate,
    journal,
    lifecycle: new decibel_execution_lifecycle_v1(journal, gate, budget),
  };
};
describe('Decibel production executor handoff V1', () => {
  it('valid PLACE reaches executor exactly once', async () => {
    const x = setup([{ outcome: 'PLACE_ACKNOWLEDGED', venueOrderId: 'v' }]);
    await x.lifecycle.submit(build(), { now: 1, preflight: limits });
    expect(x.fake.placeCalls).toBe(1);
    x.journal.close();
  });
  it('invalid PostOnly preflight never reaches executor', async () => {
    const x = setup([{ outcome: 'PLACE_ACKNOWLEDGED' }]);
    await expect(
      x.lifecycle.submit(build() as place_intent_v1, {
        now: 1,
        preflight: { ...limits, permittedSide: 'SELL' },
      }),
    ).rejects.toThrow('EXECUTION_PREFLIGHT_REJECTED');
    expect(x.fake.placeCalls).toBe(0);
    x.journal.close();
  });
  it('duplicate PLACE is suppressed', async () => {
    const x = setup([{ outcome: 'PLACE_ACKNOWLEDGED' }]);
    const intent = build() as place_intent_v1;
    await x.lifecycle.submit(intent, { now: 1, preflight: limits });
    await x.lifecycle.submit(intent, { now: 2, preflight: limits });
    expect(x.fake.placeCalls).toBe(1);
    x.journal.close();
  });
  it('valid exact CANCEL reaches executor once', async () => {
    const x = setup([{ outcome: 'CANCEL_CONFIRMED' }]);
    await x.lifecycle.submit(build('CANCEL'), { now: 1 });
    expect(x.fake.cancelCalls).toBe(1);
    x.journal.close();
  });
  it('duplicate CANCEL is suppressed', async () => {
    const x = setup([{ outcome: 'CANCEL_CONFIRMED' }]);
    const intent = build('CANCEL') as cancel_intent_v1;
    await x.lifecycle.submit(intent, { now: 1 });
    await x.lifecycle.submit(intent, { now: 2 });
    expect(x.fake.cancelCalls).toBe(1);
    x.journal.close();
  });
  it.each([
    ['PLACE_OUTCOME_UNKNOWN', 'PLACE'],
    ['CANCEL_OUTCOME_UNKNOWN', 'CANCEL'],
  ] as const)('%s requires reconciliation', (outcome, action) => {
    const mapped = setup([{ outcome }]);
    return mapped.lifecycle
      .submit(build(action) as place_intent_v1 & cancel_intent_v1, {
        now: 1,
        ...(action === 'PLACE' ? { preflight: limits } : {}),
      })
      .then((result) => {
        expect(result.status).toBe('RECONCILIATION_REQUIRED');
        mapped.journal.close();
      });
  });
  it('executor rejection does not mutate inventory', async () => {
    const x = setup([{ outcome: 'PLACE_REJECTED' }]);
    await x.lifecycle.submit(build(), { now: 1, preflight: limits });
    expect(x.journal.ledger().inventory).toBe(0);
    x.journal.close();
  });
  it('only authenticated fills mutate inventory', () => {
    const x = setup([]);
    x.journal.applyFill({
      fillId: 'f',
      intentId: null,
      side: 'BUY',
      quantity: 0.1,
      price: 100,
      strategyLineage: false,
      makerProven: true,
      externalCounterparty: true,
      observedAt: 1,
    });
    expect(x.journal.ledger()).toMatchObject({ inventory: 0.1, strategyMakerVolume: 0 });
    x.journal.close();
  });
  it('kill switch prevents invocation', async () => {
    const x = setup([{ outcome: 'PLACE_ACKNOWLEDGED' }], false);
    await expect(
      x.lifecycle.submit(build() as place_intent_v1, { now: 1, preflight: limits }),
    ).rejects.toThrow('EXECUTION_KILL_SWITCH_ACTIVE');
    expect(x.fake.placeCalls).toBe(0);
    x.journal.close();
  });
  it('mutation budget prevents invocation', async () => {
    const x = setup([{ outcome: 'PLACE_OUTCOME_UNKNOWN' }, { outcome: 'PLACE_ACKNOWLEDGED' }]);
    await x.lifecycle.submit(build(), { now: 1, preflight: limits });
    await expect(
      x.lifecycle.submit(build('PLACE', 2) as place_intent_v1, { now: 2, preflight: limits }),
    ).rejects.toThrow('EXECUTION_MUTATION_BUDGET_BLOCKED');
    expect(x.fake.placeCalls).toBe(1);
    x.journal.close();
  });
  it('one-live-order invariant prevents second PLACE', async () => {
    const x = setup([{ outcome: 'PLACE_ACKNOWLEDGED', venueOrderId: 'v' }]);
    await x.lifecycle.submit(build(), { now: 1, preflight: limits });
    await expect(
      x.lifecycle.submit(build('PLACE', 2) as place_intent_v1, { now: 2, preflight: limits }),
    ).rejects.toThrow('EXECUTION_SINGLE_LIVE_ORDER_BLOCKED');
    expect(x.fake.placeCalls).toBe(1);
    x.journal.close();
  });
  it('CANARY halts after one normalized outcome', async () => {
    const x = setup([{ outcome: 'PLACE_REJECTED' }, { outcome: 'CANCEL_CONFIRMED' }]);
    await x.gate.placePostOnlyLimit(build() as place_intent_v1);
    await expect(x.gate.cancelExactOrder(build('CANCEL') as cancel_intent_v1)).rejects.toThrow(
      'CANARY_HALT_FOR_RECONCILIATION',
    );
  });
  it('foreign and out-of-band activity cannot enter strategy volume', () => {
    const x = setup([]);
    x.journal.applyFill({
      fillId: 'foreign',
      intentId: null,
      side: 'BUY',
      quantity: 1,
      price: 1,
      strategyLineage: false,
      makerProven: false,
      externalCounterparty: true,
      observedAt: 1,
    });
    expect(x.journal.ledger().strategyMakerVolume).toBe(0);
    x.journal.close();
  });
  it('AUTONOMOUS without matching canary evidence fails closed', () => {
    expect(() =>
      validateDecibelProductionReleaseStageV1({
        executorEnabled: true,
        releaseStage: 'AUTONOMOUS',
      }),
    ).toThrow('AUTONOMOUS_RELEASE_CANARY_EVIDENCE_REQUIRED');
  });
});
