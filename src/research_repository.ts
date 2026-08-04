import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { MICROSTRUCTURE_FEATURE_VERSION } from './microstructure_repository.js';
import type { research_source } from './research_dataset.js';
import type { research_sample } from './research_types.js';

type session_row = { session_id: string; started_at_ms: number; stopped_at_ms: number | null };
type event_row = { event_type: string; occurred_at_ms: number };

export class research_source_repository {
  private readonly database: Database.Database;
  constructor(databasePath: string) {
    this.database = new Database(databasePath, { readonly: true, fileMustExist: true });
  }

  loadSource(marketAddress: string, endTimeMs: number): research_source {
    const sessions = this.database
      .prepare<[string, string], session_row>(
        `SELECT session_id, started_at_ms, stopped_at_ms FROM microstructure_collector_sessions WHERE market_address=? AND feature_version=? ORDER BY started_at_ms`,
      )
      .all(marketAddress, MICROSTRUCTURE_FEATURE_VERSION);
    const eventStatement = this.database.prepare<[string], event_row>(
      'SELECT event_type, occurred_at_ms FROM microstructure_collector_session_events WHERE session_id=? ORDER BY occurred_at_ms, event_id',
    );
    const compatibleSegments: research_source['compatibleSegments'] = [];
    for (const session of sessions) {
      let start: number | null = session.started_at_ms;
      for (const event of eventStatement.all(session.session_id)) {
        if (
          (event.event_type === 'DISCONNECT' ||
            event.event_type === 'STOP' ||
            event.event_type === 'GRACEFUL_SHUTDOWN') &&
          start !== null
        ) {
          compatibleSegments.push({ startTimeMs: start, endTimeMs: event.occurred_at_ms });
          start = null;
        } else if (
          (event.event_type === 'START' || event.event_type === 'RECONNECT') &&
          start === null
        )
          start = event.occurred_at_ms;
      }
      if (start !== null)
        compatibleSegments.push({
          startTimeMs: start,
          endTimeMs: Math.min(session.stopped_at_ms ?? endTimeMs, endTimeMs),
        });
    }
    const aggregates = this.database
      .prepare<
        [string, number],
        {
          second_timestamp_ms: number;
          buy_volume: number;
          sell_volume: number;
          unknown_volume: number;
          trade_count: number;
          vwap: number | null;
          spread: number | null;
          depth_imbalance: number | null;
          order_flow_imbalance: number | null;
          book_age_ms: number | null;
          market_price_age_ms: number | null;
          mid_price: number | null;
        }
      >(
        `SELECT second_timestamp_ms, buy_volume, sell_volume, unknown_volume, trade_count, vwap, spread, depth_imbalance, order_flow_imbalance, book_age_ms, market_price_age_ms, mid_price FROM microstructure_aggregates_1s WHERE market_address=? AND second_timestamp_ms<? ORDER BY second_timestamp_ms`,
      )
      .all(marketAddress, endTimeMs)
      .map((row) => ({
        timestampMs: row.second_timestamp_ms,
        buyVolume: row.buy_volume,
        sellVolume: row.sell_volume,
        unknownVolume: row.unknown_volume,
        tradeCount: row.trade_count,
        vwap: row.vwap,
        spread: row.spread,
        depthImbalance: row.depth_imbalance,
        orderFlowImbalance: row.order_flow_imbalance,
        bookAgeMs: row.book_age_ms,
        marketPriceAgeMs: row.market_price_age_ms,
        midPrice: row.mid_price,
      }));
    const books = this.database
      .prepare<
        [string, number],
        {
          received_at_ms: number;
          best_bid: number;
          best_ask: number;
          best_bid_size: number;
          best_ask_size: number;
          spread: number;
          mid_price: number;
          microprice: number;
          depth_imbalance: number;
        }
      >(
        `SELECT received_at_ms, best_bid, best_ask, best_bid_size, best_ask_size, spread, mid_price, microprice, depth_imbalance FROM order_book_snapshots WHERE market_address=? AND received_at_ms<=? ORDER BY received_at_ms`,
      )
      .all(marketAddress, endTimeMs)
      .map((row) => ({
        receivedAtMs: row.received_at_ms,
        bestBid: row.best_bid,
        bestAsk: row.best_ask,
        bestBidSize: row.best_bid_size,
        bestAskSize: row.best_ask_size,
        spread: row.spread,
        midPrice: row.mid_price,
        microprice: row.microprice,
        depthImbalance: row.depth_imbalance,
      }));
    const trades = this.database
      .prepare<
        [string, number],
        {
          economic_trade_id: string;
          received_at_ms: number;
          classification_source: research_source['trades'][number]['source'];
          classification_reason: research_source['trades'][number]['reason'];
          ambiguous: number;
        }
      >(
        `SELECT e.economic_trade_id, MIN(p.received_at_ms) AS received_at_ms, e.classification_source, e.classification_reason, e.ambiguous FROM microstructure_economic_trades e JOIN microstructure_trade_participants p ON p.economic_trade_id=e.economic_trade_id WHERE e.market_address=? AND p.ingestion_source='WEBSOCKET' AND p.received_at_ms<=? GROUP BY e.economic_trade_id`,
      )
      .all(marketAddress, endTimeMs)
      .map((row) => ({
        economicTradeId: row.economic_trade_id,
        receivedAtMs: row.received_at_ms,
        source: row.classification_source,
        reason: row.classification_reason,
        ambiguous: row.ambiguous === 1,
      }));
    return { marketAddress, aggregates, books, trades, compatibleSegments };
  }
  close(): void {
    this.database.close();
  }
}

const migrations = [
  {
    version: 1,
    sql: `CREATE TABLE research_samples (market_address TEXT NOT NULL, candidate_id TEXT NOT NULL, feature_version TEXT NOT NULL, decision_timestamp_ms INTEGER NOT NULL, candidate_json TEXT NOT NULL, features_json TEXT NOT NULL, outcomes_json TEXT NOT NULL, updated_at_ms INTEGER NOT NULL, PRIMARY KEY(market_address, candidate_id, feature_version)) WITHOUT ROWID;`,
  },
] as const;
export type research_write_result = {
  inserted: number;
  updated: number;
  unchanged: number;
  total: number;
};
export class research_dataset_repository {
  private readonly database: Database.Database;
  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma('journal_mode = WAL');
    this.applyMigrations();
  }
  save(samples: readonly research_sample[]): research_write_result {
    const get = this.database.prepare<
      [string, string, string],
      { candidate_json: string; features_json: string; outcomes_json: string }
    >(
      'SELECT candidate_json, features_json, outcomes_json FROM research_samples WHERE market_address=? AND candidate_id=? AND feature_version=?',
    );
    const upsert = this.database.prepare(
      `INSERT INTO research_samples VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(market_address, candidate_id, feature_version) DO UPDATE SET decision_timestamp_ms=excluded.decision_timestamp_ms, candidate_json=excluded.candidate_json, features_json=excluded.features_json, outcomes_json=excluded.outcomes_json, updated_at_ms=excluded.updated_at_ms`,
    );
    const counters = this.database.transaction(() => {
      let inserted = 0,
        updated = 0,
        unchanged = 0;
      for (const sample of samples) {
        const candidate = JSON.stringify(sample.candidate);
        const features = JSON.stringify(sample.features);
        const outcomes = JSON.stringify(sample.outcomes);
        const old = get.get(sample.marketAddress, sample.candidateId, sample.featureVersion);
        if (
          old?.candidate_json === candidate &&
          old.features_json === features &&
          old.outcomes_json === outcomes
        ) {
          unchanged++;
          continue;
        }
        upsert.run(
          sample.marketAddress,
          sample.candidateId,
          sample.featureVersion,
          Date.parse(sample.candidate.availableAtTime),
          candidate,
          features,
          outcomes,
          Date.now(),
        );
        if (old === undefined) inserted++;
        else updated++;
      }
      return { inserted, updated, unchanged };
    })();
    const total = (
      this.database.prepare('SELECT COUNT(*) AS count FROM research_samples').get() as {
        count: number;
      }
    ).count;
    return { ...counters, total };
  }
  getCount(): number {
    return (
      this.database.prepare('SELECT COUNT(*) AS count FROM research_samples').get() as {
        count: number;
      }
    ).count;
  }
  close(): void {
    this.database.close();
  }
  private applyMigrations(): void {
    this.database.exec(
      'CREATE TABLE IF NOT EXISTS research_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
    );
    const applied = new Set(
      (
        this.database.prepare('SELECT version FROM research_schema_migrations').all() as Array<{
          version: number;
        }>
      ).map((row) => row.version),
    );
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      this.database.transaction(() => {
        this.database.exec(migration.sql);
        this.database
          .prepare('INSERT INTO research_schema_migrations VALUES (?,?)')
          .run(migration.version, new Date().toISOString());
        this.database.pragma(`user_version = ${migration.version}`);
      })();
    }
  }
}
