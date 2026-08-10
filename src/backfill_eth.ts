import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBackfillInterval } from './backfill_interval.js';
import { syncBTCCandlesticks } from './candlestick_pipeline.js';
import { candlestick_repository } from './candlestick_repository.js';
import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { createResearchMarketMetadata } from './research_market_metadata.js';
import { resolveResearchDatabasePath } from './research_database_path.js';
import { research_dataset_repository } from './research_repository.js';

const DAY_MS = 86_400_000;

export async function runETHBackfill(arguments_: readonly string[] = process.argv.slice(2)) {
  const configuration = loadConfig(),
    interval = parseBackfillInterval(arguments_, '1m'),
    Client = new decibel_client(configuration),
    Candles = new candlestick_repository(resolveCandlestickDatabasePath()),
    Research = new research_dataset_repository(resolveResearchDatabasePath());
  try {
    const metadata = await Client.getETHMarketMetadata();
    Candles.saveMarketSymbol('ETH/USD', metadata.marketAddress);
    Research.saveMarketMetadata(createResearchMarketMetadata(metadata));
    const result = await syncBTCCandlesticks(
      {
        getBTCMarketMetadata: () => Client.getETHMarketMetadata(),
        getBTCCandlesticks: (selectedInterval, startTime, endTime, now) =>
          Client.getETHCandlesticks(selectedInterval, startTime, endTime, now),
      },
      Candles,
      interval,
      new Date(),
      configuration.candleHistoryDays * DAY_MS,
      500,
    );
    console.log(
      JSON.stringify({
        event: 'eth_backfill_complete',
        network: configuration.network,
        marketAddress: metadata.marketAddress,
        interval,
        ...result,
      }),
    );
  } finally {
    Research.close();
    Candles.close();
    Client.closeWebSocket();
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  runETHBackfill().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Unknown ETH backfill failure');
    process.exitCode = 1;
  });
