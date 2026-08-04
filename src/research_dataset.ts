import { createHash } from 'node:crypto';

import type { BTC_candlestick } from './decibel_client.js';
import type {
  aggressor_classification_reason,
  aggressor_classification_source,
} from './microstructure.js';
import type { opportunity_candidate } from './opportunity_scanner.js';

export const RESEARCH_FEATURE_VERSION = 'BTC_5M_MICROSTRUCTURE_V1';
export const RESEARCH_WINDOWS_SECONDS = [15, 60, 300] as const;
const FIVE_MINUTES_MS = 300_000;

export type research_aggregate = {
  timestampMs: number;
  buyVolume: number;
  sellVolume: number;
  unknownVolume: number;
  tradeCount: number;
  vwap: number | null;
  spread: number | null;
  depthImbalance: number | null;
  orderFlowImbalance: number | null;
  bookAgeMs: number | null;
  marketPriceAgeMs: number | null;
  midPrice: number | null;
};
export type research_book = {
  receivedAtMs: number;
  bestBid: number;
  bestAsk: number;
  bestBidSize: number;
  bestAskSize: number;
  spread: number;
  midPrice: number;
  microprice: number;
  depthImbalance: number;
};
export type research_trade_classification = {
  economicTradeId: string;
  receivedAtMs: number;
  source: aggressor_classification_source;
  reason: aggressor_classification_reason;
  ambiguous: boolean;
};
export type research_segment = { startTimeMs: number; endTimeMs: number };
export type research_source = {
  marketAddress: string;
  aggregates: research_aggregate[];
  books: research_book[];
  trades: research_trade_classification[];
  compatibleSegments: research_segment[];
};

type metric_percentiles = { median: number | null; p90: number | null };
function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
}
function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle] ?? null;
  if (right === null) return null;
  return sorted.length % 2 === 1 ? right : ((sorted[middle - 1] ?? right) + right) / 2;
}
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
function isInsideSegment(timestampMs: number, segments: research_segment[]): boolean {
  return segments.some(
    (segment) => timestampMs >= segment.startTimeMs && timestampMs < segment.endTimeMs,
  );
}

export type research_feature_window = {
  windowSeconds: number;
  status: 'VALID' | 'INVALID';
  invalidReasons: string[];
  aggregateCoverageRatio: number;
  staleOrMissingBookRatio: number;
  staleOrMissingMarketPriceRatio: number;
  spreadBasisPoints: metric_percentiles;
  imbalance: {
    mean: number | null;
    final: number | null;
    minimum: number | null;
    maximum: number | null;
    change: number | null;
  };
  depth: { meanBid: number | null; meanAsk: number | null; meanCombined: number | null };
  estimatedBuyVolume: number;
  estimatedSellVolume: number;
  unknownVolume: number;
  signedVolumeImbalance: number | null;
  tradeCount: number;
  tradeIntensity: number;
  vwap: number | null;
  vwapRelativeToFinalMidPrice: number | null;
  orderFlowImbalance: { sum: number | null; mean: number | null };
  micropriceDeviationFromMidPrice: { mean: number | null; final: number | null };
  finalBookAgeMs: number | null;
  finalMarketPriceAgeMs: number | null;
  directionCounts: { EXPLICIT: number; ESTIMATED_QUOTE_TEST: number; UNKNOWN: number };
};

export function buildMicrostructureFeatureWindow(
  decisionTimeMs: number,
  windowSeconds: number,
  source: research_source,
  minimumCoverageRatio = 0.8,
  maximumMissingFeatureRatio = 0.1,
): research_feature_window {
  const start = decisionTimeMs - windowSeconds * 1_000;
  const expectedSeconds = Array.from(
    { length: windowSeconds },
    (_, index) => start + index * 1_000,
  );
  const aggregateMap = new Map(
    source.aggregates
      .filter(
        (row) =>
          row.timestampMs + 1_000 <= decisionTimeMs &&
          row.timestampMs >= start &&
          isInsideSegment(row.timestampMs, source.compatibleSegments),
      )
      .map((row) => [row.timestampMs, row]),
  );
  const aggregates = expectedSeconds.flatMap((time) => {
    const row = aggregateMap.get(time);
    return row === undefined ? [] : [row];
  });
  const coverage = ratio(aggregates.length, expectedSeconds.length);
  const missingBookRatio = ratio(
    aggregates.filter((row) => row.spread === null).length,
    aggregates.length,
  );
  const missingPriceRatio = ratio(
    aggregates.filter((row) => row.midPrice === null).length,
    aggregates.length,
  );
  const books = source.books
    .filter(
      (row) =>
        row.receivedAtMs >= start &&
        row.receivedAtMs <= decisionTimeMs &&
        isInsideSegment(row.receivedAtMs, source.compatibleSegments),
    )
    .sort((a, b) => a.receivedAtMs - b.receivedAtMs);
  const spreadBps = books
    .filter((row) => row.midPrice > 0)
    .map((row) => (row.spread / row.midPrice) * 10_000);
  const imbalances = books.map((row) => row.depthImbalance);
  const finalBook = books.at(-1);
  const totalVolume = aggregates.reduce(
    (sum, row) => sum + row.buyVolume + row.sellVolume + row.unknownVolume,
    0,
  );
  const notional = aggregates.reduce(
    (sum, row) =>
      sum +
      (row.vwap === null ? 0 : row.vwap * (row.buyVolume + row.sellVolume + row.unknownVolume)),
    0,
  );
  const buyVolume = aggregates.reduce((sum, row) => sum + row.buyVolume, 0);
  const sellVolume = aggregates.reduce((sum, row) => sum + row.sellVolume, 0);
  const unknownVolume = aggregates.reduce((sum, row) => sum + row.unknownVolume, 0);
  const finalAggregate = aggregateMap.get(decisionTimeMs - 1_000);
  const vwap = totalVolume === 0 ? null : notional / totalVolume;
  const ofi = aggregates.flatMap((row) =>
    row.orderFlowImbalance === null ? [] : [row.orderFlowImbalance],
  );
  const deviations = books
    .filter((row) => row.midPrice > 0)
    .map((row) => (row.microprice - row.midPrice) / row.midPrice);
  const windowTrades = source.trades.filter(
    (trade) =>
      trade.receivedAtMs >= start &&
      trade.receivedAtMs <= decisionTimeMs &&
      isInsideSegment(trade.receivedAtMs, source.compatibleSegments),
  );
  const invalidReasons: string[] = [];
  if (expectedSeconds.length === 0 || coverage < minimumCoverageRatio)
    invalidReasons.push('INSUFFICIENT_AGGREGATE_COVERAGE');
  if (missingBookRatio > maximumMissingFeatureRatio) invalidReasons.push('STALE_OR_MISSING_BOOK');
  if (missingPriceRatio > maximumMissingFeatureRatio)
    invalidReasons.push('STALE_OR_MISSING_MARKET_PRICE');
  if (finalBook === undefined || finalAggregate?.midPrice === null || finalAggregate === undefined)
    invalidReasons.push('REQUIRED_FEATURES_UNAVAILABLE');
  return {
    windowSeconds,
    status: invalidReasons.length === 0 ? 'VALID' : 'INVALID',
    invalidReasons,
    aggregateCoverageRatio: coverage,
    staleOrMissingBookRatio: missingBookRatio,
    staleOrMissingMarketPriceRatio: missingPriceRatio,
    spreadBasisPoints: { median: median(spreadBps), p90: percentile(spreadBps, 0.9) },
    imbalance: {
      mean: mean(imbalances),
      final: imbalances.at(-1) ?? null,
      minimum: imbalances.length === 0 ? null : Math.min(...imbalances),
      maximum: imbalances.length === 0 ? null : Math.max(...imbalances),
      change: imbalances.length < 2 ? null : (imbalances.at(-1) ?? 0) - (imbalances[0] ?? 0),
    },
    depth: {
      meanBid: mean(books.map((row) => row.bestBidSize)),
      meanAsk: mean(books.map((row) => row.bestAskSize)),
      meanCombined: mean(books.map((row) => row.bestBidSize + row.bestAskSize)),
    },
    estimatedBuyVolume: buyVolume,
    estimatedSellVolume: sellVolume,
    unknownVolume,
    signedVolumeImbalance:
      buyVolume + sellVolume === 0 ? null : (buyVolume - sellVolume) / (buyVolume + sellVolume),
    tradeCount: aggregates.reduce((sum, row) => sum + row.tradeCount, 0),
    tradeIntensity: aggregates.reduce((sum, row) => sum + row.tradeCount, 0) / windowSeconds,
    vwap,
    vwapRelativeToFinalMidPrice:
      vwap === null || finalBook === undefined ? null : vwap / finalBook.midPrice - 1,
    orderFlowImbalance: {
      sum: ofi.length === 0 ? null : ofi.reduce((sum, value) => sum + value, 0),
      mean: mean(ofi),
    },
    micropriceDeviationFromMidPrice: { mean: mean(deviations), final: deviations.at(-1) ?? null },
    finalBookAgeMs: finalAggregate?.bookAgeMs ?? null,
    finalMarketPriceAgeMs: finalAggregate?.marketPriceAgeMs ?? null,
    directionCounts: {
      EXPLICIT: windowTrades.filter((trade) => !trade.ambiguous && trade.source === 'EXPLICIT')
        .length,
      ESTIMATED_QUOTE_TEST: windowTrades.filter(
        (trade) => !trade.ambiguous && trade.source === 'ESTIMATED_QUOTE_TEST',
      ).length,
      UNKNOWN: windowTrades.filter((trade) => trade.ambiguous || trade.source === 'UNKNOWN').length,
    },
  };
}

export type research_outcome_point = {
  horizonMinutes: number;
  candleTime: string;
  availableAtTime: string;
  price: number;
  return: number;
  directionAdjustedReturn: number;
};
export function buildForwardOutcomes(
  candidate: opportunity_candidate,
  candles: readonly BTC_candlestick[],
  asOfTimeMs: number,
) {
  const completed = candles.filter(
    (candle) => candle.timestamp.getTime() + FIVE_MINUTES_MS <= asOfTimeMs,
  );
  const decision = candidate.availableAtTime.getTime();
  const reference = completed.find(
    (candle) => candle.timestamp.getTime() + FIVE_MINUTES_MS === decision,
  );
  const points = [5, 15, 30, 60].map((minutes): research_outcome_point | null => {
    const target = completed.find(
      (candle) => candle.timestamp.getTime() + FIVE_MINUTES_MS === decision + minutes * 60_000,
    );
    if (reference === undefined || target === undefined) return null;
    const value = target.close / reference.close - 1;
    return {
      horizonMinutes: minutes,
      candleTime: target.timestamp.toISOString(),
      availableAtTime: new Date(target.timestamp.getTime() + FIVE_MINUTES_MS).toISOString(),
      price: target.close,
      return: value,
      directionAdjustedReturn: candidate.direction === 'LONG' ? value : -value,
    };
  });
  const path = completed.filter(
    (candle) =>
      candle.timestamp.getTime() >= decision && candle.timestamp.getTime() < decision + 60 * 60_000,
  );
  const excursions =
    reference === undefined || path.length < 12
      ? {
          maximumFavorableExcursion: null,
          maximumFavorableExcursionTime: null,
          maximumFavorableExcursionPrice: null,
          maximumAdverseExcursion: null,
          maximumAdverseExcursionTime: null,
          maximumAdverseExcursionPrice: null,
          windowStartTime: null,
          windowEndTime: null,
          referenceTime: null,
          referencePrice: null,
        }
      : (() => {
          const observations = path.flatMap((candle) =>
            candidate.direction === 'LONG'
              ? [
                  {
                    value: candle.high / reference.close - 1,
                    price: candle.high,
                    time: candle.timestamp,
                  },
                  {
                    value: candle.low / reference.close - 1,
                    price: candle.low,
                    time: candle.timestamp,
                  },
                ]
              : [
                  {
                    value: (reference.close - candle.low) / reference.close,
                    price: candle.low,
                    time: candle.timestamp,
                  },
                  {
                    value: (reference.close - candle.high) / reference.close,
                    price: candle.high,
                    time: candle.timestamp,
                  },
                ],
          );
          const favorable = [...observations].sort((left, right) => right.value - left.value)[0]!;
          const adverse = [...observations].sort((left, right) => left.value - right.value)[0]!;
          return {
            maximumFavorableExcursion: favorable.value,
            maximumFavorableExcursionTime: favorable.time.toISOString(),
            maximumFavorableExcursionPrice: favorable.price,
            maximumAdverseExcursion: adverse.value,
            maximumAdverseExcursionTime: adverse.time.toISOString(),
            maximumAdverseExcursionPrice: adverse.price,
            windowStartTime: path[0]?.timestamp.toISOString() ?? null,
            windowEndTime: new Date(
              (path.at(-1)?.timestamp.getTime() ?? 0) + FIVE_MINUTES_MS,
            ).toISOString(),
            referenceTime: new Date(decision).toISOString(),
            referencePrice: reference.close,
          };
        })();
  return {
    points,
    ...excursions,
    complete:
      points.every((point) => point !== null) && excursions.maximumFavorableExcursion !== null,
  };
}

export function buildResearchSamples(
  candidates: readonly opportunity_candidate[],
  candles: readonly BTC_candlestick[],
  source: research_source,
  asOfTimeMs: number,
) {
  return candidates.map((candidate) => {
    const identity = createHash('sha256')
      .update(
        JSON.stringify([
          source.marketAddress,
          candidate.candidateType,
          candidate.direction,
          candidate.detectedAtTime.getTime(),
          candidate.availableAtTime.getTime(),
        ]),
      )
      .digest('hex');
    return {
      candidateId: identity,
      marketAddress: source.marketAddress,
      featureVersion: RESEARCH_FEATURE_VERSION,
      candidate: {
        candidateType: candidate.candidateType,
        direction: candidate.direction,
        score: candidate.score,
        regime: candidate.regime,
        detectedAtTime: candidate.detectedAtTime.toISOString(),
        availableAtTime: candidate.availableAtTime.toISOString(),
      },
      features: Object.fromEntries(
        RESEARCH_WINDOWS_SECONDS.map((seconds) => [
          seconds,
          buildMicrostructureFeatureWindow(candidate.availableAtTime.getTime(), seconds, source),
        ]),
      ),
      outcomes: buildForwardOutcomes(candidate, candles, asOfTimeMs),
    };
  });
}
