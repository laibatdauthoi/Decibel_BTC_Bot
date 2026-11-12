import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { buildDecibelExecutionIntentV1 } from '../src/decibel_execution_intent_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import {
  decibel_execution_lifecycle_v1,
  type DecibelExecutionExecutorV1,
  type execution_result_v1,
} from '../src/decibel_execution_lifecycle_v1.js';
import { hasExecutionPreSubmissionFailureConfirmationV1 } from '../src/run_decibel_execution_journal_resolve_pre_submission_failure_v1.js';

class decibel_mock_lifecycle_executor_v1 implements DecibelExecutionExecutorV1 {
  readonly mcpMutationCalls = 0;
  readonly venueMutations = 0;
  mockMutationAttempts = 0;
  constructor(private readonly Script: execution_result_v1[]) {}
  private next(): execution_result_v1 {
    this.mockMutationAttempts += 1;
    const result = this.Script.shift();
    if (result === undefined) throw new Error('MOCK_LIFECYCLE_SCRIPT_EXHAUSTED');
    return result;
  }
  placePostOnlyLimit(): Promise<execution_result_v1> {
    return Promise.resolve(this.next());
  }
  cancelExactOrder(): Promise<execution_result_v1> {
    return Promise.resolve(this.next());
  }
}

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
  it('repairs only exact legacy timestamp-as-version provenance atomically and idempotently', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'legacy-version-')), 'j.sqlite');
    let Journal = new decibel_execution_lifecycle_journal_v1(path);
    const order = intent();
    Journal.prepare(order);
    Journal.transition(order.intentId, 'ACKNOWLEDGED', 2, 'venue');
    const proof = {
      intentId: order.intentId,
      reconciliationState: 'FULL_FILL',
      terminalStatus: 'APPLIED' as const,
      source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
      matchedIdentifier: 'venueOrderId:venue',
      venueStatus: 'FILLED',
      remainingQuantity: 0,
      transactionHash: '0xsubmission',
      venueOrderId: 'venue',
      clientOrderId: order.clientOrderId,
      observedAt: 3,
      fills: [
        {
          fillId: 'fill',
          quantity: order.quantity,
          price: order.price,
          transactionVersion: '1788831238977',
        },
      ],
    };
    Journal.applyAuthoritativeReconciliation(proof);
    const readVersion = () => {
      const Db = new Database(path, { readonly: true });
      const row = Db.prepare(
        'SELECT transaction_version version FROM reconciliation_fill_provenance WHERE fill_id=?',
      ).get('fill');
      Db.close();
      return row;
    };
    const corrected = {
      ...proof,
      observedAt: 4,
      fills: [
        {
          ...proof.fills[0]!,
          transactionVersion: '7121429716',
          transactionTimestamp: 1788831238977,
        },
      ],
    };
    expect(() =>
      Journal.applyAuthoritativeReconciliation({ ...corrected, transactionHash: '0xconflicting' }),
    ).toThrow();
    expect(readVersion()).toEqual({ version: '1788831238977' });
    expect(() =>
      Journal.applyAuthoritativeReconciliation({
        ...corrected,
        fills: [{ ...corrected.fills[0]!, transactionTimestamp: 99 }],
      }),
    ).toThrow();
    Journal.applyAuthoritativeReconciliation(corrected);
    expect(readVersion()).toEqual({ version: '7121429716' });
    expect(Journal.ledger().inventory).toBe(0); // Provenance repair does not fabricate accounting fills.
    Journal.close();
    Journal = new decibel_execution_lifecycle_journal_v1(path);
    Journal.applyAuthoritativeReconciliation(corrected);
    expect(readVersion()).toEqual({ version: '7121429716' });
    expect(() =>
      Journal.applyAuthoritativeReconciliation({
        ...corrected,
        fills: [{ ...corrected.fills[0]!, quantity: 0.09 }],
      }),
    ).toThrow();
    Journal.close();
  });
  it('terminalizes only legacy intents proven never submitted', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'recover-legacy-')), 'j.sqlite'),
    );
    const unsubmitted = intent();
    const attempted = buildDecibelExecutionIntentV1({
      ...unsubmitted,
      cycleSequence: 2,
      clientOrderId: 'attempted',
      createdAt: 2,
    });
    journal.prepare(unsubmitted);
    journal.prepare(attempted);
    journal.transition(attempted.intentId, 'SUBMITTING', 2);
    journal.attempt(attempted.intentId, 2);

    expect(journal.terminalizeLegacyUnsubmittedIntents(3)).toEqual([unsubmitted.intentId]);
    expect(journal.get(unsubmitted.intentId)?.status).toBe('FAILED_DROPPED_LEGACY');
    expect(journal.get(attempted.intentId)?.status).toBe('SUBMITTING');
    expect(journal.nonTerminal().map((row) => row.intentId)).toEqual([attempted.intentId]);
    journal.close();
  });
  it('accepts explicit CLI and environment confirmation forms', () => {
    expect(hasExecutionPreSubmissionFailureConfirmationV1(['--confirm'], {})).toBe(true);
    expect(hasExecutionPreSubmissionFailureConfirmationV1(['--yes'], {})).toBe(true);
    expect(hasExecutionPreSubmissionFailureConfirmationV1([], { CONFIRM: 'true' })).toBe(true);
    expect(
      hasExecutionPreSubmissionFailureConfirmationV1([], {
        EXECUTION_PRE_SUBMISSION_FAILURE_CONFIRMATION: 'YES',
      }),
    ).toBe(true);
    expect(hasExecutionPreSubmissionFailureConfirmationV1([], {})).toBe(false);
  });
  it('cleans only locally proven pre-submission intents in a confirmed pass', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'recover-confirmed-pass-')), 'j.sqlite'),
    );
    const prepared = intent();
    journal.prepare(prepared);
    const unsafe = buildDecibelExecutionIntentV1({
      ...prepared,
      cycleSequence: 2,
      clientOrderId: 'unsafe',
      createdAt: 2,
    });
    journal.prepare(unsafe);
    journal.transition(unsafe.intentId, 'SUBMITTING', 3);
    journal.attempt(unsafe.intentId, 3);
    journal.transition(unsafe.intentId, 'SUBMIT_UNKNOWN', 3);

    expect(journal.resolveConfirmedPreSubmissionFailures({ at: 4, confirmed: true })).toMatchObject(
      { resolvedIntentIds: [prepared.intentId] },
    );
    expect(journal.get(prepared.intentId)?.status).toBe('REJECTED');
    expect(journal.get(unsafe.intentId)?.status).toBe('SUBMIT_UNKNOWN');
    journal.close();
  });
  it('terminalizes a specifically proven pre-executor canary halt without retrying', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'recover-canary-halt-')), 'j.sqlite'),
    );
    const stranded = intent();
    journal.prepare(stranded);
    journal.transition(stranded.intentId, 'SUBMITTING', 2);
    journal.attempt(stranded.intentId, 2);

    expect(
      journal.resolveConfirmedPreSubmissionFailures({
        intentId: stranded.intentId,
        clientOrderId: stranded.clientOrderId,
        preExecutorProof: 'CANARY_HALT_FOR_RECONCILIATION',
        at: 3,
        confirmed: true,
      }),
    ).toMatchObject({ resolvedIntentIds: [stranded.intentId] });
    expect(journal.get(stranded.intentId)?.status).toBe('REJECTED');
    expect(journal.nonTerminal()).toEqual([]);
    journal.close();
  });
  it('keeps genuine unknown submissions fail closed despite canary proof input', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'recover-unknown-')), 'j.sqlite'),
    );
    const unknown = intent();
    journal.prepare(unknown);
    journal.transition(unknown.intentId, 'SUBMITTING', 2);
    journal.attempt(unknown.intentId, 2);
    journal.transition(unknown.intentId, 'SUBMIT_UNKNOWN', 2);

    expect(
      journal.resolveConfirmedPreSubmissionFailures({
        intentId: unknown.intentId,
        clientOrderId: unknown.clientOrderId,
        preExecutorProof: 'CANARY_HALT_FOR_RECONCILIATION',
        at: 3,
        confirmed: true,
      }),
    ).toMatchObject({ resolvedIntentIds: [] });
    expect(journal.get(unknown.intentId)?.status).toBe('SUBMIT_UNKNOWN');
    expect(journal.nonTerminal().map((row) => row.intentId)).toEqual([unknown.intentId]);
    journal.close();
  });
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
  it.each(['PREPARED', 'SUBMITTING', 'SUBMIT_UNKNOWN'] as const)(
    'does not supersede real %s recovery state without the dry-run marker',
    (status) => {
      const journal = new decibel_execution_lifecycle_journal_v1(
        join(mkdtempSync(join(tmpdir(), 'recover-real-')), 'j.sqlite'),
      );
      const value = intent();
      journal.prepare(value);
      if (status !== 'PREPARED') journal.transition(value.intentId, status, 2);
      expect(journal.supersedeDryRunOnlyPrepared(3)).toBe(0);
      expect(journal.nonTerminal()).toEqual([
        { intentId: value.intentId, status, venueOrderId: null },
      ]);
      journal.close();
    },
  );
  it('closes a confirmed pre-submission ABI failure without deleting journal history', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'recover-abi-')), 'j.sqlite'),
    );
    const value = intent();
    journal.prepare(value);
    journal.transition(value.intentId, 'SUBMITTING', 2);
    journal.attempt(value.intentId, 2);
    journal.recordOutcome(value.intentId, { outcome: 'PLACE_TIMEOUT_UNKNOWN' }, 2);
    journal.transition(value.intentId, 'SUBMIT_UNKNOWN', 2);

    expect(
      journal.resolvePreSubmissionAbiFailure({
        intentId: value.intentId,
        at: 3,
        confirmation: 'APTOS_REMOTE_ABI_NON_INTEGER_CONFIRMED',
      }),
    ).toEqual({ duplicate: false });
    expect(journal.get(value.intentId)?.status).toBe('REJECTED');
    expect(journal.nonTerminal()).toEqual([]);
    expect(
      journal.resolvePreSubmissionAbiFailure({
        intentId: value.intentId,
        at: 4,
        confirmation: 'APTOS_REMOTE_ABI_NON_INTEGER_CONFIRMED',
      }),
    ).toEqual({ duplicate: true });
    expect(journal.mutationAttemptsSince(0)).toBe(1);
    journal.close();
  });
  it('refuses to close an unknown intent after reconciliation evidence exists', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'recover-abi-refuse-')), 'j.sqlite'),
    );
    const value = intent();
    journal.prepare(value);
    journal.transition(value.intentId, 'SUBMITTING', 2);
    journal.attempt(value.intentId, 2);
    journal.recordOutcome(value.intentId, { outcome: 'PLACE_TIMEOUT_UNKNOWN' }, 2);
    journal.transition(value.intentId, 'SUBMIT_UNKNOWN', 2);
    journal.recordReconciliation(value.intentId, 'ORDER_NOT_FOUND', null, 3);
    expect(() =>
      journal.resolvePreSubmissionAbiFailure({
        intentId: value.intentId,
        at: 4,
        confirmation: 'APTOS_REMOTE_ABI_NON_INTEGER_CONFIRMED',
      }),
    ).toThrow('EXECUTION_PRE_SUBMISSION_FAILURE_RESOLUTION_REJECTED');
    expect(journal.get(value.intentId)?.status).toBe('SUBMIT_UNKNOWN');
    journal.close();
  });
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
  it('persists authenticated maker volume without requiring flat cycle transitions', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'cycle-direction-')), 'j.sqlite');
    let journal = new decibel_execution_lifecycle_journal_v1(path);
    const fill = (fillId: string, side: 'BUY' | 'SELL', observedAt: number) =>
      journal.applyFill({
        fillId,
        intentId: null,
        side,
        quantity: 0.00014,
        price: 80_000,
        strategyLineage: true,
        makerProven: true,
        externalCounterparty: true,
        observedAt,
      });
    fill('buy-one', 'BUY', 1);
    fill('sell-one', 'SELL', 2);
    fill('sell-two', 'SELL', 3);
    fill('buy-two', 'BUY', 4);
    expect(journal.ledger()).toMatchObject({ inventory: 0, completedCycles: 0 });
    journal.close();

    journal = new decibel_execution_lifecycle_journal_v1(path);
    expect(journal.ledger()).toMatchObject({
      inventory: 0,
      completedCycles: 0,
      strategyMakerVolume: 44.8,
    });
    journal.close();
  });
  it('normalizes conserved fractional fills to exact flat inventory', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'cycle-fractional-flat-')), 'j.sqlite'),
    );
    for (const [fillId, side, quantity, observedAt] of [
      ['buy', 'BUY', 0.00027, 1],
      ['sell-one', 'SELL', 0.00026, 2],
      ['sell-two', 'SELL', 0.00001, 3],
    ] as const)
      journal.applyFill({
        fillId,
        intentId: null,
        side,
        quantity,
        price: 80_000,
        strategyLineage: true,
        makerProven: true,
        externalCounterparty: true,
        observedAt,
      });
    expect(journal.ledger().inventory).toBe(0);
    journal.close();
  });
  it('terminalizes an intent from an authenticated flat checkpoint without a venue mutation', () => {
    const journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'recover-flat-checkpoint-')), 'j.sqlite'),
    );
    const value = intent();
    journal.prepare(value);
    journal.transition(value.intentId, 'SUBMIT_UNKNOWN', 2);
    const executor = new decibel_mock_lifecycle_executor_v1([]);
    const lifecycle = new decibel_execution_lifecycle_v1(journal, executor, {
      maxPlaceAttemptsPerMinute: 1,
      maxCancelAttemptsPerMinute: 1,
      maxTotalMutationAttemptsPerMinute: 1,
      maxConsecutiveUnknownOutcomes: 1,
    });

    expect(
      lifecycle.reconcile(value.intentId, 'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED', 3),
    ).toEqual({ nextAction: 'PLACE_ALLOWED' });
    expect(journal.get(value.intentId)?.status).toBe('EXTERNALLY_NEUTRALIZED');
    expect(executor.mockMutationAttempts).toBe(0);
    journal.close();
  });
});

describe('Durable partial-fill reconciliation', () => {
  it('persists cumulative unique fills and residual OPEN ownership across restart', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'partial-fill-')), 'journal.sqlite');
    const journal = new decibel_execution_lifecycle_journal_v1(path);
    const order = buildDecibelExecutionIntentV1({
      sessionId: 'partial-session',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 81_188.8,
      quantity: 0.0003,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'd1b-partial',
      knownVenueOrderId: null,
      sourceStateHash: 'partial-state',
      strategyDecisionHash: 'partial-decision',
      createdAt: 1,
    });
    journal.prepare(order);
    journal.transition(order.intentId, 'SUBMITTING', 1);
    journal.transition(order.intentId, 'ACKNOWLEDGED', 2, 'venue-partial');
    const proof = {
      intentId: order.intentId,
      reconciliationState: 'PARTIAL_FILL',
      terminalStatus: 'ACKNOWLEDGED' as const,
      source: 'AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION',
      matchedIdentifier: 'venueOrderId:venue-partial',
      venueStatus: 'PARTIAL_FILL',
      remainingQuantity: 0.0002,
      transactionHash: '0xsubmit',
      venueOrderId: 'venue-partial',
      clientOrderId: 'd1b-partial',
      observedAt: 10,
      fills: [
        { fillId: 'fill-1', quantity: 0.00003, price: 81_188.8, transactionVersion: '3' },
        { fillId: 'fill-2', quantity: 0.00007, price: 81_188.8, transactionVersion: '2' },
      ],
      decision: {
        reason: 'PARTIAL_FILL_CONFIRMED',
        evidenceAgeMs: 0,
        nextAction: 'APPLY' as const,
      },
    };
    journal.applyAuthoritativeReconciliation(proof);
    journal.applyAuthoritativeReconciliation({ ...proof, observedAt: 11 });
    expect(journal.get(order.intentId)).toMatchObject({
      status: 'ACKNOWLEDGED',
      venueOrderId: 'venue-partial',
    });
    journal.close();

    const database = new Database(path, { readonly: true });
    expect(
      database
        .prepare('SELECT fill_id,quantity FROM reconciliation_fill_provenance ORDER BY fill_id')
        .all(),
    ).toEqual([
      { fill_id: 'fill-1', quantity: 0.00003 },
      { fill_id: 'fill-2', quantity: 0.00007 },
    ]);
    database.close();
    const restarted = new decibel_execution_lifecycle_journal_v1(path);
    expect(restarted.get(order.intentId)?.status).toBe('ACKNOWLEDGED');
    restarted.close();
  });
});

type duplicate_recovery_fixture_v1 = ReturnType<typeof makeDuplicateRecoveryFixture>;

function makeDuplicateRecoveryFixture(
  input: {
    duplicateMarket?: 'BTC/USD';
    duplicateSide?: 'BUY' | 'SELL';
    duplicatePrice?: number;
    duplicateQuantity?: number;
    originalTerminal?: boolean;
    duplicateStatus?: 'UNRESOLVABLE_ACK' | 'ACKNOWLEDGED';
    duplicateCreatedAt?: number;
  } = {},
) {
  const path = join(mkdtempSync(join(tmpdir(), 'historical-duplicate-')), 'journal.sqlite');
  const journal = new decibel_execution_lifecycle_journal_v1(path);
  const venueOrderId = 'venue-shared';
  const clientOrderId = 'client-shared';
  const original = buildDecibelExecutionIntentV1({
    sessionId: 'session',
    cycleSequence: 1,
    action: 'PLACE',
    market: 'BTC/USD',
    side: 'SELL',
    price: 100,
    quantity: 0.1,
    tickSize: 0.1,
    lotSize: 0.01,
    clientOrderId,
    knownVenueOrderId: null,
    sourceStateHash: 'original-state',
    strategyDecisionHash: 'original-decision',
    createdAt: 10,
  });
  const duplicate = buildDecibelExecutionIntentV1({
    sessionId: 'session',
    cycleSequence: 2,
    action: 'PLACE',
    market: input.duplicateMarket ?? 'BTC/USD',
    side: input.duplicateSide ?? 'SELL',
    price: input.duplicatePrice ?? 100,
    quantity: input.duplicateQuantity ?? 0.1,
    tickSize: 0.1,
    lotSize: 0.01,
    clientOrderId,
    knownVenueOrderId: null,
    sourceStateHash: 'duplicate-state',
    strategyDecisionHash: 'duplicate-decision',
    createdAt: input.duplicateCreatedAt ?? 200,
  });
  journal.prepare(original);
  journal.transition(original.intentId, 'ACKNOWLEDGED', 20, venueOrderId);
  if (input.originalTerminal !== false)
    journal.transition(original.intentId, 'APPLIED', 100, venueOrderId);
  journal.prepare(duplicate);
  journal.transition(duplicate.intentId, 'ACKNOWLEDGED', 201, venueOrderId);
  journal.recordReconciliation(duplicate.intentId, 'ORDER_OPEN', venueOrderId, 201);
  if (input.duplicateStatus !== 'ACKNOWLEDGED')
    journal.markUnresolvableAcknowledgement(duplicate.intentId, 202);
  const request = {
    recoveryId: 'recovery-1',
    originalIntentId: original.intentId,
    duplicateIntentId: duplicate.intentId,
    venueOrderId,
    clientOrderId,
    now: 1_000,
    maximumEvidenceAgeMs: 500,
    evidence: {
      source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' as const,
      observedAt: 900,
      reconciliationState: 'FULL_FILL' as const,
      venueStatus: 'FILLED' as const,
      remainingQuantity: 0 as const,
      matchedIdentifier: `venueOrderId:${venueOrderId}`,
      transactionHash: '0xterminal',
    },
    authorization: {
      scope: 'HISTORICAL_DUPLICATE_INTENT_RECOVERY' as const,
      authorizationId: 'authorization-1',
      operatorId: 'operator-test',
      authorizedAt: 850,
      reason: 'verified duplicate adoption fixture',
    },
  };
  return { path, journal, original, duplicate, request };
}

function closeDuplicateRecoveryFixture(fixture: duplicate_recovery_fixture_v1): void {
  fixture.journal.close();
}

describe('Auditable historical duplicate-intent recovery', () => {
  it('preflights without mutation and atomically supersedes a proven duplicate', () => {
    const fixture = makeDuplicateRecoveryFixture();
    expect(fixture.journal.assessHistoricalDuplicateRecovery(fixture.request)).toEqual({
      eligible: true,
      outcome: 'READY',
    });
    expect(fixture.journal.get(fixture.duplicate.intentId)?.status).toBe('UNRESOLVABLE_ACK');
    expect(fixture.journal.getHistoricalDuplicateRecovery('recovery-1')).toBeNull();

    expect(fixture.journal.recoverHistoricalDuplicateIntent(fixture.request)).toEqual({
      outcome: 'APPLIED',
      duplicateIntentId: fixture.duplicate.intentId,
    });
    expect(fixture.journal.get(fixture.original.intentId)?.status).toBe('APPLIED');
    expect(fixture.journal.get(fixture.duplicate.intentId)?.status).toBe('SUPERSEDED');
    expect(
      fixture.journal.getLatestReconciliationProvenance(fixture.original.intentId),
    ).toMatchObject({ venueStatus: 'FILLED', remainingQuantity: 0 });
    expect(fixture.journal.getHistoricalDuplicateRecovery('recovery-1')).toMatchObject({
      originalIntentId: fixture.original.intentId,
      duplicateIntentId: fixture.duplicate.intentId,
      authorizationId: 'authorization-1',
      outcome: 'SUPERSEDED_DUPLICATE_ADOPTION',
    });
    closeDuplicateRecoveryFixture(fixture);
  });

  it.each([
    [
      'venue identity',
      (f: duplicate_recovery_fixture_v1) => ({ ...f.request, venueOrderId: 'wrong' }),
    ],
    [
      'client identity',
      (f: duplicate_recovery_fixture_v1) => ({ ...f.request, clientOrderId: 'wrong' }),
    ],
    [
      'terminal evidence',
      (f: duplicate_recovery_fixture_v1) => ({
        ...f.request,
        evidence: { ...f.request.evidence, matchedIdentifier: 'venueOrderId:wrong' },
      }),
    ],
    [
      'freshness',
      (f: duplicate_recovery_fixture_v1) => ({
        ...f.request,
        evidence: { ...f.request.evidence, observedAt: 499 },
      }),
    ],
  ] as const)('rejects incorrect %s without changing either intent', (_name, mutate) => {
    const fixture = makeDuplicateRecoveryFixture();
    const result = fixture.journal.recoverHistoricalDuplicateIntent(mutate(fixture));
    expect(result.outcome).toBe('REJECTED');
    expect(fixture.journal.get(fixture.original.intentId)?.status).toBe('APPLIED');
    expect(fixture.journal.get(fixture.duplicate.intentId)?.status).toBe('UNRESOLVABLE_ACK');
    expect(fixture.journal.getHistoricalDuplicateRecovery('recovery-1')).toBeNull();
    closeDuplicateRecoveryFixture(fixture);
  });

  it('rejects market mismatch, invalid ordering, and contradictory duplicate evidence', () => {
    const market = makeDuplicateRecoveryFixture();
    const database = new Database(market.path);
    database
      .prepare(
        "UPDATE execution_intents SET body_json=json_set(body_json,'$.market','ETH/USD') WHERE intent_id=?",
      )
      .run(market.duplicate.intentId);
    database.close();
    expect(market.journal.recoverHistoricalDuplicateIntent(market.request)).toMatchObject({
      blocker: 'HISTORICAL_DUPLICATE_RECOVERY_IDENTITY_MISMATCH',
    });
    closeDuplicateRecoveryFixture(market);

    const ordering = makeDuplicateRecoveryFixture({ duplicateCreatedAt: 100 });
    expect(ordering.journal.recoverHistoricalDuplicateIntent(ordering.request)).toMatchObject({
      blocker: 'HISTORICAL_DUPLICATE_RECOVERY_ORDERING_INVALID',
    });
    closeDuplicateRecoveryFixture(ordering);

    const contradictory = makeDuplicateRecoveryFixture();
    contradictory.journal.recordReconciliation(
      contradictory.duplicate.intentId,
      'FULL_FILL',
      contradictory.request.venueOrderId,
      203,
    );
    expect(
      contradictory.journal.recoverHistoricalDuplicateIntent(contradictory.request),
    ).toMatchObject({
      blocker: 'HISTORICAL_DUPLICATE_RECOVERY_DUPLICATE_EVIDENCE_CONFLICT',
    });
    closeDuplicateRecoveryFixture(contradictory);
  });

  it.each([
    ['side', { duplicateSide: 'BUY' as const }],
    ['price', { duplicatePrice: 100.1 }],
    ['quantity', { duplicateQuantity: 0.11 }],
  ])('rejects incompatible %s', (_name, options) => {
    const fixture = makeDuplicateRecoveryFixture(options);
    expect(fixture.journal.recoverHistoricalDuplicateIntent(fixture.request)).toMatchObject({
      outcome: 'REJECTED',
      blocker: 'HISTORICAL_DUPLICATE_RECOVERY_IDENTITY_MISMATCH',
    });
    closeDuplicateRecoveryFixture(fixture);
  });

  it('rejects a non-terminal original and an incorrectly-stated duplicate', () => {
    const originalOpen = makeDuplicateRecoveryFixture({ originalTerminal: false });
    expect(
      originalOpen.journal.recoverHistoricalDuplicateIntent(originalOpen.request),
    ).toMatchObject({ blocker: 'HISTORICAL_DUPLICATE_RECOVERY_ORIGINAL_NOT_TERMINAL' });
    closeDuplicateRecoveryFixture(originalOpen);
    const duplicateOpen = makeDuplicateRecoveryFixture({ duplicateStatus: 'ACKNOWLEDGED' });
    expect(
      duplicateOpen.journal.recoverHistoricalDuplicateIntent(duplicateOpen.request),
    ).toMatchObject({ blocker: 'HISTORICAL_DUPLICATE_RECOVERY_DUPLICATE_STATE_INVALID' });
    closeDuplicateRecoveryFixture(duplicateOpen);
  });

  it('rejects duplicate submission evidence and additional identity owners', () => {
    const attempted = makeDuplicateRecoveryFixture();
    attempted.journal.attempt(attempted.duplicate.intentId, 203);
    expect(attempted.journal.recoverHistoricalDuplicateIntent(attempted.request)).toMatchObject({
      blocker: 'HISTORICAL_DUPLICATE_RECOVERY_DUPLICATE_ATTEMPTED',
    });
    closeDuplicateRecoveryFixture(attempted);
    const outcome = makeDuplicateRecoveryFixture();
    outcome.journal.recordOutcome(outcome.duplicate.intentId, { outcome: 'PLACE_ACCEPTED' }, 203);
    expect(outcome.journal.recoverHistoricalDuplicateIntent(outcome.request)).toMatchObject({
      blocker: 'HISTORICAL_DUPLICATE_RECOVERY_DUPLICATE_HAS_OUTCOME',
    });
    closeDuplicateRecoveryFixture(outcome);
    const extra = makeDuplicateRecoveryFixture();
    const third = buildDecibelExecutionIntentV1({
      ...extra.duplicate,
      cycleSequence: 3,
      createdAt: 300,
      strategyDecisionHash: 'third',
    });
    extra.journal.prepare(third);
    extra.journal.transition(third.intentId, 'ACKNOWLEDGED', 301, extra.request.venueOrderId);
    expect(extra.journal.recoverHistoricalDuplicateIntent(extra.request)).toMatchObject({
      blocker: 'HISTORICAL_DUPLICATE_RECOVERY_ADDITIONAL_IDENTITY_OWNER',
    });
    closeDuplicateRecoveryFixture(extra);
  });

  it.each([
    [
      'provenance persistence',
      "CREATE TRIGGER fail_recovery_provenance BEFORE INSERT ON reconciliation_provenance BEGIN SELECT RAISE(ABORT,'TEST_PROVENANCE_FAILURE'); END",
    ],
    [
      'terminal transition',
      "CREATE TRIGGER fail_recovery_transition BEFORE UPDATE ON execution_intents WHEN NEW.status='SUPERSEDED' BEGIN SELECT RAISE(ABORT,'TEST_TRANSITION_FAILURE'); END",
    ],
  ])('rolls back atomically on %s failure', (_name, trigger) => {
    const fixture = makeDuplicateRecoveryFixture();
    const database = new Database(fixture.path);
    database.exec(trigger);
    database.close();
    expect(() => fixture.journal.recoverHistoricalDuplicateIntent(fixture.request)).toThrow();
    expect(fixture.journal.get(fixture.duplicate.intentId)?.status).toBe('UNRESOLVABLE_ACK');
    expect(fixture.journal.getHistoricalDuplicateRecovery('recovery-1')).toBeNull();
    expect(fixture.journal.getLatestReconciliationProvenance(fixture.original.intentId)).toBeNull();
    closeDuplicateRecoveryFixture(fixture);
  });

  it('is idempotent and persists its audit record across restart', () => {
    const fixture = makeDuplicateRecoveryFixture();
    expect(fixture.journal.recoverHistoricalDuplicateIntent(fixture.request).outcome).toBe(
      'APPLIED',
    );
    expect(
      fixture.journal.recoverHistoricalDuplicateIntent({
        ...fixture.request,
        now: fixture.request.now + 10_000,
      }).outcome,
    ).toBe('ALREADY_APPLIED');
    fixture.journal.close();
    const restarted = new decibel_execution_lifecycle_journal_v1(fixture.path);
    expect(restarted.recoverHistoricalDuplicateIntent(fixture.request).outcome).toBe(
      'ALREADY_APPLIED',
    );
    expect(restarted.get(fixture.duplicate.intentId)?.status).toBe('SUPERSEDED');
    restarted.close();
  });

  it('preserves an existing compatible FULL_FILL provenance record', () => {
    const fixture = makeDuplicateRecoveryFixture();
    fixture.journal.applyAuthoritativeReconciliation({
      intentId: fixture.original.intentId,
      reconciliationState: 'FULL_FILL',
      terminalStatus: 'APPLIED',
      source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
      matchedIdentifier: `venueOrderId:${fixture.request.venueOrderId}`,
      venueStatus: 'FILLED',
      remainingQuantity: 0,
      transactionHash: '0xprior',
      venueOrderId: fixture.request.venueOrderId,
      clientOrderId: fixture.request.clientOrderId,
      observedAt: 700,
      fills: [{ fillId: 'compatible-fill', quantity: 0.1, price: 100, transactionVersion: '699' }],
    });
    expect(fixture.journal.recoverHistoricalDuplicateIntent(fixture.request).outcome).toBe(
      'APPLIED',
    );
    expect(
      fixture.journal.getLatestReconciliationProvenance(fixture.original.intentId),
    ).toMatchObject({ transactionHash: '0xprior', observedAt: 700 });
    closeDuplicateRecoveryFixture(fixture);
  });

  it('rejects conflicting repeated authorization and performs no execution mutation', () => {
    const fixture = makeDuplicateRecoveryFixture();
    expect(fixture.journal.recoverHistoricalDuplicateIntent(fixture.request).outcome).toBe(
      'APPLIED',
    );
    const conflicting = {
      ...fixture.request,
      authorization: { ...fixture.request.authorization, authorizationId: 'different' },
    };
    expect(fixture.journal.recoverHistoricalDuplicateIntent(conflicting)).toMatchObject({
      outcome: 'REJECTED',
      blocker: 'HISTORICAL_DUPLICATE_RECOVERY_AUDIT_CONFLICT',
    });
    expect(fixture.journal.mutationAttemptsSince(0)).toBe(0);
    closeDuplicateRecoveryFixture(fixture);
  });
});

describe('Auditable false flat-checkpoint OPEN recovery', () => {
  function makeFalseFlatFixture() {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-false-flat-')), 'journal.sqlite');
    const journal = new decibel_execution_lifecycle_journal_v1(path);
    const intent = buildDecibelExecutionIntentV1({
      sessionId: 'session-current',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'SELL',
      price: 81_425.5,
      quantity: 0.0003,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'd1sed6a4bbb1e282b3253066d1f33b86',
      knownVenueOrderId: null,
      sourceStateHash: 'source',
      strategyDecisionHash: 'decision',
      createdAt: 1_000,
    });
    const venueOrderId = '170141604320468508094256248004894785536';
    journal.prepare(intent);
    journal.attempt(intent.intentId, 1_001);
    journal.transition(intent.intentId, 'ACKNOWLEDGED', 1_100, venueOrderId);
    journal.recordReconciliation(
      intent.intentId,
      'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED',
      venueOrderId,
      1_112,
    );
    journal.transition(intent.intentId, 'EXTERNALLY_NEUTRALIZED', 1_112, venueOrderId);
    const request = {
      recoveryId: 'false-flat-current-order-1',
      intentId: intent.intentId,
      venueOrderId,
      clientOrderId: intent.clientOrderId,
      now: 2_000,
      maximumEvidenceAgeMs: 300_000,
      evidence: {
        observedAt: 1_900,
        remainingQuantity: 0.0003,
        transactionHash: '0xcommitted',
      },
      authorization: {
        scope: 'FALSE_FLAT_CHECKPOINT_OPEN_RECOVERY' as const,
        authorizationId: 'authorization-current-order-1',
        operatorId: 'operator-test',
        authorizedAt: 1_800,
        reason: 'exact authenticated OPEN order corrects false account-level terminalization',
      },
    };
    return { path, journal, intent, request };
  }

  it('preflights without mutation and restores the original acknowledged owner atomically', () => {
    const fixture = makeFalseFlatFixture();
    fixture.journal.recordIdentityConflict(fixture.intent.intentId, 1_200);
    expect(fixture.journal.getExecutionReconciliationBlocker()).toBe(
      'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
    );
    expect(fixture.journal.assessFalseFlatCheckpointOpenRecovery(fixture.request)).toEqual({
      eligible: true,
      outcome: 'READY',
    });
    expect(fixture.journal.get(fixture.intent.intentId)?.status).toBe('EXTERNALLY_NEUTRALIZED');
    expect(fixture.journal.recoverFalseFlatCheckpointOpenIntent(fixture.request)).toEqual({
      outcome: 'APPLIED',
      intentId: fixture.intent.intentId,
    });
    expect(fixture.journal.get(fixture.intent.intentId)?.status).toBe('ACKNOWLEDGED');
    expect(fixture.journal.getExecutionReconciliationBlocker()).toBeNull();
    expect(
      fixture.journal.getLatestReconciliationProvenance(fixture.intent.intentId),
    ).toMatchObject({
      source: 'OPERATOR_AUTHORIZED_FALSE_FLAT_CHECKPOINT_RECOVERY',
      venueStatus: 'OPEN',
      remainingQuantity: 0.0003,
      transactionHash: '0xcommitted',
    });
    fixture.journal.close();
  });

  it('is idempotent across restart while preserving one identity owner', () => {
    const fixture = makeFalseFlatFixture();
    fixture.journal.recordIdentityConflict(fixture.intent.intentId, 1_200);
    expect(fixture.journal.recoverFalseFlatCheckpointOpenIntent(fixture.request).outcome).toBe(
      'APPLIED',
    );
    fixture.journal.close();
    const restarted = new decibel_execution_lifecycle_journal_v1(fixture.path);
    expect(restarted.recoverFalseFlatCheckpointOpenIntent(fixture.request)).toMatchObject({
      outcome: 'ALREADY_APPLIED',
    });
    expect(restarted.get(fixture.intent.intentId)?.status).toBe('ACKNOWLEDGED');
    expect(restarted.getExecutionReconciliationBlocker()).toBeNull();
    restarted.close();
  });

  it('rejects stale evidence, mismatched identity, and a non-checkpoint terminal origin', () => {
    const stale = makeFalseFlatFixture();
    expect(
      stale.journal.recoverFalseFlatCheckpointOpenIntent({
        ...stale.request,
        now: 400_000,
      }),
    ).toMatchObject({ outcome: 'REJECTED', blocker: 'FALSE_FLAT_RECOVERY_OPEN_EVIDENCE_INVALID' });
    expect(
      stale.journal.recoverFalseFlatCheckpointOpenIntent({
        ...stale.request,
        clientOrderId: 'wrong-client',
      }),
    ).toMatchObject({ outcome: 'REJECTED', blocker: 'FALSE_FLAT_RECOVERY_IDENTITY_MISMATCH' });
    stale.journal.close();
  });

  it('rolls back owner restoration if audit provenance cannot persist', () => {
    const fixture = makeFalseFlatFixture();
    fixture.journal.recordIdentityConflict(fixture.intent.intentId, 1_200);
    const database = new Database(fixture.path);
    database.exec(
      "CREATE TRIGGER fail_false_flat_provenance BEFORE INSERT ON reconciliation_provenance BEGIN SELECT RAISE(ABORT,'TEST_FALSE_FLAT_PROVENANCE_FAILURE'); END",
    );
    database.close();
    expect(() => fixture.journal.recoverFalseFlatCheckpointOpenIntent(fixture.request)).toThrow();
    expect(fixture.journal.get(fixture.intent.intentId)?.status).toBe('EXTERNALLY_NEUTRALIZED');
    expect(fixture.journal.getExecutionReconciliationBlocker()).toBe(
      'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
    );
    fixture.journal.close();
  });

  it('migrates a persisted historical identity blocker into durable active state', () => {
    const fixture = makeFalseFlatFixture();
    fixture.journal.recordBlocker(
      fixture.intent.intentId,
      'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
      1_200,
    );
    fixture.journal.close();
    const restarted = new decibel_execution_lifecycle_journal_v1(fixture.path);
    expect(restarted.getExecutionReconciliationBlocker()).toBe(
      'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
    );
    restarted.close();
  });
});

describe('Auditable false flat-checkpoint CANCELLED recovery', () => {
  function makeCancelledFixture(side: 'BUY' | 'SELL' = 'SELL') {
    const path = join(
      mkdtempSync(join(tmpdir(), 'decibel-false-flat-cancelled-')),
      'journal.sqlite',
    );
    const journal = new decibel_execution_lifecycle_journal_v1(path);
    const suffix = side === 'SELL' ? 'sell-cancelled' : 'buy-cancelled';
    const intent = buildDecibelExecutionIntentV1({
      sessionId: 'session-current',
      cycleSequence: side === 'SELL' ? 1 : 2,
      action: 'PLACE',
      market: 'BTC/USD',
      side,
      price: side === 'SELL' ? 81_425.5 : 81_400.5,
      quantity: 0.0003,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: `client-${suffix}`,
      knownVenueOrderId: null,
      sourceStateHash: 'source',
      strategyDecisionHash: 'decision',
      createdAt: 1_000,
    });
    const venueOrderId = `venue-${suffix}`;
    const transactionHash = `0x${suffix}`;
    journal.prepare(intent);
    journal.attempt(intent.intentId, 1_001);
    journal.recordOutcome(intent.intentId, { outcome: 'PLACE_ACCEPTED', transactionHash }, 1_050);
    journal.transition(intent.intentId, 'ACKNOWLEDGED', 1_100, venueOrderId);
    journal.recordReconciliation(
      intent.intentId,
      'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED',
      venueOrderId,
      1_112,
    );
    journal.transition(intent.intentId, 'EXTERNALLY_NEUTRALIZED', 1_112, venueOrderId);
    journal.recordIdentityConflict(intent.intentId, 1_200);
    const request = {
      recoveryId: `false-flat-cancelled-${suffix}`,
      intentId: intent.intentId,
      venueOrderId,
      clientOrderId: intent.clientOrderId,
      side,
      market: 'BTC/USD',
      quantity: 0.0003,
      now: 2_000,
      maximumEvidenceAgeMs: 300_000,
      evidence: {
        source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' as const,
        observedAt: 1_900,
        terminalState: 'CANCELLED' as const,
        remainingQuantity: 0 as const,
        matchingFillCount: 0 as const,
        transactionHash,
        transactionState: 'COMMITTED' as const,
      },
      authorization: {
        scope: 'FALSE_FLAT_CHECKPOINT_CANCELLED_RECOVERY' as const,
        authorizationId: `authorization-${suffix}`,
        operatorId: 'operator-test',
        authorizedAt: 1_800,
        reason: 'exact authenticated terminal history corrects false FLAT terminalization',
      },
    };
    return { path, journal, intent, request };
  }

  it.each(['BUY', 'SELL'] as const)(
    'persists exact %s cancellation provenance without fabricating a fill or illegal transition',
    (side) => {
      const fixture = makeCancelledFixture(side);
      expect(fixture.journal.assessFalseFlatCheckpointCancelledRecovery(fixture.request)).toEqual({
        eligible: true,
        outcome: 'READY',
      });
      expect(fixture.journal.getExecutionReconciliationBlocker()).not.toBeNull();
      expect(fixture.journal.recoverFalseFlatCheckpointCancelledIntent(fixture.request)).toEqual({
        outcome: 'APPLIED',
        intentId: fixture.intent.intentId,
      });
      expect(fixture.journal.get(fixture.intent.intentId)?.status).toBe('EXTERNALLY_NEUTRALIZED');
      expect(
        fixture.journal.getLatestReconciliationProvenance(fixture.intent.intentId),
      ).toMatchObject({
        source: 'OPERATOR_AUTHORIZED_FALSE_FLAT_CHECKPOINT_CANCELLED_RECOVERY',
        matchedIdentifier: `venueOrderId:${fixture.request.venueOrderId}|clientOrderId:${fixture.request.clientOrderId}`,
        venueStatus: 'CANCELLED',
        remainingQuantity: 0,
        transactionHash: fixture.request.evidence.transactionHash,
      });
      expect(fixture.journal.getExecutionReconciliationBlocker()).toBeNull();
      expect(fixture.journal.mutationAttemptsSince(1_002)).toBe(0);
      fixture.journal.close();
    },
  );

  it('is idempotent across restart and keeps the durable conflict resolved', () => {
    const fixture = makeCancelledFixture();
    expect(fixture.journal.recoverFalseFlatCheckpointCancelledIntent(fixture.request).outcome).toBe(
      'APPLIED',
    );
    fixture.journal.close();
    const restarted = new decibel_execution_lifecycle_journal_v1(fixture.path);
    expect(
      restarted.recoverFalseFlatCheckpointCancelledIntent({
        ...fixture.request,
        now: 2_500,
        evidence: { ...fixture.request.evidence, observedAt: 2_400 },
        authorization: { ...fixture.request.authorization, authorizedAt: 2_300 },
      }),
    ).toMatchObject({ outcome: 'ALREADY_APPLIED' });
    expect(restarted.get(fixture.intent.intentId)?.status).toBe('EXTERNALLY_NEUTRALIZED');
    expect(restarted.getExecutionReconciliationBlocker()).toBeNull();
    restarted.close();
  });

  it('rejects stale or contradictory evidence and leaves the conflict fail-closed', () => {
    const stale = makeCancelledFixture();
    expect(
      stale.journal.recoverFalseFlatCheckpointCancelledIntent({
        ...stale.request,
        now: 400_000,
      }),
    ).toMatchObject({
      outcome: 'REJECTED',
      blocker: 'FALSE_FLAT_CANCELLED_RECOVERY_EVIDENCE_INVALID',
    });
    expect(
      stale.journal.recoverFalseFlatCheckpointCancelledIntent({
        ...stale.request,
        clientOrderId: 'contradictory-client',
      }),
    ).toMatchObject({
      outcome: 'REJECTED',
      blocker: 'FALSE_FLAT_CANCELLED_RECOVERY_IDENTITY_MISMATCH',
    });
    expect(stale.journal.getExecutionReconciliationBlocker()).not.toBeNull();
    stale.journal.close();
  });

  it('detects a concurrent authoritative-state change before applying recovery', () => {
    const fixture = makeCancelledFixture();
    fixture.journal.recordReconciliation(
      fixture.intent.intentId,
      'CONCURRENT_AUTHORITATIVE_OBSERVATION',
      fixture.request.venueOrderId,
      1_950,
    );
    expect(
      fixture.journal.recoverFalseFlatCheckpointCancelledIntent(fixture.request),
    ).toMatchObject({
      outcome: 'REJECTED',
      blocker: 'FALSE_FLAT_CANCELLED_RECOVERY_ORIGIN_INVALID',
    });
    expect(fixture.journal.getExecutionReconciliationBlocker()).not.toBeNull();
    fixture.journal.close();
  });

  it('rolls back cancellation evidence and conflict resolution when audit persistence fails', () => {
    const fixture = makeCancelledFixture();
    const database = new Database(fixture.path);
    database.exec(
      "CREATE TRIGGER fail_cancelled_provenance BEFORE INSERT ON reconciliation_provenance BEGIN SELECT RAISE(ABORT,'TEST_CANCELLED_PROVENANCE_FAILURE'); END",
    );
    database.close();
    expect(() =>
      fixture.journal.recoverFalseFlatCheckpointCancelledIntent(fixture.request),
    ).toThrow();
    expect(fixture.journal.get(fixture.intent.intentId)?.status).toBe('EXTERNALLY_NEUTRALIZED');
    expect(fixture.journal.getExecutionReconciliationBlocker()).not.toBeNull();
    fixture.journal.close();
  });

  function makeTerminalConflictFixture() {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-terminal-conflict-')), 'journal.sqlite');
    const journal = new decibel_execution_lifecycle_journal_v1(path);
    const placed = buildDecibelExecutionIntentV1({
      sessionId: 'session-current',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'SELL',
      price: 81_608.2,
      quantity: 0.0003,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'd1s-terminal-conflict',
      knownVenueOrderId: null,
      sourceStateHash: 'source',
      strategyDecisionHash: 'decision',
      createdAt: 1_000,
    });
    const venueOrderId = 'venue-terminal-conflict';
    const transactionHash = '0xterminal-conflict';
    journal.prepare(placed);
    journal.attempt(placed.intentId, 1_001);
    journal.recordOutcome(placed.intentId, { outcome: 'PLACE_ACCEPTED', transactionHash }, 1_050);
    journal.transition(placed.intentId, 'ACKNOWLEDGED', 1_100, venueOrderId);
    journal.applyAuthoritativeReconciliation({
      intentId: placed.intentId,
      reconciliationState: 'ORDER_OPEN',
      terminalStatus: 'ACKNOWLEDGED',
      source: 'AUTHENTICATED_OPEN_ORDERS',
      matchedIdentifier: `venueOrderId:${venueOrderId}`,
      venueStatus: 'OPEN',
      remainingQuantity: placed.quantity,
      transactionHash,
      venueOrderId,
      clientOrderId: placed.clientOrderId,
      observedAt: 1_200,
    });
    journal.transition(placed.intentId, 'RECONCILING', 1_300, venueOrderId);
    journal.recordReconciliation(placed.intentId, 'FULL_FILL', venueOrderId, 1_300);
    journal.transition(placed.intentId, 'APPLIED', 1_300, venueOrderId);
    journal.recordIdentityConflict(placed.intentId, 1_400);
    const request = {
      recoveryId: 'terminal-conflict-full-fill-001',
      intentId: placed.intentId,
      venueOrderId,
      clientOrderId: placed.clientOrderId,
      side: 'SELL' as const,
      market: 'BTC/USD',
      quantity: placed.quantity,
      price: placed.price,
      now: 2_000,
      maximumEvidenceAgeMs: 300_000,
      evidence: {
        source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' as const,
        observedAt: 1_900,
        terminalState: 'FILLED' as const,
        remainingQuantity: 0 as const,
        transactionHash,
        transactionState: 'COMMITTED' as const,
        fillId: 'fill-terminal-conflict',
        fillQuantity: placed.quantity,
        fillPrice: placed.price,
        fillTransactionTimestamp: 1_300,
      },
      authorization: {
        scope: 'TERMINAL_IDENTITY_CONFLICT_FULL_FILL_RECOVERY' as const,
        authorizationId: 'authorization-terminal-conflict',
        operatorId: 'operator-test',
        authorizedAt: 1_800,
        reason: 'fresh exact terminal and fill evidence resolves delayed OPEN conflict',
      },
    };
    return { path, journal, placed, request };
  }

  it('durably resolves the exact delayed OPEN/full-fill conflict with fresh fill evidence', () => {
    const fixture = makeTerminalConflictFixture();
    expect(fixture.journal.assessTerminalIdentityConflictFullFillRecovery(fixture.request)).toEqual(
      {
        eligible: true,
        outcome: 'READY',
      },
    );
    expect(fixture.journal.recoverTerminalIdentityConflictFullFill(fixture.request)).toEqual({
      outcome: 'APPLIED',
      intentId: fixture.placed.intentId,
    });
    expect(fixture.journal.get(fixture.placed.intentId)?.status).toBe('APPLIED');
    expect(
      fixture.journal.getLatestReconciliationProvenance(fixture.placed.intentId),
    ).toMatchObject({
      source: 'OPERATOR_AUTHORIZED_TERMINAL_IDENTITY_CONFLICT_RECOVERY',
      venueStatus: 'FILLED',
      remainingQuantity: 0,
    });
    expect(fixture.journal.getExecutionReconciliationBlocker()).toBeNull();
    fixture.journal.close();
  });

  it('is restart-idempotent and rejects stale or contradictory terminal conflict evidence', () => {
    const fixture = makeTerminalConflictFixture();
    expect(fixture.journal.recoverTerminalIdentityConflictFullFill(fixture.request).outcome).toBe(
      'APPLIED',
    );
    fixture.journal.close();
    const restarted = new decibel_execution_lifecycle_journal_v1(fixture.path);
    expect(restarted.recoverTerminalIdentityConflictFullFill(fixture.request)).toMatchObject({
      outcome: 'ALREADY_APPLIED',
    });
    restarted.close();

    const stale = makeTerminalConflictFixture();
    expect(
      stale.journal.recoverTerminalIdentityConflictFullFill({ ...stale.request, now: 400_000 }),
    ).toMatchObject({
      outcome: 'REJECTED',
      blocker: 'TERMINAL_IDENTITY_CONFLICT_RECOVERY_EVIDENCE_INVALID',
    });
    expect(
      stale.journal.recoverTerminalIdentityConflictFullFill({
        ...stale.request,
        clientOrderId: 'contradictory-client',
      }),
    ).toMatchObject({
      outcome: 'REJECTED',
      blocker: 'TERMINAL_IDENTITY_CONFLICT_RECOVERY_IDENTITY_MISMATCH',
    });
    expect(stale.journal.getExecutionReconciliationBlocker()).not.toBeNull();
    stale.journal.close();
  });

  it('keeps the conflict active when durable recovery-audit persistence fails', () => {
    const fixture = makeTerminalConflictFixture();
    const database = new Database(fixture.path);
    database.exec(
      "CREATE TRIGGER fail_terminal_conflict_audit BEFORE INSERT ON terminal_identity_conflict_recoveries BEGIN SELECT RAISE(ABORT,'TEST_TERMINAL_CONFLICT_AUDIT_FAILURE'); END",
    );
    database.close();
    expect(() =>
      fixture.journal.recoverTerminalIdentityConflictFullFill(fixture.request),
    ).toThrow();
    expect(fixture.journal.getExecutionReconciliationBlocker()).toBe(
      'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
    );
    expect(
      fixture.journal.getLatestReconciliationProvenance(fixture.placed.intentId),
    ).toMatchObject({ venueStatus: 'OPEN' });
    fixture.journal.close();
  });

  it('ignores a delayed OPEN for an exact owned order with durable terminal provenance', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-terminal-open-')), 'journal.sqlite');
    const journal = new decibel_execution_lifecycle_journal_v1(path);
    const placed = intent();
    journal.prepare(placed);
    journal.transition(placed.intentId, 'ACKNOWLEDGED', 2, 'terminal-venue');
    journal.applyAuthoritativeReconciliation({
      intentId: placed.intentId,
      reconciliationState: 'FULL_FILL',
      terminalStatus: 'APPLIED',
      source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
      matchedIdentifier: 'venueOrderId:terminal-venue',
      venueStatus: 'FILLED',
      remainingQuantity: 0,
      transactionHash: '0xterminal',
      venueOrderId: 'terminal-venue',
      clientOrderId: placed.clientOrderId,
      observedAt: 3,
    });
    expect(
      journal.adoptAuthoritativeOpenOrder({
        intent: placed,
        venueOrderId: 'terminal-venue',
        observedAt: 4,
        remainingQuantity: placed.quantity,
      }),
    ).toEqual({ outcome: 'STALE_OPEN_IGNORED', intentId: placed.intentId });
    expect(journal.getActiveIdentityConflict()).toBeNull();
    expect(journal.get(placed.intentId)?.status).toBe('APPLIED');
    journal.close();
  });
});

describe('terminal history re-observation that adds fills', () => {
  const setup = () => {
    const Journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'terminal-fills-')), 'j.sqlite'),
    );
    const order = intent();
    Journal.prepare(order);
    Journal.transition(order.intentId, 'ACKNOWLEDGED', 2, 'venue');
    const filledWithoutFills = {
      intentId: order.intentId,
      reconciliationState: 'FULL_FILL',
      terminalStatus: 'APPLIED' as const,
      source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
      matchedIdentifier: 'venueOrderId:venue',
      venueStatus: 'FILLED',
      remainingQuantity: 0,
      transactionHash: '0xsubmission',
      venueOrderId: 'venue',
      clientOrderId: order.clientOrderId,
      observedAt: 3,
      fills: [] as {
        fillId: string;
        quantity: number;
        price: number;
        transactionVersion: string;
      }[],
    };
    Journal.applyAuthoritativeReconciliation(filledWithoutFills);
    const fill = {
      fillId: 'fill-1',
      quantity: order.quantity,
      price: order.price,
      transactionVersion: '8016498514',
    };
    return { Journal, order, filledWithoutFills, fill };
  };

  it('accepts the same FILLED outcome when the fill evidence arrives later', () => {
    const { Journal, order, filledWithoutFills, fill } = setup();
    expect(Journal.get(order.intentId)?.status).toBe('APPLIED');
    expect(() =>
      Journal.applyAuthoritativeReconciliation({
        ...filledWithoutFills,
        observedAt: 4,
        fills: [fill],
      }),
    ).not.toThrow();
    expect(Journal.get(order.intentId)?.status).toBe('APPLIED');
    expect(Journal.getExecutionReconciliationBlocker()).toBeNull();
    // Idempotent once the fill is recorded.
    expect(() =>
      Journal.applyAuthoritativeReconciliation({
        ...filledWithoutFills,
        observedAt: 5,
        fills: [fill],
      }),
    ).not.toThrow();
    Journal.close();
  });

  it('still rejects a different transaction or an oversized fill', () => {
    const { Journal, filledWithoutFills, fill, order } = setup();
    expect(() =>
      Journal.applyAuthoritativeReconciliation({
        ...filledWithoutFills,
        observedAt: 4,
        transactionHash: '0xother',
        fills: [fill],
      }),
    ).toThrow(/EXECUTION_AUTHORITATIVE/);
    expect(() =>
      Journal.applyAuthoritativeReconciliation({
        ...filledWithoutFills,
        observedAt: 4,
        fills: [{ ...fill, quantity: order.quantity * 2 }],
      }),
    ).toThrow(/EXECUTION_AUTHORITATIVE/);
    Journal.close();
  });
});
