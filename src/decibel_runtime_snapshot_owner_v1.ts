import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_orchestrator_v1.js';

export function selectNewestDecibelRuntimeSnapshotV1(
  current: decibel_production_live_snapshot_v1 | null,
  candidate: decibel_production_live_snapshot_v1 | null,
  candidateOwnerRevision: number,
  activeOwnerRevision: number,
): decibel_production_live_snapshot_v1 | null {
  if (candidate === null || candidateOwnerRevision !== activeOwnerRevision) return current;
  if (current !== null) {
    const prior = current.venueReadWindow;
    const next = candidate.venueReadWindow;
    // Decision assembly clocks advance with market/derived publications. They
    // must not outrank the original authenticated observation of venue facts.
    if (prior && next) {
      if (next.account.startedAt < prior.account.startedAt) return current;
      if (prior.history && next.history && next.history.startedAt < prior.history.startedAt)
        return current;
      if (
        next.account.startedAt > prior.account.startedAt ||
        (prior.history && next.history && next.history.startedAt > prior.history.startedAt)
      )
        return candidate;
    }
    if (candidate.input.now < current.input.now) return current;
  }
  return candidate;
}
