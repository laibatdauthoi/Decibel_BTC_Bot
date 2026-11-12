import dotenv from 'dotenv';

dotenv.config();

import Database from 'better-sqlite3';
import { Aptos, AptosConfig } from '@aptos-labs/ts-sdk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';
import {
  assertDecibelHTTPReadAllowedV1,
  enterDecibelHTTPReadBackoffV1,
  isDecibelHTTP429V1,
} from './decibel_http_read_backoff_v1.js';
import { createDecibelBoundedFetchClientV1 } from './decibel_bounded_fetch_client_v1.js';

function getNumber(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function getString(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)] ?? null;
}

type last_known_good_economic_inputs_v1 = Readonly<{
  observedAt?: number;
  makerFeeObservedAt?: number;
  makerFeeBps?: number;
  makerFeeSource?: string;
  gasCostObservedAt?: number;
  observedGasTxCount?: number;
  medianGasApt?: number;
  p95GasApt?: number;
  aptUsd?: number;
  aptUsdObservedAt?: number;
  aptUsdSource?: string;
}>;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function runEconomicSourceWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutCode: string,
): Promise<T> {
  let Timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        Timer = setTimeout(() => reject(new Error(timeoutCode)), timeoutMs);
      }),
    ]);
  } finally {
    if (Timer !== null) clearTimeout(Timer);
  }
}

async function readWithBoundedBackoff<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown = new Error('ECONOMIC_READ_FAILED');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await runEconomicSourceWithTimeout(operation, 5_000, 'ECONOMIC_SOURCE_TIMEOUT');
    } catch (error) {
      lastError = error;
      if (isDecibelHTTP429V1(error)) throw error;
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number(error.status)
          : null;
      if (status === 401 || status === 403 || attempt === 2) throw error;
      await wait(250 * 2 ** attempt);
    }
  }
  throw lastError;
}

export function loadLastKnownGoodEconomicInputsV1(
  environment: NodeJS.ProcessEnv,
): last_known_good_economic_inputs_v1 | null {
  const configured =
    environment.DECIBEL_PRODUCTION_ECONOMIC_LAST_KNOWN_GOOD_PATH?.trim() ||
    environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH?.trim() ||
    'data/decibel_production_economic_inputs_v1.json';
  const path = resolve(configured);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as last_known_good_economic_inputs_v1;
  } catch {
    return null;
  }
}

type apt_usd_evidence_v1 = Readonly<{ aptUsd: number; observedAt: number; source?: string }>;

export type apt_usd_resolution_v1 = Readonly<{
  aptUsd: number | null;
  observedAt: number | null;
  source: string;
  diagnostic: string;
  ageMs: number | null;
  maximumAgeMs: number;
}>;

export async function resolveAptUsdEvidenceChainV1(
  input: Readonly<{
    now: number;
    maximumAgeMs: number;
    readDecibelPrimary: () => Promise<apt_usd_evidence_v1 | null>;
    readDecibelFallback: () => Promise<apt_usd_evidence_v1 | null>;
    readExternalFallback: () => Promise<apt_usd_evidence_v1 | null>;
    readExternalSecondary?: () => Promise<apt_usd_evidence_v1 | null>;
    lastKnownGood: last_known_good_economic_inputs_v1 | null;
    onDecibelRateLimit?: () => void;
    sourceTimeoutMs?: number;
  }>,
): Promise<apt_usd_resolution_v1> {
  const diagnostics: string[] = [];
  const Sources = [
    {
      name: 'DECIBEL_REST_APT_USD_MARKET_PRICE',
      read: input.readDecibelPrimary,
      decibel: true,
    },
    {
      name: 'DECIBEL_REST_ALL_MARKETS_APT_USD_PRICE',
      read: input.readDecibelFallback,
      decibel: true,
    },
    {
      name: 'COINBASE_EXCHANGE_APT_USD_TICKER',
      read: input.readExternalFallback,
      decibel: false,
    },
    {
      name: 'COINGECKO_APT_USD_SIMPLE_PRICE',
      read: input.readExternalSecondary ?? (() => Promise.resolve(null)),
      decibel: false,
    },
  ] as const;
  for (const Source of Sources) {
    try {
      const evidence = await runEconomicSourceWithTimeout(
        Source.read,
        input.sourceTimeoutMs ?? 5_000,
        `${Source.name}:TIMEOUT`,
      );
      if (
        evidence !== null &&
        Number.isFinite(evidence.aptUsd) &&
        evidence.aptUsd > 0 &&
        isFresh(evidence.observedAt, input.now, input.maximumAgeMs)
      )
        return Object.freeze({
          aptUsd: evidence.aptUsd,
          observedAt: evidence.observedAt,
          source: evidence.source ?? Source.name,
          diagnostic: `${evidence.source ?? Source.name}:READY`,
          ageMs: input.now - evidence.observedAt,
          maximumAgeMs: input.maximumAgeMs,
        });
      diagnostics.push(`${Source.name}:INVALID_OR_STALE`);
    } catch (error) {
      if (Source.decibel && isDecibelHTTP429V1(error)) input.onDecibelRateLimit?.();
      diagnostics.push(
        `${Source.name}:${error instanceof Error ? error.message : 'UNKNOWN_READ_ERROR'}`,
      );
    }
  }
  const priorObservedAt =
    input.lastKnownGood?.aptUsdObservedAt ??
    input.lastKnownGood?.gasCostObservedAt ??
    input.lastKnownGood?.observedAt;
  if (
    typeof input.lastKnownGood?.aptUsd === 'number' &&
    Number.isFinite(input.lastKnownGood.aptUsd) &&
    input.lastKnownGood.aptUsd > 0 &&
    isFresh(priorObservedAt, input.now, input.maximumAgeMs)
  )
    return Object.freeze({
      aptUsd: input.lastKnownGood.aptUsd,
      observedAt: priorObservedAt ?? null,
      source: input.lastKnownGood.aptUsdSource ?? 'LAST_KNOWN_GOOD',
      diagnostic: 'LAST_KNOWN_GOOD_STILL_FRESH',
      ageMs: priorObservedAt === undefined ? null : input.now - priorObservedAt,
      maximumAgeMs: input.maximumAgeMs,
    });
  diagnostics.push(
    priorObservedAt === undefined
      ? 'LAST_KNOWN_GOOD:MISSING'
      : `LAST_KNOWN_GOOD:EXPIRED:AGE_MS=${input.now - priorObservedAt}`,
  );
  return Object.freeze({
    aptUsd: null,
    observedAt: null,
    source: 'UNKNOWN',
    diagnostic: diagnostics.join(';'),
    ageMs: null,
    maximumAgeMs: input.maximumAgeMs,
  });
}

export function resolveCoinbaseAptUsdEvidenceV1(
  payload: Readonly<Record<string, unknown>>,
  now: number,
  maximumAgeMs: number,
): Readonly<{ aptUsd: number; observedAt: number }> | null {
  const rawPrice = payload.price;
  const aptUsd =
    typeof rawPrice === 'string' && /^\d+(?:\.\d+)?$/.test(rawPrice)
      ? Number(rawPrice)
      : typeof rawPrice === 'number'
        ? rawPrice
        : null;
  const rawTime = payload.time;
  const sourceTimestamp = typeof rawTime === 'string' ? Date.parse(rawTime) : Number.NaN;
  const observedAt = normalizeFreshSourceTimestamp(sourceTimestamp, now, maximumAgeMs);
  if (aptUsd === null || !Number.isFinite(aptUsd) || aptUsd <= 0 || observedAt === null)
    return null;
  return Object.freeze({ aptUsd, observedAt });
}

export function resolveCoinGeckoAptUsdEvidenceV1(
  payload: Readonly<Record<string, unknown>>,
  now: number,
  maximumAgeMs: number,
): Readonly<{ aptUsd: number; observedAt: number }> | null {
  const aptos = payload.aptos;
  if (typeof aptos !== 'object' || aptos === null) return null;
  const record = aptos as Readonly<Record<string, unknown>>;
  const aptUsd = typeof record.usd === 'number' ? record.usd : null;
  const sourceSeconds =
    typeof record.last_updated_at === 'number' ? record.last_updated_at : Number.NaN;
  const observedAt = normalizeFreshSourceTimestamp(sourceSeconds * 1_000, now, maximumAgeMs);
  if (aptUsd === null || !Number.isFinite(aptUsd) || aptUsd <= 0 || observedAt === null)
    return null;
  return Object.freeze({ aptUsd, observedAt });
}

function isFresh(timestamp: number | undefined, now: number, maximumAgeMs: number): boolean {
  return (
    timestamp !== undefined &&
    Number.isSafeInteger(timestamp) &&
    timestamp <= now &&
    now - timestamp <= maximumAgeMs
  );
}

const MAXIMUM_ECONOMIC_SOURCE_CLOCK_SKEW_MS = 60_000;

function normalizeFreshSourceTimestamp(
  timestamp: number,
  now: number,
  maximumAgeMs: number,
): number | null {
  if (!Number.isSafeInteger(timestamp)) return null;
  if (timestamp > now) return timestamp - now <= MAXIMUM_ECONOMIC_SOURCE_CLOCK_SKEW_MS ? now : null;
  return isFresh(timestamp, now, maximumAgeMs) ? timestamp : null;
}

type authenticated_trade_fee_v1 = Readonly<{
  client_order_id?: string;
  fee_amount: number;
  is_rebate: boolean;
  price: number;
  size: number;
  transaction_unix_ms: number;
}>;

export function deriveAuthenticatedMakerFeeEvidenceV1(
  trades: readonly authenticated_trade_fee_v1[],
  now: number,
  maximumAgeMs: number,
): Readonly<{ makerFeeBps: number; observedAt: number; sampleCount: number }> | null {
  const samples = trades.flatMap((trade) => {
    const clientOrderId = trade.client_order_id ?? '';
    const isStrategyMakerFill = /^(?:d1[bs]|dpvr1-[bs]-)/.test(clientOrderId);
    const notional = Math.abs(trade.price * trade.size);
    if (
      !isStrategyMakerFill ||
      trade.is_rebate ||
      !isFresh(trade.transaction_unix_ms, now, maximumAgeMs) ||
      !Number.isFinite(notional) ||
      notional <= 0 ||
      !Number.isFinite(trade.fee_amount) ||
      trade.fee_amount < 0
    )
      return [];
    return [
      Object.freeze({
        feeBps: (trade.fee_amount / notional) * 10_000,
        observedAt: trade.transaction_unix_ms,
      }),
    ];
  });
  const makerFeeBps = percentile(
    samples.map((sample) => sample.feeBps),
    0.95,
  );
  if (makerFeeBps === null || !Number.isFinite(makerFeeBps) || makerFeeBps < 0) return null;
  return Object.freeze({
    makerFeeBps: Number(makerFeeBps.toFixed(12)),
    observedAt: Math.max(...samples.map((sample) => sample.observedAt)),
    sampleCount: samples.length,
  });
}

export function resolveAptUsdFromAllMarketPricesV1(
  markets: readonly Readonly<Record<string, unknown>>[],
  prices: readonly Readonly<Record<string, unknown>>[],
  now: number,
  maximumAgeMs: number,
): Readonly<{ aptUsd: number; observedAt: number }> | null {
  const aptMarket = markets.find((market) =>
    ['APT/USD', 'APT-USD'].includes(
      (getString(market, ['market_name', 'marketName']) ?? '').toUpperCase(),
    ),
  );
  const marketAddress =
    aptMarket === undefined
      ? ''
      : (getString(aptMarket, ['market_addr', 'marketAddress']) ?? '').toLowerCase();
  if (!marketAddress) return null;
  const price = prices.find(
    (candidate) =>
      (getString(candidate, ['market', 'market_addr']) ?? '').toLowerCase() === marketAddress,
  );
  if (price === undefined) return null;
  const aptUsd = getNumber(price, ['mid_px', 'mark_px', 'oracle_px']);
  const sourceTimestamp = getNumber(price, ['transaction_unix_ms', 'observedAt']);
  const observedAt =
    sourceTimestamp === null
      ? null
      : normalizeFreshSourceTimestamp(sourceTimestamp, now, maximumAgeMs);
  if (aptUsd === null || aptUsd <= 0 || observedAt === null || observedAt === null) return null;
  return Object.freeze({ aptUsd, observedAt });
}

export function resolveDecibelHistoricalGasEvidenceV1(
  freshGasApt: readonly number[],
  persisted: Readonly<{
    observedGasTxCount?: number;
    medianGasApt?: number;
    p95GasApt?: number;
  }> | null,
): Readonly<{
  observedGasTxCount: number;
  medianGasApt: number | null;
  p95GasApt: number | null;
  reused: boolean;
}> {
  const freshMedian = percentile(freshGasApt, 0.5);
  const freshP95 = percentile(freshGasApt, 0.95);
  const persistedP95 =
    typeof persisted?.p95GasApt === 'number' &&
    Number.isFinite(persisted.p95GasApt) &&
    persisted.p95GasApt > 0
      ? persisted.p95GasApt
      : null;
  const persistedMedian =
    typeof persisted?.medianGasApt === 'number' &&
    Number.isFinite(persisted.medianGasApt) &&
    persisted.medianGasApt > 0
      ? persisted.medianGasApt
      : null;
  return Object.freeze({
    observedGasTxCount:
      freshGasApt.length > 0 ? freshGasApt.length : (persisted?.observedGasTxCount ?? 0),
    medianGasApt: freshMedian ?? persistedMedian,
    p95GasApt: freshP95 ?? persistedP95,
    reused: freshP95 === null && persistedP95 !== null,
  });
}

export async function runDecibelProductionEconomicInputsAuditV1(
  environment: NodeJS.ProcessEnv,
): Promise<Readonly<Record<string, unknown>>> {
  const subaccount = environment.DECIBEL_SUBACCOUNT_ADDRESS?.trim();
  const apiKey = environment.DECIBEL_NODE_API_KEY?.trim();
  if (!subaccount) throw new Error('ECONOMIC_AUDIT_SUBACCOUNT_REQUIRED');
  const observedAt = Date.now();
  const maximumAgeMs = Number(
    environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS ?? 3_600_000,
  );
  if (!Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0)
    throw new Error('ECONOMIC_AUDIT_MAXIMUM_AGE_INVALID');
  const lastKnownGood = loadLastKnownGoodEconomicInputsV1(environment);
  const { DecibelReadDex, MAINNET_CONFIG } = await loadDecibelSdkRuntimeV1();
  const Reader = new DecibelReadDex(MAINNET_CONFIG, apiKey ? { nodeApiKey: apiKey } : undefined);
  let makerFeeBps: number | null = null;
  let makerFeeObservedAt: number | null = null;
  let makerFeeSource = 'UNKNOWN';
  let makerFeeDiagnostic = 'NO_MATCHING_AUTHORITATIVE_FIELD';
  const makerFeeSources = [
    'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
    'DECIBEL_AUTHENTICATED_STRATEGY_MAKER_FILL_HISTORY',
    'LAST_KNOWN_GOOD_IF_FRESH',
  ] as const;
  const lastKnownGoodMakerFeeObservedAt =
    lastKnownGood?.makerFeeObservedAt ?? lastKnownGood?.observedAt;
  if (
    typeof lastKnownGood?.makerFeeBps === 'number' &&
    Number.isFinite(lastKnownGood.makerFeeBps) &&
    lastKnownGood.makerFeeBps >= 0 &&
    isFresh(lastKnownGoodMakerFeeObservedAt, observedAt, maximumAgeMs)
  ) {
    makerFeeBps = lastKnownGood.makerFeeBps;
    makerFeeObservedAt = lastKnownGoodMakerFeeObservedAt ?? null;
    makerFeeSource = lastKnownGood.makerFeeSource ?? 'UNKNOWN';
    makerFeeDiagnostic = 'FRESH_COMPONENT_PRESERVED_WITHOUT_NETWORK_REFRESH';
  }
  if (makerFeeBps === null) {
    try {
      assertDecibelHTTPReadAllowedV1();
      const url = new URL(`${MAINNET_CONFIG.tradingHttpUrl}/api/v1/user_fee_rates`);
      url.searchParams.set('account', subaccount);
      const response = await readWithBoundedBackoff(async () => {
        const result = await fetch(url, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        });
        if (!result.ok)
          throw Object.assign(new Error(`HTTP_${result.status}`), { status: result.status });
        return result;
      });
      const body = (await response.json()) as unknown;
      const row = (Array.isArray(body) ? body[0] : body) as Record<string, unknown> | undefined;
      if (row !== undefined) {
        makerFeeDiagnostic = `FIELDS:${Object.keys(row).sort().join(',')}`;
        const explicitBps = getNumber(row, ['maker_fee_bps', 'makerFeeBps']);
        const rate = getNumber(row, [
          'user_maker_rate',
          'maker_fee_rate',
          'makerFeeRate',
          'maker_rate',
        ]);
        makerFeeBps = explicitBps ?? (rate === null ? null : rate * 10_000);
        if (makerFeeBps !== null) {
          makerFeeSource = 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES';
          makerFeeObservedAt = observedAt;
        }
      }
    } catch (error) {
      if (isDecibelHTTP429V1(error))
        enterDecibelHTTPReadBackoffV1(
          Number(environment.DECIBEL_PRODUCTION_RATE_LIMIT_BACKOFF_MS ?? 30_000),
        );
      makerFeeBps = null;
      makerFeeDiagnostic = error instanceof Error ? error.message : 'UNKNOWN_FEE_READ_ERROR';
    }
  }
  if (makerFeeBps === null) {
    try {
      assertDecibelHTTPReadAllowedV1();
      const trades = await readWithBoundedBackoff(() =>
        Reader.userTradeHistory.getByAddr({ subAddr: subaccount, limit: 100 }),
      );
      const evidence = deriveAuthenticatedMakerFeeEvidenceV1(
        trades.items as readonly authenticated_trade_fee_v1[],
        observedAt,
        maximumAgeMs,
      );
      if (evidence !== null) {
        makerFeeBps = evidence.makerFeeBps;
        makerFeeObservedAt = evidence.observedAt;
        makerFeeSource = 'DECIBEL_AUTHENTICATED_STRATEGY_MAKER_FILL_HISTORY';
        makerFeeDiagnostic = `AUTHENTICATED_MAKER_FILL_SAMPLES:${evidence.sampleCount}`;
      } else {
        makerFeeDiagnostic = `${makerFeeDiagnostic};ALTERNATE_FILL_EVIDENCE_UNAVAILABLE`;
      }
    } catch (error) {
      if (isDecibelHTTP429V1(error))
        enterDecibelHTTPReadBackoffV1(
          Number(environment.DECIBEL_PRODUCTION_RATE_LIMIT_BACKOFF_MS ?? 30_000),
        );
      const alternateDiagnostic =
        error instanceof Error ? error.message : 'UNKNOWN_ALTERNATE_FEE_READ_ERROR';
      makerFeeDiagnostic = `${makerFeeDiagnostic};ALTERNATE:${alternateDiagnostic}`;
    }
  }
  if (
    makerFeeBps === null &&
    lastKnownGood !== null &&
    typeof lastKnownGood.makerFeeBps === 'number' &&
    Number.isFinite(lastKnownGood.makerFeeBps) &&
    lastKnownGood.makerFeeBps >= 0 &&
    isFresh(lastKnownGood.makerFeeObservedAt ?? lastKnownGood.observedAt, observedAt, maximumAgeMs)
  ) {
    makerFeeBps = lastKnownGood.makerFeeBps;
    makerFeeObservedAt = lastKnownGood.makerFeeObservedAt ?? lastKnownGood.observedAt ?? null;
    makerFeeSource = lastKnownGood.makerFeeSource ?? 'UNKNOWN';
    makerFeeDiagnostic = 'LAST_KNOWN_GOOD_STILL_FRESH';
  }

  const journalPath = resolve(
    environment.DECIBEL_EXECUTION_JOURNAL_PATH ?? 'data/decibel_execution_v1.sqlite',
  );
  let rows: Array<{ outcomeJson: string }> = [];
  let gasJournalDiagnostic = 'READY';
  try {
    const DatabaseReader = new Database(journalPath, { readonly: true, fileMustExist: true });
    try {
      rows = DatabaseReader.prepare(
        'SELECT outcome_json outcomeJson FROM executor_outcomes',
      ).all() as Array<{ outcomeJson: string }>;
    } finally {
      DatabaseReader.close();
    }
  } catch (error) {
    gasJournalDiagnostic =
      error instanceof Error ? `JOURNAL:${error.message}` : 'JOURNAL:UNKNOWN_READ_ERROR';
  }
  const transactionHashes = [
    ...new Set(
      rows.flatMap((row) => {
        const outcome = JSON.parse(row.outcomeJson) as Record<string, unknown>;
        return typeof outcome.transactionHash === 'string' ? [outcome.transactionHash] : [];
      }),
    ),
  ];
  const persistedGasIsFresh =
    typeof lastKnownGood?.p95GasApt === 'number' &&
    lastKnownGood.p95GasApt > 0 &&
    isFresh(lastKnownGood.gasCostObservedAt ?? lastKnownGood.observedAt, observedAt, maximumAgeMs);
  const AptosClient = new Aptos(
    new AptosConfig({
      network: MAINNET_CONFIG.network,
      fullnode: MAINNET_CONFIG.fullnodeUrl,
      client: createDecibelBoundedFetchClientV1({
        timeoutMs: Number(environment.DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS ?? 10_000),
      }),
      ...(apiKey ? { clientConfig: { API_KEY: apiKey } } : {}),
    }),
  );
  const gasApt: number[] = [];
  for (const transactionHash of persistedGasIsFresh ? [] : transactionHashes.slice(-20)) {
    try {
      assertDecibelHTTPReadAllowedV1();
      const transaction = await AptosClient.getTransactionByHash({ transactionHash });
      if (
        String(transaction.type) === 'user_transaction' &&
        'success' in transaction &&
        'gas_used' in transaction &&
        'gas_unit_price' in transaction &&
        transaction.success &&
        typeof transaction.gas_used === 'string' &&
        typeof transaction.gas_unit_price === 'string'
      )
        gasApt.push(
          (Number(transaction.gas_used) * Number(transaction.gas_unit_price)) / 100_000_000,
        );
    } catch {
      // Missing transaction evidence remains excluded rather than inferred.
    }
  }
  const aptUsdSources = [
    'DECIBEL_REST_APT_USD_MARKET_PRICE',
    'DECIBEL_REST_ALL_MARKETS_APT_USD_PRICE',
    'COINBASE_EXCHANGE_APT_USD_TICKER',
    'COINGECKO_APT_USD_SIMPLE_PRICE',
    'LAST_KNOWN_GOOD_IF_FRESH',
  ] as const;
  const lastKnownGoodAptUsdObservedAt =
    lastKnownGood?.aptUsdObservedAt ??
    lastKnownGood?.gasCostObservedAt ??
    lastKnownGood?.observedAt;
  const freshPersistedAptUsd =
    typeof lastKnownGood?.aptUsd === 'number' &&
    Number.isFinite(lastKnownGood.aptUsd) &&
    lastKnownGood.aptUsd > 0 &&
    isFresh(lastKnownGoodAptUsdObservedAt, observedAt, maximumAgeMs)
      ? Object.freeze({
          aptUsd: lastKnownGood.aptUsd,
          observedAt: lastKnownGoodAptUsdObservedAt ?? null,
          source: lastKnownGood.aptUsdSource ?? 'LAST_KNOWN_GOOD',
          diagnostic: 'FRESH_COMPONENT_PRESERVED_WITHOUT_NETWORK_REFRESH',
          ageMs:
            lastKnownGoodAptUsdObservedAt === undefined
              ? null
              : observedAt - lastKnownGoodAptUsdObservedAt,
          maximumAgeMs,
        })
      : null;
  const aptUsdResolution =
    freshPersistedAptUsd ??
    (await resolveAptUsdEvidenceChainV1({
      now: observedAt,
      maximumAgeMs,
      lastKnownGood,
      onDecibelRateLimit: () =>
        void enterDecibelHTTPReadBackoffV1(
          Number(environment.DECIBEL_PRODUCTION_RATE_LIMIT_BACKOFF_MS ?? 30_000),
        ),
      readDecibelPrimary: async () => {
        assertDecibelHTTPReadAllowedV1();
        const prices = await readWithBoundedBackoff(() =>
          Reader.marketPrices.getByName({ marketName: 'APT/USD' }),
        );
        const price = prices[0] as unknown as Record<string, unknown> | undefined;
        if (price === undefined) throw new Error('APT_USD_PRICE_UNAVAILABLE');
        const priceValue = getNumber(price, ['mid_px', 'mark_px', 'oracle_px']);
        const sourceTimestamp = getNumber(price, ['transaction_unix_ms', 'observedAt']);
        const sourceObservedAt =
          sourceTimestamp === null
            ? null
            : normalizeFreshSourceTimestamp(sourceTimestamp, observedAt, maximumAgeMs);
        return priceValue === null || sourceObservedAt === null
          ? null
          : Object.freeze({ aptUsd: priceValue, observedAt: sourceObservedAt });
      },
      readDecibelFallback: async () => {
        assertDecibelHTTPReadAllowedV1();
        const [markets, prices] = await Promise.all([
          readWithBoundedBackoff(() => Reader.markets.getAll()),
          readWithBoundedBackoff(() => Reader.marketPrices.getAll()),
        ]);
        return resolveAptUsdFromAllMarketPricesV1(markets, prices, observedAt, maximumAgeMs);
      },
      readExternalFallback: async () => {
        const response = await readWithBoundedBackoff(async () => {
          const result = await fetch('https://api.exchange.coinbase.com/products/APT-USD/ticker');
          if (!result.ok)
            throw Object.assign(new Error(`HTTP_${result.status}`), { status: result.status });
          return result;
        });
        const payload = (await response.json()) as Readonly<Record<string, unknown>>;
        return resolveCoinbaseAptUsdEvidenceV1(payload, observedAt, maximumAgeMs);
      },
      readExternalSecondary: async () => {
        const response = await readWithBoundedBackoff(async () => {
          const result = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=aptos&vs_currencies=usd&include_last_updated_at=true',
          );
          if (!result.ok)
            throw Object.assign(new Error(`HTTP_${result.status}`), { status: result.status });
          return result;
        });
        const payload = (await response.json()) as Readonly<Record<string, unknown>>;
        return resolveCoinGeckoAptUsdEvidenceV1(payload, observedAt, maximumAgeMs);
      },
    }));
  const aptUsd = aptUsdResolution.aptUsd;
  const aptUsdObservedAt = aptUsdResolution.observedAt;
  const aptUsdSource = aptUsdResolution.source;
  const aptUsdDiagnostic = aptUsdResolution.diagnostic;
  const gasEvidence = resolveDecibelHistoricalGasEvidenceV1(gasApt, lastKnownGood);
  const { p95GasApt, medianGasApt, observedGasTxCount } = gasEvidence;
  const gasEvidenceReused = gasEvidence.reused;
  const result = Object.freeze({
    observedAt,
    makerFeeBps,
    makerFeeSources,
    makerFeeSource,
    makerFeeDiagnostic,
    makerFeeObservedAt,
    observedGasTxCount,
    medianGasApt,
    p95GasApt,
    gasEvidenceReused,
    gasJournalDiagnostic,
    aptUsd,
    aptUsdSources,
    aptUsdObservedAt,
    aptUsdSource,
    aptUsdDiagnostic,
    aptUsdAgeMs: aptUsdResolution.ageMs,
    aptUsdMaximumAgeMs: aptUsdResolution.maximumAgeMs,
    conservativeGasCostUsd: p95GasApt === null || aptUsd === null ? null : p95GasApt * aptUsd,
  });
  if (
    makerFeeBps !== null &&
    makerFeeObservedAt !== null &&
    p95GasApt !== null &&
    aptUsd !== null &&
    aptUsdObservedAt !== null &&
    result.conservativeGasCostUsd !== null
  )
    writeFileSync(
      resolve(
        environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH ??
          'data/decibel_production_economic_inputs_v1.json',
      ),
      `${JSON.stringify(
        {
          observedAt,
          makerFeeObservedAt,
          makerFeeBps: Number(makerFeeBps.toFixed(12)),
          makerFeeSource,
          conservativeGasCostUsd: result.conservativeGasCostUsd,
          gasCostObservedAt: observedAt,
          gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
          observedGasTxCount,
          medianGasApt,
          p95GasApt,
          aptUsd,
          aptUsdObservedAt,
          aptUsdSource,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runDecibelProductionEconomicInputsAuditV1(process.env)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error: unknown) => {
      console.error(
        `DECIBEL_PRODUCTION_ECONOMIC_INPUTS_AUDIT=FAIL BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`,
      );
      process.exitCode = 1;
    });
}
