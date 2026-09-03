import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDecibelExecutionIntentV1 } from '../src/decibel_execution_intent_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import {
  decibel_production_execution_v1,
  loadDecibelProductionExecutorV1,
  parseDecibelProductionExecutionConfigV1,
} from '../src/decibel_production_execution_v1.js';
import type { DecibelProductionExecutionExecutorV1 } from '../src/decibel_production_executor_handoff_v1.js';
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
const preflight = {
  tickSize: 0.1,
  lotSize: 0.01,
  minimumNotionalUsd: 5,
  maximumNotionalUsd: 20,
  permittedSide: 'BUY' as const,
};
const make = (
  environment: NodeJS.ProcessEnv = {
    DECIBEL_EXECUTION_MODE: 'production',
    DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
    DECIBEL_EXECUTOR_ENABLED: 'true',
    DECIBEL_EXECUTOR_DRY_RUN: 'true',
  },
) => {
  let calls = 0;
  const external: DecibelProductionExecutionExecutorV1 = {
    placePostOnlyLimit: () => {
      calls += 1;
      return Promise.resolve({ outcome: 'PLACE_ACKNOWLEDGED' });
    },
    cancelExactOrder: () => {
      calls += 1;
      return Promise.resolve({ outcome: 'CANCEL_CONFIRMED' });
    },
  };
  const path = join(mkdtempSync(join(tmpdir(), 'production-')), 'j.sqlite');
  const journal = new decibel_execution_lifecycle_journal_v1(path);
  const runtime = new decibel_production_execution_v1(
    journal,
    external,
    parseDecibelProductionExecutionConfigV1(environment),
    {
      maxPlaceAttemptsPerMinute: 1,
      maxCancelAttemptsPerMinute: 1,
      maxTotalMutationAttemptsPerMinute: 1,
      maxConsecutiveUnknownOutcomes: 1,
    },
  );
  return { runtime, journal, path, calls: () => calls };
};
describe('Decibel production execution V1', () => {
  it('fails closed without an external module', async () => {
    await expect(loadDecibelProductionExecutorV1(null)).rejects.toThrow(
      'PRODUCTION_EXECUTOR_MODULE_NOT_CONFIGURED',
    );
  });
  it('loads a conforming external fake module', async () => {
    const executor = await loadDecibelProductionExecutorV1(
      'tests/fixtures/decibel_fake_production_executor_v1.ts',
    );
    expect(typeof executor.placePostOnlyLimit).toBe('function');
  });
  it('defaults the release stage to DISABLED', () => {
    expect(
      parseDecibelProductionExecutionConfigV1({ DECIBEL_EXECUTION_MODE: 'production' }),
    ).toMatchObject({ releaseStage: 'DISABLED', executorEnabled: false, dryRun: false });
  });
  it('dry run persists intent and invokes zero mutations', async () => {
    const x = make();
    expect(
      await x.runtime.execute(intent(), {
        now: 1,
        authenticatedReadFresh: true,
        reconciliationPassed: true,
        stateUnchanged: true,
        preflight,
      }),
    ).toMatchObject({ status: 'DRY_RUN_PREPARED', mutationInvocations: 0 });
    expect(x.calls()).toBe(0);
    x.journal.close();
  });
  it('dry-run duplicate is suppressed', async () => {
    const x = make();
    await x.runtime.execute(intent(), {
      now: 1,
      authenticatedReadFresh: true,
      reconciliationPassed: true,
      stateUnchanged: true,
      preflight,
    });
    expect(
      await x.runtime.execute(intent(), {
        now: 2,
        authenticatedReadFresh: true,
        reconciliationPassed: true,
        stateUnchanged: true,
        preflight,
      }),
    ).toMatchObject({ status: 'DUPLICATE_SUPPRESSED' });
    expect(x.calls()).toBe(0);
    x.journal.close();
  });
  it.each([
    ['authenticatedReadFresh', 'PRODUCTION_AUTHENTICATED_READ_REQUIRED'],
    ['reconciliationPassed', 'PRODUCTION_RECONCILIATION_REQUIRED'],
    ['stateUnchanged', 'EXECUTION_STATE_CHANGED_BEFORE_INTENT'],
  ] as const)('%s failure blocks before mutation', async (field, blocker) => {
    const x = make();
    const gates = {
      authenticatedReadFresh: true,
      reconciliationPassed: true,
      stateUnchanged: true,
      [field]: false,
    };
    await expect(x.runtime.execute(intent(), { now: 1, ...gates, preflight })).rejects.toThrow(
      blocker,
    );
    expect(x.calls()).toBe(0);
    expect(x.journal.countIntents()).toBe(0);
    x.journal.close();
  });
  it('kill switch blocks before external invocation', async () => {
    const x = make({
      DECIBEL_EXECUTION_MODE: 'production',
      DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
    });
    await expect(
      x.runtime.execute(intent(), {
        now: 1,
        authenticatedReadFresh: true,
        reconciliationPassed: true,
        stateUnchanged: true,
        preflight,
      }),
    ).rejects.toThrow('EXECUTION_KILL_SWITCH_ACTIVE');
    expect(x.calls()).toBe(0);
    x.journal.close();
  });
  it('restart recovers PREPARED dry-run intent without mutation', async () => {
    const x = make();
    await x.runtime.execute(intent(), {
      now: 1,
      authenticatedReadFresh: true,
      reconciliationPassed: true,
      stateUnchanged: true,
      preflight,
    });
    x.journal.close();
    const journal = new decibel_execution_lifecycle_journal_v1(x.path);
    const runtime = new decibel_production_execution_v1(
      journal,
      {
        placePostOnlyLimit: () => Promise.reject(new Error('UNREACHED')),
        cancelExactOrder: () => Promise.reject(new Error('UNREACHED')),
      },
      parseDecibelProductionExecutionConfigV1({
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'true',
      }),
      {
        maxPlaceAttemptsPerMinute: 1,
        maxCancelAttemptsPerMinute: 1,
        maxTotalMutationAttemptsPerMinute: 1,
        maxConsecutiveUnknownOutcomes: 1,
      },
    );
    expect(runtime.recover()).toEqual([{ intentId: intent().intentId, action: 'RECONCILE_ONLY' }]);
    journal.close();
  });
});
