import 'dotenv/config';

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DecibelReadDex, MAINNET_CONFIG, TESTNET_CONFIG } from '@decibeltrade/sdk';

import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';
import { buildDecibelMinimalLiveCanaryAuthenticatedDryRunReportV1 } from './decibel_minimal_live_canary_authenticated_dry_run_v1.js';
import { decibel_minimal_live_canary_journal_v1 } from './decibel_minimal_live_canary_journal_v1.js';
import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from './decibel_minimal_live_canary_v1.js';

if (process.env.DECIBEL_EXECUTION_MODE === 'LIVE') throw new Error('LIVE_EXECUTION_DISABLED');

const timestamp = Date.now();
const configuration = loadConfig();
const configuredSubaccount = process.env.DECIBEL_SUBACCOUNT_ADDRESS?.trim() || null;
const sideValue = process.env.DECIBEL_CANARY_SIDE?.trim().toUpperCase();
const side = sideValue === 'BUY' || sideValue === 'SELL' ? sideValue : null;
const evidenceErrors: string[] = [];
const networkConfig = configuration.network === 'mainnet' ? MAINNET_CONFIG : TESTNET_CONFIG;
const options =
  configuration.nodeApiKey === undefined ? {} : { nodeApiKey: configuration.nodeApiKey };
const Reader = new DecibelReadDex(networkConfig, options);
const MarketClient = new decibel_client(configuration);

let metadata: Awaited<ReturnType<typeof MarketClient.getBTCMarketMetadata>> | null = null;
let book: { bestBid: number; bestAsk: number; observedAt: number } | null = null;
let positions: Awaited<ReturnType<typeof Reader.userPositions.getByAddr>> = [];
let openOrders: Awaited<ReturnType<typeof Reader.userOpenOrders.getByAddr>>['items'] = [];
let twaps: Awaited<ReturnType<typeof Reader.userActiveTwaps.getByAddr>> = [];
let bulkOrders: Awaited<ReturnType<typeof Reader.userBulkOrders.getByAddr>> = [];
let authenticatedSubaccount: string | null = null;

try {
  metadata = await MarketClient.getBTCMarketMetadata();
  if (metadata.marketAddress !== DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1)
    evidenceErrors.push('CANARY_MARKET_IDENTITY_MISMATCH');
} catch {
  evidenceErrors.push('CANARY_MARKET_METADATA_READ_FAILED');
}
try {
  const raw = (await MarketClient.getBTCCurrentBook(DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1)) as {
    best_bid?: unknown;
    best_ask?: unknown;
    unix_ms?: unknown;
  };
  if (
    typeof raw.best_bid !== 'number' ||
    typeof raw.best_ask !== 'number' ||
    typeof raw.unix_ms !== 'number' ||
    raw.best_bid <= 0 ||
    raw.best_ask <= raw.best_bid ||
    raw.unix_ms > timestamp + 1_000 ||
    timestamp - raw.unix_ms > 10_000
  )
    evidenceErrors.push('CANARY_BOOK_INVALID_OR_STALE');
  else book = { bestBid: raw.best_bid, bestAsk: raw.best_ask, observedAt: raw.unix_ms };
} catch {
  evidenceErrors.push('CANARY_BOOK_READ_FAILED');
}

if (configuredSubaccount === null) evidenceErrors.push('CANARY_SUBACCOUNT_REQUIRED');
else {
  try {
    [positions, openOrders, twaps, bulkOrders] = await Promise.all([
      Reader.userPositions.getByAddr({
        subAddr: configuredSubaccount,
        marketAddr: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
        includeDeleted: false,
        limit: 10,
      }),
      Reader.userOpenOrders
        .getByAddr({ subAddr: configuredSubaccount, limit: 200, offset: 0 })
        .then((value) => value.items),
      Reader.userActiveTwaps.getByAddr({ subAddr: configuredSubaccount }),
      Reader.userBulkOrders.getByAddr({
        subAddr: configuredSubaccount,
        market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      }),
    ]);
    authenticatedSubaccount = configuredSubaccount;
  } catch {
    evidenceErrors.push('CANARY_AUTHENTICATED_ACCOUNT_READ_FAILED');
  }
}

const journalPath = resolve(
  process.env.DECIBEL_MINIMAL_CANARY_JOURNAL_PATH ?? 'data/decibel_minimal_live_canary_v1.sqlite',
);
let journal = { healthy: false, unresolvedEntryCount: 0 };
try {
  mkdirSync(resolve('data'), { recursive: true });
  const CanaryJournal = new decibel_minimal_live_canary_journal_v1(journalPath);
  const inspection = CanaryJournal.inspect();
  journal = { healthy: inspection.healthy, unresolvedEntryCount: inspection.unresolvedEntryCount };
  CanaryJournal.close();
} catch {
  evidenceErrors.push('CANARY_JOURNAL_OPEN_OR_SCHEMA_FAILED');
}

const activeBulkCount = bulkOrders.filter(
  (value) => value.bid_sizes.some((size) => size > 0) || value.ask_sizes.some((size) => size > 0),
).length;
const report = buildDecibelMinimalLiveCanaryAuthenticatedDryRunReportV1(
  {
    configuredSubaccount,
    authenticatedSubaccount,
    configuredNetwork: configuration.network,
    observedNetwork: configuration.network,
    side,
    metadata:
      metadata === null
        ? null
        : {
            marketAddress: metadata.marketAddress,
            symbol: metadata.symbol,
            tickSize: metadata.tickSize,
            lotSize: metadata.lotSize,
            minimumSize: metadata.minimumSize,
            minimumMetadataValidQuantity:
              Math.ceil(metadata.minimumSize / metadata.lotSize) * metadata.lotSize,
            mode: metadata.mode,
          },
    book,
    position: {
      positionQueryAccount: configuredSubaccount ?? '',
      positionQueryMarket: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      includeDeleted: false,
      returnedOpenPositionCount: positions.length,
      zeroAnchorClassification:
        authenticatedSubaccount === null
          ? 'UNAVAILABLE'
          : positions.length === 0
            ? 'NO_OPEN_POSITION'
            : 'OPEN_POSITION',
    },
    activity: {
      openOrders:
        authenticatedSubaccount === null
          ? 'UNAVAILABLE'
          : openOrders.length === 0
            ? 'AVAILABLE_AND_CLEAR'
            : 'AVAILABLE_AND_NOT_CLEAR',
      tpSl:
        authenticatedSubaccount === null
          ? 'UNAVAILABLE'
          : positions.some((value) => value.tp_order_id !== null || value.sl_order_id !== null)
            ? 'AVAILABLE_AND_NOT_CLEAR'
            : 'AVAILABLE_AND_CLEAR',
      twap:
        authenticatedSubaccount === null
          ? 'UNAVAILABLE'
          : twaps.length === 0
            ? 'AVAILABLE_AND_CLEAR'
            : 'AVAILABLE_AND_NOT_CLEAR',
      bulk:
        authenticatedSubaccount === null
          ? 'UNAVAILABLE'
          : activeBulkCount === 0
            ? 'AVAILABLE_AND_CLEAR'
            : 'AVAILABLE_AND_NOT_CLEAR',
      delegatedOrManual: 'UNAVAILABLE',
      openOrderCount: authenticatedSubaccount === null ? null : openOrders.length,
      activeTwapCount: authenticatedSubaccount === null ? null : twaps.length,
      activeBulkCount: authenticatedSubaccount === null ? null : activeBulkCount,
    },
    journal,
    canaryNotionalSafetyCapUsd: Number(process.env.DECIBEL_CANARY_MAX_NOTIONAL_USD ?? '100'),
    evidenceErrors,
  },
  timestamp,
);

let reportPath = resolve('data/decibel_minimal_live_canary_authenticated_dry_run_v1.json');
if (existsSync(reportPath))
  reportPath = resolve(
    `data/decibel_minimal_live_canary_authenticated_dry_run_v1_${timestamp}.json`,
  );
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ reportPath, ...report }, null, 2));
