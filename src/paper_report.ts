import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { createLogger } from './logger.js';
import { normalizePaperBotConfiguration } from './paper_bot.js';
import { resolvePaperBotDatabasePath } from './paper_bot_database_path.js';
import { buildPaperRuntimeReport } from './paper_runtime_report.js';

export function runPaperReport(environment: Record<string, string | undefined> = process.env) {
  const config = normalizePaperBotConfiguration(environment),
    report = buildPaperRuntimeReport({
      paperDatabasePath: resolvePaperBotDatabasePath(),
      candleDatabasePath: resolveCandlestickDatabasePath(),
      mode: config.mode,
      environment,
    });
  createLogger(environment.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
    { event: 'paper_runtime_report', ...report },
    'Paper bot runtime report',
  );
  return report;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) runPaperReport();
