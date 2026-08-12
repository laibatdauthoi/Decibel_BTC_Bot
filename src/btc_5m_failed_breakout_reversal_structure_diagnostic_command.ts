import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBTC5MFailedBreakoutStructureDiagnostic } from './btc_5m_failed_breakout_reversal_structure_diagnostic.js';
export function runBTC5MFailedBreakoutStructureDiagnosticCommand(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    data = path.join(root, 'data', 'btc_price_action'),
    sourcePath = path.join(data, 'btc_5m_failed_breakout_reversal_5x_cost_v1.json');
  if (!existsSync(sourcePath))
    throw new Error(`FAILED_BREAKOUT_SOURCE_ARTIFACT_MISSING:${sourcePath}`);
  const source: unknown = JSON.parse(readFileSync(sourcePath, 'utf8')),
    report = buildBTC5MFailedBreakoutStructureDiagnostic(source, sourcePath),
    output = path.join(data, 'btc_5m_failed_breakout_reversal_structure_diagnostic_v1.json'),
    line = (k: string, v: unknown) => console.log(`${k}: ${String(v)}`);
  mkdirSync(data, { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log('=== BTC 5M FAILED BREAKOUT STRUCTURE DIAGNOSTIC ===');
  console.log('SOURCE');
  line('Experiment ID', report.sourceExperimentId);
  line('Source consistency', report.sourceConsistency);
  line('Overall completed', report.sourceSummary.sourceCompletedCampaignCount);
  line('Overall GrossPF', report.sourceSummary.sourceOverallGrossProfitFactor);
  line('Overall NetPF', report.sourceSummary.sourceOverallNetProfitFactor);
  line('Holdout completed', report.sourceSummary.sourceHoldoutCompletedCampaignCount);
  line('Holdout GrossPF', report.sourceSummary.sourceHoldoutGrossProfitFactor);
  line('Holdout NetPF', report.sourceSummary.sourceHoldoutNetProfitFactor);
  for (const [label, value] of [
    ['FAILURE SPEED', report.failureSpeed],
    ['FAILURE DEPTH', report.failureDepth],
    ['ENTRY DELAY', report.entryDelay],
  ] as const) {
    console.log(label);
    console.log('Cutpoints', value.discoveryCutpoints);
    console.log('DISCOVERY');
    console.table(value.discovery.buckets);
    console.log('HOLDOUT');
    console.table(value.holdout.buckets);
    line('Discovery direction', value.discoveryDirection);
    line('Holdout direction', value.holdoutDirection);
    line('Direction replicated', value.directionReplicated);
    line('Sample adequate', value.sampleAdequate);
    line('Candidate extreme bucket', value.candidateExtremeBucket);
    line('Extreme GrossPF', value.candidateExtremeGrossProfitFactor);
    line('Extreme NetPF', value.candidateExtremeNetProfitFactor);
    line('Relationship', value.relationshipClassification);
  }
  line('Stable predictors', report.stablePredictors.join(', ') || 'NONE');
  line('Classification', report.classification);
  line('Report', output);
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    runBTC5MFailedBreakoutStructureDiagnosticCommand();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown structure diagnostic failure');
    process.exitCode = 1;
  }
}
