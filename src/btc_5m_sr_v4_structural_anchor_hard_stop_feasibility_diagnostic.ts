import type { price_candle } from './btc_bybit_decibel_overlap_audit.js';
import type { trade_side } from './btc_5m_confirmed_swing_sr_zone_limit_state_machine.js';
import type { full_structure_risk_trade } from './btc_5m_sr_rejection_retest_full_structure_risk_2r_v4.js';
import type {
  diagnostic_segment,
  post_entry_trade_diagnostic,
} from './btc_5m_sr_v4_post_entry_path_diagnostic.js';

const minute = 60_000;
const fiveMinutes = 5 * minute;
const tolerance = 1e-9;

export const StructuralAnchorHardStopRules = {
  experimentId: 'BTC_5M_SR_V4_STRUCTURAL_ANCHOR_HARD_STOP_FEASIBILITY_DIAGNOSTIC_V1' as const,
  referenceExperimentId: 'BTC_5M_SR_REJECTION_RETEST_FULL_STRUCTURE_RISK_2R_V4' as const,
  proxyLabel: 'FRICTIONLESS_EXACT_ANCHOR_FILL_PROXY_ONLY' as const,
  foundationFailure: 'BTC_5M_SR_STRUCTURAL_ANCHOR_STOP_DIAGNOSTIC_FOUNDATION_REGRESSION' as const,
  expected: {
    DISCOVERY: {
      completedTradeCount: 7060,
      takeProfitCount: 3160,
      normalInvalidationCount: 3800,
      emergencyStopCount: 100,
      meanGrossR: -0.34637171309843406,
      meanNetR: -0.7082785613789999,
      grossRProfitFactor: 0.72151565713062,
      netRProfitFactor: 0.5271915438052596,
      totalNetPnlUsd: -539.202734254158,
      netProfitFactor: 0.5303313514551756,
    },
    LATE_DEVELOPMENT: {
      completedTradeCount: 4189,
      takeProfitCount: 1912,
      normalInvalidationCount: 2249,
      emergencyStopCount: 28,
      meanGrossR: -0.22675489376963345,
      meanNetR: -0.7469557056243191,
      grossRProfitFactor: 0.8012678542059599,
      netRProfitFactor: 0.5009975686606005,
      totalNetPnlUsd: -337.3837168281302,
      netProfitFactor: 0.5050435543405921,
    },
  },
};

export type anchor_first_event =
  | 'TP_BEFORE_ANCHOR'
  | 'ANCHOR_BEFORE_TP'
  | 'TP_ANCHOR_SAME_1M_AMBIGUOUS'
  | 'ANCHOR_BEFORE_BASELINE_EXIT'
  | 'ANCHOR_NOT_TOUCHED_BEFORE_BASELINE_EXIT'
  | 'ANCHOR_AND_EXIT_SAME_1M';

export type frozen_anchor_trade = {
  tradeId: string;
  segment: diagnostic_segment;
  direction: trade_side;
  entryFill1mTimestamp: number;
  entryPrice: number;
  structuralAnchor: number;
  rPrice: number;
  baselineTargetPrice: number;
  baselineEmergencyPrice: number;
  actualNotionalUsd: number;
  actualGrossRiskUsd: number;
  baselineOutcome: 'TAKE_PROFIT' | 'NORMAL_INVALIDATION' | 'EMERGENCY_STOP';
  baselineInvalidationTimestamp: number | null;
  baselineExitTimestamp: number;
  baselineExitPrice: number;
  baselineGrossR: number;
  baselineNetR: number;
  baselineGrossPnlUsd: number;
  baselineNetPnlUsd: number;
};

export type anchor_trade_diagnostic = frozen_anchor_trade & {
  hardStopLevel: number;
  anchorCoordinateR: number;
  firstAnchorTouchTimestamp: number | null;
  firstTpTouchTimestamp: number | null;
  firstEventClassification: anchor_first_event;
  minutesFromAnchorTouchToInvalidation: number | null;
  minutesFromAnchorTouchToBaselineExit: number | null;
  completed5mBarsFromAnchorTouchToInvalidation: number | null;
  maximumAdverseExcursionBeyondAnchorR: number | null;
  baselineGrossLossBeyondAnchorR: number | null;
  decisiveLoserGrossRSaved: number;
  decisiveWinnerGrossRLost: number;
  decisiveGrossUsdProxy: number;
};

type distribution = {
  mean: number | null;
  median: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
};

const average = (values: readonly number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const percentile = (values: readonly number[], q: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper
    ? sorted[lower]!
    : sorted[lower]! * (upper - position) + sorted[upper]! * (position - lower);
};

export const summarizeAnchorDistribution = (values: readonly number[]): distribution => ({
  mean: average(values),
  median: percentile(values, 0.5),
  p10: percentile(values, 0.1),
  p25: percentile(values, 0.25),
  p75: percentile(values, 0.75),
  p90: percentile(values, 0.9),
});

const rate = (count: number, population: number) => (population === 0 ? 0 : count / population);

export function getAnchorCoordinateR(
  trade: Pick<frozen_anchor_trade, 'direction' | 'entryPrice' | 'structuralAnchor' | 'rPrice'>,
) {
  return trade.direction === 'LONG'
    ? (trade.entryPrice - trade.structuralAnchor) / trade.rPrice
    : (trade.structuralAnchor - trade.entryPrice) / trade.rPrice;
}

export function touchesAnchor(
  direction: trade_side,
  candle: Pick<price_candle, 'low' | 'high'>,
  anchor: number,
) {
  return direction === 'LONG' ? candle.low <= anchor : candle.high >= anchor;
}

function touchesTarget(trade: frozen_anchor_trade, candle: price_candle) {
  return trade.direction === 'LONG'
    ? candle.high >= trade.baselineTargetPrice
    : candle.low <= trade.baselineTargetPrice;
}

export function classifyAnchorPath(
  trade: frozen_anchor_trade,
  candles: readonly price_candle[],
): anchor_trade_diagnostic {
  const path = candles.filter(
    (candle) =>
      candle.timestamp >= trade.entryFill1mTimestamp &&
      candle.timestamp <= trade.baselineExitTimestamp,
  );
  let firstAnchorTouchTimestamp: number | null = null;
  let firstTpTouchTimestamp: number | null = null;
  let postAnchorAdversePrice = trade.structuralAnchor;
  for (const candle of path) {
    if (
      firstAnchorTouchTimestamp === null &&
      touchesAnchor(trade.direction, candle, trade.structuralAnchor)
    )
      firstAnchorTouchTimestamp = candle.timestamp;
    if (firstTpTouchTimestamp === null && touchesTarget(trade, candle))
      firstTpTouchTimestamp = candle.timestamp;
    if (firstAnchorTouchTimestamp !== null && candle.timestamp >= firstAnchorTouchTimestamp)
      postAnchorAdversePrice =
        trade.direction === 'LONG'
          ? Math.min(postAnchorAdversePrice, candle.low)
          : Math.max(postAnchorAdversePrice, candle.high);
  }

  let firstEventClassification: anchor_first_event;
  if (trade.baselineOutcome === 'TAKE_PROFIT') {
    if (firstAnchorTouchTimestamp !== null && firstAnchorTouchTimestamp === firstTpTouchTimestamp)
      firstEventClassification = 'TP_ANCHOR_SAME_1M_AMBIGUOUS';
    else if (
      firstAnchorTouchTimestamp !== null &&
      (firstTpTouchTimestamp === null || firstAnchorTouchTimestamp < firstTpTouchTimestamp)
    )
      firstEventClassification = 'ANCHOR_BEFORE_TP';
    else firstEventClassification = 'TP_BEFORE_ANCHOR';
  } else if (firstAnchorTouchTimestamp === trade.baselineExitTimestamp)
    firstEventClassification = 'ANCHOR_AND_EXIT_SAME_1M';
  else if (
    firstAnchorTouchTimestamp !== null &&
    firstAnchorTouchTimestamp < trade.baselineExitTimestamp
  )
    firstEventClassification = 'ANCHOR_BEFORE_BASELINE_EXIT';
  else firstEventClassification = 'ANCHOR_NOT_TOUCHED_BEFORE_BASELINE_EXIT';

  const decisiveLoser = firstEventClassification === 'ANCHOR_BEFORE_BASELINE_EXIT';
  const decisiveWinner = firstEventClassification === 'ANCHOR_BEFORE_TP';
  const decisiveLoserGrossRSaved = decisiveLoser ? -1 - trade.baselineGrossR : 0;
  const decisiveWinnerGrossRLost = decisiveWinner ? trade.baselineGrossR + 1 : 0;
  const anchorToInvalidation =
    firstAnchorTouchTimestamp !== null && trade.baselineInvalidationTimestamp !== null
      ? trade.baselineInvalidationTimestamp - firstAnchorTouchTimestamp
      : null;
  return {
    ...trade,
    hardStopLevel: trade.structuralAnchor,
    anchorCoordinateR: getAnchorCoordinateR(trade),
    firstAnchorTouchTimestamp,
    firstTpTouchTimestamp,
    firstEventClassification,
    minutesFromAnchorTouchToInvalidation:
      anchorToInvalidation === null ? null : anchorToInvalidation / minute,
    minutesFromAnchorTouchToBaselineExit:
      firstAnchorTouchTimestamp === null
        ? null
        : (trade.baselineExitTimestamp - firstAnchorTouchTimestamp) / minute,
    completed5mBarsFromAnchorTouchToInvalidation:
      anchorToInvalidation === null
        ? null
        : Math.max(
            0,
            (trade.baselineInvalidationTimestamp! -
              Math.floor(firstAnchorTouchTimestamp! / fiveMinutes) * fiveMinutes) /
              fiveMinutes,
          ),
    maximumAdverseExcursionBeyondAnchorR:
      firstAnchorTouchTimestamp === null
        ? null
        : trade.direction === 'LONG'
          ? Math.max(0, trade.structuralAnchor - postAnchorAdversePrice) / trade.rPrice
          : Math.max(0, postAnchorAdversePrice - trade.structuralAnchor) / trade.rPrice,
    baselineGrossLossBeyondAnchorR: decisiveLoser ? Math.max(0, -1 - trade.baselineGrossR) : null,
    decisiveLoserGrossRSaved,
    decisiveWinnerGrossRLost,
    decisiveGrossUsdProxy:
      (decisiveLoserGrossRSaved - decisiveWinnerGrossRLost) * trade.actualGrossRiskUsd,
  };
}

export function freezeAnchorTrade(
  segment: diagnostic_segment,
  path: post_entry_trade_diagnostic,
  baseline: full_structure_risk_trade,
): frozen_anchor_trade {
  const normalizedOutcome =
    baseline.outcome === 'NORMAL_INVALIDATION_EXIT_TAKER'
      ? 'NORMAL_INVALIDATION'
      : baseline.outcome;
  if (normalizedOutcome === 'SEGMENT_BOUNDARY_EXIT')
    throw new Error('ANCHOR_SOURCE_OUTCOME_INVALID');
  return {
    tradeId: path.diagnosticTradeId,
    segment,
    direction: baseline.side,
    entryFill1mTimestamp: baseline.entryTimestamp,
    entryPrice: baseline.entryPrice,
    structuralAnchor: baseline.tradeStructuralAnchor,
    rPrice: baseline.rPrice,
    baselineTargetPrice: baseline.targetPrice,
    baselineEmergencyPrice: baseline.emergencyStopPrice,
    actualNotionalUsd: baseline.actualNotionalUsd,
    actualGrossRiskUsd: baseline.actualGrossRiskUsd,
    baselineOutcome: normalizedOutcome,
    baselineInvalidationTimestamp: baseline.invalidationTimestamp,
    baselineExitTimestamp: baseline.exitTimestamp,
    baselineExitPrice: baseline.exitPrice,
    baselineGrossR: baseline.grossR,
    baselineNetR: baseline.netR,
    baselineGrossPnlUsd: baseline.grossPnlUsd,
    baselineNetPnlUsd: baseline.netPnlUsd,
  };
}

function summarizeSide(rows: readonly anchor_trade_diagnostic[]) {
  const winners = rows.filter((row) => row.baselineOutcome === 'TAKE_PROFIT');
  const normal = rows.filter((row) => row.baselineOutcome === 'NORMAL_INVALIDATION');
  const emergency = rows.filter((row) => row.baselineOutcome === 'EMERGENCY_STOP');
  const losers = [...normal, ...emergency];
  const tpBefore = winners.filter((row) => row.firstEventClassification === 'TP_BEFORE_ANCHOR');
  const anchorBeforeTp = winners.filter(
    (row) => row.firstEventClassification === 'ANCHOR_BEFORE_TP',
  );
  const ambiguous = winners.filter(
    (row) => row.firstEventClassification === 'TP_ANCHOR_SAME_1M_AMBIGUOUS',
  );
  const loserAnchorBefore = losers.filter(
    (row) => row.firstEventClassification === 'ANCHOR_BEFORE_BASELINE_EXIT',
  );
  const loserSame = losers.filter(
    (row) => row.firstEventClassification === 'ANCHOR_AND_EXIT_SAME_1M',
  );
  const loserNotTouched = losers.filter(
    (row) => row.firstEventClassification === 'ANCHOR_NOT_TOUCHED_BEFORE_BASELINE_EXIT',
  );
  const normalTouched = normal.filter(
    (row) =>
      row.firstAnchorTouchTimestamp !== null &&
      row.baselineInvalidationTimestamp !== null &&
      row.firstAnchorTouchTimestamp < row.baselineInvalidationTimestamp,
  );
  const emergencyTouched = emergency.filter(
    (row) =>
      row.firstAnchorTouchTimestamp !== null &&
      row.firstAnchorTouchTimestamp < row.baselineExitTimestamp,
  );
  const loserSaved = loserAnchorBefore.reduce((sum, row) => sum + row.decisiveLoserGrossRSaved, 0);
  const winnerLost = anchorBeforeTp.reduce((sum, row) => sum + row.decisiveWinnerGrossRLost, 0);
  const ambiguousLost = ambiguous.reduce((sum, row) => sum + row.baselineGrossR + 1, 0);
  const optimisticNetGrossRProxy = loserSaved - winnerLost;
  const pessimisticNetGrossRProxy = optimisticNetGrossRProxy - ambiguousLost;
  const optimisticGrossUsdProxy = rows.reduce((sum, row) => sum + row.decisiveGrossUsdProxy, 0);
  const pessimisticGrossUsdProxy =
    optimisticGrossUsdProxy -
    ambiguous.reduce((sum, row) => sum + (row.baselineGrossR + 1) * row.actualGrossRiskUsd, 0);
  const averageWinnerCost = average(anchorBeforeTp.map((row) => row.baselineGrossR + 1)) ?? 0;
  const breakEvenCount = averageWinnerCost > 0 ? loserSaved / averageWinnerCost : 0;
  return {
    tradeCount: rows.length,
    winners: {
      baselineTpWinnerCount: winners.length,
      tpBeforeAnchorCount: tpBefore.length,
      tpBeforeAnchorRate: rate(tpBefore.length, winners.length),
      anchorBeforeTpCount: anchorBeforeTp.length,
      anchorBeforeTpRate: rate(anchorBeforeTp.length, winners.length),
      same1mTpAnchorAmbiguousCount: ambiguous.length,
      same1mTpAnchorAmbiguousRate: rate(ambiguous.length, winners.length),
    },
    losers: {
      baselineLoserCount: losers.length,
      anchorBeforeBaselineExitCount: loserAnchorBefore.length,
      anchorBeforeBaselineExitRate: rate(loserAnchorBefore.length, losers.length),
      anchorNotTouchedBeforeBaselineExitCount: loserNotTouched.length,
      anchorAndExitSame1mCount: loserSame.length,
    },
    normalInvalidation: {
      tradeCount: normal.length,
      anchorTouchedBeforeInvalidating5mCloseCount: normalTouched.length,
      rate: rate(normalTouched.length, normal.length),
      minutesFromFirstAnchorTouchToInvalidating5mClose: summarizeAnchorDistribution(
        normalTouched
          .map((row) => row.minutesFromAnchorTouchToInvalidation)
          .filter((value): value is number => value !== null),
      ),
      minutesFromFirstAnchorTouchToBaselineExit: summarizeAnchorDistribution(
        normalTouched
          .map((row) => row.minutesFromAnchorTouchToBaselineExit)
          .filter((value): value is number => value !== null),
      ),
      completed5mBarsFromAnchorTouchToInvalidation: summarizeAnchorDistribution(
        normalTouched
          .map((row) => row.completed5mBarsFromAnchorTouchToInvalidation)
          .filter((value): value is number => value !== null),
      ),
      baselineGrossR: summarizeAnchorDistribution(normal.map((row) => row.baselineGrossR)),
      baselineNetR: summarizeAnchorDistribution(normal.map((row) => row.baselineNetR)),
    },
    emergency: {
      tradeCount: emergency.length,
      anchorTouchedBeforeEmergencyCount: emergencyTouched.length,
      rate: rate(emergencyTouched.length, emergency.length),
      minutesFromAnchorTouchToEmergency: summarizeAnchorDistribution(
        emergencyTouched
          .map((row) => row.minutesFromAnchorTouchToBaselineExit)
          .filter((value): value is number => value !== null),
      ),
      baselineGrossR: summarizeAnchorDistribution(emergency.map((row) => row.baselineGrossR)),
      baselineNetR: summarizeAnchorDistribution(emergency.map((row) => row.baselineNetR)),
    },
    recoveringWinners: {
      count: anchorBeforeTp.length,
      rateAmongTpWinners: rate(anchorBeforeTp.length, winners.length),
      minutesFromAnchorTouchToTp: summarizeAnchorDistribution(
        anchorBeforeTp
          .map((row) => row.firstTpTouchTimestamp! - row.firstAnchorTouchTimestamp!)
          .map((value) => value / minute),
      ),
      completed5mBarsFromAnchorTouchToTp: summarizeAnchorDistribution(
        anchorBeforeTp.map(
          (row) => (row.firstTpTouchTimestamp! - row.firstAnchorTouchTimestamp!) / fiveMinutes,
        ),
      ),
      maximumAdverseExcursionBeyondAnchorR: summarizeAnchorDistribution(
        anchorBeforeTp
          .map((row) => row.maximumAdverseExcursionBeyondAnchorR)
          .filter((value): value is number => value !== null),
      ),
    },
    lossExpansion: {
      baselineGrossLossBeyondAnchorR: summarizeAnchorDistribution(
        loserAnchorBefore
          .map((row) => row.baselineGrossLossBeyondAnchorR)
          .filter((value): value is number => value !== null),
      ),
      totalGrossRBeyondAnchorAmongLosers: loserAnchorBefore.reduce(
        (sum, row) => sum + (row.baselineGrossLossBeyondAnchorR ?? 0),
        0,
      ),
    },
    frictionlessProxy: {
      label: StructuralAnchorHardStopRules.proxyLabel,
      feesIncluded: false,
      slippageIncluded: false,
      decisiveLoserGrossRSaved: loserSaved,
      decisiveWinnerGrossRLost: winnerLost,
      decisiveNetGrossRProxy: optimisticNetGrossRProxy,
      optimisticNetGrossRProxy,
      pessimisticNetGrossRProxy,
      optimisticGrossUsdProxy,
      pessimisticGrossUsdProxy,
    },
    breakEvenFalseStop: {
      grossBreakEvenFalseStoppedWinnerCount: breakEvenCount,
      grossBreakEvenFalseStoppedWinnerRateAmongTpWinners: rate(breakEvenCount, winners.length),
      actualDefiniteAnchorBeforeTpRate: rate(anchorBeforeTp.length, winners.length),
      actualWorstCaseIncludingSame1mRate: rate(
        anchorBeforeTp.length + ambiguous.length,
        winners.length,
      ),
    },
  };
}

type baseline_segment_summary = {
  rEconomics: {
    meanGrossR: number;
    meanNetR: number;
    grossRProfitFactor: number;
    netRProfitFactor: number;
  };
  usdEconomics: { totalNetPnlUsd: number; netProfitFactor: number };
  outcomes: {
    takeProfitCount: number;
    normalInvalidationCount: number;
    emergencyStopCount: number;
  };
};

export function checkAnchorFoundation(
  segment: diagnostic_segment,
  rows: readonly anchor_trade_diagnostic[],
  summary: baseline_segment_summary,
) {
  const expected = StructuralAnchorHardStopRules.expected[segment];
  const actual = {
    completedTradeCount: rows.length,
    takeProfitCount: rows.filter((row) => row.baselineOutcome === 'TAKE_PROFIT').length,
    normalInvalidationCount: rows.filter((row) => row.baselineOutcome === 'NORMAL_INVALIDATION')
      .length,
    emergencyStopCount: rows.filter((row) => row.baselineOutcome === 'EMERGENCY_STOP').length,
    meanGrossR: summary.rEconomics.meanGrossR,
    meanNetR: summary.rEconomics.meanNetR,
    grossRProfitFactor: summary.rEconomics.grossRProfitFactor,
    netRProfitFactor: summary.rEconomics.netRProfitFactor,
    totalNetPnlUsd: summary.usdEconomics.totalNetPnlUsd,
    netProfitFactor: summary.usdEconomics.netProfitFactor,
  };
  const matches = (Object.keys(expected) as (keyof typeof expected)[]).every((key) =>
    typeof expected[key] === 'number'
      ? Math.abs(actual[key] - expected[key]) <= tolerance
      : actual[key] === expected[key],
  );
  const anchorRMatch = rows.every((row) => Math.abs(row.anchorCoordinateR - 1) <= tolerance);
  return { expected, actual, matches, anchorRMatch, passed: matches && anchorRMatch };
}

export function buildStructuralAnchorHardStopReport(input: {
  sourceExperimentId: string;
  baselineExperimentId: string;
  sourceTrades: {
    discovery: readonly post_entry_trade_diagnostic[];
    lateDevelopment: readonly post_entry_trade_diagnostic[];
  };
  baselineTrades: {
    discovery: readonly full_structure_risk_trade[];
    lateDevelopment: readonly full_structure_risk_trade[];
  };
  baselineSegments: {
    discovery: baseline_segment_summary;
    lateDevelopment: baseline_segment_summary;
  };
  candles: readonly price_candle[];
}) {
  const candleIndexByTimestamp = new Map(
    input.candles.map((candle, index) => [candle.timestamp, index] as const),
  );
  const analyze = (
    segment: diagnostic_segment,
    paths: readonly post_entry_trade_diagnostic[],
    baselines: readonly full_structure_risk_trade[],
    summary: baseline_segment_summary,
  ) => {
    const baselineByKey = new Map(
      baselines.map((trade) => [
        [
          trade.side,
          trade.signalTimestamp - fiveMinutes,
          trade.entryTimestamp,
          trade.entryPrice,
          trade.tradeStructuralAnchor,
        ].join(':'),
        trade,
      ]),
    );
    const rows = paths.map((path) => {
      const key = [
        path.side,
        path.rejection5mTimestamp,
        path.entryFill1mTimestamp,
        path.entryPrice,
        path.structuralAnchor,
      ].join(':');
      const baseline = baselineByKey.get(key);
      if (baseline === undefined) throw new Error('STRUCTURAL_ANCHOR_SOURCE_TRADE_MISMATCH');
      if (
        path.side !== baseline.side ||
        path.entryFill1mTimestamp !== baseline.entryTimestamp ||
        path.entryPrice !== baseline.entryPrice ||
        path.structuralAnchor !== baseline.tradeStructuralAnchor ||
        path.rPrice !== baseline.rPrice ||
        path.baselineExitTimestamp !== baseline.exitTimestamp ||
        path.baselineExitPrice !== baseline.exitPrice ||
        path.baselineGrossR !== baseline.grossR
      )
        throw new Error('STRUCTURAL_ANCHOR_FROZEN_FIELD_MISMATCH');
      const first = candleIndexByTimestamp.get(path.entryFill1mTimestamp);
      const last = candleIndexByTimestamp.get(path.baselineExitTimestamp);
      if (first === undefined || last === undefined || last < first)
        throw new Error('STRUCTURAL_ANCHOR_1M_PATH_MISSING');
      return classifyAnchorPath(
        freezeAnchorTrade(segment, path, baseline),
        input.candles.slice(first, last + 1),
      );
    });
    const foundation = checkAnchorFoundation(segment, rows, summary);
    return {
      foundation,
      summaries: {
        ALL: summarizeSide(rows),
        LONG: summarizeSide(rows.filter((row) => row.direction === 'LONG')),
        SHORT: summarizeSide(rows.filter((row) => row.direction === 'SHORT')),
      },
      trades: rows,
    };
  };
  const discovery = analyze(
    'DISCOVERY',
    input.sourceTrades.discovery,
    input.baselineTrades.discovery,
    input.baselineSegments.discovery,
  );
  const lateDevelopment = analyze(
    'LATE_DEVELOPMENT',
    input.sourceTrades.lateDevelopment,
    input.baselineTrades.lateDevelopment,
    input.baselineSegments.lateDevelopment,
  );
  const foundationPassed =
    input.sourceExperimentId === 'BTC_5M_SR_V4_POST_ENTRY_PATH_DIAGNOSTIC_V1' &&
    input.baselineExperimentId === StructuralAnchorHardStopRules.referenceExperimentId &&
    discovery.foundation.passed &&
    lateDevelopment.foundation.passed;
  const consistency = {
    loserAnchorCaptureHighInBothSegments:
      discovery.summaries.ALL.losers.anchorBeforeBaselineExitRate >= 0.95 &&
      lateDevelopment.summaries.ALL.losers.anchorBeforeBaselineExitRate >= 0.95,
    definiteWinnerFalseStopBelowGrossBreakEvenInBothSegments:
      discovery.summaries.ALL.breakEvenFalseStop.actualDefiniteAnchorBeforeTpRate <
        discovery.summaries.ALL.breakEvenFalseStop
          .grossBreakEvenFalseStoppedWinnerRateAmongTpWinners &&
      lateDevelopment.summaries.ALL.breakEvenFalseStop.actualDefiniteAnchorBeforeTpRate <
        lateDevelopment.summaries.ALL.breakEvenFalseStop
          .grossBreakEvenFalseStoppedWinnerRateAmongTpWinners,
    optimisticGrossProxyPositiveBoth:
      discovery.summaries.ALL.frictionlessProxy.optimisticNetGrossRProxy > 0 &&
      lateDevelopment.summaries.ALL.frictionlessProxy.optimisticNetGrossRProxy > 0,
    pessimisticGrossProxyPositiveBoth:
      discovery.summaries.ALL.frictionlessProxy.pessimisticNetGrossRProxy > 0 &&
      lateDevelopment.summaries.ALL.frictionlessProxy.pessimisticNetGrossRProxy > 0,
  };
  const classification = !foundationPassed
    ? StructuralAnchorHardStopRules.foundationFailure
    : !consistency.optimisticGrossProxyPositiveBoth
      ? 'BTC_5M_SR_STRUCTURAL_ANCHOR_HARD_STOP_NOT_WORTH_COUNTERFACTUAL'
      : !consistency.pessimisticGrossProxyPositiveBoth
        ? 'BTC_5M_SR_STRUCTURAL_ANCHOR_HARD_STOP_AMBIGUOUS_WORTH_FURTHER_PATH_CHECK'
        : 'BTC_5M_SR_STRUCTURAL_ANCHOR_HARD_STOP_LOCKED_COUNTERFACTUAL_CANDIDATE';
  return {
    experimentId: StructuralAnchorHardStopRules.experimentId,
    metadata: {
      referenceExperimentId: StructuralAnchorHardStopRules.referenceExperimentId,
      diagnosticOnly: true,
      actualStopSimulation: false,
      pnlCurveCalculated: false,
      equityCurveCalculated: false,
      feesIncludedInProxy: false,
      slippageIncludedInProxy: false,
      exactHardStopLevel: 'FROZEN_FULL_STRUCTURAL_ANCHOR_EQUALS_MINUS_1R',
      touchSemantics: 'LONG_LOW_LTE_ANCHOR_SHORT_HIGH_GTE_ANCHOR',
      sameEntryMinutePostOnlyTouchIsObservable: true,
      entryExecution: 'POST_ONLY_LIMIT_MAKER',
      targetExecution: 'REDUCE_ONLY_POST_ONLY_LIMIT_MAKER',
      normalInvalidationExecution: 'MARKETABLE_REDUCE_ONLY_LIMIT_TAKER',
      emergencyExecution: 'TAKER',
      futureHardStopExecution: 'TAKER_PROTECTIVE_EXIT',
      segments: ['DISCOVERY', 'LATE_DEVELOPMENT'] as const,
    },
    sourceChecks: { foundationPassed },
    segments: { discovery, lateDevelopment },
    consistency,
    classification,
  };
}
