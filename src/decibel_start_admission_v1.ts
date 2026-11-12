import type { decibel_runtime_supervisor_v1 } from './decibel_runtime_supervisor_v1.js';

/** One explicit request owns this bounded read/validate workflow, never execution. */
export async function runDecibelAuthenticatedStartAdmissionV1<T>(
  input: Readonly<{
    Supervisor: decibel_runtime_supervisor_v1;
    refresh: () => Promise<T>;
    validate: (snapshot: T) => Promise<void>;
    timeoutMs: number;
    getNow?: () => number;
    getObservedAt?: (snapshot: T) => number;
  }>,
): Promise<void> {
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0)
    throw new Error('SESSION_START_ADMISSION_TIMEOUT_INVALID');
  const getNow = input.getNow ?? Date.now;
  const deadline = getNow() + input.timeoutMs;
  let settled = false;
  const assertPending = () => {
    if (settled || getNow() >= deadline) throw new Error('SESSION_START_ADMISSION_TIMEOUT');
  };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      settled = true;
      reject(new Error('SESSION_START_ADMISSION_TIMEOUT'));
    }, input.timeoutMs);
  });
  const admit = async () => {
    // A successful shared refresh may have aged during local publication work.
    // Only freshness loss permits another read; venue/validation errors reject.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assertPending();
      const snapshot = await input.refresh();
      assertPending();
      const evidence = input.Supervisor.getAuthenticatedEvidenceDiagnostics(getNow());
      const observedAt = input.getObservedAt?.(snapshot) ?? evidence.observedAt;
      const isFresh = () =>
        observedAt !== null &&
        evidence.maximumAgeMs !== null &&
        observedAt <= getNow() &&
        getNow() - observedAt <= evidence.maximumAgeMs &&
        input.Supervisor.isAuthenticatedStateReady(getNow());
      if (!isFresh()) continue;
      await input.validate(snapshot);
      assertPending();
      if (!isFresh()) continue;
      input.Supervisor.assertSessionStartReady(getNow());
      return;
    }
    input.Supervisor.assertSessionStartReady(getNow());
    throw new Error('PRODUCTION_AUTHENTICATED_STATE_STALE');
  };
  try {
    await Promise.race([admit(), expired]);
  } finally {
    settled = true;
    clearTimeout(timeout);
  }
}
