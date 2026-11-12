import { describe, expect, it, vi } from 'vitest';

import {
  createDecibelAuthenticatedHttpReaderV1,
  parseDecibelSelectedLeverageV1,
  parseDecibelAccountFeeRatesV1,
} from '../src/decibel_authenticated_http_reader_v1.js';

function response(body: unknown) {
  return Object.freeze({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe('production authenticated HTTP reader', () => {
  it('recovers exact BTC leverage while FLAT without adding deleted rows to open positions', async () => {
    const sub = '0x123',
      market = '0x456';
    const row = {
      market,
      user: sub,
      size: 0,
      user_leverage: 40,
      is_isolated: false,
      is_deleted: true,
      tp_order_id: null,
      sl_order_id: null,
    };
    const Request = vi.fn((url: string) =>
      Promise.resolve(response(url.includes('include_deleted=true') ? [row] : [])),
    );
    const Reader = createDecibelAuthenticatedHttpReaderV1({
      baseUrl: 'https://api.example',
      request: Request,
    });
    const signal = new AbortController().signal;
    expect(await Reader.readSelectedLeverage(sub, market, signal)).toMatchObject({
      userLeverage: 40,
      positionBase: 0,
      isIsolated: false,
    });
    expect(await Reader.readPositions(sub, market, signal)).toEqual([]);
    expect(Request.mock.calls[0]?.[0]).toContain('market_address=0x456');
    expect(() =>
      parseDecibelSelectedLeverageV1([{ ...row, user: '0x789' }], sub, market, 1000),
    ).toThrow();
    expect(() =>
      parseDecibelSelectedLeverageV1([{ ...row, market: '0x789' }], sub, market, 1000),
    ).toThrow();
    expect(() => parseDecibelSelectedLeverageV1([row, row], sub, market, 1000)).toThrow();
    await Reader.close();
  });
  it('reads product-specific fee rates with account identity, tier, discount and freshness', async () => {
    const raw = {
      account: '0x123',
      perp: {
        user_maker_rate: 0.00015,
        user_taker_rate: 0.00045,
        fee_tier: 0,
        active_referral_discount: 0,
      },
      spot: { user_taker_rate: 0.0007 },
    };
    const Reader = createDecibelAuthenticatedHttpReaderV1({
      baseUrl: 'https://api.example',
      request: () => Promise.resolve(response(raw)),
    });
    const fees = await Reader.readFeeRates('0x123', new AbortController().signal);
    expect(fees).toMatchObject({
      takerFeeBps: 4.5,
      tier: 0,
      referralDiscount: 0,
      source: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
    });
    expect(fees.makerFeeBps).toBeCloseTo(1.5);
    expect(() =>
      parseDecibelAccountFeeRatesV1({ ...raw, account: '0x789' }, '0x123', 1000),
    ).toThrow();
    expect(() =>
      parseDecibelAccountFeeRatesV1({ ...raw, perp: undefined }, '0x123', 1000),
    ).toThrow();
    await Reader.close();
  });
  it('uses the Decibel authenticated endpoints, bearer context, and caller deadline', async () => {
    const Request = vi.fn((url: string) => {
      if (url.includes('account_overviews')) {
        return Promise.resolve(
          response({
            perp_equity_balance: 100,
            total_margin: 102,
            cross_available_to_trade: 8.929,
            unrealized_pnl: 1,
          }),
        );
      }
      if (url.includes('account_positions')) return Promise.resolve(response([]));
      return Promise.resolve(response({ items: [], total_count: 0 }));
    });
    const Reader = createDecibelAuthenticatedHttpReaderV1({
      baseUrl: 'https://api.example/decibel',
      apiKey: 'test-only-token',
      request: Request,
    });
    const Controller = new AbortController();

    expect(Reader.getTransportDiagnostics()).toEqual({
      transportId: 'DECIBEL_AUTHENTICATED_HTTP_UNDICI_ISOLATED_AGENT_V1',
      baseUrl: 'https://api.example/decibel',
      isolatedDispatcher: true,
      internalRetry: false,
    });

    await expect(
      Reader.readAccountOverview('subaccount', Controller.signal),
    ).resolves.toMatchObject({
      perp_equity_balance: 100,
      total_margin: 102,
      cross_available_to_trade: 8.929,
    });
    await expect(Reader.readPositions('subaccount', 'market', Controller.signal)).resolves.toEqual(
      [],
    );
    await expect(Reader.readOpenOrders('subaccount', Controller.signal)).resolves.toEqual([]);

    expect(Request.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example/decibel/api/v1/account_overviews?account=subaccount',
      'https://api.example/decibel/api/v1/account_positions?account=subaccount&include_deleted=false&limit=10&market_address=market',
      'https://api.example/decibel/api/v1/open_orders?account=subaccount&limit=200&offset=0',
    ]);
    for (const [, options] of Request.mock.calls) {
      expect(options?.headers).toEqual({ Authorization: 'Bearer test-only-token' });
      expect(options?.signal).toBe(Controller.signal);
    }
  });

  it.each([
    { count: 2, length: 1, duplicate: false, reason: 'INCOMPLETE' },
    { count: null, length: 200, duplicate: false, reason: 'INCOMPLETE' },
    { count: 2, length: 2, duplicate: true, reason: 'DUPLICATE_IDENTITY' },
  ])(
    'rejects incomplete or ambiguous account order pages: $reason/$length',
    async ({ count, length, duplicate, reason }) => {
      const items = Array.from({ length }, (_, index) => ({
        market: '0x456',
        order_id: duplicate ? 'same' : `order-${index}`,
        client_order_id: `client-${index}`,
        orig_size: 0.001,
        remaining_size: 0.001,
        price: 80000,
        is_buy: false,
        is_tpsl: false,
        is_reduce_only: true,
      }));
      const Reader = createDecibelAuthenticatedHttpReaderV1({
        baseUrl: 'https://api.example',
        request: () => Promise.resolve(response({ items, total_count: count })),
      });
      try {
        await expect(Reader.readOpenOrders('0x123', new AbortController().signal)).rejects.toThrow(
          `PRODUCTION_AUTHENTICATED_OPEN_ORDERS_${reason}`,
        );
      } finally {
        await Reader.close();
      }
    },
  );

  it('does not retry a failed request', async () => {
    const Request = vi.fn().mockRejectedValue(new Error('NETWORK_TIMEOUT'));
    const Reader = createDecibelAuthenticatedHttpReaderV1({
      baseUrl: 'https://api.example/decibel',
      request: Request,
    });

    await expect(
      Reader.readAccountOverview('subaccount', AbortSignal.timeout(100)),
    ).rejects.toThrow('NETWORK_TIMEOUT');
    expect(Request).toHaveBeenCalledTimes(1);
  });

  it.each([
    {},
    { cross_available_to_trade: null },
    { cross_available_to_trade: -1 },
    { cross_available_to_trade: '8.929' },
  ])('fails closed when authoritative available margin is invalid: %j', async (value) => {
    const Reader = createDecibelAuthenticatedHttpReaderV1({
      baseUrl: 'https://api.example/decibel',
      request: () =>
        Promise.resolve(response({ perp_equity_balance: 100, total_margin: 102, ...value })),
    });
    await expect(
      Reader.readAccountOverview('subaccount', AbortSignal.timeout(100)),
    ).rejects.toThrow();
  });
});
