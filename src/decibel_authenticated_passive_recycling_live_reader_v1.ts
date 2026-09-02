import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { DecibelReadDex, MAINNET_CONFIG } from '@decibeltrade/sdk';

import { resolveDecibelBulkOrderActivityV1 } from './decibel_bulk_order_activity_resolution_v1.js';
import type { application_config } from './config.js';
import { deriveDecibelAuthenticatedPassiveRecyclingLiveStateV1 } from './decibel_authenticated_passive_recycling_live_state_v1.js';
import {
  resolveDecibelAuthenticatedRecyclingFillLineageV1,
  type recycling_order_lineage_v1,
} from './decibel_authenticated_recycling_fill_lineage_v1.js';
import { decibel_client } from './decibel_client.js';

export async function readDecibelAuthenticatedPassiveRecyclingLiveStateV1(input: {
  config: application_config;
  manifestPath: string;
  knownRecyclingOrders?: readonly recycling_order_lineage_v1[];
  maxStateAgeMs: number;
  hardInventoryLimitBase: number;
}) {
  const manifestBytes = readFileSync(input.manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>;
  const sourceArtifacts = manifest.sourceArtifacts as {
    handoff?: { path?: unknown; handoffArtifactSha256?: unknown };
  };
  if (typeof sourceArtifacts?.handoff?.path !== 'string')
    throw new Error('AUTHENTICATED_RECYCLING_HANDOFF_SOURCE_REQUIRED');
  const handoffBytes = readFileSync(sourceArtifacts.handoff.path);
  if (
    createHash('sha256').update(handoffBytes).digest('hex') !==
    sourceArtifacts.handoff.handoffArtifactSha256
  )
    throw new Error('AUTHENTICATED_RECYCLING_HANDOFF_SOURCE_HASH_MISMATCH');
  const handoff = JSON.parse(handoffBytes.toString('utf8')) as {
    createdAt: number;
    subaccount: string;
    marketAddress: string;
    venueMinimumNotionalUsd: number;
    maximumNotionalUsd: number;
  };
  const Reader = new DecibelReadDex(
    MAINNET_CONFIG,
    input.config.nodeApiKey === undefined ? {} : { nodeApiKey: input.config.nodeApiKey },
  );
  const MarketClient = new decibel_client(input.config);
  const now = Date.now();
  const [positions, openResponse, twaps, bulkRows, history, orderHistory, metadata, rawBook] =
    await Promise.all([
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
      Reader.userOrderHistory.getByAddr({
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
    marketAddress?: unknown;
  };
  if (
    (identity.side !== 'BUY' && identity.side !== 'SELL') ||
    typeof identity.venueOrderId !== 'string' ||
    typeof identity.venueClientOrderId !== 'string' ||
    typeof identity.marketAddress !== 'string'
  )
    throw new Error('AUTHENTICATED_RECYCLING_MANIFEST_IDENTITY_INVALID');
  const known = new Map((input.knownRecyclingOrders ?? []).map((order) => [order.orderId, order]));
  const fillEvidence = manifest.fillEvidence as { fillIds?: unknown };
  const frozenFillIds = new Set(
    Array.isArray(fillEvidence?.fillIds)
      ? fillEvidence.fillIds.filter((id): id is string => typeof id === 'string')
      : [],
  );
  const resolvedFills = resolveDecibelAuthenticatedRecyclingFillLineageV1({
    btcMarketAddress: handoff.marketAddress,
    frozen: {
      fillIds: frozenFillIds,
      venueOrderId: identity.venueOrderId,
      venueClientOrderId: identity.venueClientOrderId,
      side: identity.side,
      marketAddress: identity.marketAddress,
    },
    knownRecyclingOrders: input.knownRecyclingOrders ?? [],
    orderHistory: orderHistory.items.map((order) => ({
      orderId: order.order_id,
      marketAddress: order.market,
    })),
    tradeHistory: history.items.map((row) => ({
      tradeId: row.trade_id,
      orderId: row.order_id,
      clientOrderId: row.client_order_id,
      size: row.size,
      price: row.price,
      transactionVersion: row.transaction_version,
      source: row.source,
    })),
  });
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
    maxStateAgeMs: input.maxStateAgeMs,
    currentPositionBase: positions[0]?.size ?? 0,
    fills: resolvedFills.fills,
    knownRecyclingOrderIds: [...known.keys()],
    openOrders: openResponse.items.map((order) => ({
      orderId: order.order_id,
      clientOrderId: order.client_order_id ?? '',
      marketAddress: order.market,
      side: order.is_buy ? ('BUY' as const) : ('SELL' as const),
      knownRecyclingOrder: known.has(order.order_id),
    })),
    activeTwapCount: twaps.length,
    activeTpSlCount: positions.filter(
      (position) => position.tp_order_id !== null || position.sl_order_id !== null,
    ).length,
    activeBulkOrderCount: bulk.bulkOrderActivityClear ? 0 : 1,
    lineageBlockers: resolvedFills.lineageBlockers,
    diagnostics: {
      foreignMarketFillIds: resolvedFills.foreignMarketFillIds,
      knownRecyclingVenueOrderIds: [...known.keys()],
      unexplainedBtcFillIds: resolvedFills.unexplainedBtcFillIds,
      unprovenFillIds: resolvedFills.unprovenFillIds,
    },
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
    hardInventoryLimitBase: input.hardInventoryLimitBase,
  });
  return Object.freeze({
    state,
    manifest,
    handoff,
    observedAt: receivedAt,
    diagnostics: Object.freeze({
      foreignMarketFillIds: resolvedFills.foreignMarketFillIds,
      unexplainedBtcFillIds: resolvedFills.unexplainedBtcFillIds,
      unprovenFillIds: resolvedFills.unprovenFillIds,
      knownRecyclingVenueOrderIds: Object.freeze([...known.keys()]),
      activeTwapCount: twaps.length,
      activeTpSlCount: positions.filter(
        (position) => position.tp_order_id !== null || position.sl_order_id !== null,
      ).length,
      bulkClassification: bulk.classification,
    }),
  });
}
