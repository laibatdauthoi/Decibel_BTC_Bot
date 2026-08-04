import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function resolveResearchDatabasePath(projectRoot = PROJECT_ROOT): string {
  return resolve(projectRoot, 'data', 'btc_usd_research.sqlite');
}
export function resolveResearchReportPath(projectRoot = PROJECT_ROOT): string {
  return resolve(projectRoot, 'data', 'microstructure_research_report.json');
}
export function resolveMakerExecutionReportPath(projectRoot = PROJECT_ROOT): string {
  return resolve(projectRoot, 'data', 'maker_execution_report.json');
}
