import {
  DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1,
  buildDecibelCandidateAdverseSelectionEvidenceV1,
} from './decibel_candidate_adverse_evidence_v1.js';
import dotenv from 'dotenv';

dotenv.config();

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';

import {
  calculateDecibelBlockAwareSyntheticBboMarkoutsV1,
  hydrateDecibelProductionRawWsBboStoreV1,
  resolveDecibelProductionEconomicStorePathsV1,
  selectDecibelAdverseSelectionEstimateV1,
  type decibel_raw_ws_bbo_observation_v1,
} from './decibel_adverse_selection_evidence_v1.js';
import {
  calculateDecibelMakerFeeUsdV1,
  getDecibelPercentileV1,
  type decibel_bbo_observation_v1,
} from './decibel_market_making_economics_v1.js';
import { classifyDecibelOperationalMarketRegimeV1 } from './decibel_market_regime_v1.js';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';

type economic_evidence_v1 = Readonly<{
  observedAt: number;
  makerFeeBps: number;
  makerFeeSource: string;
  conservativeGasCostUsd: number;
  gasCostSource: string;
  observedGasTxCount: number;
  medianGasApt: number;
  p95GasApt: number;
  aptUsd: number;
  aptUsdSource: string;
}>;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function getFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export { DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1 } from './decibel_candidate_adverse_evidence_v1.js';
export const DECIBEL_ADVERSE_WS_IDLE_TIMEOUT_MS_V1 = 15_000 as const;

export function selectCanonicalDecibelAdverseEvidenceV1(
  observations: readonly decibel_raw_ws_bbo_observation_v1[],
  now: number,
  maximumAgeMs: number,
) {
  const fresh = observations.filter(
    (observation) => observation.timestamp <= now && now - observation.timestamp <= maximumAgeMs,
  );
  const currentRegime = fresh.at(-1)?.regime;
  if (currentRegime === undefined) throw new Error('ADVERSE_RAW_WS_BBO_EVIDENCE_UNAVAILABLE');
  const selection = selectDecibelAdverseSelectionEstimateV1(
    fresh,
    currentRegime,
    now,
    DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1,
    maximumAgeMs,
  );
  if (selection.selected === null)
    throw new Error(
      `ADVERSE_EVIDENCE_INSUFFICIENT:REGIME=${selection.regimeEstimate.effectiveSampleCount}/${DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1}:GLOBAL=${selection.globalEstimate.effectiveSampleCount}/${DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1}`,
    );
  return Object.freeze({ observations: Object.freeze(fresh), currentRegime, selection });
}

let AdverseWsCollectorOwner: symbol | null = null;

export class decibel_adverse_ws_idle_watchdog_v1 {
  private lastValidObservationAt: number;

  public constructor(startedAt: number) {
    this.lastValidObservationAt = startedAt;
  }

  public recordValidObservation(observedAt: number): void {
    this.lastValidObservationAt = observedAt;
  }

  public resetAfterReconnect(reconnectedAt: number): void {
    this.lastValidObservationAt = reconnectedAt;
  }

  public getIdleAgeMs(now: number): number {
    return Math.max(0, now - this.lastValidObservationAt);
  }

  public isStalled(now: number, idleTimeoutMs: number): boolean {
    return this.getIdleAgeMs(now) >= idleTimeoutMs;
  }
}

export function acquireDecibelAdverseWsCollectorOwnershipV1(): () => void {
  if (AdverseWsCollectorOwner !== null)
    throw new Error('DECIBEL_ADVERSE_WS_COLLECTOR_ALREADY_ACTIVE');
  const Owner = Symbol('DECIBEL_ADVERSE_WS_COLLECTOR_OWNER');
  AdverseWsCollectorOwner = Owner;
  return () => {
    if (AdverseWsCollectorOwner === Owner) AdverseWsCollectorOwner = null;
  };
}

function classifyRawBboRegime(
  observations: readonly decibel_bbo_observation_v1[],
): decibel_raw_ws_bbo_observation_v1['regime'] {
  const recent = observations.slice(-120).map((row) => ({
    at: row.timestamp,
    midpoint: (row.bestBid + row.bestAsk) / 2,
    bestBid: row.bestBid,
    bestAsk: row.bestAsk,
    bestBidSize: null,
    bestAskSize: null,
    microprice: null,
    topBookImbalance: null,
    recentTradeIntensity: null,
  }));
  return classifyDecibelOperationalMarketRegimeV1(recent, 0).regime;
}

export { buildDecibelCandidateAdverseSelectionEvidenceV1 } from './decibel_candidate_adverse_evidence_v1.js';
export type { decibel_candidate_adverse_bucket_v1 } from './decibel_candidate_adverse_evidence_v1.js';

export function loadFreshDecibelJournalBboObservationsV1(
  path: string,
  now: number,
  maximumAgeMs: number,
): readonly decibel_bbo_observation_v1[] {
  if (!existsSync(path)) return Object.freeze([]);
  const DatabaseReader = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const rows = DatabaseReader.prepare(
      'SELECT snapshot_json snapshotJson, observed_at observedAt FROM strategy_decision_snapshots WHERE observed_at>=? AND observed_at<=? ORDER BY observed_at',
    ).all(now - maximumAgeMs, now) as Array<{ snapshotJson: string; observedAt: number }>;
    const observations = new Map<number, decibel_bbo_observation_v1>();
    for (const row of rows) {
      try {
        const snapshot = JSON.parse(row.snapshotJson) as Record<string, unknown>;
        const timestamp = getFiniteNumber(snapshot.bookObservedAt) ?? row.observedAt;
        const bestBid = getFiniteNumber(snapshot.bestBid);
        const bestAsk = getFiniteNumber(snapshot.bestAsk);
        if (
          timestamp >= now - maximumAgeMs &&
          timestamp <= now &&
          bestBid !== null &&
          bestAsk !== null &&
          bestAsk > bestBid
        )
          observations.set(timestamp, Object.freeze({ timestamp, bestBid, bestAsk }));
      } catch {
        continue;
      }
    }
    return Object.freeze(
      [...observations.values()].sort((left, right) => left.timestamp - right.timestamp),
    );
  } finally {
    DatabaseReader.close();
  }
}

function loadNormalMmDecisionEvidence(environment: NodeJS.ProcessEnv): readonly Readonly<{
  expectedBidEdgeBps: number | null;
  expectedAskEdgeBps: number | null;
}>[] {
  const configured = environment.DECIBEL_ECONOMIC_NORMAL_MM_REPLAY_SOURCE?.trim();
  const path =
    configured === undefined
      ? resolve(
          'data',
          readdirSync(resolve('data'))
            .filter((name) => /^decibel_production_normal_mm_replay_v1_\d+\.json$/.test(name))
            .sort()
            .at(-1) ?? 'NORMAL_MM_REPLAY_NOT_FOUND',
        )
      : resolve(configured);
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
    decisions?: readonly Readonly<{
      riskState?: string;
      expectedBidEdgeBps?: number | null;
      expectedAskEdgeBps?: number | null;
    }>[];
  };
  const decisions = (parsed.decisions ?? [])
    .filter((row) => row.riskState === 'NORMAL_MM')
    .map((row) => ({
      expectedBidEdgeBps: row.expectedBidEdgeBps ?? null,
      expectedAskEdgeBps: row.expectedAskEdgeBps ?? null,
    }));
  if (decisions.length < 500) throw new Error('DECIBEL_NORMAL_MM_DECISION_EVIDENCE_INSUFFICIENT');
  return Object.freeze(decisions.slice(0, 500));
}

export async function runDecibelProductionEconomicViabilityV1(
  environment: NodeJS.ProcessEnv,
): Promise<Readonly<Record<string, unknown>>> {
  const replaySource = environment.DECIBEL_ECONOMIC_MARKOUT_REPLAY_SOURCE?.trim();
  const durationMs = Number(environment.DECIBEL_ECONOMIC_MARKOUT_DURATION_MS ?? 75_000);
  const minimumRuntimeMs = Number(environment.DECIBEL_ECONOMIC_MARKOUT_MINIMUM_RUNTIME_MS ?? 0);
  if (replaySource === undefined && (!Number.isSafeInteger(durationMs) || durationMs < 35_000))
    throw new Error('DECIBEL_ECONOMIC_MARKOUT_DURATION_INVALID');
  if (
    !Number.isSafeInteger(minimumRuntimeMs) ||
    minimumRuntimeMs < 0 ||
    minimumRuntimeMs > durationMs
  )
    throw new Error('DECIBEL_ECONOMIC_MARKOUT_MINIMUM_RUNTIME_INVALID');
  const EconomicStorePaths = resolveDecibelProductionEconomicStorePathsV1(environment);
  const evidencePath = EconomicStorePaths.evidencePath;
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as economic_evidence_v1;
  const maximumEvidenceAgeMs = Number(
    environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS ?? 3_600_000,
  );
  if (!Number.isSafeInteger(maximumEvidenceAgeMs) || maximumEvidenceAgeMs <= 0)
    throw new Error('DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_INVALID');
  const journalPath = resolve(
    environment.DECIBEL_EXECUTION_JOURNAL_PATH ?? 'data/decibel_execution_v1.sqlite',
  );
  const journalObservations =
    replaySource === undefined
      ? loadFreshDecibelJournalBboObservationsV1(journalPath, Date.now(), maximumEvidenceAgeMs)
      : Object.freeze([]);
  const RawStore = hydrateDecibelProductionRawWsBboStoreV1(environment);
  const initialRaw = RawStore.readFresh(Date.now(), maximumEvidenceAgeMs);
  const observationsByTimestamp = new Map<number, decibel_bbo_observation_v1>();
  for (const observation of [...journalObservations, ...initialRaw])
    observationsByTimestamp.set(
      observation.timestamp,
      Object.freeze({
        timestamp: observation.timestamp,
        bestBid: observation.bestBid,
        bestAsk: observation.bestAsk,
      }),
    );
  const observations: decibel_bbo_observation_v1[] = [...observationsByTimestamp.values()].sort(
    (left, right) => left.timestamp - right.timestamp,
  );
  let rawWsMessageCount = initialRaw.length;
  let validBboObservationCount = initialRaw.length;
  const initialRegime = initialRaw.at(-1)?.regime;
  const initialRepresentative =
    initialRegime === undefined
      ? false
      : selectDecibelAdverseSelectionEstimateV1(initialRaw, initialRegime, Date.now()).selected !==
        null;
  const forceWsCollectionForTest =
    environment.DECIBEL_ECONOMIC_WS_FORCE_COLLECTION_FOR_TEST === 'true';
  if (replaySource !== undefined) {
    const source = JSON.parse(readFileSync(resolve(replaySource), 'utf8')) as {
      decisions?: readonly Record<string, unknown>[];
    };
    for (const row of source.decisions ?? []) {
      const timestamp = getFiniteNumber(row.timestamp);
      const bestBid = getFiniteNumber(row.bestBid);
      const bestAsk = getFiniteNumber(row.bestAsk);
      if (timestamp !== null && bestBid !== null && bestAsk !== null && bestAsk > bestBid)
        observations.push(Object.freeze({ timestamp, bestBid, bestAsk }));
    }
  } else if (!initialRepresentative || forceWsCollectionForTest) {
    const idleTimeoutMs = Number(
      environment.DECIBEL_ECONOMIC_WS_IDLE_TIMEOUT_MS ?? DECIBEL_ADVERSE_WS_IDLE_TIMEOUT_MS_V1,
    );
    if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1_000)
      throw new Error('DECIBEL_ECONOMIC_WS_IDLE_TIMEOUT_INVALID');
    const suppressValidAfterMsRaw = environment.DECIBEL_ECONOMIC_WS_TEST_SUPPRESS_VALID_AFTER_MS;
    const suppressValidAfterMs =
      suppressValidAfterMsRaw === undefined ? null : Number(suppressValidAfterMsRaw);
    if (
      suppressValidAfterMs !== null &&
      (!forceWsCollectionForTest ||
        !Number.isSafeInteger(suppressValidAfterMs) ||
        suppressValidAfterMs < 0)
    )
      throw new Error('DECIBEL_ECONOMIC_WS_TEST_FAULT_INJECTION_INVALID');
    const { DecibelReadDex, MAINNET_CONFIG } = await loadDecibelSdkRuntimeV1();
    const releaseCollectorOwnership = acquireDecibelAdverseWsCollectorOwnershipV1();
    const apiKey = environment.DECIBEL_NODE_API_KEY?.trim();
    let lastRecordedAt = 0;
    let Reader: InstanceType<typeof DecibelReadDex> | null = null;
    let unsubscribe: (() => void) | null = null;
    let subscriptionGeneration = 0;
    let subscriptionOpenedAt = 0;
    let reconnectCount = 0;
    let suppressedGeneration: number | null = null;
    const Watchdog = new decibel_adverse_ws_idle_watchdog_v1(Date.now());
    const closeSubscription = (): void => {
      subscriptionGeneration += 1;
      const CurrentUnsubscribe = unsubscribe;
      const CurrentReader = Reader;
      unsubscribe = null;
      Reader = null;
      try {
        CurrentUnsubscribe?.();
      } catch (error) {
        console.warn(
          `DECIBEL_ADVERSE_COLLECTION=WS_UNSUBSCRIBE_FAILED ERROR=${error instanceof Error ? error.message : String(error)}`,
        );
      }
      try {
        CurrentReader?.deps?.ws.close();
      } catch (error) {
        console.warn(
          `DECIBEL_ADVERSE_COLLECTION=WS_CLOSE_FAILED ERROR=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    const openSubscription = (): void => {
      closeSubscription();
      const CurrentReader = new DecibelReadDex(
        MAINNET_CONFIG,
        apiKey ? { nodeApiKey: apiKey } : undefined,
      );
      Reader = CurrentReader;
      const generation = subscriptionGeneration;
      subscriptionOpenedAt = Date.now();
      Watchdog.resetAfterReconnect(subscriptionOpenedAt);
      unsubscribe = CurrentReader.marketDepth.subscribeByName('BTC/USD', 1, (message) => {
        if (generation !== subscriptionGeneration) return;
        rawWsMessageCount += 1;
        if (
          suppressValidAfterMs !== null &&
          suppressedGeneration === null &&
          Date.now() - subscriptionOpenedAt >= suppressValidAfterMs
        ) {
          suppressedGeneration = generation;
          console.warn(
            `DECIBEL_ADVERSE_COLLECTION=WS_VALID_BBO_STALL_INJECTED GENERATION=${generation}`,
          );
        }
        if (suppressedGeneration === generation) return;
        const wrapper = message as unknown as Record<string, unknown>;
        const record =
          typeof wrapper.depth === 'object' && wrapper.depth !== null
            ? (wrapper.depth as Record<string, unknown>)
            : wrapper;
        const timestamp = getFiniteNumber(record.unix_ms);
        const bestBid = getFiniteNumber(record.best_bid);
        const bestAsk = getFiniteNumber(record.best_ask);
        if (
          timestamp !== null &&
          bestBid !== null &&
          bestAsk !== null &&
          bestAsk > bestBid &&
          timestamp - lastRecordedAt >= 500
        ) {
          validBboObservationCount += 1;
          Watchdog.recordValidObservation(Date.now());
          if (!observations.some((entry) => entry.timestamp === timestamp)) {
            observations.push(Object.freeze({ timestamp, bestBid, bestAsk }));
            const freshRaw = RawStore.readFresh(timestamp).map((row) => ({
              timestamp: row.timestamp,
              bestBid: row.bestBid,
              bestAsk: row.bestAsk,
            }));
            const regime = classifyRawBboRegime([
              ...freshRaw,
              Object.freeze({ timestamp, bestBid, bestAsk }),
            ]);
            RawStore.append(
              Object.freeze({ timestamp, bestBid, bestAsk, regime, source: 'DECIBEL_WS_BBO' }),
            );
          }
          lastRecordedAt = timestamp;
        }
      });
    };
    try {
      openSubscription();
      const collectionStartedAt = Date.now();
      const deadline = Date.now() + durationMs;
      let nextProgressAt = Date.now();
      while (Date.now() < deadline) {
        await wait(Math.min(1_000, deadline - Date.now()));
        if (Watchdog.isStalled(Date.now(), idleTimeoutMs)) {
          const idleAgeMs = Watchdog.getIdleAgeMs(Date.now());
          reconnectCount += 1;
          console.warn(
            `DECIBEL_ADVERSE_COLLECTION=WS_STALL IDLE_AGE_MS=${idleAgeMs} IDLE_TIMEOUT_MS=${idleTimeoutMs} RECONNECT_COUNT=${reconnectCount}`,
          );
          try {
            openSubscription();
            console.log(
              `DECIBEL_ADVERSE_COLLECTION=WS_RECONNECTED RECONNECT_COUNT=${reconnectCount} EFFECTIVE_SAMPLES_PRESERVED=YES`,
            );
          } catch (error) {
            Watchdog.resetAfterReconnect(Date.now());
            console.warn(
              `DECIBEL_ADVERSE_COLLECTION=WS_RECONNECT_FAILED RECONNECT_COUNT=${reconnectCount} ERROR=${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        const currentRaw = RawStore.readFresh(Date.now(), maximumEvidenceAgeMs);
        const currentRegime = currentRaw.at(-1)?.regime;
        const currentEstimate =
          currentRegime === undefined
            ? null
            : selectDecibelAdverseSelectionEstimateV1(currentRaw, currentRegime, Date.now());
        if (Date.now() >= nextProgressAt) {
          console.log(
            `DECIBEL_ADVERSE_COLLECTION=PROGRESS RAW_WS_MESSAGES=${rawWsMessageCount} VALID_BBO_OBSERVATIONS=${validBboObservationCount} REGIME=${currentRegime ?? 'UNKNOWN'} EFFECTIVE_SAMPLES=${currentEstimate?.regimeEstimate.effectiveSampleCount ?? 0}/${DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1} GLOBAL_EFFECTIVE_SAMPLES=${currentEstimate?.globalEstimate.effectiveSampleCount ?? 0}/${DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1}`,
          );
          nextProgressAt = Date.now() + 5_000;
        }
        if (
          currentEstimate !== null &&
          currentEstimate.selected !== null &&
          Date.now() - collectionStartedAt >= minimumRuntimeMs
        )
          break;
      }
    } finally {
      try {
        closeSubscription();
      } finally {
        releaseCollectorOwnership();
      }
    }
    console.log(
      `DECIBEL_ADVERSE_COLLECTION=COMPLETE RAW_WS_MESSAGES=${rawWsMessageCount} VALID_BBO_OBSERVATIONS=${validBboObservationCount}`,
    );
  }
  const selectedCanonical = selectCanonicalDecibelAdverseEvidenceV1(
    RawStore.readFresh(Date.now(), maximumEvidenceAgeMs),
    Date.now(),
    maximumEvidenceAgeMs,
  );
  const rawWsObservations = selectedCanonical.observations;
  const currentRegime = selectedCanonical.currentRegime;
  const adverseSelection = selectedCanonical.selection;
  const syntheticEstimate = adverseSelection.selected;
  if (syntheticEstimate === null) throw new Error('ADVERSE_EVIDENCE_SELECTION_INVALID');
  if (!syntheticEstimate.representative || syntheticEstimate.p95AdverseSelectionBps === null)
    throw new Error(syntheticEstimate.blocker ?? 'ADVERSE_REGIME_EVIDENCE_UNAVAILABLE');
  const horizons = syntheticEstimate.horizons.map((horizon) => ({
    horizonMs: horizon.horizonMs,
    observationCount: horizon.rawSampleCount,
    effectiveSampleCount: horizon.effectiveSampleCount,
    buyP95AdverseBps: horizon.buyP95AdverseBps,
    sellP95AdverseBps: horizon.sellP95AdverseBps,
    combinedP95AdverseBps: horizon.combinedP95AdverseBps,
  }));
  const adverseSelectionBufferBps = syntheticEstimate.p95AdverseSelectionBps;
  const spreadsBps = observations.map(
    (row) => ((row.bestAsk - row.bestBid) / ((row.bestAsk + row.bestBid) / 2)) * 10_000,
  );
  observations.sort((left, right) => left.timestamp - right.timestamp);
  const adverseSelectionObservedAt = Math.min(observations.at(-1)!.timestamp, Date.now());
  const candidateBuckets = buildDecibelCandidateAdverseSelectionEvidenceV1(
    observations,
    adverseSelectionObservedAt,
  );
  const missingCandidateBuckets = candidateBuckets.filter(
    (bucket) =>
      bucket.p95AdverseSelectionBps === null ||
      bucket.sampleCount < DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1,
  );
  const candidateAdverseSelection = candidateBuckets
    .filter(
      (bucket) =>
        bucket.p95AdverseSelectionBps !== null &&
        bucket.sampleCount >= DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1,
    )
    .map((bucket) => ({
      ...bucket,
      p95AdverseSelectionBps: bucket.p95AdverseSelectionBps!,
    }));
  const updatedEvidence = Object.freeze({
    ...evidence,
    observedAt: Date.now(),
    adverseSelectionBufferBps,
    adverseSelectionSource:
      adverseSelection.source === 'GLOBAL_FALLBACK'
        ? 'GLOBAL_FALLBACK'
        : 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
    adverseSelectionObservedAt: syntheticEstimate.observedAt,
    adverseSelectionRegime: currentRegime,
    adverseSelectionRawSampleCount: syntheticEstimate.rawSampleCount,
    adverseSelectionEffectiveSampleCount: syntheticEstimate.effectiveSampleCount,
    adverseSelectionRepresentative: syntheticEstimate.representative,
    candidateAdverseSelection,
    candidateAdverseSelectionMissingEvidence: missingCandidateBuckets.map((bucket) => ({
      side: bucket.side,
      distanceBps: bucket.distanceBps,
      sampleCount: bucket.sampleCount,
      missingSampleCount: Math.max(
        0,
        DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1 - bucket.sampleCount,
      ),
    })),
    adverseSelectionHorizons: horizons,
    adverseSelectionObservationCount: syntheticEstimate.rawSampleCount,
    adverseSelectionRawWsMessageCount: rawWsMessageCount,
    adverseSelectionValidBboObservationCount: validBboObservationCount,
    adverseSelectionGlobalRawSampleCount: adverseSelection.globalEstimate.rawSampleCount,
    adverseSelectionGlobalEffectiveSampleCount:
      adverseSelection.globalEstimate.effectiveSampleCount,
    adverseSelectionGlobalP95Bps: adverseSelection.globalEstimate.p95AdverseSelectionBps,
    adverseSelectionRegimeBuckets: ['QUIET', 'NORMAL', 'FAST'].map((regime) => {
      const bucket = calculateDecibelBlockAwareSyntheticBboMarkoutsV1(
        rawWsObservations,
        regime as 'QUIET' | 'NORMAL' | 'FAST',
        Date.now(),
      );
      return {
        regime,
        rawSampleCount: bucket.rawSampleCount,
        effectiveSampleCount: bucket.effectiveSampleCount,
        p95AdverseSelectionBps: bucket.p95AdverseSelectionBps,
        representative: bucket.representative,
        observedAt: bucket.observedAt,
      };
    }),
  });
  writeFileSync(evidencePath, `${JSON.stringify(updatedEvidence, null, 2)}\n`, 'utf8');
  if (
    !Number.isFinite(evidence.makerFeeBps) ||
    !Number.isFinite(evidence.conservativeGasCostUsd) ||
    !Number.isFinite(evidence.aptUsd)
  )
    return updatedEvidence;
  const makerRate = evidence.makerFeeBps / 10_000;
  const typicalOrderUsd = 10;
  const p95GasBpsAtTypicalOrder = (evidence.conservativeGasCostUsd / typicalOrderUsd) * 10_000;
  const safetyMarginBps = Number(environment.DECIBEL_PRODUCTION_EDGE_SAFETY_MARGIN_BPS ?? 1);
  const breakEvenEdgeBps =
    evidence.makerFeeBps + p95GasBpsAtTypicalOrder + adverseSelectionBufferBps + safetyMarginBps;
  const normalMmDecisions = loadNormalMmDecisionEvidence(environment);
  const evaluatedEdges = normalMmDecisions.flatMap((decision) => [
    decision.expectedBidEdgeBps,
    decision.expectedAskEdgeBps,
  ]);
  const acceptedEdges = evaluatedEdges.filter(
    (edge): edge is number => edge !== null && edge > breakEvenEdgeBps,
  );
  const report = Object.freeze({
    version: 'DECIBEL_PRODUCTION_ECONOMIC_VIABILITY_V1',
    observedAt: Date.now(),
    makerRateWireDecimal: makerRate,
    makerRateRawBps: evidence.makerFeeBps,
    makerRateUnit: 'BASIS_POINTS_OF_FILL_NOTIONAL',
    makerRateIsRebate: evidence.makerFeeBps < 0,
    makerFeesUsd: Object.freeze({
      notional10: calculateDecibelMakerFeeUsdV1(10, makerRate),
      notional11: calculateDecibelMakerFeeUsdV1(11, makerRate),
      notional20: calculateDecibelMakerFeeUsdV1(20, makerRate),
    }),
    medianSpreadBps: getDecibelPercentileV1(spreadsBps, 0.5),
    p95SpreadBps: getDecibelPercentileV1(spreadsBps, 0.95),
    p95GasBpsAtTypicalOrder,
    typicalOrderUsd,
    adverseSelectionBufferBps,
    adverseSelectionMethod: '30S_BLOCK_AWARE_CURRENT_REGIME_SYNTHETIC_BBO_P95',
    adverseSelectionHorizons: horizons,
    liveBboObservationCount: observations.length,
    freshJournalBboObservationCount: journalObservations.length,
    freshRawEvidenceReused: journalObservations.length > 0,
    candidateAdverseSelection,
    markoutEvidenceSource:
      replaySource === undefined ? 'LIVE_DECIBEL_DEPTH_WEBSOCKET' : resolve(replaySource),
    breakEvenEdgeBps,
    positiveEdgeOpportunities: acceptedEdges.length,
    totalEvaluated: evaluatedEdges.length,
    normalMmQuotesAccepted: acceptedEdges.length,
    normalMmQuotesRejected: evaluatedEdges.length - acceptedEdges.length,
    normalMmEconomicallyViable: acceptedEdges.length > 0,
    replay: Object.freeze({
      normalMmCycles: normalMmDecisions.length,
      economicInputsApplied: true,
      quoteAcceptanceRule: 'EXPECTED_EDGE_BPS_GREATER_THAN_BREAK_EVEN_EDGE_BPS',
    }),
    placeInvocations: 0,
    cancelInvocations: 0,
    signedTransactions: 0,
  });
  const reportPath = resolve(`data/decibel_production_economic_viability_v1_${Date.now()}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return Object.freeze({ ...report, reportPath });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runDecibelProductionEconomicViabilityV1(process.env)
    .then((report) => console.log(JSON.stringify(report)))
    .catch((error: unknown) => {
      console.error(
        `DECIBEL_PRODUCTION_ECONOMIC_VIABILITY=FAIL BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`,
      );
      process.exitCode = 1;
    });
}
