export type decibel_entry_cycle_fill_v1 = Readonly<{
  fillId: string;
  intentId: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  timestamp: number;
}>;

/**
 * Replays the session's authenticated strategy fills and checks them against the
 * authenticated position. Any blocker freezes new ENTRY admission until the fill
 * history reconciles; it never grants permission by itself.
 */
export function deriveDecibelEntryCycleV1(
  fills: readonly decibel_entry_cycle_fill_v1[],
  positionBase: number,
): Readonly<{ blocker: string | null }> {
  let inventory = 0;
  let blocker: string | null = null;
  const seen = new Set<string>();
  const timestampSides = new Map<number, 'BUY' | 'SELL'>();
  let ambiguousSequence = false;
  for (const fill of fills) {
    if (seen.has(fill.fillId)) continue;
    seen.add(fill.fillId);
    if (
      ![fill.quantity, fill.price].every((v) => Number.isFinite(v) && v > 0) ||
      !Number.isSafeInteger(fill.timestamp) ||
      !fill.intentId
    ) {
      blocker = 'ENTRY_CYCLE_FILL_EVIDENCE_INVALID';
      break;
    }
    const previousSide = timestampSides.get(fill.timestamp);
    if (previousSide && previousSide !== fill.side) ambiguousSequence = true;
    timestampSides.set(fill.timestamp, fill.side);
    const previous = inventory;
    inventory = Number(
      (inventory + (fill.side === 'BUY' ? fill.quantity : -fill.quantity)).toFixed(8),
    );
    if (previous !== 0 && inventory !== 0 && Math.sign(previous) !== Math.sign(inventory)) {
      blocker = 'ENTRY_CYCLE_DIRECTION_REVERSAL_RECONCILIATION_REQUIRED';
      break;
    }
  }
  if (!Number.isFinite(positionBase) || Math.abs(inventory - positionBase) > 1e-8)
    blocker ??= 'ENTRY_CYCLE_FILL_HISTORY_RECONCILIATION_REQUIRED';
  if (ambiguousSequence && inventory !== 0)
    blocker ??= 'ENTRY_CYCLE_FILL_SEQUENCE_EVIDENCE_REQUIRED';
  return Object.freeze({ blocker });
}
