# ENTRY Cancel And Replacement — PID 22692

## Evidence And Scope

Initial workspace source fingerprint: `b008d456e4352b99`, 118 covered files.
HEAD: `471e9ef686ba26f8b48a13c26f20841b9139ef40`, branch
`chore/production-cleanup-v1`. The workspace already contained extensive tracked
and untracked production changes; HEAD is not the source build fingerprint.
`data/production_runtime/stdout.log` independently identifies PID 22692 starting
with build `b008d456e4352b99` at `1794038981144`.

The execution database was opened with `readonly: true`. A filtered extraction is
in `tests/fixtures/entry_priority_22692_v1.json`: 29 observations, including 24
observations of the target SELL, relevant intents, and cancellation provenance.
No production Settings, session, or journal was edited. No deployment, process
restart, network order submission, or real cancellation was performed.

## Root Cause And Historical Path

For SELL `170141599249866108650159253122449408000`, cycle 420881 at
`1794039667506` observed bid/ask `76023.2/76023.8`. Resting price was `76043.2`,
residual `0.00047 BTC`, and confirmed OPEN age `47205 ms`. Gross edge was
`2.59130400468238 bps`; the old remaining-cost calculation was
`2.6118065475884036 bps`, producing `-$0.00007567600000136891`.

That calculation included the admission safety buffer of `1 bps`, worth
`$0.0035740304`. Placement gas was already correctly excluded as sunk; this was
not a floating-point epsilon problem or double-counted placement gas. Actual
remaining maker fee plus the existing one-transaction gas reserve is
`1.6118065475884036 bps`. Continuation surplus is `+$0.0034983544`.

The strategy returned `WOULD_CANCEL`, reason
`ECONOMIC_INVALID:RESTING_ENTRY_FUTURE_EDGE_INSUFFICIENT`, with `desired: null`.
This independent economics cancellation did not enter `FrozenReprice`.
Authenticated OPEN observations continued through `1794039673707`; exact terminal
history proved CANCELLED at `1794039674428`. A separately recalculated SELL PLACE
at `76044.3` was created at `1794039675609`, 1181 ms after that terminal evidence.
There was no candidate carried through that cancellation and no execution-priority
proof for moving the SELL $1.1 farther away.

For BUY `170141599249866108779798143563657641984`, resting price `75984.8`, the
same cycle offered `76002.7`. The old replacement function always returned KEEP.
Moving closer reduces static payoff conditional on filling, so using that payoff
delta as a gate could never implement the requested execution-first policy.
Neither fill probability nor expected value was available.

## Rules After The Repair

- PLACE admission retains maker fee, two transaction reserves, and the configured
  safety buffer. TP pricing and hard risk limits are unchanged.
- OPEN continuation excludes sunk placement gas and the admission-only safety
  buffer. Unknown costs reconcile; a negative surplus after remaining maker fee
  and gas still independently cancels. No arbitrary epsilon was introduced.
- Strategic ENTRY replacement requires an admitted, tick-aligned, passive candidate
  on the same side, market and strategy. Comparison uses the common executable
  residual. BUY must move higher; SELL must move lower. Observed price improvement
  times comparable quantity must strictly exceed cancel plus placement gas.
  This is a price-priority hurdle, not expected PnL or a fill-probability estimate.
- The live layer verifies the exact current authenticated order, fresh book,
  absence of unresolved/pending cancellation, ownership at commit, and the existing
  authoritative candidate/risk gate before canceling.
- Existing finality/reconciliation remains authoritative. After terminal cancel,
  ENTRY uses the newly evaluated candidate, capped by the committed quantity and
  original residual. Changed inventory aborts the frozen replacement. The normal
  placement preflight still checks fresh account/book, admission and post-only.
- Restart relies on durable lifecycle reconciliation; it does not reconstruct a
  stale frozen quote. After terminal evidence normal planning may choose either
  eligible side. Protective TP replacement retains its existing behavior.

For the recorded BUY, price-priority improvement is `$0.008413` versus replacement
gas `$0.0007992`. It is REPLACE when live freshness, ownership and risk gates pass.
For `0.00047 BTC`, the cost hurdle corresponds to about `$1.70043` of price
movement, derived from actual gas and quantity rather than a fixed tick threshold.
Three ticks at `$0.1` do not pass this hurdle.

## Replay And Verification

The 24 recorded SELL observations produce one old economic CANCEL and zero new
economic CANCELs or strategic replacements. Within the identified historical
cancel/recreate episode, incremental CANCEL/PLACE is `1/1` before and `0/0` after;
the original opening PLACE is excluded. This does not predict later market events.

PID 9220 planner replay applies two hypothetical eligible replacements, then
settles across 100 observations without more replacement proposals. These are
planner actions with simulated updated orders, not venue submission counts.
The new live harness uses only fake executors and a temporary SQLite journal:
normal replacement has one CANCEL and one PLACE; five pending-finality cycles
have one CANCEL and zero PLACE; pending restart repeats neither mutation. A
synthetic authenticated partial fill of `0.00016 BTC` changes inventory and
prevents the frozen ENTRY from reopening the original size; any resulting PLACE
must be reduce-only and no larger than inventory.

Focused regression: 184 passed, 309 skipped across the two selected suites.
An additional run selecting all requested PID names plus PID 22692: 13 passed.
Authoritative reconciliation and HTTP recovery: 17 passed. Typecheck, build,
changed-file ESLint and changed-file Prettier checks passed.

Repository-wide checks are not all green. Format check reports four untouched
files: `.tmp_conflict_readonly.cjs`, `src/readonly_exit_architecture_tmp.ts`,
`tests/fixtures/entry_cost_19884_v1.json`, and
`tests/fixtures/entry_simplification_36080_v1.json`. ESLint reports project-service
configuration errors for the existing `.tmp_conflict_readonly.cjs` and
`.tmp_exact_evidence.ts`. Full tests also report authenticated metadata/recovery
fixture failures and Chromium sandbox failures outside this patch. A prior full
run under concurrent verification timed out the 1000-cycle test; the focused
regressions passed. The final full run had 1109 passed and 7 failed across 31 files; all 484 orchestrator tests passed, including the 1000-cycle test. The 7 remaining failures are the 3 recovery fixtures, 2 metadata-boundary fixtures, and 2 Chromium tests described above.

## Limits

No live fill rate, realized PnL, queue retention, gas realization, or deployment
behavior is claimed. Maker-only quotes that satisfy cost admission cannot guarantee
frequent fills. The midpoint surplus is conditional economics, not a promise of
realized profit. Risk limits, leverage, TP coverage, funding exclusion and defensive
exit policy were not relaxed.
