import 'dotenv/config';

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildDecibelMcpMainnetReadOnlyEnvironmentV1 } from './decibel_mcp_execution_adapter_v1.js';
import { selectDecibelAuthenticatedFlatEntrySideV1 } from './decibel_authenticated_passive_recycling_flat_entry_v1.js';
import {
  assertDecibelMcpShadowStateUnchangedV1,
  readDecibelMcpMainnetShadowStateV1,
} from './decibel_mcp_mainnet_shadow_state_v1.js';
import { buildDecibelMcpMainnetShadowOrderV1 } from './decibel_mcp_mainnet_shadow_order_v1.js';
import { decibel_stdio_mcp_transport_v1 } from './decibel_mcp_execution_transport_v1.js';

const ExpectedCheckpointHash = 'e69d23751f85dbfab33a41c4a8827364f8cf323ffff840f77c29647b515d4086';
const ExpectedCapabilityHash = '65a089c6cfeca5d7066a7e26b81a25a57fd49ce2d024d04e8ca884b4f69df5b0';
const ReportPath = resolve('research/decibel_mcp_mainnet_shadow_strategy_v1.json');

const numeric = (value: unknown) => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};

export async function runDecibelMcpMainnetShadowStrategyV1(environment: NodeJS.ProcessEnv) {
  if (environment.DECIBEL_NETWORK !== 'mainnet')
    throw new Error('MCP_MAINNET_READ_ONLY_NETWORK_REQUIRED');
  if (!environment.DECIBEL_NODE_API_KEY) throw new Error('MCP_NODE_API_KEY_REQUIRED');
  if (!environment.DECIBEL_SUBACCOUNT_ADDRESS) throw new Error('MCP_SUBACCOUNT_REQUIRED');
  const checkpoint = JSON.parse(
    readFileSync(resolve('research/decibel_authenticated_btc_resync_checkpoint_v1.json'), 'utf8'),
  ) as Record<string, unknown>;
  if (
    checkpoint.checkpointBodyHashSha256 !== ExpectedCheckpointHash ||
    checkpoint.currentPositionBase !== 0 ||
    checkpoint.cycleDisposition !== 'CYCLE_INTERRUPTED_BY_OUT_OF_BAND_ACTIVITY'
  )
    throw new Error('MCP_SHADOW_RESYNC_CHECKPOINT_INVALID');
  const capability = JSON.parse(
    readFileSync(resolve('research/decibel_mcp_mainnet_capabilities_v1.json'), 'utf8'),
  ) as {
    capabilityHash: string;
    placeLimitOrderSchema: Parameters<typeof buildDecibelMcpMainnetShadowOrderV1>[0]['schema'];
  };
  if (capability.capabilityHash !== ExpectedCapabilityHash)
    throw new Error('MCP_SHADOW_CAPABILITY_HASH_MISMATCH');
  const childEnvironment = buildDecibelMcpMainnetReadOnlyEnvironmentV1(environment);
  const transport = new decibel_stdio_mcp_transport_v1(childEnvironment);
  try {
    const state = await readDecibelMcpMainnetShadowStateV1({ transport, now: Date.now });
    assertDecibelMcpShadowStateUnchangedV1(state.initial, state.final);
    const final = state.final;
    const rawMetadata = state.btcMarket.raw;
    const priceDecimals = numeric(rawMetadata.price_decimals ?? rawMetadata.priceDecimals);
    const sizeDecimals = numeric(rawMetadata.size_decimals ?? rawMetadata.sizeDecimals);
    const rawTickSize = numeric(rawMetadata.tick_size ?? rawMetadata.tickSize);
    const rawLotSize = numeric(rawMetadata.lot_size ?? rawMetadata.lotSize);
    const rawMinimumSize = numeric(
      rawMetadata.min_size ??
        rawMetadata.minSize ??
        rawMetadata.minimum_size ??
        rawMetadata.minimumSize,
    );
    const tickSize =
      rawTickSize === null || priceDecimals === null ? null : rawTickSize / 10 ** priceDecimals;
    const lotSize =
      rawLotSize === null || sizeDecimals === null ? null : rawLotSize / 10 ** sizeDecimals;
    const minimumSize =
      rawMinimumSize === null || sizeDecimals === null ? null : rawMinimumSize / 10 ** sizeDecimals;
    const minimumNotionalUsd = Number(environment.DECIBEL_RECYCLING_MIN_NOTIONAL_USD ?? 10);
    if (
      tickSize === null ||
      lotSize === null ||
      minimumSize === null ||
      tickSize <= 0 ||
      lotSize <= 0 ||
      minimumSize <= 0 ||
      !Number.isFinite(minimumNotionalUsd) ||
      minimumNotionalUsd <= 0
    )
      throw new Error('MCP_SHADOW_BTC_METADATA_INCOMPLETE');
    const inventoryState =
      final.btcPositionBase > 0
        ? ('LONG_RECYCLE' as const)
        : final.btcPositionBase < 0
          ? ('SHORT_RECYCLE' as const)
          : ('FLAT' as const);
    let action: 'WOULD_PLACE' | 'WAIT' | 'BLOCKED' = 'WOULD_PLACE';
    let blocker: string | null = null;
    if (final.foreignOrders.length > 0) {
      action = 'BLOCKED';
      blocker = 'MCP_SHADOW_FOREIGN_MARKET_OPEN_ORDER';
    } else if (final.btcOrders.length > 0) action = 'WAIT';
    const cycleSequence = 1;
    const selection = selectDecibelAuthenticatedFlatEntrySideV1({
      subaccount: environment.DECIBEL_SUBACCOUNT_ADDRESS,
      marketAddress: state.btcMarket.address,
      resyncCheckpointBodyHash: ExpectedCheckpointHash,
      cycleSequence,
    });
    const side =
      inventoryState === 'LONG_RECYCLE'
        ? ('SELL' as const)
        : inventoryState === 'SHORT_RECYCLE'
          ? ('BUY' as const)
          : selection.selectedSide;
    const price = side === 'BUY' ? final.book.bestBid : final.book.bestAsk;
    const order =
      action === 'WOULD_PLACE'
        ? buildDecibelMcpMainnetShadowOrderV1({
            side,
            price,
            lotSize,
            minimumSize,
            minimumNotionalUsd,
            targetNotionalUsd: Number(environment.DECIBEL_RECYCLING_TARGET_NOTIONAL_USD ?? 21),
            maximumNotionalUsd: Number(environment.DECIBEL_RECYCLING_MAX_NOTIONAL_USD ?? 25),
            cycleSequence,
            seedHash: selection.sideSelectionSeedHash,
            schema: capability.placeLimitOrderSchema,
          })
        : null;
    const report = Object.freeze({
      identity: 'DECIBEL_MCP_MAINNET_SHADOW_AUTONOMOUS_STRATEGY_V1',
      network: 'mainnet',
      observedAt: Date.now(),
      btcMarketAddress: state.btcMarket.address,
      btcSymbol: state.btcMarket.symbol,
      mappings: state.mappings.map((item) => ({ address: item.address, symbol: item.symbol })),
      btcPositionBase: final.btcPositionBase,
      btcPositions: final.btcPositions,
      foreignPositions: final.foreignPositions,
      btcOpenOrders: final.btcOrders,
      foreignOrders: final.foreignOrders,
      btcFillIds: final.btcFillIds,
      foreignTradeCount: final.foreignTrades.length,
      inventoryState,
      action,
      blocker,
      cycleSequence,
      sideSelectionSeedHash: selection.sideSelectionSeedHash,
      payload: order?.payload ?? null,
      notionalUsd:
        order === null ? null : Number((order.payload.price * order.payload.size).toFixed(12)),
      schemaValid: order !== null,
      privateKeyPassedToMcp: false,
      mcpMutationCalls: 0,
      venueMutations: 0,
    });
    writeFileSync(ReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`DECIBEL_MCP_SHADOW_STRATEGY_READY=${action === 'WOULD_PLACE' ? 'YES' : 'NO'}`);
    console.log(`NETWORK=mainnet`);
    console.log(`BTC_MARKET_ADDRESS=${report.btcMarketAddress}`);
    console.log(`BTC_POSITION_BASE=${report.btcPositionBase}`);
    console.log(`INVENTORY_STATE=${inventoryState}`);
    console.log(`ACTION=${action}`);
    if (order !== null) {
      console.log(`SIDE=${order.payload.side}`);
      console.log(`SYMBOL=${order.payload.symbol}`);
      console.log(`PRICE=${order.payload.price}`);
      console.log(`SIZE=${order.payload.size}`);
      console.log(`NOTIONAL_USD=${report.notionalUsd}`);
      console.log(`TIME_IN_FORCE=${order.payload.timeInForce}`);
      console.log(`REDUCE_ONLY=${order.payload.reduceOnly}`);
      console.log(`CLIENT_ORDER_ID=${order.payload.clientOrderId}`);
      console.log(`CYCLE_SEQUENCE=${cycleSequence}`);
      console.log(`SIDE_SELECTION_SEED_HASH=${selection.sideSelectionSeedHash}`);
      console.log(`MCP_PAYLOAD_SCHEMA_VALID=YES`);
    }
    console.log(`MCP_MUTATION_CALLS=0`);
    console.log(`VENUE_MUTATIONS=0`);
    console.log(`REPORT=${ReportPath}`);
    console.log(`BLOCKER=${blocker ?? 'NONE'}`);
    return report;
  } finally {
    await transport.close().catch(() => undefined);
  }
}

if (process.argv[1]?.endsWith('run_decibel_mcp_mainnet_shadow_strategy_v1.ts')) {
  runDecibelMcpMainnetShadowStrategyV1(process.env).catch((error: unknown) => {
    console.error(`DECIBEL_MCP_SHADOW_STRATEGY_READY=NO`);
    console.error(`BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`);
    console.error(`MCP_MUTATION_CALLS=0`);
    console.error(`VENUE_MUTATIONS=0`);
    process.exitCode = 1;
  });
}
