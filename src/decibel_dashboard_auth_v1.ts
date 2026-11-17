/**
 * Dashboard sign-in with the owner wallet (added 2026-11-17).
 *
 * With DECIBEL_DASHBOARD_AUTH=wallet every API route needs a session cookie, obtained by
 * signing a one-time challenge in Petra:
 *   1. POST /api/auth/challenge {address}       -> {message, nonce} (valid 5 minutes, used once)
 *   2. Petra signMessage(message, nonce)         -> fullMessage + Ed25519 signature
 *   3. POST /api/auth/verify {address, publicKey, signature, fullMessage}
 * The server checks the signature, that the public key is the account's current on-chain
 * authentication key, that the address is this runtime's owner and on the whitelist, and then
 * sets an HttpOnly SameSite=Strict cookie (7 days). Only a SHA-256 of the token is stored.
 *
 * DECIBEL_DASHBOARD_AUTH defaults to `off` for the local single-operator setup, where the
 * request guard (Host / Origin / JSON) already blocks other web pages.
 */
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import {
  loadDecibelWalletWhitelistV1,
  normalizeDecibelAddressV1,
  resolveDecibelWalletPathsV1,
} from './decibel_wallet_workspace_v1.js';

export const DECIBEL_DASHBOARD_COOKIE_V1 = 'decibel_session';
const CHALLENGE_TTL_MS_V1 = 5 * 60 * 1000;
const SESSION_TTL_MS_V1 = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING_CHALLENGES_V1 = 100;
const ED25519_SPKI_PREFIX_V1 = Buffer.from('302a300506032b6570032100', 'hex');

export type decibel_dashboard_auth_mode_v1 = 'off' | 'wallet';

export function readDecibelDashboardAuthModeV1(
  environment: NodeJS.ProcessEnv,
): decibel_dashboard_auth_mode_v1 {
  const value = environment.DECIBEL_DASHBOARD_AUTH?.trim().toLowerCase() ?? 'off';
  if (value === 'off' || value === 'wallet') return value;
  throw new Error('DECIBEL_DASHBOARD_AUTH_INVALID');
}

function hexBytes(value: string, length: number, error: string): Buffer {
  const match = /^(?:0x)?([0-9a-fA-F]+)$/.exec(value.trim());
  const bytes = match ? Buffer.from(match[1]!, 'hex') : Buffer.alloc(0);
  if (bytes.length !== length) throw new Error(error);
  return bytes;
}

/** Single-key Ed25519 authentication key: SHA3-256(public key || 0x00). */
export function deriveDecibelEd25519AuthKeyV1(publicKeyHex: string): string {
  const publicKey = hexBytes(publicKeyHex, 32, 'AUTH_PUBLIC_KEY_INVALID');
  return `0x${createHash('sha3-256')
    .update(Buffer.concat([publicKey, Buffer.from([0])]))
    .digest('hex')}`;
}

export function verifyDecibelEd25519SignatureV1(
  publicKeyHex: string,
  message: string,
  signatureHex: string,
): boolean {
  const key = createPublicKey({
    key: Buffer.concat([
      ED25519_SPKI_PREFIX_V1,
      hexBytes(publicKeyHex, 32, 'AUTH_PUBLIC_KEY_INVALID'),
    ]),
    format: 'der',
    type: 'spki',
  });
  return verify(
    null,
    Buffer.from(message, 'utf8'),
    key,
    hexBytes(signatureHex, 64, 'AUTH_SIGNATURE_INVALID'),
  );
}

/** Current on-chain authentication key of an account (follows key rotation). */
export async function readDecibelAccountAuthKeyV1(
  input: Readonly<{
    fullnodeUrl: string;
    address: string;
    nodeApiKey?: string | undefined;
    fetchImpl?: typeof fetch;
  }>,
): Promise<string> {
  const response = await (input.fetchImpl ?? fetch)(
    `${input.fullnodeUrl.replace(/\/+$/, '')}/accounts/${normalizeDecibelAddressV1(input.address)}`,
    {
      headers: input.nodeApiKey ? { Authorization: `Bearer ${input.nodeApiKey}` } : {},
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`AUTH_ACCOUNT_READ_FAILED:HTTP_${response.status}`);
  const parsed = z.object({ authentication_key: z.string() }).safeParse(await response.json());
  if (!parsed.success) throw new Error('AUTH_ACCOUNT_RESPONSE_INVALID');
  return normalizeDecibelAddressV1(parsed.data.authentication_key);
}

const VerifySchema = z.object({
  address: z.string().max(80),
  publicKey: z.string().max(200),
  signature: z.string().max(400),
  fullMessage: z.string().max(2_000),
});

const SessionFileSchema = z.object({
  sessions: z.array(
    z.object({ tokenHash: z.string(), address: z.string(), expiresAt: z.number() }),
  ),
});

export type decibel_dashboard_auth_dependencies_v1 = Readonly<{
  ownerAddress: string;
  isWhitelisted: (address: string) => boolean;
  readAuthKey: (address: string) => Promise<string>;
  sessionsPath: string;
  now?: () => number;
}>;

export class decibel_dashboard_auth_v1 {
  private readonly Challenges = new Map<
    string,
    { address: string; message: string; expiresAt: number }
  >();
  private readonly Sessions = new Map<string, { address: string; expiresAt: number }>();
  private readonly owner: string;
  private readonly now: () => number;

  public constructor(private readonly dependencies: decibel_dashboard_auth_dependencies_v1) {
    this.owner = normalizeDecibelAddressV1(dependencies.ownerAddress);
    this.now = dependencies.now ?? Date.now;
    if (existsSync(dependencies.sessionsPath)) {
      try {
        const file = SessionFileSchema.parse(
          JSON.parse(readFileSync(dependencies.sessionsPath, 'utf8')),
        );
        for (const session of file.sessions)
          if (session.expiresAt > this.now())
            this.Sessions.set(session.tokenHash, {
              address: session.address,
              expiresAt: session.expiresAt,
            });
      } catch {
        // An unreadable session file only means everyone signs in again.
      }
    }
  }

  public createChallenge(
    addressInput: unknown,
  ): Readonly<{ message: string; nonce: string; expiresAt: number }> {
    const address = normalizeDecibelAddressV1(z.string().max(80).parse(addressInput));
    const now = this.now();
    for (const [nonce, challenge] of this.Challenges)
      if (challenge.expiresAt <= now) this.Challenges.delete(nonce);
    if (this.Challenges.size >= MAX_PENDING_CHALLENGES_V1)
      throw new Error('AUTH_TOO_MANY_CHALLENGES');
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = now + CHALLENGE_TTL_MS_V1;
    const message = `Sign in to Decibel MM V1\nWallet: ${address}\nIssued: ${new Date(now).toISOString()}`;
    this.Challenges.set(nonce, { address, message, expiresAt });
    return Object.freeze({ message, nonce, expiresAt });
  }

  /** Returns the session token for the cookie. */
  public async verify(
    input: unknown,
  ): Promise<Readonly<{ token: string; address: string; expiresAt: number }>> {
    const body = VerifySchema.parse(input);
    const address = normalizeDecibelAddressV1(body.address);
    const nonce = /\nnonce: ([0-9a-f]{32})$/.exec(body.fullMessage)?.[1];
    const challenge = nonce === undefined ? undefined : this.Challenges.get(nonce);
    if (nonce === undefined || challenge === undefined) throw new Error('AUTH_CHALLENGE_UNKNOWN');
    this.Challenges.delete(nonce);
    if (challenge.expiresAt <= this.now()) throw new Error('AUTH_CHALLENGE_EXPIRED');
    if (challenge.address !== address) throw new Error('AUTH_ADDRESS_MISMATCH');
    if (
      !body.fullMessage.startsWith('APTOS\n') ||
      !body.fullMessage.includes(`\nmessage: ${challenge.message}\n`)
    )
      throw new Error('AUTH_MESSAGE_MISMATCH');
    if (!verifyDecibelEd25519SignatureV1(body.publicKey, body.fullMessage, body.signature))
      throw new Error('AUTH_SIGNATURE_INVALID');
    // Cheap local checks before the network read of the on-chain key.
    if (address !== this.owner) throw new Error('AUTH_NOT_RUNTIME_OWNER');
    if (!this.dependencies.isWhitelisted(address)) throw new Error('WALLET_NOT_WHITELISTED');
    if (
      (await this.dependencies.readAuthKey(address)) !==
      deriveDecibelEd25519AuthKeyV1(body.publicKey)
    )
      throw new Error('AUTH_KEY_NOT_ACCOUNT_KEY');
    const token = randomBytes(32).toString('hex');
    const expiresAt = this.now() + SESSION_TTL_MS_V1;
    this.Sessions.set(this.hash(token), { address, expiresAt });
    this.persist();
    return Object.freeze({ token, address, expiresAt });
  }

  /** Owner address of a valid session cookie, else null. */
  public authenticate(cookieHeader: string | undefined): string | null {
    const token = readDecibelSessionCookieV1(cookieHeader);
    if (token === null) return null;
    const hash = this.hash(token);
    for (const [storedHash, session] of this.Sessions) {
      if (session.expiresAt <= this.now()) continue;
      const a = Buffer.from(storedHash, 'hex');
      const b = Buffer.from(hash, 'hex');
      if (a.length === b.length && timingSafeEqual(a, b)) return session.address;
    }
    return null;
  }

  public logout(cookieHeader: string | undefined): void {
    const token = readDecibelSessionCookieV1(cookieHeader);
    if (token === null) return;
    if (this.Sessions.delete(this.hash(token))) this.persist();
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private persist(): void {
    const now = this.now();
    const sessions = [...this.Sessions]
      .filter(([, session]) => session.expiresAt > now)
      .map(([tokenHash, session]) => ({ tokenHash, ...session }));
    mkdirSync(dirname(this.dependencies.sessionsPath), { recursive: true });
    writeFileSync(this.dependencies.sessionsPath, `${JSON.stringify({ sessions }, null, 2)}\n`, {
      mode: 0o600,
    });
  }
}

export function readDecibelSessionCookieV1(cookieHeader: string | undefined): string | null {
  for (const part of cookieHeader?.split(';') ?? []) {
    const [name, ...rest] = part.trim().split('=');
    if (name === DECIBEL_DASHBOARD_COOKIE_V1) {
      const value = rest.join('=');
      return /^[0-9a-f]{64}$/.test(value) ? value : null;
    }
  }
  return null;
}

export function buildDecibelSessionCookieV1(
  token: string | null,
  options: Readonly<{ secure: boolean; maxAgeSeconds?: number }>,
): string {
  const parts = [
    `${DECIBEL_DASHBOARD_COOKIE_V1}=${token ?? ''}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${token === null ? 0 : (options.maxAgeSeconds ?? SESSION_TTL_MS_V1 / 1000)}`,
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export type decibel_auth_route_result_v1 = Readonly<{
  status: number;
  body: unknown;
  setCookie?: string;
}>;

/** /api/auth/* routes. `auth` is null when DECIBEL_DASHBOARD_AUTH=off. */
export async function handleDecibelAuthRequestV1(
  input: Readonly<{
    method: string;
    pathname: string;
    body: unknown;
    cookie: string | undefined;
    auth: decibel_dashboard_auth_v1 | null;
    secureCookie: boolean;
  }>,
): Promise<decibel_auth_route_result_v1 | null> {
  const { auth, method, pathname } = input;
  if (pathname === '/api/auth/session') {
    if (method !== 'GET') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    if (auth === null)
      return { status: 200, body: { mode: 'off', authenticated: true, address: null } };
    const address = auth.authenticate(input.cookie);
    return { status: 200, body: { mode: 'wallet', authenticated: address !== null, address } };
  }
  if (!pathname.startsWith('/api/auth/')) return null;
  if (auth === null) return { status: 404, body: { error: 'AUTH_DISABLED' } };
  if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  const code = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : '';
    return /^[A-Z_:0-9]+$/.test(message) ? message : fallback;
  };
  if (pathname === '/api/auth/challenge') {
    try {
      const address = z.object({ address: z.string() }).parse(input.body).address;
      return { status: 200, body: auth.createChallenge(address) };
    } catch (error) {
      return { status: 400, body: { error: code(error, 'AUTH_CHALLENGE_INVALID') } };
    }
  }
  if (pathname === '/api/auth/verify') {
    try {
      const session = await auth.verify(input.body);
      return {
        status: 200,
        body: { authenticated: true, address: session.address, expiresAt: session.expiresAt },
        setCookie: buildDecibelSessionCookieV1(session.token, { secure: input.secureCookie }),
      };
    } catch (error) {
      return { status: 401, body: { error: code(error, 'AUTH_VERIFY_FAILED') } };
    }
  }
  if (pathname === '/api/auth/logout') {
    auth.logout(input.cookie);
    return {
      status: 200,
      body: { authenticated: false },
      setCookie: buildDecibelSessionCookieV1(null, { secure: input.secureCookie }),
    };
  }
  return { status: 404, body: { error: 'NOT_FOUND' } };
}

/** Runtime wiring: null when sign-in is off. The whitelist is re-read on every sign-in. */
export function createDecibelDashboardAuthFromEnvironmentV1(
  environment: NodeJS.ProcessEnv,
  fullnodeUrl: string,
): decibel_dashboard_auth_v1 | null {
  if (readDecibelDashboardAuthModeV1(environment) === 'off') return null;
  const owner = environment.DECIBEL_OWNER_ADDRESS?.trim();
  if (!owner) throw new Error('DASHBOARD_AUTH_OWNER_REQUIRED');
  return new decibel_dashboard_auth_v1({
    ownerAddress: owner,
    isWhitelisted: (address) => {
      try {
        return loadDecibelWalletWhitelistV1().has(normalizeDecibelAddressV1(address));
      } catch {
        return false;
      }
    },
    readAuthKey: (address) =>
      readDecibelAccountAuthKeyV1({
        fullnodeUrl,
        address,
        nodeApiKey: environment.DECIBEL_NODE_API_KEY,
      }),
    sessionsPath: join(resolveDecibelWalletPathsV1(owner).root, 'dashboard_sessions_v1.json'),
  });
}
