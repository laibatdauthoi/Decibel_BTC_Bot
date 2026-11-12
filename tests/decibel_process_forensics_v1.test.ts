import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  assertDecibelProductionNodeRuntimeV1,
  decibel_process_forensics_v1,
  decibel_rotating_log_v1,
  isDecibelProductionNodeRuntimeCompatibleV1,
} from '../src/decibel_process_forensics_v1.js';
import { decibel_external_process_death_tracker_v1 } from '../src/decibel_external_process_watcher_v1.js';
import { calculateDecibelSourceBuildFingerprintV1 } from '../src/decibel_source_build_fingerprint_v1.js';

describe('production process forensics V1', () => {
  it('resolves the normal startup command to the local pinned-runtime launcher without starting it', () => {
    const Package = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(Package.scripts['decibel:production']).toBe(
      'node src/run_decibel_production_bootstrap_v1.mjs',
    );
    const check = spawnSync(
      process.execPath,
      ['src/run_decibel_production_bootstrap_v1.mjs', '--check'],
      { encoding: 'utf8' },
    );
    expect(check.status, check.stderr).toBe(0);
    expect(check.stdout).toContain('PRODUCTION_NATIVE_DEPENDENCIES=PASS');
    expect(check.stdout).toContain('PRODUCTION_STARTUP_CHECK=PASS NODE=v22.23.2');
    expect(check.stdout).toContain(
      join(process.cwd(), 'src', 'run_decibel_production_web_launcher_v1.ts'),
    );
    expect(check.stdout).not.toContain('DECIBEL_PRODUCTION_WEB=READY');
  });
  it('changes the production build identity when an imported source file changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-build-fingerprint-'));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'web_dashboard', 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'runtime.ts'), 'export const version = 1;\n');
    writeFileSync(join(root, 'web_dashboard', 'src', 'main.tsx'), 'export const ui = 1;\n');
    writeFileSync(join(root, 'package.json'), '{}\n');
    const before = calculateDecibelSourceBuildFingerprintV1(root);

    writeFileSync(join(root, 'src', 'runtime.ts'), 'export const version = 2;\n');
    const after = calculateDecibelSourceBuildFingerprintV1(root);

    expect(after.buildId).not.toBe(before.buildId);
    expect(after.coveredFileCount).toBe(before.coveredFileCount);
  });
  it('rotates persistent process output without deleting the newest prior log', () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-forensics-'));
    const path = join(root, 'stdout.log');
    const Log = new decibel_rotating_log_v1(path, 8, 2);
    Log.append('first\n');
    Log.append('second\n');
    Log.append('third\n');
    expect(readFileSync(path, 'utf8')).toBe('third\n');
    expect(readFileSync(`${path}.1`, 'utf8')).toBe('second\n');
    expect(existsSync(`${path}.2`)).toBe(true);
  });

  it('persists identity, lifecycle events, heartbeat, and last runtime state', () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-forensics-'));
    const Forensics = new decibel_process_forensics_v1(root, {
      launcherPid: 10,
      parentPid: 9,
      nodePid: 11,
      instanceId: '11-instance',
    });
    Forensics.record('NODE_START', { processStartTimestamp: 100 });
    Forensics.persistRuntimeState({ lastHeartbeat: 123, runtimeState: 'RECOVERY_BLOCKED' });

    const event = JSON.parse(
      readFileSync(join(root, 'process_forensics.jsonl'), 'utf8').trim(),
    ) as Record<string, unknown>;
    expect(event).toMatchObject({
      event: 'NODE_START',
      launcherPid: 10,
      parentPid: 9,
      nodePid: 11,
      instanceId: '11-instance',
    });
    const state = JSON.parse(readFileSync(join(root, 'last_runtime_state.json'), 'utf8')) as {
      state: Record<string, unknown>;
    };
    expect(state.state).toEqual({ lastHeartbeat: 123, runtimeState: 'RECOVERY_BLOCKED' });
  });

  it('uses a launcher that records child exit and never restarts it', () => {
    const source = readFileSync('src/run_decibel_production_web_launcher_v1.ts', 'utf8');
    expect(source).toContain("Forensics.record('CHILD_EXIT'");
    expect(source).toContain('autoRestart: false');
    expect(source.match(/spawn\(/g)).toHaveLength(1);
    expect(source).toContain('resolveDecibelProductionNode22ExecutableV1');
  });

  it('requires the exact pinned Node runtime for the production child', () => {
    expect(isDecibelProductionNodeRuntimeCompatibleV1('v22.23.2')).toBe(true);
    expect(isDecibelProductionNodeRuntimeCompatibleV1('v24.11.1')).toBe(false);
    expect(() => assertDecibelProductionNodeRuntimeV1('v22.23.2')).not.toThrow();
    expect(() => assertDecibelProductionNodeRuntimeV1('v24.11.1')).toThrow(
      'DECIBEL_PRODUCTION_NODE_RUNTIME_MISMATCH:EXPECTED=v22.23.2:ACTUAL=v24.11.1',
    );
  });

  it('records Windows identity and the launcher/child disappearance order externally', () => {
    const Tracker = new decibel_external_process_death_tracker_v1();
    const launcher = {
      timestamp: 100,
      pid: 10,
      parentPid: 1,
      creationTime: '2026-09-27T00:00:00.000Z',
      executable: 'node.exe',
      commandLine: 'launcher',
    } as const;
    const child = {
      ...launcher,
      pid: 11,
      parentPid: 10,
      creationTime: '2026-09-27T00:00:01.000Z',
      commandLine: 'production-child',
    } as const;
    expect(Tracker.observe('LAUNCHER', 10, launcher, 100)[0]).toMatchObject({
      event: 'PROCESS_OBSERVED',
      pid: 10,
      parentPid: 1,
      executable: 'node.exe',
      commandLine: 'launcher',
    });
    expect(Tracker.observe('CHILD', 11, child, 100)[0]).toMatchObject({
      event: 'PROCESS_OBSERVED',
      pid: 11,
      parentPid: 10,
    });
    expect(Tracker.observe('LAUNCHER', 10, null, 200)).toEqual([]);
    expect(Tracker.observe('LAUNCHER', 10, null, 300)[0]).toMatchObject({
      event: 'PROCESS_TERMINATED',
      pid: 10,
      exitStatus: null,
    });
    expect(Tracker.observe('CHILD', 11, null, 400)).toEqual([]);
    const childDeath = Tracker.observe('CHILD', 11, null, 500);
    expect(childDeath[0]).toMatchObject({ event: 'PROCESS_TERMINATED', pid: 11 });
    expect(childDeath[1]).toMatchObject({
      event: 'DEATH_ORDER',
      details: { disappearedFirst: 'LAUNCHER' },
    });
    expect(Tracker.complete()).toBe(true);
  });

  it('keeps the external watcher detached from production control behavior', () => {
    const runner = readFileSync('src/run_decibel_external_process_watcher_v1.ts', 'utf8');
    const launcher = readFileSync('scripts/start_decibel_external_process_watcher_v1.ps1', 'utf8');
    expect(runner).not.toMatch(/placeOrder|cancelOrder|process\.kill|spawn\(/);
    expect(launcher).toContain('Start-Process');
    expect(launcher).toContain('independentFromProductionLauncher = $true');
    expect(launcher).toContain('autoRestart = $false');
  });
});
