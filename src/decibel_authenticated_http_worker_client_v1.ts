import { Worker } from 'node:worker_threads';

import type {
  decibel_authenticated_http_account_overview_v1,
  decibel_authenticated_http_open_order_v1,
  decibel_authenticated_http_position_v1,
} from './decibel_authenticated_http_reader_v1.js';
import { DECIBEL_AUTHENTICATED_HTTP_TRANSPORT_ID_V1 } from './decibel_authenticated_http_reader_v1.js';
import {
  parseDecibelSelectedLeverageV1,
  parseDecibelAccountFeeRatesV1,
  type decibel_selected_leverage_v1,
  type decibel_account_fee_rates_v1,
} from './decibel_authenticated_http_reader_v1.js';

export const DECIBEL_AUTHENTICATED_HTTP_WORKER_TRANSPORT_ID_V1 =
  `WORKER:${DECIBEL_AUTHENTICATED_HTTP_TRANSPORT_ID_V1}` as const;

type pending_request = Readonly<{
  operation: 'ACCOUNT_OVERVIEW' | 'POSITIONS' | 'OPEN_ORDERS' | 'POSITION_SETTINGS' | 'FEE_RATES';
  queuedAt: number;
  resolve(value: unknown): void;
  reject(error: Error): void;
  Timeout: ReturnType<typeof setTimeout>;
  cleanup(): void;
}>;

export function createDecibelAuthenticatedHttpWorkerClientV1(
  options: Readonly<{ baseUrl: string; apiKey?: string; timeoutMs: number }>,
): Readonly<{
  readSelectedLeverage(
    subaccount: string,
    market: string,
    signal?: AbortSignal,
  ): Promise<decibel_selected_leverage_v1>;
  readFeeRates(subaccount: string, signal?: AbortSignal): Promise<decibel_account_fee_rates_v1>;
  readAccountOverview(
    subaccount: string,
    signal?: AbortSignal,
  ): Promise<decibel_authenticated_http_account_overview_v1>;
  readPositions(
    subaccount: string,
    marketAddress?: string,
    signal?: AbortSignal,
  ): Promise<readonly decibel_authenticated_http_position_v1[]>;
  readOpenOrders(
    subaccount: string,
    signal?: AbortSignal,
  ): Promise<readonly decibel_authenticated_http_open_order_v1[]>;
  getTransportDiagnostics(): Readonly<{
    transportId: typeof DECIBEL_AUTHENTICATED_HTTP_WORKER_TRANSPORT_ID_V1;
    baseUrl: string;
    isolatedDispatcher: true;
    internalRetry: false;
    attempts: number;
    successes: number;
    failures: number;
    lastFailure: string | null;
    lastStage: string | null;
    lastQueueLatencyMs: number | null;
    lastHttpLatencyMs: number | null;
    lastRoundTripLatencyMs: number | null;
  }>;
  close(): Promise<void>;
}> {
  let ActiveWorker: Worker | null = null;
  let nextId = 1;
  const Pending = new Map<number, pending_request>();
  let attempts = 0;
  let successes = 0;
  let failures = 0;
  let lastFailure: string | null = null;
  let lastStage: string | null = null;
  let lastQueueLatencyMs: number | null = null;
  let lastHttpLatencyMs: number | null = null;
  let lastRoundTripLatencyMs: number | null = null;

  const rejectPending = (message: string): void => {
    for (const request of Pending.values()) {
      clearTimeout(request.Timeout);
      request.cleanup();
      request.reject(new Error(message));
      failures += 1;
      lastFailure = message;
      lastStage = request.operation;
    }
    Pending.clear();
  };
  const getWorker = (): Worker => {
    if (ActiveWorker !== null) return ActiveWorker;
    const Candidate = new Worker(
      new URL('./decibel_authenticated_http_worker_v1.mjs', import.meta.url),
      {
        workerData: {
          baseUrl: options.baseUrl,
          ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
        },
      },
    );
    ActiveWorker = Candidate;
    Candidate.on('message', (message: unknown) => {
      if (typeof message !== 'object' || message === null || !('id' in message)) return;
      const id = Number(message.id);
      const request = Pending.get(id);
      if (request === undefined) return;
      Pending.delete(id);
      clearTimeout(request.Timeout);
      request.cleanup();
      lastRoundTripLatencyMs = Math.max(0, performance.now() - request.queuedAt);
      if (
        'diagnostics' in message &&
        typeof message.diagnostics === 'object' &&
        message.diagnostics !== null
      ) {
        const diagnostics = message.diagnostics as {
          httpLatencyMs?: unknown;
          workerLatencyMs?: unknown;
        };
        if (typeof diagnostics.httpLatencyMs === 'number')
          lastHttpLatencyMs = diagnostics.httpLatencyMs;
        if (typeof diagnostics.workerLatencyMs === 'number')
          lastQueueLatencyMs = Math.max(0, lastRoundTripLatencyMs - diagnostics.workerLatencyMs);
      }
      lastStage = request.operation;
      if ('ok' in message && message.ok === true && 'value' in message) {
        successes += 1;
        lastFailure = null;
        request.resolve(message.value);
      } else {
        failures += 1;
        lastFailure =
          'error' in message && typeof message.error === 'string'
            ? message.error
            : 'AUTHENTICATED_HTTP_WORKER_READ_FAILED';
        request.reject(
          Object.assign(new Error(lastFailure), {
            ...('status' in message && typeof message.status === 'number'
              ? { status: message.status }
              : {}),
            ...('retryAfter' in message && typeof message.retryAfter === 'string'
              ? { retryAfter: message.retryAfter }
              : {}),
          }),
        );
      }
    });
    Candidate.once('error', (error) => {
      if (ActiveWorker !== Candidate) return;
      ActiveWorker = null;
      rejectPending(
        `AUTHENTICATED_HTTP_WORKER_CRASHED:${error instanceof Error ? error.message : String(error)}`,
      );
    });
    Candidate.once('exit', (code) => {
      if (ActiveWorker !== Candidate) return;
      ActiveWorker = null;
      rejectPending(`AUTHENTICATED_HTTP_WORKER_EXITED:${code}`);
    });
    return Candidate;
  };
  const request = <T>(
    operation: pending_request['operation'],
    input: Readonly<{ subaccount: string; marketAddress?: string }>,
    signal?: AbortSignal,
  ): Promise<T> => {
    if (signal?.aborted === true) return Promise.reject(new Error('AUTHENTICATED_READ_ABORTED'));
    const id = nextId++;
    attempts += 1;
    const WorkerInstance = getWorker();
    return new Promise<T>((resolve, reject) => {
      const timeout = (): void => {
        const pending = Pending.get(id);
        if (pending === undefined) return;
        Pending.delete(id);
        clearTimeout(pending.Timeout);
        pending.cleanup();
        WorkerInstance.postMessage({ cancelId: id });
        failures += 1;
        lastFailure = 'AUTHENTICATED_HTTP_WORKER_REQUEST_TIMEOUT';
        lastStage = operation;
        lastRoundTripLatencyMs = Math.max(0, performance.now() - pending.queuedAt);
        pending.reject(new Error(lastFailure));
      };
      const Timeout = setTimeout(timeout, options.timeoutMs + 250);
      Pending.set(id, {
        operation,
        queuedAt: performance.now(),
        resolve: (value) => resolve(value as T),
        reject,
        Timeout,
        cleanup: () => signal?.removeEventListener('abort', onAbort),
      });
      const onAbort = () => {
        const pending = Pending.get(id);
        if (pending === undefined) return;
        Pending.delete(id);
        clearTimeout(pending.Timeout);
        pending.cleanup();
        WorkerInstance.postMessage({ cancelId: id });
        pending.reject(new Error('AUTHENTICATED_HTTP_WORKER_REQUEST_ABORTED'));
        failures += 1;
        lastFailure = 'AUTHENTICATED_HTTP_WORKER_REQUEST_ABORTED';
        lastStage = operation;
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      WorkerInstance.postMessage({ id, operation, ...input, timeoutMs: options.timeoutMs });
    });
  };

  return Object.freeze({
    readSelectedLeverage: async (subaccount, marketAddress, signal) =>
      parseDecibelSelectedLeverageV1(
        await request('POSITION_SETTINGS', { subaccount, marketAddress }, signal),
        subaccount,
        marketAddress,
        Date.now(),
      ),
    readFeeRates: async (subaccount, signal) =>
      parseDecibelAccountFeeRatesV1(
        await request('FEE_RATES', { subaccount }, signal),
        subaccount,
        Date.now(),
      ),
    readAccountOverview: (subaccount, signal) =>
      request('ACCOUNT_OVERVIEW', { subaccount }, signal),
    readPositions: (subaccount, marketAddress, signal) =>
      request(
        'POSITIONS',
        { subaccount, ...(marketAddress === undefined ? {} : { marketAddress }) },
        signal,
      ),
    readOpenOrders: (subaccount, signal) => request('OPEN_ORDERS', { subaccount }, signal),
    getTransportDiagnostics: () =>
      Object.freeze({
        transportId: DECIBEL_AUTHENTICATED_HTTP_WORKER_TRANSPORT_ID_V1,
        baseUrl: options.baseUrl,
        isolatedDispatcher: true as const,
        internalRetry: false as const,
        attempts,
        successes,
        failures,
        lastFailure,
        lastStage,
        lastQueueLatencyMs,
        lastHttpLatencyMs,
        lastRoundTripLatencyMs,
      }),
    close: async () => {
      const WorkerInstance = ActiveWorker;
      ActiveWorker = null;
      rejectPending('AUTHENTICATED_HTTP_WORKER_CLOSED');
      if (WorkerInstance !== null) await WorkerInstance.terminate();
    },
  });
}
