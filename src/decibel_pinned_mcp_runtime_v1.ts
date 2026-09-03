import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DECIBEL_PINNED_MCP_PACKAGE = '@decibeltrade/cli' as const;
export const DECIBEL_PINNED_MCP_VERSION = '0.1.2' as const;
export type decibel_mcp_launch_mode_v1 = 'PINNED_LOCAL_ENTRYPOINT' | 'NPX_LEGACY';
export type decibel_pinned_mcp_runtime_metadata_v1 = Readonly<{
  packageName: string;
  packageVersion: string;
  nodeExecutable: string;
  entrypoint: string;
  packageJsonSha256: string;
  entrypointSha256: string;
  installedAt: string;
}>;
const sha256File = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

export function validateDecibelPinnedMcpRuntimeV1(environment: NodeJS.ProcessEnv) {
  const nodeExecutable = environment.DECIBEL_MCP_NODE_EXECUTABLE;
  const entrypoint = environment.DECIBEL_MCP_ENTRYPOINT;
  if (!nodeExecutable || !existsSync(nodeExecutable)) throw new Error('MCP_PINNED_NODE_MISSING');
  if (!entrypoint || !existsSync(entrypoint)) throw new Error('MCP_PINNED_ENTRYPOINT_MISSING');
  const metadataPath =
    environment.DECIBEL_MCP_RUNTIME_METADATA ??
    resolve(dirname(entrypoint), '..', '..', '..', '..', 'decibel-mcp-runtime-v1.json');
  if (!existsSync(metadataPath)) throw new Error('MCP_PINNED_RUNTIME_HASH_MISMATCH');
  const metadata = JSON.parse(
    readFileSync(metadataPath, 'utf8'),
  ) as decibel_pinned_mcp_runtime_metadata_v1;
  const nodeVersion = execFileSync(nodeExecutable, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  if (!/^v22\./u.test(nodeVersion)) throw new Error('MCP_PINNED_NODE_VERSION_INVALID');
  if (
    metadata.packageName !== DECIBEL_PINNED_MCP_PACKAGE ||
    metadata.packageVersion !== DECIBEL_PINNED_MCP_VERSION
  )
    throw new Error('MCP_PINNED_PACKAGE_VERSION_MISMATCH');
  if (
    resolve(metadata.nodeExecutable) !== resolve(nodeExecutable) ||
    resolve(metadata.entrypoint) !== resolve(entrypoint) ||
    sha256File(entrypoint) !== metadata.entrypointSha256
  )
    throw new Error('MCP_PINNED_RUNTIME_HASH_MISMATCH');
  const packageJson = resolve(dirname(entrypoint), '..', 'package.json');
  if (!existsSync(packageJson) || sha256File(packageJson) !== metadata.packageJsonSha256)
    throw new Error('MCP_PINNED_RUNTIME_HASH_MISMATCH');
  return Object.freeze({
    nodeExecutable,
    entrypoint,
    metadataPath,
    nodeVersion,
    cliVersion: metadata.packageVersion,
    launchMode: 'PINNED_LOCAL_ENTRYPOINT' as const,
    npxUsed: false as const,
  });
}
