import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from '../../src/decibel_minimal_live_canary_v1.js';

/** Synthetic test dependency; never a production recovery witness. */
export function makeDecibelActivityBaselineFixtureV1() {
  return {
    historyStartTimestamp: 0,
    fillIds: [],
    reconciledAccountFillIds: [],
    venueOrderId: 'synthetic-baseline-order',
    venueClientOrderId: 'synthetic-baseline-client',
    side: 'BUY' as const,
    marketAddress: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    quantity: 0.00001,
    checkpointBodyHashSha256: 'SYNTHETIC_TEST_BASELINE_NOT_PRODUCTION',
    resyncTimestamp: 0,
    outOfBandFillIds: [],
  };
}
