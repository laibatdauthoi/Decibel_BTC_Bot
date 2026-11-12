import dotenv from 'dotenv';

dotenv.config();

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import {
  decibel_production_live_orchestrator_v1,
  parseDecibelProductionLiveConfigurationV1,
  type DecibelProductionLiveStateSourceV1,
  type decibel_production_live_snapshot_v1,
} from './decibel_production_live_orchestrator_v1.js';
import { createDecibelProductionLiveStateSourceV1 } from './decibel_production_live_state_source_v1.js';
import type { DecibelProductionExecutionExecutorV1 } from './decibel_production_executor_handoff_v1.js';

type recorded_bbo_v1 = Readonly<{
  timestamp: number;
  bestBid: number;
  bestAsk: number;
  bookObservedAt: number;
}>;

function getLatestShadowReportPath(): string {
  const configured = process.env.DECIBEL_SHADOW_REPLAY_SOURCE;
  if (configured !== undefined) return resolve(configured);
  const directory = resolve('data');
  const latest = readdirSync(directory)
    .filter((name) => /^decibel_production_live_shadow_v1_\d+\.json$/.test(name))
    .sort()
    .at(-1);
  if (latest === undefined) throw new Error('SHADOW_REPLAY_SOURCE_NOT_FOUND');
  return join(directory, latest);
}

function loadRecordedBbos(path: string): readonly recorded_bbo_v1[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
    decisions?: readonly Partial<recorded_bbo_v1>[];
  };
  const result = (parsed.decisions ?? []).flatMap((decision) =>
    typeof decision.timestamp === 'number' &&
    typeof decision.bestBid === 'number' &&
    typeof decision.bestAsk === 'number' &&
    typeof decision.bookObservedAt === 'number'
      ? [
          Object.freeze({
            timestamp: decision.timestamp,
            bestBid: decision.bestBid,
            bestAsk: decision.bestAsk,
            bookObservedAt: decision.bookObservedAt,
          }),
        ]
      : [],
  );
  if (result.length === 0) throw new Error('SHADOW_REPLAY_BBO_EVIDENCE_EMPTY');
  return Object.freeze(result);
}

export async function runDecibelProductionNormalMmReplayV1(
  environment: NodeJS.ProcessEnv,
): Promise<Readonly<Record<string, unknown>>> {
  const sourceReportPath = getLatestShadowReportPath();
  const recordedBbos = loadRecordedBbos(sourceReportPath);
  const liveSource = createDecibelProductionLiveStateSourceV1({ environment });
  const base = await liveSource.readAuthenticatedSnapshot();
  await liveSource.close?.();
  const runId = Date.now();
  const journalPath = resolve(`data/decibel_production_normal_mm_replay_v1_${runId}.sqlite`);
  const reportPath = resolve(`data/decibel_production_normal_mm_replay_v1_${runId}.json`);
  const snapshots: decibel_production_live_snapshot_v1[] = Array.from(
    { length: 500 },
    (_value, index) => {
      const bbo = recordedBbos[index % recordedBbos.length]!;
      const input = Object.freeze({
        ...base.input,
        now: bbo.timestamp,
        actualInventoryBase: 0,
        openOrders: Object.freeze([]),
        activeTwapCount: 0,
        activeTpSlCount: 0,
        activeBulkOrderCount: 0,
        manualOrDelegatedActivityCount: 0,
        unresolvedExecutionPlanCount: 0,
        targetExternalMakerVolumeUsd: null,
        book: Object.freeze({
          ...base.input.book,
          bestBid: bbo.bestBid,
          bestAsk: bbo.bestAsk,
          observedAt: bbo.bookObservedAt,
        }),
      });
      return Object.freeze({
        ...base,
        input,
        authenticatedPositions: Object.freeze([]),
        sourceStateHash: `NORMAL_MM_REPLAY:${index}:${bbo.timestamp}:${bbo.bestBid}:${bbo.bestAsk}`,
      });
    },
  );
  let cursor = 0;
  const replaySource: DecibelProductionLiveStateSourceV1 = {
    readAuthenticatedSnapshot: () =>
      Promise.resolve(snapshots[Math.min(cursor++, snapshots.length - 1)]!),
    readAuthenticatedPosition: () =>
      Promise.resolve({
        positionBase: 0,
        observedAt: Date.now(),
        source: 'AUTHENTICATED_POSITION_READ',
      }),
    reconcileIntent: () => Promise.reject(new Error('REPLAY_RECONCILIATION_NOT_EXPECTED')),
  };
  let placeInvocations = 0;
  let cancelInvocations = 0;
  const forbiddenExecutor: DecibelProductionExecutionExecutorV1 = {
    placePostOnlyLimit: () => {
      placeInvocations += 1;
      return Promise.reject(new Error('REPLAY_PLACE_FORBIDDEN'));
    },
    cancelExactOrder: () => {
      cancelInvocations += 1;
      return Promise.reject(new Error('REPLAY_CANCEL_FORBIDDEN'));
    },
  };
  const safeEnvironment = {
    ...environment,
    DECIBEL_EXECUTION_MODE: 'production',
    DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
    DECIBEL_EXECUTOR_ENABLED: 'true',
    DECIBEL_EXECUTOR_DRY_RUN: 'true',
    DECIBEL_EXECUTION_JOURNAL_PATH: journalPath,
  };
  const Journal = new decibel_execution_lifecycle_journal_v1(journalPath);
  const Orchestrator = new decibel_production_live_orchestrator_v1(
    Journal,
    replaySource,
    forbiddenExecutor,
    parseDecibelProductionLiveConfigurationV1(safeEnvironment),
    {
      maxPlaceAttemptsPerMinute: 30,
      maxCancelAttemptsPerMinute: 30,
      maxTotalMutationAttemptsPerMinute: 60,
      maxConsecutiveUnknownOutcomes: 1,
      maxKnownLiveOrders: 2,
    },
  );
  for (let cycle = 0; cycle < 500; cycle += 1) await Orchestrator.evaluateOnce();
  const decisions = Journal.getDecisionSnapshots().map((row) => row.snapshot) as readonly Readonly<{
    riskState: string;
    desiredBid: unknown;
    desiredAsk: unknown;
    selectedSide: 'BUY' | 'SELL' | null;
    makerFeeSource: string;
    estimatedGasCostSource: string;
    bidEligibilityReason: string;
    askEligibilityReason: string;
    adverseSelectionBufferBps: number | null;
    expectedBidEdgeBps: number | null;
    expectedAskEdgeBps: number | null;
    requiredBidEdgeBps: number | null;
    requiredAskEdgeBps: number | null;
  }>[];
  const report = Object.freeze({
    version: 'DECIBEL_PRODUCTION_NORMAL_MM_REPLAY_V1',
    sourceReportPath,
    journalPath,
    normalMmCycles: decisions.filter((decision) => decision.riskState === 'NORMAL_MM').length,
    normalBidEligible: decisions.filter((decision) => decision.desiredBid !== null).length,
    normalAskEligible: decisions.filter((decision) => decision.desiredAsk !== null).length,
    buySelected: decisions.filter((decision) => decision.selectedSide === 'BUY').length,
    sellSelected: decisions.filter((decision) => decision.selectedSide === 'SELL').length,
    feeUnknownNormalMm: decisions.filter((decision) => decision.makerFeeSource === 'UNKNOWN')
      .length,
    gasUnknownNormalMm: decisions.filter(
      (decision) => decision.estimatedGasCostSource === 'UNKNOWN',
    ).length,
    edgeGateRejections: decisions.filter(
      (decision) =>
        decision.bidEligibilityReason === 'ECONOMIC_INPUT_UNKNOWN' ||
        decision.askEligibilityReason === 'ECONOMIC_INPUT_UNKNOWN' ||
        decision.bidEligibilityReason === 'EXPECTED_EDGE_INSUFFICIENT' ||
        decision.askEligibilityReason === 'EXPECTED_EDGE_INSUFFICIENT',
    ).length,
    adverseFilterTriggered: decisions.filter((decision) => {
      if (decision.adverseSelectionBufferBps === null || decision.adverseSelectionBufferBps <= 0)
        return false;
      return (
        (decision.expectedBidEdgeBps !== null &&
          decision.requiredBidEdgeBps !== null &&
          decision.expectedBidEdgeBps <= decision.requiredBidEdgeBps) ||
        (decision.expectedAskEdgeBps !== null &&
          decision.requiredAskEdgeBps !== null &&
          decision.expectedAskEdgeBps <= decision.requiredAskEdgeBps)
      );
    }).length,
    placeInvocations,
    cancelInvocations,
    signedTransactions: 0,
    decisions,
  });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await Orchestrator.close();
  return Object.freeze({ ...report, reportPath, decisions: undefined });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runDecibelProductionNormalMmReplayV1(process.env)
    .then((report) => console.log(JSON.stringify(report)))
    .catch((error: unknown) => {
      console.error(
        `DECIBEL_PRODUCTION_NORMAL_MM_REPLAY=FAIL BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`,
      );
      process.exitCode = 1;
    });
}
