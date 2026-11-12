import {
  DecibelReadDex,
  MAINNET_CONFIG,
  TESTNET_CONFIG,
  type DecibelConfig,
  type MarketMode,
} from '@decibeltrade/sdk';
import { z } from 'zod';

import {
  CandleIntervalSchema,
  alignTimestamp,
  getNextTimestamp,
  type candle_interval,
} from './candle_interval.js';
import type { application_config } from './config.js';
import { normalizeDepthPayload } from './microstructure.js';

const SDKMarketCandidateSchema = z.object({
  market_addr: z.string().min(1),
  market_name: z.string().min(1),
  sz_decimals: z.number().int().nonnegative(),
  px_decimals: z.number().int().nonnegative(),
  max_leverage: z.number(),
  tick_size: z.number().int().safe().positive(),
  min_size: z.number().int().safe().positive(),
  lot_size: z.number().int().safe().positive(),
  max_open_interest: z.number().nonnegative(),
  mode: z.enum(['Open', 'ReduceOnly', 'AllowlistOnly', 'Halt', 'Delisting']),
  asset_type: z.string().optional(),
});

const SDKMarketSchema = SDKMarketCandidateSchema.extend({
  max_leverage: z.number().positive(),
});

const SDKPriceSchema = z.object({
  market: z.string().min(1),
  mark_px: z.number().positive().finite(),
  mid_px: z.number().positive().finite(),
  oracle_px: z.number().positive().finite(),
  transaction_unix_ms: z.number().int().nonnegative(),
});

const PositiveDecimalStringSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .transform(Number)
  .pipe(z.number().positive().finite());

const UnixMillisecondsStringSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().safe().nonnegative());

const SDKCurrentOrderbookSchema = z.object({
  asks: z.array(z.tuple([PositiveDecimalStringSchema, PositiveDecimalStringSchema])),
  bids: z.array(z.tuple([PositiveDecimalStringSchema, PositiveDecimalStringSchema])),
  ticker_id: z.string().min(1).optional(),
  timestamp: UnixMillisecondsStringSchema,
});

const SDKCandlestickSchema = z
  .object({
    T: z.number().int().safe().nonnegative(),
    c: z.number().positive().finite(),
    h: z.number().positive().finite(),
    i: CandleIntervalSchema,
    l: z.number().positive().finite(),
    o: z.number().positive().finite(),
    t: z.number().int().safe().nonnegative(),
    v: z.number().nonnegative().finite(),
  })
  .superRefine((candle, context) => {
    if (candle.T <= candle.t) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Close time must follow open time',
      });
    }
    if (candle.h < Math.max(candle.o, candle.c, candle.l)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'High price is inconsistent' });
    }
    if (candle.l > Math.min(candle.o, candle.c, candle.h)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Low price is inconsistent' });
    }
  });

type sdk_market = z.infer<typeof SDKMarketSchema>;
export type USD_per_BTC = number;
export type BTC_amount = number;

export type BTC_market_metadata = {
  symbol: 'BTC/USD';
  exchangeSymbol: string;
  marketAddress: string;
  sizeDecimals: number;
  priceDecimals: number;
  tickSize: USD_per_BTC;
  minimumSize: BTC_amount;
  lotSize: BTC_amount;
  maximumLeverage: number;
  maximumOpenInterest: number;
  mode: MarketMode;
};

export type BTC_market_price = {
  symbol: 'BTC/USD';
  exchangeSymbol: string;
  markPrice: number;
  midPrice: number;
  oraclePrice: number;
  observedAt: Date;
};

export type BTC_candlestick = {
  timestamp: Date;
  open: USD_per_BTC;
  high: USD_per_BTC;
  low: USD_per_BTC;
  close: USD_per_BTC;
  volume: BTC_amount;
};

export type BTC_candlestick_history = {
  symbol: 'BTC/USD';
  exchangeSymbol: string;
  marketAddress: string;
  interval: candle_interval;
  candles: BTC_candlestick[];
};

export type BTC_hourly_candlestick = BTC_candlestick;

export interface decibel_market_reader {
  markets: { getAll(input?: { fetchOptions: { signal: AbortSignal } }): Promise<unknown> };
  candlesticks: {
    getByName(args: {
      marketName: string;
      interval: candle_interval;
      startTime: number;
      endTime: number;
    }): Promise<unknown>;
    subscribeByName(
      this: void,
      marketName: string,
      interval: candle_interval,
      onData: (message: unknown) => void,
    ): () => void;
  };
  marketDepth: {
    subscribeByName(
      this: void,
      marketName: string,
      aggregationSize: 1,
      onData: (message: unknown) => void,
    ): () => void;
  };
  marketTrades: {
    subscribeByName(this: void, marketName: string, onData: (message: unknown) => void): () => void;
  };
  marketPrices: {
    getByName(args: { marketName: string }): Promise<unknown>;
    subscribeByName(this: void, marketName: string, onData: (message: unknown) => void): () => void;
  };
  deps?: { ws: { close(): void } };
}

export type reader_factory = (
  config: DecibelConfig,
  options: { nodeApiKey?: string; onWsError?: (error: unknown) => void },
) => decibel_market_reader;

export type HTTP_fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class decibel_current_book_error extends Error {
  public constructor(
    public readonly safeCode: string,
    public readonly httpStatus: number | null,
  ) {
    super(safeCode);
    this.name = 'decibel_current_book_error';
  }
}

const defaultReaderFactory: reader_factory = (config, options) =>
  new DecibelReadDex(config, options);

function isBTCUSDMarket(name: string): boolean {
  return /^BTC(?:[-/]USD|-PERP)$/i.test(name);
}

function isETHUSDMarket(name: string): boolean {
  return /^ETH(?:[-/]USD|-PERP)$/i.test(name);
}

function isPerpetualMarket(assetType: string | undefined): boolean {
  return assetType === undefined || assetType.toLowerCase() === 'perp';
}

function selectPerpetualMarket(
  rows: unknown,
  matchesName: (name: string) => boolean,
): sdk_market | undefined {
  const candidates = z.array(SDKMarketCandidateSchema).parse(rows);
  const matching = candidates.filter(
    (candidate) => matchesName(candidate.market_name) && isPerpetualMarket(candidate.asset_type),
  );
  const explicitPerpetual = matching.filter(
    (candidate) => candidate.asset_type?.toLowerCase() === 'perp',
  );
  const selected = explicitPerpetual[0] ?? matching[0];
  return selected === undefined ? undefined : SDKMarketSchema.parse(selected);
}

function normalizeChainUnits(value: number, decimals: number): number {
  return value / 10 ** decimals;
}

export class decibel_client {
  private readonly reader: decibel_market_reader;
  private readonly webSocketErrorHandlers = new Set<() => void>();
  private readonly tradingHTTPURL: string;
  private readonly nodeApiKey: string | undefined;
  private latestBTCStreamingBook: {
    bids?: readonly Readonly<{ price: number; size: number }>[];
    asks?: readonly Readonly<{ price: number; size: number }>[];
    market: string;
    best_bid: number;
    best_ask: number;
    unix_ms: number;
    best_bid_size: number;
    best_ask_size: number;
    microprice: number;
    top_book_imbalance: number;
  } | null = null;
  private unsubscribeBTCDepth: (() => void) | null = null;
  private BTCDepthSubscriptionInFlight: Promise<void> | null = null;
  private BTCDepthSubscriptionGeneration = 0;
  private BTCDepthHasSubscribed = false;
  private BTCDepthConnectionState:
    'INIT' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'STALLED' = 'INIT';
  private BTCDepthSubscriptionState: 'UNSUBSCRIBED' | 'SUBSCRIBING' | 'SUBSCRIBED' = 'UNSUBSCRIBED';
  private BTCDepthLastWsMessageAt: number | null = null;
  private BTCDepthLastValidBboAt: number | null = null;
  private BTCDepthReconnectCount = 0;
  private BTCDepthLastDisconnectReason: string | null = null;
  private pendingBTCDepthMessage: unknown = null;
  private BTCDepthProcessingTimer: ReturnType<typeof setTimeout> | null = null;
  private BTCDepthPendingReceivedAt = 0;
  private BTCDepthMessagesReceived = 0;
  private BTCDepthMessagesCoalesced = 0;
  private BTCDepthStatesVerified = 0;
  private BTCDepthMessagesRejected = 0;
  private BTCDepthLastReceiveToVerifiedMs: number | null = null;
  private BTCDepthMaximumReceiveToVerifiedMs = 0;
  private readonly BTCDepthWaiters = new Set<() => void>();
  private exchangeSymbol: string | undefined;

  constructor(
    config: Pick<application_config, 'network' | 'nodeApiKey' | 'marketSymbol'>,
    createReader: reader_factory = defaultReaderFactory,
    private readonly fetchHTTP: HTTP_fetch = fetch,
  ) {
    const networkConfig = config.network === 'mainnet' ? MAINNET_CONFIG : TESTNET_CONFIG;
    this.tradingHTTPURL = networkConfig.tradingHttpUrl;
    this.nodeApiKey = config.nodeApiKey;
    const options = {
      ...(config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey }),
      onWsError: () => {
        this.invalidateBTCDepthSubscription('SDK_WS_ERROR');
        for (const handler of this.webSocketErrorHandlers) {
          handler();
        }
      },
    };
    this.reader = createReader(networkConfig, options);
  }

  async getBTCRecentTradesPage(
    marketAddress: string,
    limit: number,
    offset: number,
  ): Promise<unknown> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      throw new Error('Decibel trade page limit must be between 1 and 200');
    if (!Number.isInteger(offset) || offset < 0 || offset > 10_000)
      throw new Error('Decibel trade page offset must be between 0 and 10000');
    const query = new URLSearchParams({
      market: marketAddress,
      limit: String(limit),
      offset: String(offset),
    });
    const headers = new Headers();
    if (this.nodeApiKey !== undefined) headers.set('Authorization', `Bearer ${this.nodeApiKey}`);
    const response = await this.fetchHTTP(
      `${this.tradingHTTPURL}/api/v1/trades?${query.toString()}`,
      { headers },
    );
    if (!response.ok) throw new Error(`Decibel recent trades request failed (${response.status})`);
    return response.json() as Promise<unknown>;
  }

  async getBTCCurrentBook(marketAddress: string): Promise<unknown> {
    const query = new URLSearchParams({ market: marketAddress });
    const headers = new Headers();
    if (this.nodeApiKey !== undefined) headers.set('Authorization', `Bearer ${this.nodeApiKey}`);
    let response: Response;
    try {
      response = await this.fetchHTTP(
        `${this.tradingHTTPURL}/api/v1/orderbook?${query.toString()}`,
        { headers },
      );
    } catch {
      throw new decibel_current_book_error('CURRENT_BOOK_TRANSPORT_FAILURE', null);
    }
    if (!response.ok)
      throw new decibel_current_book_error(
        [401, 403].includes(response.status)
          ? 'CURRENT_BOOK_AUTH_OR_CONFIG_FAILURE'
          : 'CURRENT_BOOK_HTTP_FAILURE',
        response.status,
      );
    let parsed: z.infer<typeof SDKCurrentOrderbookSchema>;
    try {
      parsed = SDKCurrentOrderbookSchema.parse(await response.json());
    } catch {
      throw new decibel_current_book_error('CURRENT_BOOK_RESPONSE_VALIDATION_FAILURE', null);
    }
    if (parsed.ticker_id !== undefined && parsed.ticker_id !== marketAddress)
      throw new decibel_current_book_error('CURRENT_BOOK_TICKER_MISMATCH', null);
    const bids = parsed.bids.map(([price, size]) => ({ price, size }));
    const asks = parsed.asks.map(([price, size]) => ({ price, size }));
    const bestBid = bids.length === 0 ? null : Math.max(...bids.map((level) => level.price));
    const bestAsk = asks.length === 0 ? null : Math.min(...asks.map((level) => level.price));
    const bestBidSize = bids.find((level) => level.price === bestBid)?.size;
    const bestAskSize = asks.find((level) => level.price === bestAsk)?.size;
    const topSize = (bestBidSize ?? 0) + (bestAskSize ?? 0);
    const topFiveBidSize = bids.slice(0, 5).reduce((sum, level) => sum + level.size, 0);
    const topFiveAskSize = asks.slice(0, 5).reduce((sum, level) => sum + level.size, 0);
    const topFiveSize = topFiveBidSize + topFiveAskSize;
    return {
      market: marketAddress,
      bids,
      asks,
      best_bid: bestBid,
      best_ask: bestAsk,
      unix_ms: parsed.timestamp,
      ...(bestBidSize === undefined ? {} : { best_bid_size: bestBidSize }),
      ...(bestAskSize === undefined ? {} : { best_ask_size: bestAskSize }),
      ...(bestBid === null || bestAsk === null || topSize <= 0
        ? {}
        : { microprice: (bestAsk * (bestBidSize ?? 0) + bestBid * (bestAskSize ?? 0)) / topSize }),
      ...(topFiveSize <= 0
        ? {}
        : { top_book_imbalance: (topFiveBidSize - topFiveAskSize) / topFiveSize }),
    };
  }

  async getBTCStreamingBook(marketAddress: string, maximumWaitMs = 2_000): Promise<unknown> {
    const maximumIdleMs = 5_000;
    const now = Date.now();
    if (
      this.unsubscribeBTCDepth !== null &&
      this.BTCDepthConnectionState !== 'CONNECTING' &&
      (this.BTCDepthConnectionState === 'DISCONNECTED' ||
        this.BTCDepthLastValidBboAt === null ||
        now - this.BTCDepthLastValidBboAt > maximumIdleMs)
    )
      this.invalidateBTCDepthSubscription(
        this.BTCDepthConnectionState === 'DISCONNECTED'
          ? (this.BTCDepthLastDisconnectReason ?? 'SDK_WS_DISCONNECTED')
          : 'VALID_BBO_IDLE_TIMEOUT',
      );
    await this.ensureBTCDepthSubscription(marketAddress);
    if (this.latestBTCStreamingBook === null)
      await new Promise<void>((resolveWait) => {
        const finish = (): void => {
          clearTimeout(timeout);
          this.BTCDepthWaiters.delete(finish);
          resolveWait();
        };
        const timeout = setTimeout(finish, maximumWaitMs);
        this.BTCDepthWaiters.add(finish);
      });
    if (
      this.latestBTCStreamingBook === null ||
      this.BTCDepthConnectionState !== 'CONNECTED' ||
      this.BTCDepthLastValidBboAt === null ||
      Date.now() - this.BTCDepthLastValidBboAt > maximumIdleMs
    ) {
      this.BTCDepthConnectionState = 'STALLED';
      this.BTCDepthLastDisconnectReason = 'VALID_BBO_IDLE_TIMEOUT';
      throw new decibel_current_book_error('CURRENT_BOOK_WS_BBO_STALE', null);
    }
    return this.latestBTCStreamingBook;
  }

  getBTCMarketDataDiagnostics(): Readonly<{
    wsConnectionState: 'INIT' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'STALLED';
    wsSubscriptionState: 'UNSUBSCRIBED' | 'SUBSCRIBING' | 'SUBSCRIBED';
    lastWsMessageAgeMs: number | null;
    lastValidBboAgeMs: number | null;
    wsReconnectCount: number;
    wsLastDisconnectReason: string | null;
    wsMessagesReceived: number;
    wsMessagesCoalesced: number;
    wsStatesVerified: number;
    wsMessagesRejected: number;
    lastReceiveToVerifiedMs: number | null;
    maximumReceiveToVerifiedMs: number;
  }> {
    const now = Date.now();
    return Object.freeze({
      wsConnectionState: this.BTCDepthConnectionState,
      wsSubscriptionState: this.BTCDepthSubscriptionState,
      lastWsMessageAgeMs:
        this.BTCDepthLastWsMessageAt === null
          ? null
          : Math.max(0, now - this.BTCDepthLastWsMessageAt),
      lastValidBboAgeMs:
        this.BTCDepthLastValidBboAt === null
          ? null
          : Math.max(0, now - this.BTCDepthLastValidBboAt),
      wsReconnectCount: this.BTCDepthReconnectCount,
      wsLastDisconnectReason: this.BTCDepthLastDisconnectReason,
      wsMessagesReceived: this.BTCDepthMessagesReceived,
      wsMessagesCoalesced: this.BTCDepthMessagesCoalesced,
      wsStatesVerified: this.BTCDepthStatesVerified,
      wsMessagesRejected: this.BTCDepthMessagesRejected,
      lastReceiveToVerifiedMs: this.BTCDepthLastReceiveToVerifiedMs,
      maximumReceiveToVerifiedMs: this.BTCDepthMaximumReceiveToVerifiedMs,
    });
  }

  private ensureBTCDepthSubscription(marketAddress: string): Promise<void> {
    if (this.unsubscribeBTCDepth !== null) return Promise.resolve();
    if (this.BTCDepthSubscriptionInFlight !== null) return this.BTCDepthSubscriptionInFlight;
    const Pending = this.openBTCDepthSubscription(marketAddress);
    this.BTCDepthSubscriptionInFlight = Pending;
    void Pending.finally(() => {
      if (this.BTCDepthSubscriptionInFlight === Pending) this.BTCDepthSubscriptionInFlight = null;
    }).catch(() => undefined);
    return Pending;
  }

  private async openBTCDepthSubscription(marketAddress: string): Promise<void> {
    this.BTCDepthConnectionState = 'CONNECTING';
    this.BTCDepthSubscriptionState = 'SUBSCRIBING';
    const generation = ++this.BTCDepthSubscriptionGeneration;
    const metadata = await this.getBTCMarketMetadata();
    if (generation !== this.BTCDepthSubscriptionGeneration)
      throw new Error('Decibel BTC depth subscription was invalidated during initialization');
    if (metadata.marketAddress !== marketAddress)
      throw new Error('Decibel BTC depth market does not match metadata');
    if (this.BTCDepthHasSubscribed) this.BTCDepthReconnectCount += 1;
    this.BTCDepthHasSubscribed = true;
    this.unsubscribeBTCDepth = this.subscribeBTCDepth(metadata.exchangeSymbol, (message) => {
      if (generation !== this.BTCDepthSubscriptionGeneration) return;
      this.BTCDepthLastWsMessageAt = Date.now();
      this.BTCDepthMessagesReceived += 1;
      // Coalesce a burst to its newest state. Parsing every raw depth frame can
      // monopolize the main event loop and starve auth/timer delivery.
      if (this.pendingBTCDepthMessage !== null) this.BTCDepthMessagesCoalesced += 1;
      this.pendingBTCDepthMessage = message;
      this.BTCDepthPendingReceivedAt = Date.now();
      if (this.BTCDepthProcessingTimer !== null) return;
      this.BTCDepthProcessingTimer = setTimeout(
        () => {
          this.BTCDepthProcessingTimer = null;
          if (generation !== this.BTCDepthSubscriptionGeneration) return;
          const latest = this.pendingBTCDepthMessage;
          this.pendingBTCDepthMessage = null;
          try {
            const candidate =
              typeof latest === 'object' && latest !== null && 'depth' in latest
                ? latest.depth
                : latest;
            const depth = normalizeDepthPayload(candidate, marketAddress);
            // A timestamp can reject regression, but cannot establish gap-free
            // sequencing or uniqueness: the venue supplies no depth sequence.
            if (
              this.latestBTCStreamingBook !== null &&
              depth.exchangeTimestamp.getTime() < this.latestBTCStreamingBook.unix_ms
            ) {
              this.BTCDepthMessagesRejected += 1;
              return;
            }
            this.latestBTCStreamingBook = {
              market: marketAddress,
              ...(depth.bids === undefined ? {} : { bids: depth.bids }),
              ...(depth.asks === undefined ? {} : { asks: depth.asks }),
              best_bid: depth.bestBid,
              best_ask: depth.bestAsk,
              unix_ms: depth.exchangeTimestamp.getTime(),
              best_bid_size: depth.bestBidSize,
              best_ask_size: depth.bestAskSize,
              microprice: depth.microprice,
              top_book_imbalance: depth.top5DepthImbalance,
            };
            this.BTCDepthLastValidBboAt = Date.now();
            this.BTCDepthStatesVerified += 1;
            this.BTCDepthLastReceiveToVerifiedMs = Math.max(
              0,
              Date.now() - this.BTCDepthPendingReceivedAt,
            );
            this.BTCDepthMaximumReceiveToVerifiedMs = Math.max(
              this.BTCDepthMaximumReceiveToVerifiedMs,
              this.BTCDepthLastReceiveToVerifiedMs,
            );
            this.BTCDepthConnectionState = 'CONNECTED';
            this.BTCDepthLastDisconnectReason = null;
            for (const notify of this.BTCDepthWaiters) notify();
            this.BTCDepthWaiters.clear();
          } catch {
            this.BTCDepthMessagesRejected += 1;
            // Fail closed until a valid complete state arrives. There is no
            // production REST fallback and no supported delta reconstruction.
            this.latestBTCStreamingBook = null;
            this.BTCDepthLastValidBboAt = null;
            this.BTCDepthConnectionState = 'STALLED';
            this.BTCDepthLastDisconnectReason = 'INVALID_DEPTH_STATE';
          }
          // Remove the fixed wait only when consumers have no usable state. Keep
          // the established background burst window to avoid increasing parsing
          // work or changing the steady-state controller's quote inputs.
        },
        this.latestBTCStreamingBook === null ? 0 : 50,
      );
    });
    this.BTCDepthSubscriptionState = 'SUBSCRIBED';
  }

  private invalidateBTCDepthSubscription(reason: string): void {
    this.BTCDepthSubscriptionGeneration += 1;
    if (this.BTCDepthProcessingTimer !== null) clearTimeout(this.BTCDepthProcessingTimer);
    this.BTCDepthProcessingTimer = null;
    this.unsubscribeBTCDepth?.();
    this.unsubscribeBTCDepth = null;
    this.latestBTCStreamingBook = null;
    this.pendingBTCDepthMessage = null;
    this.BTCDepthConnectionState = reason === 'VALID_BBO_IDLE_TIMEOUT' ? 'STALLED' : 'DISCONNECTED';
    this.BTCDepthSubscriptionState = 'UNSUBSCRIBED';
    this.BTCDepthLastDisconnectReason = reason;
  }

  async getBTCMarketMetadata(signal?: AbortSignal): Promise<BTC_market_metadata> {
    const market = selectPerpetualMarket(
      await this.reader.markets.getAll(signal ? { fetchOptions: { signal } } : undefined),
      isBTCUSDMarket,
    );

    if (market === undefined) {
      throw new Error('Decibel BTC/USD perpetual market was not found');
    }

    this.exchangeSymbol = market.market_name;
    return this.normalizeMarket(market);
  }

  async getETHMarketMetadata(): Promise<BTC_market_metadata> {
    const market = selectPerpetualMarket(await this.reader.markets.getAll(), isETHUSDMarket);
    if (market === undefined) throw new Error('Decibel ETH/USD perpetual market was not found');
    return this.normalizeMarket(market);
  }

  async getBTCPrice(): Promise<BTC_market_price> {
    const exchangeSymbol =
      this.exchangeSymbol ?? (await this.getBTCMarketMetadata()).exchangeSymbol;
    const prices = z
      .array(SDKPriceSchema)
      .parse(await this.reader.marketPrices.getByName({ marketName: exchangeSymbol }));
    const price = prices.find((candidate) => candidate.market === exchangeSymbol) ?? prices[0];

    if (price === undefined) {
      throw new Error('Decibel returned no current BTC/USD price');
    }

    return {
      symbol: 'BTC/USD',
      exchangeSymbol,
      markPrice: price.mark_px,
      midPrice: price.mid_px,
      oraclePrice: price.oracle_px,
      observedAt: new Date(price.transaction_unix_ms),
    };
  }

  async getBTCHourlyCandlesticks(
    startTime: Date,
    endTime: Date,
    now: Date = new Date(),
  ): Promise<BTC_candlestick_history> {
    return this.getBTCCandlesticks('1h', startTime, endTime, now);
  }

  async getBTCCandlesticks(
    interval: candle_interval,
    startTime: Date,
    endTime: Date,
    now: Date = new Date(),
  ): Promise<BTC_candlestick_history> {
    const startUnixMs = startTime.getTime();
    const endUnixMs = endTime.getTime();
    const nowUnixMs = now.getTime();
    if (![startUnixMs, endUnixMs, nowUnixMs].every(Number.isSafeInteger)) {
      throw new Error('Candlestick time range must contain valid dates');
    }
    if (startUnixMs >= endUnixMs) {
      throw new Error('Candlestick start time must precede end time');
    }

    // Resolving metadata first binds the request and response to Decibel's concrete BTC market.
    const market = await this.getBTCMarketMetadata();
    const candles = z.array(SDKCandlestickSchema).parse(
      await this.reader.candlesticks.getByName({
        marketName: market.exchangeSymbol,
        interval,
        startTime: startUnixMs,
        endTime: endUnixMs,
      }),
    );
    const timestamps = new Set<number>();
    for (const candle of candles) {
      if (candle.i !== interval) {
        throw new Error(`Decibel returned an unexpected candle interval: ${candle.i}`);
      }
      if (candle.t !== alignTimestamp(candle.t, interval)) {
        throw new Error(`Decibel returned a misaligned ${interval} candle: ${candle.t}`);
      }
      if (timestamps.has(candle.t)) {
        throw new Error(`Decibel returned duplicate BTC candle timestamp: ${candle.t}`);
      }
      timestamps.add(candle.t);
    }

    return {
      symbol: 'BTC/USD',
      exchangeSymbol: market.exchangeSymbol,
      marketAddress: market.marketAddress,
      interval,
      candles: candles
        .filter((candle) => getNextTimestamp(candle.t, interval) <= nowUnixMs)
        .sort((left, right) => left.t - right.t)
        .map((candle) => ({
          ...this.normalizeCandlestick(candle),
        })),
    };
  }

  async getETHCandlesticks(
    interval: candle_interval,
    startTime: Date,
    endTime: Date,
    now: Date = new Date(),
  ): Promise<BTC_candlestick_history> {
    const market = await this.getETHMarketMetadata();
    const candles = await this.getCandlesticksForMarket(
      market.exchangeSymbol,
      interval,
      startTime,
      endTime,
      now,
      'ETH',
    );
    return {
      ...candles,
      exchangeSymbol: market.exchangeSymbol,
      marketAddress: market.marketAddress,
    };
  }

  private async getCandlesticksForMarket(
    exchangeSymbol: string,
    interval: candle_interval,
    startTime: Date,
    endTime: Date,
    now: Date,
    assetLabel: string,
  ): Promise<BTC_candlestick_history> {
    const startUnixMs = startTime.getTime(),
      endUnixMs = endTime.getTime(),
      nowUnixMs = now.getTime();
    if (![startUnixMs, endUnixMs, nowUnixMs].every(Number.isSafeInteger))
      throw new Error('Candlestick time range must contain valid dates');
    if (startUnixMs >= endUnixMs) throw new Error('Candlestick start time must precede end time');
    const candles = z.array(SDKCandlestickSchema).parse(
      await this.reader.candlesticks.getByName({
        marketName: exchangeSymbol,
        interval,
        startTime: startUnixMs,
        endTime: endUnixMs,
      }),
    );
    const timestamps = new Set<number>();
    for (const candle of candles) {
      if (candle.i !== interval)
        throw new Error(`Decibel returned an unexpected candle interval: ${candle.i}`);
      if (candle.t !== alignTimestamp(candle.t, interval))
        throw new Error(`Decibel returned a misaligned ${interval} candle: ${candle.t}`);
      if (timestamps.has(candle.t))
        throw new Error(`Decibel returned duplicate ${assetLabel} candle timestamp: ${candle.t}`);
      timestamps.add(candle.t);
    }
    return {
      symbol: 'BTC/USD',
      exchangeSymbol,
      marketAddress: '',
      interval,
      candles: candles
        .filter((candle) => getNextTimestamp(candle.t, interval) <= nowUnixMs)
        .sort((left, right) => left.t - right.t)
        .map((candle) => this.normalizeCandlestick(candle)),
    };
  }

  subscribeBTCCandlesticks(
    exchangeSymbol: string,
    interval: candle_interval,
    onCandle: (candle: BTC_candlestick) => void,
  ): () => void {
    return this.reader.candlesticks.subscribeByName(exchangeSymbol, interval, (message) => {
      const parsed = z.object({ candle: SDKCandlestickSchema }).parse(message).candle;
      if (parsed.i !== interval || parsed.t !== alignTimestamp(parsed.t, interval)) {
        throw new Error('Decibel returned an invalid WebSocket candle');
      }
      onCandle(this.normalizeCandlestick(parsed));
    });
  }

  subscribeBTCDepth(exchangeSymbol: string, onData: (message: unknown) => void): () => void {
    return this.reader.marketDepth.subscribeByName(exchangeSymbol, 1, onData);
  }

  subscribeBTCTrades(exchangeSymbol: string, onData: (message: unknown) => void): () => void {
    return this.reader.marketTrades.subscribeByName(exchangeSymbol, onData);
  }

  subscribeBTCMarketPrice(exchangeSymbol: string, onData: (message: unknown) => void): () => void {
    return this.reader.marketPrices.subscribeByName(exchangeSymbol, onData);
  }

  onWebSocketError(handler: () => void): () => void {
    this.webSocketErrorHandlers.add(handler);
    return () => this.webSocketErrorHandlers.delete(handler);
  }

  closeWebSocket(): void {
    if (this.BTCDepthProcessingTimer !== null) clearTimeout(this.BTCDepthProcessingTimer);
    this.BTCDepthProcessingTimer = null;
    this.pendingBTCDepthMessage = null;
    this.invalidateBTCDepthSubscription('CLIENT_CLOSED');
    this.reader.deps?.ws.close();
  }

  private normalizeMarket(market: sdk_market): BTC_market_metadata {
    return {
      symbol: 'BTC/USD',
      exchangeSymbol: market.market_name,
      marketAddress: market.market_addr,
      sizeDecimals: market.sz_decimals,
      priceDecimals: market.px_decimals,
      tickSize: normalizeChainUnits(market.tick_size, market.px_decimals),
      minimumSize: normalizeChainUnits(market.min_size, market.sz_decimals),
      lotSize: normalizeChainUnits(market.lot_size, market.sz_decimals),
      maximumLeverage: market.max_leverage,
      maximumOpenInterest: market.max_open_interest,
      mode: market.mode,
    };
  }

  private normalizeCandlestick(candle: z.infer<typeof SDKCandlestickSchema>): BTC_candlestick {
    return {
      timestamp: new Date(candle.t),
      open: candle.o,
      high: candle.h,
      low: candle.l,
      close: candle.c,
      volume: candle.v,
    };
  }
}
