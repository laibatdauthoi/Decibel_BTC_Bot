import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolveDecibelExecutorSignerV1 } from '../src/decibel_executor_signer_v1.js';
import {
  handleDecibelWalletRequestV1,
  readDecibelSubaccountsV1,
} from '../src/decibel_wallet_routes_v1.js';
import { readDecibelSelectedSubaccountV1 } from '../src/decibel_wallet_workspace_v1.js';

const OWNER = `0x${'aa'.repeat(32)}`;
const OTHER = `0x${'bb'.repeat(32)}`;
const IN_USE = `0x${'01'.repeat(32)}`;
const SECOND = `0x${'02'.repeat(32)}`;

function dependencies(selectionPath: string, owners: Record<string, string> = {}) {
  return {
    environment: { DECIBEL_SUBACCOUNT_ADDRESS: IN_USE } as NodeJS.ProcessEnv,
    packageAddress: `0x${'dd'.repeat(32)}`,
    now: () => 1_800_000_000_000,
    readDelegations: () => Promise.resolve([]),
    readAptBalanceOctas: () => Promise.resolve(0),
    generateAgentKey: () => Promise.reject(new Error('UNUSED')),
    readSubaccounts: vi.fn(() =>
      Promise.resolve([
        { address: IN_USE, label: null, isPrimary: true },
        { address: SECOND, label: 'Farm', isPrimary: false },
      ]),
    ),
    readSubaccountOwner: (subaccount: string) => Promise.resolve(owners[subaccount] ?? OTHER),
    isWhitelisted: (owner: string) => owner === OWNER,
    selectionPath,
  };
}

describe('Wallet subaccount routes', () => {
  it('lists the subaccounts of a whitelisted wallet and marks the one in use', async () => {
    const deps = dependencies(join(mkdtempSync(join(tmpdir(), 'subaccount-')), 'selected.json'));
    const result = await handleDecibelWalletRequestV1('GET', '/api/wallet/subaccounts', deps, {
      query: new URLSearchParams({ owner: OWNER }),
    });
    expect(result).toEqual({
      status: 200,
      body: {
        owner: OWNER,
        whitelisted: true,
        inUse: IN_USE,
        subaccounts: [
          { address: IN_USE, label: null, isPrimary: true },
          { address: SECOND, label: 'Farm', isPrimary: false },
        ],
      },
    });
  });

  it('shows nothing for a wallet that is not whitelisted', async () => {
    const deps = dependencies(join(mkdtempSync(join(tmpdir(), 'subaccount-')), 'selected.json'));
    const result = await handleDecibelWalletRequestV1('GET', '/api/wallet/subaccounts', deps, {
      query: new URLSearchParams({ owner: OTHER }),
    });
    expect(result?.body).toMatchObject({ whitelisted: false, subaccounts: [] });
    expect(deps.readSubaccounts).not.toHaveBeenCalled();
  });

  it('saves another owned subaccount for the next start and refuses foreign ones', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'subaccount-')), 'selected.json');
    const deps = dependencies(path, { [SECOND]: OWNER, [IN_USE]: OWNER });
    const choose = (owner: string, subaccount: string) =>
      handleDecibelWalletRequestV1('POST', '/api/wallet/subaccount', deps, {
        body: { owner, subaccount },
      });
    expect(await choose(OWNER, IN_USE)).toEqual({
      status: 200,
      body: { status: 'IN_USE', subaccount: IN_USE },
    });
    expect(existsSync(path)).toBe(false);
    expect(await choose(OWNER, SECOND)).toEqual({
      status: 200,
      body: { status: 'RESTART_REQUIRED', subaccount: SECOND },
    });
    expect(readDecibelSelectedSubaccountV1(path)).toEqual({
      subaccount: SECOND,
      owner: OWNER,
      selectedAt: 1_800_000_000_000,
    });
    expect((await choose(OWNER, `0x${'03'.repeat(32)}`))?.body).toEqual({
      error: 'SUBACCOUNT_NOT_OWNED',
    });
    expect((await choose(OTHER, SECOND))?.body).toEqual({ error: 'WALLET_NOT_WHITELISTED' });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ subaccount: SECOND });
  });

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

describe('Legacy private key on a chosen subaccount', () => {
  const key = `0x${'11'.repeat(32)}`;
  const environment = { DECIBEL_PRIVATE_KEY: key, DECIBEL_OWNER_ADDRESS: OWNER };

  it('signs when the key is the owner or an active delegate', async () => {
    await expect(
      resolveDecibelExecutorSignerV1(
        environment,
        () => Promise.resolve([]),
        Date.now,
        () => OWNER,
      ),
    ).resolves.toMatchObject({ mode: 'PRIVATE_KEY' });
    await expect(
      resolveDecibelExecutorSignerV1(
        environment,
        () =>
          Promise.resolve([
            { delegatedAccount: OTHER, permissionType: 'TRADING', expiresAtMs: null },
          ]),
        Date.now,
        () => OTHER,
      ),
    ).resolves.toMatchObject({ mode: 'PRIVATE_KEY' });
  });

  it('refuses a key that cannot trade the subaccount', async () => {
    await expect(
      resolveDecibelExecutorSignerV1(
        environment,
        () => Promise.resolve([]),
        Date.now,
        () => OTHER,
      ),
    ).rejects.toThrow('PRIVATE_KEY_NOT_AUTHORIZED_FOR_SUBACCOUNT');
  });
});
