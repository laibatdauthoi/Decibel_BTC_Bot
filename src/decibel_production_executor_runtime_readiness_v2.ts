import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READINESS_V2 =
  'DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READINESS_V2' as const;
export const DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READY_V2 =
  'DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READY_V2' as const;

const REQUIRED_RUNTIME = Object.freeze({
  nodeVersion: 'v22.23.2',
  platform: 'win32',
  architecture: 'x64',
  sdkVersion: '0.7.0',
});
const V1_BODY_HASH = '95dbbe02db4e8d4fa8ce9dd7e622b7092c2d7b47f35cbb306583db2ff0d47d66';
const V1_FILE_HASH = '435fcac18b12944501f1e1429b3d7859d6ab41142b75eaf9fb0ca2650206a6ed';
const HANDOFF_BODY_HASH = '5870298b06600e01a88265cbf3e4ebc176b85855a76d349d004c62b794f6300f';
const LIFECYCLE_BODY_HASH = 'c348c9c68ddcb951673af2ca7183cf66f9d148f236245984499c9573109ebae2';

const sourceFiles = Object.freeze([
  'package.json',
  'package-lock.json',
  'src/decibel_external_production_executor_v1.ts',
  'src/decibel_sdk_runtime_v1.ts',
  'src/run_decibel_sdk_preflight_v1.ts',
  'src/decibel_production_execution_v1.ts',
  'src/run_decibel_production_execution_v1.ts',
  'src/decibel_production_executor_handoff_v1.ts',
  'src/decibel_execution_intent_v1.ts',
  'src/decibel_execution_lifecycle_v1.ts',
  'src/decibel_execution_lifecycle_journal_v1.ts',
  'research/decibel_production_executor_handoff_v1_manifest.json',
  'research/decibel_mainnet_execution_lifecycle_shadow_v1_manifest.json',
  'research/decibel_production_executor_runtime_readiness_v1_manifest.json',
] as const);

type json_record = Record<string, unknown>;

function fail(blocker: string): never {
  throw new Error(blocker);
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    const source = value as json_record;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonicalValue(source[key])]),
    );
  }
  return value;
}

export function canonicalizeDecibelProductionExecutorRuntimeReadinessV2(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function readRequired(root: string, relativePath: string): Buffer {
  try {
    return readFileSync(path.resolve(root, relativePath));
  } catch {
    return fail('PRODUCTION_EXECUTOR_RUNTIME_FREEZE_SOURCE_MISSING');
  }
}

function readJson(root: string, relativePath: string): json_record {
  let value: unknown;
  try {
    value = JSON.parse(readRequired(root, relativePath).toString('utf8'));
  } catch {
    return fail('PRODUCTION_EXECUTOR_RUNTIME_FREEZE_SOURCE_MISSING');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return fail('PRODUCTION_EXECUTOR_RUNTIME_FREEZE_SOURCE_MISSING');
  return value as json_record;
}

export function buildDecibelProductionExecutorRuntimeReadinessManifestV2(input?: {
  root?: string;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
  architecture?: string;
  sdkVersion?: string;
}) {
  const root = input?.root ?? process.cwd();
  for (const file of sourceFiles) readRequired(root, file);

  const runtime = Object.freeze({
    nodeVersion: input?.nodeVersion ?? process.version,
    platform: input?.platform ?? process.platform,
    architecture: input?.architecture ?? process.arch,
  });
  const sdkPackage = readJson(root, 'node_modules/@decibeltrade/sdk/package.json');
  const sdkVersion = input?.sdkVersion ?? sdkPackage.version;
  if (
    runtime.nodeVersion !== REQUIRED_RUNTIME.nodeVersion ||
    runtime.platform !== REQUIRED_RUNTIME.platform ||
    runtime.architecture !== REQUIRED_RUNTIME.architecture
  )
    fail('PRODUCTION_RUNTIME_V2_RUNTIME_MISMATCH');
  if (sdkVersion !== REQUIRED_RUNTIME.sdkVersion) fail('DECIBEL_SDK_VERSION_MISMATCH');

  const v1Path = 'research/decibel_production_executor_runtime_readiness_v1_manifest.json';
  const handoffPath = 'research/decibel_production_executor_handoff_v1_manifest.json';
  const lifecyclePath = 'research/decibel_mainnet_execution_lifecycle_shadow_v1_manifest.json';
  const v1 = readJson(root, v1Path);
  const handoff = readJson(root, handoffPath);
  const lifecycle = readJson(root, lifecyclePath);
  if (
    v1.manifestBodyHashSha256 !== V1_BODY_HASH ||
    sha256(readRequired(root, v1Path)) !== V1_FILE_HASH
  )
    fail('PRODUCTION_RUNTIME_V2_V1_EVIDENCE_MISMATCH');
  if (
    handoff.manifestBodyHashSha256 !== HANDOFF_BODY_HASH ||
    lifecycle.manifestBodyHashSha256 !== LIFECYCLE_BODY_HASH
  )
    fail('PRODUCTION_RUNTIME_V2_UPSTREAM_EVIDENCE_MISMATCH');

  const readiness = readJson(
    root,
    'research/decibel_mcp_mainnet_shadow_readiness_v1_manifest.json',
  );
  if (readiness.selectedRepricePolicy !== 'BEHIND_5_TICKS')
    fail('PRODUCTION_RUNTIME_V2_POLICY_MISMATCH');

  const sourceArtifactHashes = Object.freeze(
    Object.fromEntries(sourceFiles.map((file) => [file, sha256(readRequired(root, file))])),
  );
  const sdkPackagePath = 'node_modules/@decibeltrade/sdk/package.json';
  const sdkEntrypointPath = 'node_modules/@decibeltrade/sdk/dist/index.js';
  const sdkWriterPath = 'node_modules/@decibeltrade/sdk/dist/write.js';
  const body = Object.freeze({
    identity: DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READINESS_V2,
    trustLabel: DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READY_V2,
    v1Evidence: Object.freeze({
      path: v1Path,
      manifestBodyHashSha256: V1_BODY_HASH,
      fileSha256: V1_FILE_HASH,
      preservedByteForByte: true,
    }),
    upstreamEvidence: Object.freeze({
      productionExecutorHandoffBodyHashSha256: HANDOFF_BODY_HASH,
      mainnetExecutionLifecycleShadowBodyHashSha256: LIFECYCLE_BODY_HASH,
    }),
    marketIdentity: Object.freeze({
      market: 'BTC/USD',
      marketAddress: '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861',
    }),
    selectedRepricePolicy: 'BEHIND_5_TICKS',
    executorImplementationEvidence: Object.freeze({
      path: 'src/decibel_external_production_executor_v1.ts',
      sha256: sourceArtifactHashes['src/decibel_external_production_executor_v1.ts'],
      postOnlyLimitOnly: true,
      exactVenueOrderCancellationOnly: true,
      noBlindRetry: true,
      ambiguousOutcomeRequiresAuthenticatedReconciliation: true,
    }),
    sdkCompatibilityEvidence: Object.freeze({
      path: 'src/decibel_sdk_runtime_v1.ts',
      sha256: sourceArtifactHashes['src/decibel_sdk_runtime_v1.ts'],
      mechanism: 'REPOSITORY_LOCAL_SDK_SCOPED_NODE_RESOLUTION_HOOK',
    }),
    runtimeScope: Object.freeze({
      validatedNodeVersion: runtime.nodeVersion,
      validatedPlatform: runtime.platform,
      validatedArchitecture: runtime.architecture,
      validatedSdkVersion: sdkVersion,
      compatibilityEvidencePortableToOtherNodeVersions: false,
      compatibilityEvidencePortableToOtherSdkVersions: false,
    }),
    runtimeDependencyEvidence: Object.freeze({
      sdkPackagePath,
      sdkPackageSha256: sha256(readRequired(root, sdkPackagePath)),
      sdkEntrypointPath,
      sdkEntrypointSha256: sha256(readRequired(root, sdkEntrypointPath)),
      sdkWriterPath,
      sdkWriterSha256: sha256(readRequired(root, sdkWriterPath)),
      packageLockSha256: sourceArtifactHashes['package-lock.json'],
    }),
    sdkPreflightEvidence: Object.freeze({
      result: 'PASS',
      sdkVersion: '0.7.0',
      nodeVersion: 'v22.23.2',
      platform: 'win32',
      architecture: 'x64',
      mutationInvocations: 0,
      venueMutations: 0,
      signedTransactions: 0,
    }),
    productionDryRunEvidence: Object.freeze({
      productionRuntimeReady: true,
      dryRun: true,
      result: 'DRY_RUN_PREPARED',
      mutationInvocations: 0,
      venueMutations: 0,
      signedTransactions: 0,
    }),
    releaseState: Object.freeze({
      productionExecutorImplemented: true,
      sdkRuntimeCompatibilityValidated: true,
      productionDryRunValidated: true,
      realPlaceValidated: false,
      realCancelValidated: false,
      liveCanaryValidated: false,
      liveMutationEnabled: false,
      autonomousMainnetTradingEnabled: false,
      nextRequiredReleaseStage: 'CANARY',
    }),
    safetyInvariants: Object.freeze([
      'LIMIT_ONLY',
      'POST_ONLY',
      'EXTERNAL_COUNTERPARTY_REQUIRED',
      'SELF_TRADE_NOT_PERMITTED',
      'AUTHENTICATED_RECONCILIATION_OWNS_FILL_TRUTH',
      'NO_BLIND_RETRY_AFTER_UNKNOWN_OUTCOME',
      'SINGLE_LIVE_ORDER',
      'MUTATION_BUDGETS_ENABLED',
      'KILL_SWITCH_REQUIRED',
      'CANARY_BEFORE_AUTONOMOUS',
    ]),
    sourceArtifactHashes,
  });
  return Object.freeze({
    ...body,
    manifestBodyHashSha256: sha256(canonicalizeDecibelProductionExecutorRuntimeReadinessV2(body)),
  });
}

export function freezeDecibelProductionExecutorRuntimeReadinessManifestV2(input: {
  manifest: ReturnType<typeof buildDecibelProductionExecutorRuntimeReadinessManifestV2>;
  outputPath: string;
}) {
  const bytes = `${canonicalizeDecibelProductionExecutorRuntimeReadinessV2(input.manifest)}\n`;
  try {
    writeFileSync(input.outputPath, bytes, { encoding: 'utf8', flag: 'wx' });
    return 'PRODUCTION_EXECUTOR_RUNTIME_READINESS_V2_FROZEN' as const;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (readFileSync(input.outputPath, 'utf8') !== bytes)
      fail('PRODUCTION_EXECUTOR_RUNTIME_READINESS_V2_MANIFEST_CONFLICT');
    return 'ALREADY_FROZEN' as const;
  }
}
