import path from 'node:path';

import {
  buildDecibelProductionExecutorRuntimeReadinessManifestV2,
  freezeDecibelProductionExecutorRuntimeReadinessManifestV2,
} from './decibel_production_executor_runtime_readiness_v2.js';

try {
  const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV2();
  const outputPath = path.resolve(
    'research/decibel_production_executor_runtime_readiness_v2_manifest.json',
  );
  const disposition = freezeDecibelProductionExecutorRuntimeReadinessManifestV2({
    manifest,
    outputPath,
  });
  console.log(`DISPOSITION=${disposition}`);
  console.log(`MANIFEST=${outputPath}`);
  console.log(`MANIFEST_BODY_HASH_SHA256=${manifest.manifestBodyHashSha256}`);
  console.log('MUTATION_INVOCATIONS=0');
  console.log('VENUE_MUTATIONS=0');
  console.log('SIGNED_TRANSACTIONS=0');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'UNKNOWN');
  process.exitCode = 1;
}
