import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  calculateDecibelBlockAwareSyntheticBboMarkoutsV1,
  calculateDecibelBlockAwareGlobalSyntheticBboMarkoutsV1,
  calculateDecibelRealizedMakerFillAdverseP95V1,
  decibel_raw_ws_bbo_store_v1,
  hydrateDecibelProductionRawWsBboStoreV1,
  resolveDecibelProductionEconomicStorePathsV1,
  selectDecibelAdverseSelectionEstimateV1,
} from '../src/decibel_adverse_selection_evidence_v1.js';

import {
  calculateDecibelAdverseMarkoutsV1,
  calculateDecibelMakerFeeUsdV1,
  evaluateDecibelPassiveQuoteDistanceV1,
} from '../src/decibel_market_making_economics_v1.js';
import {
  hydrateDecibelProductionEconomicEvidenceV1,
  inspectDecibelAdverseEvidenceReadinessV1,
  readDecibelProductionEconomicComponentStatesV1,
  resolveDecibelProductionEconomicColdStartV1,
  refreshDecibelProductionEconomicEvidenceV1,
} from '../src/decibel_production_economic_refresh_v1.js';
import { selectCanonicalDecibelAdverseEvidenceV1 } from '../src/run_decibel_production_economic_viability_v1.js';

describe('Decibel market-making economics V1', () => {
  const makeCanonicalRows = (now: number, count: number) =>
    Array.from({ length: count }, (_, index) => ({
      timestamp: now - (count - 1 - index) * 31_000,
      bestBid: 100 + index * 0.01,
      bestAsk: 100.1 + index * 0.01,
      regime: index % 2 === 0 ? ('FAST' as const) : ('NORMAL' as const),
      source: 'DECIBEL_WS_BBO' as const,
    }));

  it('reuses only a complete fresh canonical snapshot during cold start', () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-cold-start-'));
    const evidencePath = join(root, 'evidence.json');
    const now = 1_800_000_000_000;
    const environment = {
      DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: evidencePath,
      DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: '3600000',
    };
    writeFileSync(
      evidencePath,
      JSON.stringify({
        observedAt: now,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        makerFeeObservedAt: now,
        conservativeGasCostUsd: 0.002,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        gasCostObservedAt: now,
        aptUsd: 4,
        aptUsdSource: 'TEST_ORACLE',
        aptUsdObservedAt: now,
        adverseSelectionBufferBps: 3,
        adverseSelectionSource: 'GLOBAL_FALLBACK',
        adverseSelectionObservedAt: now,
        adverseSelectionRegime: 'GLOBAL',
        adverseSelectionRawSampleCount: 30,
        adverseSelectionEffectiveSampleCount: 30,
        adverseSelectionRepresentative: true,
      }),
    );

    expect(resolveDecibelProductionEconomicColdStartV1(environment, now)).toEqual({
      policy: 'VALIDATED_CACHE_REUSE',
      ready: true,
      blocker: null,
    });
    expect(resolveDecibelProductionEconomicColdStartV1(environment, now + 3_600_001)).toMatchObject(
      {
        policy: 'FAIL_CLOSED_WARMUP',
        ready: false,
      },
    );
  });

  it('reports cold and progressive adverse warmup precisely before becoming ready', () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-adverse-progress-'));
    const evidencePath = join(root, 'evidence.json');
    const environment = { DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: evidencePath };
    const start = 1_800_000_000_000;
    const Store = hydrateDecibelProductionRawWsBboStoreV1(environment);

    expect(inspectDecibelAdverseEvidenceReadinessV1(environment, start)).toMatchObject({
      status: 'WARMING',
      freshObservationCount: 0,
      regimeEffectiveSampleCount: 0,
      globalEffectiveSampleCount: 0,
      blocker: 'ADVERSE_SELECTION_EVIDENCE_INSUFFICIENT:REGIME=0/30:GLOBAL=0/30',
    });

    for (let index = 0; index < 16; index += 1)
      Store.append({
        timestamp: start + index * 31_000,
        bestBid: 100 + index * 0.01,
        bestAsk: 100.1 + index * 0.01,
        regime: 'NORMAL',
        source: 'DECIBEL_WS_BBO',
      });
    const warming = inspectDecibelAdverseEvidenceReadinessV1(environment, start + 15 * 31_000);
    expect(warming).toMatchObject({
      status: 'WARMING',
      regimeEffectiveSampleCount: 15,
      globalEffectiveSampleCount: 15,
    });
    expect(
      Store.append({
        timestamp: start + 16 * 31_000,
        bestBid: 100.15,
        bestAsk: 100.25,
        regime: 'NORMAL',
        source: 'DECIBEL_WS_BBO',
      }),
    ).toBe(false);

    for (let index = 16; index < 31; index += 1)
      Store.append({
        timestamp: start + index * 31_000,
        bestBid: 100 + index * 0.01,
        bestAsk: 100.1 + index * 0.01,
        regime: index % 2 === 0 ? 'FAST' : 'NORMAL',
        source: 'DECIBEL_WS_BBO',
      });
    const ready = inspectDecibelAdverseEvidenceReadinessV1(environment, start + 30 * 31_000);
    expect(ready.status).toBe('READY');
    expect(ready.globalEffectiveSampleCount).toBeGreaterThanOrEqual(30);
    expect(ready.blocker).toBeNull();

    const expired = inspectDecibelAdverseEvidenceReadinessV1(
      environment,
      start + 30 * 31_000 + 3_600_001,
    );
    expect(expired).toMatchObject({
      status: 'WARMING',
      freshObservationCount: 0,
      globalEffectiveSampleCount: 0,
    });
  });

  it('validates hydrated canonical rows when collector memory starts empty', () => {
    const now = 1_800_000_000_000;
    const selected = selectCanonicalDecibelAdverseEvidenceV1(
      makeCanonicalRows(now, 40),
      now,
      3_600_000,
    );

    expect(selected.selection.source).toBe('GLOBAL_FALLBACK');
    expect(selected.selection.selected?.effectiveSampleCount).toBeGreaterThanOrEqual(30);
  });

  it('fails closed for stale or insufficient canonical adverse rows', () => {
    const now = 1_800_000_000_000;
    const stale = makeCanonicalRows(now - 3_600_001, 40);
    expect(() => selectCanonicalDecibelAdverseEvidenceV1(stale, now, 3_600_000)).toThrow(
      'ADVERSE_RAW_WS_BBO_EVIDENCE_UNAVAILABLE',
    );
    expect(() =>
      selectCanonicalDecibelAdverseEvidenceV1(makeCanonicalRows(now, 20), now, 3_600_000),
    ).toThrow('ADVERSE_EVIDENCE_INSUFFICIENT');
  });

  it('shares one canonical raw evidence namespace across production and shadow consumers', () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-economic-store-'));
    const production = resolveDecibelProductionEconomicStorePathsV1({
      DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: join(root, 'evidence.json'),
      DECIBEL_PRODUCTION_RAW_WS_BBO_PATH: join(root, 'wrong-production.jsonl'),
    });
    const shadow = resolveDecibelProductionEconomicStorePathsV1({
      DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: join(root, 'evidence.json'),
      DECIBEL_PRODUCTION_RAW_WS_BBO_PATH: join(root, 'wrong-shadow.jsonl'),
    });
    expect(production.rawWsBboPath).toBe(shadow.rawWsBboPath);
    expect(production.rawWsBboPath).toBe(join(root, 'decibel_production_raw_ws_bbo_v1.jsonl'));
  });

  it('hydrates the same persisted effective samples after consumer restart', () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-economic-restart-'));
    const environment = {
      DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: join(root, 'evidence.json'),
    };
    const shadowPaths = resolveDecibelProductionEconomicStorePathsV1(environment);
    const ShadowStore = new decibel_raw_ws_bbo_store_v1(shadowPaths.rawWsBboPath);
    const start = 1_800_000_000_000;
    for (let index = 0; index < 35; index += 1)
      ShadowStore.append({
        timestamp: start + index * 31_000,
        bestBid: 100 + index * 0.01,
        bestAsk: 100.1 + index * 0.01,
        regime: 'NORMAL',
        source: 'DECIBEL_WS_BBO',
      });

    const productionPaths = resolveDecibelProductionEconomicStorePathsV1({ ...environment });
    const ProductionStore = new decibel_raw_ws_bbo_store_v1(productionPaths.rawWsBboPath);
    const hydrated = ProductionStore.readFresh(start + 34 * 31_000);
    const estimate = calculateDecibelBlockAwareSyntheticBboMarkoutsV1(
      hydrated,
      'NORMAL',
      start + 34 * 31_000,
    );

    expect(productionPaths.rawWsBboPath).toBe(shadowPaths.rawWsBboPath);
    expect(hydrated).toHaveLength(35);
    expect(estimate.representative).toBe(true);
    expect(estimate.effectiveSampleCount).toBeGreaterThanOrEqual(30);
  });

  it('migrates legacy shadow observations once into the canonical shared store', () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-economic-migration-'));
    const evidencePath = join(root, 'evidence.json');
    const legacyPath = join(root, 'legacy-shadow.jsonl');
    const LegacyStore = new decibel_raw_ws_bbo_store_v1(legacyPath);
    const now = Date.now();
    for (let index = 0; index < 4; index += 1)
      LegacyStore.append({
        timestamp: now - 93_000 + index * 31_000,
        bestBid: 100 + index * 0.01,
        bestAsk: 100.1 + index * 0.01,
        regime: 'NORMAL',
        source: 'DECIBEL_WS_BBO',
      });

    const HydratedStore = hydrateDecibelProductionRawWsBboStoreV1({
      DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: evidencePath,
      DECIBEL_PRODUCTION_RAW_WS_BBO_PATH: legacyPath,
    });
    expect(HydratedStore.readFresh(now)).toHaveLength(4);
    expect(
      resolveDecibelProductionEconomicStorePathsV1({
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: evidencePath,
      }).rawWsBboPath,
    ).toBe(join(root, 'decibel_production_raw_ws_bbo_v1.jsonl'));
  });
  it('deduplicates raw WS BBO and automatically recovers when regime evidence is representative', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-adverse-')), 'raw.jsonl');
    const Store = new decibel_raw_ws_bbo_store_v1(path);
    const start = 1_800_000_000_000;
    for (let index = 0; index < 35; index += 1) {
      const observation = {
        timestamp: start + index * 31_000,
        bestBid: 100 + index * 0.01,
        bestAsk: 100.1 + index * 0.01,
        regime: 'NORMAL' as const,
        source: 'DECIBEL_WS_BBO' as const,
      };
      expect(Store.append(observation)).toBe(true);
      expect(Store.append({ ...observation, timestamp: observation.timestamp + 1 })).toBe(false);
    }
    const fresh = Store.readFresh(start + 34 * 31_000);
    expect(fresh).toHaveLength(35);
    const insufficient = calculateDecibelBlockAwareSyntheticBboMarkoutsV1(
      fresh.slice(0, 20),
      'NORMAL',
      start + 19 * 31_000,
    );
    expect(insufficient.representative).toBe(false);
    expect(insufficient.p95AdverseSelectionBps).toBeNull();
    const recovered = calculateDecibelBlockAwareSyntheticBboMarkoutsV1(
      fresh,
      'NORMAL',
      start + 34 * 31_000,
    );
    expect(recovered.representative).toBe(true);
    expect(recovered.effectiveSampleCount).toBeGreaterThanOrEqual(30);
    expect(recovered.p95AdverseSelectionBps).not.toBeNull();
    expect(recovered.horizons.map((horizon) => horizon.horizonMs)).toEqual([
      1_000, 5_000, 15_000, 30_000,
    ]);
    expect(Store.readFresh(start + 34 * 31_000 + 3_600_001)).toHaveLength(0);
  });

  it('keeps synthetic BBO and realized maker-fill estimators separate', () => {
    const realized = calculateDecibelRealizedMakerFillAdverseP95V1([
      {
        fillId: 'fill-1',
        side: 'BUY',
        fillPrice: 100,
        fillTimestamp: 1_000,
        futureFairPrice: 99.9,
        horizonMs: 30_000,
      },
    ]);
    expect(realized.estimator).toBe('REALIZED_MAKER_FILL_MARKOUT_P95');
    expect(realized.sampleCount).toBe(1);
    expect(realized.p95Bps).toBeCloseTo(10, 9);
  });

  it('uses fresh global evidence without copying one regime bucket into another', () => {
    const start = 1_800_000_000_000;
    const observations = Array.from({ length: 40 }, (_, index) => ({
      timestamp: start + index * 31_000,
      bestBid: 100 + index * 0.01,
      bestAsk: 100.1 + index * 0.01,
      regime: index % 2 === 0 ? ('FAST' as const) : ('NORMAL' as const),
      source: 'DECIBEL_WS_BBO' as const,
    }));
    const now = observations.at(-1)!.timestamp;
    const selection = selectDecibelAdverseSelectionEstimateV1(observations, 'NORMAL', now);

    expect(selection.regimeEstimate.effectiveSampleCount).toBeLessThan(30);
    expect(selection.globalEstimate.effectiveSampleCount).toBeGreaterThanOrEqual(30);
    expect(selection.source).toBe('GLOBAL_FALLBACK');
    expect(selection.selected?.regime).toBe('GLOBAL');
    expect(selection.selected?.estimator).toBe('SYNTHETIC_BBO_BLOCK_AWARE_GLOBAL_P95');
    expect(
      calculateDecibelBlockAwareSyntheticBboMarkoutsV1(observations, 'FAST', now)
        .effectiveSampleCount,
    ).toBeLessThan(30);
  });

  it('fails closed when both regime and global evidence are below the unchanged floor', () => {
    const start = 1_800_000_000_000;
    const observations = Array.from({ length: 20 }, (_, index) => ({
      timestamp: start + index * 31_000,
      bestBid: 100 + index * 0.01,
      bestAsk: 100.1 + index * 0.01,
      regime: index % 2 === 0 ? ('QUIET' as const) : ('FAST' as const),
      source: 'DECIBEL_WS_BBO' as const,
    }));
    const now = observations.at(-1)!.timestamp;
    const global = calculateDecibelBlockAwareGlobalSyntheticBboMarkoutsV1(observations, now);
    const selection = selectDecibelAdverseSelectionEstimateV1(observations, 'QUIET', now);

    expect(global.effectiveSampleCount).toBeLessThan(30);
    expect(selection.source).toBe('INSUFFICIENT');
    expect(selection.selected).toBeNull();
  });

  it('hydrates economic readiness from global fallback while preserving regime buckets', () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-global-fallback-'));
    const evidencePath = join(root, 'evidence.json');
    const environment = { DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: evidencePath };
    const now = 1_800_000_000_000;
    writeFileSync(
      evidencePath,
      JSON.stringify({
        observedAt: now,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        makerFeeObservedAt: now,
        conservativeGasCostUsd: 0.002,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        gasCostObservedAt: now,
        aptUsd: 1,
        aptUsdSource: 'TEST_ORACLE',
        aptUsdObservedAt: now,
      }),
    );
    const Store = hydrateDecibelProductionRawWsBboStoreV1(environment);
    for (let index = 0; index < 40; index += 1)
      Store.append({
        timestamp: now - (39 - index) * 31_000,
        bestBid: 100 + index * 0.01,
        bestAsk: 100.1 + index * 0.01,
        regime: index % 2 === 0 ? 'FAST' : 'NORMAL',
        source: 'DECIBEL_WS_BBO',
      });

    hydrateDecibelProductionEconomicEvidenceV1(environment, now);
    const published = JSON.parse(readFileSync(evidencePath, 'utf8')) as Record<string, unknown>;
    const states = readDecibelProductionEconomicComponentStatesV1(environment, now);

    expect(published.adverseSelectionSource).toBe('GLOBAL_FALLBACK');
    expect(published.adverseSelectionRegime).toBe('GLOBAL');
    expect(published.adverseSelectionEffectiveSampleCount).toBeGreaterThanOrEqual(30);
    expect(published.adverseSelectionRegimeBuckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ regime: 'NORMAL', representative: false }),
        expect.objectContaining({ regime: 'FAST', representative: false }),
      ]),
    );
    expect(states.every((state) => state.status === 'READY')).toBe(true);
  });

  it('publishes canonical GLOBAL fallback during refresh without starting a second collector', async () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-global-refresh-'));
    const evidencePath = join(root, 'evidence.json');
    const environment = { DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: evidencePath };
    const now = Date.now();
    writeFileSync(
      evidencePath,
      JSON.stringify({
        observedAt: now,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        makerFeeObservedAt: now,
        conservativeGasCostUsd: 0.002,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        gasCostObservedAt: now,
        aptUsd: 1,
        aptUsdSource: 'TEST_ORACLE',
        aptUsdObservedAt: now,
      }),
    );
    const Store = hydrateDecibelProductionRawWsBboStoreV1(environment);
    for (let index = 0; index < 40; index += 1)
      Store.append({
        timestamp: now - (39 - index) * 31_000,
        bestBid: 100 + index * 0.01,
        bestAsk: 100.1 + index * 0.01,
        regime: index % 2 === 0 ? 'FAST' : 'NORMAL',
        source: 'DECIBEL_WS_BBO',
      });
    let separateCollectorCalls = 0;

    await refreshDecibelProductionEconomicEvidenceV1(environment, {
      runInputsAudit: () =>
        Promise.resolve({
          observedAt: now,
          makerFeeBps: 1.5,
          makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
          makerFeeObservedAt: now,
          conservativeGasCostUsd: 0.002,
          gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
          gasCostObservedAt: now,
          aptUsd: 1,
          aptUsdSource: 'TEST_ORACLE',
          aptUsdObservedAt: now,
        }),
      runViabilityAudit: () => {
        separateCollectorCalls += 1;
        return Promise.reject(new Error('SEPARATE_COLLECTOR_MUST_NOT_RUN'));
      },
    });

    const published = JSON.parse(readFileSync(evidencePath, 'utf8')) as Record<string, unknown>;
    expect(separateCollectorCalls).toBe(0);
    expect(published.adverseSelectionSource).toBe('GLOBAL_FALLBACK');
    expect(published.adverseSelectionEffectiveSampleCount).toBeGreaterThanOrEqual(30);
  });
  it('interprets a decimal maker rate as a fraction of notional', () => {
    expect(calculateDecibelMakerFeeUsdV1(10, 0.00015)).toBeCloseTo(0.0015, 12);
  });

  it('mirrors adverse BUY and SELL markouts correctly', () => {
    const falling = calculateDecibelAdverseMarkoutsV1(
      [
        { timestamp: 0, bestBid: 99, bestAsk: 101 },
        { timestamp: 1_000, bestBid: 89, bestAsk: 91 },
      ],
      [1_000],
    )[0]!;
    expect(falling.buyP95AdverseBps).toBeGreaterThan(0);
    expect(falling.sellP95AdverseBps).toBe(0);

    const rising = calculateDecibelAdverseMarkoutsV1(
      [
        { timestamp: 0, bestBid: 99, bestAsk: 101 },
        { timestamp: 1_000, bestBid: 109, bestAsk: 111 },
      ],
      [1_000],
    )[0]!;
    expect(rising.buyP95AdverseBps).toBe(0);
    expect(rising.sellP95AdverseBps).toBeGreaterThan(0);
  });

  it('does not count a wider resting quote as filled without a later BBO cross', () => {
    const result = evaluateDecibelPassiveQuoteDistanceV1(
      [
        { timestamp: 0, bestBid: 99, bestAsk: 101 },
        { timestamp: 10_000, bestBid: 99.5, bestAsk: 100.5 },
        { timestamp: 50_000, bestBid: 99.5, bestAsk: 100.5 },
      ],
      { distanceBps: 100, maximumRestMs: 30_000, markoutHorizonMs: 30_000, requiredEdgeBps: 5 },
    );
    expect(result.fillOpportunities).toBe(0);
    expect(result.netExpectedEdgeBps).toBe(95);
  });
});
