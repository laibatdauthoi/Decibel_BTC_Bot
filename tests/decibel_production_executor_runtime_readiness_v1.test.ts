import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildDecibelProductionExecutorRuntimeReadinessManifestV1,
  canonicalizeDecibelProductionExecutorRuntimeReadinessV1,
  DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READY,
  freezeDecibelProductionExecutorRuntimeReadinessManifestV1,
} from '../src/decibel_production_executor_runtime_readiness_v1.js';

const Directories: string[] = [];
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('Decibel production executor runtime readiness V1', () => {
  it('freezes exact market, policy, trust, and release boundary', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV1();
    expect(manifest.marketIdentity).toEqual({
      market: 'BTC/USD',
      marketAddress: '0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861',
    });
    expect(manifest.selectedRepricePolicy).toBe('BEHIND_5_TICKS');
    expect(manifest.trustLabel).toBe(DECIBEL_PRODUCTION_EXECUTOR_RUNTIME_READY);
    expect(manifest.releaseState).toMatchObject({
      realPlaceValidated: false,
      realCancelValidated: false,
      liveCanaryValidated: false,
      liveMutationEnabled: false,
      autonomousMainnetTradingEnabled: false,
      nextRequiredReleaseStage: 'CANARY',
    });
  });

  it('verifies exact upstream manifest body hashes', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV1();
    expect(manifest.upstreamEvidence).toMatchObject({
      productionExecutorHandoffBodyHashSha256:
        '5870298b06600e01a88265cbf3e4ebc176b85855a76d349d004c62b794f6300f',
      mainnetExecutionLifecycleShadowBodyHashSha256:
        'c348c9c68ddcb951673af2ca7183cf66f9d148f236245984499c9573109ebae2',
    });
  });

  it('captures deterministic source and runtime dependency hashes', () => {
    const first = buildDecibelProductionExecutorRuntimeReadinessManifestV1();
    const second = buildDecibelProductionExecutorRuntimeReadinessManifestV1();
    expect(second.sourceArtifactHashes).toEqual(first.sourceArtifactHashes);
    expect(second.runtimeDependencyEvidence).toEqual(first.runtimeDependencyEvidence);
    expect(first.runtimeDependencyEvidence.packageLockSha256).toBe(
      sha256(readFileSync('package-lock.json')),
    );
  });

  it('freezes exact executor signatures and outcome taxonomy', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV1();
    expect(manifest.executorContract.placeSignature).toContain('place_intent_v1');
    expect(manifest.executorContract.cancelSignature).toContain('cancel_intent_v1');
    expect(manifest.executorContract.placeOutcomes).toEqual([
      'PLACE_ACKNOWLEDGED',
      'PLACE_REJECTED',
      'PLACE_OUTCOME_UNKNOWN',
    ]);
    expect(manifest.executorContract.cancelOutcomes).toEqual([
      'CANCEL_CONFIRMED',
      'CANCEL_REJECTED',
      'CANCEL_OUTCOME_UNKNOWN',
    ]);
  });

  it('requires SDK 0.7.0 and the validated Node runtime tuple', () => {
    expect(() =>
      buildDecibelProductionExecutorRuntimeReadinessManifestV1({ sdkVersion: '0.7.1' }),
    ).toThrow('DECIBEL_SDK_VERSION_MISMATCH');
    expect(() =>
      buildDecibelProductionExecutorRuntimeReadinessManifestV1({ nodeVersion: 'v25.0.0' }),
    ).toThrow('PRODUCTION_EXECUTOR_RUNTIME_FREEZE_RUNTIME_MISMATCH');
  });

  it('records compatibility as non-portable and version scoped', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV1();
    expect(manifest.compatibilityScope).toEqual({
      validatedSdkVersion: '0.7.0',
      validatedNodeVersion: 'v24.11.1',
      validatedPlatform: 'win32',
      validatedArchitecture: 'x64',
      compatibilityEvidencePortableToOtherVersions: false,
    });
  });

  it('requires zero mutations in SDK preflight and production dry run evidence', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV1();
    expect(manifest.sdkPreflightEvidence).toMatchObject({
      status: 'PASS',
      mutationInvocations: 0,
      venueMutations: 0,
      signedTransactions: 0,
    });
    expect(manifest.dryRunEvidence).toMatchObject({
      status: 'PASS',
      mutationInvocations: 0,
      venueMutations: 0,
      signedTransactions: 0,
    });
  });

  it('records current source implementation and package lock hashes', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV1();
    expect(manifest.executorImplementationEvidence.sha256).toBe(
      sha256(readFileSync('src/decibel_external_production_executor_v1.ts')),
    );
    expect(manifest.sourceArtifactHashes['src/decibel_sdk_runtime_v1.ts']).toBe(
      sha256(readFileSync('src/decibel_sdk_runtime_v1.ts')),
    );
  });

  it('computes the body hash without hashing its own field', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV1();
    const { manifestBodyHashSha256: _hash, ...body } = manifest;
    void _hash;
    expect(manifest.manifestBodyHashSha256).toBe(
      sha256(canonicalizeDecibelProductionExecutorRuntimeReadinessV1(body)),
    );
  });

  it('returns ALREADY_FROZEN for an identical rerun', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'executor-runtime-freeze-'));
    Directories.push(directory);
    const outputPath = path.join(directory, 'manifest.json');
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV1();
    expect(
      freezeDecibelProductionExecutorRuntimeReadinessManifestV1({ manifest, outputPath }),
    ).toBe('PRODUCTION_EXECUTOR_RUNTIME_READINESS_FROZEN');
    expect(
      freezeDecibelProductionExecutorRuntimeReadinessManifestV1({ manifest, outputPath }),
    ).toBe('ALREADY_FROZEN');
  });

  it('never overwrites a conflicting existing manifest', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'executor-runtime-conflict-'));
    Directories.push(directory);
    const outputPath = path.join(directory, 'manifest.json');
    writeFileSync(outputPath, '{}\n');
    expect(() =>
      freezeDecibelProductionExecutorRuntimeReadinessManifestV1({
        manifest: buildDecibelProductionExecutorRuntimeReadinessManifestV1(),
        outputPath,
      }),
    ).toThrow('PRODUCTION_EXECUTOR_RUNTIME_READINESS_MANIFEST_CONFLICT');
    expect(readFileSync(outputPath, 'utf8')).toBe('{}\n');
  });

  it('records runtime dependencies as evidence without requiring node_modules changes', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV1();
    expect(manifest.runtimeDependencyEvidence.sdkEntrypointSha256).toBe(
      sha256(readFileSync('node_modules/@decibeltrade/sdk/dist/index.js')),
    );
    expect(manifest.runtimeDependencyEvidence.writerEntrypointSha256).toBe(
      sha256(readFileSync('node_modules/@decibeltrade/sdk/dist/write.js')),
    );
  });
});
