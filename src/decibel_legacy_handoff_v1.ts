import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

export const DECIBEL_LEGACY_HANDOFF_MAX_AGE_MS_V1 = 5_000;

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
