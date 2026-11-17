import dotenv from 'dotenv';

dotenv.config();

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import {
  collectDecibelSecretValuesV1,
  decibel_line_redactor_v1,
  installDecibelConsoleRedactionV1,
} from './decibel_secret_redaction_v1.js';

import {
  decibel_process_forensics_v1,
  decibel_rotating_log_v1,
  isDecibelProcessPresentV1,
  readDecibelWindowsProcessIdentityV1,
  resolveDecibelProductionForensicsPathV1,
  resolveDecibelProductionNode22ExecutableV1,
} from './decibel_process_forensics_v1.js';
import {
  assertDecibelPersistedExecutionModeV1,
  formatDecibelPersistedExecutionModeV1,
  loadDecibelPersistedExecutionModeV1,
} from './decibel_persisted_execution_mode_v1.js';
import { prepareDecibelWalletWorkspaceV1 } from './decibel_wallet_workspace_v1.js';
import { loadDecibelSdkRuntimeV1 } from './decibel_sdk_runtime_v1.js';

const Secrets = collectDecibelSecretValuesV1(process.env);
installDecibelConsoleRedactionV1(Secrets);
const StdoutRedactor = new decibel_line_redactor_v1(Secrets);
const StderrRedactor = new decibel_line_redactor_v1(Secrets);
const launcherStartedAt = Date.now();
const instanceId = `${process.pid}-${launcherStartedAt}`;
// Per-wallet workspace: whitelist check and the one-time move of the legacy files.
const Workspace = await prepareDecibelWalletWorkspaceV1(process.env, {
  fullnodeUrl: (await loadDecibelSdkRuntimeV1()).MAINNET_CONFIG.fullnodeUrl,
});
console.log(
  `DECIBEL_WALLET_WORKSPACE=READY OWNER=${Workspace.ownerAddress} MIGRATION=${Workspace.migration.status}${
    'detail' in Workspace.migration ? ` DETAIL=${Workspace.migration.detail}` : ''
  }${Workspace.migration.backupDir ? ` BACKUP=${Workspace.migration.backupDir}` : ''}`,
);
const logRoot = resolve(resolveDecibelProductionForensicsPathV1(Workspace.pathEnvironment));
const productionNodeExecutable = resolveDecibelProductionNode22ExecutableV1(process.env);
const PersistedExecutionMode = loadDecibelPersistedExecutionModeV1(process.env);
assertDecibelPersistedExecutionModeV1(
  PersistedExecutionMode.environment,
  PersistedExecutionMode.mode,
);
const Forensics = new decibel_process_forensics_v1(logRoot, {
  launcherPid: process.pid,
  parentPid: process.ppid,
  nodePid: null,
  instanceId,
});
const Stdout = new decibel_rotating_log_v1(resolve(logRoot, 'stdout.log'));
const Stderr = new decibel_rotating_log_v1(resolve(logRoot, 'stderr.log'));

Forensics.record('LAUNCHER_START', {
  processStartTimestamp: launcherStartedAt,
  launcherNodeVersion: process.version,
  requiredChildNodeVersion: 'v22.23.2',
  windowsProcessIdentity: {
    pid: process.pid,
    creationTime: new Date(launcherStartedAt).toISOString(),
    executable: process.execPath,
  },
});
console.log(`DECIBEL_PRODUCTION_LAUNCHER_NODE_VERSION=${process.version}`);
console.log('DECIBEL_PRODUCTION_CHILD_NODE_VERSION_REQUIRED=v22.23.2');
console.log(
  formatDecibelPersistedExecutionModeV1(PersistedExecutionMode.mode, PersistedExecutionMode.path),
);
void readDecibelWindowsProcessIdentityV1(process.pid).then((identity) =>
  Forensics.record('WINDOWS_LAUNCHER_IDENTITY', { identity }),
);

const Child = spawn(
  productionNodeExecutable,
  ['--import', 'tsx', resolve('src/run_decibel_production_web_v1.ts')],
  {
    cwd: process.cwd(),
    env: {
      ...PersistedExecutionMode.environment,
      ...Workspace.pathEnvironment,
      DECIBEL_PROCESS_INSTANCE_ID: instanceId,
      DECIBEL_PROCESS_LAUNCHER_PID: String(process.pid),
      DECIBEL_PRODUCTION_FORENSICS_PATH: logRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

Forensics.record('CHILD_START', {
  nodePid: Child.pid ?? null,
  processStartTimestamp: Date.now(),
  windowsProcessIdentity: {
    pid: Child.pid ?? null,
    creationTime: new Date().toISOString(),
    executable: productionNodeExecutable,
    commandLine: 'node --import tsx src/run_decibel_production_web_v1.ts',
  },
});
if (Child.pid !== undefined)
  void readDecibelWindowsProcessIdentityV1(Child.pid).then((identity) =>
    Forensics.record('WINDOWS_CHILD_IDENTITY', { identity }),
  );

// Child output is redacted line by line before it reaches the log files or the terminal.
const forwardStdout = (text: string) => {
  if (text === '') return;
  Stdout.append(text);
  process.stdout.write(text);
};
const forwardStderr = (text: string) => {
  if (text === '') return;
  Stderr.append(text);
  process.stderr.write(text);
};
Child.stdout?.on('data', (chunk: Buffer) => forwardStdout(StdoutRedactor.push(chunk)));
Child.stderr?.on('data', (chunk: Buffer) => forwardStderr(StderrRedactor.push(chunk)));
Child.stdout?.on('end', () => forwardStdout(StdoutRedactor.flush()));
Child.stderr?.on('end', () => forwardStderr(StderrRedactor.flush()));

let parentMissingRecorded = false;
const ParentWatch = setInterval(() => {
  if (parentMissingRecorded || isDecibelProcessPresentV1(process.ppid)) return;
  parentMissingRecorded = true;
  Forensics.record('LAUNCHER_PARENT_DISAPPEARED', { missingPid: process.ppid });
}, 1_000);

let shutdownSignal: NodeJS.Signals | null = null;
const forward = (signal: NodeJS.Signals): void => {
  if (shutdownSignal !== null) return;
  shutdownSignal = signal;
  Forensics.record('LAUNCHER_SHUTDOWN_ENTRY', { signal, childPid: Child.pid ?? null });
  Child.kill(signal);
};
process.once('SIGINT', () => forward('SIGINT'));
process.once('SIGTERM', () => forward('SIGTERM'));

Child.once('error', (error) => {
  Forensics.record('CHILD_SPAWN_ERROR', { name: error.name, message: error.message });
});
Child.once('exit', (code, signal) => {
  clearInterval(ParentWatch);
  Forensics.record('CHILD_EXIT', {
    exitTimestamp: Date.now(),
    childPid: Child.pid ?? null,
    exitCode: code,
    exitSignal: signal,
    gracefulShutdownRequested: shutdownSignal !== null,
    autoRestart: false,
  });
  process.exitCode = code ?? (signal === null ? 1 : 128);
});
process.once('exit', (code) => {
  Forensics.record('LAUNCHER_EXIT', { exitTimestamp: Date.now(), exitCode: code });
});
process.on('uncaughtExceptionMonitor', (error, origin) => {
  Forensics.record('LAUNCHER_UNCAUGHT_EXCEPTION', {
    origin,
    name: error.name,
    message: error.message,
    stack: error.stack ?? null,
  });
});
