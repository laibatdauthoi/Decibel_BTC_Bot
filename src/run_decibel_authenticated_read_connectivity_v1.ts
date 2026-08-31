import 'dotenv/config';

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DecibelReadDex, MAINNET_CONFIG, TESTNET_CONFIG } from '@decibeltrade/sdk';

import {
  resolveDecibelCanarySideV1,
  runDecibelAuthenticatedReadConnectivityProbeV1,
  shouldRunDecibelCanaryDryRunPhaseBV1,
} from './decibel_authenticated_read_connectivity_v1.js';
import { loadConfig } from './config.js';
import { decibel_client } from './decibel_client.js';
import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from './decibel_minimal_live_canary_v1.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (process.env.DECIBEL_EXECUTION_MODE === 'LIVE') throw new Error('LIVE_EXECUTION_DISABLED');
const config = loadConfig();
const release = config.network === 'mainnet' ? MAINNET_CONFIG : TESTNET_CONFIG;
const nodeApiKeyPresent = config.nodeApiKey !== undefined && config.nodeApiKey.length > 0;
const Reader = new DecibelReadDex(
  release,
  config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
);
const MarketClient = new decibel_client(config);
const subaccount = process.env.DECIBEL_SUBACCOUNT_ADDRESS?.trim() || null;
const side = resolveDecibelCanarySideV1({
  cliSide: argument('--canary-side'),
  environmentSide: process.env.DECIBEL_CANARY_SIDE,
});

const report = await runDecibelAuthenticatedReadConnectivityProbeV1({
  timestamp: Date.now(),
  nodeApiKeyPresent,
  network: config.network,
  subaccount,
  marketAddress: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  canarySide: side,
  endpoints: {
    network: config.network,
    tradingHttpUrl: release.tradingHttpUrl,
    tradingWsUrl: release.tradingWsUrl,
    fullnodeUrl: release.fullnodeUrl,
  },
  dependencies: {
    getMarkets: () => Reader.markets.getAll(),
    getCurrentBook: async () => {
      const value = await MarketClient.getBTCCurrentBook(DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1);
      if (value === null || typeof value !== 'object') throw new Error('SDK_DECODE_FAILURE');
      return value as Record<string, unknown>;
    },
    getPositions: () =>
      Reader.userPositions.getByAddr({
        subAddr: subaccount ?? '',
        marketAddr: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
        includeDeleted: false,
        limit: 10,
      }),
    getOpenOrders: async () =>
      (
        await Reader.userOpenOrders.getByAddr({
          subAddr: subaccount ?? '',
          limit: 200,
          offset: 0,
        })
      ).items,
    getActiveTwaps: () => Reader.userActiveTwaps.getByAddr({ subAddr: subaccount ?? '' }),
    getBulkOrders: () =>
      Reader.userBulkOrders.getByAddr({
        subAddr: subaccount ?? '',
        market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      }),
  },
});

mkdirSync(resolve('data'), { recursive: true });
let reportPath = resolve('data/decibel_authenticated_read_connectivity_v1.json');
if (existsSync(reportPath))
  reportPath = resolve(`data/decibel_authenticated_read_connectivity_v1_${report.timestamp}.json`);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(
  JSON.stringify(
    {
      reportPath,
      READ_CONNECTIVITY_READY:
        report.market.classification === 'MARKET_READ_READY' &&
        report.account.classification === 'ACCOUNT_READ_READY'
          ? 'YES'
          : 'NO',
      CANARY_SIDE_EXPLICIT: report.configuration.canarySide === 'PRESENT' ? 'YES' : 'NO',
      PHASE_B_RAN: false,
      PHASE_B_ELIGIBLE: shouldRunDecibelCanaryDryRunPhaseBV1(report),
      MINIMAL_LIVE_CANARY_SPEC_READY: 'YES',
      CANARY_DRY_RUN_READY: 'NO',
      LIVE_EXECUTION_ENABLED: false,
      report,
    },
    null,
    2,
  ),
);
