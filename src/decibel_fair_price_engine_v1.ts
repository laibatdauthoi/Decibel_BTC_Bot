import { createHash } from 'node:crypto';

import {
  DECIBEL_MARKET_MAKER_V1,
  type decibel_market_state_v1,
} from './decibel_market_state_v1.js';

export const DECIBEL_FAIR_PRICE_VERSION_V1 = 'DECIBEL_FAIR_PRICE_V1' as const;

export type decibel_fair_price_failure_code_v1 =
  | 'MARKET_STATE_UNUSABLE'
  | 'MIDPOINT_INVALID'
  | 'MICROPRICE_INVALID'
  | 'FAIR_MARK_DEVIATION_EXCEEDED'
  | 'FAIR_ORACLE_DEVIATION_EXCEEDED'
  | 'MARK_ORACLE_DEVIATION_EXCEEDED';

const FailureCodeOrder: readonly decibel_fair_price_failure_code_v1[] = [
  'MARKET_STATE_UNUSABLE',
  'MIDPOINT_INVALID',
  'MICROPRICE_INVALID',
  'FAIR_MARK_DEVIATION_EXCEEDED',
  'FAIR_ORACLE_DEVIATION_EXCEEDED',
  'MARK_ORACLE_DEVIATION_EXCEEDED',
] as const;

export type decibel_fair_price_configuration_v1 = Readonly<{
  micropriceWeight: number;
  maximumMicropriceAdjustmentBps: number;
  maximumFairToMarkDeviationBps: number;
  maximumFairToOracleDeviationBps: number;
  maximumMarkToOracleDeviationBps: number;
}>;

export type decibel_fair_price_assessment_v1 = Readonly<{
  strategyId: typeof DECIBEL_MARKET_MAKER_V1;
  fairPriceVersion: typeof DECIBEL_FAIR_PRICE_VERSION_V1;
  marketStateId: string;
  calculatedAt: Date;
  configurationId: string;
  usable: boolean;
  failureCodes: readonly decibel_fair_price_failure_code_v1[];
  midpoint: number | null;
  microprice: number | null;
  micropriceAdjustment: number | null;
  micropriceAdjustmentBps: number | null;
  fairPrice: number | null;
  markPrice: number | null;
  oraclePrice: number | null;
  fairToMarkBps: number | null;
  fairToOracleBps: number | null;
  markToOracleBps: number | null;
  bookExchangeTimestamp: Date | null;
  bookReceivedAt: Date | null;
  priceExchangeTimestamp: Date | null;
  priceReceivedAt: Date | null;
}>;

function validateConfiguration(configuration: decibel_fair_price_configuration_v1): void {
  const values = [
    configuration.micropriceWeight,
    configuration.maximumMicropriceAdjustmentBps,
    configuration.maximumFairToMarkDeviationBps,
    configuration.maximumFairToOracleDeviationBps,
    configuration.maximumMarkToOracleDeviationBps,
  ];
  if (
    values.some((value) => !Number.isFinite(value)) ||
    configuration.micropriceWeight < 0 ||
    configuration.micropriceWeight > 1 ||
    configuration.maximumMicropriceAdjustmentBps < 0 ||
    configuration.maximumFairToMarkDeviationBps < 0 ||
    configuration.maximumFairToOracleDeviationBps < 0 ||
    configuration.maximumMarkToOracleDeviationBps < 0
  )
    throw new Error('DECIBEL_FAIR_PRICE_INVALID_CONFIGURATION');
}

function stableConfiguration(configuration: decibel_fair_price_configuration_v1): string {
  return JSON.stringify([
    configuration.micropriceWeight,
    configuration.maximumMicropriceAdjustmentBps,
    configuration.maximumFairToMarkDeviationBps,
    configuration.maximumFairToOracleDeviationBps,
    configuration.maximumMarkToOracleDeviationBps,
  ]);
}

function calculateBps(value: number, reference: number): number {
  return ((value - reference) / reference) * 10_000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function freezeAssessment(
  value: decibel_fair_price_assessment_v1,
): decibel_fair_price_assessment_v1 {
  Object.freeze(value.failureCodes);
  return Object.freeze(value);
}

function createUnavailableAssessment(
  marketState: decibel_market_state_v1,
  configurationId: string,
): decibel_fair_price_assessment_v1 {
  return freezeAssessment({
    strategyId: DECIBEL_MARKET_MAKER_V1,
    fairPriceVersion: DECIBEL_FAIR_PRICE_VERSION_V1,
    marketStateId: marketState.stateId,
    calculatedAt: new Date(marketState.constructedAt.getTime()),
    configurationId,
    usable: false,
    failureCodes: ['MARKET_STATE_UNUSABLE'],
    midpoint: null,
    microprice: null,
    micropriceAdjustment: null,
    micropriceAdjustmentBps: null,
    fairPrice: null,
    markPrice: null,
    oraclePrice: null,
    fairToMarkBps: null,
    fairToOracleBps: null,
    markToOracleBps: null,
    bookExchangeTimestamp: null,
    bookReceivedAt: null,
    priceExchangeTimestamp: null,
    priceReceivedAt: null,
  });
}

export function calculateDecibelFairPriceV1(
  marketState: decibel_market_state_v1,
  configuration: decibel_fair_price_configuration_v1,
): decibel_fair_price_assessment_v1 {
  validateConfiguration(configuration);
  const configurationId = `decibel_fair_price_configuration_${createHash('sha256')
    .update(stableConfiguration(configuration))
    .digest('hex')}`;
  if (!marketState.usable) return createUnavailableAssessment(marketState, configurationId);

  const failures = new Set<decibel_fair_price_failure_code_v1>();
  const book = marketState.book;
  const prices = marketState.prices;
  const midpoint = book?.midpoint ?? null;
  if (midpoint === null || !Number.isFinite(midpoint) || midpoint <= 0)
    failures.add('MIDPOINT_INVALID');

  const rawMicroprice: unknown = book?.microprice;
  const micropriceMissing = rawMicroprice === undefined || rawMicroprice === null;
  const micropriceValid =
    typeof rawMicroprice === 'number' &&
    Number.isFinite(rawMicroprice) &&
    rawMicroprice > 0 &&
    book !== null &&
    rawMicroprice >= book.bestBid &&
    rawMicroprice <= book.bestAsk;
  if (!micropriceMissing && !micropriceValid) failures.add('MICROPRICE_INVALID');
  const microprice = micropriceValid ? rawMicroprice : null;

  let micropriceAdjustment: number | null = null;
  let micropriceAdjustmentBps: number | null = null;
  let fairPrice: number | null = null;
  if (midpoint !== null && Number.isFinite(midpoint) && midpoint > 0) {
    const maximumAdjustment = (midpoint * configuration.maximumMicropriceAdjustmentBps) / 10_000;
    const boundedDelta =
      microprice === null ? 0 : clamp(microprice - midpoint, -maximumAdjustment, maximumAdjustment);
    micropriceAdjustment = configuration.micropriceWeight * boundedDelta;
    micropriceAdjustmentBps = (micropriceAdjustment / midpoint) * 10_000;
    fairPrice = midpoint + micropriceAdjustment;
  }

  const markPrice = prices?.markPrice ?? null;
  const oraclePrice = prices?.oraclePrice ?? null;
  const fairToMarkBps =
    fairPrice === null || markPrice === null || !Number.isFinite(markPrice) || markPrice <= 0
      ? null
      : calculateBps(fairPrice, markPrice);
  const fairToOracleBps =
    fairPrice === null || oraclePrice === null || !Number.isFinite(oraclePrice) || oraclePrice <= 0
      ? null
      : calculateBps(fairPrice, oraclePrice);
  const markToOracleBps =
    markPrice === null ||
    oraclePrice === null ||
    !Number.isFinite(markPrice) ||
    !Number.isFinite(oraclePrice) ||
    markPrice <= 0 ||
    oraclePrice <= 0
      ? null
      : calculateBps(markPrice, oraclePrice);

  if (
    fairToMarkBps !== null &&
    Math.abs(fairToMarkBps) > configuration.maximumFairToMarkDeviationBps
  )
    failures.add('FAIR_MARK_DEVIATION_EXCEEDED');
  if (
    fairToOracleBps !== null &&
    Math.abs(fairToOracleBps) > configuration.maximumFairToOracleDeviationBps
  )
    failures.add('FAIR_ORACLE_DEVIATION_EXCEEDED');
  if (
    markToOracleBps !== null &&
    Math.abs(markToOracleBps) > configuration.maximumMarkToOracleDeviationBps
  )
    failures.add('MARK_ORACLE_DEVIATION_EXCEEDED');

  const failureCodes = FailureCodeOrder.filter((code) => failures.has(code));
  return freezeAssessment({
    strategyId: DECIBEL_MARKET_MAKER_V1,
    fairPriceVersion: DECIBEL_FAIR_PRICE_VERSION_V1,
    marketStateId: marketState.stateId,
    calculatedAt: new Date(marketState.constructedAt.getTime()),
    configurationId,
    usable: failureCodes.length === 0,
    failureCodes,
    midpoint,
    microprice,
    micropriceAdjustment,
    micropriceAdjustmentBps,
    fairPrice,
    markPrice,
    oraclePrice,
    fairToMarkBps,
    fairToOracleBps,
    markToOracleBps,
    bookExchangeTimestamp: book === null ? null : new Date(book.exchangeTimestamp.getTime()),
    bookReceivedAt: book === null ? null : new Date(book.receivedAt.getTime()),
    priceExchangeTimestamp: prices === null ? null : new Date(prices.exchangeTimestamp.getTime()),
    priceReceivedAt: prices === null ? null : new Date(prices.receivedAt.getTime()),
  });
}
