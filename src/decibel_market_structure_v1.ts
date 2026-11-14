/**
 * Market structure for the candle rules, computed once per decision cycle (2026-11-14
 * consolidation). Every candle rule reads this one object: the entry filter and the DCA
 * momentum gate use the last two closed 5-minute candles, the adverse-TP rule counts closes
 * outside its safe band from the samples.
 *
 * Source: the venue's 1-minute candles while they are fresh, else the bot's own BBO
 * midpoint history (decibel_exchange_candles_v1). Orders keep using the live BBO.
 */
import {
  isDecibelExchangeCandleSetFreshV1,
  mergeDecibelExchangeCandleSamplesV1,
  type decibel_exchange_candle_v1,
} from './decibel_exchange_candles_v1.js';
import { getDecibelClosedCandlesV1 } from './decibel_volatility_targets_v1.js';

export type decibel_midpoint_sample_v1 = Readonly<{ at: number; midpoint: number }>;

export type decibel_closed_candle_v1 = Readonly<{ start: number; low: number; high: number }>;

export type decibel_market_structure_v1 = Readonly<{
  /** Where the candle rules read prices from this cycle. */
  source: 'EXCHANGE' | 'BBO_FALLBACK';
  computedAt: number;
  /** Midpoint-like samples in time order (venue candles expanded, then the BBO tail). */
  samples: readonly decibel_midpoint_sample_v1[];
  /** The last two closed 5-minute candles, oldest first; null when history does not cover them. */
  closedCandles: readonly decibel_closed_candle_v1[] | null;
}>;

export function createDecibelMarketStructureV1(
  source: decibel_market_structure_v1['source'],
  samples: readonly decibel_midpoint_sample_v1[],
  now: number,
): decibel_market_structure_v1 {
  const frozen = Object.freeze(samples.map((sample) => Object.freeze({ ...sample })));
  return Object.freeze({
    source,
    computedAt: now,
    samples: frozen,
    closedCandles: getDecibelClosedCandlesV1(frozen, now, 2),
  });
}

export function buildDecibelMarketStructureV1(
  input: Readonly<{
    exchangeCandles: readonly decibel_exchange_candle_v1[];
    bboSamples: readonly decibel_midpoint_sample_v1[];
    now: number;
  }>,
): decibel_market_structure_v1 {
  const { exchangeCandles, bboSamples, now } = input;
  return isDecibelExchangeCandleSetFreshV1(exchangeCandles, now)
    ? createDecibelMarketStructureV1(
        'EXCHANGE',
        mergeDecibelExchangeCandleSamplesV1(exchangeCandles, bboSamples),
        now,
      )
    : createDecibelMarketStructureV1('BBO_FALLBACK', bboSamples, now);
}
