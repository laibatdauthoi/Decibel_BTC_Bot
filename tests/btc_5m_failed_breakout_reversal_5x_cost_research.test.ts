import { describe, expect, it } from 'vitest';
import {
  BTC5MFailedBreakoutReversal5XCostExperiment,
  classifyFailedBreakout5XCost,
  detectFailureCandle,
  runBTC5MFailedBreakoutReversal5XCostReplay,
  type failed_breakout_metrics,
} from '../src/btc_5m_failed_breakout_reversal_5x_cost_research.js';
import {
  calculateCompressionContext,
  detectCompressionBreakout,
} from '../src/btc_5m_compression_breakout_retest_count.js';
import {
  aggregateBTCOneMinuteCandles,
  calculateSingleLegSizing,
  evaluateSingleLegMarginGuard,
  type btc_research_market,
  type five_minute_candle,
} from '../src/btc_5m_wick_rejection_research.js';
import type { BTC_candlestick } from '../src/decibel_client.js';
const start = Date.UTC(2026, 0, 1),
  minute = 60000,
  Market: btc_research_market = {
    marketAddress: 'btc',
    tickSize: 0.1,
    lotSize: 0.0001,
    minimumSize: 0.0001,
    maximumLeverage: 53,
    makerFeeRate: 0.001,
    takerFeeRate: 0.002,
  };
const one = (i: number, o = 100, h = 101, l = 99, c = 100): BTC_candlestick => ({
  timestamp: new Date(start + i * minute),
  open: o,
  high: h,
  low: l,
  close: c,
  volume: 1,
});
const five = (i: number, o = 100, h = 105, l = 95, c = 100): five_minute_candle => ({
  timestamp: new Date(start + i * 5 * minute),
  endTimestamp: new Date(start + (i + 1) * 5 * minute),
  open: o,
  high: h,
  low: l,
  close: c,
  volume: 5,
});
const expand = (x: five_minute_candle) =>
  Array.from({ length: 5 }, (_, i) =>
    one(
      x.timestamp.getTime() / minute - start / minute + i,
      i ? x.close : x.open,
      x.high,
      x.low,
      x.close,
    ),
  );
function base(d: 'UP' | 'DOWN' = 'UP') {
  const x = Array.from({ length: 25 }, (_, i) => five(i));
  x[0] = five(0, 100, 120, 80, 100);
  for (let i = 1; i < 12; i++) x[i] = five(i, 100, 115, 85, 100);
  for (let i = 12; i < 24; i++) x[i] = five(i, 100, 110, 90, 100);
  x[24] = d === 'UP' ? five(24, 109, 112, 105, 111) : five(24, 91, 95, 88, 89);
  return x;
}
const history = (
  extra: five_minute_candle[],
  tail: BTC_candlestick[] = [],
  d: 'UP' | 'DOWN' = 'UP',
) => [...base(d), ...extra].flatMap(expand).concat(tail);
const metrics = (v: Partial<failed_breakout_metrics> = {}): failed_breakout_metrics => ({
  rawBreakoutCount: 0,
  breakoutAcceptedWhileFlatCount: 0,
  failureConfirmedCount: 0,
  failureRate: 0,
  entryAttemptCount: 0,
  entryFilledCount: 0,
  entryFailedCount: 0,
  entryFillRate: 0,
  completedCampaignCount: 0,
  takeProfitCount: 0,
  stopLossCount: 0,
  marginGuardCount: 0,
  tpRate: 0,
  grossProfitSum: 0,
  grossLossSumAbs: 0,
  grossPnLSum: 0,
  grossProfitFactor: null,
  netProfitSum: 0,
  netLossSumAbs: 0,
  netPnLSum: 0,
  netProfitFactor: null,
  meanHoldingMinutes: 0,
  medianHoldingMinutes: 0,
  meanTotalFees: 0,
  medianTotalFees: 0,
  ...v,
});
describe('BTC 5m failed breakout reversal 5x cost', () => {
  it('preserves UTC aggregation, exact 12-vs-12 compression, and close-only breakout', () => {
    expect(
      aggregateBTCOneMinuteCandles([...Array.from({ length: 5 }, (_, i) => one(i)), one(6)]),
    ).toHaveLength(1);
    const x = base(),
      c = calculateCompressionContext(x, 24)!;
    expect(c.compressionRatio).toBe(0.5);
    expect(detectCompressionBreakout(x[24]!, c)).toBe('LONG_BTC');
    expect(detectCompressionBreakout(five(24, 100, 120, 91, 109), c)).toBeNull();
    expect(
      calculateCompressionContext(
        Array.from({ length: 25 }, (_, i) => five(i)),
        24,
      ),
    ).toBeNull();
  });
  it('requires first completed close back inside, reverses direction, and rejects wick-only failure', () => {
    const x = [...base(), five(25, 111, 113, 109, 111), five(26, 109, 111, 100, 109)],
      c = calculateCompressionContext(x, 24)!;
    expect(
      detectFailureCandle({ candles: x, breakoutIndex: 24, direction: 'LONG_BTC', context: c })
        ?.index,
    ).toBe(26);
    const wick = [...base(), five(25, 111, 113, 100, 111)];
    expect(
      detectFailureCandle({ candles: wick, breakoutIndex: 24, direction: 'LONG_BTC', context: c }),
    ).toBeNull();
    const down = [...base('DOWN'), five(25, 89, 100, 88, 91)],
      dc = calculateCompressionContext(down, 24)!;
    expect(
      detectFailureCandle({ candles: down, breakoutIndex: 24, direction: 'SHORT_BTC', context: dc })
        ?.index,
    ).toBe(25);
  });
  it('requires strict containment between both frozen boundaries for either breakout direction', () => {
    const up = base(),
      upContext = calculateCompressionContext(up, 24)!,
      down = base('DOWN'),
      downContext = calculateCompressionContext(down, 24)!,
      detectUp = (close: number) =>
        detectFailureCandle({
          candles: [...up, five(25, 111, 113, 80, close)],
          breakoutIndex: 24,
          direction: 'LONG_BTC',
          context: upContext,
        }),
      detectDown = (close: number) =>
        detectFailureCandle({
          candles: [...down, five(25, 89, 120, 88, close)],
          breakoutIndex: 24,
          direction: 'SHORT_BTC',
          context: downContext,
        });
    expect(detectUp(100)).not.toBeNull();
    expect(detectUp(89)).toBeNull();
    expect(detectUp(90)).toBeNull();
    expect(detectUp(110)).toBeNull();
    expect(detectDown(100)).not.toBeNull();
    expect(detectDown(111)).toBeNull();
    expect(detectDown(90)).toBeNull();
    expect(detectDown(110)).toBeNull();
  });
  it('selects the first strictly-inside close after earlier closes remain outside', () => {
    const candles = [
        ...base(),
        five(25, 111, 113, 109, 111),
        five(26, 111, 113, 109, 110),
        five(27, 111, 113, 89, 89),
        five(28, 109, 111, 99, 100),
        five(29, 100, 102, 98, 101),
      ],
      context = calculateCompressionContext(candles, 24)!;
    expect(
      detectFailureCandle({
        candles,
        breakoutIndex: 24,
        direction: 'LONG_BTC',
        context,
      })?.index,
    ).toBe(28);
  });
  it('accepts failure candle one and six but not beyond 30 elapsed minutes or across a gap', () => {
    const c = calculateCompressionContext(base(), 24)!;
    expect(
      detectFailureCandle({
        candles: [...base(), five(25, 111, 112, 100, 109)],
        breakoutIndex: 24,
        direction: 'LONG_BTC',
        context: c,
      }),
    ).not.toBeNull();
    const sixth = [
      ...base(),
      ...Array.from({ length: 6 }, (_, i) => five(25 + i, 111, 112, 100, i === 5 ? 109 : 111)),
    ];
    expect(
      detectFailureCandle({ candles: sixth, breakoutIndex: 24, direction: 'LONG_BTC', context: c })
        ?.index,
    ).toBe(30);
    expect(
      detectFailureCandle({
        candles: [...base(), five(31, 111, 112, 100, 109)],
        breakoutIndex: 24,
        direction: 'LONG_BTC',
        context: c,
      }),
    ).toBeNull();
  });
  it('uses failed boundary, minute-30 entry, rejects minute 31, and reports dataset-end states', () => {
    const failure = five(25, 111, 112, 100, 109),
      tail = Array.from({ length: 30 }, (_, i) =>
        one(130 + i, 109, i === 29 ? 110.2 : 109.9, 109, 109),
      );
    const r = runBTC5MFailedBreakoutReversal5XCostReplay({
      candles: history([failure], tail),
      market: Market,
      leverageSource: 'TEST',
    });
    expect(r.campaigns[0]).toEqual(
      expect.objectContaining({
        tradeDirection: 'SHORT_BTC',
        entryLimitPrice: 110,
        minutesFailureToEntry: 30,
      }),
    );
    const late = runBTC5MFailedBreakoutReversal5XCostReplay({
      candles: history(
        [failure],
        [...tail.slice(0, 29), one(159, 109, 109.9, 109, 109), one(160, 109, 110.2, 109, 109)],
      ),
      market: Market,
      leverageSource: 'TEST',
    });
    expect(late.campaigns[0]?.outcome).toBe('ENTRY_FAILED');
    expect(
      runBTC5MFailedBreakoutReversal5XCostReplay({
        candles: history([]),
        market: Market,
        leverageSource: 'TEST',
      }).campaigns[0]?.outcome,
    ).toBe('WAITING_AT_DATASET_END');
  });
  it('uses causal five-cost geometry, metadata leverage, sizing, conservative ambiguity and actual fees', () => {
    const failure = five(25, 111, 112, 100, 109),
      r = runBTC5MFailedBreakoutReversal5XCostReplay({
        candles: history([failure], [one(130, 110, 112, 108, 110)]),
        market: Market,
        leverageSource: 'RESEARCH_MARKET_METADATA_SNAPSHOT',
      }),
      c = r.campaigns[0]!;
    expect(c).toEqual(expect.objectContaining({ entryLeverage: 53, outcome: 'STOP_LOSS' }));
    expect(c.quantity).toBe(calculateSingleLegSizing(30, 110, Market)?.quantity);
    expect(c.expectedCampaignCostDollars).toBeCloseTo(c.entryNotional! * 0.003);
    expect(c.actualStopCostMultiple).toBeGreaterThanOrEqual(5);
    expect(c.actualTakeProfitCostMultiple).toBeGreaterThanOrEqual(5);
    expect(c.totalFees).toBeCloseTo(c.entryNotional! * 0.001 + c.exitPrice! * c.quantity! * 0.002);
    expect(r.overall.totalDeposited).toBe(15);
    expect(r.overall.economicPnL).toBeCloseTo(c.netPnL);
  });
  it('preserves strict maintenance equality and required report/comparison fields', () => {
    expect(
      evaluateSingleLegMarginGuard({
        equity: 25,
        direction: 'LONG_BTC',
        entryPrice: 100,
        markPrice: 100,
        quantity: 1,
        maximumLeverage: 2,
      }).triggered,
    ).toBe(false);
    const artifact = {
        holdout: {
          completedCampaignCount: 1,
          tpRate: 0,
          grossProfitFactor: 0,
          netProfitFactor: 0,
          grossPnLSum: -1,
          netPnLSum: -2,
          meanHoldingMinutes: 1,
          medianHoldingMinutes: 1,
        },
      },
      r = runBTC5MFailedBreakoutReversal5XCostReplay({
        candles: history([five(25, 111, 112, 100, 109)], [one(130, 110, 111, 109, 110)]),
        market: Market,
        leverageSource: 'TEST',
        compressionReport: artifact,
      });
    expect(r.comparison.compressionContinuation.available).toBe(true);
    expect(r.comparison.impulsePullback.available).toBe(false);
    expect(r.bySevenDayBlock[0]).toEqual(
      expect.objectContaining({
        failureConfirmedCount: 1,
        entryAttempts: 1,
        entryFills: 1,
        completedCampaignCount: 0,
        grossPnLSum: 0,
        netPnLSum: 0,
      }),
    );
    expect(artifact.holdout.completedCampaignCount).toBe(1);
  });
  it('classifies exactly', () => {
    expect(
      classifyFailedBreakout5XCost(
        metrics({
          completedCampaignCount: 30,
          grossProfitFactor: 1,
          netProfitFactor: 1,
          netPnLSum: 1,
        }),
        1,
      ),
    ).toBe('BTC_5M_FAILED_BREAKOUT_REVERSAL_5X_COST_HOLDOUT_PROMISING');
    expect(
      classifyFailedBreakout5XCost(
        metrics({ completedCampaignCount: 30, grossProfitFactor: 1, netProfitFactor: 0.8 }),
        -1,
      ),
    ).toBe('BTC_5M_FAILED_BREAKOUT_REVERSAL_5X_COST_HOLDOUT_INTERESTING');
    expect(
      classifyFailedBreakout5XCost(
        metrics({
          completedCampaignCount: 29,
          grossProfitFactor: 2,
          netProfitFactor: 2,
          netPnLSum: 2,
        }),
        2,
      ),
    ).toBe('NO_USEFUL_BTC_5M_FAILED_BREAKOUT_REVERSAL_5X_COST_EDGE');
    expect(BTC5MFailedBreakoutReversal5XCostExperiment.failureCandles).toBe(6);
  });
});
