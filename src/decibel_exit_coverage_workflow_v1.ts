import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_types_v1.js';
import { calculateDecibelExitCoverageV1 } from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import type { decibel_order_action_class_v1 } from './decibel_order_action_v1.js';
export function deriveDecibelExitCoverageWorkflowV1(
  input: Readonly<{
    snapshot: decibel_production_live_snapshot_v1;
    now: number;
    action: string;
    actionClass: decibel_order_action_class_v1;
    reason: string | null;
    pendingCount: number;
  }>,
) {
  const snapshot = input.snapshot,
    source = snapshot.input;
  const accountAt =
    snapshot.venueReadWindow?.account.startedAt ??
    snapshot.practicalCapacityInputs?.accountObservedAt ??
    source.now;
  const fresh = (at: number) => at <= input.now && input.now - at <= source.maxBboAgeMs;
  const evidenceFresh =
    fresh(accountAt) &&
    fresh(source.book.observedAt) &&
    Number.isFinite(source.actualInventoryBase) &&
    source.inventoryDirectionProven === true &&
    source.configuredSubaccount === source.authenticatedSubaccount &&
    source.configuredNetwork === source.observedNetwork;
  const coverage = evidenceFresh ? calculateDecibelExitCoverageV1(source) : null;
  let outcome:
    | 'VERIFIED_COVERED'
    | 'TP_REPAIR_SUBMITTED'
    | 'TP_REPAIR_ACKNOWLEDGED'
    | 'DEFENSIVE_EXIT_SUBMITTED'
    | 'RECONCILIATION_PENDING'
    | 'BLOCKED';
  let reason = input.reason;
  if (!coverage) {
    outcome = 'BLOCKED';
    reason = `AUTHENTICATED_EXIT_EVIDENCE_UNVERIFIED:ACCOUNT_AT=${accountAt}:BOOK_AT=${source.book.observedAt}`;
  } else if (coverage.metadataUnknown || coverage.overCovered) {
    outcome = 'BLOCKED';
    reason = coverage.metadataUnknown
      ? 'EXIT_REDUCE_ONLY_METADATA_UNVERIFIED'
      : 'AGGREGATE_EXIT_COVERAGE_CONFLICT';
  } else if (coverage.UNCOVERED_INVENTORY_QTY === 0) outcome = 'VERIFIED_COVERED';
  else if (
    input.action === 'ACKNOWLEDGED' &&
    ['TP_COVERAGE_REPAIR', 'TP_PRICE_REPRICE', 'DEFENSIVE_RISK_REDUCTION'].includes(
      input.actionClass,
    )
  )
    outcome =
      input.actionClass === 'DEFENSIVE_RISK_REDUCTION'
        ? 'DEFENSIVE_EXIT_SUBMITTED'
        : 'TP_REPAIR_ACKNOWLEDGED';
  else if (
    input.pendingCount > 0 ||
    coverage.PENDING_EXIT_QTY > 0 ||
    coverage.pendingCancelOrderIds.length > 0 ||
    (input.actionClass === 'CANCEL' && input.action === 'ACKNOWLEDGED')
  )
    outcome = 'RECONCILIATION_PENDING';
  else {
    outcome = 'BLOCKED';
    reason ??= coverage.uncoveredBelowMinimum
      ? 'UNCOVERED_INVENTORY_BELOW_VENUE_MINIMUM'
      : 'TP_CANDIDATE_UNAVAILABLE';
  }
  return Object.freeze({
    outcome,
    actionClass: input.actionClass,
    reason,
    evidenceFresh,
    positionObservedAt: accountAt,
    sourceStateHash: snapshot.sourceStateHash,
    positionQuantity: coverage?.POSITION_QTY ?? null,
    confirmedQuantity: coverage?.CONFIRMED_EXIT_COVERAGE_QTY ?? null,
    uncoveredQuantity: coverage?.UNCOVERED_INVENTORY_QTY ?? null,
    pendingQuantity: coverage?.PENDING_EXIT_QTY ?? null,
    nextCondition:
      outcome === 'VERIFIED_COVERED'
        ? 'CONTINUE_AUTHENTICATED_MONITORING'
        : outcome === 'RECONCILIATION_PENDING' ||
            outcome.endsWith('ACKNOWLEDGED') ||
            outcome.endsWith('SUBMITTED')
          ? 'AUTHORITATIVE_ORDER_IDENTITY_CONFIRMATION'
          : 'FRESH_EVIDENCE_AND_SAME_ACTION_AUTHORIZATION',
  });
}
