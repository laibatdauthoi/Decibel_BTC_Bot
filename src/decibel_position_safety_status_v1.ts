import { calculateDecibelExitCoverageV1 } from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_types_v1.js';

/** Evidence and availability only; this projection never authorizes execution. */
export function deriveDecibelPositionSafetyStatusV1(
  input: Readonly<{
    snapshot: decibel_production_live_snapshot_v1 | null;
    now: number;
    executionOperational: boolean;
    entryReady: boolean;
    recoveryBlocker: string | null;
    executionBlocker: string | null;
    independentRecoveryVerified?: boolean;
    independentRecoveryBlocker?: string | null;
  }>,
) {
  const snapshot = input.snapshot;
  const source = snapshot?.input;
  const accountAt =
    snapshot?.venueReadWindow?.account.startedAt ??
    snapshot?.practicalCapacityInputs?.accountObservedAt ??
    source?.now;
  const fresh =
    source !== undefined &&
    accountAt !== undefined &&
    Number.isFinite(accountAt) &&
    accountAt <= input.now &&
    input.now - accountAt <= source.maxBboAgeMs &&
    Number.isFinite(source.actualInventoryBase) &&
    source.inventoryDirectionProven === true &&
    source.configuredSubaccount === source.authenticatedSubaccount &&
    source.configuredNetwork === source.observedNetwork;
  const coverage = fresh && source ? calculateDecibelExitCoverageV1(source) : null;
  const coverageKnown = coverage !== null && !coverage.metadataUnknown && !coverage.overCovered;
  const position = fresh && source ? source.actualInventoryBase : null;
  const uncovered = coverageKnown ? coverage.UNCOVERED_INVENTORY_QTY : null;
  const protection = !coverageKnown
    ? 'UNKNOWN'
    : position === 0
      ? 'FLAT'
      : uncovered === 0
        ? 'CONFIRMED_COVERED'
        : 'UNPROTECTED';
  const protectiveAction =
    !fresh || !coverageKnown
      ? 'BLOCKED_EVIDENCE'
      : position === 0
        ? 'NOT_REQUIRED'
        : input.recoveryBlocker && !input.independentRecoveryVerified
          ? input.independentRecoveryBlocker
            ? 'BLOCKED_CURRENT_PROTECTIVE_EVIDENCE'
            : 'BLOCKED_RECOVERY'
          : !input.executionOperational
            ? 'BLOCKED_EXECUTION'
            : uncovered === 0
              ? 'MONITOR_CONFIRMED_TP'
              : coverage.CONFIRMED_EXIT_COVERAGE_QTY > 0
                ? 'REPAIR_CAPABILITY_UNVERIFIED_EXISTING_TP_PRESERVED'
                : input.executionBlocker
                  ? 'BLOCKED_EXECUTION'
                  : 'REQUIRES_INDEPENDENT_ACTION_VALIDATION';
  return Object.freeze({
    executionOperational: input.executionOperational,
    newEntryReady:
      input.entryReady &&
      input.executionOperational &&
      input.executionBlocker === null &&
      fresh &&
      coverageKnown &&
      !coverage.entryPaused &&
      input.recoveryBlocker === null,
    positionStatus:
      position === null ? 'UNKNOWN' : position === 0 ? 'FLAT' : position > 0 ? 'LONG' : 'SHORT',
    positionQuantity: position,
    positionObservedAt: fresh ? accountAt : null,
    confirmedExitQuantity: coverageKnown ? coverage.CONFIRMED_EXIT_COVERAGE_QTY : null,
    uncoveredQuantity: uncovered,
    protection,
    protectiveAction,
    recoveryBlocker: input.recoveryBlocker,
    actionBlocker: input.independentRecoveryVerified
      ? input.executionBlocker
      : (input.independentRecoveryBlocker ?? input.executionBlocker ?? input.recoveryBlocker),
  });
}
