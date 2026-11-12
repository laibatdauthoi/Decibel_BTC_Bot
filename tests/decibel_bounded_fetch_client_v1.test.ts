import { describe, expect, it, vi } from 'vitest';

import { createDecibelBoundedFetchClientV1 } from '../src/decibel_bounded_fetch_client_v1.js';

describe('bounded production fetch client', () => {
  it('uses one native-fetch request with no internal retry', async () => {
    const Fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ledger_version: '123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const Client = createDecibelBoundedFetchClientV1({ timeoutMs: 1_000, fetch: Fetch });

    await expect(
      Client.provider({
        method: 'GET',
        url: 'https://fullnode.invalid/v1',
        params: { ledger_version: 123n },
      }),
    ).resolves.toMatchObject({ status: 200, data: { ledger_version: '123' } });
    expect(Fetch).toHaveBeenCalledTimes(1);
    expect(Fetch.mock.calls[0]?.[0]).toBe('https://fullnode.invalid/v1?ledger_version=123');
    expect(Fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts a timed-out request and gives the next request a fresh signal', async () => {
    const signals: AbortSignal[] = [];
    const Fetch = vi.fn<typeof fetch>((_input, init) => {
      const signal = init?.signal;
      if (!(signal instanceof AbortSignal)) throw new Error('TEST_SIGNAL_REQUIRED');
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () =>
            reject(
              signal.reason instanceof Error
                ? signal.reason
                : new Error('DECIBEL_BOUNDED_FETCH_ABORTED'),
            ),
          { once: true },
        );
      });
    });
    const Client = createDecibelBoundedFetchClientV1({ timeoutMs: 10, fetch: Fetch });

    await expect(
      Client.provider({ method: 'GET', url: 'https://fullnode.invalid/v1' }),
    ).rejects.toThrow('DECIBEL_BOUNDED_FETCH_TIMEOUT');
    await expect(
      Client.provider({ method: 'GET', url: 'https://fullnode.invalid/v1' }),
    ).rejects.toThrow('DECIBEL_BOUNDED_FETCH_TIMEOUT');
    expect(Fetch).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(true);
    expect(signals[0]).not.toBe(signals[1]);
  });
});

it.each(['REQUEST', 'BODY'] as const)(
  'bounds an uncooperative %s and ignores its late result',
  async (stage) => {
    vi.useFakeTimers();
    try {
      let release!: (value: Response) => void;
      const late = new Promise<Response>((resolve) => {
        release = resolve;
      });
      const hangingBody = {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: () => new Promise<string>(() => undefined),
      } as Response;
      const Fetch = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(() => (stage === 'REQUEST' ? late : Promise.resolve(hangingBody)))
        .mockResolvedValueOnce(new Response('{"fresh":true}'));
      const Client = createDecibelBoundedFetchClientV1({ timeoutMs: 10, fetch: Fetch });
      const first = Client.provider({ method: 'GET', url: 'https://fullnode.invalid/v1' });
      const rejected = expect(first).rejects.toThrow('DECIBEL_BOUNDED_FETCH_TIMEOUT');
      await vi.advanceTimersByTimeAsync(10);
      await rejected;
      await expect(
        Client.provider({ method: 'GET', url: 'https://fullnode.invalid/v1' }),
      ).resolves.toMatchObject({ data: { fresh: true } });
      release(new Response('{"stale":true}'));
      await Promise.resolve();
      expect(Fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  },
);
