import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createDecibelAuthenticatedBtcResyncCheckpointRolloverV2,
  deriveDecibelAuthenticatedBtcActivityResyncV1,
} from '../src/decibel_authenticated_btc_activity_resync_v1.js';
import { buildDecibelExecutionIntentV1 } from '../src/decibel_execution_intent_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import { decibel_execution_lifecycle_v1 } from '../src/decibel_execution_lifecycle_v1.js';
import {
  decibel_production_execution_v1,
  loadDecibelProductionExecutorV1,
  parseDecibelProductionExecutionConfigV1,
} from '../src/decibel_production_execution_v1.js';
import {
  decibel_production_executor_gate_v1,
  type DecibelProductionExecutionExecutorV1,
} from '../src/decibel_production_executor_handoff_v1.js';
import { resolveDecibelExternalOrderNeutralizationV1 } from '../src/decibel_production_live_state_source_v1.js';
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
  it('releases the canary latch only after authenticated reconciliation', async () => {
    const external: DecibelProductionExecutionExecutorV1 = {
      placePostOnlyLimit: () =>
        Promise.resolve({ outcome: 'PLACE_ACKNOWLEDGED', venueOrderId: 'venue-one' }),
      cancelExactOrder: () => Promise.resolve({ outcome: 'CANCEL_CONFIRMED' }),
    };
    const gate = new decibel_production_executor_gate_v1(external, {
      executorEnabled: true,
      releaseStage: 'CANARY',
    });
    const place = intent();
    if (place.action !== 'PLACE') throw new Error('TEST_PLACE_INTENT_BUILD_FAILED');
    await expect(gate.placePostOnlyLimit(place)).resolves.toMatchObject({
      outcome: 'PLACE_ACCEPTED',
    });
    await expect(gate.placePostOnlyLimit(place)).rejects.toThrow('CANARY_HALT_FOR_RECONCILIATION');
    gate.acknowledgeAuthenticatedReconciliation();
    await expect(gate.placePostOnlyLimit(place)).resolves.toMatchObject({
      outcome: 'PLACE_ACCEPTED',
    });
  });
  it('creates a checkpoint for an explicitly allowed conserved flat out-of-band sequence', () => {
    const fill = (tradeId: string, side: 'BUY' | 'SELL', transactionVersion: number) => ({
      tradeId,
      orderId: `order-${tradeId}`,
      clientOrderId: null,
      marketAddress: '0xbtc',
      side,
      size: 0.0001,
      price: 80_000,
      transactionVersion,
      transactionHash: `0x${tradeId}`,
      entryFunction: 'manual',
      transactionLineage: 'PROVEN_NON_PLACEMENT' as const,
      orderType: 'limit',
      timeInForce: 1,
      postOnly: true,
      fee: 0,
      rebate: 0,
      makerStatus: 'PROVEN' as const,
      activityClass: 'UNPROVEN' as const,
    });
    const result = deriveDecibelAuthenticatedBtcActivityResyncV1({
      priorFrozenManifestBodyHash: 'manifest',
      frozenFillIds: [],
      capturedRecyclingOrderIds: [],
      fills: [fill('buy', 'BUY', 1), fill('sell', 'SELL', 2)],
      currentPositionBase: 0,
      lotSize: 0.00001,
      btcOpenOrderCount: 0,
      activeBtcTwapCount: 0,
      activeBtcTpSlCount: 0,
      activeBtcBulkOrderCount: 0,
      allowOutOfBandReconciliation: true,
      resyncTimestamp: 10,
      sourceHashes: {},
    });
    expect(result).toMatchObject({
      ready: true,
      positionConservationPassed: true,
      currentPositionBase: 0,
      cycleDisposition: 'RECONCILED_AND_CHECKPOINTED',
      blockers: [],
    });
    expect(result.checkpoint).not.toBeNull();
    const checkpoint = result.checkpoint!;
    expect(
      createDecibelAuthenticatedBtcResyncCheckpointRolloverV2({
        previous: checkpoint,
        next: checkpoint,
        checkpointSequence: 2,
        allowReconciledIdentityRollover: true,
      }),
    ).toMatchObject({
      checkpointSequence: 2,
      newlyAttributedFillIds: [],
      cycleDisposition: 'RECONCILED_AND_CHECKPOINTED',
    });
  });
  it('downgrades incomplete historical attribution only for an authenticated flat account', () => {
    const result = deriveDecibelAuthenticatedBtcActivityResyncV1({
      priorFrozenManifestBodyHash: 'manifest',
      frozenFillIds: [],
      capturedRecyclingOrderIds: [],
      fills: [
        {
          tradeId: 'unattributed-buy',
          orderId: 'unknown-order',
          clientOrderId: null,
          marketAddress: '0xbtc',
          side: 'BUY',
          size: 0.0001,
          price: 80_000,
          transactionVersion: 1,
          transactionHash: '0xtransaction',
          entryFunction: null,
          transactionLineage: 'UNPROVEN',
          orderType: null,
          timeInForce: null,
          postOnly: null,
          fee: 0,
          rebate: 0,
          makerStatus: 'UNPROVEN',
          activityClass: 'UNPROVEN',
        },
        {
          tradeId: 'attributed-sell',
          orderId: 'manual-order',
          clientOrderId: null,
          marketAddress: '0xbtc',
          side: 'SELL',
          size: 0.0002,
          price: 80_001,
          transactionVersion: 2,
          transactionHash: '0xmanual',
          entryFunction: 'manual',
          transactionLineage: 'PROVEN_NON_PLACEMENT',
          orderType: 'limit',
          timeInForce: 1,
          postOnly: true,
          fee: 0,
          rebate: 0,
          makerStatus: 'PROVEN',
          activityClass: 'UNPROVEN',
        },
      ],
      currentPositionBase: 0,
      lotSize: 0.00001,
      btcOpenOrderCount: 0,
      activeBtcTwapCount: 0,
      activeBtcTpSlCount: 0,
      activeBtcBulkOrderCount: 0,
      allowOutOfBandReconciliation: true,
      resyncTimestamp: 10,
      sourceHashes: {},
    });

    expect(result).toMatchObject({
      ready: true,
      currentPositionBase: 0,
      positionConservationPassed: false,
      blockers: [],
      warnings: ['BTC_FILL_ATTRIBUTION_INCOMPLETE_AUTHENTICATED_FLAT_WARNING'],
      cycleDisposition: 'RECONCILED_AND_CHECKPOINTED',
    });
    expect(result.checkpoint).not.toBeNull();
  });

  it('keeps incomplete attribution strict when authenticated position is non-zero', () => {
    const result = deriveDecibelAuthenticatedBtcActivityResyncV1({
      priorFrozenManifestBodyHash: 'manifest',
      frozenFillIds: [],
      capturedRecyclingOrderIds: [],
      fills: [],
      currentPositionBase: 0.0001,
      lotSize: 0.00001,
      btcOpenOrderCount: 0,
      activeBtcTwapCount: 0,
      activeBtcTpSlCount: 0,
      activeBtcBulkOrderCount: 0,
      allowOutOfBandReconciliation: true,
      resyncTimestamp: 10,
      sourceHashes: {},
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain('BTC_ACCOUNT_POSITION_CONSERVATION_FAILED');
    expect(result.blockers).toContain('BTC_RESYNC_POSITION_NOT_ZERO');
    expect(result.checkpoint).toBeNull();
  });
  it('fails closed without an external module', async () => {
    await expect(loadDecibelProductionExecutorV1(null)).rejects.toThrow(
      'PRODUCTION_EXECUTOR_MODULE_NOT_CONFIGURED',
    );
  });
  it('loads a conforming external fake module', async () => {
    const modulePath = join(mkdtempSync(join(tmpdir(), 'production-executor-')), 'executor.mjs');
    writeFileSync(
      modulePath,
      "export function createDecibelProductionExecutorV1() { return { placePostOnlyLimit: async () => ({ outcome: 'PLACE_ACKNOWLEDGED' }), cancelExactOrder: async () => ({ outcome: 'CANCEL_CONFIRMED' }) }; }\n",
    );
    const executor = await loadDecibelProductionExecutorV1(modulePath);
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

  it('treats an authenticated external cancellation as terminal during startup recovery', () => {
    expect(
      resolveDecibelExternalOrderNeutralizationV1({
        terminalState: 'CANCELLED',
        remainingQuantity: 0,
        authenticatedFilledQuantity: 0,
      }),
    ).toBe('CANCELLED_EXTERNALLY');
    expect(
      resolveDecibelExternalOrderNeutralizationV1({
        terminalState: 'CANCELLED',
        remainingQuantity: 0,
        authenticatedFilledQuantity: 0.00001,
      }),
    ).toBe('EXTERNALLY_NEUTRALIZED');
    const path = join(mkdtempSync(join(tmpdir(), 'external-cancel-')), 'journal.sqlite');
    const journal = new decibel_execution_lifecycle_journal_v1(path);
    const value = intent();
    journal.prepare(value);
    journal.transition(value.intentId, 'ACKNOWLEDGED', 2, 'venue-order');
    const lifecycle = new decibel_execution_lifecycle_v1(
      journal,
      {
        placePostOnlyLimit: () => Promise.reject(new Error('UNREACHED')),
        cancelExactOrder: () => Promise.reject(new Error('UNREACHED')),
      },
      {
        maxPlaceAttemptsPerMinute: 1,
        maxCancelAttemptsPerMinute: 1,
        maxTotalMutationAttemptsPerMinute: 1,
        maxConsecutiveUnknownOutcomes: 1,
      },
    );
    expect(lifecycle.recover()).toEqual([{ intentId: value.intentId, action: 'RECONCILE_ONLY' }]);
    expect(lifecycle.reconcile(value.intentId, 'CANCELLED_EXTERNALLY', 3)).toEqual({
      nextAction: 'PLACE_ALLOWED',
    });
    expect(journal.get(value.intentId)?.status).toBe('CANCELLED_EXTERNALLY');
    expect(lifecycle.recover()).toEqual([]);
    journal.close();
  });
});
