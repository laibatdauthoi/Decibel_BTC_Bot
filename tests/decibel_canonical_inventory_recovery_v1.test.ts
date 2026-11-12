import { buildDecibelExecutionIntentV1 } from '../src/decibel_execution_intent_v1.js';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { planDecibelHistoricalFillRecoveryV1 } from '../src/decibel_authenticated_btc_activity_resync_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
const recovery = JSON.parse(
  readFileSync(new URL('./fixtures/decibel_historical_recovery_v1.json', import.meta.url), 'utf8'),
) as Parameters<typeof planDecibelHistoricalFillRecoveryV1>[0];
const prior = JSON.parse(
  readFileSync(
    new URL('./fixtures/decibel_legacy_authenticated_fills_v1.json', import.meta.url),
    'utf8',
  ),
) as {
  fill_id: string;
  intent_id: string | null;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  strategy_lineage: number;
  maker_proven: number;
  external_counterparty: number;
  observed_at: number;
}[];
it('canonically repairs exact legacy 33/517 inventory while preserving attribution and restart idempotency', () => {
  const dir = mkdtempSync(join(tmpdir(), 'decibel-history-recovery-'));
  const path = join(dir, 'copy.sqlite');
  const J = new decibel_execution_lifecycle_journal_v1(path);
  const plan = planDecibelHistoricalFillRecoveryV1(recovery);
  const expectedPlanHash = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  const existingFillIds: Record<string, string> = {};
  for (const fill of prior) {
    J.applyFill({
      fillId: fill.fill_id,
      intentId: fill.intent_id,
      side: fill.side,
      quantity: fill.quantity,
      price: fill.price,
      strategyLineage: Boolean(fill.strategy_lineage),
      makerProven: Boolean(fill.maker_proven),
      externalCounterparty: Boolean(fill.external_counterparty),
      observedAt: fill.observed_at,
    });
    let tradeId = fill.fill_id;
    try {
      const parsed = JSON.parse(tradeId) as string[];
      if (Array.isArray(parsed)) tradeId = parsed[1]!;
    } catch {
      /* Legacy raw fill IDs are not JSON keys. */
    }
    const matches = plan.records.filter(
      (r) =>
        r.fillId === tradeId &&
        r.side === fill.side &&
        r.quantity === fill.quantity &&
        r.price === fill.price,
    );
    expect(matches).toHaveLength(1);
    existingFillIds[matches[0]!.executionId] = fill.fill_id;
  }
  expect(J.ledger().inventory).toBe(0.00014);
  const maker = J.ledger().strategyMakerVolume;
  const now = Date.now();
  const args = {
    recovery,
    expectedPlanHash,
    existingFillIds,
    sessionBoundary: Math.max(...plan.records.map((r) => r.timestamp)) + 1,
    venueInventoryBase: 0,
    observedAt: now,
    now,
    maximumAgeMs: 5000,
  };
  try {
    expect(() =>
      J.applyHistoricalInventoryRecovery({ ...args, expectedPlanHash: 'wrong' }),
    ).toThrow('REVIEW_OR_VENUE');
    expect(() => J.applyHistoricalInventoryRecovery({ ...args, existingFillIds: {} })).toThrow(
      'COVERAGE_MISSING',
    );
    expect(() => J.applyHistoricalInventoryRecovery({ ...args, sessionBoundary: 1 })).toThrow(
      'CURRENT_SESSION_BOUNDARY',
    );
    expect(J.applyHistoricalInventoryRecovery(args)).toMatchObject({
      inserted: 484,
      duplicates: 33,
      inventory: 0,
      historicalDiscrepancies: 27,
    });
    expect(J.applyHistoricalInventoryRecovery(args)).toMatchObject({
      inserted: 0,
      duplicates: 517,
      inventory: 0,
    });
    expect(J.ledger().strategyMakerVolume).toBe(maker);
    const old = prior[0]!;
    const aliased = plan.records.find(
      (record) => existingFillIds[record.executionId] === old.fill_id,
    )!;
    expect(
      J.applyFill({
        fillId: aliased.canonicalFillId!,
        intentId: old.intent_id,
        side: old.side,
        quantity: old.quantity,
        price: old.price,
        strategyLineage: Boolean(old.strategy_lineage),
        makerProven: Boolean(old.maker_proven),
        externalCounterparty: Boolean(old.external_counterparty),
        observedAt: old.observed_at,
      }).duplicate,
    ).toBe(true);
    expect(J.ledger().inventory).toBe(0);
    const pending = buildDecibelExecutionIntentV1({
      sessionId: 'current',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 80000,
      quantity: 0.0001,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: `d1b${'a'.repeat(29)}`,
      knownVenueOrderId: null,
      sourceStateHash: 'test',
      strategyDecisionHash: 'test',
      createdAt: now,
    });
    J.prepare(pending);
    expect(() => J.applyHistoricalInventoryRecovery(args)).toThrow('CURRENT_EXECUTION_UNRESOLVED');
    J.transition(pending.intentId, 'REJECTED', now);
  } finally {
    J.close();
  }
  const Restarted = new decibel_execution_lifecycle_journal_v1(path);
  try {
    expect(Restarted.applyHistoricalInventoryRecovery(args)).toMatchObject({
      inserted: 0,
      duplicates: 517,
      inventory: 0,
    });
    expect(Restarted.ledger().strategyMakerVolume).toBe(maker);
  } finally {
    Restarted.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
