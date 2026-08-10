import { describe, expect, it } from 'vitest';

import {
  BTCEthPairStrategy,
  applyExternalDepositIfRequired,
  calculateMarkedPairAccountEquity,
  calculatePairMaintenanceMargin,
  calculatePairLeverage,
  calculatePairSignal,
  evaluatePairMarginHealth,
  evaluatePairExit,
  runBTCEthPairBacktest,
  sizeEqualNotionalPair,
  sizeMissingHedgeLeg,
  synchronizePairCandles,
  pair_sizing_error,
  type pair_market,
} from '../src/btc_eth_pair.js';
import type { BTC_candlestick } from '../src/decibel_client.js';

const candle = (
  minute: number,
  close: number,
  low = close - 1,
  high = close + 1,
): BTC_candlestick => ({
  timestamp: new Date(minute * 60_000),
  open: close,
  high,
  low,
  close,
  volume: 1,
});
const BTCMarket: pair_market = {
  marketAddress: 'btc',
  tickSize: 0.1,
  lotSize: 0.001,
  minimumSize: 0.001,
  maximumLeverage: 40,
  makerFeeRate: 0.0001,
  takerFeeRate: 0.0003,
};
const ETHMarket: pair_market = {
  ...BTCMarket,
  marketAddress: 'eth',
  tickSize: 0.01,
  lotSize: 0.01,
  minimumSize: 0.01,
  maximumLeverage: 25,
};
const run = (btc: BTC_candlestick[], eth: BTC_candlestick[], startingEquity = 100) =>
  runBTCEthPairBacktest({
    btcCandles: btc,
    ethCandles: eth,
    btcMarket: BTCMarket,
    ethMarket: ETHMarket,
    startingEquity,
    leverageSource: 'MARKET_METADATA',
  });

describe('BTC/ETH pair data and signal', () => {
  it('intersects genuine aligned timestamps without forward filling', () => {
    const result = synchronizePairCandles(
      [candle(0, 100), candle(1, 101), candle(3, 103)],
      [candle(0, 50), candle(2, 51), candle(3, 52)],
    );
    expect(result.candles.map((value) => value.timestamp.getTime())).toEqual([0, 180_000]);
    expect(result.data).toMatchObject({
      btc1mBars: 3,
      eth1mBars: 3,
      synchronized1mBars: 2,
      btcOnlyTimestampsDropped: 1,
      ethOnlyTimestampsDropped: 1,
    });
  });

  it.each([
    [[100, 100, 100, 103], [100, 100, 100, 101], 'LONG_BTC_SHORT_ETH'],
    [[100, 100, 100, 101], [100, 100, 100, 103], 'SHORT_BTC_LONG_ETH'],
    [[100, 100, 100, 102], [50, 50, 50, 51], null],
  ] as const)('uses exactly t and t-3 for direction', (btcCloses, ethCloses, direction) => {
    const synchronized = synchronizePairCandles(
      btcCloses.map((close, index) => candle(index, close)),
      ethCloses.map((close, index) => candle(index, close)),
    ).candles;
    const signal = calculatePairSignal(synchronized, 3)!;
    expect(signal.btcReturn3).toBeCloseTo(btcCloses[3] / btcCloses[0] - 1);
    expect(signal.ethReturn3).toBeCloseTo(ethCloses[3] / ethCloses[0] - 1);
    expect(signal.direction).toBe(direction);
  });
});

describe('BTC/ETH pair sizing and economics', () => {
  it('uses dynamic common leverage, equal notional, lot rounding, and near-75% margin', () => {
    expect(calculatePairLeverage(40, 25)).toBe(25);
    expect(calculatePairLeverage(100, 75)).toBe(75);
    const sized = sizeEqualNotionalPair({
      availableMargin: 100,
      btcPrice: 100,
      ethPrice: 25,
      btcMarket: BTCMarket,
      ethMarket: ETHMarket,
    });
    expect(sized.pairLeverage).toBe(25);
    expect(sized.marginUtilization).toBeGreaterThanOrEqual(0.75);
    expect(sized.marginUtilization).toBeLessThan(1);
    expect(sized.btcQuantity / BTCMarket.lotSize).toBeCloseTo(
      Math.round(sized.btcQuantity / BTCMarket.lotSize),
    );
    expect(sized.ethQuantity / ETHMarket.lotSize).toBeCloseTo(
      Math.round(sized.ethQuantity / ETHMarket.lotSize),
    );
    expect(sized.btcQuantity).not.toBe(sized.ethQuantity);
    expect(sized.notionalMismatchBps).toBeLessThan(10);
  });

  it('sizes the $30 reproduction with normalized retained Decibel rules', () => {
    const sized = sizeEqualNotionalPair({
      availableMargin: 30,
      btcPrice: 78_343.6,
      ethPrice: 2_302.5,
      btcMarket: {
        ...BTCMarket,
        lotSize: 0.00001,
        minimumSize: 0.00002,
        maximumLeverage: 40,
      },
      ethMarket: {
        ...ETHMarket,
        lotSize: 0.0001,
        minimumSize: 0.0005,
        maximumLeverage: 25,
      },
    });
    expect(sized.pairLeverage).toBe(25);
    expect(sized.targetNotionalPerLeg).toBe(375);
    expect(sized.btcNotional).toBeGreaterThan(30);
    expect(sized.ethNotional).toBeGreaterThan(30);
    expect(sized.btcInitialMargin + sized.ethInitialMargin).toBeCloseTo(
      sized.totalInitialMargin,
      12,
    );
    expect(sized.totalInitialMargin).toBeLessThanOrEqual(30);
    expect(sized.marginUtilization).toBeGreaterThan(0.8);
    expect(sized.marginUtilization).toBeLessThan(1);
    expect(sized.notionalMismatch).toBeLessThanOrEqual(
      Math.max(78_343.6 * 0.00001, 2_302.5 * 0.0001) + 1e-9,
    );
  });

  it.each([
    [
      'BTC_BELOW_MINIMUM_SIZE',
      {
        availableMargin: 0.01,
        btcPrice: 78_343.6,
        ethPrice: 2_302.5,
        btcMarket: { ...BTCMarket, lotSize: 0.00001, minimumSize: 0.00002 },
        ethMarket: { ...ETHMarket, lotSize: 0.0001, minimumSize: 0.0005 },
      },
    ],
    [
      'INVALID_MARKET_RULES',
      {
        availableMargin: 30,
        btcPrice: 78_343.6,
        ethPrice: 2_302.5,
        btcMarket: { ...BTCMarket, lotSize: 0 },
        ethMarket: ETHMarket,
      },
    ],
    [
      'INVALID_PAIR_LEVERAGE',
      {
        availableMargin: 30,
        btcPrice: 78_343.6,
        ethPrice: 2_302.5,
        btcMarket: { ...BTCMarket, maximumLeverage: 0 },
        ethMarket: ETHMarket,
      },
    ],
  ] as const)('fails sizing explicitly with %s', (reason, input) => {
    try {
      sizeEqualNotionalPair(input);
      throw new Error('Expected sizing failure');
    } catch (error) {
      expect(error).toBeInstanceOf(pair_sizing_error);
      expect((error as pair_sizing_error).reason).toBe(reason);
      expect((error as pair_sizing_error).diagnostics.targetMarginUtilization).toBe(0.75);
    }
  });

  it('applies exact pair-level TP, stop, and margin-guard precedence', () => {
    expect(
      evaluatePairExit({
        grossPairPnL: 2.5,
        entryFees: 0.5,
        expectedMakerExitFees: 0.5,
        expectedTakerExitFees: 1,
        markedAccountEquity: 100,
        totalMaintenanceMargin: 75,
      }),
    ).toBe('TAKE_PROFIT');
    expect(
      evaluatePairExit({
        grossPairPnL: -6,
        entryFees: 0.5,
        expectedMakerExitFees: 0.5,
        expectedTakerExitFees: 1,
        markedAccountEquity: 100,
        totalMaintenanceMargin: 75,
      }),
    ).toBe('STOP_LOSS');
    expect(
      evaluatePairExit({
        grossPairPnL: 100,
        entryFees: 0.5,
        expectedMakerExitFees: 0.5,
        expectedTakerExitFees: 1,
        markedAccountEquity: 74,
        totalMaintenanceMargin: 75,
      }),
    ).toBe('MARGIN_GUARD');
  });

  it('derives each Decibel maintenance fraction from that market maximum leverage', () => {
    const result = calculatePairMaintenanceMargin({
      btcQuantity: 0.01,
      ethQuantity: 0.5,
      btcMarkPrice: 100_000,
      ethMarkPrice: 2_000,
      btcMaximumLeverage: 40,
      ethMaximumLeverage: 25,
    });
    expect(result).toEqual({
      btcMMFraction: 0.0125,
      ethMMFraction: 0.02,
      btcCurrentNotional: 1_000,
      ethCurrentNotional: 1_000,
      btcMaintenanceMargin: 12.5,
      ethMaintenanceMargin: 20,
      totalMaintenanceMargin: 32.5,
    });
    expect(
      calculatePairMaintenanceMargin({
        btcQuantity: -2,
        ethQuantity: -3,
        btcMarkPrice: 10,
        ethMarkPrice: 20,
        btcMaximumLeverage: 10,
        ethMaximumLeverage: 20,
      }).totalMaintenanceMargin,
    ).toBe(2.5);
  });

  it('marks both legs directionally and uses zero historical funding by default', () => {
    expect(
      calculateMarkedPairAccountEquity({
        realizedAccountCollateral: 100,
        btcSide: 'BUY',
        btcEntryPrice: 100,
        btcMarkPrice: 110,
        btcQuantity: 2,
        ethSide: 'SELL',
        ethEntryPrice: 100,
        ethMarkPrice: 90,
        ethQuantity: 3,
      }),
    ).toEqual({
      btcUnrealizedPnL: 20,
      ethUnrealizedPnL: 30,
      fundingContribution: 0,
      markedAccountEquity: 150,
    });
  });

  it('guards only below maintenance and keeps warning bands diagnostic', () => {
    expect(evaluatePairMarginHealth(150, 100)).toMatchObject({
      warning150Breached: false,
      liquidationEligible: false,
    });
    expect(evaluatePairMarginHealth(120, 100).liquidationEligible).toBe(false);
    expect(evaluatePairMarginHealth(105, 100).liquidationEligible).toBe(false);
    expect(evaluatePairMarginHealth(100, 100).liquidationEligible).toBe(false);
    expect(evaluatePairMarginHealth(99.99, 100)).toMatchObject({
      warning150Breached: true,
      warning120Breached: true,
      warning105Breached: true,
      liquidationEligible: true,
    });
    expect(
      evaluatePairExit({
        grossPairPnL: 0,
        entryFees: 1,
        expectedMakerExitFees: 1,
        expectedTakerExitFees: 1,
        markedAccountEquity: 100,
        totalMaintenanceMargin: 100,
      }),
    ).toBeNull();
  });

  it('does not use the removed initial-margin proxy as a liquidation threshold', () => {
    const maintenance = calculatePairMaintenanceMargin({
      btcQuantity: 1,
      ethQuantity: 1,
      btcMarkPrice: 400,
      ethMarkPrice: 400,
      btcMaximumLeverage: 40,
      ethMaximumLeverage: 40,
    });
    expect(maintenance.totalMaintenanceMargin).toBe(10);
    expect(
      evaluatePairExit({
        grossPairPnL: 0,
        entryFees: 1,
        expectedMakerExitFees: 1,
        expectedTakerExitFees: 1,
        markedAccountEquity: 25,
        totalMaintenanceMargin: maintenance.totalMaintenanceMargin,
      }),
    ).toBeNull();
  });

  it('sizes the missing hedge from actual first-leg notional at the current executable price', () => {
    const quantity = sizeMissingHedgeLeg({
      firstLegNotional: 400,
      executablePrice: 25,
      market: ETHMarket,
      existingInitialMargin: 16,
      availableMargin: 40,
      pairLeverage: 25,
    });
    expect(quantity).toBe(16);
    expect(quantity * 25).toBe(400);
  });
});

describe('BTC/ETH research capital top-ups', () => {
  it.each([
    [15, 15, null],
    [14.99, 29.99, 15],
    [14.72, 29.72, 15],
    [12.4, 27.4, 15],
  ] as const)('applies the flat-only $15 rule to %s', (before, after, amount) => {
    const result = applyExternalDepositIfRequired(before, true, 123_000);
    expect(result.equity).toBe(after);
    expect(result.event?.amount ?? null).toBe(amount);
    if (result.event)
      expect(result.event).toEqual({
        type: 'EXTERNAL_DEPOSIT',
        timestamp: 123_000,
        equityBeforeDeposit: before,
        amount: 15,
        equityAfterDeposit: after,
      });
  });

  it('never deposits into a non-flat campaign and permits repeated later deposits', () => {
    expect(applyExternalDepositIfRequired(10, false, 1)).toEqual({ equity: 10, event: null });
    const first = applyExternalDepositIfRequired(10, true, 2),
      second = applyExternalDepositIfRequired(14, true, 3);
    expect([first.event?.amount, second.event?.amount]).toEqual([15, 15]);
  });

  it('reconciles deposits separately from trading PnL in the account report', () => {
    const candles = [0, 1, 2, 3].map((minute) => candle(minute, 100));
    const report = run(candles, candles, 14.72);
    expect(report).toMatchObject({
      initialCapital: 14.72,
      depositCount: 1,
      totalDeposited: 15,
      totalCapitalContributed: 29.72,
      endingAccountEquity: 29.72,
      tradingNetPnL: 0,
      netReturnOnContributedCapital: 0,
    });
    expect(report.depositEvents).toHaveLength(1);
  });
});

describe('BTC/ETH pair lifecycle', () => {
  it('creates synchronized next-bar LIMIT fills, freezes direction, and closes both legs', () => {
    const btc = [100, 100, 100, 103, 103, 104, 104].map((close, index) =>
        candle(index, close, close - 1, close + 1),
      ),
      eth = [100, 100, 100, 100, 100, 99, 99].map((close, index) =>
        candle(index, close, close - 1, close + 1),
      );
    const report = run(btc, eth);
    expect(report.campaignIntents).toBe(1);
    expect(report.campaignsActivated).toBe(1);
    expect(report.campaignsCompleted).toBe(1);
    expect(report.entryOrders).toBe(2);
    expect(report.entryFills).toBe(2);
    expect(report.campaigns[0]).toMatchObject({
      direction: 'LONG_BTC_SHORT_ETH',
      entryLeggingBars: 0,
      exitReason: 'TAKE_PROFIT',
      fundingMode: 'UNAVAILABLE',
    });
    expect(report.campaigns[0]!.btcEntryFillTimestamp).toBe(5 * 60_000);
    expect(report.campaigns[0]!.ethEntryFillTimestamp).toBe(5 * 60_000);
    expect(report.liveExecutionEnabled).toBe(false);
  });

  it('keeps one filled leg in hedge completion and fills the repriced hedge as taker', () => {
    const btc = [100, 100, 100, 103, 103, 103, 104, 104].map((close, index) =>
        candle(index, close, close - 1, close + 1),
      ),
      eth = [100, 100, 100, 100, 90, 90, 89, 89].map((close, index) =>
        index === 4
          ? candle(index, close, close, close)
          : candle(index, close, close - 1, close + 1),
      );
    const report = run(btc, eth);
    expect(report.entryFills).toBe(2);
    expect(report.entryAbortCount).toBe(0);
    expect(report.pairsRequiringHedgeCompletion).toBe(1);
    expect(report.hedgeCompletionSuccessCount).toBe(1);
    expect(report.campaigns[0]).toMatchObject({
      requiredHedgeCompletion: true,
      firstLegFilled: 'BTC',
      hedgeCompletionBars: 1,
    });
    expect(report.campaigns[0]!.takerEntryFees).toBeGreaterThan(0);
  });

  it('activates after a one-bar legged hedge without opening or flipping another pair', () => {
    const btc = [100, 100, 100, 103, 103, 103, 102].map((close, index) =>
        candle(index, close, close - 1, close + 1),
      ),
      eth = [100, 100, 100, 100, 99, 100, 101].map((close, index) =>
        index === 4
          ? candle(index, close, close - 1, 100)
          : candle(index, close, close - 1, close + 1),
      );
    const report = run(btc, eth);
    expect(report.campaignIntents).toBe(1);
    expect(report.campaignsActivated).toBe(1);
    expect(report.entryFills).toBe(2);
    expect(report.campaignsCompleted).toBe(0);
  });

  it('does not fill on the signal candle and cancels both when neither fills next bar', () => {
    const btc = [100, 100, 100, 103, 110].map((close, index) => candle(index, close, close, close)),
      eth = [100, 100, 100, 100, 90].map((close, index) => candle(index, close, close, close));
    const report = run(btc, eth);
    expect(report.campaignIntents).toBe(1);
    expect(report.entryFills).toBe(0);
    expect(report.campaignsActivated).toBe(0);
    expect(report.campaignsCompleted).toBe(0);
  });

  it('contains no DCA, daily-target, martingale, or live-execution surface', () => {
    expect(BTCEthPairStrategy).toMatchObject({
      returnLookbackBars: 3,
      minimumMarginUtilization: 0.75,
      takeProfitCostMultiple: 1.5,
      stopLossCostMultiple: 3,
      liveExecutionEnabled: false,
    });
    expect(JSON.stringify(BTCEthPairStrategy)).not.toMatch(/DCA|martingale|dailyTarget/i);
  });
});
