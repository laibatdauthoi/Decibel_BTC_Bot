import { readDecibelOverviewLifetimeTotalsV1 } from './decibel_lifetime_totals_v1.js';
import { installDecibelProcessErrorPolicyV1 } from './decibel_process_error_policy_v1.js';
import { DECIBEL_PRODUCTION_MUTATION_BUDGET_V1 } from './decibel_production_live_configuration_v1.js';
import {
  projectDecibelStrategyStatusV1,
  type decibel_strategy_status_v1,
} from './decibel_strategy_status_v1.js';
import { deriveDecibelEntryCycleV1 } from './decibel_entry_cycle_v1.js';
import { runDecibelStartupRetentionV1 } from './decibel_data_retention_v1.js';
import Database from 'better-sqlite3';
import {
  DECIBEL_REPLACEMENT_FOLLOW_UP_IDLE_V1,
  planDecibelReplacementFollowUpV1,
} from './decibel_replacement_follow_up_v1.js';
import { calculateDecibelPreferredEntrySizeUsdV1 } from './decibel_entry_size_v1.js';
import { validateSettingsCapitalMarginV1 } from './settings_capital_margin_v1.js';
import { readDecibelOverviewSessionCountV1 } from './decibel_overview_metrics_v1.js';
import { validateDecibelFinalMakerAdmissionV1 } from './decibel_final_maker_admission_v1.js';
import { getDecibelPositionReductionNotionalLimitV1 } from './decibel_session_capacity_projection_v1.js';
import { runDecibelAuthenticatedStartAdmissionV1 } from './decibel_start_admission_v1.js';
import {
  mergeDecibelVenueReconciliationSnapshotV1,
  projectDecibelVenueDecisionSnapshotV1,
} from './decibel_venue_reconciliation_snapshot_v1.js';
import { readDecibelSessionCapacityProjectionV1 } from './decibel_session_capacity_projection_v1.js';
import { decibel_authenticated_refresh_retry_v1 } from './decibel_authenticated_refresh_retry_v1.js';
import { type trading_decision_v1 } from './decibel_trading_decision_v1.js';
import dotenv from 'dotenv';
import {
  collectDecibelSecretValuesV1,
  installDecibelConsoleRedactionV1,
} from './decibel_secret_redaction_v1.js';
import {
  assessDecibelProtectiveRecoveryV1,
  assertDecibelProtectiveIntentV1,
  assertDecibelRecoveryIntentV1,
  assertDecibelExposureRecoveryCompleteV1,
} from './decibel_protective_recovery_admission_v1.js';

import {
  finalizeDecibelVerifiedSessionV1,
  assertDecibelSessionMutationOwnerV1,
  recoverDecibelProductionSessionBeforeListenV1,
  convergeDecibelStartupRecoveryV1,
  isDecibelExecutionCompositeReadyV1,
  resolveDecibelStartupRecoveryBlockerV1,
  selectDecibelLastCompletedExecutionActionV1,
  startDecibelAuthenticatedBootstrapBeforeRecoveryV1,
  reconcileBeforeDecibelAuthenticatedPublicationV1,
  ensureDecibelRecoveryAuthenticatedStateV1,
  listenDecibelProductionWebBeforeExternalInitV1,
  refreshDecibelProductionMarketDataV1,
  formatDecibelProductionWebProcessLifecycleV1,
  type decibel_production_web_startup_overrides_v1,
} from './decibel_production_web_helpers_v1.js';
import { emitDecibelControlLoopLogV1 } from './decibel_control_loop_log_v1.js';
import { createDecibelDashboardAuthFromEnvironmentV1 } from './decibel_dashboard_auth_v1.js';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';
import { DECIBEL_SUBACCOUNT_SWITCH_EXIT_CODE_V1 } from './decibel_wallet_workspace_v1.js';
import {
  handleDecibelProductionWebRequestV1,
  type authenticated_account_state,
} from './decibel_production_web_routes_v1.js';

dotenv.config();
// SDK request errors include the node API key; redact all console output in this process.
installDecibelConsoleRedactionV1(collectDecibelSecretValuesV1(process.env));

import { existsSync, statSync, readFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createServer, type ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import {
  assertDecibelProductionNodeRuntimeV1,
  decibel_process_forensics_v1,
  isDecibelProcessPresentV1,
  readDecibelWindowsProcessIdentityV1,
  resolveDecibelProductionForensicsPathV1,
} from './decibel_process_forensics_v1.js';

import {
  decibel_operator_settings_store_v1,
  deriveDecibelSessionTradingLimitsV1,
  validateDecibelCapitalAllocationV1,
  type decibel_operator_settings_values_v1,
} from './decibel_operator_settings_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import {
  execution_preflight_rejection_v1,
  type execution_intent_v1,
} from './decibel_execution_intent_v1.js';
import {
  synchronizeDecibelSessionAccountingV1,
  requestDecibelSessionMaxLossUnwindV1,
  requestDecibelSessionTargetUnwindV1,
  isDecibelTargetUnwindReasonV1,
  selectDecibelSubmissionSessionStateV1,
} from './decibel_session_accounting_v1.js';
import { loadDecibelProductionExecutorV1 } from './decibel_production_execution_v1.js';
import { decibel_production_session_controller_v1 } from './decibel_production_session_controller_v1.js';
import {
  decibel_production_session_store_v1,
  type decibel_production_session_record_v1,
} from './decibel_production_session_v1.js';

import {
  mapDecibelProductionWebTelemetryV1,
  reconcileAllDecibelAcknowledgedOrdersV1,
  reconcileDecibelActiveIdentityConflictV1,
  reconcileDecibelAcknowledgedTerminalOrdersV1,
  readDecibelProductionWebHistoryV1,
  type decibel_production_web_telemetry_v1,
} from './decibel_production_web_telemetry_v1.js';
import {
  parseDecibelProductionLiveConfigurationV1,
  decibel_production_live_orchestrator_v1,
  isDecibelHttpRateLimitErrorV1,
  isTransientDecibelAuthenticatedReadErrorV1,
} from './decibel_production_live_orchestrator_v1.js';
import type {
  DecibelProductionLiveStateSourceV1,
  decibel_production_live_snapshot_v1,
} from './decibel_production_live_types_v1.js';
import { hydrateDecibelProductionRawWsBboStoreV1 } from './decibel_adverse_selection_evidence_v1.js';
import { createDecibelProductionLiveStateSourceV1 } from './decibel_production_live_state_source_v1.js';
import { validateDecibelProductionEconomicEvidenceV1 } from './decibel_production_live_state_source_v1.js';
import { wrapDecibelProductionLiveStateSourceV1 } from './decibel_production_live_state_source_adapter_v1.js';
import {
  getDecibelProductionEconomicPostSuccessDelayV1,
  resolveDecibelProductionEconomicColdStartV1,
  readDecibelProductionEconomicComponentStatesV1,
  hydrateDecibelProductionEconomicEvidenceV1,
  refreshDecibelProductionEconomicEvidenceV1,
} from './decibel_production_economic_refresh_v1.js';
import {
  assertDecibelHTTPReadAllowedV1,
  enterDecibelHTTPReadBackoffForErrorV1,
  getDecibelHTTPReadBackoffUntilV1,
} from './decibel_http_read_backoff_v1.js';
import {
  carryDecibelCycleDerivedFieldsV1,
  publishDecibelRuntimeSnapshotV1,
  selectNewestDecibelRuntimeSnapshotV1,
} from './decibel_runtime_snapshot_owner_v1.js';
import {
  decibel_runtime_supervisor_v1,
  readDecibelSupervisorAuthenticatedSnapshotV1,
} from './decibel_runtime_supervisor_v1.js';
import {
  DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1,
  DECIBEL_PRODUCTION_LIFECYCLE_COST_ENTRY_BPS_V1,
} from './decibel_smart_ladder_v1.js';
import { resolveDecibelProductionEconomicStorePathsV1 } from './decibel_adverse_selection_evidence_v1.js';
import {
  assertDecibelPersistedExecutionModeV1,
  executionModesEqualV1,
  formatDecibelPersistedExecutionModeV1,
  loadDecibelPersistedExecutionModeV1,
  readDecibelEnvironmentExecutionModeV1,
} from './decibel_persisted_execution_mode_v1.js';
import { calculateDecibelSourceBuildFingerprintV1 } from './decibel_source_build_fingerprint_v1.js';

const ProcessStartedAt = Date.now();
const ProcessInstanceId =
  process.env.DECIBEL_PROCESS_INSTANCE_ID ?? `${process.pid}-${ProcessStartedAt}`;
const LauncherPid = Number(process.env.DECIBEL_PROCESS_LAUNCHER_PID ?? '');
const RuntimeForensics = new decibel_process_forensics_v1(
  resolveDecibelProductionForensicsPathV1(process.env),
  {
    launcherPid: Number.isSafeInteger(LauncherPid) && LauncherPid > 0 ? LauncherPid : null,
    parentPid: process.ppid,
    nodePid: process.pid,
    instanceId: ProcessInstanceId,
  },
);
const LoadedSourceFingerprint = calculateDecibelSourceBuildFingerprintV1();

function readBuildFingerprint(): Readonly<{
  buildId: string;
  processStart: number;
  sourceBuildTimestamp: number;
  restartRequired: boolean;
}> {
  const current = calculateDecibelSourceBuildFingerprintV1();
  return Object.freeze({
    buildId: LoadedSourceFingerprint.buildId,
    processStart: ProcessStartedAt,
    sourceBuildTimestamp: current.sourceBuildTimestamp,
    restartRequired:
      current.buildId !== LoadedSourceFingerprint.buildId ||
      current.sourceBuildTimestamp > ProcessStartedAt,
  });
}

const WebEnvironmentSchema = z.object({
  DECIBEL_PRODUCTION_WEB_HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  DECIBEL_PRODUCTION_WEB_PORT: z.coerce.number().int().min(1024).max(65_535).default(4173),
  DECIBEL_PRODUCTION_WEB_REFRESH_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),
  DECIBEL_PRODUCTION_WEB_ECONOMIC_BOOTSTRAP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(15_000),
  DECIBEL_OPERATOR_SETTINGS_PATH: z
    .string()
    .min(1)
    .default('config/production_state/decibel_operator_settings_v1.json'),
  DECIBEL_PRODUCTION_SESSION_STORE_PATH: z
    .string()
    .min(1)
    .default('config/production_state/decibel_production_sessions_v1.sqlite'),
});

/**
 * For a stack overflow, the top frames of the innermost one (the message alone never said
 * which code recursed: 9 occurrences 2026-11-05..14, all during network outages). URLs are
 * redacted; other errors return an empty string.
 */
export function describeDecibelStackOverflowFramesV1(error: unknown): string {
  let current: unknown = error;
  let overflow: Error | null = null;
  for (let depth = 0; current instanceof Error && depth < 8; depth += 1) {
    if (current instanceof RangeError && /call stack/i.test(current.message)) overflow = current;
    current = current.cause;
  }
  if (overflow?.stack === undefined) return '';
  const frames = overflow.stack
    .split('\n')
    .slice(1, 9)
    .map((line) => line.trim().replace(/https?:\/\/\S+/gi, '[URL]'));
  return ` STACK=${JSON.stringify(frames)}`;
}

function describeAuthenticatedReadFailure(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && messages.length < 8) {
    messages.push(current.message);
    current = current.cause;
  }
  const stage = messages.find((message) =>
    message.startsWith('PRODUCTION_AUTHENTICATED_READ_STAGE:'),
  );
  const detail = messages.at(-1) ?? 'UNKNOWN_AUTHENTICATED_READ_ERROR';
  const safeDetail = detail
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/(authorization|private[_-]?key|token|secret)\s*[:=]\s*\S+/gi, '$1=[REDACTED]');
  return stage === undefined
    ? `${messages[0] ?? 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT'}:${safeDetail}`
    : `${stage}:${safeDetail}`;
}

/** Control cycles a Ctrl+C pause may run to cancel resting entries before the process exits. */
const DECIBEL_SHUTDOWN_PAUSE_MAXIMUM_CYCLES_V1 = 6;

export async function runDecibelProductionWebV1(
  environment: NodeJS.ProcessEnv,
  sourceOverride?: DecibelProductionLiveStateSourceV1,
  startupOverrides: decibel_production_web_startup_overrides_v1 = {},
): Promise<void> {
  console.log('DECIBEL_PRODUCTION_WEB_STARTUP=ENTRY');
  const EventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  EventLoopDelay.enable();
  const web = WebEnvironmentSchema.parse(environment);
  const LoadedExecutionMode = loadDecibelPersistedExecutionModeV1(environment);
  assertDecibelPersistedExecutionModeV1(LoadedExecutionMode.environment, LoadedExecutionMode.mode);
  const readEffectiveBuildFingerprint = () => {
    const build = readBuildFingerprint();
    let environmentModeChanged: boolean;
    try {
      environmentModeChanged = !executionModesEqualV1(
        LoadedExecutionMode.mode,
        readDecibelEnvironmentExecutionModeV1(LoadedExecutionMode.path),
      );
    } catch {
      environmentModeChanged = true;
    }
    return Object.freeze({
      ...build,
      restartRequired: build.restartRequired || environmentModeChanged,
    });
  };
  const RawWsBboStore = hydrateDecibelProductionRawWsBboStoreV1(environment);
  let economicRefreshInFlight = false;
  const economicComponentsInFlight = new Set<string>();
  const economicRetryCounts = new Map<string, number>();
  let economicSchedulerStopped = false;
  const RuntimeSupervisor = new decibel_runtime_supervisor_v1();
  let synchronizeEconomicSnapshot: (now?: number) => boolean = () => false;
  let launcherMissingRecorded = false;
  const scheduleEconomicRefresh = (delayMs: number): void => {
    if (economicSchedulerStopped || RuntimeSupervisor.hasScheduled('economic-refresh')) return;
    RuntimeSupervisor.scheduleOnce('economic-refresh', delayMs, refreshEconomicEvidence);
  };
  const refreshEconomicEvidence = async (): Promise<void> => {
    if (SessionController.getState().takeover.state === 'WAITING_FOR_LEGACY_PID') {
      scheduleEconomicRefresh(5_000);
      return;
    }
    if (economicRefreshInFlight) {
      scheduleEconomicRefresh(1_000);
      return;
    }
    const components = readDecibelProductionEconomicComponentStatesV1(environment);
    const componentsToRefresh = components
      .filter((component) => component.required && component.status !== 'READY')
      .map((component) => component.component);
    const observedAtBefore = new Map(
      components.map((component) => [component.component, component.observedAt]),
    );
    if (componentsToRefresh.some((component) => economicComponentsInFlight.has(component))) return;
    for (const component of componentsToRefresh) economicComponentsInFlight.add(component);
    economicRefreshInFlight = true;
    console.log(
      `DECIBEL_PRODUCTION_ECONOMIC_REFRESH=START COMPONENTS=${componentsToRefresh.join(',') || 'PROACTIVE'}`,
    );
    try {
      const evidence = await (
        startupOverrides.refreshEconomicEvidence ?? refreshDecibelProductionEconomicEvidenceV1
      )(environment, {
        rawWsBboStore: RawWsBboStore,
        onLocalEvidence: () => {
          synchronizeEconomicSnapshot();
        },
      });
      for (const component of componentsToRefresh) economicRetryCounts.delete(component);
      if (!synchronizeEconomicSnapshot())
        throw new Error(
          RuntimeSupervisor.getSnapshot().runtimeState.domainBlockers.EconomicEvidenceState ??
            'PRODUCTION_ECONOMIC_SNAPSHOT_REQUIRED',
        );
      console.log(
        `DECIBEL_PRODUCTION_ECONOMIC_REFRESH=PASS APT_USD_SOURCE=${evidence.aptUsdSource} APT_USD_AGE_MS=${evidence.aptUsdAgeMs} APT_USD_TTL_MS=${evidence.aptUsdMaximumAgeMs}`,
      );
      scheduleEconomicRefresh(
        getDecibelProductionEconomicPostSuccessDelayV1(environment, observedAtBefore),
      );
    } catch (error) {
      const remaining = readDecibelProductionEconomicComponentStatesV1(environment).filter(
        (component) => component.required && component.status !== 'READY',
      );
      synchronizeEconomicSnapshot();
      for (const component of componentsToRefresh) {
        if (remaining.some((state) => state.component === component))
          economicRetryCounts.set(component, (economicRetryCounts.get(component) ?? 0) + 1);
        else economicRetryCounts.delete(component);
      }
      const retrySummary = componentsToRefresh
        .map((component) => `${component}:${economicRetryCounts.get(component) ?? 0}`)
        .join(',');
      console.error(
        `DECIBEL_PRODUCTION_ECONOMIC_REFRESH=FAIL RETRY_COUNTS=${retrySummary || 'NONE'} BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}${describeDecibelStackOverflowFramesV1(error)}`,
      );
      const maximumRetryCount = Math.max(1, ...economicRetryCounts.values());
      const retryDelayMs = Math.min(60_000, 5_000 * 2 ** Math.min(4, maximumRetryCount - 1));
      scheduleEconomicRefresh(retryDelayMs);
    } finally {
      for (const component of componentsToRefresh) economicComponentsInFlight.delete(component);
      economicRefreshInFlight = false;
    }
  };
  const configuration = parseDecibelProductionLiveConfigurationV1(environment);
  const configuredCapital = Number(
    environment.DECIBEL_PRODUCTION_CAPITAL_TO_USE_USD ??
      environment.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD ??
      '100',
  );
  const initialSettings: decibel_operator_settings_values_v1 = Object.freeze({
    capitalToUseUsd: configuredCapital,
    maxLossUsd: Number(environment.DECIBEL_PRODUCTION_MAX_DRAWDOWN_USD ?? configuredCapital),
    targetMakerVolumeUsd: Number(environment.DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD ?? '-1'),
  });
  const SettingsStore = new decibel_operator_settings_store_v1(
    web.DECIBEL_OPERATOR_SETTINGS_PATH,
    initialSettings,
  );
  SettingsStore.read();
  // Keep the 30 most recent sessions and their decision snapshots (no VACUUM at startup).
  runDecibelStartupRetentionV1(
    () => ({
      sessionDb: new Database(web.DECIBEL_PRODUCTION_SESSION_STORE_PATH),
      journalDb: new Database(resolve(configuration.journalPath)),
    }),
    (line) => console.log(line),
  );
  const SessionStore = new decibel_production_session_store_v1(
    web.DECIBEL_PRODUCTION_SESSION_STORE_PATH,
  );
  const TelemetryJournal = new decibel_execution_lifecycle_journal_v1(
    resolve(configuration.journalPath),
  );
  let execution: {
    running: boolean;
    sessionId: string | null;
    cycles: number;
    lastAction: string | null;
    blocker: string | null;
    tradingDecision?: trading_decision_v1 | null;
    strategy?: decibel_strategy_status_v1 | null;
  } = {
    running: false,
    sessionId: null as string | null,
    cycles: 0,
    lastAction: null as string | null,
    blocker: null as string | null,
  };
  let snapshotOwnerRevision = 0;
  let snapshot: decibel_production_live_snapshot_v1 | null = null;
  let lastSuccessfulCycleAt: number | null = null;
  let authenticatedObservedAt: number | null = null;
  let connectionError: string | null = null;
  let lastAuthenticatedReadError: string | null = null;
  let startupRecoveryResult = 'NOT_ATTEMPTED';
  const Source = sourceOverride ?? createDecibelProductionLiveStateSourceV1({ environment });
  if (sourceOverride === undefined) {
    if (Source.assertAuthenticatedTransport === undefined)
      throw new Error('PRODUCTION_AUTHENTICATED_TRANSPORT_ASSERTION_REQUIRED');
    const transport = await Source.assertAuthenticatedTransport();
    console.log(
      `DECIBEL_PRODUCTION_AUTH_TRANSPORT=${transport.transportId} ENDPOINT=${transport.baseUrl}`,
    );
  }
  const authenticatedRefreshSafetyMarginMs = 2_000;
  let authenticatedSchedulerStopped = false;
  let notifyAuthenticatedReady = (): void => undefined;
  let notifyExecutionSnapshotReady = (): void => undefined;
  type public_market_state = Awaited<
    ReturnType<NonNullable<DecibelProductionLiveStateSourceV1['readPublicMarketState']>>
  >;
  const publishSnapshot = (
    candidate: decibel_production_live_snapshot_v1 | null,
    ownerRevision: number,
  ): decibel_production_live_snapshot_v1 | null => {
    snapshot = publishDecibelRuntimeSnapshotV1(
      snapshot,
      candidate,
      ownerRevision,
      snapshotOwnerRevision,
    );
    return snapshot;
  };
  const rebuildExecutionSnapshotFromPublishedComponents = (): void => {
    const base = snapshot;
    const authenticated = RuntimeSupervisor.getAuthenticatedSnapshot<authenticated_account_state>();
    const market = RuntimeSupervisor.getMarketDataSnapshot<public_market_state>();
    const marketProjection = RuntimeSupervisor.getMarketDataProjection();
    const economic = RuntimeSupervisor.getEconomicSnapshot();
    if (base === null || authenticated === null || market === null) return;
    const venue = authenticated.venueSnapshot ?? base;
    const now = Math.max(authenticated.observedAt, market.observedAt, venue.input.now);
    snapshot = projectDecibelVenueDecisionSnapshotV1(
      base,
      venue,
      market,
      economic,
      execution.sessionId ?? base.input.sessionId,
      now,
    );
    RuntimeSupervisor.setExecutionSnapshot(snapshot, marketProjection.generation);
    notifyExecutionSnapshotReady();
  };
  synchronizeEconomicSnapshot = (now = Date.now()): boolean => {
    const paths = resolveDecibelProductionEconomicStorePathsV1(environment);
    let document: unknown = null;
    try {
      document = JSON.parse(readFileSync(paths.evidencePath, 'utf8'));
    } catch {
      /* Validation below remains fail-closed. */
    }
    // Component readiness and full schema/provenance validation inspect the
    // same read, so a concurrent publisher cannot mix two economic documents.
    const components = readDecibelProductionEconomicComponentStatesV1(environment, now, document);
    const missing = components.find(
      (component) => component.required && component.status !== 'READY',
    );
    if (missing !== undefined) {
      RuntimeSupervisor.clearEconomicSnapshot(
        `PRODUCTION_ECONOMIC_SNAPSHOT_MISSING_${missing.component}_${missing.status}`,
      );
      return false;
    }
    const maximumAgeMs = Number(
      environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS ?? 3_600_000,
    );
    const validation = validateDecibelProductionEconomicEvidenceV1(
      paths.evidencePath,
      now,
      maximumAgeMs,
      document,
    );
    const evidence = validation.evidence;
    if (evidence === null || evidence.aptUsd === undefined || evidence.aptUsdSource === undefined) {
      RuntimeSupervisor.clearEconomicSnapshot(
        `PRODUCTION_ECONOMIC_SNAPSHOT_MISSING_${validation.reason ?? (evidence?.aptUsd === undefined ? 'APT_USD' : 'APT_USD_SOURCE')}`,
      );
      return false;
    }
    RuntimeSupervisor.setEconomicSnapshot(
      Object.freeze({
        observedAt: Math.min(
          evidence.makerFeeObservedAt ?? evidence.observedAt,
          evidence.gasCostObservedAt ?? evidence.observedAt,
          evidence.aptUsdObservedAt ?? evidence.observedAt,
        ),
        makerFeeBps: evidence.makerFeeBps,
        makerFeeSource: evidence.makerFeeSource,
        estimatedGasCostUsd: evidence.conservativeGasCostUsd,
        estimatedGasCostSource: evidence.gasCostSource,
        aptUsd: evidence.aptUsd,
        aptUsdSource: evidence.aptUsdSource,
        adverseSelectionBufferBps: evidence.adverseSelectionBufferBps ?? null,
        adverseSelectionSource: evidence.adverseSelectionSource ?? 'UNKNOWN',
        safetyMarginBps: Number(environment.DECIBEL_PRODUCTION_EDGE_SAFETY_MARGIN_BPS ?? 1),
        lifecycleCostBudgetBps: DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1,
        lifecycleCostEntryBps: DECIBEL_PRODUCTION_LIFECYCLE_COST_ENTRY_BPS_V1,
        candidateAdverseSelection: evidence.candidateAdverseSelection ?? [],
      }),
    );
    rebuildExecutionSnapshotFromPublishedComponents();
    return RuntimeSupervisor.getEconomicSnapshot() !== null;
  };
  const scheduleAuthenticatedRefresh = (delayOverrideMs?: number): void => {
    if (authenticatedSchedulerStopped) return;
    RuntimeSupervisor.cancelScheduled('authenticated-refresh');
    const deadline = RuntimeSupervisor.getAuthenticatedRefreshDeadline(
      authenticatedRefreshSafetyMarginMs,
    );
    const delayMs = delayOverrideMs ?? (deadline === null ? 0 : Math.max(0, deadline - Date.now()));
    RuntimeSupervisor.scheduleOnce('authenticated-refresh', delayMs, () =>
      refreshAuthenticatedComponents().then(() => undefined),
    );
  };
  const publishAuthenticatedSnapshot = (
    candidate: decibel_production_live_snapshot_v1,
    ownerRevision: number,
  ): void => {
    const selected = selectNewestDecibelRuntimeSnapshotV1(
      snapshot,
      candidate,
      ownerRevision,
      snapshotOwnerRevision,
    );
    // A venue read carries no cycle-derived fields: keep the latest cycle's.
    const authoritative =
      selected !== null && snapshot !== null && selected !== snapshot
        ? carryDecibelCycleDerivedFieldsV1(selected, snapshot)
        : selected;
    if (authoritative === null) throw new Error('AUTHENTICATED_SNAPSHOT_PUBLICATION_FAILED');
    if (
      authoritative.accountMetrics === undefined ||
      authoritative.authenticatedPositions === undefined
    )
      throw new Error('AUTHENTICATED_ACCOUNT_STATE_PUBLICATION_REQUIRED');
    const authenticatedAccountState = Object.freeze({
      observedAt: authoritative.venueReadWindow?.account.startedAt ?? authoritative.input.now,
      availableMarginUsd: authoritative.availableMarginUsd,
      accountMetrics: authoritative.accountMetrics,
      authenticatedPositions: authoritative.authenticatedPositions,
      actualInventoryBase: authoritative.input.actualInventoryBase,
      openOrders: authoritative.input.openOrders,
      venueSnapshot: authoritative,
    });
    reconcileBeforeDecibelAuthenticatedPublicationV1(TelemetryJournal, authoritative, () => {
      snapshot = authoritative;
      authenticatedObservedAt = authenticatedAccountState.observedAt;
      RuntimeSupervisor.setAuthenticatedSnapshot(
        authenticatedObservedAt,
        5_000,
        authenticatedAccountState,
      );
    });
    RuntimeSupervisor.setAuthenticatedInventory(
      authenticatedAccountState.actualInventoryBase,
      authoritative.input.metadata.minimumSize,
    );
    rebuildExecutionSnapshotFromPublishedComponents();
    RuntimeSupervisor.clearTransientBlocker();
    lastAuthenticatedReadError = null;
    connectionError = null;
    scheduleAuthenticatedRefresh();
    notifyAuthenticatedReady();
  };
  const publishAuthenticatedAccountState = (candidate: authenticated_account_state): void => {
    if (authenticatedObservedAt !== null && candidate.observedAt < authenticatedObservedAt) return;
    if (candidate.venueSnapshot === undefined)
      throw new Error('AUTHENTICATED_BATCH_PUBLICATION_REQUIRED');
    const venueSnapshot = candidate.venueSnapshot;
    reconcileBeforeDecibelAuthenticatedPublicationV1(TelemetryJournal, venueSnapshot, () => {
      snapshot = venueSnapshot;
      authenticatedObservedAt = candidate.observedAt;
      RuntimeSupervisor.setAuthenticatedSnapshot(authenticatedObservedAt, 5_000, candidate);
    });
    RuntimeSupervisor.setAuthenticatedInventory(
      candidate.actualInventoryBase,
      snapshot?.input.metadata.minimumSize ??
        RuntimeSupervisor.getSnapshot().inventory.marketMinimumSize,
    );
    rebuildExecutionSnapshotFromPublishedComponents();
    RuntimeSupervisor.clearTransientBlocker();

    lastAuthenticatedReadError = null;
    connectionError = null;
    scheduleAuthenticatedRefresh();
    notifyAuthenticatedReady();
  };
  const AuthenticatedRefreshRetry = new decibel_authenticated_refresh_retry_v1();
  const refreshAuthenticatedComponents = (): Promise<authenticated_account_state> =>
    RuntimeSupervisor.runAuthenticatedRefresh(async (signal) => {
      const ownerRevision = snapshotOwnerRevision;
      try {
        assertDecibelHTTPReadAllowedV1();
        if (snapshot === null) {
          const complete = await Source.readAuthenticatedSnapshot(signal);
          signal.throwIfAborted();
          publishAuthenticatedSnapshot(complete, ownerRevision);
          AuthenticatedRefreshRetry.resetAfterSuccess();
          const published =
            RuntimeSupervisor.getAuthenticatedSnapshot<authenticated_account_state>();
          if (published === null) throw new Error('AUTHENTICATED_SNAPSHOT_PUBLICATION_FAILED');
          return published;
        }
        if (Source.readAuthenticatedAccountState === undefined)
          throw new Error('PRODUCTION_AUTHENTICATED_ACCOUNT_SOURCE_REQUIRED');
        const activeSession = SessionStore.getActive();
        const [candidate, fills] = await Promise.all([
          Source.readAuthenticatedAccountState(signal),
          activeSession === null
            ? Promise.resolve(null)
            : (Source.readAuthenticatedFillLedger?.(activeSession.createdAt, signal) ??
              Promise.reject(new Error('SESSION_AUTHENTICATED_FILL_SOURCE_REQUIRED'))),
        ]);
        signal.throwIfAborted();
        if (ownerRevision !== snapshotOwnerRevision)
          throw new Error('AUTHENTICATED_REFRESH_OWNER_SUPERSEDED');
        const venueSnapshot = mergeDecibelVenueReconciliationSnapshotV1(snapshot, candidate, fills);
        if (venueSnapshot === null) throw new Error('AUTHENTICATED_REFRESH_OWNER_SUPERSEDED');
        const published = Object.freeze({
          ...candidate,
          observedAt: candidate.readWindow?.startedAt ?? candidate.observedAt,
          venueSnapshot,
        });
        publishAuthenticatedAccountState(published);
        AuthenticatedRefreshRetry.resetAfterSuccess();
        return published;
      } catch (error) {
        signal.throwIfAborted();
        const retry = AuthenticatedRefreshRetry.recordFailure(
          describeAuthenticatedReadFailure(error),
        );
        if (
          isDecibelHttpRateLimitErrorV1(error) ||
          (error instanceof Error && error.message === 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED')
        ) {
          const deadline = enterDecibelHTTPReadBackoffForErrorV1(
            error,
            configuration.rateLimitBackoffMs,
          );
          RuntimeSupervisor.setFiniteCooldown(
            'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
            deadline,
            'HTTP_BACKOFF_EXPIRES',
          );
          lastAuthenticatedReadError = 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED';
          scheduleAuthenticatedRefresh(Math.max(1, deadline - Date.now()));
        } else {
          lastAuthenticatedReadError =
            error instanceof Error ? error.message : 'WEB_AUTHENTICATED_READ_FAILED';
          scheduleAuthenticatedRefresh(retry.delayMs);
        }
        const transportDiagnostics = await Source.readAuthenticatedTransportDiagnostics?.().catch(
          () => undefined,
        );
        signal.throwIfAborted();
        if (retry.shouldLog)
          console.error(
            `DECIBEL_PRODUCTION_AUTH_REFRESH=FAILED DETAIL=${describeAuthenticatedReadFailure(error)} DIAGNOSTICS=${JSON.stringify(transportDiagnostics ?? { stage: 'UNAVAILABLE' })}${describeDecibelStackOverflowFramesV1(error)}`,
          );
        connectionError = lastAuthenticatedReadError;
        RuntimeSupervisor.setAuthenticatedReadBlocked();
        throw error;
      }
    }, configuration.readTimeoutMs).catch((error: unknown) => {
      if (!authenticatedSchedulerStopped) {
        RuntimeSupervisor.setAuthenticatedReadBlocked();
        lastAuthenticatedReadError = describeAuthenticatedReadFailure(error);
        if (!RuntimeSupervisor.hasScheduled('authenticated-refresh')) {
          const retry = AuthenticatedRefreshRetry.recordFailure(
            describeAuthenticatedReadFailure(error),
          );
          scheduleAuthenticatedRefresh(
            Math.max(getDecibelHTTPReadBackoffUntilV1() - Date.now(), retry.delayMs),
          );
        }
      }
      throw error;
    });
  const readAndPublishStrategySnapshot = async (): Promise<decibel_production_live_snapshot_v1> => {
    // Refresh under the one account/history owner, then return its complete
    // projection. Never join an account-shaped promise as a strategy snapshot.
    await refreshAuthenticatedComponents();
    if (snapshot === null) throw new Error('AUTHENTICATED_SNAPSHOT_PUBLICATION_FAILED');
    return snapshot;
  };
  const refreshMarketDataComponents = async (): Promise<public_market_state> => {
    const market = await refreshDecibelProductionMarketDataV1(
      Source,
      RuntimeSupervisor,
      RawWsBboStore,
      Number(environment.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS ?? 5_000),
    );
    if (market === null) throw new Error('PRODUCTION_MARKET_DATA_READ_REQUIRED');
    rebuildExecutionSnapshotFromPublishedComponents();
    return market;
  };
  const readExecutionSnapshotFromSupervisor = async (
    forceAuthenticatedRefresh = false,
  ): Promise<decibel_production_live_snapshot_v1> => {
    if (forceAuthenticatedRefresh) await refreshAuthenticatedComponents();
    const authenticated =
      await readDecibelSupervisorAuthenticatedSnapshotV1<authenticated_account_state>(
        RuntimeSupervisor,
        refreshAuthenticatedComponents,
      );
    rebuildExecutionSnapshotFromPublishedComponents();
    const base = RuntimeSupervisor.getExecutionSnapshot<decibel_production_live_snapshot_v1>();
    if (base === null) throw new Error('PRODUCTION_RUNTIME_SNAPSHOT_INITIALIZATION_REQUIRED');
    const market = RuntimeSupervisor.getMarketDataSnapshot<public_market_state>();
    if (
      market === null ||
      RuntimeSupervisor.getSnapshot().runtimeState.domains.MarketDataState !== 'READY'
    )
      throw new Error('PRODUCTION_MARKET_DATA_READ_REQUIRED');
    const now = Date.now();
    const current = projectDecibelVenueDecisionSnapshotV1(
      base,
      authenticated.venueSnapshot ?? base,
      market,
      RuntimeSupervisor.getEconomicSnapshot(),
      execution.sessionId ?? base.input.sessionId,
      now,
    );
    snapshot = current;
    RuntimeSupervisor.setExecutionSnapshot(current);
    return current;
  };
  const refreshSupervisorFromAuthoritativeState = (now = Date.now()): void => {
    // The publication owner above performs every component freshness check,
    // then full schema/provenance validation, and clears evidence on failure.
    // Telemetry uses that same validator; it cannot invent its own ready state.
    synchronizeEconomicSnapshot(now);
    if (authenticatedObservedAt !== null)
      RuntimeSupervisor.setAuthenticatedSnapshot(authenticatedObservedAt, 5_000);
    const reconciliationBlocker = TelemetryJournal.getExecutionReconciliationBlocker();
    RuntimeSupervisor.setReconciliationRequired(
      reconciliationBlocker !== null,
      reconciliationBlocker ?? 'RECONCILIATION_REQUIRED',
    );
    // Telemetry and execution must project the same authenticated inventory,
    // open orders, market data, and economic evidence owned by the supervisor.
    rebuildExecutionSnapshotFromPublishedComponents();
  };
  const ControlLoopLogThrottle = { signature: '', loggedAt: 0 };
  const emitControlLoopTelemetry = (
    result: Awaited<ReturnType<decibel_production_live_orchestrator_v1['evaluateOnce']>> | null,
    currentSnapshot: decibel_production_live_snapshot_v1 | null,
    lastError: string | null = null,
  ): void =>
    emitDecibelControlLoopLogV1(
      {
        sessionStore: SessionStore,
        journal: TelemetryJournal,
        configuration,
        execution,
        lastAuthenticatedReadError,
        lastSuccessfulCycleAt,
        throttle: ControlLoopLogThrottle,
      },
      result,
      currentSnapshot,
      lastError,
    );
  const clearCompletedSessionProjection = (): void => {
    execution = {
      ...execution,
      running: false,
      sessionId: null,
      blocker: null,
      tradingDecision: null,
    };
    snapshotOwnerRevision += 1;
    snapshot = null;
    RuntimeSupervisor.clearExecutionSnapshot('PRODUCTION_AUTHENTICATED_READ_REQUIRED');
    scheduleAuthenticatedRefresh(0);
  };
  const startRuntime = async (
    session: decibel_production_session_record_v1,
    initialProtectiveRecoveryBlocker: string | null = null,
  ) => {
    let protectiveRecoveryBlocker = initialProtectiveRecoveryBlocker;
    if (shutdownStarted) throw new Error('SESSION_RUNTIME_SHUTDOWN_IN_PROGRESS');
    snapshotOwnerRevision += 1;
    const runtimeOwnerRevision = snapshotOwnerRevision;
    const venueMaximumNotionalUsd = Number(
      environment.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD ?? '100',
    );
    const sessionEnvironment = {
      ...environment,
      DECIBEL_PRODUCTION_LIVE_SESSION_ID: session.sessionId,
      DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD: String(venueMaximumNotionalUsd),
      DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD:
        session.configSnapshot.targetMakerVolumeUsd > 0
          ? String(session.configSnapshot.targetMakerVolumeUsd)
          : undefined,
      DECIBEL_PASSIVE_RECYCLING_BASELINE_VOLUME_USD: String(
        snapshot?.input.actualFillLedger.actualExternalMakerVolumeUsd ?? 0,
      ),
      DECIBEL_PRODUCTION_TUI_MAX_POSITION_BASE: undefined,
    };
    const runtimeConfiguration = parseDecibelProductionLiveConfigurationV1(sessionEnvironment);
    const readProjectedSessionSnapshot = async (
      force = false,
    ): Promise<decibel_production_live_snapshot_v1> => {
      const candidate = await readDecibelSessionCapacityProjectionV1({
        protectiveOnly: protectiveRecoveryBlocker !== null,
        readSnapshot: () => readExecutionSnapshotFromSupervisor(force),
        ...(Source.readNextSessionCapacityInputs === undefined
          ? {}
          : {
              readPracticalInputs: () => Source.readNextSessionCapacityInputs!(),
            }),
        ...(Source.readCapacityProduction === undefined
          ? {}
          : {
              readProduction: () =>
                Source.readCapacityProduction!({
                  sessionId: session.sessionId,
                  probeNotionalUsd: venueMaximumNotionalUsd,
                  manifest: TelemetryJournal.getSessionCapacityTransactionManifest(
                    session.sessionId,
                  ),
                }),
            }),
      });
      return projectSessionConfiguration(candidate);
    };
    const projectSessionConfiguration = (
      candidate: decibel_production_live_snapshot_v1,
    ): decibel_production_live_snapshot_v1 => {
      const midpoint = (candidate.input.book.bestBid + candidate.input.book.bestAsk) / 2;
      const metrics = synchronizeDecibelSessionAccountingV1(
        TelemetryJournal,
        candidate.input.actualFillLedger,
        session.sessionId,
        midpoint,
      );
      const limits = deriveDecibelSessionTradingLimitsV1({
        settings: session.configSnapshot,
        now: Date.now(),
        ...(candidate.capacityEvidence === undefined
          ? {}
          : { capacityEvidence: candidate.capacityEvidence }),
        ...(candidate.practicalCapacityInputs === undefined
          ? {}
          : { capacityInputs: candidate.practicalCapacityInputs }),
        inflightOrders: TelemetryJournal.nonTerminal().flatMap((row) => {
          const intent = TelemetryJournal.getIntent(row.intentId);
          if (
            !intent ||
            intent.action !== 'PLACE' ||
            candidate.input.openOrders.some(
              (order) =>
                order.clientOrderId === intent.clientOrderId ||
                order.venueOrderId === row.venueOrderId,
            )
          )
            return [];
          return [
            {
              side: intent.side,
              price: intent.price,
              quantity: intent.quantity,
              reduceOnly: intent.reduceOnly,
            },
          ];
        }),
        totalExecutedVolumeUsd: metrics.totalExecutedVolumeUsd,
        pnlUsd: metrics.pnlUsd,
        lotSize: candidate.input.metadata.lotSize,
        venueAvailableMarginUsd: candidate.availableMarginUsd,
        positionBase: candidate.input.actualInventoryBase,
        openOrders: candidate.input.openOrders,
        midpoint,
        maximumEffectiveLeverage: candidate.maximumEffectiveLeverage,
        venueMaximumNotionalUsd,
        maximumAggregateCollateralFraction: configuration.maximumAggregateCollateralFraction,
      });
      SessionStore.updateActiveAccounting(
        session.sessionId,
        metrics.makerVolumeUsd,
        metrics.fillCount,
        metrics.takerVolumeUsd,
        metrics.totalExecutedVolumeUsd,
      );
      const maxLossReached =
        metrics.pnlUsd !== null && metrics.pnlUsd <= -session.configSnapshot.maxLossUsd;
      const riskBlocker = maxLossReached
        ? 'SESSION_MAX_LOSS_REACHED'
        : (metrics.pnlBlocker ?? limits.capacityBlocker);
      const globalMakerVolumeUsd = candidate.input.actualFillLedger.actualExternalMakerVolumeUsd;
      const targetVolumeUsd = metrics.totalExecutedVolumeUsd;
      return Object.freeze({
        ...candidate,
        authenticatedAvailableMarginUsd: candidate.availableMarginUsd,
        strategyAllocationRemainingUsd: limits.strategyAllocationRemainingUsd,
        maximumReductionNotionalUsd: getDecibelPositionReductionNotionalLimitV1(candidate),
        reductionCapacity: Object.freeze({
          maximumQuantityBtc: Math.abs(candidate.input.actualInventoryBase),
          venueMaximumOrderNotionalUsd:
            candidate.practicalCapacityInputs?.venueMaximumOrderNotionalUsd ?? null,
          observedAt: candidate.venueReadWindow?.account.startedAt ?? candidate.input.now,
        }),
        maximumEffectiveLeverage: candidate.practicalCapacityInputs
          ? Math.min(
              candidate.maximumEffectiveLeverage,
              candidate.practicalCapacityInputs.actualLeverage ?? Number.NaN,
            )
          : candidate.maximumEffectiveLeverage,
        maximumNotionalUsd: limits.maximumOrderNotionalUsd,
        maximumAbsPositionBase: limits.maximumAbsPositionBase,
        availableMarginUsd: limits.availableMarginUsd,
        minimumNotionalUsd: Math.max(
          candidate.input.metadata.minimumSize * candidate.input.book.bestBid,
          candidate.input.metadata.minimumNotionalUsd ?? 0,
        ),
        sessionConfiguration: Object.freeze({
          preferredEntrySizeUsd: calculateDecibelPreferredEntrySizeUsdV1({
            targetTradingVolumeUsd: session.configSnapshot.targetMakerVolumeUsd,
            capitalToUseUsd: session.configSnapshot.capitalToUseUsd,
            collateralFraction: configuration.maximumAggregateCollateralFraction,
          }),
          entryCycleBlocker:
            deriveDecibelEntryCycleV1(
              TelemetryJournal.getSessionEntryCycleFills(session.sessionId),
              candidate.input.actualInventoryBase,
            ).blocker ?? null,
          revision: session.configRevision,
          capitalToUseUsd: session.configSnapshot.capitalToUseUsd,
          maxLossUsd: session.configSnapshot.maxLossUsd,
          targetMakerVolumeUsd: session.configSnapshot.targetMakerVolumeUsd,
          maxPositionUsd: limits.maximumPositionUsd,
          exposureLimits: {
            ...limits,
            riskCapacityUsd: limits.capacityDiagnostics.riskCapacityUsd,
          },
          marginUsedUsd: limits.marginUsedUsd,
          makerVolumeUsd: metrics.makerVolumeUsd,
          takerVolumeUsd: metrics.takerVolumeUsd,
          totalExecutedVolumeUsd: metrics.totalExecutedVolumeUsd,
          targetVolumeUsd,
          pnlUsd: metrics.pnlUsd,
          exitAccounting: metrics.exitAccounting,
          riskBlocker,
        }),
        input: Object.freeze({
          ...candidate.input,
          sessionId: session.sessionId,
          targetExternalMakerVolumeUsd:
            session.configSnapshot.targetMakerVolumeUsd > 0
              ? session.configSnapshot.targetMakerVolumeUsd
              : null,
          targetExternalMakerVolumeBaselineUsd: Math.max(0, globalMakerVolumeUsd - targetVolumeUsd),
        }),
      });
    };
    const RuntimeSourceBase: DecibelProductionLiveStateSourceV1 = Object.freeze({
      validateSubmission: async (intent: execution_intent_v1) => {
        assertDecibelSessionMutationOwnerV1(() => SessionController.ownsActiveRuntime());
        if (intent.action === 'CANCEL' && protectiveRecoveryBlocker !== null) {
          const fresh = await readProjectedSessionSnapshot(true);
          const proof = assessDecibelProtectiveRecoveryV1(TelemetryJournal, fresh, Date.now());
          if (!proof.allowed) throw new execution_preflight_rejection_v1(proof.blocker);
          assertDecibelRecoveryIntentV1(TelemetryJournal, intent, fresh);
          return {
            preflight: {
              tickSize: fresh.input.metadata.tickSize,
              lotSize: fresh.input.metadata.lotSize,
              minimumSize: fresh.input.metadata.minimumSize,
              minimumNotionalUsd: fresh.minimumNotionalUsd,
              maximumNotionalUsd: fresh.maximumNotionalUsd,
              currentPositionBase: fresh.input.actualInventoryBase,
              openOrders: fresh.input.openOrders,
              permittedSide: intent.side,
              bestBid: fresh.input.book.bestBid,
              bestAsk: fresh.input.book.bestAsk,
            },
            observedAt: fresh.venueReadWindow!.account.startedAt,
            assertSubmissionStillAuthorized: () =>
              assertDecibelSessionMutationOwnerV1(() => SessionController.ownsActiveRuntime()),
          };
        }
        if (
          intent.action !== 'PLACE' ||
          (intent.reduceOnly && intent.executionRole === 'SESSION_UNWIND_IOC')
        )
          return;
        const fresh = await readProjectedSessionSnapshot(true);
        assertDecibelSessionMutationOwnerV1(() => SessionController.ownsActiveRuntime());
        const protectiveProof =
          protectiveRecoveryBlocker === null
            ? null
            : assessDecibelProtectiveRecoveryV1(TelemetryJournal, fresh, Date.now());
        if (protectiveProof !== null) {
          if (!protectiveProof.allowed)
            throw new execution_preflight_rejection_v1(protectiveProof.blocker);
          assertDecibelProtectiveIntentV1(intent, fresh);
        }
        const active = SessionStore.getActive();
        const target = session.configSnapshot.targetMakerVolumeUsd;
        const reached = requestDecibelSessionTargetUnwindV1(SessionController, session.sessionId, {
          makerVolumeUsd: fresh.sessionConfiguration?.makerVolumeUsd ?? 0,
          totalExecutedVolumeUsd: fresh.sessionConfiguration?.totalExecutedVolumeUsd ?? 0,
        });
        // Reduce-only orders cannot add exposure: TP keeps working while a target drains.
        if (
          ((reached || active?.unwindRequested) && !intent.reduceOnly) ||
          active?.sessionId !== session.sessionId
        )
          throw new execution_preflight_rejection_v1('SESSION_TARGET_OR_UNWIND_PLACE_BLOCKED');
        const preflight = validateDecibelFinalMakerAdmissionV1(
          fresh,
          intent,
          {
            now: Date.now(),
            sessionId: session.sessionId,
            settingsRevision: session.configRevision,
            state: selectDecibelSubmissionSessionStateV1(active, intent.reduceOnly),
            evaluation: RuntimeOrchestrator.evaluateAuthenticatedSnapshot(fresh),
            coveragePriceAuthorization: TelemetryJournal.getCommittedCoveragePrice(
              session.sessionId,
              intent.side,
              fresh.terminalOrderEvidence ?? [],
            ),
            identityConflict: protectiveProof?.unrelatedIntentIds.includes(
              TelemetryJournal.getActiveIdentityConflict()?.intentId ?? '',
            )
              ? null
              : (TelemetryJournal.getActiveIdentityConflict()?.blocker ?? null),
            unresolvedIntentCount: TelemetryJournal.nonTerminal().filter(
              (row) =>
                row.intentId !== intent.intentId &&
                row.status !== 'ACKNOWLEDGED' &&
                !protectiveProof?.unrelatedIntentIds.includes(row.intentId),
            ).length,
          },
          target,
        );
        assertDecibelSessionMutationOwnerV1(() => SessionController.ownsActiveRuntime());
        return {
          preflight,
          assertSubmissionStillAuthorized: () =>
            assertDecibelSessionMutationOwnerV1(() => SessionController.ownsActiveRuntime()),
          observedAt:
            fresh.venueReadWindow?.account.startedAt ??
            fresh.practicalCapacityInputs?.accountObservedAt ??
            fresh.input.now,
        };
      },
      readAuthenticatedSnapshot: async () => await readProjectedSessionSnapshot(),
      readAuthenticatedSnapshotAfterMutation: async () => await readProjectedSessionSnapshot(true),
      ...(Source.readOrderIdentityEvidence === undefined
        ? {}
        : {
            readOrderIdentityEvidence: Source.readOrderIdentityEvidence.bind(Source),
          }),
      reconcileIntent: Source.reconcileIntent.bind(Source),
      ...(Source.readPublicMarketPrice === undefined
        ? {}
        : { readPublicMarketPrice: Source.readPublicMarketPrice.bind(Source) }),
      ...(Source.revalidateCancelTarget === undefined
        ? {}
        : { revalidateCancelTarget: Source.revalidateCancelTarget.bind(Source) }),
      ...(Source.verifyTimedOutIntent === undefined
        ? {}
        : { verifyTimedOutIntent: Source.verifyTimedOutIntent.bind(Source) }),
      // Venue candles for the candle rules (missing before 2026-11-14: production always
      // fell back to the BBO history).
      ...(Source.readExchangeCandles1m === undefined
        ? {}
        : { readExchangeCandles1m: Source.readExchangeCandles1m.bind(Source) }),
    });
    const RuntimeSource = wrapDecibelProductionLiveStateSourceV1(
      RuntimeSourceBase,
      (authenticated) => {
        requestDecibelSessionTargetUnwindV1(SessionController, session.sessionId, {
          makerVolumeUsd: authenticated.sessionConfiguration?.makerVolumeUsd ?? 0,
          totalExecutedVolumeUsd: authenticated.sessionConfiguration?.totalExecutedVolumeUsd ?? 0,
        });
        requestDecibelSessionMaxLossUnwindV1(
          SessionController,
          RuntimeOrchestrator,
          session.sessionId,
          authenticated.sessionConfiguration?.riskBlocker,
        );
      },
    );
    const RuntimeExecutor = await loadDecibelProductionExecutorV1(
      runtimeConfiguration.executorModulePath,
    );
    const RuntimeJournal = new decibel_execution_lifecycle_journal_v1(
      resolve(runtimeConfiguration.journalPath),
    );
    const RuntimeOrchestrator = new decibel_production_live_orchestrator_v1(
      RuntimeJournal,
      RuntimeSource,
      RuntimeExecutor,
      runtimeConfiguration,
      {
        maxPlaceAttemptsPerMinute: DECIBEL_PRODUCTION_MUTATION_BUDGET_V1.placePerMinute,
        maxCancelAttemptsPerMinute: DECIBEL_PRODUCTION_MUTATION_BUDGET_V1.cancelPerMinute,
        maxTotalMutationAttemptsPerMinute: DECIBEL_PRODUCTION_MUTATION_BUDGET_V1.totalPerMinute,
        maxConsecutiveUnknownOutcomes: 1,
        maxKnownLiveOrders: 2,
        submissionTimeoutMs: runtimeConfiguration.submissionTimeoutMs,
      },
      {
        observations: RawWsBboStore.readFresh(
          Date.now(),
          runtimeConfiguration.volatilityLookbackMs,
        ),
        enforceReadiness: true,
        observedAt: Date.now(),
      },
    );
    RuntimeOrchestrator.setHistoricalRecoveryBlocker(protectiveRecoveryBlocker);
    const updateReconciliationReadiness = (): void => {
      const reconciliationBlocker = RuntimeJournal.getExecutionReconciliationBlocker();
      RuntimeSupervisor.setReconciliationRequired(
        reconciliationBlocker !== null,
        reconciliationBlocker ?? 'RECONCILIATION_REQUIRED',
      );
    };
    const isEconomicWarming = (): boolean => {
      const activeSession = SessionController.getState().activeSession;
      if (activeSession?.sessionId === session.sessionId && activeSession.unwindRequested)
        return false;
      // Use the same full component/schema/provenance/TTL validation that owns
      // the supervisor publication, rather than a second weaker ready flag.
      return !synchronizeEconomicSnapshot();
    };
    RuntimeOrchestrator.setEconomicWarming(
      isEconomicWarming(),
      RuntimeSupervisor.getSnapshot().runtimeState.domainBlockers.EconomicEvidenceState ??
        undefined,
    );
    if (session.unwindRequested) {
      if (isDecibelTargetUnwindReasonV1(session.unwindReason))
        RuntimeOrchestrator.requestSessionDrain();
      else RuntimeOrchestrator.requestSessionUnwind();
    }
    const persistUnwindState = (
      result: Awaited<ReturnType<typeof RuntimeOrchestrator.evaluateOnce>>,
    ): void => {
      if (!SessionController.ownsActiveRuntime()) return;
      if (result.evaluation?.operatingState !== 'SESSION_UNWIND') return;
      SessionController.requestUnwind(
        session.sessionId,
        SessionStore.getActive()?.unwindReason ?? result.evaluation.riskReductionTrigger,
      );
    };
    updateReconciliationReadiness();
    execution = {
      running: false,
      sessionId: session.sessionId,
      cycles: 0,
      lastAction: isEconomicWarming() ? 'WAITING_ECONOMIC' : 'RECOVERY_PREPARED',
      blocker: isEconomicWarming() ? 'PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED' : null,
    };
    if (shutdownStarted) {
      await RuntimeOrchestrator.close();
      throw new Error('SESSION_RUNTIME_SHUTDOWN_IN_PROGRESS');
    }
    let evaluating = false;
    let runtimeClosed = false;
    const runtimeScheduleKey = `session-cycle:${session.sessionId}`;
    let replacementFollowUp = DECIBEL_REPLACEMENT_FOLLOW_UP_IDLE_V1;
    let activeCycle: Promise<void> | null = null;
    let authenticatedReadFailures = 0;
    let authenticatedReadRetryAfter = 0;
    const getFinalAccounting = (finalSnapshot = RuntimeOrchestrator.getLatestSnapshot()) => {
      const finalLedger = finalSnapshot?.input.actualFillLedger;
      const sessionFills = finalLedger?.fills.filter(
        (fill) =>
          (fill.venueTimestamp ?? fill.receivedAt).getTime() >=
          (session.startedAt ?? session.createdAt),
      );
      const finalFees = sessionFills
        ?.filter((fill) => fill.fee.availability === 'AVAILABLE' && fill.fee.currency === 'USD')
        .map((fill) => fill.fee.amount)
        .filter((fee): fee is number => fee !== null);
      const feesComplete = sessionFills !== undefined && finalFees?.length === sessionFills.length;
      return Object.freeze({
        sessionPnlUsd: finalSnapshot?.sessionConfiguration?.pnlUsd ?? null,
        pnlComplete: typeof finalSnapshot?.sessionConfiguration?.pnlUsd === 'number',
        makerVolumeUsd:
          finalSnapshot?.sessionConfiguration?.makerVolumeUsd ??
          sessionFills
            ?.filter((fill) => fill.makerOrTaker === 'MAKER')
            .reduce((sum, fill) => sum + fill.executedUsdNotional, 0) ??
          null,
        takerVolumeUsd: finalSnapshot?.sessionConfiguration?.takerVolumeUsd ?? null,
        totalExecutedVolumeUsd: finalSnapshot?.sessionConfiguration?.totalExecutedVolumeUsd ?? null,
        fillCount: sessionFills?.length ?? null,
        feesUsd: feesComplete ? finalFees.reduce((sum, fee) => sum + fee, 0) : null,
        gasUsd: null,
        finalBotState: 'ENDED',
        finalPositionBase: finalSnapshot?.input.actualInventoryBase ?? null,
        unresolvedExecutionCount: RuntimeJournal.nonTerminal().length,
      });
    };
    const terminalizeCompletedUnwind = async (): Promise<boolean> => {
      if (runtimeClosed || !SessionController.ownsActiveRuntime()) return false;
      const active = SessionStore.getActive();
      if (active?.sessionId !== session.sessionId || !active.unwindRequested) return false;
      // Completion requires venue account/history and durable ownership, not an
      // executable quote. Market/economic warmup cannot strand a verified FLAT end.
      const venue =
        RuntimeSupervisor.getAuthenticatedSnapshot<authenticated_account_state>()?.venueSnapshot;
      const completed =
        venue?.venueReadWindow?.history !== undefined &&
        venue.input.actualInventoryBase === 0 &&
        venue.input.openOrders.length === 0
          ? projectSessionConfiguration(venue)
          : RuntimeOrchestrator.isSessionUnwindComplete()
            ? RuntimeOrchestrator.getLatestSnapshot()
            : null;
      const finalized = finalizeDecibelVerifiedSessionV1(
        completed,
        RuntimeJournal.nonTerminal().length +
          (RuntimeJournal.getActiveIdentityConflict() === null ? 0 : 1),
        () => {
          SessionController.completeUnwind(
            session.sessionId,
            getFinalAccounting(completed),
            session.unwindReason ?? 'SESSION_UNWIND_COMPLETE',
          );
        },
      );
      if (!finalized) return false;
      runtimeClosed = true;
      RuntimeSupervisor.cancelScheduled(runtimeScheduleKey);
      RuntimeSupervisor.cancelScheduled(`${runtimeScheduleKey}:replacement-follow-up`);
      clearCompletedSessionProjection();
      await RuntimeOrchestrator.close();
      return true;
    };
    const cycle = async (): Promise<void> => {
      if (evaluating || runtimeClosed) return;
      evaluating = true;
      try {
        if (await terminalizeCompletedUnwind()) return;
        if (Date.now() < authenticatedReadRetryAfter) return;
        const economicWarming = isEconomicWarming();
        const economicBlocker =
          RuntimeSupervisor.getSnapshot().runtimeState.domainBlockers.EconomicEvidenceState ??
          'PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED';
        RuntimeOrchestrator.setEconomicWarming(economicWarming, economicBlocker);
        // Dust blocks new exposure, not authenticated fill/ACK reconciliation.
        // The existing planner/preflight retain the venue minimum and no-flip checks.
        const result = await RuntimeOrchestrator.evaluateOnce();
        const historicalBlocker = RuntimeOrchestrator.getHistoricalRecoveryBlocker();
        if (historicalBlocker !== null && protectiveRecoveryBlocker === null) {
          SessionController.restrictRuntimeToProtection(historicalBlocker);
          RuntimeSupervisor.setDependency('recovery', 'BLOCKED');
          RuntimeSupervisor.scheduleOnce(
            'startup-recovery',
            runtimeConfiguration.pollIntervalMs,
            attemptStartupRecovery,
          );
        }
        const latestAuthenticatedSnapshot = RuntimeOrchestrator.getLatestSnapshot();
        if (latestAuthenticatedSnapshot === null) RuntimeSupervisor.setAuthenticatedReadBlocked();
        const authenticatedFresh = RuntimeSupervisor.isAuthenticatedStateReady();
        if (authenticatedFresh) {
          authenticatedReadFailures = 0;
          authenticatedReadRetryAfter = 0;
          lastAuthenticatedReadError = null;
          RuntimeSupervisor.clearTransientBlocker();
        }
        persistUnwindState(result);
        if (latestAuthenticatedSnapshot !== null)
          publishSnapshot(latestAuthenticatedSnapshot, runtimeOwnerRevision);
        updateReconciliationReadiness();
        if (result.evaluation !== null || protectiveRecoveryBlocker !== null)
          lastSuccessfulCycleAt = Date.now();
        execution = {
          running: true,
          sessionId: session.sessionId,
          cycles: execution.cycles + 1,
          lastAction: selectDecibelLastCompletedExecutionActionV1(
            execution.lastAction,
            economicWarming && result.blocker === economicBlocker
              ? 'WAITING_ECONOMIC'
              : result.action,
          ),
          blocker: result.blocker,
          tradingDecision: result.tradingDecision,
          strategy: projectDecibelStrategyStatusV1(
            RuntimeOrchestrator.getLatestSnapshot(),
            execution.strategy ?? null,
          ),
        };
        emitControlLoopTelemetry(result, snapshot);
        await terminalizeCompletedUnwind();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'PRODUCTION_EXECUTION_CYCLE_FAILED';
        const waitingForMarketState = errorMessage === 'PRODUCTION_MARKET_DATA_READ_TRANSIENT';
        const waitingForAuthenticatedState =
          !waitingForMarketState && isTransientDecibelAuthenticatedReadErrorV1(error);
        if (waitingForAuthenticatedState) {
          const previousReadError = lastAuthenticatedReadError;
          lastAuthenticatedReadError = describeAuthenticatedReadFailure(error);
          if (previousReadError !== lastAuthenticatedReadError)
            console.error(
              `DECIBEL_PRODUCTION_AUTHENTICATED_READ=TRANSIENT DETAIL=${lastAuthenticatedReadError}`,
            );
          authenticatedReadFailures += 1;
          authenticatedReadRetryAfter =
            Date.now() + Math.min(30_000, 1_000 * 2 ** Math.min(4, authenticatedReadFailures - 1));
          RuntimeSupervisor.setFiniteCooldown(
            'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
            authenticatedReadRetryAfter,
            'FRESH_AUTHENTICATED_SNAPSHOT',
          );
        }
        RuntimeForensics.record('EXECUTION_CYCLE_FAILURE', {
          timestamp: Date.now(),
          sessionId: session.sessionId,
          cycle: execution.cycles + 1,
          failure: errorMessage,
          waitingForAuthenticatedState,
          waitingForMarketState,
        });
        execution = {
          running: true,
          sessionId: session.sessionId,
          cycles: execution.cycles + 1,
          lastAction: selectDecibelLastCompletedExecutionActionV1(execution.lastAction, null),
          blocker: errorMessage,
          tradingDecision: RuntimeOrchestrator.getTradingDecision(),
        };
        emitControlLoopTelemetry(null, snapshot, errorMessage);
      } finally {
        evaluating = false;
        // A precomputed replacement is waiting for its place: run the next cycle soon
        // instead of after the full poll interval. The cycle itself is unchanged.
        const followUp = planDecibelReplacementFollowUpV1(
          replacementFollowUp,
          RuntimeOrchestrator.getPendingReplacementDecisionId(),
        );
        replacementFollowUp = followUp.state;
        if (followUp.delayMs !== null && !runtimeClosed)
          RuntimeSupervisor.scheduleOnce(
            `${runtimeScheduleKey}:replacement-follow-up`,
            followUp.delayMs,
            () => scheduleCycle().then(() => undefined),
          );
      }
    };
    const scheduleCycle = (): Promise<void> => {
      if (activeCycle !== null) return activeCycle;
      const PendingCycle = cycle();
      activeCycle = PendingCycle;
      void PendingCycle.finally(() => {
        if (activeCycle === PendingCycle) activeCycle = null;
      }).catch(() => undefined);
      return PendingCycle;
    };
    return Object.freeze({
      closePaused: async () => {
        RuntimeSupervisor.cancelScheduled(runtimeScheduleKey);
        RuntimeSupervisor.cancelScheduled(`${runtimeScheduleKey}:replacement-follow-up`);
        if (activeCycle !== null) await activeCycle;
        runtimeClosed = true;
        execution = { ...execution, running: false, blocker: 'SESSION_TAKEOVER_PAUSED' };
        await RuntimeOrchestrator.close();
      },
      pauseForShutdown: async () => {
        RuntimeSupervisor.cancelScheduled(runtimeScheduleKey);
        RuntimeSupervisor.cancelScheduled(`${runtimeScheduleKey}:replacement-follow-up`);
        if (activeCycle !== null) await activeCycle;
        if (runtimeClosed) return Object.freeze({ settled: true });
        // Cancel resting entries so nothing opens while the bot is offline; the reduce-only TP
        // and the venue catastrophe stop keep protecting an open position.
        RuntimeOrchestrator.requestShutdownPause();
        for (
          let attempt = 0;
          attempt < DECIBEL_SHUTDOWN_PAUSE_MAXIMUM_CYCLES_V1 &&
          !runtimeClosed &&
          !RuntimeOrchestrator.isShutdownPauseSettled();
          attempt += 1
        )
          await scheduleCycle();
        const settled = RuntimeOrchestrator.isShutdownPauseSettled();
        runtimeClosed = true;
        execution = { ...execution, running: false, blocker: 'SESSION_PAUSED_FOR_SHUTDOWN' };
        await RuntimeOrchestrator.close();
        return Object.freeze({ settled });
      },
      setHistoricalRecoveryBlocker: (blocker: string | null) => {
        protectiveRecoveryBlocker = blocker;
        RuntimeOrchestrator.setHistoricalRecoveryBlocker(blocker);
      },
      activate: () => {
        if (shutdownStarted || runtimeClosed || RuntimeSupervisor.hasScheduled(runtimeScheduleKey))
          return;
        const economicWarming = isEconomicWarming();
        RuntimeOrchestrator.setEconomicWarming(
          economicWarming,
          RuntimeSupervisor.getSnapshot().runtimeState.domainBlockers.EconomicEvidenceState ??
            undefined,
        );
        execution = {
          ...execution,
          running: true,
          blocker: economicWarming ? 'PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED' : null,
          lastAction: economicWarming ? 'WAITING_ECONOMIC' : 'TAKEOVER_RESUMED',
        };
        RuntimeSupervisor.scheduleRecurring(
          runtimeScheduleKey,
          runtimeConfiguration.pollIntervalMs,
          () => scheduleCycle().then(() => undefined),
        );
        void scheduleCycle().catch(() => undefined);
      },
      wake: () => {
        if (
          !shutdownStarted &&
          !runtimeClosed &&
          RuntimeSupervisor.hasScheduled(runtimeScheduleKey)
        )
          void scheduleCycle().catch(() => undefined);
      },
      stop: async () => {
        RuntimeSupervisor.setPhase('STOPPING');
        if (runtimeClosed) return Object.freeze({ safeToEnd: true, blocker: null });
        // Latch unwind before waiting for an in-flight cycle. Any cycle that has
        // not committed a mutation yet will now evaluate SESSION_UNWIND rather
        // than generate another normal-MM PLACE.
        SessionController.requestUnwind(session.sessionId, 'SESSION_END');
        RuntimeOrchestrator.requestSessionUnwind();
        RuntimeSupervisor.cancelScheduled(runtimeScheduleKey);
        RuntimeSupervisor.cancelScheduled(`${runtimeScheduleKey}:replacement-follow-up`);
        if (activeCycle !== null) await activeCycle;
        if (runtimeClosed) return Object.freeze({ safeToEnd: true, blocker: null });
        for (
          let attempt = 0;
          attempt < 3 && !runtimeClosed && !RuntimeOrchestrator.isSessionUnwindComplete();
          attempt += 1
        )
          // Use the canonical control-cycle path so authenticated publication,
          // journal readiness and terminal session completion are never skipped.
          await scheduleCycle();
        if (runtimeClosed)
          return Object.freeze({
            safeToEnd: true,
            blocker: null,
            accounting: getFinalAccounting(),
          });
        if (!RuntimeOrchestrator.isSessionUnwindComplete()) {
          RuntimeSupervisor.scheduleRecurring(
            runtimeScheduleKey,
            runtimeConfiguration.pollIntervalMs,
            () => scheduleCycle().then(() => undefined),
          );
          return Object.freeze({
            safeToEnd: false,
            blocker: 'WAITING_FOR_SESSION_UNWIND',
          });
        }
        execution = { ...execution, running: false };
        const accounting = getFinalAccounting();
        runtimeClosed = true;
        await RuntimeOrchestrator.close();
        return Object.freeze({
          safeToEnd: true,
          blocker: null,
          accounting,
        });
      },
    });
  };
  const SessionController = new decibel_production_session_controller_v1(
    SessionStore,
    SettingsStore,
    startRuntime,
    Date.now,
    async () => {
      await runDecibelAuthenticatedStartAdmissionV1({
        Supervisor: RuntimeSupervisor,
        timeoutMs: configuration.readTimeoutMs,
        getObservedAt: (candidate) =>
          candidate.venueReadWindow?.account.completedAt ?? candidate.input.now,
        refresh: async () => {
          try {
            const authenticated = await refreshAuthenticatedComponents();
            if (authenticated.venueSnapshot === undefined)
              throw new Error('AUTHENTICATED_SNAPSHOT_PUBLICATION_FAILED');
            return authenticated.venueSnapshot;
          } catch (error) {
            throw new Error(describeAuthenticatedReadFailure(error), { cause: error });
          }
        },
        validate: async (admissionSnapshot) => {
          // Admission must first consume late terminal evidence from the prior session.
          reconcileDecibelAcknowledgedTerminalOrdersV1(TelemetryJournal, admissionSnapshot);
          await reconcileAllDecibelAcknowledgedOrdersV1(
            TelemetryJournal,
            Source,
            admissionSnapshot,
          );
          if (
            validateSettingsCapitalMarginV1(String(SettingsStore.read().values.capitalToUseUsd), {
              availableMarginUsd: admissionSnapshot.availableMarginUsd ?? null,
              status: 'fresh',
            }) !== 'valid'
          )
            throw new Error('CAPITAL_MARGIN_VALIDATION_FAILED');
          validateDecibelCapitalAllocationV1(
            SettingsStore.read().values.capitalToUseUsd,
            admissionSnapshot.accountMetrics?.collateralUsd ?? null,
          );
          const unresolved = TelemetryJournal.nonTerminal();
          if (unresolved.some((intent) => intent.status === 'UNRESOLVABLE_ACK'))
            throw new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
          const restoredLiveOrderIds = new Set(
            unresolved
              .filter(
                (intent) =>
                  intent.status === 'ACKNOWLEDGED' &&
                  intent.venueOrderId !== null &&
                  TelemetryJournal.getLatestReconciliationProvenance(intent.intentId)
                    ?.venueStatus === 'OPEN',
              )
              .map((intent) => intent.venueOrderId as string),
          );
          if (
            unresolved.some(
              (intent) =>
                intent.status === 'ACKNOWLEDGED' &&
                (intent.venueOrderId === null || !restoredLiveOrderIds.has(intent.venueOrderId)),
            )
          )
            throw new Error('PRODUCTION_RECONCILIATION_PENDING_ACKNOWLEDGED_ORDER');
          if (unresolved.some((intent) => intent.status !== 'ACKNOWLEDGED'))
            throw new Error('PRODUCTION_RECONCILIATION_REQUIRED');
          if (
            admissionSnapshot.input.openOrders.some(
              (order) => !restoredLiveOrderIds.has(order.venueOrderId),
            )
          )
            throw new Error('PRODUCTION_RESTING_ORDER_RECONCILIATION_REQUIRED');
          if (admissionSnapshot.input.actualInventoryBase === 0)
            SessionStore.migrateLegacyCompletedUnwindMarkers();
          const reconciliationBlocker = TelemetryJournal.getExecutionReconciliationBlocker();
          RuntimeSupervisor.setReconciliationRequired(
            reconciliationBlocker !== null,
            reconciliationBlocker ?? 'RECONCILIATION_REQUIRED',
          );
        },
      });
    },
    async (protectiveOnly = false) => {
      await ensureDecibelRecoveryAuthenticatedStateV1(RuntimeSupervisor, async () => {
        await refreshAuthenticatedComponents();
      });
      assertDecibelHTTPReadAllowedV1();
      const candidate = RuntimeSupervisor.getAuthenticatedSnapshot<authenticated_account_state>();
      if (candidate === null) throw new Error('PRODUCTION_AUTHENTICATED_READ_REQUIRED');
      const unresolvedAfterRead = TelemetryJournal.nonTerminal();
      if (
        !protectiveOnly &&
        unresolvedAfterRead.length > 0 &&
        candidate.venueSnapshot === undefined
      )
        throw new Error(
          `SESSION_ORPHANED_EXECUTION_RECONCILIATION_REQUIRED:${unresolvedAfterRead[0]!.intentId}`,
        );
      const now = Date.now();
      if (!RuntimeSupervisor.isAuthenticatedStateReady(now))
        throw new Error('SESSION_ORPHANED_AUTHENTICATED_SNAPSHOT_NOT_FRESH');
      if (!Array.isArray(candidate.openOrders))
        throw new Error('SESSION_ORPHANED_OPEN_ORDER_STATE_UNKNOWN');
      if (!Number.isFinite(candidate.actualInventoryBase))
        throw new Error('SESSION_ORPHANED_AUTHENTICATED_POSITION_UNKNOWN');
      if (!protectiveOnly && candidate.venueSnapshot !== undefined)
        assertDecibelExposureRecoveryCompleteV1(TelemetryJournal, candidate.venueSnapshot);
    },
    { pid: process.pid, instanceId: ProcessInstanceId },
    undefined,
    Number.isSafeInteger(Number(environment.DECIBEL_PRODUCTION_LEGACY_TAKEOVER_PID)) &&
      Number(environment.DECIBEL_PRODUCTION_LEGACY_TAKEOVER_PID) > 0
      ? Number(environment.DECIBEL_PRODUCTION_LEGACY_TAKEOVER_PID)
      : null,
    (attempt) => {
      const blocker = attempt.blocker?.match(/^[A-Z][A-Z0-9_]+/u)?.[0] ?? null;
      RuntimeForensics.record(`SESSION_START_${attempt.outcome}`, {
        ...attempt,
        blocker,
        authenticatedEvidence: RuntimeSupervisor.getAuthenticatedEvidenceDiagnostics(),
        sourceEvidence: Source.readAuthenticatedEvidenceDiagnostics?.() ?? null,
        accountReadWindow: snapshot?.venueReadWindow?.account ?? null,
        historyReadWindow: snapshot?.venueReadWindow?.history ?? null,
        initialized: {
          position: Number.isFinite(snapshot?.input.actualInventoryBase),
          orders: Array.isArray(snapshot?.input.openOrders),
          history: snapshot?.input.actualFillLedger !== undefined,
          equity: Number.isFinite(snapshot?.accountMetrics?.collateralUsd),
          margin: Number.isFinite(snapshot?.availableMarginUsd),
        },
      });
      console.log(
        `PROCESS_ID=${process.pid} SESSION_START=${attempt.outcome} TRANSITION_ID=${attempt.transitionId ?? 'NONE'} SESSION_ID=${attempt.sessionId ?? 'NONE'} BLOCKER=${blocker ?? 'NONE'}`,
      );
    },
  );
  notifyExecutionSnapshotReady = (): void => {
    if (isDecibelExecutionCompositeReadyV1(RuntimeSupervisor, SessionController.getState().state))
      SessionController.activateRuntime();
    SessionController.wakeRuntime();
  };
  SessionController.setRecoveryBlocker('PRODUCTION_STARTUP_RECOVERY_PENDING');
  let StartupRecovery: Promise<void> = Promise.resolve();
  let lastStartupRecoveryBlockedSignature: string | null = null;
  const staticRoot = resolve('web_dashboard/dist');
  if (!existsSync(join(staticRoot, 'index.html'))) throw new Error('WEB_DASHBOARD_BUILD_MISSING');
  const startedAt = Date.now();
  let telemetry: decibel_production_web_telemetry_v1;
  const clients = new Set<ServerResponse>();
  let historyCache: ReturnType<typeof readDecibelProductionWebHistoryV1> | null = null;
  let historyFingerprint = '';
  const readHistory = (): ReturnType<typeof readDecibelProductionWebHistoryV1> => {
    const fingerprint = [configuration.journalPath, `${configuration.journalPath}-wal`]
      .map((path) => {
        try {
          const status = statSync(path);
          return `${status.size}:${status.mtimeMs}`;
        } catch {
          return 'MISSING';
        }
      })
      .join('|');
    if (historyCache !== null && fingerprint === historyFingerprint) return historyCache;
    historyCache = readDecibelProductionWebHistoryV1(configuration.journalPath);
    historyFingerprint = fingerprint;
    return historyCache;
  };
  let RefreshInFlight: Promise<void> | null = null;
  let lastSessionControlSignature = '';
  let lastSessionControlLogAt = 0;
  const runRefresh = (): Promise<void> => {
    // Covers both automatic unwind and the operator End response path. Never
    // reuse an ENDED session's risk/quote projection for the next Start gate.
    if (SessionStore.getActive() === null && execution.sessionId !== null)
      clearCompletedSessionProjection();
    refreshSupervisorFromAuthoritativeState();
    const supervisorProjection = RuntimeSupervisor.getSnapshot();
    execution = {
      ...execution,
      blocker: SessionController.getState().protectiveOnly
        ? execution.blocker
        : supervisorProjection.runtimeState.domains.ExecutionState === 'READY'
          ? execution.running
            ? execution.blocker
            : null
          : supervisorProjection.runtimeState.domainBlockers.ExecutionState,
    };
    const sessionControl = deriveDecibelSessionControlDiagnosticsV1({
      sessionState: SessionController.getState().state,
      latestSessionStatus: SessionStore.list(1)[0]?.status ?? null,
      latestSessionBlocker: SessionStore.list(1)[0]?.stopReason ?? null,
      lastStartAttempt: SessionController.getState().lastStartAttempt,
      executionLoopRunning: execution.running,
      executionCycles: execution.cycles,
      executionBlocker: SessionController.getState().runtimeReadinessBlocker ?? execution.blocker,
    });
    const signature = `${sessionControl.state}:${sessionControl.loop}:${sessionControl.blocker}:${sessionControl.readinessBlocker}`;
    if (
      signature !== lastSessionControlSignature ||
      Date.now() - lastSessionControlLogAt >= 30000
    ) {
      lastSessionControlSignature = signature;
      lastSessionControlLogAt = Date.now();
      console.log(
        `PROCESS_ID=${process.pid} SESSION_CONTROL_STATE=${sessionControl.state} EXECUTION_LOOP=${sessionControl.loop} BLOCKER=${sessionControl.blocker ?? 'NONE'} READINESS_BLOCKER=${sessionControl.readinessBlocker ?? 'NONE'} LAST_START_BLOCKER=${sessionControl.lastStartRejection?.blocker?.match(/^[A-Z][A-Z0-9_]+/u)?.[0] ?? 'NONE'}`,
      );
    }
    const authReady = supervisorProjection.runtimeState.domains.AuthState === 'READY';
    connectionError =
      SessionController.getState().takeover.state === 'WAITING_FOR_LEGACY_PID'
        ? 'SESSION_WAITING_FOR_LEGACY_PID'
        : authReady
          ? null
          : lastAuthenticatedReadError;
    const history = readHistory();
    const marketProjection = RuntimeSupervisor.getMarketDataProjection();
    const executionProjection = supervisorProjection.executionSnapshot;
    telemetry = mapDecibelProductionWebTelemetryV1({
      overviewTotalSessionsExecuted: readDecibelOverviewSessionCountV1(
        web.DECIBEL_PRODUCTION_SESSION_STORE_PATH,
      ),
      overviewLifetime: readDecibelOverviewLifetimeTotalsV1(
        web.DECIBEL_PRODUCTION_SESSION_STORE_PATH,
      ),
      snapshot: RuntimeSupervisor.getExecutionSnapshot<decibel_production_live_snapshot_v1>(),
      history,
      configuration,
      startedAt,
      generatedAt: Date.now(),
      lastSuccessfulCycleAt,
      connectionError,
      protectiveRecoveryAdmission:
        SessionController.getState().protectiveOnly && snapshot !== null
          ? assessDecibelProtectiveRecoveryV1(TelemetryJournal, snapshot, Date.now())
          : { allowed: false, blocker: null },
      recoveryBlocker:
        SessionController.getState().recoveryBlocker ??
        (supervisorProjection.dependencies.recovery === 'BLOCKED' ? connectionError : null),
      execution,
      marketDataDiagnostics: RuntimeSupervisor.getMarketDataSnapshot<public_market_state>(),
      marketDataState: supervisorProjection.runtimeState.domains.MarketDataState,
      marketDataProjection: {
        ...marketProjection,
        executionGeneration: executionProjection.generation,
        executionBboTimestamp: executionProjection.bboTimestamp,
      },
      supervisorInventory: supervisorProjection.inventory,
      dependencies: RuntimeSupervisor.getSnapshot().dependencies,
      readiness: supervisorProjection.readiness,
      authenticatedStateAgeMs:
        authenticatedObservedAt === null ? null : Math.max(0, Date.now() - authenticatedObservedAt),
      build: readEffectiveBuildFingerprint(),
    });
    const payload = `data: ${JSON.stringify(telemetry)}\n\n`;
    for (const client of clients) client.write(payload);
    return Promise.resolve();
  };
  const refresh = (): Promise<void> => {
    if (RefreshInFlight !== null) return RefreshInFlight;
    // Telemetry is presentation only: a failed refresh is logged and skipped, never an
    // unhandled rejection that terminates the trading process (crash 2026-11-13 20:30).
    const PendingRefresh = runRefresh().catch((error: unknown) => {
      console.error(
        // Console output in this process is already redacted (installDecibelConsoleRedactionV1).
        `DECIBEL_PRODUCTION_WEB_TELEMETRY_REFRESH=FAILED DETAIL=${(error instanceof Error
          ? error.message
          : String(error)
        ).slice(0, 300)}`,
      );
    });
    RefreshInFlight = PendingRefresh;
    void PendingRefresh.finally(() => {
      if (RefreshInFlight === PendingRefresh) RefreshInFlight = null;
    }).catch(() => undefined);
    return PendingRefresh;
  };

  telemetry = mapDecibelProductionWebTelemetryV1({
    overviewTotalSessionsExecuted: readDecibelOverviewSessionCountV1(
      web.DECIBEL_PRODUCTION_SESSION_STORE_PATH,
    ),
    overviewLifetime: readDecibelOverviewLifetimeTotalsV1(
      web.DECIBEL_PRODUCTION_SESSION_STORE_PATH,
    ),
    snapshot: null,
    history: readHistory(),
    configuration,
    startedAt,
    generatedAt: Date.now(),
    lastSuccessfulCycleAt: null,
    connectionError: 'INITIALIZING',
    authenticatedStateAgeMs: null,
    build: readEffectiveBuildFingerprint(),
    execution,
    dependencies: RuntimeSupervisor.getSnapshot().dependencies,
    readiness: RuntimeSupervisor.getSnapshot().readiness,
  });
  const DashboardAuth = createDecibelDashboardAuthFromEnvironmentV1(
    environment,
    (await loadDecibelSdkRuntimeV1()).MAINNET_CONFIG.fullnodeUrl,
  );
  const Server = createServer((request, response) =>
    handleDecibelProductionWebRequestV1(
      {
        web,
        environment,
        configuration,
        loadedExecutionMode: LoadedExecutionMode,
        runtimeSupervisor: RuntimeSupervisor,
        runtimeForensics: RuntimeForensics,
        sessionController: SessionController,
        settingsStore: SettingsStore,
        source: Source,
        telemetryJournal: TelemetryJournal,
        clients,
        staticRoot,
        refreshAuthenticatedComponents,
        getSnapshot: () => snapshot,
        getTelemetry: () => telemetry,
        auth: DashboardAuth,
        secureCookie: environment.DECIBEL_DASHBOARD_COOKIE_SECURE === 'true',
        subaccountSwitch: {
          canSwitch: () =>
            environment.DECIBEL_SUBACCOUNT_SELECTION === 'off'
              ? 'DISABLED'
              : SessionController.getState().activeSession !== null
                ? 'SESSION_ACTIVE'
                : TelemetryJournal.nonTerminal().length > 0
                  ? 'OPEN_ORDERS'
                  : 'OK',
          // Exit code 75 asks the bootstrap to relaunch on the newly selected subaccount.
          switchNow: () => {
            setTimeout(() => {
              console.log('DECIBEL_PRODUCTION_WEB=SUBACCOUNT_SWITCH RELAUNCH=REQUESTED');
              process.exitCode = DECIBEL_SUBACCOUNT_SWITCH_EXIT_CODE_V1;
              stop();
            }, 300);
          },
        },
      },
      request,
      response,
    ),
  );
  let shutdownStarted = false;
  let gracefulShutdownCompleted = false;
  const stop = (): void => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    RuntimeForensics.record('GRACEFUL_SHUTDOWN_ENTRY', {
      session: SessionController.getState().state,
      ownerState: SessionController.getState().ownerState,
    });
    const closeLocalResources = (): void => {
      for (const client of clients) client.end();
      Server.close(() => {
        gracefulShutdownCompleted = true;
        RuntimeForensics.record('GRACEFUL_SHUTDOWN_COMPLETE', {
          session: SessionController.getState().state,
          ownerState: SessionController.getState().ownerState,
        });
      });
    };
    if (SessionController.isTakeoverPaused()) {
      void SessionController.closePausedRuntime()
        .catch((error: unknown) =>
          console.error(
            `DECIBEL_PRODUCTION_WEB_SHUTDOWN=PAUSED_LOCAL_CLOSE_FAILED BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`,
          ),
        )
        .finally(closeLocalResources);
      return;
    }
    if (!SessionController.ownsActiveRuntime()) {
      closeLocalResources();
      return;
    }
    // Ctrl+C pauses a running session instead of ending it: the next start resumes it. Use
    // END to end a session; a session that is already stopping finishes its unwind.
    void SessionController.pauseForShutdown()
      .then((pause) => {
        RuntimeForensics.record('SESSION_PAUSED_FOR_SHUTDOWN', { ...pause });
        if (pause.paused) {
          console.log(
            `DECIBEL_PRODUCTION_WEB_SHUTDOWN=SESSION_PAUSED ENTRIES_CANCELLED=${pause.settled ? 'YES' : 'UNVERIFIED'}`,
          );
          return null;
        }
        return SessionController.end('PROCESS_SHUTDOWN');
      })
      .catch((error: unknown) => {
        console.error(
          `DECIBEL_PRODUCTION_WEB_SHUTDOWN=OWNER_UNWIND_FAILED BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`,
        );
      })
      .finally(closeLocalResources);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const attemptStartupRecovery = (): void => {
    if (
      shutdownStarted ||
      RuntimeSupervisor.isRecoveryInFlight() ||
      (execution.running && !SessionController.getState().protectiveOnly)
    )
      return;
    StartupRecovery = RuntimeSupervisor.runRecovery(async () => {
      SessionStore.migrateLegacyCompletedUnwindMarkers();
      const unresolvedBeforeRecovery = TelemetryJournal.nonTerminal();
      const identityConflictBeforeRecovery = TelemetryJournal.getActiveIdentityConflict();
      const recoveryRequiresAuthenticatedState =
        SessionStore.getActive() !== null ||
        unresolvedBeforeRecovery.length > 0 ||
        identityConflictBeforeRecovery !== null;
      if (recoveryRequiresAuthenticatedState) {
        return convergeDecibelStartupRecoveryV1({
          ensureAuthenticated: () =>
            ensureDecibelRecoveryAuthenticatedStateV1(RuntimeSupervisor, async () => {
              await refreshAuthenticatedComponents();
            }),
          readAuthenticatedSnapshot: readAndPublishStrategySnapshot,
          reconcileJournal: async (recoverySnapshot) => {
            if (TelemetryJournal.nonTerminal().length > 0) {
              reconcileDecibelAcknowledgedTerminalOrdersV1(TelemetryJournal, recoverySnapshot);
              await reconcileAllDecibelAcknowledgedOrdersV1(
                TelemetryJournal,
                Source,
                recoverySnapshot,
              );
            }
            const conflictResult = await reconcileDecibelActiveIdentityConflictV1(
              TelemetryJournal,
              Source,
            );
            if (conflictResult.blocker !== null) throw new Error(conflictResult.blocker);
            const remainingConflict = TelemetryJournal.getActiveIdentityConflict();
            if (remainingConflict !== null) throw new Error(remainingConflict.blocker);
          },
          recoverSession: () => SessionController.recoverStartup(),
        });
      }
      return recoverDecibelProductionSessionBeforeListenV1(() =>
        SessionController.recoverStartup(),
      );
    })
      .then(async (startupRecovery) => {
        if (startupRecovery.blocker === null) {
          lastStartupRecoveryBlockedSignature = null;
          SessionController.setRecoveryBlocker(null);
          startupRecoveryResult = startupRecovery.result;
          RuntimeSupervisor.setDependency('recovery', 'READY');
          const takeover = SessionController.getState().takeover;
          execution =
            takeover.state === 'PAUSED'
              ? {
                  ...execution,
                  running: false,
                  lastAction: 'TAKEOVER_CLAIMED_PAUSED',
                  blocker: 'SESSION_TAKEOVER_OPERATOR_RESUME_REQUIRED',
                }
              : { ...execution, lastAction: 'STARTUP_RECOVERY_COMPLETE', blocker: null };
          if (takeover.state === 'PAUSED')
            console.log(
              `DECIBEL_PRODUCTION_TAKEOVER=CLAIMED_PAUSED PID=${process.pid} INSTANCE=${ProcessInstanceId} OBSERVED_EXIT_TO_CLAIM_MS=${takeover.claimLatencyMs ?? 'UNKNOWN'}`,
            );
          console.log(`DECIBEL_PRODUCTION_WEB_STARTUP=SESSION_RECOVERY_${startupRecoveryResult}`);
        } else {
          startupRecoveryResult = startupRecovery.blocker;
          const projectedBlocker = resolveDecibelStartupRecoveryBlockerV1(
            startupRecoveryResult,
            lastAuthenticatedReadError,
          );
          SessionController.setRecoveryBlocker(projectedBlocker);
          RuntimeSupervisor.setDependency('recovery', 'BLOCKED');
          connectionError = projectedBlocker;
          execution = {
            ...execution,
            running: SessionController.getState().protectiveOnly && execution.running,
            lastAction:
              SessionController.getState().protectiveOnly && execution.running
                ? execution.lastAction
                : 'STARTUP_RECOVERY_BLOCKED',
            blocker:
              SessionController.getState().protectiveOnly && execution.running
                ? execution.blocker
                : projectedBlocker,
          };
          try {
            await SessionController.recoverProtectiveStartup(projectedBlocker);
          } catch (error) {
            RuntimeForensics.record('PROTECTIVE_RUNTIME_RECOVERY_BLOCKED', {
              blocker: error instanceof Error ? error.message : 'PROTECTIVE_RUNTIME_UNAVAILABLE',
            });
          }
          const unresolved = TelemetryJournal.nonTerminal();
          const signature = `${projectedBlocker}|${unresolved.map((row) => `${row.intentId}:${row.status}`).join(',')}`;
          if (signature !== lastStartupRecoveryBlockedSignature) {
            lastStartupRecoveryBlockedSignature = signature;
            console.error(
              `DECIBEL_PRODUCTION_WEB_STARTUP=SESSION_RECOVERY_BLOCKED BLOCKER=${projectedBlocker} RECONCILIATION_PROGRESS=${unresolved.length === 0 ? 'JOURNAL_CLEAR' : unresolved.map((row) => `${row.intentId}:${row.status}`).join(',')}`,
            );
          }
        }
        void refresh();
      })
      .catch((error: unknown) => {
        startupRecoveryResult =
          error instanceof Error ? error.message : 'PRODUCTION_STARTUP_RECOVERY_FAILED';
        const projectedBlocker = resolveDecibelStartupRecoveryBlockerV1(
          startupRecoveryResult,
          lastAuthenticatedReadError,
        );
        SessionController.setRecoveryBlocker(projectedBlocker);
        RuntimeSupervisor.setDependency('recovery', 'BLOCKED');
        connectionError = projectedBlocker;
        execution = {
          ...execution,
          running: SessionController.getState().protectiveOnly && execution.running,
          lastAction:
            SessionController.getState().protectiveOnly && execution.running
              ? execution.lastAction
              : 'STARTUP_RECOVERY_BLOCKED',
          blocker:
            SessionController.getState().protectiveOnly && execution.running
              ? execution.blocker
              : projectedBlocker,
        };
        const unresolved = TelemetryJournal.nonTerminal();
        const signature = `${projectedBlocker}|${unresolved.map((row) => `${row.intentId}:${row.status}`).join(',')}`;
        if (signature !== lastStartupRecoveryBlockedSignature) {
          lastStartupRecoveryBlockedSignature = signature;
          console.error(
            `DECIBEL_PRODUCTION_WEB_STARTUP=SESSION_RECOVERY_BLOCKED BLOCKER=${projectedBlocker} RECONCILIATION_PROGRESS=${unresolved.length === 0 ? 'JOURNAL_CLEAR' : unresolved.map((row) => `${row.intentId}:${row.status}`).join(',')}`,
          );
        }
        void refresh();
      })
      .finally(() => {
        if (
          !shutdownStarted &&
          (!execution.running || SessionController.getState().protectiveOnly) &&
          (TelemetryJournal.nonTerminal().length > 0 ||
            TelemetryJournal.getActiveIdentityConflict() !== null)
        )
          RuntimeSupervisor.scheduleOnce(
            'startup-recovery',
            configuration.pollIntervalMs,
            attemptStartupRecovery,
          );
      });
  };
  notifyAuthenticatedReady = (): void => {
    if (
      RuntimeSupervisor.getSnapshot().dependencies.recovery !== 'READY' ||
      (!execution.running && TelemetryJournal.nonTerminal().length > 0)
    )
      RuntimeSupervisor.scheduleOnce('startup-recovery', 0, attemptStartupRecovery);
    SessionController.wakeRuntime();
  };
  const startExternalInitialization = (): void => {
    console.log('DECIBEL_PRODUCTION_WEB_STARTUP=EXTERNAL_INITIALIZATION_STARTED');
    const coldStart = resolveDecibelProductionEconomicColdStartV1(
      environment,
      Date.now(),
      RawWsBboStore,
    );
    if (coldStart.ready && synchronizeEconomicSnapshot()) {
      console.log(
        `DECIBEL_PRODUCTION_ECONOMIC_LKG=READY POLICY=${coldStart.policy} PROMOTED_TO_ACTIVE=YES`,
      );
    } else {
      console.error(
        `DECIBEL_PRODUCTION_ECONOMIC_LKG=UNAVAILABLE POLICY=${coldStart.policy} BLOCKER=${coldStart.blocker ?? 'ECONOMIC_LKG_MISSING'}`,
      );
    }
    void refreshEconomicEvidence().finally(() => void refresh());
    RuntimeSupervisor.scheduleRecurring(
      'economic-adverse-collector',
      90_000,
      () => {
        try {
          // The supervisor-owned market subscription continuously persists raw
          // BBO observations.  This job only publishes canonical evidence; it
          // must never create a second websocket subscription.
          hydrateDecibelProductionEconomicEvidenceV1(environment, Date.now(), RawWsBboStore);
          refreshSupervisorFromAuthoritativeState();
          scheduleEconomicRefresh(0);
        } catch (error) {
          synchronizeEconomicSnapshot();
          console.error(
            `DECIBEL_PRODUCTION_ADVERSE_COLLECTOR=BLOCKED BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`,
          );
        }
      },
      0,
    );
    RuntimeSupervisor.scheduleRecurring(
      'market-data-refresh',
      Math.min(
        configuration.pollIntervalMs,
        Math.max(
          250,
          Math.floor(Number(environment.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS ?? 5_000) / 2),
        ),
      ),
      () => refreshMarketDataComponents().then(() => undefined),
      0,
    );
    console.log('DECIBEL_PRODUCTION_WEB_STARTUP=INITIAL_REFRESH_SCHEDULED');
    startDecibelAuthenticatedBootstrapBeforeRecoveryV1(
      () => void refreshAuthenticatedComponents().catch(() => undefined),
      () => {
        console.log('DECIBEL_PRODUCTION_WEB_STARTUP=SESSION_RECOVERY_SCHEDULED');
        attemptStartupRecovery();
      },
    );
    void refresh();
    RuntimeSupervisor.scheduleRecurring(
      'web-telemetry-refresh',
      web.DECIBEL_PRODUCTION_WEB_REFRESH_MS,
      () => refresh(),
    );
    RuntimeSupervisor.scheduleRecurring('session-heartbeat', 5_000, () => {
      SessionController.heartbeat();
      const sessionState = SessionController.getState();
      const supervisorState = RuntimeSupervisor.getSnapshot();
      RuntimeForensics.persistRuntimeState({
        lastHeartbeat: sessionState.activeSession?.lastHeartbeatAt ?? null,
        runtimeState: sessionState.state,
        persistedSessionState: sessionState.persistedState,
        ownerState: sessionState.ownerState,
        ownerPid: sessionState.activeSession?.ownerPid ?? null,
        ownerInstanceId: sessionState.activeSession?.ownerInstanceId ?? null,
        executionRunning: execution.running,
        executionAction: execution.lastAction,
        executionBlocker: execution.blocker,
        dependencies: supervisorState.dependencies,
        blocker: supervisorState.blocker,
      });
      if (
        !execution.running &&
        startupRecoveryResult !== 'NOT_ATTEMPTED' &&
        RuntimeSupervisor.getSnapshot().dependencies.recovery === 'BLOCKED'
      )
        attemptStartupRecovery();
    });
    RuntimeSupervisor.scheduleRecurring('event-loop-telemetry', 30_000, () => {
      console.log(
        `DECIBEL_PRODUCTION_EVENT_LOOP_LAG_MS P50=${(EventLoopDelay.percentile(50) / 1_000_000).toFixed(3)} P95=${(EventLoopDelay.percentile(95) / 1_000_000).toFixed(3)} MAX=${(EventLoopDelay.max / 1_000_000).toFixed(3)}`,
      );
      console.log(
        'DECIBEL_PRODUCTION_MARKET_PIPELINE',
        JSON.stringify(Source.readMarketDataDiagnostics?.() ?? null),
      );
      EventLoopDelay.reset();
    });
    if (Number.isSafeInteger(LauncherPid) && LauncherPid > 0)
      RuntimeSupervisor.scheduleRecurring('launcher-watch', 1_000, () => {
        if (launcherMissingRecorded || isDecibelProcessPresentV1(LauncherPid)) return;
        launcherMissingRecorded = true;
        RuntimeForensics.record('LAUNCHER_DISAPPEARED', { missingPid: LauncherPid });
      });
  };
  try {
    console.log('DECIBEL_PRODUCTION_WEB_STARTUP=HTTP_LISTEN_CALLED');
    await listenDecibelProductionWebBeforeExternalInitV1(
      Server,
      web.DECIBEL_PRODUCTION_WEB_HOST,
      web.DECIBEL_PRODUCTION_WEB_PORT,
      () => {
        console.log(
          `DECIBEL_PRODUCTION_WEB=READY URL=http://${web.DECIBEL_PRODUCTION_WEB_HOST}:${web.DECIBEL_PRODUCTION_WEB_PORT} STARTUP_RECOVERY=${startupRecoveryResult}`,
        );
        startExternalInitialization();
      },
    );
    await new Promise<void>((resolveClose) => Server.once('close', resolveClose));
  } finally {
    economicSchedulerStopped = true;
    authenticatedSchedulerStopped = true;
    RuntimeSupervisor.setPhase('STOPPING');
    RuntimeSupervisor.stopScheduler();
    EventLoopDelay.disable();
    await StartupRecovery;
    for (const client of clients) client.end();
    await Source.close?.();
    TelemetryJournal.close();
    SessionStore.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    if (shutdownStarted && !gracefulShutdownCompleted)
      RuntimeForensics.record('GRACEFUL_SHUTDOWN_INCOMPLETE', {
        session: SessionController.getState().state,
      });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  assertDecibelProductionNodeRuntimeV1(process.version);
  const persistedExecutionMode = loadDecibelPersistedExecutionModeV1(process.env);
  assertDecibelPersistedExecutionModeV1(
    persistedExecutionMode.environment,
    persistedExecutionMode.mode,
  );
  Object.assign(process.env, persistedExecutionMode.environment);
  console.log(
    formatDecibelPersistedExecutionModeV1(persistedExecutionMode.mode, persistedExecutionMode.path),
  );
  const fingerprint = readBuildFingerprint();
  console.log(`DECIBEL_PRODUCTION_CHILD_NODE_VERSION=${process.version}`);
  console.log(
    `DECIBEL_PRODUCTION_BUILD BUILD_ID=${fingerprint.buildId} PROCESS_START=${fingerprint.processStart} SOURCE_BUILD_TIMESTAMP=${fingerprint.sourceBuildTimestamp} RESTART_REQUIRED=${fingerprint.restartRequired ? 'YES' : 'NO'}`,
  );
  console.log(
    formatDecibelProductionWebProcessLifecycleV1('STARTED', process.pid, ProcessInstanceId),
  );
  RuntimeForensics.record('NODE_START', {
    processStartTimestamp: ProcessStartedAt,
    nodeVersion: process.version,
    buildId: fingerprint.buildId,
    windowsProcessIdentity: {
      pid: process.pid,
      creationTime: new Date(ProcessStartedAt).toISOString(),
      executable: process.execPath,
      commandLine: process.argv.join(' '),
    },
  });
  void readDecibelWindowsProcessIdentityV1(process.pid).then((identity) =>
    RuntimeForensics.record('WINDOWS_NODE_IDENTITY', { identity }),
  );
  // Keep running through the got settled-cancel error a network drop triggers; any other
  // uncaught exception still exits (decibel_process_error_policy_v1).
  installDecibelProcessErrorPolicyV1(
    process,
    (line) => console.error(line),
    (error) =>
      RuntimeForensics.record('CONTAINED_UNCAUGHT_EXCEPTION', {
        name: error.name,
        message: error.message,
        stack: error.stack ?? null,
      }),
  );
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    RuntimeForensics.record('UNCAUGHT_EXCEPTION', {
      origin,
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    });
  });
  process.once('beforeExit', (code) =>
    console.error(
      formatDecibelProductionWebProcessLifecycleV1(
        'BEFORE_EXIT',
        process.pid,
        ProcessInstanceId,
        code,
      ),
    ),
  );
  process.once('exit', (code) => {
    RuntimeForensics.record('NODE_EXIT', { exitTimestamp: Date.now(), exitCode: code });
    console.error(
      formatDecibelProductionWebProcessLifecycleV1('EXIT', process.pid, ProcessInstanceId, code),
    );
  });
  runDecibelProductionWebV1(process.env).catch((error: unknown) => {
    console.error(
      `DECIBEL_PRODUCTION_WEB=FAIL BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`,
    );
    process.exitCode = 1;
  });
}
import { deriveDecibelSessionControlDiagnosticsV1 } from './decibel_session_control_diagnostics_v1.js';
