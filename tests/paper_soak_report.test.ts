import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { paper_bot_journal } from '../src/paper_bot.js';
import { buildPaperSoakReport, classifyPaperSoakReadiness } from '../src/paper_soak_report.js';

const Directories: string[] = [];
afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
});

function createDirectory() {
  const value = mkdtempSync(path.join(tmpdir(), 'paper-soak-'));
  Directories.push(value);
  return value;
}

function build(input: { paperPath: string; root: string }) {
  return buildPaperSoakReport({
    paperDatabasePath: input.paperPath,
    candleDatabasePath: path.join(input.root, 'missing-candles.sqlite'),
    microstructureDatabasePath: path.join(input.root, 'missing-micro.sqlite'),
    mode: 'PAPER_SIMULATION',
    environment: { PAPER_SOAK_MINIMUM_MODERN_EVALUATIONS: '1' },
    nowMs: Date.parse('2026-01-02T00:00:00.000Z'),
  });
}

describe('paper soak report', () => {
  it('reports empty state without creating or mutating databases', () => {
    const root = createDirectory(),
      paperPath = path.join(root, 'missing-paper.sqlite');
    const report = build({ paperPath, root });
    expect(report).toMatchObject({
      readOnly: true,
      evidence: { modernEvaluationCount: 0, legacyEvaluationCount: 0 },
      liveSafety: { liveRiskIntentCount: 0, liveOrderCount: 0, valid: true },
      readiness: { verdict: 'INSUFFICIENT_EVIDENCE', issues: [] },
    });
    expect(() => new Database(paperPath, { readonly: true, fileMustExist: true })).toThrow();
  });

  it('separates modern diagnostics from legacy evaluations and reports lifecycle outcomes', () => {
    const root = createDirectory(),
      paperPath = path.join(root, 'paper.sqlite');
    const Journal = new paper_bot_journal(paperPath);
    Journal.close();
    const DatabaseHandle = new Database(paperPath);
    const insertEvaluation = DatabaseHandle.prepare(
      'INSERT INTO live_candle_evaluations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    insertEvaluation.run(
      'legacy',
      'market',
      '5m',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:05:00.000Z',
      '2026-01-01T00:05:00.000Z',
      'OBSERVING',
      'OBSERVE_ONLY',
      'EVALUATED',
      null,
      0,
      null,
      0,
      0,
      'LIVE_WEBSOCKET',
    );
    insertEvaluation.run(
      'modern',
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
    DatabaseHandle.prepare(
      'INSERT INTO paper_bot_candidate_diagnostics VALUES(?,?,?,?,?,?,?,?)',
    ).run(
      'modern',
      'session',
      '2026-01-01T00:05:00.000Z',
      '2026-01-01T00:10:00.000Z',
      'CANDIDATE_FORMED_BUT_INVALIDATED',
      '["CANDIDATE_FORMED_BUT_INVALIDATED"]',
      '{}',
      '2026-01-01T00:10:00.000Z',
    );
    DatabaseHandle.close();

    const report = build({ paperPath, root });
    expect(report.evidence).toMatchObject({ modernEvaluationCount: 1, legacyEvaluationCount: 1 });
    expect(report.candidateLifecycle).toMatchObject({
      total: 1,
      byOutcome: { CANDIDATE_GENERATED_NO_SELECTION: 1 },
    });
    expect(report.readiness.verdict).toBe('PAPER_RUNTIME_HEALTHY_COLLECT_MORE');
  });

  it('fails readiness for live-action evidence and ledger inconsistencies', () => {
    const root = createDirectory(),
      paperPath = path.join(root, 'paper.sqlite');
    const Journal = new paper_bot_journal(paperPath);
    Journal.close();
    const DatabaseHandle = new Database(paperPath);
    DatabaseHandle.prepare(
      `INSERT INTO paper_bot_sessions(session_id,started_at,mode,version)
       VALUES('session','2026-01-01T00:00:00.000Z','PAPER_SIMULATION',1)`,
    ).run();
    DatabaseHandle.prepare(
      `INSERT INTO paper_bot_evaluation_ledger
      (idempotency_key,session_id,candle_open_time,candle_close_time,symbol,timeframe,evaluation_started_at,
       risk_intent_created,order_created,account_snapshot_before_json,status)
      VALUES('evaluation','session','2026-01-01T00:00:00.000Z','2026-01-01T00:05:00.000Z','BTC/USD','5m',
       '2026-01-01T00:05:00.000Z',1,1,'{}','COMPLETED')`,
    ).run();
    DatabaseHandle.prepare(
      `INSERT INTO paper_bot_simulated_executions VALUES
      ('orphan-fill','orphan-evaluation','BUY','1','1','100','1','0','FILLED',
       '2026-01-01T00:05:00.000Z','2026-01-01T00:05:00.000Z','orphan-fill')`,
    ).run();
    DatabaseHandle.close();
    const report = build({ paperPath, root });
    expect(report.paperLedger).toMatchObject({
      fillWithoutApprovedRisk: 1,
      fillWithoutOrder: 1,
      fillWithoutAccountUpdate: 1,
      consistent: false,
    });
    expect(report.readiness).toMatchObject({ verdict: 'PAPER_RUNTIME_HAS_ISSUES' });
    expect(report.readiness.issues).toEqual(
      expect.arrayContaining([
        'LIVE_RISK_INTENTS_PRESENT',
        'LIVE_ORDERS_PRESENT',
        'PAPER_LEDGER_INCONSISTENT',
      ]),
    );
  });

  it('classifies evidence thresholds deterministically', () => {
    expect(
      classifyPaperSoakReadiness({
        modernEvaluations: 99,
        minimumModernEvaluations: 100,
        issues: [],
      }),
    ).toBe('INSUFFICIENT_EVIDENCE');
    expect(
      classifyPaperSoakReadiness({
        modernEvaluations: 100,
        minimumModernEvaluations: 100,
        issues: [],
      }),
    ).toBe('PAPER_RUNTIME_HEALTHY_COLLECT_MORE');
    expect(
      classifyPaperSoakReadiness({
        modernEvaluations: 1_000,
        minimumModernEvaluations: 100,
        issues: ['RUNTIME_ERRORS_PRESENT'],
      }),
    ).toBe('PAPER_RUNTIME_HAS_ISSUES');
  });
});
