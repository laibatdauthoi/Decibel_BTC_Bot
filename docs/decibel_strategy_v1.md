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
3. **Gas reserve.** No new entry or DCA while the gas wallet holds < 0.1 APT
   (`ENTRY_GAS_BALANCE_LOW`). Exits are never blocked.
4. **Size.** Preferred entry = target × 3/20, raised to the venue minimum, floored to the lot,
   capped by margin and by the risk capacity. The last entry may use the remaining target,
   the preferred size or the venue minimum, whichever is largest.
5. **Price.** Passive PostOnly maker order inside the BBO. After a TP fill, the next entry
   rests at least `clamp(0.5 x R, 5, 25)` bps from that exit (anti-chase). A resting entry is
   repriced only after the market moves more than `clamp(0.3 x R, 3, 15)` bps.

## 3. Take profit

- One reduce-only maker TP covers the whole position. Any TP smaller than the position is
  cancelled and replaced at full size at the same price.
- A new TP aims for net `clamp(0.25 x R, 1.5, 10)` bps after fees.

### Adverse repricing (candle rule)

- **Safe band** = `clamp(1.2 x R, 10, 25)` bps against the entry basis.
- A step needs the price outside the band **and** 2 closed 5-minute candles with no return
  inside it, counted from the latest of: leaving the band, the opening fill, the previous step.
- First step: TP to **break-even** (net ≥ −1 bps of notional).
- Later steps: TP rests `clamp(0.5 x R, 5, 20)` bps from the maker price (rescue).
- A TP already at break-even for 3 closes since the previous step may take the rescue step
  even if the price came back inside the band.
- Without a market structure the TP holds (`TP_ADVERSE_CANDLE_EVIDENCE_REQUIRED`). The
  earlier time rule and recovery corridor were removed on 2026-11-14.

## 4. DCA

- At most 2 maker additions per position, counted from the session's fill ledger.
- Each needs the price ≥ 25 bps against the **current** average entry basis.
- Only after the last closed 5-minute candle stops extending the move (no new low for a long,
  no new high for a short): `DCA_PRICE_STILL_MAKING_NEW_LOWS/HIGHS`.
- Size: at least 1/3 of the position, at most the preferred entry size and the risk capacity
  left after the position. The TP is then replaced at full size.

## 5. Risk

```text
lossBps       = 100 adverse + 10 entry fee + 10 exit fee + 25 slippage + 8 adverse selection
lossRemaining = max(0, MaxLoss + min(0, sessionPnL) - sessionGas - fixedExitCost)
riskCapacity  = lossRemaining / (lossBps / 10_000)
```

- The session Max Loss triggers the canonical reduce-only unwind. There is no tight
  per-position stop-loss (it would realize noise as taker losses).
- Settings shows the Max Loss needed for one and two DCA additions.

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
position, zero orders, zero unresolved intents and a completed unwind. A restart while holding
a position unwinds it at market.

## 8. Flags (all default on)

The adverse-TP candle rule is always on (its flag was removed with the legacy rule).

| Flag                                  | Effect when off                            |
| ------------------------------------- | ------------------------------------------ |
| `DECIBEL_ENTRY_CANDLE_FILTER_ENABLED` | Entries from flat skip the candle filter   |
| `DECIBEL_CATASTROPHE_STOP_ENABLED`    | No venue catastrophe stop                  |

## 9. Dashboard

The STRATEGY strip (`decibel_strategy_status_v1`, telemetry `runtime.strategy`) shows the
candle source, R, DCA additions used, the catastrophe stop trigger, and for each rule its
state (PASS / BLOCK / WAIT / IDLE), the reason, and how many cycles of the current session it
blocked or waited. It is presentation only and never feeds back into decisions.

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
