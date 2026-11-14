# Practical Capacity Implementation And Remaining Gate

## Implemented

Production isolated HTTP reader/worker now have a separate selected-leverage read
using BTC market scope and `include_deleted=true`, preserving open-position reads
with `include_deleted=false`. Account and exact market identity, uniqueness,
leverage and margin mode are validated. No market/UI default is substituted.
Per-product authenticated fee reads validate account identity and retain maker,
taker, tier, referral discount, source and receipt timestamp.

Live-state source refreshes these inputs with the authenticated account, coalesces
concurrent requests and reuses fresh values only within the existing freshness
window. Read failure clears the inputs. A position/settings mismatch, isolated
mode, missing or stale inputs prevents the practical projection from qualifying.
Fresh authenticated fees are included separately from older economic artifacts,
with conservative calculator floors preserved. Full metadata is retained in backend
diagnostics; no debug UI was added.

The actual isolated production worker was checked READ-ONLY at
`1792978844203` (2026-10-26 01:40:44.203 UTC): FLAT leverage 40, cross margin,
maker 1.5 bps, taker 4.5 bps, tier 0, referral discount 0, equity/free margin
USD 10.222805, positions empty and open orders zero. This observation is not
perpetually fresh and was not written to production state.

## Shared Calculator And Disabled Live Branch

Existing session-limit derivation accepts practical inputs. NEXT SESSION
executable projection and fresh ACTIVE preflight supply the same source data;
ACTIVE uses immutable session Capital/Max Loss, existing pending/inflight
reservation and current authenticated fills. Existing quote sizing already consumes
the resulting exposure limits, reserves remaining V2 volume and floors to lot.

`DECIBEL_PRACTICAL_CAPACITY_LIVE_POLICY_ENABLED = false` is a code-level gate,
with no ENV/API override. Therefore executable consumers continue using the existing
live evidence requirements. Preview inputs alone cannot enable orders. Existing
verified-certificate behavior is retained; no new certificate/calculator is added.
The separately labeled NEXT SESSION estimate uses the recovered read-only inputs.

Turning that gate on is NOT sufficient by itself: current mandatory venue
margin/liquidation verification, canonical reconciliation and policy approval must
first be resolved. Parameters requiring explicit live approval remain: modeled
exit horizon 30 seconds; adverse move max(100 bps, twice recent range); fee floor
10 bps per leg versus actual rates; slippage allowance/depth band 25 bps; adverse
selection floor 8 bps or higher applicable observation; collateral reserve 10%;
transaction reserve 5% of Settings Max Loss or higher observed estimate. No policy
parameter, capital, leverage, loss setting or existing safety ceiling was increased
on mainnet by this implementation.

## Journal Discrepancy Trace

Production journal opened with SQLite `readonly:true`, without constructing a
mutable journal instance. Its 33 `authenticated_fills` sum to signed net
0.00014 BTC, matching `lifecycle_state.inventory`. The scalar is internally
consistent with those ingested fills; it is not authoritative current account
inventory. Current execution uses authenticated source inventory. No scalar was
overwritten and no fills/intents were deleted or inserted into production.

The residual exists after legacy session
`session-1788831218192-045c54f6-c090-474a-9dae-1f45a7d57ac6`.
Its last ingested BUY below leaves +0.00014 BTC; all 12 later ingested 0.00031
fills are balanced pairs, leaving the same residual.

| Record | Exact Evidence |
| ------ | -------------- |
| Last legacy ingested BUY | `intent-3a529abf809225414a140eb0`, order `170141604320468511586446771042868264960`, fill `128898875220580423760518836322307`, 0.00014 BTC at 79320.8 |
| Submission transaction | `0xe7d148017fbc35fcaaba6346586b61c3e0266830e2fad906d66c28c6a41d159c`, journal accepted outcome; authenticated history reports version `7121429716` |
| Later BUY missing from ingested fill table | APPLIED `intent-11d11736b575ff13b58e3c01`, order `170141599249866108057804583744577732608`, fill `128898877329375817182005589901317`, 0.00014 at 79291.3, version `7121433962` |
| Later CLOSE missing from ingested fill table | APPLIED `intent-a8f2fc42587b1eaaa679f791`, order `170141604320468511648367853035119968256`, fill `128898884121914318665649968316422`, SELL CloseLong 0.00014 at 79291.8, version `7121446942` |

Fresh authenticated history around the legacy session includes additional trades
not in the 33-fill table, including a later manual CloseLong order
`170141594179263707495344800488797241344` with separate fills of 0.00025 and
0.00042 BTC at version `7126262195`. These are actual history fragments, not
permission to arbitrarily assign one close to the residual or import a partial
subset and call the account balanced.

Direct fullnode retrieval of versions `7121429716` and `7121446942` returned HTTP
410 (pruned). Exact complete legacy history/transaction coverage and canonical
rebuild are therefore not established. The current code does not infer terminal
ACKs from FLAT, nor claim historical reconciliation complete. The existing canonical
fill boundary is regression-tested for exact close replay, identity conflicts,
restart and idempotency; any future durable repair must go through that boundary
with complete verified inputs, not a scalar reset or a recovery CLI.

## Deployment Boundary

Review reader/worker/source and disabled calculator wiring together. Deploy via the
existing controlled process, keeping the gate false. After an operator-authorized
restart, verify account/market/freshness diagnostics and that executable capacity
stays blocked without its existing requirements. Do not enable practical live
capacity until venue checks, historical reconciliation and explicit policy approval
are complete. No production restart, trading test or Git commit was performed.
