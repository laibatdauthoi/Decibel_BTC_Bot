import { readDecibelOverviewLifetimeTotalsV1 } from './decibel_lifetime_totals_v1.js';

/** UI-only read model; never opens or mutates the trading/session stores for writing.
 * Counts started sessions since the last metrics reset, archived ones included. */
export function readDecibelOverviewSessionCountV1(path: string): number | null {
  return readDecibelOverviewLifetimeTotalsV1(path)?.sessionCount ?? null;
}

export function calculateDecibelOverviewUTCVolumeV1(
  fills: readonly Readonly<{
    fillId: string;
    quantity: number;
    price: number;
    observedAt: number;
  }>[],
  journalAvailable: boolean,
  now: number,
  /** Metrics reset time: fills before it do not count. */
  sinceMs: number | null = null,
): Readonly<{ utcDayStart: number; volumeUsd: number | null }> {
  if (!Number.isFinite(now) || now < 0) throw new Error('OVERVIEW_TIME_INVALID');
  const utcDayStart = Math.floor(now / 86400000) * 86400000;
  const unavailable = { utcDayStart, volumeUsd: null };
  if (!journalAvailable) return unavailable;
  const Seen = new Map<string, string>();
  let volumeUsd = 0;
  for (const fill of fills) {
    if (!Number.isFinite(fill.observedAt) || fill.observedAt > now) return unavailable;
    if (fill.observedAt < Math.max(utcDayStart, sinceMs ?? 0)) continue;
    if (
      !fill.fillId ||
      !Number.isFinite(fill.quantity) ||
      fill.quantity <= 0 ||
      !Number.isFinite(fill.price) ||
      fill.price <= 0
    )
      return unavailable;
    const signature = JSON.stringify([fill.quantity, fill.price, fill.observedAt]);
    const prior = Seen.get(fill.fillId);
    if (prior !== undefined) {
      if (prior !== signature) return unavailable;
      continue;
    }
    Seen.set(fill.fillId, signature);
    volumeUsd += fill.quantity * fill.price;
  }
  return { utcDayStart, volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : null };
}
