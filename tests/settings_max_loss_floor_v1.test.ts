import { describe, expect, it } from 'vitest';
import { DECIBEL_CAPACITY_POLICY_V1 } from '../src/decibel_risk_capacity_v1.js';
import { DECIBEL_CAPACITY_POLICY_V1 as SharedPolicy } from '../src/decibel_capacity_policy_v1.js';
import {
  calculateSettingsMinimumMaxLossForDCAUsdV1,
  calculateSettingsMinimumMaxLossUsdV1,
  formatSettingsMinimumMaxLossUsdV1,
  isSettingsMaxLossBelowDCAFloorV1,
  isSettingsMaxLossBelowEntryFloorV1,
} from '../src/settings_max_loss_floor_v1.js';

// Runtime admission with policy floors at session start: capacity = 0.95 * MaxLoss / 0.0153.
const capacityAtFloors = (maxLossUsd: number) => (maxLossUsd * 0.95) / (153 / 10_000);

describe('Settings Max Loss entry floor', () => {
  it('shares one policy object with the runtime risk capacity module', () => {
    expect(SharedPolicy).toBe(DECIBEL_CAPACITY_POLICY_V1);
  });

  it('matches the documented $0.20 / $14.40 RISK_BLOCKED fixture', () => {
    expect(capacityAtFloors(0.2)).toBeCloseTo(12.41830065, 6);
    expect(isSettingsMaxLossBelowEntryFloorV1('0.2', 14.4)).toBe(true);
  });

  it.each([
    [10, 0.16105263],
    [14.4, 0.23191579],
    [15, 0.24157895],
  ])('requires the minimum for a $%s entry and admits it exactly', (entry, minimum) => {
    const floor = calculateSettingsMinimumMaxLossUsdV1(entry)!;
    expect(floor).toBeCloseTo(minimum, 7);
    expect(capacityAtFloors(floor)).toBeCloseTo(entry, 9);
    expect(isSettingsMaxLossBelowEntryFloorV1(String(floor), entry)).toBe(false);
    expect(isSettingsMaxLossBelowEntryFloorV1(String(floor * 0.99), entry)).toBe(true);
  });

  it('rounds the displayed minimum up so entering it clears the warning', () => {
    expect(formatSettingsMinimumMaxLossUsdV1(0.16105263)).toBe('$0.17');
    expect(formatSettingsMinimumMaxLossUsdV1(0.24157895)).toBe('$0.25');
    expect(formatSettingsMinimumMaxLossUsdV1(0.3)).toBe('$0.30');
    expect(isSettingsMaxLossBelowEntryFloorV1('0.17', 10)).toBe(false);
    expect(isSettingsMaxLossBelowEntryFloorV1('0.25', 15)).toBe(false);
  });

  it('stays silent for unknown entry size and invalid drafts', () => {
    expect(calculateSettingsMinimumMaxLossUsdV1(null)).toBeNull();
    expect(calculateSettingsMinimumMaxLossUsdV1(0)).toBeNull();
    expect(calculateSettingsMinimumMaxLossUsdV1(Number.NaN)).toBeNull();
    for (const draft of ['', ' ', '0', '-1', 'abc'])
      expect(isSettingsMaxLossBelowEntryFloorV1(draft, 15)).toBe(false);
    expect(isSettingsMaxLossBelowEntryFloorV1('0.01', null)).toBe(false);
  });

  it('requires enough Max Loss for the smallest DCA addition at the trigger', () => {
    // $30 entry: capacity for 4/3 of it at 153 bps, plus 25 bps loss and a 10 bps fee.
    const floor = calculateSettingsMinimumMaxLossForDCAUsdV1(30)!;
    expect(floor).toBeCloseTo((30 * ((4 / 3) * 153 + 35)) / 10_000 / 0.95, 9);
    expect(floor).toBeGreaterThan(calculateSettingsMinimumMaxLossUsdV1(30)!);
    // At the floor, capacity after the unrealized loss covers the entry plus a third.
    const lossRemaining = floor * 0.95 - (30 * 35) / 10_000;
    expect(lossRemaining / (153 / 10_000)).toBeCloseTo(40, 9);
    expect(isSettingsMaxLossBelowDCAFloorV1('0.5', 30)).toBe(true);
    expect(
      isSettingsMaxLossBelowDCAFloorV1(formatSettingsMinimumMaxLossUsdV1(floor).slice(1), 30),
    ).toBe(false);
    expect(isSettingsMaxLossBelowDCAFloorV1('', 30)).toBe(false);
    expect(isSettingsMaxLossBelowDCAFloorV1('0.5', null)).toBe(false);
  });
});
