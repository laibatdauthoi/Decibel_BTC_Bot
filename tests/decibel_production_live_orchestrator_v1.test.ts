import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createDecibelActualFillLedgerV1 } from '../src/decibel_actual_fill_truth_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from '../src/decibel_minimal_live_canary_v1.js';
import {
  decibel_production_live_orchestrator_v1,
  parseDecibelProductionLiveConfigurationV1,
  runDecibelProductionLiveLoopV1,
  type DecibelProductionLiveStateSourceV1,
  type decibel_production_live_snapshot_v1,
} from '../src/decibel_production_live_orchestrator_v1.js';
import type { DecibelProductionExecutionExecutorV1 } from '../src/decibel_production_executor_handoff_v1.js';

const makeSnapshot = (overrides: Partial<decibel_production_live_snapshot_v1> = {}) => {
  const now = 1_000;
  const input = {
    sessionId: 'session',
    strategyConfigId: 'DECIBEL_MARKET_MAKER_V1_PASSIVE_VOLUME_RECYCLING_V1',
    configuredSubaccount: 'subaccount',
    authenticatedSubaccount: 'subaccount',
    configuredNetwork: 'mainnet' as const,
    observedNetwork: 'mainnet',
    now,
    market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    metadata: {
      marketAddress: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      symbol: 'BTC/USD',
      tickSize: 0.1,
      lotSize: 0.001,
      minimumSize: 0.001,
      mode: 'Open',
      observedAt: now,
    },
    book: { bestBid: 100, bestAsk: 100.2, observedAt: now },
    maxBboAgeMs: 5_000,
    actualInventoryBase: 0,
    inventoryDirectionProven: true,
    openOrders: [],
    activeTwapCount: 0,
    activeTpSlCount: 0,
    activeBulkOrderCount: 0,
    manualOrDelegatedActivityCount: 0,
    unresolvedExecutionPlanCount: 0,
    persistenceAvailable: true,
    targetExternalMakerVolumeUsd: null,
    actualFillLedger: createDecibelActualFillLedgerV1([]),
  };
  return {
    input,
    sourceStateHash: 'state-1',
    minimumNotionalUsd: 0.01,
    maximumNotionalUsd: 1,
    ...overrides,
  } satisfies decibel_production_live_snapshot_v1;
};

function make(input?: {
  environment?: NodeJS.ProcessEnv;
  snapshots?: decibel_production_live_snapshot_v1[];
  placeOutcome?: 'PLACE_ACKNOWLEDGED' | 'PLACE_OUTCOME_UNKNOWN';
  journalPath?: string;
}) {
  const journal = new decibel_execution_lifecycle_journal_v1(
    input?.journalPath ?? join(mkdtempSync(join(tmpdir(), 'decibel-live-')), 'journal.sqlite'),
  );
  const snapshots = [...(input?.snapshots ?? [makeSnapshot(), makeSnapshot()])];
  let reads = 0;
  let calls = 0;
  let reconciliations = 0;
  const source: DecibelProductionLiveStateSourceV1 = {
    readAuthenticatedSnapshot: () => {
      reads += 1;
      const snapshot = snapshots.shift();
      if (snapshot === undefined) throw new Error('NO_SNAPSHOT');
      return Promise.resolve(snapshot);
    },
    reconcileIntent: () => {
      reconciliations += 1;
      return Promise.resolve('ORDER_NOT_FOUND');
    },
  };
  const executor: DecibelProductionExecutionExecutorV1 = {
    placePostOnlyLimit: () => {
      calls += 1;
      return Promise.resolve({
        outcome: input?.placeOutcome ?? 'PLACE_ACKNOWLEDGED',
        venueOrderId: 'v1',
      });
    },
    cancelExactOrder: () => {
      calls += 1;
      return Promise.resolve({ outcome: 'CANCEL_CONFIRMED' });
    },
  };
  const configuration = parseDecibelProductionLiveConfigurationV1(
    input?.environment ?? {
      DECIBEL_EXECUTION_MODE: 'production',
      DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
      DECIBEL_EXECUTOR_ENABLED: 'true',
      DECIBEL_EXECUTOR_DRY_RUN: 'true',
    },
  );
  const orchestrator = new decibel_production_live_orchestrator_v1(
    journal,
    source,
    executor,
    configuration,
    {
      maxPlaceAttemptsPerMinute: 10,
      maxCancelAttemptsPerMinute: 10,
      maxTotalMutationAttemptsPerMinute: 10,
      maxConsecutiveUnknownOutcomes: 2,
    },
  );
  return {
    orchestrator,
    journal,
    configuration,
    calls: () => calls,
    reads: () => reads,
    reconciliations: () => reconciliations,
  };
}

describe('Decibel production live orchestrator V1', () => {
  it('defaults disabled and requires production mode', () => {
    expect(
      parseDecibelProductionLiveConfigurationV1({ DECIBEL_EXECUTION_MODE: 'production' }),
    ).toMatchObject({ releaseStage: 'DISABLED', executorEnabled: false, dryRun: false });
    expect(() => parseDecibelProductionLiveConfigurationV1({})).toThrow();
  });

  it('prepares dry-run intent with zero executor calls', async () => {
    const test = make();
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'DRY_RUN_PREPARED',
      mutationInvocations: 0,
    });
    expect(test.calls()).toBe(0);
    expect(test.journal.nonTerminal()).toEqual([]);
    await test.orchestrator.close();
  });

  it('supports three consecutive dry-run cycles without false reconciliation', async () => {
    const test = make({ snapshots: Array.from({ length: 6 }, () => makeSnapshot()) });
    const actions = [];
    for (let cycle = 0; cycle < 3; cycle += 1)
      actions.push((await test.orchestrator.evaluateOnce()).action);
    expect(actions).toEqual(['DRY_RUN_PREPARED', 'DRY_RUN_PREPARED', 'DRY_RUN_PREPARED']);
    expect(test.reconciliations()).toBe(0);
    expect(test.calls()).toBe(0);
    expect(test.journal.nonTerminal()).toEqual([]);
    await test.orchestrator.close();
  });

  it('restarts on the same journal without reconciling a dry-run-only intent', async () => {
    const journalPath = join(
      mkdtempSync(join(tmpdir(), 'decibel-live-restart-')),
      'journal.sqlite',
    );
    const first = make({ journalPath });
    await expect(first.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'DRY_RUN_PREPARED',
    });
    await first.orchestrator.close();
    const restarted = make({ journalPath });
    await expect(restarted.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'DUPLICATE_SUPPRESSED',
      mutationInvocations: 0,
    });
    expect(restarted.reconciliations()).toBe(0);
    expect(restarted.calls()).toBe(0);
    await restarted.orchestrator.close();
  });

  it('fails closed when state changes before intent', async () => {
    const test = make({
      snapshots: [makeSnapshot(), makeSnapshot({ sourceStateHash: 'state-2' })],
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'BLOCKED',
      blocker: 'EXECUTION_STATE_CHANGED_BEFORE_INTENT',
    });
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('fails closed on stale authenticated market state', async () => {
    const stale = makeSnapshot();
    const test = make({
      snapshots: [
        {
          ...stale,
          input: { ...stale.input, now: 10_000, book: { ...stale.input.book, observedAt: 1 } },
        },
      ],
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'BLOCKED',
      blocker: 'MARKET_DATA_STALE',
    });
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('holds semantic matches without invoking the executor', async () => {
    const base = makeSnapshot();
    const current = {
      venueOrderId: 'existing',
      clientOrderId: `dpvr1-b-0-${'a'.repeat(32)}`,
      strategyConfigId: base.input.strategyConfigId,
      market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      side: 'BUY' as const,
      price: 100,
      quantity: 0.001,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true as const,
    };
    const snapshot = {
      ...base,
      input: { ...base.input, openOrders: [current] },
    };
    const test = make({ snapshots: [snapshot] });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({ action: 'HOLD' });
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('unknown PLACE is recovered by reconciliation without resubmission', async () => {
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'AUTONOMOUS',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
        DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH: 'same',
        DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH: 'same',
      },
      snapshots: [makeSnapshot(), makeSnapshot(), makeSnapshot()],
      placeOutcome: 'PLACE_OUTCOME_UNKNOWN',
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILIATION_REQUIRED',
    });
    expect(test.calls()).toBe(1);
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
    });
    expect(test.calls()).toBe(1);
    await test.orchestrator.close();
  });

  it('blocks autonomous release without matching canary evidence', () => {
    expect(() =>
      make({
        environment: {
          DECIBEL_EXECUTION_MODE: 'production',
          DECIBEL_EXECUTION_RELEASE_STAGE: 'AUTONOMOUS',
          DECIBEL_EXECUTOR_ENABLED: 'true',
          DECIBEL_EXECUTOR_DRY_RUN: 'false',
        },
      }),
    ).toThrow('AUTONOMOUS_RELEASE_CANARY_EVIDENCE_REQUIRED');
  });

  it('stops a bounded loop at max cycles', async () => {
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'true',
        DECIBEL_PRODUCTION_LIVE_MAX_CYCLES: '1',
      },
    });
    const result = await runDecibelProductionLiveLoopV1({
      orchestrator: test.orchestrator,
      configuration: test.configuration,
      signal: new AbortController().signal,
      sleep: () => Promise.resolve(),
    });
    expect(result).toEqual({ cycles: 1, mutationInvocations: 0, stopped: true });
  });
});
