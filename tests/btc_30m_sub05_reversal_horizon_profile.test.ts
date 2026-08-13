import { describe, expect, it } from 'vitest';
import {
  buildSub05ReversalHorizonProfileReport,
  classifySub05ReversalHorizonProfile,
  createSub05ReversalHorizonEvent,
  summarizeHorizon,
  type horizon_key,
} from '../src/btc_30m_sub05_reversal_horizon_profile.js';
import { createSub05ReversalEvent } from '../src/btc_30m_sub05_move_reversal_rr3.js';
import { aggregateExact30M } from '../src/btc_30m_failed_auction_sweep_reclaim.js';
import type { price_candle } from '../src/btc_bybit_decibel_overlap_audit.js';

const minute = 60_000,
  day = 86_400_000;
const bar = (open: number, close: number, timestamp = 0): price_candle[] =>
    Array.from({ length: 30 }, (_, i) => ({
      timestamp: timestamp + i * minute,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close: i === 29 ? close : open,
    })),
  path = (count: number, timestamp: number, price: number): price_candle[] =>
    Array.from({ length: count }, (_, i) => ({
      timestamp: timestamp + i * minute,
      open: price,
      high: price + i / 10_000,
      low: price - i / 20_000,
      close: price + i / 100_000,
    }));

describe('BTC 30m sub05 reversal horizon profile', () => {
  it('uses the predecessor signal exactly and excludes zero and >=0.005', () => {
    const next = aggregateExact30M(bar(100, 100, 30 * minute)).bars[0]!,
      rows = [...bar(100, 100.1), ...path(270, 30 * minute, 100)];
    for (const close of [100, 100.499, 100.5, 100.6]) {
      const trigger = aggregateExact30M(bar(100, close)).bars[0]!;
      expect(createSub05ReversalHorizonEvent(trigger, next, rows).length).toBe(
        createSub05ReversalEvent(trigger, next, rows).length,
      );
    }
  });

  it('maps bullish to SHORT and bearish to LONG after close at next open', () => {
    const next = aggregateExact30M(bar(101, 101, 30 * minute)).bars[0]!,
      bullish = aggregateExact30M(bar(100, 100.1)).bars[0]!,
      bearish = aggregateExact30M(bar(100, 99.9)).bars[0]!;
    expect(
      createSub05ReversalHorizonEvent(bullish, next, [
        ...bullish.minutes,
        ...path(270, 30 * minute, 101),
      ])[0],
    ).toMatchObject({
      direction: 'SHORT',
      signalKnownAt: 30 * minute,
      entryTimestamp: 30 * minute,
      entryPrice: 101,
    });
    expect(
      createSub05ReversalHorizonEvent(bearish, next, [
        ...bearish.minutes,
        ...path(270, 30 * minute, 101),
      ])[0]!.direction,
    ).toBe('LONG');
  });

  it('uses exact horizon closes and computes LONG/SHORT directional PnL', () => {
    const trigger = aggregateExact30M(bar(100, 100.1)).bars[0]!,
      next = aggregateExact30M(bar(100, 100, 30 * minute)).bars[0]!,
      rows = [...trigger.minutes, ...path(270, 30 * minute, 100)];
    for (const [offset, close] of [
      [29, 100.03],
      [59, 100.06],
      [119, 100.12],
      [239, 100.24],
    ] as const)
      rows[30 + offset] = { ...rows[30 + offset]!, close };
    const event = createSub05ReversalHorizonEvent(trigger, next, rows)[0]!;
    expect(event.horizons.H30.directionalPnlUsd).toBeCloseTo(-0.03);
    expect(event.horizons.H60.directionalPnlUsd).toBeCloseTo(-0.06);
    expect(event.horizons.H120.directionalPnlUsd).toBeCloseTo(-0.12);
    expect(event.horizons.H240.directionalPnlUsd).toBeCloseTo(-0.24);
  });

  it('computes directional MFE/MAE and retains shorter horizons when later path is missing', () => {
    const trigger = aggregateExact30M(bar(100, 99.9)).bars[0]!,
      next = aggregateExact30M(bar(100, 100, 30 * minute)).bars[0]!,
      rows = [...trigger.minutes, ...path(100, 30 * minute, 100)],
      event = createSub05ReversalHorizonEvent(trigger, next, rows)[0]!;
    expect(event.horizons.H30).toMatchObject({ valid: true });
    expect(event.horizons.H60).toMatchObject({ valid: true });
    expect(event.horizons.H120).toMatchObject({ valid: false });
    expect(event.horizons.H240).toMatchObject({ valid: false });
    expect(event.horizons.H30.mfeUsd).toBeCloseTo(100 * ((100 + 29 / 10_000) / 100 - 1));
    expect(event.horizons.H30.maeUsd).toBeCloseTo(100 * (1 - (100 - 29 / 20_000) / 100));
  });

  it('summarizes horizons, direction descriptively, and classifies the same positive horizon', () => {
    const makeSummary = (mean: number, pf: number) => ({
        ...summarizeHorizon([], 30, 0, day),
        meanDirectionalPnlUsd: mean,
        grossProfitFactor: pf,
      }),
      failing = makeSummary(-0.01, 0.9),
      passing = makeSummary(0.01, 1.1),
      discovery = Object.fromEntries(
        (['H30', 'H60', 'H120', 'H240'] as horizon_key[]).map((key) => [
          key,
          key === 'H60' ? passing : failing,
        ]),
      ) as Record<horizon_key, typeof passing>,
      holdout = { ...discovery };
    expect(classifySub05ReversalHorizonProfile(5, 5, discovery, holdout)).toContain('EDGE_PRESENT');
    expect(classifySub05ReversalHorizonProfile(4.99, 5, discovery, holdout)).toContain(
      'NO_STABLE_EDGE',
    );
    holdout.H60 = failing;
    expect(classifySub05ReversalHorizonProfile(5, 5, discovery, holdout)).toContain(
      'NO_STABLE_EDGE',
    );
  });

  it('reuses frozen split, excludes overlap, and contains no execution model', () => {
    const report = buildSub05ReversalHorizonProfileReport({
      candles: bar(100, 100.1),
      externalValidationStartTimestamp: 30 * minute,
    });
    expect(report.dataRange.discoveryFraction).toBe(0.7);
    expect(report.dataRange.splitDefinition).toContain('SUB05_MOVE_REVERSAL_RR3_V1');
    expect(report.externalValidationBoundary).toMatchObject({ evaluated: false });
    expect(report.frequencyDefinition.rawSignalsAreCompletedTrades).toBe(false);
    expect(report).toMatchObject({
      executionModel: null,
      takeProfit: null,
      stopLoss: null,
      fees: null,
    });
  });
});
