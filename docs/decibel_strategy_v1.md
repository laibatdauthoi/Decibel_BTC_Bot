# Decibel strategy v1 (single specification)

Status: current production behaviour, 2026-11-14. Every number below comes from
`src/decibel_strategy_policy_v1.ts` (`DECIBEL_STRATEGY_POLICY_V1`). Change a value there and
update this page in the same commit.

The bot is deterministic and never calls an AI model while trading. Every order passes the
decision layer (`evaluateTradingDecision`) and the risk engine.

Volatility-scaled values use `clamp(factor x R, min, max)` bps, where **R** is the
5-minute midpoint range (bps).

## 1. Market data, once per cycle

| Input            | Source                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Order prices     | Live BBO (WebSocket)                                                                      |
| Candle rules     | `decibel_market_structure_v1`, built once per cycle                                       |
| Structure source | Venue 1-minute candles (`/api/v1/candlesticks`, outlier wicks filtered) while fresh       |
| Fallback         | The bot's own BBO midpoint history (`source = BBO_FALLBACK`)                              |
| Range R          | High − low of the samples over the last 5 minutes, needs 80% coverage, else null          |

- Venue candles: 30 minutes of history, re-read every 30 s. They are stale when the last
  closed candle ended more than 150 s ago.
- The structure holds the samples and the last two closed clock-aligned 5-minute candles
  (`closedCandles`, null when the history does not cover them).

## 2. Entry (from flat)

1. **Candle filter.** A long only after the last closed 5-minute candle made a lower low than
   the candle before; a short only after a higher high (`ENTRY_REQUIRES_NEW_LOW/HIGH`,
   `ENTRY_CANDLE_EVIDENCE_REQUIRED` without candles).
2. **Volatility pause.** No new entry or DCA while R > 40 bps (`ENTRY_VOLATILITY_PAUSE`).
   Below the pause, a flat entry shrinks by 15 / R once R > 15 bps, down to half its size
   (`entry.volatilitySizing`, reason `VOLATILITY_ADAPTED`; 2026-11-22). Backtest 05-21/11: net
   loss per volume 3.80 -> 2.91 bps, better in both halves. A resting entry keeps its size until
   it is repriced.
3. **Gas reserve.** No new entry or DCA while the gas wallet holds < 0.1 APT
   (`ENTRY_GAS_BALANCE_LOW`). Exits are never blocked.
4. **Size.** Preferred entry = target × 3/20, raised to the venue minimum, floored to the lot,
   capped by margin and by the risk capacity. Near the end each side may rest the remaining
   target, the preferred size or the venue minimum, whichever is largest: the two flat entries
   are alternatives, so the target may be overshot by up to one entry.
5. **Price.** Passive PostOnly maker order, resting at least `clamp(0.3 x R, 0, 20)` bps behind
   the touch (a volatility-scaled half-spread, since 2026-11-15; at the touch while R is
   unknown). For 5 minutes after a TP fill, the
   next entry rests at least `clamp(0.5 x R, 5, 25)` bps from that exit (anti-chase). A resting entry is
   repriced only after the market moves more than `clamp(0.3 x R, 3, 15)` bps.

6. **Rejected on 2026-11-15 (backtest, three periods):** an entry flow filter (no entry during a
   5-minute range spike over 2-3x its recent median, no entry fading a 5-15 minute move over
   1-2x the typical range). No setting was better than the current rules in all periods, and
   most cut the volume, so it was not added.

## 3. Take profit

- One reduce-only maker TP covers the whole position. Any TP smaller than the position is
  cancelled and replaced at full size at the same price.
- A new TP aims for net `clamp(0.25 x R, 1.5, 10)` bps after fees.

### Adverse repricing (R steps, since 2026-11-15)

- **R** is the initial entry-to-TP distance (kept across steps).
- After **4R** against the entry basis the TP moves to **break-even** (net ≥ −1 bps of
  notional).
- Then for every further **2R** against, the TP moves **2R closer** to the market. It never
  moves away and never rests through the maker price.
- Chosen from backtests on 2026-11-05..14 (live parameters, DCA off): about 1.5× the volume
  of never moving the TP and half the holding time, at a lower cost per volume than the
  earlier candle rule. Max Loss stays the hard stop.

## 4. DCA

Disabled since 2026-11-15 (`dca.maximumAdditions = 0`, reason `DCA_DISABLED`): in trending
markets the additions doubled the losses. The addition logic (trigger, momentum gate,
risk-capacity cap, TP re-target to the new average) is kept for a future re-enable, and the
Settings DCA Max Loss hints are hidden while it is off.

## 5. Risk

```text
lossBps       = 100 adverse + 10 entry fee + 10 exit fee + 25 slippage + 8 adverse selection
lossRemaining = max(0, MaxLoss + min(0, sessionPnL) - sessionGas - fixedExitCost)
riskCapacity  = lossRemaining / (lossBps / 10_000)
```

- The session Max Loss triggers the canonical reduce-only unwind. There is no tight
  per-position stop-loss (it would realize noise as taker losses).
- The position cap (`min(margin, exit depth, venue, safety)` in USD, divided by the price) gates
  opening orders only. A held position may sit up to one minimum order above it as the price
  moves (`getDecibelHeldPositionCapBaseV1`, since 2026-11-15); only a genuine overfill beyond
  that triggers the `POSITION_LIMIT_REACHED` reduction.
- The post-fill margin check (`produceDecibelPostFillMarginV1`) models a long and a short fill.
  Venue free margin already excludes the reservation of resting opening orders, so it is added
  back once; each scenario is charged only its own side's opening orders, the reduce-only orders
  and the candidate (the opposite flat entry is an alternative).
- Settings shows the Max Loss needed for DCA only while DCA is enabled.

## 6. Catastrophe stop (offline protection only)

- One full-size venue position SL per open position (`place_tp_sl_order_for_position` without
  a size). The venue removes it when the position closes.
- Trigger: 1.2 × Max Loss of the notional from the entry, clamped to 2–10%, never closer than
  1% to the market. Stop Limit with the limit 3% past the trigger.
- Placed only after a cycle with no submission in flight, at most every 30 s, from a fresh
  venue read. A full-size SL closer than 1% to the entry is treated as foreign.

## 7. Session end

Operator END, `TARGET_VOLUME_REACHED`, `MAX_LOSS_REACHED` or
`TARGET_UNREACHABLE_MINIMUM_ORDER`. A session terminalizes only after an authenticated flat
position, zero orders, zero unresolved intents and a completed unwind. An END (or a session
already stopping when the process restarts) unwinds an open position at market.

**Ctrl+C pauses, it does not end** (since 2026-11-16). On SIGINT/SIGTERM with a RUNNING session
the bot cancels its resting entries (up to 6 control cycles), keeps the reduce-only TP and the
venue catastrophe stop, leaves the session RUNNING and exits. The next start proves the old
process absent (its heartbeat goes stale after 30 s) and resumes the session through the normal
crash recovery. A session that is already stopping still finishes its unwind.

**Network drops** do not stop the process: an uncaught got network `RequestError`
(ECONNRESET, ETIMEDOUT, EAI_AGAIN, ...) is logged and contained like the got settled-cancel
error (`decibel_process_error_policy_v1.ts`). Every other uncaught exception still exits.

## 8. Flags (all default on)

The adverse-TP candle rule is always on (its flag was removed with the legacy rule).

| Flag                                  | Effect when off                            |
| ------------------------------------- | ------------------------------------------ |
| `DECIBEL_ENTRY_CANDLE_FILTER_ENABLED` | Entries from flat skip the candle filter   |
| `DECIBEL_CATASTROPHE_STOP_ENABLED`    | No venue catastrophe stop                  |

## 9. Strategy status (telemetry only)

Each cycle the web runtime projects `decibel_strategy_status_v1` into telemetry
`runtime.strategy` (GET `/api/telemetry`): candle source, R, DCA additions used, the
catastrophe stop trigger, and for each rule its state (PASS / BLOCK / WAIT / IDLE), reason
and blocked cycles this session. It is not shown on the dashboard (the operator's status
areas are Settings and the top-right indicator) and never feeds back into decisions.

**Status and errors** (since 2026-11-16): `decibel_runtime_condition_v1.ts` classifies each reason as FAULT,
DEGRADED, RECONCILING or WAITING. Only a FAULT (or confirmation stuck for more than 60 s) is an error on the
dashboard; strategy waits such as `ENTRY_REQUIRES_NEW_LOW` show as WAITING with their reason.

## 10. Backtest

`npm run decibel:backtest` replays recorded BBO rows (`data/decibel_production_raw_ws_bbo_v1.jsonl`,
read only) through `src/decibel_strategy_backtest_v1.ts` with the policy above and prints one
line per variant.

```text
npm run decibel:backtest -- --from 2026-11-05 --set adverse.candleCloses=2,3 --set dca.triggerBps=25,40
```

- Options: `--file`, `--from`, `--to`, `--set <policy.path>=v1,v2` (repeatable, all combinations),
  `--entry`, `--target`, `--max-loss`, `--maker-fee`, `--taker-fee`, `--no-filter`, `--no-dca`,
  `--no-adverse`, `--json`.
- Fill model: a resting BUY at P fills once the best bid trades below P, a SELL once the best
  ask trades above P. Max Loss and data gaps over 5 minutes (a restart) close at the touch
  with the taker fee. Defaults: maker 1.5 bps, taker 4.5 bps, entry $30, target $200, Max Loss
  $1.5.
- `strategy net $` excludes trips cut by a data gap; `gap net $` is those unwinds.
- It is an approximation: no queue position, no latency, BBO only. Use it to rank variants
  on the same data, and confirm any change on live sessions before trusting the size of
  the effect.
