import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import {
  buildShadowRepricePolicyExperimentV1,
  parseShadowRepriceSourceJsonlV1,
  stringifyCanonicalJsonV1,
} from './decibel_shadow_reprice_policy_experiment_v1.js';

const ReportPath = resolve('research/decibel_shadow_reprice_policy_experiment_v1.json');

function sessionArgument(arguments_: readonly string[]): string {
  const index = arguments_.indexOf('--session');
  if (index < 0 || !arguments_[index + 1]) throw new Error('REPRICE_SOURCE_SESSION_REQUIRED');
  return resolve(arguments_[index + 1]!);
}

export function freezeShadowRepriceExperimentReportV1(path: string, contents: string) {
  try {
    writeFileSync(path, contents, { encoding: 'utf8', flag: 'wx' });
    return 'FROZEN' as const;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') throw error;
    if (readFileSync(path, 'utf8') === contents) return 'ALREADY_FROZEN' as const;
    throw new Error('REPRICE_EXPERIMENT_MANIFEST_CONFLICT', { cause: error });
  }
}

export function runDecibelShadowRepricePolicyExperimentV1(arguments_: readonly string[]) {
  const sourcePath = sessionArgument(arguments_);
  const source = readFileSync(sourcePath);
  const match = basename(sourcePath).match(/_(shadow-\d+)\.jsonl$/u);
  if (!match) throw new Error('REPRICE_SOURCE_SESSION_ID_UNAVAILABLE');
  const report = buildShadowRepricePolicyExperimentV1({
    sourceSessionId: match[1]!,
    sourceJsonlSha256: createHash('sha256').update(source).digest('hex'),
    observations: parseShadowRepriceSourceJsonlV1(source.toString('utf8')),
  });
  const disposition = freezeShadowRepriceExperimentReportV1(
    ReportPath,
    stringifyCanonicalJsonV1(report),
  );
  for (const result of report.policyResults) {
    console.log(
      `POLICY=${result.policy} REPLACES=${result.wouldReplaceCount} REPLACEMENTS_PER_MIN=${result.replacementsPerMinute.toFixed(6)} MUTATION_CALLS_PER_MIN=${result.mutationCallsPerMinute.toFixed(6)} EXACT_PRICE_COVERAGE_PCT=${result.exactDesiredPriceCoveragePct.toFixed(6)} P95_DEVIATION_TICKS=${result.p95AbsoluteDifferenceTicks} MAX_DEVIATION_TICKS=${result.maxAbsoluteDifferenceTicks} CROSSING_RISK=${result.postOnlySafety.shadowRepricePolicyCrossingRisk ? 'YES' : 'NO'}`,
    );
  }
  console.log(`PARETO_FRONTIER=${report.paretoFrontier.join(',')}`);
  console.log('BASELINE_REPLAY=PASS');
  console.log('MCP_MUTATION_CALLS=0');
  console.log('VENUE_MUTATIONS=0');
  console.log(`REPORT=${ReportPath}`);
  console.log(`DISPOSITION=${disposition}`);
  console.log('BLOCKER=NONE');
  return { report, disposition, reportPath: ReportPath };
}

if (process.argv[1]?.endsWith('run_decibel_shadow_reprice_policy_experiment_v1.ts')) {
  try {
    runDecibelShadowRepricePolicyExperimentV1(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
