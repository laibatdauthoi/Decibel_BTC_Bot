import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { price_candle } from '../src/btc_bybit_decibel_overlap_audit.js';
import {
  classifyAnchorPath,
  getAnchorCoordinateR,
  StructuralAnchorHardStopRules,
  summarizeAnchorDistribution,
  touchesAnchor,
  type frozen_anchor_trade,
} from '../src/btc_5m_sr_v4_structural_anchor_hard_stop_feasibility_diagnostic.js';
import {
  printExistingStructuralAnchorHardStopReport,
  StructuralAnchorHardStopReportFileName,
} from '../src/btc_5m_sr_v4_structural_anchor_hard_stop_feasibility_diagnostic_command.js';

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

const trade = (
  direction: 'LONG' | 'SHORT' = 'LONG',
  outcome: frozen_anchor_trade['baselineOutcome'] = 'TAKE_PROFIT',
): frozen_anchor_trade => ({
  tradeId: 'trade-1',
  segment: 'DISCOVERY',
  direction,
  entryFill1mTimestamp: 0,
  entryPrice: 100,
  structuralAnchor: direction === 'LONG' ? 99 : 101,
  rPrice: 1,
  baselineTargetPrice: direction === 'LONG' ? 102 : 98,
  baselineEmergencyPrice: direction === 'LONG' ? 89 : 111,
  actualNotionalUsd: 100,
  actualGrossRiskUsd: 2,
  baselineOutcome: outcome,
  baselineInvalidationTimestamp: outcome === 'NORMAL_INVALIDATION' ? 5 * minute : null,
  baselineExitTimestamp: 6 * minute,
  baselineExitPrice: direction === 'LONG' ? 98 : 102,
  baselineGrossR: outcome === 'TAKE_PROFIT' ? 2 : -2,
  baselineNetR: outcome === 'TAKE_PROFIT' ? 1.9 : -2.1,
  baselineGrossPnlUsd: outcome === 'TAKE_PROFIT' ? 4 : -4,
  baselineNetPnlUsd: outcome === 'TAKE_PROFIT' ? 3.8 : -4.2,
});

describe('BTC 5M SR V4 structural-anchor hard-stop feasibility diagnostic V1', () => {
  it('freezes the exact cohort and economics checksums and exact -1R anchor geometry', () => {
    expect(StructuralAnchorHardStopRules.expected.DISCOVERY).toMatchObject({
      completedTradeCount: 7060,
      takeProfitCount: 3160,
      normalInvalidationCount: 3800,
      emergencyStopCount: 100,
      meanGrossR: -0.34637171309843406,
      totalNetPnlUsd: -539.202734254158,
    });
    expect(StructuralAnchorHardStopRules.expected.LATE_DEVELOPMENT).toMatchObject({
      completedTradeCount: 4189,
      takeProfitCount: 1912,
      normalInvalidationCount: 2249,
      emergencyStopCount: 28,
      meanNetR: -0.7469557056243191,
      netProfitFactor: 0.5050435543405921,
    });
    expect(getAnchorCoordinateR(trade('LONG'))).toBe(1);
    expect(getAnchorCoordinateR(trade('SHORT'))).toBe(1);
  });

  it('uses inclusive adverse-price touch for LONG and SHORT', () => {
    expect(touchesAnchor('LONG', { low: 99, high: 100 }, 99)).toBe(true);
    expect(touchesAnchor('LONG', { low: 99.01, high: 101 }, 99)).toBe(false);
    expect(touchesAnchor('SHORT', { low: 100, high: 101 }, 101)).toBe(true);
    expect(touchesAnchor('SHORT', { low: 99, high: 100.99 }, 101)).toBe(false);
  });

  it('observes a same-entry-minute anchor touch after the valid POST_ONLY entry', () => {
    const result = classifyAnchorPath(trade('LONG'), [
      candle(0, 101, 101.5, 98.9),
      candle(6 * minute, 102, 102, 102),
    ]);
    expect(result.firstAnchorTouchTimestamp).toBe(0);
    expect(result.firstEventClassification).toBe('ANCHOR_BEFORE_TP');
  });

  it('classifies TP-before-anchor, anchor-before-TP, and same-minute ambiguity without forcing order', () => {
    const base = trade('LONG');
    expect(
      classifyAnchorPath(base, [candle(0, 100, 102, 99.5), candle(minute, 100, 101, 99)])
        .firstEventClassification,
    ).toBe('TP_BEFORE_ANCHOR');
    expect(
      classifyAnchorPath(base, [candle(0, 100, 101, 99), candle(minute, 100, 102, 99.5)])
        .firstEventClassification,
    ).toBe('ANCHOR_BEFORE_TP');
    expect(classifyAnchorPath(base, [candle(0, 100, 102, 99)]).firstEventClassification).toBe(
      'TP_ANCHOR_SAME_1M_AMBIGUOUS',
    );
  });

  it('classifies normal and emergency loser anchor chronology exactly', () => {
    const normal = classifyAnchorPath(trade('LONG', 'NORMAL_INVALIDATION'), [
      candle(0, 100, 100.5, 99),
      candle(6 * minute, 98, 98, 98),
    ]);
    expect(normal.firstEventClassification).toBe('ANCHOR_BEFORE_BASELINE_EXIT');
    expect(normal.minutesFromAnchorTouchToInvalidation).toBe(5);
    expect(normal.minutesFromAnchorTouchToBaselineExit).toBe(6);
    expect(normal.completed5mBarsFromAnchorTouchToInvalidation).toBe(1);
    const emergency = classifyAnchorPath(trade('SHORT', 'EMERGENCY_STOP'), [
      candle(0, 100, 100, 99),
      candle(6 * minute, 102, 102, 102),
    ]);
    expect(emergency.firstEventClassification).toBe('ANCHOR_AND_EXIT_SAME_1M');
  });

  it('computes LONG and SHORT recovering-winner adverse excursion beyond anchor', () => {
    const long = classifyAnchorPath(trade('LONG'), [
      candle(0, 100, 100, 98.5),
      candle(minute, 100, 102, 99),
    ]);
    const short = classifyAnchorPath(trade('SHORT'), [
      candle(0, 100, 101.5, 100),
      candle(minute, 100, 101, 98),
    ]);
    expect(long.maximumAdverseExcursionBeyondAnchorR).toBe(0.5);
    expect(short.maximumAdverseExcursionBeyondAnchorR).toBe(0.5);
  });

  it('calculates exact loser saving, winner cost, USD proxy, and no fee/slippage simulation', () => {
    const loser = classifyAnchorPath(trade('LONG', 'NORMAL_INVALIDATION'), [
      candle(0, 100, 100, 99),
      candle(6 * minute, 98, 98, 98),
    ]);
    const winner = classifyAnchorPath(trade('LONG'), [
      candle(0, 100, 100, 99),
      candle(minute, 100, 102, 99),
    ]);
    expect(loser.baselineGrossLossBeyondAnchorR).toBe(1);
    expect(loser.decisiveLoserGrossRSaved).toBe(1);
    expect(loser.decisiveGrossUsdProxy).toBe(2);
    expect(winner.decisiveWinnerGrossRLost).toBe(3);
    expect(winner.decisiveGrossUsdProxy).toBe(-6);
    expect(Object.keys(winner)).not.toContain('candidateExitPrice');
    expect(Object.keys(winner)).not.toContain('candidateNetPnlUsd');
  });

  it('calculates deterministic distributions used by ambiguity and break-even summaries', () => {
    expect(summarizeAnchorDistribution([1, 2, 3, 4])).toEqual({
      mean: 2.5,
      median: 2.5,
      p10: 1.3,
      p25: 1.75,
      p75: 3.25,
      p90: 3.7,
    });
  });

  it('supports report-only with zero SQLite access and concise output', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'anchor-report-'));
    const directory = path.join(root, 'data', 'btc_price_action');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, StructuralAnchorHardStopReportFileName),
      JSON.stringify({
        sourceChecks: { foundationPassed: true },
        classification: 'X',
        consistency: {},
        performance: { loaded1mRows: 1, elapsedSeconds: 1 },
        segments: {
          discovery: {
            foundation: { anchorRMatch: true },
            summaries: {
              ALL: {
                winners: {},
                losers: {},
                normalInvalidation: {},
                recoveringWinners: {},
                lossExpansion: {},
                frictionlessProxy: { optimisticNetGrossRProxy: 1, pessimisticNetGrossRProxy: 1 },
                breakEvenFalseStop: {},
              },
            },
          },
          lateDevelopment: {
            foundation: { anchorRMatch: true },
            summaries: {
              ALL: {
                winners: {},
                losers: {},
                normalInvalidation: {},
                recoveringWinners: {},
                lossExpansion: {},
                frictionlessProxy: { optimisticNetGrossRProxy: 1, pessimisticNetGrossRProxy: 1 },
                breakEvenFalseStop: {},
              },
            },
          },
        },
      }),
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printExistingStructuralAnchorHardStopReport(root);
    expect(log.mock.calls.some(([label]) => label === 'CLASSIFICATION')).toBe(true);
    log.mockRestore();
  });
});
