/**
 * Edits the wallet whitelist (`config/allowed_wallets.json`) for the `npm run wl` command.
 *
 * The whitelist is the boundary of who may use the bot, so it is only edited from the machine
 * that runs it, never over the web. A write keeps a `.bak` copy and replaces the file in one
 * rename after the new content has been validated, so a broken file (which locks everyone out)
 * is never left behind. The running bot re-reads the file on every sign-in.
 */
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import {
  loadDecibelWalletWhitelistV1,
  normalizeDecibelAddressV1,
} from './decibel_wallet_workspace_v1.js';

export type decibel_whitelist_entry_v1 = Readonly<{ address: string; label?: string }>;

export const DECIBEL_WHITELIST_LABEL_MAX_V1 = 80;

const EntriesSchema = z.object({
  wallets: z.array(
    z.object({
      address: z.string(),
      label: z.string().max(DECIBEL_WHITELIST_LABEL_MAX_V1).optional(),
    }),
  ),
});

/** Entries in file order; a missing file is an empty list, an invalid one is an error. */
export function readDecibelWhitelistEntriesV1(path: string): readonly decibel_whitelist_entry_v1[] {
  if (!existsSync(path)) return Object.freeze([]);
  let parsed: z.infer<typeof EntriesSchema>;
  try {
    parsed = EntriesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    throw new Error('WALLET_WHITELIST_INVALID', { cause: error });
  }
  return Object.freeze(
    parsed.wallets.map((wallet) =>
      Object.freeze({
        address: normalizeDecibelAddressV1(wallet.address),
        ...(wallet.label ? { label: wallet.label } : {}),
      }),
    ),
  );
}

export type decibel_whitelist_change_v1 = Readonly<{
  entries: readonly decibel_whitelist_entry_v1[];
  changed: boolean;
  entry: decibel_whitelist_entry_v1 | null;
}>;

/** Adds a wallet; an address already listed is left as it is (`changed: false`). */
export function addDecibelWhitelistEntryV1(
  entries: readonly decibel_whitelist_entry_v1[],
  address: string,
  label?: string,
): decibel_whitelist_change_v1 {
  const normalized = normalizeDecibelAddressV1(address);
  const existing = entries.find((entry) => entry.address === normalized);
  if (existing) return { entries, changed: false, entry: existing };
  const trimmed = label?.trim() ?? '';
  if (trimmed.length > DECIBEL_WHITELIST_LABEL_MAX_V1) throw new Error('WALLET_LABEL_TOO_LONG');
  const entry = Object.freeze({ address: normalized, ...(trimmed ? { label: trimmed } : {}) });
  return { entries: Object.freeze([...entries, entry]), changed: true, entry };
}

/** Removes a wallet chosen by its list number (1-based) or its address. */
export function removeDecibelWhitelistEntryV1(
  entries: readonly decibel_whitelist_entry_v1[],
  selector: string,
): decibel_whitelist_change_v1 {
  const value = selector.trim();
  let index = -1;
  if (/^\d+$/.test(value)) index = Number(value) - 1;
  else {
    const normalized = normalizeDecibelAddressV1(value);
    index = entries.findIndex((entry) => entry.address === normalized);
  }
  const entry = entries[index];
  if (index < 0 || entry === undefined) return { entries, changed: false, entry: null };
  return {
    entries: Object.freeze(entries.filter((_, position) => position !== index)),
    changed: true,
    entry,
  };
}

/** Validates, keeps `<path>.bak`, then replaces the file in one rename. */
export function writeDecibelWhitelistEntriesV1(
  path: string,
  entries: readonly decibel_whitelist_entry_v1[],
): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ wallets: entries }, null, 2)}\n`, 'utf8');
  try {
    // The same reader the bot uses must accept the new file before it replaces the old one.
    loadDecibelWalletWhitelistV1(temporary);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  renameSync(temporary, path);
}
