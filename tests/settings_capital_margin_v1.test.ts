import { describe, expect, it } from 'vitest';
import { validateSettingsCapitalMarginV1 } from '../src/settings_capital_margin_v1.js';
import { handleDecibelOperatorSettingsRequestV1 } from '../src/run_decibel_production_web_v1.js';
import { decibel_operator_settings_store_v1 } from '../src/decibel_operator_settings_v1.js';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const values = {
  capitalToUseUsd: 8,
  maxLossUsd: 1,
  targetMakerVolumeUsd: -1,
  orderNotionalUsd: 10,
  maxPositionUsd: 100,
};
describe('Settings capital margin save gate', () => {
  it.each([
    ['8', 'exceeds'],
    ['6', 'exceeds'],
    ['5', 'valid'],
    ['5.44', 'valid'],
    ['5.440000000000000001', 'exceeds'],
    ['5.4400', 'valid'],
    ['.5', 'valid'],
    ['5.44e0', 'valid'],
    ['5.44e-1', 'valid'],
    ['0', 'invalid'],
    ['', 'invalid'],
  ])('compares %s exactly', (capital, expected) => {
    expect(
      validateSettingsCapitalMarginV1(capital, { availableMarginUsd: 5.44, status: 'fresh' }),
    ).toBe(expected);
  });
  it('revokes validity when margin falls or becomes stale/unknown and restores it', () => {
    for (const status of ['stale', 'unknown'] as const)
      expect(validateSettingsCapitalMarginV1('5', { availableMarginUsd: 5.44, status })).toBe(
        status,
      );
    expect(validateSettingsCapitalMarginV1('5', { availableMarginUsd: 4, status: 'fresh' })).toBe(
      'exceeds',
    );
    expect(
      validateSettingsCapitalMarginV1('5', { availableMarginUsd: null, status: 'fresh' }),
    ).toBe('unknown');
    expect(
      validateSettingsCapitalMarginV1('5', { availableMarginUsd: 5.44, status: 'fresh' }),
    ).toBe('valid');
  });
  it('blocks direct saves before any write, preserves other validation, then permits valid saves', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'capital-save-')), 'settings.json');
    const Store = new decibel_operator_settings_store_v1(path, values);
    const save = (capital: number, status: 'fresh' | 'stale' | 'unknown', maxLoss = 1) =>
      handleDecibelOperatorSettingsRequestV1(
        'POST',
        '/api/operator-settings',
        {
          expectedRevision: 0,
          values: {
            ...values,
            capitalToUseUsd: capital,
            maxLossUsd: maxLoss,
            targetMakerVolumeUsd: 100,
          },
        },
        Store,
        { availableMarginUsd: 5.44, status },
      );
    expect(save(8, 'fresh')?.status).toBe(400);
    expect(save(5, 'stale')?.status).toBe(400);
    expect(save(5, 'unknown')?.status).toBe(400);
    expect(save(5, 'fresh', 6)?.status).toBe(400);
    expect(
      handleDecibelOperatorSettingsRequestV1(
        'POST',
        '/api/operator-settings',
        { expectedRevision: 0, values },
        Store,
      )?.status,
    ).toBe(400);
    expect(existsSync(path)).toBe(false);
    expect(existsSync(`${path}.audit.jsonl`)).toBe(false);
    expect(save(5.44, 'fresh')?.status).toBe(200);
    expect(Store.read().values.capitalToUseUsd).toBe(5.44);
  });
});
