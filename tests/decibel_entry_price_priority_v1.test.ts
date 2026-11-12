import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assessDecibelEntryReplacementEconomicsV1 as assess } from '../src/decibel_smart_ladder_v1.js';

const common = {
  side: 'BUY' as const,
  restingPrice: 99,
  candidatePrice: 100,
  restingQuantity: 1,
  candidateQuantity: 1,
  midpoint: 101,
  bestBid: 100,
  bestAsk: 102,
  tickSize: 0.1,
  makerFeeBps: 0,
  gasCostUsd: 0,
  safetyMarginBps: 0,
};
describe('ENTRY maker price priority without a replacement gas hurdle', () => {
  it('keeps a near-best maker inside the observed spread', () => {
    const result = assess({ ...common, restingPrice: 99.9, gasCostUsd: 0.2 });
    expect(result.executionImprovementUsd!).toBeLessThan(result.replacementCostUsd!);
    expect(result.decision).toBe('KEEP');
  });
  it('replaces the PID 22692 BUY prices when the candidate actually reaches best', () => {
    const input = {
      ...common,
      restingPrice: 75984.8,
      candidatePrice: 76002.7,
      bestBid: 76002.7,
      bestAsk: 76003,
      midpoint: 76002.85,
    };
    expect(assess(input).decision).toBe('REPLACE');
    for (const gasCostUsd of [null, 100])
      expect(assess({ ...input, gasCostUsd }).decision).toBe('KEEP');
    expect(assess({ ...input, bestBid: 76023.2, bestAsk: 76023.8 }).decision).toBe('KEEP');
  });
  it('keeps queue priority at best, behind best and for worse PID 40112 quotes', () => {
    expect(assess({ ...common, restingPrice: 100 }).decision).toBe('KEEP');
    expect(assess({ ...common, candidatePrice: 99.1 }).decision).toBe('KEEP');
    expect(
      assess({
        ...common,
        restingPrice: 75877.1,
        candidatePrice: 75872.9,
        midpoint: 75900,
        bestBid: 75890,
        bestAsk: 75910,
      }).decision,
    ).toBe('KEEP');
    expect(
      assess({
        ...common,
        side: 'SELL',
        restingPrice: 75910.6,
        candidatePrice: 75914,
        midpoint: 75890,
        bestBid: 75880,
        bestAsk: 75900,
      }).decision,
    ).toBe('KEEP');
  });
  it('replaces a SELL toward best and refuses crossing or nonaligned candidates', () => {
    expect(
      assess({ ...common, side: 'SELL', restingPrice: 105, candidatePrice: 102 }).decision,
    ).toBe('REPLACE');
    expect(assess({ ...common, candidatePrice: 102 }).decision).toBe('KEEP');
    expect(assess({ ...common, candidatePrice: 100.01 }).decision).toBe('KEEP');
  });
  it('replays all 184 recorded observations over 100 passes without synthetic fills', () => {
    const record = JSON.parse(
      readFileSync('tests/fixtures/entry_churn_2026_11_07_v1.json', 'utf8'),
    ) as {
      counts: { place: number; cancel: number };
      facts: Array<{
        bestBid: number;
        bestAsk: number;
        makerFeeBps: number;
        estimatedGasCostUsd: number;
        safetyMarginBps: number;
        orderDecisions: Array<{
          RESTING_PRICE: number;
          CANDIDATE_PRICE: number | null;
          ORDER_ID: string;
          ENTRY_REPLACEMENT_ECONOMICS: { decision: string } | null;
        }>;
      }>;
    };
    expect(record.counts).toEqual({ place: 10, cancel: 10 });
    let replacements = 0;
    for (let pass = 0; pass < 100; pass++) {
      let count = 0;
      for (const row of record.facts)
        for (const order of row.orderDecisions) {
          if (order.CANDIDATE_PRICE === null || !order.ENTRY_REPLACEMENT_ECONOMICS) continue;
          const side = order.CANDIDATE_PRICE < (row.bestBid + row.bestAsk) / 2 ? 'BUY' : 'SELL';
          const input = {
            ...common,
            side,
            restingPrice: order.RESTING_PRICE,
            candidatePrice: order.CANDIDATE_PRICE,
            restingQuantity: 0.00047,
            candidateQuantity: 0.00047,
            midpoint: (row.bestBid + row.bestAsk) / 2,
            bestBid: row.bestBid,
            bestAsk: row.bestAsk,
            makerFeeBps: row.makerFeeBps,
            gasCostUsd: row.estimatedGasCostUsd,
            safetyMarginBps: row.safetyMarginBps,
          };
          const result = assess(input);
          if (result.decision === 'REPLACE') {
            count++;
            expect(
              side === 'BUY'
                ? input.candidatePrice > input.restingPrice
                : input.candidatePrice < input.restingPrice,
            ).toBe(true);
            expect(result.bestMakerPrice).toBe(side === 'BUY' ? row.bestBid : row.bestAsk);
            expect(result.candidateAdmission.conditionalNetUsd).toBeGreaterThanOrEqual(0);
          }
        }
      if (pass === 0) replacements = count;
      expect(count).toBe(replacements);
    }
    // Observation-level proposals, not counterfactual venue mutations/fills.
    expect(replacements).toBe(0);
  });
});
