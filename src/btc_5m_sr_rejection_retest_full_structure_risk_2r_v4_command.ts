import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { resolveLocalBTCResearchMarket } from './btc_5m_wick_rejection_research_command.js';
import { buildExact5mBars } from './btc_5m_confirmed_swing_sr_zone_limit_state_machine.js';
import type { rejection_progress } from './btc_5m_confirmed_swing_sr_rejection_retest_limit_state_machine.js';
import {
  buildFullStructureRiskReport,
  FullStructureRiskRules,
} from './btc_5m_sr_rejection_retest_full_structure_risk_2r_v4.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { resolveResearchDatabasePath } from './research_database_path.js';

type candle_row = {
  start_timestamp_ms: number;
  open: string;
  high: string;
  low: string;
  close: string;
};
type report_type = ReturnType<typeof buildFullStructureRiskReport>;
type performance_summary = { loaded1mRows: number; valid5mBars: number; elapsedSeconds: number };
type stored_report = report_type & { performance: performance_summary };
const reportFileName = 'btc_5m_sr_rejection_retest_full_structure_risk_2r_v4.json';

function readFees(root: string) {
  const value = JSON.parse(
    readFileSync(path.join(root, 'config', 'btc_eth_pair_v1.json'), 'utf8'),
  ) as Record<string, unknown>;
  if (typeof value.makerFeeRate !== 'number' || typeof value.takerFeeRate !== 'number')
    throw new Error('FULL_STRUCTURE_RISK_FEE_CONFIG_INVALID');
  return { makerFeeRate: value.makerFeeRate, takerFeeRate: value.takerFeeRate };
}

export function shouldPrintFullStructureRiskProgress(debug: boolean, processed1m: number) {
  return debug && processed1m % 500_000 === 0;
}

export function printFullStructureRiskSummary(
  report: report_type,
  performance: performance_summary,
  outputPath: string,
  includeHeader = true,
) {
  if (includeHeader) {
    console.log('=== BTC 5M SR REJECTION RETEST FULL STRUCTURE RISK 2R V4 ===');
    console.log('START');
  }
  const discovery = report.segments.discovery;
  const late = report.segments.lateDevelopment;
  console.log('ENTRY FUNNEL', { DISCOVERY: discovery.entryFunnel, LATE: late.entryFunnel });
  console.log('FREQUENCY', { DISCOVERY: discovery.frequency, LATE: late.frequency });
  const r = (segment: typeof discovery) => ({
    meanGrossR: segment.rEconomics.meanGrossR,
    medianGrossR: segment.rEconomics.medianGrossR,
    meanNetR: segment.rEconomics.meanNetR,
    medianNetR: segment.rEconomics.medianNetR,
    grossRProfitFactor: segment.rEconomics.grossRProfitFactor,
    netRProfitFactor: segment.rEconomics.netRProfitFactor,
  });
  console.log('R ECONOMICS', { DISCOVERY: r(discovery), LATE: r(late) });
  console.log('USD ECONOMICS', {
    DISCOVERY: discovery.usdEconomics,
    LATE: late.usdEconomics,
  });
  console.log('OUTCOMES', { DISCOVERY: discovery.outcomes, LATE: late.outcomes });
  console.log('MONEY MANAGEMENT', {
    DISCOVERY: {
      topUpCount: discovery.usdEconomics.topUpCount,
      totalExternalCapitalAddedUsd: discovery.usdEconomics.totalExternalCapitalAddedUsd,
      riskCappedByLeverageCount: discovery.outcomes.riskCappedByLeverageCount,
      emergencyDistanceFromEntryInR: discovery.emergencyDiagnostics.emergencyDistanceFromEntryInR,
    },
    LATE: {
      topUpCount: late.usdEconomics.topUpCount,
      totalExternalCapitalAddedUsd: late.usdEconomics.totalExternalCapitalAddedUsd,
      riskCappedByLeverageCount: late.outcomes.riskCappedByLeverageCount,
      emergencyDistanceFromEntryInR: late.emergencyDiagnostics.emergencyDistanceFromEntryInR,
    },
  });
  console.log('LONG / SHORT', { DISCOVERY: discovery.longShort, LATE: late.longShort });
  console.log('QUALIFICATION', {
    discoveryPass: report.qualification.discoveryPass,
    latePass: report.qualification.latePass,
    classification: report.classification,
    classificationReasons: report.classificationReasons,
  });
  console.log('PERFORMANCE', { ...performance, jsonReportPath: outputPath });
}

export function printExistingFullStructureRiskReport(root: string) {
  const outputPath = path.join(root, 'data', 'btc_price_action', reportFileName);
  if (!existsSync(outputPath)) throw new Error('REPORT_NOT_FOUND');
  const stored = JSON.parse(readFileSync(outputPath, 'utf8')) as stored_report;
  printFullStructureRiskSummary(stored, stored.performance, outputPath);
}

export function runFullStructureRiskCommand(debugProgress = false) {
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
  console.log('=== BTC 5M SR REJECTION RETEST FULL STRUCTURE RISK 2R V4 ===');
  console.log('START');
  const database = new Database(path.join(root, 'data', 'bybit_btcusdt_perp_1m.sqlite'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const candles = database
      .prepare<[], candle_row>(
        'SELECT start_timestamp_ms,open,high,low,close FROM candles WHERE start_timestamp_ms>=? AND start_timestamp_ms<? ORDER BY start_timestamp_ms',
      )
      .all(FullStructureRiskRules.startTimestamp, FullStructureRiskRules.endExclusiveTimestamp)
      .map((row) => ({
        timestamp: row.start_timestamp_ms,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
      }));
    const built = buildExact5mBars(
      candles,
      debugProgress
        ? (processed1m, total1m, timestamp) => {
            if (shouldPrintFullStructureRiskProgress(true, processed1m))
              console.log('PROGRESS', { phase: '5M_BUILD', processed1m, total1m, timestamp });
          }
        : undefined,
    );
    const report = buildFullStructureRiskReport({
      candles,
      prebuilt5m: built,
      ...fees,
      maximumLeverage,
      leverageSource,
      feeSource: 'config/btc_eth_pair_v1.json',
      ...(debugProgress
        ? {
            onProgress: (
              segment: 'DISCOVERY' | 'LATE_DEVELOPMENT',
              progress: rejection_progress,
            ) => {
              if (shouldPrintFullStructureRiskProgress(true, progress.processed1m))
                console.log('PROGRESS', { segment, ...progress });
            },
          }
        : {}),
    });
    const outputPath = path.join(root, 'data', 'btc_price_action', reportFileName);
    const performance = {
      loaded1mRows: candles.length,
      valid5mBars: built.bars.length,
      elapsedSeconds: (Date.now() - startedAt) / 1000,
    };
    writeFileSync(outputPath, `${JSON.stringify({ ...report, performance }, null, 2)}\n`);
    printFullStructureRiskSummary(report, performance, outputPath, false);
  } finally {
    database.close();
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    if (process.argv.includes('--report-only')) printExistingFullStructureRiskReport(root);
    else runFullStructureRiskCommand(process.argv.includes('--debug-progress'));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown full-structure-risk failure');
    process.exitCode = 1;
  }
}
