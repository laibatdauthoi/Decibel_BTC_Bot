import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { runBTC5MCompressionBreakoutRetest5XCostReplay } from './btc_5m_compression_breakout_retest_5x_cost_research.js';
import { resolveLocalBTCResearchMarket } from './btc_5m_wick_rejection_research_command.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import type { BTC_candlestick } from './decibel_client.js';
import { resolveResearchDatabasePath } from './research_database_path.js';

type candle_row = {
  timestamp_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
function readFees(root: string): { makerFeeRate: number; takerFeeRate: number } {
  const value: unknown = JSON.parse(
    readFileSync(path.join(root, 'config', 'btc_eth_pair_v1.json'), 'utf8'),
  );
  if (typeof value !== 'object' || value === null)
    throw new Error('BTC_RESEARCH_FEE_CONFIG_INVALID');
  const record = value as Record<string, unknown>;
  if (typeof record.makerFeeRate !== 'number' || typeof record.takerFeeRate !== 'number')
    throw new Error('BTC_RESEARCH_FEE_CONFIG_INVALID');
  return { makerFeeRate: record.makerFeeRate, takerFeeRate: record.takerFeeRate };
}
const optionalJSON = (file: string): unknown =>
  existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;

export function runBTC5MCompressionBreakoutRetest5XCostResearchCommand(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    data = path.join(root, 'data', 'btc_price_action'),
    Candles = new Database(resolveCandlestickDatabasePath(), {
      readonly: true,
      fileMustExist: true,
    }),
    Research = new Database(resolveResearchDatabasePath(), {
      readonly: true,
      fileMustExist: true,
    });
  try {
    const resolved = resolveLocalBTCResearchMarket(Candles, Research, readFees(root)),
      candles = Candles.prepare<[string], candle_row>(
        "SELECT timestamp_ms,open,high,low,close,volume FROM candlesticks WHERE market_address=? AND interval='1m' ORDER BY timestamp_ms",
      )
        .all(resolved.market.marketAddress)
        .map<BTC_candlestick>((row) => ({ ...row, timestamp: new Date(row.timestamp_ms) }));
    if (candles.length === 0) throw new Error('BTC_ONE_MINUTE_CANDLES_UNAVAILABLE');
    const report = runBTC5MCompressionBreakoutRetest5XCostReplay({
        candles,
        market: resolved.market,
        leverageSource: resolved.leverageSource,
        impulse5xCostReport: optionalJSON(
          path.join(data, 'btc_5m_impulse_pullback_5x_cost_v1.json'),
        ),
      }),
      output = path.join(data, 'btc_5m_compression_breakout_retest_5x_cost_v1.json'),
      line = (label: string, value: unknown) => console.log(`${label}: ${String(value)}`);
    mkdirSync(data, { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log('=== BTC 5M COMPRESSION BREAKOUT RETEST 5X COST ===');
    console.log('SIGNALS');
    for (const [label, value] of [
      ['Valid 5m', report.signalAccounting.valid5mCandleCount],
      ['Context eligible', report.signalAccounting.contextEligible5mCandleCount],
      ['Compressed windows', report.signalAccounting.compressedWindowCount],
      ['LONG breakouts', report.signalAccounting.longBreakoutCount],
      ['SHORT breakouts', report.signalAccounting.shortBreakoutCount],
      ['Raw breakouts', report.signalAccounting.rawBreakoutCount],
      ['Accepted while flat', report.signalAccounting.signalAcceptedWhileFlatCount],
      ['Ignored pending', report.signalAccounting.signalIgnoredWhilePendingCount],
      ['Ignored active', report.signalAccounting.signalIgnoredWhileActiveCount],
    ] as const)
      line(label, value);
    console.log('ENTRY');
    for (const [label, value] of [
      ['Attempts', report.signalAccounting.entryAttemptCount],
      ['Fills', report.signalAccounting.entryFilledCount],
      ['Failures', report.signalAccounting.entryFailedCount],
      ['Fill rate', report.signalAccounting.entryFillRate],
      ['Mean minutes to entry', report.entryTimingDiagnostics.meanMinutesToEntry],
      ['Median minutes to entry', report.entryTimingDiagnostics.medianMinutesToEntry],
    ] as const)
      line(label, value);
    const cost = report.costGeometryDiagnostics.overall;
    console.log('COST GEOMETRY');
    for (const [label, value] of [
      ['Median expected cost $', cost.medianExpectedCampaignCostDollars],
      ['Median expected cost bps', cost.medianExpectedCampaignCostBps],
      ['Median 5x distance bps', cost.medianFiveCostDistanceBps],
      ['Median actual TP cost multiple', cost.medianActualTPCostMultiple],
      ['Median actual SL cost multiple', cost.medianActualSLCostMultiple],
    ] as const)
      line(label, value);
    console.log('OVERALL');
    for (const key of [
      'completedCampaignCount',
      'takeProfitCount',
      'stopLossCount',
      'marginGuardCount',
      'tpRate',
      'grossProfitFactor',
      'netProfitFactor',
      'grossPnLSum',
      'netPnLSum',
      'meanHoldingMinutes',
      'depositCount',
      'totalDeposited',
      'endingEquity',
      'economicPnL',
    ] as const)
      line(key, report.overall[key]);
    console.log('HOLDOUT');
    for (const key of [
      'rawBreakoutCount',
      'entryFilledCount',
      'completedCampaignCount',
      'takeProfitCount',
      'stopLossCount',
      'marginGuardCount',
      'tpRate',
      'grossProfitFactor',
      'netProfitFactor',
      'grossPnLSum',
      'netPnLSum',
      'meanHoldingMinutes',
    ] as const)
      line(key, report.holdout[key]);
    line('Break-even win rate', report.breakEvenDiagnostic.holdout.empiricalBreakEvenWinRate);
    console.log('LONG/SHORT');
    console.table(report.byDirection);
    console.log('IMPULSE 5X COST vs COMPRESSION BREAKOUT RETEST 5X COST');
    console.log(JSON.stringify(report.comparisonToImpulse5xCost, null, 2));
    console.log('7-DAY DIAGNOSTICS');
    console.table(report.bySevenDayBlock);
    line('Classification', report.classification);
    line('Report', output);
  } finally {
    Research.close();
    Candles.close();
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    runBTC5MCompressionBreakoutRetest5XCostResearchCommand();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown compression replay failure');
    process.exitCode = 1;
  }
}
