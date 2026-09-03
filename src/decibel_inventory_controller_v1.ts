import { createHash } from 'node:crypto';

import { DECIBEL_MARKET_MAKER_V1 } from './decibel_market_state_v1.js';

export const DECIBEL_INVENTORY_CONTROLLER_VERSION_V1 = 'DECIBEL_INVENTORY_CONTROLLER_V1' as const;

export type decibel_inventory_zone_v1 = 'NEUTRAL' | 'NORMAL' | 'SOFT_LIMIT' | 'HARD_LIMIT';

export type decibel_inventory_input_v1 = Readonly<{
  signedBaseInventory: number;
  neutralTargetBase: number;
  accountStateId?: string;
  observedAt?: Date;
}>;

export type decibel_inventory_configuration_v1 = Readonly<{
  softInventoryLimitBase: number;
  hardInventoryLimitBase: number;
  maximumPriceSkewBps: number;
  minimumInventoryIncreasingSizeMultiplier: number;
}>;

export type decibel_inventory_assessment_v1 = Readonly<{
  strategyId: typeof DECIBEL_MARKET_MAKER_V1;
  controllerVersion: typeof DECIBEL_INVENTORY_CONTROLLER_VERSION_V1;
  configurationId: string;
  accountStateId: string | null;
  observedAt: Date | null;
  signedBaseInventory: number;
  neutralTargetBase: number;
  inventoryDeviation: number;
  softInventoryLimitBase: number;
  hardInventoryLimitBase: number;
  rawInventoryPressure: number;
  inventoryPressure: number;
  absoluteInventoryPressure: number;
  inventoryZone: decibel_inventory_zone_v1;
  inventoryPriceSkewBps: number;
  reservationPriceAdjustmentBps: number;
  increasingSideSizeMultiplier: number;
  bidSizeMultiplier: number;
  askSizeMultiplier: number;
  allowBidInventoryIncrease: boolean;
  allowAskInventoryIncrease: boolean;
}>;

function validateConfiguration(configuration: decibel_inventory_configuration_v1): void {
  const values = [
    configuration.softInventoryLimitBase,
    configuration.hardInventoryLimitBase,
    configuration.maximumPriceSkewBps,
    configuration.minimumInventoryIncreasingSizeMultiplier,
  ];
  if (
    values.some((value) => !Number.isFinite(value)) ||
    configuration.softInventoryLimitBase <= 0 ||
    configuration.hardInventoryLimitBase <= configuration.softInventoryLimitBase ||
    configuration.maximumPriceSkewBps < 0 ||
    configuration.minimumInventoryIncreasingSizeMultiplier < 0 ||
    configuration.minimumInventoryIncreasingSizeMultiplier > 1
  )
    throw new Error('DECIBEL_INVENTORY_CONTROLLER_INVALID_CONFIGURATION');
}

function validateInput(input: decibel_inventory_input_v1): void {
  if (!Number.isFinite(input.signedBaseInventory) || !Number.isFinite(input.neutralTargetBase))
    throw new Error('DECIBEL_INVENTORY_CONTROLLER_INVALID_INPUT');
  if (input.accountStateId !== undefined && input.accountStateId.length === 0)
    throw new Error('DECIBEL_INVENTORY_CONTROLLER_INVALID_INPUT');
  if (input.observedAt !== undefined && !Number.isSafeInteger(input.observedAt.getTime()))
    throw new Error('DECIBEL_INVENTORY_CONTROLLER_INVALID_INPUT');
}

function getConfigurationId(configuration: decibel_inventory_configuration_v1): string {
  const canonical = JSON.stringify([
    configuration.softInventoryLimitBase,
    configuration.hardInventoryLimitBase,
    configuration.maximumPriceSkewBps,
    configuration.minimumInventoryIncreasingSizeMultiplier,
  ]);
  return `decibel_inventory_configuration_${createHash('sha256').update(canonical).digest('hex')}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getInventoryZone(
  inventoryDeviation: number,
  configuration: decibel_inventory_configuration_v1,
): decibel_inventory_zone_v1 {
  const absoluteDeviation = Math.abs(inventoryDeviation);
  if (inventoryDeviation === 0) return 'NEUTRAL';
  if (absoluteDeviation < configuration.softInventoryLimitBase) return 'NORMAL';
  if (absoluteDeviation < configuration.hardInventoryLimitBase) return 'SOFT_LIMIT';
  return 'HARD_LIMIT';
}

export function calculateDecibelInventoryConstraintsV1(
  input: decibel_inventory_input_v1,
  configuration: decibel_inventory_configuration_v1,
): decibel_inventory_assessment_v1 {
  validateInput(input);
  validateConfiguration(configuration);
  const inventoryDeviation = input.signedBaseInventory - input.neutralTargetBase;
  const rawInventoryPressure = inventoryDeviation / configuration.hardInventoryLimitBase;
  const inventoryPressure = clamp(rawInventoryPressure, -1, 1);
  const absoluteInventoryPressure = Math.abs(inventoryPressure);
  const inventoryPriceSkewBps = inventoryPressure * configuration.maximumPriceSkewBps;
  const reservationPriceAdjustmentBps = -inventoryPriceSkewBps;
  const increasingSideSizeMultiplier = clamp(
    1 - absoluteInventoryPressure * (1 - configuration.minimumInventoryIncreasingSizeMultiplier),
    configuration.minimumInventoryIncreasingSizeMultiplier,
    1,
  );
  const longPressure = inventoryDeviation > 0;
  const shortPressure = inventoryDeviation < 0;
  const hardLimit = Math.abs(inventoryDeviation) >= configuration.hardInventoryLimitBase;

  return Object.freeze({
    strategyId: DECIBEL_MARKET_MAKER_V1,
    controllerVersion: DECIBEL_INVENTORY_CONTROLLER_VERSION_V1,
    configurationId: getConfigurationId(configuration),
    accountStateId: input.accountStateId ?? null,
    observedAt: input.observedAt === undefined ? null : new Date(input.observedAt.getTime()),
    signedBaseInventory: input.signedBaseInventory,
    neutralTargetBase: input.neutralTargetBase,
    inventoryDeviation,
    softInventoryLimitBase: configuration.softInventoryLimitBase,
    hardInventoryLimitBase: configuration.hardInventoryLimitBase,
    rawInventoryPressure,
    inventoryPressure,
    absoluteInventoryPressure,
    inventoryZone: getInventoryZone(inventoryDeviation, configuration),
    inventoryPriceSkewBps,
    reservationPriceAdjustmentBps,
    increasingSideSizeMultiplier,
    bidSizeMultiplier: longPressure ? increasingSideSizeMultiplier : 1,
    askSizeMultiplier: shortPressure ? increasingSideSizeMultiplier : 1,
    allowBidInventoryIncrease: !(hardLimit && longPressure),
    allowAskInventoryIncrease: !(hardLimit && shortPressure),
  });
}
