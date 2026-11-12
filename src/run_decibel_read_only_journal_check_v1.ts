import dotenv from 'dotenv';

dotenv.config();

import Database from 'better-sqlite3';

const path = process.env.DECIBEL_EXECUTION_JOURNAL_PATH;
if (path === undefined || path.trim().length === 0)
  throw new Error('DECIBEL_EXECUTION_JOURNAL_PATH_REQUIRED');
const Journal = new Database(path, { readonly: true, fileMustExist: true });
try {
  const terminal = [
    'APPLIED',
    'EXTERNALLY_NEUTRALIZED',
    'CANCELLED_EXTERNALLY',
    'FAILED_TIMEOUT',
    'FAILED_DROPPED',
    'FAILED_DROPPED_LEGACY',
    'REJECTED',
    'SUPERSEDED',
  ];
  const placeholders = terminal.map(() => '?').join(',');
  const unresolved = Journal.prepare(
    `SELECT intent_id intentId,status FROM execution_intents WHERE status NOT IN (${placeholders}) ORDER BY created_at,intent_id`,
  ).all(...terminal) as readonly Readonly<{ intentId: string; status: string }>[];
  const inflight = unresolved.filter(
    (intent) => intent.status === 'PREPARED' || intent.status === 'SUBMITTING',
  );
  console.log(
    JSON.stringify({
      unresolvedIntents: unresolved.length,
      unresolved,
      inflightMutations: inflight.length,
    }),
  );
} finally {
  Journal.close();
}
