import type { decibel_authenticated_trade_history_row_v1 } from './decibel_authenticated_execution_reconciliation_v1.js';

export const DECIBEL_MINIMAL_CANARY_RECONCILIATION_ENVELOPE_V1 =
  'DECIBEL_MINIMAL_CANARY_RECONCILIATION_ENVELOPE_V1' as const;

export type decibel_reconciliation_mode_v1 =
  'GENERAL_SESSION_RECONCILIATION' | 'CANARY_PER_ORDER_RECONCILIATION';

export type decibel_canary_order_specific_trade_query_v1 = Readonly<{
  account: string;
  market: string;
  order_id: string;
  limit: 200;
  offset: 0;
  sort_dir: 'ASC';
  start_timestamp: number;
  end_timestamp: number;
}>;

export function buildDecibelCanaryOrderTradeHistoryQueryV1(input: {
  account: string;
  market: string;
  venueOrderId: string;
  startTimestamp: number;
  endTimestamp: number;
}): decibel_canary_order_specific_trade_query_v1 {
  if (
    !input.account ||
    !input.market ||
    !input.venueOrderId ||
    !Number.isSafeInteger(input.startTimestamp) ||
    !Number.isSafeInteger(input.endTimestamp) ||
    input.startTimestamp > input.endTimestamp
  )
    throw new Error('DECIBEL_CANARY_ORDER_HISTORY_QUERY_INVALID');
  return Object.freeze({
    account: input.account,
    market: input.market,
    order_id: input.venueOrderId,
    limit: 200,
    offset: 0,
    sort_dir: 'ASC',
    start_timestamp: input.startTimestamp,
    end_timestamp: input.endTimestamp,
  });
}

export type decibel_minimum_fill_increment_proof_v1 = Readonly<{
  source: 'AUTHORITATIVE_MINIMUM_EXECUTABLE_FILL_INCREMENT';
  increment: number;
}>;

export type decibel_canary_envelope_input_v1 = Readonly<{
  market: string;
  minimumOrderSize: number;
  orderLotSize: number;
  orderQuantity: number;
  minimumExecutableFillIncrementProof: decibel_minimum_fill_increment_proof_v1 | null;
  durableVenueOrderIdPersistenceAvailable: boolean;
  deterministicClientOrderIdPersistedBeforeSubmission: boolean;
  authenticatedClientOrderIdLookupAvailable: boolean;
}>;

export type decibel_canary_reconciliation_envelope_v1 = Readonly<{
  envelopeVersion: typeof DECIBEL_MINIMAL_CANARY_RECONCILIATION_ENVELOPE_V1;
  reconciliationMode: 'CANARY_PER_ORDER_RECONCILIATION';
  market: string;
  orderQuantity: number;
  minimumOrderSize: number;
  orderLotSize: number;
  minimumExecutableFillIncrement: number | null;
  minimumExecutableFillIncrementProven: boolean;
  maximumPossibleFillFragmentsPerOrder: number | null;
  apiPageLimit: 200;
  maximumVenueOrdersPerSession: 10;
  maximumRequestedMakerNotionalUsd: 100;
  knownOrderOnlyGuarantee: true;
  perOrderQueryCapability: true;
  orderStatusCrossCheckCapability: true;
  durableVenueOrderIdCapability: boolean;
  crashRecoveryCapability: 'PROVEN' | 'PARTIAL' | 'UNAVAILABLE';
  canaryPerOrderHistoryCompleteness: 'PROVEN' | 'UNPROVEN';
  canaryOrderLineageDurability: 'PROVEN' | 'PARTIAL' | 'UNAVAILABLE';
  minimalLiveCanaryReconciliationReady: boolean;
  smallestRemainingBlocker: string | null;
  liveExecutionEnabled: false;
}>;

function exactFragmentCount(quantity: number, increment: number): number | null {
  const fragments = quantity / increment;
  return Number.isSafeInteger(fragments) && fragments > 0 ? fragments : null;
}

export function buildDecibelCanaryReconciliationEnvelopeV1(
  input: decibel_canary_envelope_input_v1,
): decibel_canary_reconciliation_envelope_v1 {
  if (
    !input.market ||
    !(input.minimumOrderSize > 0) ||
    !(input.orderLotSize > 0) ||
    !(input.orderQuantity >= input.minimumOrderSize) ||
    !Number.isSafeInteger(input.orderQuantity / input.orderLotSize)
  )
    throw new Error('DECIBEL_CANARY_ORDER_ENVELOPE_INVALID');
  const fillIncrement = input.minimumExecutableFillIncrementProof?.increment ?? null;
  const maximumFragments =
    fillIncrement !== null && fillIncrement > 0
      ? exactFragmentCount(input.orderQuantity, fillIncrement)
      : null;
  const historyComplete = maximumFragments !== null && maximumFragments <= 10;
  const durability = input.durableVenueOrderIdPersistenceAvailable
    ? 'PROVEN'
    : input.deterministicClientOrderIdPersistedBeforeSubmission &&
        input.authenticatedClientOrderIdLookupAvailable
      ? 'PARTIAL'
      : 'UNAVAILABLE';
  const ready = historyComplete && durability === 'PROVEN';
  return Object.freeze({
    envelopeVersion: DECIBEL_MINIMAL_CANARY_RECONCILIATION_ENVELOPE_V1,
    reconciliationMode: 'CANARY_PER_ORDER_RECONCILIATION',
    market: input.market,
    orderQuantity: input.orderQuantity,
    minimumOrderSize: input.minimumOrderSize,
    orderLotSize: input.orderLotSize,
    minimumExecutableFillIncrement: fillIncrement,
    minimumExecutableFillIncrementProven: fillIncrement !== null,
    maximumPossibleFillFragmentsPerOrder: maximumFragments,
    apiPageLimit: 200,
    maximumVenueOrdersPerSession: 10,
    maximumRequestedMakerNotionalUsd: 100,
    knownOrderOnlyGuarantee: true,
    perOrderQueryCapability: true,
    orderStatusCrossCheckCapability: true,
    durableVenueOrderIdCapability: input.durableVenueOrderIdPersistenceAvailable,
    crashRecoveryCapability: durability,
    canaryPerOrderHistoryCompleteness: historyComplete ? 'PROVEN' : 'UNPROVEN',
    canaryOrderLineageDurability: durability,
    minimalLiveCanaryReconciliationReady: ready,
    smallestRemainingBlocker: ready
      ? null
      : maximumFragments === null
        ? 'MINIMUM_EXECUTABLE_FILL_INCREMENT_UNPROVEN'
        : maximumFragments >= 200
          ? 'MAXIMUM_POSSIBLE_FILL_FRAGMENTS_REACHES_API_PAGE_LIMIT'
          : maximumFragments > 10
            ? 'CANARY_MAXIMUM_FILL_FRAGMENT_SAFETY_MARGIN_EXCEEDED'
            : 'VENUE_ORDER_ID_DURABILITY_UNCERTAIN',
    liveExecutionEnabled: false,
  });
}

export type decibel_canary_authenticated_order_state_v1 = Readonly<{
  account: string;
  market: string;
  venueOrderId: string;
  clientOrderId: string;
  timeInForce: 1;
  origSize: number;
  remainingSize: number;
  status: 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED';
}>;

export type decibel_canary_order_reconciliation_v1 = Readonly<{
  venueOrderId: string;
  uniqueFillCount: number;
  cumulativeExecutedQuantity: number;
  authoritativeExecutedQuantity: number;
  state: 'OPEN' | 'PARTIALLY_FILLED_OPEN' | 'TERMINAL_FILLED' | 'TERMINAL_CANCELLED' | 'REJECTED';
  singlePageComplete: true;
  reconciliationStatus: 'CANARY_RECONCILED';
  liveExecutionEnabled: false;
}>;

function sameTrade(
  left: decibel_authenticated_trade_history_row_v1,
  right: decibel_authenticated_trade_history_row_v1,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function reconcileDecibelCanaryOrderV1(input: {
  envelope: decibel_canary_reconciliation_envelope_v1;
  query: decibel_canary_order_specific_trade_query_v1;
  order: decibel_canary_authenticated_order_state_v1;
  rows: readonly decibel_authenticated_trade_history_row_v1[];
}): decibel_canary_order_reconciliation_v1 {
  if (input.envelope.canaryPerOrderHistoryCompleteness !== 'PROVEN')
    throw new Error('DECIBEL_CANARY_FILL_ROW_UPPER_BOUND_UNPROVEN');
  if (
    input.query.account !== input.order.account ||
    input.query.market !== input.order.market ||
    input.query.order_id !== input.order.venueOrderId ||
    input.order.timeInForce !== 1
  )
    throw new Error('DECIBEL_CANARY_ORDER_LINEAGE_INVALID');
  const unique = new Map<string, decibel_authenticated_trade_history_row_v1>();
  for (const row of input.rows) {
    if (
      row.account !== input.query.account ||
      row.market !== input.query.market ||
      row.order_id !== input.query.order_id ||
      row.source !== 'OrderFill'
    )
      throw new Error('DECIBEL_CANARY_ORDER_HISTORY_ROW_OUT_OF_SCOPE');
    if (!row.trade_id || !(row.size > 0) || !(row.price > 0))
      throw new Error('DECIBEL_CANARY_ORDER_FILL_INVALID');
    const previous = unique.get(row.trade_id);
    if (previous !== undefined) {
      if (!sameTrade(previous, row)) throw new Error('DECIBEL_CANARY_TRADE_ID_CONFLICT');
    } else unique.set(row.trade_id, row);
  }
  if (
    input.envelope.maximumPossibleFillFragmentsPerOrder === null ||
    unique.size > input.envelope.maximumPossibleFillFragmentsPerOrder
  )
    throw new Error('DECIBEL_CANARY_FILL_FRAGMENT_BOUND_EXCEEDED');
  const cumulativeExecutedQuantity = [...unique.values()].reduce((sum, row) => sum + row.size, 0);
  const authoritativeExecutedQuantity = input.order.origSize - input.order.remainingSize;
  if (
    !(input.order.origSize > 0) ||
    input.order.remainingSize < 0 ||
    input.order.remainingSize > input.order.origSize ||
    Math.abs(cumulativeExecutedQuantity - authoritativeExecutedQuantity) > Number.EPSILON
  )
    throw new Error('DECIBEL_CANARY_FILL_SUM_ORDER_STATUS_MISMATCH');
  if (input.order.status === 'FILLED' && input.order.remainingSize !== 0)
    throw new Error('DECIBEL_CANARY_FILL_SUM_ORDER_STATUS_MISMATCH');
  const state =
    input.order.status === 'OPEN'
      ? cumulativeExecutedQuantity > 0
        ? 'PARTIALLY_FILLED_OPEN'
        : 'OPEN'
      : input.order.status === 'FILLED'
        ? 'TERMINAL_FILLED'
        : input.order.status === 'CANCELLED'
          ? 'TERMINAL_CANCELLED'
          : 'REJECTED';
  return Object.freeze({
    venueOrderId: input.order.venueOrderId,
    uniqueFillCount: unique.size,
    cumulativeExecutedQuantity,
    authoritativeExecutedQuantity,
    state,
    singlePageComplete: true,
    reconciliationStatus: 'CANARY_RECONCILED',
    liveExecutionEnabled: false,
  });
}

export function evaluateDecibelFutureCanaryPlacementCapV1(input: {
  knownDurableVenueOrderCount: number;
  requestedNotionalUsdSoFar: number;
  nextRequestedNotionalUsd: number;
  venueOrderIdDurabilityCertain: boolean;
}) {
  const reasons: string[] = [];
  if (!input.venueOrderIdDurabilityCertain) reasons.push('VENUE_ORDER_ID_DURABILITY_UNCERTAIN');
  if (input.knownDurableVenueOrderCount >= 10) reasons.push('CANARY_VENUE_ORDER_COUNT_CAP_REACHED');
  if (input.requestedNotionalUsdSoFar + input.nextRequestedNotionalUsd > 100)
    reasons.push('CANARY_REQUESTED_NOTIONAL_CAP_REACHED');
  return Object.freeze({
    permittedForFutureDesignOnly: reasons.length === 0,
    reasons: Object.freeze(reasons),
    liveExecutionEnabled: false as const,
  });
}

export function recoverDecibelAcceptedCanaryOrderByClientIdV1(input: {
  expectedAccount: string;
  expectedMarket: string;
  durableClientOrderId: string | null;
  authenticatedOrder: Readonly<{
    account: string;
    market: string;
    clientOrderId: string;
    venueOrderId: string;
    timeInForce: number;
  }> | null;
}) {
  if (input.durableClientOrderId === null)
    return Object.freeze({
      recovered: false,
      venueOrderId: null,
      reason: 'DURABLE_CLIENT_ORDER_ID_UNAVAILABLE',
    });
  const order = input.authenticatedOrder;
  if (
    order === null ||
    order.account !== input.expectedAccount ||
    order.market !== input.expectedMarket ||
    order.clientOrderId !== input.durableClientOrderId ||
    !order.venueOrderId ||
    order.timeInForce !== 1
  )
    return Object.freeze({
      recovered: false,
      venueOrderId: null,
      reason: 'AUTHENTICATED_CLIENT_ORDER_LINEAGE_MISMATCH',
    });
  return Object.freeze({
    recovered: true,
    venueOrderId: order.venueOrderId,
    reason: null,
  });
}

export const DecibelMinimalCanaryReconciliationAuditV1 = Object.freeze({
  generalAuthenticatedReconciliationReady: false,
  generalPaginationClassification: 'PARTIAL',
  minimumExecutableFillIncrementProven: false,
  minimumFillIncrementFinding:
    'market lot_size is documented as the minimum valid order-size increment, not the minimum executable partial-fill increment',
  tradeHistoryFeeAsset: 'AVAILABLE_VIA_REST_ONLY',
  feeAssetFinding:
    'official REST trade_history includes fee_asset; installed @decibeltrade/sdk v0.7.0 UserTradeSchema strips/omits it',
  deterministicClientOrderIdPlacementSupported: true,
  authenticatedClientOrderIdLookupSupported: true,
  acceptedOrderRecoveryAfterPrePersistCrash: 'PARTIAL',
  crashWindowFinding:
    'client_order_id can recover an order only if its deterministic identity was durably retained or reproducible before submission',
  canaryPerOrderHistoryCompleteness: 'UNPROVEN',
  canaryOrderLineageDurability: 'PARTIAL',
  minimalLiveCanaryReconciliationReady: false,
  smallestRemainingBlocker: 'MINIMUM_EXECUTABLE_FILL_INCREMENT_UNPROVEN',
  liveExecutionEnabled: false,
  signerInitialized: false,
} as const);
