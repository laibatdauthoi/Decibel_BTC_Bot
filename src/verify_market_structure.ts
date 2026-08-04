import 'dotenv/config';

import { getBacktestFailureDiagnostics, readMainnetBTCBacktestDataset } from './backtest_data.js';
import { candlestick_repository } from './candlestick_repository.js';
import { loadConfig } from './config.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { createLogger } from './logger.js';
import { detectMarketStructure, loadMarketStructureConfig } from './market_structure.js';
import { buildBTCTimeframes } from './timeframe_aggregation.js';

let VerificationLogger = createLogger('pretty');

function runVerification(): void {
  const config = loadConfig();
  const structureConfig = loadMarketStructureConfig();
  VerificationLogger = createLogger(config.logFormat);
  const databasePath = resolveCandlestickDatabasePath();
  const Repository = new candlestick_repository(databasePath);
  try {
    const dataset = readMainnetBTCBacktestDataset(Repository, config.network);
    const hourlyCandles = buildBTCTimeframes(dataset.candles)['1h'];
    const structure = detectMarketStructure(hourlyCandles, structureConfig);
    VerificationLogger.info(
      {
        event: 'market_structure_verified',
        marketAddress: dataset.marketAddress,
        hourlyCandleCount: hourlyCandles.length,
        parameters: structureConfig,
        regime: structure.regime,
        latestSwingHighs: structure.swingHighs.slice(-2),
        latestSwingLows: structure.swingLows.slice(-2),
      },
      'BTC/USD 1h market structure verified',
    );
  } catch (error) {
    VerificationLogger.error(
      {
        event: 'market_structure_verification_failed',
        ...getBacktestFailureDiagnostics(Repository, databasePath),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Unable to verify BTC/USD market structure',
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
