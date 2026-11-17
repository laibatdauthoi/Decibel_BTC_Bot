/**
 * Operator metrics reset: lifetime volume, all-time PnL, session count and today's volume
 * restart from zero and count again from the next session. Default is a dry run.
 *   npm run decibel:metrics-reset-v1            (dry run: prints current totals)
 *   npm run decibel:metrics-reset-v1 -- --apply (stores the reset time)
 * Refused while a session is live. Deletes no session, order or fill; safe while the web
 * process runs (SQLite WAL, single short transaction).
 */
import { resolveDecibelToolPathV1 } from './decibel_wallet_workspace_v1.js';
import dotenv from 'dotenv';

dotenv.config();

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';

import {
  readDecibelOverviewLifetimeTotalsV1,
  resetDecibelLifetimeMetricsV1,
} from './decibel_lifetime_totals_v1.js';

const sessionPath = resolve(
  process.env.DECIBEL_PRODUCTION_SESSION_STORE_PATH ??
    resolveDecibelToolPathV1(process.env, 'sessionStore'),
);
if (!existsSync(sessionPath)) throw new Error('METRICS_RESET_SESSION_STORE_MISSING');

const before = readDecibelOverviewLifetimeTotalsV1(sessionPath);
console.log(`DECIBEL_METRICS_BEFORE=${JSON.stringify(before)}`);
if (!process.argv.includes('--apply')) {
  console.log('DECIBEL_METRICS_RESET=DRY_RUN (pass --apply to reset)');
} else {
  const Writer = new Database(sessionPath, { fileMustExist: true });
  try {
    Writer.pragma('busy_timeout = 5000');
    const { resetAt } = resetDecibelLifetimeMetricsV1(Writer, Date.now());
    console.log(`DECIBEL_METRICS_RESET=APPLIED RESET_AT=${new Date(resetAt).toISOString()}`);
  } finally {
    Writer.close();
  }
  console.log(
    `DECIBEL_METRICS_AFTER=${JSON.stringify(readDecibelOverviewLifetimeTotalsV1(sessionPath))}`,
  );
}
