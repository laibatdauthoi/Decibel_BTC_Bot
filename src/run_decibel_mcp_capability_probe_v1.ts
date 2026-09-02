import 'dotenv/config';

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildDecibelMcpMainnetReadOnlyEnvironmentV1,
  validateDecibelMcpExecutionEnvironmentV1,
} from './decibel_mcp_execution_adapter_v1.js';
import { probeDecibelMcpMainnetCapabilitiesV1 } from './decibel_mcp_capability_probe_v1.js';
import { decibel_stdio_mcp_transport_v1 } from './decibel_mcp_execution_transport_v1.js';

const ReportPath = resolve('research/decibel_mcp_mainnet_capabilities_v1.json');

export async function runDecibelMcpCapabilityProbeV1(environment: NodeJS.ProcessEnv) {
  validateDecibelMcpExecutionEnvironmentV1(environment, 'READ_ONLY_MAINNET');
  if (!environment.DECIBEL_NODE_API_KEY) throw new Error('MCP_NODE_API_KEY_REQUIRED');
  const childEnvironment = buildDecibelMcpMainnetReadOnlyEnvironmentV1(environment);
  const transport = new decibel_stdio_mcp_transport_v1(childEnvironment);
  try {
    const result = await probeDecibelMcpMainnetCapabilitiesV1({
      transport,
      observedAt: Date.now(),
    });
    mkdirSync(dirname(ReportPath), { recursive: true });
    writeFileSync(
      ReportPath,
      `${JSON.stringify({ ...result.body, capabilityHash: result.capabilityHash }, null, 2)}\n`,
      { encoding: 'utf8', flag: 'w' },
    );
    console.log(`DECIBEL_MCP_MAINNET_PROBE=PASS`);
    console.log(`NETWORK=mainnet`);
    console.log(`SERVER=${JSON.stringify(result.body.server)}`);
    console.log(`TOOLS_DISCOVERED=${result.body.observedToolNames.join(',')}`);
    console.log(`PLACE_LIMIT_ORDER_SCHEMA=PASS`);
    console.log(`CANCEL_ORDER_SCHEMA=PASS`);
    console.log(`AUTHENTICATED_READS=PASS`);
    console.log(`BTC_POSITION=${JSON.stringify(result.readResults.get_positions)}`);
    console.log(`BTC_OPEN_ORDERS=${JSON.stringify(result.readResults.get_orders)}`);
    console.log(`PRIVATE_KEY_PASSED_TO_MCP=NO`);
    console.log(`MCP_MUTATION_CALLS=0`);
    console.log(`VENUE_MUTATIONS=0`);
    console.log(`CAPABILITY_HASH=${result.capabilityHash}`);
    console.log(`REPORT=${ReportPath}`);
    console.log(`BLOCKER=NONE`);
    return result;
  } catch (error) {
    if (environment.DECIBEL_MCP_DIAGNOSTICS === 'true') {
      const diagnostic = transport.getDiagnostics();
      console.error(`MCP_PROCESS_STARTED=${diagnostic.processStarted ? 'YES' : 'NO'}`);
      console.error(`MCP_STDERR_OBSERVED=${diagnostic.stderrObserved ? 'YES' : 'NO'}`);
      console.error(`MCP_INITIALIZE_RESPONSE=${diagnostic.initializeResponse ? 'YES' : 'NO'}`);
      console.error(`MCP_PROTOCOL_VERSION=${diagnostic.protocolVersion ?? 'UNKNOWN'}`);
      console.error(`MCP_SERVER_NAME=${diagnostic.serverName ?? 'UNKNOWN'}`);
      console.error(`MCP_SERVER_VERSION=${diagnostic.serverVersion ?? 'UNKNOWN'}`);
      console.error(`MCP_TOOLS_LIST_RESPONSE=${diagnostic.toolsListResponse ? 'YES' : 'NO'}`);
      console.error(`MCP_PROCESS_EXITED=${diagnostic.processExited ? 'YES' : 'NO'}`);
      console.error(`MCP_EXIT_CODE=${diagnostic.exitCode ?? 'NONE'}`);
      console.error(`MCP_EXIT_SIGNAL=${diagnostic.exitSignal ?? 'NONE'}`);
      console.error(`MCP_STDERR_TAIL_SANITIZED=${diagnostic.stderrTailSanitized || 'NONE'}`);
    }
    throw error;
  } finally {
    await transport.close().catch(() => undefined);
  }
}

if (process.argv[1]?.endsWith('run_decibel_mcp_capability_probe_v1.ts')) {
  runDecibelMcpCapabilityProbeV1(process.env).catch((error: unknown) => {
    console.error('DECIBEL_MCP_MAINNET_PROBE=FAIL');
    console.error(`BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`);
    process.exitCode = 1;
  });
}
