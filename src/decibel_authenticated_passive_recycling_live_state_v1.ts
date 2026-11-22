import { createHash } from 'node:crypto';

import { canonicalizeDecibelAuthenticatedLiveCanarySuccessV1 } from './decibel_authenticated_live_canary_success_freeze_v1.js';

export const DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_LIVE_STATE_V1 =
  'DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_LIVE_STATE_V1' as const;
export const FROZEN_CANARY_MANIFEST_SHA256 =
  'ff0e0b7b69729500a902e7857ca3e67ae1efc1a75f054eba7af975f273395130' as const;
export const FROZEN_CANARY_MANIFEST_BODY_SHA256 =
  '699fd8c4cc986f5b797d9dbd1f795bfaea5b6a3c7aec557dcfa7b520ed5440f5' as const;

type json_record = Record<string, unknown>;

function fail(blocker: string): never {
  throw new Error(blocker);
}

function record(value: unknown, blocker: string): json_record {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(blocker);
  return value as json_record;
}

function string(value: unknown, blocker: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(blocker);
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function validateDecibelAuthenticatedLiveCanaryManifestV1(input: {
  manifest: json_record;
  manifestFileSha256: string;
}) {
  if (input.manifestFileSha256 !== FROZEN_CANARY_MANIFEST_SHA256)
    fail('AUTHENTICATED_CANARY_MANIFEST_FILE_HASH_MISMATCH');
  if (input.manifest.manifestBodyHashSha256 !== FROZEN_CANARY_MANIFEST_BODY_SHA256)
    fail('AUTHENTICATED_CANARY_MANIFEST_BODY_HASH_MISMATCH');
  const { manifestBodyHashSha256: _hash, ...body } = input.manifest;
  if (sha256(canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(body)) !== _hash)
    fail('AUTHENTICATED_CANARY_MANIFEST_CANONICAL_HASH_MISMATCH');
  const identity = record(input.manifest.identity, 'AUTHENTICATED_CANARY_IDENTITY_REQUIRED');
  const fill = record(input.manifest.fillEvidence, 'AUTHENTICATED_CANARY_FILL_REQUIRED');
  const proofs = record(input.manifest.proofs, 'AUTHENTICATED_CANARY_PROOFS_REQUIRED');
  const position = record(input.manifest.position, 'AUTHENTICATED_CANARY_POSITION_REQUIRED');
  const conclusion = record(input.manifest.conclusion, 'AUTHENTICATED_CANARY_CONCLUSION_REQUIRED');
  if (
    conclusion.authenticatedLiveCanaryStatus !== 'FULL_FILL_RECONCILED' ||
    conclusion.authenticatedOwnFillTruthProven !== true ||
    conclusion.postOnlyMakerExecutionProven !== true ||
    conclusion.fullFillConservationProven !== true ||
    conclusion.positionConservationProven !== true ||
    conclusion.externalCounterpartyRequired !== true ||
    conclusion.selfTradePermitted !== false ||
    proofs.makerStatus !== 'PROVEN' ||
    proofs.fillConservation !== 'PASS' ||
    proofs.positionConservation !== 'PASS'
  )
    fail('AUTHENTICATED_CANARY_SUCCESS_PROOF_INCOMPLETE');
  const fillIds = fill.fillIds;
  if (
    !Array.isArray(fillIds) ||
    fillIds.length === 0 ||
    fillIds.some((id) => typeof id !== 'string')
  )
    fail('AUTHENTICATED_CANARY_FILL_IDS_REQUIRED');
  return Object.freeze({
    identity,
    fill,
    position,
    fillIds: Object.freeze(fillIds.map((id) => string(id, 'AUTHENTICATED_CANARY_FILL_ID_INVALID'))),
  });
}
