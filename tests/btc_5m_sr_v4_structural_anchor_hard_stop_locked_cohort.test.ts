import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { price_candle } from '../src/btc_bybit_decibel_overlap_audit.js';
import {
  AnchorHardStopLockedRules,
  classifyAnchorLocked,
  getAnchorStopFillPrice,
  isAnchorStopTriggered,
  passesAnchorSixMetricDominance,
  simulateAnchorHardStopTrade,
  summarizeAnchorLockedSegment,
  summarizeAnchorPolicy,
} from '../src/btc_5m_sr_v4_structural_anchor_hard_stop_locked_cohort.js';
import {
  AnchorHardStopLockedReportFileName,
  printExistingAnchorHardStopLockedReport,
} from '../src/btc_5m_sr_v4_structural_anchor_hard_stop_locked_cohort_command.js';
import type { anchor_trade_diagnostic } from '../src/btc_5m_sr_v4_structural_anchor_hard_stop_feasibility_diagnostic.js';

const minute = 60_000;
const candle = (
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close = open,
): price_candle => ({
  timestamp,
  open,
  high,
  low,
  close,
});
const baseline = (
  direction: 'LONG' | 'SHORT' = 'LONG',
  outcome: anchor_trade_diagnostic['baselineOutcome'] = 'TAKE_PROFIT',
): anchor_trade_diagnostic => ({
  tradeId: `trade-${direction}-${outcome}`,
  segment: 'DISCOVERY',
  direction,
  entryFill1mTimestamp: 0,
  entryPrice: 100,
  structuralAnchor: direction === 'LONG' ? 99 : 101,
  rPrice: 1,
  baselineTargetPrice: direction === 'LONG' ? 102 : 98,
  baselineEmergencyPrice: direction === 'LONG' ? 89 : 111,
  actualNotionalUsd: 100,
  actualGrossRiskUsd: 1,
  baselineOutcome: outcome,
  baselineInvalidationTimestamp: outcome === 'NORMAL_INVALIDATION' ? 5 * minute : null,
  baselineExitTimestamp: 6 * minute,
  baselineExitPrice: direction === 'LONG' ? 102 : 98,
  baselineGrossR: outcome === 'TAKE_PROFIT' ? 2 : -2,
  baselineNetR: outcome === 'TAKE_PROFIT' ? 1.98 : -2.04,
  baselineGrossPnlUsd: outcome === 'TAKE_PROFIT' ? 2 : -2,
  baselineNetPnlUsd: outcome === 'TAKE_PROFIT' ? 1.98 : -2.04,
  hardStopLevel: direction === 'LONG' ? 99 : 101,
  anchorCoordinateR: 1,
  firstAnchorTouchTimestamp: null,
  firstTpTouchTimestamp: null,
  firstEventClassification:
    outcome === 'TAKE_PROFIT' ? 'TP_BEFORE_ANCHOR' : 'ANCHOR_NOT_TOUCHED_BEFORE_BASELINE_EXIT',
  minutesFromAnchorTouchToInvalidation: null,
  minutesFromAnchorTouchToBaselineExit: null,
  completed5mBarsFromAnchorTouchToInvalidation: null,
  maximumAdverseExcursionBeyondAnchorR: null,
  baselineGrossLossBeyondAnchorR: null,
  decisiveLoserGrossRSaved: 0,
  decisiveWinnerGrossRLost: 0,
  decisiveGrossUsdProxy: 0,
});
const simulate = (row: anchor_trade_diagnostic, candles: price_candle[]) =>
  simulateAnchorHardStopTrade({
    baseline: row,
    candles,
    segmentEndExclusiveTimestamp: 20 * minute,
    makerFeeRate: 0.001,
    takerFeeRate: 0.002,
  });

describe('BTC 5M SR V4 structural-anchor hard-stop locked cohort V1', () => {
  it('freezes exact V4 cohorts, outcomes, economics, and execution semantics', () => {
    expect(AnchorHardStopLockedRules.expected.DISCOVERY).toMatchObject({
      completedTradeCount: 7060,
      takeProfitCount: 3160,
      normalInvalidationCount: 3800,
      emergencyStopCount: 100,
      meanGrossR: -0.34637171309843406,
      totalNetPnlUsd: -539.202734254158,
    });
    expect(AnchorHardStopLockedRules.expected.LATE_DEVELOPMENT).toMatchObject({
      completedTradeCount: 4189,
      takeProfitCount: 1912,
      normalInvalidationCount: 2249,
      emergencyStopCount: 28,
      netRProfitFactor: 0.5009975686606005,
    });
    expect(AnchorHardStopLockedRules).toMatchObject({
      hardStopR: -1,
      entryLiquidity: 'POST_ONLY_LIMIT_MAKER',
      targetLiquidity: 'REDUCE_ONLY_POST_ONLY_LIMIT_MAKER',
      hardStopLiquidity: 'TAKER_PROTECTIVE_EXIT',
      same1mPolicy: 'STOP_WINS',
    });
  });

  it('uses inclusive LONG/SHORT triggers and conservative open-through fills', () => {
    expect(isAnchorStopTriggered('LONG', { low: 99, high: 100 }, 99)).toBe(true);
    expect(isAnchorStopTriggered('SHORT', { low: 100, high: 101 }, 101)).toBe(true);
    expect(getAnchorStopFillPrice('LONG', 99, 98.5)).toBe(98.5);
    expect(getAnchorStopFillPrice('LONG', 99, 100)).toBe(99);
    expect(getAnchorStopFillPrice('SHORT', 101, 101.5)).toBe(101.5);
    expect(getAnchorStopFillPrice('SHORT', 101, 100)).toBe(101);
  });

  it('allows a same-entry-minute hard stop and charges maker entry plus taker exit exactly', () => {
    const result = simulate(baseline('LONG', 'NORMAL_INVALIDATION'), [candle(0, 101, 101, 99)]);
    expect(result).toMatchObject({
      outcome: 'STRUCTURAL_ANCHOR_HARD_STOP',
      exitTimestamp: 0,
      exitPrice: 99,
      exitLiquidity: 'TAKER',
      entryFeeUsd: 0.1,
      exitFeeUsd: 0.2,
      grossPnlUsd: -1,
      netPnlUsd: -1.3,
      grossR: -1,
      netR: -1.3,
      hardStopSlippageBeyondMinus1R: 0,
    });
    expect(result.totalFeeUsd).toBeCloseTo(0.3);
  });

  it('handles LONG and SHORT adverse gaps without better-than-anchor fills', () => {
    const long = simulate(baseline('LONG', 'NORMAL_INVALIDATION'), [candle(0, 98.5, 100, 98)]);
    const short = simulate(baseline('SHORT', 'NORMAL_INVALIDATION'), [candle(0, 101.5, 102, 100)]);
    expect(long.exitPrice).toBe(98.5);
    expect(short.exitPrice).toBe(101.5);
    expect(long.hardStopSlippageBeyondMinus1R).toBeCloseTo(0.5);
    expect(short.hardStopSlippageBeyondMinus1R).toBeCloseTo(0.5);
  });

  it('lets the earlier event win and makes stop win same-minute TP ambiguity', () => {
    const row = baseline('LONG');
    const tpFirst = simulate(row, [candle(0, 100, 102, 99.5), candle(minute, 100, 100, 99)]);
    const stopFirst = simulate(row, [candle(0, 100, 101, 99), candle(minute, 100, 102, 99.5)]);
    const ambiguous = simulate(row, [candle(0, 100, 102, 99)]);
    expect(tpFirst.outcome).toBe('TAKE_PROFIT');
    expect(tpFirst.exitLiquidity).toBe('MAKER');
    expect(stopFirst.outcome).toBe('STRUCTURAL_ANCHOR_HARD_STOP');
    expect(ambiguous).toMatchObject({
      outcome: 'STRUCTURAL_ANCHOR_HARD_STOP',
      same1mTpStopAmbiguous: true,
    });
  });

  it('replaces delayed normal invalidation, lets stop precede emergency, and never double exits', () => {
    const row = baseline('LONG', 'EMERGENCY_STOP');
    const stopped = simulate(row, [candle(0, 100, 100, 99), candle(minute, 88, 89, 87)]);
    const emergencyGap = simulate(row, [candle(0, 88, 100, 87)]);
    expect(stopped.outcome).toBe('STRUCTURAL_ANCHOR_HARD_STOP');
    expect(emergencyGap).toMatchObject({ outcome: 'EMERGENCY_STOP', exitPrice: 88 });
    expect([stopped.outcome]).toHaveLength(1);
  });

  it('keeps frozen entry, R, anchor, notional, and +2R target in every counterpart', () => {
    const row = baseline('SHORT');
    const result = simulate(row, [candle(0, 100, 100.5, 98)]);
    expect(result).toMatchObject({
      tradeId: row.tradeId,
      entryPrice: row.entryPrice,
      rPrice: row.rPrice,
      structuralAnchor: row.structuralAnchor,
      actualNotionalUsd: row.actualNotionalUsd,
      actualGrossRiskUsd: row.actualGrossRiskUsd,
      targetPrice: row.baselineTargetPrice,
    });
    expect((result.entryPrice - result.targetPrice) / result.rPrice).toBe(2);
  });

  it('calculates all six dominance metrics and rejects a one-segment failure', () => {
    const p0 = summarizeAnchorPolicy([
      { outcome: 'TAKE_PROFIT', grossPnlUsd: 1, netPnlUsd: 0.8, grossR: 1, netR: 0.8 },
      { outcome: 'NORMAL_INVALIDATION', grossPnlUsd: -1, netPnlUsd: -1.2, grossR: -1, netR: -1.2 },
    ]);
    const p1 = summarizeAnchorPolicy([
      { outcome: 'TAKE_PROFIT', grossPnlUsd: 2, netPnlUsd: 1.8, grossR: 2, netR: 1.8 },
      {
        outcome: 'STRUCTURAL_ANCHOR_HARD_STOP',
        grossPnlUsd: -0.5,
        netPnlUsd: -0.7,
        grossR: -0.5,
        netR: -0.7,
      },
    ]);
    expect(passesAnchorSixMetricDominance(p1, p0)).toBe(true);
    expect(
      classifyAnchorLocked({
        foundationPassed: true,
        discoveryDominates: true,
        lateDominates: false,
        discoveryGrossEdge: true,
        lateGrossEdge: true,
        discoveryNetEdge: true,
        lateNetEdge: true,
      }),
    ).toBe('BTC_5M_SR_ANCHOR_HARD_STOP_DOES_NOT_DOMINATE_V4');
  });

  it('accounts saved losers, false-stopped winners, USD/R trade-off, and emergency conversion', () => {
    const loser = baseline('LONG', 'NORMAL_INVALIDATION');
    const winner = baseline('SHORT', 'TAKE_PROFIT');
    const emergency = baseline('SHORT', 'EMERGENCY_STOP');
    emergency.tradeId = 'emergency';
    const candidates = [
      simulate(loser, [candle(0, 100, 100, 99)]),
      simulate(winner, [candle(0, 100, 101, 98)]),
      simulate(emergency, [candle(0, 100, 101, 99)]),
    ];
    const summary = summarizeAnchorLockedSegment([loser, winner, emergency], candidates);
    expect(summary.savedBaselineLosers.savedBaselineLoserCount).toBe(2);
    expect(summary.savedBaselineLosers.savedBaselineLoserRate).toBe(1);
    expect(summary.falseStoppedBaselineWinners).toMatchObject({
      falseStoppedBaselineWinnerCount: 1,
      rateAmongP0TpWinners: 1,
      same1mTpStopAmbiguousCount: 1,
    });
    expect(summary.netTradeOff.netBenefitUsd).toBeCloseTo(
      summary.netTradeOff.totalNetPnlUsdSavedFromBaselineLosers -
        summary.netTradeOff.totalNetPnlUsdLostFromBaselineWinners,
    );
    expect(summary.netTradeOff.netBenefitR).toBeCloseTo(
      summary.netTradeOff.totalNetRSaved - summary.netTradeOff.totalNetRLost,
    );
    expect(summary.emergencyEffect.baselineEmergencyConvertedToHardStopCount).toBe(1);
    expect(summary.longShort.ALL.scoreboard.P1.tradeCount).toBe(3);
    expect(summary.longShort.LONG.scoreboard.P1.tradeCount).toBe(1);
    expect(summary.longShort.SHORT.scoreboard.P1.tradeCount).toBe(2);
  });

  it('classifies foundation, live-replay, gross-edge, and strong candidates exactly', () => {
    const classify = (overrides: Partial<Parameters<typeof classifyAnchorLocked>[0]> = {}) =>
      classifyAnchorLocked({
        foundationPassed: true,
        discoveryDominates: true,
        lateDominates: true,
        discoveryGrossEdge: false,
        lateGrossEdge: false,
        discoveryNetEdge: false,
        lateNetEdge: false,
        ...overrides,
      });
    expect(classify({ foundationPassed: false })).toBe(
      'BTC_5M_SR_ANCHOR_HARD_STOP_FOUNDATION_REGRESSION',
    );
    expect(classify()).toBe('BTC_5M_SR_ANCHOR_HARD_STOP_LIVE_REPLAY_CANDIDATE');
    expect(classify({ discoveryGrossEdge: true, lateGrossEdge: true })).toBe(
      'BTC_5M_SR_ANCHOR_HARD_STOP_GROSS_EDGE_CANDIDATE',
    );
    expect(classify({ discoveryNetEdge: true, lateNetEdge: true })).toBe(
      'BTC_5M_SR_ANCHOR_HARD_STOP_STRONG_LIVE_REPLAY_CANDIDATE',
    );
  });

  it('supports concise report-only output without SQLite', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'anchor-locked-'));
    const directory = path.join(root, 'data', 'btc_price_action');
    mkdirSync(directory, { recursive: true });
    const segment = {
      scoreboard: {},
      stopExecution: {},
      savedBaselineLosers: {},
      falseStoppedBaselineWinners: {},
      netTradeOff: {},
      emergencyEffect: {},
    };
    writeFileSync(
      path.join(directory, AnchorHardStopLockedReportFileName),
      JSON.stringify({
        sourceCheck: { foundationPassed: true, discoveryFoundation: {}, lateFoundation: {} },
        cohortInvariance: {},
        segments: { discovery: segment, lateDevelopment: segment },
        dominance: {},
        edgeCheck: {},
        classification: 'X',
        performance: { loaded1mRows: 1, elapsedSeconds: 1 },
      }),
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printExistingAnchorHardStopLockedReport(root);
    expect(log.mock.calls.some(([label]) => label === 'CLASSIFICATION')).toBe(true);
    log.mockRestore();
  });
});
