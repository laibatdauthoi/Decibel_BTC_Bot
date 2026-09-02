import 'dotenv/config';

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildDecibelMcpMainnetReadOnlyEnvironmentV1 } from './decibel_mcp_execution_adapter_v1.js';
import {
  evaluateDecibelMcpContinuousShadowV1,
  summarizeDecibelMcpContinuousShadowV1,
  type decibel_continuous_shadow_config_v1,
  type decibel_continuous_shadow_evaluation_v1,
  type decibel_continuous_shadow_order_v1,
} from './decibel_mcp_mainnet_continuous_shadow_v1.js';
import { readDecibelMcpMainnetShadowStateV1 } from './decibel_mcp_mainnet_shadow_state_v1.js';
import { decibel_stdio_mcp_transport_v1 } from './decibel_mcp_execution_transport_v1.js';

const CheckpointHash = 'e69d23751f85dbfab33a41c4a8827364f8cf323ffff840f77c29647b515d4086';
const CapabilityHash = '65a089c6cfeca5d7066a7e26b81a25a57fd49ce2d024d04e8ca884b4f69df5b0';

const numeric = (value: unknown) => {
  const result = typeof value === 'string' ? Number(value) : value;
  return typeof result === 'number' && Number.isFinite(result) ? result : null;
};
const delay = (milliseconds: number) =>
  new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function durationSeconds(arguments_: readonly string[]): number | null {
  const index = arguments_.indexOf('--duration-seconds');
  if (index < 0) return null;
  const value = Number(arguments_[index + 1]);
  if (!Number.isFinite(value) || value <= 0) throw new Error('MCP_SHADOW_DURATION_INVALID');
  return value;
}

function normalizeConfig(input: {
  environment: NodeJS.ProcessEnv;
  marketAddress: string;
  raw: Record<string, unknown>;
  schema: decibel_continuous_shadow_config_v1['schema'];
}): decibel_continuous_shadow_config_v1 {
  const priceDecimals = numeric(input.raw.priceDecimals ?? input.raw.price_decimals);
  const sizeDecimals = numeric(input.raw.sizeDecimals ?? input.raw.size_decimals);
  const rawTick = numeric(input.raw.tickSize ?? input.raw.tick_size);
  const rawLot = numeric(input.raw.lotSize ?? input.raw.lot_size);
  const rawMinimum = numeric(
    input.raw.minSize ?? input.raw.min_size ?? input.raw.minimumSize ?? input.raw.minimum_size,
  );
  if (
    priceDecimals === null ||
    sizeDecimals === null ||
    rawTick === null ||
    rawLot === null ||
    rawMinimum === null
  )
    throw new Error('MCP_SHADOW_BTC_METADATA_INCOMPLETE');
  return Object.freeze({
    subaccount: input.environment.DECIBEL_SUBACCOUNT_ADDRESS!,
    marketAddress: input.marketAddress,
    checkpointHash: CheckpointHash,
    cycleSequence: 1,
    tickSize: rawTick / 10 ** priceDecimals,
    lotSize: rawLot / 10 ** sizeDecimals,
    minimumSize: rawMinimum / 10 ** sizeDecimals,
    minimumNotionalUsd: Number(input.environment.DECIBEL_RECYCLING_MIN_NOTIONAL_USD ?? 10),
    targetNotionalUsd: Number(input.environment.DECIBEL_RECYCLING_TARGET_NOTIONAL_USD ?? 21),
    maximumNotionalUsd: Number(input.environment.DECIBEL_RECYCLING_MAX_NOTIONAL_USD ?? 25),
    schema: input.schema,
  });
}

export async function runDecibelMcpMainnetContinuousShadowV1(input: {
  environment: NodeJS.ProcessEnv;
  arguments: readonly string[];
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}) {
  const now = input.now ?? Date.now;
  const wait = input.wait ?? delay;
  if (input.environment.DECIBEL_NETWORK !== 'mainnet')
    throw new Error('MCP_MAINNET_READ_ONLY_NETWORK_REQUIRED');
  if (!input.environment.DECIBEL_NODE_API_KEY) throw new Error('MCP_NODE_API_KEY_REQUIRED');
  if (!input.environment.DECIBEL_SUBACCOUNT_ADDRESS) throw new Error('MCP_SUBACCOUNT_REQUIRED');
  const intervalMs = Number(input.environment.DECIBEL_MCP_SHADOW_INTERVAL_MS ?? 2_000);
  if (!Number.isInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 30_000)
    throw new Error('MCP_SHADOW_INTERVAL_INVALID');
  const duration = durationSeconds(input.arguments);
  const checkpoint = JSON.parse(
    readFileSync(resolve('research/decibel_authenticated_btc_resync_checkpoint_v1.json'), 'utf8'),
  ) as Record<string, unknown>;
  if (checkpoint.checkpointBodyHashSha256 !== CheckpointHash)
    throw new Error('MCP_SHADOW_RESYNC_CHECKPOINT_INVALID');
  const capability = JSON.parse(
    readFileSync(resolve('research/decibel_mcp_mainnet_capabilities_v1.json'), 'utf8'),
  ) as {
    capabilityHash: string;
    placeLimitOrderSchema: decibel_continuous_shadow_config_v1['schema'];
  };
  if (capability.capabilityHash !== CapabilityHash)
    throw new Error('MCP_SHADOW_CAPABILITY_HASH_MISMATCH');
  const startedAt = now();
  const sessionId = `shadow-${startedAt}`;
  const jsonlPath = resolve(`data/decibel_mcp_mainnet_continuous_shadow_v1_${sessionId}.jsonl`);
  const summaryPath = resolve(
    `data/decibel_mcp_mainnet_continuous_shadow_summary_v1_${sessionId}.json`,
  );
  const transport = new decibel_stdio_mcp_transport_v1(
    buildDecibelMcpMainnetReadOnlyEnvironmentV1(input.environment),
  );
  const evaluations: decibel_continuous_shadow_evaluation_v1[] = [];
  let previousOrder: decibel_continuous_shadow_order_v1 | null = null;
  let readFailureCount = 0;
  let unhandledExceptionCount = 0;
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    while (!stopping && (duration === null || now() - startedAt < duration * 1_000)) {
      const evaluationStartedAt = now();
      try {
        const state = await readDecibelMcpMainnetShadowStateV1({ transport, now });
        const config = normalizeConfig({
          environment: input.environment,
          marketAddress: state.btcMarket.address,
          raw: state.btcMarket.raw,
          schema: capability.placeLimitOrderSchema,
        });
        const evaluation = evaluateDecibelMcpContinuousShadowV1({
          initial: state.initial,
          final: state.final,
          previousOrder,
          config,
          timestamp: now(),
        });
        evaluations.push(evaluation);
        previousOrder = evaluation.shadowOrderAfter;
        appendFileSync(jsonlPath, `${JSON.stringify(evaluation)}\n`, 'utf8');
        console.log(
          `SHADOW_EVALUATION=${evaluations.length} ACTION=${evaluation.action} BID=${evaluation.bestBid} ASK=${evaluation.bestAsk} PRICE=${evaluation.desiredPrice ?? 'NONE'} BLOCKERS=${evaluation.blockers.join(',') || 'NONE'}`,
        );
      } catch (error) {
        readFailureCount += 1;
        console.error(`SHADOW_READ_FAILURE=${error instanceof Error ? error.message : 'UNKNOWN'}`);
      }
      const remaining = intervalMs - (now() - evaluationStartedAt);
      if (!stopping && remaining > 0) await wait(remaining);
    }
  } catch {
    unhandledExceptionCount += 1;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await transport.close().catch(() => undefined);
  }
  const summary = summarizeDecibelMcpContinuousShadowV1({
    sessionId,
    startedAt,
    endedAt: now(),
    evaluations,
    readFailureCount,
    unhandledExceptionCount,
  });
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`MAINNET_SHADOW_RUNTIME_READY=${summary.mainnetShadowRuntimeReady ? 'YES' : 'NO'}`);
  console.log(`SESSION_ID=${sessionId}`);
  console.log(`SUMMARY=${summaryPath}`);
  console.log(`MCP_MUTATION_CALLS=0`);
  console.log(`VENUE_MUTATIONS=0`);
  return Object.freeze({ summary, jsonlPath, summaryPath });
}

if (process.argv[1]?.endsWith('run_decibel_mcp_mainnet_continuous_shadow_v1.ts')) {
  runDecibelMcpMainnetContinuousShadowV1({
    environment: process.env,
    arguments: process.argv.slice(2),
  }).catch((error: unknown) => {
    console.error(`MAINNET_SHADOW_RUNTIME_READY=NO`);
    console.error(`BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`);
    console.error(`MCP_MUTATION_CALLS=0`);
    console.error(`VENUE_MUTATIONS=0`);
    process.exitCode = 1;
  });
}
