import {
  calculateMarkedPairAccountEquity,
  calculatePairMaintenanceMargin,
  evaluatePairExit,
  sizeEqualNotionalPair,
  sizeMissingHedgeLeg,
  type pair_direction,
  type pair_market,
  type pair_side,
  type synchronized_pair_candle,
} from './btc_eth_pair.js';

export type discovery_split = 'DISCOVERY' | 'HOLDOUT';
export type shadow_exit_reason =
  'TAKE_PROFIT' | 'STOP_LOSS' | 'MARGIN_GUARD' | 'ENTRY_FAILED' | 'UNRESOLVED_END_OF_DATA';
export type alpha_features = {
  ratioReturn1Direction: 'RATIO_UP' | 'RATIO_DOWN' | 'RATIO_FLAT';
  ratioReturn3Direction: 'RATIO_3M_UP' | 'RATIO_3M_DOWN' | 'RATIO_3M_FLAT';
  ratioPersistence3: 'UP_3_OF_3' | 'DOWN_3_OF_3' | 'UP_2_OF_3' | 'DOWN_2_OF_3' | 'MIXED_OR_ZERO';
  rangePosition20:
    | 'BELOW_OR_BOTTOM_QUARTER'
    | 'LOWER_MIDDLE'
    | 'UPPER_MIDDLE'
    | 'TOP_OR_ABOVE_QUARTER'
    | 'UNAVAILABLE';
  candleSignRelationship:
    'BOTH_UP' | 'BOTH_DOWN' | 'BTC_UP_ETH_DOWN' | 'BTC_DOWN_ETH_UP' | 'HAS_ZERO';
  volumeParticipation: 'BOTH_HIGH' | 'BTC_ONLY_HIGH' | 'ETH_ONLY_HIGH' | 'NEITHER_HIGH';
};
export type shadow_campaign_outcome = {
  signalTimestamp: number;
  activationTimestamp: number | null;
  direction: pair_direction;
  exitReason: shadow_exit_reason;
  holdingBars: number | null;
  grossPairPnL: number;
  netPairPnL: number;
  totalCosts: number;
};
export type labeled_shadow_sample = {
  split: discovery_split;
  features: alpha_features;
  outcome: shadow_campaign_outcome;
};
export type bucket_metrics = {
  sampleCount: number;
  activatedCount: number;
  entryFailedCount: number;
  resolvedCount: number;
  takeProfitCount: number;
  stopLossCount: number;
  marginGuardCount: number;
  unresolvedCount: number;
  tpBeforeSlRate: number | null;
  grossPairPnLSum: number;
  netPairPnLSum: number;
  grossProfitFactor: number | null;
  netProfitFactor: number | null;
  meanHoldingBars: number | null;
  medianHoldingBars: number | null;
  meanTotalCosts: number;
};
export type ranked_rule = {
  feature: string;
  bucket: string;
  direction: pair_direction;
  discovery: bucket_metrics;
  holdout: bucket_metrics;
  flag: 'PROMISING' | 'INTERESTING' | 'WEAK';
};
export const AlphaDiscoverySamplingStrideBars = 5;
export const ShadowDirections = [
  'LONG_BTC_SHORT_ETH',
  'SHORT_BTC_LONG_ETH',
] as const satisfies readonly pair_direction[];
export const RegimeBlockDays = 7;
export const MinimumResolvedPerDirectionPerBlock = 100;
const RegimeBlockMilliseconds = RegimeBlockDays * 24 * 60 * 60 * 1_000;

export type regime_block_winner = pair_direction | 'NO_RELIABLE_WINNER';
export type regime_block = {
  blockIndex: number;
  startTimestamp: number;
  endTimestamp: number;
  status: 'COMPLETE' | 'PARTIAL';
  directions: Record<pair_direction, bucket_metrics>;
  winner: regime_block_winner;
  winnerGrossPF: number | null;
  winnerTPRate: number | null;
};
export type regime_transition = {
  sourceBlockIndex: number;
  targetBlockIndex: number;
  predictedDirection: pair_direction;
  sourceWinnerGrossPF: number;
  sourceWinnerTPRate: number;
  targetDirectionGrossPF: number | null;
  targetDirectionNetPF: number | null;
  targetDirectionTPRate: number | null;
  targetResolvedCount: number;
  directionPersisted: boolean;
};
export const RegimePullbackAlphaId = 'WEEKLY_REGIME_TWO_BAR_PULLBACK_TURN_V1';
export const TwoWeekConfirmedRegimePullbackAlphaId = 'TWO_WEEK_CONFIRMED_REGIME_PULLBACK_V1';
export const FrozenDirectionHoldoutAlphaId =
  'DISCOVERY_FROZEN_DIRECTION_REGIME_PULLBACK_HOLDOUT_V1';
export const MinimumDiscoveryResolvedPerDirection = 200;
export const CausalRegimeStrengthDiagnosticId = 'CAUSAL_WEEKLY_REGIME_STRENGTH_PULLBACK_V1';
export const RegimeStrengthBuckets = [
  'STRENGTH_0_TO_0_10',
  'STRENGTH_0_10_TO_0_20',
  'STRENGTH_0_20_TO_0_30',
  'STRENGTH_0_30_PLUS',
] as const;
export type regime_strength_bucket = (typeof RegimeStrengthBuckets)[number];
export const BTCEthRelativeDriftDiagnosticId = 'BTC_ETH_RELATIVE_DRIFT_V1';
export const RelativeDriftHorizons = [
  { horizonDays: 1, horizonBars: 1_440 },
  { horizonDays: 3, horizonBars: 4_320 },
  { horizonDays: 7, horizonBars: 10_080 },
  { horizonDays: 14, horizonBars: 20_160 },
] as const;
export const RegimePullbackTp3Sl3ExperimentId = 'REGIME_PULLBACK_TP3C_SL3_V1';
export const BaselineResearchExitPolicy = {
  takeProfitCostMultiplier: 1.5,
  stopLossCostMultiplier: 3,
} as const;
export const Tp3Sl3ResearchExitPolicy = {
  takeProfitCostMultiplier: 3,
  stopLossCostMultiplier: 3,
} as const;
export const BTCEthUtcSessionRelativeDriftDiagnosticId = 'BTC_ETH_UTC_SESSION_RELATIVE_DRIFT_V1';
export const UtcSessionDefinitions = [
  { label: 'UTC_00_06', startHour: 0, endHour: 6 },
  { label: 'UTC_06_12', startHour: 6, endHour: 12 },
  { label: 'UTC_12_18', startHour: 12, endHour: 18 },
  { label: 'UTC_18_24', startHour: 18, endHour: 24 },
] as const;
export type utc_session_label = (typeof UtcSessionDefinitions)[number]['label'];

export function classifyRegimeStrengthBucket(strength: number): regime_strength_bucket {
  if (strength < 0.1) return 'STRENGTH_0_TO_0_10';
  if (strength < 0.2) return 'STRENGTH_0_10_TO_0_20';
  if (strength < 0.3) return 'STRENGTH_0_20_TO_0_30';
  return 'STRENGTH_0_30_PLUS';
}

export function calculatePairRatioSeries(candles: readonly synchronized_pair_candle[]): {
  ratios: number[];
  ratioReturns1m: (number | null)[];
} {
  const ratios = candles.map((candle) => candle.eth.close / candle.btc.close);
  return {
    ratios,
    ratioReturns1m: ratios.map((ratio, index) =>
      index === 0 ? null : Math.log(ratio / ratios[index - 1]!),
    ),
  };
}

export function matchesRegimePullbackTurn(
  direction: pair_direction,
  returns: readonly [number, number, number],
): boolean {
  const [tMinus2, tMinus1, current] = returns;
  return direction === 'SHORT_BTC_LONG_ETH'
    ? tMinus2 < 0 && tMinus1 < 0 && current > 0
    : tMinus2 > 0 && tMinus1 > 0 && current < 0;
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
};
const roundDown = (value: number, increment: number) =>
  Math.floor((value + Number.EPSILON) / increment) * increment;
const roundUp = (value: number, increment: number) =>
  Math.ceil((value - Number.EPSILON) / increment) * increment;
const roundLimit = (price: number, side: pair_side, tickSize: number) =>
  side === 'BUY' ? roundDown(price, tickSize) : roundUp(price, tickSize);
const fillsPassively = (
  side: pair_side,
  limit: number,
  candle: synchronized_pair_candle['btc'],
  tickSize: number,
) => (side === 'BUY' ? candle.low <= limit - tickSize : candle.high >= limit + tickSize);
const legPnL = (side: pair_side, entry: number, exit: number, quantity: number) =>
  (side === 'BUY' ? exit - entry : entry - exit) * quantity;
const factor = (values: readonly number[]) => {
  const profit = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0),
    loss = -values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return loss === 0 ? null : profit / loss;
};

export function splitChronologically<T>(values: readonly T[]): {
  discovery: T[];
  holdout: T[];
  splitIndex: number;
} {
  const splitIndex = Math.floor(values.length * 0.7);
  return { discovery: values.slice(0, splitIndex), holdout: values.slice(splitIndex), splitIndex };
}

export function sampleEligibleIndices(
  candleCount: number,
  firstEligibleIndex = 20,
  strideBars = AlphaDiscoverySamplingStrideBars,
): number[] {
  const indices: number[] = [];
  for (let index = firstEligibleIndex; index < candleCount; index += 1)
    if ((index - firstEligibleIndex) % strideBars === 0) indices.push(index);
  return indices;
}

export function getShadowOutcomeCacheKey(timestamp: number, direction: pair_direction): string {
  return `${timestamp}:${direction}`;
}

export function buildCachedShadowSamples(input: {
  rows: readonly { timestamp: number; features: alpha_features }[];
  evaluate: (timestamp: number, direction: pair_direction) => shadow_campaign_outcome;
  progressEvery?: number;
  onProgress?: (completed: number, total: number) => void;
}): { samples: labeled_shadow_sample[]; cachedShadowOutcomeCount: number } {
  const samples: labeled_shadow_sample[] = [],
    cache = new Map<string, shadow_campaign_outcome>(),
    splitIndex = Math.floor(input.rows.length * 0.7),
    total = input.rows.length * ShadowDirections.length,
    progressEvery = input.progressEvery ?? 5_000;
  input.rows.forEach((row, rowIndex) => {
    for (const direction of ShadowDirections) {
      const key = getShadowOutcomeCacheKey(row.timestamp, direction);
      let outcome = cache.get(key);
      if (!outcome) {
        outcome = input.evaluate(row.timestamp, direction);
        cache.set(key, outcome);
        if (input.onProgress && (cache.size % progressEvery === 0 || cache.size === total))
          input.onProgress(cache.size, total);
      }
      samples.push({
        split: rowIndex < splitIndex ? 'DISCOVERY' : 'HOLDOUT',
        features: row.features,
        outcome,
      });
    }
  });
  return { samples, cachedShadowOutcomeCount: cache.size };
}

export function calculateAlphaFeatures(
  candles: readonly synchronized_pair_candle[],
  index: number,
): alpha_features | null {
  if (index < 20) return null;
  const ratioAt = (ratioIndex: number) =>
      candles[ratioIndex]!.eth.close / candles[ratioIndex]!.btc.close,
    ratioReturn = (offset: number) =>
      Math.log(ratioAt(index - offset) / ratioAt(index - offset - 1)),
    ratioReturn1 = ratioReturn(0),
    ratioReturn3 = Math.log(ratioAt(index) / ratioAt(index - 3)),
    lastThree = [ratioReturn(0), ratioReturn(1), ratioReturn(2)],
    positives = lastThree.filter((value) => value > 0).length,
    negatives = lastThree.filter((value) => value < 0).length,
    priorRatios = candles
      .slice(index - 20, index)
      .map((value) => value.eth.close / value.btc.close),
    priorMin = Math.min(...priorRatios),
    priorMax = Math.max(...priorRatios),
    denominator = priorMax - priorMin,
    rangePosition = denominator > 0 ? (ratioAt(index) - priorMin) / denominator : null,
    btcReturn = Math.log(candles[index]!.btc.close / candles[index - 1]!.btc.close),
    ethReturn = Math.log(candles[index]!.eth.close / candles[index - 1]!.eth.close),
    btcMedianVolume = median(candles.slice(index - 20, index).map((value) => value.btc.volume)),
    ethMedianVolume = median(candles.slice(index - 20, index).map((value) => value.eth.volume)),
    btcHigh = btcMedianVolume > 0 && candles[index]!.btc.volume / btcMedianVolume > 1,
    ethHigh = ethMedianVolume > 0 && candles[index]!.eth.volume / ethMedianVolume > 1;
  return {
    ratioReturn1Direction:
      ratioReturn1 > 0 ? 'RATIO_UP' : ratioReturn1 < 0 ? 'RATIO_DOWN' : 'RATIO_FLAT',
    ratioReturn3Direction:
      ratioReturn3 > 0 ? 'RATIO_3M_UP' : ratioReturn3 < 0 ? 'RATIO_3M_DOWN' : 'RATIO_3M_FLAT',
    ratioPersistence3:
      positives === 3
        ? 'UP_3_OF_3'
        : negatives === 3
          ? 'DOWN_3_OF_3'
          : positives === 2
            ? 'UP_2_OF_3'
            : negatives === 2
              ? 'DOWN_2_OF_3'
              : 'MIXED_OR_ZERO',
    rangePosition20:
      rangePosition === null || !Number.isFinite(rangePosition)
        ? 'UNAVAILABLE'
        : rangePosition <= 0.25
          ? 'BELOW_OR_BOTTOM_QUARTER'
          : rangePosition <= 0.5
            ? 'LOWER_MIDDLE'
            : rangePosition < 0.75
              ? 'UPPER_MIDDLE'
              : 'TOP_OR_ABOVE_QUARTER',
    candleSignRelationship:
      btcReturn === 0 || ethReturn === 0
        ? 'HAS_ZERO'
        : btcReturn > 0 && ethReturn > 0
          ? 'BOTH_UP'
          : btcReturn < 0 && ethReturn < 0
            ? 'BOTH_DOWN'
            : btcReturn > 0
              ? 'BTC_UP_ETH_DOWN'
              : 'BTC_DOWN_ETH_UP',
    volumeParticipation: btcHigh
      ? ethHigh
        ? 'BOTH_HIGH'
        : 'BTC_ONLY_HIGH'
      : ethHigh
        ? 'ETH_ONLY_HIGH'
        : 'NEITHER_HIGH',
  };
}

export function calculateBucketMetrics(samples: readonly labeled_shadow_sample[]): bucket_metrics {
  const outcomes = samples.map((value) => value.outcome),
    resolved = outcomes.filter(
      (value) => value.exitReason === 'TAKE_PROFIT' || value.exitReason === 'STOP_LOSS',
    ),
    takeProfits = resolved.filter((value) => value.exitReason === 'TAKE_PROFIT').length,
    stopLosses = resolved.length - takeProfits,
    holdings = outcomes.flatMap((value) => value.holdingBars ?? []),
    gross = outcomes.map((value) => value.grossPairPnL),
    net = outcomes.map((value) => value.netPairPnL);
  return {
    sampleCount: outcomes.length,
    activatedCount: outcomes.filter((value) => value.activationTimestamp !== null).length,
    entryFailedCount: outcomes.filter((value) => value.exitReason === 'ENTRY_FAILED').length,
    resolvedCount: resolved.length,
    takeProfitCount: takeProfits,
    stopLossCount: stopLosses,
    marginGuardCount: outcomes.filter((value) => value.exitReason === 'MARGIN_GUARD').length,
    unresolvedCount: outcomes.filter((value) => value.exitReason === 'UNRESOLVED_END_OF_DATA')
      .length,
    tpBeforeSlRate: resolved.length === 0 ? null : takeProfits / resolved.length,
    grossPairPnLSum: gross.reduce((sum, value) => sum + value, 0),
    netPairPnLSum: net.reduce((sum, value) => sum + value, 0),
    grossProfitFactor: factor(gross),
    netProfitFactor: factor(net),
    meanHoldingBars:
      holdings.length === 0
        ? null
        : holdings.reduce((sum, value) => sum + value, 0) / holdings.length,
    medianHoldingBars: holdings.length === 0 ? null : median(holdings),
    meanTotalCosts:
      outcomes.length === 0
        ? 0
        : outcomes.reduce((sum, value) => sum + value.totalCosts, 0) / outcomes.length,
  };
}

export function selectRegimeBlockWinner(
  directions: Record<pair_direction, bucket_metrics>,
  minimumResolved = MinimumResolvedPerDirectionPerBlock,
): regime_block_winner {
  const long = directions.LONG_BTC_SHORT_ETH,
    short = directions.SHORT_BTC_LONG_ETH;
  if (
    long.resolvedCount < minimumResolved ||
    short.resolvedCount < minimumResolved ||
    long.grossProfitFactor === null ||
    short.grossProfitFactor === null
  )
    return 'NO_RELIABLE_WINNER';
  if (long.grossProfitFactor !== short.grossProfitFactor)
    return long.grossProfitFactor > short.grossProfitFactor
      ? 'LONG_BTC_SHORT_ETH'
      : 'SHORT_BTC_LONG_ETH';
  if (long.tpBeforeSlRate !== short.tpBeforeSlRate)
    return (long.tpBeforeSlRate ?? -1) > (short.tpBeforeSlRate ?? -1)
      ? 'LONG_BTC_SHORT_ETH'
      : 'SHORT_BTC_LONG_ETH';
  if (long.resolvedCount !== short.resolvedCount)
    return long.resolvedCount > short.resolvedCount ? 'LONG_BTC_SHORT_ETH' : 'SHORT_BTC_LONG_ETH';
  return 'NO_RELIABLE_WINNER';
}

const aggregateTransitionSamples = (
  samplesByBlock: ReadonlyMap<number, readonly labeled_shadow_sample[]>,
  blocks: readonly regime_block[],
  transitions: readonly regime_transition[],
  direction?: pair_direction,
): bucket_metrics => {
  const targetByIndex = new Map(blocks.map((block) => [block.blockIndex, block]));
  return calculateBucketMetrics(
    transitions.flatMap((transition) => {
      const target = targetByIndex.get(transition.targetBlockIndex)!;
      return (samplesByBlock.get(target.blockIndex) ?? []).filter(
        (sample) => sample.outcome.direction === (direction ?? transition.predictedDirection),
      );
    }),
  );
};

export function classifyRegimePersistence(input: {
  predictionCount: number;
  directionPersistenceRate: number | null;
  causalRegimeGrossProfitFactor: number | null;
}):
  | 'REGIME_PERSISTENCE_STRONG'
  | 'REGIME_PERSISTENCE_INTERESTING'
  | 'NO_USEFUL_7D_REGIME_PERSISTENCE' {
  if (
    input.predictionCount >= 5 &&
    (input.directionPersistenceRate ?? 0) >= 0.7 &&
    (input.causalRegimeGrossProfitFactor ?? 0) >= 1
  )
    return 'REGIME_PERSISTENCE_STRONG';
  if (
    input.predictionCount >= 5 &&
    ((input.directionPersistenceRate ?? 0) >= 0.6 ||
      (input.causalRegimeGrossProfitFactor ?? 0) >= 0.8)
  )
    return 'REGIME_PERSISTENCE_INTERESTING';
  return 'NO_USEFUL_7D_REGIME_PERSISTENCE';
}

export function buildRegimePersistence7d(
  samples: readonly labeled_shadow_sample[],
  finalDataTimestamp: number,
) {
  const firstTimestamp = samples[0]?.outcome.signalTimestamp;
  if (firstTimestamp === undefined)
    return {
      regimeBlockDays: RegimeBlockDays,
      minimumResolvedPerDirectionPerBlock: MinimumResolvedPerDirectionPerBlock,
      blocks: [] as regime_block[],
      causalTransitions: [] as regime_transition[],
      summary: null,
    };
  const blockCount = Math.ceil((finalDataTimestamp - firstTimestamp + 1) / RegimeBlockMilliseconds),
    samplesByBlock = new Map<number, labeled_shadow_sample[]>();
  for (const sample of samples) {
    const blockIndex = Math.floor(
        (sample.outcome.signalTimestamp - firstTimestamp) / RegimeBlockMilliseconds,
      ),
      blockSamples = samplesByBlock.get(blockIndex) ?? [];
    blockSamples.push(sample);
    samplesByBlock.set(blockIndex, blockSamples);
  }
  const blocks: regime_block[] = Array.from({ length: blockCount }, (_, blockIndex) => {
      const startTimestamp = firstTimestamp + blockIndex * RegimeBlockMilliseconds,
        endTimestamp = startTimestamp + RegimeBlockMilliseconds,
        inBlock = samplesByBlock.get(blockIndex) ?? [],
        directions = Object.fromEntries(
          ShadowDirections.map((direction) => [
            direction,
            calculateBucketMetrics(
              inBlock.filter((sample) => sample.outcome.direction === direction),
            ),
          ]),
        ) as Record<pair_direction, bucket_metrics>,
        winner = selectRegimeBlockWinner(directions),
        winnerMetrics = winner === 'NO_RELIABLE_WINNER' ? null : directions[winner];
      return {
        blockIndex,
        startTimestamp,
        endTimestamp,
        status: endTimestamp <= finalDataTimestamp ? 'COMPLETE' : 'PARTIAL',
        directions,
        winner,
        winnerGrossPF: winnerMetrics?.grossProfitFactor ?? null,
        winnerTPRate: winnerMetrics?.tpBeforeSlRate ?? null,
      };
    }),
    causalTransitions: regime_transition[] = blocks.flatMap((source, sourceIndex) => {
      const target = blocks[sourceIndex + 1];
      if (
        source.status !== 'COMPLETE' ||
        source.winner === 'NO_RELIABLE_WINNER' ||
        !target ||
        target.status !== 'COMPLETE'
      )
        return [];
      const sourceMetrics = source.directions[source.winner],
        targetMetrics = target.directions[source.winner];
      return [
        {
          sourceBlockIndex: source.blockIndex,
          targetBlockIndex: target.blockIndex,
          predictedDirection: source.winner,
          sourceWinnerGrossPF: sourceMetrics.grossProfitFactor!,
          sourceWinnerTPRate: sourceMetrics.tpBeforeSlRate!,
          targetDirectionGrossPF: targetMetrics.grossProfitFactor,
          targetDirectionNetPF: targetMetrics.netProfitFactor,
          targetDirectionTPRate: targetMetrics.tpBeforeSlRate,
          targetResolvedCount: targetMetrics.resolvedCount,
          directionPersisted: target.winner === source.winner,
        },
      ];
    }),
    causalMetrics = aggregateTransitionSamples(samplesByBlock, blocks, causalTransitions),
    predictionCount = causalTransitions.length,
    directionPersistedCount = causalTransitions.filter((value) => value.directionPersisted).length,
    directionPersistenceRate =
      predictionCount === 0 ? null : directionPersistedCount / predictionCount,
    sourceQuality = (atLeastOne: boolean) => {
      const selected = causalTransitions.filter((transition) =>
        atLeastOne ? transition.sourceWinnerGrossPF >= 1 : transition.sourceWinnerGrossPF < 1,
      );
      return {
        predictionCount: selected.length,
        directionPersistenceRate:
          selected.length === 0
            ? null
            : selected.filter((value) => value.directionPersisted).length / selected.length,
        targetPerformance: aggregateTransitionSamples(samplesByBlock, blocks, selected),
      };
    },
    summary = {
      predictionCount,
      directionPersistedCount,
      directionPersistenceRate,
      causalRegimeResolvedCount: causalMetrics.resolvedCount,
      causalRegimeTakeProfitCount: causalMetrics.takeProfitCount,
      causalRegimeStopLossCount: causalMetrics.stopLossCount,
      causalRegimeTPBeforeSLRate: causalMetrics.tpBeforeSlRate,
      causalRegimeGrossPairPnLSum: causalMetrics.grossPairPnLSum,
      causalRegimeNetPairPnLSum: causalMetrics.netPairPnLSum,
      causalRegimeGrossProfitFactor: causalMetrics.grossProfitFactor,
      causalRegimeNetProfitFactor: causalMetrics.netProfitFactor,
      blindDirections: Object.fromEntries(
        ShadowDirections.map((direction) => [
          direction,
          aggregateTransitionSamples(samplesByBlock, blocks, causalTransitions, direction),
        ]),
      ),
      sourceWinnerQuality: {
        grossPFAtLeastOne: sourceQuality(true),
        grossPFBelowOne: sourceQuality(false),
      },
      classification: classifyRegimePersistence({
        predictionCount,
        directionPersistenceRate,
        causalRegimeGrossProfitFactor: causalMetrics.grossProfitFactor,
      }),
    };
  return {
    regimeBlockDays: RegimeBlockDays,
    minimumResolvedPerDirectionPerBlock: MinimumResolvedPerDirectionPerBlock,
    blocks,
    causalTransitions,
    summary,
  };
}

export function classifyRegimePullbackEntry(input: {
  resolvedCount: number;
  tpBeforeSlRate: number | null;
  grossProfitFactor: number | null;
  oppositeGrossProfitFactor: number | null;
  regimeOnlyGrossProfitFactor: number | null;
}): 'PULLBACK_TIMING_PROMISING' | 'PULLBACK_TIMING_INTERESTING' | 'NO_USEFUL_PULLBACK_TIMING_EDGE' {
  const grossPF = input.grossProfitFactor;
  if (
    input.resolvedCount >= 100 &&
    (input.tpBeforeSlRate ?? 0) >= 0.67 &&
    grossPF !== null &&
    grossPF >= 1 &&
    input.oppositeGrossProfitFactor !== null &&
    grossPF > input.oppositeGrossProfitFactor
  )
    return 'PULLBACK_TIMING_PROMISING';
  if (
    input.resolvedCount >= 100 &&
    ((input.tpBeforeSlRate ?? 0) >= 0.6 || (grossPF ?? 0) >= 0.8) &&
    input.regimeOnlyGrossProfitFactor !== null &&
    grossPF !== null &&
    grossPF > input.regimeOnlyGrossProfitFactor
  )
    return 'PULLBACK_TIMING_INTERESTING';
  return 'NO_USEFUL_PULLBACK_TIMING_EDGE';
}

export function buildRegimePullbackEntryV1(input: {
  candles: readonly synchronized_pair_candle[];
  samples: readonly labeled_shadow_sample[];
  regime: ReturnType<typeof buildRegimePersistence7d>;
  ratioSeries?: ReturnType<typeof calculatePairRatioSeries>;
}) {
  const { ratios, ratioReturns1m } = input.ratioSeries ?? calculatePairRatioSeries(input.candles),
    candleIndexByTimestamp = new Map(
      input.candles.map((candle, index) => [candle.timestamp.getTime(), index]),
    ),
    samplesByKey = new Map(
      input.samples.map((sample) => [
        getShadowOutcomeCacheKey(sample.outcome.signalTimestamp, sample.outcome.direction),
        sample,
      ]),
    ),
    blocksByIndex = new Map(input.regime.blocks.map((block) => [block.blockIndex, block])),
    transitionsByTarget = new Map(
      input.regime.causalTransitions.map((transition) => [transition.targetBlockIndex, transition]),
    ),
    sampledTimestamps = [...new Set(input.samples.map((sample) => sample.outcome.signalTimestamp))],
    eligibleRows = sampledTimestamps.flatMap((timestamp) => {
      const target = input.regime.blocks.find(
          (block) => timestamp >= block.startTimestamp && timestamp < block.endTimestamp,
        ),
        transition = target ? transitionsByTarget.get(target.blockIndex) : undefined;
      return target && transition ? [{ timestamp, target, transition }] : [];
    }),
    signalPairs = eligibleRows.flatMap(({ timestamp, target, transition }) => {
      const candleIndex = candleIndexByTimestamp.get(timestamp);
      if (candleIndex === undefined || candleIndex < 2) return [];
      if (
        input.candles[candleIndex - 1]!.timestamp.getTime() !== timestamp - 60_000 ||
        input.candles[candleIndex - 2]!.timestamp.getTime() !== timestamp - 120_000
      )
        return [];
      const returns = [
        ratioReturns1m[candleIndex - 2],
        ratioReturns1m[candleIndex - 1],
        ratioReturns1m[candleIndex],
      ];
      if (returns.some((value) => value === null)) return [];
      const typedReturns = returns as [number, number, number];
      if (!matchesRegimePullbackTurn(transition.predictedDirection, typedReturns)) return [];
      const allowed = samplesByKey.get(
          getShadowOutcomeCacheKey(timestamp, transition.predictedDirection),
        ),
        oppositeDirection: pair_direction =
          transition.predictedDirection === 'LONG_BTC_SHORT_ETH'
            ? 'SHORT_BTC_LONG_ETH'
            : 'LONG_BTC_SHORT_ETH',
        opposite = samplesByKey.get(getShadowOutcomeCacheKey(timestamp, oppositeDirection));
      if (!allowed || !opposite) return [];
      return [
        {
          target,
          allowed,
          opposite,
          record: {
            signalTimestamp: timestamp,
            targetBlockIndex: target.blockIndex,
            sourceBlockIndex: transition.sourceBlockIndex,
            allowedDirection: transition.predictedDirection,
            sourceWinnerGrossPF: transition.sourceWinnerGrossPF,
            sourceWinnerTPRate: transition.sourceWinnerTPRate,
            ratioReturnTMinus2: typedReturns[0],
            ratioReturnTMinus1: typedReturns[1],
            ratioReturnT: typedReturns[2],
            ratioAtSignal: ratios[candleIndex]!,
            outcome: allowed.outcome.exitReason,
            holdingBars: allowed.outcome.holdingBars,
            grossPairPnL: allowed.outcome.grossPairPnL,
            netPairPnL: allowed.outcome.netPairPnL,
            totalCosts: allowed.outcome.totalCosts,
            oppositeDirectionOutcome: opposite.outcome,
          },
        },
      ];
    }),
    allowedSamples = signalPairs.map((value) => value.allowed),
    oppositeSamples = signalPairs.map((value) => value.opposite),
    aggregate = calculateBucketMetrics(allowedSamples),
    oppositeAggregate = calculateBucketMetrics(oppositeSamples),
    regimeOnlySamples = eligibleRows.flatMap(({ timestamp, transition }) => {
      const sample = samplesByKey.get(
        getShadowOutcomeCacheKey(timestamp, transition.predictedDirection),
      );
      return sample ? [sample] : [];
    }),
    regimeOnly = calculateBucketMetrics(regimeOnlySamples),
    difference = (left: number | null, right: number | null) =>
      left === null || right === null ? null : left - right,
    byAllowedDirection = Object.fromEntries(
      ShadowDirections.map((direction) => [
        direction,
        calculateBucketMetrics(
          allowedSamples.filter((sample) => sample.outcome.direction === direction),
        ),
      ]),
    ) as Record<pair_direction, bucket_metrics>,
    byTargetBlock = [...transitionsByTarget.values()].map((transition) => {
      const target = blocksByIndex.get(transition.targetBlockIndex)!,
        blockMetrics = calculateBucketMetrics(
          signalPairs
            .filter((value) => value.target.blockIndex === target.blockIndex)
            .map((value) => value.allowed),
        );
      return {
        targetBlockIndex: target.blockIndex,
        sourceBlockIndex: transition.sourceBlockIndex,
        allowedDirection: transition.predictedDirection,
        signalCount: blockMetrics.sampleCount,
        resolvedCount: blockMetrics.resolvedCount,
        tpBeforeSlRate: blockMetrics.tpBeforeSlRate,
        grossProfitFactor: blockMetrics.grossProfitFactor,
        netProfitFactor: blockMetrics.netProfitFactor,
      };
    }),
    classification = classifyRegimePullbackEntry({
      resolvedCount: aggregate.resolvedCount,
      tpBeforeSlRate: aggregate.tpBeforeSlRate,
      grossProfitFactor: aggregate.grossProfitFactor,
      oppositeGrossProfitFactor: oppositeAggregate.grossProfitFactor,
      regimeOnlyGrossProfitFactor: regimeOnly.grossProfitFactor,
    });
  return {
    alphaId: RegimePullbackAlphaId,
    patternDefinition: {
      SHORT_BTC_LONG_ETH: 'ratioReturn[t-2] < 0 | ratioReturn[t-1] < 0 | ratioReturn[t] > 0',
      LONG_BTC_SHORT_ETH: 'ratioReturn[t-2] > 0 | ratioReturn[t-1] > 0 | ratioReturn[t] < 0',
      strictSigns: true,
      consecutiveOneMinuteBars: true,
    },
    signals: signalPairs.map((value) => value.record),
    signalCount: signalPairs.length,
    eligibleRegimeSampledTimestampCount: eligibleRows.length,
    signalRate: eligibleRows.length === 0 ? 0 : signalPairs.length / eligibleRows.length,
    aggregate,
    byAllowedDirection,
    byTargetBlock,
    regimeOnlyComparison: {
      regimeOnlyTPBeforeSLRate: regimeOnly.tpBeforeSlRate,
      regimeOnlyGrossProfitFactor: regimeOnly.grossProfitFactor,
      regimeOnlyNetProfitFactor: regimeOnly.netProfitFactor,
      regimeOnlyResolvedCount: regimeOnly.resolvedCount,
      pullbackMinusRegimeOnlyTPRate: difference(
        aggregate.tpBeforeSlRate,
        regimeOnly.tpBeforeSlRate,
      ),
      pullbackMinusRegimeOnlyGrossPF: difference(
        aggregate.grossProfitFactor,
        regimeOnly.grossProfitFactor,
      ),
      pullbackMinusRegimeOnlyNetPF: difference(
        aggregate.netProfitFactor,
        regimeOnly.netProfitFactor,
      ),
    },
    oppositeDirectionComparison: {
      oppositeDirectionResolvedCount: oppositeAggregate.resolvedCount,
      oppositeDirectionTPBeforeSLRate: oppositeAggregate.tpBeforeSlRate,
      oppositeDirectionGrossProfitFactor: oppositeAggregate.grossProfitFactor,
      oppositeDirectionNetProfitFactor: oppositeAggregate.netProfitFactor,
    },
    classification,
  };
}

export function getTwoWeekConfirmedRegimeTargets(blocks: readonly regime_block[]): {
  target: regime_block;
  sourceMinus2: regime_block;
  sourceMinus1: regime_block;
  confirmedRegime: boolean;
  allowedDirection: pair_direction | null;
}[] {
  return blocks.slice(2).flatMap((target, offset) => {
    if (target.status !== 'COMPLETE') return [];
    const targetIndex = offset + 2,
      sourceMinus2 = blocks[targetIndex - 2]!,
      sourceMinus1 = blocks[targetIndex - 1]!,
      confirmedRegime =
        sourceMinus2.status === 'COMPLETE' &&
        sourceMinus1.status === 'COMPLETE' &&
        sourceMinus2.winner !== 'NO_RELIABLE_WINNER' &&
        sourceMinus2.winner === sourceMinus1.winner;
    return [
      {
        target,
        sourceMinus2,
        sourceMinus1,
        confirmedRegime,
        allowedDirection: confirmedRegime ? (sourceMinus1.winner as pair_direction) : null,
      },
    ];
  });
}

export function classifyTwoWeekRegimePullback(input: {
  resolvedCount: number;
  tpBeforeSlRate: number | null;
  grossProfitFactor: number | null;
  oppositeGrossProfitFactor: number | null;
  oneWeekGrossProfitFactor: number | null;
}):
  | 'TWO_WEEK_REGIME_PULLBACK_PROMISING'
  | 'TWO_WEEK_REGIME_PULLBACK_INTERESTING'
  | 'NO_USEFUL_TWO_WEEK_REGIME_PULLBACK_EDGE' {
  const grossPF = input.grossProfitFactor;
  if (
    input.resolvedCount >= 100 &&
    (input.tpBeforeSlRate ?? 0) >= 0.67 &&
    grossPF !== null &&
    grossPF >= 1 &&
    input.oppositeGrossProfitFactor !== null &&
    grossPF > input.oppositeGrossProfitFactor
  )
    return 'TWO_WEEK_REGIME_PULLBACK_PROMISING';
  if (
    input.resolvedCount >= 100 &&
    ((input.tpBeforeSlRate ?? 0) >= 0.6 || (grossPF ?? 0) >= 0.8) &&
    grossPF !== null &&
    input.oneWeekGrossProfitFactor !== null &&
    grossPF > input.oneWeekGrossProfitFactor
  )
    return 'TWO_WEEK_REGIME_PULLBACK_INTERESTING';
  return 'NO_USEFUL_TWO_WEEK_REGIME_PULLBACK_EDGE';
}

export function buildTwoWeekConfirmedRegimePullbackV1(input: {
  candles: readonly synchronized_pair_candle[];
  samples: readonly labeled_shadow_sample[];
  regime: ReturnType<typeof buildRegimePersistence7d>;
  oneWeekPullback: ReturnType<typeof buildRegimePullbackEntryV1>;
  ratioSeries?: ReturnType<typeof calculatePairRatioSeries>;
}) {
  const { ratios, ratioReturns1m } = input.ratioSeries ?? calculatePairRatioSeries(input.candles),
    candleIndexByTimestamp = new Map(
      input.candles.map((candle, index) => [candle.timestamp.getTime(), index]),
    ),
    samplesByKey = new Map(
      input.samples.map((sample) => [
        getShadowOutcomeCacheKey(sample.outcome.signalTimestamp, sample.outcome.direction),
        sample,
      ]),
    ),
    sampledTimestamps = [...new Set(input.samples.map((sample) => sample.outcome.signalTimestamp))],
    targets = getTwoWeekConfirmedRegimeTargets(input.regime.blocks),
    confirmedTargets = targets.filter(
      (target): target is typeof target & { allowedDirection: pair_direction } =>
        target.allowedDirection !== null,
    ),
    confirmedByBlock = new Map(
      confirmedTargets.map((target) => [target.target.blockIndex, target]),
    ),
    firstBlockStart = input.regime.blocks[0]?.startTimestamp,
    eligibleRows = sampledTimestamps.flatMap((timestamp) => {
      if (firstBlockStart === undefined) return [];
      const blockIndex = Math.floor((timestamp - firstBlockStart) / RegimeBlockMilliseconds),
        confirmed = confirmedByBlock.get(blockIndex);
      return confirmed ? [{ timestamp, confirmed }] : [];
    }),
    signalPairs = eligibleRows.flatMap(({ timestamp, confirmed }) => {
      const candleIndex = candleIndexByTimestamp.get(timestamp);
      if (candleIndex === undefined || candleIndex < 2) return [];
      if (
        input.candles[candleIndex - 1]!.timestamp.getTime() !== timestamp - 60_000 ||
        input.candles[candleIndex - 2]!.timestamp.getTime() !== timestamp - 120_000
      )
        return [];
      const returns = [
        ratioReturns1m[candleIndex - 2],
        ratioReturns1m[candleIndex - 1],
        ratioReturns1m[candleIndex],
      ];
      if (returns.some((value) => value === null)) return [];
      const typedReturns = returns as [number, number, number];
      if (!matchesRegimePullbackTurn(confirmed.allowedDirection, typedReturns)) return [];
      const allowed = samplesByKey.get(
          getShadowOutcomeCacheKey(timestamp, confirmed.allowedDirection),
        ),
        oppositeDirection: pair_direction =
          confirmed.allowedDirection === 'LONG_BTC_SHORT_ETH'
            ? 'SHORT_BTC_LONG_ETH'
            : 'LONG_BTC_SHORT_ETH',
        opposite = samplesByKey.get(getShadowOutcomeCacheKey(timestamp, oppositeDirection));
      if (!allowed || !opposite) return [];
      return [
        {
          confirmed,
          allowed,
          opposite,
          record: {
            signalTimestamp: timestamp,
            targetBlockIndex: confirmed.target.blockIndex,
            sourceBlockIndexMinus2: confirmed.sourceMinus2.blockIndex,
            sourceBlockIndexMinus1: confirmed.sourceMinus1.blockIndex,
            allowedDirection: confirmed.allowedDirection,
            ratioReturnTMinus2: typedReturns[0],
            ratioReturnTMinus1: typedReturns[1],
            ratioReturnT: typedReturns[2],
            ratioAtSignal: ratios[candleIndex]!,
            outcome: allowed.outcome.exitReason,
            holdingBars: allowed.outcome.holdingBars,
            grossPairPnL: allowed.outcome.grossPairPnL,
            netPairPnL: allowed.outcome.netPairPnL,
            totalCosts: allowed.outcome.totalCosts,
            oppositeDirectionOutcome: opposite.outcome,
          },
        },
      ];
    }),
    allowedSamples = signalPairs.map((value) => value.allowed),
    oppositeSamples = signalPairs.map((value) => value.opposite),
    aggregate = calculateBucketMetrics(allowedSamples),
    oppositeAggregate = calculateBucketMetrics(oppositeSamples),
    confirmedRegimeOnlySamples = eligibleRows.flatMap(({ timestamp, confirmed }) => {
      const sample = samplesByKey.get(
        getShadowOutcomeCacheKey(timestamp, confirmed.allowedDirection),
      );
      return sample ? [sample] : [];
    }),
    confirmedRegimeOnly = calculateBucketMetrics(confirmedRegimeOnlySamples),
    difference = (left: number | null, right: number | null) =>
      left === null || right === null ? null : left - right,
    byAllowedDirection = Object.fromEntries(
      ShadowDirections.map((direction) => [
        direction,
        calculateBucketMetrics(
          allowedSamples.filter((sample) => sample.outcome.direction === direction),
        ),
      ]),
    ) as Record<pair_direction, bucket_metrics>,
    byTargetBlock = targets.map((target) => {
      const blockMetrics = calculateBucketMetrics(
        signalPairs
          .filter((value) => value.confirmed.target.blockIndex === target.target.blockIndex)
          .map((value) => value.allowed),
      );
      return {
        targetBlockIndex: target.target.blockIndex,
        sourceBlockIndexMinus2: target.sourceMinus2.blockIndex,
        sourceBlockIndexMinus1: target.sourceMinus1.blockIndex,
        winnerMinus2: target.sourceMinus2.winner,
        winnerMinus1: target.sourceMinus1.winner,
        confirmedRegime: target.confirmedRegime,
        allowedDirection: target.allowedDirection,
        signalCount: blockMetrics.sampleCount,
        resolvedCount: blockMetrics.resolvedCount,
        tpBeforeSlRate: blockMetrics.tpBeforeSlRate,
        grossProfitFactor: blockMetrics.grossProfitFactor,
        netProfitFactor: blockMetrics.netProfitFactor,
      };
    }),
    oneWeek = input.oneWeekPullback.aggregate,
    classification = classifyTwoWeekRegimePullback({
      resolvedCount: aggregate.resolvedCount,
      tpBeforeSlRate: aggregate.tpBeforeSlRate,
      grossProfitFactor: aggregate.grossProfitFactor,
      oppositeGrossProfitFactor: oppositeAggregate.grossProfitFactor,
      oneWeekGrossProfitFactor: oneWeek.grossProfitFactor,
    });
  return {
    alphaId: TwoWeekConfirmedRegimePullbackAlphaId,
    confirmationRule:
      'winner[target-2] == winner[target-1], both reliable and COMPLETE 7-day blocks',
    totalTargetBlocksEvaluated: targets.length,
    confirmedRegimeBlockCount: confirmedTargets.length,
    noConfirmedRegimeBlockCount: targets.length - confirmedTargets.length,
    eligibleConfirmedRegimeSampledTimestampCount: eligibleRows.length,
    signalCount: signalPairs.length,
    signalRate: eligibleRows.length === 0 ? 0 : signalPairs.length / eligibleRows.length,
    signals: signalPairs.map((value) => value.record),
    aggregate,
    byAllowedDirection,
    byTargetBlock,
    oneWeekPullbackComparison: {
      oneWeekPullbackResolvedCount: oneWeek.resolvedCount,
      oneWeekPullbackTPBeforeSLRate: oneWeek.tpBeforeSlRate,
      oneWeekPullbackGrossProfitFactor: oneWeek.grossProfitFactor,
      oneWeekPullbackNetProfitFactor: oneWeek.netProfitFactor,
      twoWeekMinusOneWeekTPRate: difference(aggregate.tpBeforeSlRate, oneWeek.tpBeforeSlRate),
      twoWeekMinusOneWeekGrossPF: difference(
        aggregate.grossProfitFactor,
        oneWeek.grossProfitFactor,
      ),
      twoWeekMinusOneWeekNetPF: difference(aggregate.netProfitFactor, oneWeek.netProfitFactor),
    },
    confirmedRegimeOnlyComparison: {
      confirmedRegimeOnlyResolvedCount: confirmedRegimeOnly.resolvedCount,
      confirmedRegimeOnlyTPBeforeSLRate: confirmedRegimeOnly.tpBeforeSlRate,
      confirmedRegimeOnlyGrossProfitFactor: confirmedRegimeOnly.grossProfitFactor,
      confirmedRegimeOnlyNetProfitFactor: confirmedRegimeOnly.netProfitFactor,
      pullbackMinusConfirmedRegimeOnlyTPRate: difference(
        aggregate.tpBeforeSlRate,
        confirmedRegimeOnly.tpBeforeSlRate,
      ),
      pullbackMinusConfirmedRegimeOnlyGrossPF: difference(
        aggregate.grossProfitFactor,
        confirmedRegimeOnly.grossProfitFactor,
      ),
      pullbackMinusConfirmedRegimeOnlyNetPF: difference(
        aggregate.netProfitFactor,
        confirmedRegimeOnly.netProfitFactor,
      ),
    },
    oppositeDirectionComparison: {
      oppositeDirectionResolvedCount: oppositeAggregate.resolvedCount,
      oppositeDirectionTPBeforeSLRate: oppositeAggregate.tpBeforeSlRate,
      oppositeDirectionGrossProfitFactor: oppositeAggregate.grossProfitFactor,
      oppositeDirectionNetProfitFactor: oppositeAggregate.netProfitFactor,
    },
    classification,
  };
}

export function selectFrozenDiscoveryDirection(
  directions: Record<pair_direction, bucket_metrics>,
  minimumResolved = MinimumDiscoveryResolvedPerDirection,
): { direction: pair_direction | null; reason: string } {
  const long = directions.LONG_BTC_SHORT_ETH,
    short = directions.SHORT_BTC_LONG_ETH;
  if (long.resolvedCount < minimumResolved || short.resolvedCount < minimumResolved)
    return {
      direction: null,
      reason: 'NO_RELIABLE_DIRECTION_PREFERENCE:MINIMUM_DISCOVERY_RESOLVED_NOT_MET',
    };
  if (long.grossProfitFactor === null || short.grossProfitFactor === null)
    return { direction: null, reason: 'NO_RELIABLE_DIRECTION_PREFERENCE:INCOMPARABLE_GROSS_PF' };
  if (long.grossProfitFactor !== short.grossProfitFactor)
    return {
      direction:
        long.grossProfitFactor > short.grossProfitFactor
          ? 'LONG_BTC_SHORT_ETH'
          : 'SHORT_BTC_LONG_ETH',
      reason: 'HIGHER_DISCOVERY_GROSS_PROFIT_FACTOR',
    };
  if (long.tpBeforeSlRate !== short.tpBeforeSlRate)
    return {
      direction:
        (long.tpBeforeSlRate ?? -1) > (short.tpBeforeSlRate ?? -1)
          ? 'LONG_BTC_SHORT_ETH'
          : 'SHORT_BTC_LONG_ETH',
      reason: 'DISCOVERY_TP_RATE_TIE_BREAKER',
    };
  if (long.resolvedCount !== short.resolvedCount)
    return {
      direction:
        long.resolvedCount > short.resolvedCount ? 'LONG_BTC_SHORT_ETH' : 'SHORT_BTC_LONG_ETH',
      reason: 'DISCOVERY_RESOLVED_COUNT_TIE_BREAKER',
    };
  return { direction: null, reason: 'NO_RELIABLE_DIRECTION_PREFERENCE:EXACT_TIE' };
}

export function classifyFrozenDirectionHoldout(input: {
  resolvedCount: number;
  tpBeforeSlRate: number | null;
  grossProfitFactor: number | null;
  oppositeGrossProfitFactor: number | null;
  unfilteredGrossProfitFactor: number | null;
}):
  | 'FROZEN_DIRECTION_HOLDOUT_PROMISING'
  | 'FROZEN_DIRECTION_HOLDOUT_INTERESTING'
  | 'NO_USEFUL_FROZEN_DIRECTION_HOLDOUT_EDGE' {
  const grossPF = input.grossProfitFactor;
  if (
    input.resolvedCount >= 100 &&
    (input.tpBeforeSlRate ?? 0) >= 0.67 &&
    grossPF !== null &&
    grossPF >= 1 &&
    input.oppositeGrossProfitFactor !== null &&
    input.unfilteredGrossProfitFactor !== null &&
    grossPF > input.oppositeGrossProfitFactor &&
    grossPF > input.unfilteredGrossProfitFactor
  )
    return 'FROZEN_DIRECTION_HOLDOUT_PROMISING';
  if (
    input.resolvedCount >= 100 &&
    ((input.tpBeforeSlRate ?? 0) >= 0.6 || (grossPF ?? 0) >= 0.8) &&
    grossPF !== null &&
    input.unfilteredGrossProfitFactor !== null &&
    grossPF > input.unfilteredGrossProfitFactor
  )
    return 'FROZEN_DIRECTION_HOLDOUT_INTERESTING';
  return 'NO_USEFUL_FROZEN_DIRECTION_HOLDOUT_EDGE';
}

export function buildFrozenDirectionRegimePullbackHoldoutV1(input: {
  samples: readonly labeled_shadow_sample[];
  regime: ReturnType<typeof buildRegimePersistence7d>;
  oneWeekPullback: ReturnType<typeof buildRegimePullbackEntryV1>;
  splitTimestamp: number | null;
}) {
  const samplesByKey = new Map(
      input.samples.map((sample) => [
        getShadowOutcomeCacheKey(sample.outcome.signalTimestamp, sample.outcome.direction),
        sample,
      ]),
    ),
    splitByTimestamp = new Map(
      input.samples.map((sample) => [sample.outcome.signalTimestamp, sample.split]),
    ),
    discoverySignals = input.oneWeekPullback.signals.filter(
      (signal) => splitByTimestamp.get(signal.signalTimestamp) === 'DISCOVERY',
    ),
    discoveryDirectionMetrics = Object.fromEntries(
      ShadowDirections.map((direction) => [
        direction,
        calculateBucketMetrics(
          discoverySignals.flatMap((signal) => {
            if (signal.allowedDirection !== direction) return [];
            const sample = samplesByKey.get(
              getShadowOutcomeCacheKey(signal.signalTimestamp, direction),
            );
            return sample ? [sample] : [];
          }),
        ),
      ]),
    ) as Record<pair_direction, bucket_metrics>,
    selection = selectFrozenDiscoveryDirection(discoveryDirectionMetrics),
    holdoutTimestamps = [
      ...new Set(
        input.samples
          .filter((sample) => sample.split === 'HOLDOUT')
          .map((sample) => sample.outcome.signalTimestamp),
      ),
    ],
    transitionByTarget = new Map(
      input.regime.causalTransitions.map((transition) => [transition.targetBlockIndex, transition]),
    ),
    firstBlockStart = input.regime.blocks[0]?.startTimestamp,
    holdoutRows = holdoutTimestamps.map((timestamp) => {
      const blockIndex =
          firstBlockStart === undefined
            ? -1
            : Math.floor((timestamp - firstBlockStart) / RegimeBlockMilliseconds),
        transition = transitionByTarget.get(blockIndex);
      return { timestamp, blockIndex, transition };
    }),
    holdoutPullbackSignals = input.oneWeekPullback.signals.filter(
      (signal) => splitByTimestamp.get(signal.signalTimestamp) === 'HOLDOUT',
    ),
    acceptedSignals =
      selection.direction === null
        ? []
        : holdoutPullbackSignals.filter(
            (signal) => signal.allowedDirection === selection.direction,
          ),
    samplesForSignals = (
      signals: readonly (typeof input.oneWeekPullback.signals)[number][],
      opposite = false,
    ) =>
      signals.flatMap((signal) => {
        const direction: pair_direction = opposite
            ? signal.allowedDirection === 'LONG_BTC_SHORT_ETH'
              ? 'SHORT_BTC_LONG_ETH'
              : 'LONG_BTC_SHORT_ETH'
            : signal.allowedDirection,
          sample = samplesByKey.get(getShadowOutcomeCacheKey(signal.signalTimestamp, direction));
        return sample ? [sample] : [];
      }),
    acceptedSamples = samplesForSignals(acceptedSignals),
    oppositeSamples = samplesForSignals(acceptedSignals, true),
    unfilteredSamples = samplesForSignals(holdoutPullbackSignals),
    frozenRegimeOnlySamples =
      selection.direction === null
        ? []
        : holdoutRows.flatMap(({ timestamp, transition }) => {
            if (transition?.predictedDirection !== selection.direction) return [];
            const sample = samplesByKey.get(
              getShadowOutcomeCacheKey(timestamp, selection.direction),
            );
            return sample ? [sample] : [];
          }),
    holdoutAggregate = calculateBucketMetrics(acceptedSamples),
    oppositeAggregate = calculateBucketMetrics(oppositeSamples),
    unfilteredAggregate = calculateBucketMetrics(unfilteredSamples),
    frozenRegimeOnlyAggregate = calculateBucketMetrics(frozenRegimeOnlySamples),
    difference = (left: number | null, right: number | null) =>
      left === null || right === null ? null : left - right,
    holdoutBlocks = [...new Set(holdoutRows.map((row) => row.blockIndex))],
    byHoldoutTargetBlock = holdoutBlocks.map((blockIndex) => {
      const block = input.regime.blocks[blockIndex],
        transition = transitionByTarget.get(blockIndex),
        pullbackSignals = holdoutPullbackSignals.filter(
          (signal) => signal.targetBlockIndex === blockIndex,
        ),
        accepted = acceptedSignals.filter((signal) => signal.targetBlockIndex === blockIndex),
        metrics = calculateBucketMetrics(samplesForSignals(accepted));
      return {
        targetBlockIndex: blockIndex,
        startTimestamp: block?.startTimestamp ?? null,
        allowedRegimeDirection: transition?.predictedDirection ?? null,
        matchesFrozenPreferredDirection:
          selection.direction !== null && transition?.predictedDirection === selection.direction,
        pullbackSignalCount: pullbackSignals.length,
        acceptedSignalCount: accepted.length,
        resolvedCount: metrics.resolvedCount,
        tpBeforeSlRate: metrics.tpBeforeSlRate,
        grossProfitFactor: metrics.grossProfitFactor,
        netProfitFactor: metrics.netProfitFactor,
      };
    }),
    classification = classifyFrozenDirectionHoldout({
      resolvedCount: holdoutAggregate.resolvedCount,
      tpBeforeSlRate: holdoutAggregate.tpBeforeSlRate,
      grossProfitFactor: holdoutAggregate.grossProfitFactor,
      oppositeGrossProfitFactor: oppositeAggregate.grossProfitFactor,
      unfilteredGrossProfitFactor: unfilteredAggregate.grossProfitFactor,
    });
  return {
    alphaId: FrozenDirectionHoldoutAlphaId,
    split: { method: 'CHRONOLOGICAL_70_30', splitTimestamp: input.splitTimestamp },
    minimumDiscoveryResolvedPerDirection: MinimumDiscoveryResolvedPerDirection,
    discoveryDirectionMetrics,
    frozenPreferredDirection: selection.direction ?? 'NO_RELIABLE_DIRECTION_PREFERENCE',
    directionSelectionReason: selection.reason,
    holdoutSignalFrequency: {
      holdoutSampledTimestampCount: holdoutTimestamps.length,
      holdoutReliableRegimeTimestampCount: holdoutRows.filter((row) => row.transition !== undefined)
        .length,
      holdoutPullbackSignalCountBeforeDirectionFilter: holdoutPullbackSignals.length,
      holdoutAcceptedSignalCount: acceptedSignals.length,
      holdoutDirectionRejectedSignalCount: holdoutPullbackSignals.length - acceptedSignals.length,
      acceptedSignalRate:
        holdoutTimestamps.length === 0 ? 0 : acceptedSignals.length / holdoutTimestamps.length,
    },
    holdoutAggregate,
    unfilteredHoldoutComparison: {
      unfilteredHoldoutResolvedCount: unfilteredAggregate.resolvedCount,
      unfilteredHoldoutTPBeforeSLRate: unfilteredAggregate.tpBeforeSlRate,
      unfilteredHoldoutGrossProfitFactor: unfilteredAggregate.grossProfitFactor,
      unfilteredHoldoutNetProfitFactor: unfilteredAggregate.netProfitFactor,
      frozenMinusUnfilteredTPRate: difference(
        holdoutAggregate.tpBeforeSlRate,
        unfilteredAggregate.tpBeforeSlRate,
      ),
      frozenMinusUnfilteredGrossPF: difference(
        holdoutAggregate.grossProfitFactor,
        unfilteredAggregate.grossProfitFactor,
      ),
      frozenMinusUnfilteredNetPF: difference(
        holdoutAggregate.netProfitFactor,
        unfilteredAggregate.netProfitFactor,
      ),
    },
    frozenDirectionRegimeOnlyComparison: {
      frozenDirectionRegimeOnlyResolvedCount: frozenRegimeOnlyAggregate.resolvedCount,
      frozenDirectionRegimeOnlyTPBeforeSLRate: frozenRegimeOnlyAggregate.tpBeforeSlRate,
      frozenDirectionRegimeOnlyGrossProfitFactor: frozenRegimeOnlyAggregate.grossProfitFactor,
      frozenDirectionRegimeOnlyNetProfitFactor: frozenRegimeOnlyAggregate.netProfitFactor,
      pullbackMinusRegimeOnlyTPRate: difference(
        holdoutAggregate.tpBeforeSlRate,
        frozenRegimeOnlyAggregate.tpBeforeSlRate,
      ),
      pullbackMinusRegimeOnlyGrossPF: difference(
        holdoutAggregate.grossProfitFactor,
        frozenRegimeOnlyAggregate.grossProfitFactor,
      ),
      pullbackMinusRegimeOnlyNetPF: difference(
        holdoutAggregate.netProfitFactor,
        frozenRegimeOnlyAggregate.netProfitFactor,
      ),
    },
    oppositeDirectionComparison: {
      oppositeResolvedCount: oppositeAggregate.resolvedCount,
      oppositeTPBeforeSLRate: oppositeAggregate.tpBeforeSlRate,
      oppositeGrossProfitFactor: oppositeAggregate.grossProfitFactor,
      oppositeNetProfitFactor: oppositeAggregate.netProfitFactor,
    },
    byHoldoutTargetBlock,
    classification,
  };
}

export function calculateRegimeStrength(block: regime_block): {
  winnerGrossPF: number;
  loserGrossPF: number;
  regimeStrength: number;
} | null {
  if (block.winner === 'NO_RELIABLE_WINNER') return null;
  const loserDirection: pair_direction =
      block.winner === 'LONG_BTC_SHORT_ETH' ? 'SHORT_BTC_LONG_ETH' : 'LONG_BTC_SHORT_ETH',
    winnerGrossPF = block.directions[block.winner].grossProfitFactor,
    loserGrossPF = block.directions[loserDirection].grossProfitFactor;
  if (winnerGrossPF === null || loserGrossPF === null) return null;
  return { winnerGrossPF, loserGrossPF, regimeStrength: winnerGrossPF - loserGrossPF };
}

export function calculateStrengthMonotonicity(
  metricsByBucket: Record<regime_strength_bucket, bucket_metrics>,
): { eligibleBucketCount: number; grossPFNonDecreasing: boolean; tpRateNonDecreasing: boolean } {
  const eligible = RegimeStrengthBuckets.map((bucket) => metricsByBucket[bucket]).filter(
      (metrics) => metrics.resolvedCount >= 100,
    ),
    nonDecreasing = (values: readonly (number | null)[]) =>
      values.every(
        (value, index) => value !== null && (index === 0 || value >= values[index - 1]!),
      );
  return {
    eligibleBucketCount: eligible.length,
    grossPFNonDecreasing: nonDecreasing(eligible.map((metrics) => metrics.grossProfitFactor)),
    tpRateNonDecreasing: nonDecreasing(eligible.map((metrics) => metrics.tpBeforeSlRate)),
  };
}

export function classifyRegimeStrengthRelationship(input: {
  overallByStrengthBucket: Record<regime_strength_bucket, bucket_metrics>;
  holdoutByStrengthBucket: Record<regime_strength_bucket, bucket_metrics>;
  monotonicity: ReturnType<typeof calculateStrengthMonotonicity>;
}):
  | 'REGIME_STRENGTH_RELATIONSHIP_PROMISING'
  | 'REGIME_STRENGTH_RELATIONSHIP_INTERESTING'
  | 'NO_USEFUL_REGIME_STRENGTH_RELATIONSHIP' {
  const eligibleBuckets = RegimeStrengthBuckets.filter(
      (bucket) => input.overallByStrengthBucket[bucket].resolvedCount >= 100,
    ),
    strongestBucket = eligibleBuckets.at(-1),
    strongestOverall = strongestBucket ? input.overallByStrengthBucket[strongestBucket] : null,
    strongestHoldout = strongestBucket ? input.holdoutByStrengthBucket[strongestBucket] : null;
  if (
    eligibleBuckets.length >= 3 &&
    input.monotonicity.grossPFNonDecreasing &&
    (strongestOverall?.grossProfitFactor ?? 0) >= 1 &&
    (strongestOverall?.tpBeforeSlRate ?? 0) >= 0.6 &&
    (strongestHoldout?.resolvedCount ?? 0) >= 80 &&
    (strongestHoldout?.grossProfitFactor ?? 0) >= 1
  )
    return 'REGIME_STRENGTH_RELATIONSHIP_PROMISING';
  if (
    eligibleBuckets.length >= 3 &&
    (strongestOverall?.grossProfitFactor ?? 0) >= 0.8 &&
    (strongestHoldout?.resolvedCount ?? 0) >= 80 &&
    (strongestHoldout?.grossProfitFactor ?? 0) >= 0.8
  )
    return 'REGIME_STRENGTH_RELATIONSHIP_INTERESTING';
  return 'NO_USEFUL_REGIME_STRENGTH_RELATIONSHIP';
}

export function buildCausalRegimeStrengthPullbackV1(input: {
  samples: readonly labeled_shadow_sample[];
  regime: ReturnType<typeof buildRegimePersistence7d>;
  oneWeekPullback: ReturnType<typeof buildRegimePullbackEntryV1>;
}) {
  const samplesByKey = new Map(
      input.samples.map((sample) => [
        getShadowOutcomeCacheKey(sample.outcome.signalTimestamp, sample.outcome.direction),
        sample,
      ]),
    ),
    splitByTimestamp = new Map(
      input.samples.map((sample) => [sample.outcome.signalTimestamp, sample.split]),
    ),
    targetDiagnostics = input.regime.causalTransitions.flatMap((transition) => {
      const source = input.regime.blocks[transition.sourceBlockIndex],
        strength = source ? calculateRegimeStrength(source) : null;
      if (!source || !strength) return [];
      return [
        {
          transition,
          source,
          ...strength,
          regimeStrengthBucket: classifyRegimeStrengthBucket(strength.regimeStrength),
        },
      ];
    }),
    diagnosticByTarget = new Map(
      targetDiagnostics.map((diagnostic) => [diagnostic.transition.targetBlockIndex, diagnostic]),
    ),
    signalDiagnostics = input.oneWeekPullback.signals.flatMap((signal) => {
      const diagnostic = diagnosticByTarget.get(signal.targetBlockIndex),
        sample = samplesByKey.get(
          getShadowOutcomeCacheKey(signal.signalTimestamp, signal.allowedDirection),
        ),
        split = splitByTimestamp.get(signal.signalTimestamp);
      if (!diagnostic || !sample || !split) return [];
      return [{ signal, sample, diagnostic, split }];
    }),
    samplesFor = (
      bucket: regime_strength_bucket,
      split?: discovery_split,
      direction?: pair_direction,
    ) =>
      signalDiagnostics
        .filter(
          (value) =>
            value.diagnostic.regimeStrengthBucket === bucket &&
            (split === undefined || value.split === split) &&
            (direction === undefined || value.signal.allowedDirection === direction),
        )
        .map((value) => value.sample),
    metricsByBucket = (split?: discovery_split) =>
      Object.fromEntries(
        RegimeStrengthBuckets.map((bucket) => [
          bucket,
          calculateBucketMetrics(samplesFor(bucket, split)),
        ]),
      ) as Record<regime_strength_bucket, bucket_metrics>,
    overallByStrengthBucket = Object.fromEntries(
      RegimeStrengthBuckets.map((bucket) => {
        const diagnostics = targetDiagnostics.filter(
            (value) => value.regimeStrengthBucket === bucket,
          ),
          strengths = diagnostics.map((value) => value.regimeStrength),
          metrics = calculateBucketMetrics(samplesFor(bucket));
        return [
          bucket,
          {
            sourceBlockCount: new Set(diagnostics.map((value) => value.transition.sourceBlockIndex))
              .size,
            targetBlockCount: new Set(diagnostics.map((value) => value.transition.targetBlockIndex))
              .size,
            signalCount: metrics.sampleCount,
            ...metrics,
            meanRegimeStrength:
              strengths.length === 0
                ? null
                : strengths.reduce((sum, value) => sum + value, 0) / strengths.length,
            minRegimeStrength: strengths.length === 0 ? null : Math.min(...strengths),
            maxRegimeStrength: strengths.length === 0 ? null : Math.max(...strengths),
          },
        ];
      }),
    ),
    discoveryByStrengthBucket = metricsByBucket('DISCOVERY'),
    holdoutByStrengthBucket = metricsByBucket('HOLDOUT'),
    overallCore = Object.fromEntries(
      RegimeStrengthBuckets.map((bucket) => [bucket, calculateBucketMetrics(samplesFor(bucket))]),
    ) as Record<regime_strength_bucket, bucket_metrics>,
    byStrengthBucketAndDirection = Object.fromEntries(
      RegimeStrengthBuckets.map((bucket) => [
        bucket,
        Object.fromEntries(
          ShadowDirections.map((direction) => [
            direction,
            calculateBucketMetrics(samplesFor(bucket, undefined, direction)),
          ]),
        ) as Record<pair_direction, bucket_metrics>,
      ]),
    ),
    byTargetBlock = targetDiagnostics.map((diagnostic) => {
      const metrics = calculateBucketMetrics(
        signalDiagnostics
          .filter(
            (value) =>
              value.diagnostic.transition.targetBlockIndex ===
              diagnostic.transition.targetBlockIndex,
          )
          .map((value) => value.sample),
      );
      return {
        sourceBlockIndex: diagnostic.transition.sourceBlockIndex,
        targetBlockIndex: diagnostic.transition.targetBlockIndex,
        sourceWinnerDirection: diagnostic.transition.predictedDirection,
        winnerGrossPF: diagnostic.winnerGrossPF,
        loserGrossPF: diagnostic.loserGrossPF,
        regimeStrength: diagnostic.regimeStrength,
        regimeStrengthBucket: diagnostic.regimeStrengthBucket,
        signalCount: metrics.sampleCount,
        resolvedCount: metrics.resolvedCount,
        tpBeforeSlRate: metrics.tpBeforeSlRate,
        grossProfitFactor: metrics.grossProfitFactor,
        netProfitFactor: metrics.netProfitFactor,
      };
    }),
    monotonicity = calculateStrengthMonotonicity(overallCore),
    baselineDiscovery = discoveryByStrengthBucket.STRENGTH_0_TO_0_10,
    baselineHoldout = holdoutByStrengthBucket.STRENGTH_0_TO_0_10,
    holdoutConsistency = Object.fromEntries(
      RegimeStrengthBuckets.map((bucket) => {
        const discovery = discoveryByStrengthBucket[bucket],
          holdout = holdoutByStrengthBucket[bucket],
          calculateConsistency = () => {
            if (
              bucket !== 'STRENGTH_0_TO_0_10' &&
              discovery.resolvedCount >= 100 &&
              holdout.resolvedCount >= 80 &&
              baselineDiscovery.resolvedCount >= 100 &&
              baselineHoldout.resolvedCount >= 80 &&
              discovery.grossProfitFactor !== null &&
              holdout.grossProfitFactor !== null &&
              baselineDiscovery.grossProfitFactor !== null &&
              baselineHoldout.grossProfitFactor !== null
            )
              return (
                discovery.grossProfitFactor > baselineDiscovery.grossProfitFactor &&
                holdout.grossProfitFactor > baselineHoldout.grossProfitFactor
              );
            return null;
          };
        return [
          bucket,
          {
            discoveryGrossPF: discovery.grossProfitFactor,
            holdoutGrossPF: holdout.grossProfitFactor,
            discoveryTPRate: discovery.tpBeforeSlRate,
            holdoutTPRate: holdout.tpBeforeSlRate,
            grossPFDirectionConsistent: calculateConsistency(),
          },
        ];
      }),
    ),
    classification = classifyRegimeStrengthRelationship({
      overallByStrengthBucket: overallCore,
      holdoutByStrengthBucket,
      monotonicity,
    });
  return {
    diagnosticId: CausalRegimeStrengthDiagnosticId,
    definition: 'regimeStrength = source winner grossProfitFactor - source loser grossProfitFactor',
    bucketDefinitions: {
      STRENGTH_0_TO_0_10: '[0.00, 0.10)',
      STRENGTH_0_10_TO_0_20: '[0.10, 0.20)',
      STRENGTH_0_20_TO_0_30: '[0.20, 0.30)',
      STRENGTH_0_30_PLUS: '[0.30, +infinity)',
    },
    overallByStrengthBucket,
    discoveryByStrengthBucket,
    holdoutByStrengthBucket,
    byStrengthBucketAndDirection,
    byTargetBlock,
    monotonicity,
    holdoutConsistency,
    classification,
  };
}

export type relative_drift_metrics = {
  windowCount: number;
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  positiveRate: number | null;
  negativeRate: number | null;
  meanRelativeReturn: number | null;
  medianRelativeReturn: number | null;
  minRelativeReturn: number | null;
  maxRelativeReturn: number | null;
  cumulativeCompoundedRelativeReturn: number | null;
};

export function calculateRelativeDriftMetrics(returns: readonly number[]): relative_drift_metrics {
  const positiveCount = returns.filter((value) => value > 0).length,
    negativeCount = returns.filter((value) => value < 0).length,
    zeroCount = returns.length - positiveCount - negativeCount;
  return {
    windowCount: returns.length,
    positiveCount,
    negativeCount,
    zeroCount,
    positiveRate: returns.length === 0 ? null : positiveCount / returns.length,
    negativeRate: returns.length === 0 ? null : negativeCount / returns.length,
    meanRelativeReturn:
      returns.length === 0 ? null : returns.reduce((sum, value) => sum + value, 0) / returns.length,
    medianRelativeReturn: returns.length === 0 ? null : median(returns),
    minRelativeReturn: returns.length === 0 ? null : Math.min(...returns),
    maxRelativeReturn: returns.length === 0 ? null : Math.max(...returns),
    cumulativeCompoundedRelativeReturn:
      returns.length === 0
        ? null
        : returns.reduce((product, value) => product * (1 + value), 1) - 1,
  };
}

export function classifyRelativeDriftBias(
  metrics: relative_drift_metrics,
): 'LONG_BTC_SHORT_ETH' | 'SHORT_BTC_LONG_ETH' | 'NEUTRAL' {
  if ((metrics.medianRelativeReturn ?? 0) > 0) return 'LONG_BTC_SHORT_ETH';
  if ((metrics.medianRelativeReturn ?? 0) < 0) return 'SHORT_BTC_LONG_ETH';
  return 'NEUTRAL';
}

export function classifyRelativeDriftStrength(
  metrics: relative_drift_metrics,
):
  | 'STRONG_LONG_BTC_SHORT_ETH_BIAS'
  | 'MODERATE_LONG_BTC_SHORT_ETH_BIAS'
  | 'NO_CLEAR_LONG_BTC_SHORT_ETH_BIAS' {
  if (
    metrics.windowCount >= 5 &&
    (metrics.positiveRate ?? 0) >= 0.7 &&
    (metrics.medianRelativeReturn ?? 0) > 0
  )
    return 'STRONG_LONG_BTC_SHORT_ETH_BIAS';
  if (
    metrics.windowCount >= 5 &&
    (metrics.positiveRate ?? 0) >= 0.6 &&
    (metrics.medianRelativeReturn ?? 0) > 0
  )
    return 'MODERATE_LONG_BTC_SHORT_ETH_BIAS';
  return 'NO_CLEAR_LONG_BTC_SHORT_ETH_BIAS';
}

export function classifyRelativeDriftConclusion(
  horizons: readonly {
    horizonDays: number;
    holdout: relative_drift_metrics;
    directionConsistent: boolean;
  }[],
):
  | 'PERSISTENT_LONG_BTC_SHORT_ETH_DRIFT'
  | 'PARTIAL_LONG_BTC_SHORT_ETH_DRIFT'
  | 'NO_PERSISTENT_LONG_BTC_SHORT_ETH_DRIFT' {
  const qualifies = (days: number) => {
      const horizon = horizons.find((value) => value.horizonDays === days);
      return Boolean(
        horizon?.directionConsistent &&
        (horizon.holdout.medianRelativeReturn ?? 0) > 0 &&
        (horizon.holdout.positiveRate ?? 0) >= 0.6,
      );
    },
    sevenDays = qualifies(7),
    fourteenDays = qualifies(14);
  if (sevenDays && fourteenDays) return 'PERSISTENT_LONG_BTC_SHORT_ETH_DRIFT';
  if (sevenDays || fourteenDays) return 'PARTIAL_LONG_BTC_SHORT_ETH_DRIFT';
  return 'NO_PERSISTENT_LONG_BTC_SHORT_ETH_DRIFT';
}

export function buildBTCEthRelativeDriftV1(candles: readonly synchronized_pair_candle[]) {
  if (candles.length === 0)
    return {
      diagnosticId: BTCEthRelativeDriftDiagnosticId,
      dataRange: null,
      fullPeriod: null,
      split: { method: 'CHRONOLOGICAL_70_30', splitTimestamp: null },
      horizons: [],
      conclusion: 'NO_PERSISTENT_LONG_BTC_SHORT_ETH_DRIFT' as const,
    };
  const ratios = candles.map((candle) => candle.btc.close / candle.eth.close),
    first = candles[0]!,
    last = candles.at(-1)!,
    firstRatio = ratios[0]!,
    lastRatio = ratios.at(-1)!,
    splitIndex = Math.floor(candles.length * 0.7),
    splitTimestamp = candles[Math.min(splitIndex, candles.length - 1)]!.timestamp.getTime(),
    horizons = RelativeDriftHorizons.map(({ horizonDays, horizonBars }) => {
      const windows: { value: number; split: discovery_split | 'CROSS_BOUNDARY' }[] = [];
      for (
        let startIndex = 0;
        startIndex + horizonBars < candles.length;
        startIndex += horizonBars
      ) {
        const endIndex = startIndex + horizonBars,
          startTimestamp = candles[startIndex]!.timestamp.getTime(),
          endTimestamp = candles[endIndex]!.timestamp.getTime(),
          split: discovery_split | 'CROSS_BOUNDARY' =
            endTimestamp <= splitTimestamp
              ? 'DISCOVERY'
              : startTimestamp > splitTimestamp
                ? 'HOLDOUT'
                : 'CROSS_BOUNDARY';
        windows.push({ value: ratios[endIndex]! / ratios[startIndex]! - 1, split });
      }
      const overall = calculateRelativeDriftMetrics(windows.map((window) => window.value)),
        discovery = calculateRelativeDriftMetrics(
          windows.filter((window) => window.split === 'DISCOVERY').map((window) => window.value),
        ),
        holdout = calculateRelativeDriftMetrics(
          windows.filter((window) => window.split === 'HOLDOUT').map((window) => window.value),
        ),
        discoveryBias = classifyRelativeDriftBias(discovery),
        holdoutBias = classifyRelativeDriftBias(holdout);
      return {
        horizonDays,
        horizonBars,
        overall,
        discovery,
        holdout,
        crossBoundaryWindowCount: windows.filter((window) => window.split === 'CROSS_BOUNDARY')
          .length,
        discoveryBias,
        holdoutBias,
        directionConsistent: discoveryBias !== 'NEUTRAL' && discoveryBias === holdoutBias,
        biasStrengthLabel: classifyRelativeDriftStrength(holdout),
      };
    });
  return {
    diagnosticId: BTCEthRelativeDriftDiagnosticId,
    dataRange: {
      firstTimestamp: first.timestamp.getTime(),
      lastTimestamp: last.timestamp.getTime(),
    },
    fullPeriod: {
      firstBTCPrice: first.btc.close,
      lastBTCPrice: last.btc.close,
      firstETHPrice: first.eth.close,
      lastETHPrice: last.eth.close,
      firstBTCETHRatio: firstRatio,
      lastBTCETHRatio: lastRatio,
      fullPeriodRelativeReturn: lastRatio / firstRatio - 1,
      fullPeriodRelativeReturnPercent: (lastRatio / firstRatio - 1) * 100,
    },
    split: { method: 'CHRONOLOGICAL_70_30', splitTimestamp },
    horizons,
    conclusion: classifyRelativeDriftConclusion(horizons),
  };
}

export function getTp3Sl3ExperimentCacheKey(timestamp: number, direction: pair_direction): string {
  return `${timestamp}:${direction}:TP3_SL3`;
}

type tp3_sl3_transition_key =
  | 'BASELINE_TP_TO_EXPERIMENT_TP'
  | 'BASELINE_TP_TO_EXPERIMENT_SL'
  | 'BASELINE_TP_TO_EXPERIMENT_MARGIN_GUARD'
  | 'BASELINE_TP_TO_EXPERIMENT_UNRESOLVED'
  | 'BASELINE_SL_TO_EXPERIMENT_TP'
  | 'BASELINE_SL_TO_EXPERIMENT_SL'
  | 'BASELINE_SL_TO_EXPERIMENT_MARGIN_GUARD'
  | 'BASELINE_SL_TO_EXPERIMENT_UNRESOLVED';

function getTp3Sl3TransitionKey(
  baseline: 'TAKE_PROFIT' | 'STOP_LOSS',
  experiment: shadow_exit_reason,
): tp3_sl3_transition_key {
  const suffix =
    experiment === 'TAKE_PROFIT'
      ? 'TP'
      : experiment === 'STOP_LOSS'
        ? 'SL'
        : experiment === 'MARGIN_GUARD'
          ? 'MARGIN_GUARD'
          : 'UNRESOLVED';
  if (baseline === 'TAKE_PROFIT') {
    if (suffix === 'TP') return 'BASELINE_TP_TO_EXPERIMENT_TP';
    if (suffix === 'SL') return 'BASELINE_TP_TO_EXPERIMENT_SL';
    if (suffix === 'MARGIN_GUARD') return 'BASELINE_TP_TO_EXPERIMENT_MARGIN_GUARD';
    return 'BASELINE_TP_TO_EXPERIMENT_UNRESOLVED';
  }
  if (suffix === 'TP') return 'BASELINE_SL_TO_EXPERIMENT_TP';
  if (suffix === 'SL') return 'BASELINE_SL_TO_EXPERIMENT_SL';
  if (suffix === 'MARGIN_GUARD') return 'BASELINE_SL_TO_EXPERIMENT_MARGIN_GUARD';
  return 'BASELINE_SL_TO_EXPERIMENT_UNRESOLVED';
}

export function classifyTp3Sl3Experiment(input: {
  holdout: bucket_metrics;
  baselineHoldout: bucket_metrics;
}): 'TP3_SL3_HOLDOUT_PROMISING' | 'TP3_SL3_HOLDOUT_INTERESTING' | 'NO_USEFUL_TP3_SL3_EXIT_EDGE' {
  const experimentGrossPF = input.holdout.grossProfitFactor,
    experimentNetPF = input.holdout.netProfitFactor,
    baselineGrossPF = input.baselineHoldout.grossProfitFactor,
    baselineNetPF = input.baselineHoldout.netProfitFactor;
  if (
    input.holdout.resolvedCount >= 100 &&
    (experimentGrossPF ?? 0) >= 1 &&
    (experimentNetPF ?? 0) >= 1 &&
    input.holdout.netPairPnLSum > 0 &&
    experimentGrossPF !== null &&
    experimentNetPF !== null &&
    baselineGrossPF !== null &&
    baselineNetPF !== null &&
    experimentGrossPF > baselineGrossPF &&
    experimentNetPF > baselineNetPF
  )
    return 'TP3_SL3_HOLDOUT_PROMISING';
  if (
    input.holdout.resolvedCount >= 100 &&
    (experimentGrossPF ?? 0) >= 1 &&
    experimentGrossPF !== null &&
    experimentNetPF !== null &&
    baselineGrossPF !== null &&
    baselineNetPF !== null &&
    experimentGrossPF > baselineGrossPF &&
    experimentNetPF > baselineNetPF
  )
    return 'TP3_SL3_HOLDOUT_INTERESTING';
  return 'NO_USEFUL_TP3_SL3_EXIT_EDGE';
}

export function buildRegimePullbackTp3Sl3V1(input: {
  samples: readonly labeled_shadow_sample[];
  oneWeekPullback: ReturnType<typeof buildRegimePullbackEntryV1>;
  evaluateExperiment: (
    timestamp: number,
    direction: pair_direction,
    exitPolicy: typeof Tp3Sl3ResearchExitPolicy,
  ) => shadow_campaign_outcome;
}) {
  const baselineByKey = new Map(
      input.samples.map((sample) => [
        getShadowOutcomeCacheKey(sample.outcome.signalTimestamp, sample.outcome.direction),
        sample,
      ]),
    ),
    experimentCache = new Map<string, shadow_campaign_outcome>(),
    pairs = input.oneWeekPullback.signals.flatMap((signal) => {
      const baseline = baselineByKey.get(
        getShadowOutcomeCacheKey(signal.signalTimestamp, signal.allowedDirection),
      );
      if (!baseline) return [];
      const key = getTp3Sl3ExperimentCacheKey(signal.signalTimestamp, signal.allowedDirection);
      let experiment = experimentCache.get(key);
      if (!experiment) {
        experiment = input.evaluateExperiment(
          signal.signalTimestamp,
          signal.allowedDirection,
          Tp3Sl3ResearchExitPolicy,
        );
        experimentCache.set(key, experiment);
      }
      return [
        {
          signal,
          baseline,
          experiment: {
            split: baseline.split,
            features: baseline.features,
            outcome: experiment,
          } satisfies labeled_shadow_sample,
        },
      ];
    }),
    baselineSamples = pairs.map((pair) => pair.baseline),
    experimentSamples = pairs.map((pair) => pair.experiment),
    metrics = (samples: readonly labeled_shadow_sample[], split?: discovery_split) =>
      calculateBucketMetrics(
        split === undefined ? samples : samples.filter((sample) => sample.split === split),
      ),
    overall = metrics(experimentSamples),
    baselineSameSignalsOverall = metrics(baselineSamples),
    discovery = metrics(experimentSamples, 'DISCOVERY'),
    baselineSameSignalsDiscovery = metrics(baselineSamples, 'DISCOVERY'),
    holdout = metrics(experimentSamples, 'HOLDOUT'),
    baselineSameSignalsHoldout = metrics(baselineSamples, 'HOLDOUT'),
    difference = (left: number | null, right: number | null) =>
      left === null || right === null ? null : left - right,
    comparison = (experiment: bucket_metrics, baseline: bucket_metrics) => ({
      experimentMinusBaselineTPRate: difference(experiment.tpBeforeSlRate, baseline.tpBeforeSlRate),
      experimentMinusBaselineGrossPF: difference(
        experiment.grossProfitFactor,
        baseline.grossProfitFactor,
      ),
      experimentMinusBaselineNetPF: difference(
        experiment.netProfitFactor,
        baseline.netProfitFactor,
      ),
      experimentMinusBaselineMeanHoldingBars: difference(
        experiment.meanHoldingBars,
        baseline.meanHoldingBars,
      ),
      experimentMinusBaselineGrossPnL: experiment.grossPairPnLSum - baseline.grossPairPnLSum,
      experimentMinusBaselineNetPnL: experiment.netPairPnLSum - baseline.netPairPnLSum,
    }),
    byDirection = Object.fromEntries(
      ShadowDirections.map((direction) => {
        const directionSamples = experimentSamples.filter(
            (sample) => sample.outcome.direction === direction,
          ),
          directionMetrics = (split?: discovery_split) => metrics(directionSamples, split);
        return [
          direction,
          {
            overall: directionMetrics(),
            discovery: directionMetrics('DISCOVERY'),
            holdout: directionMetrics('HOLDOUT'),
          },
        ];
      }),
    ) as Record<
      pair_direction,
      { overall: bucket_metrics; discovery: bucket_metrics; holdout: bucket_metrics }
    >,
    targetBlockIndices = [...new Set(pairs.map((pair) => pair.signal.targetBlockIndex))],
    byTargetBlock = targetBlockIndices.map((targetBlockIndex) => {
      const blockPairs = pairs.filter((pair) => pair.signal.targetBlockIndex === targetBlockIndex),
        blockBaseline = calculateBucketMetrics(blockPairs.map((pair) => pair.baseline)),
        blockExperiment = calculateBucketMetrics(blockPairs.map((pair) => pair.experiment));
      return {
        targetBlockIndex,
        allowedDirection: blockPairs[0]!.signal.allowedDirection,
        signalCount: blockPairs.length,
        baselineResolvedCount: blockBaseline.resolvedCount,
        baselineTPRate: blockBaseline.tpBeforeSlRate,
        baselineGrossPF: blockBaseline.grossProfitFactor,
        baselineNetPF: blockBaseline.netProfitFactor,
        experimentResolvedCount: blockExperiment.resolvedCount,
        experimentTPRate: blockExperiment.tpBeforeSlRate,
        experimentGrossPF: blockExperiment.grossProfitFactor,
        experimentNetPF: blockExperiment.netProfitFactor,
        experimentMeanHoldingBars: blockExperiment.meanHoldingBars,
        experimentUnresolvedCount: blockExperiment.unresolvedCount,
      };
    }),
    transitionKeys = [
      'BASELINE_TP_TO_EXPERIMENT_TP',
      'BASELINE_TP_TO_EXPERIMENT_SL',
      'BASELINE_TP_TO_EXPERIMENT_MARGIN_GUARD',
      'BASELINE_TP_TO_EXPERIMENT_UNRESOLVED',
      'BASELINE_SL_TO_EXPERIMENT_TP',
      'BASELINE_SL_TO_EXPERIMENT_SL',
      'BASELINE_SL_TO_EXPERIMENT_MARGIN_GUARD',
      'BASELINE_SL_TO_EXPERIMENT_UNRESOLVED',
    ] as const,
    outcomeTransitions = Object.fromEntries(transitionKeys.map((key) => [key, 0])) as Record<
      tp3_sl3_transition_key,
      number
    >;
  for (const pair of pairs) {
    const baselineReason = pair.baseline.outcome.exitReason;
    if (baselineReason !== 'TAKE_PROFIT' && baselineReason !== 'STOP_LOSS') continue;
    const key = getTp3Sl3TransitionKey(baselineReason, pair.experiment.outcome.exitReason);
    outcomeTransitions[key] += 1;
  }
  const oldTPPairs = pairs.filter((pair) => pair.baseline.outcome.exitReason === 'TAKE_PROFIT'),
    oldTPCount = oldTPPairs.length,
    laterReached3CTPCount = oldTPPairs.filter(
      (pair) => pair.experiment.outcome.exitReason === 'TAKE_PROFIT',
    ).length,
    oldTPContinuationDiagnostic = {
      oldTPCount,
      laterReached3CTPCount,
      laterHit3CSLCount: oldTPPairs.filter(
        (pair) => pair.experiment.outcome.exitReason === 'STOP_LOSS',
      ).length,
      laterMarginGuardCount: oldTPPairs.filter(
        (pair) => pair.experiment.outcome.exitReason === 'MARGIN_GUARD',
      ).length,
      laterUnresolvedCount: oldTPPairs.filter(
        (pair) => pair.experiment.outcome.exitReason === 'UNRESOLVED_END_OF_DATA',
      ).length,
      oldTPTo3CTPRate: oldTPCount === 0 ? null : laterReached3CTPCount / oldTPCount,
    };
  return {
    experimentId: RegimePullbackTp3Sl3ExperimentId,
    baselineExitPolicy: BaselineResearchExitPolicy,
    experimentExitPolicy: Tp3Sl3ResearchExitPolicy,
    signalSource: RegimePullbackAlphaId,
    experimentalOutcomeCacheCount: experimentCache.size,
    overall,
    baselineSameSignalsOverall,
    overallComparison: comparison(overall, baselineSameSignalsOverall),
    discovery,
    baselineSameSignalsDiscovery,
    holdout,
    baselineSameSignalsHoldout,
    holdoutComparison: comparison(holdout, baselineSameSignalsHoldout),
    byDirection,
    byTargetBlock,
    outcomeTransitions,
    oldTPContinuationDiagnostic,
    classification: classifyTp3Sl3Experiment({
      holdout,
      baselineHoldout: baselineSameSignalsHoldout,
    }),
  };
}

export type utc_session_metrics = relative_drift_metrics & {
  sessionCount: number;
  standardDeviationRelativeReturn: number | null;
  longBTCShortETHDays: number;
  shortBTCLongETHDays: number;
  dominantDirection: 'LONG_BTC_SHORT_ETH' | 'SHORT_BTC_LONG_ETH' | 'NEUTRAL';
};

export function calculateUtcSessionMetrics(returns: readonly number[]): utc_session_metrics {
  const base = calculateRelativeDriftMetrics(returns),
    mean = base.meanRelativeReturn,
    standardDeviationRelativeReturn =
      mean === null
        ? null
        : Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length),
    dominantDirection =
      base.positiveCount > base.negativeCount
        ? 'LONG_BTC_SHORT_ETH'
        : base.negativeCount > base.positiveCount
          ? 'SHORT_BTC_LONG_ETH'
          : 'NEUTRAL';
  return {
    ...base,
    sessionCount: base.windowCount,
    standardDeviationRelativeReturn,
    longBTCShortETHDays: base.positiveCount,
    shortBTCLongETHDays: base.negativeCount,
    dominantDirection,
  };
}

export function getUtcSessionDominantHitRate(metrics: utc_session_metrics): number | null {
  if (metrics.sessionCount === 0 || metrics.medianRelativeReturn === null) return null;
  if (metrics.medianRelativeReturn > 0) return metrics.positiveRate;
  if (metrics.medianRelativeReturn < 0) return metrics.negativeRate;
  return null;
}

export function classifyUtcSessionBias(
  metrics: utc_session_metrics,
): 'STRONG_SESSION_BIAS' | 'MODERATE_SESSION_BIAS' | 'NO_CLEAR_SESSION_BIAS' {
  const hitRate = getUtcSessionDominantHitRate(metrics),
    hasEffect = Math.abs(metrics.medianRelativeReturn ?? 0) > 0;
  if (
    metrics.sessionCount >= 20 &&
    metrics.dominantDirection !== 'NEUTRAL' &&
    (hitRate ?? 0) >= 0.65 &&
    hasEffect
  )
    return 'STRONG_SESSION_BIAS';
  if (
    metrics.sessionCount >= 20 &&
    metrics.dominantDirection !== 'NEUTRAL' &&
    (hitRate ?? 0) >= 0.58 &&
    hasEffect
  )
    return 'MODERATE_SESSION_BIAS';
  return 'NO_CLEAR_SESSION_BIAS';
}

export function isPersistentUtcSessionBias(input: {
  discovery: utc_session_metrics;
  holdout: utc_session_metrics;
  directionConsistent: boolean;
}): boolean {
  return (
    input.discovery.sessionCount >= 40 &&
    input.holdout.sessionCount >= 20 &&
    input.directionConsistent &&
    (getUtcSessionDominantHitRate(input.discovery) ?? 0) >= 0.55 &&
    (getUtcSessionDominantHitRate(input.holdout) ?? 0) >= 0.58 &&
    Math.sign(input.discovery.medianRelativeReturn ?? 0) ===
      Math.sign(input.holdout.medianRelativeReturn ?? 0) &&
    Math.sign(input.discovery.medianRelativeReturn ?? 0) !== 0
  );
}

export function classifyUtcSessionRelativeDrift(
  sessions: readonly {
    holdout: utc_session_metrics;
    directionConsistent: boolean;
    persistentSessionBias: boolean;
  }[],
):
  | 'PERSISTENT_UTC_SESSION_RELATIVE_BIAS_FOUND'
  | 'UTC_SESSION_RELATIVE_BIAS_INTERESTING'
  | 'NO_USEFUL_UTC_SESSION_RELATIVE_BIAS' {
  const qualifies = (session: (typeof sessions)[number], minimumHitRate: number) =>
    session.holdout.sessionCount >= 20 &&
    (getUtcSessionDominantHitRate(session.holdout) ?? 0) >= minimumHitRate &&
    Math.abs(session.holdout.medianRelativeReturn ?? 0) > 0;
  if (sessions.some((session) => session.persistentSessionBias && qualifies(session, 0.6)))
    return 'PERSISTENT_UTC_SESSION_RELATIVE_BIAS_FOUND';
  if (sessions.some((session) => session.directionConsistent && qualifies(session, 0.58)))
    return 'UTC_SESSION_RELATIVE_BIAS_INTERESTING';
  return 'NO_USEFUL_UTC_SESSION_RELATIVE_BIAS';
}

export function buildBTCEthUtcSessionRelativeDriftV1(candles: readonly synchronized_pair_candle[]) {
  const SixHoursMilliseconds = 6 * 60 * 60 * 1_000,
    MinuteMilliseconds = 60_000;
  if (candles.length === 0)
    return {
      diagnosticId: BTCEthUtcSessionRelativeDriftDiagnosticId,
      sessionDefinitions: UtcSessionDefinitions,
      dataRange: null,
      split: { method: 'CHRONOLOGICAL_70_30', splitTimestamp: null },
      incompleteSessionCount: 0,
      crossBoundarySessionCount: 0,
      sessions: {} as Record<utc_session_label, never>,
      discoverySessionRanking: [] as utc_session_label[],
      holdoutSessionRanking: [] as utc_session_label[],
      classification: 'NO_USEFUL_UTC_SESSION_RELATIVE_BIAS' as const,
    };
  const candleByTimestamp = new Map(candles.map((candle) => [candle.timestamp.getTime(), candle])),
    firstTimestamp = candles[0]!.timestamp.getTime(),
    lastTimestamp = candles.at(-1)!.timestamp.getTime(),
    firstSessionStart = Math.floor(firstTimestamp / SixHoursMilliseconds) * SixHoursMilliseconds,
    lastSessionStart = Math.floor(lastTimestamp / SixHoursMilliseconds) * SixHoursMilliseconds,
    splitIndex = Math.floor(candles.length * 0.7),
    splitTimestamp = candles[Math.min(splitIndex, candles.length - 1)]!.timestamp.getTime(),
    validSessions: {
      label: utc_session_label;
      split: discovery_split | 'CROSS_BOUNDARY';
      relativeReturn: number;
    }[] = [];
  let incompleteSessionCount = 0,
    crossBoundarySessionCount = 0;
  for (
    let sessionStart = firstSessionStart;
    sessionStart <= lastSessionStart;
    sessionStart += SixHoursMilliseconds
  ) {
    const observations = Array.from({ length: 360 }, (_, minute) =>
      candleByTimestamp.get(sessionStart + minute * MinuteMilliseconds),
    );
    if (observations.some((candle) => candle === undefined)) {
      incompleteSessionCount += 1;
      continue;
    }
    const first = observations[0]!,
      last = observations[359]!,
      startRatio = first.btc.close / first.eth.close,
      endRatio = last.btc.close / last.eth.close,
      lastObservationTimestamp = sessionStart + 359 * MinuteMilliseconds,
      split: discovery_split | 'CROSS_BOUNDARY' =
        lastObservationTimestamp <= splitTimestamp
          ? 'DISCOVERY'
          : sessionStart > splitTimestamp
            ? 'HOLDOUT'
            : 'CROSS_BOUNDARY',
      hour = new Date(sessionStart).getUTCHours(),
      label = UtcSessionDefinitions.find((session) => session.startHour === hour)!.label;
    if (split === 'CROSS_BOUNDARY') crossBoundarySessionCount += 1;
    validSessions.push({ label, split, relativeReturn: endRatio / startRatio - 1 });
  }
  const sessions = Object.fromEntries(
      UtcSessionDefinitions.map(({ label }) => {
        const matching = validSessions.filter((session) => session.label === label),
          overall = calculateUtcSessionMetrics(matching.map((session) => session.relativeReturn)),
          discovery = calculateUtcSessionMetrics(
            matching
              .filter((session) => session.split === 'DISCOVERY')
              .map((session) => session.relativeReturn),
          ),
          holdout = calculateUtcSessionMetrics(
            matching
              .filter((session) => session.split === 'HOLDOUT')
              .map((session) => session.relativeReturn),
          ),
          discoveryDirection = classifyRelativeDriftBias(discovery),
          holdoutDirection = classifyRelativeDriftBias(holdout),
          directionConsistent =
            discoveryDirection !== 'NEUTRAL' && discoveryDirection === holdoutDirection,
          persistentSessionBias = isPersistentUtcSessionBias({
            discovery,
            holdout,
            directionConsistent,
          });
        return [
          label,
          {
            overall,
            discovery,
            holdout,
            discoveryDirection,
            holdoutDirection,
            directionConsistent,
            absoluteHoldoutMedianRelativeReturn: Math.abs(holdout.medianRelativeReturn ?? 0),
            biasStrengthLabel: classifyUtcSessionBias(holdout),
            persistentSessionBias,
          },
        ];
      }),
    ) as Record<
      utc_session_label,
      {
        overall: utc_session_metrics;
        discovery: utc_session_metrics;
        holdout: utc_session_metrics;
        discoveryDirection: ReturnType<typeof classifyRelativeDriftBias>;
        holdoutDirection: ReturnType<typeof classifyRelativeDriftBias>;
        directionConsistent: boolean;
        absoluteHoldoutMedianRelativeReturn: number;
        biasStrengthLabel: ReturnType<typeof classifyUtcSessionBias>;
        persistentSessionBias: boolean;
      }
    >,
    rank = (split: 'discovery' | 'holdout') =>
      [...UtcSessionDefinitions]
        .sort(
          (left, right) =>
            (sessions[right.label][split].medianRelativeReturn ?? Number.NEGATIVE_INFINITY) -
            (sessions[left.label][split].medianRelativeReturn ?? Number.NEGATIVE_INFINITY),
        )
        .map((session) => session.label),
    sessionValues = UtcSessionDefinitions.map((definition) => sessions[definition.label]);
  return {
    diagnosticId: BTCEthUtcSessionRelativeDriftDiagnosticId,
    sessionDefinitions: UtcSessionDefinitions,
    dataRange: { firstTimestamp, lastTimestamp },
    split: { method: 'CHRONOLOGICAL_70_30', splitTimestamp },
    incompleteSessionCount,
    crossBoundarySessionCount,
    sessions,
    discoverySessionRanking: rank('discovery'),
    holdoutSessionRanking: rank('holdout'),
    classification: classifyUtcSessionRelativeDrift(sessionValues),
  };
}

export function classifyRule(metrics: bucket_metrics): ranked_rule['flag'] {
  if (
    metrics.resolvedCount >= 80 &&
    (metrics.tpBeforeSlRate ?? 0) >= 0.67 &&
    (metrics.grossProfitFactor ?? 0) >= 1
  )
    return 'PROMISING';
  if (
    metrics.resolvedCount >= 80 &&
    ((metrics.tpBeforeSlRate ?? 0) >= 0.6 || (metrics.grossProfitFactor ?? 0) >= 0.8)
  )
    return 'INTERESTING';
  return 'WEAK';
}

export function rankRules(rules: readonly Omit<ranked_rule, 'flag'>[]): ranked_rule[] {
  return rules
    .filter((value) => value.discovery.resolvedCount >= 200 && value.holdout.resolvedCount >= 80)
    .sort(
      (left, right) =>
        (right.discovery.tpBeforeSlRate ?? -1) - (left.discovery.tpBeforeSlRate ?? -1) ||
        (right.discovery.grossProfitFactor ?? -1) - (left.discovery.grossProfitFactor ?? -1) ||
        right.discovery.resolvedCount - left.discovery.resolvedCount,
    )
    .slice(0, 15)
    .map((value) => ({ ...value, flag: classifyRule(value.holdout) }));
}

export const DiscoveryFeatureDefinitions = {
  single: [
    'ratioReturn1Direction',
    'ratioReturn3Direction',
    'ratioPersistence3',
    'rangePosition20',
    'candleSignRelationship',
    'volumeParticipation',
  ] as const,
  combinations: [
    ['ratioReturn1Direction', 'volumeParticipation'],
    ['ratioPersistence3', 'volumeParticipation'],
    ['rangePosition20', 'ratioReturn1Direction'],
    ['candleSignRelationship', 'volumeParticipation'],
  ] as const,
};

export function evaluateResearchPairExit(input: {
  grossPairPnL: number;
  entryFees: number;
  expectedMakerExitFees: number;
  expectedTakerExitFees: number;
  markedAccountEquity: number;
  totalMaintenanceMargin: number;
  takeProfitCostMultiplier: number;
  stopLossCostMultiplier: number;
}): 'TAKE_PROFIT' | 'STOP_LOSS' | 'MARGIN_GUARD' | null {
  const makerCost = input.entryFees + input.expectedMakerExitFees,
    takerCost = input.entryFees + input.expectedTakerExitFees;
  if (input.markedAccountEquity < input.totalMaintenanceMargin) return 'MARGIN_GUARD';
  if (input.grossPairPnL - makerCost >= input.takeProfitCostMultiplier * makerCost)
    return 'TAKE_PROFIT';
  if (input.grossPairPnL - takerCost <= -input.stopLossCostMultiplier * takerCost)
    return 'STOP_LOSS';
  return null;
}

export function simulateShadowCampaign(input: {
  candles: readonly synchronized_pair_candle[];
  signalIndex: number;
  direction: pair_direction;
  btcMarket: pair_market;
  ethMarket: pair_market;
  startingEquity: number;
  exitPolicy?: {
    takeProfitCostMultiplier: number;
    stopLossCostMultiplier: number;
  };
}): shadow_campaign_outcome {
  const { candles, signalIndex, direction, btcMarket, ethMarket, startingEquity } = input,
    signal = candles[signalIndex]!,
    btcSide: pair_side = direction === 'LONG_BTC_SHORT_ETH' ? 'BUY' : 'SELL',
    ethSide: pair_side = btcSide === 'BUY' ? 'SELL' : 'BUY',
    btcLimit = roundLimit(signal.btc.close, btcSide, btcMarket.tickSize),
    ethLimit = roundLimit(signal.eth.close, ethSide, ethMarket.tickSize),
    base = {
      signalTimestamp: signal.timestamp.getTime() + 60_000,
      activationTimestamp: null,
      direction,
      holdingBars: null,
      grossPairPnL: 0,
      netPairPnL: 0,
      totalCosts: 0,
    };
  let sizing;
  try {
    sizing = sizeEqualNotionalPair({
      availableMargin: startingEquity,
      btcPrice: btcLimit,
      ethPrice: ethLimit,
      btcMarket,
      ethMarket,
    });
  } catch {
    return { ...base, exitReason: 'ENTRY_FAILED' };
  }
  const entryCandle = candles[signalIndex + 1];
  if (!entryCandle) return { ...base, exitReason: 'UNRESOLVED_END_OF_DATA' };
  let btcEntry = fillsPassively(btcSide, btcLimit, entryCandle.btc, btcMarket.tickSize)
      ? btcLimit
      : null,
    ethEntry = fillsPassively(ethSide, ethLimit, entryCandle.eth, ethMarket.tickSize)
      ? ethLimit
      : null,
    btcQuantity = sizing.btcQuantity,
    ethQuantity = sizing.ethQuantity,
    activationIndex = signalIndex + 1,
    entryFees =
      (btcEntry === null ? 0 : btcEntry * btcQuantity * btcMarket.makerFeeRate) +
      (ethEntry === null ? 0 : ethEntry * ethQuantity * ethMarket.makerFeeRate);
  if (btcEntry === null && ethEntry === null) return { ...base, exitReason: 'ENTRY_FAILED' };
  if (btcEntry === null || ethEntry === null) {
    const hedgeCandle = candles[signalIndex + 2];
    if (!hedgeCandle) return { ...base, exitReason: 'UNRESOLVED_END_OF_DATA' };
    const btcMissing = btcEntry === null,
      missingMarket = btcMissing ? btcMarket : ethMarket,
      missingSide = btcMissing ? btcSide : ethSide,
      price = btcMissing ? hedgeCandle.btc.close : hedgeCandle.eth.close,
      aggressivePrice =
        missingSide === 'BUY'
          ? roundUp(price, missingMarket.tickSize)
          : roundDown(price, missingMarket.tickSize),
      firstPrice = btcMissing ? ethEntry! : btcEntry!,
      firstQuantity = btcMissing ? ethQuantity : btcQuantity,
      firstNotional = firstPrice * firstQuantity;
    try {
      const quantity = sizeMissingHedgeLeg({
        firstLegNotional: firstNotional,
        executablePrice: aggressivePrice,
        market: missingMarket,
        existingInitialMargin: firstNotional / sizing.pairLeverage,
        availableMargin: startingEquity - entryFees,
        pairLeverage: sizing.pairLeverage,
      });
      if (btcMissing) {
        btcEntry = aggressivePrice;
        btcQuantity = quantity;
      } else {
        ethEntry = aggressivePrice;
        ethQuantity = quantity;
      }
      entryFees += aggressivePrice * quantity * missingMarket.takerFeeRate;
      activationIndex = signalIndex + 2;
    } catch {
      return { ...base, exitReason: 'ENTRY_FAILED', totalCosts: entryFees };
    }
  }
  const activationTimestamp = candles[activationIndex]!.timestamp.getTime() + 60_000;
  for (let index = activationIndex; index < candles.length; index += 1) {
    const point = candles[index]!,
      gross =
        legPnL(btcSide, btcEntry!, point.btc.close, btcQuantity) +
        legPnL(ethSide, ethEntry!, point.eth.close, ethQuantity),
      makerExitFees =
        point.btc.close * btcQuantity * btcMarket.makerFeeRate +
        point.eth.close * ethQuantity * ethMarket.makerFeeRate,
      takerExitFees =
        point.btc.close * btcQuantity * btcMarket.takerFeeRate +
        point.eth.close * ethQuantity * ethMarket.takerFeeRate,
      marked = calculateMarkedPairAccountEquity({
        realizedAccountCollateral: startingEquity - entryFees,
        btcSide,
        btcEntryPrice: btcEntry!,
        btcMarkPrice: point.btc.close,
        btcQuantity,
        ethSide,
        ethEntryPrice: ethEntry!,
        ethMarkPrice: point.eth.close,
        ethQuantity,
      }),
      maintenance = calculatePairMaintenanceMargin({
        btcQuantity,
        ethQuantity,
        btcMarkPrice: point.btc.close,
        ethMarkPrice: point.eth.close,
        btcMaximumLeverage: btcMarket.maximumLeverage,
        ethMaximumLeverage: ethMarket.maximumLeverage,
      }),
      reason = input.exitPolicy
        ? evaluateResearchPairExit({
            grossPairPnL: gross,
            entryFees,
            expectedMakerExitFees: makerExitFees,
            expectedTakerExitFees: takerExitFees,
            markedAccountEquity: marked.markedAccountEquity,
            totalMaintenanceMargin: maintenance.totalMaintenanceMargin,
            ...input.exitPolicy,
          })
        : evaluatePairExit({
            grossPairPnL: gross,
            entryFees,
            expectedMakerExitFees: makerExitFees,
            expectedTakerExitFees: takerExitFees,
            markedAccountEquity: marked.markedAccountEquity,
            totalMaintenanceMargin: maintenance.totalMaintenanceMargin,
          });
    if (!reason) continue;
    const exitCandle = candles[index + 1];
    if (!exitCandle)
      return {
        ...base,
        activationTimestamp,
        exitReason: 'UNRESOLVED_END_OF_DATA',
        holdingBars: index - activationIndex,
        totalCosts: entryFees,
      };
    if (reason === 'TAKE_PROFIT') {
      const btcExitSide: pair_side = btcSide === 'BUY' ? 'SELL' : 'BUY',
        ethExitSide: pair_side = ethSide === 'BUY' ? 'SELL' : 'BUY',
        btcExitLimit = roundLimit(point.btc.close, btcExitSide, btcMarket.tickSize),
        ethExitLimit = roundLimit(point.eth.close, ethExitSide, ethMarket.tickSize);
      let btcExit: { price: number; maker: boolean } | null = null,
        ethExit: { price: number; maker: boolean } | null = null;
      for (let exitIndex = index + 1; exitIndex <= index + 2; exitIndex += 1) {
        const candle = candles[exitIndex];
        if (!candle)
          return {
            ...base,
            activationTimestamp,
            exitReason: 'UNRESOLVED_END_OF_DATA',
            holdingBars: index - activationIndex,
            totalCosts: entryFees,
          };
        if (!btcExit && fillsPassively(btcExitSide, btcExitLimit, candle.btc, btcMarket.tickSize))
          btcExit = { price: btcExitLimit, maker: true };
        if (!ethExit && fillsPassively(ethExitSide, ethExitLimit, candle.eth, ethMarket.tickSize))
          ethExit = { price: ethExitLimit, maker: true };
        if (exitIndex === index + 2) {
          btcExit ??= { price: candle.btc.close, maker: false };
          ethExit ??= { price: candle.eth.close, maker: false };
        }
        if (btcExit && ethExit) {
          const exitFees =
              btcExit.price *
                btcQuantity *
                (btcExit.maker ? btcMarket.makerFeeRate : btcMarket.takerFeeRate) +
              ethExit.price *
                ethQuantity *
                (ethExit.maker ? ethMarket.makerFeeRate : ethMarket.takerFeeRate),
            realizedGross =
              legPnL(btcSide, btcEntry!, btcExit.price, btcQuantity) +
              legPnL(ethSide, ethEntry!, ethExit.price, ethQuantity),
            totalCosts = entryFees + exitFees;
          return {
            ...base,
            activationTimestamp,
            exitReason: reason,
            holdingBars: exitIndex - activationIndex,
            grossPairPnL: realizedGross,
            netPairPnL: realizedGross - totalCosts,
            totalCosts,
          };
        }
      }
    }
    const btcExit = exitCandle.btc.open,
      ethExit = exitCandle.eth.open,
      exitFees =
        btcExit * btcQuantity * btcMarket.takerFeeRate +
        ethExit * ethQuantity * ethMarket.takerFeeRate,
      realizedGross =
        legPnL(btcSide, btcEntry!, btcExit, btcQuantity) +
        legPnL(ethSide, ethEntry!, ethExit, ethQuantity),
      totalCosts = entryFees + exitFees;
    return {
      ...base,
      activationTimestamp,
      exitReason: reason,
      holdingBars: index + 1 - activationIndex,
      grossPairPnL: realizedGross,
      netPairPnL: realizedGross - totalCosts,
      totalCosts,
    };
  }
  return {
    ...base,
    activationTimestamp,
    exitReason: 'UNRESOLVED_END_OF_DATA',
    totalCosts: entryFees,
  };
}

export function buildBucketRules(
  samples: readonly labeled_shadow_sample[],
): Omit<ranked_rule, 'flag'>[] {
  const definitions: { name: string; bucket: (features: alpha_features) => string }[] = [
    ...DiscoveryFeatureDefinitions.single.map((name) => ({
      name,
      bucket: (features: alpha_features) => features[name],
    })),
    ...DiscoveryFeatureDefinitions.combinations.map(([left, right]) => ({
      name: `${left}×${right}`,
      bucket: (features: alpha_features) => `${features[left]}×${features[right]}`,
    })),
  ];
  const rules: Omit<ranked_rule, 'flag'>[] = [];
  for (const definition of definitions) {
    const buckets = new Set(samples.map((sample) => definition.bucket(sample.features)));
    for (const bucket of buckets)
      for (const direction of ['LONG_BTC_SHORT_ETH', 'SHORT_BTC_LONG_ETH'] as const) {
        const matching = samples.filter(
          (sample) =>
            definition.bucket(sample.features) === bucket && sample.outcome.direction === direction,
        );
        rules.push({
          feature: definition.name,
          bucket,
          direction,
          discovery: calculateBucketMetrics(
            matching.filter((sample) => sample.split === 'DISCOVERY'),
          ),
          holdout: calculateBucketMetrics(matching.filter((sample) => sample.split === 'HOLDOUT')),
        });
      }
  }
  return rules;
}
