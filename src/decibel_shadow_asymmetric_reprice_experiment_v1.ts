import {
  canonicalizeJsonV1,
  parseShadowRepriceSourceJsonlV1,
  priceToTicksV1,
  sha256CanonicalJsonV1,
  stringifyCanonicalJsonV1,
  type shadow_reprice_observation_v1,
} from './decibel_shadow_reprice_policy_experiment_v1.js';

export { canonicalizeJsonV1, parseShadowRepriceSourceJsonlV1, stringifyCanonicalJsonV1 };

export type asymmetric_reprice_policy_name_v1 =
  | 'BASELINE_IMMEDIATE'
  | 'ASYMMETRIC_BEHIND_2_TICKS'
  | 'ASYMMETRIC_BEHIND_3_TICKS'
  | 'ASYMMETRIC_BEHIND_5_TICKS'
  | 'ASYMMETRIC_BEHIND_10_TICKS'
  | 'ASYMMETRIC_BEHIND_3000MS'
  | 'ASYMMETRIC_BEHIND_5000MS'
  | 'ASYMMETRIC_BEHIND_3000MS_2_TICKS'
  | 'ASYMMETRIC_BEHIND_5000MS_3_TICKS'
  | 'ASYMMETRIC_BEHIND_3000MS_OR_5_TICKS';

type trigger_v1 = 'BASELINE' | 'DISTANCE' | 'DURATION' | 'AND' | 'OR';
export type asymmetric_reprice_policy_v1 = Readonly<{
  name: asymmetric_reprice_policy_name_v1;
  trigger: trigger_v1;
  distanceTicks: number;
  durationMs: number;
}>;

export const DECIBEL_SHADOW_ASYMMETRIC_POLICIES_V1: readonly asymmetric_reprice_policy_v1[] =
  Object.freeze([
    { name: 'BASELINE_IMMEDIATE', trigger: 'BASELINE', distanceTicks: 1, durationMs: 0 },
    { name: 'ASYMMETRIC_BEHIND_2_TICKS', trigger: 'DISTANCE', distanceTicks: 2, durationMs: 0 },
    { name: 'ASYMMETRIC_BEHIND_3_TICKS', trigger: 'DISTANCE', distanceTicks: 3, durationMs: 0 },
    { name: 'ASYMMETRIC_BEHIND_5_TICKS', trigger: 'DISTANCE', distanceTicks: 5, durationMs: 0 },
    { name: 'ASYMMETRIC_BEHIND_10_TICKS', trigger: 'DISTANCE', distanceTicks: 10, durationMs: 0 },
    { name: 'ASYMMETRIC_BEHIND_3000MS', trigger: 'DURATION', distanceTicks: 0, durationMs: 3_000 },
    { name: 'ASYMMETRIC_BEHIND_5000MS', trigger: 'DURATION', distanceTicks: 0, durationMs: 5_000 },
    {
      name: 'ASYMMETRIC_BEHIND_3000MS_2_TICKS',
      trigger: 'AND',
      distanceTicks: 2,
      durationMs: 3_000,
    },
    {
      name: 'ASYMMETRIC_BEHIND_5000MS_3_TICKS',
      trigger: 'AND',
      distanceTicks: 3,
      durationMs: 5_000,
    },
    {
      name: 'ASYMMETRIC_BEHIND_3000MS_OR_5_TICKS',
      trigger: 'OR',
      distanceTicks: 5,
      durationMs: 3_000,
    },
  ]);

export type quote_bbo_state_v1 = 'CROSSING' | 'INSIDE_SPREAD' | 'AT_BEST' | 'BEHIND_BEST';

export function classifyShadowQuoteAtBboV1(input: {
  side: 'buy' | 'sell';
  restingPriceTicks: number;
  bestBidTicks: number;
  bestAskTicks: number;
}): quote_bbo_state_v1 {
  if (input.side === 'buy') {
    if (input.restingPriceTicks >= input.bestAskTicks) return 'CROSSING';
    if (input.restingPriceTicks > input.bestBidTicks) return 'INSIDE_SPREAD';
    if (input.restingPriceTicks === input.bestBidTicks) return 'AT_BEST';
    return 'BEHIND_BEST';
  }
  if (input.restingPriceTicks <= input.bestBidTicks) return 'CROSSING';
  if (input.restingPriceTicks < input.bestAskTicks) return 'INSIDE_SPREAD';
  if (input.restingPriceTicks === input.bestAskTicks) return 'AT_BEST';
  return 'BEHIND_BEST';
}

const percentile = (values: readonly number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
};
const median = (values: readonly number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

type replacement_reason_v1 =
  | 'SAFETY_CROSSING'
  | 'SAFETY_INSIDE_SPREAD'
  | 'CHASE_BEHIND_DISTANCE'
  | 'CHASE_BEHIND_DURATION'
  | 'CHASE_BEHIND_COMBINED'
  | 'BASELINE_BBO_CHANGE';

const emptyReasons = (): Record<replacement_reason_v1, number> => ({
  SAFETY_CROSSING: 0,
  SAFETY_INSIDE_SPREAD: 0,
  CHASE_BEHIND_DISTANCE: 0,
  CHASE_BEHIND_DURATION: 0,
  CHASE_BEHIND_COMBINED: 0,
  BASELINE_BBO_CHANGE: 0,
});

export function replayShadowAsymmetricRepricePolicyV1(input: {
  observations: readonly shadow_reprice_observation_v1[];
  policy: asymmetric_reprice_policy_v1;
  tickSize: number;
}) {
  let resting: {
    side: 'buy' | 'sell';
    priceTicks: number;
    quantity: number;
    createdAt: number;
  } | null = null;
  let behindSince: number | null = null;
  let places = 0;
  let replacements = 0;
  let holds = 0;
  let crossingObserved = 0;
  let insideObserved = 0;
  let crossingDelayed = 0;
  let insideDelayed = 0;
  let exact = 0;
  let behindCount = 0;
  const behindDistances: number[] = [];
  const continuousBehind: number[] = [];
  const deviations: number[] = [];
  const lifetimes: number[] = [];
  const reasons = emptyReasons();
  for (const observation of input.observations) {
    const desiredTicks = priceToTicksV1(observation.desiredPrice, input.tickSize);
    const bidTicks = priceToTicksV1(observation.bestBid, input.tickSize);
    const askTicks = priceToTicksV1(observation.bestAsk, input.tickSize);
    if (resting === null) {
      resting = {
        side: observation.desiredSide,
        priceTicks: desiredTicks,
        quantity: observation.desiredQuantity,
        createdAt: observation.timestamp,
      };
      places += 1;
    } else {
      const state = classifyShadowQuoteAtBboV1({
        side: resting.side,
        restingPriceTicks: resting.priceTicks,
        bestBidTicks: bidTicks,
        bestAskTicks: askTicks,
      });
      if (state === 'CROSSING') crossingObserved += 1;
      if (state === 'INSIDE_SPREAD') insideObserved += 1;
      if (state === 'BEHIND_BEST' && behindSince === null) behindSince = observation.timestamp;
      if (state !== 'BEHIND_BEST') behindSince = null;
      const distanceTicks = Math.abs(desiredTicks - resting.priceTicks);
      const semanticsChanged =
        resting.side !== observation.desiredSide ||
        resting.quantity !== observation.desiredQuantity;
      const behindDurationMs = behindSince === null ? 0 : observation.timestamp - behindSince;
      const baselineDue =
        input.policy.trigger === 'BASELINE' && (distanceTicks >= 1 || semanticsChanged);
      const urgent = state === 'CROSSING' || state === 'INSIDE_SPREAD';
      const distanceDue = distanceTicks >= input.policy.distanceTicks;
      const durationDue = behindDurationMs >= input.policy.durationMs;
      const behindDue =
        state === 'BEHIND_BEST' &&
        (input.policy.trigger === 'DISTANCE'
          ? distanceDue
          : input.policy.trigger === 'DURATION'
            ? durationDue
            : input.policy.trigger === 'AND'
              ? distanceDue && durationDue
              : input.policy.trigger === 'OR'
                ? distanceDue || durationDue
                : false);
      if (urgent || baselineDue || behindDue || semanticsChanged) {
        let reason: replacement_reason_v1;
        if (state === 'CROSSING') reason = 'SAFETY_CROSSING';
        else if (state === 'INSIDE_SPREAD') reason = 'SAFETY_INSIDE_SPREAD';
        else if (input.policy.trigger === 'DISTANCE') reason = 'CHASE_BEHIND_DISTANCE';
        else if (input.policy.trigger === 'DURATION') reason = 'CHASE_BEHIND_DURATION';
        else if (input.policy.trigger === 'AND' || input.policy.trigger === 'OR')
          reason = 'CHASE_BEHIND_COMBINED';
        else reason = 'BASELINE_BBO_CHANGE';
        reasons[reason] += 1;
        lifetimes.push(observation.timestamp - resting.createdAt);
        resting = {
          side: observation.desiredSide,
          priceTicks: desiredTicks,
          quantity: observation.desiredQuantity,
          createdAt: observation.timestamp,
        };
        replacements += 1;
        behindSince = null;
      } else {
        holds += 1;
        if (state === 'CROSSING') crossingDelayed += 1;
        if (state === 'INSIDE_SPREAD') insideDelayed += 1;
      }
    }
    const resultingState = classifyShadowQuoteAtBboV1({
      side: resting.side,
      restingPriceTicks: resting.priceTicks,
      bestBidTicks: bidTicks,
      bestAskTicks: askTicks,
    });
    const deviation = Math.abs(desiredTicks - resting.priceTicks);
    deviations.push(deviation);
    if (resultingState === 'AT_BEST') exact += 1;
    if (resultingState === 'BEHIND_BEST') {
      behindCount += 1;
      behindDistances.push(deviation);
      continuousBehind.push(behindSince === null ? 0 : observation.timestamp - behindSince);
    }
  }
  const count = input.observations.length;
  const durationMs =
    count < 2 ? 0 : input.observations.at(-1)!.timestamp - input.observations[0]!.timestamp;
  const multiplier = durationMs === 0 ? 0 : 60_000 / durationMs;
  const mutations = places + replacements * 2;
  return Object.freeze({
    policy: input.policy.name,
    wouldPlaceCount: places,
    wouldCancelCount: replacements,
    wouldReplaceCount: replacements,
    holdCount: holds,
    hypotheticalMutationCalls: mutations,
    replacementsPerMinute: replacements * multiplier,
    mutationCallsPerMinute: mutations * multiplier,
    averageShadowLifetimeMs:
      lifetimes.length === 0
        ? 0
        : lifetimes.reduce((sum, value) => sum + value, 0) / lifetimes.length,
    medianShadowLifetimeMs: median(lifetimes),
    crossingStateObservedCount: crossingObserved,
    insideSpreadStateObservedCount: insideObserved,
    crossingStateDelayedCount: crossingDelayed,
    insideSpreadStateDelayedCount: insideDelayed,
    exactBestCoveragePct: count === 0 ? 0 : (exact / count) * 100,
    behindBestEvaluationCount: behindCount,
    behindBestPct: count === 0 ? 0 : (behindCount / count) * 100,
    meanBehindDistanceTicks:
      behindDistances.length === 0
        ? 0
        : behindDistances.reduce((sum, value) => sum + value, 0) / behindDistances.length,
    medianBehindDistanceTicks: median(behindDistances),
    p95BehindDistanceTicks: percentile(behindDistances, 0.95),
    maxBehindDistanceTicks: behindDistances.length === 0 ? 0 : Math.max(...behindDistances),
    meanContinuousBehindMs:
      continuousBehind.length === 0
        ? 0
        : continuousBehind.reduce((sum, value) => sum + value, 0) / continuousBehind.length,
    p95ContinuousBehindMs: percentile(continuousBehind, 0.95),
    maxContinuousBehindMs: continuousBehind.length === 0 ? 0 : Math.max(...continuousBehind),
    meanAbsoluteDeviationTicks:
      count === 0 ? 0 : deviations.reduce((sum, value) => sum + value, 0) / count,
    p95AbsoluteDeviationTicks: percentile(deviations, 0.95),
    maxAbsoluteDeviationTicks: deviations.length === 0 ? 0 : Math.max(...deviations),
    replacementReasonBreakdown: Object.freeze(reasons),
    shadowFillCount: 0,
    shadowMakerVolumeUsd: 0,
    mcpMutationCalls: 0,
    venueMutations: 0,
  });
}

type result_v1 = ReturnType<typeof replayShadowAsymmetricRepricePolicyV1> & {
  replacementReductionPct: number;
  mutationReductionPct: number;
};

const dominated = (candidate: result_v1, values: readonly result_v1[]) =>
  values.some(
    (other) =>
      other.policy !== candidate.policy &&
      other.crossingStateDelayedCount === 0 &&
      other.insideSpreadStateDelayedCount === 0 &&
      other.hypotheticalMutationCalls <= candidate.hypotheticalMutationCalls &&
      other.exactBestCoveragePct >= candidate.exactBestCoveragePct &&
      other.p95AbsoluteDeviationTicks <= candidate.p95AbsoluteDeviationTicks &&
      (other.hypotheticalMutationCalls < candidate.hypotheticalMutationCalls ||
        other.exactBestCoveragePct > candidate.exactBestCoveragePct ||
        other.p95AbsoluteDeviationTicks < candidate.p95AbsoluteDeviationTicks),
  );

export function buildShadowAsymmetricRepriceExperimentV1(input: {
  sourceSessionId: string;
  sourceJsonlSha256: string;
  observations: readonly shadow_reprice_observation_v1[];
  tickSize: number;
}) {
  const raw = DECIBEL_SHADOW_ASYMMETRIC_POLICIES_V1.map((policy) =>
    replayShadowAsymmetricRepricePolicyV1({
      observations: input.observations,
      policy,
      tickSize: input.tickSize,
    }),
  );
  const baseline = raw[0]!;
  if (
    baseline.wouldPlaceCount !== 1 ||
    baseline.wouldReplaceCount !== 415 ||
    baseline.holdCount !== 476
  )
    throw new Error('ASYMMETRIC_REPRICE_REPLAY_BASELINE_MISMATCH');
  const policyResults: result_v1[] = raw.map((result) =>
    Object.freeze({
      ...result,
      replacementReductionPct:
        ((baseline.wouldReplaceCount - result.wouldReplaceCount) / baseline.wouldReplaceCount) *
        100,
      mutationReductionPct:
        ((baseline.hypotheticalMutationCalls - result.hypotheticalMutationCalls) /
          baseline.hypotheticalMutationCalls) *
        100,
    }),
  );
  if (
    policyResults.some(
      (result) => result.crossingStateDelayedCount > 0 || result.insideSpreadStateDelayedCount > 0,
    )
  )
    throw new Error('MAKER_SAFE_ASYMMETRIC_POLICY_INVALID');
  const safeAcceptanceCandidates = policyResults
    .filter(
      (result) =>
        result.replacementReductionPct >= 25 &&
        result.p95AbsoluteDeviationTicks <= 5 &&
        result.maxAbsoluteDeviationTicks <= 25,
    )
    .map((result) => result.policy);
  const strictAcceptanceCandidates = policyResults
    .filter(
      (result) => result.replacementReductionPct >= 35 && result.p95AbsoluteDeviationTicks <= 3,
    )
    .map((result) => result.policy);
  const body = {
    identity: 'DECIBEL_MAKER_SAFE_ASYMMETRIC_REPRICE_POLICY_EXPERIMENT_V1',
    sourceSessionId: input.sourceSessionId,
    sourceJsonlSha256: input.sourceJsonlSha256,
    sourceEvaluationCount: input.observations.length,
    tickSize: input.tickSize,
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
    replacementReasonBreakdown: Object.freeze(
      Object.fromEntries(
        policyResults.map((result) => [result.policy, result.replacementReasonBreakdown]),
      ),
    ),
    safeAcceptanceCandidates: Object.freeze(safeAcceptanceCandidates),
    strictAcceptanceCandidates: Object.freeze(strictAcceptanceCandidates),
    safeParetoFrontier: Object.freeze(
      policyResults
        .filter(
          (candidate) =>
            candidate.crossingStateDelayedCount === 0 &&
            candidate.insideSpreadStateDelayedCount === 0 &&
            !dominated(candidate, policyResults),
        )
        .map((result) => result.policy),
    ),
    productionReconciliationRequirement:
      'AUTHENTICATED_ORDER_AND_FILL_RECONCILIATION_BEFORE_CANCEL_OR_REPLACE',
    prohibitedInference: Object.freeze({ fills: false, pnl: false, makerVolume: false }),
    mcpMutationCalls: 0 as const,
    venueMutations: 0 as const,
  };
  return Object.freeze({ ...body, experimentBodyHashSha256: sha256CanonicalJsonV1(body) });
}
