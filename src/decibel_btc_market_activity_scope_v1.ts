import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from './decibel_minimal_live_canary_v1.js';

export type decibel_market_identity_fields_v1 = Readonly<{
  market?: unknown;
  market_address?: unknown;
  market_id?: unknown;
}>;

export type decibel_market_identity_diagnostic_v1 = Readonly<{
  market: string | null;
  marketAddress: string | null;
  marketId: string | null;
}>;

export function normalizeDecibelMarketAddressV1(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]+$/.test(normalized)) return normalized;
  const digits = normalized.slice(2);
  return digits.length <= 64 ? `0x${digits.padStart(64, '0')}` : normalized;
}

export function getDecibelMarketAddressV1(row: decibel_market_identity_fields_v1): string | null {
  return (
    normalizeDecibelMarketAddressV1(row.market) ??
    normalizeDecibelMarketAddressV1(row.market_address) ??
    normalizeDecibelMarketAddressV1(row.market_id)
  );
}

export function isDecibelBTCMarketActivityV1(row: decibel_market_identity_fields_v1): boolean {
  return (
    getDecibelMarketAddressV1(row) ===
    normalizeDecibelMarketAddressV1(DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1)
  );
}

export function filterDecibelBTCMarketActivityV1<T extends decibel_market_identity_fields_v1>(
  rows: readonly T[],
): readonly T[] {
  return rows.filter(isDecibelBTCMarketActivityV1);
}

export function isActiveDecibelTwapV1(
  row: decibel_market_identity_fields_v1 & Readonly<{ is_active?: unknown; status?: unknown }>,
): boolean {
  if (row.is_active === false) return false;
  const status = typeof row.status === 'string' ? row.status.trim().toUpperCase() : undefined;
  return (
    status === undefined || !['CANCELLED', 'CANCELED', 'COMPLETED', 'INACTIVE'].includes(status)
  );
}

export function getDecibelMarketIdentityDiagnosticsV1(
  rows: readonly decibel_market_identity_fields_v1[],
): readonly decibel_market_identity_diagnostic_v1[] {
  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        market: typeof row.market === 'string' ? row.market : null,
        marketAddress: typeof row.market_address === 'string' ? row.market_address : null,
        marketId: typeof row.market_id === 'string' ? row.market_id : null,
      }),
    ),
  );
}
