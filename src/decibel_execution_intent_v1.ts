import { createHash } from 'node:crypto';

export class execution_preflight_rejection_v1 extends Error {
  public readonly rejectionCode: string;

  public constructor(rejectionCode: string) {
    super('EXECUTION_PREFLIGHT_REJECTED');
    this.name = 'execution_preflight_rejection_v1';
    this.rejectionCode = rejectionCode;
  }
}

export type execution_intent_status_v1 =
  | 'PREPARED'
  | 'SUBMITTING'
  | 'SUBMIT_UNKNOWN'
  | 'ACKNOWLEDGED'
  | 'RECONCILING'
  | 'APPLIED'
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
  postOnly: true;
  selfTradePermitted: false;
  externalCounterpartyRequired: true;
}>;

export type cancel_intent_v1 = Readonly<{
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
      postOnly: true,
      selfTradePermitted: false,
      externalCounterpartyRequired: true,
    });
  if (input.knownVenueOrderId === null) throw new Error('CANCEL_VENUE_ORDER_ID_REQUIRED');
  return Object.freeze({
    ...common,
    action: 'CANCEL',
    expectedPreviousVenueOrderId: input.knownVenueOrderId,
    knownVenueOrderId: undefined,
  });
}

export function validateDecibelPlaceIntentV1(
  input: place_intent_v1,
  limits: {
    tickSize: number;
    lotSize: number;
    minimumNotionalUsd: number;
    maximumNotionalUsd: number;
    permittedSide: 'BUY' | 'SELL';
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
  const reject = (code: string): never => {
    throw new execution_preflight_rejection_v1(code);
  };
  if (input.type !== 'LIMIT') reject('EXECUTION_PREFLIGHT_LIMIT_ORDER_REQUIRED');
  if (!input.postOnly) reject('EXECUTION_PREFLIGHT_POST_ONLY_REQUIRED');
  if (input.side !== limits.permittedSide) reject('EXECUTION_PREFLIGHT_SIDE_NOT_PERMITTED');
  if (input.selfTradePermitted) reject('EXECUTION_PREFLIGHT_SELF_TRADE_NOT_PERMITTED');
  if (!input.externalCounterpartyRequired)
    reject('EXECUTION_PREFLIGHT_EXTERNAL_COUNTERPARTY_REQUIRED');
  if (!isUnitAligned(input.price, limits.tickSize, input.priceTicks))
    reject('EXECUTION_PREFLIGHT_PRICE_NOT_TICK_ALIGNED');
  if (!isUnitAligned(input.quantity, limits.lotSize, input.quantityLots))
    reject('EXECUTION_PREFLIGHT_QUANTITY_NOT_LOT_ALIGNED');
  const notionalUsd = input.price * input.quantity;
  if (!Number.isFinite(notionalUsd) || notionalUsd < limits.minimumNotionalUsd)
    reject('EXECUTION_PREFLIGHT_NOTIONAL_BELOW_MINIMUM');
  if (notionalUsd > limits.maximumNotionalUsd) reject('EXECUTION_PREFLIGHT_NOTIONAL_ABOVE_MAXIMUM');
}
