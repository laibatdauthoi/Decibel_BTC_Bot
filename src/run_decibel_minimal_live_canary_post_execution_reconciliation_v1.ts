import 'dotenv/config';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DecibelReadDex, MAINNET_CONFIG } from '@decibeltrade/sdk';
import { resolveDecibelBulkOrderActivityV1 } from './decibel_bulk_order_activity_resolution_v1.js';
import { loadConfig } from './config.js';
import { decibel_minimal_live_canary_journal_v1 } from './decibel_minimal_live_canary_journal_v1.js';
import type { decibel_minimal_live_canary_operator_handoff_v1 } from './decibel_minimal_live_canary_operator_handoff_v1.js';
import {
  reconcileDecibelMinimalLiveCanaryPostExecutionV1,
  type decibel_canary_authenticated_fill_v1,
} from './decibel_minimal_live_canary_post_execution_reconciliation_v1.js';

for (const name of [
  'LIVE_EXECUTION_ENABLED',
  'VENUE_MUTATION_ENABLED',
  'SIGNER_ENABLED',
  'TRANSACTION_SUBMISSION_ENABLED',
] as const)
  if (process.env[name] === 'true') throw new Error(`RECONCILIATION_${name}_MUST_BE_FALSE`);
function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
const txHash = argument('--tx-hash');
if (txHash === undefined || !/^0x[0-9a-f]{64}$/i.test(txHash))
  throw new Error('TRANSACTION_HASH_REQUIRED');
const config = loadConfig();
if (config.network !== 'mainnet') throw new Error('RECONCILIATION_MAINNET_REQUIRED');
const Journal = new decibel_minimal_live_canary_journal_v1(
  resolve(
    process.env.DECIBEL_MINIMAL_CANARY_JOURNAL_PATH ?? 'data/decibel_minimal_live_canary_v1.sqlite',
  ),
);
let handoff: decibel_minimal_live_canary_operator_handoff_v1;
let handoffArtifactPath: string;
const supplied = argument('--handoff');
if (supplied !== undefined) {
  handoffArtifactPath = resolve(supplied);
  handoff = JSON.parse(
    readFileSync(handoffArtifactPath, 'utf8'),
  ) as decibel_minimal_live_canary_operator_handoff_v1;
} else {
  const eligible = Journal.listReconciliationEligibleHandoffs();
  if (eligible.length === 0) throw new Error('NO_UNRESOLVED_CANARY_HANDOFF');
  if (eligible.length !== 1) throw new Error('HANDOFF_IDENTITY_AMBIGUOUS');
  handoff = eligible[0]!.handoff;
  const match = readdirSync(resolve('data'))
    .filter(
      (name) =>
        name.startsWith('decibel_minimal_live_canary_operator_handoff_v1_') &&
        name.endsWith('.json'),
    )
    .find((name) => {
      try {
        return (
          (
            JSON.parse(readFileSync(resolve('data', name), 'utf8')) as {
              handoffPackageHash?: string;
            }
          ).handoffPackageHash === handoff.handoffPackageHash
        );
      } catch {
        return false;
      }
    });
  if (match === undefined) throw new Error('HANDOFF_ARTIFACT_NOT_FOUND');
  handoffArtifactPath = resolve('data', match);
}
Journal.recordHandoffState({
  handoffPackageHash: handoff.handoffPackageHash,
  state: 'OPERATOR_TRANSACTION_OBSERVED',
  transactionHash: txHash,
  recordedAt: Date.now(),
});
const timeoutMs = Math.min(
  120_000,
  Math.max(1_000, Number(process.env.DECIBEL_CANARY_FINALITY_TIMEOUT_MS ?? '30000')),
);
const pollMs = Math.min(
  10_000,
  Math.max(500, Number(process.env.DECIBEL_CANARY_FINALITY_POLL_INTERVAL_MS ?? '2000')),
);
const started = Date.now();
type transaction_observation = {
  type?: string;
  hash?: string;
  success?: boolean;
  vm_status?: string;
  version?: string;
  sender?: string;
  timestamp?: string;
  payload?: { function?: string; arguments?: unknown[] };
};
let transaction: transaction_observation | null = null;
let notFound = true;
while (Date.now() - started < timeoutMs) {
  const response = await fetch(`${MAINNET_CONFIG.fullnodeUrl}/transactions/by_hash/${txHash}`, {
    headers:
      config.nodeApiKey === undefined ? {} : { Authorization: `Bearer ${config.nodeApiKey}` },
  });
  if (response.ok) {
    transaction = (await response.json()) as transaction_observation;
    notFound = false;
    if (transaction.type !== 'pending_transaction') break;
  } else if (response.status !== 404) throw new Error(`TRANSACTION_LOOKUP_HTTP_${response.status}`);
  await new Promise((done) => setTimeout(done, pollMs));
}
const finality: Readonly<{
  status: 'PENDING' | 'NOT_FOUND' | 'FINALIZED_SUCCESS' | 'FINALIZED_FAILURE';
  transactionVersion?: number;
  vmStatus?: string;
}> =
  transaction === null
    ? { status: 'NOT_FOUND' as const }
    : transaction.type === 'pending_transaction'
      ? { status: 'PENDING' as const }
      : transaction.success === true
        ? {
            status: 'FINALIZED_SUCCESS' as const,
            transactionVersion: Number(transaction.version),
            ...(transaction.vm_status === undefined ? {} : { vmStatus: transaction.vm_status }),
          }
        : {
            status: 'FINALIZED_FAILURE' as const,
            transactionVersion: Number(transaction.version),
            ...(transaction.vm_status === undefined ? {} : { vmStatus: transaction.vm_status }),
          };
const normalize = (value: unknown) =>
  value === null
    ? undefined
    : typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
      ? Number(value)
      : value;
const observedArguments = transaction?.payload?.arguments?.map(normalize) ?? [];
const expectedArguments = handoff.entryArguments.map(normalize);
const transactionIdentityMatch =
  transaction !== null &&
  transaction.hash?.toLowerCase() === txHash.toLowerCase() &&
  transaction.payload?.function === handoff.entryFunction &&
  JSON.stringify(observedArguments) === JSON.stringify(expectedArguments);
const Reader = new DecibelReadDex(
  MAINNET_CONFIG,
  config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
);
const now = Date.now();
const [history, orders, openResponse, positions, twaps, bulkRows] = await Promise.all([
  Reader.userTradeHistory.getByAddr({
    subAddr: handoff.subaccount,
    limit: 200,
    offset: 0,
    startTimestamp: handoff.createdAt,
    endTimestamp: now,
    sortDir: 'ASC',
  }),
  Reader.userOrderHistory.getByAddr({
    subAddr: handoff.subaccount,
    limit: 200,
    offset: 0,
    startTimestamp: handoff.createdAt,
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
const exactOrders = orders.items.filter(
  (order) =>
    order.client_order_id === handoff.clientOrderId && order.market === handoff.marketAddress,
);
const orderId =
  exactOrders[0]?.order_id ??
  openResponse.items.find((order) => order.client_order_id === handoff.clientOrderId)?.order_id ??
  null;
const relevant = history.items.filter(
  (row) =>
    row.source === 'OrderFill' &&
    (row.client_order_id === handoff.clientOrderId ||
      (orderId !== null && row.order_id === orderId)),
);
const fills: decibel_canary_authenticated_fill_v1[] = relevant.map((row) => ({
  source: 'OrderFill',
  tradeId: row.trade_id,
  orderId: row.order_id,
  clientOrderId: row.client_order_id ?? handoff.clientOrderId,
  size: row.size,
  price: row.price,
  transactionVersion: row.transaction_version,
  feeAmount: row.fee_amount,
  isRebate: row.is_rebate,
}));
const canaryOpen = openResponse.items.find(
  (order) => order.client_order_id === handoff.clientOrderId,
);
const filled = fills.reduce((sum, value) => sum + value.size, 0);
const remaining = canaryOpen?.remaining_size ?? Math.max(0, handoff.quantity - filled);
const openOrderState =
  canaryOpen === undefined ? 'ABSENT' : filled === 0 ? 'OPEN_UNFILLED' : 'OPEN_PARTIALLY_FILLED';
const unknownOrders = openResponse.items.filter(
  (order) => order.client_order_id !== handoff.clientOrderId,
).length;
const unknownFills = history.items.filter(
  (row) => row.source === 'OrderFill' && !relevant.some((known) => known.trade_id === row.trade_id),
).length;
const bulk = resolveDecibelBulkOrderActivityV1({
  configuredSubaccount: handoff.subaccount,
  configuredMarket: handoff.marketAddress,
  records: bulkRows,
  readSuccessful: true,
});
const endingPosition = positions[0]?.size ?? 0;
const expectedPosition = handoff.side === 'BUY' ? filled : -filled;
const makerStatusProven =
  transactionIdentityMatch &&
  handoff.postOnly &&
  handoff.entryArguments[5] === 1 &&
  (exactOrders.length === 1 ||
    relevant.some((row) => row.client_order_id === handoff.clientOrderId));
const report = reconcileDecibelMinimalLiveCanaryPostExecutionV1({
  handoff,
  providedTransactionHash: txHash,
  finality,
  transactionIdentityMatch,
  fills,
  makerStatusProven,
  openOrderState,
  remainingQuantity: remaining,
  endingPosition,
  fillConservation:
    filled <= handoff.quantity && Math.abs(filled + remaining - handoff.quantity) < 1e-10,
  positionConservation: Math.abs(endingPosition - expectedPosition) < 1e-10,
  journalReconciliation: true,
  unknownOrders,
  unknownFills,
  unrelatedActivity:
    twaps.length > 0 ||
    positions.some((value) => value.tp_order_id !== null || value.sl_order_id !== null) ||
    !bulk.bulkOrderActivityClear,
});
Journal.recordHandoffState({
  handoffPackageHash: handoff.handoffPackageHash,
  state: report.canaryReconciled
    ? 'CANARY_RECONCILED'
    : finality.status.startsWith('FINALIZED')
      ? 'TRANSACTION_FINALIZED'
      : 'CANARY_UNRESOLVED',
  transactionHash: txHash,
  reconciliation: report,
  recordedAt: Date.now(),
});
Journal.close();
const reportPath = resolve(
  `data/decibel_minimal_live_canary_post_execution_reconciliation_v1_${Date.now()}.json`,
);
writeFileSync(
  reportPath,
  `${JSON.stringify({ handoffArtifactPath, transactionIdentityEvidence: { hash: transaction?.hash ?? null, sender: transaction?.sender ?? null, entryFunction: transaction?.payload?.function ?? null, arguments: transaction?.payload?.arguments ?? null, timestamp: transaction?.timestamp ?? null }, twapState: twaps.length, bulkState: bulk.classification, tpSlState: positions.filter((value) => value.tp_order_id !== null || value.sl_order_id !== null).length, finalityPolling: { timeoutMs, pollIntervalMs: pollMs, notFound }, ...report }, null, 2)}\n`,
  { flag: 'wx' },
);
console.log(`CLASSIFICATION=${report.classification}`);
console.log(`CANARY_TRANSACTION_IDENTITY_MATCH=${transactionIdentityMatch ? 'YES' : 'NO'}`);
console.log(`CANARY_RECONCILED=${report.canaryReconciled ? 'YES' : 'NO'}`);
console.log('LIVE_EXECUTION_ENABLED=false');
console.log('VENUE_MUTATION_ENABLED=false');
console.log(`REPORT=${reportPath}`);
