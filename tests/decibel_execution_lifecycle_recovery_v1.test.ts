import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDecibelExecutionIntentV1 } from '../src/decibel_execution_intent_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import { decibel_execution_lifecycle_v1 } from '../src/decibel_execution_lifecycle_v1.js';
import { decibel_mock_lifecycle_executor_v1 } from '../src/decibel_mock_lifecycle_executor_v1.js';
import { buildDecibelExecutionLifecycleMockManifestV1 } from '../src/run_decibel_mock_execution_lifecycle_v1.js';

const intent = () =>
  buildDecibelExecutionIntentV1({
    sessionId: 's',
    cycleSequence: 1,
    action: 'PLACE',
    market: 'BTC/USD',
    side: 'BUY',
    price: 100,
    quantity: 0.1,
    tickSize: 0.1,
    lotSize: 0.01,
    clientOrderId: 'c',
    knownVenueOrderId: null,
    sourceStateHash: 'state',
    strategyDecisionHash: 'decision',
    createdAt: 1,
  });
describe('Decibel lifecycle crash recovery V1', () => {
  it.each(['PREPARED', 'SUBMITTING', 'ACKNOWLEDGED'] as const)(
    'recovers %s as reconciliation-only without mutation',
    (status) => {
      const path = join(mkdtempSync(join(tmpdir(), 'recover-')), 'j.sqlite');
      let journal = new decibel_execution_lifecycle_journal_v1(path);
      const value = intent();
      journal.prepare(value);
      if (status !== 'PREPARED')
        journal.transition(
          value.intentId,
          status,
          2,
          status === 'ACKNOWLEDGED' ? 'order' : undefined,
        );
      journal.close();
      journal = new decibel_execution_lifecycle_journal_v1(path);
      const executor = new decibel_mock_lifecycle_executor_v1([]);
      const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, {
        maxPlaceAttemptsPerMinute: 1,
        maxCancelAttemptsPerMinute: 1,
        maxTotalMutationAttemptsPerMinute: 1,
        maxConsecutiveUnknownOutcomes: 1,
      });
      expect(lifecycle.recover()).toEqual([{ intentId: value.intentId, action: 'RECONCILE_ONLY' }]);
      expect(executor.mockMutationAttempts).toBe(0);
      journal.close();
    },
  );
  it('full BUY then SELL authenticated maker fills conserve inventory and complete one cycle', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'cycle-')), 'j.sqlite'),
    );
    journal.applyFill({
      fillId: 'buy',
      intentId: null,
      side: 'BUY',
      quantity: 0.1,
      price: 100,
      strategyLineage: true,
      makerProven: true,
      externalCounterparty: true,
      observedAt: 1,
    });
    const result = journal.applyFill({
      fillId: 'sell',
      intentId: null,
      side: 'SELL',
      quantity: 0.1,
      price: 101,
      strategyLineage: true,
      makerProven: true,
      externalCounterparty: true,
      observedAt: 2,
    });
    if (Math.abs(result.inventory) < 1e-12) journal.incrementCycles();
    expect(journal.ledger()).toMatchObject({
      inventory: 0,
      completedCycles: 1,
      strategyMakerVolume: 20.1,
    });
    journal.close();
  });
  it.each(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const)(
    'mock evidence manifest includes closed-loop scenario %s',
    (scenario) => {
      expect(buildDecibelExecutionLifecycleMockManifestV1().scenarioResults[scenario]).toBeTruthy();
    },
  );
  it('builds deterministic mock evidence', () => {
    expect(buildDecibelExecutionLifecycleMockManifestV1()).toEqual(
      buildDecibelExecutionLifecycleMockManifestV1(),
    );
  });
  it('records zero MCP, venue, and signed mainnet mutations', () => {
    expect(buildDecibelExecutionLifecycleMockManifestV1()).toMatchObject({
      mcpMutationCalls: 0,
      venueMutations: 0,
      mainnetSignedTransactions: 0,
    });
  });
  it('records one completed external-maker mock cycle', () => {
    expect(buildDecibelExecutionLifecycleMockManifestV1()).toMatchObject({
      completedMockCycles: 1,
      mockCounterpartiesExternal: true,
    });
  });
  it('prohibits self-trade and taker cleanup', () => {
    expect(buildDecibelExecutionLifecycleMockManifestV1()).toMatchObject({
      selfTradePermitted: false,
      noTakerCleanup: true,
    });
  });
});
