# Session Trading Volume Target V2

New sessions persist `target_semantics_version=2` alongside their immutable config
revision and config JSON. Their target is the USD sum of every authenticated
execution owned by that session: maker + taker, BUY + SELL, opening + closing,
including reduce-only and IOC fills during STOPPING. Fees, gas, submitted order
notional, rejected orders and unfilled quantities are excluded.

`makerVolumeUsd` and `takerVolumeUsd` remain separate metrics;
`totalExecutedVolumeUsd = makerVolumeUsd + takerVolumeUsd`.

## Compatibility and deployment

The existing REV 2 settings file and `targetMakerVolumeUsd` wire/storage key are
retained as the numeric target alias; the UI calls this Target Trading Volume.
Settings revisions and saved numeric values are not rewritten.

On normal application startup, the additive session schema migration assigns
version 1 to pre-existing records, including ACTIVE and historical sessions.
Version 1 keeps its original maker-only target semantics. New records explicitly
select version 2. There is no active-session semantics migration or reset API.
The UI labels legacy maker-only sessions. Missing historical total/taker evidence
remains unknown rather than inferred from an old maker-only summary.

Deploy the backend and dashboard together. Existing sessions must finish under
their captured version; a new session uses V2. No manual production journal edit
or recovery command is required.

## Accounting and stop lifecycle

V2 execution keys include the venue order and fill identity. Shared trade IDs on
different orders do not collide. Shared-ID fragments are retained individually;
exact duplicate fragments are removed using their authenticated payload identity
(including action and transaction version when supplied). Later fragments add
only previously unseen executions. Lagging fragment subsets do not reduce durable
volume; conflicting replacement evidence fails closed.

Execution preflight refreshes authenticated data and evaluates the target using
the immutable session version. Crossing the target rejects strategic PLACE and
persists canonical unwind. CANCEL and required reduce-only IOC remain permitted.
Fills received during STOPPING continue to count. The existing runtime completes
unwind only after authenticated position/order reconciliation, then persists final
maker, taker and total accounting and transitions to ENDED. Target crossing alone
does not stop the supervisor.
