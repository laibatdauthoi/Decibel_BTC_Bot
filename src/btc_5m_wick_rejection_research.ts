import type { BTC_candlestick } from './decibel_client.js';

export const BTC5MWickRejectionExperiment = {
  experimentId: 'BTC_5M_WICK_REJECTION_1R_V1' as const,
  startingEquity: 30,
  depositTrigger: 15,
  depositAmount: 15,
  marginUtilization: 0.75,
  fundingMode: 'UNAVAILABLE' as const,
};

export type wick_direction = 'LONG_BTC' | 'SHORT_BTC';
export type split_label = 'DISCOVERY' | 'HOLDOUT';
export type five_minute_candle = BTC_candlestick & { endTimestamp: Date };
export type wick_geometry = {
  range: number;
  body: number;
  upperWick: number;
  lowerWick: number;
  midpoint: number;
};
export type btc_research_market = {
  marketAddress: string;
  tickSize: number;
  lotSize: number;
  minimumSize: number;
  maximumLeverage: number;
  makerFeeRate: number;
  takerFeeRate: number;
};
export type wick_campaign = {
  signal5mStartTimestamp: number;
  signal5mEndTimestamp: number;
  direction: wick_direction;
  signalOpen: number;
  signalHigh: number;
  signalLow: number;
  signalClose: number;
  body: number;
  upperWick: number;
  lowerWick: number;
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
export type metric_summary = {
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
export type direction_summary = metric_summary & { signalCount: number };
export type wick_replay_report = {
  experimentId: typeof BTC5MWickRejectionExperiment.experimentId;
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
    longSignalCount: number;
    shortSignalCount: number;
    rawSignalCount: number;
    signalIgnoredWhileActiveCount: number;
    entryAttemptCount: number;
    entryFilledCount: number;
    entryFailedCount: number;
  };
  overall: metric_summary & {
    valid5mCandleCount: number;
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
  discovery: metric_summary;
  holdout: metric_summary & { byDirection: Record<wick_direction, direction_summary> };
  byDirection: Record<wick_direction, direction_summary>;
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
  campaigns: wick_campaign[];
  classification:
    | 'BTC_5M_WICK_1R_HOLDOUT_PROMISING'
    | 'BTC_5M_WICK_1R_HOLDOUT_INTERESTING'
    | 'NO_USEFUL_BTC_5M_WICK_1R_EDGE';
};

const minute = 60_000;
const fiveMinutes = 5 * minute;
const roundDown = (value: number, increment: number) =>
  Math.floor((value + Number.EPSILON) / increment) * increment;
const pnl = (direction: wick_direction, entry: number, exit: number, quantity: number) =>
  (direction === 'LONG_BTC' ? exit - entry : entry - exit) * quantity;
const profitFactor = (values: readonly number[]) => {
  const profit = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const loss = -values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return loss === 0 ? null : profit / loss;
};
const average = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values: readonly number[]) => {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right),
    middle = ordered.length / 2;
  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[Math.floor(middle)]!;
};

export function aggregateBTCOneMinuteCandles(
  candles: readonly BTC_candlestick[],
): five_minute_candle[] {
  const buckets = new Map<number, BTC_candlestick[]>();
  for (const candle of candles) {
    const timestamp = candle.timestamp.getTime();
    if (timestamp % minute !== 0) continue;
    const bucket = Math.floor(timestamp / fiveMinutes) * fiveMinutes;
    const group = buckets.get(bucket) ?? [];
    group.push(candle);
    buckets.set(bucket, group);
  }
  const result: five_minute_candle[] = [];
  for (const [timestamp, group] of [...buckets].sort(([left], [right]) => left - right)) {
    group.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
    if (
      group.length !== 5 ||
      group.some((candle, index) => candle.timestamp.getTime() !== timestamp + index * minute)
    )
      continue;
    result.push({
      timestamp: new Date(timestamp),
      endTimestamp: new Date(timestamp + fiveMinutes),
      open: group[0]!.open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: group[4]!.close,
      volume: group.reduce((sum, candle) => sum + candle.volume, 0),
    });
  }
  return result;
}

export function calculateWickGeometry(candle: five_minute_candle): wick_geometry {
  return {
    range: candle.high - candle.low,
    body: Math.abs(candle.close - candle.open),
    upperWick: candle.high - Math.max(candle.open, candle.close),
    lowerWick: Math.min(candle.open, candle.close) - candle.low,
    midpoint: (candle.high + candle.low) / 2,
  };
}

export function detectWickSignal(candle: five_minute_candle): wick_direction | null {
  const geometry = calculateWickGeometry(candle);
  if (geometry.range <= 0) return null;
  const long =
    geometry.lowerWick >= 2 * geometry.body &&
    geometry.lowerWick >= 2 * geometry.upperWick &&
    candle.close > geometry.midpoint;
  const short =
    geometry.upperWick >= 2 * geometry.body &&
    geometry.upperWick >= 2 * geometry.lowerWick &&
    candle.close < geometry.midpoint;
  if (long === short) return null;
  return long ? 'LONG_BTC' : 'SHORT_BTC';
}

export function isResearchLimitFillable(
  direction: wick_direction,
  limit: number,
  candle: BTC_candlestick,
  tickSize: number,
): boolean {
  return direction === 'LONG_BTC'
    ? candle.low <= limit - tickSize
    : candle.high >= limit + tickSize;
}

export function calculateSingleLegSizing(
  equity: number,
  price: number,
  market: btc_research_market,
): { quantity: number; notional: number; initialMargin: number } | null {
  if (equity <= 0 || price <= 0 || market.maximumLeverage <= 0) return null;
  let quantity = roundDown(
    (equity * BTC5MWickRejectionExperiment.marginUtilization * market.maximumLeverage) / price,
    market.lotSize,
  );
  while (quantity >= market.minimumSize) {
    const notional = quantity * price,
      initialMargin = notional / market.maximumLeverage,
      feeReserve = notional * (market.makerFeeRate + market.takerFeeRate);
    if (initialMargin + feeReserve < equity) return { quantity, notional, initialMargin };
    quantity = roundDown(quantity - market.lotSize, market.lotSize);
  }
  return null;
}

export function evaluateSingleLegMarginGuard(input: {
  equity: number;
  direction: wick_direction;
  entryPrice: number;
  markPrice: number;
  quantity: number;
  maximumLeverage: number;
}): { triggered: boolean; markedAccountEquity: number; maintenanceMargin: number } {
  const markedAccountEquity =
      input.equity + pnl(input.direction, input.entryPrice, input.markPrice, input.quantity),
    maintenanceMargin = Math.abs(input.quantity * input.markPrice) / (input.maximumLeverage * 2);
  return {
    triggered: markedAccountEquity < maintenanceMargin,
    markedAccountEquity,
    maintenanceMargin,
  };
}

function summarize(
  campaigns: readonly wick_campaign[],
  rawSignals = 0,
  ignored = 0,
): metric_summary {
  const completed = campaigns.filter((campaign) => campaign.outcome !== 'OPEN_AT_DATASET_END');
  const holding = completed.flatMap((campaign) =>
    campaign.holdingMinutes === null ? [] : [campaign.holdingMinutes],
  );
  const gross = completed.map((campaign) => campaign.grossPnL),
    net = completed.map((campaign) => campaign.netPnL);
  const tp = completed.filter((campaign) => campaign.outcome === 'TAKE_PROFIT').length;
  return {
    rawSignalCount: rawSignals,
    signalIgnoredWhileActiveCount: ignored,
    entryFilledCount: campaigns.length,
    completedCampaignCount: completed.length,
    takeProfitCount: tp,
    stopLossCount: completed.filter((campaign) => campaign.outcome === 'STOP_LOSS').length,
    marginGuardCount: completed.filter((campaign) => campaign.outcome === 'MARGIN_GUARD').length,
    tpRate: completed.length === 0 ? 0 : tp / completed.length,
    grossPnLSum: gross.reduce((sum, value) => sum + value, 0),
    netPnLSum: net.reduce((sum, value) => sum + value, 0),
    grossProfitFactor: profitFactor(gross),
    netProfitFactor: profitFactor(net),
    meanHoldingMinutes: average(holding),
    medianHoldingMinutes: median(holding),
  };
}

const byDirection = (
  campaigns: readonly wick_campaign[],
  signals: Record<wick_direction, number>,
): Record<wick_direction, direction_summary> => ({
  LONG_BTC: {
    ...summarize(campaigns.filter((value) => value.direction === 'LONG_BTC')),
    signalCount: signals.LONG_BTC,
  },
  SHORT_BTC: {
    ...summarize(campaigns.filter((value) => value.direction === 'SHORT_BTC')),
    signalCount: signals.SHORT_BTC,
  },
});

export function classifyWickReport(
  holdout: metric_summary,
  economicPnL: number,
): wick_replay_report['classification'] {
  if (
    holdout.completedCampaignCount >= 30 &&
    (holdout.grossProfitFactor ?? 0) >= 1 &&
    (holdout.netProfitFactor ?? 0) >= 1 &&
    holdout.netPnLSum > 0 &&
    economicPnL > 0
  )
    return 'BTC_5M_WICK_1R_HOLDOUT_PROMISING';
  if (
    holdout.completedCampaignCount >= 30 &&
    (holdout.grossProfitFactor ?? 0) >= 1 &&
    (holdout.netProfitFactor ?? 0) >= 0.8
  )
    return 'BTC_5M_WICK_1R_HOLDOUT_INTERESTING';
  return 'NO_USEFUL_BTC_5M_WICK_1R_EDGE';
}

export function runBTC5MWickRejectionReplay(input: {
  candles: readonly BTC_candlestick[];
  market: btc_research_market;
  leverageSource: string;
}): wick_replay_report {
  const oneMinute = [...input.candles].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
  const fiveMinute = aggregateBTCOneMinuteCandles(oneMinute);
  const candleByTime = new Map(
    oneMinute.map((candle, index) => [candle.timestamp.getTime(), { candle, index }]),
  );
  const firstTime = fiveMinute[0]?.timestamp.getTime() ?? 0,
    lastTime = fiveMinute.at(-1)?.endTimestamp.getTime() ?? firstTime;
  const splitTime = firstTime + (lastTime - firstTime) * 0.7;
  const signals: Record<wick_direction, number> = { LONG_BTC: 0, SHORT_BTC: 0 };
  const splitSignals: Record<split_label, Record<wick_direction, number>> = {
    DISCOVERY: { LONG_BTC: 0, SHORT_BTC: 0 },
    HOLDOUT: { LONG_BTC: 0, SHORT_BTC: 0 },
  };
  const ignored: Record<split_label, number> = { DISCOVERY: 0, HOLDOUT: 0 };
  const campaigns: wick_campaign[] = [];
  let activeUntil = -1,
    equity = BTC5MWickRejectionExperiment.startingEquity;
  let attempts = 0,
    failures = 0,
    depositCount = 0,
    totalDeposited = 0;
  for (const signalCandle of fiveMinute) {
    const direction = detectWickSignal(signalCandle);
    if (!direction) continue;
    const signalTime = signalCandle.endTimestamp.getTime(),
      splitLabel: split_label = signalTime < splitTime ? 'DISCOVERY' : 'HOLDOUT';
    signals[direction] += 1;
    splitSignals[splitLabel][direction] += 1;
    if (signalTime <= activeUntil) {
      ignored[splitLabel] += 1;
      continue;
    }
    attempts += 1;
    const eligible = candleByTime.get(signalTime);
    if (
      !eligible ||
      !isResearchLimitFillable(
        direction,
        signalCandle.close,
        eligible.candle,
        input.market.tickSize,
      )
    ) {
      failures += 1;
      continue;
    }
    const sizing = calculateSingleLegSizing(equity, signalCandle.close, input.market);
    const riskDistance =
      direction === 'LONG_BTC'
        ? signalCandle.close - signalCandle.low
        : signalCandle.high - signalCandle.close;
    if (!sizing || riskDistance <= 0) {
      failures += 1;
      continue;
    }
    const geometry = calculateWickGeometry(signalCandle),
      stop = direction === 'LONG_BTC' ? signalCandle.low : signalCandle.high;
    const target =
      direction === 'LONG_BTC'
        ? signalCandle.close + riskDistance
        : signalCandle.close - riskDistance;
    const entryFee = sizing.notional * input.market.makerFeeRate;
    let outcome: wick_campaign['outcome'] = 'OPEN_AT_DATASET_END',
      exitPrice: number | null = null,
      completion: number | null = null;
    for (let index = eligible.index; index < oneMinute.length; index += 1) {
      const candle = oneMinute[index]!;
      const health = evaluateSingleLegMarginGuard({
        equity: equity - entryFee,
        direction,
        entryPrice: signalCandle.close,
        markPrice: candle.close,
        quantity: sizing.quantity,
        maximumLeverage: input.market.maximumLeverage,
      });
      const stopHit = direction === 'LONG_BTC' ? candle.low <= stop : candle.high >= stop;
      const targetHit = direction === 'LONG_BTC' ? candle.high >= target : candle.low <= target;
      if (health.triggered) {
        outcome = 'MARGIN_GUARD';
        exitPrice = candle.close;
      } else if (stopHit) {
        outcome = 'STOP_LOSS';
        exitPrice = stop;
      } else if (targetHit) {
        outcome = 'TAKE_PROFIT';
        exitPrice = target;
      }
      if (exitPrice !== null) {
        completion = candle.timestamp.getTime() + minute;
        activeUntil = completion;
        break;
      }
    }
    const grossPnL =
      exitPrice === null ? 0 : pnl(direction, signalCandle.close, exitPrice, sizing.quantity);
    const exitFee =
      exitPrice === null
        ? 0
        : Math.abs(exitPrice * sizing.quantity) *
          (outcome === 'TAKE_PROFIT' ? input.market.makerFeeRate : input.market.takerFeeRate);
    const totalFees = entryFee + exitFee,
      netPnL = exitPrice === null ? 0 : grossPnL - totalFees;
    const after = exitPrice === null ? equity : equity + netPnL;
    let deposit = 0;
    if (exitPrice !== null && after < BTC5MWickRejectionExperiment.depositTrigger) {
      deposit = BTC5MWickRejectionExperiment.depositAmount;
      depositCount += 1;
      totalDeposited += deposit;
    }
    campaigns.push({
      signal5mStartTimestamp: signalCandle.timestamp.getTime(),
      signal5mEndTimestamp: signalTime,
      direction,
      signalOpen: signalCandle.open,
      signalHigh: signalCandle.high,
      signalLow: signalCandle.low,
      signalClose: signalCandle.close,
      body: geometry.body,
      upperWick: geometry.upperWick,
      lowerWick: geometry.lowerWick,
      entryOrderTimestamp: signalTime,
      entryFillTimestamp: eligible.candle.timestamp.getTime() + minute,
      entryFillPrice: signalCandle.close,
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
      equityAfterRealization: after,
      depositAppliedAfterCampaign: deposit,
      splitLabel,
    });
    if (exitPrice === null) activeUntil = Number.POSITIVE_INFINITY;
    else equity = after + deposit;
  }
  const discoveryCampaigns = campaigns.filter((value) => value.splitLabel === 'DISCOVERY');
  const holdoutCampaigns = campaigns.filter((value) => value.splitLabel === 'HOLDOUT');
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
  const blocks = new Map<number, wick_campaign[]>();
  for (const campaign of campaigns) {
    const block = Math.floor((campaign.signal5mEndTimestamp - firstTime) / (7 * 86_400_000));
    const values = blocks.get(block) ?? [];
    values.push(campaign);
    blocks.set(block, values);
  }
  const economicPnL = equity - BTC5MWickRejectionExperiment.startingEquity - totalDeposited;
  return {
    experimentId: BTC5MWickRejectionExperiment.experimentId,
    dataRange: {
      firstTimestamp: oneMinute[0]?.timestamp.getTime() ?? null,
      lastTimestamp: oneMinute.at(-1)?.timestamp.getTime() ?? null,
      oneMinuteCandleCount: oneMinute.length,
    },
    leverageSource: input.leverageSource,
    executionSemantics: {
      entry: 'ONE_MINUTE_PASSIVE_LIMIT_TRADE_THROUGH_ONE_TICK',
      stopAndMargin: 'AGGRESSIVE_LIMIT_TAKER_FEE',
      takeProfit: 'RESTING_LIMIT_MAKER_FEE',
      funding: 'UNAVAILABLE_ZERO',
    },
    signalDefinition: {
      long: 'lowerWick>=2*body && lowerWick>=2*upperWick && close>midpoint',
      short: 'upperWick>=2*body && upperWick>=2*lowerWick && close<midpoint',
    },
    exitDefinition: {
      stop: 'SIGNAL_WICK_EXTREME',
      target: 'EXACTLY_1R_FROM_ACTUAL_FILL',
      ambiguity: 'STOP_LOSS',
      marginGuard: 'markedAccountEquity<currentNotional/(maximumLeverage*2)',
    },
    split: { discoveryEndTimestamp: splitTime, discoveryFraction: 0.7 },
    signalAccounting: {
      valid5mCandleCount: fiveMinute.length,
      longSignalCount: signals.LONG_BTC,
      shortSignalCount: signals.SHORT_BTC,
      rawSignalCount: signals.LONG_BTC + signals.SHORT_BTC,
      signalIgnoredWhileActiveCount: ignored.DISCOVERY + ignored.HOLDOUT,
      entryAttemptCount: attempts,
      entryFilledCount: campaigns.length,
      entryFailedCount: failures,
    },
    overall: {
      ...overall,
      valid5mCandleCount: fiveMinute.length,
      longCompletedCampaignCount: campaigns.filter(
        (value) => value.direction === 'LONG_BTC' && value.outcome !== 'OPEN_AT_DATASET_END',
      ).length,
      shortCompletedCampaignCount: campaigns.filter(
        (value) => value.direction === 'SHORT_BTC' && value.outcome !== 'OPEN_AT_DATASET_END',
      ).length,
      openAtDatasetEndCount: campaigns.filter((value) => value.outcome === 'OPEN_AT_DATASET_END')
        .length,
      meanTotalFees: average(campaigns.map((value) => value.totalFees)),
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
    holdout: { ...holdout, byDirection: byDirection(holdoutCampaigns, splitSignals.HOLDOUT) },
    byDirection: byDirection(campaigns, signals),
    bySevenDayBlock: [...blocks]
      .sort(([left], [right]) => left - right)
      .map(([blockIndex, values]) => {
        const summary = summarize(values);
        return {
          blockIndex,
          startTimestamp: firstTime + blockIndex * 7 * 86_400_000,
          longSignals: values.filter((value) => value.direction === 'LONG_BTC').length,
          shortSignals: values.filter((value) => value.direction === 'SHORT_BTC').length,
          completedCampaignCount: summary.completedCampaignCount,
          takeProfitCount: summary.takeProfitCount,
          stopLossCount: summary.stopLossCount,
          marginGuardCount: summary.marginGuardCount,
          tpRate: summary.tpRate,
          grossProfitFactor: summary.grossProfitFactor,
          netProfitFactor: summary.netProfitFactor,
          netPnLSum: summary.netPnLSum,
          meanHoldingMinutes: summary.meanHoldingMinutes,
        };
      }),
    campaigns,
    classification: classifyWickReport(holdout, economicPnL),
  };
}
