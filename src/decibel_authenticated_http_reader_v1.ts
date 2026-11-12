import { Agent, fetch } from 'undici';
import { z } from 'zod';

export const DECIBEL_AUTHENTICATED_HTTP_READER_V1 = 'DECIBEL_AUTHENTICATED_HTTP_READER_V1' as const;
export const DECIBEL_AUTHENTICATED_HTTP_TRANSPORT_ID_V1 =
  'DECIBEL_AUTHENTICATED_HTTP_UNDICI_ISOLATED_AGENT_V1' as const;

const AccountOverviewSchema = z
  .object({
    perp_equity_balance: z.number(),
    total_margin: z.number(),
    cross_available_to_trade: z.number().finite().nonnegative(),
    unrealized_pnl: z.number().optional(),
    maintenance_margin: z.number().finite().nonnegative().optional(),
    cross_margin_ratio: z.number().finite().nonnegative().optional(),
    margin_deficit: z.number().finite().nonnegative().optional(),
  })
  .passthrough();

const PositionSchema = z
  .object({
    market: z.string(),
    market_address: z.string().optional(),
    market_id: z.string().optional(),
    user: z.string(),
    size: z.number(),
    estimated_liquidation_price: z.number().finite().nonnegative().optional(),
    user_leverage: z.number().finite().positive().optional(),
    entry_price: z.number().finite().nonnegative().optional(),
    is_isolated: z.boolean().optional(),
    tp_order_id: z.string().nullable(),
    sl_order_id: z.string().nullable(),
  })
  .passthrough();

const OpenOrderSchema = z
  .object({
    market: z.string(),
    market_address: z.string().optional(),
    market_id: z.string().optional(),
    order_id: z.string(),
    client_order_id: z.string().nullable(),
    orig_size: z.number().nullable(),
    remaining_size: z.number().nullable(),
    price: z.number().nullable(),
    is_buy: z.boolean(),
    is_tpsl: z.boolean(),
    is_reduce_only: z.boolean().optional(),
  })
  .passthrough();

const OpenOrdersSchema = z.object({
  items: z.array(OpenOrderSchema),
  total_count: z.number().int().nonnegative().nullable().optional(),
});

function normalizeIdentity(value: string): string {
  if (!/^0x[0-9a-f]{1,64}$/i.test(value)) throw new Error('AUTHENTICATED_RISK_IDENTITY_INVALID');
  return value.toLowerCase().slice(2).padStart(64, '0');
}
export function parseDecibelSelectedLeverageV1(
  raw: unknown,
  subaccount: string,
  market: string,
  observedAt: number,
) {
  const rows = z.array(PositionSchema).parse(raw);
  const matches = rows.filter((row) => normalizeIdentity(row.market) === normalizeIdentity(market));
  if (
    rows.some((row) => normalizeIdentity(row.user) !== normalizeIdentity(subaccount)) ||
    matches.length !== 1 ||
    matches[0]!.user_leverage === undefined ||
    matches[0]!.is_isolated === undefined
  )
    throw new Error('AUTHENTICATED_SELECTED_LEVERAGE_IDENTITY_OR_COVERAGE_INVALID');
  const row = matches[0]!;
  return Object.freeze({
    source: 'AUTHENTICATED_BTC_POSITION_SETTINGS' as const,
    observedAt,
    userLeverage: row.user_leverage!,
    positionBase: row.size,
    isIsolated: row.is_isolated!,
    market,
    subaccount,
  });
}
export function parseDecibelAccountFeeRatesV1(
  raw: unknown,
  subaccount: string,
  observedAt: number,
) {
  const value = z
    .object({
      account: z.string(),
      perp: z.object({
        user_maker_rate: z.number().finite(),
        user_taker_rate: z.number().finite().nonnegative(),
        fee_tier: z.number().int().nonnegative(),
        active_referral_discount: z.number().min(0).max(1),
      }),
    })
    .parse(raw);
  if (normalizeIdentity(value.account) !== normalizeIdentity(subaccount))
    throw new Error('AUTHENTICATED_FEE_ACCOUNT_MISMATCH');
  return Object.freeze({
    source: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES' as const,
    observedAt,
    makerFeeBps: value.perp.user_maker_rate * 10000,
    takerFeeBps: value.perp.user_taker_rate * 10000,
    tier: value.perp.fee_tier,
    referralDiscount: value.perp.active_referral_discount,
    subaccount,
  });
}
export type decibel_selected_leverage_v1 = ReturnType<typeof parseDecibelSelectedLeverageV1>;
export type decibel_account_fee_rates_v1 = ReturnType<typeof parseDecibelAccountFeeRatesV1>;

export type decibel_authenticated_http_account_overview_v1 = Readonly<{
  perp_equity_balance: number;
  total_margin: number;
  cross_available_to_trade: number;
  unrealized_pnl?: number;
  maintenance_margin?: number;
  cross_margin_ratio?: number;
  margin_deficit?: number;
}>;
export type decibel_authenticated_http_position_v1 = Readonly<{
  market: string;
  market_address?: string;
  market_id?: string;
  user: string;
  size: number;
  estimated_liquidation_price?: number;
  user_leverage?: number;
  entry_price?: number;
  is_isolated?: boolean;
  tp_order_id: string | null;
  sl_order_id: string | null;
}>;
export type decibel_authenticated_http_open_order_v1 = Readonly<{
  market: string;
  market_address?: string;
  market_id?: string;
  order_id: string;
  client_order_id: string | null;
  orig_size: number | null;
  remaining_size: number | null;
  price: number | null;
  is_buy: boolean;
  is_tpsl: boolean;
  is_reduce_only?: boolean;
}>;

class decibel_authenticated_http_error_v1 extends Error {
  public constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfter: string | null = null,
  ) {
    super(message);
  }
}

type request_v1 = (
  url: string,
  options: Readonly<{ headers: Readonly<Record<string, string>>; signal: AbortSignal }>,
) => Promise<
  Readonly<{
    ok: boolean;
    status: number;
    statusText: string;
    headers?: { get(name: string): string | null };
    text(): Promise<string>;
  }>
>;

export function createDecibelAuthenticatedHttpReaderV1(
  options: Readonly<{
    baseUrl: string;
    apiKey?: string;
    request?: request_v1;
  }>,
): Readonly<{
  readSelectedLeverage(
    subaccount: string,
    market: string,
    signal: AbortSignal,
  ): Promise<decibel_selected_leverage_v1>;
  readFeeRates(subaccount: string, signal: AbortSignal): Promise<decibel_account_fee_rates_v1>;
  readAccountOverview(
    subaccount: string,
    signal: AbortSignal,
  ): Promise<decibel_authenticated_http_account_overview_v1>;
  readPositions(
    subaccount: string,
    marketAddress: string | undefined,
    signal: AbortSignal,
  ): Promise<readonly decibel_authenticated_http_position_v1[]>;
  readOpenOrders(
    subaccount: string,
    signal: AbortSignal,
  ): Promise<readonly decibel_authenticated_http_open_order_v1[]>;
  getTransportDiagnostics(): Readonly<{
    transportId: typeof DECIBEL_AUTHENTICATED_HTTP_TRANSPORT_ID_V1;
    baseUrl: string;
    isolatedDispatcher: true;
    internalRetry: false;
  }>;
  close(): Promise<void>;
}> {
  const Dispatcher =
    options.request === undefined ? new Agent({ connections: 6, pipelining: 1 }) : null;
  const headers = Object.freeze(
    options.apiKey === undefined ? {} : { Authorization: `Bearer ${options.apiKey}` },
  );
  const request: request_v1 =
    options.request ??
    ((url, init) =>
      fetch(url, {
        method: 'GET',
        headers: init.headers,
        signal: init.signal,
        ...(Dispatcher === null ? {} : { dispatcher: Dispatcher }),
      }));

  const get = async <T>(
    path: string,
    query: URLSearchParams,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ) => {
    const response = await request(`${options.baseUrl}${path}?${query.toString()}`, {
      headers,
      signal,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new decibel_authenticated_http_error_v1(
        response.status,
        `HTTP Error ${response.status}${response.statusText ? ` (${response.statusText})` : ''}: ${body}`,
        response.headers?.get('retry-after') ?? null,
      );
    }
    return schema.parse(JSON.parse(body));
  };

  return Object.freeze({
    getTransportDiagnostics: () =>
      Object.freeze({
        transportId: DECIBEL_AUTHENTICATED_HTTP_TRANSPORT_ID_V1,
        baseUrl: options.baseUrl,
        isolatedDispatcher: true as const,
        internalRetry: false as const,
      }),
    readSelectedLeverage: async (subaccount, market, signal) =>
      parseDecibelSelectedLeverageV1(
        await get(
          '/api/v1/account_positions',
          new URLSearchParams({
            account: subaccount,
            market_address: market,
            include_deleted: 'true',
            limit: '100',
          }),
          z.unknown(),
          signal,
        ),
        subaccount,
        market,
        Date.now(),
      ),
    readFeeRates: async (subaccount, signal) =>
      parseDecibelAccountFeeRatesV1(
        await get(
          '/api/v1/user_fee_rates',
          new URLSearchParams({ account: subaccount }),
          z.unknown(),
          signal,
        ),
        subaccount,
        Date.now(),
      ),
    readAccountOverview: async (subaccount, signal) => {
      const value = await get(
        '/api/v1/account_overviews',
        new URLSearchParams({ account: subaccount }),
        AccountOverviewSchema,
        signal,
      );
      return Object.freeze({
        ...(value.maintenance_margin === undefined
          ? {}
          : { maintenance_margin: value.maintenance_margin }),
        ...(value.cross_margin_ratio === undefined
          ? {}
          : { cross_margin_ratio: value.cross_margin_ratio }),
        ...(value.margin_deficit === undefined ? {} : { margin_deficit: value.margin_deficit }),
        perp_equity_balance: value.perp_equity_balance,
        total_margin: value.total_margin,
        cross_available_to_trade: value.cross_available_to_trade,
        ...(value.unrealized_pnl === undefined ? {} : { unrealized_pnl: value.unrealized_pnl }),
      });
    },
    readPositions: async (subaccount, marketAddress, signal) => {
      const query = new URLSearchParams({
        account: subaccount,
        include_deleted: 'false',
        limit: '10',
      });
      if (marketAddress !== undefined) query.set('market_address', marketAddress);
      const values = await get('/api/v1/account_positions', query, z.array(PositionSchema), signal);
      return Object.freeze(
        values.map((value) =>
          Object.freeze({
            market: value.market,
            ...(value.market_address === undefined ? {} : { market_address: value.market_address }),
            ...(value.market_id === undefined ? {} : { market_id: value.market_id }),
            user: value.user,
            size: value.size,
            ...(value.estimated_liquidation_price === undefined
              ? {}
              : { estimated_liquidation_price: value.estimated_liquidation_price }),
            ...(value.entry_price === undefined ? {} : { entry_price: value.entry_price }),
            ...(value.user_leverage === undefined ? {} : { user_leverage: value.user_leverage }),
            ...(value.is_isolated === undefined ? {} : { is_isolated: value.is_isolated }),
            tp_order_id: value.tp_order_id,
            sl_order_id: value.sl_order_id,
          }),
        ),
      );
    },
    readOpenOrders: async (subaccount, signal) => {
      const page = await get(
        '/api/v1/open_orders',
        new URLSearchParams({ account: subaccount, limit: '200', offset: '0' }),
        OpenOrdersSchema,
        signal,
      );
      // A truncated or shifting account page cannot reserve reduce-only capacity.
      // Do not pretend offset pagination is an atomic account snapshot.
      if (
        (page.total_count != null && page.total_count !== page.items.length) ||
        (page.total_count == null && page.items.length >= 200)
      )
        throw new Error('PRODUCTION_AUTHENTICATED_OPEN_ORDERS_INCOMPLETE');
      if (
        new Set(page.items.map((order) => `${order.market}:${order.order_id}`)).size !==
        page.items.length
      )
        throw new Error('PRODUCTION_AUTHENTICATED_OPEN_ORDERS_DUPLICATE_IDENTITY');
      return page.items.map((value) =>
        Object.freeze({
          market: value.market,
          ...(value.market_address === undefined ? {} : { market_address: value.market_address }),
          ...(value.market_id === undefined ? {} : { market_id: value.market_id }),
          order_id: value.order_id,
          client_order_id: value.client_order_id,
          orig_size: value.orig_size,
          remaining_size: value.remaining_size,
          price: value.price,
          is_buy: value.is_buy,
          is_tpsl: value.is_tpsl,
          ...(value.is_reduce_only === undefined ? {} : { is_reduce_only: value.is_reduce_only }),
        }),
      );
    },
    close: async () => {
      await Dispatcher?.close();
    },
  });
}
