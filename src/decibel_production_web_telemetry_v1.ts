import {
  combineDecibelLifetimeTotalsV1,
  type decibel_overview_lifetime_totals_v1,
} from './decibel_lifetime_totals_v1.js';
import { calculateDecibelOverviewUTCVolumeV1 } from './decibel_overview_metrics_v1.js';
import { DECIBEL_PRODUCTION_SESSION_HEARTBEAT_STALE_MS_V1 } from './decibel_production_session_v1.js';
import { deriveDecibelPositionSafetyStatusV1 } from './decibel_position_safety_status_v1.js';
import {
  evaluateTradingDecision,
  type trading_decision_v1,
} from './decibel_trading_decision_v1.js';
import { getDecibelExecutionFillKeyV1 } from './decibel_session_accounting_v1.js';
/** Ledger version must come from authenticated trade data, never a timestamp. */
export function requireDecibelFillTransactionVersionV1(version: string | undefined): string {
  if (version === undefined || !/^[1-9][0-9]*$/.test(version))
    throw new Error('PRODUCTION_RECONCILIATION_FILL_TRANSACTION_VERSION_REQUIRED');
  return version;
}
import { existsSync } from 'node:fs';

import Database from 'better-sqlite3';

import { calculateDecibelRealizedPnlWindowsV1 } from './decibel_pnl_tracker_v1.js';
import { resolveDecibelAuthoritativeOrderEvidenceV1 } from './decibel_authoritative_order_reconciliation_v1.js';
import { evaluateDecibelAuthenticatedPassiveRecyclingV1 } from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import type { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import type {
  DecibelProductionLiveStateSourceV1,
  decibel_production_live_configuration_v1,
  decibel_production_live_snapshot_v1,
} from './decibel_production_live_orchestrator_v1.js';

export const DECIBEL_PRODUCTION_WEB_TELEMETRY_V1 = 'DECIBEL_PRODUCTION_WEB_TELEMETRY_V1' as const;
export const DECIBEL_PRODUCTION_WEB_HISTORY_LIMIT_V1 = 100;

type nullable_number = number | null;

export type decibel_bot_scoped_pnl_v1 = Readonly<{
  valueUsd: nullable_number;
  realizedUsd: nullable_number;
  unrealizedUsd: nullable_number;
  feesUsd: nullable_number;
  gasUsd: nullable_number;
  complete: boolean;
  scope: 'BOT_SESSION' | 'BOT_ONLY';
}>;

export type decibel_production_web_intent_v1 = Readonly<{
  timestamp: number;
  intentId: string;
  action: 'PLACE' | 'CANCEL' | 'UNKNOWN';
  side: 'BUY' | 'SELL' | 'UNKNOWN';
  price: nullable_number;
  quantity: nullable_number;
  status: string;
  venueOrderId: string | null;
  transactionHash: string | null;
  blocker: string | null;
  reconciliationResult: string | null;
}>;

export type decibel_production_web_event_v1 = Readonly<{
  timestamp: number;
  severity: 'INFO' | 'WARN' | 'ERROR';
  category: 'MARKET' | 'STRATEGY' | 'EXECUTION' | 'FILL' | 'RECONCILIATION' | 'RISK' | 'ERROR';
  eventType: string;
  description: string;
}>;

export type decibel_production_web_telemetry_v1 = Readonly<{
  version: typeof DECIBEL_PRODUCTION_WEB_TELEMETRY_V1;
  overviewEvidence?: Readonly<{
    sessionId: string | null;
    capitalUsd: number | null;
    maxLossUsd: number | null;
    sessionPnlUsd: number | null;
    makerVolumeUsd: number | null;
    takerVolumeUsd: number | null;
    totalExecutedVolumeUsd: number | null;
  }>;
  overviewHistory?: Readonly<{
    totalSessionsExecuted: number | null;
    utcDayStart: number;
    volumeSinceUTCStartUsd: number | null;
    /** Lifetime totals: archived + closed sessions + the live session in real time. */
    lifetimeVolumeUsd?: number | null;
    allTimeNetPnlUsd?: number | null;
    allTimeGrossPnlUsd?: number | null;
    allTimeIncompletePnlCount?: number | null;
  }>;
  generatedAt: number;
  degraded: boolean;
  lastSuccessfulCycleAt: number | null;
  runtime: Readonly<{
    state: string;
    network: string;
    market: 'BTC/USD';
    releaseStage: string;
    dryRun: boolean;
    connected: boolean;
    buildId: string;
    processStart: number;
    sourceBuildTimestamp: number;
    restartRequired: boolean;
    authenticatedStateAgeMs: nullable_number;
    journalStatus: 'READY' | 'UNAVAILABLE';
    uptimeMs: number;
    executionLoopRunning: boolean;
    executionLoopHealthy?: boolean;
    positionSafety: ReturnType<typeof deriveDecibelPositionSafetyStatusV1>;
    executionSessionId: string | null;
    executionCycles: number;
    lastExecutionAction: string | null;
    executionBlocker: string | null;
    strategyState: string | null;
    tradingDecision: trading_decision_v1;
    bidEligible: boolean | null;
    askEligible: boolean | null;
    whyNoAction: string | null;
    lastCycleAgeMs: nullable_number;
    lastMutation: string | null;
    lifecycleBlocker: string | null;
    rateLimitBackoff: boolean;
    authenticatedReadError: string | null;
    lastError: string | null;
    readiness: Readonly<{
      processReady: boolean;
      accountReady: boolean;
      marketReady: boolean;
      executionSafe: boolean;
      economicReady: boolean;
      blockingComponent: 'PROCESS' | 'ACCOUNT' | 'MARKET' | 'EXECUTION' | 'ECONOMIC' | null;
      blockingReason: string | null;
    }>;
    dependencies: Readonly<{
      economic: 'INIT' | 'READY' | 'BLOCKED' | 'FAILED';
      recovery: 'INIT' | 'READY' | 'BLOCKED' | 'FAILED';
      authenticatedState: 'INIT' | 'READY' | 'BLOCKED' | 'FAILED';
    }>;
  }>;
  market: Readonly<{
    state: 'READY' | 'BLOCKED' | 'INIT' | 'FAILED' | 'STOPPED';
    bestBid: nullable_number;
    bestAsk: nullable_number;
    spread: nullable_number;
    midpoint: nullable_number;
    fairPrice: nullable_number;
    tickSize: nullable_number;
    lotSize: nullable_number;
    bookAgeMs: nullable_number;
    volatilityMultiplier: nullable_number;
    wsConnectionState: 'INIT' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'STALLED' | 'UNKNOWN';
    wsSubscriptionState: 'UNSUBSCRIBED' | 'SUBSCRIBING' | 'SUBSCRIBED' | 'UNKNOWN';
    lastWsMessageAgeMs: nullable_number;
    lastValidBboAgeMs: nullable_number;
    wsReconnectCount: number;
    wsLastDisconnectReason: string | null;
    marketDataGeneration: number;
    supervisorBboTimestamp: nullable_number;
    telemetryBboTimestamp: nullable_number;
    executionBboTimestamp: nullable_number;
    executionSnapshotGeneration: nullable_number;
    marketDataBlockerSource: string | null;
  }>;
  account: Readonly<{
    configuredSubaccount: string | null;
    authenticatedSubaccount: string | null;
    subaccountMatches: boolean | null;
    collateralUsd: nullable_number;
    availableMarginUsd: nullable_number;
    availableMarginReason: string | null;
    marginUsedUsd: nullable_number;
    marginUsedReason: string | null;
    effectiveLeverage: nullable_number;
    capacityProduction: unknown;
    capacityDiagnostics: unknown;
    capacityBlocker: string | null;
    exposureLimits:
      | NonNullable<decibel_production_live_snapshot_v1['sessionConfiguration']>['exposureLimits']
      | null;
  }>;
  inventory: Readonly<{
    positionBase: nullable_number;
    direction: 'LONG' | 'SHORT' | 'FLAT' | 'UNKNOWN';
    state: 'UNKNOWN' | 'FLAT' | 'TRADEABLE_POSITION' | 'UNTRADEABLE_DUST';
    exactPositionBase: nullable_number;
    marketMinimumSize: nullable_number;
    positionNotionalUsd: nullable_number;
    utilization: nullable_number;
    maximumPositionBase: nullable_number;
    remainingCapacityBase: nullable_number;
  }>;
  positions: readonly Readonly<{
    market: string;
    side: 'LONG' | 'SHORT';
    size: number;
    entryPrice: nullable_number;
    markPrice: nullable_number;
    unrealizedPnlUsd: nullable_number;
    source: 'BOT' | 'EXTERNAL' | 'UNKNOWN';
  }>[];
  ladder: readonly Readonly<{
    levelId: string;
    side: 'BUY' | 'SELL';
    desiredPrice: number;
    desiredQuantity: number;
    notionalUsd: number;
    activeVenueOrderId: string | null;
    clientOrderId: string;
    ageMs: nullable_number;
    lifecycleStatus: string;
    distanceTicks: number;
    skewStatus: string;
  }>[];
  orders: readonly Readonly<{
    venueOrderId: string;
    clientOrderId: string;
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    reduceOnly: boolean | null;
    postOnly: true;
  }>[];
  pnl: Readonly<{
    realized24hUsd: nullable_number;
    realized7dUsd: nullable_number;
    realized30dUsd: nullable_number;
    unrealizedUsd: nullable_number;
    totalFeesUsd: nullable_number;
    makerFeesUsd: nullable_number;
    transactionGasApt: nullable_number;
    netPnlAfterKnownCostsUsd: nullable_number;
    sessionPnl: decibel_bot_scoped_pnl_v1;
    allTimePnl: decibel_bot_scoped_pnl_v1;
  }>;
  quoteSizing: NonNullable<decibel_production_live_snapshot_v1['quoteSizing']> | null;
  volume: Readonly<{
    targetMakerVolumeUsd: nullable_number;
    authenticatedMakerVolumeUsd: nullable_number;
    completionRatio: nullable_number;
    completedRecycleCycles: nullable_number;
    currentCycleInventoryBase: nullable_number;
    makerFillCount: nullable_number;
    sessionMakerVolumeUsd: nullable_number;
    sessionTakerVolumeUsd: nullable_number;
    totalExecutedVolumeUsd: nullable_number;
    remainingToTargetUsd: nullable_number;
    targetSemanticsVersion: 1 | 2;
  }>;
  risk: Readonly<{
    maximumPositionBase: nullable_number;
    maximumNotionalUsd: nullable_number;
    maximumDrawdownUsd: nullable_number;
    effectiveLeverage: nullable_number;
    exposureLimits:
      | NonNullable<decibel_production_live_snapshot_v1['sessionConfiguration']>['exposureLimits']
      | null;
    minimumOrderNotionalUsd: nullable_number;
    placeRemaining: number;
    cancelRemaining: number;
    totalRemaining: number;
    nextBudgetReplenishmentAt: number | null;
  }>;
  blockers: readonly Readonly<{
    code: string;
    meaning: string;
    firstObservedAt: number;
    lastObservedAt: number;
    intentId: string | null;
  }>[];
  intents: readonly decibel_production_web_intent_v1[];
  fills: readonly Readonly<{
    timestamp: number;
    fillId: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    maker: boolean;
    intentId: string | null;
  }>[];
  events: readonly decibel_production_web_event_v1[];
}>;

export type decibel_production_web_history_v1 = Readonly<{
  journalAvailable: boolean;
  intents: readonly decibel_production_web_intent_v1[];
  fills: decibel_production_web_telemetry_v1['fills'];
  blockers: decibel_production_web_telemetry_v1['blockers'];
  events: readonly decibel_production_web_event_v1[];
  mutationAttempts: Readonly<{
    place: number;
    cancel: number;
    total: number;
    oldestAt: number | null;
  }>;
  accountingFills: readonly Readonly<{
    fillId: string;
    sessionId: string | null;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    maker: boolean;
    observedAt: number;
  }>[];
}>;

const blockerMeanings: Readonly<Record<string, string>> = Object.freeze({
  EXECUTION_STATE_CHANGED_BEFORE_INTENT: 'Authenticated state changed before mutation.',
  RECONCILE_ONLY: 'A prior intent requires authoritative reconciliation.',
  STRATEGY_ACTIVITY_EXCLUSIVITY_LOST: 'Unmanaged BTC/USD activity prevents exclusive control.',
  PRODUCTION_AUTHENTICATED_READ_REQUIRED: 'Required authenticated account evidence is unavailable.',
  PRODUCTION_DECIBEL_HTTP_RATE_LIMITED:
    'Decibel HTTP API rate limit reached. Authenticated reads are paused for bounded backoff.',
  EXECUTION_MUTATION_BUDGET_BLOCKED: 'Rolling mutation capacity is depleted.',
  PRODUCTION_RECONCILIATION_CONFIRMATION_PENDING: 'Waiting for authenticated intent confirmation.',
  PRODUCTION_RECONCILIATION_PENDING_ACKNOWLEDGED_ORDER:
    'Acknowledged order is waiting for authoritative venue reconciliation.',
  PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK:
    'Acknowledged order is awaiting authoritative venue evidence. Automatic reconciliation will retry; missing evidence keeps the order unresolved.',
});

export function reconcileDecibelAcknowledgedTerminalOrdersV1(
  Journal: decibel_execution_lifecycle_journal_v1,
  snapshot: decibel_production_live_snapshot_v1,
): readonly string[] {
  const reconciledIntentIds: string[] = [];
  const activeConflict = Journal.getActiveIdentityConflict();
  const conflictedIntent = activeConflict === null ? null : Journal.get(activeConflict.intentId);
  const terminalLineage = Journal.getOrderLineageByVenueOrderIds(
    (snapshot.terminalOrderEvidence ?? [])
      .filter((terminal) => terminal.state === 'CANCELLED' && terminal.remainingQuantity === 0)
      .map((terminal) => terminal.venueOrderId),
  );
  const lineageByOrder = new Map<string, (typeof terminalLineage)[number][]>();
  for (const row of terminalLineage) {
    const lineage = lineageByOrder.get(row.venueOrderId) ?? [];
    lineage.push(row);
    lineageByOrder.set(row.venueOrderId, lineage);
  }
  const rows = [
    ...Journal.nonTerminal(),
    ...(conflictedIntent === null ? [] : [conflictedIntent]),
    ...terminalLineage,
  ];
  const seen = new Set<string>();
  for (const intent of rows) {
    if (seen.has(intent.intentId)) continue;
    seen.add(intent.intentId);
    if (Journal.get(intent.intentId)?.status !== intent.status) continue;
    if (intent.venueOrderId === null) continue;
    const intentBody = Journal.getIntent(intent.intentId);
    const terminal = snapshot.terminalOrderEvidence?.find(
      (order) =>
        order.venueOrderId === intent.venueOrderId ||
        (intentBody !== null && order.clientOrderId === intentBody.clientOrderId),
    );
    if (
      terminal === undefined ||
      terminal.remainingQuantity === null ||
      terminal.remainingQuantity > Number.EPSILON
    )
      continue;
    // Preserve the venue's observed identity before projecting cancellation
    // evidence onto local PLACE/CANCEL lineage. Never mask a contradictory ID.
    if (
      terminal.clientOrderId != null &&
      intentBody?.action === 'PLACE' &&
      terminal.clientOrderId !== intentBody.clientOrderId
    ) {
      const formatDiagnosticValue = (value: string) =>
        value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 128);
      throw new Error(
        `EXECUTION_AUTHORITATIVE_RECONCILIATION_CONFLICT:INVARIANT=ORDER_IDENTITY_MISMATCH:INTENT=${formatDiagnosticValue(intent.intentId)}:VENUE_ORDER=${formatDiagnosticValue(terminal.venueOrderId)}:LOCAL_CLIENT=${formatDiagnosticValue(intentBody.clientOrderId)}:OBSERVED_CLIENT=${formatDiagnosticValue(terminal.clientOrderId)}`,
      );
    }
    const coexistingOpen = snapshot.input.openOrders.some(
      (order) =>
        order.venueOrderId === terminal.venueOrderId ||
        (terminal.clientOrderId !== undefined &&
          terminal.clientOrderId !== null &&
          order.clientOrderId === terminal.clientOrderId),
    );
    const terminalProvenance = Journal.getLatestReconciliationProvenance(intent.intentId);
    const pending = intent.status === 'ACKNOWLEDGED' || intent.status === 'RECONCILING';
    const resolvingExactConflict = activeConflict?.intentId === intent.intentId;
    if (
      resolvingExactConflict &&
      (terminal.venueOrderId !== intent.venueOrderId ||
        intentBody === null ||
        terminal.clientOrderId !== intentBody.clientOrderId)
    )
      continue;
    // Durable conflicts require the exact authenticated fill query below; the
    // account snapshot does not carry fill provenance for the journal boundary.
    if (resolvingExactConflict) continue;
    if (coexistingOpen) continue;
    const staleTerminalProvenance =
      terminal.state === 'CANCELLED' &&
      (intent.status === 'CANCELLED_EXTERNALLY' || intent.status === 'EXTERNALLY_NEUTRALIZED') &&
      terminalProvenance?.venueStatus !== 'CANCELLED';
    if (!pending && !staleTerminalProvenance && !resolvingExactConflict) continue;
    const matchingFilledQuantity = snapshot.input.actualFillLedger.fills
      .filter((fill) => fill.venueOrderId === intent.venueOrderId)
      .reduce((sum, fill) => sum + fill.executedBaseQuantity, 0);
    const reconciliationState =
      terminal.state === 'FILLED'
        ? 'FULL_FILL'
        : matchingFilledQuantity > Number.EPSILON
          ? 'EXTERNALLY_NEUTRALIZED'
          : 'CANCELLED_EXTERNALLY';
    const matchedIdentifier =
      terminal.venueOrderId === intent.venueOrderId
        ? `venueOrderId:${terminal.venueOrderId}`
        : `clientOrderId:${terminal.clientOrderId ?? ''}`;
    const reconciliation = {
      intentId: intent.intentId,
      reconciliationState,
      terminalStatus:
        reconciliationState === 'FULL_FILL' ? ('APPLIED' as const) : reconciliationState,
      source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
      matchedIdentifier,
      venueStatus: terminal.state,
      remainingQuantity: terminal.remainingQuantity,
      transactionHash: Journal.getSubmissionTelemetry(intent.intentId)?.transactionHash ?? null,
      venueOrderId: terminal.venueOrderId,
      clientOrderId: terminal.clientOrderId ?? intentBody?.clientOrderId ?? null,
      observedAt: snapshot.input.now,
      decision: {
        reason: coexistingOpen
          ? 'STALE_OPEN_IGNORED'
          : terminal.state === 'FILLED'
            ? 'TERMINAL_FILL_CONFIRMED'
            : 'TERMINAL_CANCEL_CONFIRMED',
        evidenceAgeMs: 0,
        nextAction: 'APPLY' as const,
      },
    };
    const lineage =
      terminal.state === 'CANCELLED'
        ? (lineageByOrder.get(terminal.venueOrderId) ?? []).filter((candidate) => {
            if (candidate.status === 'ACKNOWLEDGED' || candidate.status === 'RECONCILING')
              return true;
            const provenance = Journal.getLatestReconciliationProvenance(candidate.intentId);
            return (
              (candidate.status === 'CANCELLED_EXTERNALLY' ||
                candidate.status === 'EXTERNALLY_NEUTRALIZED') &&
              provenance?.venueStatus !== 'CANCELLED'
            );
          })
        : [intent];
    const reconciliations = lineage.map((candidate) => {
      const body = Journal.getIntent(candidate.intentId);
      const filledQuantity = snapshot.input.actualFillLedger.fills
        .filter((fill) => fill.venueOrderId === terminal.venueOrderId)
        .reduce((sum, fill) => sum + fill.executedBaseQuantity, 0);
      const state =
        candidate.intentId === intent.intentId
          ? reconciliationState
          : filledQuantity > Number.EPSILON
            ? ('EXTERNALLY_NEUTRALIZED' as const)
            : ('CANCELLED_EXTERNALLY' as const);
      return {
        ...reconciliation,
        intentId: candidate.intentId,
        reconciliationState: state,
        terminalStatus: state === 'FULL_FILL' ? ('APPLIED' as const) : state,
        transactionHash:
          Journal.getSubmissionTelemetry(candidate.intentId)?.transactionHash ?? null,
        clientOrderId: body?.clientOrderId ?? null,
      };
    });
    Journal.applyAuthoritativeReconciliationBatch(reconciliations);
    reconciledIntentIds.push(...lineage.map((candidate) => candidate.intentId));
  }
  return Object.freeze(reconciledIntentIds);
}

export async function reconcileAllDecibelAcknowledgedOrdersV1(
  Journal: decibel_execution_lifecycle_journal_v1,
  Source: DecibelProductionLiveStateSourceV1,
  snapshot: decibel_production_live_snapshot_v1,
): Promise<Readonly<{ reconciled: readonly string[]; unresolvable: readonly string[] }>> {
  const reconciled: string[] = [];
  const unresolvable: string[] = [];
  let transientFailure: unknown = null;
  for (const row of Journal.nonTerminal()) {
    if (
      row.status !== 'ACKNOWLEDGED' &&
      row.status !== 'RECONCILING' &&
      row.status !== 'UNRESOLVABLE_ACK'
    )
      continue;
    const intent = Journal.getIntent(row.intentId);
    if (intent === null) continue;
    const telemetry = Journal.getSubmissionTelemetry(row.intentId);
    try {
      // A cancellation records the residual at dispatch. Historical order identity
      // and the fill-query boundary belong to the original PLACE, including when
      // that PLACE has already reached a terminal journal state.
      const owners =
        intent.action === 'CANCEL'
          ? Journal.getOrderLineageByVenueOrderId(intent.expectedPreviousVenueOrderId)
              .map((candidate) => Journal.getIntent(candidate.intentId))
              .filter((candidate) => candidate?.action === 'PLACE')
          : [intent];
      const owner = owners[0];
      if (
        owners.length > 1 ||
        (intent.action === 'CANCEL' && row.venueOrderId !== intent.expectedPreviousVenueOrderId) ||
        (owner &&
          (owner.clientOrderId !== intent.clientOrderId ||
            owner.market !== intent.market ||
            owner.side !== intent.side ||
            intent.quantity > owner.quantity + 1e-12))
      )
        throw new Error('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT');
      if (!owner) throw new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
      const freshIdentityEvidence =
        row.venueOrderId !== null && Source.readOrderIdentityEvidence !== undefined
          ? await Source.readOrderIdentityEvidence({
              venueOrderId: row.venueOrderId,
              clientOrderId: intent.clientOrderId,
              createdAt: owner.createdAt,
              transactionHash: telemetry?.transactionHash ?? null,
            })
          : null;
      const direct =
        freshIdentityEvidence === null || row.venueOrderId === null
          ? null
          : resolveDecibelAuthoritativeOrderEvidenceV1({
              identity: {
                market: intent.market,
                venueOrderId: row.venueOrderId,
                clientOrderId: intent.clientOrderId,
                intentId: intent.intentId,
                side: intent.side,
                originalQuantity: owner.quantity,
              },
              observations: freshIdentityEvidence.terminalOrders.map((order) => ({
                source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' as const,
                sourceTimestamp: null,
                observedAt: freshIdentityEvidence.observedAt,
                market: intent.market,
                venueOrderId: order.venueOrderId,
                clientOrderId: order.clientOrderId,
                side: order.side ?? null,
                originalQuantity: order.originalQuantity,
                remainingQuantity: order.remainingQuantity,
                terminalStatus: order.state,
              })),
              fills: freshIdentityEvidence.fills.map((fill) => ({
                source: 'AUTHENTICATED_OWN_FILL_STREAM' as const,
                observedAt: freshIdentityEvidence.observedAt,
                venueTimestamp: fill.transactionTimestamp,
                market: intent.market,
                venueOrderId: row.venueOrderId!,
                clientOrderId: intent.clientOrderId,
                fillId: fill.venueFillId,
                quantity: fill.quantity,
                price: fill.price,
              })),
            });
      if (direct?.state === 'CONFLICT')
        throw new Error('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT');
      if (direct?.state === 'CANCELLED' && direct.remainingQuantity !== 0)
        throw new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
      // Consume the exact authenticated lookup already performed above. A second
      // history lookup may still be indexing and must not discard terminal proof.
      const state =
        direct?.state === 'FULL_FILL'
          ? 'FULL_FILL'
          : direct?.state === 'CANCELLED'
            ? intent.action !== 'CANCEL' && direct.cumulativeFilledQuantity > Number.EPSILON
              ? 'EXTERNALLY_NEUTRALIZED'
              : 'CANCELLED_EXTERNALLY'
            : await Source.reconcileIntent(row.intentId, snapshot, row.venueOrderId, {
                clientOrderId: intent.clientOrderId,
                createdAt: owner.createdAt,
                transactionHash: telemetry?.transactionHash ?? null,
                requestedQuantity: owner.quantity,
                side: intent.side,
              });
      const terminalStatus =
        state === 'ORDER_OPEN' || state === 'PARTIAL_FILL'
          ? 'ACKNOWLEDGED'
          : state === 'CANCELLED_EXTERNALLY'
            ? 'CANCELLED_EXTERNALLY'
            : state === 'EXTERNALLY_NEUTRALIZED' ||
                state === 'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED'
              ? 'EXTERNALLY_NEUTRALIZED'
              : 'APPLIED';
      const terminal = snapshot.terminalOrderEvidence?.find(
        (candidate) =>
          candidate.venueOrderId === row.venueOrderId ||
          candidate.clientOrderId === intent.clientOrderId,
      );
      const open = snapshot.input.openOrders.find(
        (candidate) =>
          candidate.venueOrderId === row.venueOrderId ||
          candidate.clientOrderId === intent.clientOrderId,
      );
      const freshTerminal = freshIdentityEvidence?.terminalOrders.find(
        (candidate) =>
          candidate.venueOrderId === row.venueOrderId &&
          candidate.clientOrderId === intent.clientOrderId &&
          candidate.remainingQuantity !== null &&
          candidate.remainingQuantity <= Number.EPSILON,
      );
      if (
        freshTerminal?.originalQuantity !== null &&
        freshTerminal?.originalQuantity !== undefined &&
        Math.abs(freshTerminal.originalQuantity - owner.quantity) > 1e-12
      )
        throw new Error('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT');
      const reconciliation: Parameters<typeof Journal.applyAuthoritativeReconciliation>[0] = {
        intentId: row.intentId,
        reconciliationState: state,
        terminalStatus,
        source:
          freshTerminal !== undefined || terminal !== undefined
            ? 'AUTHENTICATED_TERMINAL_ORDER_HISTORY'
            : open !== undefined
              ? 'AUTHENTICATED_OPEN_ORDERS'
              : 'AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION',
        matchedIdentifier:
          row.venueOrderId !== null
            ? `venueOrderId:${row.venueOrderId}`
            : `clientOrderId:${intent.clientOrderId}`,
        venueStatus:
          state === 'FULL_FILL'
            ? 'FILLED'
            : (freshTerminal?.state ?? terminal?.state ?? (open === undefined ? state : 'OPEN')),
        remainingQuantity:
          state === 'FULL_FILL'
            ? 0
            : (freshTerminal?.remainingQuantity ??
              terminal?.remainingQuantity ??
              open?.quantity ??
              null),
        transactionHash: telemetry?.transactionHash ?? null,
        venueOrderId:
          freshTerminal?.venueOrderId ??
          terminal?.venueOrderId ??
          open?.venueOrderId ??
          row.venueOrderId,
        clientOrderId:
          freshTerminal?.clientOrderId ??
          terminal?.clientOrderId ??
          open?.clientOrderId ??
          intent.clientOrderId,
        observedAt: freshIdentityEvidence?.observedAt ?? snapshot.input.now,
        fills: (freshIdentityEvidence?.fills ?? [])
          .filter((fill) => fill.quantity > 0)
          .map((fill) => ({
            fillId: fill.venueFillId,
            quantity: fill.quantity,
            price: fill.price,
            transactionVersion: requireDecibelFillTransactionVersionV1(fill.transactionVersion),
            transactionTimestamp: fill.transactionTimestamp,
          })),
      };
      if (intent.action === 'CANCEL' && freshIdentityEvidence !== null) {
        // Executions belong to PLACE, never to its later residual CANCEL. Keep
        // the global fill identity stable and persist both outcomes atomically.
        Journal.applyAuthoritativeReconciliationBatch([
          {
            ...reconciliation,
            intentId: owner.intentId,
            transactionHash:
              Journal.getLatestReconciliationProvenance(owner.intentId)?.transactionHash ??
              Journal.getSubmissionTelemetry(owner.intentId)?.transactionHash ??
              null,
          },
          { ...reconciliation, fills: [] },
        ]);
      } else Journal.applyAuthoritativeReconciliation(reconciliation);
      reconciled.push(row.intentId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK'
      ) {
        Journal.markUnresolvableAcknowledgement(row.intentId, snapshot.input.now);
        unresolvable.push(row.intentId);
        continue;
      }
      transientFailure ??= error;
    }
  }
  if (transientFailure !== null)
    throw transientFailure instanceof Error
      ? transientFailure
      : new Error('PRODUCTION_ACK_RECONCILIATION_FAILED');
  return Object.freeze({
    reconciled: Object.freeze(reconciled),
    unresolvable: Object.freeze(unresolvable),
  });
}

export async function reconcileDecibelActiveIdentityConflictV1(
  Journal: decibel_execution_lifecycle_journal_v1,
  Source: DecibelProductionLiveStateSourceV1,
): Promise<Readonly<{ reconciled: string | null; blocker: string | null }>> {
  const conflict = Journal.getActiveIdentityConflict();
  if (conflict === null) return Object.freeze({ reconciled: null, blocker: null });
  const persisted = Journal.get(conflict.intentId);
  const intent = Journal.getIntent(conflict.intentId);
  if (
    persisted === null ||
    intent === null ||
    persisted.venueOrderId === null ||
    Source.readOrderIdentityEvidence === undefined
  )
    return Object.freeze({ reconciled: null, blocker: conflict.blocker });
  const venueOrderId = persisted.venueOrderId;
  const submission = Journal.getSubmissionTelemetry(conflict.intentId);
  const prior = Journal.getLatestReconciliationProvenance(conflict.intentId);
  const transactionHash = submission?.transactionHash ?? prior?.transactionHash ?? null;
  const evidence = await Source.readOrderIdentityEvidence({
    venueOrderId,
    clientOrderId: intent.clientOrderId,
    createdAt: intent.createdAt,
    transactionHash,
  });
  if (evidence.transactionState !== 'COMMITTED' || transactionHash === null)
    return Object.freeze({ reconciled: null, blocker: conflict.blocker });
  const observations = evidence.terminalOrders.map((order) => ({
    source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' as const,
    sourceTimestamp: null,
    observedAt: evidence.observedAt,
    market: intent.market,
    venueOrderId: order.venueOrderId,
    clientOrderId: order.clientOrderId,
    side: order.side ?? intent.side,
    originalQuantity: order.originalQuantity,
    remainingQuantity: order.remainingQuantity,
    terminalStatus: order.state,
  }));
  const resolution = resolveDecibelAuthoritativeOrderEvidenceV1({
    identity: {
      market: intent.market,
      venueOrderId,
      clientOrderId: intent.clientOrderId,
      intentId: conflict.intentId,
      side: intent.side,
      originalQuantity: intent.quantity,
    },
    observations,
    fills: evidence.fills.map((fill) => ({
      source: 'AUTHENTICATED_OWN_FILL_STREAM' as const,
      observedAt: evidence.observedAt,
      venueTimestamp: fill.transactionTimestamp,
      market: intent.market,
      venueOrderId,
      clientOrderId: intent.clientOrderId,
      fillId: fill.venueFillId,
      quantity: fill.quantity,
      price: fill.price,
    })),
  });
  const exactTerminal = evidence.terminalOrders.some(
    (order) =>
      order.venueOrderId === venueOrderId &&
      order.clientOrderId === intent.clientOrderId &&
      order.originalQuantity !== null &&
      Math.abs(order.originalQuantity - intent.quantity) <= 1e-12 &&
      order.remainingQuantity === 0 &&
      (order.state === 'FILLED' || order.state === 'CANCELLED'),
  );
  if (!exactTerminal) return Object.freeze({ reconciled: null, blocker: conflict.blocker });
  if (resolution.state !== 'FULL_FILL' && resolution.state !== 'CANCELLED')
    return Object.freeze({ reconciled: null, blocker: conflict.blocker });
  const venueStatus = resolution.state === 'FULL_FILL' ? 'FILLED' : 'CANCELLED';
  Journal.applyAuthoritativeReconciliation({
    intentId: conflict.intentId,
    reconciliationState: resolution.state === 'FULL_FILL' ? 'FULL_FILL' : 'CANCELLED_EXTERNALLY',
    terminalStatus: resolution.state === 'FULL_FILL' ? 'APPLIED' : 'CANCELLED_EXTERNALLY',
    source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
    matchedIdentifier: `venueOrderId:${persisted.venueOrderId}`,
    venueStatus,
    remainingQuantity: resolution.remainingQuantity,
    transactionHash,
    venueOrderId,
    clientOrderId: intent.clientOrderId,
    observedAt: evidence.observedAt,
    fills: resolution.fills.map((fill) => ({
      fillId: fill.fillId,
      quantity: fill.quantity,
      price: fill.price,
      transactionVersion: requireDecibelFillTransactionVersionV1(
        evidence.fills.find((candidate) => candidate.venueFillId === fill.fillId)
          ?.transactionVersion,
      ),
      ...(fill.venueTimestamp === null ? {} : { transactionTimestamp: fill.venueTimestamp }),
    })),
  });
  return Object.freeze({
    reconciled: conflict.intentId,
    blocker: Journal.getActiveIdentityConflict()?.blocker ?? null,
  });
}

function parseBody(body: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(body);
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function assertDecibelWebTelemetrySanitizedV1(value: unknown): void {
  const inspect = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object') return;
    if (Array.isArray(candidate)) {
      for (const item of candidate) inspect(item);
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      if (/private.?key|mnemonic|authorization|api.?token|api.?key|cookie|signer/i.test(key))
        throw new Error('WEB_TELEMETRY_SECRET_FIELD_REJECTED');
      inspect(child);
    }
  };
  inspect(value);
}

export function readDecibelProductionWebHistoryV1(
  journalPath: string,
  limit = DECIBEL_PRODUCTION_WEB_HISTORY_LIMIT_V1,
  now = Date.now(),
): decibel_production_web_history_v1 {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DECIBEL_PRODUCTION_WEB_HISTORY_LIMIT_V1)
    throw new Error('WEB_TELEMETRY_HISTORY_LIMIT_INVALID');
  if (!existsSync(journalPath))
    return Object.freeze({
      journalAvailable: false,
      intents: Object.freeze([]),
      fills: Object.freeze([]),
      blockers: Object.freeze([]),
      events: Object.freeze([]),
      mutationAttempts: Object.freeze({ place: 0, cancel: 0, total: 0, oldestAt: null }),
      accountingFills: Object.freeze([]),
    });
  const Reader = new Database(journalPath, { readonly: true, fileMustExist: true });
  try {
    const reconciliationProvenanceAvailable =
      Reader.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='reconciliation_provenance'",
      ).get() !== undefined;
    const projectedBlocker = reconciliationProvenanceAvailable
      ? `CASE
           WHEN (
             SELECT blocker FROM lifecycle_blockers b
             WHERE b.intent_id=i.intent_id ORDER BY b.id DESC LIMIT 1
           )='PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK'
           AND EXISTS (
             SELECT 1 FROM reconciliation_provenance p
             WHERE p.intent_id=i.intent_id
               AND p.venue_status='OPEN'
               AND p.observed_at >= COALESCE((
                 SELECT observed_at FROM lifecycle_blockers b
                 WHERE b.intent_id=i.intent_id ORDER BY b.id DESC LIMIT 1
               ),0)
           ) THEN NULL
           ELSE (
             SELECT blocker FROM lifecycle_blockers b
             WHERE b.intent_id=i.intent_id ORDER BY b.id DESC LIMIT 1
           )
         END`
      : `(SELECT blocker FROM lifecycle_blockers b
          WHERE b.intent_id=i.intent_id ORDER BY b.id DESC LIMIT 1)`;
    const intentRows = Reader.prepare(
      `SELECT i.intent_id intentId,i.body_json bodyJson,i.status,i.venue_order_id venueOrderId,
       i.updated_at updatedAt,
       (SELECT outcome_json FROM executor_outcomes o WHERE o.intent_id=i.intent_id ORDER BY o.id DESC LIMIT 1) outcomeJson,
       ${projectedBlocker} blocker,
       (SELECT state FROM reconciliation_observations r WHERE r.intent_id=i.intent_id ORDER BY r.id DESC LIMIT 1) reconciliationResult
       FROM execution_intents i ORDER BY i.updated_at DESC LIMIT ?`,
    ).all(limit) as Array<Record<string, unknown>>;
    const intents = intentRows.map((row): decibel_production_web_intent_v1 => {
      const body = parseBody(String(row.bodyJson));
      const outcome = typeof row.outcomeJson === 'string' ? parseBody(row.outcomeJson) : {};
      return Object.freeze({
        timestamp: Number(row.updatedAt),
        intentId: String(row.intentId),
        action: body.action === 'PLACE' || body.action === 'CANCEL' ? body.action : 'UNKNOWN',
        side: body.side === 'BUY' || body.side === 'SELL' ? body.side : 'UNKNOWN',
        price: asNumber(body.price),
        quantity: asNumber(body.quantity),
        status: String(row.status),
        venueOrderId: asString(row.venueOrderId),
        transactionHash: asString(outcome.transactionHash),
        blocker: asString(row.blocker),
        reconciliationResult: asString(row.reconciliationResult),
      });
    });
    const fillRows = Reader.prepare(
      'SELECT fill_id fillId,intent_id intentId,side,quantity,price,maker_proven makerProven,observed_at observedAt FROM authenticated_fills ORDER BY observed_at DESC LIMIT ?',
    ).all(limit) as Array<Record<string, unknown>>;
    const fills = fillRows.map((row) =>
      Object.freeze({
        timestamp: Number(row.observedAt),
        fillId: String(row.fillId),
        side: row.side === 'BUY' ? ('BUY' as const) : ('SELL' as const),
        quantity: Number(row.quantity),
        price: Number(row.price),
        maker: Number(row.makerProven) === 1,
        intentId: asString(row.intentId),
      }),
    );
    const accountingRows = Reader.prepare(
      `SELECT f.fill_id fillId,f.side,f.quantity,f.price,f.maker_proven makerProven,
       f.observed_at observedAt,i.body_json bodyJson
       FROM authenticated_fills f
       LEFT JOIN execution_intents i ON i.intent_id=f.intent_id
       WHERE f.strategy_lineage=1
       ORDER BY f.observed_at,f.fill_id`,
    ).all() as Array<Record<string, unknown>>;
    const accountingFills = accountingRows.map((row) => {
      const body = typeof row.bodyJson === 'string' ? parseBody(row.bodyJson) : {};
      return Object.freeze({
        fillId: String(row.fillId),
        sessionId: asString(body.sessionId),
        side: row.side === 'BUY' ? ('BUY' as const) : ('SELL' as const),
        quantity: Number(row.quantity),
        price: Number(row.price),
        maker: Number(row.makerProven) === 1,
        observedAt: Number(row.observedAt),
      });
    });
    const blockerRows = Reader.prepare(
      `SELECT blocker code,MIN(observed_at) firstObservedAt,MAX(observed_at) lastObservedAt,
       MAX(intent_id) intentId FROM lifecycle_blockers GROUP BY blocker ORDER BY lastObservedAt DESC LIMIT ?`,
    ).all(limit) as Array<Record<string, unknown>>;
    const blockers = blockerRows.map((row) =>
      Object.freeze({
        code: String(row.code),
        meaning:
          blockerMeanings[String(row.code)] ?? 'Production safety condition requires review.',
        firstObservedAt: Number(row.firstObservedAt),
        lastObservedAt: Number(row.lastObservedAt),
        intentId: asString(row.intentId),
      }),
    );
    const attemptRows = Reader.prepare(
      'SELECT a.attempted_at attemptedAt,i.body_json bodyJson FROM mutation_attempts a JOIN execution_intents i ON i.intent_id=a.intent_id WHERE a.attempted_at>=? ORDER BY a.attempted_at',
    ).all(now - 60_000) as Array<Record<string, unknown>>;
    const attemptActions = attemptRows.map((row) => parseBody(String(row.bodyJson)).action);
    const events: decibel_production_web_event_v1[] = [
      ...intents.map((intent) =>
        Object.freeze({
          timestamp: intent.timestamp,
          severity: intent.blocker === null ? ('INFO' as const) : ('WARN' as const),
          category: 'EXECUTION' as const,
          eventType: intent.status,
          description: `${intent.action} ${intent.side} ${intent.intentId}`,
        }),
      ),
      ...fills.map((fill) =>
        Object.freeze({
          timestamp: fill.timestamp,
          severity: 'INFO' as const,
          category: 'FILL' as const,
          eventType: 'AUTHENTICATED_FILL',
          description: `${fill.side} ${fill.quantity} BTC at ${fill.price}`,
        }),
      ),
      ...blockers.map((blocker) =>
        Object.freeze({
          timestamp: blocker.lastObservedAt,
          severity: 'ERROR' as const,
          category: 'ERROR' as const,
          eventType: blocker.code,
          description: blocker.meaning,
        }),
      ),
    ]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, limit);
    return Object.freeze({
      journalAvailable: true,
      intents: Object.freeze(intents),
      fills: Object.freeze(fills),
      blockers: Object.freeze(blockers),
      events: Object.freeze(events),
      mutationAttempts: Object.freeze({
        place: attemptActions.filter((action) => action === 'PLACE').length,
        cancel: attemptActions.filter((action) => action === 'CANCEL').length,
        total: attemptRows.length,
        oldestAt: attemptRows.length === 0 ? null : Number(attemptRows[0]?.attemptedAt),
      }),
      accountingFills: Object.freeze(accountingFills),
    });
  } finally {
    Reader.close();
  }
}

function calculateAttributedRealizedPnl(
  fills: decibel_production_web_history_v1['accountingFills'],
): number {
  const buys: Array<{ quantity: number; price: number }> = [];
  const sells: Array<{ quantity: number; price: number }> = [];
  let realized = 0;
  for (const fill of fills) {
    let remaining = fill.quantity;
    const opposing = fill.side === 'BUY' ? sells : buys;
    while (remaining > Number.EPSILON && opposing[0] !== undefined) {
      const open = opposing[0];
      const matched = Math.min(remaining, open.quantity);
      realized +=
        fill.side === 'BUY'
          ? (open.price - fill.price) * matched
          : (fill.price - open.price) * matched;
      remaining -= matched;
      open.quantity -= matched;
      if (open.quantity <= Number.EPSILON) opposing.shift();
    }
    if (remaining > Number.EPSILON)
      (fill.side === 'BUY' ? buys : sells).push({ quantity: remaining, price: fill.price });
  }
  return realized;
}

export function calculateDecibelBotScopedPnlV1(
  fills: decibel_production_web_history_v1['accountingFills'],
  currentFeesByFillId: ReadonlyMap<string, number>,
  scope: 'BOT_SESSION' | 'BOT_ONLY',
  components: Readonly<{ unrealizedUsd: number | null; gasUsd: number | null }> = {
    unrealizedUsd: null,
    gasUsd: null,
  },
): decibel_bot_scoped_pnl_v1 {
  if (fills.length === 0)
    return Object.freeze({
      valueUsd: null,
      realizedUsd: null,
      unrealizedUsd: null,
      feesUsd: null,
      gasUsd: null,
      complete: false,
      scope,
    });
  const realizedUsd = calculateAttributedRealizedPnl(fills);
  const fees = fills.map((fill) => currentFeesByFillId.get(fill.fillId));
  const feesUsd = fees.every((fee): fee is number => fee !== undefined)
    ? fees.reduce((sum, fee) => sum + fee, 0)
    : null;
  const complete =
    feesUsd !== null && components.unrealizedUsd !== null && components.gasUsd !== null;
  return Object.freeze({
    valueUsd:
      realizedUsd + (components.unrealizedUsd ?? 0) - (feesUsd ?? 0) - (components.gasUsd ?? 0),
    realizedUsd,
    unrealizedUsd: components.unrealizedUsd,
    feesUsd,
    gasUsd: components.gasUsd,
    complete,
    scope,
  });
}

export function mapDecibelProductionWebTelemetryV1(
  input: Readonly<{
    overviewTotalSessionsExecuted?: number | null;
    overviewLifetime?: decibel_overview_lifetime_totals_v1 | null;
    snapshot: decibel_production_live_snapshot_v1 | null;
    history: decibel_production_web_history_v1;
    configuration: decibel_production_live_configuration_v1;
    startedAt: number;
    generatedAt: number;
    lastSuccessfulCycleAt: number | null;
    connectionError: string | null;
    recoveryBlocker?: string | null;
    protectiveRecoveryAdmission?: Readonly<{ allowed: boolean; blocker: string | null }>;
    authenticatedStateAgeMs?: number | null;
    build?: Readonly<{
      buildId: string;
      processStart: number;
      sourceBuildTimestamp: number;
      restartRequired: boolean;
    }>;
    dependencies?: Readonly<{
      economic: 'INIT' | 'READY' | 'BLOCKED' | 'FAILED';
      recovery: 'INIT' | 'READY' | 'BLOCKED' | 'FAILED';
      authenticatedState: 'INIT' | 'READY' | 'BLOCKED' | 'FAILED';
    }>;
    readiness?: Readonly<{
      processReady: boolean;
      accountReady: boolean;
      marketReady: boolean;
      executionSafe: boolean;
      economicReady: boolean;
      blockingComponent: 'PROCESS' | 'ACCOUNT' | 'MARKET' | 'EXECUTION' | 'ECONOMIC' | null;
      blockingReason: string | null;
    }>;
    execution?: Readonly<{
      tradingDecision?: trading_decision_v1 | null;
      running: boolean;
      sessionId: string | null;
      cycles: number;
      lastAction: string | null;
      blocker: string | null;
    }>;
    marketDataDiagnostics?: Readonly<{
      observedAt?: number;
      wsConnectionState?: 'INIT' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'STALLED';
      wsSubscriptionState?: 'UNSUBSCRIBED' | 'SUBSCRIBING' | 'SUBSCRIBED';
      lastWsMessageAgeMs?: number;
      lastValidBboAgeMs?: number;
      wsReconnectCount?: number;
      wsLastDisconnectReason?: string | null;
    }> | null;
    marketDataState?: 'READY' | 'BLOCKED' | 'INIT' | 'FAILED' | 'STOPPED';
    marketDataProjection?: Readonly<{
      generation: number;
      bboTimestamp: number | null;
      blockerSource: string | null;
      executionGeneration: number | null;
      executionBboTimestamp: number | null;
    }>;
    supervisorInventory?: Readonly<{
      state: 'UNKNOWN' | 'FLAT' | 'TRADEABLE_POSITION' | 'UNTRADEABLE_DUST';
      exactPositionBase: number | null;
      marketMinimumSize: number | null;
    }>;
  }>,
): decibel_production_web_telemetry_v1 {
  const snapshot = input.snapshot;
  const stateInput = snapshot?.input;
  const evaluation =
    snapshot === null
      ? null
      : evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, {
          minimumNotionalUsd: snapshot.minimumNotionalUsd,
          maximumNotionalUsd: snapshot.maximumNotionalUsd,
          availableMarginUsd: snapshot.availableMarginUsd,
          maximumEffectiveLeverage: snapshot.maximumEffectiveLeverage,
          makerFeeBps: snapshot.economicInputs?.makerFeeBps ?? null,
          estimatedGasCostUsd: snapshot.economicInputs?.estimatedGasCostUsd ?? null,
          adverseSelectionBufferBps: snapshot.economicInputs?.adverseSelectionBufferBps ?? null,
          safetyMarginBps: snapshot.economicInputs?.safetyMarginBps ?? 1,
          ...(snapshot.halfSpreadBps === undefined
            ? {}
            : { halfSpreadBps: snapshot.halfSpreadBps }),
          ...(snapshot.maximumAbsPositionBase === undefined
            ? {}
            : { maximumAbsPositionBase: snapshot.maximumAbsPositionBase }),
          maximumLadderLevelsPerSide: input.configuration.maximumLadderLevelsPerSide,
          maximumAggregateCollateralFraction:
            input.configuration.maximumAggregateCollateralFraction,
          ladderLevelAllocations: [0.5, 0.3, 0.2],
          volatilitySpreadMultiplier: 1,
          maximumVolatilitySpreadMultiplier: input.configuration.maximumVolatilitySpreadMultiplier,
        });
  const midpoint =
    stateInput === undefined ? null : (stateInput.book.bestBid + stateInput.book.bestAsk) / 2;
  const position =
    stateInput?.actualInventoryBase ?? input.supervisorInventory?.exactPositionBase ?? null;
  const exposure = snapshot?.sessionConfiguration?.exposureLimits;
  const maximumPosition =
    exposure !== undefined
      ? exposure.capacityBlocker == null && midpoint !== null
        ? exposure.effectivePositionLimitUsd / midpoint
        : null
      : snapshot?.capacityModelRequired
        ? null
        : (snapshot?.maximumAbsPositionBase ??
          (snapshot !== null && midpoint !== null ? snapshot.maximumNotionalUsd / midpoint : null));
  const unrealizedPnlUsd = snapshot?.accountMetrics?.unrealizedPnlUsd ?? null;
  const pnlWindows =
    stateInput === undefined
      ? null
      : calculateDecibelRealizedPnlWindowsV1(stateInput.actualFillLedger.fills, input.generatedAt);
  const desired = [
    ...(evaluation?.desiredAskLadder ?? []),
    ...(evaluation?.desiredBidLadder ?? []),
  ];
  const ladder = desired.map((level) => {
    const active = stateInput?.openOrders.find(
      (order) => order.side === level.side && order.clientOrderId === level.clientOrderId,
    );
    const reference = level.side === 'BUY' ? stateInput?.book.bestBid : stateInput?.book.bestAsk;
    return Object.freeze({
      levelId: level.levelId ?? `${level.side}-1`,
      side: level.side,
      desiredPrice: level.price,
      desiredQuantity: level.quantity,
      notionalUsd: level.price * level.quantity,
      activeVenueOrderId: active?.venueOrderId ?? null,
      clientOrderId: level.clientOrderId,
      ageMs: null,
      lifecycleStatus: active === undefined ? 'DESIRED' : 'ACTIVE',
      distanceTicks:
        reference === undefined
          ? 0
          : Math.abs(level.price - reference) / (stateInput?.metadata.tickSize ?? 1),
      skewStatus: level.skewStatus ?? 'NEUTRAL',
    });
  });
  const feeValues = stateInput?.actualFillLedger.fills
    .filter((fill) => fill.fee.availability === 'AVAILABLE' && fill.fee.currency === 'USD')
    .map((fill) => fill.fee.amount)
    .filter((fee): fee is number => fee !== null);
  const totalFees = feeValues === undefined ? null : feeValues.reduce((sum, fee) => sum + fee, 0);
  const currentFeesByFillId = new Map(
    (stateInput?.actualFillLedger.fills ?? [])
      .filter(
        (fill) =>
          fill.fee.availability === 'AVAILABLE' &&
          fill.fee.currency === 'USD' &&
          fill.fee.amount !== null,
      )
      .flatMap((fill) => [
        [fill.venueFillId, fill.fee.amount as number] as const,
        [
          getDecibelExecutionFillKeyV1(fill.venueOrderId, fill.venueFillId),
          fill.fee.amount as number,
        ] as const,
        ...(fill.executionFragments ?? [])
          .filter((fragment) => fragment.feeUsd !== null)
          .map(
            (fragment) =>
              [
                getDecibelExecutionFillKeyV1(
                  fill.venueOrderId,
                  fill.venueFillId,
                  fragment.fragmentId,
                ),
                fragment.feeUsd as number,
              ] as const,
          ),
      ]),
  );
  const utcVolume = calculateDecibelOverviewUTCVolumeV1(
    input.history.accountingFills,
    input.history.journalAvailable,
    input.generatedAt,
  );
  const sessionId = stateInput?.sessionId ?? null;
  const sessionAccountingFills = input.history.accountingFills.filter(
    (fill) => sessionId !== null && fill.sessionId === sessionId,
  );
  const sessionMakerFills = sessionAccountingFills.filter((fill) => fill.maker);
  const sessionMakerVolumeUsd = sessionMakerFills.reduce(
    (sum, fill) => sum + Math.abs(fill.quantity * fill.price),
    0,
  );
  const sessionTakerVolumeUsd = sessionAccountingFills
    .filter((fill) => !fill.maker)
    .reduce((sum, fill) => sum + Math.abs(fill.quantity * fill.price), 0);
  const totalExecutedVolumeUsd = sessionMakerVolumeUsd + sessionTakerVolumeUsd;
  const targetSemanticsVersion = snapshot?.sessionConfiguration?.targetSemanticsVersion ?? 1;
  const targetVolumeUsd =
    targetSemanticsVersion === 2 ? totalExecutedVolumeUsd : sessionMakerVolumeUsd;
  const sessionPnl = calculateDecibelBotScopedPnlV1(
    sessionAccountingFills,
    currentFeesByFillId,
    'BOT_SESSION',
  );
  const allTimePnl = calculateDecibelBotScopedPnlV1(
    input.history.accountingFills,
    currentFeesByFillId,
    'BOT_ONLY',
  );
  const placeLimit = Math.max(15, input.configuration.maximumLadderLevelsPerSide * 5);
  const cancelLimit = Math.max(15, input.configuration.maximumLadderLevelsPerSide * 5);
  const totalLimit = Math.max(30, input.configuration.maximumLadderLevelsPerSide * 10);
  const attempts = input.history.mutationAttempts;
  const unresolvedIntent = input.history.intents
    .filter((intent) =>
      [
        'PREPARED',
        'SUBMITTING',
        'SUBMIT_UNKNOWN',
        'ACKNOWLEDGED',
        'UNRESOLVABLE_ACK',
        'RECONCILING',
      ].includes(intent.status),
    )
    .sort((left, right) => {
      const priority = (status: string): number =>
        status === 'SUBMIT_UNKNOWN'
          ? 0
          : status === 'SUBMITTING'
            ? 1
            : status === 'UNRESOLVABLE_ACK'
              ? 2
              : 3;
      return priority(left.status) - priority(right.status) || right.timestamp - left.timestamp;
    })[0];
  const acknowledgedOrderIsAuthoritativelyOpen =
    unresolvedIntent?.status === 'ACKNOWLEDGED' &&
    unresolvedIntent.venueOrderId !== null &&
    stateInput?.openOrders.some((order) => order.venueOrderId === unresolvedIntent.venueOrderId) ===
      true;
  const reconciliationBlocker =
    unresolvedIntent === undefined
      ? null
      : unresolvedIntent.status === 'ACKNOWLEDGED' && acknowledgedOrderIsAuthoritativelyOpen
        ? null
        : unresolvedIntent.status === 'UNRESOLVABLE_ACK'
          ? 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK'
          : unresolvedIntent.status === 'ACKNOWLEDGED'
            ? 'PRODUCTION_RECONCILIATION_PENDING_ACKNOWLEDGED_ORDER'
            : 'PRODUCTION_RECONCILIATION_CONFIRMATION_PENDING';
  const activeBlockers = [
    ...(evaluation?.blockers ?? []),
    ...(input.connectionError === null ? [] : [input.connectionError]),
    ...(reconciliationBlocker === null ? [] : [reconciliationBlocker]),
    ...(input.execution?.blocker === null || input.execution?.blocker === undefined
      ? []
      : [input.execution.blocker]),
  ];
  const historicalBlockers = input.history.blockers.filter((blocker) =>
    activeBlockers.includes(blocker.code),
  );
  const hasUnresolvedIntent =
    unresolvedIntent !== undefined && !acknowledgedOrderIsAuthoritativelyOpen;
  const latestMutation = input.history.intents[0];
  const executionAction = input.execution?.lastAction ?? null;
  const whyNoAction =
    executionAction !== null && executionAction !== 'HOLD'
      ? null
      : (input.execution?.blocker ??
        evaluation?.blockers[0] ??
        (evaluation === null
          ? 'EVALUATION_UNAVAILABLE'
          : [evaluation.bidEligibilityReason, evaluation.askEligibilityReason].join(' / ')));
  const storedDecision = input.execution?.tradingDecision ?? snapshot?.tradingDecision;
  const projectedDecision = evaluateTradingDecision(snapshot, {
    now: input.generatedAt,
    sessionId: input.execution?.sessionId ?? null,
    state:
      storedDecision?.primaryReason === 'SESSION_STOPPING'
        ? 'STOPPING'
        : input.execution?.running
          ? 'RUNNING'
          : 'IDLE',
    evaluation,
    mandatoryEvidenceFailureSince:
      input.execution?.tradingDecision?.evidence.failureSince ??
      snapshot?.tradingDecision?.evidence.failureSince ??
      null,
    blocker: input.execution?.blocker ?? null,
    identityConflict: reconciliationBlocker,
    terminalReason:
      storedDecision?.primaryReason === 'SESSION_MAX_LOSS_REACHED'
        ? 'SESSION_MAX_LOSS_REACHED'
        : null,
  });
  const sameSnapshot =
    storedDecision?.evidence.sourceStateHash === snapshot?.sourceStateHash &&
    storedDecision?.evidence.sessionId === input.execution?.sessionId;
  // The actor owns eligibility. Presentation may revoke stale/unsafe permission,
  // but must not invent TRADE by independently selecting different quotes.
  const unifiedDecision =
    storedDecision &&
    sameSnapshot &&
    input.execution?.running &&
    projectedDecision.evidenceComplete &&
    projectedDecision.state !== 'STOP' &&
    input.execution.blocker == null
      ? storedDecision
      : projectedDecision;
  const telemetry: decibel_production_web_telemetry_v1 = Object.freeze({
    version: DECIBEL_PRODUCTION_WEB_TELEMETRY_V1,
    generatedAt: input.generatedAt,
    degraded: snapshot === null || input.connectionError !== null,
    lastSuccessfulCycleAt: input.lastSuccessfulCycleAt,
    runtime: Object.freeze({
      state:
        input.connectionError !== null
          ? 'READ_FAILURE'
          : hasUnresolvedIntent
            ? 'RECONCILE_ONLY'
            : evaluation?.status === 'FAIL_CLOSED'
              ? 'BLOCKED'
              : 'RUNNING',
      network: stateInput?.observedNetwork ?? 'UNKNOWN',
      market: 'BTC/USD',
      releaseStage: input.configuration.releaseStage,
      dryRun: input.configuration.dryRun,
      connected: input.connectionError === null && snapshot !== null,
      buildId: input.build?.buildId ?? 'UNKNOWN',
      processStart: input.build?.processStart ?? input.startedAt,
      sourceBuildTimestamp: input.build?.sourceBuildTimestamp ?? input.startedAt,
      restartRequired: input.build?.restartRequired ?? false,
      authenticatedStateAgeMs:
        input.authenticatedStateAgeMs === undefined
          ? stateInput === undefined
            ? null
            : Math.max(0, input.generatedAt - stateInput.now)
          : input.authenticatedStateAgeMs,
      journalStatus: input.history.journalAvailable ? 'READY' : 'UNAVAILABLE',
      uptimeMs: Math.max(0, input.generatedAt - input.startedAt),
      executionLoopRunning: input.execution?.running ?? false,
      executionLoopHealthy:
        (input.execution?.running ?? false) &&
        input.lastSuccessfulCycleAt !== null &&
        input.generatedAt >= input.lastSuccessfulCycleAt &&
        input.generatedAt - input.lastSuccessfulCycleAt <=
          DECIBEL_PRODUCTION_SESSION_HEARTBEAT_STALE_MS_V1,
      executionSessionId: input.execution?.sessionId ?? null,
      positionSafety: deriveDecibelPositionSafetyStatusV1({
        snapshot,
        now: input.generatedAt,
        executionOperational:
          (input.execution?.running ?? false) &&
          input.lastSuccessfulCycleAt !== null &&
          input.generatedAt >= input.lastSuccessfulCycleAt &&
          input.generatedAt - input.lastSuccessfulCycleAt <=
            DECIBEL_PRODUCTION_SESSION_HEARTBEAT_STALE_MS_V1,
        entryReady: unifiedDecision.state === 'TRADE',
        recoveryBlocker:
          input.recoveryBlocker ??
          reconciliationBlocker ??
          (input.dependencies?.recovery === 'BLOCKED'
            ? 'PRODUCTION_RECOVERY_INITIALIZATION_REQUIRED'
            : null),
        executionBlocker: input.protectiveRecoveryAdmission?.allowed
          ? (input.execution?.blocker ?? null)
          : (input.execution?.blocker ?? input.connectionError),
        independentRecoveryVerified: input.protectiveRecoveryAdmission?.allowed ?? false,
        independentRecoveryBlocker: input.protectiveRecoveryAdmission?.blocker ?? null,
      }),
      executionCycles: input.execution?.cycles ?? 0,
      lastExecutionAction: input.execution?.lastAction ?? null,
      executionBlocker: input.execution?.blocker ?? null,
      strategyState: evaluation?.operatingState ?? evaluation?.strategyState ?? null,
      tradingDecision: unifiedDecision,
      bidEligible: unifiedDecision.bidEligible,
      askEligible: unifiedDecision.askEligible,
      whyNoAction,
      lastCycleAgeMs:
        input.lastSuccessfulCycleAt === null
          ? null
          : Math.max(0, input.generatedAt - input.lastSuccessfulCycleAt),
      lastMutation:
        latestMutation === undefined
          ? null
          : `${latestMutation.action} ${latestMutation.side} ${latestMutation.status}`,
      lifecycleBlocker: reconciliationBlocker ?? input.execution?.blocker ?? null,
      rateLimitBackoff: activeBlockers.includes('PRODUCTION_DECIBEL_HTTP_RATE_LIMITED'),
      authenticatedReadError: input.connectionError,
      lastError: input.connectionError ?? input.execution?.blocker ?? null,
      readiness: Object.freeze(
        input.readiness ?? {
          processReady: true,
          accountReady: snapshot !== null,
          marketReady: input.marketDataState === 'READY',
          executionSafe: input.execution?.blocker === null,
          economicReady: input.dependencies?.economic === 'READY',
          blockingComponent: snapshot === null ? 'ACCOUNT' : null,
          blockingReason:
            snapshot === null ? 'PRODUCTION_AUTHENTICATED_STATE_INITIALIZATION_REQUIRED' : null,
        },
      ),
      dependencies: Object.freeze(
        input.dependencies ?? {
          economic: 'READY',
          recovery: 'READY',
          authenticatedState: snapshot === null ? 'INIT' : 'READY',
        },
      ),
    }),
    market: Object.freeze({
      state: input.marketDataState ?? 'INIT',
      bestBid: stateInput?.book.bestBid ?? null,
      bestAsk: stateInput?.book.bestAsk ?? null,
      spread: stateInput === undefined ? null : stateInput.book.bestAsk - stateInput.book.bestBid,
      midpoint,
      fairPrice: midpoint,
      tickSize: stateInput?.metadata.tickSize ?? null,
      lotSize: stateInput?.metadata.lotSize ?? null,
      bookAgeMs:
        stateInput === undefined
          ? null
          : Math.max(0, input.generatedAt - stateInput.book.observedAt),
      volatilityMultiplier: evaluation === null ? null : 1,
      wsConnectionState: input.marketDataDiagnostics?.wsConnectionState ?? 'UNKNOWN',
      wsSubscriptionState: input.marketDataDiagnostics?.wsSubscriptionState ?? 'UNKNOWN',
      lastWsMessageAgeMs: input.marketDataDiagnostics?.lastWsMessageAgeMs ?? null,
      lastValidBboAgeMs: input.marketDataDiagnostics?.lastValidBboAgeMs ?? null,
      wsReconnectCount: input.marketDataDiagnostics?.wsReconnectCount ?? 0,
      wsLastDisconnectReason: input.marketDataDiagnostics?.wsLastDisconnectReason ?? null,
      marketDataGeneration: input.marketDataProjection?.generation ?? 0,
      supervisorBboTimestamp: input.marketDataProjection?.bboTimestamp ?? null,
      telemetryBboTimestamp: input.marketDataDiagnostics?.observedAt ?? null,
      executionBboTimestamp: input.marketDataProjection?.executionBboTimestamp ?? null,
      executionSnapshotGeneration: input.marketDataProjection?.executionGeneration ?? null,
      marketDataBlockerSource: input.marketDataProjection?.blockerSource ?? null,
    }),
    account: Object.freeze({
      configuredSubaccount: stateInput?.configuredSubaccount ?? null,
      authenticatedSubaccount: stateInput?.authenticatedSubaccount ?? null,
      subaccountMatches:
        stateInput === undefined
          ? null
          : stateInput.configuredSubaccount === stateInput.authenticatedSubaccount,
      collateralUsd: snapshot?.accountMetrics?.collateralUsd ?? null,
      availableMarginUsd: snapshot?.availableMarginUsd ?? null,
      availableMarginReason:
        snapshot === null ? 'AUTHENTICATED_AVAILABLE_TO_TRADE_UNAVAILABLE' : null,
      marginUsedUsd: snapshot?.sessionConfiguration?.marginUsedUsd ?? null,
      marginUsedReason:
        snapshot?.sessionConfiguration === undefined ? 'ACTIVE_SESSION_CONFIG_UNAVAILABLE' : null,
      effectiveLeverage: snapshot?.maximumEffectiveLeverage ?? null,
      capacityProduction: snapshot?.capacityProduction ?? null,
      capacityDiagnostics:
        snapshot?.sessionConfiguration?.exposureLimits?.capacityDiagnostics ?? null,
      capacityBlocker:
        snapshot?.sessionConfiguration?.exposureLimits?.capacityBlocker ??
        'SESSION_CAPACITY_EVIDENCE_REQUIRED',
      exposureLimits:
        input.readiness?.accountReady === true &&
        input.readiness.marketReady &&
        snapshot?.sessionConfiguration?.riskBlocker === null
          ? (snapshot.sessionConfiguration.exposureLimits ?? null)
          : null,
    }),
    inventory: Object.freeze({
      positionBase: position,
      direction:
        position === null ? 'UNKNOWN' : position > 0 ? 'LONG' : position < 0 ? 'SHORT' : 'FLAT',
      state:
        input.supervisorInventory?.state ??
        (position === null
          ? 'UNKNOWN'
          : position === 0
            ? 'FLAT'
            : stateInput !== undefined &&
                stateInput.metadata.minimumSize > 0 &&
                Math.abs(position) < stateInput.metadata.minimumSize
              ? 'UNTRADEABLE_DUST'
              : 'TRADEABLE_POSITION'),
      exactPositionBase: position,
      marketMinimumSize:
        stateInput?.metadata.minimumSize ?? input.supervisorInventory?.marketMinimumSize ?? null,
      positionNotionalUsd:
        position === null || midpoint === null ? null : Math.abs(position * midpoint),
      utilization:
        position === null || maximumPosition === null ? null : Math.abs(position) / maximumPosition,
      maximumPositionBase: maximumPosition,
      remainingCapacityBase:
        position === null || maximumPosition === null
          ? null
          : Math.max(0, maximumPosition - Math.abs(position)),
    }),
    positions: Object.freeze(
      (snapshot?.authenticatedPositions ?? []).map((position) =>
        Object.freeze({
          market: position.market,
          side: position.size > 0 ? ('LONG' as const) : ('SHORT' as const),
          size: Math.abs(position.size),
          entryPrice: null,
          markPrice: position.market === 'BTC/USD' ? midpoint : null,
          unrealizedPnlUsd: null,
          source: position.source,
        }),
      ),
    ),
    ladder: Object.freeze(ladder),
    orders: Object.freeze(
      (stateInput?.openOrders ?? []).map((order) =>
        Object.freeze({
          venueOrderId: order.venueOrderId,
          clientOrderId: order.clientOrderId,
          side: order.side,
          price: order.price,
          quantity: order.quantity,
          reduceOnly: order.reduceOnly ?? null,
          postOnly: true as const,
        }),
      ),
    ),
    pnl: Object.freeze({
      realized24hUsd: pnlWindows?.hours24.realizedPnlUsd ?? null,
      realized7dUsd: pnlWindows?.days7.realizedPnlUsd ?? null,
      realized30dUsd: pnlWindows?.days30.realizedPnlUsd ?? null,
      unrealizedUsd: unrealizedPnlUsd,
      totalFeesUsd: totalFees,
      makerFeesUsd: totalFees,
      transactionGasApt: null,
      netPnlAfterKnownCostsUsd:
        pnlWindows === null || unrealizedPnlUsd === null || totalFees === null
          ? null
          : pnlWindows.days30.realizedPnlUsd + unrealizedPnlUsd - totalFees,
      sessionPnl,
      allTimePnl,
    }),
    quoteSizing: snapshot?.quoteSizing ?? null,
    volume: Object.freeze({
      targetMakerVolumeUsd: stateInput?.targetExternalMakerVolumeUsd ?? null,
      authenticatedMakerVolumeUsd: evaluation?.actualExternalMakerVolumeUsd ?? null,
      completionRatio:
        stateInput?.targetExternalMakerVolumeUsd === null ||
        stateInput?.targetExternalMakerVolumeUsd === undefined ||
        evaluation === null
          ? null
          : targetVolumeUsd / stateInput.targetExternalMakerVolumeUsd,
      completedRecycleCycles:
        evaluation?.volumeCycles.filter((cycle) => cycle.status === 'COMPLETED').length ?? null,
      currentCycleInventoryBase: position,
      makerFillCount: evaluation?.actualMakerFillCount ?? null,
      sessionMakerVolumeUsd: sessionId === null ? null : sessionMakerVolumeUsd,
      sessionTakerVolumeUsd: sessionId === null ? null : sessionTakerVolumeUsd,
      totalExecutedVolumeUsd: sessionId === null ? null : totalExecutedVolumeUsd,
      remainingToTargetUsd:
        sessionId === null ||
        stateInput?.targetExternalMakerVolumeUsd == null ||
        stateInput.targetExternalMakerVolumeUsd <= 0
          ? null
          : Math.max(0, stateInput.targetExternalMakerVolumeUsd - targetVolumeUsd),
      targetSemanticsVersion,
    }),
    overviewHistory: Object.freeze({
      totalSessionsExecuted:
        input.overviewLifetime?.sessionCount ?? input.overviewTotalSessionsExecuted ?? null,
      utcDayStart: utcVolume.utcDayStart,
      volumeSinceUTCStartUsd: utcVolume.volumeUsd,
      ...(() => {
        const lifetime = combineDecibelLifetimeTotalsV1(input.overviewLifetime ?? null, {
          sessionId,
          volumeUsd: sessionId === null ? null : totalExecutedVolumeUsd,
          netPnlUsd: snapshot?.sessionConfiguration?.pnlUsd ?? null,
          feesUsd: sessionPnl.feesUsd,
        });
        return {
          lifetimeVolumeUsd: lifetime.volumeUsd,
          allTimeNetPnlUsd: lifetime.netPnlUsd,
          allTimeGrossPnlUsd: lifetime.grossPnlUsd,
          allTimeIncompletePnlCount: lifetime.incompletePnlCount,
        };
      })(),
    }),
    overviewEvidence: Object.freeze({
      sessionId,
      capitalUsd: snapshot?.sessionConfiguration?.capitalToUseUsd ?? null,
      maxLossUsd: snapshot?.sessionConfiguration?.maxLossUsd ?? null,
      sessionPnlUsd: snapshot?.sessionConfiguration?.pnlUsd ?? null,
      makerVolumeUsd: snapshot?.sessionConfiguration?.makerVolumeUsd ?? null,
      takerVolumeUsd: snapshot?.sessionConfiguration?.takerVolumeUsd ?? null,
      totalExecutedVolumeUsd: snapshot?.sessionConfiguration?.totalExecutedVolumeUsd ?? null,
    }),
    risk: Object.freeze({
      maximumPositionBase: maximumPosition,
      maximumNotionalUsd: snapshot?.maximumNotionalUsd ?? null,
      maximumDrawdownUsd: null,
      effectiveLeverage: snapshot?.maximumEffectiveLeverage ?? null,
      exposureLimits:
        input.readiness?.accountReady === true &&
        input.readiness.marketReady &&
        snapshot?.sessionConfiguration?.riskBlocker === null
          ? (snapshot.sessionConfiguration.exposureLimits ?? null)
          : null,
      minimumOrderNotionalUsd: snapshot?.minimumNotionalUsd ?? null,
      placeRemaining: Math.max(0, placeLimit - attempts.place),
      cancelRemaining: Math.max(0, cancelLimit - attempts.cancel),
      totalRemaining: Math.max(0, totalLimit - attempts.total),
      nextBudgetReplenishmentAt:
        attempts.oldestAt === null || attempts.total < totalLimit
          ? null
          : attempts.oldestAt + 60_001,
    }),
    blockers: Object.freeze([
      ...historicalBlockers,
      ...activeBlockers
        .filter((code) => !historicalBlockers.some((blocker) => blocker.code === code))
        .map((code) =>
          Object.freeze({
            code,
            meaning: blockerMeanings[code] ?? 'Production safety condition requires review.',
            firstObservedAt: input.generatedAt,
            lastObservedAt: input.generatedAt,
            intentId: code === reconciliationBlocker ? (unresolvedIntent?.intentId ?? null) : null,
          }),
        ),
    ]),
    intents: input.history.intents,
    fills: input.history.fills,
    events: input.history.events,
  });
  assertDecibelWebTelemetrySanitizedV1(telemetry);
  return telemetry;
}
