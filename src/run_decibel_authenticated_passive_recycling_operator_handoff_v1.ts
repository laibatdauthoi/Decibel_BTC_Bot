import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadConfig } from './config.js';
import { decibel_authenticated_passive_recycling_journal_v1 } from './decibel_authenticated_passive_recycling_journal_v1.js';
import { readDecibelAuthenticatedPassiveRecyclingLiveStateV1 } from './decibel_authenticated_passive_recycling_live_reader_v1.js';
import { buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1 } from './decibel_authenticated_passive_recycling_operator_handoff_v1.js';

for (const name of [
  'LIVE_EXECUTION_ENABLED',
  'VENUE_MUTATION_ENABLED',
  'SIGNER_ENABLED',
  'TRANSACTION_SUBMISSION_ENABLED',
] as const)
  if (process.env[name] === 'true') throw new Error(`RECYCLING_HANDOFF_${name}_MUST_BE_FALSE`);
const config = loadConfig();
if (config.network !== 'mainnet') throw new Error('RECYCLING_HANDOFF_MAINNET_REQUIRED');
const manifestPath = resolve('research/decibel_authenticated_live_canary_success_v1_manifest.json');
const journalPath = resolve(
  process.env.DECIBEL_RECYCLING_OPERATOR_JOURNAL_PATH ??
    'data/decibel_authenticated_passive_recycling_operator_cycle_v1.sqlite',
);
mkdirSync(resolve('data'), { recursive: true });
const Journal = new decibel_authenticated_passive_recycling_journal_v1(journalPath);
if (Journal.unresolvedCount() > 0) {
  Journal.close();
  throw new Error('RECYCLING_HANDOFF_ALREADY_UNRESOLVED');
}
const knownOrders = Journal.list().flatMap((row) => {
  if (row.captureJson === null) return [];
  const capture = JSON.parse(row.captureJson) as {
    venueOrderId: string;
    venueClientOrderId: string;
  };
  const handoff = JSON.parse(row.handoffJson) as { side: 'BUY' | 'SELL' };
  return [
    {
      orderId: capture.venueOrderId,
      clientOrderId: capture.venueClientOrderId,
      side: handoff.side,
    },
  ];
});
const read = () =>
  readDecibelAuthenticatedPassiveRecyclingLiveStateV1({
    config,
    manifestPath,
    knownRecyclingOrders: knownOrders,
    maxStateAgeMs: 5_000,
    hardInventoryLimitBase: 0.001,
  });
const initial = await read();
const final = await read();
const createdAt = Date.now();
const executionSessionId = `recycling-session-${createdAt}-${createHash('sha256').update(`${createdAt}:${initial.handoff.subaccount}`).digest('hex').slice(0, 12)}`;
const handoff = buildDecibelAuthenticatedPassiveRecyclingOperatorHandoffV1({
  initialState: initial.state,
  finalState: final.state,
  executionSessionId,
  sourceManifestBodyHash: String(final.manifest.manifestBodyHashSha256),
  subaccount: final.handoff.subaccount,
  market: 'BTC/USD',
  marketAddress: final.handoff.marketAddress,
  handoffCreatedAt: createdAt,
});
Journal.recordHandoff(handoff, createdAt);
Journal.recordState({
  recyclingHandoffId: handoff.recyclingHandoffId,
  state: 'UI_CAPTURE_WAITING',
  at: createdAt,
});
Journal.close();
const path = resolve(
  `data/decibel_authenticated_passive_recycling_operator_handoff_v1_${createdAt}.json`,
);
writeFileSync(path, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(`RECYCLING_OPERATOR_HANDOFF_READY=YES`);
console.log(`RECYCLING_HANDOFF_ID=${handoff.recyclingHandoffId}`);
console.log(`SIDE=${handoff.side}`);
console.log(`PRICE=${handoff.price}`);
console.log(`QUANTITY=${handoff.quantity}`);
console.log(`NOTIONAL_USD=${handoff.notionalUsd}`);
console.log(`TYPE=${handoff.type}`);
console.log(`POST_ONLY=${handoff.postOnly}`);
console.log(`OPERATOR_ACTION_REQUIRED=true`);
console.log(`LIVE_EXECUTION_ENABLED=false`);
console.log(`VENUE_MUTATION_ENABLED=false`);
console.log(`REPORT=${path}`);
console.log(`BLOCKER=NONE`);
