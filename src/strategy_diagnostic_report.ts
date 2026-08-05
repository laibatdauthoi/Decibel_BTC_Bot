import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { z } from 'zod';
import type { BTC_candlestick } from './decibel_client.js';
import { loadMarketStructureConfig } from './market_structure.js';
import { MICROSTRUCTURE_FEATURE_VERSION } from './microstructure_repository.js';
import {
  loadOpportunityScannerConfig,
  scanBTCOpportunities,
  type opportunity_candidate,
} from './opportunity_scanner.js';
import {
  diagnoseStrategyCandidate,
  type strategy_candidate_diagnostic,
} from './strategy_candidate_diagnostics.js';
import { buildBTCTimeframes, type BTC_timeframes } from './timeframe_aggregation.js';

const FIVE_MINUTES_MS = 300_000;
const EnvironmentSchema = z.object({
  STRATEGY_DIAGNOSTIC_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});
type row = {
  timestamp_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function distribution(values: readonly number[]) {
  if (values.length === 0)
    return {
      count: 0,
      minimum: null,
      p25: null,
      median: null,
      p75: null,
      p90: null,
      maximum: null,
    };
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (fraction: number) => sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
  return {
    count: values.length,
    minimum: sorted[0]!,
    p25: percentile(0.25),
    median: percentile(0.5),
    p75: percentile(0.75),
    p90: percentile(0.9),
    maximum: sorted.at(-1)!,
  };
}

function countBy(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

const DiagnosticReasons = [
  'INSUFFICIENT_CANDLE_HISTORY',
  'MISSING_OR_INVALID_FEATURE_DATA',
  'VOLATILITY_OR_RANGE_FILTER_FAILED',
  'TREND_OR_REGIME_FILTER_FAILED',
  'MICROSTRUCTURE_UNAVAILABLE_OR_STALE',
  'CANDIDATE_FORMED_BUT_INVALIDATED',
  'RISK_OR_POLICY_REJECTION_AFTER_CANDIDATE',
] as const;

function countDiagnosticReasons(values: readonly string[]): Record<string, number> {
  return {
    ...Object.fromEntries(DiagnosticReasons.map((reason) => [reason, 0])),
    ...countBy(values),
  };
}

function candidateKey(candidate: opportunity_candidate): string {
  return [
    candidate.candidateType,
    candidate.direction,
    candidate.detectedAtTime.toISOString(),
    candidate.availableAtTime.toISOString(),
  ].join('|');
}

function readNumber(evidence: Record<string, unknown>, key: string): number | null {
  const value = evidence[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readCandles(databasePath: string): {
  marketAddress: string | null;
  candles: BTC_candlestick[];
} {
  if (!existsSync(databasePath)) return { marketAddress: null, candles: [] };
  const DatabaseHandle = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });
  DatabaseHandle.exec('BEGIN');
  try {
    const table = DatabaseHandle.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='candlesticks'",
    ).get();
    if (table === undefined) return { marketAddress: null, candles: [] };
    const groups = DatabaseHandle.prepare(
      "SELECT market_address,COUNT(*) AS count FROM candlesticks WHERE interval='5m' GROUP BY market_address ORDER BY count DESC,market_address",
    ).all() as Array<{ market_address: string; count: number }>;
    if (groups.length > 1)
      throw new Error('BTC/USD 5m market address is ambiguous in the candle database');
    const marketAddress = groups[0]?.market_address ?? null;
    const rows =
      marketAddress === null
        ? []
        : (DatabaseHandle.prepare(
            "SELECT timestamp_ms,open,high,low,close,volume FROM candlesticks WHERE market_address=? AND interval='5m' ORDER BY timestamp_ms",
          ).all(marketAddress) as row[]);
    DatabaseHandle.exec('COMMIT');
    return {
      marketAddress,
      candles: rows.map((value) => ({
        timestamp: new Date(value.timestamp_ms),
        open: value.open,
        high: value.high,
        low: value.low,
        close: value.close,
        volume: value.volume,
      })),
    };
  } catch (error) {
    if (DatabaseHandle.inTransaction) DatabaseHandle.exec('ROLLBACK');
    throw error;
  } finally {
    if (DatabaseHandle.inTransaction) DatabaseHandle.exec('COMMIT');
    DatabaseHandle.close();
  }
}

function readLiveSafetyCounts(databasePath: string): {
  liveRiskIntentCount: number;
  liveOrderCount: number;
  postCandidateRiskRejections: number;
  paperRiskRejectionReasons: Record<string, number>;
} {
  if (!existsSync(databasePath))
    return {
      liveRiskIntentCount: 0,
      liveOrderCount: 0,
      postCandidateRiskRejections: 0,
      paperRiskRejectionReasons: {},
    };
  const DatabaseHandle = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });
  DatabaseHandle.exec('BEGIN');
  try {
    const table = DatabaseHandle.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='paper_bot_evaluation_ledger'",
    ).get();
    if (table === undefined)
      return {
        liveRiskIntentCount: 0,
        liveOrderCount: 0,
        postCandidateRiskRejections: 0,
        paperRiskRejectionReasons: {},
      };
    const value = DatabaseHandle.prepare(
      'SELECT COALESCE(SUM(risk_intent_created),0) AS risk,COALESCE(SUM(order_created),0) AS orders FROM paper_bot_evaluation_ledger',
    ).get() as { risk: number; orders: number };
    const riskTable = DatabaseHandle.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='paper_bot_risk_decisions'",
    ).get();
    const rejected =
      riskTable === undefined
        ? []
        : (DatabaseHandle.prepare(
            'SELECT rejection_reason FROM paper_bot_risk_decisions WHERE approved=0',
          ).all() as Array<{ rejection_reason: string | null }>);
    return {
      liveRiskIntentCount: value.risk,
      liveOrderCount: value.orders,
      postCandidateRiskRejections: rejected.length,
      paperRiskRejectionReasons: countBy(
        rejected.flatMap((row) => (row.rejection_reason === null ? [] : [row.rejection_reason])),
      ),
    };
  } finally {
    if (DatabaseHandle.inTransaction) DatabaseHandle.exec('COMMIT');
    DatabaseHandle.close();
  }
}

function readValidMicrostructureCandidates(
  databasePath: string,
  marketAddress: string,
  candidates: readonly opportunity_candidate[],
): Set<string> {
  const valid = new Set<string>();
  if (!existsSync(databasePath) || candidates.length === 0) return valid;
  const DatabaseHandle = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });
  DatabaseHandle.exec('BEGIN');
  try {
    const table = DatabaseHandle.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='microstructure_aggregates_1s'",
    ).get();
    const sessionsTable = DatabaseHandle.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='microstructure_collector_sessions'",
    ).get();
    if (table === undefined || sessionsTable === undefined) return valid;
    const sessions = DatabaseHandle.prepare(
      `SELECT session_id,started_at_ms,stopped_at_ms FROM microstructure_collector_sessions
       WHERE market_address=? AND feature_version=? ORDER BY started_at_ms`,
    ).all(marketAddress, MICROSTRUCTURE_FEATURE_VERSION) as Array<{
      session_id: string;
      started_at_ms: number;
      stopped_at_ms: number | null;
    }>;
    const eventsTable = DatabaseHandle.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='microstructure_collector_session_events'",
    ).get();
    if (eventsTable === undefined) return valid;
    const EventStatement = DatabaseHandle.prepare(
      'SELECT event_type,occurred_at_ms FROM microstructure_collector_session_events WHERE session_id=? ORDER BY occurred_at_ms,event_id',
    );
    const compatibleSegments: Array<{ start: number; end: number }> = [];
    for (const session of sessions) {
      let segmentStart: number | null = session.started_at_ms;
      const events = EventStatement.all(session.session_id) as Array<{
        event_type: string;
        occurred_at_ms: number;
      }>;
      for (const event of events) {
        if (
          ['DISCONNECT', 'STOP', 'GRACEFUL_SHUTDOWN'].includes(event.event_type) &&
          segmentStart !== null
        ) {
          compatibleSegments.push({ start: segmentStart, end: event.occurred_at_ms });
          segmentStart = null;
        } else if (['START', 'RECONNECT'].includes(event.event_type) && segmentStart === null)
          segmentStart = event.occurred_at_ms;
      }
      if (segmentStart !== null)
        compatibleSegments.push({
          start: segmentStart,
          end: session.stopped_at_ms ?? Number.MAX_SAFE_INTEGER,
        });
    }
    const Statement = DatabaseHandle.prepare<
      [string, number, string, number, number, number],
      { count: number; missing_book: number; missing_price: number; final_mid: number | null }
    >(`SELECT COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN spread IS NULL THEN 1 ELSE 0 END),0) AS missing_book,
      COALESCE(SUM(CASE WHEN mid_price IS NULL THEN 1 ELSE 0 END),0) AS missing_price,
      (SELECT mid_price FROM microstructure_aggregates_1s final
       WHERE final.market_address=? AND final.second_timestamp_ms=?-1000) AS final_mid
      FROM microstructure_aggregates_1s
      WHERE market_address=? AND second_timestamp_ms>=(?-?*1000) AND second_timestamp_ms<?`);
    for (const candidate of candidates) {
      const decision = candidate.availableAtTime.getTime();
      const windowsValid = [15, 60, 300].every((seconds) => {
        const isCompatible = compatibleSegments.some(
          (segment) => segment.start <= decision - seconds * 1_000 && segment.end >= decision,
        );
        if (!isCompatible) return false;
        const row = Statement.get(
          marketAddress,
          decision,
          marketAddress,
          decision,
          seconds,
          decision,
        );
        return (
          row !== undefined &&
          row.count / seconds >= 0.8 &&
          row.missing_book / row.count <= 0.1 &&
          row.missing_price / row.count <= 0.1 &&
          row.final_mid !== null
        );
      });
      if (windowsValid) valid.add(candidateKey(candidate));
    }
    return valid;
  } catch {
    return valid;
  } finally {
    if (DatabaseHandle.inTransaction) DatabaseHandle.exec('COMMIT');
    DatabaseHandle.close();
  }
}

export function buildStrategyDiagnosticReport(input: {
  candleDatabasePath: string;
  microstructureDatabasePath: string;
  paperDatabasePath: string;
  environment?: Record<string, string | undefined>;
}) {
  const days = EnvironmentSchema.parse(input.environment ?? {}).STRATEGY_DIAGNOSTIC_DAYS;
  const source = readCandles(input.candleDatabasePath);
  const safety = readLiveSafetyCounts(input.paperDatabasePath);
  if (source.candles.length === 0 || source.marketAddress === null)
    return {
      reportVersion: 'STRATEGY_DIAGNOSTIC_V1',
      status: 'NO_DATA',
      readOnly: true,
      configuredDays: days,
      totalCandlesAnalyzed: 0,
      eligibleCandles: 0,
      totalCandidateCount: 0,
      validCandidateCount: 0,
      candidateCandleRatio: 0,
      validCandidateCandleRatio: 0,
      averageCandidatesPerDay: 0,
      candidateCountDistribution: distribution([]),
      validCandidateCountDistribution: distribution([]),
      noCandidateReasonCounts: countDiagnosticReasons([]),
      rejectionReasonsByRegime: {},
      candidateFrequencyByDay: {},
      candidateFrequencyByHourUTC: {},
      candidateFrequencyByRegime: {},
      volatilityOrRangeDiagnostics: null,
      nearestMisses: [],
      staleOrUnavailableMicrostructureCount: 0,
      ...safety,
    };

  const cutoff = source.candles.at(-1)!.timestamp.getTime() + FIVE_MINUTES_MS;
  const start = cutoff - days * 86_400_000;
  const timeframes = buildBTCTimeframes(source.candles, new Date(cutoff));
  const scannerConfig = loadOpportunityScannerConfig(input.environment ?? {});
  const structureConfig = loadMarketStructureConfig(input.environment ?? {});
  const candidates = scanBTCOpportunities(
    timeframes,
    scannerConfig,
    structureConfig,
    new Date(cutoff),
  );
  const candidatesByDecision = new Map<number, opportunity_candidate[]>();
  for (const candidate of candidates) {
    const timestamp = candidate.availableAtTime.getTime();
    if (timestamp < start) continue;
    candidatesByDecision.set(timestamp, [
      ...(candidatesByDecision.get(timestamp) ?? []),
      candidate,
    ]);
  }
  const analysisCandidates = candidates.filter(
    (candidate) => candidate.availableAtTime.getTime() >= start,
  );
  const validCandidateKeys = readValidMicrostructureCandidates(
    input.microstructureDatabasePath,
    source.marketAddress,
    analysisCandidates,
  );

  const analyzed = timeframes['5m'].filter(
    (candle) => candle.timestamp.getTime() + FIVE_MINUTES_MS >= start,
  );
  const rows: Array<{
    decisionTime: string;
    candidateCount: number;
    validCandidateCount: number;
    diagnostic: strategy_candidate_diagnostic;
  }> = [];
  const fiveMinuteStart = timeframes['5m'].length - analyzed.length;
  let completedFifteenCount = 0;
  let completedHourCount = 0;
  for (let analysisIndex = 0; analysisIndex < analyzed.length; analysisIndex += 1) {
    const candle = analyzed[analysisIndex]!;
    const decisionTimeMs = candle.timestamp.getTime() + FIVE_MINUTES_MS;
    while (
      (timeframes['15m'][completedFifteenCount]?.timestamp.getTime() ?? Infinity) + 900_000 <=
      decisionTimeMs
    )
      completedFifteenCount += 1;
    while (
      (timeframes['1h'][completedHourCount]?.timestamp.getTime() ?? Infinity) + 3_600_000 <=
      decisionTimeMs
    )
      completedHourCount += 1;
    const fiveMinuteIndex = fiveMinuteStart + analysisIndex;
    const diagnosticTimeframes: BTC_timeframes = {
      '5m': timeframes['5m'].slice(Math.max(0, fiveMinuteIndex - 100), fiveMinuteIndex + 1),
      '15m': timeframes['15m'].slice(
        Math.max(0, completedFifteenCount - 101),
        completedFifteenCount,
      ),
      '1h': timeframes['1h'].slice(Math.max(0, completedHourCount - 201), completedHourCount),
    };
    const candleCandidates = candidatesByDecision.get(decisionTimeMs) ?? [];
    const validCandidateCount = candleCandidates.filter((candidate) =>
      validCandidateKeys.has(candidateKey(candidate)),
    ).length;
    const diagnostic = diagnoseStrategyCandidate({
      timeframes: diagnosticTimeframes,
      config: scannerConfig,
      structureConfig,
      decisionTime: new Date(decisionTimeMs),
      candidates: candleCandidates,
      ...(candleCandidates.length === 0
        ? {}
        : {
            microstructureWindows: [15, 60, 300].map((seconds) => ({
              seconds,
              status:
                validCandidateCount === candleCandidates.length
                  ? ('VALID' as const)
                  : ('INVALID' as const),
            })),
          }),
    });
    rows.push({
      decisionTime: new Date(decisionTimeMs).toISOString(),
      candidateCount: candleCandidates.length,
      validCandidateCount,
      diagnostic,
    });
  }
  const eligible = rows.filter(
    (row) => row.diagnostic.primaryReason !== 'INSUFFICIENT_CANDLE_HISTORY',
  );
  const failed = rows.filter((row) => row.candidateCount === 0);
  const rejected = rows.filter((row) => row.validCandidateCount === 0);
  const volatilityRows = failed.filter((row) =>
    row.diagnostic.reasons.includes('VOLATILITY_OR_RANGE_FILTER_FAILED'),
  );
  const regimeReasons: Record<string, Record<string, number>> = {};
  for (const row of rejected) {
    const regime =
      typeof row.diagnostic.evidence.regime === 'string'
        ? row.diagnostic.evidence.regime
        : 'UNKNOWN';
    regimeReasons[regime] ??= {};
    for (const reason of row.diagnostic.reasons)
      regimeReasons[regime][reason] = (regimeReasons[regime][reason] ?? 0) + 1;
  }
  const candidateFrequencyByDay = countBy(
    candidates
      .filter((candidate) => candidate.availableAtTime.getTime() >= start)
      .map((candidate) => candidate.availableAtTime.toISOString().slice(0, 10)),
  );
  const candidateFrequencyByHourUTC = countBy(
    candidates
      .filter((candidate) => candidate.availableAtTime.getTime() >= start)
      .map((candidate) => candidate.availableAtTime.toISOString().slice(11, 13)),
  );
  const candidateFrequencyByRegime = countBy(
    candidates
      .filter((candidate) => candidate.availableAtTime.getTime() >= start)
      .map((candidate) => candidate.regime),
  );
  const totalCandidateCount = analysisCandidates.length;
  const totalValidCandidateCount = rows.reduce((sum, row) => sum + row.validCandidateCount, 0);
  const volatilityValues = volatilityRows.flatMap((row) => {
    const value = readNumber(row.diagnostic.evidence, 'volatilityRatio');
    return value === null ? [] : [value];
  });
  const volumeValues = volatilityRows.flatMap((row) => {
    const value = readNumber(row.diagnostic.evidence, 'volumeRatio');
    return value === null ? [] : [value];
  });
  const distanceValues = volatilityRows.flatMap((row) => {
    const value = readNumber(row.diagnostic.evidence, 'breakoutRangeDistanceRatio');
    return value === null ? [] : [value];
  });
  const nearestMisses = volatilityRows
    .map((row) => ({
      decisionTime: row.decisionTime,
      regime: row.diagnostic.evidence.regime,
      volatilityRatio: row.diagnostic.evidence.volatilityRatio,
      volumeRatio: row.diagnostic.evidence.volumeRatio,
      breakoutRangeDistanceRatio: row.diagnostic.evidence.breakoutRangeDistanceRatio,
      nearestMiss: row.diagnostic.evidence.nearestMiss,
    }))
    .sort((left, right) => {
      const leftMiss = left.nearestMiss as Record<string, number>;
      const rightMiss = right.nearestMiss as Record<string, number>;
      return (
        Object.values(leftMiss).reduce((sum, value) => sum + Math.abs(value), 0) -
        Object.values(rightMiss).reduce((sum, value) => sum + Math.abs(value), 0)
      );
    })
    .slice(0, 10);
  return {
    reportVersion: 'STRATEGY_DIAGNOSTIC_V1',
    status: eligible.length === 0 ? 'INSUFFICIENT_HISTORY' : 'COMPLETE',
    readOnly: true,
    marketAddress: source.marketAddress,
    configuredDays: days,
    analysisStart: analyzed[0]?.timestamp.toISOString() ?? null,
    analysisEnd: new Date(cutoff).toISOString(),
    totalCandlesAnalyzed: analyzed.length,
    eligibleCandles: eligible.length,
    totalCandidateCount,
    validCandidateCount: totalValidCandidateCount,
    candidateCandleRatio:
      eligible.length === 0
        ? 0
        : rows.filter((row) => row.candidateCount > 0).length / eligible.length,
    validCandidateCandleRatio:
      eligible.length === 0
        ? 0
        : rows.filter((row) => row.validCandidateCount > 0).length / eligible.length,
    averageCandidatesPerDay: totalCandidateCount / days,
    candidateCountDistribution: distribution(rows.map((row) => row.candidateCount)),
    validCandidateCountDistribution: distribution(rows.map((row) => row.validCandidateCount)),
    noCandidateReasonCounts: countDiagnosticReasons(
      failed.flatMap((row) => row.diagnostic.reasons),
    ),
    rejectionReasonsByRegime: regimeReasons,
    candidateFrequencyByDay,
    candidateFrequencyByHourUTC,
    candidateFrequencyByRegime,
    volatilityOrRangeDiagnostics: {
      sampleCount: volatilityRows.length,
      volatilityRatio: distribution(volatilityValues),
      volumeRatio: distribution(volumeValues),
      breakoutRangeDistanceRatio: distribution(distanceValues),
      currentThresholds: {
        breakoutVolumeRatio: scannerConfig.breakoutVolumeRatio,
        expansionVolatilityRatio: scannerConfig.expansionVolatilityRatio,
        expansionVolumeRatio: scannerConfig.expansionVolumeRatio,
      },
      closeToPassing: {
        volatilityWithin10Percent: {
          count: volatilityValues.filter(
            (value) => value >= scannerConfig.expansionVolatilityRatio * 0.9,
          ).length,
          ratio:
            volatilityValues.length === 0
              ? 0
              : volatilityValues.filter(
                  (value) => value >= scannerConfig.expansionVolatilityRatio * 0.9,
                ).length / volatilityValues.length,
        },
        volumeWithin10Percent: {
          count: volumeValues.filter((value) => value >= scannerConfig.breakoutVolumeRatio * 0.9)
            .length,
          ratio:
            volumeValues.length === 0
              ? 0
              : volumeValues.filter((value) => value >= scannerConfig.breakoutVolumeRatio * 0.9)
                  .length / volumeValues.length,
        },
        rangeBoundaryWithin10Bps: {
          count: distanceValues.filter((value) => value >= -0.001).length,
          ratio:
            distanceValues.length === 0
              ? 0
              : distanceValues.filter((value) => value >= -0.001).length / distanceValues.length,
        },
      },
    },
    nearestMisses,
    staleOrUnavailableMicrostructureCount: rows.filter((row) =>
      row.diagnostic.reasons.includes('MICROSTRUCTURE_UNAVAILABLE_OR_STALE'),
    ).length,
    ...safety,
  };
}
