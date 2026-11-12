import { DECIBEL_CAPACITY_POLICY_V1 } from './decibel_capacity_policy_v1.js';

/**
 * Smallest Max Loss whose stress-loss capacity can admit one entry of `entrySizeUsd`
 * at session start (zero PnL, zero gas), using only the policy floors of
 * `DECIBEL_CAPACITY_POLICY_V1`. It mirrors the runtime admission rule
 * `entry <= (maxLoss - fixedExitCost) / (lossBps / 10000)` with
 * `fixedExitCost = maxLoss * transactionLossReserveFraction`.
 *
 * This is a lower bound: observed fees, adverse selection, transaction costs or a
 * recent range above the floors raise the real requirement. Below it, entry is
 * always RISK_BLOCKED. Returns null when the entry size is unknown or invalid.
 */
export function calculateSettingsMinimumMaxLossUsdV1(entrySizeUsd: number | null): number | null {
  if (entrySizeUsd === null || !Number.isFinite(entrySizeUsd) || entrySizeUsd <= 0) return null;
  const Policy = DECIBEL_CAPACITY_POLICY_V1;
  const lossBps =
    Policy.adverseMoveFloorBps +
    2 * Policy.feePerLegBps +
    Policy.maximumBookSlippageBps +
    Policy.adverseSelectionBps;
  return (entrySizeUsd * lossBps) / 10_000 / (1 - Policy.transactionLossReserveFraction);
}

/** True only for a valid positive Max Loss draft that cannot admit the projected entry. */
export function isSettingsMaxLossBelowEntryFloorV1(
  maxLoss: string,
  entrySizeUsd: number | null,
): boolean {
  const minimum = calculateSettingsMinimumMaxLossUsdV1(entrySizeUsd);
  const value = Number(maxLoss);
  return (
    minimum !== null &&
    maxLoss.trim() !== '' &&
    Number.isFinite(value) &&
    value > 0 &&
    value + 1e-9 < minimum
  );
}

/** Display the floor rounded up to whole cents, so entering the shown value clears the warning. */
export function formatSettingsMinimumMaxLossUsdV1(minimumUsd: number): string {
  return `$${(Math.ceil(minimumUsd * 100 - 1e-9) / 100).toFixed(2)}`;
}
