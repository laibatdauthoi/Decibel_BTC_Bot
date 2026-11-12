import dotenv from 'dotenv';

dotenv.config();

import { mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { z } from 'zod';

import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import { createDecibelProductionLiveStateSourceV1 } from './decibel_production_live_state_source_v1.js';

const INCIDENTS = Object.freeze({
  'intent-ed6a4bbb1e282b3253066d1f': Object.freeze({
    intentId: 'intent-ed6a4bbb1e282b3253066d1f',
    clientOrderId: 'd1sed6a4bbb1e282b3253066d1f33b86',
    venueOrderId: '170141604320468508094256248004894785536',
    side: 'SELL' as const,
    market: 'BTC/USD',
    quantity: 0.0003,
  }),
  'intent-4c66fefb597045db812499d9': Object.freeze({
    intentId: 'intent-4c66fefb597045db812499d9',
    clientOrderId: 'd1b4c66fefb597045db812499d9cc5dd',
    venueOrderId: '170141604320468511023978584271189180416',
    side: 'BUY' as const,
    market: 'BTC/USD',
    quantity: 0.0003,
  }),
});

const ArgumentsSchema = z.object({
  mode: z.enum(['inspect', 'preflight', 'commit']),
  intentId: z.enum(['intent-ed6a4bbb1e282b3253066d1f', 'intent-4c66fefb597045db812499d9']),
  authorizationId: z.string().trim().min(1),
  operatorId: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});

function parseArguments(arguments_: readonly string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (key === undefined || value === undefined || !key.startsWith('--'))
      throw new Error('FALSE_FLAT_RECOVERY_ARGUMENTS_INVALID');
    values.set(key.slice(2), value);
  }
  return ArgumentsSchema.parse({
    mode: values.get('mode'),
    intentId: values.get('intent-id'),
    authorizationId: values.get('authorization-id'),
    operatorId: values.get('operator-id'),
    reason: values.get('reason'),
  });
}

async function createValidatedBackup(sourcePath: string, authorizationId: string): Promise<string> {
  const backupDirectory = resolve(dirname(sourcePath), 'recovery_backups');
  mkdirSync(backupDirectory, { recursive: true });
  const backupPath = resolve(
    backupDirectory,
    `${basename(sourcePath)}.${authorizationId}.${Date.now()}.sqlite`,
  );
  const Source = new Database(sourcePath, { fileMustExist: true });
  try {
    await Source.backup(backupPath);
  } finally {
    Source.close();
  }
  const Backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    if (Backup.pragma('quick_check', { simple: true }) !== 'ok')
      throw new Error('FALSE_FLAT_RECOVERY_BACKUP_QUICK_CHECK_FAILED');
  } finally {
    Backup.close();
  }
  return backupPath;
}

function readPersistedIdentity(path: string, incident: (typeof INCIDENTS)[keyof typeof INCIDENTS]) {
  const Journal = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const row = Journal.prepare(
      `SELECT intent_id intentId,status,venue_order_id venueOrderId,body_json bodyJson,
       created_at createdAt,
       (SELECT outcome_json FROM executor_outcomes o
        WHERE o.intent_id=execution_intents.intent_id ORDER BY id DESC LIMIT 1) outcomeJson
       FROM execution_intents WHERE intent_id=?`,
    ).get(incident.intentId) as
      | {
          intentId: string;
          status: string;
          venueOrderId: string | null;
          bodyJson: string;
          createdAt: number;
          outcomeJson: string | null;
        }
      | undefined;
    if (row === undefined) throw new Error('FALSE_FLAT_RECOVERY_INTENT_NOT_FOUND');
    const body = JSON.parse(row.bodyJson) as Record<string, unknown>;
    const outcome =
      row.outcomeJson === null ? null : (JSON.parse(row.outcomeJson) as Record<string, unknown>);
    const transactionHash = outcome?.transactionHash;
    if (
      row.intentId !== incident.intentId ||
      row.venueOrderId !== incident.venueOrderId ||
      body.action !== 'PLACE' ||
      body.clientOrderId !== incident.clientOrderId ||
      body.side !== incident.side ||
      body.market !== incident.market ||
      body.quantity !== incident.quantity ||
      row.status !== 'EXTERNALLY_NEUTRALIZED' ||
      typeof transactionHash !== 'string' ||
      !Number.isSafeInteger(row.createdAt)
    )
      throw new Error('FALSE_FLAT_RECOVERY_PERSISTED_IDENTITY_INVALID');
    return Object.freeze({ transactionHash, createdAt: row.createdAt });
  } finally {
    Journal.close();
  }
}

export async function runDecibelFalseFlatCheckpointRecoveryV1(
  environment: NodeJS.ProcessEnv,
  arguments_: readonly string[],
) {
  const input = parseArguments(arguments_);
  const incident = INCIDENTS[input.intentId];
  const journalPath = resolve(
    environment.DECIBEL_EXECUTION_JOURNAL_PATH ?? 'data/decibel_execution_v1.sqlite',
  );
  const persisted = readPersistedIdentity(journalPath, incident);
  const Source = createDecibelProductionLiveStateSourceV1({ environment });
  try {
    await Source.assertAuthenticatedTransport();
    const [identityEvidence, position] = await Promise.all([
      Source.readOrderIdentityEvidence({
        venueOrderId: incident.venueOrderId,
        clientOrderId: incident.clientOrderId,
        createdAt: persisted.createdAt,
        transactionHash: persisted.transactionHash,
      }),
      Source.readAuthenticatedPosition(),
    ]);
    if (input.mode === 'inspect')
      return Object.freeze({
        outcome: 'INSPECTED',
        ...identityEvidence,
        authenticatedPositionBase: position.positionBase,
        journalMutation: false,
      });
    const exactCancelled = identityEvidence.terminalOrders.filter(
      (order) =>
        order.state === 'CANCELLED' &&
        order.originalQuantity === incident.quantity &&
        order.remainingQuantity === 0,
    );
    if (
      identityEvidence.openOrders.length !== 0 ||
      exactCancelled.length === 0 ||
      exactCancelled.length !== identityEvidence.terminalOrders.length
    )
      throw new Error('FALSE_FLAT_CANCELLED_RECOVERY_EXACT_TERMINAL_EVIDENCE_REQUIRED');
    if (identityEvidence.fills.length !== 0)
      throw new Error('FALSE_FLAT_CANCELLED_RECOVERY_ZERO_FILLS_REQUIRED');
    if (identityEvidence.transactionState !== 'COMMITTED')
      throw new Error('FALSE_FLAT_CANCELLED_RECOVERY_COMMITTED_TRANSACTION_REQUIRED');
    const observedAt = identityEvidence.observedAt;
    const request = {
      recoveryId: `false-flat-cancelled-${input.authorizationId}-${incident.intentId}`,
      ...incident,
      now: observedAt,
      maximumEvidenceAgeMs: 300_000,
      evidence: {
        source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' as const,
        observedAt,
        terminalState: 'CANCELLED' as const,
        remainingQuantity: 0 as const,
        matchingFillCount: 0 as const,
        transactionHash: persisted.transactionHash,
        transactionState: 'COMMITTED' as const,
      },
      authorization: {
        scope: 'FALSE_FLAT_CHECKPOINT_CANCELLED_RECOVERY' as const,
        authorizationId: input.authorizationId,
        operatorId: input.operatorId,
        authorizedAt: observedAt,
        reason: input.reason,
      },
    };
    const backupPath = await createValidatedBackup(journalPath, input.authorizationId);
    const Preflight = new decibel_execution_lifecycle_journal_v1(backupPath);
    let assessment: ReturnType<typeof Preflight.assessFalseFlatCheckpointCancelledRecovery>;
    try {
      assessment = Preflight.assessFalseFlatCheckpointCancelledRecovery(request);
    } finally {
      Preflight.close();
    }
    if (!assessment.eligible || input.mode === 'preflight')
      return Object.freeze({
        outcome: assessment.eligible ? assessment.outcome : 'BLOCKED',
        blocker: assessment.eligible ? null : assessment.blocker,
        intentId: incident.intentId,
        backupPath,
        backupValidated: true,
        venueStatus: 'CANCELLED',
        authenticatedPositionBase: position.positionBase,
        remainingQuantity: 0,
        matchingFillCount: 0,
        transactionState: 'COMMITTED',
        journalMutation: false,
      });
    const Journal = new decibel_execution_lifecycle_journal_v1(journalPath);
    try {
      return Object.freeze({
        ...Journal.recoverFalseFlatCheckpointCancelledIntent(request),
        backupPath,
        backupValidated: true,
      });
    } finally {
      Journal.close();
    }
  } finally {
    await Source.close?.();
  }
}

if (process.argv[1]?.endsWith('run_decibel_false_flat_checkpoint_recovery_v1.ts') === true) {
  try {
    console.log(
      JSON.stringify(
        await runDecibelFalseFlatCheckpointRecoveryV1(process.env, process.argv.slice(2)),
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
