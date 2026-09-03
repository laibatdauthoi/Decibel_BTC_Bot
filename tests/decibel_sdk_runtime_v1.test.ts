import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DECIBEL_SDK_REQUIRED_VERSION_V1,
  loadDecibelSdkRuntimeV1,
  runDecibelSdkPreflightV1,
  validateDecibelSdkVersionV1,
} from '../src/decibel_sdk_runtime_v1.js';

describe('Decibel SDK 0.7.0 Windows ESM compatibility V1', () => {
  it('accepts only the pinned SDK version', () => {
    expect(() => validateDecibelSdkVersionV1('0.7.0')).not.toThrow();
    expect(() => validateDecibelSdkVersionV1('0.7.1')).toThrow('DECIBEL_SDK_VERSION_MISMATCH');
    expect(DECIBEL_SDK_REQUIRED_VERSION_V1).toBe('0.7.0');
  });

  it('loads required public symbols without credentials or mutations', async () => {
    const previousPrivateKey = process.env.DECIBEL_PRIVATE_KEY;
    delete process.env.DECIBEL_PRIVATE_KEY;
    try {
      const sdk = await loadDecibelSdkRuntimeV1();
      expect(typeof sdk.DecibelWriteDex).toBe('function');
      expect(sdk.MAINNET_CONFIG).toBeTypeOf('object');
    } finally {
      if (previousPrivateKey === undefined) delete process.env.DECIBEL_PRIVATE_KEY;
      else process.env.DECIBEL_PRIVATE_KEY = previousPrivateKey;
    }
  });

  it('reports actual Windows-safe resolved paths and zero mutation counters', async () => {
    const result = await runDecibelSdkPreflightV1();
    expect(result).toMatchObject({
      status: 'PASS',
      sdkVersion: '0.7.0',
      mutationInvocations: 0,
      venueMutations: 0,
      signedTransactions: 0,
    });
    expect(path.isAbsolute(result.sdkEntrypoint)).toBe(true);
    expect(path.isAbsolute(result.writerEntrypoint)).toBe(true);
    expect(result.sdkEntrypoint.endsWith(path.join('dist', 'index.js'))).toBe(true);
    expect(result.writerEntrypoint.endsWith(path.join('dist', 'write.js'))).toBe(true);
  });

  it('uses the shipped package without repository patches to node_modules', () => {
    const packageDocument = JSON.parse(
      readFileSync('node_modules/@decibeltrade/sdk/package.json', 'utf8'),
    ) as { version?: unknown };
    expect(packageDocument.version).toBe('0.7.0');
    expect(readFileSync('node_modules/@decibeltrade/sdk/dist/index.js', 'utf8')).toContain(
      'export * from "./admin";',
    );
  });
});
