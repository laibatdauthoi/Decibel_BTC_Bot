import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { createLogger } from './logger.js';
import {
  buildMicrostructureDiagnosticReport,
  readRawCandidateContext,
} from './microstructure_diagnostic_report.js';
import { resolveMicrostructureDatabasePath } from './microstructure_database_path.js';

export function runMicrostructureDiagnostics(
  environment: Record<string, string | undefined> = process.env,
) {
  const context = readRawCandidateContext({
    candleDatabasePath: resolveCandlestickDatabasePath(),
    environment,
  });
  if (context.marketAddress === null) throw new Error('No BTC/USD 5m candle market is available');
  const report = buildMicrostructureDiagnosticReport({
    databasePath: resolveMicrostructureDatabasePath(),
    marketAddress: context.marketAddress,
    rawCandidateDecisionTimesMs: context.candidateDecisionTimesMs,
    environment,
  });
  createLogger(environment.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
    { event: 'microstructure_diagnostics_complete', ...report },
    'BTC/USD microstructure diagnostics completed',
  );
  return report;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  runMicrostructureDiagnostics();
