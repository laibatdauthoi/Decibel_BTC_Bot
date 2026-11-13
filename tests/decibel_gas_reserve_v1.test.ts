import { describe, expect, it } from 'vitest';
import {
  DECIBEL_GAS_ENTRY_RESERVE_APT_V1,
  getDecibelGasEntryBlockerV1,
} from '../src/decibel_gas_reserve_v1.js';
import { DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1 } from '../src/decibel_external_production_executor_v1.js';

describe('gas reserve for protection', () => {
  it('keeps room for five submissions at the minimum gas price', () => {
    expect(DECIBEL_GAS_ENTRY_RESERVE_APT_V1).toBeCloseTo(
      (5 * DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1 * 100) / 1e8,
      12,
    );
  });

  it('blocks entries only for a known balance below the reserve', () => {
    expect(getDecibelGasEntryBlockerV1(0.05)).toBe('ENTRY_GAS_BALANCE_LOW');
    expect(getDecibelGasEntryBlockerV1(0.1995)).toBeNull();
    expect(getDecibelGasEntryBlockerV1(null)).toBeNull();
    expect(getDecibelGasEntryBlockerV1(Number.NaN)).toBeNull();
  });
});
