import type { BTC_candlestick } from './decibel_client.js';
import { detectImpulseSignal } from './btc_5m_impulse_continuation_research.js';
import {
  calculateBodyMidpointEntry,
  type pullback_direction_metrics,
  type pullback_metrics,
} from './btc_5m_impulse_pullback_research.js';
import {
  aggregateBTCOneMinuteCandles,
  calculateSingleLegSizing,
  evaluateSingleLegMarginGuard,
  isResearchLimitFillable,
  type btc_research_market,
  type split_label,
  type wick_direction,
} from './btc_5m_wick_rejection_research.js';

export const BTC5MImpulsePullback5XCostExperiment = {
  experimentId: 'BTC_5M_IMPULSE_PULLBACK_5X_COST_V1' as const,
  costMultiple: 5,
};
type outcome =
  | 'ENTRY_FAILED'
  | 'PENDING_AT_DATASET_END'
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'MARGIN_GUARD'
  | 'OPEN_AT_DATASET_END';
export type cost_campaign = {
  signal5mStartTimestamp: number;
  signal5mEndTimestamp: number;
  direction: wick_direction;
  signalOpen: number;
  signalHigh: number;
  signalLow: number;
  signalClose: number;
  range: number;
  body: number;
  bodyFraction: number;
  closeLocation: number;
  previous12MedianRange: number;
  entryLimitPrice: number;
  entryFillTimestamp: number | null;
  entryFillPrice: number | null;
  entryLeverage: number | null;
  entryNotional: number | null;
  quantity: number | null;
  initialMarginUsed: number | null;
  expectedEntryFeeDollars: number | null;
  expectedExitFeeDollars: number | null;
  expectedCampaignCostDollars: number | null;
  expectedCampaignCostBps: number | null;
  oneCostPriceDistance: number | null;
  rawFiveCostPriceDistance: number | null;
  stopTriggerPrice: number | null;
  takeProfitTriggerPrice: number | null;
  actualStopDistance: number | null;
  actualTakeProfitDistance: number | null;
  actualStopCostMultiple: number | null;
  actualTakeProfitCostMultiple: number | null;
  completionTimestamp: number | null;
  outcome: outcome;
  exitPrice: number | null;
  holdingMinutes: number | null;
  grossPnL: number;
  totalFees: number;
  realizedToExpectedCostRatio: number | null;
  netPnL: number;
  equityBeforeCampaign: number;
  equityAfterRealization: number;
  depositAppliedAfterCampaign: number;
  splitLabel: split_label;
};
type cost_diagnostic = {
  meanExpectedCampaignCostDollars: number;
  medianExpectedCampaignCostDollars: number;
  meanExpectedCampaignCostBps: number;
  medianExpectedCampaignCostBps: number;
  meanFiveCostDistanceBps: number;
  medianFiveCostDistanceBps: number;
  meanActualTPCostMultiple: number;
  medianActualTPCostMultiple: number;
  meanActualSLCostMultiple: number;
  medianActualSLCostMultiple: number;
  realizedToExpectedCostRatio: {
    mean: number;
    median: number;
    p10: number;
    p25: number;
    p75: number;
    p90: number;
  };
};
type break_even = {
  meanGrossWin: number | null;
  meanGrossLossAbs: number | null;
  meanFeePerCampaign: number | null;
  actualTpRate: number;
  empiricalBreakEvenWinRate: number | null;
  winRateGapPercentagePoints: number | null;
};
type comparison = { available: boolean; baseline?: unknown; candidate?: unknown; delta?: unknown };
export type cost_report = {
  experimentId: typeof BTC5MImpulsePullback5XCostExperiment.experimentId;
  dataRange: Record<string, number | null>;
  leverageSource: string;
  executionSemantics: Record<string, string>;
  signalDefinition: Record<string, string>;
  entryDefinition: Record<string, string>;
  costDefinition: Record<string, string>;
  exitDefinition: Record<string, string>;
  split: { discoveryEndTimestamp: number; discoveryFraction: 0.7 };
  signalAccounting: Record<string, number>;
  costGeometryDiagnostics: { overall: cost_diagnostic; holdout: cost_diagnostic };
  overall: pullback_metrics & {
    longCompletedCampaignCount: number;
    shortCompletedCampaignCount: number;
    openAtDatasetEndCount: number;
    meanTotalFees: number;
    medianTotalFees: number;
    depositCount: number;
    totalDeposited: number;
    startingEquity: number;
    endingEquity: number;
    economicPnL: number;
  };
  discovery: pullback_metrics;
  holdout: pullback_metrics & {
    meanTotalFees: number;
    medianTotalFees: number;
    byDirection: Record<wick_direction, pullback_direction_metrics>;
  };
  byDirection: Record<wick_direction, pullback_direction_metrics>;
  breakEvenDiagnostic: { overall: break_even; holdout: break_even };
  comparisonTo1R: comparison;
  comparisonTo2R: comparison;
  bySevenDayBlock: Array<Record<string, number | null>>;
  campaigns: cost_campaign[];
  classification:
    | 'BTC_5M_IMPULSE_PULLBACK_5X_COST_HOLDOUT_PROMISING'
    | 'BTC_5M_IMPULSE_PULLBACK_5X_COST_HOLDOUT_INTERESTING'
    | 'NO_USEFUL_BTC_5M_IMPULSE_PULLBACK_5X_COST_EDGE';
};

const minute = 60_000,
  week = 7 * 86_400_000;
const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = (values: readonly number[], fraction: number) =>
  values.length === 0
    ? 0
    : [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)]!;
const profitFactor = (values: readonly number[]) => {
  const wins = values.filter((v) => v > 0).reduce((s, v) => s + v, 0),
    losses = -values.filter((v) => v < 0).reduce((s, v) => s + v, 0);
  return losses === 0 ? null : wins / losses;
};
const pnl = (direction: wick_direction, entry: number, exit: number, quantity: number) =>
  (direction === 'LONG_BTC' ? exit - entry : entry - exit) * quantity;
const roundDown = (value: number, tick: number) =>
  Math.floor((value + Number.EPSILON) / tick) * tick;
const roundUp = (value: number, tick: number) => Math.ceil((value - Number.EPSILON) / tick) * tick;
const isCompleted = (value: cost_campaign) =>
  value.outcome === 'TAKE_PROFIT' ||
  value.outcome === 'STOP_LOSS' ||
  value.outcome === 'MARGIN_GUARD';

export function calculateFiveCostGeometry(input: {
  direction: wick_direction;
  fillPrice: number;
  quantity: number;
  entryNotional: number;
  makerFeeRate: number;
  takerFeeRate: number;
  tickSize: number;
}) {
  const expectedEntryFeeDollars = input.entryNotional * input.makerFeeRate,
    expectedExitFeeDollars = input.entryNotional * input.takerFeeRate,
    expectedCampaignCostDollars = expectedEntryFeeDollars + expectedExitFeeDollars,
    oneCostPriceDistance = expectedCampaignCostDollars / Math.abs(input.quantity),
    rawFiveCostPriceDistance = 5 * oneCostPriceDistance;
  if (!(oneCostPriceDistance > 0) || !(rawFiveCostPriceDistance > 0))
    throw new Error('INVALID_COST_GEOMETRY');
  const rawStop =
      input.direction === 'LONG_BTC'
        ? input.fillPrice - rawFiveCostPriceDistance
        : input.fillPrice + rawFiveCostPriceDistance,
    rawTarget =
      input.direction === 'LONG_BTC'
        ? input.fillPrice + rawFiveCostPriceDistance
        : input.fillPrice - rawFiveCostPriceDistance,
    stopTriggerPrice =
      input.direction === 'LONG_BTC'
        ? roundDown(rawStop, input.tickSize)
        : roundUp(rawStop, input.tickSize),
    takeProfitTriggerPrice =
      input.direction === 'LONG_BTC'
        ? roundUp(rawTarget, input.tickSize)
        : roundDown(rawTarget, input.tickSize),
    actualStopDistance = Math.abs(input.fillPrice - stopTriggerPrice),
    actualTakeProfitDistance = Math.abs(takeProfitTriggerPrice - input.fillPrice);
  return {
    expectedEntryFeeDollars,
    expectedExitFeeDollars,
    expectedCampaignCostDollars,
    expectedCampaignCostBps: (expectedCampaignCostDollars / input.entryNotional) * 10_000,
    oneCostPriceDistance,
    rawFiveCostPriceDistance,
    stopTriggerPrice,
    takeProfitTriggerPrice,
    actualStopDistance,
    actualTakeProfitDistance,
    actualStopCostMultiple: actualStopDistance / oneCostPriceDistance,
    actualTakeProfitCostMultiple: actualTakeProfitDistance / oneCostPriceDistance,
  };
}

function summarize(
  campaigns: readonly cost_campaign[],
  rawSignals = 0,
  ignoredActive = 0,
): pullback_metrics {
  const filled = campaigns.filter((v) => v.entryFillPrice !== null),
    closed = filled.filter(isCompleted),
    gross = closed.map((v) => v.grossPnL),
    net = closed.map((v) => v.netPnL),
    holding = closed.flatMap((v) => (v.holdingMinutes === null ? [] : [v.holdingMinutes])),
    tp = closed.filter((v) => v.outcome === 'TAKE_PROFIT').length,
    failed = campaigns.filter((v) => v.outcome === 'ENTRY_FAILED').length;
  return {
    rawSignalCount: rawSignals,
    signalAcceptedWhileFlatCount: campaigns.length,
    signalIgnoredWhilePendingCount: 0,
    signalIgnoredWhileActiveCount: ignoredActive,
    entryAttemptCount: campaigns.length,
    entryFilledCount: filled.length,
    entryFailedCount: failed,
    entryFillRate: campaigns.length === 0 ? 0 : filled.length / campaigns.length,
    completedCampaignCount: closed.length,
    takeProfitCount: tp,
    stopLossCount: closed.filter((v) => v.outcome === 'STOP_LOSS').length,
    marginGuardCount: closed.filter((v) => v.outcome === 'MARGIN_GUARD').length,
    tpRate: closed.length === 0 ? 0 : tp / closed.length,
    grossPnLSum: gross.reduce((s, v) => s + v, 0),
    netPnLSum: net.reduce((s, v) => s + v, 0),
    grossProfitFactor: profitFactor(gross),
    netProfitFactor: profitFactor(net),
    meanHoldingMinutes: mean(holding),
    medianHoldingMinutes: percentile(holding, 0.5),
  };
}
function directions(
  campaigns: readonly cost_campaign[],
  signals: Record<wick_direction, number>,
): Record<wick_direction, pullback_direction_metrics> {
  const one = (direction: wick_direction): pullback_direction_metrics => {
    const v = summarize(campaigns.filter((x) => x.direction === direction));
    return {
      signalCount: signals[direction],
      signalAcceptedWhileFlatCount: v.signalAcceptedWhileFlatCount,
      signalIgnoredWhilePendingCount: v.signalIgnoredWhilePendingCount,
      signalIgnoredWhileActiveCount: v.signalIgnoredWhileActiveCount,
      entryAttemptCount: v.entryAttemptCount,
      entryFilledCount: v.entryFilledCount,
      entryFailedCount: v.entryFailedCount,
      entryFillRate: v.entryFillRate,
      completedCampaignCount: v.completedCampaignCount,
      takeProfitCount: v.takeProfitCount,
      stopLossCount: v.stopLossCount,
      marginGuardCount: v.marginGuardCount,
      tpRate: v.tpRate,
      grossPnLSum: v.grossPnLSum,
      netPnLSum: v.netPnLSum,
      grossProfitFactor: v.grossProfitFactor,
      netProfitFactor: v.netProfitFactor,
      meanHoldingMinutes: v.meanHoldingMinutes,
      medianHoldingMinutes: v.medianHoldingMinutes,
    };
  };
  return { LONG_BTC: one('LONG_BTC'), SHORT_BTC: one('SHORT_BTC') };
}
function costDiagnostic(campaigns: readonly cost_campaign[]): cost_diagnostic {
  const active = campaigns.filter((v) => v.expectedCampaignCostDollars !== null),
    completed = active.filter(isCompleted),
    costs = active.map((v) => v.expectedCampaignCostDollars!),
    costBps = active.map((v) => v.expectedCampaignCostBps!),
    distanceBps = active.map((v) => (v.actualTakeProfitDistance! / v.entryFillPrice!) * 10_000),
    tp = active.map((v) => v.actualTakeProfitCostMultiple!),
    sl = active.map((v) => v.actualStopCostMultiple!),
    realized = completed.map((v) => v.realizedToExpectedCostRatio!);
  return {
    meanExpectedCampaignCostDollars: mean(costs),
    medianExpectedCampaignCostDollars: percentile(costs, 0.5),
    meanExpectedCampaignCostBps: mean(costBps),
    medianExpectedCampaignCostBps: percentile(costBps, 0.5),
    meanFiveCostDistanceBps: mean(distanceBps),
    medianFiveCostDistanceBps: percentile(distanceBps, 0.5),
    meanActualTPCostMultiple: mean(tp),
    medianActualTPCostMultiple: percentile(tp, 0.5),
    meanActualSLCostMultiple: mean(sl),
    medianActualSLCostMultiple: percentile(sl, 0.5),
    realizedToExpectedCostRatio: {
      mean: mean(realized),
      median: percentile(realized, 0.5),
      p10: percentile(realized, 0.1),
      p25: percentile(realized, 0.25),
      p75: percentile(realized, 0.75),
      p90: percentile(realized, 0.9),
    },
  };
}
function breakEven(campaigns: readonly cost_campaign[]): break_even {
  const closed = campaigns.filter(isCompleted),
    wins = closed.filter((v) => v.grossPnL > 0).map((v) => v.grossPnL),
    losses = closed.filter((v) => v.grossPnL < 0).map((v) => Math.abs(v.grossPnL)),
    fees = closed.map((v) => v.totalFees),
    W = wins.length ? mean(wins) : null,
    L = losses.length ? mean(losses) : null,
    F = fees.length ? mean(fees) : null,
    actual =
      closed.length === 0
        ? 0
        : closed.filter((v) => v.outcome === 'TAKE_PROFIT').length / closed.length,
    required = W === null || L === null || F === null ? null : (L + F) / (W + L);
  return {
    meanGrossWin: W,
    meanGrossLossAbs: L,
    meanFeePerCampaign: F,
    actualTpRate: actual,
    empiricalBreakEvenWinRate: required,
    winRateGapPercentagePoints: required === null ? null : (actual - required) * 100,
  };
}
export function classify5XCost(
  holdout: pullback_metrics,
  economicPnL: number,
): cost_report['classification'] {
  if (
    holdout.completedCampaignCount >= 30 &&
    (holdout.grossProfitFactor ?? 0) >= 1 &&
    (holdout.netProfitFactor ?? 0) >= 1 &&
    holdout.netPnLSum > 0 &&
    economicPnL > 0
  )
    return 'BTC_5M_IMPULSE_PULLBACK_5X_COST_HOLDOUT_PROMISING';
  if (
    holdout.completedCampaignCount >= 30 &&
    (holdout.grossProfitFactor ?? 0) >= 1 &&
    (holdout.netProfitFactor ?? 0) >= 0.8
  )
    return 'BTC_5M_IMPULSE_PULLBACK_5X_COST_HOLDOUT_INTERESTING';
  return 'NO_USEFUL_BTC_5M_IMPULSE_PULLBACK_5X_COST_EDGE';
}

function compareArtifact(
  candidateOverall: pullback_metrics,
  candidateHoldout: pullback_metrics,
  artifact: unknown,
): comparison {
  if (typeof artifact !== 'object' || artifact === null) return { available: false };
  const root = artifact as Record<string, unknown>;
  if (
    typeof root.overall !== 'object' ||
    root.overall === null ||
    typeof root.holdout !== 'object' ||
    root.holdout === null
  )
    return { available: false };
  const select = (value: object) => {
    const v = value as Record<string, unknown>;
    return {
      completedCampaignCount: v.completedCampaignCount,
      tpRate: v.tpRate,
      grossProfitFactor: v.grossProfitFactor,
      netProfitFactor: v.netProfitFactor,
      grossPnLSum: v.grossPnLSum,
      netPnLSum: v.netPnLSum,
      meanHoldingMinutes: v.meanHoldingMinutes,
      medianHoldingMinutes: v.medianHoldingMinutes,
      meanTotalFees: v.meanTotalFees,
    };
  };
  const current = (v: pullback_metrics) => ({
    completedCampaignCount: v.completedCampaignCount,
    tpRate: v.tpRate,
    grossProfitFactor: v.grossProfitFactor,
    netProfitFactor: v.netProfitFactor,
    grossPnLSum: v.grossPnLSum,
    netPnLSum: v.netPnLSum,
    meanHoldingMinutes: v.meanHoldingMinutes,
    medianHoldingMinutes: v.medianHoldingMinutes,
  });
  return {
    available: true,
    baseline: { overall: select(root.overall), holdout: select(root.holdout) },
    candidate: { overall: current(candidateOverall), holdout: current(candidateHoldout) },
  };
}

export function runBTC5MImpulsePullback5XCostReplay(input: {
  candles: readonly BTC_candlestick[];
  market: btc_research_market;
  leverageSource: string;
  oneRReport?: unknown;
  twoRReport?: unknown;
}): cost_report {
  const oneMinute = [...input.candles].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    ),
    fiveMinute = aggregateBTCOneMinuteCandles(oneMinute),
    byTime = new Map(
      oneMinute.map((candle, index) => [candle.timestamp.getTime(), { candle, index }]),
    );
  const first = fiveMinute[0]?.timestamp.getTime() ?? 0,
    last = fiveMinute.at(-1)?.endTimestamp.getTime() ?? first,
    splitTime = first + (last - first) * 0.7;
  const signals: Record<wick_direction, number> = { LONG_BTC: 0, SHORT_BTC: 0 },
    splitSignals: Record<split_label, Record<wick_direction, number>> = {
      DISCOVERY: { LONG_BTC: 0, SHORT_BTC: 0 },
      HOLDOUT: { LONG_BTC: 0, SHORT_BTC: 0 },
    },
    ignored: Record<split_label, number> = { DISCOVERY: 0, HOLDOUT: 0 };
  const campaigns: cost_campaign[] = [],
    fills = [0, 0, 0, 0, 0];
  let activeUntil = -1,
    equity = 30,
    depositCount = 0,
    totalDeposited = 0;
  for (let signalIndex = 12; signalIndex < fiveMinute.length; signalIndex += 1) {
    const signal = detectImpulseSignal(fiveMinute, signalIndex);
    if (!signal) continue;
    const candle = fiveMinute[signalIndex]!,
      signalTime = candle.endTimestamp.getTime(),
      label: split_label = signalTime < splitTime ? 'DISCOVERY' : 'HOLDOUT';
    signals[signal.direction] += 1;
    splitSignals[label][signal.direction] += 1;
    if (signalTime <= activeUntil) {
      ignored[label] += 1;
      continue;
    }
    const limit = calculateBodyMidpointEntry(candle.open, candle.close),
      base = {
        signal5mStartTimestamp: candle.timestamp.getTime(),
        signal5mEndTimestamp: signalTime,
        direction: signal.direction,
        signalOpen: candle.open,
        signalHigh: candle.high,
        signalLow: candle.low,
        signalClose: candle.close,
        ...signal.geometry,
        previous12MedianRange: signal.previous12MedianRange,
        entryLimitPrice: limit,
        equityBeforeCampaign: equity,
        splitLabel: label,
      };
    let fill: { candle: BTC_candlestick; index: number; minuteIndex: number } | null = null;
    for (let entryMinute = 1; entryMinute <= 5; entryMinute += 1) {
      const point = byTime.get(signalTime + (entryMinute - 1) * minute);
      if (
        point &&
        isResearchLimitFillable(signal.direction, limit, point.candle, input.market.tickSize)
      ) {
        fill = { ...point, minuteIndex: entryMinute };
        break;
      }
    }
    const empty = (status: 'ENTRY_FAILED' | 'PENDING_AT_DATASET_END'): cost_campaign => ({
      ...base,
      entryFillTimestamp: null,
      entryFillPrice: null,
      entryLeverage: null,
      entryNotional: null,
      quantity: null,
      initialMarginUsed: null,
      expectedEntryFeeDollars: null,
      expectedExitFeeDollars: null,
      expectedCampaignCostDollars: null,
      expectedCampaignCostBps: null,
      oneCostPriceDistance: null,
      rawFiveCostPriceDistance: null,
      stopTriggerPrice: null,
      takeProfitTriggerPrice: null,
      actualStopDistance: null,
      actualTakeProfitDistance: null,
      actualStopCostMultiple: null,
      actualTakeProfitCostMultiple: null,
      completionTimestamp: status === 'ENTRY_FAILED' ? signalTime + 5 * minute : null,
      outcome: status,
      exitPrice: null,
      holdingMinutes: null,
      grossPnL: 0,
      totalFees: 0,
      realizedToExpectedCostRatio: null,
      netPnL: 0,
      equityAfterRealization: equity,
      depositAppliedAfterCampaign: 0,
    });
    if (!fill) {
      campaigns.push(
        empty(
          (oneMinute.at(-1)?.timestamp.getTime() ?? -1) < signalTime + 4 * minute
            ? 'PENDING_AT_DATASET_END'
            : 'ENTRY_FAILED',
        ),
      );
      continue;
    }
    fills[fill.minuteIndex - 1] = fills[fill.minuteIndex - 1]! + 1;
    const sizing = calculateSingleLegSizing(equity, limit, input.market);
    if (!sizing) {
      campaigns.push(empty('ENTRY_FAILED'));
      continue;
    }
    const geometry = calculateFiveCostGeometry({
      direction: signal.direction,
      fillPrice: limit,
      quantity: sizing.quantity,
      entryNotional: sizing.notional,
      makerFeeRate: input.market.makerFeeRate,
      takerFeeRate: input.market.takerFeeRate,
      tickSize: input.market.tickSize,
    });
    let campaignOutcome: outcome = 'OPEN_AT_DATASET_END',
      exit: number | null = null,
      completion: number | null = null;
    for (let index = fill.index; index < oneMinute.length; index += 1) {
      const point = oneMinute[index]!,
        health = evaluateSingleLegMarginGuard({
          equity: equity - geometry.expectedEntryFeeDollars,
          direction: signal.direction,
          entryPrice: limit,
          markPrice: point.close,
          quantity: sizing.quantity,
          maximumLeverage: input.market.maximumLeverage,
        }),
        stopHit =
          signal.direction === 'LONG_BTC'
            ? point.low <= geometry.stopTriggerPrice
            : point.high >= geometry.stopTriggerPrice,
        targetHit =
          signal.direction === 'LONG_BTC'
            ? point.high >= geometry.takeProfitTriggerPrice
            : point.low <= geometry.takeProfitTriggerPrice;
      if (health.triggered) {
        campaignOutcome = 'MARGIN_GUARD';
        exit = point.close;
      } else if (stopHit) {
        campaignOutcome = 'STOP_LOSS';
        exit = geometry.stopTriggerPrice;
      } else if (targetHit) {
        campaignOutcome = 'TAKE_PROFIT';
        exit = geometry.takeProfitTriggerPrice;
      }
      if (exit !== null) {
        completion = point.timestamp.getTime() + minute;
        activeUntil = completion;
        break;
      }
    }
    const entryFee = geometry.expectedEntryFeeDollars,
      gross = exit === null ? 0 : pnl(signal.direction, limit, exit, sizing.quantity),
      exitFee =
        exit === null
          ? 0
          : Math.abs(exit * sizing.quantity) *
            (campaignOutcome === 'TAKE_PROFIT'
              ? input.market.makerFeeRate
              : input.market.takerFeeRate),
      totalFees = entryFee + exitFee,
      net = exit === null ? 0 : gross - totalFees,
      after = exit === null ? equity : equity + net;
    let deposit = 0;
    if (exit !== null && after < 15) {
      deposit = 15;
      depositCount += 1;
      totalDeposited += 15;
    }
    campaigns.push({
      ...base,
      entryFillTimestamp: fill.candle.timestamp.getTime() + minute,
      entryFillPrice: limit,
      entryLeverage: input.market.maximumLeverage,
      entryNotional: sizing.notional,
      quantity: sizing.quantity,
      initialMarginUsed: sizing.initialMargin,
      ...geometry,
      completionTimestamp: completion,
      outcome: campaignOutcome,
      exitPrice: exit,
      holdingMinutes:
        completion === null
          ? null
          : (completion - (fill.candle.timestamp.getTime() + minute)) / minute,
      grossPnL: gross,
      totalFees,
      realizedToExpectedCostRatio:
        exit === null ? null : totalFees / geometry.expectedCampaignCostDollars,
      netPnL: net,
      equityAfterRealization: after,
      depositAppliedAfterCampaign: deposit,
    });
    if (exit === null) activeUntil = Number.POSITIVE_INFINITY;
    else equity = after + deposit;
  }
  const discoveryCampaigns = campaigns.filter((v) => v.splitLabel === 'DISCOVERY'),
    holdoutCampaigns = campaigns.filter((v) => v.splitLabel === 'HOLDOUT'),
    overall = summarize(
      campaigns,
      signals.LONG_BTC + signals.SHORT_BTC,
      ignored.DISCOVERY + ignored.HOLDOUT,
    ),
    holdout = summarize(
      holdoutCampaigns,
      splitSignals.HOLDOUT.LONG_BTC + splitSignals.HOLDOUT.SHORT_BTC,
      ignored.HOLDOUT,
    ),
    economicPnL = equity - 30 - totalDeposited,
    closed = campaigns.filter(isCompleted),
    holdoutClosed = holdoutCampaigns.filter(isCompleted);
  const groups = new Map<number, cost_campaign[]>();
  for (const campaign of campaigns) {
    const key = Math.floor((campaign.signal5mEndTimestamp - first) / week),
      values = groups.get(key) ?? [];
    values.push(campaign);
    groups.set(key, values);
  }
  return {
    experimentId: BTC5MImpulsePullback5XCostExperiment.experimentId,
    dataRange: {
      firstTimestamp: oneMinute[0]?.timestamp.getTime() ?? null,
      lastTimestamp: oneMinute.at(-1)?.timestamp.getTime() ?? null,
      oneMinuteCandleCount: oneMinute.length,
    },
    leverageSource: input.leverageSource,
    executionSemantics: {
      baseline: 'BTC_5M_IMPULSE_PULLBACK_1R_V1_UNCHANGED_EXCEPT_EXIT_GEOMETRY',
      ambiguity: 'STOP_LOSS',
    },
    signalDefinition: { source: 'BTC_5M_IMPULSE_CONTINUATION_1R_V1_UNCHANGED' },
    entryDefinition: {
      price: '(signalOpen+signalClose)/2',
      lifetime: 'NEXT_EXACTLY_FIVE_1M_CANDLES',
    },
    costDefinition: {
      entry: 'entryNotional*makerFeeRate',
      exit: 'entryNotional*takerFeeRate',
      distance: '5*(expectedCampaignCost/quantity)',
    },
    exitDefinition: {
      long: 'fill+-5xCostDistance',
      short: 'fill-+5xCostDistance',
      tickRounding: 'OUTWARD',
    },
    split: { discoveryEndTimestamp: splitTime, discoveryFraction: 0.7 },
    signalAccounting: {
      valid5mCandleCount: fiveMinute.length,
      contextEligible5mCandleCount: Math.max(0, fiveMinute.length - 12),
      longSignalCount: signals.LONG_BTC,
      shortSignalCount: signals.SHORT_BTC,
      rawSignalCount: signals.LONG_BTC + signals.SHORT_BTC,
      signalRate:
        fiveMinute.length <= 12
          ? 0
          : (signals.LONG_BTC + signals.SHORT_BTC) / (fiveMinute.length - 12),
      signalAcceptedWhileFlatCount: campaigns.length,
      signalIgnoredWhilePendingCount: 0,
      signalIgnoredWhileActiveCount: ignored.DISCOVERY + ignored.HOLDOUT,
      entryAttemptCount: campaigns.length,
      entryFilledCount: overall.entryFilledCount,
      entryFailedCount: overall.entryFailedCount,
      entryFillRate: overall.entryFillRate,
      filledOnMinute1Count: fills[0]!,
      filledOnMinute2Count: fills[1]!,
      filledOnMinute3Count: fills[2]!,
      filledOnMinute4Count: fills[3]!,
      filledOnMinute5Count: fills[4]!,
    },
    costGeometryDiagnostics: {
      overall: costDiagnostic(campaigns),
      holdout: costDiagnostic(holdoutCampaigns),
    },
    overall: {
      ...overall,
      longCompletedCampaignCount: closed.filter((v) => v.direction === 'LONG_BTC').length,
      shortCompletedCampaignCount: closed.filter((v) => v.direction === 'SHORT_BTC').length,
      openAtDatasetEndCount: campaigns.filter((v) => v.outcome === 'OPEN_AT_DATASET_END').length,
      meanTotalFees: mean(closed.map((v) => v.totalFees)),
      medianTotalFees: percentile(
        closed.map((v) => v.totalFees),
        0.5,
      ),
      depositCount,
      totalDeposited,
      startingEquity: 30,
      endingEquity: equity,
      economicPnL,
    },
    discovery: summarize(
      discoveryCampaigns,
      splitSignals.DISCOVERY.LONG_BTC + splitSignals.DISCOVERY.SHORT_BTC,
      ignored.DISCOVERY,
    ),
    holdout: {
      ...holdout,
      meanTotalFees: mean(holdoutClosed.map((v) => v.totalFees)),
      medianTotalFees: percentile(
        holdoutClosed.map((v) => v.totalFees),
        0.5,
      ),
      byDirection: directions(holdoutCampaigns, splitSignals.HOLDOUT),
    },
    byDirection: directions(campaigns, signals),
    breakEvenDiagnostic: { overall: breakEven(campaigns), holdout: breakEven(holdoutCampaigns) },
    comparisonTo1R: compareArtifact(overall, holdout, input.oneRReport),
    comparisonTo2R: compareArtifact(overall, holdout, input.twoRReport),
    bySevenDayBlock: [...groups]
      .sort(([a], [b]) => a - b)
      .map(([blockIndex, values]) => {
        const v = summarize(values);
        return {
          blockIndex,
          startTimestamp: first + blockIndex * week,
          longSignals: values.filter((x) => x.direction === 'LONG_BTC').length,
          shortSignals: values.filter((x) => x.direction === 'SHORT_BTC').length,
          entryAttempts: v.entryAttemptCount,
          entryFills: v.entryFilledCount,
          entryFillRate: v.entryFillRate,
          completedCampaignCount: v.completedCampaignCount,
          takeProfitCount: v.takeProfitCount,
          stopLossCount: v.stopLossCount,
          marginGuardCount: v.marginGuardCount,
          tpRate: v.tpRate,
          grossProfitFactor: v.grossProfitFactor,
          netProfitFactor: v.netProfitFactor,
          grossPnLSum: v.grossPnLSum,
          netPnLSum: v.netPnLSum,
          meanHoldingMinutes: v.meanHoldingMinutes,
        };
      }),
    campaigns,
    classification: classify5XCost(holdout, economicPnL),
  };
}
