import 'dotenv/config';

import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';
import { createLogger } from './logger.js';
import { microstructure_collector } from './microstructure_collector.js';
import { resolveMicrostructureDatabasePath } from './microstructure_database_path.js';
import { microstructure_repository } from './microstructure_repository.js';

async function collectMicrostructure(): Promise<void> {
  const config = loadConfig();
  const CollectorLogger = createLogger(config.logFormat);
  const DecibelClient = new decibel_client(config);
  const MicrostructureRepository = new microstructure_repository(
    resolveMicrostructureDatabasePath(),
  );
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
      logger: CollectorLogger,
    },
  );
  let stopped = false;
  const stop = (signal: 'SIGINT' | 'SIGTERM'): void => {
    if (stopped) return;
    stopped = true;
    MicrostructureCollector.stop();
    const persisted = MicrostructureRepository.getCounts();
    MicrostructureRepository.close();
    CollectorLogger.info(
      { event: 'microstructure_shutdown', signal, persisted },
      'Microstructure database closed cleanly',
    );
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
  try {
    await MicrostructureCollector.start();
  } catch (error) {
    stop('SIGTERM');
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
