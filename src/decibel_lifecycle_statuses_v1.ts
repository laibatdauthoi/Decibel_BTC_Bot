/**
 * Shared intent and session status sets (2026-11-16).
 *
 * These lists were copied by hand into the journal queries, retention, legacy handoff,
 * telemetry and the dashboard (eight copies of the terminal list alone). Keep every copy
 * here. Pure module with type-only imports, so the dashboard can import it too.
 */
import type { execution_intent_status_v1 } from './decibel_execution_intent_v1.js';

/** An intent in one of these statuses never changes again. */
export const DECIBEL_TERMINAL_INTENT_STATUSES_V1 = Object.freeze([
  'APPLIED',
  'EXTERNALLY_NEUTRALIZED',
  'CANCELLED_EXTERNALLY',
  'FAILED_TIMEOUT',
  'FAILED_DROPPED',
  'FAILED_DROPPED_LEGACY',
  'REJECTED',
  'SUPERSEDED',
] as const satisfies readonly execution_intent_status_v1[]);

/**
 * SQL form of the terminal list: `('APPLIED',...,'SUPERSEDED')`. The partial index
 * `execution_intents_nonterminal_created` and the NOT IN queries must use this exact text.
 */
export const DECIBEL_TERMINAL_INTENT_STATUSES_SQL_V1 = `(${DECIBEL_TERMINAL_INTENT_STATUSES_V1.map(
  (status) => `'${status}'`,
).join(',')})`;

export function isDecibelTerminalIntentStatusV1(status: string): boolean {
  return (DECIBEL_TERMINAL_INTENT_STATUSES_V1 as readonly string[]).includes(status);
}

/**
 * An intent whose venue outcome is still being confirmed. ACKNOWLEDGED is not in this list:
 * a resting order stays ACKNOWLEDGED for its whole life. Telemetry adds it only while the
 * acknowledged order is not yet visible in the authenticated order list.
 */
export const DECIBEL_UNRESOLVED_INTENT_STATUSES_V1 = Object.freeze([
  'PREPARED',
  'SUBMITTING',
  'SUBMIT_UNKNOWN',
  'UNRESOLVABLE_ACK',
  'RECONCILING',
] as const satisfies readonly execution_intent_status_v1[]);

export function isDecibelUnresolvedIntentStatusV1(status: string): boolean {
  return (DECIBEL_UNRESOLVED_INTENT_STATUSES_V1 as readonly string[]).includes(status);
}

/** A session that owns the runtime: it has started and has not ended. */
export const DECIBEL_ACTIVE_SESSION_STATUSES_V1 = Object.freeze([
  'STARTING',
  'RUNNING',
  'STOPPING',
] as const);

export function isDecibelActiveSessionStatusV1(status: string): boolean {
  return (DECIBEL_ACTIVE_SESSION_STATUSES_V1 as readonly string[]).includes(status);
}
