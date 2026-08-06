import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './logger.js';
import { normalizePaperBotConfiguration } from './paper_bot.js';
import { resolvePaperBotDatabasePath } from './paper_bot_database_path.js';
import { buildPaperThresholdBacktestReport } from './paper_threshold_backtest_report.js';

export function runPaperThresholdBacktest(
  environment: Record<string, string | undefined> = process.env,
) {
  const report = buildPaperThresholdBacktestReport({
    paperDatabasePath: resolvePaperBotDatabasePath(),
    mode: normalizePaperBotConfiguration(environment).mode,
  });
  createLogger(environment.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
    { event: 'paper_threshold_backtest', ...report },
    'Paper threshold backtest completed',
  );
  return report;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  runPaperThresholdBacktest();
