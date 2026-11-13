/**
 * Pure safety policy for the one-off venue capability probe
 * (docs/decibel_venue_capability_probe_plan_v1.md). The probe is not part of the
 * production chain, so it carries its own risk gate: tiny notional, flat start,
 * reduce-only closes and no submission retries.
 */
import { redactDecibelSecretsV1 } from './decibel_secret_redaction_v1.js';
export const DECIBEL_VENUE_PROBE_MAX_ORDER_NOTIONAL_USD_V1 = 12;
export const DECIBEL_VENUE_PROBE_CLIENT_ORDER_ID_PREFIX_V1 = 'vprobe';
export const DECIBEL_VENUE_PROBE_FAR_DISTANCE_FRACTION_V1 = 0.03;
export const DECIBEL_VENUE_PROBE_CROSS_DISTANCE_FRACTION_V1 = 0.003;
export const DECIBEL_VENUE_PROBE_STOP_DISTANCE_FRACTION_V1 = 0.1;

export type decibel_venue_probe_stage_v1 = 'A' | 'B' | 'C' | 'D' | 'E';
const STAGES: readonly decibel_venue_probe_stage_v1[] = ['A', 'B', 'C', 'D', 'E'];

export type decibel_venue_probe_args_v1 = Readonly<{
  stage: decibel_venue_probe_stage_v1;
  reportDirectory: string | null;
  partialFillWaitMs: number;
}>;

/** One stage per invocation, and only with an explicit --live flag. */
export function parseDecibelVenueProbeArgsV1(
  argv: readonly string[],
): Readonly<{ args: decibel_venue_probe_args_v1 | null; error: string | null }> {
  const fail = (error: string) => Object.freeze({ args: null, error });
  if (!argv.includes('--live')) return fail('PROBE_LIVE_FLAG_REQUIRED');
  const stageIndex = argv.indexOf('--stage');
  const stage = stageIndex >= 0 ? argv[stageIndex + 1] : undefined;
  if (!stage || !STAGES.includes(stage as decibel_venue_probe_stage_v1))
    return fail('PROBE_STAGE_REQUIRED');
  if (argv.filter((value) => value === '--stage').length !== 1)
    return fail('PROBE_SINGLE_STAGE_REQUIRED');
  const reportIndex = argv.indexOf('--report-dir');
  const reportDirectory = reportIndex >= 0 ? (argv[reportIndex + 1] ?? null) : null;
  if (reportIndex >= 0 && (!reportDirectory || reportDirectory.startsWith('--')))
    return fail('PROBE_REPORT_DIR_INVALID');
  const waitIndex = argv.indexOf('--partial-fill-wait-ms');
  const partialFillWaitMs = waitIndex >= 0 ? Number(argv[waitIndex + 1]) : 600_000;
  if (
    !Number.isSafeInteger(partialFillWaitMs) ||
    partialFillWaitMs < 0 ||
    partialFillWaitMs > 600_000
  )
    return fail('PROBE_PARTIAL_FILL_WAIT_INVALID');
  return Object.freeze({
    args: Object.freeze({
      stage: stage as decibel_venue_probe_stage_v1,
      reportDirectory,
      partialFillWaitMs,
    }),
    error: null,
  });
}

export type decibel_venue_probe_preconditions_v1 = Readonly<{
  tradingMode: string | undefined;
  liveTradingEnabled: string | undefined;
  network: string | undefined;
  productionProcessRunning: boolean | null;
  positionBase: number | null;
  openOrderCount: number | null;
  bulkOrderCount: number | null;
  marketMode: string | null;
  aptBalanceOctas: number | null;
  requiredGasOctas: number | null;
}>;

/** Every unknown input blocks; nothing here grants permission by default. */
export function assessDecibelVenueProbePreconditionsV1(
  input: decibel_venue_probe_preconditions_v1,
): string | null {
  if (input.tradingMode !== 'mainnet' || input.liveTradingEnabled !== 'true')
    return 'PROBE_MAINNET_LIVE_TRADING_FLAGS_REQUIRED';
  if (input.network !== 'mainnet') return 'PROBE_MAINNET_NETWORK_REQUIRED';
  if (input.productionProcessRunning !== false)
    return 'PROBE_PRODUCTION_PROCESS_NOT_PROVEN_STOPPED';
  if (input.marketMode !== 'Open') return 'PROBE_MARKET_NOT_OPEN';
  if (input.positionBase === null || !Number.isFinite(input.positionBase))
    return 'PROBE_POSITION_UNKNOWN';
  if (input.positionBase !== 0) return 'PROBE_FLAT_POSITION_REQUIRED';
  if (input.openOrderCount !== 0) return 'PROBE_ZERO_OPEN_ORDERS_REQUIRED';
  if (input.bulkOrderCount !== 0) return 'PROBE_ZERO_BULK_ORDERS_REQUIRED';
  if (
    input.aptBalanceOctas === null ||
    input.requiredGasOctas === null ||
    !Number.isFinite(input.aptBalanceOctas) ||
    !(input.requiredGasOctas > 0) ||
    input.aptBalanceOctas < input.requiredGasOctas
  )
    return 'PROBE_INSUFFICIENT_APT_FOR_GAS';
  return null;
}

export type decibel_venue_probe_market_v1 = Readonly<{
  tickSize: number;
  lotSize: number;
  minimumSize: number;
  midPrice: number;
}>;

const decimalsOf = (step: number): number => {
  const text = step.toString();
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  return text.includes('.') ? text.split('.')[1]!.length : 0;
};
const roundTo = (value: number, step: number, mode: 'floor' | 'ceil'): number => {
  const units = mode === 'floor' ? Math.floor(value / step + 1e-9) : Math.ceil(value / step - 1e-9);
  return Number((units * step).toFixed(decimalsOf(step)));
};

export function getDecibelVenueProbeSizeV1(
  market: decibel_venue_probe_market_v1,
  minimumMultiple: 1 | 2,
): number {
  return roundTo(market.minimumSize * minimumMultiple, market.lotSize, 'ceil');
}

/** Price offset from the midpoint, rounded away from the touch for resting orders. */
export function getDecibelVenueProbePriceV1(
  market: decibel_venue_probe_market_v1,
  side: 'BUY' | 'SELL',
  fraction: number,
  direction: 'AWAY' | 'THROUGH',
): number {
  const sign = (side === 'BUY' ? -1 : 1) * (direction === 'AWAY' ? 1 : -1);
  const raw = market.midPrice * (1 + sign * fraction);
  const restingAway = direction === 'AWAY';
  return roundTo(raw, market.tickSize, (side === 'BUY') === restingAway ? 'floor' : 'ceil');
}

export type decibel_venue_probe_order_v1 = Readonly<{
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  timeInForce: 'PostOnly' | 'ImmediateOrCancel';
  reduceOnly: boolean;
  purpose: 'REST' | 'OPEN_POSITION' | 'CLOSE_POSITION' | 'TP' | 'CROSS_UPDATE';
}>;

/** The probe's own risk gate. Returns a blocker or null. */
export function assessDecibelVenueProbeOrderV1(
  order: decibel_venue_probe_order_v1,
  market: decibel_venue_probe_market_v1,
  positionBase: number,
): string | null {
  if (!(order.price > 0) || !(order.quantity > 0)) return 'PROBE_ORDER_INVALID';
  if (order.quantity * order.price > DECIBEL_VENUE_PROBE_MAX_ORDER_NOTIONAL_USD_V1 + 1e-9)
    return 'PROBE_ORDER_NOTIONAL_ABOVE_CAP';
  if (order.quantity > getDecibelVenueProbeSizeV1(market, 2) + 1e-12)
    return 'PROBE_ORDER_SIZE_ABOVE_TWO_MINIMUM';
  const closing = order.purpose === 'CLOSE_POSITION' || order.purpose === 'TP';
  if (closing) {
    if (!order.reduceOnly) return 'PROBE_CLOSE_REQUIRES_REDUCE_ONLY';
    const reducingSide = positionBase > 0 ? 'SELL' : positionBase < 0 ? 'BUY' : null;
    if (reducingSide === null || order.side !== reducingSide) return 'PROBE_CLOSE_SIDE_INVALID';
    if (order.quantity > Math.abs(positionBase) + 1e-12) return 'PROBE_CLOSE_ABOVE_POSITION';
  }
  if (order.purpose === 'OPEN_POSITION' && positionBase !== 0)
    return 'PROBE_OPEN_REQUIRES_FLAT_POSITION';
  if (
    order.timeInForce === 'ImmediateOrCancel' &&
    !['OPEN_POSITION', 'CLOSE_POSITION'].includes(order.purpose)
  )
    return 'PROBE_IOC_ONLY_FOR_EXPLICIT_OPEN_OR_CLOSE';
  if (order.purpose === 'REST' || order.purpose === 'TP' || order.purpose === 'CROSS_UPDATE') {
    if (order.timeInForce !== 'PostOnly') return 'PROBE_RESTING_ORDER_REQUIRES_POST_ONLY';
  }
  return null;
}

export function buildDecibelVenueProbeClientOrderIdV1(
  stage: decibel_venue_probe_stage_v1,
  step: number,
  now: number,
): string {
  const id = `${DECIBEL_VENUE_PROBE_CLIENT_ORDER_ID_PREFIX_V1}-${stage}${step}-${now.toString(36)}`;
  if (Buffer.byteLength(id) > 32) throw new Error('PROBE_CLIENT_ORDER_ID_TOO_LONG');
  return id;
}

export function isDecibelVenueProbeClientOrderIdV1(value: string | null | undefined): boolean {
  return (
    typeof value === 'string' &&
    value.startsWith(`${DECIBEL_VENUE_PROBE_CLIENT_ORDER_ID_PREFIX_V1}-`)
  );
}

export type decibel_venue_probe_order_row_v1 = Readonly<{
  orderId: string;
  clientOrderId: string | null;
  price: number | null;
  origSize: number | null;
  remainingSize: number | null;
  reduceOnly: boolean | null;
  unixMs: number | null;
}>;

/** Compares the probe order before and after an update step. */
export function compareDecibelVenueProbeOrdersV1(
  before: decibel_venue_probe_order_row_v1 | null,
  after: readonly decibel_venue_probe_order_row_v1[],
  clientOrderId: string,
): Readonly<{
  orderPresent: boolean;
  orderIdPreserved: boolean | null;
  timestampPreserved: boolean | null;
  matchingOrders: number;
  after: decibel_venue_probe_order_row_v1 | null;
}> {
  const matching = after.filter(
    (row) =>
      row.clientOrderId === clientOrderId || (before !== null && row.orderId === before.orderId),
  );
  const current = matching[0] ?? null;
  return Object.freeze({
    orderPresent: current !== null,
    orderIdPreserved:
      before === null || current === null ? null : current.orderId === before.orderId,
    timestampPreserved:
      before?.unixMs == null || current?.unixMs == null ? null : current.unixMs === before.unixMs,
    matchingOrders: matching.length,
    after: current,
  });
}

/** Removes known secret values and any Aptos Labs API key pattern from log or report text. */
export function redactDecibelVenueProbeTextV1(text: string, secrets: readonly string[]): string {
  return redactDecibelSecretsV1(text, secrets);
}

export type decibel_venue_probe_order_event_v1 = Readonly<{
  orderId: string;
  clientOrderId: string | null;
  status: string;
  cancellationReason: string | null;
  isTaker: boolean | null;
  price: string | null;
  origSize: string | null;
  remainingSize: string | null;
}>;

const variantOf = (value: unknown): string | null =>
  value &&
  typeof value === 'object' &&
  typeof (value as { __variant__?: unknown }).__variant__ === 'string'
    ? (value as { __variant__: string }).__variant__
    : null;
const optionOf = (value: unknown): unknown =>
  value && typeof value === 'object' && Array.isArray((value as { vec?: unknown }).vec)
    ? ((value as { vec: unknown[] }).vec[0] ?? null)
    : null;

/** Order events emitted by `market_types::OrderEvent` in a committed transaction. */
export function extractDecibelVenueProbeOrderEventsV1(
  events: readonly Readonly<{ type: string; data: unknown }>[],
): readonly decibel_venue_probe_order_event_v1[] {
  return events
    .filter((event) => event.type.endsWith('::market_types::OrderEvent'))
    .map((event) => {
      const data = (event.data ?? {}) as Record<string, unknown>;
      const clientOrderId = optionOf(data.client_order_id);
      const toText = (value: unknown): string | null =>
        typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
          ? String(value)
          : null;
      return Object.freeze({
        orderId: toText(data.order_id) ?? '',
        clientOrderId: typeof clientOrderId === 'string' ? clientOrderId : null,
        status: variantOf(data.status) ?? 'UNKNOWN',
        cancellationReason: variantOf(optionOf(data.cancellation_reason)),
        isTaker: typeof data.is_taker === 'boolean' ? data.is_taker : null,
        price: toText(data.price),
        origSize: toText(data.orig_size),
        remainingSize: toText(data.remaining_size),
      });
    })
    .filter((event) => event.orderId !== '');
}

/** The order left resting after an update: a different id with status OPEN, if any. */
export function findDecibelVenueProbeReplacementOrderIdV1(
  events: readonly decibel_venue_probe_order_event_v1[],
  previousOrderId: string,
): string | null {
  const open = events.filter((event) => event.status === 'OPEN');
  return (open.find((event) => event.orderId !== previousOrderId) ?? open[0])?.orderId ?? null;
}

/** A committed Move abort is a definitive failure, not an unknown outcome. */
export function parseDecibelMoveAbortV1(
  message: string,
): Readonly<{ transactionHash: string | null; abort: string }> | null {
  const index = message.indexOf('Move abort');
  if (index < 0) return null;
  const hash = /Transaction (0x[0-9a-fA-F]{64})/.exec(message)?.[1] ?? null;
  const abort = /::([a-z_]+):\s*([A-Z0-9_]+\(0x[0-9a-f]+\))/.exec(message.slice(index));
  return Object.freeze({
    transactionHash: hash,
    abort: abort ? `${abort[1]}::${abort[2]}` : message.slice(index, index + 200),
  });
}

/** A probe stop must stay far from the market: never a realistic trigger during the stage. */
export const DECIBEL_VENUE_PROBE_MINIMUM_STOP_DISTANCE_FRACTION_V1 = 0.05;

/**
 * Probe-only gate for a position stop-loss: an open position, a trigger on the closing side
 * at least 5% from the midpoint, and a limit no closer to the market than the trigger.
 */
export function assessDecibelVenueProbeStopV1(
  input: Readonly<{
    positionBase: number;
    triggerPrice: number;
    limitPrice: number;
    midPrice: number;
  }>,
): string | null {
  const { positionBase, triggerPrice, limitPrice, midPrice } = input;
  if (!Number.isFinite(positionBase) || positionBase === 0) return 'PROBE_STOP_POSITION_REQUIRED';
  if (![triggerPrice, limitPrice, midPrice].every((value) => Number.isFinite(value) && value > 0))
    return 'PROBE_STOP_PRICE_INVALID';
  const distance = DECIBEL_VENUE_PROBE_MINIMUM_STOP_DISTANCE_FRACTION_V1;
  // A long closes with a SELL stop below the market; a short with a BUY stop above it.
  const far =
    positionBase > 0
      ? triggerPrice <= midPrice * (1 - distance) && limitPrice <= triggerPrice
      : triggerPrice >= midPrice * (1 + distance) && limitPrice >= triggerPrice;
  return far ? null : 'PROBE_STOP_TOO_CLOSE';
}

/** The position's stop-loss id, preferring the position's own pointer over open-order rows. */
export function findDecibelVenueProbeStopOrderIdV1(
  tpslOrderIds: readonly string[],
  positionStopOrderId: string | null,
): string | null {
  if (positionStopOrderId !== null && positionStopOrderId.length > 0) return positionStopOrderId;
  return tpslOrderIds.length === 1 ? tpslOrderIds[0]! : null;
}
