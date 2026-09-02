import 'dotenv/config';

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadConfig } from './config.js';
import { decibel_authenticated_passive_recycling_journal_v1 } from './decibel_authenticated_passive_recycling_journal_v1.js';
import { readDecibelAuthenticatedPassiveRecyclingLiveStateV1 } from './decibel_authenticated_passive_recycling_live_reader_v1.js';

for (const name of [
  'LIVE_EXECUTION_ENABLED',
  'VENUE_MUTATION_ENABLED',
  'SIGNER_ENABLED',
  'TRANSACTION_SUBMISSION_ENABLED',
] as const)
  if (process.env[name] === 'true')
    throw new Error(`AUTHENTICATED_RECYCLING_${name}_MUST_BE_FALSE`);

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  return value === undefined || value.startsWith('--') ? undefined : value;
}

const manifestPath = resolve(
  argument('--manifest') ?? 'research/decibel_authenticated_live_canary_success_v1_manifest.json',
);
const journalPath = resolve(
  process.env.DECIBEL_RECYCLING_OPERATOR_JOURNAL_PATH ??
    'data/decibel_authenticated_passive_recycling_operator_cycle_v1.sqlite',
);
const config = loadConfig();
if (config.network !== 'mainnet') throw new Error('AUTHENTICATED_RECYCLING_MAINNET_REQUIRED');
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
  const read = await readDecibelAuthenticatedPassiveRecyclingLiveStateV1({
    config,
    manifestPath,
    knownRecyclingOrders: knownOrders,
    maxStateAgeMs: Math.max(
      1_000,
      Math.min(30_000, Number(process.env.DECIBEL_RECYCLING_MAX_STATE_AGE_MS ?? '5000')),
    ),
    hardInventoryLimitBase: Number(
      process.env.DECIBEL_RECYCLING_HARD_INVENTORY_LIMIT_BASE ?? '0.001',
    ),
  });
  mkdirSync(resolve('data'), { recursive: true });
  const reportPath = resolve(
    `data/decibel_authenticated_passive_recycling_live_state_v1_${read.observedAt}.json`,
  );
  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        manifestPath,
        handoffPath: (read.manifest.sourceArtifacts as { handoff: { path: string } }).handoff.path,
        observedAt: read.observedAt,
        diagnostics: read.diagnostics,
        ...read.state,
      },
      null,
      2,
    )}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  const state = read.state;
  console.log(`AUTHENTICATED_RECYCLING_STATE_READY=${state.ready ? 'YES' : 'NO'}`);
  console.log(`INVENTORY_STATE=${state.inventoryState}`);
  console.log(`AUTHENTICATED_POSITION_BASE=${state.authenticatedPositionBase}`);
  console.log(`AUTHENTICATED_MAKER_VOLUME_USD=${state.authenticatedMakerVolumeUsd}`);
  console.log(`CURRENT_CYCLE_INVENTORY_BASE=${state.currentCycleInventoryBase}`);
  console.log(`COMPLETED_RECYCLE_CYCLES=${state.completedRecycleCycles}`);
  console.log(`ELIGIBLE_SIDE=${state.eligibleSide ?? 'NONE'}`);
  console.log(`PRICE=${state.intent?.price ?? 'NONE'}`);
  console.log(`QUANTITY=${state.intent?.quantity ?? 'NONE'}`);
  console.log(`NOTIONAL_USD=${state.intent?.notionalUsd ?? 'NONE'}`);
  console.log(`TYPE=${state.intent?.type ?? 'NONE'}`);
  console.log(`POST_ONLY=${state.intent?.postOnly ?? false}`);
  console.log(`LIVE_EXECUTION_ENABLED=false`);
  console.log(`VENUE_MUTATION_ENABLED=false`);
  console.log(`OPERATOR_ACTION_REQUIRED=${state.operatorActionRequired}`);
  console.log(`REPORT=${reportPath}`);
  console.log(`BLOCKER=${state.blockers.join(',') || 'NONE'}`);
} catch (error) {
  const blocker = error instanceof Error ? error.message : 'AUTHENTICATED_RECYCLING_READ_FAILED';
  console.error(`AUTHENTICATED_RECYCLING_STATE_READY=NO`);
  console.error(`BLOCKER=${blocker}`);
  console.error(`LIVE_EXECUTION_ENABLED=false`);
  console.error(`VENUE_MUTATION_ENABLED=false`);
  process.exitCode = 1;
} finally {
  Journal.close();
}
