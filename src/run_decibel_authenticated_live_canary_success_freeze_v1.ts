import { resolve } from 'node:path';

import {
  buildDecibelAuthenticatedLiveCanarySuccessManifestV1,
  freezeDecibelAuthenticatedLiveCanarySuccessManifestV1,
  loadDecibelAuthenticatedLiveCanarySuccessSourceV1,
} from './decibel_authenticated_live_canary_success_freeze_v1.js';

for (const name of [
  'LIVE_EXECUTION_ENABLED',
  'VENUE_MUTATION_ENABLED',
  'SIGNER_ENABLED',
  'TRANSACTION_SUBMISSION_ENABLED',
] as const)
  if (process.env[name] === 'true') throw new Error(`SUCCESS_FREEZE_${name}_MUST_BE_FALSE`);

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith('--'))
    throw new Error(`${name.slice(2).toUpperCase()}_REQUIRED`);
  return value;
}

const handoff = loadDecibelAuthenticatedLiveCanarySuccessSourceV1(resolve(argument('--handoff')));
const capture = loadDecibelAuthenticatedLiveCanarySuccessSourceV1(resolve(argument('--capture')));
const reconciliation = loadDecibelAuthenticatedLiveCanarySuccessSourceV1(
  resolve(argument('--reconciliation')),
);
const outputPath = resolve('research/decibel_authenticated_live_canary_success_v1_manifest.json');
const manifest = buildDecibelAuthenticatedLiveCanarySuccessManifestV1({
  handoff,
  capture,
  reconciliation,
});
const frozen = freezeDecibelAuthenticatedLiveCanarySuccessManifestV1({ manifest, outputPath });

console.log(`AUTHENTICATED_LIVE_CANARY_SUCCESS_FROZEN=YES`);
console.log(`FREEZE_STATUS=${frozen.status}`);
console.log(`CANARY_ID=${manifest.identity.canaryId}`);
console.log(`VENUE_ORDER_ID=${manifest.identity.venueOrderId}`);
console.log(`TRANSACTION_VERSION=${manifest.identity.transactionVersion}`);
console.log(`TRANSACTION_HASH=${manifest.identity.transactionHash}`);
console.log(`CLASSIFICATION=${String(manifest.proofs.reconciliationClassification)}`);
console.log(`AUTHENTICATED_OWN_FILL_TRUTH_PROVEN=YES`);
console.log(`POST_ONLY_MAKER_EXECUTION_PROVEN=YES`);
console.log(`FILL_CONSERVATION=${String(manifest.proofs.fillConservation)}`);
console.log(`POSITION_CONSERVATION=${String(manifest.proofs.positionConservation)}`);
console.log(`MANIFEST_SHA256=${frozen.manifestSha256}`);
console.log(`REPORT=${outputPath}`);
console.log(`BLOCKER=NONE`);
