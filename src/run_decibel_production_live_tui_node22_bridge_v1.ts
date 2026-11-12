import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DECIBEL_TUI_REQUIRED_NODE_VERSION_V1 = 'v22.23.2' as const;

export function isDecibelTuiNodeRuntimeCompatibleV1(version: string): boolean {
  return version === DECIBEL_TUI_REQUIRED_NODE_VERSION_V1;
}

export function resolveDecibelTuiNode22ExecutableV1(environment: NodeJS.ProcessEnv): string {
  const configured = environment.DECIBEL_NODE22_EXECUTABLE?.trim();
  const executable =
    configured && configured.length > 0
      ? resolve(configured)
      : join(environment.LOCALAPPDATA ?? '', 'DecibelTools', 'node-v22.23.2-win-x64', 'node.exe');
  if (!existsSync(executable)) throw new Error('DECIBEL_TUI_NODE_22_EXECUTABLE_REQUIRED');
  const version = spawnSync(executable, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0 || !isDecibelTuiNodeRuntimeCompatibleV1(version.stdout.trim()))
    throw new Error('DECIBEL_TUI_NODE_22_RUNTIME_MISMATCH');
  return executable;
}

export async function runDecibelProductionLiveTuiNode22BridgeV1(
  environment: NodeJS.ProcessEnv,
  argumentsValue: readonly string[],
): Promise<number> {
  const executable = resolveDecibelTuiNode22ExecutableV1(environment);
  const child = spawn(
    executable,
    [
      resolve('node_modules/tsx/dist/cli.mjs'),
      resolve('src/run_decibel_production_live_tui_v1.ts'),
      ...argumentsValue,
    ],
    { cwd: process.cwd(), env: { ...process.env, ...environment }, stdio: 'inherit' },
  );
  const forwardSignal = (signal: NodeJS.Signals) => child.kill(signal);
  const onSigint = () => forwardSignal('SIGINT');
  const onSigterm = () => forwardSignal('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  try {
    return await new Promise<number>((resolveExit, rejectExit) => {
      child.once('error', rejectExit);
      child.once('exit', (code) => resolveExit(code ?? 1));
    });
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)
  runDecibelProductionLiveTuiNode22BridgeV1(process.env, process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(
        `DECIBEL_PRODUCTION_TUI=FAIL BLOCKER=${error instanceof Error ? error.message : 'UNKNOWN'}`,
      );
      process.exitCode = 1;
    });
