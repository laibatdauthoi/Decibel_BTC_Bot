import type { decibel_unknown_order_exposure_neutralization_v1 } from './decibel_unknown_order_neutralization_recovery_v1.js';

export const DECIBEL_ONCHAIN_PENDING_ORDER_AUTHORITY_PROOF_V1 =
  'DECIBEL_ONCHAIN_PENDING_ORDER_AUTHORITY_PROOF_V1' as const;

export type decibel_onchain_pending_order_v1 = Readonly<{
  account: string;
  market: string;
  clientOrderId: string | null;
  venueOrderId: string;
  side: 'BUY' | 'SELL' | null;
  price: string | null;
  remainingQuantity: string | null;
  timeInForce: string | null;
}>;

export type decibel_onchain_pending_order_authority_result_v1 = Readonly<{
  account: string;
  market: string;
  clientOrderId: string;
  venueOrderId: string | null;
  sourceType: 'APTOS_CHAIN_VIEW' | 'OFFCHAIN_INDEX' | 'UNPROVEN';
  viewFunctionIdentity: string | null;
  observedLedgerVersion: number | null;
  pendingOrderCount: number;
  matchingOrder: decibel_onchain_pending_order_v1 | null;
  unexpectedOrders: readonly decibel_onchain_pending_order_v1[];
  completenessProof: 'PROVEN' | 'PARTIAL' | 'UNPROVEN';
  exposureClassification:
    | 'ONCHAIN_OPEN_EXPOSURE_PRESENT'
    | 'ONCHAIN_NO_OPEN_EXPOSURE'
    | 'ONCHAIN_EXPOSURE_STATE_UNKNOWN'
    | 'ONCHAIN_IDENTITY_CONFLICT'
    | 'SUBACCOUNT_EXCLUSIVITY_VIOLATION';
  postCancelVersionOrdered: boolean | null;
  restIndexDivergence: boolean;
  websocketIndexDivergence: boolean;
  noLiveRestingOrderProven: boolean;
  liveExecutionEnabled: false;
}>;

export function proveDecibelOnChainPendingOrderAuthorityV1(input: {
  account: string;
  market: string;
  clientOrderId: string;
  expectedVenueOrderId?: string;
  sourceType: 'APTOS_CHAIN_VIEW' | 'OFFCHAIN_INDEX' | 'UNPROVEN';
  viewFunctionIdentity?: string;
  observedLedgerVersion?: number;
  finalizedCancelTransactionVersion?: number;
  completenessProof: 'PROVEN' | 'PARTIAL' | 'UNPROVEN';
  readSucceeded: boolean;
  orders: readonly decibel_onchain_pending_order_v1[];
  restReportsMatchingOrder?: boolean;
  websocketReportsMatchingOrder?: boolean;
}): decibel_onchain_pending_order_authority_result_v1 {
  const authoritative =
    input.sourceType === 'APTOS_CHAIN_VIEW' &&
    input.viewFunctionIdentity !== undefined &&
    input.completenessProof === 'PROVEN' &&
    input.readSucceeded;
  const versionOrdered =
    input.finalizedCancelTransactionVersion === undefined
      ? null
      : input.observedLedgerVersion === undefined
        ? false
        : input.observedLedgerVersion >= input.finalizedCancelTransactionVersion;
  const wrongScope = input.orders.some(
    (order) => order.account !== input.account || order.market !== input.market,
  );
  const matching = input.orders.filter((order) => order.clientOrderId === input.clientOrderId);
  const venueIds = new Set(matching.map((order) => order.venueOrderId));
  const identityConflict =
    wrongScope ||
    venueIds.size > 1 ||
    (input.expectedVenueOrderId !== undefined &&
      matching.some((order) => order.venueOrderId !== input.expectedVenueOrderId));
  const unexpected = input.orders.filter((order) => order.clientOrderId !== input.clientOrderId);
  const stateUnknown = !authoritative || versionOrdered === false;
  const exposureClassification = identityConflict
    ? 'ONCHAIN_IDENTITY_CONFLICT'
    : unexpected.length > 0
      ? 'SUBACCOUNT_EXCLUSIVITY_VIOLATION'
      : stateUnknown
        ? 'ONCHAIN_EXPOSURE_STATE_UNKNOWN'
        : matching.length === 0
          ? 'ONCHAIN_NO_OPEN_EXPOSURE'
          : 'ONCHAIN_OPEN_EXPOSURE_PRESENT';
  const chainReportsMatchingOrder = exposureClassification === 'ONCHAIN_OPEN_EXPOSURE_PRESENT';
  return Object.freeze({
    account: input.account,
    market: input.market,
    clientOrderId: input.clientOrderId,
    venueOrderId: matching[0]?.venueOrderId ?? null,
    sourceType: input.sourceType,
    viewFunctionIdentity: input.viewFunctionIdentity ?? null,
    observedLedgerVersion: input.observedLedgerVersion ?? null,
    pendingOrderCount: input.orders.length,
    matchingOrder: matching[0] ?? null,
    unexpectedOrders: Object.freeze([...unexpected]),
    completenessProof: input.completenessProof,
    exposureClassification,
    postCancelVersionOrdered: versionOrdered,
    restIndexDivergence:
      input.restReportsMatchingOrder !== undefined &&
      input.restReportsMatchingOrder !== chainReportsMatchingOrder,
    websocketIndexDivergence:
      input.websocketReportsMatchingOrder !== undefined &&
      input.websocketReportsMatchingOrder !== chainReportsMatchingOrder,
    noLiveRestingOrderProven: exposureClassification === 'ONCHAIN_NO_OPEN_EXPOSURE',
    liveExecutionEnabled: false,
  });
}

export function convertOnChainPendingOrderResultToNeutralizationV1(
  proof: decibel_onchain_pending_order_authority_result_v1,
): decibel_unknown_order_exposure_neutralization_v1 {
  return Object.freeze({
    result: proof.noLiveRestingOrderProven ? 'NO_OPEN_ORDER_PROVEN' : 'CANCEL_RESULT_AMBIGUOUS',
    authoritative: proof.noLiveRestingOrderProven,
    noLiveRestingOrderProven: proof.noLiveRestingOrderProven,
    transactionVersion: proof.observedLedgerVersion,
  });
}

export const DecibelOnChainPendingOrderAuthorityAuditV1 = Object.freeze({
  installedSdkVersion: '0.7.0',
  userOpenOrdersOnchainFallback: 'UNAVAILABLE',
  userOpenOrdersActualPath: 'GET /api/v1/open_orders + account_open_orders WebSocket',
  exactPendingOrderViewFunctions: Object.freeze([]),
  pendingOrderStateSource: 'UNPROVEN',
  onchainClientOrderIdAvailable: false,
  onchainVenueOrderIdAvailable: false,
  zeroFillClientIdToOnchainExposure: 'UNAVAILABLE',
  onchainPendingSetCompleteness: 'UNPROVEN',
  onchainViewLedgerVersionAvailable: false,
  postCancelOnchainAbsenceProvable: false,
  cancelTerminalAndNonexistentOutcomeSemantics: 'UNPROVEN',
  canaryNeutralizationRequiresCancelErrorInterpretation: true,
  canaryRecoveryDependsOnRestOpenOrderAbsence: true,
  canaryRecoveryDependsOnTerminalOrderRetention: false,
  onchainPendingOrderAuthority: 'UNAVAILABLE',
  unknownOrderExposureNeutralization: 'PARTIAL',
  canaryOrderLineageDurability: 'PARTIAL',
  minimalLiveCanaryReconciliationReady: false,
  smallestRemainingBlocker: 'AUTHORITATIVE_ONCHAIN_PENDING_ORDER_VIEW_UNAVAILABLE',
  liveExecutionEnabled: false,
  signerInitialized: false,
} as const);
