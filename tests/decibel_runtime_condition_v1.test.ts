import { describe, expect, it } from 'vitest';
import { DECIBEL_STRATEGY_POLICY_V1 } from '../src/decibel_strategy_policy_v1.js';
import {
  DECIBEL_RECONCILING_ESCALATION_MS_V1,
  classifyDecibelRuntimeConditionV1,
  describeDecibelRuntimeConditionV1,
  escalateDecibelRuntimeConditionV1,
  getDecibelConditionSourceV1,
  isDecibelEntryCapacityOnlyReasonV1,
  isDecibelEntryOnlyReasonV1,
  normalizeDecibelConditionCodeV1,
} from '../src/decibel_runtime_condition_v1.js';

describe('decibel runtime condition v1', () => {
  it.each([
    ['ENTRY_REQUIRES_NEW_LOW', 'WAITING'],
    ['NO_NEW_QUOTE_HEADROOM', 'WAITING'],
    ['OPERATOR_PAUSED', 'WAITING'],
    ['DUST_BELOW_MIN_SIZE', 'WAITING'],
    ['SESSION_PAUSED_FOR_SHUTDOWN', 'WAITING'],
    ['PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED', 'WAITING'],
    ['SIDE_OCCUPIED_BUY_ACKNOWLEDGED', 'WAITING'],
    ['KEEP:NOOP_RECREATE_AFTER_CANCEL ORDER_KEY=BUY|65000|0.0001', 'WAITING'],
    ['PRODUCTION_RECONCILIATION_CONFIRMATION_PENDING', 'RECONCILING'],
    ['PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING', 'RECONCILING'],
    ['RECONCILIATION_REQUIRED', 'RECONCILING'],
    ['MARKET_DATA_STALE', 'DEGRADED'],
    ['PRODUCTION_DECIBEL_HTTP_RATE_LIMITED', 'DEGRADED'],
    ['CAPACITY_VENUE_MARGIN_RULES_STALE', 'DEGRADED'],
    ['STRATEGY_ACTIVITY_EXCLUSIVITY_LOST', 'FAULT'],
    ['PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT', 'FAULT'],
    ['INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT:170141594179263708311478428007177125888', 'FAULT'],
    ['SOMETHING_NEW_AND_UNKNOWN', 'FAULT'],
    ['fetch failed', 'FAULT'],
  ])('classifies %s as %s', (code, kind) => {
    expect(classifyDecibelRuntimeConditionV1(code)).toBe(kind);
  });

  it('splits order identifiers out of the code', () => {
    expect(
      normalizeDecibelConditionCodeV1(
        'INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT:170141594179263708311478428007177125888',
      ),
    ).toEqual({
      code: 'INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT',
      detail: '170141594179263708311478428007177125888',
    });
    expect(normalizeDecibelConditionCodeV1('KEEP:NOOP_RECREATE_AFTER_CANCEL ORDER_KEY=k')).toEqual({
      code: 'KEEP:NOOP_RECREATE_AFTER_CANCEL',
      detail: 'ORDER_KEY=k',
    });
    expect(normalizeDecibelConditionCodeV1('ENTRY_REQUIRES_NEW_LOW')).toEqual({
      code: 'ENTRY_REQUIRES_NEW_LOW',
      detail: null,
    });
    expect(normalizeDecibelConditionCodeV1('fetch failed')).toEqual({
      code: 'fetch failed',
      detail: null,
    });
  });

  it('escalates routine confirmation to a fault after a minute', () => {
    expect(escalateDecibelRuntimeConditionV1('RECONCILING', 2_000)).toBe('RECONCILING');
    expect(escalateDecibelRuntimeConditionV1('RECONCILING', null)).toBe('RECONCILING');
    expect(
      escalateDecibelRuntimeConditionV1('RECONCILING', DECIBEL_RECONCILING_ESCALATION_MS_V1 + 1),
    ).toBe('FAULT');
    expect(escalateDecibelRuntimeConditionV1('WAITING', 10 * 60_000)).toBe('WAITING');
  });

  it('describes known codes and falls back by kind', () => {
    expect(describeDecibelRuntimeConditionV1('NO_NEW_QUOTE_HEADROOM')).toContain('free margin');
    expect(
      describeDecibelRuntimeConditionV1('INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT:123456789'),
    ).toContain('cross through flat');
    expect(describeDecibelRuntimeConditionV1('SOMETHING_NEW_AND_UNKNOWN')).toBe(
      'Production safety condition requires review.',
    );
    expect(describeDecibelRuntimeConditionV1('SIDE_OCCUPIED_SELL_SUBMITTING')).toContain(
      'being confirmed',
    );
  });

  it('keeps the two entry-only lists in one place', () => {
    expect(isDecibelEntryOnlyReasonV1('ENTRY_REQUIRES_NEW_LOW')).toBe(true);
    expect(isDecibelEntryOnlyReasonV1('NO_NEW_QUOTE_HEADROOM')).toBe(true);
    // Capacity evidence stays fail-closed for an executable reduction (decision layer).
    expect(isDecibelEntryOnlyReasonV1('CAPACITY_POST_FILL_MARGIN_UNSAFE')).toBe(false);
    expect(isDecibelEntryCapacityOnlyReasonV1('CAPACITY_POST_FILL_MARGIN_UNSAFE')).toBe(true);
    expect(isDecibelEntryCapacityOnlyReasonV1('ENTRY_VOLATILITY_PAUSE')).toBe(true);
    expect(isDecibelEntryCapacityOnlyReasonV1('SESSION_MAX_LOSS_REACHED')).toBe(false);
  });
  it('gives the dashboard label and the kind from one classifier', () => {
    expect(getDecibelConditionSourceV1('PRODUCTION_AUTHENTICATED_STATE_STALE')).toEqual({
      classification: 'AUTHENTICATED_ACCOUNT_STALE',
      source: 'ACCOUNT',
    });
    expect(classifyDecibelRuntimeConditionV1('PRODUCTION_AUTHENTICATED_STATE_STALE')).toBe(
      'DEGRADED',
    );
    expect(
      classifyDecibelRuntimeConditionV1('ADVERSE_SELECTION_EVIDENCE_INSUFFICIENT:REGIME=17/30'),
    ).toBe('DEGRADED');
    expect(
      classifyDecibelRuntimeConditionV1('EXECUTION_AUTHORITATIVE_RECONCILIATION_CONFLICT'),
    ).toBe('FAULT');
    // Start-up warming is a normal wait, not stale evidence.
    expect(getDecibelConditionSourceV1('PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED')).toBeNull();
    expect(getDecibelConditionSourceV1('CAPACITY_VENUE_MARGIN_RULES_STALE')).toMatchObject({
      source: 'VENUE DATA',
    });
  });

  it('takes the numbers in its messages from the strategy policy', () => {
    expect(describeDecibelRuntimeConditionV1('ENTRY_GAS_BALANCE_LOW')).toContain(
      `(${DECIBEL_STRATEGY_POLICY_V1.gas.entryReserveApt} APT)`,
    );
    expect(describeDecibelRuntimeConditionV1('ENTRY_VOLATILITY_PAUSE')).toContain(
      `above ${DECIBEL_STRATEGY_POLICY_V1.entry.volatilityPauseBps} bps`,
    );
  });
});
