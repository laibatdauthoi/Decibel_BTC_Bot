/** Full snapshots replace display state; replayed or older frames never accumulate. */
export function selectNewerSnapshotV1<T extends { generatedAt: number }>(
  current: T | null,
  next: T,
): T | null {
  if (!Number.isFinite(next.generatedAt) || next.generatedAt < 0) return current;
  return current === null || next.generatedAt > current.generatedAt ? next : current;
}
