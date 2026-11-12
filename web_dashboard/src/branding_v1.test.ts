import { expect, it, vi } from 'vitest';
import { createSessionSharePngV1 } from './overview_share_v1';

it('waits for logo decode before drawing and fails closed on asset errors', async () => {
  let finishDecode: () => void = () => {};
  const decoding = new Promise<void>((resolve) => {
    finishDecode = resolve;
  });
  const drawImage = vi.fn();
  const drawAlphas: number[] = [];
  let savedAlpha = 1;
  const Context = {
    globalAlpha: 1,
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage,
    measureText: () => ({ width: 200 }),
    save: vi.fn(() => {
      savedAlpha = Context.globalAlpha;
    }),
    restore: vi.fn(() => {
      Context.globalAlpha = savedAlpha;
    }),
  };
  drawImage.mockImplementation(() => {
    drawAlphas.push(Context.globalAlpha);
  });
  const toBlob = vi.fn((callback: (blob: Blob) => void) => callback(new Blob(['png'])));
  let fail = false;
  class test_image {
    naturalWidth = 1080;
    naturalHeight = 1080;
    onload: (() => void) | null = null;
    set src(value: string) {
      expect(value).toBe('/branding/mm-logo.png');
      this.onload?.();
    }
    decode(): Promise<void> {
      return fail ? Promise.reject(new Error('invalid image')) : decoding;
    }
  }
  vi.stubGlobal('Image', test_image);
  vi.stubGlobal('document', {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({
      getContext: () => Context,
      toBlob,
    }),
  });
  const data = {
    sessionId: 'test',
    status: 'RUNNING',
    action: 'HOLD',
    progress: '30%',
    elapsed: '00:00:10',
    capital: '$8',
    pnl: '-$0.50',
    maxLoss: '$2',
    target: '$100',
    volume: '$30',
    observedAt: 20000,
  };
  try {
    const png = createSessionSharePngV1(data);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(drawImage).not.toHaveBeenCalled();
    expect(toBlob).not.toHaveBeenCalled();
    finishDecode();
    await png;
    expect(drawImage).toHaveBeenNthCalledWith(1, expect.any(test_image), 48, 12, 96, 96);
    const [, x, y, width, height] = drawImage.mock.calls[1] as [
      test_image,
      number,
      number,
      number,
      number,
    ];
    expect(width).toBeGreaterThan(200);
    const previousWidth = Math.min((1152 - 707) * 0.7, 640 * 0.52);
    expect(width / previousWidth).toBeCloseTo(1.5, 12);
    expect(height / previousWidth).toBeCloseTo(1.5, 12);
    expect(width).toBe(height);
    expect(x + width / 2).toBe((707 + 1152) / 2);
    expect(y + height / 2).toBe((120 + 760) / 2);
    expect(x).toBeGreaterThan(675);
    expect(y).toBeGreaterThan(120);
    expect(x + width).toBeLessThan(1200);
    expect(y + height).toBeLessThan(760);
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(drawAlphas).toEqual([1, 0.75]);
    expect(Context.save).toHaveBeenCalledOnce();
    expect(Context.restore).toHaveBeenCalledOnce();
    expect(Context.globalAlpha).toBe(1);
    expect(toBlob).toHaveBeenCalledOnce();
    fail = true;
    await expect(createSessionSharePngV1(data)).rejects.toThrow('SHARE_CARD_LOGO_UNAVAILABLE');
    expect(toBlob).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});
