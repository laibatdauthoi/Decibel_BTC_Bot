import 'dotenv/config';

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import {
  loadMakerSimulatorConfig,
  MAKER_FILL_ASSUMPTIONS,
  MAKER_SIMULATOR_VERSION,
  simulateMakerOrder,
  summarizeMakerSimulations,
  type maker_simulation_result,
} from './maker_execution_simulator.js';
import { resolveMicrostructureDatabasePath } from './microstructure_database_path.js';
import {
  resolveMakerExecutionReportPath,
  resolveResearchDatabasePath,
} from './research_database_path.js';
import { research_dataset_repository, research_source_repository } from './research_repository.js';

function run(): void {
  const applicationConfig = loadConfig();
  const simulatorConfig = loadMakerSimulatorConfig();
  const SimulationLogger = createLogger(applicationConfig.logFormat);
  const DatasetRepository = new research_dataset_repository(resolveResearchDatabasePath());
  const SourceRepository = new research_source_repository(resolveMicrostructureDatabasePath());
  try {
    const samples = DatasetRepository.getSamples().filter((sample) =>
      Object.values(sample.features).every((feature) => feature.status === 'VALID'),
    );
    const sourceByMarket = new Map(
      [...new Set(samples.map((sample) => sample.marketAddress))].map((marketAddress) => [
        marketAddress,
        SourceRepository.loadSource(marketAddress, Date.now()),
      ]),
    );
    const metadataByMarket = new Map(
      [...sourceByMarket.keys()].map((marketAddress) => [
        marketAddress,
        SourceRepository.getMarketMetadata(marketAddress),
      ]),
    );
    const missingMetadata = [...metadataByMarket.entries()]
      .filter((entry) => entry[1] === null)
      .map(([marketAddress]) => marketAddress);
    if (missingMetadata.length > 0)
      throw new Error(
        `Normalized market metadata is not stored for ${missingMetadata.join(', ')}; run the read-only collector once before simulation`,
      );
    const results: maker_simulation_result[] = [];
    for (const sample of samples) {
      const source = sourceByMarket.get(sample.marketAddress);
      const metadata = metadataByMarket.get(sample.marketAddress);
      if (source === undefined || metadata === undefined || metadata === null) continue;
      for (const assumption of MAKER_FILL_ASSUMPTIONS)
        results.push(simulateMakerOrder(sample, source, metadata, simulatorConfig, assumption));
    }
    const persistence = DatasetRepository.saveMakerSimulations(results);
    const report = {
      simulatorVersion: MAKER_SIMULATOR_VERSION,
      generatedAt: new Date().toISOString(),
      parameters: simulatorConfig,
      validResearchCandidateCount: samples.length,
      ...summarizeMakerSimulations(results),
      persistence,
      orders: results,
      levelOneLimitation:
        'TOUCH_WITH_FLOW is a conservative Level-1 flow proxy and is not queue-position evidence.',
    };
    const reportPath = resolveMakerExecutionReportPath();
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    SimulationLogger.info(
      {
        event: 'maker_execution_simulation_complete',
        status: report.status,
        validResearchCandidateCount: samples.length,
        eligibleCandidateCount: report.eligibleCandidateCount,
        persistence,
        reportPath,
      },
      `BTC/USD maker execution research: ${report.status}`,
    );
  } finally {
    SourceRepository.close();
    DatasetRepository.close();
  }
}

try {
  run();
} catch (error) {
  const FailureLogger = createLogger('pretty');
  FailureLogger.error(
    {
      event: 'maker_execution_simulation_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      researchDatabasePath: resolveResearchDatabasePath(),
      microstructureDatabasePath: resolveMicrostructureDatabasePath(),
    },
    'Unable to simulate BTC/USD maker execution',
  );
  process.exitCode = 1;
}
