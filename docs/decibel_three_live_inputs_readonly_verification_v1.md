# Three Live Inputs: Actual Read-Only Verification

## Read Window And Scope

Reads completed 2026-10-26 01:16:30–01:17:36 UTC (08:16:30–08:17:36 UTC+7).
These are observations at that time, not continuously fresh certificates. Requests
used the configured credential without printing it. No signer/writer was created.
Only GET and ABI-verified on-chain POST `/view` calls were used. No transaction
simulation endpoint, transaction submission, journal/config/session write, restart
or commit was performed. No production implementation was changed in this task.

Deployment package:
`0x50ead22afd6ffd9769e3b3d6e0e64a2a350d68e8b102c4e72e33d0b8cfdfdb06`.
BTC market:
`0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861`.
Fullnode ledger version at the second read: `7767030409`, chain ID 1.
REST and resource reads were not pinned to one atomic ledger version.

## Concrete Input Matrix

| Input | Exact Source | Actual Value | Freshness At Read | Verified Or Missing / Reason |
| ----- | ------------ | ------------ | ----------------- | ---------------------------- |
| Selected BTC leverage while FLAT | GET `/api/v1/account_positions?account=<subaccount>&market_address=<BTC>&include_deleted=true`; the verification fetched all markets with `limit=100` and selected exact BTC | `size=0`, `user_leverage=40`, `is_isolated=false`, `is_deleted=true` | Retrieved during the read window | VERIFIED; independently matches current on-chain `perp_positions::UserPositions` BTC leaf, including size 0 and leverage 40 |
| Exchange maximum BTC leverage | GET `/api/v1/markets`, BTC row; on-chain `perp_market_config::PerpMarketConfiguration.risk.max_leverage` | 40 | Retrieved during the read window | VERIFIED maximum, distinct from selected account leverage |
| Frontend displayed default | Not used | Not evidence | Not applicable | Does not establish account leverage |
| Effective account taker/maker fee | Authenticated GET `/api/v1/user_fee_rates?account=<subaccount>`, `perp.user_taker_rate` and `perp.user_maker_rate` | 0.00045 / 0.00015 = 4.5 / 1.5 bps | Retrieved 01:16:30–01:16:32 UTC; no server fee expiry provided | VERIFIED account response, tier 0, active referral discount 0; no rate rebate shown |
| Authenticated account collateral | GET `/api/v1/account_overviews?account=<subaccount>` | Equity, haircut-adjusted equity, total margin and available-to-trade each USD 10.222805; unrealized PnL 0; maintenance margin 0; deficit 0; secondary collateral null | Retrieved 01:16:56–01:16:58 UTC | VERIFIED current account state; not a future-position simulation |
| On-chain collateral cross-check | `perp_engine::cross_position_status(subaccount)` | Equity 10222805 atomic USDC; primary collateral 10222805; reserved 0; total notional 0; maintenance 0 | Retrieved 01:17:34–01:17:36 UTC | VERIFIED; 6-decimal USDC conversion matches REST |
| Available/reserved order margin | `accounts_collateral::available_order_margin` / `get_reserved_collateral`, ABI `is_view=true` | 10222805 / 0 atomic USDC | Same final read window | VERIFIED |
| Maintenance requirement | Package resource `accounts_collateral::GlobalAccountStates.liquidation_config` | Maintenance multiplier 1, divisor 2; backstop multiplier 1, divisor 3 | Retrieved in second read window | VERIFIED parameters; matches `cross_position_status` divisor/multiplier fields |
| BTC market constraints | BTC configuration and `open_interest_tracker::OpenInterestTracker` resources | Leverage 40; min quantity 0.00002 BTC; lot 0.00001 BTC; mode Open; aggregate max OI 285.4285 BTC; current OI 9.33635 BTC | Retrieved in second read window | VERIFIED venue aggregate constraints; aggregate OI is not an account position limit |
| Pending orders/exposure | Authenticated GET `/api/v1/open_orders?account=<subaccount>&limit=100`; read-only production execution journal using canonical nonterminal status filter | `items=[]`, total_count 0; nonterminal intents 0 | REST second read window; journal checked during this task | VERIFIED no represented pending/inflight exposure at observation; not a promise no subsequent activity occurs |

The SDK 0.7.0 `userPositions.getByAddr({includeDeleted:true})` already exposes the
correct endpoint. Production `decibel_authenticated_http_reader_v1.ts` fixes
`include_deleted=false`, hiding this flat leverage row. Its preflight instead uses
`min(configured MAX_EFFECTIVE_LEVERAGE, market.maximumLeverage)`, which is an
operator ceiling and venue ceiling, not independent proof of account-selected
leverage. Do not count this old expression as an equivalent authenticated source.

The earlier maker-only audit already calls `user_fee_rates`; its parsing omits
`perp.user_taker_rate`. Thus both leverage and taker-fee gaps are missing reader
implementation, not unavailable venue evidence. SDK `tier.getByOwner` is a points
tier endpoint and must not be confused with the account trading fee tier.

The published tier-0 schedule is 4.5 bps taker / 1.5 bps maker:
https://app.decibel.trade/announcements (19 August 2026 fee schedule).
It agrees with this account response. A published base rate could be an explicit
policy ceiling only while the applicable product schedule/surcharges remain
verified; it is unnecessary to substitute it for the account rate found here.
Builder surcharges and future fee changes are not disproved by referral discount 0.

## Hypothetical LONG/SHORT Results (Local Only)

On-chain mark snapshot used: USD 79,878.50, mark observation at approximately
01:16:56.914 UTC. Order book timestamp: 01:17:30.007 UTC, best bid/ask
79,808.50 / 79,810.10. Different source times are intentionally retained, not
presented as an atomic executable quote.

Saved Settings revision 6: Capital USD 8, Max Loss USD 2, Target USD 200.
Most recent session is ENDED, immutable revision 3; it was not reset or migrated.
Existing collateral allocation fraction 0.5 gives USD 4, not USD 8 of strategy
collateral. For these illustrations, reserve USD 0.40 (10% of allocation) plus
USD 0.10 (5% of configured Max Loss), and 6 bps notional for one maker entry plus
one taker exit. These reserves and future fill assumptions are policy estimates.

Initial margin = N/40. Maintenance = N * 1/(40*2). Both sides use the same flat
initial account, no pending exposure, and worst-case post-fill absolute exposure N.
The hypothetical quantities N/mark are fractional illustrations; actual orders
must separately floor to lot and satisfy minimum/economic/identity checks.

| Candidate USD | Initial Margin USD | Maintenance USD | Fee Reserve USD | Strategy Allocation Remaining After Margin, Fees And USD 0.50 Reserve | LONG Liquidation Estimate | SHORT Liquidation Estimate |
| ------------- | ------------------ | --------------- | --------------- | ------------------------------------------------------------------ | ------------------------- | -------------------------- |
| 50            | 1.25               | 0.625           | 0.03            | 2.22                                                               | 65,208.67                 | 94,186.11                  |
| 100           | 2.50               | 1.25            | 0.06            | 0.94                                                               | 73,073.41                 | 86,515.56                  |
| 200           | 5.00               | 2.50            | 0.12            | -1.62                                                              | 77,005.78                 | 82,680.28                  |

Liquidation illustrations use actual full cross-account equity minus the explicit
fee/reserve assumptions, entry at the mark, and independently call the installed
SDK `calculateLiquidationPrice`. The local formula with verified 1/2 maintenance
parameters agrees within USD 0.000001 SDK truncation. Entry sweep VWAP for all
three quantities was 79,810.10 LONG / 79,808.50 SHORT at the later book snapshot.
This does not substitute those later VWAPs into the earlier-mark liquidation table.

USD 200 is unsupported by the current strategy collateral allocation even though
full-account free margin would remain about USD 4.60 in this model. The practical
stress budget can separately reject it. USD 50/100 passing these initial-margin
illustrations does not authorize them or establish that all bot guards pass.

## Tier/Simulation Limits And Readiness

The inspected BTC risk resource has fixed max leverage and liquidation parameters,
not a size-tier ladder. No account-specific maximum BTC position field was found
in these resources/endpoints. USD 408.9122 = free margin * 40 is only a gross
margin-only bound before costs/reserves; it is not a proven permitted account cap.
Current aggregate remaining OI is 276.09215 BTC, not an operator risk allowance.

`cross_position_status` and `view_position_status` are authoritative current-state
views. The latter aborts `EPOSTION_NOT_FOUND` for flat BTC; it accepts no hypothetical
order size. Inspected installed SDK and relevant deployed module ABIs expose no
verified hypothetical-order risk simulation used here. SDK local calculation is
not an authoritative venue approval; this is an unimplemented/unverified simulation
interface, not a claim no such venue service can exist.

The journal's persisted inventory scalar reads 0.00014 BTC while fresh venue and
on-chain total exposure are zero. It was not used as current exposure or changed.
Existing canonical reconciliation must resolve/qualify that historical scalar;
these reads alone are not a new terminalization or reconciliation decision.

READY_FOR_LIVE_INTEGRATION = NO. Leverage, account fees, current margin and actual
maintenance parameters have concrete sources now. Remaining work is to wire fresh
flat leverage and product-specific fees into read-only inputs, validate and bound
the post-fill model against all applicable venue constraints, resolve existing
reconciliation readiness and obtain explicit live-policy approval. No larger live
orders or risk-policy changes are enabled by this report.
