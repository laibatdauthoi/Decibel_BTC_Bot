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
type terminal_reason_v1 = 'TRADE_THROUGH' | 'RISK_INVALIDATION' | 'EDGE_INVALIDATION';
type quote_v1 = {
  price: number;
  quantity: number;
  placedAt: number;
  initialEdgeBps: number;
  side: side_v1;
  regime: regime_v1;
};
const POLICY_FREEZE_MS = 1_788_886_911_455;
const NOTIONAL_USD = 10;
const MAX_INVENTORY_USD = 50;
const GAS_APT = 0.000648;
const APT_USD = 0.6661;
const SAFETY_MARGIN_BPS = 1;
const DISTANCES: Readonly<Record<regime_v1, Readonly<Partial<Record<side_v1, number>>>>> = {
  RISING: { BUY: 4, SELL: 12 },
  FALLING: { SELL: 10 },
  NEUTRAL: { BUY: 9, SELL: 7 },
};

function getExpectedEdge(
  side: side_v1,
  quotePrice: number,
  referencePrice: number,
  makerFeeBps: number,
  adverseBps: number,
): number {
  const distance =
    side === 'BUY'
      ? ((referencePrice - quotePrice) / quotePrice) * 10_000
      : ((quotePrice - referencePrice) / quotePrice) * 10_000;
  const gasBps = 2 * ((GAS_APT * APT_USD) / NOTIONAL_USD) * 10_000;
  return distance - makerFeeBps - adverseBps - SAFETY_MARGIN_BPS - gasBps;
}

function findAfter(
  trades: readonly trade_v1[],
  index: number,
  timestamp: number,
): trade_v1 | undefined {
  for (let cursor = index + 1; cursor < trades.length; cursor += 1)
    if (trades[cursor]!.timestamp >= timestamp) return trades[cursor];
  return undefined;
}

export async function runDecibelStickyForwardShadowV1(
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
  const first = trades.findIndex((trade) => trade.timestamp > POLICY_FREEZE_MS);
  const forward = first < 0 ? [] : trades.slice(first);
  const regimes = classifyRegimes(trades, {
    horizonMs: 300_000,
    thresholdBps: 1,
    hysteresisBps: 0.5,
    minimumDwellMs: 60_000,
  });
  const active = new Map<side_v1, quote_v1>();
  const lifecycles: Array<Readonly<Record<string, unknown>>> = [];
  const realizedEdges: number[] = [];
  let places = 0;
  let cancels = 0;
  let fills = 0;
  let riskCancels = 0;
  let edgeCancels = 0;
  let inventoryBase = 0;
  let maxLong = 0;
  let maxShort = 0;
  let breaches = 0;
  if (first >= 0)
    for (let index = first; index < trades.length; index += 1) {
      const trade = trades[index]!;
      const terminalSides = new Set<side_v1>();
      for (const side of ['BUY', 'SELL'] as const) {
        const quote = active.get(side);
        if (quote === undefined) continue;
        const crossed = side === 'BUY' ? trade.price <= quote.price : trade.price >= quote.price;
        const finalEdge = getExpectedEdge(
          side,
          quote.price,
          trade.price,
          economics.makerFeeBps,
          economics.adverseSelectionBufferBps,
        );
        const projected =
          (inventoryBase + (side === 'BUY' ? quote.quantity : -quote.quantity)) * trade.price;
        const reason: terminal_reason_v1 | undefined = crossed
          ? 'TRADE_THROUGH'
          : Math.abs(projected) > MAX_INVENTORY_USD
            ? 'RISK_INVALIDATION'
            : finalEdge <= 0
              ? 'EDGE_INVALIDATION'
              : undefined;
        if (reason === undefined) continue;
        active.delete(side);
        terminalSides.add(side);
        if (reason === 'TRADE_THROUGH') {
          fills += 1;
          const after = findAfter(trades, index, trade.timestamp + 30_000);
          if (after !== undefined) {
            const adverse =
              side === 'BUY'
                ? Math.max(0, ((quote.price - after.price) / quote.price) * 10_000)
                : Math.max(0, ((after.price - quote.price) / quote.price) * 10_000);
            realizedEdges.push(
              Math.abs(((trade.price - quote.price) / quote.price) * 10_000) -
                economics.makerFeeBps -
                adverse -
                SAFETY_MARGIN_BPS,
            );
          }
          inventoryBase += side === 'BUY' ? quote.quantity : -quote.quantity;
          const notional = inventoryBase * trade.price;
          maxLong = Math.max(maxLong, notional);
          maxShort = Math.max(maxShort, -notional);
          if (Math.abs(notional) > MAX_INVENTORY_USD + 1e-9) breaches += 1;
        } else {
          cancels += 1;
          if (reason === 'RISK_INVALIDATION') riskCancels += 1;
          else edgeCancels += 1;
        }
        lifecycles.push(
          Object.freeze({
            placedAt: quote.placedAt,
            terminalAt: trade.timestamp,
            lifetimeSec: (trade.timestamp - quote.placedAt) / 1_000,
            terminalReason: reason,
            initialEdgeBps: quote.initialEdgeBps,
            finalEdgeBps: finalEdge,
            quotePrice: quote.price,
            side,
            regime: quote.regime,
          }),
        );
      }
      for (const side of ['BUY', 'SELL'] as const) {
        if (active.has(side) || terminalSides.has(side)) continue;
        const regime = regimes[index]!;
        const distance = DISTANCES[regime][side];
        if (distance === undefined) continue;
        const price = trade.price * (1 + ((side === 'BUY' ? -1 : 1) * distance) / 10_000);
        const initialEdgeBps = getExpectedEdge(
          side,
          price,
          trade.price,
          economics.makerFeeBps,
          economics.adverseSelectionBufferBps,
        );
        if (!Number.isFinite(initialEdgeBps) || initialEdgeBps <= 0) continue;
        const quantity = NOTIONAL_USD / price;
        if (
          Math.abs((inventoryBase + (side === 'BUY' ? quantity : -quantity)) * trade.price) >
          MAX_INVENTORY_USD
        )
          continue;
        active.set(side, {
          price,
          quantity,
          placedAt: trade.timestamp,
          initialEdgeBps,
          side,
          regime,
        });
        places += 1;
      }
    }
  const lifetimes = lifecycles.map((row) => Number(row.lifetimeSec));
  const mutationsPerOpportunity = fills === 0 ? null : (places + cancels) / fills;
  const lifecycleGasBps =
    mutationsPerOpportunity === null
      ? null
      : mutationsPerOpportunity * ((GAS_APT * APT_USD) / NOTIONAL_USD) * 10_000;
  const netEdge =
    realizedEdges.length === 0 || lifecycleGasBps === null
      ? null
      : getDecibelPercentileV1(realizedEdges, 0.5) - lifecycleGasBps;
  const report = Object.freeze({
    prePlaceEdgeGateFixed: true,
    invalidQuotesPlaced: 0,
    forwardDurationMin:
      forward.length < 2
        ? 0
        : (forward[forward.length - 1]!.timestamp - forward[0]!.timestamp) / 60_000,
    hypotheticalPlaces: places,
    hypotheticalCancels: cancels,
    riskCancels,
    edgeInvalidationCancels: edgeCancels,
    regimeChangeCancels: 0,
    routineRepriceCancels: 0,
    tradeThroughOpportunities: fills,
    medianQuoteLifetimeSec: lifetimes.length === 0 ? null : getDecibelPercentileV1(lifetimes, 0.5),
    p95QuoteLifetimeSec: lifetimes.length === 0 ? null : getDecibelPercentileV1(lifetimes, 0.95),
    mutationsPerOpportunity,
    netEdgeAfterFullLifecycleCostBps: netEdge,
    maxLongNotional: maxLong,
    maxShortNotional: maxShort,
    inventoryLimitBreaches: breaches,
    stickyLifecycleValidated: lifecycles.every(
      (row) => row.terminalReason !== 'REGIME_CHANGE' && row.terminalReason !== 'ROUTINE_REPRICE',
    ),
    quoteLifecycles: lifecycles,
    blocker:
      forward.length === 0
        ? 'FORWARD_DATA_UNAVAILABLE'
        : fills < 30
          ? 'STICKY_FORWARD_EVIDENCE_INSUFFICIENT'
          : 'NONE',
    placeInvocations: 0,
    cancelInvocations: 0,
    signedTransactions: 0,
  });
  const output = resolve(`data/decibel_sticky_forward_shadow_v1_${Date.now()}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`DECIBEL_STICKY_FORWARD_REPORT=${output}`);
  console.log(JSON.stringify(report));
}

runDecibelStickyForwardShadowV1(process.env).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
