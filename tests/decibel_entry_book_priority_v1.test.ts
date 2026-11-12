import { describe, expect, it } from 'vitest';
import { assessDecibelEntryReplacementEconomicsV1 as assess } from '../src/decibel_smart_ladder_v1.js';

const sell = {
  side: 'SELL' as const,
  restingPrice: 101,
  candidatePrice: 100.1,
  restingQuantity: 1,
  candidateQuantity: 1,
  midpoint: 100,
  bestBid: 99.99,
  bestAsk: 100.01,
  tickSize: 0.01,
  makerFeeBps: 2,
  gasCostUsd: 0.01,
  safetyMarginBps: 1,
  now: 1000,
  bookObservedAt: 1000,
  maximumBookAgeMs: 5000,
};
const depth = {
  observedAt: 1000,
  bids: [{ price: 99.99, size: 1 }],
  asks: [
    { price: 100.01, size: 1 },
    { price: 100.5, size: 1 },
    { price: 101, size: 1 },
  ],
};
describe('Verified maker price-level priority', () => {
  it('requires more than an admission-boundary price change', () => {
    expect(assess(sell).decision).toBe('KEEP');
    const result = assess({ ...sell, depth });
    expect(result.decision).toBe('REPLACE');
    expect(result.priorityEvidence).toBe('VISIBLE_PRICE_LEVELS_PASSED');
    expect(result.crossedVisibleLevelCount).toBe(1);
    expect(result.crossedVisibleBaseQuantity).toBe(1);
    expect(result.expectedValueUsd).toBeNull();
    expect(result.fillProbability).toBeNull();
  });
  it('excludes the resting/own level and the level merely joined by the candidate', () => {
    expect(assess({ ...sell, candidatePrice: 100.5, depth }).decision).toBe('KEEP');
    expect(
      assess({
        ...sell,
        candidatePrice: 100.99,
        depth: { ...depth, asks: [depth.asks[0]!, depth.asks[2]!] },
      }).decision,
    ).toBe('KEEP');
    // Equal tick indices cannot create price priority through floating point.
    expect(
      assess({ ...sell, restingPrice: 101 - 1e-11, candidatePrice: 101, depth }).decision,
    ).toBe('KEEP');
  });
  it('rejects stale, re-aged, future, inconsistent, unordered and malformed depth', () => {
    const invalid = [
      { ...depth, observedAt: 999 },
      { ...depth, observedAt: 1001 },
      { ...depth, asks: [...depth.asks].reverse() },
      { ...depth, asks: [depth.asks[0]!, depth.asks[1]!, depth.asks[1]!] },
      { ...depth, asks: [{ price: 100.02, size: 1 }, depth.asks[1]!] },
      { ...depth, asks: [depth.asks[0]!, { price: 100.5, size: 0 }] },
      { ...depth, asks: [depth.asks[0]!, { price: 100.505, size: 1 }] },
      { ...depth, asks: [depth.asks[0]!, { price: 100.5, size: Number.NaN }] },
    ];
    for (const frame of invalid) expect(assess({ ...sell, depth: frame }).decision).toBe('KEEP');
    expect(assess({ ...sell, depth, now: 6001 }).decision).toBe('KEEP');
    expect(
      assess({
        ...sell,
        candidatePrice: sell.bestAsk,
        makerFeeBps: 0,
        gasCostUsd: 0,
        safetyMarginBps: 0,
        now: 6001,
      }).decision,
    ).toBe('KEEP');
  });
  it('retains maker admission and refuses worse quotes even with visible levels', () => {
    expect(assess({ ...sell, depth, makerFeeBps: 1000 }).decision).toBe('KEEP');
    expect(assess({ ...sell, depth, candidatePrice: 102 }).decision).toBe('KEEP');
    expect(assess({ ...sell, depth, candidatePrice: 99.99 }).decision).toBe('KEEP');
  });
});
