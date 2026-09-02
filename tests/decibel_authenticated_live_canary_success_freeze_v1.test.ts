import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildDecibelAuthenticatedLiveCanarySuccessManifestV1,
  canonicalizeDecibelAuthenticatedLiveCanarySuccessV1,
  freezeDecibelAuthenticatedLiveCanarySuccessManifestV1,
  type decibel_authenticated_live_canary_success_source_v1,
} from '../src/decibel_authenticated_live_canary_success_freeze_v1.js';

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

const handoff = {
  canaryId: 'canary-1',
  executionSessionId: 'session-1',
  handoffPackageHash: 'handoff-hash',
  executionPackageHash: 'execution-hash',
  subaccount: '0xabc',
  market: 'BTC/USD',
  marketAddress: '0xdef',
  side: 'BUY',
  price: 76_916.9,
  quantity: 0.00027,
  notionalUsd: 20.767563,
  clientOrderId: 'planned-client-id',
};
const capture = {
  canaryId: 'canary-1',
  executionSessionId: 'session-1',
  handoffArtifactHash: 'handoff-hash',
  executionPackageHash: 'execution-hash',
  configuredSubaccount: '0xabc',
  market: 'BTC/USD',
  marketAddress: '0xdef',
  expectedSide: 'BUY',
  expectedPrice: 76_916.9,
  expectedQuantity: 0.00027,
  handoffPlannedClientOrderId: 'planned-client-id',
  venueClientOrderId: 'venue-client-id',
  venueOrderId: 'venue-order-id',
  transactionVersion: 7_036_650_897,
  transactionHash: `0x${'a'.repeat(64)}`,
  uiCanaryOrderCaptured: true,
  uiCanaryTransactionIdentityMatch: 'YES',
  activityExclusivity: true,
  classification: 'UI_CANARY_ORDER_CAPTURED',
};
const reconciliation = {
  canaryId: 'canary-1',
  executionSessionId: 'session-1',
  handoffPackageHash: 'handoff-hash',
  side: 'BUY',
  orderPrice: 76_916.9,
  orderQuantity: 0.00027,
  plannedClientOrderId: 'planned-client-id',
  venueClientOrderId: 'venue-client-id',
  venueOrderId: 'venue-order-id',
  capturedTransactionVersion: 7_036_650_897,
  transactionVersion: 7_036_650_897,
  capturedTransactionHash: `0x${'a'.repeat(64)}`,
  providedTransactionHash: `0x${'a'.repeat(64)}`,
  classification: 'CANARY_FULL_FILL_RECONCILED',
  canaryReconciled: true,
  transactionIdentityMatch: true,
  transactionFinality: 'FINALIZED_SUCCESS',
  authenticatedFillCount: 1,
  authenticatedFilledQuantity: 0.00027,
  weightedAverageFillPrice: 76_916.9,
  fillIds: ['fill-1'],
  fees: 0.003115,
  rebates: 0,
  makerStatus: 'PROVEN',
  startingPosition: 0,
  endingPosition: 0.00027,
  fillConservation: 'PASS',
  positionConservation: 'PASS',
  journalStatus: 'PASS',
  remainingQuantity: 0,
  openOrderState: 'ABSENT',
  unknownOrders: 0,
  unknownFills: 0,
  activityExclusivity: true,
};

function source(
  path: string,
  value: Record<string, unknown>,
): decibel_authenticated_live_canary_success_source_v1 {
  return { path, bytes: Buffer.from(`${JSON.stringify(value)}\n`), value };
}
function build(changes?: {
  handoff?: Record<string, unknown>;
  capture?: Record<string, unknown>;
  reconciliation?: Record<string, unknown>;
}) {
  return buildDecibelAuthenticatedLiveCanarySuccessManifestV1({
    handoff: source('handoff.json', { ...handoff, ...changes?.handoff }),
    capture: source('capture.json', { ...capture, ...changes?.capture }),
    reconciliation: source('reconciliation.json', {
      ...reconciliation,
      ...changes?.reconciliation,
    }),
  });
}

describe('DECIBEL AUTHENTICATED LIVE CANARY SUCCESS FREEZE V1', () => {
  it('freezes the exact full-fill proof with distinct planned and venue identities', () => {
    const manifest = build();
    expect(manifest.conclusion.authenticatedLiveCanaryStatus).toBe('FULL_FILL_RECONCILED');
    expect(manifest.identity.plannedClientOrderId).toBe('planned-client-id');
    expect(manifest.identity.venueClientOrderId).toBe('venue-client-id');
    expect(manifest.fillEvidence).toMatchObject({ authenticatedFillCount: 1, fillIds: ['fill-1'] });
    expect(manifest.position).toEqual({ startingPosition: 0, endingPosition: 0.00027 });
    expect(manifest.mutationCounters).toEqual({
      signedTransactions: 0,
      submittedTransactions: 0,
      placedOrders: 0,
      cancelledOrders: 0,
      replacedOrders: 0,
      venueMutations: 0,
    });
  });

  it.each([
    ['wrong canary ID', { capture: { canaryId: 'wrong' } }, 'CANARY_ID_MISMATCH'],
    [
      'wrong session ID',
      { reconciliation: { executionSessionId: 'wrong' } },
      'EXECUTION_SESSION_ID_MISMATCH',
    ],
    [
      'wrong handoff hash',
      { capture: { handoffArtifactHash: 'wrong' } },
      'HANDOFF_PACKAGE_HASH_MISMATCH',
    ],
    [
      'wrong execution hash',
      { capture: { executionPackageHash: 'wrong' } },
      'EXECUTION_PACKAGE_HASH_MISMATCH',
    ],
    [
      'capture unsuccessful',
      { capture: { uiCanaryOrderCaptured: false } },
      'UI_CANARY_CAPTURE_NOT_SUCCESSFUL',
    ],
    [
      'capture transaction mismatch',
      { capture: { uiCanaryTransactionIdentityMatch: 'NO' } },
      'CAPTURE_TRANSACTION_IDENTITY_MISMATCH',
    ],
    [
      'wrong venue identity',
      { reconciliation: { venueOrderId: 'wrong' } },
      'VENUE_ORDER_ID_MISMATCH',
    ],
    [
      'not full fill',
      { reconciliation: { classification: 'CANARY_PARTIAL_FILL' } },
      'CANARY_NOT_FULL_FILL_RECONCILED',
    ],
    [
      'transaction identity false',
      { reconciliation: { transactionIdentityMatch: false } },
      'TRANSACTION_IDENTITY_NOT_PROVEN',
    ],
    [
      'finality failed',
      { reconciliation: { transactionFinality: 'FINALIZED_FAILURE' } },
      'TRANSACTION_FINALITY_NOT_SUCCESSFUL',
    ],
    ['maker absent', { reconciliation: { makerStatus: 'NOT_PROVEN' } }, 'MAKER_STATUS_NOT_PROVEN'],
    [
      'fill conservation failed',
      { reconciliation: { fillConservation: 'FAIL' } },
      'FILL_CONSERVATION_FAILED',
    ],
    [
      'position conservation failed',
      { reconciliation: { positionConservation: 'FAIL' } },
      'POSITION_CONSERVATION_FAILED',
    ],
    [
      'remaining quantity',
      { reconciliation: { remainingQuantity: 0.00001 } },
      'REMAINING_QUANTITY_NONZERO',
    ],
    [
      'open order',
      { reconciliation: { openOrderState: 'OPEN_PARTIALLY_FILLED' } },
      'OPEN_ORDER_STILL_PRESENT',
    ],
    ['unknown order', { reconciliation: { unknownOrders: 1 } }, 'UNKNOWN_ORDER_PRESENT'],
    ['unknown fill', { reconciliation: { unknownFills: 1 } }, 'UNKNOWN_FILL_PRESENT'],
    [
      'unrelated activity',
      { reconciliation: { activityExclusivity: false } },
      'ACTIVITY_EXCLUSIVITY_FAILED',
    ],
  ] as const)('%s fails closed', (_name, changes, blocker) => {
    expect(() => build(changes)).toThrow(blocker);
  });

  it('produces deterministic source and canonical manifest hashes', () => {
    const first = build();
    const second = build();
    expect(first).toEqual(second);
    expect(first.sourceArtifacts.handoff.handoffArtifactSha256).toBe(
      createHash('sha256').update(source('handoff.json', handoff).bytes).digest('hex'),
    );
    expect(first.manifestBodyHashSha256).toBe(second.manifestBodyHashSha256);
    expect(canonicalizeDecibelAuthenticatedLiveCanarySuccessV1({ b: 1, a: 2 })).toBe(
      '{"a":2,"b":1}',
    );
  });

  it('is idempotent for identical bytes and rejects conflicts without overwrite', () => {
    const directory = mkdtempSync(join(tmpdir(), 'decibel-success-freeze-'));
    temporary.push(directory);
    const outputPath = join(directory, 'manifest.json');
    const manifest = build();
    expect(
      freezeDecibelAuthenticatedLiveCanarySuccessManifestV1({ manifest, outputPath }).status,
    ).toBe('FROZEN');
    const original = readFileSync(outputPath, 'utf8');
    expect(
      freezeDecibelAuthenticatedLiveCanarySuccessManifestV1({ manifest, outputPath }).status,
    ).toBe('ALREADY_FROZEN');
    writeFileSync(outputPath, '{"conflict":true}\n');
    expect(() =>
      freezeDecibelAuthenticatedLiveCanarySuccessManifestV1({ manifest, outputPath }),
    ).toThrow('AUTHENTICATED_CANARY_SUCCESS_MANIFEST_CONFLICT');
    expect(readFileSync(outputPath, 'utf8')).not.toBe(original);
    expect(readFileSync(outputPath, 'utf8')).toBe('{"conflict":true}\n');
  });
});
