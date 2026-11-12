import dotenv from 'dotenv';

dotenv.config();

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { getDecibelPercentileV1 } from './decibel_market_making_economics_v1.js';
import {
  getRegime,
  loadTrades,
  type regime_v1,
  type trade_v1,
} from './run_decibel_sparse_passive_shadow_study_v1.js';

const TRAINING_CUTOFF_MS = 1_788_865_918_951;
const QUOTE_LIFETIME_MS = 60_000;
const QUICK_REGIME_FLIP_MS = 60_000;
const ORDER_NOTIONAL_USD = 10;
const MAX_INVENTORY_NOTIONAL_USD = 50;
const MINIMUM_DURATION_MIN = 120;
const MINIMUM_TOTAL_OPPORTUNITIES = 30;
const MINIMUM_CELL_OPPORTUNITIES = 10;

type side_v1 = 'BUY' | 'SELL';
type active_quote_v1 = Readonly<{
  side: side_v1;
  regime: regime_v1;
  distanceBps: number;
  price: number;
  quantity: number;
  placedAt: number;
  expiresAt: number;
}>;

const FROZEN_POLICY: Readonly<Record<regime_v1, Readonly<Partial<Record<side_v1, number>>>>> =
  Object.freeze({
    RISING: Object.freeze({}),
    FALLING: Object.freeze({ BUY: 6, SELL: 7 }),
    NEUTRAL: Object.freeze({ BUY: 7 }),
  });

function findTradeAtOrAfter(
  trades: readonly trade_v1[],
  startIndex: number,
  timestamp: number,
): trade_v1 | undefined {
  for (let index = startIndex; index < trades.length; index += 1) {
    if (trades[index]!.timestamp >= timestamp) return trades[index];
  }
  return undefined;
}

export function simulateDecibelRegimeEdgeOutOfSampleV1(
  trades: readonly trade_v1[],
  makerFeeBps: number,
  gasCostUsd: number,
  safetyMarginBps: number,
): Readonly<Record<string, unknown>> {
  const firstOutOfSampleIndex = trades.findIndex((trade) => trade.timestamp > TRAINING_CUTOFF_MS);
  const outOfSample = firstOutOfSampleIndex < 0 ? [] : trades.slice(firstOutOfSampleIndex);
  const durationMin =
    outOfSample.length < 2
      ? 0
      : (outOfSample[outOfSample.length - 1]!.timestamp - outOfSample[0]!.timestamp) / 60_000;
  const active = new Map<side_v1, active_quote_v1>();
  const regimeTimeMs: Record<regime_v1, number> = { RISING: 0, FALLING: 0, NEUTRAL: 0 };
  const placements: Record<string, number> = {};
  const opportunities: Record<string, number> = {};
  const netEdges: number[] = [];
  const adverseMarkouts: number[] = [];
  const inventoryPath: Array<Readonly<{ timestamp: number; base: number; notional: number }>> = [];
  let inventoryBase = 0;
  let maxLongNotional = 0;
  let maxShortNotional = 0;
  let inventoryLimitBreaches = 0;
  let regimeTransitions = 0;
  let quickRegimeFlips = 0;
  let lastRegime: regime_v1 | undefined;
  let lastTransitionAt: number | undefined;

  if (firstOutOfSampleIndex >= 0) {
    for (let index = firstOutOfSampleIndex; index < trades.length; index += 1) {
      const trade = trades[index]!;
      const regime = getRegime(trades, index);
      const next = trades[index + 1];
      if (next !== undefined) regimeTimeMs[regime] += next.timestamp - trade.timestamp;
      if (lastRegime !== undefined && regime !== lastRegime) {
        regimeTransitions += 1;
        if (
          lastTransitionAt !== undefined &&
          trade.timestamp - lastTransitionAt <= QUICK_REGIME_FLIP_MS
        )
          quickRegimeFlips += 1;
        lastTransitionAt = trade.timestamp;
      }
      lastRegime = regime;

      for (const side of ['BUY', 'SELL'] as const) {
        const quote = active.get(side);
        if (quote === undefined) continue;
        const crossed = side === 'BUY' ? trade.price <= quote.price : trade.price >= quote.price;
        if (!crossed && trade.timestamp < quote.expiresAt && quote.regime === regime) continue;
        active.delete(side);
        if (!crossed) continue;
        const cell = `${quote.regime}_${side}`;
        opportunities[cell] = (opportunities[cell] ?? 0) + 1;
        const after = findTradeAtOrAfter(trades, index + 1, trade.timestamp + 30_000);
        if (after !== undefined) {
          const adverse =
            side === 'BUY'
              ? Math.max(0, ((quote.price - after.price) / quote.price) * 10_000)
              : Math.max(0, ((after.price - quote.price) / quote.price) * 10_000);
          const gasBps = (gasCostUsd / (quote.price * quote.quantity)) * 10_000;
          adverseMarkouts.push(adverse);
          netEdges.push(quote.distanceBps - makerFeeBps - gasBps - adverse - safetyMarginBps);
        }
        inventoryBase += side === 'BUY' ? quote.quantity : -quote.quantity;
        const inventoryNotional = inventoryBase * trade.price;
        maxLongNotional = Math.max(maxLongNotional, inventoryNotional);
        maxShortNotional = Math.max(maxShortNotional, -inventoryNotional);
        if (Math.abs(inventoryNotional) > MAX_INVENTORY_NOTIONAL_USD + 1e-9)
          inventoryLimitBreaches += 1;
        inventoryPath.push(
          Object.freeze({
            timestamp: trade.timestamp,
            base: inventoryBase,
            notional: inventoryNotional,
          }),
        );
      }

      for (const side of ['BUY', 'SELL'] as const) {
        if (active.has(side)) continue;
        const distanceBps = FROZEN_POLICY[regime][side];
        if (distanceBps === undefined) continue;
        const price = trade.price * (1 + (side === 'BUY' ? -1 : 1) * (distanceBps / 10_000));
        const quantity = ORDER_NOTIONAL_USD / price;
        const projectedNotional =
          (inventoryBase + (side === 'BUY' ? quantity : -quantity)) * trade.price;
        if (Math.abs(projectedNotional) > MAX_INVENTORY_NOTIONAL_USD) continue;
        const cell = `${regime}_${side}`;
        placements[cell] = (placements[cell] ?? 0) + 1;
        active.set(
          side,
          Object.freeze({
            side,
            regime,
            distanceBps,
            price,
            quantity,
            placedAt: trade.timestamp,
            expiresAt: trade.timestamp + QUOTE_LIFETIME_MS,
          }),
        );
      }
    }
  }

  const positive = netEdges.filter((value) => value > 0).length;
  const negative = netEdges.filter((value) => value <= 0).length;
  const totalOpportunities = Object.values(opportunities).reduce((sum, value) => sum + value, 0);
  const sampleSufficient =
    durationMin >= MINIMUM_DURATION_MIN &&
    totalOpportunities >= MINIMUM_TOTAL_OPPORTUNITIES &&
    (opportunities.FALLING_BUY ?? 0) >= MINIMUM_CELL_OPPORTUNITIES &&
    (opportunities.FALLING_SELL ?? 0) >= MINIMUM_CELL_OPPORTUNITIES &&
    (opportunities.NEUTRAL_BUY ?? 0) >= MINIMUM_CELL_OPPORTUNITIES;
  const economicallyViable =
    netEdges.length > 0 &&
    getDecibelPercentileV1(netEdges, 0.5) > 0 &&
    positive > negative &&
    inventoryLimitBreaches === 0;
  const churnRatio = regimeTransitions === 0 ? 0 : quickRegimeFlips / regimeTransitions;

  return Object.freeze({
    methodology: 'FROZEN_FORWARD_TRADE_THROUGH_SHADOW_V1',
    trainingCutoffTimestamp: TRAINING_CUTOFF_MS,
    outOfSampleStartTimestamp: outOfSample[0]?.timestamp ?? null,
    outOfSampleEndTimestamp: outOfSample[outOfSample.length - 1]?.timestamp ?? null,
    outOfSampleDurationMin: durationMin,
    outOfSampleEvaluations: outOfSample.length,
    tradeThroughOpportunities: totalOpportunities,
    risingOpportunities: (opportunities.RISING_BUY ?? 0) + (opportunities.RISING_SELL ?? 0),
    fallingBidOpportunities: opportunities.FALLING_BUY ?? 0,
    fallingAskOpportunities: opportunities.FALLING_SELL ?? 0,
    neutralBidOpportunities: opportunities.NEUTRAL_BUY ?? 0,
    positiveNetEdgeOpportunities: positive,
    negativeNetEdgeOpportunities: negative,
    medianNetEdgeBps: netEdges.length === 0 ? null : getDecibelPercentileV1(netEdges, 0.5),
    p95AdverseMarkoutBps:
      adverseMarkouts.length === 0 ? null : getDecibelPercentileV1(adverseMarkouts, 0.95),
    maxLongNotional,
    maxShortNotional,
    inventoryLimitBreaches,
    regimeTransitions,
    quickRegimeFlips,
    regimeChurnFound: churnRatio >= 0.25 && quickRegimeFlips >= 3,
    hysteresisNeeded: churnRatio >= 0.25 && quickRegimeFlips >= 3,
    regimeTimeMs,
    hypotheticalPlacements: placements,
    inventoryPath,
    outOfSampleEconomicallyViable: economicallyViable,
    sampleSufficientForPromotion: sampleSufficient,
    blocker:
      outOfSample.length === 0
        ? 'OUT_OF_SAMPLE_DATA_UNAVAILABLE'
        : !sampleSufficient
          ? 'OUT_OF_SAMPLE_EVIDENCE_INSUFFICIENT_FOR_PROMOTION'
          : economicallyViable
            ? 'NONE'
            : 'OUT_OF_SAMPLE_ECONOMICS_NOT_VIABLE',
    liveExecutionEnabled: false,
    placeInvocations: 0,
    cancelInvocations: 0,
    signedTransactions: 0,
  });
}

export async function runDecibelRegimeEdgeOutOfSampleV1(
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
  ) as { makerFeeBps: number; conservativeGasCostUsd: number };
  const trades = await loadTrades(environment);
  const report = simulateDecibelRegimeEdgeOutOfSampleV1(
    trades,
    evidence.makerFeeBps,
    evidence.conservativeGasCostUsd,
    Number(environment.DECIBEL_PRODUCTION_EDGE_SAFETY_MARGIN_BPS ?? 1),
  );
  const outputPath = resolve(
    environment.DECIBEL_REGIME_OOS_REPORT_PATH ??
      `data/decibel_regime_edge_out_of_sample_v1_${Date.now()}.json`,
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`DECIBEL_REGIME_OOS_REPORT=${outputPath}`);
  console.log(JSON.stringify(report));
  return report;
}

const invokedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  runDecibelRegimeEdgeOutOfSampleV1(process.env).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
