/**
 * One CONTROL_LOOP log line per production cycle, throttled to one identical line per 10 s
 * (moved out of run_decibel_production_web_v1.ts on 2026-11-16, unchanged).
 */
import { evaluateTradingDecision } from './decibel_trading_decision_v1.js';
import type { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import type { decibel_production_live_orchestrator_v1 } from './decibel_production_live_orchestrator_v1.js';
import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_types_v1.js';
import type { decibel_production_session_store_v1 } from './decibel_production_session_v1.js';
import type { parseDecibelProductionLiveConfigurationV1 } from './decibel_production_live_configuration_v1.js';

export type decibel_control_loop_log_context_v1 = Readonly<{
  sessionStore: Pick<decibel_production_session_store_v1, 'getActive'>;
  journal: Pick<decibel_execution_lifecycle_journal_v1, 'getActiveIdentityConflict' | 'getIntent'>;
  configuration: Pick<
    ReturnType<typeof parseDecibelProductionLiveConfigurationV1>,
    'pollIntervalMs' | 'readRetryCount' | 'readTimeoutMs'
  >;
  execution: Readonly<{ running: boolean; sessionId: string | null }>;
  lastAuthenticatedReadError: string | null;
  lastSuccessfulCycleAt: number | null;
  /** Mutable throttle state owned by the runtime. */
  throttle: { signature: string; loggedAt: number };
}>;

export function emitDecibelControlLoopLogV1(
  context: decibel_control_loop_log_context_v1,
  result: Awaited<ReturnType<decibel_production_live_orchestrator_v1['evaluateOnce']>> | null,
  currentSnapshot: decibel_production_live_snapshot_v1 | null,
  lastError: string | null = null,
): void {
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
      sessionId: context.execution.sessionId,
      state: context.sessionStore.getActive()?.status ?? 'IDLE',
      blocker: lastError,
      identityConflict: context.journal.getActiveIdentityConflict()?.blocker ?? null,
    });
  const mutation = result?.intentId ? context.journal.getIntent(result.intentId) : null;
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
    signature === context.throttle.signature &&
    Date.now() - context.throttle.loggedAt < 10000 &&
    (result?.mutationInvocations ?? 0) === 0
  )
    return;
  context.throttle.signature = signature;
  context.throttle.loggedAt = Date.now();
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
      `CONTROL_LOOP=${!context.execution.running ? 'STOPPED' : context.lastSuccessfulCycleAt === null || Date.now() - context.lastSuccessfulCycleAt > context.configuration.readTimeoutMs * (context.configuration.readRetryCount + 1) + context.configuration.pollIntervalMs ? 'STALLED' : context.lastAuthenticatedReadError !== null ? 'WAIT_AUTH' : 'ACTIVE'}`,
      `LAST_CYCLE_AGE_MS=${context.lastSuccessfulCycleAt === null ? 'UNKNOWN' : Math.max(0, Date.now() - context.lastSuccessfulCycleAt)}`,
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
}
