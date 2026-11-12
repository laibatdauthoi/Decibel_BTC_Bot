import { describe, expect, it } from 'vitest';
import {
  assessDecibelEntryPhaseEconomicsV1 as assessPhase,
  assessDecibelRestingEntryEconomicsV1 as assessResting,
  assessDecibelEntryReplacementEconomicsV1 as assessReplacement,
  calculateDecibelClosestEntryPriceV1 as getClosest,
} from '../src/decibel_smart_ladder_v1.js';

const recorded = {
  side: 'BUY' as const,
  price: 75772.6,
  quantity: 0.00047,
  midpoint: 75772.6 / (1 - 1.484485 / 10000),
  makerFeeBps: 1.5,
  gasCostUsd: 0.0003657,
  safetyMarginBps: 1,
};
describe('Resting maker policy and attainable quote priority', () => {
  it('keeps PID 11816 while preserving the exact negative mark-payoff diagnostic over 10000 observations', () => {
    for (let observation = 0; observation < 10000; observation++) {
      const result = assessResting(recorded);
      expect(result.decision).toBe('KEEP');
      expect(result.conditionalNetUsd).toBeCloseTo(-0.0004201803, 7);
      expect(result.edgeBps).toBeCloseTo(1.484485, 6);
      expect(result.remainingCostBps).toBeCloseTo(1.60269, 5);
      expect(result.reason).toBe('RESTING_ENTRY_MARK_EDGE_NEGATIVE_NO_INDEPENDENT_INVALIDATION');
    }
  });
  it.each(['BUY', 'SELL'] as const)(
    'does not turn %s midpoint moves, margin or gas reserve into an independent invalidation',
    (side) => {
      for (const midpoint of [75700, 75772.6, 75800])
        for (const gasCostUsd of [0, 0.0003657, 0.1]) {
          const low = assessResting({ ...recorded, side, midpoint, gasCostUsd });
          const high = assessResting({
            ...recorded,
            side,
            midpoint,
            gasCostUsd,
            safetyMarginBps: 100,
          });
          expect(low.decision).toBe('KEEP');
          expect(high).toEqual(low);
          expect(low.expectedValueUsd).toBeNull();
          expect(low.fillProbability).toBeNull();
        }
      expect(assessResting({ ...recorded, side, makerFeeBps: null }).decision).toBe('RECONCILE');
    },
  );
  it.each(['BUY', 'SELL'] as const)(
    'replaces %s towards the closest admitted quote when best is inadmissible',
    (side) => {
      const input = {
        side,
        quantity: 1,
        midpoint: 100,
        bestBid: 99.99,
        bestAsk: 100.01,
        tickSize: 0.01,
        makerFeeBps: 2,
        gasCostUsd: 0.01,
        safetyMarginBps: 1,
      };
      const price = getClosest(input)!;
      const bestPrice = side === 'BUY' ? input.bestBid : input.bestAsk;
      expect(
        assessPhase({ ...input, phase: 'PLACE', price: bestPrice }).conditionalNetUsd,
      ).toBeLessThan(0);
      expect(
        assessPhase({ ...input, phase: 'PLACE', price }).conditionalNetUsd,
      ).toBeGreaterThanOrEqual(0);
      expect(side === 'BUY' ? price < bestPrice : price > bestPrice).toBe(true);
      const current = side === 'BUY' ? 99 : 101;
      const comparison = {
        ...input,
        restingPrice: current,
        candidatePrice: price,
        restingQuantity: 1,
        candidateQuantity: 1,
      };
      expect(assessReplacement(comparison).decision).toBe('KEEP');
      const withDepth = {
        ...comparison,
        now: 1000,
        bookObservedAt: 1000,
        maximumBookAgeMs: 5000,
        depth: {
          observedAt: 1000,
          bids: [
            { price: 99.99, size: 1 },
            { price: 99.9, size: 1 },
            { price: 99, size: 1 },
          ],
          asks: [
            { price: 100.01, size: 1 },
            { price: 100.1, size: 1 },
            { price: 101, size: 1 },
          ],
        },
      };
      expect(assessReplacement(withDepth).decision).toBe('REPLACE');
      expect(assessReplacement({ ...withDepth, now: 7000 }).decision).toBe('KEEP');
      expect(
        assessReplacement({ ...comparison, candidatePrice: side === 'BUY' ? 98 : 102 }).decision,
      ).toBe('KEEP');
      expect(assessReplacement({ ...comparison, restingPrice: price }).decision).toBe('KEEP');
      expect(assessReplacement({ ...comparison, candidatePrice: bestPrice }).decision).toBe('KEEP');
    },
  );
});
