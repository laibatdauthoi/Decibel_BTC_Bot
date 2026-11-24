/**
 * Strategy replay / backtest on recorded BBO data (2026-11-14). Offline research only: it
 * never touches the venue, the journal or the session store.
 *
 * It replays the production strategy rules with a parameter set shaped like
 * DECIBEL_STRATEGY_POLICY_V1, so parameter variants can be compared on the same data.
 * The candle extraction, the entry candle filter, the adverse candle counter, the DCA
 * momentum gate and the 5-minute range reuse the production functions.
 *
 * Fill model (conservative, BBO only): a resting maker BUY at P fills once the best bid
 * trades below P (the queue at P was consumed); a resting SELL at P once the best ask
 * trades above P. Max Loss and data gaps (a restart in production) close at the touch with
 * the taker fee. Fees are charged on every fill.
 */
import { DECIBEL_STRATEGY_POLICY_V1 } from './decibel_strategy_policy_v1.js';
import { DECIBEL_CAPACITY_POLICY_V1 } from './decibel_capacity_policy_v1.js';
import { isDecibelDCAMomentumSettledV1 } from './decibel_dca_v1.js';
import {
  calculateDecibelMidpointRangeBpsV1,
  countDecibelAdverseCandleClosesV1,
  getDecibelClosedCandlesV1,
  getDecibelEntryCandleBlockerV1,
} from './decibel_volatility_targets_v1.js';

export type decibel_backtest_policy_v1 = typeof DECIBEL_STRATEGY_POLICY_V1;

export type decibel_backtest_bbo_v1 = Readonly<{ at: number; bid: number; ask: number }>;

export type decibel_backtest_config_v1 = Readonly<{
  policy: decibel_backtest_policy_v1;
  makerFeeBps: number;
  takerFeeBps: number;
  entrySizeUsd: number;
  targetVolumeUsd: number;
  maxLossUsd: number;
  /** Decision cadence (the production loop runs about once a second). */
  cycleMs: number;
  /** A longer gap between BBO rows is treated as a restart: an open position is unwound. */
  maxDataGapMs: number;
  tickSize: number;
  lotSize: number;
  entryCandleFilter: boolean;
  dcaEnabled: boolean;
  adverseRuleEnabled: boolean;
  /**
   * Research variant (off by default): no new entry against a move larger than `maxMoveBps`
   * over the last `lookbackMs` (no BUY after a drop, no SELL after a rise).
   */
  trendFilter: Readonly<{ lookbackMs: number; maxMoveBps: number }> | null;
  /**
   * Research variant (off by default): the entry size shrinks by referenceRangeBps / range
   * (5-minute range) above the reference, down to `minimumFraction` of the entry size.
   */
  volatilitySizing: Readonly<{ referenceRangeBps: number; minimumFraction: number }> | null;
  /**
   * Like production: the entry is the smaller of `entrySizeUsd` and the risk capacity left
   * (down to `minimumEntryUsd`) instead of being blocked when the capacity is below it.
   */
  entrySizeFromRiskCapacity: boolean;
  minimumEntryUsd: number;
}>;

export const DECIBEL_BACKTEST_DEFAULT_CONFIG_V1: decibel_backtest_config_v1 = Object.freeze({
  policy: DECIBEL_STRATEGY_POLICY_V1,
  makerFeeBps: 1.5,
  takerFeeBps: 4.5,
  entrySizeUsd: 30,
  targetVolumeUsd: 200,
  maxLossUsd: 1.5,
  cycleMs: 1_000,
  // The recorder only writes BBO changes; gaps up to a few minutes are quiet markets.
  maxDataGapMs: 300_000,
  tickSize: 0.1,
  lotSize: 0.00001,
  entryCandleFilter: true,
  dcaEnabled: true,
  adverseRuleEnabled: true,
  // Production entry trend filter since 2026-11-24; `--no-trend` turns it off.
  trendFilter: DECIBEL_STRATEGY_POLICY_V1.entry.trendFilter,
  // Production sizing since 2026-11-22; `--no-vol-size` turns it off.
  volatilitySizing: DECIBEL_STRATEGY_POLICY_V1.entry.volatilitySizing,
  entrySizeFromRiskCapacity: false,
  minimumEntryUsd: 10,
});

export type decibel_backtest_trip_v1 = Readonly<{
  side: 'LONG' | 'SHORT';
  openedAt: number;
  closedAt: number;
  entryNotionalUsd: number;
  netPnlUsd: number;
  netBps: number;
  additions: number;
  exit: 'TP' | 'BREAK_EVEN_TP' | 'RESCUE_TP' | 'MAX_LOSS' | 'DATA_GAP';
}>;

export type decibel_backtest_result_v1 = Readonly<{
  from: number | null;
  to: number | null;
  cycles: number;
  sessions: number;
  sessionsTargetReached: number;
  sessionsMaxLoss: number;
  sessionsDataGap: number;
  trips: readonly decibel_backtest_trip_v1[];
  netPnlUsd: number;
  makerVolumeUsd: number;
  takerVolumeUsd: number;
  feesUsd: number;
  maxDrawdownUsd: number;
  dcaAdditions: number;
  breakEvenSteps: number;
  rescueSteps: number;
  /** Decision cycles in which each rule kept a flat book from quoting a side. */
  entryBlocks: Readonly<Record<string, number>>;
}>;

type position_v1 = {
  direction: 1 | -1;
  base: number;
  averagePrice: number;
  openedAt: number;
  additions: number;
  tpPrice: number;
  tpStage: 'NORMAL' | 'BREAK_EVEN' | 'RESCUE';
  /** Initial entry-to-TP distance (price), the R of the R-step rule. */
  initialR: number;
  lastStepAt: number | null;
  realizedUsd: number;
  feesUsd: number;
};

/** clamp(factor x range, min, max) bps; the minimum without a range. */
export function scaleDecibelBacktestBpsV1(
  rangeBps: number | null,
  scale: Readonly<{ factor: number; minBps: number; maxBps: number }>,
): number {
  if (rangeBps === null || !Number.isFinite(rangeBps) || rangeBps < 0) return scale.minBps;
  return Math.min(scale.maxBps, Math.max(scale.minBps, scale.factor * rangeBps));
}

const roundToTick = (price: number, tick: number, mode: 'UP' | 'DOWN' | 'NEAREST') => {
  const units = price / tick;
  const ticks =
    mode === 'UP'
      ? Math.ceil(units - 1e-9)
      : mode === 'DOWN'
        ? Math.floor(units + 1e-9)
        : Math.round(units);
  return Number((ticks * tick).toPrecision(15));
};

export function runDecibelStrategyBacktestV1(
  rows: readonly decibel_backtest_bbo_v1[],
  config: decibel_backtest_config_v1 = DECIBEL_BACKTEST_DEFAULT_CONFIG_V1,
): decibel_backtest_result_v1 {
  const P = config.policy;
  const tick = config.tickSize;
  const maker = config.makerFeeBps / 10_000;
  const taker = config.takerFeeBps / 10_000;
  const trips: decibel_backtest_trip_v1[] = [];
  const entryBlocks: Record<string, number> = {};
  const block = (reason: string) => (entryBlocks[reason] = (entryBlocks[reason] ?? 0) + 1);
  const samples: Array<{ at: number; midpoint: number }> = [];
  let sampleStart = 0;
  const lookback = P.market.venueCandleLookbackMs + P.market.candleMs;

  let sessions = 0;
  let sessionsTargetReached = 0;
  let sessionsMaxLoss = 0;
  let sessionsDataGap = 0;
  let sessionVolume = 0;
  let sessionPnl = 0;
  let netPnl = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let makerVolume = 0;
  let takerVolume = 0;
  let fees = 0;
  let dcaAdditions = 0;
  let breakEvenSteps = 0;
  let rescueSteps = 0;
  let cycles = 0;

  let position: position_v1 | null = null;
  let entries: { BUY: number | null; SELL: number | null } = { BUY: null, SELL: null };
  let dcaOrder: number | null = null;
  let lastExit: { price: number; at: number } | null = null;
  let lastDecisionAt = Number.NEGATIVE_INFINITY;
  let previousAt: number | null = null;

  const startSession = () => {
    sessions += 1;
    sessionVolume = 0;
    sessionPnl = 0;
    lastExit = null;
    entries = { BUY: null, SELL: null };
    dcaOrder = null;
  };
  const book = (pnlDelta: number, notional: number, fee: number, isMaker: boolean) => {
    sessionPnl += pnlDelta - fee;
    netPnl += pnlDelta - fee;
    fees += fee;
    sessionVolume += notional;
    if (isMaker) makerVolume += notional;
    else takerVolume += notional;
    peak = Math.max(peak, netPnl);
    maxDrawdown = Math.max(maxDrawdown, peak - netPnl);
  };
  // Entry size chosen with the resting quote (volatility sizing), used when it fills.
  let restingEntrySizeUsd = config.entrySizeUsd;
  const open = (direction: 1 | -1, price: number, at: number) => {
    const base = Math.floor(restingEntrySizeUsd / price / config.lotSize) * config.lotSize;
    if (!(base > 0)) return;
    const fee = base * price * maker;
    book(0, base * price, fee, true);
    position = {
      direction,
      base,
      averagePrice: price,
      openedAt: at,
      additions: 0,
      tpPrice: initialTP(direction, price),
      tpStage: 'NORMAL',
      initialR: Math.abs(initialTP(direction, price) - price),
      lastStepAt: null,
      realizedUsd: 0,
      feesUsd: fee,
    };
    entries = { BUY: null, SELL: null };
  };
  let lastRange: number | null = null;
  const initialTP = (direction: 1 | -1, average: number) => {
    const bps = scaleDecibelBacktestBpsV1(lastRange, P.tp.targetNet) + 2 * config.makerFeeBps;
    return roundToTick(
      average * (1 + (direction * bps) / 10_000),
      tick,
      direction > 0 ? 'UP' : 'DOWN',
    );
  };
  const close = (
    pos: position_v1,
    price: number,
    at: number,
    isMaker: boolean,
    exit: decibel_backtest_trip_v1['exit'],
  ) => {
    const notional = pos.base * price;
    const gross = pos.direction * (price - pos.averagePrice) * pos.base;
    const fee = notional * (isMaker ? maker : taker);
    book(gross, notional, fee, isMaker);
    const net = gross - fee - pos.feesUsd + pos.realizedUsd;
    const entryNotional = pos.base * pos.averagePrice;
    trips.push(
      Object.freeze({
        side: pos.direction > 0 ? 'LONG' : 'SHORT',
        openedAt: pos.openedAt,
        closedAt: at,
        entryNotionalUsd: entryNotional,
        netPnlUsd: net,
        netBps: (net / entryNotional) * 10_000,
        additions: pos.additions,
        exit,
      }),
    );
    position = null;
    dcaOrder = null;
    lastExit = { price, at };
  };
  const riskCapacityUsd = () =>
    (Math.max(0, config.maxLossUsd + Math.min(0, sessionPnl)) *
      (1 - DECIBEL_CAPACITY_POLICY_V1.transactionLossReserveFraction)) /
    ((DECIBEL_CAPACITY_POLICY_V1.adverseMoveFloorBps +
      2 * DECIBEL_CAPACITY_POLICY_V1.feePerLegBps +
      DECIBEL_CAPACITY_POLICY_V1.maximumBookSlippageBps +
      DECIBEL_CAPACITY_POLICY_V1.adverseSelectionBps) /
      10_000);

  // Coarse midpoint history for the trend filter (one sample per 10 s).
  const trendSamples: Array<{ at: number; midpoint: number }> = [];
  const trendMoveBps = (now: number, midpoint: number): number | null => {
    const filter = config.trendFilter;
    if (filter === null) return null;
    while (trendSamples.length > 0 && trendSamples[0]!.at < now - filter.lookbackMs)
      trendSamples.shift();
    const reference = trendSamples[0];
    if (reference === undefined || now - reference.at < filter.lookbackMs * 0.8) return null;
    return ((midpoint - reference.midpoint) / reference.midpoint) * 10_000;
  };

  startSession();
  for (const row of rows) {
    if (!(row.bid > 0) || !(row.ask > row.bid)) continue;
    const now = row.at;
    // A data gap is a restart: production unwinds an open position at market.
    if (previousAt !== null && now - previousAt > config.maxDataGapMs) {
      const pos = position as position_v1 | null;
      if (pos !== null) {
        close(pos, pos.direction > 0 ? row.bid : row.ask, now, false, 'DATA_GAP');
        sessionsDataGap += 1;
        startSession();
      }
      entries = { BUY: null, SELL: null };
    }
    previousAt = now;
    samples.push({ at: now, midpoint: (row.bid + row.ask) / 2 });
    if (config.trendFilter !== null && (trendSamples.at(-1)?.at ?? -Infinity) <= now - 10_000)
      trendSamples.push({ at: now, midpoint: (row.bid + row.ask) / 2 });
    while (sampleStart < samples.length && samples[sampleStart]!.at < now - lookback)
      sampleStart += 1;
    if (sampleStart > 50_000) {
      samples.splice(0, sampleStart);
      sampleStart = 0;
    }

    // Fills between decisions (trade-through).
    const pos0 = position as position_v1 | null;
    if (pos0 === null) {
      if (entries.BUY !== null && row.bid < entries.BUY) open(1, entries.BUY, now);
      else if (entries.SELL !== null && row.ask > entries.SELL) open(-1, entries.SELL, now);
    } else {
      const tpHit = pos0.direction > 0 ? row.ask > pos0.tpPrice : row.bid < pos0.tpPrice;
      if (tpHit) {
        close(
          pos0,
          pos0.tpPrice,
          now,
          true,
          pos0.tpStage === 'NORMAL'
            ? 'TP'
            : pos0.tpStage === 'BREAK_EVEN'
              ? 'BREAK_EVEN_TP'
              : 'RESCUE_TP',
        );
        if (sessionVolume >= config.targetVolumeUsd) {
          sessionsTargetReached += 1;
          startSession();
        }
      } else if (
        dcaOrder !== null &&
        (pos0.direction > 0 ? row.bid < dcaOrder : row.ask > dcaOrder)
      ) {
        const add = Math.floor(config.entrySizeUsd / dcaOrder / config.lotSize) * config.lotSize;
        const fee = add * dcaOrder * maker;
        book(0, add * dcaOrder, fee, true);
        pos0.averagePrice = (pos0.averagePrice * pos0.base + dcaOrder * add) / (pos0.base + add);
        pos0.base += add;
        pos0.additions += 1;
        pos0.feesUsd += fee;
        dcaAdditions += 1;
        dcaOrder = null;
      }
    }

    // Max Loss: canonical unwind at the touch.
    const pos1 = position as position_v1 | null;
    if (pos1 !== null) {
      const exitPrice = pos1.direction > 0 ? row.bid : row.ask;
      const unrealized =
        pos1.direction * (exitPrice - pos1.averagePrice) * pos1.base -
        pos1.base * exitPrice * taker;
      if (sessionPnl + unrealized <= -config.maxLossUsd) {
        close(pos1, exitPrice, now, false, 'MAX_LOSS');
        sessionsMaxLoss += 1;
        startSession();
        continue;
      }
    }

    if (now - lastDecisionAt < config.cycleMs) continue;
    lastDecisionAt = now;
    cycles += 1;
    const window = samples.slice(sampleStart);
    const range = calculateDecibelMidpointRangeBpsV1(window, now, P.market.rangeWindowMs);
    lastRange = range;
    const candles = getDecibelClosedCandlesV1(window, now, 2);
    const paused = range !== null && range > P.entry.volatilityPauseBps;

    const pos = position as position_v1 | null;
    if (pos === null) {
      const sizing = config.volatilitySizing;
      const sizeBase = config.entrySizeFromRiskCapacity
        ? Math.min(config.entrySizeUsd, riskCapacityUsd())
        : config.entrySizeUsd;
      restingEntrySizeUsd =
        sizing === null || range === null || range <= sizing.referenceRangeBps
          ? sizeBase
          : sizeBase * Math.max(sizing.minimumFraction, sizing.referenceRangeBps / range);
      const move = trendMoveBps(now, (row.bid + row.ask) / 2);
      for (const side of ['BUY', 'SELL'] as const) {
        const against =
          move !== null &&
          config.trendFilter !== null &&
          (side === 'BUY' ? -move : move) > config.trendFilter.maxMoveBps;
        const reason = !paused
          ? against
            ? 'ENTRY_AGAINST_TREND'
            : config.entryCandleFilter
              ? getDecibelEntryCandleBlockerV1(side, candles)
              : null
          : 'ENTRY_VOLATILITY_PAUSE';
        const capacity = config.entrySizeFromRiskCapacity
          ? restingEntrySizeUsd < config.minimumEntryUsd
            ? 'RISK_BLOCKED'
            : null
          : riskCapacityUsd() < config.entrySizeUsd
            ? 'RISK_BLOCKED'
            : null;
        const blocker = reason ?? capacity;
        if (blocker !== null) {
          block(blocker);
          entries[side] = null;
          continue;
        }
        const offsetBps = scaleDecibelBacktestBpsV1(range, P.entry.quoteOffset);
        let price =
          side === 'BUY'
            ? roundToTick(row.bid * (1 - offsetBps / 10_000), tick, 'DOWN')
            : roundToTick(row.ask * (1 + offsetBps / 10_000), tick, 'UP');
        const exit = lastExit as { price: number; at: number } | null;
        if (exit !== null && now - exit.at <= P.entry.reentryExpiryMs) {
          const distance = scaleDecibelBacktestBpsV1(range, P.entry.reentryDistance);
          const limit = exit.price * (1 + ((side === 'BUY' ? -1 : 1) * distance) / 10_000);
          price =
            side === 'BUY'
              ? Math.min(price, roundToTick(limit, tick, 'DOWN'))
              : Math.max(price, roundToTick(limit, tick, 'UP'));
        }
        // Chase cap: stay near the signal candle's extreme instead of following a bounce.
        const signal = candles?.at(-1);
        if (signal !== undefined && P.entry.maxChaseBps > 0) {
          const cap =
            side === 'BUY'
              ? signal.low * (1 + P.entry.maxChaseBps / 10_000)
              : signal.high * (1 - P.entry.maxChaseBps / 10_000);
          price =
            side === 'BUY'
              ? Math.min(price, roundToTick(cap, tick, 'DOWN'))
              : Math.max(price, roundToTick(cap, tick, 'UP'));
        }
        const resting = entries[side];
        const band = scaleDecibelBacktestBpsV1(range, P.entry.replacementBand);
        if (resting === null || (Math.abs(price - resting) / price) * 10_000 > band)
          entries[side] = price;
      }
      continue;
    }

    // Adverse TP repricing: the candle rule.
    const direction = pos.direction;
    const makerPrice = direction > 0 ? row.ask : row.bid;
    const steps = P.adverse.rSteps;
    if (config.adverseRuleEnabled && steps.enabled > 0 && pos.initialR > 0) {
      // R-step rule: break-even after breakEvenMultiple x R against, then one step of
      // stepMultiple x R closer per further stepMultiple x R against. Never moves away.
      const R = pos.initialR;
      const against = -direction * (makerPrice - pos.averagePrice);
      const breakEven = roundToTick(
        pos.averagePrice *
          (1 + (direction * (2 * config.makerFeeBps - P.adverse.breakEvenToleranceBps)) / 10_000),
        tick,
        direction > 0 ? 'UP' : 'DOWN',
      );
      if (against >= steps.breakEvenMultiple * R) {
        const k = Math.floor((against - steps.breakEvenMultiple * R) / (steps.stepMultiple * R));
        const target = roundToTick(
          breakEven - direction * k * steps.stepMultiple * R,
          tick,
          direction > 0 ? 'UP' : 'DOWN',
        );
        if (direction * (pos.tpPrice - target) > tick / 2) {
          if (pos.tpStage === 'NORMAL') breakEvenSteps += 1;
          else rescueSteps += 1;
          pos.tpPrice = target;
          pos.tpStage = k === 0 ? 'BREAK_EVEN' : 'RESCUE';
          pos.lastStepAt = now;
        }
      }
    } else if (config.adverseRuleEnabled) {
      const safeBand = scaleDecibelBacktestBpsV1(range, P.adverse.safeBand);
      const outside = (price: number) =>
        (-direction * (price - pos.averagePrice) * 10_000) / pos.averagePrice >= safeBand;
      const breakEven = roundToTick(
        pos.averagePrice *
          (1 + (direction * (2 * config.makerFeeBps - P.adverse.breakEvenToleranceBps)) / 10_000),
        tick,
        direction > 0 ? 'UP' : 'DOWN',
      );
      const roomTicks = Math.round((direction * (pos.tpPrice - breakEven)) / tick);
      const candle = P.market.candleMs;
      const stale =
        roomTicks < 1 &&
        pos.lastStepAt !== null &&
        Math.floor(now / candle) - Math.floor(pos.lastStepAt / candle) >=
          P.adverse.breakEvenStaleCloses;
      if (outside(makerPrice) || stale) {
        const since = Math.max(pos.lastStepAt ?? Number.NEGATIVE_INFINITY, pos.openedAt);
        const closes = countDecibelAdverseCandleClosesV1(window, now, outside, since);
        if (closes >= P.adverse.candleCloses || stale) {
          if (roomTicks >= 1) {
            pos.tpPrice = breakEven;
            pos.tpStage = 'BREAK_EVEN';
            pos.lastStepAt = now;
            breakEvenSteps += 1;
          } else {
            const offsetTicks = Math.max(
              1,
              Math.ceil(
                (makerPrice * scaleDecibelBacktestBpsV1(range, P.adverse.rescueOffset)) /
                  10_000 /
                  tick,
              ),
            );
            const target = roundToTick(
              makerPrice + direction * offsetTicks * tick,
              tick,
              'NEAREST',
            );
            const stepTicks = Math.round((direction * (pos.tpPrice - target)) / tick);
            if (stepTicks >= offsetTicks) {
              pos.tpPrice = target;
              pos.tpStage = 'RESCUE';
              pos.lastStepAt = now;
              rescueSteps += 1;
            }
          }
        }
      }
    }

    // DCA: far enough against the average, settled momentum, room left in the risk capacity.
    if (config.dcaEnabled && dcaOrder === null && pos.additions < P.dca.maximumAdditions) {
      const adverseBps = (-direction * (makerPrice - pos.averagePrice) * 10_000) / pos.averagePrice;
      const side = direction > 0 ? 'BUY' : 'SELL';
      const room = riskCapacityUsd() - pos.base * makerPrice;
      if (
        !paused &&
        adverseBps >= P.dca.triggerBps &&
        isDecibelDCAMomentumSettledV1(side, candles) === true &&
        room >= config.entrySizeUsd * P.dca.minimumAdditionFraction
      )
        dcaOrder = direction > 0 ? row.bid : row.ask;
    }
  }

  return Object.freeze({
    from: rows[0]?.at ?? null,
    to: rows.at(-1)?.at ?? null,
    cycles,
    sessions,
    sessionsTargetReached,
    sessionsMaxLoss,
    sessionsDataGap,
    trips: Object.freeze(trips),
    netPnlUsd: netPnl,
    makerVolumeUsd: makerVolume,
    takerVolumeUsd: takerVolume,
    feesUsd: fees,
    maxDrawdownUsd: maxDrawdown,
    dcaAdditions,
    breakEvenSteps,
    rescueSteps,
    entryBlocks: Object.freeze({ ...entryBlocks }),
  });
}

/** Deep-override one policy field by a dotted path, e.g. `adverse.safeBand.maxBps`. */
export function overrideDecibelBacktestPolicyV1(
  policy: decibel_backtest_policy_v1,
  path: string,
  value: number,
): decibel_backtest_policy_v1 {
  const keys = path.split('.');
  const apply = (node: unknown, index: number): unknown => {
    if (node === null || typeof node !== 'object')
      throw new Error(`BACKTEST_POLICY_PATH_INVALID:${path}`);
    const record = node as Record<string, unknown>;
    const key = keys[index]!;
    if (!(key in record)) throw new Error(`BACKTEST_POLICY_PATH_INVALID:${path}`);
    if (index === keys.length - 1) {
      if (typeof record[key] !== 'number')
        throw new Error(`BACKTEST_POLICY_PATH_NOT_NUMBER:${path}`);
      return { ...record, [key]: value };
    }
    return { ...record, [key]: apply(record[key], index + 1) };
  };
  return apply(policy, 0) as decibel_backtest_policy_v1;
}
