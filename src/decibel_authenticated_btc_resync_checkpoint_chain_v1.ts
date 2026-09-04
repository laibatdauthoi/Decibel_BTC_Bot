import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import {
  validateDecibelAuthenticatedBtcResyncCheckpointV1,
  validateDecibelAuthenticatedBtcResyncCheckpointV2,
  type decibel_authenticated_btc_resync_checkpoint,
} from './decibel_authenticated_btc_activity_resync_v1.js';

export const DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_ROOT_PATH =
  'config/production_state/decibel_authenticated_btc_resync_checkpoint_v1.json' as const;
export const DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_ROLLOVER_PATTERN =
  /^decibel_authenticated_btc_resync_checkpoint_v2_(\d+)\.json$/;

export function getDecibelAuthenticatedBtcResyncRolloverPathV1(
  checkpointSequence: number,
  rootPath: string = DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_ROOT_PATH,
): string {
  if (!Number.isSafeInteger(checkpointSequence) || checkpointSequence < 2)
    throw new Error('BTC_RESYNC_CHECKPOINT_SEQUENCE_INVALID');
  return resolve(
    dirname(rootPath),
    `decibel_authenticated_btc_resync_checkpoint_v2_${String(checkpointSequence).padStart(4, '0')}.json`,
  );
}

export function loadLatestDecibelAuthenticatedBtcResyncCheckpointV1(
  rootPath: string = DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_ROOT_PATH,
): decibel_authenticated_btc_resync_checkpoint {
  const absoluteRoot = resolve(rootPath);
  if (!existsSync(absoluteRoot)) throw new Error('BTC_RESYNC_CHECKPOINT_REQUIRED');
  let latest: decibel_authenticated_btc_resync_checkpoint =
    validateDecibelAuthenticatedBtcResyncCheckpointV1(
      JSON.parse(readFileSync(absoluteRoot, 'utf8')),
    );
  const rolloverFiles = readdirSync(dirname(absoluteRoot))
    .filter((name) => DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_ROLLOVER_PATTERN.test(name))
    .sort();
  for (const [index, name] of rolloverFiles.entries()) {
    const match = DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_ROLLOVER_PATTERN.exec(basename(name));
    const expectedSequence = index + 2;
    if (match === null || Number(match[1]) !== expectedSequence)
      throw new Error('BTC_RESYNC_CHECKPOINT_CHAIN_SEQUENCE_GAP');
    const candidate = validateDecibelAuthenticatedBtcResyncCheckpointV2(
      JSON.parse(readFileSync(resolve(dirname(absoluteRoot), name), 'utf8')),
      latest,
    );
    if (candidate.checkpointSequence !== expectedSequence)
      throw new Error('BTC_RESYNC_CHECKPOINT_CHAIN_SEQUENCE_MISMATCH');
    latest = candidate;
  }
  return latest;
}

export function getDecibelAuthenticatedBtcResyncCheckpointSequenceV1(
  checkpoint: decibel_authenticated_btc_resync_checkpoint,
): number {
  return checkpoint.schemaVersion === 'DECIBEL_AUTHENTICATED_BTC_RESYNC_CHECKPOINT_V1'
    ? 1
    : checkpoint.checkpointSequence;
}
