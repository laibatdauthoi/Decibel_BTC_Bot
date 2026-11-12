import type { decibel_capacity_evidence_v1 } from '../../src/decibel_risk_capacity_v1.js';
/** Synthetic evidence only. No production source currently produces this certificate. */
export const capacityFixture: decibel_capacity_evidence_v1 = {
  source: 'AUTHENTICATED_DEPTH_AND_EMPIRICAL_EXIT_STRESS_V1',
  observedAt: 1000,
  validUntil: 20000,
  exitHorizonMs: 1000,
  horizonSource: 'TEST_MEASURED_EXIT_LATENCY',
  stressSource: 'TEST_EMPIRICAL_EXIT_WINDOW',
  adverseMoveBps: 100,
  entryFeeBps: 2,
  exitFeeBps: 5,
  exitSlippageBps: 10,
  adverseSelectionBps: 3,
  fixedExitCostUsd: 0.02,
  collateralReserveUsd: 0.1,
  liquidationReserveUsd: 0.1,
  liquidationDistanceBps: 1000,
  initialMarginRate: 0.025,
  reservedCollateralUsd: 0,
  maximumExecutableExitNotionalUsd: 1000,
  exchangeMaximumPositionNotionalUsd: 1000,
  sessionGasPaidUsd: 0.01,
};
