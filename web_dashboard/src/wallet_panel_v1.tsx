import { useCallback, useEffect, useRef, useState } from 'react';
import {
  findPetraWalletV1,
  shortAddressV1,
  type petra_wallet_v1,
  type wallet_payload_v1,
} from './petra_wallet_v1';

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

export function describeSignerV1(status: wallet_status_v1 | null): string {
  if (status === null) return 'UNAVAILABLE';
  if (status.signerMode === 'PRIVATE_KEY') return 'PRIVATE KEY (.env)';
  if (status.signerMode === 'NONE') return 'NOT CONFIGURED';
  const delegation = status.delegation?.status;
  return delegation === 'ACTIVE' || delegation === 'EXPIRING_SOON'
    ? 'AGENT WALLET'
    : 'AGENT WALLET (NOT AUTHORIZED)';
}

export function describeDelegationV1(status: wallet_status_v1 | null): string {
  if (status?.agent == null) return '—';
  if (status.delegation === null) return status.delegationError ?? 'UNAVAILABLE';
  const expiry =
    status.delegation.expiresAtMs === null
      ? 'NO EXPIRY'
      : `UNTIL ${new Date(status.delegation.expiresAtMs).toISOString().slice(0, 10)}`;
  switch (status.delegation.status) {
    case 'ACTIVE':
      return `AUTHORIZED · ${expiry}`;
    case 'EXPIRING_SOON':
      return `EXPIRING SOON · ${expiry}`;
    case 'EXPIRED':
      return 'EXPIRED';
    default:
      return 'NOT AUTHORIZED';
  }
}

const formatApt = (octas: number | null | undefined) =>
  octas == null ? '—' : `${(octas / 100_000_000).toFixed(4)} APT`;

/**
 * Wallet control in the top bar, next to the network badge. The button shows the connected
 * Petra wallet (or WALLET); its menu holds the owner, agent and delegation status and the
 * Petra actions.
 */
export const WalletMenu = () => {
  const [status, setStatus] = useState<wallet_status_v1 | null>(null);
  const [connected, setConnected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const Root = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/wallet');
      if (!response.ok) throw new Error('WALLET_STATUS_UNAVAILABLE');
      setStatus((await response.json()) as wallet_status_v1);
      const session = await fetch('/api/auth/session');
      if (session.ok) setSignedIn(((await session.json()) as { mode?: string }).mode === 'wallet');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'WALLET_STATUS_UNAVAILABLE');
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

  const run = (
    label: string,
    action: (wallet: petra_wallet_v1 | null) => Promise<string | void>,
  ) => {
    if (busy !== null) return;
    setBusy(label);
    setMessage(null);
    void action(findPetraWalletV1())
      .then((done) => {
        if (done) setMessage(done);
        window.setTimeout(() => void refresh(), 4_000);
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'WALLET_ACTION_FAILED'),
      )
      .finally(() => setBusy(null));
  };
  const requireOwner = async (wallet: petra_wallet_v1 | null): Promise<petra_wallet_v1> => {
    if (wallet === null) throw new Error('PETRA_NOT_INSTALLED');
    const account = await wallet.connect();
    const address = normalizeWalletAddressV1(account.address);
    setConnected(address);
    if (address === null || address !== normalizeWalletAddressV1(status?.ownerAddress))
      throw new Error('CONNECTED_WALLET_IS_NOT_THE_SUBACCOUNT_OWNER');
    return wallet;
  };
  const submit = (label: string, payload: wallet_payload_v1 | undefined) =>
    run(label, async (wallet) => {
      if (!payload) throw new Error('WALLET_PAYLOAD_UNAVAILABLE');
      const hash = await (await requireOwner(wallet)).signAndSubmit(payload);
      return `SUBMITTED ${shortAddressV1(hash)}`;
    });

  const ownerMatches =
    connected !== null && connected === normalizeWalletAddressV1(status?.ownerAddress);
  const authorized =
    status?.delegation?.status === 'ACTIVE' || status?.delegation?.status === 'EXPIRING_SOON';
  const tone = status?.agent == null ? '' : authorized ? 'authorized' : 'unauthorized';
  return (
    <div className="wallet-menu" ref={Root}>
      <button
        type="button"
        className={`wallet-control ${tone}`}
        aria-label="Wallet"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {connected === null ? 'WALLET' : shortAddressV1(connected)}
      </button>
      {open && (
        <div className="wallet-dropdown" role="dialog" aria-label="Wallet details">
          <dl>
            <dt>Owner</dt>
            <dd title={status?.ownerAddress ?? undefined}>
              {shortAddressV1(status?.ownerAddress)}
            </dd>
            <dt>Petra</dt>
            <dd className={connected === null ? '' : ownerMatches ? 'positive' : 'negative'}>
              {connected === null ? 'NOT CONNECTED' : shortAddressV1(connected)}
            </dd>
            <dt>Signer</dt>
            <dd>{describeSignerV1(status)}</dd>
            <dt>Agent</dt>
            <dd title={status?.agent?.address}>{shortAddressV1(status?.agent?.address)}</dd>
            <dt>Agent gas</dt>
            <dd>{formatApt(status?.agent?.aptBalanceOctas)}</dd>
            <dt>Delegation</dt>
            <dd className={authorized ? 'positive' : status?.agent ? 'warning' : ''}>
              {describeDelegationV1(status)}
            </dd>
          </dl>
          <div className="wallet-actions">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                run('connect', async (wallet) => {
                  await requireOwner(wallet);
                })
              }
            >
              {busy === 'connect' ? 'CONNECTING…' : 'CONNECT PETRA'}
            </button>
            {status?.agent == null ? (
              <button
                type="button"
                disabled={busy !== null || !status?.keystoreSecretConfigured}
                title={
                  status?.keystoreSecretConfigured
                    ? undefined
                    : 'Add DECIBEL_KEYSTORE_SECRET (16+ characters) to .env and restart the bot'
                }
                onClick={() =>
                  run('create', async () => {
                    const response = await fetch('/api/wallet/agent', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: '{}',
                    });
                    const body = (await response.json()) as { error?: string };
                    if (!response.ok) throw new Error(body.error ?? 'AGENT_CREATE_FAILED');
                    return 'AGENT WALLET CREATED';
                  })
                }
              >
                CREATE AGENT
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => submit('delegate', status.payloads?.delegate)}
                >
                  {authorized ? 'RENEW' : 'AUTHORIZE'} {status.delegationDays}D
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => submit('gas', status.payloads?.gasTopUp)}
                >
                  SEND 0.5 APT
                </button>
                <button
                  type="button"
                  disabled={busy !== null || !authorized}
                  onClick={() => submit('revoke', status.payloads?.revoke)}
                >
                  REVOKE
                </button>
              </>
            )}
            {signedIn && (
              <button
                type="button"
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
          </div>
          {!status?.keystoreSecretConfigured && status?.agent == null && (
            <p className="wallet-note">
              Agent wallet needs DECIBEL_KEYSTORE_SECRET (16+ characters) in .env, then a restart.
            </p>
          )}
          {message && <p className="wallet-note">{message}</p>}
        </div>
      )}
    </div>
  );
};
