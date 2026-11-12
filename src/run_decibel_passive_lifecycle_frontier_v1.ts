import dotenv from 'dotenv';

dotenv.config();

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { getDecibelPercentileV1 } from './decibel_market_making_economics_v1.js';
import { classifyRegimes } from './run_decibel_market_state_policy_search_v1.js';
import {
  loadTrades,
  type regime_v1,
  type trade_v1,
} from './run_decibel_sparse_passive_shadow_study_v1.js';

type side_v1 = 'BUY' | 'SELL';
type family_v1 = 'CURRENT' | 'STICKY' | 'EDGE_INVALIDATION_ONLY' | 'LONG_LIVED_SPARSE';

const DISTANCES: Readonly<Record<regime_v1, Readonly<Partial<Record<side_v1, number>>>>> = {
  RISING: { BUY: 4, SELL: 12 },
  FALLING: { SELL: 10 },
  NEUTRAL: { BUY: 9, SELL: 7 },
};
const GAS_APT_PER_TX = 0.000648;
const APT_USD = 0.6661;
const NOTIONAL_USD = 10;
const MAX_INVENTORY_USD = 50;

function findAfter(
  trades: readonly trade_v1[],
  index: number,
  timestamp: number,
): trade_v1 | undefined {
  for (let cursor = index + 1; cursor < trades.length; cursor += 1)
    if (trades[cursor]!.timestamp >= timestamp) return trades[cursor];
  return undefined;
}

function evaluateFamily(
  trades: readonly trade_v1[],
  family: family_v1,
  makerFeeBps: number,
  adverseBufferBps: number,
): Readonly<Record<string, number | string | null>> {
  const regimes = classifyRegimes(trades, {
    horizonMs: 300_000,
    thresholdBps: 1,
    hysteresisBps: 0.5,
    minimumDwellMs: 60_000,
  });
  const active = new Map<
    side_v1,
    { price: number; quantity: number; distance: number; placedAt: number }
  >();
  const grossEdges: number[] = [];
  const adverseValues: number[] = [];
  let places = 0;
  let cancels = 0;
  let fills = 0;
  let inventoryBase = 0;
  let breaches = 0;
  let previousRegime = regimes[0];
  for (let index = 0; index < trades.length; index += 1) {
    const trade = trades[index]!;
    const regime = regimes[index]!;
    if (family === 'CURRENT' && previousRegime !== undefined && regime !== previousRegime) {
      cancels += active.size;
      active.clear();
    }
    previousRegime = regime;
    for (const side of ['BUY', 'SELL'] as const) {
      const quote = active.get(side);
      if (quote === undefined) continue;
      const crossed = side === 'BUY' ? trade.price <= quote.price : trade.price >= quote.price;
      if (crossed) {
        active.delete(side);
        fills += 1;
        const after = findAfter(trades, index, trade.timestamp + 30_000);
        if (after !== undefined) {
          const adverse =
            side === 'BUY'
              ? Math.max(0, ((quote.price - after.price) / quote.price) * 10_000)
              : Math.max(0, ((after.price - quote.price) / quote.price) * 10_000);
          adverseValues.push(adverse);
          grossEdges.push(quote.distance - makerFeeBps - adverse - 1);
        }
        inventoryBase += side === 'BUY' ? quote.quantity : -quote.quantity;
        if (Math.abs(inventoryBase * trade.price) > MAX_INVENTORY_USD + 1e-9) breaches += 1;
        continue;
      }
      const age = trade.timestamp - quote.placedAt;
      const liveEdgeBps =
        side === 'BUY'
          ? ((trade.price - quote.price) / quote.price) * 10_000
          : ((quote.price - trade.price) / quote.price) * 10_000;
      const shouldCancel =
        (family === 'CURRENT' && age >= 120_000) ||
        (family === 'LONG_LIVED_SPARSE' && age >= 600_000) ||
        (family === 'EDGE_INVALIDATION_ONLY' && liveEdgeBps <= makerFeeBps + adverseBufferBps + 1);
      if (shouldCancel) {
        active.delete(side);
        cancels += 1;
      }
    }
    for (const side of ['BUY', 'SELL'] as const) {
      if (active.has(side)) continue;
      const distance = DISTANCES[regime][side];
      if (distance === undefined) continue;
      const price = trade.price * (1 + ((side === 'BUY' ? -1 : 1) * distance) / 10_000);
      const quantity = NOTIONAL_USD / price;
      if (
        Math.abs((inventoryBase + (side === 'BUY' ? quantity : -quantity)) * trade.price) >
        MAX_INVENTORY_USD
      )
        continue;
      active.set(side, { price, quantity, distance, placedAt: trade.timestamp });
      places += 1;
    }
  }
  cancels += active.size;
  const mutationsPerFill = fills === 0 ? null : (places + cancels) / fills;
  const lifecycleGasBps =
    mutationsPerFill === null
      ? null
      : mutationsPerFill * ((GAS_APT_PER_TX * APT_USD) / NOTIONAL_USD) * 10_000;
  const gross = grossEdges.length === 0 ? null : getDecibelPercentileV1(grossEdges, 0.5);
  return Object.freeze({
    family,
    places,
    cancels,
    fills,
    mutationsPerFill,
    lifecycleGasBps,
    p95AdverseBps: adverseValues.length === 0 ? null : getDecibelPercentileV1(adverseValues, 0.95),
    netEdgeBps: gross === null || lifecycleGasBps === null ? null : gross - lifecycleGasBps,
    inventoryLimitBreaches: breaches,
  });
}

export async function runDecibelPassiveLifecycleFrontierV1(
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const economics = JSON.parse(
    readFileSync(
      resolve(
        environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH ??
          'data/decibel_production_economic_inputs_v1.json',
      ),
      'utf8',
    ),
  ) as { makerFeeBps: number; adverseSelectionBufferBps: number };
  const trades = await loadTrades(environment);
  const families = (
    ['CURRENT', 'STICKY', 'EDGE_INVALIDATION_ONLY', 'LONG_LIVED_SPARSE'] as const
  ).map((family) =>
    evaluateFamily(trades, family, economics.makerFeeBps, economics.adverseSelectionBufferBps),
  );
  const positive = families.filter(
    (family) => Number(family.netEdgeBps) > 0 && Number(family.inventoryLimitBreaches) === 0,
  );
  const report = Object.freeze({
    families,
    best:
      positive.sort((left, right) => Number(right.netEdgeBps) - Number(left.netEdgeBps))[0] ?? null,
  });
  const output = resolve(`data/decibel_passive_lifecycle_frontier_v1_${Date.now()}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`DECIBEL_LIFECYCLE_FRONTIER=${output}`);
  console.log(JSON.stringify(report));
}

runDecibelPassiveLifecycleFrontierV1(process.env).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
