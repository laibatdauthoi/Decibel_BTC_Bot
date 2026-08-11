import { describe, expect, it } from 'vitest';

import {
  AlphaDiscoverySamplingStrideBars,
  BaselineResearchExitPolicy,
  RelativeDriftHorizons,
  UtcSessionDefinitions,
  DiscoveryFeatureDefinitions,
  ShadowDirections,
  Tp3Sl3ResearchExitPolicy,
  buildCachedShadowSamples,
  buildBucketRules,
  buildBTCEthRelativeDriftV1,
  buildBTCEthUtcSessionRelativeDriftV1,
  buildCausalRegimeStrengthPullbackV1,
  buildFrozenDirectionRegimePullbackHoldoutV1,
  buildRegimePullbackEntryV1,
  buildRegimePullbackTp3Sl3V1,
  buildRegimePersistence7d,
  buildTwoWeekConfirmedRegimePullbackV1,
  calculateAlphaFeatures,
  calculateBucketMetrics,
  calculateRelativeDriftMetrics,
  calculateUtcSessionMetrics,
  calculateRegimeStrength,
  calculateStrengthMonotonicity,
  calculatePairRatioSeries,
  classifyRegimePullbackEntry,
  classifyFrozenDirectionHoldout,
  classifyRelativeDriftBias,
  classifyRelativeDriftConclusion,
  classifyRelativeDriftStrength,
  classifyUtcSessionBias,
  classifyUtcSessionRelativeDrift,
  classifyRegimeStrengthBucket,
  classifyRegimeStrengthRelationship,
  classifyTp3Sl3Experiment,
  classifyTwoWeekRegimePullback,
  classifyRegimePersistence,
  classifyRule,
  rankRules,
  sampleEligibleIndices,
  selectRegimeBlockWinner,
  selectFrozenDiscoveryDirection,
  matchesRegimePullbackTurn,
  evaluateResearchPairExit,
  getUtcSessionDominantHitRate,
  getTwoWeekConfirmedRegimeTargets,
  isPersistentUtcSessionBias,
  splitChronologically,
  type bucket_metrics,
  type labeled_shadow_sample,
  type regime_block,
  type regime_strength_bucket,
} from '../src/btc_eth_pair_alpha_discovery.js';
import type { synchronized_pair_candle } from '../src/btc_eth_pair.js';

const candle = (
  index: number,
  btcClose: number,
  ethClose: number,
  btcVolume = index + 1,
  ethVolume = index + 1,
): synchronized_pair_candle => ({
  timestamp: new Date(index * 60_000),
  btc: {
    timestamp: new Date(index * 60_000),
    open: btcClose,
    high: btcClose,
    low: btcClose,
    close: btcClose,
    volume: btcVolume,
  },
  eth: {
    timestamp: new Date(index * 60_000),
    open: ethClose,
    high: ethClose,
    low: ethClose,
    close: ethClose,
    volume: ethVolume,
  },
});
const metrics = (overrides: Partial<bucket_metrics> = {}): bucket_metrics => ({
  sampleCount: 300,
  activatedCount: 300,
  entryFailedCount: 0,
  resolvedCount: 300,
  takeProfitCount: 210,
  stopLossCount: 90,
  marginGuardCount: 0,
  unresolvedCount: 0,
  tpBeforeSlRate: 0.7,
  grossPairPnLSum: 1,
  netPairPnLSum: 0,
  grossProfitFactor: 1.1,
  netProfitFactor: 0.9,
  meanHoldingBars: 2,
  medianHoldingBars: 2,
  meanTotalCosts: 0.1,
  ...overrides,
});

describe('BTC/ETH alpha discovery features', () => {
  it('samples every fifth eligible bar deterministically in chronological order', () => {
    expect(AlphaDiscoverySamplingStrideBars).toBe(5);
    expect(sampleEligibleIndices(42, 20)).toEqual([20, 25, 30, 35, 40]);
  });

  it('keeps the six frozen feature definitions unchanged', () => {
    expect(DiscoveryFeatureDefinitions.single).toEqual([
      'ratioReturn1Direction',
      'ratioReturn3Direction',
      'ratioPersistence3',
      'rangePosition20',
      'candleSignRelationship',
      'volumeParticipation',
    ]);
    expect(DiscoveryFeatureDefinitions.combinations).toEqual([
      ['ratioReturn1Direction', 'volumeParticipation'],
      ['ratioPersistence3', 'volumeParticipation'],
      ['rangePosition20', 'ratioReturn1Direction'],
      ['candleSignRelationship', 'volumeParticipation'],
    ]);
  });

  it('splits chronologically at 70% without shuffling', () => {
    expect(splitChronologically([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual({
      discovery: [0, 1, 2, 3, 4, 5, 6],
      holdout: [7, 8, 9],
      splitIndex: 7,
    });
  });

  it('calculates causal ratio, persistence, range, signs, and prior-volume features', () => {
    const candles = Array.from({ length: 21 }, (_, index) =>
        candle(index, 100, 100 + index, index + 1, index + 1),
      ),
      features = calculateAlphaFeatures(candles, 20)!;
    expect(features).toMatchObject({
      ratioReturn1Direction: 'RATIO_UP',
      ratioReturn3Direction: 'RATIO_3M_UP',
      ratioPersistence3: 'UP_3_OF_3',
      rangePosition20: 'TOP_OR_ABOVE_QUARTER',
      candleSignRelationship: 'HAS_ZERO',
      volumeParticipation: 'BOTH_HIGH',
    });
    candles[20] = candle(20, 100, 120, 1_000_000, 1_000_000);
    expect(calculateAlphaFeatures(candles, 20)?.rangePosition20).toBe('TOP_OR_ABOVE_QUARTER');
  });

  it('classifies two-of-three persistence and opposite candle signs exactly', () => {
    const ratios = [...Array.from({ length: 17 }, () => 1), 1.01, 1, 1.01, 1],
      candles = ratios.map((ratio, index) => candle(index, index === 20 ? 101 : 100, ratio * 100));
    expect(calculateAlphaFeatures(candles, 20)).toMatchObject({
      ratioPersistence3: 'DOWN_2_OF_3',
      candleSignRelationship: 'BTC_UP_ETH_DOWN',
    });
  });
});

describe('BTC/ETH alpha discovery aggregation', () => {
  const sample = (
    split: 'DISCOVERY' | 'HOLDOUT',
    direction: 'LONG_BTC_SHORT_ETH' | 'SHORT_BTC_LONG_ETH',
    exitReason: 'TAKE_PROFIT' | 'STOP_LOSS',
  ): labeled_shadow_sample => ({
    split,
    features: {
      ratioReturn1Direction: 'RATIO_UP',
      ratioReturn3Direction: 'RATIO_3M_UP',
      ratioPersistence3: 'UP_3_OF_3',
      rangePosition20: 'TOP_OR_ABOVE_QUARTER',
      candleSignRelationship: 'BOTH_UP',
      volumeParticipation: 'BOTH_HIGH',
    },
    outcome: {
      signalTimestamp: 1,
      activationTimestamp: 2,
      direction,
      exitReason,
      holdingBars: 3,
      grossPairPnL: exitReason === 'TAKE_PROFIT' ? 2 : -1,
      netPairPnL: exitReason === 'TAKE_PROFIT' ? 1 : -2,
      totalCosts: 1,
    },
  });

  it('evaluates both directions and calculates TP-before-SL exactly', () => {
    const samples = [
      sample('DISCOVERY', 'LONG_BTC_SHORT_ETH', 'TAKE_PROFIT'),
      sample('DISCOVERY', 'LONG_BTC_SHORT_ETH', 'STOP_LOSS'),
      sample('DISCOVERY', 'SHORT_BTC_LONG_ETH', 'TAKE_PROFIT'),
    ];
    expect(calculateBucketMetrics(samples.slice(0, 2)).tpBeforeSlRate).toBe(0.5);
    const directions = new Set(buildBucketRules(samples).map((value) => value.direction));
    expect(directions).toEqual(new Set(['LONG_BTC_SHORT_ETH', 'SHORT_BTC_LONG_ETH']));
  });

  it('evaluates each timestamp-direction once and reuses cached outcomes for aggregation', () => {
    const features = calculateAlphaFeatures(
        Array.from({ length: 21 }, (_, index) => candle(index, 100, 100 + index)),
        20,
      )!,
      rows = [
        { timestamp: 1_200_000, features },
        { timestamp: 1_500_000, features },
      ],
      calls: string[] = [],
      progress: [number, number][] = [],
      cached = buildCachedShadowSamples({
        rows,
        progressEvery: 2,
        onProgress: (completed, total) => progress.push([completed, total]),
        evaluate: (timestamp, direction) => {
          calls.push(`${timestamp}:${direction}`);
          return {
            signalTimestamp: timestamp,
            activationTimestamp: timestamp + 60_000,
            direction,
            exitReason: 'TAKE_PROFIT',
            holdingBars: 1,
            grossPairPnL: 1,
            netPairPnL: 0.9,
            totalCosts: 0.1,
          };
        },
      });
    expect(calls).toHaveLength(rows.length * ShadowDirections.length);
    expect(new Set(calls).size).toBe(calls.length);
    expect(new Set(cached.samples.map((value) => value.outcome.direction))).toEqual(
      new Set(ShadowDirections),
    );
    expect(progress).toEqual([
      [2, 4],
      [4, 4],
    ]);
    const callsBeforeAggregation = calls.length;
    buildBucketRules(cached.samples);
    expect(calls).toHaveLength(callsBeforeAggregation);
  });

  it('keeps outcomes identical when progress reporting is enabled', () => {
    const features = calculateAlphaFeatures(
        Array.from({ length: 21 }, (_, index) => candle(index, 100, 100 + index)),
        20,
      )!,
      rows = [{ timestamp: 1_200_000, features }],
      evaluate = (timestamp: number, direction: (typeof ShadowDirections)[number]) => ({
        signalTimestamp: timestamp,
        activationTimestamp: null,
        direction,
        exitReason: 'ENTRY_FAILED' as const,
        holdingBars: 0,
        grossPairPnL: 0,
        netPairPnL: 0,
        totalCosts: 0,
      });
    expect(buildCachedShadowSamples({ rows, evaluate }).samples).toEqual(
      buildCachedShadowSamples({ rows, evaluate, onProgress: () => undefined }).samples,
    );
  });

  it('ranks only by discovery and enforces minimum samples', () => {
    const strongDiscovery = metrics(),
      weakDiscovery = metrics({ tpBeforeSlRate: 0.6, grossProfitFactor: 5 }),
      holdout = metrics({ resolvedCount: 80, tpBeforeSlRate: 0.1, grossProfitFactor: 0.1 }),
      ranked = rankRules([
        {
          feature: 'A',
          bucket: 'A',
          direction: 'LONG_BTC_SHORT_ETH',
          discovery: strongDiscovery,
          holdout,
        },
        {
          feature: 'B',
          bucket: 'B',
          direction: 'LONG_BTC_SHORT_ETH',
          discovery: weakDiscovery,
          holdout: metrics({ resolvedCount: 80, tpBeforeSlRate: 1 }),
        },
        {
          feature: 'C',
          bucket: 'C',
          direction: 'LONG_BTC_SHORT_ETH',
          discovery: metrics({ resolvedCount: 199 }),
          holdout,
        },
      ]);
    expect(ranked.map((value) => value.feature)).toEqual(['A', 'B']);
  });

  it.each([
    [metrics({ resolvedCount: 80, tpBeforeSlRate: 0.67, grossProfitFactor: 1 }), 'PROMISING'],
    [metrics({ resolvedCount: 80, tpBeforeSlRate: 0.6, grossProfitFactor: 0.5 }), 'INTERESTING'],
    [metrics({ resolvedCount: 80, tpBeforeSlRate: 0.5, grossProfitFactor: 0.8 }), 'INTERESTING'],
    [metrics({ resolvedCount: 79, tpBeforeSlRate: 1, grossProfitFactor: 10 }), 'WEAK'],
  ] as const)('classifies frozen evidence gates', (value, expected) => {
    expect(classifyRule(value)).toBe(expected);
  });
});

describe('BTC/ETH seven-day regime persistence', () => {
  const week = 7 * 24 * 60 * 60 * 1_000,
    features = {
      ratioReturn1Direction: 'RATIO_UP',
      ratioReturn3Direction: 'RATIO_3M_UP',
      ratioPersistence3: 'UP_3_OF_3',
      rangePosition20: 'TOP_OR_ABOVE_QUARTER',
      candleSignRelationship: 'BOTH_UP',
      volumeParticipation: 'BOTH_HIGH',
    } as const,
    outcomeSample = (
      timestamp: number,
      direction: (typeof ShadowDirections)[number],
      takeProfit: boolean,
    ): labeled_shadow_sample => ({
      split: 'DISCOVERY',
      features,
      outcome: {
        signalTimestamp: timestamp,
        activationTimestamp: timestamp + 1,
        direction,
        exitReason: takeProfit ? 'TAKE_PROFIT' : 'STOP_LOSS',
        holdingBars: 1,
        grossPairPnL: takeProfit ? 2 : -1,
        netPairPnL: takeProfit ? 1.5 : -1.5,
        totalCosts: 0.5,
      },
    }),
    blockSamples = (block: number, longWins: number, shortWins: number): labeled_shadow_sample[] =>
      ShadowDirections.flatMap((direction) =>
        Array.from({ length: 100 }, (_, index) =>
          outcomeSample(
            block * week + index * 60_000,
            direction,
            index < (direction === 'LONG_BTC_SHORT_ETH' ? longWins : shortWins),
          ),
        ),
      );

  it('constructs exact non-overlapping seven-day blocks from the first sample', () => {
    const start = 123_000,
      report = buildRegimePersistence7d(
        [outcomeSample(start, 'LONG_BTC_SHORT_ETH', true)],
        start + week * 2 + week / 2,
      );
    expect(
      report.blocks.map(({ startTimestamp, endTimestamp, status }) => ({
        startTimestamp,
        endTimestamp,
        status,
      })),
    ).toEqual([
      { startTimestamp: start, endTimestamp: start + week, status: 'COMPLETE' },
      { startTimestamp: start + week, endTimestamp: start + week * 2, status: 'COMPLETE' },
      { startTimestamp: start + week * 2, endTimestamp: start + week * 3, status: 'PARTIAL' },
    ]);
  });

  it('enforces reliability and GrossPF, TP-rate, then resolved-count winner ordering', () => {
    expect(
      selectRegimeBlockWinner({
        LONG_BTC_SHORT_ETH: metrics({ resolvedCount: 99 }),
        SHORT_BTC_LONG_ETH: metrics(),
      }),
    ).toBe('NO_RELIABLE_WINNER');
    expect(
      selectRegimeBlockWinner({
        LONG_BTC_SHORT_ETH: metrics({ grossProfitFactor: 2 }),
        SHORT_BTC_LONG_ETH: metrics({ grossProfitFactor: 1 }),
      }),
    ).toBe('LONG_BTC_SHORT_ETH');
    expect(
      selectRegimeBlockWinner({
        LONG_BTC_SHORT_ETH: metrics({ grossProfitFactor: 1, tpBeforeSlRate: 0.7 }),
        SHORT_BTC_LONG_ETH: metrics({ grossProfitFactor: 1, tpBeforeSlRate: 0.6 }),
      }),
    ).toBe('LONG_BTC_SHORT_ETH');
    expect(
      selectRegimeBlockWinner({
        LONG_BTC_SHORT_ETH: metrics({ grossProfitFactor: 1, resolvedCount: 101 }),
        SHORT_BTC_LONG_ETH: metrics({ grossProfitFactor: 1, resolvedCount: 100 }),
      }),
    ).toBe('LONG_BTC_SHORT_ETH');
  });

  it('uses only the completed source winner for the next completed target block', () => {
    const samples = [
        ...blockSamples(0, 70, 40),
        ...blockSamples(1, 30, 80),
        ...blockSamples(2, 60, 40),
      ],
      report = buildRegimePersistence7d(samples, week * 3);
    expect(report.causalTransitions).toMatchObject([
      {
        sourceBlockIndex: 0,
        targetBlockIndex: 1,
        predictedDirection: 'LONG_BTC_SHORT_ETH',
        directionPersisted: false,
      },
      {
        sourceBlockIndex: 1,
        targetBlockIndex: 2,
        predictedDirection: 'SHORT_BTC_LONG_ETH',
        directionPersisted: false,
      },
    ]);
    expect(report.summary?.causalRegimeResolvedCount).toBe(200);
    expect(report.summary?.causalRegimeTakeProfitCount).toBe(70);
    const longBlind = report.summary?.blindDirections.LONG_BTC_SHORT_ETH,
      shortBlind = report.summary?.blindDirections.SHORT_BTC_LONG_ETH;
    expect(longBlind).toBeDefined();
    expect(shortBlind).toBeDefined();
    if (!longBlind || !shortBlind) throw new Error('Expected both blind-direction aggregates');
    expect(longBlind.resolvedCount).toBe(200);
    expect(shortBlind.resolvedCount).toBe(200);
  });

  it('classifies frozen persistence thresholds exactly without replaying outcomes', () => {
    expect(
      classifyRegimePersistence({
        predictionCount: 5,
        directionPersistenceRate: 0.7,
        causalRegimeGrossProfitFactor: 1,
      }),
    ).toBe('REGIME_PERSISTENCE_STRONG');
    expect(
      classifyRegimePersistence({
        predictionCount: 5,
        directionPersistenceRate: 0.6,
        causalRegimeGrossProfitFactor: 0.5,
      }),
    ).toBe('REGIME_PERSISTENCE_INTERESTING');
    expect(
      classifyRegimePersistence({
        predictionCount: 4,
        directionPersistenceRate: 1,
        causalRegimeGrossProfitFactor: 10,
      }),
    ).toBe('NO_USEFUL_7D_REGIME_PERSISTENCE');
  });
});

describe('BTC/ETH weekly-regime pullback timing', () => {
  it('calculates ETH/BTC ratios and natural-log one-minute returns exactly', () => {
    const result = calculatePairRatioSeries([candle(0, 100, 50), candle(1, 100, 55)]);
    expect(result.ratios).toEqual([0.5, 0.55]);
    expect(result.ratioReturns1m).toEqual([null, Math.log(0.55 / 0.5)]);
  });

  it('requires exact directional signs and rejects zero returns', () => {
    expect(matchesRegimePullbackTurn('SHORT_BTC_LONG_ETH', [-0.1, -0.2, 0.1])).toBe(true);
    expect(matchesRegimePullbackTurn('LONG_BTC_SHORT_ETH', [0.1, 0.2, -0.1])).toBe(true);
    expect(matchesRegimePullbackTurn('SHORT_BTC_LONG_ETH', [-0.1, 0, 0.1])).toBe(false);
    expect(matchesRegimePullbackTurn('LONG_BTC_SHORT_ETH', [0.1, 0.2, 0])).toBe(false);
  });

  it('joins the previous-block direction to cached same-timestamp outcomes', () => {
    const week = 7 * 24 * 60 * 60 * 1_000,
      features = {
        ratioReturn1Direction: 'RATIO_UP',
        ratioReturn3Direction: 'RATIO_3M_UP',
        ratioPersistence3: 'UP_3_OF_3',
        rangePosition20: 'TOP_OR_ABOVE_QUARTER',
        candleSignRelationship: 'BOTH_UP',
        volumeParticipation: 'BOTH_HIGH',
      } as const,
      makeSample = (
        timestamp: number,
        direction: (typeof ShadowDirections)[number],
        win: boolean,
      ): labeled_shadow_sample => ({
        split: 'DISCOVERY',
        features,
        outcome: {
          signalTimestamp: timestamp,
          activationTimestamp: timestamp + 1,
          direction,
          exitReason: win ? 'TAKE_PROFIT' : 'STOP_LOSS',
          holdingBars: 2,
          grossPairPnL: win ? 2 : -1,
          netPairPnL: win ? 1.5 : -1.5,
          totalCosts: 0.5,
        },
      }),
      source = ShadowDirections.flatMap((direction) =>
        Array.from({ length: 100 }, (_, index) =>
          makeSample(
            index * 60_000,
            direction,
            index < (direction === 'LONG_BTC_SHORT_ETH' ? 70 : 40),
          ),
        ),
      ),
      signalTimestamp = week + 180_000,
      target = [
        makeSample(signalTimestamp, 'LONG_BTC_SHORT_ETH', true),
        makeSample(signalTimestamp, 'SHORT_BTC_LONG_ETH', false),
      ],
      samples = [...source, ...target],
      regime = buildRegimePersistence7d(samples, week * 2),
      candles = [
        candle(0, 100, 100),
        candle(1, 100, 101),
        candle(2, 100, 102),
        candle(3, 100, 101),
      ].map((value, index) => ({
        ...value,
        timestamp: new Date(signalTimestamp - (3 - index) * 60_000),
      })),
      report = buildRegimePullbackEntryV1({ candles, samples, regime });
    expect(report.eligibleRegimeSampledTimestampCount).toBe(1);
    expect(report.signalCount).toBe(1);
    expect(report.signalRate).toBe(1);
    expect(report.signals[0]).toMatchObject({
      allowedDirection: 'LONG_BTC_SHORT_ETH',
      outcome: 'TAKE_PROFIT',
      oppositeDirectionOutcome: { direction: 'SHORT_BTC_LONG_ETH', exitReason: 'STOP_LOSS' },
    });
    expect(report.aggregate).toMatchObject({ resolvedCount: 1, takeProfitCount: 1 });
    expect(report.byAllowedDirection.LONG_BTC_SHORT_ETH).toMatchObject({
      sampleCount: 1,
      resolvedCount: 1,
    });
    expect(report.regimeOnlyComparison.regimeOnlyResolvedCount).toBe(1);
    expect(report.oppositeDirectionComparison.oppositeDirectionResolvedCount).toBe(1);
    const gappedCandles = candles.map((value, index) =>
      index === 2 ? { ...value, timestamp: new Date(value.timestamp.getTime() - 60_000) } : value,
    );
    expect(
      buildRegimePullbackEntryV1({ candles: gappedCandles, samples, regime }).signalCount,
    ).toBe(0);
  });

  it('produces no signal without a reliable completed source block', () => {
    const samples: labeled_shadow_sample[] = [],
      regime = buildRegimePersistence7d(samples, 0);
    expect(
      buildRegimePullbackEntryV1({
        candles: [candle(0, 100, 100), candle(2, 100, 101), candle(3, 100, 100)],
        samples,
        regime,
      }).signalCount,
    ).toBe(0);
  });

  it('classifies the frozen timing evidence gates exactly', () => {
    expect(
      classifyRegimePullbackEntry({
        resolvedCount: 100,
        tpBeforeSlRate: 0.67,
        grossProfitFactor: 1,
        oppositeGrossProfitFactor: 0.9,
        regimeOnlyGrossProfitFactor: 1.1,
      }),
    ).toBe('PULLBACK_TIMING_PROMISING');
    expect(
      classifyRegimePullbackEntry({
        resolvedCount: 100,
        tpBeforeSlRate: 0.6,
        grossProfitFactor: 0.9,
        oppositeGrossProfitFactor: 1,
        regimeOnlyGrossProfitFactor: 0.8,
      }),
    ).toBe('PULLBACK_TIMING_INTERESTING');
    expect(
      classifyRegimePullbackEntry({
        resolvedCount: 99,
        tpBeforeSlRate: 1,
        grossProfitFactor: 10,
        oppositeGrossProfitFactor: 0,
        regimeOnlyGrossProfitFactor: 0,
      }),
    ).toBe('NO_USEFUL_PULLBACK_TIMING_EDGE');
  });
});

describe('BTC/ETH two-week confirmed regime pullback', () => {
  const week = 7 * 24 * 60 * 60 * 1_000,
    makeBlock = (
      blockIndex: number,
      winner: regime_block['winner'],
      status: regime_block['status'] = 'COMPLETE',
    ): regime_block => ({
      blockIndex,
      startTimestamp: blockIndex * week,
      endTimestamp: (blockIndex + 1) * week,
      status,
      directions: {
        LONG_BTC_SHORT_ETH: metrics(),
        SHORT_BTC_LONG_ETH: metrics(),
      },
      winner,
      winnerGrossPF: winner === 'NO_RELIABLE_WINNER' ? null : 1,
      winnerTPRate: winner === 'NO_RELIABLE_WINNER' ? null : 0.6,
    });

  it('uses exactly the previous two completed winners for confirmation', () => {
    expect(
      getTwoWeekConfirmedRegimeTargets([
        makeBlock(0, 'LONG_BTC_SHORT_ETH'),
        makeBlock(1, 'LONG_BTC_SHORT_ETH'),
        makeBlock(2, 'SHORT_BTC_LONG_ETH'),
      ])[0],
    ).toMatchObject({ confirmedRegime: true, allowedDirection: 'LONG_BTC_SHORT_ETH' });
    expect(
      getTwoWeekConfirmedRegimeTargets([
        makeBlock(0, 'SHORT_BTC_LONG_ETH'),
        makeBlock(1, 'SHORT_BTC_LONG_ETH'),
        makeBlock(2, 'LONG_BTC_SHORT_ETH'),
      ])[0],
    ).toMatchObject({ confirmedRegime: true, allowedDirection: 'SHORT_BTC_LONG_ETH' });
    expect(
      getTwoWeekConfirmedRegimeTargets([
        makeBlock(0, 'LONG_BTC_SHORT_ETH'),
        makeBlock(1, 'SHORT_BTC_LONG_ETH'),
        makeBlock(2, 'SHORT_BTC_LONG_ETH'),
      ])[0],
    ).toMatchObject({ confirmedRegime: false, allowedDirection: null });
  });

  it('rejects unreliable or partial source blocks and never uses a partial target', () => {
    expect(
      getTwoWeekConfirmedRegimeTargets([
        makeBlock(0, 'NO_RELIABLE_WINNER'),
        makeBlock(1, 'LONG_BTC_SHORT_ETH'),
        makeBlock(2, 'LONG_BTC_SHORT_ETH'),
      ])[0]?.confirmedRegime,
    ).toBe(false);
    expect(
      getTwoWeekConfirmedRegimeTargets([
        makeBlock(0, 'LONG_BTC_SHORT_ETH', 'PARTIAL'),
        makeBlock(1, 'LONG_BTC_SHORT_ETH'),
        makeBlock(2, 'LONG_BTC_SHORT_ETH'),
      ])[0]?.confirmedRegime,
    ).toBe(false);
    expect(
      getTwoWeekConfirmedRegimeTargets([
        makeBlock(0, 'LONG_BTC_SHORT_ETH'),
        makeBlock(1, 'LONG_BTC_SHORT_ETH'),
        makeBlock(2, 'LONG_BTC_SHORT_ETH', 'PARTIAL'),
      ]),
    ).toEqual([]);
  });

  it('reuses cached allowed and opposite outcomes and reports exact comparisons', () => {
    const features = {
        ratioReturn1Direction: 'RATIO_UP',
        ratioReturn3Direction: 'RATIO_3M_UP',
        ratioPersistence3: 'UP_3_OF_3',
        rangePosition20: 'TOP_OR_ABOVE_QUARTER',
        candleSignRelationship: 'BOTH_UP',
        volumeParticipation: 'BOTH_HIGH',
      } as const,
      makeSample = (
        timestamp: number,
        direction: (typeof ShadowDirections)[number],
        win: boolean,
      ): labeled_shadow_sample => ({
        split: 'DISCOVERY',
        features,
        outcome: {
          signalTimestamp: timestamp,
          activationTimestamp: timestamp + 1,
          direction,
          exitReason: win ? 'TAKE_PROFIT' : 'STOP_LOSS',
          holdingBars: 2,
          grossPairPnL: win ? 2 : -1,
          netPairPnL: win ? 1.5 : -1.5,
          totalCosts: 0.5,
        },
      }),
      sourceBlock = (block: number) =>
        ShadowDirections.flatMap((direction) =>
          Array.from({ length: 100 }, (_, index) =>
            makeSample(
              block * week + index * 60_000,
              direction,
              index < (direction === 'LONG_BTC_SHORT_ETH' ? 70 : 40),
            ),
          ),
        ),
      signalTimestamp = week * 2 + 180_000,
      target = [
        makeSample(signalTimestamp, 'LONG_BTC_SHORT_ETH', true),
        makeSample(signalTimestamp, 'SHORT_BTC_LONG_ETH', false),
      ],
      samples = [...sourceBlock(0), ...sourceBlock(1), ...target],
      regime = buildRegimePersistence7d(samples, week * 3),
      candles = [100, 101, 102, 101].map((ethClose, index) => ({
        ...candle(index, 100, ethClose),
        timestamp: new Date(signalTimestamp - (3 - index) * 60_000),
      })),
      ratioSeries = calculatePairRatioSeries(candles),
      oneWeekPullback = buildRegimePullbackEntryV1({
        candles,
        samples,
        regime,
        ratioSeries,
      }),
      report = buildTwoWeekConfirmedRegimePullbackV1({
        candles,
        samples,
        regime,
        oneWeekPullback,
        ratioSeries,
      });
    expect(report).toMatchObject({
      totalTargetBlocksEvaluated: 1,
      confirmedRegimeBlockCount: 1,
      noConfirmedRegimeBlockCount: 0,
      eligibleConfirmedRegimeSampledTimestampCount: 1,
      signalCount: 1,
      signalRate: 1,
      aggregate: { resolvedCount: 1, takeProfitCount: 1 },
      oppositeDirectionComparison: { oppositeDirectionResolvedCount: 1 },
      confirmedRegimeOnlyComparison: { confirmedRegimeOnlyResolvedCount: 1 },
    });
    expect(report.signals[0]).toMatchObject({
      allowedDirection: 'LONG_BTC_SHORT_ETH',
      outcome: 'TAKE_PROFIT',
      oppositeDirectionOutcome: { direction: 'SHORT_BTC_LONG_ETH', exitReason: 'STOP_LOSS' },
    });
    expect(report.byAllowedDirection.LONG_BTC_SHORT_ETH.resolvedCount).toBe(1);
    expect(report.byTargetBlock[0]).toMatchObject({
      targetBlockIndex: 2,
      sourceBlockIndexMinus2: 0,
      sourceBlockIndexMinus1: 1,
      confirmedRegime: true,
      signalCount: 1,
    });
    expect(report.oneWeekPullbackComparison.oneWeekPullbackResolvedCount).toBe(
      oneWeekPullback.aggregate.resolvedCount,
    );
  });

  it('classifies the frozen two-week evidence gates exactly', () => {
    expect(
      classifyTwoWeekRegimePullback({
        resolvedCount: 100,
        tpBeforeSlRate: 0.67,
        grossProfitFactor: 1,
        oppositeGrossProfitFactor: 0.9,
        oneWeekGrossProfitFactor: 1.1,
      }),
    ).toBe('TWO_WEEK_REGIME_PULLBACK_PROMISING');
    expect(
      classifyTwoWeekRegimePullback({
        resolvedCount: 100,
        tpBeforeSlRate: 0.6,
        grossProfitFactor: 0.9,
        oppositeGrossProfitFactor: 1,
        oneWeekGrossProfitFactor: 0.8,
      }),
    ).toBe('TWO_WEEK_REGIME_PULLBACK_INTERESTING');
    expect(
      classifyTwoWeekRegimePullback({
        resolvedCount: 99,
        tpBeforeSlRate: 1,
        grossProfitFactor: 10,
        oppositeGrossProfitFactor: 0,
        oneWeekGrossProfitFactor: 0,
      }),
    ).toBe('NO_USEFUL_TWO_WEEK_REGIME_PULLBACK_EDGE');
  });
});

describe('BTC/ETH frozen-direction holdout study', () => {
  it('selects from discovery metrics only using PF, TP rate, resolved count, and minimum samples', () => {
    expect(
      selectFrozenDiscoveryDirection({
        LONG_BTC_SHORT_ETH: metrics({ grossProfitFactor: 1 }),
        SHORT_BTC_LONG_ETH: metrics({ grossProfitFactor: 2 }),
      }),
    ).toMatchObject({ direction: 'SHORT_BTC_LONG_ETH' });
    expect(
      selectFrozenDiscoveryDirection({
        LONG_BTC_SHORT_ETH: metrics({ grossProfitFactor: 1, tpBeforeSlRate: 0.7 }),
        SHORT_BTC_LONG_ETH: metrics({ grossProfitFactor: 1, tpBeforeSlRate: 0.6 }),
      }),
    ).toMatchObject({ direction: 'LONG_BTC_SHORT_ETH' });
    expect(
      selectFrozenDiscoveryDirection({
        LONG_BTC_SHORT_ETH: metrics({ grossProfitFactor: 1, resolvedCount: 201 }),
        SHORT_BTC_LONG_ETH: metrics({ grossProfitFactor: 1, resolvedCount: 200 }),
      }),
    ).toMatchObject({ direction: 'LONG_BTC_SHORT_ETH' });
    expect(
      selectFrozenDiscoveryDirection({
        LONG_BTC_SHORT_ETH: metrics({ resolvedCount: 199 }),
        SHORT_BTC_LONG_ETH: metrics(),
      }),
    ).toMatchObject({ direction: null });
  });

  it('freezes discovery preference and filters cached holdout outcomes by one-week regime', () => {
    const week = 7 * 24 * 60 * 60 * 1_000,
      features = {
        ratioReturn1Direction: 'RATIO_UP',
        ratioReturn3Direction: 'RATIO_3M_UP',
        ratioPersistence3: 'UP_3_OF_3',
        rangePosition20: 'TOP_OR_ABOVE_QUARTER',
        candleSignRelationship: 'BOTH_UP',
        volumeParticipation: 'BOTH_HIGH',
      } as const,
      makeSample = (
        timestamp: number,
        direction: (typeof ShadowDirections)[number],
        win: boolean,
        split: 'DISCOVERY' | 'HOLDOUT',
      ): labeled_shadow_sample => ({
        split,
        features,
        outcome: {
          signalTimestamp: timestamp,
          activationTimestamp: timestamp + 1,
          direction,
          exitReason: win ? 'TAKE_PROFIT' : 'STOP_LOSS',
          holdingBars: 2,
          grossPairPnL: win ? 2 : -1,
          netPairPnL: win ? 1.5 : -1.5,
          totalCosts: 0.5,
        },
      }),
      discovery = ShadowDirections.flatMap((direction) =>
        Array.from({ length: 200 }, (_, index) =>
          makeSample(
            index * 60_000,
            direction,
            index < (direction === 'SHORT_BTC_LONG_ETH' ? 140 : 100),
            'DISCOVERY',
          ),
        ),
      ),
      holdoutTimestamp = week + 180_000,
      holdout = [
        makeSample(holdoutTimestamp, 'LONG_BTC_SHORT_ETH', false, 'HOLDOUT'),
        makeSample(holdoutTimestamp, 'SHORT_BTC_LONG_ETH', true, 'HOLDOUT'),
      ],
      samples = [...discovery, ...holdout],
      regime = buildRegimePersistence7d(samples, week * 2),
      oneWeekPullback = buildRegimePullbackEntryV1({ candles: [], samples: [], regime }),
      makeSignal = (sample: labeled_shadow_sample) => ({
        signalTimestamp: sample.outcome.signalTimestamp,
        targetBlockIndex: sample.split === 'HOLDOUT' ? 1 : 0,
        sourceBlockIndex: sample.split === 'HOLDOUT' ? 0 : -1,
        allowedDirection: sample.outcome.direction,
        sourceWinnerGrossPF: 1,
        sourceWinnerTPRate: 0.6,
        ratioReturnTMinus2: -0.1,
        ratioReturnTMinus1: -0.1,
        ratioReturnT: 0.1,
        ratioAtSignal: 1,
        outcome: sample.outcome.exitReason,
        holdingBars: sample.outcome.holdingBars,
        grossPairPnL: sample.outcome.grossPairPnL,
        netPairPnL: sample.outcome.netPairPnL,
        totalCosts: sample.outcome.totalCosts,
        oppositeDirectionOutcome: sample.outcome,
      });
    oneWeekPullback.signals.push(...discovery.map(makeSignal), makeSignal(holdout[1]!));
    const report = buildFrozenDirectionRegimePullbackHoldoutV1({
      samples,
      regime,
      oneWeekPullback,
      splitTimestamp: week,
    });
    expect(report.frozenPreferredDirection).toBe('SHORT_BTC_LONG_ETH');
    expect(report.discoveryDirectionMetrics).toMatchObject({
      LONG_BTC_SHORT_ETH: { resolvedCount: 200 },
      SHORT_BTC_LONG_ETH: { resolvedCount: 200 },
    });
    expect(report.holdoutSignalFrequency).toMatchObject({
      holdoutSampledTimestampCount: 1,
      holdoutReliableRegimeTimestampCount: 1,
      holdoutPullbackSignalCountBeforeDirectionFilter: 1,
      holdoutAcceptedSignalCount: 1,
      holdoutDirectionRejectedSignalCount: 0,
      acceptedSignalRate: 1,
    });
    expect(report.holdoutAggregate).toMatchObject({ resolvedCount: 1, takeProfitCount: 1 });
    expect(report.oppositeDirectionComparison).toMatchObject({
      oppositeResolvedCount: 1,
      oppositeTPBeforeSLRate: 0,
    });
    expect(report.frozenDirectionRegimeOnlyComparison).toMatchObject({
      frozenDirectionRegimeOnlyResolvedCount: 1,
    });
    expect(report.byHoldoutTargetBlock[0]).toMatchObject({
      targetBlockIndex: 1,
      allowedRegimeDirection: 'SHORT_BTC_LONG_ETH',
      matchesFrozenPreferredDirection: true,
      acceptedSignalCount: 1,
    });
  });

  it('classifies frozen holdout evidence exactly', () => {
    expect(
      classifyFrozenDirectionHoldout({
        resolvedCount: 100,
        tpBeforeSlRate: 0.67,
        grossProfitFactor: 1,
        oppositeGrossProfitFactor: 0.9,
        unfilteredGrossProfitFactor: 0.9,
      }),
    ).toBe('FROZEN_DIRECTION_HOLDOUT_PROMISING');
    expect(
      classifyFrozenDirectionHoldout({
        resolvedCount: 100,
        tpBeforeSlRate: 0.6,
        grossProfitFactor: 0.9,
        oppositeGrossProfitFactor: 1,
        unfilteredGrossProfitFactor: 0.8,
      }),
    ).toBe('FROZEN_DIRECTION_HOLDOUT_INTERESTING');
    expect(
      classifyFrozenDirectionHoldout({
        resolvedCount: 99,
        tpBeforeSlRate: 1,
        grossProfitFactor: 10,
        oppositeGrossProfitFactor: 0,
        unfilteredGrossProfitFactor: 0,
      }),
    ).toBe('NO_USEFUL_FROZEN_DIRECTION_HOLDOUT_EDGE');
  });
});

describe('BTC/ETH causal weekly regime-strength diagnostic', () => {
  const strengthMetrics = (
    values: Partial<Record<regime_strength_bucket, Partial<bucket_metrics>>> = {},
  ) =>
    Object.fromEntries(
      [
        'STRENGTH_0_TO_0_10',
        'STRENGTH_0_10_TO_0_20',
        'STRENGTH_0_20_TO_0_30',
        'STRENGTH_0_30_PLUS',
      ].map((bucket) => [
        bucket,
        {
          ...calculateBucketMetrics([]),
          ...values[bucket as regime_strength_bucket],
        },
      ]),
    ) as Record<regime_strength_bucket, bucket_metrics>;

  it('uses winner GrossPF minus loser GrossPF from the source block only', () => {
    const block: regime_block = {
      blockIndex: 0,
      startTimestamp: 0,
      endTimestamp: 1,
      status: 'COMPLETE',
      directions: {
        LONG_BTC_SHORT_ETH: metrics({ grossProfitFactor: 1.4 }),
        SHORT_BTC_LONG_ETH: metrics({ grossProfitFactor: 1.1 }),
      },
      winner: 'LONG_BTC_SHORT_ETH',
      winnerGrossPF: 1.4,
      winnerTPRate: 0.7,
    };
    expect(calculateRegimeStrength(block)).toEqual({
      winnerGrossPF: 1.4,
      loserGrossPF: 1.1,
      regimeStrength: 0.2999999999999998,
    });
  });

  it('assigns every frozen strength boundary exactly', () => {
    expect(classifyRegimeStrengthBucket(0)).toBe('STRENGTH_0_TO_0_10');
    expect(classifyRegimeStrengthBucket(0.099_999)).toBe('STRENGTH_0_TO_0_10');
    expect(classifyRegimeStrengthBucket(0.1)).toBe('STRENGTH_0_10_TO_0_20');
    expect(classifyRegimeStrengthBucket(0.2)).toBe('STRENGTH_0_20_TO_0_30');
    expect(classifyRegimeStrengthBucket(0.3)).toBe('STRENGTH_0_30_PLUS');
  });

  it('calculates monotonicity only across buckets with at least 100 resolved samples', () => {
    expect(
      calculateStrengthMonotonicity(
        strengthMetrics({
          STRENGTH_0_TO_0_10: {
            resolvedCount: 100,
            grossProfitFactor: 0.5,
            tpBeforeSlRate: 0.5,
          },
          STRENGTH_0_10_TO_0_20: {
            resolvedCount: 99,
            grossProfitFactor: 10,
            tpBeforeSlRate: 1,
          },
          STRENGTH_0_20_TO_0_30: {
            resolvedCount: 100,
            grossProfitFactor: 0.8,
            tpBeforeSlRate: 0.6,
          },
        }),
      ),
    ).toEqual({
      eligibleBucketCount: 2,
      grossPFNonDecreasing: true,
      tpRateNonDecreasing: true,
    });
  });

  it('aggregates existing cached pullback samples by strength, split, direction, and target', () => {
    const week = 7 * 24 * 60 * 60 * 1_000,
      features = {
        ratioReturn1Direction: 'RATIO_UP',
        ratioReturn3Direction: 'RATIO_3M_UP',
        ratioPersistence3: 'UP_3_OF_3',
        rangePosition20: 'TOP_OR_ABOVE_QUARTER',
        candleSignRelationship: 'BOTH_UP',
        volumeParticipation: 'BOTH_HIGH',
      } as const,
      makeSample = (
        timestamp: number,
        direction: (typeof ShadowDirections)[number],
        win: boolean,
        split: 'DISCOVERY' | 'HOLDOUT',
      ): labeled_shadow_sample => ({
        split,
        features,
        outcome: {
          signalTimestamp: timestamp,
          activationTimestamp: timestamp + 1,
          direction,
          exitReason: win ? 'TAKE_PROFIT' : 'STOP_LOSS',
          holdingBars: 2,
          grossPairPnL: win ? 2 : -1,
          netPairPnL: win ? 1.5 : -1.5,
          totalCosts: 0.5,
        },
      }),
      source = ShadowDirections.flatMap((direction) =>
        Array.from({ length: 100 }, (_, index) =>
          makeSample(
            index * 60_000,
            direction,
            index < (direction === 'SHORT_BTC_LONG_ETH' ? 70 : 40),
            'DISCOVERY',
          ),
        ),
      ),
      discoveryTimestamp = week + 60_000,
      holdoutTimestamp = week + 120_000,
      target = [
        makeSample(discoveryTimestamp, 'SHORT_BTC_LONG_ETH', true, 'DISCOVERY'),
        makeSample(discoveryTimestamp, 'LONG_BTC_SHORT_ETH', false, 'DISCOVERY'),
        makeSample(holdoutTimestamp, 'SHORT_BTC_LONG_ETH', false, 'HOLDOUT'),
        makeSample(holdoutTimestamp, 'LONG_BTC_SHORT_ETH', true, 'HOLDOUT'),
      ],
      samples = [...source, ...target],
      regime = buildRegimePersistence7d(samples, week * 2),
      oneWeekPullback = buildRegimePullbackEntryV1({ candles: [], samples: [], regime }),
      signal = (timestamp: number, split: 'DISCOVERY' | 'HOLDOUT') => {
        const sample = target.find(
          (value) =>
            value.outcome.signalTimestamp === timestamp &&
            value.outcome.direction === 'SHORT_BTC_LONG_ETH',
        )!;
        return {
          signalTimestamp: timestamp,
          targetBlockIndex: 1,
          sourceBlockIndex: 0,
          allowedDirection: 'SHORT_BTC_LONG_ETH' as const,
          sourceWinnerGrossPF: 1,
          sourceWinnerTPRate: 0.6,
          ratioReturnTMinus2: -0.1,
          ratioReturnTMinus1: -0.1,
          ratioReturnT: 0.1,
          ratioAtSignal: 1,
          outcome: sample.outcome.exitReason,
          holdingBars: sample.outcome.holdingBars,
          grossPairPnL: sample.outcome.grossPairPnL,
          netPairPnL: sample.outcome.netPairPnL,
          totalCosts: sample.outcome.totalCosts,
          oppositeDirectionOutcome: sample.outcome,
          split,
        };
      };
    oneWeekPullback.signals.push(
      signal(discoveryTimestamp, 'DISCOVERY'),
      signal(holdoutTimestamp, 'HOLDOUT'),
    );
    const report = buildCausalRegimeStrengthPullbackV1({ samples, regime, oneWeekPullback }),
      bucket = report.byTargetBlock[0]!.regimeStrengthBucket;
    expect(report.overallByStrengthBucket[bucket]).toMatchObject({
      sourceBlockCount: 1,
      targetBlockCount: 1,
      signalCount: 2,
      resolvedCount: 2,
    });
    expect(report.discoveryByStrengthBucket[bucket].resolvedCount).toBe(1);
    expect(report.holdoutByStrengthBucket[bucket].resolvedCount).toBe(1);
    const bucketDirectionMetrics = report.byStrengthBucketAndDirection[bucket];
    expect(bucketDirectionMetrics).toBeDefined();
    if (!bucketDirectionMetrics) throw new Error('Expected strength-bucket direction metrics');
    expect(bucketDirectionMetrics.SHORT_BTC_LONG_ETH.resolvedCount).toBe(2);
    expect(report.byTargetBlock[0]).toMatchObject({
      sourceBlockIndex: 0,
      targetBlockIndex: 1,
      sourceWinnerDirection: 'SHORT_BTC_LONG_ETH',
      signalCount: 2,
    });
  });

  it('classifies the frozen relationship thresholds exactly', () => {
    const overall = strengthMetrics({
        STRENGTH_0_TO_0_10: { resolvedCount: 100, grossProfitFactor: 0.5 },
        STRENGTH_0_10_TO_0_20: { resolvedCount: 100, grossProfitFactor: 0.8 },
        STRENGTH_0_20_TO_0_30: {
          resolvedCount: 100,
          grossProfitFactor: 1,
          tpBeforeSlRate: 0.6,
        },
      }),
      holdout = strengthMetrics({
        STRENGTH_0_20_TO_0_30: { resolvedCount: 80, grossProfitFactor: 1 },
      });
    expect(
      classifyRegimeStrengthRelationship({
        overallByStrengthBucket: overall,
        holdoutByStrengthBucket: holdout,
        monotonicity: calculateStrengthMonotonicity(overall),
      }),
    ).toBe('REGIME_STRENGTH_RELATIONSHIP_PROMISING');
    expect(
      classifyRegimeStrengthRelationship({
        overallByStrengthBucket: strengthMetrics(),
        holdoutByStrengthBucket: strengthMetrics(),
        monotonicity: calculateStrengthMonotonicity(strengthMetrics()),
      }),
    ).toBe('NO_USEFUL_REGIME_STRENGTH_RELATIONSHIP');
  });
});

describe('BTC/ETH relative drift diagnostic', () => {
  it('freezes the exact four bar horizons', () => {
    expect(RelativeDriftHorizons).toEqual([
      { horizonDays: 1, horizonBars: 1_440 },
      { horizonDays: 3, horizonBars: 4_320 },
      { horizonDays: 7, horizonBars: 10_080 },
      { horizonDays: 14, horizonBars: 20_160 },
    ]);
  });

  it('uses BTC close divided by ETH close and exact forward relative returns', () => {
    const candles = Array.from({ length: 1_441 }, (_, index) =>
        candle(index, index === 1_440 ? 120 : 100, 50),
      ),
      report = buildBTCEthRelativeDriftV1(candles),
      oneDay = report.horizons.find((value) => value.horizonDays === 1)!;
    expect(report.fullPeriod).toMatchObject({
      firstBTCETHRatio: 2,
      lastBTCETHRatio: 2.4,
    });
    expect(report.fullPeriod?.fullPeriodRelativeReturn).toBeCloseTo(0.2);
    expect(oneDay.overall).toMatchObject({
      windowCount: 1,
      positiveCount: 1,
    });
    expect(oneDay.overall.meanRelativeReturn).toBeCloseTo(0.2);
  });

  it('uses non-overlapping primary windows and isolates cross-boundary prices', () => {
    const candles = Array.from({ length: 10_081 }, (_, index) =>
        candle(index, 100 + index / 10_000, 50),
      ),
      report = buildBTCEthRelativeDriftV1(candles),
      oneDay = report.horizons.find((value) => value.horizonDays === 1)!;
    expect(oneDay.overall.windowCount).toBe(7);
    expect(oneDay.discovery.windowCount).toBe(4);
    expect(oneDay.crossBoundaryWindowCount).toBe(1);
    expect(oneDay.holdout.windowCount).toBe(2);
    expect(
      oneDay.discovery.windowCount + oneDay.crossBoundaryWindowCount + oneDay.holdout.windowCount,
    ).toBe(oneDay.overall.windowCount);
  });

  it('counts zero returns in rates and calculates median and compounding exactly', () => {
    expect(calculateRelativeDriftMetrics([0.1, 0, -0.05])).toEqual({
      windowCount: 3,
      positiveCount: 1,
      negativeCount: 1,
      zeroCount: 1,
      positiveRate: 1 / 3,
      negativeRate: 1 / 3,
      meanRelativeReturn: (0.1 - 0.05) / 3,
      medianRelativeReturn: 0,
      minRelativeReturn: -0.05,
      maxRelativeReturn: 0.1,
      cumulativeCompoundedRelativeReturn: 1.1 * 1 * 0.95 - 1,
    });
  });

  it('classifies directional consistency, holdout strength, and final conclusions exactly', () => {
    const strong = calculateRelativeDriftMetrics([0.1, 0.1, 0.1, 0.1, -0.1]),
      moderate = calculateRelativeDriftMetrics([0.1, 0.1, 0.1, -0.1, -0.1]),
      negative = calculateRelativeDriftMetrics([-0.1, -0.1, -0.1, 0.1, 0.1]);
    expect(classifyRelativeDriftBias(strong)).toBe('LONG_BTC_SHORT_ETH');
    expect(classifyRelativeDriftBias(negative)).toBe('SHORT_BTC_LONG_ETH');
    expect(classifyRelativeDriftBias(calculateRelativeDriftMetrics([0]))).toBe('NEUTRAL');
    expect(classifyRelativeDriftStrength(strong)).toBe('STRONG_LONG_BTC_SHORT_ETH_BIAS');
    expect(classifyRelativeDriftStrength(moderate)).toBe('MODERATE_LONG_BTC_SHORT_ETH_BIAS');
    expect(
      classifyRelativeDriftConclusion([
        { horizonDays: 7, holdout: moderate, directionConsistent: true },
        { horizonDays: 14, holdout: moderate, directionConsistent: true },
      ]),
    ).toBe('PERSISTENT_LONG_BTC_SHORT_ETH_DRIFT');
    expect(
      classifyRelativeDriftConclusion([
        { horizonDays: 7, holdout: moderate, directionConsistent: true },
        { horizonDays: 14, holdout: negative, directionConsistent: false },
      ]),
    ).toBe('PARTIAL_LONG_BTC_SHORT_ETH_DRIFT');
    expect(
      classifyRelativeDriftConclusion([
        { horizonDays: 7, holdout: negative, directionConsistent: false },
        { horizonDays: 14, holdout: negative, directionConsistent: false },
      ]),
    ).toBe('NO_PERSISTENT_LONG_BTC_SHORT_ETH_DRIFT');
  });
});

describe('BTC/ETH regime-pullback TP3C/SL3C experiment', () => {
  it('keeps baseline TP1.5C/SL3C and changes only experiment TP to 3C', () => {
    expect(BaselineResearchExitPolicy).toEqual({
      takeProfitCostMultiplier: 1.5,
      stopLossCostMultiplier: 3,
    });
    expect(Tp3Sl3ResearchExitPolicy).toEqual({
      takeProfitCostMultiplier: 3,
      stopLossCostMultiplier: 3,
    });
    const base = {
      entryFees: 1,
      expectedMakerExitFees: 1,
      expectedTakerExitFees: 1,
      markedAccountEquity: 100,
      totalMaintenanceMargin: 1,
    };
    expect(
      evaluateResearchPairExit({
        ...base,
        grossPairPnL: 5,
        ...BaselineResearchExitPolicy,
      }),
    ).toBe('TAKE_PROFIT');
    expect(
      evaluateResearchPairExit({ ...base, grossPairPnL: 5, ...Tp3Sl3ResearchExitPolicy }),
    ).toBeNull();
    expect(
      evaluateResearchPairExit({ ...base, grossPairPnL: 8, ...Tp3Sl3ResearchExitPolicy }),
    ).toBe('TAKE_PROFIT');
    expect(
      evaluateResearchPairExit({ ...base, grossPairPnL: -4, ...Tp3Sl3ResearchExitPolicy }),
    ).toBe('STOP_LOSS');
  });

  it('evaluates only existing pullback signals once and aggregates transitions exactly', () => {
    const features = {
        ratioReturn1Direction: 'RATIO_UP',
        ratioReturn3Direction: 'RATIO_3M_UP',
        ratioPersistence3: 'UP_3_OF_3',
        rangePosition20: 'TOP_OR_ABOVE_QUARTER',
        candleSignRelationship: 'BOTH_UP',
        volumeParticipation: 'BOTH_HIGH',
      } as const,
      baselineReasons = ['TAKE_PROFIT', 'TAKE_PROFIT', 'STOP_LOSS', 'STOP_LOSS'] as const,
      experimentReasons = [
        'TAKE_PROFIT',
        'STOP_LOSS',
        'STOP_LOSS',
        'UNRESOLVED_END_OF_DATA',
      ] as const,
      samples: labeled_shadow_sample[] = baselineReasons.map((exitReason, index) => ({
        split: index < 2 ? 'DISCOVERY' : 'HOLDOUT',
        features,
        outcome: {
          signalTimestamp: (index + 1) * 60_000,
          activationTimestamp: (index + 1) * 60_000 + 1,
          direction: index % 2 === 0 ? 'LONG_BTC_SHORT_ETH' : 'SHORT_BTC_LONG_ETH',
          exitReason,
          holdingBars: 2,
          grossPairPnL: exitReason === 'TAKE_PROFIT' ? 2 : -1,
          netPairPnL: exitReason === 'TAKE_PROFIT' ? 1.5 : -1.5,
          totalCosts: 0.5,
        },
      })),
      regime = buildRegimePersistence7d([], 0),
      oneWeekPullback = buildRegimePullbackEntryV1({ candles: [], samples: [], regime });
    oneWeekPullback.signals.push(
      ...samples.map((sample, index) => ({
        signalTimestamp: sample.outcome.signalTimestamp,
        targetBlockIndex: index < 2 ? 1 : 2,
        sourceBlockIndex: index < 2 ? 0 : 1,
        allowedDirection: sample.outcome.direction,
        sourceWinnerGrossPF: 1,
        sourceWinnerTPRate: 0.6,
        ratioReturnTMinus2: -0.1,
        ratioReturnTMinus1: -0.1,
        ratioReturnT: 0.1,
        ratioAtSignal: 1,
        outcome: sample.outcome.exitReason,
        holdingBars: sample.outcome.holdingBars,
        grossPairPnL: sample.outcome.grossPairPnL,
        netPairPnL: sample.outcome.netPairPnL,
        totalCosts: sample.outcome.totalCosts,
        oppositeDirectionOutcome: sample.outcome,
      })),
    );
    const calls: string[] = [],
      report = buildRegimePullbackTp3Sl3V1({
        samples,
        oneWeekPullback,
        evaluateExperiment: (timestamp, direction, policy) => {
          calls.push(`${timestamp}:${direction}`);
          expect(policy).toEqual(Tp3Sl3ResearchExitPolicy);
          const index = timestamp / 60_000 - 1,
            exitReason = experimentReasons[index]!;
          return {
            ...samples[index]!.outcome,
            exitReason,
            holdingBars: exitReason === 'UNRESOLVED_END_OF_DATA' ? null : 4,
            grossPairPnL: exitReason === 'TAKE_PROFIT' ? 3 : exitReason === 'STOP_LOSS' ? -1 : 0,
            netPairPnL: exitReason === 'TAKE_PROFIT' ? 2.5 : exitReason === 'STOP_LOSS' ? -1.5 : 0,
          };
        },
      });
    expect(calls).toHaveLength(oneWeekPullback.signals.length);
    expect(new Set(calls).size).toBe(calls.length);
    expect(report.experimentalOutcomeCacheCount).toBe(4);
    expect(report.overall).toMatchObject({ sampleCount: 4, resolvedCount: 3, unresolvedCount: 1 });
    expect(report.holdout).toMatchObject({ sampleCount: 2, resolvedCount: 1, unresolvedCount: 1 });
    expect(report.byDirection.LONG_BTC_SHORT_ETH.overall.sampleCount).toBe(2);
    expect(report.byTargetBlock).toHaveLength(2);
    expect(report.outcomeTransitions).toMatchObject({
      BASELINE_TP_TO_EXPERIMENT_TP: 1,
      BASELINE_TP_TO_EXPERIMENT_SL: 1,
      BASELINE_SL_TO_EXPERIMENT_SL: 1,
      BASELINE_SL_TO_EXPERIMENT_UNRESOLVED: 1,
    });
    expect(report.oldTPContinuationDiagnostic).toEqual({
      oldTPCount: 2,
      laterReached3CTPCount: 1,
      laterHit3CSLCount: 1,
      laterMarginGuardCount: 0,
      laterUnresolvedCount: 0,
      oldTPTo3CTPRate: 0.5,
    });
  });

  it('classifies HOLDOUT TP3C/SL3C evidence exactly', () => {
    expect(
      classifyTp3Sl3Experiment({
        holdout: metrics({
          resolvedCount: 100,
          grossProfitFactor: 1.2,
          netProfitFactor: 1.1,
          netPairPnLSum: 1,
        }),
        baselineHoldout: metrics({ grossProfitFactor: 1, netProfitFactor: 0.9 }),
      }),
    ).toBe('TP3_SL3_HOLDOUT_PROMISING');
    expect(
      classifyTp3Sl3Experiment({
        holdout: metrics({
          resolvedCount: 100,
          grossProfitFactor: 1.1,
          netProfitFactor: 0.9,
          netPairPnLSum: -1,
        }),
        baselineHoldout: metrics({ grossProfitFactor: 1, netProfitFactor: 0.8 }),
      }),
    ).toBe('TP3_SL3_HOLDOUT_INTERESTING');
    expect(
      classifyTp3Sl3Experiment({
        holdout: metrics({ resolvedCount: 99, grossProfitFactor: 10, netProfitFactor: 10 }),
        baselineHoldout: metrics({ grossProfitFactor: 1, netProfitFactor: 1 }),
      }),
    ).toBe('NO_USEFUL_TP3_SL3_EXIT_EDGE');
  });
});

describe('BTC/ETH fixed UTC-session relative drift', () => {
  it('freezes four non-overlapping six-hour UTC definitions', () => {
    expect(UtcSessionDefinitions).toEqual([
      { label: 'UTC_00_06', startHour: 0, endHour: 6 },
      { label: 'UTC_06_12', startHour: 6, endHour: 12 },
      { label: 'UTC_12_18', startHour: 12, endHour: 18 },
      { label: 'UTC_18_24', startHour: 18, endHour: 24 },
    ]);
  });

  it('uses first and final completed BTC/ETH ratios from an exact 360-minute session', () => {
    const candles = Array.from({ length: 360 }, (_, index) =>
        candle(index, index === 359 ? 120 : 100, 50),
      ),
      report = buildBTCEthUtcSessionRelativeDriftV1(candles),
      session = report.sessions.UTC_00_06;
    expect(report.incompleteSessionCount).toBe(0);
    expect(session.overall).toMatchObject({
      sessionCount: 1,
      positiveCount: 1,
      longBTCShortETHDays: 1,
      dominantDirection: 'LONG_BTC_SHORT_ETH',
    });
    expect(session.overall.meanRelativeReturn).toBeCloseTo(0.2);
  });

  it('excludes incomplete sessions without filling missing minutes', () => {
    const candles = Array.from({ length: 360 }, (_, index) => candle(index, 100, 50)).filter(
        (_, index) => index !== 120,
      ),
      report = buildBTCEthUtcSessionRelativeDriftV1(candles);
    expect(report.incompleteSessionCount).toBe(1);
    expect(report.sessions.UTC_00_06.overall.sessionCount).toBe(0);
  });

  it('keeps zero sessions in the denominator and computes both directional hit rates', () => {
    const positive = calculateUtcSessionMetrics([0.1, 0.1, 0, -0.1]),
      negative = calculateUtcSessionMetrics([-0.1, -0.1, 0, 0.1]);
    expect(positive).toMatchObject({ sessionCount: 4, positiveRate: 0.5, zeroCount: 1 });
    expect(negative.negativeRate).toBe(0.5);
    expect(getUtcSessionDominantHitRate(positive)).toBe(0.5);
    expect(getUtcSessionDominantHitRate(negative)).toBe(0.5);
  });

  it('uses one chronological split and excludes its crossing session', () => {
    const candles = Array.from({ length: 2_880 }, (_, index) => candle(index, 100 + index, 50)),
      report = buildBTCEthUtcSessionRelativeDriftV1(candles),
      totalDiscovery = Object.values(report.sessions).reduce(
        (sum, session) => sum + session.discovery.sessionCount,
        0,
      ),
      totalHoldout = Object.values(report.sessions).reduce(
        (sum, session) => sum + session.holdout.sessionCount,
        0,
      );
    expect(report.crossBoundarySessionCount).toBe(1);
    expect(totalDiscovery + totalHoldout + report.crossBoundarySessionCount).toBe(8);
  });

  it('classifies bias strength, persistence, and final evidence exactly', () => {
    const discovery = calculateUtcSessionMetrics([
        ...Array.from({ length: 24 }, () => 0.1),
        ...Array.from({ length: 16 }, () => -0.1),
      ]),
      holdout = calculateUtcSessionMetrics([
        ...Array.from({ length: 13 }, () => 0.1),
        ...Array.from({ length: 7 }, () => -0.1),
      ]),
      consistent = true,
      persistentSessionBias = isPersistentUtcSessionBias({
        discovery,
        holdout,
        directionConsistent: consistent,
      });
    expect(classifyUtcSessionBias(holdout)).toBe('STRONG_SESSION_BIAS');
    expect(persistentSessionBias).toBe(true);
    expect(
      classifyUtcSessionRelativeDrift([
        { holdout, directionConsistent: consistent, persistentSessionBias },
      ]),
    ).toBe('PERSISTENT_UTC_SESSION_RELATIVE_BIAS_FOUND');
    expect(
      classifyUtcSessionRelativeDrift([
        { holdout, directionConsistent: true, persistentSessionBias: false },
      ]),
    ).toBe('UTC_SESSION_RELATIVE_BIAS_INTERESTING');
    expect(
      classifyUtcSessionRelativeDrift([
        {
          holdout: calculateUtcSessionMetrics([]),
          directionConsistent: false,
          persistentSessionBias: false,
        },
      ]),
    ).toBe('NO_USEFUL_UTC_SESSION_RELATIVE_BIAS');
  });
});
