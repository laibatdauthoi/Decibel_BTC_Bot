import {
  DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1,
  buildDecibelCandidateAdverseSelectionEvidenceV1,
} from './decibel_candidate_adverse_evidence_v1.js';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateDecibelProductionEconomicEvidenceV1 } from './decibel_production_live_state_source_v1.js';
import {
  calculateDecibelBlockAwareSyntheticBboMarkoutsV1,
  DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1,
  hydrateDecibelProductionRawWsBboStoreV1,
  resolveDecibelProductionEconomicStorePathsV1,
  selectDecibelAdverseSelectionEstimateV1,
  type decibel_raw_ws_bbo_store_v1,
} from './decibel_adverse_selection_evidence_v1.js';
import {
  enterDecibelHTTPReadBackoffV1,
  isDecibelHTTP429V1,
} from './decibel_http_read_backoff_v1.js';
import { runDecibelProductionEconomicInputsAuditV1 } from './run_decibel_production_economic_inputs_audit_v1.js';

type economic_refresh_runner_v1 = (
  environment: NodeJS.ProcessEnv,
) => Promise<Readonly<Record<string, unknown>>>;

export type decibel_economic_bootstrap_result_v1 = Readonly<{
  lastKnownGoodFound: boolean;
  lastKnownGoodReady: boolean;
  refreshTriggered: true;
  refreshResult: 'PASS' | 'WARMING' | 'FAIL';
  economicEvidenceReady: boolean;
  blocker: string | null;
}>;

export type decibel_economic_component_name_v1 =
  'MAKER_FEE' | 'GAS_COST' | 'APT_USD' | 'ADVERSE_SELECTION' | 'LIFECYCLE_COST';

export type decibel_economic_component_state_v1 = Readonly<{
  component: decibel_economic_component_name_v1;
  value: number | null;
  source: string | null;
  observedAt: number | null;
  ageMs: number | null;
  ttlMs: number;
  status: 'READY' | 'STALE' | 'UNKNOWN';
  required: boolean;
}>;

export function getDecibelProductionEconomicRefreshDelayV1(
  environment: NodeJS.ProcessEnv,
  now = Date.now(),
): number {
  const configuredMarkoutDurationMs = Number(
    environment.DECIBEL_ECONOMIC_MARKOUT_DURATION_MS ?? 75_000,
  );
  const markoutDurationMs =
    Number.isSafeInteger(configuredMarkoutDurationMs) && configuredMarkoutDurationMs > 0
      ? configuredMarkoutDurationMs
      : 75_000;
  const states = readDecibelProductionEconomicComponentStatesV1(environment, now);
  return Math.max(
    1_000,
    Math.min(
      ...states.map((state) => {
        if (state.status !== 'READY' || state.ageMs === null) return 1_000;
        const collectionLeadMs =
          state.component === 'ADVERSE_SELECTION'
            ? Math.min(markoutDurationMs, Math.floor(state.ttlMs / 4))
            : 0;
        return state.ttlMs - state.ageMs - collectionLeadMs;
      }),
    ),
  );
}

export function getDecibelProductionEconomicPostSuccessDelayV1(
  environment: NodeJS.ProcessEnv,
  observedAtBefore: ReadonlyMap<decibel_economic_component_name_v1, number | null>,
  now = Date.now(),
): number {
  const configuredMarkoutDurationMs = Number(
    environment.DECIBEL_ECONOMIC_MARKOUT_DURATION_MS ?? 75_000,
  );
  const markoutDurationMs =
    Number.isSafeInteger(configuredMarkoutDurationMs) && configuredMarkoutDurationMs > 0
      ? configuredMarkoutDurationMs
      : 75_000;
  const states = readDecibelProductionEconomicComponentStatesV1(environment, now);
  return Math.max(
    1_000,
    Math.min(
      ...states.map((state) => {
        if (state.status !== 'READY' || state.ageMs === null) return 1_000;
        const collectionLeadMs =
          state.component === 'ADVERSE_SELECTION' || state.component === 'LIFECYCLE_COST'
            ? Math.min(markoutDurationMs, Math.floor(state.ttlMs / 4))
            : 0;
        const ordinaryDelay = state.ttlMs - state.ageMs - collectionLeadMs;
        const advanced = observedAtBefore.get(state.component) !== state.observedAt;
        if (advanced || ordinaryDelay > 1_000) return ordinaryDelay;
        const remainingTtlMs = Math.max(1_000, state.ttlMs - state.ageMs);
        const nextEvidenceOpportunityMs =
          state.component === 'ADVERSE_SELECTION' || state.component === 'LIFECYCLE_COST'
            ? markoutDurationMs
            : 5_000;
        return Math.min(nextEvidenceOpportunityMs, remainingTtlMs);
      }),
    ),
  );
}

export function readDecibelProductionEconomicComponentStatesV1(
  environment: NodeJS.ProcessEnv,
  now = Date.now(),
  document?: unknown,
): readonly decibel_economic_component_state_v1[] {
  const evidencePath = resolveDecibelProductionEconomicStorePathsV1(environment).evidencePath;
  const ttlMs = Number(environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS ?? 3_600_000);
  let evidence: Readonly<Record<string, unknown>> = {};
  try {
    const value: unknown =
      document === undefined ? JSON.parse(readFileSync(evidencePath, 'utf8')) : document;
    evidence =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Readonly<Record<string, unknown>>)
        : {};
  } catch {
    // Missing evidence is represented explicitly per component below.
  }
  const component = (
    name: decibel_economic_component_name_v1,
    valueKey: string,
    sourceKey: string,
    observedAtKey: string,
  ): decibel_economic_component_state_v1 => {
    const value = evidence[valueKey];
    const source = evidence[sourceKey];
    const observedAt = evidence[observedAtKey] ?? evidence.observedAt;
    const validValue = typeof value === 'number' && Number.isFinite(value) && value >= 0;
    const validSource = typeof source === 'string' && source.length > 0;
    const validTimestamp = typeof observedAt === 'number' && Number.isSafeInteger(observedAt);
    const ageMs = validTimestamp ? now - observedAt : null;
    const status =
      !validValue || !validSource || ageMs === null || ageMs < 0
        ? 'UNKNOWN'
        : ageMs > ttlMs
          ? 'STALE'
          : 'READY';
    return Object.freeze({
      component: name,
      value: validValue ? value : null,
      source: validSource ? source : null,
      observedAt: validTimestamp ? observedAt : null,
      ageMs,
      ttlMs,
      status,
      required: true,
    });
  };
  const makerFee = component('MAKER_FEE', 'makerFeeBps', 'makerFeeSource', 'makerFeeObservedAt');
  const gasCost = component(
    'GAS_COST',
    'conservativeGasCostUsd',
    'gasCostSource',
    'gasCostObservedAt',
  );
  const aptUsd = component('APT_USD', 'aptUsd', 'aptUsdSource', 'aptUsdObservedAt');
  const adverseSelection = component(
    'ADVERSE_SELECTION',
    'adverseSelectionBufferBps',
    'adverseSelectionSource',
    'adverseSelectionObservedAt',
  );
  const lifecycleInputs = [makerFee, gasCost, aptUsd] as const;
  const lifecycleStatus = lifecycleInputs.every((input) => input.status === 'READY')
    ? 'READY'
    : lifecycleInputs.some((input) => input.status === 'UNKNOWN')
      ? 'UNKNOWN'
      : 'STALE';
  const lifecycleCost: decibel_economic_component_state_v1 = Object.freeze({
    component: 'LIFECYCLE_COST',
    value: gasCost.value,
    source: lifecycleStatus === 'READY' ? 'REQUIRED_ECONOMIC_COMPONENTS' : null,
    observedAt:
      lifecycleStatus === 'READY'
        ? Math.min(...lifecycleInputs.map((input) => input.observedAt!))
        : null,
    ageMs:
      lifecycleStatus === 'READY'
        ? Math.max(...lifecycleInputs.map((input) => input.ageMs!))
        : null,
    ttlMs,
    status: lifecycleStatus,
    required: true,
  });
  return Object.freeze([
    makerFee,
    gasCost,
    aptUsd,
    { ...adverseSelection, required: false },
    lifecycleCost,
  ]);
}

export function inspectDecibelAdverseEvidenceReadinessV1(
  environment: NodeJS.ProcessEnv,
  now = Date.now(),
  RawStore = hydrateDecibelProductionRawWsBboStoreV1(environment),
): Readonly<{
  status: 'READY' | 'WARMING';
  currentRegime: string | null;
  freshObservationCount: number;
  regimeEffectiveSampleCount: number;
  globalEffectiveSampleCount: number;
  requiredEffectiveSampleCount: number;
  oldestObservationAt: number | null;
  newestObservationAt: number | null;
  blocker: string | null;
}> {
  const maximumAgeMs = Number(
    environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS ?? 3_600_000,
  );
  const fresh = RawStore.readFresh(now, maximumAgeMs);
  const currentRegime = fresh.at(-1)?.regime ?? null;
  const selection =
    currentRegime === null
      ? null
      : selectDecibelAdverseSelectionEstimateV1(
          fresh,
          currentRegime,
          now,
          DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1,
          maximumAgeMs,
        );
  const regimeEffectiveSampleCount = selection?.regimeEstimate.effectiveSampleCount ?? 0;
  const globalEffectiveSampleCount = selection?.globalEstimate.effectiveSampleCount ?? 0;
  const ready = selection?.selected !== null && selection?.selected !== undefined;
  return Object.freeze({
    status: ready ? 'READY' : 'WARMING',
    currentRegime,
    freshObservationCount: fresh.length,
    regimeEffectiveSampleCount,
    globalEffectiveSampleCount,
    requiredEffectiveSampleCount: DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1,
    oldestObservationAt: fresh.at(0)?.timestamp ?? null,
    newestObservationAt: fresh.at(-1)?.timestamp ?? null,
    blocker: ready
      ? null
      : `ADVERSE_SELECTION_EVIDENCE_INSUFFICIENT:REGIME=${regimeEffectiveSampleCount}/${DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1}:GLOBAL=${globalEffectiveSampleCount}/${DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1}`,
  });
}

export function readDecibelProductionEconomicLkgReadinessV1(
  environment: NodeJS.ProcessEnv,
  now = Date.now(),
): Readonly<{ found: boolean; ready: boolean; blocker: string | null }> {
  const evidencePath = resolveDecibelProductionEconomicStorePathsV1(environment).evidencePath;
  const maximumAgeMs = Number(
    environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS ?? 3_600_000,
  );
  const found = existsSync(evidencePath);
  const components = readDecibelProductionEconomicComponentStatesV1(environment, now);
  const validation = validateDecibelProductionEconomicEvidenceV1(evidencePath, now, maximumAgeMs);
  return Object.freeze({
    found,
    ready:
      components.every((component) => !component.required || component.status === 'READY') &&
      validation.evidence !== null,
    blocker:
      components.find((component) => component.required && component.status !== 'READY')
        ?.component === undefined
        ? validation.evidence === null
          ? validation.reason
          : null
        : `${components.find((component) => component.required && component.status !== 'READY')!.component}_EVIDENCE_${components.find((component) => component.required && component.status !== 'READY')!.status}`,
  });
}

/**
 * Production cold start never invents an adverse-selection value. A complete,
 * still-fresh canonical snapshot is immediately reusable; otherwise quoting
 * remains blocked while the supervised collector accumulates evidence.
 */
export function resolveDecibelProductionEconomicColdStartV1(
  environment: NodeJS.ProcessEnv,
  now = Date.now(),
  RawStore?: decibel_raw_ws_bbo_store_v1,
): Readonly<{
  policy: 'VALIDATED_CACHE_REUSE' | 'FAIL_CLOSED_WARMUP';
  ready: boolean;
  blocker: string | null;
}> {
  hydrateDecibelProductionEconomicEvidenceV1(environment, now, RawStore);
  const readiness = readDecibelProductionEconomicLkgReadinessV1(environment, now);
  return Object.freeze({
    policy: readiness.ready ? 'VALIDATED_CACHE_REUSE' : 'FAIL_CLOSED_WARMUP',
    ready: readiness.ready,
    blocker: readiness.ready
      ? null
      : (readiness.blocker ?? 'PRODUCTION_ECONOMIC_VALIDATED_CACHE_REQUIRED'),
  });
}

const adverseSelectionEvidenceKeys = Object.freeze([
  'adverseSelectionBufferBps',
  'adverseSelectionSource',
  'adverseSelectionObservedAt',
  'adverseSelectionRegime',
  'adverseSelectionRawSampleCount',
  'adverseSelectionEffectiveSampleCount',
  'adverseSelectionRepresentative',
  'candidateAdverseSelection',
  'candidateAdverseSelectionObservedAt',
  'candidateAdverseSelectionMissingEvidence',
  'adverseSelectionHorizons',
  'adverseSelectionObservationCount',
  'adverseSelectionRawWsMessageCount',
  'adverseSelectionValidBboObservationCount',
  'adverseSelectionGlobalRawSampleCount',
  'adverseSelectionGlobalEffectiveSampleCount',
  'adverseSelectionGlobalP95Bps',
  'adverseSelectionRegimeBuckets',
] as const);

let EconomicComponentWriteSequence = 0;

function readEconomicDocument(path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function publishEconomicComponent(
  path: string,
  component: decibel_economic_component_name_v1,
  candidate: Readonly<Record<string, unknown>>,
  now: number,
  maximumAgeMs: number,
): boolean {
  const fields =
    component === 'MAKER_FEE'
      ? (['makerFeeBps', 'makerFeeSource', 'makerFeeObservedAt'] as const)
      : component === 'GAS_COST' || component === 'LIFECYCLE_COST'
        ? (['conservativeGasCostUsd', 'gasCostSource', 'gasCostObservedAt'] as const)
        : component === 'APT_USD'
          ? (['aptUsd', 'aptUsdSource', 'aptUsdObservedAt'] as const)
          : ([
              'adverseSelectionBufferBps',
              'adverseSelectionSource',
              'adverseSelectionObservedAt',
            ] as const);
  const [valueKey, sourceKey, timestampKey] = fields;
  const value = candidate[valueKey];
  const source = candidate[sourceKey];
  const observedAt = candidate[timestampKey];
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < (component === 'APT_USD' ? Number.EPSILON : 0) ||
    typeof source !== 'string' ||
    source.length === 0 ||
    typeof observedAt !== 'number' ||
    !Number.isSafeInteger(observedAt) ||
    observedAt > now ||
    now - observedAt > maximumAgeMs
  )
    return false;
  if (
    component === 'ADVERSE_SELECTION' &&
    (candidate.adverseSelectionRepresentative !== true ||
      typeof candidate.adverseSelectionRegime !== 'string' ||
      typeof candidate.adverseSelectionEffectiveSampleCount !== 'number' ||
      candidate.adverseSelectionEffectiveSampleCount <
        DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1)
  )
    return false;
  const current = readEconomicDocument(path);
  if (typeof current[timestampKey] === 'number' && current[timestampKey] > observedAt) return false;
  const updated: Record<string, unknown> = { ...current };
  if (typeof updated.observedAt !== 'number') updated.observedAt = observedAt;
  for (const key of fields) updated[key] = candidate[key];
  if (component === 'GAS_COST' || component === 'LIFECYCLE_COST') {
    for (const key of ['observedGasTxCount', 'medianGasApt', 'p95GasApt'])
      if (candidate[key] !== undefined) updated[key] = candidate[key];
  }
  if (component === 'ADVERSE_SELECTION')
    for (const key of adverseSelectionEvidenceKeys)
      if (candidate[key] !== undefined) updated[key] = candidate[key];
  const temporaryPath = `${path}.${process.pid}-${now}-${++EconomicComponentWriteSequence}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
  return true;
}

function publishCandidateEvidence(
  path: string,
  observations: Parameters<typeof buildDecibelCandidateAdverseSelectionEvidenceV1>[0],
  observedAt: number,
): void {
  const current = readEconomicDocument(path);
  if (
    typeof current.candidateAdverseSelectionObservedAt === 'number' &&
    current.candidateAdverseSelectionObservedAt > observedAt
  )
    return;
  const buckets = buildDecibelCandidateAdverseSelectionEvidenceV1(observations, observedAt);
  const updated = {
    ...current,
    candidateAdverseSelectionObservedAt: observedAt,
    candidateAdverseSelection: buckets.filter(
      (bucket) =>
        bucket.p95AdverseSelectionBps !== null &&
        bucket.sampleCount >= DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1,
    ),
    candidateAdverseSelectionMissingEvidence: buckets
      .filter(
        (bucket) =>
          bucket.p95AdverseSelectionBps === null ||
          bucket.sampleCount < DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1,
      )
      .map((bucket) => ({
        side: bucket.side,
        distanceBps: bucket.distanceBps,
        sampleCount: bucket.sampleCount,
        missingSampleCount: Math.max(
          0,
          DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1 - bucket.sampleCount,
        ),
      })),
  };
  const temporaryPath = `${path}.${process.pid}-${observedAt}-${++EconomicComponentWriteSequence}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

export function hydrateDecibelProductionEconomicEvidenceV1(
  environment: NodeJS.ProcessEnv,
  now = Date.now(),
  RawStore = hydrateDecibelProductionRawWsBboStoreV1(environment),
): readonly decibel_economic_component_state_v1[] {
  const paths = resolveDecibelProductionEconomicStorePathsV1(environment);
  const maximumAgeMs = Number(
    environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS ?? 3_600_000,
  );
  if (!Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0)
    throw new Error('PRODUCTION_ECONOMIC_HYDRATION_MAXIMUM_AGE_INVALID');
  const existingStates = readDecibelProductionEconomicComponentStatesV1(environment, now);

  const fresh = RawStore.readFresh(now, maximumAgeMs);
  const currentRegime = fresh.at(-1)?.regime;
  if (currentRegime === undefined) return existingStates;
  // Candidate markouts have their own observation clock. A fresh global P95
  // must not suppress them or be rolled backward to publish newer buckets.
  publishCandidateEvidence(paths.evidencePath, fresh, fresh.at(-1)!.timestamp);
  const selection = selectDecibelAdverseSelectionEstimateV1(
    fresh,
    currentRegime,
    now,
    DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1,
    maximumAgeMs,
  );
  const estimate = selection.selected;
  if (
    estimate === null ||
    !estimate.representative ||
    estimate.p95AdverseSelectionBps === null ||
    estimate.observedAt === null
  )
    return existingStates;
  publishEconomicComponent(
    paths.evidencePath,
    'ADVERSE_SELECTION',
    {
      adverseSelectionBufferBps: estimate.p95AdverseSelectionBps,
      adverseSelectionSource:
        selection.source === 'GLOBAL_FALLBACK' ? 'GLOBAL_FALLBACK' : estimate.estimator,
      adverseSelectionObservedAt: estimate.observedAt,
      adverseSelectionRegime: estimate.regime,
      adverseSelectionRawSampleCount: estimate.rawSampleCount,
      adverseSelectionEffectiveSampleCount: estimate.effectiveSampleCount,
      adverseSelectionRepresentative: true,
      adverseSelectionHorizons: estimate.horizons,
      adverseSelectionObservationCount: fresh.length,
      adverseSelectionGlobalRawSampleCount: selection.globalEstimate.rawSampleCount,
      adverseSelectionGlobalEffectiveSampleCount: selection.globalEstimate.effectiveSampleCount,
      adverseSelectionGlobalP95Bps: selection.globalEstimate.p95AdverseSelectionBps,
      adverseSelectionRegimeBuckets: ['QUIET', 'NORMAL', 'FAST'].map((regime) => {
        const bucket = calculateDecibelBlockAwareSyntheticBboMarkoutsV1(
          fresh,
          regime as 'QUIET' | 'NORMAL' | 'FAST',
          now,
          DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1,
          maximumAgeMs,
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
    },
    now,
    maximumAgeMs,
  );
  return readDecibelProductionEconomicComponentStatesV1(environment, now);
}

function publishGasP95Component(
  path: string,
  candidate: Readonly<Record<string, unknown>>,
  now: number,
): boolean {
  const p95GasApt = candidate.p95GasApt;
  const observedAt = candidate.gasP95ObservedAt ?? candidate.observedAt;
  if (
    typeof p95GasApt !== 'number' ||
    !Number.isFinite(p95GasApt) ||
    p95GasApt <= 0 ||
    typeof observedAt !== 'number' ||
    !Number.isSafeInteger(observedAt) ||
    observedAt > now
  )
    return false;
  const current = readEconomicDocument(path);
  const updated: Record<string, unknown> = {
    ...current,
    p95GasApt,
    gasP95ObservedAt: observedAt,
    gasP95Source:
      candidate.gasCostSource === 'BOOTSTRAP_CONSERVATIVE_PRIOR'
        ? 'BOOTSTRAP_CONSERVATIVE_PRIOR'
        : 'HISTORICAL_SUCCESSFUL_TX_P95',
  };
  for (const key of ['observedGasTxCount', 'medianGasApt'])
    if (candidate[key] !== undefined) updated[key] = candidate[key];
  const temporaryPath = `${path}.${process.pid}-${now}-${++EconomicComponentWriteSequence}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
  return true;
}

function publishDerivedGasCostComponent(path: string, now: number, maximumAgeMs: number): boolean {
  const current = readEconomicDocument(path);
  const p95GasApt = current.p95GasApt;
  const aptUsd = current.aptUsd;
  const gasObservedAt = current.gasP95ObservedAt;
  const aptObservedAt = current.aptUsdObservedAt;
  if (
    typeof p95GasApt !== 'number' ||
    !Number.isFinite(p95GasApt) ||
    p95GasApt <= 0 ||
    typeof aptUsd !== 'number' ||
    !Number.isFinite(aptUsd) ||
    aptUsd <= 0 ||
    typeof gasObservedAt !== 'number' ||
    !Number.isSafeInteger(gasObservedAt) ||
    typeof aptObservedAt !== 'number' ||
    !Number.isSafeInteger(aptObservedAt) ||
    now - gasObservedAt > maximumAgeMs ||
    now - aptObservedAt > maximumAgeMs
  )
    return false;
  return publishEconomicComponent(
    path,
    'GAS_COST',
    {
      conservativeGasCostUsd: p95GasApt * aptUsd,
      gasCostSource:
        current.gasP95Source === 'BOOTSTRAP_CONSERVATIVE_PRIOR'
          ? 'BOOTSTRAP_CONSERVATIVE_PRIOR'
          : 'HISTORICAL_SUCCESSFUL_TX_P95',
      gasCostObservedAt: Math.min(gasObservedAt, aptObservedAt),
      observedGasTxCount: current.observedGasTxCount,
      medianGasApt: current.medianGasApt,
      p95GasApt,
    },
    now,
    maximumAgeMs,
  );
}

export function preserveFreshDecibelAdverseSelectionEvidenceV1(
  prior: Readonly<Record<string, unknown>>,
  refreshed: Record<string, unknown>,
  now: number,
  maximumAgeMs: number,
  minimumRemainingAgeMs = 0,
): boolean {
  const buffer = prior.adverseSelectionBufferBps;
  const source = prior.adverseSelectionSource;
  const observedAt = prior.adverseSelectionObservedAt;
  if (
    typeof buffer !== 'number' ||
    !Number.isFinite(buffer) ||
    buffer < 0 ||
    typeof source !== 'string' ||
    source.length === 0 ||
    typeof observedAt !== 'number' ||
    !Number.isSafeInteger(observedAt) ||
    observedAt > now ||
    now - observedAt > maximumAgeMs - minimumRemainingAgeMs
  )
    return false;
  for (const key of adverseSelectionEvidenceKeys)
    if (prior[key] !== undefined) refreshed[key] = prior[key];
  return true;
}

export async function refreshDecibelProductionEconomicEvidenceV1(
  environment: NodeJS.ProcessEnv,
  dependencies: Readonly<{
    runInputsAudit?: economic_refresh_runner_v1;
    runViabilityAudit?: economic_refresh_runner_v1;
    rawWsBboStore?: decibel_raw_ws_bbo_store_v1;
    onLocalEvidence?: () => void;
  }> = {},
): Promise<
  Readonly<{
    aptUsd: number;
    aptUsdSource: string;
    aptUsdObservedAt: number;
    aptUsdAgeMs: number;
    aptUsdMaximumAgeMs: number;
  }>
> {
  const evidencePath = resolveDecibelProductionEconomicStorePathsV1(environment).evidencePath;
  const candidatePath = resolve(
    dirname(evidencePath),
    `.${process.pid}-${Date.now()}-economic-evidence.tmp`,
  );
  const candidateEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: candidatePath,
    DECIBEL_PRODUCTION_ECONOMIC_LAST_KNOWN_GOOD_PATH: evidencePath,
  };
  const maximumAgeMs = Number(
    environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS ?? 3_600_000,
  );
  if (!Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0)
    throw new Error('PRODUCTION_ECONOMIC_REFRESH_CANDIDATE_INVALID:MAXIMUM_AGE_INVALID');
  const RawStore =
    dependencies.rawWsBboStore ?? hydrateDecibelProductionRawWsBboStoreV1(environment);
  try {
    // Qualifying persisted market evidence does not depend on an unrelated
    // HTTP fee/gas refresh completing. The publication consumer still validates
    // every component's original provenance, age and economic schema.
    hydrateDecibelProductionEconomicEvidenceV1(environment, Date.now(), RawStore);
    dependencies.onLocalEvidence?.();
    writeFileSync(
      candidatePath,
      `${JSON.stringify(readEconomicDocument(evidencePath), null, 2)}\n`,
    );
    const inputAudit = await (
      dependencies.runInputsAudit ?? runDecibelProductionEconomicInputsAuditV1
    )(candidateEnvironment);
    const inputCandidate = {
      ...readEconomicDocument(candidatePath),
      ...inputAudit,
    };
    if (inputCandidate.gasCostSource === undefined)
      inputCandidate.gasCostSource = 'HISTORICAL_SUCCESSFUL_TX_P95';
    if (inputCandidate.gasCostObservedAt === undefined)
      inputCandidate.gasCostObservedAt = inputAudit.observedAt;
    const inputsObservedAt = Date.now();
    for (const component of ['MAKER_FEE', 'GAS_COST', 'APT_USD'] as const)
      publishEconomicComponent(
        evidencePath,
        component,
        inputCandidate,
        inputsObservedAt,
        maximumAgeMs,
      );
    publishGasP95Component(evidencePath, inputCandidate, inputsObservedAt);
    publishDerivedGasCostComponent(evidencePath, inputsObservedAt, maximumAgeMs);
    // Also include observations that arrived during the HTTP await. Reuse the
    // same incremental store; never reparse a second copy of historical BBOs.
    hydrateDecibelProductionEconomicEvidenceV1(environment, Date.now(), RawStore);
    const refreshObservedAt = Date.now();
    const configuredMarkoutDurationMs = Number(
      environment.DECIBEL_ECONOMIC_MARKOUT_DURATION_MS ?? 75_000,
    );
    const markoutDurationMs =
      Number.isSafeInteger(configuredMarkoutDurationMs) && configuredMarkoutDurationMs > 0
        ? configuredMarkoutDurationMs
        : 75_000;
    const adverseCollectionLeadMs = Math.min(markoutDurationMs, Math.floor(maximumAgeMs / 4));
    let adverseSelectionPreserved = false;
    if (existsSync(evidencePath)) {
      const prior = JSON.parse(readFileSync(evidencePath, 'utf8')) as Record<string, unknown>;
      const refreshed = JSON.parse(readFileSync(candidatePath, 'utf8')) as Record<string, unknown>;
      adverseSelectionPreserved = preserveFreshDecibelAdverseSelectionEvidenceV1(
        prior,
        refreshed,
        refreshObservedAt,
        maximumAgeMs,
        adverseCollectionLeadMs,
      );
      if (adverseSelectionPreserved)
        writeFileSync(candidatePath, `${JSON.stringify(refreshed, null, 2)}\n`, 'utf8');
    }
    if (!adverseSelectionPreserved && dependencies.runViabilityAudit !== undefined)
      await dependencies.runViabilityAudit(candidateEnvironment);
    const validatedAt = Date.now();
    const completedCandidate = readEconomicDocument(candidatePath);
    for (const component of ['MAKER_FEE', 'GAS_COST', 'APT_USD'] as const)
      publishEconomicComponent(
        evidencePath,
        component,
        completedCandidate,
        validatedAt,
        maximumAgeMs,
      );
    publishGasP95Component(evidencePath, completedCandidate, validatedAt);
    publishDerivedGasCostComponent(evidencePath, validatedAt, maximumAgeMs);
    publishEconomicComponent(
      evidencePath,
      'ADVERSE_SELECTION',
      completedCandidate,
      validatedAt,
      maximumAgeMs,
    );
    const validation = validateDecibelProductionEconomicEvidenceV1(
      evidencePath,
      validatedAt,
      maximumAgeMs,
    );
    if (validation.evidence === null) {
      const notReady = readDecibelProductionEconomicComponentStatesV1(
        environment,
        validatedAt,
      ).find((component) => component.required && component.status !== 'READY');
      throw new Error(
        `PRODUCTION_ECONOMIC_REFRESH_CANDIDATE_INVALID:${notReady === undefined ? validation.reason : `${notReady.component}_EVIDENCE_${notReady.status}`}`,
      );
    }
    const aptUsd = validation.evidence.aptUsd;
    const aptUsdObservedAt =
      validation.evidence.aptUsdObservedAt ?? validation.evidence.gasCostObservedAt;
    const aptUsdSource = validation.evidence.aptUsdSource;
    if (aptUsd === undefined || aptUsdObservedAt === undefined || aptUsdSource === undefined)
      throw new Error('PRODUCTION_ECONOMIC_REFRESH_CANDIDATE_INVALID:APT_USD_PROVENANCE_MISSING');
    return Object.freeze({
      aptUsd,
      aptUsdSource,
      aptUsdObservedAt,
      aptUsdAgeMs: validatedAt - aptUsdObservedAt,
      aptUsdMaximumAgeMs: maximumAgeMs,
    });
  } catch (error) {
    if (isDecibelHTTP429V1(error))
      enterDecibelHTTPReadBackoffV1(
        Number(environment.DECIBEL_PRODUCTION_RATE_LIMIT_BACKOFF_MS ?? 30_000),
      );
    throw error;
  } finally {
    if (existsSync(candidatePath)) unlinkSync(candidatePath);
  }
}

export async function bootstrapDecibelProductionEconomicEvidenceV1(
  environment: NodeJS.ProcessEnv,
  dependencies: Readonly<{
    runInputsAudit?: economic_refresh_runner_v1;
    runViabilityAudit?: economic_refresh_runner_v1;
    now?: () => number;
    rawWsBboStore?: decibel_raw_ws_bbo_store_v1;
  }> = {},
): Promise<decibel_economic_bootstrap_result_v1> {
  const evidencePath = resolveDecibelProductionEconomicStorePathsV1(environment).evidencePath;
  const maximumAgeMs = Number(
    environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS ?? 3_600_000,
  );
  const lastKnownGoodFound = existsSync(evidencePath);
  const validation = validateDecibelProductionEconomicEvidenceV1(
    evidencePath,
    (dependencies.now ?? Date.now)(),
    maximumAgeMs,
  );
  try {
    await refreshDecibelProductionEconomicEvidenceV1(environment, dependencies);
    const refreshedValidation = validateDecibelProductionEconomicEvidenceV1(
      evidencePath,
      (dependencies.now ?? Date.now)(),
      maximumAgeMs,
    );
    return Object.freeze({
      lastKnownGoodFound,
      lastKnownGoodReady: validation.evidence !== null,
      refreshTriggered: true,
      refreshResult: 'PASS',
      economicEvidenceReady: refreshedValidation.evidence !== null,
      blocker: null,
    });
  } catch (error) {
    // Local restoration may have succeeded before a remote refresh failed.
    // Revalidate now, rather than reuse readiness from before that await.
    const currentValidation = validateDecibelProductionEconomicEvidenceV1(
      evidencePath,
      (dependencies.now ?? Date.now)(),
      maximumAgeMs,
    );
    return Object.freeze({
      lastKnownGoodFound,
      lastKnownGoodReady: validation.evidence !== null,
      refreshTriggered: true,
      refreshResult: 'FAIL',
      economicEvidenceReady: currentValidation.evidence !== null,
      blocker: error instanceof Error ? error.message : 'UNKNOWN',
    });
  }
}
