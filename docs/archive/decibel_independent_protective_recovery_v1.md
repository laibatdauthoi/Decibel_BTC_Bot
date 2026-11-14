# Independent Protective Recovery — 2026-11-05

Implemented in the normal workspace. This supersedes the protective-execution
limitation recorded in `decibel_historical_cancel_startup_recovery_v1.md`.
Nothing was deployed or activated on mainnet. Fake-venue verification is not
evidence of mainnet operational readiness.

## Root Cause

Four dependencies incorrectly coupled protection to exposure readiness:

1. web-v1 startup returned before recovering the existing session runtime when
   historical journal reconciliation failed.
2. The orchestrator processed unresolved history before selecting any action.
3. Trading admission, lifecycle conflict checks, same-side journal ownership and
   known-live-order counting treated historical cancellation work as current
   execution uncertainty without testing its relationship to the candidate.
4. Session projection awaited entry-capacity production before reading current
   account state, even for a protective-only runtime.

The scheduler's global recovery dependency remains BLOCKED while independent
protective cycles operate. Neither ACTIVE nor RECOVERY_BLOCKED is used to infer
position coverage or permission for new exposure.

## Architectural Change

`recoverProtectiveStartup` recovers only an already existing session. It reuses
the controller's exclusive transition, prior-process absence checks, recovery
lease, persisted owner claim and takeover-pause rules. It does not create a new
session or change Settings. A runtime without the protective-admission contract
cannot activate. An owned runtime cannot promote itself to ordinary trading
until normal orphan/recovery validation succeeds.

The real recurring scheduler continues protective work and retries historical
recovery independently. A recovery retry does not falsely mark an already
running protective loop inactive. Historical failures detected in a running
orchestrator also restrict it to protection. The web actor preserves the exact
historical blocker separately from current action blockers.

`assessDecibelProtectiveRecoveryV1` is recomputed from authenticated account,
history and order snapshots. It requires account/market identity, fresh batch
provenance, inventory direction, market rules, executable BBO, exclusive activity,
unique current order identities and exact durable current-order ownership.

A historical CANCEL is independent only when its target and client identity are
absent from current orders, unique PLACE lineage agrees, and the original PLACE
has exact authoritative terminal provenance predating the current account read.
Terminal historical identity conflicts can be scoped out only with exact final
provenance and disjoint current identifiers. **Every** active conflict is checked;
an earlier historical conflict cannot conceal a later current conflict.

The scope is not finality for the historical cancellation. Historical rows and
conflicts remain unresolved until their existing authoritative reconciler proves
their own final state. FLAT, an empty order list, a local terminal label or an ACK
is not substituted for finality.

ENTRY, DCA, exposure-increasing replacement and cancellation-first transitions
cannot pass protective admission. A new order must be PostOnly, reduce-only,
correctly directed and bounded by current authenticated inventory. The existing
planner, TP economics, canonical risk trigger, final maker gate, size/lot/tick
validation, mutation budget and executor contract still run.

Immediately before journal admission, the source's synchronous authorization
guard rechecks session ownership and the protective evidence deadline. The
SQLite immediate claim transaction checks all active identity conflicts and all
outstanding intents across both sides against the validated historical scope.
A newly appearing opposite-side unknown submission invalidates admission.
Historical cancellations are excluded from the live-order count only through
this validated scope; limits themselves are unchanged.

Current protective OPEN, partial-fill and terminal/fill evidence can reconcile
independently. Full fill requires complete authenticated fill quantities and
transaction versions. Missing evidence remains unresolved; ACK-only success
never establishes coverage. Unknown submission outcomes remain unknown across
restart and are never blindly retried.

Protective projection does not await entry-capacity producers or reuse stale
entry-capacity certificates. It retains current account data and venue rules.
Missing evidence required by the existing protective risk policy still blocks
execution. No leverage limit, Max Loss, loss trigger or maker-only rule changed.

## SDK And Venue Investigation

The installed SDK is pinned to `@decibeltrade/sdk` 0.7.0. Its `write.js` exposes
`updateOrder`, which submits `dex_accounts_entry::update_order_to_subaccount`,
and separate position TP/SL update helpers. The production write adapter exposes
ordinary `placeOrder` and `cancelOrder`; it has no verified replacement adapter.

The [official Write SDK reference](https://docs.decibel.trade/typescript-sdk/write-sdk)
documents `updateOrder`, including reduce-only and time-in-force parameters.
It does not establish preservation of an ordinary resting TP when an updated
PostOnly order is rejected. A single submitted transaction is not, by itself,
proof of the required rejection/rollback behavior or identity mapping.

[Bulk-order documentation](https://docs.decibel.trade/developer-hub/guides/bulk-orders)
does describe atomic replacement, but explicitly limits its effect to bulk
orders; it does not replace regular `placeOrder` orders. Position TP update
helpers are a separate [position TP interface](https://docs.decibel.trade/developer-hub/on-chain/position-management/update-tp-order).

The [ordinary order interface](https://docs.decibel.trade/developer-hub/on-chain/order-management/place-order)
documents reduce-only and PostOnly execution. It does not establish aggregate
multiple-reduction admission, reservation behavior or safe additive capacity.
No such capability was inferred from the SDK's boolean reduce-only flag.

Consequently, an existing valid TP is preserved. Partially uncovered inventory
remains **UNPROTECTED** for the exact residual, with
`TP_COVERAGE_REPAIR_REQUIRES_ATOMIC_OR_VERIFIED_ADD` or
`PROTECTIVE_REPAIR_REQUIRES_VERIFIED_ADDITIVE_OR_ATOMIC_SUPPORT` reported.
No cancel-first fallback or speculative additive order is used. Canonical maker
defensive placement can execute when no existing exit occupies reduction
capacity; a defensive replacement needing unverified venue semantics remains
blocked. No taker override was added.

The [open-orders API](https://docs.decibel.trade/api-reference/account/get-accounts-open-orders)
is paginated. The HTTP reader now rejects inconsistent/truncated totals, a full
page without a known total, and duplicate identities instead of presenting the
first page as complete account evidence. It does not claim that multiple offset
pages form an atomic account snapshot.

## Isolated Replays

All execution tests use temporary journals and a deterministic fake venue behind
the real production executor adapter. The real runtime supervisor scheduler,
orchestrator, lifecycle, journal claim, final maker gate and executor execute.
An integration replay also uses startup convergence, the real session controller
and its persisted ownership claim. No production journal is opened for writing.

| Case | Verified Behavior |
| --- | --- |
| Historical CANCEL unresolved, FLAT | No order; new exposure stays blocked |
| LONG with valid full TP | Existing authenticated TP preserved and monitored |
| LONG or SHORT partially covered | Existing TP preserved; residual stays unprotected; zero cancellations |
| LONG or SHORT fully uncovered | One validated maker reduce-only order, followed by authoritative OPEN confirmation |
| Historical terminal conflict unrelated to current inventory | Protection can proceed; conflict is not cleared |
| Current conflict behind historical conflict | No submission; both conflicts remain active |
| Unknown protective submission | No retry across restart; exact OPEN evidence restores ownership |
| ACK without authoritative OPEN | Zero confirmed coverage; no duplicate; later exact OPEN reconciles |
| Position change before submission | Final position comparison rejects before venue mutation |
| Position change during venue handling | Fake venue refuses execution; generic SDK failure remains unknown without authoritative finality |
| Venue outage, stale inventory, wrong account | No protective mutation |
| Existing canonical margin trigger | Maker reduction can execute with negative TP PnL, without a new loss threshold |
| Opposite-side submission appears after validation | Immediate journal claim rejects the stale scope |
| Session ownership lost at admission | No submission |
| Prior owner still alive | No takeover or activation |
| Runtime cannot enforce protective-only mode | No activation |
| Entry-capacity producer unavailable | Protective projection reads fresh account state; ordinary projection still blocks |
| Repeated recurring scheduler cycles | One order; no duplicate ENTRY, TP or cancellation |

Crash/restart coverage includes PREPARED, SUBMITTING, SUBMIT_UNKNOWN,
ACKNOWLEDGED, UNRESOLVABLE_ACK, RECONCILING, authoritative APPLIED and
CANCELLED_EXTERNALLY commits, and preflight REJECTED. The unchanged existing
recovery rule can drop a PREPARED intent only when no attempt or outcome was
persisted. Submitted/unknown orders are not resubmitted. Authoritative terminal
and fill commits survive restart.

Reproduce the targeted orchestration tests with:

```powershell
npx.cmd vitest run --maxWorkers=1 tests/decibel_production_live_orchestrator_v1.test.ts -t 'Independent protective recovery through real scheduler'
```

## Controls, Startup And Live State

The existing status/warning area separately shows execution-loop operation,
new-entry readiness, authenticated position, confirmed exit quantity, uncovered
inventory, protective availability, the current protective blocker and historical
recovery. The control-loop label follows the loop itself rather than requiring
the session's summary state to be RUNNING. No extra session buttons were added.

The exact old `npm.cmd run decibel:production` command was verified with a
temporary Node preload intercepting only the final live-launcher spawn. Native
dependency checks and the real dashboard build ran, and the expected launcher
path was verified. The live launcher was not started and no socket was bound.
The existing `npm.cmd run decibel:production -- --check` path also passed with
Node v22.23.2. The startup command and production bindings were not changed.

Hashes of `.env`, operator Settings, persisted execution mode, production
execution journal and production session database matched before and after that
verification. Read-only port inspection found no listener on 4173; no process
was stopped or restarted by this work.

Final verification: 1,090 full-suite tests pass (1,073 production-core tests
and 17 authoritative/HTTP recovery tests). The 30 targeted protective tests
also pass. Typecheck, both builds, and lint/format checks on every changed file
pass. Repository-wide lint and formatting retain the pre-existing scratch
file failures: `.tmp_conflict_readonly.cjs`, `.tmp_exact_evidence.ts` and
`src/readonly_exit_architecture_tmp.ts`. No lint rules or checks were disabled.

No live order, session, Settings, deployment or production-journal mutation was
performed. Mainnet operation of the changed protective path remains unverified.
