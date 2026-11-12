import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DECIBEL_EXTERNAL_PROCESS_WATCHER_V1 = 'DECIBEL_EXTERNAL_PROCESS_WATCHER_V1' as const;

export type decibel_windows_process_observation_v1 = Readonly<{
  timestamp: number;
  pid: number;
  parentPid: number;
  creationTime: string;
  executable: string | null;
  commandLine: string | null;
}>;

export type decibel_external_process_event_v1 = Readonly<{
  version: typeof DECIBEL_EXTERNAL_PROCESS_WATCHER_V1;
  timestamp: number;
  event: 'PROCESS_OBSERVED' | 'PROCESS_TERMINATED' | 'DEATH_ORDER';
  role: 'LAUNCHER' | 'CHILD' | 'PAIR';
  pid: number | null;
  parentPid: number | null;
  executable: string | null;
  commandLine: string | null;
  creationTime: string | null;
  exitStatus: number | null;
  details: Readonly<Record<string, unknown>>;
}>;

function assertPid(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('PROCESS_WATCHER_PID_INVALID');
}

export class decibel_external_process_death_tracker_v1 {
  private readonly Initial = new Map<
    'LAUNCHER' | 'CHILD',
    decibel_windows_process_observation_v1
  >();
  private readonly MissingCounts = new Map<'LAUNCHER' | 'CHILD', number>();
  private readonly TerminatedAt = new Map<'LAUNCHER' | 'CHILD', number>();

  public observe(
    role: 'LAUNCHER' | 'CHILD',
    expectedPid: number,
    observation: decibel_windows_process_observation_v1 | null,
    now: number,
  ): readonly decibel_external_process_event_v1[] {
    assertPid(expectedPid);
    if (this.TerminatedAt.has(role)) return [];
    if (observation !== null) {
      if (observation.pid !== expectedPid) throw new Error('PROCESS_WATCHER_IDENTITY_MISMATCH');
      const initial = this.Initial.get(role);
      if (initial !== undefined && initial.creationTime !== observation.creationTime)
        throw new Error('PROCESS_WATCHER_PID_REUSE_DETECTED');
      this.MissingCounts.set(role, 0);
      if (initial !== undefined) return [];
      this.Initial.set(role, observation);
      return [this.makeEvent('PROCESS_OBSERVED', role, observation, now, null, {})];
    }
    const missingCount = (this.MissingCounts.get(role) ?? 0) + 1;
    this.MissingCounts.set(role, missingCount);
    if (missingCount < 2) return [];
    const initial = this.Initial.get(role);
    this.TerminatedAt.set(role, now);
    const events: decibel_external_process_event_v1[] = [
      this.makeEvent('PROCESS_TERMINATED', role, initial ?? null, now, null, {
        exitStatusSource: 'WINDOWS_NOT_EXPOSED_TO_NON_PARENT',
        consecutiveMissingObservations: missingCount,
      }),
    ];
    const launcherAt = this.TerminatedAt.get('LAUNCHER');
    const childAt = this.TerminatedAt.get('CHILD');
    if (launcherAt !== undefined && childAt !== undefined) {
      const disappearedFirst =
        launcherAt < childAt ? 'LAUNCHER' : childAt < launcherAt ? 'CHILD' : 'SIMULTANEOUS';
      events.push(
        this.makeEvent('DEATH_ORDER', 'PAIR', null, now, null, {
          launcherTerminatedAt: launcherAt,
          childTerminatedAt: childAt,
          disappearedFirst,
        }),
      );
    }
    return events;
  }

  public complete(): boolean {
    return this.TerminatedAt.has('LAUNCHER') && this.TerminatedAt.has('CHILD');
  }

  private makeEvent(
    event: decibel_external_process_event_v1['event'],
    role: decibel_external_process_event_v1['role'],
    observation: decibel_windows_process_observation_v1 | null,
    timestamp: number,
    exitStatus: number | null,
    details: Readonly<Record<string, unknown>>,
  ): decibel_external_process_event_v1 {
    return Object.freeze({
      version: DECIBEL_EXTERNAL_PROCESS_WATCHER_V1,
      timestamp,
      event,
      role,
      pid: observation?.pid ?? null,
      parentPid: observation?.parentPid ?? null,
      executable: observation?.executable ?? null,
      commandLine: observation?.commandLine ?? null,
      creationTime: observation?.creationTime ?? null,
      exitStatus,
      details: Object.freeze({ ...details }),
    });
  }
}

export async function readDecibelWindowsProcessObservationV1(
  pid: number,
): Promise<decibel_windows_process_observation_v1 | null> {
  assertPid(pid);
  if (process.platform !== 'win32') return null;
  const command =
    `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction Stop;` +
    `if($null -eq $p){exit 3};` +
    `$c=if($p.CreationDate -is [datetime]){$p.CreationDate.ToUniversalTime().ToString('o')}` +
    `else{[Management.ManagementDateTimeConverter]::ToDateTime([string]$p.CreationDate).ToUniversalTime().ToString('o')};` +
    `[pscustomobject]@{pid=[int]$p.ProcessId;parentPid=[int]$p.ParentProcessId;creationTime=$c;` +
    `executable=$p.ExecutablePath;commandLine=$p.CommandLine}|ConvertTo-Json -Compress`;
  try {
    const { stdout } = await execFileAsync(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout: 5_000 },
    );
    const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
    const parsedPid = Number(parsed.pid);
    const parsedParentPid = Number(parsed.parentPid);
    if (
      parsedPid !== pid ||
      !Number.isSafeInteger(parsedParentPid) ||
      parsedParentPid < 0 ||
      typeof parsed.creationTime !== 'string'
    )
      throw new Error('PROCESS_WATCHER_WINDOWS_IDENTITY_INVALID');
    return Object.freeze({
      timestamp: Date.now(),
      pid,
      parentPid: parsedParentPid,
      creationTime: parsed.creationTime,
      executable: typeof parsed.executable === 'string' ? parsed.executable : null,
      commandLine: typeof parsed.commandLine === 'string' ? parsed.commandLine : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PROCESS_WATCHER_WINDOWS_IDENTITY_INVALID')
      throw error;
    return null;
  }
}

export function appendDecibelExternalProcessEventV1(
  path: string,
  event: decibel_external_process_event_v1,
): void {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  appendFileSync(target, `${JSON.stringify(event)}\n`, 'utf8');
}
