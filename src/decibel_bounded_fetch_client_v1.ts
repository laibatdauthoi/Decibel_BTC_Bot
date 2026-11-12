import type { Client, ClientRequest, ClientResponse } from '@aptos-labs/ts-sdk';

export const DECIBEL_BOUNDED_FETCH_CLIENT_V1 = 'DECIBEL_BOUNDED_FETCH_CLIENT_V1' as const;

type fetch_v1 = (input: string | URL, init?: RequestInit) => Promise<Response>;

function appendQueryParameters(url: string, parameters: unknown): string {
  if (typeof parameters !== 'object' || parameters === null) return url;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined)
      query.set(key, typeof value === 'bigint' ? value.toString() : String(value));
  }
  if (query.size === 0) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${query.toString()}`;
}

function makeHeaders(request: ClientRequest<unknown>): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    headers.set(key, String(value));
  }
  for (const [key, value] of Object.entries(request.overrides?.HEADERS ?? {})) {
    headers.set(key, String(value));
  }
  if (request.overrides?.API_KEY !== undefined && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${request.overrides.API_KEY}`);
  }
  if (request.contentType !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', request.contentType);
  }
  return headers;
}

function makeBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (body instanceof Uint8Array) return new Uint8Array(body);
  return JSON.stringify(body);
}

/**
 * Native-fetch Aptos read client with no transport retries. Every call owns a
 * fresh cancellation context, so a timed-out request cannot poison or outlive
 * a later RuntimeSupervisor attempt.
 */
export function createDecibelBoundedFetchClientV1(
  options: Readonly<{
    timeoutMs: number;
    fetch?: fetch_v1;
  }>,
): Client {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('DECIBEL_BOUNDED_FETCH_TIMEOUT_INVALID');
  }
  const Fetch = options.fetch ?? globalThis.fetch;
  return Object.freeze({
    provider: async <Request, ResponseBody>(
      request: ClientRequest<Request>,
    ): Promise<ClientResponse<ResponseBody>> => {
      const Controller = new AbortController();
      let Timeout: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<never>((_resolve, reject) => {
        Timeout = setTimeout(() => {
          const error = new Error('DECIBEL_BOUNDED_FETCH_TIMEOUT');
          Controller.abort(error);
          reject(error);
        }, options.timeoutMs);
      });
      try {
        const body = makeBody(request.body);
        const response = await Promise.race([
          Fetch(appendQueryParameters(request.url, request.params), {
            method: request.method,
            headers: makeHeaders(request),
            ...(body === undefined ? {} : { body }),
            signal: Controller.signal,
            credentials: request.overrides?.WITH_CREDENTIALS === true ? 'include' : 'omit',
          }),
          expired,
        ]);
        const text = await Promise.race([response.text(), expired]);
        const data = (text.length === 0 ? null : JSON.parse(text)) as ResponseBody;
        return Object.freeze({
          status: response.status,
          statusText: response.statusText,
          data,
          headers: response.headers,
        });
      } finally {
        clearTimeout(Timeout);
      }
    },
  });
}
