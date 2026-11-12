// Dependency-free so the dashboard can share the exact policy without importing runtime modules.
// Estimates, never authenticated facts. 100 bps = 1% exit-window move floor;
// use twice the observed range when larger. Reserve 10% collateral, 5% of
// Max Loss for transaction costs, 10 bps per fee leg and 8 bps adverse selection.
export const DECIBEL_CAPACITY_POLICY_V1 = Object.freeze({
  modeledExitHorizonMs: 30_000,
  adverseMoveFloorBps: 100,
  observedRangeMultiplier: 2,
  feePerLegBps: 10,
  adverseSelectionBps: 8,
  collateralReserveFraction: 0.1,
  transactionLossReserveFraction: 0.05,
  maximumBookSlippageBps: 25,
});
