import type { BTC_candlestick } from './decibel_client.js';
import {
  detectImpulseSignal,
  type impulse_geometry,
  type impulse_metrics,
} from './btc_5m_impulse_continuation_research.js';
import {
  aggregateBTCOneMinuteCandles,
  calculateSingleLegSizing,
  evaluateSingleLegMarginGuard,
  isResearchLimitFillable,
  type btc_research_market,
  type split_label,
  type wick_direction,
} from './btc_5m_wick_rejection_research.js';

export const BTC5MImpulsePullbackExperiment = {
  experimentId: 'BTC_5M_IMPULSE_PULLBACK_1R_V1' as const,
  entryWindowMinutes: 5,
};

export type pullback_outcome =
  | 'ENTRY_FAILED'
  | 'PENDING_AT_DATASET_END'
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'MARGIN_GUARD'
  | 'OPEN_AT_DATASET_END';
export type pullback_campaign = {
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
  entryWindowStartTimestamp: number;
  entryWindowEndTimestamp: number;
  entryFillMinuteIndex: 1 | 2 | 3 | 4 | 5 | null;
  entryFillTimestamp: number | null;
  entryFillPrice: number | null;
  entryLeverage: number | null;
  entryNotional: number | null;
  initialMarginUsed: number | null;
  riskDistance: number | null;
  stopTriggerPrice: number;
  takeProfitTriggerPrice: number | null;
  completionTimestamp: number | null;
  outcome: pullback_outcome;
  exitPrice: number | null;
  holdingMinutes: number | null;
  grossPnL: number;
  totalFees: number;
  netPnL: number;
  equityBeforeCampaign: number;
  equityAfterRealization: number;
  depositAppliedAfterCampaign: number;
  splitLabel: split_label;
};
export type pullback_metrics = impulse_metrics & {
  signalAcceptedWhileFlatCount: number;
  signalIgnoredWhilePendingCount: number;
  signalIgnoredWhileActiveCount: number;
  entryAttemptCount: number;
  entryFailedCount: number;
  entryFillRate: number;
};
export type pullback_direction_metrics = Omit<pullback_metrics, 'rawSignalCount'> & {
  signalCount: number;
};
type comparison_metrics = {
  completedCampaignCount: number;
  tpRate: number;
  grossProfitFactor: number | null;
  netProfitFactor: number | null;
  netPnLSum: number;
  meanHoldingMinutes?: number;
};
export type close_entry_comparison =
  | { available: false }
  | {
      available: true;
      closeEntry: { overall: comparison_metrics; holdout: comparison_metrics };
      bodyMidpointPullbackEntry: { overall: comparison_metrics; holdout: comparison_metrics };
      delta: { overall: comparison_metrics; holdout: comparison_metrics };
    };
export type pullback_replay_report = {
  experimentId: typeof BTC5MImpulsePullbackExperiment.experimentId;
  dataRange: {
    firstTimestamp: number | null;
    lastTimestamp: number | null;
    oneMinuteCandleCount: number;
  };
  leverageSource: string;
  executionSemantics: Record<string, string>;
  signalDefinition: Record<string, string>;
  entryDefinition: Record<string, string>;
  exitDefinition: Record<string, string>;
  split: { discoveryEndTimestamp: number; discoveryFraction: 0.7 };
  signalAccounting: {
    valid5mCandleCount: number;
    contextEligible5mCandleCount: number;
    longSignalCount: number;
    shortSignalCount: number;
    rawSignalCount: number;
    signalRate: number;
    signalAcceptedWhileFlatCount: number;
    signalIgnoredWhilePendingCount: number;
    signalIgnoredWhileActiveCount: number;
    entryAttemptCount: number;
    entryFilledCount: number;
    entryFailedCount: number;
    entryFillRate: number;
    filledOnMinute1Count: number;
    filledOnMinute2Count: number;
    filledOnMinute3Count: number;
    filledOnMinute4Count: number;
    filledOnMinute5Count: number;
  };
  entryTimingDiagnostics: {
    meanPullbackDistanceFromSignalClose: number;
    medianPullbackDistanceFromSignalClose: number;
    meanPullbackFractionOfSignalBody: number;
  };
  overall: pullback_metrics & {
    longCompletedCampaignCount: number;
    shortCompletedCampaignCount: number;
    openAtDatasetEndCount: number;
    pendingAtDatasetEndCount: number;
    meanTotalFees: number;
    depositCount: number;
    totalDeposited: number;
    startingEquity: number;
    endingEquity: number;
    economicPnL: number;
  };
  discovery: pullback_metrics;
  holdout: pullback_metrics & { byDirection: Record<wick_direction, pullback_direction_metrics> };
  byDirection: Record<wick_direction, pullback_direction_metrics>;
  bySevenDayBlock: Array<Record<string, number | null>>;
  comparisonToCloseEntry: close_entry_comparison;
  campaigns: pullback_campaign[];
  classification:
    | 'BTC_5M_IMPULSE_PULLBACK_1R_HOLDOUT_PROMISING'
    | 'BTC_5M_IMPULSE_PULLBACK_1R_HOLDOUT_INTERESTING'
    | 'NO_USEFUL_BTC_5M_IMPULSE_PULLBACK_1R_EDGE';
};

const minute = 60_000,
  week = 7 * 86_400_000;
const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values: readonly number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right),
    middle = sorted.length / 2;
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[Math.floor(middle)]!;
};
const profitFactor = (values: readonly number[]) => {
  const wins = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0),
    losses = -values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return losses === 0 ? null : wins / losses;
};
const pnl = (direction: wick_direction, entry: number, exit: number, quantity: number) =>
  (direction === 'LONG_BTC' ? exit - entry : entry - exit) * quantity;
export const calculateBodyMidpointEntry = (open: number, close: number) => (open + close) / 2;

function summarize(
  campaigns: readonly pullback_campaign[],
  rawSignals = 0,
  accepted = campaigns.length,
  ignoredPending = 0,
  ignoredActive = 0,
): pullback_metrics {
  const filled = campaigns.filter((value) => value.entryFillPrice !== null),
    completed = filled.filter((value) =>
      ['TAKE_PROFIT', 'STOP_LOSS', 'MARGIN_GUARD'].includes(value.outcome),
    ),
    gross = completed.map((value) => value.grossPnL),
    net = completed.map((value) => value.netPnL),
    holding = completed.flatMap((value) =>
      value.holdingMinutes === null ? [] : [value.holdingMinutes],
    ),
    attempts = campaigns.length,
    failed = campaigns.filter((value) => value.outcome === 'ENTRY_FAILED').length,
    takeProfitCount = completed.filter((value) => value.outcome === 'TAKE_PROFIT').length;
  return {
    rawSignalCount: rawSignals,
    signalAcceptedWhileFlatCount: accepted,
    signalIgnoredWhilePendingCount: ignoredPending,
    signalIgnoredWhileActiveCount: ignoredActive,
    entryAttemptCount: attempts,
    entryFilledCount: filled.length,
    entryFailedCount: failed,
    entryFillRate: attempts === 0 ? 0 : filled.length / attempts,
    completedCampaignCount: completed.length,
    takeProfitCount,
    stopLossCount: completed.filter((value) => value.outcome === 'STOP_LOSS').length,
    marginGuardCount: completed.filter((value) => value.outcome === 'MARGIN_GUARD').length,
    tpRate: completed.length === 0 ? 0 : takeProfitCount / completed.length,
    grossPnLSum: gross.reduce((sum, value) => sum + value, 0),
    netPnLSum: net.reduce((sum, value) => sum + value, 0),
    grossProfitFactor: profitFactor(gross),
    netProfitFactor: profitFactor(net),
    meanHoldingMinutes: mean(holding),
    medianHoldingMinutes: median(holding),
  };
}

function directions(
  campaigns: readonly pullback_campaign[],
  signals: Record<wick_direction, number>,
): Record<wick_direction, pullback_direction_metrics> {
  const one = (direction: wick_direction): pullback_direction_metrics => {
    const value = summarize(campaigns.filter((campaign) => campaign.direction === direction));
    return {
      signalCount: signals[direction],
      signalAcceptedWhileFlatCount: value.signalAcceptedWhileFlatCount,
      signalIgnoredWhilePendingCount: value.signalIgnoredWhilePendingCount,
      signalIgnoredWhileActiveCount: value.signalIgnoredWhileActiveCount,
      entryAttemptCount: value.entryAttemptCount,
      entryFilledCount: value.entryFilledCount,
      entryFailedCount: value.entryFailedCount,
      entryFillRate: value.entryFillRate,
      completedCampaignCount: value.completedCampaignCount,
      takeProfitCount: value.takeProfitCount,
      stopLossCount: value.stopLossCount,
      marginGuardCount: value.marginGuardCount,
      tpRate: value.tpRate,
      grossPnLSum: value.grossPnLSum,
      netPnLSum: value.netPnLSum,
      grossProfitFactor: value.grossProfitFactor,
      netProfitFactor: value.netProfitFactor,
      meanHoldingMinutes: value.meanHoldingMinutes,
      medianHoldingMinutes: value.medianHoldingMinutes,
    };
  };
  return { LONG_BTC: one('LONG_BTC'), SHORT_BTC: one('SHORT_BTC') };
}

export function classifyPullbackReport(
  holdout: pullback_metrics,
  economicPnL: number,
): pullback_replay_report['classification'] {
  if (
    holdout.completedCampaignCount >= 30 &&
    (holdout.grossProfitFactor ?? 0) >= 1 &&
    (holdout.netProfitFactor ?? 0) >= 1 &&
    holdout.netPnLSum > 0 &&
    economicPnL > 0
  )
    return 'BTC_5M_IMPULSE_PULLBACK_1R_HOLDOUT_PROMISING';
  if (
    holdout.completedCampaignCount >= 30 &&
    (holdout.grossProfitFactor ?? 0) >= 1 &&
    (holdout.netProfitFactor ?? 0) >= 0.8
  )
    return 'BTC_5M_IMPULSE_PULLBACK_1R_HOLDOUT_INTERESTING';
  return 'NO_USEFUL_BTC_5M_IMPULSE_PULLBACK_1R_EDGE';
}

function comparisonMetric(value: pullback_metrics): comparison_metrics {
  return {
    completedCampaignCount: value.completedCampaignCount,
    tpRate: value.tpRate,
    grossProfitFactor: value.grossProfitFactor,
    netProfitFactor: value.netProfitFactor,
    netPnLSum: value.netPnLSum,
    meanHoldingMinutes: value.meanHoldingMinutes,
  };
}
export function buildCloseEntryComparison(
  overall: pullback_metrics,
  holdout: pullback_metrics,
  old: unknown,
): close_entry_comparison {
  if (typeof old !== 'object' || old === null) return { available: false };
  const record = old as Record<string, unknown>,
    oldOverall = record.overall,
    oldHoldout = record.holdout;
  if (
    typeof oldOverall !== 'object' ||
    oldOverall === null ||
    typeof oldHoldout !== 'object' ||
    oldHoldout === null
  )
    return { available: false };
  const parse = (value: object): comparison_metrics | null => {
    const item = value as Record<string, unknown>;
    const required = ['completedCampaignCount', 'tpRate', 'netPnLSum'] as const;
    if (!required.every((key) => typeof item[key] === 'number')) return null;
    return {
      completedCampaignCount: item.completedCampaignCount as number,
      tpRate: item.tpRate as number,
      grossProfitFactor: typeof item.grossProfitFactor === 'number' ? item.grossProfitFactor : null,
      netProfitFactor: typeof item.netProfitFactor === 'number' ? item.netProfitFactor : null,
      netPnLSum: item.netPnLSum as number,
      ...(typeof item.meanHoldingMinutes === 'number'
        ? { meanHoldingMinutes: item.meanHoldingMinutes }
        : {}),
    };
  };
  const closeOverall = parse(oldOverall),
    closeHoldout = parse(oldHoldout);
  if (!closeOverall || !closeHoldout) return { available: false };
  const currentOverall = comparisonMetric(overall),
    currentHoldout = comparisonMetric(holdout);
  const delta = (next: comparison_metrics, prior: comparison_metrics): comparison_metrics => ({
    completedCampaignCount: next.completedCampaignCount - prior.completedCampaignCount,
    tpRate: next.tpRate - prior.tpRate,
    grossProfitFactor:
      next.grossProfitFactor === null || prior.grossProfitFactor === null
        ? null
        : next.grossProfitFactor - prior.grossProfitFactor,
    netProfitFactor:
      next.netProfitFactor === null || prior.netProfitFactor === null
        ? null
        : next.netProfitFactor - prior.netProfitFactor,
    netPnLSum: next.netPnLSum - prior.netPnLSum,
    ...(next.meanHoldingMinutes === undefined || prior.meanHoldingMinutes === undefined
      ? {}
      : { meanHoldingMinutes: next.meanHoldingMinutes - prior.meanHoldingMinutes }),
  });
  return {
    available: true,
    closeEntry: { overall: closeOverall, holdout: closeHoldout },
    bodyMidpointPullbackEntry: { overall: currentOverall, holdout: currentHoldout },
    delta: {
      overall: delta(currentOverall, closeOverall),
      holdout: delta(currentHoldout, closeHoldout),
    },
  };
}

export function runBTC5MImpulsePullbackReplay(input: {
  candles: readonly BTC_candlestick[];
  market: btc_research_market;
  leverageSource: string;
  closeEntryReport?: unknown;
}): pullback_replay_report {
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
    };
  const ignoredPending: Record<split_label, number> = { DISCOVERY: 0, HOLDOUT: 0 },
    ignoredActive: Record<split_label, number> = { DISCOVERY: 0, HOLDOUT: 0 };
  const campaigns: pullback_campaign[] = [],
    fillMinutes = [0, 0, 0, 0, 0];
  let pendingUntil = -1,
    activeUntil = -1,
    equity = 30,
    deposits = 0,
    deposited = 0;
  for (let signalIndex = 12; signalIndex < fiveMinute.length; signalIndex += 1) {
    const signal = detectImpulseSignal(fiveMinute, signalIndex);
    if (!signal) continue;
    const candle = fiveMinute[signalIndex]!,
      signalTime = candle.endTimestamp.getTime();
    const label: split_label = signalTime < splitTime ? 'DISCOVERY' : 'HOLDOUT';
    signals[signal.direction] += 1;
    splitSignals[label][signal.direction] += 1;
    if (signalTime <= activeUntil) {
      ignoredActive[label] += 1;
      continue;
    }
    if (signalTime < pendingUntil) {
      ignoredPending[label] += 1;
      continue;
    }
    const limit = calculateBodyMidpointEntry(candle.open, candle.close),
      windowEnd = signalTime + 5 * minute;
    pendingUntil = windowEnd;
    const base = {
      signal5mStartTimestamp: candle.timestamp.getTime(),
      signal5mEndTimestamp: signalTime,
      direction: signal.direction,
      signalOpen: candle.open,
      signalHigh: candle.high,
      signalLow: candle.low,
      signalClose: candle.close,
      ...(signal.geometry satisfies impulse_geometry),
      previous12MedianRange: signal.previous12MedianRange,
      entryLimitPrice: limit,
      entryWindowStartTimestamp: signalTime,
      entryWindowEndTimestamp: windowEnd,
      stopTriggerPrice: candle.open,
      equityBeforeCampaign: equity,
      splitLabel: label,
    };
    let fill: { candle: BTC_candlestick; index: number; minuteIndex: 1 | 2 | 3 | 4 | 5 } | null =
      null;
    for (let entryMinute = 1; entryMinute <= 5; entryMinute += 1) {
      const point = byTime.get(signalTime + (entryMinute - 1) * minute);
      if (!point) continue;
      if (isResearchLimitFillable(signal.direction, limit, point.candle, input.market.tickSize)) {
        fill = { ...point, minuteIndex: entryMinute as 1 | 2 | 3 | 4 | 5 };
        break;
      }
    }
    if (!fill) {
      const pendingAtEnd = (oneMinute.at(-1)?.timestamp.getTime() ?? -1) < windowEnd - minute;
      campaigns.push({
        ...base,
        entryFillMinuteIndex: null,
        entryFillTimestamp: null,
        entryFillPrice: null,
        entryLeverage: null,
        entryNotional: null,
        initialMarginUsed: null,
        riskDistance: null,
        takeProfitTriggerPrice: null,
        completionTimestamp: pendingAtEnd ? null : windowEnd,
        outcome: pendingAtEnd ? 'PENDING_AT_DATASET_END' : 'ENTRY_FAILED',
        exitPrice: null,
        holdingMinutes: null,
        grossPnL: 0,
        totalFees: 0,
        netPnL: 0,
        equityAfterRealization: equity,
        depositAppliedAfterCampaign: 0,
      });
      continue;
    }
    fillMinutes[fill.minuteIndex - 1] = fillMinutes[fill.minuteIndex - 1]! + 1;
    const sizing = calculateSingleLegSizing(equity, limit, input.market),
      risk = signal.direction === 'LONG_BTC' ? limit - candle.open : candle.open - limit;
    if (!sizing || risk <= 0) {
      campaigns.push({
        ...base,
        entryFillMinuteIndex: null,
        entryFillTimestamp: null,
        entryFillPrice: null,
        entryLeverage: null,
        entryNotional: null,
        initialMarginUsed: null,
        riskDistance: null,
        takeProfitTriggerPrice: null,
        completionTimestamp: fill.candle.timestamp.getTime() + minute,
        outcome: 'ENTRY_FAILED',
        exitPrice: null,
        holdingMinutes: null,
        grossPnL: 0,
        totalFees: 0,
        netPnL: 0,
        equityAfterRealization: equity,
        depositAppliedAfterCampaign: 0,
      });
      continue;
    }
    const target = signal.direction === 'LONG_BTC' ? limit + risk : limit - risk,
      entryFee = sizing.notional * input.market.makerFeeRate;
    let outcome: pullback_outcome = 'OPEN_AT_DATASET_END',
      exit: number | null = null,
      completion: number | null = null;
    for (let index = fill.index; index < oneMinute.length; index += 1) {
      const execution = oneMinute[index]!;
      const health = evaluateSingleLegMarginGuard({
        equity: equity - entryFee,
        direction: signal.direction,
        entryPrice: limit,
        markPrice: execution.close,
        quantity: sizing.quantity,
        maximumLeverage: input.market.maximumLeverage,
      });
      const stopHit =
          signal.direction === 'LONG_BTC'
            ? execution.low <= candle.open
            : execution.high >= candle.open,
        targetHit =
          signal.direction === 'LONG_BTC' ? execution.high >= target : execution.low <= target;
      if (health.triggered) {
        outcome = 'MARGIN_GUARD';
        exit = execution.close;
      } else if (stopHit) {
        outcome = 'STOP_LOSS';
        exit = candle.open;
      } else if (targetHit) {
        outcome = 'TAKE_PROFIT';
        exit = target;
      }
      if (exit !== null) {
        completion = execution.timestamp.getTime() + minute;
        activeUntil = completion;
        break;
      }
    }
    const gross = exit === null ? 0 : pnl(signal.direction, limit, exit, sizing.quantity),
      exitFee =
        exit === null
          ? 0
          : Math.abs(exit * sizing.quantity) *
            (outcome === 'TAKE_PROFIT' ? input.market.makerFeeRate : input.market.takerFeeRate),
      fees = entryFee + exitFee,
      net = exit === null ? 0 : gross - fees,
      after = exit === null ? equity : equity + net;
    let deposit = 0;
    if (exit !== null && after < 15) {
      deposit = 15;
      deposits += 1;
      deposited += 15;
    }
    campaigns.push({
      ...base,
      entryFillMinuteIndex: fill.minuteIndex,
      entryFillTimestamp: fill.candle.timestamp.getTime() + minute,
      entryFillPrice: limit,
      entryLeverage: input.market.maximumLeverage,
      entryNotional: sizing.notional,
      initialMarginUsed: sizing.initialMargin,
      riskDistance: risk,
      takeProfitTriggerPrice: target,
      completionTimestamp: completion,
      outcome,
      exitPrice: exit,
      holdingMinutes:
        completion === null
          ? null
          : (completion - (fill.candle.timestamp.getTime() + minute)) / minute,
      grossPnL: gross,
      totalFees: fees,
      netPnL: net,
      equityAfterRealization: after,
      depositAppliedAfterCampaign: deposit,
    });
    if (exit === null) activeUntil = Number.POSITIVE_INFINITY;
    else equity = after + deposit;
  }
  const discoveryCampaigns = campaigns.filter((value) => value.splitLabel === 'DISCOVERY'),
    holdoutCampaigns = campaigns.filter((value) => value.splitLabel === 'HOLDOUT');
  const overall = summarize(
    campaigns,
    signals.LONG_BTC + signals.SHORT_BTC,
    campaigns.length,
    ignoredPending.DISCOVERY + ignoredPending.HOLDOUT,
    ignoredActive.DISCOVERY + ignoredActive.HOLDOUT,
  );
  const holdout = summarize(
    holdoutCampaigns,
    splitSignals.HOLDOUT.LONG_BTC + splitSignals.HOLDOUT.SHORT_BTC,
    holdoutCampaigns.length,
    ignoredPending.HOLDOUT,
    ignoredActive.HOLDOUT,
  );
  const economicPnL = equity - 30 - deposited;
  const groups = new Map<number, pullback_campaign[]>();
  for (const campaign of campaigns) {
    const key = Math.floor((campaign.signal5mEndTimestamp - first) / week);
    const values = groups.get(key) ?? [];
    values.push(campaign);
    groups.set(key, values);
  }
  const filled = campaigns.filter((value) => value.entryFillPrice !== null),
    distances = filled.map((value) => Math.abs(value.signalClose - value.entryFillPrice!));
  return {
    experimentId: BTC5MImpulsePullbackExperiment.experimentId,
    dataRange: {
      firstTimestamp: oneMinute[0]?.timestamp.getTime() ?? null,
      lastTimestamp: oneMinute.at(-1)?.timestamp.getTime() ?? null,
      oneMinuteCandleCount: oneMinute.length,
    },
    leverageSource: input.leverageSource,
    executionSemantics: {
      entry: 'FIVE_ONE_MINUTE_CANDLES_PASSIVE_LIMIT_TRADE_THROUGH_ONE_TICK',
      takeProfit: 'RESTING_LIMIT_MAKER_FEE',
      stopAndMargin: 'AGGRESSIVE_LIMIT_TAKER_FEE',
      entryCandleAmbiguity: 'ADVERSE_STOP_LOSS',
    },
    signalDefinition: { source: 'BTC_5M_IMPULSE_CONTINUATION_1R_V1_UNCHANGED' },
    entryDefinition: {
      price: '(signalOpen+signalClose)/2',
      lifetime: 'NEXT_EXACTLY_FIVE_1M_CANDLES',
    },
    exitDefinition: {
      stop: 'SIGNAL_5M_OPEN',
      target: 'EXACTLY_1R_FROM_ACTUAL_FILL',
      ambiguity: 'STOP_LOSS',
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
      signalIgnoredWhilePendingCount: ignoredPending.DISCOVERY + ignoredPending.HOLDOUT,
      signalIgnoredWhileActiveCount: ignoredActive.DISCOVERY + ignoredActive.HOLDOUT,
      entryAttemptCount: campaigns.length,
      entryFilledCount: overall.entryFilledCount,
      entryFailedCount: overall.entryFailedCount,
      entryFillRate: overall.entryFillRate,
      filledOnMinute1Count: fillMinutes[0]!,
      filledOnMinute2Count: fillMinutes[1]!,
      filledOnMinute3Count: fillMinutes[2]!,
      filledOnMinute4Count: fillMinutes[3]!,
      filledOnMinute5Count: fillMinutes[4]!,
    },
    entryTimingDiagnostics: {
      meanPullbackDistanceFromSignalClose: mean(distances),
      medianPullbackDistanceFromSignalClose: median(distances),
      meanPullbackFractionOfSignalBody: mean(
        filled.map((value) => Math.abs(value.signalClose - value.entryFillPrice!) / value.body),
      ),
    },
    overall: {
      ...overall,
      longCompletedCampaignCount: campaigns.filter(
        (value) =>
          value.direction === 'LONG_BTC' &&
          ['TAKE_PROFIT', 'STOP_LOSS', 'MARGIN_GUARD'].includes(value.outcome),
      ).length,
      shortCompletedCampaignCount: campaigns.filter(
        (value) =>
          value.direction === 'SHORT_BTC' &&
          ['TAKE_PROFIT', 'STOP_LOSS', 'MARGIN_GUARD'].includes(value.outcome),
      ).length,
      openAtDatasetEndCount: campaigns.filter((value) => value.outcome === 'OPEN_AT_DATASET_END')
        .length,
      pendingAtDatasetEndCount: campaigns.filter(
        (value) => value.outcome === 'PENDING_AT_DATASET_END',
      ).length,
      meanTotalFees: mean(filled.map((value) => value.totalFees)),
      depositCount: deposits,
      totalDeposited: deposited,
      startingEquity: 30,
      endingEquity: equity,
      economicPnL,
    },
    discovery: summarize(
      discoveryCampaigns,
      splitSignals.DISCOVERY.LONG_BTC + splitSignals.DISCOVERY.SHORT_BTC,
      discoveryCampaigns.length,
      ignoredPending.DISCOVERY,
      ignoredActive.DISCOVERY,
    ),
    holdout: { ...holdout, byDirection: directions(holdoutCampaigns, splitSignals.HOLDOUT) },
    byDirection: directions(campaigns, signals),
    bySevenDayBlock: [...groups]
      .sort(([a], [b]) => a - b)
      .map(([blockIndex, values]) => {
        const value = summarize(values);
        return {
          blockIndex,
          startTimestamp: first + blockIndex * week,
          longSignals: values.filter((item) => item.direction === 'LONG_BTC').length,
          shortSignals: values.filter((item) => item.direction === 'SHORT_BTC').length,
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
          netPnLSum: value.netPnLSum,
          meanHoldingMinutes: value.meanHoldingMinutes,
        };
      }),
    comparisonToCloseEntry: buildCloseEntryComparison(overall, holdout, input.closeEntryReport),
    campaigns,
    classification: classifyPullbackReport(holdout, economicPnL),
  };
}
