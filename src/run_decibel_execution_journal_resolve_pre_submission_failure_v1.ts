import dotenv from 'dotenv';

dotenv.config();

import { resolve } from 'node:path';

import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';

function getArgument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : (process.argv[index + 1] ?? null);
}

const intentId = getArgument('--intent');
const confirmation = getArgument('--confirm');
if (intentId === null || confirmation !== 'APTOS_REMOTE_ABI_NON_INTEGER_CONFIRMED')
  throw new Error('EXECUTION_PRE_SUBMISSION_FAILURE_CONFIRMATION_REQUIRED');

const journalPath = resolve(
  process.env.DECIBEL_EXECUTION_JOURNAL_PATH ?? 'data/decibel_execution_v1.sqlite',
);
const Journal = new decibel_execution_lifecycle_journal_v1(journalPath);
try {
  const result = Journal.resolvePreSubmissionAbiFailure({
    intentId,
    at: Date.now(),
    confirmation: 'APTOS_REMOTE_ABI_NON_INTEGER_CONFIRMED',
  });
  console.log('EXECUTION_PRE_SUBMISSION_FAILURE_RESOLVED=YES');
  console.log(`INTENT_ID=${intentId}`);
  console.log(`DUPLICATE=${result.duplicate ? 'YES' : 'NO'}`);
  console.log(`LOCAL_JOURNAL_TRANSITIONS=${result.duplicate ? 0 : 1}`);
  console.log('PLACE_INVOCATIONS=0');
  console.log('CANCEL_INVOCATIONS=0');
  console.log('SIGNED_TRANSACTIONS=0');
  console.log('VENUE_MUTATIONS=0');
} finally {
  Journal.close();
}
