import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

import {
  alignTimestamp,
  getIntervalMilliseconds,
  getNextTimestamp,
  type candle_interval,
} from './candle_interval.js';
import type { BTC_candlestick_history, BTC_hourly_candlestick } from './decibel_client.js';

const StoredCandleSchema = z.object({
  timestamp: z.date(),
  open: z.number().positive().finite(),
  high: z.number().positive().finite(),
  low: z.number().positive().finite(),
  close: z.number().positive().finite(),
  volume: z.number().nonnegative().finite(),
});

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE candlesticks (
        market_address TEXT NOT NULL,
        interval TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        PRIMARY KEY (market_address, interval, timestamp_ms)
      ) WITHOUT ROWID;
    `,
  },
  {
    version: 2,
    sql: `CREATE TABLE candlestick_market_symbols (
      symbol TEXT PRIMARY KEY,
      market_address TEXT NOT NULL UNIQUE,
      observed_at_ms INTEGER NOT NULL
    );`,
  },
] as const;

type stored_candle_row = {
  timestamp_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type candlestick_write_result = {
  inserted: number;
  updated: number;
  unchanged: number;
  total: number;
};

export type candlestick_group_count = {
  marketAddress: string;
  interval: string;
  candleCount: number;
};

export class candlestick_repository {
  private readonly database: Database.Database;

  constructor(databasePath: string) {
    if (databasePath !== ':memory:') {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.database = new Database(databasePath, { timeout: 5_000 });
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('foreign_keys = ON');
    this.applyMigrations();
  }

  saveMarketSymbol(
    symbol: 'BTC/USD' | 'ETH/USD',
    marketAddress: string,
    observedAt = new Date(),
  ): void {
    if (!marketAddress) throw new Error('Candlestick market address is required');
    this.database
      .prepare(
        `INSERT INTO candlestick_market_symbols(symbol,market_address,observed_at_ms)
         VALUES(?,?,?) ON CONFLICT(symbol) DO UPDATE SET
         market_address=excluded.market_address,observed_at_ms=excluded.observed_at_ms`,
      )
      .run(symbol, marketAddress, observedAt.getTime());
  }

  saveCandlesticks(history: BTC_candlestick_history): candlestick_write_result {
    const uniqueCandles = new Map<number, BTC_hourly_candlestick>();
    for (const candidate of history.candles) {
      const candle = StoredCandleSchema.parse(candidate);
      const timestamp = candle.timestamp.getTime();
      if (!Number.isSafeInteger(timestamp)) {
        throw new Error('Candlestick timestamp must be a valid date');
      }
      if (timestamp !== alignTimestamp(timestamp, history.interval)) {
        throw new Error(`Candlestick timestamp is not aligned to ${history.interval}`);
      }
      uniqueCandles.set(timestamp, candle);
    }

    const existing = this.database.prepare<[string, string, number], stored_candle_row>(
      `SELECT timestamp_ms, open, high, low, close, volume
       FROM candlesticks
       WHERE market_address = ? AND interval = ? AND timestamp_ms = ?`,
    );
    const upsert = this.database.prepare<
      [string, string, number, number, number, number, number, number]
    >(
      `INSERT INTO candlesticks (
         market_address, interval, timestamp_ms, open, high, low, close, volume
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (market_address, interval, timestamp_ms) DO UPDATE SET
         open = excluded.open,
         high = excluded.high,
         low = excluded.low,
         close = excluded.close,
         volume = excluded.volume`,
    );
    const writeBatch = this.database.transaction(() => {
      let inserted = 0;
      let updated = 0;
      let unchanged = 0;
      for (const [timestamp, candle] of uniqueCandles) {
        const stored = existing.get(history.marketAddress, history.interval, timestamp);
        const isUnchanged =
          stored !== undefined &&
          stored.open === candle.open &&
          stored.high === candle.high &&
          stored.low === candle.low &&
          stored.close === candle.close &&
          stored.volume === candle.volume;
        if (isUnchanged) {
          unchanged += 1;
          continue;
        }
        upsert.run(
          history.marketAddress,
          history.interval,
          timestamp,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
        );
        if (stored !== undefined) {
          updated += 1;
        } else {
          inserted += 1;
        }
      }
      return { inserted, updated, unchanged };
    });
    const counts = writeBatch();

    return {
      ...counts,
      total: this.getTotalCandlesticks(history.marketAddress, history.interval),
    };
  }

  getCandlesticks(
    marketAddress: string,
    interval: candle_interval,
    completedAtOrBeforeMs = Number.MAX_SAFE_INTEGER,
  ): BTC_hourly_candlestick[] {
    const intervalMilliseconds = getIntervalMilliseconds(interval);
    const rows = this.database
      .prepare<[string, string, number], stored_candle_row>(
        `SELECT timestamp_ms, open, high, low, close, volume
         FROM candlesticks
         WHERE market_address = ? AND interval = ?
           AND timestamp_ms <= ?
         ORDER BY timestamp_ms ASC`,
      )
      .all(marketAddress, interval, completedAtOrBeforeMs - intervalMilliseconds);

    return rows.map((row) => ({
      timestamp: new Date(row.timestamp_ms),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    }));
  }

  getLatestTimestamp(marketAddress: string, interval: candle_interval): Date | null {
    const row = this.database
      .prepare<[string, string], { timestamp_ms: number }>(
        `SELECT timestamp_ms
         FROM candlesticks
         WHERE market_address = ? AND interval = ?
         ORDER BY timestamp_ms DESC
         LIMIT 1`,
      )
      .get(marketAddress, interval);
    return row === undefined ? null : new Date(row.timestamp_ms);
  }

  getTotalCandlesticks(marketAddress: string, interval: candle_interval): number {
    const row = this.database
      .prepare<[string, string], { count: number }>(
        `SELECT COUNT(*) AS count
         FROM candlesticks
         WHERE market_address = ? AND interval = ?`,
      )
      .get(marketAddress, interval);
    return row?.count ?? 0;
  }

  getMarketAddresses(interval: candle_interval): string[] {
    return this.database
      .prepare<[string], { market_address: string }>(
        `SELECT DISTINCT market_address
         FROM candlesticks
         WHERE interval = ?
         ORDER BY market_address ASC`,
      )
      .all(interval)
      .map((row) => row.market_address);
  }

  getCandleGroupCounts(
    intervalFilter?: candle_interval,
    completedAtOrBeforeMs = Number.MAX_SAFE_INTEGER,
  ): candlestick_group_count[] {
    if (intervalFilter !== undefined) {
      const intervalMilliseconds = getIntervalMilliseconds(intervalFilter);
      return this.database
        .prepare<
          [string, number],
          { market_address: string; interval: string; candle_count: number }
        >(
          `SELECT market_address, interval, COUNT(*) AS candle_count
           FROM candlesticks
           WHERE interval=? AND timestamp_ms <= ?
           GROUP BY market_address, interval ORDER BY market_address, interval`,
        )
        .all(intervalFilter, completedAtOrBeforeMs - intervalMilliseconds)
        .map((row) => ({
          marketAddress: row.market_address,
          interval: row.interval,
          candleCount: row.candle_count,
        }))
        .filter((row) => row.candleCount > 0);
    }
    return this.database
      .prepare<[], { market_address: string; interval: string; candle_count: number }>(
        `SELECT market_address, interval, COUNT(*) AS candle_count
         FROM candlesticks
         GROUP BY market_address, interval
         ORDER BY market_address ASC, interval ASC`,
      )
      .all()
      .map((row) => ({
        marketAddress: row.market_address,
        interval: row.interval,
        candleCount: row.candle_count,
      }));
  }

  readSnapshot<T>(reader: () => T): T {
    try {
      this.database.exec('BEGIN DEFERRED');
      const value = reader();
      this.database.exec('COMMIT');
      return value;
    } catch (error) {
      if (this.database.inTransaction) this.database.exec('ROLLBACK');
      if (error instanceof Error && 'code' in error && error.code === 'SQLITE_BUSY')
        throw new Error(
          'Candlestick database remained busy for 5000ms; stop the conflicting writer or retry after its transaction completes',
          { cause: error },
        );
      throw error;
    }
  }

  findMissingTimestamps(
    marketAddress: string,
    interval: candle_interval,
    startTime: Date,
    endTime: Date,
  ): Date[] {
    const present = new Set(
      this.getCandlesticks(marketAddress, interval).map((candle) => candle.timestamp.getTime()),
    );
    const missing: Date[] = [];
    for (
      let timestamp = startTime.getTime();
      timestamp < endTime.getTime();
      timestamp = getNextTimestamp(timestamp, interval)
    ) {
      if (!present.has(timestamp)) {
        missing.push(new Date(timestamp));
      }
    }
    return missing;
  }

  getSchemaVersion(): number {
    return this.database.pragma('user_version', { simple: true }) as number;
  }

  getJournalMode(): string {
    return this.database.pragma('journal_mode', { simple: true }) as string;
  }

  close(): void {
    this.database.close();
  }

  private applyMigrations(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    const applied = this.database
      .prepare<[], { version: number }>('SELECT version FROM schema_migrations')
      .all()
      .map((row) => row.version);
    const appliedVersions = new Set(applied);

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }
      this.database.transaction(() => {
        this.database.exec(migration.sql);
        this.database
          .prepare<[number, string]>(
            'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
          )
          .run(migration.version, new Date().toISOString());
        this.database.pragma(`user_version = ${migration.version}`);
      })();
    }
  }
}
