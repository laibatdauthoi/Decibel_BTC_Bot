import type { decibel_minimal_live_canary_operator_handoff_v1 } from './decibel_minimal_live_canary_operator_handoff_v1.js';

export type decibel_canary_reconciliation_classification_v1 =
  | 'CANARY_TRANSACTION_FAILED'
  | 'CANARY_FULL_FILL_RECONCILED'
  | 'CANARY_UNFILLED_OPEN_ORDER'
  | 'CANARY_PARTIAL_FILL'
  | 'CANARY_NO_FILL_ORDER_ABSENT'
  | 'CANARY_TRANSACTION_PENDING'
  | 'CANARY_TRANSACTION_NOT_FOUND'
  | 'CANARY_STATE_AMBIGUOUS'
  | 'CANARY_RECONCILIATION_FAILED';

export type decibel_canary_authenticated_fill_v1 = Readonly<{
  source: 'OrderFill';
  tradeId: string;
  orderId: string;
  clientOrderId: string;
  size: number;
  price: number;
  transactionVersion: number;
  feeAmount: number;
  isRebate: boolean;
}>;

export function reconcileDecibelMinimalLiveCanaryPostExecutionV1(input: {
  handoff: decibel_minimal_live_canary_operator_handoff_v1;
  providedTransactionHash: string;
  finality: Readonly<{
    status: 'PENDING' | 'NOT_FOUND' | 'FINALIZED_SUCCESS' | 'FINALIZED_FAILURE';
    transactionVersion?: number;
    vmStatus?: string;
  }>;
  transactionIdentityMatch: boolean;
  fills: readonly decibel_canary_authenticated_fill_v1[];
  makerStatusProven: boolean;
  openOrderState: 'ABSENT' | 'OPEN_UNFILLED' | 'OPEN_PARTIALLY_FILLED' | 'UNKNOWN';
  remainingQuantity: number;
  endingPosition: number;
  fillConservation: boolean;
  positionConservation: boolean;
  journalReconciliation: boolean;
  unknownOrders: number;
  unknownFills: number;
  unrelatedActivity: boolean;
}) {
  if (!/^0x[0-9a-f]{64}$/i.test(input.providedTransactionHash))
    throw new Error('TRANSACTION_HASH_REQUIRED');
  const unique = new Map<string, decibel_canary_authenticated_fill_v1>();
  let identityConflict = !input.transactionIdentityMatch;
  for (const fill of input.fills) {
    if (fill.source !== 'OrderFill' || fill.clientOrderId !== input.handoff.clientOrderId)
      identityConflict = true;
    const prior = unique.get(fill.tradeId);
    if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(fill))
      identityConflict = true;
    else unique.set(fill.tradeId, fill);
  }
  const fills = [...unique.values()];
  const filledQuantity = fills.reduce((sum, fill) => sum + fill.size, 0);
  const ambiguous =
    identityConflict ||
    input.unknownOrders > 0 ||
    input.unknownFills > 0 ||
    input.unrelatedActivity ||
    input.openOrderState === 'UNKNOWN';
  let classification: decibel_canary_reconciliation_classification_v1;
  if (ambiguous) classification = 'CANARY_STATE_AMBIGUOUS';
  else if (input.finality.status === 'PENDING') classification = 'CANARY_TRANSACTION_PENDING';
  else if (input.finality.status === 'NOT_FOUND') classification = 'CANARY_TRANSACTION_NOT_FOUND';
  else if (input.finality.status === 'FINALIZED_FAILURE')
    classification = 'CANARY_TRANSACTION_FAILED';
  else if (filledQuantity === 0 && input.openOrderState === 'OPEN_UNFILLED')
    classification = 'CANARY_UNFILLED_OPEN_ORDER';
  else if (filledQuantity > 0 && filledQuantity < input.handoff.quantity)
    classification = 'CANARY_PARTIAL_FILL';
  else if (filledQuantity === 0 && input.openOrderState === 'ABSENT')
    classification = 'CANARY_NO_FILL_ORDER_ABSENT';
  else if (
    filledQuantity === input.handoff.quantity &&
    input.remainingQuantity === 0 &&
    input.openOrderState === 'ABSENT' &&
    input.makerStatusProven &&
    input.fillConservation &&
    input.positionConservation &&
    input.journalReconciliation
  )
    classification = 'CANARY_FULL_FILL_RECONCILED';
  else classification = 'CANARY_RECONCILIATION_FAILED';
  const reconciled = classification === 'CANARY_FULL_FILL_RECONCILED';
  return Object.freeze({
    handoffPackageHash: input.handoff.handoffPackageHash,
    canaryId: input.handoff.canaryId,
    executionSessionId: input.handoff.executionSessionId,
    providedTransactionHash: input.providedTransactionHash,
    precommittedTransactionHash: input.handoff.precommittedTransactionHash,
    transactionIdentityMatch: !identityConflict,
    transactionFinality: input.finality.status,
    transactionVersion: input.finality.transactionVersion ?? null,
    transactionSuccess: input.finality.status === 'FINALIZED_SUCCESS',
    vmStatus: input.finality.vmStatus ?? null,
    clientOrderId: input.handoff.clientOrderId,
    side: input.handoff.side,
    orderPrice: input.handoff.price,
    orderQuantity: input.handoff.quantity,
    authenticatedFillCount: fills.length,
    authenticatedFilledQuantity: filledQuantity,
    weightedAverageFillPrice:
      filledQuantity === 0
        ? null
        : fills.reduce((sum, fill) => sum + fill.price * fill.size, 0) / filledQuantity,
    fillIds: Object.freeze(fills.map((fill) => fill.tradeId)),
    fees: fills.reduce((sum, fill) => sum + fill.feeAmount, 0),
    rebates: fills.reduce((sum, fill) => sum + (fill.isRebate ? fill.feeAmount : 0), 0),
    makerStatus: input.makerStatusProven ? 'PROVEN' : 'NOT_PROVEN',
    startingPosition: 0,
    endingPosition: input.endingPosition,
    positionConservation: input.positionConservation ? 'PASS' : 'FAIL',
    fillConservation: input.fillConservation ? 'PASS' : 'FAIL',
    openOrderState: input.openOrderState,
    remainingQuantity: input.remainingQuantity,
    unknownOrders: input.unknownOrders,
    unknownFills: input.unknownFills,
    activityExclusivity: !input.unrelatedActivity,
    journalStatus: input.journalReconciliation ? 'PASS' : 'FAIL',
    unresolvedState: !reconciled,
    classification,
    canaryReconciled: reconciled,
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
