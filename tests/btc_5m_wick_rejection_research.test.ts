import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import {
  BTC5MWickRejectionExperiment,
  aggregateBTCOneMinuteCandles,
  calculateSingleLegSizing,
  calculateWickGeometry,
  classifyWickReport,
  detectWickSignal,
  evaluateSingleLegMarginGuard,
  isResearchLimitFillable,
  runBTC5MWickRejectionReplay,
  type btc_research_market,
  type five_minute_candle,
  type metric_summary,
} from '../src/btc_5m_wick_rejection_research.js';
import type { BTC_candlestick } from '../src/decibel_client.js';
import { resolveLocalBTCResearchMarket } from '../src/btc_5m_wick_rejection_research_command.js';

const at = (
  minute: number,
  open = 100,
  high = 102,
  low = 98,
  close = 101,
  volume = 1,
): BTC_candlestick => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, minute)),
  open,
  high,
  low,
  close,
  volume,
});
const five = (values: Partial<five_minute_candle>): five_minute_candle => ({
  timestamp: new Date(Date.UTC(2026, 0, 1)),
  endTimestamp: new Date(Date.UTC(2026, 0, 1, 0, 5)),
  open: 100,
  high: 107,
  low: 88,
  close: 106,
  volume: 5,
  ...values,
});
const Market: btc_research_market = {
  marketAddress: 'btc',
  tickSize: 1,
  lotSize: 0.01,
  minimumSize: 0.01,
  maximumLeverage: 2,
  makerFeeRate: 0.001,
  takerFeeRate: 0.002,
};
const summary = (overrides: Partial<metric_summary> = {}): metric_summary => ({
  rawSignalCount: 0,
  signalIgnoredWhileActiveCount: 0,
  entryFilledCount: 0,
  completedCampaignCount: 0,
  takeProfitCount: 0,
  stopLossCount: 0,
  marginGuardCount: 0,
  tpRate: 0,
  grossPnLSum: 0,
  netPnLSum: 0,
  grossProfitFactor: null,
  netProfitFactor: null,
  meanHoldingMinutes: 0,
  medianHoldingMinutes: 0,
  ...overrides,
});

function createMetadataDatabases(): {
  Candles: Database.Database;
  Research: Database.Database;
} {
  const Candles = new Database(':memory:'),
    Research = new Database(':memory:');
  Candles.exec(`
    CREATE TABLE candlesticks(market_address TEXT,interval TEXT,timestamp_ms INTEGER);
    CREATE TABLE candlestick_market_symbols(symbol TEXT PRIMARY KEY,market_address TEXT);
  `);
  Research.exec(`
    CREATE TABLE research_market_metadata_snapshots(
      market_address TEXT,tick_size REAL,lot_size REAL,minimum_size REAL,
      maximum_leverage REAL,observed_at_ms INTEGER
    );
  `);
  return { Candles, Research };
}

function addOneMinuteGroup(database: Database.Database, address: string): void {
  database.prepare("INSERT INTO candlesticks VALUES(?,'1m',0)").run(address);
}

function addMetadata(database: Database.Database, address: string, maximumLeverage: number): void {
  database
    .prepare('INSERT INTO research_market_metadata_snapshots VALUES(?,?,?,?,?,?)')
    .run(address, 0.1, 0.00001, 0.00002, maximumLeverage, 1);
}

describe('BTC 5m wick rejection research', () => {
  it('resolves BTC exactly like pair research when only persisted ETH identity exists', () => {
    const { Candles, Research } = createMetadataDatabases();
    try {
      Candles.prepare('INSERT INTO candlestick_market_symbols VALUES(?,?)').run('ETH/USD', 'eth');
      addOneMinuteGroup(Candles, 'btc');
      addOneMinuteGroup(Candles, 'eth');
      addMetadata(Research, 'btc', 37);
      const resolved = resolveLocalBTCResearchMarket(Candles, Research, {
        makerFeeRate: 0.00011,
        takerFeeRate: 0.00034,
      });
      expect(resolved).toEqual({
        identitySource: 'CANDLE_GROUP_EXCLUDING_PERSISTED_ETH_IDENTITY',
        leverageSource: 'RESEARCH_MARKET_METADATA_SNAPSHOT',
        market: {
          marketAddress: 'btc',
          tickSize: 0.1,
          lotSize: 0.00001,
          minimumSize: 0.00002,
          maximumLeverage: 37,
          makerFeeRate: 0.00011,
          takerFeeRate: 0.00034,
        },
      });
      const sizing = calculateSingleLegSizing(30, 100, resolved.market);
      expect(sizing).not.toBeNull();
      expect(sizing?.initialMargin).toBeCloseTo((sizing?.notional ?? 0) / 37);
    } finally {
      Research.close();
      Candles.close();
    }
  });

  it('prefers an explicit persisted BTC identity and preserves non-40 metadata leverage', () => {
    const { Candles, Research } = createMetadataDatabases();
    try {
      Candles.prepare('INSERT INTO candlestick_market_symbols VALUES(?,?)').run('BTC/USD', 'btc');
      addOneMinuteGroup(Candles, 'btc');
      addMetadata(Research, 'btc', 53);
      const resolved = resolveLocalBTCResearchMarket(Candles, Research, {
        makerFeeRate: 0,
        takerFeeRate: 0,
      });
      expect(resolved.identitySource).toBe('PERSISTED_BTC_SYMBOL');
      expect(resolved.market.maximumLeverage).toBe(53);
    } finally {
      Research.close();
      Candles.close();
    }
  });

  it('fails explicitly when local BTC identity is ambiguous without any live lookup', () => {
    const { Candles, Research } = createMetadataDatabases();
    try {
      addOneMinuteGroup(Candles, 'first');
      addOneMinuteGroup(Candles, 'second');
      expect(() =>
        resolveLocalBTCResearchMarket(Candles, Research, {
          makerFeeRate: 0,
          takerFeeRate: 0,
        }),
      ).toThrow('BTC_MARKET_IDENTITY_UNAVAILABLE');
    } finally {
      Research.close();
      Candles.close();
    }
  });

  it('fails explicitly when canonical metadata has no legal maximum leverage', () => {
    const { Candles, Research } = createMetadataDatabases();
    try {
      addOneMinuteGroup(Candles, 'btc');
      addMetadata(Research, 'btc', 0);
      expect(() =>
        resolveLocalBTCResearchMarket(Candles, Research, {
          makerFeeRate: 0,
          takerFeeRate: 0,
        }),
      ).toThrow('BTC_MARKET_MAX_LEVERAGE_UNAVAILABLE');
    } finally {
      Research.close();
      Candles.close();
    }
  });

  it('builds exact UTC-aligned OHLCV only from five consecutive 1m candles', () => {
    const candles = [
      at(0, 100, 103, 99, 102, 1),
      at(1, 102, 104, 101, 103, 2),
      at(2, 103, 105, 97, 98, 3),
      at(3, 98, 101, 96, 100, 4),
      at(4, 100, 106, 99, 105, 5),
    ];
    expect(aggregateBTCOneMinuteCandles(candles)).toEqual([
      expect.objectContaining({
        timestamp: new Date(Date.UTC(2026, 0, 1)),
        endTimestamp: new Date(Date.UTC(2026, 0, 1, 0, 5)),
        open: 100,
        high: 106,
        low: 96,
        close: 105,
        volume: 15,
      }),
    ]);
    expect(aggregateBTCOneMinuteCandles(candles.slice(0, 4))).toEqual([]);
    expect(
      aggregateBTCOneMinuteCandles([candles[0]!, candles[1]!, candles[2]!, candles[4]!, at(5)]),
    ).toEqual([]);
  });

  it('applies exact LONG and SHORT wick geometry, midpoint, exclusivity, and flat-range rules', () => {
    const long = five({}),
      short = five({ open: 100, high: 112, low: 93, close: 94 });
    expect(calculateWickGeometry(long)).toEqual({
      range: 19,
      body: 6,
      upperWick: 1,
      lowerWick: 12,
      midpoint: 97.5,
    });
    expect(detectWickSignal(long)).toBe('LONG_BTC');
    expect(detectWickSignal(short)).toBe('SHORT_BTC');
    expect(detectWickSignal(five({ close: 97.5 }))).toBeNull();
    expect(detectWickSignal(five({ open: 100, high: 100, low: 100, close: 100 }))).toBeNull();
  });

  it('requires one-tick trade-through for the immediately following passive LIMIT candle', () => {
    expect(isResearchLimitFillable('LONG_BTC', 100, at(5, 101, 102, 99, 100), 1)).toBe(true);
    expect(isResearchLimitFillable('LONG_BTC', 100, at(5, 101, 102, 100, 101), 1)).toBe(false);
    expect(isResearchLimitFillable('SHORT_BTC', 100, at(5, 99, 101, 98, 100), 1)).toBe(true);
  });

  it('uses metadata leverage, legal lot sizing, and reserves fees within collateral', () => {
    const sized = calculateSingleLegSizing(30, 100, {
      ...Market,
      maximumLeverage: 7,
      lotSize: 0.03,
    });
    expect(sized).not.toBeNull();
    expect((sized?.quantity ?? 0) / 0.03).toBeCloseTo(Math.round((sized?.quantity ?? 0) / 0.03));
    expect((sized?.initialMargin ?? 31) + (sized?.notional ?? 0) * 0.003).toBeLessThan(30);
    expect(BTC5MWickRejectionExperiment.startingEquity).toBe(30);
  });

  it('uses strict maintenance inequality and does not trigger at equality', () => {
    const equality = evaluateSingleLegMarginGuard({
      equity: 25,
      direction: 'LONG_BTC',
      entryPrice: 100,
      markPrice: 100,
      quantity: 1,
      maximumLeverage: 2,
    });
    expect(equality.maintenanceMargin).toBe(25);
    expect(equality.triggered).toBe(false);
    expect(
      evaluateSingleLegMarginGuard({
        equity: 24.99,
        direction: 'LONG_BTC',
        entryPrice: 100,
        markPrice: 100,
        quantity: 1,
        maximumLeverage: 2,
      }).triggered,
    ).toBe(true);
  });

  it('expires an unfilled entry after exactly one 1m candle without creating a campaign', () => {
    const source = [
      at(0, 100, 101, 88, 99),
      at(1, 99, 102, 98, 100),
      at(2, 100, 104, 99, 103),
      at(3, 103, 106, 102, 105),
      at(4, 105, 107, 104, 106),
      at(5, 108, 110, 107, 109),
      at(6, 106, 125, 105, 124),
    ];
    const report = runBTC5MWickRejectionReplay({
      candles: source,
      market: Market,
      leverageSource: 'TEST_METADATA',
    });
    expect(report.signalAccounting).toEqual(
      expect.objectContaining({
        rawSignalCount: 1,
        entryAttemptCount: 1,
        entryFilledCount: 0,
        entryFailedCount: 1,
      }),
    );
    expect(report.campaigns).toEqual([]);
  });

  it('uses signal close LIMIT, actual fill risk, fixed wick stop, exact 1R TP, and 1m execution', () => {
    const source = [
      at(0, 100, 101, 88, 99),
      at(1, 99, 102, 98, 100),
      at(2, 100, 104, 99, 103),
      at(3, 103, 106, 102, 105),
      at(4, 105, 107, 104, 106),
      at(5, 106, 125, 105, 124),
    ];
    const report = runBTC5MWickRejectionReplay({
      candles: source,
      market: Market,
      leverageSource: 'TEST_METADATA',
    });
    const campaign = report.campaigns[0]!;
    expect(campaign).toEqual(
      expect.objectContaining({
        entryOrderTimestamp: Date.UTC(2026, 0, 1, 0, 5),
        entryFillPrice: 106,
        stopTriggerPrice: 88,
        riskDistance: 18,
        takeProfitTriggerPrice: 124,
        outcome: 'TAKE_PROFIT',
        holdingMinutes: 0,
        entryLeverage: 2,
      }),
    );
  });

  it('resolves same-fill-candle TP/SL ambiguity conservatively to STOP_LOSS', () => {
    const source = [
      at(0, 100, 101, 88, 99),
      at(1, 99, 102, 98, 100),
      at(2, 100, 104, 99, 103),
      at(3, 103, 106, 102, 105),
      at(4, 105, 107, 104, 106),
      at(5, 106, 125, 87, 100),
    ];
    const report = runBTC5MWickRejectionReplay({
      candles: source,
      market: Market,
      leverageSource: 'TEST_METADATA',
    });
    expect(report.campaigns[0]?.outcome).toBe('STOP_LOSS');
  });

  it('ignores active-period signals, keeps one sequential position, and does not fabricate dataset-end close', () => {
    const first = [
      at(0, 100, 101, 70, 99),
      at(1, 99, 102, 98, 100),
      at(2, 100, 104, 99, 103),
      at(3, 103, 106, 102, 105),
      at(4, 105, 107, 104, 106),
    ];
    const quiet = Array.from({ length: 5 }, (_, index) => at(index + 5, 100, 107, 88, 106));
    const report = runBTC5MWickRejectionReplay({
      candles: [...first, ...quiet],
      market: Market,
      leverageSource: 'TEST_METADATA',
    });
    expect(report.campaigns).toHaveLength(1);
    expect(report.campaigns[0]?.outcome).toBe('OPEN_AT_DATASET_END');
    expect(report.signalAccounting.signalIgnoredWhileActiveCount).toBeGreaterThan(0);
    expect(report.overall.openAtDatasetEndCount).toBe(1);
  });

  it('applies sequential net PnL and exact repeated external deposits without treating deposits as PnL', () => {
    const minutes: BTC_candlestick[] = [];
    for (let offset = 0; offset < 15; offset += 5) {
      minutes.push(
        at(offset, 100, 101, 88, 99),
        at(offset + 1, 99, 102, 98, 100),
        at(offset + 2, 100, 104, 99, 103),
        at(offset + 3, 103, 106, 102, 105),
        at(offset + 4, 105, 107, 104, 106),
      );
      if (offset < 10) minutes.push(at(offset + 5, 106, 107, 87, 88));
    }
    const report = runBTC5MWickRejectionReplay({
      candles: minutes,
      market: { ...Market, maximumLeverage: 4 },
      leverageSource: 'TEST_METADATA',
    });
    expect(report.overall.depositCount).toBeGreaterThan(0);
    expect(report.overall.totalDeposited).toBe(report.overall.depositCount * 15);
    expect(report.overall.economicPnL).toBeCloseTo(
      report.overall.endingEquity - 30 - report.overall.totalDeposited,
    );
    for (let index = 1; index < report.campaigns.length; index += 1)
      expect(report.campaigns[index]!.equityBeforeCampaign).toBeCloseTo(
        report.campaigns[index - 1]!.equityAfterRealization +
          report.campaigns[index - 1]!.depositAppliedAfterCampaign,
      );
  });

  it('keeps split and seven-day diagnostics observational and aggregates directions', () => {
    const source = [
      at(0, 100, 101, 88, 99),
      at(1, 99, 102, 98, 100),
      at(2, 100, 104, 99, 103),
      at(3, 103, 106, 102, 105),
      at(4, 105, 107, 104, 106),
      at(5, 106, 125, 105, 124),
    ];
    const report = runBTC5MWickRejectionReplay({
      candles: source,
      market: Market,
      leverageSource: 'TEST_METADATA',
    });
    expect(report.campaigns[0]?.splitLabel).toBe('HOLDOUT');
    expect(report.byDirection.LONG_BTC.entryFilledCount).toBe(1);
    expect(report.byDirection.SHORT_BTC.entryFilledCount).toBe(0);
    expect(report.bySevenDayBlock).toHaveLength(1);
  });

  it('implements the frozen classification thresholds exactly', () => {
    expect(
      classifyWickReport(
        summary({
          completedCampaignCount: 30,
          grossProfitFactor: 1,
          netProfitFactor: 1,
          netPnLSum: 1,
        }),
        1,
      ),
    ).toBe('BTC_5M_WICK_1R_HOLDOUT_PROMISING');
    expect(
      classifyWickReport(
        summary({ completedCampaignCount: 30, grossProfitFactor: 1, netProfitFactor: 0.8 }),
        -1,
      ),
    ).toBe('BTC_5M_WICK_1R_HOLDOUT_INTERESTING');
    expect(
      classifyWickReport(
        summary({
          completedCampaignCount: 29,
          grossProfitFactor: 2,
          netProfitFactor: 2,
          netPnLSum: 2,
        }),
        2,
      ),
    ).toBe('NO_USEFUL_BTC_5M_WICK_1R_EDGE');
  });
});
