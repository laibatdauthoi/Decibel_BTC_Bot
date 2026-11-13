import { createHash } from 'node:crypto';
import type {
  DecibelProductionLiveStateSourceV1,
  decibel_production_live_snapshot_v1,
} from './decibel_production_live_orchestrator_v1.js';

export type decibel_venue_read_window_v1 = Readonly<{ startedAt: number; completedAt: number }>;
type account_state = Awaited<
  ReturnType<NonNullable<DecibelProductionLiveStateSourceV1['readAuthenticatedAccountState']>>
>;
type history_state = Awaited<
  ReturnType<NonNullable<DecibelProductionLiveStateSourceV1['readAuthenticatedFillLedger']>>
>;

/** Publish account, orders and history as one batch. Omission is not terminal evidence. */
export function mergeDecibelVenueReconciliationSnapshotV1(
  previous: decibel_production_live_snapshot_v1,
  account: account_state,
  history: history_state | null,
): decibel_production_live_snapshot_v1 | null {
  const prior = previous.venueReadWindow;
  if (
    account.observedAt < (prior?.account.completedAt ?? previous.input.now) ||
    (history !== null &&
      prior?.history !== undefined &&
      history.observedAt < prior.history.startedAt)
  )
    return null;
  const accountWindow = account.readWindow ?? {
    startedAt: account.observedAt,
    completedAt: account.observedAt,
  };
  const historyWindow = history?.readWindow ?? (history === null ? prior?.history : undefined);
  // A slow older request may finish after a newer read. Completion time alone
  // cannot make its position/orders supersede the newer authenticated batch.
  if (
    (prior !== undefined && accountWindow.startedAt < prior.account.startedAt) ||
    (history !== null &&
      historyWindow &&
      prior?.history &&
      historyWindow.startedAt < prior.history.startedAt)
  )
    return null;
  const now = Math.max(accountWindow.completedAt, historyWindow?.completedAt ?? account.observedAt);
  for (const window of [
    accountWindow,
    ...(history !== null && historyWindow ? [historyWindow] : []),
  ]) {
    if (
      !Number.isSafeInteger(window.startedAt) ||
      !Number.isSafeInteger(window.completedAt) ||
      window.startedAt > window.completedAt ||
      now - window.startedAt > previous.input.maxBboAgeMs
    )
      throw new Error('PRODUCTION_AUTHENTICATED_BATCH_STALE');
  }
  if (
    history !== null &&
    historyWindow &&
    (accountWindow.startedAt > historyWindow.completedAt ||
      historyWindow.startedAt > accountWindow.completedAt)
  )
    throw new Error('PRODUCTION_AUTHENTICATED_BATCH_INCONSISTENT');
  const position = account.authenticatedPositions
    .filter((row) => row.market === 'BTC/USD')
    .reduce((sum, row) => sum + row.size, 0);
  if (!Number.isFinite(position) || Math.abs(position - account.actualInventoryBase) > 1e-12)
    throw new Error('PRODUCTION_AUTHENTICATED_BATCH_POSITION_MISMATCH');
  const venueReadWindow = Object.freeze({
    account: accountWindow,
    ...(historyWindow ? { history: historyWindow } : {}),
  });
  const input = Object.freeze({
    ...previous.input,
    now,
    ...(account.marketMetadata ? { metadata: account.marketMetadata } : {}),
    actualInventoryBase: account.actualInventoryBase,
    openOrders: account.openOrders,
    ...(account.activeTpSlCount === undefined ? {} : { activeTpSlCount: account.activeTpSlCount }),
    actualFillLedger: history?.ledger ?? previous.input.actualFillLedger,
  });
  const terminalOrderEvidence =
    history?.terminalOrderEvidence ?? (history === null ? previous.terminalOrderEvidence : []);
  return Object.freeze({
    ...previous,
    availableMarginUsd: account.availableMarginUsd ?? Number.NaN,
    accountMetrics: account.accountMetrics,
    authenticatedPositions: account.authenticatedPositions,
    ...(account.catastropheStop === undefined ? {} : { catastropheStop: account.catastropheStop }),
    input,
    venueReadWindow,
    ...(terminalOrderEvidence === undefined ? {} : { terminalOrderEvidence }),
    sourceStateHash: createHash('sha256')
      .update(
        JSON.stringify({
          input,
          terminalOrderEvidence,
          venueReadWindow,
          accountMetrics: account.accountMetrics,
          positions: account.authenticatedPositions,
          availableMarginUsd: account.availableMarginUsd,
        }),
      )
      .digest('hex'),
  });
}

/** Check original read clocks, not snapshot assembly/publication time. */
export function assertDecibelVenueReconciliationFreshV1(
  snapshot: decibel_production_live_snapshot_v1,
  now: number,
): void {
  if (!snapshot.venueReadWindow) return;
  for (const window of Object.values(snapshot.venueReadWindow)) {
    if (
      !Number.isSafeInteger(window.startedAt) ||
      !Number.isSafeInteger(window.completedAt) ||
      window.startedAt > window.completedAt ||
      window.completedAt > now ||
      now - window.startedAt > snapshot.input.maxBboAgeMs
    )
      throw new Error('PRODUCTION_AUTHENTICATED_BATCH_STALE');
  }
}

export function projectDecibelVenueDecisionSnapshotV1(
  base: decibel_production_live_snapshot_v1,
  venue: decibel_production_live_snapshot_v1,
  market: decibel_production_live_snapshot_v1['input']['book'],
  economic: decibel_production_live_snapshot_v1['economicInputs'] | null,
  sessionId: string,
  now: number,
): decibel_production_live_snapshot_v1 {
  const book = { ...base.input.book, ...market };
  // A new BBO frame cannot inherit depth from a previous frame, even when its
  // top prices happen to be unchanged. Missing depth remains missing evidence.
  if (market.depth === undefined) delete book.depth;
  const input = Object.freeze({
    ...base.input,
    now,
    sessionId,
    metadata: venue.input.metadata,
    book: Object.freeze(book),
    actualInventoryBase: venue.input.actualInventoryBase,
    openOrders: venue.input.openOrders,
    actualFillLedger: venue.input.actualFillLedger,
  });
  // Unknown economic values must remain unknown. They do not erase venue facts.
  const economicInputs: NonNullable<decibel_production_live_snapshot_v1['economicInputs']> =
    economic ?? {
      makerFeeBps: null,
      makerFeeSource: 'UNKNOWN',
      estimatedGasCostUsd: null,
      estimatedGasCostSource: 'UNKNOWN',
      adverseSelectionBufferBps: null,
      adverseSelectionSource: 'UNKNOWN',
      safetyMarginBps: base.economicInputs?.safetyMarginBps ?? 1,
    };
  const sourceStateHash = createHash('sha256')
    .update(
      JSON.stringify({
        venue: venue.sourceStateHash,
        book: input.book,
        sessionId,
        position: input.actualInventoryBase,
        openOrders: input.openOrders,
        economicInputs,
        terminalOrderEvidence: venue.terminalOrderEvidence,
      }),
    )
    .digest('hex');
  return Object.freeze({
    ...base,
    input,
    sourceStateHash,
    economicInputs,
    availableMarginUsd: venue.availableMarginUsd,
    ...(venue.accountMetrics ? { accountMetrics: venue.accountMetrics } : {}),
    ...(venue.authenticatedPositions
      ? { authenticatedPositions: venue.authenticatedPositions }
      : {}),
    ...(venue.venueReadWindow ? { venueReadWindow: venue.venueReadWindow } : {}),
    terminalOrderEvidence: venue.terminalOrderEvidence ?? [],
  });
}
