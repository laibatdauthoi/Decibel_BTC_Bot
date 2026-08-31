import { readFileSync } from 'node:fs';

import {
  MINIMAL_LIVE_CANARY_SPEC_READY,
  runDecibelMinimalLiveCanaryDryRunV1,
} from './decibel_minimal_live_canary_v1.js';

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const executionMode = argument('--execution-mode');
if (executionMode === 'LIVE') throw new Error('LIVE_EXECUTION_DISABLED');
if (executionMode !== 'AUTHENTICATED_DRY_RUN')
  throw new Error('CANARY_AUTHENTICATED_DRY_RUN_MODE_REQUIRED');
const configPath = argument('--canary-config');
if (configPath === null) throw new Error('CANARY_CONFIG_PATH_REQUIRED');
const input: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
const result = runDecibelMinimalLiveCanaryDryRunV1(
  input as Parameters<typeof runDecibelMinimalLiveCanaryDryRunV1>[0],
);
console.log(
  JSON.stringify(
    {
      MINIMAL_LIVE_CANARY_SPEC_READY: MINIMAL_LIVE_CANARY_SPEC_READY ? 'YES' : 'NO',
      CANARY_DRY_RUN_READY: result.canaryDryRunReady ? 'YES' : 'NO',
      LIVE_EXECUTION_ENABLED: false,
      ...result,
    },
    null,
    2,
  ),
);
