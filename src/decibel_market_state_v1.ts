import { createHash } from 'node:crypto';

import type {
  market_price_snapshot,
  normalized_trade,
  order_book_snapshot,
} from './microstructure.js';

export const DECIBEL_MARKET_MAKER_V1 = 'DECIBEL_MARKET_MAKER_V1' as const;

export type decibel_market_state_sequence_status =
  'CONTIGUOUS' | 'SEQUENCE_UNAVAILABLE' | 'GAP_DETECTED' | 'RECONCILIATION_PENDING' | 'RECONCILED';

export type decibel_market_state_failure_code =
  | 'MARKET_METADATA_MISSING'
  | 'MARKET_NOT_OPEN'
  | 'MARKET_MISMATCH'
  | 'BOOK_MISSING'
  | 'BOOK_CROSSED'
  | 'BOOK_STALE'
  | 'PRICE_STATE_MISSING'
  | 'PRICE_STATE_STALE'
  | 'TRADE_STATE_MISSING'
  | 'TRADE_STATE_STALE'
  | 'OBSERVATION_RECEIVED_AFTER_CONSTRUCTION'
  | 'OBSERVATION_TIMESTAMP_FUTURE'
  | 'BOOK_SEQUENCE_GAP'
  | 'BOOK_RECONCILIATION_PENDING'
  | 'CONNECTION_UNHEALTHY'
  | 'PERSISTENCE_UNAVAILABLE';

const FailureCodeOrder: readonly decibel_market_state_failure_code[] = [
  'MARKET_METADATA_MISSING',
  'MARKET_NOT_OPEN',
  'MARKET_MISMATCH',
  'BOOK_MISSING',
  'BOOK_CROSSED',
  'BOOK_STALE',
  'PRICE_STATE_MISSING',
  'PRICE_STATE_STALE',
  'TRADE_STATE_MISSING',
  'TRADE_STATE_STALE',
  'OBSERVATION_RECEIVED_AFTER_CONSTRUCTION',
  'OBSERVATION_TIMESTAMP_FUTURE',
  'BOOK_SEQUENCE_GAP',
  'BOOK_RECONCILIATION_PENDING',
  'CONNECTION_UNHEALTHY',
  'PERSISTENCE_UNAVAILABLE',
] as const;

export type decibel_market_state_metadata = Readonly<{
  marketAddress: string;
  exchangeSymbol: string;
  tickSize: number;
  lotSize: number;
  minimumSize: number;
  priceDecimals: number;
  sizeDecimals: number;
  mode: 'Open' | 'ReduceOnly' | 'AllowlistOnly' | 'Halt' | 'Delisting';
  observedAt: Date;
}>;

export type decibel_market_state_sequence = Readonly<{
  connectionEpoch: string | null;
  sequenceNumber: bigint | null;
  previousSequenceNumber: bigint | null;
  status: decibel_market_state_sequence_status;
}>;

export type decibel_market_state_configuration = Readonly<{
  maximumBookAgeMs: number;
  maximumPriceAgeMs: number;
  maximumTradeAgeMs: number;
  maximumClockSkewMs: number;
  tradesRequired: boolean;
  pricesRequired?: boolean;
}>;

export type decibel_market_state_input = Readonly<{
  constructedAt: Date;
  metadata: decibel_market_state_metadata | null;
  book: order_book_snapshot | null;
  prices: market_price_snapshot | null;
  trades?: readonly normalized_trade[];
  sequence: decibel_market_state_sequence;
  connectionHealthy: boolean;
  persistenceAvailable: boolean;
  configuration: decibel_market_state_configuration;
}>;

type freshness = Readonly<{
  exchangeTimestamp: Date | null;
  receivedAt: Date | null;
  ageMs: number | null;
  maximumAgeMs: number;
  fresh: boolean;
}>;

export type decibel_market_state_v1 = Readonly<{
  strategyId: typeof DECIBEL_MARKET_MAKER_V1;
  stateId: string;
  constructedAt: Date;
  metadata: decibel_market_state_metadata | null;
  book: Readonly<{
    marketAddress: string;
    bestBid: number;
    bestAsk: number;
    bestBidSize: number;
    bestAskSize: number;
    spread: number;
    midpoint: number;
    microprice: number;
    top5DepthImbalance: number;
    exchangeTimestamp: Date;
    receivedAt: Date;
    sequence: decibel_market_state_sequence;
  }> | null;
  prices: Readonly<{
    marketAddress: string;
    markPrice: number;
    midPrice: number;
    oraclePrice: number;
    exchangeTimestamp: Date;
    receivedAt: Date;
  }> | null;
  trades: readonly Readonly<{
    economicTradeId: string;
    marketAddress: string;
    side: 'BUY' | 'SELL' | 'UNKNOWN';
    price: number;
    size: number;
    exchangeTimestamp: Date;
    receivedAt: Date;
  }>[];
  freshness: Readonly<{
    book: freshness;
    prices: freshness;
    trades: freshness;
  }>;
  connectionHealthy: boolean;
  persistenceAvailable: boolean;
  usable: boolean;
  failureCodes: readonly decibel_market_state_failure_code[];
}>;

function assertConfiguration(configuration: decibel_market_state_configuration): void {
  for (const value of [
    configuration.maximumBookAgeMs,
    configuration.maximumPriceAgeMs,
    configuration.maximumTradeAgeMs,
    configuration.maximumClockSkewMs,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error('DECIBEL_MARKET_STATE_INVALID_CONFIGURATION');
  }
}

function cloneDate(value: Date): Date {
  const timestamp = value.getTime();
  if (!Number.isSafeInteger(timestamp)) throw new Error('DECIBEL_MARKET_STATE_INVALID_TIMESTAMP');
  return new Date(timestamp);
}

function getFreshness(
  observation: { exchangeTimestamp: Date; receivedAt: Date } | null,
  constructedAtMs: number,
  maximumAgeMs: number,
): freshness {
  if (observation === null)
    return Object.freeze({
      exchangeTimestamp: null,
      receivedAt: null,
      ageMs: null,
      maximumAgeMs,
      fresh: false,
    });
  const receivedAtMs = observation.receivedAt.getTime();
  const ageMs = constructedAtMs - receivedAtMs;
  return Object.freeze({
    exchangeTimestamp: cloneDate(observation.exchangeTimestamp),
    receivedAt: cloneDate(observation.receivedAt),
    ageMs,
    maximumAgeMs,
    fresh: ageMs >= 0 && ageMs <= maximumAgeMs,
  });
}

function stableValue(value: unknown): string {
  if (value === null) return 'null';
  if (value instanceof Date) return `date:${value.getTime()}`;
  if (typeof value === 'bigint') return `bigint:${value.toString()}`;
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableValue(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function freezeState<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object' && !(child instanceof Date)) {
      freezeState(child as object);
    }
  }
  return Object.freeze(value);
}

export function buildDecibelMarketStateV1(
  input: decibel_market_state_input,
): decibel_market_state_v1 {
  assertConfiguration(input.configuration);
  const constructedAt = cloneDate(input.constructedAt);
  const constructedAtMs = constructedAt.getTime();
  const trades = [...(input.trades ?? [])];
  const latestTrade = trades.reduce<normalized_trade | null>(
    (latest, trade) => (latest === null || trade.receivedAt > latest.receivedAt ? trade : latest),
    null,
  );
  const bookFreshness = getFreshness(
    input.book,
    constructedAtMs,
    input.configuration.maximumBookAgeMs,
  );
  const priceFreshness = getFreshness(
    input.prices,
    constructedAtMs,
    input.configuration.maximumPriceAgeMs,
  );
  const tradeFreshness = getFreshness(
    latestTrade,
    constructedAtMs,
    input.configuration.maximumTradeAgeMs,
  );

  const found = new Set<decibel_market_state_failure_code>();
  if (input.metadata === null) found.add('MARKET_METADATA_MISSING');
  else if (input.metadata.mode !== 'Open') found.add('MARKET_NOT_OPEN');
  if (input.book === null) found.add('BOOK_MISSING');
  else {
    if (input.book.bestBid >= input.book.bestAsk) found.add('BOOK_CROSSED');
    if (!bookFreshness.fresh) found.add('BOOK_STALE');
  }
  if (input.prices === null) {
    if (input.configuration.pricesRequired !== false) found.add('PRICE_STATE_MISSING');
  } else if (!priceFreshness.fresh) found.add('PRICE_STATE_STALE');
  if (input.configuration.tradesRequired && trades.length === 0) found.add('TRADE_STATE_MISSING');
  if (input.configuration.tradesRequired && trades.length > 0 && !tradeFreshness.fresh)
    found.add('TRADE_STATE_STALE');

  const marketAddresses = [
    input.metadata?.marketAddress,
    input.book?.marketAddress,
    input.prices?.marketAddress,
    ...trades.map((trade) => trade.marketAddress),
  ].filter((value): value is string => value !== undefined);
  if (new Set(marketAddresses).size > 1) found.add('MARKET_MISMATCH');

  const observations = [
    ...(input.book === null ? [] : [input.book]),
    ...(input.prices === null ? [] : [input.prices]),
    ...trades,
  ];
  if (observations.some((observation) => observation.receivedAt.getTime() > constructedAtMs))
    found.add('OBSERVATION_RECEIVED_AFTER_CONSTRUCTION');
  if (
    observations.some(
      (observation) =>
        observation.exchangeTimestamp.getTime() >
        constructedAtMs + input.configuration.maximumClockSkewMs,
    )
  )
    found.add('OBSERVATION_TIMESTAMP_FUTURE');
  if (input.sequence.status === 'GAP_DETECTED') found.add('BOOK_SEQUENCE_GAP');
  if (input.sequence.status === 'RECONCILIATION_PENDING') found.add('BOOK_RECONCILIATION_PENDING');
  if (!input.connectionHealthy) found.add('CONNECTION_UNHEALTHY');
  if (!input.persistenceAvailable) found.add('PERSISTENCE_UNAVAILABLE');
  const failureCodes = FailureCodeOrder.filter((code) => found.has(code));

  const metadata =
    input.metadata === null
      ? null
      : {
          ...input.metadata,
          observedAt: cloneDate(input.metadata.observedAt),
        };
  const sequence = {
    ...input.sequence,
  };
  const book =
    input.book === null
      ? null
      : {
          marketAddress: input.book.marketAddress,
          bestBid: input.book.bestBid,
          bestAsk: input.book.bestAsk,
          bestBidSize: input.book.bestBidSize,
          bestAskSize: input.book.bestAskSize,
          spread: input.book.spread,
          midpoint: input.book.midPrice,
          microprice: input.book.microprice,
          top5DepthImbalance: input.book.top5DepthImbalance,
          exchangeTimestamp: cloneDate(input.book.exchangeTimestamp),
          receivedAt: cloneDate(input.book.receivedAt),
          sequence,
        };
  const prices =
    input.prices === null
      ? null
      : {
          marketAddress: input.prices.marketAddress,
          markPrice: input.prices.markPrice,
          midPrice: input.prices.midPrice,
          oraclePrice: input.prices.oraclePrice,
          exchangeTimestamp: cloneDate(input.prices.exchangeTimestamp),
          receivedAt: cloneDate(input.prices.receivedAt),
        };
  const copiedTrades = trades.map((trade) => ({
    economicTradeId: trade.economicTradeId,
    marketAddress: trade.marketAddress,
    side: trade.side,
    price: trade.price,
    size: trade.size,
    exchangeTimestamp: cloneDate(trade.exchangeTimestamp),
    receivedAt: cloneDate(trade.receivedAt),
  }));
  const causalState = {
    strategyId: DECIBEL_MARKET_MAKER_V1,
    constructedAt,
    metadata,
    book,
    prices,
    trades: copiedTrades,
    freshness: {
      book: bookFreshness,
      prices: priceFreshness,
      trades: tradeFreshness,
    },
    connectionHealthy: input.connectionHealthy,
    persistenceAvailable: input.persistenceAvailable,
    usable: failureCodes.length === 0,
    failureCodes,
  };
  const stateId = `decibel_market_state_${createHash('sha256')
    .update(stableValue({ causalState, configuration: input.configuration }))
    .digest('hex')}`;
  return freezeState({ ...causalState, stateId });
}
