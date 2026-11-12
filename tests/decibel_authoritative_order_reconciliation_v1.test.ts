import { describe, expect, it } from 'vitest';

import {
  resolveDecibelAuthoritativeOrderEvidenceV1,
  type decibel_canonical_order_identity_v1,
  type decibel_normalized_fill_observation_v1,
  type decibel_normalized_order_observation_v1,
} from '../src/decibel_authoritative_order_reconciliation_v1.js';

const identity: decibel_canonical_order_identity_v1 = Object.freeze({
  market: 'BTC/USD',
  venueOrderId: 'venue-1',
  clientOrderId: 'client-1',
  intentId: 'intent-1',
  side: 'SELL',
  originalQuantity: 0.0003,
});

const open = (observedAt = 1): decibel_normalized_order_observation_v1 => ({
  source: 'AUTHENTICATED_OPEN_ORDERS',
  sourceTimestamp: null,
  observedAt,
  market: identity.market,
  venueOrderId: identity.venueOrderId,
  clientOrderId: identity.clientOrderId,
  side: identity.side,
  originalQuantity: identity.originalQuantity,
  remainingQuantity: identity.originalQuantity,
  terminalStatus: null,
});

const terminal = (
  terminalStatus: 'FILLED' | 'CANCELLED',
  remainingQuantity: number,
  observedAt = 2,
): decibel_normalized_order_observation_v1 => ({
  ...open(observedAt),
  source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
  remainingQuantity,
  terminalStatus,
});

const fill = (
  fillId: string,
  quantity: number,
  observedAt = 2,
): decibel_normalized_fill_observation_v1 => ({
  source: 'AUTHENTICATED_OWN_FILL_STREAM',
  observedAt,
  venueTimestamp: observedAt,
  market: identity.market,
  venueOrderId: identity.venueOrderId,
  clientOrderId: identity.clientOrderId,
  fillId,
  quantity,
  price: 81_608.2,
});

describe('Decibel authoritative order reconciliation V1', () => {
  it('makes terminal fill dominate a delayed OPEN for the exact owned identity', () => {
    const result = resolveDecibelAuthoritativeOrderEvidenceV1({
      identity,
      observations: [terminal('FILLED', 0, 2), open(3)],
      fills: [fill('fill-1', 0.0003, 2)],
    });
    expect(result).toMatchObject({
      state: 'FULL_FILL',
      reason: 'STALE_OPEN_IGNORED',
      staleOpenIgnored: true,
      nextAction: 'APPLY',
    });
  });

  it('does not terminalize ACK/OPEN from account-level absence', () => {
    expect(
      resolveDecibelAuthoritativeOrderEvidenceV1({
        identity,
        observations: [open()],
        fills: [],
      }),
    ).toMatchObject({ state: 'OPEN', reason: 'ORDER_OPEN_CONFIRMED' });
    expect(
      resolveDecibelAuthoritativeOrderEvidenceV1({ identity, observations: [], fills: [] }),
    ).toMatchObject({ state: 'UNKNOWN', reason: 'INSUFFICIENT_EVIDENCE' });
  });

  it('converges a cancel/fill race to FULL_FILL regardless of observation order', () => {
    for (const observations of [
      [terminal('CANCELLED', 0, 3), terminal('FILLED', 0, 2)],
      [terminal('FILLED', 0, 2), terminal('CANCELLED', 0, 3)],
    ])
      expect(
        resolveDecibelAuthoritativeOrderEvidenceV1({
          identity,
          observations,
          fills: [fill('fill-1', 0.0003)],
        }).state,
      ).toBe('FULL_FILL');
  });

  it('retains partial fills when the remainder is cancelled', () => {
    expect(
      resolveDecibelAuthoritativeOrderEvidenceV1({
        identity,
        observations: [open(), terminal('CANCELLED', 0.0002)],
        fills: [fill('fill-1', 0.0001)],
      }),
    ).toMatchObject({
      state: 'CANCELLED',
      cumulativeFilledQuantity: 0.0001,
      remainingQuantity: 0.0002,
    });
  });

  it('deduplicates identical fills and repeated snapshots', () => {
    const repeatedFill = fill('fill-1', 0.0001);
    expect(
      resolveDecibelAuthoritativeOrderEvidenceV1({
        identity,
        observations: [open(1), open(1)],
        fills: [repeatedFill, repeatedFill],
      }),
    ).toMatchObject({ state: 'PARTIAL_FILL', cumulativeFilledQuantity: 0.0001 });
  });

  it('blocks genuine venue/client identity contradictions', () => {
    expect(
      resolveDecibelAuthoritativeOrderEvidenceV1({
        identity,
        observations: [{ ...open(), clientOrderId: 'different-client' }],
        fills: [],
      }),
    ).toMatchObject({
      state: 'CONFLICT',
      reason: 'IDENTITY_CONTRADICTION',
      nextAction: 'BLOCK',
    });
  });

  it('uses exact fill truth while terminal history indexing is delayed', () => {
    expect(
      resolveDecibelAuthoritativeOrderEvidenceV1({
        identity,
        observations: [],
        fills: [fill('fill-1', 0.0003)],
      }),
    ).toMatchObject({ state: 'FULL_FILL', reason: 'TERMINAL_FILL_CONFIRMED' });
  });

  it('treats venue FILLED history with a positive remainder as a durable partial fill', () => {
    expect(
      resolveDecibelAuthoritativeOrderEvidenceV1({
        identity,
        observations: [terminal('FILLED', 0.00027, 2)],
        fills: [fill('fill-1', 0.00003, 2)],
      }),
    ).toMatchObject({
      state: 'PARTIAL_FILL',
      cumulativeFilledQuantity: 0.00003,
      remainingQuantity: 0.00027,
      nextAction: 'APPLY',
    });
  });

  it('accumulates duplicate and out-of-order partial fills exactly once', () => {
    const first = fill('fill-1', 0.00003, 3);
    const second = fill('fill-2', 0.00007, 2);
    expect(
      resolveDecibelAuthoritativeOrderEvidenceV1({
        identity,
        observations: [terminal('FILLED', 0.0002, 4)],
        fills: [first, second, first],
      }),
    ).toMatchObject({
      state: 'PARTIAL_FILL',
      cumulativeFilledQuantity: 0.0001,
      remainingQuantity: 0.0002,
    });
  });

  it('preserves earlier fills when the residual is subsequently cancelled', () => {
    const result = resolveDecibelAuthoritativeOrderEvidenceV1({
      identity,
      observations: [terminal('FILLED', 0.00027, 2), terminal('CANCELLED', 0, 4)],
      fills: [fill('fill-1', 0.00003, 2)],
    });
    expect(result).toMatchObject({
      state: 'CANCELLED',
      cumulativeFilledQuantity: 0.00003,
      remainingQuantity: 0,
    });
    expect(result.fills.map((row) => row.fillId)).toEqual(['fill-1']);
  });

  it('promotes a partial fill to full only after exact cumulative fill truth reaches original size', () => {
    expect(
      resolveDecibelAuthoritativeOrderEvidenceV1({
        identity,
        observations: [terminal('FILLED', 0.00027, 2), terminal('FILLED', 0, 5)],
        fills: [fill('fill-1', 0.00003, 2), fill('fill-2', 0.00027, 5)],
      }),
    ).toMatchObject({
      state: 'FULL_FILL',
      cumulativeFilledQuantity: 0.0003,
      remainingQuantity: 0,
    });
  });
});
