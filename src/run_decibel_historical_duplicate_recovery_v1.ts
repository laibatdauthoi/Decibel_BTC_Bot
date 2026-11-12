import dotenv from 'dotenv';

dotenv.config();

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';
import { z } from 'zod';

import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import { createDecibelProductionLiveStateSourceV1 } from './decibel_production_live_state_source_v1.js';
import { reconcileAllDecibelAcknowledgedOrdersV1 } from './decibel_production_web_telemetry_v1.js';

const ArgumentsSchema = z
  .object({
    mode: z.enum(['preflight', 'commit']),
    originalIntentId: z.string().trim().min(1),
    duplicateIntentId: z.string().trim().min(1),
    buyIntentId: z.string().trim().min(1),
    authorizationId: z.string().trim().min(1),
    operatorId: z.string().trim().min(1),
    reason: z.string().trim().min(1),
  })
  .strict();

type arguments_v1 = z.infer<typeof ArgumentsSchema>;

function parseArguments(arguments_: readonly string[]): arguments_v1 {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (key === undefined || value === undefined || !key.startsWith('--'))
      throw new Error('HISTORICAL_RECOVERY_ARGUMENTS_INVALID');
    values.set(key.slice(2), value);
  }
  return ArgumentsSchema.parse({
    mode: values.get('mode'),
    originalIntentId: values.get('original-intent-id'),
    duplicateIntentId: values.get('duplicate-intent-id'),
    buyIntentId: values.get('buy-intent-id'),
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
      throw new Error('HISTORICAL_RECOVERY_BACKUP_QUICK_CHECK_FAILED');
  } finally {
    Backup.close();
  }
  return backupPath;
}

function getIdentity(
  path: string,
  intentId: string,
): Readonly<{
  intentId: string;
  status: string;
  venueOrderId: string | null;
  clientOrderId: string;
  createdAt: number;
  transactionHash: string | null;
}> {
  const DatabaseInstance = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const row = DatabaseInstance.prepare(
      `SELECT intent_id intentId,status,venue_order_id venueOrderId,body_json bodyJson,
       created_at createdAt,
       (SELECT transaction_hash FROM reconciliation_provenance p
        WHERE p.intent_id=execution_intents.intent_id AND transaction_hash IS NOT NULL
        ORDER BY id DESC LIMIT 1) transactionHash
       FROM execution_intents WHERE intent_id=?`,
    ).get(intentId) as
      | Readonly<{
          intentId: string;
          status: string;
          venueOrderId: string | null;
          bodyJson: string;
          createdAt: number;
          transactionHash: string | null;
        }>
      | undefined;
    if (row === undefined) throw new Error(`HISTORICAL_RECOVERY_INTENT_NOT_FOUND:${intentId}`);
    const body = JSON.parse(row.bodyJson) as Readonly<{ clientOrderId?: unknown }>;
    if (typeof body.clientOrderId !== 'string' || body.clientOrderId.length === 0)
      throw new Error(`HISTORICAL_RECOVERY_CLIENT_ORDER_ID_MISSING:${intentId}`);
    return Object.freeze({
      intentId: row.intentId,
      status: row.status,
      venueOrderId: row.venueOrderId,
      clientOrderId: body.clientOrderId,
      createdAt: row.createdAt,
      transactionHash: row.transactionHash,
    });
  } finally {
    DatabaseInstance.close();
  }
}

export async function runDecibelHistoricalDuplicateRecoveryV1(
  environment: NodeJS.ProcessEnv,
  arguments_: readonly string[],
): Promise<Readonly<Record<string, unknown>>> {
  const input = parseArguments(arguments_);
  const journalPath = resolve(
    environment.DECIBEL_EXECUTION_JOURNAL_PATH ?? 'data/decibel_execution_v1.sqlite',
  );
  const original = getIdentity(journalPath, input.originalIntentId);
  const duplicate = getIdentity(journalPath, input.duplicateIntentId);
  const buy = getIdentity(journalPath, input.buyIntentId);
  if (
    original.venueOrderId === null ||
    duplicate.venueOrderId !== original.venueOrderId ||
    duplicate.clientOrderId !== original.clientOrderId
  )
    throw new Error('HISTORICAL_RECOVERY_SELL_IDENTITY_MISMATCH');
  if (buy.venueOrderId === null) throw new Error('HISTORICAL_RECOVERY_BUY_VENUE_ID_MISSING');

  const Source = createDecibelProductionLiveStateSourceV1(environment);
  try {
    await Source.assertAuthenticatedTransport();
    const snapshot = await Source.readAuthenticatedSnapshot();
    const observedAt = snapshot.input.now;
    const sellTerminal = snapshot.terminalOrderEvidence?.find(
      (candidate) =>
        candidate.venueOrderId === original.venueOrderId &&
        candidate.clientOrderId === original.clientOrderId,
    );
    const buyTerminal = snapshot.terminalOrderEvidence?.find(
      (candidate) =>
        candidate.venueOrderId === buy.venueOrderId &&
        candidate.clientOrderId === buy.clientOrderId,
    );
    const [sellState, buyState] = await Promise.all([
      Source.reconcileIntent(input.originalIntentId, snapshot, original.venueOrderId, {
        clientOrderId: original.clientOrderId,
        createdAt: original.createdAt,
        transactionHash: original.transactionHash,
      }),
      Source.reconcileIntent(input.buyIntentId, snapshot, buy.venueOrderId, {
        clientOrderId: buy.clientOrderId,
        createdAt: buy.createdAt,
        transactionHash: buy.transactionHash,
      }),
    ]);
    if (
      sellState !== 'FULL_FILL' ||
      buyState !== 'FULL_FILL' ||
      (sellTerminal !== undefined &&
        (sellTerminal.state !== 'FILLED' || sellTerminal.remainingQuantity !== 0)) ||
      (buyTerminal !== undefined &&
        (buyTerminal.state !== 'FILLED' || buyTerminal.remainingQuantity !== 0))
    )
      throw new Error('HISTORICAL_RECOVERY_FRESH_TERMINAL_EVIDENCE_REQUIRED');
    if (
      snapshot.input.openOrders.some(
        (order) =>
          order.venueOrderId === original.venueOrderId ||
          order.venueOrderId === buy.venueOrderId ||
          order.clientOrderId === original.clientOrderId ||
          order.clientOrderId === buy.clientOrderId,
      )
    )
      throw new Error('HISTORICAL_RECOVERY_TARGET_ORDER_STILL_OPEN');

    const backupPath = await createValidatedBackup(journalPath, input.authorizationId);
    const PreflightJournal = new decibel_execution_lifecycle_journal_v1(backupPath);
    const request = {
      recoveryId: `historical-duplicate-${input.authorizationId}`,
      originalIntentId: input.originalIntentId,
      duplicateIntentId: input.duplicateIntentId,
      venueOrderId: original.venueOrderId,
      clientOrderId: original.clientOrderId,
      now: observedAt,
      maximumEvidenceAgeMs: 300_000,
      evidence: {
        source:
          sellTerminal === undefined
            ? ('AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION' as const)
            : ('AUTHENTICATED_TERMINAL_ORDER_HISTORY' as const),
        observedAt,
        reconciliationState: 'FULL_FILL' as const,
        venueStatus: 'FILLED' as const,
        remainingQuantity: 0 as const,
        matchedIdentifier: `venueOrderId:${original.venueOrderId}`,
        transactionHash: original.transactionHash,
      },
      authorization: {
        scope: 'HISTORICAL_DUPLICATE_INTENT_RECOVERY' as const,
        authorizationId: input.authorizationId,
        operatorId: input.operatorId,
        authorizedAt: observedAt,
        reason: input.reason,
      },
    };
    let assessment: ReturnType<typeof PreflightJournal.assessHistoricalDuplicateRecovery>;
    try {
      assessment = PreflightJournal.assessHistoricalDuplicateRecovery(request);
    } finally {
      PreflightJournal.close();
    }
    if (!assessment.eligible)
      return Object.freeze({
        outcome: 'BLOCKED',
        blocker: assessment.blocker,
        backupPath,
        backupValidated: true,
      });
    if (input.mode === 'preflight')
      return Object.freeze({
        outcome: assessment.outcome,
        backupPath,
        backupValidated: true,
        authenticatedPositionBase: snapshot.input.actualInventoryBase,
        authenticatedOpenOrders: snapshot.input.openOrders.length,
        evidenceObservedAt: observedAt,
      });

    const Journal = new decibel_execution_lifecycle_journal_v1(journalPath);
    try {
      const duplicateRecovery = Journal.recoverHistoricalDuplicateIntent(request);
      if (duplicateRecovery.outcome === 'REJECTED')
        return Object.freeze({
          outcome: 'BLOCKED',
          blocker: duplicateRecovery.blocker,
          backupPath,
          backupValidated: true,
        });
      const reconciliation = await reconcileAllDecibelAcknowledgedOrdersV1(
        Journal,
        Source,
        snapshot,
      );
      const reconciled = reconciliation.reconciled;
      if (
        !reconciled.includes(input.buyIntentId) &&
        Journal.get(input.buyIntentId)?.status !== 'APPLIED'
      )
        return Object.freeze({
          outcome: 'PARTIAL',
          blocker: 'HISTORICAL_RECOVERY_BUY_NOT_RECONCILED',
          duplicateRecovery: duplicateRecovery.outcome,
          backupPath,
          backupValidated: true,
        });
      const remaining = Journal.nonTerminal();
      return Object.freeze({
        outcome: remaining.length === 0 ? 'SUCCESS' : 'PARTIAL',
        duplicateRecovery: duplicateRecovery.outcome,
        reconciled,
        remainingNonTerminal: remaining,
        originalStatus: Journal.get(input.originalIntentId)?.status ?? null,
        duplicateStatus: Journal.get(input.duplicateIntentId)?.status ?? null,
        buyStatus: Journal.get(input.buyIntentId)?.status ?? null,
        recoveryAudit: Journal.getHistoricalDuplicateRecovery(request.recoveryId),
        backupPath,
        backupValidated: true,
        authenticatedPositionBase: snapshot.input.actualInventoryBase,
        authenticatedOpenOrders: snapshot.input.openOrders.length,
        evidenceObservedAt: observedAt,
      });
    } finally {
      Journal.close();
    }
  } finally {
    await Source.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runDecibelHistoricalDuplicateRecoveryV1(process.env, process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error: unknown) => {
      console.error(
        JSON.stringify({
          outcome: 'BLOCKED',
          blocker: error instanceof Error ? error.message : 'HISTORICAL_RECOVERY_UNKNOWN_ERROR',
          runId: randomUUID(),
        }),
      );
      process.exitCode = 1;
    });
}
