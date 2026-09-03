import { createHash } from 'node:crypto';

export const DECIBEL_SHADOW_REPRICE_TICK_SIZE_V1 = 0.1;

export type shadow_reprice_policy_name_v1 =
  | 'IMMEDIATE_1_TICK'
  | 'MIN_LIFETIME_3000MS_1_TICK'
  | 'MIN_LIFETIME_5000MS_1_TICK'
  | 'MIN_LIFETIME_10000MS_1_TICK'
  | 'IMMEDIATE_2_TICKS'
  | 'IMMEDIATE_3_TICKS'
  | 'MIN_LIFETIME_3000MS_2_TICKS'
  | 'MIN_LIFETIME_5000MS_2_TICKS'
  | 'MIN_LIFETIME_5000MS_3_TICKS';

export type shadow_reprice_observation_v1 = Readonly<{
  timestamp: number;
  bestBid: number;
  bestAsk: number;
  desiredSide: 'buy' | 'sell';
  desiredPrice: number;
  desiredQuantity: number;
}>;

export type shadow_reprice_policy_v1 = Readonly<{
  name: shadow_reprice_policy_name_v1;
  minimumLifetimeMs: number;
  minimumDifferenceTicks: number;
}>;

export const DECIBEL_SHADOW_REPRICE_POLICIES_V1: readonly shadow_reprice_policy_v1[] =
  Object.freeze([
    { name: 'IMMEDIATE_1_TICK', minimumLifetimeMs: 0, minimumDifferenceTicks: 1 },
    { name: 'MIN_LIFETIME_3000MS_1_TICK', minimumLifetimeMs: 3_000, minimumDifferenceTicks: 1 },
    { name: 'MIN_LIFETIME_5000MS_1_TICK', minimumLifetimeMs: 5_000, minimumDifferenceTicks: 1 },
    {
      name: 'MIN_LIFETIME_10000MS_1_TICK',
      minimumLifetimeMs: 10_000,
      minimumDifferenceTicks: 1,
    },
    { name: 'IMMEDIATE_2_TICKS', minimumLifetimeMs: 0, minimumDifferenceTicks: 2 },
    { name: 'IMMEDIATE_3_TICKS', minimumLifetimeMs: 0, minimumDifferenceTicks: 3 },
    { name: 'MIN_LIFETIME_3000MS_2_TICKS', minimumLifetimeMs: 3_000, minimumDifferenceTicks: 2 },
    { name: 'MIN_LIFETIME_5000MS_2_TICKS', minimumLifetimeMs: 5_000, minimumDifferenceTicks: 2 },
    { name: 'MIN_LIFETIME_5000MS_3_TICKS', minimumLifetimeMs: 5_000, minimumDifferenceTicks: 3 },
  ]);

export function priceToTicksV1(price: number, tickSize: number): number {
  if (!(price > 0) || !(tickSize > 0)) throw new Error('REPRICE_PRICE_OR_TICK_INVALID');
  const ticks = Math.round(price / tickSize);
  if (Math.abs(ticks * tickSize - price) > tickSize * 1e-6)
    throw new Error('REPRICE_PRICE_NOT_TICK_ALIGNED');
  return ticks;
}

function percentile(values: readonly number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)]!;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export function parseShadowRepriceSourceJsonlV1(
  text: string,
): readonly shadow_reprice_observation_v1[] {
  const lines = text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  return Object.freeze(
    lines.map((line, index) => {
      const value: unknown = JSON.parse(line);
      if (typeof value !== 'object' || value === null)
        throw new Error(`REPRICE_SOURCE_INVALID:${index}`);
      const row = value as Record<string, unknown>;
      if (
        !Number.isFinite(row.timestamp) ||
        !Number.isFinite(row.bestBid) ||
        !Number.isFinite(row.bestAsk) ||
        (row.desiredSide !== 'buy' && row.desiredSide !== 'sell') ||
        !Number.isFinite(row.desiredPrice) ||
        !Number.isFinite(row.desiredQuantity)
      )
        throw new Error(`REPRICE_SOURCE_INVALID:${index}`);
      return Object.freeze({
        timestamp: row.timestamp as number,
        bestBid: row.bestBid as number,
        bestAsk: row.bestAsk as number,
        desiredSide: row.desiredSide,
        desiredPrice: row.desiredPrice as number,
        desiredQuantity: row.desiredQuantity as number,
      });
    }),
  );
}

export function replayShadowRepricePolicyV1(input: {
  observations: readonly shadow_reprice_observation_v1[];
  policy: shadow_reprice_policy_v1;
  tickSize: number;
}) {
  let resting: {
    side: 'buy' | 'sell';
    priceTicks: number;
    quantity: number;
    createdAt: number;
  } | null = null;
  let places = 0;
  let replacements = 0;
  let holds = 0;
  let atExact = 0;
  let moreAggressive = 0;
  let lessAggressive = 0;
  let atBest = 0;
  let insideSpread = 0;
  let behindBest = 0;
  let crossing = 0;
  const differences: number[] = [];
  const staleAges: number[] = [];
  const lifetimes: number[] = [];
  for (const observation of input.observations) {
    const desiredTicks = priceToTicksV1(observation.desiredPrice, input.tickSize);
    if (resting === null) {
      resting = {
        side: observation.desiredSide,
        priceTicks: desiredTicks,
        quantity: observation.desiredQuantity,
        createdAt: observation.timestamp,
      };
      places += 1;
    } else {
      const difference = Math.abs(desiredTicks - resting.priceTicks);
      const changedSemantics =
        resting.side !== observation.desiredSide ||
        resting.quantity !== observation.desiredQuantity;
      const oldEnough = observation.timestamp - resting.createdAt >= input.policy.minimumLifetimeMs;
      if ((changedSemantics || difference >= input.policy.minimumDifferenceTicks) && oldEnough) {
        lifetimes.push(observation.timestamp - resting.createdAt);
        resting = {
          side: observation.desiredSide,
          priceTicks: desiredTicks,
          quantity: observation.desiredQuantity,
          createdAt: observation.timestamp,
        };
        replacements += 1;
      } else {
        holds += 1;
      }
    }
    const absoluteDifferenceTicks = Math.abs(desiredTicks - resting.priceTicks);
    differences.push(absoluteDifferenceTicks);
    if (absoluteDifferenceTicks === 0) atExact += 1;
    else {
      staleAges.push(observation.timestamp - resting.createdAt);
      const aggressive =
        resting.side === 'buy'
          ? resting.priceTicks > desiredTicks
          : resting.priceTicks < desiredTicks;
      if (aggressive) moreAggressive += 1;
      else lessAggressive += 1;
    }
    const bidTicks = priceToTicksV1(observation.bestBid, input.tickSize);
    const askTicks = priceToTicksV1(observation.bestAsk, input.tickSize);
    if (resting.side === 'buy') {
      if (resting.priceTicks >= askTicks) crossing += 1;
      else if (resting.priceTicks > bidTicks) insideSpread += 1;
      else if (resting.priceTicks === bidTicks) atBest += 1;
      else behindBest += 1;
    } else if (resting.priceTicks <= bidTicks) crossing += 1;
    else if (resting.priceTicks < askTicks) insideSpread += 1;
    else if (resting.priceTicks === askTicks) atBest += 1;
    else behindBest += 1;
  }
  const durationMs =
    input.observations.length < 2
      ? 0
      : input.observations.at(-1)!.timestamp - input.observations[0]!.timestamp;
  const totalMutationCalls = places + replacements * 2;
  const perMinute = durationMs === 0 ? 0 : 60_000 / durationMs;
  const count = input.observations.length;
  const offDesired = count - atExact;
  return Object.freeze({
    policy: input.policy.name,
    minimumLifetimeMs: input.policy.minimumLifetimeMs,
    minimumDifferenceTicks: input.policy.minimumDifferenceTicks,
    wouldPlaceCount: places,
    wouldCancelCount: replacements,
    wouldReplaceCount: replacements,
    holdCount: holds,
    totalHypotheticalMutationCalls: totalMutationCalls,
    replacementsPerMinute: replacements * perMinute,
    mutationCallsPerMinute: totalMutationCalls * perMinute,
    averageShadowLifetimeMs:
      lifetimes.length === 0
        ? 0
        : lifetimes.reduce((sum, value) => sum + value, 0) / lifetimes.length,
    medianShadowLifetimeMs: median(lifetimes),
    evaluationsAtExactDesiredPrice: atExact,
    exactDesiredPriceCoveragePct: count === 0 ? 0 : (atExact / count) * 100,
    evaluationsOffDesiredPrice: offDesired,
    offDesiredPricePct: count === 0 ? 0 : (offDesired / count) * 100,
    meanAbsoluteDifferenceTicks:
      count === 0 ? 0 : differences.reduce((sum, value) => sum + value, 0) / count,
    medianAbsoluteDifferenceTicks: median(differences),
    p95AbsoluteDifferenceTicks: percentile(differences, 0.95),
    maxAbsoluteDifferenceTicks: differences.length === 0 ? 0 : Math.max(...differences),
    meanStaleAgeMs:
      staleAges.length === 0
        ? 0
        : staleAges.reduce((sum, value) => sum + value, 0) / staleAges.length,
    p95StaleAgeMs: percentile(staleAges, 0.95),
    maxStaleAgeMs: staleAges.length === 0 ? 0 : Math.max(...staleAges),
    shadowPriceMoreAggressiveThanDesiredCount: moreAggressive,
    shadowPriceLessAggressiveThanDesiredCount: lessAggressive,
    postOnlySafety: Object.freeze({
      atBestCount: atBest,
      insideCurrentSpreadCount: insideSpread,
      behindCurrentBestCount: behindBest,
      crossingCurrentOppositeBestCount: crossing,
      shadowRepricePolicyCrossingRisk: crossing > 0,
    }),
    shadowFillCount: 0,
    shadowMakerVolumeUsd: 0,
    mcpMutationCalls: 0,
    venueMutations: 0,
  });
}

type policy_result_v1 = ReturnType<typeof replayShadowRepricePolicyV1> & {
  comparisonAgainstBaseline: Readonly<{
    replacementReductionPct: number;
    mutationCallReductionPct: number;
    exactPriceCoverageChangePctPoints: number;
    p95TickDeviationChange: number;
    reductionThresholds: Readonly<{
      atLeast25Pct: boolean;
      atLeast50Pct: boolean;
      atLeast75Pct: boolean;
    }>;
  }>;
};

function isDominated(candidate: policy_result_v1, values: readonly policy_result_v1[]): boolean {
  return values.some(
    (other) =>
      other.policy !== candidate.policy &&
      other.totalHypotheticalMutationCalls <= candidate.totalHypotheticalMutationCalls &&
      other.exactDesiredPriceCoveragePct >= candidate.exactDesiredPriceCoveragePct &&
      other.p95AbsoluteDifferenceTicks <= candidate.p95AbsoluteDifferenceTicks &&
      (other.totalHypotheticalMutationCalls < candidate.totalHypotheticalMutationCalls ||
        other.exactDesiredPriceCoveragePct > candidate.exactDesiredPriceCoveragePct ||
        other.p95AbsoluteDifferenceTicks < candidate.p95AbsoluteDifferenceTicks),
  );
}

export function buildShadowRepricePolicyExperimentV1(input: {
  sourceSessionId: string;
  sourceJsonlSha256: string;
  observations: readonly shadow_reprice_observation_v1[];
  tickSize?: number;
}) {
  const tickSize = input.tickSize ?? DECIBEL_SHADOW_REPRICE_TICK_SIZE_V1;
  const raw = DECIBEL_SHADOW_REPRICE_POLICIES_V1.map((policy) =>
    replayShadowRepricePolicyV1({ observations: input.observations, policy, tickSize }),
  );
  const baseline = raw[0]!;
  const policyResults: policy_result_v1[] = raw.map((result) => {
    const replacementReductionPct =
      baseline.wouldReplaceCount === 0
        ? 0
        : ((baseline.wouldReplaceCount - result.wouldReplaceCount) / baseline.wouldReplaceCount) *
          100;
    const mutationCallReductionPct =
      baseline.totalHypotheticalMutationCalls === 0
        ? 0
        : ((baseline.totalHypotheticalMutationCalls - result.totalHypotheticalMutationCalls) /
            baseline.totalHypotheticalMutationCalls) *
          100;
    return Object.freeze({
      ...result,
      comparisonAgainstBaseline: Object.freeze({
        replacementReductionPct,
        mutationCallReductionPct,
        exactPriceCoverageChangePctPoints:
          result.exactDesiredPriceCoveragePct - baseline.exactDesiredPriceCoveragePct,
        p95TickDeviationChange:
          result.p95AbsoluteDifferenceTicks - baseline.p95AbsoluteDifferenceTicks,
        reductionThresholds: Object.freeze({
          atLeast25Pct: mutationCallReductionPct >= 25,
          atLeast50Pct: mutationCallReductionPct >= 50,
          atLeast75Pct: mutationCallReductionPct >= 75,
        }),
      }),
    });
  });
  const baselinePassed =
    baseline.wouldPlaceCount === 1 &&
    baseline.wouldReplaceCount === 415 &&
    baseline.holdCount === 476;
  if (!baselinePassed) throw new Error('REPRICE_REPLAY_BASELINE_MISMATCH');
  const body = {
    identity: 'DECIBEL_MAINNET_SHADOW_REPRICE_POLICY_EXPERIMENT_V1',
    sourceSessionId: input.sourceSessionId,
    sourceJsonlSha256: input.sourceJsonlSha256,
    sourceEvaluationCount: input.observations.length,
    tickSize,
    baselineValidation: Object.freeze({
      status: 'PASS' as const,
      expected: Object.freeze({ wouldPlaceCount: 1, wouldReplaceCount: 415, holdCount: 476 }),
      actual: Object.freeze({
        wouldPlaceCount: baseline.wouldPlaceCount,
        wouldReplaceCount: baseline.wouldReplaceCount,
        holdCount: baseline.holdCount,
      }),
    }),
    policyResults: Object.freeze(policyResults),
    paretoFrontier: Object.freeze(
      policyResults
        .filter((candidate) => !isDominated(candidate, policyResults))
        .map((value) => value.policy),
    ),
    prohibitedInference: Object.freeze({ fills: false, pnl: false, makerVolume: false }),
    mcpMutationCalls: 0 as const,
    venueMutations: 0 as const,
  };
  return Object.freeze({
    ...body,
    experimentBodyHashSha256: sha256CanonicalJsonV1(body),
  });
}

export function canonicalizeJsonV1(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJsonV1);
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeJsonV1(item)]),
    );
  return value;
}

export function stringifyCanonicalJsonV1(value: unknown): string {
  return `${JSON.stringify(canonicalizeJsonV1(value), null, 2)}\n`;
}

export function sha256CanonicalJsonV1(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeJsonV1(value)))
    .digest('hex');
}
