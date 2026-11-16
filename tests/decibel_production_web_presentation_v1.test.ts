import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  renderSessionActionButtonV1,
  hasConfirmedSessionEndV1,
} from '../web_dashboard/src/session_action_button_v1.js';
import { deriveDecibelSessionControlDiagnosticsV1 } from '../src/decibel_session_control_diagnostics_v1.js';
import {
  session_start_request_v1,
  getSessionStartButtonLabelV1,
} from '../web_dashboard/src/session_start_request_v1.js';

import {
  buildOperatorAlertsV1,
  canStartOperatorSessionV1,
  deriveLossLeftV1,
  deriveMarketFeedHealthV1,
  deriveQuoteSideHealthV1,
  deriveSessionProgressV1,
  deriveDashboardPresentationV1,
  deriveSessionStartGateV1,
  formatOperatorPnlV1,
  formatOperatorValueV1,
  getNextAlertDrawerStateV1,
  getNextExpandedSessionIdV1,
  getDashboardViewsV1,
  getOperatorMarketLabelV1,
  getOperatorStopReasonV1,
  getReadinessFooterLabelV1,
  formatSessionDurationV1,
  getDashboardTabFromSearchV1,
  getDashboardTabUrlV1,
  getEffectiveAutoPositionLimitV1,
  getOverviewSectionsV1,
  getPrimaryMarketFieldNamesV1,
  getPnlSemanticClassV1,
  getSessionStateSemanticClassV1,
  getSettingsChangeCountV1,
  hasFullCapitalLossWarningV1,
  isTimestampInSessionV1,
  getLossUtilizationSemanticClassV1,
  isDashboardMutationControlEnabledV1,
  mapQuoteLadderRowsV1,
  MAX_RECENT_OPERATOR_ALERTS_V1,
  selectHighestPriorityOperatorAlertV1,
  sortOperatorSessionsNewestFirstV1,
} from '../web_dashboard/src/presentation.js';
import {
  buildRuntimeTerminalLinesV1,
  RUNTIME_TERMINAL_BUFFER_LIMIT_V1,
  sanitizeTerminalTextV1,
  shouldAutoFollowRuntimeTerminalV1,
} from '../web_dashboard/src/runtime_terminal.js';

const base = {
  connected: true,
  degraded: false,
  runtimeState: 'RUNNING',
  dryRun: false,
  blockers: [],
  intents: [],
  events: [{ timestamp: 10, eventType: 'QUOTE REFRESHED', description: 'BUY L1 at 81238.9' }],
} as const;

describe('Decibel production web presentation V1', () => {
  it('waits for the same session to be confirmed ENDED before restoring Start', () => {
    expect(hasConfirmedSessionEndV1('current', 'previous', 'ENDED', true)).toBe(false);
    expect(hasConfirmedSessionEndV1('current', 'current', 'STOPPING', false)).toBe(false);
    expect(hasConfirmedSessionEndV1('current', 'current', 'ENDED', false)).toBe(false);
    expect(hasConfirmedSessionEndV1('current', 'current', 'ENDED', true)).toBe(true);
  });
  it.each([
    {
      name: 'IDLE',
      sessionStatus: 'IDLE',
      owned: false,
      startPhase: 'IDLE' as const,
      ending: false,
      label: 'START SESSION',
      disabled: false,
    },
    {
      name: 'CHECKING ACCOUNT',
      sessionStatus: 'ENDED',
      owned: false,
      startPhase: 'CHECKING_ACCOUNT' as const,
      ending: false,
      label: 'CHECKING ACCOUNT…',
      disabled: true,
    },
    {
      name: 'STARTING',
      sessionStatus: 'STARTING',
      owned: false,
      startPhase: 'STARTING_SESSION' as const,
      ending: false,
      label: 'STARTING SESSION…',
      disabled: true,
    },
    {
      name: 'ACTIVE',
      sessionStatus: 'RUNNING',
      owned: true,
      startPhase: 'SESSION_ACTIVE' as const,
      ending: false,
      label: 'END SESSION',
      disabled: false,
    },
    {
      name: 'END REQUEST PENDING',
      sessionStatus: 'RUNNING',
      owned: true,
      startPhase: 'SESSION_ACTIVE' as const,
      ending: true,
      label: 'ENDING SESSION…',
      disabled: true,
    },
    {
      name: 'STOPPING',
      sessionStatus: 'STOPPING',
      owned: true,
      startPhase: 'IDLE' as const,
      ending: false,
      label: 'ENDING SESSION…',
      disabled: true,
    },
    {
      name: 'ENDED',
      sessionStatus: 'ENDED',
      owned: false,
      startPhase: 'IDLE' as const,
      ending: false,
      label: 'START SESSION',
      disabled: false,
    },
    {
      name: 'OWNERSHIP NOT CONFIRMED',
      sessionStatus: 'RUNNING',
      owned: false,
      startPhase: 'CONFIRMING' as const,
      ending: false,
      label: 'STARTING SESSION…',
      disabled: true,
    },
  ])('renders exactly one session action button in $name', ({ label, disabled, ...props }) => {
    const html = renderToStaticMarkup(
      createElement(renderSessionActionButtonV1, {
        ...props,
        startAllowed: true,
        onStart: () => undefined,
        onEnd: () => undefined,
      }),
    );
    expect(html.match(/<button\b/gu)).toHaveLength(1);
    expect(html.match(/primary-session-action/gu)).toHaveLength(1);
    expect(html).toContain(`>${label}</button>`);
    expect(html.includes('disabled=""')).toBe(disabled);
    expect(html).not.toContain('SESSION ACTIVE');
  });
  it('keeps ENDED start requests available across repeated five-second readiness boundaries', () => {
    const labels: string[] = [];
    for (const age of [4999, 5000, 5001, 6000, 0, 4999, 5001, 0]) {
      const stale = age > 5000;
      const gate = deriveSessionStartGateV1({
        sessionState: 'IDLE',
        runtimeBlocked: stale,
        runtimeBlockCode: stale ? 'PRODUCTION_AUTHENTICATED_STATE_STALE' : 'SESSION_ENDED',
        runtimeBlockMessage: 'Cached evidence expired',
        capitalToUseUsd: 8,
        authenticatedAccountEquityUsd: stale ? null : 8.441935,
        intents: [],
      });
      expect(gate.blocked).toBe(false);
      labels.push(getSessionStartButtonLabelV1('IDLE'));
    }
    expect(new Set(labels)).toEqual(new Set(['START SESSION']));
    for (const code of [
      'MARKET_DATA_STALE',
      'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
      'PRODUCTION_AUTHENTICATED_STATE_INITIALIZATION_REQUIRED',
      'PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED',
    ]) {
      expect(
        deriveSessionStartGateV1({
          runtimeBlocked: true,
          runtimeBlockCode: code,
          runtimeBlockMessage: code,
          capitalToUseUsd: 8,
          authenticatedAccountEquityUsd: null,
        }).blocked,
      ).toBe(false);
    }
  });

  it('preserves genuine request prohibitions independently of transient telemetry', () => {
    const base = {
      runtimeBlocked: true,
      runtimeBlockCode: 'PRODUCTION_AUTHENTICATED_STATE_STALE',
      runtimeBlockMessage: 'Refresh required',
      capitalToUseUsd: 8,
      authenticatedAccountEquityUsd: null,
    };
    expect(
      deriveSessionStartGateV1({
        ...base,
        sessionState: 'RECOVERY_BLOCKED',
        sessionBlocker: 'SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT',
      }),
    ).toMatchObject({ blocked: true, code: 'SESSION_RUNTIME_OWNER_NOT_PROVEN_ABSENT' });
    expect(
      deriveSessionStartGateV1({ ...base, intents: [{ status: 'SUBMIT_UNKNOWN' }] }),
    ).toMatchObject({ blocked: true, code: 'EXECUTION_RECONCILIATION_REQUIRED' });
    expect(deriveSessionStartGateV1({ ...base, capitalToUseUsd: Number.NaN })).toMatchObject({
      blocked: true,
      code: 'SETTINGS_VALIDATION_FAILED',
    });
    expect(
      deriveSessionStartGateV1({
        ...base,
        blockers: [
          { code: 'PRODUCTION_AUTHENTICATED_STATE_STALE' },
          {
            code: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
            meaning: 'Reconcile the conflicting order identity.',
          },
        ],
      }),
    ).toMatchObject({ blocked: true, code: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT' });
  });

  it('does not label a successful HTTP response active before backend ownership confirmation', async () => {
    let posts = 0;
    const Request = new session_start_request_v1(
      {
        sendStart: () => {
          posts++;
          return Promise.resolve({ ok: true, body: { status: 'RUNNING' } });
        },
        readSession: () =>
          Promise.resolve({
            ownerState: 'UNCLAIMED_OR_STALE',
            activeSession: { sessionId: 'offline-session', status: 'RUNNING' },
          }),
      },
      () => undefined,
    );
    await Request.start(0);
    expect(Request.getState().phase).toBe('CONFIRMING');
    expect(getSessionStartButtonLabelV1(Request.getState().phase)).toBe('STARTING SESSION…');
    await Request.start(0);
    expect(posts).toBe(1);
    Request.observeSession({
      ownerState: 'OWNED',
      activeSession: { sessionId: 'offline-session', status: 'RUNNING' },
    });
    expect(getSessionStartButtonLabelV1(Request.getState().phase)).toBe('SESSION ACTIVE');
    Request.observeSession({
      ownerState: 'OWNED',
      activeSession: { sessionId: 'offline-session', status: 'RUNNING' },
      takeover: { state: 'PAUSED' },
    });
    expect(Request.getState().phase).not.toBe('SESSION_ACTIVE');
  });
  it.each([
    {
      name: 'loading',
      sessionState: null,
      latestSessionStatus: null,
      executionLoopRunning: false,
      executionCycles: 0,
      expected: 'IDLE',
      loop: 'NOT_SCHEDULED',
      blocker: 'SESSION_STATE_LOADING',
    },
    {
      name: 'ready web without a session',
      sessionState: 'IDLE',
      latestSessionStatus: null,
      executionLoopRunning: false,
      executionCycles: 0,
      expected: 'WAITING_FOR_USER_START',
      loop: 'NOT_SCHEDULED',
      blocker: null,
    },
    {
      name: 'completed session requires explicit Start',
      sessionState: 'IDLE',
      latestSessionStatus: 'ENDED',
      executionLoopRunning: false,
      executionCycles: 0,
      expected: 'ENDED',
      loop: 'NOT_SCHEDULED',
      blocker: null,
    },
    {
      name: 'admitted but unscheduled',
      sessionState: 'RUNNING',
      latestSessionStatus: 'RUNNING',
      executionLoopRunning: false,
      executionCycles: 0,
      expected: 'START_BLOCKED',
      loop: 'NOT_SCHEDULED',
      blocker: 'SESSION_CONTROL_LOOP_NOT_SCHEDULED',
    },
    {
      name: 'waiting first cycle',
      sessionState: 'RUNNING',
      latestSessionStatus: 'RUNNING',
      executionLoopRunning: true,
      executionCycles: 0,
      expected: 'STARTING',
      loop: 'WAITING_FIRST_CYCLE',
      blocker: null,
    },
    {
      name: 'active loop',
      sessionState: 'RUNNING',
      latestSessionStatus: 'RUNNING',
      executionLoopRunning: true,
      executionCycles: 2,
      expected: 'ACTIVE',
      loop: 'RUNNING',
      blocker: null,
    },
    {
      name: 'unhealthy loop',
      sessionState: 'RUNNING',
      latestSessionStatus: 'RUNNING',
      executionLoopRunning: true,
      executionLoopHealthy: false,
      executionCycles: 2,
      expected: 'START_BLOCKED',
      loop: 'STALLED',
      blocker: 'CONTROL_LOOP_STALLED',
    },
    {
      name: 'stopping',
      sessionState: 'STOPPING',
      latestSessionStatus: 'STOPPING',
      executionLoopRunning: true,
      executionCycles: 2,
      expected: 'STOPPING',
      loop: 'RUNNING',
      blocker: null,
    },
  ])('distinguishes $name from process readiness', ({ expected, loop, blocker, ...input }) => {
    const status = deriveDecibelSessionControlDiagnosticsV1({
      ...input,
      lastStartAttempt: null,
      executionBlocker: null,
    });
    expect(status).toMatchObject({ state: expected, loop, blocker });
  });

  it('separates current readiness from a recorded rejection before a session exists', () => {
    const base = {
      sessionState: 'IDLE',
      latestSessionStatus: 'ENDED',
      executionLoopRunning: false,
      executionCycles: 0,
      executionBlocker: 'PRODUCTION_AUTHENTICATED_STATE_STALE',
    };
    expect(
      deriveDecibelSessionControlDiagnosticsV1({ ...base, lastStartAttempt: null }),
    ).toMatchObject({
      state: 'ENDED',
      blocker: null,
      readinessBlocker: 'PRODUCTION_AUTHENTICATED_STATE_STALE',
    });
    expect(
      deriveDecibelSessionControlDiagnosticsV1({
        ...base,
        lastStartAttempt: {
          outcome: 'REJECTED',
          blocker: 'SETTINGS_REVISION_CONFLICT',
          requestedAt: 100,
          completedAt: 101,
          expectedSettingsRevision: 0,
          sessionId: null,
        },
      }),
    ).toMatchObject({
      state: 'START_BLOCKED',
      blocker: 'PRODUCTION_AUTHENTICATED_STATE_STALE',
      lastStartRejection: { blocker: 'SETTINGS_REVISION_CONFLICT' },
    });
  });
  const alertBase = {
    now: 1_000,
    connected: true,
    degraded: false,
    runtimeState: 'RUNNING',
    blockers: [],
    events: [],
    sessionState: 'IDLE',
    sessionStopReason: null,
    lossUtilization: 0,
  } as const;

  it.each([
    [
      'ADVERSE_SELECTION_EVIDENCE_INSUFFICIENT:REGIME=17/30:GLOBAL=17/30',
      'MARKET_SAMPLES_INSUFFICIENT',
      'MARKET DATA',
      'WARNING',
    ],
    [
      'PRODUCTION_ECONOMIC_SNAPSHOT_MISSING_ADVERSE_SELECTION_STALE',
      'ECONOMIC_EVIDENCE_STALE',
      'ECONOMIC EVIDENCE',
      'WARNING',
    ],
    ['PRODUCTION_AUTHENTICATED_STATE_STALE', 'AUTHENTICATED_ACCOUNT_STALE', 'ACCOUNT', 'WARNING'],
    ['MARKET_DATA_STALE', 'VENUE_SOURCE_UNAVAILABLE', 'VENUE DATA', 'WARNING'],
    ['CAPACITY_VENUE_MARGIN_RULES_STALE', 'VENUE_SOURCE_UNAVAILABLE', 'VENUE DATA', 'WARNING'],
    [
      'EXECUTION_AUTHORITATIVE_RECONCILIATION_CONFLICT',
      'REAL_RECONCILIATION_CONFLICT',
      'RECONCILIATION',
      'CRITICAL',
    ],
  ])(
    'classifies %s in the existing warning feed by its actual impact',
    (reason, code, source, severity) => {
      const alerts = buildOperatorAlertsV1({
        ...alertBase,
        sessionState: 'ACTIVE',
        blockers: [{ code: reason, meaning: reason, intentId: null }],
      });
      expect(alerts.active).toHaveLength(1);
      expect(alerts.active[0]).toMatchObject({
        code: reason,
        classification: code,
        source,
        severity,
        message: reason,
      });
    },
  );

  it('shows no current alert for a healthy runtime and prioritizes critical alerts', () => {
    expect(
      selectHighestPriorityOperatorAlertV1(buildOperatorAlertsV1(alertBase).active),
    ).toBeNull();
    const alerts = buildOperatorAlertsV1({
      ...alertBase,
      degraded: true,
      blockers: [
        { code: 'RECONCILIATION_REQUIRED', meaning: 'Unresolved intent', intentId: 'intent-1' },
      ],
    });
    expect(alerts.active).toHaveLength(2);
    expect(selectHighestPriorityOperatorAlertV1(alerts.active)).toMatchObject({
      severity: 'CRITICAL',
      code: 'RECONCILIATION_REQUIRED',
    });
  });

  it('maps warning, session interruption, and max-loss states without retaining cleared alerts', () => {
    expect(buildOperatorAlertsV1({ ...alertBase, degraded: true }).active[0]).toMatchObject({
      severity: 'WARNING',
    });
    expect(
      buildOperatorAlertsV1({ ...alertBase, sessionState: 'INTERRUPTED' }).active[0],
    ).toMatchObject({
      source: 'SESSION',
      severity: 'WARNING',
    });
    expect(
      buildOperatorAlertsV1({
        ...alertBase,
        sessionState: 'RECOVERY_BLOCKED',
        sessionStopReason: 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
      }).active[0],
    ).toMatchObject({
      source: 'SESSION',
      severity: 'ERROR',
      message: 'Session recovery is blocked: PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
      code: 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    });
    expect(buildOperatorAlertsV1({ ...alertBase, lossUtilization: 0.8 }).active[0]).toMatchObject({
      source: 'RISK',
      severity: 'WARNING',
    });
    expect(buildOperatorAlertsV1({ ...alertBase, lossUtilization: 1 }).active[0]).toMatchObject({
      severity: 'CRITICAL',
    });
    expect(buildOperatorAlertsV1(alertBase).active).toHaveLength(0);
  });

  it('bounds recent operator history, redacts secrets, and excludes normal poll noise', () => {
    const events = Array.from({ length: 70 }, (_, index) => ({
      timestamp: index,
      severity: 'WARN',
      category: 'RISK',
      eventType: `RISK WARNING ${index}`,
      description: index === 0 ? 'API_TOKEN=unsafe risk limit warning' : 'Risk limit warning',
    }));
    events.push({
      timestamp: 100,
      severity: 'INFO',
      category: 'SYSTEM',
      eventType: 'POLL',
      description: 'Poll succeeded',
    });
    const recent = buildOperatorAlertsV1({ ...alertBase, events }).recent;
    expect(recent).toHaveLength(MAX_RECENT_OPERATOR_ALERTS_V1);
    expect(recent[0]?.message).toBe('API_TOKEN=[REDACTED] risk limit warning');
    expect(recent.some((alert) => alert.code === 'POLL')).toBe(false);
  });

  it('opens and closes the inspection drawer without enabling browser mutations', () => {
    expect(getNextAlertDrawerStateV1(false, 'OPEN')).toBe(true);
    expect(getNextAlertDrawerStateV1(true, 'CLOSE')).toBe(false);
    expect(getNextAlertDrawerStateV1(true, 'ESCAPE')).toBe(false);
    expect(getNextAlertDrawerStateV1(true, 'OUTSIDE')).toBe(false);
    expect(isDashboardMutationControlEnabledV1()).toBe(false);
  });

  it('keeps the primary market view limited to immediate operator decisions', () => {
    const fields = getPrimaryMarketFieldNamesV1();
    expect(fields).toEqual([
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
    expect(fields.join(' ')).not.toMatch(/client|intent|venue|transaction|gas|fee|subaccount/i);
  });

  it('prioritizes blockers above reconciliation and healthy status', () => {
    expect(
      deriveDashboardPresentationV1({
        ...base,
        blockers: [
          {
            code: 'EXECUTION_STATE_CHANGED_BEFORE_INTENT',
            meaning: 'State changed',
            intentId: null,
          },
        ],
        intents: [{ intentId: 'intent-1', status: 'SUBMIT_UNKNOWN' }],
      }),
    ).toMatchObject({
      botState: 'BLOCKED',
      abnormal: true,
      message: { title: 'EXECUTION BLOCKED', detail: 'EXECUTION_STATE_CHANGED_BEFORE_INTENT' },
    });
  });

  it('renders running, reconcile-only, disconnected, and degraded states distinctly', () => {
    expect(
      deriveDashboardPresentationV1({
        ...base,
        runtimeState: 'RUNNING',
        blockers: [
          {
            code: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
            meaning: 'Immutable order identity requires reconciliation',
            intentId: 'pid30680-cancel',
          },
        ],
      }),
    ).toMatchObject({
      botState: 'BLOCKED',
      abnormal: true,
      message: {
        title: 'EXECUTION BLOCKED',
        detail: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
      },
    });
    expect(deriveDashboardPresentationV1(base)).toMatchObject({
      status: 'CONNECTED',
      botState: 'RUNNING',
      abnormal: false,
    });
    expect(
      deriveDashboardPresentationV1({
        ...base,
        intents: [{ intentId: 'intent-1', status: 'RECONCILING' }],
      }),
    ).toMatchObject({ botState: 'RECONCILE ONLY', abnormal: true });
    expect(deriveDashboardPresentationV1({ ...base, connected: false })).toMatchObject({
      status: 'DISCONNECTED',
      botState: 'DISCONNECTED',
    });
    expect(deriveDashboardPresentationV1({ ...base, degraded: true })).toMatchObject({
      status: 'DEGRADED',
      botState: 'DEGRADED',
    });
  });

  it('shows only faults as errors and keeps normal waits out of the alerts', () => {
    // Live 2026-11-16: entry waits and routine order confirmation showed CRITICAL alerts.
    const waiting = {
      code: 'NO_NEW_QUOTE_HEADROOM',
      meaning: 'wait',
      intentId: null,
      kind: 'WAITING' as const,
    };
    const reconciling = {
      code: 'PRODUCTION_RECONCILIATION_CONFIRMATION_PENDING',
      meaning: 'confirming',
      intentId: 'intent-1',
      kind: 'RECONCILING' as const,
    };
    const degraded = {
      code: 'MARKET_DATA_STALE',
      meaning: 'stale',
      intentId: null,
      kind: 'DEGRADED' as const,
    };
    const fault = {
      code: 'STRATEGY_ACTIVITY_EXCLUSIVITY_LOST',
      meaning: 'lost',
      intentId: null,
      kind: 'FAULT' as const,
    };
    const base = {
      connected: true,
      degraded: false,
      runtimeState: 'RUNNING',
      dryRun: false,
      intents: [],
      events: [],
    };
    expect(
      buildOperatorAlertsV1({ ...alertBase, blockers: [waiting, reconciling] }).active,
    ).toEqual([]);
    expect(deriveDashboardPresentationV1({ ...base, blockers: [waiting] })).toMatchObject({
      botState: 'RUNNING',
      abnormal: false,
    });
    expect(deriveDashboardPresentationV1({ ...base, blockers: [reconciling] })).toMatchObject({
      botState: 'RECONCILE ONLY',
    });
    expect(buildOperatorAlertsV1({ ...alertBase, blockers: [degraded] }).active[0]).toMatchObject({
      code: 'MARKET_DATA_STALE',
      severity: 'WARNING',
    });
    expect(deriveDashboardPresentationV1({ ...base, blockers: [waiting, fault] })).toMatchObject({
      botState: 'BLOCKED',
      message: { detail: 'STRATEGY_ACTIVITY_EXCLUSIVITY_LOST' },
    });
    expect(buildOperatorAlertsV1({ ...alertBase, blockers: [fault] }).active[0]).toMatchObject({
      severity: 'CRITICAL',
    });
    expect(
      buildOperatorAlertsV1({ ...alertBase, sessionState: 'STOPPING' }).active[0]?.message,
    ).toBe('Session is stopping: cancelling orders and closing the position');
  });

  it('maps the compact quote ladder with only operational fields and state marks', () => {
    expect(
      mapQuoteLadderRowsV1([
        { levelId: 'SELL-1', side: 'SELL', price: 81_251.8, quantity: 0.00025, active: true },
        { levelId: 'BUY-1', side: 'BUY', price: 81_238.9, quantity: 0.00025, active: false },
      ]),
    ).toEqual([
      { level: 'L1', side: 'SELL', price: 81_251.8, quantity: 0.00025, stateMark: '●' },
      { level: 'L1', side: 'BUY', price: 81_238.9, quantity: 0.00025, stateMark: '○' },
    ]);
  });

  it('provides only read-only navigation and no browser mutation controls', () => {
    expect(getDashboardViewsV1()).toEqual(['OVERVIEW', 'ACTIVITY', 'SETTINGS']);
    expect(isDashboardMutationControlEnabledV1()).toBe(false);
  });

  it('uses human market labels and compact unavailable placeholders', () => {
    expect(getOperatorMarketLabelV1('BTC/USD')).toEqual({
      primary: 'BTC/USD',
      secondary: null,
    });
    expect(
      getOperatorMarketLabelV1(
        '0xc14841cb334f31adfbdcf2c535ee90c7cbd504fbbd1cd889aa83067fcfab66d9',
      ),
    ).toEqual({ primary: 'UNKNOWN MARKET', secondary: '0xc14841...66d9' });
    expect(formatOperatorValueV1(null, 2, '$')).toBe('\u2014');
  });

  it('counts only changed settings and treats unlimited volume as an operator mode', () => {
    const current = { capital: 50, targetVolume: null };
    expect(getSettingsChangeCountV1(current, { capital: '50', targetVolume: '' }, true)).toBe(0);
    expect(getSettingsChangeCountV1(current, { capital: '75', targetVolume: '' }, true)).toBe(1);
  });

  it('formats PnL without an asterisk and preserves session start and risk gates', () => {
    expect(formatOperatorPnlV1(0.04)).toBe('+$0.04');
    expect(formatOperatorPnlV1(-0.04)).toBe('$-0.04');
    expect(formatOperatorPnlV1(null)).toBe('\u2014');
    expect(formatOperatorPnlV1(0.04)).not.toContain('*');
    expect(canStartOperatorSessionV1(true, false)).toBe(true);
    expect(canStartOperatorSessionV1(true, true)).toBe(false);
    expect(canStartOperatorSessionV1(false, false)).toBe(false);
    expect(hasFullCapitalLossWarningV1(50, 50)).toBe(true);
    expect(hasFullCapitalLossWarningV1(50, 10)).toBe(false);
  });

  it('lets backend refresh and validate capital rather than treating cached equity as request authorization', () => {
    expect(
      deriveSessionStartGateV1({
        runtimeBlocked: false,
        runtimeBlockCode: null,
        runtimeBlockMessage: null,
        capitalToUseUsd: 50,
        authenticatedAccountEquityUsd: 12.75,
      }),
    ).toEqual({ blocked: false, code: null, message: null });
    expect(
      deriveSessionStartGateV1({
        runtimeBlocked: false,
        runtimeBlockCode: null,
        runtimeBlockMessage: null,
        capitalToUseUsd: 8,
        authenticatedAccountEquityUsd: 12.75,
      }),
    ).toEqual({ blocked: false, code: null, message: null });
  });

  it('allows session start while economic evidence warms without bypassing other blockers', () => {
    expect(
      deriveSessionStartGateV1({
        runtimeBlocked: true,
        runtimeBlockCode: 'PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED',
        runtimeBlockMessage: 'Economic evidence is warming',
        capitalToUseUsd: 8,
        authenticatedAccountEquityUsd: 12.75,
      }),
    ).toEqual({ blocked: false, code: null, message: null });
    expect(
      deriveSessionStartGateV1({
        runtimeBlocked: true,
        runtimeBlockCode: 'RECONCILIATION_REQUIRED',
        runtimeBlockMessage: 'Reconciliation required',
        capitalToUseUsd: 8,
        authenticatedAccountEquityUsd: 12.75,
      }),
    ).toMatchObject({ blocked: true, code: 'RECONCILIATION_REQUIRED' });
  });

  it('allows session start while strategy buying power admission remains blocked', () => {
    expect(
      deriveSessionStartGateV1({
        runtimeBlocked: true,
        runtimeBlockCode: 'INSUFFICIENT_LEVERAGED_BUYING_POWER',
        runtimeBlockMessage: 'Strategy buying power is insufficient',
        capitalToUseUsd: 8,
        authenticatedAccountEquityUsd: 12.75,
      }),
    ).toEqual({ blocked: false, code: null, message: null });
    expect(
      deriveSessionStartGateV1({
        runtimeBlocked: true,
        runtimeBlockCode: 'RECONCILIATION_REQUIRED',
        runtimeBlockMessage: 'Reconciliation required',
        capitalToUseUsd: 8,
        authenticatedAccountEquityUsd: 12.75,
      }),
    ).toMatchObject({ blocked: true, code: 'RECONCILIATION_REQUIRED' });
  });

  it('starts an eligible session directly without a confirmation panel', () => {
    const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
    expect(source).not.toContain('START SESSION?');
    expect(source).not.toContain('confirmStart');
    expect(source).toContain('onStart={startSession}');
  });

  it('listens before starting external initialization and has no external pre-listen await', () => {
    const source = readFileSync(resolve('src/run_decibel_production_web_v1.ts'), 'utf8');
    const listen = source.indexOf('await listenDecibelProductionWebBeforeExternalInitV1(');
    const ready = source.indexOf('DECIBEL_PRODUCTION_WEB=READY', listen);
    const initialization = source.indexOf('startExternalInitialization();', ready);
    expect(listen).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(listen);
    expect(initialization).toBeGreaterThan(ready);
    expect(source).not.toContain('await bootstrapDecibelProductionEconomicEvidenceV1(environment)');
  });

  it('sorts sessions newest-first with an active session first and scopes event time', () => {
    const ended = { sessionId: 'ended', startedAt: 300, endedAt: 400, status: 'ENDED' };
    const older = { sessionId: 'older', startedAt: 100, endedAt: 200, status: 'ENDED' };
    const active = { sessionId: 'active', startedAt: 250, endedAt: null, status: 'RUNNING' };
    expect(
      sortOperatorSessionsNewestFirstV1([older, ended, active]).map((item) => item.sessionId),
    ).toEqual(['active', 'ended', 'older']);
    expect(isTimestampInSessionV1(350, ended)).toBe(true);
    expect(isTimestampInSessionV1(450, ended)).toBe(false);
    expect(getOperatorStopReasonV1('PROCESS_INTERRUPTED')).toBe('PROCESS INTERRUPTED');
    expect(getOperatorStopReasonV1('CUSTOM_STOP')).toBe('CUSTOM STOP');
  });

  it('keeps overview minimal and expands only one selected session at a time', () => {
    const sections = getOverviewSectionsV1();
    expect(sections).toEqual([
      'MARKET STRIP',
      'BOT STATE',
      'LIVE QUOTES',
      'PERFORMANCE STRIP',
      'CURRENT ALERT',
      'FOOTER',
    ]);
    expect(sections.join(' ')).not.toMatch(
      /SESSION PROGRESS|RISK HEADROOM|QUOTE HEALTH|MARKET HEALTH|LAST FILL|OPEN POSITIONS/,
    );
    expect(getNextExpandedSessionIdV1(null, 'session-1')).toBe('session-1');
    expect(getNextExpandedSessionIdV1('session-1', 'session-1')).toBeNull();
    expect(getNextExpandedSessionIdV1('session-1', 'session-2')).toBe('session-2');
  });

  it('derives fixed and unlimited session progress without inventing unlimited percentages', () => {
    expect(deriveSessionProgressV1(true, 187, 10_000)).toEqual({
      mode: 'FIXED_TARGET',
      makerVolumeUsd: 187,
      targetVolumeUsd: 10_000,
      ratio: 0.0187,
    });
    expect(deriveSessionProgressV1(true, 187, -1)).toEqual({
      mode: 'UNTIL_CAPITAL_LIMIT',
      makerVolumeUsd: 187,
      targetVolumeUsd: null,
      ratio: null,
    });
    expect(deriveSessionProgressV1(false, 187, 10_000).mode).toBe('NOT_STARTED');
  });

  it('derives only proven loss headroom and operator-safe quote and market health', () => {
    expect(deriveLossLeftV1(50, -3.8, true)).toBe(46.2);
    expect(deriveLossLeftV1(50, -3.8, false)).toBeNull();
    expect(deriveLossLeftV1(50, null, true)).toBeNull();
    expect(deriveQuoteSideHealthV1(1, 1, false)).toBe('ACTIVE');
    expect(deriveQuoteSideHealthV1(0, 0, false)).toBe('SUPPRESSED');
    expect(deriveQuoteSideHealthV1(1, 0, false)).toBe('HOLD');
    expect(deriveQuoteSideHealthV1(1, 1, true)).toBe('BLOCKED');
    expect(deriveMarketFeedHealthV1(14, false)).toBe('FRESH');
    expect(deriveMarketFeedHealthV1(5_001, false)).toBe('STALE');
    expect(deriveMarketFeedHealthV1(null, false)).toBe('UNKNOWN');
  });

  it('maps PnL, session state, and loss utilization to restrained semantic classes', () => {
    expect([
      getPnlSemanticClassV1(1),
      getPnlSemanticClassV1(-1),
      getPnlSemanticClassV1(0),
      getPnlSemanticClassV1(null),
    ]).toEqual(['positive', 'negative', 'neutral', 'neutral']);
    expect([
      getSessionStateSemanticClassV1('RUNNING'),
      getSessionStateSemanticClassV1('BLOCKED'),
      getSessionStateSemanticClassV1('INTERRUPTED'),
      getSessionStateSemanticClassV1('ENDED'),
    ]).toEqual(['active', 'negative', 'warning', 'neutral']);
    expect([
      getLossUtilizationSemanticClassV1(0.49),
      getLossUtilizationSemanticClassV1(0.5),
      getLossUtilizationSemanticClassV1(0.8),
      getLossUtilizationSemanticClassV1(1),
    ]).toEqual(['neutral', 'warning', 'negative', 'negative']);
  });
});

describe('Decibel production web runtime terminal V1', () => {
  const terminalBase = {
    connected: true,
    degraded: false,
    generatedAt: 500,
    events: [],
    intents: [],
    fills: [],
    blockers: [],
  } as const;

  it('renders lifecycle, fill, blocker, and priority information chronologically', () => {
    const lines = buildRuntimeTerminalLinesV1({
      ...terminalBase,
      events: [
        {
          timestamp: 200,
          severity: 'WARN',
          category: 'RECONCILIATION',
          eventType: 'RECONCILIATION PENDING',
          description: 'Awaiting venue evidence',
        },
      ],
      intents: [
        {
          timestamp: 100,
          intentId: 'intent-1',
          action: 'PLACE',
          side: 'BUY',
          price: 80_000,
          quantity: 0.00014,
          status: 'ACKNOWLEDGED',
          blocker: null,
          reconciliationResult: null,
        },
      ],
      fills: [
        {
          timestamp: 300,
          fillId: 'fill-1',
          side: 'BUY',
          quantity: 0.00014,
          price: 80_000,
          maker: true,
        },
      ],
      blockers: [
        {
          code: 'BOOK_STALE',
          meaning: 'Market book is stale',
          firstObservedAt: 400,
          lastObservedAt: 400,
        },
      ],
    });
    expect(lines.map((line) => line.timestamp)).toEqual([100, 200, 300, 400, 500]);
    expect(lines.map((line) => [line.level, line.source])).toEqual([
      ['INFO', 'EXEC'],
      ['WARN', 'RECON'],
      ['INFO', 'FILL'],
      ['ERROR', 'RISK'],
      ['INFO', 'SYSTEM'],
    ]);
    expect(lines[2]?.message).toContain('MAKER BUY 0.00014000 @ 80,000.0');
  });

  it('bounds terminal history and coalesces only quiet repeated events', () => {
    const repeatedEvents = Array.from(
      { length: RUNTIME_TERMINAL_BUFFER_LIMIT_V1 + 20 },
      (_, index) => ({
        timestamp: index,
        severity: 'INFO',
        category: 'SYSTEM',
        eventType: index < 4 ? 'JOURNAL READY' : `EVENT ${index}`,
        description: index < 4 ? 'Authenticated state ready' : 'Unique event',
      }),
    );
    const lines = buildRuntimeTerminalLinesV1({ ...terminalBase, events: repeatedEvents });
    expect(lines.length).toBeLessThanOrEqual(RUNTIME_TERMINAL_BUFFER_LIMIT_V1);
    const coalesced = buildRuntimeTerminalLinesV1({
      ...terminalBase,
      events: repeatedEvents.slice(0, 4),
    });
    expect(coalesced.find((line) => line.message.includes('JOURNAL READY'))?.count).toBe(4);
  });

  it('never coalesces fills or errors', () => {
    const fills = [1, 2].map((timestamp) => ({
      timestamp,
      fillId: `fill-${timestamp}`,
      side: 'SELL',
      quantity: 0.00014,
      price: 80_100,
      maker: true,
    }));
    const lines = buildRuntimeTerminalLinesV1({ ...terminalBase, fills });
    expect(lines.filter((line) => line.source === 'FILL')).toHaveLength(2);
  });

  it('redacts secret-shaped telemetry before rendering', () => {
    expect(sanitizeTerminalTextV1('PRIVATE_KEY=abc API_TOKEN: xyz Bearer token.value')).toBe(
      'PRIVATE_KEY=[REDACTED] API_TOKEN=[REDACTED] Bearer [REDACTED]',
    );
  });

  it('auto-follows only near the bottom and exposes no mutation controls', () => {
    expect(shouldAutoFollowRuntimeTerminalV1(0)).toBe(true);
    expect(shouldAutoFollowRuntimeTerminalV1(20)).toBe(true);
    expect(shouldAutoFollowRuntimeTerminalV1(25)).toBe(false);
    expect(isDashboardMutationControlEnabledV1()).toBe(false);
  });

  it('shows disconnected and degraded state as terminal warnings', () => {
    expect(buildRuntimeTerminalLinesV1({ ...terminalBase, connected: false }).at(-1)).toMatchObject(
      { level: 'WARN', message: 'SSE DISCONNECTED' },
    );
    expect(buildRuntimeTerminalLinesV1({ ...terminalBase, degraded: true }).at(-1)).toMatchObject({
      level: 'WARN',
      message: 'TELEMETRY DEGRADED',
    });
  });
});

it('keeps Settings sizing diagnostics out of the operator layout while retaining End Session', () => {
  const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
  expect(source).not.toContain('aria-label="Dynamic quote sizing"');
  for (const label of [
    'PROPOSED QUOTE SIZE',
    'FINAL QUOTE SIZE',
    'BINDING SIZE CONSTRAINT',
    'ROUNDING / MINIMUM ORDER REASON',
  ])
    expect(source).not.toContain(label);
  expect(source.match(/<SessionActionButton\b/gu)).toHaveLength(1);
  expect(source).not.toContain('className="primary-session-action"');
  expect(getOperatorStopReasonV1('TARGET_UNREACHABLE_MINIMUM_ORDER')).toBe(
    'REMAINING TARGET BELOW MINIMUM ORDER SIZE',
  );
});

it('keeps unknown Settings values compact and lets the document scroll without changing other views', () => {
  const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
  const css = readFileSync(resolve('web_dashboard/src/styles.css'), 'utf8');
  expect(source).not.toContain('`UNKNOWN ?');
  expect(source).not.toContain('EXECUTED VOLUME EVIDENCE UNAVAILABLE');
  expect(source).toContain("formatNumber(props.availableMarginUsd, 2, '$')");
  expect(source).toContain("formatNumber(props.marginUsedUsd, 2, '$')");
  expect(source).toContain('const estimatedTime = formatSettingsSessionEtaV1({');
  expect(css).toContain('html:has(.settings-view:not([hidden]))');
  expect(css).toContain('.app-shell:has(.settings-view:not([hidden]))');
  expect(css).toContain('scroll-padding-block: 56px 36px');
});

it('replaces debug readiness abbreviations without claiming blocked or degraded execution is ready', () => {
  const readiness = {
    processReady: true,
    accountReady: true,
    marketReady: true,
    economicReady: true,
    executionSafe: true,
  };
  expect(getReadinessFooterLabelV1({ readiness, degraded: false, executionBlocker: null })).toBe(
    'Execution checks passed',
  );
  expect(
    getReadinessFooterLabelV1({
      readiness,
      degraded: false,
      executionBlocker: 'LONG_INTERNAL_CODE',
    }),
  ).toBe('Execution blocked');
  expect(getReadinessFooterLabelV1({ readiness, degraded: true, executionBlocker: null })).toBe(
    'Data degraded',
  );
  for (const field of [
    'processReady',
    'accountReady',
    'marketReady',
    'economicReady',
    'executionSafe',
  ] as const)
    expect(
      getReadinessFooterLabelV1({
        readiness: { ...readiness, [field]: false },
        degraded: false,
        executionBlocker: null,
      }),
    ).not.toBe('Execution checks passed');
  const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
  expect(source).not.toContain('READY P:');
  expect(source).not.toContain('const leverage = props.maximumEffectiveLeverage ?? 1');
});
it('shows only authenticated active-session effective exposure, never a settings-derived substitute', () => {
  const base = {
    accountReady: true,
    marketReady: true,
    sessionActive: true,
    effectivePositionLimitUsd: 24.8,
  };
  expect(getEffectiveAutoPositionLimitV1(base)).toBe(24.8);
  expect(getEffectiveAutoPositionLimitV1({ ...base, effectivePositionLimitUsd: 0 })).toBe(0);
  for (const field of ['accountReady', 'marketReady', 'sessionActive'] as const)
    expect(getEffectiveAutoPositionLimitV1({ ...base, [field]: false })).toBe(null);
  expect(getEffectiveAutoPositionLimitV1({ ...base, effectivePositionLimitUsd: null })).toBe(null);
});

it('uses tab query as truth and preserves other URL parameters and fragments', () => {
  for (const [query, tab] of [
    ['', 'OVERVIEW'],
    ['?tab=bad', 'OVERVIEW'],
    ['?tab=settings', 'SETTINGS'],
    ['?tab=activity', 'ACTIVITY'],
    ['?view=SETTINGS', 'OVERVIEW'],
  ])
    expect(getDashboardTabFromSearchV1(query!)).toBe(tab);
  expect(getDashboardTabUrlV1('http://localhost/?other=1&tab=activity#anchor', 'SETTINGS')).toBe(
    '/?other=1&tab=settings#anchor',
  );
  const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
  expect(source).toContain("window.addEventListener('popstate', syncTab)");
  expect(source).toContain('window.history.pushState');
  expect(source).toContain("hidden={view !== 'SETTINGS'}");
});
it('removes the estimated row while preserving executable ENTRY SIZE', () => {
  const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
  expect(source).toContain('ENTRY SIZE');
  expect(source).not.toContain('ESTIMATED NEXT SESSION LIMIT');
  expect(source).not.toContain('Policy estimate only; does not authorize orders.');
  expect(source).toContain('value: result.nextSessionProjection.entrySizeUsd ?? null');
  expect(readFileSync(resolve('src/run_decibel_production_web_v1.ts'), 'utf8')).toContain(
    'estimateDecibelNextSessionPositionLimitV1',
  );
});

it('applies uppercase typography to the full footer without altering readiness decisions', () => {
  const css = readFileSync(resolve('web_dashboard/src/styles.css'), 'utf8');
  expect(css).toMatch(/\.system-footer\s*\{\s*text-transform: uppercase;/);
});

it('uses authoritative session timestamps, freezes ended duration and handles missing timestamps and skew', () => {
  expect(formatSessionDurationV1(1000, null, 6000)).toBe('00:00:05');
  expect(formatSessionDurationV1(1000, null, 7000)).toBe('00:00:06');
  expect(formatSessionDurationV1(1000, 6000, 99000)).toBe('00:00:05');
  expect(formatSessionDurationV1(null, null, 6000)).toBe('UNKNOWN');
  expect(formatSessionDurationV1(1000, 500, 6000)).toBe('UNKNOWN');
  expect(formatSessionDurationV1(20000, null, 6000)).toBe('UNKNOWN');
  expect(formatSessionDurationV1(7000, null, 6000)).toBe('00:00:00');
  const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
  expect(source).toContain('performance.now()');
  expect(source).toContain('window.clearInterval(timer)');
});

import {
  appendSessionVolumeSampleV1,
  formatSessionEtaV1,
  formatSettingsSessionEtaV1,
} from '../web_dashboard/src/presentation.js';
describe('Executed-volume Settings ETA', () => {
  const start = 1793000000000;
  const sample = (ms: number, volumeUsd: number) => ({
    sessionId: 'active',
    observedAt: start + ms,
    volumeUsd,
  });
  const base = {
    now: start + 60000,
    sessionId: 'active',
    startedAt: start,
    running: true,
    targetUsd: 201,
    samples: [sample(0, 0), sample(30000, 25), sample(60000, 50)],
  };
  it('uses executed maker+taker deltas and handles near-target completion', () => {
    expect(formatSessionEtaV1(base)).toBe('~ 4 min');
    expect(formatSessionEtaV1({ ...base, targetUsd: 50.01 })).toBe('~ 1 min');
    expect(formatSessionEtaV1({ ...base, targetUsd: 50 })).toContain('TARGET REACHED');
  });
  it('rejects zero, tiny, single-burst and insufficient coverage', () => {
    for (const samples of [
      [],
      [sample(0, 0), sample(60000, 0)],
      [sample(0, 0), sample(30000, 0.000001), sample(60000, 0.000002)],
      [sample(0, 0), sample(30000, 0), sample(60000, 50)],
      [sample(40000, 0), sample(50000, 25), sample(60000, 50)],
    ])
      expect(formatSessionEtaV1({ ...base, samples })).toBe('UNKNOWN');
  });
  it('shows UNKNOWN for non-running states even at target or until-limit', () => {
    expect(formatSessionEtaV1({ ...base, running: false, targetUsd: 50 })).toBe('UNKNOWN');
    expect(formatSessionEtaV1({ ...base, running: false, targetUsd: -1 })).toBe('UNKNOWN');
    expect(formatSessionEtaV1({ ...base, targetUsd: -1 })).toBe('NO FIXED END');
    expect(formatSessionEtaV1({ ...base, targetUsd: null })).toBe('UNKNOWN');
  });
  it('rejects stale throughput, other sessions, corrections and timestamp units/skew', () => {
    for (const change of [
      { now: start + 80000 },
      { startedAt: start / 1000 },
      { now: start * 1000 },
      { now: start + 59000 },
      { sessionId: 'other' },
      { samples: [sample(0, 0), sample(30000, 25), sample(60000, 20)] },
    ])
      expect(formatSessionEtaV1({ ...base, ...change })).toBe('UNKNOWN');
    expect(
      formatSessionEtaV1({
        ...base,
        now: start + 120001,
        samples: [...base.samples, sample(120001, 50)],
      }),
    ).toBe('UNKNOWN');
  });
  it('resets on session switch, corrections, out-of-order evidence and invalid units', () => {
    expect(
      appendSessionVolumeSampleV1(base.samples, { ...sample(65000, 0), sessionId: 'new' }, start),
    ).toHaveLength(1);
    expect(appendSessionVolumeSampleV1(base.samples, sample(60001, 49), start)).toEqual([]);
    expect(appendSessionVolumeSampleV1(base.samples, sample(50000, 50), start)).toEqual([]);
    expect(appendSessionVolumeSampleV1([], sample(0, 0), start / 1000)).toEqual([]);
    expect(appendSessionVolumeSampleV1(base.samples, sample(60000, 50), start)).toBe(base.samples);
  });
});

import { getTradingDecisionReasonV1 } from '../web_dashboard/src/presentation.js';
it('keeps decision diagnostics outside minimal Settings without changing elapsed clock', () => {
  expect(getTradingDecisionReasonV1('LIFECYCLE_COST_BUDGET_EXCEEDED')).toBe(
    'Waiting for an economically eligible quote',
  );
  expect(getTradingDecisionReasonV1('CAPACITY_VENUE_MARGIN_RULES_STALE')).toBe(
    'Refreshing required account and market evidence',
  );
  expect(getTradingDecisionReasonV1('SESSION_MAX_LOSS_REACHED')).toBe('Session loss limit reached');
  const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
  const bot = source.split('<section className="bot-state-panel">')[1]?.split('</section>')[0];
  expect(bot).not.toContain('tradingDecision');
  expect(bot).toContain('CURRENT ACTION');
  expect(source).not.toContain('overview-diagnostics');
  expect(source).toContain('authenticatedVolumeReady: props.etaEvidenceReady');
  expect(source).toContain('ENTRY SIZE');
  expect(source).toContain('const estimatedTime = formatSettingsSessionEtaV1({');
  expect(source).toContain('<SessionDuration');
});

it('restores the minimal session summary using the existing typography and lifecycle heading', () => {
  const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
  const summary = source.split('<aside className="session-summary">')[1]?.split('</aside>')[0];
  expect(summary).toBeDefined();
  expect(summary).toContain('<strong>{operatorSessionState}</strong>');
  for (const removed of [
    'Recovery',
    'VERIFYING',
    'SESSION CONFIG',
    'Authenticated Update',
    'BUY / SELL Quote',
    'tradingDecision',
  ])
    expect(summary).not.toContain(removed);
  for (const label of [
    'Account Equity',
    'Available Margin',
    'Margin Used',
    'Capital',
    'Max Loss',
    'Volume',
    'Quote Size',
    'Entry Size',
    '<SessionActionButton',
    '<SessionDuration',
  ])
    expect(summary).toContain(label);
  expect(source).not.toContain('WAIT ? RUNNING');
  expect(source).not.toContain("'VERIFYING'");
  expect(source).toContain("formatNumber(savedEntrySizeUsd, 2, '$')");
  const styles = readFileSync(resolve('web_dashboard/src/styles.css'), 'utf8');
  expect(styles).toContain("font-family: 'Fredoka', system-ui, sans-serif;");
  expect(styles).toContain('.session-status-summary > strong {');
  expect(styles).toContain('font-size: 26px;');
  expect(styles).toContain('letter-spacing: 0.06em;');
  expect(source).not.toContain('fontFamily:');
});

import { getSessionStatusCodeV1 } from '../web_dashboard/src/presentation.js';
describe('Single-line current Settings status', () => {
  const base = { sessionState: 'RUNNING', active: true, blocker: null, decision: null } as const;
  const decision = (state: 'TRADE' | 'WAIT' | 'STOP', primaryReason: string) =>
    ({ state, primaryReason, recoveryStatus: 'NOT_REQUIRED' }) as const;
  it('prioritizes the current blocker, STOP reason and specific WAIT reason', () => {
    expect(
      getSessionStatusCodeV1({
        ...base,
        blocker: 'ORDER_IDENTITY_CONFLICT',
        decision: decision('TRADE', ''),
      }),
    ).toBe('ORDER_IDENTITY_CONFLICT');
    expect(
      getSessionStatusCodeV1({ ...base, decision: decision('STOP', 'SESSION_MAX_LOSS_REACHED') }),
    ).toBe('SESSION_MAX_LOSS_REACHED');
    expect(
      getSessionStatusCodeV1({
        ...base,
        decision: decision('WAIT', 'CAPACITY_VENUE_MARGIN_RULES_STALE'),
      }),
    ).toBe('CAPACITY_VENUE_MARGIN_RULES_STALE');
  });
  it('recovers without retaining previous errors and provides explicit WAIT fallbacks', () => {
    expect(
      getSessionStatusCodeV1({
        ...base,
        decision: decision('TRADE', 'EXECUTABLE_QUOTE_AVAILABLE'),
      }),
    ).toBe('TRADING_ACTIVE');
    expect(getSessionStatusCodeV1({ ...base, decision: decision('WAIT', '') })).toBe(
      'WAITING_FOR_MARKET_CONDITIONS',
    );
    expect(getSessionStatusCodeV1(base)).toBe('WAITING_FOR_EVIDENCE');
    expect(
      getSessionStatusCodeV1({
        ...base,
        decision: { ...decision('WAIT', ''), recoveryStatus: 'REFRESHING' },
      }),
    ).toBe('WAITING_FOR_EVIDENCE');
  });
  it.each([
    ['STOPPING', 'SESSION_STOPPING'],
    ['ENDED', 'SESSION_ENDED'],
    ['IDLE', 'READY_TO_START'],
  ])('discards obsolete errors in %s', (sessionState, expected) => {
    expect(
      getSessionStatusCodeV1({
        ...base,
        sessionState,
        active: sessionState === 'STOPPING',
        blocker: 'OLD_ERROR',
        decision: decision('STOP', 'OLD_STOP'),
      }),
    ).toBe(expected);
  });
  it('preserves short/long uppercase codes in a single focusable fixed-height slot', () => {
    const long = 'PRODUCTION_RECONCILIATION_' + 'EXACT_IDENTITY_EVIDENCE_'.repeat(20);
    for (const blocker of ['X', long])
      expect(getSessionStatusCodeV1({ ...base, blocker })).toBe(blocker);
    const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
    const slot = source
      .split('className={`session-state-slot')[1]
      ?.split('{isRunning && props.session?.activeSession')[0];
    expect(slot).toContain('title={sessionStatusCode}');
    expect(slot).toContain('aria-label={sessionStatusCode}');
    expect(slot).toContain('tabIndex={0}');
    expect(slot?.match(/\{sessionStatusCode\}/g)).toHaveLength(3);
    expect(slot).not.toContain('session-warning-icon');
    const styles = readFileSync(resolve('web_dashboard/src/styles.css'), 'utf8');
    const rule = styles.split('.session-status-code {')[1]?.split('}')[0];
    for (const declaration of [
      'min-width: 0;',
      'white-space: nowrap;',
      'overflow: hidden;',
      'text-overflow: ellipsis;',
    ])
      expect(rule).toContain(declaration);
    expect(rule).not.toMatch(/font|letter-spacing/);
    expect(rule).toContain('color: var(--color-warning);');
    expect(styles).toContain('height: 54px;');
    expect(styles).toContain('min-height: 54px;');
    expect(styles).toContain("font-family: 'Fredoka', system-ui, sans-serif;");
  });
});

it('keeps every Settings status at the original prominent typography with the session label amber color', () => {
  const styles = readFileSync(resolve('web_dashboard/src/styles.css'), 'utf8');
  const slot = styles.split('.session-state-slot {')[1]?.split('}')[0];
  expect(slot).toContain('font-size: 17px;');
  expect(slot).toContain('font-weight: 600;');
  const neutral = styles.split('.session-state-slot.neutral {')[1]?.split('}')[0];
  expect(neutral).toContain('color: var(--color-warning);');
  expect(neutral).not.toContain('font-size');
  const sessionLabels = styles.split('.settings-status span {')[1]?.split('}')[0];
  expect(sessionLabels).toContain('color: var(--color-warning);');
  for (const tone of ['active', 'positive', 'negative']) {
    const rule = styles.split(`.session-state-slot[data-tone='${tone}'] {`)[1]?.split('}')[0];
    expect(rule).toContain('color: var(--color-warning);');
    expect(rule).not.toMatch(/font|letter-spacing/);
  }
  const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
  expect(source).toContain(
    "sessionStatusCode === 'SESSION_ENDED' || sessionStatusCode === 'SESSION_STOPPING'",
  );
  expect(source).toContain("? 'warning'");
  expect(styles).toContain("font-family: 'Fredoka', system-ui, sans-serif;");
  expect(styles).toContain('height: 54px;');
});

it('renders status amber despite the global neutral important rule in Chromium', async (context) => {
  const { existsSync, mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { execFileSync } = await import('node:child_process');
  const browser = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA &&
      join(
        process.env.LOCALAPPDATA,
        'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
      ),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (!browser) {
    context.skip();
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'decibel-status-color-'));
  try {
    const css = readFileSync(resolve('web_dashboard/src/styles.css'), 'utf8');
    const html = join(root, 'status.html');
    writeFileSync(
      html,
      `<style>${css}</style>
      <div class="settings-status"><span id="reference">NEXT SESSION</span></div>
      <aside class="session-summary" style="width:240px">
      ${['neutral', 'warning', 'neutral', 'neutral', 'neutral']
        .map(
          (tone, i) => `
        <div class="session-state-slot ${tone}" data-tone="${['warning', 'warning', 'active', 'positive', 'negative'][i]}">
          <span class="session-status-code" tabindex="0" title="SESSION_ENDED">SESSION_ENDED_${'LONG_CODE_'.repeat(20)}</span>
        </div>`,
        )
        .join('')}</aside><pre id="result"></pre>
      <script>
        const reference = getComputedStyle(document.getElementById('reference')).color;
        const rows = Array.from(document.querySelectorAll('.session-status-code')).map(el => {
          const style = getComputedStyle(el), slot = getComputedStyle(el.parentElement);
          el.focus();
          return {color: style.color, fontFamily: style.fontFamily, fontSize: style.fontSize,
            fontWeight: style.fontWeight, whiteSpace: style.whiteSpace, overflow: style.overflow,
            ellipsis: style.textOverflow, height: slot.height, truncated: el.scrollWidth > el.clientWidth,
            focused: document.activeElement === el};
        });
        document.getElementById('result').textContent = JSON.stringify({reference, rows});
      </script>`,
    );
    const output = execFileSync(
      browser,
      [
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--user-data-dir=' + join(root, 'profile'),
        '--dump-dom',
        pathToFileURL(html).href,
      ],
      { encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const match = output.match(/<pre id="result">(.*?)<\/pre>/s);
    expect(match).not.toBeNull();
    const rendered = JSON.parse(match![1]!) as {
      reference: string;
      rows: Array<Record<string, unknown>>;
    };
    expect(rendered.reference).not.toBe('rgb(23, 23, 23)');
    expect(rendered.rows).toHaveLength(5);
    for (const row of rendered.rows) {
      expect(row).toMatchObject({
        color: rendered.reference,
        fontSize: '17px',
        fontWeight: '600',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        ellipsis: 'ellipsis',
        height: '54px',
        truncated: true,
        focused: true,
      });
      expect(row.fontFamily).toContain('Fredoka');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);

it('renders the compact Settings status rhythm at desktop viewports without layout jumps', async (context) => {
  const { existsSync, mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { execFileSync } = await import('node:child_process');
  const browser = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (!existsSync(browser)) {
    context.skip();
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'decibel-status-spacing-'));
  try {
    const css = readFileSync(resolve('web_dashboard/src/styles.css'), 'utf8');
    const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
    expect(source).toContain('className="session-status-summary"');
    expect(source).toContain('className="session-summary-timer"');
    const html = join(root, 'spacing.html');
    writeFileSync(
      html,
      `<style>${css}</style><div class="settings-view">
      ${['TRADING_ACTIVE', 'VERY_LONG_'.repeat(80), '']
        .map(
          (code) => `
        <aside class="session-summary" style="width:calc(50vw - 60px)">
          <div class="session-status-summary"><strong>RUNNING</strong>
            <div class="session-state-slot neutral"><span class="session-status-code" tabindex="0" title="${code}">${code}</span></div>
            <span class="session-summary-timer">00:06:16</span></div>
          <div class="summary-list"><div><span>Account Equity</span><strong>$10.22</strong></div></div>
          <button class="primary-session-action">END SESSION</button>
        </aside>`,
        )
        .join('')}</div><pre id="result"></pre>
      <script>
        const rows = [...document.querySelectorAll('.session-summary')].map(panel => {
          const heading = panel.querySelector('.session-status-summary > strong');
          const slot = panel.querySelector('.session-state-slot');
          const code = panel.querySelector('.session-status-code');
          const timer = panel.querySelector('.session-summary-timer');
          const list = panel.querySelector('.summary-list');
          const metric = list.firstElementChild;
          const rect = el => el.getBoundingClientRect();
          const style = getComputedStyle(code);
          return {headingGap:rect(slot).top-rect(heading).bottom,
            timerGap:rect(timer).top-rect(slot).bottom,
            dividerGap:rect(list).top-rect(timer).bottom,
            metricGap:rect(metric).top-rect(list).top-parseFloat(getComputedStyle(list).borderTopWidth),
            timerTop:rect(timer).top-rect(panel).top, slotHeight:rect(slot).height,
            overflow:panel.scrollWidth>panel.clientWidth, fontSize:style.fontSize,
            fontWeight:style.fontWeight, fontFamily:style.fontFamily, color:style.color,
            whiteSpace:style.whiteSpace, ellipsis:style.textOverflow,
            truncated:code.scrollWidth>code.clientWidth};
        });
        document.getElementById('result').textContent=JSON.stringify(rows);
      </script>`,
    );
    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [1280, 720],
    ]) {
      const output = execFileSync(
        browser,
        [
          '--headless',
          '--disable-gpu',
          '--no-first-run',
          '--user-data-dir=' + join(root, 'profile-' + width),
          '--window-size=' + width + ',' + height,
          '--dump-dom',
          pathToFileURL(html).href,
        ],
        { encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const match = output.match(/<pre id="result">(.*?)<\/pre>/s);
      expect(match).not.toBeNull();
      const rows = JSON.parse(match![1]!) as Array<Record<string, number | string | boolean>>;
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.headingGap).toBeCloseTo(8);
        expect(row.timerGap).toBeCloseTo(8);
        expect(row.dividerGap).toBeCloseTo(12);
        expect(row.metricGap).toBeCloseTo(12);
        expect(row.timerTop).toBe(rows[0]!.timerTop);
        expect(row.slotHeight).toBe(rows[0]!.slotHeight);
        expect(row).toMatchObject({
          overflow: false,
          fontSize: '17px',
          fontWeight: '600',
          color: 'rgb(166, 106, 0)',
          whiteSpace: 'nowrap',
          ellipsis: 'ellipsis',
        });
        expect(row.fontFamily).toContain('Fredoka');
      }
      expect(rows[1]!.truncated).toBe(true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 60000);

describe('Settings ETA inputs and refresh', () => {
  const start = 1793000000000;
  const base = {
    now: start + 60000,
    sessionId: 'active',
    startedAt: start,
    running: true,
    authenticatedVolumeReady: true,
    targetUsd: 201,
    samples: [0, 30000, 60000].map((ms, i) => ({
      sessionId: 'active',
      observedAt: start + ms,
      volumeUsd: i * 25,
    })),
  };
  it('preserves the measured model and updates when the entered target changes', () => {
    expect(formatSettingsSessionEtaV1(base)).toBe(formatSessionEtaV1(base));
    expect(formatSettingsSessionEtaV1(base)).toBe('~ 4 min');
    expect(formatSettingsSessionEtaV1({ ...base, targetUsd: 301 })).toBe('~ 6 min');
    expect(formatSettingsSessionEtaV1({ ...base, targetUsd: 50 })).toContain('TARGET REACHED');
  });
  it('gives specific reasons without inventing pre-session throughput', () => {
    expect(
      formatSettingsSessionEtaV1({ ...base, running: false, sessionId: null, samples: [] }),
    ).toBe('NO LIVE SESSION THROUGHPUT');
    expect(
      formatSettingsSessionEtaV1({ ...base, running: false, sessionId: null, targetUsd: -1 }),
    ).toBe('NO FIXED END');
    expect(formatSettingsSessionEtaV1({ ...base, targetUsd: Number.NaN })).toBe(
      'SET A VALID TARGET VOLUME',
    );
    expect(formatSettingsSessionEtaV1({ ...base, authenticatedVolumeReady: false })).toBe(
      'FRESH SESSION VOLUME REQUIRED',
    );
    expect(formatSettingsSessionEtaV1({ ...base, now: base.now + 15001 })).toBe(
      'SESSION VOLUME DATA STALE',
    );
  });
  it('retains coverage and execution requirements and resets across sessions', () => {
    expect(formatSettingsSessionEtaV1({ ...base, samples: [] })).toBe(
      'WAITING FOR EXECUTED VOLUME',
    );
    expect(formatSettingsSessionEtaV1({ ...base, samples: base.samples.slice(-1) })).toBe(
      'COLLECTING 30 S OF VOLUME',
    );
    expect(
      formatSettingsSessionEtaV1({
        ...base,
        samples: base.samples.map((s) => ({ ...s, volumeUsd: 0 })),
      }),
    ).toBe('NEEDS TWO VOLUME ADVANCES');
    expect(formatSettingsSessionEtaV1({ ...base, sessionId: 'new' })).toBe(
      'INVALID SESSION VOLUME EVIDENCE',
    );
  });
  it('binds the edited target and does not use quote eligibility as volume evidence', () => {
    const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
    const eta = source
      .split('const estimatedTime = formatSettingsSessionEtaV1({')[1]
      ?.split('const renderField')[0];
    expect(eta).toContain('Number(pending.targetVolume)');
    expect(eta).not.toContain('tradingDecision');
    const readiness = source.split('etaEvidenceReady={')[1]?.split('latestSessionStatus=')[0];
    expect(readiness).toContain('readiness.accountReady');
    expect(readiness).not.toContain('executionBlocker');
    expect(readiness).not.toContain('telemetry.blockers');
    expect(source).toContain(
      'if (!props.etaEvidenceReady || props.sessionTargetVolumeUsd === null) return;',
    );
  });
});

it('routes exact Start rejection details into the existing operator warnings', () => {
  const result = buildOperatorAlertsV1({
    now: 10000,
    connected: true,
    degraded: false,
    runtimeState: 'IDLE',
    blockers: [],
    events: [],
    sessionState: 'IDLE',
    sessionStopReason: null,
    lossUtilization: null,
    sessionAdmissionError: 'ACCOUNT_OVERVIEW: HTTP Error 500',
  });
  expect(result.active.find((alert) => alert.id === 'session-admission')).toMatchObject({
    severity: 'ERROR',
    source: 'SESSION',
    message: 'ACCOUNT_OVERVIEW: HTTP Error 500',
  });
  const source = readFileSync(resolve('web_dashboard/src/main.tsx'), 'utf8');
  expect(source).not.toContain('className="session-start-error"');
});

it('shows a recovered historical rejection in existing warnings without blocking a new explicit Start', () => {
  const attempt = {
    outcome: 'REJECTED',
    blocker: 'PRODUCTION_AUTHENTICATED_STATE_STALE',
    requestedAt: 10,
  };
  const alerts = buildOperatorAlertsV1({
    now: 20000,
    connected: true,
    degraded: false,
    runtimeState: 'RUNNING',
    blockers: [],
    events: [],
    sessionState: 'IDLE',
    sessionStopReason: null,
    lossUtilization: null,
    lastStartAttempt: attempt,
    admissionReadinessBlocker: null,
  });
  expect(alerts.active[0]).toMatchObject({ severity: 'WARNING', timestamp: 10 });
  expect(alerts.active[0]?.message).toContain('Previous Start rejected');
  expect(alerts.active[0]?.message).toContain('Current readiness has no blocker');
  const diagnostics = deriveDecibelSessionControlDiagnosticsV1({
    sessionState: 'IDLE',
    latestSessionStatus: 'ENDED',
    lastStartAttempt: {
      ...attempt,
      outcome: 'REJECTED',
      completedAt: 11,
      expectedSettingsRevision: 0,
      sessionId: null,
    },
    executionLoopRunning: false,
    executionCycles: 0,
    executionBlocker: null,
  });
  expect(diagnostics).toMatchObject({
    state: 'WAITING_FOR_USER_START',
    blocker: null,
    lastStartRejection: { blocker: attempt.blocker },
    loop: 'NOT_SCHEDULED',
  });
});

it('shows exact terminal conflict provenance in the existing recovery Warning', () => {
  const reason =
    'EXECUTION_AUTHORITATIVE_RECONCILIATION_CONFLICT:INVARIANT=ORDER_IDENTITY_MISMATCH:INTENT=intent-record:LOCAL_ORDER=venue-record:OBSERVED_CLIENT=other-client';
  const result = buildOperatorAlertsV1({
    now: 10000,
    connected: true,
    degraded: false,
    runtimeState: 'BLOCKED',
    blockers: [],
    events: [],
    sessionState: 'RECOVERY_BLOCKED',
    sessionStopReason: reason,
    lossUtilization: null,
  });
  expect(result.active.find((alert) => alert.id === 'session-RECOVERY_BLOCKED')).toMatchObject({
    message: `Session recovery is blocked: ${reason}`,
    code: reason,
    severity: 'ERROR',
  });
});
