import { describe, expect, it } from 'vitest';
import {
  convertOnChainPendingOrderResultToNeutralizationV1,
  proveDecibelOnChainPendingOrderAuthorityV1,
  type decibel_onchain_pending_order_v1,
} from '../src/decibel_onchain_pending_order_authority_proof_v1.js';

const order: decibel_onchain_pending_order_v1 = {
  account: 'sub',
  market: 'btc',
  clientOrderId: 'client-1',
  venueOrderId: 'venue-1',
  side: 'BUY',
  price: '100',
  remainingQuantity: '0.1',
  timeInForce: 'PostOnly',
};

function prove(
  overrides: Partial<Parameters<typeof proveDecibelOnChainPendingOrderAuthorityV1>[0]> = {},
) {
  return proveDecibelOnChainPendingOrderAuthorityV1({
    account: 'sub',
    market: 'btc',
    clientOrderId: 'client-1',
    sourceType: 'APTOS_CHAIN_VIEW',
    viewFunctionIdentity: '0xpackage::pending_orders::synthetic_test_view',
    observedLedgerVersion: 101,
    completenessProof: 'PROVEN',
    readSucceeded: true,
    orders: [],
    ...overrides,
  });
}

describe('Decibel On-Chain Pending-Order Authority Proof V1', () => {
  it('classifies a matching pending order as exposure present', () => {
    expect(prove({ orders: [order] })).toMatchObject({
      exposureClassification: 'ONCHAIN_OPEN_EXPOSURE_PRESENT',
      venueOrderId: 'venue-1',
      noLiveRestingOrderProven: false,
    });
  });

  it('classifies a complete authoritative empty set as no exposure', () => {
    const proof = prove();
    expect(proof).toMatchObject({
      exposureClassification: 'ONCHAIN_NO_OPEN_EXPOSURE',
      noLiveRestingOrderProven: true,
      liveExecutionEnabled: false,
    });
    expect(convertOnChainPendingOrderResultToNeutralizationV1(proof)).toMatchObject({
      result: 'NO_OPEN_ORDER_PROVEN',
      authoritative: true,
    });
  });

  it('rejects unexpected dedicated-subaccount orders', () => {
    expect(prove({ orders: [{ ...order, clientOrderId: 'other' }] }).exposureClassification).toBe(
      'SUBACCOUNT_EXCLUSIVITY_VIOLATION',
    );
  });

  it.each([{ account: 'wrong' }, { market: 'wrong' }])(
    'rejects a wrong-scope row: $account $market',
    (change) => {
      expect(prove({ orders: [{ ...order, ...change }] }).exposureClassification).toBe(
        'ONCHAIN_IDENTITY_CONFLICT',
      );
    },
  );

  it('rejects conflicting venue identities for one client ID', () => {
    expect(
      prove({ orders: [order, { ...order, venueOrderId: 'venue-2' }] }).exposureClassification,
    ).toBe('ONCHAIN_IDENTITY_CONFLICT');
  });

  it.each([
    { completenessProof: 'UNPROVEN' as const },
    { readSucceeded: false },
    { sourceType: 'OFFCHAIN_INDEX' as const },
  ])('fails closed when chain authority is unavailable', (change) => {
    expect(prove(change).exposureClassification).toBe('ONCHAIN_EXPOSURE_STATE_UNKNOWN');
  });

  it('requires an observation at least as new as finalized cancellation', () => {
    expect(prove({ finalizedCancelTransactionVersion: 102 }).exposureClassification).toBe(
      'ONCHAIN_EXPOSURE_STATE_UNKNOWN',
    );
    expect(prove({ finalizedCancelTransactionVersion: 101 }).exposureClassification).toBe(
      'ONCHAIN_NO_OPEN_EXPOSURE',
    );
  });

  it('lets proven chain state win while recording REST/WS divergence', () => {
    expect(
      prove({ restReportsMatchingOrder: true, websocketReportsMatchingOrder: true }),
    ).toMatchObject({
      exposureClassification: 'ONCHAIN_NO_OPEN_EXPOSURE',
      restIndexDivergence: true,
      websocketIndexDivergence: true,
    });
    expect(prove({ orders: [order], restReportsMatchingOrder: false }).restIndexDivergence).toBe(
      true,
    );
  });

  it('never lets REST absence override chain-present state', () => {
    expect(prove({ orders: [order], restReportsMatchingOrder: false }).exposureClassification).toBe(
      'ONCHAIN_OPEN_EXPOSURE_PRESENT',
    );
  });
});
