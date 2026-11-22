import { deriveDecibelEntryCycleV1 } from '../src/decibel_entry_cycle_v1.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import { buildDecibelExecutionIntentV1 } from '../src/decibel_execution_intent_v1.js';
import { projectDecibelNextSessionEntrySizeUsdV1 } from '../src/decibel_production_web_helpers_v1.js';
import type { decibel_production_live_snapshot_v1 } from '../src/decibel_production_live_types_v1.js';
import { describe, expect, it } from 'vitest';
import {
  calculateDecibelEntrySizeV1,
  calculateDecibelPreferredEntrySizeUsdV1,
} from '../src/decibel_entry_size_v1.js';
import { calculateDecibelRiskCapacityV1 } from '../src/decibel_risk_capacity_v1.js';
import { getDecibelEntryVolatilitySizeFractionV1 } from '../src/decibel_volatility_targets_v1.js';

function assessTestCycle(input: {
  positionBase: number;
  fills: readonly {
    fillId: string;
    intentId: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price?: number;
    timestamp?: number;
  }[];
}) {
  return deriveDecibelEntryCycleV1(
    input.fills.map((fill, index) => ({
      ...fill,
      price: fill.price ?? 80000,
      timestamp: fill.timestamp ?? index,
    })),
    input.positionBase,
  );
}

const size = {
  preferredEntrySizeUsd: 15,
  price: 80000,
  minimumSize: 0.00002,
  minimumNotionalUsd: 0,
  lotSize: 0.00001,
  maximumExecutableNotionalUsd: 100,
};
const capacity = {
  now: 10000,
  capitalUsd: 8,
  availableMarginUsd: 8,
  leverage: 40,
  maxLossUsd: 0.2,
  netSessionPnlAfterFeesUsd: 0,
  midpoint: 80000,
  lotSize: 0.00001,
  collateralFraction: 0.5,
  safetyNotionalCeilingUsd: 160,
  positionBase: 0,
  orders: [],
  observations: {
    accountObservedAt: 10000,
    marketObservedAt: 10000,
    maximumAgeMs: 5000,
    actualLeverage: 40,
    venueMaximumLeverage: 40,
    maintenanceMarginUsd: 0,
    marginDeficitUsd: 0,
    equityUsd: 8,
    liquidationPrice: null,
    bids: [{ price: 79999, size: 1 }],
    asks: [{ price: 80001, size: 1 }],
    recentMidpoints: [80000],
  },
};
describe('Dynamic entry allocation and independent hard risk', () => {
  it('reproduces the $5 capital / $0.20 loss fixture with an independent USD calculation', () => {
    const result = calculateDecibelRiskCapacityV1({
      ...capacity,
      capitalUsd: 5,
      availableMarginUsd: 5.437,
    });
    // 1% move + two 0.1% fee legs + 0.25% slippage + 0.08% selection.
    const lossRate = 0.01 + 0.001 + 0.001 + 0.0025 + 0.0008;
    expect(result.riskCapacityUsd).toBeCloseTo((0.2 - 0.01) / lossRate, 12);
    expect(result.marginCapacityUsd).toBeCloseTo((2.5 - 0.25) / (1 / 40 + 0.0045));
    expect(15 * lossRate + 0.01).toBeCloseTo(0.2395);
    expect(result.lossModel).toMatchObject({
      lossRemainingUsd: 0.19,
      lossBps: 153,
      stressMoveFraction: 0.01,
      stressSource: 'POLICY_FLOOR_AND_RECENT_RANGE',
    });
    expect(result.riskCapacityUsd).toBeLessThan(14.4);
  });
  it('debits net losses once, does not enlarge risk with leverage or credit session gains', () => {
    const base = calculateDecibelRiskCapacityV1({ ...capacity });
    for (const leverage of [10, 40]) {
      const loss = calculateDecibelRiskCapacityV1({
        ...capacity,
        leverage,
        netSessionPnlAfterFeesUsd: -0.05,
      });
      expect(loss.riskCapacityUsd).toBeCloseTo((0.2 - 0.05 - 0.01) / 0.0153);
    }
    expect(
      calculateDecibelRiskCapacityV1({ ...capacity, netSessionPnlAfterFeesUsd: 1 }).riskCapacityUsd,
    ).toBe(base.riskCapacityUsd);
  });
  it.each([1, -1])('counts position and pending opening subsets symmetrically (%s)', (sign) => {
    const result = calculateDecibelRiskCapacityV1({
      ...capacity,
      positionBase: sign * 0.0001,
      observations: { ...capacity.observations, liquidationPrice: sign > 0 ? 70000 : 90000 },
      orders: [{ side: sign > 0 ? 'BUY' : 'SELL', quantity: 0.00005, price: 80000 }],
    });
    expect(result.worstCaseExposureUsd).toBeCloseTo(12);
    expect(result.riskCapacityUsd).toBeCloseTo(0.19 / 0.0153);
  });
  it.each([
    [50, 10],
    [100, 15],
    [300, 45],
    [500, 75],
    [1000, 150],
  ])('target %s prefers %s', (target, expected) => {
    expect(
      calculateDecibelPreferredEntrySizeUsdV1({
        targetTradingVolumeUsd: target,
        capitalToUseUsd: 8,
        collateralFraction: 0.5,
      }),
    ).toBe(expected);
  });
  it('uses the configured capital allocation divided across four entries without a synthetic target', () => {
    expect(
      calculateDecibelPreferredEntrySizeUsdV1({
        targetTradingVolumeUsd: -1,
        capitalToUseUsd: 200,
        collateralFraction: 0.5,
      }),
    ).toBe(25);
  });
  it('raises preferred size to a lot-aligned venue minimum', () => {
    expect(calculateDecibelEntrySizeV1({ ...size, minimumSize: 0.0003 })).toMatchObject({
      quantity: 0.0003,
      reason: 'VENUE_MINIMUM',
    });
    expect(calculateDecibelEntrySizeV1({ ...size, minimumNotionalUsd: 16.1 })).toMatchObject({
      quantity: 0.00021,
      entrySizeUsd: 16.8,
    });
  });
  it('adapts to actual margin, rounds down and blocks below the venue minimum', () => {
    const adapted = calculateDecibelEntrySizeV1({ ...size, maximumExecutableNotionalUsd: 12.1 });
    expect(adapted.quantity).toBe(0.00015);
    expect(adapted.entrySizeUsd).toBeCloseTo(12);
    expect(adapted.reason).toBe('MARGIN_ADAPTED');
    expect(calculateDecibelEntrySizeV1({ ...size, maximumExecutableNotionalUsd: 1 })).toMatchObject(
      { quantity: 0, entrySizeUsd: null, reason: 'AVAILABLE_MARGIN_BELOW_VENUE_MINIMUM' },
    );
  });
  it('shrinks to the stress-loss risk capacity instead of being blocked', () => {
    // Live 2026-11-13: a ~$30 entry against $26.8 of capacity (Max Loss $0.5) was blocked.
    const fitted = calculateDecibelEntrySizeV1({ ...size, riskCapacityUsd: 12.1 });
    expect(fitted.quantity).toBe(0.00015);
    expect(fitted.reason).toBe('RISK_CAPACITY_ADAPTED');
    expect(fitted.entrySizeUsd! * (1 + 1e-12)).toBeLessThanOrEqual(12.1);
    // Capacity never enlarges the entry, and invalid capacity is ignored.
    expect(calculateDecibelEntrySizeV1({ ...size, riskCapacityUsd: 1e6 })).toEqual(
      calculateDecibelEntrySizeV1(size),
    );
    expect(calculateDecibelEntrySizeV1({ ...size, riskCapacityUsd: Number.NaN })).toEqual(
      calculateDecibelEntrySizeV1(size),
    );
    // Below the venue minimum it still refuses (the risk gate then blocks the minimum).
    expect(calculateDecibelEntrySizeV1({ ...size, riskCapacityUsd: 1 }).quantity).toBe(0);
    // The tighter of margin and risk capacity binds.
    expect(
      calculateDecibelEntrySizeV1({
        ...size,
        maximumExecutableNotionalUsd: 12.1,
        riskCapacityUsd: 13,
      }).reason,
    ).toBe('MARGIN_ADAPTED');
  });
  it('keeps executable sizing independent of Max Loss while retaining a stricter risk assessment', () => {
    const a = calculateDecibelRiskCapacityV1({ ...capacity });
    const b = calculateDecibelRiskCapacityV1({
      ...capacity,
      maxLossUsd: 2,
    });
    expect(a.capacityBlocker).toBeNull();
    expect(a.effectivePositionLimitUsd).toBe(b.effectivePositionLimitUsd);
    expect(a.riskCapacityUsd).toBeLessThan(15);
    expect(b.riskCapacityUsd).toBeGreaterThan(15);
    expect(
      calculateDecibelEntrySizeV1({
        ...size,
        maximumExecutableNotionalUsd: a.effectivePositionLimitUsd,
      }).quantity,
    ).toBe(0.00018);
  });
  it('projects the same venue-rounded Entry Size for Settings independently of Max Loss', () => {
    const now = Date.now();
    const snapshot = {
      availableMarginUsd: 8,
      maximumEffectiveLeverage: 40,
      accountMetrics: { collateralUsd: 8 },
      practicalCapacityInputs: {
        ...capacity.observations,
        accountObservedAt: now,
        marketObservedAt: now,
        postOrderMargin: {
          source: 'AUTHENTICATED_POST_ORDER_MARGIN_TIER',
          observedAt: now,
          validUntil: now + 5000,
          maximumNotionalUsd: 160,
          initialMarginRate: 0.025,
          reservedCollateralUsd: 0,
          liquidationDistanceBps: 1000,
          maintenanceMarginUsd: 0,
          tierBoundaryNotionalUsd: 160,
        },
      },
      input: {
        now,
        actualInventoryBase: 0,
        openOrders: [],
        book: { bestBid: 80000, bestAsk: 80000 },
        metadata: { lotSize: 0.00001, minimumSize: 0.00002 },
      },
    } as unknown as decibel_production_live_snapshot_v1;
    const settings = {
      capitalToUseUsd: 8,
      maxLossUsd: 0.2,
      targetMakerVolumeUsd: 300,
      orderNotionalUsd: 10,
      maxPositionUsd: 11.91,
    };
    const input = {
      settings,
      snapshot,
      accountReady: true,
      marketReady: true,
      venueMaximumNotionalUsd: 160,
      maximumAggregateCollateralFraction: 0.5,
    };
    expect(projectDecibelNextSessionEntrySizeUsdV1(input)).toBeCloseTo(44.8);
    expect(
      projectDecibelNextSessionEntrySizeUsdV1({
        ...input,
        settings: { ...settings, maxLossUsd: 2 },
      }),
    ).toBeCloseTo(44.8);
    expect(projectDecibelNextSessionEntrySizeUsdV1({ ...input, accountReady: false })).toBeNull();
    expect(
      projectDecibelNextSessionEntrySizeUsdV1({
        ...input,
        settings: { ...settings, capitalToUseUsd: 0.01, maxLossUsd: 0.001 },
      }),
    ).toBeNull();
  });
  it.each(['BUY', 'SELL'] as const)(
    'reconciles grouped partial fills, duplicates and closed cycles (%s)',
    (side) => {
      const sign = side === 'BUY' ? 1 : -1;
      const fills = Array.from({ length: 8 }, (_, index) => ({
        fillId: String(index),
        intentId: String(Math.floor(index / 2)),
        side,
        quantity: 0.001,
      }));
      expect(assessTestCycle({ positionBase: sign * 0.008, fills })).toEqual({ blocker: null });
      expect(assessTestCycle({ positionBase: sign * 0.007, fills }).blocker).toBe(
        'ENTRY_CYCLE_FILL_HISTORY_RECONCILIATION_REQUIRED',
      );
      expect(
        assessTestCycle({
          positionBase: sign * 0.002,
          fills: [...fills.slice(0, 2), fills[0]!],
        }),
      ).toEqual({ blocker: null });
      const closed = [
        ...fills,
        {
          fillId: 'close',
          intentId: 'close',
          side: side === 'BUY' ? ('SELL' as const) : ('BUY' as const),
          quantity: 0.008,
        },
      ];
      expect(assessTestCycle({ positionBase: 0, fills: closed })).toEqual({ blocker: null });
      expect(
        assessTestCycle({
          positionBase: sign * 0.001,
          fills: [...closed, { fillId: 'new', intentId: 'new', side, quantity: 0.001 }],
        }),
      ).toEqual({ blocker: null });
    },
  );
  it('reads session fills from SQLite after closing and reopening the journal', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'entry-cycle-')), 'journal.sqlite');
    const Journal = new decibel_execution_lifecycle_journal_v1(path);
    try {
      for (let index = 0; index < 5; index++) {
        const intent = buildDecibelExecutionIntentV1({
          sessionId: 'entry-cycle',
          cycleSequence: index + 1,
          action: 'PLACE',
          market: 'BTC/USD',
          side: 'BUY',
          price: 80000,
          quantity: 0.0002,
          tickSize: 0.1,
          lotSize: 0.00001,
          clientOrderId: `test-entry-${index}`,
          knownVenueOrderId: null,
          sourceStateHash: 'test-state',
          strategyDecisionHash: 'test-decision',
          createdAt: index,
        });
        Journal.prepare(intent);
        // The fifth intent stays unfilled and contributes no fills.
        if (index === 4) continue;
        for (let part = 0; part < 2; part++)
          Journal.applyFill({
            fillId: `fill-${index}-${part}`,
            intentId: intent.intentId,
            side: 'BUY',
            quantity: 0.0001,
            price: 80000,
            strategyLineage: true,
            makerProven: true,
            externalCounterparty: true,
            observedAt: index * 2 + part,
          });
      }
    } finally {
      Journal.close();
    }
    const Recovered = new decibel_execution_lifecycle_journal_v1(path);
    try {
      const fills = Recovered.getSessionEntryCycleFills('entry-cycle');
      expect(fills).toHaveLength(8);
      expect(assessTestCycle({ positionBase: 0.0008, fills })).toEqual({ blocker: null });
      expect(assessTestCycle({ positionBase: 0.001, fills }).blocker).toBe(
        'ENTRY_CYCLE_FILL_HISTORY_RECONCILIATION_REQUIRED',
      );
      expect(Recovered.getSessionEntryCycleFills('other-session')).toEqual([]);
    } finally {
      Recovered.close();
    }
  });
  it('refuses incomplete, reversed or ambiguous fill history', () => {
    expect(assessTestCycle({ positionBase: 0, fills: [] })).toEqual({ blocker: null });
    expect(assessTestCycle({ positionBase: 1, fills: [] }).blocker).toBe(
      'ENTRY_CYCLE_FILL_HISTORY_RECONCILIATION_REQUIRED',
    );
    expect(
      assessTestCycle({
        positionBase: -1,
        fills: [
          { fillId: '1', intentId: '1', side: 'BUY', quantity: 1 },
          { fillId: '2', intentId: '2', side: 'SELL', quantity: 2 },
        ],
      }).blocker,
    ).toBe('ENTRY_CYCLE_DIRECTION_REVERSAL_RECONCILIATION_REQUIRED');
    expect(
      assessTestCycle({
        positionBase: 1,
        fills: [{ fillId: '1', intentId: '1', side: 'BUY', quantity: Number.NaN }],
      }).blocker,
    ).toBe('ENTRY_CYCLE_FILL_EVIDENCE_INVALID');
    expect(
      assessTestCycle({
        positionBase: 1,
        fills: [
          { fillId: '1', intentId: '1', side: 'BUY', quantity: 1, timestamp: 5 },
          { fillId: '2', intentId: '2', side: 'SELL', quantity: 1, timestamp: 5 },
          { fillId: '3', intentId: '3', side: 'BUY', quantity: 1, timestamp: 6 },
        ],
      }).blocker,
    ).toBe('ENTRY_CYCLE_FILL_SEQUENCE_EVIDENCE_REQUIRED');
  });
});

describe('Volatility sizing', () => {
  it('keeps the full entry up to a 15 bps range, then shrinks it to at least half', () => {
    expect(getDecibelEntryVolatilitySizeFractionV1(null)).toBe(1);
    expect(getDecibelEntryVolatilitySizeFractionV1(10)).toBe(1);
    expect(getDecibelEntryVolatilitySizeFractionV1(15)).toBe(1);
    expect(getDecibelEntryVolatilitySizeFractionV1(20)).toBeCloseTo(0.75);
    expect(getDecibelEntryVolatilitySizeFractionV1(30)).toBe(0.5);
    expect(getDecibelEntryVolatilitySizeFractionV1(39)).toBe(0.5);
  });

  it('scales the capped entry, never below the venue minimum or above the unscaled size', () => {
    // $15 preferred at 80,000: 0.00018 BTC unscaled, 0.00009 at half size.
    const half = calculateDecibelEntrySizeV1({ ...size, sizeFraction: 0.5 });
    expect(half).toMatchObject({ quantity: 0.00009, reason: 'VOLATILITY_ADAPTED' });
    // The fraction applies after the risk capacity, like the backtest.
    expect(
      calculateDecibelEntrySizeV1({ ...size, riskCapacityUsd: 8, sizeFraction: 0.5 }).quantity,
    ).toBe(0.00005);
    // Never below the venue minimum.
    expect(
      calculateDecibelEntrySizeV1({ ...size, minimumSize: 0.00015, sizeFraction: 0.5 }).quantity,
    ).toBe(0.00015);
    // A fraction of 1 or an invalid one changes nothing.
    for (const sizeFraction of [1, 0, -1, Number.NaN])
      expect(calculateDecibelEntrySizeV1({ ...size, sizeFraction })).toMatchObject({
        quantity: 0.00018,
        reason: calculateDecibelEntrySizeV1(size).reason,
      });
  });
});
