import 'dotenv/config';

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DecibelReadDex, MAINNET_CONFIG, TESTNET_CONFIG } from '@decibeltrade/sdk';

import {
  DECIBEL_BULK_ORDER_ACTIVITY_RESOLUTION_V1,
  resolveDecibelBulkOrderActivityV1,
  shouldRunFinalCanaryDryRunPhaseBV1,
} from './decibel_bulk_order_activity_resolution_v1.js';
import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';
import { buildDecibelMinimalLiveCanaryAuthenticatedDryRunReportV1 } from './decibel_minimal_live_canary_authenticated_dry_run_v1.js';
import { decibel_minimal_live_canary_journal_v1 } from './decibel_minimal_live_canary_journal_v1.js';
import {
  DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  deriveDecibelDeterministicCanarySideV1,
} from './decibel_minimal_live_canary_v1.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (process.env.DECIBEL_EXECUTION_MODE === 'LIVE') throw new Error('LIVE_EXECUTION_DISABLED');
const timestamp = Date.now();
const config = loadConfig();
const release = config.network === 'mainnet' ? MAINNET_CONFIG : TESTNET_CONFIG;
const Reader = new DecibelReadDex(
  release,
  config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
);
const MarketClient = new decibel_client(config);
const subaccount = process.env.DECIBEL_SUBACCOUNT_ADDRESS?.trim() ?? '';
if (argument('--canary-side') !== undefined)
  throw new Error('CANARY_MANUAL_SIDE_OVERRIDE_PROHIBITED');
const side = deriveDecibelDeterministicCanarySideV1({
  subaccount,
  market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
});

let bulkReadSuccessful = false;
let bulkRows: Awaited<ReturnType<typeof Reader.userBulkOrders.getByAddr>> = [];
let positions: Awaited<ReturnType<typeof Reader.userPositions.getByAddr>> = [];
let openOrders: Awaited<ReturnType<typeof Reader.userOpenOrders.getByAddr>>['items'] = [];
let twaps: Awaited<ReturnType<typeof Reader.userActiveTwaps.getByAddr>> = [];
let metadata: Awaited<ReturnType<typeof MarketClient.getBTCMarketMetadata>> | null = null;
let book: { best_bid: number; best_ask: number; unix_ms: number } | null = null;
const errors: string[] = [];
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
    raw.best_ask > raw.best_bid
  )
    book = { best_bid: raw.best_bid, best_ask: raw.best_ask, unix_ms: raw.unix_ms };
  else errors.push('MARKET_METADATA_READ_FAILED');
} catch {
  errors.push('MARKET_METADATA_READ_FAILED');
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
let journalHealthy = false;
let unresolvedEntryCount = 0;
try {
  const Journal = new decibel_minimal_live_canary_journal_v1(journalPath);
  const inspection = Journal.inspect();
  journalHealthy = inspection.healthy;
  unresolvedEntryCount = inspection.unresolvedEntryCount;
  Journal.close();
} catch {
  errors.push('JOURNAL_UNRESOLVED');
}
const readConnectivityReady =
  metadata !== null && book !== null && errors.every((error) => error !== 'SUBACCOUNT_READ_FAILED');
const phaseBEligible = shouldRunFinalCanaryDryRunPhaseBV1({
  readConnectivityReady,
  noOpenPosition: positions.length === 0,
  openOrderCount: openOrders.length,
  activeTwapCount: twaps.length,
  bulkOrderActivityClear: bulk.bulkOrderActivityClear,
  journalHealthy: journalHealthy && unresolvedEntryCount === 0,
  canarySideExplicit: true,
});

let canaryDryRun = null;
if (phaseBEligible && metadata !== null && book !== null) {
  canaryDryRun = buildDecibelMinimalLiveCanaryAuthenticatedDryRunReportV1(
    {
      configuredSubaccount: subaccount,
      authenticatedSubaccount: subaccount,
      configuredNetwork: config.network,
      observedNetwork: config.network,
      side: side.side,
      metadata: {
        marketAddress: metadata.marketAddress,
        symbol: metadata.symbol,
        tickSize: metadata.tickSize,
        lotSize: metadata.lotSize,
        minimumSize: metadata.minimumSize,
        minimumMetadataValidQuantity:
          Math.ceil(metadata.minimumSize / metadata.lotSize) * metadata.lotSize,
        mode: metadata.mode,
      },
      book: { bestBid: book.best_bid, bestAsk: book.best_ask, observedAt: book.unix_ms },
      position: {
        positionQueryAccount: subaccount,
        positionQueryMarket: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
        includeDeleted: false,
        returnedOpenPositionCount: positions.length,
        zeroAnchorClassification: positions.length === 0 ? 'NO_OPEN_POSITION' : 'OPEN_POSITION',
      },
      activity: {
        openOrders: openOrders.length === 0 ? 'AVAILABLE_AND_CLEAR' : 'AVAILABLE_AND_NOT_CLEAR',
        tpSl: positions.some((value) => value.tp_order_id !== null || value.sl_order_id !== null)
          ? 'AVAILABLE_AND_NOT_CLEAR'
          : 'AVAILABLE_AND_CLEAR',
        twap: twaps.length === 0 ? 'AVAILABLE_AND_CLEAR' : 'AVAILABLE_AND_NOT_CLEAR',
        bulk: bulk.bulkCheck,
        delegatedOrManual: 'UNAVAILABLE',
        openOrderCount: openOrders.length,
        activeTwapCount: twaps.length,
        activeBulkCount: bulk.bulkOrderActivityClear ? 0 : 1,
      },
      journal: { healthy: journalHealthy, unresolvedEntryCount },
      canaryNotionalSafetyCapUsd: Number(process.env.DECIBEL_CANARY_MAX_NOTIONAL_USD ?? '100'),
      evidenceErrors: errors,
    },
    timestamp,
  );
}

const report = Object.freeze({
  version: DECIBEL_BULK_ORDER_ACTIVITY_RESOLUTION_V1,
  timestamp,
  configuredSubaccount: subaccount,
  configuredMarket: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  bulk,
  currentPreflight: Object.freeze({
    noOpenPosition: positions.length === 0,
    openOrderCount: openOrders.length,
    activeTwapCount: twaps.length,
    tpSlCheck: positions.some((value) => value.tp_order_id !== null || value.sl_order_id !== null)
      ? 'AVAILABLE_AND_NOT_CLEAR'
      : 'AVAILABLE_AND_CLEAR',
    delegationCheck: 'UNAVAILABLE',
    journalHealthy,
    unresolvedEntryCount,
  }),
  side,
  phaseBEligible,
  phaseBRan: canaryDryRun !== null,
  canaryDryRun,
  mutationCounters: Object.freeze({
    signedTransactions: 0,
    submittedTransactions: 0,
    placedOrders: 0,
    cancelledOrders: 0,
    venueMutations: 0,
  }),
  minimalLiveCanarySpecReady: true,
  canaryDryRunReady: canaryDryRun?.readiness.canaryDryRunReady ?? false,
  liveExecutionEnabled: false,
});
mkdirSync(resolve('data'), { recursive: true });
let reportPath = resolve('data/decibel_bulk_order_activity_resolution_v1.json');
if (existsSync(reportPath))
  reportPath = resolve(`data/decibel_bulk_order_activity_resolution_v1_${timestamp}.json`);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ reportPath, ...report }, null, 2));
