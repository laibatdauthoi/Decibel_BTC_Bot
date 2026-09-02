import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DecibelReadDex, MAINNET_CONFIG } from '@decibeltrade/sdk';

import { resolveDecibelBulkOrderActivityV1 } from './decibel_bulk_order_activity_resolution_v1.js';
import { loadConfig } from './config.js';
import {
  deriveDecibelAuthenticatedPassiveRecyclingLiveStateV1,
  type decibel_authenticated_recycling_fill_v1,
} from './decibel_authenticated_passive_recycling_live_state_v1.js';
import { decibel_client } from './decibel_client.js';

for (const name of [
  'LIVE_EXECUTION_ENABLED',
  'VENUE_MUTATION_ENABLED',
  'SIGNER_ENABLED',
  'TRANSACTION_SUBMISSION_ENABLED',
] as const)
  if (process.env[name] === 'true')
    throw new Error(`AUTHENTICATED_RECYCLING_${name}_MUST_BE_FALSE`);

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  return value === undefined || value.startsWith('--') ? undefined : value;
}

const manifestPath = resolve(
  argument('--manifest') ?? 'research/decibel_authenticated_live_canary_success_v1_manifest.json',
);
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>;
const sourceArtifacts = manifest.sourceArtifacts as {
  handoff?: { path?: unknown; handoffArtifactSha256?: unknown };
};
const handoffPath =
  typeof sourceArtifacts?.handoff?.path === 'string' ? sourceArtifacts.handoff.path : '';
if (!handoffPath) throw new Error('AUTHENTICATED_RECYCLING_HANDOFF_SOURCE_REQUIRED');
const handoffBytes = readFileSync(handoffPath);
const handoffHash = createHash('sha256').update(handoffBytes).digest('hex');
if (handoffHash !== sourceArtifacts.handoff?.handoffArtifactSha256)
  throw new Error('AUTHENTICATED_RECYCLING_HANDOFF_SOURCE_HASH_MISMATCH');
const handoff = JSON.parse(handoffBytes.toString('utf8')) as {
  createdAt: number;
  subaccount: string;
  marketAddress: string;
  venueMinimumNotionalUsd: number;
  maximumNotionalUsd: number;
};
const config = loadConfig();
if (config.network !== 'mainnet') throw new Error('AUTHENTICATED_RECYCLING_MAINNET_REQUIRED');
const Reader = new DecibelReadDex(
  MAINNET_CONFIG,
  config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
);
const MarketClient = new decibel_client(config);
const now = Date.now();
const [positions, openResponse, twaps, bulkRows, history, metadata, rawBook] = await Promise.all([
  Reader.userPositions.getByAddr({
    subAddr: handoff.subaccount,
    marketAddr: handoff.marketAddress,
    includeDeleted: false,
    limit: 10,
  }),
  Reader.userOpenOrders.getByAddr({ subAddr: handoff.subaccount, limit: 200, offset: 0 }),
  Reader.userActiveTwaps.getByAddr({ subAddr: handoff.subaccount }),
  Reader.userBulkOrders.getByAddr({
    subAddr: handoff.subaccount,
    market: handoff.marketAddress,
  }),
  Reader.userTradeHistory.getByAddr({
    subAddr: handoff.subaccount,
    limit: 200,
    offset: 0,
    startTimestamp: handoff.createdAt,
    endTimestamp: now,
    sortDir: 'ASC',
  }),
  MarketClient.getBTCMarketMetadata(),
  MarketClient.getBTCCurrentBook(handoff.marketAddress),
]);
const receivedAt = Date.now();
const book = rawBook as { best_bid?: unknown; best_ask?: unknown; unix_ms?: unknown };
const identity = manifest.identity as {
  side?: unknown;
  venueOrderId?: unknown;
  venueClientOrderId?: unknown;
};
if (identity.side !== 'BUY' && identity.side !== 'SELL')
  throw new Error('AUTHENTICATED_RECYCLING_MANIFEST_SIDE_INVALID');
const fills: decibel_authenticated_recycling_fill_v1[] = history.items
  .filter((row) => row.source === 'OrderFill')
  .map((row) => ({
    tradeId: row.trade_id,
    orderId: row.order_id,
    clientOrderId:
      row.client_order_id ??
      (typeof identity.venueClientOrderId === 'string' ? identity.venueClientOrderId : ''),
    side: identity.side as 'BUY' | 'SELL',
    size: row.size,
    price: row.price,
    transactionVersion: row.transaction_version,
    source: 'OrderFill',
    makerStatus: 'PROVEN',
  }));
const bulk = resolveDecibelBulkOrderActivityV1({
  configuredSubaccount: handoff.subaccount,
  configuredMarket: handoff.marketAddress,
  records: bulkRows,
  readSuccessful: true,
});
const state = deriveDecibelAuthenticatedPassiveRecyclingLiveStateV1({
  manifest,
  manifestFileSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  now: receivedAt,
  accountObservedAt: receivedAt,
  maxStateAgeMs: Math.max(
    1_000,
    Math.min(30_000, Number(process.env.DECIBEL_RECYCLING_MAX_STATE_AGE_MS ?? '5000')),
  ),
  currentPositionBase: positions[0]?.size ?? 0,
  fills,
  knownRecyclingOrderIds: openResponse.items
    .filter((order) => order.client_order_id?.startsWith('dpvr1-') === true)
    .map((order) => order.order_id),
  openOrders: openResponse.items.map((order) => ({
    orderId: order.order_id,
    clientOrderId: order.client_order_id ?? '',
    side: order.is_buy ? ('BUY' as const) : ('SELL' as const),
    knownRecyclingOrder: order.client_order_id?.startsWith('dpvr1-') === true,
  })),
  activeTwapCount: twaps.length,
  activeTpSlCount: positions.filter(
    (position) => position.tp_order_id !== null || position.sl_order_id !== null,
  ).length,
  activeBulkOrderCount: bulk.bulkOrderActivityClear ? 0 : 1,
  book: {
    bestBid: typeof book.best_bid === 'number' ? book.best_bid : Number.NaN,
    bestAsk: typeof book.best_ask === 'number' ? book.best_ask : Number.NaN,
    observedAt: typeof book.unix_ms === 'number' ? receivedAt : 0,
  },
  metadata: {
    marketAddress: metadata.marketAddress,
    tickSize: metadata.tickSize,
    lotSize: metadata.lotSize,
    minimumSize: metadata.minimumSize,
    minimumNotionalUsd: handoff.venueMinimumNotionalUsd,
    maximumConfiguredNotionalUsd: handoff.maximumNotionalUsd,
    mode: metadata.mode,
  },
  hardInventoryLimitBase: Math.max(
    metadata.minimumSize,
    Number(process.env.DECIBEL_RECYCLING_HARD_INVENTORY_LIMIT_BASE ?? '0.001'),
  ),
});
mkdirSync(resolve('data'), { recursive: true });
const reportPath = resolve(
  `data/decibel_authenticated_passive_recycling_live_state_v1_${receivedAt}.json`,
);
writeFileSync(
  reportPath,
  `${JSON.stringify({ manifestPath, handoffPath, observedAt: receivedAt, ...state }, null, 2)}\n`,
  { encoding: 'utf8', flag: 'wx' },
);
console.log(`AUTHENTICATED_RECYCLING_STATE_READY=${state.ready ? 'YES' : 'NO'}`);
console.log(`INVENTORY_STATE=${state.inventoryState}`);
console.log(`AUTHENTICATED_POSITION_BASE=${state.authenticatedPositionBase}`);
console.log(`AUTHENTICATED_MAKER_VOLUME_USD=${state.authenticatedMakerVolumeUsd}`);
console.log(`CURRENT_CYCLE_INVENTORY_BASE=${state.currentCycleInventoryBase}`);
console.log(`COMPLETED_RECYCLE_CYCLES=${state.completedRecycleCycles}`);
console.log(`ELIGIBLE_SIDE=${state.eligibleSide ?? 'NONE'}`);
console.log(`PRICE=${state.intent?.price ?? 'NONE'}`);
console.log(`QUANTITY=${state.intent?.quantity ?? 'NONE'}`);
console.log(`NOTIONAL_USD=${state.intent?.notionalUsd ?? 'NONE'}`);
console.log(`TYPE=${state.intent?.type ?? 'NONE'}`);
console.log(`POST_ONLY=${state.intent?.postOnly ?? false}`);
console.log(`LIVE_EXECUTION_ENABLED=false`);
console.log(`VENUE_MUTATION_ENABLED=false`);
console.log(`OPERATOR_ACTION_REQUIRED=${state.operatorActionRequired}`);
console.log(`REPORT=${reportPath}`);
console.log(`BLOCKER=${state.blockers.join(',') || 'NONE'}`);
