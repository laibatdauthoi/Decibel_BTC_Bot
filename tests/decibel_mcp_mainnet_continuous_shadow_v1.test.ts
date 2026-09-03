import { describe, expect, it } from 'vitest';

import {
  buildDecibelMcpShadowReadFailureV1,
  classifyDecibelMcpShadowReadFailureV1,
  decideDecibelShadowRepriceV1,
  evaluateDecibelMcpContinuousShadowV1,
  summarizeDecibelMcpContinuousShadowV1,
  type decibel_continuous_shadow_config_v1,
} from '../src/decibel_mcp_mainnet_continuous_shadow_v1.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseShadowRepriceSourceJsonlV1 } from '../src/decibel_shadow_reprice_policy_experiment_v1.js';
import type { decibel_mcp_shadow_snapshot_v1 } from '../src/decibel_mcp_mainnet_shadow_state_v1.js';

const Schema = {
  required: ['side', 'size', 'symbol', 'price'],
  fields: {
    side: { type: 'string', enum: ['buy', 'sell', 'long', 'short'] },
    timeInForce: { type: 'string', enum: ['gtc', 'post-only', 'ioc'] },
  },
};
const Config: decibel_continuous_shadow_config_v1 = {
  subaccount: '0xsub',
  marketAddress: '0xbtc',
  checkpointHash: 'e69d23751f85dbfab33a41c4a8827364f8cf323ffff840f77c29647b515d4086',
  cycleSequence: 1,
  tickSize: 0.1,
  lotSize: 0.00001,
  minimumSize: 0.00002,
  minimumNotionalUsd: 10,
  targetNotionalUsd: 21,
  maximumNotionalUsd: 25,
  schema: Schema,
};

function snapshot(
  input: {
    position?: number;
    bid?: number;
    ask?: number;
    btcOrders?: Record<string, unknown>[];
    foreignOrders?: Record<string, unknown>[];
    fillIds?: string[];
  } = {},
): decibel_mcp_shadow_snapshot_v1 {
  return {
    observedAt: 1,
    btcMarketAddress: '0xbtc',
    btcPositions: [],
    foreignPositions: [{ market: '0xdell', size: 0.022 }],
    btcOrders: input.btcOrders ?? [],
    foreignOrders: input.foreignOrders ?? [],
    btcTrades: [],
    foreignTrades: [],
    btcOrderHistory: [],
    btcPositionBase: input.position ?? 0,
    btcOpenOrderIds: (input.btcOrders ?? []).map((order) => String(order.orderId)),
    btcFillIds: input.fillIds ?? [],
    book: { bestBid: input.bid ?? 70_000, bestAsk: input.ask ?? 70_001, observedAt: 1 },
    price: { price: 70_000.5 },
  };
}

function evaluate(
  input: {
    initial?: decibel_mcp_shadow_snapshot_v1;
    final?: decibel_mcp_shadow_snapshot_v1;
    previous?: ReturnType<typeof evaluateDecibelMcpContinuousShadowV1>['shadowOrderAfter'];
    timestamp?: number;
    config?: decibel_continuous_shadow_config_v1;
  } = {},
) {
  const initial = input.initial ?? snapshot();
  return evaluateDecibelMcpContinuousShadowV1({
    initial,
    final: input.final ?? initial,
    previousOrder: input.previous ?? null,
    config: input.config ?? Config,
    timestamp: input.timestamp ?? 1_000,
  });
}

describe('Decibel MCP Mainnet Continuous Shadow Market Maker V1', () => {
  it('FLAT creates a schema-valid PostOnly WOULD_PLACE with no venue identity', () => {
    const result = evaluate();
    expect(result.action).toBe('WOULD_PLACE');
    expect(result.mcpPayload).toMatchObject({ symbol: 'BTC/USD', timeInForce: 'post-only' });
    expect(result.shadowOrderAfter?.shadowOrderId).toMatch(/^shadow-/);
    expect(result.shadowOrderAfter).not.toHaveProperty('orderId');
  });

  it.each([
    [0.001, 'sell', 70_001],
    [-0.001, 'buy', 70_000],
  ] as const)('inventory recycling is one-sided at exact BBO', (position, side, price) => {
    const state = snapshot({ position });
    const result = evaluate({ initial: state });
    expect(result.desiredSide).toBe(side);
    expect(result.desiredPrice).toBe(price);
  });

  it('one-tick movement replaces while unchanged BBO is a semantic HOLD', () => {
    const first = evaluate();
    const held = evaluate({ previous: first.shadowOrderAfter, timestamp: 2_000 });
    expect(held.action).toBe('HOLD');
    expect(held.semanticNoOp).toBe(true);
    const moved = snapshot({ bid: 70_000.1, ask: 70_001.1 });
    const replaced = evaluate({
      initial: moved,
      previous: held.shadowOrderAfter,
      timestamp: 3_000,
    });
    expect(replaced.action).toBe('WOULD_REPLACE');
    expect(replaced.desiredPrice).not.toBe(first.desiredPrice);
  });

  it.each([
    ['buy', 100, 100, 100.1],
    ['sell', 100.1, 100, 100.1],
  ] as const)('%s at best holds under behind-five policy', (side, resting, bid, ask) => {
    expect(
      decideDecibelShadowRepriceV1({
        policy: 'BEHIND_5_TICKS',
        side,
        restingPrice: resting,
        desiredPrice: side === 'buy' ? bid : ask,
        bestBid: bid,
        bestAsk: ask,
        tickSize: 0.1,
      }).shouldReplace,
    ).toBe(false);
  });

  it.each(['buy', 'sell'] as const)('%s holds one through four ticks behind', (side) => {
    for (let ticks = 1; ticks <= 4; ticks += 1) {
      const desired = side === 'buy' ? 100 : 101;
      const resting = side === 'buy' ? desired - ticks / 10 : desired + ticks / 10;
      expect(
        decideDecibelShadowRepriceV1({
          policy: 'BEHIND_5_TICKS',
          side,
          restingPrice: resting,
          desiredPrice: desired,
          bestBid: 100,
          bestAsk: 101,
          tickSize: 0.1,
        }).shouldReplace,
      ).toBe(false);
    }
  });

  it.each(['buy', 'sell'] as const)('%s replaces at exactly five ticks behind', (side) => {
    const desired = side === 'buy' ? 100 : 101;
    const resting = side === 'buy' ? 99.5 : 101.5;
    const decision = decideDecibelShadowRepriceV1({
      policy: 'BEHIND_5_TICKS',
      side,
      restingPrice: resting,
      desiredPrice: desired,
      bestBid: 100,
      bestAsk: 101,
      tickSize: 0.1,
    });
    expect(decision).toMatchObject({ distanceTicks: 5, repriceReason: 'CHASE_BEHIND_5_TICKS' });
  });

  it.each([
    [100.1, 99.9, 100, 'SAFETY_CROSSING'],
    [100, 99.9, 100.1, 'SAFETY_INSIDE_SPREAD'],
  ] as const)('safety state overrides hysteresis', (resting, bid, ask, reason) => {
    expect(
      decideDecibelShadowRepriceV1({
        policy: 'BEHIND_5_TICKS',
        side: 'buy',
        restingPrice: resting,
        desiredPrice: bid,
        bestBid: bid,
        bestAsk: ask,
        tickSize: 0.1,
      }).repriceReason,
    ).toBe(reason);
  });

  it('historical replay through production decision policy reproduces frozen metrics', () => {
    const rows = parseShadowRepriceSourceJsonlV1(
      readFileSync(
        join(
          process.cwd(),
          'data/decibel_mcp_mainnet_continuous_shadow_v1_shadow-1788370116066.jsonl',
        ),
        'utf8',
      ),
    );
    let resting: { side: 'buy' | 'sell'; price: number; quantity: number } | null = null;
    let replacements = 0;
    const deviations: number[] = [];
    let safetyDelayed = 0;
    for (const item of rows) {
      if (resting === null)
        resting = {
          side: item.desiredSide,
          price: item.desiredPrice,
          quantity: item.desiredQuantity,
        };
      else {
        const decision = decideDecibelShadowRepriceV1({
          policy: 'BEHIND_5_TICKS',
          side: resting.side,
          restingPrice: resting.price,
          desiredPrice: item.desiredPrice,
          bestBid: item.bestBid,
          bestAsk: item.bestAsk,
          tickSize: 0.1,
        });
        if (decision.shouldReplace) {
          replacements += 1;
          resting = {
            side: item.desiredSide,
            price: item.desiredPrice,
            quantity: item.desiredQuantity,
          };
        } else if (
          decision.quoteRelation === 'CROSSING' ||
          decision.quoteRelation === 'INSIDE_SPREAD'
        )
          safetyDelayed += 1;
      }
      deviations.push(
        Math.abs(Math.round(item.desiredPrice * 10) - Math.round(resting.price * 10)),
      );
    }
    const sorted = [...deviations].sort((left, right) => left - right);
    expect(replacements).toBe(359);
    expect(sorted[Math.ceil(sorted.length * 0.95) - 1]).toBe(2);
    expect(Math.max(...deviations)).toBe(4);
    expect(safetyDelayed).toBe(0);
  });

  it.each([
    [{ btcOrders: [{ orderId: 'real-btc' }] }, 'REAL_BTC_ORDER_PRESENT'],
    [
      { foreignOrders: [{ orderId: 'real-dell', market: '0xdell' }] },
      'FOREIGN_MARKET_ORDER_PRESENT',
    ],
  ])('real orders block with distinct attribution', (stateInput, blocker) => {
    const state = snapshot(stateInput);
    const result = evaluate({ initial: state });
    expect(result.action).toBe('BLOCKED');
    expect(result.blockers).toContain(blocker);
  });

  it('DELL position and public market movement never alter BTC inventory or create fills', () => {
    const result = evaluate();
    expect(result.btcPositionBase).toBe(0);
    expect(result.shadowFillCount).toBe(0);
    expect(result.shadowMakerVolumeUsd).toBe(0);
    expect(result.shadowOrderAfter?.status).toBe('WOULD_BE_OPEN');
  });

  it('double-read position/fill/order changes block placement', () => {
    const result = evaluate({
      initial: snapshot(),
      final: snapshot({ fillIds: ['new-fill'] }),
    });
    expect(result.action).toBe('BLOCKED');
    expect(result.blockers).toContain('MCP_SHADOW_STATE_CHANGED');
  });

  it('summary records lifecycle statistics and zero execution economics', () => {
    const placed = evaluate();
    const held = evaluate({ previous: placed.shadowOrderAfter, timestamp: 2_000 });
    const movedState = snapshot({ bid: 70_000.1, ask: 70_001.1 });
    const replaced = evaluate({
      initial: movedState,
      previous: held.shadowOrderAfter,
      timestamp: 3_000,
    });
    const summary = summarizeDecibelMcpContinuousShadowV1({
      sessionId: 'session',
      startedAt: 1_000,
      endedAt: 4_000,
      evaluations: [placed, held, replaced],
      readFailureCount: 0,
      unhandledExceptionCount: 0,
    });
    expect(summary).toMatchObject({
      wouldPlaceCount: 1,
      wouldReplaceCount: 1,
      holdCount: 1,
      semanticNoOpCount: 1,
      shadowFillCount: 0,
      shadowMakerVolumeUsd: 0,
      mcpMutationCalls: 0,
      venueMutations: 0,
      mainnetShadowRuntimeReady: true,
    });
  });

  it.each([
    ['MCP_TOOL_TIMEOUT:get_orders', 'MCP_TOOL_TIMEOUT'],
    ['MCP_PROCESS_EXITED:1:NONE', 'MCP_PROCESS_EXIT'],
    ['MCP_JSON_RPC_ERROR:bad request', 'MCP_JSON_RPC_ERROR'],
    ['unclassified failure', 'UNKNOWN_READ_FAILURE'],
  ] as const)('classifies durable read failure %s', (message, expected) => {
    expect(classifyDecibelMcpShadowReadFailureV1(message)).toBe(expected);
  });

  it('builds sanitized failure evidence without fabricated market state', () => {
    const failure = buildDecibelMcpShadowReadFailureV1({
      error: new Error('MCP_TOOL_TIMEOUT:get_orders secret-key private-key'),
      environment: {
        DECIBEL_NODE_API_KEY: 'secret-key',
        DECIBEL_PRIVATE_KEY: 'private-key',
      },
      timestamp: 2_000,
      evaluationAttempt: 3,
      elapsedMs: 15_000,
      diagnostics: {
        processRunning: true,
        processStarted: true,
        processExited: false,
        exitCode: null,
        exitSignal: null,
        stderrObserved: true,
        stderrTailSanitized: 'warning secret-key',
        initializeResponse: true,
        protocolVersion: 'test',
        serverName: 'test',
        serverVersion: '1',
        toolsListResponse: true,
        stderrRetainedBytes: 10,
      },
    });
    expect(failure.message).toContain('MCP_TOOL_TIMEOUT');
    expect(JSON.stringify(failure)).not.toContain('secret-key');
    expect(JSON.stringify(failure)).not.toContain('private-key');
    expect(failure).not.toHaveProperty('bestBid');
    expect(failure.mutationCounters).toEqual({ mcpMutationCalls: 0, venueMutations: 0 });
  });

  it('summarizes attempts, classes, timestamps, consecutive failures, and failed readiness', () => {
    const placed = evaluate();
    const failures = [
      buildDecibelMcpShadowReadFailureV1({
        error: new Error('MCP_TOOL_TIMEOUT:get_orders'),
        environment: {},
        timestamp: 1_500,
        evaluationAttempt: 2,
        elapsedMs: 15_000,
      }),
      buildDecibelMcpShadowReadFailureV1({
        error: new Error('MCP_PROCESS_EXITED:1:NONE'),
        environment: {},
        timestamp: 1_600,
        evaluationAttempt: 3,
        elapsedMs: 1,
      }),
    ];
    const summary = summarizeDecibelMcpContinuousShadowV1({
      sessionId: 'failure-session',
      startedAt: 1_000,
      endedAt: 2_000,
      evaluations: [placed],
      readFailureCount: 2,
      unhandledExceptionCount: 0,
      readFailures: failures,
      evaluationAttempts: 3,
      maxConsecutiveReadFailures: 2,
      failureEvidencePath: 'failures.jsonl',
    });
    expect(summary).toMatchObject({
      evaluationAttempts: 3,
      successfulEvaluations: 1,
      readFailureCount: 2,
      readFailureClasses: { MCP_TOOL_TIMEOUT: 1, MCP_PROCESS_EXIT: 1 },
      firstReadFailureAt: 1_500,
      lastReadFailureAt: 1_600,
      maxConsecutiveReadFailures: 2,
      failureEvidencePath: 'failures.jsonl',
      mainnetShadowRuntimeReady: false,
    });
    expect(summary.evaluationAttempts).toBe(
      summary.successfulEvaluations + summary.readFailureCount,
    );
  });
});
