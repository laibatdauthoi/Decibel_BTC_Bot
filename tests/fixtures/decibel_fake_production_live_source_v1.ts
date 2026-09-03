import { createDecibelActualFillLedgerV1 } from '../../src/decibel_actual_fill_truth_v1.js';
import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from '../../src/decibel_minimal_live_canary_v1.js';
import type {
  DecibelProductionLiveStateSourceV1,
  decibel_production_live_snapshot_v1,
} from '../../src/decibel_production_live_orchestrator_v1.js';

export function createDecibelProductionLiveStateSourceV1(): DecibelProductionLiveStateSourceV1 {
  const readAuthenticatedSnapshot = (): Promise<decibel_production_live_snapshot_v1> => {
    const now = Date.now();
    return Promise.resolve({
      sourceStateHash: 'fake-production-live-source-state-v1',
      minimumNotionalUsd: 0.01,
      maximumNotionalUsd: 1,
      input: {
        sessionId: 'fake-production-live-source-session-v1',
        strategyConfigId: 'DECIBEL_MARKET_MAKER_V1_PASSIVE_VOLUME_RECYCLING_V1',
        configuredSubaccount: 'fake-subaccount',
        authenticatedSubaccount: 'fake-subaccount',
        configuredNetwork: 'mainnet',
        observedNetwork: 'mainnet',
        now,
        market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
        metadata: {
          marketAddress: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
          symbol: 'BTC/USD',
          tickSize: 0.1,
          lotSize: 0.001,
          minimumSize: 0.001,
          mode: 'Open',
          observedAt: now,
        },
        book: { bestBid: 100, bestAsk: 100.2, observedAt: now },
        maxBboAgeMs: 5_000,
        actualInventoryBase: 0,
        inventoryDirectionProven: true,
        openOrders: [],
        activeTwapCount: 0,
        activeTpSlCount: 0,
        activeBulkOrderCount: 0,
        manualOrDelegatedActivityCount: 0,
        unresolvedExecutionPlanCount: 0,
        persistenceAvailable: true,
        targetExternalMakerVolumeUsd: null,
        actualFillLedger: createDecibelActualFillLedgerV1([]),
      },
    });
  };
  return Object.freeze({
    readAuthenticatedSnapshot,
    reconcileIntent: () => Promise.resolve('ORDER_NOT_FOUND'),
  });
}
