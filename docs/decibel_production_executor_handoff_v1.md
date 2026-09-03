# Decibel Production Executor Handoff V1

This handoff defines an external executor boundary only. No production executor, signer, wallet, or MAINNET mutation implementation is included.

## Interface and inputs

The external executor implements `placePostOnlyLimit` and `cancelExactOrder`. PLACE accepts only the exact mapped `BTC/USD` market, `BUY` or `SELL`, `LIMIT`, `POST_ONLY`, tick/lot-valid price and quantity, bounded notional, and complete intent, mutation, cycle, state, strategy, and client-order identities. Self-trade is prohibited and an external counterparty is required.

CANCEL identifies one exact authenticated venue order through `expectedPreviousVenueOrderId` and proven strategy lineage. Cancel-all, price-based cancellation, guessed client identity, and assumed-open cancellation are prohibited.

## Results and unknown outcomes

Results are `PLACE_ACKNOWLEDGED`, `PLACE_REJECTED`, `PLACE_OUTCOME_UNKNOWN`, `CANCEL_CONFIRMED`, `CANCEL_REJECTED`, or `CANCEL_OUTCOME_UNKNOWN`. Unknown is never converted to rejection or retried. The lifecycle stops mutation and performs authenticated reconciliation first.

## Idempotency and security

The lifecycle owns semantic mutation-key deduplication. An external executor must preserve that key and must not intentionally duplicate an equivalent request. Credentials may not enter strategy state, journals, manifests, logs, fixtures, the repository, or the read-only MCP process.

## Kill switch and mutation limits

`EXECUTOR_ENABLED` defaults to false. Disabled execution fails with `EXECUTION_KILL_SWITCH_ACTIVE`. Existing maximum notional and place, cancel, total, and consecutive-unknown budgets remain authoritative and cannot be overridden by the executor.

## Canary and autonomous gates

`CANARY` permits one live strategy order and one outstanding mutation. Any result or authenticated account-state change produces `CANARY_HALT_FOR_RECONCILIATION`; there is no autonomous second cycle. `AUTONOMOUS` fails closed unless the exact required reconciled-canary evidence hash is supplied.

Acceptance requires pre-mutation persistence, exact payload identity, PostOnly enforcement, authenticated venue identity/order/fill reconciliation, position conservation, no duplicate mutation, handled unknown outcomes, no self-trade, and no unrelated-market contamination.
