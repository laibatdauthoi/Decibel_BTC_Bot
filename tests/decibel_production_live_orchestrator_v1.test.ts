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
import { getSafeProductionLiveFailureV1 } from '../src/run_decibel_production_live_v1.js';
import { execution_preflight_rejection_v1 } from '../src/decibel_execution_intent_v1.js';

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
    availableMarginUsd: 1,
    maximumEffectiveLeverage: 1,
    ...overrides,
  } satisfies decibel_production_live_snapshot_v1;
};

function make(input?: {
  environment?: NodeJS.ProcessEnv;
  snapshots?: decibel_production_live_snapshot_v1[];
  placeOutcome?: 'PLACE_ACKNOWLEDGED' | 'PLACE_OUTCOME_UNKNOWN';
  journalPath?: string;
  readFailuresAt?: ReadonlyMap<number, Error>;
  reconciliationState?: 'ORDER_OPEN' | 'PARTIAL_FILL' | 'FULL_FILL' | 'ORDER_CANCELLED';
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
      const failure = input?.readFailuresAt?.get(reads);
      if (failure !== undefined) return Promise.reject(failure);
      const snapshot = snapshots.shift();
      if (snapshot === undefined) throw new Error('NO_SNAPSHOT');
      return Promise.resolve(snapshot);
    },
    reconcileIntent: () => {
      reconciliations += 1;
      return Promise.resolve(input?.reconciliationState ?? 'ORDER_NOT_FOUND');
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
    ).toMatchObject({
      releaseStage: 'DISABLED',
      executorEnabled: false,
      dryRun: false,
      readRetryCount: 3,
      readRetryBackoffMs: 250,
    });
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

  it('exposes a safe detailed execution preflight rejection code', () => {
    const error = new execution_preflight_rejection_v1(
      'EXECUTION_PREFLIGHT_NOTIONAL_ABOVE_MAXIMUM',
    );
    expect(getSafeProductionLiveFailureV1(error)).toEqual({
      blocker: 'EXECUTION_PREFLIGHT_REJECTED',
      rejectionCode: 'EXECUTION_PREFLIGHT_NOTIONAL_ABOVE_MAXIMUM',
    });
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

  it('holds without mutation when authenticated state changes before intent', async () => {
    const test = make({
      snapshots: [makeSnapshot(), makeSnapshot({ sourceStateHash: 'state-2' })],
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'HOLD',
      blocker: null,
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

  it('adopts a recognized strategy order on an empty-journal startup without mutation', async () => {
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
    const test = make({ snapshots: [snapshot], reconciliationState: 'ORDER_OPEN' });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
      mutationInvocations: 0,
    });
    expect(test.journal.countIntents()).toBe(1);
    expect(test.journal.nonTerminal()).toHaveLength(1);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('manages an authenticated startup position without treating it as foreign activity', async () => {
    const base = makeSnapshot();
    const positioned = {
      ...base,
      input: {
        ...base.input,
        actualInventoryBase: 0.001,
        inventoryDirectionProven: true,
        manualOrDelegatedActivityCount: 0,
      },
    };
    const test = make({ snapshots: [positioned, positioned] });
    const result = await test.orchestrator.evaluateOnce();
    expect(result.blocker).not.toBe('STRATEGY_ACTIVITY_EXCLUSIVITY_LOST');
    expect(result.evaluation?.strategyState).toBe('HARD_LONG');
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('returns safe raw market identity diagnostics only for an exclusivity blocker', async () => {
    const base = makeSnapshot();
    const marketScopeDiagnostics = {
      rawPositionMarketIdentities: [
        { market: 'dell/usd', marketAddress: '0xdell', marketId: null },
      ],
      rawOpenOrderMarketIdentities: [],
      rawFillMarketIdentities: [],
      rawTwapMarketIdentities: [],
      rawTpSlMarketIdentities: [],
      historicalOutOfBandBTCFillCount: 0,
      activeTwapCount: 1,
      activeTpSlCount: 0,
      activeBulkOrderCount: 0,
    };
    const blocked = {
      ...base,
      marketScopeDiagnostics,
      input: { ...base.input, activeTwapCount: 1 },
    };
    const test = make({ snapshots: [blocked] });

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'BLOCKED',
      blocker: 'STRATEGY_ACTIVITY_EXCLUSIVITY_LOST',
      marketScopeDiagnostics,
      mutationInvocations: 0,
    });
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

  it('completes a recovered filled intent and advances to inventory management', async () => {
    const positioned = makeSnapshot();
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'AUTONOMOUS',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
        DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH: 'same',
        DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH: 'same',
      },
      snapshots: [makeSnapshot(), makeSnapshot(), positioned],
      placeOutcome: 'PLACE_OUTCOME_UNKNOWN',
      reconciliationState: 'FULL_FILL',
    });
    const submitted = await test.orchestrator.evaluateOnce();
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
      intentId: submitted.intentId,
      mutationInvocations: 0,
    });
    expect(test.journal.get(submitted.intentId ?? '')?.status).toBe('APPLIED');
    expect(test.calls()).toBe(1);
    await test.orchestrator.close();
  });

  it('retries transient authenticated reads during reconciliation without resubmission', async () => {
    const timeout = Object.assign(new Error('Indexer request timed out'), { code: 'ETIMEDOUT' });
    const reset = Object.assign(new Error('Indexer connection reset'), { code: 'ECONNRESET' });
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'AUTONOMOUS',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
        DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH: 'same',
        DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH: 'same',
        DECIBEL_PRODUCTION_LIVE_READ_RETRY_BACKOFF_MS: '1',
      },
      snapshots: [makeSnapshot(), makeSnapshot(), makeSnapshot()],
      placeOutcome: 'PLACE_OUTCOME_UNKNOWN',
      readFailuresAt: new Map([
        [3, timeout],
        [4, reset],
      ]),
    });

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILIATION_REQUIRED',
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
    });
    expect(test.reads()).toBe(5);
    expect(test.reconciliations()).toBe(1);
    expect(test.calls()).toBe(1);
    await test.orchestrator.close();
  });

  it('fails closed after the configured transient authenticated read retries', async () => {
    const failures = new Map<number, Error>();
    for (let read = 1; read <= 4; read += 1)
      failures.set(
        read,
        Object.assign(new Error('Indexer request timed out'), { code: 'ETIMEDOUT' }),
      );
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'true',
        DECIBEL_PRODUCTION_LIVE_READ_RETRY_BACKOFF_MS: '1',
      },
      readFailuresAt: failures,
    });

    await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
      'PRODUCTION_AUTHENTICATED_READ_REQUIRED',
    );
    expect(test.reads()).toBe(4);
    expect(test.calls()).toBe(0);
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
