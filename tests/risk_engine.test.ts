import { describe, expect, it } from 'vitest';

import { createResearchMarketMetadata } from '../src/research_market_metadata.js';
import {
  calculateDailyVolume,
  evaluateTradeRisk,
  hashRiskConfiguration,
  hashRiskInput,
  normalizeRiskConfiguration,
  roundEntryPrice,
  roundQuantityDown,
  roundStopPrice,
  transitionRiskState,
  type proposed_trade_intent,
  type risk_context,
} from '../src/risk_engine.js';

const Config = normalizeRiskConfiguration({});
const Metadata = createResearchMarketMetadata(
  {
    symbol: 'BTC/USD',
    exchangeSymbol: 'BTC-USD',
    marketAddress: '0xbtc',
    sizeDecimals: 4,
    priceDecimals: 1,
    tickSize: 0.1,
    minimumSize: 0.0001,
    lotSize: 0.0001,
    maximumLeverage: 50,
    maximumOpenInterest: 1_000_000,
    mode: 'Open',
  },
  new Date('2026-01-01T00:00:00.000Z'),
);
function intent(overrides: Partial<proposed_trade_intent> = {}): proposed_trade_intent {
  return {
    intentId: 'intent-1',
    marketAddress: '0xbtc',
    direction: 'LONG',
    decisionTimestamp: '2026-01-01T12:00:00.000Z',
    referencePrice: 100_000,
    intendedEntryPrice: 100_000,
    stopLossPrice: 99_900,
    entryOrderType: 'POST_ONLY_LIMIT',
    requestedLeverage: 40,
    candidateId: 'candidate-1',
    candidateType: 'BREAKOUT',
    strategyVersion: 'v1',
    featureVersion: 'v1',
    dataSessionId: 'session-1',
    ...overrides,
  };
}
function context(overrides: Partial<risk_context> = {}): risk_context {
  const currentTime = '2026-01-01T12:00:00.000Z';
  return {
    currentTime,
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
    marketMetadata: Metadata,
    marketMode: 'Open',
    unifiedRuntimeHealth: 'HEALTHY',
    latestCompletedCandleTimestamp: currentTime,
    latestBookTimestamp: currentTime,
    latestTradeTimestamp: currentTime,
    latestMarketPriceTimestamp: currentTime,
    latestAggregateTimestamp: currentTime,
    currentRiskState: 'ACTIVE',
    healthySinceTimestamp: currentTime,
    processedIntentIds: [],
    persistenceAvailable: true,
    ...overrides,
  };
}

describe('risk engine', () => {
  it('approves long and short with exactly 40x and variable risk-sized margin', () => {
    const long = evaluateTradeRisk(intent(), context(), Config);
    const short = evaluateTradeRisk(
      intent({ intentId: 'short', direction: 'SHORT', stopLossPrice: 100_100 }),
      context(),
      Config,
    );
    expect(long.status).toBe('APPROVED');
    expect(short.status).toBe('APPROVED');
    for (const result of [long, short]) {
      expect(result.leverageOnAllocatedMargin).toBe(40);
      expect(result.positionNotional).toBeCloseTo(result.allocatedMargin * 40, 8);
      expect(result.positionNotional).toBeLessThanOrEqual(1_200);
      expect(result.totalLossAtStopIncludingFees).toBeLessThanOrEqual(0.075);
    }
    const tighter = evaluateTradeRisk(
      intent({ intentId: 'tight', stopLossPrice: 99_950 }),
      context(),
      Config,
    );
    expect(tighter.allocatedMargin).not.toBe(long.allocatedMargin);
    expect(tighter.leverageOnAllocatedMargin).toBe(40);
  });

  it('rounds entry, stop and quantity conservatively', () => {
    expect(roundEntryPrice('LONG', 100.09, 0.1)).toBe(100);
    expect(roundEntryPrice('SHORT', 100.01, 0.1)).toBe(100.1);
    expect(roundStopPrice('LONG', 99.99, 0.1)).toBe(99.9);
    expect(roundStopPrice('SHORT', 100.01, 0.1)).toBe(100.1);
    expect(roundQuantityDown(0.00129, 0.0001)).toBe(0.0012);
  });

  it.each([
    ['REQUESTED_LEVERAGE_NOT_40', { requestedLeverage: 39 }, {}],
    [
      'MARKET_MAXIMUM_LEVERAGE_BELOW_40',
      {},
      { marketMetadata: { ...Metadata, maximumLeverage: 39 } },
    ],
    ['UNHEALTHY_RUNTIME', {}, { unifiedRuntimeHealth: 'DEGRADED' }],
    ['STALE_MARKET_DATA', {}, { latestBookTimestamp: '2026-01-01T11:00:00.000Z' }],
    ['FUTURE_TIMESTAMP', { decisionTimestamp: '2026-01-01T12:00:02.000Z' }, {}],
    ['INVALID_STOP_LOSS', { stopLossPrice: 100_000 }, {}],
    ['STOP_TOO_CLOSE', { stopLossPrice: 99_999.9 }, {}],
    ['STOP_TOO_FAR', { stopLossPrice: 90_000 }, {}],
    ['POSITION_ALREADY_EXISTS', {}, { currentPosition: { marketAddress: '0xbtc' } }],
    ['ENTRY_ORDER_ALREADY_EXISTS', {}, { existingOpenOrders: [{ entryOrder: true }] }],
    ['DUPLICATE_INTENT', {}, { processedIntentIds: ['intent-1'] }],
    ['RISK_STATE_NOT_ACTIVE', {}, { currentRiskState: 'PAUSED_OPERATOR' }],
  ] satisfies Array<[string, Partial<proposed_trade_intent>, Partial<risk_context>]>)(
    'rejects %s',
    (reason, intentChanges, contextChanges) => {
      expect(
        evaluateTradeRisk(intent(intentChanges), context(contextChanges), Config).reasonCodes,
      ).toEqual([reason]);
    },
  );

  it('handles non-finite and minimum-size inputs fail closed', () => {
    expect(
      evaluateTradeRisk(intent({ intendedEntryPrice: Number.NaN }), context(), Config).reasonCodes,
    ).toEqual(['INVALID_ENTRY_PRICE']);
    expect(
      evaluateTradeRisk(
        intent(),
        context({ marketMetadata: { ...Metadata, minimumSize: 0.001 } }),
        Config,
      ).reasonCodes,
    ).toEqual(['QUANTITY_BELOW_MINIMUM']);
  });

  it('hashes normalized input deterministically', () => {
    expect(hashRiskConfiguration(Config)).toBe(hashRiskConfiguration({ ...Config }));
    expect(hashRiskInput(intent(), context())).toBe(hashRiskInput(intent(), context()));
  });

  it('keeps controlled states paused and requires an audited operator recovery signal', () => {
    expect(transitionRiskState('ACTIVE', 'DATA_UNHEALTHY')).toBe('PAUSED_DATA');
    expect(transitionRiskState('PAUSED_DATA', 'DATA_HEALTHY_STABLE')).toBe('PAUSED_DATA');
    expect(
      transitionRiskState('PAUSED_DATA', 'DATA_HEALTHY_STABLE', false, {
        currentTime: '2026-01-01T00:01:00Z',
        healthySinceTimestamp: '2026-01-01T00:00:00Z',
        requiredSeconds: 60,
      }),
    ).toBe('ACTIVE');
    expect(transitionRiskState('PAUSED_LOSS', 'OPERATOR_ACTIVATE', true)).toBe('PAUSED_LOSS');
    expect(transitionRiskState('PAUSED_DRAWDOWN', 'OPERATOR_ACTIVATE', true)).toBe(
      'PAUSED_DRAWDOWN',
    );
    expect(transitionRiskState('PAUSED_OPERATOR', 'OPERATOR_ACTIVATE')).toBe('PAUSED_OPERATOR');
    expect(transitionRiskState('PAUSED_OPERATOR', 'OPERATOR_ACTIVATE', true)).toBe('ACTIVE');
    expect(transitionRiskState('HALTED', 'OPERATOR_ACTIVATE', true)).toBe('HALTED');
  });

  it('counts unique actual fills by UTC day and cannot affect a risk decision', () => {
    const fills = [
      {
        fillId: 'a',
        timestamp: '2026-01-01T23:59:59.000Z',
        price: 100,
        quantity: 2,
        role: 'ENTRY' as const,
      },
      {
        fillId: 'a',
        timestamp: '2026-01-01T23:59:59.000Z',
        price: 100,
        quantity: 2,
        role: 'ENTRY' as const,
      },
      {
        fillId: 'b',
        timestamp: '2026-01-02T00:00:00.000Z',
        price: 100,
        quantity: 1,
        role: 'EXIT' as const,
      },
    ];
    expect(calculateDailyVolume(fills, 10_000, '2026-01-01T23:59:59.000Z').dailyFilledVolume).toBe(
      200,
    );
    expect(calculateDailyVolume(fills, 10_000, '2026-01-02T00:00:01.000Z').dailyFilledVolume).toBe(
      100,
    );
    const baseline = evaluateTradeRisk(intent(), context(), Config);
    const highVolume = evaluateTradeRisk(
      intent(),
      context({ realizedDailyFilledVolume: 99_999 }),
      Config,
    );
    expect(highVolume.status).toBe(baseline.status);
    expect(highVolume.calculatedQuantity).toBe(baseline.calculatedQuantity);
    expect(highVolume.allocatedMargin).toBe(baseline.allocatedMargin);
  });

  it('accumulates adversarial decimal fills without floating artifacts across UTC rollover', () => {
    const fills = [
      {
        fillId: 'fraction-a',
        timestamp: '2026-01-01T23:59:59.000Z',
        price: 0.1,
        quantity: 0.2,
        role: 'ENTRY' as const,
      },
      ...Array.from({ length: 1_000 }, (_, index) => ({
        fillId: `many-${index}`,
        timestamp: '2026-01-01T12:00:00.000Z',
        price: 100_100,
        quantity: 0.0005,
        role: 'EXIT' as const,
      })),
      {
        fillId: 'next-day',
        timestamp: '2026-01-02T00:00:00.000Z',
        price: 0.2,
        quantity: 0.1,
        role: 'ENTRY' as const,
      },
    ];
    const firstDay = calculateDailyVolume(fills, 100_000, '2026-01-01T23:59:59.000Z');
    const secondDay = calculateDailyVolume(fills, 100_000, '2026-01-02T00:00:01.000Z');
    expect(firstDay.dailyFilledVolume).toBe(50_050.02);
    expect(secondDay.dailyFilledVolume).toBe(0.02);
    expect(JSON.stringify({ firstDay, secondDay })).not.toContain('000000000000');
  });
});
