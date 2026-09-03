import type {
  DecibelExecutionExecutorV1,
  execution_result_v1,
} from './decibel_execution_lifecycle_v1.js';

export class decibel_mock_lifecycle_executor_v1 implements DecibelExecutionExecutorV1 {
  readonly mcpMutationCalls = 0;
  readonly venueMutations = 0;
  mockMutationAttempts = 0;
  constructor(private readonly Script: execution_result_v1[]) {}
  private next(): execution_result_v1 {
    this.mockMutationAttempts += 1;
    const result = this.Script.shift();
    if (result === undefined) throw new Error('MOCK_LIFECYCLE_SCRIPT_EXHAUSTED');
    return result;
  }
  placePostOnlyLimit(): Promise<execution_result_v1> {
    return Promise.resolve(this.next());
  }
  cancelExactOrder(): Promise<execution_result_v1> {
    return Promise.resolve(this.next());
  }
}
