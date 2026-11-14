/**
 * The Decibel BTC/USD perpetual market and Move value decoders used by live reads
 * (split from the retired minimal live canary modules on 2026-11-14).
 */
export const DECIBEL_BTC_USD_MARKET_ADDRESS_V1 =
  '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861' as const;

/** A Move address, either a plain hex string or `{ inner: '0x…' }`. */
export function decodeDecibelMoveAddressV1(value: unknown): string | null {
  const candidate =
    typeof value === 'string'
      ? value
      : value !== null &&
          typeof value === 'object' &&
          Object.keys(value).length === 1 &&
          'inner' in value &&
          typeof value.inner === 'string'
        ? value.inner
        : null;
  return candidate !== null && /^0x[0-9a-f]+$/i.test(candidate) ? candidate : null;
}

/** A Move `Option<String>`, either a plain string or `{ vec: [] | [string] }`. */
export function decodeDecibelMoveOptionalStringV1(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.keys(value).length !== 1 ||
    !('vec' in value) ||
    !Array.isArray(value.vec)
  )
    return null;
  if (value.vec.length === 0) return null;
  return value.vec.length === 1 && typeof value.vec[0] === 'string' ? value.vec[0] : null;
}
