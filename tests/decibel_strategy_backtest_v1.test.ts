import { describe, expect, it } from 'vitest';
import {
  DECIBEL_BACKTEST_DEFAULT_CONFIG_V1,
  overrideDecibelBacktestPolicyV1,
  runDecibelStrategyBacktestV1,
  scaleDecibelBacktestBpsV1,
  type decibel_backtest_bbo_v1,
} from '../src/decibel_strategy_backtest_v1.js';
import { DECIBEL_STRATEGY_POLICY_V1 } from '../src/decibel_strategy_policy_v1.js';

const start = 1_800_000_000_000;
// Plain rules: no candle filter, DCA or adverse steps unless a test turns them on.
const config = {
  ...DECIBEL_BACKTEST_DEFAULT_CONFIG_V1,
  entryCandleFilter: false,
  dcaEnabled: false,
  adverseRuleEnabled: false,
};
const flatBook = (from: number, seconds: number, bid: number): decibel_backtest_bbo_v1[] =>
  Array.from({ length: seconds }, (_, i) => ({ at: from + i * 1000, bid, ask: bid + 0.1 }));

describe('decibel strategy backtest v1', () => {
  it('fills a resting entry on a trade-through and exits at the TP for a net profit', () => {
    const rows = [
      ...flatBook(start, 5, 100_000),
      { at: start + 5_000, bid: 99_999.9, ask: 100_000 }, // the BUY at 100,000 fills
      ...flatBook(start + 6_000, 3, 100_000),
      { at: start + 9_000, bid: 100_050, ask: 100_050.1 }, // trades through the TP
    ];
    const result = runDecibelStrategyBacktestV1(rows, config);
    expect(result.trips).toHaveLength(1);
    const [trip] = result.trips;
    expect(trip).toMatchObject({ side: 'LONG', exit: 'TP', additions: 0 });
    expect(trip!.netPnlUsd).toBeGreaterThan(0);
    // Net target 1.5 bps without a range, after two 1.5 bps maker fees.
    expect(trip!.netBps).toBeCloseTo(1.5, 0);
    expect(result.takerVolumeUsd).toBe(0);
  });

  it('unwinds at the touch with the taker fee when the session Max Loss is reached', () => {
    const rows = [
      ...flatBook(start, 3, 100_000),
      { at: start + 3_000, bid: 99_999.9, ask: 100_000 },
      { at: start + 4_000, bid: 98_000, ask: 98_000.1 },
    ];
    // Max Loss 0.5 leaves 0.5 x 0.95 / 1.53% = $31 of risk capacity for the $30 entry.
    const result = runDecibelStrategyBacktestV1(rows, { ...config, maxLossUsd: 0.5 });
    expect(result.trips.map((trip) => trip.exit)).toEqual(['MAX_LOSS']);
    expect(result.sessionsMaxLoss).toBe(1);
    expect(result.takerVolumeUsd).toBeGreaterThan(0);
    expect(result.netPnlUsd).toBeLessThan(-0.5);
    // Below the entry size, the risk capacity blocks entries altogether.
    expect(runDecibelStrategyBacktestV1(rows, { ...config, maxLossUsd: 0.1 }).trips).toHaveLength(
      0,
    );
  });

  it('treats a long data gap as a restart and unwinds the open position', () => {
    const rows = [
      ...flatBook(start, 3, 100_000),
      { at: start + 3_000, bid: 99_999.9, ask: 100_000 },
      { at: start + 3_000 + 10 * 60_000, bid: 100_010, ask: 100_010.1 },
    ];
    const result = runDecibelStrategyBacktestV1(rows, config);
    expect(result.trips.map((trip) => trip.exit)).toEqual(['DATA_GAP']);
    expect(result.sessionsDataGap).toBe(1);
  });

  it('adds once at the DCA trigger after the move settles and averages the entry', () => {
    // Long at 100,000, then 50 bps lower for 15 minutes with flat 5-minute candles.
    const rows = [
      ...flatBook(start, 3, 100_000),
      { at: start + 3_000, bid: 99_999.9, ask: 100_000 },
      ...flatBook(start + 4_000, 15 * 60, 99_500),
      { at: start + 4_000 + 15 * 60_000, bid: 99_499.9, ask: 99_500 },
    ];
    const result = runDecibelStrategyBacktestV1(rows, {
      ...config,
      dcaEnabled: true,
      maxLossUsd: 5,
    });
    expect(result.dcaAdditions).toBe(1);
  });

  it('scales bps by the range and overrides policy fields by path', () => {
    expect(scaleDecibelBacktestBpsV1(null, { factor: 1.2, minBps: 10, maxBps: 25 })).toBe(10);
    expect(scaleDecibelBacktestBpsV1(15, { factor: 1.2, minBps: 10, maxBps: 25 })).toBe(18);
    expect(scaleDecibelBacktestBpsV1(100, { factor: 1.2, minBps: 10, maxBps: 25 })).toBe(25);
    const policy = overrideDecibelBacktestPolicyV1(
      DECIBEL_STRATEGY_POLICY_V1,
      'adverse.candleCloses',
      4,
    );
    expect(policy.adverse.candleCloses).toBe(4);
    expect(DECIBEL_STRATEGY_POLICY_V1.adverse.candleCloses).toBe(3);
    expect(() =>
      overrideDecibelBacktestPolicyV1(DECIBEL_STRATEGY_POLICY_V1, 'adverse.unknown', 1),
    ).toThrow('BACKTEST_POLICY_PATH_INVALID');
    expect(() =>
      overrideDecibelBacktestPolicyV1(DECIBEL_STRATEGY_POLICY_V1, 'adverse.safeBand', 1),
    ).toThrow('BACKTEST_POLICY_PATH_NOT_NUMBER');
  });
});
