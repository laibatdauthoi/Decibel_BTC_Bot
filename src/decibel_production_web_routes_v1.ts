/**
 * HTTP routes of the production web runtime (moved out of run_decibel_production_web_v1.ts
 * on 2026-11-16; the route code is unchanged).
 */
import { readDecibelActivityHistoryV1 } from './decibel_activity_history_v1.js';
import { checkDecibelWebRequestV1 } from './decibel_web_request_guard_v1.js';
import {
  handleDecibelAuthRequestV1,
  type decibel_dashboard_auth_v1,
} from './decibel_dashboard_auth_v1.js';
import { readDecibelDelegationsV1 } from './decibel_agent_delegation_v1.js';
import { checkDecibelBotAuthorizationV1 } from './decibel_executor_signer_v1.js';
import type { decibel_actual_fill_ledger_v1 } from './decibel_actual_fill_truth_v1.js';
import {
  generateDecibelAgentKeyV1,
  resolveDecibelKeystoreSecretV1,
} from './decibel_agent_keystore_v1.js';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';
import {
  handleDecibelWalletRequestV1,
  readDecibelAptBalanceOctasV1,
  readDecibelSubaccountsV1,
  withdrawDecibelAgentGasV1,
} from './decibel_wallet_routes_v1.js';
import {
  loadDecibelWalletWhitelistV1,
  normalizeDecibelAddressV1,
  readDecibelSubaccountOwnerV1,
} from './decibel_wallet_workspace_v1.js';
import {
  projectDecibelNextSessionEntrySizeUsdV1,
  handleDecibelOperatorSettingsRequestV1,
  handleDecibelExecutionModeRequestV1,
  handleDecibelProductionSessionRequestV1,
} from './decibel_production_web_helpers_v1.js';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { z } from 'zod';
import { decibel_process_forensics_v1 } from './decibel_process_forensics_v1.js';
import {
  decibel_operator_settings_store_v1,
  parseDecibelOperatorSettingsValuesV1,
} from './decibel_operator_settings_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import { decibel_production_session_controller_v1 } from './decibel_production_session_controller_v1.js';
import { type decibel_production_web_telemetry_v1 } from './decibel_production_web_telemetry_v1.js';
import { parseDecibelProductionLiveConfigurationV1 } from './decibel_production_live_orchestrator_v1.js';
import type {
  DecibelProductionLiveStateSourceV1,
  decibel_production_live_snapshot_v1,
} from './decibel_production_live_types_v1.js';
import { readDecibelLegacyHandoffV1 } from './decibel_legacy_handoff_v1.js';
import { decibel_runtime_supervisor_v1 } from './decibel_runtime_supervisor_v1.js';
import {
  buildDecibelRestartSafetySnapshotV1,
  persistDecibelRestartSafetySnapshotV1,
} from './decibel_restart_safety_gate_v1.js';
import { loadDecibelPersistedExecutionModeV1 } from './decibel_persisted_execution_mode_v1.js';

const contentTypes: Readonly<Record<string, string>> = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
});

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

async function readJsonBody(request: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += value.length;
    if (length > 32_768) throw new Error('SETTINGS_REQUEST_TOO_LARGE');
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    throw new Error('SETTINGS_REQUEST_INVALID_JSON', { cause: error });
  }
}

/** Authenticated account state as the runtime publishes it. */
export type authenticated_account_state = Awaited<
  ReturnType<NonNullable<DecibelProductionLiveStateSourceV1['readAuthenticatedAccountState']>>
> & { venueSnapshot?: decibel_production_live_snapshot_v1 };

/** What the HTTP routes read from the runtime. Mutable state is read through getters. */
export type decibel_production_web_route_context_v1 = Readonly<{
  web: Readonly<{ DECIBEL_PRODUCTION_WEB_HOST: string; DECIBEL_PRODUCTION_WEB_PORT: number }>;
  environment: NodeJS.ProcessEnv;
  configuration: ReturnType<typeof parseDecibelProductionLiveConfigurationV1>;
  loadedExecutionMode: ReturnType<typeof loadDecibelPersistedExecutionModeV1>;
  runtimeSupervisor: decibel_runtime_supervisor_v1;
  runtimeForensics: decibel_process_forensics_v1;
  sessionController: decibel_production_session_controller_v1;
  settingsStore: decibel_operator_settings_store_v1;
  source: DecibelProductionLiveStateSourceV1;
  telemetryJournal: decibel_execution_lifecycle_journal_v1;
  clients: Set<ServerResponse>;
  staticRoot: string;
  refreshAuthenticatedComponents: () => Promise<authenticated_account_state>;
  getSnapshot: () => decibel_production_live_snapshot_v1 | null;
  getTelemetry: () => decibel_production_web_telemetry_v1;
  /** Wallet sign-in; null when DECIBEL_DASHBOARD_AUTH=off. */
  auth: decibel_dashboard_auth_v1 | null;
  secureCookie: boolean;
  /** Switch the runtime to the subaccount chosen in the wallet menu (relaunch when idle). */
  subaccountSwitch: Readonly<{
    canSwitch: () => 'OK' | 'SESSION_ACTIVE' | 'OPEN_ORDERS' | 'DISABLED';
    switchNow: () => void;
  }>;
}>;

/**
 * Live mainnet sessions start only while the owner's Petra authorization of the bot key is
 * active on the subaccount in use; an unreadable authorization fails closed.
 */
async function checkSessionStartAuthorization(
  context: decibel_production_web_route_context_v1,
): Promise<Readonly<{ status: number; error: string }> | null> {
  const { mode } = context.loadedExecutionMode;
  if (mode.tradingMode !== 'mainnet' || !mode.liveTradingEnabled) return null;
  const subaccountAddress = context.environment.DECIBEL_SUBACCOUNT_ADDRESS?.trim();
  if (!subaccountAddress) return { status: 409, error: 'BOT_NOT_AUTHORIZED_CONNECT_WALLET' };
  try {
    const { MAINNET_CONFIG } = await loadDecibelSdkRuntimeV1();
    const refusal = await checkDecibelBotAuthorizationV1(context.environment, () =>
      readDecibelDelegationsV1({
        tradingHttpUrl: MAINNET_CONFIG.tradingHttpUrl,
        subaccountAddress,
        apiKey: context.environment.DECIBEL_NODE_API_KEY,
      }),
    );
    return refusal === null ? null : { status: 409, error: refusal };
  } catch {
    return { status: 503, error: 'BOT_AUTHORIZATION_UNAVAILABLE' };
  }
}

/** Fill evidence of ended sessions never changes: read it from the venue once per process. */
const EndedSessionLedgers = new Map<string, decibel_actual_fill_ledger_v1>();
const ENDED_SESSION_LEDGER_CACHE_LIMIT_V1 = 50;
/** Venue fills can be timestamped slightly after the session end was recorded. */
const SESSION_FILL_END_MARGIN_MS_V1 = 60_000;

/**
 * Authenticated fills covering one session. The live snapshot only holds recent fills, so the
 * activity history reads the session's own window from the venue; on any read failure it falls
 * back to the snapshot (rows it cannot prove stay UNKNOWN).
 */
async function readSessionFillLedger(
  context: decibel_production_web_route_context_v1,
  session: Readonly<{ sessionId: string; startedAt: number | null; endedAt: number | null }>,
): Promise<decibel_actual_fill_ledger_v1 | undefined> {
  const fallback = context.getSnapshot()?.input.actualFillLedger;
  const cached = EndedSessionLedgers.get(session.sessionId);
  if (cached !== undefined) return cached;
  if (session.startedAt === null || context.source.readAuthenticatedFillLedger === undefined)
    return fallback;
  try {
    const { ledger } = await context.source.readAuthenticatedFillLedger(
      session.startedAt,
      undefined,
      session.endedAt === null ? undefined : session.endedAt + SESSION_FILL_END_MARGIN_MS_V1,
    );
    if (session.endedAt !== null) {
      if (EndedSessionLedgers.size >= ENDED_SESSION_LEDGER_CACHE_LIMIT_V1)
        EndedSessionLedgers.delete(EndedSessionLedgers.keys().next().value!);
      EndedSessionLedgers.set(session.sessionId, ledger);
    }
    return ledger;
  } catch {
    return fallback;
  }
}

export function handleDecibelProductionWebRequestV1(
  context: decibel_production_web_route_context_v1,
  request: import('node:http').IncomingMessage,
  response: ServerResponse,
): void {
  const rejection = checkDecibelWebRequestV1({
    method: request.method,
    host: request.headers.host,
    origin: request.headers.origin,
    contentType: request.headers['content-type'],
    port: context.web.DECIBEL_PRODUCTION_WEB_PORT,
  });
  if (rejection !== null) {
    request.resume();
    return writeJson(response, rejection.status, { error: rejection.error });
  }
  const pathname = new URL(request.url ?? '/', `http://${context.web.DECIBEL_PRODUCTION_WEB_HOST}`)
    .pathname;
  if (pathname.startsWith('/api/auth/')) {
    void (async () => {
      const body = request.method === 'POST' ? await readJsonBody(request) : null;
      const result = await handleDecibelAuthRequestV1({
        method: request.method ?? 'GET',
        pathname,
        body,
        cookie: request.headers.cookie,
        auth: context.auth,
        secureCookie: context.secureCookie,
      });
      if (result === null) return writeJson(response, 404, { error: 'NOT_FOUND' });
      if (result.setCookie !== undefined) response.setHeader('Set-Cookie', result.setCookie);
      writeJson(response, result.status, result.body);
    })().catch(() => writeJson(response, 400, { error: 'AUTH_REQUEST_INVALID' }));
    return;
  }
  if (
    context.auth !== null &&
    pathname.startsWith('/api/') &&
    context.auth.authenticate(request.headers.cookie) === null
  ) {
    request.resume();
    return writeJson(response, 401, { error: 'AUTH_REQUIRED' });
  }
  if (pathname === '/api/activity-history') {
    if (request.method !== 'GET') return writeJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    const sessionId = new URL(request.url ?? '/', 'http://localhost').searchParams.get('sessionId');
    if (!sessionId || sessionId.length > 256)
      return writeJson(response, 400, { error: 'SESSION_ID_INVALID' });
    const session = context.sessionController
      .getHistory()
      .find((record) => record.sessionId === sessionId);
    if (session === undefined) return writeJson(response, 404, { error: 'SESSION_NOT_FOUND' });
    void (async () => {
      const ledger = await readSessionFillLedger(context, session);
      return writeJson(
        response,
        200,
        readDecibelActivityHistoryV1(context.configuration.journalPath, sessionId, ledger),
      );
    })().catch(() => writeJson(response, 503, { error: 'ACTIVITY_HISTORY_UNAVAILABLE' }));
    return;
  }
  if (pathname.startsWith('/api/session')) {
    const isStartRequest = request.method === 'POST' && pathname === '/api/session/start';
    if (isStartRequest) context.runtimeForensics.record('SESSION_START_HTTP_REQUEST');
    void (async () => {
      const body = request.method === 'POST' ? await readJsonBody(request) : null;
      if (isStartRequest) {
        const refusal = await checkSessionStartAuthorization(context);
        if (refusal !== null) {
          context.runtimeForensics.record('SESSION_START_HTTP_RESPONSE', {
            status: refusal.status,
            blocker: refusal.error,
          });
          return writeJson(response, refusal.status, { error: refusal.error });
        }
      }
      const result = await handleDecibelProductionSessionRequestV1(
        request.method ?? 'GET',
        pathname,
        body,
        context.sessionController,
      );
      if (result === null) return writeJson(response, 404, { error: 'NOT_FOUND' });
      if (isStartRequest) {
        const error =
          typeof result.body === 'object' && result.body !== null && 'error' in result.body
            ? result.body.error
            : null;
        const blocker =
          typeof error === 'string'
            ? (error.match(/^[A-Z][A-Z0-9_]+/u)?.[0] ?? 'SESSION_START_REQUEST_INVALID')
            : null;
        context.runtimeForensics.record('SESSION_START_HTTP_RESPONSE', {
          status: result.status,
          blocker,
        });
      }
      writeJson(response, result.status, result.body);
    })().catch((error: unknown) => {
      if (isStartRequest)
        context.runtimeForensics.record('SESSION_START_HTTP_RESPONSE', {
          status: 400,
          blocker: 'SESSION_REQUEST_PARSE_FAILED',
        });
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'SESSION_REQUEST_FAILED',
      });
    });
    return;
  }
  if (pathname === '/api/operator-settings') {
    void (async () => {
      if (request.method === 'GET') {
        const saved = context.settingsStore.read();
        const params = new URL(request.url ?? '/', 'http://localhost').searchParams;
        const queryValues = z
          .object({
            capitalToUseUsd: z.coerce.number().finite().positive().optional(),
            maxLossUsd: z.coerce.number().finite().positive().optional(),
            targetMakerVolumeUsd: z.coerce
              .number()
              .finite()
              .refine((value) => value !== 0)
              .optional(),
          })
          .safeParse(Object.fromEntries(params));
        const state = context.runtimeSupervisor.getSnapshot();
        const base =
          context.runtimeSupervisor.getExecutionSnapshot<decibel_production_live_snapshot_v1>();
        const account =
          context.runtimeSupervisor.getAuthenticatedSnapshot<authenticated_account_state>();
        const nextPracticalInputs = context.source.readNextSessionCapacityInputs?.();
        const projectedSnapshot =
          base === null || account === null
            ? null
            : {
                ...base,
                ...(nextPracticalInputs ? { practicalCapacityInputs: nextPracticalInputs } : {}),
                availableMarginUsd: account.availableMarginUsd ?? Number.NaN,
                accountMetrics: account.accountMetrics,
                input: {
                  ...base.input,
                  actualInventoryBase: account.actualInventoryBase,
                  openOrders: account.openOrders,
                },
              };
        const entrySizeUsd = queryValues.success
          ? projectDecibelNextSessionEntrySizeUsdV1({
              settings: {
                ...saved.values,
                capitalToUseUsd: queryValues.data.capitalToUseUsd ?? saved.values.capitalToUseUsd,
                maxLossUsd: queryValues.data.maxLossUsd ?? saved.values.maxLossUsd,
                targetMakerVolumeUsd:
                  queryValues.data.targetMakerVolumeUsd ?? saved.values.targetMakerVolumeUsd,
              },
              snapshot: projectedSnapshot,
              accountReady: state.readiness.accountReady,
              marketReady: state.readiness.marketReady,
              venueMaximumNotionalUsd: Number(
                context.environment.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD ?? '100',
              ),
              maximumAggregateCollateralFraction:
                context.configuration.maximumAggregateCollateralFraction,
            })
          : null;
        return writeJson(response, 200, {
          ...saved,
          nextSessionProjection: {
            settingsRevision: saved.revision,
            entrySizeUsd,
          },
        });
      }
      const body = request.method === 'POST' ? await readJsonBody(request) : null;
      if (request.method === 'POST') {
        const pending = z.object({ values: z.unknown() }).parse(body);
        const values = parseDecibelOperatorSettingsValuesV1(pending.values);
        const state = context.runtimeSupervisor.getSnapshot();
        const current =
          context.runtimeSupervisor.getExecutionSnapshot<decibel_production_live_snapshot_v1>();
        const account =
          context.runtimeSupervisor.getAuthenticatedSnapshot<authenticated_account_state>();
        const practicalInputs = context.source.readNextSessionCapacityInputs?.();
        const entrySize = projectDecibelNextSessionEntrySizeUsdV1({
          settings: values,
          snapshot:
            current && account
              ? {
                  ...current,
                  availableMarginUsd: account.availableMarginUsd ?? Number.NaN,
                  accountMetrics: account.accountMetrics,
                  input: {
                    ...current.input,
                    actualInventoryBase: account.actualInventoryBase,
                    openOrders: account.openOrders,
                  },
                  ...(practicalInputs ? { practicalCapacityInputs: practicalInputs } : {}),
                }
              : null,
          accountReady: state.readiness.accountReady,
          marketReady: state.readiness.marketReady,
          venueMaximumNotionalUsd: Number(
            context.environment.DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD ?? '100',
          ),
          maximumAggregateCollateralFraction:
            context.configuration.maximumAggregateCollateralFraction,
        });
        if (entrySize === null) throw new Error('ENTRY_UNAVAILABLE_MARGIN_OR_VENUE_EVIDENCE');
      }
      const result = handleDecibelOperatorSettingsRequestV1(
        request.method ?? 'GET',
        pathname,
        body,
        context.settingsStore,
        {
          availableMarginUsd:
            context.runtimeSupervisor.getAuthenticatedSnapshot<authenticated_account_state>()
              ?.availableMarginUsd ?? null,
          status: context.runtimeSupervisor.getAuthenticatedEvidenceDiagnostics().ready
            ? 'fresh'
            : 'stale',
        },
      );
      if (result === null) return writeJson(response, 404, { error: 'NOT_FOUND' });
      writeJson(response, result.status, result.body);
    })().catch((error: unknown) =>
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'SETTINGS_REQUEST_FAILED',
      }),
    );
    return;
  }
  if (pathname === '/api/execution-mode') {
    void (async () => {
      const body = request.method === 'POST' ? await readJsonBody(request) : null;
      const result = handleDecibelExecutionModeRequestV1(
        request.method ?? 'GET',
        pathname,
        body,
        context.loadedExecutionMode.path,
        context.loadedExecutionMode.mode,
      );
      if (result === null) return writeJson(response, 404, { error: 'NOT_FOUND' });
      writeJson(response, result.status, result.body);
    })().catch((error: unknown) =>
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'EXECUTION_MODE_REQUEST_FAILED',
      }),
    );
    return;
  }
  if (pathname === '/api/wallet' || pathname.startsWith('/api/wallet/')) {
    void (async () => {
      const body = request.method === 'POST' ? await readJsonBody(request) : null;
      const { MAINNET_CONFIG } = await loadDecibelSdkRuntimeV1();
      const apiKey = context.environment.DECIBEL_NODE_API_KEY;
      const result = await handleDecibelWalletRequestV1(
        request.method ?? 'GET',
        pathname,
        {
          environment: context.environment,
          packageAddress: MAINNET_CONFIG.deployment.package,
          now: Date.now,
          readDelegations: (subaccountAddress) =>
            readDecibelDelegationsV1({
              tradingHttpUrl: MAINNET_CONFIG.tradingHttpUrl,
              subaccountAddress,
              apiKey,
            }),
          readAptBalanceOctas: (address) =>
            readDecibelAptBalanceOctasV1({
              fullnodeUrl: MAINNET_CONFIG.fullnodeUrl,
              address,
              nodeApiKey: apiKey,
            }),
          generateAgentKey: generateDecibelAgentKeyV1,
          readSubaccounts: (owner) =>
            readDecibelSubaccountsV1({
              tradingHttpUrl: MAINNET_CONFIG.tradingHttpUrl,
              owner,
              apiKey,
            }),
          readSubaccountOwner: (subaccountAddress) =>
            readDecibelSubaccountOwnerV1({
              fullnodeUrl: MAINNET_CONFIG.fullnodeUrl,
              subaccountAddress,
              nodeApiKey: apiKey,
            }),
          isWhitelisted: (owner) => {
            try {
              return loadDecibelWalletWhitelistV1().has(normalizeDecibelAddressV1(owner));
            } catch {
              return false;
            }
          },
          keystoreSecret: () =>
            resolveDecibelKeystoreSecretV1(context.environment, { create: true }) ?? '',
          gasSponsored: Boolean(context.environment.DECIBEL_GAS_STATION_API_KEY?.trim()),
          canSwitch: context.subaccountSwitch.canSwitch,
          switchNow: context.subaccountSwitch.switchNow,
          withdrawAgentGas: (agent, destination, amountOctas) =>
            withdrawDecibelAgentGasV1({
              network: MAINNET_CONFIG.network,
              fullnodeUrl: MAINNET_CONFIG.fullnodeUrl,
              nodeApiKey: apiKey,
              agent,
              destination,
              amountOctas,
              readBalanceOctas: () =>
                readDecibelAptBalanceOctasV1({
                  fullnodeUrl: MAINNET_CONFIG.fullnodeUrl,
                  address: agent.address,
                  nodeApiKey: apiKey,
                }),
            }),
        },
        { query: new URL(request.url ?? '/', 'http://localhost').searchParams, body },
      );
      if (result === null) return writeJson(response, 404, { error: 'NOT_FOUND' });
      writeJson(response, result.status, result.body);
    })().catch(() => writeJson(response, 503, { error: 'WALLET_STATUS_UNAVAILABLE' }));
    return;
  }
  if (pathname === '/api/telemetry') return writeJson(response, 200, context.getTelemetry());
  if (pathname === '/api/restart-safety' && request.method === 'GET') {
    void (async () => {
      const authenticated = await context.refreshAuthenticatedComponents();
      const journalObservedAt = Date.now();
      const unresolvedIntents = context.telemetryJournal.nonTerminal();
      const evaluatedAt = Date.now();
      const result = buildDecibelRestartSafetySnapshotV1({
        evaluatedAt,
        authenticatedObservedAt: authenticated.observedAt,
        authenticatedFreshnessLimitMs: 5_000,
        positionBase: authenticated.actualInventoryBase,
        openOrders: authenticated.openOrders,
        journalObservedAt,
        unresolvedIntents,
      });
      persistDecibelRestartSafetySnapshotV1(
        context.environment.DECIBEL_PRODUCTION_RESTART_SAFETY_PATH ??
          'config/production_state/decibel_restart_safety_v1.json',
        result,
      );
      writeJson(response, result.safeToRestart ? 200 : 409, result);
    })().catch((error: unknown) =>
      writeJson(response, 503, {
        safeToRestart: false,
        blocker: error instanceof Error ? error.message : 'RESTART_SAFETY_REFRESH_FAILED',
      }),
    );
    return;
  }
  if (pathname === '/api/runtime-snapshot')
    return writeJson(response, 200, {
      snapshot: context.getSnapshot(),
      supervisor: context.runtimeSupervisor.getSnapshot(),
      authenticatedEvidence: context.runtimeSupervisor.getAuthenticatedEvidenceDiagnostics(),
      sourceEvidence: context.source.readAuthenticatedEvidenceDiagnostics?.() ?? null,
      takeover: context.sessionController.getState().takeover,
      handoff:
        Number.isSafeInteger(Number(context.environment.DECIBEL_PRODUCTION_LEGACY_TAKEOVER_PID)) &&
        Number.isSafeInteger(
          Number(context.environment.DECIBEL_PRODUCTION_LEGACY_TAKEOVER_START_MS),
        )
          ? readDecibelLegacyHandoffV1(
              context.environment.DECIBEL_PRODUCTION_LEGACY_HANDOFF_PATH ??
                'config/production_state/decibel_legacy_handoff_27624.json',
              Number(context.environment.DECIBEL_PRODUCTION_LEGACY_TAKEOVER_PID),
              Number(context.environment.DECIBEL_PRODUCTION_LEGACY_TAKEOVER_START_MS),
            )
          : null,
    });
  if (pathname === '/api/events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    context.clients.add(response);
    response.write(`data: ${JSON.stringify(context.getTelemetry())}\n\n`);
    request.once('close', () => context.clients.delete(response));
    return;
  }
  if (pathname.startsWith('/api/')) return writeJson(response, 404, { error: 'NOT_FOUND' });
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = normalize(join(context.staticRoot, requested));
  if (
    !filePath.startsWith(context.staticRoot) ||
    !existsSync(filePath) ||
    !statSync(filePath).isFile()
  ) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' blob:; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  });
  createReadStream(filePath).pipe(response);
}
