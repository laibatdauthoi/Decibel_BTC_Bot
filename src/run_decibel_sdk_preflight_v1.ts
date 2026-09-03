import { runDecibelSdkPreflightV1 } from './decibel_sdk_runtime_v1.js';

try {
  const result = await runDecibelSdkPreflightV1();
  console.log('DECIBEL_SDK_PREFLIGHT=PASS');
  console.log(`SDK_VERSION=${result.sdkVersion}`);
  console.log(`NODE_VERSION=${result.nodeVersion}`);
  console.log(`PLATFORM=${result.platform}`);
  console.log(`ARCHITECTURE=${result.architecture}`);
  console.log(`SDK_ENTRYPOINT=${result.sdkEntrypoint}`);
  console.log(`SDK_WRITER_ENTRYPOINT=${result.writerEntrypoint}`);
  console.log(`MUTATION_INVOCATIONS=${result.mutationInvocations}`);
  console.log(`VENUE_MUTATIONS=${result.venueMutations}`);
  console.log(`SIGNED_TRANSACTIONS=${result.signedTransactions}`);
} catch (error) {
  console.error(
    `DECIBEL_SDK_PREFLIGHT=FAIL:${error instanceof Error ? error.message : 'SDK_RUNTIME_UNAVAILABLE'}`,
  );
  process.exitCode = 1;
}
