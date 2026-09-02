import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DecibelReadDex, MAINNET_CONFIG } from '@decibeltrade/sdk';
import { loadConfig } from './config.js';
import { decibel_authenticated_passive_recycling_journal_v1 } from './decibel_authenticated_passive_recycling_journal_v1.js';
import {
  captureDecibelAuthenticatedPassiveRecyclingUiOrderV1,
  type decibel_recycling_ui_order_v1,
  type decibel_recycling_ui_transaction_v1,
} from './decibel_authenticated_passive_recycling_ui_order_capture_v1.js';

for (const name of [
  'LIVE_EXECUTION_ENABLED',
  'VENUE_MUTATION_ENABLED',
  'SIGNER_ENABLED',
  'TRANSACTION_SUBMISSION_ENABLED',
] as const)
  if (process.env[name] === 'true') throw new Error(`RECYCLING_CAPTURE_${name}_MUST_BE_FALSE`);
const index = process.argv.indexOf('--handoff');
if (index < 0 || process.argv[index + 1] === undefined) throw new Error('HANDOFF_REQUIRED');
const handoffPath = resolve(process.argv[index + 1]!);
const handoff = JSON.parse(readFileSync(handoffPath, 'utf8')) as Parameters<
  typeof captureDecibelAuthenticatedPassiveRecyclingUiOrderV1
>[0]['handoff'];
const journalPath = resolve(
  process.env.DECIBEL_RECYCLING_OPERATOR_JOURNAL_PATH ??
    'data/decibel_authenticated_passive_recycling_operator_cycle_v1.sqlite',
);
const Journal = new decibel_authenticated_passive_recycling_journal_v1(journalPath);
const journalRow = Journal.get(handoff.recyclingHandoffId);
if (journalRow?.state === 'RETIRED_UNSUBMITTED') {
  Journal.close();
  throw new Error('RECYCLING_HANDOFF_RETIRED');
}
const config = loadConfig();
const Reader = new DecibelReadDex(
  MAINNET_CONFIG,
  config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
);
const now = Date.now();
const history = await Reader.userOrderHistory.getByAddr({
  subAddr: handoff.subaccount,
  limit: 200,
  offset: 0,
  startTimestamp: handoff.handoffCreatedAt,
  endTimestamp: now,
  sortDir: 'ASC',
});
const orders: decibel_recycling_ui_order_v1[] = history.items.map((order) => ({
  parent: order.parent,
  market: order.market,
  clientOrderId: order.client_order_id,
  orderId: order.order_id,
  orderType: order.order_type,
  isBuy: order.is_buy,
  price: order.price ?? Number.NaN,
  origSize: order.orig_size ?? Number.NaN,
  transactionVersion: order.transaction_version,
  unixMs: order.unix_ms,
}));
const transactions = new Map<number, decibel_recycling_ui_transaction_v1>();
for (const version of new Set(orders.map((order) => order.transactionVersion))) {
  const response = await fetch(`${MAINNET_CONFIG.fullnodeUrl}/transactions/by_version/${version}`, {
    headers:
      config.nodeApiKey === undefined ? {} : { Authorization: `Bearer ${config.nodeApiKey}` },
  });
  if (!response.ok) continue;
  const tx = (await response.json()) as {
    hash?: unknown;
    success?: unknown;
    payload?: { function?: unknown; arguments?: unknown };
  };
  if (
    typeof tx.hash === 'string' &&
    typeof tx.payload?.function === 'string' &&
    Array.isArray(tx.payload.arguments)
  )
    transactions.set(version, {
      hash: tx.hash,
      version,
      success: tx.success === true,
      entryFunction: tx.payload.function,
      arguments: tx.payload.arguments,
    });
}
const capture = captureDecibelAuthenticatedPassiveRecyclingUiOrderV1({
  handoff,
  baselineOrderIds: new Set(),
  orders,
  transactionsByVersion: transactions,
  authenticatedQuerySubaccount: handoff.subaccount,
  capturedAt: Date.now(),
});
Journal.recordState({
  recyclingHandoffId: handoff.recyclingHandoffId,
  state: 'UI_ORDER_CAPTURED',
  capture,
  at: capture.capturedAt,
});
Journal.close();
const reportPath = resolve(
  `data/decibel_authenticated_passive_recycling_ui_order_capture_v1_${capture.capturedAt}.json`,
);
writeFileSync(reportPath, `${JSON.stringify(capture, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
});
console.log(
  JSON.stringify(
    { capture, reportPath, liveExecutionEnabled: false, venueMutationEnabled: false },
    null,
    2,
  ),
);
