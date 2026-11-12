import { describe, expect, it } from 'vitest';

import {
  scaleDecimalToChainUnitsV1,
  floorDecibelQuantityToLotV1,
  getDecibelQuantityUnitsV1,
  subtractDecibelQuantitiesV1,
} from '../src/decibel_chain_units_v1.js';

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

it('preserves 73 lots through exact position, pending fills, residual and SDK units', () => {
  expect(floorDecibelQuantityToLotV1(0.00073, 0.00001)).toBe(0.00073);
  expect(scaleDecimalToChainUnitsV1(0.00073, 8)).toBe(73000n);
  expect(getDecibelQuantityUnitsV1(0.00072)).toBe(72000n);
  expect(subtractDecibelQuantitiesV1(0.00073, [0.00072])).toBe(0.00001);
  expect(subtractDecibelQuantitiesV1(0.00073, [0.0003, 0.00043])).toBe(0);
  expect(floorDecibelQuantityToLotV1(0.000729999, 0.00001)).toBe(0.00072);
  expect(() => getDecibelQuantityUnitsV1(0.000730001)).toThrow(
    'DECIBEL_QUANTITY_NOT_CHAIN_ALIGNED',
  );
});
