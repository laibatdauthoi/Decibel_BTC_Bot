import { createHash } from 'node:crypto';

import type { decibel_minimal_live_canary_journal_v1 } from './decibel_minimal_live_canary_journal_v1.js';
import {
  KNOWN_VENUE_CONTRACT_LIMITATION,
  assertDecibelDeterministicCanarySideIdentityV1,
  deriveDecibelDeterministicCanarySideV1,
  type DecibelMinimalLiveCanaryConfigurationV1,
  type decibel_minimal_live_canary_plan_v1,
} from './decibel_minimal_live_canary_v1.js';

export const DECIBEL_MINIMAL_LIVE_CANARY_EXECUTION_PACKAGE_V1 =
  'DECIBEL_MINIMAL_LIVE_CANARY_EXECUTION_PACKAGE_V1' as const;
export const CANARY_BROADCAST_AUTHORIZED = false as const;

export type decibel_canary_transaction_payload_v1 = Readonly<{
  function: string;
  typeArguments: readonly [];
  functionArguments: readonly [
    string,
    string,
    number,
    number,
    boolean,
    1,
    false,
    string,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ];
}>;

export type DecibelMinimalLiveCanaryExecutionPackageV1 = Readonly<{
  packageVersion: typeof DECIBEL_MINIMAL_LIVE_CANARY_EXECUTION_PACKAGE_V1;
  packageIdentity: string;
  timestamp: number;
  canaryId: string;
  executionSessionId: string;
  strategyConfigId: string;
  configHash: string;
  network: string;
  subaccount: string;
  market: string;
  symbol: 'BTC/USD';
  sideSelectionMode: 'AUTO_DETERMINISTIC_CANARY_V1';
  sideSelectionVersion: 1;
  sideSeedHash: string;
  selectedSide: 'BUY' | 'SELL';
  marketObservedAt: number;
  packageFreshness: 'FRESH_AT_CONSTRUCTION';
  bbo: Readonly<{ bestBid: number; bestAsk: number }>;
  price: number;
  quantity: number;
  notionalUsd: number;
  venueMinimumNotionalUsd: number;
  targetNotionalUsd: number;
  maximumNotionalUsd: number;
  orderType: 'LIMIT';
  timeInForce: 'PostOnly';
  postOnly: true;
  clientOrderId: string;
  transaction: Readonly<{
    sdkContract: '@decibeltrade/sdk DecibelWriteDex.placeOrder';
    entryFunction: string;
    payload: decibel_canary_transaction_payload_v1;
    semanticSummary: Readonly<{
      subaccount: string;
      market: string;
      side: 'BUY' | 'SELL';
      price: number;
      quantity: number;
      timeInForce: 'PostOnly';
      reduceOnly: false;
      clientOrderId: string;
    }>;
    transactionIntentMatch: true;
    signerInitialized: false;
    signedTransactionBytes: null;
  }>;
  riskChecks: Readonly<{
    freshFinalPreflight: true;
    bufferedQuantityTargetMet: true;
    tickAligned: true;
    lotAligned: true;
    nonCrossing: true;
    notionalWithinCap: true;
  }>;
  journalStatus: 'PREPARED_AND_DURABLE';
  submitWithoutDurableHash: 'IMPOSSIBLE';
  canaryBroadcastAuthorized: false;
  finalPreflightReady: true;
  transactionIntentMatch: true;
  executionPackageReady: true;
  knownVenueLimitation: typeof KNOWN_VENUE_CONTRACT_LIMITATION;
  minimalLiveCanaryReconciliationReady: 'NO_UNDER_STRICT_PROOF_STANDARD';
  minimalLiveCanaryOperationalRisk: 'BOUNDED_AND_FAIL_CLOSED';
  outcomeContract: readonly [
    'PLACE_ABORTED_NO_MUTATION',
    'NO_MAKER_FILL_SAFE_TERMINATION',
    'PARTIAL_MAKER_FILL_SAFE_TERMINATION',
    'FULL_MAKER_FILL_SAFE_TERMINATION',
    'AMBIGUOUS_FAIL_CLOSED',
    'SAFETY_INVARIANT_VIOLATION',
  ];
  lifecycleLimits: Readonly<{
    maximumPlacementTransactions: 1;
    maximumVenueOrdersPerSession: 1;
    maximumConcurrentLiveOrders: 1;
    automaticPlaceRetry: false;
    automaticReplacementOrder: false;
    automaticRecycleOrder: false;
    automaticCanaryRestart: false;
  }>;
  recovery: Readonly<{
    placementRecovery: 'BY_DURABLE_TRANSACTION_HASH';
    fillLookup: 'AUTHENTICATED_OWN_FILL_LOOKUP';
    positionConservation: 'REQUIRED';
    fullFillRemainderZeroProof: 'REQUIRED';
    emergencyCancel: Readonly<{ subaccount: string; market: string; clientOrderId: string }>;
    cancellationTransactionPrecommit: 'REQUIRED';
    ambiguousCancel: 'FAIL_CLOSED';
  }>;
  operatorSummary: Readonly<{
    title: 'FIRST CANARY';
    maximumVenueOrders: 1;
    maximumConcurrentOrders: 1;
    automaticReplacement: 'NO';
    automaticRecycling: 'NO';
    automaticRetry: 'NO';
    startingPosition: 'FLAT';
    maxAbsInventory: number;
  }>;
  safetyCounters: Readonly<{
    signedTransactions: 0;
    submittedTransactions: 0;
    placedOrders: 0;
    cancelledOrders: 0;
    venueMutations: 0;
  }>;
  liveExecutionEnabled: false;
}>;

function aligned(value: number, increment: number): boolean {
  const steps = value / increment;
  return Number.isFinite(steps) && Math.abs(steps - Math.round(steps)) < 1e-8;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
}

export function buildDecibelCanaryPlaceOrderPayloadV1(input: {
  packageAddress: string;
  plan: decibel_minimal_live_canary_plan_v1;
}): decibel_canary_transaction_payload_v1 {
  if (!/^0x[0-9a-f]+$/i.test(input.packageAddress))
    throw new Error('CANARY_TRANSACTION_PACKAGE_ADDRESS_INVALID');
  return Object.freeze<decibel_canary_transaction_payload_v1>({
    function: `${input.packageAddress}::dex_accounts_entry::place_order_to_subaccount`,
    typeArguments: Object.freeze([]),
    functionArguments: Object.freeze([
      input.plan.account,
      input.plan.market,
      input.plan.price,
      input.plan.quantity,
      input.plan.side === 'BUY',
      1,
      false,
      input.plan.clientOrderId,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]),
  });
}

export function verifyDecibelCanaryTransactionIntentV1(input: {
  payload: decibel_canary_transaction_payload_v1;
  packageAddress: string;
  plan: decibel_minimal_live_canary_plan_v1;
}): boolean {
  const expected = buildDecibelCanaryPlaceOrderPayloadV1(input);
  return JSON.stringify(input.payload) === JSON.stringify(expected);
}

export function classifyDecibelExecutionPackageFreshnessV1(input: {
  marketObservedAt: number;
  currentObservedAt: number;
  frozenBestBid: number;
  frozenBestAsk: number;
  currentBestBid: number;
  currentBestAsk: number;
}): 'FRESH' | 'EXECUTION_PACKAGE_STALE' {
  return input.currentObservedAt === input.marketObservedAt &&
    input.currentBestBid === input.frozenBestBid &&
    input.currentBestAsk === input.frozenBestAsk
    ? 'FRESH'
    : 'EXECUTION_PACKAGE_STALE';
}

export function buildDecibelMinimalLiveCanaryExecutionPackageV1(input: {
  configuration: DecibelMinimalLiveCanaryConfigurationV1;
  plan: decibel_minimal_live_canary_plan_v1;
  packageAddress: string;
  marketObservedAt: number;
  bestBid: number;
  bestAsk: number;
  tickSize: number;
  lotSize: number;
  minimumQuantity: number;
  notionalCapUsd: number;
  finalPreflightReady: boolean;
  journal: Pick<
    decibel_minimal_live_canary_journal_v1,
    'prepare' | 'get' | 'recordExecutionPackage' | 'getExecutionPackage'
  >;
  timestamp: number;
}): DecibelMinimalLiveCanaryExecutionPackageV1 {
  if (!input.finalPreflightReady) throw new Error('CANARY_FINAL_PREFLIGHT_NOT_READY');
  assertDecibelDeterministicCanarySideIdentityV1(input.configuration);
  const side = deriveDecibelDeterministicCanarySideV1({
    subaccount: input.configuration.subaccount,
    market: input.configuration.market,
  });
  if (
    side.sideSeedHash !== input.configuration.sideSeedHash ||
    side.side !== input.configuration.side
  )
    throw new Error('CANARY_SIDE_IDENTITY_CONFLICT');
  const expectedPrice = input.plan.side === 'BUY' ? input.bestBid : input.bestAsk;
  const notionalUsd = input.plan.price * input.plan.quantity;
  if (
    input.plan.quantity < input.minimumQuantity ||
    input.plan.notionalUsd !== notionalUsd ||
    input.plan.venueMinimumNotionalUsd > input.plan.targetNotionalUsd ||
    input.plan.targetNotionalUsd > input.plan.maximumNotionalUsd ||
    input.plan.maximumNotionalUsd !== input.notionalCapUsd ||
    notionalUsd < input.plan.targetNotionalUsd ||
    input.plan.price !== expectedPrice ||
    !aligned(input.plan.price, input.tickSize) ||
    !aligned(input.plan.quantity, input.lotSize) ||
    input.bestBid >= input.bestAsk ||
    (input.plan.side === 'BUY' && input.plan.price >= input.bestAsk) ||
    (input.plan.side === 'SELL' && input.plan.price <= input.bestBid) ||
    input.plan.orderType !== 'LIMIT' ||
    input.plan.timeInForce !== 'PostOnly' ||
    !input.plan.postOnly ||
    notionalUsd > input.notionalCapUsd
  )
    throw new Error('CANARY_FINAL_ORDER_PLAN_INVALID');

  // This durable PREPARED record deliberately precedes transaction payload construction.
  input.journal.prepare({
    configuration: input.configuration,
    plan: input.plan,
    preparedAt: input.timestamp,
  });
  const durable = input.journal.get(input.configuration.canaryId);
  if (durable?.state !== 'PREPARED') throw new Error('CANARY_JOURNAL_PREPARE_NOT_DURABLE');

  const payload = buildDecibelCanaryPlaceOrderPayloadV1(input);
  if (!verifyDecibelCanaryTransactionIntentV1({ ...input, payload }))
    throw new Error('CANARY_TRANSACTION_INTENT_MISMATCH');
  const identityMaterial = {
    canaryConfigHash: input.configuration.configHash,
    clientOrderId: input.plan.clientOrderId,
    marketObservedAt: input.marketObservedAt,
    payload,
  };
  const packageIdentity = createHash('sha256')
    .update(JSON.stringify(canonical(identityMaterial)))
    .digest('hex');
  const executionPackage: DecibelMinimalLiveCanaryExecutionPackageV1 = Object.freeze({
    packageVersion: DECIBEL_MINIMAL_LIVE_CANARY_EXECUTION_PACKAGE_V1,
    packageIdentity,
    timestamp: input.timestamp,
    canaryId: input.configuration.canaryId,
    executionSessionId: input.configuration.executionSessionId,
    strategyConfigId: input.configuration.strategyConfigId,
    configHash: input.configuration.configHash,
    network: input.configuration.network,
    subaccount: input.configuration.subaccount,
    market: input.configuration.market,
    symbol: 'BTC/USD',
    sideSelectionMode: 'AUTO_DETERMINISTIC_CANARY_V1',
    sideSelectionVersion: 1,
    sideSeedHash: side.sideSeedHash,
    selectedSide: side.side,
    marketObservedAt: input.marketObservedAt,
    packageFreshness: 'FRESH_AT_CONSTRUCTION',
    bbo: Object.freeze({ bestBid: input.bestBid, bestAsk: input.bestAsk }),
    price: input.plan.price,
    quantity: input.plan.quantity,
    notionalUsd,
    venueMinimumNotionalUsd: input.plan.venueMinimumNotionalUsd,
    targetNotionalUsd: input.plan.targetNotionalUsd,
    maximumNotionalUsd: input.plan.maximumNotionalUsd,
    orderType: 'LIMIT',
    timeInForce: 'PostOnly',
    postOnly: true,
    clientOrderId: input.plan.clientOrderId,
    transaction: Object.freeze({
      sdkContract: '@decibeltrade/sdk DecibelWriteDex.placeOrder',
      entryFunction: payload.function,
      payload,
      semanticSummary: Object.freeze({
        subaccount: input.plan.account,
        market: input.plan.market,
        side: input.plan.side,
        price: input.plan.price,
        quantity: input.plan.quantity,
        timeInForce: 'PostOnly',
        reduceOnly: false,
        clientOrderId: input.plan.clientOrderId,
      }),
      transactionIntentMatch: true,
      signerInitialized: false,
      signedTransactionBytes: null,
    }),
    riskChecks: Object.freeze({
      freshFinalPreflight: true,
      bufferedQuantityTargetMet: true,
      tickAligned: true,
      lotAligned: true,
      nonCrossing: true,
      notionalWithinCap: true,
    }),
    journalStatus: 'PREPARED_AND_DURABLE',
    submitWithoutDurableHash: 'IMPOSSIBLE',
    canaryBroadcastAuthorized: CANARY_BROADCAST_AUTHORIZED,
    finalPreflightReady: true,
    transactionIntentMatch: true,
    executionPackageReady: true,
    knownVenueLimitation: KNOWN_VENUE_CONTRACT_LIMITATION,
    minimalLiveCanaryReconciliationReady: 'NO_UNDER_STRICT_PROOF_STANDARD',
    minimalLiveCanaryOperationalRisk: 'BOUNDED_AND_FAIL_CLOSED',
    outcomeContract: Object.freeze([
      'PLACE_ABORTED_NO_MUTATION',
      'NO_MAKER_FILL_SAFE_TERMINATION',
      'PARTIAL_MAKER_FILL_SAFE_TERMINATION',
      'FULL_MAKER_FILL_SAFE_TERMINATION',
      'AMBIGUOUS_FAIL_CLOSED',
      'SAFETY_INVARIANT_VIOLATION',
    ] as const),
    lifecycleLimits: Object.freeze({
      maximumPlacementTransactions: 1,
      maximumVenueOrdersPerSession: 1,
      maximumConcurrentLiveOrders: 1,
      automaticPlaceRetry: false,
      automaticReplacementOrder: false,
      automaticRecycleOrder: false,
      automaticCanaryRestart: false,
    }),
    recovery: Object.freeze({
      placementRecovery: 'BY_DURABLE_TRANSACTION_HASH',
      fillLookup: 'AUTHENTICATED_OWN_FILL_LOOKUP',
      positionConservation: 'REQUIRED',
      fullFillRemainderZeroProof: 'REQUIRED',
      emergencyCancel: Object.freeze({
        subaccount: input.plan.account,
        market: input.plan.market,
        clientOrderId: input.plan.clientOrderId,
      }),
      cancellationTransactionPrecommit: 'REQUIRED',
      ambiguousCancel: 'FAIL_CLOSED',
    }),
    operatorSummary: Object.freeze({
      title: 'FIRST CANARY',
      maximumVenueOrders: 1,
      maximumConcurrentOrders: 1,
      automaticReplacement: 'NO',
      automaticRecycling: 'NO',
      automaticRetry: 'NO',
      startingPosition: 'FLAT',
      maxAbsInventory: input.plan.quantity,
    }),
    safetyCounters: Object.freeze({
      signedTransactions: 0,
      submittedTransactions: 0,
      placedOrders: 0,
      cancelledOrders: 0,
      venueMutations: 0,
    }),
    liveExecutionEnabled: false,
  });
  input.journal.recordExecutionPackage(executionPackage);
  const restoredPackage = input.journal.getExecutionPackage(input.configuration.canaryId);
  if (JSON.stringify(restoredPackage) !== JSON.stringify(executionPackage))
    throw new Error('CANARY_EXECUTION_PACKAGE_NOT_DURABLE');
  return executionPackage;
}

export function assertDecibelCanaryBroadcastUnavailableV1(): never {
  throw new Error('CANARY_BROADCAST_NOT_AUTHORIZED');
}
