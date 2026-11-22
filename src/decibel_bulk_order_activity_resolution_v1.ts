export const DECIBEL_BULK_ORDER_ACTIVITY_RESOLUTION_V1 =
  'DECIBEL_BULK_ORDER_ACTIVITY_RESOLUTION_V1' as const;

export type decibel_bulk_order_activity_classification_v1 =
  | 'NO_BULK_ORDER_RECORD'
  | 'BULK_ORDER_RECORD_INACTIVE'
  | 'BULK_ORDER_ACTIVE_EXPOSURE'
  | 'BULK_ORDER_RECORD_MALFORMED'
  | 'BULK_ORDER_READ_FAILED';

export type decibel_bulk_order_record_v1 = Readonly<{
  user?: string;
  market: string;
  sequence_number: number;
  previous_seq_num: number;
  transaction_version?: number;
  transaction_unix_ms?: number;
  bid_prices: readonly number[];
  bid_sizes: readonly (number | string)[];
  ask_prices: readonly number[];
  ask_sizes: readonly (number | string)[];
  cancelled_bid_prices: readonly number[];
  cancelled_bid_sizes: readonly (number | string)[];
  cancelled_ask_prices: readonly number[];
  cancelled_ask_sizes: readonly (number | string)[];
}>;

type decimal = Readonly<{ coefficient: bigint; scale: number }>;

function parseDecimal(value: number | string): decimal {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('BULK_ORDER_SIZE_NONFINITE_INVALID');
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text))
    throw new Error('BULK_ORDER_SIZE_NONFINITE_INVALID');
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  return {
    coefficient: BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n),
    scale: fraction.length,
  };
}

function add(values: readonly decimal[]): decimal {
  const scale = values.reduce((maximum, value) => Math.max(maximum, value.scale), 0);
  return {
    coefficient: values.reduce(
      (sum, value) => sum + value.coefficient * 10n ** BigInt(scale - value.scale),
      0n,
    ),
    scale,
  };
}

function render(value: decimal): string {
  if (value.scale === 0) return value.coefficient.toString();
  const raw = value.coefficient.toString().padStart(value.scale + 1, '0');
  return `${raw.slice(0, -value.scale)}.${raw.slice(-value.scale)}`.replace(/\.?0+$/, '') || '0';
}

function positiveSum(values: readonly (number | string)[]): decimal {
  const parsed = values.map(parseDecimal);
  if (parsed.some((value) => value.coefficient < 0n))
    throw new Error('BULK_ORDER_SIZE_NEGATIVE_INVALID');
  return add(parsed.filter((value) => value.coefficient > 0n));
}

export type DecibelBulkOrderActivityResolutionV1 = Readonly<{
  recordCount: number;
  exactMarketRecordCount: number;
  otherMarketRecordCount: number;
  admittedRecords: readonly decibel_bulk_order_record_v1[];
  bidLevelCount: number;
  askLevelCount: number;
  currentBidSizes: readonly (number | string)[];
  currentAskSizes: readonly (number | string)[];
  activeBidSize: string;
  activeAskSize: string;
  activeBulkSize: string;
  classification: decibel_bulk_order_activity_classification_v1;
  bulkCheck: 'AVAILABLE_AND_CLEAR' | 'AVAILABLE_AND_NOT_CLEAR' | 'UNAVAILABLE';
  bulkOrderActivityClear: boolean;
  reason: string | null;
  liveExecutionEnabled: false;
}>;

export function resolveDecibelBulkOrderActivityV1(input: {
  configuredSubaccount: string;
  configuredMarket: string;
  records: readonly decibel_bulk_order_record_v1[];
  readSuccessful: boolean;
}): DecibelBulkOrderActivityResolutionV1 {
  const configuredMarket = normalizeDecibelMarketAddressV1(input.configuredMarket);
  const matchesConfiguredMarket = (record: decibel_bulk_order_record_v1): boolean =>
    normalizeDecibelMarketAddressV1(record.market) === configuredMarket;
  const base = {
    recordCount: input.records.length,
    exactMarketRecordCount: 0,
    otherMarketRecordCount: input.records.filter((record) => !matchesConfiguredMarket(record))
      .length,
    admittedRecords: Object.freeze([]) as readonly decibel_bulk_order_record_v1[],
    bidLevelCount: 0,
    askLevelCount: 0,
    currentBidSizes: Object.freeze([]) as readonly (number | string)[],
    currentAskSizes: Object.freeze([]) as readonly (number | string)[],
    activeBidSize: '0',
    activeAskSize: '0',
    activeBulkSize: '0',
    liveExecutionEnabled: false as const,
  };
  if (!input.readSuccessful)
    return Object.freeze({
      ...base,
      classification: 'BULK_ORDER_READ_FAILED',
      bulkCheck: 'UNAVAILABLE',
      bulkOrderActivityClear: false,
      reason: 'BULK_ORDER_READ_FAILED',
    });
  const admitted = input.records.filter(matchesConfiguredMarket);
  if (
    admitted.some(
      (record) => record.user !== undefined && record.user !== input.configuredSubaccount,
    )
  )
    return Object.freeze({
      ...base,
      exactMarketRecordCount: admitted.length,
      admittedRecords: Object.freeze(admitted),
      classification: 'BULK_ORDER_RECORD_MALFORMED',
      bulkCheck: 'UNAVAILABLE',
      bulkOrderActivityClear: false,
      reason: 'BULK_ORDER_ACCOUNT_IDENTITY_MISMATCH',
    });
  if (admitted.length === 0)
    return Object.freeze({
      ...base,
      classification: 'NO_BULK_ORDER_RECORD',
      bulkCheck: 'AVAILABLE_AND_CLEAR',
      bulkOrderActivityClear: true,
      reason: null,
    });
  const bidSizes = admitted.flatMap((record) => [...record.bid_sizes]);
  const askSizes = admitted.flatMap((record) => [...record.ask_sizes]);
  const malformedShape = admitted.some(
    (record) =>
      record.bid_prices.length !== record.bid_sizes.length ||
      record.ask_prices.length !== record.ask_sizes.length,
  );
  if (malformedShape)
    return Object.freeze({
      ...base,
      exactMarketRecordCount: admitted.length,
      admittedRecords: Object.freeze(admitted),
      currentBidSizes: Object.freeze(bidSizes),
      currentAskSizes: Object.freeze(askSizes),
      classification: 'BULK_ORDER_RECORD_MALFORMED',
      bulkCheck: 'UNAVAILABLE',
      bulkOrderActivityClear: false,
      reason: 'BULK_ORDER_PRICE_SIZE_LENGTH_MISMATCH',
    });
  try {
    const activeBid = positiveSum(bidSizes);
    const activeAsk = positiveSum(askSizes);
    const activeBulk = add([activeBid, activeAsk]);
    const active = activeBulk.coefficient > 0n;
    return Object.freeze({
      ...base,
      exactMarketRecordCount: admitted.length,
      admittedRecords: Object.freeze(admitted),
      bidLevelCount: bidSizes.length,
      askLevelCount: askSizes.length,
      currentBidSizes: Object.freeze(bidSizes),
      currentAskSizes: Object.freeze(askSizes),
      activeBidSize: render(activeBid),
      activeAskSize: render(activeAsk),
      activeBulkSize: render(activeBulk),
      classification: active ? 'BULK_ORDER_ACTIVE_EXPOSURE' : 'BULK_ORDER_RECORD_INACTIVE',
      bulkCheck: active ? 'AVAILABLE_AND_NOT_CLEAR' : 'AVAILABLE_AND_CLEAR',
      bulkOrderActivityClear: !active,
      reason: active ? 'ACTIVE_BULK_ORDER_MUST_BE_CLEARED_EXTERNALLY_BEFORE_CANARY' : null,
    });
  } catch (error) {
    return Object.freeze({
      ...base,
      exactMarketRecordCount: admitted.length,
      admittedRecords: Object.freeze(admitted),
      bidLevelCount: bidSizes.length,
      askLevelCount: askSizes.length,
      currentBidSizes: Object.freeze(bidSizes),
      currentAskSizes: Object.freeze(askSizes),
      classification: 'BULK_ORDER_RECORD_MALFORMED',
      bulkCheck: 'UNAVAILABLE',
      bulkOrderActivityClear: false,
      reason: error instanceof Error ? error.message : 'BULK_ORDER_RECORD_MALFORMED',
    });
  }
}
import { normalizeDecibelMarketAddressV1 } from './decibel_btc_market_activity_scope_v1.js';
