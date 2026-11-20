import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addDecibelWhitelistEntryV1,
  readDecibelWhitelistEntriesV1,
  removeDecibelWhitelistEntryV1,
  writeDecibelWhitelistEntriesV1,
} from '../src/decibel_wallet_whitelist_editor_v1.js';
import { loadDecibelWalletWhitelistV1 } from '../src/decibel_wallet_workspace_v1.js';

const A = `0x${'ab'.repeat(32)}`;
const B = `0x${'cd'.repeat(32)}`;

function makePath(content?: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'whitelist-editor-')), 'allowed_wallets.json');
  if (content !== undefined) writeFileSync(path, content);
  return path;
}

describe('Wallet whitelist editor', () => {
  it('reads a missing file as empty and rejects a broken one', () => {
    expect(readDecibelWhitelistEntriesV1(makePath())).toEqual([]);
    expect(() => readDecibelWhitelistEntriesV1(makePath('{oops'))).toThrow(
      'WALLET_WHITELIST_INVALID',
    );
  });

  it('adds a normalized address once and keeps the label', () => {
    const first = addDecibelWhitelistEntryV1([], A.toUpperCase().replace('0X', '0x'), ' Alice ');
    expect(first.changed).toBe(true);
    expect(first.entries).toEqual([{ address: A, label: 'Alice' }]);
    const again = addDecibelWhitelistEntryV1(first.entries, A);
    expect(again.changed).toBe(false);
    expect(again.entries).toBe(first.entries);
    expect(addDecibelWhitelistEntryV1([], '0xAB').entry?.address).toBe(`0x${'0'.repeat(62)}ab`);
    expect(() => addDecibelWhitelistEntryV1([], 'not-an-address')).toThrow(
      'WALLET_ADDRESS_INVALID',
    );
    expect(() => addDecibelWhitelistEntryV1([], A, 'x'.repeat(81))).toThrow(
      'WALLET_LABEL_TOO_LONG',
    );
  });

  it('removes by list number or by address', () => {
    const entries = [{ address: A }, { address: B, label: 'Bob' }];
    expect(removeDecibelWhitelistEntryV1(entries, '2').entries).toEqual([{ address: A }]);
    expect(removeDecibelWhitelistEntryV1(entries, A).entries).toEqual([
      { address: B, label: 'Bob' },
    ]);
    expect(removeDecibelWhitelistEntryV1(entries, '3').changed).toBe(false);
    expect(removeDecibelWhitelistEntryV1(entries, '0').changed).toBe(false);
  });

  it('writes a file the bot accepts and keeps a backup of the old one', () => {
    const path = makePath(JSON.stringify({ wallets: [{ address: A }] }));
    writeDecibelWhitelistEntriesV1(path, [{ address: A }, { address: B, label: 'Bob' }]);
    expect([...loadDecibelWalletWhitelistV1(path)]).toEqual([A, B]);
    expect(JSON.parse(readFileSync(`${path}.bak`, 'utf8'))).toEqual({ wallets: [{ address: A }] });
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it('leaves the old file untouched when the new content is invalid', () => {
    const original = JSON.stringify({ wallets: [{ address: A }] });
    const path = makePath(original);
    expect(() => writeDecibelWhitelistEntriesV1(path, [{ address: 'bad' }])).toThrow(
      'WALLET_WHITELIST_INVALID',
    );
    expect(readFileSync(path, 'utf8')).toBe(original);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });
});
