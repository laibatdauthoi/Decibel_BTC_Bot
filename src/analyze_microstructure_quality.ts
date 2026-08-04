import 'dotenv/config';

import { createLogger } from './logger.js';
import { resolveMicrostructureDatabasePath } from './microstructure_database_path.js';
import {
  analyzeMicrostructureQuality,
  loadMicrostructureQualityConfig,
} from './microstructure_quality.js';
import { microstructure_quality_repository } from './microstructure_quality_repository.js';

function run(): void {
  const config = loadMicrostructureQualityConfig();
  const QualityLogger = createLogger(config.logFormat);
  const hours = config.hours;
  const endTimeMs = Date.now();
  const databasePath = resolveMicrostructureDatabasePath();
  let QualityRepository: microstructure_quality_repository | undefined;
  try {
    QualityRepository = new microstructure_quality_repository(databasePath);
    const report = analyzeMicrostructureQuality(
      QualityRepository.loadWindow(endTimeMs - hours * 3_600_000, endTimeMs),
    );
    QualityLogger.info(
      { event: 'microstructure_quality_report', databasePath, hours, report },
      `Microstructure quality: ${report.status}${report.sufficiency === 'NOT_ENOUGH_DATA' ? ' (NOT_ENOUGH_DATA)' : ''}`,
    );
    if (report.status === 'FAIL') process.exitCode = 1;
  } catch (error) {
    QualityLogger.error(
      {
        event: 'microstructure_quality_failed',
        databasePath,
        errorType: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
      'Unable to analyze microstructure quality',
    );
    process.exitCode = 1;
  } finally {
    QualityRepository?.close();
  }
}

run();
