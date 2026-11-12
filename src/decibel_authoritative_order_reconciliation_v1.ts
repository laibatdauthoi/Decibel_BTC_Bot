export const DECIBEL_AUTHORITATIVE_ORDER_RECONCILIATION_V1 =
  'DECIBEL_AUTHORITATIVE_ORDER_RECONCILIATION_V1' as const;

export type decibel_canonical_order_state_v1 =
  | 'SUBMISSION_PENDING'
  | 'ACKNOWLEDGED'
  | 'OPEN'
  | 'PARTIAL_FILL'
  | 'FULL_FILL'
  | 'CANCELLED'
  | 'UNKNOWN'
  | 'CONFLICT';

export type decibel_reconciliation_reason_v1 =
  | 'ORDER_OPEN_CONFIRMED'
  | 'PARTIAL_FILL_CONFIRMED'
  | 'TERMINAL_FILL_CONFIRMED'
  | 'TERMINAL_CANCEL_CONFIRMED'
  | 'STALE_OPEN_IGNORED'
  | 'DUPLICATE_OBSERVATION_IGNORED'
  | 'OWNED_ORDER_MATCHED'
  | 'INDEXING_DELAY_PENDING'
  | 'IDENTITY_CONTRADICTION'
  | 'INSUFFICIENT_EVIDENCE';

export type decibel_canonical_order_identity_v1 = Readonly<{
  market: string;
  venueOrderId: string;
  clientOrderId: string;
  intentId: string;
  side: 'BUY' | 'SELL';
  originalQuantity: number;
}>;

export type decibel_normalized_order_observation_v1 = Readonly<{
  source: 'AUTHENTICATED_OPEN_ORDERS' | 'AUTHENTICATED_TERMINAL_ORDER_HISTORY';
  sourceTimestamp: number | null;
  observedAt: number;
  market: string;
  venueOrderId: string;
  clientOrderId: string;
  side: 'BUY' | 'SELL' | null;
  originalQuantity: number | null;
  remainingQuantity: number | null;
  terminalStatus: 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'REJECTED' | null;
}>;

export type decibel_normalized_fill_observation_v1 = Readonly<{
  source: 'AUTHENTICATED_OWN_FILL_STREAM';
  observedAt: number;
  venueTimestamp: number | null;
  market: string;
  venueOrderId: string;
  clientOrderId: string;
  fillId: string;
  quantity: number;
  price: number;
}>;

export type decibel_authoritative_order_resolution_v1 = Readonly<{
  state: decibel_canonical_order_state_v1;
  reason: decibel_reconciliation_reason_v1;
  identity: decibel_canonical_order_identity_v1;
  cumulativeFilledQuantity: number;
  remainingQuantity: number | null;
  evidenceObservedAt: number | null;
  evidenceSource: string | null;
  staleOpenIgnored: boolean;
  nextAction: 'APPLY' | 'PRESERVE' | 'REFRESH' | 'BLOCK';
  fills: readonly decibel_normalized_fill_observation_v1[];
}>;

const ORDER_QUANTITY_TOLERANCE_V1 = 1e-12;

function normalizeOrderQuantity(quantity: number): number {
  return Number(quantity.toFixed(12));
}

function matchesIdentity(
  identity: decibel_canonical_order_identity_v1,
  observation: decibel_normalized_order_observation_v1 | decibel_normalized_fill_observation_v1,
): boolean {
  return (
    observation.market === identity.market &&
    observation.venueOrderId === identity.venueOrderId &&
    observation.clientOrderId === identity.clientOrderId
  );
}

export function resolveDecibelAuthoritativeOrderEvidenceV1(input: {
  identity: decibel_canonical_order_identity_v1;
  observations: readonly decibel_normalized_order_observation_v1[];
  fills: readonly decibel_normalized_fill_observation_v1[];
}): decibel_authoritative_order_resolution_v1 {
  const { identity } = input;
  const contradictory = [...input.observations, ...input.fills].some(
    (observation) =>
      (observation.venueOrderId === identity.venueOrderId ||
        observation.clientOrderId === identity.clientOrderId) &&
      !matchesIdentity(identity, observation),
  );
  const orderObservations = input.observations.filter((observation) =>
    matchesIdentity(identity, observation),
  );
  if (
    contradictory ||
    orderObservations.some(
      (observation) =>
        (observation.side !== null && observation.side !== identity.side) ||
        (observation.originalQuantity !== null &&
          Math.abs(observation.originalQuantity - identity.originalQuantity) >
            ORDER_QUANTITY_TOLERANCE_V1),
    )
  )
    return Object.freeze({
      state: 'CONFLICT',
      reason: 'IDENTITY_CONTRADICTION',
      identity,
      cumulativeFilledQuantity: 0,
      remainingQuantity: null,
      evidenceObservedAt: null,
      evidenceSource: null,
      staleOpenIgnored: false,
      nextAction: 'BLOCK',
      fills: Object.freeze([]),
    });

  const fillsById = new Map<string, decibel_normalized_fill_observation_v1>();
  for (const fill of input.fills.filter((candidate) => matchesIdentity(identity, candidate))) {
    const prior = fillsById.get(fill.fillId);
    if (
      prior !== undefined &&
      (prior.quantity !== fill.quantity ||
        prior.price !== fill.price ||
        prior.market !== fill.market)
    )
      return Object.freeze({
        state: 'CONFLICT',
        reason: 'IDENTITY_CONTRADICTION',
        identity,
        cumulativeFilledQuantity: 0,
        remainingQuantity: null,
        evidenceObservedAt: fill.observedAt,
        evidenceSource: fill.source,
        staleOpenIgnored: false,
        nextAction: 'BLOCK',
        fills: Object.freeze([...fillsById.values()]),
      });
    fillsById.set(fill.fillId, fill);
  }
  const fills = Object.freeze([...fillsById.values()]);
  const cumulativeFilledQuantity = normalizeOrderQuantity(
    fills.reduce((sum, fill) => sum + fill.quantity, 0),
  );
  if (cumulativeFilledQuantity - identity.originalQuantity > ORDER_QUANTITY_TOLERANCE_V1)
    return Object.freeze({
      state: 'CONFLICT',
      reason: 'IDENTITY_CONTRADICTION',
      identity,
      cumulativeFilledQuantity,
      remainingQuantity: null,
      evidenceObservedAt: fills.at(-1)?.observedAt ?? null,
      evidenceSource: fills.at(-1)?.source ?? null,
      staleOpenIgnored: false,
      nextAction: 'BLOCK',
      fills,
    });
  const terminals = orderObservations.filter((observation) => observation.terminalStatus !== null);
  // Decibel history emits FILLED observations for individual fill events while
  // remaining_size is still positive. Such a row proves progress, not terminality.
  const partialFillHistory = terminals.filter(
    (observation) =>
      observation.terminalStatus === 'FILLED' &&
      observation.remainingQuantity !== null &&
      observation.remainingQuantity > ORDER_QUANTITY_TOLERANCE_V1,
  );
  const open = orderObservations.filter(
    (observation) =>
      observation.terminalStatus === null || partialFillHistory.includes(observation),
  );
  const filledTerminal = terminals.find(
    (observation) =>
      observation.terminalStatus === 'FILLED' &&
      (observation.remainingQuantity === null ||
        observation.remainingQuantity <= ORDER_QUANTITY_TOLERANCE_V1),
  );
  const cancelledTerminal = terminals.find(
    (observation) =>
      observation.terminalStatus === 'CANCELLED' ||
      observation.terminalStatus === 'EXPIRED' ||
      observation.terminalStatus === 'REJECTED',
  );
  const staleOpenIgnored = terminals.length > 0 && open.length > 0;
  if (
    filledTerminal !== undefined ||
    cumulativeFilledQuantity + ORDER_QUANTITY_TOLERANCE_V1 >= identity.originalQuantity
  ) {
    const evidence = filledTerminal ?? fills.at(-1)!;
    return Object.freeze({
      state: 'FULL_FILL',
      reason: staleOpenIgnored ? 'STALE_OPEN_IGNORED' : 'TERMINAL_FILL_CONFIRMED',
      identity,
      cumulativeFilledQuantity: normalizeOrderQuantity(
        Math.max(cumulativeFilledQuantity, identity.originalQuantity),
      ),
      remainingQuantity: 0,
      evidenceObservedAt: evidence.observedAt,
      evidenceSource: evidence.source,
      staleOpenIgnored,
      nextAction: 'APPLY',
      fills,
    });
  }
  if (cancelledTerminal !== undefined && cancelledTerminal.remainingQuantity !== null) {
    return Object.freeze({
      state: 'CANCELLED',
      reason: staleOpenIgnored ? 'STALE_OPEN_IGNORED' : 'TERMINAL_CANCEL_CONFIRMED',
      identity,
      cumulativeFilledQuantity,
      remainingQuantity: cancelledTerminal.remainingQuantity,
      evidenceObservedAt: cancelledTerminal.observedAt,
      evidenceSource: cancelledTerminal.source,
      staleOpenIgnored,
      nextAction: 'APPLY',
      fills,
    });
  }
  if (cumulativeFilledQuantity > ORDER_QUANTITY_TOLERANCE_V1) {
    return Object.freeze({
      state: 'PARTIAL_FILL',
      reason: 'PARTIAL_FILL_CONFIRMED',
      identity,
      cumulativeFilledQuantity,
      remainingQuantity: normalizeOrderQuantity(
        Math.max(0, identity.originalQuantity - cumulativeFilledQuantity),
      ),
      evidenceObservedAt: fills.at(-1)?.observedAt ?? null,
      evidenceSource: fills.at(-1)?.source ?? null,
      staleOpenIgnored: false,
      nextAction: 'APPLY',
      fills,
    });
  }
  if (open.length > 0) {
    const latest = open.reduce((left, right) =>
      right.observedAt >= left.observedAt ? right : left,
    );
    return Object.freeze({
      state: 'OPEN',
      reason: open.length > 1 ? 'DUPLICATE_OBSERVATION_IGNORED' : 'ORDER_OPEN_CONFIRMED',
      identity,
      cumulativeFilledQuantity: 0,
      remainingQuantity: latest.remainingQuantity,
      evidenceObservedAt: latest.observedAt,
      evidenceSource: latest.source,
      staleOpenIgnored: false,
      nextAction: 'PRESERVE',
      fills,
    });
  }
  return Object.freeze({
    state: 'UNKNOWN',
    reason: 'INSUFFICIENT_EVIDENCE',
    identity,
    cumulativeFilledQuantity: 0,
    remainingQuantity: null,
    evidenceObservedAt: null,
    evidenceSource: null,
    staleOpenIgnored: false,
    nextAction: 'REFRESH',
    fills,
  });
}
