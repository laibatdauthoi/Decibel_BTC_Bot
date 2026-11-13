import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectNewerSnapshotV1 } from './snapshot_v1';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OverviewView } from './main.js';

type Props = {
  -readonly [K in keyof Parameters<typeof OverviewView>[0]]: Parameters<typeof OverviewView>[0][K];
};
function createProps(): Props {
  return {
    now: 20000,
    connected: true,
    settings: null,
    session: {
      state: 'IDLE',
      persistedState: 'IDLE',
      ownerState: 'NONE',
      recoveryBlocker: null,
      activeSession: null,
    },
    telemetry: {
      overviewHistory: {
        totalSessionsExecuted: 104,
        utcDayStart: 0,
        volumeSinceUTCStartUsd: 1234,
        lifetimeVolumeUsd: 2654.5,
        allTimeNetPnlUsd: 12,
        allTimeIncompletePnlCount: 0,
      },
      quoteSizing: null,
      generatedAt: 20000,
      degraded: false,
      lastSuccessfulCycleAt: 20000,
      runtime: {
        state: 'READY',
        network: 'test',
        releaseStage: 'TEST',
        dryRun: true,
        authenticatedStateAgeMs: 0,
        journalStatus: 'READY',
        executionLoopRunning: false,
        executionLoopHealthy: true,
        executionSessionId: null,
        executionCycles: 0,
        lastExecutionAction: null,
        executionBlocker: null,
        strategyState: null,
        bidEligible: null,
        askEligible: null,
        whyNoAction: null,
        lastCycleAgeMs: 0,
        lastMutation: null,
        lifecycleBlocker: null,
        rateLimitBackoff: false,
        lastError: null,
        readiness: {
          processReady: true,
          accountReady: true,
          marketReady: true,
          executionSafe: true,
          economicReady: true,
          blockingComponent: null,
          blockingReason: null,
        },
        dependencies: { economic: 'READY', recovery: 'READY', authenticatedState: 'READY' },
      },
      market: { bestBid: 99999, bestAsk: 100001, spread: 2, midpoint: 100000, bookAgeMs: 0 },
      account: {
        collateralUsd: 10,
        availableMarginUsd: 10,
        availableMarginReason: null,
        marginUsedUsd: 0,
        marginUsedReason: null,
        effectiveLeverage: 1,
      },
      inventory: {
        positionBase: 0,
        positionNotionalUsd: 0,
        direction: 'FLAT',
        remainingCapacityBase: 1,
        maximumPositionBase: 1,
      },
      positions: [],
      orders: [],
      ladder: [
        {
          levelId: 'SELL-1',
          side: 'SELL',
          desiredPrice: 100001,
          desiredQuantity: 0.002,
          activeVenueOrderId: null,
        },
        {
          levelId: 'BUY-1',
          side: 'BUY',
          desiredPrice: 99999,
          desiredQuantity: 0.001,
          activeVenueOrderId: null,
        },
      ],
      pnl: {
        realized24hUsd: null,
        realized7dUsd: null,
        realized30dUsd: null,
        sessionPnl: {
          valueUsd: 99,
          realizedUsd: 99,
          unrealizedUsd: null,
          feesUsd: null,
          gasUsd: null,
          complete: false,
          scope: 'BOT_SESSION',
        },
        allTimePnl: {
          valueUsd: 99,
          realizedUsd: 99,
          unrealizedUsd: null,
          feesUsd: null,
          gasUsd: null,
          complete: false,
          scope: 'BOT_ONLY',
        },
      },
      volume: {},
      risk: {},
      blockers: [],
      intents: [],
      fills: [],
      events: [],
    },
  };
}
function renderOverview(props: Props) {
  return renderToStaticMarkup(createElement(OverviewView, props));
}
function activateSession(p: Props, id = 'session-2') {
  p.session = {
    state: 'RUNNING',
    persistedState: 'RUNNING',
    ownerState: 'OWNED',
    recoveryBlocker: null,
    activeSession: {
      sessionId: id,
      configRevision: 1,
      startedAt: 10000,
      endedAt: null,
      status: 'RUNNING',
      stopReason: null,
      configSnapshot: {
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        targetMakerVolumeUsd: 100,
        orderNotionalUsd: 10,
        maxPositionUsd: 20,
      },
      sessionPnlUsd: 999,
      pnlComplete: true,
      makerVolumeUsd: 999,
      takerVolumeUsd: 0,
      totalExecutedVolumeUsd: 999,
      targetSemanticsVersion: 2,
      fillCount: 1,
      feesUsd: 0,
      gasUsd: null,
      placeCount: 1,
      cancelCount: 0,
      reconciliationCount: 0,
      blockerCount: 0,
    },
  };
  p.telemetry.runtime.executionSessionId = id;
  p.telemetry.runtime.executionLoopRunning = true;
  p.telemetry.overviewEvidence = {
    sessionId: id,
    capitalUsd: 8,
    maxLossUsd: 2,
    sessionPnlUsd: -0.5,
    makerVolumeUsd: 25,
    takerVolumeUsd: 5,
    totalExecutedVolumeUsd: 30,
  };
}
function getSection(html: string, className: string): string {
  return html.split(`<section class="${className}">`)[1]?.split('</section>')[0] ?? '';
}
describe('Overview evidence and original presentation', () => {
  it('keeps original market header, two columns, planned BUY/SELL quotes and five metric cards', () => {
    const p = createProps();
    const html = renderOverview(p);
    expect(html).toContain('class="market-view"');
    expect(html).toContain('compact-market-price');
    const cards = getSection(html, 'inventory-strip');
    const expectedLabels = [
      'TOTAL SESSIONS EXECUTED',
      'TOTAL EXECUTED VOLUME',
      'ALL-TIME PNL',
      'COST / 1M VOL',
      'TODAY VOL (UTC)',
    ];
    expect([...cards.matchAll(/<small>(.*?)<\/small>/g)].map((match) => match[1])).toEqual(
      expectedLabels,
    );
    for (const label of [
      'BTC/USD',
      'BID',
      'ASK',
      'SPREAD',
      '[ LIVE QUOTES ]',
      'SELL',
      'BUY',
      'L1',
      '99,999.0',
      '100,001.0',
    ])
      expect(html).toContain(label);
    expect(html).toContain('class="quote-mark" aria-hidden="true"');
    expect(html).not.toContain('>+</span>');
    expect(html).toContain('overview-bot-group');
    expect(html).toContain('overview-quotes-group');
    expect(html).toContain('quote-book');
    expect(html).toContain('quote-mid');
    expect(html).not.toContain('LIVE ORDERS');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('overview-compact');
    expect(html.match(/<section /g)).toHaveLength(4);
    expect(getSection(html, 'inventory-strip').match(/<small>/g)).toHaveLength(5);
  });
  it('stopped bot shows planned quotes with no session totals or assertion they are open orders', () => {
    const html = renderOverview(createProps());
    const bot = getSection(html, 'bot-state-panel');
    expect(bot).toContain('STOPPED');
    expect(bot).toContain('<span>OPEN ORDERS</span><b>0</b>');
    expect(getSection(html, 'quote-section')).toContain('99,999.0');
    expect(html).toContain('NO SESSION');
    expect(html).not.toContain('$99.00');
    expect(html).toContain('NOT VERIFIED');
  });
  it('counts verified venue orders after stop independently of planned quotes', () => {
    const p = createProps();
    p.telemetry.orders = [
      {
        venueOrderId: 'order',
        clientOrderId: 'client',
        side: 'SELL',
        price: 100010,
        quantity: 0.001,
      },
    ];
    expect(getSection(renderOverview(p), 'bot-state-panel')).toContain(
      '<span>OPEN ORDERS</span><b>1</b>',
    );
    expect(getSection(renderOverview(p), 'quote-section')).not.toContain('100,010.0');
    p.telemetry.runtime.readiness.accountReady = false;
    expect(getSection(renderOverview(p), 'bot-state-panel')).toContain('UNVERIFIED');
    expect(getSection(renderOverview(p), 'quote-section')).toContain('99,999.0');
  });
  it('uses canonical PnL/limit, replaces fill snapshots and excludes previous session values', () => {
    const p = createProps();
    activateSession(p);
    expect(renderOverview(p)).toContain('$0.50');
    expect(renderOverview(p)).toContain('$2.00');
    expect(renderOverview(p)).toContain('$30.00');
    expect(renderOverview(p)).toBe(renderOverview(p));
    p.telemetry.overviewEvidence!.totalExecutedVolumeUsd = 40;
    p.telemetry.overviewEvidence!.sessionPnlUsd = 1;
    expect(renderOverview(p)).toContain('$40.00');
    expect(renderOverview(p)).toContain('$1.00');
    p.telemetry.overviewEvidence!.sessionId = 'session-1';
    expect(renderOverview(p)).toContain('NOT VERIFIED');
    expect(renderOverview(p)).not.toContain('$40.00');
    activateSession(p, 'session-3');
    p.telemetry.overviewEvidence!.sessionPnlUsd = 0;
    p.telemetry.overviewEvidence!.totalExecutedVolumeUsd = 0;
    expect(renderOverview(p)).toContain('$0.00');
    expect(renderOverview(p)).not.toContain('$40.00');
  });
  it('market and planned quotes stay fresh when session/accounting sources are stale', () => {
    const p = createProps();
    activateSession(p);
    p.sessionObservedAt = 0;
    p.telemetry.lastSuccessfulCycleAt = 0;
    p.telemetry.degraded = true;
    expect(getSection(renderOverview(p), 'market-header')).toContain('100,000.0');
    expect(getSection(renderOverview(p), 'quote-section')).toContain('99,999.0');
    expect(getSection(renderOverview(p), 'inventory-strip')).toContain('UNAVAILABLE');
  });
  it('missing PnL does not hide valid capital, limit, volume, history, status or quotes', () => {
    const p = createProps();
    activateSession(p);
    p.telemetry.overviewEvidence!.sessionPnlUsd = null;
    p.telemetry.pnl.allTimePnl = {
      valueUsd: 12,
      realizedUsd: 12,
      unrealizedUsd: 0,
      feesUsd: 0,
      gasUsd: 0,
      complete: true,
      scope: 'BOT_ONLY',
    };
    const html = renderOverview(p);
    for (const value of ['$8.00', '$2.00', '$30.00', 'RUNNING', '99,999.0'])
      expect(html).toContain(value);
    expect(getSection(html, 'inventory-strip')).not.toContain('STALE');
  });
  it('stale market does not hide a fresh session PnL or capital', () => {
    const p = createProps();
    activateSession(p);
    p.telemetry.market.bookAgeMs = 20000;
    expect(getSection(renderOverview(p), 'market-header')).toContain('STALE');
    expect(getSection(renderOverview(p), 'inventory-strip')).toContain('$2,654.50');
    expect(getSection(renderOverview(p), 'bot-state-panel')).toContain('$8.00');
  });
  it('shows actual pending reconciliation and waits on missing data', () => {
    const p = createProps();
    activateSession(p);
    p.telemetry.intents = [
      {
        timestamp: 19000,
        intentId: 'intent',
        action: 'PLACE',
        side: 'BUY',
        price: 100000,
        quantity: 0.001,
        status: 'SUBMIT_UNKNOWN',
        venueOrderId: null,
        transactionHash: null,
        blocker: null,
        reconciliationResult: null,
      },
    ];
    expect(renderOverview(p)).toContain('RECONCILING');
    p.telemetry.runtime.whyNoAction = 'ACCOUNT DATA REQUIRED';
    expect(renderOverview(p)).toContain('WAITING');
    p.now = 36000;
    expect(renderOverview(p)).toContain('STALE');
    expect(renderOverview(p)).not.toContain('$30.00');
  });
});

it('rejects replay, out-of-order and invalid frames; new session replaces old totals', () => {
  const prior = { generatedAt: 10, sessionId: 'old', volume: 100 };
  expect(selectNewerSnapshotV1(prior, { ...prior, generatedAt: 9 })).toBe(prior);
  expect(selectNewerSnapshotV1(prior, { ...prior })).toBe(prior);
  expect(selectNewerSnapshotV1(prior, { ...prior, generatedAt: NaN })).toBe(prior);
  const next = { generatedAt: 11, sessionId: 'new', volume: 0 };
  expect(selectNewerSnapshotV1(prior, next)).toBe(next);
});
it.each(['LONG', 'SHORT'] as const)(
  'renders authenticated %s quantity then flat on closing snapshot',
  (direction) => {
    const p = createProps();
    activateSession(p);
    p.telemetry.inventory = {
      ...p.telemetry.inventory,
      direction,
      positionBase: direction === 'LONG' ? 0.001 : -0.001,
    };
    expect(renderOverview(p)).toContain(direction);
    p.telemetry.inventory = { ...p.telemetry.inventory, direction: 'FLAT', positionBase: 0 };
    p.telemetry.overviewEvidence!.sessionPnlUsd = 0.25;
    expect(renderOverview(p)).toContain('FLAT');
    expect(renderOverview(p)).toContain('$0.25');
  },
);
it('cancel does not add fill volume and unverified account never asserts no orders', () => {
  const p = createProps();
  activateSession(p);
  p.telemetry.intents = [
    {
      timestamp: 19000,
      intentId: 'cancel',
      action: 'CANCEL',
      side: 'BUY',
      price: null,
      quantity: null,
      status: 'APPLIED',
      venueOrderId: 'order',
      transactionHash: null,
      blocker: null,
      reconciliationResult: 'CANCEL_CONFIRMED',
    },
  ];
  expect(renderOverview(p)).toContain('$30.00');
  p.telemetry.runtime.readiness.accountReady = false;
  expect(renderOverview(p)).toContain('UNVERIFIED');
  expect(getSection(renderOverview(p), 'bot-state-panel')).not.toContain(
    '<span>OPEN ORDERS</span><b>0</b>',
  );
});

it('renders reduce-only venue protection while keeping plans separate', () => {
  const p = createProps();
  activateSession(p);
  p.telemetry.orders = [
    {
      venueOrderId: 'tp',
      clientOrderId: 'tp-client',
      side: 'SELL',
      price: 100010,
      quantity: 0.001,
      reduceOnly: true,
    },
  ];
  const html = renderOverview(p);
  expect(getSection(html, 'bot-state-panel')).toContain('<span>OPEN ORDERS</span><b>1</b>');
  expect(getSection(html, 'quote-section')).toContain('99,999.0');
  expect(html).toContain('HOLD');
});

it('renders the requested operational/session fields without duplicate status and optional offline visual fixtures', () => {
  const p = createProps();
  activateSession(p);
  const bot = getSection(renderOverview(p), 'bot-state-panel');
  for (const label of [
    'CURRENT ACTION',
    'POSITION',
    'OPEN ORDERS',
    'LAST ACTION',
    'REASON',
    'TARGET VOLUME',
    'PROGRESS',
    'ELAPSED TIME',
    'CAPITAL',
    'SESSION PNL',
    'MAX LOSS',
  ])
    expect(bot).toContain(label);
  expect(bot).not.toContain('<span>BOT STATUS</span>');
  expect(bot).toContain('aria-label="Share Card"');
  expect(bot).toContain('<svg');
  expect(bot).toContain('stroke-width="2.5"');
  expect(bot.match(/<circle /g)).toHaveLength(5);
  expect(bot).not.toMatch(/>Share Card<|>Preparing/);
  expect(bot).not.toContain('DIAGNOSTICS');
  expect(bot).not.toContain('ECONOMIC INIT');
  const directory = process.env.DECIBEL_OVERVIEW_RENDER_DIR;
  if (directory) {
    mkdirSync(directory, { recursive: true });
    const css = readFileSync('web_dashboard/src/styles.css', 'utf8');
    for (const [name, fixture] of [
      ['restored_running', p],
      [
        'restored_zero',
        (() => {
          const zero = createProps();
          activateSession(zero);
          zero.telemetry.overviewEvidence!.totalExecutedVolumeUsd = 0;
          return zero;
        })(),
      ],
      ['restored_stopped', createProps()],
    ] as const) {
      writeFileSync(
        join(directory, `${name}.html`),
        `<!doctype html><meta charset="utf-8"><style>${css}</style><main class="app-shell"><header class="top-bar"><button class="wordmark">DECIBEL / MM V1</button><nav><button class="active">[ OVERVIEW ]</button><button>[ ACTIVITY ]</button><button>[ SETTINGS ]</button></nav></header>${renderOverview(fixture)}<footer class="bottom-bar">READ-ONLY RENDER FIXTURE</footer></main>`,
      );
    }
  }
});

it('updates progress and elapsed from session data, respecting the legacy maker target', () => {
  const p = createProps();
  activateSession(p);
  expect(renderOverview(p)).toContain('stroke-dashoffset="70"');
  expect(renderOverview(p)).toContain('30.0%');
  expect(renderOverview(p)).toContain('00:00:10');
  p.now += 1000;
  expect(renderOverview(p)).toContain('00:00:11');
  p.session!.activeSession!.targetSemanticsVersion = 1;
  expect(renderOverview(p)).toContain('stroke-dashoffset="75"');
  p.session!.activeSession!.configSnapshot.targetMakerVolumeUsd = -1;
  expect(renderOverview(p)).toContain('UNTIL LIMIT');
  expect(renderOverview(p)).not.toContain('<progress');
});
it('history counts and UTC volume survive session reset but cannot leak yesterday into today', () => {
  const p = createProps();
  activateSession(p);
  let cards = getSection(renderOverview(p), 'inventory-strip');
  expect(cards).toContain('>104</strong>');
  expect(cards).toContain('$1,234.00');
  p.session = { ...p.session!, state: 'IDLE', activeSession: null };
  cards = getSection(renderOverview(p), 'inventory-strip');
  expect(cards).toContain('NO SESSION');
  expect(cards).toContain('>104</strong>');
  expect(cards).toContain('$1,234.00');
  p.now = 86400001;
  p.telemetry.generatedAt = p.now;
  expect(getSection(renderOverview(p), 'inventory-strip')).not.toContain('$1,234.00');
  p.telemetry.overviewHistory = {
    totalSessionsExecuted: 104,
    utcDayStart: 86400000,
    volumeSinceUTCStartUsd: 0,
  };
  expect(getSection(renderOverview(p), 'inventory-strip')).toContain('$0.00');
});
it('Share Card requires a current running session and hides no valid data when disabled', () => {
  const p = createProps();
  expect(renderOverview(p)).toMatch(/<button[^>]*aria-label="Share Card"[^>]*disabled=""/);
  activateSession(p);
  expect(renderOverview(p)).not.toMatch(/<button[^>]*aria-label="Share Card"[^>]*disabled=""/);
  p.connected = false;
  expect(renderOverview(p)).toMatch(/<button[^>]*aria-label="Share Card"[^>]*disabled=""/);
});

it('prioritizes session fields, removes volume subtext and binds lifetime totals independently', () => {
  const p = createProps();
  activateSession(p);
  let html = renderOverview(p);
  const bot = getSection(html, 'bot-state-panel');
  const labels = [...bot.matchAll(/<span>([^<]+)<\/span>/g)].map((match) => match[1]);
  expect(labels).toEqual([
    'TARGET VOLUME',
    'PROGRESS',
    'ELAPSED TIME',
    'CAPITAL',
    'SESSION PNL',
    'MAX LOSS',
    'CURRENT ACTION',
    'POSITION',
    'OPEN ORDERS',
    'LAST ACTION',
    'REASON',
  ]);
  const cards = getSection(html, 'inventory-strip');
  // Lifetime volume (all sessions), not the current session's volume.
  expect(cards).toContain('$2,654.50');
  expect(cards).toContain('+$12.00');
  expect(cards).not.toContain('PnL +');
  expect(cards).not.toContain('MAKER');
  expect(cards).not.toContain('TAKER');
  p.telemetry.overviewEvidence!.sessionPnlUsd = 77;
  expect(getSection(renderOverview(p), 'inventory-strip')).toContain('+$12.00');
  p.session = { ...p.session!, state: 'IDLE', activeSession: null };
  expect(getSection(renderOverview(p), 'inventory-strip')).toContain('+$12.00');
  p.telemetry.overviewHistory = { ...p.telemetry.overviewHistory!, allTimeNetPnlUsd: null };
  html = renderOverview(p);
  expect(getSection(html, 'inventory-strip')).toContain('UNVERIFIED');
  expect(getSection(html, 'inventory-strip')).not.toContain('+$12.00');
});

it('keeps Share inactive for a RUNNING session with unavailable share evidence even with fresh market data', () => {
  const p = createProps();
  activateSession(p);
  const disabled = /<button[^>]*aria-label="Share Card"[^>]*disabled=""/;
  expect(renderOverview(p)).not.toMatch(disabled);
  p.session = { ...p.session!, state: 'RECOVERY_BLOCKED' };
  expect(renderOverview(p)).toMatch(disabled);
  p.session = { ...p.session, state: 'RUNNING' };
  p.telemetry.overviewEvidence!.sessionPnlUsd = null;
  expect(renderOverview(p)).toMatch(disabled);
  expect(getSection(renderOverview(p), 'market-header')).toContain('100,000.0');
  p.telemetry.overviewEvidence!.sessionPnlUsd = -0.5;
  p.telemetry.overviewEvidence!.sessionId = 'old-session';
  expect(renderOverview(p)).toMatch(disabled);
  p.telemetry.overviewEvidence!.sessionId = 'session-2';
  p.telemetry.overviewEvidence!.totalExecutedVolumeUsd = null;
  expect(renderOverview(p)).toMatch(disabled);
  p.telemetry.overviewEvidence!.totalExecutedVolumeUsd = 0;
  expect(renderOverview(p)).not.toMatch(disabled);
  p.session.activeSession!.startedAt = null;
  expect(renderOverview(p)).toMatch(disabled);
});

it('keeps progress inline with a ring at zero and full progress and hides unavailable rings', () => {
  const p = createProps();
  expect(renderOverview(p)).not.toContain('overview-session-progress');
  activateSession(p);
  for (const [volume, offset, percent] of [
    [0, 100, '0.0%'],
    [100, 0, '100.0%'],
  ] as const) {
    p.telemetry.overviewEvidence!.totalExecutedVolumeUsd = volume;
    const bot = getSection(renderOverview(p), 'bot-state-panel');
    expect(bot).toContain(percent);
    expect(bot).toContain(`stroke-dashoffset="${offset}"`);
    expect(bot).toMatch(/class="overview-progress-cell"[^>]*>[^<]+<svg/);
    expect(bot).not.toContain('<progress');
  }
  p.telemetry.overviewEvidence!.totalExecutedVolumeUsd = null;
  expect(renderOverview(p)).not.toContain('overview-session-progress');
});
