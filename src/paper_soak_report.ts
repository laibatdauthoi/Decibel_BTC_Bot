import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { z } from 'zod';
import {
  buildMicrostructureDiagnosticReport,
  readRawCandidateContext,
} from './microstructure_diagnostic_report.js';
import { buildPaperRuntimeReport } from './paper_runtime_report.js';

const ConfigurationSchema = z.object({
  PAPER_SOAK_MINIMUM_MODERN_EVALUATIONS: z.coerce.number().int().min(1).max(100_000).default(100),
});

type row = Record<string, unknown>;
type readiness_verdict =
  'INSUFFICIENT_EVIDENCE' | 'PAPER_RUNTIME_HEALTHY_COLLECT_MORE' | 'PAPER_RUNTIME_HAS_ISSUES';

function hasTable(DatabaseHandle: Database.Database, table: string): boolean {
  return (
    DatabaseHandle.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(
      table,
    ) !== undefined
  );
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function getReason(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function countEvaluationGaps(rows: readonly row[]) {
  const bySession = new Map<string, number[]>();
  for (const item of rows) {
    if (item.status !== 'COMPLETED') continue;
    const session = String(item.session_id),
      timestamp = Date.parse(String(item.candle_close_time));
    if (!Number.isFinite(timestamp)) continue;
    bySession.set(session, [...(bySession.get(session) ?? []), timestamp]);
  }
  let missingIntervalCount = 0;
  const gaps: Array<{
    sessionId: string;
    previousTimestamp: string;
    expectedTimestamp: string;
    nextTimestamp: string;
    missingIntervalCount: number;
  }> = [];
  for (const [sessionId, timestamps] of bySession) {
    timestamps.sort((left, right) => left - right);
    for (let index = 1; index < timestamps.length; index += 1) {
      const previous = timestamps[index - 1]!,
        next = timestamps[index]!;
      const missing = Math.max(0, Math.floor((next - previous) / 300_000) - 1);
      if (missing > 0) {
        missingIntervalCount += missing;
        gaps.push({
          sessionId,
          previousTimestamp: new Date(previous).toISOString(),
          expectedTimestamp: new Date(previous + 300_000).toISOString(),
          nextTimestamp: new Date(next).toISOString(),
          missingIntervalCount: missing,
        });
      }
    }
  }
  return { missingIntervalCount, gaps: gaps.slice(0, 20) };
}

function readLedgerAudit(databasePath: string) {
  const empty = {
    modernEvaluationCount: 0,
    legacyEvaluationCount: 0,
    duplicateEvaluationCount: 0,
    evaluationContinuity: { missingIntervalCount: 0, gaps: [] as Array<Record<string, unknown>> },
    runtimeErrors: { total: 0, byReason: {} as Record<string, number> },
    consistency: {
      approvedWithoutFill: 0,
      fillWithoutApprovedRisk: 0,
      rejectedWithFill: 0,
      fillWithoutOrder: 0,
      fillWithoutAccountUpdate: 0,
      consistent: true,
    },
  };
  if (!existsSync(databasePath)) return empty;
  const DatabaseHandle = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
    timeout: 5_000,
  });
  DatabaseHandle.exec('BEGIN');
  try {
    const live = hasTable(DatabaseHandle, 'live_candle_evaluations')
      ? (DatabaseHandle.prepare('SELECT * FROM live_candle_evaluations').all() as row[])
      : [];
    const diagnostics = hasTable(DatabaseHandle, 'paper_bot_candidate_diagnostics')
      ? (DatabaseHandle.prepare(
          'SELECT evaluation_id FROM paper_bot_candidate_diagnostics',
        ).all() as row[])
      : [];
    const diagnosticIds = new Set(diagnostics.map((value) => String(value.evaluation_id)));
    const modern = live.filter((value) => diagnosticIds.has(String(value.evaluation_id)));
    const modernCandleCloses = new Set(modern.map((value) => String(value.completed_at)));
    const ledger = hasTable(DatabaseHandle, 'paper_bot_evaluation_ledger')
      ? (DatabaseHandle.prepare('SELECT * FROM paper_bot_evaluation_ledger').all() as row[])
      : [];
    const risks = hasTable(DatabaseHandle, 'paper_bot_risk_decisions')
      ? (DatabaseHandle.prepare('SELECT * FROM paper_bot_risk_decisions').all() as row[])
      : [];
    const fills = hasTable(DatabaseHandle, 'paper_bot_simulated_executions')
      ? (DatabaseHandle.prepare('SELECT * FROM paper_bot_simulated_executions').all() as row[])
      : [];
    const orders = hasTable(DatabaseHandle, 'paper_bot_simulated_order_events')
      ? (DatabaseHandle.prepare(
          'SELECT DISTINCT simulated_order_id FROM paper_bot_simulated_order_events',
        ).all() as row[])
      : [];
    const accounts = hasTable(DatabaseHandle, 'paper_bot_account_ledger')
      ? (DatabaseHandle.prepare(
          'SELECT evaluation_id FROM paper_bot_account_ledger WHERE evaluation_id IS NOT NULL',
        ).all() as row[])
      : [];
    const fillsByEvaluation = new Set(fills.map((value) => String(value.evaluation_id)));
    const approved = new Set(
      risks
        .filter((value) => Number(value.approved) === 1)
        .map((value) => String(value.evaluation_id)),
    );
    const rejected = new Set(
      risks
        .filter((value) => Number(value.approved) === 0)
        .map((value) => String(value.evaluation_id)),
    );
    const orderIds = new Set(orders.map((value) => String(value.simulated_order_id)));
    const accountEvaluationIds = new Set(accounts.map((value) => String(value.evaluation_id)));
    const errorReasons = [
      ...live
        .filter(
          (value) =>
            value.status === 'FAILED' ||
            (typeof value.reason_code === 'string' && value.reason_code.includes('ERROR')),
        )
        .map((value) => getReason(value.reason_code, 'EVALUATION_FAILED')),
      ...(hasTable(DatabaseHandle, 'candle_gap_reconciliations')
        ? (
            DatabaseHandle.prepare(
              "SELECT reason_code FROM candle_gap_reconciliations WHERE status='FAILED'",
            ).all() as row[]
          ).map((value) => getReason(value.reason_code, 'RECONCILIATION_FAILED'))
        : []),
    ];
    const duplicateEvaluationCount =
      live.length - new Set(live.map((value) => String(value.candle_time))).size;
    const consistency = {
      approvedWithoutFill: [...approved].filter((id) => !fillsByEvaluation.has(id)).length,
      fillWithoutApprovedRisk: fills.filter((value) => !approved.has(String(value.evaluation_id)))
        .length,
      rejectedWithFill: [...rejected].filter((id) => fillsByEvaluation.has(id)).length,
      fillWithoutOrder: fills.filter((value) => !orderIds.has(String(value.simulated_order_id)))
        .length,
      fillWithoutAccountUpdate: fills.filter(
        (value) => !accountEvaluationIds.has(String(value.evaluation_id)),
      ).length,
      consistent: true,
    };
    consistency.consistent = Object.entries(consistency).every(
      ([key, value]) => key === 'consistent' || value === 0,
    );
    return {
      modernEvaluationCount: modern.length,
      legacyEvaluationCount: live.length - modern.length,
      duplicateEvaluationCount,
      evaluationContinuity: countEvaluationGaps(
        ledger.filter((value) => modernCandleCloses.has(String(value.candle_close_time))),
      ),
      runtimeErrors: { total: errorReasons.length, byReason: countBy(errorReasons) },
      consistency,
    };
  } finally {
    if (DatabaseHandle.inTransaction) DatabaseHandle.exec('COMMIT');
    DatabaseHandle.close();
  }
}

export function classifyPaperSoakReadiness(input: {
  modernEvaluations: number;
  minimumModernEvaluations: number;
  issues: readonly string[];
}): readiness_verdict {
  if (input.issues.length > 0) return 'PAPER_RUNTIME_HAS_ISSUES';
  return input.modernEvaluations < input.minimumModernEvaluations
    ? 'INSUFFICIENT_EVIDENCE'
    : 'PAPER_RUNTIME_HEALTHY_COLLECT_MORE';
}

export function buildPaperSoakReport(input: {
  paperDatabasePath: string;
  candleDatabasePath: string;
  microstructureDatabasePath: string;
  mode: string;
  environment?: Record<string, string | undefined>;
  nowMs?: number;
}) {
  const environment = input.environment ?? {};
  const minimum = ConfigurationSchema.parse(environment).PAPER_SOAK_MINIMUM_MODERN_EVALUATIONS;
  const paper = buildPaperRuntimeReport({
    paperDatabasePath: input.paperDatabasePath,
    candleDatabasePath: input.candleDatabasePath,
    mode: input.mode,
    environment,
  });
  const context = readRawCandidateContext({
    candleDatabasePath: input.candleDatabasePath,
    environment,
    ...(input.nowMs === undefined ? {} : { nowMs: input.nowMs }),
  });
  const microstructure =
    context.marketAddress === null
      ? null
      : buildMicrostructureDiagnosticReport({
          databasePath: input.microstructureDatabasePath,
          marketAddress: context.marketAddress,
          rawCandidateDecisionTimesMs: context.candidateDecisionTimesMs,
          environment,
          ...(input.nowMs === undefined ? {} : { nowMs: input.nowMs }),
        });
  const audit = readLedgerAudit(input.paperDatabasePath);
  const issues: string[] = [];
  if (paper.liveRiskIntentCount !== 0) issues.push('LIVE_RISK_INTENTS_PRESENT');
  if (paper.liveOrderCount !== 0) issues.push('LIVE_ORDERS_PRESENT');
  if (paper.candleData.missingIntervalCount !== 0) issues.push('CANDLE_GAPS_PRESENT');
  if (audit.duplicateEvaluationCount !== 0) issues.push('DUPLICATE_EVALUATIONS_PRESENT');
  if (audit.evaluationContinuity.missingIntervalCount !== 0)
    issues.push('MODERN_SESSION_EVALUATION_GAPS_PRESENT');
  if (audit.runtimeErrors.total !== 0) issues.push('RUNTIME_ERRORS_PRESENT');
  if (!audit.consistency.consistent) issues.push('PAPER_LEDGER_INCONSISTENT');
  if (
    audit.modernEvaluationCount > 0 &&
    microstructure !== null &&
    (!microstructure.collectorCompatibleNow || !microstructure.currentCandidateReadiness.valid)
  )
    issues.push('MICROSTRUCTURE_NOT_READY');
  return {
    reportVersion: 'PAPER_SOAK_REPORT_V1',
    generatedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    readOnly: true,
    configuredMode: input.mode,
    liveExecutionEnabled: false,
    evidence: {
      minimumModernEvaluations: minimum,
      modernEvaluationCount: audit.modernEvaluationCount,
      legacyEvaluationCount: audit.legacyEvaluationCount,
    },
    candidateLifecycle: paper.candidateLifecycle,
    microstructure:
      microstructure === null
        ? { status: 'NO_CANDLE_MARKET', collectorCompatibleNow: false }
        : {
            status: microstructure.status,
            collectorCompatibleNow: microstructure.collectorCompatibleNow,
            freshness: microstructure.freshness,
            candidateCoverage: microstructure.candidateCoverage,
            currentCandidateReadiness: microstructure.currentCandidateReadiness,
          },
    paperRisk: paper.paperRisk,
    paperLedger: {
      simulatedOrderCount: paper.simulatedOrders,
      simulatedFillCount: paper.simulatedFills,
      accountAvailable: paper.account !== null,
      ...audit.consistency,
    },
    continuity: {
      candles: paper.candleData,
      evaluations: audit.evaluationContinuity,
      duplicateEvaluationCount: audit.duplicateEvaluationCount,
    },
    runtimeErrors: audit.runtimeErrors,
    liveSafety: {
      liveRiskIntentCount: paper.liveRiskIntentCount,
      liveOrderCount: paper.liveOrderCount,
      expectedZero: true,
      valid: paper.liveRiskIntentCount === 0 && paper.liveOrderCount === 0,
    },
    readiness: {
      verdict: classifyPaperSoakReadiness({
        modernEvaluations: audit.modernEvaluationCount,
        minimumModernEvaluations: minimum,
        issues,
      }),
      issues,
      explanation:
        issues.length > 0
          ? 'Current compatible-runtime evidence contains safety, continuity, runtime, microstructure, or ledger issues.'
          : audit.modernEvaluationCount < minimum
            ? `Collect at least ${minimum} modern evaluations before assessing paper runtime readiness.`
            : 'Modern paper-runtime evidence is internally consistent; continue collecting paper observations.',
    },
  };
}
