import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { z } from 'zod';

import {
  applyDecibelActualFillTruthV1,
  createDecibelActualFillLedgerV1,
  type decibel_actual_fill_ledger_v1,
  type decibel_actual_order_truth_v1,
} from './decibel_actual_fill_truth_v1.js';
import type {
  decibel_authenticated_passive_recycling_input_v1,
  decibel_authenticated_strategy_order_v1,
} from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import { validateDecibelAuthenticatedLiveCanaryManifestV1 } from './decibel_authenticated_passive_recycling_live_state_v1.js';
import { validateDecibelAuthenticatedBtcResyncCheckpointV1 } from './decibel_authenticated_btc_activity_resync_v1.js';
import {
  resolveDecibelBulkOrderActivityV1,
  type decibel_bulk_order_record_v1,
} from './decibel_bulk_order_activity_resolution_v1.js';
import type { BTC_market_metadata } from './decibel_client.js';
import { loadConfig } from './config.js';
import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from './decibel_minimal_live_canary_v1.js';
import type {
  DecibelProductionLiveStateSourceV1,
  decibel_production_live_snapshot_v1,
} from './decibel_production_live_orchestrator_v1.js';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';

export const DECIBEL_PRODUCTION_LIVE_STATE_SOURCE_V1 =
  'DECIBEL_PRODUCTION_LIVE_STATE_SOURCE_V1' as const;
export const DECIBEL_MAX_HISTORY_RANGE_MS = 15_552_000_000 as const;

const ProductionLiveSourceEnvironmentSchema = z.object({
  DECIBEL_NETWORK: z.literal('mainnet'),
  DECIBEL_SUBACCOUNT_ADDRESS: z.string().trim().min(1),
  DECIBEL_PRODUCTION_LIVE_SESSION_ID: z.string().trim().min(1).optional(),
  DECIBEL_PRODUCTION_LIVE_STRATEGY_CONFIG_ID: z
    .string()
    .trim()
    .min(1)
    .default('DECIBEL_MARKET_MAKER_V1_PASSIVE_VOLUME_RECYCLING_V1'),
  DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS: z.coerce.number().int().positive().default(5_000),
  DECIBEL_PRODUCTION_LIVE_MIN_NOTIONAL_USD: z.coerce.number().positive().default(0.01),
  DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD: z.coerce.number().positive().default(100),
  DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD: z.coerce.number().positive().optional(),
});

type position_row = Readonly<{
  market: string;
  user: string;
  size: number;
  tp_order_id: string | null;
  sl_order_id: string | null;
}>;
type open_order_row = Readonly<{
  market: string;
  order_id: string;
  client_order_id: string | null;
  orig_size: number | null;
  remaining_size: number | null;
  price: number | null;
  is_buy: boolean;
  is_tpsl: boolean;
}>;
type order_history_row = Readonly<{
  market: string;
  client_order_id: string;
  order_id: string;
  orig_size: number | null;
  price: number | null;
  is_buy: boolean;
}>;
type trade_history_row = Readonly<{
  account: string;
  market: string;
  source: 'OrderFill' | 'MarginCall' | 'BackStopLiquidation' | 'ADL' | 'MarketDelisted';
  trade_id: string;
  size: number;
  price: number;
  fee_amount: number;
  is_rebate: boolean;
  order_id: string;
  transaction_unix_ms: number;
  client_order_id?: string;
}>;
type twap_row = Readonly<{ market: string }>;
type sdk_read_adapter = Readonly<{
  userPositions: { getByAddr(input: object): Promise<readonly position_row[]> };
  userOpenOrders: { getByAddr(input: object): Promise<{ items: readonly open_order_row[] }> };
  userOrderHistory: {
    getByAddr(input: object): Promise<{
      items: readonly order_history_row[];
      total_count?: number;
    }>;
  };
  userTradeHistory: {
    getByAddr(input: object): Promise<{
      items: readonly trade_history_row[];
      total_count?: number;
    }>;
  };
  userActiveTwaps: { getByAddr(input: object): Promise<readonly twap_row[]> };
  userBulkOrders: {
    getByAddr(input: object): Promise<readonly decibel_bulk_order_record_v1[]>;
  };
}>;
type market_client_adapter = Readonly<{
  getBTCMarketMetadata(): Promise<BTC_market_metadata>;
  getBTCCurrentBook(marketAddress: string): Promise<unknown>;
  closeWebSocket(): void;
}>;
type authenticated_activity_baseline = Readonly<{
  historyStartTimestamp: number;
  fillIds: readonly string[];
  reconciledAccountFillIds: readonly string[];
  venueOrderId: string;
  venueClientOrderId: string;
  side: 'BUY' | 'SELL';
  marketAddress: string;
  quantity: number;
}>;

export interface DecibelProductionLiveAuthenticatedReaderV1 {
  readPositions(subaccount: string, marketAddress: string): Promise<readonly position_row[]>;
  readOpenOrders(subaccount: string): Promise<readonly open_order_row[]>;
  readOrderHistory(
    subaccount: string,
    startTimestamp: number,
    endTimestamp: number,
  ): Promise<readonly order_history_row[]>;
  readTradeHistory(
    subaccount: string,
    startTimestamp: number,
    endTimestamp: number,
  ): Promise<readonly trade_history_row[]>;
  readActiveTwaps(subaccount: string): Promise<readonly twap_row[]>;
  readBulkOrders(
    subaccount: string,
    marketAddress: string,
  ): Promise<readonly decibel_bulk_order_record_v1[]>;
  readMarketMetadata(): Promise<BTC_market_metadata>;
  readCurrentBook(marketAddress: string): Promise<unknown>;
  close?(): Promise<void> | void;
}

const CurrentBookSchema = z.object({
  market: z.string().min(1),
  best_bid: z.number().positive(),
  best_ask: z.number().positive(),
  unix_ms: z.number().int().nonnegative(),
});

function canonicalHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function loadAuthenticatedActivityBaseline(): authenticated_activity_baseline {
  const manifestBytes = readFileSync(
    'research/decibel_authenticated_live_canary_success_v1_manifest.json',
  );
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>;
  const frozen = validateDecibelAuthenticatedLiveCanaryManifestV1({
    manifest,
    manifestFileSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  });
  const sourceArtifacts = manifest.sourceArtifacts as
    | Readonly<{ handoff?: Readonly<{ path?: unknown; handoffArtifactSha256?: unknown }> }>
    | undefined;
  if (
    typeof sourceArtifacts?.handoff?.path !== 'string' ||
    typeof sourceArtifacts.handoff.handoffArtifactSha256 !== 'string'
  )
    throw new Error('PRODUCTION_LIVE_SOURCE_HANDOFF_REQUIRED');
  const handoffBytes = readFileSync(sourceArtifacts.handoff.path);
  if (
    createHash('sha256').update(handoffBytes).digest('hex') !==
    sourceArtifacts.handoff.handoffArtifactSha256
  )
    throw new Error('PRODUCTION_LIVE_SOURCE_HANDOFF_HASH_MISMATCH');
  const handoff: unknown = JSON.parse(handoffBytes.toString('utf8'));
  if (handoff === null || typeof handoff !== 'object')
    throw new Error('PRODUCTION_LIVE_SOURCE_HANDOFF_INVALID');
  const historyStartTimestamp = (handoff as Record<string, unknown>).createdAt;
  const validatedCheckpoint: unknown = validateDecibelAuthenticatedBtcResyncCheckpointV1(
    JSON.parse(
      readFileSync('research/decibel_authenticated_btc_resync_checkpoint_v1.json', 'utf8'),
    ),
  );
  if (validatedCheckpoint === null || typeof validatedCheckpoint !== 'object')
    throw new Error('PRODUCTION_LIVE_SOURCE_BASELINE_INVALID');
  const checkpoint = validatedCheckpoint as Record<string, unknown>;
  if (checkpoint.priorFrozenManifestBodyHash !== manifest.manifestBodyHashSha256)
    throw new Error('PRODUCTION_LIVE_SOURCE_BASELINE_MANIFEST_MISMATCH');
  const identity = frozen.identity;
  if (
    (identity.side !== 'BUY' && identity.side !== 'SELL') ||
    typeof identity.venueOrderId !== 'string' ||
    typeof identity.venueClientOrderId !== 'string' ||
    typeof identity.marketAddress !== 'string' ||
    typeof identity.quantity !== 'number' ||
    typeof historyStartTimestamp !== 'number' ||
    !Number.isSafeInteger(historyStartTimestamp) ||
    historyStartTimestamp < 0 ||
    !Array.isArray(checkpoint.allAccountFillIds) ||
    checkpoint.allAccountFillIds.some((fillId) => typeof fillId !== 'string')
  )
    throw new Error('PRODUCTION_LIVE_SOURCE_BASELINE_INVALID');
  const reconciledAccountFillIds = checkpoint.allAccountFillIds.filter(
    (fillId): fillId is string => typeof fillId === 'string',
  );
  return Object.freeze({
    historyStartTimestamp,
    fillIds: frozen.fillIds,
    reconciledAccountFillIds: Object.freeze(reconciledAccountFillIds),
    venueOrderId: identity.venueOrderId,
    venueClientOrderId: identity.venueClientOrderId,
    side: identity.side,
    marketAddress: identity.marketAddress,
    quantity: identity.quantity,
  });
}

function isStrategyClientOrderId(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && /^dpvr1-[bs]-\d+-[0-9a-f]{32}$/.test(value);
}

function makeSDKReader(environment: NodeJS.ProcessEnv): DecibelProductionLiveAuthenticatedReaderV1 {
  const config = loadConfig(environment);
  if (config.network !== 'mainnet') throw new Error('PRODUCTION_LIVE_SOURCE_MAINNET_REQUIRED');
  const initialized = (async () => {
    await loadDecibelSdkRuntimeV1();
    const [sdkModule, clientModule] = await Promise.all([
      import('@decibeltrade/sdk'),
      import('./decibel_client.js'),
    ]);
    const sdk = sdkModule as unknown as {
      DecibelReadDex: new (configuration: unknown, options: object) => sdk_read_adapter;
      MAINNET_CONFIG: unknown;
    };
    const client = clientModule as unknown as {
      decibel_client: new (configuration: ReturnType<typeof loadConfig>) => market_client_adapter;
    };
    return {
      Reader: new sdk.DecibelReadDex(
        sdk.MAINNET_CONFIG,
        config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
      ),
      MarketClient: new client.decibel_client(config),
    };
  })();
  const adapter: DecibelProductionLiveAuthenticatedReaderV1 = {
    readPositions: async (subaccount: string, marketAddress: string) =>
      (await initialized).Reader.userPositions.getByAddr({
        subAddr: subaccount,
        marketAddr: marketAddress,
        includeDeleted: false,
        limit: 10,
      }),
    readOpenOrders: async (subaccount: string) =>
      (
        await (
          await initialized
        ).Reader.userOpenOrders.getByAddr({
          subAddr: subaccount,
          limit: 200,
          offset: 0,
        })
      ).items,
    readOrderHistory: async (subaccount: string, startTimestamp: number, endTimestamp: number) => {
      const result = await (
        await initialized
      ).Reader.userOrderHistory.getByAddr({
        subAddr: subaccount,
        limit: 200,
        offset: 0,
        startTimestamp,
        endTimestamp,
        sortDir: 'ASC',
      });
      if ((result.total_count ?? result.items.length) > result.items.length)
        throw new Error('PRODUCTION_LIVE_SOURCE_ORDER_HISTORY_TRUNCATED');
      return result.items;
    },
    readTradeHistory: async (subaccount: string, startTimestamp: number, endTimestamp: number) => {
      const result = await (
        await initialized
      ).Reader.userTradeHistory.getByAddr({
        subAddr: subaccount,
        limit: 200,
        offset: 0,
        startTimestamp,
        endTimestamp,
        sortDir: 'ASC',
      });
      if ((result.total_count ?? result.items.length) > result.items.length)
        throw new Error('PRODUCTION_LIVE_SOURCE_TRADE_HISTORY_TRUNCATED');
      return result.items;
    },
    readActiveTwaps: async (subaccount: string) =>
      (await initialized).Reader.userActiveTwaps.getByAddr({ subAddr: subaccount }),
    readBulkOrders: (subaccount: string, marketAddress: string) =>
      initialized.then(({ Reader }) =>
        Reader.userBulkOrders.getByAddr({ subAddr: subaccount, market: marketAddress }),
      ),
    readMarketMetadata: () =>
      initialized.then(({ MarketClient }) => MarketClient.getBTCMarketMetadata()),
    readCurrentBook: (marketAddress: string) =>
      initialized.then(({ MarketClient }) => MarketClient.getBTCCurrentBook(marketAddress)),
    close: async () => (await initialized).MarketClient.closeWebSocket(),
  };
  return Object.freeze(adapter);
}

function normalizeOpenOrders(
  rows: readonly open_order_row[],
  marketAddress: string,
  strategyConfigId: string,
): readonly decibel_authenticated_strategy_order_v1[] {
  return Object.freeze(
    rows
      .filter((row) => row.market === marketAddress)
      .map((row) => {
        const known = isStrategyClientOrderId(row.client_order_id);
        return Object.freeze({
          venueOrderId: row.order_id,
          clientOrderId: row.client_order_id ?? '',
          strategyConfigId: known ? strategyConfigId : null,
          market: row.market,
          side: row.is_buy ? ('BUY' as const) : ('SELL' as const),
          price: row.price ?? Number.NaN,
          quantity: row.remaining_size ?? row.orig_size ?? Number.NaN,
          orderType: 'LIMIT' as const,
          timeInForce: 'PostOnly' as const,
          postOnly: true as const,
        });
      })
      .sort((left, right) => left.venueOrderId.localeCompare(right.venueOrderId)),
  );
}

function buildStrategyFillLedger(
  orders: readonly order_history_row[],
  trades: readonly trade_history_row[],
  marketAddress: string,
  receivedAt: number,
  baseline: authenticated_activity_baseline,
): decibel_actual_fill_ledger_v1 {
  const strategyOrders: decibel_actual_order_truth_v1[] = orders
    .filter(
      (order) => order.market === marketAddress && isStrategyClientOrderId(order.client_order_id),
    )
    .map((order) => ({
      venueOrderId: order.order_id,
      localIntentId: order.client_order_id,
      localExecutionRequestId: order.client_order_id,
      marketAddress: order.market,
      side: order.is_buy ? ('BUY' as const) : ('SELL' as const),
      requestedQuantity: order.orig_size ?? 0,
    }))
    .filter((order) => order.requestedQuantity > 0);
  if (
    baseline.marketAddress === marketAddress &&
    trades.some(
      (trade) =>
        baseline.fillIds.includes(trade.trade_id) &&
        trade.order_id === baseline.venueOrderId &&
        trade.client_order_id === baseline.venueClientOrderId,
    ) &&
    !strategyOrders.some((order) => order.venueOrderId === baseline.venueOrderId)
  )
    strategyOrders.push({
      venueOrderId: baseline.venueOrderId,
      localIntentId: baseline.venueClientOrderId,
      localExecutionRequestId: baseline.venueClientOrderId,
      marketAddress,
      side: baseline.side,
      requestedQuantity: baseline.quantity,
    });
  const byOrder = new Map(strategyOrders.map((order) => [order.venueOrderId, order]));
  let ledger = createDecibelActualFillLedgerV1(strategyOrders);
  for (const trade of [...trades].sort(
    (left, right) =>
      left.transaction_unix_ms - right.transaction_unix_ms ||
      left.trade_id.localeCompare(right.trade_id),
  )) {
    const order = byOrder.get(trade.order_id);
    if (
      order === undefined ||
      trade.market !== marketAddress ||
      trade.source !== 'OrderFill' ||
      trade.account.length === 0
    )
      continue;
    ledger = applyDecibelActualFillTruthV1(ledger, {
      venueFillId: trade.trade_id,
      venueOrderId: trade.order_id,
      localExecutionRequestId: order.localExecutionRequestId,
      marketAddress,
      side: order.side,
      executedPrice: trade.price,
      executedBaseQuantity: trade.size,
      executedUsdNotional: trade.price * trade.size,
      makerOrTaker: 'MAKER',
      receivedAt: new Date(receivedAt),
      venueTimestamp: new Date(trade.transaction_unix_ms),
      fee: {
        availability: Number.isFinite(trade.fee_amount) ? 'AVAILABLE' : 'UNAVAILABLE',
        amount: Number.isFinite(trade.fee_amount) ? trade.fee_amount : null,
        currency: Number.isFinite(trade.fee_amount) ? 'USD' : null,
      },
      rebate: {
        availability: trade.is_rebate ? 'AVAILABLE' : 'UNAVAILABLE',
        amount: null,
        currency: null,
      },
      executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM',
    });
  }
  return ledger;
}

export class decibel_production_live_state_source_v1 implements DecibelProductionLiveStateSourceV1 {
  private PreviousSnapshot: decibel_production_live_snapshot_v1 | null = null;
  private SnapshotBeforeLatest: decibel_production_live_snapshot_v1 | null = null;

  public constructor(
    private readonly Reader: DecibelProductionLiveAuthenticatedReaderV1,
    private readonly Environment: NodeJS.ProcessEnv,
    private readonly getNow: () => number = Date.now,
  ) {}

  public async readAuthenticatedSnapshot(): Promise<decibel_production_live_snapshot_v1> {
    const configuration = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    const baseline = loadAuthenticatedActivityBaseline();
    const requestedAt = this.getNow();
    if (
      baseline.historyStartTimestamp > requestedAt ||
      requestedAt - baseline.historyStartTimestamp > DECIBEL_MAX_HISTORY_RANGE_MS
    )
      throw new Error('PRODUCTION_LIVE_SOURCE_BASELINE_HISTORY_RANGE_INVALID');
    const historyStart = baseline.historyStartTimestamp;
    let values: Awaited<ReturnType<typeof this.readAll>>;
    try {
      values = await this.readAll(
        configuration.DECIBEL_SUBACCOUNT_ADDRESS,
        historyStart,
        requestedAt,
      );
    } catch (error) {
      throw new Error('PRODUCTION_AUTHENTICATED_READ_REQUIRED', { cause: error });
    }
    const receivedAt = this.getNow();
    if (
      values.metadata.marketAddress !== DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 ||
      values.metadata.symbol !== 'BTC/USD'
    )
      throw new Error('PRODUCTION_LIVE_SOURCE_MARKET_MISMATCH');
    const book = CurrentBookSchema.parse(values.book);
    if (book.market !== DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 || book.best_ask <= book.best_bid)
      throw new Error('PRODUCTION_LIVE_SOURCE_BOOK_INVALID');
    if (book.unix_ms > receivedAt) throw new Error('PRODUCTION_LIVE_SOURCE_BOOK_FUTURE');
    if (receivedAt - book.unix_ms > configuration.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS)
      throw new Error('PRODUCTION_LIVE_SOURCE_BOOK_STALE');
    if (
      values.positions.some(
        (position) => position.user !== configuration.DECIBEL_SUBACCOUNT_ADDRESS,
      )
    )
      throw new Error('PRODUCTION_LIVE_SOURCE_SUBACCOUNT_MISMATCH');
    const BTCPositions = values.positions.filter(
      (position) => position.market === DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    );
    if (BTCPositions.length > 1) throw new Error('PRODUCTION_LIVE_SOURCE_POSITION_AMBIGUOUS');
    const position = BTCPositions[0];
    const actualInventoryBase = position?.size ?? 0;
    const openOrders = normalizeOpenOrders(
      values.openOrders,
      DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      configuration.DECIBEL_PRODUCTION_LIVE_STRATEGY_CONFIG_ID,
    );
    const bulk = resolveDecibelBulkOrderActivityV1({
      configuredSubaccount: configuration.DECIBEL_SUBACCOUNT_ADDRESS,
      configuredMarket: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      records: values.bulkOrders,
      readSuccessful: true,
    });
    const ledger = buildStrategyFillLedger(
      values.orderHistory,
      values.tradeHistory,
      DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      receivedAt,
      baseline,
    );
    const knownOrderIds = new Set(ledger.orders.map((order) => order.venueOrderId));
    const outOfBandBTCFillCount = values.tradeHistory.filter(
      (trade) =>
        trade.market === DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 &&
        trade.source === 'OrderFill' &&
        !knownOrderIds.has(trade.order_id) &&
        !baseline.reconciledAccountFillIds.includes(trade.trade_id),
    ).length;
    const semantic = {
      subaccount: configuration.DECIBEL_SUBACCOUNT_ADDRESS,
      market: values.metadata.marketAddress,
      metadata: {
        symbol: values.metadata.symbol,
        tickSize: values.metadata.tickSize,
        lotSize: values.metadata.lotSize,
        minimumSize: values.metadata.minimumSize,
        mode: values.metadata.mode,
      },
      book: { bestBid: book.best_bid, bestAsk: book.best_ask },
      position: actualInventoryBase,
      positionTransactionIds: BTCPositions.map((row) => ({
        market: row.market,
        size: row.size,
        tp: row.tp_order_id,
        sl: row.sl_order_id,
      })),
      openOrders: openOrders.map((order) => ({
        venueOrderId: order.venueOrderId,
        clientOrderId: order.clientOrderId,
        strategyConfigId: order.strategyConfigId,
        side: order.side,
        price: order.price,
        quantity: order.quantity,
      })),
      activeTwaps: values.activeTwaps.filter(
        (twap) => twap.market === DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      ).length,
      activeTpSl: BTCPositions.filter((row) => row.tp_order_id !== null || row.sl_order_id !== null)
        .length,
      bulk: { classification: bulk.classification, activeBulkSize: bulk.activeBulkSize },
      strategyFillIds: ledger.fills.map((fill) => fill.venueFillId).sort(),
      outOfBandBTCFillCount,
    };
    const strategyInput: decibel_authenticated_passive_recycling_input_v1 = {
      sessionId:
        configuration.DECIBEL_PRODUCTION_LIVE_SESSION_ID ??
        `production-live-${configuration.DECIBEL_SUBACCOUNT_ADDRESS}`,
      strategyConfigId: configuration.DECIBEL_PRODUCTION_LIVE_STRATEGY_CONFIG_ID,
      configuredSubaccount: configuration.DECIBEL_SUBACCOUNT_ADDRESS,
      authenticatedSubaccount: position?.user ?? configuration.DECIBEL_SUBACCOUNT_ADDRESS,
      configuredNetwork: 'mainnet',
      observedNetwork: 'mainnet',
      now: receivedAt,
      market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      metadata: {
        marketAddress: values.metadata.marketAddress,
        symbol: values.metadata.symbol,
        tickSize: values.metadata.tickSize,
        lotSize: values.metadata.lotSize,
        minimumSize: values.metadata.minimumSize,
        mode: values.metadata.mode,
        observedAt: receivedAt,
      },
      book: { bestBid: book.best_bid, bestAsk: book.best_ask, observedAt: book.unix_ms },
      maxBboAgeMs: configuration.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS,
      actualInventoryBase,
      inventoryDirectionProven: true,
      openOrders,
      activeTwapCount: values.activeTwaps.filter(
        (twap) => twap.market === DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
      ).length,
      activeTpSlCount: BTCPositions.filter(
        (row) => row.tp_order_id !== null || row.sl_order_id !== null,
      ).length,
      activeBulkOrderCount: bulk.bulkOrderActivityClear ? 0 : 1,
      manualOrDelegatedActivityCount: outOfBandBTCFillCount,
      unresolvedExecutionPlanCount: 0,
      persistenceAvailable: true,
      targetExternalMakerVolumeUsd:
        configuration.DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD ?? null,
      actualFillLedger: ledger,
    };
    const snapshot: decibel_production_live_snapshot_v1 = Object.freeze({
      sourceStateHash: canonicalHash(semantic),
      minimumNotionalUsd: configuration.DECIBEL_PRODUCTION_LIVE_MIN_NOTIONAL_USD,
      maximumNotionalUsd: configuration.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD,
      input: strategyInput,
    });
    this.SnapshotBeforeLatest = this.PreviousSnapshot;
    this.PreviousSnapshot = snapshot;
    return snapshot;
  }

  public reconcileIntent(
    _intentId: string,
    snapshot: decibel_production_live_snapshot_v1,
  ): Promise<'ORDER_OPEN' | 'PARTIAL_FILL' | 'FULL_FILL' | 'ORDER_CANCELLED' | 'ORDER_NOT_FOUND'> {
    const previous = this.SnapshotBeforeLatest;
    if (previous === null) {
      if (snapshot.input.openOrders.length > 0) return Promise.resolve('ORDER_OPEN');
      throw new Error('PRODUCTION_RECONCILIATION_AMBIGUOUS');
    }
    const previousOrders = new Set(previous.input.openOrders.map((order) => order.venueOrderId));
    const currentOrders = new Set(snapshot.input.openOrders.map((order) => order.venueOrderId));
    const previousFills = new Set(
      previous.input.actualFillLedger.fills.map((fill) => fill.venueFillId),
    );
    const newFill = snapshot.input.actualFillLedger.fills.some(
      (fill) => !previousFills.has(fill.venueFillId),
    );
    if (newFill) return Promise.resolve(currentOrders.size > 0 ? 'PARTIAL_FILL' : 'FULL_FILL');
    if ([...currentOrders].some((orderId) => !previousOrders.has(orderId)))
      return Promise.resolve('ORDER_OPEN');
    if ([...previousOrders].some((orderId) => !currentOrders.has(orderId)))
      return Promise.resolve('ORDER_CANCELLED');
    if (currentOrders.size > 0) return Promise.resolve('ORDER_OPEN');
    throw new Error('PRODUCTION_RECONCILIATION_AMBIGUOUS');
  }

  public async close(): Promise<void> {
    await this.Reader.close?.();
  }

  private async readAll(subaccount: string, startTimestamp: number, endTimestamp: number) {
    const [positions, openOrders, orderHistory, tradeHistory, activeTwaps, bulkOrders, metadata] =
      await Promise.all([
        this.Reader.readPositions(subaccount, DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1),
        this.Reader.readOpenOrders(subaccount),
        this.Reader.readOrderHistory(subaccount, startTimestamp, endTimestamp),
        this.Reader.readTradeHistory(subaccount, startTimestamp, endTimestamp),
        this.Reader.readActiveTwaps(subaccount),
        this.Reader.readBulkOrders(subaccount, DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1),
        this.Reader.readMarketMetadata(),
      ]);
    const book = await this.Reader.readCurrentBook(DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1);
    return {
      positions,
      openOrders,
      orderHistory,
      tradeHistory,
      activeTwaps,
      bulkOrders,
      metadata,
      book,
    };
  }
}

export function createDecibelProductionLiveStateSourceV1(
  options: Readonly<{
    environment?: NodeJS.ProcessEnv;
    reader?: DecibelProductionLiveAuthenticatedReaderV1;
    getNow?: () => number;
  }> = {},
): DecibelProductionLiveStateSourceV1 {
  const environment = options.environment ?? process.env;
  return new decibel_production_live_state_source_v1(
    options.reader ?? makeSDKReader(environment),
    environment,
    options.getNow,
  );
}
