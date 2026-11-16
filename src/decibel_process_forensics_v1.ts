import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFile } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

export const DECIBEL_PROCESS_FORENSICS_V1 = 'DECIBEL_PROCESS_FORENSICS_V1' as const;
export const DECIBEL_PRODUCTION_REQUIRED_NODE_VERSION_V1 = 'v22.23.2' as const;
const execFileAsync = promisify(execFile);

export function isDecibelProductionNodeRuntimeCompatibleV1(version: string): boolean {
  return version === DECIBEL_PRODUCTION_REQUIRED_NODE_VERSION_V1;
}

export function assertDecibelProductionNodeRuntimeV1(version: string): void {
  if (!isDecibelProductionNodeRuntimeCompatibleV1(version))
    throw new Error(
      `DECIBEL_PRODUCTION_NODE_RUNTIME_MISMATCH:EXPECTED=${DECIBEL_PRODUCTION_REQUIRED_NODE_VERSION_V1}:ACTUAL=${version}`,
    );
}

/** Runtime forensics and logs directory: DECIBEL_PRODUCTION_FORENSICS_PATH or the default. */
export function resolveDecibelProductionForensicsPathV1(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  return environment.DECIBEL_PRODUCTION_FORENSICS_PATH ?? 'data/production_runtime';
}

export function resolveDecibelProductionNode22ExecutableV1(environment: NodeJS.ProcessEnv): string {
  const configured = environment.DECIBEL_NODE22_EXECUTABLE?.trim();
  const executable =
    configured && configured.length > 0
      ? resolve(configured)
      : join(environment.LOCALAPPDATA ?? '', 'DecibelTools', 'node-v22.23.2-win-x64', 'node.exe');
  if (!existsSync(executable)) throw new Error('DECIBEL_PRODUCTION_NODE_22_EXECUTABLE_REQUIRED');
  const version = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const observed = version.stdout.trim();
  if (version.status !== 0 || !isDecibelProductionNodeRuntimeCompatibleV1(observed))
    throw new Error(
      `DECIBEL_PRODUCTION_NODE_RUNTIME_MISMATCH:EXPECTED=${DECIBEL_PRODUCTION_REQUIRED_NODE_VERSION_V1}:ACTUAL=${observed || 'UNKNOWN'}`,
    );
  return executable;
}

export type decibel_process_forensic_event_v1 = Readonly<{
  version: typeof DECIBEL_PROCESS_FORENSICS_V1;
  timestamp: number;
  event: string;
  launcherPid: number | null;
  parentPid: number | null;
  nodePid: number | null;
  instanceId: string;
  details: Readonly<Record<string, unknown>>;
}>;

export class decibel_rotating_log_v1 {
  private readonly Path: string;

  public constructor(
    path: string,
    private readonly MaximumBytes = 5 * 1024 * 1024,
    private readonly RetainedFiles = 5,
  ) {
    if (!Number.isSafeInteger(MaximumBytes) || MaximumBytes < 1)
      throw new Error('PROCESS_LOG_MAXIMUM_BYTES_INVALID');
    if (!Number.isSafeInteger(RetainedFiles) || RetainedFiles < 1)
      throw new Error('PROCESS_LOG_RETENTION_INVALID');
    this.Path = resolve(path);
    mkdirSync(dirname(this.Path), { recursive: true });
  }

  public append(value: string | Uint8Array): void {
    const bytes = typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength;
    if (existsSync(this.Path) && statSync(this.Path).size + bytes > this.MaximumBytes)
      this.rotate();
    appendFileSync(this.Path, value);
  }

  private rotate(): void {
    const oldest = `${this.Path}.${this.RetainedFiles}`;
    if (existsSync(oldest)) unlinkSync(oldest);
    for (let index = this.RetainedFiles - 1; index >= 1; index -= 1) {
      const source = `${this.Path}.${index}`;
      if (existsSync(source)) renameSync(source, `${this.Path}.${index + 1}`);
    }
    if (existsSync(this.Path)) renameSync(this.Path, `${this.Path}.1`);
  }
}

export class decibel_process_forensics_v1 {
  private readonly Events: decibel_rotating_log_v1;
  private readonly StatePath: string;

  public constructor(
    directory: string,
    private readonly Identity: Readonly<{
      launcherPid: number | null;
      parentPid: number | null;
      nodePid: number | null;
      instanceId: string;
    }>,
    maximumBytes?: number,
  ) {
    const root = resolve(directory);
    mkdirSync(root, { recursive: true });
    this.Events = new decibel_rotating_log_v1(
      resolve(root, 'process_forensics.jsonl'),
      maximumBytes,
    );
    this.StatePath = resolve(root, 'last_runtime_state.json');
  }

  public record(event: string, details: Readonly<Record<string, unknown>> = {}): void {
    const row: decibel_process_forensic_event_v1 = Object.freeze({
      version: DECIBEL_PROCESS_FORENSICS_V1,
      timestamp: Date.now(),
      event,
      ...this.Identity,
      details: Object.freeze({ ...details }),
    });
    this.Events.append(`${JSON.stringify(row)}\n`);
  }

  public persistRuntimeState(state: Readonly<Record<string, unknown>>): void {
    const candidate = `${this.StatePath}.tmp`;
    writeFileSync(
      candidate,
      `${JSON.stringify(
        {
          version: DECIBEL_PROCESS_FORENSICS_V1,
          persistedAt: Date.now(),
          ...this.Identity,
          state,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    renameSync(candidate, this.StatePath);
  }
}

export function isDecibelProcessPresentV1(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readDecibelWindowsProcessIdentityV1(pid: number): Promise<Readonly<{
  pid: number;
  creationTime: string;
  executable: string | null;
  source: 'WINDOWS_GET_PROCESS';
}> | null> {
  if (process.platform !== 'win32' || !Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    const command =
      `$p=Get-Process -Id ${pid} -ErrorAction Stop;` +
      `[pscustomobject]@{pid=$p.Id;creationTime=$p.StartTime.ToUniversalTime().ToString('o');` +
      `executable=$p.Path}|ConvertTo-Json -Compress`;
    const { stdout } = await execFileAsync(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout: 5_000 },
    );
    const parsed = JSON.parse(stdout.trim()) as {
      pid?: unknown;
      creationTime?: unknown;
      executable?: unknown;
    };
    if (parsed.pid !== pid || typeof parsed.creationTime !== 'string') return null;
    return Object.freeze({
      pid,
      creationTime: parsed.creationTime,
      executable: typeof parsed.executable === 'string' ? parsed.executable : null,
      source: 'WINDOWS_GET_PROCESS' as const,
    });
  } catch {
    return null;
  }
}
