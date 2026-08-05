import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { z } from 'zod';
import type { BTC_candlestick } from './decibel_client.js';
import { loadMarketStructureConfig } from './market_structure.js';
import { MICROSTRUCTURE_FEATURE_VERSION } from './microstructure_repository.js';
import { loadOpportunityScannerConfig, scanBTCOpportunities } from './opportunity_scanner.js';
import { buildBTCTimeframes } from './timeframe_aggregation.js';

const EnvironmentSchema = z.object({
  MICROSTRUCTURE_DIAGNOSTIC_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  MICROSTRUCTURE_MAX_BOOK_AGE_MS: z.coerce.number().int().min(0).max(60_000).default(2_000),
  MICROSTRUCTURE_MAX_PRICE_AGE_MS: z.coerce.number().int().min(0).max(60_000).default(5_000),
  MICROSTRUCTURE_TRADES_STALE_AFTER_MS: z.coerce
    .number()
    .int()
    .min(10_000)
    .max(900_000)
    .default(120_000),
});
type compatible_segment = { sessionId: string; start: number; end: number };
type aggregate_row = {
  second_timestamp_ms: number;
  trade_count: number;
  spread: number | null;
  mid_price: number | null;
  book_age_ms: number | null;
  market_price_age_ms: number | null;
};

function hasTable(DatabaseHandle: Database.Database, name: string): boolean {
  return (
    DatabaseHandle.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(
      name,
    ) !== undefined
  );
}

function getSegments(
  DatabaseHandle: Database.Database,
  marketAddress: string,
): compatible_segment[] {
  if (
    !hasTable(DatabaseHandle, 'microstructure_collector_sessions') ||
    !hasTable(DatabaseHandle, 'microstructure_collector_session_events')
  )
    return [];
  const sessions = DatabaseHandle.prepare(
    `SELECT session_id,started_at_ms,stopped_at_ms FROM microstructure_collector_sessions
     WHERE market_address=? AND feature_version=? ORDER BY started_at_ms`,
  ).all(marketAddress, MICROSTRUCTURE_FEATURE_VERSION) as Array<{
    session_id: string;
    started_at_ms: number;
    stopped_at_ms: number | null;
  }>;
  const EventStatement = DatabaseHandle.prepare(
    'SELECT event_type,occurred_at_ms FROM microstructure_collector_session_events WHERE session_id=? ORDER BY occurred_at_ms,event_id',
  );
  const segments: compatible_segment[] = [];
  for (const session of sessions) {
    let start: number | null = session.started_at_ms;
    for (const event of EventStatement.all(session.session_id) as Array<{
      event_type: string;
      occurred_at_ms: number;
    }>) {
      if (
        ['DISCONNECT', 'STOP', 'GRACEFUL_SHUTDOWN'].includes(event.event_type) &&
        start !== null
      ) {
        segments.push({ sessionId: session.session_id, start, end: event.occurred_at_ms });
        start = null;
      } else if (['START', 'RECONNECT'].includes(event.event_type) && start === null)
        start = event.occurred_at_ms;
    }
    if (start !== null)
      segments.push({
        sessionId: session.session_id,
        start,
        end: session.stopped_at_ms ?? Number.MAX_SAFE_INTEGER,
      });
  }
  return segments;
}

function assessWindow(input: {
  decisionTimeMs: number;
  seconds: number;
  aggregates: readonly aggregate_row[];
  segments: readonly compatible_segment[];
  firstAggregateMs: number | null;
  lastAggregateMs: number | null;
  maximumBookAgeMs: number;
  maximumPriceAgeMs: number;
}) {
  const start = input.decisionTimeMs - input.seconds * 1_000;
  const outsideCollectedRange =
    input.firstAggregateMs === null ||
    input.lastAggregateMs === null ||
    start < input.firstAggregateMs ||
    input.decisionTimeMs - 1_000 > input.lastAggregateMs;
  const compatible = input.segments.some(
    (segment) => segment.start <= start && segment.end >= input.decisionTimeMs,
  );
  const rows = input.aggregates.filter(
    (row) => row.second_timestamp_ms >= start && row.second_timestamp_ms < input.decisionTimeMs,
  );
  const coverageRatio = rows.length / input.seconds;
  const missingBookCount = rows.filter(
    (row) => row.spread === null || row.book_age_ms === null,
  ).length;
  const missingPriceCount = rows.filter(
    (row) => row.mid_price === null || row.market_price_age_ms === null,
  ).length;
  const staleBookCount = rows.filter(
    (row) => row.book_age_ms !== null && row.book_age_ms > input.maximumBookAgeMs,
  ).length;
  const stalePriceCount = rows.filter(
    (row) => row.market_price_age_ms !== null && row.market_price_age_ms > input.maximumPriceAgeMs,
  ).length;
  const tradeCount = rows.reduce((sum, row) => sum + row.trade_count, 0);
  const reasons: string[] = [];
  if (outsideCollectedRange) reasons.push('OUTSIDE_COLLECTED_RANGE');
  if (!compatible) reasons.push('INCOMPATIBLE_SESSION');
  if (coverageRatio < 0.8) reasons.push('INSUFFICIENT_AGGREGATE_COVERAGE');
  if (missingBookCount / Math.max(1, rows.length) > 0.1) reasons.push('MISSING_BOOK');
  if (missingPriceCount / Math.max(1, rows.length) > 0.1) reasons.push('MISSING_PRICE');
  if (staleBookCount / Math.max(1, rows.length) > 0.1) reasons.push('STALE_BOOK');
  if (stalePriceCount / Math.max(1, rows.length) > 0.1) reasons.push('STALE_PRICE');
  if (tradeCount === 0) reasons.push('NO_TRADES_OBSERVED');
  const invalidReasons = reasons.filter((reason) => reason !== 'NO_TRADES_OBSERVED');
  return {
    seconds: input.seconds,
    status: invalidReasons.length === 0 ? ('VALID' as const) : ('INVALID' as const),
    reasons,
    coverageRatio,
    aggregateCount: rows.length,
    tradeCount,
    noTradeSecondCount: rows.filter((row) => row.trade_count === 0).length,
    missingBookCount,
    missingPriceCount,
    staleBookCount,
    stalePriceCount,
  };
}

function freshness(latest: number | null, nowMs: number, staleAfterMs: number) {
  const ageMs = latest === null ? null : nowMs - latest;
  return {
    latestReceivedAt: latest === null ? null : new Date(latest).toISOString(),
    ageMs,
    status: ageMs === null ? 'MISSING' : ageMs <= staleAfterMs ? 'FRESH' : 'STALE',
  };
}

export function buildMicrostructureDiagnosticReport(input: {
  databasePath: string;
  marketAddress: string;
  rawCandidateDecisionTimesMs: readonly number[];
  nowMs?: number;
  environment?: Record<string, string | undefined>;
}) {
  const config = EnvironmentSchema.parse(input.environment ?? {});
  const nowMs = input.nowMs ?? Date.now();
  if (!existsSync(input.databasePath))
    return {
      reportVersion: 'MICROSTRUCTURE_DIAGNOSTIC_V1',
      status: 'NO_DATA',
      readOnly: true,
      marketAddress: input.marketAddress,
      collectorCompatibleNow: false,
      freshness: {
        trades: freshness(null, nowMs, config.MICROSTRUCTURE_TRADES_STALE_AFTER_MS),
        books: freshness(null, nowMs, config.MICROSTRUCTURE_MAX_BOOK_AGE_MS),
        marketPrice: freshness(null, nowMs, config.MICROSTRUCTURE_MAX_PRICE_AGE_MS),
      },
      candidateCoverage: {
        candidateCount: input.rawCandidateDecisionTimesMs.length,
        allWindowsValid: 0,
      },
      reasonCounts: {},
      currentCandidateReadiness: {
        decisionTime: new Date(nowMs).toISOString(),
        valid: false,
        windows: [],
      },
    };
  const DatabaseHandle = new Database(input.databasePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });
  DatabaseHandle.exec('BEGIN');
  try {
    if (!hasTable(DatabaseHandle, 'microstructure_aggregates_1s'))
      throw new Error(
        'Microstructure database schema is unavailable; run the collector migration first',
      );
    const segments = getSegments(DatabaseHandle, input.marketAddress);
    const rangeStart = Math.min(
      nowMs - config.MICROSTRUCTURE_DIAGNOSTIC_HOURS * 3_600_000,
      ...(input.rawCandidateDecisionTimesMs.length === 0
        ? [nowMs - 300_000]
        : input.rawCandidateDecisionTimesMs.map((value) => value - 300_000)),
    );
    const aggregates = DatabaseHandle.prepare(
      `SELECT second_timestamp_ms,trade_count,spread,mid_price,book_age_ms,market_price_age_ms
       FROM microstructure_aggregates_1s WHERE market_address=? AND second_timestamp_ms>=? AND second_timestamp_ms<?
       ORDER BY second_timestamp_ms`,
    ).all(input.marketAddress, rangeStart, nowMs) as aggregate_row[];
    const aggregateBounds = DatabaseHandle.prepare(
      'SELECT MIN(second_timestamp_ms) AS first,MAX(second_timestamp_ms) AS last FROM microstructure_aggregates_1s WHERE market_address=?',
    ).get(input.marketAddress) as { first: number | null; last: number | null };
    const latestTrade = hasTable(DatabaseHandle, 'microstructure_trade_participants')
      ? (
          DatabaseHandle.prepare(
            "SELECT MAX(received_at_ms) AS latest FROM microstructure_trade_participants WHERE market_address=? AND ingestion_source='WEBSOCKET'",
          ).get(input.marketAddress) as { latest: number | null }
        ).latest
      : null;
    const latestBook = hasTable(DatabaseHandle, 'order_book_snapshots')
      ? (
          DatabaseHandle.prepare(
            'SELECT MAX(received_at_ms) AS latest FROM order_book_snapshots WHERE market_address=?',
          ).get(input.marketAddress) as { latest: number | null }
        ).latest
      : null;
    const latestPrice = hasTable(DatabaseHandle, 'market_price_snapshots')
      ? (
          DatabaseHandle.prepare(
            'SELECT MAX(received_at_ms) AS latest FROM market_price_snapshots WHERE market_address=?',
          ).get(input.marketAddress) as { latest: number | null }
        ).latest
      : null;
    const assess = (decisionTimeMs: number) =>
      [15, 60, 300].map((seconds) =>
        assessWindow({
          decisionTimeMs,
          seconds,
          aggregates,
          segments,
          firstAggregateMs: aggregateBounds.first,
          lastAggregateMs: aggregateBounds.last,
          maximumBookAgeMs: config.MICROSTRUCTURE_MAX_BOOK_AGE_MS,
          maximumPriceAgeMs: config.MICROSTRUCTURE_MAX_PRICE_AGE_MS,
        }),
      );
    const candidateWindows = input.rawCandidateDecisionTimesMs.map((decisionTimeMs) => ({
      decisionTime: new Date(decisionTimeMs).toISOString(),
      windows: assess(decisionTimeMs),
    }));
    const currentDecisionTime = Math.floor(nowMs / 300_000) * 300_000;
    const currentWindows = assess(currentDecisionTime);
    const reasons = candidateWindows.flatMap((candidate) =>
      candidate.windows.flatMap((window) => window.reasons),
    );
    const reasonCounts: Record<string, number> = {};
    for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    const collectorCompatibleNow = segments.some(
      (segment) => segment.start <= nowMs && segment.end >= nowMs,
    );
    return {
      reportVersion: 'MICROSTRUCTURE_DIAGNOSTIC_V1',
      status: aggregates.length === 0 ? 'NO_DATA' : 'COMPLETE',
      readOnly: true,
      marketAddress: input.marketAddress,
      configuredHours: config.MICROSTRUCTURE_DIAGNOSTIC_HOURS,
      featureVersion: MICROSTRUCTURE_FEATURE_VERSION,
      collectorCompatibleNow,
      freshness: {
        trades: freshness(latestTrade, nowMs, config.MICROSTRUCTURE_TRADES_STALE_AFTER_MS),
        books: freshness(latestBook, nowMs, config.MICROSTRUCTURE_MAX_BOOK_AGE_MS),
        marketPrice: freshness(latestPrice, nowMs, config.MICROSTRUCTURE_MAX_PRICE_AGE_MS),
      },
      collectedRange: {
        firstAggregateTime:
          aggregateBounds.first === null ? null : new Date(aggregateBounds.first).toISOString(),
        lastAggregateTime:
          aggregateBounds.last === null ? null : new Date(aggregateBounds.last).toISOString(),
      },
      candidateCoverage: {
        candidateCount: candidateWindows.length,
        allWindowsValid: candidateWindows.filter((candidate) =>
          candidate.windows.every((window) => window.status === 'VALID'),
        ).length,
        byWindow: Object.fromEntries(
          [15, 60, 300].map((seconds) => [
            `${seconds}s`,
            {
              valid: candidateWindows.filter(
                (candidate) =>
                  candidate.windows.find((window) => window.seconds === seconds)?.status ===
                  'VALID',
              ).length,
              total: candidateWindows.length,
            },
          ]),
        ),
      },
      reasonCounts,
      latestCandidateWindows: candidateWindows.slice(-10),
      currentCandidateReadiness: {
        decisionTime: new Date(currentDecisionTime).toISOString(),
        valid: currentWindows.every((window) => window.status === 'VALID'),
        windows: currentWindows,
      },
    };
  } finally {
    if (DatabaseHandle.inTransaction) DatabaseHandle.exec('COMMIT');
    DatabaseHandle.close();
  }
}

export function readRawCandidateContext(input: {
  candleDatabasePath: string;
  environment?: Record<string, string | undefined>;
  nowMs?: number;
}) {
  if (!existsSync(input.candleDatabasePath))
    return { marketAddress: null, candidateDecisionTimesMs: [] as number[] };
  const DatabaseHandle = new Database(input.candleDatabasePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });
  DatabaseHandle.exec('BEGIN');
  try {
    const group = DatabaseHandle.prepare(
      "SELECT market_address FROM candlesticks WHERE interval='5m' GROUP BY market_address ORDER BY COUNT(*) DESC LIMIT 1",
    ).get() as { market_address: string } | undefined;
    if (group === undefined)
      return { marketAddress: null, candidateDecisionTimesMs: [] as number[] };
    const rows = DatabaseHandle.prepare(
      "SELECT timestamp_ms,open,high,low,close,volume FROM candlesticks WHERE market_address=? AND interval='5m' ORDER BY timestamp_ms",
    ).all(group.market_address) as Array<{
      timestamp_ms: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
    const candles: BTC_candlestick[] = rows.map((row) => ({
      timestamp: new Date(row.timestamp_ms),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    }));
    const cutoff = candles.at(-1)?.timestamp.getTime() ?? input.nowMs ?? Date.now();
    const candidates = scanBTCOpportunities(
      buildBTCTimeframes(candles, new Date(cutoff + 300_000)),
      loadOpportunityScannerConfig(input.environment ?? {}),
      loadMarketStructureConfig(input.environment ?? {}),
      new Date(cutoff + 300_000),
    );
    const hours = EnvironmentSchema.parse(input.environment ?? {}).MICROSTRUCTURE_DIAGNOSTIC_HOURS;
    return {
      marketAddress: group.market_address,
      candidateDecisionTimesMs: candidates
        .map((candidate) => candidate.availableAtTime.getTime())
        .filter((timestamp) => timestamp >= cutoff + 300_000 - hours * 3_600_000),
    };
  } finally {
    if (DatabaseHandle.inTransaction) DatabaseHandle.exec('COMMIT');
    DatabaseHandle.close();
  }
}
