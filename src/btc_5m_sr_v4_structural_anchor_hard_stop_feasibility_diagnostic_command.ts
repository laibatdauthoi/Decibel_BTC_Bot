import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import type { price_candle } from './btc_bybit_decibel_overlap_audit.js';
import type { full_structure_risk_trade } from './btc_5m_sr_rejection_retest_full_structure_risk_2r_v4.js';
import { buildStructuralAnchorHardStopReport } from './btc_5m_sr_v4_structural_anchor_hard_stop_feasibility_diagnostic.js';
import type { post_entry_trade_diagnostic } from './btc_5m_sr_v4_post_entry_path_diagnostic.js';

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
    discovery: { trades: post_entry_trade_diagnostic[] };
    lateDevelopment: { trades: post_entry_trade_diagnostic[] };
  };
};
type baseline_segment = Parameters<
  typeof buildStructuralAnchorHardStopReport
>[0]['baselineSegments']['discovery'];
type baseline_report = {
  experimentId: string;
  segments: { discovery: baseline_segment; lateDevelopment: baseline_segment };
  trades: { discovery: full_structure_risk_trade[]; lateDevelopment: full_structure_risk_trade[] };
};
type report_type = ReturnType<typeof buildStructuralAnchorHardStopReport>;
type performance = { loaded1mRows: number; elapsedSeconds: number };
type stored_report = report_type & { performance: performance };

export const StructuralAnchorHardStopReportFileName =
  'btc_5m_sr_v4_structural_anchor_hard_stop_feasibility_diagnostic_v1.json';

const compact = (segment: report_type['segments']['discovery']) => ({
  winners: segment.summaries.ALL.winners,
  losers: segment.summaries.ALL.losers,
  normal: segment.summaries.ALL.normalInvalidation,
  recoveringWinners: segment.summaries.ALL.recoveringWinners,
  lossExpansion: segment.summaries.ALL.lossExpansion,
  proxy: segment.summaries.ALL.frictionlessProxy,
  breakEven: segment.summaries.ALL.breakEvenFalseStop,
});

export function printStructuralAnchorHardStopSummary(
  report: report_type,
  performance: performance,
  outputPath: string,
) {
  const discovery = compact(report.segments.discovery);
  const late = compact(report.segments.lateDevelopment);
  console.log('=== BTC 5M SR V4 STRUCTURAL ANCHOR HARD STOP DIAGNOSTIC V1 ===');
  console.log('START');
  console.log('SOURCE CHECK', report.sourceChecks);
  console.log('R / ANCHOR CHECK', {
    DISCOVERY: report.segments.discovery.foundation.anchorRMatch,
    LATE: report.segments.lateDevelopment.foundation.anchorRMatch,
  });
  console.log('DISCOVERY WINNERS', discovery.winners);
  console.log('LATE WINNERS', late.winners);
  console.log('DISCOVERY LOSERS', discovery.losers);
  console.log('LATE LOSERS', late.losers);
  console.log('NORMAL LOSS EXPANSION', {
    DISCOVERY: { timing: discovery.normal, expansion: discovery.lossExpansion },
    LATE: { timing: late.normal, expansion: late.lossExpansion },
  });
  console.log('RECOVERING WINNERS', {
    DISCOVERY: discovery.recoveringWinners,
    LATE: late.recoveringWinners,
  });
  console.log('GROSS-R PROXY', { DISCOVERY: discovery.proxy, LATE: late.proxy });
  console.log('AMBIGUITY BOUNDS', {
    DISCOVERY: {
      optimistic: discovery.proxy.optimisticNetGrossRProxy,
      pessimistic: discovery.proxy.pessimisticNetGrossRProxy,
    },
    LATE: {
      optimistic: late.proxy.optimisticNetGrossRProxy,
      pessimistic: late.proxy.pessimisticNetGrossRProxy,
    },
  });
  console.log('BREAK-EVEN FALSE STOP', { DISCOVERY: discovery.breakEven, LATE: late.breakEven });
  console.log('CONSISTENCY', report.consistency);
  console.log('CLASSIFICATION', report.classification);
  console.log('PERFORMANCE', { ...performance, jsonReportPath: outputPath });
}

export function printExistingStructuralAnchorHardStopReport(root: string) {
  const outputPath = path.join(
    root,
    'data',
    'btc_price_action',
    StructuralAnchorHardStopReportFileName,
  );
  if (!existsSync(outputPath)) throw new Error('REPORT_NOT_FOUND');
  const report = JSON.parse(readFileSync(outputPath, 'utf8')) as stored_report;
  printStructuralAnchorHardStopSummary(report, report.performance, outputPath);
}

export function runStructuralAnchorHardStopCommand(debugProgress = false) {
  const startedAt = Date.now();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const reportDirectory = path.join(root, 'data', 'btc_price_action');
  const source = JSON.parse(
    readFileSync(
      path.join(reportDirectory, 'btc_5m_sr_v4_post_entry_path_diagnostic_v1.json'),
      'utf8',
    ),
  ) as source_report;
  const baseline = JSON.parse(
    readFileSync(
      path.join(reportDirectory, 'btc_5m_sr_rejection_retest_full_structure_risk_2r_v4.json'),
      'utf8',
    ),
  ) as baseline_report;
  const allPaths = [...source.segments.discovery.trades, ...source.segments.lateDevelopment.trades];
  const minTimestamp = Math.min(...allPaths.map((trade) => trade.entryFill1mTimestamp));
  const maxTimestamp = Math.max(...allPaths.map((trade) => trade.baselineExitTimestamp));
  const database = new Database(path.join(root, 'data', 'bybit_btcusdt_perp_1m.sqlite'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const rows = database
      .prepare<[number, number], candle_row>(
        'SELECT start_timestamp_ms,open,high,low,close FROM candles WHERE start_timestamp_ms>=? AND start_timestamp_ms<=? ORDER BY start_timestamp_ms',
      )
      .all(minTimestamp, maxTimestamp);
    const candles: price_candle[] = rows.map((row) => ({
      timestamp: row.start_timestamp_ms,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    }));
    if (debugProgress) console.log('PROGRESS', { loaded1mRows: candles.length });
    const report = buildStructuralAnchorHardStopReport({
      sourceExperimentId: source.experimentId,
      baselineExperimentId: baseline.experimentId,
      sourceTrades: {
        discovery: source.segments.discovery.trades,
        lateDevelopment: source.segments.lateDevelopment.trades,
      },
      baselineTrades: baseline.trades,
      baselineSegments: baseline.segments,
      candles,
    });
    const outputPath = path.join(reportDirectory, StructuralAnchorHardStopReportFileName);
    const performance = {
      loaded1mRows: candles.length,
      elapsedSeconds: (Date.now() - startedAt) / 1000,
    };
    writeFileSync(outputPath, `${JSON.stringify({ ...report, performance }, null, 2)}\n`);
    printStructuralAnchorHardStopSummary(report, performance, outputPath);
  } finally {
    database.close();
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    if (process.argv.includes('--report-only')) printExistingStructuralAnchorHardStopReport(root);
    else runStructuralAnchorHardStopCommand(process.argv.includes('--debug-progress'));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Unknown structural-anchor diagnostic failure',
    );
    process.exitCode = 1;
  }
}
