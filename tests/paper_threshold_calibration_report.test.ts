import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { paper_bot_journal } from '../src/paper_bot.js';
import {
  analyzePersistedThresholds,
  buildPaperThresholdCalibrationReport,
} from '../src/paper_threshold_calibration_report.js';

const Directories: string[] = [];
afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
});

function sample(index: number, overrides: Record<string, unknown> = {}) {
  return {
    candleCloseTime: new Date(index * 300_000).toISOString(),
    primaryReason: 'VOLATILITY_OR_RANGE_FILTER_FAILED',
    reasons: ['VOLATILITY_OR_RANGE_FILTER_FAILED'],
    volatilityRatio: 1 + index / 100,
    volumeRatio: 1.1,
    rangeDistanceRatio: 0.002,
    breakoutVolumeRatio: 1.2,
    expansionVolatilityRatio: 1.6,
    expansionVolumeRatio: 1.2,
    breakoutVolumeDeficit: 0.1,
    expansionVolatilityDeficit: Math.max(0, 0.6 - index / 100),
    expansionVolumeDeficit: 0.1,
    ...overrides,
  };
}

describe('paper threshold calibration report', () => {
  it('calculates exact persisted-ratio percentiles and failed subconditions', () => {
    const analysis = analyzePersistedThresholds([
      sample(0, { volatilityRatio: 1, volumeRatio: 0.9, rangeDistanceRatio: 0.004 }),
      sample(1, { volatilityRatio: 1.2, volumeRatio: 1, rangeDistanceRatio: 0.003 }),
      sample(2, { volatilityRatio: 1.4, volumeRatio: 1.1, rangeDistanceRatio: 0.002 }),
      sample(3, { volatilityRatio: 1.5, volumeRatio: 1.15, rangeDistanceRatio: 0.001 }),
    ]);
    expect(analysis.observedRatios.volatilityRatio).toEqual({
      count: 4,
      p50: 1.2,
      p75: 1.4,
      p90: 1.5,
      p95: 1.5,
    });
    expect(analysis.subconditionFailureCounts).toMatchObject({
      RANGE_BREAK_FAILED: 4,
      BREAKOUT_VOLUME_FAILED: 4,
      EXPANSION_VOLUME_FAILED: 4,
      EXPANSION_VOLATILITY_FAILED: 4,
    });
    expect(analysis.recommendation).toBe('OBSERVE_MORE');
  });

  it('separates unchanged passes from marginal misses and flags review-only evidence', () => {
    const samples = Array.from({ length: 100 }, (_, index) =>
      sample(index, {
        volatilityRatio: 1.5,
        volumeRatio: 1.1,
        rangeDistanceRatio: 0.0005,
        expansionVolatilityDeficit: 0.1,
      }),
    );
    const analysis = analyzePersistedThresholds(samples);
    expect(analysis.passEstimate).toMatchObject({
      unchangedThresholdPassCount: 0,
      marginalMissCount: 100,
      marginalDefinition: { ratioThresholdTolerance: 0.1, rangeBoundaryToleranceBps: 10 },
    });
    expect(analysis.recommendation).toBe('THRESHOLDS_TOO_STRICT_TO_REVIEW');

    const unchanged = analyzePersistedThresholds([
      ...samples.slice(0, 99),
      sample(101, { volatilityRatio: 1.7, volumeRatio: 1.3, rangeDistanceRatio: 0 }),
    ]);
    expect(unchanged.passEstimate.unchangedThresholdPassCount).toBe(1);
  });

  it('returns BACKTEST_REQUIRED when sufficient evidence is not predominantly marginal', () => {
    const analysis = analyzePersistedThresholds(
      Array.from({ length: 100 }, (_, index) => sample(index)),
    );
    expect(analysis.recommendation).toBe('BACKTEST_REQUIRED');
  });

  it('is read-only for missing and populated databases', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'paper-calibration-'));
    Directories.push(root);
    const databasePath = path.join(root, 'paper.sqlite');
    expect(
      buildPaperThresholdCalibrationReport({
        paperDatabasePath: databasePath,
        mode: 'OBSERVE_ONLY',
      }).status,
    ).toBe('NO_DATA');
    expect(existsSync(databasePath)).toBe(false);

    const Journal = new paper_bot_journal(databasePath);
    Journal.close();
    const DatabaseHandle = new Database(databasePath);
    DatabaseHandle.prepare(
      'INSERT INTO paper_bot_candidate_diagnostics VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      'evaluation',
      'session',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:05:00.000Z',
      'VOLATILITY_OR_RANGE_FILTER_FAILED',
      '["VOLATILITY_OR_RANGE_FILTER_FAILED"]',
      JSON.stringify({
        currentClose: 100,
        volatilityRatio: 1.5,
        volumeRatio: 1.1,
        thresholds: {
          breakoutVolumeRatio: 1.2,
          expansionVolatilityRatio: 1.6,
          expansionVolumeRatio: 1.2,
        },
        nearestMiss: {
          rangeBreakDistance: 0.05,
          breakoutVolumeDeficit: 0.1,
          expansionVolatilityDeficit: 0.1,
          expansionVolumeDeficit: 0.1,
        },
      }),
      '2026-01-01T00:05:00.000Z',
    );
    DatabaseHandle.close();
    const report = buildPaperThresholdCalibrationReport({
      paperDatabasePath: databasePath,
      mode: 'PAPER_SIMULATION',
    });
    expect(report).toMatchObject({
      readOnly: true,
      status: 'COMPLETE',
      analysis: {
        currentThresholds: {
          breakoutVolumeRatio: 1.2,
          expansionVolatilityRatio: 1.6,
          expansionVolumeRatio: 1.2,
        },
        nearMissDistributions: {
          expansionVolatilityDeficit: { count: 1, p50: 0.1 },
        },
      },
    });
    const Check = new Database(databasePath, { readonly: true });
    expect(
      (
        Check.prepare('SELECT COUNT(*) AS count FROM paper_bot_candidate_diagnostics').get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
    Check.close();
  });
});
