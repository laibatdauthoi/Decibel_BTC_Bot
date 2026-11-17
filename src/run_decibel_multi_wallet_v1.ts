/**
 * Multi-wallet supervisor (added 2026-11-17): one production runtime process per wallet in
 * config/wallets.json, plus the wallet gateway in front of them.
 *
 *   npm run decibel:multi-wallet
 *
 * Each runtime is the normal single-wallet launcher with its own subaccount and local port, so
 * it keeps its own workspace, journal, executor and agent key. Children are never restarted
 * automatically; Ctrl+C is forwarded to every runtime (each ends its session as usual).
 */
import dotenv from 'dotenv';

dotenv.config();

import { spawn, type ChildProcess } from 'node:child_process';
import { join, resolve } from 'node:path';
import {
  decibel_dashboard_auth_v1,
  readDecibelAccountAuthKeyV1,
} from './decibel_dashboard_auth_v1.js';
import { resolveDecibelProductionNode22ExecutableV1 } from './decibel_process_forensics_v1.js';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';
import {
  collectDecibelSecretValuesV1,
  installDecibelConsoleRedactionV1,
} from './decibel_secret_redaction_v1.js';
import {
  createDecibelWalletGatewayV1,
  loadDecibelWalletRegistryV1,
} from './decibel_wallet_gateway_v1.js';
import {
  assertDecibelWalletWhitelistedV1,
  loadDecibelWalletWhitelistV1,
  normalizeDecibelAddressV1,
  readDecibelSubaccountOwnerV1,
} from './decibel_wallet_workspace_v1.js';

installDecibelConsoleRedactionV1(collectDecibelSecretValuesV1(process.env));

const Registry = loadDecibelWalletRegistryV1();
const { MAINNET_CONFIG } = await loadDecibelSdkRuntimeV1();
const nodeApiKey = process.env.DECIBEL_NODE_API_KEY;
const Whitelist = loadDecibelWalletWhitelistV1();
const OwnerPorts = new Map<string, number>();
for (const wallet of Registry.wallets) {
  const owner = await readDecibelSubaccountOwnerV1({
    fullnodeUrl: MAINNET_CONFIG.fullnodeUrl,
    subaccountAddress: wallet.subaccount,
    nodeApiKey,
  });
  assertDecibelWalletWhitelistedV1(Whitelist, owner);
  if (OwnerPorts.has(owner)) throw new Error('WALLET_REGISTRY_DUPLICATE_OWNER');
  OwnerPorts.set(owner, wallet.port);
  console.log(
    `DECIBEL_MULTI_WALLET=REGISTERED OWNER=${owner} SUBACCOUNT=${normalizeDecibelAddressV1(wallet.subaccount)} PORT=${wallet.port}`,
  );
}

const nodeExecutable = resolveDecibelProductionNode22ExecutableV1(process.env);
const Children = new Map<string, ChildProcess>();
const prefixLines = (label: string, write: (text: string) => void) => {
  let pending = '';
  return (chunk: Buffer) => {
    pending += chunk.toString('utf8');
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) write(`[${label}] ${line}\n`);
  };
};
for (const wallet of Registry.wallets) {
  const label = wallet.label ?? `${normalizeDecibelAddressV1(wallet.subaccount).slice(0, 10)}`;
  const Child = spawn(
    nodeExecutable,
    ['--import', 'tsx', resolve('src/run_decibel_production_web_launcher_v1.ts')],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DECIBEL_SUBACCOUNT_ADDRESS: wallet.subaccount,
        DECIBEL_PRODUCTION_WEB_PORT: String(wallet.port),
        // The gateway signs users in; runtimes only listen on 127.0.0.1.
        DECIBEL_DASHBOARD_AUTH: 'off',
        // Each runtime runs exactly its registry subaccount.
        DECIBEL_SUBACCOUNT_SELECTION: 'off',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  Children.set(label, Child);
  Child.stdout?.on(
    'data',
    prefixLines(label, (text) => process.stdout.write(text)),
  );
  Child.stderr?.on(
    'data',
    prefixLines(label, (text) => process.stderr.write(text)),
  );
  Child.on('exit', (code, signal) => {
    Children.delete(label);
    console.log(`DECIBEL_MULTI_WALLET=RUNTIME_EXITED LABEL=${label} CODE=${code} SIGNAL=${signal}`);
    if (Children.size === 0) process.exit(0);
  });
}

const publicHost = Registry.gateway.publicHost ?? `127.0.0.1:${Registry.gateway.port}`;
const Gateway = createDecibelWalletGatewayV1({
  auth: new decibel_dashboard_auth_v1({
    isServedOwner: (address) => OwnerPorts.has(normalizeDecibelAddressV1(address)),
    isWhitelisted: (address) => {
      try {
        return loadDecibelWalletWhitelistV1().has(normalizeDecibelAddressV1(address));
      } catch {
        return false;
      }
    },
    readAuthKey: (address) =>
      readDecibelAccountAuthKeyV1({ fullnodeUrl: MAINNET_CONFIG.fullnodeUrl, address, nodeApiKey }),
    sessionsPath: join('data', 'gateway', 'dashboard_sessions_v1.json'),
  }),
  ownerPorts: OwnerPorts,
  staticPort: Registry.wallets[0]!.port,
  publicHost,
  publicScheme: Registry.gateway.publicScheme,
});
Gateway.listen(Registry.gateway.port, '127.0.0.1', () =>
  console.log(
    `DECIBEL_MULTI_WALLET=GATEWAY_READY URL=${Registry.gateway.publicScheme}://${publicHost} LISTEN=127.0.0.1:${Registry.gateway.port}`,
  ),
);

let stopping = false;
const stop = (signal: NodeJS.Signals) => {
  if (stopping) return;
  stopping = true;
  console.log(`DECIBEL_MULTI_WALLET=STOPPING SIGNAL=${signal} RUNTIMES=${Children.size}`);
  Gateway.close();
  for (const Child of Children.values()) Child.kill(signal);
};
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
