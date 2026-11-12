/**
 * One-off keep-N retention with VACUUM. Default is a dry run.
 *   npm run decibel:data-retention-v1            (dry run: prints the plan)
 *   npm run decibel:data-retention-v1 -- --apply (deletes and vacuums; bot must be stopped)
 * Never deletes order intents, reconciliation or fills.
 */
import dotenv from 'dotenv';

dotenv.config();

import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';

import {
  applyDecibelRetentionPlanV1,
  planDecibelDataRetentionV1,
  readDecibelRetentionInputsV1,
} from './decibel_data_retention_v1.js';

const sessionPath = resolve(
  process.env.DECIBEL_PRODUCTION_SESSION_STORE_PATH ??
    'config/production_state/decibel_production_sessions_v1.sqlite',
);
const journalPath = resolve(
  process.env.DECIBEL_EXECUTION_JOURNAL_PATH ?? 'data/decibel_execution_v1.sqlite',
);
const apply = process.argv.includes('--apply');

const sizeMb = (path: string) =>
  ['', '-wal']
    .map((suffix) => (existsSync(path + suffix) ? statSync(path + suffix).size : 0))
    .reduce((sum, value) => sum + value, 0) / 1048576;

function isProductionProcessRunning(): boolean | null {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference='Stop'; if (Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'node.exe' -and $_.CommandLine -match 'run_decibel_production_(web|live)'}) { exit 2 } else { exit 0 }",
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  return result.status === 0 ? false : result.status === 2 ? true : null;
}

if (!existsSync(sessionPath) || !existsSync(journalPath))
  throw new Error('RETENTION_DATABASE_MISSING');
if (apply && isProductionProcessRunning() !== false)
  throw new Error('RETENTION_REQUIRES_PRODUCTION_PROCESS_PROVEN_STOPPED');

const sessionDb = new Database(sessionPath, apply ? {} : { readonly: true });
const journalDb = new Database(journalPath, apply ? {} : { readonly: true });
try {
  const plan = planDecibelDataRetentionV1(readDecibelRetentionInputsV1(sessionDb, journalDb));
  const snapshotsToDelete =
    plan.snapshotCutoffMs === null
      ? 0
      : (
          journalDb
            .prepare('SELECT COUNT(*) n FROM strategy_decision_snapshots WHERE observed_at < ?')
            .get(plan.snapshotCutoffMs) as { n: number }
        ).n;
  console.log(
    JSON.stringify(
      {
        mode: apply ? 'APPLY' : 'DRY_RUN',
        keepSessions: plan.keepSessionIds.length,
        deleteSessions: plan.deleteSessionIds.length,
        snapshotCutoff:
          plan.snapshotCutoffMs === null ? null : new Date(plan.snapshotCutoffMs).toISOString(),
        snapshotsToDelete,
        sizeMbBefore: {
          sessions: +sizeMb(sessionPath).toFixed(1),
          journal: +sizeMb(journalPath).toFixed(1),
        },
      },
      null,
      2,
    ),
  );
  if (apply) {
    const result = applyDecibelRetentionPlanV1(sessionDb, journalDb, plan);
    console.log(JSON.stringify({ event: 'RETENTION_APPLIED', ...result }));
    for (const [name, db] of [
      ['sessions', sessionDb],
      ['journal', journalDb],
    ] as const) {
      const started = Date.now();
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.exec('VACUUM');
      db.pragma('wal_checkpoint(TRUNCATE)');
      console.log(
        JSON.stringify({ event: 'VACUUM_DONE', database: name, ms: Date.now() - started }),
      );
    }
  }
} finally {
  sessionDb.close();
  journalDb.close();
}
if (apply)
  console.log(
    JSON.stringify({
      event: 'RETENTION_DONE',
      sizeMbAfter: {
        sessions: +sizeMb(sessionPath).toFixed(1),
        journal: +sizeMb(journalPath).toFixed(1),
      },
    }),
  );
