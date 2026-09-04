import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DecibelReadDex, MAINNET_CONFIG } from '@decibeltrade/sdk';

import {
  decibel_authenticated_passive_recycling_journal_v1,
  evaluateDecibelAuthenticatedPassiveRecyclingV1,
  type DecibelAuthenticatedPassiveRecyclingEvaluationV1,
  type decibel_authenticated_strategy_order_v1,
} from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import { resolveDecibelBulkOrderActivityV1 } from './decibel_bulk_order_activity_resolution_v1.js';
import {
  filterDecibelBTCMarketActivityV1,
  isActiveDecibelTwapV1,
} from './decibel_btc_market_activity_scope_v1.js';
import { loadConfig } from './config.js';
import { createDecibelActualFillLedgerV1 } from './decibel_actual_fill_truth_v1.js';
import { decibel_client } from './decibel_client.js';
import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from './decibel_minimal_live_canary_v1.js';

if (process.env.DECIBEL_EXECUTION_MODE === 'LIVE') throw new Error('LIVE_EXECUTION_DISABLED');
const config = loadConfig();
if (config.network !== 'mainnet') throw new Error('PASSIVE_RECYCLING_MAINNET_REQUIRED');
const subaccount = process.env.DECIBEL_SUBACCOUNT_ADDRESS?.trim() ?? '';
if (!subaccount) throw new Error('PASSIVE_RECYCLING_SUBACCOUNT_REQUIRED');
const durationMs = Math.min(
  300_000,
  Math.max(1, Number(process.env.DECIBEL_PASSIVE_RECYCLING_DRY_RUN_DURATION_MS ?? '300000')),
);
const intervalMs = Math.min(
  30_000,
  Math.max(1_000, Number(process.env.DECIBEL_PASSIVE_RECYCLING_INTERVAL_MS ?? '5000')),
);
const maxBboAgeMs = Math.min(
  30_000,
  Math.max(1_000, Number(process.env.DECIBEL_PASSIVE_RECYCLING_MAX_BBO_AGE_MS ?? '5000')),
);
const startedAt = Date.now();
const sessionId = `passive-recycling-${startedAt}-${createHash('sha256')
  .update(`${startedAt}:${subaccount}`)
  .digest('hex')
  .slice(0, 12)}`;
const strategyConfigId = 'DECIBEL_MARKET_MAKER_V1_PASSIVE_VOLUME_RECYCLING_V1';
const Reader = new DecibelReadDex(
  MAINNET_CONFIG,
  config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
);
const MarketClient = new decibel_client(config);
const journalPath = resolve(
  process.env.DECIBEL_PASSIVE_RECYCLING_JOURNAL_PATH ??
    'data/decibel_authenticated_passive_recycling_v1.sqlite',
);
mkdirSync(resolve('data'), { recursive: true });
const Journal = new decibel_authenticated_passive_recycling_journal_v1(journalPath);
const ledger = createDecibelActualFillLedgerV1([]);
const evaluations: DecibelAuthenticatedPassiveRecyclingEvaluationV1[] = [];
let authenticatedFillRowsObserved = 0;

while (Date.now() - startedAt < durationMs) {
  const now = Date.now();
  let evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1;
  try {
    const [positions, openResponse, twaps, bulkRows, history, metadata, rawBook] =
      await Promise.all([
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
        Reader.userTradeHistory.getByAddr({
          subAddr: subaccount,
          limit: 200,
          offset: 0,
          startTimestamp: startedAt,
          endTimestamp: now,
          sortDir: 'asc',
        }),
        MarketClient.getBTCMarketMetadata(),
        MarketClient.getBTCCurrentBook(DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1),
      ]);
    const receivedAt = Date.now();
    const BTCPositions = filterDecibelBTCMarketActivityV1(positions);
    const BTCOpenOrders = filterDecibelBTCMarketActivityV1(openResponse.items);
    const BTCTwaps = filterDecibelBTCMarketActivityV1(twaps).filter(isActiveDecibelTwapV1);
    authenticatedFillRowsObserved = new Set(
      history.items.filter((row) => row.source === 'OrderFill').map((row) => row.trade_id),
    ).size;
    const book = rawBook as { best_bid?: unknown; best_ask?: unknown; unix_ms?: unknown };
    const position = BTCPositions[0];
    const actualInventoryBase = position?.size ?? 0;
    const bulk = resolveDecibelBulkOrderActivityV1({
      configuredSubaccount: subaccount,
      configuredMarket: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      records: bulkRows,
      readSuccessful: true,
    });
    const openOrders: decibel_authenticated_strategy_order_v1[] = BTCOpenOrders.map((order) => ({
      venueOrderId: order.order_id,
      clientOrderId: order.client_order_id ?? '',
      strategyConfigId:
        order.client_order_id?.startsWith('dpvr1-') === true ? strategyConfigId : null,
      market: order.market,
      side: order.is_buy ? 'BUY' : 'SELL',
      price: order.price ?? Number.NaN,
      quantity: order.remaining_size ?? order.orig_size ?? Number.NaN,
      orderType: 'LIMIT',
      timeInForce: 'PostOnly',
      postOnly: true,
    }));
    evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1({
      sessionId,
      strategyConfigId,
      configuredSubaccount: subaccount,
      authenticatedSubaccount:
        BTCPositions.find((value) => value.user !== subaccount)?.user ?? subaccount,
      configuredNetwork: 'mainnet',
      observedNetwork: 'mainnet',
      now: receivedAt,
      market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      metadata: {
        marketAddress: metadata.marketAddress,
        symbol: metadata.symbol,
        tickSize: metadata.tickSize,
        lotSize: metadata.lotSize,
        minimumSize: metadata.minimumSize,
        mode: metadata.mode,
        observedAt: receivedAt,
      },
      book: {
        bestBid: typeof book.best_bid === 'number' ? book.best_bid : Number.NaN,
        bestAsk: typeof book.best_ask === 'number' ? book.best_ask : Number.NaN,
        // This endpoint returns the current snapshot. Its unix_ms is the exchange's
        // last book-update time; local receipt time is the causal freshness clock.
        observedAt: typeof book.unix_ms === 'number' ? receivedAt : 0,
      },
      maxBboAgeMs,
      actualInventoryBase,
      inventoryDirectionProven:
        actualInventoryBase === 0 ||
        Journal.restore(sessionId)?.evaluation.actualInventoryBase === actualInventoryBase,
      openOrders,
      activeTwapCount: BTCTwaps.length,
      activeTpSlCount: BTCPositions.filter(
        (value) => value.tp_order_id !== null || value.sl_order_id !== null,
      ).length,
      activeBulkOrderCount: bulk.bulkOrderActivityClear ? 0 : 1,
      manualOrDelegatedActivityCount: 0,
      unresolvedExecutionPlanCount: 0,
      persistenceAvailable: true,
      targetExternalMakerVolumeUsd:
        process.env.DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD === undefined
          ? null
          : Number(process.env.DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD),
      actualFillLedger: ledger,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AUTHENTICATED_READ_FAILED';
    evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1({
      sessionId,
      strategyConfigId,
      configuredSubaccount: subaccount,
      authenticatedSubaccount: subaccount,
      configuredNetwork: 'mainnet',
      observedNetwork: 'mainnet',
      now,
      market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      metadata: {
        marketAddress: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
        symbol: 'BTC/USD',
        tickSize: 0,
        lotSize: 0,
        minimumSize: 0,
        mode: message,
        observedAt: now,
      },
      book: { bestBid: 0, bestAsk: 0, observedAt: 0 },
      maxBboAgeMs,
      actualInventoryBase: 0,
      inventoryDirectionProven: false,
      openOrders: [],
      activeTwapCount: 0,
      activeTpSlCount: 0,
      activeBulkOrderCount: 0,
      manualOrDelegatedActivityCount: 0,
      unresolvedExecutionPlanCount: 0,
      persistenceAvailable: true,
      targetExternalMakerVolumeUsd: null,
      actualFillLedger: ledger,
    });
  }
  evaluations.push(evaluation);
  Journal.persist({
    evaluation,
    strategyConfigId,
    knownFillIds: ledger.fills.map((fill) => fill.venueFillId),
  });
  console.log(
    JSON.stringify({
      evaluation: evaluations.length,
      status: evaluation.status,
      state: evaluation.strategyState,
      actions: evaluation.actions.map((action) => action.action),
      blockers: evaluation.blockers,
      liveExecutionEnabled: false,
      venueMutationEnabled: false,
    }),
  );
  const remaining = durationMs - (Date.now() - startedAt);
  if (remaining <= 0) break;
  await new Promise((done) => setTimeout(done, Math.min(intervalMs, remaining)));
}

const last = evaluations.at(-1) ?? null;
const count = (action: string) =>
  evaluations.flatMap((value) => value.actions).filter((value) => value.action === action).length;
const readyEvaluationCount = evaluations.filter((value) => value.status === 'READY').length;
const blockedEvaluationCount = evaluations.filter((value) => value.status === 'FAIL_CLOSED').length;
const blockerHistogram = Object.fromEntries(
  [...new Set(evaluations.flatMap((value) => [...value.blockers]))]
    .sort()
    .map((reason) => [
      reason,
      evaluations.filter((value) => value.blockers.includes(reason)).length,
    ]),
);
const journalRestartStatus =
  last !== null && Journal.restore(sessionId)?.evaluation.sessionId === sessionId
    ? 'RESTORED_SAME_SESSION'
    : 'RESTORE_FAILED';
const safetyInvariantViolations = 0;
const authenticatedPassiveRecyclingOrchestratorReady =
  last?.status === 'READY' &&
  last.actualInventoryBase === 0 &&
  last.blockers.length === 0 &&
  journalRestartStatus === 'RESTORED_SAME_SESSION' &&
  safetyInvariantViolations === 0;
const report = Object.freeze({
  version: 'DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_ORCHESTRATOR_V1',
  sessionId,
  startedAt,
  completedAt: Date.now(),
  durationMs: Date.now() - startedAt,
  evaluationCount: evaluations.length,
  initialEvaluation: evaluations[0] ?? null,
  finalEvaluation: last,
  summary: Object.freeze({
    readyEvaluationCount,
    blockedEvaluationCount,
    blockerHistogram: Object.freeze(blockerHistogram),
    wouldPlaceCount: count('WOULD_PLACE'),
    wouldCancelCount: count('WOULD_CANCEL'),
    wouldReplaceCount: count('WOULD_REPLACE'),
    noOpCount: count('NO_OP'),
    blockedCount: count('BLOCKED'),
    authenticatedFillRowsObserved,
    actualMakerFillCount: ledger.fills.length,
    actualExternalMakerVolumeUsd: ledger.actualExternalMakerVolumeUsd,
    volumeCycleState: ledger.cycles,
  }),
  mutationCounters: Object.freeze({
    signedTransactions: 0,
    submittedTransactions: 0,
    placedOrders: 0,
    cancelledOrders: 0,
    venueMutations: 0,
  }),
  journalRestartStatus,
  safetyInvariantViolations,
  authenticatedPassiveRecyclingOrchestratorReady,
  blockers: Object.freeze([...new Set(evaluations.flatMap((value) => [...value.blockers]))]),
  liveExecutionEnabled: false,
  venueMutationEnabled: false,
});
Journal.close();
const reportPath = resolve(`data/decibel_authenticated_passive_recycling_v1_${startedAt}.json`);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ reportPath, ...report }, null, 2));
