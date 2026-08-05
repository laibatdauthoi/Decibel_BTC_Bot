# BTC/USD Risk Policy

Policy `BTC_USD_40X_RISK_V1` is a deterministic, fail-closed research risk engine. It validates and sizes proposed post-only BTC/USD perpetual entries; it cannot build, sign, submit, modify, or cancel an order.

Every approved intent uses exactly 40x leverage on its allocated margin. Risk is controlled only by reducing allocated margin and quantity. USD 30 is the verification reference equity, not a hard-coded account balance. At that equity, allocating all margin gives a theoretical USD 1,200 notional ceiling before stop distance, fees, collateral buffer, exposure, and loss limits reduce the permitted size.

The engine reserves the configured maker entry fee and a conservative emergency taker exit fee. It requires a mandatory, tick-aligned stop, healthy and fresh data, valid normalized market constraints, sufficient collateral, no other position or entry order, and an `ACTIVE` durable risk state. Rejections never fall back to lower leverage.

The USD 10,000 daily filled-volume target is monitoring only. Only unique actual entry and exit fills count; partial fills count their actual quantity. The target cannot increase margin or quantity, change leverage or stops, bypass a pause, or approve a rejected trade. It is not guaranteed and safely reports `TARGET_MISSED` when eligible volume is insufficient.

SQLite audit persistence uses WAL, unique intent and fill IDs, versioned migrations, durable state transitions, and retained UTC daily buckets. Missing or inconsistent persistence fails closed. No credentials, accounts, signatures, or raw exchange payloads are stored.

Financial values use a fixed scale of eight decimal places. Inputs are normalized to the nearest 0.00000001 at the boundary; quantities are subsequently rounded down to the market lot, conservative price rounding follows the market tick, fee and notional multiplication truncates only below the fixed-point scale, and approval comparisons use scaled integers. Fill prices, quantities, notionals, and accumulated daily volume are persisted as base-10 scaled-integer text alongside legacy-readable decimal columns. Schema migration normalizes existing REAL values without deleting historical rows.

Liquidation price and buffer are deliberately `UNAVAILABLE`. Exchange margin-mode integration is also `UNAVAILABLE` until official Decibel semantics are implemented and verified; the internal allocated-margin model does not claim isolated- or cross-margin behavior.
