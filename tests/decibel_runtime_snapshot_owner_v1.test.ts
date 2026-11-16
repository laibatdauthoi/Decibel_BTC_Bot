import { describe, expect, it } from 'vitest';
import {
  carryDecibelCycleDerivedFieldsV1,
  publishDecibelRuntimeSnapshotV1,
} from '../src/decibel_runtime_snapshot_owner_v1.js';
import type { decibel_production_live_snapshot_v1 } from '../src/decibel_production_live_types_v1.js';

// Only the fields the selection reads.
const snapshot = (now: number, extra: Record<string, unknown> = {}) =>
  ({ input: { now }, ...extra }) as unknown as decibel_production_live_snapshot_v1;

describe('runtime snapshot owner v1', () => {
  it('keeps the newer rebuilt snapshot but takes the cycle fields of an older cycle snapshot', () => {
    // The runner rebuilt its snapshot at 2,000 with blockers from an old cycle.
    const current = snapshot(2_000, {
      entryCandleBlockers: { BUY: 'ENTRY_REQUIRES_NEW_LOW', SELL: null },
      priceRangeBps: 30,
    });
    // The orchestrator's cycle snapshot observed at 1,500 has the current candle verdict.
    const cycle = snapshot(1_500, {
      entryCandleBlockers: { BUY: null, SELL: 'ENTRY_REQUIRES_NEW_HIGH' },
      priceRangeBps: 12,
      executionGasBlocker: null,
    });
    const published = publishDecibelRuntimeSnapshotV1(current, cycle, 1, 1)!;
    expect(published.input.now).toBe(2_000);
    expect(published.entryCandleBlockers).toEqual({ BUY: null, SELL: 'ENTRY_REQUIRES_NEW_HIGH' });
    expect(published.priceRangeBps).toBe(12);
    expect(published.executionGasBlocker).toBeNull();
  });

  it('takes a newer cycle snapshot whole and ignores a foreign owner revision', () => {
    const current = snapshot(1_000, { priceRangeBps: 30 });
    const newer = snapshot(2_000, { priceRangeBps: 12 });
    expect(publishDecibelRuntimeSnapshotV1(current, newer, 1, 1)).toBe(newer);
    expect(
      publishDecibelRuntimeSnapshotV1(current, snapshot(500, { priceRangeBps: 5 }), 0, 1),
    ).toBe(current);
  });

  it('leaves fields a venue read does not carry untouched', () => {
    const read = snapshot(3_000);
    const carried = carryDecibelCycleDerivedFieldsV1(read, snapshot(2_000, { priceRangeBps: 9 }));
    expect(carried.priceRangeBps).toBe(9);
    expect(carried.input.now).toBe(3_000);
    expect(carryDecibelCycleDerivedFieldsV1(read, read)).toBe(read);
  });
});
