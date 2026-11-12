import { createHash } from 'node:crypto';
import { getDecibelQuantityUnitsV1 } from './decibel_chain_units_v1.js';

export class execution_preflight_rejection_v1 extends Error {
  public readonly rejectionCode: string;
  public readonly safeReason: string;

  public constructor(rejectionCode: string, safeReason = rejectionCode) {
    super('EXECUTION_PREFLIGHT_REJECTED');
    this.name = 'execution_preflight_rejection_v1';
    this.rejectionCode = rejectionCode;
    this.safeReason = safeReason;
  }
}

export type execution_intent_status_v1 =
  | 'PREPARED'
  | 'SUBMITTING'
  | 'SUBMIT_UNKNOWN'
  | 'ACKNOWLEDGED'
  | 'UNRESOLVABLE_ACK'
  | 'RECONCILING'
  | 'APPLIED'
  | 'EXTERNALLY_NEUTRALIZED'
  | 'CANCELLED_EXTERNALLY'
  | 'FAILED_TIMEOUT'
  | 'FAILED_DROPPED'
  | 'FAILED_DROPPED_LEGACY'
  | 'REJECTED'
  | 'SUPERSEDED';

export type place_intent_v1 = Readonly<{
  intentId: string;
  mutationKey: string;
  sessionId: string;
  cycleSequence: number;
  action: 'PLACE';
  market: 'BTC/USD';
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  priceTicks: number;
  quantityLots: number;
  clientOrderId: string;
  expectedPreviousVenueOrderId: null;
  sourceStateHash: string;
  strategyDecisionHash: string;
  createdAt: number;
  status: 'PREPARED';
  type: 'LIMIT';
  postOnly: boolean;
  timeInForce: 'PostOnly' | 'ImmediateOrCancel';
  executionRole:
    'STANDARD_MAKER' | 'INVENTORY_REDUCING_MAKER' | 'TAKE_PROFIT_MAKER' | 'SESSION_UNWIND_IOC';
  reduceOnly: boolean;
  selfTradePermitted: false;
  externalCounterpartyRequired: true;
}>;

export type tp_adverse_progress_v1 = Readonly<{
  positionKey: string;
  anchorPrice: number;
  targetPrice: number;
  previousPrice: number;
  quantity: number;
  observedAt: number;
  triggerBandPrice: number;
  recoveryDistancePrice: number;
}>;

export type cancel_intent_v1 = Readonly<{
  tpAdverseProgress?: tp_adverse_progress_v1;
  intentId: string;
  mutationKey: string;
  sessionId: string;
  cycleSequence: number;
  action: 'CANCEL';
  market: 'BTC/USD';
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  priceTicks: number;
  quantityLots: number;
  clientOrderId: string;
  expectedPreviousVenueOrderId: string;
  sourceStateHash: string;
  strategyDecisionHash: string;
  cancelReason: string;
  createdAt: number;
  status: 'PREPARED';
}>;

export type execution_intent_v1 = place_intent_v1 | cancel_intent_v1;

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function buildDecibelExecutionIntentV1(input: {
  sessionId: string;
  cycleSequence: number;
  action: 'PLACE' | 'CANCEL';
  market: 'BTC/USD';
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  tickSize: number;
  lotSize: number;
  clientOrderId: string;
  knownVenueOrderId: string | null;
  sourceStateHash: string;
  strategyDecisionHash: string;
  createdAt: number;
  executionRole?: place_intent_v1['executionRole'];
  reduceOnly?: boolean;
  timeInForce?: place_intent_v1['timeInForce'];
  cancelReason?: string;
  tpAdverseProgress?: tp_adverse_progress_v1;
}): execution_intent_v1 {
  const priceTicks = Math.round(input.price / input.tickSize);
  const quantityLots = Math.round(input.quantity / input.lotSize);
  const mutationBody = {
    market: input.market,
    action: input.action,
    side: input.side,
    priceTicks,
    quantityLots,
    cycleSequence: input.cycleSequence,
    knownVenueOrderId: input.knownVenueOrderId,
  };
  const mutationKey = hash(mutationBody);
  const common = {
    ...input,
    intentId: `intent-${mutationKey.slice(0, 24)}`,
    mutationKey,
    priceTicks,
    quantityLots,
    expectedPreviousVenueOrderId: input.knownVenueOrderId,
    status: 'PREPARED' as const,
  };
  if (input.action === 'PLACE')
    return Object.freeze({
      ...common,
      action: 'PLACE',
      knownVenueOrderId: undefined,
      expectedPreviousVenueOrderId: null,
      type: 'LIMIT',
      postOnly: (input.timeInForce ?? 'PostOnly') === 'PostOnly',
      timeInForce: input.timeInForce ?? 'PostOnly',
      executionRole: input.executionRole ?? 'STANDARD_MAKER',
      reduceOnly: input.reduceOnly ?? false,
      selfTradePermitted: false,
      externalCounterpartyRequired: true,
    });
  if (input.knownVenueOrderId === null) throw new Error('CANCEL_VENUE_ORDER_ID_REQUIRED');
  if (input.cancelReason === undefined || input.cancelReason.trim().length === 0)
    throw new Error('CANCEL_REASON_REQUIRED');
  return Object.freeze({
    ...common,
    action: 'CANCEL',
    cancelReason: input.cancelReason,
    expectedPreviousVenueOrderId: input.knownVenueOrderId,
    knownVenueOrderId: undefined,
  });
}

export function validateDecibelPlaceIntentV1(
  input: place_intent_v1,
  limits: {
    tickSize: number;
    lotSize: number;
    minimumSize?: number;
    minimumNotionalUsd: number;
    maximumNotionalUsd: number;
    maximumReductionQuantity?: number;
    currentPositionBase?: number;
    maximumAbsPositionBase?: number;
    openOrders?: readonly Readonly<{ side: 'BUY' | 'SELL'; quantity: number }>[];
    permittedSide: 'BUY' | 'SELL';
    bestBid?: number;
    bestAsk?: number;
  },
): void {
  const isUnitAligned = (value: number, step: number, units: number): boolean => {
    if (
      !Number.isFinite(value) ||
      !Number.isFinite(step) ||
      step <= 0 ||
      !Number.isSafeInteger(units) ||
      units <= 0
    )
      return false;
    const reconstructed = units * step;
    const tolerance = Math.max(1e-12, Number.EPSILON * Math.max(1, Math.abs(value)) * 8);
    return Math.abs(reconstructed - value) <= tolerance && Math.round(value / step) === units;
  };
  const reject = (code: string, safeReason = code): never => {
    throw new execution_preflight_rejection_v1(code, safeReason);
  };
  if (input.type !== 'LIMIT') reject('EXECUTION_PREFLIGHT_LIMIT_ORDER_REQUIRED');
  const sessionUnwindIoc = input.executionRole === 'SESSION_UNWIND_IOC';
  const exactRiskReductionMaker =
    input.executionRole === 'INVENTORY_REDUCING_MAKER' && input.reduceOnly;
  const exactPositionReduction = sessionUnwindIoc || exactRiskReductionMaker;
  if (sessionUnwindIoc) {
    if (input.timeInForce !== 'ImmediateOrCancel' || input.postOnly || !input.reduceOnly)
      reject('EXECUTION_PREFLIGHT_SESSION_UNWIND_IOC_REQUIRED');
  } else {
    if (input.timeInForce !== 'PostOnly' || !input.postOnly)
      reject('EXECUTION_PREFLIGHT_POST_ONLY_REQUIRED');
    if (
      !['STANDARD_MAKER', 'INVENTORY_REDUCING_MAKER', 'TAKE_PROFIT_MAKER'].includes(
        input.executionRole,
      )
    )
      reject('EXECUTION_PREFLIGHT_MAKER_ROLE_REQUIRED');
  }
  if (input.side !== limits.permittedSide) reject('EXECUTION_PREFLIGHT_SIDE_NOT_PERMITTED');
  if (input.selfTradePermitted) reject('EXECUTION_PREFLIGHT_SELF_TRADE_NOT_PERMITTED');
  if (!input.externalCounterpartyRequired)
    reject('EXECUTION_PREFLIGHT_EXTERNAL_COUNTERPARTY_REQUIRED');
  if (!isUnitAligned(input.price, limits.tickSize, input.priceTicks))
    reject('EXECUTION_PREFLIGHT_PRICE_NOT_TICK_ALIGNED');
  if (!isUnitAligned(input.quantity, limits.lotSize, input.quantityLots))
    reject('EXECUTION_PREFLIGHT_QUANTITY_NOT_LOT_ALIGNED');
  if (exactPositionReduction) {
    const minimumSize =
      limits.minimumSize ?? reject('EXECUTION_PREFLIGHT_VENUE_MINIMUM_SIZE_REQUIRED');
    const maximumReductionQuantity =
      limits.maximumReductionQuantity ??
      reject('EXECUTION_PREFLIGHT_AUTHENTICATED_REMAINING_POSITION_REQUIRED');
    if (!Number.isFinite(minimumSize) || minimumSize <= 0)
      reject('EXECUTION_PREFLIGHT_VENUE_MINIMUM_SIZE_REQUIRED');
    if (input.quantity + Number.EPSILON < minimumSize)
      reject('EXECUTION_PREFLIGHT_QUANTITY_BELOW_VENUE_MINIMUM');
    if (!Number.isFinite(maximumReductionQuantity) || maximumReductionQuantity <= 0)
      reject('EXECUTION_PREFLIGHT_AUTHENTICATED_REMAINING_POSITION_REQUIRED');
    if (input.quantity > maximumReductionQuantity + Number.EPSILON)
      reject('EXECUTION_PREFLIGHT_REDUCTION_WOULD_CROSS_FLAT');
    const reservedReduction = (limits.openOrders ?? [])
      .filter((o) => o.side === input.side)
      .reduce((sum, o) => sum + getDecibelQuantityUnitsV1(o.quantity), 0n);
    if (
      reservedReduction + getDecibelQuantityUnitsV1(input.quantity) >
      getDecibelQuantityUnitsV1(maximumReductionQuantity)
    )
      reject('EXECUTION_PREFLIGHT_AGGREGATE_REDUCTION_WOULD_CROSS_FLAT');
  }
  if (
    !sessionUnwindIoc &&
    limits.bestAsk !== undefined &&
    input.side === 'BUY' &&
    input.price >= limits.bestAsk
  )
    reject('EXECUTION_PREFLIGHT_POST_ONLY_WOULD_CROSS');
  if (
    !sessionUnwindIoc &&
    limits.bestBid !== undefined &&
    input.side === 'SELL' &&
    input.price <= limits.bestBid
  )
    reject('EXECUTION_PREFLIGHT_POST_ONLY_WOULD_CROSS');
  const notionalUsd = input.price * input.quantity;
  if (
    !exactPositionReduction &&
    (!Number.isFinite(notionalUsd) || notionalUsd < limits.minimumNotionalUsd)
  )
    reject(
      'EXECUTION_PREFLIGHT_NOTIONAL_BELOW_MINIMUM',
      `Order value $${Number.isFinite(notionalUsd) ? notionalUsd.toFixed(2) : 'INVALID'} below min $${limits.minimumNotionalUsd.toFixed(2)}`,
    );
  if (!exactPositionReduction && notionalUsd > limits.maximumNotionalUsd)
    reject(
      'EXECUTION_PREFLIGHT_NOTIONAL_ABOVE_MAXIMUM',
      `Order value $${notionalUsd.toFixed(2)} above max $${limits.maximumNotionalUsd.toFixed(2)}`,
    );
  if (!exactPositionReduction && limits.maximumAbsPositionBase !== undefined) {
    const currentPositionBase =
      limits.currentPositionBase ?? reject('EXECUTION_PREFLIGHT_AUTHENTICATED_POSITION_REQUIRED');
    if (!Number.isFinite(currentPositionBase))
      reject('EXECUTION_PREFLIGHT_AUTHENTICATED_POSITION_REQUIRED');
    if (!(limits.maximumAbsPositionBase > 0) || !Number.isFinite(limits.maximumAbsPositionBase))
      reject('EXECUTION_PREFLIGHT_POSITION_LIMIT_REQUIRED');
    const sameSidePending = (limits.openOrders ?? [])
      .filter((order) => order.side === input.side)
      .reduce((sum, order) => sum + order.quantity, 0);
    const projectedPositionBase =
      currentPositionBase +
      (input.side === 'BUY' ? sameSidePending + input.quantity : -sameSidePending - input.quantity);
    if (Math.abs(projectedPositionBase) > limits.maximumAbsPositionBase + Number.EPSILON)
      reject('EXECUTION_PREFLIGHT_POSITION_LIMIT_EXCEEDED');
  }
}
