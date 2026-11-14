# ENTRY Economics and Stale Evidence ? PID 18996 Replay

## Production evidence and exact order replay

The journal was opened read-only. The historical observation is cycle 336594 at 2026-10-28 22:20:01.290 Bangkok. Its position is FLAT. The later dashboard snapshot inspected during this task is already SHORT; this report does not describe the earlier two ENTRY orders as still open now or attribute subsequent fills/cancellations to this task.

| Field | BUY | SELL |
| --- | --- | --- |
| Venue Order ID | 170141592911613109352716264804305600512 | 170141604320468507923240769878254157824 |
| Persisted intent | intent-97241334108553df49b37166 | intent-9bc5051c46997a4cc9fd1d4f |
| Resting price | 80318.3 | 80613.9 |
| Authenticated resting residual | 0.00019 BTC | 0.00071 BTC |
| Candidate price | 80520.20000000001 | 80681.5 |
| Candidate quantity | 0.00070 BTC | 0.00070 BTC |
| Comparable quantity | 0.00019 BTC | 0.00070 BTC |
| Order age | 1370555 ms | 1182518 ms |
| Tick displacement | +2019 | +676 |
| Recorded final reason | KEEP:ENTRY_COMPARATIVE_ECONOMICS_UNPROVEN | KEEP:NO_MATERIAL_IMPROVEMENT |

These quantities are present and comparable using the previous common-residual-lot fix. No quantity blocker was reintroduced.

## BUY root cause: a real publication defect plus genuinely insufficient comparison data

The decision function requires fresh CANDIDATE_P95 observations at both resting and proposed quote distances. It uses midpoint-relative distance with the existing half-tick matching tolerance, side match, at least 30 samples, and original one-hour freshness. A global P95 fallback is adequate only where the existing admission policy allows it; it is not substituted for this comparison. No assumed fill-probability or queue-priority improvement is credited for moving closer.

At the replay midpoint 80584.75, BUY distances are approximately 33.06457 bps (resting) and 8.01020 bps (candidate). The published file contained candidate rows from timestamp 1792398651722 (October 19), while global adverse evidence had been refreshed on October 28. The runtime loader correctly discarded these stale candidate rows, yielding candidateAdverseSelection=[] and then netBenefitUsd=null. Re-aging those old rows or using global risk at both distances would invent proof and is not part of the fix.

The production hydration path updated scalar/global markouts but did not derive/publish the candidate buckets. It also returned early while the global component was READY. Candidate generation existed in the viability audit, but normal production hydration did not perform it. Thus valid current candidate data available in the canonical raw store was omitted from normal publication.

The corrected hydration reuses the unchanged candidate estimator and threshold through a shared module. Candidate evidence has its own observation clock. A newer global P95 neither suppresses candidate publication nor needs to be rolled backward for it. Fresh candidate samples and explicit missing counts are atomically merged into the evidence file. Consumer TTLs and matching tolerance are unchanged.

The exact historical raw-BBO fixture contains 662 observations. Rebuilding its buckets yields BUY counts of 80 at 5 bps, 52 at 6, 34 at 7, and only 22 at 8; farther BUY counts are smaller. SELL has sufficient counts at 5 and 6 bps. Therefore a real publication defect lost some valid evidence, but fixing it still does not prove the exact BUY replacement: the candidate's roughly 8-bps bucket is below 30 samples and the resting 33-bps distance is outside the observed configured buckets. The correct after result remains KEEP with no fabricated benefit.

For supported comparisons, the unchanged formula compares price edge minus maker fee, candidate-specific adverse selection and safety reserve on common residual lots, then subtracts two transaction costs and the full proposed-size replacement reserve. Controlled tests at the exact BUY prices and sizes supply explicit supported comparative observations: a beneficial case passes, equal-risk/non-beneficial movement stays KEEP. These controlled observations are not presented as historical venue measurements. Partial residuals use remaining lots, not the immutable submitted amount.

## SELL KEEP is independently valid

A SELL replacement must move closer to execution: desired price must be lower than the resting ask, in addition to the existing age, drift, sustained-improvement and economic checks. 80681.5 is higher than 80613.9. This fails improvesQuote before economic benefit calculation. Large absolute displacement is insufficient. Null benefit here is not evidence of the BUY publication defect, and no change was made to this condition.

## Staleness: demonstrated local mechanisms and limits of attribution

1. The supervisor market-refresh path called raw-store readFresh and append, each reparsing/sorting the entire historical JSONL file. The file was 18,292,010 bytes at inspection. Two read-only baseline reads took 156 and 143 ms. This synchronous work blocks WS delivery, timers and account publication on the same event loop; repeated historical parsing can push near-expiry evidence beyond its unchanged deadline. The store now caches parsed rows, incrementally reads appended bytes, uses timestamp range lookup, and handles external append, incomplete final rows, out-of-order rows, truncation and rotation. A warm read measured below 1 ms locally. The regression checks that unchanged reads parse zero historical rows and a new row parses once, rather than asserting a fragile wall-clock threshold.
2. readPublicMarketState checked the shared HTTP cooldown before reading an already-cached WS book. Consequently a local HTTP cooldown could prevent fresh WS publication until its snapshot expired. The HTTP guard now applies to the metadata GET bootstrap; cached metadata and fresh WS reads remain independent. Authenticated HTTP requests remain gated. An idle WS feed still fails after the original age limit. This is a demonstrated application failure path, not proof that every historical MARKET_DATA_STALE event was caused by a cooldown.
3. Successful ACCOUNT_OVERVIEW HTTP reads alone do not prove a fresh published dependency set. The account snapshot also waits for positions/orders, required risk inputs, and active-session history before publication. Each account/fee/leverage/rule/mark/book observation keeps its own original timestamp. A completed request can therefore coexist with another expired dependency. Previous fixes for publication ordering, background ownership, proactive risk-input renewal and aborted child reads were preserved.

Adjacent historical cycles contain capacity failures around account ages 4758?4794 ms as measured at the archived control-snapshot timestamp, near the 5000 ms boundary. Capacity evaluation uses the actual later clock and also checks book/rule timestamps; synchronous work between these points matters. The archive does not record every dependency timestamp at the exact failed evaluation, so it cannot uniquely identify account versus book expiry for those joint ACCOUNT_OR_MARKET_STALE rows, nor establish every event-loop stall or upstream delay. Missing practical inputs correctly produce SESSION_CAPACITY_EVIDENCE_REQUIRED. No TTL was increased, no timestamp refreshed without new evidence, and no Decibel HTTP 500/WS outage is claimed fixed locally.

## TRADE/WAIT and ownership regression

The exact two owned ENTRY orders are seeded in temporary journals. Controlled transitions expire account evidence, then venue rules, then market data, interleaving fresh snapshots. The observed decision sequence is TRADE ? WAIT ? TRADE ? WAIT ? TRADE ? WAIT ? TRADE. An injected HTTP 500 between these states produces a transient read failure; the next successful fresh publication resumes decisions automatically. Both original intents remain ACKNOWLEDGED, and mutation count stays zero, because the exact economic comparison remains unproven. A separate positive-evidence case verifies replacement eligibility without age/price chasing. Existing cancel/reconcile/place tests remain in the full suite.

## Files and functions

- src/decibel_candidate_adverse_evidence_v1.ts: shared, unchanged buildDecibelCandidateAdverseSelectionEvidenceV1 and existing minimum-sample constant.
- src/run_decibel_production_economic_viability_v1.ts: imports/re-exports the shared estimator; retains its audit behavior.
- src/decibel_production_economic_refresh_v1.ts: hydrateDecibelProductionEconomicEvidenceV1 and publishCandidateEvidence; candidate provenance preserved with other adverse fields.
- src/decibel_adverse_selection_evidence_v1.ts: decibel_raw_ws_bbo_store_v1 readAll/readFresh incremental cache used by append.
- src/decibel_production_live_state_source_v1.ts: readPublicMarketState and makeSDKReader/readMarketMetadata separate WS and HTTP gating.
- tests/decibel_production_live_orchestrator_v1.test.ts, tests/decibel_adverse_ws_collector_liveness_v1.test.ts, tests/fixtures/entry_economics_18996_v1.json: historical publication/economics/TRADE-WAIT/HTTP and raw-store/WS regressions.

No DCA, TP, sizing, leverage, Max Loss, Volume, Settings, economic threshold or profitability rule was changed. The DCA fill ? opposite reduce-only TP quantity recovery remains intact and passes its existing tests.

## Verification and deployment

Affected orchestrator, raw-store/liveness, SDK margin comparison, authoritative reconciliation and HTTP suites: 328 tests passed across five files. This includes the previous DCA-to-TP cancel/reconcile/place regressions. Required full npm test production-core run: 820 passed, three failures (two Chrome headless GPU/access startup failures; one SDK import/liquidation-comparison timeout). The SDK test passes in the focused affected run. The chained authoritative/HTTP stage was run separately in the passing affected suites.

Typecheck and build pass. Changed-file formatting and lint pass. Repository-wide format/lint checks were run and remain blocked by the existing .tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts files; they were preserved.

Implemented locally on the existing non-main branch. Not committed or deployed. No mainnet order submission/cancellation, production journal mutation or process restart. The production economic evidence file and raw-BBO file were read only; hydration tests write only temporary fixtures. Production improvement after deployment has not been observed or claimed.
