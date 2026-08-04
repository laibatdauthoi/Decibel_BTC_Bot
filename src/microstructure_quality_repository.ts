import Database from 'better-sqlite3';

import type {
  aggressor_classification_reason,
  aggressor_classification_source,
  ingestion_source,
  trade_side,
} from './microstructure.js';
import type {
  active_session,
  book_quality_row,
  economic_trade_quality_row,
  latest_collector_session_input,
  microstructure_quality_input,
  participant_quality_row,
  timestamped_row,
} from './microstructure_quality.js';
import { MICROSTRUCTURE_FEATURE_VERSION } from './microstructure_repository.js';

type count_row = { count: number };
type market_row = { market_address: string };
type session_row = {
  session_id: string;
  started_at_ms: number;
  stopped_at_ms: number | null;
  feature_version: string;
};
type event_row = { session_id: string; event_type: string; occurred_at_ms: number };

export class microstructure_quality_repository {
  private readonly database: Database.Database;
  constructor(databasePath: string) {
    this.database = new Database(databasePath, { readonly: true, fileMustExist: true });
  }

  loadWindow(startTimeMs: number, endTimeMs: number): microstructure_quality_input {
    const marketAddress =
      this.database
        .prepare<[], market_row>(
          `SELECT market_address FROM (
      SELECT market_address, COUNT(*) AS frequency FROM order_book_snapshots GROUP BY market_address
      UNION ALL SELECT market_address, COUNT(*) FROM microstructure_economic_trades GROUP BY market_address
    ) GROUP BY market_address ORDER BY SUM(frequency) DESC LIMIT 1`,
        )
        .get()?.market_address ?? null;
    const count = (table: string): number =>
      this.database.prepare<[], count_row>(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ??
      0;
    const cumulativeCounts = {
      economicTrades: count('microstructure_economic_trades'),
      participantRows: count('microstructure_trade_participants'),
      books: count('order_book_snapshots'),
      marketPrices: count('market_price_snapshots'),
      aggregates: count('microstructure_aggregates_1s'),
    };
    const diagnosticRows = this.database
      .prepare<[], { metric: string; stream: string; count: number }>(
        'SELECT metric, stream, count FROM microstructure_diagnostics',
      )
      .all();
    const cumulativeDiagnostics = Object.fromEntries(
      diagnosticRows.map((row) => [
        `${row.metric}${row.stream === '' ? '' : `.${row.stream}`}`,
        row.count,
      ]),
    );
    if (marketAddress === null)
      return {
        startTimeMs,
        endTimeMs,
        marketAddress,
        economicTrades: [],
        participantRows: [],
        books: [],
        marketPrices: [],
        aggregateTimestampsMs: [],
        aggregateFeatureAges: [],
        activeSessions: [],
        cumulativeCounts,
        cumulativeDiagnostics,
      };
    const parameters = { marketAddress, startTimeMs, endTimeMs };
    const economicTrades = this.database
      .prepare<
        typeof parameters,
        {
          economic_trade_id: string;
          exchange_timestamp_ms: number;
          ingestion_source: ingestion_source;
          ambiguous: number;
          aggressor_side: trade_side;
          classification_reason: aggressor_classification_reason;
          classification_source: aggressor_classification_source;
          matched_book_age_ms: number | null;
        }
      >(
        `SELECT economic_trade_id, exchange_timestamp_ms, ingestion_source, ambiguous,
         aggressor_side, classification_reason, classification_source, matched_book_age_ms
         FROM microstructure_economic_trades WHERE market_address=@marketAddress
         AND exchange_timestamp_ms>=@startTimeMs AND exchange_timestamp_ms<@endTimeMs`,
      )
      .all(parameters)
      .map((row): economic_trade_quality_row => ({
        economicTradeId: row.economic_trade_id,
        exchangeTimestampMs: row.exchange_timestamp_ms,
        ingestionSource: row.ingestion_source,
        ambiguous: row.ambiguous === 1,
        aggressorSide: row.aggressor_side,
        classificationReason: row.classification_reason,
        classificationSource: row.classification_source,
        matchedBookAgeMs: row.matched_book_age_ms,
      }));
    const participantRows = this.database
      .prepare<
        typeof parameters,
        {
          row_key: string;
          economic_trade_id: string;
          exchange_timestamp_ms: number;
          received_at_ms: number;
          persisted_at_ms: number;
          ingestion_source: ingestion_source;
        }
      >(
        `SELECT row_key, economic_trade_id, exchange_timestamp_ms, received_at_ms, persisted_at_ms, ingestion_source FROM microstructure_trade_participants WHERE market_address=@marketAddress AND exchange_timestamp_ms>=@startTimeMs AND exchange_timestamp_ms<@endTimeMs`,
      )
      .all(parameters)
      .map((row): participant_quality_row => ({
        rowKey: row.row_key,
        economicTradeId: row.economic_trade_id,
        exchangeTimestampMs: row.exchange_timestamp_ms,
        receivedAtMs: row.received_at_ms,
        persistedAtMs: row.persisted_at_ms,
        ingestionSource: row.ingestion_source,
      }));
    const books = this.database
      .prepare<
        typeof parameters,
        {
          exchange_timestamp_ms: number;
          received_at_ms: number;
          persisted_at_ms: number;
          spread: number;
          mid_price: number;
          best_bid_size: number;
          best_ask_size: number;
          depth_imbalance: number;
        }
      >(
        `SELECT exchange_timestamp_ms, received_at_ms, persisted_at_ms, spread, mid_price, best_bid_size, best_ask_size, depth_imbalance FROM order_book_snapshots WHERE market_address=@marketAddress AND exchange_timestamp_ms>=@startTimeMs AND exchange_timestamp_ms<@endTimeMs ORDER BY exchange_timestamp_ms`,
      )
      .all(parameters)
      .map((row): book_quality_row => ({
        exchangeTimestampMs: row.exchange_timestamp_ms,
        receivedAtMs: row.received_at_ms,
        persistedAtMs: row.persisted_at_ms,
        spread: row.spread,
        midPrice: row.mid_price,
        bestBidSize: row.best_bid_size,
        bestAskSize: row.best_ask_size,
        depthImbalance: row.depth_imbalance,
      }));
    const marketPrices = this.database
      .prepare<
        typeof parameters,
        { exchange_timestamp_ms: number; received_at_ms: number; persisted_at_ms: number }
      >(
        `SELECT exchange_timestamp_ms, received_at_ms, persisted_at_ms FROM market_price_snapshots WHERE market_address=@marketAddress AND exchange_timestamp_ms>=@startTimeMs AND exchange_timestamp_ms<@endTimeMs ORDER BY exchange_timestamp_ms`,
      )
      .all(parameters)
      .map((row): timestamped_row => ({
        exchangeTimestampMs: row.exchange_timestamp_ms,
        receivedAtMs: row.received_at_ms,
        persistedAtMs: row.persisted_at_ms,
      }));
    const aggregateTimestampsMs = this.database
      .prepare<typeof parameters, { second_timestamp_ms: number }>(
        `SELECT second_timestamp_ms FROM microstructure_aggregates_1s WHERE market_address=@marketAddress AND second_timestamp_ms>=@startTimeMs AND second_timestamp_ms<@endTimeMs ORDER BY second_timestamp_ms`,
      )
      .all(parameters)
      .map((row) => row.second_timestamp_ms);
    const aggregateFeatureAges = this.database
      .prepare<
        typeof parameters,
        {
          second_timestamp_ms: number;
          book_age_ms: number | null;
          market_price_age_ms: number | null;
          spread: number | null;
          mark_price: number | null;
        }
      >(
        `SELECT second_timestamp_ms, book_age_ms, market_price_age_ms, spread, mark_price
         FROM microstructure_aggregates_1s WHERE market_address=@marketAddress
         AND second_timestamp_ms>=@startTimeMs AND second_timestamp_ms<@endTimeMs`,
      )
      .all(parameters)
      .map((row) => ({
        timestampMs: row.second_timestamp_ms,
        bookAgeMs: row.book_age_ms,
        marketPriceAgeMs: row.market_price_age_ms,
        spreadAvailable: row.spread !== null,
        marketPriceAvailable: row.mark_price !== null,
      }));
    return {
      startTimeMs,
      endTimeMs,
      marketAddress,
      economicTrades,
      participantRows,
      books,
      marketPrices,
      aggregateTimestampsMs,
      aggregateFeatureAges,
      activeSessions: this.loadActiveSessions(marketAddress, startTimeMs, endTimeMs),
      latestCollectorSession: this.loadLatestCollectorSession(marketAddress, endTimeMs),
      cumulativeCounts,
      cumulativeDiagnostics,
    };
  }

  private loadLatestCollectorSession(
    marketAddress: string,
    currentTimeMs: number,
  ): latest_collector_session_input | null {
    const session = this.database
      .prepare<[string, string], session_row>(
        `SELECT session_id, started_at_ms, stopped_at_ms, feature_version
         FROM microstructure_collector_sessions WHERE market_address=? AND feature_version=?
         ORDER BY started_at_ms DESC LIMIT 1`,
      )
      .get(marketAddress, MICROSTRUCTURE_FEATURE_VERSION);
    if (session === undefined) return null;
    const endTimeMs = Math.min(session.stopped_at_ms ?? currentTimeMs, currentTimeMs);
    const parameters = {
      marketAddress,
      sessionId: session.session_id,
      startTimeMs: session.started_at_ms,
      endTimeMs,
    };
    const participantRows = this.database
      .prepare<
        typeof parameters,
        {
          row_key: string;
          economic_trade_id: string;
          exchange_timestamp_ms: number;
          received_at_ms: number;
          persisted_at_ms: number;
          ingestion_source: ingestion_source;
        }
      >(
        `SELECT row_key, economic_trade_id, exchange_timestamp_ms, received_at_ms,
         persisted_at_ms, ingestion_source FROM microstructure_trade_participants
         WHERE market_address=@marketAddress AND received_at_ms>=@startTimeMs
         AND received_at_ms<@endTimeMs`,
      )
      .all(parameters)
      .map((row): participant_quality_row => ({
        rowKey: row.row_key,
        economicTradeId: row.economic_trade_id,
        exchangeTimestampMs: row.exchange_timestamp_ms,
        receivedAtMs: row.received_at_ms,
        persistedAtMs: row.persisted_at_ms,
        ingestionSource: row.ingestion_source,
      }));
    const economicIds = [...new Set(participantRows.map((row) => row.economicTradeId))];
    const economicTrades =
      economicIds.length === 0
        ? []
        : this.database
            .prepare<
              [string],
              {
                economic_trade_id: string;
                exchange_timestamp_ms: number;
                ingestion_source: ingestion_source;
                ambiguous: number;
                aggressor_side: trade_side;
                classification_reason: aggressor_classification_reason;
                classification_source: aggressor_classification_source;
                matched_book_age_ms: number | null;
              }
            >(
              `SELECT economic_trade_id, exchange_timestamp_ms, ingestion_source, ambiguous,
               aggressor_side, classification_reason, classification_source, matched_book_age_ms
               FROM microstructure_economic_trades WHERE economic_trade_id IN
               (SELECT value FROM json_each(?))`,
            )
            .all(JSON.stringify(economicIds))
            .map((row): economic_trade_quality_row => ({
              economicTradeId: row.economic_trade_id,
              exchangeTimestampMs: row.exchange_timestamp_ms,
              ingestionSource: row.ingestion_source,
              ambiguous: row.ambiguous === 1,
              aggressorSide: row.aggressor_side,
              classificationReason: row.classification_reason,
              classificationSource: row.classification_source,
              matchedBookAgeMs: row.matched_book_age_ms,
            }));
    const books = this.loadSessionBooks(parameters);
    const marketPrices = this.loadSessionPrices(parameters);
    const aggregateFeatureAges = this.loadSessionAggregates(parameters);
    const diagnostics = Object.fromEntries(
      this.database
        .prepare<[string], { metric: string; stream: string; count: number }>(
          'SELECT metric, stream, count FROM microstructure_session_diagnostics WHERE session_id=?',
        )
        .all(session.session_id)
        .map((row) => [`${row.metric}${row.stream === '' ? '' : `.${row.stream}`}`, row.count]),
    );
    return {
      sessionId: session.session_id,
      featureVersion: session.feature_version,
      startedAtMs: session.started_at_ms,
      endedAtMs: session.stopped_at_ms,
      activeSessions: this.loadActiveSessions(
        marketAddress,
        session.started_at_ms,
        endTimeMs,
      ).filter((segment) => segment.sessionId === session.session_id),
      economicTrades,
      participantRows,
      books,
      marketPrices,
      aggregateTimestampsMs: aggregateFeatureAges.map((row) => row.timestampMs),
      aggregateFeatureAges,
      diagnostics,
    };
  }

  private loadSessionBooks(parameters: {
    marketAddress: string;
    startTimeMs: number;
    endTimeMs: number;
  }) {
    return this.database
      .prepare<
        typeof parameters,
        {
          exchange_timestamp_ms: number;
          received_at_ms: number;
          persisted_at_ms: number;
          spread: number;
          mid_price: number;
          best_bid_size: number;
          best_ask_size: number;
          depth_imbalance: number;
        }
      >(
        `SELECT exchange_timestamp_ms, received_at_ms, persisted_at_ms, spread, mid_price,
       best_bid_size, best_ask_size, depth_imbalance FROM order_book_snapshots
       WHERE market_address=@marketAddress AND received_at_ms>=@startTimeMs AND received_at_ms<@endTimeMs`,
      )
      .all(parameters)
      .map((row): book_quality_row => ({
        exchangeTimestampMs: row.exchange_timestamp_ms,
        receivedAtMs: row.received_at_ms,
        persistedAtMs: row.persisted_at_ms,
        spread: row.spread,
        midPrice: row.mid_price,
        bestBidSize: row.best_bid_size,
        bestAskSize: row.best_ask_size,
        depthImbalance: row.depth_imbalance,
      }));
  }

  private loadSessionPrices(parameters: {
    marketAddress: string;
    startTimeMs: number;
    endTimeMs: number;
  }) {
    return this.database
      .prepare<
        typeof parameters,
        { exchange_timestamp_ms: number; received_at_ms: number; persisted_at_ms: number }
      >(
        `SELECT exchange_timestamp_ms, received_at_ms, persisted_at_ms FROM market_price_snapshots
       WHERE market_address=@marketAddress AND received_at_ms>=@startTimeMs AND received_at_ms<@endTimeMs`,
      )
      .all(parameters)
      .map((row): timestamped_row => ({
        exchangeTimestampMs: row.exchange_timestamp_ms,
        receivedAtMs: row.received_at_ms,
        persistedAtMs: row.persisted_at_ms,
      }));
  }

  private loadSessionAggregates(parameters: {
    marketAddress: string;
    startTimeMs: number;
    endTimeMs: number;
  }) {
    return this.database
      .prepare<
        typeof parameters,
        {
          second_timestamp_ms: number;
          book_age_ms: number | null;
          market_price_age_ms: number | null;
          spread: number | null;
          mark_price: number | null;
        }
      >(
        `SELECT second_timestamp_ms, book_age_ms, market_price_age_ms, spread, mark_price
       FROM microstructure_aggregates_1s WHERE market_address=@marketAddress
       AND second_timestamp_ms>=@startTimeMs AND second_timestamp_ms<@endTimeMs`,
      )
      .all(parameters)
      .map((row) => ({
        timestampMs: row.second_timestamp_ms,
        bookAgeMs: row.book_age_ms,
        marketPriceAgeMs: row.market_price_age_ms,
        spreadAvailable: row.spread !== null,
        marketPriceAvailable: row.mark_price !== null,
      }));
  }

  private loadActiveSessions(
    marketAddress: string,
    startTimeMs: number,
    endTimeMs: number,
  ): active_session[] {
    const sessions = this.database
      .prepare<[string, number, number, number], session_row>(
        `SELECT session_id, started_at_ms, stopped_at_ms FROM microstructure_collector_sessions WHERE market_address=? AND started_at_ms<? AND COALESCE(stopped_at_ms, ?)>=?`,
      )
      .all(marketAddress, endTimeMs, endTimeMs, startTimeMs);
    const result: active_session[] = [];
    const eventQuery = this.database.prepare<[string], event_row>(
      'SELECT session_id, event_type, occurred_at_ms FROM microstructure_collector_session_events WHERE session_id=? ORDER BY occurred_at_ms, event_id',
    );
    for (const session of sessions) {
      let activeStart: number | null = Math.max(startTimeMs, session.started_at_ms);
      for (const event of eventQuery.all(session.session_id)) {
        if (event.occurred_at_ms < startTimeMs) {
          if (
            event.event_type === 'DISCONNECT' ||
            event.event_type === 'STOP' ||
            event.event_type === 'GRACEFUL_SHUTDOWN'
          )
            activeStart = null;
          else if (event.event_type === 'RECONNECT' || event.event_type === 'START')
            activeStart = startTimeMs;
          continue;
        }
        if (event.occurred_at_ms > endTimeMs) break;
        if (
          (event.event_type === 'DISCONNECT' ||
            event.event_type === 'STOP' ||
            event.event_type === 'GRACEFUL_SHUTDOWN') &&
          activeStart !== null
        ) {
          result.push({
            sessionId: session.session_id,
            startTimeMs: activeStart,
            endTimeMs: event.occurred_at_ms,
          });
          activeStart = null;
        } else if (
          (event.event_type === 'RECONNECT' || event.event_type === 'START') &&
          activeStart === null
        )
          activeStart = event.occurred_at_ms;
      }
      if (activeStart !== null)
        result.push({
          sessionId: session.session_id,
          startTimeMs: activeStart,
          endTimeMs: Math.min(endTimeMs, session.stopped_at_ms ?? endTimeMs),
        });
    }
    return result.filter((session) => session.endTimeMs >= session.startTimeMs);
  }

  close(): void {
    this.database.close();
  }
}
