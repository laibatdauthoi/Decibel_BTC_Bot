import { describe, expect, it } from 'vitest';

import {
  deriveDecibelLegacyStablePairV1,
  validateDecibelLegacyHandoffV1,
} from '../src/decibel_legacy_handoff_v1.js';

const now = 100_000;
const expected = Object.freeze({
  pid: 27_624,
  processStartMs: 10_000,
  observedProcessStartMs: 10_000,
});
const snapshot = Object.freeze({
  legacyPid: 27_624,
  legacyProcessStartTime: 10_000,
  executablePath: 'C:\\Program Files\\nodejs\\node.exe',
  commandLineSha256: 'a'.repeat(64),
  publisherReady: true,
  legacyOperatorPaused: true,
  firstSnapshotTimestamp: 97_000,
  firstSnapshotAgeMsAtVerification: 3_000,
  stateStable: true,
  appHttpSnapshotTimestamp: 98_000,
  publishedAt: 99_000,
  authenticatedPositionBase: 0.0003,
  openOrders: [] as readonly { venueOrderId: string }[],
  unresolvedIntents: 0,
  maxSnapshotAgeMs: 5_000,
});

describe('Decibel legacy handoff V1', () => {
  it('accepts fresh identity-matched nonzero inventory with known empty open orders', () => {
    const result = validateDecibelLegacyHandoffV1(snapshot, expected, now);
    expect(result).toMatchObject({ safeToTerminate: true, blocker: null, snapshotAgeMs: 2_000 });
    expect(result.snapshot?.authenticatedPositionBase).toBe(0.0003);
    expect(result.snapshot?.openOrders).toEqual([]);
  });

  it('rejects PID reuse and an absent old process', () => {
    expect(
      validateDecibelLegacyHandoffV1(snapshot, { ...expected, observedProcessStartMs: 11_000 }, now)
        .blocker,
    ).toBe('LEGACY_HANDOFF_PROCESS_IDENTITY_MISMATCH');
    expect(
      validateDecibelLegacyHandoffV1(snapshot, { ...expected, observedProcessStartMs: null }, now)
        .safeToTerminate,
    ).toBe(false);
  });

  it('rejects stale publication, stale authenticated data, and unresolved intents', () => {
    expect(
      validateDecibelLegacyHandoffV1({ ...snapshot, publisherReady: false }, expected, now)
        .safeToTerminate,
    ).toBe(false);
    expect(
      validateDecibelLegacyHandoffV1({ ...snapshot, publishedAt: 90_000 }, expected, now).blocker,
    ).toBe('LEGACY_HANDOFF_PUBLICATION_STALE');
    expect(
      validateDecibelLegacyHandoffV1(
        { ...snapshot, appHttpSnapshotTimestamp: 94_000 },
        expected,
        now,
      ).blocker,
    ).toBe('LEGACY_HANDOFF_AUTH_SNAPSHOT_STALE');
    expect(
      validateDecibelLegacyHandoffV1({ ...snapshot, unresolvedIntents: 1 }, expected, now).blocker,
    ).toBe('LEGACY_HANDOFF_UNRESOLVED_INTENTS');
  });

  it('requires explicit operator pause and two stable fresh snapshots', () => {
    expect(
      validateDecibelLegacyHandoffV1({ ...snapshot, legacyOperatorPaused: null }, expected, now)
        .blocker,
    ).toBe('LEGACY_HANDOFF_OPERATOR_PAUSE_UNVERIFIED');
    expect(
      validateDecibelLegacyHandoffV1({ ...snapshot, legacyOperatorPaused: false }, expected, now)
        .safeToTerminate,
    ).toBe(false);
    expect(
      validateDecibelLegacyHandoffV1({ ...snapshot, stateStable: false }, expected, now).blocker,
    ).toBe('LEGACY_HANDOFF_SECOND_FRESH_SNAPSHOT_REQUIRED');
    expect(
      validateDecibelLegacyHandoffV1({ ...snapshot, firstSnapshotTimestamp: 94_000 }, expected, now)
        .blocker,
    ).toBe('LEGACY_HANDOFF_FIRST_SNAPSHOT_STALE');
  });

  it('rejects unknown open-order state and malformed position', () => {
    expect(
      validateDecibelLegacyHandoffV1({ ...snapshot, openOrders: null }, expected, now)
        .safeToTerminate,
    ).toBe(false);
    expect(
      validateDecibelLegacyHandoffV1(
        { ...snapshot, authenticatedPositionBase: null },
        expected,
        now,
      ).safeToTerminate,
    ).toBe(false);
    expect(
      validateDecibelLegacyHandoffV1(
        { ...snapshot, openOrders: [{ venueOrderId: 'open-1' }] },
        expected,
        now,
      ).blocker,
    ).toBe('LEGACY_HANDOFF_OPEN_ORDERS_PRESENT');
  });

  it('requires two consecutive, distinct, fresh, unchanged authenticated observations', () => {
    const current = {
      timestamp: 99_000,
      positionBase: snapshot.authenticatedPositionBase,
      openOrders: snapshot.openOrders,
      unresolvedIntents: 0,
      operatorPaused: true,
      legacyPid: snapshot.legacyPid,
      legacyStartMs: snapshot.legacyProcessStartTime,
    };
    expect(deriveDecibelLegacyStablePairV1(snapshot, current, now, 5_000)).toMatchObject({
      stateStable: true,
      firstSnapshotTimestamp: snapshot.appHttpSnapshotTimestamp,
    });
    expect(
      deriveDecibelLegacyStablePairV1(snapshot, { ...current, timestamp: 98_000 }, now, 5_000)
        .stateStable,
    ).toBe(false);
    expect(
      deriveDecibelLegacyStablePairV1(snapshot, { ...current, positionBase: 0 }, now, 5_000)
        .stateStable,
    ).toBe(false);
    expect(
      deriveDecibelLegacyStablePairV1(
        snapshot,
        { ...current, openOrders: [{ venueOrderId: 'open-1' }] },
        now,
        5_000,
      ).stateStable,
    ).toBe(false);
    expect(
      deriveDecibelLegacyStablePairV1(
        { ...snapshot, appHttpSnapshotTimestamp: 94_000 },
        current,
        now,
        5_000,
      ).stateStable,
    ).toBe(false);
  });
});
