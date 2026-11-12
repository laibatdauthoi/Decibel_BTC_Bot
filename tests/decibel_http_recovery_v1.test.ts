import { decibel_authenticated_refresh_retry_v1 } from '../src/decibel_authenticated_refresh_retry_v1.js';
import { afterEach, expect, it, vi } from 'vitest';
import { decibel_runtime_supervisor_v1 } from '../src/decibel_runtime_supervisor_v1.js';
import {
  assertDecibelHTTPReadAllowedV1,
  enterDecibelHTTPReadBackoffForErrorV1,
  getDecibelHTTPReadBackoffUntilV1,
  isDecibelHTTP429V1,
  resetDecibelHTTPReadBackoffForTestV1,
} from '../src/decibel_http_read_backoff_v1.js';
afterEach(() => {
  vi.useRealTimers();
  resetDecibelHTTPReadBackoffForTestV1();
});
it('distinguishes timeout, local cooldown and actual 429, honoring seconds and dates', () => {
  expect(isDecibelHTTP429V1(new Error('AUTHENTICATED_HTTP_WORKER_REQUEST_TIMEOUT'))).toBe(false);
  expect(isDecibelHTTP429V1(new Error('request id 142906 timed out'))).toBe(false);
  const remote = Object.assign(new Error('HTTP Error 429'), { status: 429, retryAfter: '60' });
  expect(enterDecibelHTTPReadBackoffForErrorV1(remote, 1000, 1000)).toBe(61000);
  try {
    assertDecibelHTTPReadAllowedV1(2000);
  } catch (error) {
    expect(isDecibelHTTP429V1(error)).toBe(false);
    enterDecibelHTTPReadBackoffForErrorV1(error, 60000, 2000);
  }
  expect(getDecibelHTTPReadBackoffUntilV1()).toBe(61000);
  resetDecibelHTTPReadBackoffForTestV1();
  remote.retryAfter = new Date(120000).toUTCString();
  expect(
    enterDecibelHTTPReadBackoffForErrorV1(new Error('wrapped', { cause: remote }), 1000, 1000),
  ).toBe(120000);
  expect(() => assertDecibelHTTPReadAllowedV1(120000)).not.toThrow();
});
it('retains a due retry scheduled by a still-running failed refresh', async () => {
  vi.useFakeTimers();
  const Supervisor = new decibel_runtime_supervisor_v1();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const retry = vi.fn();
  Supervisor.scheduleOnce('authenticated-refresh', 0, async () => {
    Supervisor.scheduleOnce('authenticated-refresh', 1, retry);
    await pending;
  });
  await vi.advanceTimersByTimeAsync(10);
  expect(Supervisor.hasScheduled('authenticated-refresh')).toBe(true);
  expect(retry).not.toHaveBeenCalled();
  release();
  await vi.advanceTimersByTimeAsync(1);
  expect(retry).toHaveBeenCalledTimes(1);
  Supervisor.stopScheduler();
});
it('releases timed-out singleflight and rejects late publication after a newer recovery', async () => {
  vi.useFakeTimers();
  const Supervisor = new decibel_runtime_supervisor_v1();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = Supervisor.runAuthenticatedRefresh(async (signal) => {
    await pending;
    signal.throwIfAborted();
    Supervisor.setAuthenticatedSnapshot(1000, 5000, 'stale');
  }, 10);
  const rejected = expect(first).rejects.toThrow('PRODUCTION_AUTHENTICATED_READ_TIMEOUT');
  expect(Supervisor.runAuthenticatedRefresh(() => Promise.resolve('duplicate'))).toBe(first);
  await vi.advanceTimersByTimeAsync(10);
  await rejected;
  await Supervisor.runAuthenticatedRefresh(() => {
    Supervisor.setAuthenticatedSnapshot(2000, 5000, 'recovered');
    return Promise.resolve();
  });
  release();
  await vi.advanceTimersByTimeAsync(1);
  Supervisor.setAuthenticatedSnapshot(1000, 5000, 'older');
  expect(Supervisor.getAuthenticatedSnapshot()).toBe('recovered');
  expect(Supervisor.isAuthenticatedRefreshInFlight()).toBe(false);
  Supervisor.stopScheduler();
});

it('keeps authenticated recovery scheduled while evidence failure blocks execution', async () => {
  vi.useFakeTimers();
  const Supervisor = new decibel_runtime_supervisor_v1();
  Supervisor.setDomainState('AuthState', 'FAILED', 'MANDATORY_EVIDENCE_FAILURE_PERSISTENT');
  expect(Supervisor.getSnapshot().readiness.executionSafe).toBe(false);
  let attempts = 0;
  const orders = Object.freeze([{ id: 'ENTRY' }, { id: 'TP' }]);
  Supervisor.scheduleOnce('authenticated-refresh', 1000, () =>
    Supervisor.runAuthenticatedRefresh(() => {
      attempts += 1;
      Supervisor.setAuthenticatedSnapshot(Date.now(), 5000, { position: -0.001, orders });
      return Promise.resolve();
    }),
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(attempts).toBe(1);
  expect(Supervisor.isAuthenticatedStateReady()).toBe(true);
  expect(Supervisor.getAuthenticatedSnapshot()).toEqual({ position: -0.001, orders });
  // Auth recovery alone cannot enable execution without the other prerequisites.
  expect(Supervisor.getSnapshot().readiness.executionSafe).toBe(false);
  Supervisor.stopScheduler();
});

it('bounds retry frequency and logs a repeated stale error once until success resets it', () => {
  const Retry = new decibel_authenticated_refresh_retry_v1();
  const results = Array.from({ length: 10 }, () =>
    Retry.recordFailure('AUTHENTICATED_HTTP_WORKER_REQUEST_TIMEOUT'),
  );
  expect(results.map((result) => result.delayMs)).toEqual([
    1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000,
  ]);
  expect(results.filter((result) => result.shouldLog)).toHaveLength(1);
  expect(Retry.recordFailure('HTTP Error 429').shouldLog).toBe(true);
  Retry.resetAfterSuccess();
  expect(Retry.recordFailure('AUTHENTICATED_HTTP_WORKER_REQUEST_TIMEOUT')).toEqual({
    delayMs: 1000,
    shouldLog: true,
  });
});

it('reports expired authenticated evidence as STALE and recovers after HTTP 500 without resetting initialization', async () => {
  const Supervisor = new decibel_runtime_supervisor_v1();
  Supervisor.setAuthenticatedSnapshot(1000, 5000, { position: 0 });
  const failed = Supervisor.runAuthenticatedRefresh(() =>
    Promise.reject(
      Object.assign(new Error('HTTP Error 500: Service temporarily unavailable'), { status: 500 }),
    ),
  );
  await expect(failed).rejects.toThrow('HTTP Error 500');
  Supervisor.setAuthenticatedReadBlocked(2000);
  expect(Supervisor.isAuthenticatedStateReady(2000)).toBe(true);
  Supervisor.setAuthenticatedReadBlocked(6001);
  expect(Supervisor.getSnapshot(6001).runtimeState.domainBlockers.AuthState).toBe(
    'PRODUCTION_AUTHENTICATED_STATE_STALE',
  );
  await Supervisor.runAuthenticatedRefresh(() => {
    Supervisor.setAuthenticatedSnapshot(7000, 5000, { position: 0 });
    return Promise.resolve();
  });
  expect(Supervisor.isAuthenticatedStateReady(7000)).toBe(true);
  Supervisor.stopScheduler();
});
