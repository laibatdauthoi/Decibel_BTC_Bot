/**
 * Per-wallet workspace (added 2026-11-17).
 *
 * Every owner wallet (the Petra / primary Aptos account that owns the Decibel subaccount)
 * gets its own data directory, `data/wallets/<owner address>/`, holding its session store
 * (which keeps the newest 30 sessions with PnL and executed volume), execution journal,
 * operator settings, restart-safety snapshot and process logs. Only wallets listed in the
 * whitelist file may run the bot.
 *
 * Market data that is the same for every wallet (BBO recordings, economic evidence) stays in
 * the shared `data/` directory.
 */
import Database from 'better-sqlite3';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { DECIBEL_ACTIVE_SESSION_STATUSES_V1 } from './decibel_lifecycle_statuses_v1.js';

export const DECIBEL_WALLET_WHITELIST_PATH_V1 = 'config/allowed_wallets.json';
export const DECIBEL_WALLET_DATA_ROOT_V1 = 'data/wallets';

/** Lowercase `0x` + 64 hex digits; short Aptos addresses are left-padded. */
export function normalizeDecibelAddressV1(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const match = /^0x([0-9a-f]{1,64})$/.exec(trimmed);
  if (!match) throw new Error('WALLET_ADDRESS_INVALID');
  return `0x${match[1]!.padStart(64, '0')}`;
}

const WhitelistSchema = z.object({
  wallets: z
    .array(
      z.object({
        address: z.string(),
        label: z.string().max(80).optional(),
      }),
    )
    .max(1_000),
});

export type decibel_wallet_whitelist_v1 = ReadonlySet<string>;

/** Reads the whitelist; a missing or invalid file allows nobody (fail closed). */
export function loadDecibelWalletWhitelistV1(
  path: string = DECIBEL_WALLET_WHITELIST_PATH_V1,
): decibel_wallet_whitelist_v1 {
  if (!existsSync(path)) throw new Error('WALLET_WHITELIST_MISSING');
  try {
    const parsed = WhitelistSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    return new Set(parsed.wallets.map((wallet) => normalizeDecibelAddressV1(wallet.address)));
  } catch (error) {
    throw new Error('WALLET_WHITELIST_INVALID', { cause: error });
  }
}

export function assertDecibelWalletWhitelistedV1(
  whitelist: decibel_wallet_whitelist_v1,
  ownerAddress: string,
): void {
  if (!whitelist.has(normalizeDecibelAddressV1(ownerAddress)))
    throw new Error('WALLET_NOT_WHITELISTED');
}

export type decibel_wallet_paths_v1 = Readonly<{
  root: string;
  executionJournal: string;
  sessionStore: string;
  operatorSettings: string;
  restartSafety: string;
  forensics: string;
}>;

export function resolveDecibelWalletPathsV1(
  ownerAddress: string,
  dataRoot: string = DECIBEL_WALLET_DATA_ROOT_V1,
): decibel_wallet_paths_v1 {
  const root = join(dataRoot, normalizeDecibelAddressV1(ownerAddress));
  return Object.freeze({
    root,
    executionJournal: join(root, 'decibel_execution_v1.sqlite'),
    sessionStore: join(root, 'decibel_production_sessions_v1.sqlite'),
    operatorSettings: join(root, 'decibel_operator_settings_v1.json'),
    restartSafety: join(root, 'decibel_restart_safety_v1.json'),
    forensics: join(root, 'production_runtime'),
  });
}

/**
 * Environment for the runtime child: per-wallet paths fill only the variables the operator
 * did not set explicitly, so a custom path in `.env` still wins.
 */
export function buildDecibelWalletEnvironmentV1(
  environment: NodeJS.ProcessEnv,
  ownerAddress: string,
  paths: decibel_wallet_paths_v1,
): NodeJS.ProcessEnv {
  return {
    ...environment,
    DECIBEL_OWNER_ADDRESS: normalizeDecibelAddressV1(ownerAddress),
    DECIBEL_EXECUTION_JOURNAL_PATH:
      environment.DECIBEL_EXECUTION_JOURNAL_PATH ?? paths.executionJournal,
    DECIBEL_PRODUCTION_SESSION_STORE_PATH:
      environment.DECIBEL_PRODUCTION_SESSION_STORE_PATH ?? paths.sessionStore,
    DECIBEL_OPERATOR_SETTINGS_PATH:
      environment.DECIBEL_OPERATOR_SETTINGS_PATH ?? paths.operatorSettings,
    DECIBEL_PRODUCTION_RESTART_SAFETY_PATH:
      environment.DECIBEL_PRODUCTION_RESTART_SAFETY_PATH ?? paths.restartSafety,
    DECIBEL_PRODUCTION_FORENSICS_PATH:
      environment.DECIBEL_PRODUCTION_FORENSICS_PATH ?? paths.forensics,
  };
}

const ObjectCoreSchema = z.object({ data: z.object({ owner: z.string() }) });

/**
 * Owner of a Decibel subaccount, read from its on-chain `0x1::object::ObjectCore`. Needs no
 * key: the subaccount address is public.
 */
export async function readDecibelSubaccountOwnerV1(
  input: Readonly<{
    fullnodeUrl: string;
    subaccountAddress: string;
    nodeApiKey?: string | undefined;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }>,
): Promise<string> {
  const subaccount = normalizeDecibelAddressV1(input.subaccountAddress);
  const url = `${input.fullnodeUrl.replace(/\/+$/, '')}/accounts/${subaccount}/resource/0x1::object::ObjectCore`;
  const response = await (input.fetchImpl ?? fetch)(url, {
    headers: input.nodeApiKey ? { Authorization: `Bearer ${input.nodeApiKey}` } : {},
    signal: AbortSignal.timeout(input.timeoutMs ?? 10_000),
  });
  if (!response.ok) throw new Error(`SUBACCOUNT_OWNER_READ_FAILED:HTTP_${response.status}`);
  const parsed = ObjectCoreSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('SUBACCOUNT_OWNER_RESPONSE_INVALID');
  return normalizeDecibelAddressV1(parsed.data.data.owner);
}

/** Files of the single-wallet layout used before 2026-11-17. */
export type decibel_legacy_paths_v1 = Readonly<{
  executionJournal: string;
  sessionStore: string;
  operatorSettings: string;
  restartSafety: string;
  forensics: string;
}>;

export const DECIBEL_LEGACY_PATHS_V1: decibel_legacy_paths_v1 = Object.freeze({
  executionJournal: 'data/decibel_execution_v1.sqlite',
  sessionStore: 'config/production_state/decibel_production_sessions_v1.sqlite',
  operatorSettings: 'config/production_state/decibel_operator_settings_v1.json',
  restartSafety: 'config/production_state/decibel_restart_safety_v1.json',
  forensics: 'data/production_runtime',
});

export type decibel_legacy_migration_result_v1 = Readonly<
  | { status: 'NOT_NEEDED' | 'MIGRATED'; moved: readonly string[]; backupDir: string | null }
  | {
      status: 'SKIPPED_ACTIVE_SESSION' | 'SKIPPED_FAILED';
      moved: readonly [];
      backupDir: null;
      detail: string;
    }
>;

function hasActiveSession(sessionStorePath: string): boolean {
  const Store = new Database(sessionStorePath, { readonly: true, fileMustExist: true });
  try {
    const table = Store.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='production_sessions_v1'",
    ).get();
    if (!table) return false;
    const placeholders = DECIBEL_ACTIVE_SESSION_STATUSES_V1.map(() => '?').join(',');
    return (
      Store.prepare(
        `SELECT 1 FROM production_sessions_v1 WHERE status IN (${placeholders}) LIMIT 1`,
      ).get(...DECIBEL_ACTIVE_SESSION_STATUSES_V1) !== undefined
    );
  } finally {
    Store.close();
  }
}

/** Folds the WAL into the main file so the database is a single file before it moves. */
function checkpointSqlite(path: string): void {
  const Store = new Database(path, { fileMustExist: true });
  try {
    Store.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    Store.close();
  }
}

const SQLITE_SIDE_FILES_V1 = ['-wal', '-shm'] as const;

/**
 * One-time move of the single-wallet files into the owner's workspace.
 *
 * - Runs only while no session is active (STARTING / RUNNING / STOPPING); otherwise the
 *   runtime keeps the legacy paths for this run and the move is retried next start.
 * - Small files (sessions, settings, restart safety) are first copied to
 *   `data/backups/legacy_<timestamp>/`. The execution journal (GBs) and the log directory
 *   are moved by rename on the same disk, which rewrites nothing.
 * - Any failure (for example a file still open by an old process) rolls back what moved.
 */
export function migrateDecibelLegacyDataV1(
  paths: decibel_wallet_paths_v1,
  options: Readonly<{
    legacy?: decibel_legacy_paths_v1;
    backupRoot?: string;
    now?: number;
  }> = {},
): decibel_legacy_migration_result_v1 {
  const legacy = options.legacy ?? DECIBEL_LEGACY_PATHS_V1;
  const pairs: [keyof decibel_legacy_paths_v1, string, string][] = (
    Object.keys(legacy) as (keyof decibel_legacy_paths_v1)[]
  ).map((key) => [key, legacy[key], paths[key]]);
  const pending = pairs.filter(([, from, to]) => existsSync(from) && !existsSync(to));
  if (pending.length === 0) return { status: 'NOT_NEEDED', moved: [], backupDir: null };
  try {
    if (existsSync(legacy.sessionStore) && hasActiveSession(legacy.sessionStore))
      return {
        status: 'SKIPPED_ACTIVE_SESSION',
        moved: [],
        backupDir: null,
        detail: 'ACTIVE_SESSION_IN_LEGACY_STORE',
      };
    for (const [key, from] of pending)
      if (key === 'executionJournal' || key === 'sessionStore') checkpointSqlite(from);
  } catch (error) {
    return {
      status: 'SKIPPED_FAILED',
      moved: [],
      backupDir: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const backupDir = join(
    options.backupRoot ?? 'data/backups',
    `legacy_${new Date(options.now ?? Date.now()).toISOString().replace(/[:.]/g, '-')}`,
  );
  const moves: [string, string][] = [];
  for (const [key, from, to] of pending) {
    moves.push([from, to]);
    if (key === 'executionJournal' || key === 'sessionStore')
      for (const suffix of SQLITE_SIDE_FILES_V1)
        if (existsSync(from + suffix)) moves.push([from + suffix, to + suffix]);
    if (key === 'operatorSettings' && existsSync(`${from}.audit.jsonl`))
      moves.push([`${from}.audit.jsonl`, `${to}.audit.jsonl`]);
  }
  const done: [string, string][] = [];
  try {
    mkdirSync(backupDir, { recursive: true });
    for (const [key, from] of pending)
      if (key === 'sessionStore' || key === 'operatorSettings' || key === 'restartSafety')
        copyFileSync(from, join(backupDir, from.replace(/[\\/:]/g, '__')));
    for (const [from, to] of moves) {
      mkdirSync(dirname(to), { recursive: true });
      renameSync(from, to);
      done.push([from, to]);
    }
    writeFileSync(
      join(paths.root, 'MIGRATED_FROM_LEGACY.json'),
      `${JSON.stringify({ migratedAt: options.now ?? Date.now(), backupDir: resolve(backupDir), moves }, null, 2)}\n`,
    );
  } catch (error) {
    for (const [from, to] of done.reverse())
      try {
        renameSync(to, from);
      } catch {
        // Best effort: the manifest below names what is where.
      }
    return {
      status: 'SKIPPED_FAILED',
      moved: [],
      backupDir: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  return { status: 'MIGRATED', moved: moves.map(([from]) => from), backupDir };
}

export type decibel_wallet_workspace_v1 = Readonly<{
  ownerAddress: string;
  /** Per-wallet paths, or the legacy single-wallet paths when the move was skipped. */
  pathEnvironment: Readonly<Record<string, string>>;
  migration: decibel_legacy_migration_result_v1;
}>;

/**
 * Launcher step: resolve the owner of the configured subaccount, require it on the
 * whitelist, move the legacy files once, and return the path variables for the runtime.
 * A wallet that cannot be proven (network down, not whitelisted) does not start.
 */
export async function prepareDecibelWalletWorkspaceV1(
  environment: NodeJS.ProcessEnv,
  dependencies: Readonly<{
    fullnodeUrl: string;
    readOwner?: typeof readDecibelSubaccountOwnerV1;
    whitelistPath?: string;
    dataRoot?: string;
    legacy?: decibel_legacy_paths_v1;
    backupRoot?: string;
    attempts?: number;
    retryDelayMs?: number;
  }>,
): Promise<decibel_wallet_workspace_v1> {
  const subaccount = environment.DECIBEL_SUBACCOUNT_ADDRESS?.trim();
  if (!subaccount) throw new Error('WALLET_SUBACCOUNT_REQUIRED');
  const whitelist = loadDecibelWalletWhitelistV1(
    dependencies.whitelistPath ?? DECIBEL_WALLET_WHITELIST_PATH_V1,
  );
  const readOwner = dependencies.readOwner ?? readDecibelSubaccountOwnerV1;
  const attempts = dependencies.attempts ?? 3;
  let ownerAddress: string | null = null;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts && ownerAddress === null; attempt++) {
    try {
      ownerAddress = await readOwner({
        fullnodeUrl: dependencies.fullnodeUrl,
        subaccountAddress: subaccount,
        nodeApiKey: environment.DECIBEL_NODE_API_KEY,
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, dependencies.retryDelayMs ?? 2_000),
        );
    }
  }
  if (ownerAddress === null) throw new Error('WALLET_OWNER_UNRESOLVED', { cause: lastError });
  assertDecibelWalletWhitelistedV1(whitelist, ownerAddress);
  const paths = resolveDecibelWalletPathsV1(ownerAddress, dependencies.dataRoot);
  const legacy = dependencies.legacy ?? DECIBEL_LEGACY_PATHS_V1;
  const migration = migrateDecibelLegacyDataV1(paths, {
    legacy,
    ...(dependencies.backupRoot === undefined ? {} : { backupRoot: dependencies.backupRoot }),
  });
  const effective =
    migration.status === 'SKIPPED_ACTIVE_SESSION' || migration.status === 'SKIPPED_FAILED'
      ? { root: paths.root, ...legacy }
      : paths;
  mkdirSync(paths.root, { recursive: true });
  const built = buildDecibelWalletEnvironmentV1(environment, ownerAddress, effective);
  const keys = [
    'DECIBEL_OWNER_ADDRESS',
    'DECIBEL_EXECUTION_JOURNAL_PATH',
    'DECIBEL_PRODUCTION_SESSION_STORE_PATH',
    'DECIBEL_OPERATOR_SETTINGS_PATH',
    'DECIBEL_PRODUCTION_RESTART_SAFETY_PATH',
    'DECIBEL_PRODUCTION_FORENSICS_PATH',
  ] as const;
  return Object.freeze({
    ownerAddress,
    pathEnvironment: Object.freeze(Object.fromEntries(keys.map((key) => [key, built[key]!]))),
    migration,
  });
}

/**
 * Default path for operator tools run outside the launcher: the wallet named by
 * DECIBEL_OWNER_ADDRESS, else the only wallet workspace, else the legacy path.
 */
export function resolveDecibelToolPathV1(
  environment: NodeJS.ProcessEnv,
  key: keyof decibel_legacy_paths_v1,
  dataRoot: string = DECIBEL_WALLET_DATA_ROOT_V1,
): string {
  const owner = environment.DECIBEL_OWNER_ADDRESS?.trim();
  if (owner) return resolveDecibelWalletPathsV1(owner, dataRoot)[key];
  const wallets = existsSync(dataRoot)
    ? readdirSync(dataRoot).filter((name) => /^0x[0-9a-f]{64}$/.test(name))
    : [];
  if (wallets.length === 1) return resolveDecibelWalletPathsV1(wallets[0]!, dataRoot)[key];
  if (wallets.length > 1) throw new Error('WALLET_OWNER_ADDRESS_REQUIRED');
  return DECIBEL_LEGACY_PATHS_V1[key];
}
