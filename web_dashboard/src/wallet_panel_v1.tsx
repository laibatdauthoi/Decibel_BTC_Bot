import { useCallback, useEffect, useRef, useState } from 'react';
import { shortAddressV1, waitForPetraWalletV1, type wallet_payload_v1 } from './petra_wallet_v1';

type authorization_v1 = Readonly<{
  status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING';
  expiresAtMs: number | null;
}>;

/** Mirrors GET /api/wallet/subaccounts (src/decibel_wallet_routes_v1.ts). */
export type wallet_subaccounts_v1 = Readonly<{
  owner: string;
  whitelisted: boolean;
  inUse: string | null;
  /** APT on the bot key (gas), in octas; null when unknown. */
  botGasOctas: number | null;
  subaccounts: readonly Readonly<{
    address: string;
    label: string | null;
    isPrimary: boolean;
    authorization: authorization_v1 | null;
  }>[];
}>;

export function normalizeWalletAddressV1(address: string | null | undefined): string | null {
  const match = /^0x([0-9a-f]{1,64})$/i.exec(address?.trim() ?? '');
  return match ? `0x${match[1].toLowerCase().padStart(64, '0')}` : null;
}

export function isAuthorizedV1(authorization: authorization_v1 | null | undefined): boolean {
  return authorization?.status === 'ACTIVE' || authorization?.status === 'EXPIRING_SOON';
}

const FRIENDLY_ERRORS_V1: Readonly<Record<string, string>> = {
  PETRA_NOT_INSTALLED: 'Petra is not installed in this browser.',
  WALLET_REQUEST_REJECTED: 'Request rejected in Petra.',
  WALLET_NOT_WHITELISTED: 'This wallet is not allowed to use this bot.',
  SUBACCOUNT_NOT_OWNED: 'This wallet does not own the subaccount.',
  END_SESSION_BEFORE_SWITCHING: 'End the running session before switching subaccount.',
  ORDERS_OPEN_BEFORE_SWITCHING: 'Wait until the open orders of this subaccount are settled.',
  END_SESSION_BEFORE_REVOKING: 'End the running session before revoking the bot.',
  ORDERS_OPEN_BEFORE_REVOKING: 'Wait until the open orders are settled before revoking.',
  ALREADY_REVOKED: 'The bot has no access to this subaccount.',
  BOT_AUTHORIZATION_UNAVAILABLE: 'Decibel did not answer. Try again in a moment.',
  END_SESSION_BEFORE_WITHDRAWING_GAS: 'End the running session before withdrawing gas.',
  ORDERS_OPEN_BEFORE_WITHDRAWING_GAS:
    'Wait until the open orders are settled before withdrawing gas.',
  NOTHING_TO_WITHDRAW: 'The bot wallet has no spare APT to withdraw.',
  NO_BOT_KEY: 'This wallet has no bot key yet.',
};

/** APT amount from octas, for display. */
export function formatAptV1(octas: number): string {
  return `${(octas / 100_000_000).toFixed(4)} APT`;
}

export function describeWalletErrorV1(code: string): string {
  return FRIENDLY_ERRORS_V1[code] ?? code;
}

function withoutAddress(set: ReadonlySet<string>, address: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(address);
  return next;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? 'WALLET_REQUEST_FAILED');
  return value;
}

async function readSubaccounts(owner: string): Promise<wallet_subaccounts_v1> {
  const response = await fetch(`/api/wallet/subaccounts?owner=${owner}`);
  const body = (await response.json()) as wallet_subaccounts_v1 & { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'SUBACCOUNTS_UNAVAILABLE');
  return body;
}

/**
 * Wallet control in the top bar: connect Petra, pick the subaccount, confirm with one Petra
 * signature. The connection is restored on reload without a popup.
 */
export const WalletMenu = () => {
  const [connected, setConnected] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<wallet_subaccounts_v1 | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  /** Subaccounts revoked from this page; Decibel's index may still list them for a while. */
  const [revoked, setRevoked] = useState<ReadonlySet<string>>(new Set());
  const Root = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (owner: string) => {
    const body = await readSubaccounts(owner);
    setAccounts(body);
    setSelected(
      (current) =>
        body.subaccounts.find((row) => row.address === current)?.address ??
        body.subaccounts.find((row) => row.address === body.inUse)?.address ??
        body.subaccounts[0]?.address ??
        null,
    );
    return body;
  }, []);

  // Restore an existing Petra connection after a reload (no popup).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const wallet = await waitForPetraWalletV1();
      const address = normalizeWalletAddressV1(await wallet?.account());
      if (cancelled || address === null) return;
      setConnected(address);
      await load(address).catch(() => undefined);
    })();
    void fetch('/api/auth/session')
      .then(async (response) => {
        if (response.ok)
          setSignedIn(((await response.json()) as { mode?: string }).mode === 'wallet');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [load]);
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
      })
      .catch((error: unknown) =>
        setMessage(
          describeWalletErrorV1(error instanceof Error ? error.message : 'WALLET_ACTION_FAILED'),
        ),
      )
      .finally(() => setBusy(false));
  };
  const sign = async (payload: wallet_payload_v1 | null | undefined) => {
    if (!payload) return;
    const wallet = await waitForPetraWalletV1();
    if (wallet === null) throw new Error('PETRA_NOT_INSTALLED');
    await wallet.signAndSubmit(payload);
  };
  const connect = () =>
    run(async () => {
      const wallet = await waitForPetraWalletV1();
      if (wallet === null) throw new Error('PETRA_NOT_INSTALLED');
      const address = normalizeWalletAddressV1((await wallet.connect()).address);
      if (address === null) throw new Error('WALLET_ADDRESS_INVALID');
      setConnected(address);
      setOpen(true);
      await load(address);
    });
  /** Runs the bot on `subaccount`; the bot restarts itself and the page reloads after. */
  const switchTo = async (owner: string, subaccount: string) => {
    const result = await postJson<{ status: string }>('/api/wallet/subaccount', {
      owner,
      subaccount,
    });
    if (result.status !== 'SWITCHING') return 'Confirmed. The bot can trade this subaccount.';
    setMessage('Switching subaccount. The bot restarts; this page reloads when it is back.');
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const back = await readSubaccounts(owner).catch(() => null);
      if (back?.inUse === subaccount) window.location.reload();
    }
  };
  const confirm = () =>
    run(async () => {
      if (connected === null || selected === null) return;
      const { payloads } = await postJson<{
        payloads: Record<'delegate' | 'gasTopUp', wallet_payload_v1 | null>;
      }>('/api/wallet/prepare', { owner: connected, subaccount: selected });
      await sign(payloads.delegate);
      await sign(payloads.gasTopUp);
      setRevoked((current) => withoutAddress(current, selected));
      await load(connected);
      return switchTo(connected, selected);
    });
  const use = () =>
    run(async () => {
      if (connected !== null && selected !== null) return switchTo(connected, selected);
    });
  const revoke = () =>
    run(async () => {
      if (connected === null || selected === null) return;
      const { payload } = await postJson<{ payload: wallet_payload_v1 }>('/api/wallet/revoke', {
        owner: connected,
        subaccount: selected,
      });
      await sign(payload);
      setRevoked((current) => new Set(current).add(selected));
      await load(connected).catch(() => undefined);
      return 'Bot access revoked.';
    });
  /** The bot key signs this transfer itself; the APT always goes back to the connected owner. */
  const withdrawGas = () =>
    run(async () => {
      if (connected === null || accounts?.botGasOctas == null) return;
      const proceed = window.confirm(
        `Send about ${formatAptV1(accounts.botGasOctas)} from the bot wallet back to ${shortAddressV1(connected)}? ` +
          'New entries pause until the bot has gas again (CONFIRM offers a top-up).',
      );
      if (!proceed) return;
      const { amountOctas } = await postJson<{ amountOctas: number }>('/api/wallet/withdraw-gas', {
        owner: connected,
      });
      await load(connected).catch(() => undefined);
      return `Withdrew ${formatAptV1(amountOctas)} to your wallet.`;
    });

  const rows = accounts?.subaccounts ?? [];
  const inUseRow = rows.find((row) => row.address === accounts?.inUse);
  const selectedRow = rows.find((row) => row.address === selected);
  const authorized = (row: (typeof rows)[number] | undefined) =>
    row !== undefined && !revoked.has(row.address) && isAuthorizedV1(row.authorization);
  const selectedAuthorized = authorized(selectedRow);
  const selectedInUse = selected !== null && selected === accounts?.inUse;
  const expiry =
    selectedRow?.authorization?.expiresAtMs == null
      ? null
      : new Date(selectedRow.authorization.expiresAtMs).toISOString().slice(0, 10);
  const action = !selectedAuthorized
    ? { label: 'CONFIRM', run: confirm }
    : !selectedInUse
      ? { label: 'USE THIS SUBACCOUNT', run: use }
      : { label: 'RENEW', run: confirm };
  return (
    <div className="wallet-menu" ref={Root}>
      <button
        type="button"
        className={`wallet-control ${authorized(inUseRow) ? 'authorized' : ''}`}
        aria-label="Wallet"
        aria-expanded={open}
        disabled={busy && connected === null}
        onClick={() => (connected === null ? connect() : setOpen((current) => !current))}
      >
        {connected === null ? (busy ? 'CONNECTING…' : 'CONNECT WALLET') : shortAddressV1(connected)}
      </button>
      {open && connected !== null && (
        <div className="wallet-dropdown" role="dialog" aria-label="Wallet">
          <div className="wallet-head">
            <strong title={connected}>{shortAddressV1(connected)}</strong>
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
          {accounts === null ? null : !accounts.whitelisted ? (
            <p className="wallet-note">{describeWalletErrorV1('WALLET_NOT_WHITELISTED')}</p>
          ) : accounts.subaccounts.length === 0 ? (
            <p className="wallet-note">No Decibel subaccount on this wallet.</p>
          ) : (
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
                    {row.address === accounts.inUse ? (
                      <em>IN USE</em>
                    ) : authorized(row) ? (
                      <em className="positive">READY</em>
                    ) : (
                      <em />
                    )}
                  </label>
                ))}
              </div>
              {accounts.botGasOctas !== null && (
                <div className="wallet-gas">
                  <span>Bot gas {formatAptV1(accounts.botGasOctas)}</span>
                  <button
                    type="button"
                    className="wallet-link"
                    disabled={busy || accounts.botGasOctas <= 0}
                    onClick={withdrawGas}
                  >
                    WITHDRAW GAS
                  </button>
                </div>
              )}
              <p className={`wallet-state ${selectedAuthorized ? 'positive' : 'warning'}`}>
                {selectedAuthorized
                  ? `Bot authorized${expiry ? ` until ${expiry}` : ''}`
                  : 'Bot not authorized on this subaccount'}
              </p>
              <div className="wallet-actions">
                <button type="button" disabled={busy || selected === null} onClick={action.run}>
                  {busy ? 'WAITING FOR PETRA…' : action.label}
                </button>
                <button
                  type="button"
                  className="wallet-link"
                  disabled={busy || !selectedAuthorized}
                  title={selectedAuthorized ? undefined : 'The bot has no access to revoke.'}
                  onClick={revoke}
                >
                  {selected !== null && revoked.has(selected) ? 'REVOKED' : 'REVOKE'}
                </button>
              </div>
            </>
          )}
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
