import {
  decodeDecibelMoveAddressV1,
  decodeDecibelMoveOptionalStringV1,
} from './decibel_operator_ui_canary_order_capture_v1.js';
import type { buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1 } from './decibel_authenticated_passive_recycling_operator_handoff_v1.js';

type handoff = ReturnType<typeof buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1>;
export type decibel_recycling_ui_order_v1 = Readonly<{
  parent: string;
  market: string;
  clientOrderId: string;
  orderId: string;
  orderType: string;
  isBuy: boolean;
  price: number;
  origSize: number;
  transactionVersion: number;
  unixMs: number;
}>;
export type decibel_recycling_ui_transaction_v1 = Readonly<{
  hash: string;
  version: number;
  success: boolean;
  entryFunction: string;
  arguments: readonly unknown[];
}>;

const normalize = (value: unknown) =>
  typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
const wireEqual = (wire: unknown, value: number, scale: number) => {
  const number = normalize(wire);
  return typeof number === 'number' && (number === value || number / scale === value);
};

export function verifyDecibelAuthenticatedRecyclingPlacementV1(input: {
  handoff: handoff;
  order: decibel_recycling_ui_order_v1;
  transaction: decibel_recycling_ui_transaction_v1;
  authenticatedQuerySubaccount: string;
}) {
  const { handoff, order, transaction } = input;
  const args = transaction.arguments;
  const transactionClientOrderId =
    args.length >= 8 ? decodeDecibelMoveOptionalStringV1(args[7]) : null;
  return (
    input.authenticatedQuerySubaccount.toLowerCase() === handoff.subaccount.toLowerCase() &&
    transaction.success &&
    transaction.version === order.transactionVersion &&
    transaction.entryFunction.endsWith('::dex_accounts_entry::place_order_to_subaccount') &&
    decodeDecibelMoveAddressV1(args[0])?.toLowerCase() === handoff.subaccount.toLowerCase() &&
    decodeDecibelMoveAddressV1(args[1])?.toLowerCase() === handoff.marketAddress.toLowerCase() &&
    wireEqual(args[2], handoff.price, 1_000_000) &&
    wireEqual(args[3], handoff.quantity, 100_000_000) &&
    normalize(args[4]) === (handoff.side === 'BUY') &&
    normalize(args[5]) === 1 &&
    normalize(args[6]) === false &&
    (transactionClientOrderId === null || transactionClientOrderId === order.clientOrderId) &&
    order.market.toLowerCase() === handoff.marketAddress.toLowerCase() &&
    order.isBuy === (handoff.side === 'BUY') &&
    order.price === handoff.price &&
    order.origSize === handoff.quantity &&
    order.orderType.toLowerCase() === 'limit' &&
    order.unixMs >= handoff.handoffCreatedAt
  );
}

export function captureDecibelAuthenticatedPassiveRecyclingUiOrderV1(input: {
  handoff: handoff;
  baselineOrderIds: ReadonlySet<string>;
  orders: readonly decibel_recycling_ui_order_v1[];
  transactionsByVersion: ReadonlyMap<number, decibel_recycling_ui_transaction_v1>;
  authenticatedQuerySubaccount: string;
  capturedAt: number;
}) {
  const candidates = input.orders.filter(
    (order) =>
      !input.baselineOrderIds.has(order.orderId) &&
      verifyDecibelAuthenticatedRecyclingPlacementV1({
        handoff: input.handoff,
        order,
        transaction: input.transactionsByVersion.get(order.transactionVersion) ?? {
          hash: '',
          version: -1,
          success: false,
          entryFunction: '',
          arguments: [],
        },
        authenticatedQuerySubaccount: input.authenticatedQuerySubaccount,
      }),
  );
  if (candidates.length !== 1)
    throw new Error(
      candidates.length === 0 ? 'RECYCLING_UI_ORDER_NOT_FOUND' : 'RECYCLING_UI_ORDER_AMBIGUOUS',
    );
  const order = candidates[0]!;
  const transaction = input.transactionsByVersion.get(order.transactionVersion)!;
  return Object.freeze({
    recyclingHandoffId: input.handoff.recyclingHandoffId,
    handoffPackageHash: input.handoff.handoffPackageHash,
    plannedClientOrderId: input.handoff.plannedClientOrderId,
    venueOrderId: order.orderId,
    venueClientOrderId: order.clientOrderId,
    transactionVersion: order.transactionVersion,
    transactionHash: transaction.hash,
    transactionIntentMatch: true as const,
    authenticatedQuerySubaccount: input.authenticatedQuerySubaccount,
    venueOrderParentDiagnostic: order.parent,
    capturedAt: input.capturedAt,
    classification: 'RECYCLING_UI_ORDER_CAPTURED' as const,
    liveExecutionEnabled: false as const,
    venueMutationEnabled: false as const,
  });
}
