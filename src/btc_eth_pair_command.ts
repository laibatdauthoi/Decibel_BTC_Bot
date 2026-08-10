import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { runBTCEthPairBacktest, type pair_market } from './btc_eth_pair.js';
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
type group_row = { market_address: string; candle_count: number };
type metadata_row = {
  market_address: string;
  tick_size: number;
  lot_size: number;
  minimum_size: number;
  maximum_leverage: number;
};
type symbol_row = { market_address: string };
type pair_fee_config = {
  makerFeeRate: number;
  takerFeeRate: number;
};

function parsePairStartingEquity(arguments_: readonly string[]): number {
  return parsePositiveFlag(arguments_, 'starting-equity') ?? 30;
}

function parsePairFeeConfig(value: unknown): pair_fee_config {
  if (typeof value !== 'object' || value === null) {
    throw new Error('INVALID_PAIR_FEE_CONFIG');
  }

  const candidate = value as Record<string, unknown>;
  const makerFeeRate = candidate.makerFeeRate;
  const takerFeeRate = candidate.takerFeeRate;

  if (
    typeof makerFeeRate !== 'number' ||
    !Number.isFinite(makerFeeRate) ||
    makerFeeRate < 0 ||
    typeof takerFeeRate !== 'number' ||
    !Number.isFinite(takerFeeRate) ||
    takerFeeRate < 0
  ) {
    throw new Error('INVALID_PAIR_FEE_CONFIG');
  }

  return { makerFeeRate, takerFeeRate };
}

function parsePositiveFlag(arguments_: readonly string[], name: string): number | null {
  const prefix = `--${name}=`,
    value = arguments_.find((argument) => argument.startsWith(prefix));
  if (!value) return null;
  const parsed = Number(value.slice(prefix.length));
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`INVALID_${name.toUpperCase().replaceAll('-', '_')}`);
  return parsed;
}

function readCandles(database: Database.Database, marketAddress: string): BTC_candlestick[] {
  return database
    .prepare<[string], candle_row>(
      "SELECT timestamp_ms,open,high,low,close,volume FROM candlesticks WHERE market_address=? AND interval='1m' ORDER BY timestamp_ms",
    )
    .all(marketAddress)
    .map((row) => ({ ...row, timestamp: new Date(row.timestamp_ms) }));
}

export function runBTCEthPairCommand(arguments_: readonly string[] = process.argv.slice(2)): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    startingEquity = parsePairStartingEquity(arguments_),
    btcOverride = parsePositiveFlag(arguments_, 'btc-max-leverage'),
    ethOverride = parsePositiveFlag(arguments_, 'eth-max-leverage');
  if ((btcOverride === null) !== (ethOverride === null))
    throw new Error('PAIR_LEVERAGE_OVERRIDE_REQUIRES_BOTH_BTC_AND_ETH_VALUES');
  const Candles = new Database(resolveCandlestickDatabasePath(), {
      readonly: true,
      fileMustExist: true,
    }),
    Research = new Database(resolveResearchDatabasePath(), { readonly: true, fileMustExist: true });
  try {
    const groups = Candles.prepare<[], group_row>(
      "SELECT market_address,COUNT(1) candle_count FROM candlesticks WHERE interval='1m' GROUP BY market_address ORDER BY candle_count DESC",
    ).all();
    if (groups.length < 2)
      throw new Error(
        'GENUINE_DECIBEL_ETH_1M_DATA_UNAVAILABLE: run CANDLE_HISTORY_DAYS=100 npm run backfill:eth -- --interval=1m',
      );
    const symbolTable = Candles.prepare<[], { present: number }>(
      "SELECT COUNT(1) present FROM sqlite_master WHERE type='table' AND name='candlestick_market_symbols'",
    ).get();
    const ethIdentity = symbolTable?.present
      ? Candles.prepare<[string], symbol_row>(
          'SELECT market_address FROM candlestick_market_symbols WHERE symbol=?',
        ).get('ETH/USD')
      : undefined;
    if (!ethIdentity)
      throw new Error(
        'GENUINE_DECIBEL_ETH_1M_IDENTITY_UNAVAILABLE: run CANDLE_HISTORY_DAYS=100 npm run backfill:eth -- --interval=1m',
      );
    const ethGroup = groups.find((group) => group.market_address === ethIdentity.market_address),
      btcGroup = groups.find((group) => group.market_address !== ethIdentity.market_address);
    if (!btcGroup || !ethGroup)
      throw new Error('SYNCHRONIZED_BTC_ETH_ONE_MINUTE_MARKETS_UNAVAILABLE');
    const getMetadata = (address: string) =>
      Research.prepare<[string], metadata_row>(
        'SELECT market_address,tick_size,lot_size,minimum_size,maximum_leverage FROM research_market_metadata_snapshots WHERE market_address=? ORDER BY observed_at_ms DESC LIMIT 1',
      ).get(address);
    const btcMetadata = getMetadata(btcGroup.market_address),
      ethMetadata = getMetadata(ethGroup.market_address);
    if (!btcMetadata || !ethMetadata)
      throw new Error(
        'PAIR_MARKET_METADATA_UNAVAILABLE: run npm run backfill:eth -- --interval=1m',
      );
    const base = parsePairFeeConfig(
      JSON.parse(readFileSync(path.join(root, 'config', 'btc_eth_pair_v1.json'), 'utf8')),
    );
    const market = (metadata: metadata_row, override: number | null): pair_market => ({
      marketAddress: metadata.market_address,
      tickSize: metadata.tick_size,
      lotSize: metadata.lot_size,
      minimumSize: metadata.minimum_size,
      maximumLeverage: override ?? metadata.maximum_leverage,
      makerFeeRate: base.makerFeeRate,
      takerFeeRate: base.takerFeeRate,
    });
    const report = runBTCEthPairBacktest({
      btcCandles: readCandles(Candles, btcGroup.market_address),
      ethCandles: readCandles(Candles, ethGroup.market_address),
      btcMarket: market(btcMetadata, btcOverride),
      ethMarket: market(ethMetadata, ethOverride),
      startingEquity,
      leverageSource: btcOverride === null ? 'MARKET_METADATA' : 'CLI_OVERRIDE',
    });
    const output = path.join(root, 'data', 'btc_price_action', 'btc_eth_pair_current.json');
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      JSON.stringify(
        {
          strategyId: report.strategyId,
          data: report.data,
          campaignsCompleted: report.campaignsCompleted,
          netPairPnL: report.netPairPnL,
          output,
          liveExecutionEnabled: false,
        },
        null,
        2,
      ),
    );
  } finally {
    Research.close();
    Candles.close();
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    runBTCEthPairCommand();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown BTC/ETH pair research failure');
    process.exitCode = 1;
  }
}
