/**
 * Agent delegation on a Decibel subaccount (added 2026-11-17).
 *
 * The owner wallet signs, in Petra, one `dex_accounts_entry::delegate_trading_to_for_subaccount`
 * transaction that lets the agent address trade on the subaccount until an expiry. The bot
 * reads the active delegations from the Decibel REST API and only signs with the agent while
 * that delegation is active. Revocation (`revoke_delegation`) is one more Petra transaction.
 */
import { z } from 'zod';
import { normalizeDecibelAddressV1 } from './decibel_wallet_workspace_v1.js';

export const DECIBEL_AGENT_DELEGATION_DAYS_V1 = 30;
/** Gas top-up suggested for a new agent: 0.5 APT. */
export const DECIBEL_AGENT_GAS_TOPUP_OCTAS_V1 = 50_000_000;
const EXPIRING_SOON_MS_V1 = 3 * 24 * 60 * 60 * 1000;

const DelegationsSchema = z.array(
  z.object({
    delegated_account: z.string(),
    permission_type: z.string(),
    expiration_time_s: z.number().nullable(),
  }),
);

export type decibel_delegation_v1 = Readonly<{
  delegatedAccount: string;
  permissionType: string;
  expiresAtMs: number | null;
}>;

export async function readDecibelDelegationsV1(
  input: Readonly<{
    tradingHttpUrl: string;
    subaccountAddress: string;
    apiKey?: string | undefined;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }>,
): Promise<readonly decibel_delegation_v1[]> {
  const query = new URLSearchParams({
    subaccount: normalizeDecibelAddressV1(input.subaccountAddress),
  });
  const response = await (input.fetchImpl ?? fetch)(
    `${input.tradingHttpUrl.replace(/\/+$/, '')}/api/v1/delegations?${query.toString()}`,
    {
      headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {},
      signal: AbortSignal.timeout(input.timeoutMs ?? 10_000),
    },
  );
  if (!response.ok) throw new Error(`DELEGATIONS_READ_FAILED:HTTP_${response.status}`);
  const parsed = DelegationsSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('DELEGATIONS_RESPONSE_INVALID');
  return Object.freeze(
    parsed.data.map((delegation) =>
      Object.freeze({
        delegatedAccount: normalizeDecibelAddressV1(delegation.delegated_account),
        permissionType: delegation.permission_type,
        expiresAtMs:
          delegation.expiration_time_s === null ? null : delegation.expiration_time_s * 1000,
      }),
    ),
  );
}

export type decibel_agent_delegation_status_v1 = Readonly<{
  status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING';
  expiresAtMs: number | null;
  permissionType: string | null;
}>;

export function assessDecibelAgentDelegationV1(
  delegations: readonly decibel_delegation_v1[],
  agentAddress: string,
  now: number,
): decibel_agent_delegation_status_v1 {
  const agent = normalizeDecibelAddressV1(agentAddress);
  const match = delegations.find((delegation) => delegation.delegatedAccount === agent);
  if (match === undefined) return { status: 'MISSING', expiresAtMs: null, permissionType: null };
  const base = { expiresAtMs: match.expiresAtMs, permissionType: match.permissionType };
  if (match.expiresAtMs !== null && match.expiresAtMs <= now) return { status: 'EXPIRED', ...base };
  if (match.expiresAtMs !== null && match.expiresAtMs - now <= EXPIRING_SOON_MS_V1)
    return { status: 'EXPIRING_SOON', ...base };
  return { status: 'ACTIVE', ...base };
}

/** AIP-62 `signAndSubmitTransaction` payload for Petra. Arguments are plain strings. */
export type decibel_wallet_payload_v1 = Readonly<{
  function: string;
  typeArguments: readonly string[];
  functionArguments: readonly (string | null)[];
}>;

export function buildDecibelDelegationPayloadV1(
  input: Readonly<{
    packageAddress: string;
    subaccountAddress: string;
    agentAddress: string;
    now: number;
    days?: number;
  }>,
): decibel_wallet_payload_v1 {
  const days = input.days ?? DECIBEL_AGENT_DELEGATION_DAYS_V1;
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('DELEGATION_DAYS_INVALID');
  const expirationSecs = Math.floor(input.now / 1000) + days * 24 * 60 * 60;
  return Object.freeze({
    function: `${normalizeDecibelAddressV1(input.packageAddress)}::dex_accounts_entry::delegate_trading_to_for_subaccount`,
    typeArguments: [],
    functionArguments: [
      normalizeDecibelAddressV1(input.subaccountAddress),
      normalizeDecibelAddressV1(input.agentAddress),
      String(expirationSecs),
    ],
  });
}

export function buildDecibelRevokePayloadV1(
  input: Readonly<{ packageAddress: string; subaccountAddress: string; agentAddress: string }>,
): decibel_wallet_payload_v1 {
  return Object.freeze({
    function: `${normalizeDecibelAddressV1(input.packageAddress)}::dex_accounts_entry::revoke_delegation`,
    typeArguments: [],
    functionArguments: [
      normalizeDecibelAddressV1(input.subaccountAddress),
      normalizeDecibelAddressV1(input.agentAddress),
    ],
  });
}

export function buildDecibelGasTopUpPayloadV1(
  agentAddress: string,
  octas: number = DECIBEL_AGENT_GAS_TOPUP_OCTAS_V1,
): decibel_wallet_payload_v1 {
  if (!Number.isSafeInteger(octas) || octas <= 0 || octas > 10 * 100_000_000)
    throw new Error('GAS_TOPUP_AMOUNT_INVALID');
  return Object.freeze({
    function: '0x1::aptos_account::transfer',
    typeArguments: [],
    functionArguments: [normalizeDecibelAddressV1(agentAddress), String(octas)],
  });
}
