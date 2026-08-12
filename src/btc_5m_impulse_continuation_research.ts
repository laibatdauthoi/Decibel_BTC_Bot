import type { BTC_candlestick } from './decibel_client.js';
import {
  BTC5MWickRejectionExperiment,
  aggregateBTCOneMinuteCandles,
  calculateSingleLegSizing,
  evaluateSingleLegMarginGuard,
  isResearchLimitFillable,
  type btc_research_market,
  type five_minute_candle,
  type split_label,
  type wick_direction,
} from './btc_5m_wick_rejection_research.js';

export const BTC5MImpulseContinuationExperiment = {
  experimentId: 'BTC_5M_IMPULSE_CONTINUATION_1R_V1' as const,
  previousRangeCount: 12,
  minimumBodyFraction: 0.6,
  longMinimumCloseLocation: 0.8,
  shortMaximumCloseLocation: 0.2,
};

export type impulse_geometry = {
  range: number;
  body: number;
  bodyFraction: number;
  closeLocation: number;
};
export type impulse_signal = {
  direction: wick_direction;
  geometry: impulse_geometry;
  previous12MedianRange: number;
};
export type impulse_campaign = {
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
  entryOrderTimestamp: number;
  entryFillTimestamp: number;
  entryFillPrice: number;
  entryLeverage: number;
  entryNotional: number;
  initialMarginUsed: number;
  riskDistance: number;
  stopTriggerPrice: number;
  takeProfitTriggerPrice: number;
  completionTimestamp: number | null;
  outcome: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MARGIN_GUARD' | 'OPEN_AT_DATASET_END';
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
export type impulse_metrics = {
  rawSignalCount: number;
  signalIgnoredWhileActiveCount: number;
  entryFilledCount: number;
  completedCampaignCount: number;
  takeProfitCount: number;
  stopLossCount: number;
  marginGuardCount: number;
  tpRate: number;
  grossPnLSum: number;
  netPnLSum: number;
  grossProfitFactor: number | null;
  netProfitFactor: number | null;
  meanHoldingMinutes: number;
  medianHoldingMinutes: number;
};
export type impulse_direction_metrics = Omit<impulse_metrics, 'rawSignalCount'> & {
  signalCount: number;
};
export type impulse_replay_report = {
  experimentId: typeof BTC5MImpulseContinuationExperiment.experimentId;
  dataRange: {
    firstTimestamp: number | null;
    lastTimestamp: number | null;
    oneMinuteCandleCount: number;
  };
  leverageSource: string;
  executionSemantics: Record<string, string>;
  signalDefinition: Record<string, string>;
  exitDefinition: Record<string, string>;
  split: { discoveryEndTimestamp: number; discoveryFraction: 0.7 };
  signalAccounting: {
    valid5mCandleCount: number;
    contextEligible5mCandleCount: number;
    longSignalCount: number;
    shortSignalCount: number;
    rawSignalCount: number;
    signalRate: number;
    signalIgnoredWhileActiveCount: number;
    entryAttemptCount: number;
    entryFilledCount: number;
    entryFailedCount: number;
  };
  overall: impulse_metrics & {
    longCompletedCampaignCount: number;
    shortCompletedCampaignCount: number;
    openAtDatasetEndCount: number;
    meanTotalFees: number;
    depositCount: number;
    totalDeposited: number;
    startingEquity: number;
    endingEquity: number;
    economicPnL: number;
  };
  discovery: impulse_metrics;
  holdout: impulse_metrics & { byDirection: Record<wick_direction, impulse_direction_metrics> };
  byDirection: Record<wick_direction, impulse_direction_metrics>;
  bySevenDayBlock: Array<{
    blockIndex: number;
    startTimestamp: number;
    longSignals: number;
    shortSignals: number;
    completedCampaignCount: number;
    takeProfitCount: number;
    stopLossCount: number;
    marginGuardCount: number;
    tpRate: number;
    grossProfitFactor: number | null;
    netProfitFactor: number | null;
    netPnLSum: number;
    meanHoldingMinutes: number;
  }>;
  campaigns: impulse_campaign[];
  classification:
    | 'BTC_5M_IMPULSE_1R_HOLDOUT_PROMISING'
    | 'BTC_5M_IMPULSE_1R_HOLDOUT_INTERESTING'
    | 'NO_USEFUL_BTC_5M_IMPULSE_1R_EDGE';
};

const minute = 60_000;
const week = 7 * 86_400_000;
const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
export function calculateMedian(values: readonly number[]): number {
  if (values.length === 0) throw new Error('MEDIAN_REQUIRES_VALUES');
  const sorted = [...values].sort((left, right) => left - right),
    middle = sorted.length / 2;
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[Math.floor(middle)]!;
}
const medianOrZero = (values: readonly number[]) =>
  values.length === 0 ? 0 : calculateMedian(values);
const profitFactor = (values: readonly number[]) => {
  const wins = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0),
    losses = -values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return losses === 0 ? null : wins / losses;
};
const pnl = (direction: wick_direction, entry: number, exit: number, quantity: number) =>
  (direction === 'LONG_BTC' ? exit - entry : entry - exit) * quantity;

export function calculateImpulseGeometry(candle: five_minute_candle): impulse_geometry {
  const range = candle.high - candle.low,
    body = Math.abs(candle.close - candle.open);
  return {
    range,
    body,
    bodyFraction: range <= 0 ? 0 : body / range,
    closeLocation: range <= 0 ? 0 : (candle.close - candle.low) / range,
  };
}

export function detectImpulseSignal(
  candles: readonly five_minute_candle[],
  index: number,
): impulse_signal | null {
  const candle = candles[index];
  if (!candle || index < BTC5MImpulseContinuationExperiment.previousRangeCount) return null;
  const geometry = calculateImpulseGeometry(candle);
  if (geometry.range <= 0) return null;
  const previous = candles.slice(index - 12, index);
  if (previous.length !== 12) return null;
  const previous12MedianRange = calculateMedian(previous.map((value) => value.high - value.low));
  const common = geometry.bodyFraction >= 0.6 && geometry.range >= previous12MedianRange;
  const long = candle.close > candle.open && common && geometry.closeLocation >= 0.8;
  const short = candle.close < candle.open && common && geometry.closeLocation <= 0.2;
  if (long === short) return null;
  return { direction: long ? 'LONG_BTC' : 'SHORT_BTC', geometry, previous12MedianRange };
}

function summarize(
  campaigns: readonly impulse_campaign[],
  rawSignals = 0,
  ignored = 0,
): impulse_metrics {
  const completed = campaigns.filter((value) => value.outcome !== 'OPEN_AT_DATASET_END');
  const gross = completed.map((value) => value.grossPnL),
    net = completed.map((value) => value.netPnL);
  const holding = completed.flatMap((value) =>
    value.holdingMinutes === null ? [] : [value.holdingMinutes],
  );
  const takeProfitCount = completed.filter((value) => value.outcome === 'TAKE_PROFIT').length;
  return {
    rawSignalCount: rawSignals,
    signalIgnoredWhileActiveCount: ignored,
    entryFilledCount: campaigns.length,
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
    medianHoldingMinutes: medianOrZero(holding),
  };
}

function summarizeDirections(
  campaigns: readonly impulse_campaign[],
  signals: Record<wick_direction, number>,
): Record<wick_direction, impulse_direction_metrics> {
  const one = (direction: wick_direction): impulse_direction_metrics => {
    const metrics = summarize(campaigns.filter((value) => value.direction === direction));
    return {
      signalCount: signals[direction],
      signalIgnoredWhileActiveCount: metrics.signalIgnoredWhileActiveCount,
      entryFilledCount: metrics.entryFilledCount,
      completedCampaignCount: metrics.completedCampaignCount,
      takeProfitCount: metrics.takeProfitCount,
      stopLossCount: metrics.stopLossCount,
      marginGuardCount: metrics.marginGuardCount,
      tpRate: metrics.tpRate,
      grossPnLSum: metrics.grossPnLSum,
      netPnLSum: metrics.netPnLSum,
      grossProfitFactor: metrics.grossProfitFactor,
      netProfitFactor: metrics.netProfitFactor,
      meanHoldingMinutes: metrics.meanHoldingMinutes,
      medianHoldingMinutes: metrics.medianHoldingMinutes,
    };
  };
  return { LONG_BTC: one('LONG_BTC'), SHORT_BTC: one('SHORT_BTC') };
}

export function classifyImpulseReport(
  holdout: impulse_metrics,
  economicPnL: number,
): impulse_replay_report['classification'] {
  if (
    holdout.completedCampaignCount >= 30 &&
    (holdout.grossProfitFactor ?? 0) >= 1 &&
    (holdout.netProfitFactor ?? 0) >= 1 &&
    holdout.netPnLSum > 0 &&
    economicPnL > 0
  )
    return 'BTC_5M_IMPULSE_1R_HOLDOUT_PROMISING';
  if (
    holdout.completedCampaignCount >= 30 &&
    (holdout.grossProfitFactor ?? 0) >= 1 &&
    (holdout.netProfitFactor ?? 0) >= 0.8
  )
    return 'BTC_5M_IMPULSE_1R_HOLDOUT_INTERESTING';
  return 'NO_USEFUL_BTC_5M_IMPULSE_1R_EDGE';
}

export function runBTC5MImpulseContinuationReplay(input: {
  candles: readonly BTC_candlestick[];
  market: btc_research_market;
  leverageSource: string;
}): impulse_replay_report {
  const oneMinute = [...input.candles].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
  const fiveMinute = aggregateBTCOneMinuteCandles(oneMinute);
  const byTime = new Map(
    oneMinute.map((candle, index) => [candle.timestamp.getTime(), { candle, index }]),
  );
  const firstTime = fiveMinute[0]?.timestamp.getTime() ?? 0,
    lastTime = fiveMinute.at(-1)?.endTimestamp.getTime() ?? firstTime,
    splitTime = firstTime + (lastTime - firstTime) * 0.7;
  const signals: Record<wick_direction, number> = { LONG_BTC: 0, SHORT_BTC: 0 };
  const splitSignals: Record<split_label, Record<wick_direction, number>> = {
    DISCOVERY: { LONG_BTC: 0, SHORT_BTC: 0 },
    HOLDOUT: { LONG_BTC: 0, SHORT_BTC: 0 },
  };
  const ignored: Record<split_label, number> = { DISCOVERY: 0, HOLDOUT: 0 };
  const campaigns: impulse_campaign[] = [];
  let activeUntil = -1,
    equity = 30,
    attempts = 0,
    failures = 0,
    depositCount = 0,
    totalDeposited = 0;
  for (let signalIndex = 12; signalIndex < fiveMinute.length; signalIndex += 1) {
    const signal = detectImpulseSignal(fiveMinute, signalIndex);
    if (!signal) continue;
    const candle = fiveMinute[signalIndex]!,
      signalTime = candle.endTimestamp.getTime();
    const splitLabel: split_label = signalTime < splitTime ? 'DISCOVERY' : 'HOLDOUT';
    signals[signal.direction] += 1;
    splitSignals[splitLabel][signal.direction] += 1;
    if (signalTime <= activeUntil) {
      ignored[splitLabel] += 1;
      continue;
    }
    attempts += 1;
    const eligible = byTime.get(signalTime);
    if (
      !eligible ||
      !isResearchLimitFillable(
        signal.direction,
        candle.close,
        eligible.candle,
        input.market.tickSize,
      )
    ) {
      failures += 1;
      continue;
    }
    const sizing = calculateSingleLegSizing(equity, candle.close, input.market);
    const riskDistance =
      signal.direction === 'LONG_BTC' ? candle.close - candle.open : candle.open - candle.close;
    if (!sizing || riskDistance <= 0) {
      failures += 1;
      continue;
    }
    const stop = candle.open,
      target =
        signal.direction === 'LONG_BTC' ? candle.close + riskDistance : candle.close - riskDistance,
      entryFee = sizing.notional * input.market.makerFeeRate;
    let outcome: impulse_campaign['outcome'] = 'OPEN_AT_DATASET_END',
      exitPrice: number | null = null,
      completion: number | null = null;
    for (let index = eligible.index; index < oneMinute.length; index += 1) {
      const execution = oneMinute[index]!;
      const health = evaluateSingleLegMarginGuard({
        equity: equity - entryFee,
        direction: signal.direction,
        entryPrice: candle.close,
        markPrice: execution.close,
        quantity: sizing.quantity,
        maximumLeverage: input.market.maximumLeverage,
      });
      const stopHit =
        signal.direction === 'LONG_BTC' ? execution.low <= stop : execution.high >= stop;
      const targetHit =
        signal.direction === 'LONG_BTC' ? execution.high >= target : execution.low <= target;
      if (health.triggered) {
        outcome = 'MARGIN_GUARD';
        exitPrice = execution.close;
      } else if (stopHit) {
        outcome = 'STOP_LOSS';
        exitPrice = stop;
      } else if (targetHit) {
        outcome = 'TAKE_PROFIT';
        exitPrice = target;
      }
      if (exitPrice !== null) {
        completion = execution.timestamp.getTime() + minute;
        activeUntil = completion;
        break;
      }
    }
    const grossPnL =
      exitPrice === null ? 0 : pnl(signal.direction, candle.close, exitPrice, sizing.quantity);
    const exitFee =
      exitPrice === null
        ? 0
        : Math.abs(exitPrice * sizing.quantity) *
          (outcome === 'TAKE_PROFIT' ? input.market.makerFeeRate : input.market.takerFeeRate);
    const totalFees = entryFee + exitFee,
      netPnL = exitPrice === null ? 0 : grossPnL - totalFees;
    const equityAfter = exitPrice === null ? equity : equity + netPnL;
    let deposit = 0;
    if (exitPrice !== null && equityAfter < 15) {
      deposit = 15;
      depositCount += 1;
      totalDeposited += 15;
    }
    campaigns.push({
      signal5mStartTimestamp: candle.timestamp.getTime(),
      signal5mEndTimestamp: signalTime,
      direction: signal.direction,
      signalOpen: candle.open,
      signalHigh: candle.high,
      signalLow: candle.low,
      signalClose: candle.close,
      ...signal.geometry,
      previous12MedianRange: signal.previous12MedianRange,
      entryOrderTimestamp: signalTime,
      entryFillTimestamp: eligible.candle.timestamp.getTime() + minute,
      entryFillPrice: candle.close,
      entryLeverage: input.market.maximumLeverage,
      entryNotional: sizing.notional,
      initialMarginUsed: sizing.initialMargin,
      riskDistance,
      stopTriggerPrice: stop,
      takeProfitTriggerPrice: target,
      completionTimestamp: completion,
      outcome,
      exitPrice,
      holdingMinutes:
        completion === null
          ? null
          : (completion - (eligible.candle.timestamp.getTime() + minute)) / minute,
      grossPnL,
      totalFees,
      netPnL,
      equityBeforeCampaign: equity,
      equityAfterRealization: equityAfter,
      depositAppliedAfterCampaign: deposit,
      splitLabel,
    });
    if (exitPrice === null) activeUntil = Number.POSITIVE_INFINITY;
    else equity = equityAfter + deposit;
  }
  const discoveryCampaigns = campaigns.filter((value) => value.splitLabel === 'DISCOVERY'),
    holdoutCampaigns = campaigns.filter((value) => value.splitLabel === 'HOLDOUT');
  const overall = summarize(
    campaigns,
    signals.LONG_BTC + signals.SHORT_BTC,
    ignored.DISCOVERY + ignored.HOLDOUT,
  );
  const holdout = summarize(
    holdoutCampaigns,
    splitSignals.HOLDOUT.LONG_BTC + splitSignals.HOLDOUT.SHORT_BTC,
    ignored.HOLDOUT,
  );
  const economicPnL = equity - 30 - totalDeposited;
  const blocks = new Map<number, impulse_campaign[]>();
  for (const campaign of campaigns) {
    const key = Math.floor((campaign.signal5mEndTimestamp - firstTime) / week);
    const values = blocks.get(key) ?? [];
    values.push(campaign);
    blocks.set(key, values);
  }
  return {
    experimentId: BTC5MImpulseContinuationExperiment.experimentId,
    dataRange: {
      firstTimestamp: oneMinute[0]?.timestamp.getTime() ?? null,
      lastTimestamp: oneMinute.at(-1)?.timestamp.getTime() ?? null,
      oneMinuteCandleCount: oneMinute.length,
    },
    leverageSource: input.leverageSource,
    executionSemantics: {
      entry: 'ONE_MINUTE_PASSIVE_LIMIT_TRADE_THROUGH_ONE_TICK',
      takeProfit: 'RESTING_LIMIT_MAKER_FEE',
      stopAndMargin: 'AGGRESSIVE_LIMIT_TAKER_FEE',
      funding: 'UNAVAILABLE_ZERO',
    },
    signalDefinition: {
      context: 'MEDIAN_RANGE_OF_STRICTLY_PREVIOUS_12_VALID_5M_CANDLES',
      long: 'close>open && bodyFraction>=0.60 && closeLocation>=0.80 && range>=previous12MedianRange',
      short:
        'close<open && bodyFraction>=0.60 && closeLocation<=0.20 && range>=previous12MedianRange',
    },
    exitDefinition: {
      stop: 'SIGNAL_5M_OPEN',
      target: 'EXACTLY_1R_FROM_ACTUAL_FILL',
      ambiguity: 'STOP_LOSS',
      marginGuard: 'markedAccountEquity<currentNotional/(maximumLeverage*2)',
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
      signalIgnoredWhileActiveCount: ignored.DISCOVERY + ignored.HOLDOUT,
      entryAttemptCount: attempts,
      entryFilledCount: campaigns.length,
      entryFailedCount: failures,
    },
    overall: {
      ...overall,
      longCompletedCampaignCount: campaigns.filter(
        (value) => value.direction === 'LONG_BTC' && value.outcome !== 'OPEN_AT_DATASET_END',
      ).length,
      shortCompletedCampaignCount: campaigns.filter(
        (value) => value.direction === 'SHORT_BTC' && value.outcome !== 'OPEN_AT_DATASET_END',
      ).length,
      openAtDatasetEndCount: campaigns.filter((value) => value.outcome === 'OPEN_AT_DATASET_END')
        .length,
      meanTotalFees: mean(campaigns.map((value) => value.totalFees)),
      depositCount,
      totalDeposited,
      startingEquity: BTC5MWickRejectionExperiment.startingEquity,
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
      byDirection: summarizeDirections(holdoutCampaigns, splitSignals.HOLDOUT),
    },
    byDirection: summarizeDirections(campaigns, signals),
    bySevenDayBlock: [...blocks]
      .sort(([left], [right]) => left - right)
      .map(([blockIndex, values]) => {
        const metric = summarize(values);
        return {
          blockIndex,
          startTimestamp: firstTime + blockIndex * week,
          longSignals: values.filter((value) => value.direction === 'LONG_BTC').length,
          shortSignals: values.filter((value) => value.direction === 'SHORT_BTC').length,
          completedCampaignCount: metric.completedCampaignCount,
          takeProfitCount: metric.takeProfitCount,
          stopLossCount: metric.stopLossCount,
          marginGuardCount: metric.marginGuardCount,
          tpRate: metric.tpRate,
          grossProfitFactor: metric.grossProfitFactor,
          netProfitFactor: metric.netProfitFactor,
          netPnLSum: metric.netPnLSum,
          meanHoldingMinutes: metric.meanHoldingMinutes,
        };
      }),
    campaigns,
    classification: classifyImpulseReport(holdout, economicPnL),
  };
}
