import { describe, expect, it } from 'vitest';

import { resolveDecibelAuthenticatedRecyclingFillLineageV1 } from '../src/decibel_authenticated_recycling_fill_lineage_v1.js';

const BTC = '0xbtc';
const DELL = '0xdell';
const frozen = {
  fillIds: ['frozen-trade'],
  venueOrderId: 'frozen-order',
  venueClientOrderId: 'frozen-client',
  side: 'BUY' as const,
  marketAddress: BTC,
};
const baseTrade = {
  tradeId: 'trade',
  orderId: 'order',
  clientOrderId: null,
  size: 0.0001,
  price: 80_000,
  transactionVersion: 1,
  source: 'OrderFill',
};

function resolve(
  changes: Partial<Parameters<typeof resolveDecibelAuthenticatedRecyclingFillLineageV1>[0]> = {},
) {
  return resolveDecibelAuthenticatedRecyclingFillLineageV1({
    btcMarketAddress: BTC,
    frozen,
    knownRecyclingOrders: [],
    orderHistory: [],
    tradeHistory: [],
    ...changes,
  });
}

describe('DECIBEL AUTHENTICATED RECYCLING MARKET-SCOPED ACTIVITY FIX V1', () => {
  it('includes only the exact frozen BTC fill with its frozen side', () => {
    const result = resolve({
      tradeHistory: [
        {
          ...baseTrade,
          tradeId: 'frozen-trade',
          orderId: 'frozen-order',
          clientOrderId: 'frozen-client',
        },
      ],
    });
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]).toMatchObject({ side: 'BUY', orderId: 'frozen-order' });
    expect(result.lineageBlockers).toEqual([]);
  });

  it('excludes a proven foreign-market DELL fill from the BTC ledger', () => {
    const result = resolve({
      orderHistory: [{ orderId: 'dell-order', marketAddress: DELL }],
      tradeHistory: [{ ...baseTrade, tradeId: 'dell-trade', orderId: 'dell-order' }],
    });
    expect(result.fills).toEqual([]);
    expect(result.foreignMarketFillIds).toEqual(['dell-trade']);
    expect(result.lineageBlockers).toEqual([]);
  });

  it('uses captured venue order identity and handoff side without a client-prefix heuristic', () => {
    const result = resolve({
      knownRecyclingOrders: [
        {
          orderId: 'venue-order',
          clientOrderId: 'venue-client-different-from-planned',
          side: 'SELL',
          marketAddress: BTC,
        },
      ],
      tradeHistory: [{ ...baseTrade, orderId: 'venue-order', clientOrderId: null }],
    });
    expect(result.fills[0]).toMatchObject({
      orderId: 'venue-order',
      clientOrderId: 'venue-client-different-from-planned',
      side: 'SELL',
    });
    expect(result.lineageBlockers).toEqual([]);
  });

  it('never defaults an unproven fill to the frozen canary side', () => {
    const result = resolve({ tradeHistory: [baseTrade] });
    expect(result.fills).toEqual([]);
    expect(result.lineageBlockers).toEqual(['AUTHENTICATED_RECYCLING_FILL_LINEAGE_UNPROVEN']);
    expect(result.unprovenFillIds).toEqual(['trade']);
  });

  it('blocks a BTC fill whose order identity is not a captured recycling order', () => {
    const result = resolve({
      orderHistory: [{ orderId: 'order', marketAddress: BTC }],
      tradeHistory: [baseTrade],
    });
    expect(result.fills).toEqual([]);
    expect(result.lineageBlockers).toEqual(['AUTHENTICATED_RECYCLING_UNEXPLAINED_BTC_FILL']);
    expect(result.unexplainedBtcFillIds).toEqual(['trade']);
  });

  it('rejects a near-match frozen fill with the wrong client identity', () => {
    const result = resolve({
      tradeHistory: [
        {
          ...baseTrade,
          tradeId: 'frozen-trade',
          orderId: 'frozen-order',
          clientOrderId: 'wrong-client',
        },
      ],
    });
    expect(result.fills).toEqual([]);
    expect(result.lineageBlockers).toEqual(['AUTHENTICATED_RECYCLING_FILL_LINEAGE_UNPROVEN']);
  });
});
