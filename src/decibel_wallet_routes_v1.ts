/**
 * Dashboard wallet routes (added 2026-11-17). The connected Petra wallet is the identity:
 * the server lists its subaccounts, prepares the transactions Petra signs, and switches the
 * runtime to the chosen subaccount. The server never signs for the owner.
 *
 *   GET  /api/wallet/subaccounts?owner=  subaccounts with bot authorization (whitelisted only)
 *   POST /api/wallet/prepare             bot key (created once, automatically) + Petra payloads
 *   POST /api/wallet/revoke              Petra payload that withdraws the bot's access
 *   POST /api/wallet/subaccount          run the bot on this subaccount (switches when idle)
 *   POST /api/wallet/topup-gas           Petra payload that sends APT from the owner to the bot key
 *   POST /api/wallet/withdraw-gas        send the bot key's spare APT back to the owner (idle only)
 */
import type { Network } from '@aptos-labs/ts-sdk';
import { z } from 'zod';
import {
  createDecibelAgentKeystoreV1,
  readDecibelAgentKeystoreV1,
  resolveDecibelAgentKeystorePathV1,
  unlockDecibelAgentKeystoreV1,
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

/** Largest manual gas top-up (10 APT), the transfer builder's own limit. */
export const DECIBEL_MAXIMUM_AGENT_GAS_TOPUP_OCTAS_V1 = 1_000_000_000;

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
  /** A gas station sponsors the bot's transactions: no APT top-up is ever asked. */
  gasSponsored?: boolean;
  /** Whether the runtime may switch now, and the switch itself. */
  canSwitch: () => 'OK' | 'SESSION_ACTIVE' | 'OPEN_ORDERS' | 'DISABLED';
  switchNow: () => void;
  /**
   * Sends `amountOctas` of the bot key's APT (all of it minus the transfer's gas when omitted)
   * to `destination`, which is always the owner.
   */
  withdrawAgentGas: (
    agent: decibel_agent_key_material_v1,
    destination: string,
    amountOctas?: number,
  ) => Promise<Readonly<{ transactionHash: string; amountOctas: number }>>;
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
  /** APT held by the wallet's bot key (gas), in octas; null without a key or on a read error. */
  botGasOctas: number | null;
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
      return {
        status: 200,
        body: { owner, whitelisted: false, inUse, botGasOctas: null, subaccounts: [] },
      };
    let subaccounts: readonly decibel_wallet_subaccount_v1[];
    try {
      subaccounts = await dependencies.readSubaccounts(owner);
    } catch {
      return { status: 503, body: { error: 'SUBACCOUNTS_UNAVAILABLE' } };
    }
    const agent = readDecibelAgentKeystoreV1(keystorePathFor(owner, dependencies));
    const botGas =
      agent === null
        ? Promise.resolve(null)
        : dependencies.readAptBalanceOctas(agent.address).catch(() => null);
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
      botGasOctas: await botGas,
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
      const balance = dependencies.gasSponsored
        ? Number.POSITIVE_INFINITY
        : await dependencies.readAptBalanceOctas(agent.address).catch(() => 0);
      const base = {
        packageAddress: dependencies.packageAddress,
        subaccountAddress: target.subaccount,
        agentAddress: agent.address,
      };
      const payloads: Record<'delegate' | 'gasTopUp', decibel_wallet_payload_v1 | null> = {
        delegate: buildDecibelDelegationPayloadV1({ ...base, now: dependencies.now() }),
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
  if (pathname === '/api/wallet/revoke') {
    if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    const target = await provenTarget(input.body, dependencies);
    if ('status' in target) return target;
    // The running subaccount keeps its inventory protected only while the bot can still place
    // reduce-only TP and unwind orders: never withdraw that access mid-session.
    if (target.subaccount === inUse) {
      const state = dependencies.canSwitch();
      if (state === 'SESSION_ACTIVE')
        return { status: 409, body: { error: 'END_SESSION_BEFORE_REVOKING' } };
      if (state === 'OPEN_ORDERS')
        return { status: 409, body: { error: 'ORDERS_OPEN_BEFORE_REVOKING' } };
    }
    let agent: ReturnType<typeof readDecibelAgentKeystoreV1>;
    try {
      agent = readDecibelAgentKeystoreV1(keystorePathFor(target.owner, dependencies));
    } catch (error) {
      return { status: 400, body: { error: errorCode(error, 'WALLET_REVOKE_FAILED') } };
    }
    if (agent === null) return { status: 409, body: { error: 'ALREADY_REVOKED' } };
    let delegations: readonly decibel_delegation_v1[];
    try {
      delegations = await dependencies.readDelegations(target.subaccount);
    } catch {
      return { status: 503, body: { error: 'BOT_AUTHORIZATION_UNAVAILABLE' } };
    }
    const { status } = assessDecibelAgentDelegationV1(
      delegations,
      agent.address,
      dependencies.now(),
    );
    if (status !== 'ACTIVE' && status !== 'EXPIRING_SOON')
      return { status: 409, body: { error: 'ALREADY_REVOKED' } };
    const payload = buildDecibelRevokePayloadV1({
      packageAddress: dependencies.packageAddress,
      subaccountAddress: target.subaccount,
      agentAddress: agent.address,
    });
    return { status: 200, body: { payload } };
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
  if (pathname === '/api/wallet/topup-gas') {
    if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    const parsed = z.object({ owner: z.string(), amountOctas: z.unknown() }).safeParse(input.body);
    const owner = parsed.success ? optionalAddress(parsed.data.owner) : null;
    if (owner === null) return { status: 400, body: { error: 'WALLET_ADDRESS_INVALID' } };
    const amount = z
      .number()
      .int()
      .positive()
      .max(DECIBEL_MAXIMUM_AGENT_GAS_TOPUP_OCTAS_V1)
      .safeParse(parsed.data?.amountOctas);
    if (!amount.success) return { status: 400, body: { error: 'TOPUP_AMOUNT_INVALID' } };
    if (!dependencies.isWhitelisted(owner))
      return { status: 403, body: { error: 'WALLET_NOT_WHITELISTED' } };
    // Only the public address of the bot key is needed; Petra signs the transfer itself.
    const agent = readDecibelAgentKeystoreV1(keystorePathFor(owner, dependencies));
    if (agent === null) return { status: 409, body: { error: 'NO_BOT_KEY' } };
    return {
      status: 200,
      body: { payload: buildDecibelGasTopUpPayloadV1(agent.address, amount.data) },
    };
  }
  if (pathname === '/api/wallet/withdraw-gas') {
    if (method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
    const parsed = z
      .object({ owner: z.string(), amountOctas: z.unknown().optional() })
      .safeParse(input.body);
    const owner = parsed.success ? optionalAddress(parsed.data.owner) : null;
    if (owner === null) return { status: 400, body: { error: 'WALLET_ADDRESS_INVALID' } };
    const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional();
    const requested = amount.safeParse(parsed.data?.amountOctas);
    if (!requested.success) return { status: 400, body: { error: 'WITHDRAW_AMOUNT_INVALID' } };
    if (!dependencies.isWhitelisted(owner))
      return { status: 403, body: { error: 'WALLET_NOT_WHITELISTED' } };
    // Exits (TP, unwind) and cancels pay gas from this key: keep it while anything can trade.
    const state = dependencies.canSwitch();
    if (state === 'SESSION_ACTIVE')
      return { status: 409, body: { error: 'END_SESSION_BEFORE_WITHDRAWING_GAS' } };
    if (state === 'OPEN_ORDERS')
      return { status: 409, body: { error: 'ORDERS_OPEN_BEFORE_WITHDRAWING_GAS' } };
    let agent: decibel_agent_key_material_v1;
    try {
      const path = keystorePathFor(owner, dependencies);
      if (readDecibelAgentKeystoreV1(path) === null)
        return { status: 409, body: { error: 'NO_BOT_KEY' } };
      agent = unlockDecibelAgentKeystoreV1(path, dependencies.keystoreSecret());
    } catch (error) {
      return { status: 400, body: { error: errorCode(error, 'AGENT_KEYSTORE_UNLOCK_FAILED') } };
    }
    try {
      // The destination is the whitelisted owner, never another address from the request.
      const result = await dependencies.withdrawAgentGas(agent, owner, requested.data);
      return { status: 200, body: result };
    } catch (error) {
      const code = errorCode(error, 'GAS_WITHDRAW_FAILED');
      // The node's own message (no key material) explains a generic failure in the log.
      const detail = error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 400) : '';
      console.error(`DECIBEL_WALLET_GAS_WITHDRAW=FAILED CODE=${code} DETAIL=${detail}`);
      const refused = code === 'NOTHING_TO_WITHDRAW' || code === 'WITHDRAW_AMOUNT_ABOVE_AVAILABLE';
      return { status: refused ? 409 : 502, body: { error: code } };
    }
  }
  return null;
}

/**
 * Gas limit of the simulation that sizes a gas withdrawal. A mainnet APT transfer from the
 * bot key used about 5,000 gas units (2026-11-19), so a fixed 5,000 limit was rejected.
 */
export const DECIBEL_AGENT_GAS_WITHDRAW_PROBE_MAX_GAS_V1 = 20_000;

/** Gas limit of the submitted withdrawal: the simulated gas plus 20% headroom. */
export function sizeDecibelAgentGasWithdrawalMaxGasV1(simulatedGasUsed: number): number | null {
  return Number.isSafeInteger(simulatedGasUsed) && simulatedGasUsed > 0
    ? Math.ceil(simulatedGasUsed * 1.2)
    : null;
}

/**
 * Amount of a gas withdrawal: the whole balance minus the transfer's maximum fee (a sender
 * that cannot cover `maxGasAmount x gasUnitPrice` is rejected). The unused part of that fee
 * stays on the bot key. Null: nothing worth sending.
 */
export function planDecibelAgentGasWithdrawalV1(
  balanceOctas: number,
  gasUnitPrice: number,
  maxGasAmount: number = DECIBEL_AGENT_GAS_WITHDRAW_PROBE_MAX_GAS_V1,
): Readonly<{ amountOctas: number; maxGasAmount: number; gasUnitPrice: number }> | null {
  if (
    !Number.isSafeInteger(balanceOctas) ||
    !Number.isSafeInteger(gasUnitPrice) ||
    !Number.isSafeInteger(maxGasAmount)
  )
    return null;
  if (gasUnitPrice <= 0 || maxGasAmount <= 0) return null;
  const amountOctas = balanceOctas - maxGasAmount * gasUnitPrice;
  return amountOctas > 0 ? Object.freeze({ amountOctas, maxGasAmount, gasUnitPrice }) : null;
}

/**
 * Applies the operator's amount to a full-balance plan: the amount may not exceed what the
 * plan could send, since the sender must still cover the transfer's maximum fee.
 */
export function resolveDecibelAgentGasWithdrawalAmountV1(
  plan: ReturnType<typeof planDecibelAgentGasWithdrawalV1>,
  requestedOctas: number | undefined,
): NonNullable<ReturnType<typeof planDecibelAgentGasWithdrawalV1>> {
  if (plan === null) throw new Error('NOTHING_TO_WITHDRAW');
  if (requestedOctas === undefined) return plan;
  if (!Number.isSafeInteger(requestedOctas) || requestedOctas <= 0)
    throw new Error('WITHDRAW_AMOUNT_INVALID');
  if (requestedOctas > plan.amountOctas) throw new Error('WITHDRAW_AMOUNT_ABOVE_AVAILABLE');
  return Object.freeze({ ...plan, amountOctas: requestedOctas });
}

/** Signs and submits the gas withdrawal with the bot key, then waits for it on-chain. */
export async function withdrawDecibelAgentGasV1(
  input: Readonly<{
    network: Network;
    fullnodeUrl: string;
    nodeApiKey?: string | undefined;
    agent: decibel_agent_key_material_v1;
    destination: string;
    /** Omitted: everything above the transfer's maximum fee. */
    amountOctas?: number | undefined;
    readBalanceOctas: () => Promise<number>;
  }>,
): Promise<Readonly<{ transactionHash: string; amountOctas: number }>> {
  const { Account, Aptos, AptosConfig, Ed25519PrivateKey } = await import('@aptos-labs/ts-sdk');
  const Client = new Aptos(
    new AptosConfig({
      network: input.network,
      fullnode: input.fullnodeUrl,
      ...(input.nodeApiKey ? { clientConfig: { API_KEY: input.nodeApiKey } } : {}),
    }),
  );
  const Agent = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(input.agent.privateKeyHex),
  });
  if (
    normalizeDecibelAddressV1(Agent.accountAddress.toStringLong()) !==
    normalizeDecibelAddressV1(input.agent.address)
  )
    throw new Error('AGENT_KEY_ADDRESS_MISMATCH');
  const [balance, gas] = await Promise.all([
    input.readBalanceOctas(),
    Client.getGasPriceEstimation(),
  ]);
  const build = (plan: NonNullable<ReturnType<typeof planDecibelAgentGasWithdrawalV1>>) =>
    Client.transaction.build.simple({
      sender: Agent.accountAddress,
      data: {
        function: '0x1::aptos_account::transfer',
        functionArguments: [normalizeDecibelAddressV1(input.destination), plan.amountOctas],
      },
      options: { maxGasAmount: plan.maxGasAmount, gasUnitPrice: plan.gasUnitPrice },
    });
  // Simulate first: the gas a transfer needs is measured, not guessed.
  const probe = planDecibelAgentGasWithdrawalV1(balance, gas.gas_estimate);
  if (probe === null) throw new Error('NOTHING_TO_WITHDRAW');
  const [simulated] = await Client.transaction.simulate.simple({
    signerPublicKey: Agent.publicKey,
    transaction: await build(probe),
  });
  if (simulated?.success !== true)
    throw new Error(`GAS_WITHDRAW_SIMULATION_FAILED:${simulated?.vm_status ?? 'NO_RESULT'}`);
  const maxGasAmount = sizeDecibelAgentGasWithdrawalMaxGasV1(Number(simulated.gas_used));
  if (maxGasAmount === null) throw new Error('GAS_WITHDRAW_SIMULATION_FAILED:NO_GAS_USED');
  const plan = resolveDecibelAgentGasWithdrawalAmountV1(
    planDecibelAgentGasWithdrawalV1(balance, gas.gas_estimate, maxGasAmount),
    input.amountOctas,
  );
  const transaction = await build(plan);
  const pending = await Client.signAndSubmitTransaction({ signer: Agent, transaction });
  const committed = await Client.waitForTransaction({ transactionHash: pending.hash });
  if (!committed.success) throw new Error(`GAS_WITHDRAW_TRANSACTION_FAILED:${committed.vm_status}`);
  return Object.freeze({ transactionHash: pending.hash, amountOctas: plan.amountOctas });
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

/** Active subaccounts of an owner from the Decibel REST API, the primary one first. */
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
      )
      .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary)),
  );
}
