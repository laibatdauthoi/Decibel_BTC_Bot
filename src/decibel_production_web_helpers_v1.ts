/**
 * Request handlers, next-session projections and startup recovery steps of the production
 * web runtime (moved out of run_decibel_production_web_v1.ts on 2026-11-16). This module has
 * no import-time side effects, unlike the runtime entry point.
 */
import {
  calculateDecibelPreferredEntrySizeUsdV1,
  calculateDecibelEntrySizeV1,
} from './decibel_entry_size_v1.js';
import {
  validateSettingsCapitalMarginV1,
  type capital_margin_evidence_v1,
} from './settings_capital_margin_v1.js';
import { assertDecibelVenueReconciliationFreshV1 } from './decibel_venue_reconciliation_snapshot_v1.js';
import {
  calculateDecibelRiskCapacityV1,
  DECIBEL_CAPACITY_POLICY_V1,
  type decibel_capacity_inputs_v1,
} from './decibel_risk_capacity_v1.js';
import { type Server as HTTPServer } from 'node:http';
import { z } from 'zod';
import {
  decibel_operator_settings_store_v1,
  deriveDecibelSessionTradingLimitsV1,
  validateDecibelCapitalAllocationV1,
  type decibel_operator_settings_values_v1,
} from './decibel_operator_settings_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import { execution_preflight_rejection_v1 } from './decibel_execution_intent_v1.js';
import { decibel_production_session_controller_v1 } from './decibel_production_session_controller_v1.js';
import { reconcileDecibelAcknowledgedTerminalOrdersV1 } from './decibel_production_web_telemetry_v1.js';
import type {
  DecibelProductionLiveStateSourceV1,
  decibel_production_live_snapshot_v1,
} from './decibel_production_live_types_v1.js';
import { type decibel_raw_ws_bbo_store_v1 } from './decibel_adverse_selection_evidence_v1.js';
import { refreshDecibelProductionEconomicEvidenceV1 } from './decibel_production_economic_refresh_v1.js';
import { decibel_runtime_supervisor_v1 } from './decibel_runtime_supervisor_v1.js';
import { classifyDecibelOperationalMarketRegimeV1 } from './decibel_market_regime_v1.js';
import {
  executionModesEqualV1,
  readDecibelEnvironmentExecutionModeV1,
  type decibel_persisted_execution_mode_v1,
} from './decibel_persisted_execution_mode_v1.js';

export function estimateDecibelNextSessionPositionLimitV1(
  input: Readonly<{
    settings: decibel_operator_settings_values_v1;
    snapshot: decibel_production_live_snapshot_v1 | null;
    observations: decibel_capacity_inputs_v1 | null;
    ready: boolean;
    now: number;
    safetyCeilingUsd: number;
    collateralFraction: number;
    inflight?: readonly Readonly<{ side?: 'BUY' | 'SELL'; quantity: number; price: number }>[];
  }>,
) {
  const unavailable = (blocker: string) => ({
    classification: 'ESTIMATED' as const,
    estimatedPositionLimitUsd: null as number | null,
    blocker,
    assumptions: DECIBEL_CAPACITY_POLICY_V1,
  });
  const s = input.snapshot,
    o = input.observations;
  if (!input.ready || !s || !o) return unavailable('PREVIEW_AUTHENTICATED_INPUTS_REQUIRED');
  try {
    validateDecibelCapitalAllocationV1(input.settings.capitalToUseUsd, o.equityUsd);
    const result = calculateDecibelRiskCapacityV1({
      now: input.now,
      observations: o,
      capitalUsd: input.settings.capitalToUseUsd,
      availableMarginUsd: s.availableMarginUsd,
      leverage: Math.min(s.maximumEffectiveLeverage, o.actualLeverage ?? Number.NaN),
      maxLossUsd: input.settings.maxLossUsd,
      netSessionPnlAfterFeesUsd: 0,
      midpoint: (s.input.book.bestBid + s.input.book.bestAsk) / 2,
      lotSize: s.input.metadata.lotSize,
      collateralFraction: input.collateralFraction,
      safetyNotionalCeilingUsd:
        input.settings.capitalToUseUsd *
        input.collateralFraction *
        Math.min(s.maximumEffectiveLeverage, o.actualLeverage ?? Number.NaN),
      positionBase: s.input.actualInventoryBase,
      orders: s.input.openOrders,
      inflight: input.inflight ?? [],
    });
    return {
      ...unavailable(result.capacityBlocker ?? ''),
      blocker: result.capacityBlocker,
      estimatedPositionLimitUsd:
        result.capacityBlocker === null ? result.effectivePositionLimitUsd : null,
    };
  } catch {
    return unavailable('PREVIEW_ACCOUNT_INPUTS_INVALID');
  }
}

/** Legacy projection retained for historical readers only. */
export function projectDecibelNextSessionPositionLimitV1(
  input: Readonly<{
    settings: decibel_operator_settings_values_v1;
    snapshot: decibel_production_live_snapshot_v1 | null;
    accountReady: boolean;
    marketReady: boolean;
    venueMaximumNotionalUsd: number;
    maximumAggregateCollateralFraction: number;
  }>,
): number | null {
  if (!input.accountReady || !input.marketReady || input.snapshot === null) return null;
  const snapshot = input.snapshot;
  try {
    validateDecibelCapitalAllocationV1(
      input.settings.capitalToUseUsd,
      snapshot.accountMetrics?.collateralUsd ?? null,
    );
    const capacityEvidence =
      snapshot.capacityProduction === undefined
        ? snapshot.capacityEvidence
        : snapshot.capacityProduction.certificate;
    const limits = deriveDecibelSessionTradingLimitsV1({
      settings: input.settings,
      now: Date.now(),
      ...(capacityEvidence === undefined
        ? {}
        : { capacityEvidence: { ...capacityEvidence, sessionGasPaidUsd: 0 } }),
      ...(snapshot.practicalCapacityInputs === undefined
        ? {}
        : { capacityInputs: snapshot.practicalCapacityInputs }),
      venueAvailableMarginUsd: snapshot.availableMarginUsd,
      positionBase: snapshot.input.actualInventoryBase,
      openOrders: snapshot.input.openOrders,
      midpoint: (snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2,
      maximumEffectiveLeverage: snapshot.maximumEffectiveLeverage,
      venueMaximumNotionalUsd: input.venueMaximumNotionalUsd,
      maximumAggregateCollateralFraction: input.maximumAggregateCollateralFraction,
      totalExecutedVolumeUsd: 0,
      pnlUsd: 0,
      lotSize: snapshot.input.metadata.lotSize,
    });
    return limits.capacityBlocker === null ? limits.effectivePositionLimitUsd : null;
  } catch {
    return null;
  }
}

export function projectDecibelNextSessionEntrySizeUsdV1(
  input: Readonly<{
    settings: decibel_operator_settings_values_v1;
    snapshot: decibel_production_live_snapshot_v1 | null;
    accountReady: boolean;
    marketReady: boolean;
    venueMaximumNotionalUsd: number;
    maximumAggregateCollateralFraction: number;
  }>,
): number | null {
  if (!input.accountReady || !input.marketReady || input.snapshot === null) return null;
  const snapshot = input.snapshot;
  try {
    validateDecibelCapitalAllocationV1(
      input.settings.capitalToUseUsd,
      snapshot.accountMetrics?.collateralUsd ?? null,
    );
    const capacityEvidence =
      snapshot.capacityProduction === undefined
        ? snapshot.capacityEvidence
        : snapshot.capacityProduction.certificate;
    const limits = deriveDecibelSessionTradingLimitsV1({
      settings: input.settings,
      now: Date.now(),
      ...(capacityEvidence === undefined
        ? {}
        : { capacityEvidence: { ...capacityEvidence, sessionGasPaidUsd: 0 } }),
      ...(snapshot.practicalCapacityInputs === undefined
        ? {}
        : { capacityInputs: snapshot.practicalCapacityInputs }),
      venueAvailableMarginUsd: snapshot.availableMarginUsd,
      positionBase: snapshot.input.actualInventoryBase,
      openOrders: snapshot.input.openOrders,
      midpoint: (snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2,
      maximumEffectiveLeverage: snapshot.maximumEffectiveLeverage,
      venueMaximumNotionalUsd: input.venueMaximumNotionalUsd,
      maximumAggregateCollateralFraction: input.maximumAggregateCollateralFraction,
      totalExecutedVolumeUsd: 0,
      pnlUsd: 0,
      lotSize: snapshot.input.metadata.lotSize,
    });
    if (limits.capacityBlocker !== null) return null;
    return calculateDecibelEntrySizeV1({
      preferredEntrySizeUsd: calculateDecibelPreferredEntrySizeUsdV1({
        targetTradingVolumeUsd: input.settings.targetMakerVolumeUsd,
        capitalToUseUsd: input.settings.capitalToUseUsd,
        collateralFraction: input.maximumAggregateCollateralFraction,
      }),
      price: snapshot.input.book.bestBid,
      minimumSize: snapshot.input.metadata.minimumSize,
      minimumNotionalUsd: snapshot.input.metadata.minimumNotionalUsd ?? 0,
      lotSize: snapshot.input.metadata.lotSize,
      maximumExecutableNotionalUsd: Math.min(
        limits.availableHeadroomUsd,
        limits.maximumOrderNotionalUsd,
        limits.availableMarginUsd *
          Math.min(
            snapshot.maximumEffectiveLeverage,
            snapshot.practicalCapacityInputs?.actualLeverage ?? snapshot.maximumEffectiveLeverage,
          ),
      ),
    }).entrySizeUsd;
  } catch {
    return null;
  }
}

export function handleDecibelOperatorSettingsRequestV1(
  method: string,
  pathname: string,
  body: unknown,
  Store: decibel_operator_settings_store_v1,
  marginEvidence: capital_margin_evidence_v1 = { availableMarginUsd: null, status: 'unknown' },
): Readonly<{ status: number; body: unknown }> | null {
  if (pathname !== '/api/operator-settings') return null;
  if (method === 'GET') return Object.freeze({ status: 200, body: Store.read() });
  if (method !== 'POST')
    return Object.freeze({ status: 405, body: { error: 'METHOD_NOT_ALLOWED' } });
  try {
    const parsed = z
      .object({ expectedRevision: z.number().int().nonnegative(), values: z.unknown() })
      .strict()
      .parse(body);
    const values = z
      .object({ capitalToUseUsd: z.number().finite().positive() })
      .parse(parsed.values);
    if (validateSettingsCapitalMarginV1(String(values.capitalToUseUsd), marginEvidence) !== 'valid')
      throw new Error('CAPITAL_MARGIN_VALIDATION_FAILED');
    return Object.freeze({
      status: 200,
      body: Store.update({ expectedRevision: parsed.expectedRevision, values: parsed.values }),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SETTINGS_VALIDATION_FAILED';
    return Object.freeze({
      status: code === 'SETTINGS_REVISION_CONFLICT' ? 409 : 400,
      body: { error: code === 'SETTINGS_REVISION_CONFLICT' ? code : 'SETTINGS_VALIDATION_FAILED' },
    });
  }
}

export function handleDecibelExecutionModeRequestV1(
  method: string,
  pathname: string,
  _body: unknown,
  environmentPath: string,
  loadedMode: decibel_persisted_execution_mode_v1,
): Readonly<{ status: number; body: unknown }> | null {
  if (pathname !== '/api/execution-mode') return null;
  const describe = (requestedMode: decibel_persisted_execution_mode_v1) =>
    Object.freeze({
      currentMode: loadedMode,
      requestedMode,
      modeSource: `ENV:${environmentPath}`,
      modeChangedAt: requestedMode.persistedAt,
      restartRequired: !executionModesEqualV1(loadedMode, requestedMode),
    });
  if (method === 'GET') {
    try {
      return Object.freeze({
        status: 200,
        body: describe(readDecibelEnvironmentExecutionModeV1(environmentPath)),
      });
    } catch {
      return Object.freeze({
        status: 200,
        body: {
          currentMode: loadedMode,
          requestedMode: null,
          modeSource: `ENV:${environmentPath}`,
          modeChangedAt: null,
          restartRequired: true,
          error: 'EXECUTION_MODE_ENVIRONMENT_INVALID',
        },
      });
    }
  }
  if (method === 'POST')
    return Object.freeze({
      status: 405,
      body: { error: 'EXECUTION_MODE_ENVIRONMENT_AUTHORITATIVE_READ_ONLY' },
    });
  return Object.freeze({ status: 405, body: { error: 'METHOD_NOT_ALLOWED' } });
}

/** Durable completion precedes scheduler teardown; failed persistence is retryable. */
export function finalizeDecibelVerifiedSessionV1(
  snapshot: decibel_production_live_snapshot_v1 | null,
  unresolvedIntentCount: number,
  complete: () => void,
  now = Date.now(),
): boolean {
  if (
    snapshot === null ||
    snapshot.input.actualInventoryBase !== 0 ||
    snapshot.input.openOrders.length !== 0 ||
    unresolvedIntentCount !== 0
  )
    return false;
  try {
    assertDecibelVenueReconciliationFreshV1(snapshot, now);
  } catch {
    return false;
  }
  complete();
  return true;
}

export function assertDecibelSessionMutationOwnerV1(ownsRuntime: () => boolean): void {
  if (!ownsRuntime())
    throw new execution_preflight_rejection_v1('SESSION_RUNTIME_OWNER_NOT_EXCLUSIVE');
}

export async function handleDecibelProductionSessionRequestV1(
  method: string,
  pathname: string,
  body: unknown,
  Controller: decibel_production_session_controller_v1,
): Promise<Readonly<{ status: number; body: unknown }> | null> {
  if (pathname === '/api/session') {
    if (method !== 'GET')
      return Object.freeze({ status: 405, body: { error: 'METHOD_NOT_ALLOWED' } });
    return Object.freeze({ status: 200, body: Controller.getState() });
  }
  if (pathname === '/api/session-history') {
    if (method !== 'GET')
      return Object.freeze({ status: 405, body: { error: 'METHOD_NOT_ALLOWED' } });
    return Object.freeze({ status: 200, body: Controller.getHistory() });
  }
  if (
    pathname !== '/api/session/start' &&
    pathname !== '/api/session/end' &&
    pathname !== '/api/session/resume-takeover'
  )
    return null;
  if (method !== 'POST')
    return Object.freeze({ status: 405, body: { error: 'METHOD_NOT_ALLOWED' } });
  try {
    if (pathname === '/api/session/resume-takeover')
      return Object.freeze({ status: 200, body: await Controller.resumeTakeover() });
    if (pathname === '/api/session/start') {
      const parsed = z
        .object({ expectedSettingsRevision: z.number().int().nonnegative() })
        .strict()
        .parse(body);
      return Object.freeze({
        status: 200,
        body: await Controller.requestStart(parsed.expectedSettingsRevision),
      });
    }
    return Object.freeze({ status: 200, body: await Controller.end('OPERATOR_END') });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SESSION_CONTROL_FAILED';
    return Object.freeze({
      status: code === 'SESSION_ALREADY_ACTIVE' || code.endsWith('_CONFLICT') ? 409 : 400,
      body: {
        error: code,
        startDisposition: code.endsWith('_CONFLICT') ? 'REJECTED_TRANSITION' : 'BLOCKED',
        transitionId: Controller.getState().lastStartAttempt?.transitionId ?? null,
      },
    });
  }
}

export async function recoverDecibelProductionSessionBeforeListenV1(
  recoverStartup: () => Promise<number>,
): Promise<Readonly<{ result: 'RECOVERED' | 'NOT_REQUIRED' | 'BLOCKED'; blocker: string | null }>> {
  try {
    const recovered = await recoverStartup();
    return Object.freeze({
      result: recovered > 0 ? 'RECOVERED' : 'NOT_REQUIRED',
      blocker: null,
    });
  } catch (error) {
    return Object.freeze({
      result: 'BLOCKED',
      blocker: error instanceof Error ? error.message : 'PRODUCTION_STARTUP_RECOVERY_FAILED',
    });
  }
}

export async function convergeDecibelStartupRecoveryV1<TSnapshot>(
  input: Readonly<{
    ensureAuthenticated: () => Promise<void>;
    readAuthenticatedSnapshot: () => Promise<TSnapshot>;
    reconcileJournal: (snapshot: TSnapshot) => Promise<void>;
    recoverSession: () => Promise<number>;
  }>,
): Promise<Readonly<{ result: 'RECOVERED' | 'NOT_REQUIRED' | 'BLOCKED'; blocker: string | null }>> {
  try {
    await input.ensureAuthenticated();
    const snapshot = await input.readAuthenticatedSnapshot();
    await input.reconcileJournal(snapshot);
    await input.ensureAuthenticated();
    return recoverDecibelProductionSessionBeforeListenV1(input.recoverSession);
  } catch (error) {
    return Object.freeze({
      result: 'BLOCKED',
      blocker: error instanceof Error ? error.message : 'PRODUCTION_STARTUP_RECOVERY_FAILED',
    });
  }
}

/**
 * Wraps a callback so a call made while it is already running is ignored (the running call
 * finishes the work). Used for the "execution snapshot ready" signal: activating a session
 * re-reads the economic evidence, which rebuilds the snapshot and raised the same signal
 * again, recursing until the stack overflowed (session start, 2026-11-24 12:55 UTC).
 */
export function createDecibelReentryGuardV1(callback: () => void): () => void {
  let running = false;
  return () => {
    if (running) return;
    running = true;
    try {
      callback();
    } finally {
      running = false;
    }
  };
}

export function isDecibelExecutionCompositeReadyV1(
  Supervisor: decibel_runtime_supervisor_v1,
  sessionState: string,
  now = Date.now(),
): boolean {
  const state = Supervisor.getSnapshot(now);
  const domains = state.runtimeState.domains;
  return (
    sessionState === 'RUNNING' &&
    domains.AuthState === 'READY' &&
    domains.MarketDataState === 'READY' &&
    domains.EconomicEvidenceState === 'READY' &&
    domains.SessionState === 'READY' &&
    domains.ExecutionState === 'READY' &&
    state.executionSnapshot.generation === state.marketData.generation
  );
}

export function resolveDecibelStartupRecoveryBlockerV1(
  recoveryBlocker: string,
  authenticatedReadError: string | null,
): string {
  return authenticatedReadError !== null &&
    (recoveryBlocker === 'PRODUCTION_AUTHENTICATED_READ_REQUIRED' ||
      recoveryBlocker === 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT')
    ? authenticatedReadError
    : recoveryBlocker;
}

export function selectDecibelLastCompletedExecutionActionV1(
  previousAction: string | null,
  completedAction: string | null,
): string | null {
  return completedAction ?? previousAction;
}

export function startDecibelAuthenticatedBootstrapBeforeRecoveryV1(
  startAuthenticatedScheduler: () => void,
  attemptRecovery: () => void,
): void {
  startAuthenticatedScheduler();
  attemptRecovery();
}

/** A reconciliation failure must never publish the candidate as authenticated-ready. */
export function reconcileBeforeDecibelAuthenticatedPublicationV1<T>(
  Journal: decibel_execution_lifecycle_journal_v1,
  candidate: decibel_production_live_snapshot_v1,
  publish: () => T,
): T {
  reconcileDecibelAcknowledgedTerminalOrdersV1(Journal, candidate);
  return publish();
}

export async function ensureDecibelRecoveryAuthenticatedStateV1(
  Supervisor: decibel_runtime_supervisor_v1,
  refreshAuthenticatedState: () => Promise<void>,
  now: () => number = Date.now,
): Promise<void> {
  if (!Supervisor.isAuthenticatedStateReady(now())) await refreshAuthenticatedState();
  if (!Supervisor.isAuthenticatedStateReady(now()))
    throw new Error(
      Supervisor.getAuthenticatedEvidenceDiagnostics(now()).blocker ??
        'PRODUCTION_AUTHENTICATED_STATE_INITIALIZATION_REQUIRED',
    );
}

export async function runDecibelProductionWebBoundedDependencyV1<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutCode: string,
): Promise<Readonly<{ value: T | null; blocker: string | null }>> {
  let Timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const value = await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        Timer = setTimeout(() => reject(new Error(timeoutCode)), timeoutMs);
      }),
    ]);
    return Object.freeze({ value, blocker: null });
  } catch (error) {
    return Object.freeze({
      value: null,
      blocker: error instanceof Error ? error.message : timeoutCode,
    });
  } finally {
    if (Timer !== null) clearTimeout(Timer);
  }
}

export async function listenDecibelProductionWebBeforeExternalInitV1(
  Server: HTTPServer,
  host: string,
  port: number,
  afterReady: () => void,
): Promise<void> {
  await new Promise<void>((resolveListen, rejectListen) => {
    Server.once('error', rejectListen);
    Server.listen(port, host, () => {
      resolveListen();
      afterReady();
    });
  });
}

export type decibel_production_web_startup_overrides_v1 = Readonly<{
  refreshEconomicEvidence?: typeof refreshDecibelProductionEconomicEvidenceV1;
}>;

/** The market owner publishes venue observations without depending on account
 * bootstrap. Authenticated recovery has its own existing bounded scheduler. */
export async function refreshDecibelProductionMarketDataV1(
  Source: Pick<
    DecibelProductionLiveStateSourceV1,
    'readPublicMarketState' | 'readMarketDataDiagnostics'
  >,
  Supervisor: decibel_runtime_supervisor_v1,
  RawStore: decibel_raw_ws_bbo_store_v1,
  maximumAgeMs: number,
  getNow: () => number = Date.now,
) {
  const generation = Supervisor.getMarketDataProjection().generation;
  if (!Source.readPublicMarketState) {
    Supervisor.setMarketDataBlocked('PRODUCTION_PUBLIC_MARKET_SOURCE_REQUIRED');
    throw new Error('PRODUCTION_PUBLIC_MARKET_SOURCE_REQUIRED');
  }
  try {
    const market = await Source.readPublicMarketState();
    Supervisor.setMarketDataSnapshot(market, market.observedAt, maximumAgeMs);
    if (Supervisor.getSnapshot(getNow()).runtimeState.domains.MarketDataState !== 'READY')
      throw new Error('PRODUCTION_LIVE_SOURCE_BOOK_STALE');
    const published = Supervisor.getMarketDataSnapshot<typeof market>();
    if (published !== market) return published;
    const regimeRows = [
      ...RawStore.readFresh(getNow())
        .slice(-119)
        .map((row) => ({
          at: row.timestamp,
          midpoint: (row.bestBid + row.bestAsk) / 2,
          bestBid: row.bestBid,
          bestAsk: row.bestAsk,
          bestBidSize: null,
          bestAskSize: null,
          microprice: null,
          topBookImbalance: null,
          recentTradeIntensity: null,
        })),
      {
        at: market.observedAt,
        midpoint: (market.bestBid + market.bestAsk) / 2,
        bestBid: market.bestBid,
        bestAsk: market.bestAsk,
        bestBidSize: null,
        bestAskSize: null,
        microprice: null,
        topBookImbalance: null,
        recentTradeIntensity: null,
      },
    ];
    RawStore.append({
      timestamp: market.observedAt,
      ...(market.venueTimestamp === undefined ? {} : { venueTimestamp: market.venueTimestamp }),
      bestBid: market.bestBid,
      bestAsk: market.bestAsk,
      regime: classifyDecibelOperationalMarketRegimeV1(regimeRows, 0).regime,
      source: 'DECIBEL_WS_BBO',
    });
    return market;
  } catch (error) {
    Supervisor.setMarketDataBlocked(
      error instanceof Error ? error.message : 'PRODUCTION_MARKET_DATA_READ_TRANSIENT',
      Source.readMarketDataDiagnostics?.(),
      generation,
    );
    throw new Error('PRODUCTION_MARKET_DATA_READ_TRANSIENT', { cause: error });
  }
}

export function formatDecibelProductionWebProcessLifecycleV1(
  event: 'STARTED' | 'BEFORE_EXIT' | 'EXIT',
  processId: number,
  instanceId: string,
  exitCode?: number,
): string {
  return `DECIBEL_PRODUCTION_WEB_PROCESS=${event} PROCESS_ID=${processId} INSTANCE_ID=${instanceId}${exitCode === undefined ? '' : ` EXIT_CODE=${exitCode}`}`;
}
