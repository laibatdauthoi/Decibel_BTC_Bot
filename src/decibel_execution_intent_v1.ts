import { createHash } from 'node:crypto';

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
  const valid =
    input.type === 'LIMIT' &&
    input.postOnly &&
    input.side === limits.permittedSide &&
    !input.selfTradePermitted &&
    input.externalCounterpartyRequired &&
    input.priceTicks * limits.tickSize === input.price &&
    input.quantityLots * limits.lotSize === input.quantity &&
    input.price * input.quantity >= limits.minimumNotionalUsd &&
    input.price * input.quantity <= limits.maximumNotionalUsd;
  if (!valid) throw new Error('EXECUTION_PREFLIGHT_REJECTED');
}
