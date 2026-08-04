import { z } from 'zod';

import type {
  aggressor_classification_reason,
  ingestion_source,
  trade_side,
} from './microstructure.js';

export type quality_status = 'PASS' | 'WARN' | 'FAIL';
export const MICROSTRUCTURE_QUALITY_THRESHOLDS = {
  minimumRequestedCoverageRatio: 0.8,
  warningMissingRatio: 0.01,
  failureMissingRatio: 0.1,
  warningLatencyP99Ms: 1_000,
  failureLatencyP99Ms: 5_000,
  warningAmbiguousRatio: 0.01,
  failureAmbiguousRatio: 0.05,
  warningUnknownAggressorRatio: 0.2,
  failureUnknownAggressorRatio: 0.5,
} as const;

const QualityEnvironmentSchema = z.object({
  MICROSTRUCTURE_QUALITY_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
});

export function loadMicrostructureQualityConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = QualityEnvironmentSchema.safeParse(environment);
  if (!parsed.success)
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  return { hours: parsed.data.MICROSTRUCTURE_QUALITY_HOURS, logFormat: parsed.data.LOG_FORMAT };
}

export function loadMicrostructureQualityHours(
  environment: NodeJS.ProcessEnv = process.env,
): number {
  return loadMicrostructureQualityConfig(environment).hours;
}

export type timestamped_row = {
  exchangeTimestampMs: number;
  receivedAtMs: number;
  persistedAtMs: number;
};
export type participant_quality_row = timestamped_row & {
  rowKey: string;
  economicTradeId: string;
  ingestionSource: ingestion_source;
};
export type economic_trade_quality_row = {
  economicTradeId: string;
  exchangeTimestampMs: number;
  ingestionSource: ingestion_source;
  ambiguous: boolean;
  aggressorSide: trade_side;
  classificationReason: aggressor_classification_reason;
};
export type book_quality_row = timestamped_row & {
  spread: number;
  midPrice: number;
  bestBidSize: number;
  bestAskSize: number;
  depthImbalance: number;
};
export type active_session = { sessionId: string; startTimeMs: number; endTimeMs: number };
export type microstructure_quality_input = {
  startTimeMs: number;
  endTimeMs: number;
  marketAddress: string | null;
  economicTrades: economic_trade_quality_row[];
  participantRows: participant_quality_row[];
  books: book_quality_row[];
  marketPrices: timestamped_row[];
  aggregateTimestampsMs: number[];
  activeSessions: active_session[];
  cumulativeCounts: {
    economicTrades: number;
    participantRows: number;
    books: number;
    marketPrices: number;
    aggregates: number;
  };
  cumulativeDiagnostics: Record<string, number>;
};

type percentiles = {
  p50: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  maximum: number | null;
};
function calculatePercentiles(values: number[]): percentiles {
  if (values.length === 0) return { p50: null, p90: null, p95: null, p99: null, maximum: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number): number => sorted[Math.ceil(p * sorted.length) - 1] ?? sorted[0] ?? 0;
  return {
    p50: at(0.5),
    p90: at(0.9),
    p95: at(0.95),
    p99: at(0.99),
    maximum: sorted.at(-1) ?? null,
  };
}
function summarize(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const first = sorted[0] ?? null;
  const last = sorted.at(-1) ?? null;
  return {
    count: times.length,
    firstTimestamp: first === null ? null : new Date(first).toISOString(),
    lastTimestamp: last === null ? null : new Date(last).toISOString(),
    coverageDurationMs: first === null || last === null ? 0 : last - first,
  };
}
function ratio(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}
function countReasons(
  rows: economic_trade_quality_row[],
  selector: (row: economic_trade_quality_row) => boolean,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows.filter(selector))
    counts[row.classificationReason] = (counts[row.classificationReason] ?? 0) + 1;
  return counts;
}

export function analyzeMicrostructureQuality(input: microstructure_quality_input) {
  if (input.endTimeMs <= input.startTimeMs) throw new Error('Analysis end must be after start');
  const participants = [...new Map(input.participantRows.map((row) => [row.rowKey, row])).values()];
  const trades = [
    ...new Map(input.economicTrades.map((row) => [row.economicTradeId, row])).values(),
  ];
  const duplicateRawRows = input.participantRows.length - participants.length;
  const ambiguous = trades.filter((row) => row.ambiguous);
  const unknown = trades.filter((row) => row.aggressorSide === 'UNKNOWN');
  const websocketParticipants = participants.filter((row) => row.ingestionSource === 'WEBSOCKET');
  const bootstrapParticipants = participants.filter(
    (row) => row.ingestionSource === 'REST_BOOTSTRAP',
  );
  const latencyValues = (rows: timestamped_row[]): number[] =>
    rows.map((row) => row.receivedAtMs - row.exchangeTimestampMs);
  const latency = (rows: timestamped_row[]) => {
    const values = latencyValues(rows);
    const negativeCount = values.filter((value) => value < 0).length;
    return {
      ...calculatePercentiles(values),
      sampleCount: values.length,
      negativeCount,
      negativeRatio: ratio(negativeCount, values.length),
    };
  };
  const persistenceLatency = (rows: timestamped_row[]): percentiles =>
    calculatePercentiles(
      rows
        .filter((row) => row.persistedAtMs > 0)
        .map((row) => row.persistedAtMs - row.receivedAtMs),
    );
  const aggregateSet = new Set(input.aggregateTimestampsMs);
  const observed = [...aggregateSet].sort((a, b) => a - b);
  const firstObserved = observed[0] ?? null;
  const lastObserved = observed.at(-1) ?? null;
  const activeSeconds = new Set<number>();
  if (firstObserved !== null && lastObserved !== null) {
    for (const session of input.activeSessions) {
      const start = Math.ceil(Math.max(session.startTimeMs, firstObserved) / 1_000) * 1_000;
      const end =
        Math.ceil(Math.min(session.endTimeMs, lastObserved + 1_000) / 1_000) * 1_000 - 1_000;
      for (let time = start; time <= end; time += 1_000) activeSeconds.add(time);
    }
  }
  const expected = [...activeSeconds].sort((a, b) => a - b);
  const missing = expected.filter((time) => !aggregateSet.has(time));
  const gaps: Array<{ startTimestamp: string; endTimestamp: string; missingSeconds: number }> = [];
  let gapStart: number | null = null;
  let previous: number | null = null;
  for (const time of missing) {
    if (gapStart === null || previous === null || time !== previous + 1_000) {
      if (gapStart !== null && previous !== null)
        gaps.push({
          startTimestamp: new Date(gapStart).toISOString(),
          endTimestamp: new Date(previous).toISOString(),
          missingSeconds: (previous - gapStart) / 1_000 + 1,
        });
      gapStart = time;
    }
    previous = time;
  }
  if (gapStart !== null && previous !== null)
    gaps.push({
      startTimestamp: new Date(gapStart).toISOString(),
      endTimestamp: new Date(previous).toISOString(),
      missingSeconds: (previous - gapStart) / 1_000 + 1,
    });
  const requestedDurationMs = input.endTimeMs - input.startTimeMs;
  const availableDurationMs = expected.length * 1_000;
  const requestedCoverageRatio = Math.min(1, ratio(availableDurationMs, requestedDurationMs));
  const missingRatio = ratio(missing.length, expected.length);
  const sessionCoverageAvailable = input.activeSessions.length > 0;
  const insufficient =
    requestedCoverageRatio < MICROSTRUCTURE_QUALITY_THRESHOLDS.minimumRequestedCoverageRatio ||
    input.books.length < 2 ||
    observed.length < 2 ||
    !sessionCoverageAvailable;
  let collectionSeverity = 0;
  const collectionReasons: string[] = [];
  const raiseCollection = (level: number, reason: string): void => {
    collectionSeverity = Math.max(collectionSeverity, level);
    collectionReasons.push(reason);
  };
  if (insufficient) raiseCollection(2, 'NOT_ENOUGH_DATA');
  if (missingRatio > MICROSTRUCTURE_QUALITY_THRESHOLDS.failureMissingRatio)
    raiseCollection(2, 'active_session_missing_ratio');
  else if (missingRatio > MICROSTRUCTURE_QUALITY_THRESHOLDS.warningMissingRatio)
    raiseCollection(1, 'active_session_missing_ratio');
  const realtimeLatency = {
    trades: latency(websocketParticipants),
    bookSnapshots: latency(input.books),
    marketPrices: latency(input.marketPrices),
  };
  for (const [dataset, metric] of Object.entries(realtimeLatency)) {
    if (metric.p99 !== null && metric.p99 > MICROSTRUCTURE_QUALITY_THRESHOLDS.failureLatencyP99Ms)
      raiseCollection(2, `${dataset}_latency`);
    else if (
      metric.p99 !== null &&
      metric.p99 > MICROSTRUCTURE_QUALITY_THRESHOLDS.warningLatencyP99Ms
    )
      raiseCollection(1, `${dataset}_latency`);
    if (metric.negativeCount > 0) raiseCollection(1, `${dataset}_negative_latency`);
  }
  if (input.marketPrices.length === 0) raiseCollection(1, 'market_price_coverage');
  const ambiguousRatio = ratio(ambiguous.length, trades.length);
  const unknownRatio = ratio(unknown.length, trades.length);
  let directionalSeverity = 0;
  const directionalReasons: string[] = [];
  const raiseDirectional = (level: number, reason: string): void => {
    directionalSeverity = Math.max(directionalSeverity, level);
    directionalReasons.push(reason);
  };
  if (trades.length === 0) raiseDirectional(2, 'NOT_ENOUGH_DATA');
  if (ambiguousRatio > MICROSTRUCTURE_QUALITY_THRESHOLDS.failureAmbiguousRatio)
    raiseDirectional(2, 'ambiguous_trade_ratio');
  else if (ambiguousRatio > MICROSTRUCTURE_QUALITY_THRESHOLDS.warningAmbiguousRatio)
    raiseDirectional(1, 'ambiguous_trade_ratio');
  if (unknownRatio > MICROSTRUCTURE_QUALITY_THRESHOLDS.failureUnknownAggressorRatio)
    raiseDirectional(2, 'unknown_aggressor_ratio');
  else if (unknownRatio > MICROSTRUCTURE_QUALITY_THRESHOLDS.warningUnknownAggressorRatio)
    raiseDirectional(1, 'unknown_aggressor_ratio');
  const statusOf = (severity: number): quality_status =>
    severity === 2 ? 'FAIL' : severity === 1 ? 'WARN' : 'PASS';
  const spreadBasisPoints = calculatePercentiles(
    input.books
      .filter((row) => row.midPrice > 0)
      .map((row) => (row.spread / row.midPrice) * 10_000),
  );
  return {
    status:
      collectionSeverity === 2 || directionalSeverity === 2
        ? 'FAIL'
        : collectionSeverity === 1 || directionalSeverity === 1
          ? 'WARN'
          : 'PASS',
    collectionQualityStatus: statusOf(collectionSeverity),
    directionalOrderFlowReadiness: statusOf(directionalSeverity),
    sufficiency: insufficient ? 'NOT_ENOUGH_DATA' : 'ENOUGH_DATA',
    reasons: {
      collection: [...new Set(collectionReasons)],
      directionalOrderFlow: [...new Set(directionalReasons)],
    },
    marketAddress: input.marketAddress,
    analysisStart: new Date(input.startTimeMs).toISOString(),
    analysisEnd: new Date(input.endTimeMs).toISOString(),
    thresholds: MICROSTRUCTURE_QUALITY_THRESHOLDS,
    window: {
      datasets: {
        trades: summarize(trades.map((row) => row.exchangeTimestampMs)),
        bookSnapshots: summarize(input.books.map((row) => row.exchangeTimestampMs)),
        marketPrices: summarize(input.marketPrices.map((row) => row.exchangeTimestampMs)),
        aggregates1s: summarize(observed),
      },
      requestedWindowSufficiency: {
        requestedDurationMs,
        availableDurationMs,
        coverageRatio: requestedCoverageRatio,
      },
      activeSessionContinuity: {
        sessionCoverageAvailable,
        sessionCount: input.activeSessions.length,
        expectedCount: expected.length,
        actualCount: expected.filter((time) => aggregateSet.has(time)).length,
        missingCount: missing.length,
        missingRatio,
        longestGapSeconds: Math.max(0, ...gaps.map((gap) => gap.missingSeconds)),
        gapRangeCount: gaps.length,
        gapTimestamps: gaps.slice(0, 20),
        omittedGapRangeCount: Math.max(0, gaps.length - 20),
      },
      realtimeLatencyMs: realtimeLatency,
      persistenceLatencyMs: {
        websocketTrades: persistenceLatency(websocketParticipants),
        restBootstrapTrades: persistenceLatency(bootstrapParticipants),
        bookSnapshots: persistenceLatency(input.books),
        marketPrices: persistenceLatency(input.marketPrices),
      },
      restBootstrapAgeMs: {
        ...calculatePercentiles(
          bootstrapParticipants.map((row) => row.receivedAtMs - row.exchangeTimestampMs),
        ),
        sampleCount: bootstrapParticipants.length,
      },
      timestampSemantics: {
        exchangeTimestamp: 'exchange event time',
        receivedAtTimestamp: 'local observation time',
        persistedAtTimestamp: 'SQLite insertion time',
      },
      spreadBasisPoints,
      topOfBookDepth: {
        bidSize: calculatePercentiles(input.books.map((row) => row.bestBidSize)),
        askSize: calculatePercentiles(input.books.map((row) => row.bestAskSize)),
        combinedSize: calculatePercentiles(
          input.books.map((row) => row.bestBidSize + row.bestAskSize),
        ),
        imbalance: calculatePercentiles(input.books.map((row) => row.depthImbalance)),
      },
      tradeQuality: {
        rawRows: input.participantRows.length,
        participantRows: participants.length,
        economicTrades: trades.length,
        duplicateRawRows,
        duplicateRawRowRatio: ratio(duplicateRawRows, input.participantRows.length),
        ambiguousTrades: ambiguous.length,
        ambiguousTradeRatio: ambiguousRatio,
        ambiguousReasonBreakdown: countReasons(ambiguous, () => true),
        unknownAggressors: unknown.length,
        unknownAggressorRatio: unknownRatio,
        unknownReasonBreakdown: countReasons(unknown, () => true),
        ingestionSources: {
          REST_BOOTSTRAP: bootstrapParticipants.length,
          WEBSOCKET: websocketParticipants.length,
          UNKNOWN: participants.filter((row) => row.ingestionSource === 'UNKNOWN').length,
        },
      },
    },
    cumulativeStorage: input.cumulativeCounts,
    cumulativeDiagnostics: input.cumulativeDiagnostics,
  };
}
