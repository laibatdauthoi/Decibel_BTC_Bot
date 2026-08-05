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
  const context = readRawCandidateContext({
    candleDatabasePath: resolveCandlestickDatabasePath(),
    environment,
  });
  const microstructure =
    context.marketAddress === null
      ? null
      : buildMicrostructureDiagnosticReport({
          databasePath: resolveMicrostructureDatabasePath(),
          marketAddress: context.marketAddress,
          rawCandidateDecisionTimesMs: context.candidateDecisionTimesMs,
          environment,
        });
  const combinedReport = {
    ...report,
    microstructureCoverageSummary:
      microstructure === null
        ? null
        : {
            collectorCompatibleNow: microstructure.collectorCompatibleNow,
            freshness: microstructure.freshness,
            candidateCoverage: microstructure.candidateCoverage,
            currentCandidateReadiness: microstructure.currentCandidateReadiness,
          },
  };
  createLogger(environment.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
    { event: 'strategy_diagnostics_complete', ...combinedReport },
    'BTC/USD strategy diagnostics completed',
  );
  return combinedReport;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  runStrategyDiagnostics();
