# Plan: mainnet probe of Decibel order-update semantics

**Status:** plan only. No script exists yet and no order has been sent. Running any stage below
sends real mainnet orders and needs the user's explicit go-ahead for that stage.
**Date:** 2026-11-12

## 1. Why

The bot can only reprice or resize a TP by cancel → place, which leaves a window without TP and is
the reason for `TP_COVERAGE_REPAIR_REQUIRES_ATOMIC_OR_VERIFIED_ADD`, many TP rejections and ENTRY
churn (2,063 ENTRY submissions for 111 fills, see `decibel_profitability_analysis_2026_11_12.md`).
`dex_accounts_entry::update_order_to_subaccount` is a single Move transaction, so it is
all-or-nothing, but its behaviour is not documented.

Already checked without trading (2026-11-12):

- The Decibel packages (`aptos_market`, `decibel_perp_dex`) are published **without source**, so the
  semantics cannot be read from chain.
- The SDK (0.7.0) has no update-specific order event or status; behaviour must be observed from
  transaction events and the open-order list.
- Docs: TP/SL size cannot exceed the position (`EINVALID_TP_SL_SIZE`); bulk orders are post-only
  with no reduce-only flag; PostOnly placement that would execute is cancelled.
- Docs (REST order history / WebSocket `orderupdate`): order objects carry `order_id`,
  `client_order_id`, `orig_size`, `remaining_size`, `size_delta`, `status`, `is_reduce_only`,
  `unix_ms` and `transaction_version`. Notification types include `OrderPartiallyFilled`,
  `OrderSizeReduced` and `OrderCancelled`. The probe reads these after each step; they are the main
  evidence for Q1, Q2 and Q6.
- Docs (bulk orders): one bulk order per account and market, overwritten atomically by each call; a
  size reduction keeps queue position, a size increase goes to the back. The live Maker Rebate campaign
  pays **0.5 bps** on maker fill volume from **bulk orders only**, for accounts with an 80%+ maker
  ratio over a cycle (capped, pro rata). Single-order fills do not qualify.

## 2. Questions to answer

| #   | Question                                                                                           | Stage |
| --- | -------------------------------------------------------------------------------------------------- | ----- |
| Q1  | Does `update_order` keep the order id, or cancel and create a new order inside the transaction?   | A     |
| Q2  | Is the original placement time kept (a proxy for queue priority) on price change / size down / size up? | A |
| Q3  | Can `isReduceOnly` be set by update? Is a reduce-only update rejected while flat?                  | A, C  |
| Q4  | What happens when an update makes a PostOnly order cross: abort, cancel, or taker fill?           | B     |
| Q5  | Can a reduce-only TP be repriced and resized by update while a position is open?                  | C     |
| Q6  | After a partial fill, is the update `size` the new total or the new remaining?                    | C (opportunistic) |
| Q7  | Can a position SL (`place_tp_sl_order_for_position`) rest next to a full-size reduce-only TP limit? (needed for the catastrophe stop) | D |
| Q8  | Can the ENTRY be a one-level bulk order next to a regular reduce-only TP? Does a re-price keep or lose queue position, and is the bulk order visible in the bot's open-order reads? | E |

## 3. Stages

All stages use the BTC/USD venue minimum size (read from market metadata at runtime) with a hard
notional cap of **$12 per order**. Each stage starts and must end **flat with zero open orders**.

**Stage A — no fill risk (gas only).** Place a PostOnly BUY about 3% below the best bid. Then, one
transaction at a time, reading back state after each: update price (still far), update size down,
update size up, update with `isReduceOnly=true` (expect rejection while flat), cancel.
Answers Q1–Q3.

**Stage B — crossing update (small fill risk).** Place a far PostOnly BUY, then update its price to
the best ask with PostOnly. Expected: abort or cancel. If it fills instead, close at once with a
reduce-only IOC. Worst case is about one minimum-size taker round trip (≈ $0.01 in fees plus spread).
Answers Q4.

**Stage C — reduce-only TP with a position.** Open a position of 2 × minimum size (taker IOC).
Place a reduce-only PostOnly TP for the full size above the ask. Update its price closer (still
non-crossing), then its size down to the minimum, then back up. If a partial fill happens while the
TP rests at the touch (wait at most 10 minutes, operator can stop earlier), update the size and read
back the remaining size to answer Q6; otherwise record Q6 as unanswered. Close any remainder with a
reduce-only IOC. Worst case: adverse move on about $12 during the stage (0.5% ≈ $0.06) plus fees.
Answers Q3, Q5, Q6.

**Stage D — position SL next to a TP.** With the Stage C position open and a full-size reduce-only TP
resting, place a position SL about 10% away (`place_tp_sl_order_for_position`, SL only, size =
position). Record acceptance or the abort code, then cancel the SL and close. Answers Q7.

**Stage E — bulk order as ENTRY (no fill risk).** Place a one-level bulk BUY about 3% below the bid
(`place_bulk_orders_to_subaccount`, increasing sequence number). Re-send it with a smaller size, then a
new price, reading `unix_ms` / `remaining_size` after each. Check that the bot's authenticated reads
see it (today they only classify bulk activity as foreign). Cancel with `cancel_bulk_order_to_subaccount`.
Answers Q8. If positive, ENTRY could move to bulk orders: atomic re-quote, priority kept on size
reductions, and eligibility for the 0.5 bps maker rebate.

Estimated total cost for all stages: under $0.20, dominated by price movement during Stage C.

## 4. Safety rails for the probe script

- New one-off runner `src/run_decibel_venue_capability_probe_v1.ts`, outside the production chain,
  with npm script `decibel:probe:venue-v1`. It reuses the executor's signer construction and
  BigInt chain-unit conversion, and never prints credentials.
- Refuses to run unless: `TRADING_MODE=mainnet` and `LIVE_TRADING_ENABLED=true` (existing rule);
  the production bot process is not running; the authenticated position is exactly 0; there are zero
  open orders; and the flag `--live --stage <A|B|C|D|E>` is given. One stage per invocation.
- Its own risk gate (the production risk engine models sessions, not probes): notional ≤ $12, size =
  venue minimum or 2 × minimum, closing orders always reduce-only, PostOnly except the explicit IOC
  open/close steps.
- No submission retries (duplicate execution is never ruled out on timeout); an unknown outcome stops
  the stage and switches to read-only reconciliation.
- Any unexpected read-back state → cancel all probe orders (by client order id prefix `vprobe`),
  close the position with a reduce-only IOC, stop.
- Writes a JSON report (transaction hashes, events, before/after open orders, abort codes) to a
  directory outside the repo. Does not write to `data/` or `config/production_state/`.
- Pure parts (safety gate, report parsing) get unit tests in `tests/` and are added to the test list.

## 5. After the probe

1. Run `src/run_decibel_read_only_auth_check_v1.ts` and confirm position 0 and zero open orders
   before the bot is started again. Probe fills appear as non-strategy activity, like the earlier
   manual fills.
2. Record the answers in this document and in the handover.
3. If Q1/Q5 show an atomic in-place update: design TP repricing (and later ENTRY repricing) on
   `update_order`, behind the decision layer and preflight. If Q7 is positive: design the venue-side
   catastrophe stop.
