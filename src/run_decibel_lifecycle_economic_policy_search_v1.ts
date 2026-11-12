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

type side_v1 = 'BUY' | 'SELL';
type cell_v1 = 'RISING_BUY' | 'RISING_SELL' | 'FALLING_SELL' | 'NEUTRAL_BUY' | 'NEUTRAL_SELL';
type candidate_v1 = Readonly<{
  notionalUsd: number;
  minimumRestMs: number;
  repriceThresholdBps: number;
  hysteresisBps: number;
  minimumDwellMs: number;
}>;
type cell_result_v1 = Readonly<{
  quotes: number;
  places: number;
  cancels: number;
  fills: number;
  grossEdgesBps: readonly number[];
}>;
type simulation_v1 = Readonly<{
  cells: Readonly<Record<cell_v1, cell_result_v1>>;
  totalQuotes: number;
  places: number;
  cancels: number;
  fills: number;
  maxLongNotional: number;
  maxShortNotional: number;
  inventoryLimitBreaches: number;
}>;

const MAX_INVENTORY_NOTIONAL_USD = 50;
const MAX_QUOTE_LIFETIME_MS = 120_000;
const GAS_APT_PER_MUTATION = 0.000648;
const APT_USD = 0.6661;
const GAS_USD_PER_MUTATION = GAS_APT_PER_MUTATION * APT_USD;
const SAFETY_MARGIN_BPS = 1;
const FROZEN_DISTANCES: Readonly<Record<regime_v1, Readonly<Partial<Record<side_v1, number>>>>> =
  Object.freeze({
    RISING: Object.freeze({ BUY: 4, SELL: 12 }),
    FALLING: Object.freeze({ SELL: 10 }),
    NEUTRAL: Object.freeze({ BUY: 9, SELL: 7 }),
  });
const CELLS = ['RISING_BUY', 'RISING_SELL', 'FALLING_SELL', 'NEUTRAL_BUY', 'NEUTRAL_SELL'] as const;

function emptyCells(): Record<
  cell_v1,
  { quotes: number; places: number; cancels: number; fills: number; grossEdgesBps: number[] }
> {
  const create = () => ({
    quotes: 0,
    places: 0,
    cancels: 0,
    fills: 0,
    grossEdgesBps: [] as number[],
  });
  return {
    RISING_BUY: create(),
    RISING_SELL: create(),
    FALLING_SELL: create(),
    NEUTRAL_BUY: create(),
    NEUTRAL_SELL: create(),
  };
}

function findAfter(
  trades: readonly trade_v1[],
  index: number,
  end: number,
  timestamp: number,
): trade_v1 | undefined {
  for (let cursor = index + 1; cursor < end; cursor += 1)
    if (trades[cursor]!.timestamp >= timestamp) return trades[cursor];
  return undefined;
}

function simulate(
  trades: readonly trade_v1[],
  start: number,
  end: number,
  candidate: candidate_v1,
  makerFeeBps: number,
  enabledCells: ReadonlySet<cell_v1>,
): simulation_v1 {
  const regimes = classifyRegimes(trades, {
    horizonMs: 300_000,
    thresholdBps: 1,
    hysteresisBps: candidate.hysteresisBps,
    minimumDwellMs: candidate.minimumDwellMs,
  });
  const cells = emptyCells();
  const active = new Map<
    side_v1,
    { cell: cell_v1; price: number; quantity: number; placedAt: number }
  >();
  let inventoryBase = 0;
  let maxLongNotional = 0;
  let maxShortNotional = 0;
  let inventoryLimitBreaches = 0;
  let places = 0;
  let cancels = 0;
  let fills = 0;
  let lastRegime = regimes[start];
  for (let index = start; index < end; index += 1) {
    const trade = trades[index]!;
    const regime = regimes[index]!;
    if (lastRegime !== undefined && regime !== lastRegime) {
      for (const [side, quote] of active) {
        active.delete(side);
        cells[quote.cell].cancels += 1;
        cancels += 1;
      }
    }
    lastRegime = regime;
    for (const side of ['BUY', 'SELL'] as const) {
      const quote = active.get(side);
      if (quote === undefined) continue;
      const crossed = side === 'BUY' ? trade.price <= quote.price : trade.price >= quote.price;
      if (crossed) {
        active.delete(side);
        cells[quote.cell].fills += 1;
        fills += 1;
        const after = findAfter(trades, index, end, trade.timestamp + 30_000);
        if (after !== undefined) {
          const adverse =
            side === 'BUY'
              ? Math.max(0, ((quote.price - after.price) / quote.price) * 10_000)
              : Math.max(0, ((after.price - quote.price) / quote.price) * 10_000);
          const distance =
            FROZEN_DISTANCES[regime][side] ??
            FROZEN_DISTANCES[quote.cell.split('_')[0] as regime_v1][side]!;
          cells[quote.cell].grossEdgesBps.push(
            distance - makerFeeBps - adverse - SAFETY_MARGIN_BPS,
          );
        }
        inventoryBase += side === 'BUY' ? quote.quantity : -quote.quantity;
        const inventoryNotional = inventoryBase * trade.price;
        maxLongNotional = Math.max(maxLongNotional, inventoryNotional);
        maxShortNotional = Math.max(maxShortNotional, -inventoryNotional);
        if (Math.abs(inventoryNotional) > MAX_INVENTORY_NOTIONAL_USD + 1e-9)
          inventoryLimitBreaches += 1;
        continue;
      }
      const quoteAge = trade.timestamp - quote.placedAt;
      const distance = FROZEN_DISTANCES[regime][side];
      const target =
        distance === undefined
          ? undefined
          : trade.price * (1 + ((side === 'BUY' ? -1 : 1) * distance) / 10_000);
      const targetMoveBps =
        target === undefined ? Infinity : Math.abs((target - quote.price) / quote.price) * 10_000;
      if (
        target === undefined ||
        quoteAge >= MAX_QUOTE_LIFETIME_MS ||
        (quoteAge >= candidate.minimumRestMs && targetMoveBps >= candidate.repriceThresholdBps)
      ) {
        active.delete(side);
        cells[quote.cell].cancels += 1;
        cancels += 1;
      }
    }
    for (const side of ['BUY', 'SELL'] as const) {
      if (active.has(side)) continue;
      const distance = FROZEN_DISTANCES[regime][side];
      if (distance === undefined) continue;
      const cell = `${regime}_${side}` as cell_v1;
      if (!enabledCells.has(cell)) continue;
      const price = trade.price * (1 + ((side === 'BUY' ? -1 : 1) * distance) / 10_000);
      const quantity = candidate.notionalUsd / price;
      const projected = (inventoryBase + (side === 'BUY' ? quantity : -quantity)) * trade.price;
      if (Math.abs(projected) > MAX_INVENTORY_NOTIONAL_USD) continue;
      active.set(side, { cell, price, quantity, placedAt: trade.timestamp });
      cells[cell].quotes += 1;
      cells[cell].places += 1;
      places += 1;
    }
  }
  return Object.freeze({
    cells: Object.freeze(cells),
    totalQuotes: places,
    places,
    cancels,
    fills,
    maxLongNotional,
    maxShortNotional,
    inventoryLimitBreaches,
  });
}

function getCellNet(result: cell_result_v1, notionalUsd: number): number | null {
  if (result.fills === 0 || result.grossEdgesBps.length === 0) return null;
  const lifecycleGasBps =
    ((result.places + result.cancels) / result.fills) *
    (GAS_USD_PER_MUTATION / notionalUsd) *
    10_000;
  return getDecibelPercentileV1(result.grossEdgesBps, 0.5) - lifecycleGasBps;
}

function getEnabledCells(
  result: simulation_v1,
  notionalUsd: number,
  minimumFills: number,
): ReadonlySet<cell_v1> {
  return new Set(
    CELLS.filter(
      (cell) =>
        result.cells[cell].fills >= minimumFills &&
        (getCellNet(result.cells[cell], notionalUsd) ?? -Infinity) > 0,
    ),
  );
}

export async function runDecibelLifecycleEconomicPolicySearchV1(
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
  ) as { makerFeeBps: number };
  const trades = await loadTrades(environment);
  const trainEnd = Math.floor(trades.length * 0.5);
  const validationEnd = Math.floor(trades.length * 0.75);
  let best: { candidate: candidate_v1; enabled: ReadonlySet<cell_v1>; score: number } | undefined;
  for (const notionalUsd of [10, 14, 15, 20, 25])
    for (const minimumRestMs of [30_000, 60_000, 90_000, 120_000])
      for (const repriceThresholdBps of [2, 5, 8, 12])
        for (const hysteresisBps of [0.5, 1, 2])
          for (const minimumDwellMs of [30_000, 60_000, 120_000]) {
            const candidate = Object.freeze({
              notionalUsd,
              minimumRestMs,
              repriceThresholdBps,
              hysteresisBps,
              minimumDwellMs,
            });
            const train = simulate(
              trades,
              0,
              trainEnd,
              candidate,
              economics.makerFeeBps,
              new Set(CELLS),
            );
            const enabled = getEnabledCells(train, notionalUsd, 5);
            if (enabled.size === 0) continue;
            const validation = simulate(
              trades,
              trainEnd,
              validationEnd,
              candidate,
              economics.makerFeeBps,
              enabled,
            );
            const validated = getEnabledCells(validation, notionalUsd, 3);
            const stableEnabled = new Set([...enabled].filter((cell) => validated.has(cell)));
            if (stableEnabled.size === 0) continue;
            const stableValidation = simulate(
              trades,
              trainEnd,
              validationEnd,
              candidate,
              economics.makerFeeBps,
              stableEnabled,
            );
            const nets = [...stableEnabled].map((cell) =>
              getCellNet(stableValidation.cells[cell], notionalUsd)!,
            );
            const txPerFill =
              (stableValidation.places + stableValidation.cancels) / stableValidation.fills;
            const score = Math.min(...nets) * Math.sqrt(stableValidation.fills) - txPerFill * 0.05;
            if (best === undefined || score > best.score)
              best = { candidate, enabled: stableEnabled, score };
          }
  const holdout =
    best === undefined
      ? undefined
      : simulate(
          trades,
          validationEnd,
          trades.length,
          best.candidate,
          economics.makerFeeBps,
          best.enabled,
        );
  const txPerOpportunity =
    holdout === undefined || holdout.fills === 0
      ? null
      : (holdout.places + holdout.cancels) / holdout.fills;
  const lifecycleGasBps =
    best === undefined || txPerOpportunity === null
      ? null
      : txPerOpportunity * (GAS_USD_PER_MUTATION / best.candidate.notionalUsd) * 10_000;
  const cellNets = Object.fromEntries(
    CELLS.map((cell) => [
      cell,
      holdout === undefined || !best?.enabled.has(cell)
        ? null
        : getCellNet(holdout.cells[cell], best.candidate.notionalUsd),
    ]),
  ) as Record<cell_v1, number | null>;
  const enabledNets =
    best === undefined
      ? []
      : [...best.enabled]
          .map((cell) => cellNets[cell])
          .filter((value): value is number => value !== null);
  const netEdge = enabledNets.length === 0 ? null : getDecibelPercentileV1(enabledNets, 0.5);
  const individuallyPositive =
    best !== undefined && [...best.enabled].every((cell) => (cellNets[cell] ?? -Infinity) > 0);
  const viable =
    holdout !== undefined &&
    holdout.fills >= 10 &&
    individuallyPositive &&
    holdout.inventoryLimitBreaches === 0;
  const report = Object.freeze({
    methodology: 'LIFECYCLE_GAS_TRAIN_VALIDATION_HOLDOUT_V1',
    bestNotionalUsd: best?.candidate.notionalUsd ?? null,
    bestMinimumRestSec: best === undefined ? null : best.candidate.minimumRestMs / 1_000,
    bestRepriceThreshold: best?.candidate.repriceThresholdBps ?? null,
    bestHysteresisBps: best?.candidate.hysteresisBps ?? null,
    bestMinimumDwellSec: best === undefined ? null : best.candidate.minimumDwellMs / 1_000,
    enabledCells: best === undefined ? [] : [...best.enabled],
    holdoutQuotes: holdout?.totalQuotes ?? 0,
    holdoutPlaceEquivalents: holdout?.places ?? 0,
    holdoutCancelEquivalents: holdout?.cancels ?? 0,
    holdoutFillOpportunities: holdout?.fills ?? 0,
    txPerOpportunity,
    lifecycleGasBps,
    netEdgeAfterAllCostsBps: netEdge,
    risingBidNetBps: cellNets.RISING_BUY,
    risingAskNetBps: cellNets.RISING_SELL,
    fallingAskNetBps: cellNets.FALLING_SELL,
    neutralBidNetBps: cellNets.NEUTRAL_BUY,
    neutralAskNetBps: cellNets.NEUTRAL_SELL,
    negativeEdgeQuotesAllowed: 0,
    inventoryLimitBreaches: holdout?.inventoryLimitBreaches ?? 0,
    lifecycleEconomicPolicyViable: viable,
    blocker:
      best === undefined
        ? 'NO_LIFECYCLE_POLICY_PASSED_TRAIN_VALIDATION'
        : viable
          ? 'NONE'
          : 'HOLDOUT_LIFECYCLE_POLICY_NOT_VIABLE',
    placeInvocations: 0,
    cancelInvocations: 0,
    signedTransactions: 0,
  });
  const outputPath = resolve(
    environment.DECIBEL_LIFECYCLE_POLICY_REPORT_PATH ??
      `data/decibel_lifecycle_economic_policy_search_v1_${Date.now()}.json`,
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`DECIBEL_LIFECYCLE_POLICY_REPORT=${outputPath}`);
  console.log(JSON.stringify(report));
  return report;
}

const invokedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url)
  runDecibelLifecycleEconomicPolicySearchV1(process.env).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
