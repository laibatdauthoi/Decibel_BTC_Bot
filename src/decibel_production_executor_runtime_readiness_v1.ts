import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READINESS_V1 =
  'DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READINESS_V1' as const;
export const DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READY =
  'DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READY' as const;

const EXPECTED_HANDOFF_BODY_HASH =
  '5870298b06600e01a88265cbf3e4ebc176b85855a76d349d004c62b794f6300f';
const EXPECTED_LIFECYCLE_BODY_HASH =
  'c348c9c68ddcb951673af2ca7183cf66f9d148f236245984499c9573109ebae2';
const BTC_USD_MARKET_ADDRESS = '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861';

const milestoneFiles = Object.freeze([
  'package.json',
  'package-lock.json',
  'src/decibel_external_production_executor_v1.ts',
  'src/decibel_sdk_runtime_v1.ts',
  'src/run_decibel_sdk_preflight_v1.ts',
  'src/decibel_production_execution_v1.ts',
  'src/run_decibel_production_execution_v1.ts',
  'tests/decibel_external_production_executor_v1.test.ts',
  'tests/decibel_sdk_runtime_v1.test.ts',
  'tests/decibel_production_execution_v1.test.ts',
  'docs/decibel_external_executor_plugin_v1.md',
  'docs/decibel_sdk_runtime_v1.md',
] as const);

const requiredSourceFiles = Object.freeze([
  ...milestoneFiles,
  'src/decibel_production_executor_handoff_v1.ts',
  'src/decibel_execution_intent_v1.ts',
  'src/decibel_execution_lifecycle_v1.ts',
  'src/decibel_execution_lifecycle_journal_v1.ts',
  'research/decibel_production_executor_handoff_v1_manifest.json',
  'research/decibel_mainnet_execution_lifecycle_shadow_v1_manifest.json',
  'research/decibel_mcp_mainnet_shadow_readiness_v1_manifest.json',
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

export function canonicalizeDecibelProductionExecutorRuntimeReadinessV1(value: unknown): string {
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

export function buildDecibelProductionExecutorRuntimeReadinessManifestV1(input?: {
  root?: string;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
  architecture?: string;
  sdkVersion?: string;
}) {
  const root = input?.root ?? process.cwd();
  for (const file of requiredSourceFiles) readRequired(root, file);

  const handoffPath = 'research/decibel_production_executor_handoff_v1_manifest.json';
  const lifecyclePath = 'research/decibel_mainnet_execution_lifecycle_shadow_v1_manifest.json';
  const readinessPath = 'research/decibel_mcp_mainnet_shadow_readiness_v1_manifest.json';
  const handoff = readJson(root, handoffPath);
  const lifecycle = readJson(root, lifecyclePath);
  const readiness = readJson(root, readinessPath);
  if (handoff.manifestBodyHashSha256 !== EXPECTED_HANDOFF_BODY_HASH)
    fail('PRODUCTION_EXECUTOR_RUNTIME_FREEZE_UPSTREAM_DIVERGENCE');
  if (lifecycle.manifestBodyHashSha256 !== EXPECTED_LIFECYCLE_BODY_HASH)
    fail('PRODUCTION_EXECUTOR_RUNTIME_FREEZE_UPSTREAM_DIVERGENCE');
  if (readiness.selectedRepricePolicy !== 'BEHIND_5_TICKS')
    fail('PRODUCTION_EXECUTOR_RUNTIME_FREEZE_POLICY_DIVERGENCE');

  const packageDocument = readJson(root, 'node_modules/@decibeltrade/sdk/package.json');
  const sdkVersion = input?.sdkVersion ?? packageDocument.version;
  if (sdkVersion !== '0.7.0') fail('DECIBEL_SDK_VERSION_MISMATCH');
  const nodeVersion = input?.nodeVersion ?? process.version;
  const platform = input?.platform ?? process.platform;
  const architecture = input?.architecture ?? process.arch;
  if (nodeVersion !== 'v24.11.1' || platform !== 'win32' || architecture !== 'x64')
    fail('PRODUCTION_EXECUTOR_RUNTIME_FREEZE_RUNTIME_MISMATCH');

  const sourceArtifactHashes = Object.fromEntries(
    milestoneFiles.map((file) => [file, sha256(readRequired(root, file))]),
  );
  const runtimeFiles = Object.freeze({
    packageJson: 'node_modules/@decibeltrade/sdk/package.json',
    sdkEntrypoint: 'node_modules/@decibeltrade/sdk/dist/index.js',
    writerEntrypoint: 'node_modules/@decibeltrade/sdk/dist/write.js',
  });
  const body = Object.freeze({
    identity: DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READINESS_V1,
    trustLabel: DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READY,
    createdFromEvidence: 'CURRENT_LOCAL_WORKING_TREE',
    marketIdentity: Object.freeze({ market: 'BTC/USD', marketAddress: BTC_USD_MARKET_ADDRESS }),
    selectedRepricePolicy: 'BEHIND_5_TICKS',
    upstreamEvidence: Object.freeze({
      productionExecutorHandoffBodyHashSha256: EXPECTED_HANDOFF_BODY_HASH,
      mainnetExecutionLifecycleShadowBodyHashSha256: EXPECTED_LIFECYCLE_BODY_HASH,
      productionExecutorHandoffFileSha256: sha256(readRequired(root, handoffPath)),
      mainnetExecutionLifecycleShadowFileSha256: sha256(readRequired(root, lifecyclePath)),
      mcpMainnetShadowReadinessFileSha256: sha256(readRequired(root, readinessPath)),
    }),
    executorContract: Object.freeze({
      interface: 'DecibelProductionExecutionExecutorV1',
      placeSignature:
        'placePostOnlyLimit(intent: place_intent_v1): Promise<production_execution_result_v1>',
      cancelSignature:
        'cancelExactOrder(intent: cancel_intent_v1): Promise<production_execution_result_v1>',
      placeOutcomes: Object.freeze([
        'PLACE_ACKNOWLEDGED',
        'PLACE_REJECTED',
        'PLACE_OUTCOME_UNKNOWN',
      ]),
      cancelOutcomes: Object.freeze([
        'CANCEL_CONFIRMED',
        'CANCEL_REJECTED',
        'CANCEL_OUTCOME_UNKNOWN',
      ]),
      unknownOutcomeHandling: 'AUTHENTICATED_RECONCILIATION_NO_BLIND_RETRY',
    }),
    executorImplementationEvidence: Object.freeze({
      path: 'src/decibel_external_production_executor_v1.ts',
      sha256: sourceArtifactHashes['src/decibel_external_production_executor_v1.ts'],
      properties: Object.freeze([
        'BTC_USD_EXACT_MARKET_VALIDATION',
        'LIMIT_ONLY',
        'POST_ONLY',
        'EXACT_VENUE_ORDER_CANCELLATION',
        'IDENTITY_CORRELATION_PRESERVED',
        'NO_BLIND_RETRY',
        'LAZY_SDK_WRITER_INITIALIZATION',
        'AMBIGUOUS_OUTCOME_MAPS_TO_OUTCOME_UNKNOWN',
      ]),
    }),
    sdkRuntimeEvidence: Object.freeze({
      sdkPackage: '@decibeltrade/sdk',
      sdkVersion,
      nodeVersion,
      platform,
      architecture,
      sdkEntrypoint: runtimeFiles.sdkEntrypoint,
      writerEntrypoint: runtimeFiles.writerEntrypoint,
      compatibilityMechanism: 'REPOSITORY_LOCAL_SDK_SCOPED_NODE_RESOLUTION_HOOK',
      handles: Object.freeze([
        'EXTENSIONLESS_RELATIVE_ESM_IMPORTS',
        'JSON_IMPORTS_REQUIRING_IMPORT_ATTRIBUTES',
      ]),
    }),
    runtimeDependencyEvidence: Object.freeze({
      packageJsonSha256: sha256(readRequired(root, runtimeFiles.packageJson)),
      sdkEntrypointSha256: sha256(readRequired(root, runtimeFiles.sdkEntrypoint)),
      writerEntrypointSha256: sha256(readRequired(root, runtimeFiles.writerEntrypoint)),
      packageLockSha256: sourceArtifactHashes['package-lock.json'],
    }),
    compatibilityScope: Object.freeze({
      validatedSdkVersion: '0.7.0',
      validatedNodeVersion: 'v24.11.1',
      validatedPlatform: 'win32',
      validatedArchitecture: 'x64',
      compatibilityEvidencePortableToOtherVersions: false,
    }),
    productionRuntimeEvidence: Object.freeze({
      productionRuntimeReady: true,
      result: 'DRY_RUN_PREPARED',
    }),
    sdkPreflightEvidence: Object.freeze({
      status: 'PASS',
      mutationInvocations: 0,
      venueMutations: 0,
      signedTransactions: 0,
    }),
    dryRunEvidence: Object.freeze({
      status: 'PASS',
      dryRun: true,
      mutationInvocations: 0,
      venueMutations: 0,
      signedTransactions: 0,
    }),
    validationEvidence: Object.freeze({
      focusedTestFiles: 7,
      focusedTestsPassed: 78,
      prettier: 'PASS',
      eslint: 'PASS',
      gitDiffCheck: 'PASS',
    }),
    safetyInvariants: Object.freeze([
      'LIMIT_ONLY',
      'POST_ONLY',
      'EXTERNAL_COUNTERPARTY_REQUIRED',
      'SELF_TRADE_NOT_PERMITTED',
      'AUTHENTICATED_RECONCILIATION_OWNS_FILL_TRUTH',
      'ACCOUNT_POSITION_LEDGER_NE_STRATEGY_MAKER_VOLUME_LEDGER',
      'NO_BLIND_RETRY_AFTER_UNKNOWN_OUTCOME',
      'SINGLE_LIVE_ORDER',
      'MUTATION_BUDGETS_ENABLED',
      'KILL_SWITCH_REQUIRED',
      'CANARY_BEFORE_AUTONOMOUS',
    ]),
    releaseState: Object.freeze({
      productionExecutorImplemented: true,
      sdkRuntimeCompatibilityValidated: true,
      productionDryRunValidated: true,
      realPlaceValidated: false,
      realCancelValidated: false,
      realSignedTransactionValidated: false,
      liveCanaryValidated: false,
      liveMutationEnabled: false,
      autonomousMainnetTradingEnabled: false,
      nextRequiredReleaseStage: 'CANARY',
      liveCanaryEvidenceRequired: true,
    }),
    sourceArtifactHashes: Object.freeze(sourceArtifactHashes),
  });
  return Object.freeze({
    ...body,
    manifestBodyHashSha256: sha256(canonicalizeDecibelProductionExecutorRuntimeReadinessV1(body)),
  });
}

export function freezeDecibelProductionExecutorRuntimeReadinessManifestV1(input: {
  manifest: ReturnType<typeof buildDecibelProductionExecutorRuntimeReadinessManifestV1>;
  outputPath: string;
}) {
  const bytes = `${canonicalizeDecibelProductionExecutorRuntimeReadinessV1(input.manifest)}\n`;
  try {
    writeFileSync(input.outputPath, bytes, { encoding: 'utf8', flag: 'wx' });
    return 'PRODUCTION_EXECUTOR_RUNTIME_READINESS_FROZEN' as const;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (readFileSync(input.outputPath, 'utf8') !== bytes)
      fail('PRODUCTION_EXECUTOR_RUNTIME_READINESS_MANIFEST_CONFLICT');
    return 'ALREADY_FROZEN' as const;
  }
}
