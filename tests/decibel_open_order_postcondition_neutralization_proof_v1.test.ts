import { describe, expect, it } from 'vitest';
import {
  convertOpenOrderPostconditionToNeutralizationV1,
  proveDecibelOpenOrderPostconditionNeutralizationV1,
  type decibel_open_order_row_v1,
  type decibel_open_order_snapshot_v1,
} from '../src/decibel_open_order_postcondition_neutralization_proof_v1.js';

const row: decibel_open_order_row_v1 = {
  account: 'sub',
  market: 'btc',
  venueOrderId: 'venue-1',
  clientOrderId: 'client-1',
  remainingSize: '0.1',
  transactionVersion: 10,
};
function snapshot(
  rows: readonly decibel_open_order_row_v1[],
  overrides: Partial<decibel_open_order_snapshot_v1> = {},
): decibel_open_order_snapshot_v1 {
  return {
    account: 'sub',
    market: 'btc',
    observedAt: 100,
    pages: [{ account: 'sub', offset: 0, limit: 100, totalCount: rows.length, rows }],
    completeness: 'PROVEN',
    visibility: 'AUTHORITATIVE_CURRENT',
    ...overrides,
  };
}
function prove(before: decibel_open_order_snapshot_v1, after = before) {
  return proveDecibelOpenOrderPostconditionNeutralizationV1({
    account: 'sub',
    market: 'btc',
    clientOrderId: 'client-1',
    before,
    after,
  });
}

describe('Decibel Open-Order Postcondition Neutralization Proof V1', () => {
  it('proves a stable matching open order is present', () => {
    expect(prove(snapshot([row]))).toMatchObject({
      classification: 'OPEN_EXPOSURE_PRESENT',
      matchingVenueOrderId: 'venue-1',
      noLiveRestingOrderProven: false,
    });
  });
  it('proves stable authoritative complete absence neutralizes exposure', () => {
    const proof = prove(snapshot([]));
    expect(proof).toMatchObject({
      classification: 'OPEN_EXPOSURE_NEUTRALIZED',
      noLiveRestingOrderProven: true,
      liveExecutionEnabled: false,
    });
    expect(convertOpenOrderPostconditionToNeutralizationV1(proof)).toMatchObject({
      result: 'NO_OPEN_ORDER_PROVEN',
      authoritative: true,
    });
  });
  it.each(['completeness', 'visibility'] as const)('fails closed when %s is unproven', (field) => {
    const value = field === 'completeness' ? 'UNPROVEN' : 'UNPROVEN';
    expect(prove(snapshot([], { [field]: value }))).toMatchObject({
      classification: 'OPEN_EXPOSURE_STATE_UNKNOWN',
      noLiveRestingOrderProven: false,
    });
  });
  it('fails closed for an incomplete pagination walk', () => {
    const incomplete = snapshot([row], {
      pages: [{ account: 'sub', offset: 0, limit: 1, totalCount: 2, rows: [row] }],
    });
    expect(prove(incomplete).classification).toBe('OPEN_EXPOSURE_STATE_UNKNOWN');
  });
  it('walks every contiguous page before proving absence or presence', () => {
    const paged = snapshot([row], {
      pages: [
        { account: 'sub', offset: 0, limit: 1, totalCount: 1, rows: [row] },
        { account: 'sub', offset: 1, limit: 1, totalCount: 1, rows: [] },
      ],
    });
    expect(prove(paged)).toMatchObject({
      classification: 'OPEN_EXPOSURE_PRESENT',
      pagesRead: 4,
      beforeExposureState: 'OPEN_ORDER_PRESENT',
      snapshotStability: 'STABLE',
    });
  });
  it('rejects identity conflicts and multiple venue identities', () => {
    expect(prove(snapshot([], { account: 'other' })).classification).toBe('IDENTITY_CONFLICT');
    expect(prove(snapshot([row, { ...row, venueOrderId: 'venue-2' }])).classification).toBe(
      'IDENTITY_CONFLICT',
    );
  });
  it('rejects unexpected dedicated-subaccount orders', () => {
    expect(prove(snapshot([{ ...row, clientOrderId: 'other' }])).classification).toBe(
      'SUBACCOUNT_EXCLUSIVITY_VIOLATION',
    );
  });
  it('requires stable presence and identity across the sandwich', () => {
    expect(prove(snapshot([row]), snapshot([])).classification).toBe(
      'OPEN_ORDER_SNAPSHOT_UNSTABLE',
    );
    expect(
      prove(snapshot([row]), snapshot([{ ...row, remainingSize: '0.05' }])).classification,
    ).toBe('OPEN_ORDER_SNAPSHOT_UNSTABLE');
  });
  it('does not treat an unknown snapshot or cancel result as proof', () => {
    const proof = prove(snapshot([], { visibility: 'UNPROVEN' }));
    expect(convertOpenOrderPostconditionToNeutralizationV1(proof)).toMatchObject({
      result: 'CANCEL_RESULT_AMBIGUOUS',
      authoritative: false,
      noLiveRestingOrderProven: false,
    });
  });
  it('retains cancel failure diagnostically while authoritative absence proves the postcondition', () => {
    const absent = snapshot([]);
    const proof = proveDecibelOpenOrderPostconditionNeutralizationV1({
      account: 'sub',
      market: 'btc',
      clientOrderId: 'client-1',
      before: absent,
      after: absent,
      cancelOutcomeDiagnostic: 'NOT_FOUND_UNQUALIFIED',
    });
    expect(proof).toMatchObject({
      classification: 'OPEN_EXPOSURE_NEUTRALIZED',
      cancelOutcomeDiagnostic: 'NOT_FOUND_UNQUALIFIED',
      noLiveRestingOrderProven: true,
    });
  });
});
