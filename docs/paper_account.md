# BTC/USD Paper Account

The event-sourced paper account models BTC/USD perpetual orders, fills, positions, collateral, fees, funding, PnL, and daily filled volume. It has no wallet, key, signing, transaction, submission, or real cancellation capability; paper results are not live-execution results.

The USD 30 starting equity is a deterministic verification reference. Every consumed risk approval and filled position uses exactly 40x leverage on variable allocated margin. The account never creates or resizes a strategy trade itself, permits only one position, and rejects pyramiding and reversal.

Financial fields use eight-decimal scaled integers. Immutable events form a state-hash chain, and transactional projections are checked by replay on restart. Projection or chain inconsistencies fail closed rather than being repaired by guessing.

The USD 10,000 daily figure is a minimum filled-volume objective, not a cap. Unique actual entry and exit fills accumulate beyond the minimum. Tracking cannot approve risk, create orders, change margin, quantity, leverage, or stops, or bypass a pause.

Stop and take-profit observations only create one idempotent, reduce-only paper exit intent. A stop has priority when both trigger together. A trigger is not a fill, and liquidation or maintenance-margin behavior is not modeled.
