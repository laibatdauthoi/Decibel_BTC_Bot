import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { createLogger } from './logger.js';
import { resolveMicrostructureDatabasePath } from './microstructure_database_path.js';
import { resolvePaperBotDatabasePath } from './paper_bot_database_path.js';
import { buildStrategyDiagnosticReport } from './strategy_diagnostic_report.js';

export function runStrategyDiagnostics(
  environment: Record<string, string | undefined> = process.env,
) {
  const report = buildStrategyDiagnosticReport({
    candleDatabasePath: resolveCandlestickDatabasePath(),
    microstructureDatabasePath: resolveMicrostructureDatabasePath(),
    paperDatabasePath: resolvePaperBotDatabasePath(),
    environment,
  });
  createLogger(environment.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
    { event: 'strategy_diagnostics_complete', ...report },
    'BTC/USD strategy diagnostics completed',
  );
  return report;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  runStrategyDiagnostics();
