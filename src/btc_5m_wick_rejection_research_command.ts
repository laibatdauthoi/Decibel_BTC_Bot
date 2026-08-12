import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
  runBTC5MWickRejectionReplay,
  type btc_research_market,
} from './btc_5m_wick_rejection_research.js';
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
type metadata_row = {
  market_address: string;
  tick_size: number;
  lot_size: number;
  minimum_size: number;
  maximum_leverage: number;
};
type symbol_row = { market_address: string };
type group_row = { market_address: string; candle_count: number };

export type resolved_btc_research_market = {
  market: btc_research_market;
  identitySource:
    | 'PERSISTED_BTC_SYMBOL'
    | 'CANDLE_GROUP_EXCLUDING_PERSISTED_ETH_IDENTITY'
    | 'UNIQUE_BTC_ONE_MINUTE_CANDLE_GROUP';
  leverageSource: 'RESEARCH_MARKET_METADATA_SNAPSHOT';
};

function readFeeConfig(root: string): { makerFeeRate: number; takerFeeRate: number } {
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

export function resolveLocalBTCResearchMarket(
  Candles: Database.Database,
  Research: Database.Database,
  fees: { makerFeeRate: number; takerFeeRate: number },
): resolved_btc_research_market {
  const symbolTable = Candles.prepare<[], { present: number }>(
      "SELECT COUNT(*) present FROM sqlite_master WHERE type='table' AND name='candlestick_market_symbols'",
    ).get(),
    symbol = (value: 'BTC/USD' | 'ETH/USD') =>
      symbolTable?.present
        ? Candles.prepare<[string], symbol_row>(
            'SELECT market_address FROM candlestick_market_symbols WHERE symbol=?',
          ).get(value)
        : undefined,
    btcSymbol = symbol('BTC/USD'),
    ethSymbol = symbol('ETH/USD'),
    groups = Candles.prepare<[], group_row>(
      "SELECT market_address,COUNT(*) candle_count FROM candlesticks WHERE interval='1m' GROUP BY market_address ORDER BY candle_count DESC,market_address",
    ).all();
  let marketAddress: string, identitySource: resolved_btc_research_market['identitySource'];
  if (btcSymbol) {
    marketAddress = btcSymbol.market_address;
    identitySource = 'PERSISTED_BTC_SYMBOL';
  } else {
    const candidates = ethSymbol
      ? groups.filter((group) => group.market_address !== ethSymbol.market_address)
      : groups;
    if (candidates.length !== 1) throw new Error('BTC_MARKET_IDENTITY_UNAVAILABLE');
    marketAddress = candidates[0]!.market_address;
    identitySource = ethSymbol
      ? 'CANDLE_GROUP_EXCLUDING_PERSISTED_ETH_IDENTITY'
      : 'UNIQUE_BTC_ONE_MINUTE_CANDLE_GROUP';
  }
  const metadata = Research.prepare<[string], metadata_row>(
    'SELECT market_address,tick_size,lot_size,minimum_size,maximum_leverage FROM research_market_metadata_snapshots WHERE market_address=? ORDER BY observed_at_ms DESC LIMIT 1',
  ).get(marketAddress);
  if (!metadata) throw new Error(`BTC_MARKET_METADATA_UNAVAILABLE:${marketAddress}`);
  if (!Number.isFinite(metadata.maximum_leverage) || metadata.maximum_leverage <= 0)
    throw new Error('BTC_MARKET_MAX_LEVERAGE_UNAVAILABLE');
  if (
    ![metadata.tick_size, metadata.lot_size, metadata.minimum_size].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new Error('BTC_MARKET_SIZING_METADATA_UNAVAILABLE');
  return {
    market: {
      marketAddress: metadata.market_address,
      tickSize: metadata.tick_size,
      lotSize: metadata.lot_size,
      minimumSize: metadata.minimum_size,
      maximumLeverage: metadata.maximum_leverage,
      ...fees,
    },
    identitySource,
    leverageSource: 'RESEARCH_MARKET_METADATA_SNAPSHOT',
  };
}

export function runBTC5MWickRejectionResearchCommand(): void {
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
    const fees = readFeeConfig(root);
    const resolved = resolveLocalBTCResearchMarket(Candles, Research, fees),
      market = resolved.market;
    const candles = Candles.prepare<[string], candle_row>(
      "SELECT timestamp_ms,open,high,low,close,volume FROM candlesticks WHERE market_address=? AND interval='1m' ORDER BY timestamp_ms",
    )
      .all(market.marketAddress)
      .map<BTC_candlestick>((row) => ({ ...row, timestamp: new Date(row.timestamp_ms) }));
    if (candles.length === 0) throw new Error('BTC_ONE_MINUTE_CANDLES_UNAVAILABLE');
    const report = runBTC5MWickRejectionReplay({
      candles,
      market,
      leverageSource: resolved.leverageSource,
    });
    const output = path.join(root, 'data', 'btc_price_action', 'btc_5m_wick_rejection_1r_v1.json');
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    const line = (label: string, value: unknown) => console.log(`${label}: ${String(value)}`);
    console.log('=== BTC 5M WICK REJECTION 1R ===');
    line('Valid 5m candles', report.signalAccounting.valid5mCandleCount);
    line('LONG signals', report.signalAccounting.longSignalCount);
    line('SHORT signals', report.signalAccounting.shortSignalCount);
    line('Ignored while active', report.signalAccounting.signalIgnoredWhileActiveCount);
    line('Entry attempts', report.signalAccounting.entryAttemptCount);
    line('Entry fills', report.signalAccounting.entryFilledCount);
    line('Entry failures', report.signalAccounting.entryFailedCount);
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
    runBTC5MWickRejectionResearchCommand();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown BTC wick research failure');
    process.exitCode = 1;
  }
}
