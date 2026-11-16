import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_types_v1.js';

/** Receipt collection can outlive account freshness. Assemble the projection
 * after that await using the latest published account and market components. */
export async function readDecibelSessionCapacityProjectionV1(
  input: Readonly<{
    readSnapshot(): Promise<decibel_production_live_snapshot_v1>;
    protectiveOnly?: boolean;
    readPracticalInputs?(): decibel_production_live_snapshot_v1['practicalCapacityInputs'] | null;
    readProduction?(): Promise<
      NonNullable<decibel_production_live_snapshot_v1['capacityProduction']>
    >;
  }>,
): Promise<decibel_production_live_snapshot_v1> {
  const report = input.protectiveOnly ? undefined : await input.readProduction?.();
  const candidate = await input.readSnapshot();
  const practical = input.readPracticalInputs?.();
  const clean = { ...candidate };
  delete clean.practicalCapacityInputs;
  if (report !== undefined || input.protectiveOnly) delete clean.capacityEvidence;
  if (input.protectiveOnly) delete clean.capacityProduction;
  return Object.freeze({
    ...clean,
    ...(practical ? { practicalCapacityInputs: practical } : {}),
    ...(report === undefined
      ? {}
      : {
          capacityProduction: report,
          ...(report.certificate ? { capacityEvidence: report.certificate } : {}),
        }),
  });
}

/** Existing inventory is the reduction bound; an entry allocation is not one. */
export function getDecibelPositionReductionNotionalLimitV1(
  snapshot: decibel_production_live_snapshot_v1,
): number {
  const venueLimit = snapshot.practicalCapacityInputs?.venueMaximumOrderNotionalUsd;
  const position = Math.abs(snapshot.input.actualInventoryBase);
  const price = Math.max(snapshot.input.book.bestBid, snapshot.input.book.bestAsk);
  if (
    !Number.isFinite(position) ||
    !Number.isFinite(price) ||
    price <= 0 ||
    (venueLimit !== undefined && (!Number.isFinite(venueLimit) || venueLimit < 0))
  )
    throw new Error('AUTHENTICATED_REDUCTION_BOUND_INVALID');
  return Math.min(position * price, venueLimit ?? position * price);
}
