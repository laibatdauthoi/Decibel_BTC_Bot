import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildDecibelMcpMainnetReadOnlyEnvironmentV1 } from '../src/decibel_mcp_execution_adapter_v1.js';
import {
  decibel_mcp_stderr_capture_v1,
  resolveDecibelMcpLauncherV1,
} from '../src/decibel_mcp_execution_transport_v1.js';
import { validateDecibelPinnedMcpRuntimeV1 } from '../src/decibel_pinned_mcp_runtime_v1.js';

const Node22 = join(process.env.LOCALAPPDATA!, 'DecibelTools', 'node-v22.23.2-win-x64', 'node.exe');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
function fixture(overrides: Partial<{ version: string; entryHash: string; node: string }> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pinned-mcp-'));
  const packageRoot = join(root, 'node_modules', '@decibeltrade', 'cli');
  const entrypoint = join(packageRoot, 'dist', 'mcp.js');
  mkdirSync(join(packageRoot, 'dist'), { recursive: true });
  const packageText = JSON.stringify({
    name: '@decibeltrade/cli',
    version: overrides.version ?? '0.1.2',
    bin: { 'decibel-mcp': 'dist/mcp.js' },
  });
  const entryText = 'process.stdin.resume();\n';
  writeFileSync(join(packageRoot, 'package.json'), packageText);
  writeFileSync(entrypoint, entryText);
  const metadataPath = join(root, 'decibel-mcp-runtime-v1.json');
  writeFileSync(
    metadataPath,
    JSON.stringify({
      packageName: '@decibeltrade/cli',
      packageVersion: overrides.version ?? '0.1.2',
      nodeExecutable: overrides.node ?? Node22,
      entrypoint,
      packageJsonSha256: sha(packageText),
      entrypointSha256: overrides.entryHash ?? sha(entryText),
      installedAt: '2026-01-01T00:00:00Z',
    }),
  );
  return {
    DECIBEL_MCP_NODE_EXECUTABLE: overrides.node ?? Node22,
    DECIBEL_MCP_ENTRYPOINT: entrypoint,
    DECIBEL_MCP_RUNTIME_METADATA: metadataPath,
  };
}

describe('Decibel pinned local MCP runtime V1', () => {
  it('launches pinned Node directly with only the local entrypoint', () => {
    const environment = fixture();
    const launcher = resolveDecibelMcpLauncherV1(environment);
    expect(launcher).toMatchObject({
      executable: Node22,
      arguments: [environment.DECIBEL_MCP_ENTRYPOINT],
      launchMode: 'PINNED_LOCAL_ENTRYPOINT',
      npxUsed: false,
    });
    expect(launcher.arguments.join(' ')).not.toMatch(/npx|npm/iu);
  });
  it('validates Node 22 and pinned CLI 0.1.2', () => {
    expect(validateDecibelPinnedMcpRuntimeV1(fixture())).toMatchObject({
      nodeVersion: 'v22.23.2',
      cliVersion: '0.1.2',
      npxUsed: false,
    });
  });
  it('fails closed when Node is missing', () => {
    expect(() =>
      validateDecibelPinnedMcpRuntimeV1({
        ...fixture(),
        DECIBEL_MCP_NODE_EXECUTABLE: 'Z:\\missing-node.exe',
      }),
    ).toThrow('MCP_PINNED_NODE_MISSING');
  });
  it('fails closed when entrypoint is missing', () => {
    expect(() =>
      validateDecibelPinnedMcpRuntimeV1({
        ...fixture(),
        DECIBEL_MCP_ENTRYPOINT: 'Z:\\missing-mcp.js',
      }),
    ).toThrow('MCP_PINNED_ENTRYPOINT_MISSING');
  });
  it('fails closed on package version mismatch', () => {
    expect(() => validateDecibelPinnedMcpRuntimeV1(fixture({ version: '0.1.3' }))).toThrow(
      'MCP_PINNED_PACKAGE_VERSION_MISMATCH',
    );
  });
  it('fails closed on entrypoint hash mismatch', () => {
    expect(() => validateDecibelPinnedMcpRuntimeV1(fixture({ entryHash: 'bad' }))).toThrow(
      'MCP_PINNED_RUNTIME_HASH_MISMATCH',
    );
  });
  it('keeps legacy launch explicit rather than silently calling it pinned', () => {
    expect(resolveDecibelMcpLauncherV1({})).toMatchObject({
      launchMode: 'NPX_LEGACY',
      npxUsed: true,
    });
  });
  it('strips private keys from the child environment', () => {
    expect(
      buildDecibelMcpMainnetReadOnlyEnvironmentV1({ DECIBEL_PRIVATE_KEY: 'secret' }),
    ).not.toHaveProperty('DECIBEL_PRIVATE_KEY');
  });
  it('sanitizes stderr credentials', () => {
    const capture = new decibel_mcp_stderr_capture_v1({ DECIBEL_NODE_API_KEY: 'api-secret' });
    capture.append('failed api-secret');
    expect(capture.sanitizedTail()).toBe('failed [REDACTED]');
  });
});
