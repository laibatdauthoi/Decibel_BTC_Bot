import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { createLogger } from './logger.js';
import { resolveMicrostructureDatabasePath } from './microstructure_database_path.js';
import { normalizePaperBotConfiguration } from './paper_bot.js';
import { resolvePaperBotDatabasePath } from './paper_bot_database_path.js';
import { buildPaperSoakReport } from './paper_soak_report.js';

export function runPaperSoakReport(environment: Record<string, string | undefined> = process.env) {
  const config = normalizePaperBotConfiguration(environment);
  const report = buildPaperSoakReport({
    paperDatabasePath: resolvePaperBotDatabasePath(),
    candleDatabasePath: resolveCandlestickDatabasePath(),
    microstructureDatabasePath: resolveMicrostructureDatabasePath(),
    mode: config.mode,
    environment,
  });
  createLogger(environment.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
    { event: 'paper_soak_report', ...report },
    'Paper bot soak/readiness report',
  );
  return report;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) runPaperSoakReport();
