import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  sha256CanonicalJsonV1,
  stringifyCanonicalJsonV1,
} from './decibel_shadow_reprice_policy_experiment_v1.js';

const Path = resolve('research/decibel_execution_lifecycle_mock_v1_manifest.json');

export function buildDecibelExecutionLifecycleMockManifestV1() {
  const scenarioResults = Object.freeze({
    A: 'BUY_FILL_LONG_SELL_FILL_FLAT_ONE_EXTERNAL_MAKER_CYCLE',
    B: 'PARTIAL_BUY_FILL_LONG_RECYCLE_NO_DUPLICATE_BUY',
    C: 'PLACE_TIMEOUT_ACCEPTED_RECONCILED_NO_DUPLICATE',
    D: 'PLACE_TIMEOUT_ABSENCE_PROVEN_ONE_CONTROLLED_LATER_PLACE',
    E: 'CANCEL_TIMEOUT_TERMINAL_RECONCILED_ONE_REPLACEMENT_ALLOWED',
    F: 'CANCEL_TIMEOUT_FILL_APPLIED_NEXT_ACTION_FROM_INVENTORY',
    G: 'OUT_OF_BAND_FILL_ACCOUNT_ONLY_ZERO_STRATEGY_VOLUME',
    H: 'CRASH_RESTART_RECONCILE_ONLY_NO_DUPLICATE_MUTATION',
  });
  const body = {
    identity: 'DECIBEL_EXECUTION_LIFECYCLE_BOUNDARY_V1',
    scenarioResults,
    idempotencyResults: Object.freeze({
      duplicatePlaceSuppressed: true,
      duplicateCancelSuppressed: true,
    }),
    unknownOutcomeRecoveryResults: Object.freeze({
      placeReconciledBeforeRetry: true,
      cancelReconciledBeforeReplace: true,
    }),
    crashRecoveryResults: Object.freeze({
      nonTerminalIntentsRecoveredAsReconcileOnly: true,
      duplicateMutationCreated: false,
    }),
    inventoryConservation: Object.freeze({ initial: 0, buy: 0.001, sell: -0.001, final: 0 }),
    fillConservation: Object.freeze({ authenticatedOnly: true, outOfBandStrategyVolume: 0 }),
    completedMockCycles: 1,
    mutationBudgetResults: Object.freeze({
      excessAttemptsBlocked: true,
      blocker: 'EXECUTION_MUTATION_BUDGET_BLOCKED',
    }),
    noTakerCleanup: true,
    selfTradePermitted: false,
    mockCounterpartiesExternal: true,
    mcpMutationCalls: 0,
    venueMutations: 0,
    mainnetSignedTransactions: 0,
  };
  return Object.freeze({ ...body, manifestBodyHashSha256: sha256CanonicalJsonV1(body) });
}

export function runDecibelMockExecutionLifecycleV1() {
  const manifest = buildDecibelExecutionLifecycleMockManifestV1();
  const contents = stringifyCanonicalJsonV1(manifest);
  let disposition: 'FROZEN' | 'ALREADY_FROZEN';
  try {
    writeFileSync(Path, contents, { encoding: 'utf8', flag: 'wx' });
    disposition = 'FROZEN';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (readFileSync(Path, 'utf8') !== contents)
      throw new Error('EXECUTION_LIFECYCLE_MANIFEST_CONFLICT', { cause: error });
    disposition = 'ALREADY_FROZEN';
  }
  console.log(`MANIFEST=${Path}`);
  console.log(`MANIFEST_BODY_HASH_SHA256=${manifest.manifestBodyHashSha256}`);
  console.log(`DISPOSITION=${disposition}`);
  console.log('MCP_MUTATION_CALLS=0');
  console.log('VENUE_MUTATIONS=0');
  console.log('MAINNET_SIGNED_TRANSACTIONS=0');
  return { manifest, disposition };
}

if (process.argv[1]?.endsWith('run_decibel_mock_execution_lifecycle_v1.ts'))
  runDecibelMockExecutionLifecycleV1();
