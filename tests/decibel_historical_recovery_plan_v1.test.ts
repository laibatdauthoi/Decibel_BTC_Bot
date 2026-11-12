import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assessDecibelHistoricalRecoveryReadinessV1,
  planDecibelHistoricalFillRecoveryV1,
} from '../src/decibel_authenticated_btc_activity_resync_v1.js';
type recovery_input = Parameters<typeof planDecibelHistoricalFillRecoveryV1>[0];
const input = JSON.parse(
  readFileSync(new URL('./fixtures/decibel_historical_recovery_v1.json', import.meta.url), 'utf8'),
) as recovery_input;
describe('Verified historical 517-fragment recovery plan', () => {
  it('replays sealed baseline, retains exact unresolved attribution and stays deterministic', () => {
    const result = planDecibelHistoricalFillRecoveryV1(input);
    expect(result.records).toHaveLength(517);
    expect(result.inventory).toBe(0);
    expect(result.ready).toBe(false);
    expect(
      result.records.filter((r) => r.blockers.includes('MISSING_INTENT_ATTRIBUTION')),
    ).toHaveLength(25);
    expect(
      result.records.filter((r) => r.blockers.includes('AMBIGUOUS_INTENT_ATTRIBUTION')),
    ).toHaveLength(2);
    expect(
      result.records.some((r) => r.blockers.includes('TERMINAL_ORDER_PROVENANCE_REQUIRED')),
    ).toBe(false);
    expect(
      planDecibelHistoricalFillRecoveryV1({ ...input, fragments: [...input.fragments].reverse() }),
    ).toEqual(result);
    expect(
      planDecibelHistoricalFillRecoveryV1({
        ...input,
        fragments: [...input.fragments, ...input.fragments],
      }),
    ).toEqual(result);
  });
  it('separates historical discrepancies from current execution without bypassing accounting', () => {
    const plan = planDecibelHistoricalFillRecoveryV1(input);
    const now = Math.max(...plan.records.map((r) => r.timestamp)) + 10000;
    const args = {
      plan,
      now,
      observedAt: now,
      maximumAgeMs: 5000,
      sessionBoundary: now - 1,
      activeSessionId: null,
      currentPositionBase: 0,
      openOrderCount: 0,
      nonterminalIntentCount: 0,
      accountingComplete: true,
    };
    expect(assessDecibelHistoricalRecoveryReadinessV1(args)).toMatchObject({
      currentReadiness: 'READY',
      historicalDiscrepancyCount: 27,
      currentDiscrepancyCount: 0,
      blockers: [],
    });
    expect(
      assessDecibelHistoricalRecoveryReadinessV1({ ...args, accountingComplete: false }).blockers,
    ).toEqual(['CURRENT_ACCOUNTING_INVARIANT_UNRESOLVED']);
    expect(
      assessDecibelHistoricalRecoveryReadinessV1({ ...args, nonterminalIntentCount: 1 })
        .currentReadiness,
    ).toBe('BLOCKED');
    expect(
      assessDecibelHistoricalRecoveryReadinessV1({ ...args, observedAt: now - 6000 })
        .currentReadiness,
    ).toBe('BLOCKED');
    expect(
      assessDecibelHistoricalRecoveryReadinessV1({ ...args, sessionBoundary: 1 })
        .currentDiscrepancyCount,
    ).toBe(27);
  });
  it('never infers terminal provenance or ownership from flat inventory', () => {
    const f = input.fragments[0]!;
    const result = planDecibelHistoricalFillRecoveryV1({
      ...input,
      fragments: [{ ...f, candidates: [], terminal: null }],
    });
    expect(result.ready).toBe(false);
    expect(result.records[0]?.sessionId).toBeNull();
    expect(result.records[0]?.blockers).toContain('TERMINAL_ORDER_PROVENANCE_REQUIRED');
  });
  it('rejects missing baseline, contradictory execution replay and overfilled owned order', () => {
    expect(() => planDecibelHistoricalFillRecoveryV1({ ...input, baseline: null })).toThrow(
      'CHECKPOINT_INVALID',
    );
    const f = input.fragments[0]!;
    expect(() =>
      planDecibelHistoricalFillRecoveryV1({
        ...input,
        fragments: [f, { ...f, price: f.price + 1 }],
      }),
    ).toThrow('IDENTITY_CONFLICT');
    expect(() =>
      planDecibelHistoricalFillRecoveryV1({
        ...input,
        fragments: [
          {
            ...f,
            candidates: [
              { intentId: 'owned', sessionId: 'historical', side: 'BUY', quantity: f.quantity / 2 },
            ],
          },
        ],
      }),
    ).toThrow('QUANTITY_CONFLICT');
  });
});
