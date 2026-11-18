/**
 * Which key signs venue transactions (added 2026-11-17).
 *
 * Only the bot key of the wallet signs: created by the bot (never the owner's key), stored
 * encrypted in the wallet workspace, and used only while the owner's Petra authorization of
 * it on the subaccount is active. There is no private-key fallback; without an active
 * authorization the session does not start.
 */
import {
  readDecibelAgentKeystoreV1,
  resolveDecibelAgentKeystorePathV1,
  resolveDecibelKeystoreSecretV1,
  unlockDecibelAgentKeystoreV1,
} from './decibel_agent_keystore_v1.js';
import {
  assessDecibelAgentDelegationV1,
  type decibel_delegation_v1,
} from './decibel_agent_delegation_v1.js';
import { resolveDecibelWalletPathsV1 } from './decibel_wallet_workspace_v1.js';

export type decibel_executor_signer_environment_v1 = Readonly<{
  DECIBEL_OWNER_ADDRESS?: string;
  DECIBEL_KEYSTORE_SECRET?: string;
  DECIBEL_AGENT_KEYSTORE_PATH?: string;
  DECIBEL_KEYSTORE_SECRET_PATH?: string;
}>;

export function resolveDecibelAgentKeystorePathFromEnvironmentV1(
  environment: decibel_executor_signer_environment_v1,
): string | null {
  if (environment.DECIBEL_AGENT_KEYSTORE_PATH) return environment.DECIBEL_AGENT_KEYSTORE_PATH;
  const owner = environment.DECIBEL_OWNER_ADDRESS?.trim();
  if (!owner) return null;
  return resolveDecibelAgentKeystorePathV1(resolveDecibelWalletPathsV1(owner).root);
}

export type decibel_executor_signer_v1 = Readonly<{
  privateKeyHex: string;
  agentAddress: string;
}>;

/**
 * Whether the wallet's bot key may trade the subaccount now, read without unlocking the key:
 * null when it may, else the refusal code. Checked before every live session start, because
 * the owner can revoke the access in Petra while the runtime is idle.
 */
export async function checkDecibelBotAuthorizationV1(
  environment: decibel_executor_signer_environment_v1,
  readDelegations: () => Promise<readonly decibel_delegation_v1[]>,
  now: () => number = Date.now,
): Promise<string | null> {
  const keystorePath = resolveDecibelAgentKeystorePathFromEnvironmentV1(environment);
  const record = keystorePath === null ? null : readDecibelAgentKeystoreV1(keystorePath);
  if (record === null) return 'BOT_NOT_AUTHORIZED_CONNECT_WALLET';
  const { status } = assessDecibelAgentDelegationV1(await readDelegations(), record.address, now());
  return status === 'ACTIVE' || status === 'EXPIRING_SOON' ? null : `AGENT_DELEGATION_${status}`;
}

export async function resolveDecibelExecutorSignerV1(
  environment: decibel_executor_signer_environment_v1,
  readDelegations: () => Promise<readonly decibel_delegation_v1[]>,
  now: () => number = Date.now,
): Promise<decibel_executor_signer_v1> {
  const refusal = await checkDecibelBotAuthorizationV1(environment, readDelegations, now);
  if (refusal !== null) throw new Error(refusal);
  const material = unlockDecibelAgentKeystoreV1(
    resolveDecibelAgentKeystorePathFromEnvironmentV1(environment) ?? '',
    resolveDecibelKeystoreSecretV1(environment, { create: false }),
  );
  return Object.freeze({ privateKeyHex: material.privateKeyHex, agentAddress: material.address });
}
