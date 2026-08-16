import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { resolveLocalBTCResearchMarket } from './btc_5m_wick_rejection_research_command.js';
import { buildExact5mBars } from './btc_5m_confirmed_swing_sr_zone_limit_state_machine.js';
import {
  buildHardStop2RProspectiveReport,
  HardStop2RProspectiveRules,
} from './btc_5m_sr_v4_hard_stop_2r_prospective_replay_v1.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { resolveResearchDatabasePath } from './research_database_path.js';

type candle_row = {
  start_timestamp_ms: number;
  open: string;
  high: string;
  low: string;
  close: string;
};
type report_type = ReturnType<typeof buildHardStop2RProspectiveReport>;
type performance = { loaded1mRows: number; valid5mBars: number; elapsedSeconds: number };
type stored_report = report_type & { performance: performance };

export const HardStop2RProspectiveReportFileName =
  'btc_5m_sr_v4_hard_stop_2r_prospective_replay_v1.json';

function readFees(root: string) {
  const value = JSON.parse(
    readFileSync(path.join(root, 'config', 'btc_eth_pair_v1.json'), 'utf8'),
  ) as Record<string, unknown>;
  if (typeof value.makerFeeRate !== 'number' || typeof value.takerFeeRate !== 'number')
    throw new Error('HARD_STOP_2R_PROSPECTIVE_FEE_CONFIG_INVALID');
  return { makerFeeRate: value.makerFeeRate, takerFeeRate: value.takerFeeRate };
}

const policyView = (policy: report_type['segments']['discovery']['policies']['P0_V4_CONTROL']) =>
  policy.scoreboard.ALL;

export function printHardStop2RProspectiveSummary(
  report: report_type,
  performance: performance,
  outputPath: string,
) {
  const discovery = report.segments.discovery;
  const late = report.segments.lateDevelopment;
  console.log('=== BTC 5M SR V4 HARD STOP 2R PROSPECTIVE V1 ===');
  console.log('START');
  console.log('FOUNDATION CHECK', report.foundation);
  console.log('DISCOVERY FUNNEL', discovery.funnels);
  console.log('LATE FUNNEL', late.funnels);
  console.log('DISCOVERY SCOREBOARD', {
    P0_V4_CONTROL: policyView(discovery.policies.P0_V4_CONTROL),
    P1_HARD_STOP_2R: policyView(discovery.policies.P1_HARD_STOP_2R),
  });
  console.log('LATE SCOREBOARD', {
    P0_V4_CONTROL: policyView(late.policies.P0_V4_CONTROL),
    P1_HARD_STOP_2R: policyView(late.policies.P1_HARD_STOP_2R),
  });
  console.log('HARD STOP EXECUTION', {
    DISCOVERY: discovery.hardStopExecution,
    LATE_DEVELOPMENT: late.hardStopExecution,
  });
  console.log('OPPORTUNITY SEQUENCE', {
    DISCOVERY: discovery.opportunitySequenceDifference,
    LATE_DEVELOPMENT: late.opportunitySequenceDifference,
  });
  console.log('TURNOVER ECONOMICS', {
    DISCOVERY: {
      P0: policyView(discovery.policies.P0_V4_CONTROL),
      P1: policyView(discovery.policies.P1_HARD_STOP_2R),
    },
    LATE_DEVELOPMENT: {
      P0: policyView(late.policies.P0_V4_CONTROL),
      P1: policyView(late.policies.P1_HARD_STOP_2R),
    },
  });
  console.log('V4 COMPARISON', {
    DISCOVERY: discovery.comparison,
    LATE_DEVELOPMENT: late.comparison,
  });
  console.log('FREQUENCY GATE', report.frequencyGate);
  console.log('DOMINANCE', report.dominance);
  console.log('EDGE CHECK', report.edgeCheck);
  console.log('CLASSIFICATION', report.classification);
  console.log('PERFORMANCE', { ...performance, jsonReportPath: outputPath });
}

export function printExistingHardStop2RProspectiveReport(root: string) {
  const outputPath = path.join(
    root,
    'data',
    'btc_price_action',
    HardStop2RProspectiveReportFileName,
  );
  if (!existsSync(outputPath)) throw new Error('REPORT_NOT_FOUND');
  const stored = JSON.parse(readFileSync(outputPath, 'utf8')) as stored_report;
  printHardStop2RProspectiveSummary(stored, stored.performance, outputPath);
}

export function runHardStop2RProspectiveCommand(debugProgress = false) {
  const startedAt = Date.now();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const fees = readFees(root);
  const candlesMetadata = new Database(resolveCandlestickDatabasePath(), {
    readonly: true,
    fileMustExist: true,
  });
  const researchMetadata = new Database(resolveResearchDatabasePath(), {
    readonly: true,
    fileMustExist: true,
  });
  let maximumLeverage: number;
  let leverageSource: string;
  try {
    const resolved = resolveLocalBTCResearchMarket(candlesMetadata, researchMetadata, fees);
    maximumLeverage = resolved.market.maximumLeverage;
    leverageSource = resolved.leverageSource;
  } finally {
    candlesMetadata.close();
    researchMetadata.close();
  }
  const database = new Database(path.join(root, 'data', 'bybit_btcusdt_perp_1m.sqlite'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const candles = database
      .prepare<[number, number], candle_row>(
        'SELECT start_timestamp_ms,open,high,low,close FROM candles WHERE start_timestamp_ms>=? AND start_timestamp_ms<? ORDER BY start_timestamp_ms',
      )
      .all(
        HardStop2RProspectiveRules.startTimestamp,
        HardStop2RProspectiveRules.endExclusiveTimestamp,
      )
      .map((row) => ({
        timestamp: row.start_timestamp_ms,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
      }));
    const built = buildExact5mBars(candles);
    const report = buildHardStop2RProspectiveReport({
      candles,
      prebuilt5m: built,
      ...fees,
      maximumLeverage,
      leverageSource,
      feeSource: 'config/btc_eth_pair_v1.json',
      ...(debugProgress
        ? {
            onProgress: (policy: string, segment: string, progress: { processed1m: number }) =>
              console.log('PROGRESS', { policy, segment, processed1m: progress.processed1m }),
          }
        : {}),
    });
    const outputPath = path.join(
      root,
      'data',
      'btc_price_action',
      HardStop2RProspectiveReportFileName,
    );
    const performance = {
      loaded1mRows: candles.length,
      valid5mBars: built.bars.length,
      elapsedSeconds: (Date.now() - startedAt) / 1000,
    };
    writeFileSync(outputPath, `${JSON.stringify({ ...report, performance }, null, 2)}\n`);
    printHardStop2RProspectiveSummary(report, performance, outputPath);
  } finally {
    database.close();
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    if (process.argv.includes('--report-only')) printExistingHardStop2RProspectiveReport(root);
    else runHardStop2RProspectiveCommand(process.argv.includes('--debug-progress'));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown prospective replay failure');
    process.exitCode = 1;
  }
}
