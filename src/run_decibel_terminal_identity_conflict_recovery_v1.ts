import dotenv from 'dotenv';

dotenv.config();

import { mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { z } from 'zod';

import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import { createDecibelProductionLiveStateSourceV1 } from './decibel_production_live_state_source_v1.js';

const INCIDENT = Object.freeze({
  intentId: 'intent-663de87a736fe91e3aea4a5b',
  clientOrderId: 'd1s663de87a736fe91e3aea4a5b59b33',
  venueOrderId: '170141594179263706933213539642197934080',
  side: 'SELL' as const,
  market: 'BTC/USD',
  quantity: 0.0003,
  price: 81_608.2,
  transactionHash: '0x84a612f053ce4c53c0e680f6e59628fc913e832b04d8670de2550d25704fc837',
});

const ArgumentsSchema = z.object({
  mode: z.enum(['inspect', 'preflight', 'commit']),
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
      throw new Error('TERMINAL_IDENTITY_CONFLICT_RECOVERY_ARGUMENTS_INVALID');
    values.set(key.slice(2), value);
  }
  return ArgumentsSchema.parse({
    mode: values.get('mode'),
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
      throw new Error('TERMINAL_IDENTITY_CONFLICT_RECOVERY_BACKUP_INVALID');
  } finally {
    Backup.close();
  }
  return backupPath;
}

export async function runDecibelTerminalIdentityConflictRecoveryV1(
  environment: NodeJS.ProcessEnv,
  arguments_: readonly string[],
) {
  const input = parseArguments(arguments_);
  const journalPath = resolve(
    environment.DECIBEL_EXECUTION_JOURNAL_PATH ?? 'data/decibel_execution_v1.sqlite',
  );
  const Source = createDecibelProductionLiveStateSourceV1({ environment });
  try {
    await Source.assertAuthenticatedTransport();
    const [identityEvidence, position] = await Promise.all([
      Source.readOrderIdentityEvidence({
        venueOrderId: INCIDENT.venueOrderId,
        clientOrderId: INCIDENT.clientOrderId,
        createdAt: 1_792_751_515_586,
        transactionHash: INCIDENT.transactionHash,
      }),
      Source.readAuthenticatedPosition(),
    ]);
    const terminal = identityEvidence.terminalOrders.filter(
      (order) =>
        order.venueOrderId === INCIDENT.venueOrderId &&
        order.clientOrderId === INCIDENT.clientOrderId &&
        order.state === 'FILLED' &&
        order.originalQuantity === INCIDENT.quantity &&
        order.remainingQuantity === 0,
    );
    const fills = identityEvidence.fills.filter(
      (fill) => Math.abs(fill.quantity - INCIDENT.quantity) <= Number.EPSILON,
    );
    const exactFill = fills[0];
    if (
      identityEvidence.openOrders.length !== 0 ||
      terminal.length !== 1 ||
      identityEvidence.terminalOrders.length !== 1 ||
      fills.length !== 1 ||
      exactFill === undefined ||
      Math.abs(exactFill.price - INCIDENT.price) > 0.1 * 1e-8 ||
      identityEvidence.transactionState !== 'COMMITTED'
    )
      throw new Error('TERMINAL_IDENTITY_CONFLICT_RECOVERY_EXACT_EVIDENCE_REQUIRED');
    if (input.mode === 'inspect')
      return Object.freeze({
        outcome: 'INSPECTED',
        identityEvidence,
        authenticatedPositionBase: position.positionBase,
        journalMutation: false,
      });
    const request = {
      recoveryId: `terminal-full-fill-${input.authorizationId}-${INCIDENT.intentId}`,
      ...INCIDENT,
      now: identityEvidence.observedAt,
      maximumEvidenceAgeMs: 300_000,
      evidence: {
        source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' as const,
        observedAt: identityEvidence.observedAt,
        terminalState: 'FILLED' as const,
        remainingQuantity: 0 as const,
        transactionHash: INCIDENT.transactionHash,
        transactionState: 'COMMITTED' as const,
        fillId: exactFill.venueFillId,
        fillQuantity: exactFill.quantity,
        fillPrice: exactFill.price,
        fillTransactionTimestamp: exactFill.transactionTimestamp,
      },
      authorization: {
        scope: 'TERMINAL_IDENTITY_CONFLICT_FULL_FILL_RECOVERY' as const,
        authorizationId: input.authorizationId,
        operatorId: input.operatorId,
        authorizedAt: identityEvidence.observedAt,
        reason: input.reason,
      },
    };
    const backupPath = await createValidatedBackup(journalPath, input.authorizationId);
    const Preflight = new decibel_execution_lifecycle_journal_v1(backupPath);
    let assessment: ReturnType<typeof Preflight.assessTerminalIdentityConflictFullFillRecovery>;
    try {
      assessment = Preflight.assessTerminalIdentityConflictFullFillRecovery(request);
    } finally {
      Preflight.close();
    }
    if (!assessment.eligible || input.mode === 'preflight')
      return Object.freeze({
        outcome: assessment.eligible ? assessment.outcome : 'BLOCKED',
        blocker: assessment.eligible ? null : assessment.blocker,
        intentId: INCIDENT.intentId,
        backupPath,
        backupValidated: true,
        authenticatedPositionBase: position.positionBase,
        venueStatus: 'FILLED',
        remainingQuantity: 0,
        fillId: exactFill.venueFillId,
        journalMutation: false,
      });
    const Journal = new decibel_execution_lifecycle_journal_v1(journalPath);
    try {
      return Object.freeze({
        ...Journal.recoverTerminalIdentityConflictFullFill(request),
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

if (process.argv[1]?.endsWith('run_decibel_terminal_identity_conflict_recovery_v1.ts') === true) {
  try {
    console.log(
      JSON.stringify(
        await runDecibelTerminalIdentityConflictRecoveryV1(process.env, process.argv.slice(2)),
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
