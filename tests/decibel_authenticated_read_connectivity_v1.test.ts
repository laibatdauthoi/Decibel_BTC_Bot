import { describe, expect, it, vi } from 'vitest';

import {
  resolveDecibelCanarySideV1,
  runDecibelAuthenticatedReadConnectivityProbeV1,
  sanitizeDecibelReadErrorV1,
  shouldRunDecibelCanaryDryRunPhaseBV1,
} from '../src/decibel_authenticated_read_connectivity_v1.js';

const endpoint = {
  network: 'mainnet',
  tradingHttpUrl: 'https://read.example',
  tradingWsUrl: 'wss://read.example',
  fullnodeUrl: 'https://node.example',
};
const market = '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861';

function dependencies(
  overrides: Partial<
    Parameters<typeof runDecibelAuthenticatedReadConnectivityProbeV1>[0]['dependencies']
  > = {},
) {
  return {
    getMarkets: vi.fn().mockResolvedValue([{ market_addr: market, tick_size: 1 }]),
    getCurrentBook: vi.fn().mockResolvedValue({ best_bid: 100, best_ask: 101 }),
    getPositions: vi.fn().mockResolvedValue([]),
    getOpenOrders: vi.fn().mockResolvedValue([]),
    getActiveTwaps: vi.fn().mockResolvedValue([]),
    getBulkOrders: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function probe(
  overrides: Partial<Parameters<typeof runDecibelAuthenticatedReadConnectivityProbeV1>[0]> = {},
) {
  return runDecibelAuthenticatedReadConnectivityProbeV1({
    timestamp: 1,
    nodeApiKeyPresent: true,
    network: 'mainnet',
    subaccount: `0x${'1'.repeat(64)}`,
    marketAddress: market,
    canarySide: resolveDecibelCanarySideV1({ cliSide: 'BUY', environmentSide: undefined }),
    endpoints: endpoint,
    dependencies: dependencies(),
    ...overrides,
  });
}

describe('Decibel authenticated read connectivity V1', () => {
  it('blocks immediately without a Node API key and performs no reads', async () => {
    const deps = dependencies();
    const result = await probe({ nodeApiKeyPresent: false, dependencies: deps });
    expect(result.market.classification).toBe('MARKET_READ_BLOCKED_NODE_API_KEY');
    expect(result.account.classification).toBe('ACCOUNT_READ_BLOCKED_NODE_API_KEY');
    expect(deps.getMarkets).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('Bearer test');
  });

  it.each([
    [401, 'HTTP_401_UNAUTHORIZED'],
    [403, 'HTTP_403_FORBIDDEN'],
  ])('preserves HTTP %i safely', (status, code) => {
    const error = Object.assign(new Error('secret response'), { status });
    const result = sanitizeDecibelReadErrorV1({
      error,
      operation: 'MARKETS',
      sdkMethod: 'markets.getAll',
      endpointClass: 'NODE_TOKEN_AUTHENTICATED_READ',
    });
    expect(result).toMatchObject({ httpStatus: status, code, sanitizedMessage: code });
    expect(JSON.stringify(result)).not.toContain('secret response');
  });

  it('preserves timeout and rejects market identity mismatch', async () => {
    expect(
      sanitizeDecibelReadErrorV1({
        error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
        operation: 'MARKETS',
        sdkMethod: 'markets.getAll',
        endpointClass: 'NODE_TOKEN_AUTHENTICATED_READ',
      }).code,
    ).toBe('NETWORK_TIMEOUT');
    const result = await probe({
      dependencies: dependencies({
        getMarkets: vi.fn().mockResolvedValue([{ market_addr: 'wrong' }]),
      }),
    });
    expect(result.market.classification).toBe('MARKET_READ_BLOCKED_MARKET_IDENTITY');
  });

  it('distinguishes an empty successful position read from failure', async () => {
    const clear = await probe();
    expect(clear.account).toMatchObject({
      classification: 'ACCOUNT_READ_READY',
      positionsReadSuccessful: true,
      returnedOpenPositionCount: 0,
    });
    const failed = await probe({
      dependencies: dependencies({
        getPositions: vi.fn().mockRejectedValue(Object.assign(new Error(), { status: 401 })),
      }),
    });
    expect(failed.account).toMatchObject({
      classification: 'ACCOUNT_READ_BLOCKED_NODE_API_KEY',
      positionsReadSuccessful: false,
      returnedOpenPositionCount: null,
    });
  });

  it('uses CLI side precedence, accepts BUY/SELL, and never defaults', () => {
    expect(resolveDecibelCanarySideV1({ cliSide: 'SELL', environmentSide: 'BUY' })).toMatchObject({
      side: 'SELL',
      source: 'CLI',
      status: 'PRESENT',
    });
    expect(resolveDecibelCanarySideV1({ cliSide: undefined, environmentSide: 'BUY' }).side).toBe(
      'BUY',
    );
    expect(
      resolveDecibelCanarySideV1({ cliSide: undefined, environmentSide: undefined }),
    ).toMatchObject({ side: null, status: 'MISSING' });
    expect(
      resolveDecibelCanarySideV1({ cliSide: 'invalid', environmentSide: undefined }),
    ).toMatchObject({ side: null, status: 'INVALID' });
  });

  it('permits Phase B exactly when both reads and explicit side pass', async () => {
    const ready = await probe();
    expect(shouldRunDecibelCanaryDryRunPhaseBV1(ready)).toBe(true);
    expect(ready).toMatchObject({
      signedTransactions: 0,
      submittedTransactions: 0,
      placedOrders: 0,
      cancelledOrders: 0,
      venueMutations: 0,
      liveExecutionEnabled: false,
    });
    expect(
      shouldRunDecibelCanaryDryRunPhaseBV1(
        await probe({
          canarySide: resolveDecibelCanarySideV1({
            cliSide: undefined,
            environmentSide: undefined,
          }),
        }),
      ),
    ).toBe(false);
    expect(
      shouldRunDecibelCanaryDryRunPhaseBV1(
        await probe({
          dependencies: dependencies({
            getOpenOrders: vi.fn().mockRejectedValue(new Error('timeout')),
          }),
        }),
      ),
    ).toBe(false);
  });
});
