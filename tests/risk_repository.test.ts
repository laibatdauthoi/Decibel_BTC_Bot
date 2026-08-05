import { describe, expect, it } from 'vitest';
import { createResearchMarketMetadata } from '../src/research_market_metadata.js';
import {
  evaluateTradeRisk,
  normalizeRiskConfiguration,
  type proposed_trade_intent,
  type risk_context,
} from '../src/risk_engine.js';
import { risk_repository } from '../src/risk_repository.js';

describe('risk repository', () => {
  it('migrates idempotently, uses WAL, restores state, and deduplicates decisions and fills', () => {
    const Repository = new risk_repository(':memory:');
    expect(Repository.getSchemaVersion()).toBe(2);
    expect(Repository.getJournalMode()).toBe('memory');
    const metadata = createResearchMarketMetadata(
      {
        symbol: 'BTC/USD',
        exchangeSymbol: 'BTC',
        marketAddress: 'm',
        sizeDecimals: 4,
        priceDecimals: 1,
        tickSize: 0.1,
        lotSize: 0.0001,
        minimumSize: 0.0001,
        maximumLeverage: 50,
        maximumOpenInterest: 1,
        mode: 'Open',
      },
      new Date('2026-01-01T00:00:00Z'),
    );
    const intent: proposed_trade_intent = {
      intentId: 'i',
      marketAddress: 'm',
      direction: 'LONG',
      decisionTimestamp: '2026-01-01T00:00:00Z',
      referencePrice: 100000,
      intendedEntryPrice: 100000,
      stopLossPrice: 99900,
      entryOrderType: 'POST_ONLY_LIMIT',
      requestedLeverage: 40,
      candidateId: 'c',
      candidateType: 'x',
      strategyVersion: 'v',
      featureVersion: 'v',
      dataSessionId: 's',
    };
    const context: risk_context = {
      currentTime: '2026-01-01T00:00:00Z',
      accountEquity: 30,
      availableCollateral: 30,
      reservedCollateral: 0,
      startOfDayEquity: 30,
      realizedDailyPnL: 0,
      realizedDailyFilledVolume: 0,
      peakEquity: 30,
      currentDrawdown: 0,
      consecutiveLosses: 0,
      lastLossTimestamp: null,
      currentPosition: null,
      existingOpenOrders: [],
      marketMetadata: metadata,
      marketMode: 'Open',
      unifiedRuntimeHealth: 'HEALTHY',
      latestCompletedCandleTimestamp: '2026-01-01T00:00:00Z',
      latestBookTimestamp: '2026-01-01T00:00:00Z',
      latestTradeTimestamp: '2026-01-01T00:00:00Z',
      latestMarketPriceTimestamp: '2026-01-01T00:00:00Z',
      latestAggregateTimestamp: '2026-01-01T00:00:00Z',
      currentRiskState: 'ACTIVE',
      healthySinceTimestamp: '2026-01-01T00:00:00Z',
      processedIntentIds: [],
      persistenceAvailable: true,
    };
    const decision = evaluateTradeRisk(intent, context, normalizeRiskConfiguration({}));
    expect(Repository.saveDecision(intent, decision)).toBe('INSERTED');
    expect(Repository.saveDecision(intent, decision)).toBe('UNCHANGED');
    expect(Repository.hasIntent('i')).toBe(true);
    const fill = {
      fillId: 'f',
      timestamp: '2026-01-01T00:00:00Z',
      price: 100,
      quantity: 0.5,
      role: 'ENTRY' as const,
    };
    expect(Repository.recordFill(fill)).toBe('INSERTED');
    expect(Repository.recordFill(fill)).toBe('DUPLICATE');
    expect(Repository.getDailyVolume('2026-01-01')).toBe(50);
    Repository.saveOperatorAction('a', 'PAUSE', '2026-01-01T00:00:01Z', 'test');
    Repository.saveTransition({
      transitionId: 't',
      previousState: 'ACTIVE',
      nextState: 'PAUSED_OPERATOR',
      event: 'OPERATOR_PAUSE',
      occurredAt: '2026-01-01T00:00:01Z',
      operatorActionId: 'a',
    });
    expect(Repository.getRiskState()).toBe('PAUSED_OPERATOR');
    expect(
      Repository.saveTransition({
        transitionId: 't',
        previousState: 'ACTIVE',
        nextState: 'PAUSED_OPERATOR',
        event: 'OPERATOR_PAUSE',
        occurredAt: '2026-01-01T00:00:01Z',
        operatorActionId: 'a',
      }),
    ).toBe('UNCHANGED');
    Repository.close();
  });

  it('persists scaled fill units and accumulates exact partial fills idempotently', () => {
    const Repository = new risk_repository(':memory:');
    const fills = [
      {
        fillId: 'decimal',
        timestamp: '2026-01-01T23:59:59Z',
        price: 0.1,
        quantity: 0.2,
        role: 'ENTRY' as const,
      },
      {
        fillId: 'entry',
        timestamp: '2026-01-01T12:00:00Z',
        price: 100_000,
        quantity: 0.001,
        role: 'ENTRY' as const,
      },
      {
        fillId: 'partial',
        timestamp: '2026-01-01T12:01:00Z',
        price: 100_100,
        quantity: 0.0005,
        role: 'EXIT' as const,
      },
      {
        fillId: 'rollover',
        timestamp: '2026-01-02T00:00:00Z',
        price: 0.2,
        quantity: 0.1,
        role: 'EXIT' as const,
      },
    ];
    for (const fill of fills) expect(Repository.recordFill(fill)).toBe('INSERTED');
    expect(Repository.recordFill(fills[2]!)).toBe('DUPLICATE');
    expect(Repository.getDailyVolume('2026-01-01')).toBe(150.07);
    expect(Repository.getDailyVolume('2026-01-02')).toBe(0.02);
    expect(
      JSON.stringify(Repository.getDailyVolumeStatus(10_000, '2026-01-01T23:59:59Z')),
    ).not.toContain('000000000000');
    Repository.close();
  });

  it('migrates legacy REAL accounting to normalized scaled units without losing rows', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'risk-v1-migration-'));
    const databasePath = path.join(directory, 'risk.sqlite');
    const Legacy = new Database(databasePath);
    Legacy.exec(`
      CREATE TABLE risk_fills(fill_id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, utc_day TEXT NOT NULL,
        price REAL NOT NULL, quantity REAL NOT NULL, role TEXT NOT NULL, volume REAL NOT NULL);
      CREATE TABLE daily_risk_state(utc_day TEXT PRIMARY KEY, filled_volume REAL NOT NULL DEFAULT 0,
        start_of_day_equity REAL, realized_pnl REAL, peak_equity REAL, drawdown REAL,
        consecutive_losses INTEGER, cooldown_until TEXT);
      CREATE TABLE durable_risk_state(singleton INTEGER PRIMARY KEY, state TEXT NOT NULL,
        updated_at TEXT NOT NULL, policy_version TEXT NOT NULL);
      INSERT INTO durable_risk_state VALUES(1, 'ACTIVE', '2026-01-01T00:00:00Z', 'v1');
      INSERT INTO risk_fills VALUES('legacy', '2026-01-01T00:00:00Z', '2026-01-01',
        100100, 0.0005, 'EXIT', 50.050000000000004);
      INSERT INTO daily_risk_state(utc_day, filled_volume) VALUES('2026-01-01', 50.050000000000004);
      PRAGMA user_version = 1;
    `);
    Legacy.close();
    const Migrated = new risk_repository(databasePath);
    expect(Migrated.getSchemaVersion()).toBe(2);
    expect(Migrated.getDailyVolume('2026-01-01')).toBe(50.05);
    expect(
      Migrated.recordFill({
        fillId: 'legacy',
        timestamp: '2026-01-01T00:00:00Z',
        price: 100100,
        quantity: 0.0005,
        role: 'EXIT',
      }),
    ).toBe('DUPLICATE');
    Migrated.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
