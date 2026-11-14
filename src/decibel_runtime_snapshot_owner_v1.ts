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

/**
 * Fields the orchestrator derives during its cycle (candle rules, range, gas reserve). The
 * web runner's snapshot is rebuilt from the latest components on every BBO frame, so an
 * orchestrator snapshot usually loses the "newest" comparison above; its cycle fields must
 * still replace the runner's, or the final submission check and telemetry keep using those
 * of an old cycle (live 2026-11-14 12:45-13:10: a stale ENTRY_REQUIRES_NEW_LOW blocked every
 * BUY while each 5-minute candle made a lower low).
 */
export function carryDecibelCycleDerivedFieldsV1(
  current: decibel_production_live_snapshot_v1,
  cycle: decibel_production_live_snapshot_v1,
): decibel_production_live_snapshot_v1 {
  if (current === cycle) return current;
  return Object.freeze({
    ...current,
    ...(cycle.priceRangeBps === undefined ? {} : { priceRangeBps: cycle.priceRangeBps }),
    ...(cycle.entryCandleBlockers === undefined
      ? {}
      : { entryCandleBlockers: cycle.entryCandleBlockers }),
    ...(cycle.executionGasBlocker === undefined
      ? {}
      : { executionGasBlocker: cycle.executionGasBlocker }),
    ...(cycle.marketStructure === undefined ? {} : { marketStructure: cycle.marketStructure }),
  });
}

/** Select the newest snapshot, then carry the latest orchestrator cycle fields into it. */
export function publishDecibelRuntimeSnapshotV1(
  current: decibel_production_live_snapshot_v1 | null,
  candidate: decibel_production_live_snapshot_v1 | null,
  candidateOwnerRevision: number,
  activeOwnerRevision: number,
): decibel_production_live_snapshot_v1 | null {
  const selected = selectNewestDecibelRuntimeSnapshotV1(
    current,
    candidate,
    candidateOwnerRevision,
    activeOwnerRevision,
  );
  return selected === null ||
    candidate === null ||
    selected === candidate ||
    candidateOwnerRevision !== activeOwnerRevision
    ? selected
    : carryDecibelCycleDerivedFieldsV1(selected, candidate);
}
