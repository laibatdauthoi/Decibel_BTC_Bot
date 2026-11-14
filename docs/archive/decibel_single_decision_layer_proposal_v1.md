# Proposal: one decision layer for the production bot

**Status:** proposal, not implemented. Needs user approval before any code change.
**Date:** 2026-11-12
**Branch at writing:** `chore/production-cleanup-v1` (after commit `274fa94`)

## 1. Problem

Every production cycle runs **two decision layers**, one after the other:

1. **Old planner** — `evaluateDecibelAuthenticatedPassiveRecyclingV1` in
   `decibel_authenticated_passive_recycling_orchestrator_v1.ts` (2,186 lines). It was written
   for two-sided passive market making. It decides the operating state, prices bid/ask
   candidates and returns `desiredBid`, `desiredAsk` and `actions`.
2. **New gate** — `evaluateTradingDecision` in `decibel_trading_decision_v1.ts`. It receives
   the old planner's output (`session.evaluation`) and answers TRADE / WAIT / STOP.

The current strategy (ENTRY maker → reduce-only TP → session end) is expressed _through_
the old two-sided planner, not by the new layer. The orchestrator
(`decibel_production_live_orchestrator_v1.ts`, 5,353 lines) holds the glue between them.

Evidence (verified in source on 2026-11-12):

| Fact                                                                                                                                                                                                                                         | Where                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| The old planner is called up to **3 times per cycle** (baseline, after joint budget caps, after the flat-pair cohort is set).                                                                                                                | orchestrator `evaluateWithFlatPairCohort`    |
| About **30 branches** in the orchestrator test `evaluation.operatingState` (`RISK_REDUCTION`, `SESSION_UNWIND`, `DUST_BELOW_MIN_SIZE`).                                                                                                       | orchestrator, e.g. lines 913, 1330, 3338     |
| The new gate reads `desiredBid/desiredAsk`, `actions`, `bid/askEligibilityReason`, `operatingState`, `blockers` and lifecycle costs from the old planner.                                                                                     | `decibel_trading_decision_v1.ts` line 136 on |
| Ladder features are configured but dead: `maximumLadderLevelsPerSide` is hard-coded to `1`, so `ladderLevelAllocations: [0.5, 0.3, 0.2]` and `DECIBEL_SMART_LADDER_MAX_LEVELS_PER_SIDE` have no effect.                                     | orchestrator lines 573, 1871, 1881           |
| A "flat pair cohort" (two-sided quoting concept) is still built, then reduced to one side by joint caps.                                                                                                                                     | orchestrator lines 2525–2610                 |
| The old planner treats any active venue TP/SL order as `STRATEGY_ACTIVITY_EXCLUSIVITY_LOST`. A venue catastrophe stop (open work item 2) would block the bot unless this rule changes.                                                          | recycling orchestrator, exclusivity check    |

Why this matters for the user's goal (profit first, otherwise lose as little as possible):

- Two layers that must agree create states where neither can act. This is a likely source of
  self-inflicted blocks such as `SESSION_UNWIND_COMPLETION_CONFLICT` (6 sessions). Not proven.
- Each strategy change has to be threaded through both layers and the glue, which is slow and
  error-prone.
- Reasons shown to the operator come from two vocabularies, which makes "why is the bot not
  trading?" hard to answer.

## 2. Target design

One pure pipeline per cycle:

```text
snapshot ──► assessSnapshotIntegrity ──► derivePhase ──► plan (entry | tp | unwind) ──► evaluateTradingDecision ──► execution
             (hard blockers)            (FLAT, ENTRY_OPEN,      (pure, one order       (single authority:
                                         PROTECTED, UNWIND,       at most per side)      TRADE / WAIT / STOP)
                                         DUST, HALTED)
```

- **`assessDecibelSnapshotIntegrityV1`** (new, pure): the hard blockers the old planner checks
  today — account scope, network, market, metadata, market halted, invalid/crossed BBO, stale
  data, unproven inventory direction, persistence, unresolved plans, external or manual activity.
  Moved as-is, with one planned change: an order that is the bot's own registered catastrophe
  stop is not "exclusivity lost".
- **`deriveDecibelSessionPhaseV1`** (new, pure): replaces `operatingState`. Phases match the
  documented lifecycle: `FLAT`, `ENTRY_OPEN`, `PROTECTED` (TP resting), `UNWIND` (target
  reached, Max Loss, operator END), `DUST`, `HALTED`.
- **Planners** (pure, one file each):
  - `planDecibelEntryOrderV1` — one PostOnly order. Size from `decibel_entry_size_v1.ts`,
    price from the existing lifecycle cost equation, bounded by the BBO. No ladder, no flat pair,
    no inventory skew (inventory is zero when entering).
  - `planDecibelTPOrderV1` — wraps the existing exit economics / patient TP logic that the
    orchestrator already passes to the old planner as `constructReducingCandidate`.
  - `planDecibelUnwindOrderV1` — canonical reduce-only unwind (today: IOC when
    `SESSION_UNWIND`).
- **`evaluateTradingDecision`** takes the plan instead of `evaluation`. It stays the only place
  that says TRADE / WAIT / STOP, and keeps the stress-loss gate, Max Loss and evidence timeout
  unchanged.

Expected removals once complete (approximate):

| Item                                                                                                           | Lines              |
| -------------------------------------------------------------------------------------------------------------- | ------------------ |
| `decibel_authenticated_passive_recycling_orchestrator_v1.ts` (keep only moved helpers)                         | ~2,000             |
| `decibel_passive_volume_recycling_v1.ts`, `decibel_quote_engine_v1.ts`, `decibel_inventory_controller_v1.ts`   | ~900               |
| `decibel_fair_price_engine_v1.ts` (only the old planner uses it)                                               | ~230               |
| Orchestrator glue: triple evaluation, joint caps, flat-pair cohort, `operatingState` branches                  | several hundred    |
| DCA (`decibel_dca_opportunity_v1.ts` and its branches) — **done separately on 2026-11-12** | ~250 + branches |

## 3. What must be preserved

All invariants in `PROJECT_HANDOVER_2026_11_12.md` §5 and `AGENTS.md`, in particular:

- every order passes through `evaluateTradingDecision` and the final submission preflight;
- reduce-only on every closing order; no tight per-position stop-loss;
- stress-loss admission and session Max Loss unchanged;
- no cancel-then-place TP replacement; patient TP anchor persisted in the CANCEL intent;
- START idempotent; no order retry unless duplicates are impossible;
- no timers, cooldowns or fabricated fill probabilities in entry/TP policy.

Hidden behaviours in the old planner that must be found and either ported or consciously
dropped (each gets a test before the switch): minimum-notional dead zone, dust handling,
reusable open-order margin, target-volume baseline, eligibility reasons used by the dashboard.

## 4. Migration plan

Each step is one commit, passes the full gate (format, lint, typecheck, test, build) and keeps
live behaviour unchanged until step 4. The bot stays stopped while steps 1–5 are in progress.

1. **Move shared helpers out** of the recycling module (pure move, no logic change):
   `calculateDecibelExitCoverageV1`, `supportsDecibelMultipleReductionsV1`,
   `isDecibelPassiveRecyclingClientOrderIdV1`, `decibel_authenticated_strategy_order_v1`.
2. **Extract `assessDecibelSnapshotIntegrityV1`**; the old planner calls it. No behaviour change.
3. **Add phase + planners in shadow.** The orchestrator computes the new plan next to the old one
   and records divergences in telemetry only. Add a parity test that runs both on the existing
   orchestrator fixtures and fails on any unexplained difference.
4. **Switch.** `evaluateTradingDecision` consumes the new plan; the old planner is no longer
   called. Before any live session: a dry-run session (needs the user to set
   `DECIBEL_EXECUTOR_DRY_RUN=true` in `.env`; Claude does not edit `.env`).
5. **Delete** the old planner, its helpers, the flat-pair cohort, joint caps, dead ladder config,
   and the tests that only cover them.
6. **Split the orchestrator** into cycle/state, intent/journal glue and telemetry projection.
   Pure moves.

Steps 1–2 are low risk and useful on their own. Steps 3–5 are the real change.

## 5. Decisions needed from the user

1. ~~Remove DCA entirely?~~ **Decided 2026-11-12: yes, done.** Position growth is blocked unconditionally
   (`POSITION_GROWTH_DISABLED`); fill-history reconciliation moved to `decibel_entry_cycle_v1.ts`.
2. **Drop two-sided quoting for good?** Recommended: yes. Production already places one ENTRY
   side at a time.
3. **Dry-run validation before going live again** (step 4) — requires the user to change `.env`.
4. **Order of work:** this refactor first, or review the 6 BLOCKED sessions first. The bot is
   stopped, so either order is safe; the BLOCKED review may reveal behaviour step 3 must preserve.

## 6. Risks

- The orchestrator test file (18k lines) is coupled to the old evaluation shape. Many tests will
  need rewriting in step 5; the parity test in step 3 is the safety net.
- A behaviour the old planner provides silently may be lost. Mitigation: shadow divergence
  telemetry, parity test, dry run.
- Large diff on code that trades real funds. Mitigation: small commits, bot stopped, no live
  session until the dry run passes.
