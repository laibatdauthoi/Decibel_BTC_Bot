import { createHash } from 'node:crypto';

import type { decibel_fair_price_assessment_v1 } from './decibel_fair_price_engine_v1.js';
import type { decibel_inventory_assessment_v1 } from './decibel_inventory_controller_v1.js';
import {
  DECIBEL_MARKET_MAKER_V1,
  type decibel_market_state_v1,
} from './decibel_market_state_v1.js';
import {
  DECIBEL_QUOTE_ENGINE_VERSION_V1,
  type decibel_quote_intent_v1,
  type decibel_quote_set_v1,
} from './decibel_quote_engine_v1.js';

export const DECIBEL_PASSIVE_VOLUME_RECYCLING_VERSION_V1 =
  'DECIBEL_PASSIVE_VOLUME_RECYCLING_V1' as const;

export type decibel_passive_volume_state_v1 =
  'FLAT' | 'LONG_RECYCLE' | 'SHORT_RECYCLE' | 'HARD_LONG' | 'HARD_SHORT' | 'DISABLED';

export type decibel_passive_volume_quote_configuration_v1 = Readonly<{
  targetInventoryBase: 0;
  nearFlatToleranceBase: number;
  flatBidOffsetTicks: number;
  flatAskOffsetTicks: number;
  recyclingBidOffsetTicks: number;
  recyclingAskOffsetTicks: number;
}>;

export const DecibelPassiveVolumeBaselineConfigurationV1 = Object.freeze({
  targetInventoryBase: 0 as const,
  nearFlatToleranceBase: 0,
  flatBidOffsetTicks: 0,
  flatAskOffsetTicks: 0,
  recyclingBidOffsetTicks: 0,
  recyclingAskOffsetTicks: 0,
});

export type decibel_passive_volume_quote_policy_result_v1 = Readonly<{
  strategyId: typeof DECIBEL_MARKET_MAKER_V1;
  policyVersion: typeof DECIBEL_PASSIVE_VOLUME_RECYCLING_VERSION_V1;
  state: decibel_passive_volume_state_v1;
  reason: string;
  desiredBidPrice: number | null;
  desiredAskPrice: number | null;
  desiredBidQuantity: number | null;
  desiredAskQuantity: number | null;
  quoteSet: decibel_quote_set_v1;
  liveExecutionEnabled: false;
  externalCounterpartyRequired: true;
  selfTradePermitted: false;
}>;

export type decibel_passive_volume_run_configuration_v1 = Readonly<{
  targetExternalVolumeUsd: number | null;
  maximumSessionDurationMs: number;
  maximumGrossLossUsd: number;
  maximumAbsInventoryBase: number;
}>;

export type decibel_passive_volume_stop_input_v1 = Readonly<{
  elapsedMs: number;
  achievedExternalMakerVolumeUsd: number;
  grossTradingPnlUsd: number;
  signedBaseInventory: number;
  riskDisabled: boolean;
  persistenceAvailable: boolean;
  marketTrustUsable: boolean;
  externalStop: boolean;
}>;

export function evaluateDecibelPassiveVolumeStopV1(
  input: decibel_passive_volume_stop_input_v1,
  configuration: decibel_passive_volume_run_configuration_v1,
) {
  const reasons: string[] = [];
  if (input.elapsedMs >= configuration.maximumSessionDurationMs)
    reasons.push('SESSION_DURATION_REACHED');
  if (input.grossTradingPnlUsd <= -configuration.maximumGrossLossUsd)
    reasons.push('LOSS_LIMIT_REACHED');
  if (Math.abs(input.signedBaseInventory) >= configuration.maximumAbsInventoryBase)
    reasons.push('EMERGENCY_INVENTORY_LIMIT');
  if (input.riskDisabled) reasons.push('RISK_CONTROLLER_DISABLED');
  if (!input.persistenceAvailable) reasons.push('PERSISTENCE_UNAVAILABLE');
  if (!input.marketTrustUsable) reasons.push('MARKET_TRUST_UNUSABLE');
  if (input.externalStop) reasons.push('EXTERNAL_STOP');
  if (
    configuration.targetExternalVolumeUsd !== null &&
    input.achievedExternalMakerVolumeUsd >= configuration.targetExternalVolumeUsd
  )
    reasons.push('TARGET_EXTERNAL_VOLUME_REACHED');
  return Object.freeze({
    disableNewQuotePlacement: reasons.length > 0,
    reasons: Object.freeze(reasons),
  });
}

function hashIdentity(prefix: string, values: readonly unknown[]): string {
  return `${prefix}_${createHash('sha256').update(JSON.stringify(values)).digest('hex')}`;
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

function validateConfiguration(configuration: decibel_passive_volume_quote_configuration_v1) {
  const offsets = [
    configuration.flatBidOffsetTicks,
    configuration.flatAskOffsetTicks,
    configuration.recyclingBidOffsetTicks,
    configuration.recyclingAskOffsetTicks,
  ];
  if (
    configuration.targetInventoryBase !== 0 ||
    !Number.isFinite(configuration.nearFlatToleranceBase) ||
    configuration.nearFlatToleranceBase < 0 ||
    offsets.some((value) => !Number.isSafeInteger(value) || value < 0)
  )
    throw new Error('DECIBEL_PASSIVE_VOLUME_INVALID_CONFIGURATION');
}

function emptyQuoteSet(
  marketState: decibel_market_state_v1,
  fairPrice: decibel_fair_price_assessment_v1,
  inventory: decibel_inventory_assessment_v1,
  configurationId: string,
  reason: 'MARKET_STATE_UNUSABLE' | 'MARKET_METADATA_INVALID',
): decibel_quote_set_v1 {
  return Object.freeze({
    strategyId: DECIBEL_MARKET_MAKER_V1,
    quoteEngineVersion: DECIBEL_QUOTE_ENGINE_VERSION_V1,
    quoteSetId: hashIdentity('decibel_passive_volume_quote_set', [
      marketState.stateId,
      configurationId,
      reason,
    ]),
    configurationId,
    sourceMarketStateId: marketState.stateId,
    sourceFairPriceAssessmentId: fairAssessmentId(fairPrice),
    sourceInventoryAssessmentId: inventoryAssessmentId(inventory),
    status: 'INPUT_UNUSABLE',
    setFailureReasons: Object.freeze([reason]),
    bidSuppressionReasons: Object.freeze([]),
    askSuppressionReasons: Object.freeze([]),
    reservationPrice: null,
    rawBidPrice: null,
    rawAskPrice: null,
    candidateBidPrice: null,
    candidateAskPrice: null,
    rawBidSize: null,
    rawAskSize: null,
    candidateBidSize: null,
    candidateAskSize: null,
    intents: Object.freeze([]),
  });
}

function getState(
  inventory: decibel_inventory_assessment_v1,
  tolerance: number,
): decibel_passive_volume_state_v1 {
  const deviation = inventory.signedBaseInventory;
  if (Math.abs(deviation) <= tolerance) return 'FLAT';
  if (inventory.inventoryZone === 'HARD_LIMIT') return deviation > 0 ? 'HARD_LONG' : 'HARD_SHORT';
  return deviation > 0 ? 'LONG_RECYCLE' : 'SHORT_RECYCLE';
}

export function calculateDecibelPassiveVolumeQuotesV1(
  marketState: decibel_market_state_v1,
  fairPrice: decibel_fair_price_assessment_v1,
  inventory: decibel_inventory_assessment_v1,
  configuration: decibel_passive_volume_quote_configuration_v1 = DecibelPassiveVolumeBaselineConfigurationV1,
): decibel_passive_volume_quote_policy_result_v1 {
  validateConfiguration(configuration);
  const configurationId = hashIdentity('decibel_passive_volume_quote_configuration', [
    configuration,
  ]);
  const metadata = marketState.metadata;
  const book = marketState.book;
  const metadataValid =
    metadata !== null &&
    Number.isFinite(metadata.tickSize) &&
    metadata.tickSize > 0 &&
    Number.isFinite(metadata.lotSize) &&
    metadata.lotSize > 0 &&
    Number.isFinite(metadata.minimumSize) &&
    metadata.minimumSize > 0;
  const bookValid =
    book !== null &&
    Number.isFinite(book.bestBid) &&
    Number.isFinite(book.bestAsk) &&
    book.bestBid > 0 &&
    book.bestAsk > book.bestBid;
  if (!marketState.usable || !bookValid || !metadataValid || metadata === null || book === null) {
    const reason = marketState.usable ? 'MARKET_METADATA_INVALID' : 'MARKET_STATE_UNUSABLE';
    return Object.freeze({
      strategyId: DECIBEL_MARKET_MAKER_V1,
      policyVersion: DECIBEL_PASSIVE_VOLUME_RECYCLING_VERSION_V1,
      state: 'DISABLED',
      reason,
      desiredBidPrice: null,
      desiredAskPrice: null,
      desiredBidQuantity: null,
      desiredAskQuantity: null,
      quoteSet: emptyQuoteSet(marketState, fairPrice, inventory, configurationId, reason),
      liveExecutionEnabled: false,
      externalCounterpartyRequired: true,
      selfTradePermitted: false,
    });
  }

  const state = getState(inventory, configuration.nearFlatToleranceBase);
  const bidEnabled = state === 'FLAT' || state === 'SHORT_RECYCLE' || state === 'HARD_SHORT';
  const askEnabled = state === 'FLAT' || state === 'LONG_RECYCLE' || state === 'HARD_LONG';
  const bidOffset =
    state === 'FLAT' ? configuration.flatBidOffsetTicks : configuration.recyclingBidOffsetTicks;
  const askOffset =
    state === 'FLAT' ? configuration.flatAskOffsetTicks : configuration.recyclingAskOffsetTicks;
  const bidPrice = bidEnabled ? book.bestBid - bidOffset * metadata.tickSize : null;
  const askPrice = askEnabled ? book.bestAsk + askOffset * metadata.tickSize : null;
  const quantity = Math.ceil(metadata.minimumSize / metadata.lotSize) * metadata.lotSize;
  const sourceFairPriceAssessmentId = fairAssessmentId(fairPrice);
  const sourceInventoryAssessmentId = inventoryAssessmentId(inventory);
  const quoteSetId = hashIdentity('decibel_passive_volume_quote_set', [
    marketState.stateId,
    sourceFairPriceAssessmentId,
    sourceInventoryAssessmentId,
    configurationId,
    state,
    bidPrice,
    askPrice,
    quantity,
  ]);
  const makeIntent = (side: 'BUY' | 'SELL', price: number): decibel_quote_intent_v1 =>
    Object.freeze({
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
      rawPrice: price,
      rawQuantity: quantity,
      reservationPrice: (book.bestBid + book.bestAsk) / 2,
      baseHalfSpreadBps: 0,
      inventorySizeMultiplier: 1,
    });
  const intents = Object.freeze([
    ...(bidPrice === null ? [] : [makeIntent('BUY', bidPrice)]),
    ...(askPrice === null ? [] : [makeIntent('SELL', askPrice)]),
  ]);
  const quoteSet: decibel_quote_set_v1 = Object.freeze({
    strategyId: DECIBEL_MARKET_MAKER_V1,
    quoteEngineVersion: DECIBEL_QUOTE_ENGINE_VERSION_V1,
    quoteSetId,
    configurationId,
    sourceMarketStateId: marketState.stateId,
    sourceFairPriceAssessmentId,
    sourceInventoryAssessmentId,
    status: intents.length === 0 ? 'NO_QUOTES' : 'QUOTES_READY',
    setFailureReasons: Object.freeze([]),
    bidSuppressionReasons: Object.freeze(
      bidEnabled ? [] : ['BID_INVENTORY_INCREASE_NOT_ALLOWED' as const],
    ),
    askSuppressionReasons: Object.freeze(
      askEnabled ? [] : ['ASK_INVENTORY_INCREASE_NOT_ALLOWED' as const],
    ),
    reservationPrice: (book.bestBid + book.bestAsk) / 2,
    rawBidPrice: bidPrice,
    rawAskPrice: askPrice,
    candidateBidPrice: bidPrice,
    candidateAskPrice: askPrice,
    rawBidSize: bidPrice === null ? null : quantity,
    rawAskSize: askPrice === null ? null : quantity,
    candidateBidSize: bidPrice === null ? null : quantity,
    candidateAskSize: askPrice === null ? null : quantity,
    intents,
  });
  return Object.freeze({
    strategyId: DECIBEL_MARKET_MAKER_V1,
    policyVersion: DECIBEL_PASSIVE_VOLUME_RECYCLING_VERSION_V1,
    state,
    reason: state,
    desiredBidPrice: bidPrice,
    desiredAskPrice: askPrice,
    desiredBidQuantity: bidPrice === null ? null : quantity,
    desiredAskQuantity: askPrice === null ? null : quantity,
    quoteSet,
    liveExecutionEnabled: false,
    externalCounterpartyRequired: true,
    selfTradePermitted: false,
  });
}
