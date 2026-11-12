import { calculateDecibelRiskCapacityV1 } from '../src/decibel_risk_capacity_v1.js';
import { capacityFixture } from './fixtures/decibel_capacity_fixture_v1.js';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  decibel_operator_settings_store_v1,
  calculateDecibelSessionExecutionMetricsV1,
  deriveDecibelMaximumPositionUsdV1,
  deriveDecibelSessionTradingLimitsV1,
  validateDecibelCapitalAllocationV1,
  diffDecibelOperatorSettingsV1,
  parseDecibelOperatorSettingsValuesV1,
} from '../src/decibel_operator_settings_v1.js';
import { handleDecibelOperatorSettingsRequestV1 } from '../src/run_decibel_production_web_v1.js';

const baseline = Object.freeze({
  capitalToUseUsd: 500,
  maxLossUsd: 50,
  targetMakerVolumeUsd: 10_000,
  orderNotionalUsd: 20,
  maxPositionUsd: 100,
});

describe('Decibel operator settings V1', () => {
  it('prevents collateral allocation from exceeding authenticated account equity', () => {
    expect(() => validateDecibelCapitalAllocationV1(12, 12.74)).not.toThrow();
    expect(() => validateDecibelCapitalAllocationV1(49, 12.74)).toThrow(
      'CAPITAL_TO_USE_EXCEEDS_AUTHENTICATED_ACCOUNT_EQUITY',
    );
    expect(() => validateDecibelCapitalAllocationV1(8, null)).toThrow(
      'AUTHENTICATED_ACCOUNT_EQUITY_REQUIRED',
    );
  });

  it('does not reject lower capital because hidden legacy sizing values are larger', () => {
    expect(() =>
      parseDecibelOperatorSettingsValuesV1({
        ...baseline,
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        orderNotionalUsd: 10,
        maxPositionUsd: 50,
      }),
    ).not.toThrow();
  });

  it('derives a finite hard position bound from capital, loss, leverage, and venue limits', () => {
    expect(
      deriveDecibelMaximumPositionUsdV1({
        capitalToUseUsd: 8,
        maxLossUsd: 8,
        maximumEffectiveLeverage: 40,
        venueMaximumNotionalUsd: 100,
      }),
    ).toBe(100);
    expect(
      deriveDecibelMaximumPositionUsdV1({
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        maximumEffectiveLeverage: 40,
        venueMaximumNotionalUsd: 100,
        maxPositionUsd: 50,
      }),
    ).toBe(50);
    expect(() =>
      deriveDecibelMaximumPositionUsdV1({
        capitalToUseUsd: 8,
        maxLossUsd: 9,
        maximumEffectiveLeverage: 40,
        venueMaximumNotionalUsd: 100,
      }),
    ).toThrow('DERIVED_MAXIMUM_POSITION_INPUT_INVALID');
  });

  it('caps session margin and pending exposure from the active config snapshot', () => {
    const limits = deriveDecibelSessionTradingLimitsV1({
      settings: {
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        targetMakerVolumeUsd: 50,
        orderNotionalUsd: 10,
        maxPositionUsd: 50,
      },
      venueAvailableMarginUsd: 20,
      positionBase: 0.0001,
      openOrders: [{ price: 80_000, quantity: 0.0002 }],
      midpoint: 80_000,
      maximumEffectiveLeverage: 40,
      venueMaximumNotionalUsd: 100,
      maximumAggregateCollateralFraction: 0.5,
    });
    expect(limits.marginUsedUsd).toBeCloseTo(0.6);
    expect(limits.availableMarginUsd).toBeCloseTo(7.4);
    expect(limits.maximumPositionUsd).toBe(50);
  });

  it('counts only filled maker volume and preserves max-loss state across restart time', () => {
    const fills = [
      {
        side: 'BUY' as const,
        quantity: 0.00025,
        price: 80_000,
        maker: true,
        timestamp: 2_000,
        feeUsd: 0.003,
      },
      {
        side: 'SELL' as const,
        quantity: 0.0001,
        price: 79_900,
        maker: true,
        timestamp: 3_000,
        feeUsd: 0.002,
      },
      {
        side: 'SELL' as const,
        quantity: 0.0001,
        price: 79_800,
        maker: false,
        timestamp: 4_000,
        feeUsd: 0.002,
      },
    ];
    const first = calculateDecibelSessionExecutionMetricsV1(fills, 1_500, 79_000);
    const afterRestart = calculateDecibelSessionExecutionMetricsV1(fills, 1_500, 79_000);
    expect(first.makerVolumeUsd).toBeCloseTo(27.99);
    expect(first.pnlUsd).toBeLessThan(0);
    expect(first.exitAccounting?.inventoryBase).toBeCloseTo(0.00005, 12);
    expect(first.exitAccounting?.entryBasis).toBe(80000);
    expect(first.exitAccounting?.realizedPnlAfterFeesUsd).toBeCloseTo(-0.037, 12);
    expect(first.pnlUsd).toBeCloseTo(first.exitAccounting!.realizedPnlAfterFeesUsd - 0.05, 12);
    expect(afterRestart).toEqual(first);
    expect(
      calculateDecibelSessionExecutionMetricsV1([{ ...fills[0]!, feeUsd: null }], 1_500, 80_000),
    ).toMatchObject({
      pnlUsd: null,
      pnlBlocker: 'SESSION_PNL_FEE_EVIDENCE_REQUIRED',
      exitAccounting: null,
    });
  });

  it('validates the complete supported boundary and unlimited volume invariant', () => {
    expect(parseDecibelOperatorSettingsValuesV1({ ...baseline, targetMakerVolumeUsd: -1 })).toEqual(
      {
        ...baseline,
        targetMakerVolumeUsd: -1,
      },
    );
    for (const values of [
      { ...baseline, capitalToUseUsd: 0 },
      { ...baseline, maxLossUsd: 0 },
      { ...baseline, maxLossUsd: 501 },
      { ...baseline, orderNotionalUsd: 0 },
      { ...baseline, maxPositionUsd: 0 },
      { ...baseline, targetMakerVolumeUsd: 0 },
    ])
      expect(() => parseDecibelOperatorSettingsValuesV1(values)).toThrow();
    expect(
      parseDecibelOperatorSettingsValuesV1({ ...baseline, targetMakerVolumeUsd: -1 }).maxLossUsd,
    ).toBe(50);
  });

  it('classifies deterministic risk changes', () => {
    expect(
      diffDecibelOperatorSettingsV1(baseline, { ...baseline, maxLossUsd: 20 })[0]?.classification,
    ).toBe('RISK_DECREASING');
    expect(
      diffDecibelOperatorSettingsV1(baseline, { ...baseline, orderNotionalUsd: 40 })[0]
        ?.classification,
    ).toBe('RISK_INCREASING');
    expect(
      diffDecibelOperatorSettingsV1(baseline, { ...baseline, targetMakerVolumeUsd: -1 })[0]
        ?.classification,
    ).toBe('RISK_INCREASING');
  });

  it('persists atomically, audits sanitized values, and rejects stale revisions', () => {
    const root = mkdtempSync(join(tmpdir(), 'operator-settings-'));
    const path = join(root, 'settings.json');
    const Store = new decibel_operator_settings_store_v1(path, baseline);
    const result = Store.update({
      expectedRevision: 0,
      values: { ...baseline, maxLossUsd: 40 },
    });
    expect(result).toMatchObject({
      applicationStatus: 'APPLIED_FOR_NEXT_SESSION',
      classification: 'RISK_DECREASING',
      settings: { revision: 1 },
    });
    expect(existsSync(path)).toBe(true);
    expect(existsSync(`${path}.audit.jsonl`)).toBe(true);
    expect(readFileSync(path, 'utf8')).not.toMatch(/private|secret|wallet|signer/i);
    expect(() => Store.update({ expectedRevision: 0, values: baseline })).toThrow(
      'SETTINGS_REVISION_CONFLICT',
    );
  });

  it('fails closed on malformed persistence', () => {
    const root = mkdtempSync(join(tmpdir(), 'operator-settings-invalid-'));
    const path = join(root, 'settings.json');
    writeFileSync(path, '{invalid', 'utf8');
    expect(() => new decibel_operator_settings_store_v1(path, baseline).read()).toThrow(
      'OPERATOR_SETTINGS_PERSISTED_CONFIG_INVALID',
    );
  });

  it('exposes only GET and validated POST, without generic commands or execution routes', () => {
    const Store = new decibel_operator_settings_store_v1(
      join(mkdtempSync(join(tmpdir(), 'operator-api-')), 'settings.json'),
      baseline,
    );
    expect(
      handleDecibelOperatorSettingsRequestV1('GET', '/api/operator-settings', null, Store)?.status,
    ).toBe(200);
    expect(
      handleDecibelOperatorSettingsRequestV1(
        'POST',
        '/api/operator-settings',
        {
          expectedRevision: 0,
          values: { ...baseline, targetMakerVolumeUsd: -1 },
        },
        Store,
        { availableMarginUsd: 500, status: 'fresh' },
      ),
    ).toMatchObject({ status: 200, body: { applicationStatus: 'APPLIED_FOR_NEXT_SESSION' } });
    expect(handleDecibelOperatorSettingsRequestV1('POST', '/api/command', {}, Store)).toBeNull();
    expect(handleDecibelOperatorSettingsRequestV1('POST', '/api/place', {}, Store)).toBeNull();
    expect(handleDecibelOperatorSettingsRequestV1('POST', '/api/cancel', {}, Store)).toBeNull();
  });
});

describe('V2 effective exposure budgets', () => {
  const settings = {
    capitalToUseUsd: 8,
    maxLossUsd: 2,
    targetMakerVolumeUsd: 50,
    orderNotionalUsd: 10,
    maxPositionUsd: 50,
  };
  const base = {
    settings,
    now: 10000,
    capacityEvidence: capacityFixture,
    venueAvailableMarginUsd: 8,
    positionBase: 0,
    openOrders: [],
    midpoint: 80000,
    maximumEffectiveLeverage: 40,
    venueMaximumNotionalUsd: 100,
    maximumAggregateCollateralFraction: 0.5,
    targetSemanticsVersion: 2 as const,
    totalExecutedVolumeUsd: 0,
    pnlUsd: 0,
    lotSize: 0.00001,
  };
  it.each([
    [50, 100],
    [200, 100],
    [1000, 100],
  ])('recomputes target %s within the same immutable risk ceiling', (target, expected) => {
    const limits = deriveDecibelSessionTradingLimitsV1({
      ...base,
      settings: { ...settings, targetMakerVolumeUsd: target },
    });
    expect(limits.effectivePositionLimitUsd).toBeCloseTo(expected);
    expect(limits.maximumPositionUsd).toBe(100);
    expect(settings.targetMakerVolumeUsd).toBe(50);
  });
  it('shrinks with margin, loss and remaining volume; never rounds up to an executable minimum', () => {
    expect(
      deriveDecibelSessionTradingLimitsV1({ ...base, venueAvailableMarginUsd: 0.1 })
        .effectivePositionLimitUsd,
    ).toBeCloseTo(0);
    expect(
      deriveDecibelSessionTradingLimitsV1({ ...base, pnlUsd: -1.9 }).effectivePositionLimitUsd,
    ).toBeCloseTo(5.6);
    expect(
      deriveDecibelSessionTradingLimitsV1({ ...base, pnlUsd: null }).effectivePositionLimitUsd,
    ).toBe(0);
    expect(
      deriveDecibelSessionTradingLimitsV1({ ...base, totalExecutedVolumeUsd: 49.78 })
        .effectivePositionLimitUsd,
    ).toBe(100);
    expect(() =>
      deriveDecibelSessionTradingLimitsV1({ ...base, venueAvailableMarginUsd: Number.NaN }),
    ).toThrow('SESSION_MARGIN_EVIDENCE_INVALID');
    expect(() =>
      deriveDecibelSessionTradingLimitsV1({ ...base, totalExecutedVolumeUsd: Number.NaN }),
    ).not.toThrow();
  });
  it('separates current, pending, and available headroom and reconstructs deterministically after restart', () => {
    const input = {
      ...base,
      positionBase: 0.0002,
      openOrders: [{ side: 'BUY' as const, price: 80000, quantity: 0.0001 }],
      totalExecutedVolumeUsd: 25,
    };
    const limits = deriveDecibelSessionTradingLimitsV1(input);
    expect(limits.currentExposureUsd).toBe(16);
    expect(limits.pendingExposureUsd).toBe(8);
    expect(limits.availableHeadroomUsd).toBeCloseTo(76);
    expect(
      deriveDecibelSessionTradingLimitsV1(JSON.parse(JSON.stringify(input)) as typeof input),
    ).toEqual(limits);
    expect(
      deriveDecibelSessionTradingLimitsV1({ ...input, totalExecutedVolumeUsd: 49, pnlUsd: -1.9 })
        .availableHeadroomUsd,
    ).toBe(0);
  });
});

describe('Evidence-gated model B capacity', () => {
  const input = {
    now: 10000,
    evidence: capacityFixture,
    capitalUsd: 8,
    availableMarginUsd: 8,
    leverage: 40,
    maxLossUsd: 2,
    netSessionPnlAfterFeesUsd: 0,
    midpoint: 80000,
    lotSize: 0.00001,
    collateralFraction: 0.5,
    safetyNotionalCeilingUsd: 100,
    positionBase: 0,
    orders: [],
  };
  it.each([50, 100, 200, 1000, 5000])('never changes capacity because target is %s', (target) => {
    const result = deriveDecibelSessionTradingLimitsV1({
      settings: {
        ...baseline,
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        targetMakerVolumeUsd: target,
        maxPositionUsd: 50,
      },
      venueAvailableMarginUsd: 8,
      positionBase: 0,
      openOrders: [],
      midpoint: 80000,
      lotSize: 0.00001,
      maximumEffectiveLeverage: 40,
      venueMaximumNotionalUsd: 100,
      maximumAggregateCollateralFraction: 0.5,
      targetSemanticsVersion: 2,
      pnlUsd: 0,
      totalExecutedVolumeUsd: target - 0.22,
      now: 10000,
      capacityEvidence: capacityFixture,
    });
    expect(result.effectivePositionLimitUsd).toBe(100);
    expect(result.capacityDiagnostics?.bindingConstraint).toBe('NON_STRATEGY_SAFETY_CEILING');
  });
  it('fails closed for missing stress, stale evidence, unavailable fees/gas/margin and near liquidation', () => {
    const missing = { ...input };
    Reflect.deleteProperty(missing, 'evidence');
    expect(calculateDecibelRiskCapacityV1(missing).capacityBlocker).toBe(
      'SESSION_CAPACITY_EVIDENCE_REQUIRED',
    );
    expect(calculateDecibelRiskCapacityV1({ ...input, now: 30000 }).effectivePositionLimitUsd).toBe(
      0,
    );
    for (const key of [
      'exitFeeBps',
      'sessionGasPaidUsd',
      'exitSlippageBps',
      'reservedCollateralUsd',
    ] as const)
      expect(
        calculateDecibelRiskCapacityV1({
          ...input,
          evidence: { ...capacityFixture, [key]: Number.NaN },
        }).effectivePositionLimitUsd,
      ).toBe(0);
    expect(
      calculateDecibelRiskCapacityV1({ ...input, availableMarginUsd: Number.NaN })
        .effectivePositionLimitUsd,
    ).toBe(0);
    expect(
      calculateDecibelRiskCapacityV1({
        ...input,
        evidence: { ...capacityFixture, liquidationDistanceBps: 120 },
      }).capacityBlocker,
    ).toBe('SESSION_CAPACITY_LIQUIDATION_BUFFER_INSUFFICIENT');
  });
  it('responds to measured stress, depth, fees, gas and remaining loss rather than leverage as a loss estimate', () => {
    const low = calculateDecibelRiskCapacityV1(input);
    const high = calculateDecibelRiskCapacityV1({
      ...input,
      evidence: { ...capacityFixture, adverseMoveBps: 500 },
    });
    expect(high.effectivePositionLimitUsd).toBeLessThan(low.effectivePositionLimitUsd);
    expect(high.bindingConstraint).toBe('STRESS_LOSS');
    expect(
      calculateDecibelRiskCapacityV1({ ...input, netSessionPnlAfterFeesUsd: -2 })
        .effectivePositionLimitUsd,
    ).toBe(0);
    expect(
      calculateDecibelRiskCapacityV1({
        ...input,
        evidence: { ...capacityFixture, maximumExecutableExitNotionalUsd: 30 },
      }).bindingConstraint,
    ).toBe('EXIT_DEPTH');
    expect(
      calculateDecibelRiskCapacityV1({ ...input, availableMarginUsd: 0.1 })
        .effectivePositionLimitUsd,
    ).toBe(0);
  });
  it.each([0.0002, -0.0002])(
    'reserves worst-case subsets of both resting sides and inflight orders at inventory %s',
    (positionBase) => {
      const result = calculateDecibelRiskCapacityV1({
        ...input,
        positionBase,
        orders: [
          { side: 'BUY', price: 80000, quantity: 0.0002 },
          { side: 'SELL', price: 80000, quantity: 0.0002 },
        ],
        inflight: [{ side: 'BUY', price: 80000, quantity: 0.0001 }],
      });
      expect(result.worstCaseExposureUsd).toBeCloseTo(positionBase > 0 ? 40 : 32);
      expect(result.availableHeadroomUsd).toBeCloseTo(100 - (positionBase > 0 ? 40 : 32));
      const partial = calculateDecibelRiskCapacityV1({
        ...input,
        positionBase: positionBase + 0.0001,
        orders: [
          { side: 'BUY', price: 80000, quantity: 0.0002 },
          { side: 'SELL', price: 80000, quantity: 0.0002 },
        ],
      });
      expect(partial.worstCaseExposureUsd).toBeCloseTo(positionBase > 0 ? 40 : 24);
    },
  );
});
