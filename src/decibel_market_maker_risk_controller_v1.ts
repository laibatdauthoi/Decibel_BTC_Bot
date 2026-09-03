import { createHash } from 'node:crypto';

import type { decibel_fair_price_assessment_v1 } from './decibel_fair_price_engine_v1.js';
import type { decibel_inventory_assessment_v1 } from './decibel_inventory_controller_v1.js';
import {
  DECIBEL_MARKET_MAKER_V1,
  type decibel_market_state_v1,
} from './decibel_market_state_v1.js';
import type { decibel_quote_intent_v1, decibel_quote_set_v1 } from './decibel_quote_engine_v1.js';

export const DECIBEL_MARKET_MAKER_RISK_CONTROLLER_VERSION_V1 =
  'DECIBEL_MARKET_MAKER_RISK_CONTROLLER_V1' as const;

export type decibel_market_maker_risk_mode_v1 = 'ALLOW' | 'RISK_REDUCING_ONLY' | 'DISABLE';
export type decibel_market_maker_risk_evaluation_status_v1 =
  'RISK_EVALUATED' | 'NO_QUOTES' | 'INPUT_UNUSABLE';
export type decibel_market_maker_risk_reason_v1 =
  | 'MARKET_STATE_UNUSABLE'
  | 'FAIR_PRICE_UNUSABLE'
  | 'UPSTREAM_IDENTITY_MISMATCH'
  | 'RISK_STATE_INVALID'
  | 'RISK_STATE_FUTURE'
  | 'RISK_STATE_STALE'
  | 'RUNTIME_UNHEALTHY'
  | 'PORTFOLIO_STATE_UNHEALTHY'
  | 'ACCOUNT_RECONCILIATION_UNHEALTHY'
  | 'KILL_SWITCH_ACTIVE'
  | 'SESSION_LOSS_LIMIT_REACHED'
  | 'SESSION_DRAWDOWN_LIMIT_REACHED'
  | 'EMERGENCY_INVENTORY_LIMIT_REACHED'
  | 'INVENTORY_STATE_INCONSISTENT'
  | 'QUOTE_ENGINE_INPUT_UNUSABLE'
  | 'BUY_NOT_RISK_REDUCING'
  | 'SELL_NOT_RISK_REDUCING';

const ReasonOrder: readonly decibel_market_maker_risk_reason_v1[] = [
  'MARKET_STATE_UNUSABLE',
  'FAIR_PRICE_UNUSABLE',
  'UPSTREAM_IDENTITY_MISMATCH',
  'RISK_STATE_INVALID',
  'RISK_STATE_FUTURE',
  'RISK_STATE_STALE',
  'RUNTIME_UNHEALTHY',
  'PORTFOLIO_STATE_UNHEALTHY',
  'ACCOUNT_RECONCILIATION_UNHEALTHY',
  'KILL_SWITCH_ACTIVE',
  'SESSION_LOSS_LIMIT_REACHED',
  'SESSION_DRAWDOWN_LIMIT_REACHED',
  'EMERGENCY_INVENTORY_LIMIT_REACHED',
  'INVENTORY_STATE_INCONSISTENT',
  'QUOTE_ENGINE_INPUT_UNUSABLE',
  'BUY_NOT_RISK_REDUCING',
  'SELL_NOT_RISK_REDUCING',
] as const;

export type decibel_market_maker_risk_state_v1 = Readonly<{
  riskStateId: string;
  observedAt: Date;
  runtimeHealthy: boolean;
  portfolioStateHealthy: boolean;
  accountReconciliationHealthy: boolean;
  killSwitchActive: boolean;
  sessionNetEconomicPnlUsd: number;
  sessionDrawdownUsd: number;
  portfolioStateId?: string;
  accountingStateId?: string;
  reconciliationStateId?: string;
}>;

export type decibel_market_maker_risk_configuration_v1 = Readonly<{
  maximumSessionLossUsd: number;
  maximumSessionDrawdownUsd: number;
  emergencyInventoryLimitBase: number;
  maximumRiskStateAgeMs: number;
}>;

export type decibel_market_maker_suppressed_intent_v1 = Readonly<{
  intent: decibel_quote_intent_v1;
  reasons: readonly ('BUY_NOT_RISK_REDUCING' | 'SELL_NOT_RISK_REDUCING' | 'QUOTING_DISABLED')[];
}>;

export type decibel_market_maker_risk_evaluation_v1 = Readonly<{
  strategyId: typeof DECIBEL_MARKET_MAKER_V1;
  riskControllerVersion: typeof DECIBEL_MARKET_MAKER_RISK_CONTROLLER_VERSION_V1;
  configurationId: string;
  riskEvaluationId: string;
  sourceMarketStateId: string;
  sourceFairPriceAssessmentId: string;
  sourceInventoryAssessmentId: string;
  sourceQuoteSetId: string;
  sourceRiskStateId: string;
  evaluatedAt: Date;
  riskStateAgeMs: number;
  mode: decibel_market_maker_risk_mode_v1;
  evaluationStatus: decibel_market_maker_risk_evaluation_status_v1;
  approvedIntents: readonly decibel_quote_intent_v1[];
  suppressedIntents: readonly decibel_market_maker_suppressed_intent_v1[];
  riskReasons: readonly decibel_market_maker_risk_reason_v1[];
  sessionNetEconomicPnlUsd: number;
  sessionDrawdownUsd: number;
  inventoryDeviation: number;
  emergencyInventoryLimitBase: number;
}>;

function hashIdentity(prefix: string, values: readonly unknown[]): string {
  return `${prefix}_${createHash('sha256').update(JSON.stringify(values)).digest('hex')}`;
}

function fairAssessmentId(value: decibel_fair_price_assessment_v1): string {
  return hashIdentity('decibel_fair_price_assessment', [
    value.marketStateId,
    value.configurationId,
    value.fairPrice,
    value.usable,
    value.failureCodes,
  ]);
}

function inventoryAssessmentId(value: decibel_inventory_assessment_v1): string {
  return hashIdentity('decibel_inventory_assessment', [
    value.configurationId,
    value.accountStateId,
    value.observedAt?.getTime() ?? null,
    value.signedBaseInventory,
    value.neutralTargetBase,
    value.inventoryDeviation,
    value.reservationPriceAdjustmentBps,
    value.bidSizeMultiplier,
    value.askSizeMultiplier,
    value.allowBidInventoryIncrease,
    value.allowAskInventoryIncrease,
  ]);
}

function validateConfiguration(
  configuration: decibel_market_maker_risk_configuration_v1,
  inventory: decibel_inventory_assessment_v1,
): void {
  const values = [
    configuration.maximumSessionLossUsd,
    configuration.maximumSessionDrawdownUsd,
    configuration.emergencyInventoryLimitBase,
    configuration.maximumRiskStateAgeMs,
  ];
  if (
    values.some((value) => !Number.isFinite(value)) ||
    configuration.maximumSessionLossUsd <= 0 ||
    configuration.maximumSessionDrawdownUsd <= 0 ||
    configuration.emergencyInventoryLimitBase <= inventory.hardInventoryLimitBase ||
    configuration.maximumRiskStateAgeMs < 0
  )
    throw new Error('DECIBEL_MARKET_MAKER_RISK_INVALID_CONFIGURATION');
}

function hasValidRiskState(value: decibel_market_maker_risk_state_v1): boolean {
  return (
    value.riskStateId.length > 0 &&
    Number.isSafeInteger(value.observedAt.getTime()) &&
    Number.isFinite(value.sessionNetEconomicPnlUsd) &&
    Number.isFinite(value.sessionDrawdownUsd) &&
    value.sessionDrawdownUsd >= 0
  );
}

function hasConsistentLineage(
  marketState: decibel_market_state_v1,
  fairPrice: decibel_fair_price_assessment_v1,
  inventory: decibel_inventory_assessment_v1,
  quoteSet: decibel_quote_set_v1,
): boolean {
  const metadata = marketState.metadata;
  return (
    fairPrice.marketStateId === marketState.stateId &&
    quoteSet.sourceMarketStateId === marketState.stateId &&
    quoteSet.sourceFairPriceAssessmentId === fairAssessmentId(fairPrice) &&
    quoteSet.sourceInventoryAssessmentId === inventoryAssessmentId(inventory) &&
    marketState.strategyId === DECIBEL_MARKET_MAKER_V1 &&
    fairPrice.strategyId === DECIBEL_MARKET_MAKER_V1 &&
    inventory.strategyId === DECIBEL_MARKET_MAKER_V1 &&
    quoteSet.strategyId === DECIBEL_MARKET_MAKER_V1 &&
    quoteSet.intents.every(
      (intent) =>
        intent.strategyId === DECIBEL_MARKET_MAKER_V1 &&
        intent.quoteSetId === quoteSet.quoteSetId &&
        intent.sourceMarketStateId === marketState.stateId &&
        intent.sourceFairPriceAssessmentId === quoteSet.sourceFairPriceAssessmentId &&
        intent.sourceInventoryAssessmentId === quoteSet.sourceInventoryAssessmentId &&
        intent.marketAddress === metadata?.marketAddress,
    )
  );
}

function freezeEvaluation(
  value: decibel_market_maker_risk_evaluation_v1,
): decibel_market_maker_risk_evaluation_v1 {
  for (const suppressed of value.suppressedIntents) {
    Object.freeze(suppressed.reasons);
    Object.freeze(suppressed);
  }
  Object.freeze(value.approvedIntents);
  Object.freeze(value.suppressedIntents);
  Object.freeze(value.riskReasons);
  return Object.freeze(value);
}

export function evaluateDecibelMarketMakerRiskV1(
  marketState: decibel_market_state_v1,
  fairPrice: decibel_fair_price_assessment_v1,
  inventory: decibel_inventory_assessment_v1,
  quoteSet: decibel_quote_set_v1,
  riskState: decibel_market_maker_risk_state_v1,
  configuration: decibel_market_maker_risk_configuration_v1,
): decibel_market_maker_risk_evaluation_v1 {
  validateConfiguration(configuration, inventory);
  const configurationId = hashIdentity('decibel_market_maker_risk_configuration', [
    configuration.maximumSessionLossUsd,
    configuration.maximumSessionDrawdownUsd,
    configuration.emergencyInventoryLimitBase,
    configuration.maximumRiskStateAgeMs,
  ]);
  const reasons = new Set<decibel_market_maker_risk_reason_v1>();
  const evaluatedAtMs = marketState.constructedAt.getTime();
  const riskObservedAtMs = riskState.observedAt.getTime();
  const riskStateAgeMs = evaluatedAtMs - riskObservedAtMs;
  if (!marketState.usable) reasons.add('MARKET_STATE_UNUSABLE');
  if (!fairPrice.usable) reasons.add('FAIR_PRICE_UNUSABLE');
  if (!hasConsistentLineage(marketState, fairPrice, inventory, quoteSet))
    reasons.add('UPSTREAM_IDENTITY_MISMATCH');
  if (!hasValidRiskState(riskState)) reasons.add('RISK_STATE_INVALID');
  if (Number.isFinite(riskObservedAtMs) && riskObservedAtMs > evaluatedAtMs)
    reasons.add('RISK_STATE_FUTURE');
  if (Number.isFinite(riskStateAgeMs) && riskStateAgeMs > configuration.maximumRiskStateAgeMs)
    reasons.add('RISK_STATE_STALE');
  if (!riskState.runtimeHealthy) reasons.add('RUNTIME_UNHEALTHY');
  if (!riskState.portfolioStateHealthy) reasons.add('PORTFOLIO_STATE_UNHEALTHY');
  if (!riskState.accountReconciliationHealthy) reasons.add('ACCOUNT_RECONCILIATION_UNHEALTHY');
  if (riskState.killSwitchActive) reasons.add('KILL_SWITCH_ACTIVE');
  if (riskState.sessionNetEconomicPnlUsd <= -configuration.maximumSessionLossUsd)
    reasons.add('SESSION_LOSS_LIMIT_REACHED');
  if (riskState.sessionDrawdownUsd >= configuration.maximumSessionDrawdownUsd)
    reasons.add('SESSION_DRAWDOWN_LIMIT_REACHED');
  if (Math.abs(inventory.inventoryDeviation) >= configuration.emergencyInventoryLimitBase)
    reasons.add('EMERGENCY_INVENTORY_LIMIT_REACHED');
  if (
    !Number.isFinite(inventory.inventoryDeviation) ||
    (inventory.inventoryZone === 'HARD_LIMIT' && inventory.inventoryDeviation === 0)
  )
    reasons.add('INVENTORY_STATE_INCONSISTENT');
  if (quoteSet.status === 'INPUT_UNUSABLE') reasons.add('QUOTE_ENGINE_INPUT_UNUSABLE');

  const disablingReasons = [...reasons];
  let mode: decibel_market_maker_risk_mode_v1 =
    disablingReasons.length > 0
      ? 'DISABLE'
      : inventory.inventoryZone === 'HARD_LIMIT'
        ? 'RISK_REDUCING_ONLY'
        : 'ALLOW';
  const approvedIntents: decibel_quote_intent_v1[] = [];
  const suppressedIntents: decibel_market_maker_suppressed_intent_v1[] = [];
  if (mode === 'DISABLE') {
    for (const intent of quoteSet.intents)
      suppressedIntents.push({ intent, reasons: ['QUOTING_DISABLED'] });
  } else if (mode === 'RISK_REDUCING_ONLY') {
    const reducingSide = inventory.inventoryDeviation > 0 ? 'SELL' : 'BUY';
    for (const intent of quoteSet.intents) {
      if (intent.side === reducingSide) approvedIntents.push(intent);
      else {
        const reason = intent.side === 'BUY' ? 'BUY_NOT_RISK_REDUCING' : 'SELL_NOT_RISK_REDUCING';
        reasons.add(reason);
        suppressedIntents.push({ intent, reasons: [reason] });
      }
    }
  } else approvedIntents.push(...quoteSet.intents);

  const orderedReasons = ReasonOrder.filter((reason) => reasons.has(reason));
  if (
    mode !== 'DISABLE' &&
    orderedReasons.some(
      (reason) => !['BUY_NOT_RISK_REDUCING', 'SELL_NOT_RISK_REDUCING'].includes(reason),
    )
  )
    mode = 'DISABLE';
  const inputUnusableReasons: readonly decibel_market_maker_risk_reason_v1[] = [
    'MARKET_STATE_UNUSABLE',
    'FAIR_PRICE_UNUSABLE',
    'UPSTREAM_IDENTITY_MISMATCH',
    'RISK_STATE_INVALID',
    'RISK_STATE_FUTURE',
    'INVENTORY_STATE_INCONSISTENT',
    'QUOTE_ENGINE_INPUT_UNUSABLE',
  ];
  const inputUnusable = orderedReasons.some((reason) => inputUnusableReasons.includes(reason));
  const evaluationStatus: decibel_market_maker_risk_evaluation_status_v1 = inputUnusable
    ? 'INPUT_UNUSABLE'
    : quoteSet.status === 'NO_QUOTES' && mode !== 'DISABLE'
      ? 'NO_QUOTES'
      : 'RISK_EVALUATED';
  const riskEvaluationId = hashIdentity('decibel_market_maker_risk_evaluation', [
    marketState.stateId,
    fairAssessmentId(fairPrice),
    inventoryAssessmentId(inventory),
    quoteSet.quoteSetId,
    riskState.riskStateId,
    riskObservedAtMs,
    riskState.runtimeHealthy,
    riskState.portfolioStateHealthy,
    riskState.accountReconciliationHealthy,
    riskState.killSwitchActive,
    riskState.sessionNetEconomicPnlUsd,
    riskState.sessionDrawdownUsd,
    configurationId,
    mode,
    orderedReasons,
  ]);
  return freezeEvaluation({
    strategyId: DECIBEL_MARKET_MAKER_V1,
    riskControllerVersion: DECIBEL_MARKET_MAKER_RISK_CONTROLLER_VERSION_V1,
    configurationId,
    riskEvaluationId,
    sourceMarketStateId: marketState.stateId,
    sourceFairPriceAssessmentId: fairAssessmentId(fairPrice),
    sourceInventoryAssessmentId: inventoryAssessmentId(inventory),
    sourceQuoteSetId: quoteSet.quoteSetId,
    sourceRiskStateId: riskState.riskStateId,
    evaluatedAt: new Date(evaluatedAtMs),
    riskStateAgeMs,
    mode,
    evaluationStatus,
    approvedIntents,
    suppressedIntents,
    riskReasons: orderedReasons,
    sessionNetEconomicPnlUsd: riskState.sessionNetEconomicPnlUsd,
    sessionDrawdownUsd: riskState.sessionDrawdownUsd,
    inventoryDeviation: inventory.inventoryDeviation,
    emergencyInventoryLimitBase: configuration.emergencyInventoryLimitBase,
  });
}
