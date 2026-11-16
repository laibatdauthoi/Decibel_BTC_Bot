import { useSessionSharePreviewV1 } from './share_preview_v1';
import { DECIBEL_STRATEGY_POLICY_V1 } from '../../src/decibel_strategy_policy_v1.js';
import { ConfirmDialog } from './confirm_dialog_v1';
import { SessionHistoryActions } from './activity_actions_v1';
import { parseSavedSettingsV1, selectSavedSettingsV1 } from './settings_state_v1';
import { validateSettingsCapitalMarginV1 } from '../../src/settings_capital_margin_v1';
import {
  calculateSettingsMinimumMaxLossForDCAUsdV1,
  calculateSettingsMinimumMaxLossUsdV1,
  formatSettingsMinimumMaxLossUsdV1,
  isSettingsMaxLossBelowDCAFloorV1,
  isSettingsMaxLossBelowEntryFloorV1,
} from '../../src/settings_max_loss_floor_v1';
import { calculateOverviewCostPerMillionV1 } from './overview_share_v1';
import { selectNewerSnapshotV1 } from './snapshot_v1';
import type { trading_decision_display_v1 as trading_decision_v1 } from './presentation';
import {
  renderSessionActionButtonV1 as SessionActionButton,
  hasConfirmedSessionEndV1,
} from './session_action_button_v1';
import type { decibel_session_start_attempt_v1 } from '../../src/decibel_session_control_diagnostics_v1';
import {
  session_start_request_v1,
  getSessionStartButtonLabelV1,
  type session_start_request_state_v1,
} from './session_start_request_v1';
import type { decibel_quote_size_assessment_v1 } from '../../src/decibel_dynamic_quote_size_v1.js';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';

import {
  DASHBOARD_FRESHNESS_MS_V1,
  appendSessionVolumeSampleV1,
  formatSettingsSessionEtaV1,
  type session_volume_sample_v1,
  getSessionStatusCodeV1,
  buildOperatorAlertsV1,
  canStartOperatorSessionV1,
  deriveDashboardPresentationV1,
  deriveSessionStartGateV1,
  formatOperatorPnlV1,
  formatOperatorValueV1,
  getOperatorStopReasonV1,
  getReadinessFooterLabelV1,
  formatSessionDurationV1,
  getDashboardTabFromSearchV1,
  getDashboardTabUrlV1,
  getSettingsChangeCountV1,
  hasFullCapitalLossWarningV1,
  getNextAlertDrawerStateV1,
  getNextExpandedSessionIdV1,
  getLossUtilizationSemanticClassV1,
  getPnlSemanticClassV1,
  selectHighestPriorityOperatorAlertV1,
  sortOperatorSessionsNewestFirstV1,
  type operator_alert_v1,
  type dashboard_view_v1,
} from './presentation';
import {
  isDecibelActiveSessionStatusV1,
  isDecibelUnresolvedIntentStatusV1,
} from '../../src/decibel_lifecycle_statuses_v1';
import './styles.css';

type Value = number | null;
type Telemetry = {
  quoteSizing: Readonly<{
    BUY: decibel_quote_size_assessment_v1 | null;
    SELL: decibel_quote_size_assessment_v1 | null;
  }> | null;
  overviewEvidence?: {
    sessionId: string | null;
    capitalUsd: Value;
    maxLossUsd: Value;
    sessionPnlUsd: Value;
    makerVolumeUsd: Value;
    takerVolumeUsd: Value;
    totalExecutedVolumeUsd: Value;
  };
  overviewHistory?: {
    totalSessionsExecuted: Value;
    utcDayStart: number;
    volumeSinceUTCStartUsd: Value;
    lifetimeVolumeUsd?: Value;
    allTimeNetPnlUsd?: Value;
    allTimeIncompletePnlCount?: Value;
  };
  generatedAt: number;
  degraded: boolean;
  lastSuccessfulCycleAt: number | null;
  runtime: {
    state: string;
    network: string;
    releaseStage: string;
    dryRun: boolean;
    authenticatedStateAgeMs: Value;
    journalStatus: string;
    executionLoopRunning: boolean;
    executionLoopHealthy?: boolean;
    positionSafety?: ReturnType<
      typeof import('../../src/decibel_position_safety_status_v1.js').deriveDecibelPositionSafetyStatusV1
    >;
    executionSessionId: string | null;
    executionCycles: number;
    lastExecutionAction: string | null;
    executionBlocker: string | null;
    executionBlockerKind?: 'FAULT' | 'DEGRADED' | 'RECONCILING' | 'WAITING' | null;
    strategyState: string | null;
    tradingDecision?: trading_decision_v1;
    bidEligible: boolean | null;
    askEligible: boolean | null;
    whyNoAction: string | null;
    lastCycleAgeMs: Value;
    lastMutation: string | null;
    lifecycleBlocker: string | null;
    rateLimitBackoff: boolean;
    lastError: string | null;
    readiness: {
      processReady: boolean;
      accountReady: boolean;
      marketReady: boolean;
      executionSafe: boolean;
      economicReady: boolean;
      blockingComponent: 'PROCESS' | 'ACCOUNT' | 'MARKET' | 'EXECUTION' | 'ECONOMIC' | null;
      blockingReason: string | null;
    };
    dependencies: {
      economic: 'INIT' | 'READY' | 'BLOCKED' | 'FAILED';
      recovery: 'INIT' | 'READY' | 'BLOCKED' | 'FAILED';
      authenticatedState: 'INIT' | 'READY' | 'BLOCKED' | 'FAILED';
    };
  };
  market: { bestBid: Value; bestAsk: Value; spread: Value; midpoint: Value; bookAgeMs: Value };
  account: {
    collateralUsd: Value;
    availableMarginUsd: Value;
    availableMarginReason: string | null;
    marginUsedUsd: Value;
    marginUsedReason: string | null;
    effectiveLeverage: Value;
    exposureLimits?: { effectivePositionLimitUsd: number } | null;
  };
  inventory: {
    positionBase: Value;
    positionNotionalUsd: Value;
    direction: 'LONG' | 'SHORT' | 'FLAT' | 'UNKNOWN';
    remainingCapacityBase: Value;
    maximumPositionBase: Value;
  };
  positions: Array<{
    market: string;
    side: 'LONG' | 'SHORT';
    size: number;
    entryPrice: Value;
    markPrice: Value;
    unrealizedPnlUsd: Value;
    source: 'BOT' | 'EXTERNAL' | 'UNKNOWN';
  }>;
  ladder: Array<{
    levelId: string;
    side: 'BUY' | 'SELL';
    desiredPrice: number;
    desiredQuantity: number;
    activeVenueOrderId: string | null;
  }>;
  orders: Array<{
    venueOrderId: string;
    clientOrderId: string;
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    reduceOnly?: boolean | null;
  }>;
  pnl: {
    realized24hUsd: Value;
    realized7dUsd: Value;
    realized30dUsd: Value;
    sessionPnl: BotPnl;
    allTimePnl: BotPnl;
  };
  volume: Record<string, Value>;
  risk: Record<string, Value>;
  blockers: Array<{
    code: string;
    meaning: string;
    kind?: 'FAULT' | 'DEGRADED' | 'RECONCILING' | 'WAITING';
    detail?: string | null;
    firstObservedAt: number;
    lastObservedAt: number;
    intentId: string | null;
  }>;
  intents: Array<{
    timestamp: number;
    intentId: string;
    action: string;
    side: string;
    price: Value;
    quantity: Value;
    status: string;
    venueOrderId: string | null;
    transactionHash: string | null;
    blocker: string | null;
    reconciliationResult: string | null;
  }>;
  fills: Array<{
    timestamp: number;
    fillId: string;
    side: string;
    quantity: number;
    price: number;
    maker: boolean;
  }>;
  events: Array<{
    timestamp: number;
    severity: string;
    category: string;
    eventType: string;
    description: string;
  }>;
};

type BotPnl = {
  valueUsd: Value;
  realizedUsd: Value;
  unrealizedUsd: Value;
  feesUsd: Value;
  gasUsd: Value;
  complete: boolean;
  scope: 'BOT_SESSION' | 'BOT_ONLY';
};

type OperatorSettings = {
  nextSessionProjection?: {
    settingsRevision: number;
    effectivePositionLimitUsd?: number | null;
    entrySizeUsd?: number | null;
    estimate?: { classification: 'ESTIMATED'; estimatedPositionLimitUsd: number | null };
  };
  revision: number;
  values: {
    capitalToUseUsd: number;
    maxLossUsd: number;
    targetMakerVolumeUsd: number;
  };
};

export type ProductionSession = {
  configRevision: number;
  sessionId: string;
  startedAt: number | null;
  endedAt: number | null;
  status: 'STARTING' | 'RUNNING' | 'STOPPING' | 'ENDED' | 'INTERRUPTED' | 'BLOCKED';
  stopReason: string | null;
  configSnapshot: OperatorSettings['values'];
  sessionPnlUsd: Value;
  pnlComplete: boolean;
  makerVolumeUsd: Value;
  takerVolumeUsd: Value;
  totalExecutedVolumeUsd: Value;
  fillCount: Value;
  feesUsd: Value;
  gasUsd: Value;
  placeCount: Value;
  cancelCount: Value;
  reconciliationCount: Value;
  blockerCount: Value;
};

type SessionState = Readonly<{
  takeover?: { state: string };
  lastStartAttempt?: decibel_session_start_attempt_v1 | null;
  state: 'IDLE' | 'RECOVERY_BLOCKED' | ProductionSession['status'];
  persistedState: 'IDLE' | ProductionSession['status'];
  ownerState: 'NONE' | 'OWNED' | 'UNCLAIMED_OR_STALE';
  recoveryBlocker: string | null;
  activeSession: ProductionSession | null;
}>;

function formatNumber(value: Value, digits = 2, prefix = ''): string {
  return value === null
    ? 'UNKNOWN'
    : `${prefix}${value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}`;
}

function formatTime(value: number | null): string {
  return value === null ? '--:--:--' : new Date(value).toLocaleTimeString([], { hour12: false });
}

const SessionDuration = (
  props: Readonly<{
    startedAt: number | null;
    endedAt: number | null;
    now: number;
    running?: boolean;
  }>,
) => {
  const [, setTick] = useState(0);
  const anchor = useRef({ serverNow: props.now, localNow: performance.now() });
  if (anchor.current.serverNow !== props.now)
    anchor.current = { serverNow: props.now, localNow: performance.now() };
  useEffect(() => {
    if (props.endedAt !== null || props.running === false || !Number.isFinite(props.now)) return;
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [props.now, props.startedAt, props.endedAt, props.running]);
  const now =
    props.endedAt !== null || props.running === false
      ? props.now
      : anchor.current.serverNow + Math.max(0, performance.now() - anchor.current.localNow);
  return <>{formatSessionDurationV1(props.startedAt, props.endedAt, now)}</>;
};

const QuoteLine = (props: Readonly<{ level: Telemetry['ladder'][number] }>) => (
  <div className={`quote-line ${props.level.side.toLowerCase()}`}>
    <span className="quote-mark" aria-hidden="true" />
    <span>{props.level.levelId.replace(/^(BUY|SELL)-/, 'L')}</span>
    <strong>{formatNumber(props.level.desiredPrice, 1)}</strong>
    <span>{formatNumber(props.level.desiredQuantity, 8)}</span>
  </div>
);

export const OverviewView = (
  props: Readonly<{
    telemetry: Telemetry;
    settings: OperatorSettings | null;
    session: SessionState | null;
    connected: boolean;
    now: number;
    sessionObservedAt?: number | null;
  }>,
) => {
  const { openShare, preview } = useSessionSharePreviewV1();
  const t = props.telemetry;
  const frameAge = Math.max(0, props.now - t.generatedAt);
  const frameFresh = props.connected && frameAge <= DASHBOARD_FRESHNESS_MS_V1;
  const marketFresh =
    frameFresh &&
    t.market.bookAgeMs !== null &&
    t.market.bookAgeMs + frameAge <= DASHBOARD_FRESHNESS_MS_V1;
  const accountFresh =
    frameFresh &&
    t.runtime.readiness.accountReady &&
    t.runtime.authenticatedStateAgeMs !== null &&
    t.runtime.authenticatedStateAgeMs + frameAge <= DASHBOARD_FRESHNESS_MS_V1;
  const sessionFresh =
    props.session !== null &&
    (props.sessionObservedAt === undefined ||
      (props.sessionObservedAt !== null &&
        props.now - props.sessionObservedAt <= DASHBOARD_FRESHNESS_MS_V1));
  const accountingFresh =
    frameFresh &&
    t.lastSuccessfulCycleAt !== null &&
    props.now - t.lastSuccessfulCycleAt <= DASHBOARD_FRESHNESS_MS_V1;
  const active = sessionFresh ? props.session?.activeSession : null;
  const e = t.overviewEvidence;
  const activeSession = active != null && !['ENDED', 'INTERRUPTED'].includes(active.status);
  const matched =
    activeSession &&
    e?.sessionId === active.sessionId &&
    t.runtime.executionSessionId === active.sessionId;
  const pnl = matched && accountingFresh ? (e?.sessionPnlUsd ?? null) : null;
  const limit = activeSession ? active.configSnapshot.maxLossUsd : null;
  const volume = matched && accountingFresh ? (e?.totalExecutedVolumeUsd ?? null) : null;
  const pending = frameFresh
    ? t.intents.filter((i) => isDecibelUnresolvedIntentStatusV1(i.status))
    : [];
  const last = [...t.intents]
    .filter(
      (i) =>
        ['PLACE', 'CANCEL', 'REPLACE'].includes(i.action) &&
        [
          'APPLIED',
          'EXTERNALLY_NEUTRALIZED',
          'CANCELLED_EXTERNALLY',
          'FAILED_TIMEOUT',
          'FAILED_DROPPED',
          'ACKNOWLEDGED',
        ].includes(i.status),
    )
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  // Routine order confirmation is shown as the RECONCILING action, not as a wait reason.
  const runtimeReason = frameFresh
    ? (t.runtime.lastError ??
      (t.runtime.executionBlockerKind === 'RECONCILING' ? null : t.runtime.executionBlocker) ??
      t.runtime.whyNoAction)
    : null;
  const status = !sessionFresh
    ? 'WAITING'
    : props.session?.state === 'RECOVERY_BLOCKED' || props.session?.state === 'BLOCKED'
      ? 'ERROR'
      : !activeSession
        ? 'STOPPED'
        : !frameFresh
          ? 'WAITING'
          : t.runtime.lastError
            ? 'ERROR'
            : props.session?.state !== 'RUNNING' ||
                !t.runtime.executionLoopRunning ||
                t.runtime.executionLoopHealthy === false ||
                runtimeReason
              ? 'WAITING'
              : 'RUNNING';
  const reason = !sessionFresh
    ? 'SESSION STATE UNAVAILABLE'
    : (props.session?.recoveryBlocker ??
      (activeSession && !frameFresh ? 'EXECUTION DATA STALE' : runtimeReason));
  const submitting = pending.find((i) => i.status === 'SUBMITTING');
  const action =
    submitting?.action === 'PLACE'
      ? `PLACING ${submitting.side}`
      : submitting?.action === 'CANCEL'
        ? 'CANCELLING'
        : pending.length
          ? 'RECONCILING'
          : status === 'STOPPED' || status === 'RUNNING'
            ? 'HOLD'
            : 'WAIT';
  const asks = t.ladder
    .filter(
      (level) =>
        level.side === 'SELL' &&
        Number.isFinite(level.desiredPrice) &&
        level.desiredPrice > 0 &&
        Number.isFinite(level.desiredQuantity) &&
        level.desiredQuantity > 0,
    )
    .reverse();
  const bids = t.ladder.filter(
    (level) =>
      level.side === 'BUY' &&
      Number.isFinite(level.desiredPrice) &&
      level.desiredPrice > 0 &&
      Number.isFinite(level.desiredQuantity) &&
      level.desiredQuantity > 0,
  );
  const sessionMetric = (value: Value) =>
    !sessionFresh
      ? 'UNAVAILABLE'
      : !activeSession
        ? 'NO SESSION'
        : !matched
          ? 'NOT VERIFIED'
          : !accountingFresh
            ? 'STALE'
            : formatNumber(value, 2, '$');
  const target = activeSession ? active.configSnapshot.targetMakerVolumeUsd : null;
  const targetVolume = volume;
  const capital = activeSession
    ? active.configSnapshot.capitalToUseUsd
    : (props.settings?.values.capitalToUseUsd ?? null);
  const targetText = !sessionFresh
    ? 'UNAVAILABLE'
    : !activeSession
      ? 'NO SESSION'
      : target !== null && target < 0
        ? 'UNTIL LIMIT'
        : formatNumber(target, 2, '$');
  const elapsed = !sessionFresh
    ? 'STALE'
    : activeSession
      ? formatSessionDurationV1(active.startedAt, null, props.now)
      : 'NO SESSION';
  const progressRatio =
    target !== null && target > 0 && targetVolume !== null ? targetVolume / target : null;
  const progressText = !activeSession
    ? !sessionFresh
      ? 'UNAVAILABLE'
      : 'NO SESSION'
    : progressRatio === null
      ? `${sessionMetric(targetVolume)} / ${targetText}`
      : `${formatNumber(targetVolume, 2, '$')} / ${targetText} | ${formatNumber(progressRatio * 100, 1)}%`;
  const maxLossText =
    !activeSession || !sessionFresh
      ? sessionMetric(null)
      : `${pnl === null ? '?' : formatNumber(Math.max(0, -pnl), 2, '$')} / ${formatNumber(limit, 2, '$')}`;
  const averageCost = calculateOverviewCostPerMillionV1(pnl, volume);
  const history = t.overviewHistory;
  const todayStart = Math.floor(props.now / 86400000) * 86400000;
  const shareEnabled =
    sessionFresh &&
    props.session?.state === 'RUNNING' &&
    activeSession &&
    active.status === 'RUNNING' &&
    frameFresh &&
    matched &&
    accountingFresh &&
    pnl !== null &&
    Number.isFinite(pnl) &&
    volume !== null &&
    Number.isFinite(volume) &&
    volume >= 0 &&
    capital !== null &&
    Number.isFinite(capital) &&
    capital > 0 &&
    limit !== null &&
    Number.isFinite(limit) &&
    limit > 0 &&
    target !== null &&
    Number.isFinite(target) &&
    targetVolume !== null &&
    Number.isFinite(targetVolume) &&
    targetVolume >= 0 &&
    elapsed !== 'UNKNOWN';
  const shareCard = (): void => {
    if (!shareEnabled || !active) return;
    openShare({
      sessionId: active.sessionId,
      status,
      action,
      progress: progressText,
      elapsed,
      capital: formatNumber(capital, 2, '$'),
      pnl: sessionMetric(pnl),
      maxLoss: maxLossText,
      target: targetText,
      volume: sessionMetric(volume),
      observedAt: t.generatedAt,
      costPerMillion: averageCost,
    });
  };

  return (
    <div className="market-view">
      <section className="market-header">
        <div className="market-copy">
          <div className="compact-market-price">
            <span>BTC/USD</span>
            <strong>{marketFresh ? formatNumber(t.market.midpoint, 1) : 'STALE'}</strong>
          </div>
          <div className="bbo-line">
            <span className="header-bid">
              BID <b>{marketFresh ? formatNumber(t.market.bestBid, 1) : 'STALE'}</b>
            </span>
            <span className="header-ask">
              ASK <b>{marketFresh ? formatNumber(t.market.bestAsk, 1) : 'STALE'}</b>
            </span>
            <span className="header-spread">
              SPREAD <b>{marketFresh ? formatNumber(t.market.spread, 1) : 'STALE'}</b>
            </span>
          </div>
        </div>
      </section>
      <section className="bot-state-panel">
        <div className="overview-bot-group">
          <div className="section-label">[ BOT STATE ]</div>
          <strong>{status}</strong>
          <div className="runtime-status-panel">
            <div className="overview-state-fields">
              <div className="runtime-status-grid overview-session-grid">
                <span>TARGET VOLUME</span>
                <b title="Session total executed volume target">{targetText}</b>
                <span>PROGRESS</span>
                <b className="overview-progress-cell" title={progressText}>
                  {progressText}
                  {progressRatio !== null && (
                    <svg
                      className="overview-session-progress"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <circle className="overview-progress-track" cx="10" cy="10" r="8" />
                      <circle
                        className="overview-progress-fill"
                        cx="10"
                        cy="10"
                        r="8"
                        pathLength="100"
                        strokeDasharray="100"
                        strokeDashoffset={100 - Math.min(100, Math.max(0, progressRatio * 100))}
                        transform="rotate(-90 10 10)"
                      />
                    </svg>
                  )}
                </b>
                <span>ELAPSED TIME</span>
                <b>{elapsed}</b>
                <span>CAPITAL</span>
                <b>{formatNumber(capital, 2, '$')}</b>
                <span>SESSION PNL</span>
                <b
                  className={getPnlSemanticClassV1(pnl)}
                  title="Net PnL in real time = realized + unrealized - trading fees; gas excluded"
                >
                  {pnl === null ? sessionMetric(pnl) : formatOperatorPnlV1(pnl)}
                </b>
                <span>MAX LOSS</span>
                <b
                  className={getLossUtilizationSemanticClassV1(
                    pnl === null || limit === null ? null : Math.max(0, -pnl) / limit,
                  )}
                  title="Canonical session loss used / active limit"
                >
                  {maxLossText}
                </b>
              </div>
              <div className="runtime-status-grid">
                <span>CURRENT ACTION</span>
                <b>{action}</b>
                <span>POSITION</span>
                <b>
                  {accountFresh
                    ? `${t.inventory.direction} ${formatNumber(t.inventory.positionBase === null ? null : Math.abs(t.inventory.positionBase), 8)} BTC`
                    : 'UNVERIFIED'}
                </b>
                <span>OPEN ORDERS</span>
                <b>{accountFresh ? t.orders.length : 'UNVERIFIED'}</b>
                <span>LAST ACTION</span>
                <b>
                  {last
                    ? `${formatTime(last.timestamp)} ${last.action} ${last.side} / ${last.status}`
                    : 'NOT VERIFIED'}
                </b>
                <span>REASON</span>
                <b>
                  {status === 'RUNNING' || status === 'STOPPED'
                    ? 'NONE'
                    : (reason ?? 'WAITING FOR EXECUTION EVIDENCE')}
                </b>
              </div>
            </div>
            <div className="overview-share-actions">
              <button
                type="button"
                aria-label="Share Card"
                onClick={() => void shareCard()}
                disabled={!shareEnabled}
                title={
                  shareEnabled
                    ? 'Share Card: preview the running session PNG'
                    : 'Share Card: a verified running session is required'
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="m8.59 13.51 6.82 3.98M15.41 6.51l-6.82 3.98" />
                </svg>
              </button>
            </div>
            {preview}
          </div>
        </div>
      </section>
      <section className="quote-section">
        <div className="overview-quotes-group">
          <div className="section-label">[ LIVE QUOTES ]</div>
          <div className="quote-book">
            <div className="side-label sell">SELL</div>
            {marketFresh && asks.map((level) => <QuoteLine key={level.levelId} level={level} />)}
            <div className="quote-mid">
              <i /> BTC {marketFresh ? formatNumber(t.market.midpoint, 1) : 'STALE'} <i />
            </div>
            {marketFresh && bids.map((level) => <QuoteLine key={level.levelId} level={level} />)}
            <div className="side-label buy">BUY</div>
            {(!marketFresh || asks.length + bids.length === 0) && (
              <div className="quote-empty">{marketFresh ? 'NO VALID QUOTES' : 'STALE QUOTES'}</div>
            )}
          </div>
        </div>
      </section>
      <section className="inventory-strip">
        <div>
          <small>TOTAL SESSIONS EXECUTED</small>
          <strong title="All persisted sessions that reached RUNNING, including the current session; failed starts excluded">
            {!frameFresh
              ? 'STALE'
              : history?.totalSessionsExecuted == null
                ? 'UNVERIFIED'
                : formatNumber(history.totalSessionsExecuted, 0)}
          </strong>
        </div>
        <div>
          <small>TOTAL EXECUTED VOLUME</small>
          <strong title="All sessions ever run (sessions removed by retention stay counted) plus the current session in real time">
            {!frameFresh
              ? 'STALE'
              : history?.lifetimeVolumeUsd == null
                ? 'UNVERIFIED'
                : formatNumber(history.lifetimeVolumeUsd, 2, '$')}
          </strong>
        </div>
        <div>
          <small>ALL-TIME PNL</small>
          <strong
            className={getPnlSemanticClassV1(
              frameFresh ? (history?.allTimeNetPnlUsd ?? null) : null,
            )}
            title={`Net PnL of all sessions plus the current session in real time (after trading fees; gas excluded).${
              history?.allTimeIncompletePnlCount
                ? ` ${history.allTimeIncompletePnlCount} session(s) without final PnL are excluded.`
                : ''
            }`}
          >
            {!frameFresh
              ? 'STALE'
              : history?.allTimeNetPnlUsd == null
                ? 'UNVERIFIED'
                : formatOperatorPnlV1(history.allTimeNetPnlUsd)}
          </strong>
        </div>
        <div>
          <small>COST / 1M VOL</small>
          <strong title="Current session net cost = -(realized + unrealized - trading fees) / executed USD volume * 1,000,000. Fees already included; gas excluded. Profit means negative cost.">
            {!activeSession
              ? !sessionFresh
                ? 'UNAVAILABLE'
                : 'NO SESSION'
              : !accountingFresh
                ? 'STALE'
                : averageCost === null
                  ? 'NOT AVAILABLE'
                  : formatNumber(averageCost, 2, '$')}
          </strong>
        </div>
        <div>
          <small>TODAY VOL (UTC)</small>
          <strong title="All verified bot fills in the canonical ledger for the current UTC day; independent of session reset">
            {!frameFresh
              ? 'STALE'
              : !history
                ? 'UNVERIFIED'
                : history.utcDayStart !== todayStart
                  ? 'STALE'
                  : history.volumeSinceUTCStartUsd === null
                    ? 'UNVERIFIED'
                    : formatNumber(history.volumeSinceUTCStartUsd, 2, '$')}
          </strong>
        </div>
      </section>
    </div>
  );
};

const AlertDrawer = (
  props: Readonly<{
    active: readonly operator_alert_v1[];
    recent: readonly operator_alert_v1[];
    close: () => void;
  }>,
) => (
  <div
    className="alert-drawer-layer"
    onMouseDown={(event) => event.currentTarget === event.target && props.close()}
  >
    <aside className="alert-drawer" aria-label="Operator alerts">
      <header>
        <h2>ALERTS</h2>
        <button onClick={props.close} aria-label="Close alerts">
          X
        </button>
      </header>
      <div className="alert-drawer-scroll">
        <div className="section-label">[ ACTIVE ]</div>
        {props.active.length === 0 ? (
          <div className="positions-empty">NONE</div>
        ) : (
          props.active.map((alert) => <AlertRow key={alert.id} alert={alert} />)
        )}
        <div className="section-label">[ RECENT ]</div>
        {props.recent.length === 0 ? (
          <div className="positions-empty">NONE</div>
        ) : (
          props.recent.map((alert) => <AlertRow key={alert.id} alert={alert} />)
        )}
      </div>
    </aside>
  </div>
);

const AlertRow = (props: Readonly<{ alert: operator_alert_v1 }>) => (
  <div
    className={`alert-row ${props.alert.severity.toLowerCase()} ${props.alert.active ? 'active' : 'cleared'}`}
  >
    <time>{formatTime(props.alert.timestamp)}</time>
    <b>{props.alert.severity}</b>
    <small>{props.alert.source}</small>
    <strong>{props.alert.message}</strong>
    <span>
      {props.alert.code ?? ''}
      {props.alert.relatedId === undefined ? '' : ` / ${props.alert.relatedId}`}
    </span>
  </div>
);

export const SessionInlineDetail = (
  props: Readonly<{ telemetry: Telemetry; session: ProductionSession }>,
) => {
  return (
    <div className="session-inline-detail" id={`session-detail-${props.session.sessionId}`}>
      <div className="inline-session-summary">
        <div
          className="section-label"
          title={`Session ID: ${props.session.sessionId}; Fees: ${formatNumber(props.session.feesUsd, 2, '$')}; Gas: ${formatNumber(props.session.gasUsd, 2, '$')}; Places: ${formatOperatorValueV1(props.session.placeCount, 0)}; Cancels: ${formatOperatorValueV1(props.session.cancelCount, 0)}; Reconciliations: ${formatOperatorValueV1(props.session.reconciliationCount, 0)}; Blockers: ${formatOperatorValueV1(props.session.blockerCount, 0)}`}
        >
          [ SUMMARY ]
        </div>
        <span>
          START <b>{formatTime(props.session.startedAt)}</b>
        </span>
        <span>
          END <b>{props.session.endedAt === null ? '\u2014' : formatTime(props.session.endedAt)}</b>
        </span>
        <span>
          DURATION{' '}
          <b>
            <SessionDuration
              startedAt={props.session.startedAt}
              endedAt={props.session.endedAt}
              now={props.telemetry.generatedAt}
              running={props.session.status === 'RUNNING' || props.session.status === 'STOPPING'}
            />
          </b>
        </span>
        <span>
          FINAL STATUS <b className={props.session.status.toLowerCase()}>{props.session.status}</b>
        </span>
        <span>
          SESSION PNL{' '}
          <b className={getPnlSemanticClassV1(props.session.sessionPnlUsd)}>
            {formatOperatorPnlV1(props.session.sessionPnlUsd)}
            {!props.session.pnlComplete && ' PARTIAL'}
          </b>
        </span>
        <span>
          EXECUTED VOLUME{' '}
          <b
            title={`Maker: ${formatNumber(props.session.makerVolumeUsd, 2, '$')} / Taker: ${formatNumber(props.session.takerVolumeUsd, 2, '$')} / Target: Total Executed Volume`}
          >
            {formatNumber(props.session.totalExecutedVolumeUsd, 2, '$')}
          </b>
        </span>
        <span>
          FILLS <b>{formatOperatorValueV1(props.session.fillCount, 0)}</b>
        </span>
        <span>
          STOP REASON{' '}
          <b title={props.session.stopReason ?? undefined}>
            {getOperatorStopReasonV1(props.session.stopReason)}
          </b>
        </span>
      </div>
      <div className="inline-session-config">
        <div className="section-label">[ CONFIG ]</div>
        <span>
          CAPITAL <b>{formatNumber(props.session.configSnapshot.capitalToUseUsd, 2, '$')}</b>
        </span>
        <span>
          MAX LOSS <b>{formatNumber(props.session.configSnapshot.maxLossUsd, 2, '$')}</b>
        </span>
        <span>
          VOLUME{' '}
          <b>
            {props.session.configSnapshot.targetMakerVolumeUsd < 0
              ? 'UNTIL CAPITAL LIMIT'
              : formatNumber(props.session.configSnapshot.targetMakerVolumeUsd, 0, '$')}
          </b>
        </span>
        <span>
          ENTRY SIZE POLICY <b>DYNAMIC V1</b>
        </span>
        <span>
          PREFERRED ENTRY{' '}
          <b>
            {props.session.configSnapshot.targetMakerVolumeUsd > 0
              ? formatNumber(
                  Math.max(10, (props.session.configSnapshot.targetMakerVolumeUsd * 3) / 20),
                  2,
                  '$',
                )
              : 'ALLOCATED CAPITAL / 4'}
          </b>
        </span>
        <SessionHistoryActions session={props.session} observedAt={props.telemetry.generatedAt} />
      </div>
    </div>
  );
};

export const ActivityView = (
  props: Readonly<{ telemetry: Telemetry; sessions: ProductionSession[] }>,
) => {
  const ordered = useMemo(
    () => sortOperatorSessionsNewestFirstV1(props.sessions),
    [props.sessions],
  );
  // A live session's persisted PnL is not final yet: show the real-time net PnL instead.
  const isLiveSession = (session: { sessionId: string; status: string }) =>
    isDecibelActiveSessionStatusV1(session.status) &&
    props.telemetry.overviewEvidence?.sessionId === session.sessionId;
  const getLiveSessionPnl = (session: {
    sessionId: string;
    status: string;
    sessionPnlUsd: number | null;
  }) =>
    isLiveSession(session)
      ? (props.telemetry.overviewEvidence?.sessionPnlUsd ?? session.sessionPnlUsd)
      : session.sessionPnlUsd;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = ordered.find((session) => session.sessionId === selectedId) ?? null;
  return (
    <div className="detail-view history-view">
      <div className="detail-heading">
        <h2>SESSIONS</h2>
      </div>
      <div
        className="session-history-scroll"
        role="region"
        aria-label="Session History"
        tabIndex={0}
      >
        <section className="session-history">
          <div className="session-history-row session-history-head">
            <span>START</span>
            <span>DURATION</span>
            <span>STATUS</span>
            <span>SESSION PNL</span>
            <span>TARGET PROGRESS</span>
            <span>FILLS</span>
            <span>STOP REASON</span>
          </div>
          {ordered.length === 0 ? (
            <div className="positions-empty">NO SESSIONS YET</div>
          ) : (
            ordered.map((session) => (
              <div className="session-accordion-row" key={session.sessionId}>
                <button
                  className={`session-history-row ${selected?.sessionId === session.sessionId ? 'selected' : ''}`}
                  aria-expanded={selected?.sessionId === session.sessionId}
                  aria-controls={`session-detail-${session.sessionId}`}
                  title={`Session ID: ${session.sessionId}`}
                  onClick={() =>
                    setSelectedId((current) =>
                      getNextExpandedSessionIdV1(current, session.sessionId),
                    )
                  }
                >
                  <span>{formatTime(session.startedAt)}</span>
                  <span>
                    <SessionDuration
                      startedAt={session.startedAt}
                      endedAt={session.endedAt}
                      now={props.telemetry.generatedAt}
                      running={session.status === 'RUNNING' || session.status === 'STOPPING'}
                    />
                  </span>
                  <b className={session.status.toLowerCase()}>{session.status}</b>
                  <strong className={getPnlSemanticClassV1(getLiveSessionPnl(session))}>
                    {formatOperatorPnlV1(getLiveSessionPnl(session))}
                    {!session.pnlComplete && !isLiveSession(session) && <small>PARTIAL</small>}
                  </strong>
                  <span>{formatNumber(session.totalExecutedVolumeUsd, 2, '$')}</span>
                  <span>{formatOperatorValueV1(session.fillCount, 0)}</span>
                  <span title={session.stopReason ?? undefined}>
                    {getOperatorStopReasonV1(session.stopReason)}
                  </span>
                </button>
                {selected?.sessionId === session.sessionId && (
                  <SessionInlineDetail telemetry={props.telemetry} session={session} />
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
};

export const SettingsView = (
  props: Readonly<{
    hidden: boolean;
    tradingDecision: trading_decision_v1 | null;
    projectionReady: boolean;
    settings: OperatorSettings | null;
    session: SessionState | null;
    startBlocked: boolean;
    startBlockReason: string | null;
    accountEquityUsd: number | null;
    availableMarginUsd: number | null;
    availableMarginReason: string | null;
    marginEvidenceStatus: 'fresh' | 'stale' | 'unknown';
    marginUsedUsd: number | null;
    marginUsedReason: string | null;
    telemetryGeneratedAt: number;
    sessionTargetVolumeUsd: number | null;
    etaEvidenceReady: boolean;
    volumeSessionId: string | null;
    latestSessionStatus: ProductionSession['status'] | null;
    latestSessionId: string | null;
    maximumEffectiveLeverage: number | null;
    venueMaximumNotionalUsd: number | null;
    effectivePositionLimitUsd: number | null;
    entrySizeUsd?: number | null;
    executionLoopRunning: boolean;
    executionLoopHealthy?: boolean;
    executionBlocker: string | null;
    publishSessionWarning: (message: string | null) => void;
    refreshSettings: (confirmed?: OperatorSettings) => Promise<void>;
    refreshSession: () => Promise<void>;
  }>,
) => {
  const current = {
    capital: props.settings?.values.capitalToUseUsd ?? null,
    maxLoss: props.settings?.values.maxLossUsd ?? null,
    targetVolume: props.settings?.values.targetMakerVolumeUsd ?? null,
  };
  const [pending, setPending] = useState<Record<keyof typeof current, string>>({
    capital: current.capital?.toString() ?? '',
    maxLoss: current.maxLoss?.toString() ?? '',
    targetVolume: current.targetVolume?.toString() ?? '',
  });
  const [volumeMode, setVolumeMode] = useState<'FIXED' | 'UNTIL_LIMIT'>(
    current.targetVolume === null || (current.targetVolume ?? -1) < 0 ? 'UNTIL_LIMIT' : 'FIXED',
  );
  const [applyResult, setApplyResult] = useState('READY');
  const [saving, setSaving] = useState(false);
  const SaveInFlight = useRef(false);
  const [startRequest, setStartRequest] = useState<session_start_request_state_v1>({
    phase: 'IDLE',
    error: null,
    notice: null,
  });
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const EndInFlight = useRef(false);
  const EndingSessionId = useRef<string | null>(null);
  useEffect(() => {
    if (
      hasConfirmedSessionEndV1(
        EndingSessionId.current,
        props.latestSessionId,
        props.latestSessionStatus,
        props.session?.activeSession === null,
      )
    ) {
      setEnding(false);
      setEndError(null);
      EndInFlight.current = false;
      EndingSessionId.current = null;
    }
  }, [props.session, props.latestSessionStatus, props.latestSessionId]);
  const [StartRequest] = useState(
    () =>
      new session_start_request_v1(
        {
          sendStart: async (revision) => {
            const response = await fetch('/api/session/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ expectedSettingsRevision: revision }),
            });
            const body: unknown = await response.json();
            return { ok: response.ok, body };
          },
          readSession: async () => {
            const response = await fetch('/api/session');
            if (!response.ok) throw new Error('SESSION_READ_FAILED');
            return (await response.json()) as SessionState;
          },
        },
        setStartRequest,
      ),
  );
  useEffect(() => {
    StartRequest.observeSession(props.session);
  }, [StartRequest, props.session]);
  useEffect(() => {
    props.publishSessionWarning(startRequest.error ?? endError);
  }, [startRequest.error, endError, props.publishSessionWarning]);
  const [volumeSamples, setVolumeSamples] = useState<readonly session_volume_sample_v1[]>([]);
  const [etaNow, setEtaNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setEtaNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setPending({
      capital: current.capital?.toString() ?? '',
      maxLoss: current.maxLoss?.toString() ?? '',
      targetVolume: current.targetVolume?.toString() ?? '',
    });
    setVolumeMode(
      current.targetVolume === null || (current.targetVolume ?? -1) < 0 ? 'UNTIL_LIMIT' : 'FIXED',
    );
  }, [props.settings?.revision]);
  useEffect(() => {
    const active = props.session?.activeSession;
    if (!active || props.volumeSessionId !== active.sessionId) {
      setVolumeSamples([]);
      return;
    }
    if (!props.etaEvidenceReady || props.sessionTargetVolumeUsd === null) return;
    const sample = {
      sessionId: active.sessionId,
      volumeUsd: props.sessionTargetVolumeUsd,
      observedAt: props.telemetryGeneratedAt,
    };
    setVolumeSamples((previous) => appendSessionVolumeSampleV1(previous, sample, active.startedAt));
  }, [
    props.session?.activeSession,
    props.volumeSessionId,
    props.sessionTargetVolumeUsd,
    props.telemetryGeneratedAt,
    props.etaEvidenceReady,
  ]);
  const dirtyCount = getSettingsChangeCountV1(current, pending, volumeMode === 'UNTIL_LIMIT');
  const capitalValidation = validateSettingsCapitalMarginV1(pending.capital, {
    availableMarginUsd: props.availableMarginUsd,
    status: props.marginEvidenceStatus,
  });
  const fieldsValid =
    Object.entries(pending).every(([key, value]) =>
      key === 'targetVolume' && volumeMode === 'UNTIL_LIMIT'
        ? true
        : value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0,
    ) && Number(pending.maxLoss) <= Number(pending.capital);
  const baseSaveDisabled =
    saving ||
    StartRequest.isBusy() ||
    props.settings === null ||
    dirtyCount === 0 ||
    capitalValidation !== 'valid' ||
    !fieldsValid;

  const savedCapitalValid =
    validateSettingsCapitalMarginV1(String(current.capital ?? ''), {
      availableMarginUsd: props.availableMarginUsd,
      status: props.marginEvidenceStatus,
    }) === 'valid';
  const startBlocked = props.startBlocked || !savedCapitalValid;
  const startAllowed = canStartOperatorSessionV1(props.settings !== null, startBlocked || saving);
  const startBlockReason = props.startBlocked
    ? (props.startBlockReason ?? 'Session readiness is blocked')
    : props.settings === null
      ? 'Waiting for saved configuration'
      : !savedCapitalValid
        ? props.marginEvidenceStatus !== 'fresh' || props.availableMarginUsd === null
          ? 'Waiting for fresh available margin'
          : 'Saved capital exceeds available margin'
        : saving
          ? 'Saving settings'
          : null;

  const isRunning =
    props.session?.activeSession !== null && props.session?.activeSession !== undefined;
  const summary = isRunning ? props.session?.activeSession?.configSnapshot : undefined;
  const getSummaryValue = (key: keyof typeof current): number | null => {
    if (summary !== undefined) {
      if (key === 'capital') return summary.capitalToUseUsd;
      if (key === 'maxLoss') return summary.maxLossUsd;
      return summary.targetMakerVolumeUsd;
    }
    return current[key];
  };
  const riskWarning = hasFullCapitalLossWarningV1(Number(pending.capital), Number(pending.maxLoss));
  const [projection, setProjection] = useState<{
    key: string;
    value: number | null;
  } | null>(null);
  const projectionQuery = new URLSearchParams({
    capitalToUseUsd: String(current.capital ?? ''),
    maxLossUsd: String(current.maxLoss ?? ''),
    targetMakerVolumeUsd: String(current.targetVolume ?? -1),
  }).toString();
  const projectionKey = `${props.settings?.revision}:${projectionQuery}:${props.telemetryGeneratedAt}:${props.projectionReady}`;
  useEffect(() => {
    if (isRunning || props.settings === null || !props.projectionReady) return;
    const Abort = new AbortController();
    void fetch(`/api/operator-settings?${projectionQuery}`, { signal: Abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('PROJECTION_UNAVAILABLE');
        const result = (await response.json()) as OperatorSettings;
        if (
          !Abort.signal.aborted &&
          result.nextSessionProjection !== undefined &&
          result.nextSessionProjection.settingsRevision === props.settings?.revision
        )
          setProjection({
            key: projectionKey,
            value: result.nextSessionProjection.entrySizeUsd ?? null,
          });
      })
      .catch(() => {
        if (!Abort.signal.aborted) setProjection({ key: projectionKey, value: null });
      });
    return () => Abort.abort();
  }, [isRunning, projectionKey]);
  const savedEntrySizeUsd = isRunning
    ? (props.entrySizeUsd ?? null)
    : props.projectionReady && projection?.key === projectionKey
      ? projection.value
      : null;
  const [draftProjection, setDraftProjection] = useState<{
    key: string;
    value: number | null;
  } | null>(null);
  // Declared after the other hooks: the Settings tests address hook state by position.
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const draftQuery = new URLSearchParams({
    capitalToUseUsd: pending.capital,
    maxLossUsd: pending.maxLoss,
    targetMakerVolumeUsd: volumeMode === 'UNTIL_LIMIT' ? '-1' : pending.targetVolume,
  }).toString();
  const draftKey = `${props.settings?.revision}:${draftQuery}:${props.telemetryGeneratedAt}:${props.projectionReady}`;
  useEffect(() => {
    if (props.settings === null || !props.projectionReady) return;
    const Abort = new AbortController();
    void fetch(`/api/operator-settings?${draftQuery}`, { signal: Abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('ENTRY_SIZE_UNAVAILABLE');
        const result = (await response.json()) as OperatorSettings;
        if (
          !Abort.signal.aborted &&
          result.nextSessionProjection !== undefined &&
          result.nextSessionProjection.settingsRevision === props.settings?.revision
        )
          setDraftProjection({
            key: draftKey,
            value: result.nextSessionProjection.entrySizeUsd ?? null,
          });
      })
      .catch(() => {
        if (!Abort.signal.aborted) setDraftProjection({ key: draftKey, value: null });
      });
    return () => Abort.abort();
  }, [draftKey]);
  const draftEntrySizeUsd =
    props.projectionReady && draftProjection?.key === draftKey ? draftProjection.value : null;
  const saveDisabled = baseSaveDisabled || draftEntrySizeUsd === null;
  // Advisory only: a Max Loss below the policy-floor minimum makes every entry RISK_BLOCKED.
  const maxLossFloorUsd = calculateSettingsMinimumMaxLossUsdV1(draftEntrySizeUsd);
  const maxLossBelowFloor = isSettingsMaxLossBelowEntryFloorV1(pending.maxLoss, draftEntrySizeUsd);
  // Advisory: below this the risk capacity cannot fund even the smallest DCA addition.
  // DCA hints only while the strategy allows additions (decibel_strategy_policy_v1).
  const dcaAdditions = DECIBEL_STRATEGY_POLICY_V1.dca.maximumAdditions;
  const maxLossDCAFloorUsd =
    dcaAdditions >= 1 ? calculateSettingsMinimumMaxLossForDCAUsdV1(draftEntrySizeUsd) : null;
  const maxLossBelowDCAFloor = isSettingsMaxLossBelowDCAFloorV1(pending.maxLoss, draftEntrySizeUsd);
  // Hint: the Max Loss needed for both DCA additions.
  const maxLossTwoDCAFloorUsd =
    dcaAdditions >= 2 ? calculateSettingsMinimumMaxLossForDCAUsdV1(draftEntrySizeUsd, 2) : null;
  const maxLossBelowTwoDCAFloor = isSettingsMaxLossBelowDCAFloorV1(
    pending.maxLoss,
    draftEntrySizeUsd,
    2,
  );
  const sessionStatusCode = StartRequest.isBusy()
    ? startRequest.phase === 'CHECKING_ACCOUNT'
      ? 'CHECKING_ACCOUNT'
      : 'STARTING_SESSION'
    : getSessionStatusCodeV1({
        sessionState: isRunning
          ? (props.session?.state ?? 'RUNNING')
          : (props.latestSessionStatus ?? props.session?.state ?? 'IDLE'),
        active: isRunning,
        blocker: props.executionBlocker,
        decision: props.tradingDecision,
      });
  const sessionStatusTone =
    sessionStatusCode === 'SESSION_ENDED' || sessionStatusCode === 'SESSION_STOPPING'
      ? 'warning'
      : isRunning && props.tradingDecision?.state === 'STOP'
        ? 'negative'
        : sessionStatusCode === 'TRADING_ACTIVE'
          ? 'active'
          : sessionStatusCode === 'READY_TO_START' && !startBlocked
            ? 'positive'
            : 'warning';
  const operatorSessionState = StartRequest.isBusy()
    ? getSessionStartButtonLabelV1(startRequest.phase)
    : props.session?.state === 'RECOVERY_BLOCKED'
      ? 'RECOVERY BLOCKED'
      : isRunning
        ? props.session?.state === 'STOPPING'
          ? 'STOPPING'
          : props.executionBlocker !== null
            ? 'EXECUTION BLOCKED'
            : !props.executionLoopRunning
              ? 'EXECUTION INACTIVE'
              : props.session?.state === 'INTERRUPTED'
                ? 'INTERRUPTED'
                : 'RUNNING'
        : startBlocked
          ? 'START BLOCKED'
          : props.latestSessionStatus === 'ENDED'
            ? 'ENDED'
            : props.latestSessionStatus === 'INTERRUPTED'
              ? 'INTERRUPTED'
              : 'READY TO START';
  const estimatedTime = formatSettingsSessionEtaV1({
    now: etaNow,
    sessionId: props.session?.activeSession?.sessionId ?? null,
    startedAt: props.session?.activeSession?.startedAt ?? null,
    running: props.session?.state === 'RUNNING',
    authenticatedVolumeReady: props.etaEvidenceReady,
    targetUsd:
      volumeMode === 'UNTIL_LIMIT'
        ? -1
        : pending.targetVolume.trim() === ''
          ? null
          : Number(pending.targetVolume),
    samples: volumeSamples,
  });
  const renderField = (
    key: keyof typeof current,
    label: string,
    warning: boolean | null = null,
  ) => {
    const pendingNumber = Number(pending[key]);
    const currentValue = key === 'targetVolume' && current[key] === null ? -1 : current[key];
    const changed = currentValue !== pendingNumber;
    return (
      <label className="setting-row" key={key}>
        <span className="setting-label">
          {label}
          {warning !== null && (
            <button
              type="button"
              className={`field-warning-icon ${warning ? 'visible' : ''}`}
              aria-label="Max loss is 100% of allocated capital"
              aria-hidden={!warning}
              tabIndex={warning ? 0 : -1}
            >
              ⚠<span role="tooltip">Max loss is 100% of allocated capital</span>
            </button>
          )}
        </span>
        <input
          inputMode="decimal"
          value={pending[key]}
          onChange={(event) => setPending({ ...pending, [key]: event.target.value })}
        />
        {key === 'capital' && capitalValidation === 'exceeds' ? (
          <small>EXCEEDS AVAILABLE MARGIN</small>
        ) : key === 'capital' &&
          capitalValidation === 'valid' &&
          props.projectionReady &&
          draftProjection?.key === draftKey &&
          draftEntrySizeUsd === null ? (
          <small>INSUFFICIENT CAPITAL FOR ENTRY</small>
        ) : key === 'maxLoss' && maxLossBelowFloor && maxLossFloorUsd !== null ? (
          <small>{`TOO SMALL FOR ENTRY (MIN ${formatSettingsMinimumMaxLossUsdV1(maxLossFloorUsd)})`}</small>
        ) : key === 'maxLoss' && maxLossBelowDCAFloor && maxLossDCAFloorUsd !== null ? (
          <small>{`NOT ENOUGH FOR DCA (MIN ${formatSettingsMinimumMaxLossUsdV1(maxLossDCAFloorUsd)}${
            maxLossTwoDCAFloorUsd === null
              ? ''
              : ` · 2× ${formatSettingsMinimumMaxLossUsdV1(maxLossTwoDCAFloorUsd)}`
          })`}</small>
        ) : key === 'maxLoss' && maxLossBelowTwoDCAFloor && maxLossTwoDCAFloorUsd !== null ? (
          <small>{`2× DCA NEEDS MIN ${formatSettingsMinimumMaxLossUsdV1(maxLossTwoDCAFloorUsd)}`}</small>
        ) : changed ? (
          <small>CHANGED</small>
        ) : null}
      </label>
    );
  };
  const startSession = (): void => {
    if (!props.settings || SaveInFlight.current || !startAllowed) return;
    void StartRequest.start(props.settings.revision)
      .then(() => props.refreshSession())
      .catch(() => undefined);
  };
  const canEndSession = (): boolean =>
    !EndInFlight.current &&
    !ending &&
    props.session?.activeSession != null &&
    props.session.ownerState === 'OWNED';
  const endSession = (): void => {
    if (canEndSession()) setConfirmingEnd(true);
  };
  const confirmEndSession = (): void => {
    setConfirmingEnd(false);
    if (!canEndSession() || !props.session?.activeSession) return;
    EndInFlight.current = true;
    EndingSessionId.current = props.session.activeSession.sessionId;
    setEnding(true);
    setEndError(null);
    void fetch('/api/session/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok) {
          const error =
            typeof result === 'object' &&
            result !== null &&
            'error' in result &&
            typeof result.error === 'string'
              ? result.error
              : 'SESSION_END_FAILED';
          throw new Error(error);
        }
        await props.refreshSession();
      })
      .catch((error: unknown) => {
        setEnding(false);
        setEndError(
          error instanceof Error
            ? error.message
            : 'Unable to confirm session end. Check session state before retrying.',
        );
      })
      .finally(() => {
        EndInFlight.current = false;
      });
  };
  return (
    <div className="detail-view settings-view" hidden={props.hidden}>
      <div className="detail-heading">
        <h2>SESSION CONFIGURATION</h2>
      </div>
      <div className={`settings-status ${dirtyCount > 0 ? 'dirty' : ''}`}>
        {dirtyCount > 0
          ? `${dirtyCount} UNSAVED CHANGES`
          : `SAVED \u00b7 REV ${props.settings?.revision ?? 0}`}
        {isRunning && <span>NEXT SESSION</span>}
        {isRunning && props.session?.activeSession !== null && (
          <span>ACTIVE SESSION · REV {props.session?.activeSession?.configRevision}</span>
        )}
      </div>
      <div className="settings-workspace">
        <section className="settings-form">
          <fieldset disabled={saving}>
            {renderField('capital', 'CAPITAL TO USE')}
            <div className="volume-mode-field">
              <span>VOLUME MODE</span>
              <div className="segmented-control">
                <button
                  className={volumeMode === 'FIXED' ? 'active' : ''}
                  onClick={() => setVolumeMode('FIXED')}
                >
                  FIXED TARGET
                </button>
                <button
                  className={volumeMode === 'UNTIL_LIMIT' ? 'active' : ''}
                  onClick={() => setVolumeMode('UNTIL_LIMIT')}
                >
                  UNTIL CAPITAL LIMIT
                </button>
              </div>
            </div>
            {volumeMode === 'FIXED' ? (
              renderField('targetVolume', 'TARGET TRADING VOLUME')
            ) : (
              <div className="setting-row read-only-row">
                <span>TARGET TRADING VOLUME</span>
                <b>NO FIXED TARGET</b>
              </div>
            )}
            <small>NEW SESSIONS: ALL EXECUTED MAKER + TAKER FILLS, INCLUDING IOC AND CLOSES.</small>
          </fieldset>
          <fieldset disabled={saving}>
            <legend>RISK</legend>
            {renderField('maxLoss', 'MAX LOSS', riskWarning)}
            <div className="setting-row read-only-row">
              <span title="Per-entry notional USD after venue rounding and available margin constraints.">
                ENTRY SIZE
              </span>
              <b>
                {draftEntrySizeUsd === null
                  ? 'UNAVAILABLE'
                  : formatNumber(draftEntrySizeUsd, 2, '$')}
              </b>
            </div>
            <div className="setting-row read-only-row">
              <span>ESTIMATED TIME</span>
              <b>{estimatedTime}</b>
            </div>
          </fieldset>
          <div className="settings-actions">
            <button
              disabled={saving}
              onClick={() => {
                if (SaveInFlight.current) return;
                setPending({
                  capital: current.capital?.toString() ?? '',
                  maxLoss: current.maxLoss?.toString() ?? '',
                  targetVolume: current.targetVolume?.toString() ?? '',
                });
                setVolumeMode(
                  current.targetVolume === null || current.targetVolume < 0
                    ? 'UNTIL_LIMIT'
                    : 'FIXED',
                );
              }}
            >
              DISCARD
            </button>
            <button
              disabled={saveDisabled}
              onClick={() => {
                if (saveDisabled || SaveInFlight.current || StartRequest.isBusy()) return;
                SaveInFlight.current = true;
                setSaving(true);
                setApplyResult('SAVING');
                const values = {
                  capitalToUseUsd: Number(pending.capital),
                  maxLossUsd: Number(pending.maxLoss),
                  targetMakerVolumeUsd:
                    volumeMode === 'UNTIL_LIMIT' ? -1 : Number(pending.targetVolume),
                };
                void fetch('/api/operator-settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ expectedRevision: props.settings?.revision, values }),
                })
                  .then(async (response) => {
                    const result: unknown = await response.json();
                    if (!response.ok) throw new Error('SETTINGS_SAVE_FAILED');
                    if (typeof result !== 'object' || result === null || !('settings' in result))
                      throw new Error('SETTINGS_CONFIRMATION_MISSING');
                    const confirmed = parseSavedSettingsV1(result.settings);
                    if (confirmed.revision <= (props.settings?.revision ?? -1))
                      throw new Error('SETTINGS_CONFIRMATION_STALE');
                    await props.refreshSettings(confirmed);
                    setApplyResult('CHANGES SAVED');
                  })
                  .catch(() =>
                    setApplyResult('Unable to confirm save; check settings and session status'),
                  )
                  .finally(() => {
                    SaveInFlight.current = false;
                    setSaving(false);
                  });
              }}
            >
              SAVE CHANGES
            </button>
          </div>
          {applyResult !== 'READY' && <p role="status">{applyResult}</p>}
        </section>
        <aside className="session-summary">
          <div className="session-status-summary">
            <strong>{operatorSessionState}</strong>
            <div
              className={`session-state-slot ${!isRunning && startBlocked ? 'warning' : 'neutral'}`}
              data-tone={sessionStatusTone}
              aria-live="polite"
            >
              <span
                className="session-status-code"
                tabIndex={0}
                title={sessionStatusCode}
                aria-label={sessionStatusCode}
              >
                {sessionStatusCode}
              </span>
            </div>
            <span className="session-summary-timer">
              {isRunning && props.session?.activeSession !== null && (
                <SessionDuration
                  startedAt={props.session.activeSession.startedAt}
                  endedAt={props.session.activeSession.endedAt}
                  now={props.telemetryGeneratedAt}
                  running={props.session.state === 'RUNNING' || props.session.state === 'STOPPING'}
                />
              )}
            </span>
          </div>
          <div className="summary-list">
            <div>
              <span className="session-configuration-label">Account Equity</span>
              <strong>{formatNumber(props.accountEquityUsd, 2, '$')}</strong>
            </div>
            <div className="secondary-summary-value">
              <span className="session-configuration-label">Available Margin</span>
              <strong>{formatNumber(props.availableMarginUsd, 2, '$')}</strong>
            </div>
            <div className="secondary-summary-value">
              <span className="session-configuration-label">Margin Used</span>
              <strong>{formatNumber(props.marginUsedUsd, 2, '$')}</strong>
            </div>
            <div>
              <span className="session-configuration-label">Capital</span>
              <strong>{formatNumber(getSummaryValue('capital'), 2, '$')}</strong>
            </div>
            <div>
              <span className="session-configuration-label">Max Loss</span>
              <strong>{formatNumber(getSummaryValue('maxLoss'), 2, '$')}</strong>
            </div>
            <div>
              <span className="session-configuration-label">Volume</span>
              <strong>
                {getSummaryValue('targetVolume') === null ||
                (getSummaryValue('targetVolume') ?? -1) < 0
                  ? 'Until Capital Limit'
                  : formatNumber(getSummaryValue('targetVolume'), 0, '$')}
              </strong>
            </div>
            <div>
              <span className="session-configuration-label">Quote Size</span>
              <strong>DYNAMIC</strong>
            </div>
            <div>
              <span className="session-configuration-label">Entry Size</span>
              <strong>
                {savedEntrySizeUsd === null
                  ? 'UNAVAILABLE'
                  : formatNumber(savedEntrySizeUsd, 2, '$')}
              </strong>
            </div>
          </div>
          <>
            <SessionActionButton
              sessionStatus={
                props.session?.activeSession?.status ??
                (props.latestSessionStatus === 'ENDED' ? 'ENDED' : 'IDLE')
              }
              owned={props.session?.ownerState === 'OWNED'}
              startPhase={startRequest.phase}
              startAllowed={startAllowed}
              startBlockReason={startBlockReason}
              ending={ending}
              onStart={startSession}
              onEnd={endSession}
            />
            {confirmingEnd && (
              <ConfirmDialog
                title="END SESSION"
                message="End the current session? The bot stops opening positions, closes the open position with reduce-only orders and reconciles all orders before the session ends."
                confirmLabel="END SESSION"
                onConfirm={confirmEndSession}
                onCancel={() => setConfirmingEnd(false)}
              />
            )}
            {startRequest.notice && <p role="status">{startRequest.notice}</p>}
          </>
        </aside>
      </div>
    </div>
  );
};

const App = () => {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const [settings, setSettings] = useState<OperatorSettings | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionObservedAt, setSessionObservedAt] = useState<number | null>(null);
  const [sessions, setSessions] = useState<ProductionSession[]>([]);
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);
  const [alertDrawerOpen, setAlertDrawerOpen] = useState(false);
  const refreshSettings = async (confirmed?: OperatorSettings): Promise<void> => {
    if (confirmed !== undefined) {
      setSettings((previous) => selectSavedSettingsV1(previous, parseSavedSettingsV1(confirmed)));
      return;
    }
    const response = await fetch('/api/operator-settings');
    if (!response.ok) throw new Error('SETTINGS_READ_FAILED');
    const next = parseSavedSettingsV1(await response.json());
    setSettings((previous) => selectSavedSettingsV1(previous, next));
  };
  const SessionReadVersion = useRef(0);
  const refreshSession = async (): Promise<void> => {
    const version = ++SessionReadVersion.current;
    const [stateResponse, historyResponse] = await Promise.all([
      fetch('/api/session'),
      fetch('/api/session-history'),
    ]);
    if (!stateResponse.ok || !historyResponse.ok) throw new Error('SESSION_READ_FAILED');
    const nextSession = (await stateResponse.json()) as SessionState;
    const nextHistory = (await historyResponse.json()) as ProductionSession[];
    if (version !== SessionReadVersion.current) return;
    setSession(nextSession);
    setSessionObservedAt(Date.now());
    setSessions(nextHistory);
  };
  const [view, setView] = useState<dashboard_view_v1>(() =>
    getDashboardTabFromSearchV1(window.location.search),
  );
  const navigateTab = (next: dashboard_view_v1): void => {
    if (getDashboardTabFromSearchV1(window.location.search) !== next)
      window.history.pushState(null, '', getDashboardTabUrlV1(window.location.href, next));
    setView(getDashboardTabFromSearchV1(window.location.search));
  };
  useEffect(() => {
    const syncTab = (): void => setView(getDashboardTabFromSearchV1(window.location.search));
    window.addEventListener('popstate', syncTab);
    return () => window.removeEventListener('popstate', syncTab);
  }, []);
  useEffect(() => {
    const Source = new EventSource('/api/events');
    Source.onopen = () => {
      setConnected(false);
      void refreshSettings().catch(() => undefined);
      void refreshSession().catch(() => setSession(null));
    };
    Source.onerror = () => setConnected(false);
    Source.onmessage = (event) => {
      let next: Telemetry;
      try {
        next = JSON.parse(String(event.data)) as Telemetry;
      } catch {
        setConnected(false);
        return;
      }
      if (
        !next ||
        !Number.isFinite(next.generatedAt) ||
        !next.runtime ||
        !next.inventory ||
        !Array.isArray(next.orders)
      ) {
        setConnected(false);
        return;
      }
      setConnected(true);
      setTelemetry((current) => selectNewerSnapshotV1(current, next));
    };
    return () => Source.close();
  }, []);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape')
        setAlertDrawerOpen((current) => getNextAlertDrawerStateV1(current, 'ESCAPE'));
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);
  useEffect(() => {
    void refreshSettings().catch(() => undefined);
    void refreshSession().catch(() => setSession(null));
    const interval = window.setInterval(() => {
      void refreshSession().catch(() => setSession(null));
      void refreshSettings().catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(interval);
  }, []);
  if (telemetry === null)
    return <main className="loading">DECIBEL / WAITING FOR LOCAL TELEMETRY</main>;
  const presentation = deriveDashboardPresentationV1({
    connected,
    degraded: telemetry.degraded,
    runtimeState: telemetry.runtime.state,
    dryRun: telemetry.runtime.dryRun,
    blockers: telemetry.blockers,
    intents: telemetry.intents,
    events: telemetry.events,
  });
  const riskEvidence = telemetry.overviewEvidence;
  const lossUtilization =
    !connected ||
    now - telemetry.generatedAt > DASHBOARD_FRESHNESS_MS_V1 ||
    telemetry.lastSuccessfulCycleAt === null ||
    now - telemetry.lastSuccessfulCycleAt > DASHBOARD_FRESHNESS_MS_V1 ||
    !session?.activeSession ||
    riskEvidence?.sessionId !== session.activeSession.sessionId ||
    riskEvidence?.sessionId !== telemetry.runtime.executionSessionId ||
    riskEvidence?.sessionPnlUsd == null ||
    riskEvidence.maxLossUsd == null ||
    riskEvidence.maxLossUsd <= 0
      ? null
      : Math.max(0, -riskEvidence.sessionPnlUsd) / riskEvidence.maxLossUsd;
  const alerts = buildOperatorAlertsV1({
    now: telemetry.generatedAt,
    connected,
    degraded: telemetry.degraded,
    runtimeState: telemetry.runtime.state,
    blockers: telemetry.blockers,
    events: telemetry.events,
    sessionState: session?.state ?? sessions[0]?.status ?? 'IDLE',
    sessionStopReason:
      session?.recoveryBlocker ??
      session?.activeSession?.stopReason ??
      sessions[0]?.stopReason ??
      null,
    lossUtilization,
    sessionAdmissionError: sessionWarning,
    lastStartAttempt: session?.lastStartAttempt,
    admissionReadinessBlocker: telemetry.runtime.readiness.blockingReason,
  });
  const currentAlert = selectHighestPriorityOperatorAlertV1(alerts.active);
  const sessionStartGate = deriveSessionStartGateV1({
    runtimeBlocked: presentation.abnormal,
    runtimeBlockCode: currentAlert?.code ?? null,
    runtimeBlockMessage: currentAlert?.message ?? null,
    capitalToUseUsd: settings?.values.capitalToUseUsd ?? null,
    authenticatedAccountEquityUsd: telemetry.account.collateralUsd,
    sessionState: session?.state ?? null,
    sessionBlocker: session?.recoveryBlocker ?? null,
    intents: telemetry.intents,
    blockers: telemetry.blockers,
  });
  const hasCriticalAlert = alerts.active.some(
    (alert) => alert.severity === 'CRITICAL' || alert.severity === 'ERROR',
  );
  return (
    <main className={`app-shell ${presentation.abnormal ? 'has-alert' : ''}`}>
      <header className="top-bar">
        <button className="wordmark" onClick={() => navigateTab('OVERVIEW')}>
          <img src="/branding/mm-logo.png" alt="" className="wordmark-logo" />
          DECIBEL / MM V1
        </button>
        <nav>
          {(['OVERVIEW', 'ACTIVITY', 'SETTINGS'] as const).map((item) => (
            <button
              key={item}
              className={view === item ? 'active' : ''}
              onClick={() => navigateTab(item)}
            >
              [ {item} ]
            </button>
          ))}
        </nav>
        <div className="top-state">
          <span>{telemetry.runtime.network}</span>
          <i className={presentation.status.toLowerCase()} />
          <button
            className={`alert-control ${hasCriticalAlert ? 'critical' : ''}`}
            aria-label={`${alerts.active.length} active alerts`}
            onClick={() =>
              setAlertDrawerOpen((current) => getNextAlertDrawerStateV1(current, 'OPEN'))
            }
          >
            ! {alerts.active.length}
          </button>
        </div>
      </header>
      {alertDrawerOpen && (
        <AlertDrawer
          active={alerts.active}
          recent={alerts.recent}
          close={() => setAlertDrawerOpen((current) => getNextAlertDrawerStateV1(current, 'CLOSE'))}
        />
      )}
      {view === 'OVERVIEW' ? (
        <OverviewView
          telemetry={telemetry}
          settings={settings}
          session={session}
          connected={connected}
          now={now}
          sessionObservedAt={sessionObservedAt}
        />
      ) : view === 'ACTIVITY' ? (
        <ActivityView telemetry={telemetry} sessions={sessions} />
      ) : null}
      <SettingsView
        hidden={view !== 'SETTINGS'}
        tradingDecision={telemetry.runtime.tradingDecision ?? null}
        projectionReady={
          connected &&
          !telemetry.degraded &&
          telemetry.runtime.readiness.accountReady &&
          telemetry.runtime.readiness.marketReady
        }
        settings={settings}
        session={session}
        startBlocked={sessionStartGate.blocked}
        startBlockReason={sessionStartGate.message}
        accountEquityUsd={telemetry.account.collateralUsd}
        availableMarginUsd={telemetry.account.availableMarginUsd}
        availableMarginReason={telemetry.account.availableMarginReason}
        marginEvidenceStatus={
          telemetry.account.availableMarginUsd === null ||
          telemetry.runtime.authenticatedStateAgeMs === null
            ? 'unknown'
            : connected &&
                telemetry.runtime.readiness.accountReady &&
                telemetry.account.availableMarginReason === null &&
                telemetry.runtime.authenticatedStateAgeMs +
                  Math.max(0, now - telemetry.generatedAt) <=
                  DASHBOARD_FRESHNESS_MS_V1
              ? 'fresh'
              : 'stale'
        }
        marginUsedUsd={telemetry.account.marginUsedUsd}
        marginUsedReason={telemetry.account.marginUsedReason}
        telemetryGeneratedAt={telemetry.generatedAt}
        sessionTargetVolumeUsd={telemetry.volume.totalExecutedVolumeUsd ?? null}
        volumeSessionId={telemetry.runtime.executionSessionId}
        etaEvidenceReady={connected && telemetry.runtime.readiness.accountReady}
        latestSessionStatus={sessions[0]?.status ?? null}
        latestSessionId={sessions[0]?.sessionId ?? null}
        maximumEffectiveLeverage={telemetry.account.effectiveLeverage}
        venueMaximumNotionalUsd={telemetry.risk.maximumNotionalUsd}
        effectivePositionLimitUsd={
          telemetry.account.exposureLimits?.effectivePositionLimitUsd ?? null
        }
        entrySizeUsd={
          telemetry.quoteSizing?.BUY && !telemetry.quoteSizing.BUY.reduceOnly
            ? telemetry.quoteSizing.BUY.finalNotionalUsd || null
            : telemetry.quoteSizing?.SELL && !telemetry.quoteSizing.SELL.reduceOnly
              ? telemetry.quoteSizing.SELL.finalNotionalUsd || null
              : null
        }
        executionLoopRunning={telemetry.runtime.executionLoopRunning}
        executionBlocker={telemetry.runtime.executionBlocker}
        publishSessionWarning={setSessionWarning}
        refreshSettings={refreshSettings}
        refreshSession={refreshSession}
      />
      <footer className="system-footer">
        <span>CONNECTION: {presentation.status}</span>
        <span>
          STATUS:{' '}
          {telemetry.runtime.tradingDecision
            ? telemetry.runtime.tradingDecision.state
            : getReadinessFooterLabelV1({
                degraded: telemetry.degraded,
                executionBlocker:
                  telemetry.runtime.executionBlocker ?? telemetry.blockers[0]?.code ?? null,
                readiness: telemetry.runtime.readiness,
              })}
        </span>
        <span>JOURNAL: {telemetry.runtime.journalStatus}</span>
        <span>AUTH AGE: {formatNumber(telemetry.runtime.authenticatedStateAgeMs, 0)} MS</span>
        <span>LAST CYCLE: {formatTime(telemetry.lastSuccessfulCycleAt)}</span>
      </footer>
    </main>
  );
};

if (typeof document !== 'undefined') {
  const root = document.getElementById('root');
  if (root === null) throw new Error('WEB_DASHBOARD_ROOT_MISSING');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
