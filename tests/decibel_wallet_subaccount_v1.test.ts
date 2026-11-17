import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createDecibelAgentKeystoreV1,
  resolveDecibelAgentKeystorePathV1,
} from '../src/decibel_agent_keystore_v1.js';
import {
  handleDecibelWalletRequestV1,
  readDecibelSubaccountsV1,
} from '../src/decibel_wallet_routes_v1.js';
import {
  readDecibelSelectedSubaccountV1,
  resolveDecibelWalletPathsV1,
} from '../src/decibel_wallet_workspace_v1.js';

const OWNER = `0x${'aa'.repeat(32)}`;
const OTHER = `0x${'bb'.repeat(32)}`;
const AGENT = `0x${'cc'.repeat(32)}`;
const IN_USE = `0x${'01'.repeat(32)}`;
const SECOND = `0x${'02'.repeat(32)}`;
const SECRET = 'correct horse battery staple';
const material = {
  privateKeyHex: `0x${'11'.repeat(32)}`,
  publicKeyHex: `0x${'22'.repeat(32)}`,
  address: AGENT,
};

function setup(
  options: { canSwitch?: 'OK' | 'SESSION_ACTIVE' | 'DISABLED'; balance?: number } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'wallet-routes-'));
  const dataRoot = join(root, 'wallets');
  const selectionPath = join(root, 'selected.json');
  const switchNow = vi.fn();
  const generateAgentKey = vi.fn(() => Promise.resolve(material));
  const owners: Record<string, string> = { [IN_USE]: OWNER, [SECOND]: OWNER };
  const deps = {
    environment: { DECIBEL_SUBACCOUNT_ADDRESS: IN_USE } as NodeJS.ProcessEnv,
    packageAddress: `0x${'dd'.repeat(32)}`,
    now: () => 1_800_000_000_000,
    readDelegations: (subaccount: string) =>
      Promise.resolve(
        subaccount === SECOND
          ? [{ delegatedAccount: AGENT, permissionType: 'TRADING', expiresAtMs: null }]
          : [],
      ),
    readAptBalanceOctas: () => Promise.resolve(options.balance ?? 0),
    generateAgentKey,
    readSubaccounts: vi.fn(() =>
      Promise.resolve([
        { address: IN_USE, label: null, isPrimary: true },
        { address: SECOND, label: 'Farm', isPrimary: false },
      ]),
    ),
    readSubaccountOwner: (subaccount: string) => Promise.resolve(owners[subaccount] ?? OTHER),
    isWhitelisted: (owner: string) => owner === OWNER,
    keystoreSecret: () => SECRET,
    canSwitch: () => options.canSwitch ?? 'OK',
    switchNow,
    dataRoot,
    selectionPath,
  };
  const keystore = resolveDecibelAgentKeystorePathV1(
    resolveDecibelWalletPathsV1(OWNER, dataRoot).root,
  );
  return { deps, switchNow, generateAgentKey, selectionPath, keystore };
}

describe('Wallet subaccounts', () => {
  it('lists a whitelisted wallet with the bot authorization of each subaccount', async () => {
    const { deps, keystore } = setup();
    const query = new URLSearchParams({ owner: OWNER });
    const before = await handleDecibelWalletRequestV1('GET', '/api/wallet/subaccounts', deps, {
      query,
    });
    expect(before?.body).toMatchObject({
      whitelisted: true,
      inUse: IN_USE,
      subaccounts: [{ authorization: null }, { authorization: null }],
    });
    createDecibelAgentKeystoreV1(keystore, SECRET, () => material);
    const after = await handleDecibelWalletRequestV1('GET', '/api/wallet/subaccounts', deps, {
      query,
    });
    expect(after?.body).toMatchObject({
      subaccounts: [
        { address: IN_USE, isPrimary: true, authorization: { status: 'MISSING' } },
        { address: SECOND, label: 'Farm', authorization: { status: 'ACTIVE' } },
      ],
    });
  });

  it('shows nothing to a wallet that is not whitelisted', async () => {
    const { deps } = setup();
    const result = await handleDecibelWalletRequestV1('GET', '/api/wallet/subaccounts', deps, {
      query: new URLSearchParams({ owner: OTHER }),
    });
    expect(result?.body).toMatchObject({ whitelisted: false, subaccounts: [] });
    expect(deps.readSubaccounts).not.toHaveBeenCalled();
  });
});

describe('Wallet prepare', () => {
  it('creates the bot key once, automatically, and returns only Petra payloads', async () => {
    const { deps, generateAgentKey, keystore } = setup();
    const prepare = () =>
      handleDecibelWalletRequestV1('POST', '/api/wallet/prepare', deps, {
        body: { owner: OWNER, subaccount: SECOND },
      });
    const first = await prepare();
    expect(first?.status).toBe(200);
    expect(first?.body).toMatchObject({
      payloads: {
        delegate: { functionArguments: [SECOND, AGENT, expect.any(String)] },
        revoke: { functionArguments: [SECOND, AGENT] },
        gasTopUp: { functionArguments: [AGENT, '50000000'] },
      },
    });
    expect(JSON.stringify(first?.body)).not.toContain('11'.repeat(32));
    expect(existsSync(keystore)).toBe(true);
    await prepare();
    expect(generateAgentKey).toHaveBeenCalledTimes(1);
  });

  it('skips the gas top-up when the bot key already has gas', async () => {
    const { deps } = setup({ balance: 20_000_000 });
    const result = await handleDecibelWalletRequestV1('POST', '/api/wallet/prepare', deps, {
      body: { owner: OWNER, subaccount: IN_USE },
    });
    expect(result?.body).toMatchObject({ payloads: { gasTopUp: null } });
  });

  it('refuses foreign subaccounts and wallets outside the whitelist', async () => {
    const { deps } = setup();
    const prepare = (owner: string, subaccount: string) =>
      handleDecibelWalletRequestV1('POST', '/api/wallet/prepare', deps, {
        body: { owner, subaccount },
      });
    expect((await prepare(OWNER, `0x${'03'.repeat(32)}`))?.body).toEqual({
      error: 'SUBACCOUNT_NOT_OWNED',
    });
    expect((await prepare(OTHER, SECOND))?.body).toEqual({ error: 'WALLET_NOT_WHITELISTED' });
  });
});

describe('Wallet subaccount switch', () => {
  const choose = (deps: ReturnType<typeof setup>['deps'], subaccount: string) =>
    handleDecibelWalletRequestV1('POST', '/api/wallet/subaccount', deps, {
      body: { owner: OWNER, subaccount },
    });

  it('switches the idle runtime to another subaccount without a manual restart', async () => {
    const { deps, switchNow, selectionPath } = setup();
    expect(await choose(deps, IN_USE)).toEqual({
      status: 200,
      body: { status: 'IN_USE', subaccount: IN_USE },
    });
    expect(switchNow).not.toHaveBeenCalled();
    expect(await choose(deps, SECOND)).toEqual({
      status: 200,
      body: { status: 'SWITCHING', subaccount: SECOND },
    });
    expect(switchNow).toHaveBeenCalledTimes(1);
    expect(readDecibelSelectedSubaccountV1(selectionPath)).toMatchObject({
      subaccount: SECOND,
      owner: OWNER,
    });
  });

  it('never switches during a session or in multi-wallet mode', async () => {
    for (const canSwitch of ['SESSION_ACTIVE', 'DISABLED'] as const) {
      const { deps, switchNow, selectionPath } = setup({ canSwitch });
      expect((await choose(deps, SECOND))?.status).toBe(409);
      expect(switchNow).not.toHaveBeenCalled();
      expect(existsSync(selectionPath)).toBe(false);
    }
  });
});

describe('Subaccount listing', () => {
  it('reads active subaccounts from the Decibel API', async () => {
    const fetchImpl = vi.fn((url: string) => {
      expect(url).toBe(`https://api.example/decibel/api/v1/subaccounts?owner=${OWNER}`);
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              subaccount_address: IN_USE,
              primary_account_address: OWNER,
              is_primary: true,
              custom_label: null,
            },
            {
              subaccount_address: SECOND,
              primary_account_address: OWNER,
              is_primary: false,
              is_active: false,
              custom_label: 'Old',
            },
          ]),
        ),
      );
    });
    await expect(
      readDecibelSubaccountsV1({
        tradingHttpUrl: 'https://api.example/decibel',
        owner: OWNER,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual([{ address: IN_USE, label: null, isPrimary: true }]);
  });
});
