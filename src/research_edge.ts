import { z } from 'zod';

import type {
  maker_fill_assumption,
  maker_simulation_result,
} from './maker_execution_simulator.js';
import { RESEARCH_FEATURE_VERSION, type research_feature_window } from './research_dataset.js';
import type { research_sample } from './research_types.js';

export const RESEARCH_EDGE_ANALYZER_VERSION = 'BTC_RESEARCH_EDGE_V1';
export const RESEARCH_EDGE_FEATURE_WINDOW_SECONDS = 60;
const FORWARD_OUTCOME_MINUTES = 60;
const HYPOTHESES = [
  'SIGNED_VOLUME_AGREEMENT',
  'BOOK_IMBALANCE_AGREEMENT',
  'IMBALANCE_CHANGE_AGREEMENT',
  'LOW_SPREAD',
  'HIGH_BOOK_DEPTH',
  'HIGH_TRADE_INTENSITY',
  'COMBINED_CONFIRMATION',
] as const;
export type research_hypothesis = 'BASELINE' | (typeof HYPOTHESES)[number];

const EnvironmentSchema = z.object({
  RESEARCH_EDGE_MINIMUM_TRAINING_SAMPLES: z.coerce.number().int().min(25).max(10_000).default(100),
  RESEARCH_EDGE_TEST_BLOCK_SIZE: z.coerce.number().int().min(1).max(1_000).default(25),
  RESEARCH_EDGE_EMBARGO_MINUTES: z.coerce.number().int().min(0).max(1_440).default(60),
});
export type research_edge_config = {
  minimumTrainingSamples: number;
  testBlockSize: number;
  embargoMinutes: number;
  featureWindowSeconds: 60;
  bootstrapIterations: number;
  bootstrapSeed: number;
};
export function loadResearchEdgeConfig(
  environment: Record<string, string | undefined> = process.env,
): research_edge_config {
  const value = EnvironmentSchema.parse(environment);
  return {
    minimumTrainingSamples: value.RESEARCH_EDGE_MINIMUM_TRAINING_SAMPLES,
    testBlockSize: value.RESEARCH_EDGE_TEST_BLOCK_SIZE,
    embargoMinutes: value.RESEARCH_EDGE_EMBARGO_MINUTES,
    featureWindowSeconds: RESEARCH_EDGE_FEATURE_WINDOW_SECONDS,
    bootstrapIterations: 1_000,
    bootstrapSeed: 20_260_805,
  };
}

export type edge_candidate = {
  sample: research_sample;
  decisionTimeMs: number;
  outcomeEndTimeMs: number;
  feature: research_feature_window;
  makers: Partial<Record<maker_fill_assumption, maker_simulation_result>>;
};
export type walk_forward_fold = {
  training: edge_candidate[];
  test: edge_candidate[];
  testStartTimeMs: number;
};

export function buildChronologicalSplits(
  candidates: readonly edge_candidate[],
  config: research_edge_config,
): walk_forward_fold[] {
  const ordered = [...candidates].sort(
    (left, right) =>
      left.decisionTimeMs - right.decisionTimeMs ||
      left.sample.candidateId.localeCompare(right.sample.candidateId),
  );
  const folds: walk_forward_fold[] = [];
  for (
    let testStartIndex = config.minimumTrainingSamples;
    testStartIndex < ordered.length;
    testStartIndex += config.testBlockSize
  ) {
    const test = ordered.slice(testStartIndex, testStartIndex + config.testBlockSize);
    const firstTest = test[0];
    if (firstTest === undefined) continue;
    const trainingCutoff = firstTest.decisionTimeMs - config.embargoMinutes * 60_000;
    const training = ordered
      .slice(0, testStartIndex)
      .filter((candidate) => candidate.outcomeEndTimeMs <= trainingCutoff);
    if (training.length < config.minimumTrainingSamples) continue;
    folds.push({ training, test, testStartTimeMs: firstTest.decisionTimeMs });
  }
  return folds;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}
function directionAgrees(direction: 'LONG' | 'SHORT', value: number | null): boolean {
  return value !== null && value !== 0 && (direction === 'LONG' ? value > 0 : value < 0);
}
export type research_training_thresholds = {
  spread: number;
  depth: number;
  tradeIntensity: number;
};
export function calculateTrainingThresholds(
  training: readonly edge_candidate[],
): research_training_thresholds | null {
  const spreads = training.flatMap((candidate) => {
    const value = candidate.feature.spreadBasisPoints.median;
    return value === null ? [] : [value];
  });
  const depths = training.flatMap((candidate) => {
    const value = candidate.feature.depth.meanCombined;
    return value === null ? [] : [value];
  });
  const intensities = training.map((candidate) => candidate.feature.tradeIntensity);
  const spread = median(spreads),
    depth = median(depths),
    tradeIntensity = median(intensities);
  return spread === null || depth === null || tradeIntensity === null
    ? null
    : { spread, depth, tradeIntensity };
}

export function matchesResearchHypothesis(
  candidate: edge_candidate,
  hypothesis: research_hypothesis,
  values: research_training_thresholds,
): boolean {
  if (hypothesis === 'BASELINE') return true;
  const direction = candidate.sample.candidate.direction;
  const signedVolume = directionAgrees(direction, candidate.feature.signedVolumeImbalance);
  const book = directionAgrees(direction, candidate.feature.imbalance.final);
  const change = directionAgrees(direction, candidate.feature.imbalance.change);
  const spread = candidate.feature.spreadBasisPoints.median;
  const depth = candidate.feature.depth.meanCombined;
  if (hypothesis === 'SIGNED_VOLUME_AGREEMENT') return signedVolume;
  if (hypothesis === 'BOOK_IMBALANCE_AGREEMENT') return book;
  if (hypothesis === 'IMBALANCE_CHANGE_AGREEMENT') return change;
  if (hypothesis === 'LOW_SPREAD') return spread !== null && spread <= values.spread;
  if (hypothesis === 'HIGH_BOOK_DEPTH') return depth !== null && depth >= values.depth;
  if (hypothesis === 'HIGH_TRADE_INTENSITY')
    return candidate.feature.tradeIntensity >= values.tradeIntensity;
  return signedVolume && book && spread !== null && spread <= values.spread;
}

export function joinResearchEdgeInputs(
  samples: readonly research_sample[],
  simulations: readonly maker_simulation_result[],
): { candidates: edge_candidate[]; exclusions: Record<string, number> } {
  const exclusions: Record<string, number> = {};
  const exclude = (reason: string): void => {
    exclusions[reason] = (exclusions[reason] ?? 0) + 1;
  };
  const simulationsByCandidate = new Map<
    string,
    Partial<Record<maker_fill_assumption, maker_simulation_result>>
  >();
  for (const simulation of simulations) {
    if (simulation.simulatorVersion === '') continue;
    const key = `${simulation.marketAddress}:${simulation.featureVersion}:${simulation.candidateId}`;
    const existing = simulationsByCandidate.get(key) ?? {};
    const current = existing[simulation.fillAssumption];
    if (current === undefined || current.simulatorVersion < simulation.simulatorVersion)
      existing[simulation.fillAssumption] = simulation;
    simulationsByCandidate.set(key, existing);
  }
  const candidates: edge_candidate[] = [];
  for (const sample of samples) {
    if (sample.featureVersion !== RESEARCH_FEATURE_VERSION) {
      exclude('INCOMPATIBLE_FEATURE_OR_COLLECTOR_SESSION_VERSION');
      continue;
    }
    const features = ['15', '60', '300'].map((window) => sample.features[window]);
    if (features.some((feature) => feature?.status !== 'VALID')) {
      exclude('INVALID_FEATURE_WINDOW');
      continue;
    }
    if (!sample.outcomes.complete) {
      exclude('INCOMPLETE_FORWARD_OUTCOMES');
      continue;
    }
    const feature = sample.features[String(RESEARCH_EDGE_FEATURE_WINDOW_SECONDS)];
    if (feature === undefined) {
      exclude('MISSING_HYPOTHESIS_FEATURES');
      continue;
    }
    const key = `${sample.marketAddress}:${sample.featureVersion}:${sample.candidateId}`;
    const makers = simulationsByCandidate.get(key) ?? {};
    for (const assumption of Object.keys(makers) as maker_fill_assumption[]) {
      const maker = makers[assumption];
      if (maker?.decisionTime !== sample.candidate.availableAtTime) {
        delete makers[assumption];
        exclude('MAKER_DECISION_TIME_MISMATCH');
      }
    }
    if (makers.STRICT_TRADE_THROUGH === undefined) exclude('MISSING_STRICT_TRADE_THROUGH_RESULT');
    if (makers.TOUCH_WITH_FLOW === undefined) exclude('MISSING_TOUCH_WITH_FLOW_RESULT');
    const decisionTimeMs = Date.parse(sample.candidate.availableAtTime);
    candidates.push({
      sample,
      decisionTimeMs,
      outcomeEndTimeMs: decisionTimeMs + FORWARD_OUTCOME_MINUTES * 60_000,
      feature,
      makers,
    });
  }
  return {
    candidates: candidates.sort(
      (left, right) =>
        left.decisionTimeMs - right.decisionTimeMs ||
        left.sample.candidateId.localeCompare(right.sample.candidateId),
    ),
    exclusions,
  };
}

function getOutcome(candidate: edge_candidate, horizonMinutes: number): number | null {
  return (
    candidate.sample.outcomes.points.find((point) => point?.horizonMinutes === horizonMinutes)
      ?.directionAdjustedReturn ?? null
  );
}
function getMakerMarkout(
  candidate: edge_candidate,
  assumption: maker_fill_assumption,
  seconds: number,
): number | null {
  return candidate.makers[assumption]?.markouts[String(seconds)]?.directionAdjustedReturn ?? null;
}
function getNetReturnAfterEntryFee(
  candidate: edge_candidate,
  assumption: maker_fill_assumption,
): number | null {
  const outcome = getOutcome(candidate, 60);
  const order = candidate.makers[assumption];
  if (outcome === null || order === undefined) return null;
  const filledNotional =
    order.averageFillPrice === null ? 0 : order.averageFillPrice * order.filledQuantity;
  const feeReturn = filledNotional === 0 ? 0 : order.makerFees / filledNotional;
  return outcome - feeReturn;
}
function maximumDrawdown(values: readonly number[]): number {
  let equity = 1,
    peak = 1,
    drawdown = 0;
  for (const value of values) {
    equity *= 1 + value;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak === 0 ? 0 : (peak - equity) / peak);
  }
  return drawdown;
}
function summarizeCandidates(
  candidates: readonly edge_candidate[],
  assumption: maker_fill_assumption,
) {
  const orders = candidates.flatMap((candidate) => {
    const order = candidate.makers[assumption];
    return order === undefined ? [] : [order];
  });
  const eligible = orders.filter(
    (order) => order.state !== 'REJECTED_POST_ONLY' && order.state !== 'REJECTED_TOO_SMALL',
  );
  const outcomeReturns = Object.fromEntries(
    [5, 15, 30, 60].map((horizon) => {
      const values = candidates.flatMap((candidate) => {
        const value = getOutcome(candidate, horizon);
        return value === null ? [] : [value];
      });
      return [
        horizon,
        { average: mean(values), median: median(values), sampleCount: values.length },
      ];
    }),
  );
  const markouts = Object.fromEntries(
    [5, 15, 30, 60].map((seconds) => {
      const values = candidates.flatMap((candidate) => {
        const value = getMakerMarkout(candidate, assumption, seconds);
        return value === null ? [] : [value];
      });
      return [
        seconds,
        { average: mean(values), median: median(values), sampleCount: values.length },
      ];
    }),
  );
  const netReturns = candidates.flatMap((candidate) => {
    const value = getNetReturnAfterEntryFee(candidate, assumption);
    return value === null ? [] : [value];
  });
  const wins = netReturns.filter((value) => value > 0);
  const losses = netReturns.filter((value) => value < 0);
  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = -losses.reduce((sum, value) => sum + value, 0);
  const grouped = (key: 'direction' | 'candidateType' | 'regime') =>
    Object.fromEntries(
      [...new Set(candidates.map((candidate) => candidate.sample.candidate[key]))]
        .sort()
        .map((value) => {
          const groupCandidates = candidates.filter(
            (candidate) => candidate.sample.candidate[key] === value,
          );
          const groupOrders = groupCandidates.flatMap((candidate) => {
            const order = candidate.makers[assumption];
            return order === undefined ? [] : [order];
          });
          const groupEligible = groupOrders.filter(
            (order) => order.state !== 'REJECTED_POST_ONLY' && order.state !== 'REJECTED_TOO_SMALL',
          );
          return [
            value,
            {
              candidateCount: groupCandidates.length,
              eligibleMakerOrderCount: groupEligible.length,
              fullFillRate:
                groupEligible.length === 0
                  ? 0
                  : groupEligible.filter((order) => order.state === 'FILLED').length /
                    groupEligible.length,
              partialFillRate:
                groupEligible.length === 0
                  ? 0
                  : groupEligible.filter(
                      (order) => order.filledQuantity > 0 && order.remainingQuantity > 0,
                    ).length / groupEligible.length,
              noFillRate:
                groupEligible.length === 0
                  ? 0
                  : groupEligible.filter((order) => order.filledQuantity === 0).length /
                    groupEligible.length,
              average60MinuteReturn: mean(
                groupCandidates.flatMap((candidate) => {
                  const result = getOutcome(candidate, 60);
                  return result === null ? [] : [result];
                }),
              ),
              average60SecondMakerMarkout: mean(
                groupCandidates.flatMap((candidate) => {
                  const result = getMakerMarkout(candidate, assumption, 60);
                  return result === null ? [] : [result];
                }),
              ),
            },
          ];
        }),
    );
  return {
    candidateCount: candidates.length,
    eligibleMakerOrderCount: eligible.length,
    fullFillRate:
      eligible.length === 0
        ? 0
        : eligible.filter((order) => order.state === 'FILLED').length / eligible.length,
    partialFillRate:
      eligible.length === 0
        ? 0
        : eligible.filter((order) => order.filledQuantity > 0 && order.remainingQuantity > 0)
            .length / eligible.length,
    noFillRate:
      eligible.length === 0
        ? 0
        : eligible.filter((order) => order.filledQuantity === 0).length / eligible.length,
    directionAdjustedReturns: outcomeReturns,
    averageMFE: mean(
      candidates.flatMap((candidate) => candidate.sample.outcomes.maximumFavorableExcursion ?? []),
    ),
    averageMAE: mean(
      candidates.flatMap((candidate) => candidate.sample.outcomes.maximumAdverseExcursion ?? []),
    ),
    directionAdjustedMakerMarkouts: markouts,
    makerFees: {
      total: orders.reduce((sum, order) => sum + order.makerFees, 0),
      average: mean(orders.map((order) => order.makerFees)),
    },
    expectancyAfterEntryFee: mean(netReturns),
    winRate: netReturns.length === 0 ? null : wins.length / netReturns.length,
    profitFactor: grossLoss === 0 ? null : grossProfit / grossLoss,
    maximumDrawdown: maximumDrawdown(netReturns),
    breakdowns: {
      longShort: grouped('direction'),
      candidateType: grouped('candidateType'),
      regime: grouped('regime'),
    },
  };
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}
function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? null;
}
export function blockBootstrapConfidenceInterval(
  clusters: readonly (readonly number[])[],
  iterations: number,
  seed: number,
): { lower: number | null; upper: number | null; estimate: number | null } {
  const observed = clusters.flat();
  if (observed.length === 0 || clusters.length === 0)
    return { lower: null, upper: null, estimate: null };
  const random = createSeededRandom(seed);
  const estimates: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const values: number[] = [];
    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[Math.floor(random() * clusters.length)];
      if (cluster !== undefined) values.push(...cluster);
    }
    const value = mean(values);
    if (value !== null) estimates.push(value);
  }
  return {
    lower: percentile(estimates, 0.025),
    upper: percentile(estimates, 0.975),
    estimate: mean(observed),
  };
}

export function blockBootstrapEffect(
  selectedClusters: readonly (readonly number[])[],
  baselineClusters: readonly (readonly number[])[],
  iterations: number,
  seed: number,
): { lower: number | null; upper: number | null; estimate: number | null; pValue: number | null } {
  const selected = selectedClusters.flat();
  const baseline = baselineClusters.flat();
  const selectedMean = mean(selected);
  const baselineMean = mean(baseline);
  if (selectedMean === null || baselineMean === null)
    return { lower: null, upper: null, estimate: null, pValue: null };
  const random = createSeededRandom(seed);
  const effects: number[] = [];
  const resample = (clusters: readonly (readonly number[])[]): number[] => {
    const values: number[] = [];
    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[Math.floor(random() * clusters.length)];
      if (cluster !== undefined) values.push(...cluster);
    }
    return values;
  };
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const selectedEstimate = mean(resample(selectedClusters));
    const baselineEstimate = mean(resample(baselineClusters));
    if (selectedEstimate !== null && baselineEstimate !== null)
      effects.push(selectedEstimate - baselineEstimate);
  }
  const nonPositive = effects.filter((value) => value <= 0).length / effects.length;
  const nonNegative = effects.filter((value) => value >= 0).length / effects.length;
  return {
    lower: percentile(effects, 0.025),
    upper: percentile(effects, 0.975),
    estimate: selectedMean - baselineMean,
    pValue: Math.min(1, 2 * Math.min(nonPositive, nonNegative)),
  };
}

export function adjustBenjaminiHochberg(pValues: readonly number[]): number[] {
  const ranked = pValues
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const adjusted = Array<number>(pValues.length).fill(1);
  let next = 1;
  for (let index = ranked.length - 1; index >= 0; index -= 1) {
    const item = ranked[index];
    if (item === undefined) continue;
    next = Math.min(next, (item.value * ranked.length) / (index + 1));
    adjusted[item.index] = next;
  }
  return adjusted;
}

function buildClusters(candidates: readonly edge_candidate[]): edge_candidate[][] {
  const clusters: edge_candidate[][] = [];
  for (const candidate of candidates) {
    const current = clusters.at(-1);
    if (
      current === undefined ||
      candidate.decisionTimeMs - (current[0]?.decisionTimeMs ?? 0) >= 60 * 60_000
    )
      clusters.push([candidate]);
    else current.push(candidate);
  }
  return clusters;
}

export function analyzeResearchEdge(
  samples: readonly research_sample[],
  simulations: readonly maker_simulation_result[],
  config: research_edge_config,
  researchCutoffTime: string | null,
) {
  const joined = joinResearchEdgeInputs(samples, simulations);
  const clusters = buildClusters(joined.candidates);
  const folds = buildChronologicalSplits(joined.candidates, config);
  if (joined.candidates.length < 100 || folds.length === 0)
    return {
      status: 'NOT_ENOUGH_DATA' as const,
      analyzerVersion: RESEARCH_EDGE_ANALYZER_VERSION,
      featureVersion: samples[0]?.featureVersion ?? null,
      simulatorVersions: [
        ...new Set(simulations.map((simulation) => simulation.simulatorVersion)),
      ].sort(),
      researchCutoffTime,
      configuration: config,
      eligibleCandidateCount: joined.candidates.length,
      candidateClusterCount: clusters.length,
      overlappingClusterCount: clusters.filter((cluster) => cluster.length > 1).length,
      exclusions: joined.exclusions,
      hypotheses: {},
      statement:
        'No recommendation is produced because the eligible walk-forward sample is insufficient.',
    };
  const selected = new Map<research_hypothesis, edge_candidate[]>();
  const foldAudit: Array<{
    trainingCount: number;
    testCount: number;
    trainingLastDecisionTime: string | null;
    testStartTime: string;
    thresholds: research_training_thresholds;
  }> = [];
  selected.set('BASELINE', []);
  for (const hypothesis of HYPOTHESES) selected.set(hypothesis, []);
  for (const fold of folds) {
    const values = calculateTrainingThresholds(fold.training);
    if (values === null) continue;
    foldAudit.push({
      trainingCount: fold.training.length,
      testCount: fold.test.length,
      trainingLastDecisionTime:
        fold.training.length === 0
          ? null
          : new Date(fold.training.at(-1)?.decisionTimeMs ?? 0).toISOString(),
      testStartTime: new Date(fold.testStartTimeMs).toISOString(),
      thresholds: values,
    });
    selected.get('BASELINE')?.push(...fold.test);
    for (const hypothesis of HYPOTHESES)
      selected
        .get(hypothesis)
        ?.push(
          ...fold.test.filter((candidate) =>
            matchesResearchHypothesis(candidate, hypothesis, values),
          ),
        );
  }
  const baseline = selected.get('BASELINE') ?? [];
  const baselineClusters = buildClusters(baseline).map((cluster) =>
    cluster.flatMap((candidate) => getOutcome(candidate, 60) ?? []),
  );
  const pValues: number[] = [];
  const preliminary = HYPOTHESES.map((hypothesis, index) => {
    const candidates = selected.get(hypothesis) ?? [];
    const valueClusters = buildClusters(candidates).map((cluster) =>
      cluster.flatMap((candidate) => getOutcome(candidate, 60) ?? []),
    );
    const interval = blockBootstrapConfidenceInterval(
      valueClusters,
      config.bootstrapIterations,
      config.bootstrapSeed + index,
    );
    const effect = blockBootstrapEffect(
      valueClusters,
      baselineClusters,
      config.bootstrapIterations,
      config.bootstrapSeed + 10_000 + index,
    );
    const pValue = effect.pValue ?? 1;
    pValues.push(pValue);
    return { hypothesis, candidates, interval, effect, pValue };
  });
  const adjusted = adjustBenjaminiHochberg(pValues);
  const hypotheses = Object.fromEntries(
    ['BASELINE' as const, ...HYPOTHESES].map((hypothesis) => {
      const candidates = selected.get(hypothesis) ?? [];
      const evidence = preliminary.find((item) => item.hypothesis === hypothesis);
      const assumptionReports = Object.fromEntries(
        (['STRICT_TRADE_THROUGH', 'TOUCH_WITH_FLOW'] as const).map((assumption) => {
          const report = summarizeCandidates(candidates, assumption);
          const expectancyAfterEntryFeeConfidenceInterval = blockBootstrapConfidenceInterval(
            buildClusters(candidates).map((cluster) =>
              cluster.flatMap((candidate) => {
                const value = getNetReturnAfterEntryFee(candidate, assumption);
                return value === null ? [] : [value];
              }),
            ),
            config.bootstrapIterations,
            config.bootstrapSeed + (assumption === 'TOUCH_WITH_FLOW' ? 2_000 : 1_000),
          );
          const markoutConfidenceIntervals = Object.fromEntries(
            [5, 15, 30, 60].map((seconds) => [
              seconds,
              blockBootstrapConfidenceInterval(
                buildClusters(candidates).map((cluster) =>
                  cluster.flatMap(
                    (candidate) => getMakerMarkout(candidate, assumption, seconds) ?? [],
                  ),
                ),
                config.bootstrapIterations,
                config.bootstrapSeed + seconds + (assumption === 'TOUCH_WITH_FLOW' ? 1_000 : 0),
              ),
            ]),
          );
          return [
            assumption,
            { ...report, expectancyAfterEntryFeeConfidenceInterval, markoutConfidenceIntervals },
          ];
        }),
      );
      return [
        hypothesis,
        {
          candidateCount: candidates.length,
          assumptions: assumptionReports,
          expectancyConfidenceInterval: evidence?.interval ?? null,
          effectSizeVersusBaseline: evidence?.effect.estimate ?? null,
          effectConfidenceInterval:
            evidence === undefined
              ? null
              : { lower: evidence.effect.lower, upper: evidence.effect.upper },
          rawPValue: evidence?.pValue ?? null,
          falseDiscoveryRate:
            evidence === undefined ? null : adjusted[HYPOTHESES.indexOf(evidence.hypothesis)],
          evidence:
            evidence !== undefined &&
            (adjusted[HYPOTHESES.indexOf(evidence.hypothesis)] ?? 1) <= 0.05 &&
            evidence.interval.lower !== null &&
            evidence.interval.lower > 0
              ? 'STATISTICALLY_SUPPORTED'
              : 'EXPLORATORY',
        },
      ];
    }),
  );
  const supported = Object.values(hypotheses).some(
    (value) => value.evidence === 'STATISTICALLY_SUPPORTED',
  );
  const rejected = preliminary.every((value) => (value.effect.estimate ?? 0) <= 0);
  return {
    status: supported
      ? ('SUPPORTED' as const)
      : rejected
        ? ('REJECTED' as const)
        : ('EXPLORATORY' as const),
    analyzerVersion: RESEARCH_EDGE_ANALYZER_VERSION,
    datasetVersion: 'RESEARCH_SQLITE_V3',
    featureVersion: samples[0]?.featureVersion ?? null,
    simulatorVersions: [
      ...new Set(simulations.map((simulation) => simulation.simulatorVersion)),
    ].sort(),
    researchCutoffTime,
    configuration: config,
    eligibleCandidateCount: joined.candidates.length,
    outOfSampleCandidateCount: baseline.length,
    candidateClusterCount: clusters.length,
    overlappingClusterCount: clusters.filter((cluster) => cluster.length > 1).length,
    foldCount: folds.length,
    walkForwardFolds: foldAudit,
    exclusions: joined.exclusions,
    hypotheses,
    statement:
      'Research evidence only. No automatic live-trading recommendation is produced, and profitability is not claimed when confidence intervals include zero.',
  };
}
