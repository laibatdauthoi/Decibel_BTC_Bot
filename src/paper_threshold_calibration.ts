import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './logger.js';
import { normalizePaperBotConfiguration } from './paper_bot.js';
import { resolvePaperBotDatabasePath } from './paper_bot_database_path.js';
import { buildPaperThresholdCalibrationReport } from './paper_threshold_calibration_report.js';

export function runPaperThresholdCalibration(
  environment: Record<string, string | undefined> = process.env,
) {
  const mode = normalizePaperBotConfiguration(environment).mode;
  const report = buildPaperThresholdCalibrationReport({
    paperDatabasePath: resolvePaperBotDatabasePath(),
    mode,
  });
  createLogger(environment.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
    { event: 'paper_threshold_calibration', ...report },
    'Paper threshold calibration completed',
  );
  return report;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  runPaperThresholdCalibration();
