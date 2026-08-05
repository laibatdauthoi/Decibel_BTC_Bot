import type { Logger } from 'pino';

import type { candle_service_health } from './candlestick_service.js';
import type { stream_health, stream_name } from './microstructure.js';

export type unified_data_status =
  'STARTING' | 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'STOPPING' | 'STOPPED';

type candle_component = {
  startCatchUp(): Promise<unknown>;
  startRealtime(): void;
  stop(): void | Promise<void>;
  getOperationalStatus(): {
    health: candle_service_health;
    lastReceivedAt: number | null;
    reconnectCount: number;
    latestCompletedCandleAt: number | null;
  };
};
type microstructure_component = {
  startBootstrap(): Promise<unknown>;
  startRealtime(): void;
  stop(): void | Promise<void>;
  getOperationalStatus(): {
    health: Readonly<Record<stream_name, stream_health>>;
    lastReceivedAt: Readonly<Record<stream_name, number | null>>;
    reconnectCount: number;
    malformedCount: number;
    timestampRegressionCount: number;
    latestAggregateSecond: number | null;
    persistenceHealth: 'waiting' | 'healthy' | 'failed';
  };
};
type closable = { close(): void | Promise<void> };
type releasable = { release(): Promise<void> };
type signal_source = {
  once(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
};

export type unified_data_runtime_dependencies = {
  candles: candle_component;
  microstructure: microstructure_component;
  repositories: readonly closable[];
  lock: releasable;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  shutdownTimeoutMs: number;
  healthIntervalMs?: number;
};

export class unified_data_runtime {
  private status: unified_data_status = 'STARTING';
  private healthTimer: ReturnType<typeof setInterval> | undefined;
  private shutdownPromise: Promise<void> | undefined;
  private started = false;

  constructor(private readonly dependencies: unified_data_runtime_dependencies) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      const candleCatchUp = await this.dependencies.candles.startCatchUp();
      const microstructureBootstrap = await this.dependencies.microstructure.startBootstrap();
      this.dependencies.candles.startRealtime();
      this.dependencies.microstructure.startRealtime();
      this.healthTimer = setInterval(
        () => this.refreshHealth(),
        this.dependencies.healthIntervalMs ?? 1_000,
      );
      this.refreshHealth();
      this.dependencies.logger.info(
        {
          event: 'unified_data_runtime_started',
          status: this.status,
          candleCatchUp,
          microstructureBootstrap,
          health: this.getHealthSummary(),
        },
        'Unified BTC/USD data runtime started',
      );
    } catch (error) {
      this.setStatus('FAILED');
      await this.cleanup(false);
      throw error;
    }
  }

  getStatus(): unified_data_status {
    return this.status;
  }

  getHealthSummary() {
    const candles = this.dependencies.candles.getOperationalStatus();
    const microstructure = this.dependencies.microstructure.getOperationalStatus();
    return {
      candles,
      depth: {
        health: microstructure.health.depth,
        lastReceivedAt: microstructure.lastReceivedAt.depth,
      },
      trades: {
        health: microstructure.health.trades,
        lastReceivedAt: microstructure.lastReceivedAt.trades,
      },
      marketPrice: {
        health: microstructure.health.marketPrice,
        lastReceivedAt: microstructure.lastReceivedAt.marketPrice,
      },
      aggregatePersistence: {
        health: microstructure.persistenceHealth,
        latestAggregateSecond: microstructure.latestAggregateSecond,
      },
      reconnectCount: candles.reconnectCount + microstructure.reconnectCount,
      malformedCount: microstructure.malformedCount,
      timestampRegressionCount: microstructure.timestampRegressionCount,
    };
  }

  shutdown(signal: 'SIGINT' | 'SIGTERM' | 'STARTUP_FAILURE' = 'SIGTERM'): Promise<void> {
    if (this.shutdownPromise !== undefined) return this.shutdownPromise;
    this.shutdownPromise = this.runBoundedShutdown(signal);
    return this.shutdownPromise;
  }

  fail(): Promise<void> {
    if (this.shutdownPromise !== undefined) return this.shutdownPromise;
    this.setStatus('FAILED');
    this.shutdownPromise = this.runBoundedFailureCleanup();
    return this.shutdownPromise;
  }

  private refreshHealth(): void {
    if (this.status === 'FAILED' || this.status === 'STOPPING' || this.status === 'STOPPED') return;
    const summary = this.getHealthSummary();
    const streamHealth = [summary.depth.health, summary.trades.health, summary.marketPrice.health];
    if (summary.aggregatePersistence.health === 'failed') this.setStatus('FAILED');
    else if (
      summary.candles.health === 'healthy' &&
      streamHealth.every((health) => health === 'healthy') &&
      summary.aggregatePersistence.health === 'healthy'
    )
      this.setStatus('HEALTHY');
    else if (
      summary.candles.health === 'starting' ||
      streamHealth.some((health) => health === 'starting' || health === 'waiting')
    )
      this.setStatus('STARTING');
    else this.setStatus('DEGRADED');
  }

  private async runBoundedShutdown(signal: string): Promise<void> {
    this.setStatus('STOPPING');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.cleanup(true),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Unified data runtime shutdown timed out')),
            this.dependencies.shutdownTimeoutMs,
          );
        }),
      ]);
      this.setStatus('STOPPED');
      this.dependencies.logger.info(
        { event: 'unified_data_runtime_stopped', signal, health: this.getHealthSummary() },
        'Unified BTC/USD data runtime stopped cleanly',
      );
    } catch (error) {
      this.setStatus('FAILED');
      this.dependencies.logger.error(
        {
          event: 'unified_data_runtime_shutdown_failed',
          signal,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Unified BTC/USD data runtime shutdown failed',
      );
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async runBoundedFailureCleanup(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.cleanup(true),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Unified data runtime failure cleanup timed out')),
            this.dependencies.shutdownTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async cleanup(stopComponents: boolean): Promise<void> {
    if (this.healthTimer !== undefined) clearInterval(this.healthTimer);
    this.healthTimer = undefined;
    const componentResults = await Promise.allSettled([
      Promise.resolve().then(() => this.dependencies.candles.stop()),
      Promise.resolve().then(() => this.dependencies.microstructure.stop()),
    ]);
    const repositoryResults = await Promise.allSettled(
      this.dependencies.repositories.map((repository) =>
        Promise.resolve().then(() => repository.close()),
      ),
    );
    const lockResult = await Promise.allSettled([this.dependencies.lock.release()]);
    if (!stopComponents) return;
    const failure = [...componentResults, ...repositoryResults, ...lockResult].find(
      (result) => result.status === 'rejected',
    );
    if (failure?.status === 'rejected') throw failure.reason;
  }

  private setStatus(status: unified_data_status): void {
    if (this.status === status) return;
    const previousStatus = this.status;
    this.status = status;
    const fields = { event: 'unified_data_runtime_health', previousStatus, status };
    if (status === 'FAILED')
      this.dependencies.logger.error(fields, 'Unified data runtime health changed');
    else if (status === 'DEGRADED')
      this.dependencies.logger.warn(fields, 'Unified data runtime health changed');
    else this.dependencies.logger.info(fields, 'Unified data runtime health changed');
  }
}

export function registerDataRuntimeSignals(
  runtime: Pick<unified_data_runtime, 'shutdown'>,
  source: signal_source = process,
  onFailure: () => void = () => {
    process.exitCode = 1;
  },
): void {
  let handled = false;
  const handle = (signal: 'SIGINT' | 'SIGTERM'): void => {
    if (handled) return;
    handled = true;
    void runtime.shutdown(signal).catch(onFailure);
  };
  source.once('SIGINT', () => handle('SIGINT'));
  source.once('SIGTERM', () => handle('SIGTERM'));
}
