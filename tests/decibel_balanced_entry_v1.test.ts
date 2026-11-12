import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assessDecibelEntryReplacementEconomicsV1 as assess } from '../src/decibel_smart_ladder_v1.js';

// Constructed, admitted same-frame books; no authenticated fill/queue claims.
function makeFrame(side: 'BUY' | 'SELL', resting = 130, candidate = 125) {
  const mirror = (price: number) => (side === 'SELL' ? price : 200 - price);
  const asks = [100.1, 110, 120, 124, 126, 128, 129, 130, 140].map((price) => ({ price, size: 1 }));
  const bids = [{ price: 99.9, size: 1 }];
  return {
    side,
    restingPrice: mirror(resting),
    candidatePrice: mirror(candidate),
    restingQuantity: 1,
    candidateQuantity: 1,
    midpoint: 100,
    bestBid: 99.9,
    bestAsk: 100.1,
    tickSize: 0.1,
    makerFeeBps: 0,
    safetyMarginBps: 0,
    gasCostUsd: 0,
    now: 1000,
    bookObservedAt: 1000,
    maximumBookAgeMs: 5000,
    depth: {
      observedAt: 1000,
      bids:
        side === 'SELL' ? bids : asks.map((level) => ({ ...level, price: mirror(level.price) })),
      asks:
        side === 'SELL' ? asks : bids.map((level) => ({ ...level, price: mirror(level.price) })),
    },
  };
}

describe('Balanced ENTRY competition', () => {
  it.each(['BUY', 'SELL'] as const)(
    'keeps marginal %s progress and follows substantial moves',
    (side) => {
      const modest = assess(makeFrame(side));
      expect(modest.priceStability.outsideBand).toBe(true);
      expect(modest.priceStability.materialDisplayedPriority).toBe(true);
      expect(modest.decision).toBe('KEEP');
      expect(modest.priceStability.relativeDistanceImprovement).toBeCloseTo(5 / 29.9);
      expect(assess(makeFrame(side, 130, 115)).decision).toBe('REPLACE');
      expect(assess(makeFrame(side, 140, 105)).decision).toBe('REPLACE');
      expect(assess(makeFrame(side, 130, 129.9)).decision).toBe('KEEP');
    },
  );

  it('retains PID 40436 price progress with explicitly reconstructed depth and admission', () => {
    // Only resting/candidate/BBO ask, band and crossed aggregate came from the
    // user. Individual levels, quantity, bid and admission inputs are synthetic.
    const result = assess({
      ...makeFrame('SELL'),
      restingPrice: 75611.9,
      candidatePrice: 75593.7,
      midpoint: 75573.5,
      bestBid: 75573.4,
      bestAsk: 75573.6,
      observedPriceMovementBps: (3.8 / 75573.5) * 10000,
      depth: {
        observedAt: 1000,
        bids: [{ price: 75573.4, size: 1 }],
        asks: [
          { price: 75573.6, size: 1 },
          { price: 75592, size: 1 },
          { price: 75594, size: 3 },
          { price: 75600, size: 3 },
          { price: 75608, size: 4.9822 },
          { price: 75611.9, size: 1 },
        ],
      },
    });
    expect(result.crossedVisibleBaseQuantity).toBeCloseTo(10.9822);
    expect(result.crossedVisibleLevelCount).toBe(3);
    expect(result.priceStability.relativeDistanceImprovement).toBeCloseTo(18.2 / 38.3);
    expect(result.decision).toBe('REPLACE');
  });

  it('does not manufacture displayed priority with absent or stale depth', () => {
    const frame = makeFrame('SELL', 140, 105);
    expect(assess({ ...frame, depth: undefined }).decision).toBe('KEEP');
    expect(assess({ ...frame, depth: { ...frame.depth, observedAt: 999 } }).decision).toBe('KEEP');
    expect(assess({ ...frame, now: 6001 }).decision).toBe('KEEP');
  });

  it('checks the relative boundary without widening the market stability band', () => {
    const frame = makeFrame('SELL');
    const depth = {
      ...frame.depth,
      asks: [100.1, 119.9, 120.2, 130, 140].map((price) => ({ price, size: 1 })),
    };
    const below = assess({ ...frame, depth, candidatePrice: 120.1 });
    const above = assess({ ...frame, depth, candidatePrice: 120 });
    expect(below.priceStability.bandPrice).toBe(above.priceStability.bandPrice);
    expect(below.priceStability.outsideBand).toBe(true);
    expect(below.priceStability.materialDisplayedPriority).toBe(true);
    expect(below.decision).toBe('KEEP');
    expect(above.decision).toBe('REPLACE');
  });

  it('allows a substantial arrival at best maker despite a wide movement band', () => {
    const frame = makeFrame('SELL', 130, 100.1);
    const review = assess({ ...frame, observedPriceMovementBps: 4000 });
    expect(review.priceStability.outsideBand).toBe(false);
    expect(review.decision).toBe('REPLACE');
    expect(review.reason).toBe('ENTRY_REPLACEMENT_MAKER_PRIORITY_IMPROVED');
    expect(assess({ ...frame, restingPrice: 100.2 }).decision).toBe('KEEP');
  });

  it.each(['BUY', 'SELL'] as const)(
    'can bypass the %s distance fraction by passing most observed liquidity ahead',
    (side) => {
      const frame = makeFrame(side);
      const levels = side === 'SELL' ? 'asks' : 'bids';
      const result = assess({
        ...frame,
        depth: {
          ...frame.depth,
          [levels]: frame.depth[levels].map((level) => ({
            ...level,
            size: (
              side === 'SELL'
                ? level.price > 125 && level.price < 130
                : level.price > 70 && level.price < 75
            )
              ? 10
              : 1,
          })),
        },
      });
      expect(result.priceStability.relativeDistanceImprovement).toBeLessThan(1 / 3);
      expect(result.priceStability.displayedPriorityFraction).toBeGreaterThan(1 / 2);
      expect(result.decision).toBe('REPLACE');
    },
  );

  it('compares the same constructed timeline with the preceding predicate', () => {
    const metrics = [];
    for (const side of ['BUY', 'SELL'] as const) {
      for (const policy of ['before', 'after'] as const) {
        let resting = 130,
          replaces = 0,
          unclear = 0,
          missedMeaningfulReplacements = 0,
          distanceSeconds = 0;
        const decisions = [];
        // Fixed 20s review spacing and 2s replacement absence are synthetic.
        for (const candidate of [125, 124, 125, 114, 113, 103]) {
          const review = assess(makeFrame(side, resting, candidate));
          const previousReplace =
            review.priceStability.outsideBand &&
            review.priceStability.materialDisplayedPriority &&
            review.candidateAdmission.conditionalNetUsd !== null &&
            review.candidateAdmission.conditionalNetUsd >= 0;
          const replace = policy === 'before' ? previousReplace : review.decision === 'REPLACE';
          if ((candidate === 114 || candidate === 103) && !replace) missedMeaningfulReplacements++;
          if (replace) {
            replaces++;
            if (!review.priceStability.meaningfulCompetitiveProgress) unclear++;
            resting = candidate;
          }
          distanceSeconds += (resting - 100.1) * (replace ? 18 : 20);
          decisions.push(replace ? 'REPLACE' : 'KEEP');
        }
        metrics.push({
          side,
          policy,
          decisions,
          cancels: replaces,
          places: replaces,
          verifiedPriorityReplacements: replaces,
          limitedProgressReplacements: unclear,
          entryOnBookMs: 120000 - replaces * 2000,
          entryAbsentMs: replaces * 2000,
          meanDistanceWhileOnBook: distanceSeconds / (120 - replaces * 2),
          missedMeaningfulReplacements,
        });
      }
    }
    for (const side of ['BUY', 'SELL'] as const) {
      const before = metrics.find((row) => row.side === side && row.policy === 'before')!;
      const after = metrics.find((row) => row.side === side && row.policy === 'after')!;
      expect(after.cancels).toBeLessThan(before.cancels);
      expect(after.decisions[3]).toBe('REPLACE');
      expect(after.decisions[5]).toBe('REPLACE');
      expect(after.missedMeaningfulReplacements).toBe(0);
      expect(after.meanDistanceWhileOnBook).toBeLessThan(before.meanDistanceWhileOnBook * 1.25);
    }
    writeFileSync(
      '.tmp_balanced_entry_metrics.log',
      JSON.stringify(
        {
          provenance:
            'Synthetic timeline, no fills; before is the preceding predicate on these valid admitted frames',
          metrics,
        },
        null,
        2,
      ),
    );
  });

  it('measures small PID 24216 gap progress without inventing unavailable historical depth', () => {
    const record = JSON.parse(
      readFileSync('tests/fixtures/entry_stability_24216_v1.json', 'utf8'),
    ) as {
      actualCancels: Array<{
        side: 'BUY' | 'SELL';
        restingPrice: number;
        candidatePrice: number;
        book: { bestBid: number; bestAsk: number };
      }>;
    };
    for (const row of record.actualCancels) {
      const best = row.side === 'SELL' ? row.book.bestAsk : row.book.bestBid;
      const gap = Math.abs(row.restingPrice - best);
      const improvement =
        row.side === 'SELL'
          ? row.restingPrice - row.candidatePrice
          : row.candidatePrice - row.restingPrice;
      expect(improvement / gap).toBeLessThan(1 / 3);
    }
  });
});
