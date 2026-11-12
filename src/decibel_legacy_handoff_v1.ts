import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';
import { z } from 'zod';

export const DECIBEL_LEGACY_HANDOFF_MAX_AGE_MS_V1 = 5_000;

const ProcessIdentitySchema = z.object({
  pid: z.number().int().positive(),
  startMs: z.number().int().positive(),
  executablePath: z.string().min(1),
  commandLine: z.string().min(1),
});

const OpenOrderSchema = z.object({ venueOrderId: z.string().min(1) }).passthrough();
const HandoffSchema = z.object({
  legacyPid: z.number().int().positive(),
  legacyProcessStartTime: z.number().int().positive(),
  executablePath: z.string().min(1),
  commandLineSha256: z.string().regex(/^[a-f0-9]{64}$/),
  publisherReady: z.boolean(),
  legacyOperatorPaused: z.boolean().nullable(),
  firstSnapshotTimestamp: z.number().int().positive().nullable(),
  firstSnapshotAgeMsAtVerification: z.number().int().nonnegative().nullable(),
  stateStable: z.boolean(),
  appHttpSnapshotTimestamp: z.number().int().positive(),
  publishedAt: z.number().int().positive(),
  authenticatedPositionBase: z.number().finite(),
  openOrders: z.array(OpenOrderSchema),
  unresolvedIntents: z.number().int().nonnegative(),
  maxSnapshotAgeMs: z.number().int().positive(),
});

export type decibel_legacy_handoff_snapshot_v1 = z.infer<typeof HandoffSchema>;

export function deriveDecibelLegacyStablePairV1(
  previous: decibel_legacy_handoff_snapshot_v1 | null,
  current: Readonly<{
    timestamp: number;
    positionBase: number;
    openOrders: readonly z.infer<typeof OpenOrderSchema>[];
    unresolvedIntents: number;
    operatorPaused: boolean | null;
    legacyPid: number;
    legacyStartMs: number;
  }>,
  now: number,
  maxAgeMs: number,
): Readonly<{
  stateStable: boolean;
  firstSnapshotTimestamp: number | null;
  firstSnapshotAgeMsAtVerification: number | null;
}> {
  if (previous === null)
    return Object.freeze({
      stateStable: false,
      firstSnapshotTimestamp: null,
      firstSnapshotAgeMsAtVerification: null,
    });
  const firstAge = now - previous.appHttpSnapshotTimestamp;
  const secondAge = now - current.timestamp;
  const normalizeOrders = (orders: readonly z.infer<typeof OpenOrderSchema>[]) =>
    JSON.stringify([...orders].sort((a, b) => a.venueOrderId.localeCompare(b.venueOrderId)));
  const stateStable =
    firstAge >= 0 &&
    firstAge <= maxAgeMs &&
    secondAge >= 0 &&
    secondAge <= maxAgeMs &&
    previous.appHttpSnapshotTimestamp < current.timestamp &&
    previous.legacyPid === current.legacyPid &&
    previous.legacyProcessStartTime === current.legacyStartMs &&
    previous.authenticatedPositionBase === current.positionBase &&
    previous.legacyOperatorPaused === current.operatorPaused &&
    previous.unresolvedIntents === current.unresolvedIntents &&
    normalizeOrders(previous.openOrders) === normalizeOrders(current.openOrders);
  return Object.freeze({
    stateStable,
    firstSnapshotTimestamp: stateStable ? previous.appHttpSnapshotTimestamp : null,
    firstSnapshotAgeMsAtVerification: stateStable ? firstAge : null,
  });
}

export function getDecibelLegacyProcessIdentityV1(
  pid: number,
): z.infer<typeof ProcessIdentitySchema> {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('LEGACY_PID_INVALID');
  const script = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($null -eq $p){throw 'LEGACY_PID_ABSENT'}; [pscustomobject]@{pid=[int]$p.ProcessId;startMs=([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds();executablePath=[string]$p.ExecutablePath;commandLine=[string]$p.CommandLine} | ConvertTo-Json -Compress`;
  const output = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    },
  );
  return ProcessIdentitySchema.parse(JSON.parse(output) as unknown);
}

export function getDecibelLegacyProcessStartV1(pid: number): number | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    const script = `$p=Get-Process -Id ${pid} -ErrorAction Stop; ([DateTimeOffset]$p.StartTime).ToUnixTimeMilliseconds()`;
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        encoding: 'utf8',
        timeout: 5_000,
        windowsHide: true,
      },
    );
    const startMs = Number(output.trim());
    return Number.isSafeInteger(startMs) && startMs > 0 ? startMs : null;
  } catch {
    return null;
  }
}

export function countDecibelLegacyUnresolvedIntentsV1(journalPath: string): number {
  const Journal = new Database(resolve(journalPath), { readonly: true, fileMustExist: true });
  try {
    const row = Journal.prepare(
      `SELECT COUNT(*) AS count FROM execution_intents
       WHERE status NOT IN ('APPLIED','EXTERNALLY_NEUTRALIZED','CANCELLED_EXTERNALLY',
       'FAILED_TIMEOUT','FAILED_DROPPED','FAILED_DROPPED_LEGACY','REJECTED','SUPERSEDED')`,
    ).get() as { count: number };
    return row.count;
  } finally {
    Journal.close();
  }
}

export function validateDecibelLegacyHandoffV1(
  value: unknown,
  expected: Readonly<{
    pid: number;
    processStartMs: number;
    observedProcessStartMs: number | null;
  }>,
  now: number,
): Readonly<{
  safeToTerminate: boolean;
  blocker: string | null;
  snapshot: decibel_legacy_handoff_snapshot_v1 | null;
  snapshotAgeMs: number | null;
}> {
  const parsed = HandoffSchema.safeParse(value);
  if (!parsed.success)
    return Object.freeze({
      safeToTerminate: false,
      blocker: 'LEGACY_HANDOFF_SNAPSHOT_INVALID',
      snapshot: null,
      snapshotAgeMs: null,
    });
  const snapshot = parsed.data;
  const snapshotAgeMs = now - snapshot.appHttpSnapshotTimestamp;
  const identityMatches =
    snapshot.legacyPid === expected.pid &&
    snapshot.legacyProcessStartTime === expected.processStartMs &&
    expected.observedProcessStartMs === expected.processStartMs;
  const blocker = !snapshot.publisherReady
    ? 'LEGACY_HANDOFF_PUBLISHER_ERROR'
    : !identityMatches
      ? 'LEGACY_HANDOFF_PROCESS_IDENTITY_MISMATCH'
      : snapshot.legacyOperatorPaused !== true
        ? 'LEGACY_HANDOFF_OPERATOR_PAUSE_UNVERIFIED'
        : !snapshot.stateStable || snapshot.firstSnapshotTimestamp === null
          ? 'LEGACY_HANDOFF_SECOND_FRESH_SNAPSHOT_REQUIRED'
          : snapshot.publishedAt > now ||
              now - snapshot.publishedAt > DECIBEL_LEGACY_HANDOFF_MAX_AGE_MS_V1
            ? 'LEGACY_HANDOFF_PUBLICATION_STALE'
            : snapshotAgeMs < 0 ||
                snapshotAgeMs >
                  Math.min(snapshot.maxSnapshotAgeMs, DECIBEL_LEGACY_HANDOFF_MAX_AGE_MS_V1)
              ? 'LEGACY_HANDOFF_AUTH_SNAPSHOT_STALE'
              : snapshot.firstSnapshotAgeMsAtVerification === null ||
                  now - snapshot.firstSnapshotTimestamp >
                    Math.min(snapshot.maxSnapshotAgeMs, DECIBEL_LEGACY_HANDOFF_MAX_AGE_MS_V1)
                ? 'LEGACY_HANDOFF_FIRST_SNAPSHOT_STALE'
                : snapshot.openOrders.length !== 0
                  ? 'LEGACY_HANDOFF_OPEN_ORDERS_PRESENT'
                  : snapshot.unresolvedIntents !== 0
                    ? 'LEGACY_HANDOFF_UNRESOLVED_INTENTS'
                    : null;
  return Object.freeze({ safeToTerminate: blocker === null, blocker, snapshot, snapshotAgeMs });
}

export function readDecibelLegacyHandoffV1(
  path: string,
  expectedPid: number,
  expectedStartMs: number,
  now = Date.now(),
): ReturnType<typeof validateDecibelLegacyHandoffV1> {
  try {
    const value = JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown;
    return validateDecibelLegacyHandoffV1(
      value,
      {
        pid: expectedPid,
        processStartMs: expectedStartMs,
        observedProcessStartMs: getDecibelLegacyProcessStartV1(expectedPid),
      },
      now,
    );
  } catch {
    return Object.freeze({
      safeToTerminate: false,
      blocker: 'LEGACY_HANDOFF_SNAPSHOT_UNAVAILABLE',
      snapshot: null,
      snapshotAgeMs: null,
    });
  }
}

export async function publishDecibelLegacyHandoffV1(
  input: Readonly<{
    pid: number;
    expectedStartMs: number;
    expectedExecutablePath: string;
    expectedRunnerPath: string;
    httpUrl: string;
    journalPath: string;
    outputPath: string;
    previousSnapshot?: decibel_legacy_handoff_snapshot_v1 | null;
  }>,
): Promise<
  Readonly<{
    snapshot: decibel_legacy_handoff_snapshot_v1;
    safeToTerminate: boolean;
    blocker: string | null;
  }>
> {
  const before = getDecibelLegacyProcessIdentityV1(input.pid);
  if (
    before.startMs !== input.expectedStartMs ||
    before.executablePath.toLowerCase() !== input.expectedExecutablePath.toLowerCase() ||
    !before.commandLine.toLowerCase().includes(input.expectedRunnerPath.toLowerCase())
  )
    throw new Error('LEGACY_HANDOFF_PROCESS_IDENTITY_MISMATCH');
  const response = await fetch(input.httpUrl, {
    signal: AbortSignal.timeout(8_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`LEGACY_HANDOFF_HTTP_${response.status}`);
  const body = z
    .object({
      operatorPaused: z.boolean().optional(),
      snapshot: z
        .object({
          input: z
            .object({
              now: z.number().int().positive(),
              maxBboAgeMs: z.number().int().positive(),
              actualInventoryBase: z.number().finite(),
              openOrders: z.array(OpenOrderSchema),
            })
            .passthrough(),
        })
        .passthrough(),
    })
    .parse(await response.json());
  const after = getDecibelLegacyProcessIdentityV1(input.pid);
  if (
    after.startMs !== before.startMs ||
    after.executablePath !== before.executablePath ||
    after.commandLine !== before.commandLine
  )
    throw new Error('LEGACY_HANDOFF_PID_REUSED_DURING_READ');
  const now = Date.now();
  const unresolvedIntents = countDecibelLegacyUnresolvedIntentsV1(input.journalPath);
  const pair = deriveDecibelLegacyStablePairV1(
    input.previousSnapshot ?? null,
    {
      timestamp: body.snapshot.input.now,
      positionBase: body.snapshot.input.actualInventoryBase,
      openOrders: body.snapshot.input.openOrders,
      unresolvedIntents,
      operatorPaused: body.operatorPaused ?? null,
      legacyPid: input.pid,
      legacyStartMs: before.startMs,
    },
    now,
    Math.min(body.snapshot.input.maxBboAgeMs, DECIBEL_LEGACY_HANDOFF_MAX_AGE_MS_V1),
  );
  const candidate = HandoffSchema.parse({
    legacyPid: input.pid,
    legacyProcessStartTime: before.startMs,
    executablePath: before.executablePath,
    commandLineSha256: createHash('sha256').update(before.commandLine).digest('hex'),
    publisherReady: true,
    legacyOperatorPaused: body.operatorPaused ?? null,
    firstSnapshotTimestamp: pair.firstSnapshotTimestamp,
    firstSnapshotAgeMsAtVerification: pair.firstSnapshotAgeMsAtVerification,
    stateStable: pair.stateStable,
    appHttpSnapshotTimestamp: body.snapshot.input.now,
    publishedAt: now,
    authenticatedPositionBase: body.snapshot.input.actualInventoryBase,
    openOrders: body.snapshot.input.openOrders,
    unresolvedIntents,
    maxSnapshotAgeMs: body.snapshot.input.maxBboAgeMs,
  });
  const validated = validateDecibelLegacyHandoffV1(
    candidate,
    {
      pid: input.pid,
      processStartMs: input.expectedStartMs,
      observedProcessStartMs: after.startMs,
    },
    now,
  );
  const outputPath = resolve(input.outputPath);
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  writeFileSync(
    temporaryPath,
    JSON.stringify({
      ...candidate,
      safeToTerminate: validated.safeToTerminate,
      blocker: validated.blocker,
    }),
    { encoding: 'utf8', flag: 'w' },
  );
  renameSync(temporaryPath, outputPath);
  return Object.freeze({
    snapshot: candidate,
    safeToTerminate: validated.safeToTerminate,
    blocker: validated.blocker,
  });
}
