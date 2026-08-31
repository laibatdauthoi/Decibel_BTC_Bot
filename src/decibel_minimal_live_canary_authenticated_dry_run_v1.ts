import { createHash } from 'node:crypto';

import {
  DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  KNOWN_VENUE_CONTRACT_LIMITATION,
  createDecibelAutoMinimalLiveCanaryConfigurationV1,
  runDecibelMinimalLiveCanaryDryRunV1,
  type decibel_minimal_live_canary_preflight_v1,
} from './decibel_minimal_live_canary_v1.js';

export type decibel_authenticated_dry_run_primary_classification_v1 =
  | 'AUTHENTICATED_DRY_RUN_READY'
  | 'AUTHENTICATED_DRY_RUN_BLOCKED_ACCOUNT'
  | 'AUTHENTICATED_DRY_RUN_BLOCKED_POSITION'
  | 'AUTHENTICATED_DRY_RUN_BLOCKED_ACTIVITY'
  | 'AUTHENTICATED_DRY_RUN_BLOCKED_MARKET'
  | 'AUTHENTICATED_DRY_RUN_BLOCKED_JOURNAL'
  | 'AUTHENTICATED_DRY_RUN_BLOCKED_RISK'
  | 'AUTHENTICATED_DRY_RUN_SAFETY_VIOLATION';

export type decibel_authenticated_dry_run_observation_v1 = Readonly<{
  configuredSubaccount: string | null;
  authenticatedSubaccount: string | null;
  configuredNetwork: string | null;
  observedNetwork: string | null;
  side: 'BUY' | 'SELL' | null;
  metadata: Readonly<{
    marketAddress: string;
    symbol: string;
    tickSize: number;
    lotSize: number;
    minimumSize: number;
    minimumMetadataValidQuantity: number;
    mode: string;
  }> | null;
  book: Readonly<{ bestBid: number; bestAsk: number; observedAt: number }> | null;
  position: Readonly<{
    positionQueryAccount: string;
    positionQueryMarket: string;
    includeDeleted: false;
    returnedOpenPositionCount: number;
    zeroAnchorClassification: 'NO_OPEN_POSITION' | 'OPEN_POSITION' | 'UNAVAILABLE';
  }>;
  activity: Readonly<{
    openOrders: 'AVAILABLE_AND_CLEAR' | 'AVAILABLE_AND_NOT_CLEAR' | 'UNAVAILABLE';
    tpSl: 'AVAILABLE_AND_CLEAR' | 'AVAILABLE_AND_NOT_CLEAR' | 'UNAVAILABLE';
    twap: 'AVAILABLE_AND_CLEAR' | 'AVAILABLE_AND_NOT_CLEAR' | 'UNAVAILABLE';
    bulk: 'AVAILABLE_AND_CLEAR' | 'AVAILABLE_AND_NOT_CLEAR' | 'UNAVAILABLE';
    delegatedOrManual: 'AVAILABLE_AND_CLEAR' | 'AVAILABLE_AND_NOT_CLEAR' | 'UNAVAILABLE';
    openOrderCount: number | null;
    activeTwapCount: number | null;
    activeBulkCount: number | null;
  }>;
  journal: Readonly<{ healthy: boolean; unresolvedEntryCount: number }>;
  canaryNotionalSafetyCapUsd: number;
  evidenceErrors: readonly string[];
}>;

export type DecibelMinimalLiveCanaryAuthenticatedDryRunReportV1 = Readonly<{
  identity: Readonly<{
    dryRunId: string;
    canaryId: string | null;
    executionSessionId: string | null;
    timestamp: number;
    canaryConfigHash: string | null;
  }>;
  account: Readonly<{
    configuredSubaccount: string | null;
    authenticatedSubaccount: string | null;
    subaccountMatch: boolean;
    configuredNetwork: string | null;
    observedNetwork: string | null;
    networkMatch: boolean;
    activity: decibel_authenticated_dry_run_observation_v1['activity'];
  }>;
  market: Readonly<{
    marketAddress: string;
    metadata: decibel_authenticated_dry_run_observation_v1['metadata'];
    book: decibel_authenticated_dry_run_observation_v1['book'];
    spread: number | null;
  }>;
  position: decibel_authenticated_dry_run_observation_v1['position'];
  orderPlan: Readonly<{
    side: 'BUY' | 'SELL' | null;
    price: number | null;
    quantity: number | null;
    notionalUsd: number | null;
    postOnly: true;
    clientOrderId: string | null;
    status: 'WOULD_PLACE' | 'UNAVAILABLE';
  }>;
  journal: decibel_authenticated_dry_run_observation_v1['journal'];
  recovery: Readonly<{
    status: 'WOULD_CANCEL_BY_CLIENT_ID' | 'UNAVAILABLE';
    subaccount: string | null;
    market: string;
    clientOrderId: string | null;
    knownVenueLimitation: typeof KNOWN_VENUE_CONTRACT_LIMITATION;
  }>;
  transactionPrecommit: Readonly<{
    preSubmissionDurability: 'PROVEN';
    preSubmitTransactionHashCapability: 'READY';
  }>;
  safetyCounters: Readonly<{
    signedTransactions: 0;
    submittedTransactions: 0;
    placedOrders: 0;
    cancelledOrders: 0;
    venueMutations: 0;
  }>;
  readiness: Readonly<{
    gates: Readonly<Record<string, boolean>>;
    reasons: readonly string[];
    smallestConcreteBlocker: string | null;
    primaryClassification: decibel_authenticated_dry_run_primary_classification_v1;
    minimalLiveCanarySpecReady: true;
    canaryDryRunReady: boolean;
    minimalLiveCanaryReconciliationReady: 'NO_UNDER_STRICT_PROOF_STANDARD';
    minimalLiveCanaryOperationalRisk: 'BOUNDED_AND_FAIL_CLOSED';
    liveExecutionEnabled: false;
  }>;
}>;

function identifier(prefix: string, timestamp: number, subaccount: string | null): string {
  return `${prefix}-${timestamp}-${createHash('sha256')
    .update(`${timestamp}:${subaccount ?? 'missing'}`)
    .digest('hex')
    .slice(0, 12)}`;
}

function classify(
  reasons: readonly string[],
): decibel_authenticated_dry_run_primary_classification_v1 {
  if (reasons.length === 0) return 'AUTHENTICATED_DRY_RUN_READY';
  const reason = reasons[0] ?? '';
  if (reason.includes('MUTATION')) return 'AUTHENTICATED_DRY_RUN_SAFETY_VIOLATION';
  if (reason.includes('SUBACCOUNT') || reason.includes('NETWORK'))
    return 'AUTHENTICATED_DRY_RUN_BLOCKED_ACCOUNT';
  if (reason.includes('POSITION')) return 'AUTHENTICATED_DRY_RUN_BLOCKED_POSITION';
  if (
    reason.includes('ACTIVITY') ||
    reason.includes('ORDER') ||
    reason.includes('TWAP') ||
    reason.includes('BULK')
  )
    return 'AUTHENTICATED_DRY_RUN_BLOCKED_ACTIVITY';
  if (reason.includes('MARKET') || reason.includes('BOOK') || reason.includes('METADATA'))
    return 'AUTHENTICATED_DRY_RUN_BLOCKED_MARKET';
  if (reason.includes('JOURNAL')) return 'AUTHENTICATED_DRY_RUN_BLOCKED_JOURNAL';
  return 'AUTHENTICATED_DRY_RUN_BLOCKED_RISK';
}

export function buildDecibelMinimalLiveCanaryAuthenticatedDryRunReportV1(
  observation: decibel_authenticated_dry_run_observation_v1,
  timestamp: number,
): DecibelMinimalLiveCanaryAuthenticatedDryRunReportV1 {
  const gates: Record<string, boolean> = {
    authenticatedIntendedSubaccount:
      observation.configuredSubaccount !== null &&
      observation.configuredSubaccount === observation.authenticatedSubaccount,
    networkCorrect:
      observation.configuredNetwork !== null &&
      observation.configuredNetwork === observation.observedNetwork,
    exactMarketValid: observation.metadata?.marketAddress === DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    zeroStartingPosition: observation.position.zeroAnchorClassification === 'NO_OPEN_POSITION',
    noConflictingActivity: ['openOrders', 'tpSl', 'twap', 'bulk'].every(
      (key) =>
        observation.activity[key as keyof typeof observation.activity] !==
        'AVAILABLE_AND_NOT_CLEAR',
    ),
    journalHealthy: observation.journal.healthy && observation.journal.unresolvedEntryCount === 0,
    freshValidBbo:
      observation.book !== null &&
      observation.book.bestBid > 0 &&
      observation.book.bestAsk > observation.book.bestBid,
    minimumQuantityValid:
      observation.metadata !== null &&
      observation.metadata.minimumMetadataValidQuantity >= observation.metadata.minimumSize,
    explicitSide: observation.side !== null,
  };
  const reasons = [...observation.evidenceErrors];
  const gateReasons: Readonly<Record<string, string>> = {
    authenticatedIntendedSubaccount: 'CANARY_SUBACCOUNT_MISMATCH',
    networkCorrect: 'CANARY_NETWORK_MISMATCH',
    exactMarketValid: 'CANARY_MARKET_INVALID',
    zeroStartingPosition: 'CANARY_POSITION_NOT_FLAT',
    noConflictingActivity: 'CANARY_CONFLICTING_ACTIVITY',
    journalHealthy: 'CANARY_JOURNAL_NOT_CLEAR',
    freshValidBbo: 'CANARY_BOOK_INVALID',
    minimumQuantityValid: 'CANARY_MINIMUM_QUANTITY_INVALID',
    explicitSide: 'CANARY_SIDE_EXPLICIT_REQUIRED',
  };
  for (const [gate, passed] of Object.entries(gates))
    if (!passed) reasons.push(gateReasons[gate] ?? `CANARY_GATE_FAILED:${gate}`);
  let configuration = null;
  let plan = null;
  let notional = null;
  if (
    reasons.length === 0 &&
    observation.side !== null &&
    observation.metadata !== null &&
    observation.book !== null &&
    observation.configuredSubaccount !== null &&
    observation.configuredNetwork !== null
  ) {
    const canaryId = identifier('canary', timestamp, observation.configuredSubaccount);
    const executionSessionId = identifier('session', timestamp, observation.configuredSubaccount);
    configuration = createDecibelAutoMinimalLiveCanaryConfigurationV1({
      canaryId,
      executionSessionId,
      account: observation.configuredSubaccount,
      subaccount: observation.configuredSubaccount,
      network: observation.configuredNetwork,
      market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      observationTimeoutMs: 60_000,
      executionRecoveryTimeoutMs: 120_000,
      strategyConfigId: 'DECIBEL_MARKET_MAKER_V1_MINIMAL_LIVE_CANARY_V1',
    });
    const preflight: decibel_minimal_live_canary_preflight_v1 = {
      authenticatedAccount: observation.authenticatedSubaccount ?? '',
      configuredNetwork: observation.configuredNetwork,
      observedNetwork: observation.observedNetwork ?? '',
      market: observation.metadata.marketAddress,
      metadataFresh: true,
      marketOperational: observation.metadata.mode === 'Open',
      tickSize: observation.metadata.tickSize,
      lotSize: observation.metadata.lotSize,
      minimumOrderSize: observation.metadata.minimumSize,
      minimumMetadataValidQuantity: observation.metadata.minimumMetadataValidQuantity,
      bestBid: observation.book.bestBid,
      bestAsk: observation.book.bestAsk,
      exactMarketIdentity: true,
      authoritativeNoOpenPosition: true,
      dedicatedSubaccount: true,
      unresolvedExecutionJournalCount: observation.journal.unresolvedEntryCount,
      unexpectedOpenStrategyActivityCount: observation.activity.openOrderCount ?? 0,
      activeTpSlCount: observation.activity.tpSl === 'AVAILABLE_AND_NOT_CLEAR' ? 1 : 0,
      activeTwapCount: observation.activity.activeTwapCount ?? 0,
      activeBulkOrderCount: observation.activity.activeBulkCount ?? 0,
      expectedDelegatedOrManualActivity: false,
      journalHealthy: observation.journal.healthy,
    };
    const dryRun = runDecibelMinimalLiveCanaryDryRunV1({
      configuration,
      persistedConfigHash: null,
      preflight,
      placementTransactionCount: 0,
      venueOrderCount: 0,
    });
    if (!dryRun.canaryDryRunReady || dryRun.plan === null) reasons.push(...dryRun.reasons);
    else {
      plan = dryRun.plan;
      notional = plan.price * plan.quantity;
      if (notional > observation.canaryNotionalSafetyCapUsd)
        reasons.push('CANARY_NOTIONAL_SAFETY_CAP_EXCEEDED');
    }
  }
  const ready = reasons.length === 0 && plan !== null;
  const primaryClassification = classify(reasons);
  return Object.freeze({
    identity: Object.freeze({
      dryRunId: identifier('dry-run', timestamp, observation.configuredSubaccount),
      canaryId: configuration?.canaryId ?? null,
      executionSessionId: configuration?.executionSessionId ?? null,
      timestamp,
      canaryConfigHash: configuration?.configHash ?? null,
    }),
    account: Object.freeze({
      configuredSubaccount: observation.configuredSubaccount,
      authenticatedSubaccount: observation.authenticatedSubaccount,
      subaccountMatch: gates.authenticatedIntendedSubaccount ?? false,
      configuredNetwork: observation.configuredNetwork,
      observedNetwork: observation.observedNetwork,
      networkMatch: gates.networkCorrect ?? false,
      activity: observation.activity,
    }),
    market: Object.freeze({
      marketAddress: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      metadata: observation.metadata,
      book: observation.book,
      spread:
        observation.book === null ? null : observation.book.bestAsk - observation.book.bestBid,
    }),
    position: observation.position,
    orderPlan: Object.freeze({
      side: observation.side,
      price: plan?.price ?? null,
      quantity: plan?.quantity ?? null,
      notionalUsd: notional,
      postOnly: true,
      clientOrderId: plan?.clientOrderId ?? null,
      status: plan === null ? 'UNAVAILABLE' : 'WOULD_PLACE',
    }),
    journal: observation.journal,
    recovery: Object.freeze({
      status: plan === null ? 'UNAVAILABLE' : 'WOULD_CANCEL_BY_CLIENT_ID',
      subaccount: observation.configuredSubaccount,
      market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      clientOrderId: plan?.clientOrderId ?? null,
      knownVenueLimitation: KNOWN_VENUE_CONTRACT_LIMITATION,
    }),
    transactionPrecommit: Object.freeze({
      preSubmissionDurability: 'PROVEN',
      preSubmitTransactionHashCapability: 'READY',
    }),
    safetyCounters: Object.freeze({
      signedTransactions: 0,
      submittedTransactions: 0,
      placedOrders: 0,
      cancelledOrders: 0,
      venueMutations: 0,
    }),
    readiness: Object.freeze({
      gates: Object.freeze(gates),
      reasons: Object.freeze(reasons),
      smallestConcreteBlocker: reasons[0] ?? null,
      primaryClassification: ready ? 'AUTHENTICATED_DRY_RUN_READY' : primaryClassification,
      minimalLiveCanarySpecReady: true,
      canaryDryRunReady: ready,
      minimalLiveCanaryReconciliationReady: 'NO_UNDER_STRICT_PROOF_STANDARD',
      minimalLiveCanaryOperationalRisk: 'BOUNDED_AND_FAIL_CLOSED',
      liveExecutionEnabled: false,
    }),
  });
}
