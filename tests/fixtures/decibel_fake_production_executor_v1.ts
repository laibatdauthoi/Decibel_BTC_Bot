import type { DecibelProductionExecutionExecutorV1 } from '../../src/decibel_production_executor_handoff_v1.js';
export function createDecibelProductionExecutorV1(): DecibelProductionExecutionExecutorV1 {
  return {
    placePostOnlyLimit: () =>
      Promise.resolve({ outcome: 'PLACE_ACKNOWLEDGED', venueOrderId: 'fake-venue-order' }),
    cancelExactOrder: () => Promise.resolve({ outcome: 'CANCEL_CONFIRMED' }),
  };
}
