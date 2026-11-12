export type dashboard_view_v1 = 'OVERVIEW' | 'ACTIVITY' | 'SETTINGS';

export type session_volume_sample_v1 = Readonly<{
  sessionId: string;
  observedAt: number;
  volumeUsd: number;
}>;

export function appendSessionVolumeSampleV1(
  samples: readonly session_volume_sample_v1[],
  sample: session_volume_sample_v1,
  startedAt: number | null,
): readonly session_volume_sample_v1[] {
  if (
    startedAt === null ||
    !Number.isFinite(startedAt) ||
    startedAt < 1e12 ||
    !Number.isFinite(sample.observedAt) ||
    sample.observedAt < startedAt ||
    sample.observedAt >= 1e13 ||
    !Number.isFinite(sample.volumeUsd) ||
    sample.volumeUsd < 0
  )
    return [];
  const previous = samples.at(-1);
  if (previous?.sessionId === sample.sessionId) {
    if (sample.observedAt === previous.observedAt && sample.volumeUsd === previous.volumeUsd)
      return samples;
    if (sample.observedAt <= previous.observedAt || sample.volumeUsd < previous.volumeUsd)
      return [];
  }
  return [
    ...(previous?.sessionId === sample.sessionId ? samples : []).filter(
      (s) => s.observedAt >= sample.observedAt - 300000,
    ),
    sample,
  ];
}

// Display evidence policy, not trading limits or a duration clamp: five-minute
// window, 30s coverage, two volume advances, >=$1 executed and >=$1/min throughput.
function assessSessionEtaV1(
  input: Readonly<{
    now: number;
    sessionId: string | null;
    startedAt: number | null;
    running: boolean;
    targetUsd: number | null;
    samples: readonly session_volume_sample_v1[];
  }>,
): Readonly<{ value: string | null; reason: string | null }> {
  const unavailable = (reason: string) => ({ value: null, reason });
  const ready = (value: string) => ({ value, reason: null });
  if (!input.running || input.sessionId === null) return unavailable('NO LIVE SESSION THROUGHPUT');
  if (input.targetUsd !== null && input.targetUsd < 0) return ready('NO FIXED END');
  const startedAt = input.startedAt;
  if (
    input.targetUsd === null ||
    !Number.isFinite(input.targetUsd) ||
    input.targetUsd <= 0 ||
    startedAt === null ||
    !Number.isFinite(startedAt) ||
    startedAt < 1e12 ||
    !Number.isFinite(input.now) ||
    input.now >= 1e13 ||
    startedAt > input.now
  )
    return unavailable('VALID TARGET AND SESSION TIME REQUIRED');
  const samples = input.samples;
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last) return unavailable('WAITING FOR EXECUTED VOLUME');
  if (
    !first ||
    !last ||
    samples.some(
      (s, i) =>
        s.sessionId !== input.sessionId ||
        !Number.isFinite(s.volumeUsd) ||
        s.volumeUsd < 0 ||
        !Number.isFinite(s.observedAt) ||
        s.observedAt < startedAt ||
        s.observedAt > input.now ||
        (i > 0 &&
          (s.observedAt <= samples[i - 1].observedAt || s.volumeUsd < samples[i - 1].volumeUsd)),
    )
  )
    return unavailable('INVALID SESSION VOLUME EVIDENCE');
  if (input.now - last.observedAt > 15000) return unavailable('SESSION VOLUME DATA STALE');
  if (input.now - first.observedAt > 300000) return unavailable('VOLUME WINDOW EXPIRED');
  const coverageMs = last.observedAt - first.observedAt;
  const advances = samples.filter((s, i) => i > 0 && s.volumeUsd > samples[i - 1].volumeUsd);
  const deltaUsd = last.volumeUsd - first.volumeUsd;
  const rateUsdPerMs = deltaUsd / coverageMs;
  if (coverageMs < 30000) return unavailable('COLLECTING 30 S OF VOLUME');
  if (advances.length < 2) return unavailable('NEEDS TWO VOLUME ADVANCES');
  if (deltaUsd < 1 || !Number.isFinite(rateUsdPerMs) || rateUsdPerMs < 1 / 60000)
    return unavailable('INSUFFICIENT EXECUTED THROUGHPUT');
  if (input.now - advances.at(-1)!.observedAt > 60000)
    return unavailable('NO RECENT VOLUME ADVANCE');
  const remainingUsd = input.targetUsd - last.volumeUsd;
  if (remainingUsd <= 0) return ready('TARGET REACHED | WAITING FOR AUTHENTICATED UNWIND');
  const minutes = Math.ceil(remainingUsd / rateUsdPerMs / 60000);
  if (!Number.isFinite(minutes)) return unavailable('INVALID THROUGHPUT ESTIMATE');
  if (minutes < 60) return ready(`~ ${Math.max(1, minutes)} min`);
  return ready(
    `~ ${Math.floor(minutes / 60)} h${minutes % 60 === 0 ? '' : ` ${minutes % 60} min`}`,
  );
}

export function formatSessionEtaV1(input: Parameters<typeof assessSessionEtaV1>[0]): string {
  return assessSessionEtaV1(input).value ?? 'UNKNOWN';
}

export function formatSettingsSessionEtaV1(
  input: Parameters<typeof assessSessionEtaV1>[0] & Readonly<{ authenticatedVolumeReady: boolean }>,
): string {
  if (input.targetUsd !== null && Number.isFinite(input.targetUsd) && input.targetUsd < 0)
    return 'NO FIXED END';
  if (input.targetUsd === null || !Number.isFinite(input.targetUsd) || input.targetUsd <= 0)
    return 'SET A VALID TARGET VOLUME';
  if (input.running && !input.authenticatedVolumeReady) return 'FRESH SESSION VOLUME REQUIRED';
  const result = assessSessionEtaV1(input);
  return result.value ?? result.reason!;
}

export type operator_alert_v1 = Readonly<{
  id: string;
  timestamp: number;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  source: string;
  message: string;
  code?: string;
  classification?:
    | 'VENUE_SOURCE_UNAVAILABLE'
    | 'MARKET_SAMPLES_INSUFFICIENT'
    | 'ECONOMIC_EVIDENCE_STALE'
    | 'AUTHENTICATED_ACCOUNT_STALE'
    | 'REAL_RECONCILIATION_CONFLICT';
  relatedId?: string;
  active: boolean;
}>;

export const MAX_RECENT_OPERATOR_ALERTS_V1 = 50;

export type session_start_gate_v1 = Readonly<{
  blocked: boolean;
  code: string | null;
  message: string | null;
}>;

/** Whether a request can be submitted, not whether trading is authorized. */
export function deriveSessionStartGateV1(
  input: Readonly<{
    runtimeBlocked: boolean;
    runtimeBlockCode: string | null;
    runtimeBlockMessage: string | null;
    capitalToUseUsd: number | null;
    authenticatedAccountEquityUsd: number | null;
    sessionState?: string | null;
    sessionBlocker?: string | null;
    intents?: readonly { status: string }[];
    blockers?: readonly { code: string; meaning?: string }[];
  }>,
): session_start_gate_v1 {
  if (input.sessionState === null)
    return { blocked: true, code: 'SESSION_STATE_LOADING', message: 'Loading session state.' };
  if (
    input.sessionState &&
    ['STARTING', 'RUNNING', 'STOPPING', 'RECOVERY_BLOCKED'].includes(input.sessionState)
  )
    return {
      blocked: true,
      code: input.sessionBlocker ?? 'SESSION_ALREADY_ACTIVE',
      message: input.sessionBlocker ?? 'Resolve the existing session before starting another.',
    };
  if (
    input.capitalToUseUsd === null ||
    !Number.isFinite(input.capitalToUseUsd) ||
    input.capitalToUseUsd <= 0
  )
    return {
      blocked: true,
      code: 'SETTINGS_VALIDATION_FAILED',
      message: 'Load and save valid Settings before starting.',
    };
  if (input.intents?.some((intent) => unresolvedStatuses.has(intent.status)))
    return {
      blocked: true,
      code: 'EXECUTION_RECONCILIATION_REQUIRED',
      message: 'Reconcile the pending execution outcome before starting.',
    };
  const isProhibited = (code: string) =>
    /^(?:SESSION_.*(?:OWNER|OWNERSHIP|RECONCILIATION|SETTINGS)|.*EXCLUSIVITY.*|.*IDENTITY.*|.*UNRESOLVABLE.*|.*RECONCILIATION.*|.*UNRESOLVED.*|SETTINGS_.*)$/u.test(
      code,
    );
  const knownBlocker = input.blockers?.find((blocker) => isProhibited(blocker.code));
  const blocker = knownBlocker?.code ?? input.runtimeBlockCode;
  if ((input.runtimeBlocked || knownBlocker !== undefined) && blocker && isProhibited(blocker))
    return {
      blocked: true,
      code: blocker,
      message: knownBlocker?.meaning ?? input.runtimeBlockMessage ?? blocker,
    };
  // Cached account/economic/market readiness may expire between polls. The POST
  // refreshes venue evidence and enforces current capital, risk and owner checks.
  return { blocked: false, code: null, message: null };
}

export type alert_drawer_action_v1 = 'OPEN' | 'CLOSE' | 'ESCAPE' | 'OUTSIDE';

export function getNextAlertDrawerStateV1(
  current: boolean,
  action: alert_drawer_action_v1,
): boolean {
  return action === 'OPEN'
    ? true
    : action === 'CLOSE' || action === 'ESCAPE' || action === 'OUTSIDE'
      ? false
      : current;
}

function sanitizeOperatorAlertTextV1(value: string): string {
  return value
    .replace(
      /\b(PRIVATE_KEY|SEED_PHRASE|API_TOKEN|AUTHORIZATION|WALLET_SECRET)\s*[:=]\s*\S+/gi,
      '$1=[REDACTED]',
    )
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]');
}

const alertPriority: Readonly<Record<operator_alert_v1['severity'], number>> = Object.freeze({
  CRITICAL: 4,
  ERROR: 3,
  WARNING: 2,
  INFO: 1,
});

export function selectHighestPriorityOperatorAlertV1(
  alerts: readonly operator_alert_v1[],
): operator_alert_v1 | null {
  return (
    [...alerts]
      .filter((alert) => alert.active)
      .sort(
        (left, right) =>
          alertPriority[right.severity] - alertPriority[left.severity] ||
          right.timestamp - left.timestamp,
      )[0] ?? null
  );
}

/** Classify evidence by its source, before generic reconciliation presentation. */
export function classifyOperatorEvidenceV1(
  reason: string,
): Pick<operator_alert_v1, 'classification' | 'source' | 'severity'> | null {
  if (/IDENTITY.*CONFLICT|RECONCILIATION.*CONFLICT/.test(reason))
    return {
      classification: 'REAL_RECONCILIATION_CONFLICT',
      source: 'RECONCILIATION',
      severity: 'CRITICAL',
    };
  if (/ADVERSE.*(?:INSUFFICIENT|WARMING)|MARKET_SAMPLES_INSUFFICIENT/.test(reason))
    return {
      classification: 'MARKET_SAMPLES_INSUFFICIENT',
      source: 'MARKET DATA',
      severity: 'WARNING',
    };
  if (/ECONOMIC|ADVERSE_SELECTION.*STALE/.test(reason))
    return {
      classification: 'ECONOMIC_EVIDENCE_STALE',
      source: 'ECONOMIC EVIDENCE',
      severity: 'WARNING',
    };
  if (/AUTHENTICATED.*STALE|CAPACITY_ACCOUNT_EVIDENCE_STALE/.test(reason))
    return {
      classification: 'AUTHENTICATED_ACCOUNT_STALE',
      source: 'ACCOUNT',
      severity: 'WARNING',
    };
  if (
    /BOOK_STALE|MARKET_DATA_STALE|READ_TIMEOUT|READ_STAGE|HTTP.*(?:TIMEOUT|FAILED)|SOURCE_UNAVAILABLE|CAPACITY_VENUE_MARGIN_RULES_STALE/.test(
      reason,
    )
  )
    return {
      classification: 'VENUE_SOURCE_UNAVAILABLE',
      source: 'VENUE DATA',
      severity: 'WARNING',
    };
  return null;
}

export function buildOperatorAlertsV1(
  input: Readonly<{
    now: number;
    connected: boolean;
    degraded: boolean;
    runtimeState: string;
    blockers: readonly Readonly<{ code: string; meaning: string; intentId: string | null }>[];
    events: readonly Readonly<{
      timestamp: number;
      severity: string;
      category: string;
      eventType: string;
      description: string;
    }>[];
    sessionState: string;
    sessionStopReason: string | null;
    sessionAdmissionError?: string | null;
    lastStartAttempt?: Readonly<{
      outcome: string;
      blocker: string | null;
      requestedAt: number;
    }> | null;
    admissionReadinessBlocker?: string | null;
    lossUtilization: number | null;
  }>,
): Readonly<{ active: readonly operator_alert_v1[]; recent: readonly operator_alert_v1[] }> {
  const active: operator_alert_v1[] = input.blockers.map((blocker) =>
    Object.freeze({
      id: `blocker-${blocker.code}-${blocker.intentId ?? 'none'}`,
      timestamp: input.now,
      severity: 'CRITICAL' as const,
      source: 'RECONCILIATION',
      message: sanitizeOperatorAlertTextV1(blocker.meaning),
      code: sanitizeOperatorAlertTextV1(blocker.code),
      ...(classifyOperatorEvidenceV1(blocker.code) ?? {}),
      ...(blocker.intentId === null
        ? {}
        : { relatedId: sanitizeOperatorAlertTextV1(blocker.intentId) }),
      active: true,
    }),
  );
  const rejected =
    input.lastStartAttempt?.outcome === 'REJECTED' &&
    (input.sessionState === 'IDLE' || input.sessionState === 'ENDED')
      ? input.lastStartAttempt
      : null;
  const admissionError = input.sessionAdmissionError ?? rejected?.blocker;
  if (admissionError) {
    const recovered = rejected !== null && input.admissionReadinessBlocker === null;
    active.push(
      Object.freeze({
        id: 'session-admission',
        timestamp: rejected?.requestedAt ?? input.now,
        severity: recovered ? ('WARNING' as const) : ('ERROR' as const),
        source: 'SESSION',
        code: 'SESSION_START_REJECTED',
        message: sanitizeOperatorAlertTextV1(
          rejected === null
            ? admissionError
            : `Previous Start rejected: ${admissionError}. ${
                recovered
                  ? 'Current readiness has no blocker. Explicitly request Start again; fresh venue verification is required.'
                  : `Current readiness: ${input.admissionReadinessBlocker ?? 'unknown'}. No session was started.`
              }`,
        ),
        active: true,
      }),
    );
  }
  if (!input.connected || input.degraded)
    active.push(
      Object.freeze({
        id: 'runtime-connection',
        timestamp: input.now,
        severity: input.connected ? ('WARNING' as const) : ('ERROR' as const),
        source: 'TELEMETRY',
        message: input.connected
          ? 'Authenticated telemetry is degraded'
          : 'Dashboard telemetry disconnected',
        code: input.connected ? 'TELEMETRY_DEGRADED' : 'TELEMETRY_DISCONNECTED',
        active: true,
      }),
    );
  if (input.runtimeState === 'RECONCILE_ONLY' && input.blockers.length === 0)
    active.push(
      Object.freeze({
        id: 'runtime-reconcile',
        timestamp: input.now,
        severity: 'CRITICAL',
        source: 'RECONCILIATION',
        message: 'Reconciliation required',
        code: 'RECONCILE_ONLY',
        active: true,
      }),
    );
  if (
    input.sessionState === 'INTERRUPTED' ||
    input.sessionState === 'BLOCKED' ||
    input.sessionState === 'RECOVERY_BLOCKED' ||
    input.sessionState === 'STOPPING'
  )
    active.push(
      Object.freeze({
        id: `session-${input.sessionState}`,
        timestamp: input.now,
        severity:
          input.sessionState === 'BLOCKED' || input.sessionState === 'RECOVERY_BLOCKED'
            ? 'ERROR'
            : 'WARNING',
        source: 'SESSION',
        message:
          input.sessionState === 'STOPPING'
            ? 'Session end is waiting for reconciliation'
            : input.sessionState === 'RECOVERY_BLOCKED'
              ? sanitizeOperatorAlertTextV1(
                  `Session recovery is blocked: ${input.sessionStopReason ?? 'Recovery evidence unavailable'}`,
                )
              : `Session ${input.sessionState.toLowerCase()}`,
        code: sanitizeOperatorAlertTextV1(input.sessionStopReason ?? input.sessionState),
        active: true,
      }),
    );
  if (input.lossUtilization !== null && input.lossUtilization >= 0.8)
    active.push(
      Object.freeze({
        id: 'risk-max-loss',
        timestamp: input.now,
        severity: input.lossUtilization >= 1 ? 'CRITICAL' : 'WARNING',
        source: 'RISK',
        message:
          input.lossUtilization >= 1
            ? 'Maximum session loss reached'
            : 'Maximum session loss utilization above 80%',
        code: 'MAX_LOSS_UTILIZATION',
        active: true,
      }),
    );
  const relevant =
    /block|error|fail|reconcil|stale|interrupt|risk|loss|budget|unresolved|session (?:ended|started)/i;
  const recent = input.events
    .filter((event) => relevant.test(`${event.eventType} ${event.description}`))
    .slice(0, MAX_RECENT_OPERATOR_ALERTS_V1)
    .map((event) =>
      Object.freeze({
        id: `event-${event.timestamp}-${event.eventType}`,
        timestamp: event.timestamp,
        severity:
          event.severity === 'CRITICAL'
            ? ('CRITICAL' as const)
            : event.severity === 'ERROR'
              ? ('ERROR' as const)
              : event.severity === 'WARN'
                ? ('WARNING' as const)
                : ('INFO' as const),
        source: sanitizeOperatorAlertTextV1(event.category),
        message: sanitizeOperatorAlertTextV1(event.description),
        code: sanitizeOperatorAlertTextV1(event.eventType),
        active: false,
      }),
    );
  return Object.freeze({ active: Object.freeze(active), recent: Object.freeze(recent) });
}

export type dashboard_status_input_v1 = Readonly<{
  connected: boolean;
  degraded: boolean;
  runtimeState: string;
  dryRun: boolean;
  blockers: readonly Readonly<{ code: string; meaning: string; intentId: string | null }>[];
  intents: readonly Readonly<{ intentId: string; status: string }>[];
  events: readonly Readonly<{
    timestamp: number;
    eventType: string;
    description: string;
  }>[];
}>;

export type dashboard_presentation_v1 = Readonly<{
  status: 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED';
  botState: string;
  abnormal: boolean;
  message: Readonly<{ timestamp: number | null; title: string; detail: string }>;
}>;

const unresolvedStatuses = new Set([
  'PREPARED',
  'SUBMITTING',
  'SUBMIT_UNKNOWN',
  'UNRESOLVABLE_ACK',
  'RECONCILING',
]);

export function deriveDashboardPresentationV1(
  input: dashboard_status_input_v1,
): dashboard_presentation_v1 {
  const connectionStatus = !input.connected
    ? 'DISCONNECTED'
    : input.degraded
      ? 'DEGRADED'
      : 'CONNECTED';
  const blocker = input.blockers[0];
  const unresolvedIntent = input.intents.find((intent) => unresolvedStatuses.has(intent.status));
  const latestEvent = input.events[0];
  if (blocker !== undefined)
    return Object.freeze({
      status: connectionStatus,
      botState: 'BLOCKED',
      abnormal: true,
      message: Object.freeze({
        timestamp: latestEvent?.timestamp ?? null,
        title: 'EXECUTION BLOCKED',
        detail: blocker.code,
      }),
    });
  if (unresolvedIntent !== undefined || input.runtimeState === 'RECONCILE_ONLY')
    return Object.freeze({
      status: connectionStatus,
      botState: 'RECONCILE ONLY',
      abnormal: true,
      message: Object.freeze({
        timestamp: latestEvent?.timestamp ?? null,
        title: 'RECONCILIATION REQUIRED',
        detail: unresolvedIntent?.intentId ?? 'Awaiting authenticated venue evidence',
      }),
    });
  if (connectionStatus !== 'CONNECTED')
    return Object.freeze({
      status: connectionStatus,
      botState: connectionStatus,
      abnormal: true,
      message: Object.freeze({
        timestamp: latestEvent?.timestamp ?? null,
        title: connectionStatus === 'DEGRADED' ? 'TELEMETRY DEGRADED' : 'TELEMETRY DISCONNECTED',
        detail: 'Last known values are stale until a fresh update arrives',
      }),
    });
  return Object.freeze({
    status: connectionStatus,
    botState: input.dryRun ? 'DRY RUN' : input.runtimeState,
    abnormal: false,
    message: Object.freeze({
      timestamp: latestEvent?.timestamp ?? null,
      title: latestEvent?.eventType ?? 'SYSTEM HEALTHY',
      detail: latestEvent?.description ?? 'Awaiting the next production cycle',
    }),
  });
}

export function getPrimaryMarketFieldNamesV1(): readonly string[] {
  return Object.freeze([
    'BTC/USD',
    'BOT STATE',
    'LIVE QUOTES',
    'CAPITAL',
    'SESSION PNL',
    'ALL-TIME PNL',
    'MAX LOSS',
    'VOLUME',
    'CURRENT ALERT',
  ]);
}

export function getOverviewSectionsV1(): readonly string[] {
  return Object.freeze([
    'MARKET STRIP',
    'BOT STATE',
    'LIVE QUOTES',
    'PERFORMANCE STRIP',
    'CURRENT ALERT',
    'FOOTER',
  ]);
}

export function getNextExpandedSessionIdV1(
  currentSessionId: string | null,
  clickedSessionId: string,
): string | null {
  return currentSessionId === clickedSessionId ? null : clickedSessionId;
}

export function getDashboardViewsV1(): readonly dashboard_view_v1[] {
  return Object.freeze(['OVERVIEW', 'ACTIVITY', 'SETTINGS']);
}

export function mapQuoteLadderRowsV1(
  levels: readonly Readonly<{
    levelId: string;
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    active: boolean;
  }>[],
): readonly Readonly<{
  level: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  stateMark: '●' | '○';
}>[] {
  return Object.freeze(
    levels.map((level) =>
      Object.freeze({
        level: level.levelId.replace(/^(BUY|SELL)-/, 'L'),
        side: level.side,
        price: level.price,
        quantity: level.quantity,
        stateMark: level.active ? ('●' as const) : ('○' as const),
      }),
    ),
  );
}

export function isDashboardMutationControlEnabledV1(): false {
  return false;
}

export function getPnlSemanticClassV1(value: number | null): 'positive' | 'negative' | 'neutral' {
  return value === null || value === 0 ? 'neutral' : value > 0 ? 'positive' : 'negative';
}

export function getSessionStateSemanticClassV1(
  state: string,
): 'active' | 'negative' | 'warning' | 'neutral' {
  if (state === 'RUNNING') return 'active';
  if (state === 'BLOCKED' || state === 'RECONCILE_ONLY') return 'negative';
  if (state === 'STARTING' || state === 'STOPPING' || state === 'INTERRUPTED') return 'warning';
  return 'neutral';
}

export function getLossUtilizationSemanticClassV1(
  utilization: number | null,
): 'neutral' | 'warning' | 'negative' {
  if (utilization === null || utilization < 0.5) return 'neutral';
  return utilization < 0.8 ? 'warning' : 'negative';
}

export type operator_market_label_v1 = Readonly<{ primary: string; secondary: string | null }>;

export function getOperatorMarketLabelV1(market: string): operator_market_label_v1 {
  const trimmed = market.trim();
  if (/^[A-Z0-9]+\/[A-Z0-9]+$/i.test(trimmed))
    return Object.freeze({ primary: trimmed.toUpperCase(), secondary: null });
  if (/^0x[0-9a-f]+$/i.test(trimmed))
    return Object.freeze({
      primary: 'UNKNOWN MARKET',
      secondary: `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`,
    });
  return Object.freeze({ primary: 'UNKNOWN MARKET', secondary: null });
}

export function formatOperatorValueV1(value: number | null, digits: number, prefix = ''): string {
  if (value === null) return '\u2014';
  return `${prefix}${value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatOperatorPnlV1(value: number | null): string {
  if (value === null) return '\u2014';
  return `${value > 0 ? '+' : ''}${formatOperatorValueV1(value, 2, '$')}`;
}

export function canStartOperatorSessionV1(
  settingsAvailable: boolean,
  productionBlocked: boolean,
): boolean {
  return settingsAvailable && !productionBlocked;
}

export function hasFullCapitalLossWarningV1(capital: number, maximumLoss: number): boolean {
  return capital > 0 && maximumLoss === capital;
}

export type session_time_range_v1 = Readonly<{
  sessionId: string;
  startedAt: number | null;
  endedAt: number | null;
  status: string;
}>;

export function sortOperatorSessionsNewestFirstV1<T extends session_time_range_v1>(
  sessions: readonly T[],
): readonly T[] {
  const active = new Set(['STARTING', 'RUNNING', 'STOPPING']);
  return Object.freeze(
    [...sessions].sort(
      (left, right) =>
        Number(active.has(right.status)) - Number(active.has(left.status)) ||
        (right.startedAt ?? 0) - (left.startedAt ?? 0),
    ),
  );
}

export function isTimestampInSessionV1(timestamp: number, session: session_time_range_v1): boolean {
  return (
    session.startedAt !== null &&
    timestamp >= session.startedAt &&
    (session.endedAt === null || timestamp <= session.endedAt)
  );
}

export function getOperatorStopReasonV1(reason: string | null): string {
  if (reason === null) return 'NONE';
  const known: Readonly<Record<string, string>> = Object.freeze({
    OPERATOR_END: 'OPERATOR END',
    PROCESS_SHUTDOWN: 'PROCESS SHUTDOWN',
    PROCESS_INTERRUPTED: 'PROCESS INTERRUPTED',
    TARGET_REACHED: 'TARGET REACHED',
    TARGET_VOLUME_REACHED: 'TARGET REACHED',
    TARGET_UNREACHABLE_MINIMUM_ORDER: 'REMAINING TARGET BELOW MINIMUM ORDER SIZE',
    RISK_LIMIT: 'RISK LIMIT',
    RECONCILIATION_BLOCKED: 'RECONCILIATION BLOCKED',
  });
  return known[reason] ?? reason.replaceAll('_', ' ');
}

export type session_progress_v1 = Readonly<{
  mode: 'NOT_STARTED' | 'FIXED_TARGET' | 'UNTIL_CAPITAL_LIMIT';
  makerVolumeUsd: number | null;
  targetVolumeUsd: number | null;
  ratio: number | null;
}>;

export function deriveSessionProgressV1(
  running: boolean,
  makerVolumeUsd: number | null,
  targetVolumeUsd: number | null,
): session_progress_v1 {
  if (!running)
    return Object.freeze({
      mode: 'NOT_STARTED',
      makerVolumeUsd: null,
      targetVolumeUsd: null,
      ratio: null,
    });
  if (targetVolumeUsd === null || targetVolumeUsd < 0)
    return Object.freeze({
      mode: 'UNTIL_CAPITAL_LIMIT',
      makerVolumeUsd,
      targetVolumeUsd: null,
      ratio: null,
    });
  return Object.freeze({
    mode: 'FIXED_TARGET',
    makerVolumeUsd,
    targetVolumeUsd,
    ratio:
      makerVolumeUsd === null || targetVolumeUsd <= 0
        ? null
        : Math.max(0, makerVolumeUsd / targetVolumeUsd),
  });
}

export function deriveLossLeftV1(
  maximumLossUsd: number | null,
  sessionPnlUsd: number | null,
  pnlComplete: boolean,
): number | null {
  if (!pnlComplete || maximumLossUsd === null || sessionPnlUsd === null) return null;
  return Math.max(0, maximumLossUsd - Math.max(0, -sessionPnlUsd));
}

export function deriveQuoteSideHealthV1(
  desiredCount: number,
  activeCount: number,
  blocked: boolean,
): 'ACTIVE' | 'HOLD' | 'SUPPRESSED' | 'BLOCKED' {
  if (blocked) return 'BLOCKED';
  if (activeCount > 0) return 'ACTIVE';
  return desiredCount > 0 ? 'HOLD' : 'SUPPRESSED';
}

export function deriveMarketFeedHealthV1(
  bookAgeMs: number | null,
  degraded: boolean,
  maximumBookAgeMs = 5_000,
): 'FRESH' | 'STALE' | 'UNKNOWN' {
  if (degraded) return 'STALE';
  return bookAgeMs === null ? 'UNKNOWN' : bookAgeMs > maximumBookAgeMs ? 'STALE' : 'FRESH';
}

export function getSettingsChangeCountV1(
  current: Readonly<Record<string, number | null>>,
  pending: Readonly<Record<string, string>>,
  unlimitedVolume: boolean,
): number {
  return Object.keys(current).filter((key) => {
    const pendingValue = key === 'targetVolume' && unlimitedVolume ? -1 : Number(pending[key]);
    const currentValue = key === 'targetVolume' && current[key] === null ? -1 : current[key];
    return currentValue !== pendingValue;
  }).length;
}

export function getReadinessFooterLabelV1(
  input: Readonly<{
    degraded: boolean;
    executionBlocker: string | null;
    readiness: Readonly<{
      processReady: boolean;
      accountReady: boolean;
      marketReady: boolean;
      economicReady: boolean;
      executionSafe: boolean;
    }>;
  }>,
): string {
  if (input.degraded) return 'Data degraded';
  if (!input.readiness.processReady) return 'Process stopped';
  if (!input.readiness.accountReady) return 'Account data unavailable';
  if (!input.readiness.marketReady) return 'Market data unavailable';
  if (!input.readiness.economicReady) return 'Economics unavailable';
  if (!input.readiness.executionSafe || input.executionBlocker !== null) return 'Execution blocked';
  return 'Execution checks passed';
}

export function getEffectiveAutoPositionLimitV1(
  input: Readonly<{
    accountReady: boolean;
    marketReady: boolean;
    sessionActive: boolean;
    effectivePositionLimitUsd: number | null;
  }>,
): number | null {
  const value = input.effectivePositionLimitUsd;
  return input.accountReady &&
    input.marketReady &&
    input.sessionActive &&
    value !== null &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : null;
}

export function getDashboardTabFromSearchV1(search: string): dashboard_view_v1 {
  const tab = new URLSearchParams(search).get('tab');
  return tab === 'activity' ? 'ACTIVITY' : tab === 'settings' ? 'SETTINGS' : 'OVERVIEW';
}
export function getDashboardTabUrlV1(href: string, view: dashboard_view_v1): string {
  const url = new URL(href);
  url.searchParams.set('tab', view.toLowerCase());
  return url.pathname + url.search + url.hash;
}

export function formatSessionDurationV1(
  startedAt: number | null,
  endedAt: number | null,
  now: number,
): string {
  if (
    startedAt === null ||
    !Number.isFinite(startedAt) ||
    startedAt < 0 ||
    !Number.isFinite(endedAt ?? now) ||
    (endedAt !== null && endedAt < startedAt) ||
    (endedAt === null && startedAt > now + 5000)
  )
    return 'UNKNOWN';
  const seconds = Math.floor(Math.max(0, (endedAt ?? now) - startedAt) / 1000);
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

export function getTradingDecisionReasonV1(reason: string): string {
  if (/MAX_LOSS/.test(reason)) return 'Session loss limit reached';
  if (/SESSION_STOPPING|SESSION_ENDED/.test(reason)) return 'Ending session safely';
  if (/IDENTITY|MISMATCH|RECONCIL|EXCLUSIVITY|UNRESOLVED_EXTERNAL/.test(reason))
    return 'Waiting for verified account and order reconciliation';
  if (/PERSISTENT/.test(reason)) return 'Required account evidence remains unavailable';
  if (/STALE|EVIDENCE|AUTHENTICATED|SNAPSHOT/.test(reason))
    return 'Refreshing required account and market evidence';
  if (/COST|EDGE|ECONOMIC|REGIME|NO_QUOTE|NO_EXECUTABLE/.test(reason))
    return 'Waiting for an economically eligible quote';
  if (/HEADROOM|MINIMUM|MARGIN|CAPACITY|LEVERAGED/.test(reason))
    return 'Waiting for executable account capacity';
  if (reason === 'EXECUTABLE_QUOTE_AVAILABLE') return 'Execution checks passed';
  if (reason === 'SESSION_NOT_RUNNING') return 'No active trading session';
  return 'Waiting for execution safety checks';
}

export type trading_decision_display_v1 = Readonly<{
  state: 'TRADE' | 'WAIT' | 'STOP';
  primaryReason: string;
  detailedReasons: readonly string[];
  executablePositionLimitUsd: number | null;
  perOrder: Readonly<{ BUY: number | null; SELL: number | null }>;
  evidence: Readonly<{ accountObservedAt: number | null }>;
  recoveryStatus: 'NOT_REQUIRED' | 'REFRESHING' | 'RECONCILIATION_REQUIRED' | 'TERMINAL';
}>;

/** Current-state presentation only; terminal/idle states discard previous execution errors. */
export function getSessionStatusCodeV1(
  input: Readonly<{
    sessionState: string;
    active: boolean;
    blocker: string | null;
    decision: Pick<
      trading_decision_display_v1,
      'state' | 'primaryReason' | 'recoveryStatus'
    > | null;
  }>,
): string {
  if (input.sessionState === 'STOPPING') return 'SESSION_STOPPING';
  if (input.sessionState === 'ENDED') return 'SESSION_ENDED';
  if (!input.active) return 'READY_TO_START';
  if (input.blocker?.trim()) return input.blocker.trim().toUpperCase();
  const decision = input.decision;
  if (decision?.state === 'STOP')
    return decision.primaryReason.trim().toUpperCase() || 'WAITING_FOR_EVIDENCE';
  if (decision?.state === 'TRADE') return 'TRADING_ACTIVE';
  const reason = decision?.primaryReason.trim().toUpperCase();
  if (reason && !['WAIT', 'UNKNOWN', 'NO_EXECUTABLE_QUOTE'].includes(reason)) return reason;
  return !decision || decision.recoveryStatus !== 'NOT_REQUIRED'
    ? 'WAITING_FOR_EVIDENCE'
    : 'WAITING_FOR_MARKET_CONDITIONS';
}

export function formatSessionStartResponseV1(ok: boolean, body: unknown): string {
  const result = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (!ok)
    return `SESSION START REJECTED: ${sanitizeOperatorAlertTextV1(typeof result.error === 'string' ? result.error : 'SESSION_CONTROL_FAILED')}`;
  if (result.status === 'ENDED')
    return `SESSION ENDED: ${typeof result.stopReason === 'string' ? sanitizeOperatorAlertTextV1(result.stopReason) : 'COMPLETED'}`;
  return 'SESSION STARTED';
}

/** Gross PnL before trading fees: net + fees. Null when either side is unknown. */
export function calculateGrossPnlUsdV1(
  netUsd: number | null | undefined,
  feesUsd: number | null | undefined,
): number | null {
  if (netUsd === null || netUsd === undefined || feesUsd === null || feesUsd === undefined)
    return null;
  return Number.isFinite(netUsd) && Number.isFinite(feesUsd) ? netUsd + feesUsd : null;
}

/** "PnL +$x · Net -$y": gross PnL next to net PnL after trading fees. */
export function formatOperatorPnlPairV1(
  grossUsd: number | null | undefined,
  netUsd: number | null | undefined,
): string {
  return `PnL ${formatOperatorPnlV1(grossUsd ?? null)} · Net ${formatOperatorPnlV1(netUsd ?? null)}`;
}

export type activity_fill_for_net_v1 = Readonly<{
  fillId: string;
  timestamp: number;
  quantity: number;
  feeUsd?: number | null;
  pnlAtCloseUsd?: number | null;
  closePnlAvailability?: 'VERIFIED' | 'N/A' | 'UNKNOWN';
  direction?: 'Open Long' | 'Open Short' | 'Close Long' | 'Close Short' | null;
}>;

/**
 * Net PnL per closing fill: venue close PnL (gross) minus the closing fee and the fees of
 * the opening fills it closes (FIFO by quantity). Null when any needed fee is unknown or
 * the closing fill cannot be matched to opening fills in the listed history.
 */
export function calculateActivityFillNetPnlV1(
  fills: readonly activity_fill_for_net_v1[],
): ReadonlyMap<string, number | null> {
  const result = new Map<string, number | null>();
  const lots: { long: boolean; quantity: number; feePerUnit: number | null }[] = [];
  for (const fill of [...fills].sort((a, b) => a.timestamp - b.timestamp)) {
    const direction = fill.direction ?? null;
    const fee = fill.feeUsd ?? null;
    if (direction === 'Open Long' || direction === 'Open Short') {
      lots.push({
        long: direction === 'Open Long',
        quantity: fill.quantity,
        feePerUnit: fee === null || !(fill.quantity > 0) ? null : fee / fill.quantity,
      });
      continue;
    }
    if (direction !== 'Close Long' && direction !== 'Close Short') continue;
    const long = direction === 'Close Long';
    let remaining = fill.quantity;
    let entryFee: number | null = 0;
    for (const lot of lots) {
      if (remaining <= 1e-12) break;
      if (lot.long !== long || lot.quantity <= 1e-12) continue;
      const matched = Math.min(lot.quantity, remaining);
      entryFee =
        entryFee === null || lot.feePerUnit === null ? null : entryFee + lot.feePerUnit * matched;
      lot.quantity -= matched;
      remaining -= matched;
    }
    const gross = fill.closePnlAvailability === 'VERIFIED' ? (fill.pnlAtCloseUsd ?? null) : null;
    result.set(
      fill.fillId,
      gross === null || fee === null || entryFee === null || remaining > 1e-12
        ? null
        : gross - fee - entryFee,
    );
  }
  return result;
}
