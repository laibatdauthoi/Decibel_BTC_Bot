import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import type { price_candle } from './btc_bybit_decibel_overlap_audit.js';
import { PostEntryPathDiagnosticRules } from './btc_5m_sr_v4_post_entry_path_diagnostic.js';
import {
  buildHardStopDepthReport,
  type hard_stop_policy,
} from './btc_5m_sr_v4_hard_stop_depth_1r_1p5r_2r_locked_cohort_v1.js';
import type { anchor_trade_diagnostic } from './btc_5m_sr_v4_structural_anchor_hard_stop_feasibility_diagnostic.js';

type candle_row = {
  start_timestamp_ms: number;
  open: string;
  high: string;
  low: string;
  close: string;
};
type source_report = {
  experimentId: string;
  segments: {
    discovery: { trades: anchor_trade_diagnostic[] };
    lateDevelopment: { trades: anchor_trade_diagnostic[] };
  };
};
type report_type = ReturnType<typeof buildHardStopDepthReport>;
type performance = { loaded1mRows: number; elapsedSeconds: number };
type stored_report = report_type & { performance: performance };

export const HardStopDepthReportFileName =
  'btc_5m_sr_v4_hard_stop_depth_1r_1p5r_2r_locked_cohort_v1.json';

function readFees(root: string) {
  const value = JSON.parse(
    readFileSync(path.join(root, 'config', 'btc_eth_pair_v1.json'), 'utf8'),
  ) as Record<string, unknown>;
  if (typeof value.makerFeeRate !== 'number' || typeof value.takerFeeRate !== 'number')
    throw new Error('HARD_STOP_DEPTH_FEE_CONFIG_INVALID');
  return { makerFeeRate: value.makerFeeRate, takerFeeRate: value.takerFeeRate };
}

const policyView = (segment: report_type['segments']['discovery'], policy: hard_stop_policy) => ({
  scoreboard: segment.policies[policy].scoreboard,
  falseStoppedWinners: segment.policies[policy].falseStoppedBaselineWinners,
  savedLosers: segment.policies[policy].savedBaselineLosers,
  stopExecution: segment.policies[policy].stopExecution,
});

export function printHardStopDepthSummary(
  report: report_type,
  performance: performance,
  outputPath: string,
) {
  const policies: hard_stop_policy[] = ['P1_HARD_STOP_1R', 'P2_HARD_STOP_1P5R', 'P3_HARD_STOP_2R'];
  const discovery = Object.fromEntries(
    policies.map((policy) => [policy, policyView(report.segments.discovery, policy)]),
  );
  const late = Object.fromEntries(
    policies.map((policy) => [policy, policyView(report.segments.lateDevelopment, policy)]),
  );
  console.log('=== BTC 5M SR V4 HARD STOP DEPTH LOCKED V1 ===');
  console.log('START');
  console.log('FOUNDATION CHECK', report.foundation);
  console.log('COHORT INVARIANCE', report.cohortInvariance);
  console.log('DISCOVERY SCOREBOARD', discovery);
  console.log('LATE SCOREBOARD', late);
  console.log('FALSE-STOPPED WINNERS', {
    DISCOVERY: Object.fromEntries(
      policies.map((policy) => [policy, discovery[policy]?.falseStoppedWinners]),
    ),
    LATE: Object.fromEntries(policies.map((policy) => [policy, late[policy]?.falseStoppedWinners])),
  });
  console.log('SAVED LOSERS', {
    DISCOVERY: Object.fromEntries(
      policies.map((policy) => [policy, discovery[policy]?.savedLosers]),
    ),
    LATE: Object.fromEntries(policies.map((policy) => [policy, late[policy]?.savedLosers])),
  });
  console.log('RECOVERED WINNERS', {
    DISCOVERY: {
      P2_HARD_STOP_1P5R:
        report.segments.discovery.recoveredWinners.P2_HARD_STOP_1P5R.recoveredWinners,
      P3_HARD_STOP_2R: report.segments.discovery.recoveredWinners.P3_HARD_STOP_2R.recoveredWinners,
    },
    LATE: {
      P2_HARD_STOP_1P5R:
        report.segments.lateDevelopment.recoveredWinners.P2_HARD_STOP_1P5R.recoveredWinners,
      P3_HARD_STOP_2R:
        report.segments.lateDevelopment.recoveredWinners.P3_HARD_STOP_2R.recoveredWinners,
    },
  });
  console.log('LOST LOSER SAVINGS', {
    DISCOVERY: {
      P2_HARD_STOP_1P5R:
        report.segments.discovery.recoveredWinners.P2_HARD_STOP_1P5R.lostLoserSavings,
      P3_HARD_STOP_2R: report.segments.discovery.recoveredWinners.P3_HARD_STOP_2R.lostLoserSavings,
    },
    LATE: {
      P2_HARD_STOP_1P5R:
        report.segments.lateDevelopment.recoveredWinners.P2_HARD_STOP_1P5R.lostLoserSavings,
      P3_HARD_STOP_2R:
        report.segments.lateDevelopment.recoveredWinners.P3_HARD_STOP_2R.lostLoserSavings,
    },
  });
  console.log('STOP EXECUTION', {
    DISCOVERY: Object.fromEntries(
      policies.map((policy) => [policy, discovery[policy]?.stopExecution]),
    ),
    LATE: Object.fromEntries(policies.map((policy) => [policy, late[policy]?.stopExecution])),
  });
  console.log('MARGINAL DEPTH ECONOMICS', {
    DISCOVERY: report.segments.discovery.marginalDepthEconomics,
    LATE: report.segments.lateDevelopment.marginalDepthEconomics,
  });
  console.log('V4 COMPARISON', {
    DISCOVERY: report.segments.discovery.v4Comparisons,
    LATE: report.segments.lateDevelopment.v4Comparisons,
  });
  console.log('DOMINANCE', {
    DISCOVERY: report.segments.discovery.dominance,
    LATE: report.segments.lateDevelopment.dominance,
  });
  console.log('EDGE CHECK', {
    DISCOVERY: report.segments.discovery.edgeChecks,
    LATE: report.segments.lateDevelopment.edgeChecks,
  });
  console.log('CLASSIFICATION', {
    classification: report.classification,
    selectedPolicy: report.selectedPolicy,
    netEdgePositiveBoth: report.netEdgePositiveBoth,
  });
  console.log('PERFORMANCE', { ...performance, jsonReportPath: outputPath });
}

export function printExistingHardStopDepthReport(root: string) {
  const outputPath = path.join(root, 'data', 'btc_price_action', HardStopDepthReportFileName);
  if (!existsSync(outputPath)) throw new Error('REPORT_NOT_FOUND');
  const report = JSON.parse(readFileSync(outputPath, 'utf8')) as stored_report;
  printHardStopDepthSummary(report, report.performance, outputPath);
}

export function runHardStopDepthCommand(debugProgress = false) {
  const startedAt = Date.now();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const reportDirectory = path.join(root, 'data', 'btc_price_action');
  const source = JSON.parse(
    readFileSync(
      path.join(
        reportDirectory,
        'btc_5m_sr_v4_structural_anchor_hard_stop_feasibility_diagnostic_v1.json',
      ),
      'utf8',
    ),
  ) as source_report;
  const fees = readFees(root);
  const database = new Database(path.join(root, 'data', 'bybit_btcusdt_perp_1m.sqlite'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const rows = database
      .prepare<[number, number], candle_row>(
        'SELECT start_timestamp_ms,open,high,low,close FROM candles WHERE start_timestamp_ms>=? AND start_timestamp_ms<? ORDER BY start_timestamp_ms',
      )
      .all(
        PostEntryPathDiagnosticRules.startTimestamp,
        PostEntryPathDiagnosticRules.endExclusiveTimestamp,
      );
    const candles: price_candle[] = rows.map((row) => ({
      timestamp: row.start_timestamp_ms,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    }));
    if (debugProgress) console.log('PROGRESS', { loaded1mRows: candles.length });
    const report = buildHardStopDepthReport({
      sourceExperimentId: source.experimentId,
      discovery: source.segments.discovery.trades,
      lateDevelopment: source.segments.lateDevelopment.trades,
      candles,
      discoveryStartTimestamp: PostEntryPathDiagnosticRules.startTimestamp,
      discoveryEndExclusiveTimestamp: PostEntryPathDiagnosticRules.chronologicalSplitTimestamp,
      lateEndExclusiveTimestamp: PostEntryPathDiagnosticRules.endExclusiveTimestamp,
      ...fees,
    });
    const outputPath = path.join(reportDirectory, HardStopDepthReportFileName);
    const performance = {
      loaded1mRows: candles.length,
      elapsedSeconds: (Date.now() - startedAt) / 1000,
    };
    writeFileSync(outputPath, `${JSON.stringify({ ...report, performance }, null, 2)}\n`);
    printHardStopDepthSummary(report, performance, outputPath);
  } finally {
    database.close();
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    if (process.argv.includes('--report-only')) printExistingHardStopDepthReport(root);
    else runHardStopDepthCommand(process.argv.includes('--debug-progress'));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown hard-stop depth error');
    process.exitCode = 1;
  }
}
