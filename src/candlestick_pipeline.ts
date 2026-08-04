import { alignTimestamp, getNextTimestamp, type candle_interval } from './candle_interval.js';
import type { candlestick_write_result } from './candlestick_repository.js';
import type { BTC_candlestick_history, BTC_market_metadata } from './decibel_client.js';

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_PAGE_CANDLES = 500;

export interface candlestick_history_client {
  getBTCMarketMetadata(): Promise<BTC_market_metadata>;
  getBTCCandlesticks(
    interval: candle_interval,
    startTime: Date,
    endTime: Date,
    now: Date,
  ): Promise<BTC_candlestick_history>;
}

export interface candlestick_history_repository {
  saveCandlesticks(history: BTC_candlestick_history): candlestick_write_result;
  getLatestTimestamp(marketAddress: string, interval: candle_interval): Date | null;
  getTotalCandlesticks(marketAddress: string, interval: candle_interval): number;
  findMissingTimestamps(
    marketAddress: string,
    interval: candle_interval,
    startTime: Date,
    endTime: Date,
  ): Date[];
}

export type candlestick_pipeline_result = candlestick_write_result & {
  requestedStartTime: Date;
  completedThroughTime: Date;
  missingIntervalCount: number;
  firstMissingCandleTime: Date | null;
  lastMissingCandleTime: Date | null;
};

function advanceTimestamp(timestamp: number, interval: candle_interval, count: number): number {
  let result = timestamp;
  for (let index = 0; index < count; index += 1) {
    result = getNextTimestamp(result, interval);
  }
  return result;
}

export async function syncBTCCandlesticks(
  client: candlestick_history_client,
  repository: candlestick_history_repository,
  interval: candle_interval,
  now: Date = new Date(),
  lookbackMs = DEFAULT_LOOKBACK_MS,
  pageCandleLimit = DEFAULT_PAGE_CANDLES,
): Promise<candlestick_pipeline_result> {
  const market = await client.getBTCMarketMetadata();
  const completedThrough = alignTimestamp(now.getTime(), interval);
  const requestedStart = alignTimestamp(completedThrough - lookbackMs, interval);
  const latest = repository.getLatestTimestamp(market.marketAddress, interval);
  const existingMissing = repository.findMissingTimestamps(
    market.marketAddress,
    interval,
    new Date(requestedStart),
    new Date(completedThrough),
  );
  let cursor =
    existingMissing.at(0)?.getTime() ??
    (latest === null ? requestedStart : getNextTimestamp(latest.getTime(), interval));
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  while (cursor < completedThrough) {
    const pageEnd = Math.min(advanceTimestamp(cursor, interval, pageCandleLimit), completedThrough);
    const history = await client.getBTCCandlesticks(
      interval,
      new Date(cursor),
      new Date(pageEnd),
      now,
    );
    const completedHistory = {
      ...history,
      candles: history.candles.filter(
        (candle) => getNextTimestamp(candle.timestamp.getTime(), interval) <= now.getTime(),
      ),
    };
    const counts = repository.saveCandlesticks(completedHistory);
    inserted += counts.inserted;
    updated += counts.updated;
    unchanged += counts.unchanged;
    cursor = pageEnd;
  }

  const missing = repository.findMissingTimestamps(
    market.marketAddress,
    interval,
    new Date(requestedStart),
    new Date(completedThrough),
  );
  return {
    inserted,
    updated,
    unchanged,
    total: repository.getTotalCandlesticks(market.marketAddress, interval),
    requestedStartTime: new Date(requestedStart),
    completedThroughTime: new Date(completedThrough),
    missingIntervalCount: missing.length,
    firstMissingCandleTime: missing.at(0) ?? null,
    lastMissingCandleTime: missing.at(-1) ?? null,
  };
}
