import {
  normalizeDecibelExchangeCandlesV1,
  type decibel_exchange_candle_v1,
} from './decibel_exchange_candles_v1.js';
import { isDecibelOwnedCatastropheStopV1 } from './decibel_catastrophe_stop_v1.js';
import {
  CapacityDepthSchema,
  parseDecibelVenueMarginRulesV1,
  type capacity_venue_margin_rules_v1,
  assembleDecibelCapacityCertificateV1,
  parseDecibelCapacityReceiptV1,
  type capacity_receipt_v1,
  type capacity_depth_v1,
} from './decibel_capacity_producers_v1.js';
import { createHash } from 'node:crypto';
import type { decibel_capacity_inputs_v1 } from './decibel_risk_capacity_v1.js';
import type {
  decibel_selected_leverage_v1,
  decibel_account_fee_rates_v1,
} from './decibel_authenticated_http_reader_v1.js';
import { readFileSync } from 'node:fs';
import { DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1 } from './decibel_adverse_selection_evidence_v1.js';

import { Aptos, AptosConfig, type Network } from '@aptos-labs/ts-sdk';
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
import { isDecibelPassiveRecyclingClientOrderIdV1 } from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import { validateDecibelAuthenticatedLiveCanaryManifestV1 } from './decibel_authenticated_passive_recycling_live_state_v1.js';
import { loadLatestDecibelAuthenticatedBtcResyncCheckpointV1 } from './decibel_authenticated_btc_resync_checkpoint_chain_v1.js';
import {
  resolveDecibelBulkOrderActivityV1,
  type decibel_bulk_order_record_v1,
} from './decibel_bulk_order_activity_resolution_v1.js';
import {
  filterDecibelBTCMarketActivityV1,
  getDecibelMarketIdentityDiagnosticsV1,
  isDecibelBTCMarketActivityV1,
  isActiveDecibelTwapV1,
  normalizeDecibelMarketAddressV1,
} from './decibel_btc_market_activity_scope_v1.js';
import {
  assertDecibelHTTPReadAllowedV1,
  enterDecibelHTTPReadBackoffForErrorV1,
  isDecibelHTTP429V1,
} from './decibel_http_read_backoff_v1.js';
import type { BTC_market_metadata } from './decibel_client.js';
import type { execution_intent_v1 } from './decibel_execution_intent_v1.js';
import { loadConfig } from './config.js';
import { DECIBEL_BTC_USD_MARKET_ADDRESS_V1 } from './decibel_btc_market_v1.js';
import type {
  DecibelProductionLiveStateSourceV1,
  decibel_production_live_snapshot_v1,
} from './decibel_production_live_types_v1.js';
import type { reconciliation_state_v1 } from './decibel_execution_lifecycle_v1.js';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';
import { createDecibelBoundedFetchClientV1 } from './decibel_bounded_fetch_client_v1.js';
import { resolveDecibelAuthoritativeOrderEvidenceV1 } from './decibel_authoritative_order_reconciliation_v1.js';
import {
  createDecibelAuthenticatedHttpWorkerClientV1,
  DECIBEL_AUTHENTICATED_HTTP_WORKER_TRANSPORT_ID_V1,
} from './decibel_authenticated_http_worker_client_v1.js';

export const DECIBEL_PRODUCTION_LIVE_STATE_SOURCE_V1 =
  'DECIBEL_PRODUCTION_LIVE_STATE_SOURCE_V1' as const;
export const DECIBEL_MAX_HISTORY_RANGE_MS = 15_552_000_000 as const;
/** The rolled window stays this far inside the venue's 180-day history limit. */
export const DECIBEL_HISTORY_ROLL_MARGIN_MS_V1 = 60 * 60 * 1000;
/** Orders are read this much further back than fills, so a fill near the window edge still
 * finds the strategy order that produced it. */
export const DECIBEL_ORDER_ATTRIBUTION_LOOKBACK_MS_V1 = 7 * 24 * 60 * 60 * 1000;

/**
 * History window of an authenticated read (added 2026-11-17). Before, a baseline older than
 * the 180-day venue limit failed every read (the first wallet's baseline of 2026-09-01 would
 * have stopped the bot on 2027-02-28). The window now rolls: it starts at the baseline while
 * that is recent enough, else at the oldest instant the venue still serves. Fills that leave
 * the window are older than any live session, whose volume and PnL come from session fills.
 */
export function resolveDecibelHistoryWindowV1(
  baselineStart: number,
  now: number,
): Readonly<{ orderStart: number; tradeStart: number; rolled: boolean }> {
  if (!Number.isSafeInteger(baselineStart) || baselineStart < 0 || baselineStart > now)
    throw new Error('PRODUCTION_LIVE_SOURCE_BASELINE_HISTORY_RANGE_INVALID');
  const earliest = now - DECIBEL_MAX_HISTORY_RANGE_MS + DECIBEL_HISTORY_ROLL_MARGIN_MS_V1;
  const tradeEarliest = earliest + DECIBEL_ORDER_ATTRIBUTION_LOOKBACK_MS_V1;
  return Object.freeze({
    orderStart: Math.max(baselineStart, earliest),
    tradeStart: Math.max(baselineStart, tradeEarliest),
    rolled: baselineStart < tradeEarliest,
  });
}

const ProductionLiveSourceEnvironmentSchema = z.object({
  DECIBEL_SUBACCOUNT_ADDRESS: z.string().trim().min(1),
  DECIBEL_PRODUCTION_LIVE_SESSION_ID: z.string().trim().min(1).optional(),
  DECIBEL_PRODUCTION_LIVE_STRATEGY_CONFIG_ID: z
    .string()
    .trim()
    .min(1)
    .default('DECIBEL_MARKET_MAKER_V1_PASSIVE_VOLUME_RECYCLING_V1'),
  DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS: z.coerce.number().int().positive().default(5_000),
  DECIBEL_PRODUCTION_LIVE_MAX_CLOCK_SKEW_MS: z.coerce.number().int().nonnegative().default(5_000),
  DECIBEL_PRODUCTION_LIVE_MIN_NOTIONAL_USD: z.coerce.number().positive().default(10),
  DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD: z.coerce.number().positive().default(100),
  MAX_EFFECTIVE_LEVERAGE: z.coerce.number().min(1).max(40).default(1),
  DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD: z.coerce.number().positive().optional(),
  DECIBEL_PASSIVE_RECYCLING_BASELINE_VOLUME_USD: z.coerce.number().nonnegative().default(0),
  DECIBEL_PRODUCTION_TUI_HALF_SPREAD_BPS: z.coerce.number().positive().default(5),
  DECIBEL_PRODUCTION_TUI_MAX_POSITION_BASE: z.coerce.number().positive().optional(),
  DECIBEL_PRODUCTION_MAKER_FEE_BPS: z.coerce.number().nonnegative().optional(),
  DECIBEL_PRODUCTION_ESTIMATED_GAS_COST_USD: z.coerce.number().nonnegative().optional(),
  DECIBEL_PRODUCTION_ADVERSE_SELECTION_BUFFER_BPS: z.coerce.number().nonnegative().optional(),
  DECIBEL_PRODUCTION_EDGE_SAFETY_MARGIN_BPS: z.coerce.number().nonnegative().default(1),
  DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: z
    .string()
    .trim()
    .min(1)
    .default('data/decibel_production_economic_inputs_v1.json'),
  DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(3_600_000),
});

const EconomicEvidenceSchema = z.object({
  observedAt: z.number().int().positive(),
  makerFeeObservedAt: z.number().int().positive().optional(),
  makerFeeBps: z.number().nonnegative(),
  makerFeeSource: z.enum([
    'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
    'DECIBEL_AUTHENTICATED_STRATEGY_MAKER_FILL_HISTORY',
  ]),
  takerFeeBps: z.number().nonnegative().optional(),
  takerFeeSource: z.literal('DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES').optional(),
  takerFeeObservedAt: z.number().int().positive().optional(),
  conservativeGasCostUsd: z.number().nonnegative(),
  gasCostObservedAt: z.number().int().positive().optional(),
  gasCostSource: z.literal('HISTORICAL_SUCCESSFUL_TX_P95'),
  aptUsd: z.number().positive().optional(),
  aptUsdObservedAt: z.number().int().positive().optional(),
  aptUsdSource: z.string().trim().min(1).optional(),
  adverseSelectionBufferBps: z.number().nonnegative().optional().catch(undefined),
  adverseSelectionObservedAt: z.number().int().positive().optional().catch(undefined),
  adverseSelectionSource: z
    .enum(['SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95', 'GLOBAL_FALLBACK'])
    .optional()
    .catch(undefined),
  adverseSelectionRegime: z
    .enum(['QUIET', 'NORMAL', 'FAST', 'ONE_SIDED', 'THIN', 'GLOBAL'])
    .optional()
    .catch(undefined),
  adverseSelectionRawSampleCount: z.number().int().nonnegative().optional().catch(undefined),
  adverseSelectionEffectiveSampleCount: z
    .number()
    .int()
    .min(DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1)
    .optional()
    .catch(undefined),
  adverseSelectionRepresentative: z.literal(true).optional().catch(undefined),
  candidateAdverseSelection: z
    .array(
      z.object({
        side: z.enum(['BUY', 'SELL']),
        distanceBps: z.number().nonnegative(),
        p95AdverseSelectionBps: z.number().nonnegative(),
        sampleCount: z.number().int().nonnegative(),
        observedAt: z.number().int().positive(),
      }),
    )
    .optional()
    .catch(undefined),
});

export function loadDecibelProductionEconomicEvidenceV1(
  path: string,
  now: number,
  maximumAgeMs: number,
): z.infer<typeof EconomicEvidenceSchema> | null {
  return validateDecibelProductionEconomicEvidenceV1(path, now, maximumAgeMs).evidence;
}

export function validateDecibelProductionEconomicEvidenceV1(
  path: string,
  now: number,
  maximumAgeMs: number,
  document?: unknown,
): Readonly<{
  evidence: z.infer<typeof EconomicEvidenceSchema> | null;
  reason: string | null;
}> {
  try {
    const evidence = EconomicEvidenceSchema.parse(
      document === undefined ? JSON.parse(readFileSync(path, 'utf8')) : document,
    );
    const timestamps = [
      ['MAKER_FEE', evidence.makerFeeObservedAt ?? evidence.observedAt],
      ['GAS_COST', evidence.gasCostObservedAt ?? evidence.observedAt],
      ['APT_USD', evidence.aptUsdObservedAt ?? evidence.gasCostObservedAt ?? evidence.observedAt],
    ] as const;
    const future = timestamps.find(([, timestamp]) => timestamp > now);
    if (future !== undefined)
      return Object.freeze({ evidence: null, reason: `${future[0]}_EVIDENCE_FUTURE` });
    const stale = timestamps.find(([, timestamp]) => now - timestamp > maximumAgeMs);
    if (stale !== undefined)
      return Object.freeze({ evidence: null, reason: `${stale[0]}_EVIDENCE_STALE` });
    // Adverse remains optional research/capacity evidence. Preserve its original
    // provenance, freshness and sample requirements without gating fee/gas.
    const adverseValid =
      evidence.adverseSelectionBufferBps !== undefined &&
      evidence.adverseSelectionObservedAt !== undefined &&
      evidence.adverseSelectionObservedAt <= now &&
      now - evidence.adverseSelectionObservedAt <= maximumAgeMs &&
      evidence.adverseSelectionSource !== undefined &&
      evidence.adverseSelectionRegime !== undefined &&
      evidence.adverseSelectionRawSampleCount !== undefined &&
      evidence.adverseSelectionEffectiveSampleCount !== undefined &&
      evidence.adverseSelectionRepresentative === true;
    return Object.freeze({
      evidence: {
        ...evidence,
        adverseSelectionSource: adverseValid ? evidence.adverseSelectionSource : undefined,
        adverseSelectionBufferBps: adverseValid ? evidence.adverseSelectionBufferBps : undefined,
        adverseSelectionObservedAt: adverseValid ? evidence.adverseSelectionObservedAt : undefined,
        candidateAdverseSelection: (evidence.candidateAdverseSelection ?? []).filter(
          (candidate) => now >= candidate.observedAt && now - candidate.observedAt <= maximumAgeMs,
        ),
      },
      reason: null,
    });
  } catch (error) {
    return Object.freeze({
      evidence: null,
      reason:
        error instanceof z.ZodError
          ? `SCHEMA_INVALID:${error.issues[0]?.path.join('.') ?? 'UNKNOWN_FIELD'}`
          : error instanceof Error && 'code' in error && error.code === 'ENOENT'
            ? 'FILE_NOT_FOUND'
            : 'FILE_INVALID',
    });
  }
}

type position_row = Readonly<{
  estimated_liquidation_price?: number;
  user_leverage?: number;
  entry_price?: number;
  is_isolated?: boolean;
  market: string;
  market_address?: string;
  market_id?: string;
  user: string;
  size: number;
  tp_order_id: string | null;
  sl_order_id: string | null;
  sl_trigger_price?: number | null;
  sl_limit_price?: number | null;
}>;
type account_overview_row = Readonly<{
  secondary_collateral?: unknown;
  perp_equity_balance: number;
  total_margin: number;
  cross_available_to_trade: number;
  unrealized_pnl?: number;
  maintenance_margin?: number;
  cross_margin_ratio?: number;
  margin_deficit?: number;
}>;

export function getDecibelAuthoritativeAvailableMarginUsdV1(
  accountOverview: Pick<account_overview_row, 'cross_available_to_trade'>,
): number {
  if (
    !Number.isFinite(accountOverview.cross_available_to_trade) ||
    accountOverview.cross_available_to_trade < 0
  )
    throw new Error('PRODUCTION_LIVE_SOURCE_AVAILABLE_MARGIN_INVALID');
  return accountOverview.cross_available_to_trade;
}
type open_order_row = Readonly<{
  market: string;
  market_address?: string;
  market_id?: string;
  order_id: string;
  client_order_id: string | null;
  orig_size: number | null;
  remaining_size: number | null;
  price: number | null;
  is_buy: boolean;
  is_tpsl: boolean;
  is_reduce_only?: boolean;
}>;
type order_history_row = Readonly<{
  market: string;
  market_address?: string;
  market_id?: string;
  client_order_id: string;
  order_id: string;
  orig_size: number | null;
  price: number | null;
  is_buy: boolean;
  status?: string;
  is_reduce_only?: boolean;
  order_status?: string;
  state?: string;
  remaining_size?: number | null;
}>;
type trade_history_row = Readonly<{
  action?: 'CloseLong' | 'CloseShort' | 'OpenLong' | 'OpenShort' | 'Net';
  transaction_version?: number;
  account: string;
  market: string;
  market_address?: string;
  market_id?: string;
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

function getTradeFragmentIdentity(trade: trade_history_row): string {
  return JSON.stringify([
    trade.account,
    trade.market,
    trade.source,
    trade.trade_id,
    trade.order_id,
    trade.client_order_id ?? null,
    trade.transaction_version ?? null,
    trade.transaction_unix_ms,
    trade.action ?? null,
    trade.size,
    trade.price,
    trade.fee_amount,
    trade.is_rebate,
  ]);
}

export function aggregateDecibelTradeHistoryFragmentsV1(
  trades: readonly trade_history_row[],
): readonly trade_history_row[] {
  const aggregated = new Map<string, trade_history_row>();
  const seenFragments = new Set<string>();
  for (const trade of trades) {
    const fragmentKey = getTradeFragmentIdentity(trade);
    if (seenFragments.has(fragmentKey)) continue;
    seenFragments.add(fragmentKey);
    const key = `${trade.trade_id}\0${trade.order_id}\0${trade.client_order_id ?? ''}`;
    const prior = aggregated.get(key);
    if (prior === undefined) {
      aggregated.set(key, Object.freeze({ ...trade }));
      continue;
    }
    if (
      prior.account !== trade.account ||
      prior.market !== trade.market ||
      prior.source !== trade.source ||
      prior.price !== trade.price ||
      prior.transaction_unix_ms !== trade.transaction_unix_ms ||
      prior.transaction_version !== trade.transaction_version ||
      prior.transaction_version !== trade.transaction_version ||
      prior.is_rebate !== trade.is_rebate
    )
      throw new Error('PRODUCTION_LIVE_SOURCE_FILL_FRAGMENT_IDENTITY_CONFLICT');
    aggregated.set(
      key,
      Object.freeze({
        ...prior,
        size: Number((prior.size + trade.size).toFixed(12)),
        fee_amount: Number((prior.fee_amount + trade.fee_amount).toFixed(12)),
      }),
    );
  }
  return Object.freeze([...aggregated.values()]);
}

export type decibel_order_identity_evidence_v1 = Readonly<{
  observedAt: number;
  queryStartTimestamp: number;
  queryEndTimestamp: number;
  venueOrderId: string;
  clientOrderId: string;
  openOrders: readonly open_order_row[];
  terminalOrders: readonly Readonly<{
    venueOrderId: string;
    clientOrderId: string;
    state: 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'REJECTED';
    side?: 'BUY' | 'SELL';
    originalQuantity: number | null;
    remainingQuantity: number | null;
  }>[];
  fills: readonly Readonly<{
    venueFillId: string;
    quantity: number;
    price: number;
    transactionTimestamp: number;
    transactionVersion?: string;
  }>[];
  transactionState: 'COMMITTED' | 'NOT_FOUND' | null;
}>;
type twap_row = Readonly<{
  market: string;
  market_address?: string;
  market_id?: string;
  is_active?: boolean;
  status?: string;
}>;
type sdk_read_adapter = Readonly<{
  aptos: {
    getLedgerInfo(): Promise<{ ledger_timestamp: string; ledger_version: string }>;
    getTransactionByHash(input: { transactionHash: string }): Promise<unknown>;
  };
  accountOverview: { getByAddr(input: object): Promise<account_overview_row> };
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
  candlesticks: {
    getByName(
      input: object,
    ): Promise<readonly Readonly<{ t: number; o: number; h: number; l: number; c: number }>[]>;
  };
}>;

export function isDecibelTransactionExpirationProvenV1(
  input: Readonly<{
    ledgerTimestampMicros: string;
    ledgerVersion: string;
    expirationTimestampMs: number;
    transactionNotFound: boolean;
  }>,
): boolean {
  const ledgerTimestampMicros = Number(input.ledgerTimestampMicros);
  const ledgerVersion = Number(input.ledgerVersion);
  return (
    Number.isSafeInteger(ledgerTimestampMicros) &&
    Number.isSafeInteger(ledgerVersion) &&
    ledgerTimestampMicros >= 0 &&
    ledgerVersion >= 0 &&
    Number.isSafeInteger(input.expirationTimestampMs) &&
    input.expirationTimestampMs >= 0 &&
    ledgerTimestampMicros / 1_000 > input.expirationTimestampMs &&
    input.transactionNotFound
  );
}

const CapacityTransactionCache = new WeakMap<object, Map<string, Promise<unknown>>>();
export function createDecibelTransactionEvidenceReaderV1(
  ChainClient: Pick<Aptos, 'getLedgerInfo' | 'getTransactionByHash'>,
) {
  let cache = CapacityTransactionCache.get(ChainClient);
  if (!cache) {
    cache = new Map();
    CapacityTransactionCache.set(ChainClient, cache);
  }
  const readRaw = (hash: string): Promise<unknown> => {
    let pending = cache.get(hash);
    if (pending) return pending;
    pending = ChainClient.getTransactionByHash({ transactionHash: hash })
      .then((raw) => {
        if (String(raw.type) === 'pending_transaction') cache.delete(hash);
        return raw;
      })
      .catch((error: unknown) => {
        cache.delete(hash);
        throw error;
      });
    cache.set(hash, pending);
    return pending;
  };
  return Object.freeze({
    readTransactionReceipt: async (hash: string): Promise<capacity_receipt_v1 | null> =>
      parseDecibelCapacityReceiptV1(await readRaw(hash), hash, Date.now()),
    readTransactionByHash: async (hash: string): Promise<'COMMITTED' | 'NOT_FOUND'> => {
      try {
        const raw = await readRaw(hash);
        if (
          typeof raw !== 'object' ||
          raw === null ||
          !('type' in raw) ||
          raw.type === 'pending_transaction'
        )
          throw new Error('PRODUCTION_TRANSACTION_PENDING');
        return 'COMMITTED';
      } catch (error) {
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? Number(error.status)
            : NaN;
        if (status === 404) return 'NOT_FOUND';
        throw new Error('PRODUCTION_RECONCILIATION_TRANSACTION_LOOKUP_FAILED', { cause: error });
      }
    },
  });
}

type market_client_adapter = Readonly<{
  getBTCMarketMetadata(signal?: AbortSignal): Promise<BTC_market_metadata>;
  getBTCCurrentBook(marketAddress: string): Promise<unknown>;
  getBTCStreamingBook(marketAddress: string): Promise<unknown>;
  getBTCMarketDataDiagnostics(): Readonly<{
    wsConnectionState: 'INIT' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'STALLED';
    wsSubscriptionState: 'UNSUBSCRIBED' | 'SUBSCRIBING' | 'SUBSCRIBED';
    lastWsMessageAgeMs: number | null;
    lastValidBboAgeMs: number | null;
    wsReconnectCount: number;
    wsLastDisconnectReason: string | null;
  }>;
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
  checkpointBodyHashSha256: string;
  resyncTimestamp: number;
  outOfBandFillIds: readonly string[];
}>;

export interface DecibelProductionLiveAuthenticatedReaderV1 {
  readVenueMarginRules?(): Promise<capacity_venue_margin_rules_v1>;
  readAccountRiskInputs?(
    subaccount: string,
    signal?: AbortSignal,
  ): Promise<
    Readonly<{
      leverage: decibel_selected_leverage_v1;
      fees: decibel_account_fee_rates_v1;
    }>
  >;
  getAuthenticatedTransportDiagnostics?(): Promise<
    Readonly<{
      transportId: typeof DECIBEL_AUTHENTICATED_HTTP_WORKER_TRANSPORT_ID_V1;
      baseUrl: string;
      isolatedDispatcher: true;
      internalRetry: false;
      attempts?: number;
      successes?: number;
      failures?: number;
      lastFailure?: string | null;
      lastStage?: string | null;
      lastQueueLatencyMs?: number | null;
      lastHttpLatencyMs?: number | null;
      lastRoundTripLatencyMs?: number | null;
    }>
  >;
  readAccountOverview(subaccount: string, signal?: AbortSignal): Promise<account_overview_row>;
  readPositions(
    subaccount: string,
    marketAddress?: string,
    signal?: AbortSignal,
  ): Promise<readonly position_row[]>;
  readOpenOrders(subaccount: string, signal?: AbortSignal): Promise<readonly open_order_row[]>;
  readOrderHistory(
    subaccount: string,
    startTimestamp: number,
    endTimestamp: number,
    signal?: AbortSignal,
  ): Promise<readonly order_history_row[]>;
  readTradeHistory(
    subaccount: string,
    startTimestamp: number,
    endTimestamp: number,
    signal?: AbortSignal,
  ): Promise<readonly trade_history_row[]>;
  readOrderHistoryExhaustive?(
    subaccount: string,
    startTimestamp: number,
    endTimestamp: number,
    signal?: AbortSignal,
  ): Promise<readonly order_history_row[]>;
  readTradeHistoryExhaustive?(
    subaccount: string,
    startTimestamp: number,
    endTimestamp: number,
    signal?: AbortSignal,
  ): Promise<readonly trade_history_row[]>;
  readActiveTwaps(subaccount: string, signal?: AbortSignal): Promise<readonly twap_row[]>;
  readBulkOrders(
    subaccount: string,
    marketAddress: string,
    signal?: AbortSignal,
  ): Promise<readonly decibel_bulk_order_record_v1[]>;
  readMarketMetadata(signal?: AbortSignal): Promise<BTC_market_metadata>;
  /** Venue 1-minute BTC/USD candles (public, outlier wicks filtered). */
  readCandles1m?(
    startMs: number,
    endMs: number,
    signal?: AbortSignal,
  ): Promise<readonly Readonly<{ t: number; o: number; h: number; l: number; c: number }>[]>;
  readCurrentBook(marketAddress: string): Promise<unknown>;
  readMarketDataDiagnostics?(): ReturnType<market_client_adapter['getBTCMarketDataDiagnostics']>;
  verifyTransactionExpiredUncommitted?(
    transactionHash: string,
    expirationTimestampMs: number,
  ): Promise<boolean>;
  readTransactionReceipt?(transactionHash: string): Promise<capacity_receipt_v1 | null>;
  readTransactionByHash?(transactionHash: string): Promise<'COMMITTED' | 'NOT_FOUND'>;
  close?(): Promise<void> | void;
}

const DECIBEL_HISTORY_PAGE_SIZE_V1 = 200 as const;
const DECIBEL_HISTORY_MAX_OFFSET_V1 = 10_000 as const;

export async function readDecibelPaginatedHistoryV1<T>(
  input: Readonly<{
    readPage(
      offset: number,
      limit: number,
    ): Promise<Readonly<{ items: readonly T[]; totalCount?: number }>>;
  }>,
): Promise<readonly T[]> {
  const rows: T[] = [];
  let expectedTotal: number | undefined;
  for (let offset = 0; offset <= DECIBEL_HISTORY_MAX_OFFSET_V1;) {
    const page = await input.readPage(offset, DECIBEL_HISTORY_PAGE_SIZE_V1);
    const totalCount = page.totalCount;
    if (totalCount !== undefined && (!Number.isSafeInteger(totalCount) || totalCount < 0))
      throw new Error('PRODUCTION_LIVE_SOURCE_HISTORY_TOTAL_INVALID');
    if (totalCount !== undefined) {
      if (expectedTotal !== undefined && expectedTotal !== totalCount)
        throw new Error('PRODUCTION_LIVE_SOURCE_HISTORY_TOTAL_CHANGED');
      expectedTotal = totalCount;
    }
    rows.push(...page.items);
    if (expectedTotal !== undefined) {
      if (rows.length > expectedTotal)
        throw new Error('PRODUCTION_LIVE_SOURCE_HISTORY_TOTAL_INVALID');
      if (rows.length === expectedTotal) return Object.freeze(rows);
      if (page.items.length === 0) throw new Error('PRODUCTION_LIVE_SOURCE_HISTORY_INCOMPLETE');
    } else if (page.items.length < DECIBEL_HISTORY_PAGE_SIZE_V1) return Object.freeze(rows);
    offset += page.items.length;
  }
  throw new Error('PRODUCTION_LIVE_SOURCE_HISTORY_PAGINATION_LIMIT_EXCEEDED');
}

export function normalizeDecibelVenueMarginTimestampV1(
  rules: capacity_venue_margin_rules_v1,
  receivedAt: number,
  maximumClockSkewMs: number,
): capacity_venue_margin_rules_v1 {
  const normalized = normalizeDecibelProductionBookTimestampV1(
    rules.markObservedAt,
    receivedAt,
    maximumClockSkewMs,
  );
  return Object.freeze({
    ...rules,
    rawMarkObservedAt: rules.markObservedAt,
    markObservedAt: normalized.observedAt,
    markClockSkewMs: normalized.clockSkewMs,
  });
}

const CurrentBookSchema = z.object({
  market: z.string().min(1),
  best_bid: z.number().positive(),
  best_ask: z.number().positive(),
  unix_ms: z.number().int().nonnegative(),
  best_bid_size: z.number().positive().optional(),
  best_ask_size: z.number().positive().optional(),
  microprice: z.number().positive().optional(),
  top_book_imbalance: z.number().min(-1).max(1).optional(),
});

export function readDecibelEntryPriorityDepthV1(
  raw: unknown,
  observedAt: number,
): decibel_authenticated_passive_recycling_input_v1['book']['depth'] {
  const parsed = CapacityDepthSchema.safeParse(raw);
  if (
    !parsed.success ||
    !Number.isFinite(observedAt) ||
    observedAt < 0 ||
    normalizeDecibelMarketAddressV1(parsed.data.market) !==
      normalizeDecibelMarketAddressV1(DECIBEL_BTC_USD_MARKET_ADDRESS_V1)
  )
    return undefined;
  return Object.freeze({ observedAt, bids: parsed.data.bids, asks: parsed.data.asks });
}

export function normalizeDecibelProductionBookTimestampV1(
  bookTimestamp: number,
  receivedAt: number,
  maximumClockSkewMs: number,
): Readonly<{ observedAt: number; clockSkewMs: number; clamped: boolean }> {
  if (
    !Number.isSafeInteger(bookTimestamp) ||
    !Number.isSafeInteger(receivedAt) ||
    !Number.isSafeInteger(maximumClockSkewMs) ||
    maximumClockSkewMs < 0
  )
    throw new Error('PRODUCTION_LIVE_SOURCE_BOOK_TIMESTAMP_INVALID');
  const clockSkewMs = Math.max(0, bookTimestamp - receivedAt);
  if (clockSkewMs > maximumClockSkewMs) throw new Error('PRODUCTION_LIVE_SOURCE_BOOK_FUTURE');
  return Object.freeze({
    observedAt: clockSkewMs > 0 ? receivedAt : bookTimestamp,
    clockSkewMs,
    clamped: clockSkewMs > 0,
  });
}

function canonicalHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function loadAuthenticatedActivityBaseline(): authenticated_activity_baseline {
  const manifestBytes = readFileSync(
    'config/production_state/decibel_authenticated_live_canary_success_v1_manifest.json',
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
  const validatedCheckpoint: unknown = loadLatestDecibelAuthenticatedBtcResyncCheckpointV1();
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
    checkpoint.allAccountFillIds.some((fillId) => typeof fillId !== 'string') ||
    typeof checkpoint.checkpointBodyHashSha256 !== 'string' ||
    typeof checkpoint.resyncTimestamp !== 'number' ||
    !Number.isSafeInteger(checkpoint.resyncTimestamp) ||
    checkpoint.resyncTimestamp < 0 ||
    !Array.isArray(checkpoint.outOfBandFillIds) ||
    checkpoint.outOfBandFillIds.some((fillId) => typeof fillId !== 'string')
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
    checkpointBodyHashSha256: checkpoint.checkpointBodyHashSha256,
    resyncTimestamp: checkpoint.resyncTimestamp,
    outOfBandFillIds: Object.freeze(checkpoint.outOfBandFillIds as string[]),
  });
}

/**
 * Baseline of a wallet onboarded after 2026-11-17 (no legacy canary manifest): the bot owns
 * only fills of its own strategy orders from the onboarding time on. Written once by the
 * launcher to data/wallets/<owner>/activity_baseline_v1.json.
 */
const FreshActivityBaselineSchema = z.object({
  version: z.literal(1),
  historyStartTimestamp: z.number().int().nonnegative(),
});

export function loadDecibelFreshActivityBaselineV1(path: string): authenticated_activity_baseline {
  const parsed = FreshActivityBaselineSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) throw new Error('PRODUCTION_LIVE_SOURCE_BASELINE_INVALID');
  return Object.freeze({
    historyStartTimestamp: parsed.data.historyStartTimestamp,
    fillIds: Object.freeze([]),
    reconciledAccountFillIds: Object.freeze([]),
    venueOrderId: '',
    venueClientOrderId: '',
    side: 'BUY',
    marketAddress: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
    quantity: 0,
    checkpointBodyHashSha256: 'FRESH_WALLET_BASELINE_V1',
    resyncTimestamp: parsed.data.historyStartTimestamp,
    outOfBandFillIds: Object.freeze([]),
  });
}

/** Per-wallet baseline when the launcher set one, else the first wallet's legacy baseline. */
export function loadDecibelActivityBaselineV1(
  environment: NodeJS.ProcessEnv,
): authenticated_activity_baseline {
  const path = environment.DECIBEL_ACTIVITY_BASELINE_PATH?.trim();
  return path ? loadDecibelFreshActivityBaselineV1(path) : loadAuthenticatedActivityBaseline();
}

function isStrategyClientOrderId(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && isDecibelPassiveRecyclingClientOrderIdV1(value);
}

export function resolveDecibelProductionLiveSourceEnvironmentV1(
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (environment.TRADING_MODE !== 'mainnet')
    throw new Error('PRODUCTION_LIVE_SOURCE_MAINNET_REQUIRED');
  return Object.freeze({ ...environment, DECIBEL_NETWORK: 'mainnet' });
}

export function makeSDKReader(
  environment: NodeJS.ProcessEnv,
): DecibelProductionLiveAuthenticatedReaderV1 {
  const sourceEnvironment = resolveDecibelProductionLiveSourceEnvironmentV1(environment);
  const nodeApiKey = environment.DECIBEL_NODE_API_KEY?.trim();
  const config = loadConfig({
    ...sourceEnvironment,
    DECIBEL_NODE_API_KEY: nodeApiKey === '' ? undefined : nodeApiKey,
  });
  // Keep the critical authenticated transport independent from the SDK and
  // market-client bootstrap. Both the probe and RuntimeSupervisor use this one
  // isolated reader instance.
  const authenticatedInitialized = (async () => {
    const sdkModule = await import('@decibeltrade/sdk');
    const sdk = sdkModule as unknown as {
      DecibelReadDex: new (configuration: unknown, options: object) => sdk_read_adapter;
      MAINNET_CONFIG: Readonly<{
        network: Network;
        fullnodeUrl: string;
        tradingHttpUrl: string;
        deployment: Readonly<{ package: string; usdc: string }>;
      }>;
    };
    const AuthenticatedHttp = createDecibelAuthenticatedHttpWorkerClientV1({
      baseUrl: sdk.MAINNET_CONFIG.tradingHttpUrl,
      ...(config.nodeApiKey === undefined ? {} : { apiKey: config.nodeApiKey }),
      timeoutMs: Number(environment.DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS ?? 10_000) - 1_000,
    });
    return { sdk, AuthenticatedHttp };
  })();
  const initialized = (async () => {
    const { sdk, AuthenticatedHttp } = await authenticatedInitialized;
    await loadDecibelSdkRuntimeV1();
    const clientModule = await import('./decibel_client.js');
    const client = clientModule as unknown as {
      decibel_client: new (configuration: ReturnType<typeof loadConfig>) => market_client_adapter;
    };
    const ChainClient = new Aptos(
      new AptosConfig({
        network: sdk.MAINNET_CONFIG.network,
        fullnode: sdk.MAINNET_CONFIG.fullnodeUrl,
        client: createDecibelBoundedFetchClientV1({
          timeoutMs: Number(environment.DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS ?? 10_000),
        }),
        ...(config.nodeApiKey === undefined
          ? {}
          : { clientConfig: { API_KEY: config.nodeApiKey } }),
      }),
    );
    return {
      Reader: new sdk.DecibelReadDex(
        sdk.MAINNET_CONFIG,
        config.nodeApiKey === undefined ? {} : { nodeApiKey: config.nodeApiKey },
      ),
      ChainClient,
      AuthenticatedHttp,
      MarketClient: new client.decibel_client(config),
    };
  })();
  let marketDiagnostics: ReturnType<market_client_adapter['getBTCMarketDataDiagnostics']> =
    Object.freeze({
      wsConnectionState: 'INIT' as const,
      wsSubscriptionState: 'UNSUBSCRIBED' as const,
      lastWsMessageAgeMs: null as number | null,
      lastValidBboAgeMs: null as number | null,
      wsReconnectCount: 0,
      wsLastDisconnectReason: null as string | null,
    });
  const adapter: DecibelProductionLiveAuthenticatedReaderV1 = {
    readVenueMarginRules: async () => {
      const observedAt = Date.now();
      const { ChainClient } = await initialized;
      const { sdk } = await authenticatedInitialized;
      const pkg = sdk.MAINNET_CONFIG.deployment.package;
      const info = await ChainClient.getLedgerInfo();
      const version = info.ledger_version;
      const options = { ledgerVersion: BigInt(version) };
      const [global, market, interest, prices] = await Promise.all([
        ChainClient.getAccountResource<Record<string, unknown>>({
          accountAddress: pkg,
          resourceType: `${pkg}::accounts_collateral::GlobalAccountStates`,
          options,
        }),
        ChainClient.getAccountResource<Record<string, unknown>>({
          accountAddress: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
          resourceType: `${pkg}::perp_market_config::PerpMarketConfiguration`,
          options,
        }),
        ChainClient.getAccountResource<Record<string, unknown>>({
          accountAddress: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
          resourceType: `${pkg}::open_interest_tracker::OpenInterestTracker`,
          options,
        }),
        ChainClient.getAccountResource<Record<string, unknown>>({
          accountAddress: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
          resourceType: `${pkg}::price_management::PriceDetails`,
          options,
        }),
      ]);
      const rules = parseDecibelVenueMarginRulesV1({
        global,
        expectedPrimaryAssetType: sdk.MAINNET_CONFIG.deployment.usdc,
        market,
        interest,
        prices,
        observedAt,
        ledgerVersion: version,
      });
      return normalizeDecibelVenueMarginTimestampV1(
        rules,
        Date.now(),
        ProductionLiveSourceEnvironmentSchema.parse(environment)
          .DECIBEL_PRODUCTION_LIVE_MAX_CLOCK_SKEW_MS,
      );
    },
    readAccountRiskInputs: async (subaccount, signal) => {
      const Http = (await authenticatedInitialized).AuthenticatedHttp;
      const deadline = signal ?? AbortSignal.timeout(9000);
      const [leverage, fees] = await Promise.all([
        Http.readSelectedLeverage(subaccount, DECIBEL_BTC_USD_MARKET_ADDRESS_V1, deadline),
        Http.readFeeRates(subaccount, deadline),
      ]);
      return { leverage, fees };
    },
    getAuthenticatedTransportDiagnostics: async () =>
      (await authenticatedInitialized).AuthenticatedHttp.getTransportDiagnostics(),
    readAccountOverview: async (subaccount: string, signal?: AbortSignal) => {
      const boundedSignal = signal ?? AbortSignal.timeout(9_000);
      return (await authenticatedInitialized).AuthenticatedHttp.readAccountOverview(
        subaccount,
        boundedSignal,
      );
    },
    readPositions: async (subaccount: string, marketAddress?: string, signal?: AbortSignal) => {
      const boundedSignal = signal ?? AbortSignal.timeout(9_000);
      return (await authenticatedInitialized).AuthenticatedHttp.readPositions(
        subaccount,
        marketAddress,
        boundedSignal,
      );
    },
    readOpenOrders: async (subaccount: string, signal?: AbortSignal) => {
      const boundedSignal = signal ?? AbortSignal.timeout(9_000);
      return (await authenticatedInitialized).AuthenticatedHttp.readOpenOrders(
        subaccount,
        boundedSignal,
      );
    },
    readOrderHistory: async (
      subaccount: string,
      startTimestamp: number,
      endTimestamp: number,
      signal?: AbortSignal,
    ) => {
      const result = await (
        await initialized
      ).Reader.userOrderHistory.getByAddr({
        subAddr: subaccount,
        limit: 200,
        offset: 0,
        startTimestamp,
        endTimestamp,
        sortDir: 'ASC',
        fetchOptions: { signal },
      });
      if ((result.total_count ?? result.items.length) > result.items.length)
        throw new Error('PRODUCTION_LIVE_SOURCE_ORDER_HISTORY_TRUNCATED');
      return result.items;
    },
    readTradeHistory: async (
      subaccount: string,
      startTimestamp: number,
      endTimestamp: number,
      signal?: AbortSignal,
    ) => {
      const result = await (
        await initialized
      ).Reader.userTradeHistory.getByAddr({
        subAddr: subaccount,
        limit: 200,
        offset: 0,
        startTimestamp,
        endTimestamp,
        sortDir: 'ASC',
        fetchOptions: { signal },
      });
      if ((result.total_count ?? result.items.length) > result.items.length)
        throw new Error('PRODUCTION_LIVE_SOURCE_TRADE_HISTORY_TRUNCATED');
      return result.items;
    },
    readOrderHistoryExhaustive: async (
      subaccount: string,
      startTimestamp: number,
      endTimestamp: number,
      signal?: AbortSignal,
    ) => {
      const { Reader } = await initialized;
      return readDecibelPaginatedHistoryV1({
        readPage: async (offset, limit) => {
          const result = await Reader.userOrderHistory.getByAddr({
            subAddr: subaccount,
            limit,
            offset,
            startTimestamp,
            endTimestamp,
            sortDir: 'ASC',
            fetchOptions: { signal },
          });
          return {
            items: result.items,
            ...(result.total_count === undefined ? {} : { totalCount: result.total_count }),
          };
        },
      });
    },
    readTradeHistoryExhaustive: async (
      subaccount: string,
      startTimestamp: number,
      endTimestamp: number,
      signal?: AbortSignal,
    ) => {
      const { Reader } = await initialized;
      return readDecibelPaginatedHistoryV1({
        readPage: async (offset, limit) => {
          const result = await Reader.userTradeHistory.getByAddr({
            subAddr: subaccount,
            limit,
            offset,
            startTimestamp,
            endTimestamp,
            sortDir: 'ASC',
            fetchOptions: { signal },
          });
          return {
            items: result.items,
            ...(result.total_count === undefined ? {} : { totalCount: result.total_count }),
          };
        },
      });
    },
    readActiveTwaps: async (subaccount: string, signal?: AbortSignal) =>
      (await initialized).Reader.userActiveTwaps.getByAddr({
        subAddr: subaccount,
        fetchOptions: { signal },
      }),
    readBulkOrders: (subaccount: string, marketAddress: string, signal?: AbortSignal) =>
      initialized.then(({ Reader }) =>
        Reader.userBulkOrders.getByAddr({
          subAddr: subaccount,
          market: marketAddress,
          fetchOptions: { signal },
        }),
      ),
    readMarketMetadata: async (signal?: AbortSignal) => {
      assertDecibelHTTPReadAllowedV1();
      const { MarketClient } = await initialized;
      signal?.throwIfAborted();
      return MarketClient.getBTCMarketMetadata(signal);
    },
    readCandles1m: async (startMs: number, endMs: number, signal?: AbortSignal) => {
      assertDecibelHTTPReadAllowedV1();
      const { Reader } = await initialized;
      return Reader.candlesticks.getByName({
        marketName: 'BTC/USD',
        interval: '1m',
        startTime: startMs,
        endTime: endMs,
        hideOutliers: true,
        fetchOptions: signal === undefined ? {} : { signal },
      });
    },
    readCurrentBook: async (marketAddress: string) => {
      const { MarketClient } = await initialized;
      try {
        return await MarketClient.getBTCStreamingBook(marketAddress);
      } finally {
        marketDiagnostics = MarketClient.getBTCMarketDataDiagnostics();
      }
    },
    readMarketDataDiagnostics: () => marketDiagnostics,
    verifyTransactionExpiredUncommitted: async (
      transactionHash: string,
      expirationTimestampMs: number,
    ) => {
      const { ChainClient } = await initialized;
      const ledger = await ChainClient.getLedgerInfo();
      const expirationPassed = isDecibelTransactionExpirationProvenV1({
        ledgerTimestampMicros: ledger.ledger_timestamp,
        ledgerVersion: ledger.ledger_version,
        expirationTimestampMs,
        transactionNotFound: true,
      });
      if (!expirationPassed) return false;
      try {
        await ChainClient.getTransactionByHash({ transactionHash });
        return false;
      } catch (error) {
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? Number(error.status)
            : Number.NaN;
        if (status === 404) return true;
        throw error;
      }
    },
    readTransactionReceipt: async (transactionHash: string) => {
      const { ChainClient } = await initialized;
      return createDecibelTransactionEvidenceReaderV1(ChainClient).readTransactionReceipt(
        transactionHash,
      );
    },
    readTransactionByHash: async (transactionHash: string) => {
      const { ChainClient } = await initialized;
      return createDecibelTransactionEvidenceReaderV1(ChainClient).readTransactionByHash(
        transactionHash,
      );
    },
    close: async () => {
      const runtime = await initialized;
      runtime.MarketClient.closeWebSocket();
      await runtime.AuthenticatedHttp.close();
    },
  };
  return Object.freeze(adapter);
}

/**
 * The bot's catastrophe stop is the position's full-size SL with the wide-stop shape. Every
 * other position TP/SL (a TP, a sized SL, a tight SL) is foreign activity.
 */
export function deriveDecibelPositionStopStateV1(
  BTCPositions: readonly position_row[],
  openOrderRows: readonly open_order_row[],
): Readonly<{
  catastropheStop:
    import('./decibel_catastrophe_stop_v1.js').decibel_catastrophe_stop_state_v1 | null;
  foreignTpSlCount: number;
}> {
  const position = BTCPositions[0];
  const catastropheStop =
    position !== undefined &&
    position.sl_order_id !== null &&
    position.tp_order_id === null &&
    isDecibelOwnedCatastropheStopV1(
      { triggerPrice: position.sl_trigger_price ?? null },
      position.size,
      position.entry_price ?? null,
    )
      ? Object.freeze({
          venueOrderId: position.sl_order_id,
          triggerPrice: position.sl_trigger_price!,
          limitPrice: position.sl_limit_price ?? null,
        })
      : null;
  const foreignTpSlCount =
    BTCPositions.reduce(
      (count, row) =>
        count +
        (row.tp_order_id !== null ? 1 : 0) +
        (row.sl_order_id !== null && row.sl_order_id !== catastropheStop?.venueOrderId ? 1 : 0),
      0,
    ) +
    openOrderRows.filter(
      (row) =>
        row.is_tpsl === true &&
        isDecibelBTCMarketActivityV1({
          market: row.market,
          market_address: row.market_address,
          market_id: row.market_id,
        }) &&
        !BTCPositions.some((p) => row.order_id === p.tp_order_id || row.order_id === p.sl_order_id),
    ).length;
  return Object.freeze({ catastropheStop, foreignTpSlCount });
}

export function normalizeDecibelAuthenticatedOpenOrdersV1(
  rows: readonly open_order_row[],
  marketAddress: string,
  strategyConfigId: string,
  history: readonly order_history_row[] = [],
): readonly decibel_authenticated_strategy_order_v1[] {
  return Object.freeze(
    rows
      .filter(
        (row) =>
          // Position TP/SL (trigger) orders are not resting limit orders: they are reported
          // separately (catastrophe stop / foreign TP-SL) and never count as TP coverage.
          row.is_tpsl !== true &&
          isDecibelBTCMarketActivityV1({
            market: row.market,
            market_address: row.market_address,
            market_id: row.market_id,
          }),
      )
      .map((row) => {
        const known = isStrategyClientOrderId(row.client_order_id);
        const exactHistory = history.filter(
          (order) =>
            order.order_id === row.order_id &&
            order.client_order_id === row.client_order_id &&
            order.market === row.market &&
            order.is_buy === row.is_buy &&
            order.price === row.price &&
            order.orig_size === row.orig_size &&
            typeof order.is_reduce_only === 'boolean',
        );
        const flags = new Set(exactHistory.map((order) => order.is_reduce_only));
        if (typeof row.is_reduce_only === 'boolean') flags.add(row.is_reduce_only);
        if (flags.size > 1) throw new Error('PRODUCTION_ORDER_REDUCE_ONLY_IDENTITY_CONFLICT');
        const reduceOnly = flags.size === 1 ? [...flags][0] : undefined;
        return Object.freeze({
          venueOrderId: row.order_id,
          clientOrderId: row.client_order_id ?? '',
          strategyConfigId: known ? strategyConfigId : null,
          market: marketAddress,
          side: row.is_buy ? ('BUY' as const) : ('SELL' as const),
          price: row.price ?? Number.NaN,
          quantity: row.remaining_size ?? row.orig_size ?? Number.NaN,
          orderType: 'LIMIT' as const,
          timeInForce: 'PostOnly' as const,
          postOnly: true as const,
          ...(reduceOnly === undefined ? {} : { reduceOnly }),
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
      (order) =>
        isDecibelBTCMarketActivityV1(order) && isStrategyClientOrderId(order.client_order_id),
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
    normalizeDecibelMarketAddressV1(baseline.marketAddress) ===
      normalizeDecibelMarketAddressV1(marketAddress) &&
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
  for (const trade of [...aggregateDecibelTradeHistoryFragmentsV1(trades)].sort(
    (left, right) =>
      left.transaction_unix_ms - right.transaction_unix_ms ||
      left.trade_id.localeCompare(right.trade_id),
  )) {
    const order = byOrder.get(trade.order_id);
    if (
      order === undefined ||
      !isDecibelBTCMarketActivityV1(trade) ||
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
      ...(Number.isSafeInteger(trade.transaction_version) && (trade.transaction_version ?? 0) > 0
        ? { transactionVersion: String(trade.transaction_version) }
        : {}),
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
      executionFragments: [
        ...new Map(
          trades
            .filter(
              (fragment) =>
                fragment.trade_id === trade.trade_id &&
                fragment.order_id === trade.order_id &&
                fragment.client_order_id === trade.client_order_id,
            )
            .map((fragment) => [getTradeFragmentIdentity(fragment), fragment]),
        ).entries(),
      ].map(([fragmentId, fragment]) => ({
        fragmentId,
        quantity: fragment.size,
        price: fragment.price,
        feeUsd: Number.isFinite(fragment.fee_amount) ? fragment.fee_amount : null,
      })),
      executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM',
    });
  }
  return ledger;
}

function normalizeTerminalOrderState(
  status: string | undefined,
): 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'REJECTED' | null {
  const normalized = status?.trim().toUpperCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (normalized === 'FILLED' || normalized === 'FULLY_FILLED') return 'FILLED';
  if (normalized === 'CANCELLED' || normalized === 'CANCELED') return 'CANCELLED';
  if (normalized === 'EXPIRED') return 'EXPIRED';
  if (normalized === 'REJECTED') return 'REJECTED';
  return null;
}

export function resolveDecibelExternalOrderNeutralizationV1(
  input: Readonly<{
    terminalState: 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'REJECTED' | null;
    remainingQuantity: number | null;
    authenticatedFilledQuantity: number;
  }>,
): 'FULL_FILL' | 'CANCELLED_EXTERNALLY' | 'EXTERNALLY_NEUTRALIZED' | null {
  if (
    input.terminalState === 'FILLED' &&
    (input.remainingQuantity === null || input.remainingQuantity <= 1e-12)
  )
    return 'FULL_FILL';
  if (
    (input.terminalState === 'CANCELLED' ||
      input.terminalState === 'EXPIRED' ||
      input.terminalState === 'REJECTED') &&
    input.remainingQuantity !== null &&
    input.remainingQuantity <= Number.EPSILON
  )
    return input.authenticatedFilledQuantity > Number.EPSILON
      ? 'EXTERNALLY_NEUTRALIZED'
      : 'CANCELLED_EXTERNALLY';
  return null;
}

export function resolveDecibelRecentOrderEvidenceV1(
  orders: readonly order_history_row[],
  trades: readonly trade_history_row[],
  venueOrderId: string,
  requestedQuantity?: number,
): 'PARTIAL_FILL' | 'FULL_FILL' | 'CANCELLED_EXTERNALLY' | 'EXTERNALLY_NEUTRALIZED' | null {
  const matchingOrders = orders.filter(
    (order) => order.order_id === venueOrderId && isDecibelBTCMarketActivityV1(order),
  );
  const matchingTrades = aggregateDecibelTradeHistoryFragmentsV1(
    trades.filter(
      (trade) =>
        trade.order_id === venueOrderId &&
        trade.source === 'OrderFill' &&
        isDecibelBTCMarketActivityV1(trade),
    ),
  );
  const clientOrderId =
    matchingOrders[0]?.client_order_id ?? matchingTrades[0]?.client_order_id ?? '';
  const originalQuantity =
    requestedQuantity ?? matchingOrders.find((order) => order.orig_size !== null)?.orig_size ?? 0;
  if (clientOrderId.length === 0 || originalQuantity <= 0) return null;
  const resolution = resolveDecibelAuthoritativeOrderEvidenceV1({
    identity: {
      market: 'BTC/USD',
      venueOrderId,
      clientOrderId,
      intentId: clientOrderId,
      side: matchingOrders[0]?.is_buy === false ? 'SELL' : 'BUY',
      originalQuantity,
    },
    observations: matchingOrders.flatMap((order, index) => {
      const terminalStatus = normalizeTerminalOrderState(
        order.status ?? order.order_status ?? order.state,
      );
      if (terminalStatus === null) return [];
      return [
        {
          source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' as const,
          sourceTimestamp: null,
          observedAt: index,
          market: 'BTC/USD',
          venueOrderId: order.order_id,
          clientOrderId: order.client_order_id,
          side: order.is_buy ? ('BUY' as const) : ('SELL' as const),
          originalQuantity: order.orig_size,
          remainingQuantity: order.remaining_size ?? null,
          terminalStatus,
        },
      ];
    }),
    fills: matchingTrades.map((trade) => ({
      source: 'AUTHENTICATED_OWN_FILL_STREAM' as const,
      observedAt: trade.transaction_unix_ms,
      venueTimestamp: trade.transaction_unix_ms,
      market: 'BTC/USD',
      venueOrderId: trade.order_id,
      clientOrderId,
      fillId: trade.trade_id,
      quantity: trade.size,
      price: trade.price,
    })),
  });
  if (resolution.state === 'FULL_FILL') return 'FULL_FILL';
  if (resolution.state === 'PARTIAL_FILL') return 'PARTIAL_FILL';
  if (resolution.state === 'CANCELLED')
    return resolution.cumulativeFilledQuantity > Number.EPSILON
      ? 'EXTERNALLY_NEUTRALIZED'
      : 'CANCELLED_EXTERNALLY';
  return null;
}

export function resolveDecibelAuthenticatedFlatCheckpointNeutralizationV1(
  snapshot: decibel_production_live_snapshot_v1,
  venueOrderId: string | null = null,
): 'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED' | null {
  // A flat account checkpoint can resolve a legacy/pre-submission intent whose
  // venue identity was never recovered. It is not per-order terminal evidence.
  // Once a PLACE has an acknowledged venue order id, only identity-matched
  // open-order, fill, terminal-history, or transaction evidence may resolve it.
  // In particular, an unfilled order can leave the account flat while the
  // venue's authenticated open-order projection is still catching up to ACK.
  return venueOrderId === null &&
    snapshot.input.actualInventoryBase === 0 &&
    snapshot.input.openOrders.length === 0 &&
    snapshot.authenticatedFlatNeutralization !== undefined &&
    snapshot.authenticatedFlatNeutralization.outOfBandFillIds.length > 0
    ? 'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED'
    : null;
}

export function normalizeDecibelTerminalOrderEvidenceV1(
  orders: readonly order_history_row[],
): NonNullable<decibel_production_live_snapshot_v1['terminalOrderEvidence']> {
  return Object.freeze(
    orders.flatMap((order) => {
      if (!isDecibelBTCMarketActivityV1(order)) return [];
      const state = normalizeTerminalOrderState(order.status ?? order.order_status ?? order.state);
      if (state === null) return [];
      return [
        Object.freeze({
          venueOrderId: order.order_id,
          clientOrderId: order.client_order_id,
          state,
          originalQuantity: order.orig_size,
          remainingQuantity: order.remaining_size ?? null,
        }),
      ];
    }),
  );
}

export class decibel_production_live_state_source_v1 implements DecibelProductionLiveStateSourceV1 {
  private CapacityBooks: capacity_depth_v1[] = [];
  private CapacityAccountObservation: unknown = null;
  private CapacityLotSize: number | null = null;
  private PreviewVenueLeverage: number | null = null;
  private CapacitySettings: Readonly<{
    leverage: decibel_selected_leverage_v1;
    fees: decibel_account_fee_rates_v1;
  }> | null = null;
  private CapacityVenueRules: capacity_venue_margin_rules_v1 | null = null;
  private CapacitySettingsRead: Promise<void> | null = null;
  private readonly ActiveReadControllers = new Set<AbortController>();
  private async refreshAccountRiskInputs(
    expectedPositionBase?: number,
    parentSignal?: AbortSignal,
    waitForInputs = true,
  ): Promise<void> {
    const now = this.getNow();
    const config = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    const ttl = config.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS;
    const fresh = (at: number) => Number.isFinite(at) && at <= now && now - at < ttl;
    const settingsFresh =
      this.CapacitySettings !== null &&
      (expectedPositionBase === undefined ||
        this.CapacitySettings.leverage.positionBase === expectedPositionBase) &&
      fresh(this.CapacitySettings.leverage.observedAt) &&
      fresh(this.CapacitySettings.fees.observedAt);
    const rulesFresh =
      this.CapacityVenueRules !== null &&
      fresh(this.CapacityVenueRules.observedAt) &&
      fresh(this.CapacityVenueRules.markObservedAt);
    // Refresh the short-lived mark/rules source before expiry on the existing
    // account refresh path. Do not block on a refresh while its prior evidence
    // remains valid; consumers still enforce the original TTL at submission.
    const settingsRefreshDue =
      this.Reader.readAccountRiskInputs !== undefined &&
      (!settingsFresh ||
        (this.CapacitySettings !== null &&
          now -
            Math.min(
              this.CapacitySettings.leverage.observedAt,
              this.CapacitySettings.fees.observedAt,
            ) >=
            ttl / 2));
    const rulesRefreshDue =
      this.Reader.readVenueMarginRules !== undefined &&
      (!rulesFresh ||
        (this.CapacityVenueRules !== null &&
          now -
            Math.min(this.CapacityVenueRules.observedAt, this.CapacityVenueRules.markObservedAt) >=
            ttl / 2));
    if (settingsFresh && !settingsRefreshDue && !rulesRefreshDue) return;
    if (this.CapacitySettingsRead) {
      if (!waitForInputs) return;
      return this.CapacitySettingsRead;
    }
    // A background refresh outlives this successful account request. Its stages
    // retain their own deadline and Source.close ownership; borrowing the
    // account signal would cancel it as soon as the supervisor settles.
    const refreshSignal =
      !waitForInputs || (settingsFresh && rulesFresh) ? undefined : parentSignal;
    this.CapacitySettingsRead = (async () => {
      try {
        const [settings, rules] = await Promise.allSettled([
          !settingsRefreshDue
            ? Promise.resolve(this.CapacitySettings)
            : this.readAuthenticatedStage(
                'ACCOUNT_RISK_INPUTS',
                (signal) =>
                  this.Reader.readAccountRiskInputs?.(config.DECIBEL_SUBACCOUNT_ADDRESS, signal) ??
                  Promise.resolve(undefined),
                refreshSignal,
              ),
          !rulesRefreshDue
            ? Promise.resolve(this.CapacityVenueRules)
            : this.readAuthenticatedStage(
                'VENUE_MARGIN_RULES',
                () => this.Reader.readVenueMarginRules?.() ?? Promise.resolve(undefined),
                refreshSignal,
              ),
        ]);
        this.CapacitySettings =
          settings.status === 'fulfilled'
            ? (settings.value ?? null)
            : settingsFresh
              ? this.CapacitySettings
              : null;
        this.CapacityVenueRules =
          rules.status === 'fulfilled'
            ? (rules.value ?? null)
            : rulesFresh
              ? this.CapacityVenueRules
              : null;
      } catch {
        /* Risk inputs remain missing; never substitute UI or market defaults. */
      }
    })().finally(() => {
      this.CapacitySettingsRead = null;
    });
    if (!waitForInputs) return;
    await this.CapacitySettingsRead;
  }
  public readNextSessionCapacityInputs(): decibel_capacity_inputs_v1 | null {
    const account = z
      .object({
        observedAt: z.number(),
        primaryCollateralOnly: z.boolean().optional(),
        equityUsd: z.number(),
        maintenanceMarginUsd: z.number().nullable(),
        marginDeficitUsd: z.number().nullable(),
        positions: z.array(
          z.object({
            market: z.string(),
            size: z.number(),
            userLeverage: z.number().nullable(),
            estimatedLiquidationPrice: z.number().nullable(),
          }),
        ),
      })
      .safeParse(this.CapacityAccountObservation);
    const book = this.CapacityBooks.at(-1);
    if (!account.success || !book || this.PreviewVenueLeverage === null) return null;
    if (
      this.CapacityBooks.some(
        (row) =>
          row.unix_ms === book.unix_ms &&
          JSON.stringify([row.bids, row.asks]) !== JSON.stringify([book.bids, book.asks]),
      )
    )
      return null;
    if (this.CapacityVenueRules && account.data.primaryCollateralOnly !== true) return null;
    const positions = filterDecibelBTCMarketActivityV1(account.data.positions);
    const risk = this.CapacitySettings;
    if (
      this.Reader.readAccountRiskInputs &&
      (!risk ||
        risk.leverage.subaccount !==
          ProductionLiveSourceEnvironmentSchema.parse(this.Environment)
            .DECIBEL_SUBACCOUNT_ADDRESS ||
        risk.fees.subaccount !== risk.leverage.subaccount ||
        !isDecibelBTCMarketActivityV1({ market: risk.leverage.market }) ||
        risk.leverage.positionBase !== (positions[0]?.size ?? 0) ||
        risk.leverage.isIsolated ||
        this.getNow() < Math.max(risk.leverage.observedAt, risk.fees.observedAt) ||
        this.getNow() - Math.min(risk.leverage.observedAt, risk.fees.observedAt) >
          ProductionLiveSourceEnvironmentSchema.parse(this.Environment)
            .DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS)
    )
      return null;
    // Unknown cross-market collateral requirements must not be hidden by a BTC preview.
    if (
      positions.length > 1 ||
      account.data.positions.some((p) => p.size !== 0 && !positions.includes(p))
    )
      return null;
    const config = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    const economic = loadDecibelProductionEconomicEvidenceV1(
      config.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH,
      this.getNow(),
      config.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS,
    );
    const ttl = config.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS;
    return {
      accountObservedAt: account.data.observedAt,
      marketObservedAt: book.unix_ms,
      maximumAgeMs: ProductionLiveSourceEnvironmentSchema.parse(this.Environment)
        .DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS,
      ...(this.CapacityVenueRules ? { venueMarginRules: this.CapacityVenueRules } : {}),
      actualLeverage: risk?.leverage.userLeverage ?? positions[0]?.userLeverage ?? null,
      venueMaximumLeverage: this.PreviewVenueLeverage,
      equityUsd: account.data.equityUsd,
      maintenanceMarginUsd: account.data.maintenanceMarginUsd,
      marginDeficitUsd: account.data.marginDeficitUsd,
      liquidationPrice: positions[0]?.estimatedLiquidationPrice ?? null,
      bids: book.bids,
      asks: book.asks,
      recentMidpoints: this.CapacityBooks.filter((b) => b.unix_ms >= this.getNow() - 60_000).map(
        (b) => (b.bids[0]!.price + b.asks[0]!.price) / 2,
      ),
      tpRegimePrices: [
        ...new Map(
          this.CapacityBooks.filter((b) => b.unix_ms >= this.getNow() - 60_000).map(
            (b) =>
              [
                b.unix_ms,
                { observedAt: b.unix_ms, midpoint: (b.bids[0]!.price + b.asks[0]!.price) / 2 },
              ] as const,
          ),
        ).values(),
      ].sort((a, b) => a.observedAt - b.observedAt),
      costObservations: [
        ...(risk
          ? [
              {
                kind: 'MAKER_FEE' as const,
                unit: 'BPS' as const,
                value: Math.max(0, risk.fees.makerFeeBps),
                source: risk.fees.source,
                observedAt: risk.fees.observedAt,
                validUntil: risk.fees.observedAt + config.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS,
              },
              {
                kind: 'TAKER_FEE' as const,
                unit: 'BPS' as const,
                value: risk.fees.takerFeeBps,
                source: risk.fees.source,
                observedAt: risk.fees.observedAt,
                validUntil: risk.fees.observedAt + config.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS,
              },
            ]
          : []),
        ...(economic
          ? [
              {
                kind: 'MAKER_FEE' as const,
                unit: 'BPS' as const,
                value: economic.makerFeeBps,
                source: economic.makerFeeSource,
                observedAt: economic.makerFeeObservedAt ?? economic.observedAt,
                validUntil: (economic.makerFeeObservedAt ?? economic.observedAt) + ttl,
              },
              ...(economic.takerFeeBps !== undefined &&
              economic.takerFeeSource &&
              economic.takerFeeObservedAt !== undefined
                ? [
                    {
                      kind: 'TAKER_FEE' as const,
                      unit: 'BPS' as const,
                      value: economic.takerFeeBps,
                      source: economic.takerFeeSource,
                      observedAt: economic.takerFeeObservedAt,
                      validUntil: economic.takerFeeObservedAt + ttl,
                    },
                  ]
                : []),
              ...(economic.adverseSelectionSource === 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95' &&
              economic.adverseSelectionBufferBps !== undefined &&
              economic.adverseSelectionObservedAt !== undefined
                ? [
                    {
                      kind: 'ADVERSE_SELECTION' as const,
                      unit: 'BPS' as const,
                      value: economic.adverseSelectionBufferBps,
                      source: economic.adverseSelectionSource,
                      observedAt: economic.adverseSelectionObservedAt,
                      validUntil: economic.adverseSelectionObservedAt + ttl,
                    },
                  ]
                : []),
              {
                kind: 'TRANSACTION_COST' as const,
                unit: 'USD' as const,
                value: economic.conservativeGasCostUsd,
                source: economic.gasCostSource,
                observedAt: economic.gasCostObservedAt ?? economic.observedAt,
                validUntil: (economic.gasCostObservedAt ?? economic.observedAt) + ttl,
              },
            ]
          : []),
      ],
    };
  }
  private observeCapacityBook(raw: unknown, lotSize: number): void {
    const parsed = CapacityDepthSchema.safeParse(raw);
    this.CapacityLotSize = lotSize;
    if (!parsed.success) return;
    const receivedAt = this.getNow();
    const config = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    const existing = this.CapacityBooks.find(
      (book) => (book.raw_exchange_unix_ms ?? book.unix_ms) === parsed.data.unix_ms,
    );
    const normalized = normalizeDecibelProductionBookTimestampV1(
      parsed.data.unix_ms,
      receivedAt,
      config.DECIBEL_PRODUCTION_LIVE_MAX_CLOCK_SKEW_MS,
    );
    const book = {
      ...parsed.data,
      unix_ms: existing?.unix_ms ?? normalized.observedAt,
      raw_exchange_unix_ms: parsed.data.unix_ms,
      received_at_ms: existing?.received_at_ms ?? receivedAt,
    };
    if (!this.CapacityBooks.some((row) => JSON.stringify(row) === JSON.stringify(book)))
      this.CapacityBooks = [...this.CapacityBooks, book].slice(-4096);
  }
  public async readCapacityProduction(
    input: Readonly<{
      sessionId: string;
      probeNotionalUsd: number;
      manifest: readonly { hash: string | null }[] | null;
    }>,
  ) {
    const config = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    const latest = this.CapacityBooks.at(-1),
      mid = latest ? ((latest.bids[0]?.price ?? 0) + (latest.asks[0]?.price ?? 0)) / 2 : 0;
    const quantity =
      mid > 0 && this.CapacityLotSize
        ? Math.floor(input.probeNotionalUsd / mid / this.CapacityLotSize) * this.CapacityLotSize
        : 0;
    const receipts: capacity_receipt_v1[] = [];
    if (this.Reader.readTransactionReceipt && input.manifest) {
      for (const hash of new Set(input.manifest.flatMap((row) => (row.hash ? [row.hash] : [])))) {
        try {
          const receipt = await this.Reader.readTransactionReceipt(hash);
          if (receipt) receipts.push(receipt);
        } catch {
          /* Missing receipts remain explicit blockers; no transaction is retried. */
        }
      }
    }
    // ENTRY consumes risk evidence after receipt I/O, not the stale cache that
    // happened to be available when the independent account batch was published.
    // Account publication never waits here; only capacity admission joins this
    // single bounded refresh. Original observation clocks remain unchanged.
    await this.refreshAccountRiskInputs(undefined, undefined, true);
    const economic = loadDecibelProductionEconomicEvidenceV1(
      config.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH,
      this.getNow(),
      config.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS,
    );
    // Current position estimates do not establish post-order margin-tier rules.
    // No validated exit horizon/coverage policy or historical transaction FX is configured.
    const report = assembleDecibelCapacityCertificateV1({
      now: this.getNow(),
      maximumBookAgeMs: config.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS,
      market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      quantity,
      books: this.CapacityBooks,
      exits: [],
      policy: null,
      margin: null,
      manifest: input.manifest,
      receipts,
      prices: [],
      fees: null,
      futureGas: null,
      adverseSelectionBps:
        economic?.adverseSelectionSource === 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95'
          ? (economic.adverseSelectionBufferBps ?? null)
          : null,
    });
    return {
      ...report,
      accountObservation: this.CapacityAccountObservation,
      selectedLeverageAndFees: this.CapacitySettings,
      bookCoverage: {
        sampleCount: this.CapacityBooks.length,
        start: this.CapacityBooks[0]?.unix_ms ?? null,
        end: this.CapacityBooks.at(-1)?.unix_ms ?? null,
        measuredExitCount: 0,
      },
      economicObservations: economic
        ? {
            makerFeeBps: economic.makerFeeBps,
            makerFeeSource: economic.makerFeeSource,
            gasEstimateUsd: economic.conservativeGasCostUsd,
            gasEstimateSource: economic.gasCostSource,
            gasEstimateCapacityQualified: false,
            adverseSelectionSource: economic.adverseSelectionSource,
          }
        : null,
      receiptCoverage: {
        manifestCount: input.manifest?.length ?? null,
        committedReceipts: receipts.length,
      },
    };
  }

  public constructor(
    private readonly Reader: DecibelProductionLiveAuthenticatedReaderV1,
    private readonly Environment: NodeJS.ProcessEnv,
    private readonly getNow: () => number = Date.now,
    private readonly getActivityBaseline: () => authenticated_activity_baseline = () =>
      loadDecibelActivityBaselineV1(Environment),
  ) {}

  public async assertAuthenticatedTransport(): Promise<
    Readonly<{ transportId: string; baseUrl: string }>
  > {
    const diagnostics = await this.Reader.getAuthenticatedTransportDiagnostics?.();
    if (
      diagnostics === undefined ||
      diagnostics.transportId !== DECIBEL_AUTHENTICATED_HTTP_WORKER_TRANSPORT_ID_V1 ||
      diagnostics.isolatedDispatcher !== true ||
      diagnostics.internalRetry !== false
    )
      throw new Error('PRODUCTION_AUTHENTICATED_TRANSPORT_WIRING_INVALID');
    return Object.freeze({
      transportId: diagnostics.transportId,
      baseUrl: diagnostics.baseUrl,
    });
  }

  public async readAuthenticatedTransportDiagnostics(): Promise<Readonly<Record<string, unknown>>> {
    return this.readAuthenticatedStage('TRANSPORT_DIAGNOSTICS', async () =>
      Object.freeze({ ...(await this.Reader.getAuthenticatedTransportDiagnostics?.()) }),
    );
  }

  public async readAuthenticatedSnapshot(
    signal?: AbortSignal,
  ): Promise<decibel_production_live_snapshot_v1> {
    const configuration = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    assertDecibelHTTPReadAllowedV1(this.getNow());
    const baseline = this.getActivityBaseline();
    const requestedAt = this.getNow();
    const economicEvidence = loadDecibelProductionEconomicEvidenceV1(
      configuration.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH,
      requestedAt,
      configuration.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS,
    );
    const historyWindow = resolveDecibelHistoryWindowV1(
      baseline.historyStartTimestamp,
      requestedAt,
    );
    let values: Awaited<ReturnType<typeof this.readAll>>;
    try {
      values = await this.readAll(
        configuration.DECIBEL_SUBACCOUNT_ADDRESS,
        historyWindow.tradeStart,
        requestedAt,
        signal,
        historyWindow.orderStart,
      );
    } catch (error) {
      if (isDecibelSourceRateLimitError(error)) {
        enterDecibelHTTPReadBackoffForErrorV1(
          error,
          Number(this.Environment.DECIBEL_PRODUCTION_RATE_LIMIT_BACKOFF_MS ?? 30_000),
          this.getNow(),
        );
        throw new Error('PRODUCTION_DECIBEL_HTTP_RATE_LIMITED', { cause: error });
      }
      throw new Error('PRODUCTION_AUTHENTICATED_READ_REQUIRED', { cause: error });
    }
    signal?.throwIfAborted();
    const receivedAt = this.getNow();
    if (
      normalizeDecibelMarketAddressV1(values.metadata.marketAddress) !==
        normalizeDecibelMarketAddressV1(DECIBEL_BTC_USD_MARKET_ADDRESS_V1) ||
      values.metadata.symbol !== 'BTC/USD'
    )
      throw new Error('PRODUCTION_LIVE_SOURCE_MARKET_MISMATCH');
    this.observeCapacityBook(values.book, values.metadata.lotSize);
    this.PreviewVenueLeverage = values.metadata.maximumLeverage;
    const book = CurrentBookSchema.parse(values.book);
    if (
      normalizeDecibelMarketAddressV1(book.market) !==
        normalizeDecibelMarketAddressV1(DECIBEL_BTC_USD_MARKET_ADDRESS_V1) ||
      book.best_ask <= book.best_bid
    )
      throw new Error('PRODUCTION_LIVE_SOURCE_BOOK_INVALID');
    const bookTimestamp = normalizeDecibelProductionBookTimestampV1(
      book.unix_ms,
      receivedAt,
      configuration.DECIBEL_PRODUCTION_LIVE_MAX_CLOCK_SKEW_MS,
    );
    const priorityDepth = readDecibelEntryPriorityDepthV1(values.book, bookTimestamp.observedAt);
    const marketDiagnostics = this.Reader.readMarketDataDiagnostics?.();
    const authoritativeBookObservedAt =
      marketDiagnostics?.wsConnectionState === 'CONNECTED' &&
      marketDiagnostics.wsSubscriptionState === 'SUBSCRIBED' &&
      marketDiagnostics.lastValidBboAgeMs !== null &&
      Number.isFinite(marketDiagnostics.lastValidBboAgeMs)
        ? receivedAt - marketDiagnostics.lastValidBboAgeMs
        : bookTimestamp.observedAt;
    if (
      receivedAt - authoritativeBookObservedAt >
      configuration.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS
    )
      throw new Error('PRODUCTION_LIVE_SOURCE_BOOK_STALE');
    await this.refreshAccountRiskInputs(undefined, signal);
    signal?.throwIfAborted();
    this.CapacityAccountObservation = {
      source: 'AUTHENTICATED_ACCOUNT_OVERVIEW',
      primaryCollateralOnly: values.accountOverview.secondary_collateral === null,
      observedAt: requestedAt,
      equityUsd: values.accountOverview.perp_equity_balance,
      freeMarginUsd: values.accountOverview.cross_available_to_trade,
      totalMarginUsd: values.accountOverview.total_margin,
      maintenanceMarginUsd: values.accountOverview.maintenance_margin ?? null,
      crossMarginRatio: values.accountOverview.cross_margin_ratio ?? null,
      marginDeficitUsd: values.accountOverview.margin_deficit ?? null,
      postOrderTierVerified: false,
      positions: values.positions.map((p) => ({
        market: p.market,
        size: p.size,
        estimatedLiquidationPrice: p.estimated_liquidation_price ?? null,
        userLeverage: p.user_leverage ?? null,
        entryPrice: p.entry_price ?? null,
        isolated: p.is_isolated ?? null,
      })),
    };
    const BTCPositions = filterDecibelBTCMarketActivityV1(values.positions);
    const ActiveBTCTwaps = filterDecibelBTCMarketActivityV1(values.activeTwaps).filter(
      isActiveDecibelTwapV1,
    );
    const BTCTpSlPositions = BTCPositions.filter(
      (row) => row.tp_order_id !== null || row.sl_order_id !== null,
    );
    if (BTCPositions.some((position) => position.user !== configuration.DECIBEL_SUBACCOUNT_ADDRESS))
      throw new Error('PRODUCTION_LIVE_SOURCE_SUBACCOUNT_MISMATCH');
    if (BTCPositions.length > 1) throw new Error('PRODUCTION_LIVE_SOURCE_POSITION_AMBIGUOUS');
    const position = BTCPositions[0];
    const actualInventoryBase = position?.size ?? 0;
    const { catastropheStop, foreignTpSlCount } = deriveDecibelPositionStopStateV1(
      BTCPositions,
      values.openOrders,
    );
    if (
      !Number.isFinite(values.accountOverview.perp_equity_balance) ||
      !Number.isFinite(values.accountOverview.total_margin) ||
      !Number.isFinite(values.accountOverview.cross_available_to_trade) ||
      values.accountOverview.perp_equity_balance < 0 ||
      values.accountOverview.total_margin < 0 ||
      values.accountOverview.cross_available_to_trade < 0
    )
      throw new Error('PRODUCTION_LIVE_SOURCE_ACCOUNT_MARGIN_INVALID');
    const availableMarginUsd = getDecibelAuthoritativeAvailableMarginUsdV1(values.accountOverview);
    const maximumEffectiveLeverage = Math.min(
      configuration.MAX_EFFECTIVE_LEVERAGE,
      values.metadata.maximumLeverage,
    );
    const openOrders = normalizeDecibelAuthenticatedOpenOrdersV1(
      values.openOrders,
      DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      configuration.DECIBEL_PRODUCTION_LIVE_STRATEGY_CONFIG_ID,
      values.orderHistory,
    );
    const bulk = resolveDecibelBulkOrderActivityV1({
      configuredSubaccount: configuration.DECIBEL_SUBACCOUNT_ADDRESS,
      configuredMarket: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      records: values.bulkOrders,
      readSuccessful: true,
    });
    const ledger = buildStrategyFillLedger(
      values.orderHistory,
      values.tradeHistory,
      DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      receivedAt,
      baseline,
    );
    const knownOrderIds = new Set(ledger.orders.map((order) => order.venueOrderId));
    const outOfBandBTCFillCount = values.tradeHistory.filter(
      (trade) =>
        isDecibelBTCMarketActivityV1(trade) &&
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
        priceDecimals: values.metadata.priceDecimals,
        sizeDecimals: values.metadata.sizeDecimals,
        mode: values.metadata.mode,
      },
      book: {
        bestBid: book.best_bid,
        bestAsk: book.best_ask,
        exchangeTimestamp: book.unix_ms,
        observedAt: authoritativeBookObservedAt,
        bestBidSize: book.best_bid_size,
        bestAskSize: book.best_ask_size,
        microprice: book.microprice,
        topBookImbalance: book.top_book_imbalance,
        ...(priorityDepth === undefined ? {} : { depth: priorityDepth }),
      },
      position: actualInventoryBase,
      availableMarginUsd,
      maximumEffectiveLeverage,
      economicInputs: Object.freeze({
        makerFeeBps:
          configuration.DECIBEL_PRODUCTION_MAKER_FEE_BPS ?? economicEvidence?.makerFeeBps ?? null,
        makerFeeSource:
          configuration.DECIBEL_PRODUCTION_MAKER_FEE_BPS !== undefined
            ? ('CONFIG' as const)
            : (economicEvidence?.makerFeeSource ?? ('UNKNOWN' as const)),
        estimatedGasCostUsd:
          configuration.DECIBEL_PRODUCTION_ESTIMATED_GAS_COST_USD ??
          economicEvidence?.conservativeGasCostUsd ??
          null,
        estimatedGasCostSource:
          configuration.DECIBEL_PRODUCTION_ESTIMATED_GAS_COST_USD !== undefined
            ? ('CONFIG' as const)
            : (economicEvidence?.gasCostSource ?? ('UNKNOWN' as const)),
        adverseSelectionBufferBps:
          configuration.DECIBEL_PRODUCTION_ADVERSE_SELECTION_BUFFER_BPS ??
          economicEvidence?.adverseSelectionBufferBps ??
          null,
        adverseSelectionSource:
          configuration.DECIBEL_PRODUCTION_ADVERSE_SELECTION_BUFFER_BPS !== undefined
            ? 'CONFIG'
            : (economicEvidence?.adverseSelectionSource ?? 'UNKNOWN'),
        candidateAdverseSelection: economicEvidence?.candidateAdverseSelection ?? [],
        safetyMarginBps: configuration.DECIBEL_PRODUCTION_EDGE_SAFETY_MARGIN_BPS,
      }),
      halfSpreadBps: configuration.DECIBEL_PRODUCTION_TUI_HALF_SPREAD_BPS,
      maximumAbsPositionBase: Math.min(
        configuration.DECIBEL_PRODUCTION_TUI_MAX_POSITION_BASE ??
          configuration.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD /
            ((book.best_bid + book.best_ask) / 2),
        configuration.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD /
          ((book.best_bid + book.best_ask) / 2),
      ),
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
      activeTwaps: ActiveBTCTwaps.length,
      activeTpSl: BTCTpSlPositions.length,
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
      market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      metadata: {
        marketAddress: values.metadata.marketAddress,
        symbol: values.metadata.symbol,
        tickSize: values.metadata.tickSize,
        lotSize: values.metadata.lotSize,
        minimumSize: values.metadata.minimumSize,
        priceDecimals: values.metadata.priceDecimals,
        sizeDecimals: values.metadata.sizeDecimals,
        mode: values.metadata.mode,
        observedAt: receivedAt,
      },
      book: {
        bestBid: book.best_bid,
        bestAsk: book.best_ask,
        observedAt: bookTimestamp.observedAt,
        ...(priorityDepth === undefined ? {} : { depth: priorityDepth }),
      },
      maxBboAgeMs: configuration.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS,
      actualInventoryBase,
      inventoryDirectionProven: true,
      openOrders,
      activeTwapCount: ActiveBTCTwaps.length,
      activeTpSlCount: foreignTpSlCount,
      activeBulkOrderCount: bulk.bulkOrderActivityClear ? 0 : 1,
      manualOrDelegatedActivityCount: 0,
      unresolvedExecutionPlanCount: 0,
      persistenceAvailable: true,
      targetExternalMakerVolumeUsd:
        configuration.DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD ?? null,
      targetExternalMakerVolumeBaselineUsd:
        configuration.DECIBEL_PASSIVE_RECYCLING_BASELINE_VOLUME_USD,
      actualFillLedger: ledger,
    };
    const snapshot: decibel_production_live_snapshot_v1 = Object.freeze({
      sourceStateHash: canonicalHash(semantic),
      capacityModelRequired: true,
      capacityProduction: await this.readCapacityProduction({
        sessionId: strategyInput.sessionId,
        probeNotionalUsd: configuration.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD,
        manifest: null,
      }),
      minimumNotionalUsd: configuration.DECIBEL_PRODUCTION_LIVE_MIN_NOTIONAL_USD,
      maximumNotionalUsd: Math.min(
        configuration.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD,
        configuration.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD,
      ),
      availableMarginUsd,
      maximumEffectiveLeverage,
      economicInputs: semantic.economicInputs,
      warnings: Object.freeze([
        ...(outOfBandBTCFillCount > 0
          ? [
              actualInventoryBase === 0
                ? 'AUTHENTICATED_FILL_ATTRIBUTION_INCOMPLETE_AUTHENTICATED_FLAT_WARNING'
                : 'AUTHENTICATED_FILL_ATTRIBUTION_INCOMPLETE_ON_CHAIN_POSITION_AUTHORITATIVE',
            ]
          : []),
        ...(bookTimestamp.clamped
          ? [`PRODUCTION_LIVE_SOURCE_BOOK_CLOCK_SKEW_ACCEPTED:${bookTimestamp.clockSkewMs}MS`]
          : []),
      ]),
      accountMetrics: Object.freeze({
        collateralUsd: values.accountOverview.perp_equity_balance,
        totalMarginUsd: values.accountOverview.total_margin,
        unrealizedPnlUsd: Number.isFinite(values.accountOverview.unrealized_pnl)
          ? (values.accountOverview.unrealized_pnl ?? null)
          : null,
        masterAptGas: null,
      }),
      catastropheStop,
      authenticatedPositions: Object.freeze(
        values.positions
          .filter((row) => Number.isFinite(row.size) && row.size !== 0)
          .map((row) =>
            Object.freeze({
              market: isDecibelBTCMarketActivityV1(row) ? 'BTC/USD' : row.market,
              size: row.size,
              entryPrice: row.entry_price ?? null,
              source: isDecibelBTCMarketActivityV1(row)
                ? ('UNKNOWN' as const)
                : ('EXTERNAL' as const),
            }),
          ),
      ),
      terminalOrderEvidence: Object.freeze(
        normalizeDecibelTerminalOrderEvidenceV1(values.orderHistory),
      ),
      venueReadWindow: Object.freeze({
        account: { startedAt: requestedAt, completedAt: receivedAt },
        history: { startedAt: requestedAt, completedAt: receivedAt },
      }),
      ...(actualInventoryBase === 0 &&
      openOrders.length === 0 &&
      baseline.outOfBandFillIds.length > 0
        ? {
            authenticatedFlatNeutralization: Object.freeze({
              checkpointBodyHashSha256: baseline.checkpointBodyHashSha256,
              resyncTimestamp: baseline.resyncTimestamp,
              outOfBandFillIds: baseline.outOfBandFillIds,
            }),
          }
        : {}),
      marketScopeDiagnostics: Object.freeze({
        rawPositionMarketIdentities: getDecibelMarketIdentityDiagnosticsV1(values.positions),
        rawOpenOrderMarketIdentities: getDecibelMarketIdentityDiagnosticsV1(values.openOrders),
        rawFillMarketIdentities: getDecibelMarketIdentityDiagnosticsV1(values.tradeHistory),
        rawTwapMarketIdentities: getDecibelMarketIdentityDiagnosticsV1(values.activeTwaps),
        rawTpSlMarketIdentities: getDecibelMarketIdentityDiagnosticsV1(BTCTpSlPositions),
        historicalOutOfBandBTCFillCount: outOfBandBTCFillCount,
        activeTwapCount: ActiveBTCTwaps.length,
        activeTpSlCount: foreignTpSlCount,
        activeBulkOrderCount: bulk.bulkOrderActivityClear ? 0 : 1,
      }),
      input: strategyInput,
    });
    return snapshot;
  }

  /** Closed venue 1-minute candles for [startMs, endMs], validated; [] when unsupported. */
  public async readExchangeCandles1m(
    startMs: number,
    endMs: number,
  ): Promise<readonly decibel_exchange_candle_v1[]> {
    if (this.Reader.readCandles1m === undefined) return [];
    const rows = await this.Reader.readCandles1m(startMs, endMs);
    return normalizeDecibelExchangeCandlesV1(rows, this.getNow());
  }

  public async readAuthenticatedAccountState(signal?: AbortSignal): Promise<
    Readonly<{
      readWindow: import('./decibel_venue_reconciliation_snapshot_v1.js').decibel_venue_read_window_v1;
      observedAt: number;
      availableMarginUsd: number;
      marketMetadata: decibel_production_live_snapshot_v1['input']['metadata'];
      accountMetrics: NonNullable<decibel_production_live_snapshot_v1['accountMetrics']>;
      authenticatedPositions: NonNullable<
        decibel_production_live_snapshot_v1['authenticatedPositions']
      >;
      actualInventoryBase: number;
      openOrders: decibel_production_live_snapshot_v1['input']['openOrders'];
      catastropheStop: decibel_production_live_snapshot_v1['catastropheStop'];
      activeTpSlCount: number;
    }>
  > {
    const configuration = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    assertDecibelHTTPReadAllowedV1(this.getNow());
    const startedAt = this.getNow();
    try {
      const [accountOverview, positions, rawOpenOrders, metadata] = await Promise.all([
        this.readAuthenticatedStage(
          'ACCOUNT_OVERVIEW',
          (signal) =>
            this.Reader.readAccountOverview(configuration.DECIBEL_SUBACCOUNT_ADDRESS, signal),
          signal,
        ),
        this.readAuthenticatedStage(
          'POSITIONS',
          (signal) =>
            this.Reader.readPositions(
              configuration.DECIBEL_SUBACCOUNT_ADDRESS,
              DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
              signal,
            ),
          signal,
        ),
        this.readAuthenticatedStage(
          'OPEN_ORDERS',
          (signal) => this.Reader.readOpenOrders(configuration.DECIBEL_SUBACCOUNT_ADDRESS, signal),
          signal,
        ),
        this.readAuthenticatedStage(
          'MARKET_METADATA',
          (signal) => this.Reader.readMarketMetadata(signal),
          signal,
        ),
      ]);
      const observedAt = this.getNow();
      await this.refreshAccountRiskInputs(
        positions.filter(isDecibelBTCMarketActivityV1).reduce((sum, p) => sum + p.size, 0),
        undefined,
        false,
      );
      signal?.throwIfAborted();
      this.CapacityAccountObservation = {
        source: 'AUTHENTICATED_ACCOUNT_OVERVIEW',
        observedAt: startedAt,
        equityUsd: accountOverview.perp_equity_balance,
        primaryCollateralOnly: accountOverview.secondary_collateral === null,
        freeMarginUsd: accountOverview.cross_available_to_trade,
        totalMarginUsd: accountOverview.total_margin,
        maintenanceMarginUsd: accountOverview.maintenance_margin ?? null,
        crossMarginRatio: accountOverview.cross_margin_ratio ?? null,
        marginDeficitUsd: accountOverview.margin_deficit ?? null,
        postOrderTierVerified: false,
        positions: positions.map((p) => ({
          market: p.market,
          size: p.size,
          estimatedLiquidationPrice: p.estimated_liquidation_price ?? null,
          userLeverage: p.user_leverage ?? null,
          entryPrice: p.entry_price ?? null,
          isolated: p.is_isolated ?? null,
        })),
      };
      const BTCPositions = filterDecibelBTCMarketActivityV1(positions);
      if (
        BTCPositions.some((position) => position.user !== configuration.DECIBEL_SUBACCOUNT_ADDRESS)
      )
        throw new Error('PRODUCTION_LIVE_SOURCE_SUBACCOUNT_MISMATCH');
      if (BTCPositions.length > 1) throw new Error('PRODUCTION_LIVE_SOURCE_POSITION_AMBIGUOUS');
      if (
        !Number.isFinite(accountOverview.perp_equity_balance) ||
        !Number.isFinite(accountOverview.total_margin) ||
        !Number.isFinite(accountOverview.cross_available_to_trade) ||
        accountOverview.perp_equity_balance < 0 ||
        accountOverview.total_margin < 0 ||
        accountOverview.cross_available_to_trade < 0
      )
        throw new Error('PRODUCTION_LIVE_SOURCE_ACCOUNT_MARGIN_INVALID');
      const availableMarginUsd = getDecibelAuthoritativeAvailableMarginUsdV1(accountOverview);
      return Object.freeze({
        observedAt,
        marketMetadata: Object.freeze({ ...metadata, observedAt: startedAt }),
        readWindow: Object.freeze({ startedAt, completedAt: observedAt }),
        availableMarginUsd,
        accountMetrics: Object.freeze({
          collateralUsd: accountOverview.perp_equity_balance,
          totalMarginUsd: accountOverview.total_margin,
          unrealizedPnlUsd: Number.isFinite(accountOverview.unrealized_pnl)
            ? (accountOverview.unrealized_pnl ?? null)
            : null,
          masterAptGas: null,
        }),
        authenticatedPositions: Object.freeze(
          positions
            .filter((position) => Number.isFinite(position.size) && position.size !== 0)
            .map((position) =>
              Object.freeze({
                market: isDecibelBTCMarketActivityV1(position) ? 'BTC/USD' : position.market,
                size: position.size,
                entryPrice: position.entry_price ?? null,
                source: isDecibelBTCMarketActivityV1(position)
                  ? ('UNKNOWN' as const)
                  : ('EXTERNAL' as const),
              }),
            ),
        ),
        actualInventoryBase: BTCPositions[0]?.size ?? 0,
        openOrders: normalizeDecibelAuthenticatedOpenOrdersV1(
          rawOpenOrders,
          DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
          configuration.DECIBEL_PRODUCTION_LIVE_STRATEGY_CONFIG_ID,
        ),
        ...(() => {
          const stops = deriveDecibelPositionStopStateV1(BTCPositions, rawOpenOrders);
          return {
            catastropheStop: stops.catastropheStop,
            activeTpSlCount: stops.foreignTpSlCount,
          };
        })(),
      });
    } catch (error) {
      if (isDecibelSourceRateLimitError(error)) {
        enterDecibelHTTPReadBackoffForErrorV1(
          error,
          Number(this.Environment.DECIBEL_PRODUCTION_RATE_LIMIT_BACKOFF_MS ?? 30_000),
          this.getNow(),
        );
        throw new Error('PRODUCTION_DECIBEL_HTTP_RATE_LIMITED', { cause: error });
      }
      throw new Error('PRODUCTION_AUTHENTICATED_READ_REQUIRED', { cause: error });
    }
  }

  public async readAuthenticatedFillLedger(
    startedAt?: number,
    parentSignal?: AbortSignal,
  ): Promise<
    Readonly<{
      readWindow: import('./decibel_venue_reconciliation_snapshot_v1.js').decibel_venue_read_window_v1;
      observedAt: number;
      ledger: decibel_actual_fill_ledger_v1;
      terminalOrderEvidence: NonNullable<
        decibel_production_live_snapshot_v1['terminalOrderEvidence']
      >;
    }>
  > {
    assertDecibelHTTPReadAllowedV1(this.getNow());
    const configuration = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    const baseline = this.getActivityBaseline();
    const observedAt = this.getNow();
    if (
      startedAt !== undefined &&
      (!Number.isSafeInteger(startedAt) ||
        startedAt < 0 ||
        startedAt > observedAt ||
        observedAt - startedAt >= DECIBEL_MAX_HISTORY_RANGE_MS)
    )
      throw new Error('SESSION_FILL_HISTORY_RANGE_INCOMPLETE');
    const start = Math.max(
      startedAt ?? baseline.historyStartTimestamp,
      observedAt - DECIBEL_MAX_HISTORY_RANGE_MS + 1,
    );
    const [orders, trades] = await Promise.all([
      this.readAuthenticatedStage(
        'ORDER_HISTORY',
        (signal) =>
          (this.Reader.readOrderHistoryExhaustive ?? this.Reader.readOrderHistory).call(
            this.Reader,
            configuration.DECIBEL_SUBACCOUNT_ADDRESS,
            start,
            observedAt,
            signal,
          ),
        parentSignal,
      ),
      this.readAuthenticatedStage(
        'TRADE_HISTORY',
        (signal) =>
          (this.Reader.readTradeHistoryExhaustive ?? this.Reader.readTradeHistory).call(
            this.Reader,
            configuration.DECIBEL_SUBACCOUNT_ADDRESS,
            start,
            observedAt,
            signal,
          ),
        parentSignal,
      ),
    ]);
    const ledger = buildStrategyFillLedger(
      orders,
      trades,
      DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      observedAt,
      baseline,
    );
    const known = new Set(ledger.orders.map((order) => order.venueOrderId));
    if (
      trades.some(
        (trade) =>
          trade.source === 'OrderFill' &&
          isDecibelBTCMarketActivityV1(trade) &&
          isStrategyClientOrderId(trade.client_order_id) &&
          !known.has(trade.order_id),
      )
    )
      throw new Error('SESSION_FILL_ORDER_IDENTITY_PENDING');
    parentSignal?.throwIfAborted();
    return Object.freeze({
      observedAt,
      readWindow: Object.freeze({ startedAt: observedAt, completedAt: this.getNow() }),
      ledger,
      terminalOrderEvidence: normalizeDecibelTerminalOrderEvidenceV1(orders),
    });
  }

  public async readAuthenticatedSnapshotAfterMutation(): Promise<decibel_production_live_snapshot_v1> {
    return this.readAuthenticatedSnapshot();
  }

  public async readAuthenticatedPosition(): Promise<
    Readonly<{ positionBase: number; observedAt: number; source: 'AUTHENTICATED_POSITION_READ' }>
  > {
    assertDecibelHTTPReadAllowedV1(this.getNow());
    const configuration = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    const rows = filterDecibelBTCMarketActivityV1(
      await this.readAuthenticatedStage('POSITION_REVALIDATION', (signal) =>
        this.Reader.readPositions(
          configuration.DECIBEL_SUBACCOUNT_ADDRESS,
          DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
          signal,
        ),
      ),
    );
    if (rows.some((position) => position.user !== configuration.DECIBEL_SUBACCOUNT_ADDRESS))
      throw new Error('PRODUCTION_LIVE_SOURCE_SUBACCOUNT_MISMATCH');
    if (rows.length > 1) throw new Error('PRODUCTION_LIVE_SOURCE_POSITION_AMBIGUOUS');
    const positionBase = rows[0]?.size ?? 0;
    if (!Number.isFinite(positionBase))
      throw new Error('PRODUCTION_AUTHENTICATED_POSITION_INVALID');
    return Object.freeze({
      positionBase,
      observedAt: this.getNow(),
      source: 'AUTHENTICATED_POSITION_READ',
    });
  }

  public async readOrderIdentityEvidence(
    input: Readonly<{
      venueOrderId: string;
      clientOrderId: string;
      createdAt: number;
      transactionHash: string | null;
    }>,
  ): Promise<decibel_order_identity_evidence_v1> {
    const observedAt = this.getNow();
    assertDecibelHTTPReadAllowedV1(observedAt);
    const configuration = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    const queryStartTimestamp = Math.max(
      0,
      input.createdAt,
      observedAt - DECIBEL_MAX_HISTORY_RANGE_MS + 1,
    );
    const configuredTimeoutMs = Number(
      this.Environment.DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS ?? 10_000,
    );
    const signal = AbortSignal.timeout(
      Number.isFinite(configuredTimeoutMs) ? Math.max(1_000, configuredTimeoutMs - 1_000) : 9_000,
    );
    const [openOrders, orderHistory, tradeHistory, transactionState] = await Promise.all([
      this.Reader.readOpenOrders(configuration.DECIBEL_SUBACCOUNT_ADDRESS, signal),
      this.Reader.readOrderHistoryExhaustive === undefined
        ? this.Reader.readOrderHistory(
            configuration.DECIBEL_SUBACCOUNT_ADDRESS,
            queryStartTimestamp,
            observedAt,
            signal,
          )
        : this.Reader.readOrderHistoryExhaustive(
            configuration.DECIBEL_SUBACCOUNT_ADDRESS,
            queryStartTimestamp,
            observedAt,
            signal,
          ),
      this.Reader.readTradeHistoryExhaustive === undefined
        ? this.Reader.readTradeHistory(
            configuration.DECIBEL_SUBACCOUNT_ADDRESS,
            queryStartTimestamp,
            observedAt,
            signal,
          )
        : this.Reader.readTradeHistoryExhaustive(
            configuration.DECIBEL_SUBACCOUNT_ADDRESS,
            queryStartTimestamp,
            observedAt,
            signal,
          ),
      input.transactionHash === null
        ? Promise.resolve(null)
        : this.readTransactionEvidence(input.transactionHash),
    ]);
    const matchesIdentity = (venueOrderId: string, clientOrderId: string | null | undefined) =>
      venueOrderId === input.venueOrderId && clientOrderId === input.clientOrderId;
    const relatedRows = [...openOrders, ...orderHistory, ...tradeHistory].filter(
      (row) => row.order_id === input.venueOrderId || row.client_order_id === input.clientOrderId,
    );
    if (
      relatedRows.some(
        (row) =>
          !matchesIdentity(row.order_id, row.client_order_id) || !isDecibelBTCMarketActivityV1(row),
      )
    )
      throw new Error('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT');
    return Object.freeze({
      observedAt,
      queryStartTimestamp,
      queryEndTimestamp: observedAt,
      venueOrderId: input.venueOrderId,
      clientOrderId: input.clientOrderId,
      openOrders: Object.freeze(
        openOrders.filter((order) => matchesIdentity(order.order_id, order.client_order_id)),
      ),
      terminalOrders: Object.freeze(
        orderHistory.flatMap((order) => {
          if (!matchesIdentity(order.order_id, order.client_order_id)) return [];
          const state = normalizeTerminalOrderState(
            order.status ?? order.order_status ?? order.state,
          );
          return state === null
            ? []
            : [
                Object.freeze({
                  venueOrderId: order.order_id,
                  clientOrderId: order.client_order_id,
                  state,
                  side: order.is_buy ? ('BUY' as const) : ('SELL' as const),
                  originalQuantity: order.orig_size,
                  remainingQuantity: order.remaining_size ?? null,
                }),
              ];
        }),
      ),
      fills: Object.freeze(
        aggregateDecibelTradeHistoryFragmentsV1(
          tradeHistory.filter(
            (trade) =>
              trade.source === 'OrderFill' &&
              matchesIdentity(trade.order_id, trade.client_order_id),
          ),
        ).map((trade) =>
          Object.freeze({
            venueFillId: trade.trade_id,
            quantity: trade.size,
            price: trade.price,
            transactionTimestamp: trade.transaction_unix_ms,
            ...(Number.isSafeInteger(trade.transaction_version) &&
            (trade.transaction_version ?? 0) > 0
              ? { transactionVersion: String(trade.transaction_version) }
              : {}),
          }),
        ),
      ),
      transactionState,
    });
  }

  public async readTransactionEvidence(
    transactionHash: string,
  ): Promise<'COMMITTED' | 'NOT_FOUND'> {
    if (this.Reader.readTransactionByHash === undefined)
      throw new Error('PRODUCTION_RECONCILIATION_TRANSACTION_LOOKUP_UNAVAILABLE');
    return this.Reader.readTransactionByHash(transactionHash);
  }

  public async readPublicMarketPrice(): Promise<number> {
    const state = await this.readPublicMarketState();
    return (state.bestBid + state.bestAsk) / 2;
  }

  public readMarketDataDiagnostics() {
    return (
      this.Reader.readMarketDataDiagnostics?.() ??
      Object.freeze({
        wsConnectionState: 'INIT' as const,
        wsSubscriptionState: 'UNSUBSCRIBED' as const,
        lastWsMessageAgeMs: null,
        lastValidBboAgeMs: null,
        wsReconnectCount: 0,
        wsLastDisconnectReason: null,
      })
    );
  }

  public async readPublicMarketState(): Promise<
    Readonly<{
      observedAt: number;
      venueTimestamp: number;
      bestBid: number;
      bestAsk: number;
      depth?: NonNullable<decibel_authenticated_passive_recycling_input_v1['book']['depth']>;
      wsConnectionState: 'CONNECTED';
      wsSubscriptionState: 'SUBSCRIBED';
      lastWsMessageAgeMs: number;
      lastValidBboAgeMs: number;
      wsReconnectCount: number;
      wsLastDisconnectReason: string | null;
    }>
  > {
    const configuration = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    const metadata = await this.Reader.readMarketMetadata();
    const rawBook = await this.Reader.readCurrentBook(metadata.marketAddress);
    this.observeCapacityBook(rawBook, metadata.lotSize);
    this.PreviewVenueLeverage = metadata.maximumLeverage;
    const book = CurrentBookSchema.parse(rawBook);
    if (book.best_bid <= 0 || book.best_ask <= book.best_bid)
      throw new Error('PRODUCTION_PUBLIC_BOOK_INVALID');
    const receivedAt = this.getNow();
    normalizeDecibelProductionBookTimestampV1(
      book.unix_ms,
      receivedAt,
      configuration.DECIBEL_PRODUCTION_LIVE_MAX_CLOCK_SKEW_MS,
    );
    const diagnostics = this.Reader.readMarketDataDiagnostics?.();
    if (
      diagnostics === undefined ||
      diagnostics.wsConnectionState !== 'CONNECTED' ||
      diagnostics.wsSubscriptionState !== 'SUBSCRIBED' ||
      diagnostics.lastWsMessageAgeMs === null ||
      diagnostics.lastValidBboAgeMs === null ||
      diagnostics.lastValidBboAgeMs > configuration.DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS
    )
      throw new Error(
        `PRODUCTION_LIVE_SOURCE_BOOK_STALE:${diagnostics?.wsConnectionState ?? 'UNKNOWN'}:${diagnostics?.wsSubscriptionState ?? 'UNKNOWN'}`,
      );
    const observedAt = receivedAt - diagnostics.lastValidBboAgeMs;
    const priorityDepth = readDecibelEntryPriorityDepthV1(rawBook, observedAt);
    return Object.freeze({
      // Admission freshness is the receipt time of the latest valid WS BBO. The
      // venue timestamp is still validated above, but it is not a local feed
      // liveness clock and may legitimately lag or repeat across depth frames.
      observedAt,
      ...(priorityDepth === undefined ? {} : { depth: priorityDepth }),
      venueTimestamp: book.unix_ms,
      bestBid: book.best_bid,
      bestAsk: book.best_ask,
      wsConnectionState: diagnostics.wsConnectionState,
      wsSubscriptionState: diagnostics.wsSubscriptionState,
      lastWsMessageAgeMs: diagnostics.lastWsMessageAgeMs,
      lastValidBboAgeMs: diagnostics.lastValidBboAgeMs,
      wsReconnectCount: diagnostics.wsReconnectCount,
      wsLastDisconnectReason: diagnostics.wsLastDisconnectReason,
    });
  }

  public async verifyTimedOutIntent(
    intent: execution_intent_v1,
    venueOrderId: string | null,
    telemetry: Readonly<{ transactionHash: string; expirationTimestampMs: number }> | null,
  ): Promise<
    | Readonly<{ state: 'ORDER_OPEN'; openOrder: decibel_authenticated_strategy_order_v1 }>
    | Readonly<{ state: 'INTENT_FAILED_TIMEOUT' }>
    | Readonly<{ state: 'DROPPED_EXPIRED' }>
    | Readonly<{ state: 'UNRESOLVED' }>
  > {
    assertDecibelHTTPReadAllowedV1(this.getNow());
    const configuration = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    const endTimestamp = this.getNow();
    const startTimestamp = Math.max(
      intent.createdAt,
      endTimestamp - DECIBEL_MAX_HISTORY_RANGE_MS + 1,
    );
    const [openOrders, orderHistory] = await Promise.all([
      this.Reader.readOpenOrders(configuration.DECIBEL_SUBACCOUNT_ADDRESS),
      this.Reader.readOrderHistoryExhaustive === undefined
        ? this.Reader.readOrderHistory(
            configuration.DECIBEL_SUBACCOUNT_ADDRESS,
            startTimestamp,
            endTimestamp,
          )
        : this.Reader.readOrderHistoryExhaustive(
            configuration.DECIBEL_SUBACCOUNT_ADDRESS,
            startTimestamp,
            endTimestamp,
          ),
    ]);
    const matchesIdentity = (order: {
      order_id: string;
      client_order_id: string | null;
    }): boolean =>
      venueOrderId === null
        ? order.client_order_id === intent.clientOrderId
        : order.order_id === venueOrderId && order.client_order_id === intent.clientOrderId;
    const directlyVerifiedOpenOrder = openOrders.find(
      (order) => isDecibelBTCMarketActivityV1(order) && matchesIdentity(order),
    );
    if (directlyVerifiedOpenOrder !== undefined) {
      const normalized = normalizeDecibelAuthenticatedOpenOrdersV1(
        [directlyVerifiedOpenOrder],
        DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        configuration.DECIBEL_PRODUCTION_LIVE_STRATEGY_CONFIG_ID,
        orderHistory,
      )[0];
      return normalized === undefined
        ? Object.freeze({ state: 'UNRESOLVED' as const })
        : Object.freeze({ state: 'ORDER_OPEN' as const, openOrder: normalized });
    }
    const terminal = orderHistory.find(
      (order) => isDecibelBTCMarketActivityV1(order) && matchesIdentity(order),
    );
    if (terminal === undefined) {
      const dropped =
        telemetry !== null &&
        this.Reader.verifyTransactionExpiredUncommitted !== undefined &&
        (await this.Reader.verifyTransactionExpiredUncommitted(
          telemetry.transactionHash,
          telemetry.expirationTimestampMs,
        ));
      return Object.freeze({
        state: dropped ? ('DROPPED_EXPIRED' as const) : ('UNRESOLVED' as const),
      });
    }
    const state = normalizeTerminalOrderState(
      terminal.status ?? terminal.order_status ?? terminal.state,
    );
    return Object.freeze({
      state:
        state === 'CANCELLED' || state === 'EXPIRED' || state === 'REJECTED'
          ? ('INTENT_FAILED_TIMEOUT' as const)
          : ('UNRESOLVED' as const),
    });
  }

  public async reconcileIntent(
    _intentId: string,
    snapshot: decibel_production_live_snapshot_v1,
    venueOrderId?: string | null,
    identity?: Readonly<{
      clientOrderId: string;
      createdAt: number;
      transactionHash: string | null;
      requestedQuantity?: number;
      side?: 'BUY' | 'SELL';
    }>,
  ): Promise<reconciliation_state_v1> {
    if (venueOrderId == null && identity !== undefined) {
      const matchingOpen = snapshot.input.openOrders.find(
        (order) => order.clientOrderId === identity.clientOrderId,
      );
      if (matchingOpen !== undefined) return 'ORDER_OPEN';
      const matchingTerminal = snapshot.terminalOrderEvidence?.find(
        (order) => order.clientOrderId === identity.clientOrderId,
      );
      if (matchingTerminal !== undefined) {
        const filledQuantity = snapshot.input.actualFillLedger.fills
          .filter((fill) => fill.venueOrderId === matchingTerminal.venueOrderId)
          .reduce((sum, fill) => sum + fill.executedBaseQuantity, 0);
        const neutralization = resolveDecibelExternalOrderNeutralizationV1({
          terminalState: matchingTerminal.state,
          remainingQuantity: matchingTerminal.remainingQuantity,
          authenticatedFilledQuantity: filledQuantity,
        });
        if (neutralization !== null) return neutralization;
      }
      const recentEnd = this.getNow();
      const recentStart = Math.max(
        0,
        identity.createdAt,
        recentEnd - DECIBEL_MAX_HISTORY_RANGE_MS + 1,
      );
      assertDecibelHTTPReadAllowedV1(recentEnd);
      const configuration = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
      const [recentOrders, recentTrades] = await Promise.all([
        this.Reader.readOrderHistoryExhaustive === undefined
          ? this.Reader.readOrderHistory(
              configuration.DECIBEL_SUBACCOUNT_ADDRESS,
              recentStart,
              recentEnd,
            )
          : this.Reader.readOrderHistoryExhaustive(
              configuration.DECIBEL_SUBACCOUNT_ADDRESS,
              recentStart,
              recentEnd,
            ),
        this.Reader.readTradeHistoryExhaustive === undefined
          ? this.Reader.readTradeHistory(
              configuration.DECIBEL_SUBACCOUNT_ADDRESS,
              recentStart,
              recentEnd,
            )
          : this.Reader.readTradeHistoryExhaustive(
              configuration.DECIBEL_SUBACCOUNT_ADDRESS,
              recentStart,
              recentEnd,
            ),
      ]);
      const matchingOrders = recentOrders.filter(
        (order) => order.client_order_id === identity.clientOrderId,
      );
      const matchingTrades = recentTrades.filter(
        (trade) => trade.client_order_id === identity.clientOrderId,
      );
      const matchedVenueOrderId = matchingOrders[0]?.order_id ?? matchingTrades[0]?.order_id;
      if (matchedVenueOrderId !== undefined) {
        const evidence = resolveDecibelRecentOrderEvidenceV1(
          matchingOrders,
          matchingTrades,
          matchedVenueOrderId,
          identity.requestedQuantity,
        );
        if (evidence !== null) return evidence;
      }
      if (
        identity.transactionHash !== null &&
        (await this.Reader.readTransactionByHash?.(identity.transactionHash)) === 'COMMITTED'
      )
        throw new Error('PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING');
      throw new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
    }
    if (venueOrderId !== undefined && venueOrderId !== null) {
      if (identity !== undefined) {
        const relatedOrders = snapshot.input.openOrders.filter(
          (order) =>
            order.venueOrderId === venueOrderId || order.clientOrderId === identity.clientOrderId,
        );
        const relatedTerminals = (snapshot.terminalOrderEvidence ?? []).filter(
          (order) =>
            order.venueOrderId === venueOrderId || order.clientOrderId === identity.clientOrderId,
        );
        const relatedFills = snapshot.input.actualFillLedger.fills.filter(
          (fill) =>
            fill.venueOrderId === venueOrderId ||
            fill.localExecutionRequestId === identity.clientOrderId,
        );
        if (
          relatedOrders.some(
            (order) =>
              order.venueOrderId !== venueOrderId ||
              order.clientOrderId !== identity.clientOrderId ||
              (identity.side !== undefined && order.side !== identity.side) ||
              !isDecibelBTCMarketActivityV1(order),
          ) ||
          relatedTerminals.some(
            (order) =>
              order.venueOrderId !== venueOrderId ||
              (order.clientOrderId != null && order.clientOrderId !== identity.clientOrderId),
          ) ||
          relatedFills.some(
            (fill) =>
              fill.venueOrderId !== venueOrderId ||
              fill.localExecutionRequestId !== identity.clientOrderId ||
              (identity.side !== undefined && fill.side !== identity.side),
          )
        )
          throw new Error('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT');
      }
      const matchesIdentity = (order: {
        venueOrderId: string;
        clientOrderId?: string | null;
      }): boolean =>
        order.venueOrderId === venueOrderId &&
        (identity === undefined || order.clientOrderId === identity.clientOrderId);
      const currentOpen = snapshot.input.openOrders.find((order) => matchesIdentity(order));
      const trackedOrder = snapshot.input.actualFillLedger.orders.find(
        (order) => order.venueOrderId === venueOrderId,
      );
      const terminal = snapshot.terminalOrderEvidence?.find((order) => matchesIdentity(order));
      const canonicalClientOrderId =
        identity?.clientOrderId ?? currentOpen?.clientOrderId ?? terminal?.clientOrderId ?? '';
      const canonicalQuantity =
        identity?.requestedQuantity ??
        trackedOrder?.requestedQuantity ??
        terminal?.originalQuantity ??
        currentOpen?.quantity ??
        0;
      const canonicalSide = identity?.side ?? trackedOrder?.side ?? currentOpen?.side ?? 'BUY';
      if (canonicalClientOrderId.length > 0 && canonicalQuantity > 0) {
        const canonical = resolveDecibelAuthoritativeOrderEvidenceV1({
          identity: {
            market: 'BTC/USD',
            venueOrderId,
            clientOrderId: canonicalClientOrderId,
            intentId: _intentId,
            side: canonicalSide,
            originalQuantity: canonicalQuantity,
          },
          observations: [
            ...(currentOpen === undefined
              ? []
              : [
                  {
                    source: 'AUTHENTICATED_OPEN_ORDERS' as const,
                    sourceTimestamp: null,
                    observedAt: snapshot.input.now,
                    market: 'BTC/USD',
                    venueOrderId: currentOpen.venueOrderId,
                    clientOrderId: currentOpen.clientOrderId,
                    side: currentOpen.side,
                    // The authenticated open-order quantity is the live residual.
                    // It must not be compared with the immutable submitted quantity.
                    originalQuantity: null,
                    remainingQuantity: currentOpen.quantity,
                    terminalStatus: null,
                  },
                ]),
            ...(terminal === undefined || terminal.clientOrderId == null
              ? []
              : [
                  {
                    source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' as const,
                    sourceTimestamp: null,
                    observedAt: snapshot.input.now,
                    market: 'BTC/USD',
                    venueOrderId: terminal.venueOrderId,
                    clientOrderId: terminal.clientOrderId,
                    side: canonicalSide,
                    originalQuantity: terminal.originalQuantity,
                    remainingQuantity: terminal.remainingQuantity,
                    terminalStatus: terminal.state,
                  },
                ]),
          ],
          fills: snapshot.input.actualFillLedger.fills
            .filter((fill) => fill.venueOrderId === venueOrderId)
            .map((fill) => ({
              source: 'AUTHENTICATED_OWN_FILL_STREAM' as const,
              observedAt: snapshot.input.now,
              venueTimestamp: fill.venueTimestamp?.getTime() ?? null,
              market: 'BTC/USD',
              venueOrderId: fill.venueOrderId,
              clientOrderId: fill.localExecutionRequestId,
              fillId: fill.venueFillId,
              quantity: fill.executedBaseQuantity,
              price: fill.executedPrice,
            })),
        });
        if (canonical.state === 'CONFLICT')
          throw new Error('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT');
        if (canonical.state === 'FULL_FILL') return 'FULL_FILL';
        if (canonical.state === 'PARTIAL_FILL') return 'PARTIAL_FILL';
        if (canonical.state === 'CANCELLED')
          // Cancellation terminates the residual; prior fills remain fills of
          // the original PLACE and are persisted separately, not neutralized.
          return 'CANCELLED_EXTERNALLY';
        if (canonical.state === 'OPEN') return 'ORDER_OPEN';
      }
      const recentEnd = this.getNow();
      const recentStart = Math.max(
        0,
        identity?.createdAt ?? recentEnd - 3_600_000,
        recentEnd - DECIBEL_MAX_HISTORY_RANGE_MS + 1,
      );
      assertDecibelHTTPReadAllowedV1(recentEnd);
      const [recentOrders, recentTrades] = await Promise.all([
        this.Reader.readOrderHistoryExhaustive === undefined
          ? this.Reader.readOrderHistory(
              ProductionLiveSourceEnvironmentSchema.parse(this.Environment)
                .DECIBEL_SUBACCOUNT_ADDRESS,
              recentStart,
              recentEnd,
            )
          : this.Reader.readOrderHistoryExhaustive(
              ProductionLiveSourceEnvironmentSchema.parse(this.Environment)
                .DECIBEL_SUBACCOUNT_ADDRESS,
              recentStart,
              recentEnd,
            ),
        this.Reader.readTradeHistoryExhaustive === undefined
          ? this.Reader.readTradeHistory(
              ProductionLiveSourceEnvironmentSchema.parse(this.Environment)
                .DECIBEL_SUBACCOUNT_ADDRESS,
              recentStart,
              recentEnd,
            )
          : this.Reader.readTradeHistoryExhaustive(
              ProductionLiveSourceEnvironmentSchema.parse(this.Environment)
                .DECIBEL_SUBACCOUNT_ADDRESS,
              recentStart,
              recentEnd,
            ),
      ]);
      const identityOrders = recentOrders.filter(
        (order) =>
          order.order_id === venueOrderId &&
          (identity === undefined || order.client_order_id === identity.clientOrderId),
      );
      const identityTrades = recentTrades.filter(
        (trade) =>
          trade.order_id === venueOrderId &&
          (identity === undefined || trade.client_order_id === identity.clientOrderId),
      );
      const recentEvidence = resolveDecibelRecentOrderEvidenceV1(
        identityOrders,
        identityTrades,
        identityOrders[0]?.order_id ?? identityTrades[0]?.order_id ?? venueOrderId,
        identity?.requestedQuantity ?? trackedOrder?.requestedQuantity,
      );
      if (recentEvidence !== null) return recentEvidence;
      const checkpointNeutralization = resolveDecibelAuthenticatedFlatCheckpointNeutralizationV1(
        snapshot,
        venueOrderId,
      );
      if (checkpointNeutralization !== null) return checkpointNeutralization;
      if (
        identity?.transactionHash !== null &&
        identity?.transactionHash !== undefined &&
        (await this.Reader.readTransactionByHash?.(identity.transactionHash)) === 'COMMITTED'
      )
        throw new Error('PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING');
      throw new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
    }
    // No exact identity means no authoritative completion. Changes in unrelated
    // orders/fills, or absence from one endpoint, cannot release this intent.
    throw new Error('PRODUCTION_RECONCILIATION_AMBIGUOUS');
  }

  public async revalidateCancelTarget(
    intent: execution_intent_v1,
  ): Promise<reconciliation_state_v1 | 'UNRESOLVED'> {
    assertDecibelHTTPReadAllowedV1(this.getNow());
    if (intent.action !== 'CANCEL') throw new Error('PRE_CANCEL_REVALIDATION_INTENT_INVALID');
    const configuration = ProductionLiveSourceEnvironmentSchema.parse(this.Environment);
    const observedAt = this.getNow();
    const historyStart = Math.max(0, observedAt - 3_600_000);
    const [openOrders, orderHistory, tradeHistory] = await Promise.all([
      this.Reader.readOpenOrders(configuration.DECIBEL_SUBACCOUNT_ADDRESS),
      this.Reader.readOrderHistoryExhaustive === undefined
        ? this.Reader.readOrderHistory(
            configuration.DECIBEL_SUBACCOUNT_ADDRESS,
            historyStart,
            observedAt,
          )
        : this.Reader.readOrderHistoryExhaustive(
            configuration.DECIBEL_SUBACCOUNT_ADDRESS,
            historyStart,
            observedAt,
          ),
      this.Reader.readTradeHistoryExhaustive === undefined
        ? this.Reader.readTradeHistory(
            configuration.DECIBEL_SUBACCOUNT_ADDRESS,
            historyStart,
            observedAt,
          )
        : this.Reader.readTradeHistoryExhaustive(
            configuration.DECIBEL_SUBACCOUNT_ADDRESS,
            historyStart,
            observedAt,
          ),
    ]);
    const terminal = resolveDecibelRecentOrderEvidenceV1(
      orderHistory,
      tradeHistory,
      intent.expectedPreviousVenueOrderId,
      intent.quantity,
    );
    if (terminal !== null) return terminal;
    return openOrders.some(
      (order) =>
        order.order_id === intent.expectedPreviousVenueOrderId &&
        isDecibelBTCMarketActivityV1(order),
    )
      ? 'ORDER_OPEN'
      : 'UNRESOLVED';
  }

  public async close(): Promise<void> {
    for (const Controller of this.ActiveReadControllers)
      Controller.abort(new Error('PRODUCTION_AUTHENTICATED_READ_SHUTDOWN'));
    await this.CapacitySettingsRead;
    await this.Reader.close?.();
  }

  private async readAll(
    subaccount: string,
    startTimestamp: number,
    endTimestamp: number,
    parentSignal?: AbortSignal,
    orderStartTimestamp: number = startTimestamp,
  ) {
    const [
      accountOverview,
      positions,
      openOrders,
      orderHistory,
      tradeHistory,
      activeTwaps,
      bulkOrders,
      metadata,
    ] = await Promise.all([
      this.readAuthenticatedStage(
        'ACCOUNT_OVERVIEW',
        (signal) => this.Reader.readAccountOverview(subaccount, signal),
        parentSignal,
      ),
      this.readAuthenticatedStage(
        'POSITIONS',
        (signal) => this.Reader.readPositions(subaccount, undefined, signal),
        parentSignal,
      ),
      this.readAuthenticatedStage(
        'OPEN_ORDERS',
        (signal) => this.Reader.readOpenOrders(subaccount, signal),
        parentSignal,
      ),
      this.readAuthenticatedStage(
        'ORDER_HISTORY',
        (signal) =>
          this.Reader.readOrderHistory(subaccount, orderStartTimestamp, endTimestamp, signal),
        parentSignal,
      ),
      this.readAuthenticatedStage(
        'TRADE_HISTORY',
        (signal) => this.Reader.readTradeHistory(subaccount, startTimestamp, endTimestamp, signal),
        parentSignal,
      ),
      this.readAuthenticatedStage(
        'ACTIVE_TWAPS',
        (signal) => this.Reader.readActiveTwaps(subaccount, signal),
        parentSignal,
      ),
      this.readAuthenticatedStage(
        'BULK_ORDERS',
        (signal) =>
          this.Reader.readBulkOrders(subaccount, DECIBEL_BTC_USD_MARKET_ADDRESS_V1, signal),
        parentSignal,
      ),
      this.readAuthenticatedStage(
        'MARKET_METADATA',
        () => this.Reader.readMarketMetadata(),
        parentSignal,
      ),
    ]);
    const book = await this.readAuthenticatedStage(
      'CURRENT_BOOK',
      () => this.Reader.readCurrentBook(DECIBEL_BTC_USD_MARKET_ADDRESS_V1),
      parentSignal,
    );
    return {
      accountOverview,
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

  private readonly AuthenticatedStages = new Map<
    string,
    Readonly<{
      startedAt: number;
      completedAt: number | null;
      outcome: string;
    }>
  >();

  public readAuthenticatedEvidenceDiagnostics(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      stages: Object.fromEntries(this.AuthenticatedStages),
      leverageObservedAt: this.CapacitySettings?.leverage.observedAt ?? null,
      feeObservedAt: this.CapacitySettings?.fees.observedAt ?? null,
      marginRulesObservedAt: this.CapacityVenueRules?.observedAt ?? null,
    });
  }

  private async readAuthenticatedStage<T>(
    operation: string,
    read: (signal: AbortSignal) => Promise<T>,
    parentSignal?: AbortSignal,
  ): Promise<T> {
    const evidenceStartedAt = this.getNow();
    this.AuthenticatedStages.set(
      operation,
      Object.freeze({
        startedAt: evidenceStartedAt,
        completedAt: null,
        outcome: 'READING',
      }),
    );
    const startedAt = performance.now();
    const configuredTimeoutMs = Number(
      this.Environment.DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS ?? 10_000,
    );
    const stageTimeoutMs = Number.isFinite(configuredTimeoutMs)
      ? Math.max(1_000, configuredTimeoutMs - 1_000)
      : 9_000;
    const Controller = new AbortController();
    this.ActiveReadControllers.add(Controller);
    const abortFromParent = () => Controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
    if (parentSignal?.aborted) abortFromParent();
    let Timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const cancelled = new Promise<never>((_resolve, reject) => {
        Controller.signal.addEventListener(
          'abort',
          () =>
            reject(
              Controller.signal.reason instanceof Error
                ? Controller.signal.reason
                : new Error('PRODUCTION_AUTHENTICATED_READ_ABORTED'),
            ),
          {
            once: true,
          },
        );
      });
      const value = await Promise.race([
        cancelled,
        Promise.resolve().then(() => {
          Controller.signal.throwIfAborted();
          return read(Controller.signal);
        }),
        new Promise<never>((_resolve, reject) => {
          Timeout = setTimeout(() => {
            Controller.abort(new Error('PRODUCTION_AUTHENTICATED_READ_STAGE_TIMEOUT'));
            reject(new Error('PRODUCTION_AUTHENTICATED_READ_STAGE_TIMEOUT'));
          }, stageTimeoutMs);
        }),
      ]);
      this.AuthenticatedStages.set(
        operation,
        Object.freeze({
          startedAt: evidenceStartedAt,
          completedAt: this.getNow(),
          outcome: 'SUCCEEDED',
        }),
      );
      return value;
    } catch (error) {
      // Whitelist outcome codes; never expose raw HTTP bodies, headers or URLs.
      const message = error instanceof Error ? error.message : '';
      this.AuthenticatedStages.set(
        operation,
        Object.freeze({
          startedAt: evidenceStartedAt,
          completedAt: this.getNow(),
          outcome: /timeout/i.test(message)
            ? 'TIMEOUT'
            : /HTTP Error 500/.test(message)
              ? 'HTTP_500'
              : Controller.signal.aborted
                ? 'ABORTED'
                : 'FAILED',
        }),
      );
      throw new Error(
        `PRODUCTION_AUTHENTICATED_READ_STAGE:${operation}:STARTED_AT=${evidenceStartedAt}:FAILED_AT=${this.getNow()}:ELAPSED_MS=${Math.round(performance.now() - startedAt)}:TIMEOUT_MS=${stageTimeoutMs}`,
        { cause: error },
      );
    } finally {
      parentSignal?.removeEventListener('abort', abortFromParent);
      this.ActiveReadControllers.delete(Controller);
      if (Timeout !== undefined) clearTimeout(Timeout);
      if (!Controller.signal.aborted) Controller.abort();
    }
  }
}

function isDecibelSourceRateLimitError(error: unknown): boolean {
  return isDecibelHTTP429V1(error);
}

export function createDecibelProductionLiveStateSourceV1(
  options: Readonly<{
    environment?: NodeJS.ProcessEnv;
    reader?: DecibelProductionLiveAuthenticatedReaderV1;
    getNow?: () => number;
  }> = {},
): decibel_production_live_state_source_v1 {
  const environment = options.environment ?? process.env;
  const sourceEnvironment = resolveDecibelProductionLiveSourceEnvironmentV1(environment);
  return new decibel_production_live_state_source_v1(
    options.reader ?? makeSDKReader(sourceEnvironment),
    sourceEnvironment,
    options.getNow,
  );
}
