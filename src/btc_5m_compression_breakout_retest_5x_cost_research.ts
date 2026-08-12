import {
  calculateCompressionContext,
  detectCompressionBreakout,
  type compression_context,
} from './btc_5m_compression_breakout_retest_count.js';
import { calculateFiveCostGeometry } from './btc_5m_impulse_pullback_5x_cost_research.js';
import {
  aggregateBTCOneMinuteCandles,
  calculateSingleLegSizing,
  evaluateSingleLegMarginGuard,
  isResearchLimitFillable,
  type btc_research_market,
  type split_label,
  type wick_direction,
} from './btc_5m_wick_rejection_research.js';
import type { BTC_candlestick } from './decibel_client.js';

export const BTC5MCompressionBreakoutRetest5XCostExperiment = {
  experimentId: 'BTC_5M_COMPRESSION_BREAKOUT_RETEST_5X_COST_V1' as const,
  entryLifetimeMinutes: 30,
  startingEquity: 30,
  depositTrigger: 15,
  depositAmount: 15,
};

type campaign_outcome =
  | 'ENTRY_FAILED'
  | 'PENDING_AT_DATASET_END'
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'MARGIN_GUARD'
  | 'OPEN_AT_DATASET_END';
export type compression_cost_campaign = compression_context & {
  breakoutTimestamp: number;
  direction: wick_direction;
  breakoutOpen: number;
  breakoutHigh: number;
  breakoutLow: number;
  breakoutClose: number;
  breakoutDistanceBps: number;
  entryLimitPrice: number;
  entryWindowStartTimestamp: number;
  entryWindowEndTimestamp: number;
  entryFillTimestamp: number | null;
  minutesToEntry: number | null;
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
  outcome: campaign_outcome;
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
export type compression_cost_metrics = {
  rawBreakoutCount: number;
  signalAcceptedWhileFlatCount: number;
  signalIgnoredWhilePendingCount: number;
  signalIgnoredWhileActiveCount: number;
  entryAttemptCount: number;
  entryFilledCount: number;
  entryFailedCount: number;
  entryFillRate: number;
  completedCampaignCount: number;
  takeProfitCount: number;
  stopLossCount: number;
  marginGuardCount: number;
  tpRate: number;
  grossProfitSum: number;
  grossLossSumAbs: number;
  grossPnLSum: number;
  grossProfitFactor: number | null;
  netProfitSum: number;
  netLossSumAbs: number;
  netPnLSum: number;
  netProfitFactor: number | null;
  meanHoldingMinutes: number;
  medianHoldingMinutes: number;
  meanTotalFees: number;
  medianTotalFees: number;
};
export type compression_direction_metrics = compression_cost_metrics & { signalCount: number };
type cost_geometry_diagnostic = {
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
  meanRealizedToExpectedCostRatio: number;
  medianRealizedToExpectedCostRatio: number;
};
type break_even_diagnostic = {
  meanGrossWin: number | null;
  meanGrossLossAbs: number | null;
  meanFeePerCampaign: number | null;
  actualTpRate: number;
  empiricalBreakEvenWinRate: number | null;
  winRateGapPercentagePoints: number | null;
};
type seven_day_block = {
  blockIndex: number;
  startTimestamp: number;
  longBreakoutSignals: number;
  shortBreakoutSignals: number;
  entryAttempts: number;
  entryFills: number;
  entryFillRate: number;
  completedCampaignCount: number;
  takeProfitCount: number;
  stopLossCount: number;
  marginGuardCount: number;
  tpRate: number;
  grossProfitFactor: number | null;
  netProfitFactor: number | null;
  grossPnLSum: number;
  netPnLSum: number;
  meanHoldingMinutes: number;
};
type comparison_summary = {
  completedCampaignCount: unknown;
  tpRate: unknown;
  grossProfitFactor: unknown;
  netProfitFactor: unknown;
  grossPnLSum: unknown;
  netPnLSum: unknown;
  meanHoldingMinutes: unknown;
  medianHoldingMinutes: unknown;
};
type impulse_comparison = {
  available: boolean;
  baseline?: comparison_summary;
  candidate?: comparison_summary;
  delta?: Record<string, number | null>;
};
export type compression_cost_report = {
  experimentId: typeof BTC5MCompressionBreakoutRetest5XCostExperiment.experimentId;
  dataRange: {
    firstTimestamp: number | null;
    lastTimestamp: number | null;
    oneMinuteCandleCount: number;
  };
  leverageSource: string;
  executionSemantics: Record<string, string>;
  compressionDefinition: Record<string, string>;
  breakoutDefinition: Record<string, string>;
  entryDefinition: Record<string, string>;
  costDefinition: Record<string, string>;
  exitDefinition: Record<string, string>;
  split: { discoveryEndTimestamp: number; discoveryFraction: 0.7 };
  signalAccounting: {
    valid5mCandleCount: number;
    contextEligible5mCandleCount: number;
    compressedWindowCount: number;
    longBreakoutCount: number;
    shortBreakoutCount: number;
    rawBreakoutCount: number;
    signalAcceptedWhileFlatCount: number;
    signalIgnoredWhilePendingCount: number;
    signalIgnoredWhileActiveCount: number;
    entryAttemptCount: number;
    entryFilledCount: number;
    entryFailedCount: number;
    entryFillRate: number;
    filledWithin5mCount: number;
    filledWithin10mCount: number;
    filledWithin15mCount: number;
    filledWithin20mCount: number;
    filledWithin30mCount: number;
  };
  entryTimingDiagnostics: {
    meanMinutesToEntry: number;
    medianMinutesToEntry: number;
    p25MinutesToEntry: number;
    p75MinutesToEntry: number;
    p90MinutesToEntry: number;
  };
  structureDiagnostics: {
    meanCompressionRatio: number;
    medianCompressionRatio: number;
    meanBreakoutDistanceBps: number;
    medianBreakoutDistanceBps: number;
  };
  costGeometryDiagnostics: { overall: cost_geometry_diagnostic; holdout: cost_geometry_diagnostic };
  overall: compression_cost_metrics & {
    longCompletedCampaignCount: number;
    shortCompletedCampaignCount: number;
    openAtDatasetEndCount: number;
    pendingAtDatasetEndCount: number;
    depositCount: number;
    totalDeposited: number;
    startingEquity: number;
    endingEquity: number;
    economicPnL: number;
  };
  discovery: compression_cost_metrics;
  holdout: compression_cost_metrics & {
    byDirection: Record<wick_direction, compression_direction_metrics>;
  };
  byDirection: Record<wick_direction, compression_direction_metrics>;
  breakEvenDiagnostic: { overall: break_even_diagnostic; holdout: break_even_diagnostic };
  comparisonToImpulse5xCost: impulse_comparison;
  bySevenDayBlock: seven_day_block[];
  campaigns: compression_cost_campaign[];
  classification:
    | 'BTC_5M_COMPRESSION_BREAKOUT_RETEST_5X_COST_HOLDOUT_PROMISING'
    | 'BTC_5M_COMPRESSION_BREAKOUT_RETEST_5X_COST_HOLDOUT_INTERESTING'
    | 'NO_USEFUL_BTC_5M_COMPRESSION_BREAKOUT_RETEST_5X_COST_EDGE';
};

const minute = 60_000;
const week = 7 * 86_400_000;
const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = (values: readonly number[], fraction: number) =>
  values.length === 0
    ? 0
    : [...values].sort((left, right) => left - right)[Math.floor((values.length - 1) * fraction)]!;
const profitFactor = (profit: number, loss: number) => (loss === 0 ? null : profit / loss);
const isCompleted = (campaign: compression_cost_campaign) =>
  campaign.outcome === 'TAKE_PROFIT' ||
  campaign.outcome === 'STOP_LOSS' ||
  campaign.outcome === 'MARGIN_GUARD';
const calculatePnL = (direction: wick_direction, entry: number, exit: number, quantity: number) =>
  (direction === 'LONG_BTC' ? exit - entry : entry - exit) * quantity;

function summarize(
  campaigns: readonly compression_cost_campaign[],
  accounting: {
    raw: number;
    ignoredPending: number;
    ignoredActive: number;
  },
): compression_cost_metrics {
  const filled = campaigns.filter((campaign) => campaign.entryFillPrice !== null),
    completed = campaigns.filter(isCompleted),
    grossWins = completed.filter((campaign) => campaign.grossPnL > 0),
    grossLosses = completed.filter((campaign) => campaign.grossPnL < 0),
    netWins = completed.filter((campaign) => campaign.netPnL > 0),
    netLosses = completed.filter((campaign) => campaign.netPnL < 0),
    grossProfitSum = grossWins.reduce((sum, campaign) => sum + campaign.grossPnL, 0),
    grossLossSumAbs = -grossLosses.reduce((sum, campaign) => sum + campaign.grossPnL, 0),
    netProfitSum = netWins.reduce((sum, campaign) => sum + campaign.netPnL, 0),
    netLossSumAbs = -netLosses.reduce((sum, campaign) => sum + campaign.netPnL, 0),
    holding = completed.flatMap((campaign) =>
      campaign.holdingMinutes === null ? [] : [campaign.holdingMinutes],
    ),
    fees = completed.map((campaign) => campaign.totalFees),
    takeProfitCount = completed.filter((campaign) => campaign.outcome === 'TAKE_PROFIT').length,
    entryFailedCount = campaigns.filter((campaign) => campaign.outcome === 'ENTRY_FAILED').length;
  return {
    rawBreakoutCount: accounting.raw,
    signalAcceptedWhileFlatCount: campaigns.length,
    signalIgnoredWhilePendingCount: accounting.ignoredPending,
    signalIgnoredWhileActiveCount: accounting.ignoredActive,
    entryAttemptCount: campaigns.length,
    entryFilledCount: filled.length,
    entryFailedCount,
    entryFillRate: campaigns.length === 0 ? 0 : filled.length / campaigns.length,
    completedCampaignCount: completed.length,
    takeProfitCount,
    stopLossCount: completed.filter((campaign) => campaign.outcome === 'STOP_LOSS').length,
    marginGuardCount: completed.filter((campaign) => campaign.outcome === 'MARGIN_GUARD').length,
    tpRate: completed.length === 0 ? 0 : takeProfitCount / completed.length,
    grossProfitSum,
    grossLossSumAbs,
    grossPnLSum: grossProfitSum - grossLossSumAbs,
    grossProfitFactor: profitFactor(grossProfitSum, grossLossSumAbs),
    netProfitSum,
    netLossSumAbs,
    netPnLSum: netProfitSum - netLossSumAbs,
    netProfitFactor: profitFactor(netProfitSum, netLossSumAbs),
    meanHoldingMinutes: mean(holding),
    medianHoldingMinutes: percentile(holding, 0.5),
    meanTotalFees: mean(fees),
    medianTotalFees: percentile(fees, 0.5),
  };
}

function costDiagnostic(campaigns: readonly compression_cost_campaign[]): cost_geometry_diagnostic {
  const filled = campaigns.filter((campaign) => campaign.expectedCampaignCostDollars !== null),
    completed = filled.filter(isCompleted),
    values = <K extends keyof compression_cost_campaign>(key: K) =>
      filled.flatMap((campaign) => {
        const value = campaign[key];
        return typeof value === 'number' ? [value] : [];
      }),
    realized = completed.flatMap((campaign) =>
      campaign.realizedToExpectedCostRatio === null ? [] : [campaign.realizedToExpectedCostRatio],
    ),
    distanceBps = filled.flatMap((campaign) =>
      campaign.actualTakeProfitDistance === null || campaign.entryFillPrice === null
        ? []
        : [(campaign.actualTakeProfitDistance / campaign.entryFillPrice) * 10_000],
    );
  return {
    meanExpectedCampaignCostDollars: mean(values('expectedCampaignCostDollars')),
    medianExpectedCampaignCostDollars: percentile(values('expectedCampaignCostDollars'), 0.5),
    meanExpectedCampaignCostBps: mean(values('expectedCampaignCostBps')),
    medianExpectedCampaignCostBps: percentile(values('expectedCampaignCostBps'), 0.5),
    meanFiveCostDistanceBps: mean(distanceBps),
    medianFiveCostDistanceBps: percentile(distanceBps, 0.5),
    meanActualTPCostMultiple: mean(values('actualTakeProfitCostMultiple')),
    medianActualTPCostMultiple: percentile(values('actualTakeProfitCostMultiple'), 0.5),
    meanActualSLCostMultiple: mean(values('actualStopCostMultiple')),
    medianActualSLCostMultiple: percentile(values('actualStopCostMultiple'), 0.5),
    meanRealizedToExpectedCostRatio: mean(realized),
    medianRealizedToExpectedCostRatio: percentile(realized, 0.5),
  };
}

function breakEven(campaigns: readonly compression_cost_campaign[]): break_even_diagnostic {
  const completed = campaigns.filter(isCompleted),
    wins = completed
      .filter((campaign) => campaign.grossPnL > 0)
      .map((campaign) => campaign.grossPnL),
    losses = completed
      .filter((campaign) => campaign.grossPnL < 0)
      .map((campaign) => Math.abs(campaign.grossPnL)),
    fees = completed.map((campaign) => campaign.totalFees),
    meanGrossWin = wins.length === 0 ? null : mean(wins),
    meanGrossLossAbs = losses.length === 0 ? null : mean(losses),
    meanFeePerCampaign = fees.length === 0 ? null : mean(fees),
    actualTpRate =
      completed.length === 0
        ? 0
        : completed.filter((campaign) => campaign.outcome === 'TAKE_PROFIT').length /
          completed.length,
    empiricalBreakEvenWinRate =
      meanGrossWin === null || meanGrossLossAbs === null || meanFeePerCampaign === null
        ? null
        : (meanGrossLossAbs + meanFeePerCampaign) / (meanGrossWin + meanGrossLossAbs);
  return {
    meanGrossWin,
    meanGrossLossAbs,
    meanFeePerCampaign,
    actualTpRate,
    empiricalBreakEvenWinRate,
    winRateGapPercentagePoints:
      empiricalBreakEvenWinRate === null ? null : (actualTpRate - empiricalBreakEvenWinRate) * 100,
  };
}

function directionMetrics(
  campaigns: readonly compression_cost_campaign[],
  rawSignals: Record<wick_direction, number>,
): Record<wick_direction, compression_direction_metrics> {
  const one = (direction: wick_direction) => ({
    ...summarize(
      campaigns.filter((campaign) => campaign.direction === direction),
      {
        raw: rawSignals[direction],
        ignoredPending: 0,
        ignoredActive: 0,
      },
    ),
    signalCount: rawSignals[direction],
  });
  return { LONG_BTC: one('LONG_BTC'), SHORT_BTC: one('SHORT_BTC') };
}

function compareImpulseArtifact(
  candidate: compression_cost_metrics,
  artifact: unknown,
): impulse_comparison {
  if (typeof artifact !== 'object' || artifact === null) return { available: false };
  const holdout = (artifact as Record<string, unknown>).holdout;
  if (typeof holdout !== 'object' || holdout === null) return { available: false };
  const fields = [
      'completedCampaignCount',
      'tpRate',
      'grossProfitFactor',
      'netProfitFactor',
      'grossPnLSum',
      'netPnLSum',
      'meanHoldingMinutes',
      'medianHoldingMinutes',
    ] as const,
    baseline = Object.fromEntries(
      fields.map((field) => [field, (holdout as Record<string, unknown>)[field]]),
    ) as comparison_summary,
    candidateSummary = Object.fromEntries(
      fields.map((field) => [field, candidate[field]]),
    ) as comparison_summary,
    delta: Record<string, number | null> = {};
  for (const field of fields) {
    const left = candidateSummary[field],
      right = baseline[field];
    delta[field] = typeof left === 'number' && typeof right === 'number' ? left - right : null;
  }
  return { available: true, baseline, candidate: candidateSummary, delta };
}

export function classifyCompression5XCost(
  holdout: compression_cost_metrics,
  economicPnL: number,
): compression_cost_report['classification'] {
  if (
    holdout.completedCampaignCount >= 30 &&
    (holdout.grossProfitFactor ?? 0) >= 1 &&
    (holdout.netProfitFactor ?? 0) >= 1 &&
    holdout.netPnLSum > 0 &&
    economicPnL > 0
  )
    return 'BTC_5M_COMPRESSION_BREAKOUT_RETEST_5X_COST_HOLDOUT_PROMISING';
  if (
    holdout.completedCampaignCount >= 30 &&
    (holdout.grossProfitFactor ?? 0) >= 1 &&
    (holdout.netProfitFactor ?? 0) >= 0.8
  )
    return 'BTC_5M_COMPRESSION_BREAKOUT_RETEST_5X_COST_HOLDOUT_INTERESTING';
  return 'NO_USEFUL_BTC_5M_COMPRESSION_BREAKOUT_RETEST_5X_COST_EDGE';
}

export function runBTC5MCompressionBreakoutRetest5XCostReplay(input: {
  candles: readonly BTC_candlestick[];
  market: btc_research_market;
  leverageSource: string;
  impulse5xCostReport?: unknown;
}): compression_cost_report {
  const oneMinute = [...input.candles].sort(
      (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
    ),
    fiveMinute = aggregateBTCOneMinuteCandles(oneMinute),
    byTime = new Map(
      oneMinute.map((candle, index) => [candle.timestamp.getTime(), { candle, index }]),
    );
  const first = fiveMinute[0]?.timestamp.getTime() ?? 0,
    last = fiveMinute.at(-1)?.endTimestamp.getTime() ?? first,
    lastOneMinuteStart = oneMinute.at(-1)?.timestamp.getTime() ?? -1,
    splitTime = first + (last - first) * 0.7;
  const rawSignals: Record<wick_direction, number> = { LONG_BTC: 0, SHORT_BTC: 0 },
    splitSignals: Record<split_label, Record<wick_direction, number>> = {
      DISCOVERY: { LONG_BTC: 0, SHORT_BTC: 0 },
      HOLDOUT: { LONG_BTC: 0, SHORT_BTC: 0 },
    },
    ignoredPending: Record<split_label, number> = { DISCOVERY: 0, HOLDOUT: 0 },
    ignoredActive: Record<split_label, number> = { DISCOVERY: 0, HOLDOUT: 0 };
  const campaigns: compression_cost_campaign[] = [],
    entryMinutes: number[] = [];
  let compressedWindowCount = 0,
    pendingUntil = -1,
    activeUntil = -1,
    equity = BTC5MCompressionBreakoutRetest5XCostExperiment.startingEquity,
    depositCount = 0,
    totalDeposited = 0;
  for (let index = 24; index < fiveMinute.length; index += 1) {
    const breakout = fiveMinute[index]!,
      context = calculateCompressionContext(fiveMinute, index);
    if (!context) continue;
    compressedWindowCount += 1;
    const direction = detectCompressionBreakout(breakout, context);
    if (!direction) continue;
    const breakoutTimestamp = breakout.endTimestamp.getTime(),
      label: split_label = breakoutTimestamp < splitTime ? 'DISCOVERY' : 'HOLDOUT';
    rawSignals[direction] += 1;
    splitSignals[label][direction] += 1;
    if (breakoutTimestamp < pendingUntil) {
      ignoredPending[label] += 1;
      continue;
    }
    if (breakoutTimestamp < activeUntil) {
      ignoredActive[label] += 1;
      continue;
    }
    const entryLimitPrice =
        direction === 'LONG_BTC' ? context.compressionHigh : context.compressionLow,
      entryWindowEndTimestamp = breakoutTimestamp + 30 * minute,
      breakoutDistanceBps =
        direction === 'LONG_BTC'
          ? ((breakout.close - context.compressionHigh) / breakout.close) * 10_000
          : ((context.compressionLow - breakout.close) / breakout.close) * 10_000,
      base = {
        ...context,
        breakoutTimestamp,
        direction,
        breakoutOpen: breakout.open,
        breakoutHigh: breakout.high,
        breakoutLow: breakout.low,
        breakoutClose: breakout.close,
        breakoutDistanceBps,
        entryLimitPrice,
        entryWindowStartTimestamp: breakoutTimestamp,
        entryWindowEndTimestamp,
        equityBeforeCampaign: equity,
        splitLabel: label,
      };
    let fill: { candle: BTC_candlestick; index: number; minuteIndex: number } | null = null;
    for (let entryMinute = 1; entryMinute <= 30; entryMinute += 1) {
      const point = byTime.get(breakoutTimestamp + (entryMinute - 1) * minute);
      if (
        point &&
        isResearchLimitFillable(direction, entryLimitPrice, point.candle, input.market.tickSize)
      ) {
        fill = { ...point, minuteIndex: entryMinute };
        break;
      }
    }
    const empty = (
      outcome: 'ENTRY_FAILED' | 'PENDING_AT_DATASET_END',
    ): compression_cost_campaign => ({
      ...base,
      entryFillTimestamp: null,
      minutesToEntry: null,
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
      completionTimestamp: outcome === 'ENTRY_FAILED' ? entryWindowEndTimestamp : null,
      outcome,
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
      const pendingAtEnd = lastOneMinuteStart < breakoutTimestamp + 29 * minute;
      campaigns.push(empty(pendingAtEnd ? 'PENDING_AT_DATASET_END' : 'ENTRY_FAILED'));
      pendingUntil = pendingAtEnd ? Number.POSITIVE_INFINITY : entryWindowEndTimestamp;
      activeUntil = -1;
      continue;
    }
    const sizing = calculateSingleLegSizing(equity, entryLimitPrice, input.market);
    if (!sizing) {
      campaigns.push(empty('ENTRY_FAILED'));
      pendingUntil = fill.candle.timestamp.getTime() + minute;
      activeUntil = -1;
      continue;
    }
    entryMinutes.push(fill.minuteIndex);
    const geometry = calculateFiveCostGeometry({
      direction,
      fillPrice: entryLimitPrice,
      quantity: sizing.quantity,
      entryNotional: sizing.notional,
      makerFeeRate: input.market.makerFeeRate,
      takerFeeRate: input.market.takerFeeRate,
      tickSize: input.market.tickSize,
    });
    if (
      geometry.actualStopCostMultiple + 1e-10 < 5 ||
      geometry.actualTakeProfitCostMultiple + 1e-10 < 5
    )
      throw new Error('FIVE_COST_GEOMETRY_ROUNDED_INWARD');
    let outcome: campaign_outcome = 'OPEN_AT_DATASET_END',
      exitPrice: number | null = null,
      completionTimestamp: number | null = null;
    for (let candleIndex = fill.index; candleIndex < oneMinute.length; candleIndex += 1) {
      const candle = oneMinute[candleIndex]!,
        health = evaluateSingleLegMarginGuard({
          equity: equity - geometry.expectedEntryFeeDollars,
          direction,
          entryPrice: entryLimitPrice,
          markPrice: candle.close,
          quantity: sizing.quantity,
          maximumLeverage: input.market.maximumLeverage,
        }),
        stopHit =
          direction === 'LONG_BTC'
            ? candle.low <= geometry.stopTriggerPrice
            : candle.high >= geometry.stopTriggerPrice,
        targetHit =
          direction === 'LONG_BTC'
            ? candle.high >= geometry.takeProfitTriggerPrice
            : candle.low <= geometry.takeProfitTriggerPrice;
      if (health.triggered) {
        outcome = 'MARGIN_GUARD';
        exitPrice = candle.close;
      } else if (stopHit) {
        outcome = 'STOP_LOSS';
        exitPrice = geometry.stopTriggerPrice;
      } else if (targetHit) {
        outcome = 'TAKE_PROFIT';
        exitPrice = geometry.takeProfitTriggerPrice;
      }
      if (exitPrice !== null) {
        completionTimestamp = candle.timestamp.getTime() + minute;
        break;
      }
    }
    const entryFee = geometry.expectedEntryFeeDollars,
      grossPnL =
        exitPrice === null
          ? 0
          : calculatePnL(direction, entryLimitPrice, exitPrice, sizing.quantity),
      exitFee =
        exitPrice === null
          ? 0
          : Math.abs(exitPrice * sizing.quantity) *
            (outcome === 'TAKE_PROFIT' ? input.market.makerFeeRate : input.market.takerFeeRate),
      totalFees = entryFee + exitFee,
      netPnL = exitPrice === null ? 0 : grossPnL - totalFees,
      equityAfterRealization = exitPrice === null ? equity : equity + netPnL;
    let deposit = 0;
    if (
      exitPrice !== null &&
      equityAfterRealization < BTC5MCompressionBreakoutRetest5XCostExperiment.depositTrigger
    ) {
      deposit = BTC5MCompressionBreakoutRetest5XCostExperiment.depositAmount;
      depositCount += 1;
      totalDeposited += deposit;
    }
    const entryFillTimestamp = fill.candle.timestamp.getTime() + minute;
    campaigns.push({
      ...base,
      entryFillTimestamp,
      minutesToEntry: fill.minuteIndex,
      entryFillPrice: entryLimitPrice,
      entryLeverage: input.market.maximumLeverage,
      entryNotional: sizing.notional,
      quantity: sizing.quantity,
      initialMarginUsed: sizing.initialMargin,
      ...geometry,
      completionTimestamp,
      outcome,
      exitPrice,
      holdingMinutes:
        completionTimestamp === null ? null : (completionTimestamp - entryFillTimestamp) / minute,
      grossPnL,
      totalFees,
      realizedToExpectedCostRatio:
        exitPrice === null ? null : totalFees / geometry.expectedCampaignCostDollars,
      netPnL,
      equityAfterRealization,
      depositAppliedAfterCampaign: deposit,
    });
    pendingUntil = entryFillTimestamp;
    activeUntil = completionTimestamp ?? Number.POSITIVE_INFINITY;
    if (exitPrice !== null) equity = equityAfterRealization + deposit;
  }
  const splitCampaigns = (label: split_label) =>
      campaigns.filter((campaign) => campaign.splitLabel === label),
    accounting = (label?: split_label) => ({
      raw: label
        ? splitSignals[label].LONG_BTC + splitSignals[label].SHORT_BTC
        : rawSignals.LONG_BTC + rawSignals.SHORT_BTC,
      ignoredPending: label
        ? ignoredPending[label]
        : ignoredPending.DISCOVERY + ignoredPending.HOLDOUT,
      ignoredActive: label ? ignoredActive[label] : ignoredActive.DISCOVERY + ignoredActive.HOLDOUT,
    }),
    overall = summarize(campaigns, accounting()),
    discoveryCampaigns = splitCampaigns('DISCOVERY'),
    holdoutCampaigns = splitCampaigns('HOLDOUT'),
    discovery = summarize(discoveryCampaigns, accounting('DISCOVERY')),
    holdout = summarize(holdoutCampaigns, accounting('HOLDOUT')),
    completed = campaigns.filter(isCompleted),
    economicPnL = equity - 30 - totalDeposited;
  const groups = new Map<number, compression_cost_campaign[]>();
  for (const campaign of campaigns) {
    const block = Math.floor((campaign.breakoutTimestamp - first) / week),
      values = groups.get(block) ?? [];
    values.push(campaign);
    groups.set(block, values);
  }
  const bySevenDayBlock = [...groups]
    .sort(([left], [right]) => left - right)
    .map(([blockIndex, values]): seven_day_block => {
      const value = summarize(values, { raw: values.length, ignoredPending: 0, ignoredActive: 0 });
      return {
        blockIndex,
        startTimestamp: first + blockIndex * week,
        longBreakoutSignals: values.filter((campaign) => campaign.direction === 'LONG_BTC').length,
        shortBreakoutSignals: values.filter((campaign) => campaign.direction === 'SHORT_BTC')
          .length,
        entryAttempts: value.entryAttemptCount,
        entryFills: value.entryFilledCount,
        entryFillRate: value.entryFillRate,
        completedCampaignCount: value.completedCampaignCount,
        takeProfitCount: value.takeProfitCount,
        stopLossCount: value.stopLossCount,
        marginGuardCount: value.marginGuardCount,
        tpRate: value.tpRate,
        grossProfitFactor: value.grossProfitFactor,
        netProfitFactor: value.netProfitFactor,
        grossPnLSum: value.grossPnLSum,
        netPnLSum: value.netPnLSum,
        meanHoldingMinutes: value.meanHoldingMinutes,
      };
    });
  return {
    experimentId: BTC5MCompressionBreakoutRetest5XCostExperiment.experimentId,
    dataRange: {
      firstTimestamp: oneMinute[0]?.timestamp.getTime() ?? null,
      lastTimestamp: oneMinute.at(-1)?.timestamp.getTime() ?? null,
      oneMinuteCandleCount: oneMinute.length,
    },
    leverageSource: input.leverageSource,
    executionSemantics: {
      entry: 'PASSIVE_LIMIT_ONE_TICK_TRADE_THROUGH',
      exit: 'TP_RESTING_LIMIT_MAKER;SL_AND_MARGIN_GUARD_AGGRESSIVE_TAKER',
      ambiguity: 'STOP_LOSS',
    },
    compressionDefinition: { rule: 'recent12Range<previous12Range' },
    breakoutDefinition: {
      long: 'completedClose>compressionHigh',
      short: 'completedClose<compressionLow',
    },
    entryDefinition: {
      long: 'compressionHigh',
      short: 'compressionLow',
      lifetime: 'NEXT_EXACTLY_30_1M_CANDLES',
    },
    costDefinition: {
      entry: 'entryNotional*makerFeeRate',
      exit: 'entryNotional*takerFeeRate',
      distance: '5*(expectedCampaignCost/abs(quantity))',
      futureFees: 'NOT_USED',
    },
    exitDefinition: {
      long: 'fill+-5xCostDistance',
      short: 'fill-+5xCostDistance',
      tickRounding: 'OUTWARD',
      sameCandleAmbiguity: 'STOP_LOSS',
    },
    split: { discoveryEndTimestamp: splitTime, discoveryFraction: 0.7 },
    signalAccounting: {
      valid5mCandleCount: fiveMinute.length,
      contextEligible5mCandleCount: Math.max(0, fiveMinute.length - 24),
      compressedWindowCount,
      longBreakoutCount: rawSignals.LONG_BTC,
      shortBreakoutCount: rawSignals.SHORT_BTC,
      rawBreakoutCount: rawSignals.LONG_BTC + rawSignals.SHORT_BTC,
      signalAcceptedWhileFlatCount: campaigns.length,
      signalIgnoredWhilePendingCount: ignoredPending.DISCOVERY + ignoredPending.HOLDOUT,
      signalIgnoredWhileActiveCount: ignoredActive.DISCOVERY + ignoredActive.HOLDOUT,
      entryAttemptCount: campaigns.length,
      entryFilledCount: overall.entryFilledCount,
      entryFailedCount: overall.entryFailedCount,
      entryFillRate: overall.entryFillRate,
      filledWithin5mCount: entryMinutes.filter((value) => value <= 5).length,
      filledWithin10mCount: entryMinutes.filter((value) => value <= 10).length,
      filledWithin15mCount: entryMinutes.filter((value) => value <= 15).length,
      filledWithin20mCount: entryMinutes.filter((value) => value <= 20).length,
      filledWithin30mCount: entryMinutes.length,
    },
    entryTimingDiagnostics: {
      meanMinutesToEntry: mean(entryMinutes),
      medianMinutesToEntry: percentile(entryMinutes, 0.5),
      p25MinutesToEntry: percentile(entryMinutes, 0.25),
      p75MinutesToEntry: percentile(entryMinutes, 0.75),
      p90MinutesToEntry: percentile(entryMinutes, 0.9),
    },
    structureDiagnostics: {
      meanCompressionRatio: mean(campaigns.map((campaign) => campaign.compressionRatio)),
      medianCompressionRatio: percentile(
        campaigns.map((campaign) => campaign.compressionRatio),
        0.5,
      ),
      meanBreakoutDistanceBps: mean(campaigns.map((campaign) => campaign.breakoutDistanceBps)),
      medianBreakoutDistanceBps: percentile(
        campaigns.map((campaign) => campaign.breakoutDistanceBps),
        0.5,
      ),
    },
    costGeometryDiagnostics: {
      overall: costDiagnostic(campaigns),
      holdout: costDiagnostic(holdoutCampaigns),
    },
    overall: {
      ...overall,
      longCompletedCampaignCount: completed.filter((campaign) => campaign.direction === 'LONG_BTC')
        .length,
      shortCompletedCampaignCount: completed.filter(
        (campaign) => campaign.direction === 'SHORT_BTC',
      ).length,
      openAtDatasetEndCount: campaigns.filter(
        (campaign) => campaign.outcome === 'OPEN_AT_DATASET_END',
      ).length,
      pendingAtDatasetEndCount: campaigns.filter(
        (campaign) => campaign.outcome === 'PENDING_AT_DATASET_END',
      ).length,
      depositCount,
      totalDeposited,
      startingEquity: 30,
      endingEquity: equity,
      economicPnL,
    },
    discovery,
    holdout: { ...holdout, byDirection: directionMetrics(holdoutCampaigns, splitSignals.HOLDOUT) },
    byDirection: directionMetrics(campaigns, rawSignals),
    breakEvenDiagnostic: { overall: breakEven(campaigns), holdout: breakEven(holdoutCampaigns) },
    comparisonToImpulse5xCost: compareImpulseArtifact(holdout, input.impulse5xCostReport),
    bySevenDayBlock,
    campaigns,
    classification: classifyCompression5XCost(holdout, economicPnL),
  };
}
