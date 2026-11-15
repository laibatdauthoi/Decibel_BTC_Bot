import { describe, expect, it, vi } from 'vitest';
import { wrapDecibelProductionLiveStateSourceV1 } from '../src/decibel_production_live_state_source_adapter_v1.js';
import type { DecibelProductionLiveStateSourceV1 } from '../src/decibel_production_live_orchestrator_v1.js';

const base = (): DecibelProductionLiveStateSourceV1 => ({
  readAuthenticatedSnapshot: vi.fn(),
  reconcileIntent: vi.fn(),
});

describe('production live state source adapter v1', () => {
  it('forwards the venue candle reader the candle rules depend on', async () => {
    const candles = [{ start: 60_000, open: 1, high: 2, low: 0.5, close: 1.5 }];
    const readExchangeCandles1m = vi.fn().mockResolvedValue(candles);
    const wrapped = wrapDecibelProductionLiveStateSourceV1(
      { ...base(), readExchangeCandles1m },
      () => undefined,
    );
    await expect(wrapped.readExchangeCandles1m!(0, 120_000)).resolves.toBe(candles);
    expect(readExchangeCandles1m).toHaveBeenCalledWith(0, 120_000);
  });

  it('leaves the reader absent when the source has none', () => {
    const wrapped = wrapDecibelProductionLiveStateSourceV1(base(), () => undefined);
    expect(Reflect.get(wrapped, 'readExchangeCandles1m')).toBeUndefined();
  });
});
