import type { price_candle } from './btc_bybit_decibel_overlap_audit.js';
import type { trade_side } from './btc_5m_confirmed_swing_sr_zone_limit_state_machine.js';
import {
  StructuralAnchorHardStopRules,
  type anchor_trade_diagnostic,
} from './btc_5m_sr_v4_structural_anchor_hard_stop_feasibility_diagnostic.js';

const tolerance = 1e-9;

export const AnchorHardStopLockedRules = {
  experimentId: 'BTC_5M_SR_V4_STRUCTURAL_ANCHOR_HARD_STOP_LOCKED_COHORT_V1' as const,
  sourceExperimentId: StructuralAnchorHardStopRules.experimentId,
  referenceExperimentId: StructuralAnchorHardStopRules.referenceExperimentId,
  hardStopR: -1 as const,
  entryLiquidity: 'POST_ONLY_LIMIT_MAKER' as const,
  targetLiquidity: 'REDUCE_ONLY_POST_ONLY_LIMIT_MAKER' as const,
  hardStopLiquidity: 'TAKER_PROTECTIVE_EXIT' as const,
  emergencyLiquidity: 'TAKER' as const,
  same1mPolicy: 'STOP_WINS' as const,
  expected: StructuralAnchorHardStopRules.expected,
};

export type hard_stop_outcome =
  'TAKE_PROFIT' | 'STRUCTURAL_ANCHOR_HARD_STOP' | 'EMERGENCY_STOP' | 'SEGMENT_BOUNDARY_EXIT';

export type hard_stop_trade = {
  tradeId: string;
  segment: anchor_trade_diagnostic['segment'];
  direction: trade_side;
  entryFill1mTimestamp: number;
  entryPrice: number;
  structuralAnchor: number;
  rPrice: number;
  targetPrice: number;
  emergencyPrice: number;
  actualNotionalUsd: number;
  actualGrossRiskUsd: number;
  baselineOutcome: anchor_trade_diagnostic['baselineOutcome'];
  baselineExitTimestamp: number;
  baselineNetPnlUsd: number;
  baselineNetR: number;
  descriptiveBaselineInvalidationTimestamp: number | null;
  outcome: hard_stop_outcome;
  exitTimestamp: number;
  exitPrice: number;
  exitLiquidity: 'MAKER' | 'TAKER';
  same1mTpStopAmbiguous: boolean;
  stopOpenThroughAnchor: boolean;
  entryFeeUsd: number;
  exitFeeUsd: number;
  totalFeeUsd: number;
  grossPnlUsd: number;
  netPnlUsd: number;
  grossR: number;
  netR: number;
  hardStopSlippageBeyondMinus1R: number | null;
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

const profitFactor = (values: readonly number[]) => {
  const wins = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const losses = values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return losses < 0 ? wins / Math.abs(losses) : null;
};

const calculatePnl = (side: trade_side, notional: number, entry: number, exit: number) =>
  side === 'LONG' ? notional * ((exit - entry) / entry) : notional * ((entry - exit) / entry);

export function isAnchorStopTriggered(
  direction: trade_side,
  candle: Pick<price_candle, 'low' | 'high'>,
  anchor: number,
) {
  return direction === 'LONG' ? candle.low <= anchor : candle.high >= anchor;
}

export function getAnchorStopFillPrice(
  direction: trade_side,
  anchor: number,
  triggeringOpen: number,
) {
  return direction === 'LONG' ? Math.min(anchor, triggeringOpen) : Math.max(anchor, triggeringOpen);
}

const touchesTarget = (trade: anchor_trade_diagnostic, candle: price_candle) =>
  trade.direction === 'LONG'
    ? candle.high >= trade.baselineTargetPrice
    : candle.low <= trade.baselineTargetPrice;

const openThroughEmergency = (trade: anchor_trade_diagnostic, candle: price_candle) =>
  trade.direction === 'LONG'
    ? candle.open <= trade.baselineEmergencyPrice
    : candle.open >= trade.baselineEmergencyPrice;

function finalizeTrade(input: {
  baseline: anchor_trade_diagnostic;
  outcome: hard_stop_outcome;
  exitTimestamp: number;
  exitPrice: number;
  exitLiquidity: 'MAKER' | 'TAKER';
  same1mTpStopAmbiguous: boolean;
  stopOpenThroughAnchor: boolean;
  makerFeeRate: number;
  takerFeeRate: number;
}): hard_stop_trade {
  const entryFeeUsd = input.baseline.actualNotionalUsd * input.makerFeeRate;
  const exitFeeUsd =
    input.baseline.actualNotionalUsd *
    (input.exitLiquidity === 'MAKER' ? input.makerFeeRate : input.takerFeeRate);
  const grossPnlUsd = calculatePnl(
    input.baseline.direction,
    input.baseline.actualNotionalUsd,
    input.baseline.entryPrice,
    input.exitPrice,
  );
  const totalFeeUsd = entryFeeUsd + exitFeeUsd;
  const grossR = grossPnlUsd / input.baseline.actualGrossRiskUsd;
  return {
    tradeId: input.baseline.tradeId,
    segment: input.baseline.segment,
    direction: input.baseline.direction,
    entryFill1mTimestamp: input.baseline.entryFill1mTimestamp,
    entryPrice: input.baseline.entryPrice,
    structuralAnchor: input.baseline.structuralAnchor,
    rPrice: input.baseline.rPrice,
    targetPrice: input.baseline.baselineTargetPrice,
    emergencyPrice: input.baseline.baselineEmergencyPrice,
    actualNotionalUsd: input.baseline.actualNotionalUsd,
    actualGrossRiskUsd: input.baseline.actualGrossRiskUsd,
    baselineOutcome: input.baseline.baselineOutcome,
    baselineExitTimestamp: input.baseline.baselineExitTimestamp,
    baselineNetPnlUsd: input.baseline.baselineNetPnlUsd,
    baselineNetR: input.baseline.baselineNetR,
    descriptiveBaselineInvalidationTimestamp: input.baseline.baselineInvalidationTimestamp,
    outcome: input.outcome,
    exitTimestamp: input.exitTimestamp,
    exitPrice: input.exitPrice,
    exitLiquidity: input.exitLiquidity,
    same1mTpStopAmbiguous: input.same1mTpStopAmbiguous,
    stopOpenThroughAnchor: input.stopOpenThroughAnchor,
    entryFeeUsd,
    exitFeeUsd,
    totalFeeUsd,
    grossPnlUsd,
    netPnlUsd: grossPnlUsd - totalFeeUsd,
    grossR,
    netR: (grossPnlUsd - totalFeeUsd) / input.baseline.actualGrossRiskUsd,
    hardStopSlippageBeyondMinus1R:
      input.outcome === 'STRUCTURAL_ANCHOR_HARD_STOP' ? Math.max(0, -1 - grossR) : null,
  };
}

export function simulateAnchorHardStopTrade(input: {
  baseline: anchor_trade_diagnostic;
  candles: readonly price_candle[];
  startIndex?: number;
  segmentEndExclusiveTimestamp: number;
  makerFeeRate: number;
  takerFeeRate: number;
}): hard_stop_trade {
  let last: price_candle | null = null;
  for (let index = input.startIndex ?? 0; index < input.candles.length; index++) {
    const candle = input.candles[index]!;
    if (candle.timestamp < input.baseline.entryFill1mTimestamp) continue;
    if (candle.timestamp >= input.segmentEndExclusiveTimestamp) break;
    last = candle;
    const stop = isAnchorStopTriggered(
      input.baseline.direction,
      candle,
      input.baseline.structuralAnchor,
    );
    const target = touchesTarget(input.baseline, candle);
    if (openThroughEmergency(input.baseline, candle))
      return finalizeTrade({
        ...input,
        outcome: 'EMERGENCY_STOP',
        exitTimestamp: candle.timestamp,
        exitPrice: candle.open,
        exitLiquidity: 'TAKER',
        same1mTpStopAmbiguous: target && stop,
        stopOpenThroughAnchor: true,
      });
    if (stop)
      return finalizeTrade({
        ...input,
        outcome: 'STRUCTURAL_ANCHOR_HARD_STOP',
        exitTimestamp: candle.timestamp,
        exitPrice: getAnchorStopFillPrice(
          input.baseline.direction,
          input.baseline.structuralAnchor,
          candle.open,
        ),
        exitLiquidity: 'TAKER',
        same1mTpStopAmbiguous: target,
        stopOpenThroughAnchor:
          input.baseline.direction === 'LONG'
            ? candle.open <= input.baseline.structuralAnchor
            : candle.open >= input.baseline.structuralAnchor,
      });
    if (target)
      return finalizeTrade({
        ...input,
        outcome: 'TAKE_PROFIT',
        exitTimestamp: candle.timestamp,
        exitPrice: input.baseline.baselineTargetPrice,
        exitLiquidity: 'MAKER',
        same1mTpStopAmbiguous: false,
        stopOpenThroughAnchor: false,
      });
  }
  if (last === null) throw new Error('ANCHOR_HARD_STOP_1M_PATH_MISSING');
  return finalizeTrade({
    ...input,
    outcome: 'SEGMENT_BOUNDARY_EXIT',
    exitTimestamp: last.timestamp,
    exitPrice: last.close,
    exitLiquidity: 'TAKER',
    same1mTpStopAmbiguous: false,
    stopOpenThroughAnchor: false,
  });
}

type scoreboard_row = {
  outcome: string;
  grossPnlUsd: number;
  netPnlUsd: number;
  grossR: number;
  netR: number;
};

export function summarizeAnchorPolicy(rows: readonly scoreboard_row[]) {
  const gross = rows.map((row) => row.grossPnlUsd);
  const net = rows.map((row) => row.netPnlUsd);
  const grossR = rows.map((row) => row.grossR);
  const netR = rows.map((row) => row.netR);
  const takeProfitCount = rows.filter((row) => row.outcome === 'TAKE_PROFIT').length;
  const hardStopCount = rows.filter((row) => row.outcome === 'STRUCTURAL_ANCHOR_HARD_STOP').length;
  const emergencyStopCount = rows.filter((row) => row.outcome === 'EMERGENCY_STOP').length;
  return {
    tradeCount: rows.length,
    takeProfitCount,
    hardStopCount,
    emergencyStopCount,
    segmentBoundaryExitCount: rows.filter((row) => row.outcome === 'SEGMENT_BOUNDARY_EXIT').length,
    winRate: rows.length ? net.filter((value) => value > 0).length / rows.length : 0,
    meanGrossR: average(grossR),
    medianGrossR: percentile(grossR, 0.5),
    grossRProfitFactor: profitFactor(grossR),
    meanNetR: average(netR),
    medianNetR: percentile(netR, 0.5),
    netRProfitFactor: profitFactor(netR),
    meanGrossPnlUsd: average(gross),
    totalGrossPnlUsd: gross.reduce((sum, value) => sum + value, 0),
    grossProfitFactor: profitFactor(gross),
    meanNetPnlUsd: average(net),
    totalNetPnlUsd: net.reduce((sum, value) => sum + value, 0),
    netProfitFactor: profitFactor(net),
  };
}

export function passesAnchorSixMetricDominance(
  p1: ReturnType<typeof summarizeAnchorPolicy>,
  p0: ReturnType<typeof summarizeAnchorPolicy>,
) {
  return (
    (p1.meanGrossR ?? -Infinity) > (p0.meanGrossR ?? -Infinity) &&
    (p1.grossRProfitFactor ?? 0) > (p0.grossRProfitFactor ?? 0) &&
    (p1.meanNetR ?? -Infinity) > (p0.meanNetR ?? -Infinity) &&
    (p1.netRProfitFactor ?? 0) > (p0.netRProfitFactor ?? 0) &&
    p1.totalNetPnlUsd > p0.totalNetPnlUsd &&
    (p1.netProfitFactor ?? 0) > (p0.netProfitFactor ?? 0)
  );
}

export function classifyAnchorLocked(input: {
  foundationPassed: boolean;
  discoveryDominates: boolean;
  lateDominates: boolean;
  discoveryGrossEdge: boolean;
  lateGrossEdge: boolean;
  discoveryNetEdge: boolean;
  lateNetEdge: boolean;
}) {
  if (!input.foundationPassed) return 'BTC_5M_SR_ANCHOR_HARD_STOP_FOUNDATION_REGRESSION';
  if (!input.discoveryDominates || !input.lateDominates)
    return 'BTC_5M_SR_ANCHOR_HARD_STOP_DOES_NOT_DOMINATE_V4';
  if (input.discoveryNetEdge && input.lateNetEdge)
    return 'BTC_5M_SR_ANCHOR_HARD_STOP_STRONG_LIVE_REPLAY_CANDIDATE';
  if (input.discoveryGrossEdge && input.lateGrossEdge)
    return 'BTC_5M_SR_ANCHOR_HARD_STOP_GROSS_EDGE_CANDIDATE';
  return 'BTC_5M_SR_ANCHOR_HARD_STOP_LIVE_REPLAY_CANDIDATE';
}

function summarizeAnchorLockedGroup(
  baseline: readonly anchor_trade_diagnostic[],
  candidate: readonly hard_stop_trade[],
) {
  const p0Rows = baseline.map((row) => ({
    outcome: row.baselineOutcome,
    grossPnlUsd: row.baselineGrossPnlUsd,
    netPnlUsd: row.baselineNetPnlUsd,
    grossR: row.baselineGrossR,
    netR: row.baselineNetR,
  }));
  const P0 = summarizeAnchorPolicy(p0Rows);
  const P1 = summarizeAnchorPolicy(candidate);
  const stops = candidate.filter((row) => row.outcome === 'STRUCTURAL_ANCHOR_HARD_STOP');
  const saved = candidate.filter(
    (row) => row.baselineOutcome !== 'TAKE_PROFIT' && row.netPnlUsd > row.baselineNetPnlUsd,
  );
  const falseStopped = candidate.filter(
    (row) => row.baselineOutcome === 'TAKE_PROFIT' && row.outcome === 'STRUCTURAL_ANCHOR_HARD_STOP',
  );
  const improvements = saved.map((row) => row.netR - row.baselineNetR);
  const costs = falseStopped.map((row) => row.baselineNetR - row.netR);
  const usdSaved = saved.reduce((sum, row) => sum + row.netPnlUsd - row.baselineNetPnlUsd, 0);
  const usdLost = falseStopped.reduce((sum, row) => sum + row.baselineNetPnlUsd - row.netPnlUsd, 0);
  const baselineLoserCount = baseline.filter((row) => row.baselineOutcome !== 'TAKE_PROFIT').length;
  return {
    scoreboard: { P0, P1 },
    stopExecution: {
      hardStopCount: stops.length,
      exactAnchorFillCount: stops.filter((row) => !row.stopOpenThroughAnchor).length,
      openThroughAnchorFillCount: stops.filter((row) => row.stopOpenThroughAnchor).length,
      openThroughAnchorFillRate: stops.length
        ? stops.filter((row) => row.stopOpenThroughAnchor).length / stops.length
        : 0,
      meanHardStopGrossR: average(stops.map((row) => row.grossR)),
      medianHardStopGrossR: percentile(
        stops.map((row) => row.grossR),
        0.5,
      ),
      meanHardStopSlippageBeyondMinus1R: average(
        stops.map((row) => row.hardStopSlippageBeyondMinus1R ?? 0),
      ),
      medianHardStopSlippageBeyondMinus1R: percentile(
        stops.map((row) => row.hardStopSlippageBeyondMinus1R ?? 0),
        0.5,
      ),
      p90HardStopSlippageBeyondMinus1R: percentile(
        stops.map((row) => row.hardStopSlippageBeyondMinus1R ?? 0),
        0.9,
      ),
    },
    savedBaselineLosers: {
      savedBaselineLoserCount: saved.length,
      savedBaselineLoserRate: baselineLoserCount ? saved.length / baselineLoserCount : 0,
      meanP0NetR: average(saved.map((row) => row.baselineNetR)),
      meanP1NetR: average(saved.map((row) => row.netR)),
      meanNetRImprovement: average(improvements),
      medianNetRImprovement: percentile(improvements, 0.5),
      totalNetPnlUsdSaved: usdSaved,
    },
    falseStoppedBaselineWinners: {
      falseStoppedBaselineWinnerCount: falseStopped.length,
      rateAmongP0TpWinners: P0.takeProfitCount ? falseStopped.length / P0.takeProfitCount : 0,
      meanP0NetR: average(falseStopped.map((row) => row.baselineNetR)),
      meanP1NetR: average(falseStopped.map((row) => row.netR)),
      meanNetRCost: average(costs),
      medianNetRCost: percentile(costs, 0.5),
      totalNetPnlUsdLost: usdLost,
      same1mTpStopAmbiguousCount: falseStopped.filter((row) => row.same1mTpStopAmbiguous).length,
    },
    netTradeOff: {
      totalNetPnlUsdSavedFromBaselineLosers: usdSaved,
      totalNetPnlUsdLostFromBaselineWinners: usdLost,
      netBenefitUsd: usdSaved - usdLost,
      totalNetRSaved: improvements.reduce((sum, value) => sum + value, 0),
      totalNetRLost: costs.reduce((sum, value) => sum + value, 0),
      netBenefitR:
        improvements.reduce((sum, value) => sum + value, 0) -
        costs.reduce((sum, value) => sum + value, 0),
    },
    emergencyEffect: {
      p0EmergencyCount: baseline.filter((row) => row.baselineOutcome === 'EMERGENCY_STOP').length,
      p0EmergencyRate: baseline.length
        ? baseline.filter((row) => row.baselineOutcome === 'EMERGENCY_STOP').length /
          baseline.length
        : 0,
      p1EmergencyCount: P1.emergencyStopCount,
      p1EmergencyRate: candidate.length ? P1.emergencyStopCount / candidate.length : 0,
      baselineEmergencyConvertedToHardStopCount: candidate.filter(
        (row) =>
          row.baselineOutcome === 'EMERGENCY_STOP' && row.outcome === 'STRUCTURAL_ANCHOR_HARD_STOP',
      ).length,
    },
    edgeCheck: {
      grossEdgePositive: (P1.meanGrossR ?? -Infinity) > 0 && (P1.grossRProfitFactor ?? 0) > 1,
      netEdgePositive: (P1.meanNetR ?? -Infinity) > 0 && (P1.netProfitFactor ?? 0) > 1,
    },
    dominance: passesAnchorSixMetricDominance(P1, P0),
  };
}

export function summarizeAnchorLockedSegment(
  baseline: readonly anchor_trade_diagnostic[],
  candidate: readonly hard_stop_trade[],
) {
  const ALL = summarizeAnchorLockedGroup(baseline, candidate);
  const LONG = summarizeAnchorLockedGroup(
    baseline.filter((row) => row.direction === 'LONG'),
    candidate.filter((row) => row.direction === 'LONG'),
  );
  const SHORT = summarizeAnchorLockedGroup(
    baseline.filter((row) => row.direction === 'SHORT'),
    candidate.filter((row) => row.direction === 'SHORT'),
  );
  return { ...ALL, longShort: { ALL, LONG, SHORT } };
}

export function checkAnchorLockedFoundation(
  segment: 'DISCOVERY' | 'LATE_DEVELOPMENT',
  rows: readonly anchor_trade_diagnostic[],
) {
  const expected = AnchorHardStopLockedRules.expected[segment];
  const summary = summarizeAnchorPolicy(
    rows.map((row) => ({
      outcome: row.baselineOutcome,
      grossPnlUsd: row.baselineGrossPnlUsd,
      netPnlUsd: row.baselineNetPnlUsd,
      grossR: row.baselineGrossR,
      netR: row.baselineNetR,
    })),
  );
  const actual = {
    completedTradeCount: rows.length,
    takeProfitCount: rows.filter((row) => row.baselineOutcome === 'TAKE_PROFIT').length,
    normalInvalidationCount: rows.filter((row) => row.baselineOutcome === 'NORMAL_INVALIDATION')
      .length,
    emergencyStopCount: rows.filter((row) => row.baselineOutcome === 'EMERGENCY_STOP').length,
    meanGrossR: summary.meanGrossR!,
    meanNetR: summary.meanNetR!,
    grossRProfitFactor: summary.grossRProfitFactor!,
    netRProfitFactor: summary.netRProfitFactor!,
    totalNetPnlUsd: summary.totalNetPnlUsd,
    netProfitFactor: summary.netProfitFactor!,
  };
  const passed = (Object.keys(expected) as (keyof typeof expected)[]).every(
    (key) => Math.abs(actual[key] - expected[key]) <= tolerance,
  );
  return { expected, actual, passed };
}

export function buildAnchorHardStopLockedReport(input: {
  sourceExperimentId: string;
  discovery: readonly anchor_trade_diagnostic[];
  lateDevelopment: readonly anchor_trade_diagnostic[];
  candles: readonly price_candle[];
  discoveryEndExclusiveTimestamp: number;
  lateEndExclusiveTimestamp: number;
  makerFeeRate: number;
  takerFeeRate: number;
}) {
  const candleIndex = new Map(input.candles.map((candle, index) => [candle.timestamp, index]));
  const run = (rows: readonly anchor_trade_diagnostic[], endExclusiveTimestamp: number) =>
    rows.map((row) => {
      const start = candleIndex.get(row.entryFill1mTimestamp);
      if (start === undefined) throw new Error('ANCHOR_HARD_STOP_1M_PATH_MISSING');
      return simulateAnchorHardStopTrade({
        baseline: row,
        candles: input.candles,
        startIndex: start,
        segmentEndExclusiveTimestamp: endExclusiveTimestamp,
        makerFeeRate: input.makerFeeRate,
        takerFeeRate: input.takerFeeRate,
      });
    });
  const discoveryTrades = run(input.discovery, input.discoveryEndExclusiveTimestamp);
  const lateTrades = run(input.lateDevelopment, input.lateEndExclusiveTimestamp);
  const discoveryFoundation = checkAnchorLockedFoundation('DISCOVERY', input.discovery);
  const lateFoundation = checkAnchorLockedFoundation('LATE_DEVELOPMENT', input.lateDevelopment);
  const discovery = summarizeAnchorLockedSegment(input.discovery, discoveryTrades);
  const lateDevelopment = summarizeAnchorLockedSegment(input.lateDevelopment, lateTrades);
  const sourceById = new Map(
    [...input.discovery, ...input.lateDevelopment].map((row) => [row.tradeId, row]),
  );
  const cohortInvariance = {
    discovery: discoveryTrades.length === input.discovery.length,
    lateDevelopment: lateTrades.length === input.lateDevelopment.length,
    uniqueCounterpartPerTrade:
      new Set([...discoveryTrades, ...lateTrades].map((row) => row.tradeId)).size ===
      discoveryTrades.length + lateTrades.length,
    frozenFields: [...discoveryTrades, ...lateTrades].every((row) => {
      const source = sourceById.get(row.tradeId);
      return (
        source !== undefined &&
        row.entryPrice === source.entryPrice &&
        row.rPrice === source.rPrice &&
        row.structuralAnchor === source.structuralAnchor &&
        row.actualNotionalUsd === source.actualNotionalUsd &&
        row.targetPrice === source.baselineTargetPrice
      );
    }),
  };
  const foundationPassed =
    input.sourceExperimentId === AnchorHardStopLockedRules.sourceExperimentId &&
    discoveryFoundation.passed &&
    lateFoundation.passed &&
    Object.values(cohortInvariance).every(Boolean);
  const dominatesBoth = discovery.dominance && lateDevelopment.dominance;
  const classification = classifyAnchorLocked({
    foundationPassed,
    discoveryDominates: discovery.dominance,
    lateDominates: lateDevelopment.dominance,
    discoveryGrossEdge: discovery.edgeCheck.grossEdgePositive,
    lateGrossEdge: lateDevelopment.edgeCheck.grossEdgePositive,
    discoveryNetEdge: discovery.edgeCheck.netEdgePositive,
    lateNetEdge: lateDevelopment.edgeCheck.netEdgePositive,
  });
  return {
    experimentId: AnchorHardStopLockedRules.experimentId,
    metadata: {
      sourceExperimentId: AnchorHardStopLockedRules.sourceExperimentId,
      referenceExperimentId: AnchorHardStopLockedRules.referenceExperimentId,
      lockedCohort: true,
      opportunityRegeneration: false,
      dynamicEquity: false,
      dynamicSizing: false,
      exactStop: 'FROZEN_STRUCTURAL_ANCHOR_MINUS_1R',
      entryLiquidity: AnchorHardStopLockedRules.entryLiquidity,
      targetLiquidity: AnchorHardStopLockedRules.targetLiquidity,
      hardStopLiquidity: AnchorHardStopLockedRules.hardStopLiquidity,
      same1mPolicy: AnchorHardStopLockedRules.same1mPolicy,
      makerFeeRate: input.makerFeeRate,
      takerFeeRate: input.takerFeeRate,
      segments: ['DISCOVERY', 'LATE_DEVELOPMENT'] as const,
    },
    sourceCheck: { foundationPassed, discoveryFoundation, lateFoundation },
    cohortInvariance,
    segments: {
      discovery: { ...discovery, trades: discoveryTrades },
      lateDevelopment: { ...lateDevelopment, trades: lateTrades },
    },
    dominance: {
      discovery: discovery.dominance,
      lateDevelopment: lateDevelopment.dominance,
      both: dominatesBoth,
    },
    edgeCheck: { discovery: discovery.edgeCheck, lateDevelopment: lateDevelopment.edgeCheck },
    classification,
  };
}
