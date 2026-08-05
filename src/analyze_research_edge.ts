import 'dotenv/config';

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { MAKER_SIMULATOR_VERSION } from './maker_execution_simulator.js';
import { analyzeResearchEdge, loadResearchEdgeConfig } from './research_edge.js';
import {
  resolveResearchDatabasePath,
  resolveResearchEdgeReportPath,
  resolveResearchReportPath,
} from './research_database_path.js';
import { research_dataset_repository } from './research_repository.js';

const ResearchBuildReportSchema = z.object({
  researchCutoffTime: z.string().datetime().nullable(),
});

function readResearchCutoff(): string | null {
  try {
    return ResearchBuildReportSchema.parse(
      JSON.parse(readFileSync(resolveResearchReportPath(), 'utf8')) as unknown,
    ).researchCutoffTime;
  } catch {
    return null;
  }
}

function run(): void {
  const applicationConfig = loadConfig();
  const EdgeLogger = createLogger(applicationConfig.logFormat);
  const Repository = new research_dataset_repository(resolveResearchDatabasePath());
  try {
    const report = analyzeResearchEdge(
      Repository.getSamples(),
      Repository.getMakerSimulations(MAKER_SIMULATOR_VERSION),
      loadResearchEdgeConfig(),
      readResearchCutoff(),
    );
    const reportPath = resolveResearchEdgeReportPath();
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    EdgeLogger.info(
      {
        event: 'research_edge_analysis_complete',
        status: report.status,
        eligibleCandidateCount: report.eligibleCandidateCount,
        exclusions: report.exclusions,
        reportPath,
      },
      `BTC/USD research-edge analysis: ${report.status}`,
    );
  } finally {
    Repository.close();
  }
}

try {
  run();
} catch (error) {
  const FailureLogger = createLogger('pretty');
  FailureLogger.error(
    {
      event: 'research_edge_analysis_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    },
    'Unable to analyze BTC/USD research edge',
  );
  process.exitCode = 1;
}
