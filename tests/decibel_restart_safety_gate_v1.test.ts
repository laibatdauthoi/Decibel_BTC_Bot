import { describe, expect, it } from 'vitest';

import { buildDecibelRestartSafetySnapshotV1 } from '../src/decibel_restart_safety_gate_v1.js';

const base = Object.freeze({
  evaluatedAt: 10_000,
  authenticatedObservedAt: 9_900,
  authenticatedFreshnessLimitMs: 5_000,
  positionBase: 0,
  openOrders: [] as readonly unknown[],
  journalObservedAt: 9_999,
  unresolvedIntents: [] as readonly {
    intentId: string;
    status: 'ACKNOWLEDGED';
    venueOrderId: string | null;
  }[],
});

describe('Decibel restart safety gate V1', () => {
  it('authorizes only a fresh, flat, empty authenticated and journal state', () => {
    expect(buildDecibelRestartSafetySnapshotV1(base)).toMatchObject({
      safeToRestart: true,
      blocker: null,
      authenticatedSource: 'RUNTIME_SUPERVISOR_FRESH_AUTHENTICATED_REFRESH',
      journalSource: 'EXECUTION_LIFECYCLE_JOURNAL_FRESH_READ',
      authenticatedObservedAt: 9_900,
      journalObservedAt: 9_999,
    });
  });

  it('never lets a stale authenticated projection authorize restart', () => {
    expect(
      buildDecibelRestartSafetySnapshotV1({ ...base, authenticatedObservedAt: 4_999 }),
    ).toMatchObject({
      safeToRestart: false,
      blocker: 'RESTART_AUTHENTICATED_SNAPSHOT_STALE',
    });
  });

  it('blocks non-flat inventory and authenticated open orders', () => {
    expect(buildDecibelRestartSafetySnapshotV1({ ...base, positionBase: -0.00024 }).blocker).toBe(
      'RESTART_POSITION_NOT_FLAT',
    );
    expect(buildDecibelRestartSafetySnapshotV1({ ...base, openOrders: [{}] }).blocker).toBe(
      'RESTART_OPEN_ORDERS_PRESENT',
    );
  });

  it.each(['ACKNOWLEDGED', 'SUBMIT_UNKNOWN', 'SUBMITTING'] as const)(
    'blocks unresolved %s journal intents',
    (status) => {
      const result = buildDecibelRestartSafetySnapshotV1({
        ...base,
        unresolvedIntents: [{ intentId: 'intent-1', status, venueOrderId: 'order-1' }],
      });
      expect(result).toMatchObject({
        safeToRestart: false,
        blocker: 'RESTART_UNRESOLVED_INTENTS_PRESENT',
      });
      expect(result.unresolvedIntents).toHaveLength(1);
      expect(result.inflightMutations).toBe(status === 'SUBMITTING' ? 1 : 0);
    },
  );
});
