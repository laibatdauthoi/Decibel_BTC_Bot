import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  market_price_snapshot,
  microstructure_aggregate,
  normalized_trade,
  order_book_snapshot,
} from './microstructure.js';
import type { BTC_market_metadata } from './decibel_client.js';

export const MICROSTRUCTURE_FEATURE_VERSION = 'V5_CONTINUOUS_AGGREGATES';

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE microstructure_trades (
        event_id TEXT PRIMARY KEY, market_address TEXT NOT NULL, side TEXT NOT NULL,
        price REAL NOT NULL, size REAL NOT NULL, exchange_timestamp_ms INTEGER NOT NULL,
        received_at_ms INTEGER NOT NULL
      ) WITHOUT ROWID;
      CREATE INDEX trades_market_time ON microstructure_trades(market_address, exchange_timestamp_ms);
      CREATE TABLE order_book_snapshots (
        market_address TEXT NOT NULL, exchange_timestamp_ms INTEGER NOT NULL,
        received_at_ms INTEGER NOT NULL, best_bid REAL NOT NULL, best_ask REAL NOT NULL,
        spread REAL NOT NULL, mid_price REAL NOT NULL, microprice REAL NOT NULL,
        best_bid_size REAL NOT NULL, best_ask_size REAL NOT NULL, depth_imbalance REAL NOT NULL,
        PRIMARY KEY(market_address, exchange_timestamp_ms)
      ) WITHOUT ROWID;
      CREATE TABLE market_price_snapshots (
        market_address TEXT NOT NULL, exchange_timestamp_ms INTEGER NOT NULL,
        received_at_ms INTEGER NOT NULL, mark_price REAL NOT NULL, mid_price REAL NOT NULL,
        oracle_price REAL NOT NULL, funding_rate REAL NOT NULL, open_interest REAL NOT NULL,
        PRIMARY KEY(market_address, exchange_timestamp_ms)
      ) WITHOUT ROWID;
      CREATE TABLE microstructure_aggregates_1s (
        market_address TEXT NOT NULL, second_timestamp_ms INTEGER NOT NULL,
        buy_volume REAL NOT NULL, sell_volume REAL NOT NULL, trade_count INTEGER NOT NULL,
        vwap REAL, spread REAL, depth_imbalance REAL, order_flow_imbalance REAL NOT NULL,
        PRIMARY KEY(market_address, second_timestamp_ms)
      ) WITHOUT ROWID;
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE microstructure_economic_trades (
        economic_trade_id TEXT PRIMARY KEY, market_address TEXT NOT NULL,
        price REAL NOT NULL, size REAL NOT NULL, exchange_timestamp_ms INTEGER NOT NULL,
        transaction_version INTEGER NOT NULL, aggressor_side TEXT NOT NULL,
        ambiguous INTEGER NOT NULL DEFAULT 0, flow_counted INTEGER NOT NULL DEFAULT 0
      ) WITHOUT ROWID;
      CREATE TABLE microstructure_trade_participants (
        row_key TEXT PRIMARY KEY, economic_trade_id TEXT NOT NULL,
        market_address TEXT NOT NULL, participant_account TEXT NOT NULL,
        order_id TEXT NOT NULL, action TEXT NOT NULL, aggressor_side TEXT NOT NULL,
        price REAL NOT NULL, size REAL NOT NULL, exchange_timestamp_ms INTEGER NOT NULL,
        transaction_version INTEGER NOT NULL, received_at_ms INTEGER NOT NULL,
        FOREIGN KEY(economic_trade_id) REFERENCES microstructure_economic_trades(economic_trade_id)
      ) WITHOUT ROWID;
      CREATE INDEX participant_trade_id ON microstructure_trade_participants(economic_trade_id);
      CREATE INDEX participant_market_time ON microstructure_trade_participants(market_address, exchange_timestamp_ms);
    `,
  },
  {
    version: 3,
    sql: `ALTER TABLE microstructure_aggregates_1s ADD COLUMN unknown_volume REAL NOT NULL DEFAULT 0;`,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE microstructure_trades ADD COLUMN ingestion_source TEXT NOT NULL DEFAULT 'UNKNOWN';
      ALTER TABLE microstructure_trades ADD COLUMN classification_reason TEXT NOT NULL DEFAULT 'LEGACY_UNKNOWN';
      ALTER TABLE microstructure_trades ADD COLUMN persisted_at_ms INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE microstructure_economic_trades ADD COLUMN ingestion_source TEXT NOT NULL DEFAULT 'UNKNOWN';
      ALTER TABLE microstructure_economic_trades ADD COLUMN classification_reason TEXT NOT NULL DEFAULT 'LEGACY_UNKNOWN';
      ALTER TABLE microstructure_economic_trades ADD COLUMN persisted_at_ms INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE microstructure_trade_participants ADD COLUMN ingestion_source TEXT NOT NULL DEFAULT 'UNKNOWN';
      ALTER TABLE microstructure_trade_participants ADD COLUMN classification_reason TEXT NOT NULL DEFAULT 'LEGACY_UNKNOWN';
      ALTER TABLE microstructure_trade_participants ADD COLUMN persisted_at_ms INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE order_book_snapshots ADD COLUMN persisted_at_ms INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE market_price_snapshots ADD COLUMN persisted_at_ms INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE microstructure_aggregates_1s ADD COLUMN persisted_at_ms INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE microstructure_collector_sessions (
        session_id TEXT PRIMARY KEY, market_address TEXT NOT NULL, started_at_ms INTEGER NOT NULL,
        stopped_at_ms INTEGER, graceful_shutdown_at_ms INTEGER
      ) WITHOUT ROWID;
      CREATE TABLE microstructure_collector_session_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, event_type TEXT NOT NULL,
        occurred_at_ms INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES microstructure_collector_sessions(session_id)
      );
      CREATE INDEX collector_session_event_time ON microstructure_collector_session_events(session_id, occurred_at_ms);
      CREATE TABLE microstructure_diagnostics (
        metric TEXT NOT NULL, stream TEXT NOT NULL DEFAULT '', count INTEGER NOT NULL,
        PRIMARY KEY(metric, stream)
      ) WITHOUT ROWID;
    `,
  },
  {
    version: 5,
    sql: `
      ALTER TABLE microstructure_economic_trades ADD COLUMN classification_source TEXT NOT NULL DEFAULT 'UNKNOWN';
      ALTER TABLE microstructure_economic_trades ADD COLUMN classification_confidence TEXT NOT NULL DEFAULT 'NONE';
      ALTER TABLE microstructure_economic_trades ADD COLUMN matched_book_timestamp_ms INTEGER;
      ALTER TABLE microstructure_economic_trades ADD COLUMN matched_book_age_ms INTEGER;
      ALTER TABLE microstructure_trade_participants ADD COLUMN classification_source TEXT NOT NULL DEFAULT 'UNKNOWN';
      ALTER TABLE microstructure_trade_participants ADD COLUMN classification_confidence TEXT NOT NULL DEFAULT 'NONE';
      ALTER TABLE microstructure_trade_participants ADD COLUMN matched_book_timestamp_ms INTEGER;
      ALTER TABLE microstructure_trade_participants ADD COLUMN matched_book_age_ms INTEGER;
      ALTER TABLE microstructure_aggregates_1s ADD COLUMN book_age_ms INTEGER;
      ALTER TABLE microstructure_aggregates_1s ADD COLUMN market_price_age_ms INTEGER;
      ALTER TABLE microstructure_aggregates_1s ADD COLUMN mark_price REAL;
      ALTER TABLE microstructure_aggregates_1s ADD COLUMN mid_price REAL;
      ALTER TABLE microstructure_aggregates_1s ADD COLUMN oracle_price REAL;
      ALTER TABLE microstructure_aggregates_1s ADD COLUMN funding_rate REAL;
      ALTER TABLE microstructure_aggregates_1s ADD COLUMN open_interest REAL;
    `,
  },
  {
    version: 6,
    sql: `
      ALTER TABLE microstructure_collector_sessions ADD COLUMN feature_version TEXT NOT NULL DEFAULT 'LEGACY_UNKNOWN';
      CREATE TABLE microstructure_session_diagnostics (
        session_id TEXT NOT NULL, metric TEXT NOT NULL, stream TEXT NOT NULL DEFAULT '',
        count INTEGER NOT NULL, PRIMARY KEY(session_id, metric, stream),
        FOREIGN KEY(session_id) REFERENCES microstructure_collector_sessions(session_id)
      ) WITHOUT ROWID;
    `,
  },
  {
    version: 7,
    sql: `CREATE TABLE microstructure_market_metadata (
      market_address TEXT PRIMARY KEY, symbol TEXT NOT NULL, tick_size REAL NOT NULL,
      minimum_size REAL NOT NULL, lot_size REAL NOT NULL, recorded_at_ms INTEGER NOT NULL
    ) WITHOUT ROWID;`,
  },
] as const;

export type persistence_counters = {
  trades: number;
  duplicateTrades: number;
  books: number;
  prices: number;
  aggregates: number;
  economicTrades: number;
  participantRows: number;
  ambiguousTrades: number;
  ambiguousTradeIds: string[];
  aggregateTrades: normalized_trade[];
};

type economic_trade_row = {
  economic_trade_id: string;
  market_address: string;
  price: number;
  size: number;
  exchange_timestamp_ms: number;
  transaction_version: number;
  aggressor_side: normalized_trade['side'];
  ambiguous: number;
  flow_counted: number;
  ingestion_source: normalized_trade['ingestionSource'];
  classification_reason: normalized_trade['classificationReason'];
  classification_source: normalized_trade['classificationSource'];
  classification_confidence: normalized_trade['classificationConfidence'];
  matched_book_timestamp_ms: number | null;
  matched_book_age_ms: number | null;
};

export class microstructure_repository {
  private readonly database: Database.Database;
  private currentSessionId: string | undefined;

  constructor(databasePath: string) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('foreign_keys = ON');
    this.applyMigrations();
  }

  saveBatch(
    trades: readonly normalized_trade[],
    books: readonly order_book_snapshot[],
    prices: readonly market_price_snapshot[],
    aggregates: readonly microstructure_aggregate[],
    maximumBatchSize = 500,
  ): persistence_counters {
    const total = trades.length + books.length + prices.length + aggregates.length;
    if (!Number.isInteger(maximumBatchSize) || maximumBatchSize < 1 || total > maximumBatchSize)
      throw new Error('Microstructure persistence batch exceeds configured bound');
    const getEconomicTrade = this.database.prepare<[string], economic_trade_row>(
      'SELECT * FROM microstructure_economic_trades WHERE economic_trade_id = ?',
    );
    const insertEconomicTrade = this.database.prepare(
      `INSERT INTO microstructure_economic_trades
       (economic_trade_id, market_address, price, size, exchange_timestamp_ms,
        transaction_version, aggressor_side, ambiguous, flow_counted, ingestion_source,
        classification_reason, persisted_at_ms, classification_source,
        classification_confidence, matched_book_timestamp_ms,
        matched_book_age_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const updateEconomicTrade = this.database.prepare(
      `UPDATE microstructure_economic_trades SET aggressor_side = ?, ambiguous = ?, classification_reason = ?,
       classification_source = ?, classification_confidence = ?, matched_book_timestamp_ms = ?,
       matched_book_age_ms = ?
       WHERE economic_trade_id = ?`,
    );
    const markFlowCounted = this.database.prepare(
      'UPDATE microstructure_economic_trades SET flow_counted = 1 WHERE economic_trade_id = ?',
    );
    const insertTradeParticipant = this.database.prepare(
      `INSERT OR IGNORE INTO microstructure_trade_participants
       (row_key, economic_trade_id, market_address, participant_account, order_id, action,
        aggressor_side, price, size, exchange_timestamp_ms, transaction_version, received_at_ms,
        ingestion_source, classification_reason, persisted_at_ms, classification_source,
        classification_confidence, matched_book_timestamp_ms, matched_book_age_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertBook = this.database.prepare(
      `INSERT OR IGNORE INTO order_book_snapshots
       (market_address, exchange_timestamp_ms, received_at_ms, best_bid, best_ask, spread,
        mid_price, microprice, best_bid_size, best_ask_size, depth_imbalance, persisted_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertPrice = this.database.prepare(
      `INSERT OR IGNORE INTO market_price_snapshots
       (market_address, exchange_timestamp_ms, received_at_ms, mark_price, mid_price,
        oracle_price, funding_rate, open_interest, persisted_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const upsertAggregate = this.database.prepare(
      `INSERT INTO microstructure_aggregates_1s (
         market_address, second_timestamp_ms, buy_volume, sell_volume, trade_count,
         vwap, spread, depth_imbalance, order_flow_imbalance, unknown_volume
         , persisted_at_ms, book_age_ms, market_price_age_ms, mark_price, mid_price,
         oracle_price, funding_rate, open_interest
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(market_address, second_timestamp_ms) DO UPDATE SET
       buy_volume=excluded.buy_volume, sell_volume=excluded.sell_volume,
       trade_count=excluded.trade_count, vwap=excluded.vwap, spread=excluded.spread,
       depth_imbalance=excluded.depth_imbalance, order_flow_imbalance=excluded.order_flow_imbalance,
       unknown_volume=excluded.unknown_volume, persisted_at_ms=excluded.persisted_at_ms,
       book_age_ms=excluded.book_age_ms, market_price_age_ms=excluded.market_price_age_ms,
       mark_price=excluded.mark_price, mid_price=excluded.mid_price,
       oracle_price=excluded.oracle_price, funding_rate=excluded.funding_rate,
       open_interest=excluded.open_interest`,
    );
    return this.database.transaction(() => {
      let savedTrades = 0;
      let savedBooks = 0;
      let savedPrices = 0;
      let savedAggregates = 0;
      let ambiguousTrades = 0;
      const ambiguousTradeIds: string[] = [];
      const aggregateTrades: normalized_trade[] = [];
      const persistedAtMs = Date.now();
      const groupedTrades = new Map<string, normalized_trade[]>();
      for (const trade of trades) {
        const group = groupedTrades.get(trade.economicTradeId) ?? [];
        group.push(trade);
        groupedTrades.set(trade.economicTradeId, group);
      }
      for (const [economicTradeId, rows] of groupedTrades) {
        const first = rows[0];
        if (first === undefined) continue;
        const existing = getEconomicTrade.get(economicTradeId);
        const agrees = (row: normalized_trade): boolean =>
          row.marketAddress === first.marketAddress &&
          row.price === first.price &&
          row.size === first.size &&
          row.exchangeTimestamp.getTime() === first.exchangeTimestamp.getTime() &&
          row.transactionVersion === first.transactionVersion;
        let ambiguous = rows.some((row) => !agrees(row));
        if (
          existing !== undefined &&
          (existing.market_address !== first.marketAddress ||
            existing.price !== first.price ||
            existing.size !== first.size ||
            existing.exchange_timestamp_ms !== first.exchangeTimestamp.getTime() ||
            existing.transaction_version !== first.transactionVersion)
        )
          ambiguous = true;
        const knownSides = new Set(
          rows.map((row) => row.side).filter((side) => side !== 'UNKNOWN'),
        );
        if (existing?.aggressor_side !== undefined && existing.aggressor_side !== 'UNKNOWN')
          knownSides.add(existing.aggressor_side);
        if (knownSides.size > 1) ambiguous = true;
        const aggressorSide = knownSides.size === 1 ? ([...knownSides][0] ?? 'UNKNOWN') : 'UNKNOWN';
        const finalAmbiguous = ambiguous || existing?.ambiguous === 1;
        const classificationReason = finalAmbiguous
          ? knownSides.size > 1
            ? 'CONFLICTING_AGGRESSOR_SIDES'
            : 'AMBIGUOUS_ECONOMIC_FIELDS'
          : aggressorSide === 'UNKNOWN'
            ? (rows.find((row) => row.side === 'UNKNOWN')?.classificationReason ??
              existing?.classification_reason ??
              'LEGACY_UNKNOWN')
            : (rows.find((row) => row.side === aggressorSide)?.classificationReason ??
              existing?.classification_reason ??
              'LEGACY_UNKNOWN');
        if (existing === undefined)
          insertEconomicTrade.run(
            economicTradeId,
            first.marketAddress,
            first.price,
            first.size,
            first.exchangeTimestamp.getTime(),
            first.transactionVersion,
            aggressorSide,
            finalAmbiguous ? 1 : 0,
            first.ingestionSource,
            classificationReason,
            persistedAtMs,
            finalAmbiguous
              ? 'UNKNOWN'
              : (rows.find((row) => row.side === aggressorSide)?.classificationSource ?? 'UNKNOWN'),
            finalAmbiguous
              ? 'NONE'
              : (rows.find((row) => row.side === aggressorSide)?.classificationConfidence ??
                  'NONE'),
            finalAmbiguous
              ? null
              : (rows.find((row) => row.side === aggressorSide)?.matchedBookTimestamp?.getTime() ??
                  null),
            finalAmbiguous
              ? null
              : (rows.find((row) => row.side === aggressorSide)?.matchedBookAgeMs ?? null),
          );
        else
          updateEconomicTrade.run(
            aggressorSide,
            finalAmbiguous ? 1 : 0,
            classificationReason,
            aggressorSide === 'UNKNOWN'
              ? 'UNKNOWN'
              : (rows.find((row) => row.side === aggressorSide)?.classificationSource ??
                  existing?.classification_source ??
                  'UNKNOWN'),
            aggressorSide === 'UNKNOWN'
              ? 'NONE'
              : (rows.find((row) => row.side === aggressorSide)?.classificationConfidence ??
                  existing?.classification_confidence ??
                  'NONE'),
            rows.find((row) => row.side === aggressorSide)?.matchedBookTimestamp?.getTime() ??
              existing?.matched_book_timestamp_ms ??
              null,
            rows.find((row) => row.side === aggressorSide)?.matchedBookAgeMs ??
              existing?.matched_book_age_ms ??
              null,
            economicTradeId,
          );
        if (finalAmbiguous) {
          ambiguousTrades += 1;
          ambiguousTradeIds.push(economicTradeId);
        }
        for (const trade of rows)
          savedTrades += insertTradeParticipant.run(
            trade.eventId,
            trade.economicTradeId,
            trade.marketAddress,
            trade.participantAccount,
            trade.orderId,
            trade.action,
            trade.side,
            trade.price,
            trade.size,
            trade.exchangeTimestamp.getTime(),
            trade.transactionVersion,
            trade.receivedAt.getTime(),
            trade.ingestionSource,
            trade.classificationReason,
            persistedAtMs,
            trade.classificationSource,
            trade.classificationConfidence,
            trade.matchedBookTimestamp?.getTime() ?? null,
            trade.matchedBookAgeMs,
          ).changes;
        if ((existing?.flow_counted ?? 0) === 0) {
          markFlowCounted.run(economicTradeId);
          aggregateTrades.push({
            ...first,
            side: finalAmbiguous ? 'UNKNOWN' : aggressorSide,
            classificationSource: finalAmbiguous ? 'UNKNOWN' : first.classificationSource,
            classificationConfidence: finalAmbiguous ? 'NONE' : first.classificationConfidence,
            classificationReason: finalAmbiguous
              ? classificationReason
              : first.classificationReason,
          });
        }
      }
      for (const book of books)
        savedBooks += insertBook.run(
          book.marketAddress,
          book.exchangeTimestamp.getTime(),
          book.receivedAt.getTime(),
          book.bestBid,
          book.bestAsk,
          book.spread,
          book.midPrice,
          book.microprice,
          book.bestBidSize,
          book.bestAskSize,
          book.top5DepthImbalance,
          persistedAtMs,
        ).changes;
      for (const price of prices)
        savedPrices += insertPrice.run(
          price.marketAddress,
          price.exchangeTimestamp.getTime(),
          price.receivedAt.getTime(),
          price.markPrice,
          price.midPrice,
          price.oraclePrice,
          price.fundingRate,
          price.openInterest,
          persistedAtMs,
        ).changes;
      for (const aggregate of aggregates)
        savedAggregates += upsertAggregate.run(
          aggregate.marketAddress,
          aggregate.secondTimestamp.getTime(),
          aggregate.buyVolume,
          aggregate.sellVolume,
          aggregate.tradeCount,
          aggregate.vwap,
          aggregate.spread,
          aggregate.depthImbalance,
          aggregate.orderFlowImbalance,
          aggregate.unknownVolume,
          persistedAtMs,
          aggregate.bookAgeMs,
          aggregate.marketPriceAgeMs,
          aggregate.markPrice,
          aggregate.midPrice,
          aggregate.oraclePrice,
          aggregate.fundingRate,
          aggregate.openInterest,
        ).changes;
      return {
        trades: savedTrades,
        duplicateTrades: trades.length - savedTrades,
        books: savedBooks,
        prices: savedPrices,
        aggregates: savedAggregates,
        economicTrades: groupedTrades.size,
        participantRows: savedTrades,
        ambiguousTrades,
        ambiguousTradeIds,
        aggregateTrades,
      };
    })();
  }

  saveMarketMetadata(market: BTC_market_metadata, recordedAtMs = Date.now()): void {
    this.database
      .prepare(
        `INSERT INTO microstructure_market_metadata VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(market_address) DO UPDATE SET symbol=excluded.symbol,
      tick_size=excluded.tick_size, minimum_size=excluded.minimum_size,
      lot_size=excluded.lot_size, recorded_at_ms=excluded.recorded_at_ms`,
      )
      .run(
        market.marketAddress,
        market.symbol,
        market.tickSize,
        market.minimumSize,
        market.lotSize,
        recordedAtMs,
      );
  }

  getCounts(): { trades: number; books: number; prices: number; aggregates: number } {
    const count = (table: string): number =>
      (
        this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
          count: number;
        }
      ).count;
    return {
      trades: count('microstructure_trades') + count('microstructure_trade_participants'),
      books: count('order_book_snapshots'),
      prices: count('market_price_snapshots'),
      aggregates: count('microstructure_aggregates_1s'),
    };
  }

  getAggregates(): microstructure_aggregate[] {
    type aggregate_row = {
      market_address: string;
      second_timestamp_ms: number;
      buy_volume: number;
      sell_volume: number;
      unknown_volume: number;
      trade_count: number;
      vwap: number | null;
      spread: number | null;
      depth_imbalance: number | null;
      order_flow_imbalance: number;
      book_age_ms: number | null;
      market_price_age_ms: number | null;
      mark_price: number | null;
      mid_price: number | null;
      oracle_price: number | null;
      funding_rate: number | null;
      open_interest: number | null;
    };
    return this.database
      .prepare<[], aggregate_row>(
        'SELECT * FROM microstructure_aggregates_1s ORDER BY second_timestamp_ms ASC',
      )
      .all()
      .map((row) => ({
        marketAddress: row.market_address,
        secondTimestamp: new Date(row.second_timestamp_ms),
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
        markPrice: row.mark_price,
        midPrice: row.mid_price,
        oraclePrice: row.oracle_price,
        fundingRate: row.funding_rate,
        openInterest: row.open_interest,
      }));
  }

  getJournalMode(): string {
    return this.database.pragma('journal_mode', { simple: true }) as string;
  }

  startCollectorSession(marketAddress: string, startedAtMs = Date.now()): string {
    const sessionId = randomUUID();
    this.database
      .prepare(
        `INSERT INTO microstructure_collector_sessions
         (session_id, market_address, started_at_ms, stopped_at_ms,
          graceful_shutdown_at_ms, feature_version) VALUES (?, ?, ?, NULL, NULL, ?)`,
      )
      .run(sessionId, marketAddress, startedAtMs, MICROSTRUCTURE_FEATURE_VERSION);
    this.currentSessionId = sessionId;
    this.recordSessionEvent(sessionId, 'START', startedAtMs);
    return sessionId;
  }

  recordSessionEvent(
    sessionId: string,
    eventType: 'START' | 'DISCONNECT' | 'RECONNECT' | 'STOP' | 'GRACEFUL_SHUTDOWN',
    occurredAtMs = Date.now(),
  ): void {
    this.database
      .prepare(
        'INSERT INTO microstructure_collector_session_events (session_id, event_type, occurred_at_ms) VALUES (?, ?, ?)',
      )
      .run(sessionId, eventType, occurredAtMs);
    if (eventType === 'STOP' || eventType === 'GRACEFUL_SHUTDOWN')
      this.database
        .prepare(
          `UPDATE microstructure_collector_sessions SET stopped_at_ms=?, graceful_shutdown_at_ms=CASE WHEN ?='GRACEFUL_SHUTDOWN' THEN ? ELSE graceful_shutdown_at_ms END WHERE session_id=?`,
        )
        .run(occurredAtMs, eventType, occurredAtMs, sessionId);
  }

  incrementDiagnostic(metric: string, stream = '', amount = 1): void {
    if (!Number.isInteger(amount) || amount < 0)
      throw new Error('Diagnostic increment must be nonnegative');
    this.database
      .prepare(
        `INSERT INTO microstructure_diagnostics VALUES (?, ?, ?)
      ON CONFLICT(metric, stream) DO UPDATE SET count=count+excluded.count`,
      )
      .run(metric, stream, amount);
    if (this.currentSessionId !== undefined)
      this.database
        .prepare(
          `INSERT INTO microstructure_session_diagnostics VALUES (?, ?, ?, ?)
           ON CONFLICT(session_id, metric, stream) DO UPDATE SET count=count+excluded.count`,
        )
        .run(this.currentSessionId, metric, stream, amount);
  }

  close(): void {
    this.database.close();
  }

  private applyMigrations(): void {
    this.database.exec(
      'CREATE TABLE IF NOT EXISTS microstructure_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
    );
    const applied = new Set(
      this.database
        .prepare('SELECT version FROM microstructure_schema_migrations')
        .all()
        .map((row) => (row as { version: number }).version),
    );
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      this.database.transaction(() => {
        this.database.exec(migration.sql);
        this.database
          .prepare('INSERT INTO microstructure_schema_migrations VALUES (?, ?)')
          .run(migration.version, new Date().toISOString());
        this.database.pragma(`user_version = ${migration.version}`);
      })();
    }
  }
}
