import { describe, expect, it } from 'vitest';

import {
  DECIBEL_CANARY_DEFAULT_MIN_NOTIONAL_USD,
  DECIBEL_CANARY_DEFAULT_TARGET_NOTIONAL_USD,
  DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  DecibelMinimalLiveCanarySpecificationAuditV1,
  authorizeDecibelMinimalLiveCanaryMutationV1,
  calculateDecibelMinimalLiveCanaryBufferedQuantityV1,
  createDecibelMinimalLiveCanaryConfigurationV1,
  decibel_minimal_live_canary_state_machine_v1,
  planDecibelMinimalLiveCanaryV1,
  reconcileDecibelMinimalLiveCanaryExecutionV1,
  runDecibelMinimalLiveCanaryDryRunV1,
} from '../src/decibel_minimal_live_canary_v1.js';

const configInput = {
  canaryId: 'canary-001',
  executionSessionId: 'session-001',
  account: '0xcanary',
  subaccount: '0xcanary',
  network: 'mainnet',
  market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  side: 'BUY' as const,
  observationTimeoutMs: 60_000,
  executionRecoveryTimeoutMs: 120_000,
  strategyConfigId: 'strategy-config-001',
};

function configuration(side: 'BUY' | 'SELL' = 'BUY') {
  return createDecibelMinimalLiveCanaryConfigurationV1({ ...configInput, side });
}

function preflight(side: 'BUY' | 'SELL' = 'BUY') {
  void side;
  return {
    authenticatedAccount: '0xcanary',
    configuredNetwork: 'mainnet',
    observedNetwork: 'mainnet',
    market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    metadataFresh: true,
    marketOperational: true,
    tickSize: 0.5,
    lotSize: 0.001,
    minimumOrderSize: 0.001,
    minimumMetadataValidQuantity: 0.001,
    bestBid: 100,
    bestAsk: 100.5,
    exactMarketIdentity: true,
    authoritativeNoOpenPosition: true,
    dedicatedSubaccount: true,
    unresolvedExecutionJournalCount: 0,
    unexpectedOpenStrategyActivityCount: 0,
    activeTpSlCount: 0,
    activeTwapCount: 0,
    activeBulkOrderCount: 0,
    expectedDelegatedOrManualActivity: false,
    journalHealthy: true,
  };
}

function plan(side: 'BUY' | 'SELL' = 'BUY') {
  return planDecibelMinimalLiveCanaryV1({
    configuration: configuration(side),
    persistedConfigHash: null,
    preflight: preflight(side),
    placementTransactionCount: 0,
    venueOrderCount: 0,
  });
}

describe('Decibel Minimal Live Canary V1 configuration and preflight', () => {
  it('keeps LIVE structurally disabled and freezes the one-order contract', () => {
    const value = configuration();
    expect(value).toMatchObject({
      maximumVenueOrdersPerSession: 1,
      maximumConcurrentLiveOrders: 1,
      maximumPlacementTransactions: 1,
      maximumStrategyOrdersAfterFirstSubmission: 0,
      automaticPlaceRetry: false,
      automaticSecondOrder: false,
      automaticReplacementOrder: false,
      automaticRecycleOrder: false,
      liveExecutionEnabled: false,
    });
    expect(() => authorizeDecibelMinimalLiveCanaryMutationV1()).toThrow('LIVE_EXECUTION_DISABLED');
  });

  it('requires an explicit side, dedicated subaccount, exact market and network', () => {
    expect(() =>
      createDecibelMinimalLiveCanaryConfigurationV1({
        ...configInput,
        side: undefined as never,
      }),
    ).toThrow('CANARY_CONFIGURATION_INVALID');
    expect(() =>
      createDecibelMinimalLiveCanaryConfigurationV1({ ...configInput, market: 'wrong' as never }),
    ).toThrow('CANARY_CONFIGURATION_INVALID');
    expect(() =>
      planDecibelMinimalLiveCanaryV1({
        configuration: configuration(),
        persistedConfigHash: null,
        preflight: { ...preflight(), dedicatedSubaccount: false },
        placementTransactionCount: 0,
        venueOrderCount: 0,
      }),
    ).toThrow('CANARY_DEDICATED_SUBACCOUNT_REQUIRED');
    for (const changed of [
      { observedNetwork: 'testnet' },
      { market: 'wrong' },
      { authenticatedAccount: 'wrong' },
    ])
      expect(() =>
        planDecibelMinimalLiveCanaryV1({
          configuration: configuration(),
          persistedConfigHash: null,
          preflight: { ...preflight(), ...changed },
          placementTransactionCount: 0,
          venueOrderCount: 0,
        }),
      ).toThrow('CANARY_PREFLIGHT_IDENTITY_MISMATCH');
  });

  it('requires authoritative flat/exclusive state and healthy durable journal', () => {
    for (const changed of [
      { authoritativeNoOpenPosition: false },
      { unresolvedExecutionJournalCount: 1 },
      { unexpectedOpenStrategyActivityCount: 1 },
      { activeTpSlCount: 1 },
      { activeTwapCount: 1 },
      { activeBulkOrderCount: 1 },
      { expectedDelegatedOrManualActivity: true },
      { journalHealthy: false },
    ]) {
      const result = runDecibelMinimalLiveCanaryDryRunV1({
        configuration: configuration(),
        persistedConfigHash: null,
        preflight: { ...preflight(), ...changed },
        placementTransactionCount: 0,
        venueOrderCount: 0,
      });
      expect(result.canaryDryRunReady).toBe(false);
      expect(result.venueMutationAttempted).toBe(false);
    }
  });

  it('enforces minimum quantity, LIMIT/PostOnly, exact BBO join and non-crossing', () => {
    const base = {
      configuration: configuration(),
      persistedConfigHash: null,
      preflight: preflight(),
      placementTransactionCount: 0,
      venueOrderCount: 0,
    };
    expect(() => planDecibelMinimalLiveCanaryV1({ ...base, requestedQuantity: 0.002 })).toThrow(
      'CANARY_BUFFERED_QUANTITY_REQUIRED',
    );
    expect(() => planDecibelMinimalLiveCanaryV1({ ...base, requestedOrderType: 'MARKET' })).toThrow(
      'CANARY_LIMIT_ORDER_REQUIRED',
    );
    expect(() => planDecibelMinimalLiveCanaryV1({ ...base, requestedTimeInForce: 'IOC' })).toThrow(
      'CANARY_POST_ONLY_REQUIRED',
    );
    expect(() => planDecibelMinimalLiveCanaryV1({ ...base, requestedPrice: 100.5 })).toThrow(
      'CANARY_EXACT_BBO_JOIN_REQUIRED',
    );
    expect(plan('BUY').price).toBe(100);
    expect(plan('SELL').price).toBe(100.5);
  });

  it('uses the $10 hard floor and $20 buffered operational target by default', () => {
    expect(DECIBEL_CANARY_DEFAULT_MIN_NOTIONAL_USD).toBe(10);
    expect(DECIBEL_CANARY_DEFAULT_TARGET_NOTIONAL_USD).toBe(20);
    const sizing = calculateDecibelMinimalLiveCanaryBufferedQuantityV1({
      frozenOrderPrice: 77_228.8,
      lotSize: 0.00001,
      metadataMinimumQuantity: 0.00002,
    });
    expect(sizing).toMatchObject({
      effectiveMinimumNotionalUsd: 10,
      effectiveTargetNotionalUsd: 20,
      selectedCanaryQuantity: 0.00026,
    });
    expect(sizing.selectedCanaryNotionalUsd).toBeCloseTo(20.079488, 12);
    expect(0.00025 * 77_228.8).toBeLessThan(sizing.effectiveTargetNotionalUsd);
    expect(sizing.selectedCanaryQuantity / 0.00001).toBeCloseTo(26, 12);
  });

  it('enforces metadata quantity, authoritative venue floor and maximum bounds', () => {
    expect(
      calculateDecibelMinimalLiveCanaryBufferedQuantityV1({
        frozenOrderPrice: 100,
        lotSize: 0.01,
        metadataMinimumQuantity: 0.3,
        configuredMaximumNotionalUsd: 100,
      }).selectedCanaryQuantity,
    ).toBe(0.3);
    expect(
      calculateDecibelMinimalLiveCanaryBufferedQuantityV1({
        frozenOrderPrice: 100,
        lotSize: 0.01,
        metadataMinimumQuantity: 0.01,
        authoritativeVenueMinimumNotionalUsd: 25,
        configuredMinimumNotionalUsd: 10,
        configuredTargetNotionalUsd: 20,
        configuredMaximumNotionalUsd: 100,
      }),
    ).toMatchObject({
      effectiveMinimumNotionalUsd: 25,
      effectiveTargetNotionalUsd: 25,
      selectedCanaryQuantity: 0.25,
    });
    expect(() =>
      calculateDecibelMinimalLiveCanaryBufferedQuantityV1({
        frozenOrderPrice: 100,
        lotSize: 0.01,
        metadataMinimumQuantity: 0.01,
        configuredTargetNotionalUsd: 20,
        configuredMaximumNotionalUsd: 19,
      }),
    ).toThrow('CANARY_NOTIONAL_BOUNDS_UNSATISFIABLE');
    expect(() =>
      calculateDecibelMinimalLiveCanaryBufferedQuantityV1({
        frozenOrderPrice: 100,
        lotSize: 0.01,
        metadataMinimumQuantity: 1.01,
        configuredMaximumNotionalUsd: 100,
      }),
    ).toThrow('CANARY_NOTIONAL_BOUNDS_UNSATISFIABLE');
  });

  it('uses the frozen side-specific price for BUY and SELL sizing', () => {
    const buy = planDecibelMinimalLiveCanaryV1({
      configuration: configuration('BUY'),
      persistedConfigHash: null,
      preflight: preflight('BUY'),
      configuredTargetNotionalUsd: 20.05,
      placementTransactionCount: 0,
      venueOrderCount: 0,
    });
    const sell = planDecibelMinimalLiveCanaryV1({
      configuration: configuration('SELL'),
      persistedConfigHash: null,
      preflight: preflight('SELL'),
      configuredTargetNotionalUsd: 20.05,
      placementTransactionCount: 0,
      venueOrderCount: 0,
    });
    expect(buy.price).toBe(100);
    expect(buy.quantity).toBe(0.201);
    expect(sell.price).toBe(100.5);
    expect(sell.quantity).toBe(0.2);
  });

  it('produces deterministic config hashes and client order IDs and rejects conflicts', () => {
    const first = configuration();
    const second = configuration();
    expect(first.configHash).toBe(second.configHash);
    expect(plan().clientOrderId).toBe(plan().clientOrderId);
    expect(() =>
      planDecibelMinimalLiveCanaryV1({
        configuration: first,
        persistedConfigHash: 'conflict',
        preflight: preflight(),
        placementTransactionCount: 0,
        venueOrderCount: 0,
      }),
    ).toThrow('CANARY_CONFIG_IDENTITY_CONFLICT');
  });
});

describe('Decibel Minimal Live Canary V1 lifecycle and reconciliation', () => {
  it('rejects invalid transitions, second transactions/orders and mutation after ambiguity', () => {
    const machine = new decibel_minimal_live_canary_state_machine_v1(configuration());
    expect(() => machine.transition('PREPARED')).toThrow('CANARY_STATE_TRANSITION_INVALID');
    machine.transition('PREFLIGHT');
    machine.transition('PREFLIGHT_PASSED');
    machine.transition('PREPARED');
    machine.recordPlacementTransaction();
    machine.recordVenueOrder();
    expect(() => machine.recordPlacementTransaction()).toThrow(
      'CANARY_PLACEMENT_TRANSACTION_LIMIT_REACHED',
    );
    expect(() => machine.recordVenueOrder()).toThrow('CANARY_VENUE_ORDER_LIMIT_REACHED');
    machine.transition('AMBIGUOUS_FAIL_CLOSED');
    expect(() => machine.assertFutureMutationPermitted()).toThrow('LIVE_EXECUTION_DISABLED');
  });

  it('makes no-fill and partial-fill cancel-required, while full fill skips cancel', () => {
    const canaryPlan = plan();
    const noFill = reconcileDecibelMinimalLiveCanaryExecutionV1({
      plan: canaryPlan,
      venueOrderId: 'order-1',
      fills: [],
      authenticatedPositionMagnitude: 0,
      remainingExposureAuthoritativelyNeutralized: true,
    });
    expect(noFill).toMatchObject({
      outcome: 'NO_FILL',
      cancelRequired: true,
      terminalState: 'SAFE_NO_EXECUTION',
    });
    const partialFill = {
      tradeId: 'trade-1',
      orderId: 'order-1',
      clientOrderId: canaryPlan.clientOrderId,
      price: 100,
      quantity: canaryPlan.quantity / 2,
      authenticated: true as const,
      source: 'AUTHENTICATED_USER_TRADE_HISTORY' as const,
      makerProof: 'POST_ONLY_MAKER_CONTRACT_PROVEN' as const,
      feeAmount: null,
      feeAsset: null,
      isRebate: null,
    };
    const partial = reconcileDecibelMinimalLiveCanaryExecutionV1({
      plan: canaryPlan,
      venueOrderId: 'order-1',
      fills: [partialFill, partialFill],
      authenticatedPositionMagnitude: canaryPlan.quantity / 2,
      remainingExposureAuthoritativelyNeutralized: false,
    });
    expect(partial).toMatchObject({
      filledQuantity: canaryPlan.quantity / 2,
      cancelRequired: true,
      terminalState: 'AMBIGUOUS_FAIL_CLOSED',
    });
    const full = reconcileDecibelMinimalLiveCanaryExecutionV1({
      plan: canaryPlan,
      venueOrderId: 'order-1',
      fills: [{ ...partialFill, quantity: canaryPlan.quantity }],
      authenticatedPositionMagnitude: canaryPlan.quantity,
      remainingExposureAuthoritativelyNeutralized: false,
    });
    expect(full).toMatchObject({
      outcome: 'FULL_FILL',
      cancelRequired: false,
      terminalState: 'SAFE_FULL_EXECUTION',
      actualExternalMakerVolumeUsd: canaryPlan.notionalUsd,
    });
  });

  it('rejects public fills, identity conflicts, overfill and position mismatch', () => {
    const canaryPlan = plan();
    const fill = {
      tradeId: 'trade-1',
      orderId: 'order-1',
      clientOrderId: canaryPlan.clientOrderId,
      price: 100,
      quantity: canaryPlan.quantity / 2,
      authenticated: true as const,
      source: 'AUTHENTICATED_USER_TRADE_HISTORY' as const,
      makerProof: 'POST_ONLY_MAKER_CONTRACT_PROVEN' as const,
      feeAmount: null,
      feeAsset: null,
      isRebate: null,
    };
    const reconcile = (fills: readonly (typeof fill)[], position = canaryPlan.quantity / 2) =>
      reconcileDecibelMinimalLiveCanaryExecutionV1({
        plan: canaryPlan,
        venueOrderId: 'order-1',
        fills,
        authenticatedPositionMagnitude: position,
        remainingExposureAuthoritativelyNeutralized: false,
      });
    expect(() => reconcile([{ ...fill, source: 'PUBLIC_TRADE' as never }])).toThrow(
      'CANARY_ACTUAL_FILL_INVALID',
    );
    expect(() => reconcile([fill, { ...fill, quantity: 0.0005 }])).toThrow(
      'CANARY_FILL_IDENTITY_CONFLICT',
    );
    expect(() =>
      reconcile([{ ...fill, quantity: canaryPlan.quantity + 0.001 }], canaryPlan.quantity + 0.001),
    ).toThrow('CANARY_OVERFILL');
    expect(() => reconcile([fill], canaryPlan.quantity / 4)).toThrow('CANARY_POSITION_MISMATCH');
  });

  it('dry-run signs and mutates nothing and preserves the known venue limitation', () => {
    const result = runDecibelMinimalLiveCanaryDryRunV1({
      configuration: configuration(),
      persistedConfigHash: null,
      preflight: preflight(),
      placementTransactionCount: 0,
      venueOrderCount: 0,
    });
    expect(result).toMatchObject({
      canaryDryRunReady: true,
      minimalLiveCanarySpecReady: true,
      signingAttempted: false,
      venueMutationAttempted: false,
      liveExecutionEnabled: false,
    });
    expect(DecibelMinimalLiveCanarySpecificationAuditV1).toMatchObject({
      knownVenueContractLimitation: 'SUCCESSFUL_CANCEL_POSTCONDITION_NOT_PUBLICLY_PROVABLE',
      minimalLiveCanaryReconciliationReady: 'NO_UNDER_STRICT_PROOF_STANDARD',
      liveExecutionEnabled: false,
    });
  });
});
