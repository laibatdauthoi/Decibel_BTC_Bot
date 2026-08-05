import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { getFinancialDecimal } from './risk_engine.js';

const ConfigurationSchema = z.object({
  PAPER_REPORT_LATEST_COUNT: z.coerce.number().int().min(1).max(100).default(10),
});

type database = Database.Database;
type row = Record<string, unknown>;

function hasTable(DatabaseHandle: database, table: string): boolean {
  return (
    DatabaseHandle.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(
      table,
    ) !== undefined
  );
}

function openReadOnly(databasePath: string): database | null {
  if (!existsSync(databasePath)) return null;
  return new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 5_000 });
}

function decimal(units: unknown): number {
  return getFinancialDecimal(BigInt(String(units)));
}

function getGateDecision(value: row): string {
  if (typeof value.reason_code === 'string') return `SKIPPED:${value.reason_code}`;
  return value.mode === 'PAPER_SIMULATION' ? 'PAPER_SIMULATION' : 'OBSERVE_ONLY';
}

function getDistribution(values: readonly number[]) {
  if (values.length === 0) return { minimum: null, maximum: null, average: null, median: null };
  const sorted = [...values].sort((left, right) => left - right),
    middle = Math.floor(sorted.length / 2),
    median =
      sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
  return {
    minimum: sorted[0]!,
    maximum: sorted.at(-1)!,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    median,
  };
}

function countBy(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function parseStringList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}

function buildCandidateLifecycle(input: {
  liveRows: row[];
  candidateRows: row[];
  riskRows: row[];
  executionRows: row[];
  orderEventRows: row[];
  accountRows: row[];
  latestCount: number;
}) {
  const candidatesByEvaluation = new Map<string, row[]>();
  for (const candidate of input.candidateRows) {
    const evaluationId = String(candidate.evaluation_id);
    candidatesByEvaluation.set(evaluationId, [
      ...(candidatesByEvaluation.get(evaluationId) ?? []),
      candidate,
    ]);
  }
  const accountAscending = [...input.accountRows].sort(
    (left, right) => Number(left.sequence) - Number(right.sequence),
  );
  const isInvalid = (candidate: row) =>
    parseStringList(candidate.reason_codes_json).some((reason) =>
      reason.startsWith('FEATURE_WINDOW_INVALID_'),
    );
  const records = input.liveRows
    .filter((evaluation) => Number(evaluation.candidate_count) > 0)
    .map((evaluation) => {
      const candidates = candidatesByEvaluation.get(String(evaluation.evaluation_id)) ?? [];
      const selectedCandidateId =
        typeof evaluation.selected_candidate_id === 'string'
          ? evaluation.selected_candidate_id
          : null;
      const selected = candidates.find(
        (candidate) => candidate.candidate_id === selectedCandidateId,
      );
      const microstructureValidity =
        selectedCandidateId === null
          ? candidates.length === 0
            ? 'UNKNOWN'
            : candidates.every(isInvalid)
              ? 'INVALID'
              : 'VALID_CANDIDATE_AVAILABLE'
          : selected === undefined
            ? 'UNKNOWN'
            : isInvalid(selected)
              ? 'INVALID'
              : 'VALID';
      const risk = input.riskRows.find(
        (value) => value.candle_close_time === evaluation.completed_at,
      );
      const durableEvaluationId =
        risk === undefined
          ? `evaluation:${String(evaluation.market_address)}:5m:${String(evaluation.completed_at)}`
          : String(risk.evaluation_id);
      const fills = input.executionRows.filter(
        (value) => String(value.evaluation_id) === durableEvaluationId,
      );
      const orderEvents = input.orderEventRows.filter(
        (value) => String(value.evaluation_id) === durableEvaluationId,
      );
      const accountEntries = accountAscending.filter(
        (value) => String(value.evaluation_id) === durableEvaluationId,
      );
      const firstSequence = Number(accountEntries[0]?.sequence ?? Number.MAX_SAFE_INTEGER);
      const before = accountAscending
        .filter((value) => Number(value.sequence) < firstSequence)
        .at(-1);
      const after = accountEntries.at(-1);
      const change = (field: string, defaultBeforeUnits: bigint) =>
        after === undefined
          ? null
          : getFinancialDecimal(
              BigInt(String(after[field])) -
                (before === undefined ? defaultBeforeUnits : BigInt(String(before[field]))),
            );
      const accountImpact =
        after === undefined
          ? null
          : {
              ledgerUpdated: true,
              eventTypes: accountEntries.map((value) => String(value.event_type)),
              cashBalanceChange: change(
                'cash_balance_units',
                BigInt(String(after.cash_balance_units)),
              ),
              equityChange: change('equity_units', BigInt(String(after.equity_units))),
              positionSizeChange: change('position_size_units', 0n),
              realizedPnLChange: change('realized_pnl_units', 0n),
              unrealizedPnLChange: change('unrealized_pnl_units', 0n),
              feesPaidChange: change('fees_paid_units', 0n),
              finalPositionSize: decimal(after.position_size_units),
              finalEquity: decimal(after.equity_units),
            };
      let outcome: string;
      if (selectedCandidateId === null)
        outcome =
          microstructureValidity === 'INVALID'
            ? 'CANDIDATES_FAILED_MICROSTRUCTURE'
            : 'CANDIDATE_GENERATED_NO_SELECTION';
      else if (microstructureValidity === 'INVALID')
        outcome = 'SELECTED_CANDIDATE_FAILED_MICROSTRUCTURE';
      else if (risk !== undefined && risk.approved === 0) outcome = 'PAPER_RISK_REJECTED';
      else if (fills.length > 0)
        outcome =
          accountImpact === null
            ? 'PAPER_FILL_CREATED_ACCOUNT_UPDATE_MISSING'
            : 'PAPER_FILL_CREATED_ACCOUNT_UPDATED';
      else if (orderEvents.length > 0) outcome = 'PAPER_ORDER_CREATED_NO_FILL';
      else if (evaluation.mode === 'OBSERVE_ONLY') outcome = 'OBSERVE_ONLY_NO_PAPER_ACTION';
      else outcome = 'PAPER_RISK_DECISION_MISSING';
      return {
        candleTime: evaluation.candle_time,
        candleCloseTime: evaluation.completed_at,
        candidateCount: Number(evaluation.candidate_count),
        selectedCandidateId,
        microstructureValidity,
        microstructureReasons:
          selected === undefined
            ? candidates.flatMap((candidate) => parseStringList(candidate.reason_codes_json))
            : parseStringList(selected.reason_codes_json),
        gateDecision: getGateDecision(evaluation),
        paperRiskStatus:
          risk === undefined ? 'NOT_CREATED' : risk.approved === 1 ? 'APPROVED' : 'REJECTED',
        paperRiskLedgerStatus: risk?.status ?? null,
        paperRiskDecisionId: risk?.risk_decision_id ?? null,
        paperRiskReason: risk?.rejection_reason ?? null,
        simulatedOrderIds: [
          ...new Set(orderEvents.map((value) => String(value.simulated_order_id))),
        ],
        simulatedFillIds: fills.map((value) => String(value.simulated_order_id)),
        accountImpact,
        outcome,
      };
    });
  return {
    total: records.length,
    byOutcome: countBy(records.map((value) => value.outcome)),
    records: records.slice(0, input.latestCount),
  };
}

function readCandles(DatabaseHandle: database | null, marketAddress: string | null) {
  if (DatabaseHandle === null || !hasTable(DatabaseHandle, 'candlesticks'))
    return {
      status: 'NO_DATA',
      count: 0,
      firstCandleTime: null,
      lastCandleTime: null,
      missingIntervalCount: 0,
      gaps: [] as Array<Record<string, unknown>>,
    };
  const selectedMarket =
      marketAddress ??
      (
        DatabaseHandle.prepare(
          "SELECT market_address FROM candlesticks WHERE interval='5m' GROUP BY market_address ORDER BY COUNT(*) DESC,market_address LIMIT 1",
        ).get() as { market_address: string } | undefined
      )?.market_address ??
      null,
    rows =
      selectedMarket === null
        ? []
        : (DatabaseHandle.prepare(
            "SELECT timestamp_ms FROM candlesticks WHERE interval='5m' AND market_address=? ORDER BY timestamp_ms",
          ).all(selectedMarket) as Array<{ timestamp_ms: number }>);
  const gaps: Array<Record<string, unknown>> = [];
  let missingIntervalCount = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]!.timestamp_ms,
      next = rows[index]!.timestamp_ms,
      missing = Math.max(0, Math.floor((next - previous) / 300_000) - 1);
    if (missing > 0) {
      missingIntervalCount += missing;
      if (gaps.length < 20)
        gaps.push({
          previousTimestamp: new Date(previous).toISOString(),
          expectedTimestamp: new Date(previous + 300_000).toISOString(),
          nextTimestamp: new Date(next).toISOString(),
          missingIntervalCount: missing,
        });
    }
  }
  return {
    status: rows.length === 0 ? 'NO_DATA' : missingIntervalCount === 0 ? 'CONTINUOUS' : 'GAPPED',
    marketAddress: selectedMarket,
    count: rows.length,
    firstCandleTime: rows.length === 0 ? null : new Date(rows[0]!.timestamp_ms).toISOString(),
    lastCandleTime: rows.length === 0 ? null : new Date(rows.at(-1)!.timestamp_ms).toISOString(),
    missingIntervalCount,
    gaps,
  };
}

function readPaper(DatabaseHandle: database | null, latestCount: number) {
  if (DatabaseHandle === null)
    return {
      databaseStatus: 'NO_DATA',
      highWaterMark: null,
      completedEvaluationCount: 0,
      evaluationsByGateDecision: {},
      candidateCountDistribution: getDistribution([]),
      validCandidateCountDistribution: getDistribution([]),
      latestEvaluations: [],
      marketAddress: null,
      featureAndGateEvidence: { gateReasons: {}, candidateReasons: {} },
      paperRisk: { total: 0, approved: 0, rejected: 0, byStatus: {}, byReason: {} },
      simulatedOrders: 0,
      simulatedFills: 0,
      account: null,
      latestFills: [],
      latestAccountEntries: [],
      liveRiskIntentCount: 0,
      liveOrderCount: 0,
      noTradeDiagnostic: { active: false, recentEvaluationCount: 0, explanation: 'NO_EVALUATIONS' },
      topNoCandidateReasons: {},
      latestNoCandidateEvaluations: [],
      postCandidateRiskRejections: [],
      candidateLifecycle: { total: 0, byOutcome: {}, records: [] },
    };
  const highWater = hasTable(DatabaseHandle, 'paper_bot_high_water')
      ? (DatabaseHandle.prepare(
          'SELECT candle_time FROM paper_bot_high_water WHERE singleton=1',
        ).get() as { candle_time: string } | undefined)
      : undefined,
    liveRows = hasTable(DatabaseHandle, 'live_candle_evaluations')
      ? (DatabaseHandle.prepare(
          'SELECT * FROM live_candle_evaluations ORDER BY candle_time DESC',
        ).all() as row[])
      : [],
    candidateRows = hasTable(DatabaseHandle, 'candidate_decisions')
      ? (DatabaseHandle.prepare('SELECT * FROM candidate_decisions').all() as row[])
      : [],
    diagnosticRows = hasTable(DatabaseHandle, 'paper_bot_candidate_diagnostics')
      ? (DatabaseHandle.prepare(
          'SELECT * FROM paper_bot_candidate_diagnostics ORDER BY candle_close_time DESC',
        ).all() as row[])
      : [],
    candidateReasons = candidateRows.flatMap((candidate) => {
      return parseStringList(candidate.reason_codes_json);
    }),
    validByEvaluation = new Map<string, number>();
  for (const candidate of candidateRows) {
    const reasons = parseStringList(candidate.reason_codes_json),
      invalid = reasons.some((reason) => reason.startsWith('FEATURE_WINDOW_INVALID_'));
    if (!invalid) {
      const evaluationId = String(candidate.evaluation_id);
      validByEvaluation.set(evaluationId, (validByEvaluation.get(evaluationId) ?? 0) + 1);
    }
  }
  const evaluations = liveRows.filter((value) => value.status === 'EVALUATED'),
    latestEvaluations = liveRows.slice(0, latestCount).map((value) => ({
      candleTime: value.candle_time,
      candleCloseTime: value.completed_at,
      gateDecision: getGateDecision(value),
      candidateCount: Number(value.candidate_count),
      validCandidateCount: validByEvaluation.get(String(value.evaluation_id)) ?? 0,
      selectedCandidateId: value.selected_candidate_id,
      reasonCode: value.reason_code,
    })),
    riskRows = hasTable(DatabaseHandle, 'paper_bot_risk_decisions')
      ? (DatabaseHandle.prepare('SELECT * FROM paper_bot_risk_decisions').all() as row[])
      : [],
    executionRows = hasTable(DatabaseHandle, 'paper_bot_simulated_executions')
      ? (DatabaseHandle.prepare(
          'SELECT * FROM paper_bot_simulated_executions ORDER BY filled_at DESC',
        ).all() as row[])
      : [],
    orderEventRows = hasTable(DatabaseHandle, 'paper_bot_simulated_order_events')
      ? (DatabaseHandle.prepare(
          'SELECT * FROM paper_bot_simulated_order_events ORDER BY sequence',
        ).all() as row[])
      : [],
    accountRows = hasTable(DatabaseHandle, 'paper_bot_account_ledger')
      ? (DatabaseHandle.prepare(
          'SELECT * FROM paper_bot_account_ledger ORDER BY sequence DESC',
        ).all() as row[])
      : [],
    latestAccount = accountRows[0],
    auditRows = hasTable(DatabaseHandle, 'paper_bot_evaluation_ledger')
      ? (DatabaseHandle.prepare(
          'SELECT risk_intent_created,order_created FROM paper_bot_evaluation_ledger',
        ).all() as Array<{
          risk_intent_created: number;
          order_created: number;
        }>)
      : [],
    recentCompleted = latestEvaluations.filter(
      (value) => !value.gateDecision.startsWith('SKIPPED'),
    ),
    noTrade =
      recentCompleted.length > 0 && recentCompleted.every((value) => value.candidateCount === 0);
  const evaluationById = new Map(liveRows.map((value) => [String(value.evaluation_id), value])),
    noCandidateDiagnostics = diagnosticRows.filter(
      (value) => Number(evaluationById.get(String(value.evaluation_id))?.candidate_count) === 0,
    ),
    diagnosticsByEvaluation = new Map(
      noCandidateDiagnostics.map((value) => [String(value.evaluation_id), value]),
    ),
    parseStringArray = (value: unknown): string[] => {
      if (typeof value !== 'string') return [];
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    },
    parseEvidence = (value: unknown): Record<string, unknown> => {
      if (typeof value !== 'string') return {};
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    },
    noCandidateEvaluationRows = liveRows.filter(
      (value) => value.status === 'EVALUATED' && Number(value.candidate_count) === 0,
    ),
    resolvedNoCandidateDiagnostics = noCandidateEvaluationRows.map((evaluation) => {
      const diagnostic = diagnosticsByEvaluation.get(String(evaluation.evaluation_id));
      return diagnostic === undefined
        ? {
            candleTime: evaluation.candle_time,
            candleCloseTime: evaluation.completed_at,
            primaryReason: 'LEGACY_DIAGNOSTIC_UNAVAILABLE',
            reasons: ['LEGACY_DIAGNOSTIC_UNAVAILABLE'],
            evidence: {
              gateReason: evaluation.reason_code,
              explanation: 'Evaluation predates structured strategy diagnostics.',
            },
          }
        : {
            candleTime: diagnostic.candle_open_time,
            candleCloseTime: diagnostic.candle_close_time,
            primaryReason: String(diagnostic.primary_reason),
            reasons: parseStringArray(diagnostic.reasons_json),
            evidence: parseEvidence(diagnostic.evidence_json),
          };
    });
  return {
    databaseStatus: 'AVAILABLE',
    highWaterMark: highWater?.candle_time ?? null,
    marketAddress:
      liveRows.length === 0 || typeof liveRows[0]!.market_address !== 'string'
        ? null
        : liveRows[0]!.market_address,
    completedEvaluationCount: evaluations.length,
    evaluationsByGateDecision: countBy(liveRows.map(getGateDecision)),
    candidateCountDistribution: getDistribution(
      evaluations.map((value) => Number(value.candidate_count)),
    ),
    validCandidateCountDistribution: getDistribution(
      evaluations.map((value) => validByEvaluation.get(String(value.evaluation_id)) ?? 0),
    ),
    latestEvaluations,
    featureAndGateEvidence: {
      gateReasons: countBy(
        liveRows
          .map((value) => value.reason_code)
          .filter((reason): reason is string => typeof reason === 'string'),
      ),
      candidateReasons: countBy(candidateReasons),
    },
    paperRisk: {
      total: riskRows.length,
      approved: riskRows.filter((value) => value.approved === 1).length,
      rejected: riskRows.filter((value) => value.approved === 0).length,
      byStatus: countBy(riskRows.map((value) => String(value.status))),
      byReason: countBy(
        riskRows
          .map((value) => value.rejection_reason)
          .filter((reason): reason is string => typeof reason === 'string'),
      ),
    },
    simulatedOrders: hasTable(DatabaseHandle, 'paper_bot_simulated_order_events')
      ? (
          DatabaseHandle.prepare(
            'SELECT COUNT(DISTINCT simulated_order_id) AS count FROM paper_bot_simulated_order_events',
          ).get() as { count: number }
        ).count
      : 0,
    simulatedFills: executionRows.length,
    account:
      latestAccount === undefined
        ? null
        : {
            cashBalance: decimal(latestAccount.cash_balance_units),
            equity: decimal(latestAccount.equity_units),
            availableBalance: decimal(latestAccount.available_balance_units),
            positionSize: decimal(latestAccount.position_size_units),
            averageEntryPrice: decimal(latestAccount.average_entry_price_units),
            realizedPnL: decimal(latestAccount.realized_pnl_units),
            unrealizedPnL: decimal(latestAccount.unrealized_pnl_units),
            feesPaid: decimal(latestAccount.fees_paid_units),
            lastMarkedPrice: decimal(latestAccount.last_marked_price_units),
            lastUpdatedAt: latestAccount.last_updated_at,
          },
    latestFills: executionRows.slice(0, latestCount).map((value) => ({
      simulatedOrderId: value.simulated_order_id,
      evaluationId: value.evaluation_id,
      side: value.side,
      requestedSize: decimal(value.requested_size_units),
      filledSize: decimal(value.filled_size_units),
      fillPrice: decimal(value.fill_price_units),
      fee: decimal(value.fee_units),
      slippage: decimal(value.slippage_units),
      status: value.status,
      filledAt: value.filled_at,
    })),
    latestAccountEntries: accountRows.slice(0, latestCount).map((value) => ({
      sequence: value.sequence,
      sessionId: value.session_id,
      evaluationId: value.evaluation_id,
      eventType: value.event_type,
      equity: decimal(value.equity_units),
      positionSize: decimal(value.position_size_units),
      realizedPnL: decimal(value.realized_pnl_units),
      unrealizedPnL: decimal(value.unrealized_pnl_units),
      lastUpdatedAt: value.last_updated_at,
    })),
    liveRiskIntentCount: auditRows.reduce((sum, value) => sum + value.risk_intent_created, 0),
    liveOrderCount: auditRows.reduce((sum, value) => sum + value.order_created, 0),
    noTradeDiagnostic: {
      active: noTrade,
      recentEvaluationCount: recentCompleted.length,
      explanation: noTrade
        ? 'Recent evaluations all have candidateCount=0: the strategy produced no candidates, so paper risk and simulated execution were not invoked.'
        : recentCompleted.length === 0
          ? 'NO_COMPLETED_EVALUATIONS'
          : 'RECENT_CANDIDATES_OR_ACTIONS_PRESENT',
    },
    topNoCandidateReasons: countBy(
      resolvedNoCandidateDiagnostics.map((value) => value.primaryReason),
    ),
    latestNoCandidateEvaluations: resolvedNoCandidateDiagnostics.slice(0, latestCount),
    postCandidateRiskRejections: riskRows
      .filter((value) => value.approved === 0)
      .slice(0, latestCount)
      .map((value) => ({
        evaluationId: value.evaluation_id,
        reason: value.rejection_reason,
        diagnosticReason: 'RISK_OR_POLICY_REJECTION_AFTER_CANDIDATE',
      })),
    candidateLifecycle: buildCandidateLifecycle({
      liveRows,
      candidateRows,
      riskRows,
      executionRows,
      orderEventRows,
      accountRows,
      latestCount,
    }),
  };
}

export function buildPaperRuntimeReport(input: {
  paperDatabasePath: string;
  candleDatabasePath: string;
  mode: string;
  environment?: Record<string, string | undefined>;
}) {
  const latestCount = ConfigurationSchema.parse(input.environment ?? {}).PAPER_REPORT_LATEST_COUNT,
    PaperDatabase = openReadOnly(input.paperDatabasePath),
    CandleDatabase = openReadOnly(input.candleDatabasePath);
  try {
    PaperDatabase?.exec('BEGIN');
    CandleDatabase?.exec('BEGIN');
    const paper = readPaper(PaperDatabase, latestCount);
    return {
      reportVersion: 'PAPER_RUNTIME_REPORT_V3',
      generatedAt: new Date().toISOString(),
      configuredMode: input.mode,
      liveExecutionEnabled: false,
      candleData: readCandles(CandleDatabase, paper.marketAddress),
      ...paper,
    };
  } finally {
    if (PaperDatabase?.inTransaction) PaperDatabase.exec('COMMIT');
    if (CandleDatabase?.inTransaction) CandleDatabase.exec('COMMIT');
    PaperDatabase?.close();
    CandleDatabase?.close();
  }
}
