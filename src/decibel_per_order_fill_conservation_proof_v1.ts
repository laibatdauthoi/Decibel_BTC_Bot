import type { decibel_authenticated_trade_history_row_v1 } from './decibel_authenticated_execution_reconciliation_v1.js';

export const DECIBEL_PER_ORDER_FILL_CONSERVATION_PROOF_V1 =
  'DECIBEL_PER_ORDER_FILL_CONSERVATION_PROOF_V1' as const;

export type decibel_authoritative_order_execution_quantity_v1 = Readonly<{
  venueOrderId: string;
  origSize: string;
  cumulativeExecutedQuantity: string;
  evidenceSource: 'EXPLICIT_AUTHENTICATED_CUMULATIVE_FILLED_QUANTITY' | 'ADJUSTED_ORDER_STATE';
  evidenceVersion: number;
  observedAt: number;
  status: 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  proofClassification: 'PROVEN';
}>;

export function createDecibelAuthoritativeOrderExecutionQuantityV1(
  input: decibel_authoritative_order_execution_quantity_v1,
): decibel_authoritative_order_execution_quantity_v1 {
  if (
    !input.venueOrderId ||
    input.proofClassification !== 'PROVEN' ||
    !Number.isSafeInteger(input.evidenceVersion) ||
    !Number.isSafeInteger(input.observedAt)
  )
    throw new Error('DECIBEL_AUTHORITATIVE_EXECUTED_QUANTITY_UNPROVEN');
  parseDecimal(input.origSize);
  parseDecimal(input.cumulativeExecutedQuantity);
  return Object.freeze({ ...input });
}

export type decibel_per_order_trade_history_query_v1 = Readonly<{
  account: string;
  market: string;
  order_id: string;
  sort_dir: 'ASC';
  limit: 200;
  offset: number;
  start_timestamp: number;
  end_timestamp: number;
}>;

export type decibel_conservation_trade_row_v1 = Omit<
  decibel_authenticated_trade_history_row_v1,
  'size' | 'price'
> &
  Readonly<{ size: string; price: string }>;

export type decibel_per_order_trade_history_walk_v1 = Readonly<{
  rows: readonly decibel_conservation_trade_row_v1[];
  pageCount: number;
  rawRowCount: number;
  duplicateRowCount: number;
  pageCoverageStatus: 'COMPLETE_SHORT_PAGE' | 'TRADE_HISTORY_PAGE_COVERAGE_UNPROVEN';
}>;

function sameRow(
  left: decibel_conservation_trade_row_v1,
  right: decibel_conservation_trade_row_v1,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function walkDecibelPerOrderTradeHistoryV1(input: {
  account: string;
  market: string;
  venueOrderId: string;
  startTimestamp: number;
  endTimestamp: number;
  fetchPage: (
    query: decibel_per_order_trade_history_query_v1,
  ) => Promise<readonly decibel_conservation_trade_row_v1[]>;
}): Promise<decibel_per_order_trade_history_walk_v1> {
  if (
    !input.account ||
    !input.market ||
    !input.venueOrderId ||
    !Number.isSafeInteger(input.startTimestamp) ||
    !Number.isSafeInteger(input.endTimestamp) ||
    input.startTimestamp > input.endTimestamp
  )
    throw new Error('DECIBEL_PER_ORDER_HISTORY_QUERY_INVALID');
  const unique = new Map<string, decibel_conservation_trade_row_v1>();
  let offset = 0;
  let pageCount = 0;
  let rawRowCount = 0;
  let duplicateRowCount = 0;
  while (offset <= 10_000) {
    const page = await input.fetchPage({
      account: input.account,
      market: input.market,
      order_id: input.venueOrderId,
      sort_dir: 'ASC',
      limit: 200,
      offset,
      start_timestamp: input.startTimestamp,
      end_timestamp: input.endTimestamp,
    });
    pageCount += 1;
    rawRowCount += page.length;
    if (page.length > 200) throw new Error('DECIBEL_PER_ORDER_HISTORY_PAGE_TOO_LARGE');
    for (const row of page) {
      if (
        row.account !== input.account ||
        row.market !== input.market ||
        row.order_id !== input.venueOrderId ||
        row.source !== 'OrderFill' ||
        !row.trade_id
      )
        throw new Error('DECIBEL_PER_ORDER_HISTORY_ROW_OUT_OF_SCOPE');
      const previous = unique.get(row.trade_id);
      if (previous !== undefined) {
        if (!sameRow(previous, row)) throw new Error('DECIBEL_PER_ORDER_TRADE_ID_CONFLICT');
        duplicateRowCount += 1;
      } else unique.set(row.trade_id, Object.freeze({ ...row }));
    }
    if (page.length < 200)
      return Object.freeze({
        rows: Object.freeze([...unique.values()]),
        pageCount,
        rawRowCount,
        duplicateRowCount,
        pageCoverageStatus: 'COMPLETE_SHORT_PAGE',
      });
    if (offset === 10_000) break;
    offset += 200;
  }
  return Object.freeze({
    rows: Object.freeze([...unique.values()]),
    pageCount,
    rawRowCount,
    duplicateRowCount,
    pageCoverageStatus: 'TRADE_HISTORY_PAGE_COVERAGE_UNPROVEN',
  });
}

type decimal_value = Readonly<{ coefficient: bigint; scale: number }>;

function parseDecimal(value: string): decimal_value {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new Error('DECIBEL_DECIMAL_INVALID');
  const [whole = '0', fraction = ''] = value.split('.');
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function align(value: decimal_value, scale: number): bigint {
  return value.coefficient * 10n ** BigInt(scale - value.scale);
}

function sumDecimals(values: readonly string[]): decimal_value {
  const parsed = values.map(parseDecimal);
  const scale = parsed.reduce((maximum, value) => Math.max(maximum, value.scale), 0);
  return { coefficient: parsed.reduce((sum, value) => sum + align(value, scale), 0n), scale };
}

function compareDecimals(left: decimal_value, right: decimal_value): -1 | 0 | 1 {
  const scale = Math.max(left.scale, right.scale);
  const difference = align(left, scale) - align(right, scale);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export type decibel_per_order_fill_conservation_result_v1 = Readonly<{
  venueOrderId: string;
  orderStatus: decibel_authoritative_order_execution_quantity_v1['status'];
  origSize: string;
  authoritativeCumulativeExecutedQuantity: string;
  retrievedUniqueOrderFillCount: number;
  retrievedCumulativeExecutedQuantity: string;
  quantityConservationStatus:
    'QUANTITY_CONSERVATION_MATCH' | 'MISSING_FILL_QUANTITY' | 'FILL_HISTORY_CONTRADICTION';
  pageCoverageStatus: decibel_per_order_trade_history_walk_v1['pageCoverageStatus'];
  tradeIdentityIntegrity: 'PROVEN';
  executionPriceCompleteness: boolean;
  fillFeeRecordCompleteness: boolean;
  feeDenominationCompleteness: false;
  snapshotStability: 'STABLE';
  finalCompletenessClassification:
    | 'COMPLETE_BY_PAGE_TERMINATION'
    | 'COMPLETE_BY_QUANTITY_CONSERVATION'
    | 'INCOMPLETE_MISSING_FILL_QUANTITY'
    | 'INCONSISTENT_OVERCOUNT';
  liveExecutionEnabled: false;
}>;

function sameExecutionState(
  left: decibel_authoritative_order_execution_quantity_v1,
  right: decibel_authoritative_order_execution_quantity_v1,
) {
  return (
    left.venueOrderId === right.venueOrderId &&
    left.cumulativeExecutedQuantity === right.cumulativeExecutedQuantity &&
    left.status === right.status &&
    left.evidenceVersion === right.evidenceVersion
  );
}

export function proveDecibelPerOrderFillConservationV1(input: {
  stateBefore: decibel_authoritative_order_execution_quantity_v1 | null;
  stateAfter: decibel_authoritative_order_execution_quantity_v1 | null;
  history: decibel_per_order_trade_history_walk_v1;
  orderFillSizeStrictlyPositiveProven: boolean;
}): decibel_per_order_fill_conservation_result_v1 {
  if (input.stateBefore === null || input.stateAfter === null)
    throw new Error('DECIBEL_EXECUTED_QUANTITY_TRUTH_UNPROVEN');
  if (!sameExecutionState(input.stateBefore, input.stateAfter))
    throw new Error('DECIBEL_RECONCILIATION_SNAPSHOT_UNSTABLE');
  if (!input.orderFillSizeStrictlyPositiveProven)
    throw new Error('DECIBEL_ORDER_FILL_POSITIVITY_UNPROVEN');
  for (const row of input.history.rows) {
    const size = parseDecimal(row.size);
    parseDecimal(row.price);
    if (size.coefficient <= 0n) throw new Error('DECIBEL_ORDER_FILL_SIZE_NOT_POSITIVE');
    if (row.transaction_version > input.stateAfter.evidenceVersion)
      throw new Error('DECIBEL_ORDER_FILL_FUTURE_TRANSACTION_VERSION');
  }
  const retrieved = sumDecimals(input.history.rows.map((row) => row.size));
  const authoritative = parseDecimal(input.stateAfter.cumulativeExecutedQuantity);
  const comparison = compareDecimals(retrieved, authoritative);
  const quantityConservationStatus =
    comparison === 0
      ? 'QUANTITY_CONSERVATION_MATCH'
      : comparison < 0
        ? 'MISSING_FILL_QUANTITY'
        : 'FILL_HISTORY_CONTRADICTION';
  const complete = comparison === 0;
  return Object.freeze({
    venueOrderId: input.stateAfter.venueOrderId,
    orderStatus: input.stateAfter.status,
    origSize: input.stateAfter.origSize,
    authoritativeCumulativeExecutedQuantity: input.stateAfter.cumulativeExecutedQuantity,
    retrievedUniqueOrderFillCount: input.history.rows.length,
    retrievedCumulativeExecutedQuantity: decimalToString(retrieved),
    quantityConservationStatus,
    pageCoverageStatus: input.history.pageCoverageStatus,
    tradeIdentityIntegrity: 'PROVEN',
    executionPriceCompleteness: complete,
    fillFeeRecordCompleteness: complete,
    feeDenominationCompleteness: false,
    snapshotStability: 'STABLE',
    finalCompletenessClassification: complete
      ? input.history.pageCoverageStatus === 'COMPLETE_SHORT_PAGE'
        ? 'COMPLETE_BY_PAGE_TERMINATION'
        : 'COMPLETE_BY_QUANTITY_CONSERVATION'
      : comparison < 0
        ? 'INCOMPLETE_MISSING_FILL_QUANTITY'
        : 'INCONSISTENT_OVERCOUNT',
    liveExecutionEnabled: false,
  });
}

function decimalToString(value: decimal_value): string {
  if (value.scale === 0) return value.coefficient.toString();
  const raw = value.coefficient.toString().padStart(value.scale + 1, '0');
  const result = `${raw.slice(0, -value.scale)}.${raw.slice(-value.scale)}`;
  return result.replace(/\.?0+$/, '') || '0';
}

export const DecibelPerOrderFillConservationAuditV1 = Object.freeze({
  orderStateCumulativeExecutedQuantity: 'UNPROVEN',
  origSizeSemantics: 'original submitted order quantity',
  remainingSizeSemantics:
    'current order remaining_size field; official cancelled-order example shows zero and therefore it is not preserved unfilled quantity',
  sizeDeltaSemantics:
    'field is exposed but authoritative cumulative execution semantics are undocumented',
  orderSizeReductionAffectsRemainingSize: 'UNPROVEN',
  nonFillSizeReductionSeparable: 'NO',
  orderSizeAmendmentPermitted: false,
  authenticatedCumulativeFilledSizeAvailable: 'UNPROVEN',
  notificationFilledSizeSemantics: 'UNDOCUMENTED',
  selectedAuthoritativeExecutedQuantitySource: 'UNAVAILABLE_FOR_CURRENT_DECIBEL_CONTRACT',
  orderFillSizeStrictlyPositive: 'UNPROVEN',
  conservationAlgorithmAvailableWhenPrerequisitesProven: true,
  canaryPerOrderHistoryCompleteness: 'UNPROVEN',
  canaryOrderLineageDurability: 'PARTIAL',
  minimalLiveCanaryReconciliationReady: false,
  generalAuthenticatedReconciliationReady: false,
  smallestRemainingBlocker: 'AUTHORITATIVE_CUMULATIVE_EXECUTED_QUANTITY_UNPROVEN',
  liveExecutionEnabled: false,
  signerInitialized: false,
} as const);
