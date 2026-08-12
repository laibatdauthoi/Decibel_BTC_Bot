import { describe, expect, it } from 'vitest';
import {
  analyzeMonotonicity,
  assignQuartile,
  buildBTC5MFailedBreakoutStructureDiagnostic,
  type bucket_metrics,
  type bucket_name,
} from '../src/btc_5m_failed_breakout_reversal_structure_diagnostic.js';
const campaign = (
  splitLabel: 'DISCOVERY' | 'HOLDOUT',
  value: number,
  outcome: 'TAKE_PROFIT' | 'STOP_LOSS' | 'ENTRY_FAILED',
  direction: 'LONG_BTC' | 'SHORT_BTC' = 'LONG_BTC',
) => ({
  splitLabel,
  outcome,
  tradeDirection: direction,
  minutesBreakoutToFailure: value,
  failureCloseDepthBps: value,
  minutesFailureToEntry: value,
  grossPnL: outcome === 'TAKE_PROFIT' ? 2 : outcome === 'STOP_LOSS' ? -1 : 0,
  netPnL: outcome === 'TAKE_PROFIT' ? 1.5 : outcome === 'STOP_LOSS' ? -1.5 : 0,
  totalFees: 0.5,
  holdingMinutes: 5,
});
function source(campaigns: ReturnType<typeof campaign>[]) {
  const complete = campaigns.filter(
      (c) => c.outcome === 'TAKE_PROFIT' || c.outcome === 'STOP_LOSS',
    ),
    hold = complete.filter((c) => c.splitLabel === 'HOLDOUT'),
    summary = (v: typeof complete) => {
      const gp = v.filter((c) => c.grossPnL > 0).reduce((s, c) => s + c.grossPnL, 0),
        gl = -v.filter((c) => c.grossPnL < 0).reduce((s, c) => s + c.grossPnL, 0),
        np = v.filter((c) => c.netPnL > 0).reduce((s, c) => s + c.netPnL, 0),
        nl = -v.filter((c) => c.netPnL < 0).reduce((s, c) => s + c.netPnL, 0);
      return {
        completedCampaignCount: v.length,
        grossProfitFactor: gp / gl,
        netProfitFactor: np / nl,
        grossPnLSum: gp - gl,
      };
    };
  return {
    experimentId: 'BTC_5M_FAILED_BREAKOUT_REVERSAL_5X_COST_V1',
    campaigns,
    overall: summary(complete),
    holdout: summary(hold),
  };
}
const increasing = () => {
  const rows: ReturnType<typeof campaign>[] = [];
  for (const split of ['DISCOVERY', 'HOLDOUT'] as const)
    for (let q = 1; q <= 4; q++) {
      const wins = 4 + q * 3,
        losses = 20 - wins;
      for (let i = 0; i < wins; i++)
        rows.push(campaign(split, q, 'TAKE_PROFIT', i % 2 ? 'LONG_BTC' : 'SHORT_BTC'));
      for (let i = 0; i < losses; i++)
        rows.push(campaign(split, q, 'STOP_LOSS', i % 2 ? 'LONG_BTC' : 'SHORT_BTC'));
    }
  return rows;
};
const emptyBucket = (pf: number): bucket_metrics => ({
  campaignCount: 1,
  takeProfitCount: 1,
  stopLossCount: 0,
  tpRate: 1,
  grossProfitSum: pf,
  grossLossSumAbs: 1,
  grossPnLSum: pf - 1,
  grossProfitFactor: pf,
  netProfitSum: pf,
  netLossSumAbs: 1,
  netPnLSum: pf - 1,
  netProfitFactor: pf,
  meanGrossPnL: 0,
  meanNetPnL: 0,
  meanTotalFees: 0,
  medianTotalFees: 0,
  meanHoldingMinutes: 0,
  medianHoldingMinutes: 0,
  minValue: 0,
  maxValue: 0,
  meanValue: 0,
  medianValue: 0,
  byDirection: {
    LONG_BTC: {
      campaignCount: 1,
      tpRate: 1,
      grossProfitFactor: pf,
      netProfitFactor: pf,
      grossPnLSum: 0,
      netPnLSum: 0,
    },
    SHORT_BTC: {
      campaignCount: 0,
      tpRate: 0,
      grossProfitFactor: null,
      netProfitFactor: null,
      grossPnLSum: 0,
      netPnLSum: 0,
    },
  },
});
describe('failed breakout structure diagnostic', () => {
  it('requires the exact source experiment and rejects inconsistent totals', () => {
    const valid = source(increasing());
    expect(() =>
      buildBTC5MFailedBreakoutStructureDiagnostic({ ...valid, experimentId: 'WRONG' }),
    ).toThrow('FAILED_BREAKOUT_SOURCE_EXPERIMENT_ID_MISMATCH');
    expect(() =>
      buildBTC5MFailedBreakoutStructureDiagnostic({
        ...valid,
        overall: { ...valid.overall, completedCampaignCount: 999 },
      }),
    ).toThrow('FAILED_BREAKOUT_SOURCE_TOTALS_INCONSISTENT');
  });
  it('uses only completed TP/SL records and preserves the source object read-only', () => {
    const rows = [...increasing(), campaign('DISCOVERY', 999, 'ENTRY_FAILED')],
      input = source(rows),
      before = JSON.stringify(input),
      report = buildBTC5MFailedBreakoutStructureDiagnostic(input);
    expect(report.sourceSummary.excludedCampaignCount).toBe(1);
    expect(report.failureSpeed.discovery.buckets.Q4.maxValue).toBe(4);
    expect(JSON.stringify(input)).toBe(before);
    expect(report.methodology.replay).toBe('NONE');
  });
  it('derives frozen cutpoints from DISCOVERY only and applies exact inclusive boundaries', () => {
    const rows = increasing(),
      first = buildBTC5MFailedBreakoutStructureDiagnostic(source(rows));
    rows
      .filter((c) => c.splitLabel === 'HOLDOUT')
      .forEach((c) => {
        c.minutesBreakoutToFailure += 100;
      });
    const second = buildBTC5MFailedBreakoutStructureDiagnostic(source(rows));
    expect(second.failureSpeed.discoveryCutpoints).toEqual(first.failureSpeed.discoveryCutpoints);
    const c = { q25: 1, q50: 2, q75: 3 };
    expect([1, 2, 3, 4].map((v) => assignQuartile(v, c))).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });
  it('keeps duplicate quantiles and detects insufficient bucket resolution', () => {
    const rows = increasing().map((c) => ({ ...c, minutesFailureToEntry: 1 })),
      report = buildBTC5MFailedBreakoutStructureDiagnostic(source(rows));
    expect(report.entryDelay.discoveryCutpoints).toEqual({ q25: 1, q50: 1, q75: 1 });
    expect(report.entryDelay.distinctCutpointCount).toBe(1);
    expect(report.entryDelay.discoveryDirection).toBe('DISCOVERY_INSUFFICIENT');
    expect(report.entryDelay.relationshipClassification).toBe('NO_STABLE_MONOTONIC_RELATION');
  });
  it('aggregates gross/net PF exactly and detects increasing, decreasing, and zig-zag sequences', () => {
    const report = buildBTC5MFailedBreakoutStructureDiagnostic(source(increasing()));
    expect(report.failureSpeed.discovery.buckets.Q1.grossProfitFactor).toBeCloseTo((7 * 2) / 13);
    expect(report.failureSpeed.discovery.buckets.Q1.netProfitFactor).toBeCloseTo(
      (7 * 1.5) / (13 * 1.5),
    );
    const make = (v: number[]) =>
      Object.fromEntries(
        (['Q1', 'Q2', 'Q3', 'Q4'] as bucket_name[]).map((q, i) => [q, emptyBucket(v[i]!)]),
      ) as Record<bucket_name, bucket_metrics>;
    expect(analyzeMonotonicity(make([1, 2, 3, 4])).positiveAdjacentStepCount).toBe(3);
    expect(analyzeMonotonicity(make([4, 3, 2, 1])).negativeAdjacentStepCount).toBe(3);
    const zig = analyzeMonotonicity(make([1, 3, 2, 4]));
    expect(zig.positiveAdjacentStepCount).toBe(2);
    expect(zig.negativeAdjacentStepCount).toBe(1);
  });
  it('freezes discovery direction, requires holdout replication and twenty samples per usable bucket', () => {
    const stable = buildBTC5MFailedBreakoutStructureDiagnostic(source(increasing()));
    expect(stable.failureSpeed.discoveryDirection).toBe('DISCOVERY_INCREASING');
    expect(stable.failureSpeed.holdoutDirection).toBe('HOLDOUT_INCREASING');
    expect(stable.failureSpeed.directionReplicated).toBe(true);
    expect(stable.failureSpeed.sampleAdequate).toBe(true);
    expect(stable.failureSpeed.candidateExtremeBucket).toBe('Q4');
    expect(stable.failureSpeed.relationshipClassification).toBe('STABLE_MONOTONIC_RELATION');
    const sparse = increasing().filter((c, i) => c.splitLabel === 'DISCOVERY' || i % 2 === 0),
      result = buildBTC5MFailedBreakoutStructureDiagnostic(source(sparse));
    expect(result.failureSpeed.sampleAdequate).toBe(false);
    expect(result.failureSpeed.relationshipClassification).toBe('NO_STABLE_MONOTONIC_RELATION');
  });
  it('reports exact stable predictors and final classification without interactions', () => {
    const report = buildBTC5MFailedBreakoutStructureDiagnostic(source(increasing()));
    expect(report.stablePredictors).toEqual(['FAILURE_SPEED', 'FAILURE_DEPTH', 'ENTRY_DELAY']);
    expect(report.classification).toBe('FAILED_BREAKOUT_STRUCTURE_HAS_REPLICATED_MONOTONIC_SIGNAL');
    expect(report).not.toHaveProperty('interactions');
    expect(
      report.failureSpeed.holdout.buckets.Q4.byDirection.LONG_BTC.campaignCount,
    ).toBeGreaterThan(0);
  });
});
