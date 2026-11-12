import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import { buildDecibelExecutionIntentV1 } from '../src/decibel_execution_intent_v1.js';
import { describe, expect, it } from 'vitest';
import {
  assessDecibelDCAOpportunityV1,
  deriveDecibelDCACycleV1,
  type decibel_entry_cycle_fill_v1,
} from '../src/decibel_dca_opportunity_v1.js';
import { classifyDecibelOperationalMarketRegimeV1 } from '../src/decibel_market_regime_v1.js';

function buildFrame(
  midpoint: number,
  observedAt: number,
  positionBase: number,
  fills: readonly decibel_entry_cycle_fill_v1[],
) {
  const bestBid = midpoint - 0.01,
    bestAsk = midpoint + 0.01;
  const regime = classifyDecibelOperationalMarketRegimeV1(
    [observedAt - 1, observedAt].map((at) => ({
      at,
      midpoint,
      bestBid,
      bestAsk,
      bestBidSize: 1,
      bestAskSize: 1,
      microprice: null,
      topBookImbalance: null,
      recentTradeIntensity: null,
    })),
    positionBase,
  );
  return {
    positionBase,
    side: positionBase >= 0 ? ('BUY' as const) : ('SELL' as const),
    quantity: 0.1,
    price: positionBase >= 0 ? bestBid : bestAsk,
    now: observedAt,
    observedAt,
    maximumAgeMs: 5000,
    bestBid,
    bestAsk,
    sourceStateHash: `state-${observedAt}`,
    distinctObservationCount: 2,
    regime,
    cycle: deriveDecibelDCACycleV1(fills, positionBase),
    depth: { observedAt, bids: [{ price: bestBid, size: 1 }], asks: [{ price: bestAsk, size: 1 }] },
  };
}
describe('Authenticated adverse opportunity DCA', () => {
  it.each([1, -1])(
    'requires a new adverse opportunity for each of three additions (%s)',
    (sign) => {
      const side = sign > 0 ? ('BUY' as const) : ('SELL' as const);
      let fills: decibel_entry_cycle_fill_v1[] = [];
      let position = 0;
      for (let index = 0; index < 4; index++) {
        const midpoint = 100 - sign * index;
        const frame = {
          ...buildFrame(midpoint, 1000 + index * 10, position, fills),
          side,
          price: midpoint - sign * 0.01,
        };
        const admitted = assessDecibelDCAOpportunityV1(frame);
        expect(admitted.blocker).toBeNull();
        expect(admitted.opportunity).not.toBeNull();
        fills = [
          ...fills,
          ...[0, 1].map((part) => ({
            fillId: `${index}-${part}`,
            intentId: `intent-${index}`,
            side,
            quantity: 0.05,
            price: frame.price,
            timestamp: frame.observedAt + 1 + part,
            opportunity: admitted.opportunity!,
          })),
        ];
        position = sign * (index + 1) * 0.1;
        expect(deriveDecibelDCACycleV1(fills, position).increases).toBe(index + 1);
        const repeated = assessDecibelDCAOpportunityV1({
          ...frame,
          positionBase: position,
          cycle: deriveDecibelDCACycleV1(fills, position),
        });
        expect(repeated.blocker).not.toBeNull();
        const samePrice = assessDecibelDCAOpportunityV1({
          ...buildFrame(midpoint, frame.observedAt + 5, position, fills),
          side,
        });
        expect(samePrice.blocker).not.toBeNull();
      }
      const fifth = assessDecibelDCAOpportunityV1({
        ...buildFrame(100 - sign * 5, 2000, position, fills),
        side,
      });
      expect(fifth.blocker).toBe('DCA_THREE_ADDITIONS_REACHED');
      const recovered: decibel_entry_cycle_fill_v1[] = JSON.parse(
        JSON.stringify(fills),
      ) as decibel_entry_cycle_fill_v1[];
      expect(deriveDecibelDCACycleV1(recovered, position)).toEqual(
        deriveDecibelDCACycleV1(fills, position),
      );
      const close: decibel_entry_cycle_fill_v1 = {
        fillId: 'close',
        intentId: 'close',
        side: sign > 0 ? 'SELL' : 'BUY',
        quantity: Math.abs(position),
        price: 100,
        timestamp: 2001,
      };
      expect(deriveDecibelDCACycleV1([...recovered, close], 0)).toMatchObject({
        increases: 0,
        reference: null,
        blocker: null,
      });
    },
  );
  it.each([1, -1])(
    'groups partial fills and replacement remainder into the original opportunity (%s)',
    (sign) => {
      const side = sign > 0 ? ('BUY' as const) : ('SELL' as const);
      const initial = { ...buildFrame(100, 1000, 0, []), side, price: 100 - sign * 0.01 };
      const evidence = assessDecibelDCAOpportunityV1(initial).opportunity!;
      const fill: decibel_entry_cycle_fill_v1 = {
        fillId: 'partial',
        intentId: 'first',
        side,
        quantity: 0.05,
        price: initial.price,
        timestamp: 1001,
        opportunity: evidence,
      };
      const replacement = {
        ...buildFrame(100, 1010, sign * 0.05, [fill]),
        side,
        quantity: 0.05,
        persistedEvidence: evidence,
      };
      expect(assessDecibelDCAOpportunityV1(replacement).blocker).toBeNull();
      const replacedFill = {
        ...fill,
        fillId: 'replacement-fill',
        intentId: 'replacement',
        timestamp: 1011,
      };
      const recovered = deriveDecibelDCACycleV1([fill, replacedFill], sign * 0.1);
      expect(recovered).toMatchObject({ increases: 1, additions: 0 });
      expect(
        assessDecibelDCAOpportunityV1({
          ...buildFrame(100, 1020, sign * 0.1, [fill, replacedFill]),
          side,
          persistedEvidence: evidence,
        }).blocker,
      ).toBe('DCA_NEW_ADVERSE_OPPORTUNITY_REQUIRED');
    },
  );
  it.each([1, -1])(
    'persists filled references and market evidence across SQLite recovery (%s)',
    (sign) => {
      const side = sign > 0 ? ('BUY' as const) : ('SELL' as const);
      const frame = { ...buildFrame(100, 1000, 0, []), side, price: 100 - sign * 0.01 };
      const opportunity = assessDecibelDCAOpportunityV1(frame).opportunity!;
      const path = join(mkdtempSync(join(tmpdir(), 'dca-evidence-')), 'journal.sqlite');
      const Journal = new decibel_execution_lifecycle_journal_v1(path);
      try {
        for (let index = 0; index < 2; index++) {
          const body = buildDecibelExecutionIntentV1({
            sessionId: 'dca',
            cycleSequence: index + 1,
            action: 'PLACE',
            market: 'BTC/USD',
            side,
            price: frame.price,
            quantity: 0.05,
            tickSize: 0.01,
            lotSize: 0.01,
            clientOrderId: `test-replacement-${index}`,
            knownVenueOrderId: null,
            sourceStateHash: 'test-source',
            strategyDecisionHash: 'test-decision',
            createdAt: 1000 + index,
          });
          if (body.action !== 'PLACE') throw new Error('TEST_PLACE_REQUIRED');
          Journal.prepare({ ...body, entryOpportunity: opportunity });
          Journal.applyFill({
            fillId: `fill-${index}`,
            intentId: body.intentId,
            side,
            quantity: 0.05,
            price: frame.price,
            observedAt: 1001 + index,
            strategyLineage: true,
            makerProven: true,
            externalCounterparty: true,
          });
        }
      } finally {
        Journal.close();
      }
      const Recovered = new decibel_execution_lifecycle_journal_v1(path);
      try {
        const fills = Recovered.getSessionEntryCycleFills('dca');
        const cycle = deriveDecibelDCACycleV1(fills, sign * 0.1);
        expect(cycle.increases).toBe(1);
        expect(cycle.referencePrice).toBeCloseTo(frame.price);
        expect(cycle.reference?.opportunity).toEqual(opportunity);
        expect(
          assessDecibelDCAOpportunityV1({ ...buildFrame(100, 1010, sign * 0.1, fills), side })
            .blocker,
        ).toBe('DCA_NEW_ADVERSE_OPPORTUNITY_REQUIRED');
        expect(
          assessDecibelDCAOpportunityV1({
            ...buildFrame(100 - sign, 1010, sign * 0.1, fills),
            side,
          }).blocker,
        ).toBeNull();
      } finally {
        Recovered.close();
      }
    },
  );
  it('reports missing depth and volatility evidence without a fallback trigger', () => {
    const fill: decibel_entry_cycle_fill_v1 = {
      fillId: 'first',
      intentId: 'first',
      side: 'BUY',
      quantity: 0.1,
      price: 100,
      timestamp: 1000,
    };
    const frame = buildFrame(99, 1100, 0.1, [fill]);
    const { depth, ...missingDepth } = frame;
    expect(depth.observedAt).toBe(frame.observedAt);
    expect(assessDecibelDCAOpportunityV1(missingDepth).blocker).toBe(
      'DCA_VERIFIED_CURRENT_DEPTH_REQUIRED',
    );
    expect(assessDecibelDCAOpportunityV1({ ...frame, distinctObservationCount: 1 }).blocker).toBe(
      'DCA_VERIFIED_VOLATILITY_REGIME_REQUIRED',
    );
    expect(
      assessDecibelDCAOpportunityV1({
        ...frame,
        depth: { ...frame.depth, bids: [{ price: frame.bestBid, size: 0.01 }] },
      }).blocker,
    ).toBe('DCA_VERIFIED_LIQUIDITY_INSUFFICIENT');
    expect(assessDecibelDCAOpportunityV1({ ...frame, side: 'SELL' }).blocker).toBe(
      'DCA_SAME_DIRECTION_REQUIRED',
    );
  });
  it('uses the existing volatility and regime multiplier rather than a fixed price threshold', () => {
    const fill: decibel_entry_cycle_fill_v1 = {
      fillId: 'first',
      intentId: 'first',
      side: 'BUY',
      quantity: 0.1,
      price: 100,
      timestamp: 1000,
    };
    const frame = buildFrame(99.9, 1100, 0.1, [fill]);
    expect(assessDecibelDCAOpportunityV1(frame).blocker).toBeNull();
    const volatile = {
      ...frame,
      regime: { ...frame.regime, inputs: { ...frame.regime.inputs, realizedVolatilityBps: 100 } },
    };
    expect(assessDecibelDCAOpportunityV1(volatile).blocker).toBe(
      'DCA_NEW_ADVERSE_OPPORTUNITY_REQUIRED',
    );
  });
});
