import dotenv from 'dotenv';

dotenv.config();

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import {
  decibel_production_live_orchestrator_v1,
  parseDecibelProductionLiveConfigurationV1,
} from './decibel_production_live_orchestrator_v1.js';
import type { DecibelProductionExecutionExecutorV1 } from './decibel_production_executor_handoff_v1.js';
import {
  createDecibelSharedRuntimeHTTPFetcherV1,
  createDecibelSharedRuntimeSnapshotSourceV1,
} from './decibel_shared_runtime_snapshot_v1.js';

type shadow_decision_snapshot_v1 = Readonly<{
  cycleSequence: number;
  timestamp: number;
  authenticatedPositionBase: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  bookAgeMs: number | null;
  fairPrice: number | null;
  inventoryPressure: number | null;
  inventoryPriceSkewBps: number | null;
  inventoryBidSizeMultiplier: number | null;
  inventoryAskSizeMultiplier: number | null;
  makerFeeBps: number | null;
  makerFeeSource:
    | 'CONFIG'
    | 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES'
    | 'DECIBEL_AUTHENTICATED_STRATEGY_MAKER_FILL_HISTORY'
    | 'UNKNOWN';
  estimatedGasCostUsd: number | null;
  estimatedGasCostSource: 'CONFIG' | 'HISTORICAL_SUCCESSFUL_TX_P95' | 'UNKNOWN';
  adverseSelectionBufferBps: number | null;
  adverseSelectionSource: 'CONFIG' | 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95' | 'UNKNOWN';
  desiredBid: Readonly<{ price: number; quantity: number }> | null;
  desiredAsk: Readonly<{ price: number; quantity: number }> | null;
  expectedBidEdgeBps: number | null;
  expectedAskEdgeBps: number | null;
  requiredBidEdgeBps: number | null;
  requiredAskEdgeBps: number | null;
  bidEligibilityReason: string;
  askEligibilityReason: string;
  repriceResult: string;
  selectedMutation: string;
  selectedSide: 'BUY' | 'SELL' | null;
  exactReasonCode: string;
}>;

function getPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'UNKNOWN_SHADOW_READ_ERROR';
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

export async function runDecibelProductionLiveShadowV1(
  environment: NodeJS.ProcessEnv,
): Promise<Readonly<Record<string, unknown>>> {
  const targetCycles = getPositiveInteger(environment.DECIBEL_SHADOW_CYCLES, 100);
  const pollIntervalMs = getPositiveInteger(environment.DECIBEL_SHADOW_POLL_INTERVAL_MS, 4_000);
  const runId = Date.now();
  const journalPath = resolve(
    environment.DECIBEL_SHADOW_JOURNAL_PATH ??
      `data/decibel_production_live_shadow_v1_${runId}.sqlite`,
  );
  const reportPath = resolve(
    environment.DECIBEL_SHADOW_REPORT_PATH ??
      `data/decibel_production_live_shadow_v1_${runId}.json`,
  );
  mkdirSync(dirname(journalPath), { recursive: true });
  mkdirSync(dirname(reportPath), { recursive: true });
  const safeEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    DECIBEL_EXECUTION_MODE: 'production',
    DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
    DECIBEL_EXECUTOR_ENABLED: 'true',
    DECIBEL_EXECUTOR_DRY_RUN: 'true',
    DECIBEL_EXECUTION_JOURNAL_PATH: journalPath,
  };
  const configuration = parseDecibelProductionLiveConfigurationV1(safeEnvironment);
  const sharedRuntimeUrl =
    environment.DECIBEL_SHADOW_SHARED_RUNTIME_URL ?? 'http://127.0.0.1:4173/api/runtime-snapshot';
  const source = createDecibelSharedRuntimeSnapshotSourceV1(
    createDecibelSharedRuntimeHTTPFetcherV1(
      sharedRuntimeUrl,
      getPositiveInteger(environment.DECIBEL_SHADOW_SHARED_READ_TIMEOUT_MS, 5_000),
    ),
    Number(environment.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS ?? 5_000),
  );
  let placeInvocations = 0;
  let cancelInvocations = 0;
  const forbiddenExecutor: DecibelProductionExecutionExecutorV1 = {
    placePostOnlyLimit: () => {
      placeInvocations += 1;
      return Promise.reject(new Error('SHADOW_MODE_PLACE_FORBIDDEN'));
    },
    cancelExactOrder: () => {
      cancelInvocations += 1;
      return Promise.reject(new Error('SHADOW_MODE_CANCEL_FORBIDDEN'));
    },
  };
  const Journal = new decibel_execution_lifecycle_journal_v1(journalPath);
  const Orchestrator = new decibel_production_live_orchestrator_v1(
    Journal,
    source,
    forbiddenExecutor,
    configuration,
    {
      maxPlaceAttemptsPerMinute: 30,
      maxCancelAttemptsPerMinute: 30,
      maxTotalMutationAttemptsPerMinute: 60,
      maxConsecutiveUnknownOutcomes: 1,
      maxKnownLiveOrders: 2,
    },
  );
  const accepted: shadow_decision_snapshot_v1[] = [];
  const readErrors: string[] = [];
  let staleCycles = 0;
  let attempts = 0;
  const maximumAttempts = targetCycles * 3;
  try {
    while (accepted.length < targetCycles && attempts < maximumAttempts) {
      attempts += 1;
      try {
        const result = await Orchestrator.evaluateOnce();
        const latest = Journal.getDecisionSnapshots().at(-1)?.snapshot as
          shadow_decision_snapshot_v1 | undefined;
        if (result.mutationInvocations !== 0)
          throw new Error('SHADOW_MODE_MUTATION_INVOCATION_DETECTED');
        if (latest === undefined || latest.fairPrice === null || latest.bookAgeMs === null)
          throw new Error('SHADOW_DECISION_SNAPSHOT_INCOMPLETE');
        if (
          latest.bookAgeMs > Number(safeEnvironment.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS ?? 5_000)
        ) {
          staleCycles += 1;
          if (latest.selectedMutation.startsWith('WOULD_'))
            throw new Error('STALE_SHADOW_SNAPSHOT_SELECTED_MUTATION');
        } else {
          accepted.push(latest);
        }
      } catch (error) {
        const message = getErrorMessage(error);
        readErrors.push(message);
        if (message === 'PRODUCTION_LIVE_SOURCE_BOOK_STALE') staleCycles += 1;
        if (message === 'SHADOW_MODE_MUTATION_INVOCATION_DETECTED' || message.startsWith('STALE_'))
          throw error;
        if (message === 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED') await wait(30_000);
      }
      if (accepted.length < targetCycles) await wait(pollIntervalMs);
    }
    if (accepted.length < targetCycles) throw new Error('LIVE_SHADOW_FRESH_CYCLE_TARGET_NOT_MET');
    const feeUnknownCycles = accepted.filter((cycle) => cycle.makerFeeSource === 'UNKNOWN').length;
    const gasUnknownCycles = accepted.filter(
      (cycle) => cycle.estimatedGasCostSource === 'UNKNOWN',
    ).length;
    const unknownTreatedAsZero = accepted.some(
      (cycle) =>
        ((cycle.makerFeeSource === 'UNKNOWN' || cycle.estimatedGasCostSource === 'UNKNOWN') &&
          (cycle.bidEligibilityReason === 'EXPECTED_EDGE_ELIGIBLE' ||
            cycle.askEligibilityReason === 'EXPECTED_EDGE_ELIGIBLE')) ||
        (cycle.makerFeeSource === 'UNKNOWN' && cycle.makerFeeBps === 0) ||
        (cycle.estimatedGasCostSource === 'UNKNOWN' && cycle.estimatedGasCostUsd === 0),
    );
    const bidEligibleCycles = accepted.filter((cycle) => cycle.desiredBid !== null).length;
    const askEligibleCycles = accepted.filter((cycle) => cycle.desiredAsk !== null).length;
    const adverseFilterTriggered = accepted.filter((cycle) => {
      if (
        cycle.adverseSelectionBufferBps === null ||
        cycle.adverseSelectionBufferBps <= 0 ||
        cycle.makerFeeBps === null ||
        cycle.estimatedGasCostUsd === null
      )
        return false;
      const bidTriggered =
        cycle.expectedBidEdgeBps !== null &&
        cycle.requiredBidEdgeBps !== null &&
        cycle.expectedBidEdgeBps <= cycle.requiredBidEdgeBps &&
        cycle.expectedBidEdgeBps > cycle.requiredBidEdgeBps - cycle.adverseSelectionBufferBps;
      const askTriggered =
        cycle.expectedAskEdgeBps !== null &&
        cycle.requiredAskEdgeBps !== null &&
        cycle.expectedAskEdgeBps <= cycle.requiredAskEdgeBps &&
        cycle.expectedAskEdgeBps > cycle.requiredAskEdgeBps - cycle.adverseSelectionBufferBps;
      return bidTriggered || askTriggered;
    }).length;
    const edgeGateRejections = accepted.filter(
      (cycle) =>
        cycle.bidEligibilityReason === 'EXPECTED_EDGE_INSUFFICIENT' ||
        cycle.askEligibilityReason === 'EXPECTED_EDGE_INSUFFICIENT' ||
        cycle.bidEligibilityReason === 'ECONOMIC_INPUT_UNKNOWN' ||
        cycle.askEligibilityReason === 'ECONOMIC_INPUT_UNKNOWN',
    ).length;
    const buySelected = accepted.filter((cycle) => cycle.selectedSide === 'BUY').length;
    const sellSelected = accepted.filter((cycle) => cycle.selectedSide === 'SELL').length;
    const equivalentSelections = accepted.filter(
      (cycle) =>
        cycle.desiredBid !== null &&
        cycle.desiredAsk !== null &&
        cycle.expectedBidEdgeBps !== null &&
        cycle.expectedAskEdgeBps !== null &&
        Math.abs(cycle.expectedBidEdgeBps - cycle.expectedAskEdgeBps) < 1e-9,
    );
    const equivalentBuy = equivalentSelections.filter(
      (cycle) => cycle.selectedSide === 'BUY',
    ).length;
    const equivalentSell = equivalentSelections.filter(
      (cycle) => cycle.selectedSide === 'SELL',
    ).length;
    const sideBiasFound =
      equivalentSelections.length >= 4 && Math.abs(equivalentBuy - equivalentSell) > 1;
    const inventorySkewDirectionErrors = accepted.filter((cycle) => {
      const pressure = cycle.inventoryPressure;
      if (pressure === null || pressure === 0) return false;
      if (
        cycle.inventoryBidSizeMultiplier === null ||
        cycle.inventoryAskSizeMultiplier === null ||
        cycle.inventoryPriceSkewBps === null
      )
        return true;
      return pressure > 0
        ? cycle.inventoryBidSizeMultiplier >= cycle.inventoryAskSizeMultiplier ||
            cycle.inventoryPriceSkewBps <= 0
        : cycle.inventoryAskSizeMultiplier >= cycle.inventoryBidSizeMultiplier ||
            cycle.inventoryPriceSkewBps >= 0;
    }).length;
    const unexplainedDecisions = accepted.filter(
      (cycle) =>
        cycle.exactReasonCode.length === 0 ||
        cycle.bidEligibilityReason.length === 0 ||
        cycle.askEligibilityReason.length === 0,
    ).length;
    const invalidReprices = accepted.filter(
      (cycle) =>
        cycle.selectedMutation === 'WOULD_REPLACE' &&
        cycle.repriceResult !== 'REPRICE_BEHIND_5_TICKS',
    ).length;
    const report = Object.freeze({
      version: 'DECIBEL_PRODUCTION_LIVE_SHADOW_V1',
      generatedAt: Date.now(),
      journalPath,
      liveShadowCycles: accepted.length,
      staleCycles,
      bidEligibleCycles,
      askEligibleCycles,
      feeUnknownCycles,
      gasUnknownCycles,
      unknownTreatedAsZero,
      adverseFilterTriggered,
      edgeGateRejections,
      buySelected,
      sellSelected,
      sideBiasFound,
      inventorySkewDirectionErrors,
      unexplainedDecisions,
      invalidReprices,
      placeInvocations,
      cancelInvocations,
      signedTransactions: 0,
      readErrors,
      decisions: accepted,
    });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return Object.freeze({ ...report, reportPath, decisions: undefined });
  } finally {
    await Orchestrator.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runDecibelProductionLiveShadowV1(process.env)
    .then((report) => console.log(JSON.stringify(report)))
    .catch((error: unknown) => {
      console.error(`DECIBEL_PRODUCTION_LIVE_SHADOW=FAIL BLOCKER=${getErrorMessage(error)}`);
      process.exitCode = 1;
    });
}
