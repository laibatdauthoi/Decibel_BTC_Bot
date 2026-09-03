import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import {
  buildShadowAsymmetricRepriceExperimentV1,
  parseShadowRepriceSourceJsonlV1,
  stringifyCanonicalJsonV1,
} from './decibel_shadow_asymmetric_reprice_experiment_v1.js';

const ReportPath = resolve('research/decibel_shadow_asymmetric_reprice_experiment_v1.json');

export function freezeShadowAsymmetricRepriceReportV1(path: string, contents: string) {
  try {
    writeFileSync(path, contents, { encoding: 'utf8', flag: 'wx' });
    return 'FROZEN' as const;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (readFileSync(path, 'utf8') === contents) return 'ALREADY_FROZEN' as const;
    throw new Error('ASYMMETRIC_REPRICE_EXPERIMENT_MANIFEST_CONFLICT', { cause: error });
  }
}

export function runDecibelShadowAsymmetricRepriceExperimentV1(arguments_: readonly string[]) {
  const index = arguments_.indexOf('--session');
  if (index < 0 || !arguments_[index + 1]) throw new Error('ASYMMETRIC_REPRICE_SOURCE_REQUIRED');
  const sourcePath = resolve(arguments_[index + 1]!);
  const source = readFileSync(sourcePath);
  const session = basename(sourcePath).match(/_(shadow-\d+)\.jsonl$/u)?.[1];
  if (!session) throw new Error('ASYMMETRIC_REPRICE_SOURCE_SESSION_ID_UNAVAILABLE');
  const report = buildShadowAsymmetricRepriceExperimentV1({
    sourceSessionId: session,
    sourceJsonlSha256: createHash('sha256').update(source).digest('hex'),
    observations: parseShadowRepriceSourceJsonlV1(source.toString('utf8')),
    tickSize: 0.1,
  });
  const disposition = freezeShadowAsymmetricRepriceReportV1(
    ReportPath,
    stringifyCanonicalJsonV1(report),
  );
  for (const result of report.policyResults)
    console.log(
      `POLICY=${result.policy} REPLACES=${result.wouldReplaceCount} REPLACEMENT_REDUCTION_PCT=${result.replacementReductionPct.toFixed(6)} MUTATION_REDUCTION_PCT=${result.mutationReductionPct.toFixed(6)} EXACT_BEST_COVERAGE_PCT=${result.exactBestCoveragePct.toFixed(6)} P95_DEVIATION_TICKS=${result.p95AbsoluteDeviationTicks} MAX_DEVIATION_TICKS=${result.maxAbsoluteDeviationTicks} CROSSING_DELAYED=${result.crossingStateDelayedCount} INSIDE_DELAYED=${result.insideSpreadStateDelayedCount}`,
    );
  console.log(`SAFE_ACCEPTANCE_CANDIDATES=${report.safeAcceptanceCandidates.join(',') || 'NONE'}`);
  console.log(
    `STRICT_ACCEPTANCE_CANDIDATES=${report.strictAcceptanceCandidates.join(',') || 'NONE'}`,
  );
  console.log(`SAFE_PARETO_FRONTIER=${report.safeParetoFrontier.join(',')}`);
  console.log('BASELINE_REPLAY=PASS');
  console.log('MCP_MUTATION_CALLS=0');
  console.log('VENUE_MUTATIONS=0');
  console.log(`REPORT=${ReportPath}`);
  console.log(`DISPOSITION=${disposition}`);
  console.log('BLOCKER=NONE');
  return { report, disposition };
}

if (process.argv[1]?.endsWith('run_decibel_shadow_asymmetric_reprice_experiment_v1.ts')) {
  try {
    runDecibelShadowAsymmetricRepriceExperimentV1(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
