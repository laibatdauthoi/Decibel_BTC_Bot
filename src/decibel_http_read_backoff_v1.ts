export const DECIBEL_HTTP_READ_BACKOFF_V1 = 'DECIBEL_HTTP_READ_BACKOFF_V1' as const;

let BackoffUntil = 0;

export function getDecibelHTTPReadBackoffUntilV1(): number {
  return BackoffUntil;
}

export function isDecibelHTTPReadBackoffActiveV1(now = Date.now()): boolean {
  return now < BackoffUntil;
}

export function assertDecibelHTTPReadAllowedV1(now = Date.now()): void {
  if (isDecibelHTTPReadBackoffActiveV1(now))
    throw new Error('PRODUCTION_DECIBEL_HTTP_RATE_LIMITED');
}

export function enterDecibelHTTPReadBackoffV1(durationMs: number, now = Date.now()): number {
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0)
    throw new Error('DECIBEL_HTTP_BACKOFF_DURATION_INVALID');
  BackoffUntil = Math.max(BackoffUntil, now + durationMs);
  return BackoffUntil;
}

export function resetDecibelHTTPReadBackoffForTestV1(): void {
  BackoffUntil = 0;
}

export function isDecibelHTTP429V1(error: unknown): boolean {
  let Candidate: unknown = error;
  const Visited = new Set<unknown>();
  while (Candidate !== null && Candidate !== undefined && !Visited.has(Candidate)) {
    Visited.add(Candidate);
    if (typeof Candidate === 'object') {
      if ('status' in Candidate && Number(Candidate.status) === 429) return true;
      if ('statusCode' in Candidate && Number(Candidate.statusCode) === 429) return true;
      if (
        'response' in Candidate &&
        typeof Candidate.response === 'object' &&
        Candidate.response !== null &&
        'status' in Candidate.response &&
        Number(Candidate.response.status) === 429
      )
        return true;
    }
    if (
      Candidate instanceof Error &&
      /\b(?:HTTP(?: Error)?\s+)?429\b|Too Many Requests/i.test(Candidate.message)
    )
      return true;
    Candidate = Candidate instanceof Error ? Candidate.cause : undefined;
  }
  return false;
}

// Only a remote 429 starts/extends a cooldown. A local gate rejection is
// deliberately not a remote response and must never slide its own deadline.
export function enterDecibelHTTPReadBackoffForErrorV1(
  error: unknown,
  fallbackMs: number,
  now = Date.now(),
): number {
  if (!isDecibelHTTP429V1(error)) return getDecibelHTTPReadBackoffUntilV1();
  let durationMs = fallbackMs;
  let candidate: unknown = error;
  const visited = new Set<unknown>();
  while (candidate instanceof Error && !visited.has(candidate)) {
    visited.add(candidate);
    if ('retryAfter' in candidate && typeof candidate.retryAfter === 'string') {
      const value = candidate.retryAfter.trim();
      const seconds = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
      const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
      if (Number.isFinite(delay) && delay >= 0) durationMs = Math.max(durationMs, Math.ceil(delay));
    }
    candidate = candidate.cause;
  }
  return enterDecibelHTTPReadBackoffV1(durationMs, now);
}
