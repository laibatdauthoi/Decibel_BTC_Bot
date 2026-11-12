import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  assertDecibelPersistedExecutionModeV1,
  loadDecibelPersistedExecutionModeV1,
} from '../src/decibel_persisted_execution_mode_v1.js';
import { handleDecibelExecutionModeRequestV1 } from '../src/run_decibel_production_web_v1.js';

function writeEnvironment(path: string, dryRun = true): void {
  writeFileSync(
    path,
    [
      'DECIBEL_EXECUTION_MODE=production',
      'DECIBEL_EXECUTION_RELEASE_STAGE=CANARY',
      'DECIBEL_EXECUTOR_ENABLED=true',
      `DECIBEL_EXECUTOR_DRY_RUN=${String(dryRun)}`,
      'TRADING_MODE=mainnet',
      'LIVE_TRADING_ENABLED=true',
      '',
    ].join('\n'),
  );
}

function environment(path: string, dryRun = true): NodeJS.ProcessEnv {
  return {
    DECIBEL_ENV_PATH: path,
    DECIBEL_EXECUTION_MODE: 'production',
    DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
    DECIBEL_EXECUTOR_ENABLED: 'true',
    DECIBEL_EXECUTOR_DRY_RUN: String(dryRun),
    TRADING_MODE: 'mainnet',
    LIVE_TRADING_ENABLED: 'true',
  };
}

describe('Decibel persisted execution mode V1', () => {
  it('uses the six environment fields and ignores persisted-mode drift', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-execution-mode-')), '.env');
    writeEnvironment(path, false);
    const loaded = loadDecibelPersistedExecutionModeV1(environment(path, false));
    expect(loaded.mode).toMatchObject({
      executionMode: 'production',
      releaseStage: 'CANARY',
      executorEnabled: true,
      dryRun: false,
      tradingMode: 'mainnet',
      liveTradingEnabled: true,
      source: `ENV_FILE:${path}`,
    });
    expect(() =>
      assertDecibelPersistedExecutionModeV1(loaded.environment, loaded.mode),
    ).not.toThrow();
  });

  it('rejects a child environment that differs from the immutable startup mode', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-execution-mode-')), '.env');
    writeEnvironment(path);
    const loaded = loadDecibelPersistedExecutionModeV1(environment(path));
    expect(() =>
      assertDecibelPersistedExecutionModeV1(
        { ...loaded.environment, DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        loaded.mode,
      ),
    ).toThrow('PRODUCTION_EXECUTION_MODE_ENVIRONMENT_MISMATCH');
  });

  it('detects a complete environment mode change and exposes restart-required', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-execution-mode-')), '.env');
    writeEnvironment(path);
    const loaded = loadDecibelPersistedExecutionModeV1(environment(path)).mode;
    writeEnvironment(path, false);
    const result = handleDecibelExecutionModeRequestV1(
      'GET',
      '/api/execution-mode',
      null,
      path,
      loaded,
    );
    expect(result?.status).toBe(200);
    expect(result?.body).toMatchObject({
      currentMode: { dryRun: true },
      requestedMode: { dryRun: false, source: `ENV_FILE:${path}` },
      restartRequired: true,
    });
  });

  it('rejects API writes because the environment is authoritative', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-execution-mode-')), '.env');
    writeEnvironment(path);
    const before = readFileSync(path, 'utf8');
    const loaded = loadDecibelPersistedExecutionModeV1(environment(path)).mode;
    const result = handleDecibelExecutionModeRequestV1(
      'POST',
      '/api/execution-mode',
      { requestedMode: { dryRun: false } },
      path,
      loaded,
    );
    expect(result?.status).toBe(405);
    expect(result?.body).toEqual({ error: 'EXECUTION_MODE_ENVIRONMENT_AUTHORITATIVE_READ_ONLY' });
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('fails closed when any required environment mode field is missing or inconsistent', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-execution-mode-')), '.env');
    writeEnvironment(path);
    const missing = environment(path);
    delete missing.DECIBEL_EXECUTOR_ENABLED;
    expect(() => loadDecibelPersistedExecutionModeV1(missing)).toThrow();
    expect(() =>
      loadDecibelPersistedExecutionModeV1({
        ...environment(path, false),
        DECIBEL_EXECUTOR_ENABLED: 'false',
      }),
    ).toThrow();
  });
});
