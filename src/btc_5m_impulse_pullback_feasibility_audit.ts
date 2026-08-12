import { z } from 'zod';

export const BTC5MImpulsePullbackFeasibilityAudit = {
  auditId: 'BTC_5M_IMPULSE_PULLBACK_1R_FEASIBILITY_AUDIT_V1' as const,
  sourceExperimentId: 'BTC_5M_IMPULSE_PULLBACK_1R_V1' as const,
};

const CampaignSchema = z.object({
  splitLabel: z.enum(['DISCOVERY', 'HOLDOUT']),
  outcome: z.enum([
    'ENTRY_FAILED',
    'PENDING_AT_DATASET_END',
    'TAKE_PROFIT',
    'STOP_LOSS',
    'MARGIN_GUARD',
    'OPEN_AT_DATASET_END',
  ]),
  grossPnL: z.number().finite(),
  netPnL: z.number().finite(),
  totalFees: z.number().nonnegative().finite(),
  entryNotional: z.number().positive().finite().nullable(),
  entryFillPrice: z.number().positive().finite().nullable(),
  riskDistance: z.number().positive().finite().nullable(),
});
const SourceSchema = z.object({
  experimentId: z.literal(BTC5MImpulsePullbackFeasibilityAudit.sourceExperimentId),
  overall: z.record(z.unknown()),
  holdout: z.record(z.unknown()),
  campaigns: z.array(CampaignSchema),
});
type campaign = z.infer<typeof CampaignSchema>;
export type feasibility_classification =
  | 'CURRENT_1R_NET_ECONOMICS_FEASIBLE'
  | 'CURRENT_1R_GROSS_EDGE_COST_DOMINATED'
  | 'CURRENT_1R_NO_GROSS_EDGE';

const mean = (values: readonly number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = (values: readonly number[], fraction: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * fraction)]!;
};
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? null : numerator / denominator;
const completed = (value: campaign) =>
  value.outcome === 'TAKE_PROFIT' ||
  value.outcome === 'STOP_LOSS' ||
  value.outcome === 'MARGIN_GUARD';

export type cohort_audit = ReturnType<typeof auditCohort>;
function auditCohort(campaigns: readonly campaign[]) {
  const realized = campaigns.filter(completed),
    open = campaigns.filter((value) => value.outcome === 'OPEN_AT_DATASET_END'),
    gross = realized.map((value) => value.grossPnL),
    net = realized.map((value) => value.netPnL),
    grossWins = gross.filter((value) => value > 0),
    grossLosses = gross.filter((value) => value < 0).map(Math.abs),
    netWins = net.filter((value) => value > 0),
    netLosses = net.filter((value) => value < 0).map(Math.abs),
    fees = realized.map((value) => value.totalFees),
    grossProfitSum = sum(grossWins),
    grossLossSumAbs = sum(grossLosses),
    netProfitSum = sum(netWins),
    netLossSumAbs = sum(netLosses),
    grossPnLSum = sum(gross),
    netPnLSum = sum(net),
    geometry = realized.flatMap((value) =>
      value.entryNotional && value.entryFillPrice && value.riskDistance
        ? [
            {
              fee: value.totalFees,
              feeBps: (value.totalFees / value.entryNotional) * 10_000,
              riskBps: (value.riskDistance / value.entryFillPrice) * 10_000,
              oneRGrossDollar: value.entryNotional * (value.riskDistance / value.entryFillPrice),
            },
          ]
        : [],
    ),
    feeInR = geometry
      .filter((value) => value.oneRGrossDollar > 0)
      .map((value) => value.fee / value.oneRGrossDollar),
    feeBps = geometry.map((value) => value.feeBps),
    riskBps = geometry.map((value) => value.riskBps),
    riskToFee = geometry
      .filter((value) => value.feeBps > 0)
      .map((value) => value.riskBps / value.feeBps),
    winnerFeeFractions = realized
      .filter((value) => value.grossPnL > 0)
      .map((value) => value.totalFees / value.grossPnL),
    loserFeeFractions = realized
      .filter((value) => value.grossPnL < 0)
      .map((value) => value.totalFees / Math.abs(value.grossPnL)),
    meanGrossWin = mean(grossWins),
    meanGrossLossAbs = mean(grossLosses),
    meanFee = mean(fees),
    currentMeanGrossExpectancy = ratio(grossPnLSum, realized.length),
    breakEvenWinRate =
      meanGrossWin === null || meanGrossLossAbs === null || meanFee === null
        ? null
        : (meanGrossLossAbs + meanFee) / (meanGrossWin + meanGrossLossAbs),
    actualTpRate = ratio(
      realized.filter((value) => value.outcome === 'TAKE_PROFIT').length,
      realized.length,
    ),
    meanNetLossAbs = mean(netLosses),
    requiredRisk50 = feeBps.map((value) => value / 0.5),
    requiredRisk25 = feeBps.map((value) => value / 0.25);
  const distribution = (values: readonly number[]) => ({
    mean: mean(values),
    median: percentile(values, 0.5),
    p10: percentile(values, 0.1),
    p25: percentile(values, 0.25),
    p50: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
  });
  return {
    campaignCounts: {
      completedCampaignCount: realized.length,
      takeProfitCount: realized.filter((value) => value.outcome === 'TAKE_PROFIT').length,
      stopLossCount: realized.filter((value) => value.outcome === 'STOP_LOSS').length,
      marginGuardCount: realized.filter((value) => value.outcome === 'MARGIN_GUARD').length,
      openAtDatasetEndCount: open.length,
      unresolvedExcludedCount: campaigns.length - realized.length,
    },
    basicEconomics: {
      tpRate: actualTpRate,
      grossProfitSum,
      grossLossSumAbs,
      grossPnLSum,
      grossProfitFactor: ratio(grossProfitSum, grossLossSumAbs),
      netProfitSum,
      netLossSumAbs,
      netPnLSum,
      netProfitFactor: ratio(netProfitSum, netLossSumAbs),
    },
    expectancy: {
      meanGrossPnLPerCampaign: mean(gross),
      medianGrossPnLPerCampaign: percentile(gross, 0.5),
      meanNetPnLPerCampaign: mean(net),
      medianNetPnLPerCampaign: percentile(net, 0.5),
      meanGrossWin,
      medianGrossWin: percentile(grossWins, 0.5),
      meanGrossLossAbs,
      medianGrossLossAbs: percentile(grossLosses, 0.5),
      meanNetWin: mean(netWins),
      meanNetLossAbs: mean(netLosses),
    },
    feeBurden: {
      totalFeesSum: sum(fees),
      meanFeePerCampaign: meanFee,
      medianFeePerCampaign: percentile(fees, 0.5),
      p25FeePerCampaign: percentile(fees, 0.25),
      p75FeePerCampaign: percentile(fees, 0.75),
      p90FeePerCampaign: percentile(fees, 0.9),
      feesAsFractionOfGrossProfit: ratio(sum(fees), grossProfitSum),
      feesAsMultipleOfGrossEdge: grossPnLSum > 0 ? sum(fees) / grossPnLSum : null,
    },
    feeBpsOnEntryNotional: distribution(feeBps),
    riskDistanceBps: distribution(riskBps),
    feeInR: {
      ...distribution(feeInR),
      thresholds: {
        atMost0_10: ratio(feeInR.filter((value) => value <= 0.1).length, feeInR.length),
        atMost0_25: ratio(feeInR.filter((value) => value <= 0.25).length, feeInR.length),
        atMost0_50: ratio(feeInR.filter((value) => value <= 0.5).length, feeInR.length),
        atMost0_75: ratio(feeInR.filter((value) => value <= 0.75).length, feeInR.length),
        atMost1_00: ratio(feeInR.filter((value) => value <= 1).length, feeInR.length),
        above1_00: ratio(feeInR.filter((value) => value > 1).length, feeInR.length),
      },
      normalizedExplanation: { grossWin: '+1R-feeInR', grossLoss: '-1R-feeInR' },
    },
    breakEven: {
      actualTpRate,
      breakEvenWinRate,
      winRateGapPercentagePoints:
        actualTpRate === null || breakEvenWinRate === null
          ? null
          : (actualTpRate - breakEvenWinRate) * 100,
      currentMeanGrossExpectancy,
      currentMeanFee: meanFee,
      requiredMeanGrossExpectancyForBreakEven: meanFee,
      additionalGrossExpectancyNeededPerCampaign:
        currentMeanGrossExpectancy === null || meanFee === null
          ? null
          : meanFee - currentMeanGrossExpectancy,
      grossExpectancyMultipleNeeded:
        currentMeanGrossExpectancy !== null && currentMeanGrossExpectancy > 0 && meanFee !== null
          ? meanFee / currentMeanGrossExpectancy
          : null,
      additionalGrossPnLRequiredForNetBreakEven: Math.max(0, -netPnLSum),
      additionalGrossPnLRequiredPerCampaign:
        realized.length === 0 ? null : Math.max(0, -netPnLSum) / realized.length,
    },
    winnerFeeBurden: {
      ...distribution(winnerFeeFractions),
      atLeast25Percent: ratio(
        winnerFeeFractions.filter((value) => value >= 0.25).length,
        winnerFeeFractions.length,
      ),
      atLeast50Percent: ratio(
        winnerFeeFractions.filter((value) => value >= 0.5).length,
        winnerFeeFractions.length,
      ),
      atLeast75Percent: ratio(
        winnerFeeFractions.filter((value) => value >= 0.75).length,
        winnerFeeFractions.length,
      ),
      atLeast100Percent: ratio(
        winnerFeeFractions.filter((value) => value >= 1).length,
        winnerFeeFractions.length,
      ),
    },
    lossAmplification: {
      ...distribution(loserFeeFractions),
      meanGrossLossAbs,
      meanNetLossAbs: mean(netLosses),
      lossAmplificationRatio:
        meanGrossLossAbs === null || meanNetLossAbs === null
          ? null
          : meanNetLossAbs / meanGrossLossAbs,
    },
    economicEdgeCoverage: ratio(grossPnLSum, sum(fees)),
    requiredGrossEdgeMultiplierForNetZero:
      grossPnLSum > 0 && netPnLSum < 0 ? (grossPnLSum + -netPnLSum) / grossPnLSum : null,
    riskToFeeBpsRatio: distribution(riskToFee),
    requiredRiskDistance: {
      medianActualRiskBps: percentile(riskBps, 0.5),
      medianRequiredRiskBpsForFeeAtMost0_50R: percentile(requiredRisk50, 0.5),
      medianRequiredRiskBpsForFeeAtMost0_25R: percentile(requiredRisk25, 0.5),
      proportionSatisfying0_50R: ratio(
        geometry.filter((value) => value.riskBps >= value.feeBps / 0.5).length,
        geometry.length,
      ),
      proportionSatisfying0_25R: ratio(
        geometry.filter((value) => value.riskBps >= value.feeBps / 0.25).length,
        geometry.length,
      ),
    },
  };
}

type two_r_comparison =
  | { twoRComparisonAvailable: false; largerWinnerObservedResult: null }
  | {
      twoRComparisonAvailable: true;
      oneRHoldoutGrossPF: number | null;
      oneRHoldoutNetPF: number | null;
      twoRHoldoutGrossPF: number | null;
      twoRHoldoutNetPF: number | null;
      twoRHoldoutTpRate: number | null;
      holdoutOneRToTwoRContinuationRate: number | null;
      largerWinnerObservedResult: '2R_IMPROVED_NET_ECONOMICS' | '2R_DID_NOT_IMPROVE_NET_ECONOMICS';
    };

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function nested(record: Record<string, unknown>, path: readonly string[]): unknown {
  let value: unknown = record;
  for (const key of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
function compareTwoR(source: z.infer<typeof SourceSchema>, twoR: unknown): two_r_comparison {
  if (typeof twoR !== 'object' || twoR === null)
    return { twoRComparisonAvailable: false, largerWinnerObservedResult: null };
  const record = twoR as Record<string, unknown>,
    oneNet = readNumber(source.holdout.netProfitFactor),
    twoNet = readNumber(nested(record, ['holdout', 'netProfitFactor']));
  if (twoNet === null) return { twoRComparisonAvailable: false, largerWinnerObservedResult: null };
  return {
    twoRComparisonAvailable: true,
    oneRHoldoutGrossPF: readNumber(source.holdout.grossProfitFactor),
    oneRHoldoutNetPF: oneNet,
    twoRHoldoutGrossPF: readNumber(nested(record, ['holdout', 'grossProfitFactor'])),
    twoRHoldoutNetPF: twoNet,
    twoRHoldoutTpRate: readNumber(nested(record, ['holdout', 'tpRate'])),
    holdoutOneRToTwoRContinuationRate: readNumber(
      nested(record, ['winnerContinuationDiagnostic', 'holdout', 'oneRToTwoRContinuationRate']),
    ),
    largerWinnerObservedResult:
      oneNet !== null && twoNet > oneNet
        ? '2R_IMPROVED_NET_ECONOMICS'
        : '2R_DID_NOT_IMPROVE_NET_ECONOMICS',
  };
}

export function classifyFeasibility(holdout: cohort_audit): feasibility_classification {
  const count = holdout.campaignCounts.completedCampaignCount,
    grossPF = holdout.basicEconomics.grossProfitFactor,
    netPF = holdout.basicEconomics.netProfitFactor;
  if (count >= 30 && (netPF ?? 0) >= 1 && holdout.basicEconomics.netPnLSum > 0)
    return 'CURRENT_1R_NET_ECONOMICS_FEASIBLE';
  if (
    count >= 30 &&
    (grossPF ?? 0) > 1 &&
    holdout.basicEconomics.grossPnLSum > 0 &&
    (netPF ?? Number.POSITIVE_INFINITY) < 1 &&
    holdout.basicEconomics.netPnLSum < 0
  )
    return 'CURRENT_1R_GROSS_EDGE_COST_DOMINATED';
  return 'CURRENT_1R_NO_GROSS_EDGE';
}

function checkSummary(
  label: 'overall' | 'holdout',
  stored: Record<string, unknown>,
  recomputed: cohort_audit,
): Array<{ cohort: string; field: string; stored: number | null; recomputed: number | null }> {
  const values: Record<string, number | null> = {
    completedCampaignCount: recomputed.campaignCounts.completedCampaignCount,
    takeProfitCount: recomputed.campaignCounts.takeProfitCount,
    stopLossCount: recomputed.campaignCounts.stopLossCount,
    marginGuardCount: recomputed.campaignCounts.marginGuardCount,
    tpRate: recomputed.basicEconomics.tpRate,
    grossPnLSum: recomputed.basicEconomics.grossPnLSum,
    netPnLSum: recomputed.basicEconomics.netPnLSum,
    grossProfitFactor: recomputed.basicEconomics.grossProfitFactor,
    netProfitFactor: recomputed.basicEconomics.netProfitFactor,
  };
  return Object.entries(values).flatMap(([field, recomputedValue]) => {
    const storedValue = readNumber(stored[field]);
    if (storedValue === null && recomputedValue === null) return [];
    if (
      storedValue !== null &&
      recomputedValue !== null &&
      Math.abs(storedValue - recomputedValue) <= 1e-8 * Math.max(1, Math.abs(recomputedValue))
    )
      return [];
    return [{ cohort: label, field, stored: storedValue, recomputed: recomputedValue }];
  });
}

export function buildBTC5MImpulsePullbackFeasibilityAudit(
  sourceValue: unknown,
  twoRValue?: unknown,
) {
  const source = SourceSchema.parse(sourceValue),
    overall = auditCohort(source.campaigns),
    holdout = auditCohort(source.campaigns.filter((value) => value.splitLabel === 'HOLDOUT')),
    mismatches = [
      ...checkSummary('overall', source.overall, overall),
      ...checkSummary('holdout', source.holdout, holdout),
    ],
    classification = classifyFeasibility(holdout),
    twoRObservedComparison = compareTwoR(source, twoRValue);
  return {
    auditId: BTC5MImpulsePullbackFeasibilityAudit.auditId,
    sourceReport: 'data/btc_price_action/btc_5m_impulse_pullback_1r_v1.json',
    sourceExperimentId: source.experimentId,
    sourceConsistencyCheck: { consistent: mismatches.length === 0, tolerance: 1e-8, mismatches },
    overall,
    holdout,
    twoRObservedComparison,
    decisionSummary: {
      classification,
      holdoutGrossPF: holdout.basicEconomics.grossProfitFactor,
      holdoutNetPF: holdout.basicEconomics.netProfitFactor,
      holdoutGrossPnL: holdout.basicEconomics.grossPnLSum,
      holdoutNetPnL: holdout.basicEconomics.netPnLSum,
      holdoutTotalFees: holdout.feeBurden.totalFeesSum,
      holdoutMeanGrossExpectancy: holdout.breakEven.currentMeanGrossExpectancy,
      holdoutMeanFee: holdout.breakEven.currentMeanFee,
      holdoutGrossExpectancyMultipleNeeded: holdout.breakEven.grossExpectancyMultipleNeeded,
      holdoutActualTpRate: holdout.breakEven.actualTpRate,
      holdoutBreakEvenWinRate: holdout.breakEven.breakEvenWinRate,
      holdoutMedianRiskBps: holdout.riskDistanceBps.median,
      holdoutMedianFeeBps: holdout.feeBpsOnEntryNotional.median,
      holdoutMedianFeeInR: holdout.feeInR.median,
      holdoutEconomicEdgeCoverage: holdout.economicEdgeCoverage,
      twoRObservedResult: twoRObservedComparison.largerWinnerObservedResult,
    },
    classification,
  };
}
