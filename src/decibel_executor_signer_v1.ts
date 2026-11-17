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

export async function resolveDecibelExecutorSignerV1(
  environment: decibel_executor_signer_environment_v1,
  readDelegations: () => Promise<readonly decibel_delegation_v1[]>,
  now: () => number = Date.now,
): Promise<decibel_executor_signer_v1> {
  const keystorePath = resolveDecibelAgentKeystorePathFromEnvironmentV1(environment);
  if (keystorePath === null || readDecibelAgentKeystoreV1(keystorePath) === null)
    throw new Error('BOT_NOT_AUTHORIZED_CONNECT_WALLET');
  const material = unlockDecibelAgentKeystoreV1(
    keystorePath,
    resolveDecibelKeystoreSecretV1(environment, { create: false }),
  );
  const delegation = assessDecibelAgentDelegationV1(
    await readDelegations(),
    material.address,
    now(),
  );
  if (delegation.status !== 'ACTIVE' && delegation.status !== 'EXPIRING_SOON')
    throw new Error(`AGENT_DELEGATION_${delegation.status}`);
  return Object.freeze({ privateKeyHex: material.privateKeyHex, agentAddress: material.address });
}
