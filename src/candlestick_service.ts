import type { Logger } from 'pino';

import { getNextTimestamp } from './candle_interval.js';
import { syncBTCCandlesticks, type candlestick_pipeline_result } from './candlestick_pipeline.js';
import type { candlestick_write_result } from './candlestick_repository.js';
import type {
  BTC_candlestick,
  BTC_candlestick_history,
  BTC_market_metadata,
} from './decibel_client.js';

const RECONCILIATION_INTERVAL_MS = 15 * 60 * 1_000;
const HEARTBEAT_INTERVAL_MS = 60 * 1_000;
const STALE_AFTER_MS = 10 * 60 * 1_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 60_000;

export type candle_service_health = 'starting' | 'healthy' | 'stale' | 'reconnecting' | 'stopped';

export interface live_candlestick_client {
  getBTCMarketMetadata(): Promise<BTC_market_metadata>;
  getBTCCandlesticks(
    interval: '5m',
    startTime: Date,
    endTime: Date,
    now: Date,
  ): Promise<BTC_candlestick_history>;
  subscribeBTCCandlesticks(
    exchangeSymbol: string,
    interval: '5m',
    onCandle: (candle: BTC_candlestick) => void,
  ): () => void;
  onWebSocketError(handler: () => void): () => void;
  closeWebSocket(): void;
}

export interface live_candlestick_repository {
  saveCandlesticks(history: BTC_candlestick_history): candlestick_write_result;
  getLatestTimestamp(marketAddress: string, interval: '5m'): Date | null;
  getTotalCandlesticks(marketAddress: string, interval: '5m'): number;
  findMissingTimestamps(
    marketAddress: string,
    interval: '5m',
    startTime: Date,
    endTime: Date,
  ): Date[];
}

export type candle_service_options = {
  reconciliationIntervalMs?: number;
  heartbeatIntervalMs?: number;
  staleAfterMs?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  synchronize?: () => Promise<candlestick_pipeline_result>;
  onStatus?: (health: candle_service_health) => void;
  logger?: Pick<Logger, 'info' | 'warn' | 'error'>;
};

export class candlestick_service {
  private health: candle_service_health = 'starting';
  private market: BTC_market_metadata | undefined;
  private currentCandle: BTC_candlestick | undefined;
  private unsubscribeCandle: (() => void) | undefined;
  private unsubscribeError: (() => void) | undefined;
  private reconciliationTimer: ReturnType<typeof setInterval> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private lastMessageAt = 0;
  private reconciliationRunning = false;
  private readonly synchronize: () => Promise<candlestick_pipeline_result>;

  constructor(
    private readonly client: live_candlestick_client,
    private readonly repository: live_candlestick_repository,
    private readonly options: candle_service_options = {},
  ) {
    this.synchronize =
      options.synchronize ??
      (() => syncBTCCandlesticks(this.client, this.repository, '5m', new Date()));
  }

  async start(): Promise<candlestick_pipeline_result> {
    this.setHealth('starting');
    this.market = await this.client.getBTCMarketMetadata();
    const catchUp = await this.synchronize();
    this.options.logger?.info(
      {
        event: 'rest_catch_up',
        inserted: catchUp.inserted,
        updated: catchUp.updated,
        unchanged: catchUp.unchanged,
        total: catchUp.total,
        missingIntervalCount: catchUp.missingIntervalCount,
      },
      'REST catch-up completed',
    );
    this.unsubscribeError = this.client.onWebSocketError(() => this.handleDisconnect());
    this.subscribe();
    this.lastMessageAt = Date.now();
    this.setHealth('healthy');
    this.reconciliationTimer = setInterval(() => {
      void this.reconcile();
    }, this.options.reconciliationIntervalMs ?? RECONCILIATION_INTERVAL_MS);
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeat();
    }, this.options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS);
    return catchUp;
  }

  stop(): void {
    this.unsubscribeCandle?.();
    this.unsubscribeCandle = undefined;
    this.unsubscribeError?.();
    this.unsubscribeError = undefined;
    if (this.reconciliationTimer !== undefined) clearInterval(this.reconciliationTimer);
    if (this.heartbeatTimer !== undefined) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.client.closeWebSocket();
    this.options.logger?.info({ event: 'websocket_shutdown' }, 'WebSocket shutdown completed');
    this.setHealth('stopped');
  }

  getHealth(): candle_service_health {
    return this.health;
  }

  isStrategyEvaluationAllowed(): boolean {
    return this.health === 'healthy';
  }

  private subscribe(): void {
    if (this.market === undefined) {
      throw new Error('BTC market must be resolved before subscribing');
    }
    this.unsubscribeCandle = this.client.subscribeBTCCandlesticks(
      this.market.exchangeSymbol,
      '5m',
      (candle) => this.handleCandle(candle),
    );
  }

  private handleCandle(candle: BTC_candlestick): void {
    this.lastMessageAt = Date.now();
    this.reconnectAttempt = 0;
    const current = this.currentCandle;
    if (current === undefined || candle.timestamp.getTime() === current.timestamp.getTime()) {
      this.currentCandle = candle;
      this.setHealth('healthy');
      return;
    }
    if (candle.timestamp < current.timestamp) {
      return;
    }

    this.persistCompletedCandle(current);
    const expectedTimestamp = getNextTimestamp(current.timestamp.getTime(), '5m');
    this.currentCandle = candle;
    if (candle.timestamp.getTime() !== expectedTimestamp) {
      this.setHealth('stale');
      void this.reconcile();
      return;
    }
    this.setHealth('healthy');
  }

  private persistCompletedCandle(candle: BTC_candlestick): void {
    if (this.market === undefined) return;
    const result = this.repository.saveCandlesticks({
      symbol: 'BTC/USD',
      exchangeSymbol: this.market.exchangeSymbol,
      marketAddress: this.market.marketAddress,
      interval: '5m',
      candles: [candle],
    });
    this.options.logger?.info(
      {
        event: 'candle_persisted',
        marketAddress: this.market.marketAddress,
        interval: '5m',
        candleTime: candle.timestamp,
        inserted: result.inserted,
        updated: result.updated,
        unchanged: result.unchanged,
        total: result.total,
      },
      'Completed candle persisted',
    );
  }

  private async reconcile(): Promise<void> {
    if (this.health === 'stopped' || this.reconciliationRunning) return;
    this.reconciliationRunning = true;
    try {
      await this.synchronize();
      if (this.health !== 'reconnecting') this.setHealth('healthy');
    } catch {
      this.options.logger?.error(
        { event: 'rest_reconciliation_failed' },
        'REST reconciliation failed',
      );
      this.handleDisconnect();
    } finally {
      this.reconciliationRunning = false;
    }
  }

  private checkHeartbeat(): void {
    if (this.health === 'stopped') return;
    const staleAfter = this.options.staleAfterMs ?? STALE_AFTER_MS;
    if (Date.now() - this.lastMessageAt > staleAfter) {
      this.options.logger?.warn(
        {
          event: 'candle_data_stale',
          lastMessageAt: new Date(this.lastMessageAt),
          staleAfterMs: staleAfter,
        },
        'Candlestick data is stale',
      );
      this.setHealth('stale');
      this.handleDisconnect();
    }
  }

  private handleDisconnect(): void {
    if (this.health === 'stopped' || this.reconnectTimer !== undefined) return;
    this.setHealth('reconnecting');
    this.unsubscribeCandle?.();
    this.unsubscribeCandle = undefined;
    const baseDelay = this.options.reconnectBaseDelayMs ?? RECONNECT_BASE_DELAY_MS;
    const maxDelay = this.options.reconnectMaxDelayMs ?? RECONNECT_MAX_DELAY_MS;
    const reconnectDelay = Math.min(baseDelay * 2 ** this.reconnectAttempt, maxDelay);
    this.reconnectAttempt += 1;
    this.options.logger?.warn(
      {
        event: 'websocket_reconnect_scheduled',
        attempt: this.reconnectAttempt,
        delayMs: reconnectDelay,
      },
      'WebSocket reconnect scheduled',
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      try {
        this.subscribe();
        this.lastMessageAt = Date.now();
        void this.reconcile();
      } catch {
        this.handleDisconnect();
      }
    }, reconnectDelay);
  }

  private setHealth(health: candle_service_health): void {
    if (this.health === health) return;
    this.health = health;
    this.options.logger?.info(
      {
        event: 'candle_service_health',
        health,
        strategyEvaluationAllowed: health === 'healthy',
      },
      'Candle service health changed',
    );
    this.options.onStatus?.(health);
  }
}
