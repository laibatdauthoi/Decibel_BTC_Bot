import { describe, expect, it } from 'vitest';

import {
  resolveDecibelBulkOrderActivityV1,
  shouldRunFinalCanaryDryRunPhaseBV1,
  type decibel_bulk_order_record_v1,
} from '../src/decibel_bulk_order_activity_resolution_v1.js';

const account = `0x${'1'.repeat(64)}`;
const market = `0x${'2'.repeat(64)}`;
function record(
  overrides: Partial<decibel_bulk_order_record_v1> = {},
): decibel_bulk_order_record_v1 {
  return {
    user: account,
    market,
    sequence_number: 2,
    previous_seq_num: 1,
    transaction_version: 3,
    transaction_unix_ms: 4,
    bid_prices: [100],
    bid_sizes: [0],
    ask_prices: [101],
    ask_sizes: [0],
    cancelled_bid_prices: [],
    cancelled_bid_sizes: [],
    cancelled_ask_prices: [],
    cancelled_ask_sizes: [],
    ...overrides,
  };
}
function resolve(records: readonly decibel_bulk_order_record_v1[], readSuccessful = true) {
  return resolveDecibelBulkOrderActivityV1({
    configuredSubaccount: account,
    configuredMarket: market,
    records,
    readSuccessful,
  });
}

describe('Decibel bulk-order activity resolution V1', () => {
  it('treats no record and an all-zero historical record as clear', () => {
    expect(resolve([])).toMatchObject({
      classification: 'NO_BULK_ORDER_RECORD',
      bulkOrderActivityClear: true,
    });
    expect(resolve([record({ bid_sizes: ['0.00000'], ask_sizes: ['0'] })])).toMatchObject({
      classification: 'BULK_ORDER_RECORD_INACTIVE',
      activeBulkSize: '0',
      bulkOrderActivityClear: true,
    });
  });

  it.each([
    [[record({ bid_sizes: ['0.00001'] })], '0.00001', '0'],
    [[record({ ask_sizes: ['0.00002'] })], '0', '0.00002'],
    [[record({ bid_sizes: ['0.00001'], ask_sizes: ['0.00002'] })], '0.00001', '0.00002'],
  ] as const)('classifies positive current sizes as active', (records, bid, ask) => {
    expect(resolve(records)).toMatchObject({
      classification: 'BULK_ORDER_ACTIVE_EXPOSURE',
      activeBidSize: bid,
      activeAskSize: ask,
      bulkOrderActivityClear: false,
    });
  });

  it('does not count cancelled arrays as current exposure', () => {
    expect(resolve([record({ cancelled_bid_sizes: [1], cancelled_ask_sizes: [2] })])).toMatchObject(
      { classification: 'BULK_ORDER_RECORD_INACTIVE', activeBulkSize: '0' },
    );
  });

  it('fails malformed shapes, negative size, wrong account, and read failure', () => {
    expect(resolve([record({ bid_prices: [], bid_sizes: [1] })]).classification).toBe(
      'BULK_ORDER_RECORD_MALFORMED',
    );
    expect(resolve([record({ bid_sizes: [-1] })])).toMatchObject({
      classification: 'BULK_ORDER_RECORD_MALFORMED',
      reason: 'BULK_ORDER_SIZE_NEGATIVE_INVALID',
    });
    expect(resolve([record({ user: `0x${'3'.repeat(64)}` })])).toMatchObject({
      classification: 'BULK_ORDER_RECORD_MALFORMED',
      reason: 'BULK_ORDER_ACCOUNT_IDENTITY_MISMATCH',
    });
    expect(resolve([], false).classification).toBe('BULK_ORDER_READ_FAILED');
  });

  it('does not admit another market as BTC activity', () => {
    expect(resolve([record({ market: `0x${'4'.repeat(64)}`, bid_sizes: [1] })])).toMatchObject({
      classification: 'NO_BULK_ORDER_RECORD',
      otherMarketRecordCount: 1,
      activeBulkSize: '0',
    });
  });

  it('gates Phase B on clear bulk activity and explicit side', () => {
    const base = {
      readConnectivityReady: true,
      noOpenPosition: true,
      openOrderCount: 0,
      activeTwapCount: 0,
      bulkOrderActivityClear: true,
      journalHealthy: true,
      canarySideExplicit: true,
    };
    expect(shouldRunFinalCanaryDryRunPhaseBV1(base)).toBe(true);
    expect(shouldRunFinalCanaryDryRunPhaseBV1({ ...base, bulkOrderActivityClear: false })).toBe(
      false,
    );
    expect(shouldRunFinalCanaryDryRunPhaseBV1({ ...base, canarySideExplicit: false })).toBe(false);
  });
});
