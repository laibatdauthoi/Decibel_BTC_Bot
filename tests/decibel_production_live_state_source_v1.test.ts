import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from '../src/decibel_minimal_live_canary_v1.js';
import { evaluateDecibelAuthenticatedPassiveRecyclingV1 } from '../src/decibel_authenticated_passive_recycling_orchestrator_v1.js';
import {
  DECIBEL_MAX_HISTORY_RANGE_MS,
  createDecibelProductionLiveStateSourceV1,
  type DecibelProductionLiveAuthenticatedReaderV1,
} from '../src/decibel_production_live_state_source_v1.js';

const environment = {
  DECIBEL_NETWORK: 'mainnet',
  DECIBEL_SUBACCOUNT_ADDRESS: 'subaccount',
};
const HANDOFF_CREATED_AT = 1_788_297_744_720;
const NOW = HANDOFF_CREATED_AT + 1_000;

function makeReader(
  overrides: Partial<DecibelProductionLiveAuthenticatedReaderV1> = {},
): DecibelProductionLiveAuthenticatedReaderV1 {
  return {
    readAccountOverview: () => Promise.resolve({ perp_equity_balance: 8, total_margin: 0 }),
    readPositions: () => Promise.resolve([]),
    readOpenOrders: () => Promise.resolve([]),
    readOrderHistory: () => Promise.resolve([]),
    readTradeHistory: () => Promise.resolve([]),
    readActiveTwaps: () => Promise.resolve([]),
    readBulkOrders: () => Promise.resolve([]),
    readMarketMetadata: () =>
      Promise.resolve({
        symbol: 'BTC/USD',
        exchangeSymbol: 'BTC-USD',
        marketAddress: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
        sizeDecimals: 5,
        priceDecimals: 1,
        tickSize: 0.1,
        minimumSize: 0.001,
        lotSize: 0.001,
        maximumLeverage: 50,
        maximumOpenInterest: 1_000,
        mode: 'Open',
      }),
    readCurrentBook: () =>
      Promise.resolve({
        market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
        best_bid: 100,
        best_ask: 100.2,
        unix_ms: NOW,
      }),
    ...overrides,
  };
}

describe('Decibel production live state source V1', () => {
  it('returns a valid flat BTC/USD snapshot', async () => {
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader(),
      getNow: () => NOW,
    });
    await expect(source.readAuthenticatedSnapshot()).resolves.toMatchObject({
      input: {
        configuredSubaccount: 'subaccount',
        actualInventoryBase: 0,
        openOrders: [],
        activeTwapCount: 0,
        activeTpSlCount: 0,
        activeBulkOrderCount: 0,
      },
      availableMarginUsd: 8,
      maximumEffectiveLeverage: 1,
    });
  });

  it('caps configured effective leverage at the authenticated market maximum', async () => {
    const source = createDecibelProductionLiveStateSourceV1({
      environment: { ...environment, MAX_EFFECTIVE_LEVERAGE: '40' },
      reader: makeReader(),
      getNow: () => NOW,
    });

    await expect(source.readAuthenticatedSnapshot()).resolves.toMatchObject({
      availableMarginUsd: 8,
      maximumEffectiveLeverage: 40,
    });
  });

  it('surfaces BTC position, order and activity while ignoring foreign orders', async () => {
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readPositions: () =>
          Promise.resolve([
            {
              market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
              user: 'subaccount',
              size: 0.001,
              tp_order_id: 'tp',
              sl_order_id: null,
            },
          ]),
        readOpenOrders: () =>
          Promise.resolve([
            {
              market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
              order_id: 'btc-order',
              client_order_id: `dpvr1-b-1-${'a'.repeat(32)}`,
              orig_size: 0.001,
              remaining_size: 0.001,
              price: 100,
              is_buy: true,
              is_tpsl: false,
            },
            {
              market: 'foreign-market',
              order_id: 'foreign-order',
              client_order_id: null,
              orig_size: 1,
              remaining_size: 1,
              price: 1,
              is_buy: true,
              is_tpsl: false,
            },
          ]),
        readActiveTwaps: () => Promise.resolve([{ market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 }]),
        readBulkOrders: () =>
          Promise.resolve([
            {
              market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
              sequence_number: 1,
              previous_seq_num: 0,
              bid_prices: [99],
              bid_sizes: [0.001],
              ask_prices: [],
              ask_sizes: [],
              cancelled_bid_prices: [],
              cancelled_bid_sizes: [],
              cancelled_ask_prices: [],
              cancelled_ask_sizes: [],
            },
          ]),
      }),
      getNow: () => NOW,
    });
    const snapshot = await source.readAuthenticatedSnapshot();
    expect(snapshot.input.actualInventoryBase).toBe(0.001);
    expect(snapshot.input.openOrders.map((order) => order.venueOrderId)).toEqual(['btc-order']);
    expect(snapshot.input.activeTwapCount).toBe(1);
    expect(snapshot.input.activeTpSlCount).toBe(1);
    expect(snapshot.input.activeBulkOrderCount).toBe(1);
  });

  it('excludes foreign-market orders, positions, fills, TWAPs and bulk activity from BTC exclusivity', async () => {
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readPositions: () =>
          Promise.resolve([
            {
              market: 'DELL/USD',
              user: 'foreign-position-owner',
              size: 10,
              tp_order_id: 'dell-tp',
              sl_order_id: 'dell-sl',
            },
          ]),
        readOpenOrders: () =>
          Promise.resolve([
            {
              market: 'DELL/USD',
              order_id: 'dell-order',
              client_order_id: null,
              orig_size: 10,
              remaining_size: 10,
              price: 20,
              is_buy: true,
              is_tpsl: false,
            },
          ]),
        readTradeHistory: () =>
          Promise.resolve([
            {
              account: 'subaccount',
              market: 'DELL/USD',
              source: 'OrderFill',
              trade_id: 'dell-fill',
              size: 10,
              price: 20,
              fee_amount: 0,
              is_rebate: false,
              order_id: 'dell-order',
              transaction_unix_ms: NOW - 1,
            },
          ]),
        readActiveTwaps: () => Promise.resolve([{ market: 'DELL/USD' }]),
        readBulkOrders: () =>
          Promise.resolve([
            {
              market: 'DELL/USD',
              sequence_number: 1,
              previous_seq_num: 0,
              bid_prices: [20],
              bid_sizes: [10],
              ask_prices: [],
              ask_sizes: [],
              cancelled_bid_prices: [],
              cancelled_bid_sizes: [],
              cancelled_ask_prices: [],
              cancelled_ask_sizes: [],
            },
          ]),
      }),
      getNow: () => NOW,
    });
    const snapshot = await source.readAuthenticatedSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input);

    expect(snapshot.input).toMatchObject({
      actualInventoryBase: 0,
      openOrders: [],
      activeTwapCount: 0,
      activeTpSlCount: 0,
      activeBulkOrderCount: 0,
      manualOrDelegatedActivityCount: 0,
    });
    expect(evaluation.blockers).not.toContain('STRATEGY_ACTIVITY_EXCLUSIVITY_LOST');
    expect(evaluation.blockers).not.toContain('UNRESOLVED_EXTERNAL_ORDER_ACTIVITY');
  });

  it('normalizes canonical market case and preserves safe raw identity diagnostics', async () => {
    const upperMarket = DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1.toUpperCase().replace('0X', '0x');
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readPositions: () =>
          Promise.resolve([
            {
              market: upperMarket,
              user: 'subaccount',
              size: 0,
              tp_order_id: null,
              sl_order_id: null,
            },
          ]),
        readOpenOrders: () =>
          Promise.resolve([
            {
              market: 'DELL/USD',
              market_address: '0xdell',
              order_id: 'dell-order',
              client_order_id: null,
              orig_size: 1,
              remaining_size: 1,
              price: 1,
              is_buy: true,
              is_tpsl: false,
            },
          ]),
      }),
      getNow: () => NOW,
    });

    const snapshot = await source.readAuthenticatedSnapshot();

    expect(snapshot.input.actualInventoryBase).toBe(0);
    expect(snapshot.input.openOrders).toEqual([]);
    expect(snapshot.marketScopeDiagnostics).toEqual({
      rawPositionMarketIdentities: [{ market: upperMarket, marketAddress: null, marketId: null }],
      rawOpenOrderMarketIdentities: [
        { market: 'DELL/USD', marketAddress: '0xdell', marketId: null },
      ],
      rawFillMarketIdentities: [],
      rawTwapMarketIdentities: [],
      rawTpSlMarketIdentities: [],
      historicalOutOfBandBTCFillCount: 0,
      activeTwapCount: 0,
      activeTpSlCount: 0,
      activeBulkOrderCount: 0,
    });
  });

  it('attributes only known strategy OrderFill rows to strategy maker volume', async () => {
    const strategyClientId = `dpvr1-b-1-${'b'.repeat(32)}`;
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readOrderHistory: () =>
          Promise.resolve([
            {
              market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
              client_order_id: strategyClientId,
              order_id: 'known',
              orig_size: 0.001,
              price: 100,
              is_buy: true,
            },
          ]),
        readTradeHistory: () =>
          Promise.resolve([
            {
              account: 'subaccount',
              market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
              source: 'OrderFill',
              trade_id: 'known-fill',
              size: 0.001,
              price: 100,
              fee_amount: 0,
              is_rebate: false,
              order_id: 'known',
              transaction_unix_ms: 900,
              client_order_id: strategyClientId,
            },
            {
              account: 'subaccount',
              market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
              source: 'OrderFill',
              trade_id: 'manual-fill',
              size: 0.001,
              price: 101,
              fee_amount: 0,
              is_rebate: false,
              order_id: 'manual',
              transaction_unix_ms: 901,
            },
          ]),
      }),
      getNow: () => NOW,
    });
    const snapshot = await source.readAuthenticatedSnapshot();
    expect(snapshot.input.actualFillLedger.fills.map((fill) => fill.venueFillId)).toEqual([
      'known-fill',
    ]);
    expect(snapshot.input.actualFillLedger.actualExternalMakerVolumeUsd).toBe(0.1);
    expect(snapshot.input.manualOrDelegatedActivityCount).toBe(0);
    expect(snapshot.marketScopeDiagnostics?.historicalOutOfBandBTCFillCount).toBe(1);
    expect(evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input).blockers).not.toContain(
      'STRATEGY_ACTIVITY_EXCLUSIVITY_LOST',
    );
  });

  it('ignores inactive BTC TWAP history during active exclusivity evaluation', async () => {
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readActiveTwaps: () =>
          Promise.resolve([
            { market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1, is_active: false },
            { market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1, status: 'COMPLETED' },
          ]),
      }),
      getNow: () => NOW,
    });

    const snapshot = await source.readAuthenticatedSnapshot();

    expect(snapshot.input.activeTwapCount).toBe(0);
    expect(snapshot.marketScopeDiagnostics?.rawTwapMarketIdentities).toHaveLength(2);
    expect(evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input).blockers).not.toContain(
      'STRATEGY_ACTIVITY_EXCLUSIVITY_LOST',
    );
  });

  it('does not classify the frozen historical maker fill as current unrelated activity', async () => {
    const venueOrderId = '170141599249866108485528702512416161792';
    const venueClientOrderId = '64585957f9134b3e8d6ee952e9122535';
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readOrderHistory: () =>
          Promise.resolve([
            {
              market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
              client_order_id: venueClientOrderId,
              order_id: venueOrderId,
              orig_size: 0.00027,
              price: 76_916.9,
              is_buy: true,
            },
          ]),
        readTradeHistory: (_subaccount, startTimestamp) =>
          Promise.resolve(
            [
              {
                account: 'subaccount',
                market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
                source: 'OrderFill' as const,
                trade_id: 'pre-handoff-account-fill',
                size: 0.00356,
                price: 77_355.5,
                fee_amount: 0,
                is_rebate: false,
                order_id: 'pre-handoff-order',
                transaction_unix_ms: HANDOFF_CREATED_AT - 1,
                client_order_id: '594d6d4ba7bef28228071f8aafb298d6',
              },
              {
                account: 'subaccount',
                market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
                source: 'OrderFill',
                trade_id: '128861549622277478047068807757829',
                size: 0.00027,
                price: 76_916.9,
                fee_amount: 0.003115,
                is_rebate: false,
                order_id: venueOrderId,
                transaction_unix_ms: HANDOFF_CREATED_AT + 1,
                client_order_id: venueClientOrderId,
              },
            ].filter((trade) => trade.transaction_unix_ms >= startTimestamp),
          ),
      }),
      getNow: () => NOW,
    });
    const snapshot = await source.readAuthenticatedSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input);
    expect(snapshot.input.actualInventoryBase).toBe(0);
    expect(snapshot.input.actualFillLedger.actualExternalMakerVolumeUsd).toBe(20.767563);
    expect(snapshot.input.manualOrDelegatedActivityCount).toBe(0);
    expect(evaluation.blockers).not.toContain('STRATEGY_ACTIVITY_EXCLUSIVITY_LOST');
  });

  it('keeps semantic identity stable across local read timestamps', async () => {
    let now = NOW;
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader(),
      getNow: () => now++,
    });
    const first = await source.readAuthenticatedSnapshot();
    const second = await source.readAuthenticatedSnapshot();
    expect(second.input.now).not.toBe(first.input.now);
    expect(second.sourceStateHash).toBe(first.sourceStateHash);
  });

  it('changes semantic identity when position changes', async () => {
    let size = 0;
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readPositions: () =>
          Promise.resolve(
            size === 0
              ? []
              : [
                  {
                    market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
                    user: 'subaccount',
                    size,
                    tp_order_id: null,
                    sl_order_id: null,
                  },
                ],
          ),
      }),
      getNow: () => NOW,
    });
    const first = await source.readAuthenticatedSnapshot();
    size = 0.001;
    const second = await source.readAuthenticatedSnapshot();
    expect(second.sourceStateHash).not.toBe(first.sourceStateHash);
  });

  it('fails closed on read, market and subaccount mismatch', async () => {
    const failed = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({ readOpenOrders: () => Promise.reject(new Error('network secret')) }),
      getNow: () => NOW,
    });
    await expect(failed.readAuthenticatedSnapshot()).rejects.toThrow(
      'PRODUCTION_AUTHENTICATED_READ_REQUIRED',
    );
    const wrongMarket = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readMarketMetadata: async () => ({
          ...(await makeReader().readMarketMetadata()),
          marketAddress: 'wrong-market',
        }),
      }),
      getNow: () => NOW,
    });
    await expect(wrongMarket.readAuthenticatedSnapshot()).rejects.toThrow(
      'PRODUCTION_LIVE_SOURCE_MARKET_MISMATCH',
    );
    const wrongAccount = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readPositions: () =>
          Promise.resolve([
            {
              market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
              user: 'other',
              size: 0,
              tp_order_id: null,
              sl_order_id: null,
            },
          ]),
      }),
      getNow: () => NOW,
    });
    await expect(wrongAccount.readAuthenticatedSnapshot()).rejects.toThrow(
      'PRODUCTION_LIVE_SOURCE_SUBACCOUNT_MISMATCH',
    );
  });

  it('supports read-only recovery reconciliation from changed order state', async () => {
    let open = false;
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readOpenOrders: () =>
          Promise.resolve(
            open
              ? [
                  {
                    market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
                    order_id: 'new-order',
                    client_order_id: `dpvr1-b-1-${'c'.repeat(32)}`,
                    orig_size: 0.001,
                    remaining_size: 0.001,
                    price: 100,
                    is_buy: true,
                    is_tpsl: false,
                  },
                ]
              : [],
          ),
      }),
      getNow: () => NOW,
    });
    await source.readAuthenticatedSnapshot();
    open = true;
    const current = await source.readAuthenticatedSnapshot();
    await expect(source.reconcileIntent('intent', current)).resolves.toBe('ORDER_OPEN');
  });

  it('attributes a completed fill to the exact recovered venue order', async () => {
    const clientOrderId = `d1b${'a'.repeat(29)}`;
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readOrderHistory: () =>
          Promise.resolve([
            {
              market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
              client_order_id: clientOrderId,
              order_id: 'filled-order',
              orig_size: 0.001,
              price: 100,
              is_buy: true,
            },
          ]),
        readTradeHistory: () =>
          Promise.resolve([
            {
              account: 'subaccount',
              market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
              source: 'OrderFill',
              trade_id: 'fill-one',
              size: 0.001,
              price: 100,
              fee_amount: 0,
              is_rebate: false,
              order_id: 'filled-order',
              transaction_unix_ms: NOW - 1,
              client_order_id: clientOrderId,
            },
          ]),
      }),
      getNow: () => NOW,
    });
    const snapshot = await source.readAuthenticatedSnapshot();

    await expect(source.reconcileIntent('intent', snapshot, 'filled-order')).resolves.toBe(
      'FULL_FILL',
    );
  });

  it('attributes disappearance without a fill to exact external cancellation', async () => {
    const clientOrderId = `d1s${'b'.repeat(29)}`;
    let open = true;
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readOpenOrders: () =>
          Promise.resolve(
            open
              ? [
                  {
                    market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
                    order_id: 'cancelled-order',
                    client_order_id: clientOrderId,
                    orig_size: 0.001,
                    remaining_size: 0.001,
                    price: 100.2,
                    is_buy: false,
                    is_tpsl: false,
                  },
                ]
              : [],
          ),
      }),
      getNow: () => NOW,
    });
    await source.readAuthenticatedSnapshot();
    open = false;
    const snapshot = await source.readAuthenticatedSnapshot();

    await expect(source.reconcileIntent('intent', snapshot, 'cancelled-order')).resolves.toBe(
      'ORDER_CANCELLED',
    );
  });

  it('bounds authenticated history reads to the Decibel maximum range', async () => {
    const now = HANDOFF_CREATED_AT + 10_000;
    const calls: Array<readonly [number, number]> = [];
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readOrderHistory: (_subaccount, startTimestamp, endTimestamp) => {
          calls.push([startTimestamp, endTimestamp]);
          return Promise.resolve([]);
        },
        readTradeHistory: (_subaccount, startTimestamp, endTimestamp) => {
          calls.push([startTimestamp, endTimestamp]);
          return Promise.resolve([]);
        },
        readCurrentBook: () =>
          Promise.resolve({
            market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
            best_bid: 100,
            best_ask: 100.2,
            unix_ms: now,
          }),
      }),
      getNow: () => now,
    });
    await source.readAuthenticatedSnapshot();
    expect(calls).toEqual([
      [HANDOFF_CREATED_AT, now],
      [HANDOFF_CREATED_AT, now],
    ]);
    expect(calls.every(([start, end]) => end - start < DECIBEL_MAX_HISTORY_RANGE_MS)).toBe(true);
  });

  it('fails closed on stale authenticated book data', async () => {
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader(),
      getNow: () => NOW + 6_000,
    });
    await expect(source.readAuthenticatedSnapshot()).rejects.toThrow(
      'PRODUCTION_LIVE_SOURCE_BOOK_STALE',
    );
  });

  it('can prove an existing open order during restart reconciliation', async () => {
    const source = createDecibelProductionLiveStateSourceV1({
      environment,
      reader: makeReader({
        readOpenOrders: () =>
          Promise.resolve([
            {
              market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
              order_id: 'existing-order',
              client_order_id: `dpvr1-b-1-${'d'.repeat(32)}`,
              orig_size: 0.001,
              remaining_size: 0.001,
              price: 100,
              is_buy: true,
              is_tpsl: false,
            },
          ]),
      }),
      getNow: () => NOW,
    });
    const snapshot = await source.readAuthenticatedSnapshot();
    await expect(source.reconcileIntent('pending-intent', snapshot)).resolves.toBe('ORDER_OPEN');
  });

  it('contains no writer, signer or venue mutation dependency', () => {
    const sourceText = readFileSync(
      new URL('../src/decibel_production_live_state_source_v1.ts', import.meta.url),
      'utf8',
    );
    expect(sourceText).not.toMatch(/DecibelWriteDex|placePostOnlyLimit|cancelExactOrder/);
    expect(sourceText).not.toMatch(/privateKey|signTransaction|submitTransaction/);
  });
});
