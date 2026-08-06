import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './logger.js';
import { normalizePaperBotConfiguration } from './paper_bot.js';
import { resolvePaperBotDatabasePath } from './paper_bot_database_path.js';
import { buildPaperTradeEligibilityReport } from './paper_trade_eligibility_report.js';

export function runPaperTradeEligibilityReport(
  environment: Record<string, string | undefined> = process.env,
) {
  const config = normalizePaperBotConfiguration(environment);
  const report = buildPaperTradeEligibilityReport({
    paperDatabasePath: resolvePaperBotDatabasePath(),
    mode: config.mode,
    environment,
  });
  createLogger(environment.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
    { event: 'paper_trade_eligibility_report', ...report },
    'Paper trade eligibility diagnosis completed',
  );
  return report;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  runPaperTradeEligibilityReport();
