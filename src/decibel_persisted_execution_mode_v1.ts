import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { parse as parseDotenv } from 'dotenv';
import { z } from 'zod';

export const DECIBEL_PERSISTED_EXECUTION_MODE_V1 = 'DECIBEL_PERSISTED_EXECUTION_MODE_V1' as const;

const PersistedExecutionModeSchema = z.object({
  schemaVersion: z.literal(DECIBEL_PERSISTED_EXECUTION_MODE_V1),
  executionMode: z.literal('production'),
  releaseStage: z.enum(['DISABLED', 'CANARY', 'AUTONOMOUS']),
  executorEnabled: z.boolean(),
  dryRun: z.boolean(),
  tradingMode: z.enum(['live', 'mainnet']),
  liveTradingEnabled: z.boolean(),
  persistedAt: z.number().int().positive(),
  source: z.string().min(1),
});

const RequestedExecutionModeSchema = PersistedExecutionModeSchema.pick({
  executionMode: true,
  releaseStage: true,
  executorEnabled: true,
  dryRun: true,
  tradingMode: true,
  liveTradingEnabled: true,
}).strict();

const EnvironmentExecutionModeSchema = z
  .object({
    DECIBEL_EXECUTION_MODE: z.literal('production'),
    DECIBEL_EXECUTION_RELEASE_STAGE: z.enum(['DISABLED', 'CANARY', 'AUTONOMOUS']),
    DECIBEL_EXECUTOR_ENABLED: z.enum(['true', 'false']),
    DECIBEL_EXECUTOR_DRY_RUN: z.enum(['true', 'false']),
    TRADING_MODE: z.enum(['live', 'mainnet']),
    LIVE_TRADING_ENABLED: z.enum(['true', 'false']),
  })
  .superRefine((mode, context) => {
    if (mode.LIVE_TRADING_ENABLED === 'true' && mode.TRADING_MODE !== 'mainnet')
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRADING_MODE'],
        message: 'LIVE_TRADING_ENABLED requires TRADING_MODE=mainnet',
      });
    if (mode.DECIBEL_EXECUTOR_DRY_RUN === 'false' && mode.DECIBEL_EXECUTOR_ENABLED !== 'true')
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DECIBEL_EXECUTOR_ENABLED'],
        message: 'Non-dry-run production requires the executor to be enabled',
      });
  });

export type decibel_persisted_execution_mode_v1 = z.infer<typeof PersistedExecutionModeSchema>;
export type decibel_requested_execution_mode_v1 = z.infer<typeof RequestedExecutionModeSchema>;

function parseEnvironmentModeV1(
  environment: NodeJS.ProcessEnv,
  observedAt: number,
  source: string,
): decibel_persisted_execution_mode_v1 {
  const parsed = EnvironmentExecutionModeSchema.parse(environment);
  return Object.freeze(
    PersistedExecutionModeSchema.parse({
      schemaVersion: DECIBEL_PERSISTED_EXECUTION_MODE_V1,
      executionMode: parsed.DECIBEL_EXECUTION_MODE,
      releaseStage: parsed.DECIBEL_EXECUTION_RELEASE_STAGE,
      executorEnabled: parsed.DECIBEL_EXECUTOR_ENABLED === 'true',
      dryRun: parsed.DECIBEL_EXECUTOR_DRY_RUN === 'true',
      tradingMode: parsed.TRADING_MODE,
      liveTradingEnabled: parsed.LIVE_TRADING_ENABLED === 'true',
      persistedAt: Math.max(1, Math.trunc(observedAt)),
      source,
    }),
  );
}

export function readDecibelEnvironmentExecutionModeV1(
  path = '.env',
): decibel_persisted_execution_mode_v1 {
  const resolvedPath = resolve(path);
  const parsed = parseDotenv(readFileSync(resolvedPath));
  return parseEnvironmentModeV1(parsed, statSync(resolvedPath).mtimeMs, `ENV_FILE:${resolvedPath}`);
}

export function executionModesEqualV1(
  left: decibel_persisted_execution_mode_v1 | decibel_requested_execution_mode_v1,
  right: decibel_persisted_execution_mode_v1 | decibel_requested_execution_mode_v1,
): boolean {
  return (
    left.executionMode === right.executionMode &&
    left.releaseStage === right.releaseStage &&
    left.executorEnabled === right.executorEnabled &&
    left.dryRun === right.dryRun &&
    left.tradingMode === right.tradingMode &&
    left.liveTradingEnabled === right.liveTradingEnabled
  );
}

export class decibel_persisted_execution_mode_store_v1 {
  public readonly path: string;

  public constructor(path: string) {
    this.path = resolve(path);
  }

  public read(): decibel_persisted_execution_mode_v1 {
    return Object.freeze(
      PersistedExecutionModeSchema.parse(JSON.parse(readFileSync(this.path, 'utf8')) as unknown),
    );
  }

  public update(
    input: Readonly<{
      expectedPersistedAt: number;
      requestedMode: unknown;
      changedAt?: number;
    }>,
  ): decibel_persisted_execution_mode_v1 {
    const current = this.read();
    if (input.expectedPersistedAt !== current.persistedAt)
      throw new Error('EXECUTION_MODE_REVISION_CONFLICT');
    const requested = RequestedExecutionModeSchema.parse(input.requestedMode);
    const changedAt = Math.max(input.changedAt ?? Date.now(), current.persistedAt + 1);
    const next = Object.freeze(
      PersistedExecutionModeSchema.parse({
        schemaVersion: DECIBEL_PERSISTED_EXECUTION_MODE_V1,
        ...requested,
        persistedAt: changedAt,
        source: 'OPERATOR_API',
      }),
    );
    mkdirSync(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${process.pid}.${changedAt}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    renameSync(temporaryPath, this.path);
    return next;
  }
}

export function loadDecibelPersistedExecutionModeV1(environment: NodeJS.ProcessEnv): Readonly<{
  path: string;
  mode: decibel_persisted_execution_mode_v1;
  environment: NodeJS.ProcessEnv;
}> {
  const path = resolve(environment.DECIBEL_ENV_PATH ?? '.env');
  const mode = parseEnvironmentModeV1(environment, statSync(path).mtimeMs, `ENV_FILE:${path}`);
  return Object.freeze({
    path,
    mode: Object.freeze(mode),
    environment: Object.freeze({
      ...environment,
      DECIBEL_NETWORK: mode.tradingMode === 'mainnet' ? 'mainnet' : environment.DECIBEL_NETWORK,
      DECIBEL_ENV_PATH: path,
    }),
  });
}

export function assertDecibelPersistedExecutionModeV1(
  environment: NodeJS.ProcessEnv,
  expected: decibel_persisted_execution_mode_v1,
): void {
  const actual = {
    executionMode: environment.DECIBEL_EXECUTION_MODE,
    releaseStage: environment.DECIBEL_EXECUTION_RELEASE_STAGE,
    executorEnabled: environment.DECIBEL_EXECUTOR_ENABLED === 'true',
    dryRun: environment.DECIBEL_EXECUTOR_DRY_RUN === 'true',
    tradingMode: environment.TRADING_MODE,
    liveTradingEnabled: environment.LIVE_TRADING_ENABLED === 'true',
  };
  if (
    actual.executionMode !== expected.executionMode ||
    actual.releaseStage !== expected.releaseStage ||
    actual.executorEnabled !== expected.executorEnabled ||
    actual.dryRun !== expected.dryRun ||
    actual.tradingMode !== expected.tradingMode ||
    actual.liveTradingEnabled !== expected.liveTradingEnabled
  )
    throw new Error('PRODUCTION_EXECUTION_MODE_ENVIRONMENT_MISMATCH');
}

export function formatDecibelPersistedExecutionModeV1(
  mode: decibel_persisted_execution_mode_v1,
  path: string,
): string {
  return `DECIBEL_PRODUCTION_EXECUTION_MODE=READY SOURCE=ENV:${path} MODE=${mode.executionMode} RELEASE=${mode.releaseStage} EXECUTOR_ENABLED=${mode.executorEnabled ? 'YES' : 'NO'} DRY_RUN=${mode.dryRun ? 'YES' : 'NO'} TRADING_MODE=${mode.tradingMode} LIVE_TRADING_ENABLED=${mode.liveTradingEnabled ? 'YES' : 'NO'}`;
}
