import { createServer, request as httpRequest, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDecibelWebRequestV1 } from '../src/decibel_web_request_guard_v1.js';
import { decibel_dashboard_auth_v1 } from '../src/decibel_dashboard_auth_v1.js';
import {
  handleDecibelProductionWebRequestV1,
  type decibel_production_web_route_context_v1,
} from '../src/decibel_production_web_routes_v1.js';

const port = 4173;
const base = {
  method: 'POST',
  host: '127.0.0.1:4173',
  origin: 'http://127.0.0.1:4173',
  contentType: 'application/json',
  port,
};

describe('Dashboard request guard', () => {
  it('accepts the dashboard itself', () => {
    expect(checkDecibelWebRequestV1(base)).toBeNull();
    expect(
      checkDecibelWebRequestV1({
        ...base,
        host: 'localhost:4173',
        origin: 'http://localhost:4173',
      }),
    ).toBeNull();
    expect(
      checkDecibelWebRequestV1({ ...base, contentType: 'application/json; charset=utf-8' }),
    ).toBeNull();
    // Local tools without a browser send no Origin.
    expect(checkDecibelWebRequestV1({ ...base, origin: undefined })).toBeNull();
    expect(checkDecibelWebRequestV1({ ...base, method: 'GET', contentType: undefined })).toBeNull();
  });

  it('rejects DNS rebinding hosts, reads included', () => {
    for (const host of ['evil.example:4173', '127.0.0.1:9999', '127.0.0.1', undefined])
      for (const method of ['GET', 'POST'])
        expect(checkDecibelWebRequestV1({ ...base, method, host })).toEqual({
          status: 403,
          error: 'HOST_NOT_ALLOWED',
        });
  });

  it('rejects state changes from another origin', () => {
    for (const origin of [
      'https://evil.example',
      'null',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:4173.evil.example',
    ])
      expect(checkDecibelWebRequestV1({ ...base, origin })).toEqual({
        status: 403,
        error: 'ORIGIN_NOT_ALLOWED',
      });
  });

  it('rejects state changes without a JSON content type (no CORS preflight)', () => {
    for (const contentType of [
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      undefined,
    ])
      expect(checkDecibelWebRequestV1({ ...base, contentType })).toEqual({
        status: 415,
        error: 'CONTENT_TYPE_NOT_JSON',
      });
  });
});

describe('Dashboard routes apply the guard before any handler', () => {
  let Server: Server | null = null;
  afterEach(async () => {
    await new Promise<void>((resolve) => (Server ? Server.close(() => resolve()) : resolve()));
    Server = null;
  });

  it('refuses a cross-site text/plain session start without touching the session controller', async () => {
    let touched = false;
    Server = createServer((request, response) => {
      const context = new Proxy(
        { web: { DECIBEL_PRODUCTION_WEB_HOST: '127.0.0.1', DECIBEL_PRODUCTION_WEB_PORT: 0 } },
        {
          get: (target, key) => {
            if (key === 'web') {
              const address = Server!.address() as AddressInfo;
              return { ...target.web, DECIBEL_PRODUCTION_WEB_PORT: address.port };
            }
            touched = true;
            return undefined;
          },
        },
      ) as unknown as decibel_production_web_route_context_v1;
      handleDecibelProductionWebRequestV1(context, request, response);
    });
    await new Promise<void>((resolve) => Server!.listen(0, '127.0.0.1', resolve));
    const { port: actual } = Server.address() as AddressInfo;
    const send = (headers: Record<string, string>) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const Request = httpRequest(
          { host: '127.0.0.1', port: actual, path: '/api/session/start', method: 'POST', headers },
          (response) => {
            let body = '';
            response.on('data', (chunk: Buffer) => (body += chunk.toString()));
            response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
          },
        );
        Request.on('error', reject);
        Request.end('{"expectedSettingsRevision":1}');
      });
    expect(await send({ Origin: 'https://evil.example', 'Content-Type': 'text/plain' })).toEqual({
      status: 403,
      body: '{"error":"ORIGIN_NOT_ALLOWED"}',
    });
    expect(
      await send({ Host: `evil.example:${actual}`, 'Content-Type': 'application/json' }),
    ).toEqual({
      status: 403,
      body: '{"error":"HOST_NOT_ALLOWED"}',
    });
    expect(await send({ 'Content-Type': 'text/plain' })).toEqual({
      status: 415,
      body: '{"error":"CONTENT_TYPE_NOT_JSON"}',
    });
    expect(touched).toBe(false);
  });

  it('answers 401 to every API route without a wallet session when sign-in is on', async () => {
    const touched: string[] = [];
    const Auth = new decibel_dashboard_auth_v1({
      isServedOwner: (address) => address === `0x${'ab'.repeat(32)}`,
      isWhitelisted: () => true,
      readAuthKey: () => Promise.resolve(''),
      sessionsPath: join(mkdtempSync(join(tmpdir(), 'route-auth-')), 'sessions.json'),
    });
    Server = createServer((request, response) => {
      const address = Server!.address() as AddressInfo;
      const known: Record<string, unknown> = {
        web: {
          DECIBEL_PRODUCTION_WEB_HOST: '127.0.0.1',
          DECIBEL_PRODUCTION_WEB_PORT: address.port,
        },
        auth: Auth,
        secureCookie: false,
      };
      const context = new Proxy(known, {
        get: (target, key) => {
          if (typeof key === 'string' && key in target) return target[key];
          touched.push(String(key));
          return undefined;
        },
      }) as unknown as decibel_production_web_route_context_v1;
      handleDecibelProductionWebRequestV1(context, request, response);
    });
    await new Promise<void>((resolve) => Server!.listen(0, '127.0.0.1', resolve));
    const { port: actual } = Server.address() as AddressInfo;
    const get = (path: string) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        httpRequest({ host: '127.0.0.1', port: actual, path }, (response) => {
          let body = '';
          response.on('data', (chunk: Buffer) => (body += chunk.toString()));
          response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
        })
          .on('error', reject)
          .end();
      });
    for (const path of ['/api/telemetry', '/api/session', '/api/wallet', '/api/events'])
      expect(await get(path)).toEqual({ status: 401, body: '{"error":"AUTH_REQUIRED"}' });
    expect(await get('/api/auth/session')).toEqual({
      status: 200,
      body: '{"mode":"wallet","authenticated":false,"address":null}',
    });
    expect(touched).toEqual([]);
  });
});
