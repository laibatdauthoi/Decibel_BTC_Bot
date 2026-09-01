import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DecibelReadDex, MAINNET_CONFIG } from '@decibeltrade/sdk';
import { resolveDecibelBulkOrderActivityV1 } from './decibel_bulk_order_activity_resolution_v1.js';
import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';
import { buildDecibelMinimalLiveCanaryExecutionPackageV1 } from './decibel_minimal_live_canary_execution_package_v1.js';
import { decibel_minimal_live_canary_journal_v1 } from './decibel_minimal_live_canary_journal_v1.js';
import {
  buildDecibelMinimalLiveCanaryOperatorHandoffV1,
  type decibel_canary_handoff_safety_snapshot_v1,
} from './decibel_minimal_live_canary_operator_handoff_v1.js';
import {
  createDecibelAutoMinimalLiveCanaryConfigurationV1,
  DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  planDecibelMinimalLiveCanaryV1,
} from './decibel_minimal_live_canary_v1.js';

for (const name of [
  'LIVE_EXECUTION_ENABLED',
  'VENUE_MUTATION_ENABLED',
  'SIGNER_ENABLED',
  'TRANSACTION_SUBMISSION_ENABLED',
] as const)
  if (process.env[name] === 'true') throw new Error(`OPERATOR_HANDOFF_ONLY_${name}_MUST_BE_FALSE`);
const config = loadConfig();
if (config.network !== 'mainnet') throw new Error('OPERATOR_HANDOFF_MAINNET_REQUIRED');
const subaccount = process.env.DECIBEL_SUBACCOUNT_ADDRESS?.trim() ?? '';
if (!subaccount) throw new Error('CANARY_SUBACCOUNT_REQUIRED');
const configuredMinimumNotionalUsd = Number(process.env.DECIBEL_CANARY_MIN_NOTIONAL_USD ?? '10');
const configuredTargetNotionalUsd = Number(process.env.DECIBEL_CANARY_TARGET_NOTIONAL_USD ?? '20');
const configuredMaximumNotionalUsd = Number(process.env.DECIBEL_CANARY_MAX_NOTIONAL_USD ?? '100');
const Reader = new DecibelReadDex(
  MAINNET_CONFIG,
  config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
);
const MarketClient = new decibel_client(config);
const dataPath = resolve('data');
mkdirSync(dataPath, { recursive: true });
const Journal = new decibel_minimal_live_canary_journal_v1(
  resolve(
    process.env.DECIBEL_MINIMAL_CANARY_JOURNAL_PATH ?? 'data/decibel_minimal_live_canary_v1.sqlite',
  ),
);
const retiredHistoricalPreparedCount = Journal.retireUnsubmittedPrepared({
  recordedAt: Date.now(),
});
async function acquire(): Promise<decibel_canary_handoff_safety_snapshot_v1> {
  const [positions, orders, twaps, bulkRows, metadata, rawBook] = await Promise.all([
    Reader.userPositions.getByAddr({
      subAddr: subaccount,
      marketAddr: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      includeDeleted: false,
      limit: 10,
    }),
    Reader.userOpenOrders.getByAddr({ subAddr: subaccount, limit: 200, offset: 0 }),
    Reader.userActiveTwaps.getByAddr({ subAddr: subaccount }),
    Reader.userBulkOrders.getByAddr({
      subAddr: subaccount,
      market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    }),
    MarketClient.getBTCMarketMetadata(),
    MarketClient.getBTCCurrentBook(DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1),
  ]);
  const book = rawBook as { best_bid?: unknown; best_ask?: unknown };
  const receivedAt = Date.now();
  const bulk = resolveDecibelBulkOrderActivityV1({
    configuredSubaccount: subaccount,
    configuredMarket: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    records: bulkRows,
    readSuccessful: true,
  });
  const bestBid = typeof book.best_bid === 'number' ? book.best_bid : NaN,
    bestAsk = typeof book.best_ask === 'number' ? book.best_ask : NaN;
  const inspection = Journal.inspect();
  return Object.freeze({
    accountMatch: true,
    network: config.network,
    marketAddress: metadata.marketAddress,
    positionFlat: positions.length === 0,
    openOrderCount: orders.items.length,
    activeTwapCount: twaps.length,
    activeTpSlCount: positions.filter((p) => p.tp_order_id !== null || p.sl_order_id !== null)
      .length,
    activeBulkExposure: bulk.bulkOrderActivityClear ? 0 : 1,
    unknownVenueOrders: orders.items.length,
    journalHealthy: inspection.healthy,
    unresolvedExecutionPlans: inspection.unresolvedEntryCount,
    marketMode: metadata.mode,
    bestBid,
    bestAsk,
    observedAt: receivedAt,
    receiptAt: receivedAt,
    tickSize: metadata.tickSize,
    lotSize: metadata.lotSize,
    minimumSize: Math.ceil(metadata.minimumSize / metadata.lotSize) * metadata.lotSize,
    bboFresh: Number.isFinite(bestBid) && Number.isFinite(bestAsk),
  });
}
const construction = await acquire();
const timestamp = Date.now();
const suffix = createHash('sha256')
  .update(`${timestamp}:${subaccount}:${construction.bestBid}:${construction.bestAsk}`)
  .digest('hex')
  .slice(0, 12);
const configuration = createDecibelAutoMinimalLiveCanaryConfigurationV1({
  canaryId: `canary-handoff-${timestamp}-${suffix}`,
  executionSessionId: `session-handoff-${timestamp}-${suffix}`,
  account: subaccount,
  subaccount,
  network: 'mainnet',
  market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  observationTimeoutMs: 60_000,
  executionRecoveryTimeoutMs: 120_000,
  strategyConfigId: 'DECIBEL_MARKET_MAKER_V1_MINIMAL_LIVE_CANARY_V1',
});
const plan = planDecibelMinimalLiveCanaryV1({
  configuration,
  persistedConfigHash: null,
  preflight: {
    authenticatedAccount: subaccount,
    configuredNetwork: 'mainnet',
    observedNetwork: construction.network,
    market: construction.marketAddress,
    metadataFresh: true,
    marketOperational: construction.marketMode === 'Open',
    tickSize: construction.tickSize,
    lotSize: construction.lotSize,
    minimumOrderSize: construction.minimumSize,
    minimumMetadataValidQuantity: construction.minimumSize,
    bestBid: construction.bestBid,
    bestAsk: construction.bestAsk,
    exactMarketIdentity: construction.marketAddress === DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    authoritativeNoOpenPosition: construction.positionFlat,
    dedicatedSubaccount: true,
    unresolvedExecutionJournalCount: construction.unresolvedExecutionPlans,
    unexpectedOpenStrategyActivityCount: construction.unknownVenueOrders,
    activeTpSlCount: construction.activeTpSlCount,
    activeTwapCount: construction.activeTwapCount,
    activeBulkOrderCount: construction.activeBulkExposure,
    expectedDelegatedOrManualActivity: false,
    journalHealthy: construction.journalHealthy,
  },
  placementTransactionCount: 0,
  venueOrderCount: 0,
  configuredMinimumNotionalUsd,
  configuredTargetNotionalUsd,
  configuredMaximumNotionalUsd,
});
const executionPackage = buildDecibelMinimalLiveCanaryExecutionPackageV1({
  configuration,
  plan,
  packageAddress: MAINNET_CONFIG.deployment.package.toString(),
  marketObservedAt: construction.observedAt,
  bestBid: construction.bestBid,
  bestAsk: construction.bestAsk,
  tickSize: construction.tickSize,
  lotSize: construction.lotSize,
  minimumQuantity: construction.minimumSize,
  notionalCapUsd: plan.maximumNotionalUsd,
  finalPreflightReady: true,
  journal: Journal,
  timestamp,
});
const final = await acquire();
const handoff = buildDecibelMinimalLiveCanaryOperatorHandoffV1({
  executionPackage,
  initial: construction,
  final,
  createdAt: Date.now(),
});
Journal.recordOperatorHandoff(handoff);
Journal.close();
const reportPath = resolve(
  dataPath,
  `decibel_minimal_live_canary_operator_handoff_v1_${handoff.createdAt}.json`,
);
writeFileSync(
  reportPath,
  `${JSON.stringify({ retiredHistoricalPreparedCount, startupReconciliation: construction, finalReconciliation: final, bestBidAtConstruction: construction.bestBid, bestAskAtConstruction: construction.bestAsk, bestBidAtFinalCheck: final.bestBid, bestAskAtFinalCheck: final.bestAsk, precommittedTransactionHashAvailable: false, ...handoff }, null, 2)}\n`,
  { flag: 'wx' },
);
for (const [key, value] of Object.entries({
  OPERATOR_HANDOFF_READY: handoff.operatorHandoffReady ? 'YES' : 'NO',
  CANARY_ID: handoff.canaryId,
  SESSION_ID: handoff.executionSessionId,
  NETWORK: handoff.network,
  MARKET: handoff.market,
  SIDE: handoff.side,
  PRICE: handoff.price,
  QUANTITY: handoff.quantity,
  NOTIONAL_USD: handoff.notionalUsd,
  VENUE_MIN_NOTIONAL_USD: handoff.venueMinimumNotionalUsd,
  TARGET_NOTIONAL_USD: handoff.targetNotionalUsd,
  MAX_NOTIONAL_USD: handoff.maximumNotionalUsd,
  TYPE: 'LIMIT',
  POST_ONLY: true,
  CLIENT_ORDER_ID: handoff.clientOrderId,
  EXECUTION_PACKAGE_HASH: handoff.executionPackageHash,
  PRECOMMITTED_TX_HASH_AVAILABLE: false,
  TRANSACTION_INTENT_MATCH: handoff.transactionIntentMatch ? 'YES' : 'NO',
  HANDOFF_PACKAGE_FRESH: handoff.handoffPackageFresh ? 'YES' : 'NO',
  LIVE_EXECUTION_ENABLED: false,
  VENUE_MUTATION_ENABLED: false,
  OPERATOR_ACTION_REQUIRED: true,
  REPORT: reportPath,
  BLOCKER: handoff.blockers[0] ?? 'NONE',
}))
  console.log(`${key}=${value}`);
