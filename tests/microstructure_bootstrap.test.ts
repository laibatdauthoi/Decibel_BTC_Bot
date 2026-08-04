import { describe, expect, it, vi } from 'vitest';

import type { BTC_market_metadata } from '../src/decibel_client.js';
import {
  bootstrapRecentBTCTrades,
  type recent_trade_client,
} from '../src/microstructure_bootstrap.js';
import { microstructure_repository } from '../src/microstructure_repository.js';
import { normalizeRESTTradePage } from '../src/microstructure.js';

const market: BTC_market_metadata = {
  symbol: 'BTC/USD',
  exchangeSymbol: 'BTC-USD',
  marketAddress: '0xbtc',
  sizeDecimals: 4,
  priceDecimals: 2,
  tickSize: 0.5,
  minimumSize: 0.0001,
  lotSize: 0.0005,
  maximumLeverage: 20,
  maximumOpenInterest: 1_000,
  mode: 'Open',
};

function makeTrade(index: number): object {
  return {
    trade_id: String(10_000 + index),
    account: `participant-${index}`,
    order_id: `order-${index}`,
    market: market.marketAddress,
    action: index % 2 === 0 ? 'Buy' : 'Sell',
    size: 1,
    price: 50_000 + index,
    transaction_unix_ms: 1_000_000 - index * 100,
    transaction_version: 20_000 + index,
    is_taker: true,
  };
}

function makeClient(total: number, failOffset?: number): recent_trade_client {
  const getBTCRecentTradesPage = vi.fn<recent_trade_client['getBTCRecentTradesPage']>(
    (_address, limit, offset) => {
      if (offset === failOffset) return Promise.reject(new Error('temporary interruption'));
      return Promise.resolve({
        items: Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, index) =>
          makeTrade(offset + index),
        ),
        total_count: total,
      });
    },
  );
  return {
    getBTCRecentTradesPage,
  };
}

describe('recent trade REST bootstrap', () => {
  it('pages within the 200-row API cap and reports exact bounds and persistence counts', async () => {
    const Repository = new microstructure_repository(':memory:');
    const Client = makeClient(450);
    const result = await bootstrapRecentBTCTrades(Client, Repository, market, 450, 75);

    expect(vi.mocked(Client.getBTCRecentTradesPage).mock.calls).toEqual([
      [market.marketAddress, 200, 0],
      [market.marketAddress, 200, 200],
      [market.marketAddress, 50, 400],
    ]);
    expect(result).toEqual({
      fetched: 450,
      rawRows: 450,
      economicTrades: 450,
      duplicateRows: 0,
      participantRows: 450,
      ambiguousTrades: 0,
      oldestTimestamp: new Date(955_100),
      newestTimestamp: new Date(1_000_000),
    });
    expect(Repository.getCounts().trades).toBe(450);
    expect(
      normalizeRESTTradePage({ items: [makeTrade(0)], total_count: 1 }, market.marketAddress)
        .trades[0],
    ).toMatchObject({
      ingestionSource: 'REST_BOOTSTRAP',
      classificationReason: 'EXPLICIT_IS_TAKER',
    });
    Repository.close();
  });

  it('is idempotent when the same stable trade IDs are fetched again', async () => {
    const Repository = new microstructure_repository(':memory:');
    const Client = makeClient(3);
    const first = await bootstrapRecentBTCTrades(Client, Repository, market, 3, 2);
    const replay = await bootstrapRecentBTCTrades(Client, Repository, market, 3, 2);

    expect(first).toMatchObject({
      rawRows: 3,
      economicTrades: 3,
      participantRows: 3,
      duplicateRows: 0,
    });
    expect(replay).toMatchObject({
      rawRows: 3,
      economicTrades: 3,
      participantRows: 0,
      duplicateRows: 3,
    });
    expect(Repository.getCounts().trades).toBe(3);
    Repository.close();
  });

  it('resumes safely after a page interruption without losing or duplicating rows', async () => {
    const Repository = new microstructure_repository(':memory:');
    await expect(
      bootstrapRecentBTCTrades(makeClient(450, 200), Repository, market, 450, 100),
    ).rejects.toThrow('temporary interruption');
    expect(Repository.getCounts().trades).toBe(200);

    const resumed = await bootstrapRecentBTCTrades(makeClient(450), Repository, market, 450, 100);
    expect(resumed).toMatchObject({ participantRows: 250, duplicateRows: 200 });
    expect(Repository.getCounts().trades).toBe(450);
    Repository.close();
  });

  it('skips exact repeated participant rows without rejecting their shared trade ID', async () => {
    const Repository = new microstructure_repository(':memory:');
    const duplicateClient: recent_trade_client = {
      getBTCRecentTradesPage: vi.fn().mockResolvedValue({
        items: [makeTrade(1), makeTrade(1)],
        total_count: 2,
      }),
    };
    const result = await bootstrapRecentBTCTrades(duplicateClient, Repository, market, 2, 2);
    expect(result).toMatchObject({
      rawRows: 2,
      economicTrades: 1,
      participantRows: 1,
      duplicateRows: 1,
      ambiguousTrades: 0,
    });
    await expect(
      bootstrapRecentBTCTrades(duplicateClient, Repository, market, 10_001, 2),
    ).rejects.toThrow('between 0 and 10000');
    Repository.close();
  });

  it('persists two participant rows as one economic fill and counts it once', async () => {
    const Repository = new microstructure_repository(':memory:');
    const maker = {
      ...makeTrade(1),
      account: 'maker',
      order_id: 'maker-order',
      action: 'Sell',
      is_taker: false,
    };
    const taker = {
      ...makeTrade(1),
      account: 'taker',
      order_id: 'taker-order',
      action: 'Buy',
      is_taker: true,
    };
    const Client: recent_trade_client = {
      getBTCRecentTradesPage: vi.fn().mockResolvedValue({ items: [maker, taker], total_count: 2 }),
    };
    const result = await bootstrapRecentBTCTrades(Client, Repository, market, 2, 10);
    expect(result).toMatchObject({
      rawRows: 2,
      economicTrades: 1,
      participantRows: 2,
      ambiguousTrades: 0,
    });
    expect(Repository.getCounts().trades).toBe(2);
    Repository.close();
  });

  it('marks conflicting rows for one trade ID ambiguous instead of crashing', async () => {
    const Repository = new microstructure_repository(':memory:');
    const Client: recent_trade_client = {
      getBTCRecentTradesPage: vi.fn().mockResolvedValue({
        items: [makeTrade(2), { ...makeTrade(2), account: 'other', price: 99_999 }],
        total_count: 2,
      }),
    };
    const result = await bootstrapRecentBTCTrades(Client, Repository, market, 2, 10);
    expect(result).toMatchObject({
      rawRows: 2,
      economicTrades: 1,
      participantRows: 2,
      ambiguousTrades: 1,
    });
    Repository.close();
  });

  it('deduplicates participant rows repeated across overlapping pages', async () => {
    const Repository = new microstructure_repository(':memory:');
    const getBTCRecentTradesPage = vi.fn<recent_trade_client['getBTCRecentTradesPage']>(
      (_market, _limit, offset) =>
        Promise.resolve({
          items:
            offset === 0
              ? Array.from({ length: 200 }, (_, index) => makeTrade(index))
              : [makeTrade(199), makeTrade(200)],
          total_count: 202,
        }),
    );
    const result = await bootstrapRecentBTCTrades(
      { getBTCRecentTradesPage },
      Repository,
      market,
      202,
      10,
    );
    expect(result).toMatchObject({
      rawRows: 202,
      economicTrades: 201,
      participantRows: 201,
      duplicateRows: 1,
    });
    Repository.close();
  });
});
