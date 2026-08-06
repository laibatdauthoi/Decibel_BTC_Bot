import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { paper_bot_journal } from '../src/paper_bot.js';
import {
  analyzeThresholdBacktest,
  buildPaperThresholdBacktestReport,
  type threshold_backtest_sample,
} from '../src/paper_threshold_backtest_report.js';

const Directories: string[] = [];
afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
});

const Thresholds = {
  breakoutVolumeRatio: 1.2,
  expansionVolatilityRatio: 1.6,
  expansionVolumeRatio: 1.2,
};

function sample(overrides: Partial<threshold_backtest_sample> = {}): threshold_backtest_sample {
  return {
    candleCloseTime: '2026-01-01T00:05:00.000Z',
    reasons: ['VOLATILITY_OR_RANGE_FILTER_FAILED'],
    volatilityRatio: 1.55,
    volumeRatio: 1.18,
    rangeDistanceRatio: 0,
    regime: 'TREND_UP',
    microstructureValid: true,
    ...overrides,
  };
}

describe('paper threshold backtest report', () => {
  it('compares fixed sensitivity sets without changing the current threshold result', () => {
    const analysis = analyzeThresholdBacktest({
      samples: [
        sample(),
        sample({ volatilityRatio: 1.7, volumeRatio: 1.3 }),
        sample({ volatilityRatio: 1.45, volumeRatio: 1.1, rangeDistanceRatio: 0.0004 }),
      ],
      thresholds: Thresholds,
    });
    expect(analysis.sensitivityResults.find((result) => result.name === 'CURRENT')).toMatchObject({
      passCount: 1,
      incrementalPassCount: 0,
    });
    expect(
      analysis.sensitivityResults.find((result) => result.name === 'RATIOS_MINUS_5_PERCENT'),
    ).toMatchObject({ passCount: 2, incrementalPassCount: 1 });
    expect(analysis.currentThresholds).toEqual(Thresholds);
  });

  it('reports conservative false-positive proxies and never invents fills', () => {
    const analysis = analyzeThresholdBacktest({
      samples: [
        sample({ regime: 'UNKNOWN' }),
        sample({ microstructureValid: null }),
        sample({ volatilityRatio: 1.7, volumeRatio: 1.3 }),
      ],
      thresholds: Thresholds,
      actualSelectedCount: 4,
      actualOrderCount: 2,
      actualFillCount: 1,
    });
    const relaxed = analysis.sensitivityResults.find(
      (result) => result.name === 'RATIOS_MINUS_5_PERCENT',
    );
    expect(relaxed?.falsePositiveRiskProxy).toMatchObject({ count: 2 });
    expect(analysis.actualHistoricalLifecycle).toEqual({
      selectedCandidateCount: 4,
      simulatedOrderCount: 2,
      simulatedFillCount: 1,
    });
    expect(analysis.hypotheticalExecution).toMatchObject({
      status: 'NOT_MODELABLE_FROM_THRESHOLD_DIAGNOSTICS',
      orderCount: null,
      fillCount: null,
    });
  });

  it('requires complete, sufficient evidence before threshold review', () => {
    expect(
      analyzeThresholdBacktest({
        samples: Array.from({ length: 99 }, () => sample()),
        thresholds: Thresholds,
      }).recommendation,
    ).toBe('OBSERVE_MORE');
    expect(
      analyzeThresholdBacktest({
        samples: Array.from({ length: 100 }, () =>
          sample({ volatilityRatio: 1.55, volumeRatio: 1.18 }),
        ),
        thresholds: Thresholds,
      }).recommendation,
    ).toBe('REVIEW_THRESHOLD_CHANGE');
    expect(
      analyzeThresholdBacktest({
        samples: Array.from({ length: 100 }, () =>
          sample({ volatilityRatio: 1.7, volumeRatio: 1.3 }),
        ),
        thresholds: Thresholds,
      }).recommendation,
    ).toBe('KEEP_THRESHOLDS');
  });

  it('opens production-layout databases read-only and handles missing data', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'paper-threshold-backtest-'));
    Directories.push(root);
    const databasePath = path.join(root, 'paper.sqlite');
    expect(
      buildPaperThresholdBacktestReport({
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
        breakoutRangeDistanceRatio: -0.0001,
        volatilityRatio: 1.55,
        volumeRatio: 1.18,
        regime: 'TREND_UP',
        microstructureWindows: [
          { seconds: 15, status: 'VALID' },
          { seconds: 60, status: 'VALID' },
          { seconds: 300, status: 'VALID' },
        ],
        thresholds: Thresholds,
      }),
      '2026-01-01T00:05:00.000Z',
    );
    DatabaseHandle.close();
    const report = buildPaperThresholdBacktestReport({
      paperDatabasePath: databasePath,
      mode: 'PAPER_SIMULATION',
    });
    expect(report).toMatchObject({
      readOnly: true,
      status: 'COMPLETE',
      analysis: { sampleCount: 1, currentThresholds: Thresholds },
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
