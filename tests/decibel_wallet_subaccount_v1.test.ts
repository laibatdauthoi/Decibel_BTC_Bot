import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createDecibelAgentKeystoreV1,
  resolveDecibelAgentKeystorePathV1,
} from '../src/decibel_agent_keystore_v1.js';
import { checkDecibelBotAuthorizationV1 } from '../src/decibel_executor_signer_v1.js';
import {
  DECIBEL_AGENT_GAS_WITHDRAW_PROBE_MAX_GAS_V1,
  handleDecibelWalletRequestV1,
  planDecibelAgentGasWithdrawalV1,
  readDecibelSubaccountsV1,
  resolveDecibelAgentGasWithdrawalAmountV1,
  sizeDecibelAgentGasWithdrawalMaxGasV1,
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
  options: {
    canSwitch?: 'OK' | 'SESSION_ACTIVE' | 'OPEN_ORDERS' | 'DISABLED';
    balance?: number;
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'wallet-routes-'));
  const dataRoot = join(root, 'wallets');
  const selectionPath = join(root, 'selected.json');
  const switchNow = vi.fn();
  const withdrawAgentGas = vi.fn(() =>
    Promise.resolve({ transactionHash: '0xfeed', amountOctas: 49_500_000 }),
  );
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
    withdrawAgentGas,
    dataRoot,
    selectionPath,
  };
  const keystore = resolveDecibelAgentKeystorePathV1(
    resolveDecibelWalletPathsV1(OWNER, dataRoot).root,
  );
  return { deps, switchNow, withdrawAgentGas, generateAgentKey, selectionPath, keystore };
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
      botGasOctas: null,
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

  it('never asks for APT when a gas station sponsors the bot', async () => {
    const { deps } = setup({ balance: 0 });
    const result = await handleDecibelWalletRequestV1(
      'POST',
      '/api/wallet/prepare',
      { ...deps, gasSponsored: true },
      { body: { owner: OWNER, subaccount: IN_USE } },
    );
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

  it('never switches during a session, with open orders or in multi-wallet mode', async () => {
    for (const canSwitch of ['SESSION_ACTIVE', 'OPEN_ORDERS', 'DISABLED'] as const) {
      const { deps, switchNow, selectionPath } = setup({ canSwitch });
      expect((await choose(deps, SECOND))?.status).toBe(409);
      expect(switchNow).not.toHaveBeenCalled();
      expect(existsSync(selectionPath)).toBe(false);
    }
  });
});

describe('Wallet revoke', () => {
  const revoke = (deps: ReturnType<typeof setup>['deps'], subaccount: string) =>
    handleDecibelWalletRequestV1('POST', '/api/wallet/revoke', deps, {
      body: { owner: OWNER, subaccount },
    });

  it('returns the revoke payload only while the bot is authorized', async () => {
    const { deps, keystore } = setup();
    expect(await revoke(deps, SECOND)).toEqual({ status: 409, body: { error: 'ALREADY_REVOKED' } });
    createDecibelAgentKeystoreV1(keystore, SECRET, () => material);
    expect(await revoke(deps, SECOND)).toMatchObject({
      status: 200,
      body: { payload: { functionArguments: [SECOND, AGENT] } },
    });
    // IN_USE has no delegation: nothing to revoke, so the button stays disabled.
    expect(await revoke(deps, IN_USE)).toEqual({ status: 409, body: { error: 'ALREADY_REVOKED' } });
  });

  it('never withdraws the running subaccount during a session or with open orders', async () => {
    for (const [canSwitch, error] of [
      ['SESSION_ACTIVE', 'END_SESSION_BEFORE_REVOKING'],
      ['OPEN_ORDERS', 'ORDERS_OPEN_BEFORE_REVOKING'],
    ] as const) {
      const { deps, keystore } = setup({ canSwitch });
      createDecibelAgentKeystoreV1(keystore, SECRET, () => material);
      const inUseAuthorized = {
        ...deps,
        readDelegations: () =>
          Promise.resolve([
            { delegatedAccount: AGENT, permissionType: 'TRADING', expiresAtMs: null },
          ]),
      };
      expect(await revoke(inUseAuthorized, IN_USE)).toEqual({ status: 409, body: { error } });
      // Another subaccount of the wallet is not trading and may be revoked.
      expect((await revoke(inUseAuthorized, SECOND))?.status).toBe(200);
    }
  });

  it('fails closed when Decibel cannot report the authorization', async () => {
    const { deps, keystore } = setup();
    createDecibelAgentKeystoreV1(keystore, SECRET, () => material);
    const unavailable = { ...deps, readDelegations: () => Promise.reject(new Error('HTTP_502')) };
    expect(await revoke(unavailable, SECOND)).toEqual({
      status: 503,
      body: { error: 'BOT_AUTHORIZATION_UNAVAILABLE' },
    });
  });
});

describe('Wallet gas withdrawal', () => {
  const withdraw = (deps: ReturnType<typeof setup>['deps'], owner: string = OWNER) =>
    handleDecibelWalletRequestV1('POST', '/api/wallet/withdraw-gas', deps, { body: { owner } });

  it('sends the bot gas back to the whitelisted owner, never elsewhere', async () => {
    const { deps, withdrawAgentGas, keystore } = setup({ balance: 50_000_000 });
    expect(await withdraw(deps)).toEqual({ status: 409, body: { error: 'NO_BOT_KEY' } });
    createDecibelAgentKeystoreV1(keystore, SECRET, () => material);
    const listed = await handleDecibelWalletRequestV1('GET', '/api/wallet/subaccounts', deps, {
      query: new URLSearchParams({ owner: OWNER }),
    });
    expect(listed?.body).toMatchObject({ botGasOctas: 50_000_000 });
    expect(await withdraw(deps)).toEqual({
      status: 200,
      body: { transactionHash: '0xfeed', amountOctas: 49_500_000 },
    });
    expect(withdrawAgentGas).toHaveBeenCalledWith(
      expect.objectContaining({ address: AGENT }),
      OWNER,
      undefined,
    );
    expect(await withdraw(deps, OTHER)).toEqual({
      status: 403,
      body: { error: 'WALLET_NOT_WHITELISTED' },
    });
    expect(withdrawAgentGas).toHaveBeenCalledTimes(1);
  });

  it('passes a typed amount through and rejects an invalid one before unlocking', async () => {
    const { deps, withdrawAgentGas, keystore } = setup({ balance: 50_000_000 });
    createDecibelAgentKeystoreV1(keystore, SECRET, () => material);
    const send = (amountOctas: unknown) =>
      handleDecibelWalletRequestV1('POST', '/api/wallet/withdraw-gas', deps, {
        body: { owner: OWNER, amountOctas },
      });
    expect((await send(10_000_000))?.status).toBe(200);
    expect(withdrawAgentGas).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: AGENT }),
      OWNER,
      10_000_000,
    );
    for (const invalid of [0, -1, 1.5, '10000000', Number.MAX_SAFE_INTEGER + 1])
      expect(await send(invalid)).toEqual({
        status: 400,
        body: { error: 'WITHDRAW_AMOUNT_INVALID' },
      });
    expect(withdrawAgentGas).toHaveBeenCalledTimes(1);
    withdrawAgentGas.mockRejectedValueOnce(new Error('WITHDRAW_AMOUNT_ABOVE_AVAILABLE'));
    expect(await send(49_999_999)).toEqual({
      status: 409,
      body: { error: 'WITHDRAW_AMOUNT_ABOVE_AVAILABLE' },
    });
  });

  it('caps a typed amount at what the full-balance plan can send', () => {
    const plan = planDecibelAgentGasWithdrawalV1(46_550_000, 100, 5_981);
    expect(resolveDecibelAgentGasWithdrawalAmountV1(plan, undefined)).toEqual(plan);
    expect(resolveDecibelAgentGasWithdrawalAmountV1(plan, 10_000_000)).toEqual({
      amountOctas: 10_000_000,
      maxGasAmount: 5_981,
      gasUnitPrice: 100,
    });
    expect(() => resolveDecibelAgentGasWithdrawalAmountV1(plan, 46_550_000 - 598_099)).toThrow(
      'WITHDRAW_AMOUNT_ABOVE_AVAILABLE',
    );
    expect(() => resolveDecibelAgentGasWithdrawalAmountV1(plan, 0)).toThrow(
      'WITHDRAW_AMOUNT_INVALID',
    );
    expect(() => resolveDecibelAgentGasWithdrawalAmountV1(null, 1)).toThrow('NOTHING_TO_WITHDRAW');
  });

  it('keeps the gas while a session runs or orders are open', async () => {
    for (const [canSwitch, error] of [
      ['SESSION_ACTIVE', 'END_SESSION_BEFORE_WITHDRAWING_GAS'],
      ['OPEN_ORDERS', 'ORDERS_OPEN_BEFORE_WITHDRAWING_GAS'],
    ] as const) {
      const { deps, withdrawAgentGas, keystore } = setup({ canSwitch });
      createDecibelAgentKeystoreV1(keystore, SECRET, () => material);
      expect(await withdraw(deps)).toEqual({ status: 409, body: { error } });
      expect(withdrawAgentGas).not.toHaveBeenCalled();
    }
  });

  it('reports an empty bot wallet and refuses a wrong keystore secret', async () => {
    const { deps, keystore } = setup();
    createDecibelAgentKeystoreV1(keystore, SECRET, () => material);
    const empty = {
      ...deps,
      withdrawAgentGas: () => Promise.reject(new Error('NOTHING_TO_WITHDRAW')),
    };
    expect(await withdraw(empty)).toEqual({ status: 409, body: { error: 'NOTHING_TO_WITHDRAW' } });
    expect(await withdraw({ ...deps, keystoreSecret: () => 'wrong secret entirely' })).toEqual({
      status: 400,
      body: { error: 'AGENT_KEYSTORE_UNLOCK_FAILED' },
    });
  });

  it('keeps only the transfer fee on the bot key', () => {
    const fee = DECIBEL_AGENT_GAS_WITHDRAW_PROBE_MAX_GAS_V1 * 100;
    expect(planDecibelAgentGasWithdrawalV1(50_000_000, 100)).toEqual({
      amountOctas: 50_000_000 - fee,
      maxGasAmount: DECIBEL_AGENT_GAS_WITHDRAW_PROBE_MAX_GAS_V1,
      gasUnitPrice: 100,
    });
    expect(planDecibelAgentGasWithdrawalV1(fee, 100)).toBeNull();
    expect(planDecibelAgentGasWithdrawalV1(50_000_000, 0)).toBeNull();
    expect(planDecibelAgentGasWithdrawalV1(Number.NaN, 100)).toBeNull();
    // Mainnet 2026-11-19: a transfer used 4,984 gas units, above the old fixed 5,000 limit's margin.
    const maxGas = sizeDecibelAgentGasWithdrawalMaxGasV1(4_984);
    expect(maxGas).toBe(5_981);
    expect(planDecibelAgentGasWithdrawalV1(46_550_000, 100, maxGas ?? 0)).toEqual({
      amountOctas: 46_550_000 - 598_100,
      maxGasAmount: 5_981,
      gasUnitPrice: 100,
    });
    expect(sizeDecibelAgentGasWithdrawalMaxGasV1(0)).toBeNull();
    expect(planDecibelAgentGasWithdrawalV1(46_550_000, 100, 0)).toBeNull();
  });
});

describe('Bot authorization before a session start', () => {
  it('refuses a session once the owner revoked the bot', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bot-authorization-'));
    const keystorePath = join(root, 'agent_key_v1.json');
    const environment = { DECIBEL_AGENT_KEYSTORE_PATH: keystorePath };
    const active = () =>
      Promise.resolve([{ delegatedAccount: AGENT, permissionType: 'TRADING', expiresAtMs: null }]);
    await expect(checkDecibelBotAuthorizationV1(environment, active)).resolves.toBe(
      'BOT_NOT_AUTHORIZED_CONNECT_WALLET',
    );
    createDecibelAgentKeystoreV1(keystorePath, SECRET, () => material);
    await expect(checkDecibelBotAuthorizationV1(environment, active)).resolves.toBeNull();
    await expect(
      checkDecibelBotAuthorizationV1(environment, () => Promise.resolve([])),
    ).resolves.toBe('AGENT_DELEGATION_MISSING');
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

  it('lists the primary subaccount first', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            {
              subaccount_address: SECOND,
              primary_account_address: OWNER,
              is_primary: false,
              custom_label: null,
            },
            {
              subaccount_address: IN_USE,
              primary_account_address: OWNER,
              is_primary: true,
              custom_label: null,
            },
          ]),
        ),
      ),
    );
    const rows = await readDecibelSubaccountsV1({
      tradingHttpUrl: 'https://api.example/decibel',
      owner: OWNER,
      fetchImpl,
    });
    expect(rows.map((row) => row.address)).toEqual([IN_USE, SECOND]);
  });
});

describe('Wallet gas top-up', () => {
  const topUp = (deps: ReturnType<typeof setup>['deps'], body: unknown) =>
    handleDecibelWalletRequestV1('POST', '/api/wallet/topup-gas', deps, { body });

  it('returns a Petra transfer of the typed amount to the bot key, without unlocking it', async () => {
    const { deps, keystore } = setup();
    expect(await topUp(deps, { owner: OWNER, amountOctas: 50_000_000 })).toEqual({
      status: 409,
      body: { error: 'NO_BOT_KEY' },
    });
    createDecibelAgentKeystoreV1(keystore, SECRET, () => material);
    // A wrong secret proves the key is never unlocked: only its public address is read.
    const locked = { ...deps, keystoreSecret: () => 'x'.repeat(40) };
    expect(await topUp(locked, { owner: OWNER, amountOctas: 50_000_000 })).toEqual({
      status: 200,
      body: {
        payload: {
          function: '0x1::aptos_account::transfer',
          typeArguments: [],
          functionArguments: [AGENT, '50000000'],
        },
      },
    });
  });

  it('rejects invalid amounts and wallets outside the whitelist', async () => {
    const { deps, keystore } = setup();
    createDecibelAgentKeystoreV1(keystore, SECRET, () => material);
    for (const amountOctas of [0, -1, 1.5, '50000000', 1_000_000_001, undefined])
      expect(await topUp(deps, { owner: OWNER, amountOctas })).toEqual({
        status: 400,
        body: { error: 'TOPUP_AMOUNT_INVALID' },
      });
    expect(await topUp(deps, { owner: OTHER, amountOctas: 50_000_000 })).toEqual({
      status: 403,
      body: { error: 'WALLET_NOT_WHITELISTED' },
    });
    expect(await topUp(deps, { owner: 'nope', amountOctas: 1 })).toEqual({
      status: 400,
      body: { error: 'WALLET_ADDRESS_INVALID' },
    });
  });
});
