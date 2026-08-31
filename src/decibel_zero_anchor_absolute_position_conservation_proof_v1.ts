import type { decibel_canary_exclusivity_evidence_v1 } from './decibel_isolated_subaccount_position_conservation_proof_v1.js';

export const DECIBEL_ZERO_ANCHOR_ABSOLUTE_POSITION_CONSERVATION_PROOF_V1 =
  'DECIBEL_ZERO_ANCHOR_ABSOLUTE_POSITION_CONSERVATION_PROOF_V1' as const;

export type decibel_canary_zero_position_anchor_v1 = Readonly<{
  account: string;
  market: string;
  observedAt: number;
  transactionVersion: null;
  anchorKind: 'NO_OPEN_POSITION';
  provenFlat: true;
}>;

export function createDecibelCanaryZeroPositionAnchorV1(input: {
  account: string;
  market: string;
  observedAt: number;
  responseSuccessful: boolean;
  authenticatedAccount: string;
  requestedMarketAddress: string;
  includeDeleted: false;
  returnedRows: readonly unknown[];
  exactMarketOpenPositionQuerySemanticsProven: boolean;
}): decibel_canary_zero_position_anchor_v1 {
  if (
    !input.account ||
    !input.market ||
    !Number.isSafeInteger(input.observedAt) ||
    !input.responseSuccessful ||
    input.authenticatedAccount !== input.account ||
    input.requestedMarketAddress !== input.market ||
    input.includeDeleted !== false ||
    input.returnedRows.length !== 0 ||
    !input.exactMarketOpenPositionQuerySemanticsProven
  )
    throw new Error('DECIBEL_ZERO_ANCHOR_UNPROVEN');
  return Object.freeze({
    account: input.account,
    market: input.market,
    observedAt: input.observedAt,
    transactionVersion: null,
    anchorKind: 'NO_OPEN_POSITION',
    provenFlat: true,
  });
}

export type decibel_absolute_position_observation_v1 =
  | Readonly<{
      kind: 'NO_OPEN_POSITION';
      account: string;
      market: string;
      observedAt: number;
    }>
  | Readonly<{
      kind: 'OPEN_POSITION';
      account: string;
      market: string;
      observedAt: number;
      rawSize: string;
      transactionVersion: number;
      isDeleted: false;
    }>;

export type decibel_zero_anchor_authenticated_fill_v1 = Readonly<{
  source: 'OrderFill';
  authenticated: true;
  tradeId: string;
  orderId: string;
  market: string;
  action: 'OpenLong' | 'CloseLong' | 'OpenShort' | 'CloseShort';
  size: string;
  price: string;
  transactionVersion: number;
}>;

type decimal_value = Readonly<{ coefficient: bigint; scale: number }>;

function parseDecimal(value: string, signed = false): decimal_value {
  const pattern = signed ? /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/ : /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  if (!pattern.test(value)) throw new Error('DECIBEL_ZERO_ANCHOR_DECIMAL_INVALID');
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  return {
    coefficient: BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n),
    scale: fraction.length,
  };
}

function align(value: decimal_value, scale: number): bigint {
  return value.coefficient * 10n ** BigInt(scale - value.scale);
}

function add(values: readonly decimal_value[]): decimal_value {
  const scale = values.reduce((maximum, value) => Math.max(maximum, value.scale), 0);
  return { coefficient: values.reduce((sum, value) => sum + align(value, scale), 0n), scale };
}

function multiply(left: decimal_value, right: decimal_value): decimal_value {
  return { coefficient: left.coefficient * right.coefficient, scale: left.scale + right.scale };
}

function compare(left: decimal_value, right: decimal_value): -1 | 0 | 1 {
  const scale = Math.max(left.scale, right.scale);
  const difference = align(left, scale) - align(right, scale);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function absolute(value: decimal_value): decimal_value {
  return {
    coefficient: value.coefficient < 0n ? -value.coefficient : value.coefficient,
    scale: value.scale,
  };
}

function render(value: decimal_value): string {
  if (value.scale === 0) return value.coefficient.toString();
  const raw = value.coefficient.toString().padStart(value.scale + 1, '0');
  return `${raw.slice(0, -value.scale)}.${raw.slice(-value.scale)}`.replace(/\.?0+$/, '') || '0';
}

function observationMagnitude(
  observation: decibel_absolute_position_observation_v1,
): decimal_value {
  return observation.kind === 'NO_OPEN_POSITION'
    ? { coefficient: 0n, scale: 0 }
    : absolute(parseDecimal(observation.rawSize, true));
}

function sameObservation(
  left: decibel_absolute_position_observation_v1,
  right: decibel_absolute_position_observation_v1,
) {
  if (left.kind !== right.kind || left.account !== right.account || left.market !== right.market)
    return false;
  if (left.kind === 'NO_OPEN_POSITION' || right.kind === 'NO_OPEN_POSITION') return true;
  return (
    left.rawSize === right.rawSize &&
    left.transactionVersion === right.transactionVersion &&
    left.isDeleted === right.isDeleted
  );
}

function assertExclusive(evidence: decibel_canary_exclusivity_evidence_v1) {
  if (
    !evidence.dedicatedSubaccountSelected ||
    !evidence.exclusiveStrategyControlProven ||
    evidence.activeMarketCount !== 1 ||
    evidence.concurrentVenueOrderCount > 1 ||
    evidence.unexpectedOrderCount > 0 ||
    evidence.activeTwapCount > 0 ||
    evidence.activeBulkOrderCount > 0 ||
    evidence.activeTpSlCount > 0 ||
    evidence.delegatedExternalTraderCount > 0
  )
    throw new Error('DECIBEL_SUBACCOUNT_NOT_EXCLUSIVE');
  if (evidence.liquidationOrSystemMutationObserved)
    throw new Error('DECIBEL_UNEXPECTED_POSITION_MUTATION');
}

export type decibel_zero_anchor_absolute_position_conservation_result_v1 = Readonly<{
  account: string;
  market: string;
  venueOrderId: string;
  zeroAnchorProof: 'PROVEN';
  positionBeforeKind: 'NO_OPEN_POSITION';
  positionAfterKind: decibel_absolute_position_observation_v1['kind'];
  rawPositionSize: string | null;
  absolutePositionMagnitude: string;
  orderSide: 'BUY' | 'SELL';
  authenticatedFillDirection: 'OPEN_LONG' | 'OPEN_SHORT' | 'NO_EXECUTION';
  uniqueTradeIds: readonly string[];
  fillQuantity: string;
  quantityMatch: boolean;
  exclusivityResult: 'PROVEN';
  snapshotStability: 'STABLE';
  makerProof: 'PROVEN';
  makerVolumeUsd: string | null;
  executedQuantityCompleteness: boolean;
  makerVolumeCompleteness: boolean;
  costRecordCompleteness: false;
  finalClassification:
    | 'COMPLETE_BY_ZERO_ANCHOR_POSITION_MAGNITUDE_CONSERVATION'
    | 'NO_EXECUTION_RECONCILED'
    | 'MISSING_FILL_QUANTITY'
    | 'TRADE_HISTORY_OVERCOUNT';
  liveExecutionEnabled: false;
}>;

export function proveDecibelZeroAnchorAbsolutePositionConservationV1(input: {
  zeroAnchor: decibel_canary_zero_position_anchor_v1;
  positionBeforeHistory: decibel_absolute_position_observation_v1;
  positionAfterHistory: decibel_absolute_position_observation_v1;
  venueOrderId: string;
  orderSide: 'BUY' | 'SELL';
  authenticatedOrderIsBuy: boolean;
  fills: readonly decibel_zero_anchor_authenticated_fill_v1[];
  makerProofValid: boolean;
  exclusivity: decibel_canary_exclusivity_evidence_v1;
}): decibel_zero_anchor_absolute_position_conservation_result_v1 {
  if (!input.zeroAnchor.provenFlat) throw new Error('DECIBEL_ZERO_ANCHOR_UNPROVEN');
  if (!input.makerProofValid) throw new Error('DECIBEL_POST_ONLY_MAKER_PROOF_REQUIRED');
  if ((input.orderSide === 'BUY') !== input.authenticatedOrderIsBuy)
    throw new Error('DECIBEL_EXECUTION_DIRECTION_CONTRADICTION');
  assertExclusive(input.exclusivity);
  if (!sameObservation(input.positionBeforeHistory, input.positionAfterHistory))
    throw new Error('DECIBEL_POSITION_SNAPSHOT_UNSTABLE');
  for (const observation of [input.positionBeforeHistory, input.positionAfterHistory])
    if (
      observation.account !== input.zeroAnchor.account ||
      observation.market !== input.zeroAnchor.market
    )
      throw new Error('DECIBEL_POSITION_LINEAGE_MISMATCH');

  const expectedAction = input.orderSide === 'BUY' ? 'OpenLong' : 'OpenShort';
  const unique = new Map<string, decibel_zero_anchor_authenticated_fill_v1>();
  for (const fill of input.fills) {
    if (
      !fill.authenticated ||
      fill.source !== 'OrderFill' ||
      fill.orderId !== input.venueOrderId ||
      fill.market !== input.zeroAnchor.market
    )
      throw new Error('DECIBEL_ZERO_ANCHOR_FILL_OUT_OF_SCOPE');
    if (fill.action !== expectedAction)
      throw new Error('DECIBEL_EXECUTION_DIRECTION_CONTRADICTION');
    if (parseDecimal(fill.size).coefficient <= 0n || parseDecimal(fill.price).coefficient <= 0n)
      throw new Error('DECIBEL_ZERO_ANCHOR_FILL_INVALID');
    if (
      input.positionAfterHistory.kind === 'OPEN_POSITION' &&
      fill.transactionVersion > input.positionAfterHistory.transactionVersion
    )
      throw new Error('DECIBEL_ZERO_ANCHOR_FILL_FUTURE_VERSION');
    const previous = unique.get(fill.tradeId);
    if (previous !== undefined) {
      if (JSON.stringify(previous) !== JSON.stringify(fill))
        throw new Error('DECIBEL_ZERO_ANCHOR_TRADE_ID_CONFLICT');
    } else unique.set(fill.tradeId, Object.freeze({ ...fill }));
  }
  const magnitude = observationMagnitude(input.positionAfterHistory);
  const fillQuantity = add([...unique.values()].map((fill) => parseDecimal(fill.size)));
  const comparison = compare(fillQuantity, magnitude);
  const makerVolume = add(
    [...unique.values()].map((fill) => multiply(parseDecimal(fill.size), parseDecimal(fill.price))),
  );
  const noExecution = magnitude.coefficient === 0n && fillQuantity.coefficient === 0n;
  return Object.freeze({
    account: input.zeroAnchor.account,
    market: input.zeroAnchor.market,
    venueOrderId: input.venueOrderId,
    zeroAnchorProof: 'PROVEN',
    positionBeforeKind: 'NO_OPEN_POSITION',
    positionAfterKind: input.positionAfterHistory.kind,
    rawPositionSize:
      input.positionAfterHistory.kind === 'OPEN_POSITION'
        ? input.positionAfterHistory.rawSize
        : null,
    absolutePositionMagnitude: render(magnitude),
    orderSide: input.orderSide,
    authenticatedFillDirection:
      unique.size === 0 ? 'NO_EXECUTION' : input.orderSide === 'BUY' ? 'OPEN_LONG' : 'OPEN_SHORT',
    uniqueTradeIds: Object.freeze([...unique.keys()]),
    fillQuantity: render(fillQuantity),
    quantityMatch: comparison === 0,
    exclusivityResult: 'PROVEN',
    snapshotStability: 'STABLE',
    makerProof: 'PROVEN',
    makerVolumeUsd: comparison === 0 ? render(makerVolume) : null,
    executedQuantityCompleteness: comparison === 0,
    makerVolumeCompleteness: comparison === 0,
    costRecordCompleteness: false,
    finalClassification: noExecution
      ? 'NO_EXECUTION_RECONCILED'
      : comparison === 0
        ? 'COMPLETE_BY_ZERO_ANCHOR_POSITION_MAGNITUDE_CONSERVATION'
        : comparison < 0
          ? 'MISSING_FILL_QUANTITY'
          : 'TRADE_HISTORY_OVERCOUNT',
    liveExecutionEnabled: false,
  });
}

export const DecibelZeroAnchorAbsolutePositionConservationAuditV1 = Object.freeze({
  noOpenPositionByAbsence: 'PROVEN',
  singleMarketPositionQueryComplete: true,
  zeroPositionAnchorProvable: true,
  positionMagnitudeAvailable: true,
  positionSizeSignSemantics: 'UNPROVEN',
  authenticatedExecutionDirectionSource:
    'authenticated order is_buy/order_direction plus exact-order userTradeHistory action',
  canaryExecutionDirectionProvable: true,
  startingPosition: 'FLAT',
  maximumMarkets: 1,
  maximumVenueOrdersPerSession: 1,
  maximumConcurrentLiveOrders: 1,
  orderSizeAmendmentPermitted: false,
  tpSlPermitted: false,
  twapPermitted: false,
  bulkOrdersPermitted: false,
  manualTradingPermitted: false,
  delegatedExternalTradingPermitted: false,
  canaryExecutedQuantityTruth: 'PROVEN_BY_ZERO_ANCHOR_POSITION_MAGNITUDE',
  canaryPerOrderHistoryCompleteness: 'PROVEN_BY_ZERO_ANCHOR_POSITION_MAGNITUDE',
  canaryOrderLineageDurability: 'PARTIAL',
  minimalLiveCanaryReconciliationReady: false,
  smallestRemainingBlocker: 'ACCEPTED_ORDER_IDENTITY_CRASH_WINDOW',
  liveExecutionEnabled: false,
  signerInitialized: false,
} as const);
