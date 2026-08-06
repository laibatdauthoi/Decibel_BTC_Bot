import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';

export type threshold_backtest_sample = {
  candleCloseTime: string;
  reasons: string[];
  volatilityRatio: number | null;
  volumeRatio: number | null;
  rangeDistanceRatio: number | null;
  regime: string | null;
  microstructureValid: boolean | null;
};

export type threshold_set = {
  name: string;
  volatilityMultiplier: number;
  volumeMultiplier: number;
  rangeToleranceBps: number;
};

export const THRESHOLD_SETS: readonly threshold_set[] = [
  { name: 'CURRENT', volatilityMultiplier: 1, volumeMultiplier: 1, rangeToleranceBps: 0 },
  {
    name: 'RATIOS_MINUS_5_PERCENT',
    volatilityMultiplier: 0.95,
    volumeMultiplier: 0.95,
    rangeToleranceBps: 0,
  },
  {
    name: 'RATIOS_MINUS_10_PERCENT',
    volatilityMultiplier: 0.9,
    volumeMultiplier: 0.9,
    rangeToleranceBps: 0,
  },
  {
    name: 'RANGE_TOLERANCE_5_BPS',
    volatilityMultiplier: 1,
    volumeMultiplier: 1,
    rangeToleranceBps: 5,
  },
  {
    name: 'MARGINAL_COMBINED',
    volatilityMultiplier: 0.95,
    volumeMultiplier: 0.95,
    rangeToleranceBps: 5,
  },
  {
    name: 'OUTER_SENSITIVITY_BOUND',
    volatilityMultiplier: 0.9,
    volumeMultiplier: 0.9,
    rangeToleranceBps: 10,
  },
];

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

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function analyzeThresholdBacktest(input: {
  samples: readonly threshold_backtest_sample[];
  thresholds: {
    breakoutVolumeRatio: number;
    expansionVolatilityRatio: number;
    expansionVolumeRatio: number;
  } | null;
  actualSelectedCount?: number;
  actualOrderCount?: number;
  actualFillCount?: number;
}) {
  const failures = input.samples.filter((sample) =>
    sample.reasons.includes('VOLATILITY_OR_RANGE_FILTER_FAILED'),
  );
  const incompleteEvidenceCount = failures.filter(
    (sample) =>
      sample.volatilityRatio === null ||
      sample.volumeRatio === null ||
      sample.rangeDistanceRatio === null,
  ).length;
  const alternatives =
    input.thresholds === null
      ? []
      : THRESHOLD_SETS.map((set) => {
          const volatilityThreshold =
            input.thresholds!.expansionVolatilityRatio * set.volatilityMultiplier;
          const volumeThreshold =
            Math.max(
              input.thresholds!.breakoutVolumeRatio,
              input.thresholds!.expansionVolumeRatio,
            ) * set.volumeMultiplier;
          const evaluable = failures.filter(
            (sample) =>
              sample.volatilityRatio !== null &&
              sample.volumeRatio !== null &&
              sample.rangeDistanceRatio !== null,
          );
          const passed = evaluable.filter(
            (sample) =>
              sample.volatilityRatio! >= volatilityThreshold &&
              sample.volumeRatio! >= volumeThreshold &&
              sample.rangeDistanceRatio! <= set.rangeToleranceBps / 10_000,
          );
          const falsePositiveRiskProxyCount = passed.filter(
            (sample) => sample.regime === 'UNKNOWN' || sample.microstructureValid !== true,
          ).length;
          return {
            name: set.name,
            thresholds: {
              expansionVolatilityRatio: volatilityThreshold,
              requiredVolumeRatio: volumeThreshold,
              rangeToleranceBps: set.rangeToleranceBps,
            },
            evaluableCount: evaluable.length,
            passCount: passed.length,
            selectedCandidateProxyCount: passed.length,
            incrementalPassCount: 0,
            falsePositiveRiskProxy: {
              definition: 'UNKNOWN_REGIME_OR_MICROSTRUCTURE_NOT_PROVEN_VALID',
              count: falsePositiveRiskProxyCount,
              ratio: falsePositiveRiskProxyCount / Math.max(1, passed.length),
            },
          };
        }).map((result, _index, all) => ({
          ...result,
          incrementalPassCount: result.passCount - (all[0]?.passCount ?? 0),
        }));
  const current = alternatives[0];
  const best = [...alternatives]
    .slice(1)
    .sort(
      (left, right) =>
        right.incrementalPassCount - left.incrementalPassCount ||
        left.name.localeCompare(right.name),
    )[0];
  const sufficientEvidence = failures.length >= 100 && incompleteEvidenceCount === 0;
  const recommendation = !sufficientEvidence
    ? 'OBSERVE_MORE'
    : best !== undefined &&
        best.incrementalPassCount >= 20 &&
        best.falsePositiveRiskProxy.ratio <= 0.25
      ? 'REVIEW_THRESHOLD_CHANGE'
      : current !== undefined && current.passCount > 0
        ? 'KEEP_THRESHOLDS'
        : 'OBSERVE_MORE';
  return {
    sampleCount: input.samples.length,
    volatilityOrRangeFailureCount: failures.length,
    expansionVolatilityFailureCount:
      input.thresholds === null
        ? 0
        : failures.filter(
            (sample) =>
              sample.volatilityRatio !== null &&
              sample.volatilityRatio < input.thresholds!.expansionVolatilityRatio,
          ).length,
    incompleteEvidenceCount,
    currentThresholds: input.thresholds,
    sensitivityResults: alternatives,
    actualHistoricalLifecycle: {
      selectedCandidateCount: input.actualSelectedCount ?? 0,
      simulatedOrderCount: input.actualOrderCount ?? 0,
      simulatedFillCount: input.actualFillCount ?? 0,
    },
    hypotheticalExecution: {
      status: 'NOT_MODELABLE_FROM_THRESHOLD_DIAGNOSTICS',
      orderCount: null,
      fillCount: null,
      reason:
        'Counterfactual threshold passes have no persisted candidate identity, point-in-time microstructure validation, risk decision, or fill evidence.',
    },
    falsePositiveRiskProxyLimitations:
      'This proxy measures unknown regime or unproven microstructure only; it is not realized false-positive or PnL evidence.',
    evidenceRequirement: {
      satisfied: sufficientEvidence,
      minimumFailureSamples: 100,
      requiresCompleteRatioEvidence: true,
      productionChangeAutomatic: false,
    },
    recommendation,
  } as const;
}

function hasTable(DatabaseHandle: Database.Database, table: string): boolean {
  return (
    DatabaseHandle.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(
      table,
    ) !== undefined
  );
}

export function buildPaperThresholdBacktestReport(input: {
  paperDatabasePath: string;
  mode: string;
}) {
  const emptyAnalysis = analyzeThresholdBacktest({ samples: [], thresholds: null });
  if (!existsSync(input.paperDatabasePath))
    return {
      reportVersion: 'PAPER_THRESHOLD_BACKTEST_V1',
      generatedAt: new Date().toISOString(),
      readOnly: true,
      configuredMode: input.mode,
      status: 'NO_DATA',
      analysis: emptyAnalysis,
    };
  const DatabaseHandle = new Database(input.paperDatabasePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });
  DatabaseHandle.exec('BEGIN');
  try {
    const rows = hasTable(DatabaseHandle, 'paper_bot_candidate_diagnostics')
      ? (DatabaseHandle.prepare(
          'SELECT * FROM paper_bot_candidate_diagnostics ORDER BY candle_close_time ASC',
        ).all() as Array<Record<string, unknown>>)
      : [];
    let thresholds: Parameters<typeof analyzeThresholdBacktest>[0]['thresholds'] = null;
    const samples = rows.map((row): threshold_backtest_sample => {
      const evidence = parseObject(row.evidence_json);
      const persistedThresholds = parseObject(evidence.thresholds);
      const breakoutVolumeRatio = finiteNumber(persistedThresholds.breakoutVolumeRatio);
      const expansionVolatilityRatio = finiteNumber(persistedThresholds.expansionVolatilityRatio);
      const expansionVolumeRatio = finiteNumber(persistedThresholds.expansionVolumeRatio);
      if (
        thresholds === null &&
        breakoutVolumeRatio !== null &&
        expansionVolatilityRatio !== null &&
        expansionVolumeRatio !== null
      )
        thresholds = {
          breakoutVolumeRatio,
          expansionVolatilityRatio,
          expansionVolumeRatio,
        };
      const windows = Array.isArray(evidence.microstructureWindows)
        ? evidence.microstructureWindows
        : [];
      const persistedRatio = finiteNumber(evidence.breakoutRangeDistanceRatio);
      const nearestMiss = parseObject(evidence.nearestMiss);
      const close = finiteNumber(evidence.currentClose);
      const rangeDistance = finiteNumber(nearestMiss.rangeBreakDistance);
      return {
        candleCloseTime: String(row.candle_close_time),
        reasons: parseStrings(row.reasons_json),
        volatilityRatio: finiteNumber(evidence.volatilityRatio),
        volumeRatio: finiteNumber(evidence.volumeRatio),
        rangeDistanceRatio:
          persistedRatio !== null
            ? Math.max(0, -persistedRatio)
            : close !== null && close > 0 && rangeDistance !== null
              ? rangeDistance / close
              : null,
        regime: typeof evidence.regime === 'string' ? evidence.regime : null,
        microstructureValid:
          windows.length === 0
            ? null
            : windows.every((window) => parseObject(window).status === 'VALID'),
      };
    });
    const count = (table: string, column?: string) =>
      hasTable(DatabaseHandle, table)
        ? Number(
            (
              DatabaseHandle.prepare(
                `SELECT COUNT(${column === undefined ? '*' : `DISTINCT ${column}`}) AS count FROM ${table}`,
              ).get() as { count: number }
            ).count,
          )
        : 0;
    const selectedCount = hasTable(DatabaseHandle, 'live_candle_evaluations')
      ? Number(
          (
            DatabaseHandle.prepare(
              'SELECT COUNT(*) AS count FROM live_candle_evaluations WHERE selected_candidate_id IS NOT NULL',
            ).get() as { count: number }
          ).count,
        )
      : 0;
    const analysis = analyzeThresholdBacktest({
      samples,
      thresholds,
      actualSelectedCount: selectedCount,
      actualOrderCount: count('paper_bot_simulated_order_events', 'simulated_order_id'),
      actualFillCount: count('paper_bot_simulated_executions'),
    });
    return {
      reportVersion: 'PAPER_THRESHOLD_BACKTEST_V1',
      generatedAt: new Date().toISOString(),
      readOnly: true,
      configuredMode: input.mode,
      status:
        samples.length === 0
          ? 'NO_DATA'
          : thresholds === null
            ? 'THRESHOLDS_UNAVAILABLE'
            : 'COMPLETE',
      analysis,
    };
  } finally {
    if (DatabaseHandle.inTransaction) DatabaseHandle.exec('COMMIT');
    DatabaseHandle.close();
  }
}
