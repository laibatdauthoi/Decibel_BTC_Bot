import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runBTC5MImpulsePullback5XCostReplay } from './btc_5m_impulse_pullback_5x_cost_research.js';
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
const optionalJSON = (value: string): unknown =>
  existsSync(value) ? JSON.parse(readFileSync(value, 'utf8')) : undefined;
function fees(root: string) {
  const value = JSON.parse(
    readFileSync(path.join(root, 'config', 'btc_eth_pair_v1.json'), 'utf8'),
  ) as unknown;
  if (typeof value !== 'object' || value === null)
    throw new Error('BTC_RESEARCH_FEE_CONFIG_INVALID');
  const item = value as Record<string, unknown>;
  if (typeof item.makerFeeRate !== 'number' || typeof item.takerFeeRate !== 'number')
    throw new Error('BTC_RESEARCH_FEE_CONFIG_INVALID');
  return { makerFeeRate: item.makerFeeRate, takerFeeRate: item.takerFeeRate };
}
export function runBTC5MImpulsePullback5XCostResearchCommand(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    data = path.join(root, 'data', 'btc_price_action');
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
    const report = runBTC5MImpulsePullback5XCostReplay({
      candles,
      market: resolved.market,
      leverageSource: resolved.leverageSource,
      oneRReport: optionalJSON(path.join(data, 'btc_5m_impulse_pullback_1r_v1.json')),
      twoRReport: optionalJSON(path.join(data, 'btc_5m_impulse_pullback_2r_v1.json')),
    });
    const output = path.join(data, 'btc_5m_impulse_pullback_5x_cost_v1.json');
    mkdirSync(data, { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    const line = (label: string, value: unknown) => console.log(`${label}: ${String(value)}`);
    console.log('=== BTC 5M IMPULSE PULLBACK 5X COST ===');
    console.log('SIGNALS');
    for (const [key, value] of Object.entries(report.signalAccounting)) line(key, value);
    console.log('COST GEOMETRY');
    console.log(JSON.stringify(report.costGeometryDiagnostics, null, 2));
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
      'meanTotalFees',
      'depositCount',
      'endingEquity',
      'economicPnL',
    ] as const)
      line(key, report.overall[key]);
    console.log('HOLDOUT');
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
    ] as const)
      line(key, report.holdout[key]);
    console.log('LONG/SHORT');
    console.table(report.byDirection);
    console.log('1R vs 5X COST');
    console.log(JSON.stringify(report.comparisonTo1R, null, 2));
    console.log('2R vs 5X COST');
    console.log(JSON.stringify(report.comparisonTo2R, null, 2));
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
    runBTC5MImpulsePullback5XCostResearchCommand();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown 5x cost research failure');
    process.exitCode = 1;
  }
}
