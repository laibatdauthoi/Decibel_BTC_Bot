import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createDecibelAgentKeystoreV1,
  generateDecibelAgentKeyV1,
  readDecibelAgentKeystoreV1,
  unlockDecibelAgentKeystoreV1,
} from '../src/decibel_agent_keystore_v1.js';
import {
  assessDecibelAgentDelegationV1,
  buildDecibelDelegationPayloadV1,
  buildDecibelGasTopUpPayloadV1,
  buildDecibelRevokePayloadV1,
  readDecibelDelegationsV1,
} from '../src/decibel_agent_delegation_v1.js';
import { resolveDecibelExecutorSignerV1 } from '../src/decibel_executor_signer_v1.js';
import {
  handleDecibelWalletRequestV1,
  readDecibelAptBalanceOctasV1,
} from '../src/decibel_wallet_routes_v1.js';

const SECRET = 'correct horse battery staple';
const AGENT = `0x${'aa'.repeat(32)}`;
const OWNER = `0x${'bb'.repeat(32)}`;
const SUBACCOUNT = `0x${'cc'.repeat(32)}`;
const PACKAGE = `0x${'dd'.repeat(32)}`;
const material = {
  privateKeyHex: `0x${'11'.repeat(32)}`,
  publicKeyHex: `0x${'22'.repeat(32)}`,
  address: AGENT,
};
const DAY = 24 * 60 * 60 * 1000;

const keystorePath = () => join(mkdtempSync(join(tmpdir(), 'agent-key-')), 'agent_key_v1.json');

describe('Agent keystore', () => {
  it('encrypts the key at rest and unlocks only with the secret', () => {
    const path = keystorePath();
    createDecibelAgentKeystoreV1(path, SECRET, () => material, 5);
    const raw = readFileSync(path, 'utf8');
    expect(raw).not.toContain('11'.repeat(32));
    expect(readDecibelAgentKeystoreV1(path)).toMatchObject({ address: AGENT, createdAt: 5 });
    expect(unlockDecibelAgentKeystoreV1(path, SECRET)).toEqual(material);
    expect(() => unlockDecibelAgentKeystoreV1(path, `${SECRET}!`)).toThrow(
      'AGENT_KEYSTORE_UNLOCK_FAILED',
    );
    expect(() => unlockDecibelAgentKeystoreV1(path, undefined)).toThrow(
      'AGENT_KEYSTORE_SECRET_REQUIRED',
    );
  });

  it('never overwrites a key and rejects short secrets or tampering', () => {
    const path = keystorePath();
    expect(() => createDecibelAgentKeystoreV1(path, 'short', () => material)).toThrow(
      'AGENT_KEYSTORE_SECRET_TOO_SHORT',
    );
    createDecibelAgentKeystoreV1(path, SECRET, () => material);
    expect(() => createDecibelAgentKeystoreV1(path, SECRET, () => material)).toThrow(
      'AGENT_KEYSTORE_EXISTS',
    );
    const record = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    // Swapping the address (authenticated data) breaks decryption.
    writeFileSync(path, JSON.stringify({ ...record, address: OWNER }));
    expect(() => unlockDecibelAgentKeystoreV1(path, SECRET)).toThrow(
      'AGENT_KEYSTORE_UNLOCK_FAILED',
    );
  });

  it('generates a real Ed25519 agent key', async () => {
    const generated = await generateDecibelAgentKeyV1();
    expect(generated.privateKeyHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(generated.publicKeyHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(generated.address).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe('Agent delegation', () => {
  const now = 1_800_000_000_000;
  const delegation = (expiresAtMs: number | null) => [
    { delegatedAccount: AGENT, permissionType: 'TRADING', expiresAtMs },
  ];

  it('classifies the agent delegation', () => {
    expect(assessDecibelAgentDelegationV1([], AGENT, now).status).toBe('MISSING');
    expect(assessDecibelAgentDelegationV1(delegation(null), AGENT, now).status).toBe('ACTIVE');
    expect(assessDecibelAgentDelegationV1(delegation(now + 10 * DAY), AGENT, now).status).toBe(
      'ACTIVE',
    );
    expect(assessDecibelAgentDelegationV1(delegation(now + DAY), AGENT, now).status).toBe(
      'EXPIRING_SOON',
    );
    expect(assessDecibelAgentDelegationV1(delegation(now), AGENT, now).status).toBe('EXPIRED');
    expect(
      assessDecibelAgentDelegationV1(
        [{ delegatedAccount: OWNER, permissionType: 'TRADING', expiresAtMs: null }],
        AGENT,
        now,
      ).status,
    ).toBe('MISSING');
  });

  it('reads delegations from the Decibel REST API', async () => {
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      expect(url).toBe(`https://api.example/decibel/api/v1/delegations?subaccount=${SUBACCOUNT}`);
      expect(init?.headers).toEqual({ Authorization: 'Bearer key' });
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              delegated_account: AGENT.toUpperCase().replace('0X', '0x'),
              permission_type: 'TRADING',
              expiration_time_s: 1_800_000_100,
            },
          ]),
        ),
      );
    });
    await expect(
      readDecibelDelegationsV1({
        tradingHttpUrl: 'https://api.example/decibel/',
        subaccountAddress: SUBACCOUNT,
        apiKey: 'key',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual([
      { delegatedAccount: AGENT, permissionType: 'TRADING', expiresAtMs: 1_800_000_100_000 },
    ]);
  });

  it('builds the Petra payloads with the exact entry functions', () => {
    expect(
      buildDecibelDelegationPayloadV1({
        packageAddress: PACKAGE,
        subaccountAddress: SUBACCOUNT,
        agentAddress: AGENT,
        now: 1_800_000_000_500,
      }),
    ).toEqual({
      function: `${PACKAGE}::dex_accounts_entry::delegate_trading_to_for_subaccount`,
      typeArguments: [],
      functionArguments: [SUBACCOUNT, AGENT, String(1_800_000_000 + 30 * 86_400)],
    });
    expect(
      buildDecibelRevokePayloadV1({
        packageAddress: PACKAGE,
        subaccountAddress: SUBACCOUNT,
        agentAddress: AGENT,
      }),
    ).toEqual({
      function: `${PACKAGE}::dex_accounts_entry::revoke_delegation`,
      typeArguments: [],
      functionArguments: [SUBACCOUNT, AGENT],
    });
    expect(buildDecibelGasTopUpPayloadV1(AGENT)).toEqual({
      function: '0x1::aptos_account::transfer',
      typeArguments: [],
      functionArguments: [AGENT, '50000000'],
    });
    expect(() => buildDecibelGasTopUpPayloadV1(AGENT, 11 * 100_000_000)).toThrow(
      'GAS_TOPUP_AMOUNT_INVALID',
    );
  });
});

describe('Executor signer', () => {
  const now = () => 1_800_000_000_000;

  it('uses the legacy private key when no agent is set up', async () => {
    const readDelegations = vi.fn(() => Promise.resolve([]));
    await expect(
      resolveDecibelExecutorSignerV1(
        { DECIBEL_PRIVATE_KEY: material.privateKeyHex },
        readDelegations,
        now,
      ),
    ).resolves.toEqual({
      mode: 'PRIVATE_KEY',
      privateKeyHex: material.privateKeyHex,
      agentAddress: null,
    });
    expect(readDelegations).not.toHaveBeenCalled();
    await expect(resolveDecibelExecutorSignerV1({}, readDelegations, now)).rejects.toThrow(
      'PRODUCTION_EXECUTOR_SIGNER_REQUIRED',
    );
  });

  it('signs with the agent only while it is delegated, never falling back', async () => {
    const path = keystorePath();
    createDecibelAgentKeystoreV1(path, SECRET, () => material);
    const environment = {
      DECIBEL_AGENT_KEYSTORE_PATH: path,
      DECIBEL_KEYSTORE_SECRET: SECRET,
      DECIBEL_PRIVATE_KEY: `0x${'33'.repeat(32)}`,
    };
    const active = () =>
      Promise.resolve([{ delegatedAccount: AGENT, permissionType: 'TRADING', expiresAtMs: null }]);
    await expect(resolveDecibelExecutorSignerV1(environment, active, now)).resolves.toEqual({
      mode: 'AGENT',
      privateKeyHex: material.privateKeyHex,
      agentAddress: AGENT,
    });
    await expect(
      resolveDecibelExecutorSignerV1(environment, () => Promise.resolve([]), now),
    ).rejects.toThrow('AGENT_DELEGATION_MISSING');
    await expect(
      resolveDecibelExecutorSignerV1(
        { ...environment, DECIBEL_KEYSTORE_SECRET: undefined },
        active,
        now,
      ),
    ).rejects.toThrow('AGENT_KEYSTORE_SECRET_REQUIRED');
  });
});

describe('Wallet routes', () => {
  const dependencies = (environment: NodeJS.ProcessEnv) => ({
    environment,
    packageAddress: PACKAGE,
    now: () => 1_800_000_000_000,
    readDelegations: vi.fn(() => Promise.resolve([])),
    readAptBalanceOctas: vi.fn(() => Promise.resolve(12_345)),
    generateAgentKey: vi.fn(() => Promise.resolve(material)),
  });

  it('reports the legacy signer and no payloads before an agent exists', async () => {
    const result = await handleDecibelWalletRequestV1(
      'GET',
      '/api/wallet',
      dependencies({
        DECIBEL_PRIVATE_KEY: 'never-returned',
        DECIBEL_SUBACCOUNT_ADDRESS: SUBACCOUNT,
        DECIBEL_AGENT_KEYSTORE_PATH: keystorePath(),
        DECIBEL_OWNER_ADDRESS: OWNER,
      }),
    );
    expect(result?.status).toBe(200);
    expect(result?.body).toMatchObject({
      signerMode: 'PRIVATE_KEY',
      agent: null,
      payloads: null,
      ownerAddress: OWNER,
    });
    expect(JSON.stringify(result?.body)).not.toContain('never-returned');
  });

  it('creates the agent once and returns the delegation payloads, never the key', async () => {
    const environment = {
      DECIBEL_SUBACCOUNT_ADDRESS: SUBACCOUNT,
      DECIBEL_AGENT_KEYSTORE_PATH: keystorePath(),
      DECIBEL_KEYSTORE_SECRET: SECRET,
    };
    const created = await handleDecibelWalletRequestV1(
      'POST',
      '/api/wallet/agent',
      dependencies(environment),
    );
    expect(created?.status).toBe(201);
    expect(created?.body).toMatchObject({
      signerMode: 'AGENT',
      agent: { address: AGENT, aptBalanceOctas: 12_345 },
      delegation: { status: 'MISSING' },
      payloads: { delegate: { functionArguments: [SUBACCOUNT, AGENT, expect.any(String)] } },
    });
    expect(JSON.stringify(created?.body)).not.toContain('11'.repeat(32));
    const again = await handleDecibelWalletRequestV1(
      'POST',
      '/api/wallet/agent',
      dependencies(environment),
    );
    expect(again).toEqual({ status: 409, body: { error: 'AGENT_KEYSTORE_EXISTS' } });
    expect(
      await handleDecibelWalletRequestV1(
        'POST',
        '/api/wallet/agent',
        dependencies({
          ...environment,
          DECIBEL_AGENT_KEYSTORE_PATH: keystorePath(),
          DECIBEL_KEYSTORE_SECRET: undefined,
        }),
      ),
    ).toEqual({ status: 400, body: { error: 'AGENT_KEYSTORE_SECRET_REQUIRED' } });
  });

  it('reads the agent APT balance through the coin::balance view', async () => {
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      expect(url).toBe('https://node.example/v1/view');
      expect(JSON.parse(init?.body as string)).toEqual({
        function: '0x1::coin::balance',
        type_arguments: ['0x1::aptos_coin::AptosCoin'],
        arguments: [AGENT],
      });
      return Promise.resolve(new Response('["50000000"]'));
    });
    await expect(
      readDecibelAptBalanceOctasV1({
        fullnodeUrl: 'https://node.example/v1',
        address: AGENT,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe(50_000_000);
  });
});
