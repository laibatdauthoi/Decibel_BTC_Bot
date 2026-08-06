import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { z } from 'zod';

const ConfigurationSchema = z.object({
  PAPER_REPORT_LATEST_COUNT: z.coerce.number().int().min(1).max(100).default(10),
});
type row = Record<string, unknown>;

function hasTable(DatabaseHandle: Database.Database, table: string): boolean {
  return (
    DatabaseHandle.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(
      table,
    ) !== undefined
  );
}

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

function countBy(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function buildPaperTradeEligibilityReport(input: {
  paperDatabasePath: string;
  mode: string;
  environment?: Record<string, string | undefined>;
}) {
  const latestCount = ConfigurationSchema.parse(input.environment ?? {}).PAPER_REPORT_LATEST_COUNT;
  if (!existsSync(input.paperDatabasePath))
    return {
      reportVersion: 'PAPER_TRADE_ELIGIBILITY_V1',
      generatedAt: new Date().toISOString(),
      readOnly: true,
      configuredMode: input.mode,
      status: 'NO_DATA',
      stages: {
        evaluated: 0,
        generatedEvaluations: 0,
        generatedCandidates: 0,
        selected: 0,
        riskApproved: 0,
        ordered: 0,
        filled: 0,
      },
      explanation: 'NO_COMPLETED_EVALUATIONS',
      noCandidateReasons: {},
      riskRejectionReasons: {},
      volatilityOrRangeFailure: {
        count: 0,
        averageVolatilityRatio: null,
        averageVolumeRatio: null,
        thresholds: null,
      },
      latestCandidateDiagnostics: [],
      nearMissCandidates: [],
      liveRiskIntentCount: 0,
      liveOrderCount: 0,
    };
  const DatabaseHandle = new Database(input.paperDatabasePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });
  DatabaseHandle.exec('BEGIN');
  try {
    const evaluations = hasTable(DatabaseHandle, 'live_candle_evaluations')
      ? (DatabaseHandle.prepare(
          "SELECT * FROM live_candle_evaluations WHERE status='EVALUATED' ORDER BY candle_time DESC",
        ).all() as row[])
      : [];
    const diagnostics = hasTable(DatabaseHandle, 'paper_bot_candidate_diagnostics')
      ? (DatabaseHandle.prepare(
          'SELECT * FROM paper_bot_candidate_diagnostics ORDER BY candle_close_time DESC',
        ).all() as row[])
      : [];
    const risks = hasTable(DatabaseHandle, 'paper_bot_risk_decisions')
      ? (DatabaseHandle.prepare(
          'SELECT * FROM paper_bot_risk_decisions ORDER BY created_at DESC',
        ).all() as row[])
      : [];
    const orders = hasTable(DatabaseHandle, 'paper_bot_simulated_order_events')
      ? (DatabaseHandle.prepare(
          'SELECT DISTINCT simulated_order_id FROM paper_bot_simulated_order_events',
        ).all() as row[])
      : [];
    const fills = hasTable(DatabaseHandle, 'paper_bot_simulated_executions')
      ? (DatabaseHandle.prepare(
          'SELECT simulated_order_id FROM paper_bot_simulated_executions',
        ).all() as row[])
      : [];
    const audit = hasTable(DatabaseHandle, 'paper_bot_evaluation_ledger')
      ? (DatabaseHandle.prepare(
          'SELECT risk_intent_created,order_created FROM paper_bot_evaluation_ledger',
        ).all() as Array<{ risk_intent_created: number; order_created: number }>)
      : [];
    const generatedEvaluations = evaluations.filter((value) => Number(value.candidate_count) > 0);
    const selected = evaluations.filter((value) => typeof value.selected_candidate_id === 'string');
    const approved = risks.filter((value) => Number(value.approved) === 1);
    const diagnosticRecords = diagnostics.map((value) => {
      const evidence = parseObject(value.evidence_json);
      return {
        candleOpenTime: value.candle_open_time,
        candleCloseTime: value.candle_close_time,
        primaryReason: value.primary_reason,
        reasons: parseStrings(value.reasons_json),
        regime: evidence.regime ?? null,
        volatilityRatio: finiteNumber(evidence.volatilityRatio),
        volumeRatio: finiteNumber(evidence.volumeRatio),
        thresholds: parseObject(evidence.thresholds),
        nearestMiss: parseObject(evidence.nearestMiss),
      };
    });
    const allReasons = diagnosticRecords.flatMap((value) => value.reasons);
    const volatilityFailures = diagnosticRecords.filter((value) =>
      value.reasons.includes('VOLATILITY_OR_RANGE_FILTER_FAILED'),
    );
    const stages = {
      evaluated: evaluations.length,
      generatedEvaluations: generatedEvaluations.length,
      generatedCandidates: generatedEvaluations.reduce(
        (sum, value) => sum + Number(value.candidate_count),
        0,
      ),
      selected: selected.length,
      riskApproved: approved.length,
      ordered: orders.length,
      filled: fills.length,
    };
    const explanation =
      stages.evaluated === 0
        ? 'NO_COMPLETED_EVALUATIONS'
        : stages.generatedCandidates === 0
          ? 'STRATEGY_GENERATED_NO_CANDIDATES'
          : stages.selected === 0
            ? 'GENERATED_CANDIDATES_NOT_SELECTED'
            : stages.riskApproved === 0
              ? 'SELECTED_CANDIDATES_NOT_RISK_APPROVED'
              : stages.ordered === 0
                ? 'RISK_APPROVED_WITHOUT_SIMULATED_ORDER'
                : stages.filled === 0
                  ? 'SIMULATED_ORDERS_NOT_FILLED'
                  : 'SIMULATED_FILLS_PRESENT';
    return {
      reportVersion: 'PAPER_TRADE_ELIGIBILITY_V1',
      generatedAt: new Date().toISOString(),
      readOnly: true,
      configuredMode: input.mode,
      status: evaluations.length === 0 ? 'NO_DATA' : 'COMPLETE',
      stages,
      explanation,
      noCandidateReasons: countBy(allReasons),
      primaryNoCandidateReasons: countBy(
        diagnosticRecords.map((value) => String(value.primaryReason)),
      ),
      riskDecisions: {
        total: risks.length,
        approved: approved.length,
        rejected: risks.length - approved.length,
      },
      riskRejectionReasons: countBy(
        risks
          .filter((value) => Number(value.approved) === 0)
          .map((value) =>
            typeof value.rejection_reason === 'string' ? value.rejection_reason : 'UNSPECIFIED',
          ),
      ),
      volatilityOrRangeFailure: {
        count: volatilityFailures.length,
        averageVolatilityRatio: average(
          volatilityFailures.flatMap((value) =>
            value.volatilityRatio === null ? [] : [value.volatilityRatio],
          ),
        ),
        averageVolumeRatio: average(
          volatilityFailures.flatMap((value) =>
            value.volumeRatio === null ? [] : [value.volumeRatio],
          ),
        ),
        thresholds:
          volatilityFailures.find((value) => Object.keys(value.thresholds).length > 0)
            ?.thresholds ?? null,
      },
      latestCandidateDiagnostics: diagnosticRecords.slice(0, latestCount),
      nearMissCandidates: diagnosticRecords
        .filter((value) => Object.keys(value.nearestMiss).length > 0)
        .slice(0, latestCount),
      liveRiskIntentCount: audit.reduce((sum, value) => sum + value.risk_intent_created, 0),
      liveOrderCount: audit.reduce((sum, value) => sum + value.order_created, 0),
    };
  } finally {
    if (DatabaseHandle.inTransaction) DatabaseHandle.exec('COMMIT');
    DatabaseHandle.close();
  }
}
