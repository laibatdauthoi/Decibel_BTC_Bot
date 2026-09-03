import 'dotenv/config';
import { join } from 'node:path';
import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import { buildDecibelExecutionIntentV1 } from './decibel_execution_intent_v1.js';
import {
  decibel_production_execution_v1,
  loadDecibelProductionExecutorV1,
  parseDecibelProductionExecutionConfigV1,
} from './decibel_production_execution_v1.js';
export async function runDecibelProductionExecutionV1(environment: NodeJS.ProcessEnv) {
  const config = parseDecibelProductionExecutionConfigV1(environment);
  if (config.mode !== 'production') throw new Error('PRODUCTION_EXECUTION_MODE_REQUIRED');
  const executor = await loadDecibelProductionExecutorV1(config.modulePath);
  const journal = new decibel_execution_lifecycle_journal_v1(
    environment.DECIBEL_EXECUTION_JOURNAL_PATH ??
      join('data', 'decibel_production_execution_v1.sqlite'),
  );
  try {
    const runtime = new decibel_production_execution_v1(journal, executor, config, {
      maxPlaceAttemptsPerMinute: 1,
      maxCancelAttemptsPerMinute: 1,
      maxTotalMutationAttemptsPerMinute: 1,
      maxConsecutiveUnknownOutcomes: 1,
    });
    if (!config.dryRun) throw new Error('PRODUCTION_VALIDATION_REQUIRES_DRY_RUN');
    const intent = buildDecibelExecutionIntentV1({
      sessionId: 'production-dry-run',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 100,
      quantity: 0.1,
      tickSize: 0.1,
      lotSize: 0.01,
      clientOrderId: 'production-dry-run',
      knownVenueOrderId: null,
      sourceStateHash: 'dry-run-state',
      strategyDecisionHash: 'dry-run-decision',
      createdAt: 1,
    });
    const result = await runtime.execute(intent, {
      now: 1,
      authenticatedReadFresh: true,
      reconciliationPassed: true,
      stateUnchanged: true,
      preflight: {
        tickSize: 0.1,
        lotSize: 0.01,
        minimumNotionalUsd: 5,
        maximumNotionalUsd: 20,
        permittedSide: 'BUY',
      },
    });
    console.log(
      `PRODUCTION_RUNTIME_READY=YES\nDRY_RUN=YES\nRESULT=${result.status}\nMUTATION_INVOCATIONS=0`,
    );
    return result;
  } finally {
    journal.close();
  }
}
if (process.argv[1]?.endsWith('run_decibel_production_execution_v1.ts'))
  runDecibelProductionExecutionV1(process.env).catch((error: unknown) => {
    console.error(
      `PRODUCTION_RUNTIME_READY=NO\nBLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}\nMUTATION_INVOCATIONS=0`,
    );
    process.exitCode = 1;
  });
