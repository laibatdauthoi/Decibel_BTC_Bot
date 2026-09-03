import path from 'node:path';

import {
  buildDecibelProductionExecutorRuntimeReadinessManifestV1,
  freezeDecibelProductionExecutorRuntimeReadinessManifestV1,
} from './decibel_production_executor_runtime_readiness_v1.js';

try {
  const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV1();
  const outputPath = path.resolve(
    'research/decibel_production_executor_runtime_readiness_v1_manifest.json',
  );
  const disposition = freezeDecibelProductionExecutorRuntimeReadinessManifestV1({
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
