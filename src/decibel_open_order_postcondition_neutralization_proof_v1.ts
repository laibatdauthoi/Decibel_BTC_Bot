import type { decibel_unknown_order_exposure_neutralization_v1 } from './decibel_unknown_order_neutralization_recovery_v1.js';

export const DECIBEL_OPEN_ORDER_POSTCONDITION_NEUTRALIZATION_PROOF_V1 =
  'DECIBEL_OPEN_ORDER_POSTCONDITION_NEUTRALIZATION_PROOF_V1' as const;

export type decibel_open_order_row_v1 = Readonly<{
  account: string;
  market: string;
  venueOrderId: string;
  clientOrderId: string | null;
  remainingSize: string;
  transactionVersion: number;
}>;

export type decibel_open_order_page_v1 = Readonly<{
  account: string;
  offset: number;
  limit: number;
  totalCount: number | null;
  rows: readonly decibel_open_order_row_v1[];
}>;

export type decibel_open_order_snapshot_v1 = Readonly<{
  account: string;
  market: string;
  observedAt: number;
  pages: readonly decibel_open_order_page_v1[];
  completeness: 'PROVEN' | 'UNPROVEN';
  visibility: 'AUTHORITATIVE_CURRENT' | 'UNPROVEN';
}>;

type exposure_state =
  | 'OPEN_ORDER_PRESENT'
  | 'NO_OPEN_ORDER_PRESENT'
  | 'SNAPSHOT_INCOMPLETE'
  | 'IDENTITY_CONFLICT'
  | 'SUBACCOUNT_EXCLUSIVITY_VIOLATION';

type snapshot_result = Readonly<{
  classification:
    | 'OPEN_EXPOSURE_NEUTRALIZED'
    | 'OPEN_EXPOSURE_PRESENT'
    | 'OPEN_EXPOSURE_STATE_UNKNOWN'
    | 'OPEN_ORDER_SNAPSHOT_UNSTABLE'
    | 'SUBACCOUNT_EXCLUSIVITY_VIOLATION'
    | 'IDENTITY_CONFLICT';
  matchingVenueOrderId: string | null;
  matchingRemainingSize: string | null;
  snapshotComplete: boolean;
  snapshotAuthoritative: boolean;
  noLiveRestingOrderProven: boolean;
  liveExecutionEnabled: false;
}>;

export type decibel_open_order_postcondition_result_v1 = snapshot_result &
  Readonly<{
    account: string;
    market: string;
    clientOrderId: string;
    snapshotSource: 'SDK_USER_OPEN_ORDERS_GET_BY_ADDR';
    pagesRead: number;
    beforeExposureState: exposure_state;
    afterExposureState: exposure_state;
    unexpectedOrderIds: readonly string[];
    snapshotStability: 'STABLE' | 'UNSTABLE' | 'UNPROVEN';
    cancelOutcomeDiagnostic: string | null;
  }>;

function collectRows(
  snapshot: decibel_open_order_snapshot_v1,
): readonly decibel_open_order_row_v1[] | null {
  const ordered = [...snapshot.pages].sort((a, b) => a.offset - b.offset);
  let nextOffset = 0;
  let expectedTotal: number | null = null;
  const rows: decibel_open_order_row_v1[] = [];
  for (const page of ordered) {
    if (page.account !== snapshot.account || page.offset !== nextOffset || page.limit <= 0)
      return null;
    if (page.totalCount !== null) {
      if (expectedTotal !== null && expectedTotal !== page.totalCount) return null;
      expectedTotal = page.totalCount;
    }
    rows.push(...page.rows);
    nextOffset += page.rows.length;
  }
  if (expectedTotal === null || rows.length !== expectedTotal) return null;
  return rows;
}

function classifySnapshot(input: {
  snapshot: decibel_open_order_snapshot_v1;
  account: string;
  market: string;
  clientOrderId: string;
  expectedVenueOrderId?: string;
}): snapshot_result {
  const base = {
    snapshotComplete: input.snapshot.completeness === 'PROVEN',
    snapshotAuthoritative: input.snapshot.visibility === 'AUTHORITATIVE_CURRENT',
    liveExecutionEnabled: false as const,
  };
  if (input.snapshot.account !== input.account || input.snapshot.market !== input.market)
    return result('IDENTITY_CONFLICT', null, null, base);
  const rows = collectRows(input.snapshot);
  if (rows === null || !base.snapshotComplete || !base.snapshotAuthoritative)
    return result('OPEN_EXPOSURE_STATE_UNKNOWN', null, null, base);
  if (rows.some((row) => row.account !== input.account || row.market !== input.market))
    return result('IDENTITY_CONFLICT', null, null, base);
  const matching = rows.filter((row) => row.clientOrderId === input.clientOrderId);
  const venueIds = new Set(matching.map((row) => row.venueOrderId));
  if (
    venueIds.size > 1 ||
    (input.expectedVenueOrderId !== undefined &&
      matching.some((row) => row.venueOrderId !== input.expectedVenueOrderId))
  )
    return result('IDENTITY_CONFLICT', null, null, base);
  if (rows.some((row) => row.clientOrderId !== input.clientOrderId))
    return result('SUBACCOUNT_EXCLUSIVITY_VIOLATION', null, null, base);
  const match = matching[0];
  return match === undefined
    ? result('OPEN_EXPOSURE_NEUTRALIZED', null, null, base)
    : result('OPEN_EXPOSURE_PRESENT', match.venueOrderId, match.remainingSize, base);
}

function result(
  classification: snapshot_result['classification'],
  matchingVenueOrderId: string | null,
  matchingRemainingSize: string | null,
  base: Pick<
    snapshot_result,
    'snapshotComplete' | 'snapshotAuthoritative' | 'liveExecutionEnabled'
  >,
): snapshot_result {
  return Object.freeze({
    classification,
    matchingVenueOrderId,
    matchingRemainingSize,
    ...base,
    noLiveRestingOrderProven: classification === 'OPEN_EXPOSURE_NEUTRALIZED',
  });
}

export function proveDecibelOpenOrderPostconditionNeutralizationV1(input: {
  account: string;
  market: string;
  clientOrderId: string;
  expectedVenueOrderId?: string;
  cancelOutcomeDiagnostic?: string;
  before: decibel_open_order_snapshot_v1;
  after: decibel_open_order_snapshot_v1;
}): decibel_open_order_postcondition_result_v1 {
  const before = classifySnapshot({ ...input, snapshot: input.before });
  const after = classifySnapshot({ ...input, snapshot: input.after });
  const priority = [
    'IDENTITY_CONFLICT',
    'SUBACCOUNT_EXCLUSIVITY_VIOLATION',
    'OPEN_EXPOSURE_STATE_UNKNOWN',
  ] as const;
  let final: snapshot_result = after;
  for (const classification of priority) {
    if (before.classification === classification || after.classification === classification) {
      final = before.classification === classification ? before : after;
      break;
    }
  }
  const unstable =
    !priority.includes(final.classification as (typeof priority)[number]) &&
    (before.classification !== after.classification ||
      before.matchingVenueOrderId !== after.matchingVenueOrderId ||
      before.matchingRemainingSize !== after.matchingRemainingSize);
  if (unstable)
    final = result('OPEN_ORDER_SNAPSHOT_UNSTABLE', null, null, {
      snapshotComplete: true,
      snapshotAuthoritative: true,
      liveExecutionEnabled: false,
    });
  const mapState = (value: snapshot_result): exposure_state =>
    value.classification === 'OPEN_EXPOSURE_PRESENT'
      ? 'OPEN_ORDER_PRESENT'
      : value.classification === 'OPEN_EXPOSURE_NEUTRALIZED'
        ? 'NO_OPEN_ORDER_PRESENT'
        : value.classification === 'IDENTITY_CONFLICT'
          ? 'IDENTITY_CONFLICT'
          : value.classification === 'SUBACCOUNT_EXCLUSIVITY_VIOLATION'
            ? 'SUBACCOUNT_EXCLUSIVITY_VIOLATION'
            : 'SNAPSHOT_INCOMPLETE';
  const unexpectedOrderIds = [...input.before.pages, ...input.after.pages]
    .flatMap((page) => page.rows)
    .filter((row) => row.clientOrderId !== input.clientOrderId)
    .map((row) => row.venueOrderId);
  return Object.freeze({
    ...final,
    account: input.account,
    market: input.market,
    clientOrderId: input.clientOrderId,
    snapshotSource: 'SDK_USER_OPEN_ORDERS_GET_BY_ADDR',
    pagesRead: input.before.pages.length + input.after.pages.length,
    beforeExposureState: mapState(before),
    afterExposureState: mapState(after),
    unexpectedOrderIds: Object.freeze([...new Set(unexpectedOrderIds)]),
    snapshotStability: unstable
      ? 'UNSTABLE'
      : final.classification === 'OPEN_EXPOSURE_STATE_UNKNOWN'
        ? 'UNPROVEN'
        : 'STABLE',
    cancelOutcomeDiagnostic: input.cancelOutcomeDiagnostic ?? null,
  });
}

export function convertOpenOrderPostconditionToNeutralizationV1(
  proof: decibel_open_order_postcondition_result_v1,
): decibel_unknown_order_exposure_neutralization_v1 {
  return Object.freeze({
    result: proof.noLiveRestingOrderProven ? 'NO_OPEN_ORDER_PROVEN' : 'CANCEL_RESULT_AMBIGUOUS',
    authoritative: proof.noLiveRestingOrderProven,
    noLiveRestingOrderProven: proof.noLiveRestingOrderProven,
    transactionVersion: null,
  });
}

export const DecibelOpenOrderPostconditionNeutralizationAuditV1 = Object.freeze({
  source: 'SDK userOpenOrders.getByAddr / GET /api/v1/open_orders',
  websocketSource: 'userOpenOrders.subscribeByAddr / account_open_orders:{subaccount}',
  clientOrderIdAvailable: true,
  venueOrderIdAvailable: true,
  pagination: 'LIMIT_OFFSET_WITH_OPTIONAL_TOTAL_COUNT',
  paginationCompleteness: 'PARTIAL',
  snapshotVisibilitySemantics: 'UNPROVEN',
  transactionVersionAvailable: true,
  crossRequestSnapshotVersionPinning: false,
  authenticatedOpenOrderSnapshotAvailable: true,
  unknownOrderExposureNeutralization: 'PARTIAL',
  canaryOrderLineageDurability: 'PARTIAL',
  minimalLiveCanaryReconciliationReady: false,
  canaryNeutralizationRequiresCancelErrorInterpretation: true,
  smallestRemainingBlocker: 'OPEN_ORDER_SNAPSHOT_ABSENCE_AUTHORITY_UNPROVEN',
  liveExecutionEnabled: false,
  signerInitialized: false,
} as const);
