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
import {
  calculateDecibelPreferredEntrySizeUsdV1,
  calculateDecibelEntrySizeV1,
} from './decibel_entry_size_v1.js';
import { readDecibelActivityHistoryV1 } from './decibel_activity_history_v1.js';
import {
  validateSettingsCapitalMarginV1,
  type capital_margin_evidence_v1,
} from './settings_capital_margin_v1.js';
import { readDecibelOverviewSessionCountV1 } from './decibel_overview_metrics_v1.js';
import { validateDecibelFinalMakerAdmissionV1 } from './decibel_final_maker_admission_v1.js';
import { getDecibelPositionReductionNotionalLimitV1 } from './decibel_session_capacity_projection_v1.js';
import { runDecibelAuthenticatedStartAdmissionV1 } from './decibel_start_admission_v1.js';
import {
  mergeDecibelVenueReconciliationSnapshotV1,
  projectDecibelVenueDecisionSnapshotV1,
  assertDecibelVenueReconciliationFreshV1,
} from './decibel_venue_reconciliation_snapshot_v1.js';
import { readDecibelSessionCapacityProjectionV1 } from './decibel_session_capacity_projection_v1.js';
import { decibel_authenticated_refresh_retry_v1 } from './decibel_authenticated_refresh_retry_v1.js';
import {
  evaluateTradingDecision,
  type trading_decision_v1,
} from './decibel_trading_decision_v1.js';
import {
  calculateDecibelRiskCapacityV1,
  DECIBEL_CAPACITY_POLICY_V1,
  type decibel_capacity_inputs_v1,
} from './decibel_risk_capacity_v1.js';
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

dotenv.config();
// SDK request errors include the node API key; redact all console output in this process.
installDecibelConsoleRedactionV1(collectDecibelSecretValuesV1(process.env));

import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createServer, type Server as HTTPServer, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import {
  assertDecibelProductionNodeRuntimeV1,
  decibel_process_forensics_v1,
  isDecibelProcessPresentV1,
  readDecibelWindowsProcessIdentityV1,
} from './decibel_process_forensics_v1.js';

import {
  decibel_operator_settings_store_v1,
  parseDecibelOperatorSettingsValuesV1,
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
  type DecibelProductionLiveStateSourceV1,
  type decibel_production_live_snapshot_v1,
} from './decibel_production_live_orchestrator_v1.js';
import {
  hydrateDecibelProductionRawWsBboStoreV1,
  type decibel_raw_ws_bbo_store_v1,
} from './decibel_adverse_selection_evidence_v1.js';
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
import { readDecibelLegacyHandoffV1 } from './decibel_legacy_handoff_v1.js';
import {
  decibel_runtime_supervisor_v1,
  readDecibelSupervisorAuthenticatedSnapshotV1,
} from './decibel_runtime_supervisor_v1.js';
import {
  DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1,
  DECIBEL_PRODUCTION_LIFECYCLE_COST_ENTRY_BPS_V1,
} from './decibel_smart_ladder_v1.js';
import { classifyDecibelOperationalMarketRegimeV1 } from './decibel_market_regime_v1.js';
import { resolveDecibelProductionEconomicStorePathsV1 } from './decibel_adverse_selection_evidence_v1.js';
import {
  buildDecibelRestartSafetySnapshotV1,
  persistDecibelRestartSafetySnapshotV1,
} from './decibel_restart_safety_gate_v1.js';
import {
  assertDecibelPersistedExecutionModeV1,
  executionModesEqualV1,
  formatDecibelPersistedExecutionModeV1,
  loadDecibelPersistedExecutionModeV1,
  readDecibelEnvironmentExecutionModeV1,
  type decibel_persisted_execution_mode_v1,
} from './decibel_persisted_execution_mode_v1.js';
import { calculateDecibelSourceBuildFingerprintV1 } from './decibel_source_build_fingerprint_v1.js';

const ProcessStartedAt = Date.now();
const ProcessInstanceId =
  process.env.DECIBEL_PROCESS_INSTANCE_ID ?? `${process.pid}-${ProcessStartedAt}`;
const LauncherPid = Number(process.env.DECIBEL_PROCESS_LAUNCHER_PID ?? '');
const RuntimeForensics = new decibel_process_forensics_v1(
  process.env.DECIBEL_PRODUCTION_FORENSICS_PATH ?? 'data/production_runtime',
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

const contentTypes: Readonly<Record<string, string>> = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
});

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

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

async function readJsonBody(request: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += value.length;
    if (length > 32_768) throw new Error('SETTINGS_REQUEST_TOO_LARGE');
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    throw new Error('SETTINGS_REQUEST_INVALID_JSON', { cause: error });
  }
}

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

type decibel_production_web_startup_overrides_v1 = Readonly<{
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
  type authenticated_account_state = Awaited<
    ReturnType<NonNullable<DecibelProductionLiveStateSourceV1['readAuthenticatedAccountState']>>
  > & { venueSnapshot?: decibel_production_live_snapshot_v1 };
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
  let lastControlSignature = '';
  let lastControlLogAt = 0;
  const emitControlLoopTelemetry = (
    result: Awaited<ReturnType<decibel_production_live_orchestrator_v1['evaluateOnce']>> | null,
    currentSnapshot: decibel_production_live_snapshot_v1 | null,
    lastError: string | null = null,
  ): void => {
    const controlSnapshot = result?.controlSnapshot ?? null;
    const midpoint =
      currentSnapshot === null
        ? null
        : (currentSnapshot.input.book.bestBid + currentSnapshot.input.book.bestAsk) / 2;
    const position = currentSnapshot?.input.actualInventoryBase ?? null;
    const inventoryUsd =
      position === null || midpoint === null ? null : Math.abs(position * midpoint);
    const direction =
      position === null ? 'UNKNOWN' : position > 0 ? 'LONG' : position < 0 ? 'SHORT' : 'FLAT';
    const whyNoAction =
      result === null
        ? (lastError ?? 'CONTROL_CYCLE_NOT_AVAILABLE')
        : result.action === 'HOLD' || result.action === 'BLOCKED'
          ? (result.blocker ?? controlSnapshot?.exactReason ?? 'CONTROL_ADMISSION_REASON_MISSING')
          : 'NONE';
    const decision =
      result?.tradingDecision ??
      evaluateTradingDecision(currentSnapshot, {
        now: Date.now(),
        sessionId: execution.sessionId,
        state: SessionStore.getActive()?.status ?? 'IDLE',
        blocker: lastError,
        identityConflict: TelemetryJournal.getActiveIdentityConflict()?.blocker ?? null,
      });
    const mutation = result?.intentId ? TelemetryJournal.getIntent(result.intentId) : null;
    const tpCancelReason =
      mutation?.action === 'CANCEL' &&
      result?.evaluation?.actions.some(
        (action) =>
          action.current?.venueOrderId === mutation.expectedPreviousVenueOrderId &&
          action.current.reduceOnly === true,
      )
        ? mutation.cancelReason
        : null;
    const tpKeepReason =
      result?.evaluation?.actions.find(
        (action) => action.action === 'NO_OP' && action.current?.reduceOnly === true,
      )?.reason ?? null;
    const signature = JSON.stringify([
      decision?.state,
      decision?.primaryReason,
      decision?.primaryReason === undefined ? whyNoAction : null,
      direction,
    ]);
    if (
      signature === lastControlSignature &&
      Date.now() - lastControlLogAt < 10000 &&
      (result?.mutationInvocations ?? 0) === 0
    )
      return;
    lastControlSignature = signature;
    lastControlLogAt = Date.now();
    console.log(
      [
        `PROCESS_ID=${process.pid}`,
        ...(
          [
            'INTENDED_ACTION',
            'FIRST_BLOCKING_GATE',
            'REQUIRED_EVIDENCE',
            'ACTUAL_CAPACITY_LIMIT',
            'FINAL_EXECUTOR_OUTCOME',
          ] as const
        ).map(
          (key) =>
            `${key}=${JSON.stringify(result?.orderDecisionTrace ? result.orderDecisionTrace[key] : key === 'FINAL_EXECUTOR_OUTCOME' ? (lastError === null ? 'UNKNOWN' : 'BLOCKED') : key === 'FIRST_BLOCKING_GATE' ? (lastError === null ? null : { function: 'executionCycle', reason: lastError }) : 'UNKNOWN')}`,
        ),
        `CONTROL_LOOP=${!execution.running ? 'STOPPED' : lastSuccessfulCycleAt === null || Date.now() - lastSuccessfulCycleAt > configuration.readTimeoutMs * (configuration.readRetryCount + 1) + configuration.pollIntervalMs ? 'STALLED' : lastAuthenticatedReadError !== null ? 'WAIT_AUTH' : 'ACTIVE'}`,
        `LAST_CYCLE_AGE_MS=${lastSuccessfulCycleAt === null ? 'UNKNOWN' : Math.max(0, Date.now() - lastSuccessfulCycleAt)}`,
        `TRADING_STATE=${decision?.state ?? 'WAIT'}`,
        `TRADING_REASON=${decision?.primaryReason ?? whyNoAction}`,
        `EXECUTION_LATENCY_MS=${JSON.stringify(result?.latency ?? null)}`,
        `ACTION_CAPITAL=${JSON.stringify(decision?.capital ?? null)}`,
        `ACTION_PLAN=${JSON.stringify(decision?.actionPlan ?? null)}`,
        `SIDE_DIAGNOSTICS=${JSON.stringify(decision?.sideDiagnostics ?? null)}`,
        ...(
          [
            'POSITION_QTY',
            'CONFIRMED_EXIT_COVERAGE_QTY',
            'UNCOVERED_INVENTORY_QTY',
            'PENDING_EXIT_QTY',
            'SAME_DIRECTION_ENTRY_QTY',
          ] as const
        ).map((key) => `${key}=${decision?.exitCoverage?.[key] ?? 'UNKNOWN'}`),
        `TP_CANCEL_REASON=${tpCancelReason ?? 'NONE'}`,
        `TP_KEEP_REASON=${result?.tpPricing?.TP_REPRICE_DECISION === 'KEEP' ? result.tpPricing.TP_REPRICE_REASON : (tpKeepReason ?? 'NONE')}`,
        ...(
          [
            'TP_RESTING_PRICE',
            'TP_CANDIDATE_PRICE',
            'TP_MARKET_DISTANCE_TICKS',
            'TP_PRICE_SUITABILITY',
            'TP_REPRICE_DECISION',
            'TP_EXIT_POLICY_MODE',
            'TP_ADVERSE_MOVEMENT_BAND_USD',
            'TP_PROJECTED_SESSION_PNL_USD',
            'TP_REPRICE_REASON',
            'TP_EXPECTED_NET_BENEFIT',
            'TP_LAST_REPRICE_AGE_MS',
            'AUTHENTICATED_ENTRY_BASIS',
            'RESTING_TP_NET_PNL',
            'CANDIDATE_TP_NET_PNL',
            'TP_NET_PROFIT_REQUIRED',
            'TP_EXPECTED_NET_BENEFIT_KIND',
          ] as const
        ).map((key) => `${key}=${result?.tpPricing?.[key] ?? 'UNKNOWN'}`),
        `EXIT_COVERAGE_WORKFLOW=${JSON.stringify(result?.exitCoverageWorkflow ?? { outcome: 'BLOCKED', reason: lastError ?? 'AUTHENTICATED_EXIT_STATE_UNAVAILABLE' })}`,
        `INVENTORY_EXIT=${JSON.stringify(result?.inventoryExit ?? { EXIT_MODE: 'RECONCILE', BLOCKING_EVIDENCE: ['AUTHENTICATED_EXIT_STATE_UNAVAILABLE'] })}`,
        `EXIT_MODE=${result?.inventoryExit?.EXIT_MODE ?? 'RECONCILE'}`,
        `RESTING_TP_PRICE=${result?.tpPricing?.TP_RESTING_PRICE ?? 'UNKNOWN'}`,
        `CANDIDATE_TP_PRICE=${result?.tpPricing?.TP_CANDIDATE_PRICE ?? 'UNKNOWN'}`,
        `TP_PRICE_DECISION=${result?.tpPricing?.TP_REPRICE_DECISION ?? 'UNKNOWN'}`,
        `FILL_TO_EXIT_COVERAGE_MS=${result?.latency?.fillToExitCoverageMs ?? 'UNKNOWN'}`,
        `STRATEGY_STATE=${decision?.state ?? 'WAIT'}`,
        `AUTHENTICATED_INVENTORY_USD=${inventoryUsd === null ? 'UNKNOWN' : `${direction}:${inventoryUsd.toFixed(6)}`}`,
        `BID_ELIGIBLE=${decision ? (decision.bidEligible ? 'YES' : 'NO') : controlSnapshot === null ? 'UNKNOWN' : controlSnapshot.bidAdmission === 'READY' ? 'YES' : controlSnapshot.bidAdmission === 'BLOCKED' ? 'NO' : 'UNKNOWN'}`,
        `ASK_ELIGIBLE=${decision ? (decision.askEligible ? 'YES' : 'NO') : controlSnapshot === null ? 'UNKNOWN' : controlSnapshot.askAdmission === 'READY' ? 'YES' : controlSnapshot.askAdmission === 'BLOCKED' ? 'NO' : 'UNKNOWN'}`,
        `SELECTED_ACTION=${result?.action ?? 'NONE'}`,
        `WHY_NO_ACTION=${whyNoAction}`,
        `LIFECYCLE_BLOCKER=${result?.blocker ?? 'NONE'}`,
        `RESTING_AGE_MS=${controlSnapshot?.restingAgeMs ?? 'NONE'}`,
        `PRICE_DRIFT_TICKS=${controlSnapshot?.priceDriftTicks ?? 'NONE'}`,
        `CANCEL_REASON=${controlSnapshot?.cancelReason ?? 'NONE'}`,
        `ORDER_DECISIONS=${JSON.stringify(result?.orderDecisions ?? [])}`,
        `LAST_ERROR=${lastError ?? 'NONE'}`,
      ].join(' '),
    );
  };
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
        if (
          SessionController.ownsActiveRuntime() &&
          authenticated.sessionConfiguration?.riskBlocker === 'SESSION_MAX_LOSS_REACHED'
        )
          SessionController.requestUnwind(session.sessionId, 'MAX_LOSS_REACHED');
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
  const Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', `http://${web.DECIBEL_PRODUCTION_WEB_HOST}`)
      .pathname;
    if (pathname === '/api/activity-history') {
      if (request.method !== 'GET')
        return writeJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      const sessionId = new URL(request.url ?? '/', 'http://localhost').searchParams.get(
        'sessionId',
      );
      if (!sessionId || sessionId.length > 256)
        return writeJson(response, 400, { error: 'SESSION_ID_INVALID' });
      if (!SessionController.getHistory().some((session) => session.sessionId === sessionId))
        return writeJson(response, 404, { error: 'SESSION_NOT_FOUND' });
      try {
        return writeJson(
          response,
          200,
          readDecibelActivityHistoryV1(
            configuration.journalPath,
            sessionId,
            snapshot?.input.actualFillLedger,
          ),
        );
      } catch {
        return writeJson(response, 503, { error: 'ACTIVITY_HISTORY_UNAVAILABLE' });
      }
    }
    if (pathname.startsWith('/api/session')) {
      const isStartRequest = request.method === 'POST' && pathname === '/api/session/start';
      if (isStartRequest) RuntimeForensics.record('SESSION_START_HTTP_REQUEST');
      void (async () => {
        const body = request.method === 'POST' ? await readJsonBody(request) : null;
        const result = await handleDecibelProductionSessionRequestV1(
          request.method ?? 'GET',
          pathname,
          body,
          SessionController,
        );
        if (result === null) return writeJson(response, 404, { error: 'NOT_FOUND' });
        if (isStartRequest) {
          const error =
            typeof result.body === 'object' && result.body !== null && 'error' in result.body
              ? result.body.error
              : null;
          const blocker =
            typeof error === 'string'
              ? (error.match(/^[A-Z][A-Z0-9_]+/u)?.[0] ?? 'SESSION_START_REQUEST_INVALID')
              : null;
          RuntimeForensics.record('SESSION_START_HTTP_RESPONSE', {
            status: result.status,
            blocker,
          });
        }
        writeJson(response, result.status, result.body);
      })().catch((error: unknown) => {
        if (isStartRequest)
          RuntimeForensics.record('SESSION_START_HTTP_RESPONSE', {
            status: 400,
            blocker: 'SESSION_REQUEST_PARSE_FAILED',
          });
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : 'SESSION_REQUEST_FAILED',
        });
      });
      return;
    }
    if (pathname === '/api/operator-settings') {
      void (async () => {
        if (request.method === 'GET') {
          const saved = SettingsStore.read();
          const params = new URL(request.url ?? '/', 'http://localhost').searchParams;
          const queryValues = z
            .object({
              capitalToUseUsd: z.coerce.number().finite().positive().optional(),
              maxLossUsd: z.coerce.number().finite().positive().optional(),
              targetMakerVolumeUsd: z.coerce
                .number()
                .finite()
                .refine((value) => value !== 0)
                .optional(),
            })
            .safeParse(Object.fromEntries(params));
          const state = RuntimeSupervisor.getSnapshot();
          const base =
            RuntimeSupervisor.getExecutionSnapshot<decibel_production_live_snapshot_v1>();
          const account = RuntimeSupervisor.getAuthenticatedSnapshot<authenticated_account_state>();
          const nextPracticalInputs = Source.readNextSessionCapacityInputs?.();
          const projectedSnapshot =
            base === null || account === null
              ? null
              : {
                  ...base,
                  ...(nextPracticalInputs ? { practicalCapacityInputs: nextPracticalInputs } : {}),
                  availableMarginUsd: account.availableMarginUsd ?? Number.NaN,
                  accountMetrics: account.accountMetrics,
                  input: {
                    ...base.input,
                    actualInventoryBase: account.actualInventoryBase,
                    openOrders: account.openOrders,
                  },
                };
          const entrySizeUsd = queryValues.success
            ? projectDecibelNextSessionEntrySizeUsdV1({
                settings: {
                  ...saved.values,
                  capitalToUseUsd: queryValues.data.capitalToUseUsd ?? saved.values.capitalToUseUsd,
                  maxLossUsd: queryValues.data.maxLossUsd ?? saved.values.maxLossUsd,
                  targetMakerVolumeUsd:
                    queryValues.data.targetMakerVolumeUsd ?? saved.values.targetMakerVolumeUsd,
                },
                snapshot: projectedSnapshot,
                accountReady: state.readiness.accountReady,
                marketReady: state.readiness.marketReady,
                venueMaximumNotionalUsd: Number(
                  environment.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD ?? '100',
                ),
                maximumAggregateCollateralFraction:
                  configuration.maximumAggregateCollateralFraction,
              })
            : null;
          return writeJson(response, 200, {
            ...saved,
            nextSessionProjection: {
              settingsRevision: saved.revision,
              entrySizeUsd,
            },
          });
        }
        const body = request.method === 'POST' ? await readJsonBody(request) : null;
        if (request.method === 'POST') {
          const pending = z.object({ values: z.unknown() }).parse(body);
          const values = parseDecibelOperatorSettingsValuesV1(pending.values);
          const state = RuntimeSupervisor.getSnapshot();
          const current =
            RuntimeSupervisor.getExecutionSnapshot<decibel_production_live_snapshot_v1>();
          const account = RuntimeSupervisor.getAuthenticatedSnapshot<authenticated_account_state>();
          const practicalInputs = Source.readNextSessionCapacityInputs?.();
          const entrySize = projectDecibelNextSessionEntrySizeUsdV1({
            settings: values,
            snapshot:
              current && account
                ? {
                    ...current,
                    availableMarginUsd: account.availableMarginUsd ?? Number.NaN,
                    accountMetrics: account.accountMetrics,
                    input: {
                      ...current.input,
                      actualInventoryBase: account.actualInventoryBase,
                      openOrders: account.openOrders,
                    },
                    ...(practicalInputs ? { practicalCapacityInputs: practicalInputs } : {}),
                  }
                : null,
            accountReady: state.readiness.accountReady,
            marketReady: state.readiness.marketReady,
            venueMaximumNotionalUsd: Number(
              environment.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD ?? '100',
            ),
            maximumAggregateCollateralFraction: configuration.maximumAggregateCollateralFraction,
          });
          if (entrySize === null) throw new Error('ENTRY_UNAVAILABLE_MARGIN_OR_VENUE_EVIDENCE');
        }
        const result = handleDecibelOperatorSettingsRequestV1(
          request.method ?? 'GET',
          pathname,
          body,
          SettingsStore,
          {
            availableMarginUsd:
              RuntimeSupervisor.getAuthenticatedSnapshot<authenticated_account_state>()
                ?.availableMarginUsd ?? null,
            status: RuntimeSupervisor.getAuthenticatedEvidenceDiagnostics().ready
              ? 'fresh'
              : 'stale',
          },
        );
        if (result === null) return writeJson(response, 404, { error: 'NOT_FOUND' });
        writeJson(response, result.status, result.body);
      })().catch((error: unknown) =>
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : 'SETTINGS_REQUEST_FAILED',
        }),
      );
      return;
    }
    if (pathname === '/api/execution-mode') {
      void (async () => {
        const body = request.method === 'POST' ? await readJsonBody(request) : null;
        const result = handleDecibelExecutionModeRequestV1(
          request.method ?? 'GET',
          pathname,
          body,
          LoadedExecutionMode.path,
          LoadedExecutionMode.mode,
        );
        if (result === null) return writeJson(response, 404, { error: 'NOT_FOUND' });
        writeJson(response, result.status, result.body);
      })().catch((error: unknown) =>
        writeJson(response, 400, {
          error: error instanceof Error ? error.message : 'EXECUTION_MODE_REQUEST_FAILED',
        }),
      );
      return;
    }
    if (pathname === '/api/telemetry') return writeJson(response, 200, telemetry);
    if (pathname === '/api/restart-safety' && request.method === 'GET') {
      void (async () => {
        const authenticated = await refreshAuthenticatedComponents();
        const journalObservedAt = Date.now();
        const unresolvedIntents = TelemetryJournal.nonTerminal();
        const evaluatedAt = Date.now();
        const result = buildDecibelRestartSafetySnapshotV1({
          evaluatedAt,
          authenticatedObservedAt: authenticated.observedAt,
          authenticatedFreshnessLimitMs: 5_000,
          positionBase: authenticated.actualInventoryBase,
          openOrders: authenticated.openOrders,
          journalObservedAt,
          unresolvedIntents,
        });
        persistDecibelRestartSafetySnapshotV1(
          environment.DECIBEL_PRODUCTION_RESTART_SAFETY_PATH ??
            'config/production_state/decibel_restart_safety_v1.json',
          result,
        );
        writeJson(response, result.safeToRestart ? 200 : 409, result);
      })().catch((error: unknown) =>
        writeJson(response, 503, {
          safeToRestart: false,
          blocker: error instanceof Error ? error.message : 'RESTART_SAFETY_REFRESH_FAILED',
        }),
      );
      return;
    }
    if (pathname === '/api/runtime-snapshot')
      return writeJson(response, 200, {
        snapshot,
        supervisor: RuntimeSupervisor.getSnapshot(),
        authenticatedEvidence: RuntimeSupervisor.getAuthenticatedEvidenceDiagnostics(),
        sourceEvidence: Source.readAuthenticatedEvidenceDiagnostics?.() ?? null,
        takeover: SessionController.getState().takeover,
        handoff:
          Number.isSafeInteger(Number(environment.DECIBEL_PRODUCTION_LEGACY_TAKEOVER_PID)) &&
          Number.isSafeInteger(Number(environment.DECIBEL_PRODUCTION_LEGACY_TAKEOVER_START_MS))
            ? readDecibelLegacyHandoffV1(
                environment.DECIBEL_PRODUCTION_LEGACY_HANDOFF_PATH ??
                  'config/production_state/decibel_legacy_handoff_27624.json',
                Number(environment.DECIBEL_PRODUCTION_LEGACY_TAKEOVER_PID),
                Number(environment.DECIBEL_PRODUCTION_LEGACY_TAKEOVER_START_MS),
              )
            : null,
      });
    if (pathname === '/api/events') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      clients.add(response);
      response.write(`data: ${JSON.stringify(telemetry)}\n\n`);
      request.once('close', () => clients.delete(response));
      return;
    }
    if (pathname.startsWith('/api/')) return writeJson(response, 404, { error: 'NOT_FOUND' });
    const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = normalize(join(staticRoot, requested));
    if (!filePath.startsWith(staticRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' blob:; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    });
    createReadStream(filePath).pipe(response);
  });
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
    void SessionController.end('PROCESS_SHUTDOWN')
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
