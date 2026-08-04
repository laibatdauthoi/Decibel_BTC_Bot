import 'dotenv/config';

import { getBacktestFailureDiagnostics, readMainnetBTCBacktestDataset } from './backtest_data.js';
import { candlestick_repository } from './candlestick_repository.js';
import { loadConfig } from './config.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import type { BTC_candlestick } from './decibel_client.js';
import { createLogger } from './logger.js';
import { buildBTCTimeframes, type BTC_timeframes } from './timeframe_aggregation.js';

let VerificationLogger = createLogger('pretty');

function summarizeCandles(candles: readonly BTC_candlestick[]): object {
  return {
    candleCount: candles.length,
    firstCandleTime: candles[0]?.timestamp ?? null,
    lastCandleTime: candles.at(-1)?.timestamp ?? null,
    latestCompletedCandle: candles.at(-1) ?? null,
  };
}

function runVerification(): void {
  const config = loadConfig();
  VerificationLogger = createLogger(config.logFormat);
  const databasePath = resolveCandlestickDatabasePath();
  const Repository = new candlestick_repository(databasePath);
  try {
    const dataset = readMainnetBTCBacktestDataset(Repository, config.network);
    const timeframes = buildBTCTimeframes(dataset.candles);
    const summaries = Object.fromEntries(
      (Object.keys(timeframes) as Array<keyof BTC_timeframes>).map((interval) => [
        interval,
        summarizeCandles(timeframes[interval]),
      ]),
    );
    VerificationLogger.info(
      { event: 'timeframes_verified', marketAddress: dataset.marketAddress, timeframes: summaries },
      'BTC/USD timeframes verified',
    );
  } catch (error) {
    VerificationLogger.error(
      {
        event: 'timeframes_verification_failed',
        ...getBacktestFailureDiagnostics(Repository, databasePath),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Unable to verify BTC/USD timeframes',
    );
    throw error;
  } finally {
    Repository.close();
  }
}

try {
  runVerification();
} catch {
  process.exitCode = 1;
}
