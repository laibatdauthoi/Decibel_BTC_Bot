import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  validateDecibelPlaceIntentV1,
  type execution_intent_v1,
} from './decibel_execution_intent_v1.js';
import type { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import {
  decibel_execution_lifecycle_v1,
  type execution_mutation_budget_v1,
} from './decibel_execution_lifecycle_v1.js';
import {
  decibel_production_executor_gate_v1,
  type DecibelProductionExecutionExecutorV1,
} from './decibel_production_executor_handoff_v1.js';
export type decibel_production_release_stage_v1 = 'DISABLED' | 'CANARY' | 'AUTONOMOUS';
export function parseDecibelProductionExecutionConfigV1(environment: NodeJS.ProcessEnv) {
  const stage = environment.DECIBEL_EXECUTION_RELEASE_STAGE ?? 'DISABLED';
  if (!['DISABLED', 'CANARY', 'AUTONOMOUS'].includes(stage))
    throw new Error('PRODUCTION_RELEASE_STAGE_INVALID');
  return Object.freeze({
    mode: environment.DECIBEL_EXECUTION_MODE,
    releaseStage: stage as decibel_production_release_stage_v1,
    executorEnabled: environment.DECIBEL_EXECUTOR_ENABLED === 'true',
    dryRun: environment.DECIBEL_EXECUTOR_DRY_RUN === 'true',
    modulePath: environment.DECIBEL_PRODUCTION_EXECUTOR_MODULE ?? null,
    canaryEvidenceHash: environment.DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH,
    requiredCanaryEvidenceHash: environment.DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH,
  });
}
export async function loadDecibelProductionExecutorV1(
  modulePath: string | null,
): Promise<DecibelProductionExecutionExecutorV1> {
  if (!modulePath) throw new Error('PRODUCTION_EXECUTOR_MODULE_NOT_CONFIGURED');
  const imported = (await import(pathToFileURL(resolve(modulePath)).href)) as {
    createDecibelProductionExecutorV1?: () => DecibelProductionExecutionExecutorV1;
  };
  if (typeof imported.createDecibelProductionExecutorV1 !== 'function')
    throw new Error('PRODUCTION_EXECUTOR_MODULE_CONTRACT_INVALID');
  const executor = imported.createDecibelProductionExecutorV1();
  if (
    typeof executor.placePostOnlyLimit !== 'function' ||
    typeof executor.cancelExactOrder !== 'function'
  )
    throw new Error('PRODUCTION_EXECUTOR_MODULE_CONTRACT_INVALID');
  return executor;
}
export class decibel_production_execution_v1 {
  private readonly Lifecycle: decibel_execution_lifecycle_v1;
  constructor(
    private readonly Journal: decibel_execution_lifecycle_journal_v1,
    external: DecibelProductionExecutionExecutorV1,
    private readonly Config: ReturnType<typeof parseDecibelProductionExecutionConfigV1>,
    budget: execution_mutation_budget_v1,
  ) {
    if (Config.mode !== 'production') throw new Error('PRODUCTION_EXECUTION_MODE_REQUIRED');
    const releaseStage = Config.releaseStage === 'AUTONOMOUS' ? 'AUTONOMOUS' : 'CANARY';
    const gate = new decibel_production_executor_gate_v1(external, {
      executorEnabled: Config.executorEnabled,
      releaseStage,
      ...(Config.canaryEvidenceHash
        ? { reconciledCanaryEvidenceHash: Config.canaryEvidenceHash }
        : {}),
      ...(Config.requiredCanaryEvidenceHash
        ? { requiredCanaryEvidenceHash: Config.requiredCanaryEvidenceHash }
        : {}),
    });
    this.Lifecycle = new decibel_execution_lifecycle_v1(Journal, gate, budget);
  }
  async execute(
    intent: execution_intent_v1,
    input: {
      now: number;
      authenticatedReadFresh: boolean;
      reconciliationPassed: boolean;
      stateUnchanged: boolean;
      preflight?: Parameters<typeof validateDecibelPlaceIntentV1>[1];
    },
  ) {
    const blocker = !input.authenticatedReadFresh
      ? 'PRODUCTION_AUTHENTICATED_READ_REQUIRED'
      : !input.reconciliationPassed
        ? 'PRODUCTION_RECONCILIATION_REQUIRED'
        : !input.stateUnchanged
          ? 'EXECUTION_STATE_CHANGED_BEFORE_INTENT'
          : null;
    if (blocker) {
      this.Journal.recordBlocker(null, blocker, input.now);
      throw new Error(blocker);
    }
    if (this.Config.releaseStage === 'DISABLED' || !this.Config.executorEnabled) {
      this.Journal.recordBlocker(null, 'EXECUTION_KILL_SWITCH_ACTIVE', input.now);
      throw new Error('EXECUTION_KILL_SWITCH_ACTIVE');
    }
    if (this.Config.dryRun) {
      if (intent.action === 'PLACE') {
        if (!input.preflight) throw new Error('EXECUTION_PREFLIGHT_REJECTED');
        validateDecibelPlaceIntentV1(intent, input.preflight);
      }
      const prepared = this.Journal.prepare(intent);
      if (!prepared.duplicate)
        this.Journal.recordBlocker(
          intent.intentId,
          'PRODUCTION_DRY_RUN_MUTATION_BLOCKED',
          input.now,
        );
      return Object.freeze({
        status: prepared.duplicate ? 'DUPLICATE_SUPPRESSED' : 'DRY_RUN_PREPARED',
        mutationInvocations: 0 as const,
      });
    }
    return this.Lifecycle.submit(intent, {
      now: input.now,
      ...(input.preflight ? { preflight: input.preflight } : {}),
    });
  }
  recover() {
    return this.Lifecycle.recover();
  }
}
