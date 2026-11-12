import { readFileSync } from 'node:fs';

import { z } from 'zod';

export type decibel_market_regime_v1 = 'RISING' | 'FALLING' | 'NEUTRAL' | 'UNKNOWN';

const BucketSchema = z.object({
  distanceBps: z.number().positive(),
  side: z.enum(['BUY', 'SELL']),
  regime: z.enum(['RISING', 'FALLING', 'NEUTRAL']),
  opportunities: z.number().int().nonnegative(),
  distanceConditionalP95AdverseBps: z.number().nonnegative().nullable(),
  distanceConditionalNetExpectedEdgeBps: z.number().nullable(),
});

const ModelSchema = z.object({
  version: z.literal('DECIBEL_REGIME_EDGE_MODEL_V1'),
  regimeLookbackMs: z.number().int().positive(),
  regimeThresholdBps: z.number().positive(),
  minimumEvidencePerRegimeSide: z.number().int().positive(),
  buckets: z.array(BucketSchema),
});

export type decibel_regime_edge_model_v1 = z.infer<typeof ModelSchema>;

export function loadDecibelRegimeEdgeModelV1(path: string): decibel_regime_edge_model_v1 {
  return ModelSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function classifyDecibelMarketRegimeV1(
  observations: readonly Readonly<{ at: number; midpoint: number }>[],
  now: number,
  lookbackMs: number,
  thresholdBps: number,
): decibel_market_regime_v1 {
  const current = observations.at(-1);
  const anchor = [...observations].reverse().find((row) => row.at <= now - lookbackMs);
  if (current === undefined || anchor === undefined || !(anchor.midpoint > 0)) return 'UNKNOWN';
  const returnBps = ((current.midpoint - anchor.midpoint) / anchor.midpoint) * 10_000;
  return returnBps > thresholdBps ? 'RISING' : returnBps < -thresholdBps ? 'FALLING' : 'NEUTRAL';
}

export function selectDecibelRegimeSideEdgeV1(
  model: decibel_regime_edge_model_v1,
  regime: decibel_market_regime_v1,
  side: 'BUY' | 'SELL',
): Readonly<{
  eligible: boolean;
  reason: string;
  distanceBps: number | null;
  adverseSelectionBps: number | null;
  sampleCount: number;
}> {
  if (regime === 'UNKNOWN')
    return Object.freeze({
      eligible: false,
      reason: 'REGIME_EVIDENCE_UNKNOWN',
      distanceBps: null,
      adverseSelectionBps: null,
      sampleCount: 0,
    });
  const bucket = model.buckets
    .filter((row) => row.regime === regime && row.side === side)
    .sort((left, right) => left.distanceBps - right.distanceBps)
    .find(
      (row) =>
        row.opportunities >= model.minimumEvidencePerRegimeSide &&
        row.distanceConditionalP95AdverseBps !== null &&
        row.distanceConditionalNetExpectedEdgeBps !== null &&
        row.distanceConditionalNetExpectedEdgeBps > 0,
    );
  if (bucket === undefined)
    return Object.freeze({
      eligible: false,
      reason: 'REGIME_SIDE_EVIDENCE_INSUFFICIENT_OR_NEGATIVE_EDGE',
      distanceBps: null,
      adverseSelectionBps: null,
      sampleCount: 0,
    });
  return Object.freeze({
    eligible: true,
    reason: 'REGIME_SIDE_EXPECTED_EDGE_POSITIVE',
    distanceBps: bucket.distanceBps,
    adverseSelectionBps: bucket.distanceConditionalP95AdverseBps,
    sampleCount: bucket.opportunities,
  });
}
