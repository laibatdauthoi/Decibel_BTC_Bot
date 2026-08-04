import 'dotenv/config';

import { getBacktestFailureDiagnostics, readMainnetBTCBacktestDataset } from './backtest_data.js';
import { candlestick_repository } from './candlestick_repository.js';
import { loadConfig } from './config.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { createLogger } from './logger.js';
import { loadMarketStructureConfig } from './market_structure.js';
import {
  loadOpportunityScannerConfig,
  scanBTCOpportunities,
  summarizeOpportunityCandidates,
} from './opportunity_scanner.js';
import { buildBTCTimeframes } from './timeframe_aggregation.js';

let AnalysisLogger = createLogger('pretty');

function runAnalysis(): void {
  const config = loadConfig();
  const scannerConfig = loadOpportunityScannerConfig();
  const structureConfig = loadMarketStructureConfig();
  AnalysisLogger = createLogger(config.logFormat);
  const databasePath = resolveCandlestickDatabasePath();
  const Repository = new candlestick_repository(databasePath);
  try {
    const dataset = readMainnetBTCBacktestDataset(Repository, config.network);
    const timeframes = buildBTCTimeframes(dataset.candles);
    const candidates = scanBTCOpportunities(timeframes, scannerConfig, structureConfig);
    AnalysisLogger.info(
      {
        event: 'opportunity_analysis_complete',
        marketAddress: dataset.marketAddress,
        parameters: scannerConfig,
        structureParameters: structureConfig,
        ...summarizeOpportunityCandidates(candidates),
        latestCandidates: candidates.slice(-5),
      },
      'BTC/USD 5m research opportunities analyzed',
    );
  } catch (error) {
    AnalysisLogger.error(
      {
        event: 'opportunity_analysis_failed',
        ...getBacktestFailureDiagnostics(Repository, databasePath),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Unable to analyze BTC/USD opportunities',
    );
    throw error;
  } finally {
    Repository.close();
  }
}

try {
  runAnalysis();
} catch {
  process.exitCode = 1;
}
