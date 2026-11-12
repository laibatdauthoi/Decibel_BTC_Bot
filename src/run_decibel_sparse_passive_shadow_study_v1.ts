import dotenv from 'dotenv';

dotenv.config();

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { getDecibelPercentileV1 } from './decibel_market_making_economics_v1.js';
import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from './decibel_minimal_live_canary_v1.js';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';

export type trade_v1 = Readonly<{ price: number; timestamp: number }>;
export type regime_v1 = 'RISING' | 'FALLING' | 'NEUTRAL';

export function getRegime(trades: readonly trade_v1[], index: number): regime_v1 {
  const current = trades[index]!;
  let anchor = trades[0]!;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (trades[cursor]!.timestamp <= current.timestamp - 300_000) {
      anchor = trades[cursor]!;
      break;
    }
  }
  const returnBps = ((current.price - anchor.price) / anchor.price) * 10_000;
  return returnBps > 2 ? 'RISING' : returnBps < -2 ? 'FALLING' : 'NEUTRAL';
}

export async function loadTrades(environment: NodeJS.ProcessEnv): Promise<readonly trade_v1[]> {
  const { MAINNET_CONFIG } = await loadDecibelSdkRuntimeV1();
  const apiKey = environment.DECIBEL_NODE_API_KEY?.trim();
  const limit = Number(environment.DECIBEL_SPARSE_STUDY_TRADE_COUNT ?? 5_000);
  const trades: trade_v1[] = [];
  for (let offset = 0; offset < limit; offset += 200) {
    const url = new URL(`${MAINNET_CONFIG.tradingHttpUrl}/api/v1/trades`);
    url.searchParams.set('market', DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1);
    url.searchParams.set('limit', String(Math.min(200, limit - offset)));
    url.searchParams.set('offset', String(offset));
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch(url, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          signal: AbortSignal.timeout(30_000),
        });
        break;
      } catch (error: unknown) {
        if (attempt === 2) throw error;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500 * 2 ** attempt));
      }
    }
    if (response === undefined) throw new Error('DECIBEL_SPARSE_STUDY_RESPONSE_UNAVAILABLE');
    if (!response.ok) throw new Error(`DECIBEL_SPARSE_STUDY_HTTP_${response.status}`);
    const body = (await response.json()) as { items?: readonly Record<string, unknown>[] };
    const page = body.items ?? [];
    for (const row of page) {
      if (typeof row.price === 'number' && typeof row.transaction_unix_ms === 'number')
        trades.push(Object.freeze({ price: row.price, timestamp: row.transaction_unix_ms }));
    }
    if (page.length < 200) break;
  }
  return Object.freeze(
    [...new Map(trades.map((trade) => [`${trade.timestamp}:${trade.price}`, trade])).values()].sort(
      (left, right) => left.timestamp - right.timestamp,
    ),
  );
}

function evaluateBucket(
  trades: readonly trade_v1[],
  distanceBps: number,
  side: 'BUY' | 'SELL',
  regime: regime_v1,
  requiredEdgeBps: number,
  fixedCostsBps: number,
): Readonly<Record<string, unknown>> {
  const horizons = [1_000, 5_000, 15_000, 30_000] as const;
  const restMs: number[] = [];
  const exposureMs: number[] = [];
  const markouts = new Map<number, number[]>(horizons.map((horizon) => [horizon, []]));
  let evaluated = 0;
  for (let index = 0; index < trades.length; index += 1) {
    if (getRegime(trades, index) !== regime) continue;
    evaluated += 1;
    const entry = trades[index]!;
    const quote = entry.price * (1 + (side === 'BUY' ? -1 : 1) * (distanceBps / 10_000));
    let fillIndex = -1;
    for (let cursor = index + 1; cursor < trades.length; cursor += 1) {
      const candidate = trades[cursor]!;
      if (candidate.timestamp > entry.timestamp + 60_000) break;
      if (side === 'BUY' ? candidate.price <= quote : candidate.price >= quote) {
        fillIndex = cursor;
        break;
      }
    }
    if (fillIndex < 0) continue;
    const fill = trades[fillIndex]!;
    restMs.push(fill.timestamp - entry.timestamp);
    for (const horizon of horizons) {
      const after = trades
        .slice(fillIndex + 1)
        .find((candidate) => candidate.timestamp >= fill.timestamp + horizon);
      if (after === undefined) continue;
      markouts
        .get(horizon)!
        .push(
          side === 'BUY'
            ? Math.max(0, ((quote - after.price) / quote) * 10_000)
            : Math.max(0, ((after.price - quote) / quote) * 10_000),
        );
    }
    const neutralized = trades
      .slice(fillIndex + 1)
      .find((candidate) =>
        side === 'BUY' ? candidate.price >= entry.price : candidate.price <= entry.price,
      );
    if (neutralized !== undefined) exposureMs.push(neutralized.timestamp - fill.timestamp);
  }
  const p95ByHorizon = Object.fromEntries(
    horizons.map((horizon) => {
      const values = markouts.get(horizon)!;
      return [String(horizon), values.length === 0 ? null : getDecibelPercentileV1(values, 0.95)];
    }),
  );
  const adverseValues = [...markouts.values()].flat();
  return Object.freeze({
    distanceBps,
    side,
    regime,
    evaluated,
    opportunities: restMs.length,
    opportunityRate: evaluated === 0 ? 0 : restMs.length / evaluated,
    medianRestMs: restMs.length === 0 ? null : getDecibelPercentileV1(restMs, 0.5),
    p95RestMs: restMs.length === 0 ? null : getDecibelPercentileV1(restMs, 0.95),
    adverseMarkoutBps: p95ByHorizon,
    distanceConditionalP95AdverseBps:
      adverseValues.length === 0 ? null : getDecibelPercentileV1(adverseValues, 0.95),
    conservativeNetExpectedEdgeBps: distanceBps - requiredEdgeBps,
    distanceConditionalNetExpectedEdgeBps:
      adverseValues.length === 0
        ? null
        : distanceBps - fixedCostsBps - getDecibelPercentileV1(adverseValues, 0.95),
    medianInventoryExposureMs:
      exposureMs.length === 0 ? null : getDecibelPercentileV1(exposureMs, 0.5),
    p95InventoryExposureMs:
      exposureMs.length === 0 ? null : getDecibelPercentileV1(exposureMs, 0.95),
  });
}

export async function runDecibelSparsePassiveShadowStudyV1(
  environment: NodeJS.ProcessEnv,
): Promise<Readonly<Record<string, unknown>>> {
  const evidence = JSON.parse(
    readFileSync(
      resolve(
        environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH ??
          'data/decibel_production_economic_inputs_v1.json',
      ),
      'utf8',
    ),
  ) as { makerFeeBps: number; conservativeGasCostUsd: number; adverseSelectionBufferBps: number };
  const safetyMarginBps = Number(environment.DECIBEL_PRODUCTION_EDGE_SAFETY_MARGIN_BPS ?? 1);
  const gasBps = (evidence.conservativeGasCostUsd / 10) * 10_000;
  const requiredEdgeBps =
    evidence.makerFeeBps + gasBps + evidence.adverseSelectionBufferBps + safetyMarginBps;
  const fixedCostsBps = evidence.makerFeeBps + gasBps + safetyMarginBps;
  const trades = await loadTrades(environment);
  if (trades.length < 1_000)
    throw new Error(`DECIBEL_SPARSE_STUDY_SAMPLE_INSUFFICIENT:${trades.length}`);
  const buckets = [5, 6, 7, 8, 9, 10, 12].flatMap((distanceBps) =>
    (['RISING', 'FALLING', 'NEUTRAL'] as const).flatMap((regime) =>
      (['BUY', 'SELL'] as const).map((side) =>
        evaluateBucket(trades, distanceBps, side, regime, requiredEdgeBps, fixedCostsBps),
      ),
    ),
  );
  const minimumEvidence = 30;
  const policy = Object.fromEntries(
    (['RISING', 'FALLING', 'NEUTRAL'] as const).flatMap((regime) =>
      (['BUY', 'SELL'] as const).map((side) => {
        const viable = buckets.find(
          (bucket) =>
            bucket.regime === regime &&
            bucket.side === side &&
            Number(bucket.opportunities) >= minimumEvidence &&
            Number(bucket.distanceConditionalNetExpectedEdgeBps) > 0,
        );
        return [`${regime}_${side}`, viable?.distanceBps ?? null];
      }),
    ),
  );
  const positionLimitUsd = 50;
  const maximumPrice = Math.max(...trades.map((trade) => trade.price));
  const maximumAbsPositionBase = positionLimitUsd / maximumPrice;
  const active = new Map<'BUY' | 'SELL', { quote: number; expiresAt: number }>();
  let inventoryBase = 0;
  let maximumLongNotionalUsd = 0;
  let maximumShortNotionalUsd = 0;
  let inventoryLimitBreaches = 0;
  let selectiveFillOpportunities = 0;
  for (let index = 0; index < trades.length; index += 1) {
    const trade = trades[index]!;
    for (const side of ['BUY', 'SELL'] as const) {
      const order = active.get(side);
      if (order !== undefined && trade.timestamp > order.expiresAt) active.delete(side);
      else if (
        order !== undefined &&
        (side === 'BUY' ? trade.price <= order.quote : trade.price >= order.quote)
      ) {
        const quantity = 10 / order.quote;
        inventoryBase += side === 'BUY' ? quantity : -quantity;
        selectiveFillOpportunities += 1;
        active.delete(side);
      }
    }
    const inventoryNotionalUsd = inventoryBase * trade.price;
    maximumLongNotionalUsd = Math.max(maximumLongNotionalUsd, inventoryNotionalUsd);
    maximumShortNotionalUsd = Math.max(maximumShortNotionalUsd, -inventoryNotionalUsd);
    if (Math.abs(inventoryBase) > maximumAbsPositionBase + Number.EPSILON)
      inventoryLimitBreaches += 1;
    const regime = getRegime(trades, index);
    for (const side of ['BUY', 'SELL'] as const) {
      if (active.has(side)) continue;
      const distance = policy[`${regime}_${side}`];
      if (typeof distance !== 'number') continue;
      const quantity = 10 / trade.price;
      const projected = inventoryBase + (side === 'BUY' ? quantity : -quantity);
      const exposureIncreasing =
        (side === 'BUY' && inventoryBase >= 0) || (side === 'SELL' && inventoryBase <= 0);
      if (exposureIncreasing && Math.abs(projected) > maximumAbsPositionBase) continue;
      active.set(side, {
        quote: trade.price * (1 + (side === 'BUY' ? -1 : 1) * (distance / 10_000)),
        expiresAt: trade.timestamp + 60_000,
      });
    }
  }
  const report = Object.freeze({
    version: 'DECIBEL_SPARSE_PASSIVE_SHADOW_STUDY_V1',
    generatedAt: Date.now(),
    tradeObservationCount: trades.length,
    firstTradeTimestamp: trades[0]!.timestamp,
    lastTradeTimestamp: trades.at(-1)!.timestamp,
    distancesBps: Object.freeze([5, 6, 7, 8, 9, 10, 12]),
    maximumRestMs: 60_000,
    makerFeeBps: evidence.makerFeeBps,
    gasBpsAt10Usd: gasBps,
    conservativeAdverseBufferBps: evidence.adverseSelectionBufferBps,
    safetyMarginBps,
    requiredEdgeBps,
    minimumEvidencePerRegimeSide: minimumEvidence,
    policy,
    selectiveFillOpportunities,
    maximumSimulatedLongNotionalUsd: maximumLongNotionalUsd,
    maximumSimulatedShortNotionalUsd: maximumShortNotionalUsd,
    positionLimitUsd,
    inventoryLimitBreaches,
    buckets,
    placeInvocations: 0,
    cancelInvocations: 0,
    signedTransactions: 0,
  });
  const reportPath = resolve(`data/decibel_sparse_passive_shadow_study_v1_${Date.now()}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(
    resolve('data/decibel_regime_edge_model_v1.json'),
    `${JSON.stringify(
      {
        version: 'DECIBEL_REGIME_EDGE_MODEL_V1',
        generatedAt: report.generatedAt,
        sourceReportPath: reportPath,
        regimeLookbackMs: 300_000,
        regimeThresholdBps: 2,
        minimumEvidencePerRegimeSide: minimumEvidence,
        fixedCostsBps,
        policy,
        buckets,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return Object.freeze({ ...report, reportPath, buckets: undefined });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runDecibelSparsePassiveShadowStudyV1(process.env)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error: unknown) => {
      console.error(
        `DECIBEL_SPARSE_PASSIVE_SHADOW_STUDY=FAIL BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`,
      );
      process.exitCode = 1;
    });
}
