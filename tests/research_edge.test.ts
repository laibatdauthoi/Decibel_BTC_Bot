import { describe, expect, it } from 'vitest';

import type {
  maker_fill_assumption,
  maker_simulation_result,
} from '../src/maker_execution_simulator.js';
import {
  adjustBenjaminiHochberg,
  analyzeResearchEdge,
  blockBootstrapConfidenceInterval,
  buildChronologicalSplits,
  calculateTrainingThresholds,
  joinResearchEdgeInputs,
  matchesResearchHypothesis,
  type research_edge_config,
} from '../src/research_edge.js';
import type { research_feature_window } from '../src/research_dataset.js';
import type { research_sample } from '../src/research_types.js';

const START = Date.parse('2026-01-01T00:00:00.000Z');
const config: research_edge_config = {
  minimumTrainingSamples: 100,
  testBlockSize: 25,
  embargoMinutes: 60,
  featureWindowSeconds: 60,
  bootstrapIterations: 100,
  bootstrapSeed: 7,
};

function feature(index: number): research_feature_window {
  const directionValue = index % 2 === 0 ? 0.5 : -0.5;
  return {
    windowSeconds: 60,
    status: 'VALID',
    invalidReasons: [],
    aggregateCoverageRatio: 1,
    staleOrMissingBookRatio: 0,
    staleOrMissingMarketPriceRatio: 0,
    spreadBasisPoints: { median: 2 + index / 1_000, p90: 3 },
    imbalance: {
      mean: directionValue,
      final: directionValue,
      minimum: -0.5,
      maximum: 0.5,
      change: directionValue,
    },
    depth: { meanBid: 2, meanAsk: 2, meanCombined: 4 + index / 100 },
    estimatedBuyVolume: 2,
    estimatedSellVolume: 1,
    unknownVolume: 0,
    signedVolumeImbalance: directionValue,
    tradeCount: 3,
    tradeIntensity: 0.05 + index / 10_000,
    vwap: 100,
    vwapRelativeToFinalMidPrice: 0,
    orderFlowImbalance: { sum: directionValue, mean: directionValue },
    micropriceDeviationFromMidPrice: { mean: 0, final: 0 },
    finalBookAgeMs: 100,
    finalMarketPriceAgeMs: 100,
    directionCounts: { EXPLICIT: 1, ESTIMATED_QUOTE_TEST: 1, UNKNOWN: 0 },
  };
}

function sample(
  index: number,
  overrides: { invalid?: boolean; incomplete?: boolean } = {},
): research_sample {
  const decision = START + index * 2 * 60 * 60_000;
  const direction = index % 2 === 0 ? 'LONG' : 'SHORT';
  const window: research_feature_window = {
    ...feature(index),
    status: overrides.invalid ? 'INVALID' : 'VALID',
  };
  const value = 0.001 + index / 1_000_000;
  return {
    candidateId: `candidate-${String(index).padStart(3, '0')}`,
    marketAddress: '0xbtc',
    featureVersion: 'BTC_5M_MICROSTRUCTURE_V1',
    candidate: {
      candidateType: 'SHORT_RANGE_BREAKOUT',
      direction,
      score: 90,
      regime: 'RANGE',
      detectedAtTime: new Date(decision - 300_000).toISOString(),
      availableAtTime: new Date(decision).toISOString(),
    },
    features: {
      '15': { ...window, windowSeconds: 15 },
      '60': window,
      '300': { ...window, windowSeconds: 300 },
    },
    outcomes: {
      points: [5, 15, 30, 60].map((horizonMinutes) => ({
        horizonMinutes,
        candleTime: new Date(decision + horizonMinutes * 60_000 - 300_000).toISOString(),
        availableAtTime: new Date(decision + horizonMinutes * 60_000).toISOString(),
        price: 100 * (1 + value),
        return: direction === 'LONG' ? value : -value,
        directionAdjustedReturn: value,
      })),
      maximumFavorableExcursion: value * 2,
      maximumFavorableExcursionTime: new Date(decision + 60_000).toISOString(),
      maximumFavorableExcursionPrice: 101,
      maximumAdverseExcursion: -value,
      maximumAdverseExcursionTime: new Date(decision + 120_000).toISOString(),
      maximumAdverseExcursionPrice: 99,
      windowStartTime: new Date(decision).toISOString(),
      windowEndTime: new Date(decision + 60 * 60_000).toISOString(),
      referenceTime: new Date(decision).toISOString(),
      referencePrice: 100,
      complete: !overrides.incomplete,
    },
  };
}

function maker(input: research_sample, assumption: maker_fill_assumption): maker_simulation_result {
  return {
    simulatorVersion: 'POST_ONLY_MAKER_V1',
    featureVersion: input.featureVersion,
    fillAssumption: assumption,
    candidateId: input.candidateId,
    marketAddress: input.marketAddress,
    candidateType: input.candidate.candidateType,
    direction: input.candidate.direction,
    regime: input.candidate.regime,
    decisionTime: input.candidate.availableAtTime,
    state: 'FILLED',
    filledQuantity: 1,
    remainingQuantity: 0,
    averageFillPrice: 100,
    makerFees: 0.011,
    markouts: Object.fromEntries(
      [5, 15, 30, 60].map((seconds) => [
        seconds,
        {
          timestamp: input.candidate.availableAtTime,
          midPrice: 100.1,
          return: 0.001,
          directionAdjustedReturn: 0.001,
        },
      ]),
    ),
  } as maker_simulation_result;
}

function inputs(count: number) {
  const samples = Array.from({ length: count }, (_, index) => sample(index));
  const simulations = samples.flatMap((value) => [
    maker(value, 'STRICT_TRADE_THROUGH'),
    maker(value, 'TOUCH_WITH_FLOW'),
  ]);
  return {
    samples,
    simulations,
    candidates: joinResearchEdgeInputs(samples, simulations).candidates,
  };
}

describe('research edge walk-forward controls', () => {
  it('keeps chronological expanding training windows with outcome purge and embargo', () => {
    const { candidates } = inputs(140);
    const folds = buildChronologicalSplits(candidates, config);
    expect(folds).toHaveLength(2);
    expect(folds[0]?.training).toHaveLength(100);
    expect(folds[0]?.test).toHaveLength(25);
    expect(folds[1]?.training).toHaveLength(125);
    for (const fold of folds) {
      expect(
        fold.training.every(
          (value) => value.outcomeEndTimeMs <= fold.testStartTimeMs - 60 * 60_000,
        ),
      ).toBe(true);
      expect(fold.test.map((value) => value.decisionTimeMs)).toEqual(
        [...fold.test].map((value) => value.decisionTimeMs).sort((left, right) => left - right),
      );
    }
  });

  it('uses only training observations for fixed median thresholds', () => {
    const { candidates } = inputs(101);
    const training = candidates.slice(0, 100);
    const thresholds = calculateTrainingThresholds(training);
    expect(thresholds?.spread).toBeCloseTo((2.049 + 2.05) / 2);
    const test = candidates[100]!;
    test.feature.spreadBasisPoints.median = 10_000;
    expect(calculateTrainingThresholds(training)).toEqual(thresholds);
    expect(matchesResearchHypothesis(test, 'LOW_SPREAD', thresholds!)).toBe(false);
  });

  it('joins both maker assumptions without duplicating the candidate statistical unit', () => {
    const { samples, simulations } = inputs(3);
    const joined = joinResearchEdgeInputs(samples, simulations);
    expect(joined.candidates).toHaveLength(3);
    expect(Object.keys(joined.candidates[0]?.makers ?? {}).sort()).toEqual([
      'STRICT_TRADE_THROUGH',
      'TOUCH_WITH_FLOW',
    ]);
  });

  it('rejects look-ahead maker joins and accounts for exclusions exactly', () => {
    const valid = sample(0);
    const invalid = sample(1, { invalid: true });
    const incomplete = sample(2, { incomplete: true });
    const mismatched = maker(valid, 'STRICT_TRADE_THROUGH');
    mismatched.decisionTime = new Date(
      Date.parse(valid.candidate.availableAtTime) + 1,
    ).toISOString();
    const joined = joinResearchEdgeInputs([valid, invalid, incomplete], [mismatched]);
    expect(joined.candidates).toHaveLength(1);
    expect(joined.candidates[0]?.makers).toEqual({});
    expect(joined.exclusions).toEqual({
      INVALID_FEATURE_WINDOW: 1,
      INCOMPLETE_FORWARD_OUTCOMES: 1,
      MAKER_DECISION_TIME_MISMATCH: 1,
      MISSING_STRICT_TRADE_THROUGH_RESULT: 1,
      MISSING_TOUCH_WITH_FLOW_RESULT: 1,
    });
  });
});

describe('research edge uncertainty and reporting', () => {
  it('produces deterministic seeded block-bootstrap confidence intervals', () => {
    const first = blockBootstrapConfidenceInterval([[1, 2], [3], [4, 5]], 500, 42);
    const second = blockBootstrapConfidenceInterval([[1, 2], [3], [4, 5]], 500, 42);
    expect(first).toEqual(second);
    expect(first.lower).not.toBeNull();
    expect(first.upper).not.toBeNull();
    expect(first.lower!).toBeLessThan(first.upper!);
  });

  it('applies Benjamini-Hochberg correction monotonically', () => {
    expect(adjustBenjaminiHochberg([0.01, 0.04, 0.03])).toEqual([0.03, 0.04, 0.04]);
  });

  it('returns NOT_ENOUGH_DATA below 100 candidates without recommendations', () => {
    const { samples, simulations } = inputs(99);
    const report = analyzeResearchEdge(samples, simulations, config, '2026-02-01T00:00:00.000Z');
    expect(report.status).toBe('NOT_ENOUGH_DATA');
    expect(report.hypotheses).toEqual({});
    expect(report.statement).toContain('No recommendation');
  });

  it('reports idempotently and keeps maker assumptions separate', () => {
    const { samples, simulations } = inputs(140);
    const first = analyzeResearchEdge(samples, simulations, config, '2026-02-01T00:00:00.000Z');
    const second = analyzeResearchEdge(samples, simulations, config, '2026-02-01T00:00:00.000Z');
    expect(second).toEqual(first);
    expect(first.status).not.toBe('NOT_ENOUGH_DATA');
    if (first.status !== 'NOT_ENOUGH_DATA') {
      const baseline = first.hypotheses.BASELINE;
      const strict = baseline?.assumptions['STRICT_TRADE_THROUGH'];
      const touch = baseline?.assumptions['TOUCH_WITH_FLOW'];
      expect(strict).toBeDefined();
      expect(touch).toBeDefined();
      expect(strict?.candidateCount).toBe(touch?.candidateCount);
    }
  });
});
