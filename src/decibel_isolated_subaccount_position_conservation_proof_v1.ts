export const DECIBEL_ISOLATED_SUBACCOUNT_POSITION_CONSERVATION_PROOF_V1 =
  'DECIBEL_ISOLATED_SUBACCOUNT_POSITION_CONSERVATION_PROOF_V1' as const;

export type decibel_position_snapshot_v1 = Readonly<{
  subaccount: string;
  market: string;
  size: string;
  transactionVersion: number;
  observedAt: number;
  isDeleted: boolean;
}>;

export type decibel_isolated_position_fill_v1 = Readonly<{
  source: 'OrderFill';
  tradeId: string;
  orderId: string;
  market: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  transactionVersion: number;
  authenticated: true;
}>;

export type decibel_canary_exclusivity_evidence_v1 = Readonly<{
  dedicatedSubaccountSelected: boolean;
  exclusiveStrategyControlProven: boolean;
  activeMarketCount: number;
  concurrentVenueOrderCount: number;
  unexpectedOrderCount: number;
  activeTwapCount: number;
  activeBulkOrderCount: number;
  activeTpSlCount: number;
  delegatedExternalTraderCount: number;
  liquidationOrSystemMutationObserved: boolean;
}>;

export type decibel_isolated_subaccount_position_conservation_result_v1 = Readonly<{
  subaccount: string;
  market: string;
  orderId: string;
  orderSide: 'BUY' | 'SELL';
  positionBefore: string;
  positionAfter: string;
  positionBeforeTransactionVersion: number;
  positionAfterTransactionVersion: number;
  signedPositionDelta: string;
  retrievedFillIds: readonly string[];
  retrievedFillQuantity: string;
  actualExternalMakerVolumeUsd: string | null;
  makerProofStatus: 'PROVEN';
  exclusivityStatus: 'PROVEN';
  unexpectedMutationFlags: readonly string[];
  snapshotStability: 'STABLE';
  strategyInventory: string;
  quantityConservationStatus: 'MATCH' | 'MISSING_FILL_QUANTITY' | 'TRADE_HISTORY_OVERCOUNT';
  volumeCompleteness: boolean;
  costRecordCompleteness: false;
  classification:
    | 'COMPLETE_BY_ISOLATED_POSITION_CONSERVATION'
    | 'NO_EXECUTION'
    | 'MISSING_FILL_QUANTITY'
    | 'TRADE_HISTORY_OVERCOUNT';
  liveExecutionEnabled: false;
}>;

type decimal_value = Readonly<{ coefficient: bigint; scale: number }>;

function parseDecimal(value: string, signed = false): decimal_value {
  const pattern = signed ? /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/ : /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  if (!pattern.test(value)) throw new Error('DECIBEL_POSITION_CONSERVATION_DECIMAL_INVALID');
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const coefficient = BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n);
  return { coefficient, scale: fraction.length };
}

function align(value: decimal_value, scale: number): bigint {
  return value.coefficient * 10n ** BigInt(scale - value.scale);
}

function subtract(left: decimal_value, right: decimal_value): decimal_value {
  const scale = Math.max(left.scale, right.scale);
  return { coefficient: align(left, scale) - align(right, scale), scale };
}

function add(values: readonly decimal_value[]): decimal_value {
  const scale = values.reduce((maximum, value) => Math.max(maximum, value.scale), 0);
  return { coefficient: values.reduce((sum, value) => sum + align(value, scale), 0n), scale };
}

function multiply(left: decimal_value, right: decimal_value): decimal_value {
  return { coefficient: left.coefficient * right.coefficient, scale: left.scale + right.scale };
}

function compare(left: decimal_value, right: decimal_value): -1 | 0 | 1 {
  const difference = subtract(left, right).coefficient;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function toString(value: decimal_value): string {
  if (value.scale === 0) return value.coefficient.toString();
  const negative = value.coefficient < 0n;
  const raw = (negative ? -value.coefficient : value.coefficient)
    .toString()
    .padStart(value.scale + 1, '0');
  const rendered = `${raw.slice(0, -value.scale)}.${raw.slice(-value.scale)}`.replace(/\.?0+$/, '');
  return `${negative ? '-' : ''}${rendered || '0'}`;
}

function validateExclusivity(evidence: decibel_canary_exclusivity_evidence_v1): void {
  if (!evidence.dedicatedSubaccountSelected || !evidence.exclusiveStrategyControlProven)
    throw new Error('DECIBEL_SUBACCOUNT_NOT_EXCLUSIVE');
  if (
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

function samePosition(left: decibel_position_snapshot_v1, right: decibel_position_snapshot_v1) {
  return (
    left.subaccount === right.subaccount &&
    left.market === right.market &&
    left.size === right.size &&
    left.transactionVersion === right.transactionVersion &&
    left.isDeleted === right.isDeleted
  );
}

export function proveDecibelIsolatedSubaccountPositionConservationV1(input: {
  dedicatedCanarySubaccountAddress: string;
  market: string;
  orderId: string;
  orderSide: 'BUY' | 'SELL';
  orderStatus: 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  initialPositionAnchor: decibel_position_snapshot_v1;
  positionSnapshotBeforeHistory: decibel_position_snapshot_v1;
  positionSnapshotAfterHistory: decibel_position_snapshot_v1;
  fills: readonly decibel_isolated_position_fill_v1[];
  strategyRebuiltInventory: string;
  makerProofValid: boolean;
  positionSizeAndSignSemanticsProven: boolean;
  zeroPositionAnchorProven: boolean;
  singleOrderAttributionProven: boolean;
  exclusivity: decibel_canary_exclusivity_evidence_v1;
}): decibel_isolated_subaccount_position_conservation_result_v1 {
  if (!input.positionSizeAndSignSemanticsProven)
    throw new Error('DECIBEL_POSITION_SEMANTICS_UNPROVEN');
  if (
    !input.zeroPositionAnchorProven ||
    parseDecimal(input.initialPositionAnchor.size, true).coefficient !== 0n
  )
    throw new Error('DECIBEL_ZERO_POSITION_ANCHOR_UNPROVEN');
  if (!input.singleOrderAttributionProven)
    throw new Error('DECIBEL_POSITION_DELTA_SINGLE_ORDER_ATTRIBUTION_UNPROVEN');
  if (!input.makerProofValid) throw new Error('DECIBEL_POST_ONLY_MAKER_PROOF_REQUIRED');
  validateExclusivity(input.exclusivity);
  const snapshots = [
    input.initialPositionAnchor,
    input.positionSnapshotBeforeHistory,
    input.positionSnapshotAfterHistory,
  ];
  if (
    snapshots.some(
      (snapshot) =>
        snapshot.subaccount !== input.dedicatedCanarySubaccountAddress ||
        snapshot.market !== input.market,
    )
  )
    throw new Error('DECIBEL_POSITION_LINEAGE_MISMATCH');
  if (!samePosition(input.positionSnapshotBeforeHistory, input.positionSnapshotAfterHistory))
    throw new Error('DECIBEL_POSITION_SNAPSHOT_UNSTABLE');

  const unique = new Map<string, decibel_isolated_position_fill_v1>();
  for (const fill of input.fills) {
    if (
      !fill.authenticated ||
      fill.source !== 'OrderFill' ||
      fill.orderId !== input.orderId ||
      fill.market !== input.market
    )
      throw new Error('DECIBEL_POSITION_CONSERVATION_FILL_OUT_OF_SCOPE');
    if (fill.side !== input.orderSide) throw new Error('DECIBEL_POSITION_CONSERVATION_FILL_SIDE');
    if (parseDecimal(fill.size).coefficient <= 0n || parseDecimal(fill.price).coefficient <= 0n)
      throw new Error('DECIBEL_POSITION_CONSERVATION_FILL_INVALID');
    if (fill.transactionVersion > input.positionSnapshotAfterHistory.transactionVersion)
      throw new Error('DECIBEL_POSITION_CONSERVATION_FILL_FUTURE_VERSION');
    const previous = unique.get(fill.tradeId);
    if (previous !== undefined) {
      if (JSON.stringify(previous) !== JSON.stringify(fill))
        throw new Error('DECIBEL_POSITION_CONSERVATION_TRADE_ID_CONFLICT');
    } else unique.set(fill.tradeId, Object.freeze({ ...fill }));
  }

  const before = parseDecimal(input.initialPositionAnchor.size, true);
  const after = parseDecimal(input.positionSnapshotAfterHistory.size, true);
  const signedDelta = subtract(after, before);
  const authoritative = input.orderSide === 'BUY' ? signedDelta : subtract(before, after);
  if (authoritative.coefficient < 0n) throw new Error('DECIBEL_UNEXPECTED_POSITION_MUTATION');
  const retrieved = add([...unique.values()].map((fill) => parseDecimal(fill.size)));
  const comparison = compare(retrieved, authoritative);
  const strategyInventory = parseDecimal(input.strategyRebuiltInventory, true);
  if (compare(strategyInventory, signedDelta) !== 0)
    throw new Error('DECIBEL_POSITION_INVENTORY_RECONCILIATION_FAILED');
  const makerVolume = add(
    [...unique.values()].map((fill) => multiply(parseDecimal(fill.size), parseDecimal(fill.price))),
  );
  const noExecution = authoritative.coefficient === 0n && retrieved.coefficient === 0n;
  return Object.freeze({
    subaccount: input.dedicatedCanarySubaccountAddress,
    market: input.market,
    orderId: input.orderId,
    orderSide: input.orderSide,
    positionBefore: input.initialPositionAnchor.size,
    positionAfter: input.positionSnapshotAfterHistory.size,
    positionBeforeTransactionVersion: input.initialPositionAnchor.transactionVersion,
    positionAfterTransactionVersion: input.positionSnapshotAfterHistory.transactionVersion,
    signedPositionDelta: toString(signedDelta),
    retrievedFillIds: Object.freeze([...unique.keys()]),
    retrievedFillQuantity: toString(retrieved),
    actualExternalMakerVolumeUsd: comparison === 0 ? toString(makerVolume) : null,
    makerProofStatus: 'PROVEN',
    exclusivityStatus: 'PROVEN',
    unexpectedMutationFlags: Object.freeze([]),
    snapshotStability: 'STABLE',
    strategyInventory: input.strategyRebuiltInventory,
    quantityConservationStatus:
      comparison === 0
        ? 'MATCH'
        : comparison < 0
          ? 'MISSING_FILL_QUANTITY'
          : 'TRADE_HISTORY_OVERCOUNT',
    volumeCompleteness: comparison === 0,
    costRecordCompleteness: false,
    classification: noExecution
      ? 'NO_EXECUTION'
      : comparison === 0
        ? 'COMPLETE_BY_ISOLATED_POSITION_CONSERVATION'
        : comparison < 0
          ? 'MISSING_FILL_QUANTITY'
          : 'TRADE_HISTORY_OVERCOUNT',
    liveExecutionEnabled: false,
  });
}

export const DecibelIsolatedSubaccountPositionConservationAuditV1 = Object.freeze({
  authenticatedPositionSource: 'GET /api/v1/account_positions (userPositions alias)',
  authenticatedPositionSizeAvailable: true,
  positionSizeSignSemantics: 'UNPROVEN',
  dedicatedSubaccountStrategyIsolation: 'PARTIAL',
  zeroPositionAnchorProvable: false,
  positionDeltaSingleOrderAttributable: 'CONDITIONALLY',
  positionTradeVersionCorrelation: 'PARTIAL',
  dedicatedSubaccountRequired: true,
  exclusiveStrategyControlRequired: true,
  marketCount: 1,
  maximumConcurrentLiveOrders: 1,
  maximumVenueOrdersPerSession: 1,
  prohibitedActivities: Object.freeze([
    'MANUAL_ORDER',
    'OTHER_BOT_OR_STRATEGY',
    'TWAP',
    'BULK_ORDER',
    'TP_SL',
    'POSITION_MANAGEMENT_ORDER',
    'EXTERNAL_DELEGATED_TRADER',
  ]),
  canaryExecutedQuantityTruth: 'UNPROVEN',
  canaryPerOrderHistoryCompleteness: 'UNPROVEN',
  canaryOrderLineageDurability: 'PARTIAL',
  minimalLiveCanaryReconciliationReady: false,
  smallestRemainingBlocker: 'POSITION_SIZE_SIGN_SEMANTICS_UNPROVEN',
  liveExecutionEnabled: false,
  signerInitialized: false,
} as const);
