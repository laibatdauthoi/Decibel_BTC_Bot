import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { buildMicrostructureDiagnosticReport } from '../src/microstructure_diagnostic_report.js';
import { MICROSTRUCTURE_FEATURE_VERSION } from '../src/microstructure_repository.js';

const Directories: string[] = [];
afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
});

function createFixture(input: {
  compatible?: boolean;
  tradeCount?: number;
  missingBook?: boolean;
  missingPrice?: boolean;
  staleBook?: boolean;
  stalePrice?: boolean;
}) {
  const root = mkdtempSync(path.join(tmpdir(), 'microstructure-diagnostic-'));
  Directories.push(root);
  const databasePath = path.join(root, 'microstructure.sqlite');
  const DatabaseHandle = new Database(databasePath);
  DatabaseHandle.exec(`CREATE TABLE microstructure_collector_sessions(
    session_id TEXT PRIMARY KEY,market_address TEXT NOT NULL,started_at_ms INTEGER NOT NULL,
    stopped_at_ms INTEGER,feature_version TEXT NOT NULL);
    CREATE TABLE microstructure_collector_session_events(
      event_id INTEGER PRIMARY KEY,session_id TEXT NOT NULL,event_type TEXT NOT NULL,occurred_at_ms INTEGER NOT NULL);
    CREATE TABLE microstructure_aggregates_1s(
      market_address TEXT NOT NULL,second_timestamp_ms INTEGER NOT NULL,trade_count INTEGER NOT NULL,
      spread REAL,mid_price REAL,book_age_ms INTEGER,market_price_age_ms INTEGER,
      PRIMARY KEY(market_address,second_timestamp_ms));
    CREATE TABLE microstructure_trade_participants(
      row_key TEXT PRIMARY KEY,market_address TEXT NOT NULL,received_at_ms INTEGER NOT NULL,ingestion_source TEXT NOT NULL);
    CREATE TABLE order_book_snapshots(
      market_address TEXT NOT NULL,received_at_ms INTEGER NOT NULL);
    CREATE TABLE market_price_snapshots(
      market_address TEXT NOT NULL,received_at_ms INTEGER NOT NULL);`);
  DatabaseHandle.prepare('INSERT INTO microstructure_collector_sessions VALUES(?,?,?,?,?)').run(
    'session',
    'market',
    0,
    null,
    input.compatible === false ? 'LEGACY_UNKNOWN' : MICROSTRUCTURE_FEATURE_VERSION,
  );
  DatabaseHandle.prepare('INSERT INTO microstructure_collector_session_events VALUES(?,?,?,?)').run(
    1,
    'session',
    'START',
    0,
  );
  const Insert = DatabaseHandle.prepare(
    'INSERT INTO microstructure_aggregates_1s VALUES(?,?,?,?,?,?,?)',
  );
  DatabaseHandle.transaction(() => {
    for (let timestamp = 300_000; timestamp < 600_000; timestamp += 1_000)
      Insert.run(
        'market',
        timestamp,
        input.tradeCount ?? 1,
        input.missingBook ? null : 1,
        input.missingPrice ? null : 100,
        input.missingBook ? null : input.staleBook ? 3_000 : 100,
        input.missingPrice ? null : input.stalePrice ? 6_000 : 100,
      );
  })();
  DatabaseHandle.prepare('INSERT INTO order_book_snapshots VALUES(?,?)').run('market', 599_900);
  DatabaseHandle.prepare('INSERT INTO market_price_snapshots VALUES(?,?)').run('market', 599_900);
  if ((input.tradeCount ?? 1) > 0)
    DatabaseHandle.prepare('INSERT INTO microstructure_trade_participants VALUES(?,?,?,?)').run(
      'row',
      'market',
      599_900,
      'WEBSOCKET',
    );
  DatabaseHandle.close();
  return databasePath;
}

function build(databasePath: string, decisionTimeMs = 600_000) {
  return buildMicrostructureDiagnosticReport({
    databasePath,
    marketAddress: 'market',
    rawCandidateDecisionTimesMs: [decisionTimeMs],
    nowMs: 600_000,
  });
}

describe('microstructure diagnostic report', () => {
  it('accepts a compatible, complete candidate window and reports fresh streams', () => {
    const report = build(createFixture({}));
    expect(report.collectorCompatibleNow).toBe(true);
    expect(report.candidateCoverage).toMatchObject({ candidateCount: 1, allWindowsValid: 1 });
    expect(report.currentCandidateReadiness.valid).toBe(true);
    expect(report.freshness).toMatchObject({
      trades: { status: 'FRESH' },
      books: { status: 'FRESH' },
      marketPrice: { status: 'FRESH' },
    });
  });

  it('distinguishes a legitimate no-trade window from missing book or price data', () => {
    const noTrades = build(createFixture({ tradeCount: 0 }));
    expect(noTrades.candidateCoverage.allWindowsValid).toBe(1);
    expect(noTrades.reasonCounts).toMatchObject({ NO_TRADES_OBSERVED: 3 });
    expect(noTrades.freshness.trades.status).toBe('MISSING');

    const missing = build(createFixture({ missingBook: true, missingPrice: true }));
    expect(missing.candidateCoverage.allWindowsValid).toBe(0);
    expect(missing.reasonCounts).toMatchObject({ MISSING_BOOK: 3, MISSING_PRICE: 3 });
  });

  it('reports stale books and prices without treating them as fresh features', () => {
    const report = build(createFixture({ staleBook: true, stalePrice: true }));
    expect(report.candidateCoverage.allWindowsValid).toBe(0);
    expect(report.reasonCounts).toMatchObject({ STALE_BOOK: 3, STALE_PRICE: 3 });
  });

  it('rejects incompatible sessions and windows outside the collected range', () => {
    const incompatible = build(createFixture({ compatible: false }));
    expect(incompatible.reasonCounts).toMatchObject({ INCOMPATIBLE_SESSION: 3 });
    expect(incompatible.collectorCompatibleNow).toBe(false);

    const outside = build(createFixture({}), 1_200_000);
    expect(outside.reasonCounts).toMatchObject({ OUTSIDE_COLLECTED_RANGE: 3 });
    expect(outside.candidateCoverage.allWindowsValid).toBe(0);
  });

  it('opens the production-shaped fixture read-only and does not mutate it', () => {
    const databasePath = createFixture({});
    const before = statSync(databasePath);
    build(databasePath);
    const after = statSync(databasePath);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    const VerifyDatabase = new Database(databasePath, { readonly: true });
    expect(
      VerifyDatabase.prepare('SELECT COUNT(*) AS count FROM microstructure_aggregates_1s').get(),
    ).toEqual({ count: 300 });
    VerifyDatabase.close();
  });
});
