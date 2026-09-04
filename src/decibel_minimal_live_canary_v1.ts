import { createHash } from 'node:crypto';

import { generateDecibelCanaryClientOrderIdV1 } from './decibel_durable_client_order_identity_recovery_v1.js';

export const DECIBEL_MINIMAL_LIVE_CANARY_V1 = 'DECIBEL_MINIMAL_LIVE_CANARY_V1' as const;
export const DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 =
  '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861' as const;
export const MINIMAL_LIVE_CANARY_SPEC_READY = true as const;
export const LIVE_EXECUTION_ENABLED = false as const;
export const KNOWN_VENUE_CONTRACT_LIMITATION =
  'SUCCESSFUL_CANCEL_POSTCONDITION_NOT_PUBLICLY_PROVABLE' as const;
export const DECIBEL_CANARY_SIDE_SELECTION_MODE_V1 = 'AUTO_DETERMINISTIC_CANARY_V1' as const;
export const DECIBEL_CANARY_DEFAULT_MIN_NOTIONAL_USD = 10 as const;
export const DECIBEL_CANARY_DEFAULT_TARGET_NOTIONAL_USD = 20 as const;
export const DECIBEL_CANARY_DEFAULT_MAX_NOTIONAL_USD = 100 as const;

function normalizeCanaryAddress(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]+$/.test(normalized)) throw new Error('CANARY_SIDE_ADDRESS_INVALID');
  return `0x${normalized.slice(2).padStart(64, '0')}`;
}

export function deriveDecibelDeterministicCanarySideV1(input: {
  subaccount: string;
  market: string;
}): Readonly<{
  strategyIdentity: 'DECIBEL_MARKET_MAKER_V1';
  canaryProtocolVersion: 'MINIMAL_LIVE_CANARY_V1';
  sideSelectionMode: typeof DECIBEL_CANARY_SIDE_SELECTION_MODE_V1;
  sideSelectionVersion: 1;
  canonicalSeed: string;
  sideSeedHash: string;
  sideBit: 0 | 1;
  side: 'BUY' | 'SELL';
}> {
  const canonicalSeed = [
    'DECIBEL_MARKET_MAKER_V1',
    'MINIMAL_LIVE_CANARY_V1',
    normalizeCanaryAddress(input.subaccount),
    normalizeCanaryAddress(input.market),
    'AUTO_DETERMINISTIC_CANARY_SIDE_V1',
  ].join('|');
  const digest = createHash('sha256').update(canonicalSeed).digest();
  const sideBit = (digest[31]! & 1) as 0 | 1;
  return Object.freeze({
    strategyIdentity: 'DECIBEL_MARKET_MAKER_V1',
    canaryProtocolVersion: 'MINIMAL_LIVE_CANARY_V1',
    sideSelectionMode: DECIBEL_CANARY_SIDE_SELECTION_MODE_V1,
    sideSelectionVersion: 1,
    canonicalSeed,
    sideSeedHash: digest.toString('hex'),
    sideBit,
    side: sideBit === 0 ? 'BUY' : 'SELL',
  });
}

export type decibel_minimal_live_canary_state_v1 =
  | 'CREATED'
  | 'PREFLIGHT'
  | 'PREFLIGHT_PASSED'
  | 'PREPARED'
  | 'SIGNED_AND_DURABLE'
  | 'SUBMISSION_STARTED'
  | 'PLACE_TX_PENDING'
  | 'PLACE_TX_COMMITTED_SUCCESS'
  | 'PLACE_TX_COMMITTED_ABORT'
  | 'ORDER_OBSERVATION'
  | 'EXECUTION_OBSERVED'
  | 'NO_EXECUTION_OBSERVED'
  | 'RECOVERY_REQUIRED'
  | 'EMERGENCY_CANCEL_REQUIRED'
  | 'EMERGENCY_CANCEL_TX_PENDING'
  | 'RECONCILING'
  | 'SAFE_NO_MUTATION'
  | 'SAFE_NO_EXECUTION'
  | 'SAFE_PARTIAL_EXECUTION_NEUTRALIZED'
  | 'SAFE_FULL_EXECUTION'
  | 'AMBIGUOUS_FAIL_CLOSED'
  | 'COMPLETE';

export type DecibelMinimalLiveCanaryConfigurationV1 = Readonly<{
  specification: typeof DECIBEL_MINIMAL_LIVE_CANARY_V1;
  canaryId: string;
  executionSessionId: string;
  account: string;
  subaccount: string;
  network: string;
  market: typeof DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1;
  side: 'BUY' | 'SELL';
  sideSelectionMode: 'AUTO_DETERMINISTIC_CANARY_V1' | 'TEST_ONLY_EXPLICIT_SIDE';
  sideSelectionVersion: 1;
  sideSeedHash: string;
  manualSideOverrideAllowed: false;
  quantityPolicy: 'BUFFERED_NOTIONAL_TARGET';
  orderType: 'LIMIT';
  timeInForce: 'PostOnly';
  postOnlyRequired: true;
  maximumVenueOrdersPerSession: 1;
  maximumConcurrentLiveOrders: 1;
  maximumPlacementTransactions: 1;
  maximumStrategyOrdersAfterFirstSubmission: 0;
  observationTimeoutMs: number;
  executionRecoveryTimeoutMs: number;
  strategyConfigId: string;
  liveAuthorizationRequirement: 'SEPARATE_EXPLICIT_FUTURE_AUTHORIZATION';
  automaticPlaceRetry: false;
  automaticCanaryRestart: false;
  automaticSecondOrder: false;
  automaticReplacementOrder: false;
  automaticRecycleOrder: false;
  configHash: string;
  liveExecutionEnabled: false;
}>;

type canary_configuration_input = Omit<
  DecibelMinimalLiveCanaryConfigurationV1,
  | 'specification'
  | 'quantityPolicy'
  | 'orderType'
  | 'timeInForce'
  | 'postOnlyRequired'
  | 'sideSelectionMode'
  | 'sideSelectionVersion'
  | 'sideSeedHash'
  | 'manualSideOverrideAllowed'
  | 'maximumVenueOrdersPerSession'
  | 'maximumConcurrentLiveOrders'
  | 'maximumPlacementTransactions'
  | 'maximumStrategyOrdersAfterFirstSubmission'
  | 'liveAuthorizationRequirement'
  | 'automaticPlaceRetry'
  | 'automaticCanaryRestart'
  | 'automaticSecondOrder'
  | 'automaticReplacementOrder'
  | 'automaticRecycleOrder'
  | 'configHash'
  | 'liveExecutionEnabled'
>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  return value;
}

export function serializeDecibelMinimalLiveCanaryConfigurationV1(
  configuration: Omit<DecibelMinimalLiveCanaryConfigurationV1, 'configHash'>,
): string {
  return JSON.stringify(canonicalize(configuration));
}

export function hashDecibelMinimalLiveCanaryConfigurationV1(
  configuration: Omit<DecibelMinimalLiveCanaryConfigurationV1, 'configHash'>,
): string {
  return createHash('sha256')
    .update(serializeDecibelMinimalLiveCanaryConfigurationV1(configuration))
    .digest('hex');
}

export function createDecibelMinimalLiveCanaryConfigurationV1(
  input: canary_configuration_input,
): DecibelMinimalLiveCanaryConfigurationV1 {
  if (
    !input.canaryId ||
    !input.executionSessionId ||
    !input.account ||
    !input.subaccount ||
    input.account !== input.subaccount ||
    !input.network ||
    input.market !== DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 ||
    (input.side !== 'BUY' && input.side !== 'SELL') ||
    !input.strategyConfigId ||
    !Number.isSafeInteger(input.observationTimeoutMs) ||
    input.observationTimeoutMs <= 0 ||
    !Number.isSafeInteger(input.executionRecoveryTimeoutMs) ||
    input.executionRecoveryTimeoutMs <= 0
  )
    throw new Error('CANARY_CONFIGURATION_INVALID');
  const unhashed = Object.freeze({
    specification: DECIBEL_MINIMAL_LIVE_CANARY_V1,
    ...input,
    quantityPolicy: 'BUFFERED_NOTIONAL_TARGET' as const,
    orderType: 'LIMIT' as const,
    timeInForce: 'PostOnly' as const,
    postOnlyRequired: true as const,
    sideSelectionMode: 'TEST_ONLY_EXPLICIT_SIDE' as const,
    sideSelectionVersion: 1 as const,
    sideSeedHash: createHash('sha256')
      .update(`TEST_ONLY_EXPLICIT_SIDE|${input.side}`)
      .digest('hex'),
    manualSideOverrideAllowed: false as const,
    maximumVenueOrdersPerSession: 1 as const,
    maximumConcurrentLiveOrders: 1 as const,
    maximumPlacementTransactions: 1 as const,
    maximumStrategyOrdersAfterFirstSubmission: 0 as const,
    liveAuthorizationRequirement: 'SEPARATE_EXPLICIT_FUTURE_AUTHORIZATION' as const,
    automaticPlaceRetry: false as const,
    automaticCanaryRestart: false as const,
    automaticSecondOrder: false as const,
    automaticReplacementOrder: false as const,
    automaticRecycleOrder: false as const,
    liveExecutionEnabled: false as const,
  });
  return Object.freeze({
    ...unhashed,
    configHash: hashDecibelMinimalLiveCanaryConfigurationV1(unhashed),
  });
}

export function createDecibelAutoMinimalLiveCanaryConfigurationV1(
  input: Omit<canary_configuration_input, 'side'>,
): DecibelMinimalLiveCanaryConfigurationV1 {
  const selection = deriveDecibelDeterministicCanarySideV1({
    subaccount: input.subaccount,
    market: input.market,
  });
  const explicit = createDecibelMinimalLiveCanaryConfigurationV1({
    ...input,
    side: selection.side,
  });
  const { configHash: ignored, ...explicitUnhashed } = explicit;
  void ignored;
  const unhashed = Object.freeze({
    ...explicitUnhashed,
    sideSelectionMode: selection.sideSelectionMode,
    sideSelectionVersion: selection.sideSelectionVersion,
    sideSeedHash: selection.sideSeedHash,
  });
  return Object.freeze({
    ...unhashed,
    configHash: hashDecibelMinimalLiveCanaryConfigurationV1(unhashed),
  });
}

export function assertDecibelDeterministicCanarySideIdentityV1(
  configuration: DecibelMinimalLiveCanaryConfigurationV1,
): void {
  if (configuration.sideSelectionMode !== DECIBEL_CANARY_SIDE_SELECTION_MODE_V1) return;
  const derived = deriveDecibelDeterministicCanarySideV1({
    subaccount: configuration.subaccount,
    market: configuration.market,
  });
  if (
    configuration.side !== derived.side ||
    configuration.sideSeedHash !== derived.sideSeedHash ||
    configuration.sideSelectionVersion !== derived.sideSelectionVersion
  )
    throw new Error('CANARY_SIDE_IDENTITY_CONFLICT');
}

export type decibel_minimal_live_canary_preflight_v1 = Readonly<{
  authenticatedAccount: string;
  configuredNetwork: string;
  observedNetwork: string;
  market: string;
  metadataFresh: boolean;
  marketOperational: boolean;
  tickSize: number;
  lotSize: number;
  minimumOrderSize: number;
  minimumMetadataValidQuantity: number;
  authoritativeVenueMinimumNotionalUsd?: number;
  bestBid: number;
  bestAsk: number;
  exactMarketIdentity: boolean;
  authoritativeNoOpenPosition: boolean;
  dedicatedSubaccount: boolean;
  unresolvedExecutionJournalCount: number;
  unexpectedOpenStrategyActivityCount: number;
  activeTpSlCount: number;
  activeTwapCount: number;
  activeBulkOrderCount: number;
  expectedDelegatedOrManualActivity: boolean;
  journalHealthy: boolean;
}>;

export type decibel_minimal_live_canary_plan_v1 = Readonly<{
  canaryId: string;
  executionSessionId: string;
  canaryConfigHash: string;
  clientOrderId: string;
  account: string;
  market: typeof DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  notionalUsd: number;
  venueMinimumNotionalUsd: number;
  targetNotionalUsd: number;
  maximumNotionalUsd: number;
  orderType: 'LIMIT';
  timeInForce: 'PostOnly';
  postOnly: true;
  action: 'WOULD_PLACE';
  maximumVenueOrdersPerSession: 1;
  maximumConcurrentLiveOrders: 1;
  maximumPlacementTransactions: 1;
  maximumStrategyOrdersAfterFirstSubmission: 0;
  liveExecutionEnabled: false;
}>;

function isTickAligned(value: number, increment: number): boolean {
  const quotient = value / increment;
  return Number.isFinite(quotient) && Math.abs(quotient - Math.round(quotient)) < 1e-8;
}

export function calculateDecibelMinimalLiveCanaryBufferedQuantityV1(input: {
  frozenOrderPrice: number;
  lotSize: number;
  metadataMinimumQuantity: number;
  authoritativeVenueMinimumNotionalUsd?: number;
  configuredMinimumNotionalUsd?: number;
  configuredTargetNotionalUsd?: number;
  configuredMaximumNotionalUsd?: number;
}): Readonly<{
  effectiveMinimumNotionalUsd: number;
  effectiveTargetNotionalUsd: number;
  maximumNotionalUsd: number;
  targetQuantity: number;
  selectedCanaryQuantity: number;
  selectedCanaryNotionalUsd: number;
}> {
  const configuredMinimumNotionalUsd =
    input.configuredMinimumNotionalUsd ?? DECIBEL_CANARY_DEFAULT_MIN_NOTIONAL_USD;
  const configuredTargetNotionalUsd =
    input.configuredTargetNotionalUsd ?? DECIBEL_CANARY_DEFAULT_TARGET_NOTIONAL_USD;
  const maximumNotionalUsd =
    input.configuredMaximumNotionalUsd ?? DECIBEL_CANARY_DEFAULT_MAX_NOTIONAL_USD;
  const authoritativeVenueMinimumNotionalUsd = input.authoritativeVenueMinimumNotionalUsd ?? 0;
  if (
    !(input.frozenOrderPrice > 0) ||
    !(input.lotSize > 0) ||
    !(input.metadataMinimumQuantity > 0) ||
    !(configuredMinimumNotionalUsd > 0) ||
    !(configuredTargetNotionalUsd > 0) ||
    !(maximumNotionalUsd > 0) ||
    !(authoritativeVenueMinimumNotionalUsd >= 0)
  )
    throw new Error('CANARY_NOTIONAL_CONFIGURATION_INVALID');
  const effectiveMinimumNotionalUsd = Math.max(
    authoritativeVenueMinimumNotionalUsd,
    configuredMinimumNotionalUsd,
  );
  const effectiveTargetNotionalUsd = Math.max(
    effectiveMinimumNotionalUsd,
    configuredTargetNotionalUsd,
  );
  if (
    effectiveMinimumNotionalUsd > effectiveTargetNotionalUsd ||
    effectiveTargetNotionalUsd > maximumNotionalUsd
  )
    throw new Error('CANARY_NOTIONAL_BOUNDS_UNSATISFIABLE');
  const targetLotSteps = Math.ceil(
    effectiveTargetNotionalUsd / input.frozenOrderPrice / input.lotSize,
  );
  const targetQuantity = Number((targetLotSteps * input.lotSize).toPrecision(15));
  const selectedCanaryQuantity = Math.max(input.metadataMinimumQuantity, targetQuantity);
  const selectedCanaryNotionalUsd = selectedCanaryQuantity * input.frozenOrderPrice;
  if (
    !isTickAligned(selectedCanaryQuantity, input.lotSize) ||
    selectedCanaryNotionalUsd < effectiveTargetNotionalUsd ||
    selectedCanaryNotionalUsd > maximumNotionalUsd
  )
    throw new Error('CANARY_NOTIONAL_BOUNDS_UNSATISFIABLE');
  return Object.freeze({
    effectiveMinimumNotionalUsd,
    effectiveTargetNotionalUsd,
    maximumNotionalUsd,
    targetQuantity,
    selectedCanaryQuantity,
    selectedCanaryNotionalUsd,
  });
}

export function planDecibelMinimalLiveCanaryV1(input: {
  configuration: DecibelMinimalLiveCanaryConfigurationV1;
  persistedConfigHash: string | null;
  preflight: decibel_minimal_live_canary_preflight_v1;
  requestedQuantity?: number;
  requestedOrderType?: string;
  requestedTimeInForce?: string;
  requestedPrice?: number;
  configuredMinimumNotionalUsd?: number;
  configuredTargetNotionalUsd?: number;
  configuredMaximumNotionalUsd?: number;
  placementTransactionCount: number;
  venueOrderCount: number;
}): decibel_minimal_live_canary_plan_v1 {
  const { configuration, preflight } = input;
  assertDecibelDeterministicCanarySideIdentityV1(configuration);
  const { configHash, ...unhashed } = configuration;
  if (hashDecibelMinimalLiveCanaryConfigurationV1(unhashed) !== configHash)
    throw new Error('CANARY_CONFIG_IDENTITY_CONFLICT');
  if (input.persistedConfigHash !== null && input.persistedConfigHash !== configHash)
    throw new Error('CANARY_CONFIG_IDENTITY_CONFLICT');
  if (!preflight.dedicatedSubaccount) throw new Error('CANARY_DEDICATED_SUBACCOUNT_REQUIRED');
  if (
    preflight.authenticatedAccount !== configuration.account ||
    preflight.configuredNetwork !== configuration.network ||
    preflight.observedNetwork !== configuration.network ||
    preflight.market !== configuration.market ||
    !preflight.exactMarketIdentity
  )
    throw new Error('CANARY_PREFLIGHT_IDENTITY_MISMATCH');
  if (!preflight.authoritativeNoOpenPosition)
    throw new Error('CANARY_ZERO_POSITION_ANCHOR_REQUIRED');
  if (
    !preflight.metadataFresh ||
    !preflight.marketOperational ||
    !(preflight.tickSize > 0) ||
    !(preflight.lotSize > 0) ||
    !(preflight.minimumOrderSize > 0) ||
    !(preflight.minimumMetadataValidQuantity >= preflight.minimumOrderSize) ||
    !isTickAligned(preflight.minimumMetadataValidQuantity, preflight.lotSize) ||
    !(preflight.bestBid > 0) ||
    !(preflight.bestAsk > preflight.bestBid) ||
    !isTickAligned(preflight.bestBid, preflight.tickSize) ||
    !isTickAligned(preflight.bestAsk, preflight.tickSize)
  )
    throw new Error('CANARY_MARKET_DATA_INVALID');
  if (
    preflight.unresolvedExecutionJournalCount !== 0 ||
    preflight.unexpectedOpenStrategyActivityCount !== 0 ||
    preflight.activeTpSlCount !== 0 ||
    preflight.activeTwapCount !== 0 ||
    preflight.activeBulkOrderCount !== 0 ||
    preflight.expectedDelegatedOrManualActivity ||
    !preflight.journalHealthy
  )
    throw new Error('CANARY_PREFLIGHT_FAILED');
  if ((input.requestedOrderType ?? 'LIMIT') !== 'LIMIT')
    throw new Error('CANARY_LIMIT_ORDER_REQUIRED');
  if ((input.requestedTimeInForce ?? 'PostOnly') !== 'PostOnly')
    throw new Error('CANARY_POST_ONLY_REQUIRED');
  if (input.placementTransactionCount !== 0)
    throw new Error('CANARY_PLACEMENT_TRANSACTION_LIMIT_REACHED');
  if (input.venueOrderCount !== 0) throw new Error('CANARY_VENUE_ORDER_LIMIT_REACHED');
  const price =
    input.requestedPrice ?? (configuration.side === 'BUY' ? preflight.bestBid : preflight.bestAsk);
  if (price !== (configuration.side === 'BUY' ? preflight.bestBid : preflight.bestAsk))
    throw new Error('CANARY_EXACT_BBO_JOIN_REQUIRED');
  if (
    (configuration.side === 'BUY' && price >= preflight.bestAsk) ||
    (configuration.side === 'SELL' && price <= preflight.bestBid)
  )
    throw new Error('CANARY_CROSSING_RISK');
  const sizing = calculateDecibelMinimalLiveCanaryBufferedQuantityV1({
    frozenOrderPrice: price,
    lotSize: preflight.lotSize,
    metadataMinimumQuantity: preflight.minimumMetadataValidQuantity,
    ...(preflight.authoritativeVenueMinimumNotionalUsd === undefined
      ? {}
      : { authoritativeVenueMinimumNotionalUsd: preflight.authoritativeVenueMinimumNotionalUsd }),
    ...(input.configuredMinimumNotionalUsd === undefined
      ? {}
      : { configuredMinimumNotionalUsd: input.configuredMinimumNotionalUsd }),
    ...(input.configuredTargetNotionalUsd === undefined
      ? {}
      : { configuredTargetNotionalUsd: input.configuredTargetNotionalUsd }),
    ...(input.configuredMaximumNotionalUsd === undefined
      ? {}
      : { configuredMaximumNotionalUsd: input.configuredMaximumNotionalUsd }),
  });
  const quantity = input.requestedQuantity ?? sizing.selectedCanaryQuantity;
  if (quantity !== sizing.selectedCanaryQuantity)
    throw new Error('CANARY_BUFFERED_QUANTITY_REQUIRED');
  return Object.freeze({
    canaryId: configuration.canaryId,
    executionSessionId: configuration.executionSessionId,
    canaryConfigHash: configHash,
    clientOrderId: generateDecibelCanaryClientOrderIdV1({
      executionSessionId: configuration.executionSessionId,
      localOrderSequence: 0,
      marketIdentity: configuration.market,
      strategyConfigId: configuration.strategyConfigId,
      side: configuration.side,
    }),
    account: configuration.account,
    market: configuration.market,
    side: configuration.side,
    price,
    quantity,
    notionalUsd: sizing.selectedCanaryNotionalUsd,
    venueMinimumNotionalUsd: sizing.effectiveMinimumNotionalUsd,
    targetNotionalUsd: sizing.effectiveTargetNotionalUsd,
    maximumNotionalUsd: sizing.maximumNotionalUsd,
    orderType: 'LIMIT',
    timeInForce: 'PostOnly',
    postOnly: true,
    action: 'WOULD_PLACE',
    maximumVenueOrdersPerSession: 1,
    maximumConcurrentLiveOrders: 1,
    maximumPlacementTransactions: 1,
    maximumStrategyOrdersAfterFirstSubmission: 0,
    liveExecutionEnabled: false,
  });
}

const transitions: Readonly<
  Record<decibel_minimal_live_canary_state_v1, readonly decibel_minimal_live_canary_state_v1[]>
> = Object.freeze({
  CREATED: ['PREFLIGHT'],
  PREFLIGHT: ['PREFLIGHT_PASSED', 'AMBIGUOUS_FAIL_CLOSED'],
  PREFLIGHT_PASSED: ['PREPARED', 'AMBIGUOUS_FAIL_CLOSED'],
  PREPARED: ['SIGNED_AND_DURABLE', 'SAFE_NO_MUTATION', 'AMBIGUOUS_FAIL_CLOSED'],
  SIGNED_AND_DURABLE: ['SUBMISSION_STARTED', 'SAFE_NO_MUTATION', 'AMBIGUOUS_FAIL_CLOSED'],
  SUBMISSION_STARTED: ['PLACE_TX_PENDING', 'RECOVERY_REQUIRED', 'AMBIGUOUS_FAIL_CLOSED'],
  PLACE_TX_PENDING: [
    'PLACE_TX_COMMITTED_SUCCESS',
    'PLACE_TX_COMMITTED_ABORT',
    'RECOVERY_REQUIRED',
    'AMBIGUOUS_FAIL_CLOSED',
  ],
  PLACE_TX_COMMITTED_SUCCESS: ['ORDER_OBSERVATION', 'AMBIGUOUS_FAIL_CLOSED'],
  PLACE_TX_COMMITTED_ABORT: ['SAFE_NO_MUTATION', 'AMBIGUOUS_FAIL_CLOSED'],
  ORDER_OBSERVATION: [
    'EXECUTION_OBSERVED',
    'NO_EXECUTION_OBSERVED',
    'RECOVERY_REQUIRED',
    'AMBIGUOUS_FAIL_CLOSED',
  ],
  EXECUTION_OBSERVED: ['EMERGENCY_CANCEL_REQUIRED', 'RECONCILING', 'AMBIGUOUS_FAIL_CLOSED'],
  NO_EXECUTION_OBSERVED: ['EMERGENCY_CANCEL_REQUIRED', 'AMBIGUOUS_FAIL_CLOSED'],
  RECOVERY_REQUIRED: [
    'PLACE_TX_PENDING',
    'EMERGENCY_CANCEL_TX_PENDING',
    'RECONCILING',
    'AMBIGUOUS_FAIL_CLOSED',
  ],
  EMERGENCY_CANCEL_REQUIRED: ['EMERGENCY_CANCEL_TX_PENDING', 'AMBIGUOUS_FAIL_CLOSED'],
  EMERGENCY_CANCEL_TX_PENDING: ['RECONCILING', 'RECOVERY_REQUIRED', 'AMBIGUOUS_FAIL_CLOSED'],
  RECONCILING: [
    'SAFE_NO_EXECUTION',
    'SAFE_PARTIAL_EXECUTION_NEUTRALIZED',
    'SAFE_FULL_EXECUTION',
    'AMBIGUOUS_FAIL_CLOSED',
  ],
  SAFE_NO_MUTATION: ['COMPLETE'],
  SAFE_NO_EXECUTION: ['COMPLETE'],
  SAFE_PARTIAL_EXECUTION_NEUTRALIZED: ['COMPLETE'],
  SAFE_FULL_EXECUTION: ['COMPLETE'],
  AMBIGUOUS_FAIL_CLOSED: ['COMPLETE'],
  COMPLETE: [],
});

export class decibel_minimal_live_canary_state_machine_v1 {
  private currentState: decibel_minimal_live_canary_state_v1 = 'CREATED';
  private readonly frozenConfigHash: string;
  private placementTransactions = 0;
  private venueOrders = 0;
  private mutationBlocked = false;

  public constructor(configuration: DecibelMinimalLiveCanaryConfigurationV1) {
    this.frozenConfigHash = configuration.configHash;
  }

  public get state(): decibel_minimal_live_canary_state_v1 {
    return this.currentState;
  }

  public transition(next: decibel_minimal_live_canary_state_v1): void {
    if (!transitions[this.currentState].includes(next))
      throw new Error('CANARY_STATE_TRANSITION_INVALID');
    this.currentState = next;
    if (next === 'AMBIGUOUS_FAIL_CLOSED' || next === 'COMPLETE') this.mutationBlocked = true;
  }

  public assertConfig(configuration: DecibelMinimalLiveCanaryConfigurationV1): void {
    if (configuration.configHash !== this.frozenConfigHash)
      throw new Error('CANARY_CONFIG_IDENTITY_CONFLICT');
  }

  public recordPlacementTransaction(): void {
    if (this.mutationBlocked || this.placementTransactions !== 0)
      throw new Error('CANARY_PLACEMENT_TRANSACTION_LIMIT_REACHED');
    this.placementTransactions = 1;
  }

  public recordVenueOrder(): void {
    if (this.mutationBlocked || this.venueOrders !== 0)
      throw new Error('CANARY_VENUE_ORDER_LIMIT_REACHED');
    this.venueOrders = 1;
  }

  public assertFutureMutationPermitted(): never {
    throw new Error('LIVE_EXECUTION_DISABLED');
  }

  public snapshot() {
    return Object.freeze({
      state: this.currentState,
      placementTransactionCount: this.placementTransactions,
      venueOrderCount: this.venueOrders,
      mutationBlocked: this.mutationBlocked,
      liveExecutionEnabled: false as const,
    });
  }
}

export type decibel_minimal_live_canary_fill_v1 = Readonly<{
  tradeId: string;
  orderId: string;
  clientOrderId: string;
  price: number;
  quantity: number;
  authenticated: true;
  source: 'AUTHENTICATED_USER_TRADE_HISTORY';
  makerProof: 'POST_ONLY_MAKER_CONTRACT_PROVEN';
  feeAmount: number | null;
  feeAsset: string | null;
  isRebate: boolean | null;
}>;

export function reconcileDecibelMinimalLiveCanaryExecutionV1(input: {
  plan: decibel_minimal_live_canary_plan_v1;
  venueOrderId: string;
  fills: readonly decibel_minimal_live_canary_fill_v1[];
  authenticatedPositionMagnitude: number;
  remainingExposureAuthoritativelyNeutralized: boolean;
}): Readonly<{
  uniqueFills: readonly decibel_minimal_live_canary_fill_v1[];
  filledQuantity: number;
  strategyInventory: number;
  actualExternalMakerVolumeUsd: number;
  cancelRequired: boolean;
  outcome: 'NO_FILL' | 'PARTIAL_FILL' | 'FULL_FILL';
  terminalState:
    | 'SAFE_NO_EXECUTION'
    | 'SAFE_PARTIAL_EXECUTION_NEUTRALIZED'
    | 'SAFE_FULL_EXECUTION'
    | 'AMBIGUOUS_FAIL_CLOSED';
  liveExecutionEnabled: false;
}> {
  if (!input.venueOrderId) throw new Error('CANARY_VENUE_ORDER_ID_REQUIRED');
  const unique = new Map<string, decibel_minimal_live_canary_fill_v1>();
  for (const fill of input.fills) {
    if (
      !fill.tradeId ||
      fill.orderId !== input.venueOrderId ||
      fill.clientOrderId !== input.plan.clientOrderId ||
      !fill.authenticated ||
      fill.source !== 'AUTHENTICATED_USER_TRADE_HISTORY' ||
      fill.makerProof !== 'POST_ONLY_MAKER_CONTRACT_PROVEN' ||
      !(fill.price > 0) ||
      !(fill.quantity > 0)
    )
      throw new Error('CANARY_ACTUAL_FILL_INVALID');
    const previous = unique.get(fill.tradeId);
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(fill))
      throw new Error('CANARY_FILL_IDENTITY_CONFLICT');
    unique.set(fill.tradeId, fill);
  }
  const uniqueFills = [...unique.values()];
  const filledQuantity = uniqueFills.reduce((sum, fill) => sum + fill.quantity, 0);
  if (filledQuantity > input.plan.quantity + Number.EPSILON) throw new Error('CANARY_OVERFILL');
  const strategyInventory = input.plan.side === 'BUY' ? filledQuantity : -filledQuantity;
  if (Math.abs(strategyInventory) > input.plan.quantity + Number.EPSILON)
    throw new Error('CANARY_INVENTORY_BOUND_VIOLATION');
  if (Math.abs(input.authenticatedPositionMagnitude - Math.abs(strategyInventory)) > Number.EPSILON)
    throw new Error('CANARY_POSITION_MISMATCH');
  const outcome =
    filledQuantity === 0
      ? 'NO_FILL'
      : filledQuantity === input.plan.quantity
        ? 'FULL_FILL'
        : 'PARTIAL_FILL';
  const cancelRequired = outcome !== 'FULL_FILL';
  const terminalState =
    outcome === 'FULL_FILL'
      ? 'SAFE_FULL_EXECUTION'
      : input.remainingExposureAuthoritativelyNeutralized
        ? outcome === 'NO_FILL'
          ? 'SAFE_NO_EXECUTION'
          : 'SAFE_PARTIAL_EXECUTION_NEUTRALIZED'
        : 'AMBIGUOUS_FAIL_CLOSED';
  return Object.freeze({
    uniqueFills: Object.freeze(uniqueFills),
    filledQuantity,
    strategyInventory,
    actualExternalMakerVolumeUsd: uniqueFills.reduce(
      (sum, fill) => sum + fill.price * fill.quantity,
      0,
    ),
    cancelRequired,
    outcome,
    terminalState,
    liveExecutionEnabled: false,
  });
}

export type DecibelMinimalLiveCanaryReportV1 = Readonly<{
  identity: Readonly<{
    canaryId: string;
    executionSessionId: string;
    strategyConfigId: string;
    canaryConfigHash: string;
    account: string;
    market: string;
    side: 'BUY' | 'SELL';
    quantity: number;
  }>;
  preflight: decibel_minimal_live_canary_preflight_v1;
  order: Readonly<{
    clientOrderId: string;
    requestedPrice: number;
    requestedQuantity: number;
    postOnly: true;
    placeTransactionHash: string | null;
    placeTransactionVersion: number | null;
    placeTransactionResult: string | null;
  }>;
  fills: Readonly<{
    tradeIds: readonly string[];
    venueOrderId: string | null;
    fillQuantity: number;
    makerVolumeUsd: number;
    feeMetadataComplete: boolean;
  }>;
  position: Readonly<{
    before: 'NO_OPEN_POSITION';
    afterMagnitude: number;
    conservationResult: 'PROVEN' | 'UNPROVEN';
    finalStrategyInventory: number;
  }>;
  cancel: Readonly<{
    required: boolean;
    clientOrderId: string;
    transactionHash: string | null;
    result: string | null;
    neutralizationClassification: string;
  }>;
  safety: Readonly<{
    orderCount: number;
    mutationCount: number;
    configIntegrity: boolean;
    journalIntegrity: boolean;
    ambiguityFlags: readonly string[];
  }>;
  result: Readonly<{
    transportSuccess: boolean;
    executionTruthSuccess: boolean;
    makerFillSuccess: boolean;
    safeTerminationSuccess: boolean;
    primaryClassification:
      | 'PLACE_ABORTED_NO_MUTATION'
      | 'NO_MAKER_FILL_SAFE_TERMINATION'
      | 'PARTIAL_MAKER_FILL_SAFE_TERMINATION'
      | 'FULL_MAKER_FILL_SAFE_TERMINATION'
      | 'AMBIGUOUS_FAIL_CLOSED'
      | 'SAFETY_INVARIANT_VIOLATION';
    knownVenueLimitation: typeof KNOWN_VENUE_CONTRACT_LIMITATION;
    nextPermittedAction: 'NONE' | 'MINIMAL LIVE CANARY EXECUTION V1';
  }>;
  liveExecutionEnabled: false;
}>;

export type decibel_minimal_live_canary_dry_run_result_v1 = Readonly<{
  canaryDryRunReady: boolean;
  minimalLiveCanarySpecReady: true;
  plan: decibel_minimal_live_canary_plan_v1 | null;
  reasons: readonly string[];
  signingAttempted: false;
  venueMutationAttempted: false;
  liveExecutionEnabled: false;
}>;

export function runDecibelMinimalLiveCanaryDryRunV1(
  input: Parameters<typeof planDecibelMinimalLiveCanaryV1>[0],
): decibel_minimal_live_canary_dry_run_result_v1 {
  try {
    return Object.freeze({
      canaryDryRunReady: true,
      minimalLiveCanarySpecReady: true,
      plan: planDecibelMinimalLiveCanaryV1(input),
      reasons: Object.freeze([]),
      signingAttempted: false,
      venueMutationAttempted: false,
      liveExecutionEnabled: false,
    });
  } catch (error) {
    return Object.freeze({
      canaryDryRunReady: false,
      minimalLiveCanarySpecReady: true,
      plan: null,
      reasons: Object.freeze([error instanceof Error ? error.message : 'CANARY_DRY_RUN_FAILED']),
      signingAttempted: false,
      venueMutationAttempted: false,
      liveExecutionEnabled: false,
    });
  }
}

export function authorizeDecibelMinimalLiveCanaryMutationV1(): never {
  throw new Error('LIVE_EXECUTION_DISABLED');
}

export const DecibelMinimalLiveCanarySpecificationAuditV1 = Object.freeze({
  projectIdentity: 'DECIBEL_MARKET_MAKER_V1',
  minimalLiveCanarySpecReady: 'YES',
  minimalLiveCanaryReconciliationReady: 'NO_UNDER_STRICT_PROOF_STANDARD',
  minimalLiveCanaryOperationalRisk: 'BOUNDED_AND_FAIL_CLOSED',
  knownVenueContractLimitation: KNOWN_VENUE_CONTRACT_LIMITATION,
  successfulCancelTxProvesTargetNeutralized: 'UNPROVEN',
  eMarketNotFoundNoPendingExposureProof: 'PROVEN_FOR_FROZEN_CANARY_SCOPE',
  maximumVenueOrdersPerSession: 1,
  maximumConcurrentLiveOrders: 1,
  maximumPlacementTransactions: 1,
  maximumStrategyOrdersAfterFirstSubmission: 0,
  dedicatedCanarySubaccountRequired: true,
  actualFillTruth: 'AUTHENTICATED_USER_TRADE_HISTORY_ONLY',
  preSubmissionDurability: 'PROVEN_DESIGN_REUSED',
  liveExecutionEnabled: false,
  nextStep: 'MINIMAL LIVE CANARY EXECUTION V1',
});
