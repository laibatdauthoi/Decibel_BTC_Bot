import { parseArgs } from 'node:util';

import {
  appendDecibelExternalProcessEventV1,
  decibel_external_process_death_tracker_v1,
  readDecibelWindowsProcessObservationV1,
} from './decibel_external_process_watcher_v1.js';

const { values } = parseArgs({
  options: {
    'launcher-pid': { type: 'string' },
    'child-pid': { type: 'string' },
    output: { type: 'string', default: 'data/production_runtime/external_process_watcher.jsonl' },
    'poll-ms': { type: 'string', default: '1000' },
  },
});
const launcherPid = Number(values['launcher-pid']);
const childPid = Number(values['child-pid']);
const pollMs = Number(values['poll-ms']);
if (!Number.isSafeInteger(launcherPid) || launcherPid <= 0)
  throw new Error('PROCESS_WATCHER_LAUNCHER_PID_REQUIRED');
if (!Number.isSafeInteger(childPid) || childPid <= 0)
  throw new Error('PROCESS_WATCHER_CHILD_PID_REQUIRED');
if (!Number.isSafeInteger(pollMs) || pollMs < 250)
  throw new Error('PROCESS_WATCHER_POLL_INTERVAL_INVALID');

const Tracker = new decibel_external_process_death_tracker_v1();
const output = values.output;
let polling = false;
const poll = async (): Promise<void> => {
  if (polling || Tracker.complete()) return;
  polling = true;
  try {
    const now = Date.now();
    const [launcher, child] = await Promise.all([
      readDecibelWindowsProcessObservationV1(launcherPid),
      readDecibelWindowsProcessObservationV1(childPid),
    ]);
    for (const event of [
      ...Tracker.observe('LAUNCHER', launcherPid, launcher, now),
      ...Tracker.observe('CHILD', childPid, child, now),
    ])
      appendDecibelExternalProcessEventV1(output, event);
  } finally {
    polling = false;
  }
};

await poll();
const Timer = setInterval(() => void poll(), pollMs);
while (!Tracker.complete()) await new Promise((resolve) => setTimeout(resolve, pollMs));
clearInterval(Timer);
