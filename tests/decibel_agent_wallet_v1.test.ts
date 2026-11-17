import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createDecibelAgentKeystoreV1,
  generateDecibelAgentKeyV1,
  readDecibelAgentKeystoreV1,
  resolveDecibelKeystoreSecretV1,
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
import { readDecibelAptBalanceOctasV1 } from '../src/decibel_wallet_routes_v1.js';

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
  const active = () =>
    Promise.resolve([{ delegatedAccount: AGENT, permissionType: 'TRADING', expiresAtMs: null }]);

  it('signs only with the bot key while the wallet authorization is active', async () => {
    const path = keystorePath();
    createDecibelAgentKeystoreV1(path, SECRET, () => material);
    const environment = { DECIBEL_AGENT_KEYSTORE_PATH: path, DECIBEL_KEYSTORE_SECRET: SECRET };
    await expect(resolveDecibelExecutorSignerV1(environment, active, now)).resolves.toEqual({
      privateKeyHex: material.privateKeyHex,
      agentAddress: AGENT,
    });
    await expect(
      resolveDecibelExecutorSignerV1(environment, () => Promise.resolve([]), now),
    ).rejects.toThrow('AGENT_DELEGATION_MISSING');
  });

  it('has no private-key fallback: no bot key means no session', async () => {
    const readDelegations = vi.fn(active);
    await expect(
      resolveDecibelExecutorSignerV1(
        { DECIBEL_AGENT_KEYSTORE_PATH: keystorePath() },
        readDelegations,
        now,
      ),
    ).rejects.toThrow('BOT_NOT_AUTHORIZED_CONNECT_WALLET');
    expect(readDelegations).not.toHaveBeenCalled();
  });

  it('unlocks with the local secret file when DECIBEL_KEYSTORE_SECRET is not set', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-secret-'));
    const secretPath = join(root, 'keystore_secret_v1.key');
    const environment = { DECIBEL_KEYSTORE_SECRET_PATH: secretPath };
    const secret = resolveDecibelKeystoreSecretV1(environment, { create: true })!;
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(resolveDecibelKeystoreSecretV1(environment, { create: false })).toBe(secret);
    expect(
      resolveDecibelKeystoreSecretV1(
        { DECIBEL_KEYSTORE_SECRET_PATH: join(root, 'missing.key') },
        { create: false },
      ),
    ).toBeUndefined();
    const path = join(root, 'agent_key_v1.json');
    createDecibelAgentKeystoreV1(path, secret, () => material);
    await expect(
      resolveDecibelExecutorSignerV1(
        { ...environment, DECIBEL_AGENT_KEYSTORE_PATH: path },
        active,
        now,
      ),
    ).resolves.toMatchObject({ agentAddress: AGENT });
  });
});

describe('APT balance', () => {
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
