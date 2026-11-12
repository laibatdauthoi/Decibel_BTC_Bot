import dotenv from 'dotenv';

dotenv.config();

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { getDecibelPercentileV1 } from './decibel_market_making_economics_v1.js';
import { classifyRegimes } from './run_decibel_market_state_policy_search_v1.js';
import {
  loadTrades,
  type regime_v1,
  type trade_v1,
} from './run_decibel_sparse_passive_shadow_study_v1.js';

const POLICY_FREEZE_TIMESTAMP_MS = 1_788_880_339_042;
const ORDER_NOTIONAL_USD = 10;
const MAX_INVENTORY_NOTIONAL_USD = 50;
const RESTING_HORIZON_MS = 120_000;
const MINIMUM_TOTAL_TRADE_THROUGHS = 30;
const MINIMUM_CELL_TRADE_THROUGHS = 5;

type side_v1 = 'BUY' | 'SELL';
type cell_v1 = 'RISING_BUY' | 'RISING_SELL' | 'FALLING_SELL' | 'NEUTRAL_BUY' | 'NEUTRAL_SELL';
type active_quote_v1 = Readonly<{
  cell: cell_v1;
  regime: regime_v1;
  side: side_v1;
  price: number;
  quantity: number;
  distanceBps: number;
  expiresAt: number;
}>;

const FROZEN_POLICY: Readonly<Record<regime_v1, Readonly<Partial<Record<side_v1, number>>>>> =
  Object.freeze({
    RISING: Object.freeze({ BUY: 4, SELL: 12 }),
    FALLING: Object.freeze({ SELL: 10 }),
    NEUTRAL: Object.freeze({ BUY: 9, SELL: 7 }),
  });

function findAfter(
  trades: readonly trade_v1[],
  index: number,
  timestamp: number,
): trade_v1 | undefined {
  for (let cursor = index + 1; cursor < trades.length; cursor += 1)
    if (trades[cursor]!.timestamp >= timestamp) return trades[cursor];
  return undefined;
}

export function simulateDecibelDirectionalPassiveForwardShadowV1(
  trades: readonly trade_v1[],
  makerFeeBps: number,
  gasCostUsd: number,
  safetyMarginBps: number,
): Readonly<Record<string, unknown>> {
  const firstForwardIndex = trades.findIndex(
    (trade) => trade.timestamp > POLICY_FREEZE_TIMESTAMP_MS,
  );
  const forward = firstForwardIndex < 0 ? [] : trades.slice(firstForwardIndex);
  const regimes = classifyRegimes(trades, {
    horizonMs: 300_000,
    thresholdBps: 1,
    hysteresisBps: 0.5,
    minimumDwellMs: 60_000,
  });
  const active = new Map<side_v1, active_quote_v1>();
  const quoteCounts = new Map<cell_v1, number>();
  const opportunityCounts = new Map<cell_v1, number>();
  const edges = new Map<cell_v1, number[]>();
  const adverse = new Map<cell_v1, number[]>();
  const pnlProxy = new Map<cell_v1, number>();
  const inventoryPath: Array<Readonly<{ timestamp: number; base: number; notional: number }>> = [];
  let totalQuotes = 0;
  let regimeTransitions = 0;
  let regimeChangeCancellations = 0;
  let allCancellations = 0;
  let inventoryBase = 0;
  let maxLongNotional = 0;
  let maxShortNotional = 0;
  let inventoryLimitBreaches = 0;
  let longExposureMs = 0;
  let shortExposureMs = 0;
  let lastRegime = firstForwardIndex < 0 ? undefined : regimes[firstForwardIndex];

  if (firstForwardIndex >= 0) {
    for (let index = firstForwardIndex; index < trades.length; index += 1) {
      const trade = trades[index]!;
      const regime = regimes[index]!;
      const next = trades[index + 1];
      if (next !== undefined) {
        if (inventoryBase > 0) longExposureMs += next.timestamp - trade.timestamp;
        else if (inventoryBase < 0) shortExposureMs += next.timestamp - trade.timestamp;
      }
      if (lastRegime !== undefined && regime !== lastRegime) {
        regimeTransitions += 1;
        for (const side of ['BUY', 'SELL'] as const) {
          if (!active.has(side)) continue;
          active.delete(side);
          regimeChangeCancellations += 1;
          allCancellations += 1;
        }
      }
      lastRegime = regime;

      for (const side of ['BUY', 'SELL'] as const) {
        const quote = active.get(side);
        if (quote === undefined) continue;
        const crossed = side === 'BUY' ? trade.price <= quote.price : trade.price >= quote.price;
        if (!crossed && trade.timestamp < quote.expiresAt) continue;
        active.delete(side);
        if (!crossed) {
          allCancellations += 1;
          continue;
        }
        opportunityCounts.set(quote.cell, (opportunityCounts.get(quote.cell) ?? 0) + 1);
        const after = findAfter(trades, index, trade.timestamp + 30_000);
        if (after !== undefined) {
          const markout =
            side === 'BUY'
              ? Math.max(0, ((quote.price - after.price) / quote.price) * 10_000)
              : Math.max(0, ((after.price - quote.price) / quote.price) * 10_000);
          const gasBps = (gasCostUsd / (quote.price * quote.quantity)) * 10_000;
          const netEdge = quote.distanceBps - makerFeeBps - gasBps - markout - safetyMarginBps;
          adverse.set(quote.cell, [...(adverse.get(quote.cell) ?? []), markout]);
          edges.set(quote.cell, [...(edges.get(quote.cell) ?? []), netEdge]);
          pnlProxy.set(
            quote.cell,
            (pnlProxy.get(quote.cell) ?? 0) + (ORDER_NOTIONAL_USD * netEdge) / 10_000,
          );
        }
        inventoryBase += side === 'BUY' ? quote.quantity : -quote.quantity;
        const notional = inventoryBase * trade.price;
        maxLongNotional = Math.max(maxLongNotional, notional);
        maxShortNotional = Math.max(maxShortNotional, -notional);
        if (Math.abs(notional) > MAX_INVENTORY_NOTIONAL_USD + 1e-9) inventoryLimitBreaches += 1;
        inventoryPath.push(
          Object.freeze({ timestamp: trade.timestamp, base: inventoryBase, notional }),
        );
      }

      for (const side of ['BUY', 'SELL'] as const) {
        if (active.has(side)) continue;
        const distanceBps = FROZEN_POLICY[regime][side];
        if (distanceBps === undefined) continue;
        const price = trade.price * (1 + ((side === 'BUY' ? -1 : 1) * distanceBps) / 10_000);
        const quantity = ORDER_NOTIONAL_USD / price;
        const projectedNotional =
          (inventoryBase + (side === 'BUY' ? quantity : -quantity)) * trade.price;
        if (Math.abs(projectedNotional) > MAX_INVENTORY_NOTIONAL_USD) continue;
        const cell = `${regime}_${side}` as cell_v1;
        active.set(side, {
          cell,
          regime,
          side,
          price,
          quantity,
          distanceBps,
          expiresAt: trade.timestamp + RESTING_HORIZON_MS,
        });
        quoteCounts.set(cell, (quoteCounts.get(cell) ?? 0) + 1);
        totalQuotes += 1;
      }
    }
  }

  const cells = [
    'RISING_BUY',
    'RISING_SELL',
    'FALLING_SELL',
    'NEUTRAL_BUY',
    'NEUTRAL_SELL',
  ] as const;
  const cellDiagnostics = Object.fromEntries(
    cells.map((cell) => {
      const cellEdges = edges.get(cell) ?? [];
      const cellAdverse = adverse.get(cell) ?? [];
      const quotes = quoteCounts.get(cell) ?? 0;
      const opportunities = opportunityCounts.get(cell) ?? 0;
      return [
        cell,
        {
          quotes,
          opportunities,
          opportunityRate: quotes === 0 ? 0 : opportunities / quotes,
          conditionalP95AdverseMarkoutBps:
            cellAdverse.length === 0 ? null : getDecibelPercentileV1(cellAdverse, 0.95),
          medianNetEdgeBps: cellEdges.length === 0 ? null : getDecibelPercentileV1(cellEdges, 0.5),
          pnlProxyUsd: pnlProxy.get(cell) ?? 0,
        },
      ];
    }),
  );
  const allEdges = [...edges.values()].flat();
  const totalOpportunities = [...opportunityCounts.values()].reduce((sum, value) => sum + value, 0);
  const cellEdgeMedians = cells
    .map((cell) => edges.get(cell) ?? [])
    .filter((values) => values.length > 0)
    .map((values) => getDecibelPercentileV1(values, 0.5));
  const sampleSufficient =
    totalOpportunities >= MINIMUM_TOTAL_TRADE_THROUGHS &&
    cells.every((cell) => (opportunityCounts.get(cell) ?? 0) >= MINIMUM_CELL_TRADE_THROUGHS);
  const viable =
    sampleSufficient &&
    allEdges.length > 0 &&
    getDecibelPercentileV1(allEdges, 0.5) > 0 &&
    cellEdgeMedians.every((value) => value > 0) &&
    inventoryLimitBreaches === 0;
  const overfitEvidence =
    sampleSufficient &&
    (cellEdgeMedians.some((value) => value <= 0) || getDecibelPercentileV1(allEdges, 0.5) <= 0);
  const durationMin =
    forward.length < 2
      ? 0
      : (forward[forward.length - 1]!.timestamp - forward[0]!.timestamp) / 60_000;

  return Object.freeze({
    methodology: 'FROZEN_DIRECTIONAL_PASSIVE_FORWARD_SHADOW_V1',
    policyFreezeTimestamp: POLICY_FREEZE_TIMESTAMP_MS,
    forwardStartTimestamp: forward[0]?.timestamp ?? null,
    forwardEndTimestamp: forward[forward.length - 1]?.timestamp ?? null,
    forwardDurationMin: durationMin,
    forwardEvaluations: forward.length,
    totalQuotes,
    tradeThroughOpportunities: totalOpportunities,
    risingBidOpportunities: opportunityCounts.get('RISING_BUY') ?? 0,
    risingAskOpportunities: opportunityCounts.get('RISING_SELL') ?? 0,
    fallingAskOpportunities: opportunityCounts.get('FALLING_SELL') ?? 0,
    neutralBidOpportunities: opportunityCounts.get('NEUTRAL_BUY') ?? 0,
    neutralAskOpportunities: opportunityCounts.get('NEUTRAL_SELL') ?? 0,
    netEdgeBps: allEdges.length === 0 ? null : getDecibelPercentileV1(allEdges, 0.5),
    worstSideRegimeNetEdgeBps: cellEdgeMedians.length === 0 ? null : Math.min(...cellEdgeMedians),
    maxLongNotional,
    maxShortNotional,
    inventoryLimitBreaches,
    longExposureDurationMs: longExposureMs,
    shortExposureDurationMs: shortExposureMs,
    regimeTransitions,
    regimeChangeCancellations,
    allCancellations,
    regimeChangeCancelRate: totalQuotes === 0 ? 0 : regimeChangeCancellations / totalQuotes,
    cellDiagnostics,
    inventoryPath,
    policyOverfitEvidence: overfitEvidence,
    directionalPassiveStrategyViable: viable,
    sampleSufficientForPromotion: sampleSufficient,
    blocker:
      forward.length === 0
        ? 'FORWARD_DATA_UNAVAILABLE'
        : !sampleSufficient
          ? 'FORWARD_EVIDENCE_INSUFFICIENT_FOR_PROMOTION'
          : viable
            ? 'NONE'
            : 'FORWARD_POLICY_NOT_VIABLE',
    placeInvocations: 0,
    cancelInvocations: 0,
    signedTransactions: 0,
  });
}

export async function runDecibelDirectionalPassiveForwardShadowV1(
  environment: NodeJS.ProcessEnv,
): Promise<Readonly<Record<string, unknown>>> {
  const economics = JSON.parse(
    readFileSync(
      resolve(
        environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH ??
          'data/decibel_production_economic_inputs_v1.json',
      ),
      'utf8',
    ),
  ) as { makerFeeBps: number; conservativeGasCostUsd: number };
  const report = simulateDecibelDirectionalPassiveForwardShadowV1(
    await loadTrades(environment),
    economics.makerFeeBps,
    economics.conservativeGasCostUsd,
    Number(environment.DECIBEL_PRODUCTION_EDGE_SAFETY_MARGIN_BPS ?? 1),
  );
  const outputPath = resolve(
    environment.DECIBEL_DIRECTIONAL_FORWARD_REPORT_PATH ??
      `data/decibel_directional_passive_forward_shadow_v1_${Date.now()}.json`,
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`DECIBEL_DIRECTIONAL_FORWARD_REPORT=${outputPath}`);
  console.log(JSON.stringify(report));
  return report;
}

const invokedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url)
  runDecibelDirectionalPassiveForwardShadowV1(process.env).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
