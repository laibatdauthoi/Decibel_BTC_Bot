import 'dotenv/config';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DecibelReadDex, MAINNET_CONFIG } from '@decibeltrade/sdk';
import { resolveDecibelBulkOrderActivityV1 } from './decibel_bulk_order_activity_resolution_v1.js';
import { loadConfig } from './config.js';
import { decibel_minimal_live_canary_journal_v1 } from './decibel_minimal_live_canary_journal_v1.js';
import type { decibel_minimal_live_canary_operator_handoff_v1 } from './decibel_minimal_live_canary_operator_handoff_v1.js';
import {
  buildDecibelOperatorUiCanaryCaptureV1,
  matchDecibelOperatorUiCanaryOrdersV1,
  type decibel_ui_order_v1,
  type decibel_ui_transaction_v1,
} from './decibel_operator_ui_canary_order_capture_v1.js';

for (const name of [
  'LIVE_EXECUTION_ENABLED',
  'VENUE_MUTATION_ENABLED',
  'SIGNER_ENABLED',
  'TRANSACTION_SUBMISSION_ENABLED',
] as const)
  if (process.env[name] === 'true') throw new Error(`UI_CAPTURE_${name}_MUST_BE_FALSE`);
const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const timeoutMs = Math.min(120_000, Math.max(1, Number(argument('--timeout-ms') ?? '30000')));
const pollIntervalMs = Math.min(
  10_000,
  Math.max(500, Number(argument('--poll-interval-ms') ?? '2000')),
);
const config = loadConfig();
if (config.network !== 'mainnet') throw new Error('UI_CANARY_MAINNET_REQUIRED');
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
  const eligible = Journal.listUiCaptureEligibleHandoffs();
  if (eligible.length === 0) throw new Error('NO_UI_CAPTURE_HANDOFF');
  if (eligible.length !== 1) throw new Error('UI_CAPTURE_HANDOFF_AMBIGUOUS');
  handoff = eligible[0]!;
  const match = readdirSync(resolve('data'))
    .filter((name) => name.startsWith('decibel_minimal_live_canary_operator_handoff_v1_'))
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
  if (match === undefined) throw new Error('NO_UI_CAPTURE_HANDOFF');
  handoffArtifactPath = resolve('data', match);
}
if (
  !handoff.operatorHandoffReady ||
  !handoff.handoffPackageFresh ||
  !handoff.transactionIntentMatch
)
  throw new Error('NO_UI_CAPTURE_HANDOFF');
Journal.recordHandoffState({
  handoffPackageHash: handoff.handoffPackageHash,
  state: 'UI_ORDER_CAPTURE_WAITING',
  recordedAt: Date.now(),
});
const Reader = new DecibelReadDex(
  MAINNET_CONFIG,
  config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
);
const captureStartAt = Date.now();
const baselineEnd = handoff.createdAt;
const [
  baselineOrders,
  baselineTrades,
  baselineOpen,
  baselinePositions,
  baselineTwaps,
  baselineBulk,
] = await Promise.all([
  Reader.userOrderHistory.getByAddr({
    subAddr: handoff.subaccount,
    limit: 200,
    offset: 0,
    startTimestamp: 0,
    endTimestamp: baselineEnd,
    sortDir: 'ASC',
  }),
  Reader.userTradeHistory.getByAddr({
    subAddr: handoff.subaccount,
    limit: 200,
    offset: 0,
    startTimestamp: 0,
    endTimestamp: baselineEnd,
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
const baselineOrderIds = new Set(baselineOrders.items.map((value) => value.order_id));
const baselineClientOrderIds = new Set(baselineOrders.items.map((value) => value.client_order_id));
const baselineTransactionVersions = new Set(
  baselineOrders.items.map((value) => value.transaction_version),
);
const baselineTradeIds = new Set(baselineTrades.items.map((value) => value.trade_id));
const baselineBulkState = resolveDecibelBulkOrderActivityV1({
  configuredSubaccount: handoff.subaccount,
  configuredMarket: handoff.marketAddress,
  records: baselineBulk,
  readSuccessful: true,
});
void baselineOpen;
void baselinePositions;
void baselineTwaps;
let matching: readonly decibel_ui_order_v1[] = [];
let candidateCount = 0;
let activityExclusivity = true;
let selected: decibel_ui_order_v1 | null = null;
let candidateMismatchReason: ReturnType<
  typeof matchDecibelOperatorUiCanaryOrdersV1
>['mismatchReason'] = null;
while (Date.now() - captureStartAt < timeoutMs) {
  const now = Date.now();
  const [history, trades, open, positions, twaps, bulkRows] = await Promise.all([
    Reader.userOrderHistory.getByAddr({
      subAddr: handoff.subaccount,
      limit: 200,
      offset: 0,
      startTimestamp: handoff.createdAt,
      endTimestamp: now,
      sortDir: 'ASC',
    }),
    Reader.userTradeHistory.getByAddr({
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
  const normalized: decibel_ui_order_v1[] = history.items.map((order) => ({
    parent: order.parent,
    market: order.market,
    clientOrderId: order.client_order_id,
    orderId: order.order_id,
    status: order.status,
    orderType: order.order_type,
    isBuy: order.is_buy,
    origSize: order.orig_size,
    remainingSize: order.remaining_size,
    price: order.price,
    transactionVersion: order.transaction_version,
    unixMs: order.unix_ms,
  }));
  const result = matchDecibelOperatorUiCanaryOrdersV1({
    handoff,
    baselineOrderIds,
    orders: normalized,
    tickSize: handoff.tickSize,
    lotSize: handoff.lotSize,
  });
  candidateCount = result.newOrders.length;
  matching = result.matching;
  candidateMismatchReason = result.mismatchReason;
  const bulk = resolveDecibelBulkOrderActivityV1({
    configuredSubaccount: handoff.subaccount,
    configuredMarket: handoff.marketAddress,
    records: bulkRows,
    readSuccessful: true,
  });
  const unknownFill = trades.items.some(
    (value) =>
      !baselineTradeIds.has(value.trade_id) &&
      !matching.some((order) => order.orderId === value.order_id),
  );
  activityExclusivity =
    result.activityExclusivity &&
    !unknownFill &&
    baselineBulkState.bulkOrderActivityClear &&
    twaps.length === 0 &&
    positions.filter((value) => value.tp_order_id !== null || value.sl_order_id !== null).length ===
      0 &&
    bulk.bulkOrderActivityClear &&
    open.items.filter(
      (value) =>
        !baselineOrderIds.has(value.order_id) &&
        !matching.some((order) => order.orderId === value.order_id),
    ).length === 0;
  if (!activityExclusivity || matching.length > 1) break;
  if (matching.length === 1) {
    selected = matching[0]!;
    break;
  }
  await new Promise((done) => setTimeout(done, pollIntervalMs));
}
let transaction: decibel_ui_transaction_v1 | null = null;
if (selected !== null && Number.isSafeInteger(selected.transactionVersion)) {
  const response = await fetch(
    `${MAINNET_CONFIG.fullnodeUrl}/transactions/by_version/${selected.transactionVersion}`,
    {
      headers:
        config.nodeApiKey === undefined ? {} : { Authorization: `Bearer ${config.nodeApiKey}` },
    },
  );
  if (response.ok) {
    const raw = (await response.json()) as {
      hash?: string;
      version?: string;
      success?: boolean;
      vm_status?: string;
      sender?: string;
      timestamp?: string;
      payload?: { function?: string; arguments?: unknown[] };
    };
    if (typeof raw.hash === 'string')
      transaction = {
        hash: raw.hash,
        version: Number(raw.version),
        success: raw.success === true,
        vmStatus: raw.vm_status ?? null,
        sender: raw.sender ?? null,
        entryFunction: raw.payload?.function ?? null,
        arguments: raw.payload?.arguments ?? [],
        timestamp: raw.timestamp === undefined ? null : Number(BigInt(raw.timestamp) / 1000n),
      };
  }
}
const report = buildDecibelOperatorUiCanaryCaptureV1({
  handoff,
  handoffArtifactPath,
  baselineOrderIds: [...baselineOrderIds],
  baselineClientOrderIds: [...baselineClientOrderIds],
  baselineTransactionVersions: [...baselineTransactionVersions],
  candidateCount,
  matchingCandidates: matching,
  candidateMismatchReason,
  transaction,
  activityExclusivity,
  captureStartAt,
  capturedAt: Date.now(),
});
if (
  report.uiCanaryOrderCaptured &&
  report.venueOrderId !== null &&
  report.venueClientOrderId !== null &&
  report.transactionVersion !== null &&
  report.transactionHash !== null
)
  Journal.recordUiOrderCapture({
    handoff,
    venueOrderId: report.venueOrderId,
    venueClientOrderId: report.venueClientOrderId,
    transactionVersion: report.transactionVersion,
    transactionHash: report.transactionHash,
    capturedAt: report.capturedAt,
    captureEvidenceHash: report.captureEvidenceHash,
  });
else
  Journal.recordHandoffState({
    handoffPackageHash: handoff.handoffPackageHash,
    state: 'UI_ORDER_CAPTURE_FAILED',
    recordedAt: report.capturedAt,
  });
Journal.close();
const reportPath = resolve(
  `data/decibel_operator_ui_canary_order_capture_v1_${report.capturedAt}.json`,
);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(`UI_CANARY_ORDER_CAPTURED=${report.uiCanaryOrderCaptured ? 'YES' : 'NO'}`);
console.log(`CANARY_ID=${report.canaryId}`);
console.log(`SESSION_ID=${report.executionSessionId}`);
console.log(`VENUE_ORDER_ID=${report.venueOrderId ?? 'NONE'}`);
console.log(`VENUE_CLIENT_ORDER_ID=${report.venueClientOrderId ?? 'NONE'}`);
console.log(`TRANSACTION_VERSION=${report.transactionVersion ?? 'NONE'}`);
console.log(`TRANSACTION_HASH=${report.transactionHash ?? 'NONE'}`);
console.log(`UI_CANARY_TRANSACTION_IDENTITY_MATCH=${report.uiCanaryTransactionIdentityMatch}`);
console.log(`REPORT=${reportPath}`);
console.log(`BLOCKER=${report.blockers[0] ?? 'NONE'}`);
if (report.transactionHash !== null)
  console.log(
    `NEXT_COMMAND=npm run decibel:canary:reconcile-v1 -- --tx-hash ${report.transactionHash}`,
  );
