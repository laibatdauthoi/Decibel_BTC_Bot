import { makeDecibelActivityBaselineFixtureV1 } from './fixtures/decibel_activity_baseline_fixture_v1.js';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildDecibelExecutionIntentV1,
  execution_preflight_rejection_v1,
} from '../src/decibel_execution_intent_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import { decibel_execution_lifecycle_v1 } from '../src/decibel_execution_lifecycle_v1.js';
import { decibel_operator_settings_store_v1 } from '../src/decibel_operator_settings_v1.js';
import { decibel_production_session_store_v1 } from '../src/decibel_production_session_v1.js';
import { decibel_production_session_controller_v1 } from '../src/decibel_production_session_controller_v1.js';
import {
  createDecibelActualFillLedgerV1,
  applyDecibelActualFillTruthV1,
} from '../src/decibel_actual_fill_truth_v1.js';
import {
  synchronizeDecibelSessionAccountingV1,
  requestDecibelSessionTargetUnwindV1,
  getDecibelSessionTargetTerminalReasonV1,
  isDecibelTargetUnwindReasonV1,
} from '../src/decibel_session_accounting_v1.js';
import {
  aggregateDecibelTradeHistoryFragmentsV1,
  decibel_production_live_state_source_v1,
  type DecibelProductionLiveAuthenticatedReaderV1,
} from '../src/decibel_production_live_state_source_v1.js';
import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 as market } from '../src/decibel_minimal_live_canary_v1.js';

async function createFixture(target = 50) {
  const root = mkdtempSync(join(tmpdir(), 'session-target-'));
  const Settings = new decibel_operator_settings_store_v1(join(root, 'settings.json'), {
    capitalToUseUsd: 8,
    maxLossUsd: 2,
    targetMakerVolumeUsd: target,
    orderNotionalUsd: 10,
    maxPositionUsd: 50,
  });
  const path = join(root, 'journal.sqlite');
  const Journal = new decibel_execution_lifecycle_journal_v1(path);
  const Sessions = new decibel_production_session_store_v1(join(root, 'sessions.sqlite'));
  const stop = vi.fn(() =>
    Promise.resolve({ safeToEnd: false, blocker: 'AWAITING_AUTHENTICATED_RECONCILIATION' }),
  );
  const Owner = { pid: process.pid, instanceId: 'test-owner' };
  const start = vi.fn(() => Promise.resolve({ stop }));
  const Controller = new decibel_production_session_controller_v1(
    Sessions,
    Settings,
    start,
    () => 1_000,
    undefined,
    undefined,
    Owner,
  );
  const session = await Controller.start(0);
  const intent = buildDecibelExecutionIntentV1({
    sessionId: session.sessionId,
    cycleSequence: 1,
    action: 'PLACE',
    market: 'BTC/USD',
    side: 'BUY',
    price: 100_000,
    quantity: 0.001,
    tickSize: 0.1,
    lotSize: 0.00001,
    clientOrderId: `d1b${'a'.repeat(29)}`,
    knownVenueOrderId: null,
    sourceStateHash: 'source',
    strategyDecisionHash: 'decision',
    createdAt: 1_000,
  });
  Journal.prepare(intent);
  Journal.transition(intent.intentId, 'ACKNOWLEDGED', 1_001, 'venue');
  const empty = createDecibelActualFillLedgerV1([
    {
      venueOrderId: 'venue',
      localIntentId: intent.intentId,
      localExecutionRequestId: intent.clientOrderId,
      marketAddress: market,
      side: 'BUY',
      requestedQuantity: 0.001,
    },
  ]);
  const fill = (id: string, usd: number, maker = true) => ({
    venueFillId: id,
    venueOrderId: 'venue',
    localExecutionRequestId: intent.clientOrderId,
    marketAddress: market,
    side: 'BUY' as const,
    executedPrice: 100_000,
    executedBaseQuantity: usd / 100_000,
    executedUsdNotional: 100_000 * (usd / 100_000),
    makerOrTaker: maker ? ('MAKER' as const) : ('TAKER' as const),
    receivedAt: new Date(2_000),
    venueTimestamp: new Date(1_500),
    fee: { availability: 'AVAILABLE' as const, amount: 0, currency: 'USD' },
    rebate: { availability: 'UNAVAILABLE' as const, amount: null, currency: null },
    executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM' as const,
  });
  return {
    Journal,
    Sessions,
    Controller,
    Settings,
    Owner,
    start,
    session,
    intent,
    empty,
    fill,
    path,
    stop,
  };
}

describe('Fixed session maker target', () => {
  it.each([50, 51])(
    'automatically requests canonical unwind at $%s and counts partial fills exactly once',
    async (total) => {
      const f = await createFixture();
      const partial = applyDecibelActualFillTruthV1(f.empty, f.fill('partial-1', 24));
      const before = synchronizeDecibelSessionAccountingV1(
        f.Journal,
        partial,
        f.session.sessionId,
        1_000,
        100_000,
      );
      expect(before.makerVolumeUsd).toBe(24);
      expect(requestDecibelSessionTargetUnwindV1(f.Controller, f.session.sessionId, before)).toBe(
        false,
      );
      const reached = applyDecibelActualFillTruthV1(partial, f.fill('partial-2', total - 24));
      for (let i = 0; i < 2; i++) {
        const metrics = synchronizeDecibelSessionAccountingV1(
          f.Journal,
          reached,
          f.session.sessionId,
          1_000,
          100_000,
        );
        expect(metrics.makerVolumeUsd).toBeCloseTo(total, 10);
        expect(metrics.fillCount).toBe(2);
        expect(
          requestDecibelSessionTargetUnwindV1(f.Controller, f.session.sessionId, metrics),
        ).toBe(true);
      }
      expect(f.Sessions.getActive()).toMatchObject({
        status: 'STOPPING',
        unwindReason: 'TARGET_VOLUME_REACHED',
      });
      expect(f.stop).not.toHaveBeenCalled();
      // A fill arriving while CANCEL is outstanding is still part of this session.
      const late = applyDecibelActualFillTruthV1(reached, f.fill('cancel-race-fill', 3));
      const final = synchronizeDecibelSessionAccountingV1(
        f.Journal,
        late,
        f.session.sessionId,
        1_000,
        100_000,
      );
      expect(final.makerVolumeUsd).toBeCloseTo(total + 3, 10);
      f.Sessions.updateActiveAccounting(f.session.sessionId, final.makerVolumeUsd, final.fillCount);
      expect(f.Sessions.getActive()?.makerVolumeUsd).toBeCloseTo(total + 3, 10);
      f.Journal.close();
      const Restarted = new decibel_execution_lifecycle_journal_v1(f.path);
      const recovered = synchronizeDecibelSessionAccountingV1(
        Restarted,
        f.empty,
        f.session.sessionId,
        1_000,
        100_000,
      );
      expect(recovered.makerVolumeUsd).toBeCloseTo(total + 3, 10);
      const Controller = new decibel_production_session_controller_v1(
        f.Sessions,
        f.Settings,
        f.start,
        () => 3_000,
        undefined,
        undefined,
        f.Owner,
      );
      await Controller.recoverStartup();
      expect(requestDecibelSessionTargetUnwindV1(Controller, f.session.sessionId, recovered)).toBe(
        true,
      );
      expect(f.Sessions.getActive()?.status).toBe('STOPPING');
      // The runtime calls completion only after cancel/reconciliation is authenticated.
      const accounting = {
        makerVolumeUsd: recovered.makerVolumeUsd,
        fillCount: recovered.fillCount,
        finalPositionBase: 0,
        unresolvedExecutionCount: 0,
      };
      expect(
        Controller.completeUnwind(f.session.sessionId, accounting, 'TARGET_VOLUME_REACHED').status,
      ).toBe('ENDED');
      expect(
        Controller.completeUnwind(f.session.sessionId, accounting, 'TARGET_VOLUME_REACHED').status,
      ).toBe('ENDED');
      expect(f.stop).not.toHaveBeenCalled();
      Restarted.close();
      f.Sessions.close();
    },
  );

  it.each([
    [25, 25],
    [50, 0],
    [0, 50],
  ])('ends V2 at maker $%s + taker $%s and keeps unwind IOC admissible', async (maker, taker) => {
    const f = await createFixture();
    expect(f.session.targetSemanticsVersion).toBe(2);
    const ioc = buildDecibelExecutionIntentV1({
      ...f.intent,
      cycleSequence: 2,
      side: 'SELL',
      clientOrderId: `d1s${'b'.repeat(29)}`,
      knownVenueOrderId: null,
      executionRole: 'SESSION_UNWIND_IOC',
      reduceOnly: true,
      timeInForce: 'ImmediateOrCancel',
    });
    f.Journal.prepare(ioc);
    f.Journal.transition(ioc.intentId, 'ACKNOWLEDGED', 1_001, 'ioc');
    let ledger = createDecibelActualFillLedgerV1([
      ...f.empty.orders,
      {
        venueOrderId: 'ioc',
        localIntentId: ioc.intentId,
        localExecutionRequestId: ioc.clientOrderId,
        marketAddress: market,
        side: 'SELL',
        requestedQuantity: 0.001,
      },
    ]);
    if (maker > 0)
      ledger = applyDecibelActualFillTruthV1(ledger, f.fill('shared-execution', maker));
    if (taker > 0)
      ledger = applyDecibelActualFillTruthV1(ledger, {
        ...f.fill('shared-execution', taker),
        venueOrderId: 'ioc',
        localExecutionRequestId: ioc.clientOrderId,
        side: 'SELL',
      });
    for (let replay = 0; replay < 2; replay++) {
      const metrics = synchronizeDecibelSessionAccountingV1(
        f.Journal,
        ledger,
        f.session.sessionId,
        1_000,
        100_000,
      );
      expect(metrics.makerVolumeUsd).toBe(maker);
      expect(metrics.takerVolumeUsd).toBe(taker);
      expect(metrics.totalExecutedVolumeUsd).toBe(50);
      expect(requestDecibelSessionTargetUnwindV1(f.Controller, f.session.sessionId, metrics)).toBe(
        true,
      );
    }
    expect(f.Sessions.getActive()?.status).toBe('STOPPING');
    ledger = applyDecibelActualFillTruthV1(ledger, {
      ...f.fill('late-unwind-fill', 5),
      venueOrderId: 'ioc',
      localExecutionRequestId: ioc.clientOrderId,
      side: 'SELL',
    });
    const final = synchronizeDecibelSessionAccountingV1(
      f.Journal,
      ledger,
      f.session.sessionId,
      1_000,
      100_000,
    );
    expect(final.totalExecutedVolumeUsd).toBe(55);
    f.Sessions.updateActiveAccounting(
      f.session.sessionId,
      final.makerVolumeUsd,
      final.fillCount,
      final.takerVolumeUsd,
      final.totalExecutedVolumeUsd,
    );
    f.Journal.close();
    const Restarted = new decibel_execution_lifecycle_journal_v1(f.path);
    const recovered = synchronizeDecibelSessionAccountingV1(
      Restarted,
      f.empty,
      f.session.sessionId,
      1_000,
      100_000,
    );
    expect(recovered.totalExecutedVolumeUsd).toBe(55);
    expect(recovered.totalExecutedVolumeUsd).toBe(
      recovered.makerVolumeUsd + recovered.takerVolumeUsd,
    );
    expect(f.Sessions.getActive()?.totalExecutedVolumeUsd).toBe(55);
    const executor = {
      placePostOnlyLimit: vi.fn(),
      placeReduceOnlyImmediateOrCancel: vi.fn(),
      cancelExactOrder: vi.fn(),
    };
    const Lifecycle = new decibel_execution_lifecycle_v1(
      Restarted,
      executor,
      {
        maxPlaceAttemptsPerMinute: 10,
        maxCancelAttemptsPerMinute: 10,
        maxTotalMutationAttemptsPerMinute: 20,
        maxConsecutiveUnknownOutcomes: 1,
      },
      () => 3_000,
      (intent) => {
        if (
          intent.action === 'PLACE' &&
          !(intent.reduceOnly && intent.executionRole === 'SESSION_UNWIND_IOC')
        )
          throw new execution_preflight_rejection_v1('SESSION_TARGET_OR_UNWIND_PLACE_BLOCKED');
      },
    );
    await expect(Lifecycle.submit(f.intent, { now: 3_000 })).rejects.toMatchObject({
      rejectionCode: 'SESSION_TARGET_OR_UNWIND_PLACE_BLOCKED',
    });
    expect(executor.placePostOnlyLimit).not.toHaveBeenCalled();
    expect(Restarted.mutationAttemptsSince(0)).toBe(0);
    const accounting = { ...final, finalPositionBase: 0, unresolvedExecutionCount: 0 };
    expect(
      f.Controller.completeUnwind(f.session.sessionId, accounting, 'TARGET_VOLUME_REACHED').status,
    ).toBe('ENDED');
    expect(
      f.Controller.completeUnwind(f.session.sessionId, accounting, 'TARGET_VOLUME_REACHED')
        .totalExecutedVolumeUsd,
    ).toBe(55);
    Restarted.close();
    f.Sessions.close();
  });

  it('blocks ambiguous historical lineage before inserting any session fills', async () => {
    const f = await createFixture();
    try {
      const duplicate = buildDecibelExecutionIntentV1({
        ...f.intent,
        cycleSequence: 2,
        sourceStateHash: 'second',
        createdAt: 1001,
        knownVenueOrderId: null,
      });
      f.Journal.prepare(duplicate);
      f.Journal.transition(duplicate.intentId, 'ACKNOWLEDGED', 1002, 'venue');
      const ledger = applyDecibelActualFillTruthV1(f.empty, f.fill('ambiguous', 25));
      expect(() =>
        synchronizeDecibelSessionAccountingV1(
          f.Journal,
          ledger,
          f.session.sessionId,
          1000,
          100000,
          2,
        ),
      ).toThrow('ATTRIBUTION_AMBIGUOUS');
      expect(f.Journal.getSessionFills(f.session.sessionId)).toHaveLength(0);
      expect(f.Journal.ledger().inventory).toBe(0);
    } finally {
      f.Journal.close();
      f.Sessions.close();
    }
  });
  it('ignores delivery timestamps when replaying the same immutable execution', async () => {
    const f = await createFixture();
    const execution = f.fill('replayed', 25);
    const ledger = applyDecibelActualFillTruthV1(f.empty, execution);
    expect(
      applyDecibelActualFillTruthV1(ledger, { ...execution, receivedAt: new Date(9_000) }),
    ).toBe(ledger);
    expect(() =>
      applyDecibelActualFillTruthV1(ledger, {
        ...execution,
        executedPrice: 200_000,
        executedUsdNotional: 50,
      }),
    ).toThrow('DECIBEL_ACTUAL_FILL_ID_CONFLICT');
    f.Journal.close();
    f.Sessions.close();
  });

  it('excludes fills belonging to another session even if observed during the active session', async () => {
    const f = await createFixture();
    const other = buildDecibelExecutionIntentV1({
      ...f.intent,
      sessionId: 'other-session',
      cycleSequence: 3,
      clientOrderId: `d1b${'c'.repeat(29)}`,
      knownVenueOrderId: null,
    });
    f.Journal.prepare(other);
    f.Journal.transition(other.intentId, 'ACKNOWLEDGED', 1_001, 'other-venue');
    const empty = createDecibelActualFillLedgerV1([
      ...f.empty.orders,
      {
        ...f.empty.orders[0]!,
        venueOrderId: 'other-venue',
        localIntentId: other.intentId,
        localExecutionRequestId: other.clientOrderId,
      },
    ]);
    const ledger = applyDecibelActualFillTruthV1(
      applyDecibelActualFillTruthV1(empty, f.fill('owned', 25)),
      {
        ...f.fill('foreign', 75),
        venueOrderId: 'other-venue',
        localExecutionRequestId: other.clientOrderId,
      },
    );
    const metrics = synchronizeDecibelSessionAccountingV1(
      f.Journal,
      ledger,
      f.session.sessionId,
      1_000,
      100_000,
    );
    expect(metrics.totalExecutedVolumeUsd).toBe(25);
    expect(metrics.fillCount).toBe(1);
    expect(requestDecibelSessionTargetUnwindV1(f.Controller, f.session.sessionId, metrics)).toBe(
      false,
    );
    f.Journal.close();
    f.Sessions.close();
  });

  it('migrates an unversioned ACTIVE session as maker-only and leaves REV 2 config immutable', async () => {
    const f = await createFixture();
    const databasePath = join(f.path, '..', 'sessions.sqlite');
    f.Sessions.close();
    const Raw = new Database(databasePath);
    Raw.exec('ALTER TABLE production_sessions_v1 DROP COLUMN target_semantics_version');
    Raw.close();
    const Sessions = new decibel_production_session_store_v1(databasePath);
    expect(Sessions.getActive()).toMatchObject({
      targetSemanticsVersion: 1,
      configSnapshot: f.session.configSnapshot,
    });
    const Controller = new decibel_production_session_controller_v1(
      Sessions,
      f.Settings,
      f.start,
      () => 3_000,
      undefined,
      undefined,
      f.Owner,
    );
    await Controller.recoverStartup();
    expect(
      requestDecibelSessionTargetUnwindV1(Controller, f.session.sessionId, {
        makerVolumeUsd: 25,
        totalExecutedVolumeUsd: 50,
      }),
    ).toBe(false);
    expect(Sessions.getActive()?.status).toBe('RUNNING');
    expect(Sessions.getActive()?.targetSemanticsVersion).toBe(1);
    Sessions.close();
    f.Journal.close();
  });

  it('counts taker fills toward the V2 target without counting global volume', async () => {
    const f = await createFixture();
    const ledger = applyDecibelActualFillTruthV1(
      applyDecibelActualFillTruthV1(f.empty, f.fill('maker', 49)),
      f.fill('taker', 20, false),
    );
    const metrics = synchronizeDecibelSessionAccountingV1(
      f.Journal,
      { ...ledger, actualExternalMakerVolumeUsd: 999 },
      f.session.sessionId,
      1_000,
      100_000,
    );
    expect(metrics.makerVolumeUsd).toBe(49);
    expect(requestDecibelSessionTargetUnwindV1(f.Controller, f.session.sessionId, metrics)).toBe(
      true,
    );
    expect(f.Sessions.getActive()?.status).toBe('STOPPING');
    f.Journal.close();
    f.Sessions.close();
  });

  it('never counts an IOC as maker even when the legacy source labels it MAKER', async () => {
    const f = await createFixture();
    const ioc = buildDecibelExecutionIntentV1({
      ...f.intent,
      cycleSequence: 2,
      clientOrderId: `d1b${'b'.repeat(29)}`,
      knownVenueOrderId: null,
      executionRole: 'SESSION_UNWIND_IOC',
      reduceOnly: true,
      timeInForce: 'ImmediateOrCancel',
    });
    f.Journal.prepare(ioc);
    f.Journal.transition(ioc.intentId, 'ACKNOWLEDGED', 1_001, 'ioc-venue');
    const empty = createDecibelActualFillLedgerV1([
      {
        ...f.empty.orders[0]!,
        venueOrderId: 'ioc-venue',
        localIntentId: ioc.intentId,
        localExecutionRequestId: ioc.clientOrderId,
      },
    ]);
    const ledger = applyDecibelActualFillTruthV1(empty, {
      ...f.fill('ioc-fill', 60),
      venueOrderId: 'ioc-venue',
      localExecutionRequestId: ioc.clientOrderId,
    });
    const metrics = synchronizeDecibelSessionAccountingV1(
      f.Journal,
      ledger,
      f.session.sessionId,
      1_000,
      100_000,
    );
    expect(metrics.makerVolumeUsd).toBe(0);
    expect(metrics.fillCount).toBe(1);
    expect(requestDecibelSessionTargetUnwindV1(f.Controller, f.session.sessionId, metrics)).toBe(
      true,
    );
    f.Journal.close();
    f.Sessions.close();
  });

  it('refreshes history independently of account/book and aggregates shared trade_id fragments before deduplication', async () => {
    const f = await createFixture();
    const trade = {
      account: 'subaccount',
      market,
      source: 'OrderFill' as const,
      trade_id: 'shared',
      order_id: 'venue',
      client_order_id: f.intent.clientOrderId,
      price: 100_000,
      size: 0.0002,
      fee_amount: 0,
      is_rebate: false,
      transaction_unix_ms: 1_500,
    };
    let trades = [trade];
    const Reader = {
      readOrderHistory: () => Promise.resolve([]),
      readTradeHistory: () => Promise.resolve([]),
      readOrderHistoryExhaustive: vi.fn(() =>
        Promise.resolve([
          {
            market,
            client_order_id: f.intent.clientOrderId,
            order_id: 'venue',
            orig_size: 0.001,
            price: 100_000,
            is_buy: true,
          },
        ]),
      ),
      readTradeHistoryExhaustive: vi.fn(() => Promise.resolve(trades)),
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_NETWORK: 'mainnet', DECIBEL_SUBACCOUNT_ADDRESS: 'subaccount' },
      () => 2_000,
      makeDecibelActivityBaselineFixtureV1,
    );
    const first = await Source.readAuthenticatedFillLedger(1_000);
    expect(first.ledger.actualExternalMakerVolumeUsd).toBe(20);
    const partial = synchronizeDecibelSessionAccountingV1(
      f.Journal,
      first.ledger,
      f.session.sessionId,
      1_000,
      100_000,
    );
    expect(partial.totalExecutedVolumeUsd).toBe(20);
    trades = [trade, trade, { ...trade, size: 0.0003 }];
    const fragments = aggregateDecibelTradeHistoryFragmentsV1(trades);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.size).toBe(0.0005);
    const fresh = await Source.readAuthenticatedFillLedger(1_000);
    expect(fresh.ledger.actualExternalMakerVolumeUsd).toBe(50);
    for (let i = 0; i < 2; i++) {
      const metrics = synchronizeDecibelSessionAccountingV1(
        f.Journal,
        fresh.ledger,
        f.session.sessionId,
        1_000,
        100_000,
      );
      expect(metrics.makerVolumeUsd).toBe(50);
      expect(metrics.fillCount).toBe(2);
    }
    const lagging = synchronizeDecibelSessionAccountingV1(
      f.Journal,
      first.ledger,
      f.session.sessionId,
      1_000,
      100_000,
    );
    expect(lagging.totalExecutedVolumeUsd).toBe(50);
    f.Journal.close();
    f.Sessions.close();
  });

  it('rejects a new PLACE at the execution boundary when a fill crosses target during admission', async () => {
    const f = await createFixture();
    const place = vi.fn();
    const Lifecycle = new decibel_execution_lifecycle_v1(
      f.Journal,
      { placePostOnlyLimit: place, cancelExactOrder: vi.fn() },
      {
        maxPlaceAttemptsPerMinute: 10,
        maxCancelAttemptsPerMinute: 10,
        maxTotalMutationAttemptsPerMinute: 20,
        maxConsecutiveUnknownOutcomes: 1,
      },
      () => 2_000,
      async () => {
        await Promise.resolve();
        const reached = applyDecibelActualFillTruthV1(f.empty, f.fill('crossing', 50));
        const metrics = synchronizeDecibelSessionAccountingV1(
          f.Journal,
          reached,
          f.session.sessionId,
          1_000,
          100_000,
        );
        if (requestDecibelSessionTargetUnwindV1(f.Controller, f.session.sessionId, metrics))
          throw new execution_preflight_rejection_v1('SESSION_TARGET_OR_UNWIND_PLACE_BLOCKED');
      },
    );
    await expect(Lifecycle.submit(f.intent, { now: 2_000 })).rejects.toMatchObject({
      rejectionCode: 'SESSION_TARGET_OR_UNWIND_PLACE_BLOCKED',
    });
    expect(place).not.toHaveBeenCalled();
    expect(f.Journal.mutationAttemptsSince(0)).toBe(0);
    f.Journal.close();
    f.Sessions.close();
  });
  it('persists minimum-order unwind across delayed fills, restart and idempotent completion', async () => {
    const f = await createFixture();
    const volume = { makerVolumeUsd: 49.78, totalExecutedVolumeUsd: 49.78 };
    expect(requestDecibelSessionTargetUnwindV1(f.Controller, f.session.sessionId, volume, 10)).toBe(
      true,
    );
    expect(f.Sessions.getActive()).toMatchObject({
      status: 'STOPPING',
      unwindReason: 'TARGET_UNREACHABLE_MINIMUM_ORDER',
    });
    expect(f.stop).not.toHaveBeenCalled();
    const Controller = new decibel_production_session_controller_v1(
      f.Sessions,
      f.Settings,
      f.start,
      () => 3_000,
      undefined,
      undefined,
      f.Owner,
    );
    await Controller.recoverStartup();
    expect(
      requestDecibelSessionTargetUnwindV1(
        Controller,
        f.session.sessionId,
        {
          makerVolumeUsd: 50.1,
          totalExecutedVolumeUsd: 50.1,
        },
        10,
      ),
    ).toBe(true);
    expect(f.Sessions.getActive()?.unwindReason).toBe('TARGET_UNREACHABLE_MINIMUM_ORDER');
    const accounting = {
      makerVolumeUsd: 50.1,
      takerVolumeUsd: 0,
      totalExecutedVolumeUsd: 50.1,
      fillCount: 3,
      finalPositionBase: 0,
      unresolvedExecutionCount: 0,
    };
    for (let replay = 0; replay < 2; replay++) {
      expect(
        Controller.completeUnwind(
          f.session.sessionId,
          accounting,
          'TARGET_UNREACHABLE_MINIMUM_ORDER',
        ),
      ).toMatchObject({ status: 'ENDED', stopReason: 'TARGET_UNREACHABLE_MINIMUM_ORDER' });
    }
    f.Journal.close();
    f.Sessions.close();
  });

  it('does not confuse pending reservations or missing minimum evidence with an unreachable target', () => {
    expect(getDecibelSessionTargetTerminalReasonV1(50, 30, 10)).toBe(null);
    expect(getDecibelSessionTargetTerminalReasonV1(50, 40, 10)).toBe(null);
    expect(getDecibelSessionTargetTerminalReasonV1(50, 49.78)).toBe(null);
    expect(getDecibelSessionTargetTerminalReasonV1(50, 49.78, 10)).toBe(
      'TARGET_UNREACHABLE_MINIMUM_ORDER',
    );
    expect(getDecibelSessionTargetTerminalReasonV1(50, 50, 10)).toBe('TARGET_VOLUME_REACHED');
    expect(getDecibelSessionTargetTerminalReasonV1(0, 0, 10)).toBe(null);
  });
});

describe('target unwind reasons', () => {
  it('treats only target reasons as drain-through-TP endings', () => {
    expect(isDecibelTargetUnwindReasonV1('TARGET_VOLUME_REACHED')).toBe(true);
    expect(isDecibelTargetUnwindReasonV1('TARGET_UNREACHABLE_MINIMUM_ORDER')).toBe(true);
    for (const reason of ['SESSION_END', 'MAX_LOSS_REACHED', 'OPERATOR_END', null, undefined])
      expect(isDecibelTargetUnwindReasonV1(reason)).toBe(false);
  });
});
