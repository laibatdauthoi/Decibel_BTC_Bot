# Effective Exposure And Readiness Audit

## Readiness

The source of the production flags is `decibel_runtime_supervisor_v1.getSnapshot`.
`run_decibel_production_web_v1` supplies that projection to the web telemetry mapper;
`main.tsx` previously printed the flags as READY P/A/M/E/X.

- P: scheduler has not stopped and supervisor phase is neither STOPPING nor ENDED.
  It is process health, not the persisted session status. An ENDED session may have P=true.
- A: AuthState is READY. Every getSnapshot rechecks the authenticated observation's
  maximum age. A failed refresh may preserve the last good snapshot only within that window.
- M: MarketDataState is READY. Every getSnapshot checks book age; expiration clears
  the execution snapshot and blocks execution. Market refresh is scheduled between
  250ms and the configured poll interval, constrained by the book freshness policy.
- E: EconomicEvidenceState is READY. setEconomicSnapshot validates numeric fields
  and provenance strings; explicit refresh failures clear evidence. This boolean is
  not an independent timestamp TTL or a guarantee every strategy candidate is economic.
- X: ExecutionState is READY: required domains including SessionState and a complete,
  fresh execution snapshot are available, with no reconciliation blocker or untradeable dust.
  Candidate admission, cooldowns, executor enablement, margin and venue preflight can
  still reject execution even when this domain flag is true.

The flags are booleans: initialization/unavailable domain states produce false,
not a third UNKNOWN value. The telemetry mapper also supports a legacy fallback
without supervisor input; presence of a snapshot alone there is not freshness proof.
Production supplies the supervisor projection instead. No gating was changed.

Telemetry updates at DECIBEL_PRODUCTION_WEB_REFRESH_MS (default 5000ms); fresh projections are also
read by authenticated refresh, execution cycles, session checks and HTTP diagnostics.
Authenticated snapshots use a 5000ms freshness window with refresh scheduled 2000ms before expiry.
Age transitions are evaluated when getSnapshot is called, rather than requiring a timer
for each boolean. Account and market refresh have their own supervisor-owned schedules.
Journal READY means the journal opened successfully; it is not an execution permission.
DEGRADED describes telemetry connectivity/evidence. BLOCKED describes a gate.
STOPPING/ENDED describe session lifecycle. They are not equivalent state machines.
PLACE uses all strategy/risk/freshness/preflight guards. CANCEL still requires exact
identity/reconciliation and mutation guards. Reduce-only unwind bypasses strategy volume
and new-exposure caps, retaining its own authenticated position/risk checks.

The abbreviated flags were removed from the footer only. Telemetry retains every flag,
domain state and reason. The footer keeps connection/degraded state and journal state,
and adds one readable check summary. A reported execution blocker takes precedence over
an all-true domain projection; the summary never changes safety decisions.

## Exposure

Original hard cap H = min(exchange notional ceiling, immutable maxPositionUsd,
capital * validated leverage * collateral fraction, maxLoss * leverage).
The collateral fraction is at most 0.5. For capital=8, maxLoss=2, leverage=40 and
maxPositionUsd=50, H=50. Its equality to target=50 was coincidental.
The previous UI separately recalculated H with a leverage fallback of 1.

For V2 only, let C be current absolute position notional, O the sum of all pending
order notionals, L validated leverage, T immutable session target, V authenticated
session executed volume, and F=min(venue available margin, max(0, capital-(C+O)/L)).
Let R=max(0,T-V-O), and B=max(0,maxLoss+min(0,session PnL)). Unknown PnL blocks new
exposure through the existing PnL evidence guard and uses zero loss headroom.

Effective cap = floor_to_lot_notional(min(H, T/2, C+O+R/2, C+O+F*L, B*L)).
For unlimited target mode, omit T/2 and the remaining-volume bound.
Half the remaining budget allocates for adding and subsequently closing new exposure;
it does not assert a guaranteed close price or redefine accumulated trading volume.
Pending exposure reserves both margin and execution budget. The aggregate projection
is deliberately conservative; side-specific quote sizing separately reserves same-side
orders. Minimum order requirements are applied by existing sizing/preflight, never by
rounding a small budget upward. Headroom=max(0,effective-C-O).

Configured H, effective cap, current exposure, pending exposure and headroom are separate
telemetry fields. Strategy sizing and authenticated execution preflight use effective;
the immutable H remains the existing hard risk ceiling and canonical unwind is unchanged.
A cap below current exposure forbids adding exposure; exact reduce-only orders and
CANCEL remain available. Legacy V1 accounting/caps retain their previous semantics.
The UI displays the authenticated active-session projection while a session is active.
Without an active session, Settings requests a read-only NEXT SESSION projection from
GET /api/operator-settings using the saved revision and optional capital/loss/target draft
query inputs. It uses the same V2 calculator, current authenticated margin, position and
orders, validated leverage, instrument lot size and fresh supervisor account/market state.
NEXT SESSION starts its own accounting at zero; existing exposure is still reserved.
Missing evidence or a disconnected/degraded frontend displays UNKNOWN. Draft preview
does not write settings or alter an active-session cap.
Saved NEXT SESSION settings affect only a newly created immutable snapshot. Restart
reconstructs the same calculation from that snapshot and replayed V2 fills.

## Read-Only Production Evidence

The latest session journal record during this audit was
session-1792940850577-e1a7859a-9d2c-4aff-8ba2-9ce57b37aba2, revision 2, V2,
ENDED, executed volume 49.91124, capital 8, maxLoss 2, target 50, maxPosition 50.
The latest decision recorded inventory zero and a 50 USD hard cap.
The local telemetry endpoint refused connection; no live readiness or current venue
state is claimed. SQLite was opened read-only. No production process was restarted.

## Authenticated Margin Publication Defect

Account refresh previously validated cross_available_to_trade but omitted it from
its published account state, allowing reconstructed execution snapshots to retain
an older margin value. Account-state publication now carries the authoritative
available margin into every rebuilt/read snapshot. Missing publication uses an
invalid evidence sentinel and is rejected by sizing/session limits; it never
falls back to stale margin. Leverage remains the existing configured/venue minimum.

## Dashboard Presentation And Navigation

Footer typography is uppercase through CSS only; readiness decisions are unchanged.
The tab query (`tab=overview|activity|settings`) is the source of truth, with pushState
for tab clicks and popstate for Back/Forward. Other query parameters and fragments
are preserved. Missing/invalid tab selects Overview. Settings remains mounted while
hidden so navigation cannot discard a draft or implicitly save it; Settings-specific
scroll CSS applies only when that page is visible.
