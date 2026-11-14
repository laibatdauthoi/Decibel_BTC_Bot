# Decibel External Executor Plugin V1

`src/decibel_external_production_executor_v1.ts` implements the frozen
`DECIBEL_PRODUCTION_EXECUTOR_HANDOFF_V1` boundary with the installed Decibel SDK.

The exported `createDecibelProductionExecutorV1` factory is lazy. Importing it or running the core
production dry-run does not load a private key, construct a signer, or call a mutation method. The
first non-dry external invocation requires `DECIBEL_NETWORK=mainnet`, `DECIBEL_PRIVATE_KEY`, and
`DECIBEL_SUBACCOUNT_ADDRESS`. `DECIBEL_NODE_API_KEY` is passed to the SDK when present. Secret
values are never logged or returned.

PLACE calls preserve the lifecycle-provided price, quantity, side, and client order ID and use
`DecibelWriteDex.placeOrder` with `marketName='BTC-USD'`, `TimeInForce.PostOnly`, and
`isReduceOnly=false`. A successful SDK result is acknowledged only when it includes a venue order
ID. An SDK failure, exception, or missing venue identity is conservatively returned as
`PLACE_OUTCOME_UNKNOWN`; the executor never retries.

CANCEL calls only `DecibelWriteDex.cancelOrder` with the intent's exact
`expectedPreviousVenueOrderId`, the frozen BTC/USD market address, and configured subaccount. An
exception is returned as `CANCEL_OUTCOME_UNKNOWN`; the executor never falls back to cancel-all,
cancel-by-price, or client-order cancellation.

The core lifecycle remains responsible for preflight, durable intent persistence, idempotency,
mutation budgets, kill-switch and release gates, authenticated reconciliation, fills, inventory,
and strategy maker-volume accounting.
