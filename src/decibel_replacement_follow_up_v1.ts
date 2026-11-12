/**
 * Cadence for completing a precomputed cancel → place replacement.
 *
 * The orchestrator freezes the replacement plan (FrozenReprice) when it submits the
 * cancel. Without a follow-up, the place waited for the next 5 s poll and for REST
 * reads to show the cancel (median 16.6 s ENTRY / 18 s TP gap, journal 2026-11-12).
 * While a frozen plan is pending, the next cycle runs after a short delay instead.
 * Every cycle still performs fresh reads, reconciliation, decision and preflight: this
 * changes only when a cycle runs, never what it decides. The number of fast cycles per
 * plan is capped so a stuck plan falls back to the normal cadence.
 */
export const DECIBEL_REPLACEMENT_FOLLOW_UP_DELAY_MS_V1 = 750;
export const DECIBEL_REPLACEMENT_FOLLOW_UP_MAX_V1 = 20;

export type decibel_replacement_follow_up_state_v1 = Readonly<{
  decisionId: string | null;
  count: number;
}>;

export const DECIBEL_REPLACEMENT_FOLLOW_UP_IDLE_V1: decibel_replacement_follow_up_state_v1 =
  Object.freeze({ decisionId: null, count: 0 });

export function planDecibelReplacementFollowUpV1(
  previous: decibel_replacement_follow_up_state_v1,
  pendingDecisionId: string | null,
  options: Readonly<{ delayMs?: number; maximum?: number }> = {},
): Readonly<{ state: decibel_replacement_follow_up_state_v1; delayMs: number | null }> {
  const delayMs = options.delayMs ?? DECIBEL_REPLACEMENT_FOLLOW_UP_DELAY_MS_V1;
  const maximum = options.maximum ?? DECIBEL_REPLACEMENT_FOLLOW_UP_MAX_V1;
  if (pendingDecisionId === null)
    return Object.freeze({ state: DECIBEL_REPLACEMENT_FOLLOW_UP_IDLE_V1, delayMs: null });
  const count = previous.decisionId === pendingDecisionId ? previous.count + 1 : 1;
  const state = Object.freeze({ decisionId: pendingDecisionId, count });
  return Object.freeze({ state, delayMs: count > maximum ? null : delayMs });
}
