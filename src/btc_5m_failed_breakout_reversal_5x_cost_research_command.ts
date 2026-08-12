import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runBTC5MFailedBreakoutReversal5XCostReplay } from './btc_5m_failed_breakout_reversal_5x_cost_research.js';
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
const optional = (file: string): unknown =>
  existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
function fees(root: string) {
  const v: unknown = JSON.parse(
    readFileSync(path.join(root, 'config', 'btc_eth_pair_v1.json'), 'utf8'),
  );
  if (typeof v !== 'object' || v === null) throw new Error('BTC_RESEARCH_FEE_CONFIG_INVALID');
  const r = v as Record<string, unknown>;
  if (typeof r.makerFeeRate !== 'number' || typeof r.takerFeeRate !== 'number')
    throw new Error('BTC_RESEARCH_FEE_CONFIG_INVALID');
  return { makerFeeRate: r.makerFeeRate, takerFeeRate: r.takerFeeRate };
}
export function runBTC5MFailedBreakoutReversal5XCostResearchCommand(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    data = path.join(root, 'data', 'btc_price_action'),
    Candles = new Database(resolveCandlestickDatabasePath(), {
      readonly: true,
      fileMustExist: true,
    }),
    Research = new Database(resolveResearchDatabasePath(), { readonly: true, fileMustExist: true });
  try {
    const resolved = resolveLocalBTCResearchMarket(Candles, Research, fees(root)),
      candles = Candles.prepare<[string], candle_row>(
        "SELECT timestamp_ms,open,high,low,close,volume FROM candlesticks WHERE market_address=? AND interval='1m' ORDER BY timestamp_ms",
      )
        .all(resolved.market.marketAddress)
        .map<BTC_candlestick>((r) => ({ ...r, timestamp: new Date(r.timestamp_ms) }));
    if (!candles.length) throw new Error('BTC_ONE_MINUTE_CANDLES_UNAVAILABLE');
    const report = runBTC5MFailedBreakoutReversal5XCostReplay({
        candles,
        market: resolved.market,
        leverageSource: resolved.leverageSource,
        compressionReport: optional(
          path.join(data, 'btc_5m_compression_breakout_retest_5x_cost_v1.json'),
        ),
        impulseReport: optional(path.join(data, 'btc_5m_impulse_pullback_5x_cost_v1.json')),
      }),
      output = path.join(data, 'btc_5m_failed_breakout_reversal_5x_cost_v1.json'),
      line = (k: string, v: unknown) => console.log(`${k}: ${String(v)}`);
    mkdirSync(data, { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log('=== BTC 5M FAILED BREAKOUT REVERSAL 5X COST ===');
    console.log('SIGNALS');
    for (const k of [
      'valid5mCandleCount',
      'contextEligible5mCandleCount',
      'compressedWindowCount',
      'rawUpBreakoutCount',
      'rawDownBreakoutCount',
      'rawBreakoutCount',
      'breakoutAcceptedWhileFlatCount',
      'signalIgnoredWhileWaitingForFailureCount',
      'signalIgnoredWhilePendingCount',
      'signalIgnoredWhileActiveCount',
    ] as const)
      line(k, report.signalAccounting[k]);
    console.log('FAILURE');
    for (const k of [
      'failureConfirmedCount',
      'failureNotConfirmedWithin30mCount',
      'failureRate',
    ] as const)
      line(k, report.signalAccounting[k]);
    line('mean breakout -> failure minutes', report.failureTimingDiagnostics.mean);
    line('median breakout -> failure minutes', report.failureTimingDiagnostics.median);
    console.log('ENTRY');
    for (const k of [
      'entryAttemptCount',
      'entryFilledCount',
      'entryFailedCount',
      'entryFillRate',
    ] as const)
      line(k, report.signalAccounting[k]);
    line('mean failure -> entry minutes', report.entryTimingDiagnostics.mean);
    line('median failure -> entry minutes', report.entryTimingDiagnostics.median);
    console.log('COST GEOMETRY');
    console.log(JSON.stringify(report.costGeometryDiagnostics, null, 2));
    console.log('OVERALL');
    console.log(JSON.stringify(report.overall, null, 2));
    console.log('HOLDOUT');
    console.log(JSON.stringify(report.holdout, null, 2));
    console.log('LONG/SHORT');
    console.table(report.byDirection);
    console.log('BREAK EVEN');
    console.log(JSON.stringify(report.breakEvenDiagnostic, null, 2));
    console.log('BASELINE COMPARISONS');
    console.log(JSON.stringify(report.comparison, null, 2));
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
    runBTC5MFailedBreakoutReversal5XCostResearchCommand();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Unknown failed-breakout replay failure',
    );
    process.exitCode = 1;
  }
}
