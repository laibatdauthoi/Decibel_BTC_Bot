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
      index === 0 ? { ...row, receivedAtMs: row.exchangeTimestampMs - 25 } : row,
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

  it('keeps cumulative diagnostics separate from the selected window', () => {
    const report = analyzeMicrostructureQuality(createInput());
    expect(report.cumulativeDiagnostics).toEqual({ malformed_messages: 2, reconnects: 1 });
    expect(report.cumulativeStorage.economicTrades).toBe(100);
  });
});
