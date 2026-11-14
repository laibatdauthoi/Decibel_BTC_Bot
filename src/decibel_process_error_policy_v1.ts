/**
 * Process-level policy for uncaught exceptions (2026-11-14, operator approved).
 *
 * The Decibel SDK sends its Aptos requests through `got` 11 (via @aptos-labs/aptos-client).
 * When the network drops while a request is retrying, got's retry timer calls
 * `onCancel` on a promise that already settled and p-cancelable throws from that timer.
 * Nothing can catch it, so Node exited the bot (twice on 2026-11-14, right after DNS
 * failures). The request it belongs to has already settled, so that one error is logged
 * and the process keeps running. Every other uncaught exception still exits with code 1.
 */
export const DECIBEL_GOT_SETTLED_CANCEL_MESSAGE_V1 =
  'The `onCancel` handler was attached after the promise settled.';

export function isDecibelGotSettledCancelErrorV1(error: unknown): boolean {
  if (!(error instanceof Error) || error.message !== DECIBEL_GOT_SETTLED_CANCEL_MESSAGE_V1)
    return false;
  const stack = (error.stack ?? '').replace(/\\/g, '/');
  return stack.includes('/p-cancelable/') && stack.includes('/got/');
}

type process_like_v1 = Readonly<{
  on(event: 'uncaughtException', listener: (error: Error, origin: string) => void): unknown;
  exit(code: number): never;
}>;

export function installDecibelProcessErrorPolicyV1(
  target: process_like_v1,
  log: (line: string) => void,
  recordContained: (error: Error) => void = () => undefined,
): void {
  target.on('uncaughtException', (error, origin) => {
    if (isDecibelGotSettledCancelErrorV1(error)) {
      log(
        `DECIBEL_PRODUCTION_CONTAINED_EXCEPTION=GOT_SETTLED_CANCEL ORIGIN=${origin} DETAIL=${error.message}`,
      );
      recordContained(error);
      return;
    }
    // Same outcome as Node's default for an uncaught exception.
    log(error.stack ?? `${error.name}: ${error.message}`);
    target.exit(1);
  });
}
