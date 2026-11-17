/**
 * Dashboard wallet routes (added 2026-11-17). The connected Petra wallet is the identity:
 * the server lists its subaccounts, prepares the transactions Petra signs, and switches the
 * runtime to the chosen subaccount. The server never signs for the owner.
 *
 *   GET  /api/wallet/subaccounts?owner=  subaccounts with bot authorization (whitelisted only)
 *   POST /api/wallet/prepare             bot key (created once, automatically) + Petra payloads
 *   POST /api/wallet/subaccount          run the bot on this subaccount (switches when idle)
 */
import { z } from 'zod';
import {
  createDecibelAgentKeystoreV1,
  readDecibelAgentKeystoreV1,
  resolveDecibelAgentKeystorePathV1,
  type decibel_agent_key_material_v1,
} from './decibel_agent_keystore_v1.js';
import {
  assessDecibelAgentDelegationV1,
  buildDecibelDelegationPayloadV1,
  buildDecibelGasTopUpPayloadV1,
  buildDecibelRevokePayloadV1,
  type decibel_agent_delegation_status_v1,
  type decibel_delegation_v1,
  type decibel_wallet_payload_v1,
} from './decibel_agent_delegation_v1.js';
import {
  normalizeDecibelAddressV1,
  resolveDecibelWalletPathsV1,
  writeDecibelSelectedSubaccountV1,
} from './decibel_wallet_workspace_v1.js';

/** Gas top-up is offered only when the bot key holds less than 0.1 APT. */
export const DECIBEL_MINIMUM_AGENT_GAS_OCTAS_V1 = 10_000_000;

export type decibel_wallet_subaccount_v1 = Readonly<{
  address: string;
  label: string | null;
  isPrimary: boolean;
}>;

export type decibel_wallet_route_dependencies_v1 = Readonly<{
  environment: NodeJS.ProcessEnv;
  packageAddress: string;
  now: () => number;
  readDelegations: (subaccount: string) => Promise<readonly decibel_delegation_v1[]>;
  readAptBalanceOctas: (address: string) => Promise<number>;
  generateAgentKey: () => Promise<decibel_agent_key_material_v1>;
  readSubaccounts: (owner: string) => Promise<readonly decibel_wallet_subaccount_v1[]>;
  readSubaccountOwner: (subaccount: string) => Promise<string>;
  isWhitelisted: (owner: string) => boolean;
  /** Secret that encrypts bot keys; created automatically when not configured. */
  keystoreSecret: () => string;
  /** Whether the runtime may switch now, and the switch itself. */
  canSwitch: () => 'OK' | 'SESSION_ACTIVE' | 'OPEN_ORDERS' | 'DISABLED';
  switchNow: () => void;
  dataRoot?: string;
  selectionPath?: string;
}>;

type route_result_v1 = Readonly<{ status: number; body: unknown }>;

function optionalAddress(value: string | null | undefined): string | null {
  try {
    return value?.trim() ? normalizeDecibelAddressV1(value) : null;
  } catch {
    return null;
  }
}

function errorCode(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  return /^[A-Z_:0-9]+$/.test(message) ? message : fallback;
}

function keystorePathFor(owner: string, dependencies: decibel_wallet_route_dependencies_v1) {
  return resolveDecibelAgentKeystorePathV1(
    resolveDecibelWalletPathsV1(owner, dependencies.dataRoot).root,
  );
}

/** Owner + subaccount from a POST body, proven: whitelisted and owned on-chain. */
async function provenTarget(
  body: unknown,
  dependencies: decibel_wallet_route_dependencies_v1,
): Promise<Readonly<{ owner: string; subaccount: string }> | route_result_v1> {
  const parsed = z.object({ owner: z.string(), subaccount: z.string() }).safeParse(body);
  const owner = parsed.success ? optionalAddress(parsed.data.owner) : null;
  const subaccount = parsed.success ? optionalAddress(parsed.data.subaccount) : null;
  if (owner === null || subaccount === null)
    return { status: 400, body: { error: 'WALLET_ADDRESS_INVALID' } };
  if (!dependencies.isWhitelisted(owner))
    return { status: 403, body: { error: 'WALLET_NOT_WHITELISTED' } };
  let chainOwner: string;
  try {
    chainOwner = normalizeDecibelAddressV1(await dependencies.readSubaccountOwner(subaccount));
  } catch {
    return { status: 503, body: { error: 'SUBACCOUNT_OWNER_UNAVAILABLE' } };
  }
  if (chainOwner !== owner) return { status: 403, body: { error: 'SUBACCOUNT_NOT_OWNED' } };
  return { owner, subaccount };
}

export type decibel_wallet_subaccounts_response_v1 = Readonly<{
  owner: string;
  whitelisted: boolean;
  inUse: string | null;
  subaccounts: readonly (decibel_wallet_subaccount_v1 &
    Readonly<{ authorization: decibel_agent_delegation_status_v1 | null }>)[];
}>;

export async function handleDecibelWalletRequestV1(
  method: string,
  pathname: string,
  dependencies: decibel_wallet_route_dependencies_v1,
  input: Readonly<{ query?: URLSearchParams; body?: unknown }> = {},
): Promise<route_result_v1 | null> {
  const inUse = optionalAddress(dependencies.environment.DECIBEL_SUBACCOUNT_ADDRESS);
  if (pathname === '/api/wallet/subaccounts') {
    if (method !== 'GET') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    const owner = optionalAddress(input.query?.get('owner'));
    if (owner === null) return { status: 400, body: { error: 'WALLET_ADDRESS_INVALID' } };
    if (!dependencies.isWhitelisted(owner))
      return { status: 200, body: { owner, whitelisted: false, inUse, subaccounts: [] } };
    let subaccounts: readonly decibel_wallet_subaccount_v1[];
    try {
      subaccounts = await dependencies.readSubaccounts(owner);
    } catch {
      return { status: 503, body: { error: 'SUBACCOUNTS_UNAVAILABLE' } };
    }
    const agent = readDecibelAgentKeystoreV1(keystorePathFor(owner, dependencies));
    const authorizations = await Promise.all(
      subaccounts.map(async (row) => {
        if (agent === null) return null;
        try {
          return assessDecibelAgentDelegationV1(
            await dependencies.readDelegations(row.address),
            agent.address,
            dependencies.now(),
          );
        } catch {
          return null;
        }
      }),
    );
    const body: decibel_wallet_subaccounts_response_v1 = {
      owner,
      whitelisted: true,
      inUse,
      subaccounts: subaccounts.map((row, index) => ({
        ...row,
        authorization: authorizations[index] ?? null,
      })),
    };
    return { status: 200, body };
  }
  if (pathname === '/api/wallet/prepare') {
    if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    const target = await provenTarget(input.body, dependencies);
    if ('status' in target) return target;
    const path = keystorePathFor(target.owner, dependencies);
    try {
      let agent = readDecibelAgentKeystoreV1(path);
      if (agent === null) {
        const material = await dependencies.generateAgentKey();
        agent = createDecibelAgentKeystoreV1(
          path,
          dependencies.keystoreSecret(),
          () => material,
          dependencies.now(),
        );
      }
      const balance = await dependencies.readAptBalanceOctas(agent.address).catch(() => 0);
      const base = {
        packageAddress: dependencies.packageAddress,
        subaccountAddress: target.subaccount,
        agentAddress: agent.address,
      };
      const payloads: Record<'delegate' | 'revoke' | 'gasTopUp', decibel_wallet_payload_v1 | null> =
        {
          delegate: buildDecibelDelegationPayloadV1({ ...base, now: dependencies.now() }),
          revoke: buildDecibelRevokePayloadV1(base),
          gasTopUp:
            balance < DECIBEL_MINIMUM_AGENT_GAS_OCTAS_V1
              ? buildDecibelGasTopUpPayloadV1(agent.address)
              : null,
        };
      return { status: 200, body: { payloads } };
    } catch (error) {
      return { status: 400, body: { error: errorCode(error, 'WALLET_PREPARE_FAILED') } };
    }
  }
  if (pathname === '/api/wallet/subaccount') {
    if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    const target = await provenTarget(input.body, dependencies);
    if ('status' in target) return target;
    if (target.subaccount === inUse)
      return { status: 200, body: { status: 'IN_USE', subaccount: target.subaccount } };
    const allowed = dependencies.canSwitch();
    if (allowed === 'SESSION_ACTIVE')
      return { status: 409, body: { error: 'END_SESSION_BEFORE_SWITCHING' } };
    // The wallet's subaccounts share one journal: a resting or unreconciled order of the
    // current subaccount must settle first, or the next run would look for it in the new one.
    if (allowed === 'OPEN_ORDERS')
      return { status: 409, body: { error: 'ORDERS_OPEN_BEFORE_SWITCHING' } };
    if (allowed === 'DISABLED')
      return { status: 409, body: { error: 'SUBACCOUNT_SWITCH_DISABLED' } };
    writeDecibelSelectedSubaccountV1(
      { subaccount: target.subaccount, owner: target.owner, selectedAt: dependencies.now() },
      dependencies.selectionPath,
    );
    dependencies.switchNow();
    return { status: 200, body: { status: 'SWITCHING', subaccount: target.subaccount } };
  }
  return null;
}

/** APT balance through the `0x1::coin::balance` view (covers coin and fungible-asset APT). */
export async function readDecibelAptBalanceOctasV1(
  input: Readonly<{
    fullnodeUrl: string;
    address: string;
    nodeApiKey?: string | undefined;
    fetchImpl?: typeof fetch;
  }>,
): Promise<number> {
  const response = await (input.fetchImpl ?? fetch)(
    `${input.fullnodeUrl.replace(/\/+$/, '')}/view`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(input.nodeApiKey ? { Authorization: `Bearer ${input.nodeApiKey}` } : {}),
      },
      body: JSON.stringify({
        function: '0x1::coin::balance',
        type_arguments: ['0x1::aptos_coin::AptosCoin'],
        arguments: [normalizeDecibelAddressV1(input.address)],
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`APT_BALANCE_READ_FAILED:HTTP_${response.status}`);
  const parsed = z.tuple([z.string().regex(/^\d+$/)]).safeParse(await response.json());
  if (!parsed.success) throw new Error('APT_BALANCE_RESPONSE_INVALID');
  return Number(parsed.data[0]);
}

const SubaccountsSchema = z.array(
  z.object({
    subaccount_address: z.string(),
    is_primary: z.boolean(),
    is_active: z.boolean().optional(),
    custom_label: z.string().nullable(),
  }),
);

/** Active subaccounts of an owner from the Decibel REST API. */
export async function readDecibelSubaccountsV1(
  input: Readonly<{
    tradingHttpUrl: string;
    owner: string;
    apiKey?: string | undefined;
    fetchImpl?: typeof fetch;
  }>,
): Promise<readonly decibel_wallet_subaccount_v1[]> {
  const query = new URLSearchParams({ owner: normalizeDecibelAddressV1(input.owner) });
  const response = await (input.fetchImpl ?? fetch)(
    `${input.tradingHttpUrl.replace(/\/+$/, '')}/api/v1/subaccounts?${query.toString()}`,
    {
      headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {},
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`SUBACCOUNTS_READ_FAILED:HTTP_${response.status}`);
  const parsed = SubaccountsSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('SUBACCOUNTS_RESPONSE_INVALID');
  return Object.freeze(
    parsed.data
      .filter((row) => row.is_active !== false)
      .map((row) =>
        Object.freeze({
          address: normalizeDecibelAddressV1(row.subaccount_address),
          label: row.custom_label,
          isPrimary: row.is_primary,
        }),
      ),
  );
}
