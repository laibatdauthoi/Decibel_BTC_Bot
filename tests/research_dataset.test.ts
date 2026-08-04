import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { BTC_candlestick } from '../src/decibel_client.js';
import type { opportunity_candidate } from '../src/opportunity_scanner.js';
import {
  buildForwardOutcomes,
  buildMicrostructureFeatureWindow,
  buildResearchSamples,
  type research_source,
} from '../src/research_dataset.js';
import { research_dataset_repository } from '../src/research_repository.js';

const DECISION = Date.parse('2026-01-01T01:00:00.000Z');
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function candidate(direction: 'LONG' | 'SHORT' = 'LONG'): opportunity_candidate {
  return {
    candidateType: 'SHORT_RANGE_BREAKOUT',
    direction,
    score: 90,
    regime: 'TREND_UP',
    detectedAtTime: new Date(DECISION - 300_000),
    availableAtTime: new Date(DECISION),
    volatilityRatio: 1.2,
    volumeRatio: 1.5,
    reasons: ['test'],
  };
}
function source(seconds = 15): research_source {
  const start = DECISION - seconds * 1_000;
  return {
    marketAddress: 'btc',
    compatibleSegments: [{ startTimeMs: start, endTimeMs: DECISION + 1 }],
    aggregates: Array.from({ length: seconds }, (_, index) => ({
      timestampMs: start + index * 1_000,
      buyVolume: 1,
      sellVolume: 0.5,
      unknownVolume: 0.25,
      tradeCount: 2,
      vwap: 100,
      spread: 1,
      depthImbalance: 0.2,
      orderFlowImbalance: 0.3,
      bookAgeMs: 100,
      marketPriceAgeMs: 100,
      midPrice: 100,
    })),
    books: [
      {
        receivedAtMs: start,
        bestBid: 99,
        bestAsk: 101,
        bestBidSize: 2,
        bestAskSize: 1,
        spread: 2,
        midPrice: 100,
        microprice: 100.2,
        depthImbalance: 0.2,
      },
      {
        receivedAtMs: DECISION,
        bestBid: 100,
        bestAsk: 102,
        bestBidSize: 3,
        bestAskSize: 2,
        spread: 2,
        midPrice: 101,
        microprice: 101.1,
        depthImbalance: 0.3,
      },
    ],
    trades: [
      {
        economicTradeId: 'explicit',
        receivedAtMs: DECISION - 500,
        source: 'EXPLICIT',
        reason: 'EXPLICIT_IS_TAKER',
        ambiguous: false,
        side: 'BUY',
        price: 100,
        size: 1,
      },
      {
        economicTradeId: 'estimated',
        receivedAtMs: DECISION - 400,
        source: 'ESTIMATED_QUOTE_TEST',
        reason: 'QUOTE_TEST_AT_ASK',
        ambiguous: false,
        side: 'SELL',
        price: 100,
        size: 1,
      },
      {
        economicTradeId: 'ambiguous',
        receivedAtMs: DECISION - 300,
        source: 'EXPLICIT',
        reason: 'AMBIGUOUS_ECONOMIC_FIELDS',
        ambiguous: true,
        side: 'UNKNOWN',
        price: 100,
        size: 1,
      },
    ],
  };
}
function candles(count = 14): BTC_candlestick[] {
  return Array.from({ length: count }, (_, index) => {
    const timestamp = DECISION - 300_000 + index * 300_000;
    const close = 100 + index;
    return {
      timestamp: new Date(timestamp),
      open: close - 0.5,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1,
    };
  });
}

describe('research feature windows', () => {
  it('uses aggregates completed at the decision boundary and rejects future observations', () => {
    const input = source();
    input.aggregates.push({ ...input.aggregates[0]!, timestampMs: DECISION, buyVolume: 999 });
    input.books.push({ ...input.books[0]!, receivedAtMs: DECISION + 1, bestBidSize: 999 });
    const feature = buildMicrostructureFeatureWindow(DECISION, 15, input);
    expect(feature.aggregateCoverageRatio).toBe(1);
    expect(feature.estimatedBuyVolume).toBe(15);
    expect(feature.depth.meanBid).toBe(2.5);
    expect(feature.status).toBe('VALID');
  });

  it('distinguishes genuine zero trades from missing seconds', () => {
    const zero = source();
    zero.aggregates = zero.aggregates.map((row) => ({
      ...row,
      buyVolume: 0,
      sellVolume: 0,
      unknownVolume: 0,
      tradeCount: 0,
      vwap: null,
    }));
    const valid = buildMicrostructureFeatureWindow(DECISION, 15, zero);
    expect(valid).toMatchObject({
      status: 'VALID',
      tradeCount: 0,
      estimatedBuyVolume: 0,
      estimatedSellVolume: 0,
      unknownVolume: 0,
      vwap: null,
    });
    zero.aggregates = zero.aggregates.slice(0, 5);
    expect(buildMicrostructureFeatureWindow(DECISION, 15, zero)).toMatchObject({
      status: 'INVALID',
      aggregateCoverageRatio: 1 / 3,
    });
  });

  it('invalidates stale features and excludes ambiguous directions', () => {
    const input = source();
    input.aggregates = input.aggregates.map((row, index) =>
      index < 3 ? { ...row, spread: null, midPrice: null } : row,
    );
    const feature = buildMicrostructureFeatureWindow(DECISION, 15, input);
    expect(feature.status).toBe('INVALID');
    expect(feature.invalidReasons).toEqual(
      expect.arrayContaining(['STALE_OR_MISSING_BOOK', 'STALE_OR_MISSING_MARKET_PRICE']),
    );
    expect(feature.directionCounts).toEqual({ EXPLICIT: 1, ESTIMATED_QUOTE_TEST: 1, UNKNOWN: 1 });
  });

  it('excludes observations outside compatible v5 session segments', () => {
    const input = source();
    input.compatibleSegments = [{ startTimeMs: DECISION - 5_000, endTimeMs: DECISION }];
    expect(buildMicrostructureFeatureWindow(DECISION, 15, input)).toMatchObject({
      status: 'INVALID',
      aggregateCoverageRatio: 1 / 3,
    });
  });
});

describe('research forward outcomes', () => {
  it('calculates exact forward returns and excursions without claiming fills', () => {
    const outcome = buildForwardOutcomes(candidate(), candles(), DECISION + 60 * 60_000);
    expect(outcome.points.map((point) => point?.price)).toEqual([101, 103, 106, 112]);
    expect(outcome.points[0]?.return).toBeCloseTo(0.01);
    expect(outcome.maximumFavorableExcursion).toBeCloseTo(0.14);
    expect(outcome.maximumAdverseExcursion).toBeCloseTo(-0.01);
    expect(outcome.complete).toBe(true);
  });

  it('returns null when future candles are unavailable or unfinished', () => {
    const outcome = buildForwardOutcomes(candidate('SHORT'), candles(), DECISION + 10 * 60_000);
    expect(outcome.points[0]).not.toBeNull();
    expect(outcome.points[1]).toBeNull();
    expect(outcome.maximumFavorableExcursion).toBeNull();
    expect(outcome.complete).toBe(false);
  });
});

describe('research persistence', () => {
  it('rebuilds idempotently without duplicate samples', () => {
    const directory = mkdtempSync(join(tmpdir(), 'research-dataset-'));
    directories.push(directory);
    const Repository = new research_dataset_repository(join(directory, 'research.sqlite'));
    const samples = buildResearchSamples(
      [candidate()],
      candles(),
      source(300),
      DECISION + 60 * 60_000,
    );
    expect(Repository.save(samples)).toMatchObject({
      inserted: 1,
      updated: 0,
      unchanged: 0,
      total: 1,
    });
    expect(Repository.save(samples)).toMatchObject({
      inserted: 0,
      updated: 0,
      unchanged: 1,
      total: 1,
    });
    Repository.close();
  });
});
