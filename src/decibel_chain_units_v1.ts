export function scaleDecimalToChainUnitsV1(value: number, decimals: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new Error('DECIBEL_CHAIN_VALUE_INVALID');
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18)
    throw new Error('DECIBEL_CHAIN_DECIMALS_INVALID');

  const fixed = value.toFixed(decimals);
  const [whole = '0', fraction = ''] = fixed.split('.');
  return BigInt(`${whole}${fraction}`);
}
