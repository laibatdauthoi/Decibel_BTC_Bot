# BTC/USD Paper Order Manager

The exchange-agnostic V1 order manager accepts only persisted, approved risk decisions and preserves their market, price, stop, quantity, variable allocated margin, and exact 40x leverage. Entry instructions are post-only maker attempts. They are never automatically repriced or converted to taker orders.

State transitions, adapter acknowledgements, exact fixed-point fills, consumed approvals, and reconciliation records are durable and audited. Submission and cancellation commands use a transactional SQLite outbox with stable command and client-order identifiers. An uncertain request enters `RECONCILIATION_REQUIRED`; it is never treated as successful and never blindly resubmitted as a new logical order.

The only adapter is deterministic paper execution over point-in-time evidence. `STRICT_TRADE_THROUGH` and `TOUCH_WITH_FLOW` use the existing conservative research semantics. Level-1 flow is a proxy, not queue-position evidence. REST bootstrap, ambiguous, unknown-direction, and future evidence are ineligible.

Stops create one reduce-only exit instruction and do not guarantee an execution price. Protective exits remain available while new entries are paused. The USD 10,000 daily filled-volume value is an uncapped minimum objective and cannot alter orders or override risk.

This module has no wallet, key access, signing, Decibel transaction construction, live submission, live cancellation, or exported live execution adapter.
