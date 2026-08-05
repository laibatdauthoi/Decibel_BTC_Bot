import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { research_market_metadata } from './research_market_metadata.js';

export const RISK_POLICY_VERSION = 'BTC_USD_40X_RISK_V1';
export const FINANCIAL_DECIMAL_PLACES = 8;
const SCALE = 100_000_000n;

const EnvironmentSchema = z.object({
  REFERENCE_ACCOUNT_EQUITY_USD: z.coerce.number().positive().default(30),
  REQUIRED_ORDER_LEVERAGE: z.coerce.number().int().default(40),
  RISK_PER_TRADE_RATIO: z.coerce.number().positive().max(1).default(0.0025),
  MAX_ALLOCATED_MARGIN_RATIO: z.coerce.number().positive().max(1).default(1),
  MAX_ACCOUNT_EXPOSURE_MULTIPLE: z.coerce.number().positive().max(40).default(40),
  MAX_OPEN_POSITIONS: z.coerce.number().int().min(0).default(1),
  MAX_OPEN_ENTRY_ORDERS: z.coerce.number().int().min(0).default(1),
  MAX_DAILY_LOSS_RATIO: z.coerce.number().positive().max(1).default(0.01),
  MAX_ACCOUNT_DRAWDOWN_RATIO: z.coerce.number().positive().max(1).default(0.05),
  MAX_CONSECUTIVE_LOSSES: z.coerce.number().int().positive().default(3),
  LOSS_COOLDOWN_MINUTES: z.coerce.number().int().nonnegative().default(60),
  MIN_AVAILABLE_COLLATERAL_BUFFER_RATIO: z.coerce.number().min(0).max(1).default(0.1),
  MIN_STOP_DISTANCE_TICKS: z.coerce.number().int().positive().default(2),
  MAX_STOP_DISTANCE_RATIO: z.coerce.number().positive().max(1).default(0.05),
  HEALTHY_STABILIZATION_SECONDS: z.coerce.number().int().nonnegative().default(60),
  DAILY_VOLUME_TARGET_USD: z.coerce.number().nonnegative().default(10_000),
  MAKER_FEE_RATE: z.coerce.number().nonnegative().max(0.1).default(0.00011),
  EMERGENCY_TAKER_FEE_RATE: z.coerce.number().nonnegative().max(0.1).default(0.00034),
  MAX_CANDLE_AGE_MS: z.coerce.number().int().positive().default(360_000),
  MAX_BOOK_AGE_MS: z.coerce.number().int().positive().default(2_000),
  MAX_TRADE_AGE_MS: z.coerce.number().int().positive().default(120_000),
  MAX_MARKET_PRICE_AGE_MS: z.coerce.number().int().positive().default(5_000),
  MAX_AGGREGATE_AGE_MS: z.coerce.number().int().positive().default(2_000),
  MAX_CLOCK_SKEW_MS: z.coerce.number().int().nonnegative().default(1_000),
});

export type risk_engine_config = {
  referenceAccountEquityUSD: number;
  requiredOrderLeverage: 40;
  riskPerTradeRatio: number;
  maximumAllocatedMarginRatio: number;
  maximumAccountExposureMultiple: number;
  maximumOpenPositions: number;
  maximumOpenEntryOrders: number;
  maximumDailyLossRatio: number;
  maximumAccountDrawdownRatio: number;
  maximumConsecutiveLosses: number;
  lossCooldownMinutes: number;
  minimumAvailableCollateralBufferRatio: number;
  minimumStopDistanceTicks: number;
  maximumStopDistanceRatio: number;
  healthyStabilizationSeconds: number;
  dailyVolumeTargetUSD: number;
  makerFeeRate: number;
  emergencyTakerFeeRate: number;
  maximumCandleAgeMs: number;
  maximumBookAgeMs: number;
  maximumTradeAgeMs: number;
  maximumMarketPriceAgeMs: number;
  maximumAggregateAgeMs: number;
  maximumClockSkewMs: number;
};

export function normalizeRiskConfiguration(
  environment: Record<string, string | undefined>,
): risk_engine_config {
  const value = EnvironmentSchema.parse(environment);
  if (value.REQUIRED_ORDER_LEVERAGE !== 40)
    throw new Error('REQUIRED_ORDER_LEVERAGE must be exactly 40');
  return {
    referenceAccountEquityUSD: value.REFERENCE_ACCOUNT_EQUITY_USD,
    requiredOrderLeverage: 40,
    riskPerTradeRatio: value.RISK_PER_TRADE_RATIO,
    maximumAllocatedMarginRatio: value.MAX_ALLOCATED_MARGIN_RATIO,
    maximumAccountExposureMultiple: value.MAX_ACCOUNT_EXPOSURE_MULTIPLE,
    maximumOpenPositions: value.MAX_OPEN_POSITIONS,
    maximumOpenEntryOrders: value.MAX_OPEN_ENTRY_ORDERS,
    maximumDailyLossRatio: value.MAX_DAILY_LOSS_RATIO,
    maximumAccountDrawdownRatio: value.MAX_ACCOUNT_DRAWDOWN_RATIO,
    maximumConsecutiveLosses: value.MAX_CONSECUTIVE_LOSSES,
    lossCooldownMinutes: value.LOSS_COOLDOWN_MINUTES,
    minimumAvailableCollateralBufferRatio: value.MIN_AVAILABLE_COLLATERAL_BUFFER_RATIO,
    minimumStopDistanceTicks: value.MIN_STOP_DISTANCE_TICKS,
    maximumStopDistanceRatio: value.MAX_STOP_DISTANCE_RATIO,
    healthyStabilizationSeconds: value.HEALTHY_STABILIZATION_SECONDS,
    dailyVolumeTargetUSD: value.DAILY_VOLUME_TARGET_USD,
    makerFeeRate: value.MAKER_FEE_RATE,
    emergencyTakerFeeRate: value.EMERGENCY_TAKER_FEE_RATE,
    maximumCandleAgeMs: value.MAX_CANDLE_AGE_MS,
    maximumBookAgeMs: value.MAX_BOOK_AGE_MS,
    maximumTradeAgeMs: value.MAX_TRADE_AGE_MS,
    maximumMarketPriceAgeMs: value.MAX_MARKET_PRICE_AGE_MS,
    maximumAggregateAgeMs: value.MAX_AGGREGATE_AGE_MS,
    maximumClockSkewMs: value.MAX_CLOCK_SKEW_MS,
  };
}

export type risk_state =
  'ACTIVE' | 'PAUSED_DATA' | 'PAUSED_LOSS' | 'PAUSED_DRAWDOWN' | 'PAUSED_OPERATOR' | 'HALTED';
export type proposed_trade_intent = {
  intentId: string;
  marketAddress: string;
  direction: 'LONG' | 'SHORT';
  decisionTimestamp: string;
  referencePrice: number;
  intendedEntryPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  entryOrderType: 'POST_ONLY_LIMIT';
  requestedLeverage: number;
  candidateId: string;
  candidateType: string;
  strategyVersion: string;
  featureVersion: string;
  dataSessionId: string;
};
export type risk_context = {
  currentTime: string;
  accountEquity: number;
  availableCollateral: number;
  reservedCollateral: number;
  startOfDayEquity: number;
  realizedDailyPnL: number;
  realizedDailyFilledVolume: number;
  peakEquity: number;
  currentDrawdown: number;
  consecutiveLosses: number;
  lastLossTimestamp: string | null;
  currentPosition: { marketAddress: string } | null;
  existingOpenOrders: Array<{ entryOrder: boolean }>;
  marketMetadata: research_market_metadata;
  marketMode: string;
  unifiedRuntimeHealth: string;
  latestCompletedCandleTimestamp: string | null;
  latestBookTimestamp: string | null;
  latestTradeTimestamp: string | null;
  latestMarketPriceTimestamp: string | null;
  latestAggregateTimestamp: string | null;
  currentRiskState: risk_state;
  healthySinceTimestamp: string | null;
  processedIntentIds: string[];
  persistenceAvailable: boolean;
};

export type risk_reason_code =
  | 'APPROVED'
  | 'INVALID_CONFIGURATION'
  | 'PERSISTENCE_UNAVAILABLE'
  | 'DUPLICATE_INTENT'
  | 'RISK_STATE_NOT_ACTIVE'
  | 'REQUESTED_LEVERAGE_NOT_40'
  | 'MARKET_MAXIMUM_LEVERAGE_BELOW_40'
  | 'MARKET_ADDRESS_MISMATCH'
  | 'MARKET_NOT_OPEN'
  | 'INVALID_MARKET_METADATA'
  | 'UNHEALTHY_RUNTIME'
  | 'MISSING_MARKET_DATA'
  | 'STALE_MARKET_DATA'
  | 'FUTURE_TIMESTAMP'
  | 'INVALID_ACCOUNT_STATE'
  | 'DAILY_LOSS_LIMIT_REACHED'
  | 'DRAWDOWN_LIMIT_REACHED'
  | 'CONSECUTIVE_LOSS_LIMIT_REACHED'
  | 'LOSS_COOLDOWN_ACTIVE'
  | 'POSITION_ALREADY_EXISTS'
  | 'ENTRY_ORDER_ALREADY_EXISTS'
  | 'INVALID_ENTRY_PRICE'
  | 'INVALID_STOP_LOSS'
  | 'STOP_TOO_CLOSE'
  | 'STOP_TOO_FAR'
  | 'QUANTITY_BELOW_MINIMUM'
  | 'INSUFFICIENT_COLLATERAL'
  | 'COLLATERAL_BUFFER_VIOLATION'
  | 'EXPOSURE_LIMIT_EXCEEDED'
  | 'RISK_LIMIT_EXCEEDED'
  | 'UNSAFE_FINANCIAL_RESULT';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  return value;
}
function hash(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')}`;
}
export function hashRiskConfiguration(config: risk_engine_config): string {
  return hash(config);
}
export function hashRiskInput(intent: proposed_trade_intent, context: risk_context): string {
  return hash({ intent, context });
}
function fixed(value: number): bigint {
  if (!Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * 1e8)))
    throw new Error('Unsafe financial value');
  return BigInt(Math.round(value * 1e8));
}
function decimal(value: bigint): number {
  return Number(value) / 1e8;
}
export function getFinancialUnits(value: number): bigint {
  return fixed(value);
}
export function getFinancialDecimal(value: bigint): number {
  return decimal(value);
}
export function calculateFillNotional(price: number, quantity: number): number {
  return decimal(multiply(fixed(price), fixed(quantity)));
}
function multiply(left: bigint, right: bigint): bigint {
  return (left * right) / SCALE;
}
function divide(left: bigint, right: bigint): bigint {
  if (right <= 0n) throw new Error('Unsafe financial divisor');
  return (left * SCALE) / right;
}
function floorStep(value: bigint, step: bigint): bigint {
  return (value / step) * step;
}
function ceilStep(value: bigint, step: bigint): bigint {
  return ((value + step - 1n) / step) * step;
}
export function roundEntryPrice(
  direction: 'LONG' | 'SHORT',
  price: number,
  tickSize: number,
): number {
  const value = fixed(price),
    tick = fixed(tickSize);
  return decimal(direction === 'LONG' ? floorStep(value, tick) : ceilStep(value, tick));
}
export function roundStopPrice(
  direction: 'LONG' | 'SHORT',
  price: number,
  tickSize: number,
): number {
  const value = fixed(price),
    tick = fixed(tickSize);
  return decimal(direction === 'LONG' ? floorStep(value, tick) : ceilStep(value, tick));
}
export function roundQuantityDown(quantity: number, lotSize: number): number {
  return decimal(floorStep(fixed(quantity), fixed(lotSize)));
}
export function calculateMakerFeeReserve(notional: number, rate: number): number {
  return decimal(multiply(fixed(notional), fixed(rate)));
}
export function calculateEmergencyExitFeeReserve(notional: number, rate: number): number {
  return decimal(multiply(fixed(notional), fixed(rate)));
}
export function calculateRiskBasedQuantity(
  permittedRisk: number,
  entryPrice: number,
  stopPrice: number,
  makerFeeRate: number,
  emergencyTakerFeeRate: number,
): number {
  const entry = fixed(entryPrice);
  const stop = fixed(stopPrice);
  const exit = entry > stop ? entry : stop;
  const lossPerUnit =
    (entry > stop ? entry - stop : stop - entry) +
    multiply(entry, fixed(makerFeeRate)) +
    multiply(exit, fixed(emergencyTakerFeeRate));
  return decimal(divide(fixed(permittedRisk), lossPerUnit));
}
export function calculateMarginBasedQuantity(
  usableMargin: number,
  entryPrice: number,
  leverage = 40,
): number {
  if (leverage !== 40) throw new Error('Leverage must be exactly 40');
  return decimal(divide(fixed(usableMargin) * 40n, fixed(entryPrice)));
}
export function calculateExposureBasedQuantity(
  equity: number,
  maximumExposureMultiple: number,
  entryPrice: number,
): number {
  return decimal(
    divide(multiply(fixed(equity), fixed(maximumExposureMultiple)), fixed(entryPrice)),
  );
}

export type final_risk_calculation = {
  positionNotional: number;
  allocatedMargin: number;
  makerEntryFeeReserve: number;
  emergencyTakerExitFeeReserve: number;
  priceLossAtStop: number;
  totalLossAtStopIncludingFees: number;
};
export function recalculateFinalRisk(
  quantity: number,
  entryPrice: number,
  stopPrice: number,
  makerFeeRate: number,
  emergencyTakerFeeRate: number,
): final_risk_calculation {
  const quantityFixed = fixed(quantity);
  const entryFixed = fixed(entryPrice);
  const stopFixed = fixed(stopPrice);
  const distance = entryFixed > stopFixed ? entryFixed - stopFixed : stopFixed - entryFixed;
  const exitPrice = entryFixed > stopFixed ? entryFixed : stopFixed;
  const notional = multiply(quantityFixed, entryFixed);
  const maker = multiply(notional, fixed(makerFeeRate));
  const exitFee = multiply(multiply(quantityFixed, exitPrice), fixed(emergencyTakerFeeRate));
  const priceLoss = multiply(quantityFixed, distance);
  return {
    positionNotional: decimal(notional),
    allocatedMargin: decimal(notional) / 40,
    makerEntryFeeReserve: decimal(maker),
    emergencyTakerExitFeeReserve: decimal(exitFee),
    priceLossAtStop: decimal(priceLoss),
    totalLossAtStopIncludingFees: decimal(priceLoss + maker + exitFee),
  };
}
export type risk_decision = {
  status: 'APPROVED' | 'REJECTED';
  reasonCodes: risk_reason_code[];
  intentId: string;
  policyVersion: string;
  configurationHash: string;
  inputSnapshotHash: string;
  decisionTimestamp: string;
  configuredLeverage: 40;
  requestedLeverage: number;
  approvedLeverage: 40 | null;
  requestedEntryPrice: number;
  requestedStopLossPrice: number;
  requestedTakeProfitPrice: number | null;
  roundedEntryPrice: number | null;
  roundedStopLossPrice: number | null;
  roundedTakeProfitPrice: number | null;
  calculatedQuantity: number;
  positionNotional: number;
  allocatedMargin: number;
  accountExposureMultiple: number;
  leverageOnAllocatedMargin: number;
  makerEntryFeeReserve: number;
  emergencyTakerExitFeeReserve: number;
  totalFeeReserve: number;
  priceLossAtStop: number;
  totalLossAtStopIncludingFees: number;
  riskPercentageOfEquity: number;
  availableCollateralBefore: number;
  availableCollateralAfter: number;
  collateralBufferAfter: number;
  dailyFilledVolume: number;
  dailyVolumeTarget: number;
  dailyVolumeCompletionRatio: number;
  dailyVolumeRemaining: number;
  riskState: risk_state;
  liquidationPriceAvailability: 'UNAVAILABLE';
  liquidationBufferAvailability: 'UNAVAILABLE';
  exchangeMarginModeIntegration: 'UNAVAILABLE';
};

function firstRejection(
  intent: proposed_trade_intent,
  context: risk_context,
  config: risk_engine_config,
): risk_reason_code | null {
  if (
    config.requiredOrderLeverage !== 40 ||
    config.maximumAccountExposureMultiple > 40 ||
    !Number.isFinite(config.riskPerTradeRatio)
  )
    return 'INVALID_CONFIGURATION';
  if (!context.persistenceAvailable) return 'PERSISTENCE_UNAVAILABLE';
  if (context.processedIntentIds.includes(intent.intentId)) return 'DUPLICATE_INTENT';
  if (context.currentRiskState !== 'ACTIVE') return 'RISK_STATE_NOT_ACTIVE';
  if (intent.requestedLeverage !== 40) return 'REQUESTED_LEVERAGE_NOT_40';
  if (context.marketMetadata.maximumLeverage < 40) return 'MARKET_MAXIMUM_LEVERAGE_BELOW_40';
  if (intent.marketAddress !== context.marketMetadata.marketAddress)
    return 'MARKET_ADDRESS_MISMATCH';
  if (context.marketMode !== 'Open') return 'MARKET_NOT_OPEN';
  const metadata = context.marketMetadata;
  if (
    ![metadata.tickSize, metadata.lotSize, metadata.minimumSize].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    !Number.isInteger(metadata.sizeDecimals) ||
    !Number.isInteger(metadata.priceDecimals)
  )
    return 'INVALID_MARKET_METADATA';
  if (context.unifiedRuntimeHealth !== 'HEALTHY') return 'UNHEALTHY_RUNTIME';
  const timestamps = [
    [context.latestCompletedCandleTimestamp, config.maximumCandleAgeMs],
    [context.latestBookTimestamp, config.maximumBookAgeMs],
    [context.latestTradeTimestamp, config.maximumTradeAgeMs],
    [context.latestMarketPriceTimestamp, config.maximumMarketPriceAgeMs],
    [context.latestAggregateTimestamp, config.maximumAggregateAgeMs],
  ] as const;
  if (timestamps.some(([timestamp]) => timestamp === null)) return 'MISSING_MARKET_DATA';
  const now = Date.parse(context.currentTime);
  if (!Number.isSafeInteger(now)) return 'INVALID_ACCOUNT_STATE';
  const intentTime = Date.parse(intent.decisionTimestamp);
  if (!Number.isSafeInteger(intentTime)) return 'FUTURE_TIMESTAMP';
  if (intentTime - now > config.maximumClockSkewMs) return 'FUTURE_TIMESTAMP';
  for (const [timestamp, maximumAge] of timestamps) {
    const value = Date.parse(timestamp!);
    if (!Number.isSafeInteger(value)) return 'MISSING_MARKET_DATA';
    if (value - now > config.maximumClockSkewMs) return 'FUTURE_TIMESTAMP';
    if (now - value > maximumAge) return 'STALE_MARKET_DATA';
  }
  if (
    ![context.accountEquity, context.availableCollateral, context.reservedCollateral].every(
      (value) => Number.isFinite(value) && value >= 0,
    ) ||
    context.accountEquity <= 0 ||
    context.reservedCollateral > context.availableCollateral
  )
    return 'INVALID_ACCOUNT_STATE';
  if (-context.realizedDailyPnL >= context.startOfDayEquity * config.maximumDailyLossRatio)
    return 'DAILY_LOSS_LIMIT_REACHED';
  if (context.currentDrawdown >= config.maximumAccountDrawdownRatio)
    return 'DRAWDOWN_LIMIT_REACHED';
  if (context.consecutiveLosses >= config.maximumConsecutiveLosses)
    return 'CONSECUTIVE_LOSS_LIMIT_REACHED';
  if (
    context.lastLossTimestamp !== null &&
    now - Date.parse(context.lastLossTimestamp) < config.lossCooldownMinutes * 60_000
  )
    return 'LOSS_COOLDOWN_ACTIVE';
  if (context.currentPosition !== null) return 'POSITION_ALREADY_EXISTS';
  if (context.existingOpenOrders.some((order) => order.entryOrder))
    return 'ENTRY_ORDER_ALREADY_EXISTS';
  return null;
}

export function evaluateTradeRisk(
  intent: proposed_trade_intent,
  context: risk_context,
  config: risk_engine_config,
): risk_decision {
  const configurationHash = hashRiskConfiguration(config);
  const inputSnapshotHash = hashRiskInput(intent, context);
  const volumeRatio =
    config.dailyVolumeTargetUSD === 0
      ? 0
      : context.realizedDailyFilledVolume / config.dailyVolumeTargetUSD;
  const base = {
    intentId: intent.intentId,
    policyVersion: RISK_POLICY_VERSION,
    configurationHash,
    inputSnapshotHash,
    decisionTimestamp: context.currentTime,
    configuredLeverage: 40 as const,
    requestedLeverage: intent.requestedLeverage,
    requestedEntryPrice: intent.intendedEntryPrice,
    requestedStopLossPrice: intent.stopLossPrice,
    requestedTakeProfitPrice: intent.takeProfitPrice ?? null,
    availableCollateralBefore: context.availableCollateral,
    dailyFilledVolume: context.realizedDailyFilledVolume,
    dailyVolumeTarget: config.dailyVolumeTargetUSD,
    dailyVolumeCompletionRatio: volumeRatio,
    dailyVolumeRemaining: Math.max(
      0,
      config.dailyVolumeTargetUSD - context.realizedDailyFilledVolume,
    ),
    riskState: context.currentRiskState,
    liquidationPriceAvailability: 'UNAVAILABLE' as const,
    liquidationBufferAvailability: 'UNAVAILABLE' as const,
    exchangeMarginModeIntegration: 'UNAVAILABLE' as const,
  };
  const reject = (
    reason: risk_reason_code,
    roundedEntryPrice: number | null = null,
    roundedStopLossPrice: number | null = null,
  ): risk_decision => ({
    ...base,
    status: 'REJECTED',
    reasonCodes: [reason],
    approvedLeverage: null,
    roundedEntryPrice,
    roundedStopLossPrice,
    roundedTakeProfitPrice: null,
    calculatedQuantity: 0,
    positionNotional: 0,
    allocatedMargin: 0,
    accountExposureMultiple: 0,
    leverageOnAllocatedMargin: 0,
    makerEntryFeeReserve: 0,
    emergencyTakerExitFeeReserve: 0,
    totalFeeReserve: 0,
    priceLossAtStop: 0,
    totalLossAtStopIncludingFees: 0,
    riskPercentageOfEquity: 0,
    availableCollateralAfter: context.availableCollateral,
    collateralBufferAfter: context.availableCollateral - context.reservedCollateral,
  });
  const initial = firstRejection(intent, context, config);
  if (initial !== null) return reject(initial);
  try {
    if (!Number.isFinite(intent.intendedEntryPrice) || intent.intendedEntryPrice <= 0)
      return reject('INVALID_ENTRY_PRICE');
    if (!Number.isFinite(intent.stopLossPrice) || intent.stopLossPrice <= 0)
      return reject('INVALID_STOP_LOSS');
    const entry = roundEntryPrice(
      intent.direction,
      intent.intendedEntryPrice,
      context.marketMetadata.tickSize,
    );
    const stop = roundStopPrice(
      intent.direction,
      intent.stopLossPrice,
      context.marketMetadata.tickSize,
    );
    const takeProfit =
      intent.takeProfitPrice === undefined
        ? null
        : roundEntryPrice(
            intent.direction,
            intent.takeProfitPrice,
            context.marketMetadata.tickSize,
          );
    if (
      (intent.direction === 'LONG' && stop >= entry) ||
      (intent.direction === 'SHORT' && stop <= entry)
    )
      return reject('INVALID_STOP_LOSS', entry, stop);
    const distance = Math.abs(entry - stop);
    if (distance < config.minimumStopDistanceTicks * context.marketMetadata.tickSize)
      return reject('STOP_TOO_CLOSE', entry, stop);
    if (distance / entry > config.maximumStopDistanceRatio)
      return reject('STOP_TOO_FAR', entry, stop);
    const entryFixed = fixed(entry),
      stopFixed = fixed(stop),
      distanceFixed = fixed(distance);
    const makerRate = fixed(config.makerFeeRate),
      takerRate = fixed(config.emergencyTakerFeeRate);
    const conservativeExitPrice = entryFixed > stopFixed ? entryFixed : stopFixed;
    const lossPerUnit =
      distanceFixed + multiply(entryFixed, makerRate) + multiply(conservativeExitPrice, takerRate);
    const permittedRisk = multiply(fixed(context.accountEquity), fixed(config.riskPerTradeRatio));
    const riskQuantity = divide(permittedRisk, lossPerUnit);
    const buffer = multiply(
      fixed(context.accountEquity),
      fixed(config.minimumAvailableCollateralBufferRatio),
    );
    const collateral =
      fixed(context.availableCollateral) - fixed(context.reservedCollateral) - buffer;
    if (collateral <= 0n) return reject('COLLATERAL_BUFFER_VIOLATION', entry, stop);
    const marginCap = multiply(
      fixed(context.accountEquity),
      fixed(config.maximumAllocatedMarginRatio),
    );
    const usableMargin = collateral < marginCap ? collateral : marginCap;
    const marginQuantity = divide(usableMargin * 40n, entryFixed);
    const exposureNotional = multiply(
      fixed(context.accountEquity),
      fixed(config.maximumAccountExposureMultiple),
    );
    const exposureQuantity = divide(exposureNotional, entryFixed);
    const rawQuantity = [riskQuantity, marginQuantity, exposureQuantity].reduce((a, b) =>
      a < b ? a : b,
    );
    const quantityFixed = floorStep(rawQuantity, fixed(context.marketMetadata.lotSize));
    const quantity = decimal(quantityFixed);
    if (quantity < context.marketMetadata.minimumSize) {
      const minimumNotional = multiply(fixed(context.marketMetadata.minimumSize), entryFixed);
      if (minimumNotional > exposureNotional) return reject('EXPOSURE_LIMIT_EXCEEDED', entry, stop);
      if ((minimumNotional + 39n) / 40n > usableMargin)
        return reject('INSUFFICIENT_COLLATERAL', entry, stop);
      return reject('QUANTITY_BELOW_MINIMUM', entry, stop);
    }
    const notionalFixed = multiply(quantityFixed, entryFixed);
    const allocatedMarginBoundaryFixed = (notionalFixed + 39n) / 40n;
    const makerFeeFixed = multiply(notionalFixed, makerRate);
    const exitNotionalFixed = multiply(quantityFixed, conservativeExitPrice);
    const exitFeeFixed = multiply(exitNotionalFixed, takerRate);
    const priceLossFixed = multiply(quantityFixed, distanceFixed);
    const totalLossFixed = priceLossFixed + makerFeeFixed + exitFeeFixed;
    const availableAfterFixed =
      fixed(context.availableCollateral) -
      fixed(context.reservedCollateral) -
      allocatedMarginBoundaryFixed;
    if (allocatedMarginBoundaryFixed > usableMargin)
      return reject('INSUFFICIENT_COLLATERAL', entry, stop);
    if (availableAfterFixed < buffer) return reject('COLLATERAL_BUFFER_VIOLATION', entry, stop);
    if (notionalFixed > exposureNotional) return reject('EXPOSURE_LIMIT_EXCEEDED', entry, stop);
    if (totalLossFixed > permittedRisk) return reject('RISK_LIMIT_EXCEEDED', entry, stop);
    const notional = decimal(notionalFixed),
      allocatedMargin = notional / 40;
    return {
      ...base,
      status: 'APPROVED',
      reasonCodes: ['APPROVED'],
      approvedLeverage: 40,
      roundedEntryPrice: entry,
      roundedStopLossPrice: stop,
      roundedTakeProfitPrice: takeProfit,
      calculatedQuantity: quantity,
      positionNotional: notional,
      allocatedMargin,
      accountExposureMultiple: notional / context.accountEquity,
      leverageOnAllocatedMargin: 40,
      makerEntryFeeReserve: decimal(makerFeeFixed),
      emergencyTakerExitFeeReserve: decimal(exitFeeFixed),
      totalFeeReserve: decimal(makerFeeFixed + exitFeeFixed),
      priceLossAtStop: decimal(priceLossFixed),
      totalLossAtStopIncludingFees: decimal(totalLossFixed),
      riskPercentageOfEquity: decimal(totalLossFixed) / context.accountEquity,
      availableCollateralAfter: decimal(availableAfterFixed),
      collateralBufferAfter: decimal(availableAfterFixed),
    };
  } catch {
    return reject('UNSAFE_FINANCIAL_RESULT');
  }
}

export type risk_state_event =
  | 'DATA_UNHEALTHY'
  | 'DATA_HEALTHY_STABLE'
  | 'DAILY_LOSS_BREACH'
  | 'DRAWDOWN_BREACH'
  | 'OPERATOR_PAUSE'
  | 'OPERATOR_ACTIVATE'
  | 'INVARIANT_FAILURE';
export function transitionRiskState(
  state: risk_state,
  event: risk_state_event,
  operatorAuthorized = false,
  stabilization?: {
    currentTime: string;
    healthySinceTimestamp: string;
    requiredSeconds: number;
  },
): risk_state {
  if (event === 'INVARIANT_FAILURE') return 'HALTED';
  if (state === 'HALTED' || state === 'PAUSED_LOSS' || state === 'PAUSED_DRAWDOWN') return state;
  if (event === 'DAILY_LOSS_BREACH') return 'PAUSED_LOSS';
  if (event === 'DRAWDOWN_BREACH') return 'PAUSED_DRAWDOWN';
  if (event === 'OPERATOR_PAUSE') return 'PAUSED_OPERATOR';
  if (state === 'PAUSED_OPERATOR')
    return event === 'OPERATOR_ACTIVATE' && operatorAuthorized ? 'ACTIVE' : state;
  if (event === 'DATA_UNHEALTHY' && state === 'ACTIVE') return 'PAUSED_DATA';
  if (event === 'DATA_HEALTHY_STABLE' && state === 'PAUSED_DATA') {
    if (stabilization === undefined) return state;
    const current = Date.parse(stabilization.currentTime);
    const healthySince = Date.parse(stabilization.healthySinceTimestamp);
    if (!Number.isFinite(current) || !Number.isFinite(healthySince)) return state;
    if (current - healthySince >= stabilization.requiredSeconds * 1_000) return 'ACTIVE';
  }
  return state;
}

export type fill_record = {
  fillId: string;
  timestamp: string;
  price: number;
  quantity: number;
  role: 'ENTRY' | 'EXIT';
};
export function calculateDailyVolume(
  fills: readonly fill_record[],
  targetUSD: number,
  now: string,
): {
  dailyFilledVolume: number;
  completionRatio: number;
  remainingVolume: number;
  projectedEndOfDayVolume: number;
  status: 'TARGET_ON_TRACK' | 'TARGET_AT_RISK' | 'TARGET_MET' | 'TARGET_MISSED';
} {
  const current = new Date(now);
  const day = current.toISOString().slice(0, 10);
  const unique = new Map(fills.map((fill) => [fill.fillId, fill]));
  const volumeUnits = [...unique.values()]
    .filter((fill) => fill.timestamp.slice(0, 10) === day)
    .reduce((sum, fill) => {
      const notional = multiply(fixed(fill.price), fixed(fill.quantity));
      return sum + (notional < 0n ? -notional : notional);
    }, 0n);
  const volume = decimal(volumeUnits);
  const elapsed =
    current.getUTCHours() * 3600 + current.getUTCMinutes() * 60 + current.getUTCSeconds();
  const projected = elapsed === 0 ? volume : decimal((volumeUnits * 86_400n) / BigInt(elapsed));
  const endOfDay = elapsed >= 86_399;
  return {
    dailyFilledVolume: volume,
    completionRatio: targetUSD === 0 ? 0 : decimal(divide(volumeUnits, fixed(targetUSD))),
    remainingVolume: decimal(fixed(targetUSD) > volumeUnits ? fixed(targetUSD) - volumeUnits : 0n),
    projectedEndOfDayVolume: projected,
    status:
      volume >= targetUSD
        ? 'TARGET_MET'
        : endOfDay
          ? 'TARGET_MISSED'
          : projected >= targetUSD
            ? 'TARGET_ON_TRACK'
            : 'TARGET_AT_RISK',
  };
}
