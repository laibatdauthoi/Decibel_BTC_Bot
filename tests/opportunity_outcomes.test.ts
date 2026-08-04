import { describe, expect, it } from 'vitest';

import type { BTC_candlestick } from '../src/decibel_client.js';
import {
  analyzeOpportunityOutcomes,
  calculateCandidateOutcomes,
  loadOpportunityOutcomeConfig,
  type opportunity_outcome_config,
} from '../src/opportunity_outcomes.js';
import type { opportunity_candidate } from '../src/opportunity_scanner.js';

const FIVE_MINUTES_MS = 300_000;
const config: opportunity_outcome_config = {
  makerFeeRate: 0.00011,
  takerFeeRate: 0.00034,
  slippageRate: 0.0005,
};

function makeCandles(count = 15): BTC_candlestick[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: new Date(index * FIVE_MINUTES_MS),
    open: 100,
    high: index === 0 ? 101 : 101 + index,
    low: index === 0 ? 99 : 98,
    close: index === 0 ? 100 : 100 + index,
    volume: 1,
  }));
}

function makeCandidate(
  detectedIndex = 0,
  overrides: Partial<opportunity_candidate> = {},
): opportunity_candidate {
  return {
    direction: 'LONG',
    candidateType: 'SHORT_RANGE_BREAKOUT',
    detectedAtTime: new Date(detectedIndex * FIVE_MINUTES_MS),
    availableAtTime: new Date((detectedIndex + 1) * FIVE_MINUTES_MS),
    score: 85,
    regime: 'RANGE',
    volatilityRatio: 2,
    volumeRatio: 2,
    reasons: [],
    ...overrides,
  };
}

describe('opportunity outcome analyzer', () => {
  it('enters at the next completed open and calculates exact horizon returns and costs', () => {
    const outcome = calculateCandidateOutcomes(makeCandles(13), [makeCandidate()], config)[0];

    expect(outcome?.entryTime).toEqual(new Date(FIVE_MINUTES_MS));
    expect(outcome?.entryPrice).toBe(100);
    expect(outcome?.returns).toEqual({
      1: { gross: 0.01, zeroCost: 0.01, maker: 0.00978, takerWithSlippage: 0.00832 },
      3: { gross: 0.03, zeroCost: 0.03, maker: 0.02978, takerWithSlippage: 0.02832 },
      6: { gross: 0.06, zeroCost: 0.06, maker: 0.05978, takerWithSlippage: 0.05832 },
      12: { gross: 0.12, zeroCost: 0.12, maker: 0.11978, takerWithSlippage: 0.11832 },
    });
    expect(outcome?.maximumFavorableExcursion).toBe(0.13);
    expect(outcome?.maximumAdverseExcursion).toBe(-0.02);
  });

  it('direction-adjusts short returns, MFE, and MAE', () => {
    const outcome = calculateCandidateOutcomes(
      makeCandles(13),
      [makeCandidate(0, { direction: 'SHORT' })],
      config,
    )[0];

    expect(outcome?.returns[3].gross).toBe(-0.03);
    expect(outcome?.maximumFavorableExcursion).toBe(0.02);
    expect(outcome?.maximumAdverseExcursion).toBe(-0.13);
  });

  it('excludes candidates without twelve completed future bars', () => {
    const candles = makeCandles(13);
    const candidates = [makeCandidate(0), makeCandidate(1)];

    const analysis = analyzeOpportunityOutcomes(candles, candidates, config);

    expect(analysis.historicalCandidateCount).toBe(2);
    expect(analysis.analyzedCandidateCount).toBe(1);
    expect(analysis.excludedInsufficientFutureCount).toBe(1);
  });

  it('rejects availability timestamps that could permit look-ahead entry', () => {
    const invalid = makeCandidate(0, { availableAtTime: new Date(0) });

    expect(() => calculateCandidateOutcomes(makeCandles(13), [invalid], config)).toThrow(
      'availability does not match',
    );
  });

  it('groups exact metrics by dimensions and holding horizon', () => {
    const analysis = analyzeOpportunityOutcomes(makeCandles(13), [makeCandidate()], config);
    const oneBar = analysis.groupedResults.holdingHorizon.find((group) => group.horizonBars === 1);
    const typeGroup = analysis.groupedResults.candidateType.find(
      (group) => group.group === 'SHORT_RANGE_BREAKOUT' && group.horizonBars === 3,
    );
    const scoreGroup = analysis.groupedResults.scoreBand.find(
      (group) => group.group === '80-89' && group.horizonBars === 1,
    );

    expect(oneBar?.zeroCost).toEqual({
      sampleCount: 1,
      hitRate: 1,
      averageReturn: 0.01,
      medianReturn: 0.01,
      expectancy: 0.01,
      averageMFE: 0.13,
      averageMAE: -0.02,
    });
    expect(oneBar?.maker.averageReturn).toBe(0.00978);
    expect(oneBar?.takerWithSlippage.averageReturn).toBe(0.00832);
    expect(typeGroup?.zeroCost.sampleCount).toBe(1);
    expect(scoreGroup?.zeroCost.sampleCount).toBe(1);
  });

  it('reports overlapping clusters and fixed cooldown outcome samples', () => {
    const candidates = [makeCandidate(0), makeCandidate(1), makeCandidate(2)];
    const analysis = analyzeOpportunityOutcomes(makeCandles(15), candidates, config);

    expect(analysis.overlappingClusters).toEqual({
      clusterCount: 1,
      overlappingCandidateCount: 2,
      maximumClusterSize: 3,
    });
    expect(
      analysis.cooldownResults.map((result) => [
        result.cooldownMinutes,
        result.selectedCandidateCount,
      ]),
    ).toEqual([
      [5, 3],
      [10, 2],
      [15, 1],
    ]);
  });

  it('loads official Decibel tier-0 fee defaults and configurable slippage', () => {
    expect(loadOpportunityOutcomeConfig({})).toEqual(config);
    expect(loadOpportunityOutcomeConfig({ OUTCOME_SLIPPAGE_RATE: '0.001' }).slippageRate).toBe(
      0.001,
    );
  });
});
