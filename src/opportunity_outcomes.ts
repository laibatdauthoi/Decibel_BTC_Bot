import { z } from 'zod';

import type { BTC_candlestick } from './decibel_client.js';
import type {
  opportunity_candidate,
  opportunity_candidate_type,
  opportunity_direction,
} from './opportunity_scanner.js';
import type { market_regime } from './market_structure.js';

const HORIZONS = [1, 3, 6, 12] as const;
const FIVE_MINUTES_MS = 300_000;

const OpportunityOutcomeConfigSchema = z.object({
  makerFeeRate: z.number().nonnegative().max(0.1).finite(),
  takerFeeRate: z.number().nonnegative().max(0.1).finite(),
  slippageRate: z.number().nonnegative().max(0.1).finite(),
});

const OpportunityOutcomeEnvironmentSchema = z.object({
  OUTCOME_MAKER_FEE_RATE: z.coerce.number().nonnegative().max(0.1).default(0.00011),
  OUTCOME_TAKER_FEE_RATE: z.coerce.number().nonnegative().max(0.1).default(0.00034),
  OUTCOME_SLIPPAGE_RATE: z.coerce.number().nonnegative().max(0.1).default(0.0005),
});

export type opportunity_outcome_config = z.infer<typeof OpportunityOutcomeConfigSchema>;
export type holding_horizon = (typeof HORIZONS)[number];
export type cost_scenario = 'ZERO_COST' | 'MAKER' | 'TAKER_WITH_SLIPPAGE';
export type score_band = '0-69' | '70-79' | '80-89' | '90-100';

export type candidate_outcome = {
  candidate: opportunity_candidate;
  entryTime: Date;
  entryPrice: number;
  returns: Record<
    holding_horizon,
    { gross: number; zeroCost: number; maker: number; takerWithSlippage: number }
  >;
  maximumFavorableExcursion: number;
  maximumAdverseExcursion: number;
};

export type outcome_metrics = {
  sampleCount: number;
  hitRate: number;
  averageReturn: number;
  medianReturn: number;
  expectancy: number;
  averageMFE: number;
  averageMAE: number;
};

export type outcome_group = {
  group: string;
  horizonBars: holding_horizon;
  zeroCost: outcome_metrics;
  maker: outcome_metrics;
  takerWithSlippage: outcome_metrics;
};

export type cooldown_result = {
  cooldownMinutes: 5 | 10 | 15;
  selectedCandidateCount: number;
  horizonResults: outcome_group[];
};

export type opportunity_outcome_analysis = {
  historicalCandidateCount: number;
  analyzedCandidateCount: number;
  excludedInsufficientFutureCount: number;
  feeAssumptions: opportunity_outcome_config;
  overlappingClusters: {
    clusterCount: number;
    overlappingCandidateCount: number;
    maximumClusterSize: number;
  };
  groupedResults: {
    candidateType: outcome_group[];
    direction: outcome_group[];
    regime: outcome_group[];
    scoreBand: outcome_group[];
    holdingHorizon: outcome_group[];
  };
  cooldownResults: cooldown_result[];
};

export function loadOpportunityOutcomeConfig(
  environment: Record<string, string | undefined> = process.env,
): opportunity_outcome_config {
  const parsed = OpportunityOutcomeEnvironmentSchema.parse(environment);
  return OpportunityOutcomeConfigSchema.parse({
    makerFeeRate: parsed.OUTCOME_MAKER_FEE_RATE,
    takerFeeRate: parsed.OUTCOME_TAKER_FEE_RATE,
    slippageRate: parsed.OUTCOME_SLIPPAGE_RATE,
  });
}

function getScoreBand(score: number): score_band {
  if (score < 70) return '0-69';
  if (score < 80) return '70-79';
  if (score < 90) return '80-89';
  return '90-100';
}

function calculateMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  if (right === undefined) return 0;
  return sorted.length % 2 === 1 ? right : ((sorted[middle - 1] ?? right) + right) / 2;
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

function calculateMetrics(
  outcomes: readonly candidate_outcome[],
  horizon: holding_horizon,
  scenario: cost_scenario,
): outcome_metrics {
  const returns = outcomes.map((outcome) => {
    const horizonReturn = outcome.returns[horizon];
    return scenario === 'ZERO_COST'
      ? horizonReturn.zeroCost
      : scenario === 'MAKER'
        ? horizonReturn.maker
        : horizonReturn.takerWithSlippage;
  });
  const wins = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value <= 0);
  const averageWin =
    wins.length === 0 ? 0 : wins.reduce((sum, value) => sum + value, 0) / wins.length;
  const averageLoss =
    losses.length === 0 ? 0 : losses.reduce((sum, value) => sum + value, 0) / losses.length;
  const hitRate = returns.length === 0 ? 0 : wins.length / returns.length;
  return {
    sampleCount: returns.length,
    hitRate: roundMetric(hitRate),
    averageReturn: roundMetric(
      returns.length === 0 ? 0 : returns.reduce((sum, value) => sum + value, 0) / returns.length,
    ),
    medianReturn: roundMetric(calculateMedian(returns)),
    expectancy: roundMetric(hitRate * averageWin + (1 - hitRate) * averageLoss),
    averageMFE: roundMetric(
      outcomes.length === 0
        ? 0
        : outcomes.reduce((sum, outcome) => sum + outcome.maximumFavorableExcursion, 0) /
            outcomes.length,
    ),
    averageMAE: roundMetric(
      outcomes.length === 0
        ? 0
        : outcomes.reduce((sum, outcome) => sum + outcome.maximumAdverseExcursion, 0) /
            outcomes.length,
    ),
  };
}

function createGroup(
  group: string,
  outcomes: readonly candidate_outcome[],
  horizon: holding_horizon,
): outcome_group {
  return {
    group,
    horizonBars: horizon,
    zeroCost: calculateMetrics(outcomes, horizon, 'ZERO_COST'),
    maker: calculateMetrics(outcomes, horizon, 'MAKER'),
    takerWithSlippage: calculateMetrics(outcomes, horizon, 'TAKER_WITH_SLIPPAGE'),
  };
}

function groupOutcomes(
  outcomes: readonly candidate_outcome[],
  groups: readonly string[],
  selectGroup: (outcome: candidate_outcome) => string,
): outcome_group[] {
  return groups.flatMap((group) =>
    HORIZONS.map((horizon) =>
      createGroup(
        group,
        outcomes.filter((outcome) => selectGroup(outcome) === group),
        horizon,
      ),
    ),
  );
}

function selectCooldownCandidates(
  candidates: readonly opportunity_candidate[],
  cooldownMinutes: 5 | 10 | 15,
): opportunity_candidate[] {
  const ordered = [...candidates].sort(
    (left, right) =>
      left.availableAtTime.getTime() - right.availableAtTime.getTime() || right.score - left.score,
  );
  const selected: opportunity_candidate[] = [];
  let lastTime = -Infinity;
  for (const candidate of ordered) {
    const timestamp = candidate.availableAtTime.getTime();
    if (timestamp - lastTime < cooldownMinutes * 60_000) continue;
    selected.push(candidate);
    lastTime = timestamp;
  }
  return selected;
}

function summarizeClusters(
  candidates: readonly opportunity_candidate[],
): opportunity_outcome_analysis['overlappingClusters'] {
  const ordered = [...candidates].sort(
    (left, right) => left.availableAtTime.getTime() - right.availableAtTime.getTime(),
  );
  const clusterSizes: number[] = [];
  let clusterSize = 0;
  let previousTime = -Infinity;
  for (const candidate of ordered) {
    const timestamp = candidate.availableAtTime.getTime();
    if (clusterSize === 0 || timestamp - previousTime <= 15 * 60_000) {
      clusterSize += 1;
    } else {
      if (clusterSize > 1) clusterSizes.push(clusterSize);
      clusterSize = 1;
    }
    previousTime = timestamp;
  }
  if (clusterSize > 1) clusterSizes.push(clusterSize);
  return {
    clusterCount: clusterSizes.length,
    overlappingCandidateCount: clusterSizes.reduce((sum, size) => sum + size - 1, 0),
    maximumClusterSize: Math.max(0, ...clusterSizes),
  };
}

export function calculateCandidateOutcomes(
  candles: readonly BTC_candlestick[],
  candidates: readonly opportunity_candidate[],
  config: opportunity_outcome_config,
): candidate_outcome[] {
  const validatedConfig = OpportunityOutcomeConfigSchema.parse(config);
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    if (candle === undefined) throw new Error('Outcome candle is missing');
    const timestamp = candle.timestamp.getTime();
    if (!Number.isSafeInteger(timestamp) || timestamp % FIVE_MINUTES_MS !== 0) {
      throw new Error('Outcome candle timestamp is invalid or misaligned');
    }
    const previous = candles[index - 1];
    if (previous !== undefined && timestamp !== previous.timestamp.getTime() + FIVE_MINUTES_MS) {
      throw new Error('Outcome candles are not continuous and chronological');
    }
  }
  const candleIndex = new Map(
    candles.map((candle, index) => [candle.timestamp.getTime(), index] as const),
  );
  const outcomes: candidate_outcome[] = [];
  for (const candidate of candidates) {
    const detectionIndex = candleIndex.get(candidate.detectedAtTime.getTime());
    if (detectionIndex === undefined) continue;
    const entryIndex = detectionIndex + 1;
    const entryCandle = candles[entryIndex];
    const finalCandle = candles[entryIndex + 11];
    if (entryCandle === undefined || finalCandle === undefined) continue;
    if (
      candidate.availableAtTime.getTime() !==
        candidate.detectedAtTime.getTime() + FIVE_MINUTES_MS ||
      candidate.availableAtTime.getTime() !== entryCandle.timestamp.getTime()
    ) {
      throw new Error('Candidate availability does not match the next completed 5m open');
    }
    const direction = candidate.direction === 'LONG' ? 1 : -1;
    const entryPrice = entryCandle.open;
    const makerCost = validatedConfig.makerFeeRate * 2;
    const takerCost = validatedConfig.takerFeeRate * 2 + validatedConfig.slippageRate * 2;
    const returns = Object.fromEntries(
      HORIZONS.map((horizon) => {
        const exitCandle = candles[entryIndex + horizon - 1];
        if (exitCandle === undefined) throw new Error('Outcome horizon is incomplete');
        const gross = roundMetric(((exitCandle.close - entryPrice) / entryPrice) * direction);
        return [
          horizon,
          {
            gross,
            zeroCost: gross,
            maker: roundMetric(gross - makerCost),
            takerWithSlippage: roundMetric(gross - takerCost),
          },
        ];
      }),
    ) as candidate_outcome['returns'];
    const excursionCandles = candles.slice(entryIndex, entryIndex + 12);
    const favorablePrice =
      candidate.direction === 'LONG'
        ? Math.max(...excursionCandles.map((candle) => candle.high))
        : Math.min(...excursionCandles.map((candle) => candle.low));
    const adversePrice =
      candidate.direction === 'LONG'
        ? Math.min(...excursionCandles.map((candle) => candle.low))
        : Math.max(...excursionCandles.map((candle) => candle.high));
    outcomes.push({
      candidate,
      entryTime: entryCandle.timestamp,
      entryPrice,
      returns,
      maximumFavorableExcursion: roundMetric(
        ((favorablePrice - entryPrice) / entryPrice) * direction,
      ),
      maximumAdverseExcursion: roundMetric(((adversePrice - entryPrice) / entryPrice) * direction),
    });
  }
  return outcomes;
}

export function analyzeOpportunityOutcomes(
  candles: readonly BTC_candlestick[],
  candidates: readonly opportunity_candidate[],
  config: opportunity_outcome_config,
): opportunity_outcome_analysis {
  const outcomes = calculateCandidateOutcomes(candles, candidates, config);
  const types: opportunity_candidate_type[] = [
    'SHORT_RANGE_BREAKOUT',
    'TREND_PULLBACK_CONTINUATION',
    'SWING_LEVEL_RETEST_REJECTION',
    'VOLATILITY_EXPANSION',
  ];
  const directions: opportunity_direction[] = ['LONG', 'SHORT'];
  const regimes: market_regime[] = ['TREND_UP', 'TREND_DOWN', 'RANGE', 'UNKNOWN'];
  const scoreBands: score_band[] = ['0-69', '70-79', '80-89', '90-100'];
  const cooldownResults = ([5, 10, 15] as const).map((cooldownMinutes) => {
    const selected = selectCooldownCandidates(candidates, cooldownMinutes);
    const selectedOutcomes = calculateCandidateOutcomes(candles, selected, config);
    return {
      cooldownMinutes,
      selectedCandidateCount: selectedOutcomes.length,
      horizonResults: HORIZONS.map((horizon) => createGroup('ALL', selectedOutcomes, horizon)),
    };
  });
  return {
    historicalCandidateCount: candidates.length,
    analyzedCandidateCount: outcomes.length,
    excludedInsufficientFutureCount: candidates.length - outcomes.length,
    feeAssumptions: OpportunityOutcomeConfigSchema.parse(config),
    overlappingClusters: summarizeClusters(candidates),
    groupedResults: {
      candidateType: groupOutcomes(outcomes, types, (outcome) => outcome.candidate.candidateType),
      direction: groupOutcomes(outcomes, directions, (outcome) => outcome.candidate.direction),
      regime: groupOutcomes(outcomes, regimes, (outcome) => outcome.candidate.regime),
      scoreBand: groupOutcomes(outcomes, scoreBands, (outcome) =>
        getScoreBand(outcome.candidate.score),
      ),
      holdingHorizon: HORIZONS.map((horizon) => createGroup('ALL', outcomes, horizon)),
    },
    cooldownResults,
  };
}
