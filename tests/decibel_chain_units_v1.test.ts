import { describe, expect, it } from 'vitest';

import { scaleDecimalToChainUnitsV1 } from '../src/decibel_chain_units_v1.js';

describe('Decibel chain units V1', () => {
  it('scales BTC price and size without floating-point transaction arguments', () => {
    expect(scaleDecimalToChainUnitsV1(79_289.7, 6)).toBe(79_289_700_000n);
    expect(scaleDecimalToChainUnitsV1(0.00013, 8)).toBe(13_000n);
  });

  it.each([
    [Number.NaN, 6, 'DECIBEL_CHAIN_VALUE_INVALID'],
    [-1, 6, 'DECIBEL_CHAIN_VALUE_INVALID'],
    [1, -1, 'DECIBEL_CHAIN_DECIMALS_INVALID'],
    [1, 19, 'DECIBEL_CHAIN_DECIMALS_INVALID'],
  ])('rejects unsafe input %#', (value, decimals, blocker) => {
    expect(() => scaleDecimalToChainUnitsV1(value, decimals)).toThrow(blocker);
  });
});
