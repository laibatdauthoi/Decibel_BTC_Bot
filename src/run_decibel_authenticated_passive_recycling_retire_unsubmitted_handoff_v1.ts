import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DecibelReadDex, MAINNET_CONFIG } from '@decibeltrade/sdk';
import { loadConfig } from './config.js';
import { decibel_authenticated_passive_recycling_journal_v1 } from './decibel_authenticated_passive_recycling_journal_v1.js';
import { proveDecibelRecyclingHandoffUnsubmittedV1 } from './decibel_authenticated_passive_recycling_retirement_v1.js';
import type {
  decibel_recycling_ui_order_v1,
  decibel_recycling_ui_transaction_v1,
} from './decibel_authenticated_passive_recycling_ui_order_capture_v1.js';

for (const name of [
  'LIVE_EXECUTION_ENABLED',
  'VENUE_MUTATION_ENABLED',
  'SIGNER_ENABLED',
  'TRANSACTION_SUBMISSION_ENABLED',
] as const)
  if (process.env[name] === 'true') throw new Error(`RECYCLING_RETIREMENT_${name}_MUST_BE_FALSE`);
const index = process.argv.indexOf('--handoff');
if (index < 0 || process.argv[index + 1] === undefined) throw new Error('HANDOFF_REQUIRED');
const handoff = JSON.parse(readFileSync(resolve(process.argv[index + 1]!), 'utf8')) as Parameters<
  typeof proveDecibelRecyclingHandoffUnsubmittedV1
>[0]['handoff'];
const journalPath = resolve(
  process.env.DECIBEL_RECYCLING_OPERATOR_JOURNAL_PATH ??
    'data/decibel_authenticated_passive_recycling_operator_cycle_v1.sqlite',
);
const Journal = new decibel_authenticated_passive_recycling_journal_v1(journalPath);
const prior = Journal.get(handoff.recyclingHandoffId);
if (prior === null) {
  Journal.close();
  throw new Error('RECYCLING_JOURNAL_HANDOFF_NOT_FOUND');
}
if (prior.state === 'RETIRED_UNSUBMITTED') {
  Journal.close();
  throw new Error('RECYCLING_HANDOFF_RETIRED');
}
if (
  (prior.state !== 'HANDOFF_READY' && prior.state !== 'UI_CAPTURE_WAITING') ||
  prior.captureJson !== null ||
  prior.reconciliationJson !== null
) {
  Journal.close();
  throw new Error('RECYCLING_HANDOFF_RETIREMENT_STATE_INELIGIBLE');
}
const config = loadConfig();
const Reader = new DecibelReadDex(
  MAINNET_CONFIG,
  config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
);
const now = Date.now();
const [history, trades, open] = await Promise.all([
  Reader.userOrderHistory.getByAddr({
    subAddr: handoff.subaccount,
    limit: 200,
    offset: 0,
    startTimestamp: handoff.handoffCreatedAt,
    endTimestamp: now,
    sortDir: 'ASC',
  }),
  Reader.userTradeHistory.getByAddr({
    subAddr: handoff.subaccount,
    limit: 200,
    offset: 0,
    startTimestamp: handoff.handoffCreatedAt,
    endTimestamp: now,
    sortDir: 'ASC',
  }),
  Reader.userOpenOrders.getByAddr({ subAddr: handoff.subaccount, limit: 200, offset: 0 }),
]);
const normalize = (order: (typeof history.items)[number]): decibel_recycling_ui_order_v1 => ({
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
});
const orders = history.items.map(normalize);
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
const openOrders: decibel_recycling_ui_order_v1[] = open.items.map((order) => ({
  parent: order.parent,
  market: order.market,
  clientOrderId: order.client_order_id ?? '',
  orderId: order.order_id,
  orderType: order.order_type,
  isBuy: order.is_buy,
  price: order.price ?? Number.NaN,
  origSize: order.orig_size ?? Number.NaN,
  transactionVersion: order.transaction_version,
  unixMs: order.unix_ms,
}));
const evidence = proveDecibelRecyclingHandoffUnsubmittedV1({
  handoff,
  authenticatedQuerySubaccount: handoff.subaccount,
  checkedThrough: now,
  orderHistory: orders,
  transactionsByVersion: transactions,
  openOrders,
  fills: trades.items
    .filter((fill) => fill.source === 'OrderFill')
    .map((fill) => ({ tradeId: fill.trade_id, orderId: fill.order_id })),
});
const result = Journal.retireUnsubmittedHandoff({
  recyclingHandoffId: handoff.recyclingHandoffId,
  retirementEvidence: evidence,
  at: Date.now(),
});
const unresolved = Journal.unresolvedCount();
Journal.close();
console.log(`RECYCLING_HANDOFF_RETIRED=YES`);
console.log(`RECYCLING_HANDOFF_ID=${handoff.recyclingHandoffId}`);
console.log(`PRIOR_STATE=${result.priorState}`);
console.log(`NEW_STATE=${result.newState}`);
console.log(`CAPTURE_EXISTS=NO`);
console.log(`MATCHING_VENUE_PLACEMENT_FOUND=NO`);
console.log(`MATCHING_FILL_FOUND=NO`);
console.log(`MATCHING_OPEN_ORDER_FOUND=NO`);
console.log(`UNRESOLVED_COUNT=${unresolved}`);
console.log(`LIVE_EXECUTION_ENABLED=false`);
console.log(`VENUE_MUTATION_ENABLED=false`);
console.log(`BLOCKER=NONE`);
