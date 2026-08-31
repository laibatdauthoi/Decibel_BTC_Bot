import { describe, expect, it } from 'vitest';
import {
  DecibelPerOrderFillConservationAuditV1,
  createDecibelAuthoritativeOrderExecutionQuantityV1,
  proveDecibelPerOrderFillConservationV1,
  walkDecibelPerOrderTradeHistoryV1,
  type decibel_conservation_trade_row_v1,
  type decibel_per_order_trade_history_walk_v1,
} from '../src/decibel_per_order_fill_conservation_proof_v1.js';

const base = {
  account: 'account',
  market: 'market',
  action: 'OpenLong',
  source: 'OrderFill',
  trade_id: 't1',
  size: '0.3',
  price: '100',
  is_rebate: false,
  fee_amount: 0.01,
  order_id: 'o1',
  transaction_unix_ms: 10,
  transaction_version: 9,
} as const satisfies decibel_conservation_trade_row_v1;

function state(quantity: string, status: 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED' = 'OPEN') {
  return createDecibelAuthoritativeOrderExecutionQuantityV1({
    venueOrderId: 'o1',
    origSize: '1',
    cumulativeExecutedQuantity: quantity,
    evidenceSource: 'EXPLICIT_AUTHENTICATED_CUMULATIVE_FILLED_QUANTITY',
    evidenceVersion: 10,
    observedAt: 11,
    status,
    proofClassification: 'PROVEN',
  });
}

function history(
  rows: readonly decibel_conservation_trade_row_v1[],
  coverage: decibel_per_order_trade_history_walk_v1['pageCoverageStatus'] = 'COMPLETE_SHORT_PAGE',
) {
  return {
    rows,
    pageCount: 1,
    rawRowCount: rows.length,
    duplicateRowCount: 0,
    pageCoverageStatus: coverage,
  } as const;
}

describe('Decibel Per-Order Fill Conservation Proof V1', () => {
  it.each([
    ['1', 'FILLED' as const, [{ ...base, size: '1' }]],
    ['0.3', 'OPEN' as const, [base]],
    ['0.3', 'CANCELLED' as const, [base]],
    ['0', 'CANCELLED' as const, []],
    ['0', 'REJECTED' as const, []],
  ])('matches conservation for %s %s', (quantity, status, rows) => {
    const result = proveDecibelPerOrderFillConservationV1({
      stateBefore: state(quantity, status),
      stateAfter: state(quantity, status),
      history: history(rows),
      orderFillSizeStrictlyPositiveProven: true,
    });
    expect(result.quantityConservationStatus).toBe('QUANTITY_CONSERVATION_MATCH');
    expect(result.executionPriceCompleteness).toBe(true);
    expect(result.fillFeeRecordCompleteness).toBe(true);
    expect(result.feeDenominationCompleteness).toBe(false);
  });

  it('reports missing and excess quantity exactly', () => {
    expect(
      proveDecibelPerOrderFillConservationV1({
        stateBefore: state('0.4'),
        stateAfter: state('0.4'),
        history: history([base]),
        orderFillSizeStrictlyPositiveProven: true,
      }).finalCompletenessClassification,
    ).toBe('INCOMPLETE_MISSING_FILL_QUANTITY');
    expect(
      proveDecibelPerOrderFillConservationV1({
        stateBefore: state('0.2'),
        stateAfter: state('0.2'),
        history: history([base]),
        orderFillSizeStrictlyPositiveProven: true,
      }).finalCompletenessClassification,
    ).toBe('INCONSISTENT_OVERCOUNT');
  });

  it('allows conservation at the offset cap without total_count or fill-increment proof', () => {
    const result = proveDecibelPerOrderFillConservationV1({
      stateBefore: state('0.3'),
      stateAfter: state('0.3'),
      history: history([base], 'TRADE_HISTORY_PAGE_COVERAGE_UNPROVEN'),
      orderFillSizeStrictlyPositiveProven: true,
    });
    expect(result.finalCompletenessClassification).toBe('COMPLETE_BY_QUANTITY_CONSERVATION');
  });

  it('rejects unknown truth, unstable snapshots, nonpositive fills, and future versions', () => {
    expect(() =>
      proveDecibelPerOrderFillConservationV1({
        stateBefore: null,
        stateAfter: null,
        history: history([]),
        orderFillSizeStrictlyPositiveProven: true,
      }),
    ).toThrow('EXECUTED_QUANTITY_TRUTH_UNPROVEN');
    expect(() =>
      proveDecibelPerOrderFillConservationV1({
        stateBefore: state('0.2'),
        stateAfter: state('0.3'),
        history: history([base]),
        orderFillSizeStrictlyPositiveProven: true,
      }),
    ).toThrow('SNAPSHOT_UNSTABLE');
    expect(() =>
      proveDecibelPerOrderFillConservationV1({
        stateBefore: state('0'),
        stateAfter: state('0'),
        history: history([{ ...base, size: '0' }]),
        orderFillSizeStrictlyPositiveProven: true,
      }),
    ).toThrow('SIZE_NOT_POSITIVE');
    expect(() =>
      proveDecibelPerOrderFillConservationV1({
        stateBefore: state('0.3'),
        stateAfter: state('0.3'),
        history: history([{ ...base, transaction_version: 11 }]),
        orderFillSizeStrictlyPositiveProven: true,
      }),
    ).toThrow('FUTURE_TRANSACTION_VERSION');
  });

  it('walks exact independent per-order pages and deduplicates identical trades', async () => {
    const requests: number[] = [];
    const result = await walkDecibelPerOrderTradeHistoryV1({
      account: 'account',
      market: 'market',
      venueOrderId: 'o1',
      startTimestamp: 1,
      endTimestamp: 20,
      fetchPage: (query) => {
        requests.push(query.offset);
        expect(query.order_id).toBe('o1');
        return Promise.resolve(query.offset === 0 ? [base, base] : []);
      },
    });
    expect(requests).toEqual([0]);
    expect(result.rows).toHaveLength(1);
    expect(result.duplicateRowCount).toBe(1);
  });

  it('fails closed for conflicting identities and out-of-scope/public evidence', async () => {
    await expect(
      walkDecibelPerOrderTradeHistoryV1({
        account: 'account',
        market: 'market',
        venueOrderId: 'o1',
        startTimestamp: 1,
        endTimestamp: 20,
        fetchPage: () => Promise.resolve([base, { ...base, size: '0.2' }]),
      }),
    ).rejects.toThrow('TRADE_ID_CONFLICT');
    await expect(
      walkDecibelPerOrderTradeHistoryV1({
        account: 'account',
        market: 'market',
        venueOrderId: 'o1',
        startTimestamp: 1,
        endTimestamp: 20,
        fetchPage: () => Promise.resolve([{ ...base, source: 'MarginCall' }]),
      }),
    ).rejects.toThrow('ROW_OUT_OF_SCOPE');
  });

  it('keeps current Decibel readiness fail-closed', () => {
    expect(DecibelPerOrderFillConservationAuditV1.orderStateCumulativeExecutedQuantity).toBe(
      'UNPROVEN',
    );
    expect(DecibelPerOrderFillConservationAuditV1.orderSizeAmendmentPermitted).toBe(false);
    expect(DecibelPerOrderFillConservationAuditV1.canaryPerOrderHistoryCompleteness).toBe(
      'UNPROVEN',
    );
    expect(DecibelPerOrderFillConservationAuditV1.minimalLiveCanaryReconciliationReady).toBe(false);
    expect(DecibelPerOrderFillConservationAuditV1.liveExecutionEnabled).toBe(false);
  });
});
