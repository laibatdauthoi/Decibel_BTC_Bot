export function scaleDecimalToChainUnitsV1(value: number, decimals: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new Error('DECIBEL_CHAIN_VALUE_INVALID');
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18)
    throw new Error('DECIBEL_CHAIN_DECIMALS_INVALID');

  const fixed = value.toFixed(decimals);
  const [whole = '0', fraction = ''] = fixed.split('.');
  return BigInt(`${whole}${fraction}`);
}

// Quantity arithmetic uses integer decimal units; USD/price budgets are rounded
// down to lots only at their boundary. Twelve decimals remove binary tails while
// retaining four guard decimals beyond BTC's eight on-chain size decimals.
export function floorDecibelQuantityToLotV1(value: number, lotSize: number): number {
  const units = scaleDecimalToChainUnitsV1(value, 12);
  const lot = scaleDecimalToChainUnitsV1(lotSize, 12);
  if (lot <= 0n) throw new Error('DECIBEL_QUANTITY_LOT_INVALID');
  return Number((units / lot) * lot) / 1e12;
}

export function getDecibelQuantityUnitsV1(value: number, decimals = 8): bigint {
  const units = scaleDecimalToChainUnitsV1(value, decimals);
  if (Math.abs(Number(units) / 10 ** decimals - value) > 1e-12)
    throw new Error('DECIBEL_QUANTITY_NOT_CHAIN_ALIGNED');
  return units;
}

export function subtractDecibelQuantitiesV1(
  position: number,
  quantities: readonly number[],
): number {
  const remaining = quantities.reduce(
    (units, quantity) => units - getDecibelQuantityUnitsV1(quantity),
    getDecibelQuantityUnitsV1(position),
  );
  return Number(remaining > 0n ? remaining : 0n) / 1e8;
}
