import { describe, expect, it } from 'vitest';

import {
  DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  assertDecibelDeterministicCanarySideIdentityV1,
  createDecibelAutoMinimalLiveCanaryConfigurationV1,
  deriveDecibelDeterministicCanarySideV1,
} from '../src/decibel_minimal_live_canary_v1.js';

const account = '0x7c9d963218ad7ff98670a3d670aa93a1593b883df56b3d1f7b1d9d1f075c9b8b';

describe('Decibel Deterministic Canary Side V1', () => {
  it('is stable across restart, address spelling, BBO, trades, and time', () => {
    const first = deriveDecibelDeterministicCanarySideV1({
      subaccount: account,
      market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    });
    const restarted = deriveDecibelDeterministicCanarySideV1({
      subaccount: account.toUpperCase().replace('0X', '0x'),
      market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    });
    expect(restarted).toEqual(first);
    expect(Object.keys(first)).not.toEqual(
      expect.arrayContaining(['bestBid', 'bestAsk', 'trades', 'timestamp', 'random']),
    );
    expect(first.side).toBe(first.sideBit === 0 ? 'BUY' : 'SELL');
    expect(first.sideSeedHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('freezes digest byte 31 bit 0 mapping for both possible bits', () => {
    const observed = new Map<number, 'BUY' | 'SELL'>();
    for (let suffix = 1; suffix < 100 && observed.size < 2; suffix += 1) {
      const result = deriveDecibelDeterministicCanarySideV1({
        subaccount: `0x${suffix.toString(16)}`,
        market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      });
      observed.set(result.sideBit, result.side);
    }
    expect(observed.get(0)).toBe('BUY');
    expect(observed.get(1)).toBe('SELL');
  });

  it('includes the derived side identity in the immutable config hash', () => {
    const configuration = createDecibelAutoMinimalLiveCanaryConfigurationV1({
      canaryId: 'canary',
      executionSessionId: 'session',
      account,
      subaccount: account,
      network: 'mainnet',
      market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      observationTimeoutMs: 60_000,
      executionRecoveryTimeoutMs: 120_000,
      strategyConfigId: 'strategy',
    });
    expect(configuration).toMatchObject({
      sideSelectionMode: 'AUTO_DETERMINISTIC_CANARY_V1',
      sideSelectionVersion: 1,
      manualSideOverrideAllowed: false,
      liveExecutionEnabled: false,
    });
    expect(() =>
      assertDecibelDeterministicCanarySideIdentityV1({
        ...configuration,
        side: configuration.side === 'BUY' ? 'SELL' : 'BUY',
      }),
    ).toThrow('CANARY_SIDE_IDENTITY_CONFLICT');
  });
});
