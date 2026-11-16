import type { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import type { execution_intent_v1 } from './decibel_execution_intent_v1.js';
import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_types_v1.js';
import { resolveDecibelAuthoritativeOrderEvidenceV1 } from './decibel_authoritative_order_reconciliation_v1.js';

/** Resolve the original PLACE, never a newer CANCEL or a client-ID prefix. */
export function getDecibelVerifiedCurrentPlaceOwnerV1(
  Journal: decibel_execution_lifecycle_journal_v1,
  snapshot: decibel_production_live_snapshot_v1,
  order: decibel_production_live_snapshot_v1['input']['openOrders'][number],
) {
  const owners = Journal.getOrderLineageByVenueOrderId(order.venueOrderId)
    .map((row) => ({ row, body: Journal.getIntent(row.intentId) }))
    .filter((owner) => owner.body?.action === 'PLACE');
  const owner = owners[0];
  const tick = snapshot.input.metadata.tickSize;
  if (
    owners.length !== 1 ||
    !owner ||
    !owner.body ||
    owner.body.action !== 'PLACE' ||
    !['ACKNOWLEDGED', 'RECONCILING'].includes(owner.row.status) ||
    owner.body.clientOrderId !== order.clientOrderId ||
    owner.body.sessionId !== snapshot.input.sessionId ||
    owner.body.market !== 'BTC/USD' ||
    owner.body.side !== order.side ||
    owner.body.reduceOnly !== order.reduceOnly ||
    !(tick > 0) ||
    !Number.isFinite(order.price) ||
    Math.abs(order.price / tick - owner.body.priceTicks) > 1e-6 ||
    !Number.isFinite(order.quantity) ||
    order.quantity <= 0 ||
    order.quantity > owner.body.quantity + 1e-12 ||
    order.market !== snapshot.input.market ||
    order.strategyConfigId !== snapshot.input.strategyConfigId
  )
    return null;
  return owner;
}

export function assertDecibelExposureRecoveryCompleteV1(
  Journal: decibel_execution_lifecycle_journal_v1,
  snapshot: decibel_production_live_snapshot_v1,
): void {
  const conflict = Journal.getActiveIdentityConflict();
  if (conflict) throw new Error(conflict.blocker);
  for (const order of snapshot.input.openOrders)
    if (!getDecibelVerifiedCurrentPlaceOwnerV1(Journal, snapshot, order))
      throw new Error('PRODUCTION_EXPOSURE_RECOVERY_INCOMPLETE');
  for (const row of Journal.nonTerminal()) {
    const body = Journal.getIntent(row.intentId);
    const order = snapshot.input.openOrders.find(
      (open) =>
        open.venueOrderId === row.venueOrderId && open.clientOrderId === body?.clientOrderId,
    );
    if (
      !body ||
      body.action !== 'PLACE' ||
      row.status !== 'ACKNOWLEDGED' ||
      !order ||
      order.side !== body.side ||
      !getDecibelVerifiedCurrentPlaceOwnerV1(Journal, snapshot, order) ||
      order.quantity > body.quantity + 1e-12 ||
      Journal.getLatestReconciliationProvenance(row.intentId)?.venueStatus !== 'OPEN'
    )
      throw new Error('PRODUCTION_EXPOSURE_RECOVERY_INCOMPLETE');
  }
}

/** Snapshot-only reconciliation for the current protective order after a crash.
 * No ACK, empty order list or flat position is accepted as terminal evidence. */
export function reconcileDecibelCurrentProtectiveEvidenceV1(
  Journal: decibel_execution_lifecycle_journal_v1,
  snapshot: decibel_production_live_snapshot_v1,
): string | null {
  for (const row of Journal.nonTerminal()) {
    const body = Journal.getIntent(row.intentId);
    if (
      !body ||
      body.action !== 'PLACE' ||
      !body.reduceOnly ||
      body.sessionId !== snapshot.input.sessionId ||
      Journal.getActiveIdentityConflicts().some((conflict) => conflict.intentId === row.intentId)
    )
      continue;
    const open = snapshot.input.openOrders.find(
      (order) => order.clientOrderId === body.clientOrderId,
    );
    const terminal = snapshot.terminalOrderEvidence?.find(
      (order) => order.clientOrderId === body.clientOrderId,
    );
    const venueOrderId = row.venueOrderId ?? open?.venueOrderId ?? terminal?.venueOrderId;
    if (!venueOrderId || (!open && !terminal)) continue;
    if (open && (open.reduceOnly !== true || open.price !== body.price)) continue;
    const fills = snapshot.input.actualFillLedger.fills.filter(
      (fill) => fill.venueOrderId === venueOrderId,
    );
    const canonical = resolveDecibelAuthoritativeOrderEvidenceV1({
      identity: {
        market: 'BTC/USD',
        venueOrderId,
        clientOrderId: body.clientOrderId,
        intentId: body.intentId,
        side: body.side,
        originalQuantity: body.quantity,
      },
      observations: [
        ...(open
          ? [
              {
                source: 'AUTHENTICATED_OPEN_ORDERS' as const,
                sourceTimestamp: null,
                observedAt: snapshot.input.now,
                market: 'BTC/USD',
                venueOrderId: open.venueOrderId,
                clientOrderId: open.clientOrderId,
                side: open.side,
                originalQuantity: null,
                remainingQuantity: open.quantity,
                terminalStatus: null,
              },
            ]
          : []),
        ...(terminal
          ? [
              {
                source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' as const,
                sourceTimestamp: null,
                observedAt: snapshot.input.now,
                market: 'BTC/USD',
                venueOrderId: terminal.venueOrderId,
                clientOrderId: terminal.clientOrderId ?? '',
                side: body.side,
                originalQuantity: terminal.originalQuantity,
                remainingQuantity: terminal.remainingQuantity,
                terminalStatus: terminal.state,
              },
            ]
          : []),
      ],
      fills: fills.map((fill) => ({
        source: 'AUTHENTICATED_OWN_FILL_STREAM',
        observedAt: fill.receivedAt.getTime(),
        venueTimestamp: fill.venueTimestamp?.getTime() ?? null,
        market: 'BTC/USD',
        venueOrderId: fill.venueOrderId,
        clientOrderId: fill.localExecutionRequestId,
        fillId: fill.venueFillId,
        quantity: fill.executedBaseQuantity,
        price: fill.executedPrice,
      })),
    });
    if (canonical.state === 'CONFLICT')
      throw new Error('PROTECTIVE_CURRENT_ORDER_IDENTITY_CONFLICT');
    if (
      canonical.state === 'FULL_FILL' &&
      Math.abs(fills.reduce((sum, fill) => sum + fill.executedBaseQuantity, 0) - body.quantity) >
        1e-12
    )
      continue;
    const full = canonical.state === 'FULL_FILL';
    const cancelled = canonical.state === 'CANCELLED' && canonical.remainingQuantity === 0;
    if (!full && !cancelled && canonical.state !== 'OPEN' && canonical.state !== 'PARTIAL_FILL')
      continue;
    if (
      !full &&
      !cancelled &&
      (!open || open.quantity > Math.abs(snapshot.input.actualInventoryBase) + 1e-12)
    )
      continue;
    Journal.applyAuthoritativeReconciliation({
      intentId: row.intentId,
      reconciliationState: full
        ? 'FULL_FILL'
        : cancelled
          ? 'CANCELLED_EXTERNALLY'
          : canonical.state === 'PARTIAL_FILL'
            ? 'PARTIAL_FILL'
            : 'ORDER_OPEN',
      terminalStatus: full ? 'APPLIED' : cancelled ? 'CANCELLED_EXTERNALLY' : 'ACKNOWLEDGED',
      source: terminal ? 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' : 'AUTHENTICATED_OPEN_ORDERS',
      matchedIdentifier: `venueOrderId:${venueOrderId}`,
      venueStatus: full ? 'FILLED' : cancelled ? 'CANCELLED' : 'OPEN',
      remainingQuantity: full || cancelled ? 0 : open!.quantity,
      transactionHash: Journal.getSubmissionTelemetry(row.intentId)?.transactionHash ?? null,
      venueOrderId,
      clientOrderId: body.clientOrderId,
      observedAt: snapshot.input.now,
      fills: fills.map((fill) => {
        if (!fill.transactionVersion || !/^[1-9][0-9]*$/.test(fill.transactionVersion))
          throw new Error('PROTECTIVE_FILL_PROVENANCE_REQUIRED');
        return {
          fillId: fill.venueFillId,
          quantity: fill.executedBaseQuantity,
          price: fill.executedPrice,
          transactionVersion: fill.transactionVersion,
          ...(fill.venueTimestamp ? { transactionTimestamp: fill.venueTimestamp.getTime() } : {}),
        };
      }),
    });
    return row.intentId;
  }
  return null;
}

/** Recomputed for each cycle and again immediately before journal admission.
 * This proves only independence from historical recovery, never order finality. */
export function assessDecibelProtectiveRecoveryV1(
  Journal: decibel_execution_lifecycle_journal_v1,
  snapshot: decibel_production_live_snapshot_v1,
  now: number,
) {
  const source = snapshot.input;
  const unrelatedIntentIds: string[] = [];
  const reject = (blocker: string) => ({
    allowed: false as const,
    blocker,
    unrelatedIntentIds: [] as readonly string[],
  });
  if (
    ![
      source.maxBboAgeMs,
      source.metadata.tickSize,
      source.metadata.lotSize,
      source.metadata.minimumSize,
    ].every((value) => Number.isFinite(value) && value > 0)
  )
    return reject('PROTECTIVE_VENUE_RULES_UNVERIFIED');
  if (
    !snapshot.venueReadWindow ||
    Object.values(snapshot.venueReadWindow).some(
      (window) =>
        !Number.isFinite(window.startedAt) ||
        !Number.isFinite(window.completedAt) ||
        window.startedAt > window.completedAt ||
        window.completedAt > now ||
        now - window.startedAt > source.maxBboAgeMs,
    )
  )
    return reject('PROTECTIVE_AUTHORITATIVE_BATCH_PROVENANCE_REQUIRED');
  const accountAt =
    snapshot.venueReadWindow?.account.startedAt ??
    snapshot.practicalCapacityInputs?.accountObservedAt ??
    source.now;
  if (
    ![accountAt, source.now, source.book.observedAt, source.metadata.observedAt].every(
      (at) => Number.isFinite(at) && at <= now && now - at <= source.maxBboAgeMs,
    )
  )
    return reject('PROTECTIVE_AUTHORITATIVE_EVIDENCE_STALE');
  if (
    !source.configuredSubaccount ||
    source.configuredSubaccount !== source.authenticatedSubaccount ||
    source.configuredNetwork !== source.observedNetwork ||
    source.metadata.marketAddress !== source.market
  )
    return reject('PROTECTIVE_ACCOUNT_OR_MARKET_IDENTITY_CONFLICT');
  if (
    !Number.isFinite(source.actualInventoryBase) ||
    !source.inventoryDirectionProven ||
    !source.persistenceAvailable ||
    source.unresolvedExecutionPlanCount > 0 ||
    source.activeTwapCount > 0 ||
    source.activeTpSlCount > 0 ||
    source.activeBulkOrderCount > 0 ||
    source.manualOrDelegatedActivityCount > 0
  )
    return reject('PROTECTIVE_INVENTORY_OR_OUTSTANDING_ACTIVITY_UNKNOWN');
  if (
    !(source.book.bestBid > 0 && source.book.bestAsk > source.book.bestBid) ||
    source.metadata.mode !== 'Open'
  )
    return reject('PROTECTIVE_EXECUTABLE_MARKET_REQUIRED');
  const seenOrders = new Set<string>();
  const seenClients = new Set<string>();
  let covered = 0;
  for (const order of source.openOrders) {
    if (
      !order.venueOrderId ||
      !order.clientOrderId ||
      seenOrders.has(order.venueOrderId) ||
      seenClients.has(order.clientOrderId)
    )
      return reject('PROTECTIVE_CURRENT_ORDER_IDENTITY_CONFLICT');
    seenOrders.add(order.venueOrderId);
    seenClients.add(order.clientOrderId);
    const owner = getDecibelVerifiedCurrentPlaceOwnerV1(Journal, snapshot, order);
    if (!owner) return reject('PROTECTIVE_CURRENT_ORDER_OWNERSHIP_UNVERIFIED');
    if (
      order.reduceOnly === true &&
      !(
        (source.actualInventoryBase > 0 && order.side === 'SELL') ||
        (source.actualInventoryBase < 0 && order.side === 'BUY')
      )
    )
      return reject('PROTECTIVE_CURRENT_ORDER_OWNERSHIP_UNVERIFIED');
    if (order.reduceOnly === true) covered += order.quantity;
  }
  if (covered > Math.abs(source.actualInventoryBase) + 1e-12)
    return reject('PROTECTIVE_AGGREGATE_REDUCTION_CONFLICT');
  for (const row of Journal.nonTerminal()) {
    const body = Journal.getIntent(row.intentId);
    if (!body) return reject('PROTECTIVE_JOURNAL_IDENTITY_UNKNOWN');
    if (body.action === 'PLACE') {
      if (
        !['ACKNOWLEDGED', 'RECONCILING'].includes(row.status) ||
        !source.openOrders.some(
          (order) =>
            order.venueOrderId === row.venueOrderId && order.clientOrderId === body.clientOrderId,
        )
      )
        return reject('PROTECTIVE_OUTSTANDING_SUBMISSION_UNRESOLVED');
      continue;
    }
    if (
      !['ACKNOWLEDGED', 'RECONCILING', 'UNRESOLVABLE_ACK'].includes(row.status) ||
      row.venueOrderId !== body.expectedPreviousVenueOrderId ||
      body.createdAt >= accountAt ||
      source.openOrders.some(
        (order) =>
          order.venueOrderId === body.expectedPreviousVenueOrderId ||
          order.clientOrderId === body.clientOrderId,
      )
    )
      return reject('PROTECTIVE_CANCEL_AFFECTS_CURRENT_STATE');
    const owners = Journal.getOrderLineageByVenueOrderId(body.expectedPreviousVenueOrderId)
      .map((owner) => Journal.getIntent(owner.intentId))
      .filter((owner) => owner?.action === 'PLACE');
    const owner = owners[0];
    if (
      owners.length !== 1 ||
      !owner ||
      owner.clientOrderId !== body.clientOrderId ||
      owner.side !== body.side ||
      owner.market !== body.market ||
      body.quantity > owner.quantity + 1e-12
    )
      return reject('PROTECTIVE_HISTORICAL_LINEAGE_AMBIGUOUS');
    const provenance = Journal.getLatestReconciliationProvenance(owner.intentId);
    if (
      provenance?.source !== 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' ||
      !['CANCELLED', 'FILLED', 'EXPIRED', 'REJECTED'].includes(provenance.venueStatus) ||
      provenance.remainingQuantity !== 0 ||
      provenance.observedAt < owner.createdAt ||
      provenance.observedAt > accountAt ||
      provenance.venueOrderId !== body.expectedPreviousVenueOrderId ||
      provenance.clientOrderId !== owner.clientOrderId
    )
      return reject('PROTECTIVE_ORIGINAL_SUBMISSION_FINALITY_UNVERIFIED');
    unrelatedIntentIds.push(row.intentId);
  }
  for (const conflict of Journal.getActiveIdentityConflicts()) {
    if (unrelatedIntentIds.includes(conflict.intentId)) continue;
    const row = Journal.get(conflict.intentId);
    const body = Journal.getIntent(conflict.intentId);
    const provenance = Journal.getLatestReconciliationProvenance(conflict.intentId);
    // A terminal historical identity conflict need not contaminate current
    // inventory. Require exact finality and disjoint current identifiers; never
    // infer this exemption from terminal status or FLAT alone.
    if (
      row &&
      body &&
      ['APPLIED', 'CANCELLED_EXTERNALLY', 'EXTERNALLY_NEUTRALIZED'].includes(row.status) &&
      body.createdAt < accountAt &&
      row.venueOrderId !== null &&
      provenance?.source === 'AUTHENTICATED_TERMINAL_ORDER_HISTORY' &&
      ['FILLED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(provenance.venueStatus) &&
      provenance.remainingQuantity === 0 &&
      provenance.observedAt >= body.createdAt &&
      provenance.observedAt <= accountAt &&
      provenance.venueOrderId === row.venueOrderId &&
      provenance.clientOrderId === body.clientOrderId &&
      !source.openOrders.some(
        (order) =>
          order.venueOrderId === row.venueOrderId || order.clientOrderId === body.clientOrderId,
      )
    )
      unrelatedIntentIds.push(row.intentId);
  }
  const conflict = Journal.getActiveIdentityConflicts().find(
    (candidate) => !unrelatedIntentIds.includes(candidate.intentId),
  );
  if (conflict) return reject('PROTECTIVE_RELEVANT_IDENTITY_CONFLICT');
  return {
    allowed: true as const,
    blocker: null,
    unrelatedIntentIds: Object.freeze(unrelatedIntentIds),
  };
}

export function assertDecibelProtectiveIntentV1(
  intent: execution_intent_v1,
  snapshot: decibel_production_live_snapshot_v1,
): void {
  const position = snapshot.input.actualInventoryBase;
  if (
    intent.action !== 'PLACE' ||
    !intent.reduceOnly ||
    !intent.postOnly ||
    intent.timeInForce !== 'PostOnly' ||
    !((position > 0 && intent.side === 'SELL') || (position < 0 && intent.side === 'BUY')) ||
    intent.quantity <= 0 ||
    intent.quantity > Math.abs(position) + 1e-12
  )
    throw new Error('PROTECTIVE_ONLY_EXPOSURE_OR_CANCEL_BLOCKED');
  if (
    intent.side === 'SELL'
      ? intent.price <= snapshot.input.book.bestBid
      : intent.price >= snapshot.input.book.bestAsk
  )
    throw new Error('PROTECTIVE_EXECUTABLE_MAKER_PRICE_CHANGED');
  // No multi-order/atomic semantics are proven by the pinned production adapter.
  if (snapshot.input.openOrders.length > 0)
    throw new Error('PROTECTIVE_REPAIR_REQUIRES_VERIFIED_ADDITIVE_OR_ATOMIC_SUPPORT');
}

/** Recovery may remove a freshly authenticated owned ENTRY; it cannot create
 * exposure, cancel external orders, revive terminal ownership or remove a TP. */
export function assertDecibelRecoveryIntentV1(
  Journal: decibel_execution_lifecycle_journal_v1,
  intent: execution_intent_v1,
  snapshot: decibel_production_live_snapshot_v1,
): void {
  if (intent.action !== 'CANCEL') return assertDecibelProtectiveIntentV1(intent, snapshot);
  const order = snapshot.input.openOrders.find(
    (open) =>
      open.venueOrderId === intent.expectedPreviousVenueOrderId &&
      open.clientOrderId === intent.clientOrderId,
  );
  const owner = order && getDecibelVerifiedCurrentPlaceOwnerV1(Journal, snapshot, order);
  if (
    !order ||
    !owner ||
    order.reduceOnly !== false ||
    intent.sessionId !== snapshot.input.sessionId ||
    intent.market !== 'BTC/USD' ||
    intent.side !== order.side ||
    intent.priceTicks !== owner.body!.priceTicks ||
    order.quantity > intent.quantity + 1e-12 ||
    intent.quantity > owner.body!.quantity + 1e-12
  )
    throw new Error('RECOVERY_OWNED_ENTRY_CANCEL_UNVERIFIED');
}
