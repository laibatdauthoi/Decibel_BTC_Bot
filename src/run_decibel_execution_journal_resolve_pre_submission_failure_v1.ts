import dotenv from 'dotenv';

dotenv.config();

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';

export function hasExecutionPreSubmissionFailureConfirmationV1(
  argumentsValue: readonly string[],
  environment: NodeJS.ProcessEnv,
): boolean {
  const confirmIndex = argumentsValue.indexOf('--confirm');
  return (
    argumentsValue.includes('--yes') ||
    confirmIndex >= 0 ||
    environment.CONFIRM?.trim().toLowerCase() === 'true' ||
    environment.EXECUTION_PRE_SUBMISSION_FAILURE_CONFIRMATION?.trim().toUpperCase() === 'YES'
  );
}

function printConfirmationHelp(): void {
  console.error('EXECUTION_PRE_SUBMISSION_FAILURE_CONFIRMATION_REQUIRED');
  console.error('Run: npm run decibel:execution:resolve-pre-submit-failure-v1 -- --confirm');
  console.error(
    'For one intent: npm run decibel:execution:resolve-pre-submit-failure-v1 -- --intent <intent-id> --confirm',
  );
  console.error('Only locally proven, never-submitted intents are cleared automatically.');
}

export function runDecibelExecutionJournalResolvePreSubmissionFailureV1(
  argumentsValue: readonly string[],
  environment: NodeJS.ProcessEnv,
): number {
  if (!hasExecutionPreSubmissionFailureConfirmationV1(argumentsValue, environment)) {
    printConfirmationHelp();
    return 2;
  }
  const intentId = getArgumentFrom(argumentsValue, '--intent');
  const clientOrderId = getArgumentFrom(argumentsValue, '--client-order-id');
  const proof = getArgumentFrom(argumentsValue, '--proof');
  const journalPath = resolve(
    environment.DECIBEL_EXECUTION_JOURNAL_PATH ?? 'data/decibel_execution_v1.sqlite',
  );
  const Journal = new decibel_execution_lifecycle_journal_v1(journalPath);
  try {
    const result = Journal.resolveConfirmedPreSubmissionFailures({
      ...(intentId === null ? {} : { intentId }),
      ...(clientOrderId === null ? {} : { clientOrderId }),
      ...(proof === 'CANARY_HALT_FOR_RECONCILIATION' ? { preExecutorProof: proof } : {}),
      at: Date.now(),
      confirmed: true,
    });
    const selectedIntentResolved =
      intentId === null ||
      result.resolvedIntentIds.includes(intentId) ||
      result.alreadyTerminalIntentIds.includes(intentId);
    console.log(
      `EXECUTION_PRE_SUBMISSION_FAILURE_RESOLVED=${selectedIntentResolved ? 'YES' : 'NO'}`,
    );
    console.log(`INTENT_ID=${intentId ?? 'ALL_ELIGIBLE'}`);
    console.log(`RESOLVED_INTENT_IDS=${result.resolvedIntentIds.join(',') || 'NONE'}`);
    console.log(`LOCAL_JOURNAL_TRANSITIONS=${result.resolvedIntentIds.length}`);
    console.log('PLACE_INVOCATIONS=0');
    console.log('CANCEL_INVOCATIONS=0');
    console.log('SIGNED_TRANSACTIONS=0');
    console.log('VENUE_MUTATIONS=0');
    if (!selectedIntentResolved)
      console.error('BLOCKER=EXECUTION_PRE_SUBMISSION_FAILURE_RESOLUTION_REJECTED');
    return selectedIntentResolved ? 0 : 1;
  } finally {
    Journal.close();
  }
}

function getArgumentFrom(argumentsValue: readonly string[], name: string): string | null {
  const index = argumentsValue.indexOf(name);
  return index < 0 ? null : (argumentsValue[index + 1] ?? null);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = runDecibelExecutionJournalResolvePreSubmissionFailureV1(
    process.argv.slice(2),
    process.env,
  );
