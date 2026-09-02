import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const DECIBEL_AUTHENTICATED_LIVE_CANARY_SUCCESS_FREEZE_V1 =
  'DECIBEL_AUTHENTICATED_LIVE_CANARY_SUCCESS_FREEZE_V1' as const;

type json_record = Record<string, unknown>;

export type decibel_authenticated_live_canary_success_source_v1 = Readonly<{
  path: string;
  bytes: Buffer;
  value: json_record;
}>;

const mutationCounters = Object.freeze({
  signedTransactions: 0 as const,
  submittedTransactions: 0 as const,
  placedOrders: 0 as const,
  cancelledOrders: 0 as const,
  replacedOrders: 0 as const,
  venueMutations: 0 as const,
});

function fail(blocker: string): never {
  throw new Error(blocker);
}

function record(value: unknown, blocker: string): json_record {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(blocker);
  return value as json_record;
}

function requiredString(value: unknown, blocker: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(blocker);
  return value;
}

function requiredFinite(value: unknown, blocker: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(blocker);
  return value;
}

function requiredStringArray(value: unknown, blocker: string): readonly string[] {
  if (!Array.isArray(value)) fail(blocker);
  const items: unknown[] = value;
  if (items.some((item) => typeof item !== 'string')) fail(blocker);
  return Object.freeze(items.map((item) => requiredString(item, blocker)));
}

function requireEqual(left: unknown, right: unknown, blocker: string) {
  if (left !== right) fail(blocker);
}

function requireAddressEqual(left: unknown, right: unknown, blocker: string) {
  if (
    typeof left !== 'string' ||
    typeof right !== 'string' ||
    left.toLowerCase() !== right.toLowerCase()
  )
    fail(blocker);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    const source = value as json_record;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonicalValue(source[key])]),
    );
  }
  return value;
}

export function canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function loadDecibelAuthenticatedLiveCanarySuccessSourceV1(
  path: string,
): decibel_authenticated_live_canary_success_source_v1 {
  const bytes = readFileSync(path);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('AUTHENTICATED_CANARY_SUCCESS_SOURCE_JSON_INVALID');
  }
  return Object.freeze({
    path,
    bytes,
    value: record(value, 'AUTHENTICATED_CANARY_SUCCESS_SOURCE_INVALID'),
  });
}

export function buildDecibelAuthenticatedLiveCanarySuccessManifestV1(input: {
  handoff: decibel_authenticated_live_canary_success_source_v1;
  capture: decibel_authenticated_live_canary_success_source_v1;
  reconciliation: decibel_authenticated_live_canary_success_source_v1;
}) {
  const h = input.handoff.value;
  const c = input.capture.value;
  const r = input.reconciliation.value;

  const canaryId = requiredString(h.canaryId, 'HANDOFF_CANARY_ID_REQUIRED');
  const executionSessionId = requiredString(h.executionSessionId, 'HANDOFF_SESSION_ID_REQUIRED');
  const handoffPackageHash = requiredString(h.handoffPackageHash, 'HANDOFF_PACKAGE_HASH_REQUIRED');
  const executionPackageHash = requiredString(
    h.executionPackageHash,
    'EXECUTION_PACKAGE_HASH_REQUIRED',
  );
  const subaccount = requiredString(h.subaccount, 'HANDOFF_SUBACCOUNT_REQUIRED');
  const marketAddress = requiredString(h.marketAddress, 'HANDOFF_MARKET_ADDRESS_REQUIRED');
  const side = requiredString(h.side, 'HANDOFF_SIDE_REQUIRED');
  const price = requiredFinite(h.price, 'HANDOFF_PRICE_REQUIRED');
  const quantity = requiredFinite(h.quantity, 'HANDOFF_QUANTITY_REQUIRED');
  const plannedClientOrderId = requiredString(
    h.clientOrderId,
    'HANDOFF_PLANNED_CLIENT_ORDER_ID_REQUIRED',
  );

  requireEqual(c.canaryId, canaryId, 'CANARY_ID_MISMATCH');
  requireEqual(r.canaryId, canaryId, 'CANARY_ID_MISMATCH');
  requireEqual(c.executionSessionId, executionSessionId, 'EXECUTION_SESSION_ID_MISMATCH');
  requireEqual(r.executionSessionId, executionSessionId, 'EXECUTION_SESSION_ID_MISMATCH');
  requireEqual(c.handoffArtifactHash, handoffPackageHash, 'HANDOFF_PACKAGE_HASH_MISMATCH');
  requireEqual(r.handoffPackageHash, handoffPackageHash, 'HANDOFF_PACKAGE_HASH_MISMATCH');
  requireEqual(c.executionPackageHash, executionPackageHash, 'EXECUTION_PACKAGE_HASH_MISMATCH');
  requireAddressEqual(c.configuredSubaccount, subaccount, 'SUBACCOUNT_MISMATCH');
  requireAddressEqual(c.marketAddress, marketAddress, 'MARKET_ADDRESS_MISMATCH');
  requireEqual(c.expectedSide, side, 'SIDE_MISMATCH');
  requireEqual(r.side, side, 'SIDE_MISMATCH');
  requireEqual(c.expectedPrice, price, 'PRICE_MISMATCH');
  requireEqual(r.orderPrice, price, 'PRICE_MISMATCH');
  requireEqual(c.expectedQuantity, quantity, 'QUANTITY_MISMATCH');
  requireEqual(r.orderQuantity, quantity, 'QUANTITY_MISMATCH');
  requireEqual(
    c.handoffPlannedClientOrderId,
    plannedClientOrderId,
    'PLANNED_CLIENT_ORDER_ID_MISMATCH',
  );

  if (c.uiCanaryOrderCaptured !== true || c.classification !== 'UI_CANARY_ORDER_CAPTURED')
    fail('UI_CANARY_CAPTURE_NOT_SUCCESSFUL');
  if (c.uiCanaryTransactionIdentityMatch !== 'YES') fail('CAPTURE_TRANSACTION_IDENTITY_MISMATCH');
  if (c.activityExclusivity !== true) fail('CAPTURE_ACTIVITY_EXCLUSIVITY_FAILED');

  const venueOrderId = requiredString(c.venueOrderId, 'VENUE_ORDER_ID_REQUIRED');
  const venueClientOrderId = requiredString(c.venueClientOrderId, 'VENUE_CLIENT_ORDER_ID_REQUIRED');
  const transactionVersion = requiredFinite(c.transactionVersion, 'TRANSACTION_VERSION_REQUIRED');
  const transactionHash = requiredString(c.transactionHash, 'TRANSACTION_HASH_REQUIRED');
  requireEqual(r.venueOrderId, venueOrderId, 'VENUE_ORDER_ID_MISMATCH');
  requireEqual(r.venueClientOrderId, venueClientOrderId, 'VENUE_CLIENT_ORDER_ID_MISMATCH');
  requireEqual(r.capturedTransactionVersion, transactionVersion, 'TRANSACTION_VERSION_MISMATCH');
  requireEqual(r.transactionVersion, transactionVersion, 'TRANSACTION_VERSION_MISMATCH');
  requireAddressEqual(r.capturedTransactionHash, transactionHash, 'TRANSACTION_HASH_MISMATCH');
  requireAddressEqual(r.providedTransactionHash, transactionHash, 'TRANSACTION_HASH_MISMATCH');

  const requiredProofs: readonly [unknown, unknown, string][] = [
    [r.classification, 'CANARY_FULL_FILL_RECONCILED', 'CANARY_NOT_FULL_FILL_RECONCILED'],
    [r.canaryReconciled, true, 'CANARY_NOT_RECONCILED'],
    [r.transactionIdentityMatch, true, 'TRANSACTION_IDENTITY_NOT_PROVEN'],
    [r.transactionFinality, 'FINALIZED_SUCCESS', 'TRANSACTION_FINALITY_NOT_SUCCESSFUL'],
    [r.makerStatus, 'PROVEN', 'MAKER_STATUS_NOT_PROVEN'],
    [r.fillConservation, 'PASS', 'FILL_CONSERVATION_FAILED'],
    [r.positionConservation, 'PASS', 'POSITION_CONSERVATION_FAILED'],
    [r.journalStatus, 'PASS', 'JOURNAL_STATUS_FAILED'],
    [r.remainingQuantity, 0, 'REMAINING_QUANTITY_NONZERO'],
    [r.openOrderState, 'ABSENT', 'OPEN_ORDER_STILL_PRESENT'],
    [r.unknownOrders, 0, 'UNKNOWN_ORDER_PRESENT'],
    [r.unknownFills, 0, 'UNKNOWN_FILL_PRESENT'],
    [r.activityExclusivity, true, 'ACTIVITY_EXCLUSIVITY_FAILED'],
  ];
  for (const [actual, expected, blocker] of requiredProofs) requireEqual(actual, expected, blocker);
  requireEqual(r.authenticatedFilledQuantity, quantity, 'AUTHENTICATED_FILLED_QUANTITY_MISMATCH');
  if (r.startingPosition !== 0) fail('ZERO_ANCHOR_START_NOT_PROVEN');

  const authenticatedFillCount = requiredFinite(
    r.authenticatedFillCount,
    'AUTHENTICATED_FILL_COUNT_REQUIRED',
  );
  const weightedAverageFillPrice = requiredFinite(
    r.weightedAverageFillPrice,
    'WEIGHTED_AVERAGE_FILL_PRICE_REQUIRED',
  );
  const fillIds = requiredStringArray(r.fillIds, 'FILL_IDS_REQUIRED');
  if (authenticatedFillCount <= 0 || fillIds.length !== authenticatedFillCount)
    fail('AUTHENTICATED_FILL_EVIDENCE_INCOMPLETE');

  const body = Object.freeze({
    schemaVersion: DECIBEL_AUTHENTICATED_LIVE_CANARY_SUCCESS_FREEZE_V1,
    strategyIdentity: 'DECIBEL_MARKET_MAKER_V1' as const,
    sourceArtifacts: Object.freeze({
      handoff: Object.freeze({
        path: input.handoff.path,
        handoffArtifactSha256: sha256(input.handoff.bytes),
      }),
      capture: Object.freeze({
        path: input.capture.path,
        captureArtifactSha256: sha256(input.capture.bytes),
      }),
      reconciliation: Object.freeze({
        path: input.reconciliation.path,
        reconciliationArtifactSha256: sha256(input.reconciliation.bytes),
      }),
    }),
    identity: Object.freeze({
      canaryId,
      executionSessionId,
      handoffPackageHash,
      executionPackageHash,
      subaccount,
      market: h.market,
      marketAddress,
      side,
      price,
      quantity,
      notionalUsd: h.notionalUsd,
      plannedClientOrderId,
      venueClientOrderId,
      venueOrderId,
      transactionVersion,
      transactionHash,
    }),
    evidenceChain: Object.freeze([
      'HANDOFF',
      'OPERATOR_UI_ORDER',
      'AUTHORITATIVE_VENUE_ORDER_IDENTITY',
      'APTOS_PLACEMENT_TRANSACTION',
      'AUTHENTICATED_ORDER_FILL',
      'POST_ONLY_MAKER_PROOF',
      'FILL_CONSERVATION',
      'POSITION_CONSERVATION',
      'FULL_FILL_RECONCILIATION',
    ] as const),
    fillEvidence: Object.freeze({
      authenticatedFillCount,
      authenticatedFilledQuantity: r.authenticatedFilledQuantity,
      weightedAverageFillPrice,
      fillIds,
      fees: requiredFinite(r.fees, 'FEES_REQUIRED'),
      rebates: requiredFinite(r.rebates, 'REBATES_REQUIRED'),
    }),
    proofs: Object.freeze({
      captureClassification: c.classification,
      captureTransactionIdentityMatch: c.uiCanaryTransactionIdentityMatch,
      reconciliationClassification: r.classification,
      transactionFinality: r.transactionFinality,
      makerStatus: r.makerStatus,
      fillConservation: r.fillConservation,
      positionConservation: r.positionConservation,
      journalStatus: r.journalStatus,
      activityExclusivity: r.activityExclusivity,
      unknownOrders: r.unknownOrders,
      unknownFills: r.unknownFills,
      openOrderState: r.openOrderState,
      remainingQuantity: r.remainingQuantity,
    }),
    position: Object.freeze({
      startingPosition: r.startingPosition,
      endingPosition: r.endingPosition,
    }),
    conclusion: Object.freeze({
      authenticatedLiveCanaryStatus: 'FULL_FILL_RECONCILED' as const,
      authenticatedOwnFillTruthProven: true as const,
      postOnlyMakerExecutionProven: true as const,
      fullFillConservationProven: true as const,
      positionConservationProven: true as const,
      externalCounterpartyRequired: true as const,
      selfTradePermitted: false as const,
      counterpartyIdentityProven: false as const,
      historicalQueuePositionClaimed: false as const,
      orderBookPriorityClaimed: false as const,
    }),
    boundary: Object.freeze({
      liveExecutionEnabled: false as const,
      venueMutationEnabled: false as const,
      operatorMediatedExecution: true as const,
      automatedLiveExecutionAuthorized: false as const,
      signerInfrastructureEnabled: false as const,
      passiveRecyclingSubmissionEnabled: false as const,
    }),
    mutationCounters,
  });
  return Object.freeze({
    ...body,
    manifestBodyHashSha256: sha256(canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(body)),
  });
}

export function freezeDecibelAuthenticatedLiveCanarySuccessManifestV1(input: {
  manifest: ReturnType<typeof buildDecibelAuthenticatedLiveCanarySuccessManifestV1>;
  outputPath: string;
}) {
  const bytes = `${canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(input.manifest)}\n`;
  try {
    writeFileSync(input.outputPath, bytes, { encoding: 'utf8', flag: 'wx' });
    return Object.freeze({ status: 'FROZEN' as const, manifestSha256: sha256(bytes) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = readFileSync(input.outputPath, 'utf8');
    if (existing !== bytes) fail('AUTHENTICATED_CANARY_SUCCESS_MANIFEST_CONFLICT');
    return Object.freeze({ status: 'ALREADY_FROZEN' as const, manifestSha256: sha256(bytes) });
  }
}
