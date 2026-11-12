import dotenv from 'dotenv';

dotenv.config();

import { emitKeypressEvents } from 'node:readline';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import { execution_preflight_rejection_v1 } from './decibel_execution_intent_v1.js';
import { calculateDecibelRealizedPnlWindowsV1 } from './decibel_pnl_tracker_v1.js';
import {
  decibel_production_live_orchestrator_v1,
  isUnrecoverableDecibelAuthenticationErrorV1,
  parseDecibelProductionLiveConfigurationV1,
} from './decibel_production_live_orchestrator_v1.js';
import { loadDecibelProductionExecutorV1 } from './decibel_production_execution_v1.js';
import {
  enterDecibelProductionTuiScreenV1,
  formatDecibelProductionTuiEventV1,
  leaveDecibelProductionTuiScreenV1,
  decibel_production_tui_v1,
  type decibel_production_tui_model_v1,
} from './decibel_production_tui_v1.js';
import { loadDecibelProductionLiveSourceV1 } from './run_decibel_production_live_v1.js';

const ProfileSchema = z.object({
  name: z.string().trim().min(1),
  subaccountAddress: z
    .string()
    .trim()
    .regex(/^0x[0-9a-fA-F]{64}$/),
  journalPath: z.string().trim().min(1),
  privateKeyEnvironmentVariable: z.string().trim().min(1).optional(),
});

type profile = z.infer<typeof ProfileSchema>;
type runtime_context = Readonly<{
  profile: profile;
  orchestrator: decibel_production_live_orchestrator_v1;
  masterAptGas: number | null;
  readPublicMarketPrice: (() => Promise<number>) | null;
}>;

export class tui_silent_authenticated_resync_error_v1 extends Error {
  public constructor(
    public readonly safeDetail: string,
    public readonly onChainPositionRecoveryEligible = false,
  ) {
    super('TUI_SILENT_AUTHENTICATED_RESYNC_FAILED');
    this.name = 'tui_silent_authenticated_resync_error_v1';
  }
}

export function isSilentResyncOnChainPositionRecoveryEligibleV1(childOutput: string): boolean {
  const blockerLine = childOutput.match(/(?:^|\r?\n)BLOCKER=([^\r\n]+)/)?.[1];
  const positionText = childOutput.match(/(?:^|\r?\n)CURRENT_POSITION_BASE=([^\r\n]+)/)?.[1];
  if (blockerLine === undefined || positionText === undefined) return false;
  const blockers = new Set(blockerLine.split(',').map((value) => value.trim()));
  const expected = new Set([
    'BTC_FILL_ATTRIBUTION_INCOMPLETE',
    'BTC_ACCOUNT_POSITION_CONSERVATION_FAILED',
    'BTC_RESYNC_POSITION_NOT_ZERO',
  ]);
  const position = Number(positionText);
  return (
    Number.isFinite(position) &&
    position !== 0 &&
    blockers.size === expected.size &&
    [...blockers].every((blocker) => expected.has(blocker))
  );
}

export function getSafeSilentResyncFailureDetailV1(childOutput: string): string {
  const lines = childOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const blocker = lines
    .map((line) => line.match(/BLOCKER=([A-Z0-9_,:-]+)/)?.[1])
    .find((value) => value !== undefined && value !== 'NONE');
  const errorLine = lines.find((line) => /(?:Error|AptosApiError):/i.test(line));
  const raw = blocker ?? errorLine ?? lines[0] ?? 'CHILD_PROCESS_EXIT_NONZERO';
  return raw
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/(private[_ -]?key|api[_ -]?key|token)\s*[=:]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/0x[0-9a-f]{32,}/gi, '[ADDRESS_REDACTED]')
    .slice(0, 240);
}

export function buildSilentAuthenticatedResyncEnvironmentV1(
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...environment,
    DECIBEL_ALLOW_OUT_OF_BAND_RECONCILIATION: 'true',
    LIVE_EXECUTION_ENABLED: 'false',
    VENUE_MUTATION_ENABLED: 'false',
    SIGNER_ENABLED: 'false',
    TRANSACTION_SUBMISSION_ENABLED: 'false',
  };
}

export function getDecibelTuiTransientReadBackoffMsV1(consecutiveFailures: number): number {
  if (!Number.isSafeInteger(consecutiveFailures) || consecutiveFailures < 1)
    throw new Error('TUI_TRANSIENT_READ_FAILURE_COUNT_INVALID');
  return Math.min(30_000, 1_000 * 2 ** Math.min(consecutiveFailures - 1, 5));
}

export function isDecibelTuiAutoResumeEnabledV1(
  environment: NodeJS.ProcessEnv,
  argumentsValue: readonly string[],
): boolean {
  return (
    argumentsValue.includes('--auto-resume') ||
    environment.DECIBEL_AUTO_RESUME?.trim().toLowerCase() === 'true'
  );
}

function waitForTuiRetryV1(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolveWait) => {
    if (signal.aborted) return resolveWait();
    const timeout = setTimeout(resolveWait, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolveWait();
      },
      { once: true },
    );
  });
}

async function runSilentAuthenticatedResync(environment: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolveRun, rejectRun) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(
      process.execPath,
      [
        resolve('node_modules/tsx/dist/cli.mjs'),
        resolve('src/run_decibel_authenticated_btc_activity_resync_v1.ts'),
      ],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildSilentAuthenticatedResyncEnvironmentV1(environment),
      },
    );
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-8_192);
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-8_192);
    });
    child.once('error', (error) => {
      rejectRun(
        new tui_silent_authenticated_resync_error_v1(
          getSafeSilentResyncFailureDetailV1(`Error: ${error.message}`),
        ),
      );
    });
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else
        rejectRun(
          new tui_silent_authenticated_resync_error_v1(
            getSafeSilentResyncFailureDetailV1(`${stderr}\n${stdout}`),
            isSilentResyncOnChainPositionRecoveryEligibleV1(stdout),
          ),
        );
    });
  });
}

export async function retrySilentAuthenticatedResyncV1(input: {
  run: () => Promise<void>;
  signal: AbortSignal;
  onRetry: (attempt: number, delayMs: number, safeDetail: string) => Promise<void> | void;
  onChainPositionRecovery?: (safeDetail: string) => Promise<void> | void;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}): Promise<boolean> {
  let attempt = 0;
  while (!input.signal.aborted) {
    try {
      await input.run();
      return true;
    } catch (error) {
      if (!(error instanceof tui_silent_authenticated_resync_error_v1)) throw error;
      if (error.onChainPositionRecoveryEligible && input.onChainPositionRecovery !== undefined) {
        await input.onChainPositionRecovery(error.safeDetail);
        return true;
      }
      attempt += 1;
      const delayMs = getDecibelTuiTransientReadBackoffMsV1(attempt);
      await input.onRetry(attempt, delayMs, error.safeDetail);
      await (input.wait ?? waitForTuiRetryV1)(delayMs, input.signal);
    }
  }
  return false;
}

function loadProfiles(environment: NodeJS.ProcessEnv): readonly profile[] {
  const raw = environment.DECIBEL_PRODUCTION_TUI_PROFILES;
  if (raw === undefined) {
    return Object.freeze([
      ProfileSchema.parse({
        name: environment.DECIBEL_PRODUCTION_TUI_ACTIVE_PROFILE ?? 'default',
        subaccountAddress: environment.DECIBEL_SUBACCOUNT_ADDRESS,
        journalPath:
          environment.DECIBEL_EXECUTION_JOURNAL_PATH ?? 'data/decibel_execution_v1.sqlite',
      }),
    ]);
  }
  const profiles = z.array(ProfileSchema).min(1).parse(JSON.parse(raw));
  if (new Set(profiles.map((profileValue) => profileValue.name)).size !== profiles.length)
    throw new Error('TUI_PROFILE_NAME_DUPLICATE');
  if (
    new Set(profiles.map((profileValue) => resolve(profileValue.journalPath))).size !==
    profiles.length
  )
    throw new Error('TUI_PROFILE_JOURNAL_MUST_BE_ISOLATED');
  return Object.freeze(profiles);
}

async function createRuntime(
  profileValue: profile,
  environment: NodeJS.ProcessEnv,
): Promise<runtime_context> {
  environment.DECIBEL_SUBACCOUNT_ADDRESS = profileValue.subaccountAddress;
  environment.DECIBEL_EXECUTION_JOURNAL_PATH = profileValue.journalPath;
  if (profileValue.privateKeyEnvironmentVariable !== undefined) {
    const privateKey = environment[profileValue.privateKeyEnvironmentVariable];
    if (privateKey === undefined || privateKey.trim().length === 0)
      throw new Error('TUI_PROFILE_PRIVATE_KEY_ENVIRONMENT_VALUE_REQUIRED');
    environment.DECIBEL_PRIVATE_KEY = privateKey;
  }
  const configuration = parseDecibelProductionLiveConfigurationV1(environment);
  const [executor, source] = await Promise.all([
    loadDecibelProductionExecutorV1(configuration.executorModulePath),
    loadDecibelProductionLiveSourceV1(configuration.sourceModulePath),
  ]);
  const Journal = new decibel_execution_lifecycle_journal_v1(resolve(profileValue.journalPath));
  const diagnostics =
    executor.readAccountDiagnostics === undefined ? null : await executor.readAccountDiagnostics();
  if (
    diagnostics !== null &&
    diagnostics.subaccountAddress.toLowerCase() !== profileValue.subaccountAddress.toLowerCase()
  ) {
    Journal.close();
    await source.close?.();
    throw new Error('TUI_PROFILE_SUBACCOUNT_IDENTITY_MISMATCH');
  }
  return Object.freeze({
    profile: profileValue,
    masterAptGas: diagnostics?.primaryAccountAptBalance ?? null,
    readPublicMarketPrice:
      source.readPublicMarketPrice === undefined ? null : () => source.readPublicMarketPrice!(),
    orchestrator: new decibel_production_live_orchestrator_v1(
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
    ),
  });
}

export async function runDecibelProductionLiveTuiV1(
  environment: NodeJS.ProcessEnv,
  argumentsValue: readonly string[] = process.argv.slice(2),
): Promise<void> {
  if (process.version !== 'v22.23.2') throw new Error('DECIBEL_TUI_NODE_22_RUNTIME_MISMATCH');
  environment.DECIBEL_PRODUCTION_TUI_HALF_SPREAD_BPS ??= '5';
  environment.DECIBEL_PRODUCTION_LIVE_MIN_NOTIONAL_USD ??= '10';
  const profiles = loadProfiles(environment);
  let Runtime = await createRuntime(profiles[0]!, environment);
  const autoResume = isDecibelTuiAutoResumeEnabledV1(environment, argumentsValue);
  Runtime.orchestrator.setPaused(true);
  const Model: decibel_production_tui_model_v1 = {
    status: 'PAUSED',
    activeProfile: Runtime.profile.name,
    subaccountAddress: Runtime.profile.subaccountAddress,
    masterAptGas: Runtime.masterAptGas,
    collateralUsd: null,
    effectiveLeverage: Number(environment.MAX_EFFECTIVE_LEVERAGE ?? 1),
    btcPrice: null,
    positionBase: 0,
    unrealizedPnlUsd: null,
    pnl24hUsd: 0,
    pnl24hPercent: null,
    pnl7dUsd: 0,
    pnl7dPercent: null,
    pnl30dUsd: 0,
    pnl30dPercent: null,
    targetVolumeUsd: environment.DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD
      ? Number(environment.DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD)
      : null,
    accumulatedVolumeUsd: 0,
    bid: null,
    ask: null,
    halfSpreadBps: Number(environment.DECIBEL_PRODUCTION_TUI_HALF_SPREAD_BPS),
    orderNotionalUsd: Number(environment.DECIBEL_PRODUCTION_LIVE_MIN_NOTIONAL_USD ?? 10),
    maxPositionBase: Number(environment.DECIBEL_PRODUCTION_TUI_MAX_POSITION_BASE ?? 0.001),
    maxDrawdownUsd: Number(environment.DECIBEL_PRODUCTION_TUI_MAX_DRAWDOWN_USD ?? 10),
    logs: [],
  };
  const refreshPublicPrice = async (): Promise<void> => {
    if (Runtime.readPublicMarketPrice === null) return;
    try {
      Model.btcPrice = await Runtime.readPublicMarketPrice();
    } catch (error) {
      Model.logs.push(
        `${new Date().toISOString()} PUBLIC_PRICE_FALLBACK_FAILED: ${error instanceof Error ? error.message : 'UNKNOWN'}`,
      );
    }
  };
  let sourceBookStale = false;
  let resumeAfterSourceBookRecovery = false;
  let riskReductionActive = false;
  const loggedWarnings = new Set<string>();
  const cancelAllAndReconcile = async () => {
    Runtime.orchestrator.requestCancelAll();
    for (
      let attempt = 0;
      attempt < 100 && !Runtime.orchestrator.isCancelAllComplete();
      attempt += 1
    )
      await Runtime.orchestrator.evaluateOnce();
    if (!Runtime.orchestrator.isCancelAllComplete())
      throw new Error('TUI_CANCEL_AND_RECONCILE_TIMEOUT');
  };
  const unwindAndReconcile = async () => {
    Runtime.orchestrator.requestSessionUnwind();
    for (
      let attempt = 0;
      attempt < 100 && !Runtime.orchestrator.isSessionUnwindComplete();
      attempt += 1
    )
      await Runtime.orchestrator.evaluateOnce();
    if (!Runtime.orchestrator.isSessionUnwindComplete())
      throw new Error('TUI_SESSION_UNWIND_TIMEOUT');
  };
  const Tui = new decibel_production_tui_v1(
    Model,
    {
      setPaused: (paused) => {
        if (!paused && sourceBookStale) {
          Runtime.orchestrator.setPaused(true);
          Model.status = 'PAUSED';
          Model.logs.push(`${new Date().toISOString()} SOURCE_BOOK_STALE HOLD_PAUSED`);
          return;
        }
        Runtime.orchestrator.setPaused(paused);
      },
      cancelAllAndReconcile,
      unwindAndReconcile,
      switchProfile: async (name) => {
        const selected = profiles.find((candidate) => candidate.name === name);
        if (selected === undefined) throw new Error('TUI_PROFILE_NOT_CONFIGURED');
        environment.DECIBEL_SUBACCOUNT_ADDRESS = selected.subaccountAddress;
        environment.DECIBEL_EXECUTION_JOURNAL_PATH = selected.journalPath;
        if (selected.privateKeyEnvironmentVariable !== undefined) {
          const privateKey = environment[selected.privateKeyEnvironmentVariable];
          if (privateKey === undefined || privateKey.trim().length === 0)
            throw new Error('TUI_PROFILE_PRIVATE_KEY_ENVIRONMENT_VALUE_REQUIRED');
          environment.DECIBEL_PRIVATE_KEY = privateKey;
        }
        const resynced = await retrySilentAuthenticatedResyncV1({
          run: () => runSilentAuthenticatedResync(environment),
          signal: Controller.signal,
          onRetry: async (attempt, delayMs, safeDetail) => {
            Model.status = 'PAUSED';
            Model.logs.push(
              `${new Date().toISOString()} SILENT_RESYNC_FAILED: ${safeDetail}; SILENT_RESYNC_RETRYing HOLD_PAUSED attempt=${attempt} delayMs=${delayMs}`,
            );
            await refreshPublicPrice();
            Tui.render();
          },
          onChainPositionRecovery: (safeDetail) => {
            Model.logs.push(
              `${new Date().toISOString()} ON_CHAIN_POSITION_TRUTH_RECOVERY WARNING=${safeDetail} REDUCE_INVENTORY_ONLY`,
            );
            Tui.render();
          },
        });
        if (!resynced) return;
        await Runtime.orchestrator.close();
        Runtime = await createRuntime(selected, environment);
        Runtime.orchestrator.setPaused(true);
        Model.subaccountAddress = selected.subaccountAddress;
        Model.masterAptGas = Runtime.masterAptGas;
      },
      setTargetVolumeUsd: (target) => {
        if (target === null) delete environment.DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD;
        else environment.DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD = String(target);
      },
      setOrderNotionalUsd: (notional) => {
        Model.orderNotionalUsd = notional;
        environment.DECIBEL_PRODUCTION_LIVE_MIN_NOTIONAL_USD = String(notional);
        if (Number(environment.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD ?? 0) < notional)
          environment.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD = String(notional);
      },
      setMaxLeverage: (leverage) => {
        environment.MAX_EFFECTIVE_LEVERAGE = String(leverage);
      },
      setHalfSpreadBps: (spread) => {
        environment.DECIBEL_PRODUCTION_TUI_HALF_SPREAD_BPS = String(spread);
      },
      setMaxPositionBase: (position) => {
        environment.DECIBEL_PRODUCTION_TUI_MAX_POSITION_BASE = String(position);
      },
      setMaxDrawdownUsd: (drawdown) => {
        Model.maxDrawdownUsd = drawdown;
      },
    },
    process.stdin,
    process.stdout,
  );
  const Controller = new AbortController();
  const stop = () => Controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  let keyWork = Promise.resolve();
  process.stdin.on('keypress', (_text, key: { name?: string; shift?: boolean; ctrl?: boolean }) => {
    if (key.ctrl === true && key.name === 'c') return stop();
    const raw = key.name === 'space' ? ' ' : (key.name ?? '');
    const value = key.shift === true ? raw.toUpperCase() : raw;
    keyWork = keyWork.then(async () => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      try {
        await Tui.handleKey(value);
      } finally {
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
      }
    });
  });
  let screenActive = false;
  const restoreScreen = () => {
    if (!screenActive) return;
    screenActive = false;
    leaveDecibelProductionTuiScreenV1(process.stdout);
  };
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const captureConsole = (...values: unknown[]) => {
    const formatted = values.map(formatDecibelProductionTuiEventV1).find((value) => value !== null);
    if (formatted !== undefined && formatted !== null)
      Model.logs.push(`${new Date().toISOString()} ${formatted}`);
  };
  try {
    enterDecibelProductionTuiScreenV1(process.stdout);
    screenActive = true;
    process.once('exit', restoreScreen);
    console.log = captureConsole;
    console.info = captureConsole;
    console.warn = captureConsole;
    console.error = captureConsole;
    Tui.render();
    let initialPositionRecovery = false;
    const initialResyncSucceeded = await retrySilentAuthenticatedResyncV1({
      run: () => runSilentAuthenticatedResync(environment),
      signal: Controller.signal,
      onRetry: async (attempt, delayMs, safeDetail) => {
        Runtime.orchestrator.setPaused(true);
        Model.status = 'PAUSED';
        Model.logs.push(
          `${new Date().toISOString()} SILENT_RESYNC_FAILED: ${safeDetail}; SILENT_RESYNC_RETRYing HOLD_PAUSED attempt=${attempt} delayMs=${delayMs}`,
        );
        await refreshPublicPrice();
        if (Model.logs.length > 100) Model.logs.shift();
        Tui.render();
      },
      onChainPositionRecovery: (safeDetail) => {
        initialPositionRecovery = true;
        Runtime.orchestrator.setPaused(true);
        Model.logs.push(
          `${new Date().toISOString()} ON_CHAIN_POSITION_TRUTH_RECOVERY WARNING=${safeDetail} REDUCE_INVENTORY_ONLY`,
        );
        Tui.render();
      },
    });
    if (!initialResyncSucceeded) return;
    if (!initialPositionRecovery)
      Model.logs.push(`${new Date().toISOString()} SILENT_RESYNC_RECOVERED`);
    if (autoResume) {
      Runtime.orchestrator.setPaused(false);
      Model.status = 'RUNNING';
      Model.logs.push(`${new Date().toISOString()} SILENT_RESYNC_AUTO_RESUME`);
    }
    Tui.render();
    let consecutiveTransientReadFailures = 0;
    let observedFillIds: Set<string> | null = null;
    while (!Controller.signal.aborted && Model.status !== 'STOPPED_GOAL_REACHED') {
      let cycle;
      try {
        cycle = await Runtime.orchestrator.evaluateOnce();
        consecutiveTransientReadFailures = 0;
        if (sourceBookStale) {
          sourceBookStale = false;
          Model.logs.push(`${new Date().toISOString()} SOURCE_BOOK_FRESH`);
          if (resumeAfterSourceBookRecovery) {
            Runtime.orchestrator.setPaused(false);
            Model.status = 'RUNNING';
            Model.logs.push(`${new Date().toISOString()} SOURCE_BOOK_RECOVERED_AUTO_RESUME`);
          }
          resumeAfterSourceBookRecovery = false;
        }
      } catch (error) {
        if (Controller.signal.aborted) break;
        if (error instanceof execution_preflight_rejection_v1) {
          Runtime.orchestrator.setPaused(true);
          Model.status = 'PAUSED';
          Model.logs.push(
            `${new Date().toISOString()} PREFLIGHT_REJECTED: ${error.safeReason} (${error.rejectionCode}) HOLD_PAUSED`,
          );
          if (Model.logs.length > 100) Model.logs.shift();
          Tui.render();
          await waitForTuiRetryV1(1_000, Controller.signal);
          continue;
        }
        if (error instanceof Error && error.message === 'PRODUCTION_LIVE_SOURCE_BOOK_STALE') {
          consecutiveTransientReadFailures += 1;
          if (!sourceBookStale) resumeAfterSourceBookRecovery = Model.status === 'RUNNING';
          sourceBookStale = true;
          Runtime.orchestrator.setPaused(true);
          Model.status = 'PAUSED';
          Model.logs.push(
            `${new Date().toISOString()} SOURCE_BOOK_STALE_RETRIES HOLD_PAUSED attempt=${consecutiveTransientReadFailures}`,
          );
          if (Model.logs.length > 100) Model.logs.shift();
          Tui.render();
          await waitForTuiRetryV1(
            getDecibelTuiTransientReadBackoffMsV1(consecutiveTransientReadFailures),
            Controller.signal,
          );
          continue;
        }
        if (
          error instanceof Error &&
          (error.message === 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT' ||
            error.message === 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED' ||
            (error.message === 'PRODUCTION_AUTHENTICATED_READ_REQUIRED' &&
              !isUnrecoverableDecibelAuthenticationErrorV1(error)))
        ) {
          consecutiveTransientReadFailures += 1;
          Runtime.orchestrator.setPaused(true);
          Model.status = 'PAUSED';
          Model.logs.push(
            `${new Date().toISOString()} ${error.message === 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED' ? 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED DecibelHttpApi read backoff' : 'AUTHENTICATED_READ_TRANSIENT'} quoting paused; retrying`,
          );
          if (Model.logs.length > 100) Model.logs.shift();
          Tui.render();
          await waitForTuiRetryV1(
            error.message === 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED'
              ? 30_000
              : getDecibelTuiTransientReadBackoffMsV1(consecutiveTransientReadFailures),
            Controller.signal,
          );
          continue;
        }
        throw error;
      }
      const snapshot = Runtime.orchestrator.getLatestSnapshot();
      if (snapshot !== null) {
        const midpoint = (snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2;
        const pnl = calculateDecibelRealizedPnlWindowsV1(
          snapshot.input.actualFillLedger.fills,
          snapshot.input.now,
        );
        Model.btcPrice = midpoint;
        Model.positionBase = snapshot.input.actualInventoryBase;
        Model.unrealizedPnlUsd = snapshot.accountMetrics?.unrealizedPnlUsd ?? null;
        Model.collateralUsd = snapshot.accountMetrics?.collateralUsd ?? null;
        Model.masterAptGas = snapshot.accountMetrics?.masterAptGas ?? Runtime.masterAptGas;
        Model.effectiveLeverage = snapshot.maximumEffectiveLeverage;
        Model.accumulatedVolumeUsd = snapshot.input.actualFillLedger.actualExternalMakerVolumeUsd;
        Model.bid = snapshot.input.openOrders.find((order) => order.side === 'BUY') ?? null;
        Model.ask = snapshot.input.openOrders.find((order) => order.side === 'SELL') ?? null;
        Model.pnl24hUsd = pnl.hours24.realizedPnlUsd;
        Model.pnl24hPercent = pnl.hours24.realizedPnlPercent;
        Model.pnl7dUsd = pnl.days7.realizedPnlUsd;
        Model.pnl7dPercent = pnl.days7.realizedPnlPercent;
        Model.pnl30dUsd = pnl.days30.realizedPnlUsd;
        Model.pnl30dPercent = pnl.days30.realizedPnlPercent;
        const currentFillIds = new Set(
          snapshot.input.actualFillLedger.fills.map((fill) => fill.venueFillId),
        );
        if (observedFillIds !== null) {
          for (const fill of snapshot.input.actualFillLedger.fills) {
            if (observedFillIds.has(fill.venueFillId)) continue;
            const fee =
              fill.fee.availability === 'AVAILABLE' && fill.fee.amount !== null
                ? ` FEE=${fill.fee.currency === 'USD' ? '$' : ''}${Math.abs(fill.fee.amount).toFixed(6)}${fill.fee.currency === 'USD' ? '' : ` ${fill.fee.currency}`}`
                : ' FEE=UNAVAILABLE';
            Model.logs.push(
              `${new Date().toISOString()} FILL ${fill.venueFillId} ${fill.side} ${fill.executedBaseQuantity}@${fill.executedPrice}${fee}`,
            );
          }
        }
        observedFillIds = currentFillIds;
        Model.bidLadder = (cycle.evaluation?.desiredBidLadder ?? []).map((order) => ({
          levelId: order.levelId ?? 'BUY',
          price: order.price,
          quantity: order.quantity,
          skewStatus: order.skewStatus ?? 'NEUTRAL',
        }));
        Model.askLadder = (cycle.evaluation?.desiredAskLadder ?? []).map((order) => ({
          levelId: order.levelId ?? 'SELL',
          price: order.price,
          quantity: order.quantity,
          skewStatus: order.skewStatus ?? 'NEUTRAL',
        }));
        for (const warning of snapshot.warnings ?? []) {
          if (loggedWarnings.has(warning)) continue;
          loggedWarnings.add(warning);
          Model.logs.push(`${new Date().toISOString()} WARNING=${warning}`);
        }
      }
      Model.logs.push(
        cycle.action === 'RECONCILE_ONLY'
          ? `${new Date().toISOString()} RECONCILE_ONLY: Awaiting Indexer confirmation on Order ${cycle.intentId ?? 'UNKNOWN'}${cycle.blocker ? ` ${cycle.blocker}` : ''}`
          : `${new Date().toISOString()} ${cycle.action}${cycle.blocker ? ` ${cycle.blocker}` : ''}`,
      );
      if (Model.logs.length > 100) Model.logs.shift();
      const goalReached = await Tui.enforceVolumeGoal();
      if (pnlTotal(Model) <= -Model.maxDrawdownUsd && !goalReached && !riskReductionActive) {
        riskReductionActive = true;
        Runtime.orchestrator.requestRiskReduction();
        Model.status = 'RISK_REDUCTION';
        Model.logs.push(
          `${new Date().toISOString()} RISK_REDUCTION: Maximum drawdown reached; exposure-increasing quotes disabled`,
        );
      }
      Tui.render();
      await new Promise<void>((resolveSleep) => setTimeout(resolveSleep, 1_000));
    }
    await keyWork;
  } finally {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    Tui.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    process.removeListener('exit', restoreScreen);
    restoreScreen();
    await Runtime.orchestrator.close();
  }
}

function pnlTotal(model: decibel_production_tui_model_v1): number {
  return model.pnl30dUsd + (model.unrealizedPnlUsd ?? 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runDecibelProductionLiveTuiV1(process.env, process.argv.slice(2)).catch((error: unknown) => {
    console.error(
      `DECIBEL_PRODUCTION_TUI=FAIL BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`,
    );
    process.exitCode = 1;
  });
}
