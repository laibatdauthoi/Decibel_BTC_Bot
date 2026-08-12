import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBTC5MImpulsePullbackFeasibilityAudit } from './btc_5m_impulse_pullback_feasibility_audit.js';

export function readRequiredPullback1RReport(sourcePath: string): unknown {
  if (!existsSync(sourcePath)) throw new Error('BTC_5M_IMPULSE_PULLBACK_1R_REPORT_UNAVAILABLE');
  return JSON.parse(readFileSync(sourcePath, 'utf8')) as unknown;
}

export function runBTC5MImpulsePullbackFeasibilityAuditCommand(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    sourcePath = path.join(root, 'data', 'btc_price_action', 'btc_5m_impulse_pullback_1r_v1.json'),
    twoRPath = path.join(root, 'data', 'btc_price_action', 'btc_5m_impulse_pullback_2r_v1.json');
  const source = readRequiredPullback1RReport(sourcePath),
    twoR: unknown = existsSync(twoRPath) ? JSON.parse(readFileSync(twoRPath, 'utf8')) : undefined,
    report = buildBTC5MImpulsePullbackFeasibilityAudit(source, twoR),
    output = path.join(
      root,
      'data',
      'btc_price_action',
      'btc_5m_impulse_pullback_1r_feasibility_audit_v1.json',
    );
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  const line = (label: string, value: unknown) => console.log(`${label}: ${String(value)}`),
    holdout = report.holdout;
  console.log('=== BTC 5M IMPULSE PULLBACK 1R FEASIBILITY AUDIT ===');
  console.log('HOLDOUT');
  line('Completed', holdout.campaignCounts.completedCampaignCount);
  line('TP rate', holdout.basicEconomics.tpRate);
  line('GrossPF', holdout.basicEconomics.grossProfitFactor);
  line('NetPF', holdout.basicEconomics.netProfitFactor);
  line('Gross PnL', holdout.basicEconomics.grossPnLSum);
  line('Net PnL', holdout.basicEconomics.netPnLSum);
  line('Total fees', holdout.feeBurden.totalFeesSum);
  line('Mean gross expectancy / trade', holdout.breakEven.currentMeanGrossExpectancy);
  line('Mean fee / trade', holdout.breakEven.currentMeanFee);
  line('Gross expectancy multiple needed', holdout.breakEven.grossExpectancyMultipleNeeded);
  line('Actual TP rate', holdout.breakEven.actualTpRate);
  line('Break-even TP rate', holdout.breakEven.breakEvenWinRate);
  line('Win-rate gap', holdout.breakEven.winRateGapPercentagePoints);
  line('Median risk bps', holdout.riskDistanceBps.median);
  line('Median fee bps', holdout.feeBpsOnEntryNotional.median);
  line('Median fee in R', holdout.feeInR.median);
  line('Gross edge coverage of fees', holdout.economicEdgeCoverage);
  line(
    'Additional gross PnL needed for net zero',
    holdout.breakEven.additionalGrossPnLRequiredForNetBreakEven,
  );
  console.log('FEE-IN-R THRESHOLDS');
  console.log(JSON.stringify(holdout.feeInR.thresholds, null, 2));
  console.log('WINNER FEE BURDEN');
  console.log(JSON.stringify(holdout.winnerFeeBurden, null, 2));
  console.log('OVERALL');
  console.log(JSON.stringify(report.overall.basicEconomics, null, 2));
  console.log('OBSERVED 1R vs 2R');
  console.log(JSON.stringify(report.twoRObservedComparison, null, 2));
  line('Classification', report.classification);
  line('Report', output);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    runBTC5MImpulsePullbackFeasibilityAuditCommand();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown BTC feasibility audit failure');
    process.exitCode = 1;
  }
}
