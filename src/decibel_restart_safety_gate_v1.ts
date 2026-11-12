import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { execution_intent_status_v1 } from './decibel_execution_intent_v1.js';

export const DECIBEL_RESTART_SAFETY_GATE_V1 = 'DECIBEL_RESTART_SAFETY_GATE_V1' as const;

export type decibel_restart_safety_snapshot_v1 = Readonly<{
  schemaVersion: typeof DECIBEL_RESTART_SAFETY_GATE_V1;
  evaluatedAt: number;
  authenticatedObservedAt: number;
  authenticatedSource: 'RUNTIME_SUPERVISOR_FRESH_AUTHENTICATED_REFRESH';
  authenticatedAgeMs: number;
  authenticatedFreshnessLimitMs: number;
  positionBase: number;
  openOrderCount: number;
  journalObservedAt: number;
  journalSource: 'EXECUTION_LIFECYCLE_JOURNAL_FRESH_READ';
  unresolvedIntents: readonly Readonly<{
    intentId: string;
    status: execution_intent_status_v1;
    venueOrderId: string | null;
  }>[];
  inflightMutations: number;
  safeToRestart: boolean;
  blocker: string | null;
}>;

export function buildDecibelRestartSafetySnapshotV1(
  input: Readonly<{
    evaluatedAt: number;
    authenticatedObservedAt: number;
    authenticatedFreshnessLimitMs: number;
    positionBase: number;
    openOrders: readonly unknown[];
    journalObservedAt: number;
    unresolvedIntents: readonly Readonly<{
      intentId: string;
      status: execution_intent_status_v1;
      venueOrderId: string | null;
    }>[];
  }>,
): decibel_restart_safety_snapshot_v1 {
  const authenticatedAgeMs = input.evaluatedAt - input.authenticatedObservedAt;
  const inflightMutations = input.unresolvedIntents.filter(
    (intent) => intent.status === 'PREPARED' || intent.status === 'SUBMITTING',
  ).length;
  const blocker =
    authenticatedAgeMs < 0 || authenticatedAgeMs > input.authenticatedFreshnessLimitMs
      ? 'RESTART_AUTHENTICATED_SNAPSHOT_STALE'
      : input.journalObservedAt > input.evaluatedAt
        ? 'RESTART_JOURNAL_SNAPSHOT_INVALID'
        : input.positionBase !== 0
          ? 'RESTART_POSITION_NOT_FLAT'
          : input.openOrders.length !== 0
            ? 'RESTART_OPEN_ORDERS_PRESENT'
            : input.unresolvedIntents.length !== 0
              ? 'RESTART_UNRESOLVED_INTENTS_PRESENT'
              : inflightMutations !== 0
                ? 'RESTART_INFLIGHT_MUTATIONS_PRESENT'
                : null;
  return Object.freeze({
    schemaVersion: DECIBEL_RESTART_SAFETY_GATE_V1,
    evaluatedAt: input.evaluatedAt,
    authenticatedObservedAt: input.authenticatedObservedAt,
    authenticatedSource: 'RUNTIME_SUPERVISOR_FRESH_AUTHENTICATED_REFRESH',
    authenticatedAgeMs,
    authenticatedFreshnessLimitMs: input.authenticatedFreshnessLimitMs,
    positionBase: input.positionBase,
    openOrderCount: input.openOrders.length,
    journalObservedAt: input.journalObservedAt,
    journalSource: 'EXECUTION_LIFECYCLE_JOURNAL_FRESH_READ',
    unresolvedIntents: Object.freeze(
      input.unresolvedIntents.map((intent) => Object.freeze(intent)),
    ),
    inflightMutations,
    safeToRestart: blocker === null,
    blocker,
  });
}

export function persistDecibelRestartSafetySnapshotV1(
  path: string,
  snapshot: decibel_restart_safety_snapshot_v1,
): void {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  writeFileSync(temporary, JSON.stringify(snapshot), { encoding: 'utf8', flag: 'w' });
  renameSync(temporary, target);
}
