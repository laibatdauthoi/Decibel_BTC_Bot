import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildShadowAsymmetricRepriceExperimentV1,
  classifyShadowQuoteAtBboV1,
  DECIBEL_SHADOW_ASYMMETRIC_POLICIES_V1,
  parseShadowRepriceSourceJsonlV1,
  replayShadowAsymmetricRepricePolicyV1,
  stringifyCanonicalJsonV1,
} from '../src/decibel_shadow_asymmetric_reprice_experiment_v1.js';
import { freezeShadowAsymmetricRepriceReportV1 } from '../src/run_decibel_shadow_asymmetric_reprice_experiment_v1.js';

const source = readFileSync(
  join(process.cwd(), 'data/decibel_mcp_mainnet_continuous_shadow_v1_shadow-1788370116066.jsonl'),
);
const observations = parseShadowRepriceSourceJsonlV1(source.toString('utf8'));
const policy = (name: (typeof DECIBEL_SHADOW_ASYMMETRIC_POLICIES_V1)[number]['name']) =>
  DECIBEL_SHADOW_ASYMMETRIC_POLICIES_V1.find((item) => item.name === name)!;
const row = (
  timestamp: number,
  desiredPrice: number,
  bestBid = desiredPrice,
  bestAsk = desiredPrice + 0.1,
  side: 'buy' | 'sell' = 'buy',
) => ({ timestamp, bestBid, bestAsk, desiredSide: side, desiredPrice, desiredQuantity: 1 });
const replay = (
  rows: readonly ReturnType<typeof row>[],
  name: (typeof DECIBEL_SHADOW_ASYMMETRIC_POLICIES_V1)[number]['name'],
) =>
  replayShadowAsymmetricRepricePolicyV1({
    observations: rows,
    policy: policy(name),
    tickSize: 0.1,
  });

describe('DECIBEL MAKER-SAFE ASYMMETRIC REPRICE POLICY EXPERIMENT V1', () => {
  it('reproduces the baseline', () => {
    const result = replay(observations, 'BASELINE_IMMEDIATE');
    expect([result.wouldPlaceCount, result.wouldReplaceCount, result.holdCount]).toEqual([
      1, 415, 476,
    ]);
  });

  it.each([
    ['buy', 101, 100, 101, 'CROSSING'],
    ['buy', 100.5, 100, 101, 'INSIDE_SPREAD'],
    ['buy', 99, 100, 101, 'BEHIND_BEST'],
    ['sell', 100, 100, 101, 'CROSSING'],
    ['sell', 100.5, 100, 101, 'INSIDE_SPREAD'],
    ['sell', 102, 100, 101, 'BEHIND_BEST'],
  ] as const)('classifies %s quote as %s', (side, resting, bid, ask, expected) => {
    expect(
      classifyShadowQuoteAtBboV1({
        side,
        restingPriceTicks: resting,
        bestBidTicks: bid,
        bestAskTicks: ask,
      }),
    ).toBe(expected);
  });

  it('crossing always refreshes immediately', () => {
    const result = replay([row(0, 100), row(1, 99.8, 99.8, 99.9)], 'ASYMMETRIC_BEHIND_10_TICKS');
    expect(result.replacementReasonBreakdown.SAFETY_CROSSING).toBe(1);
    expect(result.crossingStateDelayedCount).toBe(0);
  });

  it('inside spread always refreshes immediately', () => {
    const result = replay([row(0, 100), row(1, 99.9, 99.9, 100.1)], 'ASYMMETRIC_BEHIND_10_TICKS');
    expect(result.replacementReasonBreakdown.SAFETY_INSIDE_SPREAD).toBe(1);
    expect(result.insideSpreadStateDelayedCount).toBe(0);
  });

  it.each([
    ['ASYMMETRIC_BEHIND_2_TICKS', 100.1, 0, 100.2, 1],
    ['ASYMMETRIC_BEHIND_3_TICKS', 100.2, 0, 100.3, 1],
  ] as const)('%s applies distance hysteresis', (name, heldPrice, held, duePrice, replaced) => {
    expect(replay([row(0, 100), row(1, heldPrice)], name).wouldReplaceCount).toBe(held);
    expect(replay([row(0, 100), row(1, duePrice)], name).wouldReplaceCount).toBe(replaced);
  });

  it('starts the continuous-behind timer on first behind observation', () => {
    const result = replay(
      [row(0, 100), row(10_000, 100.1), row(12_999, 100.2), row(13_000, 100.3)],
      'ASYMMETRIC_BEHIND_3000MS',
    );
    expect(result.wouldReplaceCount).toBe(1);
  });

  it('resets the timer at best', () => {
    const result = replay(
      [row(0, 100), row(1_000, 100.1), row(3_000, 100), row(4_000, 100.1), row(6_999, 100.2)],
      'ASYMMETRIC_BEHIND_3000MS',
    );
    expect(result.wouldReplaceCount).toBe(0);
  });

  it('resets the timer on replacement and does not use total order age', () => {
    const result = replay(
      [row(0, 100), row(3_000, 100.1), row(6_000, 100.2), row(8_999, 100.3)],
      'ASYMMETRIC_BEHIND_3000MS',
    );
    expect(result.wouldReplaceCount).toBe(1);
  });

  it('combined AND requires both gates', () => {
    const result = replay(
      [row(0, 100), row(0, 100.2), row(2_999, 100.3), row(3_000, 100.3)],
      'ASYMMETRIC_BEHIND_3000MS_2_TICKS',
    );
    expect(result.wouldReplaceCount).toBe(1);
  });

  it('combined OR accepts either gate', () => {
    const distance = replay([row(0, 100), row(1, 100.5)], 'ASYMMETRIC_BEHIND_3000MS_OR_5_TICKS');
    const duration = replay(
      [row(0, 100), row(0, 100.1), row(3_000, 100.1)],
      'ASYMMETRIC_BEHIND_3000MS_OR_5_TICKS',
    );
    expect([distance.wouldReplaceCount, duration.wouldReplaceCount]).toEqual([1, 1]);
  });

  it('is causal and does not consult future observations', () => {
    const prefix = [row(0, 100), row(1_000, 100.1)];
    expect(replay(prefix, 'ASYMMETRIC_BEHIND_3000MS').wouldReplaceCount).toBe(0);
    expect(
      replay([...prefix, row(4_000, 100.2)], 'ASYMMETRIC_BEHIND_3000MS').wouldReplaceCount,
    ).toBe(1);
  });

  it('accounts for mutations and replacement reasons', () => {
    const result = replay([row(0, 100), row(1, 100.2)], 'ASYMMETRIC_BEHIND_2_TICKS');
    expect(result.hypotheticalMutationCalls).toBe(3);
    expect(result.replacementReasonBreakdown.CHASE_BEHIND_DISTANCE).toBe(1);
  });

  it('screens acceptance and excludes unsafe policies from safe frontier', () => {
    const report = buildShadowAsymmetricRepriceExperimentV1({
      sourceSessionId: 'shadow-1788370116066',
      sourceJsonlSha256: createHash('sha256').update(source).digest('hex'),
      observations,
      tickSize: 0.1,
    });
    expect(report.policyResults.every((item) => item.crossingStateDelayedCount === 0)).toBe(true);
    expect(report.safeParetoFrontier.length).toBeGreaterThan(0);
  });

  it('contains no fills, PnL, MCP calls, or venue mutations', () => {
    const result = replay([row(0, 100)], 'BASELINE_IMMEDIATE');
    expect([
      result.shadowFillCount,
      result.shadowMakerVolumeUsd,
      result.mcpMutationCalls,
      result.venueMutations,
    ]).toEqual([0, 0, 0, 0]);
    expect('pnl' in result).toBe(false);
  });

  it('freezes deterministic output idempotently and rejects conflict', () => {
    const report = buildShadowAsymmetricRepriceExperimentV1({
      sourceSessionId: 'shadow-1788370116066',
      sourceJsonlSha256: createHash('sha256').update(source).digest('hex'),
      observations,
      tickSize: 0.1,
    });
    const text = stringifyCanonicalJsonV1(report);
    expect(text).toBe(stringifyCanonicalJsonV1(report));
    const path = join(mkdtempSync(join(tmpdir(), 'asymmetric-reprice-')), 'report.json');
    expect(freezeShadowAsymmetricRepriceReportV1(path, text)).toBe('FROZEN');
    expect(freezeShadowAsymmetricRepriceReportV1(path, text)).toBe('ALREADY_FROZEN');
    expect(() => freezeShadowAsymmetricRepriceReportV1(path, '{}\n')).toThrow(
      'ASYMMETRIC_REPRICE_EXPERIMENT_MANIFEST_CONFLICT',
    );
  });
});
