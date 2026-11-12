import { formatSessionStartResponseV1 } from './presentation';

export type session_start_confirmation_v1 = Readonly<{
  ownerState: string;
  recoveryBlocker?: string | null;
  takeover?: { state: string };
  activeSession: { sessionId: string; status: string } | null;
  lastStartAttempt?: { outcome: string; blocker: string | null; requestedAt: number } | null;
}>;
export type session_start_request_state_v1 = Readonly<{
  phase:
    'IDLE' | 'CHECKING_ACCOUNT' | 'STARTING_SESSION' | 'CONFIRMING' | 'SESSION_ACTIVE' | 'FAILED';
  error: string | null;
  notice: string | null;
}>;

/** One user request at a time. Polling can confirm ownership, never initiate Start. */
export class session_start_request_v1 {
  private State: session_start_request_state_v1 = { phase: 'IDLE', error: null, notice: null };
  private Pending: Promise<void> | null = null;
  private LastAttemptAt = -1;
  private AttemptBeforeRequest = -1;

  constructor(
    private readonly Transport: {
      sendStart(revision: number): Promise<{ ok: boolean; body: unknown }>;
      readSession(): Promise<session_start_confirmation_v1>;
    },
    private readonly publish: (state: session_start_request_state_v1) => void,
  ) {}

  getState(): session_start_request_state_v1 {
    return this.State;
  }
  private setState(
    phase: session_start_request_state_v1['phase'],
    error: string | null = null,
  ): void {
    this.State = Object.freeze({
      phase,
      error: phase === 'FAILED' ? error : null,
      notice: phase === 'FAILED' ? null : error,
    });
    this.publish(this.State);
  }

  observeSession(session: session_start_confirmation_v1 | null): void {
    if (!session) return;
    this.LastAttemptAt = Math.max(this.LastAttemptAt, session.lastStartAttempt?.requestedAt ?? -1);
    if (
      session.ownerState === 'OWNED' &&
      session.activeSession?.status === 'RUNNING' &&
      session.takeover?.state !== 'PAUSED'
    ) {
      this.setState('SESSION_ACTIVE');
    } else if (session.takeover?.state === 'PAUSED') {
      this.setState('IDLE');
    } else if (session.activeSession?.status === 'STOPPING') {
      this.setState('IDLE');
    } else if (
      this.State.phase === 'SESSION_ACTIVE' &&
      session.activeSession !== null &&
      session.ownerState !== 'OWNED'
    ) {
      this.setState('FAILED', session.recoveryBlocker ?? 'SESSION_RUNTIME_OWNER_NOT_EXCLUSIVE');
    } else if (session.activeSession?.status === 'STARTING' && this.isBusy()) {
      this.setState('STARTING_SESSION');
    } else if (
      this.State.phase === 'CONFIRMING' &&
      session.lastStartAttempt?.outcome === 'REJECTED' &&
      session.lastStartAttempt.requestedAt > this.AttemptBeforeRequest
    ) {
      this.setState(
        'FAILED',
        `SESSION START REJECTED: ${session.lastStartAttempt.blocker ?? 'SESSION_START_FAILED'}`,
      );
    } else if (this.State.phase === 'SESSION_ACTIVE' && session.activeSession === null) {
      this.setState('IDLE');
    } else if (
      this.State.phase === 'CONFIRMING' &&
      session.activeSession === null &&
      session.lastStartAttempt?.outcome === 'ADMITTED' &&
      session.lastStartAttempt.requestedAt > this.AttemptBeforeRequest
    ) {
      this.setState('IDLE');
    }
  }

  isBusy(): boolean {
    return ['CHECKING_ACCOUNT', 'STARTING_SESSION', 'CONFIRMING'].includes(this.State.phase);
  }

  start(revision: number): Promise<void> {
    if (this.Pending) return this.Pending;
    if (this.isBusy() || this.State.phase === 'SESSION_ACTIVE') return Promise.resolve();
    this.AttemptBeforeRequest = this.LastAttemptAt;
    this.setState('CHECKING_ACCOUNT');
    const operation = this.runStart(revision);
    this.Pending = operation;
    void operation.finally(() => {
      if (this.Pending === operation) this.Pending = null;
    });
    return operation;
  }

  private async runStart(revision: number): Promise<void> {
    try {
      const response = await this.Transport.sendStart(revision);
      if (!response.ok) {
        // A delayed response must not overwrite a newer authoritative poll.
        try {
          this.observeSession(await this.Transport.readSession());
          if (this.State.phase === 'SESSION_ACTIVE') return;
        } catch {
          if (this.State.phase === 'SESSION_ACTIVE') return;
        }
        this.setState('FAILED', formatSessionStartResponseV1(false, response.body));
        return;
      }
      this.setState('STARTING_SESSION');
      const session = await this.Transport.readSession();
      this.observeSession(session);
      if (this.State.phase !== 'SESSION_ACTIVE') {
        const body =
          typeof response.body === 'object' && response.body !== null
            ? (response.body as Record<string, unknown>)
            : {};
        if (body.status === 'ENDED' || body.status === 'STOPPING') this.setState('IDLE');
        else
          this.setState(
            'CONFIRMING',
            'Start is not yet confirmed. Checking session ownership; no repeat request will be sent.',
          );
      }
    } catch {
      this.setState(
        'CONFIRMING',
        'Start outcome is unknown. Checking session ownership; no repeat request will be sent.',
      );
      try {
        this.observeSession(await this.Transport.readSession());
      } catch {
        /* Passive session polling continues confirmation. */
      }
    }
  }
}

export function getSessionStartButtonLabelV1(
  phase: session_start_request_state_v1['phase'],
): string {
  if (phase === 'CHECKING_ACCOUNT') return 'CHECKING ACCOUNT…';
  if (phase === 'STARTING_SESSION' || phase === 'CONFIRMING') return 'STARTING SESSION…';
  if (phase === 'SESSION_ACTIVE') return 'SESSION ACTIVE';
  return 'START SESSION';
}
