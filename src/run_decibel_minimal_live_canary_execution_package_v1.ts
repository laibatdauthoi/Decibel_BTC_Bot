import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DecibelReadDex, MAINNET_CONFIG, TESTNET_CONFIG } from '@decibeltrade/sdk';

import { resolveDecibelBulkOrderActivityV1 } from './decibel_bulk_order_activity_resolution_v1.js';
import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';
import { buildDecibelMinimalLiveCanaryExecutionPackageV1 } from './decibel_minimal_live_canary_execution_package_v1.js';
import { decibel_minimal_live_canary_journal_v1 } from './decibel_minimal_live_canary_journal_v1.js';
import {
  DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  createDecibelAutoMinimalLiveCanaryConfigurationV1,
  planDecibelMinimalLiveCanaryV1,
} from './decibel_minimal_live_canary_v1.js';

if (process.argv.includes('--canary-side'))
  throw new Error('CANARY_MANUAL_SIDE_OVERRIDE_PROHIBITED');
if (process.env.CANARY_BROADCAST_AUTHORIZED !== undefined)
  throw new Error('CANARY_BROADCAST_ENVIRONMENT_OVERRIDE_PROHIBITED');

const timestamp = Date.now();
const config = loadConfig();
const release = config.network === 'mainnet' ? MAINNET_CONFIG : TESTNET_CONFIG;
const Reader = new DecibelReadDex(
  release,
  config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
);
const MarketClient = new decibel_client(config);
const subaccount = process.env.DECIBEL_SUBACCOUNT_ADDRESS?.trim() ?? '';
const errors: string[] = [];

let bulkRows: Awaited<ReturnType<typeof Reader.userBulkOrders.getByAddr>> = [];
let bulkReadSuccessful = false;
let positions: Awaited<ReturnType<typeof Reader.userPositions.getByAddr>> = [];
let openOrders: Awaited<ReturnType<typeof Reader.userOpenOrders.getByAddr>>['items'] = [];
let twaps: Awaited<ReturnType<typeof Reader.userActiveTwaps.getByAddr>> = [];
let metadata: Awaited<ReturnType<typeof MarketClient.getBTCMarketMetadata>> | null = null;
let book: { bestBid: number; bestAsk: number; observedAt: number } | null = null;

try {
  bulkRows = await Reader.userBulkOrders.getByAddr({
    subAddr: subaccount,
    market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  });
  bulkReadSuccessful = true;
} catch {
  errors.push('BULK_ORDER_READ_FAILED');
}
try {
  positions = await Reader.userPositions.getByAddr({
    subAddr: subaccount,
    marketAddr: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    includeDeleted: false,
    limit: 10,
  });
  openOrders = (
    await Reader.userOpenOrders.getByAddr({ subAddr: subaccount, limit: 200, offset: 0 })
  ).items;
  twaps = await Reader.userActiveTwaps.getByAddr({ subAddr: subaccount });
} catch {
  errors.push('SUBACCOUNT_READ_FAILED');
}
try {
  metadata = await MarketClient.getBTCMarketMetadata();
  const raw = (await MarketClient.getBTCCurrentBook(DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1)) as {
    best_bid?: unknown;
    best_ask?: unknown;
    unix_ms?: unknown;
  };
  if (
    typeof raw.best_bid === 'number' &&
    typeof raw.best_ask === 'number' &&
    typeof raw.unix_ms === 'number' &&
    raw.best_bid > 0 &&
    raw.best_ask > raw.best_bid
  )
    book = { bestBid: raw.best_bid, bestAsk: raw.best_ask, observedAt: raw.unix_ms };
  else errors.push('CURRENT_BBO_INVALID');
} catch {
  errors.push('MARKET_READ_FAILED');
}

const bulk = resolveDecibelBulkOrderActivityV1({
  configuredSubaccount: subaccount,
  configuredMarket: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  records: bulkRows,
  readSuccessful: bulkReadSuccessful,
});
const journalPath = resolve(
  process.env.DECIBEL_MINIMAL_CANARY_JOURNAL_PATH ?? 'data/decibel_minimal_live_canary_v1.sqlite',
);
const Journal = new decibel_minimal_live_canary_journal_v1(journalPath);
const inspection = Journal.inspect();
const tpSlCount = positions.filter(
  (position) => position.tp_order_id !== null || position.sl_order_id !== null,
).length;
if (!subaccount) errors.push('CANARY_SUBACCOUNT_REQUIRED');
if (positions.length !== 0) errors.push('CANARY_POSITION_NOT_FLAT');
if (openOrders.length !== 0) errors.push('CANARY_OPEN_ORDER_PRESENT');
if (twaps.length !== 0) errors.push('CANARY_ACTIVE_TWAP_PRESENT');
if (!bulk.bulkOrderActivityClear) errors.push(bulk.reason ?? 'CANARY_BULK_ACTIVITY_PRESENT');
if (!inspection.healthy || inspection.unresolvedEntryCount !== 0)
  errors.push('CANARY_JOURNAL_NOT_CLEAR');
if (metadata?.mode !== 'Open') errors.push('CANARY_MARKET_NOT_OPEN');
if (metadata?.marketAddress !== DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1)
  errors.push('CANARY_MARKET_IDENTITY_MISMATCH');
if (tpSlCount !== 0) errors.push('CANARY_ACTIVE_TP_SL_PRESENT');

let executionPackage = null;
if (errors.length === 0 && metadata !== null && book !== null) {
  const suffix = createHash('sha256')
    .update(`${timestamp}:${subaccount}:${book.observedAt}`)
    .digest('hex')
    .slice(0, 12);
  const configuration = createDecibelAutoMinimalLiveCanaryConfigurationV1({
    canaryId: `canary-package-${timestamp}-${suffix}`,
    executionSessionId: `session-package-${timestamp}-${suffix}`,
    account: subaccount,
    subaccount,
    network: config.network,
    market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    observationTimeoutMs: 60_000,
    executionRecoveryTimeoutMs: 120_000,
    strategyConfigId: 'DECIBEL_MARKET_MAKER_V1_MINIMAL_LIVE_CANARY_V1',
  });
  const minimumQuantity = Math.ceil(metadata.minimumSize / metadata.lotSize) * metadata.lotSize;
  const plan = planDecibelMinimalLiveCanaryV1({
    configuration,
    persistedConfigHash: null,
    preflight: {
      authenticatedAccount: subaccount,
      configuredNetwork: config.network,
      observedNetwork: config.network,
      market: metadata.marketAddress,
      metadataFresh: true,
      marketOperational: metadata.mode === 'Open',
      tickSize: metadata.tickSize,
      lotSize: metadata.lotSize,
      minimumOrderSize: metadata.minimumSize,
      minimumMetadataValidQuantity: minimumQuantity,
      bestBid: book.bestBid,
      bestAsk: book.bestAsk,
      exactMarketIdentity: true,
      authoritativeNoOpenPosition: true,
      dedicatedSubaccount: true,
      unresolvedExecutionJournalCount: 0,
      unexpectedOpenStrategyActivityCount: 0,
      activeTpSlCount: 0,
      activeTwapCount: 0,
      activeBulkOrderCount: 0,
      expectedDelegatedOrManualActivity: false,
      journalHealthy: true,
    },
    placementTransactionCount: 0,
    venueOrderCount: 0,
  });
  executionPackage = buildDecibelMinimalLiveCanaryExecutionPackageV1({
    configuration,
    plan,
    packageAddress: release.deployment.package.toString(),
    marketObservedAt: book.observedAt,
    bestBid: book.bestBid,
    bestAsk: book.bestAsk,
    tickSize: metadata.tickSize,
    lotSize: metadata.lotSize,
    minimumQuantity,
    notionalCapUsd: Number(process.env.DECIBEL_CANARY_MAX_NOTIONAL_USD ?? '100'),
    finalPreflightReady: true,
    journal: Journal,
    timestamp,
  });
}
Journal.close();

const report = Object.freeze({
  timestamp,
  freshFinalPreflight: Object.freeze({
    noOpenPosition: positions.length === 0,
    openOrderCount: openOrders.length,
    activeTwapCount: twaps.length,
    activeTpSlCount: tpSlCount,
    bulkOrderActivityClear: bulk.bulkOrderActivityClear,
    journalHealthy: inspection.healthy,
    unresolvedEntryCount: inspection.unresolvedEntryCount,
    marketMode: metadata?.mode ?? null,
    bestBid: book?.bestBid ?? null,
    bestAsk: book?.bestAsk ?? null,
    reasons: Object.freeze(errors),
  }),
  executionPackage,
  finalPreflightReady: errors.length === 0,
  transactionIntentMatch: executionPackage?.transactionIntentMatch ?? false,
  executionPackageReady: executionPackage?.executionPackageReady ?? false,
  canaryBroadcastAuthorized: false,
  liveExecutionEnabled: false,
  smallestConcreteBlocker: errors[0] ?? null,
});
mkdirSync(resolve('data'), { recursive: true });
const reportPath = resolve(
  `data/decibel_minimal_live_canary_execution_package_v1_${timestamp}.json`,
);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ reportPath, ...report }, null, 2));
