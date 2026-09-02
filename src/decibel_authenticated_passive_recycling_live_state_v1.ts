import { createHash } from 'node:crypto';

import { canonicalizeDecibelAuthenticatedLiveCanarySuccessV1 } from './decibel_authenticated_live_canary_success_freeze_v1.js';

export const DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_LIVE_STATE_V1 =
  'DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_LIVE_STATE_V1' as const;
export const FROZEN_CANARY_MANIFEST_SHA256 =
  'ff0e0b7b69729500a902e7857ca3e67ae1efc1a75f054eba7af975f273395130' as const;
export const FROZEN_CANARY_MANIFEST_BODY_SHA256 =
  '699fd8c4cc986f5b797d9dbd1f795bfaea5b6a3c7aec557dcfa7b520ed5440f5' as const;

export type AuthenticatedRecyclingInventoryState =
  'FLAT' | 'LONG_RECYCLE' | 'SHORT_RECYCLE' | 'HARD_LONG' | 'HARD_SHORT' | 'BLOCKED';

export type decibel_authenticated_recycling_fill_v1 = Readonly<{
  tradeId: string;
  orderId: string;
  clientOrderId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  transactionVersion: number;
  source: 'OrderFill';
  makerStatus: 'PROVEN';
}>;

export type decibel_authenticated_recycling_open_order_v1 = Readonly<{
  orderId: string;
  clientOrderId: string;
  marketAddress: string;
  side: 'BUY' | 'SELL';
  knownRecyclingOrder: boolean;
}>;

type json_record = Record<string, unknown>;

function fail(blocker: string): never {
  throw new Error(blocker);
}

function record(value: unknown, blocker: string): json_record {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(blocker);
  return value as json_record;
}

function string(value: unknown, blocker: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(blocker);
  return value;
}

function number(value: unknown, blocker: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(blocker);
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sameFill(
  left: decibel_authenticated_recycling_fill_v1,
  right: decibel_authenticated_recycling_fill_v1,
) {
  return (
    canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(left) ===
    canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(right)
  );
}

function aligned(value: number, increment: number): boolean {
  const steps = value / increment;
  return Number.isFinite(steps) && Math.abs(steps - Math.round(steps)) <= 1e-8;
}

function preciseEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-12;
}

export function validateDecibelAuthenticatedLiveCanaryManifestV1(input: {
  manifest: json_record;
  manifestFileSha256: string;
}) {
  if (input.manifestFileSha256 !== FROZEN_CANARY_MANIFEST_SHA256)
    fail('AUTHENTICATED_CANARY_MANIFEST_FILE_HASH_MISMATCH');
  if (input.manifest.manifestBodyHashSha256 !== FROZEN_CANARY_MANIFEST_BODY_SHA256)
    fail('AUTHENTICATED_CANARY_MANIFEST_BODY_HASH_MISMATCH');
  const { manifestBodyHashSha256: _hash, ...body } = input.manifest;
  if (sha256(canonicalizeDecibelAuthenticatedLiveCanarySuccessV1(body)) !== _hash)
    fail('AUTHENTICATED_CANARY_MANIFEST_CANONICAL_HASH_MISMATCH');
  const identity = record(input.manifest.identity, 'AUTHENTICATED_CANARY_IDENTITY_REQUIRED');
  const fill = record(input.manifest.fillEvidence, 'AUTHENTICATED_CANARY_FILL_REQUIRED');
  const proofs = record(input.manifest.proofs, 'AUTHENTICATED_CANARY_PROOFS_REQUIRED');
  const position = record(input.manifest.position, 'AUTHENTICATED_CANARY_POSITION_REQUIRED');
  const conclusion = record(input.manifest.conclusion, 'AUTHENTICATED_CANARY_CONCLUSION_REQUIRED');
  if (
    conclusion.authenticatedLiveCanaryStatus !== 'FULL_FILL_RECONCILED' ||
    conclusion.authenticatedOwnFillTruthProven !== true ||
    conclusion.postOnlyMakerExecutionProven !== true ||
    conclusion.fullFillConservationProven !== true ||
    conclusion.positionConservationProven !== true ||
    conclusion.externalCounterpartyRequired !== true ||
    conclusion.selfTradePermitted !== false ||
    proofs.makerStatus !== 'PROVEN' ||
    proofs.fillConservation !== 'PASS' ||
    proofs.positionConservation !== 'PASS'
  )
    fail('AUTHENTICATED_CANARY_SUCCESS_PROOF_INCOMPLETE');
  const fillIds = fill.fillIds;
  if (
    !Array.isArray(fillIds) ||
    fillIds.length === 0 ||
    fillIds.some((id) => typeof id !== 'string')
  )
    fail('AUTHENTICATED_CANARY_FILL_IDS_REQUIRED');
  return Object.freeze({
    identity,
    fill,
    position,
    fillIds: Object.freeze(fillIds.map((id) => string(id, 'AUTHENTICATED_CANARY_FILL_ID_INVALID'))),
  });
}

export function deriveDecibelAuthenticatedPassiveRecyclingLiveStateV1(input: {
  manifest: json_record;
  manifestFileSha256: string;
  now: number;
  accountObservedAt: number;
  maxStateAgeMs: number;
  currentPositionBase: number;
  fills: readonly decibel_authenticated_recycling_fill_v1[];
  knownRecyclingOrderIds?: readonly string[];
  openOrders: readonly decibel_authenticated_recycling_open_order_v1[];
  activeTwapCount: number;
  activeTpSlCount: number;
  activeBulkOrderCount: number;
  lineageBlockers?: readonly string[];
  diagnostics?: Readonly<{
    foreignMarketFillIds: readonly string[];
    knownRecyclingVenueOrderIds: readonly string[];
    unexplainedBtcFillIds?: readonly string[];
    unprovenFillIds?: readonly string[];
  }>;
  book: Readonly<{ bestBid: number; bestAsk: number; observedAt: number }>;
  metadata: Readonly<{
    marketAddress: string;
    tickSize: number;
    lotSize: number;
    minimumSize: number;
    minimumNotionalUsd: number;
    maximumConfiguredNotionalUsd: number;
    mode: string;
  }>;
  hardInventoryLimitBase: number;
}) {
  const frozen = validateDecibelAuthenticatedLiveCanaryManifestV1(input);
  const identity = frozen.identity;
  const blockers: string[] = [];
  const require = (condition: boolean, blocker: string) => {
    if (!condition) blockers.push(blocker);
  };
  require(input.now >= input.accountObservedAt &&
    input.now - input.accountObservedAt <= input.maxStateAgeMs &&
    input.now >= input.book.observedAt &&
    input.now - input.book.observedAt <=
      input.maxStateAgeMs, 'AUTHENTICATED_RECYCLING_STATE_STALE');
  require(input.book.bestBid > 0 &&
    input.book.bestAsk > input.book.bestBid, 'AUTHENTICATED_RECYCLING_BBO_INVALID');
  require(input.metadata.mode === 'Open', 'AUTHENTICATED_RECYCLING_MARKET_NOT_OPEN');
  require(typeof identity.marketAddress === 'string' &&
    input.metadata.marketAddress.toLowerCase() ===
      identity.marketAddress.toLowerCase(), 'AUTHENTICATED_RECYCLING_MARKET_MISMATCH');
  require(input.metadata.tickSize > 0 &&
    input.metadata.lotSize > 0 &&
    input.metadata.minimumSize > 0 &&
    input.metadata.minimumNotionalUsd > 0 &&
    input.metadata.maximumConfiguredNotionalUsd > 0, 'AUTHENTICATED_RECYCLING_METADATA_INVALID');
  require(input.activeTwapCount === 0, 'AUTHENTICATED_RECYCLING_ACTIVE_TWAP');
  require(input.activeTpSlCount === 0, 'AUTHENTICATED_RECYCLING_ACTIVE_TP_SL');
  require(input.activeBulkOrderCount === 0, 'AUTHENTICATED_RECYCLING_ACTIVE_BULK_ORDER');
  for (const blocker of input.lineageBlockers ?? []) require(false, blocker);
  const btcOpenOrders = input.openOrders.filter(
    (order) => order.marketAddress.toLowerCase() === input.metadata.marketAddress.toLowerCase(),
  );
  const foreignMarketOpenOrders = input.openOrders.filter(
    (order) => order.marketAddress.toLowerCase() !== input.metadata.marketAddress.toLowerCase(),
  );
  const unexplainedOpenOrders = btcOpenOrders.filter((order) => !order.knownRecyclingOrder);
  require(unexplainedOpenOrders.length === 0 &&
    btcOpenOrders.length <= 1, 'AUTHENTICATED_RECYCLING_UNEXPLAINED_BTC_OPEN_ORDER');
  // V1 preserves strict account-wide open-order exclusivity, but foreign-market
  // activity is diagnosed explicitly and is never inserted into the BTC ledger.
  require(foreignMarketOpenOrders.length ===
    0, 'AUTHENTICATED_RECYCLING_UNRELATED_MARKET_OPEN_ORDER');

  const unique = new Map<string, decibel_authenticated_recycling_fill_v1>();
  for (const fill of input.fills) {
    if (
      !fill.tradeId ||
      !fill.orderId ||
      !fill.clientOrderId ||
      fill.source !== 'OrderFill' ||
      fill.makerStatus !== 'PROVEN' ||
      !(fill.size > 0) ||
      !(fill.price > 0) ||
      !Number.isSafeInteger(fill.transactionVersion)
    )
      fail('AUTHENTICATED_RECYCLING_FILL_INVALID');
    const prior = unique.get(fill.tradeId);
    if (prior !== undefined && !sameFill(prior, fill))
      fail('AUTHENTICATED_RECYCLING_FILL_ID_CONFLICT');
    unique.set(fill.tradeId, fill);
  }
  const fills = [...unique.values()].sort(
    (left, right) =>
      left.transactionVersion - right.transactionVersion ||
      left.tradeId.localeCompare(right.tradeId),
  );
  const frozenFillIds = new Set(frozen.fillIds);
  const knownRecyclingOrderIds = new Set(input.knownRecyclingOrderIds ?? []);
  require(fills.every(
    (fill) => frozenFillIds.has(fill.tradeId) || knownRecyclingOrderIds.has(fill.orderId),
  ) &&
    frozen.fillIds.every((id) =>
      fills.some((fill) => fill.tradeId === id),
    ), 'AUTHENTICATED_RECYCLING_UNEXPLAINED_BTC_FILL');
  const venueOrderId = string(identity.venueOrderId, 'AUTHENTICATED_CANARY_VENUE_ORDER_REQUIRED');
  const venueClientOrderId = string(
    identity.venueClientOrderId,
    'AUTHENTICATED_CANARY_VENUE_CLIENT_ORDER_REQUIRED',
  );
  require(fills.every(
    (fill) =>
      (frozenFillIds.has(fill.tradeId) &&
        fill.orderId === venueOrderId &&
        fill.clientOrderId === venueClientOrderId) ||
      (!frozenFillIds.has(fill.tradeId) && knownRecyclingOrderIds.has(fill.orderId)),
  ), 'AUTHENTICATED_RECYCLING_FILL_LINEAGE_MISMATCH');

  let ledgerInventory = 0;
  let completedRecycleCycles = 0;
  let cycleOpen = false;
  let authenticatedMakerFilledBase = 0;
  let authenticatedMakerVolumeUsd = 0;
  for (const fill of fills) {
    const before = ledgerInventory;
    ledgerInventory += fill.side === 'BUY' ? fill.size : -fill.size;
    authenticatedMakerFilledBase += fill.size;
    authenticatedMakerVolumeUsd += Math.abs(fill.size * fill.price);
    if (before === 0 && ledgerInventory !== 0) cycleOpen = true;
    if (cycleOpen && ledgerInventory === 0) {
      completedRecycleCycles += 1;
      cycleOpen = false;
    }
  }
  require(preciseEqual(
    ledgerInventory,
    input.currentPositionBase,
  ), 'AUTHENTICATED_RECYCLING_POSITION_CONSERVATION_FAILED');
  require(preciseEqual(
    number(frozen.position.startingPosition, 'ZERO_ANCHOR_REQUIRED'),
    0,
  ), 'AUTHENTICATED_RECYCLING_POSITION_CONSERVATION_FAILED');

  let inventoryState: AuthenticatedRecyclingInventoryState =
    ledgerInventory === 0
      ? 'FLAT'
      : Math.abs(ledgerInventory) >= input.hardInventoryLimitBase
        ? ledgerInventory > 0
          ? 'HARD_LONG'
          : 'HARD_SHORT'
        : ledgerInventory > 0
          ? 'LONG_RECYCLE'
          : 'SHORT_RECYCLE';
  if (blockers.length > 0) inventoryState = 'BLOCKED';
  const eligibleSide =
    inventoryState === 'LONG_RECYCLE' || inventoryState === 'HARD_LONG'
      ? ('SELL' as const)
      : inventoryState === 'SHORT_RECYCLE' || inventoryState === 'HARD_SHORT'
        ? ('BUY' as const)
        : null;
  const quantity = Math.abs(ledgerInventory);
  const price =
    eligibleSide === 'SELL'
      ? input.book.bestAsk
      : eligibleSide === 'BUY'
        ? input.book.bestBid
        : null;
  if (eligibleSide !== null && price !== null) {
    require(aligned(
      quantity,
      input.metadata.lotSize,
    ), 'AUTHENTICATED_RECYCLING_QUANTITY_NOT_LOT_ALIGNED');
    require(quantity >=
      input.metadata.minimumSize, 'AUTHENTICATED_RECYCLING_QUANTITY_BELOW_MINIMUM');
    require(price * quantity >=
      input.metadata.minimumNotionalUsd, 'AUTHENTICATED_RECYCLING_NOTIONAL_BELOW_MINIMUM');
    require(price * quantity <=
      input.metadata
        .maximumConfiguredNotionalUsd, 'AUTHENTICATED_RECYCLING_NOTIONAL_ABOVE_MAXIMUM');
  }
  if (blockers.length > 0) inventoryState = 'BLOCKED';
  const knownOrder = btcOpenOrders[0] ?? null;
  const intent =
    blockers.length > 0 || eligibleSide === null || price === null || knownOrder !== null
      ? null
      : Object.freeze({
          side: eligibleSide,
          price,
          quantity,
          notionalUsd: Number((price * quantity).toFixed(12)),
          type: 'LIMIT' as const,
          timeInForce: 'PostOnly' as const,
          postOnly: true as const,
        });
  return Object.freeze({
    version: DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_LIVE_STATE_V1,
    ready: blockers.length === 0,
    inventoryState,
    authenticatedPositionBase: input.currentPositionBase,
    authenticatedFillIds: Object.freeze(fills.map((fill) => fill.tradeId)),
    authenticatedMakerFilledBase,
    authenticatedMakerVolumeUsd,
    completedRecycleCycles,
    cycleStarted: fills.length > 0,
    cycleCompleted: completedRecycleCycles > 0,
    currentCycleInventoryBase: ledgerInventory,
    eligibleSide: blockers.length === 0 ? eligibleSide : null,
    buySuppressed: ledgerInventory > 0,
    sellSuppressed: ledgerInventory < 0,
    knownActiveRecyclingOrder: knownOrder,
    intent,
    book: Object.freeze({ ...input.book }),
    btcOpenOrderIds: Object.freeze(btcOpenOrders.map((order) => order.orderId)),
    foreignMarketOpenOrderIds: Object.freeze(foreignMarketOpenOrders.map((order) => order.orderId)),
    foreignMarketFillIds: Object.freeze([...(input.diagnostics?.foreignMarketFillIds ?? [])]),
    unexplainedBtcFillIds: Object.freeze([...(input.diagnostics?.unexplainedBtcFillIds ?? [])]),
    unprovenFillIds: Object.freeze([...(input.diagnostics?.unprovenFillIds ?? [])]),
    knownRecyclingVenueOrderIds: Object.freeze([
      ...(input.diagnostics?.knownRecyclingVenueOrderIds ?? []),
    ]),
    openOrderSafetyPassed:
      unexplainedOpenOrders.length === 0 &&
      btcOpenOrders.length <= 1 &&
      foreignMarketOpenOrders.length === 0,
    positionConservationPassed: preciseEqual(ledgerInventory, input.currentPositionBase),
    blockers: Object.freeze([...new Set(blockers)]),
    externalCounterpartyRequired: true as const,
    selfTradePermitted: false as const,
    liveExecutionEnabled: false as const,
    venueMutationEnabled: false as const,
    operatorActionRequired: intent !== null,
    mutationCounters: Object.freeze({
      signedTransactions: 0 as const,
      submittedTransactions: 0 as const,
      placedOrders: 0 as const,
      cancelledOrders: 0 as const,
      replacedOrders: 0 as const,
      venueMutations: 0 as const,
    }),
  });
}
