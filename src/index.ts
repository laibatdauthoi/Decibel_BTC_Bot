import 'dotenv/config';

import { candlestick_repository } from './candlestick_repository.js';
import { candlestick_service } from './candlestick_service.js';
import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { database_runtime_lock } from './data_runtime_lock.js';
import { createLogger } from './logger.js';

let ApplicationLogger = createLogger('pretty');

async function startApplication(): Promise<void> {
  const config = loadConfig();
  ApplicationLogger = createLogger(config.logFormat);
  const DecibelClient = new decibel_client(config);
  const databasePath = resolveCandlestickDatabasePath();
  const RuntimeLock = await database_runtime_lock.acquire([databasePath]);
  let CandlestickRepository: candlestick_repository;
  try {
    CandlestickRepository = new candlestick_repository(databasePath);
  } catch (error) {
    await RuntimeLock.release();
    throw error;
  }
  const CandleService = new candlestick_service(DecibelClient, CandlestickRepository, {
    logger: ApplicationLogger,
  });
  let stopped = false;
  const stopApplication = async (signal: 'SIGINT' | 'SIGTERM'): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await CandleService.stop();
    CandlestickRepository.close();
    await RuntimeLock.release();
    ApplicationLogger.info({ event: 'candle_service_stopped', signal }, 'Service stopped cleanly');
  };

  process.once('SIGINT', () => void stopApplication('SIGINT'));
  process.once('SIGTERM', () => void stopApplication('SIGTERM'));
  try {
    const catchUp = await CandleService.start();
    ApplicationLogger.info(
      {
        event: 'candle_service_started',
        network: config.network,
        market: 'BTC/USD',
        interval: '5m',
        inserted: catchUp.inserted,
        updated: catchUp.updated,
        unchanged: catchUp.unchanged,
        total: catchUp.total,
        missingIntervalCount: catchUp.missingIntervalCount,
        strategyEvaluationAllowed: CandleService.isStrategyEvaluationAllowed(),
        liveTradingEnabled: config.liveTradingEnabled,
      },
      'BTC/USD candle service started',
    );
  } catch (error: unknown) {
    if (!stopped) {
      stopped = true;
      await CandleService.stop();
      CandlestickRepository.close();
      await RuntimeLock.release();
    }
    throw error;
  }
}

startApplication().catch(() => {
  ApplicationLogger.error(
    { event: 'candle_service_start_failed' },
    'Unable to start BTC/USD candle service',
  );
  process.exitCode = 1;
});
