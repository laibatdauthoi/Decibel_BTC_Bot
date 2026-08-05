import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function resolveRiskDatabasePath(projectRoot = PROJECT_ROOT): string {
  return path.join(projectRoot, 'data', 'btc_usd_risk.sqlite');
}
