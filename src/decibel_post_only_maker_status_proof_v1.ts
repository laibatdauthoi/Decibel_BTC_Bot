import {
  DECIBEL_ACTUAL_FILL_TRUTH_V1,
  applyDecibelActualFillTruthV1,
  type decibel_actual_fill_truth_v1,
  type decibel_actual_fill_ledger_v1,
} from './decibel_actual_fill_truth_v1.js';
import type { decibel_execution_mode_v1 } from './decibel_authenticated_execution_boundary_v1.js';

export const DECIBEL_POST_ONLY_MAKER_STATUS_PROOF_V1 =
  'DECIBEL_POST_ONLY_MAKER_STATUS_PROOF_V1' as const;

export const DecibelPostOnlyMakerStatusAuditV1 = Object.freeze({
  auditVersion: DECIBEL_POST_ONLY_MAKER_STATUS_PROOF_V1,
  installedContract: Object.freeze({
    package: '@decibeltrade/sdk',
    version: '0.7.0',
    representation: 'TimeInForce.PostOnly',
    wireValue: 1,
    placementArgument: 'timeInForce',
    onChainArgument: 'time_in_force',
  }),
  authoritativeSemantics: Object.freeze({
    source: 'https://docs.decibel.trade/developer-hub/on-chain/order-management/place-order',
    postOnlyAddsLiquidityOnly: true,
    immediatelyExecutableAction: 'CANCEL',
    takerConversionPossible: false,
    restingFillIsMaker: true,
    appliesToEveryPartialFillForSameVenueOrder: true,
  }),
  authenticatedLineage: Object.freeze({
    source: 'GET /api/v1/orders',
    requiredFields: Object.freeze(['order.order_id', 'order.time_in_force']),
    postOnlyOrderLineageProvable: true,
    localIntentAloneSufficient: false,
    replacementInheritsPredecessorProof: false,
  }),
  isRebateImpliesMaker: 'UNPROVEN',
  feeAmountKnown: true,
  feeCurrencyKnown: false,
  classification: 'POST_ONLY_MAKER_CONTRACT_PROVEN',
  authoritativeMakerStatusAvailable: true,
  actualFillTruthAvailable: true,
  disconnectFillRecovery: 'PARTIAL',
  disconnectRecoveryReason:
    'authenticated history is page/range bounded and the installed SDK does not establish complete unbounded session recovery',
  liveExecutionEnabled: false,
  signerInitialized: false,
} as const);

export type decibel_authenticated_post_only_order_lineage_v1 = Readonly<{
  source: 'AUTHENTICATED_ORDER_DETAILS';
  venueOrderId: string;
  localIntentId: string;
  localExecutionRequestId: string;
  marketAddress: string;
  side: 'BUY' | 'SELL';
  requestedQuantity: number;
  acceptedTimeInForce: 0 | 1 | 2;
  acceptedByVenue: boolean;
}>;

export type decibel_authenticated_maker_proof_v1 = Readonly<{
  proofVersion: typeof DECIBEL_POST_ONLY_MAKER_STATUS_PROOF_V1;
  venueOrderId: string;
  venueFillId: string;
  localExecutionRequestId: string;
  makerStatus: 'MAKER';
  proofSource: 'ACCEPTED_POST_ONLY_ORDER_CONTRACT';
}>;

export function proveDecibelAuthenticatedMakerStatusV1(input: {
  order: decibel_authenticated_post_only_order_lineage_v1;
  venueFillId: string;
  fillVenueOrderId: string;
}): decibel_authenticated_maker_proof_v1 {
  if (
    input.order.source !== 'AUTHENTICATED_ORDER_DETAILS' ||
    !input.order.acceptedByVenue ||
    input.order.acceptedTimeInForce !== 1
  )
    throw new Error('DECIBEL_ACCEPTED_POST_ONLY_LINEAGE_REQUIRED');
  if (!input.venueFillId) throw new Error('DECIBEL_VENUE_FILL_ID_REQUIRED');
  if (input.fillVenueOrderId !== input.order.venueOrderId)
    throw new Error('DECIBEL_POST_ONLY_ORDER_FILL_LINEAGE_MISMATCH');
  return Object.freeze({
    proofVersion: DECIBEL_POST_ONLY_MAKER_STATUS_PROOF_V1,
    venueOrderId: input.order.venueOrderId,
    venueFillId: input.venueFillId,
    localExecutionRequestId: input.order.localExecutionRequestId,
    makerStatus: 'MAKER',
    proofSource: 'ACCEPTED_POST_ONLY_ORDER_CONTRACT',
  });
}

export type decibel_authenticated_user_trade_v1 = Readonly<{
  source: 'OrderFill';
  tradeId: string;
  orderId: string;
  marketAddress: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  feeAmount: number;
  isRebate: boolean;
  transactionVersion: number;
  transactionUnixMs: number | null;
  receivedAt: Date;
}>;

export function normalizeDecibelActualMakerFillTruthV1(input: {
  trade: decibel_authenticated_user_trade_v1;
  order: decibel_authenticated_post_only_order_lineage_v1;
}): decibel_actual_fill_truth_v1 {
  const { trade, order } = input;
  if (
    trade.source !== 'OrderFill' ||
    !trade.tradeId ||
    !trade.orderId ||
    !(trade.size > 0) ||
    !(trade.price > 0) ||
    !Number.isFinite(trade.feeAmount) ||
    !Number.isSafeInteger(trade.transactionVersion) ||
    (trade.transactionUnixMs !== null && !Number.isSafeInteger(trade.transactionUnixMs))
  )
    throw new Error('DECIBEL_AUTHENTICATED_USER_TRADE_INVALID');
  if (trade.marketAddress !== order.marketAddress || trade.side !== order.side)
    throw new Error('DECIBEL_AUTHENTICATED_USER_TRADE_ORDER_MISMATCH');
  const proof = proveDecibelAuthenticatedMakerStatusV1({
    order,
    venueFillId: trade.tradeId,
    fillVenueOrderId: trade.orderId,
  });
  return Object.freeze({
    venueFillId: trade.tradeId,
    venueOrderId: trade.orderId,
    localExecutionRequestId: order.localExecutionRequestId,
    marketAddress: trade.marketAddress,
    side: trade.side,
    executedPrice: trade.price,
    executedBaseQuantity: trade.size,
    executedUsdNotional: trade.price * trade.size,
    makerOrTaker: proof.makerStatus,
    receivedAt: new Date(trade.receivedAt),
    venueTimestamp: trade.transactionUnixMs === null ? null : new Date(trade.transactionUnixMs),
    fee: Object.freeze({
      availability: 'AVAILABLE',
      amount: trade.feeAmount,
      currency: null,
    }),
    rebate: Object.freeze({
      availability: 'AVAILABLE',
      amount: trade.isRebate ? trade.feeAmount : 0,
      currency: null,
    }),
    executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM',
  });
}

export function ingestDecibelAuthenticatedOwnFillsDryRunV1(input: {
  executionMode: decibel_execution_mode_v1;
  ledger: decibel_actual_fill_ledger_v1;
  orders: readonly decibel_authenticated_post_only_order_lineage_v1[];
  trades: readonly decibel_authenticated_user_trade_v1[];
}): decibel_actual_fill_ledger_v1 {
  if (input.executionMode !== 'AUTHENTICATED_DRY_RUN')
    throw new Error('DECIBEL_ACTUAL_FILL_INGESTION_DRY_RUN_ONLY');
  const orderedTrades = [...input.trades].sort(
    (left, right) =>
      left.transactionVersion - right.transactionVersion ||
      left.tradeId.localeCompare(right.tradeId),
  );
  let ledger = input.ledger;
  for (const trade of orderedTrades) {
    const order = input.orders.find((candidate) => candidate.venueOrderId === trade.orderId);
    if (order === undefined) throw new Error('DECIBEL_AUTHENTICATED_ORDER_LINEAGE_NOT_FOUND');
    ledger = applyDecibelActualFillTruthV1(
      ledger,
      normalizeDecibelActualMakerFillTruthV1({ order, trade }),
    );
  }
  return ledger;
}

export const DecibelActualFillTruthContractV1 = Object.freeze({
  contractVersion: DECIBEL_ACTUAL_FILL_TRUTH_V1,
  ownFillTruthContract: 'COMPLETE',
  actualFillTruthAvailable: true,
  makerProofSource: 'ACCEPTED_POST_ONLY_ORDER_CONTRACT',
  primaryFillIdentity: 'userTradeHistory.trade_id',
  actualExternalMakerVolumeUsd: 'sum(executedPrice * executedQuantity) for unique fills',
  liveExecutionEnabled: false,
} as const);
