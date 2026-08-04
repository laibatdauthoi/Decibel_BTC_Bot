import type { BTC_market_metadata } from './decibel_client.js';
import { normalizeRESTTradePage, type normalized_trade } from './microstructure.js';
import type { microstructure_store } from './microstructure_collector.js';

const MAXIMUM_PAGE_SIZE = 200;
const MAXIMUM_BOOTSTRAP_TRADES = 10_000;

export interface recent_trade_client {
  getBTCRecentTradesPage(
    this: void,
    marketAddress: string,
    limit: number,
    offset: number,
  ): Promise<unknown>;
}

export type trade_bootstrap_result = {
  fetched: number;
  rawRows: number;
  economicTrades: number;
  duplicateRows: number;
  participantRows: number;
  ambiguousTrades: number;
  oldestTimestamp: Date | null;
  newestTimestamp: Date | null;
};

export async function bootstrapRecentBTCTrades(
  client: recent_trade_client,
  repository: microstructure_store,
  market: BTC_market_metadata,
  requestedLimit: number,
  maximumBatchSize: number,
): Promise<trade_bootstrap_result> {
  if (
    !Number.isInteger(requestedLimit) ||
    requestedLimit < 0 ||
    requestedLimit > MAXIMUM_BOOTSTRAP_TRADES
  )
    throw new Error('Microstructure bootstrap trade limit must be between 0 and 10000');
  if (!Number.isInteger(maximumBatchSize) || maximumBatchSize < 1)
    throw new Error('Microstructure bootstrap batch size must be positive');
  let fetched = 0;
  let participantRows = 0;
  let duplicateRows = 0;
  const economicTradeIds = new Set<string>();
  const ambiguousTradeIds = new Set<string>();
  let oldestTimestamp: Date | null = null;
  let newestTimestamp: Date | null = null;

  while (fetched < requestedLimit) {
    const pageLimit = Math.min(MAXIMUM_PAGE_SIZE, requestedLimit - fetched);
    const payload = await client.getBTCRecentTradesPage(market.marketAddress, pageLimit, fetched);
    const page = normalizeRESTTradePage(payload, market.marketAddress);
    if (page.trades.length > pageLimit)
      throw new Error('Decibel returned more trades than the requested page limit');
    if (page.trades.length === 0) break;
    for (const trade of page.trades) economicTradeIds.add(trade.economicTradeId);

    for (let offset = 0; offset < page.trades.length; offset += maximumBatchSize) {
      const batch: normalized_trade[] = page.trades.slice(offset, offset + maximumBatchSize);
      const result = repository.saveBatch(batch, [], [], [], maximumBatchSize);
      participantRows += result.participantRows;
      duplicateRows += result.duplicateTrades;
      for (const tradeId of result.ambiguousTradeIds) ambiguousTradeIds.add(tradeId);
    }
    for (const trade of page.trades) {
      if (oldestTimestamp === null || trade.exchangeTimestamp < oldestTimestamp)
        oldestTimestamp = trade.exchangeTimestamp;
      if (newestTimestamp === null || trade.exchangeTimestamp > newestTimestamp)
        newestTimestamp = trade.exchangeTimestamp;
    }
    fetched += page.trades.length;
    if (page.trades.length < pageLimit || (page.totalCount !== null && fetched >= page.totalCount))
      break;
  }

  return {
    fetched,
    rawRows: fetched,
    economicTrades: economicTradeIds.size,
    duplicateRows,
    participantRows,
    ambiguousTrades: ambiguousTradeIds.size,
    oldestTimestamp,
    newestTimestamp,
  };
}
