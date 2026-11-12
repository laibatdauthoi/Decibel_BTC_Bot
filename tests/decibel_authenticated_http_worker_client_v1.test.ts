import { createServer } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDecibelAuthenticatedHttpWorkerClientV1 } from '../src/decibel_authenticated_http_worker_client_v1.js';

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

describe('authenticated HTTP worker client', () => {
  it('removes the caller abort listener after successful OPEN_ORDERS reads', async () => {
    const Server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ items: [] }));
    });
    await new Promise<void>((resolve) => Server.listen(0, '127.0.0.1', resolve));
    const address = Server.address();
    if (!address || typeof address === 'string') throw Error('TEST_PORT');
    const Client = createDecibelAuthenticatedHttpWorkerClientV1({
      baseUrl: `http://127.0.0.1:${address.port}`,
      timeoutMs: 1000,
    });
    closers.push(async () => {
      await Client.close();
      await new Promise<void>((resolve) => Server.close(() => resolve()));
    });
    const Controller = new AbortController();
    const remove = vi.spyOn(Controller.signal, 'removeEventListener');
    await expect(Client.readOpenOrders('account', Controller.signal)).resolves.toEqual([]);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    Controller.abort();
    expect(Client.getTransportDiagnostics()).toMatchObject({ successes: 1, failures: 0 });
  });
  it('routes scoped FLAT settings and product-specific fees through the production worker', async () => {
    const paths: string[] = [];
    const Server = createServer((request, response) => {
      paths.push(request.url ?? '');
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify(
          request.url?.includes('user_fee_rates')
            ? {
                account: '0x123',
                perp: {
                  user_maker_rate: 0.00015,
                  user_taker_rate: 0.00045,
                  fee_tier: 0,
                  active_referral_discount: 0,
                },
              }
            : [
                {
                  market: '0x456',
                  user: '0x123',
                  size: 0,
                  user_leverage: 40,
                  is_isolated: false,
                  tp_order_id: null,
                  sl_order_id: null,
                },
              ],
        ),
      );
    });
    await new Promise<void>((resolve) => Server.listen(0, '127.0.0.1', resolve));
    const address = Server.address();
    if (!address || typeof address === 'string') throw Error('TEST_PORT');
    const Client = createDecibelAuthenticatedHttpWorkerClientV1({
      baseUrl: `http://127.0.0.1:${address.port}`,
      timeoutMs: 1000,
    });
    closers.push(async () => {
      await Client.close();
      await new Promise<void>((resolve) => Server.close(() => resolve()));
    });
    expect(await Client.readSelectedLeverage('0x123', '0x456')).toMatchObject({
      userLeverage: 40,
      positionBase: 0,
    });
    expect(await Client.readFeeRates('0x123')).toMatchObject({ takerFeeBps: 4.5, tier: 0 });
    expect(paths[0]).toContain('include_deleted=true');
    expect(paths[0]).toContain('market_address=0x456');
    expect(paths[1]).toContain('user_fee_rates?account=0x123');
  });
  it('uses the isolated worker transport and recovers after a bounded request timeout', async () => {
    let accountRequests = 0;
    const Server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.url?.startsWith('/api/v1/account_overviews') === true) {
        accountRequests += 1;
        if (accountRequests === 1) {
          setTimeout(() => {
            response.end(
              JSON.stringify({
                perp_equity_balance: 1,
                total_margin: 0,
                cross_available_to_trade: 1,
              }),
            );
          }, 500);
          return;
        }
        response.end(
          JSON.stringify({
            perp_equity_balance: 1,
            total_margin: 0,
            cross_available_to_trade: 1,
          }),
        );
        return;
      }
      response.end(JSON.stringify([]));
    });
    await new Promise<void>((resolve) => Server.listen(0, '127.0.0.1', resolve));
    const address = Server.address();
    if (address === null || typeof address === 'string')
      throw new Error('TEST_SERVER_PORT_MISSING');
    const Client = createDecibelAuthenticatedHttpWorkerClientV1({
      baseUrl: `http://127.0.0.1:${address.port}`,
      timeoutMs: 100,
    });
    closers.push(async () => {
      await Client.close();
      await new Promise<void>((resolve, reject) =>
        Server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    });

    expect(Client.getTransportDiagnostics().transportId).toBe(
      'WORKER:DECIBEL_AUTHENTICATED_HTTP_UNDICI_ISOLATED_AGENT_V1',
    );
    await expect(Client.readAccountOverview('account')).rejects.toThrow(
      'AUTHENTICATED_HTTP_WORKER_REQUEST_TIMEOUT',
    );
    await expect(Client.readAccountOverview('account')).resolves.toMatchObject({
      perp_equity_balance: 1,
      total_margin: 0,
      cross_available_to_trade: 1,
    });
    expect(Client.getTransportDiagnostics()).toMatchObject({
      attempts: 2,
      successes: 1,
      failures: 1,
      lastFailure: null,
      lastStage: 'ACCOUNT_OVERVIEW',
    });
    expect(Client.getTransportDiagnostics().lastHttpLatencyMs).toEqual(expect.any(Number));
    expect(Client.getTransportDiagnostics().lastRoundTripLatencyMs).toEqual(expect.any(Number));
  });

  it('aborts only the timed-out request without poisoning concurrent authenticated reads', async () => {
    const Server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.url?.startsWith('/api/v1/account_overviews') === true) {
        setTimeout(() => response.end('{}'), 500);
        return;
      }
      response.end(JSON.stringify([]));
    });
    await new Promise<void>((resolve) => Server.listen(0, '127.0.0.1', resolve));
    const address = Server.address();
    if (address === null || typeof address === 'string')
      throw new Error('TEST_SERVER_PORT_MISSING');
    const Client = createDecibelAuthenticatedHttpWorkerClientV1({
      baseUrl: `http://127.0.0.1:${address.port}`,
      timeoutMs: 100,
    });
    closers.push(async () => {
      await Client.close();
      await new Promise<void>((resolve, reject) =>
        Server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    });

    const Account = Client.readAccountOverview('account');
    const rejection = expect(Account).rejects.toThrow('AUTHENTICATED_HTTP_WORKER_REQUEST_TIMEOUT');
    const Positions = Client.readPositions('account');
    await expect(Positions).resolves.toEqual([]);
    await rejection;
    expect(Client.getTransportDiagnostics()).toMatchObject({
      attempts: 2,
      successes: 1,
      failures: 1,
    });
  });

  it('recovers after a transient HTTP response failure without reusing the failed request', async () => {
    let accountRequests = 0;
    const Server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.url?.startsWith('/api/v1/account_overviews') === true) {
        accountRequests += 1;
        if (accountRequests === 1) {
          response.statusCode = 429;
          response.setHeader('Retry-After', '2');
          response.end(JSON.stringify({ status: 'failed', message: 'temporary' }));
          return;
        }
        response.end(
          JSON.stringify({
            perp_equity_balance: 1,
            total_margin: 0,
            cross_available_to_trade: 1,
          }),
        );
        return;
      }
      response.end(JSON.stringify([]));
    });
    await new Promise<void>((resolve) => Server.listen(0, '127.0.0.1', resolve));
    const address = Server.address();
    if (address === null || typeof address === 'string')
      throw new Error('TEST_SERVER_PORT_MISSING');
    const Client = createDecibelAuthenticatedHttpWorkerClientV1({
      baseUrl: `http://127.0.0.1:${address.port}`,
      timeoutMs: 1_000,
    });
    closers.push(async () => {
      await Client.close();
      await new Promise<void>((resolve, reject) =>
        Server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    });

    await expect(Client.readAccountOverview('account')).rejects.toMatchObject({
      status: 429,
      retryAfter: '2',
    });
    await expect(Client.readAccountOverview('account')).resolves.toMatchObject({
      cross_available_to_trade: 1,
    });
    expect(accountRequests).toBe(2);
  });
});
