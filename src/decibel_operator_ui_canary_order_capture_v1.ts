import { createHash } from 'node:crypto';
import type { decibel_minimal_live_canary_operator_handoff_v1 } from './decibel_minimal_live_canary_operator_handoff_v1.js';

export const DECIBEL_OPERATOR_UI_CANARY_ORDER_CAPTURE_V1 =
  'DECIBEL_OPERATOR_UI_CANARY_ORDER_CAPTURE_V1' as const;
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
  | 'UI_CANARY_TRANSACTION_IDENTITY_MISMATCH';

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
export function matchDecibelOperatorUiCanaryOrdersV1(input: {
  handoff: decibel_minimal_live_canary_operator_handoff_v1;
  baselineOrderIds: ReadonlySet<string>;
  orders: readonly decibel_ui_order_v1[];
  tickSize: number;
  lotSize: number;
}) {
  const postBaselineOrders = input.orders.filter(
    (order) =>
      !input.baselineOrderIds.has(order.orderId) && order.unixMs >= input.handoff.createdAt,
  );
  const earliestByOrderId = new Map<string, decibel_ui_order_v1>();
  for (const order of postBaselineOrders) {
    const prior = earliestByOrderId.get(order.orderId);
    if (
      prior === undefined ||
      order.transactionVersion < prior.transactionVersion ||
      (order.transactionVersion === prior.transactionVersion && order.unixMs < prior.unixMs)
    )
      earliestByOrderId.set(order.orderId, order);
  }
  const newOrders = [...earliestByOrderId.values()];
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
    newOrders: Object.freeze(newOrders),
    matching: Object.freeze(matching),
    activityExclusivity: newOrders.length <= 1,
    mismatchReason,
  });
}
export function verifyDecibelOperatorUiTransactionIntentV1(input: {
  handoff: decibel_minimal_live_canary_operator_handoff_v1;
  transaction: decibel_ui_transaction_v1;
}) {
  const args = input.transaction.arguments.map(normalize);
  if (input.transaction.entryFunction === null || args.length < 7) return 'UNPROVEN' as const;
  const expected = [
    input.handoff.subaccount,
    input.handoff.marketAddress,
    input.handoff.price,
    input.handoff.quantity,
    input.handoff.side === 'BUY',
    1,
    false,
  ].map(normalize);
  return input.transaction.entryFunction === input.handoff.entryFunction &&
    JSON.stringify(args.slice(0, 7)) === JSON.stringify(expected)
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
  if (!input.activityExclusivity) classification = 'UI_CAPTURE_ACTIVITY_EXCLUSIVITY_LOST';
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
