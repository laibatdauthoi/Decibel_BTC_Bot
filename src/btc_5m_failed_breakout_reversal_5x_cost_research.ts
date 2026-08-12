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
  type five_minute_candle,
} from './btc_5m_wick_rejection_research.js';
import type { BTC_candlestick } from './decibel_client.js';

export const BTC5MFailedBreakoutReversal5XCostExperiment = {
  experimentId: 'BTC_5M_FAILED_BREAKOUT_REVERSAL_5X_COST_V1' as const,
  failureCandles: 6,
  entryMinutes: 30,
  startingEquity: 30,
  depositTrigger: 15,
  depositAmount: 15,
};
type outcome =
  | 'NO_FAILURE_WITHIN_30M'
  | 'WAITING_AT_DATASET_END'
  | 'ENTRY_FAILED'
  | 'PENDING_AT_DATASET_END'
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'MARGIN_GUARD'
  | 'OPEN_AT_DATASET_END';
export type failed_breakout_campaign = compression_context & {
  breakoutTimestamp: number;
  originalBreakoutDirection: wick_direction;
  tradeDirection: wick_direction;
  breakoutOpen: number;
  breakoutHigh: number;
  breakoutLow: number;
  breakoutClose: number;
  breakoutDistanceBps: number;
  failureConfirmed: boolean;
  failureTimestamp: number | null;
  failureOpen: number | null;
  failureHigh: number | null;
  failureLow: number | null;
  failureClose: number | null;
  failureCloseDepthBps: number | null;
  minutesBreakoutToFailure: number | null;
  entryLimitPrice: number;
  entryWindowStartTimestamp: number | null;
  entryWindowEndTimestamp: number | null;
  entryFillTimestamp: number | null;
  minutesFailureToEntry: number | null;
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
export type failed_breakout_metrics = {
  rawBreakoutCount: number;
  breakoutAcceptedWhileFlatCount: number;
  failureConfirmedCount: number;
  failureRate: number;
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
type seven_day_block = {
  blockIndex: number;
  startTimestamp: number;
  acceptedBreakoutCount: number;
  failureConfirmedCount: number;
  failureRate: number;
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
type timing = { mean: number; median: number; p25: number; p75: number; p90: number };
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
  meanRealizedToExpectedCostRatio: number;
  medianRealizedToExpectedCostRatio: number;
};
type break_even = {
  meanGrossWin: number | null;
  meanGrossLossAbs: number | null;
  meanFeePerCampaign: number | null;
  actualTpRate: number;
  empiricalBreakEvenWinRate: number | null;
  winRateGapPercentagePoints: number | null;
};
export type failed_breakout_report = {
  experimentId: typeof BTC5MFailedBreakoutReversal5XCostExperiment.experimentId;
  dataRange: {
    firstTimestamp: number | null;
    lastTimestamp: number | null;
    oneMinuteCandleCount: number;
  };
  leverageSource: string;
  executionSemantics: Record<string, string>;
  compressionDefinition: Record<string, string>;
  breakoutDefinition: Record<string, string>;
  failureDefinition: Record<string, string>;
  entryDefinition: Record<string, string>;
  costDefinition: Record<string, string>;
  exitDefinition: Record<string, string>;
  split: { discoveryEndTimestamp: number; discoveryFraction: 0.7 };
  signalAccounting: {
    valid5mCandleCount: number;
    contextEligible5mCandleCount: number;
    compressedWindowCount: number;
    rawUpBreakoutCount: number;
    rawDownBreakoutCount: number;
    rawBreakoutCount: number;
    breakoutAcceptedWhileFlatCount: number;
    signalIgnoredWhileWaitingForFailureCount: number;
    signalIgnoredWhilePendingCount: number;
    signalIgnoredWhileActiveCount: number;
    failureConfirmedCount: number;
    failureNotConfirmedWithin30mCount: number;
    upBreakoutFailureCount: number;
    downBreakoutFailureCount: number;
    failureRate: number;
    entryAttemptCount: number;
    entryFilledCount: number;
    entryFailedCount: number;
    entryFillRate: number;
  };
  failureTimingDiagnostics: timing & {
    failedWithin5mCount: number;
    failedWithin10mCount: number;
    failedWithin15mCount: number;
    failedWithin20mCount: number;
    failedWithin25mCount: number;
    failedWithin30mCount: number;
  };
  entryTimingDiagnostics: timing & {
    filledWithin5mCount: number;
    filledWithin10mCount: number;
    filledWithin15mCount: number;
    filledWithin20mCount: number;
    filledWithin30mCount: number;
  };
  structureDiagnostics: {
    meanCompressionRatio: number;
    medianCompressionRatio: number;
    meanBreakoutDistanceBps: number;
    medianBreakoutDistanceBps: number;
    meanFailureCloseDepthBps: number;
    medianFailureCloseDepthBps: number;
  };
  costGeometryDiagnostics: { overall: cost_diagnostic; holdout: cost_diagnostic };
  overall: failed_breakout_metrics & {
    longCompletedCampaignCount: number;
    shortCompletedCampaignCount: number;
    openAtDatasetEndCount: number;
    waitingAtDatasetEndCount: number;
    pendingAtDatasetEndCount: number;
    depositCount: number;
    totalDeposited: number;
    startingEquity: number;
    endingEquity: number;
    economicPnL: number;
  };
  discovery: failed_breakout_metrics;
  holdout: failed_breakout_metrics & {
    byDirection: Record<wick_direction, failed_breakout_metrics & { signalCount: number }>;
  };
  byDirection: Record<wick_direction, failed_breakout_metrics & { signalCount: number }>;
  breakEvenDiagnostic: { overall: break_even; holdout: break_even };
  comparison: { compressionContinuation: comparison; impulsePullback: comparison };
  bySevenDayBlock: seven_day_block[];
  campaigns: failed_breakout_campaign[];
  classification:
    | 'BTC_5M_FAILED_BREAKOUT_REVERSAL_5X_COST_HOLDOUT_PROMISING'
    | 'BTC_5M_FAILED_BREAKOUT_REVERSAL_5X_COST_HOLDOUT_INTERESTING'
    | 'NO_USEFUL_BTC_5M_FAILED_BREAKOUT_REVERSAL_5X_COST_EDGE';
};
type comparison = {
  available: boolean;
  baseline?: Record<string, unknown>;
  candidate?: Record<string, number | null>;
  delta?: Record<string, number | null>;
};
const minute = 60_000,
  week = 7 * 86_400_000;
const mean = (v: readonly number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const pct = (v: readonly number[], p: number) =>
  v.length ? [...v].sort((a, b) => a - b)[Math.floor((v.length - 1) * p)]! : 0;
const completed = (c: failed_breakout_campaign) =>
  ['TAKE_PROFIT', 'STOP_LOSS', 'MARGIN_GUARD'].includes(c.outcome);
const timing = (v: readonly number[]): timing => ({
  mean: mean(v),
  median: pct(v, 0.5),
  p25: pct(v, 0.25),
  p75: pct(v, 0.75),
  p90: pct(v, 0.9),
});

export function detectFailureCandle(input: {
  candles: readonly five_minute_candle[];
  breakoutIndex: number;
  direction: wick_direction;
  context: compression_context;
}): { candle: five_minute_candle; index: number } | null {
  const breakoutEnd = input.candles[input.breakoutIndex]!.endTimestamp.getTime();
  for (
    let offset = 1;
    offset <= 6 && input.breakoutIndex + offset < input.candles.length;
    offset++
  ) {
    const candle = input.candles[input.breakoutIndex + offset]!;
    if (candle.timestamp.getTime() >= breakoutEnd + 30 * minute) break;
    const failed =
      candle.close > input.context.compressionLow && candle.close < input.context.compressionHigh;
    if (failed) return { candle, index: input.breakoutIndex + offset };
  }
  return null;
}
function summarize(
  campaigns: readonly failed_breakout_campaign[],
  raw = campaigns.length,
): failed_breakout_metrics {
  const failures = campaigns.filter((c) => c.failureConfirmed),
    filled = campaigns.filter((c) => c.entryFillPrice !== null),
    closed = campaigns.filter(completed),
    gp = closed.filter((c) => c.grossPnL > 0).reduce((s, c) => s + c.grossPnL, 0),
    gl = -closed.filter((c) => c.grossPnL < 0).reduce((s, c) => s + c.grossPnL, 0),
    np = closed.filter((c) => c.netPnL > 0).reduce((s, c) => s + c.netPnL, 0),
    nl = -closed.filter((c) => c.netPnL < 0).reduce((s, c) => s + c.netPnL, 0),
    hold = closed.flatMap((c) => (c.holdingMinutes === null ? [] : [c.holdingMinutes])),
    fees = closed.map((c) => c.totalFees),
    tp = closed.filter((c) => c.outcome === 'TAKE_PROFIT').length;
  return {
    rawBreakoutCount: raw,
    breakoutAcceptedWhileFlatCount: campaigns.length,
    failureConfirmedCount: failures.length,
    failureRate: campaigns.length ? failures.length / campaigns.length : 0,
    entryAttemptCount: failures.length,
    entryFilledCount: filled.length,
    entryFailedCount: campaigns.filter((c) => c.outcome === 'ENTRY_FAILED').length,
    entryFillRate: failures.length ? filled.length / failures.length : 0,
    completedCampaignCount: closed.length,
    takeProfitCount: tp,
    stopLossCount: closed.filter((c) => c.outcome === 'STOP_LOSS').length,
    marginGuardCount: closed.filter((c) => c.outcome === 'MARGIN_GUARD').length,
    tpRate: closed.length ? tp / closed.length : 0,
    grossProfitSum: gp,
    grossLossSumAbs: gl,
    grossPnLSum: gp - gl,
    grossProfitFactor: gl ? gp / gl : null,
    netProfitSum: np,
    netLossSumAbs: nl,
    netPnLSum: np - nl,
    netProfitFactor: nl ? np / nl : null,
    meanHoldingMinutes: mean(hold),
    medianHoldingMinutes: pct(hold, 0.5),
    meanTotalFees: mean(fees),
    medianTotalFees: pct(fees, 0.5),
  };
}
function costDiag(c: readonly failed_breakout_campaign[]): cost_diagnostic {
  const f = c.filter((x) => x.expectedCampaignCostDollars !== null),
    vals = (key: keyof failed_breakout_campaign) =>
      f.flatMap((x) => {
        const value = x[key];
        return typeof value === 'number' ? [value] : [];
      }),
    d = f.flatMap((x) =>
      x.actualTakeProfitDistance !== null && x.entryFillPrice !== null
        ? [(x.actualTakeProfitDistance / x.entryFillPrice) * 1e4]
        : [],
    ),
    r = f
      .filter(completed)
      .flatMap((x) =>
        x.realizedToExpectedCostRatio === null ? [] : [x.realizedToExpectedCostRatio],
      );
  return {
    meanExpectedCampaignCostDollars: mean(vals('expectedCampaignCostDollars')),
    medianExpectedCampaignCostDollars: pct(vals('expectedCampaignCostDollars'), 0.5),
    meanExpectedCampaignCostBps: mean(vals('expectedCampaignCostBps')),
    medianExpectedCampaignCostBps: pct(vals('expectedCampaignCostBps'), 0.5),
    meanFiveCostDistanceBps: mean(d),
    medianFiveCostDistanceBps: pct(d, 0.5),
    meanActualTPCostMultiple: mean(vals('actualTakeProfitCostMultiple')),
    medianActualTPCostMultiple: pct(vals('actualTakeProfitCostMultiple'), 0.5),
    meanActualSLCostMultiple: mean(vals('actualStopCostMultiple')),
    medianActualSLCostMultiple: pct(vals('actualStopCostMultiple'), 0.5),
    meanRealizedToExpectedCostRatio: mean(r),
    medianRealizedToExpectedCostRatio: pct(r, 0.5),
  };
}
function breakEven(c: readonly failed_breakout_campaign[]): break_even {
  const x = c.filter(completed),
    w = x.filter((v) => v.grossPnL > 0).map((v) => v.grossPnL),
    l = x.filter((v) => v.grossPnL < 0).map((v) => -v.grossPnL),
    f = x.map((v) => v.totalFees),
    W = w.length ? mean(w) : null,
    L = l.length ? mean(l) : null,
    F = f.length ? mean(f) : null,
    actual = x.length ? x.filter((v) => v.outcome === 'TAKE_PROFIT').length / x.length : 0,
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
function compare(candidate: failed_breakout_metrics, artifact: unknown): comparison {
  if (typeof artifact !== 'object' || artifact === null) return { available: false };
  const h = (artifact as Record<string, unknown>).holdout;
  if (typeof h !== 'object' || h === null) return { available: false };
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
    base = Object.fromEntries(fields.map((k) => [k, (h as Record<string, unknown>)[k]])),
    cand = Object.fromEntries(fields.map((k) => [k, candidate[k]])) as Record<
      string,
      number | null
    >,
    delta: Record<string, number | null> = {};
  for (const k of fields) {
    const b = base[k],
      v = cand[k];
    delta[k] = typeof b === 'number' && typeof v === 'number' ? v - b : null;
  }
  return { available: true, baseline: base, candidate: cand, delta };
}
export function classifyFailedBreakout5XCost(
  h: failed_breakout_metrics,
  e: number,
): failed_breakout_report['classification'] {
  if (
    h.completedCampaignCount >= 30 &&
    (h.grossProfitFactor ?? 0) >= 1 &&
    (h.netProfitFactor ?? 0) >= 1 &&
    h.netPnLSum > 0 &&
    e > 0
  )
    return 'BTC_5M_FAILED_BREAKOUT_REVERSAL_5X_COST_HOLDOUT_PROMISING';
  if (
    h.completedCampaignCount >= 30 &&
    (h.grossProfitFactor ?? 0) >= 1 &&
    (h.netProfitFactor ?? 0) >= 0.8
  )
    return 'BTC_5M_FAILED_BREAKOUT_REVERSAL_5X_COST_HOLDOUT_INTERESTING';
  return 'NO_USEFUL_BTC_5M_FAILED_BREAKOUT_REVERSAL_5X_COST_EDGE';
}

export function runBTC5MFailedBreakoutReversal5XCostReplay(input: {
  candles: readonly BTC_candlestick[];
  market: btc_research_market;
  leverageSource: string;
  compressionReport?: unknown;
  impulseReport?: unknown;
}): failed_breakout_report {
  const m = [...input.candles].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    f = aggregateBTCOneMinuteCandles(m),
    map = new Map(m.map((c, i) => [c.timestamp.getTime(), { c, i }])),
    first = f[0]?.timestamp.getTime() ?? 0,
    last = f.at(-1)?.endTimestamp.getTime() ?? first,
    split = first + (last - first) * 0.7,
    last1 = m.at(-1)?.timestamp.getTime() ?? -1;
  const campaigns: failed_breakout_campaign[] = [],
    raw: Record<wick_direction, number> = { LONG_BTC: 0, SHORT_BTC: 0 },
    splitRaw: Record<split_label, Record<wick_direction, number>> = {
      DISCOVERY: { LONG_BTC: 0, SHORT_BTC: 0 },
      HOLDOUT: { LONG_BTC: 0, SHORT_BTC: 0 },
    };
  let compressed = 0,
    waitingUntil = -1,
    pendingUntil = -1,
    activeUntil = -1,
    ignoredWaiting = 0,
    ignoredPending = 0,
    ignoredActive = 0,
    equity = 30,
    deposits = 0,
    depositCount = 0;
  const failTimes: number[] = [],
    entryTimes: number[] = [];
  for (let i = 24; i < f.length; i++) {
    const candle = f[i]!,
      ctx = calculateCompressionContext(f, i);
    if (!ctx) continue;
    compressed++;
    const original = detectCompressionBreakout(candle, ctx);
    if (!original) continue;
    const bt = candle.endTimestamp.getTime(),
      label: split_label = bt < split ? 'DISCOVERY' : 'HOLDOUT';
    raw[original]++;
    splitRaw[label][original]++;
    if (bt < waitingUntil) {
      ignoredWaiting++;
      continue;
    }
    if (bt < pendingUntil) {
      ignoredPending++;
      continue;
    }
    if (bt < activeUntil) {
      ignoredActive++;
      continue;
    }
    const trade: wick_direction = original === 'LONG_BTC' ? 'SHORT_BTC' : 'LONG_BTC',
      level = original === 'LONG_BTC' ? ctx.compressionHigh : ctx.compressionLow,
      failure = detectFailureCandle({
        candles: f,
        breakoutIndex: i,
        direction: original,
        context: ctx,
      }),
      dist =
        original === 'LONG_BTC'
          ? ((candle.close - ctx.compressionHigh) / candle.close) * 1e4
          : ((ctx.compressionLow - candle.close) / candle.close) * 1e4,
      base = {
        ...ctx,
        breakoutTimestamp: bt,
        originalBreakoutDirection: original,
        tradeDirection: trade,
        breakoutOpen: candle.open,
        breakoutHigh: candle.high,
        breakoutLow: candle.low,
        breakoutClose: candle.close,
        breakoutDistanceBps: dist,
        entryLimitPrice: level,
        equityBeforeCampaign: equity,
        splitLabel: label,
      };
    const empty = (outcome: outcome, fc: five_minute_candle | null): failed_breakout_campaign => {
      const ft = fc?.endTimestamp.getTime() ?? null,
        depth = fc
          ? original === 'LONG_BTC'
            ? ((ctx.compressionHigh - fc.close) / fc.close) * 1e4
            : ((fc.close - ctx.compressionLow) / fc.close) * 1e4
          : null;
      return {
        ...base,
        failureConfirmed: fc !== null,
        failureTimestamp: ft,
        failureOpen: fc?.open ?? null,
        failureHigh: fc?.high ?? null,
        failureLow: fc?.low ?? null,
        failureClose: fc?.close ?? null,
        failureCloseDepthBps: depth,
        minutesBreakoutToFailure: ft === null ? null : (ft - bt) / minute,
        entryWindowStartTimestamp: ft,
        entryWindowEndTimestamp: ft === null ? null : ft + 30 * minute,
        entryFillTimestamp: null,
        minutesFailureToEntry: null,
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
        completionTimestamp: null,
        outcome,
        exitPrice: null,
        holdingMinutes: null,
        grossPnL: 0,
        totalFees: 0,
        realizedToExpectedCostRatio: null,
        netPnL: 0,
        equityAfterRealization: equity,
        depositAppliedAfterCampaign: 0,
      };
    };
    if (!failure) {
      const waitingEnd = bt + 30 * minute,
        atEnd = last < waitingEnd;
      campaigns.push(empty(atEnd ? 'WAITING_AT_DATASET_END' : 'NO_FAILURE_WITHIN_30M', null));
      waitingUntil = atEnd ? Infinity : waitingEnd;
      continue;
    }
    const fc = failure.candle,
      ft = fc.endTimestamp.getTime();
    failTimes.push((ft - bt) / minute);
    let fill: { c: BTC_candlestick; i: number; n: number } | null = null;
    for (let n = 1; n <= 30; n++) {
      const p = map.get(ft + (n - 1) * minute);
      if (p && isResearchLimitFillable(trade, level, p.c, input.market.tickSize)) {
        fill = { ...p, n };
        break;
      }
    }
    if (!fill) {
      const atEnd = last1 < ft + 29 * minute;
      campaigns.push(empty(atEnd ? 'PENDING_AT_DATASET_END' : 'ENTRY_FAILED', fc));
      pendingUntil = atEnd ? Infinity : ft + 30 * minute;
      waitingUntil = -1;
      continue;
    }
    const size = calculateSingleLegSizing(equity, level, input.market);
    if (!size) {
      campaigns.push(empty('ENTRY_FAILED', fc));
      pendingUntil = fill.c.timestamp.getTime() + minute;
      continue;
    }
    entryTimes.push(fill.n);
    const g = calculateFiveCostGeometry({
      direction: trade,
      fillPrice: level,
      quantity: size.quantity,
      entryNotional: size.notional,
      makerFeeRate: input.market.makerFeeRate,
      takerFeeRate: input.market.takerFeeRate,
      tickSize: input.market.tickSize,
    });
    if (g.actualStopCostMultiple + 1e-10 < 5 || g.actualTakeProfitCostMultiple + 1e-10 < 5)
      throw new Error('FIVE_COST_GEOMETRY_ROUNDED_INWARD');
    let out: outcome = 'OPEN_AT_DATASET_END',
      exit: number | null = null,
      done: number | null = null;
    for (let j = fill.i; j < m.length; j++) {
      const x = m[j]!,
        health = evaluateSingleLegMarginGuard({
          equity: equity - g.expectedEntryFeeDollars,
          direction: trade,
          entryPrice: level,
          markPrice: x.close,
          quantity: size.quantity,
          maximumLeverage: input.market.maximumLeverage,
        }),
        stop = trade === 'LONG_BTC' ? x.low <= g.stopTriggerPrice : x.high >= g.stopTriggerPrice,
        target =
          trade === 'LONG_BTC'
            ? x.high >= g.takeProfitTriggerPrice
            : x.low <= g.takeProfitTriggerPrice;
      if (health.triggered) {
        out = 'MARGIN_GUARD';
        exit = x.close;
      } else if (stop) {
        out = 'STOP_LOSS';
        exit = g.stopTriggerPrice;
      } else if (target) {
        out = 'TAKE_PROFIT';
        exit = g.takeProfitTriggerPrice;
      }
      if (exit !== null) {
        done = x.timestamp.getTime() + minute;
        break;
      }
    }
    const entryFee = g.expectedEntryFeeDollars,
      gross =
        exit === null ? 0 : (trade === 'LONG_BTC' ? exit - level : level - exit) * size.quantity,
      exitFee =
        exit === null
          ? 0
          : Math.abs(exit * size.quantity) *
            (out === 'TAKE_PROFIT' ? input.market.makerFeeRate : input.market.takerFeeRate),
      fees = entryFee + exitFee,
      net = exit === null ? 0 : gross - fees,
      after = exit === null ? equity : equity + net;
    let dep = 0;
    if (exit !== null && after < 15) {
      dep = 15;
      deposits += 15;
      depositCount++;
    }
    const shell = empty(out, fc),
      fillTime = fill.c.timestamp.getTime() + minute;
    campaigns.push({
      ...shell,
      entryFillTimestamp: fillTime,
      minutesFailureToEntry: fill.n,
      entryFillPrice: level,
      entryLeverage: input.market.maximumLeverage,
      entryNotional: size.notional,
      quantity: size.quantity,
      initialMarginUsed: size.initialMargin,
      ...g,
      completionTimestamp: done,
      outcome: out,
      exitPrice: exit,
      holdingMinutes: done === null ? null : (done - fillTime) / minute,
      grossPnL: gross,
      totalFees: fees,
      realizedToExpectedCostRatio: exit === null ? null : fees / g.expectedCampaignCostDollars,
      netPnL: net,
      equityAfterRealization: after,
      depositAppliedAfterCampaign: dep,
    });
    waitingUntil = -1;
    pendingUntil = fillTime;
    activeUntil = done ?? Infinity;
    if (exit !== null) equity = after + dep;
  }
  const disc = campaigns.filter((c) => c.splitLabel === 'DISCOVERY'),
    hold = campaigns.filter((c) => c.splitLabel === 'HOLDOUT'),
    allM = summarize(campaigns, raw.LONG_BTC + raw.SHORT_BTC),
    holdM = summarize(hold, splitRaw.HOLDOUT.LONG_BTC + splitRaw.HOLDOUT.SHORT_BTC),
    closed = campaigns.filter(completed),
    econ = equity - 30 - deposits;
  const dirs = (
      cs: readonly failed_breakout_campaign[],
      signals: Record<wick_direction, number>,
    ) => ({
      LONG_BTC: {
        ...summarize(
          cs.filter((c) => c.tradeDirection === 'LONG_BTC'),
          signals.SHORT_BTC,
        ),
        signalCount: signals.SHORT_BTC,
      },
      SHORT_BTC: {
        ...summarize(
          cs.filter((c) => c.tradeDirection === 'SHORT_BTC'),
          signals.LONG_BTC,
        ),
        signalCount: signals.LONG_BTC,
      },
    }),
    groups = new Map<number, failed_breakout_campaign[]>();
  for (const c of campaigns) {
    const k = Math.floor((c.breakoutTimestamp - first) / week),
      v = groups.get(k) ?? [];
    v.push(c);
    groups.set(k, v);
  }
  const blocks = [...groups]
    .sort(([a], [b]) => a - b)
    .map(([blockIndex, v]): seven_day_block => {
      const s = summarize(v);
      return {
        blockIndex,
        startTimestamp: first + blockIndex * week,
        acceptedBreakoutCount: v.length,
        failureConfirmedCount: s.failureConfirmedCount,
        failureRate: s.failureRate,
        entryAttempts: s.entryAttemptCount,
        entryFills: s.entryFilledCount,
        entryFillRate: s.entryFillRate,
        completedCampaignCount: s.completedCampaignCount,
        takeProfitCount: s.takeProfitCount,
        stopLossCount: s.stopLossCount,
        marginGuardCount: s.marginGuardCount,
        tpRate: s.tpRate,
        grossProfitFactor: s.grossProfitFactor,
        netProfitFactor: s.netProfitFactor,
        grossPnLSum: s.grossPnLSum,
        netPnLSum: s.netPnLSum,
        meanHoldingMinutes: s.meanHoldingMinutes,
      };
    });
  const ft = timing(failTimes),
    et = timing(entryTimes),
    depth = campaigns.flatMap((c) =>
      c.failureCloseDepthBps === null ? [] : [c.failureCloseDepthBps],
    );
  return {
    experimentId: BTC5MFailedBreakoutReversal5XCostExperiment.experimentId,
    dataRange: {
      firstTimestamp: m[0]?.timestamp.getTime() ?? null,
      lastTimestamp: m.at(-1)?.timestamp.getTime() ?? null,
      oneMinuteCandleCount: m.length,
    },
    leverageSource: input.leverageSource,
    executionSemantics: {
      entry: 'PASSIVE_LIMIT_ONE_TICK_TRADE_THROUGH',
      ambiguity: 'STOP_LOSS',
      funding: 'UNAVAILABLE_ZERO',
    },
    compressionDefinition: { rule: 'recent12Range<previous12Range' },
    breakoutDefinition: { up: 'close>compressionHigh', down: 'close<compressionLow' },
    failureDefinition: {
      up: 'compressionLow<subsequentCompletedClose<compressionHigh',
      down: 'compressionLow<subsequentCompletedClose<compressionHigh',
      window: 'NEXT_SIX_VALID_5M_AND_MAX_30_ELAPSED_MINUTES',
    },
    entryDefinition: {
      upFailure: 'SHORT@compressionHigh',
      downFailure: 'LONG@compressionLow',
      lifetime: 'NEXT_30_1M',
    },
    costDefinition: {
      formula: 'entryNotional*(makerFeeRate+takerFeeRate)',
      futureFees: 'NOT_USED',
    },
    exitDefinition: {
      distance: '5*expectedCampaignCost/abs(quantity)',
      rounding: 'OUTWARD',
      ambiguity: 'STOP_LOSS',
    },
    split: { discoveryEndTimestamp: split, discoveryFraction: 0.7 },
    signalAccounting: {
      valid5mCandleCount: f.length,
      contextEligible5mCandleCount: Math.max(0, f.length - 24),
      compressedWindowCount: compressed,
      rawUpBreakoutCount: raw.LONG_BTC,
      rawDownBreakoutCount: raw.SHORT_BTC,
      rawBreakoutCount: raw.LONG_BTC + raw.SHORT_BTC,
      breakoutAcceptedWhileFlatCount: campaigns.length,
      signalIgnoredWhileWaitingForFailureCount: ignoredWaiting,
      signalIgnoredWhilePendingCount: ignoredPending,
      signalIgnoredWhileActiveCount: ignoredActive,
      failureConfirmedCount: campaigns.filter((c) => c.failureConfirmed).length,
      failureNotConfirmedWithin30mCount: campaigns.filter(
        (c) => c.outcome === 'NO_FAILURE_WITHIN_30M',
      ).length,
      upBreakoutFailureCount: campaigns.filter(
        (c) => c.originalBreakoutDirection === 'LONG_BTC' && c.failureConfirmed,
      ).length,
      downBreakoutFailureCount: campaigns.filter(
        (c) => c.originalBreakoutDirection === 'SHORT_BTC' && c.failureConfirmed,
      ).length,
      failureRate: campaigns.length
        ? campaigns.filter((c) => c.failureConfirmed).length / campaigns.length
        : 0,
      entryAttemptCount: allM.entryAttemptCount,
      entryFilledCount: allM.entryFilledCount,
      entryFailedCount: allM.entryFailedCount,
      entryFillRate: allM.entryFillRate,
    },
    failureTimingDiagnostics: {
      ...ft,
      failedWithin5mCount: failTimes.filter((x) => x <= 5).length,
      failedWithin10mCount: failTimes.filter((x) => x <= 10).length,
      failedWithin15mCount: failTimes.filter((x) => x <= 15).length,
      failedWithin20mCount: failTimes.filter((x) => x <= 20).length,
      failedWithin25mCount: failTimes.filter((x) => x <= 25).length,
      failedWithin30mCount: failTimes.length,
    },
    entryTimingDiagnostics: {
      ...et,
      filledWithin5mCount: entryTimes.filter((x) => x <= 5).length,
      filledWithin10mCount: entryTimes.filter((x) => x <= 10).length,
      filledWithin15mCount: entryTimes.filter((x) => x <= 15).length,
      filledWithin20mCount: entryTimes.filter((x) => x <= 20).length,
      filledWithin30mCount: entryTimes.length,
    },
    structureDiagnostics: {
      meanCompressionRatio: mean(campaigns.map((c) => c.compressionRatio)),
      medianCompressionRatio: pct(
        campaigns.map((c) => c.compressionRatio),
        0.5,
      ),
      meanBreakoutDistanceBps: mean(campaigns.map((c) => c.breakoutDistanceBps)),
      medianBreakoutDistanceBps: pct(
        campaigns.map((c) => c.breakoutDistanceBps),
        0.5,
      ),
      meanFailureCloseDepthBps: mean(depth),
      medianFailureCloseDepthBps: pct(depth, 0.5),
    },
    costGeometryDiagnostics: { overall: costDiag(campaigns), holdout: costDiag(hold) },
    overall: {
      ...allM,
      longCompletedCampaignCount: closed.filter((c) => c.tradeDirection === 'LONG_BTC').length,
      shortCompletedCampaignCount: closed.filter((c) => c.tradeDirection === 'SHORT_BTC').length,
      openAtDatasetEndCount: campaigns.filter((c) => c.outcome === 'OPEN_AT_DATASET_END').length,
      waitingAtDatasetEndCount: campaigns.filter((c) => c.outcome === 'WAITING_AT_DATASET_END')
        .length,
      pendingAtDatasetEndCount: campaigns.filter((c) => c.outcome === 'PENDING_AT_DATASET_END')
        .length,
      depositCount,
      totalDeposited: deposits,
      startingEquity: 30,
      endingEquity: equity,
      economicPnL: econ,
    },
    discovery: summarize(disc, splitRaw.DISCOVERY.LONG_BTC + splitRaw.DISCOVERY.SHORT_BTC),
    holdout: { ...holdM, byDirection: dirs(hold, splitRaw.HOLDOUT) },
    byDirection: dirs(campaigns, raw),
    breakEvenDiagnostic: { overall: breakEven(campaigns), holdout: breakEven(hold) },
    comparison: {
      compressionContinuation: compare(holdM, input.compressionReport),
      impulsePullback: compare(holdM, input.impulseReport),
    },
    bySevenDayBlock: blocks,
    campaigns,
    classification: classifyFailedBreakout5XCost(holdM, econ),
  };
}
