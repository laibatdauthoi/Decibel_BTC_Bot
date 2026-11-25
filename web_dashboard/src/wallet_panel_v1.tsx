import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './confirm_dialog_v1';
import {
  noticeLifetimeMsV1,
  useDismissNoticeV1,
  type dashboard_notice_tone_v1,
} from './notice_timing_v1';
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
  WITHDRAW_AMOUNT_INVALID: 'The withdrawal amount is not valid.',
  WITHDRAW_AMOUNT_ABOVE_AVAILABLE:
    'The amount is above what the bot wallet can send after the fee. Use MAX for everything.',
  GAS_WITHDRAW_FAILED: 'The withdrawal did not go through. Nothing was sent; try again.',
  GAS_WITHDRAW_SIMULATION_FAILED:
    'The node rejected the withdrawal in simulation. Nothing was sent.',
  GAS_WITHDRAW_TRANSACTION_FAILED: 'The withdrawal transaction failed on-chain.',
  TOPUP_AMOUNT_INVALID: 'Enter a top-up between 0 and 10 APT.',
};

/** APT amount from octas, for display. */
export function formatAptV1(octas: number): string {
  return `${(octas / 100_000_000).toFixed(4)} APT`;
}

/** Octas from an APT amount typed by the operator (up to 8 decimals); null when invalid. */
export function parseAptToOctasV1(text: string): number | null {
  const match = /^(\d{1,12})(?:[.,](\d{1,8}))?$/.exec(text.trim());
  if (match === null) return null;
  const octas = Number(match[1]) * 100_000_000 + Number((match[2] ?? '').padEnd(8, '0'));
  return Number.isSafeInteger(octas) ? octas : null;
}

/** Why a typed withdrawal amount cannot be sent, or null when it can. */
export function checkWithdrawAmountV1(text: string, balanceOctas: number | null): string | null {
  const octas = parseAptToOctasV1(text);
  if (octas === null) return 'Enter an amount in APT, for example 0.1.';
  if (octas <= 0) return 'Enter an amount above zero.';
  if (balanceOctas !== null && octas >= balanceOctas)
    return 'Above what the bot wallet can send after the fee. Use MAX for everything.';
  return null;
}

/** Bot gas below this pauses new entries (policy gas.entryReserveApt = 0.1 APT). */
export const WALLET_GAS_ENTRY_RESERVE_OCTAS_V1 = 10_000_000;
/** Amount the top-up dialog suggests: about 10 days of trading at the observed rate. */
export const WALLET_GAS_TOPUP_SUGGESTED_APT_V1 = '0.5';

/** Why a typed top-up amount cannot be sent, or null when it can (at most 10 APT). */
export function checkTopUpAmountV1(text: string): string | null {
  const octas = parseAptToOctasV1(text);
  if (octas === null) return 'Enter an amount in APT, for example 0.5.';
  if (octas <= 0) return 'Enter an amount above zero.';
  if (octas > 1_000_000_000) return 'At most 10 APT per top-up.';
  return null;
}

export function describeWalletErrorV1(code: string): string {
  // A code may carry the node's status after a colon (CODE:VM_STATUS).
  const [base = code, detail] = code.split(/:(.*)/s);
  const friendly = FRIENDLY_ERRORS_V1[base];
  return friendly === undefined ? code : detail ? `${friendly} (${detail})` : friendly;
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
  const [message, setMessage] = useState<Readonly<{
    text: string;
    tone: dashboard_notice_tone_v1;
  }> | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [withdrawText, setWithdrawText] = useState('');
  const [withdrawAll, setWithdrawAll] = useState(false);
  const [confirmingTopUp, setConfirmingTopUp] = useState(false);
  const [topUpText, setTopUpText] = useState(WALLET_GAS_TOPUP_SUGGESTED_APT_V1);
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
      // Escape inside the withdraw confirmation only closes that dialog.
      if (event.key === 'Escape' && !Root.current?.querySelector('dialog[open]')) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  // Success and error notices fade; an info notice (switching) stays until the page reloads.
  useDismissNoticeV1(message, message === null ? null : noticeLifetimeMsV1(message.tone), () =>
    setMessage(null),
  );

  const run = (action: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    void action()
      .then((done) => {
        if (done) setMessage({ text: done, tone: 'success' });
      })
      .catch((error: unknown) =>
        setMessage({
          text: describeWalletErrorV1(
            error instanceof Error ? error.message : 'WALLET_ACTION_FAILED',
          ),
          tone: 'error',
        }),
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
    setMessage({
      text: 'Switching subaccount. The bot restarts; this page reloads when it is back.',
      tone: 'info',
    });
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
      setConfirmingWithdraw(false);
      if (connected === null) return;
      // MAX sends no amount: the server withdraws everything above the transfer fee.
      const requested = withdrawAll ? null : parseAptToOctasV1(withdrawText);
      const { amountOctas } = await postJson<{ amountOctas: number }>('/api/wallet/withdraw-gas', {
        owner: connected,
        ...(requested === null ? {} : { amountOctas: requested }),
      });
      await load(connected).catch(() => undefined);
      return `Withdrew ${formatAptV1(amountOctas)} to your wallet.`;
    });

  /** Petra sends APT from the connected owner wallet to the bot key's address. */
  const topUpGas = () =>
    run(async () => {
      setConfirmingTopUp(false);
      if (connected === null) return;
      const amountOctas = parseAptToOctasV1(topUpText);
      if (amountOctas === null) throw new Error('TOPUP_AMOUNT_INVALID');
      const { payload } = await postJson<{ payload: wallet_payload_v1 }>('/api/wallet/topup-gas', {
        owner: connected,
        amountOctas,
      });
      await sign(payload);
      await load(connected).catch(() => undefined);
      return `Sent ${formatAptV1(amountOctas)} to the bot wallet.`;
    });

  const topUpCheck = checkTopUpAmountV1(topUpText);
  const withdrawCheck = withdrawAll
    ? null
    : checkWithdrawAmountV1(withdrawText, accounts?.botGasOctas ?? null);
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
                  <span
                    className={
                      accounts.botGasOctas < WALLET_GAS_ENTRY_RESERVE_OCTAS_V1
                        ? 'wallet-gas-low'
                        : undefined
                    }
                    title={
                      accounts.botGasOctas < WALLET_GAS_ENTRY_RESERVE_OCTAS_V1
                        ? 'Below the 0.1 APT reserve: new entries are paused.'
                        : undefined
                    }
                  >
                    Bot gas {formatAptV1(accounts.botGasOctas)}
                    {accounts.botGasOctas < WALLET_GAS_ENTRY_RESERVE_OCTAS_V1 ? ' · LOW' : ''}
                  </span>
                  <button
                    type="button"
                    className="wallet-link"
                    disabled={busy}
                    onClick={() => {
                      setTopUpText(WALLET_GAS_TOPUP_SUGGESTED_APT_V1);
                      setConfirmingTopUp(true);
                    }}
                  >
                    TOP UP GAS
                  </button>
                  <button
                    type="button"
                    className="wallet-link"
                    disabled={busy || accounts.botGasOctas <= 0}
                    onClick={() => {
                      setWithdrawText('');
                      setWithdrawAll(false);
                      setConfirmingWithdraw(true);
                    }}
                  >
                    WITHDRAW GAS
                  </button>
                </div>
              )}
              {confirmingWithdraw && accounts.botGasOctas !== null && (
                <ConfirmDialog
                  title="WITHDRAW GAS"
                  message={
                    `Send APT from the bot wallet back to ${shortAddressV1(connected)}. ` +
                    'New entries pause while the bot wallet holds less than 0.1 APT (TOP UP GAS ' +
                    'adds more).'
                  }
                  confirmLabel="WITHDRAW"
                  confirmDisabled={withdrawCheck !== null}
                  onConfirm={withdrawGas}
                  onCancel={() => setConfirmingWithdraw(false)}
                >
                  <label className="confirm-dialog-field">
                    <span>Amount</span>
                    <span className="confirm-dialog-input">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.1000"
                        value={withdrawText}
                        autoFocus
                        aria-invalid={withdrawText !== '' && withdrawCheck !== null}
                        onChange={(event) => {
                          setWithdrawText(event.target.value.trim());
                          setWithdrawAll(false);
                        }}
                      />
                      <em>APT</em>
                      <button
                        type="button"
                        className="confirm-dialog-max"
                        aria-pressed={withdrawAll}
                        onClick={() => {
                          setWithdrawText(
                            (accounts.botGasOctas ?? 0) > 0
                              ? ((accounts.botGasOctas ?? 0) / 100_000_000).toFixed(4)
                              : '',
                          );
                          setWithdrawAll(true);
                        }}
                      >
                        MAX
                      </button>
                    </span>
                  </label>
                  <p
                    className={`confirm-dialog-hint ${withdrawText !== '' && withdrawCheck ? 'invalid' : ''}`}
                  >
                    {withdrawText !== '' && withdrawCheck
                      ? withdrawCheck
                      : withdrawAll
                        ? 'MAX sends everything except about 0.006 APT kept for the transfer fee.'
                        : `Bot wallet holds ${formatAptV1(accounts.botGasOctas)}.`}
                  </p>
                </ConfirmDialog>
              )}
              {confirmingTopUp && (
                <ConfirmDialog
                  title="TOP UP GAS"
                  message={
                    `Send APT from ${shortAddressV1(connected)} to the bot wallet, which pays the ` +
                    'fee of every order, cancel and exit. New entries pause below 0.1 APT.'
                  }
                  confirmLabel="TOP UP"
                  confirmDisabled={topUpCheck !== null}
                  onConfirm={topUpGas}
                  onCancel={() => setConfirmingTopUp(false)}
                >
                  <label className="confirm-dialog-field">
                    <span>Amount</span>
                    <span className="confirm-dialog-input">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={WALLET_GAS_TOPUP_SUGGESTED_APT_V1}
                        value={topUpText}
                        autoFocus
                        aria-invalid={topUpText !== '' && topUpCheck !== null}
                        onChange={(event) => setTopUpText(event.target.value.trim())}
                      />
                      <em>APT</em>
                    </span>
                  </label>
                  <p
                    className={`confirm-dialog-hint ${topUpText !== '' && topUpCheck ? 'invalid' : ''}`}
                  >
                    {topUpText !== '' && topUpCheck
                      ? topUpCheck
                      : `Bot wallet holds ${formatAptV1(accounts.botGasOctas ?? 0)}. About 0.05 APT a day at recent activity; Petra asks you to sign.`}
                  </p>
                </ConfirmDialog>
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
                  className="wallet-link wallet-danger"
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
          {message && (
            <div
              className={`wallet-notice wallet-notice-${message.tone}`}
              role={message.tone === 'error' ? 'alert' : 'status'}
            >
              <p>{message.text}</p>
              <button
                type="button"
                className="wallet-notice-close"
                aria-label="Dismiss"
                onClick={() => setMessage(null)}
              >
                ×
              </button>
              {noticeLifetimeMsV1(message.tone) !== null && (
                // Shrinks over the notice's lifetime so it is clear it will hide by itself.
                <span
                  className="wallet-notice-timer"
                  style={{ animationDuration: `${noticeLifetimeMsV1(message.tone)}ms` }}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
