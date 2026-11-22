/**
 * Telemetry activity delta (2026-11-22).
 *
 * The dashboard stream sends a snapshot every few seconds. Its fills, intents and events lists
 * are most of the payload (about 99 KB of 115 KB) and rarely change, so a broadcast whose lists
 * equal the previous broadcast's leaves them out and says so (`activityUnchanged`). The
 * dashboard keeps the lists it already has. A new connection always gets a full snapshot, and a
 * delta that arrives without one is ignored, so a client never shows partial lists.
 */

export const DECIBEL_TELEMETRY_ACTIVITY_FIELDS_V1 = ['fills', 'intents', 'events'] as const;

type activity_field_v1 = (typeof DECIBEL_TELEMETRY_ACTIVITY_FIELDS_V1)[number];
type with_activity_v1 = Readonly<Record<activity_field_v1, unknown>>;

export type decibel_telemetry_activity_delta_v1<T extends with_activity_v1> = Omit<
  T,
  activity_field_v1
> & { activityUnchanged: true };

/** Identity of the activity lists: equal keys mean identical lists. */
export function getDecibelTelemetryActivityKeyV1(telemetry: with_activity_v1): string {
  return JSON.stringify(DECIBEL_TELEMETRY_ACTIVITY_FIELDS_V1.map((field) => telemetry[field]));
}

/** The snapshot without its activity lists, marked as unchanged. */
export function omitDecibelTelemetryActivityV1<T extends with_activity_v1>(
  telemetry: T,
): decibel_telemetry_activity_delta_v1<T> {
  const delta: Record<string, unknown> = { ...telemetry, activityUnchanged: true };
  for (const field of DECIBEL_TELEMETRY_ACTIVITY_FIELDS_V1) delete delta[field];
  // The fields removed above are exactly the ones the delta type omits.
  return delta as decibel_telemetry_activity_delta_v1<T>;
}

/**
 * Restores the lists of a delta from the previous snapshot. A full snapshot passes through;
 * a delta without a previous snapshot returns null (wait for the next full one).
 */
export function mergeDecibelTelemetryActivityV1<T extends with_activity_v1>(
  previous: T | null,
  next: T | decibel_telemetry_activity_delta_v1<T>,
): T | null {
  if (!('activityUnchanged' in next) || next.activityUnchanged !== true) return next as T;
  if (previous === null) return null;
  const merged: Record<string, unknown> = {
    ...next,
    fills: previous.fills,
    intents: previous.intents,
    events: previous.events,
  };
  delete merged.activityUnchanged;
  // A delta plus the three lists it omitted is a full snapshot again.
  return merged as T;
}
