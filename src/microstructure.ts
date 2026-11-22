import { z } from 'zod';

const TimestampSchema = z.number().int().safe().nonnegative();
const PositiveSchema = z.number().positive().finite();
const DepthLevelSchema = z.object({ price: PositiveSchema, size: PositiveSchema });

const DepthMessageSchema = z.object({
  market: z.string().min(1),
  asks: z.array(DepthLevelSchema).min(1),
  bids: z.array(DepthLevelSchema).min(1),
  best_ask: PositiveSchema.nullish(),
  best_bid: PositiveSchema.nullish(),
  unix_ms: TimestampSchema,
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
