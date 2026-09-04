import 'dotenv/config';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DecibelReadDex, MAINNET_CONFIG } from '@decibeltrade/sdk';

import { loadConfig } from './config.js';
import {
  createDecibelAuthenticatedBtcResyncCheckpointRolloverV2,
  deriveDecibelAuthenticatedBtcActivityResyncV1,
} from './decibel_authenticated_btc_activity_resync_v1.js';
import {
  getDecibelAuthenticatedBtcResyncCheckpointSequenceV1,
  getDecibelAuthenticatedBtcResyncRolloverPathV1,
  loadLatestDecibelAuthenticatedBtcResyncCheckpointV1,
} from './decibel_authenticated_btc_resync_checkpoint_chain_v1.js';
import { decibel_authenticated_passive_recycling_journal_v1 } from './decibel_authenticated_passive_recycling_journal_v1.js';
import { resolveDecibelBulkOrderActivityV1 } from './decibel_bulk_order_activity_resolution_v1.js';
import {
  decodeDecibelMoveAddressV1,
  decodeDecibelMoveOptionalStringV1,
} from './decibel_operator_ui_canary_order_capture_v1.js';

for (const name of [
  'LIVE_EXECUTION_ENABLED',
  'VENUE_MUTATION_ENABLED',
  'SIGNER_ENABLED',
  'TRANSACTION_SUBMISSION_ENABLED',
] as const)
  if (process.env[name] === 'true') throw new Error(`BTC_ACTIVITY_RESYNC_${name}_MUST_BE_FALSE`);

type aptos_transaction_v1 = Readonly<{
  hash: string;
  version: number;
  success: boolean;
  entryFunction: string | null;
  arguments: readonly unknown[];
}>;

const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const numeric = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return null;
};
const sameAddress = (left: unknown, right: string) =>
  decodeDecibelMoveAddressV1(left)?.toLowerCase() === right.toLowerCase();

async function readTransaction(version: number, nodeApiKey: string | undefined) {
  const response = await fetch(`${MAINNET_CONFIG.fullnodeUrl}/transactions/by_version/${version}`, {
    headers: nodeApiKey === undefined ? {} : { Authorization: `Bearer ${nodeApiKey}` },
  });
  if (!response.ok) return null;
  const raw = (await response.json()) as {
    hash?: unknown;
    version?: unknown;
    success?: unknown;
    payload?: { function?: unknown; arguments?: unknown };
  };
  if (typeof raw.hash !== 'string') return null;
  return Object.freeze({
    hash: raw.hash,
    version: numeric(raw.version) ?? version,
    success: raw.success === true,
    entryFunction: typeof raw.payload?.function === 'string' ? raw.payload.function : null,
    arguments: Object.freeze(Array.isArray(raw.payload?.arguments) ? raw.payload.arguments : []),
  }) satisfies aptos_transaction_v1;
}

function placementLineage(input: {
  transaction: aptos_transaction_v1 | null;
  subaccount: string;
  marketAddress: string;
  price: number;
  size: number;
  isBuy: boolean;
  orderType: string;
  clientOrderId: string;
}) {
  const transaction = input.transaction;
  if (transaction === null || transaction.entryFunction === null) return 'UNPROVEN' as const;
  if (transaction.entryFunction.endsWith('dex_accounts_entry::place_bulk_orders_to_subaccount')) {
    return transaction.success &&
      transaction.arguments.length >= 2 &&
      decodeDecibelMoveAddressV1(transaction.arguments[0]) !== null &&
      sameAddress(transaction.arguments[1], input.marketAddress)
      ? ('PROVEN_OPERATOR_PLACEMENT' as const)
      : ('UNPROVEN' as const);
  }
  if (!transaction.entryFunction.endsWith('dex_accounts_entry::place_order_to_subaccount'))
    return 'PROVEN_NON_PLACEMENT' as const;
  const args = transaction.arguments;
  const price = numeric(args[2]);
  const size = numeric(args[3]);
  const side = args[4];
  const orderType = numeric(args[5]);
  const clientOrderId = args.length >= 8 ? decodeDecibelMoveOptionalStringV1(args[7]) : null;
  const valid =
    transaction.success &&
    args.length >= 7 &&
    sameAddress(args[0], input.subaccount) &&
    sameAddress(args[1], input.marketAddress) &&
    (price === input.price || price === input.price * 1_000_000) &&
    (size === input.size || size === input.size * 100_000_000) &&
    side === input.isBuy &&
    orderType === 1 &&
    input.orderType.toLowerCase() === 'limit' &&
    (clientOrderId === null || clientOrderId === input.clientOrderId);
  return valid ? ('PROVEN_OPERATOR_PLACEMENT' as const) : ('UNPROVEN' as const);
}

const config = loadConfig();
if (config.network !== 'mainnet') throw new Error('BTC_ACTIVITY_RESYNC_MAINNET_REQUIRED');
const manifestPath = resolve(
  'config/production_state/decibel_authenticated_live_canary_success_v1_manifest.json',
);
const checkpointPath = resolve(
  'config/production_state/decibel_authenticated_btc_resync_checkpoint_v1.json',
);
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
  manifestBodyHashSha256: string;
  identity: {
    venueOrderId: string;
    venueClientOrderId: string;
    marketAddress: string;
    side: 'BUY' | 'SELL';
  };
  fillEvidence: { fillIds: string[] };
  sourceArtifacts: { handoff: { path: string } };
};
const frozenHandoff = JSON.parse(readFileSync(manifest.sourceArtifacts.handoff.path, 'utf8')) as {
  createdAt: number;
  subaccount: string;
};
const journalPath = resolve(
  process.env.DECIBEL_RECYCLING_OPERATOR_JOURNAL_PATH ??
    'data/decibel_authenticated_passive_recycling_operator_cycle_v1.sqlite',
);
const Journal = new decibel_authenticated_passive_recycling_journal_v1(journalPath);
try {
  const capturedOrderIds = Journal.list().flatMap((row) => {
    if (row.captureJson === null) return [];
    const capture = JSON.parse(row.captureJson) as { venueOrderId: string };
    return [capture.venueOrderId];
  });
  const Reader = new DecibelReadDex(
    MAINNET_CONFIG,
    config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
  );
  const now = Date.now();
  const [trades, orders, positions, open, twaps, bulkRows] = await Promise.all([
    Reader.userTradeHistory.getByAddr({
      subAddr: frozenHandoff.subaccount,
      limit: 200,
      offset: 0,
      startTimestamp: frozenHandoff.createdAt,
      endTimestamp: now,
      sortDir: 'ASC',
    }),
    Reader.userOrderHistory.getByAddr({
      subAddr: frozenHandoff.subaccount,
      limit: 200,
      offset: 0,
      startTimestamp: frozenHandoff.createdAt,
      endTimestamp: now,
      sortDir: 'ASC',
    }),
    Reader.userPositions.getByAddr({
      subAddr: frozenHandoff.subaccount,
      marketAddr: manifest.identity.marketAddress,
      includeDeleted: false,
      limit: 10,
    }),
    Reader.userOpenOrders.getByAddr({ subAddr: frozenHandoff.subaccount, limit: 200, offset: 0 }),
    Reader.userActiveTwaps.getByAddr({ subAddr: frozenHandoff.subaccount }),
    Reader.userBulkOrders.getByAddr({
      subAddr: frozenHandoff.subaccount,
      market: manifest.identity.marketAddress,
    }),
  ]);
  const orderById = new Map<string, (typeof orders.items)[number]>();
  for (const order of [...orders.items].sort(
    (left, right) => left.transaction_version - right.transaction_version,
  ))
    if (!orderById.has(order.order_id)) orderById.set(order.order_id, order);
  const btcTrades = trades.items.filter((trade) => {
    if (trade.source !== 'OrderFill') return false;
    if (manifest.fillEvidence.fillIds.includes(trade.trade_id)) return true;
    return (
      orderById.get(trade.order_id)?.market.toLowerCase() ===
      manifest.identity.marketAddress.toLowerCase()
    );
  });
  const transactionVersions = new Set<number>();
  for (const trade of btcTrades) {
    transactionVersions.add(trade.transaction_version);
    const order = orderById.get(trade.order_id);
    if (order !== undefined) transactionVersions.add(order.transaction_version);
  }
  const transactions = new Map<number, aptos_transaction_v1 | null>(
    await Promise.all(
      [...transactionVersions].map(
        async (version) => [version, await readTransaction(version, config.nodeApiKey)] as const,
      ),
    ),
  );
  const attributed = btcTrades.map((trade) => {
    const order = orderById.get(trade.order_id);
    const placementTransaction =
      order === undefined ? null : (transactions.get(order.transaction_version) ?? null);
    const lineage =
      order === undefined
        ? ('UNPROVEN' as const)
        : placementLineage({
            transaction: placementTransaction,
            subaccount: frozenHandoff.subaccount,
            marketAddress: order.market,
            price: order.price ?? Number.NaN,
            size: order.orig_size ?? Number.NaN,
            isBuy: order.is_buy,
            orderType: order.order_type,
            clientOrderId: order.client_order_id,
          });
    const frozenStrategyFill = manifest.fillEvidence.fillIds.includes(trade.trade_id);
    const timeInForce = frozenStrategyFill
      ? 1
      : order === undefined
        ? null
        : numeric((order as { time_in_force?: unknown }).time_in_force);
    const makerStatus =
      frozenStrategyFill || (timeInForce === 1 && lineage === 'PROVEN_OPERATOR_PLACEMENT')
        ? ('PROVEN' as const)
        : ('UNPROVEN' as const);
    const activityClass = frozenStrategyFill
      ? ('FROZEN_CANARY_STRATEGY_FILL' as const)
      : capturedOrderIds.includes(trade.order_id)
        ? ('CAPTURED_RECYCLING_STRATEGY_FILL' as const)
        : lineage === 'UNPROVEN'
          ? ('UNPROVEN' as const)
          : ('AUTHENTICATED_OUT_OF_BAND_ACCOUNT_FILL' as const);
    const fillTransaction = transactions.get(trade.transaction_version) ?? null;
    return Object.freeze({
      tradeId: trade.trade_id,
      orderId: trade.order_id,
      clientOrderId: trade.client_order_id ?? null,
      marketAddress: order?.market ?? manifest.identity.marketAddress,
      side: order === undefined ? null : order.is_buy ? ('BUY' as const) : ('SELL' as const),
      size: trade.size,
      price: trade.price,
      transactionVersion: trade.transaction_version,
      transactionHash: fillTransaction?.hash ?? null,
      entryFunction: fillTransaction?.entryFunction ?? null,
      placementTransactionVersion: order?.transaction_version ?? null,
      placementTransactionHash: placementTransaction?.hash ?? null,
      placementEntryFunction: placementTransaction?.entryFunction ?? null,
      targetSubaccount:
        placementTransaction === null
          ? null
          : decodeDecibelMoveAddressV1(placementTransaction.arguments[0]),
      transactionLineage: lineage,
      orderType: order?.order_type ?? null,
      timeInForce,
      postOnly:
        frozenStrategyFill || timeInForce === 1
          ? true
          : order?.order_type.toLowerCase() === 'market'
            ? false
            : null,
      fee: trade.fee_amount,
      rebate: trade.is_rebate ? trade.fee_amount : 0,
      makerStatus,
      activityClass,
    });
  });
  const bulk = resolveDecibelBulkOrderActivityV1({
    configuredSubaccount: frozenHandoff.subaccount,
    configuredMarket: manifest.identity.marketAddress,
    records: bulkRows,
    readSuccessful: true,
  });
  const result = deriveDecibelAuthenticatedBtcActivityResyncV1({
    priorFrozenManifestBodyHash: manifest.manifestBodyHashSha256,
    frozenFillIds: manifest.fillEvidence.fillIds,
    capturedRecyclingOrderIds: capturedOrderIds,
    fills: attributed,
    currentPositionBase: positions[0]?.size ?? 0,
    lotSize: 0.00001,
    btcOpenOrderCount: open.items.filter(
      (order) => order.market.toLowerCase() === manifest.identity.marketAddress.toLowerCase(),
    ).length,
    activeBtcTwapCount: twaps.length,
    activeBtcTpSlCount: positions.filter(
      (position) => position.tp_order_id !== null || position.sl_order_id !== null,
    ).length,
    activeBtcBulkOrderCount: bulk.bulkOrderActivityClear ? 0 : 1,
    resyncTimestamp: now,
    sourceHashes: {
      frozenManifestSha256: sha256(manifestBytes),
      recyclingJournalSha256: existsSync(journalPath) ? sha256(readFileSync(journalPath)) : '',
    },
  });
  let checkpointCreated = false;
  let persistedCheckpointPath = checkpointPath;
  if (result.checkpoint !== null) {
    if (existsSync(checkpointPath)) {
      const latest = loadLatestDecibelAuthenticatedBtcResyncCheckpointV1(checkpointPath);
      const sameFillIdentity =
        JSON.stringify(latest.allAccountFillIds) ===
        JSON.stringify(result.checkpoint.allAccountFillIds);
      if (sameFillIdentity) {
        persistedCheckpointPath =
          latest.schemaVersion === 'DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V1'
            ? checkpointPath
            : getDecibelAuthenticatedBtcResyncRolloverPathV1(
                latest.checkpointSequence,
                checkpointPath,
              );
      } else {
        const checkpointSequence = getDecibelAuthenticatedBtcResyncCheckpointSequenceV1(latest) + 1;
        const rollover = createDecibelAuthenticatedBtcResyncCheckpointRolloverV2({
          previous: latest,
          next: result.checkpoint,
          checkpointSequence,
        });
        persistedCheckpointPath = getDecibelAuthenticatedBtcResyncRolloverPathV1(
          checkpointSequence,
          checkpointPath,
        );
        writeFileSync(persistedCheckpointPath, `${JSON.stringify(rollover, null, 2)}\n`, {
          encoding: 'utf8',
          flag: 'wx',
        });
        checkpointCreated = true;
      }
    } else {
      writeFileSync(checkpointPath, `${JSON.stringify(result.checkpoint, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      checkpointCreated = true;
    }
  }
  const reportPath = resolve(`data/decibel_authenticated_btc_activity_resync_v1_${now}.json`);
  writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`BTC_ACTIVITY_ATTRIBUTION_READY=${result.ready ? 'YES' : 'NO'}`);
  console.log(`CURRENT_POSITION_BASE=${result.currentPositionBase}`);
  console.log(
    `ACCOUNT_POSITION_CONSERVATION=${result.positionConservationPassed ? 'PASS' : 'FAIL'}`,
  );
  for (const fill of result.fills) {
    console.log(`FILL=${fill.tradeId}`);
    console.log(`ORDER_ID=${fill.orderId}`);
    console.log(`SIDE=${fill.side ?? 'UNPROVEN'}`);
    console.log(`SIZE=${fill.size}`);
    console.log(`PRICE=${fill.price}`);
    console.log(`LINEAGE=${fill.transactionLineage}`);
    console.log(`MAKER_STATUS=${fill.makerStatus}`);
    console.log(`ACTIVITY_CLASS=${fill.activityClass}`);
  }
  console.log(`OUT_OF_BAND_FILL_COUNT=${result.outOfBandFillIds.length}`);
  console.log(`STRATEGY_FILL_COUNT=${result.strategyFillIds.length}`);
  console.log(`CYCLE_DISPOSITION=${result.cycleDisposition}`);
  console.log(`RESYNC_CHECKPOINT_CREATED=${checkpointCreated ? 'YES' : 'NO'}`);
  console.log(`CHECKPOINT=${result.checkpoint === null ? 'NONE' : persistedCheckpointPath}`);
  console.log(`REPORT=${reportPath}`);
  console.log(`BLOCKER=${result.blockers.join(',') || 'NONE'}`);
} finally {
  Journal.close();
}
