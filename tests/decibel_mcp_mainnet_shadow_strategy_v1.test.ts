import { describe, expect, it } from 'vitest';

import {
  assertDecibelMcpShadowStateUnchangedV1,
  readDecibelMcpMainnetShadowStateV1,
} from '../src/decibel_mcp_mainnet_shadow_state_v1.js';
import { buildDecibelMcpMainnetShadowOrderV1 } from '../src/decibel_mcp_mainnet_shadow_order_v1.js';
import {
  decibel_mock_mcp_transport_v1,
  resolveDecibelMcpLauncherV1,
} from '../src/decibel_mcp_execution_transport_v1.js';

const schema = {
  required: ['side', 'size', 'symbol', 'price'],
  fields: {
    side: { type: 'string', enum: ['buy', 'sell', 'long', 'short'] },
    timeInForce: { type: 'string', enum: ['gtc', 'post-only', 'ioc'] },
  },
};

function fixture(positionRows: unknown[] = [], orderRows: unknown[] = []) {
  const calls: string[] = [];
  const transport = new decibel_mock_mcp_transport_v1((name) => {
    calls.push(name);
    if (name === 'get_markets')
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              markets: [
                {
                  market_addr: '0xforeign',
                  market_name: 'SOL/USD',
                  tick_size: 0.01,
                  lot_size: 0.01,
                  min_size: 0.01,
                  min_notional: 10,
                },
                {
                  market_addr: '0xbtc',
                  market_name: 'BTC/USD',
                  tick_size: 0.1,
                  lot_size: 0.00001,
                  min_size: 0.00001,
                  min_notional: 10,
                },
              ],
            }),
          },
        ],
      };
    if (name === 'get_positions')
      return { content: [{ type: 'text', text: JSON.stringify({ positions: positionRows }) }] };
    if (name === 'get_orders')
      return {
        content: [{ type: 'text', text: JSON.stringify({ orders: { items: orderRows } }) }],
      };
    if (name === 'get_trade_history' || name === 'get_order_history')
      return { content: [{ type: 'text', text: JSON.stringify({ items: [] }) }] };
    if (name === 'get_orderbook')
      return {
        content: [
          { type: 'text', text: JSON.stringify({ bids: [[70000, 1]], asks: [[70001, 1]] }) },
        ],
      };
    if (name === 'get_price') return { content: [{ type: 'text', text: '{"price":70000.5}' }] };
    return {};
  });
  return { transport, calls };
}

describe('Decibel MCP Mainnet Shadow Autonomous Strategy V1', () => {
  it('resolves BTC by exact get_markets identity and keeps foreign position separate', async () => {
    const { transport } = fixture([
      { market: '0xforeign', size: 2 },
      { market: '0xbtc', size: 0.001 },
    ]);
    const state = await readDecibelMcpMainnetShadowStateV1({ transport, now: () => 1 });
    expect(state.btcMarket.address).toBe('0xbtc');
    expect(state.final.btcPositionBase).toBe(0.001);
    expect(state.final.foreignPositions).toHaveLength(1);
  });

  it('never treats positions[0] or an unknown address as BTC', async () => {
    const { transport } = fixture([{ market: '0xunknown', size: 99 }]);
    const state = await readDecibelMcpMainnetShadowStateV1({ transport, now: () => 1 });
    expect(state.final.btcPositionBase).toBe(0);
    expect(state.final.foreignPositions).toHaveLength(1);
  });

  it('classifies BTC and foreign orders separately', async () => {
    const { transport } = fixture(
      [],
      [
        { market: '0xbtc', order_id: 'btc-order' },
        { market: '0xforeign', order_id: 'foreign-order' },
      ],
    );
    const state = await readDecibelMcpMainnetShadowStateV1({ transport, now: () => 1 });
    expect(state.final.btcOpenOrderIds).toEqual(['btc-order']);
    expect(state.final.foreignOrders).toHaveLength(1);
  });

  it.each([
    ['BUY', 70000, 'buy'],
    ['SELL', 70001, 'sell'],
  ] as const)(
    'builds schema-valid, aligned PostOnly payload at final BBO',
    (side, price, expected) => {
      const result = buildDecibelMcpMainnetShadowOrderV1({
        side,
        price,
        lotSize: 0.00001,
        minimumSize: 0.00001,
        minimumNotionalUsd: 10,
        targetNotionalUsd: 21,
        maximumNotionalUsd: 25,
        cycleSequence: 1,
        seedHash: 'seed',
        schema,
      });
      expect(result.payload.side).toBe(expected);
      expect(result.payload.price).toBe(price);
      expect(result.payload.timeInForce).toBe('post-only');
      expect(result.payload.size / 0.00001).toBeCloseTo(Math.round(result.payload.size / 0.00001));
    },
  );

  it('blocks when authenticated state changes during the double read', () => {
    const base = { btcPositionBase: 0, btcOpenOrderIds: [], btcFillIds: [], foreignOrders: [] };
    expect(() =>
      assertDecibelMcpShadowStateUnchangedV1(
        base as never,
        { ...base, btcPositionBase: 1 } as never,
      ),
    ).toThrow('MCP_SHADOW_STATE_CHANGED');
  });

  it('selects the configured Node 22 sidecar without changing global PATH', () => {
    const executable = 'C:\\portable\\node-v22.23.2-win-x64\\node.exe';
    const launcher = resolveDecibelMcpLauncherV1({ DECIBEL_MCP_NODE_EXECUTABLE: executable });
    expect(launcher.executable).toBe(executable);
    expect(launcher.arguments[0]).toContain('node_modules');
    expect(launcher.sidecar).toBe(true);
  });

  it('uses read tools only and has no placement/cancel dependency', async () => {
    const { transport, calls } = fixture();
    await readDecibelMcpMainnetShadowStateV1({ transport, now: () => 1 });
    expect(calls).not.toContain('place_limit_order');
    expect(calls).not.toContain('cancel_order');
  });
});
