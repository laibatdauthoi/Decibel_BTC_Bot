/**
 * Wallet whitelist manager. Run on the bot's machine:
 *   npm run wl                    menu: list, add, remove
 *   npm run wl add 0x… [label]    add one wallet directly
 *   npm run wl remove <number|0x…>
 *   npm run wl list
 * Every change is shown and confirmed before it is written. Adding checks on Decibel that the
 * wallet owns a subaccount, which catches a mistyped address. The bot reads the file again on
 * the next sign-in, so no restart is needed.
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';
import { readDecibelSubaccountsV1 } from './decibel_wallet_routes_v1.js';
import {
  addDecibelWhitelistEntryV1,
  readDecibelWhitelistEntriesV1,
  removeDecibelWhitelistEntryV1,
  writeDecibelWhitelistEntriesV1,
  type decibel_whitelist_entry_v1,
} from './decibel_wallet_whitelist_editor_v1.js';
import {
  DECIBEL_WALLET_WHITELIST_PATH_V1,
  normalizeDecibelAddressV1,
} from './decibel_wallet_workspace_v1.js';

const WhitelistPath = DECIBEL_WALLET_WHITELIST_PATH_V1;

type ask_v1 = (question: string) => Promise<string>;

function printEntries(entries: readonly decibel_whitelist_entry_v1[]): void {
  console.log(`\nAllowed wallets (${WhitelistPath}):`);
  if (entries.length === 0) console.log('  (none: nobody can sign in)');
  entries.forEach((entry, index) =>
    console.log(`  ${index + 1}. ${entry.address}${entry.label ? `  ${entry.label}` : ''}`),
  );
}

async function confirm(ask: ask_v1, question: string): Promise<boolean> {
  return /^y(es)?$/i.test((await ask(`${question} [y/N] `)).trim());
}

/** Number of Decibel subaccounts the owner has, or null when Decibel could not be reached. */
async function countSubaccounts(owner: string): Promise<number | null> {
  try {
    const { MAINNET_CONFIG } = await loadDecibelSdkRuntimeV1();
    const subaccounts = await readDecibelSubaccountsV1({
      tradingHttpUrl: MAINNET_CONFIG.tradingHttpUrl,
      owner,
      apiKey: process.env.DECIBEL_NODE_API_KEY,
    });
    return subaccounts.length;
  } catch {
    return null;
  }
}

async function addWallet(ask: ask_v1, address: string, label?: string): Promise<void> {
  let normalized: string;
  try {
    normalized = normalizeDecibelAddressV1(address);
  } catch {
    console.log('Not an Aptos address (0x followed by up to 64 hex digits).');
    return;
  }
  const change = addDecibelWhitelistEntryV1(
    readDecibelWhitelistEntriesV1(WhitelistPath),
    normalized,
    label,
  );
  if (!change.changed) {
    console.log('This wallet is already allowed.');
    return;
  }
  console.log('Checking the wallet on Decibel…');
  const subaccounts = await countSubaccounts(normalized);
  if (subaccounts === null) console.log('Could not reach Decibel to check this wallet.');
  else if (subaccounts === 0)
    console.log('This wallet has no Decibel subaccount yet. Check the address.');
  else console.log(`OK: ${subaccounts} Decibel subaccount(s).`);
  console.log(`\nAdd ${normalized}${change.entry?.label ? ` (${change.entry.label})` : ''}?`);
  if (!(await confirm(ask, 'Write the change'))) {
    console.log('Nothing changed.');
    return;
  }
  writeDecibelWhitelistEntriesV1(WhitelistPath, change.entries);
  console.log('Added. It can sign in now; no restart needed.');
}

async function removeWallet(ask: ask_v1, selector: string): Promise<void> {
  let change;
  try {
    change = removeDecibelWhitelistEntryV1(readDecibelWhitelistEntriesV1(WhitelistPath), selector);
  } catch {
    console.log('Type a list number or a wallet address.');
    return;
  }
  if (!change.changed || change.entry === null) {
    console.log('No such wallet in the list.');
    return;
  }
  console.log(
    `\nRemove ${change.entry.address}${change.entry.label ? ` (${change.entry.label})` : ''}?`,
  );
  if (change.entries.length === 0) console.log('This is the last wallet: nobody could sign in.');
  console.log('A running session of this wallet keeps running; it only cannot sign in again.');
  if (!(await confirm(ask, 'Write the change'))) {
    console.log('Nothing changed.');
    return;
  }
  writeDecibelWhitelistEntriesV1(WhitelistPath, change.entries);
  console.log('Removed.');
}

async function runMenu(ask: ask_v1): Promise<void> {
  for (;;) {
    printEntries(readDecibelWhitelistEntriesV1(WhitelistPath));
    const choice = (await ask('\n[a] add  [r] remove  [q] quit: ')).trim().toLowerCase();
    if (choice === 'a') {
      const address = (await ask('Wallet address (0x…): ')).trim();
      const label = (await ask('Label (optional): ')).trim();
      await addWallet(ask, address, label);
    } else if (choice === 'r') {
      await removeWallet(ask, await ask('Number or address to remove: '));
    } else if (choice === 'q' || choice === '') return;
  }
}

async function main(): Promise<void> {
  const [command, first, ...rest] = process.argv.slice(2);
  const Prompt = createInterface({ input: stdin, output: stdout });
  // Lines are read from one iterator so typed-ahead or piped answers are never dropped;
  // the end of input answers every remaining question with an empty line (= no / quit).
  const Lines = Prompt[Symbol.asyncIterator]();
  const ask: ask_v1 = async (question) => {
    stdout.write(question);
    const next = await Lines.next();
    return next.done ? '' : next.value;
  };
  try {
    if (command === undefined) await runMenu(ask);
    else if (command === 'list') printEntries(readDecibelWhitelistEntriesV1(WhitelistPath));
    else if (command === 'add' && first) await addWallet(ask, first, rest.join(' '));
    else if (command === 'remove' && first) await removeWallet(ask, first);
    else console.log('Usage: npm run wl [list | add 0x… [label] | remove <number|0x…>]');
  } finally {
    Prompt.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    `WALLET_WHITELIST_COMMAND=FAILED ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
