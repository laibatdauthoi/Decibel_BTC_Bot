import { createHash } from 'node:crypto';

import {
  DECIBEL_FAIR_PRICE_VERSION_V1,
  type decibel_fair_price_assessment_v1,
} from './decibel_fair_price_engine_v1.js';
import {
  DECIBEL_INVENTORY_CONTROLLER_VERSION_V1,
  type decibel_inventory_assessment_v1,
} from './decibel_inventory_controller_v1.js';
import {
  DECIBEL_MARKET_MAKER_V1,
  type decibel_market_state_v1,
} from './decibel_market_state_v1.js';

export const DECIBEL_QUOTE_ENGINE_VERSION_V1 = 'DECIBEL_QUOTE_ENGINE_V1' as const;

export type decibel_quote_engine_status_v1 = 'QUOTES_READY' | 'NO_QUOTES' | 'INPUT_UNUSABLE';
export type decibel_quote_side_v1 = 'BUY' | 'SELL';
export type decibel_quote_side_suppression_reason_v1 =
  | 'BID_INVENTORY_INCREASE_NOT_ALLOWED'
  | 'BID_BELOW_MINIMUM_SIZE'
  | 'BID_WOULD_TAKE_LIQUIDITY'
  | 'ASK_INVENTORY_INCREASE_NOT_ALLOWED'
  | 'ASK_BELOW_MINIMUM_SIZE'
  | 'ASK_WOULD_TAKE_LIQUIDITY';
export type decibel_quote_set_failure_reason_v1 =
  | 'MARKET_STATE_UNUSABLE'
  | 'FAIR_PRICE_UNUSABLE'
  | 'MARKET_STATE_ID_MISMATCH'
  | 'STRATEGY_ID_MISMATCH'
  | 'VERSION_MISMATCH'
  | 'INVENTORY_ASSESSMENT_INVALID'
  | 'MARKET_METADATA_INVALID'
  | 'RESERVATION_PRICE_INVALID'
  | 'INTERNAL_QUOTE_CROSS';

const SetFailureOrder: readonly decibel_quote_set_failure_reason_v1[] = [
  'MARKET_STATE_UNUSABLE',
  'FAIR_PRICE_UNUSABLE',
  'MARKET_STATE_ID_MISMATCH',
  'STRATEGY_ID_MISMATCH',
  'VERSION_MISMATCH',
  'INVENTORY_ASSESSMENT_INVALID',
  'MARKET_METADATA_INVALID',
  'RESERVATION_PRICE_INVALID',
  'INTERNAL_QUOTE_CROSS',
] as const;

export type decibel_quote_policy_configuration_v1 = Readonly<{
  baseHalfSpreadBps: number;
  baseOrderSizeBase: number;
}>;

export type decibel_quote_intent_v1 = Readonly<{
  intentId: string;
  strategyId: typeof DECIBEL_MARKET_MAKER_V1;
  quoteEngineVersion: typeof DECIBEL_QUOTE_ENGINE_VERSION_V1;
  quoteSetId: string;
  marketAddress: string;
  sourceMarketStateId: string;
  sourceFairPriceAssessmentId: string;
  sourceFairPriceConfigurationId: string;
  sourceInventoryAssessmentId: string;
  sourceInventoryConfigurationId: string;
  side: decibel_quote_side_v1;
  orderType: 'LIMIT';
  timeInForce: 'POST_ONLY';
  price: number;
  quantity: number;
  rawPrice: number;
  rawQuantity: number;
  reservationPrice: number;
  baseHalfSpreadBps: number;
  inventorySizeMultiplier: number;
}>;

export type decibel_quote_set_v1 = Readonly<{
  strategyId: typeof DECIBEL_MARKET_MAKER_V1;
  quoteEngineVersion: typeof DECIBEL_QUOTE_ENGINE_VERSION_V1;
  quoteSetId: string;
  configurationId: string;
  sourceMarketStateId: string;
  sourceFairPriceAssessmentId: string;
  sourceInventoryAssessmentId: string;
  status: decibel_quote_engine_status_v1;
  setFailureReasons: readonly decibel_quote_set_failure_reason_v1[];
  bidSuppressionReasons: readonly decibel_quote_side_suppression_reason_v1[];
  askSuppressionReasons: readonly decibel_quote_side_suppression_reason_v1[];
  reservationPrice: number | null;
  rawBidPrice: number | null;
  rawAskPrice: number | null;
  candidateBidPrice: number | null;
  candidateAskPrice: number | null;
  rawBidSize: number | null;
  rawAskSize: number | null;
  candidateBidSize: number | null;
  candidateAskSize: number | null;
  intents: readonly decibel_quote_intent_v1[];
}>;

type decimal_grid = Readonly<{ scale: number; incrementUnits: number }>;

function hashIdentity(prefix: string, values: readonly unknown[]): string {
  return `${prefix}_${createHash('sha256').update(JSON.stringify(values)).digest('hex')}`;
}

function validateConfiguration(configuration: decibel_quote_policy_configuration_v1): void {
  if (
    !Number.isFinite(configuration.baseHalfSpreadBps) ||
    configuration.baseHalfSpreadBps < 0 ||
    !Number.isFinite(configuration.baseOrderSizeBase) ||
    configuration.baseOrderSizeBase <= 0
  )
    throw new Error('DECIBEL_QUOTE_ENGINE_INVALID_CONFIGURATION');
}

function createGrid(increment: number, decimals: number): decimal_grid | null {
  if (
    !Number.isFinite(increment) ||
    increment <= 0 ||
    !Number.isSafeInteger(decimals) ||
    decimals < 0 ||
    decimals > 8
  )
    return null;
  const scale = 10 ** decimals;
  const incrementUnits = Math.round(increment * scale);
  if (
    !Number.isSafeInteger(scale) ||
    !Number.isSafeInteger(incrementUnits) ||
    incrementUnits <= 0 ||
    Math.abs(incrementUnits / scale - increment) > Number.EPSILON * Math.max(1, increment)
  )
    return null;
  return { scale, incrementUnits };
}

function directionalRound(value: number, grid: decimal_grid, direction: 'DOWN' | 'UP'): number {
  const scaled = value * grid.scale;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
  const increments =
    direction === 'DOWN'
      ? Math.floor((scaled + tolerance) / grid.incrementUnits)
      : Math.ceil((scaled - tolerance) / grid.incrementUnits);
  return (increments * grid.incrementUnits) / grid.scale;
}

function isValidInventory(value: decibel_inventory_assessment_v1): boolean {
  const numeric = [
    value.signedBaseInventory,
    value.neutralTargetBase,
    value.inventoryDeviation,
    value.rawInventoryPressure,
    value.inventoryPressure,
    value.absoluteInventoryPressure,
    value.inventoryPriceSkewBps,
    value.reservationPriceAdjustmentBps,
    value.increasingSideSizeMultiplier,
    value.bidSizeMultiplier,
    value.askSizeMultiplier,
    value.softInventoryLimitBase,
    value.hardInventoryLimitBase,
  ];
  return (
    numeric.every(Number.isFinite) &&
    value.inventoryPressure >= -1 &&
    value.inventoryPressure <= 1 &&
    value.bidSizeMultiplier >= 0 &&
    value.bidSizeMultiplier <= 1 &&
    value.askSizeMultiplier >= 0 &&
    value.askSizeMultiplier <= 1 &&
    value.softInventoryLimitBase > 0 &&
    value.hardInventoryLimitBase > value.softInventoryLimitBase
  );
}

function isValidFairPrice(value: decibel_fair_price_assessment_v1): boolean {
  const required = [
    value.midpoint,
    value.micropriceAdjustment,
    value.micropriceAdjustmentBps,
    value.fairPrice,
    value.markPrice,
    value.oraclePrice,
    value.fairToMarkBps,
    value.fairToOracleBps,
    value.markToOracleBps,
  ];
  return (
    value.usable &&
    required.every((number) => number !== null && Number.isFinite(number)) &&
    (value.microprice === null || Number.isFinite(value.microprice)) &&
    (value.fairPrice ?? 0) > 0
  );
}

function fairAssessmentId(value: decibel_fair_price_assessment_v1): string {
  return hashIdentity('decibel_fair_price_assessment', [
    value.marketStateId,
    value.configurationId,
    value.fairPrice,
    value.usable,
    value.failureCodes,
  ]);
}

function inventoryAssessmentId(value: decibel_inventory_assessment_v1): string {
  return hashIdentity('decibel_inventory_assessment', [
    value.configurationId,
    value.accountStateId,
    value.observedAt?.getTime() ?? null,
    value.signedBaseInventory,
    value.neutralTargetBase,
    value.inventoryDeviation,
    value.reservationPriceAdjustmentBps,
    value.bidSizeMultiplier,
    value.askSizeMultiplier,
    value.allowBidInventoryIncrease,
    value.allowAskInventoryIncrease,
  ]);
}

function freezeQuoteSet(value: decibel_quote_set_v1): decibel_quote_set_v1 {
  for (const intent of value.intents) Object.freeze(intent);
  Object.freeze(value.intents);
  Object.freeze(value.setFailureReasons);
  Object.freeze(value.bidSuppressionReasons);
  Object.freeze(value.askSuppressionReasons);
  return Object.freeze(value);
}

export function calculateDecibelQuoteIntentsV1(
  marketState: decibel_market_state_v1,
  fairPrice: decibel_fair_price_assessment_v1,
  inventory: decibel_inventory_assessment_v1,
  configuration: decibel_quote_policy_configuration_v1,
): decibel_quote_set_v1 {
  validateConfiguration(configuration);
  const configurationId = hashIdentity('decibel_quote_configuration', [
    configuration.baseHalfSpreadBps,
    configuration.baseOrderSizeBase,
  ]);
  const sourceFairPriceAssessmentId = fairAssessmentId(fairPrice);
  const sourceInventoryAssessmentId = inventoryAssessmentId(inventory);
  const failures = new Set<decibel_quote_set_failure_reason_v1>();
  if (!marketState.usable) failures.add('MARKET_STATE_UNUSABLE');
  if (!isValidFairPrice(fairPrice)) failures.add('FAIR_PRICE_UNUSABLE');
  if (fairPrice.marketStateId !== marketState.stateId) failures.add('MARKET_STATE_ID_MISMATCH');
  if (
    marketState.strategyId !== DECIBEL_MARKET_MAKER_V1 ||
    fairPrice.strategyId !== DECIBEL_MARKET_MAKER_V1 ||
    inventory.strategyId !== DECIBEL_MARKET_MAKER_V1
  )
    failures.add('STRATEGY_ID_MISMATCH');
  if (
    fairPrice.fairPriceVersion !== DECIBEL_FAIR_PRICE_VERSION_V1 ||
    inventory.controllerVersion !== DECIBEL_INVENTORY_CONTROLLER_VERSION_V1
  )
    failures.add('VERSION_MISMATCH');
  if (!isValidInventory(inventory)) failures.add('INVENTORY_ASSESSMENT_INVALID');
  const metadata = marketState.metadata;
  const book = marketState.book;
  const priceGrid =
    metadata === null ? null : createGrid(metadata.tickSize, metadata.priceDecimals);
  const sizeGrid = metadata === null ? null : createGrid(metadata.lotSize, metadata.sizeDecimals);
  if (
    metadata === null ||
    book === null ||
    priceGrid === null ||
    sizeGrid === null ||
    !Number.isFinite(metadata.minimumSize) ||
    metadata.minimumSize <= 0 ||
    !Number.isFinite(book.bestBid) ||
    !Number.isFinite(book.bestAsk) ||
    book.bestBid <= 0 ||
    book.bestAsk <= book.bestBid
  )
    failures.add('MARKET_METADATA_INVALID');

  let reservationPrice: number | null = null;
  if (fairPrice.fairPrice !== null && Number.isFinite(inventory.reservationPriceAdjustmentBps)) {
    reservationPrice = fairPrice.fairPrice * (1 + inventory.reservationPriceAdjustmentBps / 10_000);
    if (!Number.isFinite(reservationPrice) || reservationPrice <= 0) {
      reservationPrice = null;
      failures.add('RESERVATION_PRICE_INVALID');
    }
  }
  const quoteSetId = hashIdentity('decibel_quote_set', [
    marketState.stateId,
    sourceFairPriceAssessmentId,
    sourceInventoryAssessmentId,
    configurationId,
  ]);
  const orderedFailures = SetFailureOrder.filter((reason) => failures.has(reason));
  if (
    orderedFailures.length > 0 ||
    reservationPrice === null ||
    priceGrid === null ||
    sizeGrid === null ||
    metadata === null ||
    book === null ||
    fairPrice.fairPrice === null
  ) {
    return freezeQuoteSet({
      strategyId: DECIBEL_MARKET_MAKER_V1,
      quoteEngineVersion: DECIBEL_QUOTE_ENGINE_VERSION_V1,
      quoteSetId,
      configurationId,
      sourceMarketStateId: marketState.stateId,
      sourceFairPriceAssessmentId,
      sourceInventoryAssessmentId,
      status: 'INPUT_UNUSABLE',
      setFailureReasons: orderedFailures,
      bidSuppressionReasons: [],
      askSuppressionReasons: [],
      reservationPrice,
      rawBidPrice: null,
      rawAskPrice: null,
      candidateBidPrice: null,
      candidateAskPrice: null,
      rawBidSize: null,
      rawAskSize: null,
      candidateBidSize: null,
      candidateAskSize: null,
      intents: [],
    });
  }

  const rawBidPrice = reservationPrice * (1 - configuration.baseHalfSpreadBps / 10_000);
  const rawAskPrice = reservationPrice * (1 + configuration.baseHalfSpreadBps / 10_000);
  const candidateBidPrice = directionalRound(rawBidPrice, priceGrid, 'DOWN');
  const candidateAskPrice = directionalRound(rawAskPrice, priceGrid, 'UP');
  const rawBidSize = configuration.baseOrderSizeBase * inventory.bidSizeMultiplier;
  const rawAskSize = configuration.baseOrderSizeBase * inventory.askSizeMultiplier;
  const candidateBidSize = directionalRound(rawBidSize, sizeGrid, 'DOWN');
  const candidateAskSize = directionalRound(rawAskSize, sizeGrid, 'DOWN');
  const bidReasons: decibel_quote_side_suppression_reason_v1[] = [];
  const askReasons: decibel_quote_side_suppression_reason_v1[] = [];
  if (!inventory.allowBidInventoryIncrease) bidReasons.push('BID_INVENTORY_INCREASE_NOT_ALLOWED');
  if (candidateBidSize < metadata.minimumSize) bidReasons.push('BID_BELOW_MINIMUM_SIZE');
  if (candidateBidPrice >= book.bestAsk) bidReasons.push('BID_WOULD_TAKE_LIQUIDITY');
  if (!inventory.allowAskInventoryIncrease) askReasons.push('ASK_INVENTORY_INCREASE_NOT_ALLOWED');
  if (candidateAskSize < metadata.minimumSize) askReasons.push('ASK_BELOW_MINIMUM_SIZE');
  if (candidateAskPrice <= book.bestBid) askReasons.push('ASK_WOULD_TAKE_LIQUIDITY');
  if (bidReasons.length === 0 && askReasons.length === 0 && candidateBidPrice >= candidateAskPrice)
    failures.add('INTERNAL_QUOTE_CROSS');

  const finalSetFailures = SetFailureOrder.filter((reason) => failures.has(reason));
  const createIntent = (
    side: decibel_quote_side_v1,
    price: number,
    quantity: number,
    rawPrice: number,
    rawQuantity: number,
    multiplier: number,
  ): decibel_quote_intent_v1 => ({
    intentId: hashIdentity('decibel_quote_intent', [quoteSetId, side, price, quantity]),
    strategyId: DECIBEL_MARKET_MAKER_V1,
    quoteEngineVersion: DECIBEL_QUOTE_ENGINE_VERSION_V1,
    quoteSetId,
    marketAddress: metadata.marketAddress,
    sourceMarketStateId: marketState.stateId,
    sourceFairPriceAssessmentId,
    sourceFairPriceConfigurationId: fairPrice.configurationId,
    sourceInventoryAssessmentId,
    sourceInventoryConfigurationId: inventory.configurationId,
    side,
    orderType: 'LIMIT',
    timeInForce: 'POST_ONLY',
    price,
    quantity,
    rawPrice,
    rawQuantity,
    reservationPrice,
    baseHalfSpreadBps: configuration.baseHalfSpreadBps,
    inventorySizeMultiplier: multiplier,
  });
  const intents =
    finalSetFailures.length > 0
      ? []
      : [
          ...(bidReasons.length === 0
            ? [
                createIntent(
                  'BUY',
                  candidateBidPrice,
                  candidateBidSize,
                  rawBidPrice,
                  rawBidSize,
                  inventory.bidSizeMultiplier,
                ),
              ]
            : []),
          ...(askReasons.length === 0
            ? [
                createIntent(
                  'SELL',
                  candidateAskPrice,
                  candidateAskSize,
                  rawAskPrice,
                  rawAskSize,
                  inventory.askSizeMultiplier,
                ),
              ]
            : []),
        ];
  return freezeQuoteSet({
    strategyId: DECIBEL_MARKET_MAKER_V1,
    quoteEngineVersion: DECIBEL_QUOTE_ENGINE_VERSION_V1,
    quoteSetId,
    configurationId,
    sourceMarketStateId: marketState.stateId,
    sourceFairPriceAssessmentId,
    sourceInventoryAssessmentId,
    status: intents.length === 0 ? 'NO_QUOTES' : 'QUOTES_READY',
    setFailureReasons: finalSetFailures,
    bidSuppressionReasons: bidReasons,
    askSuppressionReasons: askReasons,
    reservationPrice,
    rawBidPrice,
    rawAskPrice,
    candidateBidPrice,
    candidateAskPrice,
    rawBidSize,
    rawAskSize,
    candidateBidSize,
    candidateAskSize,
    intents,
  });
}
