import { z } from 'zod';
import { createHash } from 'node:crypto';

const TimestampSchema = z.number().int().safe().nonnegative();
const PositiveSchema = z.number().positive().finite();
const NonnegativeSchema = z.number().nonnegative().finite();
const DepthLevelSchema = z.object({ price: PositiveSchema, size: PositiveSchema });

const DepthMessageSchema = z.object({
  market: z.string().min(1),
  asks: z.array(DepthLevelSchema).min(1),
  bids: z.array(DepthLevelSchema).min(1),
  best_ask: PositiveSchema.nullish(),
  best_bid: PositiveSchema.nullish(),
  unix_ms: TimestampSchema,
});

const TradeSchema = z.object({
  trade_id: z.union([z.string().min(1), z.number().int().safe().nonnegative()]).optional(),
  account: z.string().default(''),
  order_id: z.union([z.string(), z.number().int().safe()]).optional(),
  market: z.string().min(1),
  action: z.string().min(1),
  size: PositiveSchema,
  price: PositiveSchema,
  transaction_unix_ms: TimestampSchema,
  transaction_version: z.number().int().safe().nonnegative(),
  is_taker: z.boolean().optional(),
  liquidity_role: z.string().optional(),
});

const TradeMessageSchema = z.object({ trades: z.array(TradeSchema) });
const RESTTradeSchema = TradeSchema.extend({
  trade_id: z.union([z.string().min(1), z.number().int().safe().nonnegative()]),
});
const RESTTradePageSchema = z.object({
  items: z.array(RESTTradeSchema),
  total_count: z.number().int().nonnegative().nullable().optional(),
});
const PriceMessageSchema = z.object({
  price: z.object({
    market: z.string().min(1),
    mark_px: PositiveSchema,
    mid_px: PositiveSchema,
    oracle_px: PositiveSchema,
    funding_rate_bps: z.number().finite(),
    is_funding_positive: z.boolean(),
    open_interest: NonnegativeSchema,
    transaction_unix_ms: TimestampSchema,
  }),
});

export type trade_side = 'BUY' | 'SELL' | 'UNKNOWN';
export type ingestion_source = 'REST_BOOTSTRAP' | 'WEBSOCKET' | 'UNKNOWN';
export type aggressor_classification_reason =
  | 'EXPLICIT_IS_TAKER'
  | 'EXPLICIT_LIQUIDITY_ROLE'
  | 'NO_EXPLICIT_AGGRESSOR_SEMANTICS'
  | 'UNRECOGNIZED_TAKER_ACTION'
  | 'AMBIGUOUS_ECONOMIC_FIELDS'
  | 'CONFLICTING_AGGRESSOR_SIDES'
  | 'QUOTE_TEST_AT_ASK'
  | 'QUOTE_TEST_AT_BID'
  | 'QUOTE_TEST_ABOVE_MID'
  | 'QUOTE_TEST_BELOW_MID'
  | 'QUOTE_TEST_EXACT_MID'
  | 'QUOTE_TEST_NO_PRIOR_BOOK'
  | 'QUOTE_TEST_STALE_BOOK'
  | 'QUOTE_TEST_INVALID_BOOK'
  | 'LEGACY_UNKNOWN';
export type aggressor_classification_source = 'EXPLICIT' | 'ESTIMATED_QUOTE_TEST' | 'UNKNOWN';
export type aggressor_confidence = 'HIGH' | 'MEDIUM' | 'NONE';
export type stream_name = 'depth' | 'trades' | 'marketPrice';
export type stream_health =
  'starting' | 'waiting' | 'healthy' | 'stale' | 'reconnecting' | 'stopped';

export type normalized_trade = {
  eventId: string;
  economicTradeId: string;
  marketAddress: string;
  side: trade_side;
  classificationReason: aggressor_classification_reason;
  classificationSource: aggressor_classification_source;
  classificationConfidence: aggressor_confidence;
  matchedBookTimestamp: Date | null;
  matchedBookAgeMs: number | null;
  ingestionSource: ingestion_source;
  participantAccount: string;
  orderId: string;
  action: string;
  transactionVersion: number;
  price: number;
  size: number;
  exchangeTimestamp: Date;
  receivedAt: Date;
};

export type order_book_snapshot = {
  bids?: readonly Readonly<{ price: number; size: number }>[];
  asks?: readonly Readonly<{ price: number; size: number }>[];
  marketAddress: string;
  exchangeTimestamp: Date;
  receivedAt: Date;
  bestBid: number;
  bestAsk: number;
  spread: number;
  midPrice: number;
  microprice: number;
  bestBidSize: number;
  bestAskSize: number;
  top5DepthImbalance: number;
};

export type market_price_snapshot = {
  marketAddress: string;
  exchangeTimestamp: Date;
  receivedAt: Date;
  markPrice: number;
  midPrice: number;
  oraclePrice: number;
  fundingRate: number;
  openInterest: number;
};

export type microstructure_aggregate = {
  marketAddress: string;
  secondTimestamp: Date;
  buyVolume: number;
  sellVolume: number;
  unknownVolume: number;
  tradeCount: number;
  vwap: number | null;
  spread: number | null;
  depthImbalance: number | null;
  orderFlowImbalance: number;
  bookAgeMs: number | null;
  marketPriceAgeMs: number | null;
  markPrice: number | null;
  midPrice: number | null;
  oraclePrice: number | null;
  fundingRate: number | null;
  openInterest: number | null;
};

function validateMarket(received: string, expected: string): void {
  if (received !== expected) throw new Error('Microstructure payload market does not match BTC');
}

export function normalizeDepthPayload(
  payload: unknown,
  marketAddress: string,
  receivedAt = new Date(),
): order_book_snapshot {
  const depth = DepthMessageSchema.parse(payload);
  validateMarket(depth.market, marketAddress);
  const bids = [...depth.bids].sort((left, right) => right.price - left.price);
  const asks = [...depth.asks].sort((left, right) => left.price - right.price);
  const bestBidLevel = bids[0];
  const bestAskLevel = asks[0];
  if (bestBidLevel === undefined || bestAskLevel === undefined) throw new Error('Depth is empty');
  if (new Set(bids.map((level) => level.price)).size !== bids.length)
    throw new Error('Depth contains duplicate bid prices');
  if (new Set(asks.map((level) => level.price)).size !== asks.length)
    throw new Error('Depth contains duplicate ask prices');
  if (depth.best_bid != null && depth.best_bid !== bestBidLevel.price)
    throw new Error('Depth best bid is inconsistent');
  if (depth.best_ask != null && depth.best_ask !== bestAskLevel.price)
    throw new Error('Depth best ask is inconsistent');
  if (bestBidLevel.price >= bestAskLevel.price) throw new Error('Crossed BTC order book');
  const bidSize = bids.slice(0, 5).reduce((sum, level) => sum + level.size, 0);
  const askSize = asks.slice(0, 5).reduce((sum, level) => sum + level.size, 0);
  const topSize = bestBidLevel.size + bestAskLevel.size;
  const totalDepth = bidSize + askSize;
  return {
    bids,
    asks,
    marketAddress,
    exchangeTimestamp: new Date(depth.unix_ms),
    receivedAt,
    bestBid: bestBidLevel.price,
    bestAsk: bestAskLevel.price,
    spread: bestAskLevel.price - bestBidLevel.price,
    midPrice: (bestAskLevel.price + bestBidLevel.price) / 2,
    microprice:
      topSize === 0
        ? (bestAskLevel.price + bestBidLevel.price) / 2
        : (bestAskLevel.price * bestBidLevel.size + bestBidLevel.price * bestAskLevel.size) /
          topSize,
    bestBidSize: bestBidLevel.size,
    bestAskSize: bestAskLevel.size,
    top5DepthImbalance: totalDepth === 0 ? 0 : (bidSize - askSize) / totalDepth,
  };
}

function normalizeSide(action: string): trade_side {
  const normalized = action.toLowerCase();
  if (normalized.includes('buy') || normalized.includes('long')) return 'BUY';
  if (normalized.includes('sell') || normalized.includes('short')) return 'SELL';
  return 'UNKNOWN';
}

function classifyAggressor(trade: z.infer<typeof TradeSchema>): {
  side: trade_side;
  reason: aggressor_classification_reason;
} {
  const role = trade.liquidity_role?.toLowerCase();
  if (trade.is_taker === true) {
    const side = normalizeSide(trade.action);
    return {
      side,
      reason: side === 'UNKNOWN' ? 'UNRECOGNIZED_TAKER_ACTION' : 'EXPLICIT_IS_TAKER',
    };
  }
  if (role === 'taker') {
    const side = normalizeSide(trade.action);
    return {
      side,
      reason: side === 'UNKNOWN' ? 'UNRECOGNIZED_TAKER_ACTION' : 'EXPLICIT_LIQUIDITY_ROLE',
    };
  }
  return { side: 'UNKNOWN', reason: 'NO_EXPLICIT_AGGRESSOR_SEMANTICS' };
}

function normalizeTradeRow(
  trade: z.infer<typeof TradeSchema>,
  marketAddress: string,
  receivedAt: Date,
  ingestionSource: ingestion_source,
): normalized_trade {
  validateMarket(trade.market, marketAddress);
  const tradeId = trade.trade_id === undefined ? undefined : String(trade.trade_id);
  const economicTradeId =
    tradeId ??
    `transaction:${trade.transaction_version}:${trade.transaction_unix_ms}:${trade.price}:${trade.size}`;
  const orderId = trade.order_id === undefined ? '' : String(trade.order_id);
  const stableRowIdentity = JSON.stringify([
    economicTradeId,
    trade.transaction_version,
    trade.account,
    orderId,
    trade.action,
    trade.market,
    trade.price,
    trade.size,
    trade.transaction_unix_ms,
  ]);
  const classification = classifyAggressor(trade);
  return {
    eventId: createHash('sha256').update(stableRowIdentity).digest('hex'),
    economicTradeId,
    marketAddress,
    side: classification.side,
    classificationReason: classification.reason,
    classificationSource: classification.side === 'UNKNOWN' ? 'UNKNOWN' : 'EXPLICIT',
    classificationConfidence: classification.side === 'UNKNOWN' ? 'NONE' : 'HIGH',
    matchedBookTimestamp: null,
    matchedBookAgeMs: null,
    ingestionSource,
    participantAccount: trade.account,
    orderId,
    action: trade.action,
    transactionVersion: trade.transaction_version,
    price: trade.price,
    size: trade.size,
    exchangeTimestamp: new Date(trade.transaction_unix_ms),
    receivedAt,
  };
}

export function estimateWebSocketTradeAggressors(
  trades: readonly normalized_trade[],
  latestBook: order_book_snapshot | undefined,
  maximumBookAgeMs: number,
): normalized_trade[] {
  const grouped = new Map<string, normalized_trade[]>();
  for (const trade of trades) {
    const rows = grouped.get(trade.economicTradeId) ?? [];
    rows.push(trade);
    grouped.set(trade.economicTradeId, rows);
  }
  return trades.map((trade) => {
    if (trade.ingestionSource !== 'WEBSOCKET' || trade.side !== 'UNKNOWN') return trade;
    const rows = grouped.get(trade.economicTradeId) ?? [trade];
    if (rows.some((row) => row.classificationSource === 'EXPLICIT' && row.side !== 'UNKNOWN'))
      return trade;
    const agrees = rows.every(
      (row) =>
        row.marketAddress === trade.marketAddress &&
        row.price === trade.price &&
        row.size === trade.size &&
        row.exchangeTimestamp.getTime() === trade.exchangeTimestamp.getTime() &&
        row.transactionVersion === trade.transactionVersion,
    );
    if (!agrees) return { ...trade, classificationReason: 'AMBIGUOUS_ECONOMIC_FIELDS' };
    if (latestBook === undefined || latestBook.receivedAt > trade.receivedAt)
      return { ...trade, classificationReason: 'QUOTE_TEST_NO_PRIOR_BOOK' };
    if (latestBook.bestBid >= latestBook.bestAsk || latestBook.midPrice <= 0)
      return { ...trade, classificationReason: 'QUOTE_TEST_INVALID_BOOK' };
    const age = trade.receivedAt.getTime() - latestBook.receivedAt.getTime();
    if (age > maximumBookAgeMs)
      return {
        ...trade,
        classificationReason: 'QUOTE_TEST_STALE_BOOK',
        matchedBookTimestamp: latestBook.exchangeTimestamp,
        matchedBookAgeMs: age,
      };
    let side: trade_side = 'UNKNOWN';
    let reason: aggressor_classification_reason = 'QUOTE_TEST_EXACT_MID';
    if (trade.price >= latestBook.bestAsk) {
      side = 'BUY';
      reason = 'QUOTE_TEST_AT_ASK';
    } else if (trade.price <= latestBook.bestBid) {
      side = 'SELL';
      reason = 'QUOTE_TEST_AT_BID';
    } else if (trade.price > latestBook.midPrice) {
      side = 'BUY';
      reason = 'QUOTE_TEST_ABOVE_MID';
    } else if (trade.price < latestBook.midPrice) {
      side = 'SELL';
      reason = 'QUOTE_TEST_BELOW_MID';
    }
    return {
      ...trade,
      side,
      classificationReason: reason,
      classificationSource: side === 'UNKNOWN' ? 'UNKNOWN' : 'ESTIMATED_QUOTE_TEST',
      classificationConfidence: side === 'UNKNOWN' ? 'NONE' : 'MEDIUM',
      matchedBookTimestamp: latestBook.exchangeTimestamp,
      matchedBookAgeMs: age,
    };
  });
}

export function normalizeTradePayload(
  payload: unknown,
  marketAddress: string,
  receivedAt = new Date(),
  ingestionSource: ingestion_source = 'WEBSOCKET',
): normalized_trade[] {
  return TradeMessageSchema.parse(payload).trades.map((trade) =>
    normalizeTradeRow(trade, marketAddress, receivedAt, ingestionSource),
  );
}

export type normalized_trade_page = {
  trades: normalized_trade[];
  totalCount: number | null;
};

export function normalizeRESTTradePage(
  payload: unknown,
  marketAddress: string,
  receivedAt = new Date(),
): normalized_trade_page {
  const page = RESTTradePageSchema.parse(payload);
  const trades = page.items.map((trade) =>
    normalizeTradeRow(trade, marketAddress, receivedAt, 'REST_BOOTSTRAP'),
  );
  return { trades, totalCount: page.total_count ?? null };
}

export function normalizeMarketPricePayload(
  payload: unknown,
  marketAddress: string,
  receivedAt = new Date(),
): market_price_snapshot {
  const { price } = PriceMessageSchema.parse(payload);
  validateMarket(price.market, marketAddress);
  return {
    marketAddress,
    exchangeTimestamp: new Date(price.transaction_unix_ms),
    receivedAt,
    markPrice: price.mark_px,
    midPrice: price.mid_px,
    oraclePrice: price.oracle_px,
    fundingRate: (price.is_funding_positive ? 1 : -1) * (Math.abs(price.funding_rate_bps) / 10_000),
    openInterest: price.open_interest,
  };
}
