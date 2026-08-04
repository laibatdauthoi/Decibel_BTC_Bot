import { z } from 'zod';

import { alignTimestamp, getIntervalMilliseconds } from './candle_interval.js';
import type { BTC_candlestick } from './decibel_client.js';
import {
  detectMarketStructure,
  type market_regime,
  type market_structure_config,
  type market_structure_result,
} from './market_structure.js';
import type { BTC_timeframes } from './timeframe_aggregation.js';

const FIVE_MINUTES_MS = getIntervalMilliseconds('5m');
const FIFTEEN_MINUTES_MS = getIntervalMilliseconds('15m');
const ONE_HOUR_MS = getIntervalMilliseconds('1h');

const OpportunityScannerConfigSchema = z.object({
  breakoutRangeBars: z.number().int().min(2).max(100),
  breakoutVolumeRatio: z.number().positive().finite(),
  breakoutMinimumScore: z.number().int().min(0).max(100),
  pullbackLookbackBars: z.number().int().min(2).max(100),
  pullbackMinimumMoveRatio: z.number().nonnegative().max(0.1).finite(),
  pullbackMinimumScore: z.number().int().min(0).max(100),
  retestToleranceRatio: z.number().positive().max(0.05).finite(),
  retestMinimumRejectionRatio: z.number().min(0).max(1).finite(),
  retestMinimumScore: z.number().int().min(0).max(100),
  expansionLookbackBars: z.number().int().min(2).max(100),
  expansionVolatilityRatio: z.number().positive().finite(),
  expansionVolumeRatio: z.number().positive().finite(),
  expansionMinimumScore: z.number().int().min(0).max(100),
});

const OpportunityEnvironmentSchema = z.object({
  OPPORTUNITY_BREAKOUT_RANGE_BARS: z.coerce.number().int().min(2).max(100).default(6),
  OPPORTUNITY_BREAKOUT_VOLUME_RATIO: z.coerce.number().positive().default(1.2),
  OPPORTUNITY_BREAKOUT_MINIMUM_SCORE: z.coerce.number().int().min(0).max(100).default(85),
  OPPORTUNITY_PULLBACK_LOOKBACK_BARS: z.coerce.number().int().min(2).max(100).default(6),
  OPPORTUNITY_PULLBACK_MINIMUM_MOVE_RATIO: z.coerce.number().nonnegative().max(0.1).default(0.001),
  OPPORTUNITY_PULLBACK_MINIMUM_SCORE: z.coerce.number().int().min(0).max(100).default(85),
  OPPORTUNITY_RETEST_TOLERANCE_RATIO: z.coerce.number().positive().max(0.05).default(0.001),
  OPPORTUNITY_RETEST_MINIMUM_REJECTION_RATIO: z.coerce.number().min(0).max(1).default(0.35),
  OPPORTUNITY_RETEST_MINIMUM_SCORE: z.coerce.number().int().min(0).max(100).default(85),
  OPPORTUNITY_EXPANSION_LOOKBACK_BARS: z.coerce.number().int().min(2).max(100).default(12),
  OPPORTUNITY_EXPANSION_VOLATILITY_RATIO: z.coerce.number().positive().default(1.6),
  OPPORTUNITY_EXPANSION_VOLUME_RATIO: z.coerce.number().positive().default(1.2),
  OPPORTUNITY_EXPANSION_MINIMUM_SCORE: z.coerce.number().int().min(0).max(100).default(85),
});

const CandleSchema = z
  .object({
    timestamp: z.date(),
    open: z.number().positive().finite(),
    high: z.number().positive().finite(),
    low: z.number().positive().finite(),
    close: z.number().positive().finite(),
    volume: z.number().nonnegative().finite(),
  })
  .superRefine((candle, context) => {
    if (candle.high < Math.max(candle.open, candle.close, candle.low)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'High price is inconsistent' });
    }
    if (candle.low > Math.min(candle.open, candle.close, candle.high)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Low price is inconsistent' });
    }
  });

export type opportunity_scanner_config = z.infer<typeof OpportunityScannerConfigSchema>;
export type opportunity_direction = 'LONG' | 'SHORT';
export type opportunity_candidate_type =
  | 'SHORT_RANGE_BREAKOUT'
  | 'TREND_PULLBACK_CONTINUATION'
  | 'SWING_LEVEL_RETEST_REJECTION'
  | 'VOLATILITY_EXPANSION';

export type opportunity_candidate = {
  direction: opportunity_direction;
  candidateType: opportunity_candidate_type;
  detectedAtTime: Date;
  availableAtTime: Date;
  score: number;
  regime: market_regime;
  volatilityRatio: number;
  volumeRatio: number;
  reasons: string[];
};

export type opportunity_analysis_summary = {
  totalCandidateCount: number;
  averageCandidatesPerDay: number;
  candidatesPerDay: Array<{ date: string; count: number }>;
  distributionByType: Record<opportunity_candidate_type, number>;
  distributionByDirection: Record<opportunity_direction, number>;
  distributionByRegime: Record<market_regime, number>;
  scorePercentiles: { p25: number; p50: number; p75: number; p90: number };
};

export function loadOpportunityScannerConfig(
  environment: Record<string, string | undefined> = process.env,
): opportunity_scanner_config {
  const parsed = OpportunityEnvironmentSchema.parse(environment);
  return OpportunityScannerConfigSchema.parse({
    breakoutRangeBars: parsed.OPPORTUNITY_BREAKOUT_RANGE_BARS,
    breakoutVolumeRatio: parsed.OPPORTUNITY_BREAKOUT_VOLUME_RATIO,
    breakoutMinimumScore: parsed.OPPORTUNITY_BREAKOUT_MINIMUM_SCORE,
    pullbackLookbackBars: parsed.OPPORTUNITY_PULLBACK_LOOKBACK_BARS,
    pullbackMinimumMoveRatio: parsed.OPPORTUNITY_PULLBACK_MINIMUM_MOVE_RATIO,
    pullbackMinimumScore: parsed.OPPORTUNITY_PULLBACK_MINIMUM_SCORE,
    retestToleranceRatio: parsed.OPPORTUNITY_RETEST_TOLERANCE_RATIO,
    retestMinimumRejectionRatio: parsed.OPPORTUNITY_RETEST_MINIMUM_REJECTION_RATIO,
    retestMinimumScore: parsed.OPPORTUNITY_RETEST_MINIMUM_SCORE,
    expansionLookbackBars: parsed.OPPORTUNITY_EXPANSION_LOOKBACK_BARS,
    expansionVolatilityRatio: parsed.OPPORTUNITY_EXPANSION_VOLATILITY_RATIO,
    expansionVolumeRatio: parsed.OPPORTUNITY_EXPANSION_VOLUME_RATIO,
    expansionMinimumScore: parsed.OPPORTUNITY_EXPANSION_MINIMUM_SCORE,
  });
}

function validateCandles(candles: readonly BTC_candlestick[], interval: '5m' | '15m' | '1h'): void {
  const duration = getIntervalMilliseconds(interval);
  for (let index = 0; index < candles.length; index += 1) {
    const candle = CandleSchema.parse(candles[index]);
    const timestamp = candle.timestamp.getTime();
    if (!Number.isSafeInteger(timestamp) || alignTimestamp(timestamp, interval) !== timestamp) {
      throw new Error(`BTC/USD ${interval} candle timestamp is misaligned`);
    }
    const previous = candles[index - 1];
    if (previous !== undefined && timestamp - previous.timestamp.getTime() !== duration) {
      throw new Error(`BTC/USD ${interval} candles are not continuous and chronological`);
    }
  }
}

function calculateMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  if (right === undefined) return 0;
  return sorted.length % 2 === 1 ? right : ((sorted[middle - 1] ?? right) + right) / 2;
}

function calculateTrueRange(candle: BTC_candlestick, previousClose: number): number {
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previousClose),
    Math.abs(candle.low - previousClose),
  );
}

function getRegimeScore(direction: opportunity_direction, regime: market_regime): number {
  if (
    (direction === 'LONG' && regime === 'TREND_UP') ||
    (direction === 'SHORT' && regime === 'TREND_DOWN')
  )
    return 12;
  if (regime === 'RANGE') return 5;
  if (regime === 'UNKNOWN') return 2;
  return 0;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function createCandidate(
  candle: BTC_candlestick,
  direction: opportunity_direction,
  candidateType: opportunity_candidate_type,
  regime: market_regime,
  volatilityRatio: number,
  volumeRatio: number,
  patternScore: number,
  reasons: string[],
): opportunity_candidate {
  return {
    direction,
    candidateType,
    detectedAtTime: candle.timestamp,
    availableAtTime: new Date(candle.timestamp.getTime() + FIVE_MINUTES_MS),
    score: clampScore(patternScore + getRegimeScore(direction, regime)),
    regime,
    volatilityRatio,
    volumeRatio,
    reasons: [...reasons, `regime:${regime}`],
  };
}

function addDeduplicatedCandidate(
  candidates: Map<string, opportunity_candidate>,
  candidate: opportunity_candidate,
  config: opportunity_scanner_config,
): void {
  const minimumScore =
    candidate.candidateType === 'SHORT_RANGE_BREAKOUT'
      ? config.breakoutMinimumScore
      : candidate.candidateType === 'TREND_PULLBACK_CONTINUATION'
        ? config.pullbackMinimumScore
        : candidate.candidateType === 'SWING_LEVEL_RETEST_REJECTION'
          ? config.retestMinimumScore
          : config.expansionMinimumScore;
  if (candidate.score < minimumScore) return;
  const key = `${candidate.detectedAtTime.getTime()}:${candidate.direction}`;
  const existing = candidates.get(key);
  if (existing === undefined) {
    candidates.set(key, candidate);
    return;
  }
  if (candidate.score > existing.score) {
    candidate.reasons.push(`overlap:${existing.candidateType}`);
    candidates.set(key, candidate);
  } else {
    existing.reasons.push(`overlap:${candidate.candidateType}`);
  }
}

function getPercentile(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(percentile * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

export function summarizeOpportunityCandidates(
  candidates: readonly opportunity_candidate[],
): opportunity_analysis_summary {
  const types: opportunity_candidate_type[] = [
    'SHORT_RANGE_BREAKOUT',
    'TREND_PULLBACK_CONTINUATION',
    'SWING_LEVEL_RETEST_REJECTION',
    'VOLATILITY_EXPANSION',
  ];
  const regimes: market_regime[] = ['TREND_UP', 'TREND_DOWN', 'RANGE', 'UNKNOWN'];
  const perDay = new Map<string, number>();
  for (const candidate of candidates) {
    const date = candidate.availableAtTime.toISOString().slice(0, 10);
    perDay.set(date, (perDay.get(date) ?? 0) + 1);
  }
  const candidatesPerDay = [...perDay].map(([date, count]) => ({ date, count }));
  const scores = candidates.map((candidate) => candidate.score);
  return {
    totalCandidateCount: candidates.length,
    averageCandidatesPerDay:
      candidatesPerDay.length === 0 ? 0 : candidates.length / candidatesPerDay.length,
    candidatesPerDay,
    distributionByType: Object.fromEntries(
      types.map((type) => [type, candidates.filter((item) => item.candidateType === type).length]),
    ) as Record<opportunity_candidate_type, number>,
    distributionByDirection: {
      LONG: candidates.filter((candidate) => candidate.direction === 'LONG').length,
      SHORT: candidates.filter((candidate) => candidate.direction === 'SHORT').length,
    },
    distributionByRegime: Object.fromEntries(
      regimes.map((regime) => [regime, candidates.filter((item) => item.regime === regime).length]),
    ) as Record<market_regime, number>,
    scorePercentiles: {
      p25: getPercentile(scores, 0.25),
      p50: getPercentile(scores, 0.5),
      p75: getPercentile(scores, 0.75),
      p90: getPercentile(scores, 0.9),
    },
  };
}

export function scanBTCOpportunities(
  timeframes: BTC_timeframes,
  config: opportunity_scanner_config,
  structureConfig: market_structure_config,
  now: Date = new Date(),
): opportunity_candidate[] {
  const validatedConfig = OpportunityScannerConfigSchema.parse(config);
  const nowTimestamp = now.getTime();
  if (!Number.isSafeInteger(nowTimestamp)) throw new Error('Opportunity cutoff is invalid');
  const fiveMinuteCandles = timeframes['5m'].filter(
    (candle) => candle.timestamp.getTime() + FIVE_MINUTES_MS <= nowTimestamp,
  );
  const fifteenMinuteCandles = timeframes['15m'].filter(
    (candle) => candle.timestamp.getTime() + FIFTEEN_MINUTES_MS <= nowTimestamp,
  );
  const hourlyCandles = timeframes['1h'].filter(
    (candle) => candle.timestamp.getTime() + ONE_HOUR_MS <= nowTimestamp,
  );
  validateCandles(fiveMinuteCandles, '5m');
  validateCandles(fifteenMinuteCandles, '15m');
  validateCandles(hourlyCandles, '1h');

  const candidates = new Map<string, opportunity_candidate>();
  const regimeCache = new Map<number, market_structure_result>();
  const startIndex = Math.max(
    validatedConfig.breakoutRangeBars,
    validatedConfig.pullbackLookbackBars,
    validatedConfig.expansionLookbackBars,
  );
  let completedFifteenCount = 0;
  let completedHourCount = 0;
  for (let index = startIndex; index < fiveMinuteCandles.length; index += 1) {
    const candle = fiveMinuteCandles[index];
    const previous = fiveMinuteCandles[index - 1];
    if (candle === undefined || previous === undefined) continue;
    const availableAt = candle.timestamp.getTime() + FIVE_MINUTES_MS;
    while (
      (fifteenMinuteCandles[completedFifteenCount]?.timestamp.getTime() ?? Infinity) +
        FIFTEEN_MINUTES_MS <=
      availableAt
    ) {
      completedFifteenCount += 1;
    }
    while (
      (hourlyCandles[completedHourCount]?.timestamp.getTime() ?? Infinity) + ONE_HOUR_MS <=
      availableAt
    ) {
      completedHourCount += 1;
    }
    let structure = regimeCache.get(completedHourCount);
    if (structure === undefined) {
      structure = detectMarketStructure(
        hourlyCandles.slice(0, completedHourCount),
        structureConfig,
        new Date(availableAt),
      );
      regimeCache.set(completedHourCount, structure);
    }
    const regime = structure.regime;
    const expansionHistory = fiveMinuteCandles.slice(
      index - validatedConfig.expansionLookbackBars,
      index,
    );
    const priorTrueRanges = expansionHistory.map((item, offset) => {
      const sourceIndex = index - validatedConfig.expansionLookbackBars + offset;
      const prior = fiveMinuteCandles[sourceIndex - 1];
      return calculateTrueRange(item, prior?.close ?? item.open);
    });
    const medianTrueRange = calculateMedian(priorTrueRanges);
    const medianVolume = calculateMedian(expansionHistory.map((item) => item.volume));
    if (medianTrueRange <= 0 || medianVolume <= 0) continue;
    const volatilityRatio = calculateTrueRange(candle, previous.close) / medianTrueRange;
    const volumeRatio = candle.volume / medianVolume;

    const breakoutRange = fiveMinuteCandles.slice(index - validatedConfig.breakoutRangeBars, index);
    const highestHigh = Math.max(...breakoutRange.map((item) => item.high));
    const lowestLow = Math.min(...breakoutRange.map((item) => item.low));
    if (volumeRatio >= validatedConfig.breakoutVolumeRatio && candle.close > highestHigh) {
      addDeduplicatedCandidate(
        candidates,
        createCandidate(
          candle,
          'LONG',
          'SHORT_RANGE_BREAKOUT',
          regime,
          volatilityRatio,
          volumeRatio,
          55 +
            Math.min(18, (volumeRatio - 1) * 12) +
            Math.min(10, Math.max(0, volatilityRatio - 1) * 8),
          [`close_above_${validatedConfig.breakoutRangeBars}_bar_high`, 'volume_confirmed'],
        ),
        validatedConfig,
      );
    }
    if (volumeRatio >= validatedConfig.breakoutVolumeRatio && candle.close < lowestLow) {
      addDeduplicatedCandidate(
        candidates,
        createCandidate(
          candle,
          'SHORT',
          'SHORT_RANGE_BREAKOUT',
          regime,
          volatilityRatio,
          volumeRatio,
          55 +
            Math.min(18, (volumeRatio - 1) * 12) +
            Math.min(10, Math.max(0, volatilityRatio - 1) * 8),
          [`close_below_${validatedConfig.breakoutRangeBars}_bar_low`, 'volume_confirmed'],
        ),
        validatedConfig,
      );
    }

    const pullbackStart = fiveMinuteCandles[index - validatedConfig.pullbackLookbackBars];
    const latestFifteen = fifteenMinuteCandles[completedFifteenCount - 1];
    const previousFifteen = fifteenMinuteCandles[completedFifteenCount - 2];
    if (
      pullbackStart !== undefined &&
      latestFifteen !== undefined &&
      previousFifteen !== undefined
    ) {
      const upwardMove = candle.close / pullbackStart.close - 1;
      const downwardMove = pullbackStart.close / candle.close - 1;
      if (
        latestFifteen.close > previousFifteen.close &&
        previous.close < previous.open &&
        candle.close > previous.high &&
        upwardMove >= validatedConfig.pullbackMinimumMoveRatio
      ) {
        addDeduplicatedCandidate(
          candidates,
          createCandidate(
            candle,
            'LONG',
            'TREND_PULLBACK_CONTINUATION',
            regime,
            volatilityRatio,
            volumeRatio,
            52 + Math.min(20, upwardMove * 2_000) + Math.min(8, volumeRatio * 3),
            ['completed_15m_momentum_up', '5m_pullback_reclaimed'],
          ),
          validatedConfig,
        );
      }
      if (
        latestFifteen.close < previousFifteen.close &&
        previous.close > previous.open &&
        candle.close < previous.low &&
        downwardMove >= validatedConfig.pullbackMinimumMoveRatio
      ) {
        addDeduplicatedCandidate(
          candidates,
          createCandidate(
            candle,
            'SHORT',
            'TREND_PULLBACK_CONTINUATION',
            regime,
            volatilityRatio,
            volumeRatio,
            52 + Math.min(20, downwardMove * 2_000) + Math.min(8, volumeRatio * 3),
            ['completed_15m_momentum_down', '5m_pullback_rejected'],
          ),
          validatedConfig,
        );
      }
    }

    const candleRange = candle.high - candle.low;
    const rejectionRatio =
      candleRange <= 0 ? 0 : Math.abs(candle.close - candle.open) / candleRange;
    const latestSwingLow = structure.swingLows.at(-1);
    if (
      latestSwingLow !== undefined &&
      rejectionRatio >= validatedConfig.retestMinimumRejectionRatio &&
      candle.low <= latestSwingLow.price * (1 + validatedConfig.retestToleranceRatio) &&
      candle.close > latestSwingLow.price &&
      candle.close > candle.open
    ) {
      addDeduplicatedCandidate(
        candidates,
        createCandidate(
          candle,
          'LONG',
          'SWING_LEVEL_RETEST_REJECTION',
          regime,
          volatilityRatio,
          volumeRatio,
          60 + rejectionRatio * 18 + Math.min(8, volumeRatio * 2),
          ['confirmed_swing_low_retest', 'bullish_rejection_close'],
        ),
        validatedConfig,
      );
    }
    const latestSwingHigh = structure.swingHighs.at(-1);
    if (
      latestSwingHigh !== undefined &&
      rejectionRatio >= validatedConfig.retestMinimumRejectionRatio &&
      candle.high >= latestSwingHigh.price * (1 - validatedConfig.retestToleranceRatio) &&
      candle.close < latestSwingHigh.price &&
      candle.close < candle.open
    ) {
      addDeduplicatedCandidate(
        candidates,
        createCandidate(
          candle,
          'SHORT',
          'SWING_LEVEL_RETEST_REJECTION',
          regime,
          volatilityRatio,
          volumeRatio,
          60 + rejectionRatio * 18 + Math.min(8, volumeRatio * 2),
          ['confirmed_swing_high_retest', 'bearish_rejection_close'],
        ),
        validatedConfig,
      );
    }

    if (
      volatilityRatio >= validatedConfig.expansionVolatilityRatio &&
      volumeRatio >= validatedConfig.expansionVolumeRatio &&
      candle.close !== candle.open
    ) {
      const direction = candle.close > candle.open ? 'LONG' : 'SHORT';
      addDeduplicatedCandidate(
        candidates,
        createCandidate(
          candle,
          direction,
          'VOLATILITY_EXPANSION',
          regime,
          volatilityRatio,
          volumeRatio,
          50 + Math.min(22, (volatilityRatio - 1) * 15) + Math.min(16, (volumeRatio - 1) * 10),
          ['true_range_expansion', 'volume_expansion'],
        ),
        validatedConfig,
      );
    }
  }
  return [...candidates.values()].sort(
    (left, right) => left.detectedAtTime.getTime() - right.detectedAtTime.getTime(),
  );
}
