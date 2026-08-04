import { describe, expect, it } from 'vitest';

import {
  analyzeMicrostructureQuality,
  loadMicrostructureQualityHours,
  type microstructure_quality_input,
} from '../src/microstructure_quality.js';

const START = Date.parse('2026-01-01T00:00:00.000Z');

function createInput(
  overrides: Partial<microstructure_quality_input> = {},
): microstructure_quality_input {
  const books = Array.from({ length: 10 }, (_, index) => ({
    exchangeTimestampMs: START + index * 1_000,
    receivedAtMs: START + index * 1_000 + 100,
    persistedAtMs: START + index * 1_000 + 110,
    spread: 1,
    midPrice: 100_000,
    bestBidSize: index + 1,
    bestAskSize: index + 2,
    depthImbalance: 0.1,
  }));
  return {
    startTimeMs: START,
    endTimeMs: START + 10_000,
    marketAddress: 'btc-market',
    economicTrades: [
      {
        economicTradeId: 'trade-1',
        exchangeTimestampMs: START + 1_000,
        ingestionSource: 'WEBSOCKET',
        ambiguous: false,
        aggressorSide: 'BUY',
        classificationReason: 'EXPLICIT_IS_TAKER',
        classificationSource: 'EXPLICIT',
        matchedBookAgeMs: null,
      },
    ],
    participantRows: [
      {
        rowKey: 'row-1',
        economicTradeId: 'trade-1',
        exchangeTimestampMs: START + 1_000,
        receivedAtMs: START + 1_100,
        persistedAtMs: START + 1_110,
        ingestionSource: 'WEBSOCKET',
      },
    ],
    books,
    marketPrices: books.map(({ exchangeTimestampMs, receivedAtMs, persistedAtMs }) => ({
      exchangeTimestampMs,
      receivedAtMs,
      persistedAtMs,
    })),
    aggregateTimestampsMs: Array.from({ length: 10 }, (_, index) => START + index * 1_000),
    aggregateFeatureAges: Array.from({ length: 10 }, (_, index) => ({
      timestampMs: START + index * 1_000,
      bookAgeMs: 100,
      marketPriceAgeMs: 100,
      spreadAvailable: true,
      marketPriceAvailable: true,
    })),
    activeSessions: [{ sessionId: 'session', startTimeMs: START, endTimeMs: START + 10_000 }],
    cumulativeCounts: {
      economicTrades: 100,
      participantRows: 200,
      books: 300,
      marketPrices: 400,
      aggregates: 500,
    },
    cumulativeDiagnostics: { malformed_messages: 2, reconnects: 1 },
    ...overrides,
  };
}

describe('microstructure quality analysis', () => {
  it('defaults and validates the requested window', () => {
    expect(loadMicrostructureQualityHours({})).toBe(24);
    expect(() => loadMicrostructureQualityHours({ MICROSTRUCTURE_QUALITY_HOURS: '0' })).toThrow(
      /MICROSTRUCTURE_QUALITY_HOURS/,
    );
  });

  it('fails empty and partial requested-window data as NOT_ENOUGH_DATA', () => {
    const empty = analyzeMicrostructureQuality(
      createInput({
        economicTrades: [],
        participantRows: [],
        books: [],
        marketPrices: [],
        aggregateTimestampsMs: [],
        activeSessions: [],
      }),
    );
    expect(empty).toMatchObject({
      status: 'FAIL',
      collectionQualityStatus: 'FAIL',
      directionalOrderFlowReadiness: 'FAIL',
      sufficiency: 'NOT_ENOUGH_DATA',
    });
    const partial = analyzeMicrostructureQuality(createInput({ endTimeMs: START + 100_000 }));
    expect(partial.window.requestedWindowSufficiency.coverageRatio).toBe(0.1);
    expect(partial.sufficiency).toBe('NOT_ENOUGH_DATA');
  });

  it('calculates continuity only inside active session segments', () => {
    const aggregateTimestampsMs = [0, 1, 2, 7, 8, 9].map((second) => START + second * 1_000);
    const report = analyzeMicrostructureQuality(
      createInput({
        aggregateTimestampsMs,
        activeSessions: [
          { sessionId: 'a', startTimeMs: START, endTimeMs: START + 3_000 },
          { sessionId: 'a', startTimeMs: START + 7_000, endTimeMs: START + 10_000 },
        ],
      }),
    );
    expect(report.window.activeSessionContinuity).toMatchObject({
      expectedCount: 6,
      actualCount: 6,
      missingCount: 0,
      missingRatio: 0,
    });
  });

  it('reports exact gaps within active collection', () => {
    const report = analyzeMicrostructureQuality(
      createInput({
        aggregateTimestampsMs: [
          START,
          START + 1_000,
          START + 5_000,
          START + 6_000,
          START + 7_000,
          START + 8_000,
          START + 9_000,
        ],
      }),
    );
    expect(report.window.activeSessionContinuity).toMatchObject({
      expectedCount: 10,
      actualCount: 7,
      missingCount: 3,
      missingRatio: 0.3,
      longestGapSeconds: 3,
    });
    expect(report.window.activeSessionContinuity.gapTimestamps[0]).toEqual({
      startTimestamp: '2026-01-01T00:00:02.000Z',
      endTimestamp: '2026-01-01T00:00:04.000Z',
      missingSeconds: 3,
    });
  });

  it('excludes REST bootstrap age from realtime latency', () => {
    const bootstrap = {
      rowKey: 'rest',
      economicTradeId: 'rest-trade',
      exchangeTimestampMs: START - 3_600_000,
      receivedAtMs: START + 1_000,
      persistedAtMs: START + 1_010,
      ingestionSource: 'REST_BOOTSTRAP' as const,
    };
    const report = analyzeMicrostructureQuality(
      createInput({ participantRows: [createInput().participantRows[0]!, bootstrap] }),
    );
    expect(report.window.realtimeLatencyMs.trades.p50).toBe(100);
    expect(report.window.realtimeLatencyMs.trades.sampleCount).toBe(1);
    expect(report.window.restBootstrapAgeMs.p50).toBe(3_601_000);
    expect(report.window.persistenceLatencyMs.restBootstrapTrades.p50).toBe(10);
  });

  it('preserves negative latency as a clock-skew diagnostic', () => {
    const books = createInput().books.map((row, index) =>
      index === 1 ? { ...row, receivedAtMs: row.exchangeTimestampMs - 25 } : row,
    );
    const report = analyzeMicrostructureQuality(createInput({ books }));
    expect(report.window.realtimeLatencyMs.bookSnapshots).toMatchObject({
      negativeCount: 1,
      negativeRatio: 0.1,
    });
    expect(report.collectionQualityStatus).toBe('WARN');
  });

  it('deduplicates rows and reports unknown and ambiguity reasons', () => {
    const row = createInput().participantRows[0]!;
    const report = analyzeMicrostructureQuality(
      createInput({
        participantRows: [row, row],
        economicTrades: [
          {
            economicTradeId: 'trade-1',
            exchangeTimestampMs: START,
            ingestionSource: 'WEBSOCKET',
            ambiguous: true,
            aggressorSide: 'UNKNOWN',
            classificationReason: 'AMBIGUOUS_ECONOMIC_FIELDS',
            classificationSource: 'UNKNOWN',
            matchedBookAgeMs: null,
          },
        ],
      }),
    );
    expect(report.window.tradeQuality).toMatchObject({
      rawRows: 2,
      participantRows: 1,
      duplicateRawRows: 1,
      ambiguousTrades: 1,
      unknownAggressors: 1,
    });
    expect(report.window.tradeQuality.unknownReasonBreakdown).toEqual({
      AMBIGUOUS_ECONOMIC_FIELDS: 1,
    });
    expect(report.directionalOrderFlowReadiness).toBe('FAIL');
  });

  it('classifies collection and directional readiness separately', () => {
    expect(analyzeMicrostructureQuality(createInput())).toMatchObject({
      status: 'PASS',
      collectionQualityStatus: 'PASS',
      directionalOrderFlowReadiness: 'PASS',
    });
    const report = analyzeMicrostructureQuality(
      createInput({
        economicTrades: [
          {
            economicTradeId: 'unknown',
            exchangeTimestampMs: START,
            ingestionSource: 'WEBSOCKET',
            ambiguous: false,
            aggressorSide: 'UNKNOWN',
            classificationReason: 'NO_EXPLICIT_AGGRESSOR_SEMANTICS',
            classificationSource: 'UNKNOWN',
            matchedBookAgeMs: null,
          },
        ],
      }),
    );
    expect(report).toMatchObject({
      status: 'FAIL',
      collectionQualityStatus: 'PASS',
      directionalOrderFlowReadiness: 'FAIL',
    });
  });

  it('assesses directional readiness from recent WebSocket trades only', () => {
    const web = createInput().economicTrades[0]!;
    const rest = {
      ...web,
      economicTradeId: 'rest-unknown',
      ingestionSource: 'REST_BOOTSTRAP' as const,
      aggressorSide: 'UNKNOWN' as const,
      classificationReason: 'NO_EXPLICIT_AGGRESSOR_SEMANTICS' as const,
      classificationSource: 'UNKNOWN' as const,
    };
    const report = analyzeMicrostructureQuality(createInput({ economicTrades: [web, rest] }));
    expect(report.directionalOrderFlowReadiness).toBe('PASS');
    expect(report.window.tradeQuality).toMatchObject({
      recentWebSocketEconomicTrades: 1,
      unknownAggressorRatio: 0,
      directionSourceBreakdown: { EXPLICIT: 1, ESTIMATED_QUOTE_TEST: 0, UNKNOWN: 0 },
    });
  });

  it('reports aggregate book and market-price feature completeness', () => {
    const aggregateFeatureAges = createInput().aggregateFeatureAges.map((row, index) =>
      index === 0 ? { ...row, spreadAvailable: false, marketPriceAvailable: false } : row,
    );
    const report = analyzeMicrostructureQuality(createInput({ aggregateFeatureAges }));
    expect(report.window.aggregateFeatureCompleteness).toEqual({
      sampleCount: 10,
      staleOrMissingBookCount: 1,
      staleOrMissingBookRatio: 0.1,
      staleOrMissingMarketPriceCount: 1,
      staleOrMissingMarketPriceRatio: 0.1,
    });
  });

  it('keeps cumulative diagnostics separate from the selected window', () => {
    const report = analyzeMicrostructureQuality(createInput());
    expect(report.cumulativeDiagnostics).toEqual({ malformed_messages: 2, reconnects: 1 });
    expect(report.cumulativeStorage.economicTrades).toBe(100);
  });

  it('prevents legacy sessions from contaminating latest-session validation', () => {
    const clean = createInput();
    const legacyBook = {
      ...clean.books[0]!,
      exchangeTimestampMs: START - 50_000,
      receivedAtMs: START - 60_000,
    };
    const legacyTrade = {
      ...clean.economicTrades[0]!,
      economicTradeId: 'legacy-unknown',
      ingestionSource: 'UNKNOWN' as const,
      aggressorSide: 'UNKNOWN' as const,
      classificationSource: 'UNKNOWN' as const,
      classificationReason: 'LEGACY_UNKNOWN' as const,
    };
    const report = analyzeMicrostructureQuality(
      createInput({
        startTimeMs: START - 100_000,
        economicTrades: [legacyTrade, ...clean.economicTrades],
        books: [legacyBook, ...clean.books],
        activeSessions: [
          { sessionId: 'legacy', startTimeMs: START - 100_000, endTimeMs: START - 50_000 },
          ...clean.activeSessions,
        ],
        latestCollectorSession: {
          sessionId: 'current-v5',
          featureVersion: 'V5_CONTINUOUS_AGGREGATES',
          startedAtMs: START,
          endedAtMs: START + 10_000,
          activeSessions: [
            { sessionId: 'current-v5', startTimeMs: START, endTimeMs: START + 10_000 },
          ],
          economicTrades: clean.economicTrades,
          participantRows: clean.participantRows,
          books: clean.books,
          marketPrices: clean.marketPrices,
          aggregateTimestampsMs: clean.aggregateTimestampsMs,
          aggregateFeatureAges: clean.aggregateFeatureAges,
          diagnostics: {
            'malformed_messages.depth': 1,
            'timestamp_regressions.trades': 2,
            reconnects: 3,
          },
        },
      }),
    );
    expect(report).toMatchObject({
      collectionQualityStatus: 'PASS',
      directionalOrderFlowReadiness: 'PASS',
      latestCollectorSession: {
        sessionId: 'current-v5',
        durationMs: 10_000,
        aggregateCompleteness: { expectedCount: 10, actualCount: 10, missingCount: 0 },
        webSocketEconomicTradeCount: 1,
        direction: {
          EXPLICIT: { count: 1, ratio: 1 },
          ESTIMATED_QUOTE_TEST: { count: 0, ratio: 0 },
          UNKNOWN: { count: 0, ratio: 0 },
        },
        diagnostics: {
          'malformed_messages.depth': 1,
          'timestamp_regressions.trades': 2,
          reconnects: 3,
        },
      },
    });
    expect(report.historicalWindow.datasets.trades.count).toBe(2);
    expect(report.latestCollectorSession?.realtimeLatencyMs.bookSnapshots.negativeCount).toBe(0);
  });
});
