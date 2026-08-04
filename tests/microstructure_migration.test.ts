import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { microstructure_repository } from '../src/microstructure_repository.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('microstructure schema migration', () => {
  it('preserves legacy rows and marks their source and classification UNKNOWN', () => {
    const directory = mkdtempSync(join(tmpdir(), 'decibel-microstructure-'));
    directories.push(directory);
    const path = join(directory, 'legacy.sqlite');
    const LegacyDatabase = new Database(path);
    LegacyDatabase.exec(`
      CREATE TABLE microstructure_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO microstructure_schema_migrations VALUES (1, 'old'), (2, 'old'), (3, 'old');
      CREATE TABLE microstructure_trades (event_id TEXT PRIMARY KEY, market_address TEXT, side TEXT, price REAL, size REAL, exchange_timestamp_ms INTEGER, received_at_ms INTEGER);
      CREATE TABLE order_book_snapshots (market_address TEXT, exchange_timestamp_ms INTEGER, received_at_ms INTEGER, best_bid REAL, best_ask REAL, spread REAL, mid_price REAL, microprice REAL, best_bid_size REAL, best_ask_size REAL, depth_imbalance REAL, PRIMARY KEY(market_address, exchange_timestamp_ms));
      CREATE TABLE market_price_snapshots (market_address TEXT, exchange_timestamp_ms INTEGER, received_at_ms INTEGER, mark_price REAL, mid_price REAL, oracle_price REAL, funding_rate REAL, open_interest REAL, PRIMARY KEY(market_address, exchange_timestamp_ms));
      CREATE TABLE microstructure_aggregates_1s (market_address TEXT, second_timestamp_ms INTEGER, buy_volume REAL, sell_volume REAL, trade_count INTEGER, vwap REAL, spread REAL, depth_imbalance REAL, order_flow_imbalance REAL, unknown_volume REAL DEFAULT 0, PRIMARY KEY(market_address, second_timestamp_ms));
      CREATE TABLE microstructure_economic_trades (economic_trade_id TEXT PRIMARY KEY, market_address TEXT, price REAL, size REAL, exchange_timestamp_ms INTEGER, transaction_version INTEGER, aggressor_side TEXT, ambiguous INTEGER DEFAULT 0, flow_counted INTEGER DEFAULT 0);
      CREATE TABLE microstructure_trade_participants (row_key TEXT PRIMARY KEY, economic_trade_id TEXT, market_address TEXT, participant_account TEXT, order_id TEXT, action TEXT, aggressor_side TEXT, price REAL, size REAL, exchange_timestamp_ms INTEGER, transaction_version INTEGER, received_at_ms INTEGER);
      INSERT INTO microstructure_economic_trades VALUES ('trade', 'btc', 100, 1, 1000, 1, 'UNKNOWN', 0, 0);
      INSERT INTO microstructure_trade_participants VALUES ('row', 'trade', 'btc', '', '', 'Buy', 'UNKNOWN', 100, 1, 1000, 1, 2000);
    `);
    LegacyDatabase.close();

    const Repository = new microstructure_repository(path);
    const sessionId = Repository.startCollectorSession('btc', 3_000);
    Repository.recordSessionEvent(sessionId, 'DISCONNECT', 4_000);
    Repository.recordSessionEvent(sessionId, 'RECONNECT', 5_000);
    Repository.recordSessionEvent(sessionId, 'GRACEFUL_SHUTDOWN', 6_000);
    Repository.incrementDiagnostic('malformed_messages', 'depth', 2);
    Repository.close();
    const ReopenedRepository = new microstructure_repository(path);
    ReopenedRepository.close();
    const MigratedDatabase = new Database(path, { readonly: true });
    expect(
      MigratedDatabase.prepare(
        'SELECT ingestion_source, classification_reason, persisted_at_ms FROM microstructure_trade_participants',
      ).get(),
    ).toEqual({
      ingestion_source: 'UNKNOWN',
      classification_reason: 'LEGACY_UNKNOWN',
      persisted_at_ms: 0,
    });
    expect(
      MigratedDatabase.prepare(
        'SELECT ingestion_source, classification_reason, persisted_at_ms FROM microstructure_economic_trades',
      ).get(),
    ).toEqual({
      ingestion_source: 'UNKNOWN',
      classification_reason: 'LEGACY_UNKNOWN',
      persisted_at_ms: 0,
    });
    expect(
      MigratedDatabase.prepare(
        'SELECT MAX(version) AS version FROM microstructure_schema_migrations',
      ).get(),
    ).toEqual({ version: 4 });
    expect(
      MigratedDatabase.prepare(
        'SELECT started_at_ms, stopped_at_ms, graceful_shutdown_at_ms FROM microstructure_collector_sessions',
      ).get(),
    ).toEqual({ started_at_ms: 3_000, stopped_at_ms: 6_000, graceful_shutdown_at_ms: 6_000 });
    expect(
      MigratedDatabase.prepare(
        "SELECT count FROM microstructure_diagnostics WHERE metric='malformed_messages' AND stream='depth'",
      ).get(),
    ).toEqual({ count: 2 });
    MigratedDatabase.close();
  });
});
