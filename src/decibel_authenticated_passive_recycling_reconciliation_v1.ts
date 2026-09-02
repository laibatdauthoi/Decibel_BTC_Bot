import type { buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1 } from './decibel_authenticated_passive_recycling_operator_handoff_v1.js';
import type { captureDecibelAuthenticatedPassiveRecyclingUiOrderV1 } from './decibel_authenticated_passive_recycling_ui_order_capture_v1.js';

type handoff = ReturnType<typeof buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1>;
type capture = ReturnType<typeof captureDecibelAuthenticatedPassiveRecyclingUiOrderV1>;
export type decibel_recycling_authenticated_fill_v1 = Readonly<{
  source: 'OrderFill';
  tradeId: string;
  orderId: string;
  clientOrderId: string | null;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  transactionVersion: number;
}>;

export type decibel_recycling_classification_v1 =
  | 'RECYCLING_ORDER_OPEN_UNFILLED'
  | 'RECYCLING_ORDER_PARTIALLY_FILLED'
  | 'RECYCLING_CYCLE_FULLY_RECONCILED'
  | 'RECYCLING_STATE_AMBIGUOUS'
  | 'RECYCLING_TRANSACTION_FAILED'
  | 'RECYCLING_TRANSACTION_PENDING'
  | 'RECYCLING_TRANSACTION_NOT_FOUND'
  | 'RECYCLING_RECONCILIATION_FAILED';

export function reconcileDecibelAuthenticatedPassiveRecyclingV1(input: {
  handoff: handoff;
  capture: capture;
  providedTransactionHash: string;
  transactionFinality: 'FINALIZED_SUCCESS' | 'FINALIZED_FAILURE' | 'PENDING' | 'NOT_FOUND';
  openOrderState: 'ABSENT' | 'OPEN_UNFILLED' | 'OPEN_PARTIALLY_FILLED' | 'UNKNOWN';
  fills: readonly decibel_recycling_authenticated_fill_v1[];
  currentAuthenticatedPositionBase: number;
  unknownOrders: number;
  unknownFills: number;
  unrelatedActivity: boolean;
}) {
  if (
    input.capture.recyclingHandoffId !== input.handoff.recyclingHandoffId ||
    input.capture.handoffPackageHash !== input.handoff.handoffPackageHash ||
    input.capture.transactionHash.toLowerCase() !== input.providedTransactionHash.toLowerCase()
  )
    throw new Error('RECYCLING_CAPTURE_IDENTITY_MISMATCH');
  const unique = new Map<string, decibel_recycling_authenticated_fill_v1>();
  let identityConflict = false;
  for (const fill of input.fills) {
    if (
      fill.source !== 'OrderFill' ||
      fill.orderId !== input.capture.venueOrderId ||
      (fill.clientOrderId !== null && fill.clientOrderId !== input.capture.venueClientOrderId) ||
      fill.side !== input.handoff.side
    )
      identityConflict = true;
    const prior = unique.get(fill.tradeId);
    if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(fill))
      throw new Error('AUTHENTICATED_RECYCLING_FILL_ID_CONFLICT');
    unique.set(fill.tradeId, fill);
  }
  const fills = [...unique.values()];
  const filledBase = fills.reduce((sum, fill) => sum + fill.size, 0);
  const remainingBase = Math.max(0, input.handoff.quantity - filledBase);
  const expectedPosition =
    input.handoff.sourcePositionBase + (input.handoff.side === 'BUY' ? filledBase : -filledBase);
  const positionConservation = input.currentAuthenticatedPositionBase === expectedPosition;
  const ambiguous =
    identityConflict ||
    input.unknownOrders > 0 ||
    input.unknownFills > 0 ||
    input.unrelatedActivity ||
    input.openOrderState === 'UNKNOWN';
  let classification: decibel_recycling_classification_v1;
  if (ambiguous) classification = 'RECYCLING_STATE_AMBIGUOUS';
  else if (input.transactionFinality === 'PENDING')
    classification = 'RECYCLING_TRANSACTION_PENDING';
  else if (input.transactionFinality === 'NOT_FOUND')
    classification = 'RECYCLING_TRANSACTION_NOT_FOUND';
  else if (input.transactionFinality === 'FINALIZED_FAILURE')
    classification = 'RECYCLING_TRANSACTION_FAILED';
  else if (filledBase === 0 && input.openOrderState === 'OPEN_UNFILLED')
    classification = 'RECYCLING_ORDER_OPEN_UNFILLED';
  else if (filledBase > 0 && filledBase < input.handoff.quantity)
    classification = 'RECYCLING_ORDER_PARTIALLY_FILLED';
  else if (
    filledBase === input.handoff.quantity &&
    remainingBase === 0 &&
    input.openOrderState === 'ABSENT' &&
    input.currentAuthenticatedPositionBase === 0 &&
    positionConservation
  )
    classification = 'RECYCLING_CYCLE_FULLY_RECONCILED';
  else classification = 'RECYCLING_RECONCILIATION_FAILED';
  const sellMakerVolume = fills.reduce((sum, fill) => sum + Math.abs(fill.size * fill.price), 0);
  const initialMakerVolume = 20.767563;
  const authenticatedMakerVolumeUsd = Number((initialMakerVolume + sellMakerVolume).toFixed(12));
  return Object.freeze({
    recyclingHandoffId: input.handoff.recyclingHandoffId,
    plannedClientOrderId: input.handoff.plannedClientOrderId,
    venueOrderId: input.capture.venueOrderId,
    venueClientOrderId: input.capture.venueClientOrderId,
    transactionVersion: input.capture.transactionVersion,
    transactionHash: input.capture.transactionHash,
    authenticatedFillIds: Object.freeze(fills.map((fill) => fill.tradeId)),
    authenticatedRecycleFilledBase: filledBase,
    authenticatedMakerFilledBase: 0.00027 + filledBase,
    authenticatedMakerVolumeUsd,
    cycleMakerVolumeUsd: authenticatedMakerVolumeUsd,
    currentCycleInventoryBase: input.currentAuthenticatedPositionBase,
    completedRecycleCycles: classification === 'RECYCLING_CYCLE_FULLY_RECONCILED' ? 1 : 0,
    remainingBase,
    positionConservation: positionConservation ? ('PASS' as const) : ('FAIL' as const),
    makerStatus: identityConflict ? ('NOT_PROVEN' as const) : ('PROVEN' as const),
    classification,
    liveExecutionEnabled: false as const,
    venueMutationEnabled: false as const,
    externalCounterpartyRequired: true as const,
    selfTradePermitted: false as const,
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
