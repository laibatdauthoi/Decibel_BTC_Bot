import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'prettier';
import { sha256CanonicalJsonV1 } from './decibel_shadow_reprice_policy_experiment_v1.js';
const shaFile = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
export function buildDecibelProductionExecutorHandoffManifestV1() {
  const shadowPath = resolve('research/decibel_mcp_mainnet_shadow_readiness_v1_manifest.json');
  const mockPath = resolve('research/decibel_execution_lifecycle_mock_v1_manifest.json');
  const lifecyclePath = resolve(
    'research/decibel_mainnet_execution_lifecycle_shadow_v1_manifest.json',
  );
  const contractPath = resolve('src/decibel_production_executor_handoff_v1.ts');
  const testsPath = resolve('tests/decibel_production_executor_handoff_v1.test.ts');
  const body = {
    identity: 'DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_V1',
    trustLabel: 'DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_READY',
    prerequisiteManifestHashes: {
      shadowReadinessManifestHash: read(shadowPath).manifestBodyHashSha256,
      executionLifecycleMockManifestHash: read(mockPath).manifestBodyHashSha256,
      mainnetLifecycleShadowManifestHash: read(lifecyclePath).manifestBodyHashSha256,
    },
    artifactFileHashes: {
      shadowReadinessManifestSha256: shaFile(shadowPath),
      executionLifecycleMockManifestSha256: shaFile(mockPath),
      mainnetLifecycleShadowManifestSha256: shaFile(lifecyclePath),
      executorContractSha256: shaFile(contractPath),
      acceptanceTestsSha256: shaFile(testsPath),
    },
    resultTaxonomy: [
      'PLACE_ACKNOWLEDGED',
      'PLACE_REJECTED',
      'PLACE_OUTCOME_UNKNOWN',
      'CANCEL_CONFIRMED',
      'CANCEL_REJECTED',
      'CANCEL_OUTCOME_UNKNOWN',
    ],
    productionExecutorImplemented: false,
    liveMutationEnabled: false,
    autonomousMainnetTradingEnabled: false,
    executorEnabledByDefault: false,
    mcpMutationCalls: 0,
    venueMutations: 0,
    mainnetSignedTransactions: 0,
  };
  return Object.freeze({ ...body, manifestBodyHashSha256: sha256CanonicalJsonV1(body) });
}
export async function runDecibelProductionExecutorHandoffV1() {
  const manifest = buildDecibelProductionExecutorHandoffManifestV1();
  const path = resolve('research/decibel_production_executor_handoff_v1_manifest.json');
  const contents = await format(JSON.stringify(manifest), { parser: 'json' });
  let disposition: 'FROZEN' | 'ALREADY_FROZEN';
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') !== contents)
      throw new Error('PRODUCTION_EXECUTOR_HANDOFF_MANIFEST_CONFLICT');
    disposition = 'ALREADY_FROZEN';
  } else {
    writeFileSync(path, contents, { encoding: 'utf8', flag: 'wx' });
    disposition = 'FROZEN';
  }
  console.log(
    `MANIFEST=${path}\nMANIFEST_BODY_HASH_SHA256=${manifest.manifestBodyHashSha256}\nDISPOSITION=${disposition}\nMCP_MUTATION_CALLS=0\nVENUE_MUTATIONS=0\nMAINNET_SIGNED_TRANSACTIONS=0`,
  );
  return { manifest, disposition };
}
if (process.argv[1]?.endsWith('run_decibel_production_executor_handoff_v1.ts'))
  runDecibelProductionExecutorHandoffV1().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'UNKNOWN');
    process.exitCode = 1;
  });
