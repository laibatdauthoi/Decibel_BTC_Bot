import { createHash } from 'node:crypto';
import type { decibel_minimal_live_canary_operator_handoff_v1 } from './decibel_minimal_live_canary_operator_handoff_v1.js';

export const DECIBEL_OPERATOR_UI_CANARY_ORDER_CAPTURE_V1 =
  'DECIBEL_OPERATOR_UI_CANARY_ORDER_CAPTURE_V1' as const;
export const DECIBEL_MAX_HISTORY_RANGE_MS = 15_552_000_000 as const;

export function getDecibelUiCaptureBaselineRangeV1(handoffCreatedAt: number): Readonly<{
  startTimestamp: number;
  endTimestamp: number;
}> {
  if (!Number.isSafeInteger(handoffCreatedAt) || handoffCreatedAt < 0)
    throw new Error('UI_CAPTURE_HANDOFF_TIMESTAMP_INVALID');
  return Object.freeze({
    startTimestamp: Math.max(0, handoffCreatedAt - DECIBEL_MAX_HISTORY_RANGE_MS + 1),
    endTimestamp: handoffCreatedAt,
  });
}
export type decibel_ui_order_v1 = Readonly<{
  parent: string;
  market: string;
  clientOrderId: string;
  orderId: string;
  status: string;
  orderType: string;
  isBuy: boolean;
  origSize: number | null;
  remainingSize: number | null;
  price: number | null;
  transactionVersion: number;
  unixMs: number;
}>;
export type decibel_ui_transaction_v1 = Readonly<{
  hash: string;
  version: number;
  success: boolean;
  vmStatus: string | null;
  sender: string | null;
  entryFunction: string | null;
  arguments: readonly unknown[];
  timestamp: number | null;
}>;
export type decibel_ui_order_placement_lineage_classification_v1 =
  'PROVEN_OPERATOR_PLACEMENT' | 'PROVEN_NON_PLACEMENT' | 'UNPROVEN';
export type decibel_ui_order_placement_lineage_v1 = Readonly<{
  orderId: string;
  clientOrderId: string;
  transactionVersion: number;
  transactionHash: string | null;
  entryFunction: string | null;
  sender: string | null;
  classification: decibel_ui_order_placement_lineage_classification_v1;
  contradiction: string | null;
}>;
export type decibel_ui_capture_classification_v1 =
  | 'UI_CANARY_ORDER_CAPTURED'
  | 'UI_CANARY_ORDER_NOT_FOUND'
  | 'UI_CANARY_ORDER_AMBIGUOUS'
  | 'UI_CANARY_PRICE_MISMATCH'
  | 'UI_CANARY_SIZE_MISMATCH'
  | 'UI_CANARY_SIDE_MISMATCH'
  | 'UI_CANARY_MARKET_MISMATCH'
  | 'UI_CANARY_ACCOUNT_UNPROVEN'
  | 'UI_CAPTURE_ACTIVITY_EXCLUSIVITY_LOST'
  | 'UI_CANARY_TRANSACTION_VERSION_UNAVAILABLE'
  | 'UI_CANARY_TX_HASH_UNRESOLVED'
  | 'UI_CANARY_TRANSACTION_IDENTITY_UNPROVEN'
  | 'UI_CANARY_TRANSACTION_IDENTITY_MISMATCH'
  | 'UNPROVEN_ORDER_TRANSACTION_LINEAGE'
  | 'ORDER_HISTORY_TRANSACTION_CONTRADICTION';

const ACCEPTED_DECIBEL_PLACEMENT_ENTRY_FUNCTIONS = Object.freeze([
  'dex_accounts_entry::place_order_to_subaccount',
] as const);
const DECIBEL_PRICE_WIRE_SCALE = 1_000_000;
const DECIBEL_SIZE_WIRE_SCALE = 100_000_000;

function aligned(value: number, increment: number) {
  const steps = value / increment;
  return Number.isFinite(steps) && Math.abs(steps - Math.round(steps)) < 1e-8;
}
const normalize = (value: unknown) =>
  value === null
    ? undefined
    : typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
      ? Number(value)
      : value;
const sameAddress = (left: unknown, right: string) =>
  typeof left === 'string' && left.toLowerCase() === right.toLowerCase();
const sameWireNumber = (wire: unknown, value: number | null, scale: number) => {
  const numeric = normalize(wire);
  const equal = (left: number, right: number) =>
    Math.abs(left - right) <= Math.max(1e-12, Math.abs(right) * 1e-12);
  return (
    value !== null &&
    typeof numeric === 'number' &&
    Number.isFinite(numeric) &&
    (equal(numeric, value) || equal(numeric / scale, value))
  );
};
const isAcceptedPlacementFunction = (entryFunction: string) =>
  ACCEPTED_DECIBEL_PLACEMENT_ENTRY_FUNCTIONS.some((suffix) => entryFunction.endsWith(suffix));

export function classifyDecibelOperatorUiOrderPlacementLineageV1(input: {
  handoff: decibel_minimal_live_canary_operator_handoff_v1;
  order: decibel_ui_order_v1;
  transaction: decibel_ui_transaction_v1 | null;
}): decibel_ui_order_placement_lineage_v1 {
  const { order, transaction } = input;
  if (transaction?.entryFunction === null || transaction === null)
    return Object.freeze({
      orderId: order.orderId,
      clientOrderId: order.clientOrderId,
      transactionVersion: order.transactionVersion,
      transactionHash: transaction?.hash ?? null,
      entryFunction: transaction?.entryFunction ?? null,
      sender: transaction?.sender ?? null,
      classification: 'UNPROVEN',
      contradiction: null,
    });
  if (!isAcceptedPlacementFunction(transaction.entryFunction))
    return Object.freeze({
      orderId: order.orderId,
      clientOrderId: order.clientOrderId,
      transactionVersion: order.transactionVersion,
      transactionHash: transaction.hash,
      entryFunction: transaction.entryFunction,
      sender: transaction.sender,
      classification: 'PROVEN_NON_PLACEMENT',
      contradiction: null,
    });
  const args = transaction.arguments;
  let contradiction: string | null = null;
  if (transaction.version !== order.transactionVersion)
    contradiction = 'PLACEMENT_TRANSACTION_VERSION_MISMATCH';
  else if (!transaction.success) contradiction = 'PLACEMENT_TRANSACTION_NOT_SUCCESSFUL';
  else if (args.length < 7) contradiction = 'PLACEMENT_PAYLOAD_INSUFFICIENT';
  else if (!sameAddress(args[0], order.parent) || !sameAddress(args[0], input.handoff.subaccount))
    contradiction = 'PLACEMENT_SUBACCOUNT_MISMATCH';
  else if (
    !sameAddress(args[1], order.market) ||
    !sameAddress(args[1], input.handoff.marketAddress)
  )
    contradiction = 'PLACEMENT_MARKET_MISMATCH';
  else if (!sameWireNumber(args[2], order.price, DECIBEL_PRICE_WIRE_SCALE))
    contradiction = 'PLACEMENT_PRICE_MISMATCH';
  else if (!sameWireNumber(args[3], order.origSize, DECIBEL_SIZE_WIRE_SCALE))
    contradiction = 'PLACEMENT_QUANTITY_MISMATCH';
  else if (normalize(args[4]) !== order.isBuy) contradiction = 'PLACEMENT_SIDE_MISMATCH';
  else if (normalize(args[5]) !== 1 || order.orderType.toLowerCase() !== 'limit')
    contradiction = 'PLACEMENT_ORDER_TYPE_MISMATCH';
  else if (
    args.length >= 8 &&
    typeof args[7] === 'string' &&
    args[7].length > 0 &&
    args[7] !== order.clientOrderId
  )
    contradiction = 'PLACEMENT_CLIENT_ORDER_ID_MISMATCH';
  return Object.freeze({
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    transactionVersion: order.transactionVersion,
    transactionHash: transaction.hash,
    entryFunction: transaction.entryFunction,
    sender: transaction.sender,
    classification: contradiction === null ? 'PROVEN_OPERATOR_PLACEMENT' : 'UNPROVEN',
    contradiction,
  });
}

export function deduplicateDecibelOperatorUiOrderRowsV1(
  orders: readonly decibel_ui_order_v1[],
): readonly decibel_ui_order_v1[] {
  const earliestByOrderId = new Map<string, decibel_ui_order_v1>();
  for (const order of orders) {
    const prior = earliestByOrderId.get(order.orderId);
    if (
      prior === undefined ||
      order.transactionVersion < prior.transactionVersion ||
      (order.transactionVersion === prior.transactionVersion && order.unixMs < prior.unixMs)
    )
      earliestByOrderId.set(order.orderId, order);
  }
  return Object.freeze([...earliestByOrderId.values()]);
}
export function matchDecibelOperatorUiCanaryOrdersV1(input: {
  handoff: decibel_minimal_live_canary_operator_handoff_v1;
  baselineOrderIds: ReadonlySet<string>;
  orders: readonly decibel_ui_order_v1[];
  tickSize: number;
  lotSize: number;
  placementLineage?: readonly decibel_ui_order_placement_lineage_v1[];
}) {
  const postBaselineOrders = input.orders.filter(
    (order) =>
      !input.baselineOrderIds.has(order.orderId) && order.unixMs >= input.handoff.createdAt,
  );
  const rawNewOrderRows = Object.freeze([...postBaselineOrders]);
  const uniqueOrders = deduplicateDecibelOperatorUiOrderRowsV1(postBaselineOrders);
  const lineageByOrderId = new Map(input.placementLineage?.map((value) => [value.orderId, value]));
  const newOrders = input.placementLineage
    ? uniqueOrders.filter(
        (order) =>
          lineageByOrderId.get(order.orderId)?.classification === 'PROVEN_OPERATOR_PLACEMENT',
      )
    : uniqueOrders;
  const provenNonPlacementRows = uniqueOrders.filter(
    (order) => lineageByOrderId.get(order.orderId)?.classification === 'PROVEN_NON_PLACEMENT',
  );
  const unprovenLineageRows = uniqueOrders.filter(
    (order) => lineageByOrderId.get(order.orderId)?.classification === 'UNPROVEN',
  );
  const relevantUnprovenRows = unprovenLineageRows.filter(
    (order) =>
      order.parent === input.handoff.subaccount && order.market === input.handoff.marketAddress,
  );
  const contradictions = (input.placementLineage ?? []).filter(
    (value) => value.contradiction !== null,
  );
  const matching = newOrders.filter(
    (order) =>
      order.parent === input.handoff.subaccount &&
      order.market === input.handoff.marketAddress &&
      order.isBuy === (input.handoff.side === 'BUY') &&
      order.price !== null &&
      aligned(order.price, input.tickSize) &&
      order.price === input.handoff.price &&
      order.origSize !== null &&
      aligned(order.origSize, input.lotSize) &&
      order.origSize === input.handoff.quantity &&
      order.orderType.toLowerCase() === 'limit',
  );
  const sole = newOrders.length === 1 ? newOrders[0]! : null;
  let mismatchReason: decibel_ui_capture_classification_v1 | null = null;
  if (sole !== null) {
    if (!sole.parent || sole.parent !== input.handoff.subaccount)
      mismatchReason = 'UI_CANARY_ACCOUNT_UNPROVEN';
    else if (sole.market !== input.handoff.marketAddress)
      mismatchReason = 'UI_CANARY_MARKET_MISMATCH';
    else if (sole.isBuy !== (input.handoff.side === 'BUY'))
      mismatchReason = 'UI_CANARY_SIDE_MISMATCH';
    else if (
      sole.price === null ||
      !aligned(sole.price, input.tickSize) ||
      sole.price !== input.handoff.price
    )
      mismatchReason = 'UI_CANARY_PRICE_MISMATCH';
    else if (
      sole.origSize === null ||
      !aligned(sole.origSize, input.lotSize) ||
      sole.origSize !== input.handoff.quantity
    )
      mismatchReason = 'UI_CANARY_SIZE_MISMATCH';
  }
  return Object.freeze({
    rawNewOrderRows,
    uniqueOrders,
    newOrders: Object.freeze(newOrders),
    matching: Object.freeze(matching),
    provenNonPlacementRows: Object.freeze(provenNonPlacementRows),
    unprovenLineageRows: Object.freeze(unprovenLineageRows),
    contradictions: Object.freeze(contradictions),
    activityExclusivity:
      newOrders.length <= 1 && relevantUnprovenRows.length === 0 && contradictions.length === 0,
    lineageBlocker:
      contradictions.length > 0
        ? ('ORDER_HISTORY_TRANSACTION_CONTRADICTION' as const)
        : relevantUnprovenRows.length > 0
          ? ('UNPROVEN_ORDER_TRANSACTION_LINEAGE' as const)
          : null,
    mismatchReason,
  });
}
export function verifyDecibelOperatorUiTransactionIntentV1(input: {
  handoff: decibel_minimal_live_canary_operator_handoff_v1;
  transaction: decibel_ui_transaction_v1;
}) {
  const args = input.transaction.arguments.map(normalize);
  if (input.transaction.entryFunction === null || args.length < 7) return 'UNPROVEN' as const;
  return input.transaction.entryFunction === input.handoff.entryFunction &&
    sameAddress(args[0], input.handoff.subaccount) &&
    sameAddress(args[1], input.handoff.marketAddress) &&
    sameWireNumber(args[2], input.handoff.price, DECIBEL_PRICE_WIRE_SCALE) &&
    sameWireNumber(args[3], input.handoff.quantity, DECIBEL_SIZE_WIRE_SCALE) &&
    args[4] === (input.handoff.side === 'BUY') &&
    args[5] === 1 &&
    args[6] === false
    ? ('YES' as const)
    : ('NO' as const);
}
export function buildDecibelOperatorUiCanaryCaptureV1(input: {
  handoff: decibel_minimal_live_canary_operator_handoff_v1;
  handoffArtifactPath: string;
  baselineOrderIds: readonly string[];
  baselineClientOrderIds: readonly string[];
  baselineTransactionVersions: readonly number[];
  candidateCount: number;
  matchingCandidates: readonly decibel_ui_order_v1[];
  candidateMismatchReason?: decibel_ui_capture_classification_v1 | null;
  transaction: decibel_ui_transaction_v1 | null;
  activityExclusivity: boolean;
  rawNewOrderRows?: readonly decibel_ui_order_v1[];
  uniqueOrderIds?: readonly string[];
  placementLineage?: readonly decibel_ui_order_placement_lineage_v1[];
  provenOperatorPlacementCandidates?: readonly decibel_ui_order_v1[];
  provenNonPlacementRows?: readonly decibel_ui_order_v1[];
  unprovenLineageRows?: readonly decibel_ui_order_v1[];
  exclusivityFailures?: readonly string[];
  captureStartAt: number;
  capturedAt: number;
}) {
  const order = input.matchingCandidates[0] ?? null;
  const identity =
    input.transaction === null
      ? 'UNPROVEN'
      : verifyDecibelOperatorUiTransactionIntentV1({
          handoff: input.handoff,
          transaction: input.transaction,
        });
  let classification: decibel_ui_capture_classification_v1;
  if (input.exclusivityFailures?.includes('ORDER_HISTORY_TRANSACTION_CONTRADICTION'))
    classification = 'ORDER_HISTORY_TRANSACTION_CONTRADICTION';
  else if (input.exclusivityFailures?.includes('UNPROVEN_ORDER_TRANSACTION_LINEAGE'))
    classification = 'UNPROVEN_ORDER_TRANSACTION_LINEAGE';
  else if (!input.activityExclusivity) classification = 'UI_CAPTURE_ACTIVITY_EXCLUSIVITY_LOST';
  else if (input.matchingCandidates.length === 0)
    classification = input.candidateMismatchReason ?? 'UI_CANARY_ORDER_NOT_FOUND';
  else if (input.matchingCandidates.length > 1) classification = 'UI_CANARY_ORDER_AMBIGUOUS';
  else if (order?.transactionVersion === undefined)
    classification = 'UI_CANARY_TRANSACTION_VERSION_UNAVAILABLE';
  else if (input.transaction === null) classification = 'UI_CANARY_TX_HASH_UNRESOLVED';
  else if (identity === 'UNPROVEN') classification = 'UI_CANARY_TRANSACTION_IDENTITY_UNPROVEN';
  else if (identity === 'NO') classification = 'UI_CANARY_TRANSACTION_IDENTITY_MISMATCH';
  else classification = 'UI_CANARY_ORDER_CAPTURED';
  const captured = classification === 'UI_CANARY_ORDER_CAPTURED';
  const evidence = {
    handoffPackageHash: input.handoff.handoffPackageHash,
    venueOrderId: order?.orderId ?? null,
    venueClientOrderId: order?.clientOrderId ?? null,
    transactionVersion: order?.transactionVersion ?? null,
    transactionHash: input.transaction?.hash ?? null,
  };
  return Object.freeze({
    schemaVersion: DECIBEL_OPERATOR_UI_CANARY_ORDER_CAPTURE_V1,
    strategyIdentity: 'DECIBEL_MARKET_MAKER_V1' as const,
    handoffArtifactPath: input.handoffArtifactPath,
    handoffArtifactHash: input.handoff.handoffPackageHash,
    canaryId: input.handoff.canaryId,
    executionSessionId: input.handoff.executionSessionId,
    executionPackageHash: input.handoff.executionPackageHash,
    configuredSubaccount: input.handoff.subaccount,
    market: input.handoff.market,
    marketAddress: input.handoff.marketAddress,
    expectedSide: input.handoff.side,
    expectedPrice: input.handoff.price,
    expectedQuantity: input.handoff.quantity,
    handoffPlannedClientOrderId: input.handoff.clientOrderId,
    baselineOrderIds: Object.freeze([...input.baselineOrderIds]),
    baselineClientOrderIds: Object.freeze([...input.baselineClientOrderIds]),
    baselineTransactionVersions: Object.freeze([...input.baselineTransactionVersions]),
    rawNewOrderRows: Object.freeze([...(input.rawNewOrderRows ?? [])]),
    uniqueOrderIds: Object.freeze([...(input.uniqueOrderIds ?? [])]),
    placementLineage: Object.freeze([...(input.placementLineage ?? [])]),
    provenOperatorPlacementCandidates: Object.freeze([
      ...(input.provenOperatorPlacementCandidates ?? []),
    ]),
    provenNonPlacementRows: Object.freeze([...(input.provenNonPlacementRows ?? [])]),
    unprovenLineageRows: Object.freeze([...(input.unprovenLineageRows ?? [])]),
    candidateCount: input.candidateCount,
    matchingCandidateCount: input.matchingCandidates.length,
    venueOrderId: order?.orderId ?? null,
    venueClientOrderId: order?.clientOrderId ?? null,
    transactionVersion: order?.transactionVersion ?? null,
    transactionHash: input.transaction?.hash ?? null,
    orderStatus: order?.status ?? null,
    filledQuantity:
      order?.origSize === null || order === null
        ? null
        : order.origSize - (order.remainingSize ?? 0),
    remainingQuantity: order?.remainingSize ?? null,
    transactionSuccess: input.transaction?.success ?? null,
    vmStatus: input.transaction?.vmStatus ?? null,
    uiCanaryOrderCaptured: captured,
    uiCanaryTransactionIdentityMatch: identity,
    captureStartAt: input.captureStartAt,
    capturedAt: input.capturedAt,
    captureDurationMs: input.capturedAt - input.captureStartAt,
    activityExclusivity: input.activityExclusivity,
    exclusivityFailures: Object.freeze([...(input.exclusivityFailures ?? [])]),
    classification,
    blockers: Object.freeze(captured ? [] : [classification]),
    captureEvidenceHash: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
    liveExecutionEnabled: false as const,
    venueMutationEnabled: false as const,
    mutationCounters: Object.freeze({
      signedTransactions: 0 as const,
      submittedTransactions: 0 as const,
      placedOrders: 0 as const,
      cancelledOrders: 0 as const,
      replacedOrders: 0 as const,
      venueMutations: 0 as const,
    }),
  });
}
