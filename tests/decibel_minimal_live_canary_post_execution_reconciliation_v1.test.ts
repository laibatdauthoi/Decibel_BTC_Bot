import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reconcileDecibelMinimalLiveCanaryPostExecutionV1 } from '../src/decibel_minimal_live_canary_post_execution_reconciliation_v1.js';

const handoff = {
  handoffPackageHash: 'h',
  canaryId: 'c',
  executionSessionId: 's',
  precommittedTransactionHash: null,
  clientOrderId: 'planned-id',
  side: 'BUY',
  price: 100,
  quantity: 0.01,
} as never;
const hash = `0x${'a'.repeat(64)}`;
const actualOrderIdentity = {
  venueOrderId: 'o',
  venueClientOrderId: 'venue-id',
  transactionVersion: 7,
  transactionHash: hash,
} as const;
function reconcile(overrides: Record<string, unknown> = {}) {
  return reconcileDecibelMinimalLiveCanaryPostExecutionV1({
    handoff,
    actualOrderIdentity,
    providedTransactionHash: hash,
    finality: { status: 'FINALIZED_SUCCESS', transactionVersion: 7 },
    captureIdentityMatch: true,
    canonicalTransactionIntentMatch: true,
    orderIdentityMatch: true,
    openOrderIdentityMatch: true,
    fills: [],
    makerStatusProven: false,
    openOrderState: 'ABSENT',
    remainingQuantity: 0,
    endingPosition: 0,
    fillConservation: false,
    positionConservation: false,
    journalReconciliation: true,
    unknownOrders: 0,
    unknownFills: 0,
    unrelatedActivity: false,
    ...overrides,
  });
}
describe('post execution reconciliation', () => {
  it('automatically acquires finality and authenticated state with tx-hash as the only required input', () => {
    const runner = readFileSync(
      new URL(
        '../src/run_decibel_minimal_live_canary_post_execution_reconciliation_v1.ts',
        import.meta.url,
      ),
      'utf8',
    );
    expect(runner).not.toContain('--authenticated-observation');
    expect(runner).toContain("argument('--tx-hash')");
    expect(runner).toContain('userTradeHistory.getByAddr');
    expect(runner).toContain('userOrderHistory.getByAddr');
    expect(runner).toContain('userOpenOrders.getByAddr');
    expect(runner).toContain('userPositions.getByAddr');
    expect(runner).toContain('userActiveTwaps.getByAddr');
    expect(runner).toContain('userBulkOrders.getByAddr');
    expect(runner).toContain('getUiOrderCaptureByHandoffPackageHash');
    expect(runner).toContain('verifyDecibelOperatorUiTransactionIntentV1');
    expect(runner).toContain('CANARY_UI_CAPTURE_REQUIRED');
    expect(runner).toContain('CANARY_CAPTURE_HANDOFF_IDENTITY_CONFLICT');
    expect(runner).not.toContain('JSON.stringify(observedArguments)');
    expect(runner).not.toContain('order.client_order_id === handoff.clientOrderId');
  });
  it('requires a transaction hash', () =>
    expect(() => reconcile({ providedTransactionHash: '' })).toThrow('TRANSACTION_HASH_REQUIRED'));
  it.each([
    ['PENDING', 'CANARY_TRANSACTION_PENDING'],
    ['NOT_FOUND', 'CANARY_TRANSACTION_NOT_FOUND'],
    ['FINALIZED_FAILURE', 'CANARY_TRANSACTION_FAILED'],
  ] as const)('classifies %s', (status, expected) =>
    expect(reconcile({ finality: { status } }).classification).toBe(expected),
  );
  it('reconciles an exact authenticated post-only full fill', () => {
    const result = reconcile({
      fills: [
        {
          source: 'OrderFill',
          tradeId: 't',
          orderId: 'o',
          clientOrderId: 'venue-id',
          size: 0.01,
          price: 100,
          transactionVersion: 1,
          feeAmount: 0.1,
          isRebate: false,
        },
      ],
      makerStatusProven: true,
      fillConservation: true,
      positionConservation: true,
      endingPosition: 0.01,
    });
    expect(result.classification).toBe('CANARY_FULL_FILL_RECONCILED');
    expect(result.canaryReconciled).toBe(true);
    expect(result).toMatchObject({
      plannedClientOrderId: 'planned-id',
      venueClientOrderId: 'venue-id',
      venueOrderId: 'o',
      captureIdentityMatch: true,
      canonicalTransactionIntentMatch: true,
      orderIdentityMatch: true,
    });
    expect(result.mutationCounters.venueMutations).toBe(0);
  });
  it('deduplicates identical fills', () => {
    const fill = {
      source: 'OrderFill',
      tradeId: 't',
      orderId: 'o',
      clientOrderId: 'venue-id',
      size: 0.005,
      price: 100,
      transactionVersion: 1,
      feeAmount: 0,
      isRebate: false,
    };
    expect(
      reconcile({
        fills: [fill, fill],
        openOrderState: 'OPEN_PARTIALLY_FILLED',
        remainingQuantity: 0.005,
      }).authenticatedFillCount,
    ).toBe(1);
  });
  it('classifies partial and unfilled open orders', () => {
    expect(
      reconcile({
        fills: [
          {
            source: 'OrderFill',
            tradeId: 't',
            orderId: 'o',
            clientOrderId: 'venue-id',
            size: 0.005,
            price: 100,
            transactionVersion: 1,
            feeAmount: 0,
            isRebate: false,
          },
        ],
        openOrderState: 'OPEN_PARTIALLY_FILLED',
        remainingQuantity: 0.005,
      }).classification,
    ).toBe('CANARY_PARTIAL_FILL');
    expect(
      reconcile({ openOrderState: 'OPEN_UNFILLED', remainingQuantity: 0.01 }).classification,
    ).toBe('CANARY_UNFILLED_OPEN_ORDER');
  });
  it('fails ambiguous on wrong lineage or unrelated activity', () => {
    const fill = {
      source: 'OrderFill',
      tradeId: 't',
      orderId: 'o',
      clientOrderId: 'wrong',
      size: 0.01,
      price: 100,
      transactionVersion: 1,
      feeAmount: 0,
      isRebate: false,
    };
    expect(reconcile({ fills: [fill] }).classification).toBe('CANARY_STATE_AMBIGUOUS');
    expect(reconcile({ unknownOrders: 1 }).classification).toBe('CANARY_STATE_AMBIGUOUS');
    expect(reconcile({ unknownFills: 1 }).classification).toBe('CANARY_STATE_AMBIGUOUS');
  });

  it('fails closed for captured transaction hash/version and identity mismatches', () => {
    expect(reconcile({ providedTransactionHash: `0x${'b'.repeat(64)}` }).classification).toBe(
      'CANARY_STATE_AMBIGUOUS',
    );
    expect(
      reconcile({ finality: { status: 'FINALIZED_SUCCESS', transactionVersion: 8 } })
        .classification,
    ).toBe('CANARY_STATE_AMBIGUOUS');
    expect(reconcile({ captureIdentityMatch: false }).classification).toBe(
      'CANARY_STATE_AMBIGUOUS',
    );
    expect(reconcile({ canonicalTransactionIntentMatch: false }).classification).toBe(
      'CANARY_STATE_AMBIGUOUS',
    );
  });

  it('uses captured venue identity for fills rather than the planned client ID', () => {
    const fill = {
      source: 'OrderFill',
      tradeId: 'venue-fill',
      orderId: 'o',
      clientOrderId: 'venue-id',
      size: 0.005,
      price: 100,
      transactionVersion: 8,
      feeAmount: 0,
      isRebate: false,
    };
    expect(
      reconcile({
        fills: [fill],
        openOrderState: 'OPEN_PARTIALLY_FILLED',
        remainingQuantity: 0.005,
      }).classification,
    ).toBe('CANARY_PARTIAL_FILL');
    expect(reconcile({ fills: [{ ...fill, clientOrderId: 'planned-id' }] }).classification).toBe(
      'CANARY_STATE_AMBIGUOUS',
    );
    expect(reconcile({ fills: [{ ...fill, orderId: 'other' }] }).classification).toBe(
      'CANARY_STATE_AMBIGUOUS',
    );
  });

  it('classifies the current captured canary identity as open and unfilled when evidence says so', () => {
    const currentHash = '0xfd21bd8b9e1da7f7debb2065d67a53b0ba55f7ee63e7858b2b8f5bdf925777f5';
    const result = reconcile({
      actualOrderIdentity: {
        venueOrderId: '170141599249866108485528702512416161792',
        venueClientOrderId: '64585957f9134b3e8d6ee952e9122535',
        transactionVersion: 7036650897,
        transactionHash: currentHash,
      },
      providedTransactionHash: currentHash,
      finality: { status: 'FINALIZED_SUCCESS', transactionVersion: 7036650897 },
      openOrderState: 'OPEN_UNFILLED',
      remainingQuantity: 0.01,
    });
    expect(result).toMatchObject({
      classification: 'CANARY_UNFILLED_OPEN_ORDER',
      plannedClientOrderId: 'planned-id',
      venueClientOrderId: '64585957f9134b3e8d6ee952e9122535',
      venueOrderId: '170141599249866108485528702512416161792',
      capturedTransactionVersion: 7036650897,
      capturedTransactionHash: currentHash,
      canaryReconciled: false,
    });
  });
});
