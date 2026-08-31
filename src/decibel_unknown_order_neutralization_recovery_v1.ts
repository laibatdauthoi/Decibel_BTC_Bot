import type { decibel_submission_prepared_record_v1 } from './decibel_durable_client_order_identity_recovery_v1.js';
import type { decibel_zero_anchor_absolute_position_conservation_result_v1 } from './decibel_zero_anchor_absolute_position_conservation_proof_v1.js';

export const DECIBEL_UNKNOWN_ORDER_NEUTRALIZATION_RECOVERY_V1 =
  'DECIBEL_UNKNOWN_ORDER_NEUTRALIZATION_RECOVERY_V1' as const;

export type decibel_unknown_order_emergency_cancel_request_v1 = Readonly<{
  authorization: 'UNKNOWN_ORDER_EMERGENCY_CANCEL';
  subaccount: string;
  market: string;
  clientOrderId: string;
  product: 'perp';
  cancelAll: false;
  replacementPermitted: false;
  liveExecutionEnabled: false;
}>;

export function authorizeDecibelUnknownOrderEmergencyCancelV1(input: {
  prepared: decibel_submission_prepared_record_v1;
  journalState: 'SUBMISSION_STARTED' | 'RECOVERY_REQUIRED' | 'AMBIGUOUS';
  expectedSubaccount: string;
  expectedMarket: string;
  expectedClientOrderId: string;
}): decibel_unknown_order_emergency_cancel_request_v1 {
  if (
    input.prepared.account !== input.expectedSubaccount ||
    input.prepared.market !== input.expectedMarket ||
    input.prepared.clientOrderId !== input.expectedClientOrderId
  )
    throw new Error('DECIBEL_UNKNOWN_ORDER_CANCEL_IDENTITY_CONFLICT');
  return Object.freeze({
    authorization: 'UNKNOWN_ORDER_EMERGENCY_CANCEL',
    subaccount: input.prepared.account,
    market: input.prepared.market,
    clientOrderId: input.prepared.clientOrderId,
    product: 'perp',
    cancelAll: false,
    replacementPermitted: false,
    liveExecutionEnabled: false,
  });
}

export type decibel_unknown_order_exposure_neutralization_v1 = Readonly<{
  result:
    | 'OPEN_ORDER_CANCELLED'
    | 'ALREADY_TERMINAL'
    | 'NO_OPEN_ORDER_PROVEN'
    | 'CANCEL_RESULT_AMBIGUOUS'
    | 'CANCEL_FAILED';
  authoritative: boolean;
  noLiveRestingOrderProven: boolean;
  transactionVersion: number | null;
}>;

export function classifyDecibelUnknownOrderExposureNeutralizationV1(input: {
  cancelOutcome:
    | 'OPEN_ORDER_CANCELLED_AUTHORITATIVE'
    | 'ALREADY_TERMINAL_AUTHORITATIVE'
    | 'NO_OPEN_ORDER_AUTHORITATIVE'
    | 'NOT_FOUND_UNQUALIFIED'
    | 'TRANSPORT_FAILURE'
    | 'VENUE_FAILURE';
  transactionVersion?: number;
}): decibel_unknown_order_exposure_neutralization_v1 {
  const authoritative = input.cancelOutcome.endsWith('_AUTHORITATIVE');
  const result =
    input.cancelOutcome === 'OPEN_ORDER_CANCELLED_AUTHORITATIVE'
      ? 'OPEN_ORDER_CANCELLED'
      : input.cancelOutcome === 'ALREADY_TERMINAL_AUTHORITATIVE'
        ? 'ALREADY_TERMINAL'
        : input.cancelOutcome === 'NO_OPEN_ORDER_AUTHORITATIVE'
          ? 'NO_OPEN_ORDER_PROVEN'
          : input.cancelOutcome === 'NOT_FOUND_UNQUALIFIED' ||
              input.cancelOutcome === 'TRANSPORT_FAILURE'
            ? 'CANCEL_RESULT_AMBIGUOUS'
            : 'CANCEL_FAILED';
  return Object.freeze({
    result,
    authoritative,
    noLiveRestingOrderProven: authoritative,
    transactionVersion: input.transactionVersion ?? null,
  });
}

export type decibel_unknown_order_trade_row_v1 = Readonly<{
  account: string;
  market: string;
  source: 'OrderFill';
  tradeId: string;
  orderId: string;
  clientOrderId: string;
  size: string;
  price: string;
  transactionVersion: number;
  authenticated: true;
}>;

export type decibel_unknown_order_execution_identity_v1 = Readonly<{
  uniqueFills: readonly decibel_unknown_order_trade_row_v1[];
  venueOrderId: string | null;
  cumulativeFillQuantity: string;
}>;

type decimal_value = Readonly<{ coefficient: bigint; scale: number }>;

function parseDecimal(value: string): decimal_value {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
    throw new Error('DECIBEL_UNKNOWN_ORDER_DECIMAL_INVALID');
  const [whole = '0', fraction = ''] = value.split('.');
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function renderSum(values: readonly string[]): string {
  const parsed = values.map(parseDecimal);
  const scale = parsed.reduce((maximum, value) => Math.max(maximum, value.scale), 0);
  const coefficient = parsed.reduce(
    (sum, value) => sum + value.coefficient * 10n ** BigInt(scale - value.scale),
    0n,
  );
  if (scale === 0) return coefficient.toString();
  const raw = coefficient.toString().padStart(scale + 1, '0');
  return `${raw.slice(0, -scale)}.${raw.slice(-scale)}`.replace(/\.?0+$/, '') || '0';
}

export function recoverDecibelExecutionIdentityFromClientOrderTradesV1(input: {
  account: string;
  market: string;
  clientOrderId: string;
  rows: readonly decibel_unknown_order_trade_row_v1[];
}): decibel_unknown_order_execution_identity_v1 {
  const unique = new Map<string, decibel_unknown_order_trade_row_v1>();
  const venueOrderIds = new Set<string>();
  for (const row of input.rows) {
    if (
      !row.authenticated ||
      row.source !== 'OrderFill' ||
      row.account !== input.account ||
      row.market !== input.market ||
      row.clientOrderId !== input.clientOrderId ||
      !row.tradeId ||
      !row.orderId ||
      parseDecimal(row.size).coefficient <= 0n ||
      parseDecimal(row.price).coefficient <= 0n
    )
      throw new Error('DECIBEL_UNKNOWN_ORDER_TRADE_OUT_OF_SCOPE');
    const previous = unique.get(row.tradeId);
    if (previous !== undefined) {
      if (JSON.stringify(previous) !== JSON.stringify(row))
        throw new Error('DECIBEL_UNKNOWN_ORDER_TRADE_ID_CONFLICT');
    } else {
      unique.set(row.tradeId, Object.freeze({ ...row }));
      venueOrderIds.add(row.orderId);
    }
  }
  if (venueOrderIds.size > 1)
    throw new Error('DECIBEL_CLIENT_ORDER_ID_MULTIPLE_VENUE_ORDER_CONFLICT');
  return Object.freeze({
    uniqueFills: Object.freeze([...unique.values()]),
    venueOrderId: [...venueOrderIds][0] ?? null,
    cumulativeFillQuantity: renderSum([...unique.values()].map((row) => row.size)),
  });
}

export type decibel_unknown_order_recovery_result_v1 = Readonly<{
  clientOrderId: string;
  recoveredVenueOrderId: string | null;
  matchingFillCount: number;
  exposureNeutralized: boolean;
  positionConservationClassification: decibel_zero_anchor_absolute_position_conservation_result_v1['finalClassification'];
  postOnlyMakerProofPreserved: boolean;
  automaticResubmissionPermitted: false;
  recoveryClassification:
    | 'UNKNOWN_ORDER_RECOVERED_NO_EXECUTION'
    | 'UNKNOWN_ORDER_RECOVERED_PARTIAL_EXECUTION'
    | 'UNKNOWN_ORDER_RECOVERED_FULL_EXECUTION'
    | 'CANCEL_RESULT_AMBIGUOUS'
    | 'CANARY_TERMINATION_UNSAFE';
  readyForActualFillInventoryAndVolumeRebuild: boolean;
  liveExecutionEnabled: false;
}>;

export function reconcileDecibelUnknownOrderAfterNeutralizationV1(input: {
  prepared: decibel_submission_prepared_record_v1;
  neutralization: decibel_unknown_order_exposure_neutralization_v1;
  executionIdentity: decibel_unknown_order_execution_identity_v1;
  positionConservation: decibel_zero_anchor_absolute_position_conservation_result_v1;
  requestedQuantity: string;
  postOnlyMakerProofPreserved: boolean;
}): decibel_unknown_order_recovery_result_v1 {
  if (!input.neutralization.noLiveRestingOrderProven)
    return Object.freeze({
      clientOrderId: input.prepared.clientOrderId,
      recoveredVenueOrderId: input.executionIdentity.venueOrderId,
      matchingFillCount: input.executionIdentity.uniqueFills.length,
      exposureNeutralized: false,
      positionConservationClassification: input.positionConservation.finalClassification,
      postOnlyMakerProofPreserved: input.postOnlyMakerProofPreserved,
      automaticResubmissionPermitted: false,
      recoveryClassification: 'CANCEL_RESULT_AMBIGUOUS',
      readyForActualFillInventoryAndVolumeRebuild: false,
      liveExecutionEnabled: false,
    });
  if (
    !input.positionConservation.quantityMatch ||
    input.positionConservation.fillQuantity !== input.executionIdentity.cumulativeFillQuantity
  )
    return unsafe(input);
  const noExecution = input.executionIdentity.uniqueFills.length === 0;
  if (noExecution) {
    if (input.positionConservation.finalClassification !== 'NO_EXECUTION_RECONCILED')
      return unsafe(input);
    return success(input, 'UNKNOWN_ORDER_RECOVERED_NO_EXECUTION');
  }
  if (
    input.executionIdentity.venueOrderId === null ||
    !input.postOnlyMakerProofPreserved ||
    input.positionConservation.finalClassification !==
      'COMPLETE_BY_ZERO_ANCHOR_POSITION_MAGNITUDE_CONSERVATION'
  )
    return unsafe(input);
  return success(
    input,
    input.executionIdentity.cumulativeFillQuantity === input.requestedQuantity
      ? 'UNKNOWN_ORDER_RECOVERED_FULL_EXECUTION'
      : 'UNKNOWN_ORDER_RECOVERED_PARTIAL_EXECUTION',
  );
}

function success(
  input: Parameters<typeof reconcileDecibelUnknownOrderAfterNeutralizationV1>[0],
  classification:
    | 'UNKNOWN_ORDER_RECOVERED_NO_EXECUTION'
    | 'UNKNOWN_ORDER_RECOVERED_PARTIAL_EXECUTION'
    | 'UNKNOWN_ORDER_RECOVERED_FULL_EXECUTION',
): decibel_unknown_order_recovery_result_v1 {
  return Object.freeze({
    clientOrderId: input.prepared.clientOrderId,
    recoveredVenueOrderId: input.executionIdentity.venueOrderId,
    matchingFillCount: input.executionIdentity.uniqueFills.length,
    exposureNeutralized: true,
    positionConservationClassification: input.positionConservation.finalClassification,
    postOnlyMakerProofPreserved: input.postOnlyMakerProofPreserved,
    automaticResubmissionPermitted: false,
    recoveryClassification: classification,
    readyForActualFillInventoryAndVolumeRebuild: true,
    liveExecutionEnabled: false,
  });
}

function unsafe(
  input: Parameters<typeof reconcileDecibelUnknownOrderAfterNeutralizationV1>[0],
): decibel_unknown_order_recovery_result_v1 {
  return Object.freeze({
    clientOrderId: input.prepared.clientOrderId,
    recoveredVenueOrderId: input.executionIdentity.venueOrderId,
    matchingFillCount: input.executionIdentity.uniqueFills.length,
    exposureNeutralized: true,
    positionConservationClassification: input.positionConservation.finalClassification,
    postOnlyMakerProofPreserved: input.postOnlyMakerProofPreserved,
    automaticResubmissionPermitted: false,
    recoveryClassification: 'CANARY_TERMINATION_UNSAFE',
    readyForActualFillInventoryAndVolumeRebuild: false,
    liveExecutionEnabled: false,
  });
}

export const DecibelUnknownOrderNeutralizationRecoveryAuditV1 = Object.freeze({
  cancelByClientOrderIdAvailable: true,
  cancelContract: 'cancel_client_order_to_subaccount(signer, subaccount, client_order_id, market)',
  openCancelOutcome: 'AUTHORITATIVE_SUCCESS_CAN_NEUTRALIZE',
  partiallyFilledOpenCancelOutcome: 'AUTHORITATIVE_SUCCESS_CAN_NEUTRALIZE_REMAINDER',
  filledCancelOutcome: 'UNPROVEN',
  alreadyCancelledCancelOutcome: 'UNPROVEN',
  nonexistentCancelOutcome: 'UNPROVEN',
  wrongMarketOutcome: 'E_MARKET_NOT_FOUND_OR_FAILURE',
  wrongSubaccountOutcome: 'AUTHORITY_OR_PENDING_ORDER_FAILURE',
  tradeHistoryClientOrderId: 'AVAILABLE_VIA_SDK',
  terminalClientOrderLookup: 'PARTIAL',
  clientOrderLookupVisibility: 'UNPROVEN',
  canaryRecoveryDependsOnTerminalOrderRetention: false,
  unknownOrderExposureNeutralization: 'PARTIAL',
  canaryOrderLineageDurability: 'PARTIAL',
  minimalLiveCanaryReconciliationReady: false,
  generalAuthenticatedReconciliationReady: false,
  smallestRemainingBlocker: 'CANCEL_TERMINAL_AND_NONEXISTENT_OUTCOME_SEMANTICS_UNPROVEN',
  ambiguousSubmissionDuplicateRisk: 'ELIMINATED_BY_NO_RESUBMISSION',
  liveExecutionEnabled: false,
  signerInitialized: false,
} as const);
