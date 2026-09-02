import { describe, expect, it } from 'vitest';

import {
  evaluateDecibelMcpContinuousShadowV1,
  summarizeDecibelMcpContinuousShadowV1,
  type decibel_continuous_shadow_config_v1,
} from '../src/decibel_mcp_mainnet_continuous_shadow_v1.js';
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
  } = {},
) {
  const initial = input.initial ?? snapshot();
  return evaluateDecibelMcpContinuousShadowV1({
    initial,
    final: input.final ?? initial,
    previousOrder: input.previous ?? null,
    config: Config,
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
});
