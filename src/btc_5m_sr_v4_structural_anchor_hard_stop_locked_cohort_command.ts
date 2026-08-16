import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import type { price_candle } from './btc_bybit_decibel_overlap_audit.js';
import { buildAnchorHardStopLockedReport } from './btc_5m_sr_v4_structural_anchor_hard_stop_locked_cohort.js';
import type { anchor_trade_diagnostic } from './btc_5m_sr_v4_structural_anchor_hard_stop_feasibility_diagnostic.js';
import { PostEntryPathDiagnosticRules } from './btc_5m_sr_v4_post_entry_path_diagnostic.js';

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
type report_type = ReturnType<typeof buildAnchorHardStopLockedReport>;
type performance = { loaded1mRows: number; elapsedSeconds: number };
type stored_report = report_type & { performance: performance };

export const AnchorHardStopLockedReportFileName =
  'btc_5m_sr_v4_structural_anchor_hard_stop_locked_cohort_v1.json';

function readFees(root: string) {
  const value = JSON.parse(
    readFileSync(path.join(root, 'config', 'btc_eth_pair_v1.json'), 'utf8'),
  ) as Record<string, unknown>;
  if (typeof value.makerFeeRate !== 'number' || typeof value.takerFeeRate !== 'number')
    throw new Error('ANCHOR_HARD_STOP_FEE_CONFIG_INVALID');
  return { makerFeeRate: value.makerFeeRate, takerFeeRate: value.takerFeeRate };
}

const compact = (segment: report_type['segments']['discovery']) => ({
  scoreboard: segment.scoreboard,
  stopExecution: segment.stopExecution,
  savedBaselineLosers: segment.savedBaselineLosers,
  falseStoppedBaselineWinners: segment.falseStoppedBaselineWinners,
  netTradeOff: segment.netTradeOff,
  emergencyEffect: segment.emergencyEffect,
});

export function printAnchorHardStopLockedSummary(
  report: report_type,
  performance: performance,
  outputPath: string,
) {
  const discovery = compact(report.segments.discovery);
  const late = compact(report.segments.lateDevelopment);
  console.log('=== BTC 5M SR V4 STRUCTURAL ANCHOR HARD STOP LOCKED V1 ===');
  console.log('START');
  console.log('SOURCE CHECK', report.sourceCheck);
  console.log('P0 REPLICATION', {
    DISCOVERY: report.sourceCheck.discoveryFoundation,
    LATE: report.sourceCheck.lateFoundation,
  });
  console.log('COHORT INVARIANCE', report.cohortInvariance);
  console.log('DISCOVERY SCOREBOARD', discovery.scoreboard);
  console.log('LATE SCOREBOARD', late.scoreboard);
  console.log('STOP EXECUTION', {
    DISCOVERY: discovery.stopExecution,
    LATE: late.stopExecution,
  });
  console.log('SAVED LOSERS', {
    DISCOVERY: discovery.savedBaselineLosers,
    LATE: late.savedBaselineLosers,
  });
  console.log('FALSE-STOPPED WINNERS', {
    DISCOVERY: discovery.falseStoppedBaselineWinners,
    LATE: late.falseStoppedBaselineWinners,
  });
  console.log('NET TRADE-OFF', {
    DISCOVERY: discovery.netTradeOff,
    LATE: late.netTradeOff,
  });
  console.log('EMERGENCY EFFECT', {
    DISCOVERY: discovery.emergencyEffect,
    LATE: late.emergencyEffect,
  });
  console.log('DOMINANCE', report.dominance);
  console.log('EDGE CHECK', report.edgeCheck);
  console.log('CLASSIFICATION', report.classification);
  console.log('PERFORMANCE', { ...performance, jsonReportPath: outputPath });
}

export function printExistingAnchorHardStopLockedReport(root: string) {
  const outputPath = path.join(
    root,
    'data',
    'btc_price_action',
    AnchorHardStopLockedReportFileName,
  );
  if (!existsSync(outputPath)) throw new Error('REPORT_NOT_FOUND');
  const report = JSON.parse(readFileSync(outputPath, 'utf8')) as stored_report;
  printAnchorHardStopLockedSummary(report, report.performance, outputPath);
}

export function runAnchorHardStopLockedCommand(debugProgress = false) {
  const startedAt = Date.now();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const reportDirectory = path.join(root, 'data', 'btc_price_action');
  const sourcePath = path.join(
    reportDirectory,
    'btc_5m_sr_v4_structural_anchor_hard_stop_feasibility_diagnostic_v1.json',
  );
  const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as source_report;
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
    const report = buildAnchorHardStopLockedReport({
      sourceExperimentId: source.experimentId,
      discovery: source.segments.discovery.trades,
      lateDevelopment: source.segments.lateDevelopment.trades,
      candles,
      discoveryEndExclusiveTimestamp: PostEntryPathDiagnosticRules.chronologicalSplitTimestamp,
      lateEndExclusiveTimestamp: PostEntryPathDiagnosticRules.endExclusiveTimestamp,
      ...fees,
    });
    const outputPath = path.join(reportDirectory, AnchorHardStopLockedReportFileName);
    const performance = {
      loaded1mRows: candles.length,
      elapsedSeconds: (Date.now() - startedAt) / 1000,
    };
    writeFileSync(outputPath, `${JSON.stringify({ ...report, performance }, null, 2)}\n`);
    printAnchorHardStopLockedSummary(report, performance, outputPath);
  } finally {
    database.close();
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    if (process.argv.includes('--report-only')) printExistingAnchorHardStopLockedReport(root);
    else runAnchorHardStopLockedCommand(process.argv.includes('--debug-progress'));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown anchor hard-stop locked error');
    process.exitCode = 1;
  }
}
