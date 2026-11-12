import dotenv from 'dotenv';

dotenv.config();

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { getDecibelPercentileV1 } from './decibel_market_making_economics_v1.js';
import {
  loadTrades,
  type regime_v1,
  type trade_v1,
} from './run_decibel_sparse_passive_shadow_study_v1.js';

type side_v1 = 'BUY' | 'SELL';
export type regime_config_v1 = Readonly<{
  horizonMs: number;
  thresholdBps: number;
  hysteresisBps: number;
  minimumDwellMs: number;
}>;
type quote_rule_v1 = Readonly<{ distanceBps: number; restingMs: number }>;
type policy_v1 = Readonly<Record<regime_v1, Readonly<Partial<Record<side_v1, quote_rule_v1>>>>>;

const MAX_INVENTORY_NOTIONAL_USD = 50;
const ORDER_NOTIONAL_USD = 10;
const MIN_OPPORTUNITY_RATE = 0.005;

export function classifyRegimes(
  trades: readonly trade_v1[],
  config: regime_config_v1,
): readonly regime_v1[] {
  const result: regime_v1[] = [];
  let current: regime_v1 = 'NEUTRAL';
  let changedAt = trades[0]?.timestamp ?? 0;
  let anchorIndex = 0;
  for (let index = 0; index < trades.length; index += 1) {
    const trade = trades[index]!;
    while (
      anchorIndex + 1 < index &&
      trades[anchorIndex + 1]!.timestamp <= trade.timestamp - config.horizonMs
    )
      anchorIndex += 1;
    const anchor = trades[anchorIndex]!;
    const returnBps = ((trade.price - anchor.price) / anchor.price) * 10_000;
    const enter = config.thresholdBps + config.hysteresisBps;
    const exit = Math.max(0, config.thresholdBps - config.hysteresisBps);
    let desired: regime_v1 = current;
    if (current === 'NEUTRAL') {
      if (returnBps > enter) desired = 'RISING';
      else if (returnBps < -enter) desired = 'FALLING';
    } else if (current === 'RISING') {
      if (returnBps < -enter) desired = 'FALLING';
      else if (returnBps < exit) desired = 'NEUTRAL';
    } else {
      if (returnBps > enter) desired = 'RISING';
      else if (returnBps > -exit) desired = 'NEUTRAL';
    }
    if (desired !== current && trade.timestamp - changedAt >= config.minimumDwellMs) {
      current = desired;
      changedAt = trade.timestamp;
    }
    result.push(current);
  }
  return Object.freeze(result);
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

function assessRule(
  trades: readonly trade_v1[],
  regimes: readonly regime_v1[],
  start: number,
  end: number,
  regime: regime_v1,
  side: side_v1,
  rule: quote_rule_v1,
  fixedCostsBps: number,
): Readonly<{
  opportunities: number;
  evaluations: number;
  opportunityRate: number;
  netEdgeBps: number | null;
}> {
  const edges: number[] = [];
  let evaluations = 0;
  for (let index = start; index < end; index += 1) {
    if (regimes[index] !== regime) continue;
    evaluations += 1;
    const entry = trades[index]!;
    const quote = entry.price * (1 + ((side === 'BUY' ? -1 : 1) * rule.distanceBps) / 10_000);
    let fillIndex = -1;
    for (let cursor = index + 1; cursor < end; cursor += 1) {
      if (trades[cursor]!.timestamp > entry.timestamp + rule.restingMs) break;
      if (side === 'BUY' ? trades[cursor]!.price <= quote : trades[cursor]!.price >= quote) {
        fillIndex = cursor;
        break;
      }
    }
    if (fillIndex < 0) continue;
    const after = findAfter(trades, fillIndex, trades[fillIndex]!.timestamp + 30_000);
    if (after === undefined || after.timestamp >= trades[end - 1]!.timestamp) continue;
    const adverse =
      side === 'BUY'
        ? Math.max(0, ((quote - after.price) / quote) * 10_000)
        : Math.max(0, ((after.price - quote) / quote) * 10_000);
    edges.push(rule.distanceBps - fixedCostsBps - adverse);
  }
  return Object.freeze({
    opportunities: edges.length,
    evaluations,
    opportunityRate: evaluations === 0 ? 0 : edges.length / evaluations,
    netEdgeBps: edges.length === 0 ? null : getDecibelPercentileV1(edges, 0.5),
  });
}

function selectPolicy(
  trades: readonly trade_v1[],
  regimes: readonly regime_v1[],
  trainEnd: number,
  validationEnd: number,
  fixedCostsBps: number,
): policy_v1 | null {
  const policy = { RISING: {}, FALLING: {}, NEUTRAL: {} } as Record<
    regime_v1,
    Partial<Record<side_v1, quote_rule_v1>>
  >;
  let buyCells = 0;
  let sellCells = 0;
  for (const regime of ['RISING', 'FALLING', 'NEUTRAL'] as const) {
    for (const side of ['BUY', 'SELL'] as const) {
      let best: { rule: quote_rule_v1; score: number } | undefined;
      for (const distanceBps of [3, 4, 5, 6, 7, 8, 9, 10, 12]) {
        for (const restingMs of [30_000, 60_000, 120_000]) {
          const rule = Object.freeze({ distanceBps, restingMs });
          const train = assessRule(trades, regimes, 0, trainEnd, regime, side, rule, fixedCostsBps);
          const validation = assessRule(
            trades,
            regimes,
            trainEnd,
            validationEnd,
            regime,
            side,
            rule,
            fixedCostsBps,
          );
          if (
            train.opportunities < 5 ||
            validation.opportunities < 3 ||
            train.opportunityRate < MIN_OPPORTUNITY_RATE ||
            validation.opportunityRate < MIN_OPPORTUNITY_RATE ||
            (train.netEdgeBps ?? -Infinity) <= 0 ||
            (validation.netEdgeBps ?? -Infinity) <= 0
          )
            continue;
          const score = validation.netEdgeBps! * Math.sqrt(validation.opportunities);
          if (best === undefined || score > best.score) best = { rule, score };
        }
      }
      if (best !== undefined) {
        policy[regime][side] = best.rule;
        if (side === 'BUY') buyCells += 1;
        else sellCells += 1;
      }
    }
  }
  return buyCells > 0 && sellCells > 0 ? Object.freeze(policy) : null;
}

function evaluateHoldout(
  trades: readonly trade_v1[],
  regimes: readonly regime_v1[],
  start: number,
  policy: policy_v1,
  fixedCostsBps: number,
): Readonly<Record<string, unknown>> {
  const active = new Map<
    side_v1,
    { price: number; quantity: number; expiresAt: number; rule: quote_rule_v1 }
  >();
  const edges: number[] = [];
  let inventoryBase = 0;
  let maxLong = 0;
  let maxShort = 0;
  let breaches = 0;
  let quotes = 0;
  let opportunities = 0;
  let transitions = 0;
  let quickTransitions = 0;
  let lastRegime = regimes[start];
  let lastTransitionAt: number | undefined;
  for (let index = start; index < trades.length; index += 1) {
    const trade = trades[index]!;
    const regime = regimes[index]!;
    if (regime !== lastRegime) {
      transitions += 1;
      if (lastTransitionAt !== undefined && trade.timestamp - lastTransitionAt <= 60_000)
        quickTransitions += 1;
      lastTransitionAt = trade.timestamp;
      lastRegime = regime;
      active.clear();
    }
    for (const side of ['BUY', 'SELL'] as const) {
      const quote = active.get(side);
      if (quote === undefined) continue;
      const crossed = side === 'BUY' ? trade.price <= quote.price : trade.price >= quote.price;
      if (!crossed && trade.timestamp < quote.expiresAt) continue;
      active.delete(side);
      if (!crossed) continue;
      opportunities += 1;
      const after = findAfter(trades, index, trade.timestamp + 30_000);
      if (after !== undefined) {
        const adverse =
          side === 'BUY'
            ? Math.max(0, ((quote.price - after.price) / quote.price) * 10_000)
            : Math.max(0, ((after.price - quote.price) / quote.price) * 10_000);
        edges.push(quote.rule.distanceBps - fixedCostsBps - adverse);
      }
      inventoryBase += side === 'BUY' ? quote.quantity : -quote.quantity;
      const notional = inventoryBase * trade.price;
      maxLong = Math.max(maxLong, notional);
      maxShort = Math.max(maxShort, -notional);
      if (Math.abs(notional) > MAX_INVENTORY_NOTIONAL_USD + 1e-9) breaches += 1;
    }
    for (const side of ['BUY', 'SELL'] as const) {
      if (active.has(side)) continue;
      const rule = policy[regime][side];
      if (rule === undefined) continue;
      const price = trade.price * (1 + ((side === 'BUY' ? -1 : 1) * rule.distanceBps) / 10_000);
      const quantity = ORDER_NOTIONAL_USD / price;
      const projected = (inventoryBase + (side === 'BUY' ? quantity : -quantity)) * trade.price;
      if (Math.abs(projected) > MAX_INVENTORY_NOTIONAL_USD) continue;
      active.set(side, { price, quantity, expiresAt: trade.timestamp + rule.restingMs, rule });
      quotes += 1;
    }
  }
  return Object.freeze({
    transitions,
    quickTransitions,
    churnRate: transitions === 0 ? 0 : quickTransitions / transitions,
    quotes,
    opportunities,
    opportunityRate: quotes === 0 ? 0 : opportunities / quotes,
    netEdgeBps: edges.length === 0 ? null : getDecibelPercentileV1(edges, 0.5),
    maxLong,
    maxShort,
    breaches,
  });
}

export async function runDecibelMarketStatePolicySearchV1(
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
  ) as {
    makerFeeBps: number;
    conservativeGasCostUsd: number;
    adverseSelectionBufferBps: number;
  };
  const trades = await loadTrades(environment);
  const trainEnd = Math.floor(trades.length * 0.5);
  const validationEnd = Math.floor(trades.length * 0.75);
  const gasBps = (economics.conservativeGasCostUsd / ORDER_NOTIONAL_USD) * 10_000;
  const fixedCostsBps =
    economics.makerFeeBps +
    gasBps +
    Number(environment.DECIBEL_PRODUCTION_EDGE_SAFETY_MARGIN_BPS ?? 1);
  let best:
    | { config: regime_config_v1; policy: policy_v1; score: number; regimes: readonly regime_v1[] }
    | undefined;
  for (const horizonMs of [60_000, 180_000, 300_000, 600_000])
    for (const thresholdBps of [1, 2, 3, 5])
      for (const hysteresisBps of [0, 0.5, 1, 2])
        for (const minimumDwellMs of [0, 30_000, 60_000, 120_000]) {
          const config = Object.freeze({ horizonMs, thresholdBps, hysteresisBps, minimumDwellMs });
          const regimes = classifyRegimes(trades, config);
          const policy = selectPolicy(trades, regimes, trainEnd, validationEnd, fixedCostsBps);
          if (policy === null) continue;
          const validation = evaluateHoldout(
            trades.slice(0, validationEnd),
            regimes.slice(0, validationEnd),
            trainEnd,
            policy,
            fixedCostsBps,
          );
          const score =
            Number(validation.netEdgeBps ?? -Infinity) *
              Math.sqrt(Number(validation.opportunities)) -
            Number(validation.churnRate) * 2;
          if (
            Number(validation.opportunityRate) < MIN_OPPORTUNITY_RATE ||
            Number(validation.netEdgeBps ?? -Infinity) <= 0
          )
            continue;
          if (best === undefined || score > best.score) best = { config, policy, score, regimes };
        }
  const holdoutDurationMin =
    trades.length === 0 || validationEnd >= trades.length
      ? 0
      : (trades[trades.length - 1]!.timestamp - trades[validationEnd]!.timestamp) / 60_000;
  const holdout =
    best === undefined
      ? {
          transitions: 0,
          churnRate: 0,
          quotes: 0,
          opportunities: 0,
          opportunityRate: 0,
          netEdgeBps: null,
          breaches: 0,
        }
      : evaluateHoldout(trades, best.regimes, validationEnd, best.policy, fixedCostsBps);
  const viable =
    best !== undefined &&
    Number(holdout.netEdgeBps ?? -Infinity) > 0 &&
    Number(holdout.opportunityRate) >= MIN_OPPORTUNITY_RATE &&
    Number(holdout.opportunities) >= 10 &&
    Number(holdout.breaches) === 0;
  const report = Object.freeze({
    methodology: 'CHRONOLOGICAL_TRAIN_50_VALIDATION_25_HOLDOUT_25',
    trainCount: trainEnd,
    validationCount: validationEnd - trainEnd,
    holdoutCount: trades.length - validationEnd,
    bestPolicy: best?.policy ?? null,
    regimeHorizon: best?.config.horizonMs ?? null,
    regimeThresholdBps: best?.config.thresholdBps ?? null,
    hysteresisBps: best?.config.hysteresisBps ?? null,
    minimumDwellSec: best === undefined ? null : best.config.minimumDwellMs / 1_000,
    holdoutDurationMin,
    holdoutRegimeTransitions: holdout.transitions,
    holdoutChurnRate: holdout.churnRate,
    holdoutQuotes: holdout.quotes,
    holdoutTradeThroughOpportunities: holdout.opportunities,
    holdoutOpportunityRate: holdout.opportunityRate,
    holdoutNetEdgeBps: holdout.netEdgeBps,
    inventoryLimitBreaches: holdout.breaches,
    strategyViableOutOfSample: viable,
    blocker:
      best === undefined
        ? 'NO_POLICY_PASSED_TRAIN_AND_VALIDATION'
        : viable
          ? 'NONE'
          : 'HOLDOUT_POLICY_NOT_VIABLE',
    placeInvocations: 0,
    cancelInvocations: 0,
    signedTransactions: 0,
  });
  const outputPath = resolve(
    environment.DECIBEL_POLICY_SEARCH_REPORT_PATH ??
      `data/decibel_market_state_policy_search_v1_${Date.now()}.json`,
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`DECIBEL_POLICY_SEARCH_REPORT=${outputPath}`);
  console.log(JSON.stringify(report));
  return report;
}

const invokedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url)
  runDecibelMarketStatePolicySearchV1(process.env).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
