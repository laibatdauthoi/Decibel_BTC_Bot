import { readFile } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DECIBEL_SDK_RUNTIME_V1 = 'DECIBEL_SDK_0_7_0_WINDOWS_ESM_COMPATIBILITY_V1';
export const DECIBEL_SDK_REQUIRED_VERSION_V1 = '0.7.0';

type sdk_runtime_symbols_v1 = Readonly<{
  DecibelWriteDex: typeof import('@decibeltrade/sdk').DecibelWriteDex;
  DecibelReadDex: typeof import('@decibeltrade/sdk').DecibelReadDex;
  MAINNET_CONFIG: typeof import('@decibeltrade/sdk').MAINNET_CONFIG;
}>;

export type decibel_sdk_preflight_result_v1 = Readonly<{
  status: 'PASS';
  sdkVersion: '0.7.0';
  nodeVersion: string;
  platform: NodeJS.Platform;
  architecture: string;
  sdkEntrypoint: string;
  writerEntrypoint: string;
  mutationInvocations: 0;
  venueMutations: 0;
  signedTransactions: 0;
}>;

type sdk_resolution_v1 = Readonly<{
  packageRoot: string;
  packageDistUrl: string;
  sdkEntrypoint: string;
  writerEntrypoint: string;
  sdkVersion: string;
}>;

let HooksRegistered = false;
let SymbolsPromise: Promise<sdk_runtime_symbols_v1> | null = null;

function fail(blocker: string): never {
  throw new Error(blocker);
}

async function resolveSdk(): Promise<sdk_resolution_v1> {
  const ProjectRequire = createRequire(pathToFileURL(path.resolve('package.json')));
  const sdkEntrypoint = ProjectRequire.resolve('@decibeltrade/sdk');
  const packageRoot = path.resolve(path.dirname(sdkEntrypoint), '..');
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const packageDocument: unknown = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  if (
    typeof packageDocument !== 'object' ||
    packageDocument === null ||
    !('version' in packageDocument) ||
    typeof packageDocument.version !== 'string'
  )
    return fail('SDK_RUNTIME_UNAVAILABLE');
  return Object.freeze({
    packageRoot,
    packageDistUrl: `${pathToFileURL(path.join(packageRoot, 'dist')).href}/`,
    sdkEntrypoint,
    writerEntrypoint: path.join(packageRoot, 'dist', 'write.js'),
    sdkVersion: packageDocument.version,
  });
}

function registerSdkCompatibilityHooks(packageDistUrl: string): void {
  if (HooksRegistered) return;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      let result;
      try {
        result = nextResolve(specifier, context);
      } catch (error) {
        const isSdkRelativeImport =
          context.parentURL?.startsWith(packageDistUrl) === true &&
          (specifier.startsWith('./') || specifier.startsWith('../'));
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          error.code !== 'ERR_MODULE_NOT_FOUND' ||
          !isSdkRelativeImport
        )
          throw error;
        result = nextResolve(`${specifier}.js`, context);
      }
      if (context.parentURL?.startsWith(packageDistUrl) === true && result.url.endsWith('.json'))
        return { ...result, importAttributes: { type: 'json' } };
      return result;
    },
  });
  HooksRegistered = true;
}

export function validateDecibelSdkVersionV1(version: string): void {
  if (version !== DECIBEL_SDK_REQUIRED_VERSION_V1) throw new Error('DECIBEL_SDK_VERSION_MISMATCH');
}

export async function loadDecibelSdkRuntimeV1(): Promise<sdk_runtime_symbols_v1> {
  if (SymbolsPromise !== null) return SymbolsPromise;
  SymbolsPromise = (async () => {
    try {
      const resolution = await resolveSdk();
      validateDecibelSdkVersionV1(resolution.sdkVersion);
      registerSdkCompatibilityHooks(resolution.packageDistUrl);
      const sdk = await import('@decibeltrade/sdk');
      if (
        typeof sdk.DecibelWriteDex !== 'function' ||
        typeof sdk.DecibelReadDex !== 'function' ||
        typeof sdk.MAINNET_CONFIG !== 'object'
      )
        return fail('SDK_RUNTIME_UNAVAILABLE');
      return Object.freeze({
        DecibelWriteDex: sdk.DecibelWriteDex,
        DecibelReadDex: sdk.DecibelReadDex,
        MAINNET_CONFIG: sdk.MAINNET_CONFIG,
      });
    } catch (error) {
      SymbolsPromise = null;
      if (error instanceof Error && error.message === 'DECIBEL_SDK_VERSION_MISMATCH') throw error;
      throw new Error('SDK_RUNTIME_UNAVAILABLE', { cause: error });
    }
  })();
  return SymbolsPromise;
}

export async function runDecibelSdkPreflightV1(): Promise<decibel_sdk_preflight_result_v1> {
  const resolution = await resolveSdk();
  validateDecibelSdkVersionV1(resolution.sdkVersion);
  await loadDecibelSdkRuntimeV1();
  return Object.freeze({
    status: 'PASS',
    sdkVersion: DECIBEL_SDK_REQUIRED_VERSION_V1,
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    sdkEntrypoint: resolution.sdkEntrypoint,
    writerEntrypoint: resolution.writerEntrypoint,
    mutationInvocations: 0,
    venueMutations: 0,
    signedTransactions: 0,
  });
}
