/**
 * Strategy backtest CLI (offline, read-only). Replays recorded BBO rows through
 * decibel_strategy_backtest_v1 and prints one line per parameter variant.
 *
 *   npm run decibel:backtest -- [--file path] [--from 2026-11-05] [--to 2026-11-14]
 *     [--set adverse.safeBand.maxBps=20,25,30] [--set dca.triggerBps=25,40]
 *     [--entry 30] [--target 200] [--max-loss 1.5] [--maker-fee 1.5] [--taker-fee 4.5]
 *     [--no-filter] [--no-dca] [--no-adverse] [--json]
 *     [--trend <minutes>:<bps>] [--vol-size <reference bps>:<minimum fraction>]
 *
 * Every `--set` adds a dimension; all combinations are run.
 */
import { readFileSync } from 'node:fs';

import {
  DECIBEL_BACKTEST_DEFAULT_CONFIG_V1,
  overrideDecibelBacktestPolicyV1,
  runDecibelStrategyBacktestV1,
  type decibel_backtest_bbo_v1,
  type decibel_backtest_config_v1,
  type decibel_backtest_result_v1,
} from './decibel_strategy_backtest_v1.js';

const DEFAULT_FILE = 'data/decibel_production_raw_ws_bbo_v1.jsonl';

type parsed_arguments_v1 = {
  file: string;
  from: number | null;
  to: number | null;
  sets: Array<{ path: string; values: number[] }>;
  config: decibel_backtest_config_v1;
  json: boolean;
};

function parseBacktestArgumentsV1(argv: readonly string[]): parsed_arguments_v1 {
  let config: decibel_backtest_config_v1 = DECIBEL_BACKTEST_DEFAULT_CONFIG_V1;
  const result: parsed_arguments_v1 = {
    file: DEFAULT_FILE,
    from: null,
    to: null,
    sets: [],
    config,
    json: false,
  };
  const number = (name: string, raw: string | undefined) => {
    const value = Number(raw);
    if (raw === undefined || !Number.isFinite(value))
      throw new Error(`BACKTEST_ARGUMENT_INVALID:${name}`);
    return value;
  };
  const date = (name: string, raw: string | undefined) => {
    const value = raw === undefined ? Number.NaN : Date.parse(raw);
    if (!Number.isFinite(value)) throw new Error(`BACKTEST_ARGUMENT_INVALID:${name}`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    const next = () => argv[++index];
    switch (flag) {
      case '--file':
        result.file = next() ?? DEFAULT_FILE;
        break;
      case '--from':
        result.from = date(flag, next());
        break;
      case '--to':
        result.to = date(flag, next());
        break;
      case '--set': {
        const raw = next() ?? '';
        const [path, list] = raw.split('=');
        if (!path || !list) throw new Error(`BACKTEST_ARGUMENT_INVALID:${flag}`);
        result.sets.push({ path, values: list.split(',').map((v) => number(path, v)) });
        break;
      }
      case '--entry':
        config = { ...config, entrySizeUsd: number(flag, next()) };
        break;
      case '--target':
        config = { ...config, targetVolumeUsd: number(flag, next()) };
        break;
      case '--max-loss':
        config = { ...config, maxLossUsd: number(flag, next()) };
        break;
      case '--maker-fee':
        config = { ...config, makerFeeBps: number(flag, next()) };
        break;
      case '--taker-fee':
        config = { ...config, takerFeeBps: number(flag, next()) };
        break;
      case '--no-filter':
        config = { ...config, entryCandleFilter: false };
        break;
      case '--no-dca':
        config = { ...config, dcaEnabled: false };
        break;
      case '--trend': {
        // --trend 30:60 = no entry against a move above 60 bps in the last 30 minutes.
        const [minutes, bps] = (next() ?? '').split(':').map(Number);
        if (!(minutes! > 0) || !(bps! > 0)) throw new Error(`BACKTEST_ARGUMENT_INVALID:${flag}`);
        config = { ...config, trendFilter: { lookbackMs: minutes! * 60_000, maxMoveBps: bps! } };
        break;
      }
      case '--vol-size': {
        // --vol-size 15:0.25 = shrink the entry by 15 / range above a 15 bps range, to 25 %.
        const [reference, minimum] = (next() ?? '').split(':').map(Number);
        if (!(reference! > 0) || !(minimum! > 0) || minimum! > 1)
          throw new Error(`BACKTEST_ARGUMENT_INVALID:${flag}`);
        config = {
          ...config,
          volatilitySizing: { referenceRangeBps: reference!, minimumFraction: minimum! },
        };
        break;
      }
      case '--no-adverse':
        config = { ...config, adverseRuleEnabled: false };
        break;
      case '--json':
        result.json = true;
        break;
      default:
        throw new Error(`BACKTEST_ARGUMENT_UNKNOWN:${flag}`);
    }
  }
  result.config = config;
  return result;
}

function readBacktestRowsV1(
  file: string,
  from: number | null,
  to: number | null,
): decibel_backtest_bbo_v1[] {
  const rows: decibel_backtest_bbo_v1[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record === null || typeof record !== 'object') continue;
    const { timestamp, bestBid, bestAsk } = record as Record<string, unknown>;
    if (typeof timestamp !== 'number' || typeof bestBid !== 'number' || typeof bestAsk !== 'number')
      continue;
    if ((from !== null && timestamp < from) || (to !== null && timestamp > to)) continue;
    rows.push({ at: timestamp, bid: bestBid, ask: bestAsk });
  }
  rows.sort((a, b) => a.at - b.at);
  return rows;
}

export function summarizeDecibelBacktestV1(result: decibel_backtest_result_v1) {
  const trips = result.trips;
  const wins = trips.filter((trip) => trip.netPnlUsd > 0).length;
  const volume = result.makerVolumeUsd + result.takerVolumeUsd;
  const holdMinutes =
    trips.reduce((sum, trip) => sum + (trip.closedAt - trip.openedAt), 0) /
    60_000 /
    (trips.length || 1);
  const strategyTrips = trips.filter((trip) => trip.exit !== 'DATA_GAP');
  return {
    trips: trips.length,
    /** Net of the trips the strategy closed itself (data-gap unwinds excluded). */
    strategyNetUsd: strategyTrips.reduce((sum, trip) => sum + trip.netPnlUsd, 0),
    strategyAverageTripBps:
      strategyTrips.length === 0
        ? null
        : strategyTrips.reduce((sum, trip) => sum + trip.netBps, 0) / strategyTrips.length,
    dataGapNetUsd: trips
      .filter((trip) => trip.exit === 'DATA_GAP')
      .reduce((sum, trip) => sum + trip.netPnlUsd, 0),
    winRate: trips.length === 0 ? null : wins / trips.length,
    averageTripBps:
      trips.length === 0 ? null : trips.reduce((sum, trip) => sum + trip.netBps, 0) / trips.length,
    netPnlUsd: result.netPnlUsd,
    volumeUsd: volume,
    netPerMillionUsd: volume === 0 ? null : (result.netPnlUsd / volume) * 1_000_000,
    maxDrawdownUsd: result.maxDrawdownUsd,
    sessions: result.sessions,
    maxLossSessions: result.sessionsMaxLoss,
    dataGapUnwinds: result.sessionsDataGap,
    dcaAdditions: result.dcaAdditions,
    breakEvenSteps: result.breakEvenSteps,
    rescueSteps: result.rescueSteps,
    averageHoldMinutes: holdMinutes,
    exits: trips.reduce<Record<string, number>>((counts, trip) => {
      counts[trip.exit] = (counts[trip.exit] ?? 0) + 1;
      return counts;
    }, {}),
  };
}

function main(): void {
  const args = parseBacktestArgumentsV1(process.argv.slice(2));
  const rows = readBacktestRowsV1(args.file, args.from, args.to);
  if (rows.length === 0) throw new Error('BACKTEST_NO_ROWS');
  let variants: Array<{ label: string; config: decibel_backtest_config_v1 }> = [
    { label: 'baseline', config: args.config },
  ];
  for (const set of args.sets)
    variants = variants.flatMap((variant) =>
      set.values.map((value) => ({
        label: `${variant.label === 'baseline' ? '' : `${variant.label} `}${set.path}=${value}`,
        config: {
          ...variant.config,
          policy: overrideDecibelBacktestPolicyV1(variant.config.policy, set.path, value),
        },
      })),
    );
  const results = variants.map((variant) => ({
    label: variant.label,
    summary: summarizeDecibelBacktestV1(runDecibelStrategyBacktestV1(rows, variant.config)),
  }));
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ rows: rows.length, results }, null, 2)}\n`);
    return;
  }
  const fixed = (value: number | null, digits: number) =>
    value === null ? '-' : value.toFixed(digits);
  process.stdout.write(
    `rows=${rows.length} from=${new Date(rows[0]!.at).toISOString()} to=${new Date(rows.at(-1)!.at).toISOString()}\n`,
  );
  process.stdout.write(
    'variant | trips | win% | avg bps | net $ | strategy net $ | strat avg bps | gap net $ | volume $ | $/1M | maxDD $ | maxLoss | gaps | DCA | BE | rescue | hold min\n',
  );
  for (const { label, summary: s } of results.sort(
    (a, b) => b.summary.strategyNetUsd - a.summary.strategyNetUsd,
  ))
    process.stdout.write(
      [
        label,
        s.trips,
        fixed(s.winRate === null ? null : s.winRate * 100, 0),
        fixed(s.averageTripBps, 2),
        fixed(s.netPnlUsd, 2),
        fixed(s.strategyNetUsd, 2),
        fixed(s.strategyAverageTripBps, 2),
        fixed(s.dataGapNetUsd, 2),
        fixed(s.volumeUsd, 0),
        fixed(s.netPerMillionUsd, 0),
        fixed(s.maxDrawdownUsd, 2),
        s.maxLossSessions,
        s.dataGapUnwinds,
        s.dcaAdditions,
        s.breakEvenSteps,
        s.rescueSteps,
        fixed(s.averageHoldMinutes, 1),
      ].join(' | ') + '\n',
    );
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('run_decibel_strategy_backtest_v1.ts')) main();
