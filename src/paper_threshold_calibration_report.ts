import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';

type diagnostic_sample = {
  candleCloseTime: string;
  primaryReason: string;
  reasons: string[];
  volatilityRatio: number | null;
  volumeRatio: number | null;
  rangeDistanceRatio: number | null;
  breakoutVolumeRatio: number | null;
  expansionVolatilityRatio: number | null;
  expansionVolumeRatio: number | null;
  breakoutVolumeDeficit: number | null;
  expansionVolatilityDeficit: number | null;
  expansionVolumeDeficit: number | null;
};

function parseObject(value: unknown): Record<string, unknown> {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function parseStrings(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function percentile(values: readonly number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(ratio * sorted.length) - 1] ?? sorted[0]!;
}

function distribution(values: readonly (number | null)[]) {
  const available = values.filter((value): value is number => value !== null);
  return {
    count: available.length,
    p50: percentile(available, 0.5),
    p75: percentile(available, 0.75),
    p90: percentile(available, 0.9),
    p95: percentile(available, 0.95),
  };
}

function countBy(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

export function analyzePersistedThresholds(samples: readonly diagnostic_sample[]) {
  const failures = samples.filter((sample) =>
    sample.reasons.includes('VOLATILITY_OR_RANGE_FILTER_FAILED'),
  );
  const latestThresholdSample = samples.find(
    (sample) =>
      sample.breakoutVolumeRatio !== null &&
      sample.expansionVolatilityRatio !== null &&
      sample.expansionVolumeRatio !== null,
  );
  const thresholds =
    latestThresholdSample === undefined
      ? null
      : {
          breakoutVolumeRatio: latestThresholdSample.breakoutVolumeRatio!,
          expansionVolatilityRatio: latestThresholdSample.expansionVolatilityRatio!,
          expansionVolumeRatio: latestThresholdSample.expansionVolumeRatio!,
        };
  const subconditions = failures.flatMap((sample) => {
    if (thresholds === null) return ['THRESHOLDS_UNAVAILABLE'];
    const reasons: string[] = [];
    if (sample.rangeDistanceRatio === null) reasons.push('RANGE_DISTANCE_UNAVAILABLE');
    else if (sample.rangeDistanceRatio > 0) reasons.push('RANGE_BREAK_FAILED');
    if (sample.volumeRatio === null) reasons.push('VOLUME_RATIO_UNAVAILABLE');
    else {
      if (sample.volumeRatio < thresholds.breakoutVolumeRatio)
        reasons.push('BREAKOUT_VOLUME_FAILED');
      if (sample.volumeRatio < thresholds.expansionVolumeRatio)
        reasons.push('EXPANSION_VOLUME_FAILED');
    }
    if (sample.volatilityRatio === null) reasons.push('VOLATILITY_RATIO_UNAVAILABLE');
    else if (sample.volatilityRatio < thresholds.expansionVolatilityRatio)
      reasons.push('EXPANSION_VOLATILITY_FAILED');
    return reasons;
  });
  const unchangedPasses =
    thresholds === null
      ? []
      : failures.filter(
          (sample) =>
            sample.rangeDistanceRatio !== null &&
            sample.rangeDistanceRatio <= 0 &&
            sample.volatilityRatio !== null &&
            sample.volatilityRatio >= thresholds.expansionVolatilityRatio &&
            sample.volumeRatio !== null &&
            sample.volumeRatio >=
              Math.max(thresholds.breakoutVolumeRatio, thresholds.expansionVolumeRatio),
        );
  const marginalMisses =
    thresholds === null
      ? []
      : failures.filter(
          (sample) =>
            !unchangedPasses.includes(sample) &&
            sample.rangeDistanceRatio !== null &&
            sample.rangeDistanceRatio <= 0.001 &&
            sample.volatilityRatio !== null &&
            sample.volatilityRatio >= thresholds.expansionVolatilityRatio * 0.9 &&
            sample.volumeRatio !== null &&
            sample.volumeRatio >=
              Math.max(thresholds.breakoutVolumeRatio, thresholds.expansionVolumeRatio) * 0.9,
        );
  const subconditionCounts = countBy(subconditions);
  const topFailure =
    Object.entries(subconditionCounts).sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0] ?? null;
  const marginalRatio = marginalMisses.length / Math.max(1, failures.length);
  const dominantRatio = (topFailure?.[1] ?? 0) / Math.max(1, failures.length);
  const recommendation =
    failures.length < 100
      ? 'OBSERVE_MORE'
      : marginalRatio >= 0.25 && dominantRatio >= 0.8
        ? 'THRESHOLDS_TOO_STRICT_TO_REVIEW'
        : 'BACKTEST_REQUIRED';
  return {
    sampleCount: samples.length,
    volatilityOrRangeFailureCount: failures.length,
    currentThresholds: thresholds,
    subconditionFailureCounts: subconditionCounts,
    mostFrequentFailedSubcondition:
      topFailure === null
        ? null
        : {
            reason: topFailure[0],
            count: topFailure[1],
            ratio: topFailure[1] / Math.max(1, failures.length),
          },
    observedRatios: {
      volatilityRatio: distribution(failures.map((sample) => sample.volatilityRatio)),
      volumeRatio: distribution(failures.map((sample) => sample.volumeRatio)),
      rangeDistanceRatio: distribution(failures.map((sample) => sample.rangeDistanceRatio)),
    },
    nearMissDistributions: {
      rangeDistanceRatio: distribution(
        failures.map((sample) =>
          sample.rangeDistanceRatio === null ? null : Math.max(0, sample.rangeDistanceRatio),
        ),
      ),
      breakoutVolumeDeficit: distribution(failures.map((sample) => sample.breakoutVolumeDeficit)),
      expansionVolatilityDeficit: distribution(
        failures.map((sample) => sample.expansionVolatilityDeficit),
      ),
      expansionVolumeDeficit: distribution(failures.map((sample) => sample.expansionVolumeDeficit)),
    },
    passEstimate: {
      unchangedThresholdPassCount: unchangedPasses.length,
      marginalMissCount: marginalMisses.length,
      marginalDefinition: { ratioThresholdTolerance: 0.1, rangeBoundaryToleranceBps: 10 },
    },
    recommendation,
  };
}

export function buildPaperThresholdCalibrationReport(input: {
  paperDatabasePath: string;
  mode: string;
}) {
  if (!existsSync(input.paperDatabasePath))
    return {
      reportVersion: 'PAPER_THRESHOLD_CALIBRATION_V1',
      generatedAt: new Date().toISOString(),
      readOnly: true,
      configuredMode: input.mode,
      status: 'NO_DATA',
      analysis: analyzePersistedThresholds([]),
    };
  const DatabaseHandle = new Database(input.paperDatabasePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });
  DatabaseHandle.exec('BEGIN');
  try {
    const hasDiagnostics =
      DatabaseHandle.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='paper_bot_candidate_diagnostics'",
      ).get() !== undefined;
    const rows = hasDiagnostics
      ? (DatabaseHandle.prepare(
          'SELECT * FROM paper_bot_candidate_diagnostics ORDER BY candle_close_time DESC',
        ).all() as Array<Record<string, unknown>>)
      : [];
    const samples = rows.map((row): diagnostic_sample => {
      const evidence = parseObject(row.evidence_json),
        thresholds = parseObject(evidence.thresholds),
        nearMiss = parseObject(evidence.nearestMiss);
      const currentClose = number(evidence.currentClose),
        rangeDistance = number(nearMiss.rangeBreakDistance),
        persistedRatio = number(evidence.breakoutRangeDistanceRatio);
      return {
        candleCloseTime: String(row.candle_close_time),
        primaryReason: String(row.primary_reason),
        reasons: parseStrings(row.reasons_json),
        volatilityRatio: number(evidence.volatilityRatio),
        volumeRatio: number(evidence.volumeRatio),
        rangeDistanceRatio:
          persistedRatio === null
            ? currentClose === null || currentClose <= 0 || rangeDistance === null
              ? null
              : rangeDistance / currentClose
            : Math.max(0, -persistedRatio),
        breakoutVolumeRatio: number(thresholds.breakoutVolumeRatio),
        expansionVolatilityRatio: number(thresholds.expansionVolatilityRatio),
        expansionVolumeRatio: number(thresholds.expansionVolumeRatio),
        breakoutVolumeDeficit: number(nearMiss.breakoutVolumeDeficit),
        expansionVolatilityDeficit: number(nearMiss.expansionVolatilityDeficit),
        expansionVolumeDeficit: number(nearMiss.expansionVolumeDeficit),
      };
    });
    return {
      reportVersion: 'PAPER_THRESHOLD_CALIBRATION_V1',
      generatedAt: new Date().toISOString(),
      readOnly: true,
      configuredMode: input.mode,
      status: samples.length === 0 ? 'NO_DATA' : 'COMPLETE',
      analysis: analyzePersistedThresholds(samples),
    };
  } finally {
    if (DatabaseHandle.inTransaction) DatabaseHandle.exec('COMMIT');
    DatabaseHandle.close();
  }
}
