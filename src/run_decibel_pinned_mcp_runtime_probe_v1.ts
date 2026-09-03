import 'dotenv/config';

import { buildDecibelMcpMainnetReadOnlyEnvironmentV1 } from './decibel_mcp_execution_adapter_v1.js';
import { decibel_stdio_mcp_transport_v1 } from './decibel_mcp_execution_transport_v1.js';
import { validateDecibelPinnedMcpRuntimeV1 } from './decibel_pinned_mcp_runtime_v1.js';

export async function runDecibelPinnedMcpRuntimeProbeV1(environment: NodeJS.ProcessEnv) {
  const preflight = validateDecibelPinnedMcpRuntimeV1(environment);
  let initialized = 0;
  let toolsListed = 0;
  let unexpectedExits = 0;
  let serverName: string | null = null;
  let protocol: string | null = null;
  for (let index = 0; index < 10; index += 1) {
    const Transport = new decibel_stdio_mcp_transport_v1(
      buildDecibelMcpMainnetReadOnlyEnvironmentV1(environment),
    );
    try {
      await Transport.start();
      initialized += 1;
      await Transport.listTools();
      toolsListed += 1;
      const read = await Transport.callTool('get_positions', {});
      if (typeof read === 'object' && read !== null && 'isError' in read && read.isError === true)
        throw new Error('MCP_PINNED_AUTHENTICATED_READ_FAILED');
      const diagnostics = Transport.getDiagnostics();
      serverName = diagnostics.serverName;
      protocol = diagnostics.protocolVersion;
    } catch {
      if (Transport.getDiagnostics().processExited) unexpectedExits += 1;
    } finally {
      await Transport.close();
    }
  }
  const passed = initialized === 10 && toolsListed === 10 && unexpectedExits === 0;
  console.log(`PINNED_MCP_PREFLIGHT=${passed ? 'PASS' : 'FAIL'}`);
  console.log(`NODE_VERSION=${preflight.nodeVersion}`);
  console.log(`CLI_VERSION=${preflight.cliVersion}`);
  console.log(`MCP_SERVER=${serverName ?? 'UNKNOWN'}`);
  console.log(`MCP_PROTOCOL=${protocol ?? 'UNKNOWN'}`);
  console.log('LAUNCH_MODE=PINNED_LOCAL_ENTRYPOINT');
  console.log('NPX_USED=NO');
  console.log(`STABILITY_INITIALIZE=${initialized}/10`);
  console.log(`STABILITY_TOOLS_LIST=${toolsListed}/10`);
  console.log(`UNEXPECTED_PROCESS_EXITS=${unexpectedExits}`);
  console.log('MCP_MUTATION_CALLS=0');
  console.log('VENUE_MUTATIONS=0');
  if (!passed) throw new Error('MCP_PINNED_STABILITY_PROBE_FAILED');
  return Object.freeze({
    passed,
    initialized,
    toolsListed,
    unexpectedExits,
    serverName,
    protocol,
    preflight,
    mcpMutationCalls: 0 as const,
    venueMutations: 0 as const,
  });
}

if (process.argv[1]?.endsWith('run_decibel_pinned_mcp_runtime_probe_v1.ts'))
  runDecibelPinnedMcpRuntimeProbeV1(process.env).catch((error: unknown) => {
    console.error(
      `PINNED_MCP_PREFLIGHT=FAIL\nBLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}\nMCP_MUTATION_CALLS=0\nVENUE_MUTATIONS=0`,
    );
    process.exitCode = 1;
  });
