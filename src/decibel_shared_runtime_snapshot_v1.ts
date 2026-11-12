import type {
  DecibelProductionLiveStateSourceV1,
  decibel_production_live_snapshot_v1,
} from './decibel_production_live_orchestrator_v1.js';
import type { decibel_runtime_supervisor_snapshot_v1 } from './decibel_runtime_supervisor_v1.js';

export type decibel_shared_runtime_snapshot_payload_v1 = Readonly<{
  snapshot: decibel_production_live_snapshot_v1 | null;
  supervisor: decibel_runtime_supervisor_snapshot_v1;
}>;

type shared_snapshot_fetcher_v1 = () => Promise<decibel_shared_runtime_snapshot_payload_v1>;

function reviveSnapshot(
  snapshot: decibel_production_live_snapshot_v1,
): decibel_production_live_snapshot_v1 {
  const fills = snapshot.input.actualFillLedger.fills.map((fill) => ({
    ...fill,
    receivedAt: new Date(fill.receivedAt),
    venueTimestamp: fill.venueTimestamp === null ? null : new Date(fill.venueTimestamp),
  }));
  const applications = snapshot.input.actualFillLedger.applications.map((application) => ({
    ...application,
    appliedAt: new Date(application.appliedAt),
  }));
  const cycles = snapshot.input.actualFillLedger.cycles.map((cycle) => ({
    ...cycle,
    startedAt: new Date(cycle.startedAt),
    completedAt: cycle.completedAt === null ? null : new Date(cycle.completedAt),
  }));
  return Object.freeze({
    ...snapshot,
    input: Object.freeze({
      ...snapshot.input,
      actualFillLedger: Object.freeze({
        ...snapshot.input.actualFillLedger,
        fills: Object.freeze(fills),
        applications: Object.freeze(applications),
        cycles: Object.freeze(cycles),
      }),
    }),
  });
}

export function createDecibelSharedRuntimeSnapshotSourceV1(
  fetchSnapshot: shared_snapshot_fetcher_v1,
  maximumAgeMs: number,
  now: () => number = Date.now,
): DecibelProductionLiveStateSourceV1 {
  if (!Number.isSafeInteger(maximumAgeMs) || maximumAgeMs <= 0)
    throw new Error('SHARED_RUNTIME_SNAPSHOT_MAXIMUM_AGE_INVALID');
  let InFlight: Promise<decibel_production_live_snapshot_v1> | null = null;
  let LastFresh: decibel_production_live_snapshot_v1 | null = null;
  const read = async (): Promise<decibel_production_live_snapshot_v1> => {
    if (InFlight !== null) return InFlight;
    const Pending = (async () => {
      try {
        const payload = await fetchSnapshot();
        if (!payload.supervisor.ready)
          throw new Error(payload.supervisor.blocker ?? 'RUNTIME_SUPERVISOR_NOT_READY');
        if (payload.snapshot === null) throw new Error('SHARED_RUNTIME_SNAPSHOT_UNAVAILABLE');
        const snapshot = reviveSnapshot(payload.snapshot);
        const observedAt = Math.min(snapshot.input.now, snapshot.input.book.observedAt);
        const ageMs = now() - observedAt;
        if (ageMs < 0 || ageMs > maximumAgeMs) throw new Error('PRODUCTION_LIVE_SOURCE_BOOK_STALE');
        LastFresh = snapshot;
        return snapshot;
      } catch (error) {
        if (LastFresh !== null) {
          const ageMs = now() - Math.min(LastFresh.input.now, LastFresh.input.book.observedAt);
          if (ageMs >= 0 && ageMs <= maximumAgeMs) return LastFresh;
        }
        throw error;
      }
    })();
    InFlight = Pending;
    try {
      return await Pending;
    } finally {
      if (InFlight === Pending) InFlight = null;
    }
  };
  const Source: DecibelProductionLiveStateSourceV1 = {
    readAuthenticatedSnapshot: read,
    readAuthenticatedSnapshotAfterMutation: read,
    reconcileIntent: (_intentId, snapshot, venueOrderId, identity) => {
      const matched = snapshot.input.openOrders.some(
        (order) =>
          (venueOrderId !== undefined && order.venueOrderId === venueOrderId) ||
          (identity !== undefined && order.clientOrderId === identity.clientOrderId),
      );
      return matched
        ? Promise.resolve('ORDER_OPEN' as const)
        : Promise.reject(new Error('PRODUCTION_RECONCILIATION_AMBIGUOUS'));
    },
    readAuthenticatedPosition: async () => {
      const snapshot = await read();
      return Object.freeze({
        positionBase: snapshot.input.actualInventoryBase,
        observedAt: snapshot.input.now,
        source: 'AUTHENTICATED_POSITION_READ' as const,
      });
    },
  };
  return Object.freeze(Source);
}

export function createDecibelSharedRuntimeHTTPFetcherV1(
  url: string,
  timeoutMs: number,
): shared_snapshot_fetcher_v1 {
  return async () => {
    const Controller = new AbortController();
    const Timeout = setTimeout(() => Controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: Controller.signal });
      if (!response.ok) throw new Error(`SHARED_RUNTIME_HTTP_${response.status}`);
      return (await response.json()) as decibel_shared_runtime_snapshot_payload_v1;
    } finally {
      clearTimeout(Timeout);
    }
  };
}
