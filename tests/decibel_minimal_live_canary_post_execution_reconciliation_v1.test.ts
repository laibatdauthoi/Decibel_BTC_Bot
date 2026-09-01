import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reconcileDecibelMinimalLiveCanaryPostExecutionV1 } from '../src/decibel_minimal_live_canary_post_execution_reconciliation_v1.js';

const handoff = {
  handoffPackageHash: 'h',
  canaryId: 'c',
  executionSessionId: 's',
  precommittedTransactionHash: null,
  clientOrderId: 'id',
  side: 'BUY',
  price: 100,
  quantity: 0.01,
} as never;
const hash = `0x${'a'.repeat(64)}`;
function reconcile(overrides: Record<string, unknown> = {}) {
  return reconcileDecibelMinimalLiveCanaryPostExecutionV1({
    handoff,
    providedTransactionHash: hash,
    finality: { status: 'FINALIZED_SUCCESS' },
    transactionIdentityMatch: true,
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
          clientOrderId: 'id',
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
    expect(result.mutationCounters.venueMutations).toBe(0);
  });
  it('deduplicates identical fills', () => {
    const fill = {
      source: 'OrderFill',
      tradeId: 't',
      orderId: 'o',
      clientOrderId: 'id',
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
            clientOrderId: 'id',
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
  });
});
