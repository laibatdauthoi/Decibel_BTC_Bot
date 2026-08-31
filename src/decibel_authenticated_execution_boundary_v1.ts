import { z } from 'zod';

export const DECIBEL_AUTHENTICATED_EXECUTION_BOUNDARY_V1 =
  'DECIBEL_AUTHENTICATED_EXECUTION_BOUNDARY_V1' as const;
export const DECIBEL_LIVE_EXECUTION_AUTHORIZATION_V1 = false as const;

export type decibel_execution_mode_v1 = 'PAPER' | 'AUTHENTICATED_DRY_RUN' | 'LIVE';
export type decibel_execution_evidence_mode_v1 =
  'PAPER' | 'AUTHENTICATED_DRY_RUN' | 'ACTUAL_EXECUTION';

export function loadDecibelExecutionModeV1(
  environment: Readonly<Record<string, string | undefined>>,
): decibel_execution_mode_v1 {
  const value = environment.DECIBEL_EXECUTION_MODE ?? 'PAPER';
  if (value === 'PAPER' || value === 'AUTHENTICATED_DRY_RUN' || value === 'LIVE') return value;
  throw new Error('DECIBEL_EXECUTION_MODE_INVALID');
}

const OrderRequestSchema = z.object({
  localIntentId: z.string().min(1),
  localExecutionRequestId: z.string().min(1),
  marketAddress: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  price: z.number().positive().finite(),
  quantity: z.number().positive().finite(),
  orderType: z.literal('LIMIT'),
  timeInForce: z.literal('POST_ONLY'),
  postOnly: z.literal(true),
});

export type decibel_actual_order_request_v1 = z.infer<typeof OrderRequestSchema>;

export type decibel_live_execution_gate_input_v1 = Readonly<{
  executionMode: decibel_execution_mode_v1;
  explicitLiveAuthorization: boolean;
  configuredNetwork: string;
  requiredNetwork: string;
  allowedMarketAddresses: readonly string[];
  riskControllerPermits: boolean;
  strategyActionPermitted: boolean;
  selfTradePreventionPassed: boolean;
  controlledExecutionAccountCount: number;
  currentBestBid: number;
  currentBestAsk: number;
  bookFresh: boolean;
  tickSize: number;
  lotSize: number;
  minimumSize: number;
  maximumOrderSize: number;
  inventoryAfterFillAbs: number;
  maximumInventoryAbs: number;
  sessionLossWithinCap: boolean;
  sessionVolumeAndCostWithinCap: boolean;
  executionState:
    | 'HEALTHY'
    | 'EXECUTION_STATE_UNKNOWN'
    | 'RECONCILIATION_REQUIRED'
    | 'RECONCILING'
    | 'RECONCILED'
    | 'RECONCILIATION_FAILED';
  reconciliationComplete: boolean;
  request: unknown;
}>;

export function evaluateDecibelLiveExecutionAuthorizationV1(
  input: decibel_live_execution_gate_input_v1,
) {
  const reasons: string[] = [];
  const parsed = OrderRequestSchema.safeParse(input.request);
  if (input.executionMode !== 'LIVE') reasons.push('LIVE_MODE_REQUIRED');
  if (!DECIBEL_LIVE_EXECUTION_AUTHORIZATION_V1 || !input.explicitLiveAuthorization)
    reasons.push('EXPLICIT_LIVE_AUTHORIZATION_REQUIRED');
  if (input.configuredNetwork !== input.requiredNetwork) reasons.push('NETWORK_NOT_ALLOWED');
  if (!parsed.success) reasons.push('POST_ONLY_LIMIT_REQUEST_INVALID');
  if (parsed.success) {
    const request = parsed.data;
    if (!input.allowedMarketAddresses.includes(request.marketAddress))
      reasons.push('MARKET_NOT_ALLOWED');
    if (!input.bookFresh || input.currentBestBid >= input.currentBestAsk)
      reasons.push('CURRENT_BOOK_INVALID_OR_STALE');
    else if (
      (request.side === 'BUY' && request.price >= input.currentBestAsk) ||
      (request.side === 'SELL' && request.price <= input.currentBestBid)
    )
      reasons.push('ORDER_WOULD_CROSS');
    const priceSteps = request.price / input.tickSize;
    const sizeSteps = request.quantity / input.lotSize;
    if (
      Math.abs(priceSteps - Math.round(priceSteps)) > 1e-9 ||
      Math.abs(sizeSteps - Math.round(sizeSteps)) > 1e-9 ||
      request.quantity < input.minimumSize ||
      request.quantity > input.maximumOrderSize
    )
      reasons.push('PRICE_OR_SIZE_INVALID');
  }
  if (!input.riskControllerPermits) reasons.push('RISK_CONTROLLER_REJECTED');
  if (!input.strategyActionPermitted) reasons.push('STRATEGY_ACTION_NOT_PERMITTED');
  if (!input.selfTradePreventionPassed || input.controlledExecutionAccountCount !== 1)
    reasons.push('SELF_TRADE_PREVENTION_REJECTED');
  if (input.inventoryAfterFillAbs > input.maximumInventoryAbs)
    reasons.push('INVENTORY_CAP_EXCEEDED');
  if (!input.sessionLossWithinCap) reasons.push('SESSION_LOSS_CAP_EXCEEDED');
  if (!input.sessionVolumeAndCostWithinCap) reasons.push('SESSION_VOLUME_OR_COST_CAP_EXCEEDED');
  if (
    (input.executionState !== 'HEALTHY' && input.executionState !== 'RECONCILED') ||
    !input.reconciliationComplete
  )
    reasons.push('EXECUTION_RECONCILIATION_REQUIRED');
  return Object.freeze({
    authorized: reasons.length === 0,
    reasons: Object.freeze(reasons),
    normalizedRequest: parsed.success ? Object.freeze(parsed.data) : null,
    liveExecutionEnabled: false as const,
  });
}

export function evaluateDecibelAuthenticatedDryRunPlaceV1(
  input: decibel_live_execution_gate_input_v1,
) {
  const gate = evaluateDecibelLiveExecutionAuthorizationV1(input);
  const blockingReasons = gate.reasons.filter(
    (reason) =>
      reason !== 'LIVE_MODE_REQUIRED' && reason !== 'EXPLICIT_LIVE_AUTHORIZATION_REQUIRED',
  );
  return Object.freeze({
    ...gate,
    status: blockingReasons.length === 0 ? ('WOULD_PLACE' as const) : ('REJECTED' as const),
    blockingReasons: Object.freeze(blockingReasons),
    liveSubmissionBlocked: true as const,
  });
}

export function evaluateDecibelAuthenticatedDryRunCancelV1(
  venueOrderId: string,
  knownOwnedVenueOrderIds: readonly string[],
) {
  const owned = venueOrderId.length > 0 && knownOwnedVenueOrderIds.includes(venueOrderId);
  return Object.freeze({
    status: owned ? ('WOULD_CANCEL' as const) : ('REJECTED' as const),
    reason: owned ? null : 'EXACT_OWNED_VENUE_ORDER_REQUIRED',
    venueOrderId,
    liveCancellationBlocked: true as const,
  });
}

export type decibel_venue_order_lineage_v1 = Readonly<{
  localIntentId: string;
  localExecutionRequestId: string;
  venueOrderId: string;
  marketAddress: string;
  side: 'BUY' | 'SELL';
  price: number;
  requestedQuantity: number;
  orderType: 'LIMIT';
  timeInForce: 'POST_ONLY';
  postOnly: true;
  submittedAt: Date;
  acknowledgedAt: Date | null;
  terminalAt: Date | null;
  terminalStatus:
    | 'SUBMITTED'
    | 'ACKNOWLEDGED'
    | 'PARTIALLY_FILLED'
    | 'FILLED'
    | 'CANCEL_PENDING'
    | 'CANCELLED'
    | 'REJECTED'
    | 'UNKNOWN';
}>;

export interface decibel_execution_adapter_v1 {
  readonly mode: decibel_execution_mode_v1;
  readonly liveExecutionEnabled: false;
  validatePlace(request: unknown): ReturnType<typeof evaluateDecibelAuthenticatedDryRunPlaceV1>;
  placePostOnlyOrder(request: decibel_actual_order_request_v1): Promise<never>;
  cancelOrder(venueOrderId: string): Promise<never>;
  getOpenOrders(): Promise<readonly decibel_venue_order_lineage_v1[]>;
  subscribeOwnOrderUpdates(
    listener: (order: decibel_venue_order_lineage_v1) => void,
  ): (() => void) | null;
  subscribeOwnFills(listener: (fill: unknown) => void): (() => void) | null;
}

export class decibel_authenticated_dry_run_execution_adapter_v1 implements decibel_execution_adapter_v1 {
  readonly mode = 'AUTHENTICATED_DRY_RUN' as const;
  readonly liveExecutionEnabled = false as const;

  constructor(
    private readonly GateInput: Omit<decibel_live_execution_gate_input_v1, 'request'>,
    private readonly ReadOpenOrders: () => Promise<
      readonly decibel_venue_order_lineage_v1[]
    > = () => Promise.resolve([]),
  ) {}

  validatePlace(request: unknown) {
    return evaluateDecibelAuthenticatedDryRunPlaceV1({ ...this.GateInput, request });
  }

  placePostOnlyOrder(request: decibel_actual_order_request_v1): Promise<never> {
    void request;
    return Promise.reject(new Error('AUTHENTICATED_DRY_RUN_SUBMISSION_BLOCKED'));
  }

  cancelOrder(venueOrderId: string): Promise<never> {
    void venueOrderId;
    return Promise.reject(new Error('AUTHENTICATED_DRY_RUN_CANCELLATION_BLOCKED'));
  }

  getOpenOrders(): Promise<readonly decibel_venue_order_lineage_v1[]> {
    return this.ReadOpenOrders();
  }

  subscribeOwnOrderUpdates(): null {
    return null;
  }

  subscribeOwnFills(): null {
    return null;
  }
}

export const DecibelSDKCapabilityReportV1 = Object.freeze({
  authentication: Object.freeze({ status: 'PARTIAL', contract: 'DecibelWriteDex(Account)' }),
  placeOrder: Object.freeze({ status: 'AVAILABLE', contract: 'DecibelWriteDex.placeOrder' }),
  cancelOrder: Object.freeze({ status: 'AVAILABLE', contract: 'DecibelWriteDex.cancelOrder' }),
  openOrders: Object.freeze({
    status: 'AVAILABLE',
    contract: 'DecibelReadDex.userOpenOrders.getByAddr/subscribeByAddr',
  }),
  orderStatus: Object.freeze({
    status: 'AVAILABLE',
    contract: 'OrderStatusClient.getOrderStatus',
  }),
  ownOrderUpdates: Object.freeze({
    status: 'AVAILABLE',
    contract: 'userOpenOrders.subscribeByAddr + userNotifications.subscribeByAddr',
  }),
  ownFills: Object.freeze({
    status: 'PARTIAL',
    contract: 'userNotifications OrderPartiallyFilled/OrderFilled lacks complete fill truth',
  }),
  feeAndMakerRoleEvidence: Object.freeze({
    status: 'UNAVAILABLE',
    contract: 'no installed authenticated own-fill contract joins unique fill, maker role, and fee',
  }),
  liveSubmissionBlocked: true,
  privateKeyLoaded: false,
});
