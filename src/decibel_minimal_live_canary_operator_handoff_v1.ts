import { createHash } from 'node:crypto';

import type { DecibelMinimalLiveCanaryExecutionPackageV1 } from './decibel_minimal_live_canary_execution_package_v1.js';

export const DECIBEL_MINIMAL_LIVE_CANARY_OPERATOR_HANDOFF_V1 =
  'DECIBEL_MINIMAL_LIVE_CANARY_OPERATOR_HANDOFF_V1' as const;

export type decibel_canary_handoff_safety_snapshot_v1 = Readonly<{
  accountMatch: boolean;
  network: string;
  marketAddress: string;
  positionFlat: boolean;
  openOrderCount: number;
  activeTwapCount: number;
  activeTpSlCount: number;
  activeBulkExposure: number;
  unknownVenueOrders: number;
  journalHealthy: boolean;
  unresolvedExecutionPlans: number;
  marketMode: string;
  bestBid: number;
  bestAsk: number;
  observedAt: number;
  receiptAt: number;
  tickSize: number;
  lotSize: number;
  minimumSize: number;
  bboFresh: boolean;
}>;

export type decibel_minimal_live_canary_operator_handoff_v1 = Readonly<{
  schemaVersion: typeof DECIBEL_MINIMAL_LIVE_CANARY_OPERATOR_HANDOFF_V1;
  strategyIdentity: 'DECIBEL_MARKET_MAKER_V1';
  handoffPackageHash: string;
  canaryId: string;
  executionSessionId: string;
  createdAt: number;
  network: string;
  subaccount: string;
  market: 'BTC/USD';
  marketAddress: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  notionalUsd: number;
  venueMinimumNotionalUsd: number;
  targetNotionalUsd: number;
  maximumNotionalUsd: number;
  orderType: 'LIMIT';
  postOnly: true;
  bestBid: number;
  bestAsk: number;
  tickSize: number;
  lotSize: number;
  minimumSize: number;
  marketObservedAt: number;
  marketReceiptAt: number;
  clientOrderId: string;
  configHash: string;
  executionPackageHash: string;
  entryFunction: string;
  entryArguments: readonly unknown[];
  precommittedTransactionHash: string | null;
  positionState: 'FLAT';
  openOrderCount: number;
  activeTwapCount: number;
  activeTpSlCount: number;
  activeBulkExposure: number;
  unknownVenueOrders: number;
  journalStatus: 'HANDOFF_READY_FOR_OPERATOR' | 'HANDOFF_PREPARED';
  unresolvedExecutionPlans: number;
  transactionIntentMatch: boolean;
  handoffPackageFresh: boolean;
  liveExecutionEnabled: false;
  venueMutationEnabled: false;
  signerEnabled: false;
  transactionSubmissionEnabled: false;
  operatorHandoffReady: boolean;
  blockers: readonly string[];
  mutationCounters: Readonly<{
    signedTransactions: 0;
    submittedTransactions: 0;
    placedOrders: 0;
    cancelledOrders: 0;
    replacedOrders: 0;
    venueMutations: 0;
  }>;
}>;

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildDecibelMinimalLiveCanaryOperatorHandoffV1(input: {
  executionPackage: DecibelMinimalLiveCanaryExecutionPackageV1;
  initial: decibel_canary_handoff_safety_snapshot_v1;
  final: decibel_canary_handoff_safety_snapshot_v1;
  createdAt: number;
  precommittedTransactionHash?: string;
}): decibel_minimal_live_canary_operator_handoff_v1 {
  const { executionPackage: pkg, initial, final } = input;
  const blockers: string[] = [];
  const require = (condition: boolean, blocker: string) => {
    if (!condition) blockers.push(blocker);
  };
  for (const [snapshot, prefix] of [
    [initial, 'PREFLIGHT'],
    [final, 'FINAL'],
  ] as const) {
    require(snapshot.accountMatch, `${prefix}_ACCOUNT_MISMATCH`);
    require(snapshot.network === 'mainnet', `${prefix}_MAINNET_REQUIRED`);
    require(snapshot.marketAddress === pkg.market, `${prefix}_MARKET_MISMATCH`);
    require(snapshot.positionFlat, `${prefix}_POSITION_NOT_FLAT`);
    require(snapshot.openOrderCount === 0, `${prefix}_OPEN_ORDER_PRESENT`);
    require(snapshot.activeTwapCount === 0, `${prefix}_TWAP_PRESENT`);
    require(snapshot.activeTpSlCount === 0, `${prefix}_TP_SL_PRESENT`);
    require(snapshot.activeBulkExposure === 0, `${prefix}_BULK_EXPOSURE_PRESENT`);
    require(snapshot.unknownVenueOrders === 0, `${prefix}_UNKNOWN_ORDER_PRESENT`);
    require(snapshot.journalHealthy, `${prefix}_JOURNAL_UNHEALTHY`);
    require(snapshot.marketMode === 'Open', `${prefix}_MARKET_NOT_OPEN`);
    require(snapshot.bestBid > 0 && snapshot.bestBid < snapshot.bestAsk, `${prefix}_BBO_INVALID`);
    require(snapshot.tickSize > 0 &&
      snapshot.lotSize > 0 &&
      snapshot.minimumSize > 0, `${prefix}_METADATA_INVALID`);
    require(snapshot.bboFresh, `${prefix}_BBO_STALE`);
  }
  require(initial.unresolvedExecutionPlans === 0, 'PREFLIGHT_UNRESOLVED_EXECUTION_PLAN');
  require(final.unresolvedExecutionPlans <= 1, 'FINAL_UNRESOLVED_EXECUTION_PLAN');
  require(pkg.network === 'mainnet', 'PACKAGE_MAINNET_REQUIRED');
  require(pkg.symbol === 'BTC/USD', 'PACKAGE_MARKET_REQUIRED');
  require(pkg.orderType === 'LIMIT', 'PACKAGE_LIMIT_REQUIRED');
  require(pkg.postOnly && pkg.timeInForce === 'PostOnly', 'PACKAGE_POST_ONLY_REQUIRED');
  require(pkg.quantity >= initial.minimumSize, 'PACKAGE_MINIMUM_QUANTITY_MISMATCH');
  require(pkg.notionalUsd === pkg.price * pkg.quantity, 'PACKAGE_NOTIONAL_MISMATCH');
  require(pkg.notionalUsd >= pkg.targetNotionalUsd &&
    pkg.notionalUsd <= pkg.maximumNotionalUsd, 'PACKAGE_NOTIONAL_BOUNDS_INVALID');
  require(pkg.price ===
    (pkg.selectedSide === 'BUY' ? initial.bestBid : initial.bestAsk), 'PACKAGE_PRICE_MISMATCH');
  require(pkg.transactionIntentMatch, 'TRANSACTION_INTENT_MISMATCH');
  const freshness =
    final.bestBid === pkg.bbo.bestBid && final.bestAsk === pkg.bbo.bestAsk
      ? 'FRESH'
      : 'EXECUTION_PACKAGE_STALE';
  require(freshness === 'FRESH', 'HANDOFF_PACKAGE_STALE');
  require(initial.marketAddress === final.marketAddress, 'FINAL_MARKET_CHANGED');
  require(pkg.subaccount ===
    pkg.transaction.semanticSummary.subaccount, 'TRANSACTION_SUBACCOUNT_MISMATCH');

  const ready = blockers.length === 0;
  const body = {
    schemaVersion: DECIBEL_MINIMAL_LIVE_CANARY_OPERATOR_HANDOFF_V1,
    strategyIdentity: 'DECIBEL_MARKET_MAKER_V1' as const,
    canaryId: pkg.canaryId,
    executionSessionId: pkg.executionSessionId,
    createdAt: input.createdAt,
    network: pkg.network,
    subaccount: pkg.subaccount,
    market: 'BTC/USD' as const,
    marketAddress: pkg.market,
    side: pkg.selectedSide,
    price: pkg.price,
    quantity: pkg.quantity,
    notionalUsd: pkg.notionalUsd,
    venueMinimumNotionalUsd: pkg.venueMinimumNotionalUsd,
    targetNotionalUsd: pkg.targetNotionalUsd,
    maximumNotionalUsd: pkg.maximumNotionalUsd,
    orderType: 'LIMIT' as const,
    postOnly: true as const,
    bestBid: final.bestBid,
    bestAsk: final.bestAsk,
    tickSize: final.tickSize,
    lotSize: final.lotSize,
    minimumSize: final.minimumSize,
    marketObservedAt: final.observedAt,
    marketReceiptAt: final.receiptAt,
    clientOrderId: pkg.clientOrderId,
    configHash: pkg.configHash,
    executionPackageHash: pkg.packageIdentity,
    entryFunction: pkg.transaction.entryFunction,
    entryArguments: Object.freeze([...pkg.transaction.payload.functionArguments]),
    precommittedTransactionHash: input.precommittedTransactionHash ?? null,
    positionState: 'FLAT' as const,
    openOrderCount: final.openOrderCount,
    activeTwapCount: final.activeTwapCount,
    activeTpSlCount: final.activeTpSlCount,
    activeBulkExposure: final.activeBulkExposure,
    unknownVenueOrders: final.unknownVenueOrders,
    journalStatus: ready ? ('HANDOFF_READY_FOR_OPERATOR' as const) : ('HANDOFF_PREPARED' as const),
    unresolvedExecutionPlans: final.unresolvedExecutionPlans,
    transactionIntentMatch: pkg.transactionIntentMatch,
    handoffPackageFresh: freshness === 'FRESH',
    liveExecutionEnabled: false as const,
    venueMutationEnabled: false as const,
    signerEnabled: false as const,
    transactionSubmissionEnabled: false as const,
    operatorHandoffReady: ready,
    blockers: Object.freeze(blockers),
    mutationCounters: Object.freeze({
      signedTransactions: 0 as const,
      submittedTransactions: 0 as const,
      placedOrders: 0 as const,
      cancelledOrders: 0 as const,
      replacedOrders: 0 as const,
      venueMutations: 0 as const,
    }),
  };
  return Object.freeze({ ...body, handoffPackageHash: stableHash(body) });
}
