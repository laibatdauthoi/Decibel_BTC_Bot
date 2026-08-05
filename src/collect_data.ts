import 'dotenv/config';

import { candlestick_repository } from './candlestick_repository.js';
import { candlestick_service } from './candlestick_service.js';
import { loadConfig } from './config.js';
import { registerDataRuntimeSignals, unified_data_runtime } from './data_runtime.js';
import { database_runtime_lock } from './data_runtime_lock.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { decibel_client } from './decibel_client.js';
import { createLogger } from './logger.js';
import { microstructure_collector } from './microstructure_collector.js';
import { resolveMicrostructureDatabasePath } from './microstructure_database_path.js';
import { microstructure_repository } from './microstructure_repository.js';

async function collectData(): Promise<void> {
  const config = loadConfig();
  const RuntimeLogger = createLogger(config.logFormat);
  const candleDatabasePath = resolveCandlestickDatabasePath();
  const microstructureDatabasePath = resolveMicrostructureDatabasePath();
  const RuntimeLock = await database_runtime_lock.acquire([
    candleDatabasePath,
    microstructureDatabasePath,
  ]);
  let CandleRepository: candlestick_repository | undefined;
  let MicrostructureRepository: microstructure_repository | undefined;
  try {
    CandleRepository = new candlestick_repository(candleDatabasePath);
    MicrostructureRepository = new microstructure_repository(microstructureDatabasePath);
  } catch (error) {
    CandleRepository?.close();
    MicrostructureRepository?.close();
    await RuntimeLock.release();
    throw error;
  }
  const CandleClient = new decibel_client(config);
  const MicrostructureClient = new decibel_client(config);
  const handleFatalPersistence = (error: Error): void => {
    RuntimeLogger.error(
      { event: 'unified_data_persistence_failed', error: error.message },
      'Required data persistence failed',
    );
    process.exitCode = 1;
    void Runtime.fail().catch(() => undefined);
  };
  const CandleService = new candlestick_service(CandleClient, CandleRepository, {
    logger: RuntimeLogger,
    onFatal: handleFatalPersistence,
  });
  const MicrostructureCollector = new microstructure_collector(
    MicrostructureClient,
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
      logger: RuntimeLogger,
      onFatal: handleFatalPersistence,
    },
  );
  const Runtime = new unified_data_runtime({
    candles: CandleService,
    microstructure: MicrostructureCollector,
    repositories: [CandleRepository, MicrostructureRepository],
    lock: RuntimeLock,
    logger: RuntimeLogger,
    shutdownTimeoutMs: config.dataRuntimeShutdownTimeoutMs,
  });
  registerDataRuntimeSignals(Runtime);
  await Runtime.start();
}

collectData().catch((error) => {
  const FailureLogger = createLogger('pretty');
  FailureLogger.error(
    {
      event: 'unified_data_runtime_start_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    },
    'Unable to start unified BTC/USD data runtime',
  );
  process.exitCode = 1;
});
