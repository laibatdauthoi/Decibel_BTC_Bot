export const DECIBEL_MARKET_MAKING_ECONOMICS_V1 = 'DECIBEL_MARKET_MAKING_ECONOMICS_V1' as const;

export type decibel_bbo_observation_v1 = Readonly<{
  timestamp: number;
  bestBid: number;
  bestAsk: number;
}>;

export type decibel_adverse_markout_summary_v1 = Readonly<{
  horizonMs: number;
  observationCount: number;
  buyP95AdverseBps: number;
  sellP95AdverseBps: number;
  combinedP95AdverseBps: number;
}>;

export function getDecibelPercentileV1(values: readonly number[], quantile: number): number {
  if (values.length === 0 || !(quantile >= 0 && quantile <= 1))
    throw new Error('DECIBEL_PERCENTILE_INPUT_INVALID');
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)]!;
}

export function calculateDecibelAdverseMarkoutsV1(
  observations: readonly decibel_bbo_observation_v1[],
  horizonsMs: readonly number[],
): readonly decibel_adverse_markout_summary_v1[] {
  const sorted = [...observations]
    .filter((row) => Number.isFinite(row.timestamp) && row.bestBid > 0 && row.bestAsk > row.bestBid)
    .sort((left, right) => left.timestamp - right.timestamp);
  return Object.freeze(
    horizonsMs.map((horizonMs) => {
      const buyAdverse: number[] = [];
      const sellAdverse: number[] = [];
      for (let index = 0; index < sorted.length; index += 1) {
        const entry = sorted[index]!;
        const future = sorted
          .slice(index + 1)
          .find((candidate) => candidate.timestamp >= entry.timestamp + horizonMs);
        if (future === undefined) continue;
        const futureFair = (future.bestBid + future.bestAsk) / 2;
        buyAdverse.push(Math.max(0, ((entry.bestBid - futureFair) / entry.bestBid) * 10_000));
        sellAdverse.push(Math.max(0, ((futureFair - entry.bestAsk) / entry.bestAsk) * 10_000));
      }
      const combined = [...buyAdverse, ...sellAdverse];
      if (combined.length === 0) throw new Error(`DECIBEL_MARKOUT_HORIZON_EMPTY:${horizonMs}`);
      return Object.freeze({
        horizonMs,
        observationCount: buyAdverse.length,
        buyP95AdverseBps: getDecibelPercentileV1(buyAdverse, 0.95),
        sellP95AdverseBps: getDecibelPercentileV1(sellAdverse, 0.95),
        combinedP95AdverseBps: getDecibelPercentileV1(combined, 0.95),
      });
    }),
  );
}

export function calculateDecibelMakerFeeUsdV1(notionalUsd: number, makerRate: number): number {
  if (!(notionalUsd >= 0) || !Number.isFinite(makerRate))
    throw new Error('DECIBEL_MAKER_FEE_INPUT_INVALID');
  return notionalUsd * makerRate;
}

export function evaluateDecibelPassiveQuoteDistanceV1(
  observations: readonly decibel_bbo_observation_v1[],
  input: Readonly<{
    distanceBps: number;
    maximumRestMs: number;
    markoutHorizonMs: number;
    requiredEdgeBps: number;
  }>,
): Readonly<{
  evaluated: number;
  fillOpportunities: number;
  buyFillOpportunities: number;
  sellFillOpportunities: number;
  fillOpportunityRate: number;
  medianRestMs: number | null;
  p95AdverseMarkoutBps: number | null;
  netExpectedEdgeBps: number;
}> {
  const sorted = [...observations].sort((left, right) => left.timestamp - right.timestamp);
  const adverse: number[] = [];
  const restTimes: number[] = [];
  let buyFillOpportunities = 0;
  let sellFillOpportunities = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const entry = sorted[index]!;
    const fair = (entry.bestBid + entry.bestAsk) / 2;
    for (const side of ['BUY', 'SELL'] as const) {
      const quote = fair * (1 + (side === 'BUY' ? -1 : 1) * (input.distanceBps / 10_000));
      const fillIndex = sorted.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index &&
          candidate.timestamp <= entry.timestamp + input.maximumRestMs &&
          (side === 'BUY' ? candidate.bestAsk <= quote : candidate.bestBid >= quote),
      );
      if (fillIndex <= index) continue;
      const fill = sorted[fillIndex]!;
      const after = sorted.find(
        (candidate, candidateIndex) =>
          candidateIndex > fillIndex &&
          candidate.timestamp >= fill.timestamp + input.markoutHorizonMs,
      );
      if (after === undefined) continue;
      const afterFair = (after.bestBid + after.bestAsk) / 2;
      adverse.push(
        side === 'BUY'
          ? Math.max(0, ((quote - afterFair) / quote) * 10_000)
          : Math.max(0, ((afterFair - quote) / quote) * 10_000),
      );
      restTimes.push(fill.timestamp - entry.timestamp);
      if (side === 'BUY') buyFillOpportunities += 1;
      else sellFillOpportunities += 1;
    }
  }
  const fillOpportunities = buyFillOpportunities + sellFillOpportunities;
  return Object.freeze({
    evaluated: sorted.length * 2,
    fillOpportunities,
    buyFillOpportunities,
    sellFillOpportunities,
    fillOpportunityRate: fillOpportunities / (sorted.length * 2),
    medianRestMs: restTimes.length === 0 ? null : getDecibelPercentileV1(restTimes, 0.5),
    p95AdverseMarkoutBps: adverse.length === 0 ? null : getDecibelPercentileV1(adverse, 0.95),
    netExpectedEdgeBps: input.distanceBps - input.requiredEdgeBps,
  });
}
