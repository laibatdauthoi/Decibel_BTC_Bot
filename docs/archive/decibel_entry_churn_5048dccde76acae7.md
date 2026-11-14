# Entry churn: build 5048dccde76acae7

Read-only reconstruction of PID 11564 from `data/production_runtime/stdout.log`
and SQLite opened with `readonly: true, fileMustExist: true`. Times below are
Unix milliseconds. No production journal, order, setting or process was changed.

Session: `session-1793100265767-be73b997-90bd-4492-91c3-ebaabaf7d6ae`.

## Exact lifecycle

| Event | Timestamp | Evidence |
| --- | --- | --- |
| SELL PLACE | 1793100271613 | intent-00fc99dd53b9bfdbb407215f; client d1s00fc99dd53b9bfdbb407215fe7191; venue 170141599249866108046354937692668559360; 0.00073 BTC at 79865.8; reduce-only false |
| SELL SDK ACK | 1793100275621 | PLACE_ACCEPTED; transaction 0x136eb576cca629619832630648c06b17530778eb4a5058631b3d93d774d06ca9 |
| Unresolved ACK | 1793100282152, 1793100282553, 1793100283617 | Lifecycle blockers for that exact intent; SDK success was not sufficient OPEN evidence |
| SELL authenticated OPEN | 1793100285181 | Exact client/venue identity, remaining 0.00073; uncertainty subsequently recovered |
| BUY PLACE / SDK ACK | 1793100290711 / 1793100294053 | intent-f14d42ae83c5b6ee0142ca5f; client d1bf14d42ae83c5b6ee0142ca5fb79b6; venue 170141599249866110790700987355708260352; 0.00073 at 79711.3; reduce-only false |
| BUY authenticated OPEN | 1793100302909 | Remaining 0.00073 |
| 2397 ms cancel proposal | 1793100305306 | Authenticated position 0; refreshed sizing maximum 0, CAPACITY_VENUE_MARGIN_RULES_STALE; selected action BLOCKED, NO_NEW_QUOTE_HEADROOM, no executor invocation. Old tentative RISK_INVALID reason leaked into diagnostics; this was not a submitted cancel |
| SELL reprice cancel | 1793100317297 | intent-a3d589f86a9d66889cf3650a; age 32116 ms; 79865.8 to 79852.5; 133 ticks; desired quantity also fell to 0.00068 |
| SELL SDK cancel / terminal proof | 1793100320395 / 1793100329871 | SDK CANCEL_CONFIRMED first; canonical terminal provenance later. Parent PLACE terminal proof at 1793100328590 |
| Replacement SELL PLACE | 1793100334741 | intent-6e7b0acf773ce3a9a0c99e85; venue 170141594179263707301904221838717747200; 0.00068 at 79852.5 |
| BUY risk cancel | 1793100348554 | intent-ccbb3e4389fe7e2eb6c2fcf9; age 45645 ms; position still 0; risk state RISK_REDUCTION, trigger EXPLICIT_RISK_REDUCTION_REQUEST, capacity blocker CAPACITY_VENUE_MARGIN_RULES_STALE |
| BUY SDK cancel / terminal proof | 1793100352081 / 1793100362474 | Exact venue identity retained; no matching authenticated fills for either original opening intent |

The available evidence establishes indexing delay, not a failed or duplicate
submission. It does not establish why the venue/indexer delayed publishing OPEN.
Current production state has not been changed or certified by this offline fix.

## Defects and correction

Both initial and refreshed sizing used `Boolean(capacityBlocker)` as an explicit
risk-reduction request. A stale venue-rule observation therefore converted safe
FLAT entries into orders requiring reduce-only. Pending orders remained pending;
there is no evidence here of treating them as authenticated inventory fills.

Missing capacity now freezes entry admission/repricing and requests reconciliation.
Actual fresh margin deficit, explicit risk reduction, proven position breaches,
cross-flat protection and canonical session unwind retain their safety paths.
FLAT with a zero unavailable cap is not classified as a position-limit breach.
A refreshed failed-closed plan clears the older tentative action and uses the
refreshed evidence version in diagnostics.

The old entry reprice predicate was age plus favorable tick displacement, without
a comparative economic test. Here 133 ticks at 0.1 USD is 13.30 USD/BTC, or
0.009709 USD for 0.00073 BTC (1.6653 bps). The original one-leg 1.5 bps maker fee
was 0.0087453051 USD; it is not an extra fee caused by canceling an unfilled order.
Historical gas estimate was 0.0004538268 USD per operation. Neither tick distance
nor those figures prove increased expected profit or compensate measured
cancel/replacement latency and queue loss. At selection the book was already
3440 ms old; final runtime logging occurred much later.

Entry replacement now compares same-quantity resting/candidate net edges at the
same market midpoint with existing candidate-specific P95 observations, maker
fees and safety reserve. Extra cancel/place gas and the existing adverse reserve
for the unquoted interval are deducted. No assumed queue/fill-rate gain is
credited. Missing comparative observations preserve the order; a smaller new
admission size alone does not prove the resting order unsafe. This is a
conservative economic estimate, not measured fill probability or a bound on
future losses. The existing regime age/tick parameters are unchanged; their
existing qualification window requires continuous fresh beneficial observations.
No new cooldown or numerical threshold is introduced. PostOnly-cross safety
cancellation remains unchanged.

Before strategic cancellation, freshness is checked again after direct target
revalidation. Exact cancel/fill ACK, fresh inventory, reduce-only and anti-flip
checks still precede replacement. Entry and TP economics remain separate.

For unresolved ACKs, the existing direct authenticated verifier can supply exact
OPEN evidence before the unknown latch. Identity, side, market, price, remaining
quantity and lots are checked; OPEN status/provenance is published atomically.
SDK success, absence and FLAT do not release ownership or prove terminal status.
Missing evidence remains fail-closed without resubmission.

Per-order decision diagnostics are written to the existing decision snapshots and
runtime log, including plan, risk disposition, evidence timestamps/hash, economic
comparison and SDK-versus-authoritative ACK provenance.

## Verification and deployment boundary

Replay fixtures use injected executors and isolated SQLite journals. They are
regressions derived from the incident, not a claim of replaying unavailable raw
venue responses. Production deployment/restart and live-order validation remain
outside this change. Existing active orders were not canceled or replaced.
