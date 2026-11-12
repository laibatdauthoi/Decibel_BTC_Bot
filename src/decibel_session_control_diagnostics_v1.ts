export type decibel_session_start_attempt_v1 = Readonly<{
  transitionId?: string;
  outcome: 'REQUESTED' | 'ADMITTED' | 'REJECTED';
  requestedAt: number;
  completedAt: number | null;
  expectedSettingsRevision: number;
  sessionId: string | null;
  blocker: string | null;
}>;

/** Observational only: never starts, admits or resumes a trading session. */
export function deriveDecibelSessionControlDiagnosticsV1(
  input: Readonly<{
    sessionState: string | null;
    latestSessionStatus: string | null;
    latestSessionBlocker?: string | null;
    lastStartAttempt: decibel_session_start_attempt_v1 | null;
    executionLoopRunning: boolean;
    executionLoopHealthy?: boolean;
    executionCycles: number;
    executionBlocker: string | null;
  }>,
) {
  const loop = input.executionLoopRunning
    ? input.executionCycles > 0
      ? input.executionLoopHealthy === false
        ? 'STALLED'
        : 'RUNNING'
      : 'WAITING_FIRST_CYCLE'
    : 'NOT_SCHEDULED';
  const result = (
    state:
      | 'IDLE'
      | 'WAITING_FOR_USER_START'
      | 'START_BLOCKED'
      | 'STARTING'
      | 'ACTIVE'
      | 'ENDED'
      | 'STOPPING'
      | 'RECOVERY_BLOCKED',
    blocker: string | null,
    message: string,
  ) =>
    Object.freeze({
      state,
      blocker,
      message,
      loop,
      readinessBlocker: input.executionBlocker,
      lastStartRejection:
        input.lastStartAttempt?.outcome === 'REJECTED' &&
        input.sessionState !== 'RUNNING' &&
        input.sessionState !== 'STARTING'
          ? input.lastStartAttempt
          : null,
    });
  if (input.sessionState === null)
    return result(
      'IDLE',
      'SESSION_STATE_LOADING',
      'Loading session state. Web availability does not authorize trading.',
    );
  if (input.lastStartAttempt?.outcome === 'REQUESTED' && input.sessionState === 'RECOVERY_BLOCKED')
    return result(
      'STARTING',
      null,
      'Start Session requested; owned runtime preparation is pending.',
    );
  if (input.sessionState === 'IDLE' || input.sessionState === 'ENDED') {
    if (input.lastStartAttempt?.outcome === 'REQUESTED')
      return result('STARTING', null, 'Start Session requested; admission is pending.');
    if (input.lastStartAttempt?.outcome === 'REJECTED')
      return result(
        input.executionBlocker === null ? 'WAITING_FOR_USER_START' : 'START_BLOCKED',
        input.executionBlocker,
        input.executionBlocker === null
          ? 'Previous Start was rejected. Current readiness has no blocker; explicitly request Start again. Fresh venue admission is still required.'
          : 'Previous Start was rejected. Current readiness is blocked; no new trading loop was admitted.',
      );
    if (input.latestSessionStatus === 'BLOCKED')
      return result(
        'START_BLOCKED',
        input.latestSessionBlocker ?? 'SESSION_START_FAILED',
        'Previous session start failed. Resolve the blocker and explicitly request Start Session again.',
      );
    if (input.latestSessionStatus === 'ENDED' || input.sessionState === 'ENDED')
      return result(
        'ENDED',
        null,
        'Previous session ended. Use Settings → Start Session to request a new session; trading does not restart automatically.',
      );
    return result(
      'WAITING_FOR_USER_START',
      null,
      'No active session. Use Settings → Start Session. Web READY means the service is available, not that trading is active.',
    );
  }
  if (input.sessionState === 'RECOVERY_BLOCKED')
    return result(
      'RECOVERY_BLOCKED',
      input.executionBlocker,
      'Session ownership recovery is blocked.',
    );
  if (input.sessionState === 'STOPPING')
    return result(
      'STOPPING',
      input.executionBlocker,
      'Session end is waiting for authoritative reconciliation.',
    );
  if (input.sessionState === 'BLOCKED')
    return result(
      'START_BLOCKED',
      input.lastStartAttempt?.blocker ?? input.executionBlocker,
      'Session start is blocked.',
    );
  if (input.sessionState === 'STARTING')
    return result(
      'STARTING',
      input.executionBlocker,
      'Session admission is preparing the owned runtime.',
    );
  if (!input.executionLoopRunning)
    return result(
      'START_BLOCKED',
      'SESSION_CONTROL_LOOP_NOT_SCHEDULED',
      'An active session exists but its control loop is not scheduled.',
    );
  if (input.executionCycles === 0)
    return result(
      'STARTING',
      input.executionBlocker,
      'Owned runtime scheduled; waiting for its first control cycle.',
    );
  if (input.executionLoopHealthy === false)
    return result(
      'START_BLOCKED',
      input.executionBlocker ?? 'CONTROL_LOOP_STALLED',
      'An owned session exists but its control loop is stalled.',
    );
  return result(
    'ACTIVE',
    input.executionBlocker,
    'Session control loop is running. Individual actions still require fresh evidence and risk authorization.',
  );
}
