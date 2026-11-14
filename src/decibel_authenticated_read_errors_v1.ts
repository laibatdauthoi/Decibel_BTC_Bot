/** Classification of authenticated read errors (split from the orchestrator). */

import { isDecibelHTTP429V1 } from './decibel_http_read_backoff_v1.js';

export function getErrorChain(error: unknown): readonly unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  while (current !== undefined && current !== null && !chain.includes(current)) {
    chain.push(current);
    current = current instanceof Error ? current.cause : undefined;
  }
  return chain;
}

export function isTransientDecibelAuthenticatedReadErrorV1(error: unknown): boolean {
  return getErrorChain(error).some((candidate) => {
    if (!(candidate instanceof Error)) return false;
    const code =
      'code' in candidate && typeof candidate.code === 'string' ? candidate.code.toUpperCase() : '';
    if (
      [
        'ETIMEDOUT',
        'ECONNRESET',
        'ECONNREFUSED',
        'EPIPE',
        'ENETDOWN',
        'ENETUNREACH',
        'EAI_AGAIN',
      ].includes(code) ||
      code.startsWith('UND_ERR_')
    )
      return true;
    const status =
      'status' in candidate && typeof candidate.status === 'number'
        ? candidate.status
        : 'statusCode' in candidate && typeof candidate.statusCode === 'number'
          ? candidate.statusCode
          : null;
    if (status === 408 || status === 429 || (status !== null && status >= 500)) return true;
    return /timeout|timed out|network|fetch failed|socket hang up|temporarily unavailable/i.test(
      candidate.message,
    );
  });
}

export function isDecibelHttpRateLimitErrorV1(error: unknown): boolean {
  return isDecibelHTTP429V1(error);
}

export function isUnrecoverableDecibelAuthenticationErrorV1(error: unknown): boolean {
  return getErrorChain(error).some((candidate) => {
    if (!(candidate instanceof Error)) return false;
    const status =
      'status' in candidate && typeof candidate.status === 'number'
        ? candidate.status
        : 'statusCode' in candidate && typeof candidate.statusCode === 'number'
          ? candidate.statusCode
          : null;
    if (status === 401 || status === 403) return true;
    return (
      candidate.message !== 'PRODUCTION_AUTHENTICATED_READ_REQUIRED' &&
      /unauthori[sz]ed|forbidden|invalid (?:api[ _-]?key|credential|token)|credential(?:s)? (?:invalid|missing|rejected)/i.test(
        candidate.message,
      )
    );
  });
}

export function getPermanentAuthenticatedReadIntegrityBlockerV1(error: unknown): string | null {
  for (const candidate of getErrorChain(error)) {
    if (!(candidate instanceof Error)) continue;
    if (candidate.message === 'PRODUCTION_LIVE_SOURCE_BOOK_STALE') continue;
    if (
      candidate.message.startsWith('PRODUCTION_LIVE_SOURCE_') ||
      candidate.message === 'SDK_RUNTIME_UNAVAILABLE' ||
      candidate.name === 'ZodError'
    )
      return candidate.message;
  }
  return null;
}
