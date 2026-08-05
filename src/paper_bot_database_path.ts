import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function resolvePaperBotDatabasePath(projectRoot = ROOT) {
  return path.join(projectRoot, 'data', 'btc_usd_paper_bot.sqlite');
}
