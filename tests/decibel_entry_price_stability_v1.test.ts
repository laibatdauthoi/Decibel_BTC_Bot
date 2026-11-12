import { describe, expect, it } from 'vitest';
import { assessDecibelEntryReplacementEconomicsV1 as assess } from '../src/decibel_smart_ladder_v1.js';

const common = {
  side: 'SELL' as const,
  restingPrice: 100.12,
  candidatePrice: 100.1,
  restingQuantity: 1,
  candidateQuantity: 1,
  midpoint: 100,
  bestBid: 99.99,
  bestAsk: 100.01,
  tickSize: 0.01,
  makerFeeBps: 2,
  safetyMarginBps: 1,
  gasCostUsd: (100.095 * (1 - 3 / 10000) - 100) / 2,
  now: 1000,
  bookObservedAt: 1000,
  maximumBookAgeMs: 5000,
  observedPriceMovementBps: 0.001,
};
const frame = {
  observedAt: 1000,
  bids: [{ price: 99.99, size: 1 }],
  asks: [
    { price: 100.01, size: 1 },
    { price: 100.11, size: 0.00001 },
    { price: 100.12, size: 1 },
    { price: 100.2, size: 1 },
    { price: 101, size: 1 },
  ],
};
describe('Market-based ENTRY price stability', () => {
  it('keeps an admitted boundary quote even though it crosses a displayed dust level', () => {
    const review = assess({ ...common, depth: frame });
    expect(review.candidateAdmission.conditionalNetUsd).toBeGreaterThanOrEqual(0);
    expect(review.closestAdmissiblePrice).toBe(100.1);
    expect(review.crossedVisibleLevelCount).toBe(1);
    expect(review.crossedVisibleBaseQuantity).toBe(0.00001);
    expect(review.decision).toBe('KEEP');
    expect(review.priceStability.bandPrice).toBeCloseTo(0.19, 10);
    expect(review.workingPrice).toBe(common.restingPrice);
  });
  it('does not let a small level appearing/disappearing create a different stability region', () => {
    const before = assess({ ...common, depth: frame });
    const after = assess({
      ...common,
      depth: { ...frame, asks: frame.asks.filter((level) => level.price !== 100.11) },
    });
    expect(after.priceStability.bandPrice).toBe(before.priceStability.bandPrice);
    expect(after.decision).toBe('KEEP');
  });
  it.each(['BUY', 'SELL'] as const)(
    'follows a materially displaced %s maker without a time or gas hurdle',
    (side) => {
      const mirror = (price: number) => (side === 'SELL' ? price : 200 - price);
      const depth =
        side === 'SELL'
          ? frame
          : {
              observedAt: 1000,
              bids: frame.asks.map((level) => ({ ...level, price: mirror(level.price) })),
              asks: frame.bids.map((level) => ({ ...level, price: mirror(level.price) })),
            };
      const row = {
        ...common,
        side,
        depth,
        restingPrice: mirror(101),
        candidatePrice: mirror(common.candidatePrice),
      };
      const result = assess(row);
      expect(result.decision).toBe('REPLACE');
      expect(result.priceStability.outsideBand).toBe(true);
      expect(result.priceStability.materialDisplayedPriority).toBe(true);
      expect(result.crossedVisibleBaseQuantity).toBeGreaterThanOrEqual(1);
      // The decision uses the observed book, not the lifetime of the resting order.
      expect(result.workingPrice).toBe(row.candidatePrice);
    },
  );
  it('uses observed movement to widen the band, without changing the admission equation', () => {
    const normal = assess({ ...common, restingPrice: 101, depth: frame });
    const volatile = assess({
      ...common,
      restingPrice: 101,
      depth: frame,
      observedPriceMovementBps: 100,
    });
    expect(normal.decision).toBe('REPLACE');
    expect(volatile.decision).toBe('KEEP');
    expect(volatile.candidateAdmission).toEqual(normal.candidateAdmission);
    expect(volatile.priceStability.bandPrice).toBe(1);
    expect(
      assess({ ...common, restingPrice: 103, depth: frame, observedPriceMovementBps: 100 })
        .decision,
    ).toBe('REPLACE');
  });
  it('does not infer a liquidity cell outside the observed depth coverage', () => {
    const result = assess({
      ...common,
      restingPrice: 101,
      depth: { ...frame, asks: frame.asks.filter((level) => level.price < 100.1) },
    });
    expect(result.priceStability.liquidityCellPrice).toBeNull();
    expect(result.decision).toBe('KEEP');
  });
  it('aggregates small displayed levels into an executable-size block instead of discarding them individually', () => {
    const asks = [
      frame.asks[0]!,
      { price: 100.15, size: 0.4 },
      { price: 100.16, size: 0.3 },
      { price: 100.17, size: 0.3 },
      { price: 102, size: 1 },
    ];
    const result = assess({ ...common, restingPrice: 101, depth: { ...frame, asks } });
    expect(result.crossedVisibleBaseQuantity).toBe(1);
    expect(result.priceStability.materialDisplayedPriority).toBe(true);
    expect(result.decision).toBe('REPLACE');
  });
  it('can replace when measurable priority improvement is smaller than transaction gas accounting', () => {
    const result = assess({
      ...common,
      side: 'BUY',
      midpoint: 100,
      restingPrice: 99,
      candidatePrice: 99.36,
      makerFeeBps: 0,
      safetyMarginBps: 0,
      gasCostUsd: 0.3199,
      depth: {
        observedAt: 1000,
        bids: [
          { price: 99.99, size: 1 },
          { price: 99.5, size: 1 },
          { price: 99.2, size: 1 },
          { price: 98.9, size: 1 },
        ],
        asks: [{ price: 100.01, size: 1 }],
      },
    });
    expect(result.executionImprovementUsd!).toBeLessThan(result.replacementCostUsd!);
    expect(result.candidateAdmission.conditionalNetUsd).toBeGreaterThanOrEqual(0);
    expect(result.decision).toBe('REPLACE');
  });
});
