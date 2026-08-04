import type { Logger } from 'pino';

import type { BTC_market_metadata } from './decibel_client.js';
import {
  estimateWebSocketTradeAggressors,
  normalizeDepthPayload,
  normalizeMarketPricePayload,
  normalizeTradePayload,
  type microstructure_aggregate,
  type normalized_trade,
  type order_book_snapshot,
  type market_price_snapshot,
  type stream_health,
  type stream_name,
} from './microstructure.js';
import type { persistence_counters } from './microstructure_repository.js';
import {
  bootstrapRecentBTCTrades,
  type trade_bootstrap_result,
} from './microstructure_bootstrap.js';

export interface microstructure_client {
  getBTCMarketMetadata(): Promise<BTC_market_metadata>;
  getBTCRecentTradesPage(
    this: void,
    marketAddress: string,
    limit: number,
    offset: number,
  ): Promise<unknown>;
  subscribeBTCDepth(exchangeSymbol: string, onData: (message: unknown) => void): () => void;
  subscribeBTCTrades(exchangeSymbol: string, onData: (message: unknown) => void): () => void;
  subscribeBTCMarketPrice(exchangeSymbol: string, onData: (message: unknown) => void): () => void;
  onWebSocketError(handler: () => void): () => void;
  closeWebSocket(): void;
}

export interface microstructure_store {
  saveBatch(
    trades: readonly normalized_trade[],
    books: readonly order_book_snapshot[],
    prices: readonly ReturnType<typeof normalizeMarketPricePayload>[],
    aggregates: readonly microstructure_aggregate[],
    maximumBatchSize: number,
  ): persistence_counters;
  getCounts(): { trades: number; books: number; prices: number; aggregates: number };
  startCollectorSession?(marketAddress: string, startedAtMs?: number): string;
  recordSessionEvent?(
    sessionId: string,
    eventType: 'START' | 'DISCONNECT' | 'RECONNECT' | 'STOP' | 'GRACEFUL_SHUTDOWN',
    occurredAtMs?: number,
  ): void;
  incrementDiagnostic?(metric: string, stream?: string, amount?: number): void;
}

export type microstructure_collector_options = {
  sampleIntervalMs: number;
  startupGraceMs: number;
  depthStaleAfterMs: number;
  tradesStaleAfterMs: number;
  marketPriceStaleAfterMs: number;
  maximumBatchSize: number;
  bootstrapTradeLimit?: number;
  heartbeatIntervalMs?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaximumDelayMs?: number;
  maximumBookAgeMs: number;
  maximumPriceAgeMs: number;
  logger?: Pick<Logger, 'info' | 'warn' | 'error'>;
};

type aggregate_accumulator = {
  buyVolume: number;
  sellVolume: number;
  unknownVolume: number;
  tradeCount: number;
  notional: number;
};

export class microstructure_collector {
  private market: BTC_market_metadata | undefined;
  private readonly health: Record<stream_name, stream_health> = {
    depth: 'starting',
    trades: 'starting',
    marketPrice: 'starting',
  };
  private readonly lastReceivedAt: Record<stream_name, number | null> = {
    depth: null,
    trades: null,
    marketPrice: null,
  };
  private readonly lastExchangeAt: Record<stream_name, number> = {
    depth: -1,
    trades: -1,
    marketPrice: -1,
  };
  private readonly counters = {
    trades: 0,
    duplicateTrades: 0,
    rawRows: 0,
    economicTrades: 0,
    duplicateRows: 0,
    participantRows: 0,
    ambiguousTrades: 0,
    books: 0,
    prices: 0,
    aggregates: 0,
    malformed: 0,
    regressions: 0,
  };
  private readonly aggregateBuckets = new Map<number, aggregate_accumulator>();
  private latestBook: order_book_snapshot | undefined;
  private bookObservations: order_book_snapshot[] = [];
  private priceObservations: market_price_snapshot[] = [];
  private nextAggregateSecond: number | null = null;
  private aggregateSegmentActive = false;
  private lastBookFingerprint = '';
  private unsubscribes: (() => void)[] = [];
  private unsubscribeError: (() => void) | undefined;
  private sampleTimer: ReturnType<typeof setInterval> | undefined;
  private aggregateTimer: ReturnType<typeof setInterval> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private subscriptionStartedAt = 0;
  private lastWebSocketActivityAt = 0;
  private lastLoggedPersistenceTotal = 0;
  private stopped = false;
  private sessionId: string | undefined;

  constructor(
    private readonly client: microstructure_client,
    private readonly repository: microstructure_store,
    private readonly options: microstructure_collector_options,
  ) {}

  async start(): Promise<trade_bootstrap_result> {
    this.market = await this.client.getBTCMarketMetadata();
    const bootstrap = await bootstrapRecentBTCTrades(
      this.client,
      this.repository,
      this.market,
      this.options.bootstrapTradeLimit ?? 0,
      this.options.maximumBatchSize,
    );
    this.counters.trades += bootstrap.participantRows;
    this.counters.duplicateTrades += bootstrap.duplicateRows;
    this.counters.rawRows += bootstrap.rawRows;
    this.counters.economicTrades += bootstrap.economicTrades;
    this.counters.duplicateRows += bootstrap.duplicateRows;
    this.counters.participantRows += bootstrap.participantRows;
    this.counters.ambiguousTrades += bootstrap.ambiguousTrades;
    this.repository.incrementDiagnostic?.('bootstrap_fetched', '', bootstrap.fetched);
    this.repository.incrementDiagnostic?.('bootstrap_duplicate', '', bootstrap.duplicateRows);
    this.repository.incrementDiagnostic?.('bootstrap_participant', '', bootstrap.participantRows);
    this.repository.incrementDiagnostic?.('bootstrap_economic', '', bootstrap.economicTrades);
    this.repository.incrementDiagnostic?.('bootstrap_ambiguous', '', bootstrap.ambiguousTrades);
    this.options.logger?.info(
      {
        event: 'microstructure_trade_bootstrap_complete',
        ...bootstrap,
      },
      'Recent BTC trade bootstrap completed',
    );
    this.unsubscribeError = this.client.onWebSocketError(() => this.reconnect('heartbeat_failure'));
    this.sessionId = this.repository.startCollectorSession?.(this.market.marketAddress);
    this.beginSubscriptionWindow();
    this.subscribe();
    this.sampleTimer = setInterval(() => this.sampleBook(), this.options.sampleIntervalMs);
    this.aggregateTimer = setInterval(() => this.flushCompletedAggregates(), 1_000);
    this.heartbeatTimer = setInterval(
      () => this.checkHealth(),
      this.options.heartbeatIntervalMs ?? 1_000,
    );
    this.options.logger?.info(
      {
        event: 'microstructure_started',
        marketAddress: this.market.marketAddress,
        topics: [
          `depth:${this.market.marketAddress}:1`,
          `trades:${this.market.marketAddress}`,
          `market_price:${this.market.marketAddress}`,
        ],
        sampleIntervalMs: this.options.sampleIntervalMs,
      },
      'BTC/USD microstructure collector started',
    );
    return bootstrap;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.flushCompletedAggregates();
    this.aggregateSegmentActive = false;
    this.clearSubscriptions();
    this.unsubscribeError?.();
    if (this.sampleTimer !== undefined) clearInterval(this.sampleTimer);
    if (this.aggregateTimer !== undefined) clearInterval(this.aggregateTimer);
    if (this.heartbeatTimer !== undefined) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.client.closeWebSocket();
    if (this.sessionId !== undefined)
      this.repository.recordSessionEvent?.(this.sessionId, 'GRACEFUL_SHUTDOWN');
    for (const stream of Object.keys(this.health) as stream_name[])
      this.setStreamHealth(stream, 'stopped');
    this.options.logger?.info(
      { event: 'microstructure_stopped', health: this.health, counters: this.counters },
      'Microstructure collector stopped cleanly',
    );
  }

  getHealth(): Readonly<Record<stream_name, stream_health>> {
    return { ...this.health };
  }

  getCounters(): Readonly<typeof this.counters> {
    return { ...this.counters };
  }

  private subscribe(): void {
    if (this.market === undefined)
      throw new Error('BTC market must be resolved before subscribing');
    const symbol = this.market.exchangeSymbol;
    const subscriptions: (() => void)[] = [];
    try {
      subscriptions.push(
        this.client.subscribeBTCDepth(symbol, (message) => this.handleDepth(message)),
      );
      subscriptions.push(
        this.client.subscribeBTCTrades(symbol, (message) => this.handleTrades(message)),
      );
      subscriptions.push(
        this.client.subscribeBTCMarketPrice(symbol, (message) => this.handlePrice(message)),
      );
      this.unsubscribes = subscriptions;
    } catch (error) {
      for (const unsubscribe of subscriptions) unsubscribe();
      throw error;
    }
  }

  private handleDepth(message: unknown): void {
    this.handleMessage('depth', () => {
      const book = normalizeDepthPayload(message, this.requireMarketAddress(), new Date());
      this.validateTimestamp('depth', book.exchangeTimestamp);
      this.latestBook = book;
      this.bookObservations.push(book);
    });
  }

  private handleTrades(message: unknown): void {
    this.handleMessage('trades', () => {
      const normalizedTrades = normalizeTradePayload(
        message,
        this.requireMarketAddress(),
        new Date(),
      );
      const tradeReceivedAt = normalizedTrades[0]?.receivedAt.getTime() ?? Date.now();
      const trades = estimateWebSocketTradeAggressors(
        normalizedTrades,
        this.findLatestObservation(this.bookObservations, tradeReceivedAt),
        this.options.maximumBookAgeMs,
      );
      if (trades.length === 0) return;
      const timestamps = trades.map((trade) => trade.exchangeTimestamp.getTime());
      const minimumTimestamp = Math.min(...timestamps);
      const maximumTimestamp = Math.max(...timestamps);
      if (minimumTimestamp < this.lastExchangeAt.trades) {
        this.counters.regressions += 1;
        this.repository.incrementDiagnostic?.('timestamp_regressions', 'trades');
        throw new Error('trades exchange timestamp regressed');
      }
      this.validateTimestamp('trades', new Date(maximumTimestamp));
      for (let offset = 0; offset < trades.length; offset += this.options.maximumBatchSize) {
        const batch = trades.slice(offset, offset + this.options.maximumBatchSize);
        const result = this.repository.saveBatch(batch, [], [], [], this.options.maximumBatchSize);
        this.addPersistence(result);
        for (const trade of result.aggregateTrades) this.addTradeToAggregate(trade);
      }
    });
  }

  private handlePrice(message: unknown): void {
    this.handleMessage('marketPrice', () => {
      const price = normalizeMarketPricePayload(message, this.requireMarketAddress(), new Date());
      this.validateTimestamp('marketPrice', price.exchangeTimestamp);
      this.priceObservations.push(price);
      this.addPersistence(
        this.repository.saveBatch([], [], [price], [], this.options.maximumBatchSize),
      );
    });
  }

  private handleMessage(stream: stream_name, handler: () => void): void {
    this.lastWebSocketActivityAt = Date.now();
    this.repository.incrementDiagnostic?.('received_events', stream);
    try {
      handler();
      this.lastReceivedAt[stream] = Date.now();
      this.setStreamHealth(stream, 'healthy');
      this.reconnectAttempt = 0;
    } catch (error) {
      this.counters.malformed += 1;
      this.repository.incrementDiagnostic?.('malformed_messages', stream);
      const safeError =
        error instanceof Error && error.name !== 'ZodError'
          ? error.message
          : 'Payload schema validation failed';
      this.options.logger?.warn(
        {
          event: 'microstructure_message_rejected',
          stream,
          error: safeError,
        },
        'Malformed microstructure message rejected',
      );
    }
  }

  private validateTimestamp(stream: stream_name, timestamp: Date): void {
    const value = timestamp.getTime();
    if (value < this.lastExchangeAt[stream]) {
      this.counters.regressions += 1;
      this.repository.incrementDiagnostic?.('timestamp_regressions', stream);
      throw new Error(`${stream} exchange timestamp regressed`);
    }
    this.lastExchangeAt[stream] = value;
  }

  private sampleBook(): void {
    const book = this.latestBook;
    if (book === undefined) return;
    const fingerprint = [
      book.bestBid,
      book.bestAsk,
      book.bestBidSize,
      book.bestAskSize,
      book.top5DepthImbalance,
    ].join(':');
    if (fingerprint === this.lastBookFingerprint) return;
    this.lastBookFingerprint = fingerprint;
    this.addPersistence(
      this.repository.saveBatch([], [book], [], [], this.options.maximumBatchSize),
    );
  }

  private addTradeToAggregate(trade: normalized_trade): void {
    const second = Math.floor(trade.receivedAt.getTime() / 1_000) * 1_000;
    const bucket = this.getAggregateBucket(second);
    if (trade.side === 'BUY') bucket.buyVolume += trade.size;
    else if (trade.side === 'SELL') bucket.sellVolume += trade.size;
    else bucket.unknownVolume += trade.size;
    bucket.tradeCount += 1;
    bucket.notional += trade.price * trade.size;
    this.aggregateBuckets.set(second, bucket);
  }

  private flushCompletedAggregates(): void {
    if (!this.aggregateSegmentActive || this.nextAggregateSecond === null) return;
    const cutoff = Math.floor(Date.now() / 1_000) * 1_000;
    const aggregates: microstructure_aggregate[] = [];
    while (this.nextAggregateSecond < cutoff) {
      const second = this.nextAggregateSecond;
      const boundary = second + 1_000;
      const bucket = this.aggregateBuckets.get(second) ?? this.createAggregateBucket();
      const directionalVolume = bucket.buyVolume + bucket.sellVolume;
      const totalVolume = directionalVolume + bucket.unknownVolume;
      const aggregateBook = this.findLatestObservation(this.bookObservations, boundary - 1);
      const aggregatePrice = this.findLatestObservation(this.priceObservations, boundary - 1);
      const bookAgeMs =
        aggregateBook === undefined ? null : boundary - aggregateBook.receivedAt.getTime();
      const priceAgeMs =
        aggregatePrice === undefined ? null : boundary - aggregatePrice.receivedAt.getTime();
      const bookAvailable = bookAgeMs !== null && bookAgeMs <= this.options.maximumBookAgeMs;
      const priceAvailable = priceAgeMs !== null && priceAgeMs <= this.options.maximumPriceAgeMs;
      aggregates.push({
        marketAddress: this.requireMarketAddress(),
        secondTimestamp: new Date(second),
        buyVolume: bucket.buyVolume,
        sellVolume: bucket.sellVolume,
        unknownVolume: bucket.unknownVolume,
        tradeCount: bucket.tradeCount,
        vwap: totalVolume === 0 ? null : bucket.notional / totalVolume,
        spread: bookAvailable ? (aggregateBook?.spread ?? null) : null,
        depthImbalance: bookAvailable ? (aggregateBook?.top5DepthImbalance ?? null) : null,
        orderFlowImbalance:
          directionalVolume === 0 ? 0 : (bucket.buyVolume - bucket.sellVolume) / directionalVolume,
        bookAgeMs,
        marketPriceAgeMs: priceAgeMs,
        markPrice: priceAvailable ? (aggregatePrice?.markPrice ?? null) : null,
        midPrice: priceAvailable ? (aggregatePrice?.midPrice ?? null) : null,
        oraclePrice: priceAvailable ? (aggregatePrice?.oraclePrice ?? null) : null,
        fundingRate: priceAvailable ? (aggregatePrice?.fundingRate ?? null) : null,
        openInterest: priceAvailable ? (aggregatePrice?.openInterest ?? null) : null,
      });
      this.aggregateBuckets.delete(second);
      this.nextAggregateSecond += 1_000;
    }
    for (let offset = 0; offset < aggregates.length; offset += this.options.maximumBatchSize) {
      const batch = aggregates.slice(offset, offset + this.options.maximumBatchSize);
      this.addPersistence(
        this.repository.saveBatch([], [], [], batch, this.options.maximumBatchSize),
      );
    }
    this.bookObservations = this.retainRelevantObservations(this.bookObservations, cutoff);
    this.priceObservations = this.retainRelevantObservations(this.priceObservations, cutoff);
  }

  private getAggregateBucket(second: number): aggregate_accumulator {
    const bucket = this.aggregateBuckets.get(second) ?? this.createAggregateBucket();
    this.aggregateBuckets.set(second, bucket);
    return bucket;
  }

  private createAggregateBucket(): aggregate_accumulator {
    return {
      buyVolume: 0,
      sellVolume: 0,
      unknownVolume: 0,
      tradeCount: 0,
      notional: 0,
    };
  }

  private findLatestObservation<T extends { receivedAt: Date }>(
    observations: readonly T[],
    boundary: number,
  ): T | undefined {
    return [...observations]
      .filter((observation) => observation.receivedAt.getTime() <= boundary)
      .sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime())[0];
  }

  private retainRelevantObservations<T extends { receivedAt: Date }>(
    observations: readonly T[],
    boundary: number,
  ): T[] {
    const prior = this.findLatestObservation(observations, boundary);
    return [
      ...(prior === undefined ? [] : [prior]),
      ...observations.filter((observation) => observation.receivedAt.getTime() > boundary),
    ];
  }

  private checkHealth(): void {
    const now = Date.now();
    if (now - this.subscriptionStartedAt <= this.options.startupGraceMs) return;
    this.checkRequiredStream('depth', now, this.options.depthStaleAfterMs);
    this.checkRequiredStream('marketPrice', now, this.options.marketPriceStaleAfterMs);
    this.checkTradeStream(now);
    if (Object.values(this.health).some((status) => status === 'stale')) this.reconnect();
  }

  private reconnect(reason = 'stale_stream'): void {
    if (this.stopped || this.reconnectTimer !== undefined) return;
    this.flushCompletedAggregates();
    this.aggregateSegmentActive = false;
    this.nextAggregateSecond = null;
    this.aggregateBuckets.clear();
    this.latestBook = undefined;
    this.bookObservations = [];
    this.priceObservations = [];
    this.lastBookFingerprint = '';
    this.repository.incrementDiagnostic?.('reconnects');
    if (this.sessionId !== undefined)
      this.repository.recordSessionEvent?.(this.sessionId, 'DISCONNECT');
    this.clearSubscriptions();
    for (const stream of Object.keys(this.health) as stream_name[])
      this.setStreamHealth(stream, 'reconnecting');
    const delay = Math.min(
      (this.options.reconnectBaseDelayMs ?? 1_000) * 2 ** this.reconnectAttempt,
      this.options.reconnectMaximumDelayMs ?? 60_000,
    );
    this.reconnectAttempt += 1;
    this.options.logger?.warn(
      { event: 'microstructure_reconnect', reason, attempt: this.reconnectAttempt, delayMs: delay },
      'Microstructure WebSocket reconnect scheduled',
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      try {
        if (this.sessionId !== undefined)
          this.repository.recordSessionEvent?.(this.sessionId, 'RECONNECT');
        this.beginSubscriptionWindow();
        this.subscribe();
      } catch {
        this.reconnect('subscription_failure');
      }
    }, delay);
  }

  private clearSubscriptions(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes = [];
  }

  private beginSubscriptionWindow(): void {
    const now = Date.now();
    this.nextAggregateSecond = Math.ceil(now / 1_000) * 1_000;
    this.aggregateSegmentActive = true;
    this.subscriptionStartedAt = now;
    this.lastWebSocketActivityAt = now;
    for (const stream of Object.keys(this.health) as stream_name[]) {
      this.lastReceivedAt[stream] = null;
      this.setStreamHealth(stream, 'waiting');
    }
  }

  private checkRequiredStream(
    stream: 'depth' | 'marketPrice',
    now: number,
    staleAfterMs: number,
  ): void {
    if (this.health[stream] === 'stopped' || this.health[stream] === 'reconnecting') return;
    const reference = this.lastReceivedAt[stream] ?? this.subscriptionStartedAt;
    if (now - reference <= staleAfterMs) return;
    this.setStreamHealth(stream, 'stale', this.lastReceivedAt[stream] ?? undefined);
  }

  private checkTradeStream(now: number): void {
    if (this.health.trades === 'stopped' || this.health.trades === 'reconnecting') return;
    const reference = this.lastReceivedAt.trades ?? this.subscriptionStartedAt;
    if (now - reference <= this.options.tradesStaleAfterMs) return;
    if (now - this.lastWebSocketActivityAt <= this.options.tradesStaleAfterMs) return;
    this.setStreamHealth('trades', 'stale', this.lastReceivedAt.trades ?? undefined);
  }

  private setStreamHealth(
    stream: stream_name,
    health: stream_health,
    lastReceivedAt?: number,
  ): void {
    if (this.health[stream] === health) return;
    this.health[stream] = health;
    const details = {
      event: 'microstructure_stream_health',
      stream,
      health,
      ...(lastReceivedAt === undefined ? {} : { lastReceivedAt: new Date(lastReceivedAt) }),
    };
    if (health === 'stale')
      this.options.logger?.warn(details, 'Microstructure stream health changed');
    else this.options.logger?.info(details, 'Microstructure stream health changed');
  }

  private requireMarketAddress(): string {
    if (this.market === undefined) throw new Error('BTC market has not been resolved');
    return this.market.marketAddress;
  }

  private addPersistence(result: persistence_counters): void {
    this.counters.trades += result.trades;
    this.counters.duplicateTrades += result.duplicateTrades;
    this.counters.books += result.books;
    this.counters.prices += result.prices;
    this.counters.aggregates += result.aggregates;
    this.counters.rawRows += result.participantRows + result.duplicateTrades;
    this.counters.economicTrades += result.economicTrades;
    this.counters.duplicateRows += result.duplicateTrades;
    this.counters.participantRows += result.participantRows;
    this.counters.ambiguousTrades += result.ambiguousTrades;
    const persistedTotal =
      this.counters.trades + this.counters.books + this.counters.prices + this.counters.aggregates;
    if (persistedTotal - this.lastLoggedPersistenceTotal >= 1_000) {
      this.lastLoggedPersistenceTotal = persistedTotal;
      this.options.logger?.info(
        { event: 'microstructure_persistence', counters: this.counters },
        'Microstructure persistence checkpoint',
      );
    }
  }
}
