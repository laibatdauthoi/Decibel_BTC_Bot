export const BTC5MFailedBreakoutStructureDiagnostic = {
  diagnosticId: 'BTC_5M_FAILED_BREAKOUT_REVERSAL_STRUCTURE_DIAGNOSTIC_V1' as const,
  sourceExperimentId: 'BTC_5M_FAILED_BREAKOUT_REVERSAL_5X_COST_V1' as const,
};
type split_label = 'DISCOVERY' | 'HOLDOUT';
type direction = 'LONG_BTC' | 'SHORT_BTC';
type source_campaign = {
  splitLabel: split_label;
  outcome: string;
  tradeDirection: direction;
  minutesBreakoutToFailure: number | null;
  failureCloseDepthBps: number | null;
  minutesFailureToEntry: number | null;
  grossPnL: number;
  netPnL: number;
  totalFees: number;
  holdingMinutes: number | null;
};
type profit_factor = number | 'POSITIVE_INFINITY' | null;
export type bucket_name = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type bucket_metrics = {
  campaignCount: number;
  takeProfitCount: number;
  stopLossCount: number;
  tpRate: number;
  grossProfitSum: number;
  grossLossSumAbs: number;
  grossPnLSum: number;
  grossProfitFactor: profit_factor;
  netProfitSum: number;
  netLossSumAbs: number;
  netPnLSum: number;
  netProfitFactor: profit_factor;
  meanGrossPnL: number | null;
  meanNetPnL: number | null;
  meanTotalFees: number | null;
  medianTotalFees: number | null;
  meanHoldingMinutes: number | null;
  medianHoldingMinutes: number | null;
  minValue: number | null;
  maxValue: number | null;
  meanValue: number | null;
  medianValue: number | null;
  byDirection: Record<
    direction,
    {
      campaignCount: number;
      tpRate: number;
      grossProfitFactor: profit_factor;
      netProfitFactor: profit_factor;
      grossPnLSum: number;
      netPnLSum: number;
    }
  >;
};
type monotonicity = {
  usableBucketCount: number;
  adjacentComparisonCount: number;
  positiveAdjacentStepCount: number;
  negativeAdjacentStepCount: number;
  flatAdjacentStepCount: number;
  increasingStepRate: number;
  decreasingStepRate: number;
  spearmanGrossPf: number | null;
};
type bucket_split = {
  buckets: Record<bucket_name, bucket_metrics>;
  emptyBucketCount: number;
  nonEmptyBucketCount: number;
  monotonicity: monotonicity;
};
type discovery_direction =
  | 'DISCOVERY_INCREASING'
  | 'DISCOVERY_DECREASING'
  | 'DISCOVERY_NON_MONOTONIC'
  | 'DISCOVERY_INSUFFICIENT';
type holdout_direction =
  'HOLDOUT_INCREASING' | 'HOLDOUT_DECREASING' | 'HOLDOUT_NON_MONOTONIC' | 'HOLDOUT_INSUFFICIENT';
export type predictor_report = {
  field: 'minutesBreakoutToFailure' | 'failureCloseDepthBps' | 'minutesFailureToEntry';
  discoveryCutpoints: { q25: number; q50: number; q75: number };
  distinctCutpointCount: number;
  discovery: bucket_split;
  holdout: bucket_split;
  discoveryDirection: discovery_direction;
  holdoutDirection: holdout_direction;
  directionReplicated: boolean;
  sampleAdequate: boolean;
  candidateExtremeBucket: bucket_name | null;
  candidateExtremeCampaignCount: number;
  candidateExtremeTpRate: number | null;
  candidateExtremeGrossProfitFactor: profit_factor;
  candidateExtremeNetProfitFactor: profit_factor;
  candidateExtremeGrossPnLSum: number | null;
  candidateExtremeNetPnLSum: number | null;
  relationshipClassification: 'STABLE_MONOTONIC_RELATION' | 'NO_STABLE_MONOTONIC_RELATION';
};
export type structure_diagnostic_report = {
  diagnosticId: typeof BTC5MFailedBreakoutStructureDiagnostic.diagnosticId;
  sourceExperimentId: typeof BTC5MFailedBreakoutStructureDiagnostic.sourceExperimentId;
  sourceArtifact: string;
  sourceConsistency: true;
  sourceSummary: {
    sourceCompletedCampaignCount: number;
    sourceHoldoutCompletedCampaignCount: number;
    sourceOverallGrossProfitFactor: number | null;
    sourceHoldoutGrossProfitFactor: number | null;
    sourceOverallNetProfitFactor: number | null;
    sourceHoldoutNetProfitFactor: number | null;
    sourceOverallGrossPnLSum: number;
    sourceHoldoutGrossPnLSum: number;
    excludedCampaignCount: number;
  };
  methodology: Record<string, string>;
  failureSpeed: predictor_report;
  failureDepth: predictor_report;
  entryDelay: predictor_report;
  stablePredictors: Array<'FAILURE_SPEED' | 'FAILURE_DEPTH' | 'ENTRY_DELAY'>;
  classification:
    | 'FAILED_BREAKOUT_STRUCTURE_HAS_REPLICATED_MONOTONIC_SIGNAL'
    | 'NO_REPLICATED_FAILED_BREAKOUT_STRUCTURE_FOUND';
};
const names: bucket_name[] = ['Q1', 'Q2', 'Q3', 'Q4'];
const mean = (v: readonly number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
const percentile = (v: readonly number[], p: number) => {
  if (!v.length) throw new Error('INSUFFICIENT_DISCOVERY_PREDICTOR_VALUES');
  const x = [...v].sort((a, b) => a - b);
  return x[Math.floor((x.length - 1) * p)]!;
};
const median = (v: readonly number[]) => (v.length ? percentile(v, 0.5) : null);
const pf = (profit: number, loss: number, count: number): profit_factor =>
  count === 0 ? null : loss > 0 ? profit / loss : profit > 0 ? 'POSITIVE_INFINITY' : null;
export function assignQuartile(
  value: number,
  c: { q25: number; q50: number; q75: number },
): bucket_name {
  return value <= c.q25 ? 'Q1' : value <= c.q50 ? 'Q2' : value <= c.q75 ? 'Q3' : 'Q4';
}
function metrics(rows: readonly { campaign: source_campaign; value: number }[]): bucket_metrics {
  const cs = rows.map((x) => x.campaign),
    values = rows.map((x) => x.value),
    gp = cs.filter((x) => x.grossPnL > 0).reduce((s, x) => s + x.grossPnL, 0),
    gl = -cs.filter((x) => x.grossPnL < 0).reduce((s, x) => s + x.grossPnL, 0),
    np = cs.filter((x) => x.netPnL > 0).reduce((s, x) => s + x.netPnL, 0),
    nl = -cs.filter((x) => x.netPnL < 0).reduce((s, x) => s + x.netPnL, 0),
    tp = cs.filter((x) => x.outcome === 'TAKE_PROFIT').length;
  const directional = (d: direction) => {
    const x = rows.filter((r) => r.campaign.tradeDirection === d),
      c = x.map((r) => r.campaign),
      G = c.filter((v) => v.grossPnL > 0).reduce((s, v) => s + v.grossPnL, 0),
      L = -c.filter((v) => v.grossPnL < 0).reduce((s, v) => s + v.grossPnL, 0),
      N = c.filter((v) => v.netPnL > 0).reduce((s, v) => s + v.netPnL, 0),
      NL = -c.filter((v) => v.netPnL < 0).reduce((s, v) => s + v.netPnL, 0);
    return {
      campaignCount: c.length,
      tpRate: c.length ? c.filter((v) => v.outcome === 'TAKE_PROFIT').length / c.length : 0,
      grossProfitFactor: pf(G, L, c.length),
      netProfitFactor: pf(N, NL, c.length),
      grossPnLSum: G - L,
      netPnLSum: N - NL,
    };
  };
  return {
    campaignCount: cs.length,
    takeProfitCount: tp,
    stopLossCount: cs.filter((x) => x.outcome === 'STOP_LOSS').length,
    tpRate: cs.length ? tp / cs.length : 0,
    grossProfitSum: gp,
    grossLossSumAbs: gl,
    grossPnLSum: gp - gl,
    grossProfitFactor: pf(gp, gl, cs.length),
    netProfitSum: np,
    netLossSumAbs: nl,
    netPnLSum: np - nl,
    netProfitFactor: pf(np, nl, cs.length),
    meanGrossPnL: mean(cs.map((x) => x.grossPnL)),
    meanNetPnL: mean(cs.map((x) => x.netPnL)),
    meanTotalFees: mean(cs.map((x) => x.totalFees)),
    medianTotalFees: median(cs.map((x) => x.totalFees)),
    meanHoldingMinutes: mean(
      cs.flatMap((x) => (x.holdingMinutes === null ? [] : [x.holdingMinutes])),
    ),
    medianHoldingMinutes: median(
      cs.flatMap((x) => (x.holdingMinutes === null ? [] : [x.holdingMinutes])),
    ),
    minValue: values.length ? Math.min(...values) : null,
    maxValue: values.length ? Math.max(...values) : null,
    meanValue: mean(values),
    medianValue: median(values),
    byDirection: { LONG_BTC: directional('LONG_BTC'), SHORT_BTC: directional('SHORT_BTC') },
  };
}
export function analyzeMonotonicity(b: Record<bucket_name, bucket_metrics>): monotonicity {
  const usable = names.flatMap((name, index) => {
      const v = b[name].grossProfitFactor;
      return b[name].campaignCount && typeof v === 'number' && Number.isFinite(v)
        ? [{ index, value: v }]
        : [];
    }),
    steps = usable.slice(1).map((x, i) => x.value - usable[i]!.value),
    pos = steps.filter((x) => x > 0).length,
    neg = steps.filter((x) => x < 0).length,
    flat = steps.filter((x) => x === 0).length;
  let spear: number | null = null;
  if (usable.length >= 2) {
    const mx = mean(usable.map((x) => x.index))!,
      my = mean(usable.map((x) => x.value))!,
      num = usable.reduce((s, x) => s + (x.index - mx) * (x.value - my), 0),
      dx = Math.sqrt(usable.reduce((s, x) => s + (x.index - mx) ** 2, 0)),
      dy = Math.sqrt(usable.reduce((s, x) => s + (x.value - my) ** 2, 0));
    spear = dx && dy ? num / (dx * dy) : 0;
  }
  return {
    usableBucketCount: usable.length,
    adjacentComparisonCount: steps.length,
    positiveAdjacentStepCount: pos,
    negativeAdjacentStepCount: neg,
    flatAdjacentStepCount: flat,
    increasingStepRate: steps.length ? pos / steps.length : 0,
    decreasingStepRate: steps.length ? neg / steps.length : 0,
    spearmanGrossPf: spear,
  };
}
function splitBuckets(
  rows: readonly { campaign: source_campaign; value: number }[],
  cut: { q25: number; q50: number; q75: number },
): bucket_split {
  const buckets = Object.fromEntries(
      names.map((n) => [n, metrics(rows.filter((x) => assignQuartile(x.value, cut) === n))]),
    ) as Record<bucket_name, bucket_metrics>,
    empty = names.filter((n) => !buckets[n].campaignCount).length;
  return {
    buckets,
    emptyBucketCount: empty,
    nonEmptyBucketCount: 4 - empty,
    monotonicity: analyzeMonotonicity(buckets),
  };
}
function predictor(
  campaigns: readonly source_campaign[],
  field: predictor_report['field'],
): predictor_report {
  const rows = campaigns.flatMap((c) => {
      const v = c[field];
      return typeof v === 'number' && Number.isFinite(v) ? [{ campaign: c, value: v }] : [];
    }),
    drows = rows.filter((x) => x.campaign.splitLabel === 'DISCOVERY'),
    hrows = rows.filter((x) => x.campaign.splitLabel === 'HOLDOUT'),
    cut = {
      q25: percentile(
        drows.map((x) => x.value),
        0.25,
      ),
      q50: percentile(
        drows.map((x) => x.value),
        0.5,
      ),
      q75: percentile(
        drows.map((x) => x.value),
        0.75,
      ),
    },
    d = splitBuckets(drows, cut),
    h = splitBuckets(hrows, cut),
    distinct = new Set(Object.values(cut)).size,
    dm = d.monotonicity;
  const dd: discovery_direction =
      d.nonEmptyBucketCount < 3
        ? 'DISCOVERY_INSUFFICIENT'
        : dm.adjacentComparisonCount > 0 &&
            dm.negativeAdjacentStepCount === 0 &&
            dm.positiveAdjacentStepCount > 0
          ? 'DISCOVERY_INCREASING'
          : dm.adjacentComparisonCount > 0 &&
              dm.positiveAdjacentStepCount === 0 &&
              dm.negativeAdjacentStepCount > 0
            ? 'DISCOVERY_DECREASING'
            : 'DISCOVERY_NON_MONOTONIC',
    hm = h.monotonicity,
    hd: holdout_direction =
      h.nonEmptyBucketCount < 3
        ? 'HOLDOUT_INSUFFICIENT'
        : hm.adjacentComparisonCount > 0 &&
            hm.negativeAdjacentStepCount === 0 &&
            hm.positiveAdjacentStepCount > 0
          ? 'HOLDOUT_INCREASING'
          : hm.adjacentComparisonCount > 0 &&
              hm.positiveAdjacentStepCount === 0 &&
              hm.negativeAdjacentStepCount > 0
            ? 'HOLDOUT_DECREASING'
            : 'HOLDOUT_NON_MONOTONIC',
    rep =
      (dd === 'DISCOVERY_INCREASING' && hd === 'HOLDOUT_INCREASING') ||
      (dd === 'DISCOVERY_DECREASING' && hd === 'HOLDOUT_DECREASING'),
    adequate =
      d.nonEmptyBucketCount >= 3 &&
      h.nonEmptyBucketCount >= 3 &&
      names
        .filter((n) => h.buckets[n].campaignCount > 0)
        .every((n) => h.buckets[n].campaignCount >= 20),
    ext: bucket_name | null =
      dd === 'DISCOVERY_INCREASING' ? 'Q4' : dd === 'DISCOVERY_DECREASING' ? 'Q1' : null,
    e = ext ? h.buckets[ext] : null,
    stable =
      adequate &&
      rep &&
      e !== null &&
      e.campaignCount >= 20 &&
      typeof e.grossProfitFactor === 'number' &&
      e.grossProfitFactor >= 1;
  return {
    field,
    discoveryCutpoints: cut,
    distinctCutpointCount: distinct,
    discovery: d,
    holdout: h,
    discoveryDirection: dd,
    holdoutDirection: hd,
    directionReplicated: rep,
    sampleAdequate: adequate,
    candidateExtremeBucket: ext,
    candidateExtremeCampaignCount: e?.campaignCount ?? 0,
    candidateExtremeTpRate: e?.tpRate ?? null,
    candidateExtremeGrossProfitFactor: e?.grossProfitFactor ?? null,
    candidateExtremeNetProfitFactor: e?.netProfitFactor ?? null,
    candidateExtremeGrossPnLSum: e?.grossPnLSum ?? null,
    candidateExtremeNetPnLSum: e?.netPnLSum ?? null,
    relationshipClassification: stable
      ? 'STABLE_MONOTONIC_RELATION'
      : 'NO_STABLE_MONOTONIC_RELATION',
  };
}
function finite(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`INVALID_SOURCE_FIELD:${name}`);
  return v;
}
const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
export function buildBTC5MFailedBreakoutStructureDiagnostic(
  source: unknown,
  sourceArtifact = 'data/btc_price_action/btc_5m_failed_breakout_reversal_5x_cost_v1.json',
): structure_diagnostic_report {
  if (typeof source !== 'object' || source === null)
    throw new Error('FAILED_BREAKOUT_SOURCE_INVALID');
  const root = source as Record<string, unknown>;
  if (root.experimentId !== BTC5MFailedBreakoutStructureDiagnostic.sourceExperimentId)
    throw new Error('FAILED_BREAKOUT_SOURCE_EXPERIMENT_ID_MISMATCH');
  if (
    !Array.isArray(root.campaigns) ||
    typeof root.overall !== 'object' ||
    root.overall === null ||
    typeof root.holdout !== 'object' ||
    root.holdout === null
  )
    throw new Error('FAILED_BREAKOUT_SOURCE_INVALID');
  const campaigns = (root.campaigns as unknown[]).map((v, i) => {
      if (typeof v !== 'object' || v === null) throw new Error(`INVALID_SOURCE_CAMPAIGN:${i}`);
      const c = v as Record<string, unknown>;
      if (c.splitLabel !== 'DISCOVERY' && c.splitLabel !== 'HOLDOUT')
        throw new Error(`INVALID_SOURCE_SPLIT:${i}`);
      return c as unknown as source_campaign;
    }),
    completed = campaigns.filter((c) => c.outcome === 'TAKE_PROFIT' || c.outcome === 'STOP_LOSS'),
    hold = completed.filter((c) => c.splitLabel === 'HOLDOUT'),
    summary = (v: readonly source_campaign[]) => {
      const gp = v.filter((x) => x.grossPnL > 0).reduce((s, x) => s + x.grossPnL, 0),
        gl = -v.filter((x) => x.grossPnL < 0).reduce((s, x) => s + x.grossPnL, 0),
        np = v.filter((x) => x.netPnL > 0).reduce((s, x) => s + x.netPnL, 0),
        nl = -v.filter((x) => x.netPnL < 0).reduce((s, x) => s + x.netPnL, 0);
      return {
        count: v.length,
        gross: gp - gl,
        gpf: gl ? gp / gl : null,
        npf: nl ? np / nl : null,
      };
    },
    a = summary(completed),
    h = summary(hold),
    overall = root.overall as Record<string, unknown>,
    hs = root.holdout as Record<string, unknown>;
  const consistent =
    finite(overall.completedCampaignCount, 'overall.completedCampaignCount') === a.count &&
    finite(hs.completedCampaignCount, 'holdout.completedCampaignCount') === h.count &&
    close(finite(overall.grossPnLSum, 'overall.grossPnLSum'), a.gross) &&
    close(finite(hs.grossPnLSum, 'holdout.grossPnLSum'), h.gross);
  if (!consistent) throw new Error('FAILED_BREAKOUT_SOURCE_TOTALS_INCONSISTENT');
  const failureSpeed = predictor(completed, 'minutesBreakoutToFailure'),
    failureDepth = predictor(completed, 'failureCloseDepthBps'),
    entryDelay = predictor(completed, 'minutesFailureToEntry'),
    stablePredictors: Array<'FAILURE_SPEED' | 'FAILURE_DEPTH' | 'ENTRY_DELAY'> = [];
  if (failureSpeed.relationshipClassification === 'STABLE_MONOTONIC_RELATION')
    stablePredictors.push('FAILURE_SPEED');
  if (failureDepth.relationshipClassification === 'STABLE_MONOTONIC_RELATION')
    stablePredictors.push('FAILURE_DEPTH');
  if (entryDelay.relationshipClassification === 'STABLE_MONOTONIC_RELATION')
    stablePredictors.push('ENTRY_DELAY');
  return {
    diagnosticId: BTC5MFailedBreakoutStructureDiagnostic.diagnosticId,
    sourceExperimentId: BTC5MFailedBreakoutStructureDiagnostic.sourceExperimentId,
    sourceArtifact,
    sourceConsistency: true,
    sourceSummary: {
      sourceCompletedCampaignCount: a.count,
      sourceHoldoutCompletedCampaignCount: h.count,
      sourceOverallGrossProfitFactor: finite(
        overall.grossProfitFactor,
        'overall.grossProfitFactor',
      ),
      sourceHoldoutGrossProfitFactor: finite(hs.grossProfitFactor, 'holdout.grossProfitFactor'),
      sourceOverallNetProfitFactor: finite(overall.netProfitFactor, 'overall.netProfitFactor'),
      sourceHoldoutNetProfitFactor: finite(hs.netProfitFactor, 'holdout.netProfitFactor'),
      sourceOverallGrossPnLSum: a.gross,
      sourceHoldoutGrossPnLSum: h.gross,
      excludedCampaignCount: campaigns.length - completed.length,
    },
    methodology: {
      sample: 'COMPLETED_TAKE_PROFIT_OR_STOP_LOSS_ONLY',
      cutpoints: 'DISCOVERY_ONLY_Q25_Q50_Q75_FROZEN_FOR_HOLDOUT',
      interactions: 'NONE',
      replay: 'NONE',
    },
    failureSpeed,
    failureDepth,
    entryDelay,
    stablePredictors,
    classification: stablePredictors.length
      ? 'FAILED_BREAKOUT_STRUCTURE_HAS_REPLICATED_MONOTONIC_SIGNAL'
      : 'NO_REPLICATED_FAILED_BREAKOUT_STRUCTURE_FOUND',
  };
}


