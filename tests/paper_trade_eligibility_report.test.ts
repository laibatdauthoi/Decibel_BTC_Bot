import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { paper_bot_journal } from '../src/paper_bot.js';
import { buildPaperTradeEligibilityReport } from '../src/paper_trade_eligibility_report.js';

const Directories: string[] = [];
afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
});

function createDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), 'paper-eligibility-'));
  Directories.push(directory);
  return directory;
}

describe('paper trade eligibility report', () => {
  it('reports missing data without creating a database', () => {
    const root = createDirectory(),
      databasePath = path.join(root, 'missing.sqlite');
    const report = buildPaperTradeEligibilityReport({
      paperDatabasePath: databasePath,
      mode: 'OBSERVE_ONLY',
    });
    expect(report).toMatchObject({
      readOnly: true,
      status: 'NO_DATA',
      stages: { evaluated: 0, generatedCandidates: 0, selected: 0, filled: 0 },
      explanation: 'NO_COMPLETED_EVALUATIONS',
    });
    expect(existsSync(databasePath)).toBe(false);
  });

  it('explains generated-but-unselected candidates and volatility near misses', () => {
    const root = createDirectory(),
      databasePath = path.join(root, 'paper.sqlite');
    const Journal = new paper_bot_journal(databasePath);
    Journal.close();
    const DatabaseHandle = new Database(databasePath);
    const insertEvaluation = DatabaseHandle.prepare(
      'INSERT INTO live_candle_evaluations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    insertEvaluation.run(
      'evaluation-1',
      'market',
      '5m',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:05:00.000Z',
      '2026-01-01T00:05:00.000Z',
      'PAPER_ACTIVE',
      'PAPER_SIMULATION',
      'EVALUATED',
      null,
      0,
      null,
      0,
      0,
      'LIVE_WEBSOCKET',
    );
    insertEvaluation.run(
      'evaluation-2',
      'market',
      '5m',
      '2026-01-01T00:05:00.000Z',
      '2026-01-01T00:10:00.000Z',
      '2026-01-01T00:10:00.000Z',
      'PAPER_ACTIVE',
      'PAPER_SIMULATION',
      'EVALUATED',
      null,
      1,
      null,
      0,
      0,
      'LIVE_WEBSOCKET',
    );
    const evidence = JSON.stringify({
      regime: 'RANGE',
      volatilityRatio: 1.5,
      volumeRatio: 1.1,
      thresholds: { expansionVolatilityRatio: 1.6, expansionVolumeRatio: 1.2 },
      nearestMiss: { expansionVolatilityDeficit: 0.1, expansionVolumeDeficit: 0.1 },
    });
    DatabaseHandle.prepare(
      'INSERT INTO paper_bot_candidate_diagnostics VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      'evaluation-1',
      'session',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:05:00.000Z',
      'VOLATILITY_OR_RANGE_FILTER_FAILED',
      '["VOLATILITY_OR_RANGE_FILTER_FAILED"]',
      evidence,
      '2026-01-01T00:05:00.000Z',
    );
    DatabaseHandle.prepare(
      'INSERT INTO paper_bot_candidate_diagnostics VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      'evaluation-2',
      'session',
      '2026-01-01T00:05:00.000Z',
      '2026-01-01T00:10:00.000Z',
      'CANDIDATE_FORMED_BUT_INVALIDATED',
      '["CANDIDATE_FORMED_BUT_INVALIDATED","VOLATILITY_OR_RANGE_FILTER_FAILED"]',
      evidence,
      '2026-01-01T00:10:00.000Z',
    );
    const rowsBefore = (
      DatabaseHandle.prepare('SELECT COUNT(*) AS count FROM live_candle_evaluations').get() as {
        count: number;
      }
    ).count;
    DatabaseHandle.close();

    const report = buildPaperTradeEligibilityReport({
      paperDatabasePath: databasePath,
      mode: 'PAPER_SIMULATION',
    });
    expect(report.stages).toMatchObject({
      evaluated: 2,
      generatedEvaluations: 1,
      generatedCandidates: 1,
      selected: 0,
      riskApproved: 0,
      ordered: 0,
      filled: 0,
    });
    expect(report.explanation).toBe('GENERATED_CANDIDATES_NOT_SELECTED');
    expect(report.noCandidateReasons).toMatchObject({
      VOLATILITY_OR_RANGE_FILTER_FAILED: 2,
      CANDIDATE_FORMED_BUT_INVALIDATED: 1,
    });
    expect(report.volatilityOrRangeFailure).toMatchObject({
      count: 2,
      averageVolatilityRatio: 1.5,
      averageVolumeRatio: 1.1,
    });
    expect(report.nearMissCandidates).toHaveLength(2);
    const Check = new Database(databasePath, { readonly: true });
    expect(
      (
        Check.prepare('SELECT COUNT(*) AS count FROM live_candle_evaluations').get() as {
          count: number;
        }
      ).count,
    ).toBe(rowsBefore);
    Check.close();
  });

  it('reports selected, approved, ordered, and filled stages with zero live actions', () => {
    const root = createDirectory(),
      databasePath = path.join(root, 'paper.sqlite');
    const Journal = new paper_bot_journal(databasePath);
    Journal.close();
    const DatabaseHandle = new Database(databasePath);
    DatabaseHandle.prepare(
      'INSERT INTO live_candle_evaluations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'live-evaluation',
      'market',
      '5m',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:05:00.000Z',
      '2026-01-01T00:05:00.000Z',
      'PAPER_ACTIVE',
      'PAPER_SIMULATION',
      'EVALUATED',
      null,
      1,
      'candidate',
      0,
      0,
      'LIVE_WEBSOCKET',
    );
    DatabaseHandle.prepare(
      `INSERT INTO paper_bot_risk_decisions VALUES('risk','durable-evaluation','session','2026-01-01T00:05:00.000Z','OPEN','BUY','1','100',1,NULL,'1','{}','{}','2026-01-01T00:05:00.000Z','risk','COMPLETED')`,
    ).run();
    DatabaseHandle.prepare(
      `INSERT INTO paper_bot_simulated_order_events(simulated_order_id,evaluation_id,event_type,occurred_at,idempotency_key) VALUES('order','durable-evaluation','FILLED','2026-01-01T00:05:00.000Z','order-event')`,
    ).run();
    DatabaseHandle.prepare(
      `INSERT INTO paper_bot_simulated_executions VALUES('order','durable-evaluation','BUY','1','1','100','0','0','FILLED','2026-01-01T00:05:00.000Z','2026-01-01T00:05:00.000Z','fill')`,
    ).run();
    DatabaseHandle.close();
    const report = buildPaperTradeEligibilityReport({
      paperDatabasePath: databasePath,
      mode: 'PAPER_SIMULATION',
    });
    expect(report.stages).toMatchObject({
      generatedCandidates: 1,
      selected: 1,
      riskApproved: 1,
      ordered: 1,
      filled: 1,
    });
    expect(report.explanation).toBe('SIMULATED_FILLS_PRESENT');
    expect(report.liveRiskIntentCount).toBe(0);
    expect(report.liveOrderCount).toBe(0);
  });
});
