import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerDataRuntimeSignals, unified_data_runtime } from '../src/data_runtime.js';
import { database_runtime_lock } from '../src/data_runtime_lock.js';

const directories: string[] = [];

function components(events: string[] = []) {
  const candleStatus = {
    health: 'starting' as 'starting' | 'healthy' | 'stale' | 'reconnecting' | 'stopped',
    lastReceivedAt: null as number | null,
    reconnectCount: 0,
    latestCompletedCandleAt: null as number | null,
  };
  const microStatus = {
    health: { depth: 'starting', trades: 'starting', marketPrice: 'starting' } as const as Record<
      'depth' | 'trades' | 'marketPrice',
      'starting' | 'waiting' | 'healthy' | 'stale' | 'reconnecting' | 'stopped'
    >,
    lastReceivedAt: { depth: null, trades: null, marketPrice: null },
    reconnectCount: 0,
    malformedCount: 0,
    timestampRegressionCount: 0,
    latestAggregateSecond: null as number | null,
    persistenceHealth: 'waiting' as 'waiting' | 'healthy' | 'failed' | 'stopped',
  };
  return {
    candleStatus,
    microStatus,
    candles: {
      startCatchUp: vi.fn(() => {
        events.push('candle-catch-up');
        return Promise.resolve({ total: 1 });
      }),
      startRealtime: vi.fn(() => {
        events.push('candle-realtime');
        candleStatus.health = 'healthy';
      }),
      stop: vi.fn<() => void | Promise<void>>(() => {
        events.push('candle-stop');
      }),
      getOperationalStatus: () => ({ ...candleStatus }),
    },
    microstructure: {
      startBootstrap: vi.fn(() => {
        events.push('micro-bootstrap');
        return Promise.resolve({ fetched: 1 });
      }),
      startRealtime: vi.fn(() => {
        events.push('micro-realtime');
        microStatus.health = { depth: 'waiting', trades: 'waiting', marketPrice: 'waiting' };
      }),
      stop: vi.fn<() => void | Promise<void>>(() => {
        events.push('micro-stop');
      }),
      getOperationalStatus: () => ({
        ...microStatus,
        health: { ...microStatus.health },
        lastReceivedAt: { ...microStatus.lastReceivedAt },
      }),
    },
  };
}

function runtime(overrides: Partial<ReturnType<typeof components>> = {}) {
  const values = components();
  Object.assign(values, overrides);
  const repository = { close: vi.fn() };
  const lock = { release: vi.fn(() => Promise.resolve()) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const Runtime = new unified_data_runtime({
    candles: values.candles,
    microstructure: values.microstructure,
    repositories: [repository],
    lock,
    logger,
    shutdownTimeoutMs: 1_000,
    healthIntervalMs: 100,
  });
  return { Runtime, values, repository, lock, logger };
}

afterEach(() => {
  vi.useRealTimers();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('unified data runtime', () => {
  it('starts catch-up and bootstrap before opening either realtime subscription', async () => {
    const events: string[] = [];
    const values = components(events);
    const { Runtime } = runtime(values);
    await Runtime.start();
    expect(events).toEqual([
      'candle-catch-up',
      'micro-bootstrap',
      'candle-realtime',
      'micro-realtime',
    ]);
    await Runtime.shutdown();
  });

  it('fails startup, closes resources, and does not continue after a component failure', async () => {
    const values = components();
    values.microstructure.startBootstrap.mockRejectedValueOnce(new Error('bootstrap failed'));
    const { Runtime, repository, lock } = runtime(values);
    await expect(Runtime.start()).rejects.toThrow('bootstrap failed');
    expect(Runtime.getStatus()).toBe('FAILED');
    expect(values.candles.startRealtime).not.toHaveBeenCalled();
    expect(repository.close).toHaveBeenCalledOnce();
    expect(lock.release).toHaveBeenCalledOnce();
  });

  it('moves through STARTING, HEALTHY, and DEGRADED only as health changes', async () => {
    vi.useFakeTimers();
    const { Runtime, values, logger } = runtime();
    await Runtime.start();
    expect(Runtime.getStatus()).toBe('STARTING');
    values.microStatus.health = { depth: 'healthy', trades: 'healthy', marketPrice: 'healthy' };
    values.microStatus.latestAggregateSecond = 1_000;
    values.microStatus.persistenceHealth = 'healthy';
    await vi.advanceTimersByTimeAsync(100);
    expect(Runtime.getStatus()).toBe('HEALTHY');
    values.microStatus.health.depth = 'stale';
    await vi.advanceTimersByTimeAsync(100);
    expect(Runtime.getStatus()).toBe('DEGRADED');
    const transitions = logger.info.mock.calls
      .map((call) => call[0] as { event?: string; status?: string })
      .filter((fields) => fields.event === 'unified_data_runtime_health');
    expect(transitions.filter((fields) => fields.status === 'HEALTHY')).toHaveLength(1);
    values.microStatus.persistenceHealth = 'failed';
    await vi.advanceTimersByTimeAsync(100);
    expect(Runtime.getStatus()).toBe('FAILED');
    await Runtime.shutdown();
  });

  it('treats candle continuity independently from WebSocket stream health', async () => {
    vi.useFakeTimers();
    const { Runtime, values } = runtime();
    await Runtime.start();
    values.microStatus.health = { depth: 'healthy', trades: 'healthy', marketPrice: 'healthy' };
    values.microStatus.persistenceHealth = 'healthy';
    await vi.advanceTimersByTimeAsync(100);
    expect(Runtime.getStatus()).toBe('HEALTHY');
    Runtime.setCandleContinuity({
      health: 'gap',
      firstMissingCandleTime: '2026-08-05T10:50:00.000Z',
      lastMissingCandleTime: '2026-08-05T10:50:00.000Z',
      missingIntervalCount: 1,
      reconciliationStatus: 'DETECTED',
    });
    expect(Runtime.getStatus()).toBe('DEGRADED');
    expect(Runtime.getHealthSummary().candles).toMatchObject({
      candleStreamHealth: 'healthy',
      candleContinuityHealth: 'gap',
      missingIntervalCount: 1,
    });
    Runtime.setCandleContinuity({
      health: 'healthy',
      firstMissingCandleTime: null,
      lastMissingCandleTime: null,
      missingIntervalCount: 0,
      reconciliationStatus: 'REPAIRED',
    });
    expect(Runtime.getStatus()).toBe('HEALTHY');
    await Runtime.shutdown();
  });

  it('handles only the first signal and shutdown is idempotent', async () => {
    const { Runtime, values, lock } = runtime();
    await Runtime.start();
    const listeners = new Map<string, () => void>();
    registerDataRuntimeSignals(Runtime, {
      once: (signal, listener) => listeners.set(signal, listener),
    });
    listeners.get('SIGINT')?.();
    listeners.get('SIGTERM')?.();
    await Runtime.shutdown();
    expect(values.candles.stop).toHaveBeenCalledOnce();
    expect(values.microstructure.stop).toHaveBeenCalledOnce();
    expect(lock.release).toHaveBeenCalledOnce();
  });

  it('awaits child stops, repository close, and lock release in order', async () => {
    let resolveCandle!: () => void, resolveMicrostructure!: () => void, resolveLock!: () => void;
    const values = components(),
      order: string[] = [];
    values.candles.stop.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          order.push('candle-stop-start');
          resolveCandle = () => {
            order.push('candle-stop-complete');
            resolve();
          };
        }),
    );
    values.microstructure.stop.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          order.push('micro-stop-start');
          resolveMicrostructure = () => {
            order.push('micro-stop-complete');
            resolve();
          };
        }),
    );
    const repository = {
        close: vi.fn(() => {
          order.push('repository-close');
        }),
      },
      lock = {
        release: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              order.push('lock-release-start');
              resolveLock = () => {
                order.push('lock-release-complete');
                resolve();
              };
            }),
        ),
      },
      Runtime = new unified_data_runtime({
        candles: values.candles,
        microstructure: values.microstructure,
        repositories: [repository],
        lock,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        shutdownTimeoutMs: 10_000,
      });
    await Runtime.start();
    const first = Runtime.shutdown(),
      second = Runtime.shutdown();
    expect(first).toBe(second);
    expect(Runtime.getStatus()).toBe('STOPPING');
    await vi.waitFor(() => expect(order).toContain('candle-stop-start'));
    expect(order).toEqual(['candle-stop-start']);
    resolveCandle();
    await vi.waitFor(() => expect(order).toContain('micro-stop-start'));
    resolveMicrostructure();
    await vi.waitFor(() => expect(order).toContain('lock-release-start'));
    expect(order).toEqual([
      'candle-stop-start',
      'candle-stop-complete',
      'micro-stop-start',
      'micro-stop-complete',
      'repository-close',
      'lock-release-start',
    ]);
    expect(Runtime.getStatus()).toBe('STOPPED');
    resolveLock();
    await first;
    expect(order.at(-1)).toBe('lock-release-complete');
  });

  it('bounds shutdown when a component does not stop', async () => {
    vi.useFakeTimers();
    const values = components();
    values.candles.stop.mockImplementation(() => new Promise<void>(() => undefined));
    const { Runtime } = runtime(values);
    await Runtime.start();
    const shutdown = Runtime.shutdown();
    const expectation = expect(shutdown).rejects.toThrow('shutdown timed out');
    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
    expect(Runtime.getStatus()).toBe('FAILED');
  });

  it('does not duplicate subscriptions when start is called twice', async () => {
    const { Runtime, values } = runtime();
    await Runtime.start();
    await Runtime.start();
    expect(values.candles.startRealtime).toHaveBeenCalledOnce();
    expect(values.microstructure.startRealtime).toHaveBeenCalledOnce();
    await Runtime.shutdown();
  });

  it('keeps FAILED status while cleaning up an unrecoverable persistence failure', async () => {
    const { Runtime, values, lock } = runtime();
    await Runtime.start();
    await Runtime.fail();
    expect(Runtime.getStatus()).toBe('FAILED');
    expect(values.candles.stop).toHaveBeenCalledOnce();
    expect(values.microstructure.stop).toHaveBeenCalledOnce();
    expect(lock.release).toHaveBeenCalledOnce();
  });
});

describe('database runtime lock', () => {
  it('rejects a conflicting writer and releases cleanly without stale files', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'data-runtime-lock-'));
    directories.push(directory);
    const databasePath = join(directory, 'candles.sqlite');
    const FirstLock = await database_runtime_lock.acquire([databasePath]);
    await expect(database_runtime_lock.acquire([databasePath])).rejects.toThrow(
      'Database writer lock is already held',
    );
    await FirstLock.release();
    await FirstLock.release();
    const RecoveredLock = await database_runtime_lock.acquire([databasePath]);
    await RecoveredLock.release();
  });
});
