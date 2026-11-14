import { DECIBEL_CAPACITY_POLICY_V1 } from './decibel_capacity_policy_v1.js';
import {
  DECIBEL_DCA_MINIMUM_ADDITION_FRACTION_V1,
  DECIBEL_DCA_TRIGGER_BPS_V1,
} from './decibel_dca_v1.js';

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

/**
 * Smallest Max Loss whose stress-loss capacity can still admit the smallest DCA addition
 * (a third of the position) at the DCA trigger, using the same policy floors. A lower
 * bound, like the entry floor.
 *
 * - 1 addition: the entry is `DECIBEL_DCA_TRIGGER_BPS_V1` in loss plus one entry fee; the
 *   capacity covers the entry plus a third of it.
 * - 2 additions: the first addition is a full entry at the trigger, so the second trigger
 *   is 1.5 x the trigger below the entry; the two lots are then 1.5 x and 0.5 x the trigger
 *   in loss plus two entry fees, and the capacity covers both lots plus a third of them.
 */
export function calculateSettingsMinimumMaxLossForDCAUsdV1(
  entrySizeUsd: number | null,
  additions: 1 | 2 = 1,
): number | null {
  if (entrySizeUsd === null || !Number.isFinite(entrySizeUsd) || entrySizeUsd <= 0) return null;
  const Policy = DECIBEL_CAPACITY_POLICY_V1;
  const lossBps =
    Policy.adverseMoveFloorBps +
    2 * Policy.feePerLegBps +
    Policy.maximumBookSlippageBps +
    Policy.adverseSelectionBps;
  const lots = additions; // entry-sized lots held when the last addition is admitted
  const capacityBps = lots * (1 + DECIBEL_DCA_MINIMUM_ADDITION_FRACTION_V1) * lossBps;
  const unrealizedBps =
    additions === 1
      ? DECIBEL_DCA_TRIGGER_BPS_V1 + Policy.feePerLegBps
      : 2 * DECIBEL_DCA_TRIGGER_BPS_V1 + 2 * Policy.feePerLegBps;
  return (
    (entrySizeUsd * (capacityBps + unrealizedBps)) /
    10_000 /
    (1 - Policy.transactionLossReserveFraction)
  );
}

/** True for a valid positive Max Loss draft that cannot fund even the smallest DCA addition. */
export function isSettingsMaxLossBelowDCAFloorV1(
  maxLoss: string,
  entrySizeUsd: number | null,
  additions: 1 | 2 = 1,
): boolean {
  const minimum = calculateSettingsMinimumMaxLossForDCAUsdV1(entrySizeUsd, additions);
  const value = Number(maxLoss);
  return (
    minimum !== null &&
    maxLoss.trim() !== '' &&
    Number.isFinite(value) &&
    value > 0 &&
    value + 1e-9 < minimum
  );
}
