import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { price_candle } from '../src/btc_bybit_decibel_overlap_audit.js';
import type { five_minute_bar } from '../src/btc_5m_confirmed_swing_sr_zone_limit_state_machine.js';
import { FullStructureRiskRules } from '../src/btc_5m_sr_rejection_retest_full_structure_risk_2r_v4.js';
import {
  buildHardStop2RProspectiveReport,
  classifyHardStop2RProspective,
  getHardStop2RFillPrice,
  getHardStop2RPrice,
  HardStop2RProspectiveRules,
  isHardStop2RTouched,
  simulateHardStop2RProspectiveSegment,
  verifyControlFoundation,
} from '../src/btc_5m_sr_v4_hard_stop_2r_prospective_replay_v1.js';
import {
  HardStop2RProspectiveReportFileName,
  printExistingHardStop2RProspectiveReport,
} from '../src/btc_5m_sr_v4_hard_stop_2r_prospective_replay_v1_command.js';

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
const fees = { makerFeeRate: 0.0002, takerFeeRate: 0.0004, maximumLeverage: 40 };

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

describe('BTC 5m SR V4 hard-stop 2R prospective replay V1', () => {
  it('freezes the one challenger while preserving the V4 control contract', () => {
    expect(HardStop2RProspectiveRules.controlExperimentId).toBe(
      FullStructureRiskRules.experimentId,
    );
    expect(HardStop2RProspectiveRules.policies).toEqual(['P0_V4_CONTROL', 'P1_HARD_STOP_2R']);
    expect(HardStop2RProspectiveRules.hardStopR).toBe(-2);
    expect(HardStop2RProspectiveRules.targetRMultiple).toBe(2);
    expect(HardStop2RProspectiveRules.riskFraction).toBe(0.005);
    expect(HardStop2RProspectiveRules.retestWindowBars).toBe(1);
  });

  it('calculates a separate -2R hard stop while leaving the structural anchor at -1R', () => {
    expect(getHardStop2RPrice('LONG', 100, 5)).toBe(90);
    expect(getHardStop2RPrice('SHORT', 100, 5)).toBe(110);
    expect(100 - 5).toBe(95);
  });

  it('triggers at equality and never improves an adverse open-through fill', () => {
    expect(isHardStop2RTouched('LONG', { low: 90, high: 100 }, 90)).toBe(true);
    expect(isHardStop2RTouched('SHORT', { low: 100, high: 110 }, 110)).toBe(true);
    expect(getHardStop2RFillPrice('LONG', 90, 88)).toBe(88);
    expect(getHardStop2RFillPrice('LONG', 90, 92)).toBe(90);
    expect(getHardStop2RFillPrice('SHORT', 110, 112)).toBe(112);
    expect(getHardStop2RFillPrice('SHORT', 110, 108)).toBe(110);
  });

  it('uses the exact V4 setup engine and independent P1 state/equity ledger', () => {
    const bars = rejectionFixture();
    bars[10] = {
      ...bars[10]!,
      low: 80,
      close: 81,
      minutes: [
        candle(50 * minute, 96.5, 97, 96.4, 96.8),
        candle(51 * minute, 96.8, 200, 1, 81),
        candle(52 * minute, 81, 82, 80, 81),
        candle(53 * minute, 81, 82, 80, 81),
        candle(54 * minute, 81, 82, 80, 81),
      ],
    };
    const result = simulateHardStop2RProspectiveSegment({
      bars,
      startTimestamp: 0,
      endExclusiveTimestamp: 55 * minute,
      ...fees,
    });
    expect(result.diagnostics.retestCampaignCount).toBeGreaterThan(0);
    expect(result.diagnostics.validEntryCount).toBe(result.trades.length);
    expect(result.trades[0]?.equityBeforeTrade).toBe(FullStructureRiskRules.startingEquityUsd);
    expect(result.trades[0]?.entryFeeUsd).toBeCloseTo(
      (result.trades[0]?.actualNotionalUsd ?? 0) * fees.makerFeeRate,
    );
    expect(result.trades[0]).toMatchObject({
      outcome: 'HARD_STOP_2R',
      same1mTpStopAmbiguous: true,
    });
    expect(result.trades[0]?.exitFeeUsd).toBeCloseTo(
      (result.trades[0]?.actualNotionalUsd ?? 0) * fees.takerFeeRate,
    );
  });

  it('asserts every frozen P0 count and economics field for both historical segments', () => {
    const empty = buildHardStop2RProspectiveReport({
      candles: [],
      prebuilt5m: { bars: [], invalid5mBars: 0 },
      ...fees,
      leverageSource: 'TEST',
      feeSource: 'config/btc_eth_pair_v1.json',
    });
    const makeControl = (
      expected: (typeof HardStop2RProspectiveRules.expectedControl)['DISCOVERY'],
    ) => ({
      ...empty.segments.discovery.policies.P0_V4_CONTROL.scoreboard.ALL,
      completedTradeCount: expected.completedTradeCount,
      averageCompletedTradesPerUtcDay: expected.completedTradesPerUtcDay,
      takeProfitCount: expected.takeProfitCount,
      normalInvalidationCount: expected.normalInvalidationCount,
      emergencyStopCount: expected.emergencyStopCount,
      meanGrossR: expected.meanGrossR,
      grossRProfitFactor: expected.grossRProfitFactor,
      meanNetR: expected.meanNetR,
      netRProfitFactor: expected.netRProfitFactor,
      totalNetPnlUsd: expected.totalNetPnlUsd,
      netProfitFactor: expected.netProfitFactor,
      riskCappedByLeverageCount: expected.riskCappedByLeverageCount,
    });
    expect(
      verifyControlFoundation(
        makeControl(HardStop2RProspectiveRules.expectedControl.DISCOVERY),
        makeControl(HardStop2RProspectiveRules.expectedControl.LATE_DEVELOPMENT),
      ).passed,
    ).toBe(true);
  });

  it('keeps P0 and P1 as independent chronological simulations in the report', () => {
    const bars = rejectionFixture();
    const report = buildHardStop2RProspectiveReport({
      candles: bars.flatMap((bar) => bar.minutes),
      prebuilt5m: { bars, invalid5mBars: 0 },
      ...fees,
      leverageSource: 'TEST',
      feeSource: 'config/btc_eth_pair_v1.json',
    });
    expect(report.independentStateMachines).toEqual({
      independentPositionState: true,
      independentEquityAndTopUps: true,
      independentOpportunityChronology: true,
      lockedCohort: false,
    });
    expect(report.dataRange.overallSimulation).toBe(false);
    expect(report.segments.discovery.policies.P0_V4_CONTROL.trades).not.toBe(
      report.segments.discovery.policies.P1_HARD_STOP_2R.trades,
    );
    expect(report.frozenStrategy).toMatchObject({
      proximalEntryUnchanged: true,
      targetR: 2,
      structuralAnchorR: -1,
      p1HardStopR: -2,
      entryLiquidity: 'POST_ONLY_LIMIT_MAKER',
      targetLiquidity: 'REDUCE_ONLY_POST_ONLY_LIMIT_MAKER',
      hardStopLiquidity: 'TAKER',
    });
  });

  it('applies classification precedence without substituting a dominance metric', () => {
    expect(
      classifyHardStop2RProspective({
        foundationPassed: false,
        frequencyPassed: false,
        dominancePassed: false,
        grossEdgeBoth: false,
        netEdgeBoth: false,
      }),
    ).toBe('BTC_5M_SR_HARD_STOP_2R_PROSPECTIVE_FOUNDATION_REGRESSION');
    expect(
      classifyHardStop2RProspective({
        foundationPassed: true,
        frequencyPassed: false,
        dominancePassed: true,
        grossEdgeBoth: true,
        netEdgeBoth: true,
      }),
    ).toBe('BTC_5M_SR_HARD_STOP_2R_PROSPECTIVE_FREQUENCY_FAIL');
    expect(
      classifyHardStop2RProspective({
        foundationPassed: true,
        frequencyPassed: true,
        dominancePassed: false,
        grossEdgeBoth: true,
        netEdgeBoth: true,
      }),
    ).toBe('BTC_5M_SR_HARD_STOP_2R_PROSPECTIVE_DOES_NOT_DOMINATE_V4');
  });

  it('report-only fails closed without opening SQLite and reads the exact JSON path', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'prospective-report-'));
    expect(() => printExistingHardStop2RProspectiveReport(root)).toThrow('REPORT_NOT_FOUND');
    const output = path.join(root, 'data', 'btc_price_action');
    const report = buildHardStop2RProspectiveReport({
      candles: [],
      prebuilt5m: { bars: [], invalid5mBars: 0 },
      ...fees,
      leverageSource: 'TEST',
      feeSource: 'config/btc_eth_pair_v1.json',
    });
    mkdirSync(output, { recursive: true });
    writeFileSync(
      path.join(output, HardStop2RProspectiveReportFileName),
      JSON.stringify({
        ...report,
        performance: { loaded1mRows: 0, valid5mBars: 0, elapsedSeconds: 0 },
      }),
    );
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printExistingHardStop2RProspectiveReport(root);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
