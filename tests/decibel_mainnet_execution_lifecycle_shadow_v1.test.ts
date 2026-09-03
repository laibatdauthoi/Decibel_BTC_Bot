import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import { integrateDecibelMainnetExecutionLifecycleShadowV1 } from '../src/decibel_mainnet_execution_lifecycle_shadow_v1.js';
import {
  evaluateDecibelMcpContinuousShadowV1,
  type decibel_continuous_shadow_config_v1,
} from '../src/decibel_mcp_mainnet_continuous_shadow_v1.js';
import type { decibel_mcp_shadow_snapshot_v1 } from '../src/decibel_mcp_mainnet_shadow_state_v1.js';

const Config: decibel_continuous_shadow_config_v1 = {
  subaccount: '0xsub',
  marketAddress: '0xbtc',
  checkpointHash: 'hash',
  cycleSequence: 1,
  tickSize: 0.1,
  lotSize: 0.00001,
  minimumSize: 0.00002,
  minimumNotionalUsd: 10,
  targetNotionalUsd: 21,
  maximumNotionalUsd: 25,
  repricePolicy: 'BEHIND_5_TICKS',
  schema: {
    required: ['side', 'size', 'symbol', 'price'],
    fields: {
      side: { type: 'string', enum: ['buy', 'sell'] },
      timeInForce: { type: 'string', enum: ['post-only'] },
    },
  },
};
const snapshot = (
  input: {
    position?: number;
    bid?: number;
    orders?: Record<string, unknown>[];
    foreign?: Record<string, unknown>[];
    fills?: string[];
  } = {},
): decibel_mcp_shadow_snapshot_v1 => ({
  observedAt: 1,
  btcMarketAddress: '0xbtc',
  btcPositions: [],
  foreignPositions: [],
  btcOrders: input.orders ?? [],
  foreignOrders: input.foreign ?? [],
  btcTrades: [],
  foreignTrades: [],
  btcOrderHistory: [],
  btcPositionBase: input.position ?? 0,
  btcOpenOrderIds: (input.orders ?? []).map((row) => String(row.orderId)),
  btcFillIds: input.fills ?? [],
  book: { bestBid: input.bid ?? 70_000, bestAsk: (input.bid ?? 70_000) + 1, observedAt: 1 },
  price: {},
});
const journal = () =>
  new decibel_execution_lifecycle_journal_v1(
    join(mkdtempSync(join(tmpdir(), 'integration-shadow-')), 'journal.sqlite'),
  );
function integrate(
  input: {
    initial?: decibel_mcp_shadow_snapshot_v1;
    final?: decibel_mcp_shadow_snapshot_v1;
    previous?: ReturnType<typeof evaluateDecibelMcpContinuousShadowV1>['shadowOrderAfter'];
    journal?: decibel_execution_lifecycle_journal_v1;
  } = {},
) {
  const initial = input.initial ?? snapshot();
  const final = input.final ?? initial;
  const evaluation = evaluateDecibelMcpContinuousShadowV1({
    initial,
    final,
    previousOrder: input.previous ?? null,
    config: Config,
    timestamp: 1_000,
  });
  const Journal = input.journal ?? journal();
  return {
    Journal,
    evaluation,
    result: integrateDecibelMainnetExecutionLifecycleShadowV1({
      mode: 'mainnet-integration-shadow',
      journal: Journal,
      evaluation,
      initial,
      final,
      config: Config,
      sessionId: 'session',
      cycleSequence: 1,
    }),
  };
}

describe('Decibel Mainnet execution lifecycle integration shadow V1', () => {
  it('maps real state to a durable blocked PLACE without invoking an executor', () => {
    const value = integrate();
    expect(value.result).toMatchObject({
      classification: 'MUTATION_BLOCKED_MAINNET_SHADOW',
      intentCreated: true,
      executorInvoked: false,
      liveExecutionEnabled: false,
    });
    expect(value.Journal.countIntents()).toBe(1);
    value.Journal.close();
  });
  it('holds an equivalent semantic intent idempotently', () => {
    const Journal = journal();
    const first = integrate({ journal: Journal });
    const second = integrate({ journal: Journal });
    expect(second.result.classification).toBe('IDEMPOTENT_HOLD');
    expect(Journal.countIntents()).toBe(1);
    first.Journal.close();
  });
  it('BEHIND_5_TICKS HOLD creates no replacement intent', () => {
    const firstState = snapshot();
    const firstEval = evaluateDecibelMcpContinuousShadowV1({
      initial: firstState,
      final: firstState,
      previousOrder: null,
      config: Config,
      timestamp: 1,
    });
    const result = integrate({ initial: firstState, previous: firstEval.shadowOrderAfter });
    expect(result.evaluation.action).toBe('HOLD');
    expect(result.Journal.countIntents()).toBe(0);
    result.Journal.close();
  });
  it('double-read state change blocks intent', () => {
    const result = integrate({ initial: snapshot(), final: snapshot({ position: 0.001 }) });
    expect(result.result).toMatchObject({
      classification: 'BLOCKED',
      blocker: 'EXECUTION_STATE_CHANGED_BEFORE_INTENT',
    });
    expect(result.Journal.countIntents()).toBe(0);
    result.Journal.close();
  });
  it('real BTC order blocks a new place', () => {
    const state = snapshot({ orders: [{ orderId: 'btc-order', market: '0xbtc' }] });
    const result = integrate({ initial: state });
    expect(result.result.blocker).toBe('REAL_BTC_ORDER_PRESENT');
    result.Journal.close();
  });
  it('foreign order blocks under strict exclusivity', () => {
    const state = snapshot({ foreign: [{ orderId: 'foreign-order', market: '0xother' }] });
    const result = integrate({ initial: state });
    expect(result.result.blocker).toBe('FOREIGN_MARKET_ORDER_PRESENT');
    result.Journal.close();
  });
  it('restart with the same journal creates no duplicate intent', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'integration-restart-')), 'journal.sqlite');
    let Journal = new decibel_execution_lifecycle_journal_v1(path);
    integrate({ journal: Journal });
    Journal.close();
    Journal = new decibel_execution_lifecycle_journal_v1(path);
    const resumed = integrate({ journal: Journal });
    expect(resumed.result.classification).toBe('IDEMPOTENT_HOLD');
    expect(Journal.countIntents()).toBe(1);
    Journal.close();
  });
  it('rejects any mode other than explicit integration shadow', () => {
    const state = snapshot();
    const evaluation = evaluateDecibelMcpContinuousShadowV1({
      initial: state,
      final: state,
      previousOrder: null,
      config: Config,
      timestamp: 1,
    });
    const Journal = journal();
    expect(() =>
      integrateDecibelMainnetExecutionLifecycleShadowV1({
        mode: 'mainnet',
        journal: Journal,
        evaluation,
        initial: state,
        final: state,
        config: Config,
        sessionId: 's',
        cycleSequence: 1,
      }),
    ).toThrow('DECIBEL_EXECUTION_MODE_MAINNET_INTEGRATION_SHADOW_REQUIRED');
    Journal.close();
  });
});
