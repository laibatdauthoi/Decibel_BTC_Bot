/**
 * Gas reserve for protection (2026-11-14). Live: a 0.1995 APT gas wallet fell below the
 * 0.2 APT that Aptos required for the old 200,000 gas cap; the bot had just opened a
 * position and could then submit neither the cancel, the TP nor the catastrophe stop.
 *
 * New opening orders (entries and DCA additions) are refused while the gas wallet holds
 * less than the reserve, so an open position always keeps enough gas for its cancel, TP,
 * repricing and unwind. Exits are never blocked by this gate.
 */
/** Max gas units per transaction (DECIBEL_PRODUCTION_MAX_GAS_AMOUNT_V1) x 100 octas (the
 * Aptos minimum gas unit price) = 0.02 APT per submission; keep room for five. */
export const DECIBEL_GAS_ENTRY_RESERVE_APT_V1 = 0.1;
/** How often the orchestrator re-reads the gas wallet balance. */
export const DECIBEL_GAS_BALANCE_REFRESH_MS_V1 = 60_000;

export function getDecibelGasEntryBlockerV1(balanceApt: number | null | undefined): string | null {
  return typeof balanceApt === 'number' &&
    Number.isFinite(balanceApt) &&
    balanceApt < DECIBEL_GAS_ENTRY_RESERVE_APT_V1
    ? 'ENTRY_GAS_BALANCE_LOW'
    : null;
}
