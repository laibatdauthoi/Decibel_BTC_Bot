import { describe, expect, it } from 'vitest';

import {
  DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
  DecibelMinimalLiveCanarySpecificationAuditV1,
  authorizeDecibelMinimalLiveCanaryMutationV1,
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
      'CANARY_MINIMUM_QUANTITY_REQUIRED',
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
      quantity: 0.0005,
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
      authenticatedPositionMagnitude: 0.0005,
      remainingExposureAuthoritativelyNeutralized: false,
    });
    expect(partial).toMatchObject({
      filledQuantity: 0.0005,
      cancelRequired: true,
      terminalState: 'AMBIGUOUS_FAIL_CLOSED',
    });
    const full = reconcileDecibelMinimalLiveCanaryExecutionV1({
      plan: canaryPlan,
      venueOrderId: 'order-1',
      fills: [{ ...partialFill, quantity: 0.001 }],
      authenticatedPositionMagnitude: 0.001,
      remainingExposureAuthoritativelyNeutralized: false,
    });
    expect(full).toMatchObject({
      outcome: 'FULL_FILL',
      cancelRequired: false,
      terminalState: 'SAFE_FULL_EXECUTION',
      actualExternalMakerVolumeUsd: 0.1,
    });
  });

  it('rejects public fills, identity conflicts, overfill and position mismatch', () => {
    const canaryPlan = plan();
    const fill = {
      tradeId: 'trade-1',
      orderId: 'order-1',
      clientOrderId: canaryPlan.clientOrderId,
      price: 100,
      quantity: 0.001,
      authenticated: true as const,
      source: 'AUTHENTICATED_USER_TRADE_HISTORY' as const,
      makerProof: 'POST_ONLY_MAKER_CONTRACT_PROVEN' as const,
      feeAmount: null,
      feeAsset: null,
      isRebate: null,
    };
    const reconcile = (fills: readonly (typeof fill)[], position = 0.001) =>
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
    expect(() => reconcile([{ ...fill, quantity: 0.002 }], 0.002)).toThrow('CANARY_OVERFILL');
    expect(() => reconcile([fill], 0.0005)).toThrow('CANARY_POSITION_MISMATCH');
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
