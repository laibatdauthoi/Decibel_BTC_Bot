import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { MICROSTRUCTURE_FEATURE_VERSION } from '../src/microstructure_repository.js';
import { buildStrategyDiagnosticReport } from '../src/strategy_diagnostic_report.js';

const Directories: string[] = [];
const scannerEnvironment = {
  STRATEGY_DIAGNOSTIC_DAYS: '30',
  OPPORTUNITY_BREAKOUT_RANGE_BARS: '2',
  OPPORTUNITY_BREAKOUT_VOLUME_RATIO: '1.2',
  OPPORTUNITY_BREAKOUT_MINIMUM_SCORE: '0',
  OPPORTUNITY_PULLBACK_LOOKBACK_BARS: '2',
  OPPORTUNITY_PULLBACK_MINIMUM_MOVE_RATIO: '0.001',
  OPPORTUNITY_PULLBACK_MINIMUM_SCORE: '100',
  OPPORTUNITY_RETEST_TOLERANCE_RATIO: '0.001',
  OPPORTUNITY_RETEST_MINIMUM_REJECTION_RATIO: '1',
  OPPORTUNITY_RETEST_MINIMUM_SCORE: '100',
  OPPORTUNITY_EXPANSION_LOOKBACK_BARS: '2',
  OPPORTUNITY_EXPANSION_VOLATILITY_RATIO: '99',
  OPPORTUNITY_EXPANSION_VOLUME_RATIO: '99',
  OPPORTUNITY_EXPANSION_MINIMUM_SCORE: '100',
};

afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
});

function makeDirectory() {
  const value = mkdtempSync(path.join(tmpdir(), 'strategy-diagnostic-'));
  Directories.push(value);
  return value;
}

function createCandles(
  databasePath: string,
  candles: Array<[number, number, number, number, number, number]>,
) {
  const DatabaseHandle = new Database(databasePath);
  DatabaseHandle.exec(`CREATE TABLE candlesticks(
    market_address TEXT NOT NULL,interval TEXT NOT NULL,timestamp_ms INTEGER NOT NULL,
    open REAL NOT NULL,high REAL NOT NULL,low REAL NOT NULL,close REAL NOT NULL,volume REAL NOT NULL,
    PRIMARY KEY(market_address,interval,timestamp_ms)) WITHOUT ROWID`);
  const insert = DatabaseHandle.prepare(
    "INSERT INTO candlesticks VALUES('market','5m',?,?,?,?,?,?)",
  );
  for (const candle of candles) insert.run(...candle);
  DatabaseHandle.close();
}

function build(root: string) {
  return buildStrategyDiagnosticReport({
    candleDatabasePath: path.join(root, 'candles.sqlite'),
    microstructureDatabasePath: path.join(root, 'missing-microstructure.sqlite'),
    paperDatabasePath: path.join(root, 'missing-paper.sqlite'),
    environment: scannerEnvironment,
  });
}

function createValidMicrostructure(databasePath: string) {
  const DatabaseHandle = new Database(databasePath);
  DatabaseHandle.exec(`CREATE TABLE microstructure_collector_sessions(
    session_id TEXT PRIMARY KEY,market_address TEXT NOT NULL,feature_version TEXT NOT NULL,
    started_at_ms INTEGER NOT NULL,stopped_at_ms INTEGER);
    CREATE TABLE microstructure_collector_session_events(
      event_id TEXT PRIMARY KEY,session_id TEXT NOT NULL,event_type TEXT NOT NULL,occurred_at_ms INTEGER NOT NULL);
    CREATE TABLE microstructure_aggregates_1s(
      market_address TEXT NOT NULL,second_timestamp_ms INTEGER NOT NULL,spread REAL,
      mid_price REAL,PRIMARY KEY(market_address,second_timestamp_ms));`);
  DatabaseHandle.prepare('INSERT INTO microstructure_collector_sessions VALUES(?,?,?,?,NULL)').run(
    'session',
    'market',
    MICROSTRUCTURE_FEATURE_VERSION,
    0,
  );
  DatabaseHandle.prepare('INSERT INTO microstructure_collector_session_events VALUES(?,?,?,?)').run(
    'event',
    'session',
    'START',
    0,
  );
  const insert = DatabaseHandle.prepare('INSERT INTO microstructure_aggregates_1s VALUES(?,?,?,?)');
  const transaction = DatabaseHandle.transaction(() => {
    for (let timestamp = 600_000; timestamp < 900_000; timestamp += 1_000)
      insert.run('market', timestamp, 1, 100);
  });
  transaction();
  DatabaseHandle.close();
}

describe('strategy diagnostic report', () => {
  it('returns a read-only empty report without creating missing databases', () => {
    const root = makeDirectory();
    const report = build(root);
    expect(report).toMatchObject({ status: 'NO_DATA', readOnly: true, totalCandlesAnalyzed: 0 });
    expect(existsSync(path.join(root, 'candles.sqlite'))).toBe(false);
    expect(existsSync(path.join(root, 'missing-paper.sqlite'))).toBe(false);
  });

  it('reports insufficient history', () => {
    const root = makeDirectory();
    createCandles(path.join(root, 'candles.sqlite'), [[0, 100, 101, 99, 100, 10]]);
    const report = build(root);
    expect(report.status).toBe('INSUFFICIENT_HISTORY');
    expect(report.noCandidateReasonCounts).toMatchObject({ INSUFFICIENT_CANDLE_HISTORY: 1 });
  });

  it('reports volatility/range failure distributions and nearest-miss evidence', () => {
    const root = makeDirectory();
    createCandles(path.join(root, 'candles.sqlite'), [
      [0, 100, 101, 99, 100, 10],
      [300_000, 100, 101, 99, 100, 10],
      [600_000, 100, 101, 99, 100.5, 10],
    ]);
    const report = build(root);
    expect(report.noCandidateReasonCounts).toMatchObject({
      VOLATILITY_OR_RANGE_FILTER_FAILED: 1,
    });
    expect(report.volatilityOrRangeDiagnostics).toMatchObject({
      sampleCount: 1,
      currentThresholds: { breakoutVolumeRatio: 1.2 },
    });
    expect(report.nearestMisses[0]).toMatchObject({ volumeRatio: 1 });
  });

  it('replays the unchanged strategy and finds a valid raw candidate', () => {
    const root = makeDirectory();
    createCandles(path.join(root, 'candles.sqlite'), [
      [0, 100, 101, 99, 100, 10],
      [300_000, 100, 101, 99, 100, 10],
      [600_000, 100, 105, 99, 104, 20],
    ]);
    createValidMicrostructure(path.join(root, 'microstructure.sqlite'));
    const report = buildStrategyDiagnosticReport({
      candleDatabasePath: path.join(root, 'candles.sqlite'),
      microstructureDatabasePath: path.join(root, 'microstructure.sqlite'),
      paperDatabasePath: path.join(root, 'missing-paper.sqlite'),
      environment: scannerEnvironment,
    });
    expect(report.candidateCountDistribution.maximum).toBe(1);
    expect(report.candidateFrequencyByRegime).toEqual({ UNKNOWN: 1 });
    expect(report.validCandidateCountDistribution.maximum).toBe(1);
    expect(report.staleOrUnavailableMicrostructureCount).toBe(0);
  });

  it('does not mutate candle or paper ledgers and leaves live action counts unchanged', () => {
    const root = makeDirectory(),
      candlePath = path.join(root, 'candles.sqlite'),
      paperPath = path.join(root, 'paper.sqlite');
    createCandles(candlePath, [[0, 100, 101, 99, 100, 10]]);
    const PaperDatabase = new Database(paperPath);
    PaperDatabase.exec(`CREATE TABLE paper_bot_evaluation_ledger(
      risk_intent_created INTEGER NOT NULL,order_created INTEGER NOT NULL)`);
    PaperDatabase.prepare('INSERT INTO paper_bot_evaluation_ledger VALUES(2,3)').run();
    PaperDatabase.close();
    const candleBefore = statSync(candlePath).size,
      paperBefore = statSync(paperPath).size;
    const report = buildStrategyDiagnosticReport({
      candleDatabasePath: candlePath,
      microstructureDatabasePath: path.join(root, 'missing.sqlite'),
      paperDatabasePath: paperPath,
      environment: scannerEnvironment,
    });
    expect(report).toMatchObject({ liveRiskIntentCount: 2, liveOrderCount: 3, readOnly: true });
    expect(statSync(candlePath).size).toBe(candleBefore);
    expect(statSync(paperPath).size).toBe(paperBefore);
    const VerifyPaper = new Database(paperPath, { readonly: true });
    expect(
      VerifyPaper.prepare('SELECT COUNT(*) AS count FROM paper_bot_evaluation_ledger').get(),
    ).toEqual({ count: 1 });
    VerifyPaper.close();
  });
});
