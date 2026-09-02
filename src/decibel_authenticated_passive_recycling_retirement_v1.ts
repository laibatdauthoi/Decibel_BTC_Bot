import type { decibel_recycling_retirement_evidence_v1 } from './decibel_authenticated_passive_recycling_journal_v1.js';
import type { buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1 } from './decibel_authenticated_passive_recycling_operator_handoff_v1.js';
import {
  verifyDecibelAuthenticatedRecyclingPlacementV1,
  type decibel_recycling_ui_order_v1,
  type decibel_recycling_ui_transaction_v1,
} from './decibel_authenticated_passive_recycling_ui_order_capture_v1.js';

type handoff = ReturnType<typeof buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1>;

function semanticallyMatchesOrder(handoff: handoff, order: decibel_recycling_ui_order_v1) {
  return (
    order.market.toLowerCase() === handoff.marketAddress.toLowerCase() &&
    order.isBuy === (handoff.side === 'BUY') &&
    order.price === handoff.price &&
    order.origSize === handoff.quantity &&
    order.orderType.toLowerCase() === 'limit' &&
    order.unixMs >= handoff.handoffCreatedAt
  );
}

export function proveDecibelRecyclingHandoffUnsubmittedV1(input: {
  handoff: handoff;
  authenticatedQuerySubaccount: string;
  checkedThrough: number;
  orderHistory: readonly decibel_recycling_ui_order_v1[];
  transactionsByVersion: ReadonlyMap<number, decibel_recycling_ui_transaction_v1>;
  openOrders: readonly decibel_recycling_ui_order_v1[];
  fills: readonly Readonly<{ tradeId: string; orderId: string }>[];
}): decibel_recycling_retirement_evidence_v1 {
  if (input.authenticatedQuerySubaccount.toLowerCase() !== input.handoff.subaccount.toLowerCase())
    throw new Error('RECYCLING_HANDOFF_RETIREMENT_LINEAGE_UNPROVEN');
  const possibleOrders = input.orderHistory.filter((order) =>
    semanticallyMatchesOrder(input.handoff, order),
  );
  const matchingOpen = input.openOrders.some((order) =>
    semanticallyMatchesOrder(input.handoff, order),
  );
  if (matchingOpen) throw new Error('RECYCLING_HANDOFF_RETIREMENT_SUBMISSION_NOT_EXCLUDED');
  for (const order of possibleOrders) {
    const transaction = input.transactionsByVersion.get(order.transactionVersion);
    if (transaction === undefined) throw new Error('RECYCLING_HANDOFF_RETIREMENT_LINEAGE_UNPROVEN');
    if (
      verifyDecibelAuthenticatedRecyclingPlacementV1({
        handoff: input.handoff,
        order,
        transaction,
        authenticatedQuerySubaccount: input.authenticatedQuerySubaccount,
      })
    )
      throw new Error('RECYCLING_HANDOFF_RETIREMENT_SUBMISSION_NOT_EXCLUDED');
    throw new Error('RECYCLING_HANDOFF_RETIREMENT_LINEAGE_UNPROVEN');
  }
  const possibleOrderIds = new Set(possibleOrders.map((order) => order.orderId));
  if (input.fills.some((fill) => possibleOrderIds.has(fill.orderId)))
    throw new Error('RECYCLING_HANDOFF_RETIREMENT_SUBMISSION_NOT_EXCLUDED');
  return Object.freeze({
    recyclingHandoffId: input.handoff.recyclingHandoffId,
    handoffPackageHash: input.handoff.handoffPackageHash,
    authenticatedQuerySubaccount: input.authenticatedQuerySubaccount,
    checkedFrom: input.handoff.handoffCreatedAt,
    checkedThrough: input.checkedThrough,
    matchingVenuePlacementFound: false,
    matchingFillFound: false,
    matchingOpenOrderFound: false,
    placementLineageProven: true,
    noSubmissionProven: true,
    liveExecutionEnabled: false,
    venueMutationEnabled: false,
  });
}
