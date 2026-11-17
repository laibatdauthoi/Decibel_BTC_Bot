/**
 * Which key signs venue transactions (added 2026-11-17).
 *
 * - AGENT: the wallet workspace holds an agent keystore. It is unlocked with
 *   DECIBEL_KEYSTORE_SECRET and used only while the owner's delegation to it is active.
 * - PRIVATE_KEY: no agent keystore; the legacy DECIBEL_PRIVATE_KEY from `.env` signs.
 *
 * An agent keystore that cannot be unlocked or is not delegated never falls back to the
 * private key: the session does not start, so the signer is always the one the operator set up.
 */
import {
  readDecibelAgentKeystoreV1,
  resolveDecibelAgentKeystorePathV1,
  unlockDecibelAgentKeystoreV1,
} from './decibel_agent_keystore_v1.js';
import {
  assessDecibelAgentDelegationV1,
  type decibel_delegation_v1,
} from './decibel_agent_delegation_v1.js';
import {
  normalizeDecibelAddressV1,
  resolveDecibelWalletPathsV1,
} from './decibel_wallet_workspace_v1.js';

export type decibel_executor_signer_environment_v1 = Readonly<{
  DECIBEL_PRIVATE_KEY?: string;
  DECIBEL_OWNER_ADDRESS?: string;
  DECIBEL_KEYSTORE_SECRET?: string;
  DECIBEL_AGENT_KEYSTORE_PATH?: string;
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
  mode: 'AGENT' | 'PRIVATE_KEY';
  privateKeyHex: string;
  /** Agent address in AGENT mode; null in PRIVATE_KEY mode (derived by the SDK). */
  agentAddress: string | null;
}>;

export async function resolveDecibelExecutorSignerV1(
  environment: decibel_executor_signer_environment_v1,
  readDelegations: () => Promise<readonly decibel_delegation_v1[]>,
  now: () => number = Date.now,
  /** Address of a private key; enables the legacy-key check against the subaccount owner. */
  deriveAddress?: (privateKeyHex: string) => string,
): Promise<decibel_executor_signer_v1> {
  const keystorePath = resolveDecibelAgentKeystorePathFromEnvironmentV1(environment);
  if (keystorePath !== null && readDecibelAgentKeystoreV1(keystorePath) !== null) {
    const material = unlockDecibelAgentKeystoreV1(
      keystorePath,
      environment.DECIBEL_KEYSTORE_SECRET,
    );
    const delegation = assessDecibelAgentDelegationV1(
      await readDelegations(),
      material.address,
      now(),
    );
    if (delegation.status !== 'ACTIVE' && delegation.status !== 'EXPIRING_SOON')
      throw new Error(`AGENT_DELEGATION_${delegation.status}`);
    return Object.freeze({
      mode: 'AGENT',
      privateKeyHex: material.privateKeyHex,
      agentAddress: material.address,
    });
  }
  if (!environment.DECIBEL_PRIVATE_KEY) throw new Error('PRODUCTION_EXECUTOR_SIGNER_REQUIRED');
  // A subaccount picked in the wallet menu may belong to another owner: the legacy key may
  // sign only as that owner or as one of its active delegates.
  const owner = environment.DECIBEL_OWNER_ADDRESS?.trim();
  if (deriveAddress !== undefined && owner) {
    const keyAddress = normalizeDecibelAddressV1(deriveAddress(environment.DECIBEL_PRIVATE_KEY));
    if (keyAddress !== normalizeDecibelAddressV1(owner)) {
      const status = assessDecibelAgentDelegationV1(
        await readDelegations(),
        keyAddress,
        now(),
      ).status;
      if (status !== 'ACTIVE' && status !== 'EXPIRING_SOON')
        throw new Error('PRIVATE_KEY_NOT_AUTHORIZED_FOR_SUBACCOUNT');
    }
  }
  return Object.freeze({
    mode: 'PRIVATE_KEY',
    privateKeyHex: environment.DECIBEL_PRIVATE_KEY,
    agentAddress: null,
  });
}
