/**
 * Request guard of the local production dashboard (added 2026-11-16).
 *
 * The server listens on 127.0.0.1 only, but a web page open in the operator's browser can
 * still reach it: a cross-site "simple" POST (text/plain body, no CORS preflight) or a DNS
 * rebinding page whose name resolves to 127.0.0.1. Either could start a session or change
 * settings. The guard rejects:
 * - any request whose Host is not this server (blocks DNS rebinding, reads included);
 * - a state-changing request from another Origin (blocks cross-site requests);
 * - a state-changing request without a JSON content type (forces a CORS preflight, which
 *   this server never answers, for any cross-origin browser request).
 */
export type decibel_web_request_rejection_v1 = Readonly<{
  status: 403 | 415;
  error: 'HOST_NOT_ALLOWED' | 'ORIGIN_NOT_ALLOWED' | 'CONTENT_TYPE_NOT_JSON';
}>;

const SAFE_METHODS_V1 = new Set(['GET', 'HEAD']);

export function checkDecibelWebRequestV1(
  input: Readonly<{
    method: string | undefined;
    host: string | undefined;
    origin: string | undefined;
    contentType: string | undefined;
    port: number;
  }>,
): decibel_web_request_rejection_v1 | null {
  const allowedHosts = [`127.0.0.1:${input.port}`, `localhost:${input.port}`];
  const host = input.host?.trim().toLowerCase();
  if (host === undefined || !allowedHosts.includes(host))
    return { status: 403, error: 'HOST_NOT_ALLOWED' };
  if (SAFE_METHODS_V1.has((input.method ?? 'GET').toUpperCase())) return null;
  if (
    input.origin !== undefined &&
    !allowedHosts.some((allowed) => input.origin?.toLowerCase() === `http://${allowed}`)
  )
    return { status: 403, error: 'ORIGIN_NOT_ALLOWED' };
  const mediaType = input.contentType?.split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') return { status: 415, error: 'CONTENT_TYPE_NOT_JSON' };
  return null;
}
