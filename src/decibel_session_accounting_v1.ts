import type { decibel_production_session_controller_v1 } from './decibel_production_session_controller_v1.js';
import type { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import type { decibel_actual_fill_ledger_v1 } from './decibel_actual_fill_truth_v1.js';
import { calculateDecibelSessionExecutionMetricsV1 } from './decibel_operator_settings_v1.js';

export function getDecibelExecutionFillKeyV1(
  venueOrderId: string,
  venueFillId: string,
  fragmentId?: string,
): string {
  return JSON.stringify(
    fragmentId === undefined
      ? [venueOrderId, venueFillId]
      : [venueOrderId, venueFillId, fragmentId],
  );
}

export function synchronizeDecibelSessionAccountingV1(
  Journal: decibel_execution_lifecycle_journal_v1,
  ledger: decibel_actual_fill_ledger_v1,
  sessionId: string,
  markPrice: number,
) {
  const batch: Parameters<decibel_execution_lifecycle_journal_v1['applyFill']>[0][] = [];
  for (const fill of ledger.fills) {
    const lineage = Journal.getOrderLineageByVenueOrderId(fill.venueOrderId).map((row) =>
      Journal.getIntent(row.intentId),
    );
    const candidates = lineage.filter(
      (body) => body?.action === 'PLACE' && body.clientOrderId === fill.localExecutionRequestId,
    );
    if (candidates.length === 0 && lineage.some((body) => body?.sessionId === sessionId))
      throw new Error('SESSION_FILL_IDENTITY_CONFLICT');
    if (candidates.length > 1) throw new Error('SESSION_FILL_ATTRIBUTION_AMBIGUOUS');
    const intent = candidates.find((body) => body?.sessionId === sessionId);
    if (intent === undefined || intent === null || intent.action !== 'PLACE') continue;
    if (intent.side !== fill.side || intent.clientOrderId !== fill.localExecutionRequestId)
      throw new Error('SESSION_FILL_IDENTITY_CONFLICT');
    const orderQuantity = ledger.fills
      .filter((candidate) => candidate.venueOrderId === fill.venueOrderId)
      .reduce((sum, candidate) => sum + candidate.executedBaseQuantity, 0);
    if (orderQuantity > intent.quantity + 1e-12) throw new Error('SESSION_FILL_QUANTITY_CONFLICT');
    const fragments =
      fill.executionFragments !== undefined
        ? fill.executionFragments
        : [
            {
              fragmentId: undefined,
              quantity: fill.executedBaseQuantity,
              price: fill.executedPrice,
              feeUsd:
                fill.fee.availability === 'AVAILABLE' && fill.fee.currency === 'USD'
                  ? fill.fee.amount
                  : null,
            },
          ];
    const keys = new Set(
      fragments.map((fragment) =>
        getDecibelExecutionFillKeyV1(fill.venueOrderId, fill.venueFillId, fragment.fragmentId),
      ),
    );
    {
      const eventPrefix = JSON.stringify([fill.venueOrderId, fill.venueFillId]).slice(0, -1) + ',';
      const prior = Journal.getSessionFills(sessionId).filter((stored) =>
        stored.fillId.startsWith(eventPrefix),
      );
      if (prior.some((stored) => !keys.has(stored.fillId))) {
        const priorQuantity = prior.reduce((sum, stored) => sum + stored.quantity, 0);
        if (priorQuantity > fill.executedBaseQuantity + 1e-12) continue; // Lagging fragment subset.
        throw new Error('SESSION_EXECUTION_FRAGMENT_CONFLICT');
      }
    }
    for (const fragment of fragments) {
      batch.push({
        fillId: getDecibelExecutionFillKeyV1(
          fill.venueOrderId,
          fill.venueFillId,
          fragment.fragmentId,
        ),
        intentId: intent.intentId,
        side: fill.side,
        quantity: fragment.quantity,
        price: fragment.price,
        strategyLineage: true,
        makerProven:
          intent.postOnly && intent.timeInForce === 'PostOnly' && fill.makerOrTaker === 'MAKER',
        externalCounterparty: true,
        observedAt: (fill.venueTimestamp ?? fill.receivedAt).getTime(),
      });
    }
  }
  Journal.applyAuthenticatedFillBatch(batch);
  const fees = new Map<string, number | null>();
  for (const fill of ledger.fills) {
    if (fill.executionFragments !== undefined)
      for (const fragment of fill.executionFragments)
        fees.set(
          getDecibelExecutionFillKeyV1(fill.venueOrderId, fill.venueFillId, fragment.fragmentId),
          fragment.feeUsd,
        );
    else
      fees.set(
        getDecibelExecutionFillKeyV1(fill.venueOrderId, fill.venueFillId),
        fill.fee.availability === 'AVAILABLE' && fill.fee.currency === 'USD'
          ? fill.fee.amount
          : null,
      );
  }
  const fills = Journal.getSessionFills(sessionId);
  const metrics = calculateDecibelSessionExecutionMetricsV1(
    fills.map((fill) => ({
      ...fill,
      maker: Boolean(fill.maker),
      feeUsd: fees.get(fill.fillId) ?? null,
    })),
    0,
    markPrice,
  );
  return Object.freeze({ ...metrics, fillCount: fills.length });
}

/** Only the venue notional floor proves impossibility independently of future quote prices.
 * Pending reservations, margin shortages and inventory constraints are not terminal evidence.
 */
export function getDecibelSessionTargetTerminalReasonV1(
  targetUsd: number,
  executedUsd: number,
): 'TARGET_VOLUME_REACHED' | null {
  if (!Number.isFinite(executedUsd) || executedUsd < 0)
    throw new Error('SESSION_EXECUTED_VOLUME_INVALID');
  if (!Number.isFinite(targetUsd) || targetUsd <= 0) return null;
  // A small remainder is finished by one more full-size entry (see dynamic quote size),
  // so a remainder below the venue minimum is no longer a terminal reason.
  return executedUsd >= targetUsd ? 'TARGET_VOLUME_REACHED' : null;
}

/** Target reasons end the session by draining through resting TP, never by taker IOC. */
export function isDecibelTargetUnwindReasonV1(reason: string | null | undefined): boolean {
  return reason === 'TARGET_VOLUME_REACHED' || reason === 'TARGET_UNREACHABLE_MINIMUM_ORDER';
}

export function requestDecibelSessionTargetUnwindV1(
  Controller: decibel_production_session_controller_v1,
  sessionId: string,
  volume: Readonly<{ makerVolumeUsd: number; totalExecutedVolumeUsd: number }>,
): boolean {
  const active = Controller.getState().activeSession;
  const targetVolumeUsd = volume.totalExecutedVolumeUsd;
  const reason = getDecibelSessionTargetTerminalReasonV1(
    active?.configSnapshot.targetMakerVolumeUsd ?? 0,
    targetVolumeUsd,
  );
  if (active?.sessionId !== sessionId || !Controller.ownsActiveRuntime() || reason === null)
    return false;
  if (!active.unwindRequested) Controller.requestUnwind(sessionId, reason);
  return true;
}
