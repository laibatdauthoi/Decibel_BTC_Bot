import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { runBTC5MImpulseContinuationReplay } from './btc_5m_impulse_continuation_research.js';
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

export function runBTC5MImpulseContinuationResearchCommand(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const Candles = new Database(resolveCandlestickDatabasePath(), {
    readonly: true,
    fileMustExist: true,
  });
  const Research = new Database(resolveResearchDatabasePath(), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const resolved = resolveLocalBTCResearchMarket(Candles, Research, readFees(root));
    const candles = Candles.prepare<[string], candle_row>(
      "SELECT timestamp_ms,open,high,low,close,volume FROM candlesticks WHERE market_address=? AND interval='1m' ORDER BY timestamp_ms",
    )
      .all(resolved.market.marketAddress)
      .map<BTC_candlestick>((row) => ({ ...row, timestamp: new Date(row.timestamp_ms) }));
    if (candles.length === 0) throw new Error('BTC_ONE_MINUTE_CANDLES_UNAVAILABLE');
    const report = runBTC5MImpulseContinuationReplay({
      candles,
      market: resolved.market,
      leverageSource: resolved.leverageSource,
    });
    const output = path.join(
      root,
      'data',
      'btc_price_action',
      'btc_5m_impulse_continuation_1r_v1.json',
    );
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    const line = (label: string, value: unknown) => console.log(`${label}: ${String(value)}`);
    console.log('=== BTC 5M IMPULSE CONTINUATION 1R ===');
    for (const [label, value] of [
      ['Valid 5m candles', report.signalAccounting.valid5mCandleCount],
      ['Context eligible', report.signalAccounting.contextEligible5mCandleCount],
      ['LONG signals', report.signalAccounting.longSignalCount],
      ['SHORT signals', report.signalAccounting.shortSignalCount],
      ['Raw signals', report.signalAccounting.rawSignalCount],
      ['Signal rate', report.signalAccounting.signalRate],
      ['Ignored while active', report.signalAccounting.signalIgnoredWhileActiveCount],
      ['Entry attempts', report.signalAccounting.entryAttemptCount],
      ['Entry fills', report.signalAccounting.entryFilledCount],
      ['Entry failures', report.signalAccounting.entryFailedCount],
    ] as const)
      line(label, value);
    console.log('OVERALL');
    for (const [label, value] of [
      ['Completed', report.overall.completedCampaignCount],
      ['TP', report.overall.takeProfitCount],
      ['SL', report.overall.stopLossCount],
      ['Margin guard', report.overall.marginGuardCount],
      ['TP rate', report.overall.tpRate],
      ['GrossPF', report.overall.grossProfitFactor],
      ['NetPF', report.overall.netProfitFactor],
      ['Gross PnL', report.overall.grossPnLSum],
      ['Net PnL', report.overall.netPnLSum],
      ['Deposits', report.overall.depositCount],
      ['Total deposited', report.overall.totalDeposited],
      ['Ending equity', report.overall.endingEquity],
      ['Economic PnL', report.overall.economicPnL],
    ] as const)
      line(label, value);
    console.log('HOLDOUT');
    for (const [label, value] of [
      ['Completed', report.holdout.completedCampaignCount],
      ['LONG completed', report.holdout.byDirection.LONG_BTC.completedCampaignCount],
      ['SHORT completed', report.holdout.byDirection.SHORT_BTC.completedCampaignCount],
      ['TP rate', report.holdout.tpRate],
      ['GrossPF', report.holdout.grossProfitFactor],
      ['NetPF', report.holdout.netProfitFactor],
      ['Net PnL', report.holdout.netPnLSum],
    ] as const)
      line(label, value);
    console.log('LONG/SHORT');
    console.table(report.byDirection);
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
    runBTC5MImpulseContinuationResearchCommand();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown BTC impulse research failure');
    process.exitCode = 1;
  }
}
