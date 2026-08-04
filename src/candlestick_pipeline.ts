import { alignTimestamp, getNextTimestamp, type candle_interval } from './candle_interval.js';
import { z } from 'zod';
import type { candlestick_write_result } from './candlestick_repository.js';
import type { BTC_candlestick_history, BTC_market_metadata } from './decibel_client.js';

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_PAGE_CANDLES = 500;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;

const HTTPErrorSchema = z.union([
  z.object({ status: z.number().int() }),
  z.object({ response: z.object({ status: z.number().int() }) }),
]);

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

export type candlestick_page_progress = candlestick_write_result & {
  page: number;
  startTime: Date;
  endTime: Date;
};

export type candlestick_sync_options = {
  maxRetries?: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  onPage?: (progress: candlestick_page_progress) => void;
  onRetry?: (attempt: number, delayMs: number) => void;
};

function advanceTimestamp(timestamp: number, interval: candle_interval, count: number): number {
  let result = timestamp;
  for (let index = 0; index < count; index += 1) {
    result = getNextTimestamp(result, interval);
  }
  return result;
}

function getHTTPStatus(error: unknown): number | null {
  const parsed = HTTPErrorSchema.safeParse(error);
  if (!parsed.success) {
    return null;
  }
  return 'status' in parsed.data ? parsed.data.status : parsed.data.response.status;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof z.ZodError) {
    return false;
  }
  const status = getHTTPStatus(error);
  if (status !== null) {
    return status === 429 || status >= 500;
  }
  return error instanceof TypeError;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function fetchCandlestickPage(
  client: candlestick_history_client,
  interval: candle_interval,
  startTime: Date,
  endTime: Date,
  now: Date,
  options: candlestick_sync_options,
): Promise<BTC_candlestick_history> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const wait = options.sleep ?? delay;
  let retry = 0;
  while (true) {
    try {
      return await client.getBTCCandlesticks(interval, startTime, endTime, now);
    } catch (error: unknown) {
      if (!isRetryableError(error) || retry >= maxRetries) {
        throw error;
      }
      const waitTime = retryDelayMs * 2 ** retry;
      retry += 1;
      options.onRetry?.(retry, waitTime);
      await wait(waitTime);
    }
  }
}

export async function syncBTCCandlesticks(
  client: candlestick_history_client,
  repository: candlestick_history_repository,
  interval: candle_interval,
  now: Date = new Date(),
  lookbackMs = DEFAULT_LOOKBACK_MS,
  pageCandleLimit = DEFAULT_PAGE_CANDLES,
  options: candlestick_sync_options = {},
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
  let page = 0;

  while (cursor < completedThrough) {
    const pageEnd = Math.min(advanceTimestamp(cursor, interval, pageCandleLimit), completedThrough);
    const history = await fetchCandlestickPage(
      client,
      interval,
      new Date(cursor),
      new Date(pageEnd),
      now,
      options,
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
    page += 1;
    options.onPage?.({
      ...counts,
      page,
      startTime: new Date(cursor),
      endTime: new Date(pageEnd),
    });
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
