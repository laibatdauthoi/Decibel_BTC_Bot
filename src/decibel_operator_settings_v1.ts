import {
  produceDecibelPostFillMarginV1,
  produceDecibelMarginTierV1,
} from './decibel_capacity_producers_v1.js';
import { isDecibelPositionReductionV1 } from './decibel_order_action_v1.js';
import {
  calculateDecibelRiskCapacityV1,
  type decibel_capacity_evidence_v1,
  type decibel_capacity_inputs_v1,
  DECIBEL_CAPACITY_POLICY_V1,
} from './decibel_risk_capacity_v1.js';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

export const DECIBEL_OPERATOR_SETTINGS_V1 = 'DECIBEL_OPERATOR_SETTINGS_V1' as const;

const ValuesSchema = z
  .object({
    capitalToUseUsd: z.number().finite().positive(),
    maxLossUsd: z.number().finite().positive(),
    targetMakerVolumeUsd: z
      .number()
      .finite()
      .refine((value) => value !== 0, 'TARGET_VOLUME_ZERO'),
    // Retired 2026-11-14 (never used for trading): still accepted from settings saved
    // earlier, dropped on read and never written again.
    orderNotionalUsd: z.number().finite().positive().optional(),
    maxPositionUsd: z.number().finite().positive().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.maxLossUsd > value.capitalToUseUsd)
      context.addIssue({
        code: 'custom',
        path: ['maxLossUsd'],
        message: 'MAX_LOSS_EXCEEDS_CAPITAL',
      });
  })
  .transform((value) => ({
    capitalToUseUsd: value.capitalToUseUsd,
    maxLossUsd: value.maxLossUsd,
    targetMakerVolumeUsd: value.targetMakerVolumeUsd,
  }));

const StoreSchema = z
  .object({
    schema: z.literal(DECIBEL_OPERATOR_SETTINGS_V1),
    revision: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    values: ValuesSchema,
  })
  .strict();

export type decibel_operator_settings_values_v1 = z.infer<typeof ValuesSchema>;
export type decibel_operator_settings_v1 = z.infer<typeof StoreSchema>;
export type decibel_operator_settings_risk_classification_v1 =
  'RISK_DECREASING' | 'RISK_NEUTRAL' | 'RISK_INCREASING';

export type decibel_operator_settings_diff_v1 = Readonly<{
  field: keyof decibel_operator_settings_values_v1;
  current: number;
  pending: number;
  classification: decibel_operator_settings_risk_classification_v1;
}>;

export type decibel_session_fill_v1 = Readonly<{
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  maker: boolean;
  timestamp: number;
  feeUsd: number | null;
}>;

export function calculateDecibelSessionExecutionMetricsV1(
  fills: readonly decibel_session_fill_v1[],
  sessionStartedAt: number,
  markPrice: number,
): Readonly<{
  makerVolumeUsd: number;
  takerVolumeUsd: number;
  totalExecutedVolumeUsd: number;
  pnlUsd: number | null;
  pnlBlocker: string | null;
  exitAccounting: Readonly<{
    inventoryBase: number;
    entryBasis: number;
    realizedPnlAfterFeesUsd: number;
  }> | null;
}> {
  if (!Number.isSafeInteger(sessionStartedAt) || sessionStartedAt < 0 || !(markPrice > 0))
    throw new Error('SESSION_EXECUTION_METRICS_INPUT_INVALID');
  const sessionFills = fills
    .filter((fill) => fill.timestamp >= sessionStartedAt)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (
    sessionFills.some(
      (fill) =>
        !(fill.quantity > 0) ||
        !(fill.price > 0) ||
        !Number.isFinite(fill.quantity) ||
        !Number.isFinite(fill.price),
    )
  )
    throw new Error('SESSION_EXECUTION_FILL_INVALID');
  const makerVolumeUsd = sessionFills
    .filter((fill) => fill.maker)
    .reduce((sum, fill) => sum + fill.quantity * fill.price, 0);
  const takerVolumeUsd = sessionFills
    .filter((fill) => !fill.maker)
    .reduce((sum, fill) => sum + fill.quantity * fill.price, 0);
  const totalExecutedVolumeUsd = makerVolumeUsd + takerVolumeUsd;
  if (sessionFills.some((fill) => fill.feeUsd === null || !Number.isFinite(fill.feeUsd)))
    return Object.freeze({
      makerVolumeUsd,
      takerVolumeUsd,
      totalExecutedVolumeUsd,
      pnlUsd: null,
      pnlBlocker: 'SESSION_PNL_FEE_EVIDENCE_REQUIRED',
      exitAccounting: null,
    });
  let signedQuantity = 0;
  let averageEntryPrice = 0;
  let realizedPnlUsd = 0;
  for (const fill of sessionFills) {
    const signedFill = fill.side === 'BUY' ? fill.quantity : -fill.quantity;
    if (signedQuantity === 0 || Math.sign(signedQuantity) === Math.sign(signedFill)) {
      const combined = Math.abs(signedQuantity) + fill.quantity;
      averageEntryPrice =
        combined === 0
          ? 0
          : (Math.abs(signedQuantity) * averageEntryPrice + fill.quantity * fill.price) / combined;
      signedQuantity += signedFill;
      continue;
    }
    const closingQuantity = Math.min(Math.abs(signedQuantity), fill.quantity);
    realizedPnlUsd +=
      signedQuantity > 0
        ? (fill.price - averageEntryPrice) * closingQuantity
        : (averageEntryPrice - fill.price) * closingQuantity;
    const priorDirection = Math.sign(signedQuantity);
    signedQuantity += signedFill;
    if (Math.abs(signedFill) > closingQuantity) averageEntryPrice = fill.price;
    else if (signedQuantity === 0 || Math.sign(signedQuantity) !== priorDirection)
      averageEntryPrice = signedQuantity === 0 ? 0 : fill.price;
  }
  const unrealizedPnlUsd =
    signedQuantity === 0
      ? 0
      : signedQuantity > 0
        ? (markPrice - averageEntryPrice) * signedQuantity
        : (averageEntryPrice - markPrice) * Math.abs(signedQuantity);
  const feesUsd = sessionFills.reduce((sum, fill) => sum + (fill.feeUsd ?? 0), 0);
  return Object.freeze({
    makerVolumeUsd,
    takerVolumeUsd,
    totalExecutedVolumeUsd,
    pnlUsd: realizedPnlUsd + unrealizedPnlUsd - feesUsd,
    pnlBlocker: null,
    exitAccounting: Object.freeze({
      inventoryBase: signedQuantity,
      entryBasis: averageEntryPrice,
      realizedPnlAfterFeesUsd: realizedPnlUsd - feesUsd,
    }),
  });
}

export function deriveDecibelSessionTradingLimitsV1(
  input: Readonly<{
    settings: decibel_operator_settings_values_v1;
    venueAvailableMarginUsd: number;
    positionBase: number;
    openOrders: readonly Readonly<{
      side?: 'BUY' | 'SELL';
      price: number;
      quantity: number;
      reduceOnly?: boolean;
    }>[];
    midpoint: number;
    maximumEffectiveLeverage: number;
    venueMaximumNotionalUsd: number;
    maximumAggregateCollateralFraction: number;
    capacityEvidence?: decibel_capacity_evidence_v1;
    capacityInputs?: decibel_capacity_inputs_v1;
    now?: number;
    inflightOrders?: readonly Readonly<{
      side?: 'BUY' | 'SELL';
      price: number;
      quantity: number;
      reduceOnly?: boolean;
    }>[];
    totalExecutedVolumeUsd?: number;
    pnlUsd?: number | null;
    lotSize?: number;
  }>,
): Readonly<{
  capacityBlocker: string | null;
  postFillDiagnostics: ReturnType<typeof produceDecibelPostFillMarginV1> | null;
  capacityDiagnostics: ReturnType<typeof calculateDecibelRiskCapacityV1>;
  configuredMaximumPositionUsd: number;
  effectivePositionLimitUsd: number;
  currentExposureUsd: number;
  pendingExposureUsd: number;
  availableHeadroomUsd: number;
  availableMarginUsd: number;
  marginUsedUsd: number;
  strategyAllocationRemainingUsd: number;
  maximumOrderNotionalUsd: number;
  maximumPositionUsd: number;
  maximumAbsPositionBase: number;
}> {
  // Position ceiling: capital x collateral fraction x leverage (2026-11-14: the session
  // policy versions were removed; every session uses the practical capacity policy).
  const aggregateCeilingUsd =
    input.settings.capitalToUseUsd *
    input.maximumAggregateCollateralFraction *
    input.maximumEffectiveLeverage;
  const maximumPositionUsd = aggregateCeilingUsd;
  if (
    !Number.isFinite(input.venueAvailableMarginUsd) ||
    input.venueAvailableMarginUsd < 0 ||
    !Number.isFinite(input.positionBase) ||
    [...input.openOrders, ...(input.inflightOrders ?? [])].some(
      (order) =>
        !Number.isFinite(order.price) ||
        order.price <= 0 ||
        !Number.isFinite(order.quantity) ||
        order.quantity < 0,
    ) ||
    !(input.midpoint > 0)
  )
    throw new Error('SESSION_MARGIN_EVIDENCE_INVALID');
  const effectiveLeverage = input.capacityInputs
    ? Math.min(input.maximumEffectiveLeverage, input.capacityInputs.actualLeverage ?? Number.NaN)
    : input.maximumEffectiveLeverage;
  const positionMarginUsd = (Math.abs(input.positionBase) * input.midpoint) / effectiveLeverage;
  const openingReservations = [...input.openOrders, ...(input.inflightOrders ?? [])].filter(
    (order) => !isDecibelPositionReductionV1(input.positionBase, order),
  );
  const openOrderMarginUsd = openingReservations.reduce(
    (sum, order) => sum + (order.price * order.quantity) / effectiveLeverage,
    0,
  );
  const marginUsedUsd = positionMarginUsd + openOrderMarginUsd;
  const strategyAllocationRemainingUsd = Math.max(
    0,
    Math.min(
      input.venueAvailableMarginUsd,
      input.settings.capitalToUseUsd * input.maximumAggregateCollateralFraction - marginUsedUsd,
    ),
  );
  const availableMarginUsd = Math.min(
    input.venueAvailableMarginUsd,
    Math.max(0, input.settings.capitalToUseUsd - marginUsedUsd),
  );
  const currentExposureUsd = Math.abs(input.positionBase) * input.midpoint;
  const pendingExposureUsd = openOrderMarginUsd * effectiveLeverage;
  const calculateCapacity = (observations = input.capacityInputs, ceiling = aggregateCeilingUsd) =>
    calculateDecibelRiskCapacityV1({
      now: input.now ?? Number.NaN,
      ...(input.capacityEvidence === undefined ? {} : { evidence: input.capacityEvidence }),
      ...(observations !== undefined ? { observations } : {}),
      capitalUsd: input.settings.capitalToUseUsd,
      availableMarginUsd: input.venueAvailableMarginUsd,
      leverage: effectiveLeverage,
      maxLossUsd: input.settings.maxLossUsd,
      netSessionPnlAfterFeesUsd: input.pnlUsd ?? null,
      midpoint: input.midpoint,
      lotSize: input.lotSize ?? Number.NaN,
      collateralFraction: input.maximumAggregateCollateralFraction,
      safetyNotionalCeilingUsd: ceiling,
      positionBase: input.positionBase,
      orders: input.openOrders,
      inflight: input.inflightOrders ?? [],
    });
  let capacityDiagnostics = calculateCapacity();
  let verifiedMargin = input.capacityInputs?.postOrderMargin;
  let postFillBlocker: string | null = null;
  let postFillDiagnostics: ReturnType<typeof produceDecibelPostFillMarginV1> | null = null;
  if (input.capacityInputs?.venueMarginRules && capacityDiagnostics.capacityBlocker === null) {
    const observations = input.capacityInputs;
    const rules = input.capacityInputs.venueMarginRules;
    const assessPostFill = (candidate: ReturnType<typeof calculateCapacity>) =>
      produceDecibelPostFillMarginV1({
        rules,
        now: input.now ?? Number.NaN,
        maximumAgeMs: observations.maximumAgeMs,
        equityUsd: observations.equityUsd,
        availableMarginUsd: input.venueAvailableMarginUsd,
        leverage: effectiveLeverage,
        capitalUsd: input.settings.capitalToUseUsd,
        collateralFraction: input.maximumAggregateCollateralFraction,
        maxLossUsd: input.settings.maxLossUsd,
        transactionReserveUsd:
          candidate.appliedCostObservations?.find((cost) => cost.kind === 'TRANSACTION_COST')
            ?.value ?? 0,
        midpoint: input.midpoint,
        positionBase: input.positionBase,
        candidateHeadroomUsd: candidate.availableHeadroomUsd,
        candidatePositionLimitUsd: candidate.effectivePositionLimitUsd,
        orders: [...input.openOrders, ...(input.inflightOrders ?? [])],
        feeAndExitCostBps:
          (candidate.modeledCosts?.entryFeeBps ?? DECIBEL_CAPACITY_POLICY_V1.feePerLegBps) +
          (candidate.modeledCosts?.exitFeeBps ?? DECIBEL_CAPACITY_POLICY_V1.feePerLegBps) +
          (candidate.modeledCosts?.exitSlippageBps ??
            DECIBEL_CAPACITY_POLICY_V1.maximumBookSlippageBps),
        collateralReserveFraction: DECIBEL_CAPACITY_POLICY_V1.collateralReserveFraction,
      });
    let post = assessPostFill(capacityDiagnostics);
    // Reuse the same calculator to find a lot-valid smaller capacity when
    // mark/execution differences or pending costs bind post-fill collateral.
    if (post.blocker === 'CAPACITY_POST_FILL_MARGIN_UNSAFE' && input.lotSize && input.lotSize > 0) {
      const lotUsd = input.lotSize * input.midpoint;
      let low = 1,
        high = Math.floor(capacityDiagnostics.effectivePositionLimitUsd / lotUsd);
      let best: {
        capacity: ReturnType<typeof calculateCapacity>;
        post: ReturnType<typeof assessPostFill>;
      } | null = null;
      for (let iteration = 0; low <= high && iteration < 64; iteration++) {
        const middle = Math.floor((low + high) / 2);
        const capacity = calculateCapacity(input.capacityInputs, middle * lotUsd);
        const checked = assessPostFill(capacity);
        if (capacity.capacityBlocker === null && checked.blocker === null) {
          best = { capacity, post: checked };
          low = middle + 1;
        } else high = middle - 1;
      }
      if (best) {
        capacityDiagnostics = best.capacity;
        post = best.post;
      }
    }
    postFillDiagnostics = post;
    postFillBlocker = post.blocker;
    if (post.observation) {
      verifiedMargin = post.observation;
      capacityDiagnostics = calculateCapacity(
        {
          ...input.capacityInputs,
          postOrderMargin: post.observation,
        },
        capacityDiagnostics.effectivePositionLimitUsd,
      );
    }
  }
  const effectivePositionLimitUsd = capacityDiagnostics.effectivePositionLimitUsd;
  const venueOrderLimit = input.capacityInputs?.venueMaximumOrderNotionalUsd;
  const marginCheck = produceDecibelMarginTierV1(
    verifiedMargin ?? null,
    input.now ?? Number.NaN,
    Math.max(effectivePositionLimitUsd, capacityDiagnostics.worstCaseExposureUsd ?? 0),
  );
  const orderLimitInvalid =
    venueOrderLimit !== undefined && (!Number.isFinite(venueOrderLimit) || venueOrderLimit <= 0);
  const executionBlocker =
    capacityDiagnostics.capacityBlocker ??
    postFillBlocker ??
    marginCheck.blocker ??
    (orderLimitInvalid ? 'SESSION_CAPACITY_VENUE_ORDER_LIMIT_INVALID' : null);
  return Object.freeze({
    maximumOrderNotionalUsd:
      executionBlocker === null
        ? Math.min(effectivePositionLimitUsd, venueOrderLimit ?? effectivePositionLimitUsd)
        : 0,
    capacityDiagnostics,
    postFillDiagnostics,
    capacityBlocker: executionBlocker,
    configuredMaximumPositionUsd: maximumPositionUsd,
    effectivePositionLimitUsd,
    currentExposureUsd,
    pendingExposureUsd,
    availableHeadroomUsd: capacityDiagnostics.availableHeadroomUsd,
    availableMarginUsd,
    marginUsedUsd,
    strategyAllocationRemainingUsd,
    maximumPositionUsd: effectivePositionLimitUsd,
    maximumAbsPositionBase: effectivePositionLimitUsd / input.midpoint,
  });
}

export function validateDecibelCapitalAllocationV1(
  capitalToUseUsd: number,
  authenticatedAccountEquityUsd: number | null,
): void {
  if (
    authenticatedAccountEquityUsd === null ||
    !Number.isFinite(authenticatedAccountEquityUsd) ||
    authenticatedAccountEquityUsd < 0
  )
    throw new Error('AUTHENTICATED_ACCOUNT_EQUITY_REQUIRED');
  if (capitalToUseUsd > authenticatedAccountEquityUsd + Number.EPSILON)
    throw new Error('CAPITAL_TO_USE_EXCEEDS_AUTHENTICATED_ACCOUNT_EQUITY');
}

function classifyField(
  field: keyof decibel_operator_settings_values_v1,
  current: number,
  pending: number,
): decibel_operator_settings_risk_classification_v1 {
  if (current === pending) return 'RISK_NEUTRAL';
  if (field === 'targetMakerVolumeUsd') {
    if (current > 0 && pending < 0) return 'RISK_INCREASING';
    if (current < 0 && pending > 0) return 'RISK_DECREASING';
    return 'RISK_NEUTRAL';
  }
  return pending > current ? 'RISK_INCREASING' : 'RISK_DECREASING';
}

export function diffDecibelOperatorSettingsV1(
  current: decibel_operator_settings_values_v1,
  pending: decibel_operator_settings_values_v1,
): readonly decibel_operator_settings_diff_v1[] {
  return Object.freeze(
    (Object.keys(current) as Array<keyof decibel_operator_settings_values_v1>)
      .filter((field) => current[field] !== pending[field])
      .map((field) =>
        Object.freeze({
          field,
          current: current[field],
          pending: pending[field],
          classification: classifyField(field, current[field], pending[field]),
        }),
      ),
  );
}

/** Settings a wallet starts with before its first save; the operator edits them in Settings. */
export const DECIBEL_OPERATOR_DEFAULT_SETTINGS_V1: decibel_operator_settings_values_v1 =
  Object.freeze({ capitalToUseUsd: 20, maxLossUsd: 5, targetMakerVolumeUsd: 4_999 });

/** First-run settings: the defaults above, each overridable from the environment. */
export function resolveDecibelInitialOperatorSettingsV1(
  environment: Readonly<Record<string, string | undefined>>,
): decibel_operator_settings_values_v1 {
  const Defaults = DECIBEL_OPERATOR_DEFAULT_SETTINGS_V1;
  return parseDecibelOperatorSettingsValuesV1({
    capitalToUseUsd: Number(
      environment.DECIBEL_PRODUCTION_CAPITAL_TO_USE_USD ?? Defaults.capitalToUseUsd,
    ),
    maxLossUsd: Number(environment.DECIBEL_PRODUCTION_MAX_DRAWDOWN_USD ?? Defaults.maxLossUsd),
    targetMakerVolumeUsd: Number(
      environment.DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD ?? Defaults.targetMakerVolumeUsd,
    ),
  });
}

export function parseDecibelOperatorSettingsValuesV1(
  value: unknown,
): decibel_operator_settings_values_v1 {
  return Object.freeze(ValuesSchema.parse(value));
}

export class decibel_operator_settings_store_v1 {
  private readonly StorePath: string;
  private readonly AuditPath: string;

  public constructor(
    path: string,
    private readonly Initial: decibel_operator_settings_values_v1,
  ) {
    this.StorePath = resolve(path);
    this.AuditPath = `${this.StorePath}.audit.jsonl`;
    parseDecibelOperatorSettingsValuesV1(Initial);
  }

  public read(): decibel_operator_settings_v1 {
    if (!existsSync(this.StorePath))
      return Object.freeze({
        schema: DECIBEL_OPERATOR_SETTINGS_V1,
        revision: 0,
        updatedAt: 0,
        values: this.Initial,
      });
    try {
      return Object.freeze(StoreSchema.parse(JSON.parse(readFileSync(this.StorePath, 'utf8'))));
    } catch (error) {
      throw new Error('OPERATOR_SETTINGS_PERSISTED_CONFIG_INVALID', { cause: error });
    }
  }

  public update(input: Readonly<{ expectedRevision: number; values: unknown }>): Readonly<{
    settings: decibel_operator_settings_v1;
    diff: readonly decibel_operator_settings_diff_v1[];
    classification: decibel_operator_settings_risk_classification_v1;
    applicationStatus: 'APPLIED_FOR_NEXT_SESSION';
  }> {
    const current = this.read();
    if (input.expectedRevision !== current.revision) throw new Error('SETTINGS_REVISION_CONFLICT');
    const values = parseDecibelOperatorSettingsValuesV1(input.values);
    const diff = diffDecibelOperatorSettingsV1(current.values, values);
    const classification = diff.some((entry) => entry.classification === 'RISK_INCREASING')
      ? 'RISK_INCREASING'
      : diff.some((entry) => entry.classification === 'RISK_DECREASING')
        ? 'RISK_DECREASING'
        : 'RISK_NEUTRAL';
    const settings = Object.freeze({
      schema: DECIBEL_OPERATOR_SETTINGS_V1,
      revision: current.revision + 1,
      updatedAt: Date.now(),
      values,
    });
    mkdirSync(dirname(this.StorePath), { recursive: true });
    const temporaryPath = `${this.StorePath}.${process.pid}.${settings.revision}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    renameSync(temporaryPath, this.StorePath);
    appendFileSync(
      this.AuditPath,
      `${JSON.stringify({
        timestamp: settings.updatedAt,
        oldValues: current.values,
        newValues: values,
        classification,
        result: 'APPLIED_FOR_NEXT_SESSION',
        revision: settings.revision,
      })}\n`,
      'utf8',
    );
    return Object.freeze({
      settings,
      diff,
      classification,
      applicationStatus: 'APPLIED_FOR_NEXT_SESSION',
    });
  }
}
