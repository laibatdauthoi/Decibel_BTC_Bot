import type {
  DecibelExecutionExecutorV1,
  execution_result_v1,
} from './decibel_execution_lifecycle_v1.js';

export class decibel_mainnet_mutation_blocked_executor_v1 implements DecibelExecutionExecutorV1 {
  readonly mcpMutationCalls = 0;
  readonly venueMutations = 0;
  placePostOnlyLimit(): Promise<execution_result_v1> {
    return Promise.reject(new Error('MAINNET_MUTATION_NOT_ENABLED'));
  }
  cancelExactOrder(): Promise<execution_result_v1> {
    return Promise.reject(new Error('MAINNET_MUTATION_NOT_ENABLED'));
  }
}
