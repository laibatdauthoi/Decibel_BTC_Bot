import { floorDecibelQuantityToLotV1 } from './decibel_chain_units_v1.js';

export const DECIBEL_DYNAMIC_ENTRY_SIZE_V1 = 'DYNAMIC_ENTRY_SIZE_V1' as const;
/** Preferred entry = target x 3/20 (operator raised it from 1/20 on 2026-11-13). */
export const DECIBEL_ENTRY_SIZE_TARGET_NUMERATOR_V1 = 3;
export const DECIBEL_ENTRY_SIZE_TARGET_DENOMINATOR_V1 = 20;

/** Until-limit allocates the configured collateral budget across initial + 3 additions.
 * Leverage is an execution ceiling only; it never enlarges the preferred allocation.
 */
export function calculateDecibelPreferredEntrySizeUsdV1(
  input: Readonly<{
    targetTradingVolumeUsd: number;
    capitalToUseUsd: number;
    collateralFraction: number;
  }>,
): number {
  if (
    !Number.isFinite(input.targetTradingVolumeUsd) ||
    input.targetTradingVolumeUsd === 0 ||
    !Number.isFinite(input.capitalToUseUsd) ||
    input.capitalToUseUsd <= 0 ||
    !Number.isFinite(input.collateralFraction) ||
    input.collateralFraction <= 0 ||
    input.collateralFraction > 0.5
  )
    throw new Error('ENTRY_SIZE_INPUT_INVALID');
  return Math.max(
    10,
    input.targetTradingVolumeUsd > 0
      ? (input.targetTradingVolumeUsd * DECIBEL_ENTRY_SIZE_TARGET_NUMERATOR_V1) /
          DECIBEL_ENTRY_SIZE_TARGET_DENOMINATOR_V1
      : (input.capitalToUseUsd * input.collateralFraction) / 4,
  );
}

/** Pure sizing: no loss budget, PnL or projected-risk inputs. */
export function calculateDecibelEntrySizeV1(
  input: Readonly<{
    preferredEntrySizeUsd: number;
    price: number;
    minimumSize: number;
    minimumNotionalUsd: number;
    lotSize: number;
    maximumExecutableNotionalUsd: number;
  }>,
) {
  if (
    ![input.preferredEntrySizeUsd, input.price, input.minimumSize, input.lotSize].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    ![input.minimumNotionalUsd, input.maximumExecutableNotionalUsd].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  )
    throw new Error('ENTRY_SIZE_EVIDENCE_INVALID');
  const minimumQuantity = Number(
    (
      Math.ceil(
        (Math.max(input.minimumSize, input.minimumNotionalUsd / input.price) - 1e-14) /
          input.lotSize,
      ) * input.lotSize
    ).toFixed(12),
  );
  const preferredQuantity = Math.max(minimumQuantity, input.preferredEntrySizeUsd / input.price);
  const quantity = floorDecibelQuantityToLotV1(
    Math.min(preferredQuantity, input.maximumExecutableNotionalUsd / input.price),
    input.lotSize,
  );
  const available = quantity + 1e-12 >= minimumQuantity && quantity > 0;
  return Object.freeze({
    policy: DECIBEL_DYNAMIC_ENTRY_SIZE_V1,
    preferredEntrySizeUsd: input.preferredEntrySizeUsd,
    quantity: available ? quantity : 0,
    entrySizeUsd: available ? quantity * input.price : null,
    minimumExecutableNotionalUsd: minimumQuantity * input.price,
    reason: !available
      ? 'AVAILABLE_MARGIN_BELOW_VENUE_MINIMUM'
      : input.maximumExecutableNotionalUsd + 1e-9 < input.preferredEntrySizeUsd
        ? 'MARGIN_ADAPTED'
        : minimumQuantity * input.price > input.preferredEntrySizeUsd
          ? 'VENUE_MINIMUM'
          : quantity * input.price + 1e-9 < input.preferredEntrySizeUsd
            ? 'LOT_ROUNDED'
            : 'PREFERRED_ENTRY_SIZE',
  });
}
