import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

/** UI-only read model; never opens or mutates the trading/session stores for writing. */
export function readDecibelOverviewSessionCountV1(path: string): number | null {
  if (!existsSync(path)) return null;
  try {
    const Reader = new Database(path, { readonly: true, fileMustExist: true });
    try {
      const row: unknown = Reader.prepare(
        'SELECT COUNT(*) AS count FROM production_sessions_v1 WHERE started_at IS NOT NULL',
      ).get();
      if (typeof row !== 'object' || row === null || !('count' in row)) return null;
      return typeof row.count === 'number' && Number.isSafeInteger(row.count) && row.count >= 0
        ? row.count
        : null;
    } finally {
      Reader.close();
    }
  } catch {
    return null;
  }
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
): Readonly<{ utcDayStart: number; volumeUsd: number | null }> {
  if (!Number.isFinite(now) || now < 0) throw new Error('OVERVIEW_TIME_INVALID');
  const utcDayStart = Math.floor(now / 86400000) * 86400000;
  const unavailable = { utcDayStart, volumeUsd: null };
  if (!journalAvailable) return unavailable;
  const Seen = new Map<string, string>();
  let volumeUsd = 0;
  for (const fill of fills) {
    if (!Number.isFinite(fill.observedAt) || fill.observedAt > now) return unavailable;
    if (fill.observedAt < utcDayStart) continue;
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
