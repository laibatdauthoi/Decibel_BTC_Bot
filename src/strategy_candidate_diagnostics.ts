import { detectMarketStructure, type market_structure_config } from './market_structure.js';
import type { opportunity_candidate, opportunity_scanner_config } from './opportunity_scanner.js';
import type { BTC_timeframes } from './timeframe_aggregation.js';

const FIVE_MINUTES_MS = 300_000;

export type no_candidate_reason =
  | 'INSUFFICIENT_CANDLE_HISTORY'
  | 'MISSING_OR_INVALID_FEATURE_DATA'
  | 'VOLATILITY_OR_RANGE_FILTER_FAILED'
  | 'TREND_OR_REGIME_FILTER_FAILED'
  | 'MICROSTRUCTURE_UNAVAILABLE_OR_STALE'
  | 'CANDIDATE_FORMED_BUT_INVALIDATED'
  | 'RISK_OR_POLICY_REJECTION_AFTER_CANDIDATE'
  | 'CANDIDATE_PRODUCED';

export type strategy_candidate_diagnostic = {
  primaryReason: no_candidate_reason;
  reasons: no_candidate_reason[];
  evidence: Record<string, unknown>;
};

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function roundEvidence(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}

export function diagnoseStrategyCandidate(input: {
  timeframes: BTC_timeframes;
  config: opportunity_scanner_config;
  decisionTime: Date;
  candidates: readonly opportunity_candidate[];
  structureConfig?: market_structure_config;
  microstructureWindows?: ReadonlyArray<{ seconds: number; status: 'VALID' | 'INVALID' }>;
}): strategy_candidate_diagnostic {
  const cutoff = input.decisionTime.getTime();
  const candles = input.timeframes['5m'].filter(
    (candle) => candle.timestamp.getTime() + FIVE_MINUTES_MS <= cutoff,
  );
  const requiredHistory =
    Math.max(
      input.config.breakoutRangeBars,
      input.config.pullbackLookbackBars,
      input.config.expansionLookbackBars,
    ) + 1;
  const commonEvidence = {
    decisionTime: input.decisionTime.toISOString(),
    completed5mCandles: candles.length,
    completed15mCandles: input.timeframes['15m'].filter(
      (candle) => candle.timestamp.getTime() + 900_000 <= cutoff,
    ).length,
    completed1hCandles: input.timeframes['1h'].filter(
      (candle) => candle.timestamp.getTime() + 3_600_000 <= cutoff,
    ).length,
    required5mCandles: requiredHistory,
  };
  if (candles.length < requiredHistory) {
    return {
      primaryReason: 'INSUFFICIENT_CANDLE_HISTORY',
      reasons: ['INSUFFICIENT_CANDLE_HISTORY'],
      evidence: commonEvidence,
    };
  }

  const current = candles.at(-1)!;
  const prior = candles.slice(-input.config.expansionLookbackBars - 1, -1);
  const priorStart = candles.length - input.config.expansionLookbackBars - 1;
  const medianRange = median(
    prior.map((candle, index) => {
      const previousClose = candles[priorStart + index - 1]?.close ?? candle.open;
      return Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose),
      );
    }),
  );
  const medianVolume = median(prior.map((candle) => candle.volume));
  if (medianRange === null || medianRange <= 0 || medianVolume === null || medianVolume <= 0) {
    return {
      primaryReason: 'MISSING_OR_INVALID_FEATURE_DATA',
      reasons: ['MISSING_OR_INVALID_FEATURE_DATA'],
      evidence: { ...commonEvidence, medianRange, medianVolume },
    };
  }

  const regime =
    input.candidates.at(0)?.regime ??
    (input.structureConfig === undefined
      ? 'UNKNOWN'
      : detectMarketStructure(
          input.timeframes['1h'].filter(
            (candle) => candle.timestamp.getTime() + 3_600_000 <= cutoff,
          ),
          input.structureConfig,
          input.decisionTime,
        ).regime);
  const volatilityRatio = (current.high - current.low) / medianRange;
  const volumeRatio = current.volume / medianVolume;
  const range = candles.slice(-input.config.breakoutRangeBars - 1, -1);
  const highestPriorHigh = Math.max(...range.map((candle) => candle.high));
  const lowestPriorLow = Math.min(...range.map((candle) => candle.low));
  const breakoutRangeDistanceRatio = Math.max(
    current.close / highestPriorHigh - 1,
    lowestPriorLow / current.close - 1,
  );
  const brokeRange = current.close > highestPriorHigh || current.close < lowestPriorLow;
  const expansionPassed =
    volatilityRatio >= input.config.expansionVolatilityRatio &&
    volumeRatio >= input.config.expansionVolumeRatio;
  const invalidWindows = (input.microstructureWindows ?? []).filter(
    (window) => window.status === 'INVALID',
  );
  const evidence = {
    ...commonEvidence,
    regime,
    currentClose: current.close,
    highestPriorHigh,
    lowestPriorLow,
    breakoutRangeDistanceRatio: roundEvidence(breakoutRangeDistanceRatio),
    volatilityRatio: roundEvidence(volatilityRatio),
    volumeRatio: roundEvidence(volumeRatio),
    thresholds: {
      breakoutVolumeRatio: input.config.breakoutVolumeRatio,
      expansionVolatilityRatio: input.config.expansionVolatilityRatio,
      expansionVolumeRatio: input.config.expansionVolumeRatio,
      breakoutMinimumScore: input.config.breakoutMinimumScore,
      pullbackMinimumScore: input.config.pullbackMinimumScore,
      retestMinimumScore: input.config.retestMinimumScore,
      expansionMinimumScore: input.config.expansionMinimumScore,
    },
    nearestMiss: {
      rangeBreakDistance: roundEvidence(
        current.close > highestPriorHigh
          ? 0
          : current.close < lowestPriorLow
            ? 0
            : Math.min(highestPriorHigh - current.close, current.close - lowestPriorLow),
      ),
      breakoutVolumeDeficit: roundEvidence(
        Math.max(0, input.config.breakoutVolumeRatio - volumeRatio),
      ),
      expansionVolatilityDeficit: roundEvidence(
        Math.max(0, input.config.expansionVolatilityRatio - volatilityRatio),
      ),
      expansionVolumeDeficit: roundEvidence(
        Math.max(0, input.config.expansionVolumeRatio - volumeRatio),
      ),
    },
    microstructureWindows: input.microstructureWindows ?? [],
  };

  if (input.candidates.length > 0 && invalidWindows.length === 0)
    return { primaryReason: 'CANDIDATE_PRODUCED', reasons: ['CANDIDATE_PRODUCED'], evidence };
  if (input.candidates.length > 0 && invalidWindows.length > 0)
    return {
      primaryReason: 'MICROSTRUCTURE_UNAVAILABLE_OR_STALE',
      reasons: ['MICROSTRUCTURE_UNAVAILABLE_OR_STALE', 'MISSING_OR_INVALID_FEATURE_DATA'],
      evidence,
    };

  const reasons: no_candidate_reason[] = [];
  if (!brokeRange || !expansionPassed) reasons.push('VOLATILITY_OR_RANGE_FILTER_FAILED');
  if (regime === 'UNKNOWN') reasons.push('TREND_OR_REGIME_FILTER_FAILED');
  if (brokeRange && volumeRatio >= input.config.breakoutVolumeRatio)
    reasons.unshift('CANDIDATE_FORMED_BUT_INVALIDATED');
  if (reasons.length === 0) reasons.push('CANDIDATE_FORMED_BUT_INVALIDATED');
  return { primaryReason: reasons[0]!, reasons: [...new Set(reasons)], evidence };
}
