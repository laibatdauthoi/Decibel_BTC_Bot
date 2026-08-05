import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { candlestick_repository } from '../src/candlestick_repository.js';
import { normalizePaperBotConfiguration, paper_bot_journal } from '../src/paper_bot.js';
import { buildPaperRuntimeReport } from '../src/paper_runtime_report.js';

const Directories: string[] = [];
afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
});

function directory() {
  const value = mkdtempSync(path.join(tmpdir(), 'paper-report-'));
  Directories.push(value);
  return value;
}

describe('paper runtime report', () => {
  it('reports empty and missing databases without creating them', () => {
    const root = directory(),
      paperPath = path.join(root, 'missing-paper.sqlite'),
      candlePath = path.join(root, 'missing-candles.sqlite'),
      report = buildPaperRuntimeReport({
        paperDatabasePath: paperPath,
        candleDatabasePath: candlePath,
        mode: 'OBSERVE_ONLY',
      });
    expect(report).toMatchObject({
      configuredMode: 'OBSERVE_ONLY',
      liveExecutionEnabled: false,
      databaseStatus: 'NO_DATA',
      completedEvaluationCount: 0,
      simulatedFills: 0,
      liveRiskIntentCount: 0,
      liveOrderCount: 0,
      candleData: { status: 'NO_DATA', count: 0, missingIntervalCount: 0 },
    });
  });

  it('explains observe-only no-candidate periods and candle gaps', () => {
    const root = directory(),
      paperPath = path.join(root, 'paper.sqlite'),
      candlePath = path.join(root, 'candles.sqlite'),
      Journal = new paper_bot_journal(paperPath),
      Candles = new candlestick_repository(candlePath);
    for (let index = 0; index < 3; index += 1) {
      const candleTime = new Date(Date.parse('2026-01-01T00:00:00.000Z') + index * 300_000),
        completedAt = new Date(candleTime.getTime() + 300_000);
      Journal.recordLiveEvaluation({
        evaluationId: `evaluation:market:5m:${candleTime.toISOString()}`,
        marketAddress: 'market',
        interval: '5m',
        candleTime: candleTime.toISOString(),
        completedAt: completedAt.toISOString(),
        observedAt: completedAt.toISOString(),
        paperBotState: 'OBSERVING',
        mode: 'OBSERVE_ONLY',
        status: 'EVALUATED',
        reasonCode: null,
        candidateCount: 0,
        selectedCandidateId: null,
        riskIntentCreated: false,
        orderCreated: false,
        source: 'LIVE_WEBSOCKET',
      });
    }
    Candles.saveCandlesticks({
      marketAddress: 'market',
      symbol: 'BTC/USD',
      exchangeSymbol: 'BTC-USD-PERP',
      interval: '5m',
      candles: [
        {
          timestamp: new Date('2026-01-01T00:00:00.000Z'),
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1,
        },
        {
          timestamp: new Date('2026-01-01T00:10:00.000Z'),
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1,
        },
      ],
    });
    Journal.close();
    Candles.close();
    const report = buildPaperRuntimeReport({
      paperDatabasePath: paperPath,
      candleDatabasePath: candlePath,
      mode: 'OBSERVE_ONLY',
    });
    expect(report.completedEvaluationCount).toBe(3);
    expect(report.evaluationsByGateDecision).toEqual({ OBSERVE_ONLY: 3 });
    expect(report.noTradeDiagnostic).toMatchObject({ active: true, recentEvaluationCount: 3 });
    expect(report.noTradeDiagnostic.explanation).toContain('strategy produced no candidates');
    expect(report.candleData).toMatchObject({
      status: 'GAPPED',
      marketAddress: 'market',
      count: 2,
      missingIntervalCount: 1,
    });
    expect(report.liveRiskIntentCount).toBe(0);
    expect(report.liveOrderCount).toBe(0);
  });

  it('reports durable no-candidate diagnostics and post-candidate risk rejection reasons', () => {
    const root = directory(),
      paperPath = path.join(root, 'paper.sqlite'),
      Journal = new paper_bot_journal(paperPath),
      sessionId = Journal.startSession({
        startedAt: '2026-01-01T00:00:00.000Z',
        mode: 'PAPER_SIMULATION',
        startupRecoveryStatus: 'CLEAN',
      }),
      event = {
        marketAddress: 'market',
        interval: '5m' as const,
        candleTime: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:05:00.000Z',
        observedAt: '2026-01-01T00:05:00.100Z',
        source: 'LIVE_WEBSOCKET' as const,
      };
    Journal.enqueueCompletedCandle(event);
    Journal.recordQueuedEvaluation({
      evaluationId: 'evaluation:market:5m:2026-01-01T00:00:00.000Z',
      notificationId: 'completed:market:5m:2026-01-01T00:00:00.000Z',
      sessionId,
      ...event,
      paperBotState: 'PAPER_ACTIVE',
      mode: 'PAPER_SIMULATION',
      status: 'EVALUATED',
      reasonCode: null,
      candidateCount: 0,
      selectedCandidateId: null,
      riskIntentCreated: false,
      orderCreated: false,
      candidateDiagnostics: {
        primaryReason: 'VOLATILITY_OR_RANGE_FILTER_FAILED',
        reasons: ['VOLATILITY_OR_RANGE_FILTER_FAILED', 'TREND_OR_REGIME_FILTER_FAILED'],
        evidence: { volatilityRatio: 0.8, threshold: 1.6 },
      },
    });
    Journal.close();
    const report = buildPaperRuntimeReport({
      paperDatabasePath: paperPath,
      candleDatabasePath: path.join(root, 'missing.sqlite'),
      mode: 'PAPER_SIMULATION',
    });
    expect(report.topNoCandidateReasons).toEqual({ VOLATILITY_OR_RANGE_FILTER_FAILED: 1 });
    expect(report.latestNoCandidateEvaluations[0]).toMatchObject({
      primaryReason: 'VOLATILITY_OR_RANGE_FILTER_FAILED',
      reasons: ['VOLATILITY_OR_RANGE_FILTER_FAILED', 'TREND_OR_REGIME_FILTER_FAILED'],
      evidence: { volatilityRatio: 0.8, threshold: 1.6 },
    });
  });

  it('reports simulation risk, fills, account state, and zero live actions', () => {
    const root = directory(),
      paperPath = path.join(root, 'paper.sqlite'),
      Journal = new paper_bot_journal(paperPath),
      sessionId = Journal.startSession({
        startedAt: '2026-01-01T00:00:00.000Z',
        mode: 'PAPER_SIMULATION',
        startupRecoveryStatus: 'CLEAN',
      }),
      evaluationId = 'evaluation:market:5m:2026-01-01T00:05:00.000Z',
      policy = normalizePaperBotConfiguration({
        PAPER_RISK_MAX_POSITION_SIZE: '1',
        PAPER_RISK_MAX_NOTIONAL_EXPOSURE: '100000',
        PAPER_RISK_MAX_TRADE_NOTIONAL: '100000',
        PAPER_RISK_MIN_CASH_RESERVE: '0',
        PAPER_RISK_COOLDOWN_CANDLES: '0',
      }).paperRiskPolicy;
    Journal.beginDurableEvaluation({
      sessionId,
      idempotencyKey: evaluationId,
      candleOpenTime: '2026-01-01T00:00:00.000Z',
      candleCloseTime: '2026-01-01T00:05:00.000Z',
      symbol: 'BTC/USD',
      timeframe: '5m',
      evaluationStartedAt: '2026-01-01T00:05:00.000Z',
      accountSnapshotBefore: {},
    });
    Journal.completeDurableEvaluation({
      sessionId,
      idempotencyKey: evaluationId,
      evaluationCompletedAt: '2026-01-01T00:05:00.001Z',
      strategyDecision: 'LONG',
      riskDecision: 'PENDING',
      riskIntentCreated: false,
      orderCreated: false,
      observeOnlyReason: null,
      accountSnapshotAfter: {},
      candleCloseTime: '2026-01-01T00:05:00.000Z',
      markPrice: 100,
      paperTradeRequest: {
        requestedAction: 'OPEN',
        requestedSide: 'BUY',
        requestedSize: 0.1,
        markPrice: 100,
        markObservedAt: '2026-01-01T00:05:00.000Z',
      },
      paperRiskPolicy: policy,
    });
    Journal.recordLiveEvaluation({
      evaluationId,
      marketAddress: 'market',
      interval: '5m',
      candleTime: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:05:00.000Z',
      observedAt: '2026-01-01T00:05:00.001Z',
      paperBotState: 'PAPER_ACTIVE',
      mode: 'PAPER_SIMULATION',
      status: 'EVALUATED',
      reasonCode: null,
      candidateCount: 1,
      selectedCandidateId: 'candidate',
      riskIntentCreated: false,
      orderCreated: false,
      source: 'LIVE_WEBSOCKET',
    });
    Journal.close();
    const report = buildPaperRuntimeReport({
      paperDatabasePath: paperPath,
      candleDatabasePath: path.join(root, 'missing-candles.sqlite'),
      mode: 'PAPER_SIMULATION',
    });
    expect(report.paperRisk).toMatchObject({ total: 1, approved: 1, rejected: 0 });
    expect(report.simulatedOrders).toBe(1);
    expect(report.simulatedFills).toBe(1);
    expect(report.account).toMatchObject({ positionSize: 0.1, lastMarkedPrice: 100 });
    expect(report.latestFills).toHaveLength(1);
    expect(report.latestAccountEntries.length).toBeGreaterThan(0);
    expect(report.liveRiskIntentCount).toBe(0);
    expect(report.liveOrderCount).toBe(0);
  });
});
