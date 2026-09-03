import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildDecibelProductionExecutorRuntimeReadinessManifestV2,
  canonicalizeDecibelProductionExecutorRuntimeReadinessV2,
  freezeDecibelProductionExecutorRuntimeReadinessManifestV2,
} from '../src/decibel_production_executor_runtime_readiness_v2.js';

const V1_PATH = 'research/decibel_production_executor_runtime_readiness_v1_manifest.json';
const V1_FILE_SHA256 = '435fcac18b12944501f1e1429b3d7859d6ab41142b75eaf9fb0ca2650206a6ed';
const Directories: string[] = [];
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

afterEach(() => {
  for (const directory of Directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('Decibel production executor runtime readiness V2', () => {
  it('chains to the immutable V1 bytes and body hash', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV2();
    expect(sha256(readFileSync(V1_PATH))).toBe(V1_FILE_SHA256);
    expect(manifest.v1Evidence).toEqual({
      path: V1_PATH,
      manifestBodyHashSha256: '95dbbe02db4e8d4fa8ce9dd7e622b7092c2d7b47f35cbb306583db2ff0d47d66',
      fileSha256: V1_FILE_SHA256,
      preservedByteForByte: true,
    });
  });

  it('requires exactly Node 22.23.2 on win32 x64', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV2();
    expect(manifest.runtimeScope).toMatchObject({
      validatedNodeVersion: 'v22.23.2',
      validatedPlatform: 'win32',
      validatedArchitecture: 'x64',
    });
    expect(() =>
      buildDecibelProductionExecutorRuntimeReadinessManifestV2({ nodeVersion: 'v24.11.1' }),
    ).toThrow('PRODUCTION_RUNTIME_V2_RUNTIME_MISMATCH');
    expect(() =>
      buildDecibelProductionExecutorRuntimeReadinessManifestV2({ architecture: 'arm64' }),
    ).toThrow('PRODUCTION_RUNTIME_V2_RUNTIME_MISMATCH');
  });

  it('requires SDK 0.7.0 and marks compatibility evidence non-portable', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV2();
    expect(manifest.runtimeScope.validatedSdkVersion).toBe('0.7.0');
    expect(manifest.runtimeScope.compatibilityEvidencePortableToOtherNodeVersions).toBe(false);
    expect(manifest.runtimeScope.compatibilityEvidencePortableToOtherSdkVersions).toBe(false);
    expect(() =>
      buildDecibelProductionExecutorRuntimeReadinessManifestV2({ sdkVersion: '0.7.1' }),
    ).toThrow('DECIBEL_SDK_VERSION_MISMATCH');
  });

  it('captures current executor, compatibility, and package lock hashes', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV2();
    expect(manifest.executorImplementationEvidence.sha256).toBe(
      sha256(readFileSync('src/decibel_external_production_executor_v1.ts')),
    );
    expect(manifest.sdkCompatibilityEvidence.sha256).toBe(
      sha256(readFileSync('src/decibel_sdk_runtime_v1.ts')),
    );
    expect(manifest.runtimeDependencyEvidence.packageLockSha256).toBe(
      sha256(readFileSync('package-lock.json')),
    );
  });

  it('captures actual installed SDK runtime hashes', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV2();
    expect(manifest.runtimeDependencyEvidence.sdkPackageSha256).toBe(
      sha256(readFileSync('node_modules/@decibeltrade/sdk/package.json')),
    );
    expect(manifest.runtimeDependencyEvidence.sdkEntrypointSha256).toBe(
      sha256(readFileSync('node_modules/@decibeltrade/sdk/dist/index.js')),
    );
    expect(manifest.runtimeDependencyEvidence.sdkWriterSha256).toBe(
      sha256(readFileSync('node_modules/@decibeltrade/sdk/dist/write.js')),
    );
  });

  it('requires zero mutation and signing evidence', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV2();
    expect(manifest.sdkPreflightEvidence).toMatchObject({
      result: 'PASS',
      mutationInvocations: 0,
      venueMutations: 0,
      signedTransactions: 0,
    });
    expect(manifest.productionDryRunEvidence).toMatchObject({
      result: 'DRY_RUN_PREPARED',
      mutationInvocations: 0,
      venueMutations: 0,
      signedTransactions: 0,
    });
  });

  it('keeps every live validation and autonomous release flag false', () => {
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV2();
    expect(manifest.releaseState).toMatchObject({
      realPlaceValidated: false,
      realCancelValidated: false,
      liveCanaryValidated: false,
      liveMutationEnabled: false,
      autonomousMainnetTradingEnabled: false,
      nextRequiredReleaseStage: 'CANARY',
    });
  });

  it('produces a deterministic canonical body hash', () => {
    const first = buildDecibelProductionExecutorRuntimeReadinessManifestV2();
    const second = buildDecibelProductionExecutorRuntimeReadinessManifestV2();
    expect(second).toEqual(first);
    const { manifestBodyHashSha256: bodyHash, ...body } = first;
    expect(bodyHash).toBe(sha256(canonicalizeDecibelProductionExecutorRuntimeReadinessV2(body)));
  });

  it('returns ALREADY_FROZEN for identical evidence', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'runtime-v2-freeze-'));
    Directories.push(directory);
    const outputPath = path.join(directory, 'manifest.json');
    const manifest = buildDecibelProductionExecutorRuntimeReadinessManifestV2();
    expect(
      freezeDecibelProductionExecutorRuntimeReadinessManifestV2({ manifest, outputPath }),
    ).toBe('PRODUCTION_EXECUTOR_RUNTIME_READINESS_V2_FROZEN');
    expect(
      freezeDecibelProductionExecutorRuntimeReadinessManifestV2({ manifest, outputPath }),
    ).toBe('ALREADY_FROZEN');
  });

  it('does not overwrite conflicting V2 evidence', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'runtime-v2-conflict-'));
    Directories.push(directory);
    const outputPath = path.join(directory, 'manifest.json');
    writeFileSync(outputPath, '{}\n');
    expect(() =>
      freezeDecibelProductionExecutorRuntimeReadinessManifestV2({
        manifest: buildDecibelProductionExecutorRuntimeReadinessManifestV2(),
        outputPath,
      }),
    ).toThrow('PRODUCTION_EXECUTOR_RUNTIME_READINESS_V2_MANIFEST_CONFLICT');
    expect(readFileSync(outputPath, 'utf8')).toBe('{}\n');
  });
});
