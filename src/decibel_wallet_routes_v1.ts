/**
 * Dashboard wallet routes (added 2026-11-17): agent key status, agent creation and the Petra
 * payloads for delegation, gas top-up and revocation. The server never signs for the owner;
 * Petra signs those transactions in the browser.
 *
 *   GET  /api/wallet        status and payloads
 *   POST /api/wallet/agent  create the agent key once (needs DECIBEL_KEYSTORE_SECRET)
 */
import { z } from 'zod';
import {
  createDecibelAgentKeystoreV1,
  readDecibelAgentKeystoreV1,
  type decibel_agent_key_material_v1,
} from './decibel_agent_keystore_v1.js';
import {
  assessDecibelAgentDelegationV1,
  buildDecibelDelegationPayloadV1,
  buildDecibelGasTopUpPayloadV1,
  buildDecibelRevokePayloadV1,
  DECIBEL_AGENT_DELEGATION_DAYS_V1,
  type decibel_agent_delegation_status_v1,
  type decibel_delegation_v1,
  type decibel_wallet_payload_v1,
} from './decibel_agent_delegation_v1.js';
import { resolveDecibelAgentKeystorePathFromEnvironmentV1 } from './decibel_executor_signer_v1.js';
import { normalizeDecibelAddressV1 } from './decibel_wallet_workspace_v1.js';

export type decibel_wallet_route_dependencies_v1 = Readonly<{
  environment: NodeJS.ProcessEnv;
  packageAddress: string;
  now: () => number;
  readDelegations: (subaccount: string) => Promise<readonly decibel_delegation_v1[]>;
  readAptBalanceOctas: (address: string) => Promise<number>;
  generateAgentKey: () => Promise<decibel_agent_key_material_v1>;
}>;

export type decibel_wallet_status_v1 = Readonly<{
  ownerAddress: string | null;
  subaccountAddress: string | null;
  /** Signer the next session will use. */
  signerMode: 'AGENT' | 'PRIVATE_KEY' | 'NONE';
  keystoreSecretConfigured: boolean;
  agent: Readonly<{
    address: string;
    createdAt: number;
    aptBalanceOctas: number | null;
  }> | null;
  delegation: decibel_agent_delegation_status_v1 | null;
  delegationError: string | null;
  delegationDays: number;
  payloads: Readonly<{
    delegate: decibel_wallet_payload_v1;
    revoke: decibel_wallet_payload_v1;
    gasTopUp: decibel_wallet_payload_v1;
  }> | null;
}>;

function optionalAddress(value: string | undefined): string | null {
  try {
    return value?.trim() ? normalizeDecibelAddressV1(value) : null;
  } catch {
    return null;
  }
}

export async function readDecibelWalletStatusV1(
  dependencies: decibel_wallet_route_dependencies_v1,
): Promise<decibel_wallet_status_v1> {
  const environment = dependencies.environment;
  const subaccountAddress = optionalAddress(environment.DECIBEL_SUBACCOUNT_ADDRESS);
  const keystorePath = resolveDecibelAgentKeystorePathFromEnvironmentV1(environment);
  const record = keystorePath === null ? null : readDecibelAgentKeystoreV1(keystorePath);
  let delegation: decibel_agent_delegation_status_v1 | null = null;
  let delegationError: string | null = null;
  let aptBalanceOctas: number | null = null;
  if (record !== null && subaccountAddress !== null) {
    const [delegations, balance] = await Promise.allSettled([
      dependencies.readDelegations(subaccountAddress),
      dependencies.readAptBalanceOctas(record.address),
    ]);
    if (delegations.status === 'fulfilled')
      delegation = assessDecibelAgentDelegationV1(
        delegations.value,
        record.address,
        dependencies.now(),
      );
    else
      delegationError =
        delegations.reason instanceof Error
          ? delegations.reason.message
          : 'DELEGATIONS_UNAVAILABLE';
    if (balance.status === 'fulfilled') aptBalanceOctas = balance.value;
  }
  return Object.freeze({
    ownerAddress: optionalAddress(environment.DECIBEL_OWNER_ADDRESS),
    subaccountAddress,
    signerMode:
      record !== null ? 'AGENT' : environment.DECIBEL_PRIVATE_KEY ? 'PRIVATE_KEY' : 'NONE',
    keystoreSecretConfigured: (environment.DECIBEL_KEYSTORE_SECRET?.length ?? 0) >= 16,
    agent:
      record === null
        ? null
        : Object.freeze({ address: record.address, createdAt: record.createdAt, aptBalanceOctas }),
    delegation,
    delegationError,
    delegationDays: DECIBEL_AGENT_DELEGATION_DAYS_V1,
    payloads:
      record === null || subaccountAddress === null
        ? null
        : Object.freeze({
            delegate: buildDecibelDelegationPayloadV1({
              packageAddress: dependencies.packageAddress,
              subaccountAddress,
              agentAddress: record.address,
              now: dependencies.now(),
            }),
            revoke: buildDecibelRevokePayloadV1({
              packageAddress: dependencies.packageAddress,
              subaccountAddress,
              agentAddress: record.address,
            }),
            gasTopUp: buildDecibelGasTopUpPayloadV1(record.address),
          }),
  });
}

export async function handleDecibelWalletRequestV1(
  method: string,
  pathname: string,
  dependencies: decibel_wallet_route_dependencies_v1,
): Promise<Readonly<{ status: number; body: unknown }> | null> {
  if (pathname === '/api/wallet') {
    if (method !== 'GET') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    return { status: 200, body: await readDecibelWalletStatusV1(dependencies) };
  }
  if (pathname === '/api/wallet/agent') {
    if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    const keystorePath = resolveDecibelAgentKeystorePathFromEnvironmentV1(dependencies.environment);
    if (keystorePath === null) return { status: 409, body: { error: 'WALLET_OWNER_UNKNOWN' } };
    try {
      const material = await dependencies.generateAgentKey();
      createDecibelAgentKeystoreV1(
        keystorePath,
        dependencies.environment.DECIBEL_KEYSTORE_SECRET,
        () => material,
        dependencies.now(),
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : 'AGENT_CREATE_FAILED';
      return {
        status: code === 'AGENT_KEYSTORE_EXISTS' ? 409 : 400,
        body: {
          error: z
            .string()
            .regex(/^[A-Z_]+$/)
            .safeParse(code).success
            ? code
            : 'AGENT_CREATE_FAILED',
        },
      };
    }
    return { status: 201, body: await readDecibelWalletStatusV1(dependencies) };
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
