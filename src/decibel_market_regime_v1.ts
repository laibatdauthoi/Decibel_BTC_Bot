export const DECIBEL_MARKET_REGIME_V1 = 'DECIBEL_MARKET_REGIME_V1' as const;

export type decibel_market_regime_name_v1 = 'QUIET' | 'NORMAL' | 'FAST' | 'ONE_SIDED' | 'THIN';

export type decibel_market_regime_observation_v1 = Readonly<{
  at: number;
  midpoint: number;
  bestBid: number;
  bestAsk: number;
  bestBidSize: number | null;
  bestAskSize: number | null;
  microprice: number | null;
  topBookImbalance: number | null;
  recentTradeIntensity: number | null;
}>;

export type decibel_market_regime_result_v1 = Readonly<{
  regime: decibel_market_regime_name_v1;
  inputs: Readonly<{
    spreadBps: number;
    realizedVolatilityBps: number;
    bboVelocityBpsPerSecond: number;
    topBookImbalance: number | null;
    micropriceDeviationBps: number | null;
    recentTradeIntensity: number | null;
    inventoryUsd: number;
  }>;
  policy: Readonly<{
    bidDistanceMultiplier: number;
    askDistanceMultiplier: number;
    sizeMultiplier: number;
    repriceMinimumTicks: number;
    minimumRestingAgeMs: number;
    maximumInventoryPriceSkewBps: number;
    volatilitySpreadMultiplier: number;
  }>;
}>;

const policyByRegime: Readonly<
  Record<
    Exclude<decibel_market_regime_name_v1, 'ONE_SIDED'>,
    decibel_market_regime_result_v1['policy']
  >
> = Object.freeze({
  QUIET: Object.freeze({
    bidDistanceMultiplier: 0.9,
    askDistanceMultiplier: 0.9,
    sizeMultiplier: 1,
    repriceMinimumTicks: 75,
    minimumRestingAgeMs: 60_000,
    maximumInventoryPriceSkewBps: 1.5,
    volatilitySpreadMultiplier: 1,
  }),
  NORMAL: Object.freeze({
    bidDistanceMultiplier: 1,
    askDistanceMultiplier: 1,
    sizeMultiplier: 1,
    repriceMinimumTicks: 50,
    minimumRestingAgeMs: 30_000,
    maximumInventoryPriceSkewBps: 2,
    volatilitySpreadMultiplier: 1,
  }),
  FAST: Object.freeze({
    bidDistanceMultiplier: 1.5,
    askDistanceMultiplier: 1.5,
    sizeMultiplier: 0.6,
    repriceMinimumTicks: 100,
    minimumRestingAgeMs: 60_000,
    maximumInventoryPriceSkewBps: 3,
    volatilitySpreadMultiplier: 1.5,
  }),
  THIN: Object.freeze({
    bidDistanceMultiplier: 1.75,
    askDistanceMultiplier: 1.75,
    sizeMultiplier: 0.5,
    repriceMinimumTicks: 120,
    minimumRestingAgeMs: 90_000,
    maximumInventoryPriceSkewBps: 4,
    volatilitySpreadMultiplier: 1.75,
  }),
});

export function classifyDecibelOperationalMarketRegimeV1(
  observations: readonly decibel_market_regime_observation_v1[],
  inventoryBase: number,
): decibel_market_regime_result_v1 {
  const current = observations.at(-1);
  if (current === undefined || !(current.midpoint > 0))
    throw new Error('MARKET_REGIME_OBSERVATION_REQUIRED');
  const spreadBps = ((current.bestAsk - current.bestBid) / current.midpoint) * 10_000;
  let squaredReturns = 0;
  let returnCount = 0;
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const next = observations[index];
    if (previous === undefined || next === undefined || !(previous.midpoint > 0)) continue;
    const returnBps = ((next.midpoint - previous.midpoint) / previous.midpoint) * 10_000;
    squaredReturns += returnBps * returnBps;
    returnCount += 1;
  }
  const realizedVolatilityBps = returnCount === 0 ? 0 : Math.sqrt(squaredReturns / returnCount);
  const first = observations[0] ?? current;
  const elapsedSeconds = Math.max(0.001, (current.at - first.at) / 1_000);
  const bboVelocityBpsPerSecond =
    Math.abs(((current.midpoint - first.midpoint) / first.midpoint) * 10_000) / elapsedSeconds;
  const topBookImbalance = current.topBookImbalance;
  const micropriceDeviationBps =
    current.microprice === null
      ? null
      : ((current.microprice - current.midpoint) / current.midpoint) * 10_000;
  const combinedTopSize =
    current.bestBidSize === null || current.bestAskSize === null
      ? null
      : current.bestBidSize + current.bestAskSize;
  const oneSided =
    (topBookImbalance !== null && Math.abs(topBookImbalance) >= 0.65) ||
    (micropriceDeviationBps !== null && Math.abs(micropriceDeviationBps) >= spreadBps * 0.3);
  const regime: decibel_market_regime_name_v1 =
    spreadBps >= 3 || (combinedTopSize !== null && combinedTopSize <= 0.0001)
      ? 'THIN'
      : oneSided
        ? 'ONE_SIDED'
        : realizedVolatilityBps >= 2 || bboVelocityBpsPerSecond >= 0.5
          ? 'FAST'
          : realizedVolatilityBps <= 0.25 && bboVelocityBpsPerSecond <= 0.05 && spreadBps <= 0.5
            ? 'QUIET'
            : 'NORMAL';
  const directionalPressure =
    topBookImbalance ??
    (micropriceDeviationBps === null || spreadBps <= 0
      ? 0
      : Math.max(-1, Math.min(1, micropriceDeviationBps / spreadBps)));
  const policy =
    regime === 'ONE_SIDED'
      ? Object.freeze({
          bidDistanceMultiplier: directionalPressure > 0 ? 1.25 : 0.9,
          askDistanceMultiplier: directionalPressure < 0 ? 1.25 : 0.9,
          sizeMultiplier: 0.7,
          repriceMinimumTicks: 90,
          minimumRestingAgeMs: 60_000,
          maximumInventoryPriceSkewBps: 3,
          volatilitySpreadMultiplier: 1.25,
        })
      : policyByRegime[regime];
  return Object.freeze({
    regime,
    inputs: Object.freeze({
      spreadBps,
      realizedVolatilityBps,
      bboVelocityBpsPerSecond,
      topBookImbalance,
      micropriceDeviationBps,
      recentTradeIntensity: current.recentTradeIntensity,
      inventoryUsd: inventoryBase * current.midpoint,
    }),
    policy,
  });
}
