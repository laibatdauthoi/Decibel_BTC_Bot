import { describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActivityView, SessionInlineDetail, type ProductionSession } from './main';
import {
  buildSessionShareV1,
  hasCompleteSessionTradesV1,
  SessionHistoryModal,
  SessionHistoryContent,
  readSessionHistoryV1,
} from './activity_actions_v1';
import { ActivityHistorySchemaV1 } from '../../src/decibel_activity_history_schema_v1';

type Props = ComponentProps<typeof ActivityView>;
const Session: ProductionSession = {
  sessionId: 'historical-session',
  configRevision: 1,
  startedAt: 1000,
  endedAt: 61000,
  status: 'ENDED',
  stopReason: 'PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING',
  configSnapshot: {
    capitalToUseUsd: 8,
    maxLossUsd: 2,
    targetMakerVolumeUsd: 100,
    orderNotionalUsd: 10,
    maxPositionUsd: 20,
  },
  sessionPnlUsd: 1.5,
  pnlComplete: true,
  makerVolumeUsd: 5,
  takerVolumeUsd: 2,
  totalExecutedVolumeUsd: 7,
  fillCount: 2,
  feesUsd: null,
  gasUsd: null,
  placeCount: null,
  cancelCount: null,
  reconciliationCount: null,
  blockerCount: null,
};
// Rendering Activity uses only generatedAt; history is fetched read-only by the modal.
const Telemetry = { generatedAt: 900000 } as Props['telemetry'];

describe('Activity compact session presentation', () => {
  it('keeps 125 sessions inside the dedicated scroll container with no Activity label', () => {
    const html = renderToStaticMarkup(
      createElement(ActivityView, {
        telemetry: Telemetry,
        sessions: Array.from({ length: 125 }, (_, index) => ({
          ...Session,
          sessionId: `fixture-${index}`,
        })),
      }),
    );
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(125);
    expect(html).toContain('session-history-scroll');
    expect(html).toContain('fixture-124');
    expect(html).not.toContain('[ ACTIVITY ]');
    expect(html).toContain('SESSIONS');
  });
  it('shows only Summary/Config and three named icon actions in the inline details', () => {
    const html = renderToStaticMarkup(
      createElement(SessionInlineDetail, { session: Session, telemetry: Telemetry }),
    );
    expect(html).toContain('[ SUMMARY ]');
    expect(html).toContain('[ CONFIG ]');
    expect(html).not.toContain('[ EVENTS ]');
    expect(html).not.toContain('<table');
    expect(html.match(/<button/g)).toHaveLength(3);
    for (const label of ['Share Session', 'Error Logs', 'Trade History'])
      expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING');
  });
  it('exports the chosen historical session, its saved capital and stopped duration', () => {
    const share = buildSessionShareV1(Session, 900000)!;
    expect(share.data.sessionId).toBe('historical-session');
    expect(share.data.capital).toBe('$8.00');
    expect(share.data.elapsed).toBe('00:01:00');
    expect(share.rows).toContainEqual(['Fills', '2']);
    expect(share.rows).toContainEqual(['Executed Volume', '$7.00']);
    expect(share.data.progress).toContain('7.0%');
  });
  it.each([
    { sessionPnlUsd: null },
    { pnlComplete: false },
    { totalExecutedVolumeUsd: null },
    { fillCount: null },
    { startedAt: null },
  ])('disables sharing when mandatory evidence is missing: %j', (missing) => {
    expect(buildSessionShareV1({ ...Session, ...missing }, 900000)).toBeNull();
    const html = renderToStaticMarkup(
      createElement(SessionInlineDetail, {
        session: { ...Session, ...missing },
        telemetry: Telemetry,
      }),
    );
    expect(html).toMatch(/aria-label="Share Session"[^>]*disabled/);
  });
  it('requires a verified capital and end time for a historical share', () => {
    expect(
      buildSessionShareV1(
        { ...Session, configSnapshot: { ...Session.configSnapshot, capitalToUseUsd: NaN } },
        900000,
      ),
    ).toBeNull();
    expect(buildSessionShareV1({ ...Session, endedAt: null }, 900000)).toBeNull();
  });
  it('preserves unlimited volume mode', () => {
    expect(
      buildSessionShareV1(
        { ...Session, configSnapshot: { ...Session.configSnapshot, targetMakerVolumeUsd: -1 } },
        900000,
      )!.data.progress,
    ).toBe('UNTIL CAPITAL LIMIT');
  });
  it('only verifies complete trades when identity, count and volume reconcile', () => {
    const history = ActivityHistorySchemaV1.parse({
      sessionId: Session.sessionId,
      journalAvailable: true,
      errorsComplete: false,
      errors: [],
      fills: [
        { fillId: 'partial-a', timestamp: 1500, side: 'BUY', quantity: 0.03, price: 100 },
        { fillId: 'partial-b', timestamp: 1500, side: 'BUY', quantity: 0.04, price: 100 },
      ],
    });
    expect(hasCompleteSessionTradesV1(Session, history)).toBe(true);
    expect(hasCompleteSessionTradesV1(Session, { ...history, sessionId: 'other' })).toBe(false);
    expect(hasCompleteSessionTradesV1(Session, { ...history, fills: history.fills.slice(1) })).toBe(
      false,
    );
    expect(hasCompleteSessionTradesV1({ ...Session, totalExecutedVolumeUsd: 8 }, history)).toBe(
      false,
    );
    expect(hasCompleteSessionTradesV1({ ...Session, endedAt: null }, history)).toBe(false);
  });
  it('renders accessible modal titles and a loading state rather than false empty-history claims', () => {
    for (const kind of ['error', 'trade'] as const) {
      const html = renderToStaticMarkup(
        createElement(SessionHistoryModal, { kind, session: Session, close: () => undefined }),
      );
      expect(html).toContain(`aria-label="${kind === 'error' ? 'ERROR LOGS' : 'TRADE HISTORY'}"`);
      expect(html).toContain(kind === 'error' ? 'ERROR LOGS' : 'TRADE HISTORY');
      expect(html).toContain('Loading session history');
      expect(html).not.toContain('No errors recorded');
      expect(html).not.toContain('No trades recorded');
    }
  });
});

describe('Activity modal evidence presentation', () => {
  const history = ActivityHistorySchemaV1.parse({
    sessionId: Session.sessionId,
    journalAvailable: true,
    errorsComplete: false,
    errors: [
      {
        id: '1',
        timestamp: 1500,
        type: 'PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING',
        description: 'Original long diagnostic description',
      },
    ],
    fills: [
      { fillId: 'partial-1', timestamp: 1500, side: 'BUY', quantity: 0.03, price: 100 },
      { fillId: 'partial-2', timestamp: 1500, side: 'SELL', quantity: 0.04, price: 100 },
    ],
  });
  it('renders every partial fill with honest direction and unknown Fee/PnL', () => {
    const html = renderToStaticMarkup(
      createElement(SessionHistoryContent, {
        kind: 'trade',
        session: Session,
        history,
        failed: false,
      }),
    );
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html.match(/<td(?: class="[^"]*")?>UNKNOWN<\/td>/g)).toHaveLength(4);
    expect(html).toContain('0.03000000');
    expect(html).toContain('0.04000000');
    expect(html).toContain('activity-positive');
    expect(html).toContain('activity-negative');
    expect(html).not.toContain('Open Long');
    expect(html).not.toContain('Close Short');
  });
  it('keeps original long error codes and explains incomplete log coverage', () => {
    const html = renderToStaticMarkup(
      createElement(SessionHistoryContent, {
        kind: 'error',
        session: Session,
        history,
        failed: false,
      }),
    );
    expect(html).toContain('PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING');
    expect(html).toContain('Original long diagnostic description');
    expect(html).toContain('Partial error history');
  });
  it('never displays data belonging to another session', () => {
    const html = renderToStaticMarkup(
      createElement(SessionHistoryContent, {
        kind: 'error',
        session: Session,
        history: { ...history, sessionId: 'other' },
        failed: false,
      }),
    );
    expect(html).toContain('Historical data unavailable');
    expect(html).not.toContain('Original long diagnostic description');
  });
  it('distinguishes verified zero fills from incomplete or unavailable history', () => {
    const empty = { ...history, errors: [], fills: [] };
    const complete = renderToStaticMarkup(
      createElement(SessionHistoryContent, {
        kind: 'trade',
        session: { ...Session, fillCount: 0, totalExecutedVolumeUsd: 0 },
        history: empty,
        failed: false,
      }),
    );
    expect(complete).toContain('No trades recorded');
    const partial = renderToStaticMarkup(
      createElement(SessionHistoryContent, {
        kind: 'trade',
        session: Session,
        history: empty,
        failed: false,
      }),
    );
    expect(partial).not.toContain('No trades recorded');
    expect(partial).toContain('may be incomplete');
    const errors = renderToStaticMarkup(
      createElement(SessionHistoryContent, {
        kind: 'error',
        session: Session,
        history: empty,
        failed: false,
      }),
    );
    expect(errors).not.toContain('No errors recorded');
    expect(errors).toContain('may be incomplete');
  });
});

describe('Historical modal API flow', () => {
  const history = {
    sessionId: Session.sessionId,
    journalAvailable: true,
    errorsComplete: false,
    fills: [],
    errors: [],
  };
  it('requests the selected ID and validates the response identity before publication', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(history), { status: 200 }));
    const Abort = new AbortController();
    expect((await readSessionHistoryV1(Session.sessionId, Abort.signal, fetcher)).sessionId).toBe(
      Session.sessionId,
    );
    expect(fetcher).toHaveBeenCalledWith(`/api/activity-history?sessionId=${Session.sessionId}`, {
      signal: Abort.signal,
    });
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ ...history, sessionId: 'other' }), { status: 200 }),
    );
    await expect(readSessionHistoryV1(Session.sessionId, Abort.signal, fetcher)).rejects.toThrow(
      'SESSION_MISMATCH',
    );
  });
  it('rejects a late old-session response after cancellation while allowing the new session', async () => {
    const Old = new AbortController();
    let respond: (response: Response) => void = () => undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    const oldRequest = readSessionHistoryV1(Session.sessionId, Old.signal, fetcher);
    const rejected = expect(oldRequest).rejects.toThrow('History request aborted');
    Old.abort();
    respond(new Response(JSON.stringify(history), { status: 200 }));
    await rejected;
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ ...history, sessionId: 'new-session' }), { status: 200 }),
    );
    expect(
      (await readSessionHistoryV1('new-session', new AbortController().signal, fetcher)).sessionId,
    ).toBe('new-session');
  });
  it('identifies an unavailable backend route rather than reporting an empty history', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(
      readSessionHistoryV1(Session.sessionId, new AbortController().signal, fetcher),
    ).rejects.toThrow('HISTORY_API_UNAVAILABLE_HTTP_404');
    const html = renderToStaticMarkup(
      createElement(SessionHistoryContent, {
        kind: 'trade',
        session: Session,
        history: null,
        failed: true,
        failure: { state: 'UNAVAILABLE', message: 'History API unavailable' },
      }),
    );
    expect(html).toContain('data-history-state="UNAVAILABLE"');
    expect(html).not.toContain('No trades recorded');
  });
  it('uses the same canonical cost for live metrics and the historical card, without adding fees twice', async () => {
    const { calculateOverviewCostPerMillionV1, formatShareCostPerMillionV1 } =
      await import('./overview_share_v1');
    const share = buildSessionShareV1(Session, 900000)!;
    expect(share.data.costPerMillion).toBe(
      calculateOverviewCostPerMillionV1(Session.sessionPnlUsd, Session.totalExecutedVolumeUsd),
    );
    expect(share.rows).toContainEqual([
      'COST / 1M VOL',
      formatShareCostPerMillionV1(share.data.costPerMillion ?? null),
    ]);
    expect(
      buildSessionShareV1({ ...Session, totalExecutedVolumeUsd: 0 }, 900000)!.data.costPerMillion,
    ).toBeNull();
  });
});

it('renders authenticated fee, mixed-case direction, and N/A separately from unavailable closing PnL', () => {
  const history = ActivityHistorySchemaV1.parse({
    sessionId: Session.sessionId,
    journalAvailable: true,
    errorsComplete: false,
    errors: [],
    fills: [
      {
        fillId: 'open',
        timestamp: 1500,
        side: 'BUY',
        price: 100,
        quantity: 0.03,
        feeUsd: 0.002,
        direction: 'Open Long',
        closePnlAvailability: 'N/A',
        pnlAtCloseUsd: null,
      },
      {
        fillId: 'close',
        timestamp: 1600,
        side: 'SELL',
        price: 101,
        quantity: 0.03,
        feeUsd: 0.003,
        direction: 'Close Long',
        closePnlAvailability: 'UNKNOWN',
        pnlAtCloseUsd: null,
      },
    ],
  });
  const html = renderToStaticMarkup(
    createElement(SessionHistoryContent, {
      kind: 'trade',
      session: Session,
      history,
      failed: false,
    }),
  );
  expect(html).toContain('Open Long');
  expect(html).toContain('Close Long');
  expect(html).toContain('$0.002000');
  expect(html).toContain('$0.003000');
  expect(html).toContain('>?</td>');
  expect(html).toContain('>UNKNOWN</td>');
  expect(html).toContain('PNL (GROSS)');
  expect(html).toContain('NET PNL');
});
