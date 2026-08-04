import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
  market_price_snapshot,
  microstructure_aggregate,
  normalized_trade,
  order_book_snapshot,
} from './microstructure.js';

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
};

export class microstructure_repository {
  private readonly database: Database.Database;

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
      `INSERT INTO microstructure_economic_trades VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    const updateEconomicTrade = this.database.prepare(
      `UPDATE microstructure_economic_trades SET aggressor_side = ?, ambiguous = ?
       WHERE economic_trade_id = ?`,
    );
    const markFlowCounted = this.database.prepare(
      'UPDATE microstructure_economic_trades SET flow_counted = 1 WHERE economic_trade_id = ?',
    );
    const insertTradeParticipant = this.database.prepare(
      `INSERT OR IGNORE INTO microstructure_trade_participants VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertBook = this.database.prepare(
      `INSERT OR IGNORE INTO order_book_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertPrice = this.database.prepare(
      `INSERT OR IGNORE INTO market_price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const upsertAggregate = this.database.prepare(
      `INSERT INTO microstructure_aggregates_1s (
         market_address, second_timestamp_ms, buy_volume, sell_volume, trade_count,
         vwap, spread, depth_imbalance, order_flow_imbalance, unknown_volume
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(market_address, second_timestamp_ms) DO UPDATE SET
       buy_volume=excluded.buy_volume, sell_volume=excluded.sell_volume,
       trade_count=excluded.trade_count, vwap=excluded.vwap, spread=excluded.spread,
       depth_imbalance=excluded.depth_imbalance, order_flow_imbalance=excluded.order_flow_imbalance,
       unknown_volume=excluded.unknown_volume`,
    );
    return this.database.transaction(() => {
      let savedTrades = 0;
      let savedBooks = 0;
      let savedPrices = 0;
      let savedAggregates = 0;
      let ambiguousTrades = 0;
      const ambiguousTradeIds: string[] = [];
      const aggregateTrades: normalized_trade[] = [];
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
          );
        else updateEconomicTrade.run(aggressorSide, finalAmbiguous ? 1 : 0, economicTradeId);
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
          ).changes;
        if (!finalAmbiguous && (existing?.flow_counted ?? 0) === 0) {
          markFlowCounted.run(economicTradeId);
          aggregateTrades.push({ ...first, side: aggressorSide });
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
      }));
  }

  getJournalMode(): string {
    return this.database.pragma('journal_mode', { simple: true }) as string;
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
