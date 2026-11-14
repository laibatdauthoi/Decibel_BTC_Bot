import {
  assessDecibelTPActionV1,
  getDecibelReductionOrderLimitV1,
  isDecibelPositionReductionV1,
} from './decibel_order_action_v1.js';
import { calculateDecibelExitCoverageV1 } from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import { assessDecibelSnapshotDCAV1, isDecibelDCAPriceAdmittedV1 } from './decibel_dca_v1.js';
import { getDecibelEntryVolatilityPauseReasonV1 } from './decibel_volatility_targets_v1.js';
import { calculateDecibelSidePositionBudgetBtcV1 } from './decibel_dynamic_quote_size_v1.js';
import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_orchestrator_v1.js';
import type { DecibelAuthenticatedPassiveRecyclingEvaluationV1 } from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import {
  evaluateDecibelLifecycleCostAdmissionV1,
  assessDecibelEntryPhaseEconomicsV1,
  DECIBEL_PRODUCTION_LIFECYCLE_COST_ENTRY_BPS_V1,
} from './decibel_smart_ladder_v1.js';

// Operational escalation only. Missing evidence never grants trading permission.
export const DECIBEL_EVIDENCE_FAILURE_STOP_AFTER_MS_V1 = 60000;
export type trading_decision_v1 = Readonly<{
  riskDiagnostics?: readonly Readonly<Record<string, unknown>>[];
  state: 'TRADE' | 'WAIT' | 'STOP';
  primaryReason: string;
  capacityState:
    | 'UNVERIFIED'
    | 'CANCEL_FINALITY_PENDING'
    | 'RESERVED_BY_RESTING_ORDERS'
    | 'NO_AVAILABLE_CAPITAL'
    | 'BELOW_VENUE_MINIMUM'
    | 'EXECUTABLE';
  detailedReasons: readonly string[];
  bidEligible: boolean;
  askEligible: boolean;
  executablePositionLimitUsd: number | null;
  perOrder: Readonly<{ BUY: number | null; SELL: number | null }>;
  newExposurePermitted: boolean;
  evidenceComplete: boolean;
  evidence: Readonly<{
    snapshotObservedAt: number | null;
    accountObservedAt: number | null;
    marketObservedAt: number | null;
    marginRulesObservedAt: number | null;
    ledgerVersion: string | null;
    sourceStateHash: string | null;
    sessionId: string | null;
    failureSince: number | null;
  }>;
  nextRetryCondition: string;
  recoveryStatus: 'NOT_REQUIRED' | 'REFRESHING' | 'RECONCILIATION_REQUIRED' | 'TERMINAL';
  capital: Readonly<{
    authenticatedAvailableMarginUsd: number | null;
    strategyAllocationRemainingUsd: number | null;
    maximumTotalExposureUsd: number | null;
    incrementalExposureHeadroomUsd: number | null;
    existingReductionQuantityBtc: number | null;
    pendingExposureUsd: number | null;
    minimumExecutableQuantityBtc: number | null;
  }>;
  actionPlan: Readonly<{
    BUY: Readonly<{ kind: 'REDUCE' | 'OPEN'; eligible: boolean; reason: string; resting: boolean }>;
    SELL: Readonly<{
      kind: 'REDUCE' | 'OPEN';
      eligible: boolean;
      reason: string;
      resting: boolean;
    }>;
  }>;
  sideDiagnostics: Readonly<{
    BID_SIZE: number | null;
    ASK_SIZE: number | null;
    BID_BLOCKER: string | null;
    ASK_BLOCKER: string | null;
    BID_REDUCE_ONLY: boolean;
    ASK_REDUCE_ONLY: boolean;
    REMAINING_ENTRY_HEADROOM: number | null;
    COMBINED_PENDING_RISK: number | null;
  }>;
  exitCoverage: ReturnType<typeof calculateDecibelExitCoverageV1> | null;
  management: Readonly<{
    keepOrderIds: readonly string[];
    cancelOrderIds: readonly string[];
    reconciliationRequired: boolean;
    canonicalUnwindRequired: boolean;
  }>;
  costs: Readonly<{
    bidBps: number | null;
    askBps: number | null;
    entryBudgetBps: number;
    entryAdverseSelectionApplied: false;
    remainingSessionLossUsd: number | null;
  }>;
}>;
export type trading_session_context_v1 = Readonly<{
  now: number;
  sessionId: string | null;
  state?: string;
  evaluation?: DecibelAuthenticatedPassiveRecyclingEvaluationV1 | null;
  blocker?: string | null;
  unresolvedIntentCount?: number;
  identityConflict?: string | null;
  mandatoryEvidenceFailureSince?: number | null;
  terminalReason?: string | null;
  settingsRevision?: number;
  candidate?: Readonly<{
    postOnly?: boolean;
    timeInForce?: 'PostOnly' | 'ImmediateOrCancel';
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    reduceOnly?: boolean;
  }>;
  coveragePriceAuthorization?:
    import('./decibel_order_action_v1.js').decibel_coverage_price_authorization_v1 | null;
}>;

export function evaluateTradingDecision(
  snapshot: decibel_production_live_snapshot_v1 | null,
  session: trading_session_context_v1,
): trading_decision_v1 {
  const reasons: string[] = [];
  const riskDiagnostics: Readonly<Record<string, unknown>>[] = [];
  const missing: string[] = [];
  const add = (value: string | null | undefined) => {
    if (value && !reasons.includes(value)) reasons.push(value);
  };
  const absent = (value: string) => {
    missing.push(value);
    add(value);
  };
  const e = session.evaluation;
  const candidate = session.candidate;
  let candidateCostBps: number | null = null;
  const reductionOrder =
    candidate ??
    (snapshot && snapshot.input.actualInventoryBase > 0 ? e?.desiredAsk : e?.desiredBid);
  const provenReduction =
    snapshot !== null &&
    reductionOrder !== null &&
    reductionOrder !== undefined &&
    (!candidate || candidate.reduceOnly === true) &&
    ((snapshot.input.actualInventoryBase > 0 && reductionOrder.side === 'SELL') ||
      (snapshot.input.actualInventoryBase < 0 && reductionOrder.side === 'BUY')) &&
    reductionOrder.quantity > 0 &&
    reductionOrder.quantity <= Math.abs(snapshot.input.actualInventoryBase) + 1e-12;
  const canonicalReduction = provenReduction && e?.operatingState === 'RISK_REDUCTION';
  const tpReduction =
    provenReduction && !canonicalReduction && snapshot?.reductionCapacity !== undefined;
  const positionReduction = canonicalReduction || tpReduction;
  const tpReasons: Record<'BUY' | 'SELL', string | null> = { BUY: null, SELL: null };
  if (!candidate && snapshot && snapshot.input.actualInventoryBase !== 0) {
    const side = snapshot.input.actualInventoryBase > 0 ? 'SELL' : 'BUY';
    const reason = side === 'SELL' ? e?.askEligibilityReason : e?.bidEligibilityReason;
    if (reason?.startsWith('TP_') && !reason.endsWith('_ELIGIBLE')) tpReasons[side] = reason;
  }
  const addActionReason = (reason: string | null | undefined) => {
    if (reason && /^TP_/.test(reason) && (!candidate || !tpReduction) && snapshot) {
      tpReasons[snapshot.input.actualInventoryBase > 0 ? 'SELL' : 'BUY'] = reason;
    } else add(reason);
  };
  if (tpReduction && snapshot && reductionOrder)
    addActionReason(
      assessDecibelTPActionV1(
        snapshot,
        reductionOrder.side,
        reductionOrder.quantity,
        reductionOrder.price,
        session.coveragePriceAuthorization,
      ),
    );
  const entryCapacityOnly = (reason: string | null | undefined) =>
    reason != null &&
    /^(RISK_BLOCKED|ENTRY_CYCLE_[A-Z_]+|DCA_[A-Z_]+|ENTRY_EXCEEDS_REMAINING_TARGET|ENTRY_VOLATILITY_PAUSE|ENTRY_GAS_BALANCE_LOW|ENTRY_REQUIRES_NEW_LOW|ENTRY_REQUIRES_NEW_HIGH|ENTRY_CANDLE_EVIDENCE_REQUIRED|NO_NEW_QUOTE_HEADROOM|QUOTE_CAPACITY_BELOW_MINIMUM_ORDER|INSUFFICIENT_LEVERAGED_BUYING_POWER|MINIMUM_NOTIONAL_EXCEEDS_MAXIMUM_NOTIONAL|CAPACITY_ACCOUNT_EVIDENCE_STALE|CAPACITY_MARKET_EVIDENCE_STALE|CAPACITY_VENUE_MARGIN_RULES_STALE|CAPACITY_POST_ORDER_MARGIN_TIER_UNVERIFIED|CAPACITY_POST_FILL_MARGIN_UNSAFE)$/.test(
      reason,
    );
  if (candidate && snapshot && !positionReduction) {
    const economics = snapshot.economicInputs;
    const notional = candidate.quantity * candidate.price;
    if (
      !economics ||
      economics.makerFeeBps === null ||
      economics.estimatedGasCostUsd === null ||
      !(notional > 0)
    )
      add('ECONOMIC_INPUT_UNKNOWN');
    else {
      const midpoint = (snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2;
      const expectedEdge =
        ((candidate.side === 'BUY' ? midpoint - candidate.price : candidate.price - midpoint) /
          midpoint) *
        10000;
      const phase = assessDecibelEntryPhaseEconomicsV1({
        phase: 'PLACE',
        side: candidate.side,
        price: candidate.price,
        quantity: candidate.quantity,
        midpoint,
        makerFeeBps: economics.makerFeeBps,
        gasCostUsd: economics.estimatedGasCostUsd,
        safetyMarginBps: economics.safetyMarginBps,
      });
      candidateCostBps = phase.costBps;
      const requiredEdge = phase.requiredEdgeBps ?? Number.POSITIVE_INFINITY;
      if (expectedEdge < requiredEdge) add('SPREAD_EDGE_INSUFFICIENT');
      const resting = snapshot.input.openOrders.some((order) => order.side === candidate.side);
      const costAdmission = evaluateDecibelLifecycleCostAdmissionV1(candidateCostBps, resting);
      if (costAdmission === 'ECONOMIC_INPUT_UNKNOWN') add('ECONOMIC_INPUT_UNKNOWN');
      else if (costAdmission !== 'VOLUME_COST_BUDGET_ELIGIBLE')
        add('LIFECYCLE_COST_BUDGET_EXCEEDED');
    }
  }
  const fresh = (timestamp: number | undefined, ttl: number) =>
    timestamp !== undefined &&
    Number.isFinite(timestamp) &&
    timestamp <= session.now &&
    session.now - timestamp <= ttl;
  const source = snapshot?.input;
  const capacity = snapshot?.sessionConfiguration?.exposureLimits;
  const practical = snapshot?.practicalCapacityInputs;
  const reductionAccountAt =
    snapshot?.venueReadWindow?.account.startedAt ??
    practical?.accountObservedAt ??
    (snapshot?.capacityModelRequired ? undefined : source?.now);
  const accountFresh =
    source !== undefined &&
    fresh(source.now, source.maxBboAgeMs) &&
    (positionReduction
      ? fresh(reductionAccountAt, source.maxBboAgeMs)
      : !snapshot?.capacityModelRequired ||
        (practical !== undefined && fresh(practical.accountObservedAt, practical.maximumAgeMs)));

  if (session.sessionId === null) add('SESSION_NOT_RUNNING');
  if (session.state === 'IDLE') add('EXECUTION_INACTIVE');
  if (session.terminalReason) add(session.terminalReason);
  if (session.state === 'ENDED') add('SESSION_ENDED');
  if (session.state === 'STOPPING') add('SESSION_STOPPING');
  if (!snapshot || !source) absent('AUTHENTICATED_SNAPSHOT_REQUIRED');
  else {
    if (
      source.configuredSubaccount !== source.authenticatedSubaccount ||
      source.configuredNetwork !== source.observedNetwork
    )
      add('AUTHENTICATED_ACCOUNT_IDENTITY_MISMATCH');
    if (source.metadata.marketAddress !== source.market) add('MARKET_IDENTITY_MISMATCH');
    if (
      session.settingsRevision !== undefined &&
      snapshot.sessionConfiguration?.revision !== session.settingsRevision
    )
      add('SESSION_SETTINGS_MISMATCH');
    if (session.sessionId !== null && source.sessionId !== session.sessionId)
      add('ACTIVE_SESSION_IDENTITY_MISMATCH');
    if (!fresh(source.now, source.maxBboAgeMs)) absent('AUTHENTICATED_SNAPSHOT_STALE');
    if (positionReduction && !fresh(reductionAccountAt, source.maxBboAgeMs))
      absent('AUTHENTICATED_ACCOUNT_EVIDENCE_STALE');
    if (!fresh(source.book.observedAt, source.maxBboAgeMs)) absent('MARKET_DATA_STALE');
    if (!Number.isFinite(source.actualInventoryBase)) add('POSITION_MISMATCH');
    if (
      source.actualInventoryBase !== 0 &&
      Math.abs(source.actualInventoryBase) < source.metadata.minimumSize
    )
      add('UNRESOLVED_INVENTORY_BELOW_VENUE_MINIMUM');
    if (!source.persistenceAvailable) add('PERSISTENCE_UNAVAILABLE');
    if (
      source.openOrders.some(
        (order) =>
          !Number.isFinite(order.price) ||
          !Number.isFinite(order.quantity) ||
          order.strategyConfigId !== source.strategyConfigId,
      )
    )
      add('UNRESOLVED_EXTERNAL_ORDER_ACTIVITY');
    if (source.actualInventoryBase !== 0 && !source.inventoryDirectionProven)
      add('INVENTORY_DIRECTION_UNPROVEN');
    if (!Number.isFinite(snapshot.availableMarginUsd) || snapshot.availableMarginUsd < 0)
      absent('AUTHENTICATED_MARGIN_REQUIRED');
    if (
      !Number.isFinite(snapshot.maximumEffectiveLeverage) ||
      snapshot.maximumEffectiveLeverage < 1
    )
      absent('AUTHENTICATED_LEVERAGE_REQUIRED');
    if (snapshot.capacityModelRequired && !positionReduction) {
      if (!snapshot.sessionConfiguration || !capacity || !practical)
        absent('SESSION_CAPACITY_EVIDENCE_REQUIRED');
      if (practical) {
        if (!fresh(practical.accountObservedAt, practical.maximumAgeMs))
          absent('CAPACITY_ACCOUNT_EVIDENCE_STALE');
        if (!fresh(practical.marketObservedAt, practical.maximumAgeMs))
          absent('CAPACITY_MARKET_EVIDENCE_STALE');
        if (!practical.venueMarginRules) absent('CAPACITY_POST_ORDER_MARGIN_TIER_UNVERIFIED');
        else if (
          !fresh(practical.venueMarginRules.observedAt, practical.maximumAgeMs) ||
          !fresh(practical.venueMarginRules.markObservedAt, practical.maximumAgeMs)
        )
          absent('CAPACITY_VENUE_MARGIN_RULES_STALE');
      }
    }
    if (!positionReduction) add(capacity?.capacityBlocker);
    if (
      !positionReduction ||
      (snapshot.sessionConfiguration?.riskBlocker !== capacity?.capacityBlocker &&
        !entryCapacityOnly(snapshot.sessionConfiguration?.riskBlocker))
    )
      add(snapshot.sessionConfiguration?.riskBlocker);
    const config = snapshot.sessionConfiguration;
    if (snapshot.capacityModelRequired && config) {
      if (config.pnlUsd === null || !Number.isFinite(config.pnlUsd))
        absent('SESSION_PNL_EVIDENCE_REQUIRED');
      const executed =
        config.targetSemanticsVersion === 2 ? config.totalExecutedVolumeUsd : config.makerVolumeUsd;
      if (
        config.targetMakerVolumeUsd > 0 &&
        (executed === undefined || !Number.isFinite(executed) || executed < 0)
      )
        absent('SESSION_EXECUTED_VOLUME_EVIDENCE_REQUIRED');
    }
    if (
      config &&
      typeof config.pnlUsd === 'number' &&
      Number.isFinite(config.pnlUsd) &&
      config.pnlUsd <= -config.maxLossUsd
    )
      add('SESSION_MAX_LOSS_REACHED');
  }
  add(session.identityConflict);
  if ((session.unresolvedIntentCount ?? 0) > 0) add('EXECUTION_RECONCILIATION_REQUIRED');
  addActionReason(session.blocker);
  for (const reason of e?.blockers ?? [])
    if (!positionReduction || !entryCapacityOnly(reason)) addActionReason(reason);
  const hard = (reason: string) =>
    /MAX_LOSS_REACHED|DAILY_LOSS|SESSION_ENDED|SESSION_STOPPING|IDENTITY|MISMATCH|UNRESOLVABLE|INVARIANT|PERSISTENCE_UNAVAILABLE|EXCLUSIVITY|UNRESOLVED_EXTERNAL|DIRECTION_UNPROVEN|LIMITS_INVALID|INPUT_INVALID|INTEGRITY|AUTHENTICATION_FAILED|EXECUTION_.*UNSUPPORTED/.test(
      reason,
    );
  const hardReason = reasons.find(hard);
  const evidenceFailure =
    missing.length > 0 ||
    reasons.some((r) =>
      /EVIDENCE_REQUIRED|RULES_STALE|EVIDENCE_STALE|AUTHENTICATED_READ|SNAPSHOT_REQUIRED|RATE_LIMITED|INPUT_UNKNOWN|EVIDENCE_MISSING/.test(
        r,
      ),
    );
  const persistent =
    evidenceFailure &&
    session.mandatoryEvidenceFailureSince != null &&
    session.now - session.mandatoryEvidenceFailureSince >=
      DECIBEL_EVIDENCE_FAILURE_STOP_AFTER_MS_V1;
  if (persistent) add('MANDATORY_EVIDENCE_FAILURE_PERSISTENT');
  const entryDecisions: Partial<Record<'BUY' | 'SELL', trading_decision_v1>> = {};
  const validOrder = (side: 'BUY' | 'SELL') => {
    if (
      !candidate &&
      e?.actions.some((action) => action.side === side && action.action === 'BLOCKED')
    )
      return null;
    const planned = candidate
      ? candidate.side === side
        ? candidate
        : null
      : side === 'BUY'
        ? e?.desiredBid
        : e?.desiredAsk;
    const sizing = snapshot?.quoteSizing?.[side];
    const order =
      !candidate && planned && sizing
        ? { ...planned, quantity: Math.min(planned.quantity, sizing.finalSizeBtc) }
        : planned;
    if (
      !order ||
      !snapshot ||
      !Number.isFinite(order.quantity) ||
      order.quantity <= 0 ||
      !Number.isFinite(order.price)
    )
      return null;
    const notional = order.price * order.quantity;
    if (
      source &&
      capacity &&
      calculateDecibelExitCoverageV1(source).entryPaused &&
      ((source.actualInventoryBase > 0 && side === 'BUY') ||
        (source.actualInventoryBase < 0 && side === 'SELL'))
    )
      return null;
    if (source && capacity) {
      const reducing =
        (source.actualInventoryBase > 0 &&
          side === 'SELL' &&
          order.quantity <= source.actualInventoryBase) ||
        (source.actualInventoryBase < 0 &&
          side === 'BUY' &&
          order.quantity <= -source.actualInventoryBase);
      if (
        !reducing &&
        order.quantity >
          calculateDecibelSidePositionBudgetBtcV1({
            side,
            inventoryBase: source.actualInventoryBase,
            maximumAbsPositionBase:
              capacity.effectivePositionLimitUsd /
              ((source.book.bestBid + source.book.bestAsk) / 2),
            openOrders: source.openOrders,
            replacingVenueOrderId: candidate
              ? undefined
              : source.openOrders.find((o) => o.side === side)?.venueOrderId,
          }) +
            1e-12
      )
        return null;
    }
    const reducing =
      source !== undefined &&
      ((source.actualInventoryBase < 0 && side === 'BUY') ||
        (source.actualInventoryBase > 0 && side === 'SELL')) &&
      order.quantity <= Math.abs(source.actualInventoryBase) + 1e-12 &&
      (!candidate || candidate.reduceOnly);
    // Extreme volatility pauses every opening order (entry or DCA addition).
    const volatilityPause = getDecibelEntryVolatilityPauseReasonV1(snapshot.priceRangeBps);
    if (!reducing && volatilityPause !== null) {
      tpReasons[side] = volatilityPause;
      return null;
    }
    // Entry candle filter (from flat only; additions have their own DCA rule).
    const candleBlocker =
      source && source.actualInventoryBase === 0 ? snapshot.entryCandleBlockers?.[side] : null;
    if (!reducing && candleBlocker) {
      tpReasons[side] = candleBlocker;
      return null;
    }
    // A low gas wallet keeps its reserve for protecting the open position.
    if (!reducing && snapshot.executionGasBlocker) {
      tpReasons[side] = snapshot.executionGasBlocker;
      return null;
    }
    // An open position grows only through an admitted maker DCA addition.
    if (!reducing && source && source.actualInventoryBase !== 0) {
      const dca = assessDecibelSnapshotDCAV1(snapshot);
      const blocker =
        candidate && (candidate.postOnly !== true || candidate.timeInForce !== 'PostOnly')
          ? 'DCA_MAKER_POST_ONLY_REQUIRED'
          : !dca.allowed
            ? dca.reason
            : !isDecibelDCAPriceAdmittedV1(dca, side, order.price)
              ? 'DCA_ADVERSE_DISTANCE_REQUIRED'
              : order.quantity * order.price > dca.maximumNotionalUsd + 1e-9
                ? 'DCA_RISK_CAPACITY_EXHAUSTED'
                : null;
      if (blocker) {
        tpReasons[side] = blocker;
        return null;
      }
    }
    if (!reducing && snapshot.sessionConfiguration?.sizingPolicyVersion === 1) {
      const config = snapshot.sessionConfiguration;
      const riskCapacity = config.exposureLimits?.riskCapacityUsd;
      const pending =
        source?.openOrders
          .filter(
            (o) =>
              o.side === side &&
              (candidate !== undefined ||
                o.venueOrderId !== source.openOrders.find((x) => x.side === side)?.venueOrderId),
          )
          .reduce((sum, o) => sum + o.quantity, 0) ?? 0;
      const projected =
        Math.abs(
          (source?.actualInventoryBase ?? 0) +
            (side === 'BUY' ? 1 : -1) * (pending + order.quantity),
        ) * order.price;
      const existing = !candidate
        ? source?.openOrders.find(
            (o) => o.side === side && o.reduceOnly !== true && order.quantity <= o.quantity + 1e-12,
          )
        : undefined;
      const reason =
        (existing ? null : config.entryCycleBlocker) ??
        (riskCapacity === undefined ||
        !Number.isFinite(riskCapacity) ||
        riskCapacity < 0 ||
        !Number.isFinite(projected) ||
        projected > riskCapacity + 1e-9
          ? 'RISK_BLOCKED'
          : null);
      if (reason) {
        const riskRuleId =
          reason !== 'RISK_BLOCKED'
            ? reason
            : riskCapacity === undefined
              ? 'SESSION_RISK_CAPACITY_MISSING'
              : !Number.isFinite(riskCapacity) || riskCapacity < 0 || !Number.isFinite(projected)
                ? 'SESSION_RISK_OPERAND_INVALID'
                : 'SESSION_PROJECTED_STRESS_LOSS';
        const realized = config.exitAccounting?.realizedPnlAfterFeesUsd ?? null;
        const diagnostics = config.exposureLimits?.capacityDiagnostics;
        const lossModel =
          diagnostics && typeof diagnostics === 'object' && 'lossModel' in diagnostics
            ? (diagnostics.lossModel as import('./decibel_risk_capacity_v1.js').decibel_capacity_result_v1['lossModel'])
            : undefined;
        riskDiagnostics.push(
          Object.freeze({
            riskRuleId,
            blockerCode: reason === 'RISK_BLOCKED' ? `RISK_BLOCKED:${riskRuleId}` : reason,
            riskRuleOutcome: 'BLOCKED',
            candidateSide: side,
            candidateQuantity: order.quantity,
            candidateNotionalUsd: order.quantity * order.price,
            availableMarginUsd:
              snapshot.authenticatedAvailableMarginUsd ?? snapshot.availableMarginUsd,
            strategyAllocationRemainingUsd: snapshot.strategyAllocationRemainingUsd ?? null,
            exposureHeadroomUsd: config.exposureLimits?.availableHeadroomUsd ?? null,
            sessionRealizedPnlUsd: realized,
            sessionUnrealizedPnlUsd:
              realized !== null && config.pnlUsd !== null ? config.pnlUsd - realized : null,
            maxLossUsd: config.maxLossUsd,
            projectedExposureUsd: projected,
            riskCapacityUsd: riskCapacity ?? null,
            missingEvidence: [
              ...(riskCapacity === undefined ? ['RISK_CAPACITY'] : []),
              ...(lossModel === undefined ? ['EXIT_STRESS_AND_COSTS'] : []),
            ],
            stressEvidenceFresh:
              lossModel === undefined
                ? null
                : lossModel.observedAt <= session.now && lossModel.validUntil >= session.now,
            ...(lossModel
              ? {
                  ...lossModel,
                  remainingLossBudgetUsd: lossModel.lossRemainingUsd,
                  projectedLossUsd: (projected * lossModel.lossBps) / 10000,
                  projectedStressLossUsd:
                    (projected * lossModel.lossBps) / 10000 + lossModel.fixedExitCostUsd,
                  estimatedTradingFeesUsd:
                    (projected * (lossModel.entryFeeBps + lossModel.exitFeeBps)) / 10000,
                }
              : {}),
            requiredEvidence: [
              'AUTHENTICATED_ACCOUNT',
              'MARKET_BOOK',
              'SESSION_PNL',
              'EXIT_STRESS_AND_COSTS',
            ],
            evidenceAgeMs: {
              account:
                session.now -
                (snapshot.practicalCapacityInputs?.accountObservedAt ?? source?.now ?? session.now),
              market: session.now - (source?.book.observedAt ?? session.now),
              stress: snapshot.capacityEvidence
                ? session.now - snapshot.capacityEvidence.observedAt
                : lossModel
                  ? session.now - lossModel.observedAt
                  : null,
            },
            blockingPredicate:
              reason !== 'RISK_BLOCKED'
                ? reason
                : riskCapacity === undefined
                  ? 'riskCapacityUsd === undefined'
                  : !Number.isFinite(riskCapacity)
                    ? '!Number.isFinite(riskCapacityUsd)'
                    : riskCapacity < 0 || !Number.isFinite(projected)
                      ? 'riskCapacityUsd < 0 || !Number.isFinite(projectedExposureUsd)'
                      : 'projectedExposureUsd > riskCapacityUsd + 1e-9',
          }),
        );
        tpReasons[side] = reason;
        addActionReason(reason);
        return null;
      }
    }
    // A reduction's evidence exemptions cannot grant permission to the opening
    // side. Re-evaluate that exact action with all original ENTRY gates.
    if (!reducing && !candidate && positionReduction) {
      const independent = evaluateTradingDecision(snapshot, {
        ...session,
        candidate: {
          side,
          price: order.price,
          quantity: order.quantity,
          reduceOnly: false,
          postOnly: true,
          timeInForce: 'PostOnly',
        },
      });
      entryDecisions[side] = independent;
      if (!(side === 'BUY' ? independent.bidEligible : independent.askEligible)) return null;
    }
    const config = snapshot.sessionConfiguration;
    if (reducing && !canonicalReduction && snapshot.reductionCapacity && !candidate) {
      const reason =
        tpReasons[side] ??
        assessDecibelTPActionV1(
          snapshot,
          side,
          order.quantity,
          order.price,
          session.coveragePriceAuthorization,
        );
      if (reason) {
        tpReasons[side] = reason;
        return null;
      }
    }
    // The target still triggers canonical session unwind when reached. Its
    // remaining entry budget cannot truncate a protective inventory reduction.
    // Each side is checked on its own: near the end both entries rest so whichever fills
    // first finishes the target (live 2026-11-13 21:40: summing the resting BUY into the
    // SELL check left only one side quoted). Resting reductions never count.
    if (!reducing && config && config.targetMakerVolumeUsd > 0) {
      const executed =
        config.targetSemanticsVersion === 2 ? config.totalExecutedVolumeUsd : config.makerVolumeUsd;
      if (executed === undefined || executed === null) return null;
      // While any volume is missing, one normal entry (the preferred size, at least a
      // venue-minimum order) stays allowed even if it is larger than the remainder: live
      // 2026-11-14 a $1.37 remainder was below the $1.38 venue minimum and the session sat
      // idle for hours. Once the target is reached no entry is allowed.
      const remaining = config.targetMakerVolumeUsd - executed;
      const minimumOrderUsd = Math.max(
        snapshot.input.metadata.minimumSize * order.price,
        snapshot.minimumNotionalUsd,
      );
      const allowance = Math.max(remaining, config.preferredEntrySizeUsd ?? 0, minimumOrderUsd);
      if (!(remaining > 1e-9) || notional > allowance + 1e-9) {
        tpReasons[side] = 'ENTRY_EXCEEDS_REMAINING_TARGET';
        return null;
      }
    }

    if (
      reducing &&
      candidate &&
      source.openOrders
        .filter((o) => o.side === side)
        .reduce((sum, o) => sum + o.quantity, order.quantity) >
        Math.abs(source.actualInventoryBase) + 1e-12
    )
      return null;
    return Number.isFinite(notional) &&
      (reducing && (candidate?.reduceOnly || positionReduction)
        ? order.quantity >= source.metadata.minimumSize
        : notional >= snapshot.minimumNotionalUsd) &&
      notional <=
        (reducing
          ? getDecibelReductionOrderLimitV1(snapshot, order.price)
          : snapshot.maximumNotionalUsd) +
          1e-9
      ? order.quantity
      : null;
  };
  const buy = validOrder('BUY'),
    sell = validOrder('SELL');
  const capacityState: trading_decision_v1['capacityState'] =
    (source?.pendingCancelOrderIds?.length ?? 0) > 0
      ? 'CANCEL_FINALITY_PENDING'
      : !snapshot ||
          missing.length > 0 ||
          capacity?.capacityBlocker ||
          reasons.some((reason) =>
            /CAPACITY_.*(STALE|REQUIRED|UNVERIFIED)|SESSION_CAPACITY_EVIDENCE_REQUIRED|AUTHENTICATED.*STALE/.test(
              reason,
            ),
          ) ||
          snapshot.sessionConfiguration?.riskBlocker
        ? 'UNVERIFIED'
        : snapshot.maximumNotionalUsd === 0 || capacity?.availableHeadroomUsd === 0
          ? source?.openOrders.some((order) => order.reduceOnly !== true)
            ? 'RESERVED_BY_RESTING_ORDERS'
            : 'NO_AVAILABLE_CAPITAL'
          : snapshot.maximumNotionalUsd < snapshot.minimumNotionalUsd
            ? 'BELOW_VENUE_MINIMUM'
            : 'EXECUTABLE';
  if (buy === null && sell === null && snapshot) {
    if (capacityState === 'CANCEL_FINALITY_PENDING') add('ENTRY_CANCEL_FINALITY_PENDING');
    else if (capacityState === 'RESERVED_BY_RESTING_ORDERS')
      add('CAPITAL_RESERVED_BY_RESTING_ORDERS');
    else if (capacityState === 'NO_AVAILABLE_CAPITAL') add('NO_NEW_QUOTE_HEADROOM');
    else if (snapshot.maximumNotionalUsd < snapshot.minimumNotionalUsd)
      add('QUOTE_CAPACITY_BELOW_MINIMUM_ORDER');
  }
  const reductionSide = (side: 'BUY' | 'SELL') =>
    source !== undefined &&
    ((source.actualInventoryBase < 0 && side === 'BUY') ||
      (source.actualInventoryBase > 0 && side === 'SELL'));
  const entryOnly = (reason: string) =>
    /^(RISK_BLOCKED|ENTRY_CYCLE_[A-Z_]+|DCA_[A-Z_]+|ENTRY_EXCEEDS_REMAINING_TARGET|ENTRY_VOLATILITY_PAUSE|ENTRY_GAS_BALANCE_LOW|ENTRY_REQUIRES_NEW_LOW|ENTRY_REQUIRES_NEW_HIGH|ENTRY_CANDLE_EVIDENCE_REQUIRED|NO_NEW_QUOTE_HEADROOM|QUOTE_CAPACITY_BELOW_MINIMUM_ORDER|INSUFFICIENT_LEVERAGED_BUYING_POWER|MINIMUM_NOTIONAL_EXCEEDS_MAXIMUM_NOTIONAL)$/.test(
      reason,
    );
  const executableReduction =
    (buy !== null && reductionSide('BUY')) || (sell !== null && reductionSide('SELL'));
  const applicableReasons = executableReduction ? reasons.filter((r) => !entryOnly(r)) : reasons;
  const state =
    hardReason || persistent
      ? 'STOP'
      : applicableReasons.length || (!buy && !sell)
        ? 'WAIT'
        : 'TRADE';
  const primaryReason =
    hardReason ??
    (persistent
      ? 'MANDATORY_EVIDENCE_FAILURE_PERSISTENT'
      : (applicableReasons[0] ??
        (state === 'TRADE'
          ? 'EXECUTABLE_QUOTE_AVAILABLE'
          : e?.bidEligibilityReason === 'LIFECYCLE_COST_BUDGET_EXCEEDED' ||
              e?.askEligibilityReason === 'LIFECYCLE_COST_BUDGET_EXCEEDED'
            ? 'LIFECYCLE_COST_BUDGET_EXCEEDED'
            : source && calculateDecibelExitCoverageV1(source).metadataUnknown
              ? 'EXIT_REDUCE_ONLY_METADATA_UNVERIFIED'
              : source && calculateDecibelExitCoverageV1(source).entryPaused
                ? (tpReasons[source.actualInventoryBase > 0 ? 'SELL' : 'BUY'] ??
                  'INVENTORY_EXIT_COVERAGE_REQUIRED')
                : (tpReasons.BUY ??
                  tpReasons.SELL ??
                  e?.bidEligibilityReason ??
                  e?.askEligibilityReason ??
                  'NO_EXECUTABLE_QUOTE'))));
  if (state !== 'TRADE') add(primaryReason);
  const config = snapshot?.sessionConfiguration;
  const terminal = /MAX_LOSS_REACHED|SESSION_ENDED|SESSION_STOPPING/.test(primaryReason);
  const getSideBlocker = (side: 'BUY' | 'SELL'): string => {
    if (state === 'STOP') return primaryReason;
    if (tpReasons[side]) return tpReasons[side];
    if (!reductionSide(side) && primaryReason.startsWith('TP_')) {
      if (source && source.actualInventoryBase !== 0) return 'POSITION_GROWTH_DISABLED';
      return entryDecisions[side]?.primaryReason ?? 'ENTRY_ADMISSION_NOT_PROVEN';
    }
    return primaryReason;
  };
  return Object.freeze({
    state,
    primaryReason,
    capacityState,
    detailedReasons: Object.freeze(reasons),
    riskDiagnostics: Object.freeze(riskDiagnostics),
    bidEligible:
      state === 'TRADE' && buy !== null && (reductionSide('BUY') || !reasons.some(entryOnly)),
    askEligible:
      state === 'TRADE' && sell !== null && (reductionSide('SELL') || !reasons.some(entryOnly)),
    executablePositionLimitUsd:
      state === 'STOP' || missing.length || capacity?.capacityBlocker
        ? null
        : (capacity?.effectivePositionLimitUsd ??
          (snapshot?.maximumAbsPositionBase === undefined || !source
            ? null
            : (snapshot.maximumAbsPositionBase * (source.book.bestBid + source.book.bestAsk)) / 2)),
    perOrder: Object.freeze({
      BUY: state === 'TRADE' ? buy : null,
      SELL: state === 'TRADE' ? sell : null,
    }),
    newExposurePermitted:
      state === 'TRADE' &&
      ((buy !== null && (source?.actualInventoryBase ?? 0) >= 0) ||
        (sell !== null && (source?.actualInventoryBase ?? 0) <= 0) ||
        (buy !== null && buy > Math.abs(source?.actualInventoryBase ?? 0)) ||
        (sell !== null && sell > Math.abs(source?.actualInventoryBase ?? 0))),
    evidenceComplete: !evidenceFailure,
    evidence: Object.freeze({
      snapshotObservedAt: source?.now ?? null,
      accountObservedAt: practical?.accountObservedAt ?? source?.now ?? null,
      marketObservedAt: practical?.marketObservedAt ?? source?.book.observedAt ?? null,
      marginRulesObservedAt: practical?.venueMarginRules?.observedAt ?? null,
      ledgerVersion: practical?.venueMarginRules?.ledgerVersion ?? null,
      sourceStateHash: snapshot?.sourceStateHash ?? null,
      sessionId: source?.sessionId ?? null,
      failureSince: session.mandatoryEvidenceFailureSince ?? null,
    }),
    nextRetryCondition:
      state === 'TRADE'
        ? 'NEXT_AUTHENTICATED_CYCLE'
        : terminal
          ? 'CANONICAL_UNWIND_ONLY'
          : reasons.includes('UNRESOLVED_INVENTORY_BELOW_VENUE_MINIMUM')
            ? 'VERIFIED_VENUE_CLOSE_RULE_OR_AUTHENTICATED_POSITION_UPDATE'
            : session.identityConflict
              ? 'EXACT_AUTHENTICATED_RECONCILIATION'
              : evidenceFailure
                ? 'FRESH_MANDATORY_EVIDENCE'
                : 'MARKET_OR_ACCOUNT_UPDATE',
    recoveryStatus: terminal
      ? 'TERMINAL'
      : session.identityConflict
        ? 'RECONCILIATION_REQUIRED'
        : state === 'TRADE'
          ? 'NOT_REQUIRED'
          : 'REFRESHING',
    capital: Object.freeze(
      accountFresh
        ? {
            authenticatedAvailableMarginUsd:
              snapshot?.authenticatedAvailableMarginUsd ?? snapshot?.availableMarginUsd ?? null,
            strategyAllocationRemainingUsd:
              snapshot?.strategyAllocationRemainingUsd ?? snapshot?.availableMarginUsd ?? null,
            maximumTotalExposureUsd: capacity?.effectivePositionLimitUsd ?? null,
            incrementalExposureHeadroomUsd: capacity?.availableHeadroomUsd ?? null,
            existingReductionQuantityBtc: source ? Math.abs(source.actualInventoryBase) : null,
            pendingExposureUsd:
              capacity?.pendingExposureUsd ??
              (source
                ? source.openOrders
                    .filter(
                      (order) => !isDecibelPositionReductionV1(source.actualInventoryBase, order),
                    )
                    .reduce((sum, order) => sum + order.price * order.quantity, 0)
                : null),
            minimumExecutableQuantityBtc:
              source && snapshot
                ? Math.ceil(
                    Math.max(
                      source.metadata.minimumSize,
                      snapshot.minimumNotionalUsd / source.book.bestBid,
                    ) /
                      source.metadata.lotSize -
                      1e-10,
                  ) * source.metadata.lotSize
                : null,
          }
        : {
            authenticatedAvailableMarginUsd: null,
            strategyAllocationRemainingUsd: null,
            maximumTotalExposureUsd: null,
            incrementalExposureHeadroomUsd: null,
            existingReductionQuantityBtc: null,
            pendingExposureUsd: null,
            minimumExecutableQuantityBtc: null,
          },
    ),
    actionPlan: Object.freeze(
      Object.fromEntries(
        (['BUY', 'SELL'] as const).map((side) => {
          const reducing = reductionSide(side);
          const eligible =
            state === 'TRADE' &&
            (side === 'BUY' ? buy : sell) !== null &&
            (reducing || !reasons.some(entryOnly));
          return [
            side,
            Object.freeze({
              kind: reducing ? 'REDUCE' : 'OPEN',
              eligible,
              reason: eligible
                ? reducing
                  ? 'INVENTORY_REDUCTION_ELIGIBLE'
                  : 'NEW_EXPOSURE_ELIGIBLE'
                : state === 'STOP'
                  ? primaryReason
                  : !reducing && source && calculateDecibelExitCoverageV1(source).entryPaused
                    ? 'INVENTORY_EXIT_COVERAGE_REQUIRED'
                    : (entryDecisions[side]?.primaryReason ??
                      tpReasons[side] ??
                      (state !== 'TRADE'
                        ? getSideBlocker(side)
                        : !reducing && snapshot?.quoteSizing?.[side]?.positionBudgetBtc === 0
                          ? 'NO_NEW_QUOTE_HEADROOM'
                          : ((side === 'BUY' ? e?.bidEligibilityReason : e?.askEligibilityReason) ??
                            primaryReason))),
              resting: source?.openOrders.some((o) => o.side === side) ?? false,
            }),
          ];
        }),
      ) as Record<
        'BUY' | 'SELL',
        { kind: 'REDUCE' | 'OPEN'; eligible: boolean; reason: string; resting: boolean }
      >,
    ),
    sideDiagnostics: Object.freeze({
      BID_SIZE: state === 'TRADE' ? buy : null,
      ASK_SIZE: state === 'TRADE' ? sell : null,
      BID_BLOCKER:
        state !== 'TRADE'
          ? getSideBlocker('BUY')
          : buy !== null
            ? null
            : snapshot?.quoteSizing?.BUY?.finalSizeBtc === 0
              ? snapshot.quoteSizing.BUY.roundingReason
              : (e?.bidEligibilityReason ?? 'NO_EXECUTABLE_BID'),
      ASK_BLOCKER:
        state !== 'TRADE'
          ? getSideBlocker('SELL')
          : sell !== null
            ? null
            : snapshot?.quoteSizing?.SELL?.finalSizeBtc === 0
              ? snapshot.quoteSizing.SELL.roundingReason
              : (e?.askEligibilityReason ?? 'NO_EXECUTABLE_ASK'),
      BID_REDUCE_ONLY: reductionSide('BUY') && buy !== null,
      ASK_REDUCE_ONLY: reductionSide('SELL') && sell !== null,
      REMAINING_ENTRY_HEADROOM: accountFresh ? (capacity?.availableHeadroomUsd ?? null) : null,
      COMBINED_PENDING_RISK:
        source && accountFresh
          ? (Math.max(
              Math.abs(
                source.actualInventoryBase +
                  Math.max(
                    buy ?? 0,
                    source.openOrders
                      .filter((o) => o.side === 'BUY')
                      .reduce((sum, o) => sum + o.quantity, 0),
                  ),
              ),
              Math.abs(
                source.actualInventoryBase -
                  Math.max(
                    sell ?? 0,
                    source.openOrders
                      .filter((o) => o.side === 'SELL')
                      .reduce((sum, o) => sum + o.quantity, 0),
                  ),
              ),
            ) *
              (source.book.bestBid + source.book.bestAsk)) /
            2
          : null,
    }),
    exitCoverage:
      source &&
      fresh(source.now, source.maxBboAgeMs) &&
      source.inventoryDirectionProven &&
      source.configuredSubaccount === source.authenticatedSubaccount
        ? calculateDecibelExitCoverageV1(source)
        : null,
    management: Object.freeze({
      keepOrderIds: Object.freeze(
        e?.actions
          .filter((action) => action.action === 'NO_OP' && action.current !== null)
          .map((action) => action.current!.venueOrderId) ?? [],
      ),
      cancelOrderIds: Object.freeze(
        e?.actions
          .filter(
            (action) =>
              (action.action === 'WOULD_CANCEL' || action.action === 'WOULD_REPLACE') &&
              action.current !== null,
          )
          .map((action) => action.current!.venueOrderId) ?? [],
      ),
      reconciliationRequired: Boolean(
        session.identityConflict ||
        (session.unresolvedIntentCount ?? 0) > 0 ||
        (source &&
          (calculateDecibelExitCoverageV1(source).metadataUnknown ||
            (source.pendingCancelOrderIds?.length ?? 0) > 0 ||
            (source.pendingExitQuantityBase ?? 0) > 0)),
      ),
      canonicalUnwindRequired: terminal,
    }),
    costs: Object.freeze({
      bidBps: candidate?.side === 'BUY' ? candidateCostBps : (e?.bidLifecycleCostBps ?? null),
      askBps: candidate?.side === 'SELL' ? candidateCostBps : (e?.askLifecycleCostBps ?? null),
      entryBudgetBps: DECIBEL_PRODUCTION_LIFECYCLE_COST_ENTRY_BPS_V1,
      entryAdverseSelectionApplied: false,
      remainingSessionLossUsd:
        config && typeof config.pnlUsd === 'number' && Number.isFinite(config.pnlUsd)
          ? Math.max(0, config.maxLossUsd + Math.min(0, config.pnlUsd))
          : null,
    }),
  });
}
