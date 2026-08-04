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

const SDKMarketSchema = z.object({
  market_addr: z.string().min(1),
  market_name: z.string().min(1),
  sz_decimals: z.number().int().nonnegative(),
  px_decimals: z.number().int().nonnegative(),
  max_leverage: z.number().positive(),
  tick_size: z.number().int().safe().positive(),
  min_size: z.number().int().safe().positive(),
  lot_size: z.number().int().safe().positive(),
  max_open_interest: z.number().nonnegative(),
  mode: z.enum(['Open', 'ReduceOnly', 'AllowlistOnly', 'Halt', 'Delisting']),
});

const SDKPriceSchema = z.object({
  market: z.string().min(1),
  mark_px: z.number().positive().finite(),
  mid_px: z.number().positive().finite(),
  oracle_px: z.number().positive().finite(),
  transaction_unix_ms: z.number().int().nonnegative(),
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
  markets: { getAll(): Promise<unknown> };
  marketPrices: { getByName(args: { marketName: string }): Promise<unknown> };
  candlesticks: {
    getByName(args: {
      marketName: string;
      interval: candle_interval;
      startTime: number;
      endTime: number;
    }): Promise<unknown>;
    subscribeByName(
      marketName: string,
      interval: candle_interval,
      onData: (message: unknown) => void,
    ): () => void;
  };
  deps?: { ws: { close(): void } };
}

export type reader_factory = (
  config: DecibelConfig,
  options: { nodeApiKey?: string; onWsError?: (error: unknown) => void },
) => decibel_market_reader;

const defaultReaderFactory: reader_factory = (config, options) =>
  new DecibelReadDex(config, options);

function isBTCUSDMarket(name: string): boolean {
  return /^BTC(?:[-/]USD|-PERP)$/i.test(name);
}

function normalizeChainUnits(value: number, decimals: number): number {
  return value / 10 ** decimals;
}

export class decibel_client {
  private readonly reader: decibel_market_reader;
  private readonly webSocketErrorHandlers = new Set<() => void>();
  private exchangeSymbol: string | undefined;

  constructor(
    config: Pick<application_config, 'network' | 'nodeApiKey' | 'marketSymbol'>,
    createReader: reader_factory = defaultReaderFactory,
  ) {
    const networkConfig = config.network === 'mainnet' ? MAINNET_CONFIG : TESTNET_CONFIG;
    const options = {
      ...(config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey }),
      onWsError: () => {
        for (const handler of this.webSocketErrorHandlers) {
          handler();
        }
      },
    };
    this.reader = createReader(networkConfig, options);
  }

  async getBTCMarketMetadata(): Promise<BTC_market_metadata> {
    const markets = z.array(SDKMarketSchema).parse(await this.reader.markets.getAll());
    const market = markets.find((candidate) => isBTCUSDMarket(candidate.market_name));

    if (market === undefined) {
      throw new Error('Decibel BTC/USD perpetual market was not found');
    }

    this.exchangeSymbol = market.market_name;
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

  onWebSocketError(handler: () => void): () => void {
    this.webSocketErrorHandlers.add(handler);
    return () => this.webSocketErrorHandlers.delete(handler);
  }

  closeWebSocket(): void {
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
