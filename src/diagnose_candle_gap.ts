import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';
import { createLogger } from './logger.js';

const Arguments = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export async function diagnoseCandleGap(arguments_: readonly string[] = process.argv.slice(2)) {
  const values = arguments_.reduce<Record<string, string>>((result, value) => {
      if (!value.startsWith('--')) return result;
      const [key, ...parts] = value.slice(2).split('=');
      if (key !== undefined) result[key] = parts.join('=');
      return result;
    }, {}),
    range = Arguments.parse(values),
    config = loadConfig(),
    Client = new decibel_client(config),
    start = new Date(range.start),
    end = new Date(range.end),
    history = await Client.getBTCCandlesticks('5m', start, end, new Date());
  return {
    network: config.network,
    marketAddress: history.marketAddress,
    interval: history.interval,
    requestedStart: start.toISOString(),
    requestedEnd: end.toISOString(),
    rowCount: history.candles.length,
    candles: history.candles.map((candle) => ({
      timestamp: candle.timestamp.toISOString(),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    })),
    databaseModified: false,
  };
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  void diagnoseCandleGap()
    .then((result) =>
      createLogger(process.env.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
        { event: 'candle_gap_diagnostic', ...result },
        'Read-only candle gap diagnostic completed',
      ),
    )
    .catch((error) => {
      createLogger('pretty').error(
        {
          event: 'candle_gap_diagnostic_failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Read-only candle gap diagnostic failed',
      );
      process.exitCode = 1;
    });
