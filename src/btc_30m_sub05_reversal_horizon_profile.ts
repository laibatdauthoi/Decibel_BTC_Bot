import type { price_candle } from './btc_bybit_decibel_overlap_audit.js';
import {
  aggregateExact30M,
  buildMinuteTimestampIndex,
} from './btc_30m_failed_auction_sweep_reclaim.js';

const minute = 60_000,
  day = 86_400_000;
export const HorizonMinutes = [30, 60, 120, 240] as const;
export type horizon_minutes = (typeof HorizonMinutes)[number];
export type horizon_key = `H${horizon_minutes}`;
type side = 'LONG' | 'SHORT';
type exact_30m_bar = price_candle & { minutes: price_candle[] };

export const Sub05ReversalHorizonProfileRules = {
  experimentId: 'BTC_30M_SUB05_REVERSAL_HORIZON_PROFILE_V1' as const,
  maximumAbsoluteMoveExclusive: 0.005,
  horizonsMinutes: HorizonMinutes,
  researchNotionalUsd: 100,
  discoveryFraction: 0.7,
  minimumRawSignalsPerDay: 5,
};

export type horizon_measurement = {
  horizonMinutes: horizon_minutes;
  valid: boolean;
  directionalPnlUsd: number | null;
  mfeUsd: number | null;
  maeUsd: number | null;
};

export type horizon_profile_event = {
  triggerTimestamp: number;
  signalKnownAt: number;
  entryTimestamp: number;
  entryPrice: number;
  move: number;
  absoluteMove: number;
  direction: side;
  horizons: Record<horizon_key, horizon_measurement>;
};

function horizonKey(horizon: horizon_minutes): horizon_key {
  switch (horizon) {
    case 30:
      return 'H30';
    case 60:
      return 'H60';
    case 120:
      return 'H120';
    case 240:
      return 'H240';
  }
}

export function createSub05ReversalHorizonEvent(
  trigger: exact_30m_bar,
  next: exact_30m_bar,
  minutes: readonly price_candle[],
  index = buildMinuteTimestampIndex(minutes),
): horizon_profile_event[] {
  const move = (trigger.close - trigger.open) / trigger.open;
  if (move === 0 || Math.abs(move) >= 0.005 || next.timestamp !== trigger.timestamp + 30 * minute)
    return [];
  const direction: side = move > 0 ? 'SHORT' : 'LONG',
    directionSign = direction === 'LONG' ? 1 : -1,
    start = index.get(next.timestamp),
    measure = (horizon: horizon_minutes): horizon_measurement => {
      const path = start === undefined ? [] : minutes.slice(start, start + horizon);
      if (
        path.length !== horizon ||
        path.some((candle, offset) => candle.timestamp !== next.timestamp + offset * minute)
      )
        return {
          horizonMinutes: horizon,
          valid: false,
          directionalPnlUsd: null,
          mfeUsd: null,
          maeUsd: null,
        };
      const finalPrice = path.at(-1)!.close,
        high = Math.max(...path.map((candle) => candle.high)),
        low = Math.min(...path.map((candle) => candle.low));
      return {
        horizonMinutes: horizon,
        valid: true,
        directionalPnlUsd: 100 * directionSign * (finalPrice / next.open - 1),
        mfeUsd: 100 * (direction === 'LONG' ? high / next.open - 1 : 1 - low / next.open),
        maeUsd: 100 * (direction === 'LONG' ? 1 - low / next.open : high / next.open - 1),
      };
    };
  return [
    {
      triggerTimestamp: trigger.timestamp,
      signalKnownAt: trigger.timestamp + 30 * minute,
      entryTimestamp: next.timestamp,
      entryPrice: next.open,
      move,
      absoluteMove: Math.abs(move),
      direction,
      horizons: {
        H30: measure(30),
        H60: measure(60),
        H120: measure(120),
        H240: measure(240),
      },
    },
  ];
}

function percentile(values: readonly number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    position = (sorted.length - 1) * fraction,
    lower = Math.floor(position),
    upper = Math.ceil(position),
    weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function mean(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function profitFactor(values: readonly number[]) {
  const losses = values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return losses === 0
    ? null
    : values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0) / Math.abs(losses);
}

export function summarizeHorizon(
  events: readonly horizon_profile_event[],
  horizon: horizon_minutes,
  start: number,
  end: number,
  direction?: side,
) {
  const key = horizonKey(horizon),
    measurements = events
      .filter(
        (event) =>
          event.triggerTimestamp >= start &&
          event.triggerTimestamp < end &&
          (direction === undefined || event.direction === direction),
      )
      .map((event) => event.horizons[key])
      .filter((measurement) => measurement.valid),
    pnl = measurements.map((measurement) => measurement.directionalPnlUsd!),
    mfe = measurements.map((measurement) => measurement.mfeUsd!),
    mae = measurements.map((measurement) => measurement.maeUsd!),
    average = mean(pnl),
    variance = pnl.length
      ? pnl.reduce((sum, value) => sum + (value - average!) ** 2, 0) / pnl.length
      : null,
    standardDeviationUsd = variance === null ? null : Math.sqrt(variance),
    rate = (count: number, total: number) => (total ? count / total : null);
  return {
    validSignalCount: measurements.length,
    meanDirectionalPnlUsd: average,
    medianDirectionalPnlUsd: percentile(pnl, 0.5),
    totalDirectionalPnlUsd: pnl.reduce((sum, value) => sum + value, 0),
    positiveCount: pnl.filter((value) => value > 0).length,
    negativeCount: pnl.filter((value) => value < 0).length,
    zeroCount: pnl.filter((value) => value === 0).length,
    positiveRate: rate(pnl.filter((value) => value > 0).length, pnl.length),
    grossProfitFactor: profitFactor(pnl),
    p10DirectionalPnlUsd: percentile(pnl, 0.1),
    p25DirectionalPnlUsd: percentile(pnl, 0.25),
    p50DirectionalPnlUsd: percentile(pnl, 0.5),
    p75DirectionalPnlUsd: percentile(pnl, 0.75),
    p90DirectionalPnlUsd: percentile(pnl, 0.9),
    standardDeviationUsd,
    standardErrorUsd:
      standardDeviationUsd === null ? null : standardDeviationUsd / Math.sqrt(pnl.length),
    meanMfeUsd: mean(mfe),
    medianMfeUsd: percentile(mfe, 0.5),
    p75MfeUsd: percentile(mfe, 0.75),
    p90MfeUsd: percentile(mfe, 0.9),
    meanMaeUsd: mean(mae),
    medianMaeUsd: percentile(mae, 0.5),
    p75MaeUsd: percentile(mae, 0.75),
    p90MaeUsd: percentile(mae, 0.9),
    meanMfeMinusMaeUsd: mean(measurements.map((item) => item.mfeUsd! - item.maeUsd!)),
    medianMfeMinusMaeUsd: percentile(
      measurements.map((item) => item.mfeUsd! - item.maeUsd!),
      0.5,
    ),
    mfe010Rate: rate(mfe.filter((value) => value >= 0.1).length, mfe.length),
    mfe020Rate: rate(mfe.filter((value) => value >= 0.2).length, mfe.length),
    mfe030Rate: rate(mfe.filter((value) => value >= 0.3).length, mfe.length),
    mfe040Rate: rate(mfe.filter((value) => value >= 0.4).length, mfe.length),
    mfe060Rate: rate(mfe.filter((value) => value >= 0.6).length, mfe.length),
    mae010Rate: rate(mae.filter((value) => value >= 0.1).length, mae.length),
    mae020Rate: rate(mae.filter((value) => value >= 0.2).length, mae.length),
    mae030Rate: rate(mae.filter((value) => value >= 0.3).length, mae.length),
    mae040Rate: rate(mae.filter((value) => value >= 0.4).length, mae.length),
    mae060Rate: rate(mae.filter((value) => value >= 0.6).length, mae.length),
  };
}

type horizon_summary = ReturnType<typeof summarizeHorizon>;

export function classifySub05ReversalHorizonProfile(
  discoverySignalsPerDay: number,
  holdoutSignalsPerDay: number,
  discovery: Readonly<Record<horizon_key, horizon_summary>>,
  holdout: Readonly<Record<horizon_key, horizon_summary>>,
) {
  const samePositiveHorizon = HorizonMinutes.some((horizon) => {
    const key = horizonKey(horizon),
      discoveryResult = discovery[key],
      holdoutResult = holdout[key];
    return (
      (discoveryResult.meanDirectionalPnlUsd ?? 0) > 0 &&
      (discoveryResult.grossProfitFactor ?? 0) > 1 &&
      (holdoutResult.meanDirectionalPnlUsd ?? 0) > 0 &&
      (holdoutResult.grossProfitFactor ?? 0) > 1
    );
  });
  return discoverySignalsPerDay >= 5 && holdoutSignalsPerDay >= 5 && samePositiveHorizon
    ? 'BTC_30M_SUB05_REVERSAL_HORIZON_PROFILE_EDGE_PRESENT'
    : 'BTC_30M_SUB05_REVERSAL_HORIZON_PROFILE_NO_STABLE_EDGE';
}

function buildPeriod(events: readonly horizon_profile_event[], start: number, end: number) {
  const periodEvents = events.filter(
      (event) => event.triggerTimestamp >= start && event.triggerTimestamp < end,
    ),
    calendarDays = (end - start) / day,
    horizons = Object.fromEntries(
      HorizonMinutes.map((horizon) => [
        horizonKey(horizon),
        summarizeHorizon(events, horizon, start, end),
      ]),
    ) as Record<horizon_key, horizon_summary>,
    byDirection = Object.fromEntries(
      (['LONG', 'SHORT'] as const).map((direction) => [
        direction,
        Object.fromEntries(
          HorizonMinutes.map((horizon) => {
            const result = summarizeHorizon(events, horizon, start, end, direction);
            return [
              horizonKey(horizon),
              {
                signalCount: result.validSignalCount,
                meanDirectionalPnlUsd: result.meanDirectionalPnlUsd,
                grossProfitFactor: result.grossProfitFactor,
              },
            ];
          }),
        ),
      ]),
    ),
    mean30 = horizons.H30.meanDirectionalPnlUsd,
    mean60 = horizons.H60.meanDirectionalPnlUsd,
    mean120 = horizons.H120.meanDirectionalPnlUsd,
    mean240 = horizons.H240.meanDirectionalPnlUsd,
    difference = (later: number | null, earlier: number | null) =>
      later === null || earlier === null ? null : later - earlier;
  return {
    calendarDays,
    signalCount: periodEvents.length,
    signalsPerDay: calendarDays ? periodEvents.length / calendarDays : 0,
    horizons,
    byDirection,
    edgeDecay: {
      mean30,
      mean60,
      mean120,
      mean240,
      increment30to60: difference(mean60, mean30),
      increment60to120: difference(mean120, mean60),
      increment120to240: difference(mean240, mean120),
    },
  };
}

export function buildSub05ReversalHorizonProfileReport(input: {
  candles: readonly price_candle[];
  externalValidationStartTimestamp: number;
  onProgress?: (value: { processed30mBars: number; signalCount: number }) => void;
}) {
  const started = Date.now(),
    research = input.candles.filter(
      (candle) => candle.timestamp < input.externalValidationStartTimestamp,
    ),
    aggregation = aggregateExact30M(research),
    index = buildMinuteTimestampIndex(research),
    events: horizon_profile_event[] = [];
  for (let i = 0; i + 1 < aggregation.bars.length; i++) {
    if (i === 0 || i % 10_000 === 0)
      input.onProgress?.({ processed30mBars: i, signalCount: events.length });
    events.push(
      ...createSub05ReversalHorizonEvent(
        aggregation.bars[i]!,
        aggregation.bars[i + 1]!,
        research,
        index,
      ),
    );
  }
  const start = research[0]?.timestamp ?? 0,
    end = input.externalValidationStartTimestamp,
    split = start + Math.floor(((end - start) * 0.7) / day) * day,
    overall = buildPeriod(events, start, end),
    discovery = buildPeriod(events, start, split),
    holdout = buildPeriod(events, split, end);
  return {
    experimentId: Sub05ReversalHorizonProfileRules.experimentId,
    dataRange: {
      researchFirstTimestamp: research[0]?.timestamp ?? null,
      researchLastTimestamp: research.at(-1)?.timestamp ?? null,
      loaded1mRows: research.length,
      valid30mBars: aggregation.bars.length,
      invalid30mGapCount: aggregation.invalid30mGapCount,
      chronologicalSplitTimestamp: split,
      discoveryFraction: 0.7,
      splitDefinition: 'SAME_CALENDAR_TIME_FORMULA_AND_BOUNDARY_AS_SUB05_MOVE_REVERSAL_RR3_V1',
    },
    externalValidationBoundary: {
      timestamp: input.externalValidationStartTimestamp,
      operator: 'STRICTLY_LESS_THAN',
      evaluated: false,
    },
    signalDefinition: '0_LT_ABSOLUTE_30M_OPEN_TO_CLOSE_MOVE_LT_0.005;REVERSAL_ONLY',
    referenceEntryDefinition: 'NEXT_30M_OPEN_NO_TRIGGER_RETURN;NOT_MAKER_FILLABILITY_CLAIM',
    horizonDefinition: { minutes: HorizonMinutes, continuousOneMinuteRequiredPerHorizon: true },
    pnlDefinition: 'GROSS_DIRECTIONAL_MARK_TO_MARKET_USD_PER_100_NOTIONAL',
    executionModel: null,
    takeProfit: null,
    stopLoss: null,
    fees: null,
    frequencyDefinition: { rawSignalsAreCompletedTrades: false },
    overall,
    discovery,
    holdout,
    classification: classifySub05ReversalHorizonProfile(
      discovery.signalsPerDay,
      holdout.signalsPerDay,
      discovery.horizons,
      holdout.horizons,
    ),
    interpretation: 'EDGE_SHAPE_DIAGNOSTIC_ONLY_NOT_EXECUTABLE_STRATEGY_APPROVAL',
    performance: {
      loaded1mRows: research.length,
      valid30mBars: aggregation.bars.length,
      signalCount: events.length,
      elapsedSeconds: (Date.now() - started) / 1000,
    },
  };
}
