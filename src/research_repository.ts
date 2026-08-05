import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { MICROSTRUCTURE_FEATURE_VERSION } from './microstructure_repository.js';
import type { maker_simulation_result } from './maker_execution_simulator.js';
import type { research_source } from './research_dataset.js';
import {
  type research_market_metadata,
  validateResearchMarketMetadata,
} from './research_market_metadata.js';
import type { research_sample } from './research_types.js';

type session_row = { session_id: string; started_at_ms: number; stopped_at_ms: number | null };
type event_row = { event_type: string; occurred_at_ms: number };

export class research_source_repository {
  private readonly database: Database.Database;
  constructor(databasePath: string) {
    this.database = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
      timeout: 5_000,
    });
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
          aggressor_side: research_source['trades'][number]['side'];
          price: number;
          size: number;
        }
      >(
        `SELECT e.economic_trade_id, MIN(p.received_at_ms) AS received_at_ms,
         e.classification_source, e.classification_reason, e.ambiguous,
         e.aggressor_side, e.price, e.size FROM microstructure_economic_trades e
         JOIN microstructure_trade_participants p ON p.economic_trade_id=e.economic_trade_id
         WHERE e.market_address=? AND p.ingestion_source='WEBSOCKET' AND p.received_at_ms<=?
         GROUP BY e.economic_trade_id`,
      )
      .all(marketAddress, endTimeMs)
      .map((row) => ({
        economicTradeId: row.economic_trade_id,
        receivedAtMs: row.received_at_ms,
        source: row.classification_source,
        reason: row.classification_reason,
        ambiguous: row.ambiguous === 1,
        side: row.aggressor_side,
        price: row.price,
        size: row.size,
      }));
    return { marketAddress, aggregates, books, trades, compatibleSegments };
  }
  getMarketAddresses(): string[] {
    return this.database
      .prepare<[], { market_address: string }>(
        `SELECT market_address FROM order_book_snapshots
         UNION SELECT market_address FROM market_price_snapshots
         UNION SELECT market_address FROM microstructure_aggregates_1s
         UNION SELECT market_address FROM microstructure_economic_trades
         ORDER BY market_address`,
      )
      .all()
      .map((row) => row.market_address);
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
          'Microstructure database remained busy for 5000ms; retry after the collector transaction completes',
          { cause: error },
        );
      throw error;
    }
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
  {
    version: 2,
    sql: `CREATE TABLE maker_simulation_orders (
      market_address TEXT NOT NULL, candidate_id TEXT NOT NULL, feature_version TEXT NOT NULL,
      simulator_version TEXT NOT NULL, fill_assumption TEXT NOT NULL, order_json TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY(market_address, candidate_id, feature_version, simulator_version, fill_assumption)
    ) WITHOUT ROWID;
    CREATE TABLE maker_simulation_fills (
      market_address TEXT NOT NULL, candidate_id TEXT NOT NULL, feature_version TEXT NOT NULL,
      simulator_version TEXT NOT NULL, fill_assumption TEXT NOT NULL, fill_index INTEGER NOT NULL,
      fill_json TEXT NOT NULL,
      PRIMARY KEY(market_address, candidate_id, feature_version, simulator_version, fill_assumption, fill_index)
    ) WITHOUT ROWID;`,
  },
  {
    version: 3,
    sql: `CREATE TABLE research_market_metadata_snapshots (
      market_address TEXT NOT NULL, metadata_version TEXT NOT NULL,
      tick_size REAL NOT NULL, lot_size REAL NOT NULL, minimum_size REAL NOT NULL,
      size_decimals INTEGER NOT NULL, price_decimals INTEGER NOT NULL,
      maximum_leverage REAL NOT NULL, observed_at_ms INTEGER NOT NULL,
      PRIMARY KEY(market_address, metadata_version)
    ) WITHOUT ROWID;
    CREATE INDEX research_market_metadata_observed
      ON research_market_metadata_snapshots(market_address, observed_at_ms DESC);`,
  },
] as const;
export type research_write_result = {
  inserted: number;
  updated: number;
  unchanged: number;
  total: number;
};
export type metadata_write_result = 'inserted' | 'updated' | 'unchanged';
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
  getSamples(): research_sample[] {
    return this.database
      .prepare<
        [],
        {
          market_address: string;
          candidate_id: string;
          feature_version: string;
          candidate_json: string;
          features_json: string;
          outcomes_json: string;
        }
      >(
        'SELECT market_address, candidate_id, feature_version, candidate_json, features_json, outcomes_json FROM research_samples ORDER BY decision_timestamp_ms, candidate_id',
      )
      .all()
      .map((row) => ({
        marketAddress: row.market_address,
        candidateId: row.candidate_id,
        featureVersion: row.feature_version,
        candidate: JSON.parse(row.candidate_json) as research_sample['candidate'],
        features: JSON.parse(row.features_json) as research_sample['features'],
        outcomes: JSON.parse(row.outcomes_json) as research_sample['outcomes'],
      }));
  }
  saveMarketMetadata(metadata: research_market_metadata): metadata_write_result {
    const value = validateResearchMarketMetadata(metadata);
    const old = this.database
      .prepare<
        [string, string],
        {
          tick_size: number;
          lot_size: number;
          minimum_size: number;
          size_decimals: number;
          price_decimals: number;
          maximum_leverage: number;
          observed_at_ms: number;
        }
      >(
        `SELECT tick_size, lot_size, minimum_size, size_decimals, price_decimals,
         maximum_leverage, observed_at_ms FROM research_market_metadata_snapshots
         WHERE market_address=? AND metadata_version=?`,
      )
      .get(value.marketAddress, value.metadataVersion);
    const observedAtMs = Date.parse(value.observedAt);
    if (
      old?.tick_size === value.tickSize &&
      old.lot_size === value.lotSize &&
      old.minimum_size === value.minimumSize &&
      old.size_decimals === value.sizeDecimals &&
      old.price_decimals === value.priceDecimals &&
      old.maximum_leverage === value.maximumLeverage
    )
      return 'unchanged';
    this.database
      .prepare(
        `INSERT INTO research_market_metadata_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(market_address, metadata_version) DO UPDATE SET
         tick_size=excluded.tick_size, lot_size=excluded.lot_size,
         minimum_size=excluded.minimum_size, size_decimals=excluded.size_decimals,
         price_decimals=excluded.price_decimals, maximum_leverage=excluded.maximum_leverage`,
      )
      .run(
        value.marketAddress,
        value.metadataVersion,
        value.tickSize,
        value.lotSize,
        value.minimumSize,
        value.sizeDecimals,
        value.priceDecimals,
        value.maximumLeverage,
        observedAtMs,
      );
    return old === undefined ? 'inserted' : 'updated';
  }
  getMarketMetadata(marketAddress: string): research_market_metadata | null {
    const row = this.database
      .prepare<
        [string],
        {
          market_address: string;
          metadata_version: string;
          tick_size: number;
          lot_size: number;
          minimum_size: number;
          size_decimals: number;
          price_decimals: number;
          maximum_leverage: number;
          observed_at_ms: number;
        }
      >(
        `SELECT * FROM research_market_metadata_snapshots WHERE market_address=?
         ORDER BY observed_at_ms DESC, metadata_version DESC LIMIT 1`,
      )
      .get(marketAddress);
    return row === undefined
      ? null
      : validateResearchMarketMetadata({
          marketAddress: row.market_address,
          metadataVersion: row.metadata_version,
          tickSize: row.tick_size,
          lotSize: row.lot_size,
          minimumSize: row.minimum_size,
          sizeDecimals: row.size_decimals,
          priceDecimals: row.price_decimals,
          maximumLeverage: row.maximum_leverage,
          observedAt: new Date(row.observed_at_ms).toISOString(),
        });
  }
  saveMakerSimulations(results: readonly maker_simulation_result[]): research_write_result {
    const get = this.database.prepare<
      [string, string, string, string, string],
      { order_json: string }
    >(
      `SELECT order_json FROM maker_simulation_orders WHERE market_address=? AND candidate_id=? AND feature_version=? AND simulator_version=? AND fill_assumption=?`,
    );
    const upsert = this.database.prepare(
      `INSERT INTO maker_simulation_orders VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(market_address, candidate_id, feature_version, simulator_version, fill_assumption)
       DO UPDATE SET order_json=excluded.order_json, updated_at_ms=excluded.updated_at_ms`,
    );
    const deleteFills = this.database.prepare(
      `DELETE FROM maker_simulation_fills WHERE market_address=? AND candidate_id=? AND feature_version=? AND simulator_version=? AND fill_assumption=?`,
    );
    const insertFill = this.database.prepare(
      'INSERT INTO maker_simulation_fills VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const counters = this.database.transaction(() => {
      let inserted = 0,
        updated = 0,
        unchanged = 0;
      for (const result of results) {
        const orderJson = JSON.stringify(result);
        const key = [
          result.marketAddress,
          result.candidateId,
          result.featureVersion,
          result.simulatorVersion,
          result.fillAssumption,
        ] as const;
        const old = get.get(...key);
        if (old?.order_json === orderJson) {
          unchanged++;
          continue;
        }
        upsert.run(...key, orderJson, Date.now());
        deleteFills.run(...key);
        result.fills.forEach((fill, index) => insertFill.run(...key, index, JSON.stringify(fill)));
        if (old === undefined) inserted++;
        else updated++;
      }
      return { inserted, updated, unchanged };
    })();
    const total = (
      this.database.prepare('SELECT COUNT(*) AS count FROM maker_simulation_orders').get() as {
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
