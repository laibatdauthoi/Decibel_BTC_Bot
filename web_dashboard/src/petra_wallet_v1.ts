/**
 * Petra connection for the dashboard (added 2026-11-17), without extra dependencies.
 *
 * Uses the Aptos wallet standard (AIP-62: `aptos:connect`, `aptos:signAndSubmitTransaction`,
 * `aptos:signMessage`) and falls back to Petra's injected `window.aptos` API. The dashboard
 * only asks Petra to sign; keys never leave the wallet.
 */

export type wallet_payload_v1 = Readonly<{
  function: string;
  typeArguments: readonly string[];
  functionArguments: readonly (string | null)[];
}>;

export type petra_wallet_v1 = Readonly<{
  name: string;
  connect: () => Promise<Readonly<{ address: string; publicKey: string }>>;
  signAndSubmit: (payload: wallet_payload_v1) => Promise<string>;
  signMessage: (
    message: string,
    nonce: string,
  ) => Promise<Readonly<{ fullMessage: string; signature: string }>>;
}>;

type user_response<T> = { status: 'Approved'; args: T } | { status: 'Rejected' };
type stringable = { toString(): string };
type standard_wallet = {
  name: string;
  features: Record<string, unknown>;
};
type standard_connect = {
  connect: () => Promise<user_response<{ address: stringable; publicKey: stringable }>>;
};
type standard_sign_and_submit = {
  version?: string;
  signAndSubmitTransaction: (input: {
    payload: {
      function: string;
      typeArguments: string[];
      functionArguments: (string | null)[];
    };
  }) => Promise<user_response<{ hash: string }>>;
};
type standard_sign_message = {
  signMessage: (input: {
    message: string;
    nonce: string;
    address?: boolean;
    application?: boolean;
    chainId?: boolean;
  }) => Promise<user_response<{ fullMessage: string; signature: stringable }>>;
};
type legacy_petra = {
  connect: () => Promise<{ address: string; publicKey: string | string[] }>;
  signAndSubmitTransaction: (transaction: {
    type: 'entry_function_payload';
    function: string;
    type_arguments: string[];
    arguments: (string | null)[];
  }) => Promise<{ hash: string }>;
  signMessage: (input: {
    message: string;
    nonce: string;
    address?: boolean;
  }) => Promise<{ fullMessage: string; signature: string | string[] }>;
};

const StandardWallets: standard_wallet[] = [];
let listening = false;

/** Wallet-standard discovery: wallets register now or whenever they load. */
function listenForStandardWallets(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const api = Object.freeze({
    register: (...wallets: standard_wallet[]) => {
      for (const wallet of wallets)
        if (!StandardWallets.includes(wallet)) StandardWallets.push(wallet);
      return () => undefined;
    },
  });
  window.addEventListener('wallet-standard:register-wallet', (event) => {
    const callback = (event as CustomEvent<(registry: typeof api) => void>).detail;
    if (typeof callback === 'function') callback(api);
  });
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
}

function approved<T>(response: user_response<T>): T {
  if (response.status !== 'Approved') throw new Error('WALLET_REQUEST_REJECTED');
  return response.args;
}

function fromStandard(wallet: standard_wallet): petra_wallet_v1 | null {
  const connect = wallet.features['aptos:connect'] as standard_connect | undefined;
  const submit = wallet.features['aptos:signAndSubmitTransaction'] as
    standard_sign_and_submit | undefined;
  const sign = wallet.features['aptos:signMessage'] as standard_sign_message | undefined;
  if (!connect || !submit || !sign) return null;
  return Object.freeze({
    name: wallet.name,
    connect: async () => {
      const account = approved(await connect.connect());
      return { address: account.address.toString(), publicKey: account.publicKey.toString() };
    },
    signAndSubmit: async (payload) =>
      approved(
        await submit.signAndSubmitTransaction({
          payload: {
            function: payload.function,
            typeArguments: [...payload.typeArguments],
            functionArguments: [...payload.functionArguments],
          },
        }),
      ).hash,
    signMessage: async (message, nonce) => {
      const signed = approved(await sign.signMessage({ message, nonce, address: true }));
      return { fullMessage: signed.fullMessage, signature: signed.signature.toString() };
    },
  });
}

function fromLegacy(petra: legacy_petra): petra_wallet_v1 {
  const first = (value: string | string[]) => (Array.isArray(value) ? value[0] : value);
  return Object.freeze({
    name: 'Petra',
    connect: async () => {
      const account = await petra.connect();
      return { address: account.address, publicKey: first(account.publicKey) };
    },
    signAndSubmit: async (payload) =>
      (
        await petra.signAndSubmitTransaction({
          type: 'entry_function_payload',
          function: payload.function,
          type_arguments: [...payload.typeArguments],
          arguments: [...payload.functionArguments],
        })
      ).hash,
    signMessage: async (message, nonce) => {
      const signed = await petra.signMessage({ message, nonce, address: true });
      return { fullMessage: signed.fullMessage, signature: first(signed.signature) };
    },
  });
}

/** Petra if installed (wallet standard first, then the injected API), else null. */
export function findPetraWalletV1(): petra_wallet_v1 | null {
  listenForStandardWallets();
  const standard = StandardWallets.find((wallet) => /petra/i.test(wallet.name));
  const converted = standard ? fromStandard(standard) : null;
  if (converted) return converted;
  const injected =
    (window as unknown as { petra?: legacy_petra; aptos?: legacy_petra }).petra ??
    (window as unknown as { aptos?: legacy_petra }).aptos;
  return injected ? fromLegacy(injected) : null;
}

export function shortAddressV1(address: string | null | undefined): string {
  if (!address) return '—';
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}
