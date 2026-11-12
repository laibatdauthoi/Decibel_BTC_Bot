import { parentPort, workerData } from 'node:worker_threads';

import { Agent, fetch } from 'undici';
import { z } from 'zod';

if (parentPort === null) throw new Error('AUTHENTICATED_HTTP_WORKER_PARENT_REQUIRED');
const RawConfiguration = /** @type {unknown} */ (workerData);
if (
  typeof RawConfiguration !== 'object' ||
  RawConfiguration === null ||
  !('baseUrl' in RawConfiguration) ||
  typeof RawConfiguration.baseUrl !== 'string' ||
  RawConfiguration.baseUrl.length === 0
)
  throw new Error('AUTHENTICATED_HTTP_WORKER_BASE_URL_REQUIRED');
const configuration = {
  baseUrl: RawConfiguration.baseUrl,
  apiKey:
    'apiKey' in RawConfiguration && typeof RawConfiguration.apiKey === 'string'
      ? RawConfiguration.apiKey
      : undefined,
};

const Dispatcher = new Agent({ connections: 6, pipelining: 1 });
const headers =
  configuration.apiKey !== undefined && configuration.apiKey.length > 0
    ? { Authorization: `Bearer ${configuration.apiKey}` }
    : {};
/** @type {Map<number, AbortController>} */
const ActiveControllers = new Map();

/**
 * @param {string} path
 * @param {URLSearchParams} query
 * @param {AbortSignal} signal
 * @returns {Promise<{value: unknown, httpLatencyMs: number}>}
 */
async function get(path, query, signal) {
  const startedAt = performance.now();
  const response = await fetch(`${configuration.baseUrl}${path}?${query.toString()}`, {
    method: 'GET',
    headers,
    signal,
    dispatcher: Dispatcher,
  });
  const httpLatencyMs = Math.max(0, performance.now() - startedAt);
  const body = await response.text();
  if (!response.ok)
    throw Object.assign(
      new Error(
        `HTTP Error ${response.status}${response.statusText ? ` (${response.statusText})` : ''}: ${body}`,
      ),
      { status: response.status, retryAfter: response.headers.get('retry-after') },
    );
  return { value: z.unknown().parse(JSON.parse(body)), httpLatencyMs };
}

/** @param {unknown} input */
function handleMessage(input) {
  if (
    typeof input === 'object' &&
    input !== null &&
    'cancelId' in input &&
    typeof input.cancelId === 'number'
  ) {
    ActiveControllers.get(input.cancelId)?.abort(
      new Error('AUTHENTICATED_HTTP_WORKER_REQUEST_CANCELLED'),
    );
    return;
  }
  void (async () => {
    if (
      typeof input !== 'object' ||
      input === null ||
      !('id' in input) ||
      typeof input.id !== 'number' ||
      !('operation' in input) ||
      typeof input.operation !== 'string' ||
      !('subaccount' in input) ||
      typeof input.subaccount !== 'string' ||
      !('timeoutMs' in input) ||
      typeof input.timeoutMs !== 'number'
    )
      throw new Error('AUTHENTICATED_HTTP_WORKER_REQUEST_INVALID');
    const request = input;
    const workerStartedAt = performance.now();
    const Controller = new AbortController();
    ActiveControllers.set(request.id, Controller);
    const Timeout = setTimeout(
      () => Controller.abort(new Error('AUTHENTICATED_HTTP_WORKER_REQUEST_TIMEOUT')),
      request.timeoutMs,
    );
    try {
      let value;
      let httpLatencyMs;
      if (request.operation === 'ACCOUNT_OVERVIEW') {
        ({ value, httpLatencyMs } = await get(
          '/api/v1/account_overviews',
          new URLSearchParams({ account: request.subaccount }),
          Controller.signal,
        ));
      } else if (request.operation === 'FEE_RATES') {
        ({ value, httpLatencyMs } = await get(
          '/api/v1/user_fee_rates',
          new URLSearchParams({ account: request.subaccount }),
          Controller.signal,
        ));
      } else if (request.operation === 'POSITIONS' || request.operation === 'POSITION_SETTINGS') {
        const query = new URLSearchParams({
          account: request.subaccount,
          include_deleted: request.operation === 'POSITION_SETTINGS' ? 'true' : 'false',
          limit: request.operation === 'POSITION_SETTINGS' ? '100' : '10',
        });
        if ('marketAddress' in request && typeof request.marketAddress === 'string')
          query.set('market_address', request.marketAddress);
        ({ value, httpLatencyMs } = await get(
          '/api/v1/account_positions',
          query,
          Controller.signal,
        ));
      } else if (request.operation === 'OPEN_ORDERS') {
        const result = await get(
          '/api/v1/open_orders',
          new URLSearchParams({ account: request.subaccount, limit: '200', offset: '0' }),
          Controller.signal,
        );
        httpLatencyMs = result.httpLatencyMs;
        if (typeof result.value !== 'object' || result.value === null || !('items' in result.value))
          throw new Error('AUTHENTICATED_HTTP_WORKER_OPEN_ORDERS_INVALID');
        value = result.value.items;
      } else {
        throw new Error('AUTHENTICATED_HTTP_WORKER_OPERATION_INVALID');
      }
      parentPort.postMessage({
        id: request.id,
        ok: true,
        value,
        diagnostics: {
          operation: request.operation,
          httpLatencyMs,
          workerLatencyMs: Math.max(0, performance.now() - workerStartedAt),
        },
      });
    } catch (error) {
      parentPort.postMessage({
        id: request.id,
        ok: false,
        status: error instanceof Error && 'status' in error ? error.status : undefined,
        retryAfter: error instanceof Error && 'retryAfter' in error ? error.retryAfter : undefined,
        error: error instanceof Error ? error.message : 'AUTHENTICATED_HTTP_WORKER_READ_FAILED',
      });
    } finally {
      clearTimeout(Timeout);
      ActiveControllers.delete(request.id);
    }
  })();
}

parentPort.on('message', handleMessage);

parentPort.postMessage({ ready: true });
