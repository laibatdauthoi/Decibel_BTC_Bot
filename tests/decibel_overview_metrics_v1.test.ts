import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import {
  calculateDecibelOverviewUTCVolumeV1,
  readDecibelOverviewSessionCountV1,
} from '../src/decibel_overview_metrics_v1.js';

describe('Overview read-only historical metrics', () => {
  it('counts all started sessions beyond the paginated 100-row history, not rejected starts', () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-overview-count-'));
    const path = join(root, 'sessions.sqlite');
    const Writer = new Database(path);
    try {
      Writer.exec('CREATE TABLE production_sessions_v1 (started_at INTEGER)');
      const insert = Writer.prepare('INSERT INTO production_sessions_v1 VALUES (?)');
      for (let i = 0; i < 125; i++) insert.run(1000 + i);
      insert.run(null);
      expect(readDecibelOverviewSessionCountV1(path)).toBe(125);
      expect(Writer.prepare('SELECT COUNT(*) AS count FROM production_sessions_v1').get()).toEqual({
        count: 126,
      });
    } finally {
      Writer.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('does not create a missing database or fabricate zero sessions', () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-overview-missing-'));
    try {
      const path = join(root, 'missing.sqlite');
      expect(readDecibelOverviewSessionCountV1(path)).toBeNull();
      expect(existsSync(path)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('uses UTC midnight, includes the boundary, and sums real USD fills once', () => {
    const now = Date.parse('2026-11-08T00:30:00Z');
    const start = Date.parse('2026-11-08T00:00:00Z');
    const fill = { fillId: 'fill-a', quantity: 0.001, price: 100000, observedAt: start };
    const fills = [
      fill,
      fill,
      { ...fill, fillId: 'previous-day', observedAt: start - 1 },
      { ...fill, fillId: 'fill-b', quantity: 0.002, observedAt: now },
    ];
    expect(calculateDecibelOverviewUTCVolumeV1(fills, true, now)).toEqual({
      utcDayStart: start,
      volumeUsd: 300,
    });
    expect(calculateDecibelOverviewUTCVolumeV1(fills, true, start + 86400000).volumeUsd).toBe(0);
    expect(calculateDecibelOverviewUTCVolumeV1(fills, true, now).volumeUsd).toBe(300);
  });
  it('distinguishes verified no-fill zero from missing/corrupt evidence', () => {
    const now = Date.parse('2026-11-08T12:00:00Z');
    expect(calculateDecibelOverviewUTCVolumeV1([], true, now).volumeUsd).toBe(0);
    expect(calculateDecibelOverviewUTCVolumeV1([], false, now).volumeUsd).toBeNull();
    const fill = { fillId: 'id', quantity: 0.001, price: 100000, observedAt: now };
    expect(
      calculateDecibelOverviewUTCVolumeV1([fill, { ...fill, quantity: 0.002 }], true, now)
        .volumeUsd,
    ).toBeNull();
    expect(
      calculateDecibelOverviewUTCVolumeV1([{ ...fill, quantity: NaN }], true, now).volumeUsd,
    ).toBeNull();
    expect(() => calculateDecibelOverviewUTCVolumeV1([], true, NaN)).toThrow(
      'OVERVIEW_TIME_INVALID',
    );
  });
});
