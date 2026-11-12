import type { cancel_intent_v1, place_intent_v1 } from './decibel_execution_intent_v1.js';
import type {
  DecibelExecutionExecutorV1,
  execution_result_v1,
} from './decibel_execution_lifecycle_v1.js';

export const DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_V1 =
  'DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_V1' as const;
export type production_execution_result_v1 = Readonly<{
  outcome:
    | 'PLACE_ACKNOWLEDGED'
    | 'PLACE_REJECTED'
    | 'PLACE_OUTCOME_UNKNOWN'
    | 'CANCEL_CONFIRMED'
    | 'CANCEL_REJECTED'
    | 'CANCEL_OUTCOME_UNKNOWN';
  venueOrderId?: string;
  transactionHash?: string;
  expirationTimestampMs?: number;
}>;
export interface DecibelProductionExecutionExecutorV1 {
  placePostOnlyLimit(intent: place_intent_v1): Promise<production_execution_result_v1>;
  placeReduceOnlyImmediateOrCancel?(
    intent: place_intent_v1,
  ): Promise<production_execution_result_v1>;
  cancelExactOrder(intent: cancel_intent_v1): Promise<production_execution_result_v1>;
  readAccountDiagnostics?(): Promise<
    Readonly<{
      primaryAccountAddress: string;
      subaccountAddress: string;
      primaryAccountAptBalance: number;
      subaccountAptBalance: number;
    }>
  >;
}
export type decibel_production_executor_gate_config_v1 = Readonly<{
  executorEnabled: boolean;
  releaseStage: 'CANARY' | 'AUTONOMOUS';
  reconciledCanaryEvidenceHash?: string;
  requiredCanaryEvidenceHash?: string;
}>;

export function validateDecibelProductionReleaseStageV1(
  config: decibel_production_executor_gate_config_v1,
): void {
  if (
    config.releaseStage === 'AUTONOMOUS' &&
    (!config.requiredCanaryEvidenceHash ||
      config.reconciledCanaryEvidenceHash !== config.requiredCanaryEvidenceHash)
  )
    throw new Error('AUTONOMOUS_RELEASE_CANARY_EVIDENCE_REQUIRED');
}

export class decibel_production_executor_gate_v1 implements DecibelExecutionExecutorV1 {
  private canaryHalted = false;
  private outstandingMutation = false;
  constructor(
    private readonly External: DecibelProductionExecutionExecutorV1,
    private readonly Config: decibel_production_executor_gate_config_v1,
  ) {
    validateDecibelProductionReleaseStageV1(Config);
  }
  async placePostOnlyLimit(intent: place_intent_v1): Promise<execution_result_v1> {
    this.assertEnabled();
    this.validatePlace(intent);
    this.assertCanary();
    this.outstandingMutation = true;
    try {
      const result = await this.External.placePostOnlyLimit(intent);
      this.haltCanary();
      return mapResult(result);
    } finally {
      this.outstandingMutation = false;
    }
  }
  async placeReduceOnlyImmediateOrCancel(intent: place_intent_v1): Promise<execution_result_v1> {
    this.assertEnabled();
    this.validatePlace(intent);
    this.assertCanary();
    this.outstandingMutation = true;
    try {
      if (this.External.placeReduceOnlyImmediateOrCancel === undefined)
        throw new Error('EXECUTION_SESSION_UNWIND_IOC_UNSUPPORTED');
      const result = await this.External.placeReduceOnlyImmediateOrCancel(intent);
      this.haltCanary();
      return mapResult(result);
    } finally {
      this.outstandingMutation = false;
    }
  }
  async cancelExactOrder(intent: cancel_intent_v1): Promise<execution_result_v1> {
    this.assertEnabled();
    this.validateCancel(intent);
    this.assertCanary();
    this.outstandingMutation = true;
    try {
      const result = await this.External.cancelExactOrder(intent);
      this.haltCanary();
      return mapResult(result);
    } finally {
      this.outstandingMutation = false;
    }
  }
  haltAfterAuthenticatedStateChange(): void {
    this.haltCanary();
  }
  acknowledgeAuthenticatedReconciliation(): void {
    this.canaryHalted = false;
  }
  private assertEnabled(): void {
    if (!this.Config.executorEnabled) throw new Error('EXECUTION_KILL_SWITCH_ACTIVE');
  }
  private assertCanary(): void {
    if (this.outstandingMutation) throw new Error('CANARY_OUTSTANDING_MUTATION_BLOCKED');
    if (this.Config.releaseStage === 'CANARY' && this.canaryHalted)
      throw new Error('CANARY_HALT_FOR_RECONCILIATION');
  }
  private haltCanary(): void {
    if (this.Config.releaseStage === 'CANARY') this.canaryHalted = true;
  }
  private validatePlace(intent: place_intent_v1): void {
    if (
      intent.market !== 'BTC/USD' ||
      intent.type !== 'LIMIT' ||
      (intent.executionRole === 'SESSION_UNWIND_IOC'
        ? intent.timeInForce !== 'ImmediateOrCancel' || intent.postOnly || !intent.reduceOnly
        : intent.timeInForce !== 'PostOnly' || !intent.postOnly) ||
      intent.selfTradePermitted ||
      !intent.externalCounterpartyRequired ||
      !intent.clientOrderId ||
      !intent.intentId ||
      !intent.mutationKey ||
      !intent.sourceStateHash ||
      !intent.strategyDecisionHash
    )
      throw new Error('PRODUCTION_EXECUTOR_PLACE_CONTRACT_REJECTED');
  }
  private validateCancel(intent: cancel_intent_v1): void {
    if (
      intent.market !== 'BTC/USD' ||
      !intent.expectedPreviousVenueOrderId ||
      !intent.intentId ||
      !intent.mutationKey
    )
      throw new Error('PRODUCTION_EXECUTOR_CANCEL_CONTRACT_REJECTED');
  }
}
function mapResult(result: production_execution_result_v1): execution_result_v1 {
  switch (result.outcome) {
    case 'PLACE_ACKNOWLEDGED':
      return {
        outcome: 'PLACE_ACCEPTED',
        ...(result.venueOrderId ? { venueOrderId: result.venueOrderId } : {}),
        ...(result.transactionHash ? { transactionHash: result.transactionHash } : {}),
        ...(result.expirationTimestampMs
          ? { expirationTimestampMs: result.expirationTimestampMs }
          : {}),
      };
    case 'PLACE_REJECTED':
      return { outcome: 'PLACE_REJECTED' };
    case 'PLACE_OUTCOME_UNKNOWN':
      return {
        outcome: 'PLACE_TIMEOUT_UNKNOWN',
        ...(result.transactionHash ? { transactionHash: result.transactionHash } : {}),
        ...(result.expirationTimestampMs
          ? { expirationTimestampMs: result.expirationTimestampMs }
          : {}),
      };
    case 'CANCEL_CONFIRMED':
      return { outcome: 'CANCEL_CONFIRMED' };
    case 'CANCEL_REJECTED':
      return { outcome: 'CANCEL_REJECTED' };
    case 'CANCEL_OUTCOME_UNKNOWN':
      return { outcome: 'CANCEL_TIMEOUT_UNKNOWN' };
  }
}
