import { useEffect, useState, type ReactNode } from 'react';
import { usePageVisibilityV1 } from './page_visibility_v1';
import { findPetraWalletV1 } from './petra_wallet_v1';

/** Mirrors GET /api/auth/session (src/decibel_dashboard_auth_v1.ts). */
export type auth_session_v1 = Readonly<{
  mode: 'off' | 'wallet';
  authenticated: boolean;
  address: string | null;
}>;

async function postJson(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const value = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(value.error ?? 'AUTH_REQUEST_FAILED');
  return value;
}

/** Signs in with Petra: challenge -> signMessage -> verify (sets the HttpOnly cookie). */
export async function signInWithPetraV1(): Promise<void> {
  const wallet = findPetraWalletV1();
  if (wallet === null) throw new Error('PETRA_NOT_INSTALLED');
  const account = await wallet.connect();
  const challenge = (await postJson('/api/auth/challenge', { address: account.address })) as {
    message: string;
    nonce: string;
  };
  const signed = await wallet.signMessage(challenge.message, challenge.nonce);
  await postJson('/api/auth/verify', {
    address: account.address,
    publicKey: account.publicKey,
    signature: signed.signature,
    fullMessage: signed.fullMessage,
  });
}

export const SignInScreen = (props: {
  error: string | null;
  onSignIn: () => void;
  busy: boolean;
}) => (
  <main className="auth-screen">
    <section className="auth-card" aria-label="Sign in">
      <h1>DECIBEL / MM V1</h1>
      <p>Sign in with the owner wallet of this bot.</p>
      <button type="button" disabled={props.busy} onClick={props.onSignIn}>
        {props.busy ? 'WAITING FOR PETRA…' : 'SIGN IN WITH PETRA'}
      </button>
      {props.error && <p className="auth-error">{props.error}</p>}
    </section>
  </main>
);

/** Renders the dashboard only when sign-in is off or the wallet session is valid. */
export const AuthGate = (props: { children: ReactNode }) => {
  const [session, setSession] = useState<auth_session_v1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () =>
    fetch('/api/auth/session')
      .then(async (response) => {
        if (!response.ok) throw new Error('AUTH_SESSION_UNAVAILABLE');
        setSession((await response.json()) as auth_session_v1);
      })
      // An older server without /api/auth/session has no sign-in.
      .catch(() => setSession({ mode: 'off', authenticated: true, address: null }));
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  usePageVisibilityV1({ onVisible: () => void refresh() });
  if (session === null) return null;
  if (session.mode === 'off' || session.authenticated) return <>{props.children}</>;
  return (
    <SignInScreen
      error={error}
      busy={busy}
      onSignIn={() => {
        setBusy(true);
        setError(null);
        void signInWithPetraV1()
          .then(refresh)
          .catch((cause: unknown) =>
            setError(cause instanceof Error ? cause.message : 'AUTH_FAILED'),
          )
          .finally(() => setBusy(false));
      }}
    />
  );
};
