# Profitability and fill analysis (2026-11-12)

**Method:** read-only queries on copies of `data/decibel_execution_v1.sqlite` and
`config/production_state/decibel_production_sessions_v1.sqlite`. Fills were classified by the
intent's `executionRole`, then paired entry→exit FIFO within each session. Fees use the
documented tier-0 schedule (maker 1.5 bps, taker 4.5 bps, docs.decibel.trade/for-traders/fees).
Gas is ignored, as agreed with the user. The scripts were run from a scratch directory outside the repo.

## 1. Where the money went

| Exit type (bot fills only)                          | Round trips | Entry notional | Net (after fees) |
| --------------------------------------------------- | ----------- | -------------- | ---------------- |
| ENTRY maker → TP maker (`INVENTORY_REDUCING_MAKER`) | 58          | $1,897         | **+2.94 bps**, win rate 76% |
| ENTRY maker → session unwind IOC (taker)            | 18          | $513           | **−11.1 bps**    |
| ENTRY maker → maker close (`STANDARD_MAKER`)        | 9           | $144           | −3.1 bps         |

- **484 fills ($8,150) are not bot fills.** They have no intent, `strategy_lineage=0` and
  `external_counterparty=0` (2026-09-04 → 2026-10-25). They are probably manual trades on the same
  subaccount. They make the historical "−$5.77 / −11 bps" figure look worse than the bot's own result.
- **The largest session losses came from growing the position into a trend.** Examples:
  MAX_LOSS session 2026-10-29: −$3.02, five BUY additions from 80,645 down to 80,138.
  PROCESS_SHUTDOWN session 2026-10-28: −$1.23, the same pattern. OPERATOR_END 2026-10-28: −$0.46, the same.
  Position growth is now blocked unconditionally (commit `d382c07`), so this loss source is closed.
- The remaining loss sources are (a) **taker unwind at session end** and (b) a single position
  held through an adverse move until the operator ends the session.

## 2. Fill rate and churn

| Role                        | Submitted PLACE | Submitted CANCEL | Fills | Fill rate per PLACE |
| --------------------------- | --------------- | ---------------- | ----- | ------------------- |
| ENTRY (`STANDARD_MAKER`)    | 2,063           | 1,420            | 111   | 5.4%                |
| TP (`INVENTORY_REDUCING_MAKER`) | 202         | 239              | 51    | 25%                 |
| Session unwind IOC          | 35              | 45               | 13    | 37%                 |

- 11,435 ENTRY and 23,848 TP intents were prepared, but most were superseded before submission.
  4,552 TP intents were rejected.
- ENTRY time to first fill: p25 97 s, median 343 s, p75 693 s, p90 1,348 s.
- About 18 ENTRY submissions per ENTRY fill. Each cancel + place loses queue priority, which lowers
  the fill rate of a passive order.

## 3. Venue capabilities relevant to atomic operations

From the Decibel ABI (`node_modules/@decibeltrade/sdk/dist/abi/json/mainnet.json`) and docs:

- `dex_accounts_entry::update_order_to_subaccount(order_id, market, price, size, is_buy, tif,
  is_reduce_only, tp/sl…)` — one Move transaction, so it is all-or-nothing. **Undocumented:** whether
  the order id and queue priority are kept, whether `size` is total or remaining after a partial fill,
  and what PostOnly does on a crossing update. Verify these before relying on it.
- `place_bulk_orders_to_subaccount` — atomic replacement of the whole ladder, post-only, max 40 levels
  per side; size reductions keep queue priority. **No reduce-only flag**, so it cannot hold a TP.
- `place_tp_sl_order_for_position` / `update_tp|sl_order_for_position` — position TP/SL. TP/SL size
  cannot exceed the position. Trigger/execution semantics are not documented.
- The current bot treats any active TP/SL order as `STRATEGY_ACTIVITY_EXCLUSIVITY_LOST`.

## 4. Recommended next changes (ordered by expected impact)

1. **Done:** block position growth (removes the largest historical losses).
2. **Atomic TP repricing with `update_order`.** It removes the cancel → place gap that forces
   `TP_COVERAGE_REPAIR_REQUIRES_ATOMIC_OR_VERIFIED_ADD` and the TP rejections. Requires a small,
   user-authorized mainnet verification of the undocumented semantics in §3 (one tiny reduce-only
   order, update price, update size after a partial fill, crossing PostOnly update).
3. **Lower ENTRY churn.** Replace the resting ENTRY only when it no longer satisfies the cost
   equation or falls out of the touch by more than a tick threshold. Use `update_order` for ENTRY too
   once verified. Measure with the fill-rate table above before and after.
4. **Drain instead of taker unwind when the target is reached.** Stop new entries and let the resting
   TP (net ≥ 0) close the position; keep IOC for Max Loss and an explicit "force end". Historical
   evidence: taker unwind −11.1 bps vs TP exit +2.94 bps. This touches session control, so it should
   follow the single-decision-layer refactor (`decibel_single_decision_layer_proposal_v1.md`).
5. **Settings** (operator decision, not changed by Claude): with growth blocked, Max Loss only needs
   to cover one position's stress loss; see handover §4 for the formula.
