import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateDecibelProductionEconomicEvidenceV1 } from '../src/decibel_production_live_state_source_v1.js';
import { readDecibelProductionEconomicComponentStatesV1 } from '../src/decibel_production_economic_refresh_v1.js';
import { decibel_runtime_supervisor_v1 } from '../src/decibel_runtime_supervisor_v1.js';
import {
  assessDecibelEntryPhaseEconomicsV1,
  assessDecibelRestingEntryEconomicsV1,
} from '../src/decibel_smart_ladder_v1.js';

describe('Recorded ENTRY phase boundary', () => {
  it.each(['MISSING', 'STALE', 'INVALID', 'FUTURE'])(
    'publishes fresh execution costs when optional adverse evidence is %s',
    (condition) => {
      const now = 10000000;
      const document = {
        observedAt: now,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES' as const,
        conservativeGasCostUsd: 0.00036,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95' as const,
        aptUsd: 4,
        aptUsdSource: 'TEST_ORACLE',
        ...(condition === 'MISSING'
          ? {}
          : {
              adverseSelectionBufferBps: condition === 'INVALID' ? -1 : 100,
              adverseSelectionObservedAt: condition === 'FUTURE' ? now + 1 : now - 3600001,
              adverseSelectionSource: 'GLOBAL_FALLBACK',
              adverseSelectionRegime: 'GLOBAL',
              adverseSelectionRawSampleCount: 30,
              adverseSelectionEffectiveSampleCount: 30,
              adverseSelectionRepresentative: true,
            }),
      };
      const validated = validateDecibelProductionEconomicEvidenceV1(
        'unused',
        now,
        3600000,
        document,
      );
      expect(validated.reason).toBeNull();
      expect(validated.evidence?.makerFeeBps).toBe(1.5);
      expect(validated.evidence?.adverseSelectionSource).toBeUndefined();
      const components = readDecibelProductionEconomicComponentStatesV1({}, now, document);
      expect(components.filter((c) => c.required).every((c) => c.status === 'READY')).toBe(true);
      const Supervisor = new decibel_runtime_supervisor_v1();
      Supervisor.setEconomicSnapshot({
        observedAt: now,
        makerFeeBps: document.makerFeeBps,
        makerFeeSource: document.makerFeeSource,
        estimatedGasCostUsd: document.conservativeGasCostUsd,
        estimatedGasCostSource: document.gasCostSource,
        aptUsd: document.aptUsd,
        aptUsdSource: document.aptUsdSource,
        adverseSelectionBufferBps: null,
        adverseSelectionSource: 'UNKNOWN',
        safetyMarginBps: 1,
        lifecycleCostBudgetBps: 11.25,
        lifecycleCostEntryBps: 11.035,
        candidateAdverseSelection: [],
      });
      expect(Supervisor.getEconomicSnapshot()).not.toBeNull();
      expect(
        validateDecibelProductionEconomicEvidenceV1('unused', now, 3600000, {
          ...document,
          makerFeeBps: null,
        }).evidence,
      ).toBeNull();
      expect(
        validateDecibelProductionEconomicEvidenceV1('unused', now, 3600000, {
          ...document,
          conservativeGasCostUsd: null,
        }).evidence,
      ).toBeNull();
    },
  );
  it.each(['BUY', 'SELL'] as const)('excludes all adverse estimates from %s ENTRY', (side) => {
    const input = {
      side,
      price: 100,
      quantity: 1,
      midpoint: side === 'BUY' ? 100.08 : 99.92,
      makerFeeBps: 1.5,
      gasCostUsd: 0.01,
      safetyMarginBps: 1,
    };
    const baseline = assessDecibelEntryPhaseEconomicsV1({ ...input, phase: 'PLACE' });
    expect(baseline.costBps).toBe(4.5);
    expect(baseline.adverseSelectionApplied).toBe(false);
    expect(baseline.expectedValueUsd).toBeNull();
    for (const adverseSelectionBps of [null, 0, 4, 100, Number.NaN]) {
      const diagnostic = { ...input, adverseSelectionBps };
      expect(assessDecibelEntryPhaseEconomicsV1({ ...diagnostic, phase: 'PLACE' })).toEqual(
        baseline,
      );
      expect(assessDecibelRestingEntryEconomicsV1(diagnostic).decision).toBe('KEEP');
    }
  });
  it('replays both PID 26796 SELL snapshots: market invalidation then a separately profitable new PLACE', () => {
    type snapshot = {
      bestBid: number;
      bestAsk: number;
      makerFeeBps: number;
      estimatedGasCostUsd: number;
      adverseSelectionBufferBps: number;
      safetyMarginBps: number;
    };
    const data = JSON.parse(
      readFileSync('tests/fixtures/entry_retention_26796_v1.json', 'utf8'),
    ) as {
      facts: {
        side: 'BUY' | 'SELL';
        price: number;
        quantity: number;
        place: snapshot;
        cancel: { reason: string; snapshot: snapshot }[];
        fills: unknown[];
      }[];
    };
    const sells = data.facts.filter((f) => f.side === 'SELL');
    for (const row of sells) {
      const assess = (s: snapshot) => ({
        side: row.side,
        price: row.price,
        quantity: row.quantity,
        midpoint: (s.bestBid + s.bestAsk) / 2,
        makerFeeBps: s.makerFeeBps,
        gasCostUsd: s.estimatedGasCostUsd,
        adverseSelectionBps: s.adverseSelectionBufferBps,
        safetyMarginBps: s.safetyMarginBps,
      });
      expect(
        assessDecibelEntryPhaseEconomicsV1({ ...assess(row.place), phase: 'PLACE' })
          .conditionalNetUsd,
      ).toBeGreaterThan(0.012);
      const cancel = row.cancel[0]!;
      if (row.price === 75770.1) {
        const rest = assessDecibelRestingEntryEconomicsV1(assess(cancel.snapshot));
        expect(rest.decision).toBe('KEEP');
        expect(rest.conditionalNetUsd).toBeGreaterThan(0);
      } else {
        expect(row.price).toBe(75803);
        expect(cancel.reason).toBe('SESSION_UNWIND_CANCEL_OPEN');
        expect(assessDecibelRestingEntryEconomicsV1(assess(cancel.snapshot)).decision).toBe('KEEP');
      }
      expect(row.fills).toEqual([]);
    }
    expect(sells).toHaveLength(2);
  });
  it('keeps the original SELL through a negative hypothetical midpoint payoff', () => {
    const data = JSON.parse(
      readFileSync('tests/fixtures/entry_retention_recorded_v1.json', 'utf8'),
    ) as {
      orders: {
        intent: { side: 'BUY' | 'SELL'; price: number; quantity: number };
        createdAt: number;
        fills: unknown[];
        lineage: { createdAt: number; body: { action: string } }[];
        placeSnapshot: {
          bestBid: number;
          bestAsk: number;
          makerFeeBps: number;
          estimatedGasCostUsd: number;
          adverseSelectionBufferBps: number;
          safetyMarginBps: number;
        };
      }[];
    };
    for (const row of data.orders.filter((r) => r.intent.side === 'SELL')) {
      const s = row.placeSnapshot;
      const input = {
        ...row.intent,
        midpoint: (s.bestBid + s.bestAsk) / 2,
        makerFeeBps: s.makerFeeBps,
        gasCostUsd: s.estimatedGasCostUsd,
        adverseSelectionBps: s.adverseSelectionBufferBps,
        safetyMarginBps: s.safetyMarginBps,
      };
      const full = assessDecibelEntryPhaseEconomicsV1({ ...input, phase: 'PLACE' });
      const rest = assessDecibelRestingEntryEconomicsV1(input);
      expect(full.conditionalNetUsd).toBeGreaterThan(0);
      expect(rest.decision).toBe('KEEP');
      expect(rest.conditionalNetUsd! - full.conditionalNetUsd!).toBeCloseTo(
        input.gasCostUsd + (input.price * input.quantity * input.safetyMarginBps) / 10000,
        12,
      );
      // A controlled market move, explicitly not a fabricated historical tick.
      expect(
        assessDecibelRestingEntryEconomicsV1({ ...input, midpoint: input.price }).decision,
      ).toBe('KEEP');
      expect(row.fills).toEqual([]);
      expect(
        row.lineage.some((l) => l.body.action === 'CANCEL' && l.createdAt > row.createdAt),
      ).toBe(true);
    }
  });
  it('retains a narrow-band ENTRY surplus after execution costs', () => {
    for (const side of ['BUY', 'SELL'] as const) {
      const input = {
        side,
        price: 100,
        quantity: 1,
        midpoint: side === 'BUY' ? 100.08 : 99.92,
        makerFeeBps: 1.5,
        gasCostUsd: 0.01,
        adverseSelectionBps: 4,
        safetyMarginBps: 1,
      };
      expect(
        assessDecibelEntryPhaseEconomicsV1({ ...input, phase: 'PLACE' }).conditionalNetUsd,
      ).toBeCloseTo(0.035, 10);
      expect(assessDecibelRestingEntryEconomicsV1(input)).toMatchObject({ decision: 'KEEP' });
    }
  });
});
