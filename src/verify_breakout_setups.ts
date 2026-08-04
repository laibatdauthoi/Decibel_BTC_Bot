import 'dotenv/config';

import { getBacktestFailureDiagnostics, readMainnetBTCBacktestDataset } from './backtest_data.js';
import { detectBreakoutSetups, loadBreakoutSetupConfig } from './breakout_setup.js';
import { candlestick_repository } from './candlestick_repository.js';
import { loadConfig } from './config.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { createLogger } from './logger.js';
import { buildBTCTimeframes } from './timeframe_aggregation.js';

let VerificationLogger = createLogger('pretty');

function runVerification(): void {
  const config = loadConfig();
  const breakoutConfig = loadBreakoutSetupConfig();
  VerificationLogger = createLogger(config.logFormat);
  const databasePath = resolveCandlestickDatabasePath();
  const Repository = new candlestick_repository(databasePath);
  try {
    const dataset = readMainnetBTCBacktestDataset(Repository, config.network);
    const fifteenMinuteCandles = buildBTCTimeframes(dataset.candles)['15m'];
    const setups = detectBreakoutSetups(fifteenMinuteCandles, breakoutConfig);
    VerificationLogger.info(
      {
        event: 'breakout_setups_verified',
        marketAddress: dataset.marketAddress,
        fifteenMinuteCandleCount: fifteenMinuteCandles.length,
        parameters: breakoutConfig,
        totalSetupCount: setups.length,
        latestConfirmedSetups: setups.slice(-3),
      },
      'BTC/USD 15m breakout setups verified',
    );
  } catch (error) {
    VerificationLogger.error(
      {
        event: 'breakout_setups_verification_failed',
        ...getBacktestFailureDiagnostics(Repository, databasePath),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Unable to verify BTC/USD breakout setups',
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
