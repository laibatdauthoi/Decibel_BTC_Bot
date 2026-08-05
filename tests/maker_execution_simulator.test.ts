import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  loadMakerSimulatorConfig,
  simulateMakerOrder,
  summarizeMakerSimulations,
  type maker_fill_assumption,
  type maker_market_metadata,
} from '../src/maker_execution_simulator.js';
import type { research_source, research_trade_classification } from '../src/research_dataset.js';
import { research_dataset_repository } from '../src/research_repository.js';
import type { research_sample } from '../src/research_types.js';

const DECISION = Date.parse('2026-01-01T00:05:00.000Z');
const metadata: maker_market_metadata = {
  marketAddress: 'btc',
  tickSize: 0.5,
  minimumSize: 0.01,
  lotSize: 0.01,
  sizeDecimals: 2,
  priceDecimals: 1,
  maximumLeverage: 2,
  metadataVersion: `sha256:${'0'.repeat(64)}`,
  observedAt: '2026-01-01T00:00:00.000Z',
};
const config = loadMakerSimulatorConfig({
  MAKER_SIMULATOR_STARTING_EQUITY: '10000',
  MAKER_SIMULATOR_RISK_PER_CANDIDATE: '0.0025',
  MAKER_SIMULATOR_LEVERAGE_CAP: '2',
});
const directories: string[] = [];

function sample(direction: 'LONG' | 'SHORT' = 'LONG'): research_sample {
  return {
    candidateId: `candidate-${direction}`,
    marketAddress: 'btc',
    featureVersion: 'feature-v1',
    candidate: {
      candidateType: 'SHORT_RANGE_BREAKOUT',
      direction,
      score: 90,
      regime: 'RANGE',
      detectedAtTime: new Date(DECISION - 300_000).toISOString(),
      availableAtTime: new Date(DECISION).toISOString(),
    },
    features: {},
    outcomes: { complete: false },
  } as research_sample;
}

function source(overrides: Partial<research_source> = {}): research_source {
  const books = [
    {
      receivedAtMs: DECISION,
      bestBid: 99,
      bestAsk: 101,
      bestBidSize: 1,
      bestAskSize: 1,
      spread: 2,
      midPrice: 100,
      microprice: 100,
      depthImbalance: 0,
    },
    {
      receivedAtMs: DECISION + 250,
      bestBid: 99,
      bestAsk: 101,
      bestBidSize: 1,
      bestAskSize: 1,
      spread: 2,
      midPrice: 100,
      microprice: 100,
      depthImbalance: 0,
    },
  ];
  return {
    marketAddress: 'btc',
    aggregates: [],
    books,
    trades: [],
    compatibleSegments: [{ startTimeMs: DECISION - 1_000, endTimeMs: DECISION + 120_000 }],
    ...overrides,
  };
}

function trade(
  economicTradeId: string,
  receivedAtMs: number,
  price: number,
  size = 0.5,
  side: 'BUY' | 'SELL' | 'UNKNOWN' = 'SELL',
): research_trade_classification {
  return {
    economicTradeId,
    receivedAtMs,
    source: side === 'UNKNOWN' ? ('UNKNOWN' as const) : ('EXPLICIT' as const),
    reason:
      side === 'UNKNOWN'
        ? ('NO_EXPLICIT_AGGRESSOR_SEMANTICS' as const)
        : ('EXPLICIT_IS_TAKER' as const),
    ambiguous: false,
    side,
    price,
    size,
  };
}

function simulate(
  testSource: research_source,
  assumption: maker_fill_assumption = 'STRICT_TRADE_THROUGH',
) {
  return simulateMakerOrder(sample(), testSource, metadata, config, assumption);
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('maker execution simulator', () => {
  it('honors placement latency and never uses an earlier trade', () => {
    const result = simulate(
      source({
        trades: [trade('before', DECISION + 249, 98), trade('after', DECISION + 250, 98)],
      }),
    );
    expect(result.activeTime).toBe('2026-01-01T00:05:00.250Z');
    expect(result.fills.map((fill) => fill.economicTradeId)).toEqual(['after']);
  });

  it('rejects an order that crosses when it becomes active without using a future book', () => {
    const result = simulate(
      source({
        books: [
          source().books[0]!,
          { ...source().books[1]!, bestAsk: 99, spread: 0, midPrice: 99 },
          { ...source().books[1]!, receivedAtMs: DECISION + 251, bestAsk: 101 },
        ],
      }),
    );
    expect(result.state).toBe('REJECTED_POST_ONLY');
    expect(result.rejectionReason).toBe('WOULD_CROSS_ACTIVE_BOOK');
  });

  it('applies tick offsets and rounds quantity down to the lot size', () => {
    const result = simulateMakerOrder(
      sample(),
      source(),
      metadata,
      { ...config, entryOffsetTicks: 2, startingEquity: 10_001 },
      'STRICT_TRADE_THROUGH',
    );
    expect(result.limitPrice).toBe(98);
    expect(result.requestedQuantity).toBe(0.5);
  });

  it('records candidates whose risk-sized quantity is below the minimum size', () => {
    const result = simulateMakerOrder(
      sample(),
      source(),
      metadata,
      { ...config, startingEquity: 10 },
      'STRICT_TRADE_THROUGH',
    );
    expect(result.state).toBe('REJECTED_TOO_SMALL');
    expect(result.rejectionReason).toBe('BELOW_MINIMUM_SIZE');
  });

  it('distinguishes strict trade-through from touch-with-flow and models partial fills', () => {
    const testSource = source({ trades: [trade('touch', DECISION + 1_000, 99, 0.2)] });
    expect(simulate(testSource, 'STRICT_TRADE_THROUGH').filledQuantity).toBe(0);
    const touch = simulate(testSource, 'TOUCH_WITH_FLOW');
    expect(touch.filledQuantity).toBe(0.2);
    expect(touch.remainingQuantity).toBe(0.3);
    expect(touch.state).toBe('CANCELLED');
  });

  it('deduplicates economic trades and excludes ambiguous and unknown direction evidence', () => {
    const duplicate = trade('same', DECISION + 1_000, 98, 0.2);
    const ambiguous = { ...trade('ambiguous', DECISION + 2_000, 98), ambiguous: true };
    const unknown = trade('unknown', DECISION + 3_000, 98, 0.5, 'UNKNOWN');
    const result = simulate(source({ trades: [duplicate, duplicate, ambiguous, unknown] }));
    expect(result.filledQuantity).toBe(0.2);
    expect(result.fills).toHaveLength(1);
  });

  it('allows fills before cancel effectiveness but forbids equal-time fills deterministically', () => {
    const beforeCancel = DECISION + 250 + 30_000 + 249;
    const atCancel = beforeCancel + 1;
    const result = simulate(
      source({
        trades: [trade('at-cancel', atCancel, 98), trade('before-cancel', beforeCancel, 98, 0.2)],
      }),
    );
    expect(result.fills.map((fill) => fill.economicTradeId)).toEqual(['before-cancel']);
    expect(result.cancelEffectiveTime).toBe(new Date(atCancel).toISOString());
  });

  it('sorts equal timestamps by stable economic trade identity', () => {
    const time = DECISION + 1_000;
    const result = simulate(
      source({ trades: [trade('z', time, 98, 0.1), trade('a', time, 98, 0.1)] }),
    );
    expect(result.fills.map((fill) => fill.economicTradeId)).toEqual(['a', 'z']);
  });

  it('calculates point-in-time markouts and adverse selection', () => {
    const result = simulate(
      source({
        trades: [trade('fill', DECISION + 1_000, 98, 0.5)],
        books: [
          ...source().books,
          {
            ...source().books[1]!,
            receivedAtMs: DECISION + 6_000,
            midPrice: 100,
            bestBid: 99,
            bestAsk: 101,
          },
        ],
      }),
    );
    expect(result.markouts['5']?.directionAdjustedReturn).toBeCloseTo(100 / 99 - 1);
    expect(result.adverseSelection).toBeCloseTo(-(100 / 99 - 1));
  });

  it('excludes observations outside compatible collector sessions', () => {
    const result = simulate(
      source({
        compatibleSegments: [{ startTimeMs: DECISION + 100, endTimeMs: DECISION + 120_000 }],
      }),
    );
    expect(result.rejectionReason).toBe('NO_DECISION_BOOK');
  });

  it('persists reruns idempotently and reports insufficient data below 100 eligible candidates', () => {
    const directory = mkdtempSync(join(tmpdir(), 'maker-simulator-'));
    directories.push(directory);
    const Repository = new research_dataset_repository(join(directory, 'research.sqlite'));
    const result = simulate(source());
    expect(Repository.saveMakerSimulations([result])).toMatchObject({ inserted: 1, total: 1 });
    Repository.close();
    const ReopenedRepository = new research_dataset_repository(join(directory, 'research.sqlite'));
    expect(ReopenedRepository.saveMakerSimulations([result])).toMatchObject({
      unchanged: 1,
      total: 1,
    });
    expect(summarizeMakerSimulations([result]).status).toBe('NOT_ENOUGH_DATA');
    ReopenedRepository.close();
  });
});
