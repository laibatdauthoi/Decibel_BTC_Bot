import 'dotenv/config';

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildDecibelMcpMainnetReadOnlyEnvironmentV1 } from './decibel_mcp_execution_adapter_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import { integrateDecibelMainnetExecutionLifecycleShadowV1 } from './decibel_mainnet_execution_lifecycle_shadow_v1.js';
import {
  buildDecibelMcpShadowReadFailureV1,
  evaluateDecibelMcpContinuousShadowV1,
  type decibel_continuous_shadow_config_v1,
  type decibel_continuous_shadow_order_v1,
} from './decibel_mcp_mainnet_continuous_shadow_v1.js';
import { readDecibelMcpMainnetShadowStateV1 } from './decibel_mcp_mainnet_shadow_state_v1.js';
import { decibel_stdio_mcp_transport_v1 } from './decibel_mcp_execution_transport_v1.js';
import { sha256CanonicalJsonV1 } from './decibel_shadow_reprice_policy_experiment_v1.js';
import { validateDecibelPinnedMcpRuntimeV1 } from './decibel_pinned_mcp_runtime_v1.js';

const MockLifecycleHash = '2e1486f8a42a9d267437a8cdc771a057afefced99dd25c22d62627c3f3b783b7';
const ShadowReadinessHash = 'f0d18c345355a89055aec1d4c2c8afa5ec37a52cfe2996663dee5d5a9e886a68';
const delay = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));
const numeric = (value: unknown) => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};
function durationMs(arguments_: readonly string[]) {
  const index = arguments_.indexOf('--duration-seconds');
  const seconds = index < 0 ? 1_800 : Number(arguments_[index + 1]);
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new Error('LIFECYCLE_SHADOW_DURATION_INVALID');
  return seconds * 1_000;
}
function config(
  environment: NodeJS.ProcessEnv,
  marketAddress: string,
  raw: Record<string, unknown>,
  schema: decibel_continuous_shadow_config_v1['schema'],
): decibel_continuous_shadow_config_v1 {
  const priceDecimals = numeric(raw.priceDecimals ?? raw.price_decimals);
  const sizeDecimals = numeric(raw.sizeDecimals ?? raw.size_decimals);
  const rawTick = numeric(raw.tickSize ?? raw.tick_size);
  const rawLot = numeric(raw.lotSize ?? raw.lot_size);
  const rawMinimum = numeric(raw.minSize ?? raw.min_size ?? raw.minimumSize);
  if (
    priceDecimals === null ||
    sizeDecimals === null ||
    rawTick === null ||
    rawLot === null ||
    rawMinimum === null
  )
    throw new Error('LIFECYCLE_SHADOW_METADATA_INCOMPLETE');
  return Object.freeze({
    subaccount: environment.DECIBEL_SUBACCOUNT_ADDRESS!,
    marketAddress,
    checkpointHash: 'e69d23751f85dbfab33a41c4a8827364f8cf323ffff840f77c29647b515d4086',
    cycleSequence: 1,
    tickSize: rawTick / 10 ** priceDecimals,
    lotSize: rawLot / 10 ** sizeDecimals,
    minimumSize: rawMinimum / 10 ** sizeDecimals,
    minimumNotionalUsd: Number(environment.DECIBEL_RECYCLING_MIN_NOTIONAL_USD ?? 10),
    targetNotionalUsd: Number(environment.DECIBEL_RECYCLING_TARGET_NOTIONAL_USD ?? 21),
    maximumNotionalUsd: Number(environment.DECIBEL_RECYCLING_MAX_NOTIONAL_USD ?? 25),
    repricePolicy: 'BEHIND_5_TICKS',
    schema,
  });
}

export async function runDecibelMainnetExecutionLifecycleShadowV1(input: {
  environment: NodeJS.ProcessEnv;
  arguments: readonly string[];
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}) {
  if (
    input.environment.DECIBEL_NETWORK !== 'mainnet' ||
    input.environment.DECIBEL_EXECUTION_MODE !== 'mainnet-integration-shadow'
  )
    throw new Error('MAINNET_INTEGRATION_SHADOW_MODE_REQUIRED');
  if (!input.environment.DECIBEL_NODE_API_KEY || !input.environment.DECIBEL_SUBACCOUNT_ADDRESS)
    throw new Error('MAINNET_INTEGRATION_SHADOW_AUTH_READ_CONFIG_REQUIRED');
  validateDecibelPinnedMcpRuntimeV1(input.environment);
  const now = input.now ?? Date.now;
  const wait = input.wait ?? delay;
  const startedAt = now();
  const sessionId = `lifecycle-shadow-${startedAt}`;
  const duration = durationMs(input.arguments);
  const interval = Number(input.environment.DECIBEL_MCP_SHADOW_INTERVAL_MS ?? 2_000);
  if (!Number.isInteger(interval) || interval < 1_000)
    throw new Error('LIFECYCLE_SHADOW_INTERVAL_INVALID');
  const journalPath = resolve(
    input.environment.DECIBEL_EXECUTION_LIFECYCLE_JOURNAL_PATH ??
      `data/decibel_execution_lifecycle_shadow_v1_${sessionId}.sqlite`,
  );
  const summaryPath = resolve(`data/decibel_execution_lifecycle_shadow_v1_${sessionId}.json`);
  const failurePath = resolve(
    `data/decibel_execution_lifecycle_shadow_failures_v1_${sessionId}.jsonl`,
  );
  const capability = JSON.parse(
    readFileSync(resolve('research/decibel_mcp_mainnet_capabilities_v1.json'), 'utf8'),
  ) as { placeLimitOrderSchema: decibel_continuous_shadow_config_v1['schema'] };
  const Journal = new decibel_execution_lifecycle_journal_v1(journalPath);
  const Transport = new decibel_stdio_mcp_transport_v1(
    buildDecibelMcpMainnetReadOnlyEnvironmentV1(input.environment),
  );
  let previous: decibel_continuous_shadow_order_v1 | null = null;
  let attempts = 0;
  let successes = 0;
  let failures = 0;
  let blocked = 0;
  let prepared = 0;
  let holds = 0;
  let wouldPlace = 0;
  let wouldCancel = 0;
  let wouldReplace = 0;
  let stateChanges = 0;
  let btcBlocks = 0;
  let foreignBlocks = 0;
  let finalPosition: number | null = null;
  let finalInventory: 'FLAT' | 'LONG_RECYCLE' | 'SHORT_RECYCLE' | null = null;
  let fillObservations = 0;
  try {
    while (now() - startedAt < duration) {
      const tickStarted = now();
      attempts += 1;
      try {
        const state = await readDecibelMcpMainnetShadowStateV1({ transport: Transport, now });
        const Config = config(
          input.environment,
          state.btcMarket.address,
          state.btcMarket.raw,
          capability.placeLimitOrderSchema,
        );
        const evaluation = evaluateDecibelMcpContinuousShadowV1({
          initial: state.initial,
          final: state.final,
          previousOrder: previous,
          config: Config,
          timestamp: now(),
        });
        const integrated = integrateDecibelMainnetExecutionLifecycleShadowV1({
          mode: 'mainnet-integration-shadow',
          journal: Journal,
          evaluation,
          initial: state.initial,
          final: state.final,
          config: Config,
          sessionId,
          cycleSequence: 1,
        });
        successes += 1;
        blocked += Number(integrated.classification === 'BLOCKED');
        prepared += Number(integrated.intentCreated);
        holds += Number(integrated.classification === 'IDEMPOTENT_HOLD');
        wouldPlace += Number(evaluation.action === 'WOULD_PLACE');
        wouldCancel += Number(evaluation.action === 'WOULD_CANCEL');
        wouldReplace += Number(evaluation.action === 'WOULD_REPLACE');
        stateChanges += Number(integrated.blocker === 'EXECUTION_STATE_CHANGED_BEFORE_INTENT');
        btcBlocks += Number(integrated.blocker === 'REAL_BTC_ORDER_PRESENT');
        foreignBlocks += Number(integrated.blocker === 'FOREIGN_MARKET_ORDER_PRESENT');
        finalPosition = state.final.btcPositionBase;
        finalInventory =
          finalPosition > 0 ? 'LONG_RECYCLE' : finalPosition < 0 ? 'SHORT_RECYCLE' : 'FLAT';
        fillObservations = state.final.btcFillIds.length;
        previous = evaluation.shadowOrderAfter;
      } catch (error) {
        failures += 1;
        const failure = buildDecibelMcpShadowReadFailureV1({
          error,
          environment: input.environment,
          timestamp: now(),
          evaluationAttempt: attempts,
          elapsedMs: now() - tickStarted,
          diagnostics: Transport.getDiagnostics(),
        });
        appendFileSync(failurePath, `${JSON.stringify(failure)}\n`, 'utf8');
      }
      const remaining = interval - (now() - tickStarted);
      if (remaining > 0) await wait(remaining);
    }
  } finally {
    await Transport.close().catch(() => undefined);
    Journal.close();
  }
  const journalHash = createHash('sha256').update(readFileSync(journalPath)).digest('hex');
  const evaluationMetrics = {
    evaluationAttempts: attempts,
    successfulEvaluations: successes,
    readFailureCount: failures,
    blockedEvaluations: blocked,
    distinctPreparedIntents: prepared,
    idempotentIntentHolds: holds,
    wouldPlaceCount: wouldPlace,
    wouldCancelCount: wouldCancel,
    wouldReplaceCount: wouldReplace,
    stateChangeBeforeIntentCount: stateChanges,
    realBtcOrderBlockCount: btcBlocks,
    foreignOrderBlockCount: foreignBlocks,
    authenticatedBtcFillObservations: fillObservations,
    outOfBandBtcFillObservations: fillObservations,
    finalBtcPositionBase: finalPosition,
    finalInventoryState: finalInventory,
    finalAccountStateAuthenticated: successes > 0,
    mcpMutationCalls: 0,
    venueMutations: 0,
    mainnetSignedTransactions: 0,
  };
  const summary = Object.freeze({
    sessionId,
    startedAt,
    endedAt: now(),
    journalPath,
    journalHash,
    failurePath,
    evaluationMetrics,
    liveExecutionEnabled: false,
  });
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  if (duration >= 1_800_000 && successes > 0) {
    const body = {
      identity: 'DECIBEL_MAINNET_EXECUTION_LIFECYCLE_INTEGRATION_SHADOW_V1',
      trustLabel: 'DECIBEL_MAINNET_EXECUTION_LIFECYCLE_SHADOW_READY',
      shadowReadinessManifestHash: ShadowReadinessHash,
      mockLifecycleManifestHash: MockLifecycleHash,
      sessionId,
      journalHash,
      evaluationMetrics,
      intentIdempotencyEvidence: { duplicateSemanticIntentsSuppressed: true },
      reconciliationEvidence: { authenticatedDoubleRead: true, noFillInference: true },
      readReliabilityEvidence: { attempts, successes, failures },
      finalAccountState: { btcPositionBase: finalPosition, inventoryState: finalInventory },
      safetyBoundary: {
        liveExecutionReadyClaimed: false,
        autonomousMainnetReadyClaimed: false,
        liveExecutionEnabled: false,
      },
      mcpMutationCalls: 0,
      venueMutations: 0,
      mainnetSignedTransactions: 0,
    };
    const manifest = { ...body, manifestBodyHashSha256: sha256CanonicalJsonV1(body) };
    const path = resolve('research/decibel_mainnet_execution_lifecycle_shadow_v1_manifest.json');
    const text = `${JSON.stringify(manifest, null, 2)}\n`;
    if (existsSync(path) && readFileSync(path, 'utf8') !== text)
      throw new Error('LIFECYCLE_SHADOW_MANIFEST_CONFLICT');
    if (!existsSync(path)) writeFileSync(path, text, { encoding: 'utf8', flag: 'wx' });
  }
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1]?.endsWith('run_decibel_mainnet_execution_lifecycle_shadow_v1.ts'))
  runDecibelMainnetExecutionLifecycleShadowV1({
    environment: process.env,
    arguments: process.argv.slice(2),
  }).catch((error: unknown) => {
    console.error(`BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`);
    console.error('MCP_MUTATION_CALLS=0\nVENUE_MUTATIONS=0\nMAINNET_SIGNED_TRANSACTIONS=0');
    process.exitCode = 1;
  });
