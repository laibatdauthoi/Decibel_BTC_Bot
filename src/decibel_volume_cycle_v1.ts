import { createHash } from 'node:crypto';

import type { decibel_paper_fill_application_event_v1 } from './decibel_paper_fill_application_v1.js';

export const DECIBEL_VOLUME_CYCLE_VERSION_V1 = 'DECIBEL_VOLUME_CYCLE_V1' as const;

export type decibel_volume_cycle_v1 = Readonly<{
  cycleId: string;
  startedAt: Date;
  completedAt: Date | null;
  openingFillApplicationEventId: string;
  recyclingFillApplicationEventIds: readonly string[];
  openingSide: 'BUY' | 'SELL';
  grossExternalMakerVolumeUsd: number;
  durationMs: number | null;
  inventoryPeakAbsBase: number;
  endingInventoryBase: number;
  counterpartyProvenance: 'ASSUMED_EXTERNAL_PUBLIC_MARKET';
  grossTradingPnlUsd: number | null;
  knownEconomicCostsUsd: number | null;
  status: 'OPEN' | 'COMPLETED';
}>;

export type decibel_volume_cycle_tracker_v1 = Readonly<{
  version: typeof DECIBEL_VOLUME_CYCLE_VERSION_V1;
  cycles: readonly decibel_volume_cycle_v1[];
  appliedFillApplicationEventIds: readonly string[];
  achievedExternalMakerVolumeUsd: number;
}>;

function hashIdentity(prefix: string, values: readonly unknown[]): string {
  return `${prefix}_${createHash('sha256').update(JSON.stringify(values)).digest('hex')}`;
}

export function createDecibelVolumeCycleTrackerV1(): decibel_volume_cycle_tracker_v1 {
  return Object.freeze({
    version: DECIBEL_VOLUME_CYCLE_VERSION_V1,
    cycles: Object.freeze([]),
    appliedFillApplicationEventIds: Object.freeze([]),
    achievedExternalMakerVolumeUsd: 0,
  });
}

export function applyDecibelVolumeCycleFillsV1(
  previous: decibel_volume_cycle_tracker_v1,
  fills: readonly decibel_paper_fill_application_event_v1[],
): decibel_volume_cycle_tracker_v1 {
  const seen = new Set(previous.appliedFillApplicationEventIds);
  const cycles = previous.cycles.map((cycle) => ({
    ...cycle,
    startedAt: new Date(cycle.startedAt),
    completedAt: cycle.completedAt === null ? null : new Date(cycle.completedAt),
    recyclingFillApplicationEventIds: [...cycle.recyclingFillApplicationEventIds],
  }));
  let volume = previous.achievedExternalMakerVolumeUsd;
  for (const fill of [...fills].sort(
    (left, right) => left.appliedAt.getTime() - right.appliedAt.getTime(),
  )) {
    if (
      seen.has(fill.applicationEventId) ||
      fill.status !== 'APPLIED' ||
      fill.liquidityRole !== 'MAKER'
    )
      continue;
    if (fill.fillPrice === null || fill.fillQuantity === null) continue;
    seen.add(fill.applicationEventId);
    const notional = fill.fillPrice * fill.fillQuantity;
    volume += notional;
    let open: (typeof cycles)[number] | undefined;
    for (let index = cycles.length - 1; index >= 0; index -= 1) {
      const candidate = cycles[index];
      if (candidate?.status === 'OPEN') {
        open = candidate;
        break;
      }
    }
    if (open === undefined || fill.inventoryBefore === 0) {
      cycles.push({
        cycleId: hashIdentity('decibel_volume_cycle', [fill.applicationEventId]),
        startedAt: new Date(fill.appliedAt),
        completedAt: fill.inventoryAfter === 0 ? new Date(fill.appliedAt) : null,
        openingFillApplicationEventId: fill.applicationEventId,
        recyclingFillApplicationEventIds: [],
        openingSide: fill.side,
        grossExternalMakerVolumeUsd: notional,
        durationMs: fill.inventoryAfter === 0 ? 0 : null,
        inventoryPeakAbsBase: Math.max(
          Math.abs(fill.inventoryBefore),
          Math.abs(fill.inventoryAfter),
        ),
        endingInventoryBase: fill.inventoryAfter,
        counterpartyProvenance: 'ASSUMED_EXTERNAL_PUBLIC_MARKET',
        grossTradingPnlUsd: null,
        knownEconomicCostsUsd: null,
        status: fill.inventoryAfter === 0 ? 'COMPLETED' : 'OPEN',
      });
      continue;
    }
    open.recyclingFillApplicationEventIds.push(fill.applicationEventId);
    open.grossExternalMakerVolumeUsd += notional;
    open.inventoryPeakAbsBase = Math.max(
      open.inventoryPeakAbsBase,
      Math.abs(fill.inventoryBefore),
      Math.abs(fill.inventoryAfter),
    );
    open.endingInventoryBase = fill.inventoryAfter;
    if (fill.inventoryAfter === 0) {
      open.status = 'COMPLETED';
      open.completedAt = new Date(fill.appliedAt);
      open.durationMs = fill.appliedAt.getTime() - open.startedAt.getTime();
    }
  }
  for (const cycle of cycles) {
    Object.freeze(cycle.recyclingFillApplicationEventIds);
    Object.freeze(cycle);
  }
  return Object.freeze({
    version: DECIBEL_VOLUME_CYCLE_VERSION_V1,
    cycles: Object.freeze(cycles),
    appliedFillApplicationEventIds: Object.freeze([...seen].sort()),
    achievedExternalMakerVolumeUsd: volume,
  });
}
