import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadConfig } from './config.js';
import { validateDecibelAuthenticatedBtcResyncCheckpointV1 } from './decibel_authenticated_btc_activity_resync_v1.js';
import { buildDecibelAuthenticatedPassiveRecyclingFlatEntryV1 } from './decibel_authenticated_passive_recycling_flat_entry_v1.js';
import { decibel_authenticated_passive_recycling_journal_v1 } from './decibel_authenticated_passive_recycling_journal_v1.js';
import { readDecibelAuthenticatedPassiveRecyclingLiveStateV1 } from './decibel_authenticated_passive_recycling_live_reader_v1.js';

for (const name of [
  'LIVE_EXECUTION_ENABLED',
  'VENUE_MUTATION_ENABLED',
  'SIGNER_ENABLED',
  'TRANSACTION_SUBMISSION_ENABLED',
] as const)
  if (process.env[name] === 'true') throw new Error(`RECYCLING_FLAT_ENTRY_${name}_MUST_BE_FALSE`);

const checkpointPath = resolve('research/decibel_authenticated_btc_resync_checkpoint_v1.json');
const checkpoint = validateDecibelAuthenticatedBtcResyncCheckpointV1(
  JSON.parse(readFileSync(checkpointPath, 'utf8')),
) as {
  checkpointBodyHashSha256: string;
  allAccountFillIds: string[];
  strategyFillIds: string[];
  currentPositionBase: 0;
  strategyMakerVolumeUsd: number;
  cycleDisposition: 'CYCLE_INTERRUPTED_BY_OUT_OF_BAND_ACTIVITY';
};
const config = loadConfig();
if (config.network !== 'mainnet') throw new Error('RECYCLING_FLAT_ENTRY_MAINNET_REQUIRED');
const manifestPath = resolve('research/decibel_authenticated_live_canary_success_v1_manifest.json');
const journalPath = resolve(
  process.env.DECIBEL_RECYCLING_OPERATOR_JOURNAL_PATH ??
    'data/decibel_authenticated_passive_recycling_operator_cycle_v1.sqlite',
);
mkdirSync(resolve('data'), { recursive: true });
const Journal = new decibel_authenticated_passive_recycling_journal_v1(journalPath);
try {
  const knownOrders = Journal.list().flatMap((row) => {
    if (row.captureJson === null) return [];
    const capture = JSON.parse(row.captureJson) as {
      venueOrderId: string;
      venueClientOrderId: string;
    };
    const handoff = JSON.parse(row.handoffJson) as {
      side: 'BUY' | 'SELL';
      marketAddress: string;
    };
    return [
      {
        orderId: capture.venueOrderId,
        clientOrderId: capture.venueClientOrderId,
        side: handoff.side,
        marketAddress: handoff.marketAddress,
      },
    ];
  });
  const unresolvedHandoffCount = Journal.unresolvedCount();
  const completedCycleCount = Journal.completedCycleCount();
  const read = await readDecibelAuthenticatedPassiveRecyclingLiveStateV1({
    config,
    manifestPath,
    knownRecyclingOrders: knownOrders,
    maxStateAgeMs: 5_000,
    hardInventoryLimitBase: 0.001,
  });
  const createdAt = Date.now();
  const executionSessionId = `recycling-flat-entry-session-${createdAt}-${createHash('sha256')
    .update(`${checkpoint.checkpointBodyHashSha256}:${completedCycleCount + 1}`)
    .digest('hex')
    .slice(0, 12)}`;
  try {
    const handoff = buildDecibelAuthenticatedPassiveRecyclingFlatEntryV1({
      checkpoint,
      state: read.state,
      unresolvedHandoffCount,
      completedCycleCount,
      subaccount: read.handoff.subaccount,
      marketAddress: read.handoff.marketAddress,
      tickSize: read.marketMetadata.tickSize,
      lotSize: read.marketMetadata.lotSize,
      minimumSize: read.marketMetadata.minimumSize,
      authoritativeVenueMinimumNotionalUsd: read.handoff.venueMinimumNotionalUsd,
      configuredMinimumNotionalUsd: Number(process.env.DECIBEL_CANARY_MIN_NOTIONAL_USD ?? '10'),
      configuredTargetNotionalUsd: Number(process.env.DECIBEL_CANARY_TARGET_NOTIONAL_USD ?? '20'),
      configuredMaximumNotionalUsd: Number(process.env.DECIBEL_CANARY_MAX_NOTIONAL_USD ?? '100'),
      executionSessionId,
      handoffCreatedAt: createdAt,
      maxBookAgeMs: 5_000,
    });
    Journal.recordHandoff(handoff, createdAt);
    Journal.recordState({
      recyclingHandoffId: handoff.recyclingHandoffId,
      state: 'UI_CAPTURE_WAITING',
      at: createdAt,
    });
    const reportPath = resolve(
      `data/decibel_authenticated_passive_recycling_flat_entry_handoff_v1_${createdAt}.json`,
    );
    writeFileSync(reportPath, `${JSON.stringify(handoff, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    console.log(`RECYCLING_FLAT_ENTRY_HANDOFF_READY=YES`);
    console.log(`INVENTORY_STATE=FLAT`);
    console.log(`CYCLE_SEQUENCE=${handoff.cycleSequence}`);
    console.log(`SIDE_SELECTION_HASH=${handoff.sideSelectionSeedHash}`);
    console.log(`SIDE=${handoff.side}`);
    console.log(`BEST_BID=${handoff.freshBestBid}`);
    console.log(`BEST_ASK=${handoff.freshBestAsk}`);
    console.log(`PRICE=${handoff.price}`);
    console.log(`QUANTITY=${handoff.quantity}`);
    console.log(`NOTIONAL_USD=${handoff.notionalUsd}`);
    console.log(`TYPE=LIMIT`);
    console.log(`POST_ONLY=true`);
    console.log(`OPERATOR_ACTION_REQUIRED=true`);
    console.log(`LIVE_EXECUTION_ENABLED=false`);
    console.log(`VENUE_MUTATION_ENABLED=false`);
    console.log(`REPORT=${reportPath}`);
    console.log(`BLOCKER=NONE`);
  } catch (error) {
    const blocker = error instanceof Error ? error.message : 'RECYCLING_FLAT_ENTRY_BLOCKED';
    const reportPath = resolve(
      `data/decibel_authenticated_passive_recycling_flat_entry_blocked_v1_${createdAt}.json`,
    );
    const diagnostic = Object.freeze({
      observedAt: createdAt,
      blocker,
      checkpointBodyHashSha256: checkpoint.checkpointBodyHashSha256,
      currentPositionBase: read.state.authenticatedPositionBase,
      inventoryState: read.state.inventoryState,
      unresolvedHandoffCount,
      completedCycleCount,
      stateBlockers: read.state.blockers,
      liveExecutionEnabled: false as const,
      venueMutationEnabled: false as const,
      mutationCounters: Object.freeze({
        signedTransactions: 0 as const,
        submittedTransactions: 0 as const,
        placedOrders: 0 as const,
        cancelledOrders: 0 as const,
        replacedOrders: 0 as const,
        venueMutations: 0 as const,
      }),
    });
    writeFileSync(reportPath, `${JSON.stringify(diagnostic, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    console.log(`RECYCLING_FLAT_ENTRY_HANDOFF_READY=NO`);
    console.log(`LIVE_EXECUTION_ENABLED=false`);
    console.log(`VENUE_MUTATION_ENABLED=false`);
    console.log(`REPORT=${reportPath}`);
    console.log(`BLOCKER=${blocker}`);
    process.exitCode = 1;
  }
} finally {
  Journal.close();
}
