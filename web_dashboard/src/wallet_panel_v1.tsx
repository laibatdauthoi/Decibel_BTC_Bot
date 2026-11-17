import { useCallback, useEffect, useRef, useState } from 'react';
import { findPetraWalletV1, shortAddressV1, type wallet_payload_v1 } from './petra_wallet_v1';

/** Mirrors decibel_wallet_status_v1 from src/decibel_wallet_routes_v1.ts. */
export type wallet_status_v1 = Readonly<{
  ownerAddress: string | null;
  subaccountAddress: string | null;
  signerMode: 'AGENT' | 'PRIVATE_KEY' | 'NONE';
  keystoreSecretConfigured: boolean;
  agent: Readonly<{ address: string; createdAt: number; aptBalanceOctas: number | null }> | null;
  delegation: Readonly<{
    status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING';
    expiresAtMs: number | null;
  }> | null;
  delegationError: string | null;
  delegationDays: number;
  payloads: Readonly<{
    delegate: wallet_payload_v1;
    revoke: wallet_payload_v1;
    gasTopUp: wallet_payload_v1;
  }> | null;
}>;

export function normalizeWalletAddressV1(address: string | null | undefined): string | null {
  const match = /^0x([0-9a-f]{1,64})$/i.exec(address?.trim() ?? '');
  return match ? `0x${match[1].toLowerCase().padStart(64, '0')}` : null;
}

/** Mirrors GET /api/wallet/subaccounts (src/decibel_wallet_routes_v1.ts). */
export type wallet_subaccounts_v1 = Readonly<{
  owner: string;
  whitelisted: boolean;
  inUse: string | null;
  subaccounts: readonly Readonly<{ address: string; label: string | null; isPrimary: boolean }>[];
}>;

const FRIENDLY_ERRORS_V1: Readonly<Record<string, string>> = {
  PETRA_NOT_INSTALLED: 'Petra is not installed in this browser.',
  WALLET_REQUEST_REJECTED: 'Request rejected in Petra.',
  CONNECTED_WALLET_IS_NOT_THE_SUBACCOUNT_OWNER: 'This wallet does not own the subaccount.',
  AGENT_KEYSTORE_SECRET_REQUIRED:
    'Add DECIBEL_KEYSTORE_SECRET (16+ characters) to .env and restart.',
  WALLET_NOT_WHITELISTED: 'This wallet is not allowed to use this bot.',
};

export function describeWalletErrorV1(code: string): string {
  return FRIENDLY_ERRORS_V1[code] ?? code;
}

/** Gas top-up is asked only when the bot key has less than 0.1 APT. */
const MINIMUM_AGENT_GAS_OCTAS_V1 = 10_000_000;

/**
 * Wallet control in the top bar: connect Petra, pick the subaccount, confirm. The bot key
 * (agent) and its gas stay behind the Confirm step.
 */
export const WalletMenu = () => {
  const [status, setStatus] = useState<wallet_status_v1 | null>(null);
  const [connected, setConnected] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<wallet_subaccounts_v1 | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const Root = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/wallet');
      if (response.ok) setStatus((await response.json()) as wallet_status_v1);
      const session = await fetch('/api/auth/session');
      if (session.ok) setSignedIn(((await session.json()) as { mode?: string }).mode === 'wallet');
    } catch {
      // The menu keeps its last state; the next refresh retries.
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!Root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const run = (action: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    void action()
      .then((done) => {
        if (done) setMessage(done);
        window.setTimeout(() => void refresh(), 4_000);
      })
      .catch((error: unknown) =>
        setMessage(
          describeWalletErrorV1(error instanceof Error ? error.message : 'WALLET_ACTION_FAILED'),
        ),
      )
      .finally(() => setBusy(false));
  };
  const connect = () =>
    run(async () => {
      const wallet = findPetraWalletV1();
      if (wallet === null) throw new Error('PETRA_NOT_INSTALLED');
      const address = normalizeWalletAddressV1((await wallet.connect()).address);
      if (address === null) throw new Error('WALLET_ADDRESS_INVALID');
      setConnected(address);
      setOpen(true);
      const response = await fetch(`/api/wallet/subaccounts?owner=${address}`);
      const body = (await response.json()) as wallet_subaccounts_v1 & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'SUBACCOUNTS_UNAVAILABLE');
      setAccounts(body);
      const inUse = body.subaccounts.find((row) => row.address === body.inUse);
      setSelected(inUse?.address ?? body.subaccounts[0]?.address ?? null);
    });
  const submit = async (payload: wallet_payload_v1 | undefined) => {
    if (!payload) throw new Error('WALLET_PAYLOAD_UNAVAILABLE');
    const wallet = findPetraWalletV1();
    if (wallet === null) throw new Error('PETRA_NOT_INSTALLED');
    return wallet.signAndSubmit(payload);
  };
  const confirm = () =>
    run(async () => {
      if (connected !== normalizeWalletAddressV1(status?.ownerAddress))
        throw new Error('CONNECTED_WALLET_IS_NOT_THE_SUBACCOUNT_OWNER');
      let current = status;
      if (current?.agent == null) {
        const response = await fetch('/api/wallet/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const body = (await response.json()) as wallet_status_v1 & { error?: string };
        if (!response.ok) throw new Error(body.error ?? 'AGENT_CREATE_FAILED');
        current = body;
        setStatus(body);
      }
      await submit(current.payloads?.delegate);
      if ((current.agent?.aptBalanceOctas ?? 0) < MINIMUM_AGENT_GAS_OCTAS_V1)
        await submit(current.payloads?.gasTopUp);
      return 'Confirmed. The bot can trade this subaccount.';
    });
  const choose = () =>
    run(async () => {
      const response = await fetch('/api/wallet/subaccount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: connected, subaccount: selected }),
      });
      const body = (await response.json()) as { status?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'SUBACCOUNT_SELECTION_FAILED');
      return 'Saved. Restart the bot to use this subaccount.';
    });

  const authorized =
    status?.delegation?.status === 'ACTIVE' || status?.delegation?.status === 'EXPIRING_SOON';
  const selectedInUse = selected !== null && selected === accounts?.inUse;
  const expiry =
    status?.delegation?.expiresAtMs == null
      ? null
      : new Date(status.delegation.expiresAtMs).toISOString().slice(0, 10);
  return (
    <div className="wallet-menu" ref={Root}>
      <button
        type="button"
        className={`wallet-control ${connected !== null && authorized ? 'authorized' : ''}`}
        aria-label="Wallet"
        aria-expanded={open}
        disabled={busy && connected === null}
        onClick={() => (connected === null ? connect() : setOpen((current) => !current))}
      >
        {connected === null ? (busy ? 'CONNECTING…' : 'CONNECT WALLET') : shortAddressV1(connected)}
      </button>
      {open && (
        <div className="wallet-dropdown" role="dialog" aria-label="Wallet">
          <div className="wallet-head">
            <strong title={connected ?? undefined}>{shortAddressV1(connected)}</strong>
            <button
              type="button"
              className="wallet-link"
              onClick={() => {
                setConnected(null);
                setAccounts(null);
                setSelected(null);
                setMessage(null);
                setOpen(false);
              }}
            >
              DISCONNECT
            </button>
          </div>
          {accounts !== null && !accounts.whitelisted ? (
            <p className="wallet-note">{describeWalletErrorV1('WALLET_NOT_WHITELISTED')}</p>
          ) : accounts !== null && accounts.subaccounts.length === 0 ? (
            <p className="wallet-note">No Decibel subaccount on this wallet.</p>
          ) : accounts !== null ? (
            <>
              <div className="wallet-subaccounts" role="radiogroup" aria-label="Subaccount">
                {accounts.subaccounts.map((row) => (
                  <label key={row.address} className={row.address === selected ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="wallet-subaccount"
                      checked={row.address === selected}
                      onChange={() => setSelected(row.address)}
                    />
                    <span>{row.label ?? (row.isPrimary ? 'Primary' : 'Subaccount')}</span>
                    <code title={row.address}>{shortAddressV1(row.address)}</code>
                    {row.address === accounts.inUse && <em>IN USE</em>}
                  </label>
                ))}
              </div>
              {selectedInUse && (
                <p className={`wallet-state ${authorized ? 'positive' : 'warning'}`}>
                  {authorized
                    ? `Bot authorized${expiry ? ` until ${expiry}` : ''}`
                    : 'Bot not authorized yet'}
                </p>
              )}
              <div className="wallet-actions">
                <button
                  type="button"
                  disabled={busy || selected === null}
                  onClick={selectedInUse ? confirm : choose}
                >
                  {busy
                    ? 'WAITING…'
                    : selectedInUse
                      ? authorized
                        ? 'RENEW'
                        : 'CONFIRM'
                      : 'USE THIS SUBACCOUNT'}
                </button>
                {selectedInUse && authorized && (
                  <button
                    type="button"
                    className="wallet-link"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await submit(status?.payloads?.revoke);
                        return 'Bot access revoked.';
                      })
                    }
                  >
                    REVOKE
                  </button>
                )}
              </div>
            </>
          ) : null}
          {signedIn && (
            <button
              type="button"
              className="wallet-link wallet-signout"
              onClick={() =>
                void fetch('/api/auth/logout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: '{}',
                }).then(() => window.location.reload())
              }
            >
              SIGN OUT
            </button>
          )}
          {message && <p className="wallet-note">{message}</p>}
        </div>
      )}
    </div>
  );
};
