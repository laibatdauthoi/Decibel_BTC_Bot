import type { BTC_candlestick } from './decibel_client.js';
import { detectImpulseSignal } from './btc_5m_impulse_continuation_research.js';
import {
  calculateBodyMidpointEntry,
  type pullback_campaign,
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

export const BTC5MImpulsePullback2RExperiment = {
  experimentId: 'BTC_5M_IMPULSE_PULLBACK_2R_V1' as const,
  rewardMultiple: 2,
};
export type pullback_2r_campaign = pullback_campaign & { oneRPrice: number | null };
export type continuation_diagnostic = {
  reached1RFirstCount: number;
  thenReached2RBeforeStopCount: number;
  thenStoppedBefore2RCount: number;
  openAtDatasetEndAfter1RCount: number;
  oneRToTwoRContinuationRate: number;
};
export type fee_burden = {
  grossPnLSum: number;
  totalFeesSum: number;
  netPnLSum: number;
  feesAsFractionOfGrossProfit: number | null;
  meanFeePerCompletedCampaign: number;
  medianFeePerCompletedCampaign: number;
};
type comparison_values = {
  completedCampaignCount: number;
  takeProfitCount?: number;
  stopLossCount?: number;
  tpRate: number;
  grossProfitFactor: number | null;
  netProfitFactor: number | null;
  grossPnLSum: number;
  netPnLSum: number;
  meanHoldingMinutes: number;
  medianHoldingMinutes: number;
  meanTotalFees?: number;
  depositCount?: number;
  totalDeposited?: number;
  endingEquity?: number;
  economicPnL?: number;
};
type comparison =
  | { available: false }
  | {
      available: true;
      pullback1R: { overall: comparison_values; holdout: comparison_values };
      pullback2R: { overall: comparison_values; holdout: comparison_values };
      delta: { overall: comparison_values; holdout: comparison_values };
    };
export type pullback_2r_report = {
  experimentId: typeof BTC5MImpulsePullback2RExperiment.experimentId;
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
  signalAccounting: Record<string, number>;
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
  winnerContinuationDiagnostic: {
    overall: continuation_diagnostic;
    holdout: continuation_diagnostic;
  };
  feeBurdenDiagnostic: { overall: fee_burden; holdout: fee_burden };
  comparisonTo1R: comparison;
  bySevenDayBlock: Array<Record<string, number | null>>;
  campaigns: pullback_2r_campaign[];
  classification:
    | 'BTC_5M_IMPULSE_PULLBACK_2R_HOLDOUT_PROMISING'
    | 'BTC_5M_IMPULSE_PULLBACK_2R_HOLDOUT_INTERESTING'
    | 'NO_USEFUL_BTC_5M_IMPULSE_PULLBACK_2R_EDGE';
};

const minute = 60_000,
  week = 7 * 86_400_000;
const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values: readonly number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b),
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
const completed = (campaign: pullback_2r_campaign) =>
  ['TAKE_PROFIT', 'STOP_LOSS', 'MARGIN_GUARD'].includes(campaign.outcome);

function summarize(
  campaigns: readonly pullback_2r_campaign[],
  rawSignals = 0,
  ignoredActive = 0,
): pullback_metrics {
  const filled = campaigns.filter((value) => value.entryFillPrice !== null),
    closed = filled.filter(completed),
    gross = closed.map((value) => value.grossPnL),
    net = closed.map((value) => value.netPnL),
    holding = closed.flatMap((value) =>
      value.holdingMinutes === null ? [] : [value.holdingMinutes],
    ),
    tp = closed.filter((value) => value.outcome === 'TAKE_PROFIT').length,
    failed = campaigns.filter((value) => value.outcome === 'ENTRY_FAILED').length;
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
    stopLossCount: closed.filter((value) => value.outcome === 'STOP_LOSS').length,
    marginGuardCount: closed.filter((value) => value.outcome === 'MARGIN_GUARD').length,
    tpRate: closed.length === 0 ? 0 : tp / closed.length,
    grossPnLSum: gross.reduce((sum, value) => sum + value, 0),
    netPnLSum: net.reduce((sum, value) => sum + value, 0),
    grossProfitFactor: profitFactor(gross),
    netProfitFactor: profitFactor(net),
    meanHoldingMinutes: mean(holding),
    medianHoldingMinutes: median(holding),
  };
}
function byDirection(
  campaigns: readonly pullback_2r_campaign[],
  signals: Record<wick_direction, number>,
): Record<wick_direction, pullback_direction_metrics> {
  const one = (direction: wick_direction): pullback_direction_metrics => {
    const value = summarize(campaigns.filter((item) => item.direction === direction));
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
export function classifyPullback2RReport(
  holdout: pullback_metrics,
  economicPnL: number,
): pullback_2r_report['classification'] {
  if (
    holdout.completedCampaignCount >= 30 &&
    (holdout.grossProfitFactor ?? 0) >= 1 &&
    (holdout.netProfitFactor ?? 0) >= 1 &&
    holdout.netPnLSum > 0 &&
    economicPnL > 0
  )
    return 'BTC_5M_IMPULSE_PULLBACK_2R_HOLDOUT_PROMISING';
  if (
    holdout.completedCampaignCount >= 30 &&
    (holdout.grossProfitFactor ?? 0) >= 1 &&
    (holdout.netProfitFactor ?? 0) >= 0.8
  )
    return 'BTC_5M_IMPULSE_PULLBACK_2R_HOLDOUT_INTERESTING';
  return 'NO_USEFUL_BTC_5M_IMPULSE_PULLBACK_2R_EDGE';
}
function feeBurden(campaigns: readonly pullback_2r_campaign[]): fee_burden {
  const closed = campaigns.filter(completed),
    fees = closed.map((value) => value.totalFees),
    grossProfit = closed
      .filter((value) => value.grossPnL > 0)
      .reduce((sum, value) => sum + value.grossPnL, 0);
  return {
    grossPnLSum: closed.reduce((sum, value) => sum + value.grossPnL, 0),
    totalFeesSum: fees.reduce((sum, value) => sum + value, 0),
    netPnLSum: closed.reduce((sum, value) => sum + value.netPnL, 0),
    feesAsFractionOfGrossProfit:
      grossProfit > 0 ? fees.reduce((sum, value) => sum + value, 0) / grossProfit : null,
    meanFeePerCompletedCampaign: mean(fees),
    medianFeePerCompletedCampaign: median(fees),
  };
}
type diagnostic_state = 'NONE' | 'REACHED_1R_THEN_2R' | 'REACHED_1R_THEN_STOP' | 'REACHED_1R_OPEN';
function continuation(states: readonly diagnostic_state[]): continuation_diagnostic {
  const reached = states.filter((value) => value !== 'NONE').length,
    two = states.filter((value) => value === 'REACHED_1R_THEN_2R').length,
    stopped = states.filter((value) => value === 'REACHED_1R_THEN_STOP').length,
    open = states.filter((value) => value === 'REACHED_1R_OPEN').length;
  return {
    reached1RFirstCount: reached,
    thenReached2RBeforeStopCount: two,
    thenStoppedBefore2RCount: stopped,
    openAtDatasetEndAfter1RCount: open,
    oneRToTwoRContinuationRate: two + stopped === 0 ? 0 : two / (two + stopped),
  };
}

function comparisonValues(
  value: pullback_metrics,
  extras?: Record<string, number>,
): comparison_values {
  return {
    completedCampaignCount: value.completedCampaignCount,
    takeProfitCount: value.takeProfitCount,
    stopLossCount: value.stopLossCount,
    tpRate: value.tpRate,
    grossProfitFactor: value.grossProfitFactor,
    netProfitFactor: value.netProfitFactor,
    grossPnLSum: value.grossPnLSum,
    netPnLSum: value.netPnLSum,
    meanHoldingMinutes: value.meanHoldingMinutes,
    medianHoldingMinutes: value.medianHoldingMinutes,
    ...extras,
  };
}
function compare(
  currentOverall: comparison_values,
  currentHoldout: comparison_values,
  old: unknown,
): comparison {
  if (typeof old !== 'object' || old === null) return { available: false };
  const root = old as Record<string, unknown>;
  const parse = (source: unknown): comparison_values | null => {
    if (typeof source !== 'object' || source === null) return null;
    const item = source as Record<string, unknown>;
    const number = (key: string) => (typeof item[key] === 'number' ? item[key] : 0);
    if (typeof item.completedCampaignCount !== 'number') return null;
    return {
      completedCampaignCount: number('completedCampaignCount'),
      takeProfitCount: number('takeProfitCount'),
      stopLossCount: number('stopLossCount'),
      tpRate: number('tpRate'),
      grossProfitFactor: typeof item.grossProfitFactor === 'number' ? item.grossProfitFactor : null,
      netProfitFactor: typeof item.netProfitFactor === 'number' ? item.netProfitFactor : null,
      grossPnLSum: number('grossPnLSum'),
      netPnLSum: number('netPnLSum'),
      meanHoldingMinutes: number('meanHoldingMinutes'),
      medianHoldingMinutes: number('medianHoldingMinutes'),
      meanTotalFees: number('meanTotalFees'),
      depositCount: number('depositCount'),
      totalDeposited: number('totalDeposited'),
      endingEquity: number('endingEquity'),
      economicPnL: number('economicPnL'),
    };
  };
  const priorOverall = parse(root.overall),
    priorHoldout = parse(root.holdout);
  if (!priorOverall || !priorHoldout) return { available: false };
  const delta = (next: comparison_values, prior: comparison_values): comparison_values => {
    const subtract = (key: keyof comparison_values) =>
      ((next[key] as number | undefined) ?? 0) - ((prior[key] as number | undefined) ?? 0);
    return {
      completedCampaignCount: subtract('completedCampaignCount'),
      takeProfitCount: subtract('takeProfitCount'),
      stopLossCount: subtract('stopLossCount'),
      tpRate: subtract('tpRate'),
      grossProfitFactor:
        next.grossProfitFactor === null || prior.grossProfitFactor === null
          ? null
          : next.grossProfitFactor - prior.grossProfitFactor,
      netProfitFactor:
        next.netProfitFactor === null || prior.netProfitFactor === null
          ? null
          : next.netProfitFactor - prior.netProfitFactor,
      grossPnLSum: subtract('grossPnLSum'),
      netPnLSum: subtract('netPnLSum'),
      meanHoldingMinutes: subtract('meanHoldingMinutes'),
      medianHoldingMinutes: subtract('medianHoldingMinutes'),
      meanTotalFees: subtract('meanTotalFees'),
      depositCount: subtract('depositCount'),
      totalDeposited: subtract('totalDeposited'),
      endingEquity: subtract('endingEquity'),
      economicPnL: subtract('economicPnL'),
    };
  };
  return {
    available: true,
    pullback1R: { overall: priorOverall, holdout: priorHoldout },
    pullback2R: { overall: currentOverall, holdout: currentHoldout },
    delta: {
      overall: delta(currentOverall, priorOverall),
      holdout: delta(currentHoldout, priorHoldout),
    },
  };
}

export function runBTC5MImpulsePullback2RReplay(input: {
  candles: readonly BTC_candlestick[];
  market: btc_research_market;
  leverageSource: string;
  oneRReport?: unknown;
}): pullback_2r_report {
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
  const campaigns: pullback_2r_campaign[] = [],
    diagnosticStates: diagnostic_state[] = [],
    fillMinutes = [0, 0, 0, 0, 0];
  let activeUntil = -1,
    equity = 30,
    deposits = 0,
    deposited = 0;
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
      windowEnd = signalTime + 5 * minute;
    const base = {
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
      if (
        point &&
        isResearchLimitFillable(signal.direction, limit, point.candle, input.market.tickSize)
      ) {
        fill = { ...point, minuteIndex: entryMinute as 1 | 2 | 3 | 4 | 5 };
        break;
      }
    }
    if (!fill) {
      const pending = (oneMinute.at(-1)?.timestamp.getTime() ?? -1) < windowEnd - minute;
      campaigns.push({
        ...base,
        entryFillMinuteIndex: null,
        entryFillTimestamp: null,
        entryFillPrice: null,
        entryLeverage: null,
        entryNotional: null,
        initialMarginUsed: null,
        riskDistance: null,
        oneRPrice: null,
        takeProfitTriggerPrice: null,
        completionTimestamp: pending ? null : windowEnd,
        outcome: pending ? 'PENDING_AT_DATASET_END' : 'ENTRY_FAILED',
        exitPrice: null,
        holdingMinutes: null,
        grossPnL: 0,
        totalFees: 0,
        netPnL: 0,
        equityAfterRealization: equity,
        depositAppliedAfterCampaign: 0,
      });
      diagnosticStates.push('NONE');
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
        oneRPrice: null,
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
      diagnosticStates.push('NONE');
      continue;
    }
    const oneRPrice = signal.direction === 'LONG_BTC' ? limit + risk : limit - risk,
      target = signal.direction === 'LONG_BTC' ? limit + 2 * risk : limit - 2 * risk,
      entryFee = sizing.notional * input.market.makerFeeRate;
    let outcome: pullback_2r_campaign['outcome'] = 'OPEN_AT_DATASET_END',
      exit: number | null = null,
      completion: number | null = null,
      reachedOneR = false,
      diagnostic: diagnostic_state = 'NONE';
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
        oneRHit =
          signal.direction === 'LONG_BTC'
            ? execution.high >= oneRPrice
            : execution.low <= oneRPrice,
        targetHit =
          signal.direction === 'LONG_BTC' ? execution.high >= target : execution.low <= target;
      if (!reachedOneR && oneRHit && !stopHit && !health.triggered) reachedOneR = true;
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
        diagnostic =
          outcome === 'TAKE_PROFIT'
            ? 'REACHED_1R_THEN_2R'
            : reachedOneR
              ? 'REACHED_1R_THEN_STOP'
              : 'NONE';
        break;
      }
    }
    if (exit === null && reachedOneR) diagnostic = 'REACHED_1R_OPEN';
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
      oneRPrice,
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
    diagnosticStates.push(diagnostic);
    if (exit === null) activeUntil = Number.POSITIVE_INFINITY;
    else equity = after + deposit;
  }
  const discoveryCampaigns = campaigns.filter((value) => value.splitLabel === 'DISCOVERY'),
    holdoutCampaigns = campaigns.filter((value) => value.splitLabel === 'HOLDOUT'),
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
    economicPnL = equity - 30 - deposited;
  const holdoutStates = diagnosticStates.filter(
    (_, index) => campaigns[index]?.splitLabel === 'HOLDOUT',
  );
  const groups = new Map<number, pullback_2r_campaign[]>();
  for (const campaign of campaigns) {
    const key = Math.floor((campaign.signal5mEndTimestamp - first) / week),
      values = groups.get(key) ?? [];
    values.push(campaign);
    groups.set(key, values);
  }
  const overallExtras = {
    meanTotalFees: mean(campaigns.filter(completed).map((value) => value.totalFees)),
    depositCount: deposits,
    totalDeposited: deposited,
    endingEquity: equity,
    economicPnL,
  };
  return {
    experimentId: BTC5MImpulsePullback2RExperiment.experimentId,
    dataRange: {
      firstTimestamp: oneMinute[0]?.timestamp.getTime() ?? null,
      lastTimestamp: oneMinute.at(-1)?.timestamp.getTime() ?? null,
      oneMinuteCandleCount: oneMinute.length,
    },
    leverageSource: input.leverageSource,
    executionSemantics: {
      baseline: 'BTC_5M_IMPULSE_PULLBACK_1R_V1_UNCHANGED_EXCEPT_TP',
      entryCandleAmbiguity: 'ADVERSE_STOP_LOSS',
    },
    signalDefinition: { source: 'BTC_5M_IMPULSE_CONTINUATION_1R_V1_UNCHANGED' },
    entryDefinition: {
      price: '(signalOpen+signalClose)/2',
      lifetime: 'NEXT_EXACTLY_FIVE_1M_CANDLES',
    },
    exitDefinition: {
      stop: 'SIGNAL_5M_OPEN',
      target: 'EXACTLY_2R_FROM_ACTUAL_FILL',
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
      signalIgnoredWhilePendingCount: 0,
      signalIgnoredWhileActiveCount: ignored.DISCOVERY + ignored.HOLDOUT,
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
    overall: {
      ...overall,
      longCompletedCampaignCount: campaigns.filter(
        (value) => value.direction === 'LONG_BTC' && completed(value),
      ).length,
      shortCompletedCampaignCount: campaigns.filter(
        (value) => value.direction === 'SHORT_BTC' && completed(value),
      ).length,
      openAtDatasetEndCount: campaigns.filter((value) => value.outcome === 'OPEN_AT_DATASET_END')
        .length,
      pendingAtDatasetEndCount: campaigns.filter(
        (value) => value.outcome === 'PENDING_AT_DATASET_END',
      ).length,
      ...overallExtras,
      startingEquity: 30,
    },
    discovery: summarize(
      discoveryCampaigns,
      splitSignals.DISCOVERY.LONG_BTC + splitSignals.DISCOVERY.SHORT_BTC,
      ignored.DISCOVERY,
    ),
    holdout: { ...holdout, byDirection: byDirection(holdoutCampaigns, splitSignals.HOLDOUT) },
    byDirection: byDirection(campaigns, signals),
    winnerContinuationDiagnostic: {
      overall: continuation(diagnosticStates),
      holdout: continuation(holdoutStates),
    },
    feeBurdenDiagnostic: { overall: feeBurden(campaigns), holdout: feeBurden(holdoutCampaigns) },
    comparisonTo1R: compare(
      comparisonValues(overall, overallExtras),
      comparisonValues(holdout),
      input.oneRReport,
    ),
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
          grossPnLSum: value.grossPnLSum,
          netPnLSum: value.netPnLSum,
          meanHoldingMinutes: value.meanHoldingMinutes,
        };
      }),
    campaigns,
    classification: classifyPullback2RReport(holdout, economicPnL),
  };
}
