import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildShadowRepricePolicyExperimentV1,
  canonicalizeJsonV1,
  DECIBEL_SHADOW_REPRICE_POLICIES_V1,
  parseShadowRepriceSourceJsonlV1,
  priceToTicksV1,
  replayShadowRepricePolicyV1,
  stringifyCanonicalJsonV1,
} from '../src/decibel_shadow_reprice_policy_experiment_v1.js';
import { freezeShadowRepriceExperimentReportV1 } from '../src/run_decibel_shadow_reprice_policy_experiment_v1.js';

const sourcePath = join(
  process.cwd(),
  'data/decibel_mcp_mainnet_continuous_shadow_v1_shadow-1788370116066.jsonl',
);
const source = readFileSync(sourcePath);
const observations = parseShadowRepriceSourceJsonlV1(source.toString('utf8'));
const policy = (name: (typeof DECIBEL_SHADOW_REPRICE_POLICIES_V1)[number]['name']) =>
  DECIBEL_SHADOW_REPRICE_POLICIES_V1.find((value) => value.name === name)!;
const replay = (
  rows: readonly {
    timestamp: number;
    bestBid: number;
    bestAsk: number;
    desiredSide: 'buy' | 'sell';
    desiredPrice: number;
    desiredQuantity: number;
  }[],
  name: (typeof DECIBEL_SHADOW_REPRICE_POLICIES_V1)[number]['name'],
) => replayShadowRepricePolicyV1({ observations: rows, policy: policy(name), tickSize: 0.1 });
const row = (
  timestamp: number,
  desiredPrice: number,
  bestBid = desiredPrice,
  bestAsk = desiredPrice + 0.1,
) => ({
  timestamp,
  bestBid,
  bestAsk,
  desiredSide: 'buy' as const,
  desiredPrice,
  desiredQuantity: 1,
});

describe('DECIBEL MAINNET SHADOW REPRICE POLICY EXPERIMENT V1', () => {
  it('parses the recorded source deterministically', () => {
    expect(observations).toHaveLength(892);
    expect(parseShadowRepriceSourceJsonlV1(source.toString('utf8'))).toEqual(observations);
  });

  it('reproduces the source baseline exactly', () => {
    const result = replay(observations, 'IMMEDIATE_1_TICK');
    expect([result.wouldPlaceCount, result.wouldReplaceCount, result.holdCount]).toEqual([
      1, 415, 476,
    ]);
  });

  it('does not replace a semantic no-op', () => {
    expect(replay([row(0, 100), row(2_000, 100)], 'IMMEDIATE_1_TICK').wouldReplaceCount).toBe(0);
  });

  it.each([
    ['MIN_LIFETIME_3000MS_1_TICK', 2_999, 0, 3_000, 1],
    ['MIN_LIFETIME_5000MS_1_TICK', 4_999, 0, 5_000, 1],
    ['MIN_LIFETIME_10000MS_1_TICK', 9_999, 0, 10_000, 1],
  ] as const)('%s enforces minimum lifetime', (name, early, earlyCount, due, dueCount) => {
    expect(replay([row(0, 100), row(early, 100.1)], name).wouldReplaceCount).toBe(earlyCount);
    expect(replay([row(0, 100), row(due, 100.1)], name).wouldReplaceCount).toBe(dueCount);
  });

  it('the two-tick threshold ignores a one-tick move', () => {
    expect(replay([row(0, 100), row(1, 100.1)], 'IMMEDIATE_2_TICKS').wouldReplaceCount).toBe(0);
  });

  it('the three-tick threshold ignores one and two ticks', () => {
    const result = replay([row(0, 100), row(1, 100.1), row(2, 100.2)], 'IMMEDIATE_3_TICKS');
    expect(result.wouldReplaceCount).toBe(0);
  });

  it('combined lifetime and threshold requires both gates', () => {
    const result = replay(
      [row(0, 100), row(4_000, 100.3), row(5_000, 100.2), row(5_001, 100.3)],
      'MIN_LIFETIME_5000MS_3_TICKS',
    );
    expect(result.wouldReplaceCount).toBe(1);
  });

  it('is causal and a future observation cannot change an earlier decision', () => {
    const prefix = [row(0, 100), row(2_000, 100.1)];
    const first = replay(prefix, 'MIN_LIFETIME_3000MS_1_TICK');
    const extended = replay([...prefix, row(3_000, 100.2)], 'MIN_LIFETIME_3000MS_1_TICK');
    expect(first.evaluationsAtExactDesiredPrice).toBe(1);
    expect(extended.evaluationsAtExactDesiredPrice).toBe(2);
  });

  it('counts one initial placement and cancel plus place per replacement', () => {
    const result = replay([row(0, 100), row(1, 100.1), row(2, 100.2)], 'IMMEDIATE_1_TICK');
    expect(result.totalHypotheticalMutationCalls).toBe(5);
    expect(result.wouldCancelCount).toBe(2);
  });

  it('normalizes price distance with deterministic integer ticks', () => {
    expect(priceToTicksV1(77_007.4, 0.1)).toBe(770_074);
    expect(
      replay([row(0, 100), row(1, 100.3)], 'IMMEDIATE_3_TICKS').maxAbsoluteDifferenceTicks,
    ).toBe(0);
  });

  it('computes exact desired-price coverage', () => {
    const result = replay([row(0, 100), row(1, 100.1)], 'IMMEDIATE_2_TICKS');
    expect(result.exactDesiredPriceCoveragePct).toBe(50);
  });

  it('uses deterministic nearest-rank p95', () => {
    const rows = Array.from({ length: 20 }, (_, index) => row(index, 100 + index / 10));
    expect(replay(rows, 'MIN_LIFETIME_10000MS_1_TICK').p95AbsoluteDifferenceTicks).toBe(18);
  });

  it('classifies at-best, behind, inside-spread and crossing safety states', () => {
    const behind = replay([row(0, 100), row(1, 101, 101, 101.2)], 'MIN_LIFETIME_3000MS_1_TICK');
    const inside = replay([row(0, 100.1, 100, 100.2)], 'IMMEDIATE_1_TICK');
    const crossing = replay([row(0, 100.2, 100, 100.2)], 'IMMEDIATE_1_TICK');
    expect(behind.postOnlySafety.behindCurrentBestCount).toBe(1);
    expect(inside.postOnlySafety.insideCurrentSpreadCount).toBe(1);
    expect(crossing.postOnlySafety.shadowRepricePolicyCrossingRisk).toBe(true);
  });

  it('contains no fill or PnL inference', () => {
    const result = replay([row(0, 100)], 'IMMEDIATE_1_TICK');
    expect(result.shadowFillCount).toBe(0);
    expect(result.shadowMakerVolumeUsd).toBe(0);
    expect('pnl' in result).toBe(false);
  });

  it('computes a valid deterministic Pareto frontier', () => {
    const report = buildShadowRepricePolicyExperimentV1({
      sourceSessionId: 'shadow-1788370116066',
      sourceJsonlSha256: createHash('sha256').update(source).digest('hex'),
      observations,
    });
    expect(report.paretoFrontier).toContain('IMMEDIATE_1_TICK');
    expect(new Set(report.paretoFrontier).size).toBe(report.paretoFrontier.length);
  });

  it('produces deterministic canonical output and body hash', () => {
    const input = {
      sourceSessionId: 'shadow-1788370116066',
      sourceJsonlSha256: createHash('sha256').update(source).digest('hex'),
      observations,
    };
    expect(stringifyCanonicalJsonV1(buildShadowRepricePolicyExperimentV1(input))).toBe(
      stringifyCanonicalJsonV1(buildShadowRepricePolicyExperimentV1(input)),
    );
    expect(canonicalizeJsonV1({ z: 1, a: 2 })).toEqual({ a: 2, z: 1 });
  });

  it('freezes identically and rejects conflicting evidence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'decibel-reprice-'));
    const path = join(directory, 'report.json');
    expect(freezeShadowRepriceExperimentReportV1(path, '{}\n')).toBe('FROZEN');
    expect(freezeShadowRepriceExperimentReportV1(path, '{}\n')).toBe('ALREADY_FROZEN');
    expect(() => freezeShadowRepriceExperimentReportV1(path, '{"different":true}\n')).toThrow(
      'REPRICE_EXPERIMENT_MANIFEST_CONFLICT',
    );
  });

  it('does not import or invoke MCP and keeps mutation counters at zero', () => {
    const implementation = readFileSync(
      join(process.cwd(), 'src/decibel_shadow_reprice_policy_experiment_v1.ts'),
      'utf8',
    );
    expect(implementation).not.toContain('mcp_execution_transport');
    const result = replay([row(0, 100)], 'IMMEDIATE_1_TICK');
    expect([result.mcpMutationCalls, result.venueMutations]).toEqual([0, 0]);
  });
});
