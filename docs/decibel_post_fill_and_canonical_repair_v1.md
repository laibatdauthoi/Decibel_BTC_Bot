# Post-Fill Producer And Canonical Inventory Repair

Both missing code paths are implemented. Live policy gate remains false. No
production journal/config/session mutation, mainnet order/cancel, restart or commit.
This supersedes the previous producer-unimplemented decision.

## Production Margin Producer

The existing SDK reader now reads GlobalAccountStates, BTC market configuration,
OpenInterestTracker and PriceDetails at ONE ledger version. Reads share the existing
risk-input cache/singleflight; failed reads cannot manufacture fresh observations.
The raw schema is validated: cross margin, USDC 6-decimal primary collateral,
maintenance multiplier/divisor 1/2, matching maximum leverage, zero unsupported PnL
haircut, healthy/fresh oracle, Open market. Unknown risk/tier fields fail closed.
Secondary collateral and foreign-market positions are not silently simulated by a
BTC-only SDK model. Missing evidence remains blocked.

Verified actual ledger 7769241365: BTC max leverage 40, selected account leverage
40, maintenance ratio 1/(40*2), mark 79971.2, remaining global OI 273.86706 BTC.
The deployed schema has fixed leverage rules, NOT a size-tier ladder. Remaining
OI is enforced as a real global bound; no fictional account maximum or tier was
invented. The legacy tier observation type now explicitly distinguishes fixed-rule
OI coverage and does not require a fabricated tierBoundaryNotionalUsd.

For candidate q, hypothetical extrema are position + resting/inflight BUY + q and
position - resting/inflight SELL - q. Opposite orders are not netted away. All
pending execution costs are reserved. Initial margin = conservative post-fill
notional / actual leverage; maintenance = notional / (venue max leverage * 2).
Available strategy collateral respects Settings Capital * existing allocation,
fresh free margin, fixed policy reserves, pending costs and adverse entry/mark
loss; gains are not credited. Liquidation uses SDK-compatible concentrated margin
buffer math with 6-decimal truncation and full account equity after conservative
reserves/costs. Non-BTC requirements must already have passed source validation.

The SAME capacity calculator is reused for NEXT executable projection, runtime
sizing and preflight. The producer verifies its candidate, supplies verified margin
rates/OI coverage/liquidation distance back to that calculator, and publishes
postFillDiagnostics. If pending costs or mark/execution differences invalidate the
initial candidate, a bounded lot search reuses the same calculator/validator to
find a smaller valid capacity. No second capacity model or gate was introduced.
Real per-order constraints remain enforced when supplied; no legacy $50 fallback.
STOPPING/reduce-only canonical unwind exemptions remain unchanged.

Actual readonly capture, Settings revision 6 (Capital 8, Max Loss 2, target 200),
existing collateral fraction 0.5, account equity/free margin 10.222805, fees 1.5/4.5
bps. Illustrative candidates at captured mark, not rounded live orders:

| Candidate | Initial Margin | Maintenance | Strategy Collateral Left After Reserves/Costs/Margin | Result |
| --- | --- | --- | --- | --- |
| 50 | 1.25 | 0.625 | 2.025 | LONG/SHORT pass |
| 100 | 2.50 | 1.250 | 0.550 | LONG/SHORT pass |
| 200 | 5.00 | 2.500 | -2.400 | rejected by allocation |

Captured LONG/SHORT liquidation prices: 65600.185049/93987.375075 for 50;
73474.052221/86307.924377 for 100. Producer formulas match installed SDK 0.7.0
calculateLiquidationPrice in regression for both sides. These are derived
hypotheticals, not authoritative future fills or permission to trade.
Evidence: data/decibel_post_fill_production_readonly_v1.json. Repeated fresh network
verification was unavailable after automatic approval review hit its usage limit;
no review bypass was attempted. Freshness must be checked again before activation.

## Canonical Inventory Repair

Source remains the authenticated 517-fragment history and sealed zero baseline.
All 33 prior ingested fills match uniquely. 484 missing fills have signed net
-0.00014 BTC; inventory-only replay results in 0 BTC.

New applyHistoricalInventoryRecovery uses the EXISTING SQLite transaction boundary:

- Revalidates sealed baseline, exact canonical execution identities and provenance,
  reviewed plan hash, existing fill coverage/identity, prior ledger consistency,
  authenticated inventory/freshness and current-session cutoff.
- Refuses any current nonterminal execution intent.
- Atomically appends only missing fills and stores ALL 517 exact history evidence
  records, including actual fees, quantities, prices, transaction versions,
  timestamps, terminal facts, ownership candidates and 27 explicit discrepancies.
- Does not invent ownership or maker/taker classification. Inventory-only additions
  have no intent/session lineage; historical snapshots and current-session PnL or
  volume cannot be backfilled by this operation. Proven ownership remains in the
  evidence record for later separate accounting reconciliation.
- Preserves legacy fill rows and maps their canonical IDs through durable aliases.
  Re-ingestion using the canonical execution ID cannot count an old raw fill twice.
  Contradictory identities/provenance fail and roll back atomically.
- Never resets inventory from FLAT, changes intent status/ACK, terminalizes a
  session or treats historical ambiguity as a live mutation.

New isolated copy data/.tmp_final_inventory_recovery_v2.sqlite:
first append inserted 484, duplicate 33, inventory 0; repeated recovery inserted 0,
duplicate 517; restart retained 0. Evidence table contains 517 records. Historical
session snapshot and current-session fills unchanged. Maker volume remains
438.20083. 27 historical discrepancies retained. Production still has 33 fills and
inventory 0.00014; readonly inspection found zero active identity conflicts and
zero nonterminal intents.

The final canonical-ID replay is OFFLINE AS OF the already authenticated capture;
it is not a fresh production repair authorization. It binds every normalized
execution to exact raw authenticated history, never to a test fixture.

Review artifacts:

- data/decibel_authenticated_inventory_recovery_input_v1.json
- data/decibel_reviewed_inventory_repair_manifest_v1.json
- Raw history SHA256: 7e86032c0eed04995db6f00fd9fa9ec3ef155276aadf395299ac186815e9c4ef
- Reviewed canonical plan SHA256: 15da1a1bb2b98187708cb65d3a999b7e506cd2060b5942656621fe52bca80cf8

INVENTORY REPAIR ELIGIBLE: YES, without resolving ownership by guesswork. Full
historical session attribution/PnL repair is NOT claimed; 27 discrepancy records
remain. They do not become current-session accounting or unresolved PLACE/CANCEL.

## Exact Controlled Procedure, Not Executed

1. Obtain explicit approval for inventory-only canonical repair of the above hash;
   keep live policy gate false. Ensure the session is ENDED, operator/runtime cannot
   submit mutations during the maintenance transaction, and take a SQLite backup.
2. Revalidate raw evidence/input hashes, all 517 records, 33 legacy ID mappings,
   latest session cutoff, no nonterminal intents and no active identity conflict.
3. Read authenticated venue inventory/orders immediately BEFORE applying. Do not
   reuse the archived observation timestamp as current evidence.
4. Through the existing application journal boundary call
   applyHistoricalInventoryRecovery with the validated input, expectedPlanHash,
   existingFillIds from manifest, latest sessionBoundary, fresh venueInventoryBase,
   observedAt, now and configured maximumAgeMs. No SQL overwrites, CLI, scheduler
   or automatic startup repair was added.
5. Verify inventory 0, 517 evidence records, unchanged session snapshots/current
   accounting, and repeat result inserted=0. Run canonical authenticated
   reconciliation. Any mismatch leaves execution blocked.
6. Only after this succeeds and existing guards pass, approve the unchanged
   practical risk policy and existing gate false -> true for the next deployment.
   New versioned sessions then use dynamic capacity and may exceed $50; historical
   ACTIVE snapshots remain immutable. Capital, Max Loss, target and leverage are
   not changed by the deployment. A controlled restart is required later, not here.

The policy remains estimates: 30s exit, max(100bps,2*range), 25bps slippage,
10bps/fee leg, 8bps adverse selection, 10% collateral reserve, transaction reserve
5% of Settings Max Loss. No guaranteed future-market-cost proof is required and
none is claimed. No increased mainnet exposure has been activated.

## Final Verification

- npm test: 664/664 PASS (653 production core + 11 canonical reconciliation).
- Backend and frontend typecheck: PASS.
- Backend and dashboard builds: PASS.
- Targeted lint and formatting for changed files: PASS.
- Full format:check fails only on pre-existing .tmp_conflict_readonly.cjs.
- Full lint fails only on pre-existing root .tmp_conflict_readonly.cjs and
  .tmp_exact_evidence.ts project-service configuration errors.
- Existing gate is still false. Current production inventory is still 0.00014 BTC
  with 33 ingested fills, zero active identity conflicts and zero nonterminal
  intents. No production canonical repair or deployment was applied.
