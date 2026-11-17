/**
 * Multi-wallet gateway (added 2026-11-17).
 *
 * One public entry point in front of one runtime process per wallet:
 *   browser -> gateway (wallet sign-in) -> 127.0.0.1:<wallet port> runtime
 *
 * - /api/auth/* is answered by the gateway (Petra sign-in, any configured + whitelisted owner).
 * - Every other /api/* request needs a session and goes to the signed-in owner's runtime only.
 * - Static dashboard files are the same in every runtime and come from the first one.
 * - The gateway enforces its own Host / Origin / JSON guard for its public host, then calls the
 *   runtime as a same-origin local client (runtime sign-in stays off; it listens on 127.0.0.1).
 */
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  handleDecibelAuthRequestV1,
  type decibel_dashboard_auth_v1,
} from './decibel_dashboard_auth_v1.js';
import { normalizeDecibelAddressV1 } from './decibel_wallet_workspace_v1.js';

export const DECIBEL_WALLET_REGISTRY_PATH_V1 = 'config/wallets.json';

const RegistrySchema = z.object({
  gateway: z
    .object({
      port: z.number().int().min(1024).max(65_535).default(4170),
      /** Public host the browser uses, e.g. "bot.example.com" or "127.0.0.1:4170". */
      publicHost: z.string().min(1).max(255).optional(),
      /** "https" behind a TLS proxy; sets the Secure cookie flag. */
      publicScheme: z.enum(['http', 'https']).default('http'),
    })
    .default({}),
  wallets: z
    .array(
      z.object({
        subaccount: z.string(),
        port: z.number().int().min(1024).max(65_535),
        label: z.string().max(80).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export type decibel_wallet_registry_v1 = z.infer<typeof RegistrySchema>;

export function loadDecibelWalletRegistryV1(
  path: string = DECIBEL_WALLET_REGISTRY_PATH_V1,
): decibel_wallet_registry_v1 {
  let parsed: decibel_wallet_registry_v1;
  try {
    parsed = RegistrySchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    throw new Error('WALLET_REGISTRY_INVALID', { cause: error });
  }
  const subaccounts = parsed.wallets.map((wallet) => normalizeDecibelAddressV1(wallet.subaccount));
  const ports = [parsed.gateway.port, ...parsed.wallets.map((wallet) => wallet.port)];
  if (new Set(subaccounts).size !== subaccounts.length)
    throw new Error('WALLET_REGISTRY_DUPLICATE_SUBACCOUNT');
  if (new Set(ports).size !== ports.length) throw new Error('WALLET_REGISTRY_DUPLICATE_PORT');
  return parsed;
}

/** Guard for the public side; same rules as the runtime guard, for the gateway's host. */
export function checkDecibelGatewayRequestV1(
  input: Readonly<{
    method: string | undefined;
    host: string | undefined;
    origin: string | undefined;
    contentType: string | undefined;
    publicHost: string;
    publicScheme: 'http' | 'https';
  }>,
): Readonly<{ status: 403 | 415; error: string }> | null {
  const publicHost = input.publicHost.toLowerCase();
  if (input.host?.trim().toLowerCase() !== publicHost)
    return { status: 403, error: 'HOST_NOT_ALLOWED' };
  const method = (input.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return null;
  if (
    input.origin !== undefined &&
    input.origin.toLowerCase() !== `${input.publicScheme}://${publicHost}`
  )
    return { status: 403, error: 'ORIGIN_NOT_ALLOWED' };
  if (input.contentType?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
    return { status: 415, error: 'CONTENT_TYPE_NOT_JSON' };
  return null;
}

/** Headers for the local runtime: same-origin to it, without the gateway cookie. */
export function buildDecibelRuntimeHeadersV1(
  headers: IncomingHttpHeaders,
  port: number,
): IncomingHttpHeaders {
  const forwarded: IncomingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === 'cookie' || lower === 'host' || lower === 'origin' || lower === 'referer')
      continue;
    if (lower === 'connection' || lower === 'keep-alive' || lower === 'upgrade') continue;
    forwarded[lower] = value;
  }
  forwarded.host = `127.0.0.1:${port}`;
  if (headers.origin !== undefined) forwarded.origin = `http://127.0.0.1:${port}`;
  return forwarded;
}

function writeJson(
  response: ServerResponse,
  status: number,
  value: unknown,
  setCookie?: string,
): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(setCookie === undefined ? {} : { 'Set-Cookie': setCookie }),
  });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    length += value.length;
    if (length > 32_768) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(value);
  }
  return chunks.length === 0
    ? null
    : (JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
}

function proxy(request: IncomingMessage, response: ServerResponse, port: number): void {
  const Upstream = httpRequest(
    {
      host: '127.0.0.1',
      port,
      method: request.method,
      path: request.url,
      headers: buildDecibelRuntimeHeadersV1(request.headers, port),
    },
    (upstream) => {
      response.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(response);
    },
  );
  Upstream.on('error', () => {
    if (!response.headersSent) writeJson(response, 502, { error: 'WALLET_RUNTIME_UNAVAILABLE' });
    else response.end();
  });
  response.on('close', () => Upstream.destroy());
  request.pipe(Upstream);
}

export type decibel_wallet_gateway_options_v1 = Readonly<{
  auth: decibel_dashboard_auth_v1;
  /** Normalized owner address -> runtime port. */
  ownerPorts: ReadonlyMap<string, number>;
  staticPort: number;
  publicHost: string;
  publicScheme: 'http' | 'https';
}>;

export function handleDecibelGatewayRequestV1(
  options: decibel_wallet_gateway_options_v1,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const rejection = checkDecibelGatewayRequestV1({
    method: request.method,
    host: request.headers.host,
    origin: request.headers.origin,
    contentType: request.headers['content-type'],
    publicHost: options.publicHost,
    publicScheme: options.publicScheme,
  });
  if (rejection !== null) {
    request.resume();
    return writeJson(response, rejection.status, { error: rejection.error });
  }
  const pathname = new URL(request.url ?? '/', 'http://gateway').pathname;
  if (pathname.startsWith('/api/auth/')) {
    void (async () => {
      const result = await handleDecibelAuthRequestV1({
        method: request.method ?? 'GET',
        pathname,
        body: request.method === 'POST' ? await readBody(request) : null,
        cookie: request.headers.cookie,
        auth: options.auth,
        secureCookie: options.publicScheme === 'https',
      });
      if (result === null) return writeJson(response, 404, { error: 'NOT_FOUND' });
      writeJson(response, result.status, result.body, result.setCookie);
    })().catch(() => writeJson(response, 400, { error: 'AUTH_REQUEST_INVALID' }));
    return;
  }
  if (pathname.startsWith('/api/')) {
    const owner = options.auth.authenticate(request.headers.cookie);
    if (owner === null) {
      request.resume();
      return writeJson(response, 401, { error: 'AUTH_REQUIRED' });
    }
    const port = options.ownerPorts.get(normalizeDecibelAddressV1(owner));
    if (port === undefined) {
      request.resume();
      return writeJson(response, 403, { error: 'WALLET_NOT_SERVED' });
    }
    return proxy(request, response, port);
  }
  return proxy(request, response, options.staticPort);
}

export function createDecibelWalletGatewayV1(options: decibel_wallet_gateway_options_v1): Server {
  return createServer((request, response) =>
    handleDecibelGatewayRequestV1(options, request, response),
  );
}
