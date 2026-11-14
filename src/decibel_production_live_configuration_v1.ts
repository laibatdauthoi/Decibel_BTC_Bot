/** Production live configuration: environment schema and parser (split from the orchestrator). */

import { z } from 'zod';

import {
  parseDecibelProductionExecutionConfigV1,
  type decibel_production_release_stage_v1,
} from './decibel_production_execution_v1.js';

/** Mutation attempts per minute (one quote level per side since 2026-11-14). */
export const DECIBEL_PRODUCTION_MUTATION_BUDGET_V1 = Object.freeze({
  placePerMinute: 15,
  cancelPerMinute: 15,
  totalPerMinute: 30,
});

const positiveInteger = z.coerce.number().int().positive();
const ProductionLiveEnvironmentSchema = z.object({
  DECIBEL_EXECUTION_MODE: z.literal('production'),
  DECIBEL_EXECUTION_RELEASE_STAGE: z.enum(['DISABLED', 'CANARY', 'AUTONOMOUS']).default('DISABLED'),
  DECIBEL_EXECUTOR_ENABLED: z.enum(['true', 'false']).default('false'),
  DECIBEL_EXECUTOR_DRY_RUN: z.enum(['true', 'false']).default('false'),
  DECIBEL_PRODUCTION_EXECUTOR_MODULE: z.string().min(1).optional(),
  DECIBEL_PRODUCTION_LIVE_SOURCE_MODULE: z.string().min(1).optional(),
  DECIBEL_EXECUTION_JOURNAL_PATH: z.string().min(1).default('data/decibel_execution_v1.sqlite'),
  DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH: z.string().min(1).optional(),
  DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH: z.string().min(1).optional(),
  DECIBEL_PRODUCTION_LIVE_POLL_INTERVAL_MS: positiveInteger.default(5_000),
  DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS: positiveInteger.default(10_000),
  DECIBEL_PRODUCTION_LIVE_READ_RETRY_COUNT: z.coerce.number().int().min(0).max(3).default(3),
  DECIBEL_PRODUCTION_LIVE_READ_RETRY_BACKOFF_MS: positiveInteger.default(250),
  DECIBEL_PRODUCTION_RATE_LIMIT_BACKOFF_MS: positiveInteger.default(30_000),
  DECIBEL_PRODUCTION_RECONCILIATION_CONFIRMATION_TIMEOUT_MS: positiveInteger.default(10_000),
  DECIBEL_PRODUCTION_MAX_RECONCILIATION_AGE_MS: positiveInteger.default(30_000),
  DECIBEL_PRODUCTION_LIVE_MAX_CONSECUTIVE_READ_FAILURES: positiveInteger.default(3),
  DECIBEL_PRODUCTION_LIVE_SHUTDOWN_TIMEOUT_MS: positiveInteger.default(15_000),
  DECIBEL_PRODUCTION_SUBMISSION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(30_000),
  DECIBEL_PRODUCTION_LIVE_MAX_CYCLES: positiveInteger.optional(),
  DECIBEL_SMART_LADDER_COLLATERAL_FRACTION: z.coerce.number().positive().max(0.5).default(0.5),
  DECIBEL_SMART_LADDER_VOLATILITY_LOOKBACK_MS: positiveInteger.default(900_000),
  DECIBEL_SMART_LADDER_MAX_VOLATILITY_MULTIPLIER: z.coerce.number().min(1).max(3).default(3),
  DECIBEL_PRODUCTION_REQUOTE_HYSTERESIS_FRACTION: z.coerce.number().min(0).max(1).default(0.5),
  DECIBEL_PRODUCTION_REPRICE_MINIMUM_TICKS: positiveInteger.default(50),
  DECIBEL_PRODUCTION_MIN_ACTIVE_ORDER_LIFETIME_MS: z.coerce.number().int().min(0).default(30_000),
  /** Wide venue-side catastrophe stop for offline protection (decibel_catastrophe_stop_v1). */
  DECIBEL_CATASTROPHE_STOP_ENABLED: z.enum(['true', 'false']).default('true'),
  /** New entries must fade the last closed 5-minute candle (decibel_volatility_targets_v1). */
  DECIBEL_ENTRY_CANDLE_FILTER_ENABLED: z.enum(['true', 'false']).default('true'),
});

export type decibel_production_live_configuration_v1 = Readonly<{
  releaseStage: decibel_production_release_stage_v1;
  executorEnabled: boolean;
  dryRun: boolean;
  executorModulePath: string | null;
  sourceModulePath: string | null;
  journalPath: string;
  reconciledCanaryEvidenceHash?: string;
  requiredCanaryEvidenceHash?: string;
  pollIntervalMs: number;
  readTimeoutMs: number;
  readRetryCount: number;
  readRetryBackoffMs: number;
  rateLimitBackoffMs: number;
  reconciliationConfirmationTimeoutMs: number;
  maximumReconciliationAgeMs: number;
  maxConsecutiveReadFailures: number;
  shutdownTimeoutMs: number;
  submissionTimeoutMs: number;
  maxCycles: number | null;
  maximumAggregateCollateralFraction: number;
  volatilityLookbackMs: number;
  maximumVolatilitySpreadMultiplier: number;
  requoteHysteresisFraction: number;
  repriceMinimumTicks: number;
  minimumActiveOrderLifetimeMs: number;
  catastropheStopEnabled: boolean;
  entryCandleFilterEnabled: boolean;
}>;

export function parseDecibelProductionLiveConfigurationV1(
  environment: NodeJS.ProcessEnv,
): decibel_production_live_configuration_v1 {
  const parsed = ProductionLiveEnvironmentSchema.parse(environment);
  const execution = parseDecibelProductionExecutionConfigV1(environment);
  return Object.freeze({
    releaseStage: execution.releaseStage,
    executorEnabled: execution.executorEnabled,
    dryRun: execution.dryRun,
    executorModulePath: execution.modulePath,
    sourceModulePath: parsed.DECIBEL_PRODUCTION_LIVE_SOURCE_MODULE ?? null,
    journalPath: parsed.DECIBEL_EXECUTION_JOURNAL_PATH,
    ...(execution.canaryEvidenceHash
      ? { reconciledCanaryEvidenceHash: execution.canaryEvidenceHash }
      : {}),
    ...(execution.requiredCanaryEvidenceHash
      ? { requiredCanaryEvidenceHash: execution.requiredCanaryEvidenceHash }
      : {}),
    pollIntervalMs: parsed.DECIBEL_PRODUCTION_LIVE_POLL_INTERVAL_MS,
    readTimeoutMs: parsed.DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS,
    readRetryCount: parsed.DECIBEL_PRODUCTION_LIVE_READ_RETRY_COUNT,
    readRetryBackoffMs: parsed.DECIBEL_PRODUCTION_LIVE_READ_RETRY_BACKOFF_MS,
    rateLimitBackoffMs: parsed.DECIBEL_PRODUCTION_RATE_LIMIT_BACKOFF_MS,
    reconciliationConfirmationTimeoutMs:
      parsed.DECIBEL_PRODUCTION_RECONCILIATION_CONFIRMATION_TIMEOUT_MS,
    maximumReconciliationAgeMs: parsed.DECIBEL_PRODUCTION_MAX_RECONCILIATION_AGE_MS,
    maxConsecutiveReadFailures: parsed.DECIBEL_PRODUCTION_LIVE_MAX_CONSECUTIVE_READ_FAILURES,
    shutdownTimeoutMs: parsed.DECIBEL_PRODUCTION_LIVE_SHUTDOWN_TIMEOUT_MS,
    submissionTimeoutMs: parsed.DECIBEL_PRODUCTION_SUBMISSION_TIMEOUT_MS,
    maxCycles: parsed.DECIBEL_PRODUCTION_LIVE_MAX_CYCLES ?? null,
    maximumAggregateCollateralFraction: parsed.DECIBEL_SMART_LADDER_COLLATERAL_FRACTION,
    volatilityLookbackMs: parsed.DECIBEL_SMART_LADDER_VOLATILITY_LOOKBACK_MS,
    maximumVolatilitySpreadMultiplier: parsed.DECIBEL_SMART_LADDER_MAX_VOLATILITY_MULTIPLIER,
    requoteHysteresisFraction: parsed.DECIBEL_PRODUCTION_REQUOTE_HYSTERESIS_FRACTION,
    repriceMinimumTicks: parsed.DECIBEL_PRODUCTION_REPRICE_MINIMUM_TICKS,
    minimumActiveOrderLifetimeMs: parsed.DECIBEL_PRODUCTION_MIN_ACTIVE_ORDER_LIFETIME_MS,
    catastropheStopEnabled: parsed.DECIBEL_CATASTROPHE_STOP_ENABLED === 'true',
    entryCandleFilterEnabled: parsed.DECIBEL_ENTRY_CANDLE_FILTER_ENABLED === 'true',
  });
}
