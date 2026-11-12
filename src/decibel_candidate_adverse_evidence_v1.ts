import {
  getDecibelPercentileV1,
  type decibel_bbo_observation_v1,
} from './decibel_market_making_economics_v1.js';
import { DECIBEL_PRODUCTION_CANDIDATE_DISTANCE_BPS_V1 } from './decibel_smart_ladder_v1.js';

export const DECIBEL_CANDIDATE_ADVERSE_MINIMUM_SAMPLE_COUNT_V1 = 30 as const;

export type decibel_candidate_adverse_bucket_v1 = Readonly<{
  side: 'BUY' | 'SELL';
  distanceBps: number;
  p95AdverseSelectionBps: number | null;
  sampleCount: number;
  observedAt: number;
}>;

export function buildDecibelCandidateAdverseSelectionEvidenceV1(
  observations: readonly decibel_bbo_observation_v1[],
  observedAt: number,
): readonly decibel_candidate_adverse_bucket_v1[] {
  return DECIBEL_PRODUCTION_CANDIDATE_DISTANCE_BPS_V1.flatMap((distanceBps) =>
    (['BUY', 'SELL'] as const).map((side) => {
      const adverse: number[] = [];
      for (let index = 0; index < observations.length; index += 1) {
        const entry = observations[index]!;
        const fair = (entry.bestBid + entry.bestAsk) / 2;
        const quote = fair * (1 + ((side === 'BUY' ? -1 : 1) * distanceBps) / 10_000);
        const fillIndex = observations.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex > index &&
            candidate.timestamp <= entry.timestamp + 60_000 &&
            (side === 'BUY' ? candidate.bestAsk <= quote : candidate.bestBid >= quote),
        );
        if (fillIndex <= index) continue;
        const fill = observations[fillIndex]!;
        const after = observations.find(
          (candidate, candidateIndex) =>
            candidateIndex > fillIndex && candidate.timestamp >= fill.timestamp + 30_000,
        );
        if (after === undefined) continue;
        const afterFair = (after.bestBid + after.bestAsk) / 2;
        adverse.push(
          side === 'BUY'
            ? Math.max(0, ((quote - afterFair) / quote) * 10_000)
            : Math.max(0, ((afterFair - quote) / quote) * 10_000),
        );
      }
      return Object.freeze({
        side,
        distanceBps,
        p95AdverseSelectionBps: adverse.length === 0 ? null : getDecibelPercentileV1(adverse, 0.95),
        sampleCount: adverse.length,
        observedAt,
      });
    }),
  );
}
