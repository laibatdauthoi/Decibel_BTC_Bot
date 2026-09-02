import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DecibelReadDex, MAINNET_CONFIG } from '@decibeltrade/sdk';
import { resolveDecibelBulkOrderActivityV1 } from './decibel_bulk_order_activity_resolution_v1.js';
import { loadConfig } from './config.js';
import { decibel_authenticated_passive_recycling_journal_v1 } from './decibel_authenticated_passive_recycling_journal_v1.js';
import {
  reconcileDecibelAuthenticatedPassiveRecyclingV1,
  type decibel_recycling_authenticated_fill_v1,
} from './decibel_authenticated_passive_recycling_reconciliation_v1.js';

for (const name of [
  'LIVE_EXECUTION_ENABLED',
  'VENUE_MUTATION_ENABLED',
  'SIGNER_ENABLED',
  'TRANSACTION_SUBMISSION_ENABLED',
] as const)
  if (process.env[name] === 'true')
    throw new Error(`RECYCLING_RECONCILIATION_${name}_MUST_BE_FALSE`);
const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const handoffArg = argument('--handoff');
const txHash = argument('--tx-hash');
if (!handoffArg) throw new Error('HANDOFF_REQUIRED');
if (!txHash || !/^0x[0-9a-f]{64}$/i.test(txHash)) throw new Error('TRANSACTION_HASH_REQUIRED');
const handoff = JSON.parse(readFileSync(resolve(handoffArg), 'utf8')) as Parameters<
  typeof reconcileDecibelAuthenticatedPassiveRecyclingV1
>[0]['handoff'];
const Journal = new decibel_authenticated_passive_recycling_journal_v1(
  resolve(
    process.env.DECIBEL_RECYCLING_OPERATOR_JOURNAL_PATH ??
      'data/decibel_authenticated_passive_recycling_operator_cycle_v1.sqlite',
  ),
);
const row = Journal.get(handoff.recyclingHandoffId);
if (row?.captureJson === null || row === null) {
  Journal.close();
  throw new Error('RECYCLING_UI_CAPTURE_REQUIRED');
}
const capture = JSON.parse(row.captureJson) as Parameters<
  typeof reconcileDecibelAuthenticatedPassiveRecyclingV1
>[0]['capture'];
if (capture.transactionHash.toLowerCase() !== txHash.toLowerCase()) {
  Journal.close();
  throw new Error('RECYCLING_TRANSACTION_HASH_MISMATCH');
}
const config = loadConfig();
const Reader = new DecibelReadDex(
  MAINNET_CONFIG,
  config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
);
const response = await fetch(`${MAINNET_CONFIG.fullnodeUrl}/transactions/by_hash/${txHash}`, {
  headers: config.nodeApiKey === undefined ? {} : { Authorization: `Bearer ${config.nodeApiKey}` },
});
let finality: 'FINALIZED_SUCCESS' | 'FINALIZED_FAILURE' | 'PENDING' | 'NOT_FOUND' = 'NOT_FOUND';
if (response.ok) {
  const tx = (await response.json()) as { type?: unknown; success?: unknown };
  finality =
    tx.type === 'pending_transaction'
      ? 'PENDING'
      : tx.success === true
        ? 'FINALIZED_SUCCESS'
        : 'FINALIZED_FAILURE';
}
const now = Date.now();
const [history, open, positions, twaps, bulkRows] = await Promise.all([
  Reader.userTradeHistory.getByAddr({
    subAddr: handoff.subaccount,
    limit: 200,
    offset: 0,
    startTimestamp: handoff.handoffCreatedAt,
    endTimestamp: now,
    sortDir: 'ASC',
  }),
  Reader.userOpenOrders.getByAddr({ subAddr: handoff.subaccount, limit: 200, offset: 0 }),
  Reader.userPositions.getByAddr({
    subAddr: handoff.subaccount,
    marketAddr: handoff.marketAddress,
    includeDeleted: false,
    limit: 10,
  }),
  Reader.userActiveTwaps.getByAddr({ subAddr: handoff.subaccount }),
  Reader.userBulkOrders.getByAddr({ subAddr: handoff.subaccount, market: handoff.marketAddress }),
]);
const exactRows = history.items.filter(
  (fill) => fill.source === 'OrderFill' && fill.order_id === capture.venueOrderId,
);
const fills: decibel_recycling_authenticated_fill_v1[] = exactRows.map((fill) => ({
  source: 'OrderFill',
  tradeId: fill.trade_id,
  orderId: fill.order_id,
  clientOrderId: fill.client_order_id,
  side: handoff.side,
  size: fill.size,
  price: fill.price,
  transactionVersion: fill.transaction_version,
}));
const canaryOpen = open.items.find((order) => order.order_id === capture.venueOrderId);
const bulk = resolveDecibelBulkOrderActivityV1({
  configuredSubaccount: handoff.subaccount,
  configuredMarket: handoff.marketAddress,
  records: bulkRows,
  readSuccessful: true,
});
const result = reconcileDecibelAuthenticatedPassiveRecyclingV1({
  handoff,
  capture,
  providedTransactionHash: txHash,
  transactionFinality: finality,
  openOrderState:
    canaryOpen === undefined
      ? 'ABSENT'
      : fills.length === 0
        ? 'OPEN_UNFILLED'
        : 'OPEN_PARTIALLY_FILLED',
  fills,
  currentAuthenticatedPositionBase: positions[0]?.size ?? 0,
  unknownOrders: open.items.filter((order) => order.order_id !== capture.venueOrderId).length,
  unknownFills: history.items.filter(
    (fill) => fill.source === 'OrderFill' && fill.order_id !== capture.venueOrderId,
  ).length,
  unrelatedActivity:
    twaps.length > 0 ||
    !bulk.bulkOrderActivityClear ||
    positions.some((position) => position.tp_order_id !== null || position.sl_order_id !== null),
});
const journalState =
  result.classification === 'RECYCLING_CYCLE_FULLY_RECONCILED'
    ? 'CYCLE_COMPLETED'
    : result.classification === 'RECYCLING_ORDER_PARTIALLY_FILLED'
      ? 'PARTIAL_FILL'
      : result.classification === 'RECYCLING_ORDER_OPEN_UNFILLED'
        ? 'ORDER_OPEN'
        : 'BLOCKED';
Journal.recordState({
  recyclingHandoffId: handoff.recyclingHandoffId,
  state: journalState,
  reconciliation: result,
  at: Date.now(),
});
Journal.close();
const reportPath = resolve(
  `data/decibel_authenticated_passive_recycling_reconciliation_v1_${Date.now()}.json`,
);
writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ result, reportPath }, null, 2));
