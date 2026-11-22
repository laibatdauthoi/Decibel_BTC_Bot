import { describe, expect, it } from 'vitest';
import {
  getDecibelTelemetryActivityKeyV1,
  mergeDecibelTelemetryActivityV1,
  omitDecibelTelemetryActivityV1,
} from '../src/decibel_telemetry_activity_delta_v1.js';

const snapshot = (generatedAt: number, fills: readonly string[] = ['f1']) => ({
  generatedAt,
  runtime: { state: 'RUNNING' },
  fills,
  intents: ['i1'],
  events: ['e1'],
});

describe('Telemetry activity delta', () => {
  it('keys the activity lists so unchanged lists can be left out', () => {
    expect(getDecibelTelemetryActivityKeyV1(snapshot(1))).toBe(
      getDecibelTelemetryActivityKeyV1(snapshot(2)),
    );
    expect(getDecibelTelemetryActivityKeyV1(snapshot(1))).not.toBe(
      getDecibelTelemetryActivityKeyV1(snapshot(1, ['f1', 'f2'])),
    );
    const delta = omitDecibelTelemetryActivityV1(snapshot(2));
    expect(delta).toEqual({
      generatedAt: 2,
      runtime: { state: 'RUNNING' },
      activityUnchanged: true,
    });
  });

  it('restores the lists from the previous snapshot and passes full snapshots through', () => {
    const first = snapshot(1);
    const delta = omitDecibelTelemetryActivityV1(snapshot(2));
    expect(mergeDecibelTelemetryActivityV1(first, delta)).toEqual({ ...first, generatedAt: 2 });
    const full = snapshot(3, ['f1', 'f2']);
    expect(mergeDecibelTelemetryActivityV1(first, full)).toBe(full);
    // A delta without a previous full snapshot is ignored rather than shown with no lists.
    expect(mergeDecibelTelemetryActivityV1(null, delta)).toBeNull();
  });
});
