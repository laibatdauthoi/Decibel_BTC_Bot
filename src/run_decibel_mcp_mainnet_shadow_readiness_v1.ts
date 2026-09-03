import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'prettier';

import { buildDecibelMcpMainnetShadowReadinessV1 } from './decibel_mcp_mainnet_shadow_readiness_v1.js';
import { stringifyCanonicalJsonV1 } from './decibel_shadow_reprice_policy_experiment_v1.js';

const ManifestPath = resolve('research/decibel_mcp_mainnet_shadow_readiness_v1_manifest.json');

export function freezeDecibelMcpMainnetShadowReadinessV1(path: string, contents: string) {
  try {
    writeFileSync(path, contents, { encoding: 'utf8', flag: 'wx' });
    return 'FROZEN' as const;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (readFileSync(path, 'utf8') === contents) return 'ALREADY_FROZEN' as const;
    throw new Error('MCP_MAINNET_SHADOW_READINESS_MANIFEST_CONFLICT', { cause: error });
  }
}

export async function runDecibelMcpMainnetShadowReadinessV1() {
  const manifest = buildDecibelMcpMainnetShadowReadinessV1({
    capability: 'research/decibel_mcp_mainnet_capabilities_v1.json',
    checkpoint: 'research/decibel_authenticated_btc_resync_checkpoint_v1.json',
    repriceExperiment: 'research/decibel_shadow_reprice_policy_experiment_v1.json',
    asymmetricExperiment: 'research/decibel_shadow_asymmetric_reprice_experiment_v1.json',
    firstSummary: 'data/decibel_mcp_mainnet_continuous_shadow_summary_v1_shadow-1788375045835.json',
    finalSummary: 'data/decibel_mcp_mainnet_continuous_shadow_summary_v1_shadow-1788404822466.json',
    firstJsonl: 'data/decibel_mcp_mainnet_continuous_shadow_v1_shadow-1788375045835.jsonl',
    finalJsonl: 'data/decibel_mcp_mainnet_continuous_shadow_v1_shadow-1788404822466.jsonl',
  });
  const contents = await format(stringifyCanonicalJsonV1(manifest), { parser: 'json' });
  const disposition = freezeDecibelMcpMainnetShadowReadinessV1(ManifestPath, contents);
  console.log(`TRUST_LABEL=${manifest.trustLabel}`);
  console.log(`MANIFEST_BODY_HASH_SHA256=${manifest.manifestBodyHashSha256}`);
  console.log(`MANIFEST=${ManifestPath}`);
  console.log(`DISPOSITION=${disposition}`);
  console.log('MCP_MUTATION_CALLS=0');
  console.log('VENUE_MUTATIONS=0');
  return { manifest, disposition };
}

if (process.argv[1]?.endsWith('run_decibel_mcp_mainnet_shadow_readiness_v1.ts')) {
  try {
    await runDecibelMcpMainnetShadowReadinessV1();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
