import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { decibel_post_only_limit_intent_v1 } from '../src/decibel_execution_adapter_v1.js';
import {
  buildDecibelMcpMainnetReadOnlyEnvironmentV1,
  decibel_mcp_execution_adapter_v1,
} from '../src/decibel_mcp_execution_adapter_v1.js';
import { decibel_mcp_execution_journal_v1 } from '../src/decibel_mcp_execution_journal_v1.js';
import {
  parseDecibelMcpToolsListV1,
  probeDecibelMcpMainnetCapabilitiesV1,
} from '../src/decibel_mcp_capability_probe_v1.js';
import {
  classifyDecibelMcpProcessExitV1,
  createDecibelMcpTimeoutErrorV1,
  decibel_mcp_stderr_capture_v1,
  decibel_mcp_stdout_framer_v1,
  decibel_mock_mcp_transport_v1,
} from '../src/decibel_mcp_execution_transport_v1.js';
import { decibel_mock_execution_adapter_v1 } from '../src/decibel_mock_execution_adapter_v1.js';
import { decibel_mock_passive_recycling_v1 } from '../src/decibel_mock_passive_recycling_v1.js';

const Intent: decibel_post_only_limit_intent_v1 = {
  symbol: 'BTC/USD',
  type: 'LIMIT',
  postOnly: true,
  timeInForce: 'POST_ONLY',
  side: 'BUY',
  price: 100,
  quantity: 0.1,
  tickSize: 0.5,
  lotSize: 0.01,
  minimumNotionalUsd: 5,
  maximumNotionalUsd: 20,
  cycleSequence: 1,
  strategyState: 'FLAT',
  createdAt: 1_000,
};

const ToolNames = [
  'get_positions',
  'get_orders',
  'get_trade_history',
  'get_order_history',
  'get_orderbook',
  'get_price',
  'place_limit_order',
  'cancel_order',
];
const Tools = {
  tools: ToolNames.map((name) => ({
    name,
    description: `${name} schema`,
    inputSchema: {
      type: 'object',
      properties:
        name === 'place_limit_order'
          ? {
              symbol: { type: 'string' },
              side: { type: 'string', enum: ['buy', 'sell'] },
              size: { type: 'number' },
              price: { type: 'number' },
              timeInForce: { type: 'string', enum: ['post-only'] },
            }
          : name === 'cancel_order'
            ? { orderId: { type: 'string' }, symbol: { type: 'string' } }
            : { symbol: { type: 'string' } },
      required: name === 'cancel_order' ? ['orderId', 'symbol'] : ['symbol'],
    },
  })),
};

function mainnetAdapter() {
  const journal = new decibel_mcp_execution_journal_v1(
    join(mkdtempSync(join(tmpdir(), 'mcp-shadow-')), 'journal.sqlite'),
  );
  const transport = new decibel_mock_mcp_transport_v1((name) =>
    name === '__tools_list__' ? Tools : [],
  );
  const adapter = new decibel_mcp_execution_adapter_v1(
    { DECIBEL_NETWORK: 'mainnet', DECIBEL_NODE_API_KEY: 'secret' },
    transport,
    journal,
    'READ_ONLY_MAINNET',
  );
  return { adapter, transport, journal };
}

describe('Decibel MCP Mainnet Shadow Execution V1', () => {
  it('frames split and multiple stdout messages while tolerating notifications', () => {
    const messages: unknown[] = [];
    const malformed: string[] = [];
    const framer = new decibel_mcp_stdout_framer_v1(
      (message) => messages.push(message),
      (line) => malformed.push(line),
    );
    framer.accept('{"jsonrpc":"2.0","method":"notice"}\n{"jsonrpc":"2.0","id":2,');
    framer.accept('"result":{"ok":true}}\n{"jsonrpc":"2.0","id":1,"result":{}}\n');
    expect(messages).toHaveLength(3);
    expect((messages[1] as { id: number }).id).toBe(2);
    expect((messages[2] as { id: number }).id).toBe(1);
    expect(malformed).toEqual([]);
  });

  it('classifies malformed stdout and bounds/redacts non-fatal stderr', () => {
    const malformed: string[] = [];
    const framer = new decibel_mcp_stdout_framer_v1(
      () => undefined,
      (line) => malformed.push(line),
    );
    framer.accept('not-json\n');
    expect(malformed).toEqual(['not-json']);
    const stderr = new decibel_mcp_stderr_capture_v1(
      {
        DECIBEL_NODE_API_KEY: 'node-secret',
        DECIBEL_PRIVATE_KEY: 'private-secret',
        DECIBEL_SUBACCOUNT_ADDRESS: 'sub-secret',
      },
      64,
    );
    stderr.append(`warning ${'x'.repeat(100)} node-secret private-secret sub-secret`);
    expect(stderr.retainedBytes()).toBeLessThanOrEqual(64);
    expect(stderr.observed()).toBe(true);
    const diagnostic = stderr.sanitizedTail();
    expect(diagnostic).not.toContain('node-secret');
    expect(diagnostic).not.toContain('private-secret');
    expect(diagnostic).not.toContain('sub-secret');
  });

  it('does not classify observed stderr as a timeout cause', () => {
    const error = createDecibelMcpTimeoutErrorV1('initialize');
    expect(error.message).toBe('MCP_TOOL_TIMEOUT:initialize');
    expect(error.message).not.toContain('STDERR_PRESENT');
  });

  it('distinguishes process exit before initialize from a later process exit', () => {
    expect(classifyDecibelMcpProcessExitV1(false, 1, null)).toBe(
      'MCP_PROCESS_EXIT_BEFORE_INITIALIZE:1:NONE',
    );
    expect(classifyDecibelMcpProcessExitV1(true, 1, 'SIGTERM')).toBe(
      'MCP_PROCESS_EXITED:1:SIGTERM',
    );
  });

  it('allows mainnet reads but blocks placement and cancel before tools/call', async () => {
    const { adapter, transport, journal } = mainnetAdapter();
    await adapter.getPositions();
    expect(transport.calls.map((call) => call.name)).toEqual(['get_positions']);
    await expect(adapter.placePostOnlyLimit(Intent)).rejects.toThrow(
      'MAINNET_MCP_MUTATION_DISABLED',
    );
    await expect(adapter.cancelOrder({ orderId: 'x', symbol: 'BTC/USD' })).rejects.toThrow(
      'MAINNET_MCP_MUTATION_DISABLED',
    );
    expect(
      transport.calls.filter((call) => ['place_limit_order', 'cancel_order'].includes(call.name)),
    ).toHaveLength(0);
    journal.close();
  });

  it('strips private key from the mainnet child environment', () => {
    const result = buildDecibelMcpMainnetReadOnlyEnvironmentV1({
      DECIBEL_NETWORK: 'mainnet',
      DECIBEL_NODE_API_KEY: 'node',
      DECIBEL_PRIVATE_KEY: 'never-pass',
    });
    expect(result.DECIBEL_PRIVATE_KEY).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('never-pass');
  });

  it('parses tools/list and captures mutation schemas without calling them', async () => {
    expect(parseDecibelMcpToolsListV1(Tools)).toHaveLength(8);
    const transport = new decibel_mock_mcp_transport_v1((name) =>
      name === '__tools_list__' ? Tools : { authenticated: true },
    );
    const result = await probeDecibelMcpMainnetCapabilitiesV1({ transport, observedAt: 1 });
    expect(result.body.placeLimitOrderSchema.fields).toHaveProperty('timeInForce');
    expect(result.body.cancelOrderSchema.required).toEqual(['orderId', 'symbol']);
    expect(result.mutationCallCount).toBe(0);
    expect(transport.calls.some((call) => call.name === 'place_limit_order')).toBe(false);
  });

  it('fails visibly when an expected schema is absent', async () => {
    const transport = new decibel_mock_mcp_transport_v1((name) =>
      name === '__tools_list__' ? { tools: Tools.tools.slice(0, -1) } : {},
    );
    await expect(
      probeDecibelMcpMainnetCapabilitiesV1({ transport, observedAt: 1 }),
    ).rejects.toThrow('MCP_EXPECTED_TOOL_SCHEMA_MISSING');
  });

  it('runs a UI-free autonomous mock entry/recycle cycle with idempotent fills', async () => {
    const adapter = new decibel_mock_execution_adapter_v1();
    const cycle = new decibel_mock_passive_recycling_v1(adapter);
    const entry = await cycle.place(Intent);
    const entryFill = {
      tradeId: 'trade-1',
      orderId: entry.orderId,
      clientOrderId: entry.clientOrderId,
      side: 'BUY' as const,
      size: 0.1,
      price: 100,
      transactionVersion: '1',
      source: 'OrderFill' as const,
      makerStatus: 'PROVEN' as const,
    };
    expect(cycle.applyFill(entryFill)).toBe(true);
    expect(cycle.applyFill(entryFill)).toBe(false);
    expect(cycle.state).toBe('LONG_RECYCLE');
    expect(cycle.requiredSide()).toBe('SELL');
    const recycle = await cycle.place({
      ...Intent,
      side: 'SELL',
      strategyState: 'LONG_RECYCLE',
      createdAt: 2_000,
    });
    expect(
      cycle.applyFill({
        ...entryFill,
        tradeId: 'trade-2',
        orderId: recycle.orderId,
        clientOrderId: recycle.clientOrderId,
        side: 'SELL',
        transactionVersion: '2',
      }),
    ).toBe(true);
    expect(cycle.inventory).toBe(0);
    expect(cycle.state).toBe('CYCLE_COMPLETED');
    expect(cycle.strategyVolume).toBe(20);
  });

  it('excludes out-of-band fills from strategy volume and supports SHORT recycle direction', async () => {
    const adapter = new decibel_mock_execution_adapter_v1();
    const cycle = new decibel_mock_passive_recycling_v1(adapter);
    expect(
      cycle.applyFill({
        tradeId: 'external',
        orderId: 'unknown',
        clientOrderId: 'unknown',
        side: 'BUY',
        size: 1,
        price: 100,
        transactionVersion: '1',
        source: 'OrderFill',
        makerStatus: 'PROVEN',
      }),
    ).toBe(false);
    const sell = await cycle.place({ ...Intent, side: 'SELL' });
    cycle.applyFill({
      tradeId: 'known',
      orderId: sell.orderId,
      clientOrderId: sell.clientOrderId,
      side: 'SELL',
      size: 0.1,
      price: 100,
      transactionVersion: '2',
      source: 'OrderFill',
      makerStatus: 'PROVEN',
    });
    expect(cycle.requiredSide()).toBe('BUY');
    expect(cycle.strategyVolume).toBe(10);
  });
});
