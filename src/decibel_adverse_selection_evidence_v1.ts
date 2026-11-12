import {
  appendFileSync,
  openSync,
  closeSync,
  readSync,
  statSync,
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import { getDecibelPercentileV1 } from './decibel_market_making_economics_v1.js';
import type { decibel_market_regime_name_v1 } from './decibel_market_regime_v1.js';

export const DECIBEL_ADVERSE_EVIDENCE_MAXIMUM_AGE_MS_V1 = 3_600_000 as const;
export const DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1 = 30 as const;
export const DECIBEL_ADVERSE_MARKOUT_HORIZONS_MS_V1 = Object.freeze([1_000, 5_000, 15_000, 30_000]);

export function resolveDecibelProductionEconomicStorePathsV1(
  environment: NodeJS.ProcessEnv,
): Readonly<{ evidencePath: string; rawWsBboPath: string }> {
  const evidencePath = resolve(
    environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH ??
      'data/decibel_production_economic_inputs_v1.json',
  );
  return Object.freeze({
    evidencePath,
    rawWsBboPath: resolve(dirname(evidencePath), 'decibel_production_raw_ws_bbo_v1.jsonl'),
  });
}

export type decibel_raw_ws_bbo_observation_v1 = Readonly<{
  timestamp: number;
  /** Original venue clock; timestamp remains the local WS observation clock. */
  venueTimestamp?: number;
  bestBid: number;
  bestAsk: number;
  regime: decibel_market_regime_name_v1;
  source: 'DECIBEL_WS_BBO';
}>;

export type decibel_block_aware_markout_distribution_v1 = Readonly<{
  horizonMs: number;
  rawSampleCount: number;
  effectiveSampleCount: number;
  buyP95AdverseBps: number;
  sellP95AdverseBps: number;
  combinedP95AdverseBps: number;
}>;

function isValidObservation(value: unknown): value is decibel_raw_ws_bbo_observation_v1 {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<decibel_raw_ws_bbo_observation_v1>;
  return (
    Number.isSafeInteger(row.timestamp) &&
    typeof row.bestBid === 'number' &&
    Number.isFinite(row.bestBid) &&
    row.bestBid > 0 &&
    typeof row.bestAsk === 'number' &&
    Number.isFinite(row.bestAsk) &&
    row.bestAsk > row.bestBid &&
    ['QUIET', 'NORMAL', 'FAST', 'ONE_SIDED', 'THIN'].includes(row.regime ?? '') &&
    row.source === 'DECIBEL_WS_BBO' &&
    (row.venueTimestamp === undefined || Number.isSafeInteger(row.venueTimestamp))
  );
}

export class decibel_raw_ws_bbo_store_v1 {
  private rows: decibel_raw_ws_bbo_observation_v1[] = [];
  private offset = 0;
  private remainder = '';
  private inode: number | null = null;
  private modifiedAt = -1;
  public constructor(private readonly Path: string) {}

  public append(observation: decibel_raw_ws_bbo_observation_v1): boolean {
    if (!isValidObservation(observation)) throw new Error('RAW_WS_BBO_OBSERVATION_INVALID');
    const rows = this.readAll();
    const previous = rows.at(-1);
    if (previous !== undefined && observation.timestamp < previous.timestamp) return false;
    if (
      previous !== undefined &&
      previous.bestBid === observation.bestBid &&
      previous.bestAsk === observation.bestAsk
    )
      return false;
    mkdirSync(dirname(this.Path), { recursive: true });
    appendFileSync(this.Path, `${JSON.stringify(observation)}\n`, 'utf8');
    return true;
  }

  public readFresh(
    now: number,
    maximumAgeMs: number = DECIBEL_ADVERSE_EVIDENCE_MAXIMUM_AGE_MS_V1,
  ): readonly decibel_raw_ws_bbo_observation_v1[] {
    const rows = this.readAll();
    const findFirst = (timestamp: number, afterEqual = false) => {
      let left = 0,
        right = rows.length;
      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (rows[mid]!.timestamp < timestamp || (afterEqual && rows[mid]!.timestamp === timestamp))
          left = mid + 1;
        else right = mid;
      }
      return left;
    };
    return Object.freeze(rows.slice(findFirst(now - maximumAgeMs), findFirst(now, true)));
  }

  private readAll(): readonly decibel_raw_ws_bbo_observation_v1[] {
    if (!existsSync(this.Path)) {
      this.rows = [];
      this.offset = 0;
      this.remainder = '';
      this.inode = null;
      return this.rows;
    }
    const info = statSync(this.Path);
    if (
      this.inode !== info.ino ||
      info.size < this.offset ||
      (info.size === this.offset && this.modifiedAt !== info.mtimeMs)
    ) {
      this.rows = [];
      this.offset = 0;
      this.remainder = '';
    }
    if (info.size > this.offset) {
      const File = openSync(this.Path, 'r');
      try {
        const chunk = Buffer.alloc(info.size - this.offset);
        const length = readSync(File, chunk, 0, chunk.length, this.offset);
        this.offset += length;
        const lines = (this.remainder + chunk.subarray(0, length).toString('utf8')).split(/\r?\n/u);
        this.remainder = lines.pop() ?? '';
        for (const line of lines) {
          try {
            const parsed: unknown = JSON.parse(line);
            if (!isValidObservation(parsed)) continue;
            if (this.rows.length === 0 || this.rows.at(-1)!.timestamp <= parsed.timestamp)
              this.rows.push(parsed);
            else {
              let left = 0,
                right = this.rows.length;
              while (left < right) {
                const mid = Math.floor((left + right) / 2);
                if (this.rows[mid]!.timestamp <= parsed.timestamp) left = mid + 1;
                else right = mid;
              }
              this.rows.splice(left, 0, parsed);
            }
          } catch {
            continue;
          }
        }
      } finally {
        closeSync(File);
      }
    }
    this.inode = info.ino;
    this.modifiedAt = info.mtimeMs;
    // A complete final JSON row without a newline remains readable, but is not
    // committed to the cache until its delimiter arrives on the next append.
    if (this.remainder.trim()) {
      try {
        const tail: unknown = JSON.parse(this.remainder);
        if (isValidObservation(tail))
          return [...this.rows, tail].sort((a, b) => a.timestamp - b.timestamp);
      } catch {
        /* Incomplete append remains pending. */
      }
    }
    return this.rows;
  }
}

export function hydrateDecibelProductionRawWsBboStoreV1(
  environment: NodeJS.ProcessEnv,
): decibel_raw_ws_bbo_store_v1 {
  const paths = resolveDecibelProductionEconomicStorePathsV1(environment);
  if (existsSync(paths.rawWsBboPath)) return new decibel_raw_ws_bbo_store_v1(paths.rawWsBboPath);

  const legacyPaths = [
    environment.DECIBEL_PRODUCTION_RAW_WS_BBO_PATH,
    resolve(dirname(paths.evidencePath), 'decibel_raw_ws_bbo_v1.jsonl'),
    resolve(dirname(paths.evidencePath), 'live_adverse_ws_bbo_v1.jsonl'),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => resolve(value))
    .filter(
      (value, index, values) => value !== paths.rawWsBboPath && values.indexOf(value) === index,
    );
  const rows = legacyPaths
    .flatMap((path) => new decibel_raw_ws_bbo_store_v1(path).readFresh(Date.now()))
    .sort((left, right) => left.timestamp - right.timestamp)
    .filter(
      (row, index, values) =>
        index === 0 ||
        values[index - 1]!.bestBid !== row.bestBid ||
        values[index - 1]!.bestAsk !== row.bestAsk,
    );
  if (rows.length > 0) {
    mkdirSync(dirname(paths.rawWsBboPath), { recursive: true });
    const candidatePath = `${paths.rawWsBboPath}.${process.pid}-${Date.now()}.tmp`;
    writeFileSync(candidatePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    renameSync(candidatePath, paths.rawWsBboPath);
  }
  return new decibel_raw_ws_bbo_store_v1(paths.rawWsBboPath);
}

export function calculateDecibelBlockAwareSyntheticBboMarkoutsV1(
  observations: readonly decibel_raw_ws_bbo_observation_v1[],
  currentRegime: decibel_market_regime_name_v1,
  now: number,
  minimumEffectiveSamples: number = DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1,
  maximumAgeMs: number = DECIBEL_ADVERSE_EVIDENCE_MAXIMUM_AGE_MS_V1,
): Readonly<{
  estimator: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95';
  regime: decibel_market_regime_name_v1;
  observedAt: number | null;
  rawSampleCount: number;
  effectiveSampleCount: number;
  representative: boolean;
  blocker: string | null;
  p95AdverseSelectionBps: number | null;
  horizons: readonly decibel_block_aware_markout_distribution_v1[];
}> {
  const estimate = calculateBlockAwareMarkouts(
    observations,
    currentRegime,
    now,
    minimumEffectiveSamples,
    maximumAgeMs,
  );
  return Object.freeze({
    ...estimate,
    estimator: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95' as const,
    regime: currentRegime,
  });
}

function calculateBlockAwareMarkouts(
  observations: readonly decibel_raw_ws_bbo_observation_v1[],
  regime: decibel_market_regime_name_v1 | 'GLOBAL',
  now: number,
  minimumEffectiveSamples: number,
  maximumAgeMs: number,
): Readonly<{
  estimator: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95' | 'SYNTHETIC_BBO_BLOCK_AWARE_GLOBAL_P95';
  regime: decibel_market_regime_name_v1 | 'GLOBAL';
  observedAt: number | null;
  rawSampleCount: number;
  effectiveSampleCount: number;
  representative: boolean;
  blocker: string | null;
  p95AdverseSelectionBps: number | null;
  horizons: readonly decibel_block_aware_markout_distribution_v1[];
}> {
  const fresh = observations
    .filter(
      (row) =>
        isValidObservation(row) &&
        (regime === 'GLOBAL' || row.regime === regime) &&
        row.timestamp <= now &&
        now - row.timestamp <= maximumAgeMs,
    )
    .sort((left, right) => left.timestamp - right.timestamp)
    .filter(
      (row, index, rows) =>
        index === 0 ||
        row.bestBid !== rows[index - 1]!.bestBid ||
        row.bestAsk !== rows[index - 1]!.bestAsk,
    );
  const horizons = DECIBEL_ADVERSE_MARKOUT_HORIZONS_MS_V1.map((horizonMs) => {
    const entries: decibel_raw_ws_bbo_observation_v1[] = [];
    let nextEligibleAt = Number.NEGATIVE_INFINITY;
    for (const row of fresh) {
      if (row.timestamp < nextEligibleAt) continue;
      entries.push(row);
      nextEligibleAt = row.timestamp + horizonMs;
    }
    const buy: number[] = [];
    const sell: number[] = [];
    let futureIndex = 0;
    for (const entry of entries) {
      // Entries and observations are sorted. Reuse the forward cursor instead
      // of rescanning the full rolling window for every block.
      while (
        futureIndex < fresh.length &&
        fresh[futureIndex]!.timestamp < entry.timestamp + horizonMs
      )
        futureIndex += 1;
      const future = fresh[futureIndex];
      if (future === undefined) continue;
      const futureFair = (future.bestBid + future.bestAsk) / 2;
      buy.push(Math.max(0, ((entry.bestBid - futureFair) / entry.bestBid) * 10_000));
      sell.push(Math.max(0, ((futureFair - entry.bestAsk) / entry.bestAsk) * 10_000));
    }
    const combined = [...buy, ...sell];
    return combined.length === 0
      ? null
      : Object.freeze({
          horizonMs,
          rawSampleCount: fresh.length,
          effectiveSampleCount: buy.length,
          buyP95AdverseBps: getDecibelPercentileV1(buy, 0.95),
          sellP95AdverseBps: getDecibelPercentileV1(sell, 0.95),
          combinedP95AdverseBps: getDecibelPercentileV1(combined, 0.95),
        });
  }).filter((row): row is decibel_block_aware_markout_distribution_v1 => row !== null);
  const longest = horizons.find((row) => row.horizonMs === 30_000);
  const effectiveSampleCount = longest?.effectiveSampleCount ?? 0;
  const representative = effectiveSampleCount >= minimumEffectiveSamples;
  return Object.freeze({
    estimator:
      regime === 'GLOBAL'
        ? 'SYNTHETIC_BBO_BLOCK_AWARE_GLOBAL_P95'
        : 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
    regime,
    observedAt: fresh.at(-1)?.timestamp ?? null,
    rawSampleCount: fresh.length,
    effectiveSampleCount,
    representative,
    blocker: representative
      ? null
      : `ADVERSE_REGIME_EFFECTIVE_SAMPLES_INSUFFICIENT:${effectiveSampleCount}/${minimumEffectiveSamples}`,
    p95AdverseSelectionBps: representative ? (longest?.combinedP95AdverseBps ?? null) : null,
    horizons: Object.freeze(horizons),
  });
}

export function calculateDecibelBlockAwareGlobalSyntheticBboMarkoutsV1(
  observations: readonly decibel_raw_ws_bbo_observation_v1[],
  now: number,
  minimumEffectiveSamples: number = DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1,
  maximumAgeMs: number = DECIBEL_ADVERSE_EVIDENCE_MAXIMUM_AGE_MS_V1,
): ReturnType<typeof calculateBlockAwareMarkouts> {
  return calculateBlockAwareMarkouts(
    observations,
    'GLOBAL',
    now,
    minimumEffectiveSamples,
    maximumAgeMs,
  );
}

export function selectDecibelAdverseSelectionEstimateV1(
  observations: readonly decibel_raw_ws_bbo_observation_v1[],
  currentRegime: decibel_market_regime_name_v1,
  now: number,
  minimumEffectiveSamples: number = DECIBEL_ADVERSE_REGIME_EFFECTIVE_SAMPLE_MINIMUM_V1,
  maximumAgeMs: number = DECIBEL_ADVERSE_EVIDENCE_MAXIMUM_AGE_MS_V1,
): Readonly<{
  source: 'CURRENT_REGIME' | 'GLOBAL_FALLBACK' | 'INSUFFICIENT';
  selected: ReturnType<typeof calculateBlockAwareMarkouts> | null;
  regimeEstimate: ReturnType<typeof calculateBlockAwareMarkouts>;
  globalEstimate: ReturnType<typeof calculateBlockAwareMarkouts>;
}> {
  const regimeEstimate = calculateDecibelBlockAwareSyntheticBboMarkoutsV1(
    observations,
    currentRegime,
    now,
    minimumEffectiveSamples,
    maximumAgeMs,
  );
  const globalEstimate = calculateDecibelBlockAwareGlobalSyntheticBboMarkoutsV1(
    observations,
    now,
    minimumEffectiveSamples,
    maximumAgeMs,
  );
  const selected = regimeEstimate.representative
    ? regimeEstimate
    : globalEstimate.representative
      ? globalEstimate
      : null;
  return Object.freeze({
    source: regimeEstimate.representative
      ? 'CURRENT_REGIME'
      : globalEstimate.representative
        ? 'GLOBAL_FALLBACK'
        : 'INSUFFICIENT',
    selected,
    regimeEstimate,
    globalEstimate,
  });
}

export type decibel_realized_maker_fill_markout_v1 = Readonly<{
  fillId: string;
  side: 'BUY' | 'SELL';
  fillPrice: number;
  fillTimestamp: number;
  futureFairPrice: number;
  horizonMs: number;
}>;

export function calculateDecibelRealizedMakerFillAdverseP95V1(
  markouts: readonly decibel_realized_maker_fill_markout_v1[],
): Readonly<{
  estimator: 'REALIZED_MAKER_FILL_MARKOUT_P95';
  sampleCount: number;
  p95Bps: number | null;
}> {
  const unique = new Map<string, number>();
  for (const row of markouts) {
    if (!(row.fillPrice > 0) || !(row.futureFairPrice > 0)) continue;
    unique.set(
      `${row.fillId}:${row.horizonMs}`,
      row.side === 'BUY'
        ? Math.max(0, ((row.fillPrice - row.futureFairPrice) / row.fillPrice) * 10_000)
        : Math.max(0, ((row.futureFairPrice - row.fillPrice) / row.fillPrice) * 10_000),
    );
  }
  const values = [...unique.values()];
  return Object.freeze({
    estimator: 'REALIZED_MAKER_FILL_MARKOUT_P95',
    sampleCount: values.length,
    p95Bps: values.length === 0 ? null : getDecibelPercentileV1(values, 0.95),
  });
}
