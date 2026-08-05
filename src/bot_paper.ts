import 'dotenv/config';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import { collectData } from './collect_data.js';
import { createLogger } from './logger.js';
import {
  normalizePaperBotConfiguration,
  paper_bot_journal,
  paper_bot_runtime_controller,
  real_paper_bot_scheduler,
} from './paper_bot.js';
import { resolvePaperBotDatabasePath } from './paper_bot_database_path.js';
import type { unified_data_runtime } from './data_runtime.js';
import { candlestick_repository } from './candlestick_repository.js';
import { resolveCandlestickDatabasePath } from './database_path.js';
import { readMainnetBTCBacktestDataset } from './backtest_data.js';
import { buildBTCTimeframes } from './timeframe_aggregation.js';
import { loadOpportunityScannerConfig, scanBTCOpportunities } from './opportunity_scanner.js';
import { loadMarketStructureConfig } from './market_structure.js';
import { research_source_repository } from './research_repository.js';
import { resolveMicrostructureDatabasePath } from './microstructure_database_path.js';
import { buildResearchSamples } from './research_dataset.js';
import { loadConfig } from './config.js';
import { getCandidateIdentity } from './paper_bot.js';
import { decibel_client } from './decibel_client.js';
import type { candle_gap } from './paper_bot.js';
import { database_runtime_lock } from './data_runtime_lock.js';
import { awaitPaperBotShutdownSignal } from './paper_bot_command.js';
async function flushPaperBotLogger(Logger: Logger) {
  await new Promise<void>((resolve, reject) =>
    Logger.flush((error) => (error === undefined ? resolve() : reject(error))),
  );
  if (process.stdout.writableNeedDrain) await once(process.stdout, 'drain');
}
export async function runPaperBot() {
  const config = normalizePaperBotConfiguration(process.env),
    Logger = createLogger(process.env.LOG_FORMAT === 'json' ? 'json' : 'pretty');
  const paperDatabasePath = resolvePaperBotDatabasePath(),
    PaperLock = await database_runtime_lock.acquire([paperDatabasePath]),
    Journal = new paper_bot_journal(paperDatabasePath);
  const applicationConfig = loadConfig();
  const reconcileGap = async (gap: candle_gap): Promise<'REPAIRED' | 'NOT_FOUND'> => {
    const Candles = new candlestick_repository(resolveCandlestickDatabasePath());
    try {
      const Client = new decibel_client(applicationConfig),
        start = new Date(gap.expectedTimestamp),
        end = new Date(gap.nextTimestamp),
        history = await Client.getBTCCandlesticks('5m', start, end, new Date());
      if (history.marketAddress !== gap.marketAddress)
        throw new Error('CANDLE_RECONCILIATION_MARKET_MISMATCH');
      const boundedHistory = {
        ...history,
        candles: history.candles.filter(
          (candle) => candle.timestamp >= start && candle.timestamp < end,
        ),
      };
      if (boundedHistory.candles.length === 0) return 'NOT_FOUND';
      Candles.saveCandlesticks(boundedHistory);
      return Candles.findMissingTimestamps(gap.marketAddress, '5m', start, end).length === 0
        ? 'REPAIRED'
        : 'NOT_FOUND';
    } finally {
      Candles.close();
    }
  };
  const evaluate = (event: { marketAddress: string; candleTime: string; completedAt: string }) => {
    const Candles = new candlestick_repository(resolveCandlestickDatabasePath());
    const Source = new research_source_repository(resolveMicrostructureDatabasePath());
    try {
      const cutoff = Date.parse(event.completedAt),
        dataset = readMainnetBTCBacktestDataset(Candles, applicationConfig.network, cutoff),
        candidates = scanBTCOpportunities(
          buildBTCTimeframes(dataset.candles, new Date(cutoff)),
          loadOpportunityScannerConfig(),
          loadMarketStructureConfig(),
        ).filter((candidate) => candidate.availableAtTime.toISOString() === event.completedAt);
      const source = Source.readSnapshot(() => Source.loadSource(event.marketAddress, cutoff)),
        samples = buildResearchSamples(candidates, dataset.candles, source, cutoff);
      let valid = 0;
      for (const sample of samples) {
        const windows = [sample.features['15'], sample.features['60'], sample.features['300']],
          allValid = windows.every((window) => window?.status === 'VALID');
        if (allValid) valid += 1;
        const candidate = candidates.find(
          (item) => getCandidateIdentity(item) === sample.candidateId,
        );
        if (candidate !== undefined)
          Journal.saveCandidate({
            candidateId: sample.candidateId,
            evaluationId: `evaluation:${event.marketAddress}:5m:${event.candleTime}`,
            candidate,
            decision: 'OBSERVED',
            reasons: allValid
              ? ['OBSERVE_ONLY']
              : windows.flatMap((window, index) =>
                  window?.status === 'VALID'
                    ? []
                    : [`FEATURE_WINDOW_INVALID_${[15, 60, 300][index]}S`],
                ),
            features: {
              window15: windows[0]?.status ?? 'INVALID',
              window60: windows[1]?.status ?? 'INVALID',
              window300: windows[2]?.status ?? 'INVALID',
              compatibleSession: true,
              microstructureAvailable: true,
              futureDataDetected: false,
              featureVersion: sample.featureVersion,
              featureHash: `sha256:${sample.candidateId}`,
            },
          });
      }
      const markPrice = dataset.candles.at(-1)?.close;
      return {
        candidateCount: candidates.length,
        validCandidateCount: valid,
        selectedCandidateId: null,
        featureValidity: { valid, invalid: candidates.length - valid },
        ...(markPrice === undefined ? {} : { markPrice }),
      };
    } finally {
      Source.close();
      Candles.close();
    }
  };
  let Controller: paper_bot_runtime_controller | undefined,
    Runtime: unified_data_runtime | undefined;
  Logger.info(
    { event: 'paper_bot_starting', mode: config.mode, liveExecutionEnabled: false },
    'Unified BTC/USD paper bot starting',
  );
  try {
    Runtime = await collectData({
      registerSignals: false,
      onRuntime: (runtime) => {
        Runtime = runtime;
        Controller = new paper_bot_runtime_controller(
          Journal,
          config.mode,
          runtime,
          new real_paper_bot_scheduler(),
          config.healthyStabilizationSeconds,
          config.readinessTimeoutSeconds,
          Logger,
          evaluate,
          () => true,
          reconcileGap,
          {
            maximumAttempts: applicationConfig.candleGapReconciliationMaximumAttempts,
            baseDelayMs: applicationConfig.candleGapReconciliationBaseDelayMs,
            maximumDelayMs: applicationConfig.candleGapReconciliationMaximumDelayMs,
          },
        );
        Controller.start();
      },
      onCompletedCandle: (event) =>
        Controller?.handleCompletedCandle({
          marketAddress: event.marketAddress,
          interval: event.interval,
          candleTime: event.candle.timestamp.toISOString(),
          completedAt: event.completedAt.toISOString(),
          observedAt: event.observedAt.toISOString(),
          source: event.source,
        }),
    });
  } catch (error) {
    Journal.close();
    await PaperLock.release();
    throw error;
  }
  const startupCandleAt = Runtime.getHealthSummary().candles.latestCompletedCandleAt;
  if (startupCandleAt !== null) Journal.setHighWaterMark(new Date(startupCandleAt).toISOString());
  let shutdownPromise: Promise<void> | undefined,
    duplicateSignalLogged = false,
    paperResourcesClosed = false;
  const shutdown = (signal: 'SIGINT' | 'SIGTERM') => {
    if (shutdownPromise !== undefined) {
      if (!duplicateSignalLogged) {
        duplicateSignalLogged = true;
        Logger.info({ event: 'shutdown_already_in_progress', signal }, 'Shutdown already running');
      }
      return shutdownPromise;
    }
    shutdownPromise = (async () => {
      const shutdownStartedAt = new Date(),
        shutdownState = { timedOut: false },
        operation = (async () => {
          if (Controller === undefined || Runtime === undefined)
            throw new Error('PAPER_BOT_COMPONENTS_NOT_STARTED');
          await Controller.beginShutdown();
          await Runtime.shutdown(signal);
          if (shutdownState.timedOut) {
            if (!paperResourcesClosed) {
              Journal.checkpoint();
              await PaperLock.release();
              Journal.close();
              paperResourcesClosed = true;
            }
            throw new Error('PAPER_BOT_SHUTDOWN_TIMEOUT');
          }
          Controller.completeShutdown(Runtime.getStatus());
          const diagnostics = Controller.getDiagnostics(),
            health = Runtime.getHealthSummary(),
            pendingOutboxCommandCount = Journal.getPendingOutboxCount();
          Journal.checkpoint();
          await PaperLock.release();
          Journal.close();
          paperResourcesClosed = true;
          const shutdownCompletedAt = new Date();
          Logger.info(
            {
              event: 'paper_bot_stopped',
              signal,
              paperBotState: diagnostics.state,
              unifiedDataRuntimeStatus: Runtime.getStatus(),
              candleServiceStatus: 'STOPPED',
              depthStatus: health.depth.health.toUpperCase(),
              tradesStatus: health.trades.health.toUpperCase(),
              marketPriceStatus: health.marketPrice.health.toUpperCase(),
              aggregateWriterStatus: 'STOPPED',
              evaluationWorkerStatus: diagnostics.evaluationWorkerStatus,
              reconciliationWorkerStatus: diagnostics.reconciliationWorkerStatus,
              pendingEvaluationCount: diagnostics.pendingEvaluationCount,
              pendingOutboxCommandCount,
              pendingReconciliationCount: diagnostics.pendingReconciliationCount,
              activeTimerCount: diagnostics.activeTimerCount,
              registeredListenerCount: diagnostics.registeredListenerCount,
              heldLockCount: 0,
              openDatabaseCount: 0,
              lastKnownContinuityStatus: health.candles.candleContinuityHealth,
              shutdownStartedAt,
              shutdownCompletedAt,
              shutdownDurationMs: shutdownCompletedAt.getTime() - shutdownStartedAt.getTime(),
              liveExecutionEnabled: false,
            },
            'Unified BTC/USD paper bot stopped cleanly',
          );
          await flushPaperBotLogger(Logger);
        })();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          operation,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              shutdownState.timedOut = true;
              reject(new Error('PAPER_BOT_SHUTDOWN_TIMEOUT'));
            }, config.shutdownTimeoutMs);
          }),
        ]);
      } catch (error) {
        try {
          Journal.checkpoint();
        } catch {
          // The background best-effort cleanup may already have closed the journal.
        }
        if (!paperResourcesClosed) {
          await PaperLock.release().catch(() => undefined);
          Journal.close();
          paperResourcesClosed = true;
        }
        process.exitCode = 1;
        Logger.error(
          {
            event: 'paper_bot_shutdown_failed',
            signal,
            paperBotState: Controller?.getDiagnostics().state ?? 'HALTED',
            unifiedDataRuntimeStatus: Runtime?.getStatus() ?? 'FAILED',
            error: error instanceof Error ? error.message : 'Unknown error',
            liveExecutionEnabled: false,
          },
          'Paper bot shutdown failed',
        );
        await flushPaperBotLogger(Logger);
        throw error;
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    })();
    return shutdownPromise;
  };
  const commandKeepAlive = setInterval(() => undefined, 60_000);
  try {
    await awaitPaperBotShutdownSignal(process, shutdown);
  } finally {
    clearInterval(commandKeepAlive);
  }
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  await runPaperBot().catch(async (error) => {
    const Logger = createLogger('pretty');
    Logger.error(
      { event: 'paper_bot_failed', error: error instanceof Error ? error.message : 'Unknown' },
      'Paper bot command failed',
    );
    await flushPaperBotLogger(Logger);
    process.exitCode = 1;
  });
