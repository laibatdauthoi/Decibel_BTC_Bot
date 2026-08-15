import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { price_candle } from '../src/btc_bybit_decibel_overlap_audit.js';
import {
  applySwingReaction,
  getConfirmedSwingReactions,
  type five_minute_bar,
  type reaction_zone,
} from '../src/btc_5m_confirmed_swing_sr_zone_limit_state_machine.js';
import {
  isResistanceRejection,
  isSupportRejection,
} from '../src/btc_5m_confirmed_swing_sr_rejection_retest_limit_state_machine.js';
import { applyExternalDepositIfRequired } from '../src/btc_eth_pair.js';
import { sizeFixedRiskPosition } from '../src/btc_5m_sr_rejection_retest_fixed_risk_2r_v2.js';
import {
  buildFullStructureRiskReport,
  getClusterStructuralExtreme,
  getFullStructureRiskGeometry,
  isFullStructureRiskPositionInvalid,
  passesFullStructureRiskDiscovery,
  FullStructureRiskRules,
  simulateFullStructureRiskSegment,
} from '../src/btc_5m_sr_rejection_retest_full_structure_risk_2r_v4.js';
import {
  printExistingFullStructureRiskReport,
  printFullStructureRiskSummary,
  shouldPrintFullStructureRiskProgress,
} from '../src/btc_5m_sr_rejection_retest_full_structure_risk_2r_v4_command.js';

const minute = 60_000;
const candle = (
  timestamp: number,
  open = 100,
  high = 100,
  low = 100,
  close = 100,
): price_candle => ({ timestamp, open, high, low, close });
const makeBar = (
  index: number,
  open: number,
  high: number,
  low: number,
  close: number,
): five_minute_bar => ({
  timestamp: index * 5 * minute,
  open,
  high,
  low,
  close,
  minutes: Array.from({ length: 5 }, (_, offset) =>
    candle(index * 5 * minute + offset * minute, open, high, low, close),
  ),
});
const zone = (type: 'SUPPORT' | 'RESISTANCE', lower: number, upper: number): reaction_zone => ({
  zoneId: 1,
  type,
  lower,
  upper,
  reactionCount: 2,
  firstReactionTimestamp: 0,
  lastReactionTimestamp: 5 * minute,
  tradeableAtTimestamp: 10 * minute,
  brokenAtTimestamp: null,
  isTradeable: true,
  isBroken: false,
  sourceSwingRanges: [
    {
      timestamp: 0,
      low: type === 'SUPPORT' ? lower - 1 : lower,
      high: type === 'RESISTANCE' ? upper + 1 : upper,
    },
  ],
});
const fees = { makerFeeRate: 0.0002, takerFeeRate: 0.0004 };

function rejectionFixture() {
  return [
    makeBar(0, 100, 101, 99, 100),
    makeBar(1, 100, 102, 98, 100),
    makeBar(2, 97, 105, 95, 96),
    makeBar(3, 100, 103, 97, 100),
    makeBar(4, 100, 102, 99, 100),
    makeBar(5, 100, 102, 98, 100),
    makeBar(6, 97, 104, 95.5, 96.5),
    makeBar(7, 100, 103, 98, 100),
    makeBar(8, 96.75, 102, 99, 96.75),
    makeBar(9, 96.5, 98, 96.2, 96.5),
    makeBar(10, 96.5, 97, 96, 96),
  ];
}

describe('BTC 5m S/R rejection retest full-structure-risk 2R V4', () => {
  it('reuses strict confirmed S/R construction and two reactions unchanged', () => {
    const bars = [
      makeBar(0, 100, 101, 99, 100),
      makeBar(1, 100, 102, 98, 100),
      makeBar(2, 103, 105, 95, 97),
      makeBar(3, 100, 103, 97, 100),
      makeBar(4, 100, 102, 98, 100),
    ];
    expect(getConfirmedSwingReactions(bars, 3)).toEqual([]);
    expect(getConfirmedSwingReactions(bars, 4)).toHaveLength(2);
    const zones: reaction_zone[] = [];
    applySwingReaction(
      zones,
      {
        type: 'SUPPORT',
        lower: 95,
        upper: 97,
        timestamp: 0,
        swingRange: { timestamp: 0, high: 100, low: 95 },
      },
      1,
      10 * minute,
    );
    applySwingReaction(
      zones,
      {
        type: 'SUPPORT',
        lower: 96,
        upper: 98,
        timestamp: 20 * minute,
        swingRange: { timestamp: 20 * minute, high: 101, low: 96 },
      },
      2,
      30 * minute,
    );
    expect(zones[0]).toMatchObject({ lower: 96, upper: 97, reactionCount: 2, isTradeable: true });
    expect(getClusterStructuralExtreme(zones[0]!)).toBe(95);
    const resistance = zone('RESISTANCE', 103, 105);
    resistance.sourceSwingRanges.push({ timestamp: 5 * minute, low: 102, high: 108 });
    expect(getClusterStructuralExtreme(resistance)).toBe(108);
  });

  it('keeps exact rejection definitions while entry remains the zone proximal', () => {
    const resistance = zone('RESISTANCE', 103, 105);
    const support = zone('SUPPORT', 95, 97);
    expect(isResistanceRejection(makeBar(0, 102, 104, 100, 102), resistance)).toBe(true);
    expect(isSupportRejection(makeBar(0, 98, 100, 96, 98), support)).toBe(true);
    expect(
      getFullStructureRiskGeometry({
        side: 'SHORT',
        zone: resistance,
        existingClusterStructuralExtreme: 106,
        rejection5mLow: 100,
        rejection5mHigh: 104,
      })?.entryPrice,
    ).toBe(103);
    expect(
      getFullStructureRiskGeometry({
        side: 'LONG',
        zone: support,
        existingClusterStructuralExtreme: 94,
        rejection5mLow: 96,
        rejection5mHigh: 100,
      })?.entryPrice,
    ).toBe(97);
  });

  it('uses rejection extremesâ€”not zone widthâ€”for R, TP, invalidation, and 11R emergency distance', () => {
    const long = getFullStructureRiskGeometry({
      side: 'LONG',
      zone: zone('SUPPORT', 99, 100),
      existingClusterStructuralExtreme: 95,
      rejection5mLow: 98,
      rejection5mHigh: 102,
    })!;
    expect(long).toEqual({
      entryPrice: 100,
      existingClusterStructuralExtreme: 95,
      tradeStructuralAnchor: 95,
      rPrice: 5,
      targetPrice: 110,
      emergencyStopPrice: 45,
      emergencyDistanceFromEntryInR: 11,
    });
    expect(
      getFullStructureRiskGeometry({
        side: 'LONG',
        zone: zone('SUPPORT', 99, 100),
        existingClusterStructuralExtreme: 95,
        rejection5mLow: 94,
        rejection5mHigh: 102,
      })?.tradeStructuralAnchor,
    ).toBe(94);
    const short = getFullStructureRiskGeometry({
      side: 'SHORT',
      zone: zone('RESISTANCE', 100, 101),
      existingClusterStructuralExtreme: 105,
      rejection5mLow: 98,
      rejection5mHigh: 102,
    })!;
    expect(short).toEqual({
      entryPrice: 100,
      existingClusterStructuralExtreme: 105,
      tradeStructuralAnchor: 105,
      rPrice: 5,
      targetPrice: 90,
      emergencyStopPrice: 155,
      emergencyDistanceFromEntryInR: 11,
    });
    expect(
      getFullStructureRiskGeometry({
        side: 'LONG',
        zone: zone('SUPPORT', 99, 100),
        existingClusterStructuralExtreme: 100,
        rejection5mLow: 100,
        rejection5mHigh: 101,
      }),
    ).toBeNull();
  });

  it('sizes 0.50% equity against rejection-anchor loss and caps without rejecting', () => {
    const sizing = sizeFixedRiskPosition({
      side: 'LONG',
      equity: 30,
      entryPrice: 100,
      invalidationPrice: 98,
      maximumLeverage: 40,
    })!;
    expect(sizing.riskTargetUsd).toBe(0.15);
    expect(sizing.targetNotionalUsd).toBeCloseTo(7.5);
    expect(sizing.actualGrossRiskUsd).toBeCloseTo(0.15);
    const capped = sizeFixedRiskPosition({
      side: 'LONG',
      equity: 30,
      entryPrice: 100,
      invalidationPrice: 99.99,
      maximumLeverage: 0.1,
    })!;
    expect(capped.actualNotionalUsd).toBe(3);
    expect(capped.riskCappedByLeverage).toBe(true);
  });

  it('invalidates only on strict completed close beyond the rejection extreme', () => {
    expect(isFullStructureRiskPositionInvalid('LONG', 98, 98)).toBe(false);
    expect(isFullStructureRiskPositionInvalid('LONG', 97.99, 98)).toBe(true);
    expect(isFullStructureRiskPositionInvalid('SHORT', 102, 102)).toBe(false);
    expect(isFullStructureRiskPositionInvalid('SHORT', 102.01, 102)).toBe(true);
  });

  it('uses maker entry/TP, dynamic fees, structural R accounting, and excludes entry-minute TP', () => {
    const bars = rejectionFixture();
    bars[10] = {
      ...bars[10]!,
      minutes: [
        candle(50 * minute, 96.5, 97, 96.4, 96.8),
        candle(51 * minute, 96.8, 96.8, 80, 81),
        candle(52 * minute, 81, 82, 80, 81),
        candle(53 * minute, 81, 82, 80, 81),
        candle(54 * minute, 81, 82, 80, 81),
      ],
      low: 80,
      close: 81,
    };
    const result = simulateFullStructureRiskSegment({
      bars,
      startTimestamp: 0,
      endExclusiveTimestamp: 55 * minute,
      maximumLeverage: 40,
      ...fees,
    });
    expect(result.trades[0]).toMatchObject({
      side: 'SHORT',
      entryTimestamp: 50 * minute,
      existingClusterStructuralExtreme: 105,
      tradeStructuralAnchor: 105,
      rPrice: 8,
      targetPrice: 81,
      emergencyStopPrice: 185,
      emergencyDistanceFromEntryInR: 11,
      outcome: 'TAKE_PROFIT',
      exitTimestamp: 51 * minute,
    });
    expect(result.trades[0]!.entryFeeUsd).toBeCloseTo(
      result.trades[0]!.actualNotionalUsd * fees.makerFeeRate,
    );
    expect(result.trades[0]!.grossR).toBeCloseTo(
      result.trades[0]!.grossPnlUsd / result.trades[0]!.actualGrossRiskUsd,
    );
    expect(result.trades[0]!.netR).toBeCloseTo(
      result.trades[0]!.netPnlUsd / result.trades[0]!.actualGrossRiskUsd,
    );
  });

  it('exits invalidation at first next open as taker and allows earlier emergency insurance', () => {
    const invalidationBars = rejectionFixture();
    invalidationBars.push(makeBar(11, 98, 106, 96, 106), makeBar(12, 107, 120, 90, 100));
    const invalidation = simulateFullStructureRiskSegment({
      bars: invalidationBars,
      startTimestamp: 0,
      endExclusiveTimestamp: 65 * minute,
      maximumLeverage: 40,
      ...fees,
    });
    expect(invalidation.trades[0]).toMatchObject({
      outcome: 'NORMAL_INVALIDATION_EXIT_TAKER',
      invalidationTimestamp: 60 * minute,
      exitTimestamp: 60 * minute,
      exitPrice: 107,
    });
    const emergencyBars = rejectionFixture();
    emergencyBars.push(makeBar(11, 98, 185, 96, 97));
    const emergency = simulateFullStructureRiskSegment({
      bars: emergencyBars,
      startTimestamp: 0,
      endExclusiveTimestamp: 60 * minute,
      maximumLeverage: 40,
      ...fees,
    });
    expect(emergency.trades[0]).toMatchObject({ outcome: 'EMERGENCY_STOP', exitPrice: 185 });
  });

  it('reuses flat-only exact $15 top-up without counting it as PnL', () => {
    expect(applyExternalDepositIfRequired(14, false, 1)).toEqual({ equity: 14, event: null });
    expect(applyExternalDepositIfRequired(14, true, 1)).toMatchObject({
      equity: 29,
      event: { amount: 15 },
    });
  });

  it('keeps exact qualification, no overall/rescue logic, concise output, and report-only', () => {
    const report = buildFullStructureRiskReport({
      candles: [],
      ...fees,
      maximumLeverage: 40,
      leverageSource: 'test',
      feeSource: 'test',
    });
    expect(Object.keys(report.segments)).toEqual(['discovery', 'lateDevelopment']);
    expect(report.dataRange.overallSimulation).toBe(false);
    expect(report.frozenStrategy).toMatchObject({
      minimumConfirmedReactions: 2,
      structuralRiskAnchor: 'FULL_CLUSTER_EXTREME_WITH_CURRENT_REJECTION_EXTENSION',
      zoneWidthDeterminesRisk: false,
      latestRejectionAloneDeterminesRisk: false,
      emergencyStop: 'TEN_R_BEYOND_FULL_STRUCTURE_ANCHOR',
      emergencyDistanceFromEntryInR: 11,
      emergencyStopDeterminesSizing: false,
      exitPendingStates: false,
      parameterSearch: false,
      filters: [],
      indicators: [],
      externalSignals: [],
    });
    const qualifying = {
      ...report.segments.discovery,
      frequency: { completedTradeCount: 500, completedTradesPerUtcDay: 5 },
      usdEconomics: {
        ...report.segments.discovery.usdEconomics,
        meanNetPnlUsd: 1,
        totalNetPnlUsd: 500,
        netProfitFactor: 1.01,
      },
      rEconomics: { ...report.segments.discovery.rEconomics, meanNetR: 0.01 },
    };
    expect(passesFullStructureRiskDiscovery(qualifying)).toBe(true);
    expect(
      passesFullStructureRiskDiscovery({
        ...qualifying,
        frequency: { ...qualifying.frequency, completedTradesPerUtcDay: 4.999 },
      }),
    ).toBe(false);
    expect(report.classification).toBe(
      'BTC_5M_SR_REJECTION_RETEST_FULL_STRUCTURE_RISK_2R_NO_DISCOVERY_EDGE',
    );
    expect(shouldPrintFullStructureRiskProgress(false, 500_000)).toBe(false);
    expect(shouldPrintFullStructureRiskProgress(true, 500_000)).toBe(true);
    expect(FullStructureRiskRules.emergencyBufferRMultiple).toBe(10);

    const output: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...values: unknown[]) => output.push(values);
    try {
      printFullStructureRiskSummary(
        report,
        { loaded1mRows: 0, valid5mBars: 0, elapsedSeconds: 1 },
        'report.json',
      );
    } finally {
      console.log = originalLog;
    }
    expect(output.map(([heading]) => heading)).toEqual([
      '=== BTC 5M SR REJECTION RETEST FULL STRUCTURE RISK 2R V4 ===',
      'START',
      'ENTRY FUNNEL',
      'FREQUENCY',
      'R ECONOMICS',
      'USD ECONOMICS',
      'OUTCOMES',
      'MONEY MANAGEMENT',
      'LONG / SHORT',
      'QUALIFICATION',
      'PERFORMANCE',
    ]);

    const root = mkdtempSync(path.join(tmpdir(), 'full-structure-risk-report-'));
    expect(() => printExistingFullStructureRiskReport(root)).toThrow('REPORT_NOT_FOUND');
    const directory = path.join(root, 'data', 'btc_price_action');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, 'btc_5m_sr_rejection_retest_full_structure_risk_2r_v4.json'),
      JSON.stringify({
        ...report,
        performance: { loaded1mRows: 0, valid5mBars: 0, elapsedSeconds: 1 },
      }),
    );
    console.log = () => undefined;
    try {
      expect(() => printExistingFullStructureRiskReport(root)).not.toThrow();
    } finally {
      console.log = originalLog;
    }
  });
});
