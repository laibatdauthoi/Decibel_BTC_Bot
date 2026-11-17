/**
 * Encrypted agent key store (added 2026-11-17).
 *
 * The agent key is a bot-only Ed25519 key. The owner wallet (Petra) delegates trading on its
 * Decibel subaccount to the agent's address, so the owner's own private key never reaches the
 * bot. The agent key is stored encrypted (scrypt + AES-256-GCM) with DECIBEL_KEYSTORE_SECRET,
 * which lives only in `.env` / the server environment.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

export const DECIBEL_AGENT_KEYSTORE_FILE_V1 = 'agent_key_v1.json';
const SCRYPT_V1 = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const MINIMUM_SECRET_LENGTH_V1 = 16;

const KeystoreSchema = z.object({
  version: z.literal(1),
  address: z.string().regex(/^0x[0-9a-f]{64}$/),
  publicKey: z.string().regex(/^0x[0-9a-f]{64}$/),
  kdf: z.literal('scrypt'),
  salt: z.string().regex(/^[0-9a-f]{32}$/),
  iv: z.string().regex(/^[0-9a-f]{24}$/),
  tag: z.string().regex(/^[0-9a-f]{32}$/),
  ciphertext: z.string().regex(/^[0-9a-f]+$/),
  createdAt: z.number().int().nonnegative(),
});

export type decibel_agent_keystore_record_v1 = z.infer<typeof KeystoreSchema>;

export function resolveDecibelAgentKeystorePathV1(walletRoot: string): string {
  return join(walletRoot, DECIBEL_AGENT_KEYSTORE_FILE_V1);
}

function requireSecret(secret: string | undefined): string {
  if (secret === undefined || secret.length === 0)
    throw new Error('AGENT_KEYSTORE_SECRET_REQUIRED');
  if (secret.length < MINIMUM_SECRET_LENGTH_V1) throw new Error('AGENT_KEYSTORE_SECRET_TOO_SHORT');
  return secret;
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, 32, SCRYPT_V1);
}

/** Public part only; never needs the secret. */
export function readDecibelAgentKeystoreV1(path: string): decibel_agent_keystore_record_v1 | null {
  if (!existsSync(path)) return null;
  try {
    return KeystoreSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    throw new Error('AGENT_KEYSTORE_INVALID', { cause: error });
  }
}

export type decibel_agent_key_material_v1 = Readonly<{
  /** 32-byte Ed25519 private key, hex with 0x. */
  privateKeyHex: string;
  publicKeyHex: string;
  address: string;
}>;

/**
 * Creates the agent key once. `generate` returns fresh key material (the Aptos SDK in
 * production, a fixed key in tests). An existing keystore is never overwritten.
 */
export function createDecibelAgentKeystoreV1(
  path: string,
  secret: string | undefined,
  generate: () => decibel_agent_key_material_v1,
  now: number = Date.now(),
): decibel_agent_keystore_record_v1 {
  const checkedSecret = requireSecret(secret);
  if (existsSync(path)) throw new Error('AGENT_KEYSTORE_EXISTS');
  const material = generate();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(checkedSecret, salt), iv);
  cipher.setAAD(Buffer.from(material.address));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(material.privateKeyHex.replace(/^0x/, ''), 'hex')),
    cipher.final(),
  ]);
  const record = KeystoreSchema.parse({
    version: 1,
    address: material.address.toLowerCase(),
    publicKey: material.publicKeyHex.toLowerCase(),
    kdf: 'scrypt',
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    createdAt: now,
  });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return record;
}

/** Decrypts the agent private key. A wrong secret or a tampered file fails. */
export function unlockDecibelAgentKeystoreV1(
  path: string,
  secret: string | undefined,
): decibel_agent_key_material_v1 {
  const checkedSecret = requireSecret(secret);
  const record = readDecibelAgentKeystoreV1(path);
  if (record === null) throw new Error('AGENT_KEYSTORE_MISSING');
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(checkedSecret, Buffer.from(record.salt, 'hex')),
      Buffer.from(record.iv, 'hex'),
    );
    decipher.setAAD(Buffer.from(record.address));
    decipher.setAuthTag(Buffer.from(record.tag, 'hex'));
    const privateKey = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'hex')),
      decipher.final(),
    ]);
    return Object.freeze({
      privateKeyHex: `0x${privateKey.toString('hex')}`,
      publicKeyHex: record.publicKey,
      address: record.address,
    });
  } catch (error) {
    throw new Error('AGENT_KEYSTORE_UNLOCK_FAILED', { cause: error });
  }
}

/** Fresh agent key from the Aptos SDK. */
export async function generateDecibelAgentKeyV1(): Promise<decibel_agent_key_material_v1> {
  const { Account } = await import('@aptos-labs/ts-sdk');
  const Agent = Account.generate();
  return Object.freeze({
    privateKeyHex: Agent.privateKey.toHexString(),
    publicKeyHex: Agent.publicKey.toString(),
    address: Agent.accountAddress.toStringLong(),
  });
}
