import 'dotenv/config';

import { resolve } from 'node:path';

import { syncBTCCandlesticks } from './candlestick_pipeline.js';
import { candlestick_repository } from './candlestick_repository.js';
import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';
import { createLogger } from './logger.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
let BackfillLogger = createLogger('pretty');

async function runBackfill(): Promise<void> {
  const config = loadConfig();
  BackfillLogger = createLogger(config.logFormat);
  const DecibelClient = new decibel_client(config);
  const CandlestickRepository = new candlestick_repository(
    resolve('data', 'btc_usd_candlesticks.sqlite'),
  );
  try {
    const result = await syncBTCCandlesticks(
      DecibelClient,
      CandlestickRepository,
      '5m',
      new Date(),
      config.candleHistoryDays * MILLISECONDS_PER_DAY,
      500,
      {
        onPage: ({ page, startTime, endTime, inserted, updated, unchanged }) => {
          BackfillLogger.info(
            {
              event: 'backfill_page',
              page,
              startTime,
              endTime,
              inserted,
              updated,
              unchanged,
            },
            'Backfill page persisted',
          );
        },
        onRetry: (attempt, delayMs) => {
          BackfillLogger.warn(
            { event: 'backfill_retry', attempt, delayMs },
            'Backfill request retry scheduled',
          );
        },
      },
    );

    BackfillLogger.info(
      {
        event: 'backfill_complete',
        network: config.network,
        interval: '5m',
        historyDays: config.candleHistoryDays,
        ...result,
      },
      'Historical backfill completed',
    );
  } finally {
    CandlestickRepository.close();
  }
}

runBackfill().catch(() => {
  BackfillLogger.error({ event: 'backfill_failed' }, 'Unable to backfill BTC/USD candlesticks');
  process.exitCode = 1;
});
