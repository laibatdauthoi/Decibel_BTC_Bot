# Documentation

| Document                                                                               | What it covers                                                                                    |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [decibel_strategy_v1.md](decibel_strategy_v1.md)                                       | The single strategy specification: entry, TP, DCA, risk, catastrophe stop, session end, dashboard |
| [decibel_wallet_setup_v1.md](decibel_wallet_setup_v1.md)                               | Petra connection, whitelist, bot key, subaccount switch, gas, dashboard sign-in                   |
| [decibel_venue_capability_probe_plan_v1.md](decibel_venue_capability_probe_plan_v1.md) | Venue capability probe (Stage D results behind the catastrophe stop)                              |
| [../PROJECT_HANDOVER_2026_11_12.md](../PROJECT_HANDOVER_2026_11_12.md)                 | Current state, formulas, risks and history                                                        |

Strategy parameters live in `src/decibel_strategy_policy_v1.ts`; change a value there and update
the strategy specification in the same commit.

Earlier audits, incident reports and proposals were removed on 2026-11-17 and remain in git
history. When an old document disagrees with the code or the strategy specification, the code
and the specification win.
