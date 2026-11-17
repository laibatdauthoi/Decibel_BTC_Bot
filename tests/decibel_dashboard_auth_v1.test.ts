import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDecibelSessionCookieV1,
  decibel_dashboard_auth_v1,
  deriveDecibelEd25519AuthKeyV1,
  handleDecibelAuthRequestV1,
  readDecibelDashboardAuthModeV1,
  readDecibelSessionCookieV1,
} from '../src/decibel_dashboard_auth_v1.js';

function makeWallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const publicKeyHex = `0x${raw.toString('hex')}`;
  const authKey = deriveDecibelEd25519AuthKeyV1(publicKeyHex);
  return {
    publicKeyHex,
    // A never-rotated account's address equals its authentication key.
    address: authKey,
    authKey,
    sign: (message: string) => `0x${sign(null, Buffer.from(message), privateKey).toString('hex')}`,
  };
}

const petraFullMessage = (address: string, message: string, nonce: string) =>
  `APTOS\naddress: ${address}\nmessage: ${message}\nnonce: ${nonce}`;

function setup(options: { whitelisted?: boolean; authKeyOverride?: string } = {}) {
  const Owner = makeWallet();
  let now = 1_800_000_000_000;
  const Auth = new decibel_dashboard_auth_v1({
    isServedOwner: (address) => address === Owner.address,
    isWhitelisted: () => options.whitelisted ?? true,
    readAuthKey: () => Promise.resolve(options.authKeyOverride ?? Owner.authKey),
    sessionsPath: join(mkdtempSync(join(tmpdir(), 'dashboard-auth-')), 'sessions.json'),
    now: () => now,
  });
  const signIn = async (wallet = Owner) => {
    const challenge = Auth.createChallenge(wallet.address);
    const fullMessage = petraFullMessage(wallet.address, challenge.message, challenge.nonce);
    return Auth.verify({
      address: wallet.address,
      publicKey: wallet.publicKeyHex,
      signature: wallet.sign(fullMessage),
      fullMessage,
    });
  };
  return { Owner, Auth, signIn, advance: (ms: number) => (now += ms) };
}

describe('Dashboard wallet sign-in', () => {
  it('reads the mode and defaults to off', () => {
    expect(readDecibelDashboardAuthModeV1({})).toBe('off');
    expect(readDecibelDashboardAuthModeV1({ DECIBEL_DASHBOARD_AUTH: 'WALLET' })).toBe('wallet');
    expect(() => readDecibelDashboardAuthModeV1({ DECIBEL_DASHBOARD_AUTH: 'yes' })).toThrow(
      'DECIBEL_DASHBOARD_AUTH_INVALID',
    );
  });

  it('signs the owner in with a Petra signature and accepts the cookie', async () => {
    const { Owner, Auth, signIn } = setup();
    const session = await signIn();
    expect(session.address).toBe(Owner.address);
    const cookie = buildDecibelSessionCookieV1(session.token, { secure: true });
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
    expect(Auth.authenticate(`other=1; ${cookie.split(';')[0]}`)).toBe(Owner.address);
    expect(Auth.authenticate('decibel_session=' + 'f'.repeat(64))).toBeNull();
    Auth.logout(cookie.split(';')[0]);
    expect(Auth.authenticate(cookie.split(';')[0])).toBeNull();
  });

  it('rejects another wallet, a bad signature, replay and expired challenges', async () => {
    const { Owner, Auth, signIn, advance } = setup();
    await expect(signIn(makeWallet())).rejects.toThrow('AUTH_NOT_RUNTIME_OWNER');

    const challenge = Auth.createChallenge(Owner.address);
    const fullMessage = petraFullMessage(Owner.address, challenge.message, challenge.nonce);
    await expect(
      Auth.verify({
        address: Owner.address,
        publicKey: Owner.publicKeyHex,
        signature: makeWallet().sign(fullMessage),
        fullMessage,
      }),
    ).rejects.toThrow('AUTH_SIGNATURE_INVALID');
    // The nonce was consumed by the failed attempt: no replay.
    await expect(
      Auth.verify({
        address: Owner.address,
        publicKey: Owner.publicKeyHex,
        signature: Owner.sign(fullMessage),
        fullMessage,
      }),
    ).rejects.toThrow('AUTH_CHALLENGE_UNKNOWN');

    const late = Auth.createChallenge(Owner.address);
    advance(5 * 60 * 1000 + 1);
    const lateMessage = petraFullMessage(Owner.address, late.message, late.nonce);
    await expect(
      Auth.verify({
        address: Owner.address,
        publicKey: Owner.publicKeyHex,
        signature: Owner.sign(lateMessage),
        fullMessage: lateMessage,
      }),
    ).rejects.toThrow('AUTH_CHALLENGE_EXPIRED');

    const tampered = Auth.createChallenge(Owner.address);
    const wrongText = petraFullMessage(Owner.address, 'Send all funds', tampered.nonce);
    await expect(
      Auth.verify({
        address: Owner.address,
        publicKey: Owner.publicKeyHex,
        signature: Owner.sign(wrongText),
        fullMessage: wrongText,
      }),
    ).rejects.toThrow('AUTH_MESSAGE_MISMATCH');
  });

  it('requires the on-chain key and the whitelist', async () => {
    await expect(setup({ authKeyOverride: `0x${'00'.repeat(32)}` }).signIn()).rejects.toThrow(
      'AUTH_KEY_NOT_ACCOUNT_KEY',
    );
    await expect(setup({ whitelisted: false }).signIn()).rejects.toThrow('WALLET_NOT_WHITELISTED');
  });

  it('expires sessions after 7 days', async () => {
    const { Auth, signIn, advance } = setup();
    const session = await signIn();
    const cookie = `decibel_session=${session.token}`;
    advance(7 * 24 * 60 * 60 * 1000 - 1);
    expect(Auth.authenticate(cookie)).not.toBeNull();
    advance(2);
    expect(Auth.authenticate(cookie)).toBeNull();
  });

  it('parses only well-formed session cookies', () => {
    expect(readDecibelSessionCookieV1(undefined)).toBeNull();
    expect(readDecibelSessionCookieV1('decibel_session=abc')).toBeNull();
    expect(readDecibelSessionCookieV1(`a=b; decibel_session=${'a'.repeat(64)}`)).toBe(
      'a'.repeat(64),
    );
  });
});

describe('Auth routes', () => {
  it('reports sign-in off without any wallet step', async () => {
    const base = { body: null, cookie: undefined, auth: null, secureCookie: false };
    expect(
      await handleDecibelAuthRequestV1({ ...base, method: 'GET', pathname: '/api/auth/session' }),
    ).toEqual({
      status: 200,
      body: { mode: 'off', authenticated: true, address: null },
    });
    expect(
      await handleDecibelAuthRequestV1({
        ...base,
        method: 'POST',
        pathname: '/api/auth/challenge',
      }),
    ).toEqual({
      status: 404,
      body: { error: 'AUTH_DISABLED' },
    });
  });

  it('runs challenge, verify (cookie) and logout', async () => {
    const { Owner, Auth } = setup();
    const call = (method: string, pathname: string, body: unknown = null, cookie?: string) =>
      handleDecibelAuthRequestV1({
        method,
        pathname,
        body,
        cookie,
        auth: Auth,
        secureCookie: false,
      });
    const challenge = (await call('POST', '/api/auth/challenge', { address: Owner.address }))!
      .body as {
      message: string;
      nonce: string;
    };
    const fullMessage = petraFullMessage(Owner.address, challenge.message, challenge.nonce);
    const verified = await call('POST', '/api/auth/verify', {
      address: Owner.address,
      publicKey: Owner.publicKeyHex,
      signature: Owner.sign(fullMessage),
      fullMessage,
    });
    expect(verified?.status).toBe(200);
    const cookie = verified!.setCookie!.split(';')[0]!;
    expect(cookie).toMatch(/^decibel_session=[0-9a-f]{64}$/);
    expect(JSON.stringify(verified?.body)).not.toContain(cookie.split('=')[1]);
    expect((await call('GET', '/api/auth/session', null, cookie))?.body).toEqual({
      mode: 'wallet',
      authenticated: true,
      address: Owner.address,
    });
    const logout = await call('POST', '/api/auth/logout', {}, cookie);
    expect(logout?.setCookie).toContain('Max-Age=0');
    expect((await call('GET', '/api/auth/session', null, cookie))?.body).toMatchObject({
      authenticated: false,
    });
    expect((await call('POST', '/api/auth/verify', { address: 'x' }))?.status).toBe(401);
  });
});
