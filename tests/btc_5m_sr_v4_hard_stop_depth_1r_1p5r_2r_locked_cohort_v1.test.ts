import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { price_candle } from '../src/btc_bybit_decibel_overlap_audit.js';
import {
  classifyHardStopDepth,
  getDepthStopPrice,
  HardStopDepthRules,
  simulateDepthTrade,
  type depth_trade,
  type hard_stop_policy,
} from '../src/btc_5m_sr_v4_hard_stop_depth_1r_1p5r_2r_locked_cohort_v1.js';
import {
  HardStopDepthReportFileName,
  printExistingHardStopDepthReport,
} from '../src/btc_5m_sr_v4_hard_stop_depth_1r_1p5r_2r_locked_cohort_v1_command.js';
import type { anchor_trade_diagnostic } from '../src/btc_5m_sr_v4_structural_anchor_hard_stop_feasibility_diagnostic.js';

const minute = 60_000;
const candle = (
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close = open,
): price_candle => ({ timestamp, open, high, low, close });
const baseline = (direction: 'LONG' | 'SHORT' = 'LONG'): anchor_trade_diagnostic => ({
  tradeId: `trade-${direction}`,
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
  baselineOutcome: 'TAKE_PROFIT',
  baselineInvalidationTimestamp: null,
  baselineExitTimestamp: 10 * minute,
  baselineExitPrice: direction === 'LONG' ? 102 : 98,
  baselineGrossR: 2,
  baselineNetR: 1.98,
  baselineGrossPnlUsd: 2,
  baselineNetPnlUsd: 1.98,
  hardStopLevel: direction === 'LONG' ? 99 : 101,
  anchorCoordinateR: 1,
  firstAnchorTouchTimestamp: null,
  firstTpTouchTimestamp: null,
  firstEventClassification: 'TP_BEFORE_ANCHOR',
  minutesFromAnchorTouchToInvalidation: null,
  minutesFromAnchorTouchToBaselineExit: null,
  completed5mBarsFromAnchorTouchToInvalidation: null,
  maximumAdverseExcursionBeyondAnchorR: null,
  baselineGrossLossBeyondAnchorR: null,
  decisiveLoserGrossRSaved: 0,
  decisiveWinnerGrossRLost: 0,
  decisiveGrossUsdProxy: 0,
});
const simulate = (
  policy: hard_stop_policy,
  row: anchor_trade_diagnostic,
  candles: price_candle[],
) =>
  simulateDepthTrade({
    policy,
    baseline: row,
    candles,
    segmentEndExclusiveTimestamp: 20 * minute,
    makerFeeRate: 0.001,
    takerFeeRate: 0.002,
  });

describe('BTC 5M SR V4 hard-stop depth 1R/1.5R/2R locked cohort V1', () => {
  it('freezes exact P0 and P1 foundation checksums and only three stop depths', () => {
    expect(HardStopDepthRules.p0Expected.DISCOVERY.completedTradeCount).toBe(7060);
    expect(HardStopDepthRules.p0Expected.LATE_DEVELOPMENT.completedTradeCount).toBe(4189);
    expect(HardStopDepthRules.p1Expected.DISCOVERY).toMatchObject({
      tradeCount: 7060,
      takeProfitCount: 2076,
      hardStopCount: 4984,
      meanGrossR: -0.11800970311969772,
      totalNetPnlUsd: -397.2980022860986,
    });
    expect(HardStopDepthRules.p1Expected.LATE_DEVELOPMENT).toMatchObject({
      tradeCount: 4189,
      takeProfitCount: 1317,
      hardStopCount: 2872,
      meanNetR: -0.637443409233385,
      netProfitFactor: 0.4555232055979094,
    });
    expect(HardStopDepthRules.policies).toEqual({
      P0_V4_DELAYED_INVALIDATION: null,
      P1_HARD_STOP_1R: 1,
      P2_HARD_STOP_1P5R: 1.5,
      P3_HARD_STOP_2R: 2,
    });
  });

  it('calculates exact LONG and SHORT -1R/-1.5R/-2R stops with P1 at anchor', () => {
    expect([1, 1.5, 2].map((depth) => getDepthStopPrice(baseline('LONG'), depth))).toEqual([
      99, 98.5, 98,
    ]);
    expect([1, 1.5, 2].map((depth) => getDepthStopPrice(baseline('SHORT'), depth))).toEqual([
      101, 101.5, 102,
    ]);
    expect(getDepthStopPrice(baseline('LONG'), 1)).toBe(baseline('LONG').structuralAnchor);
    expect(getDepthStopPrice(baseline('SHORT'), 1)).toBe(baseline('SHORT').structuralAnchor);
  });

  it('preserves entry, R, notional, risk, anchor, and +2R target for every policy', () => {
    const row = baseline('LONG');
    for (const policy of ['P1_HARD_STOP_1R', 'P2_HARD_STOP_1P5R', 'P3_HARD_STOP_2R'] as const) {
      const result = simulate(policy, row, [candle(0, 101, 102, 100)]);
      expect(result).toMatchObject({
        tradeId: row.tradeId,
        entryPrice: row.entryPrice,
        rPrice: row.rPrice,
        actualNotionalUsd: row.actualNotionalUsd,
        actualGrossRiskUsd: row.actualGrossRiskUsd,
        structuralAnchor: row.structuralAnchor,
        targetPrice: row.baselineTargetPrice,
      });
    }
  });

  it('uses inclusive triggers, exact fills, and adverse open-through fills without improvement', () => {
    const exact = simulate('P2_HARD_STOP_1P5R', baseline('LONG'), [candle(0, 101, 101, 98.5)]);
    const longGap = simulate('P2_HARD_STOP_1P5R', baseline('LONG'), [candle(0, 98, 100, 97.5)]);
    const shortGap = simulate('P2_HARD_STOP_1P5R', baseline('SHORT'), [candle(0, 102, 102.5, 100)]);
    expect(exact).toMatchObject({ exitPrice: 98.5, grossR: -1.5, exitLiquidity: 'TAKER' });
    expect(longGap.exitPrice).toBe(98);
    expect(shortGap.exitPrice).toBe(102);
    expect(longGap.slippageBeyondNominalStopR).toBeCloseTo(0.5);
    expect(shortGap.slippageBeyondNominalStopR).toBeCloseTo(0.5);
  });

  it('allows same-entry-minute stop and applies maker-entry/taker-stop fees exactly', () => {
    const result = simulate('P3_HARD_STOP_2R', baseline('LONG'), [candle(0, 101, 101, 98)]);
    expect(result).toMatchObject({
      outcome: 'STRUCTURAL_ANCHOR_HARD_STOP',
      exitTimestamp: 0,
      exitPrice: 98,
      entryFeeUsd: 0.1,
      exitFeeUsd: 0.2,
      grossPnlUsd: -2,
      grossR: -2,
    });
    expect(result.totalFeeUsd).toBeCloseTo(0.3);
    expect(result.netPnlUsd).toBeCloseTo(-2.3);
    expect(result.netR).toBeCloseTo(-2.3);
  });

  it('uses chronological first event and conservative same-minute STOP_WINS', () => {
    const row = baseline('LONG');
    const tpFirst = simulate('P1_HARD_STOP_1R', row, [
      candle(0, 100, 102, 99.5),
      candle(minute, 100, 100, 99),
    ]);
    const stopFirst = simulate('P1_HARD_STOP_1R', row, [
      candle(0, 100, 101, 99),
      candle(minute, 100, 102, 99.5),
    ]);
    const same = simulate('P1_HARD_STOP_1R', row, [candle(0, 100, 102, 99)]);
    expect(tpFirst).toMatchObject({ outcome: 'TAKE_PROFIT', exitLiquidity: 'MAKER' });
    expect(stopFirst.outcome).toBe('STRUCTURAL_ANCHOR_HARD_STOP');
    expect(same).toMatchObject({
      outcome: 'STRUCTURAL_ANCHOR_HARD_STOP',
      same1mTpStopAmbiguous: true,
    });
  });

  it('keeps emergency as a single unchanged adverse backstop', () => {
    const result = simulate('P3_HARD_STOP_2R', baseline('LONG'), [candle(0, 88, 100, 87)]);
    expect(result).toMatchObject({
      outcome: 'EMERGENCY_STOP',
      exitPrice: 88,
      exitLiquidity: 'TAKER',
    });
  });

  it('demonstrates recovered-winner and lost-loser-savings mechanics without new trades', () => {
    const winner = baseline('LONG');
    const p1 = simulate('P1_HARD_STOP_1R', winner, [
      candle(0, 100, 100, 99),
      candle(minute, 100, 102, 99.5),
    ]);
    const p2 = simulate('P2_HARD_STOP_1P5R', winner, [
      candle(0, 100, 100, 99),
      candle(minute, 100, 102, 99.5),
    ]);
    expect(p1.outcome).toBe('STRUCTURAL_ANCHOR_HARD_STOP');
    expect(p2.outcome).toBe('TAKE_PROFIT');
    expect(p2.tradeId).toBe(p1.tradeId);
    const loser = baseline('LONG');
    loser.baselineOutcome = 'NORMAL_INVALIDATION';
    loser.baselineNetPnlUsd = -3;
    loser.baselineNetR = -3;
    const p1Loser = simulate('P1_HARD_STOP_1R', loser, [candle(0, 100, 100, 98.5)]);
    const p2Loser = simulate('P2_HARD_STOP_1P5R', loser, [candle(0, 100, 100, 98.5)]);
    expect(p2Loser.netR).toBeLessThan(p1Loser.netR);
  });

  it('classifies exact, none, single, and multiple dominance without tie-break', () => {
    expect(classifyHardStopDepth({ foundationPassed: false, validPolicies: [] })).toBe(
      'BTC_5M_SR_HARD_STOP_DEPTH_FOUNDATION_REGRESSION',
    );
    expect(classifyHardStopDepth({ foundationPassed: true, validPolicies: [] })).toBe(
      'BTC_5M_SR_HARD_STOP_DEPTH_NONE_DOMINATES_V4',
    );
    expect(
      classifyHardStopDepth({ foundationPassed: true, validPolicies: ['P2_HARD_STOP_1P5R'] }),
    ).toBe('BTC_5M_SR_HARD_STOP_DEPTH_1P5R_CANDIDATE');
    expect(
      classifyHardStopDepth({
        foundationPassed: true,
        validPolicies: ['P1_HARD_STOP_1R', 'P3_HARD_STOP_2R'],
      }),
    ).toBe('BTC_5M_SR_HARD_STOP_DEPTH_MULTIPLE_VALID_DEPTHS');
  });

  it('keeps full records policy-distinct and contains no dynamic portfolio fields', () => {
    const rows: depth_trade[] = [
      simulate('P1_HARD_STOP_1R', baseline(), [candle(0, 100, 102, 100)]),
      simulate('P2_HARD_STOP_1P5R', baseline(), [candle(0, 100, 102, 100)]),
      simulate('P3_HARD_STOP_2R', baseline(), [candle(0, 100, 102, 100)]),
    ];
    expect(new Set(rows.map((row) => row.policy)).size).toBe(3);
    expect(Object.keys(rows[0]!)).not.toContain('equity');
    expect(Object.keys(rows[0]!)).not.toContain('topUp');
  });

  it('supports concise report-only with zero SQLite and exact JSON path', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'depth-report-'));
    const directory = path.join(root, 'data', 'btc_price_action');
    mkdirSync(directory, { recursive: true });
    const policy = {
      scoreboard: {},
      falseStoppedBaselineWinners: {},
      savedBaselineLosers: {},
      stopExecution: {},
    };
    const segment = {
      policies: { P1_HARD_STOP_1R: policy, P2_HARD_STOP_1P5R: policy, P3_HARD_STOP_2R: policy },
      recoveredWinners: {
        P2_HARD_STOP_1P5R: { recoveredWinners: {}, lostLoserSavings: {} },
        P3_HARD_STOP_2R: { recoveredWinners: {}, lostLoserSavings: {} },
      },
      marginalDepthEconomics: {},
      v4Comparisons: {},
      dominance: {},
      edgeChecks: {},
    };
    writeFileSync(
      path.join(directory, HardStopDepthReportFileName),
      JSON.stringify({
        foundation: {},
        cohortInvariance: {},
        segments: { discovery: segment, lateDevelopment: segment },
        classification: 'X',
        selectedPolicy: null,
        netEdgePositiveBoth: false,
        performance: { loaded1mRows: 0, elapsedSeconds: 0 },
      }),
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printExistingHardStopDepthReport(root);
    expect(log.mock.calls.some(([label]) => label === 'CLASSIFICATION')).toBe(true);
    log.mockRestore();
  });
});
