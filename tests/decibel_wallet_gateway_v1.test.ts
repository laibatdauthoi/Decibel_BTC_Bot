import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  decibel_dashboard_auth_v1,
  deriveDecibelEd25519AuthKeyV1,
} from '../src/decibel_dashboard_auth_v1.js';
import {
  buildDecibelRuntimeHeadersV1,
  checkDecibelGatewayRequestV1,
  createDecibelWalletGatewayV1,
  loadDecibelWalletRegistryV1,
} from '../src/decibel_wallet_gateway_v1.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'wallet-gateway-'));

function makeWallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyHex = `0x${publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')}`;
  const address = deriveDecibelEd25519AuthKeyV1(publicKeyHex);
  return {
    address,
    publicKeyHex,
    sign: (message: string) => `0x${sign(null, Buffer.from(message), privateKey).toString('hex')}`,
  };
}

describe('Wallet registry and gateway guard', () => {
  it('validates the registry and rejects duplicate subaccounts or ports', () => {
    const path = join(tmp(), 'wallets.json');
    const wallet = (subaccount: string, port: number) => ({ subaccount, port });
    writeFileSync(path, JSON.stringify({ wallets: [wallet('0x1', 4181), wallet('0x2', 4182)] }));
    expect(loadDecibelWalletRegistryV1(path).gateway).toEqual({ port: 4170, publicScheme: 'http' });
    writeFileSync(path, JSON.stringify({ wallets: [wallet('0x1', 4181), wallet('0x01', 4182)] }));
    expect(() => loadDecibelWalletRegistryV1(path)).toThrow('WALLET_REGISTRY_DUPLICATE_SUBACCOUNT');
    writeFileSync(
      path,
      JSON.stringify({ gateway: { port: 4181 }, wallets: [wallet('0x1', 4181)] }),
    );
    expect(() => loadDecibelWalletRegistryV1(path)).toThrow('WALLET_REGISTRY_DUPLICATE_PORT');
    writeFileSync(path, JSON.stringify({ wallets: [] }));
    expect(() => loadDecibelWalletRegistryV1(path)).toThrow('WALLET_REGISTRY_INVALID');
  });

  it('guards the public host, origin and content type', () => {
    const base = {
      method: 'POST',
      host: 'bot.example.com',
      origin: 'https://bot.example.com',
      contentType: 'application/json',
      publicHost: 'bot.example.com',
      publicScheme: 'https' as const,
    };
    expect(checkDecibelGatewayRequestV1(base)).toBeNull();
    expect(checkDecibelGatewayRequestV1({ ...base, host: 'evil.example' })?.error).toBe(
      'HOST_NOT_ALLOWED',
    );
    expect(checkDecibelGatewayRequestV1({ ...base, origin: 'http://bot.example.com' })?.error).toBe(
      'ORIGIN_NOT_ALLOWED',
    );
    expect(checkDecibelGatewayRequestV1({ ...base, contentType: 'text/plain' })?.error).toBe(
      'CONTENT_TYPE_NOT_JSON',
    );
    expect(
      checkDecibelGatewayRequestV1({ ...base, method: 'GET', contentType: undefined }),
    ).toBeNull();
  });

  it('calls the runtime as a same-origin local client without the gateway cookie', () => {
    expect(
      buildDecibelRuntimeHeadersV1(
        {
          host: 'bot.example.com',
          origin: 'https://bot.example.com',
          cookie: 'decibel_session=secret',
          'content-type': 'application/json',
          connection: 'keep-alive',
        },
        4181,
      ),
    ).toEqual({
      host: '127.0.0.1:4181',
      origin: 'http://127.0.0.1:4181',
      'content-type': 'application/json',
    });
  });
});

describe('Gateway routing', () => {
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  });
  const listen = async (server: Server) => {
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return (server.address() as AddressInfo).port;
  };
  const fakeRuntime = (name: string) =>
    createServer((request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          runtime: name,
          path: request.url,
          host: request.headers.host,
          cookie: request.headers.cookie ?? null,
        }),
      );
    });

  it('signs owners in and sends each one only to its own runtime', async () => {
    const A = makeWallet();
    const B = makeWallet();
    const Outsider = makeWallet();
    const portA = await listen(fakeRuntime('A'));
    const portB = await listen(fakeRuntime('B'));
    const ownerPorts = new Map([
      [A.address, portA],
      [B.address, portB],
    ]);
    let gatewayPort = 0;
    const Gateway = createServer((request, response) => {
      createDecibelWalletGatewayV1({
        auth: Auth,
        ownerPorts,
        staticPort: portA,
        publicHost: `127.0.0.1:${gatewayPort}`,
        publicScheme: 'http',
      }).emit('request', request, response);
    });
    const Auth = new decibel_dashboard_auth_v1({
      isServedOwner: (address) => ownerPorts.has(address),
      isWhitelisted: () => true,
      readAuthKey: (address) => Promise.resolve(address),
      sessionsPath: join(tmp(), 'sessions.json'),
    });
    gatewayPort = await listen(Gateway);
    const call = (method: string, path: string, body?: unknown, cookie?: string) =>
      new Promise<{ status: number; body: Record<string, unknown>; setCookie?: string }>(
        (resolve, reject) => {
          const Request = httpRequest(
            {
              host: '127.0.0.1',
              port: gatewayPort,
              method,
              path,
              headers: {
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                ...(cookie === undefined ? {} : { Cookie: cookie }),
              },
            },
            (response) => {
              let text = '';
              response.on('data', (chunk: Buffer) => (text += chunk.toString()));
              response.on('end', () =>
                resolve({
                  status: response.statusCode ?? 0,
                  body: JSON.parse(text) as Record<string, unknown>,
                  ...(response.headers['set-cookie']
                    ? { setCookie: response.headers['set-cookie'][0]!.split(';')[0]! }
                    : {}),
                }),
              );
            },
          );
          Request.on('error', reject);
          Request.end(body === undefined ? undefined : JSON.stringify(body));
        },
      );
    const signIn = async (wallet: ReturnType<typeof makeWallet>) => {
      const challenge = (await call('POST', '/api/auth/challenge', { address: wallet.address }))
        .body as {
        message: string;
        nonce: string;
      };
      const fullMessage = `APTOS\nmessage: ${challenge.message}\nnonce: ${challenge.nonce}`;
      return call('POST', '/api/auth/verify', {
        address: wallet.address,
        publicKey: wallet.publicKeyHex,
        signature: wallet.sign(fullMessage),
        fullMessage,
      });
    };

    expect((await call('GET', '/api/telemetry')).status).toBe(401);
    const cookieA = (await signIn(A)).setCookie!;
    const cookieB = (await signIn(B)).setCookie!;
    expect((await signIn(Outsider)).body).toEqual({ error: 'AUTH_NOT_RUNTIME_OWNER' });

    const telemetryA = await call('GET', '/api/telemetry', undefined, cookieA);
    expect(telemetryA.body).toEqual({
      runtime: 'A',
      path: '/api/telemetry',
      host: `127.0.0.1:${portA}`,
      cookie: null,
    });
    expect((await call('GET', '/api/session', undefined, cookieB)).body.runtime).toBe('B');
    // Static dashboard files need no session.
    expect((await call('GET', '/index.html')).body.runtime).toBe('A');
    expect((await call('GET', '/api/auth/session', undefined, cookieB)).body).toEqual({
      mode: 'wallet',
      authenticated: true,
      address: B.address,
    });
  });
});
