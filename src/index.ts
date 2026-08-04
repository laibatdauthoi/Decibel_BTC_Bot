import 'dotenv/config';

import { resolve } from 'node:path';

import { candlestick_repository } from './candlestick_repository.js';
import { candlestick_service } from './candlestick_service.js';
import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';
import { createLogger } from './logger.js';

let ApplicationLogger = createLogger('pretty');

async function startApplication(): Promise<void> {
  const config = loadConfig();
  ApplicationLogger = createLogger(config.logFormat);
  const DecibelClient = new decibel_client(config);
  const CandlestickRepository = new candlestick_repository(
    resolve('data', 'btc_usd_candlesticks.sqlite'),
  );
  const CandleService = new candlestick_service(DecibelClient, CandlestickRepository, {
    logger: ApplicationLogger,
  });
  let stopped = false;
  const stopApplication = (signal: 'SIGINT' | 'SIGTERM'): void => {
    if (stopped) return;
    stopped = true;
    CandleService.stop();
    CandlestickRepository.close();
    ApplicationLogger.info({ event: 'candle_service_stopped', signal }, 'Service stopped cleanly');
  };

  process.once('SIGINT', () => stopApplication('SIGINT'));
  process.once('SIGTERM', () => stopApplication('SIGTERM'));
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
      CandleService.stop();
      CandlestickRepository.close();
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
