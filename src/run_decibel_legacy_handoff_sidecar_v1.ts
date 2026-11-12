import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import {
  publishDecibelLegacyHandoffV1,
  type decibel_legacy_handoff_snapshot_v1,
} from './decibel_legacy_handoff_v1.js';

const EnvironmentSchema = z.object({
  DECIBEL_LEGACY_HANDOFF_PID: z.coerce.number().int().positive(),
  DECIBEL_LEGACY_HANDOFF_PROCESS_START_MS: z.coerce.number().int().positive(),
  DECIBEL_LEGACY_HANDOFF_EXECUTABLE: z.string().min(1),
  DECIBEL_LEGACY_HANDOFF_RUNNER: z.string().min(1),
  DECIBEL_LEGACY_HANDOFF_URL: z.string().url(),
  DECIBEL_LEGACY_HANDOFF_JOURNAL_PATH: z.string().min(1),
  DECIBEL_LEGACY_HANDOFF_OUTPUT_PATH: z.string().min(1),
});

export async function runDecibelLegacyHandoffSidecarV1(
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const config = EnvironmentSchema.parse(environment);
  const url = new URL(config.DECIBEL_LEGACY_HANDOFF_URL);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/api/runtime-snapshot'
  )
    throw new Error('LEGACY_HANDOFF_URL_MUST_BE_LOCAL_RUNTIME_SNAPSHOT');
  const outputPath = resolve(config.DECIBEL_LEGACY_HANDOFF_OUTPUT_PATH);
  let busy = false;
  let lastStatus = '';
  let previousSnapshot: decibel_legacy_handoff_snapshot_v1 | null = null;
  const publishFailure = (blocker: string): void => {
    const temporaryPath = `${outputPath}.tmp-${process.pid}`;
    let previous: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(readFileSync(outputPath, 'utf8'));
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
        previous = parsed as Record<string, unknown>;
    } catch {
      previous = {};
    }
    writeFileSync(
      temporaryPath,
      JSON.stringify({
        ...previous,
        publisherReady: false,
        safeToTerminate: false,
        blocker,
        publishedAt: Date.now(),
      }),
    );
    renameSync(temporaryPath, outputPath);
  };
  const tick = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const result = await publishDecibelLegacyHandoffV1({
        pid: config.DECIBEL_LEGACY_HANDOFF_PID,
        expectedStartMs: config.DECIBEL_LEGACY_HANDOFF_PROCESS_START_MS,
        expectedExecutablePath: config.DECIBEL_LEGACY_HANDOFF_EXECUTABLE,
        expectedRunnerPath: config.DECIBEL_LEGACY_HANDOFF_RUNNER,
        httpUrl: url.href,
        journalPath: config.DECIBEL_LEGACY_HANDOFF_JOURNAL_PATH,
        outputPath,
        previousSnapshot,
      });
      const snapshotAgeMs = Date.now() - result.snapshot.appHttpSnapshotTimestamp;
      previousSnapshot =
        snapshotAgeMs >= 0 && snapshotAgeMs <= Math.min(result.snapshot.maxSnapshotAgeMs, 5_000)
          ? result.snapshot
          : null;
      const status = result.blocker ?? 'READY';
      if (status === 'READY' && lastStatus !== 'READY')
        console.log(
          `DECIBEL_LEGACY_HANDOFF=READY PID=${result.snapshot.legacyPid} START_MS=${result.snapshot.legacyProcessStartTime}`,
        );
      if (status !== 'READY' && lastStatus !== status)
        console.error(`DECIBEL_LEGACY_HANDOFF=BLOCKED REASON=${status}`);
      lastStatus = status;
    } catch (error) {
      previousSnapshot = null;
      const blocker = error instanceof Error ? error.message : 'LEGACY_HANDOFF_UNKNOWN';
      publishFailure(blocker);
      if (lastStatus !== blocker) console.error(`DECIBEL_LEGACY_HANDOFF=BLOCKED REASON=${blocker}`);
      lastStatus = blocker;
    } finally {
      busy = false;
    }
  };
  await tick();
  const Timer = setInterval(() => void tick(), 2_000);
  const stop = (): void => clearInterval(Timer);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  void runDecibelLegacyHandoffSidecarV1(process.env).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'LEGACY_HANDOFF_START_FAILED');
    process.exitCode = 1;
  });
