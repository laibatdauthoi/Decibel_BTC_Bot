import 'dotenv/config';

import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';
import { database_runtime_lock } from './data_runtime_lock.js';
import { createLogger } from './logger.js';
import { microstructure_collector } from './microstructure_collector.js';
import { resolveMicrostructureDatabasePath } from './microstructure_database_path.js';
import { microstructure_repository } from './microstructure_repository.js';

async function collectMicrostructure(): Promise<void> {
  const config = loadConfig();
  const CollectorLogger = createLogger(config.logFormat);
  const DecibelClient = new decibel_client(config);
  const databasePath = resolveMicrostructureDatabasePath();
  const RuntimeLock = await database_runtime_lock.acquire([databasePath]);
  let MicrostructureRepository: microstructure_repository;
  try {
    MicrostructureRepository = new microstructure_repository(databasePath);
  } catch (error) {
    await RuntimeLock.release();
    throw error;
  }
  const MicrostructureCollector = new microstructure_collector(
    DecibelClient,
    MicrostructureRepository,
    {
      sampleIntervalMs: config.microstructureSampleIntervalMs,
      startupGraceMs: config.microstructureStartupGraceMs,
      depthStaleAfterMs: config.microstructureDepthStaleAfterMs,
      tradesStaleAfterMs: config.microstructureTradesStaleAfterMs,
      marketPriceStaleAfterMs: config.microstructureMarketPriceStaleAfterMs,
      maximumBatchSize: config.microstructureBatchSize,
      bootstrapTradeLimit: config.microstructureBootstrapTradeLimit,
      maximumBookAgeMs: config.microstructureMaximumBookAgeMs,
      maximumPriceAgeMs: config.microstructureMaximumPriceAgeMs,
      logger: CollectorLogger,
    },
  );
  let stopped = false;
  const stop = async (signal: 'SIGINT' | 'SIGTERM'): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await MicrostructureCollector.stop();
    const persisted = MicrostructureRepository.getCounts();
    MicrostructureRepository.close();
    await RuntimeLock.release();
    CollectorLogger.info(
      { event: 'microstructure_shutdown', signal, persisted },
      'Microstructure database closed cleanly',
    );
  };
  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));
  try {
    await MicrostructureCollector.start();
  } catch (error) {
    await stop('SIGTERM');
    CollectorLogger.error(
      {
        event: 'microstructure_start_failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      },
      'Unable to start microstructure collector',
    );
    process.exitCode = 1;
  }
}

void collectMicrostructure();
