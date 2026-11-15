import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  DECIBEL_GOT_SETTLED_CANCEL_MESSAGE_V1,
  installDecibelProcessErrorPolicyV1,
  isDecibelGotNetworkErrorV1,
  isDecibelGotSettledCancelErrorV1,
} from '../src/decibel_process_error_policy_v1.js';

// The stack recorded when the bot exited on 2026-11-14.
const gotError = () => {
  const error = new Error(DECIBEL_GOT_SETTLED_CANCEL_MESSAGE_V1);
  error.stack = [
    `Error: ${DECIBEL_GOT_SETTLED_CANCEL_MESSAGE_V1}`,
    String.raw`    at onCancel (D:\study\Decibel_BTC_Bot\node_modules\p-cancelable\index.js:48:12)`,
    String.raw`    at makeRequest (D:\study\Decibel_BTC_Bot\node_modules\got\dist\source\as-promise\index.js:38:13)`,
    String.raw`    at Timeout.retry (D:\study\Decibel_BTC_Bot\node_modules\got\dist\source\core\index.js:1278:30)`,
  ].join('\n');
  return error;
};

const fakeProcess = () => {
  const emitter = new EventEmitter();
  const exit = vi.fn();
  return {
    emitter,
    exit,
    target: {
      on: (event: 'uncaughtException', listener: (error: Error, origin: string) => void) =>
        emitter.on(event, listener),
      exit: exit as unknown as (code: number) => never,
    },
  };
};

describe('process error policy v1', () => {
  it('recognises only the got settled-cancel error from got and p-cancelable', () => {
    expect(isDecibelGotSettledCancelErrorV1(gotError())).toBe(true);
    const sameMessageElsewhere = new Error(DECIBEL_GOT_SETTLED_CANCEL_MESSAGE_V1);
    sameMessageElsewhere.stack = `Error: x\n    at somewhere (D:/study/Decibel_BTC_Bot/src/x.ts:1:1)`;
    expect(isDecibelGotSettledCancelErrorV1(sameMessageElsewhere)).toBe(false);
    expect(isDecibelGotSettledCancelErrorV1(new Error('fetch failed'))).toBe(false);
    expect(isDecibelGotSettledCancelErrorV1('text')).toBe(false);
  });

  it('keeps running through that error and exits with code 1 on any other', () => {
    const { emitter, exit, target } = fakeProcess();
    const log = vi.fn();
    const contained = vi.fn();
    installDecibelProcessErrorPolicyV1(target, log, contained);
    emitter.emit('uncaughtException', gotError(), 'uncaughtException');
    expect(exit).not.toHaveBeenCalled();
    expect(contained).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toContain(
      'DECIBEL_PRODUCTION_CONTAINED_EXCEPTION=GOT_SETTLED_CANCEL',
    );
    emitter.emit('uncaughtException', new TypeError('boom'), 'uncaughtException');
    expect(exit).toHaveBeenCalledWith(1);
    expect(contained).toHaveBeenCalledTimes(1);
  });
});

// The stack recorded when the bot exited on 2026-11-15 11:57 UTC after a network drop.
const gotNetworkError = (code = 'ECONNRESET') => {
  const error = Object.assign(new Error(`read ${code}`), { code });
  error.name = 'RequestError';
  error.stack = [
    `RequestError: read ${code}`,
    String.raw`    at ClientRequest.<anonymous> (D:\study\Decibel_BTC_Bot\node_modules\got\dist\source\core\index.js:970:111)`,
    String.raw`    at ClientRequest.flushHeaders (D:\study\Decibel_BTC_Bot\node_modules\http2-wrapper\source\client-request.js:363:10)`,
  ].join('\n');
  return error;
};

describe('process error policy v1: got network errors', () => {
  it('recognises only network RequestErrors raised from got', () => {
    expect(isDecibelGotNetworkErrorV1(gotNetworkError())).toBe(true);
    expect(isDecibelGotNetworkErrorV1(gotNetworkError('EAI_AGAIN'))).toBe(true);
    expect(isDecibelGotNetworkErrorV1(gotNetworkError('ERR_NON_2XX_3XX_RESPONSE'))).toBe(false);
    const elsewhere = gotNetworkError();
    elsewhere.stack =
      'RequestError: read ECONNRESET\n    at x (D:/study/Decibel_BTC_Bot/src/x.ts:1:1)';
    expect(isDecibelGotNetworkErrorV1(elsewhere)).toBe(false);
    expect(
      isDecibelGotNetworkErrorV1(
        Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
      ),
    ).toBe(false);
  });

  it('keeps running through a got network error', () => {
    const { emitter, exit, target } = fakeProcess();
    const log = vi.fn();
    const contained = vi.fn();
    installDecibelProcessErrorPolicyV1(target, log, contained);
    emitter.emit('uncaughtException', gotNetworkError(), 'uncaughtException');
    expect(exit).not.toHaveBeenCalled();
    expect(contained).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toContain(
      'GOT_NETWORK_ERROR ORIGIN=uncaughtException CODE=ECONNRESET',
    );
  });
});
