/**
 * One classification for every reason the bot reports while it is not acting
 * (2026-11-16, operator approved).
 *
 * Before this module every execution blocker was projected as an error: an entry
 * filter wait, an operator pause or the few seconds of routine order confirmation
 * all showed "EXECUTION BLOCKED" with a CRITICAL alert. The dashboard now uses the
 * kind below, so only a real fault is shown as an error.
 *
 * - FAULT: needs attention. Unknown codes are faults, so nothing new is hidden.
 * - DEGRADED: a transient data or rate problem that the bot retries on its own.
 * - RECONCILING: routine confirmation of the bot's own order with the venue.
 *   It becomes a FAULT once it lasts longer than
 *   DECIBEL_RECONCILING_ESCALATION_MS_V1 (see escalateDecibelRuntimeConditionV1).
 * - WAITING: a normal strategy or session wait (entry filters, pause, drain).
 *
 * Presentation only: no trading decision reads this module, except the shared
 * entry-only reason lists, which the decision layer uses as its single source.
 */
import { DECIBEL_STRATEGY_POLICY_V1 as POLICY_V1 } from './decibel_strategy_policy_v1.js';

export type decibel_runtime_condition_kind_v1 = 'FAULT' | 'DEGRADED' | 'RECONCILING' | 'WAITING';

export const DECIBEL_RECONCILING_ESCALATION_MS_V1 = 60_000;

/**
 * Reasons that never block a proven reduce-only candidate. The decision layer does not add
 * them for a position reduction (see `entryCapacityOnly` in decibel_trading_decision_v1).
 */
const ENTRY_ONLY_REASON_PATTERN_V1 =
  /^(?:RISK_BLOCKED|ENTRY_CYCLE_[A-Z_]+|DCA_[A-Z_]+|ENTRY_EXCEEDS_REMAINING_TARGET|ENTRY_VOLATILITY_PAUSE|ENTRY_GAS_BALANCE_LOW|ENTRY_REQUIRES_NEW_LOW|ENTRY_REQUIRES_NEW_HIGH|ENTRY_CANDLE_EVIDENCE_REQUIRED|NO_NEW_QUOTE_HEADROOM|QUOTE_CAPACITY_BELOW_MINIMUM_ORDER|INSUFFICIENT_LEVERAGED_BUYING_POWER|MINIMUM_NOTIONAL_EXCEEDS_MAXIMUM_NOTIONAL)$/;

/** Stale or unverified sizing evidence: skipped for a proven reduction candidate only. */
const CAPACITY_EVIDENCE_REASON_PATTERN_V1 =
  /^(?:CAPACITY_ACCOUNT_EVIDENCE_STALE|CAPACITY_MARKET_EVIDENCE_STALE|CAPACITY_VENUE_MARGIN_RULES_STALE|CAPACITY_POST_ORDER_MARGIN_TIER_UNVERIFIED|CAPACITY_POST_FILL_MARGIN_UNSAFE)$/;

/**
 * Reasons that block opening orders only, so a state with an executable reduction stays
 * TRADE. Capacity evidence reasons are deliberately not in this list: when they are present
 * for any other reason, the whole decision stays fail-closed (tested: "keeps reducing
 * orders fail-closed when exit evidence is stale or ownership conflicts").
 */
export function isDecibelEntryOnlyReasonV1(reason: string): boolean {
  return ENTRY_ONLY_REASON_PATTERN_V1.test(reason);
}

/** Entry-only reasons plus the capacity evidence reasons, skipped for a proven reduction. */
export function isDecibelEntryCapacityOnlyReasonV1(reason: string): boolean {
  return isDecibelEntryOnlyReasonV1(reason) || CAPACITY_EVIDENCE_REASON_PATTERN_V1.test(reason);
}

const DEGRADED_CODES_V1: ReadonlySet<string> = new Set([
  'MARKET_DATA_STALE',
  'PRODUCTION_LIVE_SOURCE_BOOK_STALE',
  'PRODUCTION_LIVE_SOURCE_BOOK_FUTURE',
  'PRODUCTION_MARKET_DATA_READ_TRANSIENT',
  'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
  'PRODUCTION_AUTHENTICATED_READ_REQUIRED',
  'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
  'CAPACITY_ACCOUNT_EVIDENCE_STALE',
  'CAPACITY_MARKET_EVIDENCE_STALE',
  'CAPACITY_VENUE_MARGIN_RULES_STALE',
  'EXECUTION_MUTATION_BUDGET_BLOCKED',
  'SESSION_TAKEOVER_OPERATOR_RESUME_REQUIRED',
]);

const RECONCILING_CODES_V1: ReadonlySet<string> = new Set([
  'RECONCILE_ONLY',
  'RECONCILIATION_REQUIRED',
  'EXECUTION_STATE_CHANGED_BEFORE_INTENT',
  'PRODUCTION_RECONCILIATION_CONFIRMATION_PENDING',
  'PRODUCTION_RECONCILIATION_PENDING_ACKNOWLEDGED_ORDER',
  'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
  'PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING',
  'CANCEL_SUPPRESSED_TARGET_TERMINAL',
]);

const WAITING_CODES_V1: ReadonlySet<string> = new Set([
  'CAPITAL_RESERVED_BY_RESTING_ORDERS',
  'ENTRY_CANCEL_FINALITY_PENDING',
  'LIFECYCLE_COST_BUDGET_EXCEEDED',
  'OPERATOR_PAUSED',
  'SESSION_TARGET_DRAIN_COMPLETE',
  'SESSION_SHUTDOWN_PAUSE',
  'SESSION_PAUSED_FOR_SHUTDOWN',
  'SESSION_TAKEOVER_PAUSED',
  'WAITING_FOR_SESSION_UNWIND',
  'DUST_BELOW_MIN_SIZE',
  'PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED',
  'PROTECTIVE_ONLY_FLAT_NEW_EXPOSURE_BLOCKED',
  'PRODUCTION_DRY_RUN_MUTATION_BLOCKED',
  'EXECUTION_MUTATION_BUDGET_COOLDOWN',
  'TP_REPLACEMENT_NET_PROFIT_NOT_PROVEN',
  'KEEP:NOOP_RECREATE_AFTER_CANCEL',
]);

const CODE_SEGMENT_V1 = /^[A-Z][A-Z0-9_]*$/;

/**
 * Splits identifiers out of a reason code, so that one condition keeps one code.
 * `INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT:1701...` becomes the code
 * `INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT` with the order id as detail, and
 * `KEEP:NOOP_RECREATE_AFTER_CANCEL ORDER_KEY=...` keeps its order key as detail.
 * Free text (an exception message) is returned unchanged.
 */
export function normalizeDecibelConditionCodeV1(
  raw: string,
): Readonly<{ code: string; detail: string | null }> {
  const trimmed = raw.trim();
  const space = trimmed.search(/\s/);
  const head = space < 0 ? trimmed : trimmed.slice(0, space);
  const tail = space < 0 ? '' : trimmed.slice(space + 1).trim();
  const segments = head.split(':');
  const kept: string[] = [];
  for (const segment of segments) {
    if (!CODE_SEGMENT_V1.test(segment)) break;
    kept.push(segment);
  }
  if (kept.length === 0) return Object.freeze({ code: trimmed, detail: null });
  const rest = [segments.slice(kept.length).join(':'), tail].filter((part) => part !== '');
  return Object.freeze({
    code: kept.join(':'),
    detail: rest.length === 0 ? null : rest.join(' '),
  });
}

export type decibel_condition_source_v1 = Readonly<{
  classification:
    | 'REAL_RECONCILIATION_CONFLICT'
    | 'MARKET_SAMPLES_INSUFFICIENT'
    | 'ECONOMIC_EVIDENCE_STALE'
    | 'AUTHENTICATED_ACCOUNT_STALE'
    | 'VENUE_SOURCE_UNAVAILABLE';
  source: 'RECONCILIATION' | 'MARKET DATA' | 'ECONOMIC EVIDENCE' | 'ACCOUNT' | 'VENUE DATA';
}>;

function isWaitingCodeV1(code: string): boolean {
  if (DEGRADED_CODES_V1.has(code)) return false;
  return (
    WAITING_CODES_V1.has(code) ||
    /^SIDE_OCCUPIED_(?:BUY|SELL)_[A-Z_]+$/.test(code) ||
    isDecibelEntryCapacityOnlyReasonV1(code)
  );
}

/**
 * Which evidence a condition is about, for the dashboard alert label (moved here from the
 * dashboard on 2026-11-16 so the label and the kind come from one place). Null for normal
 * waits and for codes without a known evidence source.
 */
export function getDecibelConditionSourceV1(raw: string): decibel_condition_source_v1 | null {
  const { code } = normalizeDecibelConditionCodeV1(raw);
  if (isWaitingCodeV1(code)) return null;
  if (/IDENTITY.*CONFLICT|RECONCILIATION.*CONFLICT/.test(code))
    return { classification: 'REAL_RECONCILIATION_CONFLICT', source: 'RECONCILIATION' };
  if (/ADVERSE.*(?:INSUFFICIENT|WARMING)|MARKET_SAMPLES_INSUFFICIENT/.test(code))
    return { classification: 'MARKET_SAMPLES_INSUFFICIENT', source: 'MARKET DATA' };
  if (/ECONOMIC|ADVERSE_SELECTION.*STALE/.test(code))
    return { classification: 'ECONOMIC_EVIDENCE_STALE', source: 'ECONOMIC EVIDENCE' };
  if (/AUTHENTICATED.*STALE|CAPACITY_ACCOUNT_EVIDENCE_STALE/.test(code))
    return { classification: 'AUTHENTICATED_ACCOUNT_STALE', source: 'ACCOUNT' };
  if (
    /BOOK_STALE|MARKET_DATA_STALE|READ_TIMEOUT|READ_STAGE|HTTP.*(?:TIMEOUT|FAILED)|SOURCE_UNAVAILABLE|CAPACITY_VENUE_MARGIN_RULES_STALE/.test(
      code,
    )
  )
    return { classification: 'VENUE_SOURCE_UNAVAILABLE', source: 'VENUE DATA' };
  return null;
}

export function classifyDecibelRuntimeConditionV1(raw: string): decibel_runtime_condition_kind_v1 {
  const { code } = normalizeDecibelConditionCodeV1(raw);
  if (DEGRADED_CODES_V1.has(code)) return 'DEGRADED';
  if (RECONCILING_CODES_V1.has(code)) return 'RECONCILING';
  if (isWaitingCodeV1(code)) return 'WAITING';
  const source = getDecibelConditionSourceV1(code);
  if (source !== null)
    return source.classification === 'REAL_RECONCILIATION_CONFLICT' ? 'FAULT' : 'DEGRADED';
  return 'FAULT';
}

/** Routine confirmation that does not finish in time is a fault. */
export function escalateDecibelRuntimeConditionV1(
  kind: decibel_runtime_condition_kind_v1,
  reconcilingForMs: number | null,
): decibel_runtime_condition_kind_v1 {
  return kind === 'RECONCILING' &&
    reconcilingForMs !== null &&
    reconcilingForMs > DECIBEL_RECONCILING_ESCALATION_MS_V1
    ? 'FAULT'
    : kind;
}

const MEANINGS_V1: Readonly<Record<string, string>> = Object.freeze({
  EXECUTION_STATE_CHANGED_BEFORE_INTENT: 'Authenticated state changed before mutation.',
  RECONCILE_ONLY: 'A prior intent requires authoritative reconciliation.',
  RECONCILIATION_REQUIRED: 'Confirming the latest order with the venue.',
  STRATEGY_ACTIVITY_EXCLUSIVITY_LOST: 'Unmanaged BTC/USD activity prevents exclusive control.',
  PRODUCTION_AUTHENTICATED_READ_REQUIRED: 'Required authenticated account evidence is unavailable.',
  PRODUCTION_AUTHENTICATED_READ_TRANSIENT:
    'An authenticated account read failed. The bot retries with a bounded backoff.',
  PRODUCTION_MARKET_DATA_READ_TRANSIENT: 'A market data read failed. The bot retries next cycle.',
  PRODUCTION_DECIBEL_HTTP_RATE_LIMITED:
    'Decibel HTTP API rate limit reached. Authenticated reads are paused for bounded backoff.',
  MARKET_DATA_STALE: 'Market data is stale. New orders wait for a fresh order book.',
  PRODUCTION_LIVE_SOURCE_BOOK_STALE:
    'The live order book is stale. New orders wait for fresh data.',
  PRODUCTION_LIVE_SOURCE_BOOK_FUTURE:
    'The order book timestamp is ahead of the local clock. Waiting for consistent data.',
  EXECUTION_MUTATION_BUDGET_BLOCKED: 'Rolling mutation capacity is depleted.',
  EXECUTION_MUTATION_BUDGET_COOLDOWN: 'Waiting for the rolling mutation budget to replenish.',
  PRODUCTION_RECONCILIATION_CONFIRMATION_PENDING: 'Waiting for authenticated intent confirmation.',
  PRODUCTION_RECONCILIATION_PENDING_ACKNOWLEDGED_ORDER:
    'Acknowledged order is waiting for authoritative venue reconciliation.',
  PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK:
    'Acknowledged order is awaiting authoritative venue evidence. Automatic reconciliation will retry; missing evidence keeps the order unresolved.',
  PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING:
    'The venue accepted the order; waiting for it to appear in the authenticated order list.',
  PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT:
    'A venue order does not match the journal identity. Automatic trading stays blocked until it is reconciled.',
  CANCEL_SUPPRESSED_TARGET_TERMINAL: 'The order to cancel is already closed on the venue.',
  UNRESOLVED_EXTERNAL_ORDER_ACTIVITY:
    'Unknown BTC/USD order activity on the account. Trading waits until it is resolved.',
  'INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT':
    'An open order would cross through flat. Waiting for the venue position and orders to agree.',
  INVENTORY_CAP_EXCEEDED: 'The position exceeds the position cap.',
  QUOTE_SIZING_LIMITS_INVALID: 'Quote sizing limits are invalid for the current account state.',
  EXECUTION_PREFLIGHT_REJECTED: 'The order failed the pre-submission safety check.',
  EXECUTION_KILL_SWITCH_ACTIVE: 'The execution kill switch is active. No orders are submitted.',
  EXECUTION_SUBMISSION_WATCHDOG_TIMEOUT:
    'An order submission did not finish in time. Its outcome is reconciled before trading resumes.',
  EXECUTION_SINGLE_LIVE_ORDER_BLOCKED: 'Only one live order is allowed at this release stage.',
  ENTRY_GAS_BALANCE_LOW: `The APT gas wallet is below the protection reserve (${POLICY_V1.gas.entryReserveApt} APT). New entries are paused; top up APT on the signing account.`,
  ENTRY_REQUIRES_NEW_LOW:
    'Entry filter: a long opens only after the last closed 5-minute candle made a lower low.',
  ENTRY_REQUIRES_NEW_HIGH:
    'Entry filter: a short opens only after the last closed 5-minute candle made a higher high.',
  ENTRY_CANDLE_EVIDENCE_REQUIRED:
    'Entry filter: waiting for two closed 5-minute candles of price history.',
  ENTRY_VOLATILITY_PAUSE: `The 5-minute price range is above ${POLICY_V1.entry.volatilityPauseBps} bps. New entries and DCA are paused until it calms down; exits continue.`,
  NO_NEW_QUOTE_HEADROOM: 'No free margin for another entry. Resting orders and the TP continue.',
  QUOTE_CAPACITY_BELOW_MINIMUM_ORDER:
    'The remaining capacity is below the venue minimum order. No new entry.',
  INSUFFICIENT_LEVERAGED_BUYING_POWER: 'Not enough buying power for the next entry.',
  MINIMUM_NOTIONAL_EXCEEDS_MAXIMUM_NOTIONAL:
    'The venue minimum order is larger than the allowed position. No new entry.',
  CAPITAL_RESERVED_BY_RESTING_ORDERS: 'Capital is reserved by the resting orders.',
  ENTRY_CANCEL_FINALITY_PENDING: 'Waiting for a cancelled entry to be confirmed.',
  CAPACITY_ACCOUNT_EVIDENCE_STALE: 'Account evidence for sizing is stale. New entries wait.',
  CAPACITY_MARKET_EVIDENCE_STALE: 'Market evidence for sizing is stale. New entries wait.',
  CAPACITY_VENUE_MARGIN_RULES_STALE: 'Venue margin rules are stale. New entries wait.',
  CAPACITY_POST_ORDER_MARGIN_TIER_UNVERIFIED:
    'The margin tier after the next entry is unverified. No new entry.',
  CAPACITY_POST_FILL_MARGIN_UNSAFE: 'A fill of the next entry would leave too little margin.',
  OPERATOR_PAUSED: 'Paused by the operator.',
  SESSION_TARGET_DRAIN_COMPLETE: 'Target volume reached. Waiting for the position to close.',
  SESSION_SHUTDOWN_PAUSE: 'Process shutdown: cancelling entries and keeping the TP.',
  SESSION_PAUSED_FOR_SHUTDOWN: 'The session is paused for a process shutdown.',
  SESSION_TAKEOVER_PAUSED: 'Session takeover paused.',
  SESSION_TAKEOVER_OPERATOR_RESUME_REQUIRED: 'Session takeover needs an operator resume.',
  WAITING_FOR_SESSION_UNWIND: 'Waiting for the session unwind to finish.',
  DUST_BELOW_MIN_SIZE: 'The remaining position is below the venue minimum order.',
  PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED: 'Collecting fee and market evidence after start.',
  PROTECTIVE_ONLY_FLAT_NEW_EXPOSURE_BLOCKED: 'Protective mode: no new exposure while flat.',
  PRODUCTION_DRY_RUN_MUTATION_BLOCKED: 'Dry run: orders are not submitted.',
  TP_REPLACEMENT_NET_PROFIT_NOT_PROVEN: 'Keeping the current TP; a replacement is not better.',
  'KEEP:NOOP_RECREATE_AFTER_CANCEL': 'Keeping the order; recreating it would change nothing.',
  LIFECYCLE_COST_BUDGET_EXCEEDED: 'The volume cost budget does not allow another entry now.',
});

const KIND_FALLBACK_MEANING_V1: Readonly<Record<decibel_runtime_condition_kind_v1, string>> =
  Object.freeze({
    FAULT: 'Production safety condition requires review.',
    DEGRADED: 'Transient data problem. The bot retries automatically.',
    RECONCILING: 'Confirming the bot order with the venue.',
    WAITING: 'Waiting for trading conditions.',
  });

export function describeDecibelRuntimeConditionV1(raw: string): string {
  const { code } = normalizeDecibelConditionCodeV1(raw);
  if (/^SIDE_OCCUPIED_(?:BUY|SELL)_[A-Z_]+$/.test(code))
    return 'An order on this side is still being confirmed.';
  return MEANINGS_V1[code] ?? KIND_FALLBACK_MEANING_V1[classifyDecibelRuntimeConditionV1(code)];
}
