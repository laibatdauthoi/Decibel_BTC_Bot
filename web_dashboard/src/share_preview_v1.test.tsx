import { type ReactNode, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copySessionPngV1,
  startSessionShareV1,
  SharePreview,
  decodeSessionPngV1,
  type share_preview_request_v1,
} from './share_preview_v1';
import { createSessionSharePngV1, downloadSessionSharePngV1 } from './overview_share_v1';

const State = vi.hoisted(() => ({
  values: [] as unknown[],
  setters: [] as ReturnType<typeof vi.fn>[],
  effects: [] as (() => void | (() => void))[],
}));
vi.mock('react', async (readOriginal) => {
  const original = await readOriginal<typeof import('react')>();
  return {
    ...original,
    useEffect: (effect: () => void | (() => void)) => {
      State.effects.push(effect);
    },
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => {
      const setter = vi.fn();
      State.setters.push(setter);
      return [State.values.length ? State.values.shift() : initial, setter];
    },
  };
});
vi.mock('./overview_share_v1', async (readOriginal) => ({
  ...(await readOriginal<typeof import('./overview_share_v1')>()),
  createSessionSharePngV1: vi.fn(),
  downloadSessionSharePngV1: vi.fn(),
}));

const data = {
  sessionId: 'chosen',
  status: 'ENDED',
  action: 'Historical Session',
  progress: '10%',
  elapsed: '00:01:00',
  capital: '$8',
  pnl: '-$1',
  maxLoss: '$2',
  target: '$100',
  volume: '$10',
  observedAt: 1000,
};
const blob = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
function createRequest(): share_preview_request_v1 {
  return { id: 1, data, png: Promise.resolve(blob), rows: [] };
}
function findButtons(
  node: ReactNode,
): ReactElement<{ children?: ReactNode; onClick: () => void }>[] {
  if (Array.isArray(node)) return node.flatMap(findButtons);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode; onClick: () => void }>;
  return [...(element.type === 'button' ? [element] : []), ...findButtons(element.props.children)];
}
function installClipboard(write = vi.fn(() => Promise.resolve())) {
  const created: Record<string, Promise<Blob>>[] = [];
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { clipboard: { write } });
  vi.stubGlobal(
    'ClipboardItem',
    class clipboard_item {
      constructor(input: Record<string, Promise<Blob>>) {
        created.push(input);
      }
    },
  );
  return { created, write };
}
function installImage(fail = false) {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:decoded-png');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.stubGlobal(
    'Image',
    class preview_image {
      src = '';
      naturalWidth = 1200;
      naturalHeight = 900;
      decode() {
        return fail ? Promise.reject(new Error('CSP_OR_DECODE_ERROR')) : Promise.resolve();
      }
    },
  );
  return { create, revoke };
}

describe('Share preview and explicit PNG copy (simulated browser APIs)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    State.values = [];
    State.setters = [];
    State.effects = [];
  });
  it('Share creates one PNG and opens an uncopied preview without touching the clipboard', () => {
    const clipboard = installClipboard();
    vi.mocked(createSessionSharePngV1).mockResolvedValue(blob);
    const request = startSessionShareV1(data);
    expect(clipboard.write).not.toHaveBeenCalled();
    expect(createSessionSharePngV1).toHaveBeenCalledTimes(1);
    const html = renderToStaticMarkup(SharePreview({ request, close: () => undefined }));
    expect(html).toContain('LOADING');
    expect(html).toContain('COPY IMAGE');
    expect(html).not.toContain('COPIED');
    expect(startSessionShareV1({ ...data, sessionId: 'new-session' }).id).not.toBe(request.id);
  });
  it('Copy alone writes the exact PNG, and success waits for the browser confirmation', async () => {
    let confirm: () => void = () => undefined;
    const clipboard = installClipboard(
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            confirm = resolve;
          }),
      ),
    );
    State.values = [{ blob, url: 'blob:decoded-png' }, 'IDLE', false, 0];
    const tree = SharePreview({ request: createRequest(), close: () => undefined });
    const buttons = findButtons(tree);
    buttons.find((button) => button.props.children === 'DOWNLOAD PNG')?.props.onClick();
    expect(downloadSessionSharePngV1).toHaveBeenCalledWith(blob, 'chosen');
    expect(State.setters[1]).not.toHaveBeenCalled();
    expect(clipboard.write).not.toHaveBeenCalled();
    buttons.find((button) => button.props.children === 'COPY IMAGE')?.props.onClick();
    expect(State.setters[1]).toHaveBeenCalledWith('COPYING');
    expect(await clipboard.created[0]['image/png']).toBe(blob);
    expect(State.setters[1]).not.toHaveBeenCalledWith('COPIED');
    confirm();
    await vi.waitFor(() => expect(State.setters[1]).toHaveBeenCalledWith('COPIED'));
  });
  it('shows success on the button, a retryable error on denial, and starts every new modal uncopied', async () => {
    State.values = [{ blob, url: 'blob:decoded-png' }, 'COPIED', false, 0];
    const copied = renderToStaticMarkup(
      SharePreview({ request: createRequest(), close: () => undefined }),
    );
    expect(copied).toContain('share-copy-success');
    expect(copied).toContain('COPIED');
    State.values = [{ blob, url: 'blob:decoded-png' }, 'COPY_FAILED', false, 0];
    const failed = renderToStaticMarkup(
      SharePreview({ request: createRequest(), close: () => undefined }),
    );
    expect(failed).toContain('COPY FAILED');
    expect(failed).not.toContain('share-copy-success');
    State.values = [];
    expect(
      renderToStaticMarkup(SharePreview({ request: createRequest(), close: () => undefined })),
    ).not.toContain('COPIED');
    installClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    expect(await copySessionPngV1(Promise.resolve(blob))).toBe('COPY_FAILED');
  });
  it('validates the PNG signature and decodes before exposing a usable URL', async () => {
    const api = installImage();
    const image = await decodeSessionPngV1(blob);
    expect(image).toEqual({ blob, url: 'blob:decoded-png' });
    expect(api.revoke).not.toHaveBeenCalled();
    await expect(decodeSessionPngV1(new Blob(['bad'], { type: 'image/png' }))).rejects.toThrow(
      'PNG_INVALID',
    );
    expect(api.create).toHaveBeenCalledTimes(1);
  });
  it('releases failed URLs and shows a retry UI instead of a broken image', async () => {
    const api = installImage(true);
    await expect(decodeSessionPngV1(blob)).rejects.toThrow('CSP_OR_DECODE_ERROR');
    expect(api.revoke).toHaveBeenCalledWith('blob:decoded-png');
    State.values = [null, 'IDLE', true, 0];
    const html = renderToStaticMarkup(
      SharePreview({ request: createRequest(), close: () => undefined }),
    );
    expect(html).toContain('RETRY');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('COPIED');
  });
  it('keeps the decoded URL alive through rendering and revokes it only on effect disposal', async () => {
    const api = installImage();
    SharePreview({ request: createRequest(), close: () => undefined });
    const cleanup = State.effects[0]();
    await vi.waitFor(() =>
      expect(State.setters[0]).toHaveBeenCalledWith({ blob, url: 'blob:decoded-png' }),
    );
    expect(api.revoke).not.toHaveBeenCalled();
    if (typeof cleanup === 'function') cleanup();
    expect(api.revoke).toHaveBeenCalledWith('blob:decoded-png');
  });
  it('does not publish stale decoded results after the old modal is disposed', async () => {
    installImage();
    SharePreview({ request: createRequest(), close: () => undefined });
    const cleanup = State.effects[0]();
    if (typeof cleanup === 'function') cleanup();
    await Promise.resolve();
    await Promise.resolve();
    expect(State.setters[0]).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: 'blob:decoded-png' }),
    );
  });
  it('keeps unsupported clipboard contexts separate from success', async () => {
    const clipboard = installClipboard();
    vi.stubGlobal('isSecureContext', false);
    expect(await copySessionPngV1(Promise.resolve(blob))).toBe('UNSUPPORTED');
    expect(clipboard.write).not.toHaveBeenCalled();
  });
  it('resets success after 3000ms from clipboard confirmation, while Download leaves it alone', async () => {
    let confirm: () => void = () => {};
    installClipboard(
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            confirm = resolve;
          }),
      ),
    );
    State.values = [{ blob, url: 'blob:decoded-png' }, 'IDLE', false, 0];
    const buttons = findButtons(SharePreview({ request: createRequest(), close: () => undefined }));
    buttons.find((button) => button.props.children === 'COPY IMAGE')!.props.onClick();
    await vi.advanceTimersByTimeAsync(5000);
    expect(State.setters[1]).toHaveBeenLastCalledWith('COPYING');
    confirm();
    await Promise.resolve();
    await Promise.resolve();
    expect(State.setters[1]).toHaveBeenLastCalledWith('COPIED');
    await vi.advanceTimersByTimeAsync(2000);
    buttons.find((button) => button.props.children === 'DOWNLOAD PNG')!.props.onClick();
    expect(State.setters[1]).toHaveBeenLastCalledWith('COPIED');
    await vi.advanceTimersByTimeAsync(999);
    expect(State.setters[1]).toHaveBeenLastCalledWith('COPIED');
    await vi.advanceTimersByTimeAsync(1);
    expect(State.setters[1]).toHaveBeenLastCalledWith('IDLE');
  });
  it('cancels the previous success timer before a new copy and allows copying after reset', async () => {
    const confirmations: (() => void)[] = [];
    const clipboard = installClipboard(
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            confirmations.push(resolve);
          }),
      ),
    );
    State.values = [{ blob, url: 'blob:decoded-png' }, 'IDLE', false, 0];
    const button = findButtons(
      SharePreview({ request: createRequest(), close: () => undefined }),
    ).find((button) => button.props.children === 'COPY IMAGE')!;
    button.props.onClick();
    confirmations[0]();
    await vi.advanceTimersByTimeAsync(2000);
    button.props.onClick();
    await vi.advanceTimersByTimeAsync(1500);
    expect(State.setters[1]).toHaveBeenLastCalledWith('COPYING');
    confirmations[1]();
    await vi.advanceTimersByTimeAsync(2999);
    expect(State.setters[1]).toHaveBeenLastCalledWith('COPIED');
    await vi.advanceTimersByTimeAsync(1);
    expect(State.setters[1]).toHaveBeenLastCalledWith('IDLE');
    button.props.onClick();
    expect(clipboard.write).toHaveBeenCalledTimes(3);
  });
  it('cleans up the success timer on modal disposal', async () => {
    installImage();
    const confirmations: (() => void)[] = [];
    installClipboard(
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            confirmations.push(resolve);
          }),
      ),
    );
    State.values = [{ blob, url: 'blob:decoded-png' }, 'IDLE', false, 0];
    const button = findButtons(
      SharePreview({ request: createRequest(), close: () => undefined }),
    ).find((button) => button.props.children === 'COPY IMAGE')!;
    const cleanup = State.effects[0]();
    await vi.waitFor(() =>
      expect(State.setters[0]).toHaveBeenCalledWith({ blob, url: 'blob:decoded-png' }),
    );
    button.props.onClick();
    confirmations[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    if (typeof cleanup === 'function') cleanup();
    expect(vi.getTimerCount()).toBe(0);
    State.setters[1].mockClear();
    await vi.advanceTimersByTimeAsync(3000);
    expect(State.setters[1]).not.toHaveBeenCalled();
  });
  it('ignores clipboard success after disposal and starts the next session uncopied', async () => {
    installImage();
    let confirm: () => void = () => {};
    installClipboard(
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            confirm = resolve;
          }),
      ),
    );
    State.values = [{ blob, url: 'blob:decoded-png' }, 'IDLE', false, 0];
    const buttons = findButtons(SharePreview({ request: createRequest(), close: () => undefined }));
    const cleanup = State.effects[0]();
    await vi.waitFor(() =>
      expect(State.setters[0]).toHaveBeenCalledWith({ blob, url: 'blob:decoded-png' }),
    );
    buttons.find((button) => button.props.children === 'COPY IMAGE')!.props.onClick();
    if (typeof cleanup === 'function') cleanup();
    State.setters[1].mockClear();
    confirm();
    await vi.advanceTimersByTimeAsync(3000);
    expect(State.setters[1]).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    State.values = [];
    const html = renderToStaticMarkup(
      SharePreview({
        request: { ...createRequest(), id: 2, data: { ...data, sessionId: 'another-session' } },
        close: () => undefined,
      }),
    );
    expect(html).toContain('COPY IMAGE');
    expect(html).not.toContain('COPIED');
    expect(html).not.toContain('share-copy-success');
  });
  it('does not schedule success feedback after a denied clipboard write', async () => {
    installClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    State.values = [{ blob, url: 'blob:decoded-png' }, 'IDLE', false, 0];
    findButtons(SharePreview({ request: createRequest(), close: () => undefined }))
      .find((button) => button.props.children === 'COPY IMAGE')!
      .props.onClick();
    await vi.advanceTimersByTimeAsync(0);
    expect(State.setters[1]).toHaveBeenLastCalledWith('COPY_FAILED');
    expect(vi.getTimerCount()).toBe(0);
  });
});
