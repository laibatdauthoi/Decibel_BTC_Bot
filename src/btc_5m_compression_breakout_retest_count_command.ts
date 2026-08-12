import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { buildBTC5MCompressionBreakoutRetestCount } from './btc_5m_compression_breakout_retest_count.js';
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
type market_group_row = { market_address: string; candle_count: number };
type market_symbol_row = { market_address: string };
type tick_size_row = { tick_size: number };

function resolveBTCMarketAddress(Candles: Database.Database): string {
  const hasSymbols = Candles.prepare<[], { present: number }>(
      "SELECT COUNT(*) present FROM sqlite_master WHERE type='table' AND name='candlestick_market_symbols'",
    ).get()?.present,
    findSymbol = (symbol: string) =>
      hasSymbols
        ? Candles.prepare<[string], market_symbol_row>(
            'SELECT market_address FROM candlestick_market_symbols WHERE symbol=?',
          ).get(symbol)
        : undefined,
    BTC = findSymbol('BTC/USD');
  if (BTC) return BTC.market_address;
  const ETH = findSymbol('ETH/USD'),
    groups = Candles.prepare<[], market_group_row>(
      "SELECT market_address,COUNT(*) candle_count FROM candlesticks WHERE interval='1m' GROUP BY market_address ORDER BY candle_count DESC,market_address",
    ).all(),
    candidates = ETH
      ? groups.filter((group) => group.market_address !== ETH.market_address)
      : groups;
  if (candidates.length !== 1) throw new Error('BTC_MARKET_IDENTITY_UNAVAILABLE');
  return candidates[0]!.market_address;
}

export function runBTC5MCompressionBreakoutRetestCountCommand(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    Candles = new Database(resolveCandlestickDatabasePath(), {
      readonly: true,
      fileMustExist: true,
    }),
    Research = new Database(resolveResearchDatabasePath(), {
      readonly: true,
      fileMustExist: true,
    });
  try {
    const marketAddress = resolveBTCMarketAddress(Candles),
      metadata = Research.prepare<[string], tick_size_row>(
        'SELECT tick_size FROM research_market_metadata_snapshots WHERE market_address=? ORDER BY observed_at_ms DESC LIMIT 1',
      ).get(marketAddress);
    if (!metadata || !Number.isFinite(metadata.tick_size) || metadata.tick_size <= 0)
      throw new Error(`BTC_TICK_SIZE_UNAVAILABLE:${marketAddress}`);
    const candles = Candles.prepare<[string], candle_row>(
      "SELECT timestamp_ms,open,high,low,close,volume FROM candlesticks WHERE market_address=? AND interval='1m' ORDER BY timestamp_ms",
    )
      .all(marketAddress)
      .map<BTC_candlestick>((row) => ({ ...row, timestamp: new Date(row.timestamp_ms) }));
    if (candles.length === 0) throw new Error('BTC_ONE_MINUTE_CANDLES_UNAVAILABLE');
    const report = buildBTC5MCompressionBreakoutRetestCount({
        candles,
        tickSize: metadata.tick_size,
      }),
      output = path.join(
        root,
        'data',
        'btc_price_action',
        'btc_5m_compression_breakout_retest_count_v1.json',
      ),
      overall = report.overall,
      line = (label: string, value: unknown) => console.log(`${label}: ${String(value)}`);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log('=== BTC 5M COMPRESSION BREAKOUT RETEST COUNT ===');
    for (const [label, value] of [
      ['Valid 5m candles', overall.valid5mCandleCount],
      ['Context eligible', overall.contextEligible5mCandleCount],
      ['Compressed windows', overall.compressedWindowCount],
      ['Compression rate', overall.compressionRate],
      ['LONG breakouts', overall.longBreakoutCount],
      ['SHORT breakouts', overall.shortBreakoutCount],
      ['Total breakouts', overall.totalBreakoutCount],
      ['Breakouts / compressed window', overall.breakoutPerCompressedWindowRate],
      ['Retests within 30m', overall.totalRetestWithin30mCount],
      ['Retest rate', overall.retestRate],
      ['Mean breakouts/day', report.dailyFrequency.meanBreakoutsPerDay],
      ['Median breakouts/day', report.dailyFrequency.medianBreakoutsPerDay],
      ['Mean retested breakouts/day', report.dailyFrequency.meanRetestedBreakoutsPerDay],
      ['Median retested breakouts/day', report.dailyFrequency.medianRetestedBreakoutsPerDay],
      ['Zero-breakout days', report.dailyFrequency.zeroBreakoutDayCount],
    ] as const)
      line(label, value);
    console.log('HOLDOUT');
    for (const [label, value] of [
      ['Breakouts', report.holdout.totalBreakoutCount],
      ['Retests', report.holdout.retestWithin30mCount],
      ['Retest rate', report.holdout.retestRate],
      ['Mean breakouts/day', report.holdout.meanBreakoutsPerDay],
      ['Median breakouts/day', report.holdout.medianBreakoutsPerDay],
    ] as const)
      line(label, value);
    console.log('RETEST TIMING');
    console.log(JSON.stringify(overall.retestTiming, null, 2));
    console.log('BREAKOUT DISTANCE');
    console.log(JSON.stringify(overall.breakoutDistance, null, 2));
    console.log('COMPRESSION RATIO');
    console.log(JSON.stringify(overall.compressionStrength, null, 2));
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
    runBTC5MCompressionBreakoutRetestCountCommand();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Unknown BTC compression diagnostic failure',
    );
    process.exitCode = 1;
  }
}
