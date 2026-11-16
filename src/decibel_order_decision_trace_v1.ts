import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_types_v1.js';
import type { decibel_recycling_action_v1 } from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import type { trading_decision_v1 } from './decibel_trading_decision_v1.js';
import type { execution_submission_validation_v1 } from './decibel_execution_lifecycle_v1.js';

/** Observational projection only; no admission or retry decisions are made here. */
export function buildDecibelOrderDecisionTraceV1(
  input: Readonly<{
    action: string;
    intentId: string | null;
    intended: decibel_recycling_action_v1 | null;
    blocker: string | null;
    selectionReason: string | null;
    gate: string;
    snapshot: decibel_production_live_snapshot_v1 | null;
    decision: trading_decision_v1;
    finalPreflight: execution_submission_validation_v1['preflight'] | null;
    finalObservedAt: number | null;
  }>,
) {
  const intended = input.intended;
  const outcome =
    input.action === 'ACKNOWLEDGED'
      ? 'ACKNOWLEDGED'
      : ['RECONCILE_ONLY', 'RECONCILIATION_REQUIRED', 'DUPLICATE_SUPPRESSED'].includes(
            input.action,
          ) ||
          (input.action === 'HOLD' && input.intentId !== null)
        ? 'RECONCILING'
        : ['BLOCKED', 'REJECTED', 'DRY_RUN_PREPARED'].includes(input.action) ||
            (input.action === 'HOLD' && input.blocker !== null) ||
            (intended !== null && intended.action !== 'NO_OP')
          ? 'BLOCKED'
          : 'NO_OP';
  const reason =
    input.blocker ??
    (input.action === 'DRY_RUN_PREPARED'
      ? 'PRODUCTION_DRY_RUN_MUTATION_BLOCKED'
      : (input.selectionReason ?? input.decision.primaryReason));
  return Object.freeze({
    INTENDED_ACTION: intended ? `${intended.action}:${intended.side}:${intended.reason}` : 'NONE',
    FIRST_BLOCKING_GATE:
      outcome === 'BLOCKED' || (outcome === 'RECONCILING' && input.blocker !== null)
        ? Object.freeze({ function: input.gate, reason })
        : null,
    REQUIRED_EVIDENCE: Object.freeze([
      ...new Set(
        [reason, ...input.decision.detailedReasons].filter((value) =>
          /EVIDENCE|STALE|UNKNOWN|UNVERIFIED|UNPROVEN|RECONCILIATION|MISSING/u.test(value),
        ),
      ),
    ]),
    ACTUAL_CAPACITY_LIMIT: Object.freeze({
      ...input.decision.capital,
      inventoryBase: input.snapshot?.input.actualInventoryBase ?? null,
      accountObservedAt: input.decision.evidence.accountObservedAt,
      finalValidationObservedAt: input.finalObservedAt,
      maximumOrderNotionalUsd:
        input.finalPreflight?.maximumNotionalUsd ?? input.snapshot?.maximumNotionalUsd ?? null,
      maximumReductionNotionalUsd: input.snapshot?.maximumReductionNotionalUsd ?? null,
      maximumReductionQuantity: input.finalPreflight?.maximumReductionQuantity ?? null,
      maximumAbsPositionBase:
        input.finalPreflight?.maximumAbsPositionBase ??
        input.snapshot?.maximumAbsPositionBase ??
        null,
      lotSize: input.finalPreflight?.lotSize ?? input.snapshot?.input.metadata.lotSize ?? null,
    }),
    FINAL_EXECUTOR_OUTCOME: outcome,
  });
}
