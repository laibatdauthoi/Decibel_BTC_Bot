import { appendFileSync, mkdtempSync, writeFileSync, renameSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { decibel_raw_ws_bbo_store_v1 } from '../src/decibel_adverse_selection_evidence_v1.js';
import {
  selectDecibelAdverseSelectionEstimateV1,
  type decibel_raw_ws_bbo_observation_v1,
} from '../src/decibel_adverse_selection_evidence_v1.js';
import { describe, expect, it } from 'vitest';
import { refreshDecibelProductionMarketDataV1 } from '../src/run_decibel_production_web_v1.js';
import { decibel_runtime_supervisor_v1 } from '../src/decibel_runtime_supervisor_v1.js';
import {
  hydrateDecibelProductionEconomicEvidenceV1,
  inspectDecibelAdverseEvidenceReadinessV1,
  resolveDecibelProductionEconomicColdStartV1,
  refreshDecibelProductionEconomicEvidenceV1,
  bootstrapDecibelProductionEconomicEvidenceV1,
} from '../src/decibel_production_economic_refresh_v1.js';
import { validateDecibelProductionEconomicEvidenceV1 } from '../src/decibel_production_live_state_source_v1.js';
import { readFileSync } from 'node:fs';

import {
  acquireDecibelAdverseWsCollectorOwnershipV1,
  decibel_adverse_ws_idle_watchdog_v1,
} from '../src/run_decibel_production_economic_viability_v1.js';

describe('Decibel adverse WS collector liveness', () => {
  it('detects an idle valid-BBO stream and recovers its observation clock after reconnect', () => {
    const Watchdog = new decibel_adverse_ws_idle_watchdog_v1(1_000);

    Watchdog.recordValidObservation(2_000);
    expect(Watchdog.isStalled(16_999, 15_000)).toBe(false);
    expect(Watchdog.isStalled(17_000, 15_000)).toBe(true);
    expect(Watchdog.getIdleAgeMs(17_000)).toBe(15_000);

    Watchdog.resetAfterReconnect(17_000);
    expect(Watchdog.isStalled(17_001, 15_000)).toBe(false);
    Watchdog.recordValidObservation(18_000);
    expect(Watchdog.getIdleAgeMs(18_500)).toBe(500);
  });

  it('permits only one WS collector owner and releases ownership idempotently', () => {
    const releaseFirst = acquireDecibelAdverseWsCollectorOwnershipV1();
    expect(() => acquireDecibelAdverseWsCollectorOwnershipV1()).toThrow(
      'DECIBEL_ADVERSE_WS_COLLECTOR_ALREADY_ACTIVE',
    );

    releaseFirst();
    releaseFirst();
    const releaseSecond = acquireDecibelAdverseWsCollectorOwnershipV1();
    expect(releaseSecond).toBeTypeOf('function');
    releaseSecond();
  });
});

it('replays PID6628 sample warmup through the production market publisher and economic producer while account reads are unavailable', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pid6628-data-replay-'));
  const evidencePath = join(root, 'economic.json');
  const Store = new decibel_raw_ws_bbo_store_v1(
    join(root, 'decibel_production_raw_ws_bbo_v1.jsonl'),
  );
  const Supervisor = new decibel_runtime_supervisor_v1();
  const start = 10_000_000;
  let now = start,
    unavailable = false;
  const environment = { DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: evidencePath };
  writeFileSync(
    evidencePath,
    JSON.stringify({
      observedAt: start,
      makerFeeObservedAt: start,
      makerFeeBps: 1.5,
      makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
      gasCostObservedAt: start,
      conservativeGasCostUsd: 0.001,
      gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
      aptUsd: 1,
      aptUsdObservedAt: start,
      aptUsdSource: 'TEST_VENUE',
      adverseSelectionObservedAt: start - 3_600_001,
      adverseSelectionBufferBps: 4,
      adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
      adverseSelectionRegime: 'NORMAL',
      adverseSelectionRepresentative: true,
      adverseSelectionEffectiveSampleCount: 30,
    }),
  );
  const identity = { orderId: 'previously-confirmed-order', clientOrderId: 'owned-client' };
  Supervisor.setAuthenticatedSnapshot(start, 5000, identity);
  const Source = {
    readPublicMarketState: () =>
      unavailable
        ? Promise.reject(new Error('WS_DISCONNECTED'))
        : Promise.resolve({
            observedAt: now,
            bestBid: 80_000 + (now - start) / 300_000,
            bestAsk: 80_001 + (now - start) / 300_000,
            wsConnectionState: 'CONNECTED' as const,
            wsSubscriptionState: 'SUBSCRIBED' as const,
            lastWsMessageAgeMs: 0,
            lastValidBboAgeMs: 0,
            wsReconnectCount: 0,
            wsLastDisconnectReason: null,
          }),
  };
  try {
    for (let i = 0; i <= 30; i++) {
      now = start + i * 30_000;
      Supervisor.setAuthenticatedReadBlocked(now);
      await refreshDecibelProductionMarketDataV1(Source, Supervisor, Store, 5000, () => now);
      hydrateDecibelProductionEconomicEvidenceV1(environment, now, Store);
      const progress = inspectDecibelAdverseEvidenceReadinessV1(environment, now, Store);
      if (i < 30) {
        expect(progress.status).toBe('WARMING');
        expect(progress.globalEffectiveSampleCount).toBe(i);
        expect(
          validateDecibelProductionEconomicEvidenceV1(evidencePath, now, 3_600_000).evidence,
        ).not.toBeNull();
      } else {
        expect(progress.status).toBe('READY');
        expect(progress.globalEffectiveSampleCount).toBe(30);
        expect(
          validateDecibelProductionEconomicEvidenceV1(evidencePath, now, 3_600_000).evidence,
        ).not.toBeNull();
      }
      expect(Supervisor.getSnapshot(now).runtimeState.domains.MarketDataState).toBe('READY');
      expect(Supervisor.getAuthenticatedSnapshot()).toBe(identity);
      expect(Supervisor.getSnapshot(now).readiness.executionSafe).toBe(false);
    }
    const publishedAt = (
      JSON.parse(readFileSync(evidencePath, 'utf8')) as { adverseSelectionObservedAt: number }
    ).adverseSelectionObservedAt;
    const qualified = readFileSync(evidencePath, 'utf8');
    writeFileSync(
      evidencePath,
      JSON.stringify({
        ...JSON.parse(qualified),
        adverseSelectionEffectiveSampleCount: 17,
        adverseSelectionRepresentative: true,
      }),
    );
    expect(
      validateDecibelProductionEconomicEvidenceV1(evidencePath, now, 3_600_000).evidence,
    ).toMatchObject({ adverseSelectionSource: undefined });
    writeFileSync(evidencePath, qualified);
    const parse = vi.spyOn(JSON, 'parse');
    try {
      hydrateDecibelProductionEconomicEvidenceV1(environment, now, Store);
      inspectDecibelAdverseEvidenceReadinessV1(environment, now, Store);
      expect(
        parse.mock.calls.filter(
          ([value]) => typeof value === 'string' && value.includes('"source":"DECIBEL_WS_BBO"'),
        ),
      ).toHaveLength(0);
    } finally {
      parse.mockRestore();
    }
    hydrateDecibelProductionEconomicEvidenceV1(environment, ++now, Store);
    expect(
      (JSON.parse(readFileSync(evidencePath, 'utf8')) as { adverseSelectionObservedAt: number })
        .adverseSelectionObservedAt,
    ).toBe(publishedAt);
    unavailable = true;
    await expect(
      refreshDecibelProductionMarketDataV1(Source, Supervisor, Store, 5000, () => now),
    ).rejects.toThrow('PRODUCTION_MARKET_DATA_READ_TRANSIENT');
    expect(Supervisor.getSnapshot(now).runtimeState.domains.MarketDataState).toBe('BLOCKED');
    unavailable = false;
    now += 1000;
    await refreshDecibelProductionMarketDataV1(Source, Supervisor, Store, 5000, () => now);
    expect(Supervisor.getSnapshot(now).runtimeState.domains.MarketDataState).toBe('READY');
    expect(Store.readFresh(now).at(-1)?.timestamp).toBe(now);
  } finally {
    Supervisor.stopScheduler();
  }
});

it('ignores older disconnected market observations after a newer healthy publication', () => {
  const Supervisor = new decibel_runtime_supervisor_v1();
  const healthy = {
    observedAt: 2000,
    wsConnectionState: 'CONNECTED',
    wsSubscriptionState: 'SUBSCRIBED',
    lastValidBboAgeMs: 0,
  };
  Supervisor.setMarketDataSnapshot(healthy, 2000, 5000);
  const generation = Supervisor.getMarketDataProjection().generation;
  Supervisor.setMarketDataSnapshot(
    {
      observedAt: 1000,
      wsConnectionState: 'DISCONNECTED',
      wsSubscriptionState: 'UNSUBSCRIBED',
      lastValidBboAgeMs: 6000,
    },
    1000,
    5000,
  );
  expect(Supervisor.getMarketDataSnapshot()).toBe(healthy);
  expect(Supervisor.getSnapshot(2000).runtimeState.domains.MarketDataState).toBe('READY');
  expect(Supervisor.getMarketDataProjection().generation).toBe(generation);
  Supervisor.stopScheduler();
});

it('reconstructs the actual PID6628 17/30 deficit and later 31-sample publication from persisted public observations', () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL('./fixtures/decibel_pid6628_market_warmup_v1.json', import.meta.url),
      'utf8',
    ),
  ) as {
    incidentAt: number;
    qualifiedAt: number;
    observations: decibel_raw_ws_bbo_observation_v1[];
  };
  const before = selectDecibelAdverseSelectionEstimateV1(
    fixture.observations,
    'NORMAL',
    fixture.incidentAt,
  );
  expect(before.globalEstimate.rawSampleCount).toBe(136);
  expect(before.regimeEstimate.effectiveSampleCount).toBe(17);
  expect(before.globalEstimate.effectiveSampleCount).toBe(17);
  expect(before.source).toBe('INSUFFICIENT');
  const after = selectDecibelAdverseSelectionEstimateV1(
    fixture.observations,
    'NORMAL',
    fixture.qualifiedAt,
  );
  expect(after.regimeEstimate.effectiveSampleCount).toBe(31);
  expect(after.regimeEstimate.p95AdverseSelectionBps).toBeCloseTo(4.5331204294757015, 12);
  expect(after.source).toBe('CURRENT_REGIME');
  expect(after.selected?.observedAt).toBe(fixture.qualifiedAt);
});

it('reconstructs PID1528 acquisition independently of refresh cadence and preserves the GLOBAL window across regime changes', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/decibel_pid1528_warmup_v1.json', import.meta.url), 'utf8'),
  ) as {
    start: number;
    observations: decibel_raw_ws_bbo_observation_v1[];
  };
  for (const [elapsed, regimeCount, globalCount] of [
    [180_000, 3, 5],
    [210_000, 4, 6],
  ] as const) {
    const at = fixture.start + elapsed;
    const seen = fixture.observations.filter((row) => row.timestamp <= at);
    const selection = selectDecibelAdverseSelectionEstimateV1(seen, seen.at(-1)!.regime, at);
    expect(selection.regimeEstimate.effectiveSampleCount).toBe(regimeCount);
    expect(selection.globalEstimate.effectiveSampleCount).toBe(globalCount);
    expect(selection.source).toBe('INSUFFICIENT');
  }
  const last = fixture.observations.at(-1)!;
  const selection = selectDecibelAdverseSelectionEstimateV1(
    fixture.observations,
    last.regime,
    last.timestamp,
  );
  expect(selection.globalEstimate.effectiveSampleCount).toBe(15);
  expect(selection.regimeEstimate.effectiveSampleCount).toBe(14);
  expect(
    fixture.observations.filter(
      (row, i, rows) => i > 0 && row.timestamp - rows[i - 1]!.timestamp < 30_000,
    ).length,
  ).toBeGreaterThan(150);
});

it('reuses qualifying persisted evidence on repeated warm restarts and publishes it before an unrelated HTTP refresh finishes', async () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL('./fixtures/decibel_pid6628_market_warmup_v1.json', import.meta.url),
      'utf8',
    ),
  ) as {
    qualifiedAt: number;
    observations: decibel_raw_ws_bbo_observation_v1[];
  };
  const root = mkdtempSync(join(tmpdir(), 'warm-restart-replay-'));
  const path = join(root, 'economic.json');
  const rawPath = join(root, 'decibel_production_raw_ws_bbo_v1.jsonl');
  const environment = { DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path };
  const now = fixture.qualifiedAt;
  writeFileSync(rawPath, fixture.observations.map((row) => JSON.stringify(row)).join('\n') + '\n');
  const evidence = {
    observedAt: now,
    makerFeeObservedAt: now,
    makerFeeBps: 1.5,
    makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
    gasCostObservedAt: now,
    conservativeGasCostUsd: 0.001,
    gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
    aptUsd: 1,
    aptUsdObservedAt: now,
    aptUsdSource: 'TEST',
    adverseSelectionObservedAt: now - 3_600_001,
    adverseSelectionBufferBps: 4,
    adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
    adverseSelectionRegime: 'NORMAL',
    adverseSelectionRawSampleCount: 31,
    adverseSelectionEffectiveSampleCount: 30,
    adverseSelectionRepresentative: true,
  };
  writeFileSync(path, JSON.stringify(evidence));
  const Store = new decibel_raw_ws_bbo_store_v1(rawPath);
  Store.readFresh(now);
  const parse = vi.spyOn(JSON, 'parse');
  try {
    expect(resolveDecibelProductionEconomicColdStartV1(environment, now, Store).ready).toBe(true);
    expect(
      parse.mock.calls.filter(
        ([value]) => typeof value === 'string' && value.includes('"source":"DECIBEL_WS_BBO"'),
      ),
    ).toHaveLength(0);
  } finally {
    parse.mockRestore();
  }
  for (const delay of [1000, 10_000, 60_000]) {
    const restarted = new decibel_raw_ws_bbo_store_v1(rawPath);
    expect(
      resolveDecibelProductionEconomicColdStartV1(environment, now + delay, restarted).ready,
    ).toBe(true);
    expect(
      validateDecibelProductionEconomicEvidenceV1(path, now + delay, 3_600_000).evidence
        ?.adverseSelectionObservedAt,
    ).toBe(now);
  }
  expect(
    resolveDecibelProductionEconomicColdStartV1(environment, now + 3_600_001, Store).ready,
  ).toBe(false);
  writeFileSync(path, JSON.stringify(evidence));
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  const events: string[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const refresh = refreshDecibelProductionEconomicEvidenceV1(environment, {
    rawWsBboStore: Store,
    onLocalEvidence: () => {
      expect(
        validateDecibelProductionEconomicEvidenceV1(path, now, 3_600_000).evidence
          ?.adverseSelectionObservedAt,
      ).toBe(now);
      events.push('LOCAL_VALIDATED');
    },
    runInputsAudit: async () => {
      events.push('HTTP_STARTED');
      await pending;
      return evidence;
    },
  });
  try {
    expect(events).toEqual(['LOCAL_VALIDATED', 'HTTP_STARTED']);
    expect(
      validateDecibelProductionEconomicEvidenceV1(path, now, 3_600_000).evidence,
    ).not.toBeNull();
    release();
    await refresh;
    writeFileSync(path, JSON.stringify(evidence));
    const recovered = await bootstrapDecibelProductionEconomicEvidenceV1(environment, {
      rawWsBboStore: Store,
      now: () => now,
      runInputsAudit: () => Promise.reject(new Error('ISOLATED_HTTP_TIMEOUT')),
    });
    expect(recovered).toMatchObject({
      lastKnownGoodReady: true,
      refreshResult: 'FAIL',
      economicEvidenceReady: true,
    });
  } finally {
    release();
    await refresh.catch(() => undefined);
    clock.mockRestore();
  }
});

it('reads only appended raw BBO rows on the hot path and handles external append, truncation, rotation and incomplete rows', () => {
  const root = mkdtempSync(join(tmpdir(), 'raw-bbo-incremental-'));
  const path = join(root, 'raw.jsonl');
  const row = (timestamp: number) => ({
    timestamp,
    bestBid: 100 + timestamp / 10000,
    bestAsk: 101 + timestamp / 10000,
    regime: 'NORMAL',
    source: 'DECIBEL_WS_BBO',
  });
  writeFileSync(
    path,
    Array.from({ length: 1000 }, (_, i) => JSON.stringify(row(i))).join('\n') + '\n',
  );
  const Store = new decibel_raw_ws_bbo_store_v1(path);
  expect(Store.readFresh(999, 1000)).toHaveLength(1000);
  const parse = vi.spyOn(JSON, 'parse');
  try {
    expect(Store.readFresh(999, 1000)).toHaveLength(1000);
    expect(parse).not.toHaveBeenCalled();
    appendFileSync(path, JSON.stringify(row(1000)) + '\n');
    expect(Store.readFresh(1000, 2).map((r) => r.timestamp)).toEqual([998, 999, 1000]);
    expect(parse).toHaveBeenCalledTimes(1);
  } finally {
    parse.mockRestore();
  }
  const fragment = JSON.stringify(row(1001));
  appendFileSync(path, fragment.slice(0, 20));
  expect(Store.readFresh(1001, 1).map((r) => r.timestamp)).toEqual([1000]);
  appendFileSync(path, fragment.slice(20));
  expect(Store.readFresh(1001, 1).map((r) => r.timestamp)).toEqual([1000, 1001]);
  appendFileSync(path, '\n' + JSON.stringify(row(997)) + '\n');
  expect(Store.readFresh(1001, 4).map((r) => r.timestamp)).toEqual([
    997, 997, 998, 999, 1000, 1001,
  ]);
  writeFileSync(path, JSON.stringify(row(2000)) + '\n');
  expect(Store.readFresh(2000, 1000).map((r) => r.timestamp)).toEqual([2000]);
  const replacement = join(root, 'rotated.jsonl');
  writeFileSync(replacement, JSON.stringify(row(3000)) + '\n');
  renameSync(replacement, path);
  expect(Store.readFresh(3000, 1000).map((r) => r.timestamp)).toEqual([3000]);
  writeFileSync(path, JSON.stringify(row(4000)) + '\n');
  utimesSync(path, 5, 5);
  expect(Store.readFresh(4000, 1000).map((r) => r.timestamp)).toEqual([4000]);
});
