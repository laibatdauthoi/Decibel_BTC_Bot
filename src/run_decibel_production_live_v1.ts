import dotenv from 'dotenv';

dotenv.config();

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { createLogger } from './logger.js';
import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import {
  decibel_production_live_orchestrator_v1,
  parseDecibelProductionLiveConfigurationV1,
  runDecibelProductionLiveLoopV1,
  type DecibelProductionLiveStateSourceV1,
} from './decibel_production_live_orchestrator_v1.js';
import { loadDecibelProductionExecutorV1 } from './decibel_production_execution_v1.js';
import { createDecibelProductionLiveStateSourceV1 } from './decibel_production_live_state_source_v1.js';
import { execution_preflight_rejection_v1 } from './decibel_execution_intent_v1.js';

export function getSafeProductionLiveFailureV1(error: unknown): Readonly<{
  blocker: string;
  rejectionCode: string | null;
}> {
  if (error instanceof execution_preflight_rejection_v1)
    return Object.freeze({ blocker: error.message, rejectionCode: error.rejectionCode });
  return Object.freeze({
    blocker: error instanceof Error ? error.message : 'PRODUCTION_LIVE_UNHANDLED_ERROR',
    rejectionCode: null,
  });
}

export async function loadDecibelProductionLiveSourceV1(
  modulePath: string | null,
): Promise<DecibelProductionLiveStateSourceV1> {
  if (modulePath === null) return createDecibelProductionLiveStateSourceV1();
  const imported = (await import(pathToFileURL(resolve(modulePath)).href)) as {
    createDecibelProductionLiveStateSourceV1?: () => DecibelProductionLiveStateSourceV1;
  };
  if (typeof imported.createDecibelProductionLiveStateSourceV1 !== 'function')
    throw new Error('PRODUCTION_LIVE_SOURCE_MODULE_CONTRACT_INVALID');
  const source = imported.createDecibelProductionLiveStateSourceV1();
  if (
    typeof source.readAuthenticatedSnapshot !== 'function' ||
    typeof source.reconcileIntent !== 'function'
  )
    throw new Error('PRODUCTION_LIVE_SOURCE_MODULE_CONTRACT_INVALID');
  return source;
}

export async function runDecibelProductionLiveV1(environment: NodeJS.ProcessEnv): Promise<void> {
  const configuration = parseDecibelProductionLiveConfigurationV1(environment);
  const Logger = createLogger(environment.LOG_FORMAT === 'json' ? 'json' : 'pretty');
  const Controller = new AbortController();
  const stop = () => Controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let Journal: decibel_execution_lifecycle_journal_v1 | null = null;
  try {
    const [executor, source] = await Promise.all([
      loadDecibelProductionExecutorV1(configuration.executorModulePath),
      loadDecibelProductionLiveSourceV1(configuration.sourceModulePath),
    ]);
    Journal = new decibel_execution_lifecycle_journal_v1(resolve(configuration.journalPath));
    const Orchestrator = new decibel_production_live_orchestrator_v1(
      Journal,
      source,
      executor,
      configuration,
      {
        maxPlaceAttemptsPerMinute: Math.max(15, configuration.maximumLadderLevelsPerSide * 5),
        maxCancelAttemptsPerMinute: Math.max(15, configuration.maximumLadderLevelsPerSide * 5),
        maxTotalMutationAttemptsPerMinute: Math.max(
          30,
          configuration.maximumLadderLevelsPerSide * 10,
        ),
        maxConsecutiveUnknownOutcomes: 1,
        maxKnownLiveOrders: 2,
        submissionTimeoutMs: configuration.submissionTimeoutMs,
      },
    );
    Journal = null;
    const result = await runDecibelProductionLiveLoopV1({
      orchestrator: Orchestrator,
      configuration,
      signal: Controller.signal,
      onCycle: (cycle) =>
        Logger.info(
          {
            action: cycle.action,
            intentId: cycle.intentId,
            blocker: cycle.blocker,
            mutationInvocations: cycle.mutationInvocations,
            ...(cycle.marketScopeDiagnostics === undefined
              ? {}
              : { marketScopeDiagnostics: cycle.marketScopeDiagnostics }),
          },
          'Decibel production live cycle',
        ),
    });
    Logger.info(result, 'Decibel production live runner stopped');
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    Journal?.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runDecibelProductionLiveV1(process.env).catch((error: unknown) => {
    const failure = getSafeProductionLiveFailureV1(error);
    console.error(
      `DECIBEL_PRODUCTION_LIVE=FAIL BLOCKER=${failure.blocker}${failure.rejectionCode === null ? '' : ` REJECTION_CODE=${failure.rejectionCode}`}`,
    );
    process.exitCode = 1;
  });
}
