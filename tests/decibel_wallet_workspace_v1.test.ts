import Database from 'better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  assertDecibelWalletWhitelistedV1,
  buildDecibelWalletEnvironmentV1,
  loadDecibelWalletWhitelistV1,
  migrateDecibelLegacyDataV1,
  normalizeDecibelAddressV1,
  prepareDecibelWalletWorkspaceV1,
  readDecibelSubaccountOwnerV1,
  resolveDecibelToolPathV1,
  resolveDecibelWalletPathsV1,
  type decibel_legacy_paths_v1,
} from '../src/decibel_wallet_workspace_v1.js';

const OWNER = `0x${'ab'.repeat(32)}`;
const OTHER = `0x${'cd'.repeat(32)}`;
const SUBACCOUNT = `0x${'12'.repeat(32)}`;

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'wallet-workspace-'));
  const legacy: decibel_legacy_paths_v1 = {
    executionJournal: join(root, 'data', 'decibel_execution_v1.sqlite'),
    sessionStore: join(root, 'state', 'decibel_production_sessions_v1.sqlite'),
    operatorSettings: join(root, 'state', 'decibel_operator_settings_v1.json'),
    restartSafety: join(root, 'state', 'decibel_restart_safety_v1.json'),
    forensics: join(root, 'data', 'production_runtime'),
  };
  mkdirSync(join(root, 'data', 'production_runtime'), { recursive: true });
  mkdirSync(join(root, 'state'), { recursive: true });
  return {
    root,
    legacy,
    dataRoot: join(root, 'data', 'wallets'),
    backupRoot: join(root, 'backups'),
  };
}

function writeLegacy(legacy: decibel_legacy_paths_v1, sessionStatus: string) {
  const Journal = new Database(legacy.executionJournal);
  Journal.pragma('journal_mode = WAL');
  Journal.exec("CREATE TABLE intents(id TEXT); INSERT INTO intents VALUES ('intent-1')");
  Journal.close();
  const Sessions = new Database(legacy.sessionStore);
  Sessions.pragma('journal_mode = WAL');
  Sessions.exec('CREATE TABLE production_sessions_v1(session_id TEXT, status TEXT)');
  Sessions.prepare('INSERT INTO production_sessions_v1 VALUES (?, ?)').run(
    'session-1',
    sessionStatus,
  );
  Sessions.close();
  writeFileSync(legacy.operatorSettings, '{"revision":3}');
  writeFileSync(`${legacy.operatorSettings}.audit.jsonl`, '{}\n');
  writeFileSync(legacy.restartSafety, '{"safeToRestart":true}');
  writeFileSync(join(legacy.forensics, 'stdout.log'), 'line\n');
}

describe('Wallet addresses and whitelist', () => {
  it('normalizes addresses and rejects anything else', () => {
    expect(normalizeDecibelAddressV1(` ${OWNER.toUpperCase().replace('0X', '0x')} `)).toBe(OWNER);
    expect(normalizeDecibelAddressV1('0x1')).toBe(`0x${'0'.repeat(63)}1`);
    for (const bad of ['', 'ab'.repeat(32), `0x${'g'.repeat(64)}`, `0x${'a'.repeat(65)}`])
      expect(() => normalizeDecibelAddressV1(bad)).toThrow('WALLET_ADDRESS_INVALID');
  });

  it('fails closed on a missing or invalid whitelist and admits only listed owners', () => {
    const { root } = makeRoot();
    const path = join(root, 'allowed_wallets.json');
    expect(() => loadDecibelWalletWhitelistV1(path)).toThrow('WALLET_WHITELIST_MISSING');
    writeFileSync(path, '{"wallets":[{"address":"not-an-address"}]}');
    expect(() => loadDecibelWalletWhitelistV1(path)).toThrow('WALLET_WHITELIST_INVALID');
    writeFileSync(
      path,
      JSON.stringify({
        wallets: [{ address: OWNER.toUpperCase().replace('0X', '0x'), label: 'Me' }],
      }),
    );
    const whitelist = loadDecibelWalletWhitelistV1(path);
    expect(() => assertDecibelWalletWhitelistedV1(whitelist, OWNER)).not.toThrow();
    expect(() => assertDecibelWalletWhitelistedV1(whitelist, OTHER)).toThrow(
      'WALLET_NOT_WHITELISTED',
    );
  });

  it('keeps one workspace per owner and lets explicit .env paths win', () => {
    const paths = resolveDecibelWalletPathsV1(OWNER, 'data/wallets');
    expect(paths.sessionStore).toBe(
      join('data/wallets', OWNER, 'decibel_production_sessions_v1.sqlite'),
    );
    expect(resolveDecibelWalletPathsV1(OTHER, 'data/wallets').root).not.toBe(paths.root);
    const environment = buildDecibelWalletEnvironmentV1(
      { DECIBEL_EXECUTION_JOURNAL_PATH: 'custom.sqlite' },
      OWNER,
      paths,
    );
    expect(environment).toMatchObject({
      DECIBEL_OWNER_ADDRESS: OWNER,
      DECIBEL_EXECUTION_JOURNAL_PATH: 'custom.sqlite',
      DECIBEL_PRODUCTION_SESSION_STORE_PATH: paths.sessionStore,
      DECIBEL_OPERATOR_SETTINGS_PATH: paths.operatorSettings,
      DECIBEL_PRODUCTION_FORENSICS_PATH: paths.forensics,
    });
  });
});

describe('Subaccount owner lookup', () => {
  it('reads the owner from the on-chain ObjectCore without any key', async () => {
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      expect(String(url)).toBe(
        `https://node.example/v1/accounts/${SUBACCOUNT}/resource/0x1::object::ObjectCore`,
      );
      expect(init?.headers).toEqual({ Authorization: 'Bearer node-key' });
      return Promise.resolve(
        new Response(JSON.stringify({ data: { owner: OWNER.toUpperCase().replace('0X', '0x') } })),
      );
    });
    await expect(
      readDecibelSubaccountOwnerV1({
        fullnodeUrl: 'https://node.example/v1/',
        subaccountAddress: SUBACCOUNT,
        nodeApiKey: 'node-key',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe(OWNER);
  });

  it('rejects HTTP errors and malformed responses', async () => {
    const respond = (body: string, status = 200) =>
      (() => Promise.resolve(new Response(body, { status }))) as typeof fetch;
    const base = { fullnodeUrl: 'https://node.example/v1', subaccountAddress: SUBACCOUNT };
    await expect(
      readDecibelSubaccountOwnerV1({ ...base, fetchImpl: respond('{}', 404) }),
    ).rejects.toThrow('SUBACCOUNT_OWNER_READ_FAILED:HTTP_404');
    await expect(
      readDecibelSubaccountOwnerV1({ ...base, fetchImpl: respond('{"data":{}}') }),
    ).rejects.toThrow('SUBACCOUNT_OWNER_RESPONSE_INVALID');
  });
});

describe('Legacy data migration', () => {
  it('moves the single-wallet files into the owner workspace and backs up small files', () => {
    const { legacy, dataRoot, backupRoot } = makeRoot();
    writeLegacy(legacy, 'ENDED');
    const paths = resolveDecibelWalletPathsV1(OWNER, dataRoot);
    const result = migrateDecibelLegacyDataV1(paths, { legacy, backupRoot, now: 0 });
    expect(result.status).toBe('MIGRATED');
    for (const key of Object.keys(legacy) as (keyof decibel_legacy_paths_v1)[]) {
      expect(existsSync(legacy[key])).toBe(false);
      expect(existsSync(paths[key])).toBe(true);
    }
    expect(existsSync(`${paths.operatorSettings}.audit.jsonl`)).toBe(true);
    expect(readFileSync(join(paths.forensics, 'stdout.log'), 'utf8')).toBe('line\n');
    // The WAL was folded in before the move: the data is in the moved main file.
    const Journal = new Database(paths.executionJournal, { readonly: true });
    expect(Journal.prepare('SELECT id FROM intents').get()).toEqual({ id: 'intent-1' });
    Journal.close();
    expect(result.backupDir).not.toBeNull();
    expect(existsSync(join(paths.root, 'MIGRATED_FROM_LEGACY.json'))).toBe(true);
    expect(migrateDecibelLegacyDataV1(paths, { legacy, backupRoot }).status).toBe('NOT_NEEDED');
  });

  it.each(['STARTING', 'RUNNING', 'STOPPING'])(
    'never moves anything while a session is %s',
    (status) => {
      const { legacy, dataRoot, backupRoot } = makeRoot();
      writeLegacy(legacy, status);
      const paths = resolveDecibelWalletPathsV1(OWNER, dataRoot);
      expect(migrateDecibelLegacyDataV1(paths, { legacy, backupRoot })).toMatchObject({
        status: 'SKIPPED_ACTIVE_SESSION',
      });
      for (const key of Object.keys(legacy) as (keyof decibel_legacy_paths_v1)[])
        expect(existsSync(legacy[key])).toBe(true);
      expect(existsSync(backupRoot)).toBe(false);
    },
  );
});

describe('Launcher workspace step', () => {
  const setup = (sessionStatus: string) => {
    const made = makeRoot();
    writeLegacy(made.legacy, sessionStatus);
    const whitelistPath = join(made.root, 'allowed_wallets.json');
    writeFileSync(whitelistPath, JSON.stringify({ wallets: [{ address: OWNER }] }));
    return { ...made, whitelistPath };
  };

  it('runs the runtime on the owner workspace after migrating', async () => {
    const { legacy, dataRoot, backupRoot, whitelistPath } = setup('ENDED');
    const workspace = await prepareDecibelWalletWorkspaceV1(
      { DECIBEL_SUBACCOUNT_ADDRESS: SUBACCOUNT },
      {
        fullnodeUrl: 'https://node.example/v1',
        readOwner: () => Promise.resolve(OWNER),
        whitelistPath,
        dataRoot,
        legacy,
        backupRoot,
      },
    );
    const paths = resolveDecibelWalletPathsV1(OWNER, dataRoot);
    expect(workspace.migration.status).toBe('MIGRATED');
    expect(workspace.pathEnvironment).toEqual({
      DECIBEL_OWNER_ADDRESS: OWNER,
      DECIBEL_EXECUTION_JOURNAL_PATH: paths.executionJournal,
      DECIBEL_PRODUCTION_SESSION_STORE_PATH: paths.sessionStore,
      DECIBEL_OPERATOR_SETTINGS_PATH: paths.operatorSettings,
      DECIBEL_PRODUCTION_RESTART_SAFETY_PATH: paths.restartSafety,
      DECIBEL_PRODUCTION_FORENSICS_PATH: paths.forensics,
    });
  });

  it('keeps the legacy files in use while a session is active', async () => {
    const { legacy, dataRoot, backupRoot, whitelistPath } = setup('RUNNING');
    const workspace = await prepareDecibelWalletWorkspaceV1(
      { DECIBEL_SUBACCOUNT_ADDRESS: SUBACCOUNT },
      {
        fullnodeUrl: 'https://node.example/v1',
        readOwner: () => Promise.resolve(OWNER),
        whitelistPath,
        dataRoot,
        legacy,
        backupRoot,
      },
    );
    expect(workspace.migration.status).toBe('SKIPPED_ACTIVE_SESSION');
    expect(workspace.pathEnvironment.DECIBEL_EXECUTION_JOURNAL_PATH).toBe(legacy.executionJournal);
    expect(workspace.pathEnvironment.DECIBEL_PRODUCTION_SESSION_STORE_PATH).toBe(
      legacy.sessionStore,
    );
  });

  it('refuses a wallet that is not whitelisted or cannot be proven', async () => {
    const { legacy, dataRoot, backupRoot, whitelistPath } = setup('ENDED');
    const base = {
      fullnodeUrl: 'https://node.example/v1',
      whitelistPath,
      dataRoot,
      legacy,
      backupRoot,
      retryDelayMs: 0,
    };
    await expect(
      prepareDecibelWalletWorkspaceV1(
        { DECIBEL_SUBACCOUNT_ADDRESS: SUBACCOUNT },
        { ...base, readOwner: () => Promise.resolve(OTHER) },
      ),
    ).rejects.toThrow('WALLET_NOT_WHITELISTED');
    const readOwner = vi.fn(() => Promise.reject(new Error('NETWORK_DOWN')));
    await expect(
      prepareDecibelWalletWorkspaceV1(
        { DECIBEL_SUBACCOUNT_ADDRESS: SUBACCOUNT },
        { ...base, readOwner },
      ),
    ).rejects.toThrow('WALLET_OWNER_UNRESOLVED');
    expect(readOwner).toHaveBeenCalledTimes(3);
    await expect(
      prepareDecibelWalletWorkspaceV1({}, { ...base, readOwner: () => Promise.resolve(OWNER) }),
    ).rejects.toThrow('WALLET_SUBACCOUNT_REQUIRED');
    // Nothing moved for a refused wallet.
    expect(existsSync(legacy.executionJournal)).toBe(true);
  });
});

describe('Operator tool paths', () => {
  it('uses the named wallet, else the only workspace, else the legacy path', () => {
    const { dataRoot } = makeRoot();
    expect(resolveDecibelToolPathV1({}, 'executionJournal', dataRoot)).toBe(
      'data/decibel_execution_v1.sqlite',
    );
    mkdirSync(join(dataRoot, OWNER), { recursive: true });
    expect(resolveDecibelToolPathV1({}, 'sessionStore', dataRoot)).toBe(
      resolveDecibelWalletPathsV1(OWNER, dataRoot).sessionStore,
    );
    mkdirSync(join(dataRoot, OTHER), { recursive: true });
    expect(() => resolveDecibelToolPathV1({}, 'sessionStore', dataRoot)).toThrow(
      'WALLET_OWNER_ADDRESS_REQUIRED',
    );
    expect(
      resolveDecibelToolPathV1({ DECIBEL_OWNER_ADDRESS: OTHER }, 'sessionStore', dataRoot),
    ).toBe(resolveDecibelWalletPathsV1(OTHER, dataRoot).sessionStore);
  });
});
