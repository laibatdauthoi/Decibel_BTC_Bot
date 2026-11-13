import { renderSessionActionButtonV1 } from './session_action_button_v1';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsView } from './main';
import { parseSavedSettingsV1, selectSavedSettingsV1 } from './settings_state_v1';

// Exercise the real component handlers with deterministic hook state; no server or trading process.
const Hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as unknown[],
  cursor: 0,
  refCursor: 0,
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: () => undefined,
  useState: (initial: unknown) => {
    const index = Hooks.cursor++;
    if (!(index in Hooks.values))
      Hooks.values[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [
      Hooks.values[index],
      (next: unknown) => {
        Hooks.values[index] =
          typeof next === 'function'
            ? (next as (previous: unknown) => unknown)(Hooks.values[index])
            : next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = Hooks.refCursor++;
    return (Hooks.refs[index] ??= { current: initial });
  },
}));
type Props = Parameters<typeof SettingsView>[0];
type MutableProps = { -readonly [K in keyof Props]: Props[K] };
type ElementProps = {
  children?: ReactNode;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  value?: string;
  className?: string;
  startAllowed?: boolean;
  onStart?: () => void;
};
function getElements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(getElements);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...getElements(node.props.children)];
}
function createProps(): MutableProps {
  return {
    hidden: false,
    tradingDecision: null,
    projectionReady: false,
    settings: {
      revision: 2,
      values: {
        capitalToUseUsd: 5,
        maxLossUsd: 1,
        targetMakerVolumeUsd: 100,
        orderNotionalUsd: 10,
        maxPositionUsd: 20,
      },
    },
    session: null,
    startBlocked: false,
    startBlockReason: null,
    accountEquityUsd: 10,
    availableMarginUsd: 5.44,
    availableMarginReason: null,
    marginEvidenceStatus: 'fresh',
    marginUsedUsd: 0,
    marginUsedReason: null,
    telemetryGeneratedAt: 1000,
    sessionTargetVolumeUsd: null,
    etaEvidenceReady: false,
    volumeSessionId: null,
    latestSessionStatus: null,
    latestSessionId: null,
    maximumEffectiveLeverage: 1,
    venueMaximumNotionalUsd: 20,
    effectivePositionLimitUsd: 20,
    executionLoopRunning: false,
    executionBlocker: null,
    publishSessionWarning: vi.fn(),
    refreshSettings: vi.fn(() => Promise.resolve()),
    refreshSession: vi.fn(() => Promise.resolve()),
  };
}
function renderView(props: Props) {
  Hooks.cursor = 0;
  Hooks.refCursor = 0;
  const tree = SettingsView(props);
  const elements = getElements(tree);
  const button = (label: string) => {
    const result = elements.find((item) => item.type === 'button' && item.props.children === label);
    if (!result) throw new Error(`Missing button ${label}`);
    return result;
  };
  return {
    html: renderToStaticMarkup(tree),
    button,
    inputs: elements.filter((item) => item.type === 'input'),
    action: elements.find((item) => item.props.onStart !== undefined)!,
  };
}
// Supply the server projection at the exact draft key; effects are disabled in this handler harness.
function resolveEntryProjection(props: MutableProps, value: number | null = 10) {
  props.projectionReady = true;
  const pending = Hooks.values[0] as { capital: string; maxLoss: string; targetVolume: string };
  const query = new URLSearchParams({
    capitalToUseUsd: pending.capital,
    maxLossUsd: pending.maxLoss,
    targetMakerVolumeUsd: Hooks.values[1] === 'UNTIL_LIMIT' ? '-1' : pending.targetVolume,
  }).toString();
  Hooks.values[11] = {
    key: `${props.settings?.revision}:${query}:${props.telemetryGeneratedAt}:true`,
    value,
  };
}
const flushRequests = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
};
beforeEach(() => {
  Hooks.values = [];
  Hooks.refs = [];
});
afterEach(() => vi.unstubAllGlobals());

describe('Settings draft, saved and active configuration', () => {
  it.each([
    ['9', null, 'EXCEEDS AVAILABLE MARGIN', true],
    ['2', null, 'INSUFFICIENT CAPITAL FOR ENTRY', true],
    ['4', 10, null, false],
  ] as const)(
    'consolidates capital %s warnings inline without changing save eligibility',
    (capital, entry, warning, disabled) => {
      const props = createProps();
      let view = renderView(props);
      view.inputs[0].props.onChange!({ target: { value: capital } });
      resolveEntryProjection(props, entry);
      view = renderView(props);
      const capitalRow = view.html.match(/<label class="setting-row">.*?<\/label>/)?.[0];
      expect(capitalRow).toBeDefined();
      if (warning) expect(capitalRow).toContain(`<small>${warning}</small>`);
      expect(
        view.html.match(/EXCEEDS AVAILABLE MARGIN|INSUFFICIENT CAPITAL FOR ENTRY/g) ?? [],
      ).toHaveLength(warning ? 1 : 0);
      expect(view.html).not.toContain('ENTRY UNAVAILABLE');
      expect(view.html).toMatch(/<\/label><div class="volume-mode-field">/);
      expect(view.button('SAVE CHANGES').props.disabled).toBe(disabled);
      expect(view.html).toContain(
        '<span class="session-configuration-label">Capital</span><strong>$5.00</strong>',
      );
      if (entry === null) expect(view.html).toContain('UNAVAILABLE</b>');
    },
  );

  it.each([
    ['0.1', 10, 'TOO SMALL FOR ENTRY (MIN $0.17)'],
    ['0.17', 10, null],
    ['0.2', 15, 'TOO SMALL FOR ENTRY (MIN $0.25)'],
    ['0.1', null, null],
  ] as const)(
    'warns inline when Max Loss %s cannot admit a $%s entry, without blocking Save',
    (maxLoss, entry, warning) => {
      const props = createProps();
      let view = renderView(props);
      view.inputs[2].props.onChange!({ target: { value: maxLoss } });
      resolveEntryProjection(props, entry);
      view = renderView(props);
      const maxLossRow = view.html
        .match(/<label class="setting-row">.*?<\/label>/g)
        ?.find((row) => row.includes('MAX LOSS'));
      expect(maxLossRow).toBeDefined();
      if (warning) expect(maxLossRow).toContain(`<small>${warning}</small>`);
      else expect(maxLossRow).not.toContain('TOO SMALL FOR ENTRY');
      expect(view.html.match(/TOO SMALL FOR ENTRY/g) ?? []).toHaveLength(warning ? 1 : 0);
      expect(view.button('SAVE CHANGES').props.disabled).toBe(entry === null);
    },
  );

  it.each([
    ['0.5', 30, 'NOT ENOUGH FOR DCA (MIN $0.76)'],
    ['0.76', 30, null],
    ['0.1', 10, null], // the entry warning takes precedence
  ] as const)(
    'warns inline when Max Loss %s cannot fund a DCA addition for a $%s entry',
    (maxLoss, entry, warning) => {
      const props = createProps();
      let view = renderView(props);
      view.inputs[2].props.onChange!({ target: { value: maxLoss } });
      resolveEntryProjection(props, entry);
      view = renderView(props);
      const maxLossRow = view.html
        .match(/<label class="setting-row">.*?<\/label>/g)
        ?.find((row) => row.includes('MAX LOSS'));
      expect(maxLossRow).toBeDefined();
      if (warning) expect(maxLossRow).toContain(`<small>${warning}</small>`);
      else expect(maxLossRow).not.toContain('NOT ENOUGH FOR DCA');
      expect(view.button('SAVE CHANGES').props.disabled).toBe(false);
    },
  );

  it('does not label a pending projection as insufficient capital', () => {
    const view = renderView(createProps());
    expect(view.html).not.toContain('INSUFFICIENT CAPITAL FOR ENTRY');
    expect(view.html).not.toContain('ENTRY UNAVAILABLE');
    expect(view.button('SAVE CHANGES').props.disabled).toBe(true);
  });

  it.each(['9', '4'])(
    'keeps summary and START on saved $5 with unsaved capital %s',
    async (draft) => {
      const props = createProps();
      const fetchMock = vi.fn(() =>
        Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'TEST_REJECTION' }) }),
      );
      vi.stubGlobal('fetch', fetchMock);
      let view = renderView(props);
      view.inputs[0].props.onChange!({ target: { value: draft } });
      view = renderView(props);
      expect(view.html).toContain(
        '<span class="session-configuration-label">Capital</span><strong>$5.00</strong>',
      );
      expect(view.action.props.startAllowed).toBe(true);
      if (draft === '9') {
        expect(view.html).toContain('EXCEEDS AVAILABLE MARGIN');
        expect(view.button('SAVE CHANGES').props.disabled).toBe(true);
        view.button('SAVE CHANGES').props.onClick!();
        expect(fetchMock).not.toHaveBeenCalled();
      }
      view.action.props.onStart!();
      await flushRequests();
      expect(fetchMock.mock.calls[0]).toEqual([
        '/api/session/start',
        expect.objectContaining({ body: JSON.stringify({ expectedSettingsRevision: 2 }) }),
      ]);
      // One START, followed by a passive authoritative session read even when
      // the HTTP response rejects. Reconciliation must never resubmit START.
      expect(fetchMock.mock.calls).toHaveLength(2);
      expect(fetchMock.mock.calls[1]).toEqual(['/api/session']);
    },
  );
  it('keeps volume mode saved, renders the same description in both modes, and discards', () => {
    const props = createProps();
    let view = renderView(props);
    const description = 'NEW SESSIONS: ALL EXECUTED MAKER + TAKER FILLS, INCLUDING IOC AND CLOSES.';
    expect(view.html).toContain(description);
    view.button('UNTIL CAPITAL LIMIT').props.onClick!();
    view = renderView(props);
    expect(view.html).toContain('NO FIXED TARGET');
    expect(view.html).toContain(description);
    expect(view.html).not.toContain('(NEW SESSION:');
    expect(view.html).toContain(
      '<span class="session-configuration-label">Volume</span><strong>$100</strong>',
    );
    view.button('DISCARD').props.onClick!();
    view = renderView(props);
    expect(view.inputs[1].props.value).toBe('100');
    expect(props.settings!.values.targetMakerVolumeUsd).toBe(100);
    view.button('UNTIL CAPITAL LIMIT').props.onClick!();
    renderView(props).button('FIXED TARGET').props.onClick!();
    expect(renderView(props).html).toContain(description);
  });
  it.each(['stale', 'unknown', 'fresh'] as const)(
    'blocks START when saved capital has %s insufficient margin evidence',
    (status) => {
      const props = createProps();
      props.marginEvidenceStatus = status;
      props.availableMarginUsd = 4;
      expect(renderView(props).action.props.startAllowed).toBe(false);
    },
  );
  it('guards overlapping save handlers and keeps saved summary during pending/failure', async () => {
    const props = createProps();
    let finish: (value: unknown) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    let view = renderView(props);
    view.inputs[0].props.onChange!({ target: { value: '4' } });
    resolveEntryProjection(props);
    view = renderView(props);
    const save = view.button('SAVE CHANGES').props.onClick!;
    save();
    save();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view = renderView(props);
    expect(view.button('SAVE CHANGES').props.disabled).toBe(true);
    expect(view.action.props.startAllowed).toBe(false);
    expect(view.html).toContain(
      '<span class="session-configuration-label">Capital</span><strong>$5.00</strong>',
    );
    finish({ ok: false, json: () => Promise.resolve({ error: 'SAVE_FAILED' }) });
    await flushRequests();
    expect(props.refreshSettings).not.toHaveBeenCalled();
    expect(renderView(props).html).toContain(
      '<span class="session-configuration-label">Capital</span><strong>$5.00</strong>',
    );
  });
  it('updates the right panel only after authoritative save confirmation', async () => {
    const props = createProps();
    props.refreshSettings = vi.fn(() => {
      props.settings = {
        ...props.settings!,
        revision: 3,
        values: { ...props.settings!.values, capitalToUseUsd: 4 },
      };
      return Promise.resolve();
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              settings: { revision: 3, values: { ...props.settings!.values, capitalToUseUsd: 4 } },
            }),
        }),
      ),
    );
    let view = renderView(props);
    view.inputs[0].props.onChange!({ target: { value: '4' } });
    resolveEntryProjection(props);
    renderView(props).button('SAVE CHANGES').props.onClick!();
    expect(renderView(props).html).toContain(
      '<span class="session-configuration-label">Capital</span><strong>$5.00</strong>',
    );
    await flushRequests();
    view = renderView(props);
    expect(props.settings!.revision).toBe(3);
    expect(view.html).toContain(
      '<span class="session-configuration-label">Capital</span><strong>$4.00</strong>',
    );
  });
  it('keeps saved Entry Size while the draft target changes and disables Save without executable evidence', () => {
    const props = createProps();
    props.settings!.values.targetMakerVolumeUsd = 300;
    renderView(props);
    resolveEntryProjection(props, 15);
    const query = new URLSearchParams({
      capitalToUseUsd: '5',
      maxLossUsd: '1',
      targetMakerVolumeUsd: '300',
    }).toString();
    Hooks.values[10] = { key: `2:${query}:1000:true`, value: 15 };
    let view = renderView(props);
    expect(view.html).toContain(
      '<span class="session-configuration-label">Entry Size</span><strong>$15.00</strong>',
    );
    view.inputs[1].props.onChange!({ target: { value: '500' } });
    resolveEntryProjection(props, 25);
    view = renderView(props);
    expect(view.html).toContain('$25.00');
    expect(view.html).toContain(
      '<span class="session-configuration-label">Entry Size</span><strong>$15.00</strong>',
    );
    expect(props.settings!.values.targetMakerVolumeUsd).toBe(300);
    expect(view.html).not.toContain('AUTO POSITION LIMIT');
    expect(view.button('SAVE CHANGES').props.disabled).toBe(false);
    resolveEntryProjection(props, null);
    view = renderView(props);
    expect(view.html).toContain('UNAVAILABLE');
    expect(view.button('SAVE CHANGES').props.disabled).toBe(true);
  });
  it('retains active session configuration after draft edits', () => {
    const props = createProps();
    props.session = {
      activeSession: {
        configRevision: 1,
        configSnapshot: { ...props.settings!.values, capitalToUseUsd: 3 },
        sessionId: 'test',
        startedAt: 1,
        endedAt: null,
        status: 'RUNNING',
      },
      state: 'RUNNING',
      ownerState: 'OWNED',
    } as Props['session'];
    let view = renderView(props);
    view.inputs[0].props.onChange!({ target: { value: '9' } });
    view = renderView(props);
    expect(view.html).toContain(
      '<span class="session-configuration-label">Capital</span><strong>$3.00</strong>',
    );
    expect(props.session!.activeSession!.configSnapshot.capitalToUseUsd).toBe(3);
  });
  it('shows the current saved-capital blocker only inside a keyboard-focusable tooltip', () => {
    const props = createProps();
    props.availableMarginUsd = 4;
    const view = renderView(props);
    expect(view.html).toContain(
      'tabindex="0" aria-label="Start session unavailable" aria-describedby="settings-start-blocker"',
    );
    expect(view.html).toContain(
      '<span role="tooltip" id="settings-start-blocker">Saved capital exceeds available margin</span>',
    );
    expect(view.html).not.toContain('SAVED CAPITAL EXCEEDS AVAILABLE MARGIN');
    expect(view.html).not.toContain('<p role="status">');
    expect(view.html).toMatch(/<button[^>]*disabled=""[^>]*>START SESSION<\/button>/);
    props.availableMarginUsd = 5.44;
    const ready = renderView(props);
    expect(ready.action.props.startAllowed).toBe(true);
    expect(ready.html).not.toContain('role="tooltip" id="settings-start-blocker"');
    expect(ready.html).not.toContain('session-start-tooltip');
  });
  it('keeps the disabled button native and its focus wrapper non-activating', () => {
    const start = vi.fn();
    const tree = renderSessionActionButtonV1({
      sessionStatus: 'IDLE',
      owned: false,
      startPhase: 'IDLE',
      startAllowed: false,
      startBlockReason: 'Account not ready',
      ending: false,
      onStart: start,
      onEnd: vi.fn(),
    });
    const elements = getElements(tree);
    expect(tree.props).toMatchObject({ tabIndex: 0, 'aria-describedby': 'settings-start-blocker' });
    expect(tree.props).not.toHaveProperty('onClick');
    expect(tree.props).not.toHaveProperty('onKeyDown');
    expect(elements.find((item) => item.type === 'button')!.props.disabled).toBe(true);
    expect(start).not.toHaveBeenCalled();
  });
  it('uses the actual readiness blocker rather than a capital-specific tooltip', () => {
    const props = createProps();
    props.startBlocked = true;
    props.startBlockReason = 'Reconcile the pending execution outcome before starting.';
    const view = renderView(props);
    expect(view.html).toContain(
      '<span role="tooltip" id="settings-start-blocker">Reconcile the pending execution outcome before starting.</span>',
    );
    expect(view.html).not.toContain('Saved capital exceeds available margin');
    props.startBlocked = false;
    expect(renderView(props).html).not.toContain('settings-start-blocker');
  });
  it('rejects malformed authoritative configuration before publishing it', () => {
    expect(() => parseSavedSettingsV1({ revision: 3, values: {} })).toThrow();
    const saved = createProps().settings!;
    expect(() =>
      parseSavedSettingsV1({ ...saved, values: { ...saved.values, maxLossUsd: 6 } }),
    ).toThrow();
    expect(parseSavedSettingsV1(saved)).toEqual(saved);
  });
  it('ignores older/replayed reads after save, and initializes from authoritative reads on reload', () => {
    const saved = { revision: 3, values: { capital: 4 } };
    expect(selectSavedSettingsV1(saved, { revision: 2, values: { capital: 5 } })).toBe(saved);
    expect(selectSavedSettingsV1(saved, { revision: 3, values: { capital: 9 } })).toBe(saved);
    expect(selectSavedSettingsV1(null, saved)).toBe(saved);
    expect(selectSavedSettingsV1(saved, { revision: 4, values: { capital: 2 } })!.revision).toBe(4);
  });
});

it('scopes Session Configuration uppercase to its eight labels and preserves values', () => {
  const { html } = renderView(createProps());
  const labels = [
    ...html.matchAll(/<span class="session-configuration-label">([^<]+)<\/span>/g),
  ].map((match) => match[1]);
  expect(labels).toEqual([
    'Account Equity',
    'Available Margin',
    'Margin Used',
    'Capital',
    'Max Loss',
    'Volume',
    'Quote Size',
    'Entry Size',
  ]);
  expect(html).toContain('<strong>DYNAMIC</strong>');
});
