import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { loadConfig, type application_config } from './config.js';
import { buildDecibelPreflightReport } from './decibel_preflight_report.js';
import { decibel_client } from './decibel_client.js';
import { fail_closed_decibel_execution_adapter } from './decibel_execution_adapter.js';
import { createLogger } from './logger.js';
import { resolveMicrostructureDatabasePath } from './microstructure_database_path.js';
import { resolvePaperBotDatabasePath } from './paper_bot_database_path.js';

export async function runDecibelPreflight(
  environment: Record<string, string | undefined> = process.env,
) {
  const probe = async (config: application_config) => {
    const Client = new decibel_client(config);
    try {
      return {
        market: await Client.getBTCMarketMetadata(),
        price: await Client.getBTCPrice(),
      };
    } finally {
      Client.closeWebSocket();
    }
  };
  const Adapter = new fail_closed_decibel_execution_adapter(() => probe(loadConfig(environment)));
  const report = await buildDecibelPreflightReport({
    environment,
    paperDatabasePath: resolvePaperBotDatabasePath(),
    candleDatabasePath: resolveCandlestickDatabasePath(),
    microstructureDatabasePath: resolveMicrostructureDatabasePath(),
    probe,
    executionAdapter: Adapter,
  });
  createLogger(environment.LOG_FORMAT === 'json' ? 'json' : 'pretty').info(
    { event: 'decibel_live_preflight', ...report },
    'Decibel live-readiness preflight completed',
  );
  return report;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  await runDecibelPreflight();
