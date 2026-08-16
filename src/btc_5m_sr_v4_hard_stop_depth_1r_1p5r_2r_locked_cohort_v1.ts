import type { price_candle } from './btc_bybit_decibel_overlap_audit.js';
import {
  passesAnchorSixMetricDominance,
  simulateAnchorHardStopTrade,
  summarizeAnchorLockedSegment,
  type hard_stop_trade,
} from './btc_5m_sr_v4_structural_anchor_hard_stop_locked_cohort.js';
import {
  StructuralAnchorHardStopRules,
  type anchor_trade_diagnostic,
} from './btc_5m_sr_v4_structural_anchor_hard_stop_feasibility_diagnostic.js';

const tolerance = 1e-9;
const day = 86_400_000;

export const HardStopDepthRules = {
  experimentId: 'BTC_5M_SR_V4_HARD_STOP_DEPTH_1R_1P5R_2R_LOCKED_COHORT_V1' as const,
  sourceExperimentId: StructuralAnchorHardStopRules.experimentId,
  policies: {
    P0_V4_DELAYED_INVALIDATION: null,
    P1_HARD_STOP_1R: 1,
    P2_HARD_STOP_1P5R: 1.5,
    P3_HARD_STOP_2R: 2,
  } as const,
  entryLiquidity: 'POST_ONLY_LIMIT_MAKER' as const,
  targetLiquidity: 'REDUCE_ONLY_POST_ONLY_LIMIT_MAKER' as const,
  hardStopLiquidity: 'TAKER_PROTECTIVE_EXIT' as const,
  same1mPolicy: 'STOP_WINS' as const,
  p0Expected: StructuralAnchorHardStopRules.expected,
  p1Expected: {
    DISCOVERY: {
      tradeCount: 7060,
      takeProfitCount: 2076,
      hardStopCount: 4984,
      meanGrossR: -0.11800970311969772,
      grossRProfitFactor: 0.8329919148029084,
      meanNetR: -0.5242530109800058,
      netRProfitFactor: 0.4988432696217938,
      totalNetPnlUsd: -397.2980022860986,
      netProfitFactor: 0.5033401410252428,
    },
    LATE_DEVELOPMENT: {
      tradeCount: 4189,
      takeProfitCount: 1317,
      hardStopCount: 2872,
      meanGrossR: -0.0568547612810934,
      grossRProfitFactor: 0.9171200672152854,
      meanNetR: -0.637443409233385,
      netRProfitFactor: 0.4499206697977127,
      totalNetPnlUsd: -286.34641320402585,
      netProfitFactor: 0.4555232055979094,
    },
  },
};

export type hard_stop_policy = Exclude<
  keyof typeof HardStopDepthRules.policies,
  'P0_V4_DELAYED_INVALIDATION'
>;

export type depth_trade = hard_stop_trade & {
  policy: hard_stop_policy;
  nominalStopR: number;
  stopPrice: number;
  slippageBeyondNominalStopR: number | null;
};

export function getDepthStopPrice(
  trade: Pick<anchor_trade_diagnostic, 'direction' | 'entryPrice' | 'rPrice'>,
  depthR: number,
) {
  return trade.direction === 'LONG'
    ? trade.entryPrice - depthR * trade.rPrice
    : trade.entryPrice + depthR * trade.rPrice;
}

export function simulateDepthTrade(input: {
  policy: hard_stop_policy;
  baseline: anchor_trade_diagnostic;
  candles: readonly price_candle[];
  startIndex?: number;
  segmentEndExclusiveTimestamp: number;
  makerFeeRate: number;
  takerFeeRate: number;
}): depth_trade {
  const depthR = HardStopDepthRules.policies[input.policy];
  const stopPrice = getDepthStopPrice(input.baseline, depthR);
  const simulated = simulateAnchorHardStopTrade({
    baseline: { ...input.baseline, structuralAnchor: stopPrice, hardStopLevel: stopPrice },
    candles: input.candles,
    ...(input.startIndex === undefined ? {} : { startIndex: input.startIndex }),
    segmentEndExclusiveTimestamp: input.segmentEndExclusiveTimestamp,
    makerFeeRate: input.makerFeeRate,
    takerFeeRate: input.takerFeeRate,
  });
  return {
    ...simulated,
    structuralAnchor: input.baseline.structuralAnchor,
    policy: input.policy,
    nominalStopR: -depthR,
    stopPrice,
    hardStopSlippageBeyondMinus1R:
      input.policy === 'P1_HARD_STOP_1R' ? simulated.hardStopSlippageBeyondMinus1R : null,
    slippageBeyondNominalStopR:
      simulated.outcome === 'STRUCTURAL_ANCHOR_HARD_STOP'
        ? Math.max(0, -depthR - simulated.grossR)
        : null,
  };
}

const delta = (candidate: number | null, control: number | null) =>
  candidate === null || control === null ? null : candidate - control;

function compareScoreboards(
  candidate: ReturnType<typeof summarizeAnchorLockedSegment>['scoreboard']['P1'],
  control: ReturnType<typeof summarizeAnchorLockedSegment>['scoreboard']['P1'],
) {
  return {
    deltaMeanGrossR: delta(candidate.meanGrossR, control.meanGrossR),
    deltaGrossRProfitFactor: delta(candidate.grossRProfitFactor, control.grossRProfitFactor),
    deltaMeanNetR: delta(candidate.meanNetR, control.meanNetR),
    deltaNetRProfitFactor: delta(candidate.netRProfitFactor, control.netRProfitFactor),
    deltaTotalNetPnlUsd: candidate.totalNetPnlUsd - control.totalNetPnlUsd,
    deltaNetProfitFactor: delta(candidate.netProfitFactor, control.netProfitFactor),
  };
}

function stopExecution(rows: readonly depth_trade[], depthR: number) {
  const stops = rows.filter((row) => row.outcome === 'STRUCTURAL_ANCHOR_HARD_STOP');
  const openThrough = stops.filter((row) => row.stopOpenThroughAnchor);
  const slippage = stops.map((row) => row.slippageBeyondNominalStopR ?? 0);
  const avg = (values: readonly number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const pct = (values: readonly number[], q: number) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * q;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
  };
  return {
    expectedNominalGrossR: -depthR,
    hardStopCount: stops.length,
    exactStopFillCount: stops.length - openThrough.length,
    openThroughStopFillCount: openThrough.length,
    openThroughStopFillRate: stops.length ? openThrough.length / stops.length : 0,
    meanHardStopGrossR: avg(stops.map((row) => row.grossR)),
    medianHardStopGrossR: pct(
      stops.map((row) => row.grossR),
      0.5,
    ),
    meanSlippageBeyondNominalStopR: avg(slippage),
    medianSlippageBeyondNominalStopR: pct(slippage, 0.5),
    p90SlippageBeyondNominalStopR: pct(slippage, 0.9),
  };
}

function recoveryAgainstP1(
  baseline: readonly anchor_trade_diagnostic[],
  p1: readonly depth_trade[],
  candidate: readonly depth_trade[],
) {
  const baselineById = new Map(baseline.map((row) => [row.tradeId, row]));
  const candidateById = new Map(candidate.map((row) => [row.tradeId, row]));
  const falseStopped = p1.filter(
    (row) =>
      baselineById.get(row.tradeId)?.baselineOutcome === 'TAKE_PROFIT' &&
      row.outcome === 'STRUCTURAL_ANCHOR_HARD_STOP',
  );
  const recovered = falseStopped.filter(
    (row) => candidateById.get(row.tradeId)?.outcome === 'TAKE_PROFIT',
  );
  const baselineLosers = baseline.filter((row) => row.baselineOutcome !== 'TAKE_PROFIT');
  const p1ById = new Map(p1.map((row) => [row.tradeId, row]));
  const extraLosses = baselineLosers.map((row) => {
    const control = p1ById.get(row.tradeId);
    const challenger = candidateById.get(row.tradeId);
    if (control === undefined || challenger === undefined) throw new Error('DEPTH_TRADE_MISSING');
    return {
      usd: Math.max(0, control.netPnlUsd - challenger.netPnlUsd),
      r: Math.max(0, control.netR - challenger.netR),
    };
  });
  const affected = extraLosses.filter((row) => row.r > 0);
  return {
    recoveredWinners: {
      p1FalseStoppedWinnerCount: falseStopped.length,
      candidateRecoveredWinnerCount: recovered.length,
      candidateRecoveredWinnerRateAmongP1FalseStoppedWinners: falseStopped.length
        ? recovered.length / falseStopped.length
        : 0,
      candidateStillFalseStoppedCount: falseStopped.length - recovered.length,
      recoveredWinnerNetPnlUsd: recovered.reduce(
        (sum, row) => sum + candidateById.get(row.tradeId)!.netPnlUsd,
        0,
      ),
    },
    lostLoserSavings: {
      additionalNetLossOnBaselineLosersUsd: extraLosses.reduce((sum, row) => sum + row.usd, 0),
      additionalNetLossOnBaselineLosersR: extraLosses.reduce((sum, row) => sum + row.r, 0),
      meanAdditionalLossPerAffectedLoserR: affected.length
        ? affected.reduce((sum, row) => sum + row.r, 0) / affected.length
        : 0,
    },
  };
}

export function classifyHardStopDepth(input: {
  foundationPassed: boolean;
  validPolicies: readonly hard_stop_policy[];
}) {
  if (!input.foundationPassed) return 'BTC_5M_SR_HARD_STOP_DEPTH_FOUNDATION_REGRESSION';
  if (input.validPolicies.length === 0) return 'BTC_5M_SR_HARD_STOP_DEPTH_NONE_DOMINATES_V4';
  if (input.validPolicies.length > 1) return 'BTC_5M_SR_HARD_STOP_DEPTH_MULTIPLE_VALID_DEPTHS';
  return input.validPolicies[0] === 'P1_HARD_STOP_1R'
    ? 'BTC_5M_SR_HARD_STOP_DEPTH_1R_CANDIDATE'
    : input.validPolicies[0] === 'P2_HARD_STOP_1P5R'
      ? 'BTC_5M_SR_HARD_STOP_DEPTH_1P5R_CANDIDATE'
      : 'BTC_5M_SR_HARD_STOP_DEPTH_2R_CANDIDATE';
}

function checkExpected(actual: Record<string, number | null>, expected: Record<string, number>) {
  return Object.entries(expected).every(
    ([key, value]) => actual[key] !== null && Math.abs(actual[key]! - value) <= tolerance,
  );
}

export function buildHardStopDepthReport(input: {
  sourceExperimentId: string;
  discovery: readonly anchor_trade_diagnostic[];
  lateDevelopment: readonly anchor_trade_diagnostic[];
  candles: readonly price_candle[];
  discoveryStartTimestamp: number;
  discoveryEndExclusiveTimestamp: number;
  lateEndExclusiveTimestamp: number;
  makerFeeRate: number;
  takerFeeRate: number;
}) {
  const index = new Map(input.candles.map((candle, rowIndex) => [candle.timestamp, rowIndex]));
  const policies = Object.entries(HardStopDepthRules.policies).filter(
    (entry): entry is [hard_stop_policy, 1 | 1.5 | 2] => entry[1] !== null,
  );
  const run = (rows: readonly anchor_trade_diagnostic[], end: number) =>
    Object.fromEntries(
      policies.map(([policy]) => [
        policy,
        rows.map((row) => {
          const startIndex = index.get(row.entryFill1mTimestamp);
          if (startIndex === undefined) throw new Error('HARD_STOP_DEPTH_1M_PATH_MISSING');
          return simulateDepthTrade({
            policy,
            baseline: row,
            candles: input.candles,
            startIndex,
            segmentEndExclusiveTimestamp: end,
            makerFeeRate: input.makerFeeRate,
            takerFeeRate: input.takerFeeRate,
          });
        }),
      ]),
    ) as Record<hard_stop_policy, depth_trade[]>;
  const discoveryTrades = run(input.discovery, input.discoveryEndExclusiveTimestamp);
  const lateTrades = run(input.lateDevelopment, input.lateEndExclusiveTimestamp);
  const segment = (
    baseline: readonly anchor_trade_diagnostic[],
    trades: Record<hard_stop_policy, depth_trade[]>,
  ) => {
    const summaries = Object.fromEntries(
      policies.map(([policy, depth]) => {
        const base = summarizeAnchorLockedSegment(baseline, trades[policy]);
        const enrich = (
          view: (typeof base.longShort)[keyof typeof base.longShort],
          side: 'ALL' | 'LONG' | 'SHORT',
        ) => {
          const source =
            side === 'ALL' ? baseline : baseline.filter((row) => row.direction === side);
          return {
            ...view,
            scoreboard: {
              P0: {
                ...view.scoreboard.P0,
                normalInvalidationCount: source.filter(
                  (row) => row.baselineOutcome === 'NORMAL_INVALIDATION',
                ).length,
              },
              P1: { ...view.scoreboard.P1, normalInvalidationCount: 0 },
            },
          };
        };
        const summary = {
          ...base,
          scoreboard: enrich(base.longShort.ALL, 'ALL').scoreboard,
          longShort: {
            ALL: enrich(base.longShort.ALL, 'ALL'),
            LONG: enrich(base.longShort.LONG, 'LONG'),
            SHORT: enrich(base.longShort.SHORT, 'SHORT'),
          },
        };
        return [policy, { ...summary, stopExecution: stopExecution(trades[policy], depth) }];
      }),
    ) as Record<
      hard_stop_policy,
      ReturnType<typeof summarizeAnchorLockedSegment> & {
        stopExecution: ReturnType<typeof stopExecution>;
      }
    >;
    const p1 = summaries.P1_HARD_STOP_1R;
    const p0 = p1.scoreboard.P0;
    const comparisons = Object.fromEntries(
      policies.map(([policy]) => [policy, compareScoreboards(summaries[policy].scoreboard.P1, p0)]),
    );
    const falseStopRate = (policy: hard_stop_policy) =>
      summaries[policy].falseStoppedBaselineWinners.rateAmongP0TpWinners;
    return {
      policies: summaries,
      recoveredWinners: {
        P2_HARD_STOP_1P5R: recoveryAgainstP1(
          baseline,
          trades.P1_HARD_STOP_1R,
          trades.P2_HARD_STOP_1P5R,
        ),
        P3_HARD_STOP_2R: recoveryAgainstP1(
          baseline,
          trades.P1_HARD_STOP_1R,
          trades.P3_HARD_STOP_2R,
        ),
      },
      marginalDepthEconomics: {
        P2_MINUS_P1: {
          ...compareScoreboards(
            summaries.P2_HARD_STOP_1P5R.scoreboard.P1,
            summaries.P1_HARD_STOP_1R.scoreboard.P1,
          ),
          deltaFalseStoppedWinnerRate:
            falseStopRate('P2_HARD_STOP_1P5R') - falseStopRate('P1_HARD_STOP_1R'),
          deltaHardStopCount:
            summaries.P2_HARD_STOP_1P5R.scoreboard.P1.hardStopCount -
            summaries.P1_HARD_STOP_1R.scoreboard.P1.hardStopCount,
        },
        P3_MINUS_P1: {
          ...compareScoreboards(
            summaries.P3_HARD_STOP_2R.scoreboard.P1,
            summaries.P1_HARD_STOP_1R.scoreboard.P1,
          ),
          deltaFalseStoppedWinnerRate:
            falseStopRate('P3_HARD_STOP_2R') - falseStopRate('P1_HARD_STOP_1R'),
          deltaHardStopCount:
            summaries.P3_HARD_STOP_2R.scoreboard.P1.hardStopCount -
            summaries.P1_HARD_STOP_1R.scoreboard.P1.hardStopCount,
        },
      },
      v4Comparisons: comparisons,
      dominance: Object.fromEntries(
        policies.map(([policy]) => [
          policy,
          passesAnchorSixMetricDominance(summaries[policy].scoreboard.P1, p0),
        ]),
      ) as Record<hard_stop_policy, boolean>,
      edgeChecks: Object.fromEntries(
        policies.map(([policy]) => {
          const score = summaries[policy].scoreboard.P1;
          return [
            policy,
            {
              grossEdgePositive:
                (score.meanGrossR ?? -Infinity) > 0 && (score.grossRProfitFactor ?? 0) > 1,
              netEdgePositive:
                (score.meanNetR ?? -Infinity) > 0 && (score.netProfitFactor ?? 0) > 1,
            },
          ];
        }),
      ),
    };
  };
  const discovery = segment(input.discovery, discoveryTrades);
  const lateDevelopment = segment(input.lateDevelopment, lateTrades);
  const p0Discovery = discovery.policies.P1_HARD_STOP_1R.scoreboard.P0;
  const p0Late = lateDevelopment.policies.P1_HARD_STOP_1R.scoreboard.P0;
  const p1Discovery = discovery.policies.P1_HARD_STOP_1R.scoreboard.P1;
  const p1Late = lateDevelopment.policies.P1_HARD_STOP_1R.scoreboard.P1;
  const p0Actual = (score: typeof p0Discovery, rows: readonly anchor_trade_diagnostic[]) => ({
    completedTradeCount: score.tradeCount,
    takeProfitCount: score.takeProfitCount,
    normalInvalidationCount: rows.filter((row) => row.baselineOutcome === 'NORMAL_INVALIDATION')
      .length,
    emergencyStopCount: score.emergencyStopCount,
    meanGrossR: score.meanGrossR,
    meanNetR: score.meanNetR,
    grossRProfitFactor: score.grossRProfitFactor,
    netRProfitFactor: score.netRProfitFactor,
    totalNetPnlUsd: score.totalNetPnlUsd,
    netProfitFactor: score.netProfitFactor,
  });
  const p0Checks = {
    discovery: checkExpected(
      p0Actual(p0Discovery, input.discovery),
      HardStopDepthRules.p0Expected.DISCOVERY,
    ),
    lateDevelopment: checkExpected(
      p0Actual(p0Late, input.lateDevelopment),
      HardStopDepthRules.p0Expected.LATE_DEVELOPMENT,
    ),
  };
  const p1Checks = {
    discovery: checkExpected(p1Discovery, HardStopDepthRules.p1Expected.DISCOVERY),
    lateDevelopment: checkExpected(p1Late, HardStopDepthRules.p1Expected.LATE_DEVELOPMENT),
  };
  const sourceById = new Map(
    [...input.discovery, ...input.lateDevelopment].map((row) => [row.tradeId, row]),
  );
  const cohortInvariance = {
    discovery: Object.values(discoveryTrades).every(
      (rows) => rows.length === input.discovery.length,
    ),
    lateDevelopment: Object.values(lateTrades).every(
      (rows) => rows.length === input.lateDevelopment.length,
    ),
    p1EqualsStructuralAnchor: [
      ...discoveryTrades.P1_HARD_STOP_1R,
      ...lateTrades.P1_HARD_STOP_1R,
    ].every((row) => Math.abs(row.stopPrice - row.structuralAnchor) <= tolerance),
    frozenFields: [
      ...Object.values(discoveryTrades).flat(),
      ...Object.values(lateTrades).flat(),
    ].every((row) => {
      const source = sourceById.get(row.tradeId);
      return (
        source !== undefined &&
        row.entryPrice === source.entryPrice &&
        row.rPrice === source.rPrice &&
        row.structuralAnchor === source.structuralAnchor &&
        row.actualNotionalUsd === source.actualNotionalUsd &&
        row.actualGrossRiskUsd === source.actualGrossRiskUsd &&
        row.targetPrice === source.baselineTargetPrice
      );
    }),
  };
  const foundationPassed =
    input.sourceExperimentId === HardStopDepthRules.sourceExperimentId &&
    Object.values(p0Checks).every(Boolean) &&
    Object.values(p1Checks).every(Boolean) &&
    Object.values(cohortInvariance).every(Boolean);
  const validPolicies = policies
    .map(([policy]) => policy)
    .filter((policy) => discovery.dominance[policy] && lateDevelopment.dominance[policy]);
  const classification = classifyHardStopDepth({ foundationPassed, validPolicies });
  const selected = validPolicies.length === 1 ? validPolicies[0]! : null;
  return {
    experimentId: HardStopDepthRules.experimentId,
    metadata: {
      sourceExperimentId: HardStopDepthRules.sourceExperimentId,
      policies: HardStopDepthRules.policies,
      lockedCohort: true,
      dynamicEquity: false,
      topUps: false,
      resizing: false,
      newOpportunities: false,
      entryLiquidity: HardStopDepthRules.entryLiquidity,
      targetLiquidity: HardStopDepthRules.targetLiquidity,
      hardStopLiquidity: HardStopDepthRules.hardStopLiquidity,
      same1mPolicy: HardStopDepthRules.same1mPolicy,
      makerFeeRate: input.makerFeeRate,
      takerFeeRate: input.takerFeeRate,
      segments: ['DISCOVERY', 'LATE_DEVELOPMENT'] as const,
    },
    foundation: { passed: foundationPassed, p0Checks, p1Checks },
    cohortInvariance,
    frequency: {
      discovery: {
        completedTradeCount: input.discovery.length,
        completedTradesPerUtcDay:
          input.discovery.length /
          ((input.discoveryEndExclusiveTimestamp - input.discoveryStartTimestamp) / day),
      },
      lateDevelopment: {
        completedTradeCount: input.lateDevelopment.length,
        completedTradesPerUtcDay:
          input.lateDevelopment.length /
          ((input.lateEndExclusiveTimestamp - input.discoveryEndExclusiveTimestamp) / day),
      },
    },
    segments: {
      discovery: { ...discovery, trades: discoveryTrades },
      lateDevelopment: { ...lateDevelopment, trades: lateTrades },
    },
    validPolicies,
    selectedPolicy: selected,
    netEdgePositiveBoth:
      selected === null
        ? false
        : Boolean(
            discovery.edgeChecks[selected]?.netEdgePositive &&
            lateDevelopment.edgeChecks[selected]?.netEdgePositive,
          ),
    classification,
  };
}
