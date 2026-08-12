import { describe, expect, it } from 'vitest';
import {
  BTC5MImpulsePullbackFeasibilityAudit,
  buildBTC5MImpulsePullbackFeasibilityAudit,
} from '../src/btc_5m_impulse_pullback_feasibility_audit.js';
import { readRequiredPullback1RReport } from '../src/btc_5m_impulse_pullback_feasibility_audit_command.js';

const campaign = (
  grossPnL: number,
  netPnL: number,
  outcome: 'TAKE_PROFIT' | 'STOP_LOSS' | 'OPEN_AT_DATASET_END' = grossPnL > 0
    ? 'TAKE_PROFIT'
    : 'STOP_LOSS',
  splitLabel: 'DISCOVERY' | 'HOLDOUT' = 'HOLDOUT',
) => ({
  splitLabel,
  outcome,
  grossPnL,
  netPnL,
  totalFees: outcome === 'OPEN_AT_DATASET_END' ? 1 : 2,
  entryNotional: 1000,
  entryFillPrice: 100,
  riskDistance: 1,
});

function source(campaigns = [campaign(10, 8), campaign(-10, -12)]) {
  const holdout = campaigns.filter((value) => value.splitLabel === 'HOLDOUT');
  const summary = (values: typeof campaigns) => {
    const realized = values.filter((value) => value.outcome !== 'OPEN_AT_DATASET_END'),
      grossWins = realized
        .filter((value) => value.grossPnL > 0)
        .reduce((sum, value) => sum + value.grossPnL, 0),
      grossLoss = -realized
        .filter((value) => value.grossPnL < 0)
        .reduce((sum, value) => sum + value.grossPnL, 0),
      netWins = realized
        .filter((value) => value.netPnL > 0)
        .reduce((sum, value) => sum + value.netPnL, 0),
      netLoss = -realized
        .filter((value) => value.netPnL < 0)
        .reduce((sum, value) => sum + value.netPnL, 0);
    return {
      completedCampaignCount: realized.length,
      takeProfitCount: realized.filter((value) => value.outcome === 'TAKE_PROFIT').length,
      stopLossCount: realized.filter((value) => value.outcome === 'STOP_LOSS').length,
      marginGuardCount: 0,
      tpRate: realized.filter((value) => value.outcome === 'TAKE_PROFIT').length / realized.length,
      grossPnLSum: realized.reduce((sum, value) => sum + value.grossPnL, 0),
      netPnLSum: realized.reduce((sum, value) => sum + value.netPnL, 0),
      grossProfitFactor: grossWins / grossLoss,
      netProfitFactor: netWins / netLoss,
    };
  };
  return {
    experimentId: 'BTC_5M_IMPULSE_PULLBACK_1R_V1',
    overall: summary(campaigns),
    holdout: summary(holdout),
    campaigns,
  };
}

describe('BTC 5m impulse pullback feasibility audit', () => {
  it('fails explicitly when the required completed 1R report is absent', () => {
    expect(() => readRequiredPullback1RReport('Z:/definitely-missing/pullback.json')).toThrow(
      'BTC_5M_IMPULSE_PULLBACK_1R_REPORT_UNAVAILABLE',
    );
  });

  it('recomputes exact campaign gross/net economics and actual fees', () => {
    const audit = buildBTC5MImpulsePullbackFeasibilityAudit(source());
    expect(audit.holdout.basicEconomics).toEqual({
      tpRate: 0.5,
      grossProfitSum: 10,
      grossLossSumAbs: 10,
      grossPnLSum: 0,
      grossProfitFactor: 1,
      netProfitSum: 8,
      netLossSumAbs: 12,
      netPnLSum: -4,
      netProfitFactor: 8 / 12,
    });
    expect(audit.holdout.feeBurden).toEqual(
      expect.objectContaining({ totalFeesSum: 4, meanFeePerCampaign: 2, medianFeePerCampaign: 2 }),
    );
  });

  it('calculates fee bps, risk bps, one-R dollars, fee-in-R thresholds, and risk-to-fee', () => {
    const audit = buildBTC5MImpulsePullbackFeasibilityAudit(source()).holdout;
    expect(audit.feeBpsOnEntryNotional.median).toBe(20);
    expect(audit.riskDistanceBps.median).toBe(100);
    expect(audit.feeInR.median).toBe(0.2);
    expect(audit.feeInR.thresholds).toEqual({
      atMost0_10: 0,
      atMost0_25: 1,
      atMost0_50: 1,
      atMost0_75: 1,
      atMost1_00: 1,
      above1_00: 0,
    });
    expect(audit.riskToFeeBpsRatio.median).toBe(5);
    expect(audit.requiredRiskDistance).toEqual({
      medianActualRiskBps: 100,
      medianRequiredRiskBpsForFeeAtMost0_50R: 40,
      medianRequiredRiskBpsForFeeAtMost0_25R: 80,
      proportionSatisfying0_50R: 1,
      proportionSatisfying0_25R: 1,
    });
  });

  it('calculates empirical break-even and gross-expectancy requirements exactly', () => {
    const value = buildBTC5MImpulsePullbackFeasibilityAudit(source()).holdout;
    expect(value.breakEven.breakEvenWinRate).toBe(0.6);
    expect(value.breakEven.currentMeanGrossExpectancy).toBe(0);
    expect(value.breakEven.requiredMeanGrossExpectancyForBreakEven).toBe(2);
    expect(value.breakEven.additionalGrossExpectancyNeededPerCampaign).toBe(2);
    expect(value.breakEven.additionalGrossPnLRequiredForNetBreakEven).toBe(4);
    expect(value.breakEven.additionalGrossPnLRequiredPerCampaign).toBe(2);
  });

  it('calculates winner burden, loss amplification, and edge coverage from realized campaigns', () => {
    const value = buildBTC5MImpulsePullbackFeasibilityAudit(source()).holdout;
    expect(value.winnerFeeBurden.median).toBe(0.2);
    expect(value.winnerFeeBurden.atLeast25Percent).toBe(0);
    expect(value.lossAmplification.lossAmplificationRatio).toBe(1.2);
    expect(value.economicEdgeCoverage).toBe(0);
  });

  it('uses existing HOLDOUT labels, excludes unresolved campaigns, and reports summary mismatch', () => {
    const input = source([
      campaign(10, 8, 'TAKE_PROFIT', 'DISCOVERY'),
      campaign(-10, -12),
      campaign(0, 0, 'OPEN_AT_DATASET_END'),
    ]);
    input.holdout.grossPnLSum = 999;
    const audit = buildBTC5MImpulsePullbackFeasibilityAudit(input);
    expect(audit.holdout.campaignCounts.completedCampaignCount).toBe(1);
    expect(audit.holdout.campaignCounts.unresolvedExcludedCount).toBe(1);
    expect(audit.sourceConsistencyCheck.consistent).toBe(false);
    expect(
      audit.sourceConsistencyCheck.mismatches.some(
        (value) => value.cohort === 'holdout' && value.field === 'grossPnLSum',
      ),
    ).toBe(true);
  });

  it('classifies cost-dominated positive gross edge and computes required multiplier', () => {
    const campaigns = [
      ...Array.from({ length: 16 }, () => campaign(10, 8)),
      ...Array.from({ length: 14 }, () => campaign(-10, -12)),
    ];
    const audit = buildBTC5MImpulsePullbackFeasibilityAudit(source(campaigns));
    expect(audit.classification).toBe('CURRENT_1R_GROSS_EDGE_COST_DOMINATED');
    expect(audit.holdout.requiredGrossEdgeMultiplierForNetZero).toBe(3);
    expect(audit.holdout.breakEven.grossExpectancyMultipleNeeded).toBe(3);
  });

  it('treats missing 2R as nonfatal and reads observed 2R comparison without mutation', () => {
    const missing = buildBTC5MImpulsePullbackFeasibilityAudit(source());
    expect(missing.twoRObservedComparison).toEqual({
      twoRComparisonAvailable: false,
      largerWinnerObservedResult: null,
    });
    const twoR = {
      holdout: { grossProfitFactor: 1.2, netProfitFactor: 0.8, tpRate: 0.3 },
      winnerContinuationDiagnostic: { holdout: { oneRToTwoRContinuationRate: 0.4 } },
    };
    const available = buildBTC5MImpulsePullbackFeasibilityAudit(source(), twoR);
    expect(available.twoRObservedComparison).toEqual(
      expect.objectContaining({
        twoRComparisonAvailable: true,
        twoRHoldoutNetPF: 0.8,
        largerWinnerObservedResult: '2R_IMPROVED_NET_ECONOMICS',
      }),
    );
    expect(twoR.holdout.netProfitFactor).toBe(0.8);
    expect(BTC5MImpulsePullbackFeasibilityAudit.auditId).toBe(
      'BTC_5M_IMPULSE_PULLBACK_1R_FEASIBILITY_AUDIT_V1',
    );
  });
});
