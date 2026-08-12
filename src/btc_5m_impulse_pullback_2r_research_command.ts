import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runBTC5MImpulsePullback2RReplay } from './btc_5m_impulse_pullback_2r_research.js';
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
function fees(root: string): { makerFeeRate: number; takerFeeRate: number } {
  const value: unknown = JSON.parse(
    readFileSync(path.join(root, 'config', 'btc_eth_pair_v1.json'), 'utf8'),
  );
  if (typeof value !== 'object' || value === null)
    throw new Error('BTC_RESEARCH_FEE_CONFIG_INVALID');
  const item = value as Record<string, unknown>;
  if (typeof item.makerFeeRate !== 'number' || typeof item.takerFeeRate !== 'number')
    throw new Error('BTC_RESEARCH_FEE_CONFIG_INVALID');
  return { makerFeeRate: item.makerFeeRate, takerFeeRate: item.takerFeeRate };
}
export function runBTC5MImpulsePullback2RResearchCommand(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    priorPath = path.join(root, 'data', 'btc_price_action', 'btc_5m_impulse_pullback_1r_v1.json');
  const Candles = new Database(resolveCandlestickDatabasePath(), {
      readonly: true,
      fileMustExist: true,
    }),
    Research = new Database(resolveResearchDatabasePath(), { readonly: true, fileMustExist: true });
  try {
    const resolved = resolveLocalBTCResearchMarket(Candles, Research, fees(root));
    const candles = Candles.prepare<[string], candle_row>(
      "SELECT timestamp_ms,open,high,low,close,volume FROM candlesticks WHERE market_address=? AND interval='1m' ORDER BY timestamp_ms",
    )
      .all(resolved.market.marketAddress)
      .map<BTC_candlestick>((row) => ({ ...row, timestamp: new Date(row.timestamp_ms) }));
    const oneRReport: unknown = existsSync(priorPath)
      ? JSON.parse(readFileSync(priorPath, 'utf8'))
      : undefined;
    const report = runBTC5MImpulsePullback2RReplay({
      candles,
      market: resolved.market,
      leverageSource: resolved.leverageSource,
      oneRReport,
    });
    const output = path.join(
      root,
      'data',
      'btc_price_action',
      'btc_5m_impulse_pullback_2r_v1.json',
    );
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    const line = (label: string, value: unknown) => console.log(`${label}: ${String(value)}`);
    console.log('=== BTC 5M IMPULSE PULLBACK 2R ===');
    console.log('SIGNALS');
    for (const [label, value] of Object.entries(report.signalAccounting)) line(label, value);
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
      'meanTotalFees',
      'depositCount',
      'totalDeposited',
      'endingEquity',
      'economicPnL',
    ] as const)
      line(key, report.overall[key]);
    console.log('HOLDOUT');
    for (const key of [
      'completedCampaignCount',
      'takeProfitCount',
      'stopLossCount',
      'tpRate',
      'grossProfitFactor',
      'netProfitFactor',
      'grossPnLSum',
      'netPnLSum',
    ] as const)
      line(key, report.holdout[key]);
    console.log('LONG/SHORT');
    console.table(report.byDirection);
    console.log('1R -> 2R CONTINUATION');
    console.log(JSON.stringify(report.winnerContinuationDiagnostic, null, 2));
    console.log('PULLBACK 1R vs PULLBACK 2R');
    console.log(JSON.stringify(report.comparisonTo1R, null, 2));
    console.log('FEE BURDEN');
    console.log(JSON.stringify(report.feeBurdenDiagnostic, null, 2));
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
    runBTC5MImpulsePullback2RResearchCommand();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Unknown BTC impulse pullback 2R failure',
    );
    process.exitCode = 1;
  }
}
